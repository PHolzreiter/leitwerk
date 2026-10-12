//! Kartenpakete: werden nicht mehr mit dem Programm installiert, sondern bei Bedarf
//! aus dem öffentlichen Repo geladen (GitHub Release „karten“).
//!
//! Ablauf: packs.json (Verzeichnis aller Pakete mit Dateien, Größen und SHA-256)
//! laden, Dateien als *.part herunterladen, Prüfsumme kontrollieren, umbenennen,
//! installierte Version in installed.json vermerken.

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Öffentliches Repo, in dem Programm-Updates und Kartenpakete als Releases liegen.
pub const DOWNLOAD_REPO: &str = "PHolzreiter/leitwerk";
const PACK_TAG: &str = "karten";

pub fn download_url(tag: &str, file: &str) -> String {
    format!("https://github.com/{DOWNLOAD_REPO}/releases/download/{tag}/{file}")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PackFile {
    pub name: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Pack {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub beschreibung: String,
    pub version: String,
    /// Pflichtpaket (Grundpaket): wird beim ersten Start geladen und kann nicht gelöscht werden
    #[serde(default)]
    pub pflicht: bool,
    pub files: Vec<PackFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Manifest {
    pub packs: Vec<Pack>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstalledPack {
    pub version: String,
    pub files: Vec<String>,
}

/// Installierte Pakete: id -> Version und Dateien
pub type Installed = BTreeMap<String, InstalledPack>;

pub fn packs_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("packs")
}

pub fn read_installed(dir: &Path) -> Installed {
    fs::read_to_string(dir.join("installed.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn write_installed(dir: &Path, inst: &Installed) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("installed.json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(inst).unwrap_or_default()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join("installed.json")).map_err(|e| e.to_string())
}

pub fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("LeitWerk/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

pub async fn fetch_manifest() -> Result<Manifest, String> {
    let resp = client()?
        .get(download_url(PACK_TAG, "packs.json"))
        .send()
        .await
        .map_err(|e| format!("Keine Verbindung zum Download-Server: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Paketverzeichnis nicht abrufbar (HTTP {})", resp.status().as_u16()));
    }
    resp.json::<Manifest>()
        .await
        .map_err(|e| format!("Paketverzeichnis fehlerhaft: {e}"))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub pack: String,
    pub file: String,
    pub done: u64,
    pub total: u64,
}

/// Lädt eine Datei in `<dir>/<name>.part`, prüft die Prüfsumme und gibt den Pfad der
/// fertigen Teil-Datei zurück (Umbenennen macht der Aufrufer, wenn die Karte geschlossen ist).
pub async fn download_file(
    dir: &Path,
    f: &PackFile,
    mut on_bytes: impl FnMut(u64),
) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let part = dir.join(format!("{}.part", f.name));
    let resp = client()?
        .get(download_url(PACK_TAG, &f.name))
        .send()
        .await
        .map_err(|e| format!("Download von {} fehlgeschlagen: {e}", f.name))?;
    if !resp.status().is_success() {
        return Err(format!("{} nicht verfügbar (HTTP {})", f.name, resp.status().as_u16()));
    }
    let mut out = File::create(&part).map_err(|e| format!("Datei nicht anlegbar: {e}"))?;
    let mut hasher = Sha256::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download von {} abgebrochen: {e}", f.name))?;
        hasher.update(&chunk);
        out.write_all(&chunk).map_err(|e| format!("Schreibfehler (Speicherplatz?): {e}"))?;
        on_bytes(chunk.len() as u64);
    }
    out.flush().map_err(|e| e.to_string())?;
    drop(out);
    let hash: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if !hash.eq_ignore_ascii_case(&f.sha256) {
        let _ = fs::remove_file(&part);
        return Err(format!("{}: Prüfsumme stimmt nicht – Download beschädigt, bitte erneut versuchen", f.name));
    }
    Ok(part)
}

pub fn remove_files(dir: &Path, files: &[String]) {
    for f in files {
        let _ = fs::remove_file(dir.join(f));
        let _ = fs::remove_file(dir.join(format!("{f}.part")));
    }
}
