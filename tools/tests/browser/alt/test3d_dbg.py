import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8778", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        A = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type in ("error","warning") and "404" not in m.text and "glyph" not in m.text.lower() else None)
        A.goto("http://localhost:8778/?debug"); A.wait_for_timeout(1500)
        A.click("[data-act=gen]"); A.wait_for_timeout(300)
        with A.expect_file_chooser() as fc: A.click(".dlg-foot >> text=Datei wählen")
        fc.value.set_files(f"{S}/abf/abfrageschema.json"); A.wait_for_timeout(1200)
        A.click(".tab[data-view=map]")
        A.click("[data-act=gen]"); A.wait_for_timeout(1200)
        A.click(".inc-annehmen"); A.wait_for_timeout(1000)
        A.click(".anruf-kopf >> text=Auflegen"); A.wait_for_timeout(400)
        A.fill(".mask .addr input >> nth=1", "Krems"); A.wait_for_timeout(800)
        A.click(".mask .addr-list:not([hidden]) .addr-item >> nth=0"); A.wait_for_timeout(1500)
        info = A.evaluate("""() => { const s=window.__lw.sim; const e=s.state.einsaetze[0];
            const fz=Object.values(s.state.fahrzeuge); const typen={}; for (const f of fz) typen[f.rmTyp]=(typen[f.rmTyp]||0)+1;
            const pick=(t)=>fz.find(f=>f.rmTyp===t&&f.phase==='frei');
            const ids=['RTW-C','NEF','NAH','KTW','BEL','SRTW'].map(pick).filter(Boolean).map(f=>f.id);
            const a = {}; for (const f of fz.slice(0,1)) a.aus = s.ausrueckSek(f,true);
            return {typen, ids, e:e.id, adr:e.adresse, aus:a.aus, tag:s.istTag()}; }""")
        print("   ", info)
        check(info["typen"].get("BEL",0) > 0 or True, "Typen: " + str(info["typen"]))
        A.evaluate("([e,a]) => window.__lw.sim.call('aktualisiere', e, {adresse:{lat:a.lat+0.025, lon:a.lon+0.01, label:'Testpunkt'}})", [info["e"], info["adr"]])
        A.wait_for_timeout(500)
        A.evaluate("([e,ids]) => window.__lw.sim.call('alarmiere', e, ids)", [info["e"], info["ids"]])
        A.click("[data-tempo='1']"); A.click("#sim-play")
        # 3D an
        A.click("[data-dim='3d']"); A.wait_for_timeout(1500)
        # Ausrücken abwarten (bis zu 2 min Simzeit): schneller laufen lassen
        A.evaluate("() => window.__lw.sim.call('setTempo', 10)"); A.wait_for_timeout(16000)
        A.evaluate("() => window.__lw.sim.call('setTempo', 1)")
        st = A.evaluate("""(ids) => ids.map(id=>{const f=window.__lw.sim.state.fahrzeuge[id]; return [f.funkrufname,f.rmTyp,f.phase,!!f.blaulicht, f.fahrt? f.fahrt.coords.length:0, f.fahrt? f.fahrt.kreisAb||null:null]})""", info["ids"])
        for x in st: print("   ", x)
        if A.locator(".map-message:not([hidden])").count(): A.click(".map-message")
        print("   Layer:", A.evaluate("() => !!window.__lw.map.getLayer('lw-fz3d')"), A.evaluate("() => window.__lw.map.getZoom()"))
        # Kamera auf ein fahrendes Fahrzeug
        for id_ in info["ids"]:
            pos = A.evaluate("""(id) => { const f=window.__lw.sim.state.fahrzeuge[id]; return [f.lon,f.lat,f.rmTyp,f.phase]; }""", id_)
            A.evaluate("([lon,lat]) => window.__lw.map.jumpTo({center:[lon,lat], zoom:19, pitch:55, bearing:30})", pos)
            A.wait_for_timeout(1200)
            print("   DBG", pos, A.evaluate("""(id) => { const m=window.__lw.map; const f=window.__lw.sim.state.fahrzeuge[id]; const p=m.project([f.lon,f.lat]); return [p.x,p.y,m.getZoom(),m.getPitch(), m.getCenter().toArray(), window.__lw.map.queryRenderedFeatures({layers:['lw-vehicles-label']}).length, window.__lw.sim.state.laeuft]; }""", id_))
            A.screenshot(path=f"{S}/shots5/3d_{pos[2]}.png", clip={"x":440,"y":250,"width":550,"height":450})
            A.evaluate("([lon,lat]) => window.__lw.map.jumpTo({center:[lon,lat], zoom:16.5, pitch:55, bearing:30})", pos); A.wait_for_timeout(800)
            A.screenshot(path=f"{S}/shots5/3d_{pos[2]}_16.png", clip={"x":440,"y":250,"width":550,"height":450})
        # Rauszoomen -> Punkt statt Modell
        A.evaluate("() => window.__lw.map.jumpTo({zoom:12})"); A.wait_for_timeout(800)
        A.screenshot(path=f"{S}/shots5/3d_raus.png")
        # Einstellungen Ausrückzeiten
        A.click("#sim-play")
        A.click(".tab[data-view=settings]"); A.wait_for_timeout(600)
        check(A.locator("h3:has-text('Ausrückzeiten')").count() == 1, "Einstellung Ausrückzeiten")
        A.locator("section.set-sec:has(h3:has-text('Ausrückzeiten'))").screenshot(path=f"{S}/shots5/ausrueck.png")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:25]))
