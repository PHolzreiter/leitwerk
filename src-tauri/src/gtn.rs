//! Spieler-NAH: Flugplan und Benutzer-Wegpunkte direkt für das PMS50 GTN750 (MSFS) bereitlegen.
//!
//! Das GTN750 (Premium) liest beim Import genau eine Datei: `fpl/gtn750/fpl.pln` in seinem Paket im
//! Community-Ordner; Benutzer-Wegpunkte aus `waypoints/gtn750/import.csv`. Den Community-Ordner findet
//! LeitWerk über die UserCfg.opt des Simulators (Store und Steam, MSFS 2024 und 2020) – oder der Pilot wählt ihn.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct GtnOrt {
    community: Option<String>,
    paket: Option<String>,
}

/// Community-Ordner aus den UserCfg.opt-Dateien (InstalledPackagesPath "…")
fn community_suchen() -> Vec<PathBuf> {
    let mut opts = Vec::new();
    if let Ok(l) = std::env::var("LOCALAPPDATA") {
        let l = PathBuf::from(l);
        opts.push(l.join("Packages").join("Microsoft.Limitless_8wekyb3d8bbwe").join("LocalCache").join("UserCfg.opt"));
        opts.push(l.join("Packages").join("Microsoft.FlightSimulator_8wekyb3d8bbwe").join("LocalCache").join("UserCfg.opt"));
    }
    if let Ok(a) = std::env::var("APPDATA") {
        let a = PathBuf::from(a);
        opts.push(a.join("Microsoft Flight Simulator 2024").join("UserCfg.opt"));
        opts.push(a.join("Microsoft Flight Simulator").join("UserCfg.opt"));
    }
    let mut l = Vec::new();
    for o in opts {
        let Ok(t) = fs::read_to_string(&o) else { continue };
        for z in t.lines() {
            let z = z.trim();
            if let Some(rest) = z.strip_prefix("InstalledPackagesPath") {
                let p = rest.trim().trim_matches('"');
                if !p.is_empty() {
                    let c = Path::new(p).join("Community");
                    if c.is_dir() && !l.contains(&c) {
                        l.push(c);
                    }
                }
            }
        }
    }
    l
}

/// GTN750-Paket im Community-Ordner (Name beginnt mit pms50-instrument-gtn750 o. ä.)
fn paket_in(community: &Path) -> Option<PathBuf> {
    let rd = fs::read_dir(community).ok()?;
    let mut kandidaten: Vec<PathBuf> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .filter(|p| {
            let n = p.file_name().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
            n.contains("pms50") && n.contains("gtn750")
        })
        .collect();
    kandidaten.sort();
    kandidaten.into_iter().next()
}

fn finden(gewaehlt: Option<&str>) -> (Option<PathBuf>, Option<PathBuf>) {
    let communities: Vec<PathBuf> = match gewaehlt.filter(|g| !g.trim().is_empty()) {
        Some(g) => vec![PathBuf::from(g)],
        None => community_suchen(),
    };
    for c in &communities {
        if let Some(p) = paket_in(c) {
            return (Some(c.clone()), Some(p));
        }
    }
    (communities.into_iter().next(), None)
}

/// Wo liegt das GTN750? (für die Anzeige im Piloten-Interface)
#[tauri::command]
pub fn gtn_suchen(community: Option<String>) -> GtnOrt {
    let (c, p) = finden(community.as_deref());
    GtnOrt { community: c.map(|x| x.display().to_string()), paket: p.map(|x| x.display().to_string()) }
}

/// Flugplan (PLN) und Benutzer-Wegpunkte (CSV) ins GTN750-Paket schreiben
#[tauri::command]
pub fn gtn_schreiben(community: Option<String>, pln: String, wegpunkte: String) -> Result<String, String> {
    let (_, paket) = finden(community.as_deref());
    let paket = paket.ok_or("PMS50 GTN750 im Community-Ordner nicht gefunden")?;
    let fpl = paket.join("fpl").join("gtn750");
    fs::create_dir_all(&fpl).map_err(|e| format!("Ordner {} nicht anlegbar: {e}", fpl.display()))?;
    fs::write(fpl.join("fpl.pln"), pln.as_bytes()).map_err(|e| format!("fpl.pln nicht schreibbar: {e}"))?;
    if !wegpunkte.trim().is_empty() {
        let wp = paket.join("waypoints").join("gtn750");
        fs::create_dir_all(&wp).map_err(|e| e.to_string())?;
        fs::write(wp.join("import.csv"), wegpunkte.as_bytes()).map_err(|e| format!("import.csv nicht schreibbar: {e}"))?;
    }
    Ok(fpl.join("fpl.pln").display().to_string())
}
