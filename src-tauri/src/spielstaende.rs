//! Spielstände als Dateien im Ordner „Dokumente/LeitWerk/Spielstände“:
//! auflisten (mit dem Kopf der Datei für die Übersicht), lesen, schreiben,
//! umbenennen, löschen, importieren und den Ordner im Dateimanager öffnen.

use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::Manager;

const ENDUNG: &str = "leitwerk";
/// So viel vom Anfang der Datei reicht für die Infos (stehen ganz vorne).
const KOPF_BYTES: usize = 16 * 1024;

fn ordner(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let basis = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| format!("Dokumente-Ordner nicht gefunden: {e}"))?;
    let dir = basis.join("LeitWerk").join("Spielstände");
    fs::create_dir_all(&dir).map_err(|e| format!("Ordner {} nicht anlegbar: {e}", dir.display()))?;
    Ok(dir)
}

/// Nur ein Dateiname (keine Pfade), sonst Fehler
fn datei_in(dir: &Path, name: &str) -> Result<PathBuf, String> {
    let ok = !name.is_empty()
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && !name.starts_with('.');
    if !ok {
        return Err("Ungültiger Dateiname".into());
    }
    Ok(dir.join(name))
}

/// Ein lesbarer Dateiname: nur unproblematische Zeichen, Endung .leitwerk
fn sauberer_name(name: &str) -> String {
    let basis = name.trim().trim_end_matches(&format!(".{ENDUNG}"));
    let mut s: String = basis
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control() { '-' } else { c })
        .collect();
    s = s.trim().trim_matches('.').to_string();
    if s.is_empty() {
        s = "Spielstand".into();
    }
    if s.chars().count() > 80 {
        s = s.chars().take(80).collect();
    }
    format!("{s}.{ENDUNG}")
}

/// Freien Namen finden („Name (2).leitwerk“ …)
fn frei(dir: &Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    if !p.exists() {
        return p;
    }
    let stamm = name.trim_end_matches(&format!(".{ENDUNG}"));
    for i in 2..1000 {
        let q = dir.join(format!("{stamm} ({i}).{ENDUNG}"));
        if !q.exists() {
            return q;
        }
    }
    dir.join(format!("{stamm} ({}).{ENDUNG}", std::process::id()))
}

#[derive(Serialize)]
pub struct Eintrag {
    datei: String,
    groesse: u64,
    geaendert: u64,
    kopf: String,
}

#[tauri::command]
pub fn spielstaende_ordner(app: tauri::AppHandle) -> Result<String, String> {
    ordner(&app).map(|p| p.display().to_string())
}

#[tauri::command]
pub fn spielstaende_liste(app: tauri::AppHandle) -> Result<Vec<Eintrag>, String> {
    let dir = ordner(&app)?;
    let mut out = Vec::new();
    for e in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let p = e.path();
        if !p.is_file() || p.extension().and_then(|x| x.to_str()) != Some(ENDUNG) {
            continue;
        }
        let meta = match e.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let geaendert = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
        let mut kopf = vec![0u8; KOPF_BYTES];
        let n = File::open(&p).and_then(|mut f| f.read(&mut kopf)).unwrap_or(0);
        kopf.truncate(n);
        out.push(Eintrag {
            datei: e.file_name().to_string_lossy().to_string(),
            groesse: meta.len(),
            geaendert,
            kopf: String::from_utf8_lossy(&kopf).to_string(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn spielstand_lesen(app: tauri::AppHandle, datei: String) -> Result<String, String> {
    let p = datei_in(&ordner(&app)?, &datei)?;
    fs::read_to_string(&p).map_err(|e| format!("Spielstand nicht lesbar: {e}"))
}

/// Schreibt einen Spielstand; gibt den tatsächlichen Dateinamen zurück.
/// `ersetzen`: vorhandene Datei überschreiben (sonst neuer freier Name).
#[tauri::command]
pub fn spielstand_schreiben(app: tauri::AppHandle, name: String, json: String, ersetzen: bool) -> Result<String, String> {
    let dir = ordner(&app)?;
    let n = sauberer_name(&name);
    let ziel = if ersetzen { dir.join(&n) } else { frei(&dir, &n) };
    let tmp = ziel.with_extension("tmp");
    fs::write(&tmp, json).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
    fs::rename(&tmp, &ziel).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
    Ok(ziel.file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or(n))
}

#[tauri::command]
pub fn spielstand_umbenennen(app: tauri::AppHandle, datei: String, name: String) -> Result<String, String> {
    let dir = ordner(&app)?;
    let alt = datei_in(&dir, &datei)?;
    let n = sauberer_name(&name);
    if n == datei {
        return Ok(n);
    }
    let neu = frei(&dir, &n);
    fs::rename(&alt, &neu).map_err(|e| format!("Umbenennen fehlgeschlagen: {e}"))?;
    Ok(neu.file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or(n))
}

#[tauri::command]
pub fn spielstand_loeschen(app: tauri::AppHandle, datei: String) -> Result<(), String> {
    let p = datei_in(&ordner(&app)?, &datei)?;
    fs::remove_file(&p).map_err(|e| format!("Löschen fehlgeschlagen: {e}"))
}

/// Kopiert eine gewählte Datei in den Spielstand-Ordner (nur echte LeitWerk-Spielstände).
#[tauri::command]
pub fn spielstand_importieren(app: tauri::AppHandle, pfad: String) -> Result<String, String> {
    let dir = ordner(&app)?;
    let quelle = PathBuf::from(&pfad);
    let mut kopf = vec![0u8; 512];
    let n = File::open(&quelle).and_then(|mut f| f.read(&mut kopf)).map_err(|e| format!("Datei nicht lesbar: {e}"))?;
    if !String::from_utf8_lossy(&kopf[..n]).contains("leitwerk-spielstand") {
        return Err(format!("{} ist kein LeitWerk-Spielstand", quelle.file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or(pfad.clone())));
    }
    let stamm = quelle.file_stem().map(|x| x.to_string_lossy().to_string()).unwrap_or_else(|| "Import".into());
    let ziel = frei(&dir, &sauberer_name(&stamm));
    if quelle.canonicalize().ok() == ziel.canonicalize().ok() {
        return Ok(ziel.file_name().unwrap().to_string_lossy().to_string());
    }
    fs::copy(&quelle, &ziel).map_err(|e| format!("Import fehlgeschlagen: {e}"))?;
    Ok(ziel.file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or_default())
}

/// Öffnet den Spielstand-Ordner im Finder / Explorer.
#[tauri::command]
pub fn spielstaende_zeigen(app: tauri::AppHandle) -> Result<(), String> {
    let dir = ordner(&app)?;
    #[cfg(target_os = "macos")]
    let prog = "open";
    #[cfg(target_os = "windows")]
    let prog = "explorer";
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let prog = "xdg-open";
    std::process::Command::new(prog).arg(&dir).spawn().map_err(|e| format!("Ordner konnte nicht geöffnet werden: {e}"))?;
    Ok(())
}
