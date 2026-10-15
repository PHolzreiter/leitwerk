//! Spracheingabe: Whisper (whisper.cpp) läuft lokal im Programm – ohne Internet.
//! Das Sprachmodell wird einmalig von Hugging Face in den Datenordner geladen.

use std::path::PathBuf;
use std::sync::Mutex;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::ipc::{Channel, InvokeBody, Request};
use tauri::Manager;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Bekannte Modelle (Dateiname bei Hugging Face, ggerganov/whisper.cpp)
const MODELLE: &[&str] = &["ggml-base.bin", "ggml-small.bin", "ggml-large-v3-turbo-q5_0.bin"];

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
        .filter(|m| dir.join(m).is_file())
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
    let url = format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{name}");
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
    let p = dir.join(&name);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn erkennen_blockierend(pfad: PathBuf, name: String, audio: Vec<f32>, hinweis: String) -> Result<String, String> {
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
    if !pfad.is_file() {
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

/// Aufnahme starten (läuft, bis sprache_aufnahme_stopp kommt)
#[tauri::command]
pub fn sprache_aufnahme_start(mikro: Option<String>) -> Result<(), String> {
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
                let _ = stopp_rx.recv_timeout(std::time::Duration::from_secs(120));
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
    if !pfad.is_file() {
        return Err("Sprachmodell ist noch nicht geladen (Einstellungen → Persönlich → Sprache)".into());
    }
    let text = tauri::async_runtime::spawn_blocking(move || erkennen_blockierend(pfad, modell, audio, hinweis))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Erkannt { text, sekunden, pegel })
}
