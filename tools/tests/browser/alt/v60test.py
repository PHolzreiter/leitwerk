# v0.60: Nebenfenster erst nach der Startseite, Multiplayer ohne Bildlauf (Kachelleiste wird schmäler), Ablage in Dokumente/LeitWerk
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8855", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        A = ctx.new_page()
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("""localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}));
          localStorage.setItem('leitwerk.fenster', JSON.stringify(['fenster-2']));
          localStorage.setItem('leitwerk.layout.v2.fenster-2', JSON.stringify({grid:{root:{type:'branch',data:[]}},panels:{}}));""")
        A.goto("http://localhost:8855/?debug&start"); A.wait_for_timeout(4000)
        check(len(ctx.pages) == 1, f"beim Start nur das Hauptmenü ({len(ctx.pages)} Fenster)")
        # --- Multiplayer: kein Bildlauf, Kachelleiste schmäler
        vor = A.evaluate("() => { const r = [...document.querySelectorAll('.st-kachel')].map(k => k.getBoundingClientRect()); return [Math.round(r[0].top), Math.round(r[r.length-1].right)]; }")
        A.click('.st-seg[data-seg="modus"] button[data-v="multi"]')
        werte = []
        for i in range(12):
            A.wait_for_timeout(60); werte.append(A.evaluate("() => Math.round([...document.querySelectorAll('.st-kachel')].pop().getBoundingClientRect().right)"))
        A.wait_for_timeout(600)
        zwischen = [w for w in werte if 1170 < w < 1570]
        mitte = zwischen[0] if zwischen else werte[-1]
        nach = A.evaluate("() => { const st = document.querySelector('.st'); const r = [...document.querySelectorAll('.st-kachel')].map(k => k.getBoundingClientRect()); const re = document.querySelector('.st-rechts').getBoundingClientRect(); return { top: Math.round(r[0].top), right: Math.round(r[r.length-1].right), rechtsLinks: Math.round(re.left), scroll: st.scrollHeight - st.clientHeight, multiUnten: Math.round(document.querySelector('.st-multi').getBoundingClientRect().bottom) }; }")
        check(nach["scroll"] <= 1, f"kein Bildlauf der Seite ({nach['scroll']} px)")
        check(nach["top"] == vor[0], f"Kachelleiste bleibt unten ({vor[0]} → {nach['top']})")
        check(nach["right"] < nach["rechtsLinks"], f"Kachelleiste endet vor der rechten Spalte ({nach['right']} < {nach['rechtsLinks']})")
        check(vor[1] > mitte > nach["right"], f"wird schrittweise schmäler (Animation): {vor[1]} → {mitte} → {nach['right']}")
        check(nach["multiUnten"] <= 950, f"Lobby passt auf den Bildschirm (unten {nach['multiUnten']})")
        A.screenshot(path=f"{S}/v60_multi.png")
        A.click('.st-seg[data-seg="modus"] button[data-v="solo"]'); A.wait_for_timeout(900)
        zur = A.evaluate("() => Math.round([...document.querySelectorAll('.st-kachel')].pop().getBoundingClientRect().right)")
        check(abs(zur - vor[1]) <= 2, f"Solo: wieder volle Breite ({zur})")
        # --- Start: jetzt erst das zweite Fenster
        with ctx.expect_page(timeout=8000) as neu:
            A.click(".st-start")
        check(len(ctx.pages) == 2, "nach dem Start geht das zweite Fenster auf")
        # --- Ablage: Abfrageschema landet im Ordner Abfrageschema
        A.evaluate("async () => { const r = await fetch('/abf_test.json'); window.__lw.codesystemLaden(await r.json()); }"); A.wait_for_timeout(800)
        l = A.evaluate("async () => (await window.__lw.ablage.ablageListe('Abfrageschema/RD')).map(x => x.datei)")
        check("test.json" in l, f"Abfrageschema im Ordner Abfrageschema: {l}")
        # ab v0.73: einmalig aufräumen – Schema und Datei weg, danach nicht mehr
        A.evaluate("async () => window.__lw.ablage.abgleichen(true)"); A.wait_for_timeout(500)
        l2 = A.evaluate("async () => (await window.__lw.ablage.ablageListe('Abfrageschema')).map(x => x.datei)")
        check(not A.evaluate("() => !!window.__lw.store.schemaRoh") and not l2, f"einmaliges Aufräumen: Schema und Datei entfernt ({l2})")
        A.evaluate("async () => { const r = await fetch('/abf_test.json'); window.__lw.codesystemLaden(await r.json()); }"); A.wait_for_timeout(800)
        A.evaluate("async () => window.__lw.ablage.abgleichen(true)"); A.wait_for_timeout(500)
        check(A.evaluate("() => !!window.__lw.store.schemaRoh"), "beim zweiten Start bleibt ein neu geladenes Schema")
        # CSV-Import landet unter Daten
        A.evaluate("async () => window.__lw.ablage.ablageSpeichern('Töne', 'klingel.wav', new Uint8Array([82,73,70,70]))")
        t = A.evaluate("async () => (await window.__lw.ablage.ablageListe('Töne')).map(x => [x.datei, x.groesse])")
        check(["klingel.wav", 4] in t, f"Binärdateien (Töne): {t}")
        check(A.evaluate("() => window.__lw.ablage.ablageName('../../böse/../x.csv')") == "x.csv", "Dateinamen ohne Pfade")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
