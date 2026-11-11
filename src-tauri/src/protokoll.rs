//! Laufendes Protokoll (Logfile) je Sitzung: eine JSON-Zeile je Ereignis (Funk, Spieler, Einsätze, Warnungen).
//!
//! Liegt im Datenordner unter `protokoll/sitzung-<Datum>-<Uhrzeit>.jsonl`. Es bleiben die letzten 15 Sitzungen,
//! jede höchstens 40 MB. „Fehler melden“ hängt den Anfang und das Ende der laufenden Datei an den Bericht.

use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

const BEHALTEN: usize = 15;
const MAX_BYTES: u64 = 40 * 1024 * 1024;

static DATEI: Mutex<Option<PathBuf>> = Mutex::new(None);

fn ordner(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("protokoll");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// alte Sitzungen löschen (die neuesten BEHALTEN bleiben)
fn aufraeumen(d: &PathBuf) {
    let Ok(it) = std::fs::read_dir(d) else { return };
    let mut alle: Vec<PathBuf> = it
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with("sitzung-") && n.ends_with(".jsonl")).unwrap_or(false))
        .collect();
    alle.sort();
    while alle.len() > BEHALTEN {
        let p = alle.remove(0);
        let _ = std::fs::remove_file(p);
    }
}

/// Zeilen anhängen (jede Zeile ein JSON-Objekt); stempel = Name der Sitzung (vom Fenster, z. B. „20261111-2153“)
#[tauri::command]
pub fn protokoll_schreiben(app: tauri::AppHandle, stempel: String, zeilen: String) -> Result<String, String> {
    if zeilen.is_empty() {
        return Ok(String::new());
    }
    let mut d = DATEI.lock().map_err(|_| "Protokoll blockiert".to_string())?;
    let sauber: String = stempel.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(40).collect();
    let soll = ordner(&app)?.join(format!("sitzung-{sauber}.jsonl"));
    if d.as_ref() != Some(&soll) {
        if let Some(o) = soll.parent() {
            aufraeumen(&o.to_path_buf());
        }
        *d = Some(soll.clone());
    }
    let pfad = d.clone().unwrap_or(soll);
    if std::fs::metadata(&pfad).map(|m| m.len()).unwrap_or(0) > MAX_BYTES {
        return Ok(pfad.to_string_lossy().into_owned());
    }
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(&pfad).map_err(|e| format!("Protokoll: {e}"))?;
    f.write_all(zeilen.as_bytes()).map_err(|e| format!("Protokoll: {e}"))?;
    if !zeilen.ends_with('\n') {
        let _ = f.write_all(b"\n");
    }
    Ok(pfad.to_string_lossy().into_owned())
}

/// Ende der laufenden Protokolldatei (höchstens max_bytes) – für „Fehler melden“
#[tauri::command]
pub fn protokoll_lesen(max_bytes: Option<u64>) -> Result<String, String> {
    let d = DATEI.lock().map_err(|_| "Protokoll blockiert".to_string())?;
    let Some(p) = d.as_ref() else { return Ok(String::new()) };
    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    let max = max_bytes.unwrap_or(4 * 1024 * 1024) as usize;
    let ab = bytes.len().saturating_sub(max);
    // erst ab der nächsten ganzen Zeile
    let ab = if ab > 0 { bytes[ab..].iter().position(|b| *b == b'\n').map(|i| ab + i + 1).unwrap_or(ab) } else { 0 };
    Ok(String::from_utf8_lossy(&bytes[ab..]).into_owned())
}

/// Ordner der Protokolle (zum Öffnen)
#[tauri::command]
pub fn protokoll_ordner(app: tauri::AppHandle) -> Result<String, String> {
    Ok(ordner(&app)?.to_string_lossy().into_owned())
}
