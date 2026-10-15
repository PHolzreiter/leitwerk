//! Supertonic 3 (Supertone, OpenRAIL-M): natürliche Stimmen, auch Deutsch, läuft auf der CPU.
//! Nach dem Rust-Beispiel aus github.com/supertone-oss-archive/supertonic (MIT).
//! ONNX Runtime wird zur Laufzeit geladen (eigene Bibliothek im Datenordner), damit sie sich nicht
//! mit der fest eingebauten ONNX Runtime von sherpa-onnx (Piper) in die Quere kommt.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::{Channel, Response};
use tauri::Manager;
use unicode_normalization::UnicodeNormalization;

use ort::session::Session;
use ort::value::Tensor;

/// fest auf den archivierten Stand
const REVISION: &str = "aafc6e32416a594460b32413efc49d7fe4ce6d46";
const MODELL_DATEIEN: &[&str] = &[
    "onnx/duration_predictor.onnx",
    "onnx/text_encoder.onnx",
    "onnx/vector_estimator.onnx",
    "onnx/vocoder.onnx",
    "onnx/tts.json",
    "onnx/unicode_indexer.json",
];
pub const STIMMEN: &[&str] = &["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"];

const ORT_VERSION: &str = "1.22.0";

fn ordner(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Datenordner nicht gefunden: {e}"))?
        .join("supertonic");
    std::fs::create_dir_all(dir.join("onnx")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dir.join("voice_styles")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dir.join("laufzeit")).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn laufzeit_datei(dir: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        dir.join("laufzeit").join("onnxruntime.dll")
    }
    #[cfg(target_os = "macos")]
    {
        dir.join("laufzeit").join("libonnxruntime.dylib")
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        dir.join("laufzeit").join("libonnxruntime.so")
    }
}

fn vollstaendig(dir: &Path) -> bool {
    laufzeit_datei(dir).is_file()
        && MODELL_DATEIEN.iter().all(|f| dir.join(f).is_file())
        && STIMMEN.iter().all(|s| dir.join(format!("voice_styles/{s}.json")).is_file())
}

#[derive(Serialize)]
pub struct SupertonicStatus {
    geladen: bool,
}

#[tauri::command]
pub fn supertonic_status(app: tauri::AppHandle) -> Result<SupertonicStatus, String> {
    Ok(SupertonicStatus { geladen: vollstaendig(&ordner(&app)?) })
}

#[derive(Serialize, Clone)]
pub struct Fortschritt {
    text: String,
    done: u64,
    total: u64,
}

async fn herunterladen(client: &reqwest::Client, url: &str, ziel: &Path, ch: &Channel<Fortschritt>, text: &str) -> Result<(), String> {
    use std::io::Write;
    let r = client.get(url).send().await.map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("Download fehlgeschlagen (HTTP {}): {url}", r.status().as_u16()));
    }
    let total = r.content_length().unwrap_or(0);
    let teil = ziel.with_extension("teil");
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
            let _ = ch.send(Fortschritt { text: text.into(), done, total });
        }
    }
    drop(f);
    std::fs::rename(&teil, ziel).map_err(|e| e.to_string())
}

/// ONNX Runtime (nur die Bibliothek) aus dem offiziellen Paket holen
async fn laufzeit_laden(client: &reqwest::Client, dir: &Path, ch: &Channel<Fortschritt>) -> Result<(), String> {
    let ziel = laufzeit_datei(dir);
    if ziel.is_file() {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    let (paket, innen) = (format!("onnxruntime-osx-arm64-{ORT_VERSION}.tgz"), format!("lib/libonnxruntime.{ORT_VERSION}.dylib"));
    #[cfg(target_os = "windows")]
    let (paket, innen) = (format!("onnxruntime-win-x64-{ORT_VERSION}.zip"), "lib/onnxruntime.dll".to_string());
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let (paket, innen) = (format!("onnxruntime-linux-x64-{ORT_VERSION}.tgz"), format!("lib/libonnxruntime.so.{ORT_VERSION}"));
    let url = format!("https://github.com/microsoft/onnxruntime/releases/download/v{ORT_VERSION}/{paket}");
    let archiv = dir.join("laufzeit").join(&paket);
    herunterladen(client, &url, &archiv, ch, "Laufzeit wird geladen …").await?;
    let ziel2 = ziel.clone();
    let a2 = archiv.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let f = std::fs::File::open(&a2).map_err(|e| e.to_string())?;
        if a2.extension().map(|e| e == "zip").unwrap_or(false) {
            let mut z = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
            for i in 0..z.len() {
                let mut e = z.by_index(i).map_err(|e| e.to_string())?;
                if e.name().ends_with(&innen) {
                    let mut out = std::fs::File::create(&ziel2).map_err(|e| e.to_string())?;
                    std::io::copy(&mut e, &mut out).map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }
        } else {
            let mut t = tar::Archive::new(flate2::read::GzDecoder::new(f));
            for e in t.entries().map_err(|e| e.to_string())? {
                let mut e = e.map_err(|e| e.to_string())?;
                let pfad = e.path().map_err(|e| e.to_string())?.to_string_lossy().into_owned();
                if pfad.ends_with(&innen) {
                    e.unpack(&ziel2).map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }
        }
        Err("ONNX Runtime nicht im Paket gefunden".into())
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = std::fs::remove_file(&archiv);
    Ok(())
}

#[tauri::command]
pub async fn supertonic_laden(app: tauri::AppHandle, on_progress: Channel<Fortschritt>) -> Result<(), String> {
    let dir = ordner(&app)?;
    let client = reqwest::Client::builder()
        .user_agent(concat!("LeitWerk/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    laufzeit_laden(&client, &dir, &on_progress).await?;
    let basis = format!("https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/{REVISION}");
    for f in MODELL_DATEIEN {
        let ziel = dir.join(f);
        if !ziel.is_file() {
            herunterladen(&client, &format!("{basis}/{f}"), &ziel, &on_progress, &format!("Modell: {f}")).await?;
        }
    }
    for s in STIMMEN {
        let ziel = dir.join(format!("voice_styles/{s}.json"));
        if !ziel.is_file() {
            herunterladen(&client, &format!("{basis}/voice_styles/{s}.json"), &ziel, &on_progress, &format!("Stimme {s}")).await?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn supertonic_loeschen(app: tauri::AppHandle) -> Result<(), String> {
    if let Ok(mut m) = MODELL.lock() {
        *m = None;
    }
    let dir = ordner(&app)?;
    let _ = std::fs::remove_dir_all(dir.join("onnx"));
    let _ = std::fs::remove_dir_all(dir.join("voice_styles"));
    Ok(())
}

// ------------------------------------------------------------ Modell

#[derive(Deserialize)]
struct Config {
    ae: AeConfig,
    ttl: TtlConfig,
}
#[derive(Deserialize)]
struct AeConfig {
    sample_rate: i32,
    base_chunk_size: i32,
}
#[derive(Deserialize)]
struct TtlConfig {
    chunk_compress_factor: i32,
    latent_dim: i32,
}

#[derive(Deserialize)]
struct StilTeil {
    data: Vec<Vec<Vec<f32>>>,
    dims: Vec<usize>,
}
#[derive(Deserialize)]
struct StilDatei {
    style_ttl: StilTeil,
    style_dp: StilTeil,
}

struct Stil {
    ttl: (Vec<usize>, Vec<f32>),
    dp: (Vec<usize>, Vec<f32>),
}

struct Modell {
    cfg: Config,
    indexer: Vec<i64>,
    dp: Session,
    enc: Session,
    est: Session,
    voc: Session,
    stile: std::collections::HashMap<String, Stil>,
}

static MODELL: Mutex<Option<Modell>> = Mutex::new(None);
static ORT_BEREIT: std::sync::OnceLock<Result<(), String>> = std::sync::OnceLock::new();

fn json<T: for<'de> Deserialize<'de>>(p: &Path) -> Result<T, String> {
    let f = std::fs::File::open(p).map_err(|e| format!("{}: {e}", p.display()))?;
    serde_json::from_reader(std::io::BufReader::new(f)).map_err(|e| format!("{}: {e}", p.display()))
}

fn sitzung(p: &Path) -> Result<Session, String> {
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 6);
    Session::builder()
        .map_err(|e| e.to_string())?
        .with_intra_threads(threads)
        .map_err(|e| e.to_string())?
        .commit_from_file(p)
        .map_err(|e| format!("Modell {}: {e}", p.display()))
}

fn stil_flach(t: &StilTeil) -> (Vec<usize>, Vec<f32>) {
    let mut v = Vec::new();
    for a in &t.data {
        for b in a {
            v.extend_from_slice(b);
        }
    }
    let dims = if t.dims.len() == 3 { vec![1, t.dims[1], t.dims[2]] } else { t.dims.clone() };
    (dims, v)
}

fn laden(dir: &Path) -> Result<Modell, String> {
    let lib = laufzeit_datei(dir);
    ORT_BEREIT
        .get_or_init(|| {
            let _ = ort::init_from(lib.to_string_lossy().to_string()).commit();
            Ok(())
        })
        .clone()?;
    let o = dir.join("onnx");
    let mut stile = std::collections::HashMap::new();
    for s in STIMMEN {
        let d: StilDatei = json(&dir.join(format!("voice_styles/{s}.json")))?;
        stile.insert(s.to_string(), Stil { ttl: stil_flach(&d.style_ttl), dp: stil_flach(&d.style_dp) });
    }
    Ok(Modell {
        cfg: json(&o.join("tts.json"))?,
        indexer: json(&o.join("unicode_indexer.json"))?,
        dp: sitzung(&o.join("duration_predictor.onnx"))?,
        enc: sitzung(&o.join("text_encoder.onnx"))?,
        est: sitzung(&o.join("vector_estimator.onnx"))?,
        voc: sitzung(&o.join("vocoder.onnx"))?,
        stile,
    })
}

/// Text vorbereiten (wie im Beispiel, vereinfacht) und mit Sprachkennung umschließen
fn vorbereiten(text: &str) -> String {
    let mut t: String = text.nfkd().collect();
    for (a, b) in [("–", "-"), ("—", "-"), ("_", " "), ("\u{201C}", "\""), ("\u{201D}", "\""), ("\u{201E}", "\""), ("\u{2018}", "'"), ("\u{2019}", "'"), ("[", " "), ("]", " "), ("|", " "), ("/", " "), ("#", " ")] {
        t = t.replace(a, b);
    }
    for (a, b) in [(" ,", ","), (" .", "."), (" !", "!"), (" ?", "?"), (" ;", ";"), (" :", ":")] {
        t = t.replace(a, b);
    }
    let mut t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    if !t.is_empty() && !t.ends_with(['.', '!', '?', ';', ':', ',', '\'', '"', ')', '…']) {
        t.push('.');
    }
    format!("<de>{t}</de>")
}

/// einfacher Zufall (Normalverteilung, Box-Muller) – reicht für das Rauschen
struct Zufall(u64);
impl Zufall {
    fn neu() -> Self {
        let s = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(42);
        Zufall(s | 1)
    }
    fn gleich(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        ((self.0 >> 11) as f64 / (1u64 << 53) as f64) as f32
    }
    fn normal(&mut self) -> f32 {
        let u1 = self.gleich().max(1e-7);
        let u2 = self.gleich();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f32::consts::PI * u2).cos()
    }
}

fn tensor_f32(dims: &[usize], v: Vec<f32>) -> Result<Tensor<f32>, String> {
    Tensor::from_array((dims.to_vec(), v)).map_err(|e| e.to_string())
}

impl Modell {
    fn erzeugen(&mut self, text: &str, stimme: &str, schritte: usize, tempo: f32) -> Result<Vec<f32>, String> {
        let stil = self.stile.get(stimme).or_else(|| self.stile.get("F1")).ok_or("Stimme fehlt")?;
        let rate = self.cfg.ae.sample_rate;
        // Text → Kennzahlen
        let t = vorbereiten(text);
        let ids: Vec<i64> = t.chars().map(|c| self.indexer.get(c as usize).copied().unwrap_or(-1)).collect();
        let n = ids.len();
        let maske = vec![1.0f32; n];
        let ids_t = Tensor::from_array((vec![1usize, n], ids)).map_err(|e| e.to_string())?;
        let maske_t = tensor_f32(&[1, 1, n], maske.clone())?;
        let dp_t = tensor_f32(&stil.dp.0, stil.dp.1.clone())?;
        let ttl_t = tensor_f32(&stil.ttl.0, stil.ttl.1.clone())?;

        // Dauer
        let dauer = {
            let out = self
                .dp
                .run(ort::inputs! { "text_ids" => &ids_t, "style_dp" => &dp_t, "text_mask" => &maske_t })
                .map_err(|e| e.to_string())?;
            let (_, d) = out["duration"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
            d.first().copied().unwrap_or(1.0) / tempo.max(0.3)
        };
        // Text kodieren
        let (emb_form, emb) = {
            let out = self
                .enc
                .run(ort::inputs! { "text_ids" => &ids_t, "style_ttl" => &ttl_t, "text_mask" => &maske_t })
                .map_err(|e| e.to_string())?;
            let (form, d) = out["text_emb"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
            (form.iter().map(|x| *x as usize).collect::<Vec<_>>(), d.to_vec())
        };
        // verrauschter Startwert
        let wav_len = (dauer * rate as f32) as usize;
        let chunk = (self.cfg.ae.base_chunk_size * self.cfg.ttl.chunk_compress_factor) as usize;
        let lat_len = wav_len.div_ceil(chunk).max(1);
        let lat_dim = (self.cfg.ttl.latent_dim * self.cfg.ttl.chunk_compress_factor) as usize;
        let mut z = Zufall::neu();
        let mut xt: Vec<f32> = (0..lat_dim * lat_len).map(|_| z.normal()).collect();
        let lat_maske = vec![1.0f32; lat_len];
        let gesamt = tensor_f32(&[1], vec![schritte as f32])?;
        for schritt in 0..schritte {
            let out = self
                .est
                .run(ort::inputs! {
                    "noisy_latent" => &tensor_f32(&[1, lat_dim, lat_len], xt.clone())?,
                    "text_emb" => &tensor_f32(&emb_form, emb.clone())?,
                    "style_ttl" => &ttl_t,
                    "latent_mask" => &tensor_f32(&[1, 1, lat_len], lat_maske.clone())?,
                    "text_mask" => &maske_t,
                    "current_step" => &tensor_f32(&[1], vec![schritt as f32])?,
                    "total_step" => &gesamt
                })
                .map_err(|e| e.to_string())?;
            let (_, d) = out["denoised_latent"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
            xt = d.to_vec();
        }
        // Klang erzeugen
        let out = self.voc.run(ort::inputs! { "latent" => &tensor_f32(&[1, lat_dim, lat_len], xt)? }).map_err(|e| e.to_string())?;
        let (_, wav) = out["wav_tts"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
        Ok(wav[..wav_len.min(wav.len())].to_vec())
    }
}

/// Sprache erzeugen. Antwort wie bei Piper: 4 Byte Abtastrate (u32 LE), dann f32-Samples.
#[tauri::command]
pub async fn supertonic_erzeugen(app: tauri::AppHandle, stimme: String, text: String, tempo: f32, schritte: Option<usize>) -> Result<Response, String> {
    let dir = ordner(&app)?;
    if !vollstaendig(&dir) {
        return Err("Supertonic ist nicht geladen (Einstellungen → Persönlich → Sprache)".into());
    }
    let (wav, rate) = tauri::async_runtime::spawn_blocking(move || -> Result<(Vec<f32>, u32), String> {
        let mut g = MODELL.lock().map_err(|_| "Supertonic blockiert".to_string())?;
        if g.is_none() {
            *g = Some(laden(&dir)?);
        }
        let m = g.as_mut().ok_or("Supertonic fehlt")?;
        let rate = m.cfg.ae.sample_rate as u32;
        // lange Texte in Sätzen erzeugen
        let mut alles = Vec::new();
        for satz in saetze(&text) {
            let w = m.erzeugen(&satz, &stimme, schritte.unwrap_or(8).clamp(2, 16), tempo.clamp(0.5, 2.0))?;
            if !alles.is_empty() {
                alles.extend(std::iter::repeat(0.0).take(rate as usize / 6));
            }
            alles.extend(w);
        }
        Ok((alles, rate))
    })
    .await
    .map_err(|e| e.to_string())??;
    let mut out = Vec::with_capacity(4 + wav.len() * 4);
    out.extend_from_slice(&rate.to_le_bytes());
    for x in wav {
        out.extend_from_slice(&x.to_le_bytes());
    }
    Ok(Response::new(out))
}

/// Text an Satzenden teilen (höchstens ~250 Zeichen je Stück)
fn saetze(t: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for wort in t.split_whitespace() {
        if !cur.is_empty() {
            cur.push(' ');
        }
        cur.push_str(wort);
        let ende = wort.ends_with(['.', '!', '?', '…']);
        if (ende && cur.len() > 60) || cur.len() > 250 {
            out.push(std::mem::take(&mut cur));
        }
    }
    if !cur.trim().is_empty() {
        out.push(cur);
    }
    out
}
