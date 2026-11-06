import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8798", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(c, m):
    global fails
    print(("OK     " if c else "FEHLER ") + m)
    if not c: fails += 1
INIT = "(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]); ctx = b.new_context(viewport={"width": 1500, "height": 950}, permissions=["microphone"]); ctx.add_init_script(INIT)
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8798/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay, .dlg-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.state.laeuft = true; window.__lw.zeige('funk'); }"); A.wait_for_timeout(500)
        r = A.evaluate("() => { const f = document.querySelector('.funk-fenster'); return [f.querySelector('.funk-text-teil').hidden, !!f.querySelector('.funk-modus [data-m=sprechen].primary')]; }")
        check(r[0] is True and r[1], "zu Beginn „Sprechen“: kein Textfeld, kein Verlauf")
        A.click(".funk-fenster .funk-modus [data-m=text]"); A.wait_for_timeout(200)
        r = A.evaluate("() => { const f = document.querySelector('.funk-fenster'); return [f.querySelector('.funk-text-teil').hidden, f.querySelector('.funk-eine input').offsetParent !== null, f.querySelector('.funk-chat').offsetParent !== null]; }")
        check(r == [False, True, True], f"„Text“: Eingabezeile und Verlauf da ({r})")
        # zwei Großeinsätze: 09 und 10
        r = A.evaluate("""async () => { const s = window.__lw.sim; const w = (ms) => new Promise(r => setTimeout(r, ms));
          const mach = async () => { const e = await s.probeFall('brustschmerz', '0'); s.state.einsaetze.push(e); e.gs = null; e.wahr.gs = e.wahr.gs || { stufe: 1 }; s['gsStart'](e); return e; };
          const e1 = await mach(); const e2 = await mach();
          return [e1.gs && e1.gs.gruppe, e2.gs && e2.gs.gruppe, s.offeneGruppen(), s.sprechgruppeName(null), s.sprechgruppeName('gs'), s.sprechgruppeName('gs2'), e1.id, e2.id]; }""")
        print("  ", r)
        check(r[0] == "gs" and r[1] == "gs2" and r[2] == [None, "gs", "gs2"], "zweiter gleichzeitiger Großeinsatz bekommt RD-NOE-10")
        check(r[3:6] == ["RD-NOE-03", "RD-NOE-09", "RD-NOE-10"], "Gruppennamen RD-NOE-03/09/10")
        e1, e2 = r[6], r[7]
        # Steuerkreuz: durch 03, 09, 10
        namen = []
        for i in range(4):
            namen.append(A.inner_text(".funk-fenster .fg-gruppe span"))
            A.click(".funk-fenster .fg-kreuz.rechts"); A.wait_for_timeout(150)
        print("  ", namen)
        check(namen == ["RD-NOE-03", "RD-NOE-09", "RD-NOE-10", "RD-NOE-03"], "Steuerkreuz rechts schaltet 03 → 09 → 10 → 03")
        A.click(".funk-fenster .fg-kreuz.links"); A.wait_for_timeout(150)
        check(A.inner_text(".funk-fenster .fg-gruppe span") == "RD-NOE-03", "Steuerkreuz links zurück auf 03")
        # Lautstärken: eigene Gruppe voll, andere 50 %, dringend voll
        r = A.evaluate("() => { const L = window.__lw.funkTest; return [L.gruppeLaut(null), L.gruppeLaut('gs'), L.gruppeLaut('gs', true)]; }")
        check(r == [1, 0.5, 1], f"Sprechgruppe voll, andere 50 %, dringend voll ({r})")
        # Ruf an ein Fahrzeug in einer anderen Gruppe: Hinweis, keine Antwort
        r = A.evaluate("""async ([e1]) => { const s = window.__lw.sim; const w = (ms) => new Promise(r => setTimeout(r, ms));
          const fz = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '75/003'); const e = s.einsatz(e1); e.fahrzeuge.push(fz.id); fz.einsatzId = e.id;
          let fehler = ''; try { s.funkLeo('75/003 von LEO, kommen', null); } catch (x) { fehler = x.message; } await w(5000);
          const g = s.state.funkGespraeche.filter(x => x.fzId === fz.id); const antwort = g.some(x => x.sprueche.some(y => y.von !== 'LEO'));
          s.funkLeo('75/003 von LEO, kommen', 'gs'); await w(5000); const g2 = s.state.funkGespraeche.find(x => x.fzId === fz.id && x.status !== 'ende');
          return { fehler, antwort, danach: g2 && g2.sprueche.map(y => y.von + ': ' + y.text), kanal: g2 && g2.kanal }; }""", [e1])
        print("  ", r)
        check("RD-NOE-09" in r["fehler"] and not r["antwort"], "Ruf in der falschen Gruppe: Hinweis, Fahrzeug antwortet nicht")
        check(r["danach"] and len(r["danach"]) >= 2 and r["kanal"] == "gs", "in der richtigen Gruppe (09) meldet es sich")
        # Telefon: Funk stumm
        A.evaluate("() => window.__lw.zeige('telefon')"); A.wait_for_timeout(300)
        r = A.evaluate("""async () => { const s = window.__lw.sim; const L = window.__lw.funkTest; const t = document.querySelector('.tel-funk-stumm input'); t.click();
          const e = await s.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; s.state.einsaetze.push(e); const im = L.gruppeLaut(null); e.anruf.status = 'beendet'; const nach = L.gruppeLaut(null); t.click(); return [!!t, im, nach]; }""")
        check(r == [True, 0, 1], f"Schalter im Telefon: Funk stumm beim Telefonieren ({r})")
        # Tasten frei belegen
        A.evaluate("() => window.__lw.einstellungen && window.__lw.einstellungen('anrufe')")
        A.click("[data-act=einstellungen]"); A.wait_for_timeout(500)
        A.evaluate("() => { const b = [...document.querySelectorAll('.es-nav button, .es-nav a, nav button')].find(x => /Anrufe/.test(x.textContent)); if (b) b.click(); }"); A.wait_for_timeout(500)
        felder = A.locator(".taste-feld-b")
        n = felder.count()
        r1 = None
        if n >= 2:
            felder.nth(1).click(); A.wait_for_timeout(100)
            warte = felder.nth(1).inner_text()
            A.keyboard.press("KeyQ"); A.wait_for_timeout(200)
            r1 = [warte, felder.nth(1).inner_text(), A.evaluate("() => window.__lw.funkTest.sprachPrefs().funkTaste")]
        print("  ", n, r1)
        check(n >= 5 and r1 and "drücken" in r1[0] and r1[1] == "Q", f"Funktaste frei belegt: draufklicken, Taste drücken ({r1})")
        check(not A.evaluate("() => [...document.querySelectorAll('.lw-panel')].some(p => /Funk Großeinsatz/.test(p.textContent))") and A.evaluate("() => document.querySelectorAll('.fg').length") == 1, "nur ein Funkgerät (kein zweiter Funk-Reiter)")
        r = A.evaluate("""async () => { const s = window.__lw.sim; const g = s.state.funkGespraeche.find(x => x.status !== 'ende' && !x.ausstehend) || s.state.funkGespraeche[0]; g.ausstehend = null; g.sprichtBis = Date.now() + 20000; const vor = s.funkKanalSpricht(g.kanal || null); s.funkFzFertig(g.id); await new Promise(r => setTimeout(r, 300)); return [vor, s.funkKanalSpricht(g.kanal || null)]; }""")
        check(r == [True, False], f"Stimme meldet ihr Ende: Kanal sofort frei ({r})")
        check(not logs, f"keine Seitenfehler {logs[:2]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
