//! Aufruf: roadtest <roads-a.lwrg.gz> [<roads-b.lwrg.gz> …]
//! Lädt die Netze zusammen und rechnet ein paar Routen über Landesgrenzen.
#[allow(dead_code)]
#[path = "../../../src-tauri/src/routing.rs"]
mod routing;

use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let paths: Vec<PathBuf> = std::env::args().skip(1).map(PathBuf::from).collect();
    let t = Instant::now();
    let g = routing::Graph::load_many(&paths).expect("laden");
    println!("Geladen: {} Dateien, {} Knoten, {:.1} s", paths.len(), g.node_count(), t.elapsed().as_secs_f64());
    let orte = [
        ("UK Krems", 48.41201, 15.615683),
        ("AKH Wien", 48.219954, 16.347657),
        ("UK St. Pölten", 48.214468, 15.627103),
        ("LKH-Univ. Graz", 47.0840468, 15.4655544),
        ("Klinikum Wels", 48.1737117, 14.0262798),
        ("Klinik Oberwart", 47.2792781, 16.204488),
        ("LK Zwettl", 48.599825, 15.162106),
    ];
    for (n, la, lo) in orte {
        println!("erreichbar {n}: {}", g.erreichbar(la, lo, 3000.0));
    }
    let paare = [(0, 1), (2, 3), (0, 4), (1, 5), (6, 1), (3, 4)];
    for (a, b) in paare {
        let (na, la, lo) = orte[a];
        let (nb, lb, lob) = orte[b];
        let t = Instant::now();
        match g.route((la, lo), (lb, lob)) {
            Some(r) => println!("{na} -> {nb}: {:.0} min, {:.0} km ({} ms)", r.duration / 60.0, r.distance / 1000.0, t.elapsed().as_millis()),
            None => println!("{na} -> {nb}: keine Route"),
        }
    }
}
