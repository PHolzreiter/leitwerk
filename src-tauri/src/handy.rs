//! Handy als Statusgerät für den Piloten (Spieler-NAH).
//!
//! Ein kleiner Webserver im Heimnetz: Das Handy öffnet die Seite (QR-Code im Piloten-Interface),
//! holt sich jede Sekunde den Stand (Status, Einsatz, Patient) und schickt Tastendrücke zurück.
//! Ohne zusätzliche Bibliotheken – nur einfache HTTP-Anfragen. Zugang nur mit dem Schlüssel aus dem QR-Code.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const SEITE: &str = include_str!("handy.html");
const PORTS: std::ops::RangeInclusive<u16> = 47_890..=47_899;

#[derive(Serialize, Clone)]
pub struct HandyInfo {
    url: String,
    ip: String,
    port: u16,
}

struct Server {
    info: HandyInfo,
    stop: Arc<AtomicBool>,
}

static SERVER: Mutex<Option<Server>> = Mutex::new(None);
static STAND: Mutex<String> = Mutex::new(String::new());

/// IP-Adresse im Heimnetz (ohne dass ein Paket verschickt wird)
fn lokale_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".into())
}

fn schluessel() -> String {
    let t = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut h = Sha256::new();
    h.update(t.to_le_bytes());
    h.update(std::process::id().to_le_bytes());
    h.update(lokale_ip().as_bytes());
    h.finalize().iter().take(6).map(|b| format!("{b:02x}")).collect()
}

fn antwort(s: &mut TcpStream, code: &str, typ: &str, body: &[u8]) {
    let kopf = format!(
        "HTTP/1.1 {code}\r\nContent-Type: {typ}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = s.write_all(kopf.as_bytes());
    let _ = s.write_all(body);
}

fn bearbeiten(mut s: TcpStream, token: &str, app: &AppHandle) {
    let _ = s.set_nonblocking(false);
    let _ = s.set_read_timeout(Some(Duration::from_secs(5)));
    let mut r = BufReader::new(match s.try_clone() {
        Ok(x) => x,
        Err(_) => return,
    });
    let mut zeile = String::new();
    if r.read_line(&mut zeile).is_err() {
        return;
    }
    let mut teile = zeile.split_whitespace();
    let methode = teile.next().unwrap_or("").to_string();
    let ziel = teile.next().unwrap_or("/").to_string();
    let mut laenge = 0usize;
    loop {
        let mut h = String::new();
        if r.read_line(&mut h).is_err() || h == "\r\n" || h.is_empty() {
            break;
        }
        if let Some(v) = h.to_ascii_lowercase().strip_prefix("content-length:") {
            laenge = v.trim().parse().unwrap_or(0).min(4096);
        }
    }
    let (pfad, abfrage) = ziel.split_once('?').unwrap_or((ziel.as_str(), ""));
    let ok = abfrage.split('&').any(|p| p == format!("t={token}"));
    if pfad == "/favicon.ico" {
        return antwort(&mut s, "404 Not Found", "text/plain", b"");
    }
    if !ok {
        return antwort(&mut s, "403 Forbidden", "text/plain; charset=utf-8", "Kein Zugang – bitte den QR-Code im Piloten-Interface neu scannen.".as_bytes());
    }
    match (methode.as_str(), pfad) {
        ("GET", "/") => antwort(&mut s, "200 OK", "text/html; charset=utf-8", SEITE.as_bytes()),
        ("GET", "/stand") => {
            let st = STAND.lock().map(|x| x.clone()).unwrap_or_default();
            let st = if st.is_empty() { "{}".to_string() } else { st };
            antwort(&mut s, "200 OK", "application/json; charset=utf-8", st.as_bytes())
        }
        ("POST", "/befehl") => {
            let mut body = vec![0u8; laenge];
            if laenge > 0 && r.read_exact(&mut body).is_err() {
                return antwort(&mut s, "400 Bad Request", "text/plain", b"");
            }
            let text = String::from_utf8_lossy(&body).trim().chars().take(200).collect::<String>();
            if !text.is_empty() {
                let _ = app.emit("handy-befehl", text);
            }
            antwort(&mut s, "200 OK", "text/plain", b"ok")
        }
        _ => antwort(&mut s, "404 Not Found", "text/plain", b""),
    }
}

/// Startet den Server (falls er noch nicht läuft) und gibt die Adresse für den QR-Code zurück.
#[tauri::command]
pub fn handy_starten(app: AppHandle) -> Result<HandyInfo, String> {
    let mut g = SERVER.lock().map_err(|e| e.to_string())?;
    if let Some(s) = g.as_ref() {
        return Ok(s.info.clone());
    }
    let mut listener = None;
    let mut port = 0;
    for p in PORTS {
        if let Ok(l) = TcpListener::bind(("0.0.0.0", p)) {
            listener = Some(l);
            port = p;
            break;
        }
    }
    let listener = listener.ok_or("Kein freier Anschluss (Port 47890–47899) – läuft LeitWerk zweimal?")?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let ip = lokale_ip();
    let token = schluessel();
    let info = HandyInfo { url: format!("http://{ip}:{port}/?t={token}"), ip, port };
    let stop = Arc::new(AtomicBool::new(false));
    let stop2 = stop.clone();
    std::thread::spawn(move || {
        while !stop2.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((s, _)) => {
                    let t = token.clone();
                    let a = app.clone();
                    std::thread::spawn(move || bearbeiten(s, &t, &a));
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(60)),
                Err(_) => std::thread::sleep(Duration::from_millis(200)),
            }
        }
    });
    *g = Some(Server { info: info.clone(), stop });
    Ok(info)
}

/// Neuer Stand fürs Handy (JSON aus dem Piloten-Interface)
#[tauri::command]
pub fn handy_stand(json: String) {
    if let Ok(mut s) = STAND.lock() {
        *s = json;
    }
}

#[tauri::command]
pub fn handy_stoppen() {
    if let Ok(mut g) = SERVER.lock() {
        if let Some(s) = g.take() {
            s.stop.store(true, Ordering::SeqCst);
        }
    }
}
