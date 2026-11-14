# v0.61: Kachelleiste nur bei Platzmangel schmäler, „Realistisch“ ohne Internet ausgegraut, Einstellungen/Dialoge im Startseiten-Stil, Fußzeile
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8857", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
OK = lambda r: r.fulfill(status=200, content_type="application/json", body='{"current":{"temperature_2m":5}}')
INIT = "localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # großer Bildschirm: Lobby passt → Leiste bleibt breit
        A = b.new_page(viewport={"width": 2000, "height": 1300}); A.on("pageerror", lambda e: logs.append(str(e)))
        A.route("**/api.open-meteo.com/**", OK); A.add_init_script(INIT)
        A.goto("http://localhost:8857/?debug&start"); A.wait_for_timeout(3500)
        r0 = A.evaluate("() => Math.round([...document.querySelectorAll('.st-kachel')].pop().getBoundingClientRect().right)")
        A.click('.st-seg[data-seg="modus"] button[data-v="multi"]'); A.wait_for_timeout(1200)
        r1 = A.evaluate("() => Math.round([...document.querySelectorAll('.st-kachel')].pop().getBoundingClientRect().right)")
        check(r0 == r1, f"großer Bildschirm: Kachelleiste bleibt breit ({r0} → {r1})")
        check(A.evaluate("() => document.querySelector('.st').scrollHeight <= document.querySelector('.st').clientHeight + 1"), "kein Bildlauf")
        f = A.inner_text(".st-fuss")
        check("v" in f and "Simulation" in f and "Privates Projekt" not in f, f"Fußzeile: {f!r}")
        A.close()
        # kleiner Bildschirm: Lobby braucht Platz → schmäler
        A = b.new_page(viewport={"width": 1600, "height": 950}); A.route("**/api.open-meteo.com/**", OK); A.add_init_script(INIT)
        A.goto("http://localhost:8857/?debug&start"); A.wait_for_timeout(3500)
        r0 = A.evaluate("() => Math.round([...document.querySelectorAll('.st-kachel')].pop().getBoundingClientRect().right)")
        A.click('.st-seg[data-seg="modus"] button[data-v="multi"]'); A.wait_for_timeout(1200)
        r1 = A.evaluate("() => Math.round([...document.querySelectorAll('.st-kachel')].pop().getBoundingClientRect().right)")
        check(r1 < r0 - 300, f"kleiner Bildschirm: Kachelleiste schmäler ({r0} → {r1})")
        check(not A.locator('.st-seg[data-seg="wetter"] button[data-v="echt"]').is_disabled(), "mit Internet: Realistisch wählbar")
        # Einstellungen und Dialog im neuen Stil
        A.click('.st-seg[data-seg="modus"] button[data-v="solo"]'); A.wait_for_timeout(300)
        A.click('.st [data-act="einstellungen"]'); A.wait_for_timeout(800)
        st = A.evaluate("() => { const g = document.querySelector('.gross.es'); const c = getComputedStyle(g); const a = getComputedStyle(document.querySelector('.es-punkt.aktiv')); return [c.borderTopLeftRadius, c.backgroundImage.includes('gradient'), a.backgroundImage.includes('gradient')]; }")
        check(st[0] == "22px" and st[1] and st[2], f"Einstellungen im Startseiten-Stil {st}")
        sel = A.evaluate("() => { const s = document.querySelector('.es .set-sec select'); const c = getComputedStyle(s); return [c.appearance, c.borderTopLeftRadius, c.backgroundImage.includes('svg')]; }")
        check(sel[0] == "none" and sel[1] == "11px" and sel[2], f"Auswahllisten wie auf der Startseite {sel}")
        A.keyboard.press("Escape"); A.wait_for_timeout(400)
        A.click(".st-check-kopf"); A.wait_for_timeout(600)
        d = A.evaluate("() => { const c = getComputedStyle(document.querySelector('.dlg')); const z = getComputedStyle(document.querySelector('.dlg .st-check-z')); return [c.borderTopLeftRadius, z.borderTopLeftRadius]; }")
        check(d == ["22px", "14px"], f"Bereitschafts-Check im neuen Stil {d}")
        A.close()
        # ohne Internet: ausgegraut, gewählt → zurück auf Normal
        A = b.new_page(viewport={"width": 1600, "height": 950}); A.add_init_script(INIT)
        A.route("**/api.open-meteo.com/**", lambda r: r.abort())
        A.goto("http://localhost:8857/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.wetterEcht = true; st.wetterWechsel = 50; window.__lw.store.setSettings(st); window.__lw.startseite.zeigen(); }")
        A.wait_for_timeout(1500)
        check(A.locator('.st-seg[data-seg="wetter"] button[data-v="echt"]').is_disabled(), "ohne Internet: Realistisch ausgegraut")
        check(A.evaluate("() => window.__lw.store.settings.wetterEcht") is False and A.locator('.st-seg[data-seg="wetter"] button.an').inner_text() == "Normal", "war gewählt → jetzt Normal")
        check("Internet" not in A.inner_text(".st-wetter-info"), "kein Internet-Hinweistext")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
