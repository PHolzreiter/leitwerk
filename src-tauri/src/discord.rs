//! Discord-Aktivität (Rich Presence, Beta 74): Läuft Discord auf demselben Rechner, steht dort „Spielt LeitWerk“ mit
//! ein paar Infos (Rolle, Funkgruppe, offene Einsätze, Spieltyp). LeitWerk spricht dafür über die lokale Schnittstelle
//! von Discord (Windows: benannte Pipe, macOS/Linux: Socket) – kein Konto, kein Token. Die Application ID ist öffentlich.
//!
//! Ein eigener Faden hält die Verbindung: Läuft Discord nicht oder wird es später gestartet, versucht er es alle 30 s
//! still neu. Die Oberfläche schickt nur, wenn sich etwas ändert (und höchstens alle 15 s).

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Anwendung „LeitWerk“ im Discord Developer Portal (öffentliche ID, kein Geheimnis)
const APP_ID: &str = "1574334143268003901";
const NEU_VERSUCH: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, serde::Deserialize, PartialEq)]
pub struct Aktivitaet {
    /// erste Zeile, z. B. „Disponent · RD-NOE-03“
    pub details: Option<String>,
    /// zweite Zeile, z. B. „3 offene Einsätze · Standard“
    pub state: Option<String>,
    /// Text beim großen Bild (Logo)
    pub gross_text: Option<String>,
    /// kleines Bild (Name aus „Art Assets“), optional
    pub klein: Option<String>,
    pub klein_text: Option<String>,
    /// Beginn (Unix-Zeit in ms) – Discord zeigt „seit …“
    pub start: Option<i64>,
    /// Mitspieler [jetzt, höchstens]
    pub runde: Option<[i32; 2]>,
}

enum Befehl {
    Setzen(Aktivitaet),
    Aus,
}

static KANAL: OnceLock<Mutex<Sender<Befehl>>> = OnceLock::new();
static VERBUNDEN: AtomicBool = AtomicBool::new(false);

fn kanal() -> &'static Mutex<Sender<Befehl>> {
    KANAL.get_or_init(|| {
        let (tx, rx) = channel::<Befehl>();
        std::thread::Builder::new()
            .name("discord".into())
            .spawn(move || {
                let mut client: Option<DiscordIpcClient> = None;
                let mut gewuenscht: Option<Aktivitaet> = None;
                let mut gesendet: Option<Aktivitaet> = None;
                let mut letzter_versuch: Option<Instant> = None;
                loop {
                    match rx.recv_timeout(NEU_VERSUCH) {
                        Ok(Befehl::Setzen(a)) => gewuenscht = Some(a),
                        Ok(Befehl::Aus) => {
                            gewuenscht = None;
                            gesendet = None;
                            if let Some(mut c) = client.take() {
                                let _ = c.clear_activity();
                                let _ = c.close();
                            }
                            VERBUNDEN.store(false, Ordering::Relaxed);
                            continue;
                        }
                        Err(RecvTimeoutError::Timeout) => {}
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                    let Some(a) = gewuenscht.clone() else { continue };
                    if client.is_none() {
                        // nicht bei jeder Änderung neu probieren, wenn Discord gerade nicht läuft
                        if letzter_versuch.is_some_and(|t| t.elapsed() < NEU_VERSUCH - Duration::from_secs(1)) {
                            continue;
                        }
                        letzter_versuch = Some(Instant::now());
                        let mut c = DiscordIpcClient::new(APP_ID);
                        if c.connect().is_ok() {
                            client = Some(c);
                            gesendet = None;
                        } else {
                            VERBUNDEN.store(false, Ordering::Relaxed);
                            continue;
                        }
                    }
                    if gesendet.as_ref() == Some(&a) {
                        continue;
                    }
                    let ok = client.as_mut().is_some_and(|c| c.set_activity(baue(&a)).is_ok());
                    if ok {
                        gesendet = Some(a);
                        VERBUNDEN.store(true, Ordering::Relaxed);
                    } else {
                        // Discord wurde beendet: Verbindung verwerfen, später neu
                        client = None;
                        gesendet = None;
                        VERBUNDEN.store(false, Ordering::Relaxed);
                    }
                }
            })
            .expect("Discord-Faden");
        Mutex::new(tx)
    })
}

fn baue(a: &Aktivitaet) -> activity::Activity<'_> {
    let mut x = activity::Activity::new();
    if let Some(d) = a.details.as_deref().filter(|s| !s.is_empty()) {
        x = x.details(d);
    }
    if let Some(s) = a.state.as_deref().filter(|s| !s.is_empty()) {
        x = x.state(s);
    }
    let mut bild = activity::Assets::new().large_image("logo").large_text(a.gross_text.as_deref().unwrap_or("LeitWerk"));
    if let Some(k) = a.klein.as_deref().filter(|s| !s.is_empty()) {
        bild = bild.small_image(k);
        if let Some(t) = a.klein_text.as_deref() {
            bild = bild.small_text(t);
        }
    }
    x = x.assets(bild);
    if let Some(t) = a.start {
        x = x.timestamps(activity::Timestamps::new().start(t));
    }
    if let Some(r) = a.runde.filter(|r| r[0] > 0 && r[1] >= r[0]) {
        x = x.party(activity::Party::new().size(r));
    }
    x
}

/// Aktivität setzen (die Oberfläche schickt nur bei Änderungen)
#[tauri::command]
pub fn discord_setzen(aktivitaet: Aktivitaet) {
    if let Ok(tx) = kanal().lock() {
        let _ = tx.send(Befehl::Setzen(aktivitaet));
    }
}

/// Aktivität entfernen (Einstellung aus)
#[tauri::command]
pub fn discord_aus() {
    if KANAL.get().is_none() {
        return;
    }
    if let Ok(tx) = kanal().lock() {
        let _ = tx.send(Befehl::Aus);
    }
}

/// Ist LeitWerk gerade mit Discord verbunden?
#[tauri::command]
pub fn discord_status() -> bool {
    VERBUNDEN.load(Ordering::Relaxed)
}
