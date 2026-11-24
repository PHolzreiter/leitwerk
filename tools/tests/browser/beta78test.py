# Beta 78 (Paul 24.11.2026): Rettungszufahrten mit eingezeichnetem Weg auf dem Gelände (hin = Einfahrt → P,
# aus = P → Straße) für LK Horn, Allentsteig, Hollabrunn, Zwettl, Mistelbach, Melk.
# Aufruf: python3 beta78test.py <arbeitsordner> <web-build>
import subprocess, sys, time, math
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8978", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
NEU = {"kh005": "Mistelbach", "kh007": "Horn", "kh013": "Hollabrunn", "kh017": "Melk", "kh020": "Zwettl", "kh040": "Allentsteig"}
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8978/?debug&seed=8978"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)

        # 1) Lesen / Schreiben mit Weg
        z = A.evaluate("""() => { const Z = window.__lw.zufahrt;
          const t = 'einfahrt=48.1,15.2; hin=48.11,15.21 / 48.12,15.22; p=48.3,15.4; aus=48.29,15.39 / 48.28,15.38';
          const a = Z.lesen(t);
          return { a, zurueck: Z.lesen(Z.text(a)), alt: Z.lesen('einfahrt=48.1,15.2; p=48.3,15.4'), ohneEin: Z.lesen('p=48.3,15.4; hin=48.2,15.3'),
            text: Z.text(a) }; }""")
        a = z["a"]
        check(a and len(a.get("hin", [])) == 2 and len(a.get("aus", [])) == 2 and a["ein"] == {"lat": 48.1, "lon": 15.2} and a["p"] == {"lat": 48.3, "lon": 15.4}, f"Zufahrt mit Weg lesen ({a})")
        check(z["zurueck"] == a, f"Schreiben und wieder lesen gleich ({z['text']})")
        check(z["alt"] == {"p": {"lat": 48.3, "lon": 15.4}, "ein": {"lat": 48.1, "lon": 15.2}}, "alte Schreibweise unverändert")
        check(z["ohneEin"] == {"p": {"lat": 48.3, "lon": 15.4}}, "Hinweg ohne Einfahrt wird ignoriert")

        # 2) die sechs Häuser haben Einfahrt, Weg hinein, P und Weg hinaus – alles nahe am Haus
        kh = A.evaluate("(ids) => ids.map(id => { const h = window.__lw.store.get('hospitals', id); return h && { id, name: h.kurzname, lat: h.lat, lon: h.lon, z: h.zufahrt }; })", list(NEU))
        d = lambda a, b: math.hypot((a["lat"] - b["lat"]) * 111320, (a["lon"] - b["lon"]) * 111320 * math.cos(math.radians(a["lat"])))
        for h in kh:
            zz = h and h["z"]
            ok = bool(zz and zz.get("ein") and zz.get("hin") and zz.get("aus") and zz.get("p"))
            weit = max(d(h, x) for x in [zz["ein"], zz["p"], *zz["hin"], *zz["aus"]]) if ok else 0
            check(ok and weit < 300, f"{NEU[h['id']]}: Einfahrt, Weg ({len(zz['hin']) if ok else 0}/{len(zz['aus']) if ok else 0} Punkte), P – höchstens {weit:.0f} m vom Haus")

        # 3) Route zum KH folgt genau dem eingezeichneten Weg und endet bei P; vom KH weg zuerst der Weg hinaus
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const out = {};
          const dm = (c, p) => Math.hypot((c[1]-p.lat)*111320, (c[0]-p.lon)*111320*Math.cos(p.lat*Math.PI/180));
          for (const id of ['kh007','kh017']) {
            const h = L.store.get('hospitals', id); const z = h.zufahrt;
            const von = { lat: h.lat + 0.03, lon: h.lon - 0.04 };
            const hin = await s.strassenRoute(von, { lat: h.lat, lon: h.lon });
            const n = z.hin.length + 2; const ende = hin.coords.slice(-n);
            const weg = [z.ein, ...z.hin, z.p];
            const zurueck = await s.strassenRoute(z.p, von);
            const anfang = zurueck.coords.slice(0, z.aus.length + 1);
            out[id] = { hinGenau: ende.every((c, i) => dm(c, weg[i]) < 0.5), hinMono: hin.times.every((t,i) => i === 0 || t >= hin.times[i-1]),
              ausGenau: anfang.every((c, i) => dm(c, [z.p, ...z.aus][i]) < 0.5), ausMono: zurueck.times.every((t,i) => i === 0 || t >= zurueck.times[i-1]),
              ziel: dm(zurueck.coords[zurueck.coords.length-1], von), dauer: hin.duration };
          }
          return out; }""")
        for id, v in r.items():
            check(v["hinGenau"] and v["hinMono"] and v["dauer"] > 0, f"{NEU[id]}: Fahrt hinein über Einfahrt und eingezeichneten Weg bis P ({v})")
            check(v["ausGenau"] and v["ausMono"] and v["ziel"] < 1, f"{NEU[id]}: Fahrt hinaus zuerst über den Weg zur Ausfahrt")

        # 4) im Spiel: RTW-Transport nach Horn endet bei P
        t = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const h = L.store.get('hospitals','kh007');
          const fz = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'RTW');
          s.fahre(fz, h, 'transport', false); await new Promise(r => setTimeout(r, 400));
          const c = fz.fahrt?.coords ?? []; return { e: c[c.length-1], p: h.zufahrt.p, n: c.length }; }""")
        e = t["e"]; pp = t["p"]
        check(e and abs(e[1] - pp["lat"]) < 1e-5 and abs(e[0] - pp["lon"]) < 1e-5 and t["n"] > 5, f"RTW-Fahrt ins LK Horn endet bei P ({t['n']} Punkte)")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
