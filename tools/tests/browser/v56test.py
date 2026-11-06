# v0.56: Fahrzeuge bewegen sich auf der 2D-Karte flüssig (zwischen den Simulationsschritten weitergerechnet)
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8843", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1400, "height": 900})
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8843/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); window.__lw.zeige('karte'); }")
        A.wait_for_timeout(1500)
        A.evaluate("""async () => { const s = window.__lw.sim; const fz = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'RTW');
          s.fahre(fz, { lat: fz.lat + 0.2, lon: fz.lon + 0.2 }, 'rueckfahrt', false); await new Promise(r => setTimeout(r, 200));
          window.__testFz = fz.id; s.call('start'); }""")
        # Simulationsschritte künstlich selten: die Spielzeit bleibt stehen, die Anzeige rechnet weiter
        pos = []
        for i in range(4):
            A.wait_for_timeout(150)
            pos.append(A.evaluate("""async () => { const src = window.__lw.map.getSource("lw-vehicles"); const d = typeof src.getData === "function" ? await src.getData() : (src._data?.geojson ?? src._data); const f = (d?.features ?? []).find(x => x.properties.lwid === window.__testFz); return f ? f.geometry.coordinates : JSON.stringify(Object.keys(src._data ?? {})).slice(0, 80); }"""))
        A.evaluate("() => window.__lw.sim.call('pause')")
        verschieden = len({tuple(p) for p in pos if p})
        check(verschieden >= 3, f"Fahrzeugpunkt bewegt sich zwischen den Schritten (≈10× pro Sekunde): {verschieden} verschiedene Positionen in 0,6 s")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
