# Beta 71 (Paul 22.11.2026): Mein Platz neu geordnet – 7 Seiten (Einrichten, Aussehen, Kopfhörer & Mikrofon,
# Telefon, Funk & KI, Töne, Pilot & Flugsimulator, Bedienung); Einrichten Schritt für Schritt mit Probeton, Mikrofontest
# (mit Pegel), Sprechtasten-Probe und Probeanruf; Bereitschafts-Check „Kopfhörer & Mikrofon“; Option „Telefon links, Funk rechts“.
# Aufruf: python3 beta71test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8971", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        ctx = b.new_context(viewport={"width": 1500, "height": 950})
        ctx.grant_permissions(["microphone"], origin="http://localhost:8971")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8971/?debug&seed=8971"); A.wait_for_timeout(2500)
        A.evaluate("() => { try { localStorage.removeItem('lw.einrichten'); localStorage.removeItem('lw.audioArt'); } catch {} }")
        A.evaluate("() => { const h = window.__lw.hauptmenue; if (h.offen()) h.schliessen(); }"); A.wait_for_timeout(500)
        A.evaluate("() => window.__lw.hauptmenue.zeigen(undefined, { splash: false, seite: 'einstellungen' })"); A.wait_for_timeout(1500)
        txt = lambda: A.evaluate("() => document.querySelector('.hm-wurzel').innerText")
        A.click(".l-tab:has-text('Mein Platz')"); A.wait_for_timeout(800)
        seiten = A.evaluate("() => [...document.querySelectorAll('.l-spage')].map(x => x.innerText.split('\\n')[0].trim())")
        print("    Seiten:", seiten)
        check(seiten == ["Einrichten", "Aussehen", "Kopfhörer & Mikrofon", "Telefon, Funk & KI", "Töne", "Pilot & Flugsimulator", "Bedienung"], "Mein Platz: sieben Seiten in der richtigen Reihenfolge")
        def seite(n):
            A.click(f".l-spage:has-text('{n}')"); A.wait_for_timeout(1000)
        def knopf(t, warte=800):
            A.click(f"button:has-text('{t}')"); A.wait_for_timeout(warte)

        # ---- Einrichten
        seite("Einrichten")
        t = txt()
        check(all(f"Schritt {i}" in t.replace("SCHRITT", "Schritt") for i in range(1, 7)) and "von 6 Schritten" in t, "Einrichten: sechs Schritte mit Stand")
        check("noch nicht gehört" in t, "Einrichten: Hören noch offen")
        knopf("▶ Abspielen")
        knopf("Ich habe beides gehört")
        check("✓ erledigt" in txt(), "Einrichten: Probeton bestätigt → erledigt")
        knopf("Testen – 4 Sekunden sprechen", 1500)
        mitte = txt()
        A.wait_for_timeout(4500)
        t = txt()
        print("    Mikrofon:", [z for z in t.split("\n") if "Pegel" in z or "Mikrofon hört" in z][:3])
        check("Pegel" in mitte or "▮" in mitte, "Einrichten: Pegel läuft beim Mikrofontest mit")
        check("Mikrofon hört dich" in t, "Einrichten: Mikrofontest klappt (Testgerät)")
        knopf("Jetzt eine Sprechtaste drücken", 400)
        taste = A.evaluate("() => { const p = window.__lw.funkTest.sprachPrefs(); return p.taste; }")
        A.keyboard.press(taste); A.wait_for_timeout(800)
        t = txt()
        check("Sprechtaste" in t and "erkannt" in t, f"Einrichten: Sprechtaste ({taste}) erkannt")
        st = A.evaluate("() => JSON.parse(localStorage.getItem('lw.einrichten') || '{}')")
        check(st.get("hoeren") == "" and st.get("mikro") == "" and st.get("tasten") is True, f"Einrichten: Fortschritt gemerkt ({st})")

        A.click("button:text-is('Starten')"); A.wait_for_timeout(500)
        A.wait_for_timeout(14000)
        t = txt()
        i = t.find("Probeanruf", t.find("SCHRITT 6") + 12); print("    Probeanruf:", t[i:i+300].replace("\n", " | "))
        check("so kommt es im Spiel an" in t, "Einrichten: Probeanruf läuft durch (klingeln, Anrufer, antworten)")

        # ---- Kopfhörer & Mikrofon
        seite("Kopfhörer & Mikrofon")
        t = txt()
        check("Lautstärken" in t.upper().title() or "LAUTSTÄRKEN" in t, "Kopfhörer & Mikrofon: Lautstärken an einem Ort")
        check("Telefon links, Funk rechts" in t and "Telefon: Anrufer" not in t, "Headset: ein Gerät, Option links/rechts")
        A.click("button:has-text('Telefon und Funk auf getrennten Geräten')"); A.wait_for_timeout(900)
        t = txt()
        check("Telefon: Anrufer" in t and "Funk: Fahrzeuge" in t and "Mikrofon für den Funk" in t, "Getrennt: Geräte für Telefon, Funk und Töne einzeln")
        A.click("button:has-text('Headset (Kopfhörer mit Mikrofon)')"); A.wait_for_timeout(900)
        check(A.evaluate("() => localStorage.getItem('lw.audioArt')") == "headset" and "Telefon: Anrufer" not in txt(), "Zurück auf Headset")
        an = A.evaluate("() => window.__lw.funkTest.sprachPrefs().stereoTrennung")
        A.click(".l-srow:has-text('Telefon links, Funk rechts') .l-tog, .l-srow:has-text('Telefon links, Funk rechts') input"); A.wait_for_timeout(600)
        nach = A.evaluate("() => window.__lw.funkTest.sprachPrefs().stereoTrennung")
        check(an is False and nach is True, f"Telefon links, Funk rechts: Standard aus, einschaltbar ({an} → {nach})")

        # ---- Telefon, Funk & KI
        seite("Telefon, Funk & KI")
        t = txt()
        for h in ["TELEFON", "FUNK", "KI – WER SPRICHT ANRUFER UND FAHRZEUGE?", "STIMMEN UND SPRACHERKENNUNG"]:
            check(h in t, f"Telefon, Funk & KI: Abschnitt „{h.title()}“")
        check("Sprechtaste fürs Telefon" in t and "Sprechtaste für den Funk" in t, "Sprechtasten auf der Seite Telefon, Funk & KI")
        A.click("button:has-text('Wählen'):near(.l-srow:has-text('Stimmen'))"); A.wait_for_timeout(800)
        check("Stimmen" in txt(), "Unterseite Stimmen erreichbar")

        # ---- Töne: eine Seite
        seite("Töne")
        t = txt()
        check("Welcher Ton wann?".upper() in t and "EIGENE TONDATEIEN" in t, "Töne: Ereignisse und eigene Dateien auf einer Seite")

        # ---- Aussehen = Darstellung + Farben
        seite("Aussehen")
        t = txt()
        check("Farbschema" in t and "Eigene Statusfarben" in t, "Aussehen: Darstellung und Farben zusammen")

        # ---- Bereitschafts-Check: Kopfhörer & Mikrofon
        A.evaluate("() => { localStorage.removeItem('lw.einrichten'); }")
        A.evaluate("() => { const h = window.__lw.hauptmenue; h.schliessen(); }"); A.wait_for_timeout(500)
        A.evaluate("() => window.__lw.hauptmenue.zeigen(undefined, { splash: false })"); A.wait_for_timeout(3500)
        kopf = A.evaluate("() => document.querySelector('.hm-wurzel').innerText")
        check("Bereitschafts-Check" in kopf, "Bereitschafts-Check sichtbar")
        A.click("text=Bereitschafts-Check"); A.wait_for_timeout(800)
        t = txt()
        i = t.find("Kopfhörer & Mikrofon"); print("    CHECK:", t[i:i+200].replace("\n", " | "))
        check("Kopfhörer & Mikrofon" in t and "Probeton abspielen" in t, "Bereitschafts-Check: „Kopfhörer & Mikrofon – noch nicht getestet“")
        print("    LOGS", json.dumps(logs[:6], ensure_ascii=False))
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
