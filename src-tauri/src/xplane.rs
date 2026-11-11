//! Brücke zu X-Plane 12 für den Spieler-NAH (Paul 10.11.2026: „egal ob MSFS oder X-Plane läuft“).
//!
//! X-Plane 12 hat ab 12.1.1 einen eingebauten Webserver (nur auf diesem Rechner, Standard-Port 8086):
//! `GET /api/capabilities` (Version), `GET /api/v3/datarefs?filter[name]=…` (ID zum Namen, gilt nur für die
//! laufende X-Plane-Sitzung) und `GET /api/v3/datarefs/{id}/value` → `{"data": …}`.
//! Gelesen werden dieselben Werte wie beim MSFS (Position, Höhe, Höhe über Grund, Kurs, Geschwindigkeit,
//! am Boden, Triebwerk an) – einmal pro Sekunde, als Ereignis „xplane-daten“. Den Zustand meldet „xplane-status“.
//! Kein Plugin nötig. In X-Plane darf „Disable Incoming Traffic“ nicht eingeschaltet sein (sonst 403).
//!
//! Zum Testen: Umgebungsvariable LEITWERK_XPLANE auf „host:port“ einer Attrappe setzen.

use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
struct XpStatus {
    zustand: String,
    text: String,
    version: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct XpDaten {
    pub lat: f64,
    pub lon: f64,
    pub hoehe: f64,
    pub agl: f64,
    pub kurs: f64,
    pub kts: f64,
    pub am_boden: bool,
    pub motor: bool,
}

/// Datarefs (X-Plane 12): Breite/Länge (Grad), Höhe MSL (m), Höhe über Grund (m), wahrer Kurs (Grad),
/// Geschwindigkeit über Grund (m/s), am Boden (0/1), Triebwerke laufen (Feld 0/1)
const NAMEN: [&str; 8] = [
    "sim/flightmodel/position/latitude",
    "sim/flightmodel/position/longitude",
    "sim/flightmodel/position/elevation",
    "sim/flightmodel/position/y_agl",
    "sim/flightmodel/position/psi",
    "sim/flightmodel/position/groundspeed",
    "sim/flightmodel/failures/onground_any",
    "sim/flightmodel/engine/ENGN_running",
];

static LAEUFT: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

fn status(app: &AppHandle, zustand: &str, text: &str, version: Option<&str>) {
    let _ = app.emit("xplane-status", XpStatus { zustand: zustand.into(), text: text.into(), version: version.map(Into::into) });
}

fn adresse() -> SocketAddr {
    std::env::var("LEITWERK_XPLANE")
        .ok()
        .and_then(|a| a.to_socket_addrs().ok()?.next())
        .unwrap_or_else(|| SocketAddr::from(([127, 0, 0, 1], 8086)))
}

/// Einfaches GET an den Webserver von X-Plane (HTTP/1.1, Connection: close, auch „chunked“)
fn get(pfad: &str) -> Result<(u16, String), String> {
    anfrage("GET", pfad, None)
}

fn anfrage(methode: &str, pfad: &str, rumpf: Option<&str>) -> Result<(u16, String), String> {
    let mut s = TcpStream::connect_timeout(&adresse(), Duration::from_millis(800)).map_err(|e| e.to_string())?;
    s.set_read_timeout(Some(Duration::from_secs(5))).ok();
    s.set_write_timeout(Some(Duration::from_secs(3))).ok();
    let r = rumpf.unwrap_or("");
    let extra = if rumpf.is_some() { format!("Content-Type: application/json\r\nContent-Length: {}\r\n", r.len()) } else { String::new() };
    write!(s, "{methode} {pfad} HTTP/1.1\r\nHost: localhost\r\nAccept: application/json\r\n{extra}Connection: close\r\n\r\n{r}").map_err(|e| e.to_string())?;
    let mut roh = Vec::new();
    s.read_to_end(&mut roh).map_err(|e| e.to_string())?;
    antwort_lesen(&roh)
}

fn antwort_lesen(roh: &[u8]) -> Result<(u16, String), String> {
    let text = String::from_utf8_lossy(roh);
    let (kopf, rumpf) = text.split_once("\r\n\r\n").ok_or("unvollständige Antwort")?;
    let code: u16 = kopf.split_whitespace().nth(1).and_then(|c| c.parse().ok()).ok_or("keine HTTP-Antwort")?;
    let chunked = kopf.to_ascii_lowercase().contains("transfer-encoding: chunked");
    let rumpf = if chunked { entchunken(rumpf) } else { rumpf.to_string() };
    Ok((code, rumpf))
}

fn entchunken(mut r: &str) -> String {
    let mut out = String::new();
    loop {
        let Some((laenge, rest)) = r.split_once("\r\n") else { break };
        let n = usize::from_str_radix(laenge.trim().split(';').next().unwrap_or("0"), 16).unwrap_or(0);
        if n == 0 || rest.len() < n {
            break;
        }
        out.push_str(&rest[..n]);
        r = rest[n..].trim_start_matches("\r\n");
    }
    out
}

fn kodieren(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Version aus /api/capabilities (z. B. „12.4.0“); Fehlertext bei 403 (eingehender Verkehr gesperrt)
fn version() -> Result<Option<String>, String> {
    let (code, rumpf) = get("/api/capabilities")?;
    if code == 403 {
        return Err("X-Plane sperrt die Verbindung – in X-Plane unter Einstellungen „Disable Incoming Traffic“ ausschalten".into());
    }
    if code != 200 {
        return Err(format!("X-Plane antwortet mit {code}"));
    }
    let v: serde_json::Value = serde_json::from_str(&rumpf).map_err(|e| e.to_string())?;
    if !v["api"]["versions"].as_array().is_some_and(|l| l.iter().any(|x| x == "v3" || x == "v2")) {
        return Err("Diese X-Plane-Version ist zu alt – bitte X-Plane 12 auf den neuesten Stand bringen".into());
    }
    Ok(v["x-plane"]["version"].as_str().map(Into::into))
}

/// IDs der Datarefs (nur gültig, solange X-Plane läuft); None = noch kein Flug geladen
fn ids() -> Result<Option<Vec<u64>>, String> {
    let q: Vec<String> = NAMEN.iter().map(|n| format!("filter%5Bname%5D={}", kodieren(n))).collect();
    let (code, rumpf) = get(&format!("/api/v3/datarefs?{}&fields=id,name", q.join("&")))?;
    if code == 404 {
        return Ok(None);
    }
    if code != 200 {
        return Err(format!("X-Plane: Datarefs nicht lesbar ({code})"));
    }
    let v: serde_json::Value = serde_json::from_str(&rumpf).map_err(|e| e.to_string())?;
    let liste = v["data"].as_array().ok_or("X-Plane: unerwartete Antwort")?;
    let mut out = Vec::new();
    for n in NAMEN {
        match liste.iter().find(|x| x["name"] == n).and_then(|x| x["id"].as_u64()) {
            Some(id) => out.push(id),
            None => return Ok(None),
        }
    }
    Ok(Some(out))
}

fn wert(id: u64) -> Result<serde_json::Value, String> {
    let (code, rumpf) = get(&format!("/api/v3/datarefs/{id}/value"))?;
    if code != 200 {
        return Err(format!("Wert {id}: {code}"));
    }
    let v: serde_json::Value = serde_json::from_str(&rumpf).map_err(|e| e.to_string())?;
    Ok(v["data"].clone())
}

/// Werte (in der Reihenfolge von NAMEN) in die Flugdaten umrechnen
pub fn umrechnen(w: &[serde_json::Value]) -> Option<XpDaten> {
    let f = |i: usize| w.get(i).and_then(|x| x.as_f64());
    let motor = match w.get(7) {
        Some(serde_json::Value::Array(a)) => a.iter().any(|x| x.as_f64().unwrap_or(0.0) > 0.5),
        Some(x) => x.as_f64().unwrap_or(0.0) > 0.5,
        None => false,
    };
    let lat = f(0)?;
    let lon = f(1)?;
    if !lat.is_finite() || !lon.is_finite() || (lat == 0.0 && lon == 0.0) {
        return None;
    }
    Some(XpDaten {
        lat,
        lon,
        hoehe: f(2).unwrap_or(0.0) * 3.28084,
        agl: f(3).unwrap_or(0.0) * 3.28084,
        kurs: f(4).unwrap_or(0.0).rem_euclid(360.0),
        kts: f(5).unwrap_or(0.0) * 1.943_844,
        am_boden: f(6).unwrap_or(0.0) > 0.5,
        motor,
    })
}

/// Eine Sitzung: Ok(false) = X-Plane läuft nicht; Ok(true) = war verbunden und ist jetzt weg
fn sitzung(app: &AppHandle, stop: &AtomicBool) -> Result<bool, String> {
    let v = match version() {
        Ok(v) => v,
        Err(e) if e.contains("Disable") || e.contains("zu alt") || e.contains("antwortet") => return Err(e),
        Err(_) => return Ok(false),
    };
    let name = format!("X-Plane {}", v.as_deref().unwrap_or("12"));
    let mut ids_jetzt: Option<Vec<u64>> = None;
    let mut gemeldet = "";
    while !stop.load(Ordering::SeqCst) {
        if ids_jetzt.is_none() {
            ids_jetzt = match ids() {
                Ok(x) => x,
                Err(_) => return Ok(true),
            };
            if ids_jetzt.is_none() && gemeldet != "kein" {
                status(app, "wartet", &format!("{name} läuft – Flug laden"), v.as_deref());
                gemeldet = "kein";
            }
        }
        if let Some(l) = &ids_jetzt {
            let mut werte = Vec::with_capacity(l.len());
            let mut ok = true;
            for id in l {
                match wert(*id) {
                    Ok(x) => werte.push(x),
                    Err(_) => {
                        ok = false;
                        break;
                    }
                }
            }
            if !ok {
                // X-Plane neu gestartet oder Flug beendet: IDs neu holen (bzw. Verbindung weg)
                if version().is_err() {
                    return Ok(true);
                }
                ids_jetzt = None;
                continue;
            }
            if let Some(d) = umrechnen(&werte) {
                if gemeldet != "da" {
                    status(app, "verbunden", &format!("Mit {name} verbunden"), v.as_deref());
                    gemeldet = "da";
                }
                let _ = app.emit("xplane-daten", d);
            }
        }
        for _ in 0..10 {
            if stop.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    Ok(true)
}

/// Sucht laufend nach X-Plane 12 und liest die Flugdaten (bis xplane_stoppen)
#[tauri::command]
pub fn xplane_starten(app: AppHandle) {
    xplane_stoppen();
    let stop = Arc::new(AtomicBool::new(false));
    if let Ok(mut g) = LAEUFT.lock() {
        *g = Some(stop.clone());
    }
    std::thread::spawn(move || {
        let mut gemeldet = false;
        while !stop.load(Ordering::SeqCst) {
            match sitzung(&app, &stop) {
                Ok(true) => gemeldet = false,
                Ok(false) => {
                    if !gemeldet {
                        status(&app, "wartet", "Warte auf X-Plane 12", None);
                        gemeldet = true;
                    }
                }
                Err(e) => {
                    status(&app, "fehler", &e, None);
                    gemeldet = false;
                }
            }
            for _ in 0..30 {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
        status(&app, "aus", "", None);
    });
}

/// Laufenden Flug in X-Plane ändern (Teil der „Flight Initialization“-Struktur: Uhrzeit, Wetter):
/// PATCH /api/v3/flight. Fehlertext mit der Antwort von X-Plane.
#[tauri::command]
pub async fn xplane_flug(json: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (code, rumpf) = anfrage("PATCH", "/api/v3/flight", Some(&json))?;
        if code == 200 {
            Ok(())
        } else {
            Err(format!("X-Plane lehnt ab ({code}): {}", rumpf.chars().take(200).collect::<String>()))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Ordner von X-Plane 12 (X-Plane schreibt ihn in x-plane_install_12.txt im Benutzerordner)
pub(crate) fn xplane_ordner() -> Option<std::path::PathBuf> {
    let mut kandidaten = Vec::new();
    if let Ok(l) = std::env::var("LOCALAPPDATA") {
        kandidaten.push(std::path::PathBuf::from(l).join("x-plane_install_12.txt"));
    }
    if let Ok(h) = std::env::var("HOME") {
        let h = std::path::PathBuf::from(h);
        kandidaten.push(h.join("Library/Preferences/x-plane_install_12.txt"));
        kandidaten.push(h.join(".x-plane/x-plane_install_12.txt"));
    }
    for k in kandidaten {
        let Ok(text) = std::fs::read_to_string(&k) else { continue };
        for zeile in text.lines() {
            let p = std::path::PathBuf::from(zeile.trim());
            if !zeile.trim().is_empty() && p.join("Output").is_dir() {
                return Some(p);
            }
        }
    }
    None
}

/// Datei mit festem Namen neu schreiben: vorher löschen, damit auch die Schreibweise stimmt
/// (Windows behält sonst den alten Namen, z. B. „LEITWERK.gfp“ statt „Leitwerk.gfp“)
fn fest_schreiben(ordner: &std::path::Path, name: &str, alte: &[&str], inhalt: &str) -> Result<std::path::PathBuf, String> {
    for a in alte.iter().chain(std::iter::once(&name)) {
        let _ = std::fs::remove_file(ordner.join(a));
    }
    let datei = ordner.join(name);
    std::fs::write(&datei, inhalt).map_err(|e| format!("Flugplan nicht schreibbar: {e}"))?;
    Ok(datei)
}

/// Flugplan „Leitwerk.fms“ in X-Plane/Output/FMS plans schreiben (immer derselbe Name: neuer Einsatz oder neues
/// Ziel überschreibt ihn); alte Pläne von LeitWerk („LeitWerk_….fms“) werden dabei entfernt.
/// None = X-Plane-Ordner nicht gefunden
#[tauri::command]
pub fn xplane_fms(inhalt: String) -> Result<Option<String>, String> {
    let Some(x) = xplane_ordner() else { return Ok(None) };
    let ordner = x.join("Output").join("FMS plans");
    std::fs::create_dir_all(&ordner).map_err(|e| e.to_string())?;
    if let Ok(rd) = std::fs::read_dir(&ordner) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with("LeitWerk_") && n.to_ascii_lowercase().ends_with(".fms") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    let datei = fest_schreiben(&ordner, "Leitwerk.fms", &["LeitWerk.fms", "LEITWERK.fms"], &inhalt)?;
    Ok(Some(datei.display().to_string()))
}

/// ID eines Datarefs nach Namen (Zwischenspeicher je X-Plane-Sitzung; leert sich, wenn X-Plane neu startet)
static ID_CACHE: Mutex<Option<std::collections::HashMap<String, u64>>> = Mutex::new(None);

fn dataref_id(name: &str) -> Result<Option<u64>, String> {
    if let Some(id) = ID_CACHE.lock().ok().and_then(|c| c.as_ref().and_then(|m| m.get(name).copied())) {
        return Ok(Some(id));
    }
    let (code, rumpf) = get(&format!("/api/v3/datarefs?filter%5Bname%5D={}&fields=id,name", kodieren(name)))?;
    if code == 404 {
        return Ok(None);
    }
    if code != 200 {
        return Err(format!("X-Plane: {name} nicht lesbar ({code})"));
    }
    let v: serde_json::Value = serde_json::from_str(&rumpf).map_err(|e| e.to_string())?;
    let id = v["data"].as_array().and_then(|l| l.iter().find(|x| x["name"] == name)).and_then(|x| x["id"].as_u64());
    if let (Some(id), Ok(mut c)) = (id, ID_CACHE.lock()) {
        c.get_or_insert_with(Default::default).insert(name.to_string(), id);
    }
    Ok(id)
}

/// Werte von Datarefs lesen (Name → Wert; fehlende Namen fehlen im Ergebnis)
#[tauri::command]
pub async fn xplane_lesen(namen: Vec<String>) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = serde_json::Map::new();
        for n in namen {
            let Some(id) = dataref_id(&n)? else { continue };
            let (code, rumpf) = get(&format!("/api/v3/datarefs/{id}/value"))?;
            if code == 404 {
                // X-Plane neu gestartet: IDs ungültig
                if let Ok(mut c) = ID_CACHE.lock() {
                    *c = None;
                }
                continue;
            }
            if code == 200 {
                let v: serde_json::Value = serde_json::from_str(&rumpf).map_err(|e| e.to_string())?;
                out.insert(n, v["data"].clone());
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Datarefs schreiben: (Name, Index oder None für ganzen Wert/Feld, Wert). Ergebnis: Fehler je Name (leer = alles gut)
#[tauri::command]
pub async fn xplane_schreiben(werte: Vec<(String, Option<u32>, serde_json::Value)>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut fehler = Vec::new();
        for (n, index, wert) in werte {
            let Some(id) = dataref_id(&n)? else {
                fehler.push(format!("{n}: gibt es nicht"));
                continue;
            };
            let pfad = match index {
                Some(i) => format!("/api/v3/datarefs/{id}/value?index={i}"),
                None => format!("/api/v3/datarefs/{id}/value"),
            };
            let rumpf = serde_json::json!({ "data": wert }).to_string();
            let (code, antwort) = anfrage("PATCH", &pfad, Some(&rumpf))?;
            if code == 404 {
                if let Ok(mut c) = ID_CACHE.lock() {
                    *c = None;
                }
            }
            if code != 200 {
                fehler.push(format!("{n}{}: {code} {}", index.map(|i| format!("[{i}]")).unwrap_or_default(), antwort.chars().take(120).collect::<String>()));
            }
        }
        Ok(fehler)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Alle Datarefs, deren Name mit `anfang` beginnt (Test: welche Wetter-Werte gibt es in dieser X-Plane-Version?)
#[tauri::command]
pub async fn xplane_suchen(anfang: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (code, rumpf) = get("/api/v3/datarefs?fields=name,value_type,is_writable")?;
        if code != 200 {
            return Err(format!("X-Plane: Liste nicht lesbar ({code})"));
        }
        let v: serde_json::Value = serde_json::from_str(&rumpf).map_err(|e| e.to_string())?;
        Ok(v["data"]
            .as_array()
            .map(|l| {
                l.iter()
                    .filter(|x| x["name"].as_str().is_some_and(|n| n.starts_with(&anfang)))
                    .map(|x| format!("{} ({}{})", x["name"].as_str().unwrap_or(""), x["value_type"].as_str().unwrap_or(""), if x["is_writable"] == true { ", schreibbar" } else { "" }))
                    .collect()
            })
            .unwrap_or_default())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Ordner, aus denen GTN (Reality XP, Garmin-Trainer) Flugpläne lädt: FPLN im Trainer-Datenordner
fn gtn_fpln_ordner() -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    if let Ok(d) = std::env::var("GTNSIMDATA") {
        out.push(std::path::PathBuf::from(d).join("FPLN"));
    }
    let pd = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".into());
    let pd = std::path::PathBuf::from(pd);
    out.push(pd.join("Garmin").join("Trainers").join("GTN").join("FPLN"));
    out.push(pd.join("Garmin").join("GTN Trainer Data").join("GTN").join("FPLN"));
    out
}

/// Flugplan „Leitwerk.gfp“ für das GTN 750/650 und GNS 430/530 (Reality XP) – in jeden vorhandenen FPLN-Ordner.
/// Immer derselbe Name: ein neuer Einsatz oder ein gebuchter Zielort überschreibt ihn.
/// Ergebnis: geschriebene Pfade (leer = kein Garmin-Trainer gefunden)
#[tauri::command]
pub fn gtn_gfp(inhalt: String) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for ordner in gtn_fpln_ordner() {
        // nur dort, wo der Trainer-Ordner (GTN) schon existiert – FPLN selbst darf fehlen
        let Some(gtn) = ordner.parent() else { continue };
        if !gtn.is_dir() {
            continue;
        }
        std::fs::create_dir_all(&ordner).map_err(|e| e.to_string())?;
        let datei = fest_schreiben(&ordner, "Leitwerk.gfp", &["LEITWERK.gfp", "LeitWerk.gfp"], &inhalt)
            .map_err(|e| format!("GTN-{e}"))?;
        out.push(datei.display().to_string());
    }
    Ok(out)
}

#[tauri::command]
pub fn xplane_stoppen() {
    if let Ok(mut g) = LAEUFT.lock() {
        if let Some(s) = g.take() {
            s.store(true, Ordering::SeqCst);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn umrechnen_werte() {
        let w: Vec<serde_json::Value> = serde_json::from_str("[48.2, 16.3, 300.0, 10.0, -90.0, 10.0, 1, [0, 1]]").unwrap();
        let d = umrechnen(&w).unwrap();
        assert!((d.hoehe - 984.25).abs() < 0.1 && (d.kurs - 270.0).abs() < 1e-9 && (d.kts - 19.44).abs() < 0.01);
        assert!(d.am_boden && d.motor);
        let leer: Vec<serde_json::Value> = serde_json::from_str("[0, 0, 0, 0, 0, 0, 0, [0]]").unwrap();
        assert!(umrechnen(&leer).is_none());
    }
    #[test]
    fn http_antworten() {
        let roh = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n{\"dat\r\n6\r\na\": 1}\r\n0\r\n\r\n";
        assert_eq!(antwort_lesen(roh).unwrap(), (200, "{\"data\": 1}".to_string()));
        let roh2 = b"HTTP/1.1 404 Not Found\r\nContent-Length: 2\r\n\r\n{}";
        assert_eq!(antwort_lesen(roh2).unwrap(), (404, "{}".to_string()));
        assert_eq!(kodieren("sim/a_b"), "sim%2Fa_b");
    }
}

// ------------------------------------------------------------------ Plugin „LeitWerk“ (Tablet in X-Plane, auch in VR)

/// Das Plugin für dieses Betriebssystem (leer, wenn es beim Bauen nicht dabei war)
const PLUGIN: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/LeitWerk.xpl"));
const PLUGIN_VERSION: &str = env!("LEITWERK_XP_PLUGIN_VERSION");

#[cfg(target_os = "windows")]
const PLUGIN_ORDNER: &str = "win_x64";
#[cfg(target_os = "macos")]
const PLUGIN_ORDNER: &str = "mac_x64";
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
const PLUGIN_ORDNER: &str = "lin_x64";

#[derive(serde::Serialize, Default)]
pub struct PluginStand {
    /// X-Plane-Ordner (None = nicht gefunden)
    ordner: Option<String>,
    /// Plugin liegt in X-Plane (aktuelle Version)
    aktuell: bool,
    /// gerade eingebaut oder erneuert
    neu: bool,
    /// X-Plane lief dabei (alte Datei war belegt) – wirkt nach dem nächsten Start
    neustart: bool,
    /// In LeitWerk mitgeliefert (sonst kann es nicht eingebaut werden)
    mitgeliefert: bool,
    version: String,
    fehler: Option<String>,
}

/// Plugin prüfen und (wenn `einbauen`) einbauen bzw. erneuern: X-Plane 12/Resources/plugins/LeitWerk
/// mit <plattform>/LeitWerk.xpl und schrift/inter-*.ttf. Entfernen mit `entfernen`.
#[tauri::command]
pub fn xplane_plugin(einbauen: bool, entfernen: Option<bool>) -> PluginStand {
    let mut st = PluginStand { mitgeliefert: !PLUGIN.is_empty(), version: PLUGIN_VERSION.into(), ..Default::default() };
    let Some(x) = xplane_ordner() else { return st };
    st.ordner = Some(x.display().to_string());
    let basis = x.join("Resources").join("plugins").join("LeitWerk");
    let xpl = basis.join(PLUGIN_ORDNER).join("LeitWerk.xpl");
    if entfernen == Some(true) {
        // Datei kann belegt sein (X-Plane läuft): dann nur umbenennen, X-Plane lädt sie beim nächsten Start nicht mehr
        if xpl.exists() && std::fs::remove_file(&xpl).is_err() {
            let _ = std::fs::rename(&xpl, xpl.with_extension("xpl.alt"));
            st.neustart = true;
        }
        let _ = std::fs::remove_dir_all(basis.join("schrift"));
        return st;
    }
    let vorhanden = std::fs::read(&xpl).ok();
    st.aktuell = !PLUGIN.is_empty() && vorhanden.as_deref() == Some(PLUGIN);
    if !einbauen || st.aktuell || PLUGIN.is_empty() {
        return st;
    }
    let schreiben = || -> Result<bool, String> {
        std::fs::create_dir_all(basis.join(PLUGIN_ORDNER)).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(basis.join("schrift")).map_err(|e| e.to_string())?;
        for (n, b) in [("inter-400.ttf", crate::handy::SCHRIFT_400), ("inter-600.ttf", crate::handy::SCHRIFT_600), ("inter-700.ttf", crate::handy::SCHRIFT_700)] {
            let p = basis.join("schrift").join(n);
            if std::fs::read(&p).ok().as_deref() != Some(b) {
                std::fs::write(&p, b).map_err(|e| e.to_string())?;
            }
        }
        // alte, umbenannte Dateien aufräumen (gehen nur, wenn X-Plane sie nicht mehr geladen hat)
        if let Ok(rd) = std::fs::read_dir(basis.join(PLUGIN_ORDNER)) {
            for e in rd.flatten() {
                if e.file_name().to_string_lossy().contains(".alt") {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
        let mut belegt = false;
        if std::fs::write(&xpl, PLUGIN).is_err() {
            // unter Windows ist die geladene Datei gesperrt, umbenennen geht aber
            let alt = xpl.with_extension(format!("xpl.alt{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)));
            std::fs::rename(&xpl, &alt).map_err(|e| format!("Plugin-Datei belegt ({e}) – bitte X-Plane beenden und erneut versuchen"))?;
            std::fs::write(&xpl, PLUGIN).map_err(|e| e.to_string())?;
            belegt = true;
        }
        let _ = std::fs::write(basis.join("version.txt"), PLUGIN_VERSION);
        Ok(belegt)
    };
    match schreiben() {
        Ok(belegt) => {
            st.aktuell = true;
            st.neu = true;
            st.neustart = belegt;
        }
        Err(e) => st.fehler = Some(format!("X-Plane-Plugin: {e}")),
    }
    st
}
