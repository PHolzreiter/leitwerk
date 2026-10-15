//! Piper-Stimmen (lokal, ohne Internet) über sherpa-onnx.
//! Die Stimmen werden einmalig als Paket (vits-piper-de_DE-…) von den sherpa-onnx-Releases geladen.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::Serialize;
use sherpa_rs::tts::{CommonTtsConfig, VitsTts, VitsTtsConfig};
use sherpa_rs::OnnxConfig;
use tauri::ipc::{Channel, Response};
use tauri::Manager;

/// bekannte deutsche Piper-Stimmen (Paketname bei sherpa-onnx ohne „vits-piper-“)
const STIMMEN: &[&str] = &[
    "de_DE-thorsten-medium",
    "de_DE-thorsten_emotional-medium",
    "de_DE-karlsson-low",
    "de_DE-pavoque-low",
    "de_DE-kerstin-low",
    "de_DE-ramona-low",
    "de_DE-eva_k-x_low",
];

/// geladene Stimmen bleiben im Speicher
static GELADEN: Mutex<Option<HashMap<String, Arc<Mutex<VitsTts>>>>> = Mutex::new(None);

fn ordner(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Datenordner nicht gefunden: {e}"))?
        .join("stimmen");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Datenordner nicht anlegbar: {e}"))?;
    Ok(dir)
}

fn pruefe(name: &str) -> Result<(), String> {
    if STIMMEN.contains(&name) {
        Ok(())
    } else {
        Err(format!("Unbekannte Stimme: {name}"))
    }
}

/// Ordner einer installierten Stimme (enthält <name>.onnx, tokens.txt, espeak-ng-data)
fn stimm_ordner(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(ordner(app)?.join(format!("vits-piper-{name}")))
}

fn installiert(dir: &Path, name: &str) -> bool {
    dir.join(format!("{name}.onnx")).is_file() && dir.join("tokens.txt").is_file() && dir.join("espeak-ng-data").is_dir()
}

#[derive(Serialize)]
pub struct StimmenStatus {
    stimmen: Vec<String>,
}

#[tauri::command]
pub fn stimmen_status(app: tauri::AppHandle) -> Result<StimmenStatus, String> {
    let mut stimmen = Vec::new();
    for n in STIMMEN {
        if installiert(&stimm_ordner(&app, n)?, n) {
            stimmen.push(n.to_string());
        }
    }
    Ok(StimmenStatus { stimmen })
}

#[derive(Serialize, Clone)]
pub struct StimmeFortschritt {
    done: u64,
    total: u64,
    entpacken: bool,
}

/// Lädt ein Stimmen-Paket (tar.bz2) und entpackt es.
#[tauri::command]
pub async fn stimme_laden(app: tauri::AppHandle, name: String, on_progress: Channel<StimmeFortschritt>) -> Result<(), String> {
    use std::io::Write;
    pruefe(&name)?;
    let dir = ordner(&app)?;
    let datei = dir.join(format!("vits-piper-{name}.tar.bz2.teil"));
    let url = format!("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-{name}.tar.bz2");
    let client = reqwest::Client::builder()
        .user_agent(concat!("LeitWerk/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let r = client.get(&url).send().await.map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("Download fehlgeschlagen (HTTP {})", r.status().as_u16()));
    }
    let total = r.content_length().unwrap_or(0);
    let mut f = std::fs::File::create(&datei).map_err(|e| e.to_string())?;
    let mut done = 0u64;
    let mut last = 0u64;
    let mut s = r.bytes_stream();
    while let Some(chunk) = s.next().await {
        let chunk = chunk.map_err(|e| format!("Download abgebrochen: {e}"))?;
        f.write_all(&chunk).map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        if done - last > 1_000_000 || done == total {
            last = done;
            let _ = on_progress.send(StimmeFortschritt { done, total, entpacken: false });
        }
    }
    drop(f);
    let _ = on_progress.send(StimmeFortschritt { done, total, entpacken: true });
    let ziel = dir.clone();
    let d2 = datei.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let f = std::fs::File::open(&d2).map_err(|e| e.to_string())?;
        let mut a = tar::Archive::new(bzip2::read::BzDecoder::new(std::io::BufReader::new(f)));
        a.unpack(&ziel).map_err(|e| format!("Entpacken fehlgeschlagen: {e}"))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = std::fs::remove_file(&datei);
    if !installiert(&stimm_ordner(&app, &name)?, &name) {
        return Err("Stimmen-Paket ist unvollständig".into());
    }
    Ok(())
}

#[tauri::command]
pub fn stimme_loeschen(app: tauri::AppHandle, name: String) -> Result<(), String> {
    pruefe(&name)?;
    if let Ok(mut g) = GELADEN.lock() {
        if let Some(m) = g.as_mut() {
            m.remove(&name);
        }
    }
    let d = stimm_ordner(&app, &name)?;
    if d.exists() {
        std::fs::remove_dir_all(d).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn tts_fuer(app: &tauri::AppHandle, name: &str) -> Result<Arc<Mutex<VitsTts>>, String> {
    let mut g = GELADEN.lock().map_err(|_| "Stimme blockiert".to_string())?;
    let m = g.get_or_insert_with(HashMap::new);
    if let Some(t) = m.get(name) {
        return Ok(t.clone());
    }
    let dir = stimm_ordner(app, name)?;
    if !installiert(&dir, name) {
        return Err(format!("Stimme „{name}“ ist nicht geladen (Einstellungen → Persönlich → Sprache)"));
    }
    let s = |p: PathBuf| p.to_string_lossy().into_owned();
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).clamp(1, 4) as i32;
    let cfg = VitsTtsConfig {
        model: s(dir.join(format!("{name}.onnx"))),
        tokens: s(dir.join("tokens.txt")),
        data_dir: s(dir.join("espeak-ng-data")),
        length_scale: 1.0,
        noise_scale: 0.667,
        noise_scale_w: 0.8,
        silence_scale: 0.2,
        onnx_config: OnnxConfig { provider: "cpu".into(), debug: false, num_threads: threads },
        tts_config: CommonTtsConfig { max_num_sentences: 2, ..Default::default() },
        ..Default::default()
    };
    let t = Arc::new(Mutex::new(VitsTts::new(cfg)));
    m.insert(name.to_string(), t.clone());
    Ok(t)
}

/// Erzeugt Sprache. Antwort: 4 Byte Abtastrate (u32 LE), dann f32-Samples (LE, mono).
/// sid = Sprecher im Modell (z. B. Emotion bei „thorsten_emotional“), tempo 0.5–2
#[tauri::command]
pub async fn stimme_erzeugen(app: tauri::AppHandle, name: String, text: String, sid: i32, tempo: f32) -> Result<Response, String> {
    pruefe(&name)?;
    let t = tts_fuer(&app, &name)?;
    let audio = tauri::async_runtime::spawn_blocking(move || -> Result<(Vec<f32>, u32), String> {
        let mut tts = t.lock().map_err(|_| "Stimme blockiert".to_string())?;
        let a = tts.create(&text, sid.max(0), tempo.clamp(0.5, 2.0)).map_err(|e| format!("Sprache erzeugen: {e}"))?;
        Ok((a.samples, a.sample_rate))
    })
    .await
    .map_err(|e| e.to_string())??;
    let mut out = Vec::with_capacity(4 + audio.0.len() * 4);
    out.extend_from_slice(&audio.1.to_le_bytes());
    for x in audio.0 {
        out.extend_from_slice(&x.to_le_bytes());
    }
    Ok(Response::new(out))
}
