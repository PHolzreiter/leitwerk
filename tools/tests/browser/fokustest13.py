import subprocess, sys, time, math
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8785", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
J="window.__lw.sim"; M="window.__lw.map"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        A = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type == "error" and "404" not in m.text and "glyph" not in m.text.lower() else None)
        A.goto("http://localhost:8785/?debug"); A.wait_for_timeout(1500)
        A.evaluate(f"() => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(11,0,0,0); s.state.zeit=d.getTime(); s.state.wetter && (s.state.wetter.lage='klar'); }}")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        A.click(".lw-panel[data-panel=einsatzliste] >> text=+ Test"); A.click(".ctx-menu.test >> text=Notfall"); A.wait_for_timeout(1200)
        A.click(".tel-row:is(.st-klingelt, .st-verpasst) .btn.primary"); A.wait_for_timeout(1000)
        A.click(".lw-panel[data-panel=abfrage] >> text=Beenden"); A.wait_for_timeout(400)
        A.fill(".lw-panel[data-panel=einsatz] .mask .addr input >> nth=1", "Krems"); A.wait_for_timeout(800)
        A.click(".lw-panel[data-panel=einsatz] .mask .addr-list:not([hidden]) .addr-item >> nth=0"); A.wait_for_timeout(1500)
        if A.locator(".map-message:not([hidden])").count(): A.click(".map-message")
        # Übersicht: kleine Punkte beim Herauszoomen
        A.evaluate(f"() => {M}.jumpTo({{center:[15.62,48.3], zoom:7.6}})"); A.wait_for_timeout(1200)
        A.screenshot(path=f"{S}/shots7/zoom76.png", clip={"x":340,"y":44,"width":750,"height":900})
        A.evaluate(f"() => {M}.jumpTo({{zoom:10}})"); A.wait_for_timeout(1000)
        A.screenshot(path=f"{S}/shots7/zoom10.png", clip={"x":340,"y":44,"width":750,"height":900})
        r = A.evaluate(f"() => {M}.getPaintProperty('lw-hospitals','circle-radius')")
        check("2.5" in str(r) or 2.5 in (r if isinstance(r,list) else []), "KH-Punkte werden beim Herauszoomen kleiner")
        info = A.evaluate(f"""() => {{ const s={J}; const e=s.state.einsaetze[0]; const fz=Object.values(s.state.fahrzeuge);
            const rtw=fz.find(f=>f.rmTyp==='RTW-C'&&f.phase==='frei'); const nah=fz.find(f=>f.rmTyp==='NAH'&&f.phase==='frei'&&!s.flugHindernis(f));
            return [e.id, rtw.id, nah && nah.id, e.adresse]; }}""")
        A.evaluate("([e,a]) => window.__lw.sim.call('aktualisiere', e, {adresse:{lat:a.lat+0.03, lon:a.lon+0.02, label:'Testpunkt'}})", [info[0], info[3]])
        A.evaluate(f"([e,r,n]) => {J}.call('alarmiere', e, [r,n].filter(Boolean))", info[:3])
        A.evaluate(f"() => {{ {J}.call('setTempo', 10); {J}.call('start'); }}"); A.wait_for_timeout(3000)
        for i in range(30):
            if A.evaluate(f"(id) => {J}.state.fahrzeuge[id].phase", info[1]) == "anfahrt" and (not info[2] or A.evaluate(f"(id) => {J}.state.fahrzeuge[id].phase", info[2]) == "anfahrt"): break
            A.wait_for_timeout(1000)
        st = A.evaluate(f"(id) => {{ const f={J}.state.fahrzeuge[id]; return [f.phase, f.lon, f.lat]; }}", info[1])
        print("   RTW:", st)
        A.evaluate(f"() => {J}.call('pause')"); A.wait_for_timeout(300)
        A.evaluate(f"([lon,lat]) => {M}.jumpTo({{center:[lon,lat], zoom:13}})", st[1:]); A.wait_for_timeout(1200)
        pt = A.evaluate(f"(id) => {{ const f={J}.state.fahrzeuge[id]; const p={M}.project([f.lon,f.lat]); const r={M}.getContainer().getBoundingClientRect(); return [p.x+r.left, p.y+r.top]; }}", info[1])
        A.mouse.click(pt[0], pt[1]); A.wait_for_timeout(800)
        pop = A.locator(".fz-popup")
        check(pop.count()==1, "Klick auf Fahrzeug: Popup")
        if pop.count(): print("   Popup:", pop.inner_text().replace("\n"," | ")[:200])
        n = A.evaluate(f"() => ((({M}.getSource('lw-fz-sel').serialize().data)||{{}}).features||[]).length")
        print("   dbg:", A.evaluate(f"(id) => {{ const f={J}.state.fahrzeuge[id]; return [f.phase, !!f.fahrt, f.fahrt && f.fahrt.coords.length]; }}", info[1]), A.evaluate(f"() => JSON.stringify({M}.getSource('lw-fz-sel').serialize()).slice(0,200)"))
        check(n == 2, f"Route des Fahrzeugs gezeichnet ({n})")
        check(A.locator(".lw-panel[data-panel=einsatz] .mask").count()>0, "Auftrag (Einsatz) geöffnet")
        A.screenshot(path=f"{S}/shots7/klick.png", clip={"x":340,"y":44,"width":750,"height":900})
        # Doppelklick: Kamera folgt
        pt = A.evaluate(f"(id) => {{ const f={J}.state.fahrzeuge[id]; const p={M}.project([f.lon,f.lat]); const r={M}.getContainer().getBoundingClientRect(); return [p.x+r.left, p.y+r.top]; }}", info[1])
        z0 = A.evaluate(f"() => {M}.getZoom()")
        A.mouse.dblclick(pt[0], pt[1]); A.wait_for_timeout(500)
        check(A.locator(".fz-folgt:not([hidden])").count()==1, "Doppelklick: „Kamera folgt“")
        A.evaluate(f"() => {J}.call('start')"); A.wait_for_timeout(4000)
        d = A.evaluate(f"(id) => {{ const f={J}.state.fahrzeuge[id]; const c={M}.getCenter(); return [Math.hypot((c.lng-f.lon)*74000,(c.lat-f.lat)*111000), {M}.getZoom(), {M}.getPitch()]; }}", info[1])
        print("   Abstand Kamera–Fahrzeug (m), Zoom, Neigung:", d)
        check(d[0] < 150 and d[1] > 16, "Kamera folgt dem Fahrzeug von oben (2D)")
        A.screenshot(path=f"{S}/shots7/folgt2d.png", clip={"x":340,"y":44,"width":750,"height":900})
        A.mouse.move(450, 800); A.mouse.down(); A.mouse.move(520, 840, steps=6); A.mouse.up(); A.wait_for_timeout(300)
        check(A.locator(".fz-folgt:not([hidden])").count()==0, "Verschieben beendet das Folgen")
        # 3D: Hubschrauber
        if info[2]:
            A.click("[data-dim='3d']"); A.wait_for_timeout(1500)
            for i in range(20):
                h = A.evaluate(f"(id) => {{ const f={J}.state.fahrzeuge[id]; return [f.phase, f.fahrt ? 1 : 0]; }}", info[2])
                if h[0] == "anfahrt": break
                A.wait_for_timeout(1000)
            A.wait_for_timeout(2500)
            A.evaluate(f"(id) => window.__lwFokusTest = id", info[2])
            # Doppelklick über die Funktion (Modell/Punkt kann bei schnellem Flug wandern)
            A.evaluate(f"""(id) => {{ const f={J}.state.fahrzeuge[id]; const p={M}.project([f.lon,f.lat]); const r={M}.getContainer().getBoundingClientRect();
                window.__klick=[p.x+r.left,p.y+r.top]; }}""", info[2])
            A.evaluate(f"(id) => {M}.jumpTo({{center:[{J}.state.fahrzeuge[id].lon, {J}.state.fahrzeuge[id].lat], zoom: 12}})", info[2]); A.wait_for_timeout(800)
            pt = A.evaluate(f"(id) => {{ const f={J}.state.fahrzeuge[id]; const p={M}.project([f.lon,f.lat]); const r={M}.getContainer().getBoundingClientRect(); return [p.x+r.left, p.y+r.top]; }}", info[2])
            A.evaluate(f"() => {J}.call('pause')")
            print("   Treffer am Punkt:", A.evaluate(f"([x,y]) => {{ const r={M}.getContainer().getBoundingClientRect(); return {M}.queryRenderedFeatures([x-r.left,y-r.top],{{layers:['lw-vehicles']}}).map(f=>f.properties.name); }}", pt), A.evaluate(f"(id) => {J}.state.fahrzeuge[id].funkrufname", info[2]))
            A.mouse.dblclick(pt[0], pt[1]); A.wait_for_timeout(1600)
            chip = A.locator(".fz-folgt:not([hidden])")
            print("   Chip:", chip.inner_text() if chip.count() else "-")
            A.evaluate(f"() => {J}.call('start')"); A.wait_for_timeout(3500); A.evaluate(f"() => {J}.call('pause')"); A.wait_for_timeout(600)
            d = A.evaluate(f"(id) => {{ const f={J}.state.fahrzeuge[id]; const c={M}.getCenter(); return [Math.hypot((c.lng-f.lon)*74000,(c.lat-f.lat)*111000), {M}.getZoom(), {M}.getPitch(), f.phase]; }}", info[2])
            print("   3D Heli:", d)
            check(chip.count()==1 and d[0] < 400 and d[2] > 50, "3D: Kamera folgt dem Hubschrauber schräg von oben")
            A.add_style_tag(content=".fz-popup{display:none!important}")
            A.screenshot(path=f"{S}/shots7/folgt3d_heli.png", clip={"x":340,"y":44,"width":750,"height":900})
            # rauszoomen: Modell bleibt sichtbar (größer) statt Punkt
            A.evaluate(f"() => {M}.jumpTo({{zoom:13.5}})"); A.wait_for_timeout(1000)
            A.screenshot(path=f"{S}/shots7/heli_135.png", clip={"x":340,"y":44,"width":750,"height":900})
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
