//! Spracheingabe: Whisper (whisper.cpp) läuft lokal im Programm – ohne Internet.
//! Das Sprachmodell wird einmalig von Hugging Face in den Datenordner geladen.
//! Neu (Test): Parakeet TDT v3 über sherpa-onnx – deutlich schneller auf dem Prozessor, auch ohne Grafikkarte.

use std::path::PathBuf;
use std::sync::Mutex;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::ipc::{Channel, InvokeBody, Request};
use tauri::Manager;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Bekannte Modelle (Dateiname bei Hugging Face, ggerganov/whisper.cpp)
const MODELLE: &[&str] = &["ggml-base.bin", "ggml-small.bin", "ggml-large-v3-turbo-q5_0.bin", PARAKEET];

/// Parakeet TDT 0.6B v3 (int8, mehrsprachig mit Deutsch) – Paket von sherpa-onnx, entpackt in einen eigenen Ordner
const PARAKEET: &str = "parakeet-tdt-0.6b-v3";
const PARAKEET_PAKET: &str = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8";

/// geladene Parakeet-Erkennung (bleibt im Speicher)
static PARAKEET_REC: Mutex<Option<sherpa_rs::transducer::TransducerRecognizer>> = Mutex::new(None);

fn parakeet_da(dir: &std::path::Path) -> bool {
    let d = dir.join(PARAKEET_PAKET);
    ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"].iter().all(|f| d.join(f).is_file())
}

fn modell_da(dir: &std::path::Path, name: &str) -> bool {
    if name == PARAKEET {
        parakeet_da(dir)
    } else {
        dir.join(name).is_file()
    }
}

fn parakeet_laden(dir: &std::path::Path) -> Result<(), String> {
    let mut g = PARAKEET_REC.lock().map_err(|_| "Spracherkennung ist blockiert".to_string())?;
    if g.is_some() {
        return Ok(());
    }
    if !parakeet_da(dir) {
        return Err("Sprachmodell ist noch nicht geladen (Einstellungen → Persönlich → Sprache)".into());
    }
    let d = dir.join(PARAKEET_PAKET);
    let s = |f: &str| d.join(f).to_string_lossy().into_owned();
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 8) as i32;
    let cfg = sherpa_rs::transducer::TransducerConfig {
        encoder: s("encoder.int8.onnx"),
        decoder: s("decoder.int8.onnx"),
        joiner: s("joiner.int8.onnx"),
        tokens: s("tokens.txt"),
        num_threads: threads,
        sample_rate: 16_000,
        feature_dim: 80,
        model_type: "nemo_transducer".to_string(),
        decoding_method: "greedy_search".to_string(),
        ..Default::default()
    };
    let r = sherpa_rs::transducer::TransducerRecognizer::new(cfg).map_err(|e| format!("Sprachmodell lässt sich nicht laden: {e}"))?;
    *g = Some(r);
    Ok(())
}

fn parakeet_erkennen(dir: PathBuf, audio: Vec<f32>) -> Result<String, String> {
    parakeet_laden(&dir)?;
    let mut g = PARAKEET_REC.lock().map_err(|_| "Spracherkennung ist blockiert".to_string())?;
    let r = g.as_mut().ok_or("Sprachmodell fehlt")?;
    // kurze Stille davor und danach hilft dem Modell beim ersten und letzten Wort
    let mut a = vec![0f32; 4800];
    a.extend_from_slice(&audio);
    a.extend(std::iter::repeat(0f32).take(4800));
    Ok(r.transcribe(16_000, &a).trim().to_string())
}

/// Sprachmodell schon vor dem ersten Sprechen in den Speicher holen (sonst dauert die erste Erkennung länger)
#[tauri::command]
pub async fn sprache_vorladen(app: tauri::AppHandle, name: String) -> Result<(), String> {
    pruefe_name(&name)?;
    let dir = modell_ordner(&app)?;
    if !modell_da(&dir, &name) {
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        if name == PARAKEET {
            return parakeet_laden(&dir);
        }
        let mut k = KONTEXT.lock().map_err(|_| "Spracherkennung ist blockiert".to_string())?;
        if k.as_ref().map(|(n, _)| n != &name).unwrap_or(true) {
            let pfad = dir.join(&name);
            let ctx = WhisperContext::new_with_params(pfad.to_str().ok_or("Ungültiger Pfad")?, WhisperContextParameters::default())
                .map_err(|e| format!("Sprachmodell lässt sich nicht laden: {e:?}"))?;
            *k = Some((name, ctx));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// geladenes Modell (Dateiname, Kontext) – bleibt im Speicher, damit die Erkennung schnell startet
static KONTEXT: Mutex<Option<(String, WhisperContext)>> = Mutex::new(None);

fn modell_ordner(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Datenordner nicht gefunden: {e}"))?
        .join("sprache");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Datenordner nicht anlegbar: {e}"))?;
    Ok(dir)
}

fn pruefe_name(name: &str) -> Result<(), String> {
    if MODELLE.contains(&name) {
        Ok(())
    } else {
        Err(format!("Unbekanntes Sprachmodell: {name}"))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpracheStatus {
    /// vorhandene Modelle (Dateinamen)
    modelle: Vec<String>,
    ordner: String,
}

#[tauri::command]
pub fn sprache_status(app: tauri::AppHandle) -> Result<SpracheStatus, String> {
    let dir = modell_ordner(&app)?;
    let modelle = MODELLE
        .iter()
        .filter(|m| modell_da(&dir, m))
        .map(|m| m.to_string())
        .collect();
    Ok(SpracheStatus { modelle, ordner: dir.to_string_lossy().into_owned() })
}

#[derive(Serialize, Clone)]
pub struct SpracheFortschritt {
    done: u64,
    total: u64,
}

/// Lädt ein Sprachmodell herunter (erst als .teil-Datei, am Ende umbenannt).
#[tauri::command]
pub async fn sprache_modell_laden(app: tauri::AppHandle, name: String, on_progress: Channel<SpracheFortschritt>) -> Result<(), String> {
    use std::io::Write;
    pruefe_name(&name)?;
    let dir = modell_ordner(&app)?;
    let ziel = dir.join(&name);
    let teil = dir.join(format!("{name}.teil"));
    let url = if name == PARAKEET {
        format!("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{PARAKEET_PAKET}.tar.bz2")
    } else {
        format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{name}")
    };
    let client = reqwest::Client::builder()
        .user_agent(concat!("LeitWerk/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let r = client.get(&url).send().await.map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("Download fehlgeschlagen (HTTP {})", r.status().as_u16()));
    }
    let total = r.content_length().unwrap_or(0);
    let mut f = std::fs::File::create(&teil).map_err(|e| e.to_string())?;
    let mut done = 0u64;
    let mut last = 0u64;
    let mut s = r.bytes_stream();
    while let Some(chunk) = s.next().await {
        let chunk = chunk.map_err(|e| format!("Download abgebrochen: {e}"))?;
        f.write_all(&chunk).map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        if done - last > 2_000_000 || done == total {
            last = done;
            let _ = on_progress.send(SpracheFortschritt { done, total });
        }
    }
    drop(f);
    if total > 0 && done != total {
        let _ = std::fs::remove_file(&teil);
        return Err("Download unvollständig – bitte nochmal versuchen".into());
    }
    if name == PARAKEET {
        // Paket entpacken (eigener Ordner im Sprach-Ordner)
        let d2 = dir.clone();
        let t2 = teil.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let f = std::fs::File::open(&t2).map_err(|e| e.to_string())?;
            let mut a = tar::Archive::new(bzip2::read::BzDecoder::new(std::io::BufReader::new(f)));
            a.unpack(&d2).map_err(|e| format!("Entpacken fehlgeschlagen: {e}"))?;
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;
        let _ = std::fs::remove_file(&teil);
        if !parakeet_da(&dir) {
            return Err("Sprachmodell-Paket ist unvollständig".into());
        }
        return Ok(());
    }
    std::fs::rename(&teil, &ziel).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn sprache_modell_loeschen(app: tauri::AppHandle, name: String) -> Result<(), String> {
    pruefe_name(&name)?;
    let dir = modell_ordner(&app)?;
    if let Ok(mut k) = KONTEXT.lock() {
        if k.as_ref().map(|(n, _)| n == &name).unwrap_or(false) {
            *k = None;
        }
    }
    if name == PARAKEET {
        if let Ok(mut g) = PARAKEET_REC.lock() {
            *g = None;
        }
        let d = dir.join(PARAKEET_PAKET);
        if d.exists() {
            std::fs::remove_dir_all(d).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let p = dir.join(&name);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn erkennen_blockierend(pfad: PathBuf, name: String, audio: Vec<f32>, hinweis: String) -> Result<String, String> {
    if name == PARAKEET {
        let dir = pfad.parent().map(|p| p.to_path_buf()).ok_or("Ungültiger Pfad")?;
        return parakeet_erkennen(dir, audio);
    }
    let mut k = KONTEXT.lock().map_err(|_| "Spracherkennung ist blockiert".to_string())?;
    if k.as_ref().map(|(n, _)| n != &name).unwrap_or(true) {
        *k = None;
        let pfad_str = pfad.to_str().ok_or("Ungültiger Pfad")?;
        let ctx = WhisperContext::new_with_params(pfad_str, WhisperContextParameters::default())
            .map_err(|e| format!("Sprachmodell lässt sich nicht laden: {e:?}"))?;
        *k = Some((name.clone(), ctx));
    }
    let (_, ctx) = k.as_ref().ok_or("Sprachmodell fehlt")?;
    let mut state = ctx.create_state().map_err(|e| format!("Spracherkennung startet nicht: {e:?}"))?;
    let mut p = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 8) as i32;
    p.set_n_threads(threads);
    p.set_language(Some("de"));
    p.set_translate(false);
    p.set_no_context(true);
    p.set_suppress_blank(true);
    p.set_print_special(false);
    p.set_print_progress(false);
    p.set_print_realtime(false);
    p.set_print_timestamps(false);
    if !hinweis.is_empty() {
        p.set_initial_prompt(&hinweis);
    }
    state.full(p, &audio).map_err(|e| format!("Spracherkennung fehlgeschlagen: {e:?}"))?;
    let n = state.full_n_segments().map_err(|e| format!("{e:?}"))?;
    let mut text = String::new();
    for i in 0..n {
        if let Ok(t) = state.full_get_segment_text(i) {
            text.push_str(&t);
        }
    }
    Ok(text.trim().to_string())
}

/// Erkennt gesprochenen Text. Rohdaten: 16 kHz Mono, f32 little-endian.
/// Kopfzeilen: x-modell (Dateiname), x-hinweis (Fachbegriffe/Ortsnamen, URL-kodiert)
#[tauri::command]
pub async fn sprache_erkennen(app: tauri::AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(daten) = request.body() else {
        return Err("Keine Audiodaten".into());
    };
    let kopf = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let name = kopf("x-modell").unwrap_or_else(|| MODELLE[2].to_string());
    pruefe_name(&name)?;
    let hinweis = kopf("x-hinweis").map(|h| url_dekodieren(&h)).unwrap_or_default();
    let pfad = modell_ordner(&app)?.join(&name);
    if !modell_da(&modell_ordner(&app)?, &name) {
        return Err("Sprachmodell ist noch nicht geladen (Einstellungen → Persönlich → Sprache)".into());
    }
    let audio: Vec<f32> = daten.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
    if audio.len() < 1600 {
        return Ok(String::new());
    }
    tauri::async_runtime::spawn_blocking(move || erkennen_blockierend(pfad, name, audio, hinweis))
        .await
        .map_err(|e| e.to_string())?
}

/// einfache %XX-Dekodierung (Kopfzeilen dürfen keine Umlaute enthalten)
pub fn url_dekodieren(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ------------------------------------------------------------ Aufnahme (Mikrofon direkt im Programm)
//
// Das Fenster (WebView) darf auf dem Mac das Mikrofon nicht öffnen – deshalb nimmt das Programm
// selbst auf (CoreAudio bzw. WASAPI über cpal) und gibt nur den erkannten Text zurück.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Sample;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

struct Aufnahme {
    stopp: std::sync::mpsc::Sender<()>,
    faden: std::thread::JoinHandle<()>,
    daten: Arc<Mutex<Vec<f32>>>,
    rate: u32,
}

static AUFNAHME: Mutex<Option<Aufnahme>> = Mutex::new(None);
static PEGEL: AtomicU32 = AtomicU32::new(0);

fn eingabe_geraet(name: &Option<String>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if let Some(n) = name.as_ref().filter(|n| !n.is_empty()) {
        // Ist das gewählte Mikrofon das Standardgerät, dieses nehmen: cpal 0.15 hält per Name gewählte
        // Geräte unter macOS sonst nach dem Schließen offen (oranges Mikrofon-Symbol bleibt)
        if let Some(d) = host.default_input_device().filter(|d| d.name().map(|x| &x == n).unwrap_or(false)) {
            return Ok(d);
        }
        if let Ok(mut it) = host.input_devices() {
            if let Some(d) = it.find(|d| d.name().map(|x| &x == n).unwrap_or(false)) {
                return Ok(d);
            }
        }
    }
    host.default_input_device().ok_or_else(|| "Kein Mikrofon gefunden".to_string())
}

fn strom_bauen<T>(dev: &cpal::Device, cfg: &cpal::StreamConfig, daten: Arc<Mutex<Vec<f32>>>) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    let kanaele = (cfg.channels as usize).max(1);
    dev.build_input_stream(
        cfg,
        move |d: &[T], _: &cpal::InputCallbackInfo| {
            let mut q = 0f32;
            let mut n = 0u32;
            if let Ok(mut v) = daten.lock() {
                for fr in d.chunks(kanaele) {
                    let s = fr.iter().map(|x| x.to_sample::<f32>()).sum::<f32>() / fr.len() as f32;
                    v.push(s);
                    q += s * s;
                    n += 1;
                }
            }
            if n > 0 {
                PEGEL.store(((q / n as f32).sqrt() * 10000.0) as u32, Ordering::Relaxed);
            }
        },
        |e| eprintln!("Mikrofon: {e}"),
        None,
    )
    .map_err(|e| format!("Mikrofon lässt sich nicht öffnen: {e}"))
}

/// Namen der Mikrofone
#[tauri::command]
pub fn sprache_mikrofone() -> Vec<String> {
    cpal::default_host()
        .input_devices()
        .map(|it| it.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}

// ------------------------------------------------------------ Sprechfunk: Sprache in Stücken (8 kHz, μ-law, Base64)
//
// Gleiches Format wie im Fenster (src/ui/funkCodec.ts): alle 100 ms ein Stück, das über den Relay an alle geht.

struct FunkKodierer {
    schritt: f64,
    pos: f64,
    rest: Vec<f32>,
    puffer: Vec<u8>,
}

impl FunkKodierer {
    fn neu(rate: u32) -> Self {
        FunkKodierer { schritt: rate as f64 / 8000.0, pos: 0.0, rest: Vec::new(), puffer: Vec::with_capacity(800) }
    }

    /// neue Samples; zurück kommen fertige Stücke (je 100 ms)
    fn daten(&mut self, d: &[f32]) -> Vec<String> {
        let mut alle = std::mem::take(&mut self.rest);
        alle.extend_from_slice(d);
        let halb = (self.schritt / 2.0).max(0.5);
        let mut p = self.pos;
        let mut out = Vec::new();
        while p + halb < alle.len() as f64 {
            let a = (p - halb + 0.5).floor().max(0.0) as usize;
            let b = ((p + halb).ceil() as usize).min(alle.len()).max(a + 1).min(alle.len());
            let n = b.saturating_sub(a).max(1);
            let s: f32 = alle[a.min(b)..b].iter().sum();
            self.puffer.push(ulaw(s / n as f32));
            if self.puffer.len() == 800 {
                out.push(base64(&self.puffer));
                self.puffer.clear();
            }
            p += self.schritt;
        }
        let ab = ((p - halb).floor().max(0.0) as usize).min(alle.len());
        self.rest = alle[ab..].to_vec();
        self.pos = p - ab as f64;
        out
    }

    fn ende(&mut self) -> Option<String> {
        if self.puffer.is_empty() {
            return None;
        }
        let s = base64(&self.puffer);
        self.puffer.clear();
        Some(s)
    }
}

/// Cloud-Anrufer: Sprache als 16 kHz, 16 Bit (little-endian), in Stücken zu 100 ms (Base64)
struct Pcm16Kodierer {
    schritt: f64,
    pos: f64,
    rest: Vec<f32>,
    puffer: Vec<u8>,
}

impl Pcm16Kodierer {
    fn neu(rate: u32) -> Self {
        Pcm16Kodierer { schritt: rate as f64 / 16000.0, pos: 0.0, rest: Vec::new(), puffer: Vec::with_capacity(3200) }
    }

    fn daten(&mut self, d: &[f32]) -> Vec<String> {
        let mut alle = std::mem::take(&mut self.rest);
        alle.extend_from_slice(d);
        let halb = (self.schritt / 2.0).max(0.5);
        let mut p = self.pos;
        let mut out = Vec::new();
        while p + halb < alle.len() as f64 {
            let a = (p - halb + 0.5).floor().max(0.0) as usize;
            let b = ((p + halb).ceil() as usize).min(alle.len()).max(a + 1).min(alle.len());
            let n = b.saturating_sub(a).max(1);
            let s: f32 = alle[a.min(b)..b].iter().sum();
            let v = ((s / n as f32).clamp(-1.0, 1.0) * 32767.0) as i16;
            self.puffer.extend_from_slice(&v.to_le_bytes());
            if self.puffer.len() == 3200 {
                out.push(base64(&self.puffer));
                self.puffer.clear();
            }
            p += self.schritt;
        }
        let ab = ((p - halb).floor().max(0.0) as usize).min(alle.len());
        self.rest = alle[ab..].to_vec();
        self.pos = p - ab as f64;
        out
    }

    fn ende(&mut self) -> Option<String> {
        if self.puffer.is_empty() {
            return None;
        }
        let s = base64(&self.puffer);
        self.puffer.clear();
        Some(s)
    }
}

enum Kodierer {
    Funk(FunkKodierer),
    Pcm(Pcm16Kodierer),
}

impl Kodierer {
    fn daten(&mut self, d: &[f32]) -> Vec<String> {
        match self {
            Kodierer::Funk(k) => k.daten(d),
            Kodierer::Pcm(k) => k.daten(d),
        }
    }
    fn ende(&mut self) -> Option<String> {
        match self {
            Kodierer::Funk(k) => k.ende(),
            Kodierer::Pcm(k) => k.ende(),
        }
    }
}

fn ulaw(x: f32) -> u8 {
    const BIAS: i32 = 0x84;
    let mut s = (x.clamp(-1.0, 1.0) * 32767.0) as i32;
    let sign = if s < 0 { 0x80 } else { 0 };
    if s < 0 {
        s = -s;
    }
    s = s.min(32635) + BIAS;
    let mut exp = 7;
    let mut mask = 0x4000;
    while (s & mask) == 0 && exp > 0 {
        exp -= 1;
        mask >>= 1;
    }
    let mant = (s >> (exp + 3)) & 0x0f;
    (!(sign | (exp << 4) | mant) & 0xff) as u8
}

fn base64(b: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((b.len() + 2) / 3 * 4);
    for c in b.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

/// Aufnahme starten (läuft, bis sprache_aufnahme_stopp kommt)
#[tauri::command]
pub fn sprache_aufnahme_start(mikro: Option<String>) -> Result<(), String> {
    aufnahme_starten(mikro, None, false)
}

/// Cloud-Anrufer: die Sprache geht laufend als 16-kHz-Stücke an das Fenster (und von dort an die Cloud)
#[tauri::command]
pub fn live_aufnahme_start(mikro: Option<String>, kanal: tauri::ipc::Channel<String>) -> Result<(), String> {
    aufnahme_starten(mikro, Some(kanal), true)
}

/// Sprechfunk: wie sprache_aufnahme_start, die Sprache geht zusätzlich laufend in Stücken an das Fenster
#[tauri::command]
pub fn funk_aufnahme_start(mikro: Option<String>, funk: tauri::ipc::Channel<String>) -> Result<(), String> {
    aufnahme_starten(mikro, Some(funk), false)
}

fn aufnahme_starten(mikro: Option<String>, funk: Option<tauri::ipc::Channel<String>>, pcm16: bool) -> Result<(), String> {
    let mut a = AUFNAHME.lock().map_err(|_| "Aufnahme blockiert".to_string())?;
    if let Some(alt) = a.take() {
        let _ = alt.stopp.send(());
        let _ = alt.faden.join();
    }
    PEGEL.store(0, Ordering::Relaxed);
    let daten = Arc::new(Mutex::new(Vec::<f32>::with_capacity(48_000 * 20)));
    let (stopp_tx, stopp_rx) = std::sync::mpsc::channel::<()>();
    let (bereit_tx, bereit_rx) = std::sync::mpsc::channel::<Result<u32, String>>();
    let d2 = daten.clone();
    let d3 = daten.clone();
    // der Audiostrom darf den Faden nicht wechseln (macOS) – eigener Faden bis zum Stopp
    let faden = std::thread::spawn(move || {
        let start = || -> Result<(cpal::Stream, u32), String> {
            let dev = eingabe_geraet(&mikro)?;
            let sc = dev.default_input_config().map_err(|e| format!("Mikrofon: {e}"))?;
            let rate = sc.sample_rate().0;
            let fmt = sc.sample_format();
            let cfg: cpal::StreamConfig = sc.into();
            let s = match fmt {
                cpal::SampleFormat::F32 => strom_bauen::<f32>(&dev, &cfg, d2),
                cpal::SampleFormat::I16 => strom_bauen::<i16>(&dev, &cfg, d2),
                cpal::SampleFormat::U16 => strom_bauen::<u16>(&dev, &cfg, d2),
                cpal::SampleFormat::I32 => strom_bauen::<i32>(&dev, &cfg, d2),
                cpal::SampleFormat::U8 => strom_bauen::<u8>(&dev, &cfg, d2),
                f => Err(format!("Mikrofon-Format wird nicht unterstützt: {f:?}")),
            }?;
            s.play().map_err(|e| format!("Mikrofon startet nicht: {e}"))?;
            Ok((s, rate))
        };
        match start() {
            Ok((strom, rate)) => {
                let _ = bereit_tx.send(Ok(rate));
                match funk {
                    Some(kanal) => {
                        // Sprechfunk: alle 100 ms die neuen Samples als Stücke schicken
                        let mut kod = if pcm16 { Kodierer::Pcm(Pcm16Kodierer::neu(rate)) } else { Kodierer::Funk(FunkKodierer::neu(rate)) };
                        let mut ab = 0usize;
                        // Freisprechen mit dem Cloud-Anrufer läuft so lange wie der Anruf (höchstens eine Stunde)
                        let schluss = std::time::Instant::now() + std::time::Duration::from_secs(if pcm16 { 3600 } else { 120 });
                        loop {
                            let fertig = match stopp_rx.recv_timeout(std::time::Duration::from_millis(100)) {
                                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => std::time::Instant::now() >= schluss,
                                _ => true,
                            };
                            let neu: Vec<f32> = match d3.lock() {
                                Ok(v) => {
                                    let x = v[ab.min(v.len())..].to_vec();
                                    ab = v.len();
                                    x
                                }
                                Err(_) => Vec::new(),
                            };
                            for st in kod.daten(&neu) {
                                let _ = kanal.send(st);
                            }
                            if fertig {
                                if let Some(st) = kod.ende() {
                                    let _ = kanal.send(st);
                                }
                                break;
                            }
                        }
                    }
                    None => {
                        let _ = stopp_rx.recv_timeout(std::time::Duration::from_secs(120));
                    }
                }
                // erst anhalten, dann freigeben: so geht das Mikrofon sicher zu (auch wenn cpal den Strom festhält)
                let _ = strom.pause();
                drop(strom);
            }
            Err(e) => {
                let _ = bereit_tx.send(Err(e));
            }
        }
    });
    let rate = bereit_rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "Mikrofon antwortet nicht".to_string())??;
    *a = Some(Aufnahme { stopp: stopp_tx, faden, daten, rate });
    Ok(())
}

/// Läuft gerade eine Aufnahme (Mikrofon offen)? Für die Sicherung im Fenster: niemand nimmt auf → schließen
#[tauri::command]
pub fn sprache_aufnahme_laeuft() -> bool {
    AUFNAHME.lock().map(|a| a.is_some()).unwrap_or(false)
}

/// Mikrofon schließen, ohne etwas zu erkennen (Sicherung: eine Aufnahme ist offen geblieben)
#[tauri::command]
pub fn sprache_aufnahme_abbrechen() {
    let a = AUFNAHME.lock().ok().and_then(|mut a| a.take());
    if let Some(a) = a {
        let _ = a.stopp.send(());
        let _ = a.faden.join();
    }
}

/// aktueller Pegel 0–1 (für die Anzeige)
#[tauri::command]
pub fn sprache_pegel() -> f32 {
    PEGEL.load(Ordering::Relaxed) as f32 / 10000.0
}

#[derive(Serialize)]
pub struct Erkannt {
    text: String,
    sekunden: f32,
    pegel: f32,
}

fn auf_16k(d: &[f32], rate: u32) -> Vec<f32> {
    if rate == 16000 || d.is_empty() {
        return d.to_vec();
    }
    let f = rate as f64 / 16000.0;
    let n = (d.len() as f64 / f) as usize;
    (0..n)
        .map(|i| {
            let x = i as f64 * f;
            let a = x.floor() as usize;
            let b = (a + 1).min(d.len() - 1);
            let t = (x - a as f64) as f32;
            d[a] + (d[b] - d[a]) * t
        })
        .collect()
}

/// Aufnahme beenden und erkennen (modell leer = nur beenden)
#[tauri::command]
pub async fn sprache_aufnahme_stopp(app: tauri::AppHandle, modell: String, hinweis: String) -> Result<Erkannt, String> {
    // kurz nachlaufen lassen, damit das letzte Wort nicht abgeschnitten wird
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    let a = AUFNAHME.lock().map_err(|_| "Aufnahme blockiert".to_string())?.take();
    let Some(a) = a else { return Err("Es läuft keine Aufnahme".into()) };
    let _ = a.stopp.send(());
    let _ = a.faden.join();
    let roh = std::mem::take(&mut *a.daten.lock().map_err(|_| "Aufnahme blockiert".to_string())?);
    let audio = auf_16k(&roh, a.rate);
    let sekunden = audio.len() as f32 / 16000.0;
    let pegel = if audio.is_empty() { 0.0 } else { (audio.iter().map(|x| x * x).sum::<f32>() / audio.len() as f32).sqrt() };
    if modell.is_empty() || sekunden < 0.3 || pegel < 0.003 {
        return Ok(Erkannt { text: String::new(), sekunden, pegel });
    }
    pruefe_name(&modell)?;
    let pfad = modell_ordner(&app)?.join(&modell);
    if !modell_da(&modell_ordner(&app)?, &modell) {
        return Err("Sprachmodell ist noch nicht geladen (Einstellungen → Persönlich → Sprache)".into());
    }
    let text = tauri::async_runtime::spawn_blocking(move || erkennen_blockierend(pfad, modell, audio, hinweis))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Erkannt { text, sekunden, pegel })
}

#[cfg(test)]
mod funk_tests {
    use super::*;

    #[test]
    fn ulaw_wie_im_fenster() {
        // gleiche Werte wie funkCodec.ts (Stille, Maximum, Minimum)
        assert_eq!(ulaw(0.0), 0xff);
        assert_eq!(ulaw(1.0), 0x80);
        assert_eq!(ulaw(-1.0), 0x00);
    }

    #[test]
    fn base64_richtig() {
        assert_eq!(base64(b"Man"), "TWFu");
        assert_eq!(base64(b"Ma"), "TWE=");
        assert_eq!(base64(b"M"), "TQ==");
    }

    #[test]
    fn pcm16_stuecke_100ms() {
        let mut k = Pcm16Kodierer::neu(48000);
        let mut n = 0;
        for _ in 0..10 {
            n += k.daten(&vec![0.1f32; 4800]).len();
        }
        let rest = k.ende().map(|_| 1).unwrap_or(0);
        assert!(n + rest >= 10 && n + rest <= 11, "{n} + {rest}");
    }

    #[test]
    fn stuecke_100ms() {
        let mut k = FunkKodierer::neu(48000);
        let mut n = 0;
        for _ in 0..10 {
            n += k.daten(&vec![0.1f32; 4800]).len();
        }
        // 1 Sekunde bei 48 kHz = 10 Stücke à 800 Byte (das letzte evtl. erst mit ende())
        let rest = k.ende().map(|_| 1).unwrap_or(0);
        assert!(n + rest >= 10 && n + rest <= 11, "{n} + {rest}");
    }
}
