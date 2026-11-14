import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8796", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails=0; logs=[]
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails+=1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8796/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.khGrundAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; s.state.khBelegung = {}; }")
        def setzeZeit(iso):
            A.evaluate("(iso) => { window.__lw.sim.state.zeit = new Date(iso).getTime(); }", iso)
        def vor(lat, lon, bu, rot=False):
            return A.evaluate("([lat, lon, bu, rot]) => window.__lw.sim.khFuer({lat, lon}, bu, rot).slice(0, 5).map(v => ({ n: v.h.kurzname, e: v.eignung, zu: v.zu, km: Math.round(v.km) }))", [lat, lon, bu, rot])
        # PVZ: unter der Woche offen, am Wochenende geht der Hausarztfall ins KH
        STP = (48.2047, 15.6256)
        pvz = A.evaluate("() => window.__lw.store.list('hospitals').filter(h => (h.einrichtungen||[]).includes('amb_pvz')).map(h => h.kurzname)")
        print("    PVZ:", pvz)
        check(len(pvz) >= 4, "PVZ im Spiel")
        setzeZeit("2026-10-20T10:00:00")
        r = vor(48.2330, 15.6500, "bu_hausaerztlich"); print("    Hausarztfall Di 10 Uhr (neben PVZ Nord):", r)
        check(r and "PVZ" in r[0]["n"] and not r[0]["zu"], "Hausarztfall unter der Woche → PVZ, wenn es am nächsten ist")
        r = vor(*STP, "bu_hausaerztlich"); print("    Hausarztfall Di 10 Uhr (Zentrum):", r)
        check(r and r[0]["n"] == "UK St. Pölten", "Krankenhaus näher → Krankenhaus")
        setzeZeit("2026-10-18T10:00:00")
        r = vor(*STP, "bu_hausaerztlich"); print("    Hausarztfall So:", r)
        best = A.evaluate("() => window.__lw.sim.naechstesKh({lat: 48.2047, lon: 15.6256}, 'bu_hausaerztlich', false)?.kurzname")
        check(best and "PVZ" not in best, f"am Sonntag ins Krankenhaus ({best})")
        setzeZeit("2026-10-20T10:00:00")
        r = vor(*STP, "bu_stemi", True)
        check(r and all("PVZ" not in x["n"] for x in r), "STEMI nie ins PVZ")
        r = vor(*STP, "bu_exsikkose_synkope_az_verschlechterung")
        check(r and all("PVZ" not in x["n"] for x in r), "AZ-Verschlechterung nicht ins PVZ")
        # Fenster Akutversorgung
        A.evaluate("() => window.__lw.zeige('akutversorgung')"); A.wait_for_timeout(1500)
        n = A.locator(".akv-z[data-kh]").count()
        check(n >= 8, f"Akutversorgung zeigt Häuser ({n})")
        stp = A.locator(".akv-z[data-kh='kh001']")
        check(stp.count() == 1 and stp.locator(".akv-s").count() >= 8, "St. Pölten mit vielen Zeichen")
        sri = A.evaluate("() => { const z = document.querySelector(\".akv-z[data-kh='kh001']\"); return z ? z.children[2].querySelectorAll('.akv-s').length : 0; }")
        check(sri == 2, f"St. Pölten: zwei SRI-Zeichen ({sri})")
        A.evaluate("() => { const s = window.__lw.sim; s.state.khBelegung = { kh001: { herzkatheter: [{ bis: s.state.zeit + 3600000, einsatz: '' }, { bis: s.state.zeit + 3600000, einsatz: '' }] } }; s.setTempo(1); }")
        A.locator(".khs-umkreis").select_option("0"); A.wait_for_timeout(600)
        voll = A.evaluate("() => { const z = document.querySelector(\".akv-z[data-kh='kh001']\"); return z ? z.children[3].querySelector('.akv-f').className : ''; }")
        check("voll" in voll, f"PCI St. Pölten belegt → rot ({voll})")
        A.screenshot(path=f"{S}/akv.png")
        A.locator(".khs-ansicht [data-ansicht='plaetze']").click(); A.wait_for_timeout(400)
        check(A.locator(".khs-z[data-kh]").count() >= 8, "Umschalten auf Plätze")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:10]))
