# v0.48: kleine POI-Punkte, keine Bushaltestellen, unsichtbare Einsatzstellen (Straßen, Gelände), Ortsarten, Autobahn-km
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8832", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
PROBE = """async ([id, v]) => { const L = window.__lw; const s = L.sim; const e = await s.probeFall(id, v); if (!e) return null; const w = e.wahr.abfrage;
  return { kat: w?.szenario?.ortKat ?? null, ortArt: w?.szenario?.ortArt ?? null, unbekannt: !!w?.ortUnbekannt, adr: e.wahr.adresse, gemeldet: e.meldung?.adresse ?? '', partner: s.partnerBedarf(e).map(x => x.art).sort(), a: w?.antworten ?? {} }; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8832/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        A.evaluate("() => { window.__lw.sim.state.zeit = new Date('2026-07-14T17:00').getTime(); }")  # Dienstag 17 Uhr: Hochstand, Kellergasse offen
        n = A.evaluate("() => window.__lw.store.list('pois').filter(p => /bushaltestelle/i.test(p.typ)).length")
        check(n == 0, f"keine Bushaltestellen mehr ({n})")
        # Einsatzstellen
        st = A.evaluate("async () => { const l = await window.__lw.stellen.laden(); const typen = {}; for (const s of l) typen[s.typ] = (typen[s.typ] || 0) + 1; const ab = l.find(s => s.typ === 'autobahn' && /^\\d/.test(s.info)); return { n: l.length, typen, ab }; }")
        check(st["n"] > 10000 and all(t in st["typen"] for t in ["autobahn", "landstrasse", "wald", "berg", "ufer", "bahnuebergang", "bruecke", "kellergasse", "hochstand"]), f"Einsatzstellen geladen ({st['n']}: {st['typen']})")
        ab = st["ab"]
        if ab:
            km = ab["info"].split("|")[0]
            r = A.evaluate("async (q) => (await window.__lw.suche(q)).map(h => h.label)", f"{ab['name']} {km}")
            check(any("Kilometer" in x for x in r), f"Suche „{ab['name']} {km}“ findet den Autobahn-Kilometer ({r[:2]})")
        # Fälle an Straßen und im Gelände
        def probe(fid, v, n=3):
            return [A.evaluate(PROBE, [fid, v]) for _ in range(n)]
        r = probe("forst_baum", "A")
        check(all(x and x["kat"] == "wald" and x["unbekannt"] and "fw" in x["partner"] for x in r), f"Wald: ohne Adresse (Ortung), Feuerwehr ({[(x['kat'], x['gemeldet'][:40]) for x in r]})")
        r = probe("hochstand_sturz", "A")
        check(all(x and x["kat"] == "hochstand" and x["unbekannt"] for x in r), f"Hochstand ({[x['gemeldet'][:40] for x in r]})")
        r = probe("kellergasse_gaergas", "A")
        check(all(x and x["kat"] == "kellergasse" and "fw" in x["partner"] for x in r), f"Kellergasse mit Feuerwehr ({[x['adr'][:40] for x in r]})")
        r = probe("bahnuebergang_zug", "A")
        check(all(x and x["kat"] == "bahnuebergang" and "pol" in x["partner"] and "fw" in x["partner"] for x in r), f"Bahnübergang ({[x['adr'][:40] for x in r]})")
        r = probe("radweg_sturz", "A")
        check(all(x and x["kat"] == "radweg" for x in r), f"Radweg ({[x['gemeldet'][:40] for x in r]})")
        r = probe("vu_eingeklemmt", "A")
        check(all(x and x["ortArt"] == "landstrasse" and x["kat"] == "landstrasse" and not x["unbekannt"] for x in r), f"Landstraße: findbar beschrieben ({[x['gemeldet'][:45] for x in r]})")
        # Regel: im Ort langsam, außerorts schnell (Szenario-Fälle über den Generator)
        g = A.evaluate("""async () => { const s = window.__lw.sim; s.settings.fallKatalog = 'aus'; const out = []; for (let i = 0; i < 80; i++) { const e = await s.generiere(['stabil','dringend','kritisch'][i % 3]); const w = e?.wahr.abfrage; if (w?.szenario && /verkehrsunfall/.test(w.szenario.thema)) out.push([w.szenario.ortArt, w.antworten.hohe_geschw ?? null]); } s.settings.fallKatalog = 'nur'; return out; }""")
        check(any(x[0] in ("landstrasse", "autobahn") for x in g), f"Unfälle auch außerorts ({g[:8]})")
        # Karte: kleine, blasse Punkte; Entwickler-Ebene
        A.evaluate("() => window.__lw.panelZeigen && window.__lw.panelZeigen('karte')"); A.wait_for_timeout(2500)
        op = A.evaluate("() => { const m = window.__lw.map; return m && m.getLayer('lw-pois') ? m.getPaintProperty('lw-pois', 'circle-opacity') : null; }")
        check(op is not None and op <= 0.6, f"POI-Punkte blass ({op})")
        vis0 = A.evaluate("() => !document.querySelector('.nur-entwickler')?.hidden")
        A.evaluate("() => window.__lw.setzePers({ entwickler: true })"); A.wait_for_timeout(300)
        vis1 = A.evaluate("() => !document.querySelector('.nur-entwickler')?.hidden")
        check(not vis0 and vis1, f"Einsatzstellen-Ebene nur mit Entwicklerfunktionen ({vis0} → {vis1})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
