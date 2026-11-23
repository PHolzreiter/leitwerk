//! Beitreten über einen Link (Beta 76): Der Discord-Knopf „Mitspielen“ führt auf eine kleine Seite des
//! Mehrspieler-Servers, die `leitwerk://beitreten/<Raumcode>` öffnet. Das System startet damit LeitWerk (bzw. gibt den
//! Link an das schon laufende LeitWerk weiter); hier wird der Raumcode herausgelesen und an die Oberfläche gemeldet.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

static WARTET: Mutex<Option<String>> = Mutex::new(None);

/// Raumcode aus `leitwerk://beitreten/123456` (6 Ziffern), sonst nichts
pub fn code_aus(url: &str) -> Option<String> {
    let rest = url.strip_prefix("leitwerk://")?;
    let rest = rest.strip_prefix("beitreten/").or_else(|| rest.strip_prefix("beitreten?code="))?;
    let code: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    (code.len() == 6).then_some(code)
}

/// Link empfangen: merken (falls die Oberfläche noch lädt), melden und das Hauptfenster nach vorne holen
pub fn empfangen(app: &AppHandle, url: &str) {
    let Some(code) = code_aus(url) else { return };
    if let Ok(mut w) = WARTET.lock() {
        *w = Some(code.clone());
    }
    let _ = app.emit("beitritt-link", code);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Wartender Raumcode (einmal abholen)
#[tauri::command]
pub fn beitritt_link_holen() -> Option<String> {
    WARTET.lock().ok().and_then(|mut w| w.take())
}

#[cfg(test)]
mod test {
    use super::code_aus;
    #[test]
    fn codes() {
        assert_eq!(code_aus("leitwerk://beitreten/123456").as_deref(), Some("123456"));
        assert_eq!(code_aus("leitwerk://beitreten/123456/").as_deref(), Some("123456"));
        assert_eq!(code_aus("leitwerk://beitreten?code=654321").as_deref(), Some("654321"));
        assert_eq!(code_aus("leitwerk://beitreten/12345"), None);
        assert_eq!(code_aus("https://x/beitreten/123456"), None);
    }
}
