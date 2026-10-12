//! Programm-Updates über das öffentliche Download-Repo.
//!
//! Die Release-Pipeline legt dort bei jeder neuen Version die signierten Pakete
//! und eine latest.json ab. Das Programm prüft beim Start, ob eine neuere Version
//! da ist, und installiert sie auf Wunsch (Signatur wird vom Updater geprüft).

use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::packs::DOWNLOAD_REPO;

#[derive(Default)]
pub struct PendingUpdate(pub Mutex<Option<Update>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    done: u64,
    total: u64,
}

/// Prüft, ob eine neuere Version verfügbar ist.
#[tauri::command]
pub async fn update_check(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<Option<UpdateInfo>, String> {
    let url = format!("https://github.com/{DOWNLOAD_REPO}/releases/latest/download/latest.json");
    let updater = app
        .updater_builder()
        .endpoints(vec![url.parse::<tauri::Url>().map_err(|e| e.to_string())?])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| format!("Update-Prüfung fehlgeschlagen: {e}"))?;
    let info = found.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone(),
    });
    *pending.0.lock().map_err(|_| "gesperrt".to_string())? = found;
    Ok(info)
}

/// Lädt das gefundene Update, installiert es und startet das Programm neu.
#[tauri::command]
pub async fn update_install(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    on_progress: Channel<UpdateProgress>,
) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .map_err(|_| "gesperrt".to_string())?
        .take()
        .ok_or_else(|| "Kein Update gefunden – bitte erneut prüfen".to_string())?;
    let mut done = 0u64;
    let mut last = 0u64;
    update
        .download_and_install(
            |chunk, total| {
                done += chunk as u64;
                let total = total.unwrap_or(0);
                if done - last > 256 * 1024 || done == total {
                    last = done;
                    let _ = on_progress.send(UpdateProgress { done, total });
                }
            },
            || {},
        )
        .await
        .map_err(|e| format!("Update fehlgeschlagen: {e}"))?;
    app.restart();
}
