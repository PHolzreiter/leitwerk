//! Einrichtung: eigene Pakete von LeitWerk in den Simulatoren einbauen und aktuell halten.
//!
//! Hier die EFB-App für MSFS 2024 (Community-Paket `leitwerk-efb-pilot`). Die Dateien sind in LeitWerk
//! eingebaut (tools/efb-app); manifest.json und layout.json entstehen wie bei tools/efb-app/bauen.py.
//! Aktualisiert wird, wenn die Version im Community-Ordner von der mitgelieferten abweicht. Entfernt wird nur
//! ein Paket, das LeitWerk selbst angelegt hat (creator „LeitWerk“). Änderungen wirken nach einem Neustart von MSFS.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const PAKET: &str = "leitwerk-efb-pilot";
const APP: &str = "LeitWerkPilot";
const JS: &str = include_str!("../../tools/efb-app/PackageSources/LeitWerkPilot/LeitWerkPilot.js");
const ICON: &[u8] = include_bytes!("../../tools/efb-app/PackageSources/LeitWerkPilot/Assets/app-icon.svg");
const LIZENZ: &[u8] = include_bytes!("../../tools/efb-app/PackageSources/LeitWerkPilot/LICENSE-msfs-efb-iframe.txt");
const BILD: &[u8] = include_bytes!("../../tools/efb-app/PackageDefinitions/leitwerk-efb-pilot/ContentInfo/thumbnail.jpg");

#[derive(Serialize, Clone, Debug, Default)]
pub struct EfbStand {
    /// Community-Ordner, in dem gesucht bzw. eingebaut wurde (None = keiner gefunden)
    pub community: Option<String>,
    /// Version im Community-Ordner (None = nicht eingebaut)
    pub installiert: Option<String>,
    /// Version, die in dieser LeitWerk-Version steckt
    pub mitgeliefert: String,
    /// liegt ein Paket gleichen Namens dort, das nicht von LeitWerk stammt
    pub fremd: bool,
    /// gerade geändert (wirkt nach Neustart von MSFS)
    pub geaendert: bool,
    pub fehler: String,
}

/// Version aus der App-Datei (`var VERSION = '0.4.0';`)
fn version_aus_js(js: &str) -> String {
    js.lines()
        .find_map(|z| {
            let z = z.trim();
            let r = z.strip_prefix("var VERSION")?.trim_start().strip_prefix('=')?.trim();
            Some(r.trim_end_matches(';').trim().trim_matches(|c| c == '\'' || c == '"').to_string())
        })
        .unwrap_or_else(|| "0.0.0".into())
}

pub fn mitgeliefert() -> String {
    version_aus_js(JS)
}

fn dateizeit_jetzt() -> u64 {
    let s = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() / 100).unwrap_or(0) as u64;
    s + 116_444_736_000_000_000
}

/// Dateien des Pakets (Pfad im Paket, Inhalt) – ohne manifest.json und layout.json
fn dateien() -> Vec<(String, Vec<u8>)> {
    let app = format!("html_ui/efb_ui/efb_apps/{APP}");
    vec![
        (format!("ContentInfo/{PAKET}/thumbnail.jpg"), BILD.to_vec()),
        (format!("{app}/Assets/app-icon.svg"), ICON.to_vec()),
        (format!("{app}/LICENSE-msfs-efb-iframe.txt"), LIZENZ.to_vec()),
        (format!("{app}/{APP}.js"), JS.as_bytes().to_vec()),
    ]
}

fn manifest(version: &str) -> String {
    let v = serde_json::json!({
        "dependencies": [],
        "content_type": "MISC",
        "title": "LeitWerk Pilot (EFB-App)",
        "manufacturer": "",
        "creator": "LeitWerk",
        "package_version": version,
        "minimum_game_version": "1.0.0",
        "release_notes": { "neutral": { "LastUpdate": "", "OlderHistory": "" } }
    });
    serde_json::to_string_pretty(&v).unwrap_or_default() + "\n"
}

fn layout(d: &[(String, Vec<u8>)]) -> String {
    let jetzt = dateizeit_jetzt();
    let mut l: Vec<_> = d.iter().map(|(p, b)| serde_json::json!({ "path": p, "size": b.len(), "date": jetzt })).collect();
    l.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    serde_json::to_string_pretty(&serde_json::json!({ "content": l })).unwrap_or_default() + "\n"
}

/// (Version, von LeitWerk?) des Pakets im Community-Ordner; None = nicht da
fn lesen(paket: &Path) -> Option<(String, bool)> {
    if !paket.is_dir() {
        return None;
    }
    let t = fs::read_to_string(paket.join("manifest.json")).unwrap_or_default();
    let v: serde_json::Value = serde_json::from_str(t.trim_start_matches('\u{feff}')).unwrap_or_default();
    let version = v.get("package_version").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let unser = v.get("creator").and_then(|x| x.as_str()) == Some("LeitWerk");
    Some((version, unser))
}

/// Schreibt das Paket (Dateien zuerst, manifest.json zuletzt – ein halb geschriebenes Paket gilt so als veraltet)
fn schreiben(paket: &Path) -> Result<(), String> {
    let d = dateien();
    for (rel, b) in &d {
        let p = paket.join(rel);
        if let Some(o) = p.parent() {
            fs::create_dir_all(o).map_err(|e| format!("{rel}: {e}"))?;
        }
        if fs::read(&p).ok().as_deref() != Some(b.as_slice()) {
            fs::write(&p, b).map_err(|e| format!("{rel}: {e}"))?;
        }
    }
    fs::write(paket.join("layout.json"), layout(&d)).map_err(|e| format!("layout.json: {e}"))?;
    fs::write(paket.join("manifest.json"), manifest(&mitgeliefert())).map_err(|e| format!("manifest.json: {e}"))
}

fn ziel(community: Option<String>) -> Option<PathBuf> {
    match community.filter(|c| !c.trim().is_empty()) {
        Some(c) => Some(PathBuf::from(c)),
        None => {
            let alle = crate::gtn::communities();
            // wo sie schon liegt, sonst der erste (MSFS 2024 zuerst)
            alle.iter().find(|c| c.join(PAKET).is_dir()).cloned().or_else(|| alle.into_iter().next())
        }
    }
}

/// aktion = "pruefen" | "einbauen" (auch aktualisieren) | "entfernen"
pub fn efb_app_aktion(community: Option<PathBuf>, aktion: &str) -> EfbStand {
    let mut st = EfbStand { mitgeliefert: mitgeliefert(), ..Default::default() };
    let Some(c) = community else { return st };
    st.community = Some(c.display().to_string());
    let paket = c.join(PAKET);
    let vorher = lesen(&paket);
    if let Some((v, unser)) = &vorher {
        st.installiert = Some(v.clone());
        st.fremd = !unser && paket.join("manifest.json").exists();
    }
    if aktion == "pruefen" {
        return st;
    }
    if st.fremd {
        st.fehler = format!("Im Community-Ordner liegt ein fremdes Paket „{PAKET}“ – nicht verändert");
        return st;
    }
    match aktion {
        "einbauen" => {
            if !c.is_dir() {
                st.fehler = "Community-Ordner nicht gefunden".into();
                return st;
            }
            let alles_da = dateien().iter().all(|(rel, b)| fs::read(paket.join(rel)).ok().as_deref() == Some(b.as_slice()));
            if st.installiert.as_deref() == Some(st.mitgeliefert.as_str()) && alles_da {
                return st;
            }
            match schreiben(&paket) {
                Ok(()) => {
                    st.installiert = Some(st.mitgeliefert.clone());
                    st.geaendert = true;
                }
                Err(e) => st.fehler = format!("EFB-App nicht eingebaut: {e}"),
            }
        }
        "entfernen" => {
            if vorher.is_some() {
                match fs::remove_dir_all(&paket) {
                    Ok(()) => {
                        st.installiert = None;
                        st.geaendert = true;
                    }
                    Err(e) => st.fehler = format!("EFB-App nicht entfernt (läuft MSFS noch?): {e}"),
                }
            }
        }
        _ => st.fehler = format!("unbekannte Aktion {aktion}"),
    }
    st
}

/// EFB-App von LeitWerk im Community-Ordner von MSFS prüfen, einbauen/aktualisieren oder entfernen
#[tauri::command]
pub fn efb_app(community: Option<String>, aktion: String) -> EfbStand {
    efb_app_aktion(ziel(community), &aktion)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn version() {
        assert_eq!(version_aus_js("  var APP_NAME = 'x';\n  var VERSION = '0.4.0';\n"), "0.4.0");
        assert!(!mitgeliefert().is_empty() && mitgeliefert() != "0.0.0");
    }
    #[test]
    fn einbauen_aktualisieren_entfernen() {
        let c = std::env::temp_dir().join(format!("lw-efb-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&c);
        fs::create_dir_all(&c).unwrap();
        let s = efb_app_aktion(Some(c.clone()), "pruefen");
        assert!(s.installiert.is_none());
        let s = efb_app_aktion(Some(c.clone()), "einbauen");
        assert!(s.geaendert && s.fehler.is_empty(), "{}", s.fehler);
        assert!(c.join(PAKET).join("html_ui/efb_ui/efb_apps/LeitWerkPilot/LeitWerkPilot.js").exists());
        let l = fs::read_to_string(c.join(PAKET).join("layout.json")).unwrap();
        assert!(l.contains("ContentInfo/leitwerk-efb-pilot/thumbnail.jpg"));
        assert!(!efb_app_aktion(Some(c.clone()), "einbauen").geaendert);
        // alte Version → Update
        fs::write(c.join(PAKET).join("manifest.json"), manifest("0.1.0")).unwrap();
        let s = efb_app_aktion(Some(c.clone()), "pruefen");
        assert_eq!(s.installiert.as_deref(), Some("0.1.0"));
        assert!(efb_app_aktion(Some(c.clone()), "einbauen").geaendert);
        assert!(efb_app_aktion(Some(c.clone()), "entfernen").geaendert);
        assert!(!c.join(PAKET).exists());
        // fremdes Paket bleibt
        fs::create_dir_all(c.join(PAKET)).unwrap();
        fs::write(c.join(PAKET).join("manifest.json"), r#"{"creator":"Jemand","package_version":"9"}"#).unwrap();
        let s = efb_app_aktion(Some(c.clone()), "entfernen");
        assert!(s.fremd && !s.fehler.is_empty() && c.join(PAKET).exists());
        let _ = fs::remove_dir_all(&c);
    }
}
