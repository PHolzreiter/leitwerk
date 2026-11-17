# Beta 64 (Paul 17.11.2026): Pilotenansicht neu – PC-Fenster (Liste links, Einsatz, Buchen Schritt für Schritt, Status),
# Handy (handy.html) und Tablet/EFB (efb.html) nach dem Entwurf. Kein „Nächster Schritt“ mehr.
# Handy und EFB laufen hier gegen das Spiel: /stand und /befehl werden an window.__pilot durchgereicht (wie handy.rs).
# Aufruf: python3 beta64test.py <arbeitsordner> <web-build> [handy.html] [efb.html]
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
HIER = os.path.dirname(os.path.abspath(__file__))
HANDY = sys.argv[3] if len(sys.argv) > 3 else os.path.join(HIER, "../../../src-tauri/src/handy.html")
EFB = sys.argv[4] if len(sys.argv) > 4 else os.path.join(HIER, "../../../src-tauri/src/efb.html")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8964", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

START = r"""async () => {
  const L = window.__lw; const s = L.sim;
  const warte = async (f, ms = 20000) => { const bis = Date.now() + ms; while (Date.now() < bis) { try { const x = f(); if (x) return x; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return null; };
  await warte(() => Object.keys(s.state.fahrzeuge).length);
  const ich = s.wer(); s.pilotTestStarten({ pid: ich.pid, name: ich.name || 'Pilot' });
  await warte(() => Object.keys(s.state.fahrzeuge).length); await new Promise((r) => setTimeout(r, 800));
  const d = new Date(s.state.zeit); d.setHours(10, 0, 0, 0); s.state.zeit = d.getTime(); s.setWetter('klar');
  const h = Object.values(s.state.fahrzeuge).find((f) => f.funkrufname === '99/002') || Object.values(s.state.fahrzeuge).find((f) => f.kategorie === 'NAH');
  await s.call('pilotUebernehmen', h.id); s.pilotTestGebiet(h.id);
  if (L.hauptmenue.offen()) L.hauptmenue.schliessen(false);
  await L.pilotUi.oeffnen(); window.__heli = h.id; return h.funkrufname; }"""
S = "window.__lw.sim"
EINSATZ = f"async () => {{ try {{ return await {S}.call('pilotTestEinsatz', window.__heli, 'normal'); }} catch (e) {{ return 'X ' + e.message; }} }}"
AMORT = f"async () => {{ const s = {S}; await s.call('pilotStatus', window.__heli, 'zumBO'); const f = s.state.fahrzeuge[window.__heli]; const e = s.einsatz(f.einsatzId); f.lat = e.adresse.lat; f.lon = e.adresse.lon; await s.call('pilotStatus', window.__heli, 'amBO'); }}"
FREI = f"async () => {{ const s = {S}; for (const k of ['amZO','freiFunk','freiWache']) try {{ await s.call('pilotStatus', window.__heli, k); }} catch (e) {{}} }}"
STATUS = f"() => {S}.state.fahrzeuge[window.__heli].status"

# Auswahl je Gerät (Handy und EFB haben dieselben data-Attribute, nur Reiter und Knöpfe heißen anders)
GERAET = {
    "Handy": {"datei": HANDY, "url": "http://geraet.test/?t=x", "groesse": (390, 844), "tab": '#tabs [data-tab="{}"]', "buchen": "#buchen-auf", "kh": "#kh-buchen", "senden": "#st-senden", "zur": "#k-zur"},
    "EFB": {"datei": EFB, "url": "http://geraet.test/efb", "groesse": (1024, 700), "tab": '#rail [data-tab="{}"]', "buchen": "#buchenAuf", "kh": "#khBuchen", "senden": "#stSenden", "zur": "#zurL"},
}

def geraet(b, g, name):
    G = GERAET[name]; befehle = []
    html = open(G["datei"], encoding="utf-8").read()
    ctx = b.new_context(viewport={"width": G["groesse"][0], "height": G["groesse"][1]})
    h = ctx.new_page(); h.on("pageerror", lambda e: logs.append(f"{name} PAGEERROR {e}"))
    def route(r):
        u = r.request.url
        if "mapsneu" in u or "/schrift/" in u: return r.fulfill(status=404, body="")
        if "/stand" in u:
            d = g.evaluate("() => JSON.parse(JSON.stringify(window.__pilot.handy()))")
            return r.fulfill(status=200, content_type="application/json", body=json.dumps(d))
        if "/befehl" in u:
            cmd = r.request.post_data or ""; befehle.append(cmd)
            if not cmd.startswith("funk_"): g.evaluate("(b) => window.__pilot.handyBefehl(b)", cmd)
            return r.fulfill(status=200, body="ok")
        return r.fulfill(status=200, content_type="text/html", body=html)
    h.route("**/*", route)
    h.goto(G["url"]); h.wait_for_timeout(1500)
    tab = lambda t: h.click(G["tab"].format(t))
    text = lambda: h.evaluate("() => document.body.innerText")
    check("Kein Alarm" in text() or "Kein Hubschrauber" in text(), f"{name}: Liste leer – „Kein Alarm“")
    print("    Einsatz", g.evaluate(EINSATZ)); g.wait_for_timeout(6500); h.wait_for_timeout(1500)
    check(h.locator("#alarm").is_visible(), f"{name}: Alarm über die ganze Fläche")
    h.click("#alarm .q"); h.wait_for_timeout(1500)
    check(g.evaluate(STATUS) == "alarmiert", f"{name}: 9 Quittieren sendet Status 9 ({g.evaluate(STATUS)})")
    check(h.locator(G["zur"]).count() == 1 and "LÄUFT" in text(), f"{name}: laufender Einsatz geht von selbst auf")
    check("Nächster Schritt" not in text(), f"{name}: kein „Nächster Schritt“")
    g.evaluate(AMORT); g.wait_for_timeout(800); h.wait_for_timeout(1500)
    check(h.locator(G["buchen"]).count() == 1, f"{name}: am Einsatzort „Zielort buchen“")
    h.click(G["buchen"]); h.wait_for_timeout(400)
    h.click("[data-seite] >> nth=0"); h.wait_for_timeout(400)
    h.click("[data-alter] >> nth=2"); h.wait_for_timeout(400)
    h.fill(".feld", "brust"); h.wait_for_timeout(1500)
    check(h.locator("[data-sym]").count() >= 1, f"{name}: Symptom-Dropdown beim Tippen")
    h.click("[data-sym] >> nth=0"); h.wait_for_timeout(1200)
    n_dr = h.locator("[data-dring]").count()
    alle_dr = g.evaluate("() => { const E = window.__pilot.handy().neu.ent; return E.drW.length; }")
    check(n_dr >= 1 and n_dr == alle_dr, f"{name}: nur passende Dringlichkeiten ({n_dr})")
    h.click("[data-dring] >> nth=0"); h.wait_for_timeout(1500)
    check(h.locator("[data-kh]").count() >= 1, f"{name}: Krankenhaus-Vorschläge")
    h.click("[data-kh] >> nth=0"); h.wait_for_timeout(300); h.click(G["kh"]); h.wait_for_timeout(1500)
    plan = g.evaluate("() => window.__pilot.daten().planT") or ""
    check("transportiert" in plan, f"{name}: Krankenhaus gebucht ({plan[:60]})")
    tab("status"); h.wait_for_timeout(500)
    check(h.locator('[data-st="7"]').count() == 0 and h.locator(".gesperrt").count() >= 1, f"{name}: Status 7 sichtbar, gesperrt")
    h.click('[data-st="4"]'); h.wait_for_timeout(200)
    check(g.evaluate(STATUS) == "amBO", f"{name}: Antippen allein sendet noch nicht")
    h.click(G["senden"]); h.wait_for_timeout(1200)
    check(g.evaluate(STATUS) == "zumZO", f"{name}: „Status 4 senden“ ({g.evaluate(STATUS)})")
    vor = g.evaluate("() => window.__pilot.handy().neu.gruppe")
    h.click('[data-gr="1"]'); h.wait_for_timeout(1300)
    nach = g.evaluate("() => window.__pilot.handy().neu.gruppe")
    check(vor != nach, f"{name}: Sprechgruppe weiter ({vor} → {nach})")
    h.click('[data-gr="-1"]'); h.wait_for_timeout(800)
    box = h.locator("#ptt").bounding_box()
    if box:
        h.mouse.move(box["x"] + 30, box["y"] + 20); h.mouse.down(); h.wait_for_timeout(1300); h.mouse.up(); h.wait_for_timeout(400)
    check("funk_an" in befehle and "funk_halt" in befehle and "funk_aus" in befehle, f"{name}: Sprechtaste (an, halten, aus)")
    g.evaluate(FREI); g.wait_for_timeout(800)
    tab("einsaetze"); h.wait_for_timeout(1500)
    if h.locator(G["zur"]).count(): h.click(G["zur"]); h.wait_for_timeout(800)
    check("BEENDET" in text(), f"{name}: vergangener Einsatz in der Liste")
    h.click("[data-e] >> nth=0"); h.wait_for_timeout(800)
    t = text()
    check("Frei" in t and ("Krems" in t or "LK" in t or "UK" in t or "→" in t), f"{name}: vergangener Einsatz mit Zeiten und Ziel")
    # Überstellung (KT)
    kt = g.evaluate(f"""async () => {{ const s = {S}; s.settings.ktAktiv = false; const k = await s.generiereSek('online'); await s.call('ktSetze', k.id, {{ sofort: true }}); await s.call('ktVormerken', k.id, window.__heli, 'neu', null); await s.call('ktSchicken', window.__heli); return s.ktAuftrag(k.id).d.code; }}""")
    g.wait_for_timeout(7000); h.wait_for_timeout(1500)
    if h.locator("#alarm").is_visible(): h.click("#alarm .q"); h.wait_for_timeout(1500)
    check("Ziel fest" in text(), f"{name}: Überstellung {kt} – Ziel steht fest")
    g.evaluate(f"async () => {{ const s = {S}; for (const k of ['zumBO','amBO','zumZO','amZO','freiFunk','freiWache']) try {{ await s.call('pilotStatus', window.__heli, k); }} catch (e) {{}} }}"); g.wait_for_timeout(800)
    h.wait_for_timeout(1500)
    if h.locator(G["zur"]).count(): h.click(G["zur"]); h.wait_for_timeout(800)
    check(h.evaluate("() => document.querySelectorAll('[data-e^=\"kt:\"]').length") >= 1, f"{name}: vergangene Überstellung in der Liste")
    tab("einst"); h.wait_for_timeout(500)
    check("verbindung" in text().lower() and "verbunden" in text().lower(), f"{name}: Einstellungen mit Verbindung")
    tab("einsaetze"); h.wait_for_timeout(400)
    ctx.close()
    return befehle

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1500, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'hell', einfuehrung:true})); })()")
        g = ctx.new_page(); g.on("pageerror", lambda e: logs.append(f"SPIEL PAGEERROR {e}"))
        g.goto("http://localhost:8964/?debug&seed=64"); g.wait_for_timeout(2500)
        print("    Heli", g.evaluate(START)); g.wait_for_timeout(1500)
        # ---- PC-Fenster
        t = g.evaluate("() => document.body.innerText")
        check(g.locator(".pvn-leiste").count() == 1 and "Nächster Schritt" not in t, "PC: Leiste links, kein „Nächster Schritt“")
        print("    Einsatz", g.evaluate(EINSATZ)); g.wait_for_timeout(6500)
        check(g.locator(".pvn-e").count() >= 1, "PC: Einsatz in der Liste")
        check(g.evaluate("() => (window.__pilot.daten().liste || []).some((e) => e.laeuft)"), "PC: Daten – laufender Einsatz in der Liste")
        g.evaluate(f"async () => {{ await {S}.call('pilotStatus', window.__heli, 'alarmiert'); }}"); g.evaluate(AMORT); g.wait_for_timeout(1500)
        g.click("text=Zielort buchen"); g.wait_for_timeout(300)
        g.click(".pvn-o >> nth=0"); g.wait_for_timeout(300); g.click(".pvn-o >> nth=2"); g.wait_for_timeout(300)
        g.fill(".pvn-such input", "atem"); g.wait_for_timeout(600)
        check(g.locator(".pvn-dd button").count() >= 1, "PC: Symptom-Dropdown")
        g.click(".pvn-dd button >> nth=0"); g.wait_for_timeout(400); g.click(".pvn-o >> nth=0"); g.wait_for_timeout(1000)
        g.click(".pvn-o >> nth=0"); g.click(".pvn-ab"); g.wait_for_timeout(1200)
        check("transportiert" in (g.evaluate("() => window.__pilot.daten().planT") or ""), "PC: Krankenhaus gebucht")
        g.click(".pvn-r >> nth=1"); g.wait_for_timeout(600)
        check(g.locator(".pvn-tasten").count() == 1 and g.locator(".pvn-funk").count() == 1, "PC: Reiter Status mit Haltetasten und Funk")
        g.click(".pvn-r >> nth=0"); g.evaluate(FREI); g.wait_for_timeout(1000)
        # ---- Handy und EFB
        geraet(b, g, "Handy")
        geraet(b, g, "EFB")
        print("    LOGS", json.dumps([l for l in logs if "PAGEERROR" in l][:6], ensure_ascii=False))
        check(not [l for l in logs if "PAGEERROR" in l], "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
