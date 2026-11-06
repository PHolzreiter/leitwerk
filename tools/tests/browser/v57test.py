# v0.57: Startseite (bei jedem Start, Konfiguration, holografische Karte, Bereitschafts-Check, Multiplayer-Schalter, Thema)
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8844", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for thema in ["dunkel", "hell"]:
            A = b.new_page(viewport={"width": 1600, "height": 950})
            A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
            A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: '%s', einfuehrung: true}))" % thema)
            A.goto("http://localhost:8844/?debug&start"); A.wait_for_timeout(4000)
            check(A.locator(".st").count() == 1, f"[{thema}] Startseite erscheint beim Start")
            check(A.evaluate("() => document.querySelector('.st').classList.contains('%s')" % thema), f"[{thema}] Thema wird übernommen")
            n = A.evaluate("() => document.querySelectorAll('.st-holo [data-fg]').length")
            check(n >= 3, f"[{thema}] Karte zeigt Funkgruppen ({n})")
            an = A.evaluate("() => [...document.querySelectorAll('.st-holo .st-fg.an')].map(x => x.dataset.fg)")
            check(len(an) == 1, f"[{thema}] genau eine Funkgruppe leuchtet: {an}")
            zahlen = A.evaluate("() => [...document.querySelectorAll('.st-kachel b')].map(x => x.textContent)")
            A.wait_for_timeout(1500)
            zahlen = A.evaluate("() => [...document.querySelectorAll('.st-kachel b')].map(x => x.textContent)")
            check(len(zahlen) == 6 and all(z.strip() not in ("", "0") for z in zahlen[:3]), f"[{thema}] Kacheln mit echten Zahlen: {zahlen}")
            pill = A.evaluate("() => document.querySelector('.st-check .st-pill')?.textContent")
            check(bool(pill), f"[{thema}] Bereitschafts-Check zeigt Ergebnis: {pill}")
            A.screenshot(path=f"{S}/v57_{thema}.png")
            if thema == "dunkel":
                # Aufkommen umstellen -> Einstellung
                A.click('.st-seg[data-seg="aufkommen"] button[data-v="stressig"]'); A.wait_for_timeout(300)
                check(A.evaluate("() => window.__lw.store.settings.aufkommenStufe") == "stressig", "Aufkommen 'Stressig' gespeichert")
                # Check-Details
                A.click(".st-check-kopf"); A.wait_for_timeout(500)
                check(A.locator(".st-check-z").count() >= 5, "Check-Popup mit Aufschlüsselung")
                A.screenshot(path=f"{S}/v57_check.png")
                A.keyboard.press("Escape"); A.wait_for_timeout(300)
                A.evaluate("() => document.querySelectorAll('.dialog-backdrop, .dlg-backdrop').forEach(x => x.remove())")
                # Multiplayer-Schalter
                A.click('.st-seg[data-seg="modus"] button[data-v="multi"]'); A.wait_for_timeout(700)
                check(A.evaluate("() => !document.querySelector('.st-multi').hidden"), "Multiplayer-Menü klappt auf")
                check(A.locator(".st-check-punkte").count() == 1, "Check kompakt")
                A.screenshot(path=f"{S}/v57_multi.png")
                A.click('.st-seg[data-seg="modus"] button[data-v="solo"]'); A.wait_for_timeout(400)
                # Wunschzeit + Start
                A.click('.st-seg[data-seg="zeit"] button[data-v="fest"]'); A.wait_for_timeout(200)
                A.fill(".st-zeit-in", "2026-12-24T03:15"); A.dispatch_event(".st-zeit-in", "change"); A.wait_for_timeout(200)
                A.click(".st-start"); A.wait_for_timeout(1200)
                check(A.locator(".st").count() == 0, "Startseite schließt nach Start")
                st = A.evaluate("() => { const s = window.__lw.sim.state; const d = new Date(s.zeit ?? s.time ?? 0); return { h: d.getHours(), m: d.getMinutes(), tag: d.getDate(), lobby: !!s.lobby }; }")
                check(st["tag"] == 24 and st["h"] == 3, f"Simulation startet zur Wunschzeit: {st}")
                # Zurück zur Startseite über das Logo
                A.click("#steuerleiste .brand"); A.wait_for_timeout(1200)
                check(A.locator('[data-act="zurueck"]').count() == 1, "Logo öffnet Startseite mit 'Zurück zur Simulation'")
                A.click('[data-act="zurueck"]'); A.wait_for_timeout(800)
                check(A.locator(".st").count() == 0, "Zurück schließt die Startseite")
                A.screenshot(path=f"{S}/v57_kopf.png", clip={"x": 0, "y": 0, "width": 800, "height": 60})
            A.close()
        # Ohne ?start (automatische Tests) keine Startseite
        B = b.new_page(); B.goto("http://localhost:8844/?debug"); B.wait_for_timeout(3000)
        check(B.locator(".st").count() == 0, "Ohne ?start keine Startseite in Tests")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
