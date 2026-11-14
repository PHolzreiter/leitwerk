import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8791", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(c, m):
    global fails
    print(("OK     " if c else "FEHLER ") + m)
    if not c: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        ctx = b.new_context(viewport={"width": 1500, "height": 950}, permissions=["microphone"])
        ctx.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({einfuehrung: true}))")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8791/?debug"); A.wait_for_timeout(1500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        A.evaluate("() => { window.__got = null; window.__lw.sprachTest.erkenner = async (a, h) => { window.__got = [a.length, h.slice(0, 30)]; await new Promise(r => setTimeout(r, 300)); return 'Ist der Patient wach?'; }; }")
        A.click(".lw-panel[data-panel=einsatzliste] >> text=+ Test"); A.click(".ctx-menu.test >> text=Notfall"); A.wait_for_timeout(1200)
        A.click(".tel-row.st-klingelt:has-text(\"Notruf 144\") .btn.primary"); A.wait_for_timeout(2500)
        check(A.locator(".anruf-form .mikro-knopf").count() >= 1, "Mikrofon-Knopf im Abfrage-Fenster")
        A.locator(".lw-panel[data-panel=abfrage] .anruf-form").screenshot(path=f"{S}/shots13/spr_form.png")
        # Sprechtaste halten
        A.keyboard.down("F2"); A.wait_for_timeout(500)
        A.screenshot(path=f"{S}/shots13/spr_hoert.png")
        check(A.locator(".sprech-anzeige.hoert").is_visible(), "Anzeige „Sprich jetzt“")
        A.wait_for_timeout(1200); A.keyboard.up("F2"); A.wait_for_timeout(2500)
        got = A.evaluate("() => window.__got")
        print("   Audio:", got)
        check(got and 16000 * 1.2 < got[0] < 16000 * 2.5, "Aufnahme mit 16 kHz an die Erkennung")
        check(got and got[1].startswith("Notruf 144"), "Hinweis für die Erkennung mitgeschickt")
        v = A.inner_text(".lw-panel[data-panel=abfrage] .anruf-verlauf")
        check("Ist der Patient wach?" in v, "Gesprochene Frage im Gespräch abgeschickt")
        # Mausknopf
        A.evaluate("() => window.__lw.sprachTest.erkenner = async () => 'Wie alt ist der Patient?'")
        box = A.locator(".anruf-form .mikro-knopf").first.bounding_box()
        A.mouse.move(box["x"] + 5, box["y"] + 5); A.mouse.down(); A.wait_for_timeout(1200); A.mouse.up(); A.wait_for_timeout(2500)
        v = A.inner_text(".lw-panel[data-panel=abfrage] .anruf-verlauf")
        check("Wie alt ist der Patient?" in v, "Mikrofon-Knopf (Maus) funktioniert")
        # Funk-Namen glätten
        f = A.evaluate("() => import('/assets/index.js').then(() => null)")
        # Einstellungen
        A.click("[data-act=einstellungen]"); A.wait_for_timeout(500)
        sec = A.locator(".set-sec:has(h3:text-is('Sprache'))")
        check(sec.count() == 1, "Abschnitt Sprache in Persönlich")
        sec.screenshot(path=f"{S}/shots13/spr_einst.png")
        A.locator(".set-sec:has(h3:text-is('Sprache')) .schalter").nth(2).click(); A.wait_for_timeout(300)
        A.keyboard.press("Escape"); A.wait_for_timeout(300)
        check(A.locator(".anruf-form .mikro-knopf").first.is_hidden(), "Spracheingabe aus → Knopf weg")
        print("ERR", logs)
        b.close()
finally: srv.terminate()
print("FEHLER:", fails)
