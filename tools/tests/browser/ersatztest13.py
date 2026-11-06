import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8781", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
ZUST = """() => { const sim=window.__lw.sim; const f=Object.values(sim.state.fahrzeuge); const n=f.find(x=>x.funkrufname==='99/902'); const h=f.find(x=>x.funkrufname==='99/002'); return {nef: n && {aus:n.ausserDienst, status:n.status, schicht:n.schicht, ers:n.ersatzFuer, crew:n.besetzung.map(p=>p.name+'/'+p.quali)}, nah: h && {status:h.status, hind: sim.flugHindernis(h), crew:h.besetzung.map(p=>p.name+'/'+p.quali)}, anzahl: f.filter(x=>x.ersatzFuer).length}; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} })()")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.goto("http://localhost:8781/?debug"); A.wait_for_timeout(2000)
        # Tag 12:00, gutes Wetter
        A.evaluate("() => { const sim=window.__lw.sim; const d=new Date(sim.state.zeit); d.setHours(12,0,0,0); sim.state.zeit=d.getTime(); sim.settings.wetterAktiv=true; sim.setWetter('klar'); sim.dienstTick(sim.state.zeit, true); }")
        z = A.evaluate(ZUST); print("   ", z)
        check(z["anzahl"] >= 7, "Ersatz-NEFs in der Simulation")
        check(z["nef"]["aus"] and z["nef"]["status"] == "abgemeldet", "Tag, Flugwetter: NEF abgemeldet")
        A.evaluate("() => { const sim=window.__lw.sim; sim.setWetter('nebel'); sim.dienstTick(sim.state.zeit+30000); }")
        z = A.evaluate(ZUST); print("   ", z)
        check(z["nah"]["hind"] is not None, "Nebel: Hubschrauber kann nicht fliegen")
        check(not z["nef"]["aus"] and z["nef"]["status"] != "abgemeldet", "Nebel: NEF angemeldet")
        nahP = [c for c in z["nah"]["crew"] if not c.endswith("/Pilot")]
        check(sorted(nahP) == sorted(z["nef"]["crew"]), "gleiche Besatzung (ohne Pilot)")
        A.evaluate("() => { const sim=window.__lw.sim; sim.setWetter('klar'); sim.dienstTick(sim.state.zeit+60000); }")
        z = A.evaluate(ZUST); print("   ", z)
        check(z["nef"]["aus"], "wieder Flugwetter: NEF abgemeldet")
        html = A.evaluate("() => document.body.innerHTML.includes('nur bei Flugverbot')")
        print("    Text sichtbar:", html)
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
