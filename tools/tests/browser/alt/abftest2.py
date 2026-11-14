import subprocess, sys, time, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
SCHEMA = f"{S}/abf/abfrageschema.json"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8774", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
logs = []; fails = 0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.goto("http://localhost:8774/"); A.wait_for_timeout(1500)
        A.click("[data-act=gen]"); A.wait_for_timeout(300)
        with A.expect_file_chooser() as fc: A.click(".dlg-foot >> text=Datei wählen")
        fc.value.set_files(SCHEMA); A.wait_for_timeout(1200)
        A.click(".tab[data-view=map]")
        A.click("[data-act=gen]"); A.wait_for_timeout(1200)
        A.click(".inc-annehmen"); A.wait_for_timeout(1500)
        v = A.inner_text(".anruf-verlauf")
        check("Anrufer:" in v, "Eröffnung: " + v.split("Anrufer:")[-1].strip()[:120])
        check(not A.locator("text=Genannte Adresse übernehmen").is_disabled(), "Adress-Knopf aktiv")
        A.click("text=Genannte Adresse übernehmen"); A.wait_for_timeout(900)
        # Ortung
        A.click("text=📡 Ortung"); A.wait_for_timeout(300)
        check("läuft" in A.inner_text(".ortung"), "Ortung läuft")
        A.click("[data-tempo='10']"); A.click("#sim-play"); A.wait_for_timeout(5000); A.click("#sim-play")
        o = A.inner_text(".ortung")
        check("±" in o, "Ortung fertig: " + o.replace("\n"," "))
        A.click(".ortung >> text=Als Einsatzort übernehmen"); A.wait_for_timeout(1500)
        check("Ortung ±" in A.locator(".mask .addr input").nth(1).input_value(), "Ortung als Einsatzort")
        # Kapitel + Primärfragen
        A.fill(".kapitel-liste >> xpath=.. >> input[type=search]", "Brust"); A.wait_for_timeout(300)
        A.click(".kapitel-opt >> nth=0"); A.wait_for_timeout(1000)
        A.fill(".abfrage .frage:has-text('Wie alt') input.zahl", "67"); A.press(".abfrage .frage:has-text('Wie alt') input.zahl", "Tab"); A.wait_for_timeout(800)
        A.click(".abfrage .frage:has-text('Geschlecht') .opt >> text=m"); A.wait_for_timeout(600)
        A.locator(".abfrage .frage:has-text('wach und ansprechbar') .opt").nth(1).click(); A.wait_for_timeout(600)
        A.locator(".abfrage .frage:has-text('Atmet der Patient normal') .opt").nth(0).click(); A.wait_for_timeout(900)
        info = A.locator(".mask textarea").nth(0).input_value()
        check(info.startswith("m 67J B~ A+"), "Info-Prefix: " + info)
        ta = A.locator(".mask textarea").nth(0)
        ta.click(); A.keyboard.press("End"); A.keyboard.type("Hund im Haus"); A.wait_for_timeout(200)
        check(ta.input_value() == "m 67J B~ A+ // Hund im Haus", "Freitext mit //: " + ta.input_value())
        A.locator(".mask textarea").nth(1).click(); A.wait_for_timeout(800)
        # weitere Antwort ändert Prefix, Freitext bleibt
        A.locator(".abfrage .frage:has-text('wach und ansprechbar') .opt").nth(0).click(); A.wait_for_timeout(900)
        check(ta.input_value() == "m 67J B+ A+ // Hund im Haus", "Prefix aktualisiert, Freitext bleibt: " + ta.input_value())
        for i in range(25):
            offen = A.locator(".abfrage .frage:has(.optionen):not(:has(.opt.gewaehlt)) .opt")
            if offen.count() == 0: break
            offen.first.click(); A.wait_for_timeout(400)
        code_abfr = A.inner_text(".anruf-code")
        check("Vorläufiger Code" in code_abfr, "Abfrage-Code: " + code_abfr.replace("\n"," ")[:100])
        # eigenen Code wählen
        A.fill(".mask .addr input >> nth=0", "RD-26A1"); A.wait_for_timeout(400)
        A.click(".mask .addr-list:not([hidden]) .addr-item >> nth=0"); A.wait_for_timeout(900)
        hd = A.inner_text(".code-info")
        check("RD-26A1" in hd, "Eigener Code gesetzt: " + hd.split("\n")[0])
        A.locator(".abfrage .opt.gewaehlt").last.click(); A.wait_for_timeout(500)
        A.locator(".abfrage .frage:has(.optionen):not(:has(.opt.gewaehlt)) .opt").first.click(); A.wait_for_timeout(900)
        check("RD-26A1" in A.inner_text(".code-info"), "Abfrage überschreibt eigenen Code nicht")
        check("Abfrage ergibt" in A.inner_text(".anruf-code"), "Hinweis 'Abfrage ergibt'")
        A.click("text=Code aus der Abfrage übernehmen"); A.wait_for_timeout(900)
        check("RD-26A1" not in A.inner_text(".code-info"), "Abfrage-Code übernommen: " + A.inner_text(".code-info").split("\n")[0])
        # Auflegen + Auflösung
        A.click(".anruf-kopf >> text=Auflegen"); A.wait_for_timeout(900)
        A.click("text=Auflösung zeigen"); A.wait_for_timeout(400)
        au = A.inner_text(".aufloesung")
        check("Kapitel" in au and "Wahrheit" in au, "Auflösung: " + au.replace("\n"," | ")[:300])
        A.locator(".mask").screenshot(path=f"{S}/shots5/maske061.png")
        check("Lage:" in au and "Patient:" in au, "Auflösung mit Lagesatz")
        # Kapitel 42: nur Codewahl
        A.click("[data-act=gen]"); A.wait_for_timeout(1200)
        A.click(".inc-row:has(.inc-anruf.klingelt) .inc-annehmen"); A.wait_for_timeout(1500)
        A.fill(".kapitel-liste >> xpath=.. >> input[type=search]", "andere Leitstelle"); A.wait_for_timeout(300)
        A.click(".kapitel-opt >> nth=0"); A.wait_for_timeout(1000)
        n42 = A.locator(".abfrage .kapitel-liste .kapitel-opt").count()
        check(n42 >= 5 and A.locator(".abfrage .frage .optionen").count() <= 6, f"Kapitel 42: Codeliste ({n42})")
        A.click(".abfrage .kapitel-liste .kapitel-opt >> nth=1"); A.wait_for_timeout(900)
        check("RD-42" in A.inner_text(".code-info"), "42-Code gesetzt: " + A.inner_text(".code-info").split("\n")[0])
        A.click(".abfrage .frage:has-text('Was ist passiert') .frag-knopf"); A.wait_for_timeout(1500)
        print("   Schilderung:", A.inner_text(".anruf-verlauf").split("Anrufer:")[-1].strip()[:150])
        A.click(".abfrage .frage:has-text('Wer ruft an') .frag-knopf"); A.wait_for_timeout(1500)
        print("   Wer:", A.inner_text(".anruf-verlauf").split("Anrufer:")[-1].strip()[:150])
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
print("\n".join(logs[:20]))
