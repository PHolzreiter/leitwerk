# Beta 70 (Paul 22.11.2026): Einstellungen › Eigene Dateien – drei Reiter, je Reiter genau eine Datei:
# Notruf (RD) = Codes + Abfrage, KT/SEK = nur Codes, Namen. Kein Teil-Upload (keine getrennte Codeliste, keine KT-Abfrage),
# Beispieldatei mit KI-Anleitung je Reiter, „KI-Anleitung kopieren“, kein Codes-Import unter Daten, alte Teile werden abgeschaltet.
# Aufruf: python3 beta70test.py <arbeitsordner> <web-build>   (web-build mit abf_test.json = AMPDS-Schema, siehe bau.sh)
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8970", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://localhost:8970")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8970/?debug&seed=8970"); A.wait_for_timeout(2500)
        A.evaluate("() => { const h = window.__lw.hauptmenue; if (h.offen()) h.schliessen(); }"); A.wait_for_timeout(500)
        A.evaluate("() => window.__lw.hauptmenue.zeigen(undefined, { splash: false, seite: 'einstellungen' })"); A.wait_for_timeout(1500)
        txt = lambda: A.evaluate("() => document.querySelector('.hm-wurzel').innerText")
        A.click(".l-tab:has-text('Eigene Dateien')"); A.wait_for_timeout(800)
        reiter = A.evaluate("() => [...document.querySelectorAll('.l-spage')].map(x => x.innerText.split('\\n')[0].trim())")
        print("    Reiter:", reiter)
        check(any("Notruf (RD)" in r for r in reiter) and any("KT/SEK" in r for r in reiter) and any(r.startswith("Namen") for r in reiter) and len(reiter) == 3, "genau drei Reiter: Notruf (RD), KT/SEK, Namen")
        check(not any(x in " ".join(reiter) for x in ["Notruf-Codes", "KT-Abfrage", "Notruf-Abfrage"]), "keine Reiter für Teile (Notruf-Codes, Notruf-Abfrage, KT-Abfrage)")
        def seite(n):
            A.click(f".l-spage:has-text('{n}')"); A.wait_for_timeout(900)
        def hoch(pfad, warte=2500):
            with A.expect_file_chooser() as fc: A.click("button:has-text('Datei wählen')")
            fc.value.set_files(pfad); A.wait_for_timeout(warte)
        def beispiel():
            with A.expect_download() as dl: A.click("button:has-text('Beispieldatei herunterladen')")
            q = dl.value.path(); A.wait_for_timeout(300)
            return open(q, encoding="utf-8-sig").read()
        def ki():
            A.click("button:has-text('KI-Anleitung kopieren')"); A.wait_for_timeout(500)
            return A.evaluate("() => navigator.clipboard.readText()")
        def waehle(v):
            A.select_option("select[aria-label='Aktiv']", label=v); A.wait_for_timeout(3000)
        def optionen():
            return A.evaluate("() => [...document.querySelectorAll(\"select[aria-label='Aktiv'] option\")].map(o => o.textContent)")
        def aktiv():
            return A.evaluate("() => { const s = document.querySelector(\"select[aria-label='Aktiv']\"); return s ? s.value : null; }")
        st = lambda js: A.evaluate(f"() => {{ const s = window.__lw.store; return {js}; }}")

        # ---- Notruf (RD): Beispieldatei mit KI-Anleitung, hochladen; AMPDS hochladen
        seite("Notruf (RD)")
        t = txt()
        check("Abfrageschema/RD" in t and "Datei hochladen" in t and "Beispieldatei" in t and "Mit einer KI erstellen" in t, "Notruf: Ordner, Hochladen, Beispieldatei, KI sichtbar")
        bsp = beispiel(); j = json.loads(bsp)
        check(isinstance(j.get("anleitung_fuer_ki"), list) and len(j["kapitel"]) == 3 and "Auftrag des Spielers" in "\n".join(j["anleitung_fuer_ki"]) and "Eigene Dateien" in "\n".join(j["anleitung_fuer_ki"]), f"Notruf: Beispieldatei klein ({len(j['kapitel'])} Kapitel, {len(j['codes'])} Codes) mit KI-Anleitung")
        k = ki()
        check("Anleitung für eine KI" in k and "## Beispieldatei" in k and '"kapitel"' in k and "Region:" in k, "Notruf: KI-Anleitung samt Beispiel und Platz für den Auftrag kopiert")
        hoch(datei("Beispiel Notruf.json", bsp))
        check(st("!s.schemaIstStandard") and aktiv() == "Beispiel Notruf", f"Notruf: Beispieldatei lässt sich hochladen und ist aktiv ({aktiv()})")
        gesp = A.evaluate("async () => JSON.parse(await window.__lw.ablage.ablageLesen('Abfrageschema/RD', 'Beispiel Notruf.json'))")
        check("anleitung_fuer_ki" not in gesp, "Notruf: KI-Anleitung wird beim Speichern weggelassen")
        ampds = open(os.path.join(DIST, "abf_test.json"), encoding="utf-8").read()
        hoch(datei("Notruf Test.json", ampds), 4000)
        r = st("({ schema: !s.schemaIstStandard, n: Object.keys(s.schemaRoh.codes).length })")
        check(r["schema"] and r["n"] > 1000 and aktiv() == "Notruf Test", f"Notruf: AMPDS-Datei hochgeladen und aktiv ({r['n']} Codes)")
        hoch(datei("Codes.csv", "Code;Name;Kategorie;Kapitel\nX-1;Test;ALS rot;1\n"))
        check("nur eine JSON-Datei" in txt() and aktiv() == "Notruf Test", "Notruf: eine CSV-Codeliste wird abgelehnt (kein Teil-Upload)")
        waehle("Eingebaut – LeitWerk-Codesystem")
        check(st("s.schemaIstStandard") and aktiv() == "Eingebaut – LeitWerk-Codesystem", "Notruf: per Dropdown wieder eingebaut")
        waehle("Notruf Test")
        check(st("!s.schemaIstStandard") and aktiv() == "Notruf Test", "Notruf: per Dropdown wieder die eigene Datei")
        with A.expect_download() as dl: A.click("button:has-text('Eingebautes System herunterladen')")
        voll = json.load(open(dl.value.path(), encoding="utf-8"))
        check(len(voll["kapitel"]) > 30, "Notruf: eingebautes System als Datei herunterladbar")

        # ---- KT/SEK: Beispieldatei, umbenennen, hochladen; unvollständig = Entwurf; CSV abgelehnt
        seite("KT/SEK")
        t = txt()
        check("Codelisten/Krankentransport_Sekundärtransporte" in t and "eingebauten" in t, "KT/SEK: Ordner genannt, Hinweis auf eingebaute Fragen")
        bsp = beispiel(); j = json.loads(bsp)
        an = "\n".join(j["anleitung_fuer_ki"])
        check(len(j["codes"]) > 100 and "fahrt" in an and "zum_kh" in an and "genau einem Code" in an, f"KT/SEK: Beispieldatei mit {len(j['codes'])} Codes und KI-Anleitung (Werte, Regeln)")
        k = ki()
        check("KT/SEK-Codes für LeitWerk" in k and '"codes"' in k and "Region:" in k, "KT/SEK: KI-Anleitung kopiert")
        j["codes"][0]["code"] = "XKT-1"; j["codes"][0]["name"] = "Eigener KT-Code"
        hoch(datei("KT-SEK Test.json", json.dumps(j, ensure_ascii=False)))
        r = st("({ x: !!(s.ktSatzRoh && s.ktSatzRoh.codes.some(c => c.code === 'XKT-1')), abfrage: !!(s.ktSatzRoh && s.ktSatzRoh.abfrage) })")
        check(r == {"x": True, "abfrage": False} and aktiv() == "KT-SEK Test", f"KT/SEK: eigene Datei aktiv, nur Codes ({r})")
        hoch(datei("Halb.json", json.dumps({"codes": [j["codes"][1]]})))
        check("Entwurf" in txt() and "Halb" not in optionen() and aktiv() == "KT-SEK Test", "KT/SEK: unvollständige Datei als Entwurf, nicht im Dropdown")
        hoch(datei("KT.csv", "Code;Name;Fahrt\nZ-1;x;zum Krankenhaus / Arzt\n"))
        check("nur eine JSON-Datei" in txt(), "KT/SEK: CSV wird abgelehnt")
        waehle("Eingebaut – LeitWerk-Transportcodes")
        check(st("s.ktSatzRoh") is None, "KT/SEK: per Dropdown wieder eingebaut")

        # ---- Namen: Beispieldatei mit KI-Anleitung (#-Zeilen), KT/SEK-Abschnitt
        seite("Namen")
        v = beispiel()
        check("# Anleitung für eine KI" in v and "# Krankentransport & Überstellung (KT/SEK)" in v, "Namen: Beispieldatei mit KI-Anleitung und KT/SEK-Abschnitt")
        check("Region:" in ki(), "Namen: KI-Anleitung kopiert")
        hoch(datei("Namen Test.csv", v.replace("Rettungsdienst;\n", "Rettungsdienst;Testdienst\n", 1)))
        check(st("s.namen.length") == 1 and aktiv() == "Namen Test.csv", "Namen: Beispieldatei ausgefüllt hochgeladen (Anleitung stört nicht)")

        # ---- kein Codes-Import mehr unter Daten; alte Teile werden abgeschaltet
        r = A.evaluate("""() => { const s = window.__lw.store;
            s.upsert('codes', [{ id: 'ALT-1', code: 'ALT-1', name: 'alt', kategorie: 'ALS rot', kapitel: '1', hinweis: '', herkunft: 'import', herkunftDetail: 'Alt.csv' }]);
            const k = s.ktSatzRoh; s.setKtSatz({ name: 'Alt', codes: (k && k.codes) || [], abfrage: [{ id: 'x', text: 'Frage?' }] });
            return true; }""")
        A.reload(); A.wait_for_timeout(3000)
        r = st("({ alt: s.list('codes').some(c => c.herkunftDetail === 'Alt.csv'), abfrage: !!(s.ktSatzRoh && s.ktSatzRoh.abfrage), schema: !s.schemaIstStandard })")
        check(r["alt"] is False and r["abfrage"] is False and r["schema"] is True, f"Start: getrennte Codeliste und KT-Abfrage abgeschaltet, Notruf-Datei bleibt ({r})")
        print("    LOGS", json.dumps(logs[:6], ensure_ascii=False))
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
