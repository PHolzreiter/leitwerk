use std::path::PathBuf;

fn main() {
    xplane_plugin();
    tauri_build::build()
}

/// X-Plane-Plugin (tools/xplane-plugin, von GitHub Actions gebaut) ins Programm legen:
/// erwartet src-tauri/xplane-plugin/<win_x64|mac_x64|lin_x64>/LeitWerk.xpl – fehlt die Datei (z. B. beim
/// Entwickeln), bleibt sie leer und LeitWerk bietet das Plugin nicht an.
fn xplane_plugin() {
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let ordner = match os.as_str() {
        "windows" => "win_x64",
        "macos" => "mac_x64",
        _ => "lin_x64",
    };
    let quelle = PathBuf::from("xplane-plugin").join(ordner).join("LeitWerk.xpl");
    println!("cargo:rerun-if-changed=xplane-plugin");
    println!("cargo:rerun-if-env-changed=LEITWERK_XPLANE_PLUGIN");
    let bytes = std::fs::read(&quelle).unwrap_or_default();
    std::fs::write(out.join("LeitWerk.xpl"), bytes).unwrap();
    // Version aus tools/xplane-plugin/CMakeLists.txt
    let cmake = std::fs::read_to_string("../tools/xplane-plugin/CMakeLists.txt").unwrap_or_default();
    let version = cmake
        .lines()
        .find_map(|z| z.trim().strip_prefix("set(LEITWERK_PLUGIN_VERSION \"").and_then(|r| r.split('"').next()))
        .unwrap_or("0.0.0");
    println!("cargo:rerun-if-changed=../tools/xplane-plugin/CMakeLists.txt");
    println!("cargo:rustc-env=LEITWERK_XP_PLUGIN_VERSION={version}");
}
