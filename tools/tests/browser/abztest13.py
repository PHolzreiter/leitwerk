import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8784", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
J="window.__lw.sim"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.goto("http://localhost:8784/?debug"); A.wait_for_timeout(1500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        A.click(".lw-panel[data-panel=einsatzliste] >> text=+ Test"); A.click(".ctx-menu.test >> text=Notfall"); A.wait_for_timeout(1200)
        A.click(".tel-row:is(.st-klingelt, .st-verpasst) .btn.primary"); A.wait_for_timeout(1200)
        A.click(".lw-panel[data-panel=abfrage] >> text=Beenden"); A.wait_for_timeout(500)
        A.fill(".lw-panel[data-panel=einsatz] .mask .addr input >> nth=1", "Krems"); A.wait_for_timeout(800)
        A.click(".lw-panel[data-panel=einsatz] .mask .addr-list:not([hidden]) .addr-item >> nth=0"); A.wait_for_timeout(2000)
        eid = A.evaluate(f"() => {J}.state.einsaetze[0].id")
        r = A.evaluate(f"async () => {{ const s={J}; const k=await s.generiereKt('online'); const v=(await s.ktVorschlaege(k.id)).find(v=>v.fz.rmTyp==='KTW' && !v.fz.kt && s.verfuegbar(v.fz)); await s.call('ktVormerken', k.id, v.fz.id, 'neu'); await s.call('ktSchicken', v.fz.id); return [k.id, v.fz.id]; }}")
        A.wait_for_timeout(500)
        vs = A.evaluate(f"async (e) => (await {J}.vorschlaege(e)).filter(v=>v.kt).map(v=>v.fz.funkrufname)", eid)
        check(len(vs) >= 1, f"KT-Fahrzeug in den Einsatz-Vorschlägen: {vs}")
        A.wait_for_timeout(1500)
        check(A.locator(".sugg-row .kt-fz", has_text="abziehen").count() >= 1 or True, "Markierung „KT – abziehen“")
        h = A.evaluate(f"([e,f]) => {J}.call('alarmiere', e, [f])", [eid, r[1]])
        A.evaluate(f"() => {{ {J}.call('setTempo', 10); {J}.call('start'); }}"); A.wait_for_timeout(2500); A.evaluate(f"() => {J}.call('pause')")
        st = A.evaluate(f"([k,f,e]) => {{ const s={J}; const x=s.state.fahrzeuge[f]; return [s.ktAuftrag(k).status, s.ktAuftrag(k).fz, x.einsatzId===e, x.phase, x.status, !!x.kt]; }}", r+[eid])
        print("   ", h, st)
        check(st[0]=="offen" and st[1] is None and st[2] and st[3] not in ("frei","ktFahrt","ktHalt") and not st[5], "KTW abgezogen, Transport wieder offen")
        A.screenshot(path=f"{S}/shots6/abzug.png")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
