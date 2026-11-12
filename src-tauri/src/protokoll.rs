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

// ------------------------------------------------------------------ Funk-Aufnahmen zum Nachhören
//
// Die eigenen Funksprüche (so wie sie die anderen hören: 8 kHz, μ-law) mit dem erkannten Text – damit sich eine falsche
// Erkennung nachprüfen lässt. Es bleiben die letzten 30 (je Spruch ca. 8 KB pro Sekunde), ältere werden gelöscht.

const AUFNAHMEN_BEHALTEN: usize = 30;

fn aufnahmen_ordner(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = ordner(app)?.join("aufnahmen");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// WAV mit μ-law (Format 7), 8 kHz, mono – spielt jeder übliche Player ab
fn wav_ulaw(daten: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(daten.len() + 58);
    let n = daten.len() as u32;
    v.extend_from_slice(b"RIFF");
    v.extend_from_slice(&(50 + n).to_le_bytes());
    v.extend_from_slice(b"WAVEfmt ");
    v.extend_from_slice(&18u32.to_le_bytes());
    v.extend_from_slice(&7u16.to_le_bytes()); // μ-law
    v.extend_from_slice(&1u16.to_le_bytes()); // mono
    v.extend_from_slice(&8000u32.to_le_bytes());
    v.extend_from_slice(&8000u32.to_le_bytes()); // Bytes je Sekunde
    v.extend_from_slice(&1u16.to_le_bytes()); // Blockgröße
    v.extend_from_slice(&8u16.to_le_bytes()); // Bits
    v.extend_from_slice(&0u16.to_le_bytes()); // Zusatz
    v.extend_from_slice(b"fact");
    v.extend_from_slice(&4u32.to_le_bytes());
    v.extend_from_slice(&n.to_le_bytes());
    v.extend_from_slice(b"data");
    v.extend_from_slice(&n.to_le_bytes());
    v.extend_from_slice(daten);
    v
}

fn aufnahmen_liste(d: &PathBuf) -> Vec<PathBuf> {
    let Ok(it) = std::fs::read_dir(d) else { return Vec::new() };
    let mut alle: Vec<PathBuf> = it
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("wav"))
        .collect();
    alle.sort();
    alle
}

/// Eine Aufnahme sichern: name (Zeitstempel + Rufname), μ-law-Bytes, erkannter Text (als .txt daneben)
#[tauri::command]
pub fn protokoll_aufnahme(app: tauri::AppHandle, name: String, ulaw: Vec<u8>, text: String) -> Result<String, String> {
    if ulaw.is_empty() {
        return Ok(String::new());
    }
    let d = aufnahmen_ordner(&app)?;
    let sauber: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).take(80).collect();
    let wav = d.join(format!("{sauber}.wav"));
    std::fs::write(&wav, wav_ulaw(&ulaw)).map_err(|e| format!("Aufnahme: {e}"))?;
    let _ = std::fs::write(d.join(format!("{sauber}.txt")), text.as_bytes());
    let mut alle = aufnahmen_liste(&d);
    while alle.len() > AUFNAHMEN_BEHALTEN {
        let p = alle.remove(0);
        let _ = std::fs::remove_file(p.with_extension("txt"));
        let _ = std::fs::remove_file(p);
    }
    Ok(wav.to_string_lossy().into_owned())
}

#[derive(serde::Serialize)]
pub struct Aufnahme {
    name: String,
    text: String,
    wav: Vec<u8>,
}

/// Die letzten Aufnahmen (neueste zuletzt) – für „Fehler melden“, wenn das Anhängen eingeschaltet ist
#[tauri::command]
pub fn protokoll_aufnahmen(app: tauri::AppHandle, max: Option<usize>) -> Result<Vec<Aufnahme>, String> {
    let d = aufnahmen_ordner(&app)?;
    let alle = aufnahmen_liste(&d);
    let n = max.unwrap_or(AUFNAHMEN_BEHALTEN).min(alle.len());
    Ok(alle[alle.len() - n..]
        .iter()
        .map(|p| Aufnahme {
            name: p.file_stem().and_then(|x| x.to_str()).unwrap_or("").to_string(),
            text: std::fs::read_to_string(p.with_extension("txt")).unwrap_or_default(),
            wav: std::fs::read(p).unwrap_or_default(),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wav_kopf_stimmt() {
        let w = wav_ulaw(&[0xFFu8; 800]);
        assert_eq!(&w[0..4], b"RIFF");
        assert_eq!(u32::from_le_bytes([w[4], w[5], w[6], w[7]]) as usize, w.len() - 8);
        assert_eq!(u16::from_le_bytes([w[20], w[21]]), 7);
        assert_eq!(&w[50..54], b"data");
        assert_eq!(w.len(), 58 + 800);
    }
}
