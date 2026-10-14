//! Fahrzeitberechnung auf dem Straßennetz (A* und Dijkstra auf einem kompakten Graphen).
//!
//! Der Graph wird beim Build aus OpenStreetMap erzeugt (tools/build_roads.py).

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use flate2::read::GzDecoder;
use serde::Serialize;

/// Größe einer Rasterzelle für die Suche nach dem nächsten Knoten (in Mikrograd, ca. 220 m).
const CELL: i32 = 2000;
/// Höchstgeschwindigkeit für die A*-Schätzung in m/s (muss >= jeder Kantengeschwindigkeit sein).
const MAX_SPEED_MPS: f64 = 140.0 / 3.6;
/// Geschwindigkeit für das Stück vom Punkt zur nächsten Straße (m/s).
const OFFROAD_MPS: f64 = 15.0 / 3.6;
/// Kleinste Zusammenhangskomponente, auf die eingerastet wird (vermeidet abgeschnittene Wege).
const MIN_COMPONENT: u32 = 2000;

pub struct Graph {
    lat: Vec<i32>,
    lon: Vec<i32>,
    first: Vec<u32>,
    target: Vec<u32>,
    time: Vec<u16>,
    dist: Vec<u16>,
    // umgekehrter Graph für „viele Fahrzeuge -> ein Ziel“
    rfirst: Vec<u32>,
    rsource: Vec<u32>,
    rtime: Vec<u16>,
    grid: HashMap<(i32, i32), Vec<u32>>,
}

#[derive(Serialize)]
pub struct RouteResult {
    /// [Längengrad, Breitengrad]
    pub coords: Vec<[f64; 2]>,
    /// kumulierte Fahrzeit in Sekunden je Punkt (ohne Sondersignal)
    pub times: Vec<f64>,
    pub duration: f64,
    pub distance: f64,
}

fn read_u32s(r: &mut impl Read, n: usize) -> std::io::Result<Vec<u32>> {
    let mut buf = vec![0u8; n * 4];
    r.read_exact(&mut buf)?;
    Ok(buf.chunks_exact(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect())
}

fn read_i32s(r: &mut impl Read, n: usize) -> std::io::Result<Vec<i32>> {
    let mut buf = vec![0u8; n * 4];
    r.read_exact(&mut buf)?;
    Ok(buf.chunks_exact(4).map(|c| i32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect())
}

fn read_u16s(r: &mut impl Read, n: usize) -> std::io::Result<Vec<u16>> {
    let mut buf = vec![0u8; n * 2];
    r.read_exact(&mut buf)?;
    Ok(buf.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect())
}

fn haversine(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6_371_000.0;
    let (p1, p2) = (lat1.to_radians(), lat2.to_radians());
    let dp = p2 - p1;
    let dl = (lon2 - lon1).to_radians();
    let h = (dp / 2.0).sin().powi(2) + p1.cos() * p2.cos() * (dl / 2.0).sin().powi(2);
    2.0 * r * h.sqrt().asin()
}

/// Union-Find zur Bestimmung der Komponentengrößen.
fn find(parent: &mut [u32], mut x: u32) -> u32 {
    while parent[x as usize] != x {
        let p = parent[x as usize];
        parent[x as usize] = parent[p as usize];
        x = p;
    }
    x
}

/// Rohdaten einer Graph-Datei (ein Bundesland oder das alte Gesamtnetz).
struct Teil {
    lat: Vec<i32>,
    lon: Vec<i32>,
    first: Vec<u32>,
    target: Vec<u32>,
    time: Vec<u16>,
    dist: Vec<u16>,
    /// Knoten an der Landesgrenze (kommen auch in der Datei des Nachbarlandes vor)
    grenze: Vec<u32>,
}

fn lese_teil(path: &Path) -> Result<Teil, String> {
    let file = File::open(path).map_err(|e| format!("Straßennetz nicht gefunden ({}): {e}", path.display()))?;
    let mut r = BufReader::new(GzDecoder::new(BufReader::new(file)));
    let err = |e: std::io::Error| format!("Straßennetz beschädigt: {e}");
    let mut magic = [0u8; 4];
    r.read_exact(&mut magic).map_err(err)?;
    if &magic != b"LWRG" {
        return Err("Straßennetz hat ein unbekanntes Format".into());
    }
    let head = read_u32s(&mut r, 3).map_err(err)?;
    let (version, n, m) = (head[0], head[1] as usize, head[2] as usize);
    let lat = read_i32s(&mut r, n).map_err(err)?;
    let lon = read_i32s(&mut r, n).map_err(err)?;
    let first = read_u32s(&mut r, n + 1).map_err(err)?;
    let target = read_u32s(&mut r, m).map_err(err)?;
    let time = read_u16s(&mut r, m).map_err(err)?;
    let dist = read_u16s(&mut r, m).map_err(err)?;
    let grenze = if version >= 2 {
        let nb = read_u32s(&mut r, 1).map_err(err)?[0] as usize;
        read_u32s(&mut r, nb).map_err(err)?
    } else {
        Vec::new()
    };
    Ok(Teil { lat, lon, first, target, time, dist, grenze })
}

impl Graph {
    #[allow(dead_code)]
    pub fn load(path: &Path) -> Result<Graph, String> {
        Self::load_many(&[path.to_path_buf()])
    }

    /// Lädt die Straßennetze mehrerer Bundesländer und fügt sie an den Grenzen zusammen
    /// (Grenzknoten mit gleichen Koordinaten werden ein Knoten, doppelte Kanten entfallen).
    pub fn load_many(paths: &[std::path::PathBuf]) -> Result<Graph, String> {
        if paths.is_empty() {
            return Err("Kein Straßennetz installiert".into());
        }
        let mut lat: Vec<i32> = Vec::new();
        let mut lon: Vec<i32> = Vec::new();
        // Kanten (von, nach, Zeit, Strecke)
        let mut kanten: Vec<(u32, u32, u16, u16)> = Vec::new();
        let mut grenz_knoten: HashMap<(i32, i32), u32> = HashMap::new();
        let mut grenz_kanten: std::collections::HashSet<(u32, u32)> = std::collections::HashSet::new();
        for p in paths {
            let t = lese_teil(p)?;
            let n = t.lat.len();
            let mut ist_grenze = vec![false; n];
            for &g in &t.grenze {
                if (g as usize) < n {
                    ist_grenze[g as usize] = true;
                }
            }
            // lokale -> gemeinsame Knotennummer
            let mut neu = vec![0u32; n];
            for u in 0..n {
                if ist_grenze[u] {
                    let key = (t.lat[u], t.lon[u]);
                    if let Some(&g) = grenz_knoten.get(&key) {
                        neu[u] = g;
                        continue;
                    }
                    let g = lat.len() as u32;
                    grenz_knoten.insert(key, g);
                    neu[u] = g;
                } else {
                    neu[u] = lat.len() as u32;
                }
                lat.push(t.lat[u]);
                lon.push(t.lon[u]);
            }
            for u in 0..n {
                for e in t.first[u] as usize..t.first[u + 1] as usize {
                    let v = t.target[e] as usize;
                    let (a, b) = (neu[u], neu[v]);
                    // Kanten zwischen zwei Grenzknoten gibt es in beiden Ländern: nur einmal übernehmen
                    if ist_grenze[u] && ist_grenze[v] && !grenz_kanten.insert((a, b)) {
                        continue;
                    }
                    kanten.push((a, b, t.time[e], t.dist[e]));
                }
            }
        }
        drop(grenz_knoten);
        drop(grenz_kanten);
        kanten.sort_unstable_by_key(|k| k.0);
        let n = lat.len();
        let mut first = vec![0u32; n + 1];
        for k in &kanten {
            first[k.0 as usize + 1] += 1;
        }
        for i in 0..n {
            first[i + 1] += first[i];
        }
        let target: Vec<u32> = kanten.iter().map(|k| k.1).collect();
        let time: Vec<u16> = kanten.iter().map(|k| k.2).collect();
        let dist: Vec<u16> = kanten.iter().map(|k| k.3).collect();
        drop(kanten);
        Ok(Self::aus_teilen(lat, lon, first, target, time, dist))
    }

    fn aus_teilen(lat: Vec<i32>, lon: Vec<i32>, first: Vec<u32>, target: Vec<u32>, time: Vec<u16>, dist: Vec<u16>) -> Graph {
        let n = lat.len();
        let m = target.len();

        // Umgekehrter Graph
        let mut rcount = vec![0u32; n + 1];
        for &t in &target {
            rcount[t as usize + 1] += 1;
        }
        for i in 0..n {
            rcount[i + 1] += rcount[i];
        }
        let rfirst = rcount.clone();
        let mut fill = rcount;
        let mut rsource = vec![0u32; m];
        let mut rtime = vec![0u16; m];
        for u in 0..n {
            for e in first[u] as usize..first[u + 1] as usize {
                let v = target[e] as usize;
                let pos = fill[v] as usize;
                rsource[pos] = u as u32;
                rtime[pos] = time[e];
                fill[v] += 1;
            }
        }

        // Komponenten (ungerichtet)
        let mut parent: Vec<u32> = (0..n as u32).collect();
        for u in 0..n {
            for e in first[u] as usize..first[u + 1] as usize {
                let (a, b) = (find(&mut parent, u as u32), find(&mut parent, target[e]));
                if a != b {
                    parent[a as usize] = b;
                }
            }
        }
        let mut size: HashMap<u32, u32> = HashMap::new();
        let mut roots = vec![0u32; n];
        for u in 0..n {
            let root = find(&mut parent, u as u32);
            roots[u] = root;
            *size.entry(root).or_insert(0) += 1;
        }

        let mut grid: HashMap<(i32, i32), Vec<u32>> = HashMap::new();
        for u in 0..n {
            if size[&roots[u]] < MIN_COMPONENT || first[u] == first[u + 1] {
                continue;
            }
            grid.entry((lat[u].div_euclid(CELL), lon[u].div_euclid(CELL))).or_default().push(u as u32);
        }

        Graph { lat, lon, first, target, time, dist, rfirst, rsource, rtime, grid }
    }

    /// Liegt der Punkt im Straßennetz (Straße höchstens `max_m` Meter entfernt)?
    pub fn erreichbar(&self, lat: f64, lon: f64, max_m: f64) -> bool {
        self.nearest(lat, lon).is_some_and(|u| {
            let (a, b) = self.coord(u);
            haversine(lat, lon, a, b) <= max_m
        })
    }

    pub fn node_count(&self) -> usize {
        self.lat.len()
    }

    fn coord(&self, u: u32) -> (f64, f64) {
        (self.lat[u as usize] as f64 / 1e6, self.lon[u as usize] as f64 / 1e6)
    }

    /// Nächster Straßenknoten (im großen Netz) zu einem Punkt.
    pub fn nearest(&self, lat: f64, lon: f64) -> Option<u32> {
        let (la, lo) = ((lat * 1e6) as i32, (lon * 1e6) as i32);
        let (cy, cx) = (la.div_euclid(CELL), lo.div_euclid(CELL));
        let mut best: Option<(f64, u32)> = None;
        for ring in 0..=12i32 {
            for dy in -ring..=ring {
                for dx in -ring..=ring {
                    if dy.abs() != ring && dx.abs() != ring {
                        continue;
                    }
                    if let Some(cell) = self.grid.get(&(cy + dy, cx + dx)) {
                        for &u in cell {
                            let (ula, ulo) = self.coord(u);
                            let d = haversine(lat, lon, ula, ulo);
                            if best.map_or(true, |b| d < b.0) {
                                best = Some((d, u));
                            }
                        }
                    }
                }
            }
            // Gefunden und der nächste Ring kann nicht näher sein
            if let Some((d, _)) = best {
                if d < (ring as f64) * 200.0 {
                    break;
                }
            }
        }
        best.map(|b| b.1)
    }

    /// Die nächsten Straßenknoten (bis `k`, höchstens `max_m` weiter als der nächste), nach Entfernung.
    /// Mehrere Kandidaten, weil der allernächste Knoten in einer Einbahn-Sackgasse liegen kann
    /// (z. B. Zufahrt auf ein Spitalsgelände).
    pub fn nearest_k(&self, lat: f64, lon: f64, k: usize, max_m: f64) -> Vec<(f64, u32)> {
        let Some(n0) = self.nearest(lat, lon) else { return Vec::new() };
        let (a, b) = self.coord(n0);
        let d0 = haversine(lat, lon, a, b);
        let grenze = d0 + max_m;
        let (la, lo) = ((lat * 1e6) as i32, (lon * 1e6) as i32);
        let (cy, cx) = (la.div_euclid(CELL), lo.div_euclid(CELL));
        let ringe = ((grenze / 200.0).ceil() as i32 + 1).min(14);
        let mut alle: Vec<(f64, u32)> = Vec::new();
        for dy in -ringe..=ringe {
            for dx in -ringe..=ringe {
                if let Some(cell) = self.grid.get(&(cy + dy, cx + dx)) {
                    for &u in cell {
                        let (ula, ulo) = self.coord(u);
                        let d = haversine(lat, lon, ula, ulo);
                        if d <= grenze {
                            alle.push((d, u));
                        }
                    }
                }
            }
        }
        alle.sort_by(|x, y| x.0.partial_cmp(&y.0).unwrap_or(std::cmp::Ordering::Equal));
        alle.truncate(k.max(1));
        if alle.is_empty() {
            alle.push((d0, n0));
        }
        alle
    }

    /// Schnellste Route zwischen zwei Punkten (A* mit mehreren Start- und Zielknoten in der Nähe).
    pub fn route(&self, from: (f64, f64), to: (f64, f64)) -> Option<RouteResult> {
        let starts = self.nearest_k(from.0, from.1, 8, 300.0);
        let ziele = self.nearest_k(to.0, to.1, 8, 300.0);
        if starts.is_empty() || ziele.is_empty() {
            return None;
        }
        let n = self.node_count();
        let t0 = ziele[0].1;
        let (tla, tlo) = self.coord(t0);
        let h = |u: u32| -> u32 {
            let (la, lo) = self.coord(u);
            (haversine(la, lo, tla, tlo) / MAX_SPEED_MPS * 10.0) as u32
        };
        // Zielknoten mit ihrem Fußweg zum Ziel
        let ziel_rest: HashMap<u32, u32> = ziele.iter().map(|&(d, u)| (u, (d / OFFROAD_MPS * 10.0) as u32)).collect();

        let mut g = vec![u32::MAX; n];
        let mut prev = vec![u32::MAX; n];
        let mut heap = BinaryHeap::new();
        for &(d, s) in &starts {
            let g0 = (d / OFFROAD_MPS * 10.0) as u32;
            if g0 < g[s as usize] {
                g[s as usize] = g0;
                heap.push(Reverse((g0.saturating_add(h(s)), s)));
            }
        }
        // bester gefundener Zielknoten (Fahrzeit inkl. Fußweg)
        let mut bestes: Option<(u32, u32)> = None;
        while let Some(Reverse((f, u))) = heap.pop() {
            if let Some((b, _)) = bestes {
                if f >= b {
                    break;
                }
            }
            let gu = g[u as usize];
            if let Some(&rest) = ziel_rest.get(&u) {
                let gesamt = gu.saturating_add(rest);
                if bestes.map_or(true, |(b, _)| gesamt < b) {
                    bestes = Some((gesamt, u));
                }
            }
            for e in self.first[u as usize] as usize..self.first[u as usize + 1] as usize {
                let v = self.target[e];
                let nv = gu.saturating_add(self.time[e] as u32);
                if nv < g[v as usize] {
                    g[v as usize] = nv;
                    prev[v as usize] = u;
                    heap.push(Reverse((nv.saturating_add(h(v)), v)));
                }
            }
        }
        let (_, t) = bestes?;
        let (tla, tlo) = self.coord(t);
        // Startknoten = Anfang der Kette
        let mut s = t;
        while prev[s as usize] != u32::MAX {
            s = prev[s as usize];
        }

        // Pfad rückwärts zusammensetzen
        let mut path = vec![t];
        let mut cur = t;
        while cur != s {
            cur = prev[cur as usize];
            if cur == u32::MAX {
                return None;
            }
            path.push(cur);
        }
        path.reverse();

        let mut coords = Vec::with_capacity(path.len() + 2);
        let mut times = Vec::with_capacity(path.len() + 2);
        let mut distance = 0.0;
        let mut t_acc = 0.0;
        // Zubringer vom Startpunkt zur Straße
        let (sla, slo) = self.coord(s);
        coords.push([from.1, from.0]);
        times.push(0.0);
        let d0 = haversine(from.0, from.1, sla, slo);
        t_acc += d0 / OFFROAD_MPS;
        distance += d0;
        coords.push([slo, sla]);
        times.push(t_acc);
        for w in path.windows(2) {
            let (u, v) = (w[0], w[1]);
            // Kante u->v suchen (schnellste, falls mehrere)
            let mut best: Option<(u16, u16)> = None;
            for e in self.first[u as usize] as usize..self.first[u as usize + 1] as usize {
                if self.target[e] == v && best.map_or(true, |b| self.time[e] < b.0) {
                    best = Some((self.time[e], self.dist[e]));
                }
            }
            let (tt, dd) = best.unwrap_or((0, 0));
            t_acc += tt as f64 / 10.0;
            distance += dd as f64;
            let (vla, vlo) = self.coord(v);
            coords.push([vlo, vla]);
            times.push(t_acc);
        }
        // Stück von der Straße zum Ziel
        let d1 = haversine(tla, tlo, to.0, to.1);
        t_acc += d1 / OFFROAD_MPS;
        distance += d1;
        coords.push([to.1, to.0]);
        times.push(t_acc);

        Some(RouteResult { coords, times, duration: t_acc, distance })
    }

    /// Fahrzeiten (Sekunden, ohne Sondersignal) von vielen Startpunkten zu einem Ziel.
    /// Ein einziger rückwärts laufender Dijkstra; bricht ab, wenn alle gefunden sind
    /// oder max_seconds überschritten ist.
    pub fn travel_times_to(&self, to: (f64, f64), sources: &[(f64, f64)], max_seconds: f64) -> Vec<Option<f64>> {
        let ziele = self.nearest_k(to.0, to.1, 6, 300.0);
        if ziele.is_empty() {
            return vec![None; sources.len()];
        }
        // je Startpunkt einige Knoten in der Nähe (Einbahn-Sackgassen umgehen)
        let mut wanted: HashMap<u32, Vec<(usize, f64)>> = HashMap::new();
        for (i, &(la, lo)) in sources.iter().enumerate() {
            for (d, s) in self.nearest_k(la, lo, 4, 250.0) {
                wanted.entry(s).or_default().push((i, d / OFFROAD_MPS));
            }
        }
        let mut out: Vec<Option<f64>> = vec![None; sources.len()];
        // fertig, sobald jeder Startpunkt eine Zeit hat (der erste gefundene Knoten ist fast immer der schnellste)
        let mut offen: std::collections::HashSet<usize> = wanted.values().flatten().map(|&(i, _)| i).collect();
        if offen.is_empty() {
            return out;
        }

        let limit = (max_seconds * 10.0) as u32;
        let mut g: HashMap<u32, u32> = HashMap::new();
        let mut heap = BinaryHeap::new();
        for &(d, t) in &ziele {
            let t0 = (d / OFFROAD_MPS * 10.0) as u32;
            if t0 < g.get(&t).copied().unwrap_or(u32::MAX) {
                g.insert(t, t0);
                heap.push(Reverse((t0, t)));
            }
        }
        while let Some(Reverse((d, u))) = heap.pop() {
            if g.get(&u).copied().unwrap_or(u32::MAX) < d {
                continue;
            }
            if d > limit {
                break;
            }
            if let Some(list) = wanted.remove(&u) {
                for (i, head) in list {
                    let v = d as f64 / 10.0 + head;
                    if out[i].map_or(true, |x| v < x) {
                        out[i] = Some(v);
                    }
                    offen.remove(&i);
                }
                if offen.is_empty() {
                    break;
                }
            }
            for e in self.rfirst[u as usize] as usize..self.rfirst[u as usize + 1] as usize {
                let v = self.rsource[e];
                let nv = d.saturating_add(self.rtime[e] as u32);
                if nv < g.get(&v).copied().unwrap_or(u32::MAX) {
                    g.insert(v, nv);
                    heap.push(Reverse((nv, v)));
                }
            }
        }
        out
    }
}
