# Testmodus für Piloten: ohne Leitstelle, Einsätze per Testmenü
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8899", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1500, "height": 950}); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8899/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        A.evaluate("() => window.__lw.startseite && window.__lw.startseite.zeigen()"); A.wait_for_timeout(800)
        A.locator('[data-act="pilot"]').first.click(); A.wait_for_timeout(500)
        check(A.locator(".plt-testmodus").count() == 1, "Beitritt: Hinweis Testmodus")
        A.locator(".dlg-foot button", has_text="Testmodus").click(); A.wait_for_timeout(2500)
        check(A.locator(".plt").count() == 1 and A.evaluate("() => window.__lw.sim.pilotTest"), "Testmodus: Piloten-Interface offen, ohne Spielcode")
        btn = A.locator(".plt-wahl-b", has_text="Christophorus 2")
        check(btn.count() > 0, "Hubschrauberwahl erscheint")
        btn.first.click(); A.wait_for_timeout(800)
        if A.locator(".dlg").count(): A.keyboard.press("Escape"); A.wait_for_timeout(300)
        r = A.evaluate("() => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge).find(x => x.pilot); return { fz: f && f.funkrufname, fg: s.funkgruppe().id, gen: s.state.einsaetze.length }; }")
        print("   ", r)
        check(r["fz"] == "99/002" and r["fg"] == "NÖ-03", f"Hubschrauber übernommen, Gebiet = Funkgruppe des Stützpunkts ({r['fg']})")
        check(A.locator('[data-act="test"]:not([hidden])').count() == 1, "Knopf Testmenü sichtbar")
        A.locator('[data-act="test"]').click(); A.wait_for_timeout(400)
        A.locator(".plt-testmenue .plt-wahl-k").first.click(); A.wait_for_function("() => Object.values(window.__lw.sim.state.fahrzeuge).some(x => x.pilot && x.einsatzId)", timeout=30000); A.wait_for_timeout(500)
        r = A.evaluate("() => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge).find(x => x.pilot); const e = f.einsatzId && s.einsatz(f.einsatzId); return { st: f.status, e: !!e, adr: e && e.adresse && e.adresse.label, code: e && e.code, anruf: e && e.anruf && e.anruf.status, fz: e ? e.fahrzeuge.map(x => s.state.fahrzeuge[x].rmTyp) : [] }; }")
        print("   ", r)
        check(r["e"] and r["st"] in ("alarmWache", "alarmFunk") and r["adr"] and r["code"], "Einsatz senden: Hubschrauber alarmiert, Adresse und Code gesetzt")
        check(r["anruf"] in (None, "beendet"), "kein klingelnder Anruf")
        A.screenshot(path=f"{S}/ptm_1.png")
        m = A.evaluate("""() => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge).find(x => x.pilot); const e = s.einsatz(f.einsatzId); const r = window.__pilot.hpgMissionFuer(f, e); return JSON.stringify(r); }""")
        check("set_ui" not in m and "footer" not in m, "H145-Tablet: keine Fußzeilen-Befehle mehr")
        # 2 min warten: keine Einsätze von selbst
        n0 = A.evaluate("() => window.__lw.sim.state.einsaetze.length")
        A.evaluate("async () => { const s = window.__lw.sim; for (let i = 0; i < 40; i++) { s.state.zeit += 60000; s.tick && s.tick(); await new Promise(r => setTimeout(r, 15)); } }")
        n1 = A.evaluate("() => window.__lw.sim.state.einsaetze.filter(e => !e.gsKind).length")
        check(n1 == n0, f"keine Einsätze von selbst ({n0} → {n1})")
        # frei melden, Großeinsatz senden
        r = A.evaluate("""async () => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge).find(x => x.pilot); s.freigeben(f); s.setStatus(f, 'freiFunk');
            let err = null, h = null; try { h = await s.pilotTestEinsatz(f.id, 'gross'); } catch (e) { err = String(e.message || e); }
            const e = f.einsatzId && s.einsatz(f.einsatzId); return { err, h, gs: !!(e && e.gs), br: !!(e && e.gs && e.gs.br), ziel: e && e.gs && e.gs.ziel[f.id], st: f.status }; }""")
        print("   ", r)
        check(r["gs"] and r["br"] and r["ziel"] == "br", "Großeinsatz senden: BR festgelegt, Hubschrauber in den BR")
        # Verlassen: Testmodus aus
        A.locator('[data-act="verlassen"]').click(); A.wait_for_timeout(1200)
        check(not A.evaluate("() => window.__lw.sim.pilotTest") and A.locator(".plt").count() == 0, "Verlassen beendet den Testmodus")
        check(not [l for l in logs if l.startswith("PAGEERROR")], f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER gesamt:", fails)
