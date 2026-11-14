# 0.104: Pilotenansicht neu, Status halten, Display „Gruppe aktiv“, Hubschrauber wieder übernehmen
import subprocess, sys, time, json, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8911", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
def status(A):
    return A.evaluate("() => { const f = Object.values(window.__lw.sim.state.fahrzeuge).find(x => x.pilot); return f ? f.status : null; }")
def pilot_heli(A):
    return A.evaluate("() => { const f = Object.values(window.__lw.sim.state.fahrzeuge).find(x => x.pilot); return f ? f.funkrufname : null; }")
def testmodus(A):
    A.evaluate("() => window.__lw.startseite && window.__lw.startseite.zeigen()"); A.wait_for_timeout(800)
    A.locator('[data-act="pilot"]').first.click(); A.wait_for_timeout(500)
    A.locator(".dlg-foot button", has_text="Testmodus").click(); A.wait_for_timeout(2500)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1600, "height": 1000}); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8911/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        testmodus(A)
        A.locator(".plt-wahl-b", has_text="Christophorus 2").first.click(); A.wait_for_timeout(800)
        if A.locator(".dlg").count(): A.keyboard.press("Escape"); A.wait_for_timeout(300)
        check(pilot_heli(A) == "99/002", "C2 gewählt")
        # Aufbau
        r = A.evaluate("""() => { const q = (s) => document.querySelector(s); const w = (s) => q(s) ? Math.round(q(s).getBoundingClientRect().width) : 0; const h = (s) => q(s) ? Math.round(q(s).getBoundingClientRect().height) : 0;
           return { funkMitte: !!q('.plt-mitte .plt-funk'), evMitte: !!q('.plt-mitte .plt-ev'), karteRechts: !!q('.plt-rechts .plt-map'), wetter: q('.plt-wx') ? q('.plt-wx').innerText : '', geraet: w('.plt-funk-geraet .fg'), karteH: h('.plt-kartewrap'), mitteW: w('.plt-mitte'), eingabe: !!q('.plt-funk input:not([type=checkbox]), .plt-funk textarea'), popHidden: q('.plt-funk-pop').hidden, display: q('.fg-zeilen').innerText }; }""")
        print("   ", r)
        check(r["funkMitte"] and r["evMitte"] and r["karteRechts"], "Aufbau: Funk und Einsatzverlauf in der Mitte, Karte rechts")
        check(r["geraet"] >= 500, f"Funkgerät groß ({r['geraet']} px)")
        lu = A.evaluate("() => { const r = document.querySelector('.plt-rechts').getBoundingClientRect(); const c = document.querySelector('.plt-rechts > :last-child').getBoundingClientRect(); return [Math.round(r.bottom - c.bottom), Math.round(document.querySelector('.plt-kartewrap').getBoundingClientRect().height)]; }")
        check(lu[0] < 40 and lu[1] >= 280, f"Karte füllt die Spalte nach unten (Rest unten {lu[0]} px, Karte {lu[1]} px)")
        check("°C" in r["wetter"] and "kt" in r["wetter"] and "QNH" in r["wetter"] and "Sicht" in r["wetter"], "Wetter & Hinweise ausführlich (Wind, Sicht, QNH)")
        ww = A.evaluate("() => [document.querySelector('.plt-wx').getBoundingClientRect().width, document.querySelector('.plt-rechts').getBoundingClientRect().width]")
        check(ww[0] > ww[1] - 40, f"Wetter so breit wie die Spalte ({ww})")
        check(not r["eingabe"], "keine Texteingabe beim Funk")
        check("TETRA" in r["display"] and "BOS" in r["display"] and "DISPOZONEN" not in r["display"], "Display: TETRA / BOS")
        check(r["popHidden"], "Funkverlauf zu Beginn zu")
        A.locator('[data-act="funk-verlauf"]').click(); A.wait_for_timeout(300)
        check(A.locator(".plt-funk-pop:not([hidden]) .plt-funk-verlauf").count() == 1, "Knopf „Verlauf“ öffnet den Funkverlauf als Fenster")
        A.screenshot(path=f"{S}/p104_1.png")
        A.locator('[data-act="funk-verlauf-zu"]').click(); A.wait_for_timeout(200)
        check(A.locator(".plt-funk-pop[hidden]").count() == 1, "Funkverlauf schließt")
        # Funk oben in der Mitte, Mikrofon so hoch wie das Gerät (nicht höher)
        r = A.evaluate("""() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); const g = q('.plt-funk-geraet .fg'), m = q('.plt-mikro'), f = q('.plt-funk'), e = q('.plt-einsatz');
            return { gh: Math.round(g.height), mh: Math.round(m.height), mw: Math.round(m.width), funkOben: f.top < e.top, rechts: Math.round(q('.plt-rechts').width), tipp: getComputedStyle(document.querySelector('.plt-ptt-tipp')).visibility }; }""")
        print("   ", r)
        check(r["funkOben"], "Funkgerät oben, darunter der Einsatz")
        check(r["mh"] <= r["gh"] + 2 and r["mh"] >= 0.8 * r["gh"], f"Handmikrofon fast so hoch wie das Gerät, nicht höher ({r['mh']} / {r['gh']})")
        check(r["rechts"] >= 480, f"rechte Spalte breiter ({r['rechts']} px)")
        check(r["tipp"] == "hidden", "Hinweis zur Sprechtaste versteckt")
        A.hover(".plt-mikro"); A.wait_for_timeout(700)
        check(A.evaluate("() => getComputedStyle(document.querySelector('.plt-ptt-tipp')).visibility") == "visible", "Hinweis beim Darüberfahren")
        A.screenshot(path=f"{S}/p104_1b.png")
        A.mouse.move(5, 500)
        # Schiebeschalter „Alles hören“
        v0 = A.evaluate("() => document.querySelector('.plt-f-alles').checked")
        A.locator(".plt-schalter").click(); A.wait_for_timeout(300)
        v1 = A.evaluate("() => document.querySelector('.plt-f-alles').checked")
        check(A.locator(".plt-schalter-bahn").count() == 1 and v1 != v0, "„Alles hören“ als Schiebeschalter")
        A.locator(".plt-schalter").click(); A.wait_for_timeout(200)
        # Spaltenbreite ziehen
        g = A.locator('.plt-griff[data-g="r"]').bounding_box()
        A.mouse.move(g["x"] + 3, g["y"] + 300); A.mouse.down(); A.mouse.move(g["x"] - 120, g["y"] + 300, steps=6); A.mouse.up(); A.wait_for_timeout(300)
        r2 = A.evaluate("() => Math.round(document.querySelector('.plt-rechts').getBoundingClientRect().width)")
        check(r2 > r["rechts"] + 80, f"rechte Spalte breiter ziehen ({r['rechts']} → {r2})")
        A.dblclick('.plt-griff[data-g="r"]'); A.wait_for_timeout(200)
        # Karte: Klick öffnet groß
        A.locator(".plt-kartewrap").click(position={"x": 200, "y": 200}); A.wait_for_timeout(600)
        hg = A.evaluate("() => Math.round(document.querySelector('.plt-kartewrap').getBoundingClientRect().height)")
        check(A.locator(".plt-karte-pop:not([hidden]) .plt-kartewrap").count() == 1 and hg > 600, f"Klick auf die Karte öffnet sie groß ({hg} px)")
        A.keyboard.press("Escape"); A.wait_for_timeout(300)
        check(A.locator(".plt-karte-pop[hidden]").count() == 1 and A.locator(".plt-kartenplatz .plt-kartewrap").count() == 1, "Esc: Karte wieder rechts")
        # Wetter groß
        A.locator(".plt-wx").click(); A.wait_for_timeout(500)
        check(A.locator(".wx-overlay").count() == 1, "Klick aufs Wetter öffnet das Wetter groß")
        A.screenshot(path=f"{S}/p104_wx.png")
        A.keyboard.press("Escape"); A.wait_for_timeout(300)
        if A.locator(".wx-overlay").count(): A.locator(".wx-zu").click(); A.wait_for_timeout(200)
        # Einstellungen
        check(A.locator('.plt-kopf [data-act="tasten"], .plt-kopf [data-act="handy"]').count() == 0, "Tasten und Handy nicht mehr oben")
        A.locator('[data-act="pilot-einst"]').click(); A.wait_for_timeout(300)
        n = A.locator(".plt-einst-b").count()
        check(n >= 4, f"Einstellungen: {n} Bereiche")
        A.locator(".plt-einst-b", has_text="Tasten").click(); A.wait_for_timeout(400)
        check(A.locator(".dlg").count() == 1, "Einstellungen → Tasten öffnet die Tastenbelegung")
        A.keyboard.press("Escape"); A.wait_for_timeout(300)
        while A.locator(".dlg").count(): A.keyboard.press("Escape"); A.wait_for_timeout(200)
        # Status halten: zu kurz → nichts
        A.evaluate("() => { window.__toene = []; }")
        # Flugwetter, damit der Status sich ändern kann
        A.evaluate("() => { const s = window.__lw.sim; s.state.wetter.lage = 'klar'; s.state.wetter.wind = 10; const f = Object.values(s.state.fahrzeuge).find(x => x.pilot); f.flugAbgemeldet = false; s.setStatus(f, 'freiWache'); s.emit(); }"); A.wait_for_timeout(400)
        st0 = status(A)
        A.locator(".plt-haupt").click(position={"x": 5, "y": 5}, force=True)
        A.keyboard.down("Digit6"); A.wait_for_timeout(700); A.keyboard.up("Digit6"); A.wait_for_timeout(2200)
        check(status(A) == st0, f"Taste 6 kurz: Status bleibt ({st0} → {status(A)})")
        A.keyboard.down("Digit6"); A.wait_for_timeout(1000)
        check(A.locator(".plt-st.haelt").count() == 1, "beim Halten zeigt der Knopf den Fortschritt")
        A.wait_for_timeout(1300); A.keyboard.up("Digit6"); A.wait_for_timeout(600)
        check(status(A) == "freiFunk", f"Taste 6 gehalten: Status 6 ({status(A)})")
        btn = A.locator('.plt-st[data-s="freiWache"]')
        bb = btn.bounding_box(); A.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
        A.mouse.down(); A.wait_for_timeout(500); A.mouse.up(); A.wait_for_timeout(2200)
        check(status(A) == "freiFunk", "Knopf 1 kurz: Status bleibt")
        A.mouse.down(); A.wait_for_timeout(2300); A.mouse.up(); A.wait_for_timeout(600)
        check(status(A) == "freiWache", f"Knopf 1 gehalten: Status 1 ({status(A)})")
        # Einsatz: Route auf der Karte, Ausschnitt mit allem
        A.locator('[data-act="test"]').click(); A.wait_for_timeout(400)
        A.locator(".plt-testmenue .plt-wahl-k").first.click(); A.wait_for_function("() => Object.values(window.__lw.sim.state.fahrzeuge).some(x => x.pilot && x.einsatzId)", timeout=30000); A.wait_for_timeout(6000)
        A.screenshot(path=f"{S}/p104_route.png")
        rr = A.evaluate("() => window.__pilotKarte ? window.__pilotKarte() : null")
        print("   route", rr)
        check(rr and rr["linie"] >= 2 and rr["drin"], f"Route eingezeichnet und ganz im Ausschnitt ({rr})")
        # Display „Gruppe aktiv“ mit ID, wenn ein Fahrzeug spricht
        r = A.evaluate("""async () => { const s = window.__lw.sim; const w = (ms) => new Promise(r => setTimeout(r, ms)); s.funkFestNach = 500; s.state.laeuft = true;
            s.funkMenschText(null, '75/001 von C2, kommen'); let txt = '', name = '', seite = '';
            for (let i = 0; i < 60; i++) { await w(150); const k = document.querySelector('.plt .fg-pop-kopf'); const pop = document.querySelector('.plt .fg-pop');
              if (pop && !pop.hidden && k.textContent === 'Gruppe aktiv') { txt = k.textContent; name = document.querySelector('.plt .fg-pop-name').textContent; seite = document.querySelector('.plt .fg-seite').innerText; break; } }
            return { txt, name, seite }; }""")
        print("   ", r)
        check(r["txt"] == "Gruppe aktiv" and re.match(r"ID: \d{4,}", r["name"] or ""), f"Display: „Gruppe aktiv“ und ID ({r['name']})")
        check("Option" in r["seite"] and "Ordner" in r["seite"], "rechts Option / Ordner")
        A.wait_for_timeout(300); A.screenshot(path=f"{S}/p104_2.png")
        idl = A.evaluate("() => { const m = window.__lw.sim; return null; }")
        # Hubschrauber wird nicht vergessen: Computer übernimmt → wieder übernehmen
        A.evaluate("() => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge).find(x => x.pilot); s.pilotAbgeben(f.id); }")
        A.wait_for_timeout(2500)
        check(pilot_heli(A) == "99/002", f"ohne Hubschrauber: der letzte wird von selbst wieder übernommen ({pilot_heli(A)})")
        # „Wechseln“: nicht von selbst
        A.locator('[data-act="wechseln"]').click(); A.wait_for_timeout(2500)
        print("   ", pilot_heli(A), A.locator(".plt-wahl-liste").count(), A.locator(".dlg").count(), A.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.textContent)"))
        check(pilot_heli(A) is None and A.locator(".plt-wahl-liste").count() == 1, "„Wechseln“: kein automatisches Übernehmen, Auswahl offen")
        A.locator(".plt-wahl-b", has_text="Christophorus 2").first.click(); A.wait_for_timeout(800)
        if A.locator(".dlg").count(): A.keyboard.press("Escape"); A.wait_for_timeout(300)
        # Testmodus verlassen und neu: C2 ist gleich wieder da
        A.locator('[data-act="verlassen"]').click(); A.wait_for_timeout(1200)
        testmodus(A); A.wait_for_timeout(1500)
        check(pilot_heli(A) == "99/002" and A.locator(".plt-wahl-liste").count() == 0, f"neuer Testmodus: C2 gleich übernommen ({pilot_heli(A)})")
        # schmales Fenster
        A.set_viewport_size({"width": 1180, "height": 860}); A.wait_for_timeout(500)
        A.screenshot(path=f"{S}/p104_3.png")
        ov = A.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 2")
        check(not ov, "schmal: kein waagrechtes Scrollen")
        check(not [l for l in logs if l.startswith("PAGEERROR")], f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER gesamt:", fails)
