# Funk-Umbau: Absicht der Leitstelle erkennen (Frage, Information, Auftrag, nicht verstanden)
# Aufruf: python3 funkabsichttest.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8921", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

# (Spruch, erwartete Art, erwartetes Thema oder None, Sicherheit)
FAELLE = [
    ("Hier LEO das NEF Tulln ist abbestellt", "info", "dritteStorno", 1),
    ("Hier LEO, das NEF Tulln ist ab Wache mit einer Eintreffzeit von 15 Minuten zu euch alarmiert, kommen", "info", "naKommt", 1),
    ("Christophorus 2 ist zu euch unterwegs, kommen", "info", "naKommt", 1),
    ("moneda", "unklar", None, 1),
    ("Hier LEO, kommen", "quittung", None, 1),
    ("verstanden, Ende", "ende", None, 1),
    ("Hier LEO, verstanden", "quittung", None, 1),
    ("56/006 von LEO, bitte eine Lagemeldung, kommen", "lageAnfordern", None, 1),
    ("Hier LEO, Storno für euch, rückt ein, kommen", "storno", None, 1),
    ("Storno, kommen", "storno", None, 1),
    ("wie ist der Zustand des Patienten?", "frage", "patient", 1),
    ("fährt der NEF mit euch mit?", "frage", "naMit", 1),
    ("wie lange braucht ihr noch bis zum Einsatzort?", "frage", "eintreffen", 1),
    ("wohin fahrt ihr?", "frage", "ziel", 1),
    ("habt ihr eine Sättigung?", "frage", "werte", 1),
    ("braucht ihr noch Unterstützung?", "frage", "bedarf", 1),
    ("die Feuerwehr ist alarmiert und kommt zu euch", "info", "kraefteKommen", 1),
    ("Untertitel im Auftrag des ZDF", "unklar", None, 1),
    ("Hier LEO, Lage?", "lageAnfordern", None, 1),
    ("Hier LEO, wie lange braucht ihr noch ins Krankenhaus?", "frage", "eintreffen", 1),
    ("wartet bitte vor Ort auf den Notarzt", "info", None, 1),
    ("Hier LEO, Patient hat einen Schlüsselsafe neben der Tür, Code 1234, kommen", "info", "zusatz", 1),
    ("Hier LEO, ihr übernehmt einen Folgeeinsatz, Adresse Hauptplatz 3 in Krems, kommen", "einsatz", None, 1),
    ("Hier LEO, Patient fährt ins UK Krems, kommen", "info", "ziel", 1),
    ("irgendwas mit dem Dings", "unklar", None, 1),
    ("Hier LEO, das NEF kommt zu euch, kommen", "info", "naKommt", 0.2),
    ("Hier LEO, wie ist eure Lage?", "lageAnfordern", None, 1),
    ("funkcheck, wie hört ihr mich?", "frage", "funkcheck", 1),
]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); logs = []
        A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8921/?debug"); A.wait_for_timeout(2500)
        for (t, art, thema, sicher) in FAELLE:
            r = A.evaluate("([t, s]) => window.__lw.funkAbsicht.absichtErkennen(t, { sicherheit: s, angesprochen: ['56/006', '56 6', 'RTW Tulln'] })", [t, sicher])
            ok = r["art"] == art and (thema is None or r.get("thema") == thema)
            if sicher < 0.35: ok = r["art"] == "unklar"
            check(ok, f"„{t}“ (Sicherheit {sicher}) → {json.dumps(r, ensure_ascii=False)}")
        print("\n".join(logs[:5])); b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
