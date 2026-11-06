# v0.58: echtes Wetter (Open-Meteo, hier nachgestellt), Wetter-Schalter, Update-Knopf + Anzeige, Check-Fenster, WIP-Schild
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8848", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
t0 = int(time.time() // 3600 * 3600) - 2 * 86400
H = {"time": [], "weather_code": [], "temperature_2m": [], "cloud_cover": [], "wind_speed_10m": [], "wind_direction_10m": []}
for i in range(24 * 9):
    H["time"].append(t0 + i * 3600); H["weather_code"].append(63); H["temperature_2m"].append(4.0 + (i % 3)); H["cloud_cover"].append(100); H["wind_speed_10m"].append(31); H["wind_direction_10m"].append(300)
anfragen = []
def antwort(r):
    anfragen.append(r.request.url)
    r.fulfill(status=200, content_type="application/json", body=json.dumps({"hourly": H}))
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_page(viewport={"width": 1600, "height": 950})
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.route("**/api.open-meteo.com/**", antwort)
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8848/?debug&start"); A.wait_for_timeout(3500)
        check(A.locator('.st-seg[data-seg="wetter"] button').count() == 4, "Wetter als Schiebeschalter mit 4 Stufen")
        A.click('.st-seg[data-seg="wetter"] button[data-v="echt"]'); A.wait_for_timeout(300)
        st = A.evaluate("() => ({ e: window.__lw.store.settings.wetterEcht, w: window.__lw.store.settings.wetterWechsel })")
        check(st["e"] is True and st["w"] == 50, f"Realistisch = echtes Wetter eingestellt {st}")
        A.click('.st-seg[data-seg="wetter"] button[data-v="normal"]'); A.wait_for_timeout(200)
        check(A.evaluate("() => window.__lw.store.settings.wetterEcht") is False, "Normal schaltet echtes Wetter ab")
        A.click('.st-seg[data-seg="wetter"] button[data-v="echt"]'); A.wait_for_timeout(200)
        check("Echtes Wetter" in A.inner_text(".st-wetter-info") and "Internet" not in A.inner_text(".st-wetter-info"), "Hinweis zum echten Wetter (ohne Internet-Text)")
        A.click(".st-start"); A.wait_for_timeout(2500)
        check(len(anfragen) >= 1 and "latitude=" in anfragen[0], f"Wetterdienst abgefragt ({len(anfragen)})")
        w = A.evaluate("() => { const s = window.__lw.sim; return { lage: s.state.wetter.lage, temp: s.temperatur(), n: (s.state.wetterEcht||[]).length, wind: s.state.wetter.wind }; }")
        check(w["lage"] == "regen" and 3.9 <= w["temp"] <= 6.1 and w["n"] > 100, f"Spiel nutzt das echte Wetter: {w}")
        prog = A.evaluate("() => window.__lw.sim.wetterPrognose(6).map(x => x.lage)")
        check(all(l == "regen" for l in prog), f"Prognose aus echten Werten: {prog}")
        # Wunschzeit weit in der Zukunft: Hinweis, simuliert
        A.click("#steuerleiste .brand"); A.wait_for_timeout(1200)
        A.click('.st-seg[data-seg="zeit"] button[data-v="fest"]'); A.wait_for_timeout(200)
        A.fill(".st-zeit-in", "2030-06-01T12:00"); A.dispatch_event(".st-zeit-in", "change"); A.wait_for_timeout(300)
        check("noch kein echtes Wetter" in A.inner_text(".st-wetter-info"), "Zukunft > 15 Tage: Hinweis 'simuliert'")
        # Check-Fenster: normal groß
        A.click(".st-check-kopf"); A.wait_for_timeout(600)
        h = A.evaluate("() => document.querySelector('.st-check-pop .st-pill').getBoundingClientRect().height")
        check(h < 60, f"Check-Fenster: Zusammenfassung normal groß ({h:.0f}px)")
        check(A.locator(".st-check-z").count() >= 5, "Check-Fenster zeigt alle Punkte")
        A.click(".dlg-foot .btn.primary"); A.wait_for_timeout(400)
        # WIP-Schild
        check(A.locator(".st-titel .st-wip").count() == 1, "Work-in-Progress-Schild am großen Logo")
        # Update
        check(A.locator(".st-update").is_hidden(), "kein Update-Knopf ohne Update")
        A.evaluate("() => window.__lw.update.testen('0.99.0', 3000)"); A.wait_for_timeout(500)
        check(A.locator(".st-update").is_visible(), "Update-Knopf erscheint, wenn eine neue Version da ist")
        check(A.locator("#steuerleiste .sl-update").is_visible(), "Update-Knopf auch in der Kopfzeile")
        A.click(".st-update"); A.wait_for_timeout(1700)
        pz = int(A.inner_text(".lw-upd-prozent b"))
        check(0 < pz < 100, f"Fortschritt läuft ({pz} %)")
        A.wait_for_function("() => document.querySelector('.lw-upd-prozent b')?.textContent === '100'", timeout=15000); A.wait_for_timeout(300)
        check(A.inner_text(".lw-upd-prozent b") == "100" and "startet neu" in A.inner_text(".lw-upd-detail"), "Update fertig: Neustart")
        # Fehlerfall
        A2 = b.new_page(viewport={"width": 1400, "height": 900})
        A2.goto("http://localhost:8848/?debug&start"); A2.wait_for_timeout(3000)
        A2.evaluate("() => window.__lw.update.testen('0.99.0', 2000, true)"); A2.wait_for_timeout(400)
        A2.click(".st-update"); A2.wait_for_timeout(1800)
        check("fehlgeschlagen" in A2.inner_text(".lw-upd-detail") and A2.locator(".lw-upd-knoepfe").is_visible(), "Fehler: Meldung und 'Nochmal versuchen'")
        A2.click('.lw-upd-knopf[data-a="zu"]'); A2.wait_for_timeout(500)
        check(A2.locator(".lw-upd").count() == 0 and A2.locator(".st-update").is_visible(), "Schließen: Update-Knopf wieder da")
        # Wetterdienst nicht erreichbar -> simuliert + Funkmeldung
        B = b.new_page()
        B.route("**/api.open-meteo.com/**", lambda r: r.abort())
        B.goto("http://localhost:8848/?debug"); B.wait_for_timeout(3000)
        B.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.wetterEcht = true; st.wetterWechsel = 50; window.__lw.store.setSettings(st); }")
        B.evaluate("() => window.__lw.sim.call('neuesSpiel', Date.now())"); B.wait_for_timeout(2500)
        f = B.evaluate("() => ({ stand: window.__lw.sim.state.wetterEchtStand, funk: window.__lw.sim.state.funk.slice(0, 5).map(x => x.text) })")
        check(f["stand"] and f["stand"]["ok"] is False and any("nicht verfügbar" in t for t in f["funk"]), f"ohne Internet: simuliert + Meldung {f['stand']}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
