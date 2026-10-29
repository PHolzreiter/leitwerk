//! Brücke zum Microsoft Flight Simulator (2024, auch 2020) für den Spieler-NAH.
//!
//! SimConnect.dll wird zur Laufzeit geladen (nicht fest eingebaut): Sie kommt aus dem MSFS-SDK
//! (im Simulator unter „Entwicklermodus → SDK“ kostenlos) oder liegt neben LeitWerk; der Pilot kann
//! die Datei auch selbst wählen. Gelesen werden nur Position, Höhe, Kurs, Geschwindigkeit,
//! „am Boden“ und „Triebwerk an“ – einmal pro Sekunde, als Ereignis „msfs-daten“ an die Oberfläche.
//! Den Zustand („verbunden“, „wartet auf MSFS“ …) meldet das Ereignis „msfs-status“.
//!
//! Zum Testen ohne Windows: Umgebungsvariable LEITWERK_SIMCONNECT auf eine Attrappe
//! (eine Bibliothek mit denselben Funktionen) setzen.

use serde::Serialize;
use std::ffi::{c_char, c_void, CString};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

type Handle = *mut c_void;
type FnOpen = unsafe extern "system" fn(*mut Handle, *const c_char, *mut c_void, u32, *mut c_void, u32) -> i32;
type FnClose = unsafe extern "system" fn(Handle) -> i32;
type FnAddDef = unsafe extern "system" fn(Handle, u32, *const c_char, *const c_char, u32, f32, u32) -> i32;
type FnRequest = unsafe extern "system" fn(Handle, u32, u32, u32, u32, u32, u32, u32, u32) -> i32;
type FnDispatch = unsafe extern "system" fn(Handle, *mut *mut u8, *mut u32) -> i32;
type FnSetData = unsafe extern "system" fn(Handle, u32, u32, u32, u32, u32, *mut c_void) -> i32;

const DATATYPE_FLOAT64: u32 = 4;
const UNUSED: u32 = 0xFFFF_FFFF;
const OBJECT_ID_USER: u32 = 0;
const PERIOD_SECOND: u32 = 4;
const RECV_EXCEPTION: u32 = 1;
const RECV_OPEN: u32 = 2;
const RECV_QUIT: u32 = 3;
const RECV_SIMOBJECT_DATA: u32 = 8;
/// Beginn der Werte in SIMCONNECT_RECV_SIMOBJECT_DATA (Kopf 12 Byte + 7 DWORD)
const DATEN_AB: usize = 40;
const DEF: u32 = 1;
const REQ: u32 = 1;
/// HPG H145: Tasten am CARLS-Funkgerät (Status-Pads) – nur bei Änderung, dafür jedes Bild
const DEF_CARLS: u32 = 2;
const REQ_CARLS: u32 = 2;
const PERIOD_VISUAL_FRAME: u32 = 2;
const FLAG_CHANGED: u32 = 1;
/// HPG H145: Verbindung zum CARLS-Funkgerät (wie ein Missionsdienst): lesen 1×/s, schreiben bei Bedarf
const DEF_HPG: u32 = 3;
const REQ_HPG: u32 = 3;
const DEF_TX_DIENST: u32 = 4;
const DEF_TX_SETUP: u32 = 5;
const DEF_TX_CARLS: u32 = 6;
/// Werte für DEF_HPG (Reihenfolge = Reihenfolge der Werte)
const HPG_WERTE: [&str; 5] = ["L:SERVICE_CONNECTED", "L:INHIBVAR", "L:LIVERY_RESCUETRACK_ID", "L:SERVICE_MODE", "L:DISPATCH_PHASE"];

/// CARLS-Funkgerät verbinden (abschaltbar im Piloten-Interface)
static CARLS_AN: AtomicBool = AtomicBool::new(true);

#[derive(Serialize, Clone, PartialEq)]
pub struct CarlsStatus {
    /// das Funkgerät hat auf das Lebenszeichen geantwortet (L:SERVICE_CONNECTED = 2)
    verbunden: bool,
    /// Rohwerte zur Fehlersuche (L:SERVICE_MODE, L:DISPATCH_PHASE)
    modus: f64,
    phase: f64,
}

/// Was gelesen wird (Reihenfolge = Reihenfolge der Werte)
const WERTE: [(&str, &str); 8] = [
    ("PLANE LATITUDE", "degrees"),
    ("PLANE LONGITUDE", "degrees"),
    ("PLANE ALTITUDE", "feet"),
    ("PLANE ALT ABOVE GROUND", "feet"),
    ("PLANE HEADING DEGREES TRUE", "degrees"),
    ("GROUND VELOCITY", "knots"),
    ("SIM ON GROUND", "Bool"),
    ("GENERAL ENG COMBUSTION:1", "Bool"),
];

#[derive(Serialize, Clone)]
pub struct MsfsDaten {
    lat: f64,
    lon: f64,
    /// Höhe über dem Meer und über Grund (Fuß)
    hoehe: f64,
    agl: f64,
    kurs: f64,
    /// Geschwindigkeit über Grund (Knoten)
    kts: f64,
    am_boden: bool,
    motor: bool,
}

#[derive(Serialize, Clone)]
pub struct MsfsStatus {
    /// keineDll | wartet | verbunden | getrennt | aus | fehler
    zustand: String,
    text: String,
    dll: Option<String>,
}

static LAEUFT: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

fn status(app: &AppHandle, zustand: &str, text: &str, dll: Option<&Path>) {
    let _ = app.emit(
        "msfs-status",
        MsfsStatus { zustand: zustand.into(), text: text.into(), dll: dll.map(|p| p.display().to_string()) },
    );
}

/// Mögliche Orte der SimConnect.dll
fn kandidaten(app: &AppHandle) -> Vec<PathBuf> {
    let mut l = Vec::new();
    if let Ok(p) = std::env::var("LEITWERK_SIMCONNECT") {
        l.push(PathBuf::from(p));
    }
    if !cfg!(windows) {
        return l;
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(d) = exe.parent() {
            l.push(d.join("SimConnect.dll"));
        }
    }
    if let Ok(d) = app.path().app_data_dir() {
        l.push(d.join("SimConnect.dll"));
    }
    for var in ["MSFS2024_SDK", "MSFS_SDK"] {
        if let Ok(sdk) = std::env::var(var) {
            l.push(Path::new(&sdk).join("SimConnect SDK").join("lib").join("SimConnect.dll"));
        }
    }
    for basis in ["C:\\MSFS 2024 SDK", "C:\\MSFS SDK", "D:\\MSFS 2024 SDK", "D:\\MSFS SDK"] {
        l.push(Path::new(basis).join("SimConnect SDK").join("lib").join("SimConnect.dll"));
    }
    l
}

/// Findet die SimConnect.dll (zuerst die vom Piloten gewählte)
fn dll_finden(app: &AppHandle, gewaehlt: Option<&str>) -> Option<PathBuf> {
    if let Some(g) = gewaehlt.filter(|g| !g.trim().is_empty()) {
        let p = PathBuf::from(g);
        return p.exists().then_some(p);
    }
    kandidaten(app).into_iter().find(|p| p.exists())
}

/// Wo LeitWerk die SimConnect.dll gefunden hat (für die Anzeige), sonst null
#[tauri::command]
pub fn msfs_dll_suchen(app: AppHandle, gewaehlt: Option<String>) -> Option<String> {
    dll_finden(&app, gewaehlt.as_deref()).map(|p| p.display().to_string())
}

struct Api {
    _lib: libloading::Library,
    open: FnOpen,
    close: FnClose,
    add: FnAddDef,
    request: FnRequest,
    dispatch: FnDispatch,
    set: Option<FnSetData>,
}

fn laden(p: &Path) -> Result<Api, String> {
    unsafe {
        let lib = libloading::Library::new(p).map_err(|e| format!("SimConnect.dll lässt sich nicht laden: {e}"))?;
        macro_rules! f {
            ($n:literal, $t:ty) => {
                *lib.get::<$t>($n).map_err(|e| format!("SimConnect.dll ohne {}: {e}", String::from_utf8_lossy(&$n[..$n.len() - 1])))?
            };
        }
        let open = f!(b"SimConnect_Open\0", FnOpen);
        let close = f!(b"SimConnect_Close\0", FnClose);
        let add = f!(b"SimConnect_AddToDataDefinition\0", FnAddDef);
        let request = f!(b"SimConnect_RequestDataOnSimObject\0", FnRequest);
        let dispatch = f!(b"SimConnect_GetNextDispatch\0", FnDispatch);
        // Schreiben braucht nur das CARLS-Funkgerät – ohne geht der Rest trotzdem
        let set = lib.get::<FnSetData>(b"SimConnect_SetDataOnSimObject\0").ok().map(|f| *f);
        Ok(Api { _lib: lib, open, close, add, request, dispatch, set })
    }
}

/// Werte (FLOAT64) in eine Definition schreiben
fn schreiben(api: &Api, h: Handle, def: u32, werte: &[f64]) {
    let Some(set) = api.set else { return };
    let mut daten: Vec<f64> = werte.to_vec();
    unsafe { set(h, def, OBJECT_ID_USER, 0, 0, (8 * daten.len()) as u32, daten.as_mut_ptr() as *mut c_void) };
}

/// Lebenszeichen fürs CARLS-Funkgerät (wie ein Missionsdienst): Die H145 antwortet auf
/// L:SERVICE_CONNECTED = 1 mit 2; bleibt es länger als 3 s bei 1, ist die Verbindung weg.
/// Dazu L:INHIBVAR = 0 und L:LIVERY_RESCUETRACK_ID = 1 (so macht es auch ein Missionsdienst).
fn carls_dienst(api: &Api, h: Handle, w: &[f64; 5], verbunden: &mut bool, warte: &mut u32) {
    let [dienst, inhib, livery, _, _] = *w;
    if inhib != 0.0 || livery != 1.0 {
        schreiben(api, h, DEF_TX_SETUP, &[0.0, 1.0]);
    }
    if dienst == 1.0 {
        *warte += 1;
        if *warte > 3 {
            *verbunden = false;
        }
        return;
    }
    if dienst == 2.0 {
        *verbunden = true;
        *warte = 0;
    }
    schreiben(api, h, DEF_TX_DIENST, &[1.0]);
}

fn u32_bei(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

fn f64_bei(b: &[u8], i: usize) -> f64 {
    let mut x = [0u8; 8];
    x.copy_from_slice(&b[i..i + 8]);
    f64::from_le_bytes(x)
}

/// Eine Verbindung: öffnen, Werte anmelden, lesen bis MSFS beendet wird oder gestoppt wird.
/// Ok(true) = war verbunden (dann gleich wieder versuchen), Ok(false) = MSFS läuft nicht.
fn sitzung(api: &Api, app: &AppHandle, stop: &AtomicBool, dll: &Path) -> Result<bool, String> {
    let name = CString::new("LeitWerk").unwrap();
    let mut h: Handle = std::ptr::null_mut();
    let hr = unsafe { (api.open)(&mut h, name.as_ptr(), std::ptr::null_mut(), 0, std::ptr::null_mut(), 0) };
    if hr < 0 || h.is_null() {
        return Ok(false);
    }
    for (var, einheit) in WERTE {
        let v = CString::new(var).unwrap();
        let e = CString::new(einheit).unwrap();
        unsafe { (api.add)(h, DEF, v.as_ptr(), e.as_ptr(), DATATYPE_FLOAT64, 0.0, UNUSED) };
    }
    unsafe { (api.request)(h, REQ, DEF, OBJECT_ID_USER, PERIOD_SECOND, 0, 0, 0, 0) };
    // HPG H145: zuletzt gedrückte Taste am CARLS-Funkgerät (andere Hubschrauber liefern hier einfach 0)
    let carls = CString::new("L:CARLS_RT_BUTTON").unwrap();
    let zahl = CString::new("number").unwrap();
    unsafe {
        (api.add)(h, DEF_CARLS, carls.as_ptr(), zahl.as_ptr(), DATATYPE_FLOAT64, 0.0, UNUSED);
        (api.request)(h, REQ_CARLS, DEF_CARLS, OBJECT_ID_USER, PERIOD_VISUAL_FRAME, FLAG_CHANGED, 0, 0, 0);
        for var in HPG_WERTE {
            let v = CString::new(var).unwrap();
            (api.add)(h, DEF_HPG, v.as_ptr(), zahl.as_ptr(), DATATYPE_FLOAT64, 0.0, UNUSED);
        }
        (api.request)(h, REQ_HPG, DEF_HPG, OBJECT_ID_USER, PERIOD_SECOND, 0, 0, 0, 0);
        let dienst = CString::new("L:SERVICE_CONNECTED").unwrap();
        (api.add)(h, DEF_TX_DIENST, dienst.as_ptr(), zahl.as_ptr(), DATATYPE_FLOAT64, 0.0, UNUSED);
        for var in ["L:INHIBVAR", "L:LIVERY_RESCUETRACK_ID"] {
            let v = CString::new(var).unwrap();
            (api.add)(h, DEF_TX_SETUP, v.as_ptr(), zahl.as_ptr(), DATATYPE_FLOAT64, 0.0, UNUSED);
        }
        (api.add)(h, DEF_TX_CARLS, carls.as_ptr(), zahl.as_ptr(), DATATYPE_FLOAT64, 0.0, UNUSED);
    }
    let mut carls_verbunden = false;
    let mut carls_warte = 0u32;
    let mut carls_gemeldet: Option<CarlsStatus> = None;
    status(app, "verbunden", "Mit dem Flugsimulator verbunden", Some(dll));
    let mut letzte = Instant::now();
    let mut ergebnis = Ok(true);
    while !stop.load(Ordering::SeqCst) {
        let mut p: *mut u8 = std::ptr::null_mut();
        let mut n: u32 = 0;
        let hr = unsafe { (api.dispatch)(h, &mut p, &mut n) };
        if hr >= 0 && !p.is_null() && n >= 12 {
            let b = unsafe { std::slice::from_raw_parts(p, n as usize) };
            match u32_bei(b, 8) {
                RECV_QUIT => {
                    status(app, "getrennt", "Flugsimulator wurde beendet", Some(dll));
                    break;
                }
                RECV_SIMOBJECT_DATA if b.len() >= DATEN_AB + 8 && u32_bei(b, 12) == REQ_CARLS => {
                    let w = f64_bei(b, DATEN_AB);
                    let n = w.round();
                    if (1.0..=9.0).contains(&n) {
                        let _ = app.emit("msfs-carls", n);
                        // zurücksetzen, damit dieselbe Taste beim nächsten Mal wieder ankommt
                        if CARLS_AN.load(Ordering::SeqCst) {
                            schreiben(api, h, DEF_TX_CARLS, &[-1.0]);
                        }
                    }
                }
                RECV_SIMOBJECT_DATA if b.len() >= DATEN_AB + 8 * HPG_WERTE.len() && u32_bei(b, 12) == REQ_HPG => {
                    let w: [f64; 5] = std::array::from_fn(|k| f64_bei(b, DATEN_AB + 8 * k));
                    if CARLS_AN.load(Ordering::SeqCst) {
                        carls_dienst(api, h, &w, &mut carls_verbunden, &mut carls_warte);
                    } else {
                        carls_verbunden = false;
                    }
                    let st = CarlsStatus { verbunden: carls_verbunden, modus: w[3], phase: w[4] };
                    if carls_gemeldet.as_ref() != Some(&st) {
                        let _ = app.emit("msfs-carls-status", st.clone());
                        carls_gemeldet = Some(st);
                    }
                }
                RECV_SIMOBJECT_DATA if b.len() >= DATEN_AB + 8 * WERTE.len() && u32_bei(b, 12) == REQ => {
                    letzte = Instant::now();
                    let w = |k: usize| f64_bei(b, DATEN_AB + 8 * k);
                    let _ = app.emit(
                        "msfs-daten",
                        MsfsDaten { lat: w(0), lon: w(1), hoehe: w(2), agl: w(3), kurs: w(4), kts: w(5), am_boden: w(6) > 0.5, motor: w(7) > 0.5 },
                    );
                }
                RECV_EXCEPTION | RECV_OPEN => {}
                _ => {}
            }
            continue;
        }
        // keine Daten mehr seit 15 s (z. B. Hauptmenü): Hinweis, Verbindung bleibt
        if letzte.elapsed() > Duration::from_secs(15) {
            status(app, "wartet", "Verbunden, aber keine Flugdaten – bist du im Flug (nicht im Menü)?", Some(dll));
            letzte = Instant::now();
        }
        if hr < 0 && hr != -2147467259 {
            // anderer Fehler als „nichts da“ (E_FAIL): Verbindung weg
            ergebnis = Err(format!("SimConnect-Fehler 0x{:08x}", hr as u32));
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    unsafe { (api.close)(h) };
    ergebnis
}

/// Startet die Verbindung zum Flugsimulator (versucht es laufend neu, bis msfs_stoppen)
#[tauri::command]
pub fn msfs_starten(app: AppHandle, dll: Option<String>) -> Result<String, String> {
    msfs_stoppen();
    let pfad = dll_finden(&app, dll.as_deref());
    let Some(pfad) = pfad else {
        let text = if cfg!(windows) {
            "SimConnect.dll nicht gefunden – bitte das MSFS-SDK installieren oder die Datei wählen"
        } else {
            "Die Verbindung zum MSFS gibt es nur unter Windows"
        };
        status(&app, "keineDll", text, None);
        return Err(text.into());
    };
    let api = laden(&pfad).inspect_err(|e| status(&app, "fehler", e, Some(&pfad)))?;
    let stop = Arc::new(AtomicBool::new(false));
    *LAEUFT.lock().map_err(|e| e.to_string())? = Some(stop.clone());
    let p2 = pfad.clone();
    std::thread::spawn(move || {
        let mut gemeldet = false;
        while !stop.load(Ordering::SeqCst) {
            match sitzung(&api, &app, &stop, &p2) {
                Ok(true) => gemeldet = false,
                Ok(false) => {
                    if !gemeldet {
                        status(&app, "wartet", "Warte auf den Flugsimulator – MSFS starten", Some(&p2));
                        gemeldet = true;
                    }
                }
                Err(e) => {
                    status(&app, "fehler", &e, Some(&p2));
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
        status(&app, "aus", "Verbindung zum Flugsimulator beendet", Some(&p2));
    });
    Ok(pfad.display().to_string())
}

/// CARLS-Funkgerät der HPG H145 verbinden (Lebenszeichen) – an oder aus
#[tauri::command]
pub fn msfs_carls(an: bool) {
    CARLS_AN.store(an, Ordering::SeqCst);
}

#[tauri::command]
pub fn msfs_stoppen() {
    if let Ok(mut g) = LAEUFT.lock() {
        if let Some(s) = g.take() {
            s.store(true, Ordering::SeqCst);
        }
    }
}
