mod addresses;
mod packs;
mod routing;
mod updater;

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use addresses::{AddressHit, Addresses};
use routing::{Graph, RouteResult};

use tauri::path::BaseDirectory;
use tauri::ipc::Channel;
use tauri::{Manager, State};

/// Größter Byte-Bereich, der in einem Aufruf gelesen wird.
const MAX_READ: u64 = 64 * 1024 * 1024;

/// Kartendateien (aus den Kartenpaketen), von grob nach fein:
/// overview = Europa grob, basis = NÖ/Wien mittlere Detailtiefe (Grundpaket),
/// ring = Umland mittel, core = NÖ/Wien volle Detailtiefe, terrain = Höhendaten.
const MAP_FILES: [&str; 5] = ["overview", "basis", "ring", "core", "terrain"];
const ROADS_FILE: &str = "roads.lwrg.gz";
const ADDR_FILE: &str = "addresses.tsv.gz";

/// Orte, an denen Daten gesucht werden: zuerst die heruntergeladenen Pakete,
/// dann (für Entwicklung und ältere Installationen) die Programmressourcen.
struct DataDirs {
    packs: PathBuf,
    resources: Option<PathBuf>,
}

impl DataDirs {
    fn resolve(&self, file: &str) -> Option<PathBuf> {
        let p = self.packs.join(file);
        if p.is_file() {
            return Some(p);
        }
        self.resources.as_ref().map(|r| r.join(file)).filter(|p| p.is_file())
    }
}

/// Offene Kartendateien. Werden geschlossen, bevor Pakete ersetzt oder gelöscht werden.
struct Maps {
    dirs: Arc<DataDirs>,
    open: Mutex<HashMap<String, Arc<Mutex<File>>>>,
}

impl Maps {
    fn file(&self, name: &str) -> Result<Arc<Mutex<File>>, String> {
        if !MAP_FILES.contains(&name) {
            return Err(format!("Unbekannte Kartendatei: {name}"));
        }
        let mut open = self.open.lock().map_err(|_| "Kartenzugriff gesperrt".to_string())?;
        if let Some(f) = open.get(name) {
            return Ok(f.clone());
        }
        let path = self
            .dirs
            .resolve(&format!("{name}.pmtiles"))
            .ok_or_else(|| format!("Kartendatei {name} ist nicht installiert"))?;
        let f = File::open(&path).map_err(|e| format!("Kartendatei konnte nicht geöffnet werden ({}): {e}", path.display()))?;
        let f = Arc::new(Mutex::new(f));
        open.insert(name.to_string(), f.clone());
        Ok(f)
    }

    fn close_all(&self) {
        if let Ok(mut open) = self.open.lock() {
            open.clear();
        }
    }
}

/// Liest einen Byte-Bereich aus einer Kartendatei. Die Oberfläche fordert damit
/// genau die Kartenkacheln an, die gerade sichtbar sind.
#[tauri::command]
fn map_read(maps: State<'_, Maps>, name: String, offset: u64, length: u64) -> Result<tauri::ipc::Response, String> {
    if length > MAX_READ {
        return Err(format!("Angeforderter Bereich zu groß: {length} Bytes"));
    }
    let file = maps.file(&name)?;
    let mut file = file.lock().map_err(|_| "Kartendatei ist gesperrt".to_string())?;
    file.seek(SeekFrom::Start(offset)).map_err(|e| format!("Lesefehler: {e}"))?;
    let mut buf = Vec::with_capacity(length as usize);
    Read::take(&mut *file, length)
        .read_to_end(&mut buf)
        .map_err(|e| format!("Lesefehler: {e}"))?;
    Ok(tauri::ipc::Response::new(buf))
}

/// Liefert die Namen der vorhandenen Kartendateien.
#[tauri::command]
fn map_files(maps: State<'_, Maps>) -> Vec<String> {
    MAP_FILES
        .iter()
        .filter(|n| maps.dirs.resolve(&format!("{n}.pmtiles")).is_some())
        .map(|n| n.to_string())
        .collect()
}

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Datenordner nicht gefunden: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Datenordner nicht anlegbar: {e}"))?;
    Ok(dir.join("leitstelle.json"))
}

/// Lädt die gespeicherte Leitstelle (JSON) oder nichts, wenn noch keine existiert.
#[tauri::command]
fn store_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = store_path(&app)?;
    if !path.is_file() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("Leitstelle konnte nicht geladen werden: {e}"))
}

/// Speichert die Leitstelle. Erst in eine Hilfsdatei, dann umbenennen,
/// damit bei einem Absturz keine halbe Datei zurückbleibt.
#[tauri::command]
fn store_save(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let path = store_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))
}

/// Automatische Sicherung des laufenden Spiels (Spielstand).
#[tauri::command]
fn autosave_write(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let path = store_path(&app)?.with_file_name("spielstand-autosave.json");
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("Sicherung fehlgeschlagen: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Sicherung fehlgeschlagen: {e}"))
}

#[tauri::command]
fn autosave_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = store_path(&app)?.with_file_name("spielstand-autosave.json");
    if !path.is_file() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

/// Ort der gespeicherten Leitstelle (zur Anzeige).
#[tauri::command]
fn store_location(app: tauri::AppHandle) -> Result<String, String> {
    store_path(&app).map(|p| p.display().to_string())
}

/// Straßennetz und Adressen werden im Hintergrund geladen (beim Start und
/// nach der Installation des Grundpakets).
enum Slot<T> {
    Missing,
    Loading,
    Ready(Arc<T>),
    Failed(String),
}

struct Geo {
    graph: RwLock<Slot<Graph>>,
    addresses: RwLock<Slot<Addresses>>,
}

type GeoState = Arc<Geo>;

fn get_slot<T>(slot: &RwLock<Slot<T>>, what: &str) -> Result<Arc<T>, String> {
    match &*slot.read().map_err(|_| "gesperrt".to_string())? {
        Slot::Ready(v) => Ok(v.clone()),
        Slot::Loading => Err(format!("{what} wird noch geladen …")),
        Slot::Missing => Err(format!("{what} ist nicht installiert (Grundpaket fehlt)")),
        Slot::Failed(e) => Err(e.clone()),
    }
}

fn graph(geo: &Geo) -> Result<Arc<Graph>, String> {
    get_slot(&geo.graph, "Straßennetz")
}

fn addr(geo: &Geo) -> Result<Arc<Addresses>, String> {
    get_slot(&geo.addresses, "Adressverzeichnis")
}

/// Lädt Straßennetz und Adressen neu (in eigenen Threads).
fn load_geo(geo: &GeoState, dirs: &DataDirs) {
    match dirs.resolve(ROADS_FILE) {
        None => *geo.graph.write().unwrap() = Slot::Missing,
        Some(p) => {
            *geo.graph.write().unwrap() = Slot::Loading;
            let g = geo.clone();
            std::thread::spawn(move || {
                let r = Graph::load(&p);
                *g.graph.write().unwrap() = match r {
                    Ok(v) => Slot::Ready(Arc::new(v)),
                    Err(e) => Slot::Failed(e),
                };
            });
        }
    }
    match dirs.resolve(ADDR_FILE) {
        None => *geo.addresses.write().unwrap() = Slot::Missing,
        Some(p) => {
            *geo.addresses.write().unwrap() = Slot::Loading;
            let g = geo.clone();
            std::thread::spawn(move || {
                let r = Addresses::load(&p);
                *g.addresses.write().unwrap() = match r {
                    Ok(v) => Slot::Ready(Arc::new(v)),
                    Err(e) => Slot::Failed(e),
                };
            });
        }
    }
}

#[derive(serde::Serialize)]
struct GeoStatus {
    roads: String,
    roads_nodes: usize,
    addresses: String,
    address_count: usize,
}

fn state_label<T>(slot: &RwLock<Slot<T>>) -> String {
    match &*slot.read().unwrap() {
        Slot::Missing => "fehlt".into(),
        Slot::Loading => "laden".into(),
        Slot::Ready(_) => "bereit".into(),
        Slot::Failed(e) => format!("Fehler: {e}"),
    }
}

#[tauri::command]
fn geo_status(geo: State<'_, GeoState>) -> GeoStatus {
    GeoStatus {
        roads: state_label(&geo.graph),
        roads_nodes: graph(&geo).map_or(0, |g| g.node_count()),
        addresses: state_label(&geo.addresses),
        address_count: addr(&geo).map_or(0, |a| a.len()),
    }
}

/// Schnellste Route. Punkte als [Breitengrad, Längengrad].
#[tauri::command]
async fn route(geo: State<'_, GeoState>, from: [f64; 2], to: [f64; 2]) -> Result<RouteResult, String> {
    let g = graph(&geo)?;
    tauri::async_runtime::spawn_blocking(move || g.route((from[0], from[1]), (to[0], to[1])))
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Keine Route gefunden".to_string())
}

/// Fahrzeiten (Sekunden, ohne Sondersignal) von vielen Punkten zu einem Ziel.
#[tauri::command]
async fn travel_times(
    geo: State<'_, GeoState>,
    to: [f64; 2],
    sources: Vec<[f64; 2]>,
) -> Result<Vec<Option<f64>>, String> {
    let g = graph(&geo)?;
    let src: Vec<(f64, f64)> = sources.iter().map(|p| (p[0], p[1])).collect();
    tauri::async_runtime::spawn_blocking(move || g.travel_times_to((to[0], to[1]), &src, 3.0 * 3600.0))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn address_search(geo: State<'_, GeoState>, query: String, limit: Option<usize>) -> Result<Vec<AddressHit>, String> {
    let a = addr(&geo)?;
    tauri::async_runtime::spawn_blocking(move || a.search(&query, limit.unwrap_or(12)))
        .await
        .map_err(|e| e.to_string())
}

/// Zufällige Adressen in einem Rechteck [min_lon, min_lat, max_lon, max_lat].
#[tauri::command]
async fn address_random(
    geo: State<'_, GeoState>,
    bbox: [f64; 4],
    count: usize,
    seed: u64,
) -> Result<Vec<AddressHit>, String> {
    let a = addr(&geo)?;
    tauri::async_runtime::spawn_blocking(move || a.random_in(bbox, count, seed))
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- Kartenpakete

/// Pakete, die nicht gelöscht werden dürfen.
const PFLICHT_PAKETE: [&str; 1] = ["grund"];

static PACK_BUSY: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PacksLocal {
    installed: packs::Installed,
    dir: String,
}

/// Installierte Pakete (ohne Internet).
#[tauri::command]
fn packs_local(maps: State<'_, Maps>) -> PacksLocal {
    PacksLocal {
        installed: packs::read_installed(&maps.dirs.packs),
        dir: maps.dirs.packs.display().to_string(),
    }
}

/// Verzeichnis aller verfügbaren Pakete (aus dem Internet).
#[tauri::command]
async fn packs_manifest() -> Result<packs::Manifest, String> {
    packs::fetch_manifest().await
}

struct BusyGuard;
impl Drop for BusyGuard {
    fn drop(&mut self) {
        PACK_BUSY.store(false, Ordering::SeqCst);
    }
}

/// Lädt ein Paket herunter und installiert es. Fortschritt über den Kanal.
#[tauri::command]
async fn pack_install(
    maps: State<'_, Maps>,
    geo: State<'_, GeoState>,
    id: String,
    on_progress: Channel<packs::Progress>,
) -> Result<(), String> {
    if PACK_BUSY.swap(true, Ordering::SeqCst) {
        return Err("Es wird bereits ein Paket geladen".into());
    }
    let _busy = BusyGuard;
    let manifest = packs::fetch_manifest().await?;
    let pack = manifest
        .packs
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or_else(|| format!("Paket {id} nicht gefunden"))?;
    let dir = maps.dirs.packs.clone();
    let total: u64 = pack.files.iter().map(|f| f.size).sum();
    let mut done = 0u64;
    let mut last_sent = 0u64;
    let mut parts = Vec::new();
    for f in &pack.files {
        let part = packs::download_file(&dir, f, |n| {
            done += n;
            if done - last_sent > 512 * 1024 || done == total {
                last_sent = done;
                let _ = on_progress.send(packs::Progress { pack: pack.id.clone(), file: f.name.clone(), done, total });
            }
        })
        .await?;
        parts.push((part, dir.join(&f.name)));
    }
    // Erst jetzt ersetzen: offene Karten schließen, dann umbenennen
    maps.close_all();
    for (part, target) in parts {
        let _ = fs::remove_file(&target);
        fs::rename(&part, &target).map_err(|e| format!("Installation fehlgeschlagen: {e}"))?;
    }
    let mut inst = packs::read_installed(&dir);
    // Dateien, die eine ältere Version des Pakets hatte, aber die neue nicht mehr
    if let Some(old) = inst.get(&pack.id) {
        let neu: Vec<&String> = pack.files.iter().map(|f| &f.name).collect();
        let weg: Vec<String> = old.files.iter().filter(|f| !neu.contains(f)).cloned().collect();
        packs::remove_files(&dir, &weg);
    }
    inst.insert(
        pack.id.clone(),
        packs::InstalledPack { version: pack.version.clone(), files: pack.files.iter().map(|f| f.name.clone()).collect() },
    );
    packs::write_installed(&dir, &inst)?;
    if pack.files.iter().any(|f| f.name == ROADS_FILE || f.name == ADDR_FILE) {
        load_geo(&geo, &maps.dirs);
    }
    Ok(())
}

/// Löscht ein installiertes Paket (nicht das Grundpaket).
#[tauri::command]
fn pack_remove(maps: State<'_, Maps>, id: String) -> Result<(), String> {
    if PFLICHT_PAKETE.contains(&id.as_str()) {
        return Err("Das Grundpaket kann nicht gelöscht werden".into());
    }
    if PACK_BUSY.load(Ordering::SeqCst) {
        return Err("Bitte warten, bis der laufende Download fertig ist".into());
    }
    let dir = maps.dirs.packs.clone();
    let mut inst = packs::read_installed(&dir);
    let Some(p) = inst.remove(&id) else { return Ok(()) };
    maps.close_all();
    packs::remove_files(&dir, &p.files);
    packs::write_installed(&dir, &inst)
}

/// Schreibt eine Textdatei an einen vom Benutzer gewählten Ort (CSV-Export).
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Datei konnte nicht geschrieben werden: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let resources = app.path().resolve("maps", BaseDirectory::Resource).ok();
            let dirs = Arc::new(DataDirs { packs: packs::packs_dir(&data_dir), resources });
            fs::create_dir_all(&dirs.packs)?;
            // Reste abgebrochener Downloads entfernen
            if let Ok(rd) = fs::read_dir(&dirs.packs) {
                for e in rd.flatten() {
                    if e.path().extension().is_some_and(|x| x == "part") {
                        let _ = fs::remove_file(e.path());
                    }
                }
            }
            let geo: GeoState = Arc::new(Geo { graph: RwLock::new(Slot::Missing), addresses: RwLock::new(Slot::Missing) });
            load_geo(&geo, &dirs);
            app.manage(geo);
            app.manage(Maps { dirs, open: Mutex::new(HashMap::new()) });
            app.manage(updater::PendingUpdate::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            map_read,
            map_files,
            store_load,
            store_save,
            store_location,
            autosave_write,
            autosave_read,
            write_text_file,
            geo_status,
            route,
            travel_times,
            address_search,
            address_random,
            packs_local,
            packs_manifest,
            pack_install,
            pack_remove,
            updater::update_check,
            updater::update_install,
            app_version
        ])
        .run(tauri::generate_context!())
        .expect("LeitWerk konnte nicht gestartet werden");
}

/// Programmversion (für die Anzeige).
#[tauri::command]
fn app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}
