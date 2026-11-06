import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8787", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} })()")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.goto("http://localhost:8787/?debug"); A.wait_for_timeout(1500)
        A.click("[data-act=einstellungen]"); A.click(".es-punkt[data-seite=codes]"); A.wait_for_timeout(400)
        with A.expect_file_chooser() as fc: A.click(".schema-bar >> text=Eigenes Codesystem laden")
        fc.value.set_files(__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)),"../../../data/beispiele/beispiel_codesystem.json")); A.wait_for_timeout(1000)
        r = A.evaluate("() => { const s=window.__lw.store; return [s.schema?.name, s.list('codes').length, s.settings.stufen.map(x=>x.stufe)]; }")
        print("   ", r)
        check(r[0] == "Beispiel-Codesystem (LeitWerk)" and r[1] == 23 and "S4 Notarzt" in r[2], "Beispiel geladen, Einsatzstufen angelegt")
        A.screenshot(path=f"{S}/cs_geladen.png")
        e = A.evaluate("async () => { const s=window.__lw.sim; const out=[]; for (let i=0;i<8;i++){ const e=await s.generiere(); if(e) out.push([e.wahr.code, e.wahr.abfrage?.kapitel, e.stufe ?? '', (e.wahr.abfrage?.anrufer?.art)||'']); } return out; }")
        print("   ", e)
        check(len(e) >= 4 and all(x[0][:2] in ("01","02","03") for x in e), "Einsätze mit eigenem Codesystem")
        # zurück zum großen Schema: Dialog mit Ersetzen
        with A.expect_file_chooser() as fc: A.click(".schema-bar >> text=Anderes laden")
        fc.value.set_files(f"{S}/abf/abfrageschema.json"); A.wait_for_timeout(1200)
        dlg = A.locator(".dlg >> text=Eigenes Codesystem laden").count()
        A.screenshot(path=f"{S}/cs_wechsel.png")
        check(dlg >= 1, "Wechsel fragt nach")
        A.click(".dlg-foot >> text=Laden"); A.wait_for_timeout(1500)
        r = A.evaluate("() => { const s=window.__lw.store; return [Object.keys(s.schema.kapitel).length, s.list('codes').length, s.list('codes').some(c=>c.code==='02-S1-01')]; }")
        print("   ", r)
        check(r[1] == 2650 and not r[2], "alte Codes ersetzt")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
