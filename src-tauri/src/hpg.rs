//! Spieler-NAH mit der HPG H145: LeitWerk spielt den „Mission Server“ des H145-Missionssystems.
//!
//! Die H145 (Missions-App am Tablet) verbindet sich per WebSocket mit `localhost:40510`, sobald der
//! Pilot dort die Mission „LeitWerk Leitstelle“ wählt. Sie meldet sich mit `{"control_msg":"hello"}`;
//! LeitWerk schickt jederzeit `{"load_mission": …}` oder `{"exec_commands": […]}`, die H145 meldet
//! Knopfdrücke als `{"remote_notify": …}` zurück. Hier nur der Transport – was geschickt wird, baut die
//! Oberfläche (Ereignisse „hpg-nachricht“ und „hpg-status“, Befehl hpg_senden).
//! Dazu: die Missions-Datei im hpgmission-Ordner der H145 anlegen (hpg_einrichten).

use serde::Serialize;
use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tungstenite::{Error as WsError, Message};

const PORT: u16 = 40510;

static GESTARTET: Mutex<bool> = Mutex::new(false);
static SENDER: Mutex<Option<Sender<String>>> = Mutex::new(None);
static GENERATION: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Clone)]
struct HpgStatus {
    /// lauscht | verbunden | getrennt | fehler
    zustand: String,
    text: String,
}

fn status(app: &AppHandle, zustand: &str, text: &str) {
    let _ = app.emit("hpg-status", HpgStatus { zustand: zustand.into(), text: text.into() });
}

/// Startet den Missions-Server (einmal pro Programmstart; weitere Aufrufe melden nur den Zustand)
#[tauri::command]
pub fn hpg_starten(app: AppHandle) -> Result<(), String> {
    let mut g = GESTARTET.lock().map_err(|e| e.to_string())?;
    if *g {
        let verbunden = SENDER.lock().map(|s| s.is_some()).unwrap_or(false);
        status(&app, if verbunden { "verbunden" } else { "lauscht" }, if verbunden { "H145 verbunden" } else { "Warte auf die H145" });
        return Ok(());
    }
    let listener = TcpListener::bind(("127.0.0.1", PORT))
        .map_err(|e| format!("Port {PORT} ist belegt (läuft der Scenario Editor?): {e}"))?;
    *g = true;
    status(&app, "lauscht", "Warte auf die H145 (Missions-App → LeitWerk Leitstelle)");
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let app = app.clone();
            std::thread::spawn(move || verbindung(stream, app));
        }
    });
    Ok(())
}

fn verbindung(stream: std::net::TcpStream, app: AppHandle) {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(100)));
    let mut ws = match tungstenite::accept(stream) {
        Ok(ws) => ws,
        Err(e) => {
            status(&app, "fehler", &format!("Verbindung der H145 fehlgeschlagen: {e}"));
            return;
        }
    };
    // die neueste Verbindung gilt (Missions-App neu geöffnet)
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let (tx, rx) = channel::<String>();
    if let Ok(mut s) = SENDER.lock() {
        *s = Some(tx);
    }
    status(&app, "verbunden", "H145 verbunden");
    loop {
        if GENERATION.load(Ordering::SeqCst) != gen {
            let _ = ws.close(None);
            break;
        }
        match ws.read() {
            Ok(Message::Text(t)) => {
                let _ = app.emit("hpg-nachricht", t.to_string());
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(WsError::Io(e)) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => break,
        }
        let mut weg = false;
        while let Ok(m) = rx.try_recv() {
            if ws.send(Message::text(m)).is_err() {
                weg = true;
                break;
            }
        }
        if weg {
            break;
        }
    }
    if GENERATION.load(Ordering::SeqCst) == gen {
        if let Ok(mut s) = SENDER.lock() {
            *s = None;
        }
        status(&app, "getrennt", "H145 getrennt – in der Missions-App „LeitWerk Leitstelle“ wählen");
    }
}

/// Nachricht an die H145 (JSON-Text); Fehler, wenn keine verbunden ist
#[tauri::command]
pub fn hpg_senden(json: String) -> Result<(), String> {
    let s = SENDER.lock().map_err(|e| e.to_string())?;
    let tx = s.as_ref().ok_or("H145 nicht verbunden")?;
    tx.send(json).map_err(|_| "H145 nicht verbunden".to_string())
}

#[derive(Serialize)]
pub struct HpgOrt {
    paket: Option<String>,
    mission: Option<String>,
}

fn h145_in(community: &Path) -> Option<PathBuf> {
    let p = community.join("hpg-airbus-h145");
    p.is_dir().then_some(p)
}

/// Legt die Mission „LeitWerk Leitstelle“ im hpgmission-Ordner der H145 an und startet „Update Mission Index“
#[tauri::command]
pub fn hpg_einrichten(community: Option<String>, index: bool) -> Result<HpgOrt, String> {
    let communities: Vec<PathBuf> = match community.filter(|c| !c.trim().is_empty()) {
        Some(c) => vec![PathBuf::from(c)],
        None => crate::gtn::communities(),
    };
    let paket = communities.iter().find_map(|c| h145_in(c)).ok_or("HPG H145 im Community-Ordner nicht gefunden")?;
    let ordner = paket.join("hpgmission");
    fs::create_dir_all(&ordner).map_err(|e| e.to_string())?;
    let datei = ordner.join("LeitWerk Leitstelle.json");
    let inhalt = format!(
        "{{\n  \"title\": \"LeitWerk Leitstelle\",\n  \"aircraft\": [\"H145\"],\n  \"api_version\": 0.1,\n  \"url\": \"localhost:{PORT}\"\n}}\n"
    );
    let neu = fs::read_to_string(&datei).map(|alt| alt != inhalt).unwrap_or(true);
    if neu {
        fs::write(&datei, inhalt).map_err(|e| format!("Missions-Datei nicht schreibbar: {e}"))?;
    }
    if index || neu {
        let cmd = paket.join("Tools").join("Update Mission Index.cmd");
        if cmd.exists() {
            #[cfg(windows)]
            {
                let _ = std::process::Command::new("cmd").arg("/C").arg(&cmd).current_dir(paket.join("Tools")).spawn();
            }
        }
    }
    Ok(HpgOrt { paket: Some(paket.display().to_string()), mission: Some(datei.display().to_string()) })
}

/// Wo liegt die H145, und ist die Mission schon angelegt?
#[tauri::command]
pub fn hpg_suchen(community: Option<String>) -> HpgOrt {
    let communities: Vec<PathBuf> = match community.filter(|c| !c.trim().is_empty()) {
        Some(c) => vec![PathBuf::from(c)],
        None => crate::gtn::communities(),
    };
    let paket = communities.iter().find_map(|c| h145_in(c));
    let mission = paket.as_ref().map(|p| p.join("hpgmission").join("LeitWerk Leitstelle.json")).filter(|m| m.exists());
    HpgOrt { paket: paket.map(|p| p.display().to_string()), mission: mission.map(|m| m.display().to_string()) }
}

// ---------------------------------------------------------------- LeitWerk im Tablet der H145

const BROWSER_DATEI: &str = "html_ui/HPGH145-User/Tablet/WebBrowserApp.json";
const LINK_TITEL: &str = "LeitWerk";

/// Windows-Dateizeit (100 ns seit 1601) – so steht das Datum in der layout.json von MSFS
fn dateizeit_jetzt() -> u64 {
    let s = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() / 100).unwrap_or(0) as u64;
    s + 116_444_736_000_000_000
}

/// Ist der Link in der neuen Datei schon so, wie er sein soll?
fn browser_json_mit_link(alt: Option<&str>, url: &str) -> Result<(String, bool), String> {
    let mut v: serde_json::Value = match alt {
        Some(t) if !t.trim().is_empty() => serde_json::from_str(t.trim_start_matches('\u{feff}')).map_err(|e| format!("WebBrowserApp.json ist kein gültiges JSON: {e}"))?,
        _ => serde_json::json!({ "Links": [] }),
    };
    let obj = v.as_object_mut().ok_or("WebBrowserApp.json: unerwarteter Aufbau")?;
    let links = obj.entry("Links").or_insert_with(|| serde_json::json!([]));
    let arr = links.as_array_mut().ok_or("WebBrowserApp.json: „Links“ ist keine Liste")?;
    let soll = serde_json::json!({ "Url": url, "Title": LINK_TITEL });
    if arr.first() == Some(&soll) && arr.iter().filter(|l| l.get("Title").and_then(|t| t.as_str()) == Some(LINK_TITEL)).count() == 1 {
        return Ok((String::new(), false));
    }
    // alte LeitWerk-Einträge (anderer Port) entfernen, unseren nach vorne
    arr.retain(|l| l.get("Title").and_then(|t| t.as_str()) != Some(LINK_TITEL));
    arr.insert(0, soll);
    Ok((serde_json::to_string_pretty(&v).map_err(|e| e.to_string())? + "\n", true))
}

/// Datei in der layout.json des Pakets eintragen (Größe, Datum), sonst sieht MSFS die Änderung nicht
fn layout_nachtragen(paket: &Path, rel: &str, groesse: u64) -> Result<(), String> {
    let datei = paket.join("layout.json");
    let text = fs::read_to_string(&datei).map_err(|e| format!("layout.json nicht lesbar: {e}"))?;
    let mut v: serde_json::Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e| format!("layout.json: {e}"))?;
    let content = v.get_mut("content").and_then(|c| c.as_array_mut()).ok_or("layout.json: kein „content“")?;
    let norm = |p: &str| p.replace('\\', "/").to_lowercase();
    let ziel = norm(rel);
    let eintrag = serde_json::json!({ "path": rel, "size": groesse, "date": dateizeit_jetzt() });
    match content.iter_mut().find(|e| e.get("path").and_then(|p| p.as_str()).map(norm).as_deref() == Some(ziel.as_str())) {
        Some(e) => {
            e["size"] = serde_json::json!(groesse);
            e["date"] = serde_json::json!(dateizeit_jetzt());
        }
        None => content.push(eintrag),
    }
    let sicherung = paket.join("layout.json.vor-leitwerk");
    if !sicherung.exists() {
        let _ = fs::write(&sicherung, &text);
    }
    fs::write(&datei, serde_json::to_string_pretty(&v).map_err(|e| e.to_string())? + "\n").map_err(|e| format!("layout.json nicht schreibbar: {e}"))
}

/// Trägt „LeitWerk“ (http://127.0.0.1:<port>/efb) in die Web-Browser-App des H145-Tablets ein.
/// Ergebnis: None = keine H145 gefunden (nichts zu tun), Some(true) = neu eingetragen (wirkt nach MSFS-Neustart),
/// Some(false) = war schon richtig. Eine Sicherung der Originaldatei bleibt daneben liegen.
#[tauri::command]
pub fn hpg_tablet_link(community: Option<String>, port: u16) -> Result<Option<bool>, String> {
    let communities: Vec<PathBuf> = match community.filter(|c| !c.trim().is_empty()) {
        Some(c) => vec![PathBuf::from(c)],
        None => crate::gtn::communities(),
    };
    let Some(paket) = communities.iter().find_map(|c| h145_in(c)) else { return Ok(None) };
    let datei = paket.join(BROWSER_DATEI);
    let alt = fs::read_to_string(&datei).ok();
    let url = format!("http://127.0.0.1:{port}/efb");
    let (neu, geaendert) = browser_json_mit_link(alt.as_deref(), &url)?;
    if !geaendert {
        return Ok(Some(false));
    }
    if let Some(a) = &alt {
        let sicherung = datei.with_extension("json.vor-leitwerk");
        if !sicherung.exists() {
            let _ = fs::write(&sicherung, a);
        }
    }
    if let Some(d) = datei.parent() {
        fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    fs::write(&datei, &neu).map_err(|e| format!("Tablet-Datei nicht schreibbar: {e}"))?;
    layout_nachtragen(&paket, BROWSER_DATEI, neu.len() as u64)?;
    Ok(Some(true))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn link_eintragen() {
        let alt = r#"{ "Links": [ { "Url": "https://webeye.ivao.aero/", "Title": "IVAO WebEye" } ] }"#;
        let (neu, g) = browser_json_mit_link(Some(alt), "http://127.0.0.1:47900/efb").unwrap();
        assert!(g);
        assert!(neu.contains("IVAO WebEye") && neu.contains("47900/efb"));
        let (_, g2) = browser_json_mit_link(Some(&neu), "http://127.0.0.1:47900/efb").unwrap();
        assert!(!g2);
        let (neu3, g3) = browser_json_mit_link(Some(&neu), "http://127.0.0.1:47901/efb").unwrap();
        assert!(g3 && !neu3.contains("47900") && neu3.matches("LeitWerk").count() == 1);
    }
}
