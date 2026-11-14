# v0.46: NEF nach RTW, Akutversorgung = Übersicht, feine POI-Kategorien, POIs ab Zoom
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8830", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8830/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        # NEF rückt bei gleichzeitiger Alarmierung nach dem RTW aus
        r = A.evaluate("""async () => { const s = window.__lw.sim; const out = [];
            for (let i = 0; i < 25; i++) { const e = await s.generiereFall('kollaps', 'A'); e.adresse = e.adresse || e.wahr?.adresse || 'Test'; 
              const fz = Object.values(s.state.fahrzeuge); const rtw = fz.find(f => f.kategorie === 'RTW' && f.status === 'freiWache' && f.phase === 'frei'); const nef = fz.find(f => f.kategorie === 'NEF' && f.status === 'freiWache' && f.phase === 'frei');
              if (!rtw || !nef) break; s.alarmiere(e.id, [nef.id, rtw.id]); out.push([nef.phaseEnde - rtw.phaseEnde, rtw.status, nef.status]);
              for (const f of [rtw, nef]) { f.phase = 'frei'; f.einsatzId = null; f.status = 'freiWache'; f.fahrt = null; f.phaseEnde = null; } }
            return out; }""")
        check(len(r) >= 10 and all(x[0] > 0 for x in r), f"NEF immer nach dem RTW ({len(r)} Alarme, min. Abstand {min(x[0] for x in r)/1000 if r else None} s)")
        # Akutversorgung passt zur Übersicht – alle Häuser, alle Spalten
        r = A.evaluate("""() => { const L = window.__lw; const t = L.sim.state.zeit; const fehl = [];
            for (const h of L.store.list('hospitals')) { const ak = L.kh.akutVon(h);
              for (const [n, ids] of Object.entries(L.kh.AKV_SPALTEN_AK)) { const da = !!L.kh.akvZustand(h, n, t); const soll = ids.some(x => ak.has(x)); if (da !== soll) fehl.push(h.kurzname + ':' + n); } }
            const krems = L.store.list('hospitals').find(h => h.id === 'kh002');
            return { fehl, krs: !!L.kh.akvZustand(krems, 'KRS', t), kind: !!L.kh.akvZustand(krems, 'KIND', t), n: L.store.list('hospitals').length }; }""")
        check(not r["fehl"] and r["krs"] and r["kind"], f"Akutversorgung = Übersicht bei allen {r['n']} Häusern (Krems KRS {r['krs']}, KIND {r['kind']}, Abweichungen {r['fehl'][:5]})")
        # feine POI-Kategorien
        r = A.evaluate("""() => { const o = window.__lw.orte; return {
            vs: o.poiKategorien({ typ: 'Volksschule', name: '' }), alt: o.poiKategorien({ typ: 'Schule', name: '' }), key: o.poiKategorien({ typ: 'reitanlage,sportplatz', name: '' }),
            klein: o.kategorienFuerOrtArt('schule', 4), teen: o.kategorienFuerOrtArt('schule', 16),
            biss: [o.ortGewicht(['reitanlage'], 'tierbiss', 30), o.ortGewicht(['supermarkt'], 'tierbiss', 30)],
            disco: [o.ortGewicht(['disco'], 'vergiftung', 20), o.ortGewicht(['disco'], 'vergiftung', 80)] }; }""")
        check(r["vs"] == ["volksschule"] and r["alt"] == ["schule"] and r["key"] == ["reitanlage", "sportplatz"], f"Kategorien erkannt ({r['vs']}, {r['alt']}, {r['key']})")
        check("kindergarten" in r["klein"] and "volksschule" not in r["klein"] and "hoehere_schule" in r["teen"] and "kindergarten" not in r["teen"], f"Alter passt zur Einrichtung ({r['klein']} / {r['teen']})")
        check(r["biss"][0] > r["biss"][1] * 3 and r["disco"][0] > r["disco"][1] * 5, f"Thema und Alter gewichten ({r['biss']}, {r['disco']})")
        # POIs erst ab Zoom (einstellbar)
        A.evaluate("() => window.__lw.panelZeigen && window.__lw.panelZeigen('karte')"); A.wait_for_timeout(2500)
        z1 = A.evaluate("() => { const m = window.__lw.map; return m && m.getLayer('lw-pois') ? [m.getLayer('lw-pois').minzoom, m.getLayer('lw-pois-w').minzoom] : null; }")
        A.evaluate("() => window.__lw.setzePers({ poiZoom: 12 })"); A.wait_for_timeout(500)
        z2 = A.evaluate("() => { const m = window.__lw.map; return m && m.getLayer('lw-pois') ? [m.getLayer('lw-pois').minzoom, m.getLayer('lw-pois-w').minzoom] : null; }")
        check(z1 == [14, 11] and z2 == [12, 9], f"POIs ab Zoom 14 (wichtige ab 11), einstellbar ({z1} → {z2})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
