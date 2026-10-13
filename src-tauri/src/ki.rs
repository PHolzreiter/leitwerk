//! KI-Anrufer über Ollama (läuft als eigenes Programm auf dem Rechner, http://127.0.0.1:11434).
//! LeitWerk kann Ollama installieren, starten/beenden, Modelle laden und Gespräche führen.

use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

const BASIS: &str = "http://127.0.0.1:11434";

/// Ollama beim Beenden von LeitWerk mitbeenden (Einstellung des Spielers)
pub static BEIM_BEENDEN_STOPPEN: AtomicBool = AtomicBool::new(false);

fn client(timeout: Option<Duration>) -> Result<reqwest::Client, String> {
    let mut b = reqwest::Client::builder().user_agent(concat!("LeitWerk/", env!("CARGO_PKG_VERSION")));
    if let Some(t) = timeout {
        b = b.timeout(t);
    }
    b.build().map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KiStatus {
    installiert: bool,
    laeuft: bool,
    version: Option<String>,
    modelle: Vec<String>,
}

fn app_pfad() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let sys = PathBuf::from("/Applications/Ollama.app");
        if sys.exists() {
            return Some(sys);
        }
        if let Some(home) = std::env::var_os("HOME") {
            let p = PathBuf::from(home).join("Applications/Ollama.app");
            if p.exists() {
                return Some(p);
            }
        }
        None
    }
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from)?;
        let p = base.join("Programs").join("Ollama").join("ollama app.exe");
        if p.exists() {
            return Some(p);
        }
        None
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

fn cli_vorhanden() -> bool {
    let mut c = Command::new("ollama");
    c.arg("--version");
    versteckt(&mut c);
    c.output().map(|o| o.status.success()).unwrap_or(false)
}

#[allow(unused_variables)]
fn versteckt(c: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
}

async fn version() -> Option<String> {
    #[derive(Deserialize)]
    struct V {
        version: String,
    }
    let r = client(Some(Duration::from_millis(1500))).ok()?.get(format!("{BASIS}/api/version")).send().await.ok()?;
    r.json::<V>().await.ok().map(|v| v.version)
}

async fn modelle() -> Vec<String> {
    #[derive(Deserialize)]
    struct M {
        name: String,
    }
    #[derive(Deserialize)]
    struct T {
        models: Vec<M>,
    }
    let Ok(c) = client(Some(Duration::from_secs(3))) else { return vec![] };
    let Ok(r) = c.get(format!("{BASIS}/api/tags")).send().await else { return vec![] };
    r.json::<T>().await.map(|t| t.models.into_iter().map(|m| m.name).collect()).unwrap_or_default()
}

#[tauri::command]
pub async fn ki_status() -> KiStatus {
    let v = version().await;
    let laeuft = v.is_some();
    KiStatus {
        installiert: laeuft || app_pfad().is_some() || cli_vorhanden(),
        laeuft,
        version: v,
        modelle: if laeuft { modelle().await } else { vec![] },
    }
}

/// Startet Ollama im Hintergrund (ohne Fenster) und wartet, bis es antwortet.
#[tauri::command]
pub async fn ki_starten() -> Result<(), String> {
    if version().await.is_some() {
        return Ok(());
    }
    let gestartet = if let Some(app) = app_pfad() {
        #[cfg(target_os = "macos")]
        {
            Command::new("open").arg("-g").arg("-a").arg(&app).spawn().is_ok()
        }
        #[cfg(not(target_os = "macos"))]
        {
            let mut c = Command::new(&app);
            versteckt(&mut c);
            c.spawn().is_ok()
        }
    } else {
        let mut c = Command::new("ollama");
        c.arg("serve");
        versteckt(&mut c);
        c.spawn().is_ok()
    };
    if !gestartet {
        return Err("Ollama konnte nicht gestartet werden – ist es installiert?".into());
    }
    for _ in 0..40 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if version().await.is_some() {
            return Ok(());
        }
    }
    Err("Ollama startet nicht – bitte einmal selbst öffnen".into())
}

pub fn ollama_beenden() {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("osascript").args(["-e", "quit app \"Ollama\""]).output();
    }
    #[cfg(target_os = "windows")]
    {
        for name in ["ollama app.exe", "ollama.exe"] {
            let mut c = Command::new("taskkill");
            c.args(["/IM", name, "/F"]);
            versteckt(&mut c);
            let _ = c.output();
        }
    }
}

#[tauri::command]
pub fn ki_beenden() {
    ollama_beenden();
}

#[tauri::command]
pub fn ki_beim_beenden(stoppen: bool) {
    BEIM_BEENDEN_STOPPEN.store(stoppen, Ordering::SeqCst);
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KiFortschritt {
    text: String,
    done: u64,
    total: u64,
}

#[cfg_attr(not(any(target_os = "macos", windows)), allow(dead_code))]
async fn herunterladen(url: &str, ziel: &PathBuf, ch: &Channel<KiFortschritt>) -> Result<(), String> {
    use std::io::Write;
    let r = client(None)?.get(url).send().await.map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("Download fehlgeschlagen (HTTP {})", r.status().as_u16()));
    }
    let total = r.content_length().unwrap_or(0);
    let mut f = std::fs::File::create(ziel).map_err(|e| e.to_string())?;
    let mut done = 0u64;
    let mut last = 0u64;
    let mut s = r.bytes_stream();
    while let Some(chunk) = s.next().await {
        let chunk = chunk.map_err(|e| format!("Download abgebrochen: {e}"))?;
        f.write_all(&chunk).map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        if done - last > 1_000_000 || done == total {
            last = done;
            let _ = ch.send(KiFortschritt { text: "Ollama wird geladen …".into(), done, total });
        }
    }
    Ok(())
}

/// Lädt das offizielle Installationsprogramm von ollama.com und startet es.
#[tauri::command]
pub async fn ki_installieren(on_progress: Channel<KiFortschritt>) -> Result<String, String> {
    let tmp = std::env::temp_dir();
    #[cfg(target_os = "macos")]
    {
        let zip = tmp.join("Ollama-darwin.zip");
        herunterladen("https://ollama.com/download/Ollama-darwin.zip", &zip, &on_progress).await?;
        let _ = on_progress.send(KiFortschritt { text: "Ollama wird installiert …".into(), done: 0, total: 0 });
        let mut ziel = PathBuf::from("/Applications");
        let ok = Command::new("ditto").arg("-x").arg("-k").arg(&zip).arg(&ziel).status().map(|s| s.success()).unwrap_or(false);
        if !ok {
            ziel = PathBuf::from(std::env::var_os("HOME").ok_or("Kein Benutzerordner")?).join("Applications");
            std::fs::create_dir_all(&ziel).map_err(|e| e.to_string())?;
            let ok2 = Command::new("ditto").arg("-x").arg("-k").arg(&zip).arg(&ziel).status().map(|s| s.success()).unwrap_or(false);
            if !ok2 {
                return Err("Ollama konnte nicht entpackt werden".into());
            }
        }
        let _ = std::fs::remove_file(&zip);
        let _ = Command::new("open").arg(ziel.join("Ollama.app")).spawn();
        Ok("Ollama ist installiert und wird gestartet. Falls macOS nachfragt, bitte „Öffnen“ bestätigen.".into())
    }
    #[cfg(target_os = "windows")]
    {
        let exe = tmp.join("OllamaSetup.exe");
        herunterladen("https://ollama.com/download/OllamaSetup.exe", &exe, &on_progress).await?;
        Command::new(&exe).spawn().map_err(|e| format!("Installationsprogramm startet nicht: {e}"))?;
        Ok("Das Installationsprogramm von Ollama ist geöffnet – bitte durchklicken. Danach hier „Prüfen“ drücken.".into())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (tmp, on_progress);
        Err("Bitte Ollama selbst installieren: https://ollama.com/download".into())
    }
}

/// Lädt ein Modell über Ollama (z. B. „qwen3:8b“).
#[tauri::command]
pub async fn ki_modell_laden(name: String, on_progress: Channel<KiFortschritt>) -> Result<(), String> {
    #[derive(Deserialize)]
    struct Zeile {
        status: Option<String>,
        total: Option<u64>,
        completed: Option<u64>,
        error: Option<String>,
    }
    let r = client(None)?
        .post(format!("{BASIS}/api/pull"))
        .json(&serde_json::json!({ "model": name, "stream": true }))
        .send()
        .await
        .map_err(|e| format!("Ollama nicht erreichbar: {e}"))?;
    let mut s = r.bytes_stream();
    let mut puffer = Vec::new();
    while let Some(chunk) = s.next().await {
        let chunk = chunk.map_err(|e| format!("Download abgebrochen: {e}"))?;
        puffer.extend_from_slice(&chunk);
        while let Some(pos) = puffer.iter().position(|b| *b == b'\n') {
            let zeile: Vec<u8> = puffer.drain(..=pos).collect();
            if let Ok(z) = serde_json::from_slice::<Zeile>(&zeile) {
                if let Some(e) = z.error {
                    return Err(format!("Modell konnte nicht geladen werden: {e}"));
                }
                let _ = on_progress.send(KiFortschritt {
                    text: z.status.unwrap_or_default(),
                    done: z.completed.unwrap_or(0),
                    total: z.total.unwrap_or(0),
                });
            }
        }
    }
    Ok(())
}

#[derive(Deserialize, Serialize, Clone)]
pub struct ChatNachricht {
    role: String,
    content: String,
}

/// Gesprächsschritt: schickt den Verlauf, liefert die Antwort Stück für Stück und am Ende ganz.
#[tauri::command]
pub async fn ki_chat(model: String, messages: Vec<ChatNachricht>, on_token: Channel<String>) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Msg {
        content: Option<String>,
    }
    #[derive(Deserialize)]
    struct Zeile {
        message: Option<Msg>,
        error: Option<String>,
    }
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "keep_alive": "15m",
        "options": { "temperature": 0.8, "num_ctx": 6144 }
    });
    // Modelle mit „Denkmodus“: für schnelle Antworten abschalten
    if model.starts_with("qwen3") || model.starts_with("deepseek-r1") {
        body["think"] = serde_json::json!(false);
    }
    let r = client(Some(Duration::from_secs(180)))?
        .post(format!("{BASIS}/api/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("KI nicht erreichbar: {e}"))?;
    if !r.status().is_success() {
        let t = r.text().await.unwrap_or_default();
        return Err(format!("KI-Fehler: {}", t.chars().take(200).collect::<String>()));
    }
    let mut s = r.bytes_stream();
    let mut puffer = Vec::new();
    let mut ganz = String::new();
    while let Some(chunk) = s.next().await {
        let chunk = chunk.map_err(|e| format!("KI-Verbindung abgebrochen: {e}"))?;
        puffer.extend_from_slice(&chunk);
        while let Some(pos) = puffer.iter().position(|b| *b == b'\n') {
            let zeile: Vec<u8> = puffer.drain(..=pos).collect();
            if let Ok(z) = serde_json::from_slice::<Zeile>(&zeile) {
                if let Some(e) = z.error {
                    return Err(format!("KI-Fehler: {e}"));
                }
                if let Some(t) = z.message.and_then(|m| m.content) {
                    if !t.is_empty() {
                        ganz.push_str(&t);
                        let _ = on_token.send(t);
                    }
                }
            }
        }
    }
    Ok(ganz)
}
