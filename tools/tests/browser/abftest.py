import subprocess, sys, time, re
sys.path.insert(0, sys.argv[1])
from mockrelay import Relay
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
SCHEMA = f"{S}/abf/abfrageschema.json"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8773", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
logs = []; fails = 0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
relay = Relay()
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
        B = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
        for pg, tag in [(A, "A"), (B, "B")]:
            pg.on("pageerror", lambda e, t=tag: logs.append(f"{t} PAGEERROR: {e}"))
            pg.on("console", lambda m, t=tag: logs.append(f"{t} {m.type}: {m.text}") if m.type == "error" and "404" not in m.text and "glyph" not in m.text.lower() else None)
            relay.attach(pg, tag)
            pg.goto("http://localhost:8773/"); pg.wait_for_timeout(1500)
        # Schema-Import über „Testeinsatz“ → Fenster → Datei wählen
        A.click("[data-act=gen]"); A.wait_for_timeout(300)
        with A.expect_file_chooser() as fc: A.click(".dlg-foot >> text=Datei wählen")
        fc.value.set_files(SCHEMA); A.wait_for_timeout(1500)
        A.click(".tab[data-view=data]"); A.click(".nav-item:has-text('Einsatzcodes')"); A.wait_for_timeout(400)
        bar = A.inner_text(".schema-bar")
        check("Abfrageschema geladen" in bar, "Schema geladen: " + bar.split("\n")[0])
        A.screenshot(path=f"{S}/shots5/daten_schema.png")
        A.click(".tab[data-view=map]")
        # Host + Beitritt
        A.click("#btn-spiel"); A.wait_for_timeout(300)
        A.fill(".spiel input[placeholder^='Dein Name']", "Paul")
        A.click(".spiel >> text=Spiel hosten"); A.wait_for_timeout(800)
        code = A.inner_text(".spiel-code").strip()
        A.click(".dlg-foot >> text=Schließen")
        B.click("#btn-spiel"); B.wait_for_timeout(300)
        B.fill(".spiel input[placeholder^='Dein Name']", "Max")
        B.fill(".code-input", code)
        B.click(".spiel >> text=Beitreten"); B.wait_for_timeout(2000)
        check("Mitspieler" in B.inner_text("#btn-spiel"), "B ist Mitspieler")
        B.screenshot(path=f"{S}/shots5/B_nach_beitritt.png")
        if B.locator(".dlg-overlay").count(): B.click(".dlg-overlay .dlg-foot button >> nth=-1"); B.wait_for_timeout(300)
        # Testeinsatz → Anruf klingelt
        A.click("[data-act=gen]"); A.wait_for_timeout(1500)
        check(A.locator(".inc-anruf.klingelt").count() == 1, "A: Anruf klingelt in der Liste")
        B.wait_for_timeout(1000)
        check(B.locator(".inc-anruf.klingelt").count() == 1, "B: Anruf klingelt in der Liste")
        check(A.locator(".mask .meldung").is_hidden(), "Meldungskasten ausgeblendet")
        A.screenshot(path=f"{S}/shots5/A_klingelt.png")
        # B nimmt an (über Listen-Knopf)
        B.click(".inc-annehmen"); B.wait_for_timeout(2500)
        verl = B.inner_text(".anruf-verlauf")
        check("Anrufer:" in verl, "B: Anrufer meldet sich: " + verl.replace("\n", " | ")[:400])
        A.wait_for_timeout(1200)
        check("Max" in A.inner_text(".anruf-kopf"), "A sieht Gesprächsführer Max: " + A.inner_text(".anruf-kopf"))
        check(A.locator(".anruf-form").is_hidden(), "A: kein Eingabefeld")
        check(A.locator(".frag-knopf").count() == 0, "A: keine 🗨-Knöpfe")
        # B fragt frei
        B.fill(".anruf-form input", "Wie alt ist der Patient?"); B.press(".anruf-form input", "Enter"); B.wait_for_timeout(1500)
        check("Wie alt" in B.inner_text(".anruf-verlauf"), "Freie Frage im Verlauf")
        # Kapitel wählen: das wahre Kapitel steht nicht in der UI – wir nehmen per Suche das erste
        B.fill(".kapitel-liste >> xpath=.. >> input[type=search]", "Sturz"); B.wait_for_timeout(300)
        B.click(".kapitel-opt >> nth=0"); B.wait_for_timeout(1200)
        n = B.locator(".abfrage .frage").count()
        check(n > 5, f"Kapitelfragen sichtbar ({n})")
        # 🗨 bei erster Primärfrage, dann jeweils erste Option bei allen sichtbaren Single-Fragen
        B.locator(".abfrage-abschnitt >> nth=3").locator(".frag-knopf").first.click(); B.wait_for_timeout(1500)
        for i in range(25):
            offen = B.locator(".abfrage .frage:has(.optionen):not(:has(.opt.gewaehlt)) .opt")
            if offen.count() == 0: break
            offen.first.click(); B.wait_for_timeout(500)
        code_b = B.inner_text(".anruf-code")
        check("Vorläufiger Code" in code_b, "Code ermittelt: " + code_b.replace("\n", " "))
        A.wait_for_timeout(1500)
        check("Vorläufiger Code" in A.inner_text(".anruf-code"), "A sieht Code mit")
        hd = A.inner_text(".mask-head")
        check("ohne Code" not in hd, "Code in Maske übernommen: " + hd.split("\n")[0])
        # A darf disponieren
        adr = A.locator(".mask .addr input").nth(1)
        adr.fill("Krems"); A.wait_for_timeout(800)
        A.click(".mask .addr-list:not([hidden]) .addr-item >> nth=0"); A.wait_for_timeout(2000)
        A.locator(".sugg-row input[type=checkbox]:not([disabled])").first.check()
        A.click(".mask >> text=Alarmieren"); A.wait_for_timeout(1500)
        check(A.locator(".as-row").count() >= 1, "A konnte alarmieren")
        # A darf nicht abfragen (direkt aufrufen)
        A.screenshot(path=f"{S}/shots5/A_zuschauer.png", full_page=False)
        B.screenshot(path=f"{S}/shots5/B_gespraech.png")
        B.locator(".mask").screenshot(path=f"{S}/shots5/B_maske.png")
        # Auflegen
        B.click(".anruf-kopf >> text=Auflegen"); B.wait_for_timeout(1200)
        check("beendet" in A.inner_text(".anruf-kopf"), "Gespräch beendet bei A")
        # Verpasster Anruf: neuer Einsatz, 10× laufen lassen
        A.click("[data-act=gen]"); A.wait_for_timeout(800)
        A.click("[data-tempo='10']"); A.click("#sim-play")
        A.wait_for_timeout(10000)
        txt = A.inner_text(".inc-list")
        check("verpasst" in txt, "Verpasster Anruf nach Klingeln")
        A.screenshot(path=f"{S}/shots5/A_verpasst.png")
        # Pause → Rückruf-Zeit läuft nicht weiter
        A.click("#sim-play"); A.wait_for_timeout(20000)
        check("verpasst" in A.inner_text(".inc-list"), "Pausiert: bleibt verpasst")
        A.click("#sim-play")
        for i in range(40):
            A.wait_for_timeout(1000)
            txt = A.inner_text(".inc-list")
            if "Versuch" in txt: break
        check("Versuch" in txt, "Anrufer ruft erneut an: " + re.sub(r"\s+", " ", txt)[:200])
        A.click("#sim-play")
        A.click(".inc-row:has-text('Versuch') .inc-annehmen"); A.wait_for_timeout(2500)
        v = A.inner_text(".anruf-verlauf")
        check("schon" in v or "nochmal" in v or "wieder" in v or "zweiten" in v.lower(), "Anrufer erwähnt früheren Anruf: " + v.replace("\n"," | ")[:250])
        A.screenshot(path=f"{S}/shots5/A_rueckruf.png")
        # Einstellungen-Seite
        A.click(".tab[data-view=settings]"); A.wait_for_timeout(800)
        A.locator("section.set-sec:has(h3:has-text('KI-Anrufer'))").screenshot(path=f"{S}/shots5/settings_ki.png")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
print("\n".join(logs[:30]))
