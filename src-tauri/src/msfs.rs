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
// Uhrzeit (Ereignisse) und Fahrzeuge am Einsatzort (Objekte) – Beta 66
type FnMapEvent = unsafe extern "system" fn(Handle, u32, *const c_char) -> i32;
type FnTransmit = unsafe extern "system" fn(Handle, u32, u32, u32, u32, u32) -> i32;
type FnCreate = unsafe extern "system" fn(Handle, *const c_char, InitPos, u32) -> i32;
type FnCreateEx1 = unsafe extern "system" fn(Handle, *const c_char, *const c_char, InitPos, u32) -> i32;
type FnRemove = unsafe extern "system" fn(Handle, u32, u32) -> i32;
type FnEnumerate = unsafe extern "system" fn(Handle, u32, u32) -> i32;

/// SIMCONNECT_DATA_INITPOSITION (56 Byte: 6 × double, 2 × DWORD)
#[repr(C)]
#[derive(Clone, Copy)]
struct InitPos {
    lat: f64,
    lon: f64,
    alt: f64,
    pitch: f64,
    bank: f64,
    heading: f64,
    on_ground: u32,
    airspeed: u32,
}

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
/// Uhrzeit im Simulator lesen (1×/s): ZULU TIME (s seit Mitternacht), ZULU DAY OF YEAR, ZULU YEAR, ABSOLUTE TIME (s)
const DEF_ZEIT: u32 = 7;
const REQ_ZEIT: u32 = 7;
const ZEIT_WERTE: [(&str, &str); 4] = [("ZULU TIME", "seconds"), ("ZULU DAY OF YEAR", "number"), ("ZULU YEAR", "number"), ("ABSOLUTE TIME", "seconds")];
/// Uhrzeit setzen: Ereignisse (Kennungen frei gewählt)
const EV_JAHR: u32 = 10;
const EV_TAG: u32 = 11;
const EV_STUNDE: u32 = 12;
const EV_MINUTE: u32 = 13;
const GRUPPE_HOECHSTE: u32 = 1;
const FLAG_GRUPPE_IST_PRIO: u32 = 0x10;
/// Fahrzeuge am Einsatzort: Blaulicht an, danach anhalten (Bodenfahrzeuge fahren sonst los)
const DEF_PROP_LICHT: u32 = 8;
const DEF_PROP_HALT: u32 = 9;
const REQ_ENUM: u32 = 20;
const REQ_PROP_AB: u32 = 1000;
const RECV_ASSIGNED_OBJECT_ID: u32 = 12;
const SIMOBJECT_TYPE_ALL: u32 = 1;
/// Suchwörter für Einsatzfahrzeuge, Trage und Unfallobjekte (Titel der SimObjects)
const PROP_WOERTER: [&str; 34] = [
    "ambulan", "rettung", "rtw", "ktw", "notarzt", "nef", "doctor", "emergency", "police", "polizei", "fire", "feuerwehr", "rescue", "drk", "asb", "krankenwagen",
    "gurney", "trage", "stretcher", "spine", "patient", "crash", "wreck", "unfall", "medic", "ems", "samarit", "johanniter", "malteser", "blaulicht", "hems", "flare", "brk", "srk",
];

/// CARLS-Funkgerät verbinden (abschaltbar im Piloten-Interface)
static CARLS_AN: AtomicBool = AtomicBool::new(true);

/// Aufträge an die laufende Verbindung: Uhrzeit setzen, Fahrzeuge am Einsatzort setzen/entfernen, Modelle suchen
enum Auftrag {
    Zeit(f64),
    Setzen { id: String, titel: String, lat: f64, lon: f64, kurs: f64 },
    Weg(String),
    Suchen,
}
static AUFTRAEGE: Mutex<Vec<Auftrag>> = Mutex::new(Vec::new());

fn auftrag(a: Auftrag) {
    if let Ok(mut l) = AUFTRAEGE.lock() {
        if l.len() < 300 {
            l.push(a);
        }
    }
}

/// Uhrzeit im Simulator (zur Rückmeldung, ob das Setzen gewirkt hat)
#[derive(Serialize, Clone)]
pub struct MsfsZeit {
    zulu: f64,
    tag: f64,
    jahr: f64,
    abs: f64,
}

/// Rückmeldung zu einem Fahrzeug am Einsatzort
#[derive(Serialize, Clone)]
pub struct PropMeldung {
    id: String,
    ok: bool,
    text: String,
}

/// Tage seit 1970-01-01 für ein Datum (proleptisch gregorianisch)
fn tage_seit_1970(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// Unix-Millisekunden → (Jahr, Tag im Jahr 1–366, Stunde, Minute) in UTC
fn utc_teile(ms: f64) -> (i64, i64, i64, i64) {
    let sek = (ms / 1000.0).floor() as i64;
    let tage = sek.div_euclid(86400);
    let rest = sek.rem_euclid(86400);
    let z = tage + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy0 = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy0 + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    let tag = tage - tage_seit_1970(y, 1, 1) + 1;
    (y, tag, rest / 3600, (rest % 3600) / 60)
}

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
    map_event: Option<FnMapEvent>,
    transmit: Option<FnTransmit>,
    create: Option<FnCreate>,
    create_ex1: Option<FnCreateEx1>,
    remove: Option<FnRemove>,
    enumerate: Option<FnEnumerate>,
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
        // Uhrzeit und Fahrzeuge: optional (ältere SimConnect.dll ohne _EX1 bzw. ohne Liste der Objekte)
        let map_event = lib.get::<FnMapEvent>(b"SimConnect_MapClientEventToSimEvent\0").ok().map(|f| *f);
        let transmit = lib.get::<FnTransmit>(b"SimConnect_TransmitClientEvent\0").ok().map(|f| *f);
        let create = lib.get::<FnCreate>(b"SimConnect_AICreateSimulatedObject\0").ok().map(|f| *f);
        let create_ex1 = lib.get::<FnCreateEx1>(b"SimConnect_AICreateSimulatedObject_EX1\0").ok().map(|f| *f);
        let remove = lib.get::<FnRemove>(b"SimConnect_AIRemoveObject\0").ok().map(|f| *f);
        let enumerate = lib.get::<FnEnumerate>(b"SimConnect_EnumerateSimObjectsAndLiveries\0").ok().map(|f| *f);
        Ok(Api { _lib: lib, open, close, add, request, dispatch, set, map_event, transmit, create, create_ex1, remove, enumerate })
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
        // Uhrzeit: lesen (1×/s) und setzen (Ereignisse)
        for (var, einheit) in ZEIT_WERTE {
            let v = CString::new(var).unwrap();
            let e = CString::new(einheit).unwrap();
            (api.add)(h, DEF_ZEIT, v.as_ptr(), e.as_ptr(), DATATYPE_FLOAT64, 0.0, UNUSED);
        }
        (api.request)(h, REQ_ZEIT, DEF_ZEIT, OBJECT_ID_USER, PERIOD_SECOND, 0, 0, 0, 0);
        if let Some(map) = api.map_event {
            for (id, name) in [(EV_JAHR, "ZULU_YEAR_SET"), (EV_TAG, "ZULU_DAY_SET"), (EV_STUNDE, "ZULU_HOURS_SET"), (EV_MINUTE, "ZULU_MINUTES_SET")] {
                let n = CString::new(name).unwrap();
                map(h, id, n.as_ptr());
            }
        }
        // Fahrzeuge am Einsatzort: Blaulicht (Beacon) und Anhalten (eigene Simulation aus)
        let bool_ = CString::new("Bool").unwrap();
        let beacon = CString::new("LIGHT BEACON").unwrap();
        (api.add)(h, DEF_PROP_LICHT, beacon.as_ptr(), bool_.as_ptr(), DATATYPE_FLOAT64, 0.0, UNUSED);
        let aus = CString::new("SIM DISABLED").unwrap();
        (api.add)(h, DEF_PROP_HALT, aus.as_ptr(), bool_.as_ptr(), DATATYPE_FLOAT64, 0.0, UNUSED);
    }
    // gesetzte Fahrzeuge: Kennung → Objekt im Simulator; offene Anfragen; später anhalten
    let mut props: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    let mut offen: std::collections::HashMap<u32, (String, Instant, String)> = std::collections::HashMap::new();
    let mut weg_offen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut halt: Vec<(Instant, u32)> = Vec::new();
    let mut naechste_req = REQ_PROP_AB;
    let mut liste: Vec<String> = Vec::new();
    let mut ausnahmen = 0u32;
    // alte Aufträge (aus einer früheren Verbindung) verwerfen – Fahrzeuge setzt die Oberfläche neu
    if let Ok(mut l) = AUFTRAEGE.lock() {
        l.retain(|a| matches!(a, Auftrag::Zeit(_) | Auftrag::Suchen));
    }
    let _ = app.emit("msfs-props-neu", ());
    let mut carls_verbunden = false;
    let mut carls_warte = 0u32;
    let mut carls_gemeldet: Option<CarlsStatus> = None;
    status(app, "verbunden", "Mit dem Flugsimulator verbunden", Some(dll));
    let mut letzte = Instant::now();
    let mut ergebnis = Ok(true);
    while !stop.load(Ordering::SeqCst) {
        let auftraege: Vec<Auftrag> = AUFTRAEGE.lock().map(|mut l| std::mem::take(&mut *l)).unwrap_or_default();
        for a in auftraege {
            match a {
                Auftrag::Zeit(ms) => {
                    let Some(tx) = api.transmit else {
                        let _ = app.emit("msfs-zeit-gesetzt", "Diese SimConnect.dll kann die Uhrzeit nicht setzen");
                        continue;
                    };
                    let (j, tag, std, min) = utc_teile(ms);
                    // Jahr, Tag, Stunde, Minute – die Stunde noch einmal, falls das Setzen der Minute sie verstellt
                    for (ev, w) in [(EV_JAHR, j), (EV_TAG, tag), (EV_STUNDE, std), (EV_MINUTE, min), (EV_STUNDE, std)] {
                        unsafe { tx(h, OBJECT_ID_USER, ev, w as u32, GRUPPE_HOECHSTE, FLAG_GRUPPE_IST_PRIO) };
                    }
                    let _ = app.emit("msfs-zeit-gesetzt", format!("{j}-{tag:03} {std:02}:{min:02} UTC"));
                }
                Auftrag::Setzen { id, titel, lat, lon, kurs } => {
                    if let (Some(alt), Some(rm)) = (props.remove(&id), api.remove) {
                        unsafe { rm(h, alt, 0) };
                    }
                    weg_offen.remove(&id);
                    let pos = InitPos { lat, lon, alt: 0.0, pitch: 0.0, bank: 0.0, heading: kurs, on_ground: 1, airspeed: 0 };
                    let t = CString::new(titel.clone()).unwrap_or_default();
                    let leer = CString::new("").unwrap();
                    let req = naechste_req;
                    naechste_req = if naechste_req > 900_000 { REQ_PROP_AB } else { naechste_req + 1 };
                    let hr = unsafe {
                        if let Some(c) = api.create_ex1 {
                            c(h, t.as_ptr(), leer.as_ptr(), pos, req)
                        } else if let Some(c) = api.create {
                            c(h, t.as_ptr(), pos, req)
                        } else {
                            -1
                        }
                    };
                    if hr < 0 {
                        let _ = app.emit("msfs-prop", PropMeldung { id, ok: false, text: format!("„{titel}“ ließ sich nicht setzen (0x{:08x})", hr as u32) });
                    } else {
                        offen.insert(req, (id, Instant::now(), titel));
                    }
                }
                Auftrag::Weg(id) => {
                    if let Some(o) = props.remove(&id) {
                        if let Some(rm) = api.remove {
                            unsafe { rm(h, o, 0) };
                        }
                    } else if offen.values().any(|(i, _, _)| *i == id) {
                        weg_offen.insert(id);
                    }
                }
                Auftrag::Suchen => {
                    liste.clear();
                    match api.enumerate {
                        Some(en) => unsafe {
                            en(h, REQ_ENUM, SIMOBJECT_TYPE_ALL);
                        },
                        None => {
                            let _ = app.emit("msfs-props-liste", (Vec::<String>::new(), "Diese SimConnect.dll kann die Modelle nicht auflisten (erst ab MSFS 2024)"));
                        }
                    }
                }
            }
        }
        // gesetzte Fahrzeuge nach kurzer Zeit anhalten (Bodenfahrzeuge fahren sonst los)
        if !halt.is_empty() {
            let jetzt = Instant::now();
            halt.retain(|(wann, o)| {
                if *wann > jetzt {
                    return true;
                }
                if let Some(set) = api.set {
                    let mut eins = 1.0f64;
                    unsafe { set(h, DEF_PROP_HALT, *o, 0, 0, 8, &mut eins as *mut f64 as *mut c_void) };
                }
                false
            });
        }
        // keine Antwort auf das Setzen: Titel gibt es wohl nicht
        let alt: Vec<u32> = offen.iter().filter(|(_, (_, seit, _))| seit.elapsed() > Duration::from_secs(8)).map(|(r, _)| *r).collect();
        for r in alt {
            if let Some((id, _, titel)) = offen.remove(&r) {
                weg_offen.remove(&id);
                let _ = app.emit("msfs-prop", PropMeldung { id, ok: false, text: format!("MSFS hat „{titel}“ nicht gesetzt – Modell nicht installiert?") });
            }
        }
        let mut p: *mut u8 = std::ptr::null_mut();
        let mut n: u32 = 0;
        let hr = unsafe { (api.dispatch)(h, &mut p, &mut n) };
        if hr >= 0 && !p.is_null() && n >= 12 {
            let b = unsafe { std::slice::from_raw_parts(p, n as usize) };
            let art = u32_bei(b, 8);
            // Liste der Modelle (SIMCONNECT_RECV_ENUMERATE_SIMOBJECT_AND_LIVERY_LIST): Kopf 28 Byte, je Eintrag 256 + 256 Byte Text
            if art != RECV_SIMOBJECT_DATA && b.len() >= 28 && u32_bei(b, 12) == REQ_ENUM && (b.len() - 28) % 512 == 0 {
                let anzahl = u32_bei(b, 16) as usize;
                let nr = u32_bei(b, 20);
                let von = u32_bei(b, 24);
                for i in 0..anzahl.min((b.len() - 28) / 512) {
                    let roh = &b[28 + i * 512..28 + i * 512 + 256];
                    let ende = roh.iter().position(|&c| c == 0).unwrap_or(256);
                    let titel = String::from_utf8_lossy(&roh[..ende]).trim().to_string();
                    let klein = titel.to_lowercase();
                    if !titel.is_empty() && PROP_WOERTER.iter().any(|w| klein.contains(w)) && !liste.contains(&titel) {
                        liste.push(titel);
                    }
                }
                if nr + 1 >= von {
                    let _ = app.emit("msfs-props-liste", (liste.clone(), ""));
                }
                continue;
            }
            match art {
                RECV_ASSIGNED_OBJECT_ID if b.len() >= 20 => {
                    let req = u32_bei(b, 12);
                    let obj = u32_bei(b, 16);
                    if let Some((id, _, titel)) = offen.remove(&req) {
                        if weg_offen.remove(&id) {
                            if let Some(rm) = api.remove {
                                unsafe { rm(h, obj, 0) };
                            }
                            continue;
                        }
                        if let Some(set) = api.set {
                            let mut eins = 1.0f64;
                            unsafe { set(h, DEF_PROP_LICHT, obj, 0, 0, 8, &mut eins as *mut f64 as *mut c_void) };
                        }
                        halt.push((Instant::now() + Duration::from_secs(4), obj));
                        props.insert(id.clone(), obj);
                        let _ = app.emit("msfs-prop", PropMeldung { id, ok: true, text: titel });
                    }
                }
                RECV_SIMOBJECT_DATA if b.len() >= DATEN_AB + 8 * ZEIT_WERTE.len() && u32_bei(b, 12) == REQ_ZEIT => {
                    let w = |k: usize| f64_bei(b, DATEN_AB + 8 * k);
                    let _ = app.emit("msfs-zeit", MsfsZeit { zulu: w(0), tag: w(1), jahr: w(2), abs: w(3) });
                }
                RECV_EXCEPTION if b.len() >= 16 => {
                    // zur Fehlersuche (z. B. Ereignis oder Wert unbekannt): Code an die Oberfläche, höchstens 50
                    if ausnahmen < 50 {
                        ausnahmen += 1;
                        let _ = app.emit("msfs-ausnahme", u32_bei(b, 12));
                    }
                }
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
                RECV_OPEN => {}
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

/// Uhrzeit im MSFS setzen (Unix-Millisekunden, Spielzeit von LeitWerk) – wirkt bei bestehender Verbindung
#[tauri::command]
pub fn msfs_zeit_setzen(ms: f64) {
    if let Ok(mut l) = AUFTRAEGE.lock() {
        l.retain(|a| !matches!(a, Auftrag::Zeit(_)));
    }
    auftrag(Auftrag::Zeit(ms));
}

/// Fahrzeug (oder Trage, Unfallobjekt) am Einsatzort setzen: Titel des SimObjects, Position, Richtung (Grad)
#[tauri::command]
pub fn msfs_prop_setzen(id: String, titel: String, lat: f64, lon: f64, kurs: f64) {
    auftrag(Auftrag::Setzen { id, titel, lat, lon, kurs });
}

#[tauri::command]
pub fn msfs_prop_weg(id: String) {
    auftrag(Auftrag::Weg(id));
}

/// Liste der installierten Einsatzfahrzeug-Modelle vom Simulator holen (Antwort: Ereignis „msfs-props-liste“)
#[tauri::command]
pub fn msfs_props_suchen() {
    auftrag(Auftrag::Suchen);
}

/// Titel aus dem Community-Ordner (SimObjects/*/*/aircraft.cfg bzw. sim.cfg) – auch ohne laufenden Simulator
#[tauri::command]
pub fn msfs_props_ordner(community: Option<String>) -> Vec<String> {
    let ordner: Vec<PathBuf> = match community.filter(|c| !c.trim().is_empty()) {
        Some(c) => vec![PathBuf::from(c)],
        None => crate::gtn::communities(),
    };
    let mut l: Vec<String> = Vec::new();
    for c in ordner {
        let Ok(pakete) = std::fs::read_dir(&c) else { continue };
        for pk in pakete.flatten() {
            let so = pk.path().join("SimObjects");
            let Ok(arten) = std::fs::read_dir(&so) else { continue };
            for art in arten.flatten() {
                let Ok(objekte) = std::fs::read_dir(art.path()) else { continue };
                for ob in objekte.flatten() {
                    for datei in ["aircraft.cfg", "sim.cfg"] {
                        let Ok(t) = std::fs::read_to_string(ob.path().join(datei)) else { continue };
                        for z in t.lines() {
                            let z = z.trim();
                            let Some(rest) = z.strip_prefix("title").map(|r| r.trim_start()) else { continue };
                            let Some(wert) = rest.strip_prefix('=') else { continue };
                            let titel = wert.split(';').next().unwrap_or("").trim().trim_matches('"').trim().to_string();
                            let klein = titel.to_lowercase();
                            if !titel.is_empty() && PROP_WOERTER.iter().any(|w| klein.contains(w)) && !l.contains(&titel) {
                                l.push(titel);
                            }
                        }
                    }
                }
            }
        }
    }
    l
}

/// Seite im Browser öffnen – nur Download-Seiten auf flightsim.to (Fahrzeuge für MSFS)
#[tauri::command]
pub fn link_oeffnen(url: String) -> Result<(), String> {
    if !url.starts_with("https://flightsim.to/") || url.contains(['"', ' ', '&', '|', '^', '<', '>']) {
        return Err("Diese Adresse öffnet LeitWerk nicht".into());
    }
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("explorer").arg(&url).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let r = std::process::Command::new("xdg-open").arg(&url).spawn();
    r.map(|_| ()).map_err(|e| format!("Browser ließ sich nicht öffnen: {e}"))
}

#[tauri::command]
pub fn msfs_stoppen() {
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
    fn utc_teile_stimmt() {
        // 2026-11-18 09:05 UTC
        assert_eq!(utc_teile(1_794_992_700_000.0), (2026, 322, 9, 5));
        // 2024-12-31 23:59 UTC (Schaltjahr: Tag 366)
        assert_eq!(utc_teile(1_735_689_540_000.0), (2024, 366, 23, 59));
        assert_eq!(utc_teile(0.0), (1970, 1, 0, 0));
    }
}
