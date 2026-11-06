import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8786", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.goto("http://localhost:8786/?debug"); A.wait_for_timeout(1500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        A.evaluate("() => window.__lw.store.upsert('pois', [{id:'p-t1', name:'Pflegeheim Sonnenhof', typ:'Pflegeheim', ort:'Krems', lat:48.41, lon:15.61, hinweis:'', herkunft:'manuell'}, {id:'p-t2', name:'Volksschule Mitte', typ:'Schule', ort:'Krems', lat:48.40, lon:15.60, hinweis:'', herkunft:'manuell'}, {id:'p-t3', name:'Bahnhof Tulln', typ:'Bahnhof', ort:'Tulln', lat:48.33, lon:16.05, hinweis:'', herkunft:'manuell'}, {id:'p-t4', name:'Kindergarten Sonne', typ:'Kindergarten', ort:'Krems', lat:48.405, lon:15.62, hinweis:'', herkunft:'manuell'}])"); A.wait_for_timeout(400)
        r = A.evaluate("""async () => { const s=window.__lw.sim; const out=[]; for (let i=0;i<60;i++) { const e=await s.generiere(); if (e) out.push(["", e.wahr.adresse, e.wahr.abfrage?.code ?? "", e.wahr.abfrage?.szenario?.ortArt ?? "", e.wahr.abfrage?.antworten?.alter ?? "", e.meldung.adresse]); } return out; }""")
        poi = [x for x in r if any(n in x[1] for n in ["Sonnenhof","Volksschule","Bahnhof Tulln","Kindergarten"])]
        for x in poi: print("   ", x)
        print("    von", len(r), "Einsätzen an POIs:", len(poi))
        check(len(poi) >= 2, "Einsätze an passenden POIs")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
