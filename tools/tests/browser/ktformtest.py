# KT-Hotline und Überstellung als Formular: alle Felder, „?“ fragt den Anrufer, Vorschläge aus dem Gesagten
# Aufruf: python3 ktformtest.py <arbeitsordner> <web-build> [bilder-ordner]
import subprocess, sys, time
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]; BILD = sys.argv[3] if len(sys.argv) > 3 else None
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8933", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
J = "window.__lw.sim"
P = ".lw-panel[data-panel=abfrage], .dv-groupview"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = ctx.new_page(); logs = []
        A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8933/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate(f"() => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(9,0,0,0); s.state.zeit=d.getTime(); s.call('start'); }}")
        for art in ["kt", "sek"]:
            kid = A.evaluate(f"async (art) => {{ const s={J}; const k = art === 'sek' ? await s.generiereSek('hotline') : await s.generiereKt('hotline'); s.ktAnrufAnnehmen(k.id); window.__lw.panelZeigen('abfrage'); return k.id; }}", art)
            A.wait_for_timeout(2500)
            n = A.locator(".a-form .ff").count()
            check(n >= 8, f"{art}: Formular mit {n} Feldern")
            check(A.locator(".a-frage").count() == 0, f"{art}: keine Einzelfrage mehr")
            # Abholort fragen
            vor = A.evaluate(f"(id) => {J}.ktAuftrag(id).anruf.gespraech.length", kid)
            A.locator(".a-form .ff", has_text="abgeholt").first.locator(".ff-frage").click()
            A.wait_for_timeout(4000)
            nach = A.evaluate(f"(id) => {J}.ktAuftrag(id).anruf.gespraech.length", kid)
            check(nach > vor, f"{art}: „?“ stellt die Frage ({vor} → {nach} Nachrichten)")
            A.locator(".a-form .ff", has_text="Patient").first.locator(".ff-frage").click(); A.wait_for_timeout(4000)
            A.locator(".a-form .ff", has_text="Zeit").first.locator(".ff-frage").click() if A.locator(".a-form .ff", has_text="Wann").count() == 0 else A.locator(".a-form .ff", has_text="Wann").first.locator(".ff-frage").click()
            A.wait_for_timeout(4000)
            gespr = A.evaluate(f"(id) => {J}.ktAuftrag(id).anruf.gespraech.map(m => m.von + ': ' + m.text).join(' | ')", kid)
            print("    Gespräch:", gespr[:400])
            nv = A.locator(".a-form .ff-vor").count()
            texte = A.evaluate("() => [...document.querySelectorAll('.a-form .ff-vor')].map(x => x.innerText.replace(/\\s+/g, ' '))")
            print("    Vorschläge:", texte)
            check(nv >= 1, f"{art}: {nv} Vorschläge aus dem Gesagten")
            if BILD:
                A.screenshot(path=f"{BILD}/ktform_{art}.png")
                A.evaluate("() => window.__lw.panelZeigen('abfrage')")
                el = A.locator(".k-Abfrage .fe").first
                if el.count(): el.screenshot(path=f"{BILD}/ktform_{art}_fenster.png")
            if nv:
                A.locator(".a-form .ff-kopf .kn").click(); A.wait_for_timeout(800)
                d = A.evaluate(f"(id) => {{ const k={J}.ktAuftrag(id); return [k.d.patient.name, k.d.von && k.d.von.label, k.d.abholung || k.d.termin]; }}", kid)
                print("    übernommen:", d)
                check(A.locator(".a-form .ff-vor").count() == 0, f"{art}: alle Vorschläge übernommen")
            # Eingabe direkt im Feld
            feld = A.locator(".a-form .ff", has_text="Grund").first.locator(".ff-ein")
            if feld.count():
                feld.fill("Testgrund Kontrolle"); feld.press("Enter"); A.wait_for_timeout(500)
                g = A.evaluate(f"(id) => {J}.ktAuftrag(id).d.grund", kid)
                check(g == "Testgrund Kontrolle", f"{art}: Eingabe im Feld übernommen ({g})")
            # Auswahl direkt im Feld
            A.locator(".a-form .ff", has_text="liegen").first.locator(".ff-opt").last.click(); A.wait_for_timeout(500)
            l = A.evaluate(f"(id) => {J}.ktAuftrag(id).d.lage", kid)
            check(l == "liegend", f"{art}: Auswahl im Feld ({l})")
            A.evaluate(f"(id) => {J}.ktAnrufBeenden(id)", kid); A.wait_for_timeout(500)
        print("\n".join(logs[:5])); check(not logs, "keine Fehler auf der Seite")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
