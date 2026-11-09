//! Beta: ein eigenes Programm neben der normalen Version.
//!
//! Die Beta hat eine eigene Kennung (`….beta`, siehe `tauri.beta.conf.json`) und damit eigene
//! Einstellungen, Spielstände und Fälle – sie kann die normale Version nicht verändern.
//! - Große Downloads (Kartenpakete, Sprach- und Stimmmodelle) teilt sie sich mit der normalen Version.
//! - Beim ersten Start übernimmt sie einmalig deren Einstellungen (Dateien und Speicher der Oberfläche).
//! - Updates holt sie nur aus dem Beta-Kanal (siehe `updater.rs`); die normale Version sieht die Beta nie.
//!
//! In der normalen Version tut dieses Modul nichts.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

/// Kennung der normalen Version
pub const NORMAL: &str = "at.pholzreiter.leitwerk";

/// Ordner im Datenordner, die beide Programme gemeinsam nutzen (große Downloads)
const GETEILT: [&str; 4] = ["packs", "sprache", "stimmen", "supertonic"];

/// Merkt sich, dass die Einstellungen schon übernommen wurden
const MARKE: &str = ".von-normal-uebernommen";

pub fn ist_beta(kennung: &str) -> bool {
    kennung.ends_with(".beta")
}

/// Der gleichnamige Ordner der normalen Version (gleiche Ebene, andere Kennung)
fn normal_neben(eigen: &Path) -> Option<PathBuf> {
    eigen.parent().map(|p| p.join(NORMAL))
}

/// Datenordner für die gemeinsam genutzten Downloads: in der Beta der Ordner der normalen Version.
pub fn gemeinsam(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let eigen = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Datenordner nicht gefunden: {e}"))?;
    if ist_beta(&app.config().identifier) {
        if let Some(n) = normal_neben(&eigen) {
            return Ok(n);
        }
    }
    Ok(eigen)
}

/// Ordnerpaare (normal → beta), die beim ersten Start kopiert werden.
/// Muss laufen, bevor die Oberfläche startet (deren Speicher wird mitkopiert).
fn ordnerpaare(kennung: &str) -> Vec<(PathBuf, PathBuf, bool)> {
    let mut v = Vec::new();
    let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
    if cfg!(target_os = "windows") {
        // Datenordner (Roaming) und Speicher der Oberfläche (WebView2, Local)
        if let Some(a) = env("APPDATA") {
            v.push((a.join(NORMAL), a.join(kennung), true));
        }
        if let Some(l) = env("LOCALAPPDATA") {
            for teil in ["Local Storage", "IndexedDB"] {
                let p = PathBuf::from("EBWebView").join("Default").join(teil);
                v.push((l.join(NORMAL).join(&p), l.join(kennung).join(&p), false));
            }
        }
    } else if cfg!(target_os = "macos") {
        if let Some(h) = env("HOME") {
            let lib = h.join("Library");
            v.push((lib.join("Application Support").join(NORMAL), lib.join("Application Support").join(kennung), true));
            // Speicher der Oberfläche (WKWebView: localStorage, IndexedDB)
            v.push((lib.join("WebKit").join(NORMAL), lib.join("WebKit").join(kennung), false));
        }
    } else if let Some(d) = env("XDG_DATA_HOME").or_else(|| env("HOME").map(|h| h.join(".local").join("share"))) {
        v.push((d.join(NORMAL), d.join(kennung), true));
    }
    v
}

/// Kopiert einen Ordner rekursiv; vorhandene Dateien bleiben, gesperrte Dateien werden übersprungen.
fn kopieren(von: &Path, nach: &Path, ohne: &[&str]) -> std::io::Result<()> {
    fs::create_dir_all(nach)?;
    for e in fs::read_dir(von)?.flatten() {
        let name = e.file_name();
        let n = name.to_string_lossy();
        if ohne.iter().any(|x| *x == n) || n == "LOCK" || n.ends_with(".part") {
            continue;
        }
        let ziel = nach.join(&name);
        let pfad = e.path();
        if pfad.is_dir() {
            let _ = kopieren(&pfad, &ziel, &[]);
        } else if !ziel.exists() {
            let _ = fs::copy(&pfad, &ziel);
        }
    }
    Ok(())
}

/// Beim ersten Start der Beta: Einstellungen, Spielstände und Fälle der normalen Version einmalig übernehmen.
pub fn erster_start(kennung: &str) {
    if !ist_beta(kennung) {
        return;
    }
    let paare = ordnerpaare(kennung);
    let Some((_, daten, _)) = paare.iter().find(|p| p.2) else { return };
    if daten.join(MARKE).exists() {
        return;
    }
    for (von, nach, ist_daten) in &paare {
        if !von.is_dir() {
            continue;
        }
        // Speicher der Oberfläche nur, wenn die Beta noch keinen eigenen hat
        if !*ist_daten && nach.exists() {
            continue;
        }
        let ohne: &[&str] = if *ist_daten { &GETEILT } else { &[] };
        if let Err(e) = kopieren(von, nach, ohne) {
            eprintln!("Beta: Übernehmen aus {} fehlgeschlagen: {e}", von.display());
        }
    }
    let _ = fs::create_dir_all(daten);
    let _ = fs::write(daten.join(MARKE), "Einstellungen der normalen Version übernommen\n");
}
