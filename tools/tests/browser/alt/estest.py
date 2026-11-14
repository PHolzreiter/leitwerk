import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8797", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
def check(ok, w): print(("OK    " if ok else "FEHLER"), w)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A = ctx.new_page(); A.on("pageerror", lambda e: print("PAGEERROR", e))
        A.goto("http://localhost:8797/?debug"); A.wait_for_timeout(2500)
        A.click("[data-act=einstellungen]"); A.wait_for_timeout(600)
        nav = A.evaluate("() => [...document.querySelectorAll('.es-nav > *')].map(x => (x.classList.contains('es-gruppe') ? '# ' : '  ') + x.textContent.trim())")
        print("\n".join(nav))
        A.screenshot(path=f"{S}/es_darstellung.png")
        for sid in ["telefon", "ki", "fahrzeuge", "zeiten", "rettungsmittel", "karten"]:
            A.click(f".es-punkt[data-seite={sid}]"); A.wait_for_timeout(500)
            sicht = A.evaluate("() => { const q = [...document.querySelectorAll('.es-quelle')].find(x => !x.hidden); return [...q.querySelectorAll('.set-sec')].filter(s => !s.hidden).map(s => s.querySelector('h3')?.textContent) .concat(q.querySelector('.tb-title') ? ['Tabelle: ' + q.querySelector('.tb-title').textContent] : []); }")
            print(sid, "→", sicht)
            A.screenshot(path=f"{S}/es_{sid}.png")
        A.fill(".es-suche", "nachtflug"); A.wait_for_timeout(300)
        print("Suche nachtflug:", A.evaluate("() => [...document.querySelectorAll('.es-punkt')].map(x => x.textContent)"))
        A.fill(".es-suche", "dienstplan"); A.wait_for_timeout(300)
        print("Suche dienstplan:", A.evaluate("() => [...document.querySelectorAll('.es-punkt')].map(x => x.textContent)"))
        A.fill(".es-suche", ""); A.wait_for_timeout(200)
        # Fahrzeug bearbeiten: Dienstplan-Editor
        A.click(".es-punkt[data-seite=fahrzeuge]"); A.wait_for_timeout(400)
        A.fill(".es-q-daten .tb-search", "57/411"); A.wait_for_timeout(400)
        A.locator(".es-q-daten tbody tr").first.dblclick(); A.wait_for_timeout(600)
        if A.locator(".dp-editor").count() == 0:
            A.locator(".es-q-daten tbody tr button").first.click(); A.wait_for_timeout(600)
        check(A.locator(".dp-editor").count() == 1, "Dienstplan-Editor im Fahrzeug-Dialog")
        print("   Schichten:", A.locator(".dp-zeile").count(), A.evaluate("() => document.querySelector('.dp-zusammen')?.textContent"))
        A.screenshot(path=f"{S}/es_fz_dialog.png")
finally:
    srv.terminate()
