//! EC135 von Rotorsim (X-Plane 12): LeitWerk ins Cockpit einbauen.
//!
//! - **Linkes MFD** (Platz der EuroNav-Karte, Gerät `ec135_euronav_map`): zeigt die LeitWerk-App, solange LeitWerk läuft
//!   (`leitwerk/aktiv`); sonst wie bisher die EuroNav-Karte.
//! - **Klapp-Tablet rechts** (AviTab-Fläche, drei Varianten je nach Cockpit): AviTab bleibt; darauf eine Kachel
//!   „LeitWerk“ (nur auf der AviTab-Startseite, `avitab/is_in_menu`) und die LeitWerk-App im Querformat
//!   (`leitwerk/tablet/app`).
//! - **TETRA-Funkgerät** im hinteren Pedestal: Modell vom Kollegen (`ec135/`), Display und Tasten über das Plugin.
//!   Ein älterer Einbau des Kollegen (`ec135/leitwerk/radio/…`, `leitwerk/ec135/tetra/…`) wird ersetzt.
//!
//! Die Stellen werden im Cockpit-Objekt gesucht (keine festen Dateistände: der Umbau des Kollegen ändert sich).
//! Vorher gesichert in `<Flugzeug>/.leitwerk-ec135/` (mit Prüfsummen), „Entfernen“ stellt den alten Stand wieder her.
//! Die Bildschirme selbst zeichnet das X-Plane-Plugin „LeitWerk“ (Geräte `leitwerk_mfd`, `leitwerk_tablet`,
//! `leitwerk_kachel`, `leitwerk_tetra`).

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Path, PathBuf};

const TETRA_OBJ_GZ: &[u8] = include_bytes!("../ec135/tetra.obj.gz");
const COCKPIT_GZ: &[u8] = include_bytes!("../ec135/cockpit.json.gz");
const ATLAS: &[u8] = include_bytes!("../ec135/atlas.png");

const SICHERUNG: &str = ".leitwerk-ec135";
const COCKPIT: &str = "ec135_cockpit.obj";
const MODELL: &str = "objects/leitwerk/tetra.obj";
const MODELL_ACF: &str = "leitwerk/tetra.obj";
const MODELL_ATLAS: &str = "objects/leitwerk/atlas.png";
/// Original-Funkgerät in den Panel-Objekten (erste Dreiecks-Nummer, 30 Indizes; Analyse des Kollegen)
const PANELE: [(&str, usize); 3] = [
    ("objects/old_panel/ec135_panel_3_C.obj", 234),
    ("objects/new_panel/ec135_panel_3.obj", 606),
    ("objects/new_panel/mfd_panel/ec135_panel_3_M.obj", 1434),
];
const EINGEBAUT: &str = "leitwerk/tetra/eingebaut";
/// Kachel „LeitWerk“ auf der AviTab-Startseite: zweiter Platz in der zweiten Reihe (neben „About“), in AviTab-Punkten
/// (800 × 480, links oben = 0,0) – nach dem Bildschirmfoto der Startseite (Paul 11.11.)
const KACHEL: (f64, f64, f64, f64) = (116.0, 163.0, 214.0, 271.0);

#[derive(Serialize, Clone, Debug, Default)]
pub struct Ec135Flugzeug {
    pub ordner: String,
    pub name: String,
    /// "original" | "eingebaut" | "veraendert"
    pub zustand: String,
    /// was eingebaut ist bzw. eingebaut würde: „MFD“, „Tablet“, „Funkgerät“
    pub teile: Vec<String>,
    pub hinweis: String,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Ec135Stand {
    pub xplane: bool,
    pub flugzeuge: Vec<Ec135Flugzeug>,
    pub meldung: String,
    pub fehler: String,
}

fn sha(b: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(b);
    h.finalize().iter().map(|x| format!("{x:02x}")).collect()
}

fn gz(b: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    flate2::read::GzDecoder::new(b).read_to_end(&mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

// ------------------------------------------------------------------ OBJ8 lesen/ändern

/// Zeilen eines OBJ (ohne Zeilenende) + ob CRLF verwendet wurde
fn zeilen(text: &str) -> (Vec<String>, bool) {
    let crlf = text.contains("\r\n");
    (text.replace("\r\n", "\n").split('\n').map(|s| s.to_string()).collect(), crlf)
}

fn zusammen(z: &[String], crlf: bool) -> String {
    z.join(if crlf { "\r\n" } else { "\n" })
}

struct Obj {
    z: Vec<String>,
    crlf: bool,
    /// Eckpunkte (VT-Zeilen, Zahlen)
    vt: Vec<[f64; 8]>,
    idx: Vec<usize>,
}

impl Obj {
    fn lesen(text: &str) -> Result<Obj, String> {
        let (z, crlf) = zeilen(text);
        let mut vt = Vec::new();
        let mut idx = Vec::new();
        for l in &z {
            let t = l.trim_start();
            if let Some(r) = t.strip_prefix("VT ") {
                let mut a = [0f64; 8];
                for (i, w) in r.split_whitespace().take(8).enumerate() {
                    a[i] = w.parse().map_err(|_| format!("VT nicht lesbar: {l}"))?;
                }
                vt.push(a);
            } else if let Some(r) = t.strip_prefix("IDX10 ") {
                for w in r.split_whitespace() {
                    idx.push(w.parse().map_err(|_| "IDX10 nicht lesbar".to_string())?);
                }
            } else if let Some(r) = t.strip_prefix("IDX ") {
                idx.push(r.trim().parse().map_err(|_| "IDX nicht lesbar".to_string())?);
            }
        }
        if vt.is_empty() || idx.is_empty() {
            return Err("Cockpit-Objekt ohne Geometrie".into());
        }
        Ok(Obj { z, crlf, vt, idx })
    }

    /// Eckpunkte (eindeutig) eines TRIS-Bereichs
    fn ecken(&self, start: usize, n: usize) -> Vec<usize> {
        let mut v: Vec<usize> = self.idx.get(start..start + n).map(|s| s.to_vec()).unwrap_or_default();
        v.sort_unstable();
        v.dedup();
        v
    }
}

fn tris(l: &str) -> Option<(usize, usize)> {
    let mut w = l.split_whitespace();
    if w.next()? != "TRIS" {
        return None;
    }
    Some((w.next()?.parse().ok()?, w.next()?.parse().ok()?))
}

/// Ganze ANIM-Blöcke (oberste Ebene) entfernen, die eines der Merkmale enthalten (älteres Funkgerät des Kollegen)
fn bloecke_entfernen(z: &mut Vec<String>, merkmale: &[&str]) -> usize {
    let mut out = Vec::with_capacity(z.len());
    let mut i = 0;
    let mut weg = 0;
    // erst ab den Befehlen (nach der letzten IDX-Zeile)
    let ab = z.iter().rposition(|l| l.starts_with("IDX")).map(|p| p + 1).unwrap_or(0);
    out.extend_from_slice(&z[..ab]);
    i = i.max(ab);
    while i < z.len() {
        let l = z[i].trim();
        if l == "ANIM_begin" {
            // Ende dieses Blocks suchen
            let mut tiefe = 0i32;
            let mut j = i;
            while j < z.len() {
                let t = z[j].trim();
                if t == "ANIM_begin" {
                    tiefe += 1;
                } else if t == "ANIM_end" {
                    tiefe -= 1;
                    if tiefe == 0 {
                        break;
                    }
                }
                j += 1;
            }
            let ende = j.min(z.len() - 1);
            let block = &z[i..=ende];
            if block.iter().any(|x| merkmale.iter().any(|m| x.contains(m))) {
                weg += 1;
            } else {
                out.extend_from_slice(block);
            }
            i = ende + 1;
        } else {
            if !(l.starts_with('#') && merkmale.iter().any(|m| l.contains(m))) {
                out.push(z[i].clone());
            }
            i += 1;
        }
    }
    *z = out;
    weg
}

/// VT-Zeile schreiben
fn vt_zeile(v: &[f64; 8]) -> String {
    format!(
        "VT {:.6} {:.6} {:.6} {:.6} {:.6} {:.6} {:.6} {:.6}",
        v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7]
    )
}

struct Neu {
    vt: Vec<String>,
    idx: Vec<usize>,
}

/// Rechteck aus 4 Ecken (links unten, links oben, rechts oben, rechts unten) als 2 Dreiecke, UV 0..1
fn rechteck(neu: &mut Neu, basis_vt: usize, ecken: [[f64; 3]; 4], n: [f64; 3], weg: f64) -> usize {
    let uv = [[0.0, 0.0], [0.0, 1.0], [1.0, 1.0], [1.0, 0.0]];
    let erste = basis_vt + neu.vt.len();
    for k in 0..4 {
        let p = ecken[k];
        neu.vt.push(vt_zeile(&[p[0] + n[0] * weg, p[1] + n[1] * weg, p[2] + n[2] * weg, n[0], n[1], n[2], uv[k][0], uv[k][1]]));
    }
    let start = neu.idx.len();
    for i in [0, 1, 2, 0, 2, 3] {
        neu.idx.push(erste + i);
    }
    start
}

/// Bildschirm des Klapp-Tablets (4 Ecken mit Panel-UV) → Ecken nach UV geordnet und bilineare Abbildung
struct Flaeche {
    lu: [f64; 3],
    lo: [f64; 3],
    ro: [f64; 3],
    ru: [f64; 3],
    n: [f64; 3],
}

impl Flaeche {
    fn aus(obj: &Obj, ecken: &[usize]) -> Option<Flaeche> {
        if ecken.len() != 4 {
            return None;
        }
        let v: Vec<[f64; 8]> = ecken.iter().map(|&i| obj.vt.get(i).copied()).collect::<Option<Vec<_>>>()?;
        let (u0, u1) = v.iter().fold((f64::MAX, f64::MIN), |(a, b), x| (a.min(x[6]), b.max(x[6])));
        let (v0, v1) = v.iter().fold((f64::MAX, f64::MIN), |(a, b), x| (a.min(x[7]), b.max(x[7])));
        if u1 - u0 < 1e-6 || v1 - v0 < 1e-6 {
            return None;
        }
        let naechste = |u: f64, w: f64| -> [f64; 3] {
            let b = v.iter().min_by(|a, b| {
                let da = (a[6] - u).powi(2) + (a[7] - w).powi(2);
                let db = (b[6] - u).powi(2) + (b[7] - w).powi(2);
                da.partial_cmp(&db).unwrap()
            });
            let b = b.unwrap();
            [b[0], b[1], b[2]]
        };
        let n0 = v[0];
        let l = (n0[3] * n0[3] + n0[4] * n0[4] + n0[5] * n0[5]).sqrt().max(1e-9);
        Some(Flaeche {
            lu: naechste(u0, v0),
            lo: naechste(u0, v1),
            ro: naechste(u1, v1),
            ru: naechste(u1, v0),
            n: [n0[3] / l, n0[4] / l, n0[5] / l],
        })
    }

    /// Punkt bei s (0 = links … 1 = rechts), t (0 = unten … 1 = oben)
    fn punkt(&self, s: f64, t: f64) -> [f64; 3] {
        let mut p = [0.0; 3];
        for k in 0..3 {
            let unten = self.lu[k] + (self.ru[k] - self.lu[k]) * s;
            let oben = self.lo[k] + (self.ro[k] - self.lo[k]) * s;
            p[k] = unten + (oben - unten) * t;
        }
        p
    }
}

/// Ergebnis eines Einbaus in das Cockpit-Objekt
struct CockpitNeu {
    text: String,
    mfd: bool,
    tablets: usize,
    funk: bool,
    alt_funk: usize,
}

fn cockpit_umbauen(text: &str) -> Result<CockpitNeu, String> {
    if text.contains("leitwerk_tablet") || text.contains("leitwerk_mfd") {
        return Err("Cockpit enthält schon LeitWerk (Sicherung fehlt) – zuerst die Originaldateien zurückspielen".into());
    }
    let mut obj = Obj::lesen(text)?;
    // 1) älteres Funkgerät des Kollegen entfernen (Geometrie bleibt ungenutzt in der Tabelle)
    let alt_funk = bloecke_entfernen(&mut obj.z, &["ec135/leitwerk/radio", "leitwerk/ec135/tetra", "MOTOROLA_SYSTEM_013"]);

    let nv = obj.vt.len();
    let ni = obj.idx.len();
    let mut neu = Neu { vt: Vec::new(), idx: Vec::new() };
    let mut z: Vec<String> = Vec::with_capacity(obj.z.len() + 200);
    let mut mfd = false;
    let mut tablets = 0;
    let mut i = 0;
    while i < obj.z.len() {
        let l = obj.z[i].clone();
        let t = l.trim();
        // 2) linkes MFD: EuroNav-Gerät nur ohne LeitWerk, sonst unser Gerät auf derselben Fläche
        if t.starts_with("ATTR_cockpit_device ec135_euronav_map") {
            let mut j = i + 1;
            let mut manip: Option<String> = None;
            if j < obj.z.len() && obj.z[j].trim().starts_with("ATTR_manip_device") {
                manip = Some(obj.z[j].clone());
                j += 1;
            }
            if let Some((a, b)) = obj.z.get(j).and_then(|x| tris(x)) {
                z.push("ANIM_begin".into());
                z.push("ANIM_hide 1 1 leitwerk/aktiv".into());
                z.push(l.clone());
                if let Some(m) = &manip {
                    z.push(m.clone());
                }
                z.push(obj.z[j].clone());
                z.push("ATTR_manip_none".into());
                z.push("ATTR_no_cockpit".into());
                z.push("ANIM_end".into());
                z.push("ANIM_begin".into());
                z.push("ANIM_hide 0 0 leitwerk/aktiv".into());
                z.push("ATTR_cockpit_device leitwerk_mfd 1 0 1".into());
                z.push("ATTR_manip_device hand leitwerk_mfd LeitWerk".into());
                z.push(format!("TRIS {a} {b}"));
                z.push("ATTR_manip_none".into());
                z.push("ANIM_end".into());
                mfd = true;
                i = j + 1;
                continue;
            }
        }
        // 3) Klapp-Tablet: Fläche nach dem AviTab-Ein/Aus-Knopf
        if t.starts_with("ATTR_manip_toggle") && t.contains("avitab/panel_powered") {
            z.push(l.clone());
            let mut j = i + 1;
            let mut gefunden = false;
            while j < obj.z.len() && j < i + 10 {
                let tj = obj.z[j].trim().to_string();
                if tj == "ANIM_end" {
                    break;
                }
                if tj == "ATTR_cockpit" {
                    if let Some((a, b)) = obj.z.get(j + 1).and_then(|x| tris(x)) {
                        let ecken = obj.ecken(a, b);
                        if let Some(f) = Flaeche::aus(&obj, &ecken) {
                            // bis einschließlich der AviTab-Fläche übernehmen
                            for k in i + 1..=j + 1 {
                                z.push(obj.z[k].clone());
                            }
                            let app = rechteck(&mut neu, nv, [f.lu, f.lo, f.ro, f.ru], f.n, 0.0004);
                            let (x0, y0, x1, y1) = KACHEL;
                            let s0 = x0 / 800.0;
                            let s1 = x1 / 800.0;
                            let t0 = 1.0 - y1 / 480.0;
                            let t1 = 1.0 - y0 / 480.0;
                            let kachel = rechteck(&mut neu, nv, [f.punkt(s0, t0), f.punkt(s0, t1), f.punkt(s1, t1), f.punkt(s1, t0)], f.n, 0.0008);
                            z.push("ATTR_no_cockpit".into());
                            z.push("ANIM_begin".into());
                            z.push("ANIM_hide 0 0 leitwerk/tablet/app".into());
                            z.push("ANIM_hide 0 0 avitab/panel_powered".into());
                            z.push("ATTR_cockpit_device leitwerk_tablet 1 0 1".into());
                            z.push("ATTR_manip_device hand leitwerk_tablet LeitWerk".into());
                            z.push(format!("TRIS {} 6", ni + app));
                            z.push("ATTR_manip_none".into());
                            z.push("ATTR_no_cockpit".into());
                            z.push("ANIM_end".into());
                            z.push("ANIM_begin".into());
                            z.push("ANIM_hide 0 0 avitab/is_in_menu".into());
                            z.push("ANIM_hide 0 0 avitab/panel_powered".into());
                            z.push("ANIM_hide 0 0 leitwerk/aktiv".into());
                            z.push("ANIM_hide 1 1 leitwerk/tablet/app".into());
                            z.push("ATTR_cockpit_device leitwerk_kachel 1 0 1".into());
                            z.push("ATTR_manip_command hand leitwerk/tablet_app_auf LeitWerk".into());
                            z.push(format!("TRIS {} 6", ni + kachel));
                            z.push("ATTR_manip_none".into());
                            z.push("ATTR_no_cockpit".into());
                            z.push("ANIM_end".into());
                            // Zustand danach wie vorher (Panel-Textur)
                            z.push("ATTR_cockpit".into());
                            tablets += 1;
                            gefunden = true;
                            i = j + 2;
                        }
                    }
                    break;
                }
                j += 1;
            }
            if gefunden {
                continue;
            }
            i += 1;
            continue;
        }
        z.push(l);
        i += 1;
    }

    // 4) TETRA-Funkgerät: Tasten, Knopf und Display (Geometrie vom Kollegen)
    let c: serde_json::Value = serde_json::from_slice(&gz(COCKPIT_GZ)?).map_err(|e| e.to_string())?;
    let vts: Vec<String> = c["vertices"].as_array().ok_or("cockpit.json")?.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect();
    let ids: Vec<usize> = c["indices"].as_array().ok_or("cockpit.json")?.iter().filter_map(|x| x.as_u64().map(|v| v as usize)).collect();
    let befehle: Vec<String> = c["commands"].as_array().ok_or("cockpit.json")?.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect();
    let funk_v0 = nv + neu.vt.len();
    let funk_i0 = ni + neu.idx.len();
    neu.vt.extend(vts.iter().cloned());
    neu.idx.extend(ids.iter().map(|i| funk_v0 + i));
    z.push(String::new());
    z.push("# LeitWerk: TETRA-Funkgerät (Tasten, Knopf, Display)".into());
    for b in &befehle {
        if let Some((a, n)) = tris(b) {
            z.push(format!("TRIS {} {}", funk_i0 + a, n));
        } else {
            z.push(b.clone());
        }
    }
    z.push(String::new());

    // 5) Tabellen ergänzen: POINT_COUNTS, VT vor die erste IDX-Zeile, IDX nach die letzte
    let pc = z.iter().position(|l| l.trim_start().starts_with("POINT_COUNTS")).ok_or("POINT_COUNTS fehlt")?;
    let w: Vec<usize> = z[pc].split_whitespace().skip(1).filter_map(|x| x.parse().ok()).collect();
    if w.len() != 4 || w[0] != nv || w[3] != ni {
        return Err("POINT_COUNTS passt nicht zur Geometrie".into());
    }
    z[pc] = format!("POINT_COUNTS {} {} {} {}", nv + neu.vt.len(), w[1], w[2], ni + neu.idx.len());
    let erste_idx = z.iter().position(|l| l.starts_with("IDX")).ok_or("IDX fehlt")?;
    let letzte_idx = z.iter().rposition(|l| l.starts_with("IDX")).ok_or("IDX fehlt")?;
    let mut idx_zeilen: Vec<String> = Vec::new();
    for k in neu.idx.chunks(10) {
        if k.len() == 10 {
            idx_zeilen.push(format!("IDX10 {}", k.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ")));
        } else {
            for x in k {
                idx_zeilen.push(format!("IDX {x}"));
            }
        }
    }
    let mut erg: Vec<String> = Vec::with_capacity(z.len() + neu.vt.len() + idx_zeilen.len());
    erg.extend_from_slice(&z[..erste_idx]);
    erg.extend(neu.vt.iter().cloned());
    erg.extend_from_slice(&z[erste_idx..=letzte_idx]);
    erg.extend(idx_zeilen);
    erg.extend_from_slice(&z[letzte_idx + 1..]);
    Ok(CockpitNeu { text: zusammen(&erg, obj.crlf), mfd, tablets, funk: true, alt_funk })
}

/// Original-Funkgerät in einem Panel-Objekt ausblenden, solange das TETRA eingebaut ist (wie beim Kollegen:
/// „TRIS <erste> 30“ unter `ANIM_hide 1 1 leitwerk/tetra/eingebaut`). None = Stelle nicht gefunden.
fn panel_umbauen(text: &str, erste: usize) -> Option<String> {
    let (mut z, crlf) = zeilen(text);
    if text.contains(EINGEBAUT) {
        return None;
    }
    // Einbau des Kollegen: nur umbenennen
    if text.contains("leitwerk/ec135/tetra/mounted") {
        return Some(text.replace("leitwerk/ec135/tetra/mounted", EINGEBAUT));
    }
    let geschuetzt = |z: &mut Vec<String>| {
        vec!["ANIM_begin".to_string(), format!("ANIM_hide 1 1 {EINGEBAUT}"), format!("TRIS {erste} 30"), "ANIM_end".to_string()]
            .into_iter()
            .for_each(|x| z.push(x))
    };
    let mut out = Vec::with_capacity(z.len() + 6);
    let mut treffer = 0;
    for l in z.drain(..) {
        if let Some((a, n)) = tris(&l) {
            if a <= erste && erste + 30 <= a + n && treffer == 0 {
                // Original: Funkgerät steckt in diesem Bereich
                if erste > a {
                    out.push(format!("TRIS {a} {}", erste - a));
                }
                geschuetzt(&mut out);
                let rest = a + n - erste - 30;
                if rest > 0 {
                    out.push(format!("TRIS {} {rest}", erste + 30));
                }
                treffer += 1;
                continue;
            }
            if a == erste + 30 && treffer == 0 {
                // älterer Umbau: Funkgerät wurde ganz weggelassen – wieder einfügen, aber ausgeblendet
                geschuetzt(&mut out);
                out.push(l);
                treffer += 1;
                continue;
            }
        }
        out.push(l);
    }
    if treffer == 1 {
        Some(zusammen(&out, crlf))
    } else {
        None
    }
}

/// Flugzeug-Datei: Objekt des Funkgeräts auf unser Modell zeigen lassen. None = kein Platz gefunden.
fn acf_umbauen(text: &str) -> Option<String> {
    if text.contains(MODELL_ACF) {
        return None;
    }
    for alt in ["leitwerk_tetra/TETRA.obj", "motorola_mxm600/MXM600.obj"] {
        if text.contains(alt) {
            return Some(text.replace(alt, MODELL_ACF));
        }
    }
    // Original von Rotorsim: neuen Objekt-Platz nach Vorlage des Funkgeräts (Platz 65, wie beim Kollegen)
    let (z, crlf) = zeilen(text);
    let anz_zeile = z.iter().position(|l| l.starts_with("P _obja/count "))?;
    let anz: usize = z[anz_zeile].split_whitespace().nth(2)?.parse().ok()?;
    let vorlage: Vec<String> = z.iter().filter(|l| l.starts_with("P _obja/65/") && !l.contains("_obj_hide_dataref")).cloned().collect();
    if vorlage.is_empty() {
        return None;
    }
    let mut neu: Vec<String> = Vec::new();
    for l in &vorlage {
        let mut r = l.replacen("P _obja/65/", &format!("P _obja/{anz}/"), 1);
        let teile: Vec<&str> = r.splitn(3, ' ').collect();
        if teile.len() == 3 {
            let schl = teile[1];
            if schl.ends_with("/_obj_flags") {
                r = format!("P {schl} 28");
            } else if schl.ends_with("/_v10_is_internal") {
                r = format!("P {schl} 1");
            } else if schl.ends_with("/_v10_att_file_stl") {
                r = format!("P {schl} {MODELL_ACF}");
            }
        }
        neu.push(r);
    }
    let mut out = z.clone();
    out[anz_zeile] = format!("P _obja/count {}", anz + 1);
    let pos = anz_zeile;
    for (k, l) in neu.into_iter().enumerate() {
        out.insert(pos + k, l);
    }
    Some(zusammen(&out, crlf))
}

// ------------------------------------------------------------------ Flugzeuge finden

/// Ordner mit `ec135_cockpit.obj` und einer .acf-Datei unter X-Plane/Aircraft (bis 4 Ebenen tief)
fn suchen(wurzel: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stapel = vec![(wurzel.to_path_buf(), 0)];
    while let Some((d, tiefe)) = stapel.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        let mut hat_cockpit = false;
        let mut hat_acf = false;
        let mut unter = Vec::new();
        for e in rd.flatten() {
            let p = e.path();
            let n = e.file_name().to_string_lossy().to_string();
            if p.is_dir() {
                if !n.starts_with('.') && tiefe < 4 && !["liveries", "objects", "plugins", "cockpit", "cockpit_3D", "airfoils", "fmod", "weapons"].contains(&n.as_str()) {
                    unter.push(p);
                }
            } else if n == COCKPIT {
                hat_cockpit = true;
            } else if n.to_ascii_lowercase().ends_with(".acf") {
                hat_acf = true;
            }
        }
        if hat_cockpit && hat_acf {
            out.push(d);
        } else {
            for u in unter {
                stapel.push((u, tiefe + 1));
            }
        }
    }
    out.sort();
    out
}

fn acf_datei(ordner: &Path) -> Option<PathBuf> {
    let mut acfs: Vec<PathBuf> = std::fs::read_dir(ordner)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x.eq_ignore_ascii_case("acf")).unwrap_or(false))
        .collect();
    acfs.sort();
    // „ec135.acf“ bevorzugen
    acfs.iter().find(|p| p.file_name().map(|n| n.to_string_lossy().to_ascii_lowercase().contains("ec135")).unwrap_or(false)).cloned().or_else(|| acfs.first().cloned())
}

// ------------------------------------------------------------------ Sicherung

type Liste = BTreeMap<String, (Option<String>, String)>;

fn liste_lesen(ordner: &Path) -> Option<Liste> {
    let t = std::fs::read_to_string(ordner.join(SICHERUNG).join("liste.json")).ok()?;
    serde_json::from_str(&t).ok()
}

fn zustand(ordner: &Path) -> (String, String) {
    let Some(liste) = liste_lesen(ordner) else { return ("original".into(), String::new()) };
    for (rel, (_, neu)) in &liste {
        let akt = std::fs::read(ordner.join(rel)).ok().map(|b| sha(&b));
        if akt.as_deref() != Some(neu.as_str()) {
            return ("veraendert".into(), format!("{rel} wurde seit dem Einbau geändert (z. B. Update des Hubschraubers)"));
        }
    }
    ("eingebaut".into(), String::new())
}

/// Originaldateien zurück; Ok(false) = es gab keine Sicherung.
/// streng: eine seit dem Einbau geänderte Datei ist ein Fehler (vor einem neuen Einbau); sonst bleibt sie, wie sie ist
/// (z. B. nach einem Update des Hubschraubers – nicht mit dem alten Original überschreiben).
fn zurueck(ordner: &Path, streng: bool) -> Result<(bool, Vec<String>), String> {
    let Some(liste) = liste_lesen(ordner) else { return Ok((false, Vec::new())) };
    let sich = ordner.join(SICHERUNG);
    if streng {
        for (rel, (_, neu)) in &liste {
            let akt = std::fs::read(ordner.join(rel)).ok().map(|b| sha(&b));
            if akt.as_deref() != Some(neu.as_str()) {
                return Err(format!("{rel} wurde seit dem Einbau geändert – nicht zurückgespielt"));
            }
        }
    }
    let mut gelassen = Vec::new();
    for (rel, (alt, neu)) in &liste {
        let p = ordner.join(rel);
        let akt = std::fs::read(&p).ok().map(|b| sha(&b));
        if akt.as_deref() != Some(neu.as_str()) {
            gelassen.push(rel.clone());
            continue;
        }
        match alt {
            Some(_) => {
                let b = std::fs::read(sich.join("original").join(rel)).map_err(|e| format!("Sicherung von {rel} fehlt: {e}"))?;
                std::fs::write(&p, b).map_err(|e| format!("{rel}: {e}"))?;
            }
            None => {
                let _ = std::fs::remove_file(&p);
            }
        }
    }
    std::fs::remove_dir_all(&sich).map_err(|e| e.to_string())?;
    // leeren Ordner des Funkgeräts aufräumen
    let _ = std::fs::remove_dir(ordner.join("objects/leitwerk"));
    Ok((true, gelassen))
}

fn einbauen(ordner: &Path) -> Result<(Vec<String>, String), String> {
    // war schon eingebaut: erst zurück (neuer Einbau mit dem aktuellen Stand)
    let (z, _) = zustand(ordner);
    if z == "eingebaut" {
        zurueck(ordner, true)?;
    } else if z == "veraendert" {
        return Err("Seit dem Einbau geändert (Update?) – zuerst „Entfernen“, dann neu einbauen".into());
    }
    let mut dateien: Vec<(String, Option<Vec<u8>>, Vec<u8>)> = Vec::new();
    let mut teile = Vec::new();
    let mut hinweis = Vec::new();
    // Cockpit
    let cp = ordner.join(COCKPIT);
    let alt = std::fs::read(&cp).map_err(|e| format!("{COCKPIT}: {e}"))?;
    let text = String::from_utf8_lossy(&alt).to_string();
    let c = cockpit_umbauen(&text)?;
    if c.mfd {
        teile.push("MFD".to_string());
    } else {
        hinweis.push("kein EuroNav-Platz für das MFD gefunden".to_string());
    }
    if c.tablets > 0 {
        teile.push("Tablet".to_string());
    } else {
        hinweis.push("keine AviTab-Fläche gefunden".to_string());
    }
    if c.alt_funk > 0 {
        hinweis.push("älteres Funkgerät ersetzt".to_string());
    }
    dateien.push((COCKPIT.into(), Some(alt), c.text.into_bytes()));
    // Funkgerät: Modell, Platz in der Flugzeug-Datei, Original ausblenden
    if c.funk {
        let mut funk_ok = true;
        if let Some(acf) = acf_datei(ordner) {
            let rel = acf.file_name().unwrap().to_string_lossy().to_string();
            let a = std::fs::read(&acf).map_err(|e| format!("{rel}: {e}"))?;
            match acf_umbauen(&String::from_utf8_lossy(&a)) {
                Some(n) => dateien.push((rel, Some(a), n.into_bytes())),
                None if String::from_utf8_lossy(&a).contains(MODELL_ACF) => {}
                None => {
                    funk_ok = false;
                    hinweis.push("kein Platz für das Funkgerät in der .acf".to_string());
                }
            }
        }
        for (rel, erste) in PANELE {
            let p = ordner.join(rel);
            let Ok(a) = std::fs::read(&p) else { continue };
            if let Some(n) = panel_umbauen(&String::from_utf8_lossy(&a), erste) {
                dateien.push((rel.into(), Some(a), n.into_bytes()));
            }
        }
        dateien.push((MODELL.into(), std::fs::read(ordner.join(MODELL)).ok(), gz(TETRA_OBJ_GZ)?));
        dateien.push((MODELL_ATLAS.into(), std::fs::read(ordner.join(MODELL_ATLAS)).ok(), ATLAS.to_vec()));
        if funk_ok {
            teile.push("Funkgerät".to_string());
        }
    }
    // Sicherung zuerst (vollständig), dann schreiben
    let sich = ordner.join(SICHERUNG);
    let tmp = ordner.join(format!("{SICHERUNG}.neu"));
    let _ = std::fs::remove_dir_all(&tmp);
    let mut liste: Liste = BTreeMap::new();
    for (rel, alt, neu) in &dateien {
        if let Some(a) = alt {
            let z = tmp.join("original").join(rel);
            std::fs::create_dir_all(z.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::write(&z, a).map_err(|e| format!("Sicherung {rel}: {e}"))?;
        }
        liste.insert(rel.clone(), (alt.as_ref().map(|a| sha(a)), sha(neu)));
    }
    std::fs::write(tmp.join("liste.json"), serde_json::to_vec_pretty(&liste).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&sich);
    std::fs::rename(&tmp, &sich).map_err(|e| format!("Sicherung: {e}"))?;
    for (rel, _, neu) in &dateien {
        let p = ordner.join(rel);
        if let Some(d) = p.parent() {
            std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
        }
        let t = p.with_extension("leitwerk-neu");
        std::fs::write(&t, neu).map_err(|e| format!("{rel}: {e}"))?;
        std::fs::rename(&t, &p).map_err(|e| format!("{rel}: {e}"))?;
    }
    Ok((teile, hinweis.join(" · ")))
}

fn flugzeug(ordner: &Path) -> Ec135Flugzeug {
    let (z, h) = zustand(ordner);
    let mut teile = Vec::new();
    if let Ok(t) = std::fs::read_to_string(ordner.join(COCKPIT)) {
        if t.contains("leitwerk_mfd") {
            teile.push("MFD".into());
        }
        if t.contains("leitwerk_tablet") {
            teile.push("Tablet".into());
        }
        if t.contains("leitwerk_tetra") {
            teile.push("Funkgerät".into());
        }
    }
    let mut hinweis = h;
    if z == "original" {
        if let Ok(t) = std::fs::read_to_string(ordner.join(COCKPIT)) {
            if t.contains("ec135/leitwerk/radio") || t.contains("leitwerk/ec135/tetra") {
                hinweis = "älteres Funkgerät (vom Kollegen) – wird beim Einbau ersetzt".into();
            }
        }
    }
    Ec135Flugzeug {
        ordner: ordner.display().to_string(),
        name: ordner.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        zustand: z,
        teile,
        hinweis,
    }
}

fn stand_fuer(wurzel: Option<PathBuf>) -> Ec135Stand {
    let Some(w) = wurzel else { return Ec135Stand { xplane: false, ..Default::default() } };
    Ec135Stand { xplane: true, flugzeuge: suchen(&w.join("Aircraft")).iter().map(|o| flugzeug(o)).collect(), ..Default::default() }
}

/// EC135 im X-Plane-Ordner: aktion = "pruefen" | "einbauen" | "entfernen"; ordner = ein Flugzeug (sonst alle)
#[tauri::command]
pub fn ec135_cockpit(aktion: String, ordner: Option<String>) -> Ec135Stand {
    let wurzel = crate::xplane::xplane_ordner();
    let mut st = stand_fuer(wurzel.clone());
    if aktion == "pruefen" || !st.xplane {
        return st;
    }
    let ziele: Vec<PathBuf> = match &ordner {
        Some(o) => vec![PathBuf::from(o)],
        None => st.flugzeuge.iter().map(|f| PathBuf::from(&f.ordner)).collect(),
    };
    let mut meldungen = Vec::new();
    let mut fehler = Vec::new();
    for o in ziele {
        let name = o.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if !o.join(COCKPIT).is_file() {
            fehler.push(format!("{name}: kein EC135-Cockpit"));
            continue;
        }
        let r = if aktion == "einbauen" {
            einbauen(&o).map(|(t, h)| format!("{name}: {}{}", if t.is_empty() { "nichts".into() } else { t.join(", ") }, if h.is_empty() { String::new() } else { format!(" ({h})") }))
        } else {
            zurueck(&o, false).map(|(da, gelassen)| {
                format!(
                    "{name}: {}{}",
                    if da { "Original wiederhergestellt" } else { "nichts eingebaut" },
                    if gelassen.is_empty() { String::new() } else { format!(" (seit dem Einbau geändert, so gelassen: {})", gelassen.join(", ")) }
                )
            })
        };
        match r {
            Ok(m) => meldungen.push(m),
            Err(e) => fehler.push(format!("{name}: {e}")),
        }
    }
    st = stand_fuer(wurzel);
    st.meldung = meldungen.join("\n");
    st.fehler = fehler.join("\n");
    st
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn panel_original_und_alt() {
        let orig = "A\nTRIS 200 100\nB";
        let n = panel_umbauen(orig, 234).unwrap();
        assert!(n.contains("TRIS 200 34\nANIM_begin\nANIM_hide 1 1 leitwerk/tetra/eingebaut\nTRIS 234 30\nANIM_end\nTRIS 264 36"));
        let alt = "A\nTRIS 264 36\nB";
        let n = panel_umbauen(alt, 234).unwrap();
        assert!(n.contains("TRIS 234 30\nANIM_end\nTRIS 264 36"));
        assert!(panel_umbauen("TRIS 0 10", 234).is_none());
    }

    #[test]
    fn acf_alter_platz() {
        let a = "P _obja/65/_v10_att_file_stl motorola_mxm600/MXM600.obj\n";
        assert!(acf_umbauen(a).unwrap().contains("leitwerk/tetra.obj"));
        assert!(acf_umbauen("P x leitwerk/tetra.obj").is_none());
    }
}
