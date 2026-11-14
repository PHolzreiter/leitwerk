# v0.50: Rettungszufahrten (Einfahrt + Punkt P) für UK St. Pölten, Krems, Tulln
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8835", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8835/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        z = A.evaluate("""() => { const L = window.__lw; const Z = L.zufahrt; const st = L.store;
          const kh = ['kh001','kh002','kh003'].map(id => st.get('hospitals', id));
          return { parse: Z.lesen('einfahrt=48.1,15.2; p=48.3,15.4'), nurP: Z.lesen('48.3, 15.4'), falsch: Z.lesen('quatsch'),
            text: Z.text({ p: {lat: 48.3, lon: 15.4}, ein: {lat: 48.1, lon: 15.2} }),
            kh: kh.map(h => h && { name: h.kurzname, z: h.zufahrt }),
            beiHaus: !!Z.bei({ lat: kh[1].lat, lon: kh[1].lon }), beiP: !!Z.bei(kh[1].zufahrt.p), woanders: Z.bei({ lat: 48.2, lon: 15.6 }),
            andere: st.list('hospitals').filter(h => h.zufahrt).length }; }""")
        check(z["parse"] == {"p": {"lat": 48.3, "lon": 15.4}, "ein": {"lat": 48.1, "lon": 15.2}} and z["nurP"] == {"p": {"lat": 48.3, "lon": 15.4}} and z["falsch"] is None, f"Zufahrt lesen ({z['parse']}, {z['nurP']})")
        check(z["text"] == "einfahrt=48.100000,15.200000; p=48.300000,15.400000", f"Zufahrt schreiben ({z['text']})")
        check(all(k and k["z"] and k["z"].get("ein") and k["z"].get("p") for k in z["kh"]) and z["andere"] == 3, f"UK St. Pölten/Krems/Tulln haben Einfahrt + P ({z['kh']})")
        check(z["beiHaus"] and z["beiP"] and z["woanders"] is None, "Ziel Haus oder P wird erkannt, andere Orte nicht")
        # Route zum KH: über die Einfahrt, endet bei P
        r = A.evaluate("""async () => { const L = window.__lw; const h = L.store.get('hospitals','kh002'); const s = L.sim;
          const von = { lat: 48.40, lon: 15.58 };
          const r = await s.strassenRoute(von, { lat: h.lat, lon: h.lon });
          const d = (a, b) => Math.hypot((a[1]-b.lat)*111000, (a[0]-b.lon)*74000);
          const ende = r.coords[r.coords.length-1];
          return { ende: d(ende, h.zufahrt.p), ueberEin: Math.min(...r.coords.map(c => d(c, h.zufahrt.ein))), mono: r.times.every((t,i) => i === 0 || t >= r.times[i-1]), dauer: r.duration,
            direkt: (await s.strassenRoute(von, { lat: 48.2, lon: 15.6 })).coords.length }; }""")
        check(r["ende"] < 2 and r["ueberEin"] < 2 and r["mono"] and r["dauer"] > 0, f"Transport nach Krems: über die Einfahrt, endet bei P ({r})")
        # Transport im Spiel: RTW fährt zu P
        t = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const h = L.store.get('hospitals','kh003');
          const fz = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'RTW');
          const alt = { lat: fz.lat, lon: fz.lon };
          s.fahre(fz, h, 'transport', false); await new Promise(r => setTimeout(r, 300));
          const c = fz.fahrt?.coords ?? []; const e = c[c.length-1];
          return { e, p: h.zufahrt.p }; }""")
        e = t["e"]; pp = t["p"]
        check(e and abs(e[1] - pp["lat"]) < 1e-5 and abs(e[0] - pp["lon"]) < 1e-5, f"RTW-Fahrt ins UK Tulln endet bei P ({t})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
