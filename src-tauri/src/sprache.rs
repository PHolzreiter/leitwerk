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
fn url_dekodieren(s: &str) -> String {
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
