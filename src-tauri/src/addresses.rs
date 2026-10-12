//! Adressverzeichnis (aus OpenStreetMap): Suche und zufällige Einsatzorte.

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use flate2::read::GzDecoder;
use serde::Serialize;

pub struct Addresses {
    /// Originaltext aller Einträge, hintereinander
    text: String,
    /// Kleingeschriebener, vereinfachter Suchtext (gleiche Reihenfolge)
    norm: String,
    /// je Eintrag: (Start, Länge) in `text`, (Start, Länge) in `norm`
    spans: Vec<(u32, u32, u32, u32)>,
    lat: Vec<f32>,
    lon: Vec<f32>,
    is_place: Vec<bool>,
}

#[derive(Serialize, Clone)]
pub struct AddressHit {
    pub label: String,
    pub street: String,
    pub number: String,
    pub postcode: String,
    pub city: String,
    pub lat: f64,
    pub lon: f64,
    pub place: bool,
}

/// Vereinfacht Text für die Suche: klein, Umlaute ausgeschrieben, „straße“ -> „str“, „Sankt“ -> „St“.
pub fn normalize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars().flat_map(|c| c.to_lowercase()) {
        match ch {
            'ä' => out.push_str("ae"),
            'ö' => out.push_str("oe"),
            'ü' => out.push_str("ue"),
            'ß' => out.push_str("ss"),
            'á' | 'à' | 'â' => out.push('a'),
            'é' | 'è' | 'ê' => out.push('e'),
            c if c.is_alphanumeric() => out.push(c),
            _ => out.push(' '),
        }
    }
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.replace("strasse", "str").replace("sankt ", "st ")
}

impl Addresses {
    pub fn load(path: &Path) -> Result<Addresses, String> {
        let file = File::open(path).map_err(|e| format!("Adressen nicht gefunden ({}): {e}", path.display()))?;
        let reader = BufReader::new(GzDecoder::new(BufReader::new(file)));
        let mut a = Addresses {
            text: String::new(),
            norm: String::new(),
            spans: Vec::new(),
            lat: Vec::new(),
            lon: Vec::new(),
            is_place: Vec::new(),
        };
        for line in reader.lines() {
            let line = line.map_err(|e| format!("Adressen beschädigt: {e}"))?;
            let f: Vec<&str> = line.split('\t').collect();
            if f.len() < 7 {
                continue;
            }
            let (Ok(la), Ok(lo)) = (f[5].parse::<f32>(), f[6].parse::<f32>()) else {
                continue;
            };
            let place = f[0] == "o";
            // gespeichert: straße \t nummer \t plz \t ort
            let rec = format!("{}\t{}\t{}\t{}", f[1], f[2], f[3], if place { "" } else { f[4] });
            let n = normalize(&format!("{} {} {}", f[1], f[3], if place { "" } else { f[4] }));
            let (ts, ns) = (a.text.len() as u32, a.norm.len() as u32);
            a.text.push_str(&rec);
            a.norm.push_str(&n);
            a.spans.push((ts, rec.len() as u32, ns, n.len() as u32));
            a.lat.push(la);
            a.lon.push(lo);
            a.is_place.push(place);
        }
        Ok(a)
    }

    pub fn len(&self) -> usize {
        self.spans.len()
    }

    fn hit(&self, i: usize) -> AddressHit {
        let (ts, tl, _, _) = self.spans[i];
        let rec = &self.text[ts as usize..(ts + tl) as usize];
        let f: Vec<&str> = rec.split('\t').collect();
        let (street, number, postcode, city) = (f[0], f[1], f[2], f[3]);
        let label = if self.is_place[i] {
            street.to_string()
        } else {
            let place = [postcode, city].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join(" ");
            if place.is_empty() {
                format!("{street} {number}")
            } else {
                format!("{street} {number}, {place}")
            }
        };
        AddressHit {
            label,
            street: street.into(),
            number: number.into(),
            postcode: postcode.into(),
            city: city.into(),
            lat: self.lat[i] as f64,
            lon: self.lon[i] as f64,
            place: self.is_place[i],
        }
    }

    /// Suche nach Freitext, z. B. „Hauptstraße 12 Gföhl“ oder „Gföhl“.
    pub fn search(&self, query: &str, limit: usize) -> Vec<AddressHit> {
        let q = normalize(query);
        let tokens: Vec<&str> = q.split_whitespace().collect();
        if tokens.is_empty() {
            return vec![];
        }
        // Hausnummer = Token mit Ziffer, das nicht wie eine PLZ aussieht
        let number = tokens
            .iter()
            .find(|t| t.chars().next().is_some_and(|c| c.is_ascii_digit()) && !(t.len() == 4 && t.chars().all(|c| c.is_ascii_digit())))
            .copied();
        let words: Vec<&str> = tokens.iter().filter(|t| Some(**t) != number).copied().collect();
        if words.is_empty() {
            return vec![];
        }

        let mut scored: Vec<(u32, usize)> = Vec::new();
        for i in 0..self.spans.len() {
            let (ts, tl, ns, nl) = self.spans[i];
            let hay = &self.norm[ns as usize..(ns + nl) as usize];
            if !words.iter().all(|w| hay.contains(w)) {
                continue;
            }
            let mut score: u32 = 100;
            if hay.starts_with(words[0]) {
                score -= 30;
            }
            if self.is_place[i] {
                score -= if number.is_none() { 40 } else { 0 };
            }
            if let Some(num) = number {
                if self.is_place[i] {
                    continue;
                }
                let rec = &self.text[ts as usize..(ts + tl) as usize];
                let hn = normalize(rec.split('\t').nth(1).unwrap_or(""));
                let hn = hn.replace(' ', "");
                if hn == num {
                    score -= 50;
                } else if hn.starts_with(num) {
                    score -= 20;
                } else {
                    continue;
                }
            }
            scored.push((score, i));
            if scored.len() > 5000 {
                break;
            }
        }
        scored.sort_by_key(|s| (s.0, self.spans[s.1].1));
        scored.into_iter().take(limit).map(|(_, i)| self.hit(i)).collect()
    }

    /// Zufällige Adressen (keine Orte) in einem Rechteck [min_lon, min_lat, max_lon, max_lat].
    pub fn random_in(&self, bbox: [f64; 4], count: usize, seed: u64) -> Vec<AddressHit> {
        let idx: Vec<usize> = (0..self.spans.len())
            .filter(|&i| {
                !self.is_place[i]
                    && (self.lon[i] as f64) >= bbox[0]
                    && (self.lat[i] as f64) >= bbox[1]
                    && (self.lon[i] as f64) <= bbox[2]
                    && (self.lat[i] as f64) <= bbox[3]
            })
            .collect();
        if idx.is_empty() {
            return vec![];
        }
        let mut x = seed | 1;
        (0..count)
            .map(|_| {
                // xorshift64
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                self.hit(idx[(x % idx.len() as u64) as usize])
            })
            .collect()
    }
}
