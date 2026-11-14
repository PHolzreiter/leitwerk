import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
U = "/root/.claude/uploads/6f627245-05f7-528c-b2dc-002fcbfffd22/"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8779", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.goto("http://localhost:8779/?debug"); A.wait_for_timeout(1500)
        A.click(".tab[data-view=data]"); A.wait_for_timeout(300)
        for f in ["60f04ee7-dienststellen_nnoe_stockerau-3.csv", "2fb5a3aa-fahrzeuge_nnoe_stockerau-3.csv"]:
            with A.expect_file_chooser() as fc: A.click("[data-act=import]")
            fc.value.set_files(U + f); A.wait_for_timeout(800)
            A.click(".dlg-foot >> text=Importieren"); A.wait_for_timeout(800)
        res = A.evaluate("""() => { const s=window.__lw.store; const k={}; for (const v of s.list('vehicles')) if (/^79|BEL|EL ÖBB|Christophorus 33/.test(v.funkrufname)) k[v.funkrufname]=v.kategorie+(v.aktiv?'':'(aus)'); return k; }""")
        print("   ", res)
        check(res.get("79/001","").startswith("SKTW") and res.get("79/901","").startswith("SNAW") and res.get("79/902","").startswith("BIT") and res.get("Christophorus 33","").startswith("ITH") and res.get("EL ÖBB Krems","").startswith("EL ÖBB"), "Typen aus der Liste erkannt")
        A.wait_for_timeout(1500)
        sim = A.evaluate("""() => { const t={}; for (const f of Object.values(window.__lw.sim.state.fahrzeuge)) t[f.rmTyp]=(t[f.rmTyp]||0)+1; const bel=Object.values(window.__lw.sim.state.fahrzeuge).find(f=>f.rmTyp==='BEL'); const bit=Object.values(window.__lw.sim.state.fahrzeuge).find(f=>f.rmTyp==='BIT'); return [t, bel&&bel.besetzung, bit&&bit.besetzung]; }""")
        print("   ", sim)
        check(sim[0].get("SNAW",0) >= 1 and sim[0].get("BEL",0) >= 1, "Neue Typen in der Simulation")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
