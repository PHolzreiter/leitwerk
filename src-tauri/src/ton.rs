//! Tonausgabe im Programm: spielt Audiodaten auf einem wählbaren Ausgabegerät (Headset, Lautsprecher …).
//! Das Fenster kann das Ausgabegerät nicht wählen – deshalb spielt das Programm selbst ab (cpal).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::ipc::{InvokeBody, Request};

/// laufende Wiedergaben (Kennung → Stopp-Schalter)
static LAUFEND: Mutex<Option<HashMap<String, Arc<AtomicBool>>>> = Mutex::new(None);

fn laufend_setzen(id: &str, stopp: Option<Arc<AtomicBool>>) {
    if let Ok(mut l) = LAUFEND.lock() {
        let m = l.get_or_insert_with(HashMap::new);
        match stopp {
            Some(s) => {
                m.insert(id.to_string(), s);
            }
            None => {
                m.remove(id);
            }
        }
    }
}

/// Namen der Ausgabegeräte
#[tauri::command]
pub fn ton_geraete() -> Vec<String> {
    cpal::default_host()
        .output_devices()
        .map(|it| it.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}

fn ausgabe_geraet(name: &str) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if !name.is_empty() {
        if let Ok(mut it) = host.output_devices() {
            if let Some(d) = it.find(|d| d.name().map(|x| x == name).unwrap_or(false)) {
                return Ok(d);
            }
        }
    }
    host.default_output_device().ok_or_else(|| "Kein Ausgabegerät gefunden".to_string())
}

/// einfache Umrechnung der Abtastrate (linear)
fn umrechnen(d: &[f32], von: u32, nach: u32) -> Vec<f32> {
    if von == nach || d.is_empty() || von == 0 {
        return d.to_vec();
    }
    let f = von as f64 / nach as f64;
    let n = (d.len() as f64 / f) as usize;
    (0..n)
        .map(|i| {
            let x = i as f64 * f;
            let a = x.floor() as usize;
            let b = (a + 1).min(d.len() - 1);
            let t = (x - a as f64) as f32;
            d[a] + (d[b] - d[a]) * t
        })
        .collect()
}

fn strom<T>(dev: &cpal::Device, cfg: &cpal::StreamConfig, daten: Arc<Vec<f32>>, pos: Arc<Mutex<usize>>, stopp: Arc<AtomicBool>, fertig: std::sync::mpsc::Sender<()>) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample + cpal::FromSample<f32>,
{
    let kanaele = (cfg.channels as usize).max(1);
    let mut gemeldet = false;
    dev.build_output_stream(
        cfg,
        move |out: &mut [T], _: &cpal::OutputCallbackInfo| {
            let mut p = pos.lock().map(|g| *g).unwrap_or(usize::MAX);
            let aus = stopp.load(Ordering::Relaxed);
            for fr in out.chunks_mut(kanaele) {
                let s = if !aus && p < daten.len() { daten[p] } else { 0.0 };
                p = p.saturating_add(1);
                for x in fr.iter_mut() {
                    *x = T::from_sample(s);
                }
            }
            if let Ok(mut g) = pos.lock() {
                *g = p;
            }
            if (aus || p >= daten.len()) && !gemeldet {
                gemeldet = true;
                let _ = fertig.send(());
            }
        },
        |e| eprintln!("Tonausgabe: {e}"),
        None,
    )
    .map_err(|e| format!("Ausgabegerät lässt sich nicht öffnen: {e}"))
}

/// Spielt Mono-Audio bis zum Ende (oder bis zum Stopp) – blockiert den aufrufenden Faden.
pub fn spielen_blockierend(samples: Vec<f32>, rate: u32, geraet: &str, laut: f32, stopp: Arc<AtomicBool>) -> Result<(), String> {
    let dev = ausgabe_geraet(geraet)?;
    let sc = dev.default_output_config().map_err(|e| format!("Ausgabegerät: {e}"))?;
    let ziel = sc.sample_rate().0;
    let fmt = sc.sample_format();
    let cfg: cpal::StreamConfig = sc.into();
    let mut d = umrechnen(&samples, rate, ziel);
    let l = laut.clamp(0.0, 2.0);
    for x in d.iter_mut() {
        *x = (*x * l).clamp(-1.0, 1.0);
    }
    // kurzer Nachlauf, damit das Ende nicht abgeschnitten wird
    d.extend(std::iter::repeat(0.0).take((ziel / 20) as usize));
    let daten = Arc::new(d);
    let pos = Arc::new(Mutex::new(0usize));
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let s = match fmt {
        cpal::SampleFormat::F32 => strom::<f32>(&dev, &cfg, daten.clone(), pos, stopp.clone(), tx),
        cpal::SampleFormat::I16 => strom::<i16>(&dev, &cfg, daten.clone(), pos, stopp.clone(), tx),
        cpal::SampleFormat::U16 => strom::<u16>(&dev, &cfg, daten.clone(), pos, stopp.clone(), tx),
        cpal::SampleFormat::I32 => strom::<i32>(&dev, &cfg, daten.clone(), pos, stopp.clone(), tx),
        f => Err(format!("Ausgabe-Format wird nicht unterstützt: {f:?}")),
    }?;
    s.play().map_err(|e| format!("Tonausgabe startet nicht: {e}"))?;
    let dauer = std::time::Duration::from_secs_f64(daten.len() as f64 / ziel.max(1) as f64 + 2.0);
    let _ = rx.recv_timeout(dauer);
    drop(s);
    Ok(())
}

/// Spielt rohe Audiodaten (f32 little-endian, mono) ab und kehrt am Ende zurück.
/// Kopfzeilen: x-rate, x-geraet (URL-kodiert), x-laut (0–2), x-id (zum Stoppen)
#[tauri::command]
pub async fn ton_spielen(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(daten) = request.body() else {
        return Err("Keine Audiodaten".into());
    };
    let kopf = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let rate: u32 = kopf("x-rate").and_then(|r| r.parse().ok()).unwrap_or(48000);
    let geraet = kopf("x-geraet").map(|g| crate::sprache::url_dekodieren(&g)).unwrap_or_default();
    let laut: f32 = kopf("x-laut").and_then(|r| r.parse().ok()).unwrap_or(1.0);
    let id = kopf("x-id").unwrap_or_default();
    let samples: Vec<f32> = daten.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
    spielen_mit_id(samples, rate, geraet, laut, id).await
}

pub async fn spielen_mit_id(samples: Vec<f32>, rate: u32, geraet: String, laut: f32, id: String) -> Result<(), String> {
    let stopp = Arc::new(AtomicBool::new(false));
    if !id.is_empty() {
        laufend_setzen(&id, Some(stopp.clone()));
    }
    let r = tauri::async_runtime::spawn_blocking(move || spielen_blockierend(samples, rate, &geraet, laut, stopp))
        .await
        .map_err(|e| e.to_string())?;
    if !id.is_empty() {
        laufend_setzen(&id, None);
    }
    r
}

/// Wiedergabe beenden (Kennung oder leer = alle)
#[tauri::command]
pub fn ton_stopp(id: String) {
    if let Ok(l) = LAUFEND.lock() {
        if let Some(m) = l.as_ref() {
            for (k, s) in m.iter() {
                if id.is_empty() || k == &id || (id.ends_with('*') && k.starts_with(id.trim_end_matches('*'))) {
                    s.store(true, Ordering::Relaxed);
                }
            }
        }
    }
}
