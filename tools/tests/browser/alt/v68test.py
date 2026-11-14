# v0.68: Ortung-Anzeige beim Adressfeld, Tastatur bei Kapitelwahl und Alter
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8870", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8870/?debug"); A.wait_for_timeout(3000)
        A.evaluate("async () => { const r = await fetch('abf_test.json'); window.__lw.codesystemLaden(await r.json()); }"); A.wait_for_timeout(500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("() => window.__lw.sim.call('neuesSpiel', Date.now())"); A.wait_for_timeout(1500)
        eid = A.evaluate("async () => { const s=window.__lw.sim; let e; for (let i=0;i<10 && !e;i++){ const x = await s.generiere(); if (x?.anruf) e = x; } await s.call('anrufAnnehmen', e.id); return e.id; }")
        A.wait_for_timeout(600); A.evaluate("() => window.__lw.panelZeigen('abfrage')"); A.wait_for_timeout(1000)
        # Ortung mit Cursor im Adressfeld
        A.focus('.abfrage input[placeholder^="Straße Hausnummer"]')
        A.evaluate("(id) => window.__lw.sim.call('ortung', id)", eid)
        A.wait_for_timeout(52000)
        o = A.evaluate("(id) => ({ engine: window.__lw.sim.einsatz(id).anruf.ortung.status, zeile: document.querySelector('.abfrage .abf-ortung-zeile')?.textContent ?? '', fokus: document.activeElement?.placeholder ?? '' })", eid)
        print("   ", o)
        check(o["engine"] == "fertig" and "±" in o["zeile"] and "läuft" not in o["zeile"] and o["fokus"].startswith("Straße"), "Ortung erscheint beim Adressfeld, auch wenn dort getippt wird")
        A.evaluate("() => document.activeElement?.blur()"); A.wait_for_timeout(400)
        # Wer ruft an → Taste 1 → Kapitel-Suche hat den Cursor
        reihe = []
        for _ in range(6):
            fk = A.evaluate("() => document.querySelector('.frage.fokus')?.dataset.id"); reihe.append(fk)
            if fk == "__kapitel": break
            A.keyboard.press("1"); A.wait_for_timeout(900)
        print("    Reihenfolge:", reihe)
        f = A.evaluate("() => ({ cls: document.activeElement?.className ?? '', fokus: document.querySelector('.frage.fokus')?.dataset.id })")
        check("kapitel-suche" in f["cls"] and f["fokus"] == "__kapitel", f"nach „Wer ruft an“ steht der Cursor in der Kapitel-Suche {f}")
        vor = A.evaluate("(id) => window.__lw.sim.einsatz(id).anruf.gespraech.filter(m => m.von === 'leitstelle').length", eid)
        A.keyboard.type("brust"); A.keyboard.press("Space"); A.wait_for_timeout(1500)
        g = A.evaluate("(id) => { const a = window.__lw.sim.einsatz(id).anruf; const l = a.gespraech.filter(m => m.von === 'leitstelle'); return { n: l.length, letzte: l.at(-1)?.text ?? '', wert: document.querySelector('.kapitel-suche')?.value, erster: document.querySelector('.kapitel-opt.erster')?.textContent ?? '' }; }", eid)
        print("   ", g)
        check(g["n"] == vor + 1 and any(w in g["letzte"].lower() for w in ("passiert", "los ist", "was ist")) and g["wert"] == "brust", "Leertaste stellt „Was ist passiert?“, im Feld kein Leerzeichen")
        A.keyboard.press("Enter"); A.wait_for_timeout(1200)
        k = A.evaluate("(id) => ({ kap: window.__lw.sim.einsatz(id).anruf.kapitel, fokus: document.querySelector('.frage.fokus')?.dataset.id })", eid)
        check(bool(k["kap"]) and k["kap"] in g["erster"], f"Enter wählt den obersten Treffer: Kapitel {k['kap']} ({g['erster'][:40]}), weiter bei {k['fokus']}")
        # bis zum Alter: offene Fragen davor mit 1 beantworten
        for _ in range(4):
            if A.evaluate("() => document.querySelector('.frage.fokus')?.dataset.id") == "alter": break
            A.keyboard.press("1"); A.wait_for_timeout(700)
        a = A.evaluate("() => ({ fokus: document.querySelector('.frage.fokus')?.dataset.id, cls: document.activeElement?.className ?? '' })")
        check(a["fokus"] == "alter" and "zahl" in a["cls"], f"beim Alter steht der Cursor im Zahlenfeld {a}")
        vor = A.evaluate("(id) => window.__lw.sim.einsatz(id).anruf.gespraech.filter(m => m.von === 'leitstelle').length", eid)
        A.keyboard.press("Space"); A.wait_for_timeout(1200)
        n = A.evaluate("(id) => window.__lw.sim.einsatz(id).anruf.gespraech.filter(m => m.von === 'leitstelle').length", eid)
        A.evaluate("() => document.querySelector('.frage.fokus input.zahl')?.focus()")
        A.keyboard.type("47"); A.keyboard.press("Enter"); A.wait_for_timeout(1000)
        r = A.evaluate("(id) => ({ alter: window.__lw.sim.einsatz(id).anruf.antworten.alter, fokus: document.querySelector('.frage.fokus')?.dataset.id })", eid)
        check(n == vor + 1 and r["alter"] == 47 and r["fokus"] != "alter", f"Alter: Leertaste fragt, Enter übernimmt 47 und geht weiter ({r})")
        # nicht aus dem Fragefeld des Gesprächs reißen
        A.focus('.anruf-form input'); A.keyboard.type("Hallo")
        A.evaluate("(id) => window.__lw.sim.call('abfrageSetze', id, 'geschlecht', null)", eid); A.wait_for_timeout(800)
        z = A.evaluate("() => ({ ph: document.activeElement?.placeholder ?? '', v: document.activeElement?.value })")
        check(z["ph"].startswith("Frage an den Anrufer") and z["v"] == "Hallo", "freie Frage tippen: Cursor bleibt im Fragefeld")
        check(not logs, f"keine Fehler im Programm {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print(f"FEHLER: {fails}")
