//! Joystick-Tasten direkt im Programm (Windows): auch wenn LeitWerk nicht vorne ist – beim Piloten ist immer der
//! Flugsimulator im Vordergrund. Die Gamepad-Schnittstelle des Fensters (und Windows.Gaming.Input) liefert nur mit
//! Fokus; die alte Multimedia-Schnittstelle (winmm, joyGetPosEx) fragt jeden Joystick, HOTAS und Controller ab,
//! unabhängig vom Fokus. Jede Änderung geht als Ereignis „joy-taste“ an die Oberfläche (Taste 1–32, Steuerkreuz
//! als Tasten 33–36: oben, rechts, unten, links).

#[derive(Clone, serde::Serialize)]
pub struct JoyTaste {
    pub geraet: String,
    pub taste: u32,
    pub unten: bool,
}

#[cfg(windows)]
mod win {
    #[repr(C)]
    #[derive(Default)]
    pub struct JoyInfoEx {
        pub dw_size: u32,
        pub dw_flags: u32,
        pub x: u32,
        pub y: u32,
        pub z: u32,
        pub r: u32,
        pub u: u32,
        pub v: u32,
        pub buttons: u32,
        pub button_number: u32,
        pub pov: u32,
        pub res1: u32,
        pub res2: u32,
    }
    #[link(name = "winmm")]
    extern "system" {
        pub fn joyGetNumDevs() -> u32;
        pub fn joyGetPosEx(id: u32, pji: *mut JoyInfoEx) -> u32;
        pub fn joyGetDevCapsW(id: usize, pjc: *mut u8, cbjc: u32) -> u32;
    }
    pub const JOY_RETURNBUTTONS: u32 = 0x80;
    pub const JOY_RETURNPOV: u32 = 0x40;
    /// Größe von JOYCAPSW (WORD, WORD, WCHAR[32], 19 × UINT, WCHAR[32], WCHAR[260])
    pub const JOYCAPSW_GROESSE: u32 = 2 + 2 + 64 + 19 * 4 + 64 + 520;
}

/// Name des Joysticks (aus dem Treiber), mit Nummer – so eindeutig, auch bei zwei gleichen Geräten
#[cfg(windows)]
fn name(id: u32) -> String {
    let mut buf = vec![0u8; 1024];
    let ok = unsafe { win::joyGetDevCapsW(id as usize, buf.as_mut_ptr(), win::JOYCAPSW_GROESSE) } == 0;
    let mut n = String::new();
    if ok {
        let w: Vec<u16> = buf[4..68].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|&c| c != 0).collect();
        n = String::from_utf16_lossy(&w).trim().to_string();
    }
    if n.is_empty() || n.to_lowercase().contains("pc-joystick") || n.to_lowercase().contains("pc joystick") {
        n = "Joystick".into();
    }
    format!("{n} {}", id + 1)
}

/// Abfrage-Schleife starten (einmal, beim Programmstart)
pub fn starten(app: tauri::AppHandle) {
    #[cfg(windows)]
    std::thread::spawn(move || {
        use tauri::Emitter;
        let anzahl = unsafe { win::joyGetNumDevs() }.min(16);
        let mut vorher: Vec<Option<u64>> = vec![None; anzahl as usize];
        let mut namen: Vec<Option<String>> = vec![None; anzahl as usize];
        let mut runde: u64 = 0;
        loop {
            for id in 0..anzahl {
                let i = id as usize;
                // nicht angesteckte Geräte nur alle 2 s versuchen
                if vorher[i].is_none() && runde % 66 != 0 {
                    continue;
                }
                let mut ji = win::JoyInfoEx { dw_size: std::mem::size_of::<win::JoyInfoEx>() as u32, dw_flags: win::JOY_RETURNBUTTONS | win::JOY_RETURNPOV, ..Default::default() };
                if unsafe { win::joyGetPosEx(id, &mut ji) } != 0 {
                    vorher[i] = None;
                    continue;
                }
                // Steuerkreuz (in Hundertstel Grad, 65535 = Mitte) als vier Tasten
                let mut hat = 0u64;
                if ji.pov != 0xFFFF && ji.pov <= 36000 {
                    let g = ji.pov / 100;
                    if g >= 315 || g <= 45 { hat |= 1; }
                    if (45..=135).contains(&g) { hat |= 2; }
                    if (135..=225).contains(&g) { hat |= 4; }
                    if (225..=315).contains(&g) { hat |= 8; }
                }
                let jetzt = (ji.buttons as u64) | (hat << 32);
                let alt = vorher[i].unwrap_or(0);
                if vorher[i].is_some() && jetzt != alt {
                    let n = namen[i].get_or_insert_with(|| name(id)).clone();
                    for b in 0..36u32 {
                        let m = 1u64 << b;
                        if (jetzt ^ alt) & m != 0 {
                            let _ = app.emit("joy-taste", super::joystick::JoyTaste { geraet: n.clone(), taste: b, unten: jetzt & m != 0 });
                        }
                    }
                }
                if vorher[i].is_none() {
                    namen[i] = Some(name(id));
                }
                vorher[i] = Some(jetzt);
            }
            runde += 1;
            std::thread::sleep(std::time::Duration::from_millis(30));
        }
    });
    #[cfg(not(windows))]
    let _ = app;
}

/// Gibt es die Abfrage im Programm? (sonst nimmt die Oberfläche die Gamepad-Schnittstelle des Fensters)
#[tauri::command]
pub fn joystick_nativ() -> bool {
    cfg!(windows)
}
