# Beta 69 (Paul 21.11.2026): Einstellungen › Eigene Dateien – je Reiter Notruf-Codes, Notruf-Abfrage, KT/SEK-Codes, KT-Abfrage, Namen;
# oben Dropdown „Aktiv“, Datei hochladen, Vorlage speichern, Ordner; Codes und Abfrage getrennt wählbar; KT/SEK-Codes auch als CSV.
# Aufruf: python3 beta69test.py <arbeitsordner> <web-build>   (web-build mit abf_test.json = AMPDS-Schema, siehe bau.sh)
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8969", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
os.makedirs(S, exist_ok=True)
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
def datei(name, text):
    p = os.path.join(S, name)
    with open(p, "w", encoding="utf-8") as f: f.write(text)
    return p
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1500, "height": 950}, accept_downloads=True)
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8969/?debug&seed=8969"); A.wait_for_timeout(2500)
        A.evaluate("() => { const h = window.__lw.hauptmenue; if (h.offen()) h.schliessen(); }"); A.wait_for_timeout(500)
        A.evaluate("() => window.__lw.hauptmenue.zeigen(undefined, { splash: false, seite: 'einstellungen' })"); A.wait_for_timeout(1500)
        txt = lambda: A.evaluate("() => document.querySelector('.hm-wurzel').innerText")
        A.click(".l-tab:has-text('Eigene Dateien')"); A.wait_for_timeout(800)
        t = txt()
        check(all(x in t for x in ["Notruf-Codes", "Notruf-Abfrage", "KT/SEK-Codes", "KT-Abfrage", "Namen"]), "fünf Reiter unter Eigene Dateien")
        check("Funkrufnamen" not in t and "Logos" not in t, "Funkrufnamen und Logos sind weg")
        def seite(n):
            A.click(f".l-spage:has-text('{n}')"); A.wait_for_timeout(900)
        def hoch(pfad):
            with A.expect_file_chooser() as fc: A.click("button:has-text('Datei wählen')")
            fc.value.set_files(pfad); A.wait_for_timeout(2500)
        def vorlage():
            with A.expect_download() as dl: A.click("button:has-text('Vorlage speichern')")
            q = dl.value.path(); A.wait_for_timeout(300)
            return open(q, encoding="utf-8-sig").read()
        def waehle(v):
            A.select_option("select[aria-label='Aktiv']", label=v); A.wait_for_timeout(3000)
        def optionen():
            return A.evaluate("() => [...document.querySelectorAll(\"select[aria-label='Aktiv'] option\")].map(o => o.textContent)")
        def aktiv():
            return A.evaluate("() => { const s = document.querySelector(\"select[aria-label='Aktiv']\"); return s ? s.value : null; }")
        st = lambda js: A.evaluate(f"() => {{ const s = window.__lw.store; return {js}; }}")

        # ---- Notruf-Abfrage: AMPDS-Schema hochladen
        seite("Notruf-Abfrage")
        t = txt()
        check("Abfrageschema/RD" in t and "Datei hochladen" in t and "Vorlage speichern" in t, "Notruf-Abfrage: Ordner, Hochladen, Vorlage sichtbar")
        check(aktiv() == "Eingebaut – LeitWerk-Abfrage", "Notruf-Abfrage: eingebaut aktiv")
        ampds = open(os.path.join(DIST, "abf_test.json"), encoding="utf-8").read()
        hoch(datei("Mein_Schema.json", ampds))
        check(st("!s.schemaIstStandard") and aktiv() == "Mein_Schema", f"Notruf-Abfrage: hochgeladen und aktiv ({aktiv()})")
        check("Mein_Schema" in optionen(), "Notruf-Abfrage: Datei im Dropdown")

        # ---- Notruf-Codes: eigene Codeliste, Schema bleibt
        seite("Notruf-Codes")
        v = vorlage()
        check(v.startswith("Code;Name;Kategorie;Kapitel") and "RD-6D1" in v, "Notruf-Codes: Vorlage mit den eingebauten Codes")
        hoch(datei("Meine_Codes.csv", "Code;Name;Kategorie;Kapitel\nTEST-1A1;Testcode eins;ALS rot;1 - Test\nTEST-1A2;Testcode zwei;BLS gelb;1 - Test\n"))
        r = st("({ schema: !s.schemaIstStandard, codes: s.list('codes').filter(c => c.herkunftDetail === 'Meine_Codes.csv').length })")
        check(r == {"schema": True, "codes": 2} and aktiv() == "Meine_Codes", f"Notruf-Codes: Codeliste aktiv, Schema bleibt aktiv ({r})")
        waehle("Eingebaut – LeitWerk-Codesystem")
        r = st("({ schema: !s.schemaIstStandard, codes: s.list('codes').filter(c => c.herkunftDetail === 'Meine_Codes.csv').length })")
        check(r == {"schema": True, "codes": 0} and aktiv() == "Eingebaut – LeitWerk-Codesystem", f"Notruf-Codes: zurück auf eingebaut, Schema bleibt ({r})")
        waehle("Meine_Codes")
        check(aktiv() == "Meine_Codes", "Notruf-Codes: per Dropdown wieder aktiv")
        seite("Notruf-Abfrage")
        waehle("Eingebaut – LeitWerk-Abfrage")
        r = st("({ schema: !s.schemaIstStandard, codes: s.list('codes').filter(c => c.herkunftDetail === 'Meine_Codes.csv').length })")
        check(r == {"schema": False, "codes": 2}, f"Notruf-Abfrage: eingebaut – Codeliste bleibt ({r})")
        waehle("Mein_Schema")
        check(st("!s.schemaIstStandard") and aktiv() == "Mein_Schema", "Notruf-Abfrage: per Dropdown wieder aktiv")

        # ---- KT/SEK-Codes: Vorlage als CSV, umbenannt hochladen
        seite("KT/SEK-Codes")
        check("Codelisten/Krankentransport_Sekundärtransporte" in txt(), "KT/SEK-Codes: Ordner wird genannt")
        v = vorlage()
        zeilen = v.strip().splitlines()
        check(zeilen[0].startswith("Code;Name;Kapitel;") and "Fahrt" in zeilen[0] and len(zeilen) > 50, f"KT/SEK-Codes: Vorlage mit Bedingungen ({len(zeilen) - 1} Codes)")
        neu = [zeilen[0]] + [z.replace("KTR-90T1;Fahrt zum Krankenhaus – gehend", "XKT-1;Eigener KT-Code gehend", 1) for z in zeilen[1:]]
        hoch(datei("Meine_KT.csv", "\n".join(neu) + "\n"))
        r = st("({ name: s.ktSatzRoh && s.ktSatzRoh.name, n: s.ktSatzRoh && s.ktSatzRoh.codes ? s.ktSatzRoh.codes.length : 0, x: !!(s.ktSatzRoh && s.ktSatzRoh.codes && s.ktSatzRoh.codes.some(c => c.code === 'XKT-1' && c.bed.fahrt === 'zum_kh')) })")
        check(r["x"] and aktiv() == "Meine_KT", f"KT/SEK-Codes: CSV hochgeladen, umbenannter Code mit Bedingungen aktiv ({r})")
        # unvollständig: nur ein Code -> Entwurf
        hoch(datei("Halb_KT.csv", "Code;Name;Fahrt;Lage\nYKT-1;Nur einer;zum Krankenhaus / Arzt;gehend\n"))
        t = txt()
        check("Entwurf" in t and "Halb_KT" not in optionen() and aktiv() == "Meine_KT", "KT/SEK-Codes: unvollständige CSV als Entwurf (nicht im Dropdown, aktiv bleibt)")
        hoch(datei("Falsch_KT.csv", "Code;Name;Fahrt\nZKT-1;Falsch;mit dem Fahrrad\n"))
        check("kein Wert für Fahrt" in txt(), "KT/SEK-Codes: falscher Wert wird erklärt")

        # ---- KT-Abfrage: Vorlage hochladen, Codes bleiben
        seite("KT-Abfrage")
        v = vorlage()
        check('"abfrage"' in v, "KT-Abfrage: Vorlage (JSON)")
        hoch(datei("Meine_KT_Abfrage.json", v))
        r = st("({ codes: !!(s.ktSatzRoh && s.ktSatzRoh.codes), abfrage: !!(s.ktSatzRoh && s.ktSatzRoh.abfrage) })")
        check(r == {"codes": True, "abfrage": True} and aktiv() == "Meine_KT_Abfrage", f"KT-Abfrage: aktiv, eigene KT-Codes bleiben ({r})")
        waehle("Eingebaut – LeitWerk-KT-Abfrage")
        r = st("({ codes: !!(s.ktSatzRoh && s.ktSatzRoh.codes), abfrage: !!(s.ktSatzRoh && s.ktSatzRoh.abfrage) })")
        check(r == {"codes": True, "abfrage": False}, f"KT-Abfrage: eingebaut, Codes bleiben ({r})")
        seite("KT/SEK-Codes")
        waehle("Eingebaut – LeitWerk-Transportcodes")
        check(st("s.ktSatzRoh") is None and aktiv() == "Eingebaut – LeitWerk-Transportcodes", "KT/SEK-Codes: alles wieder eingebaut")

        # ---- Namen
        seite("Namen")
        v = vorlage()
        check("# Krankentransport & Überstellung (KT/SEK)" in v and "Krankentransport St. Pölten;" in v, "Namen: Vorlage mit KT/SEK-Abschnitt")
        hoch(datei("Test_Namen.csv", "neutral;eigen\nRettungsdienst;Testdienst\n"))
        r = st("s.list('stations').filter(x => x.organisation === 'Testdienst').length")
        check(r > 100 and aktiv() == "Test_Namen.csv", f"Namen: hochgeladen und aktiv ({r} Dienststellen)")
        waehle("Eingebaut – neutrale Namen")
        check(st("s.namen.length") == 0 and aktiv() == "Eingebaut – neutrale Namen", "Namen: per Dropdown wieder neutral")
        waehle("Test_Namen.csv")
        check(st("s.namen.length") == 1, "Namen: per Dropdown wieder eigene Namen")

        # ---- Sprung aus Einsatzcodes & Abfrage
        A.click(".l-tab:has-text('Leitstelle')"); A.wait_for_timeout(600)
        print("    LOGS", json.dumps(logs[:6], ensure_ascii=False))
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
