import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8794", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(c, m):
    global fails
    print(("OK     " if c else "FEHLER ") + m)
    if not c: fails += 1
INIT = "(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        ctx = b.new_context(viewport={"width": 1500, "height": 950}, permissions=["microphone"])
        ctx.add_init_script(INIT)
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8794/?debug"); A.wait_for_timeout(1500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay, .dlg-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; s.funkFestNach = 1200; s.state.laeuft = true; }")
        A.evaluate("() => window.__lw.zeige('funk')"); A.wait_for_timeout(300); A.evaluate("() => { const b = document.querySelector('.funk-fenster .funk-modus [data-m=text]'); if (b) b.click(); }"); A.wait_for_timeout(500)
        ui = A.evaluate("() => { const r = document.querySelector('.funk-fenster'); return { chat: !!r.querySelector('.funk-chat'), eingaben: r.querySelectorAll('input[type=text]').length, knoepfe: [...r.querySelectorAll('button')].map(b => b.textContent.trim()), info: !!r.querySelector('.funk-info-box') }; }")
        print("  ", ui)
        check(ui["chat"] and ui["eingaben"] == 1, "ein Chat, eine Eingabe")
        geraet = A.evaluate("() => { const r = document.querySelector('.funk-fenster .fg'); return r ? [r.querySelector('.fg-gruppe span').textContent, r.querySelector('.fg-stat').textContent, r.querySelector('.fg-bild').naturalWidth] : null; }")
        print("  ", geraet)
        check(geraet and geraet[0] == "RD-NOE-03" and geraet[1] == "Frei auf Wache" and geraet[2] > 0, "Funkgerät: Display mit RD-NOE-03 und „Frei auf Wache“, Bild geladen")
        check(not any(k in ui["knoepfe"] for k in ["Lagemeldung?", "Antworten", "📻 Rufen", "Verstanden, ENDE"]), "keine Schnellknöpfe / Antworten-Knöpfe mehr")
        check(ui["info"], "(i) mit Hilfe")
        w = "const w = (ms) => new Promise(r => setTimeout(r, ms)); const s = window.__lw.sim; const G = () => s.state.funkGespraeche || []; const fz = (n) => Object.values(s.state.fahrzeuge).find(f => f.funkrufname === n); const frei = async () => { for (let i = 0; i < 80 && s.funkKanalSpricht(null); i++) await w(150); };"
        # 1) rufen per Eingabe, dann ohne Rufnamen weiter
        A.fill(".funk-fenster .funk-eine input", "75/001 von LEO, kommen"); A.press(".funk-fenster .funk-eine input", "Enter"); A.wait_for_timeout(6000)
        r = A.evaluate("async () => { " + w + " await frei(); const g = G().find(x => x.fzId === fz('75/001').id && x.status !== 'ende'); return g && [g.status, g.sprueche.map(x => x.von + ': ' + x.text)]; }")
        print("  ", r)
        check(r and r[0] == "offen" and len(r[1]) >= 2, "Ruf über die eine Eingabe – Fahrzeug meldet sich")
        A.fill(".funk-fenster .funk-eine input", "Wie ist euer Status, kommen"); A.press(".funk-fenster .funk-eine input", "Enter"); A.wait_for_timeout(4500)
        r = A.evaluate("async () => { " + w + " await frei(); const g = G().find(x => x.fzId === fz('75/001').id && x.status !== 'ende'); return g && g.sprueche.map(x => x.von + ': ' + x.text); }")
        print("  ", r)
        check(r and any("Status" in x for x in r) and r[-1].startswith("75/001"), "ohne Rufnamen geht der Spruch an 75/001, Antwort kommt")
        # Chat zeigt alles
        chat = A.inner_text(".funk-fenster .funk-chat")
        check("75/001 von LEO" in chat and "Status" in chat, "alles steht im Chat")
        # 2) anderes Fahrzeug rufen unterbricht
        r = A.evaluate("async () => { " + w + " await frei(); const id = s.funkLeo('75/002 von LEO, kommen'); await w(6000); await frei(); const a = G().find(x => x.fzId === fz('75/001').id); const b = G().find(x => x.id === id); return [a.status, b.status, b.sprueche.length]; }")
        print("  ", r)
        check(r[0] in ("ende", "wartet") and r[1] == "offen", "Ruf an 75/002 beendet das Gespräch mit 75/001")
        # 3) Ende
        r = A.evaluate("async () => { " + w + " await frei(); const id = s.funkLeo('Verstanden, Ende'); return G().find(x => x.id === id).status; }")
        check(r == "ende", "„Verstanden, Ende“ beendet")
        r = A.evaluate("async () => { " + w + " await frei(); try { s.funkLeo('Wie ist der Zustand?'); return 'kein Fehler'; } catch (e) { return e.message; } }")
        check("zuerst rufen" in r, f"ohne Gespräch: Hinweis zuerst rufen ({r})")
        # 4) 1 Minute Stille beendet
        r = A.evaluate("async () => { " + w + " await frei(); const id = s.funkLeo('75/003 von LEO, kommen'); await w(6000); await frei(); const g = G().find(x => x.id === id); const st1 = g.status; g.echtLetzt = Date.now() - 50000; g.sprichtBis = 0; await w(900); const st2 = g.status; g.echtLetzt = Date.now() - 61000; await w(900); return [st1, st2, g.status]; }")
        check(r == ["offen", "offen", "ende"], f"nach über 1 Minute Stille ist das Gespräch aus ({r})")
        # 5) Fahrzeug ruft, keine Antwort: Wiederholung nach 30 s, 1, 3 Minuten
        r = A.evaluate("async () => { " + w + " for (const g of G()) if (g.status !== 'ende') { g.status = 'ende'; g.ausstehend = null; } await frei(); const f = fz('75/004'); s.fzRuft(f, null, 'info', 'Fahrzeug wieder einsatzbereit'); await w(1500); const g = G().find(x => x.fzId === f.id && x.status !== 'ende'); const st = [g.status, g.sprueche[g.sprueche.length-1].text]; g.echtLetzt = Date.now() - 13000; g.sprichtBis = 0; await w(900); const d1 = Math.round((g.echtNaechster - Date.now()) / 1000); g.echtNaechster = Date.now(); await w(1500); g.echtLetzt = Date.now() - 13000; g.sprichtBis = 0; await w(900); const d2 = Math.round((g.echtNaechster - Date.now()) / 1000); g.echtNaechster = Date.now(); await w(1500); g.echtLetzt = Date.now() - 13000; g.sprichtBis = 0; await w(900); const d3 = Math.round((g.echtNaechster - Date.now()) / 1000); return [st, d1, d2, d3, g.rufe, g.status]; }")
        print("  ", r)
        check(r[0][0] == "ruft" and 27 <= r[1] <= 30 and 57 <= r[2] <= 60 and 177 <= r[3] <= 180, "Wiederholung nach 30 s, 1 min, 3 min")
        # Antwort „Hier LEO, kommen“ auf den Ruf (Fahrzeug ruft gerade)
        r = A.evaluate("async () => { " + w + " const g = G().find(x => x.fzId === fz('75/004').id && x.status !== 'ende'); g.echtNaechster = Date.now(); for (let i = 0; i < 30 && g.status !== 'ruft'; i++) await w(200); await frei(); s.funkLeo('Hier LEO, kommen'); await w(2500); await frei(); return [g.status, g.sprueche.slice(-2).map(x => x.von + ': ' + x.text)]; }")
        print("  ", r)
        check(r[0] in ("offen", "ende") and "einsatzbereit" in " ".join(r[1]), "„Hier LEO, kommen“ antwortet dem rufenden Fahrzeug")
        # 6) kein anderes Fahrzeug ruft während eines Gesprächs; Notfall darf zwischen zwei Sprüchen
        r = A.evaluate("async () => { " + w + " for (const g of G()) if (g.status !== 'ende') { g.status = 'ende'; g.ausstehend = null; } await frei(); const id = s.funkLeo('75/005 von LEO, kommen'); await w(6000); await frei(); s.fzRuft(fz('75/006'), null, 'info', 'Fahrzeug wieder einsatzbereit'); await w(2500); const andere = G().find(x => x.fzId === fz('75/006').id && x.status !== 'ende'); const st = andere.status; s.fzRuft(fz('75/007'), null, 'nachforderung', 'Patient reanimationspflichtig, benötigen Notarzt'); await w(1500); await frei(); await w(900); const n = G().find(x => x.fzId === fz('75/007').id && x.status !== 'ende'); const a = G().find(x => x.id === id); return [st, n.status, n.sprueche.map(x => x.text), a.status]; }")
        print("  ", r)
        check(r[0] == "wartet", "normaler Ruf wartet, solange mit 75/005 gefunkt wird")
        check(r[1] == "ruft" and any("dringend" in t for t in r[2]) and r[3] != "offen", "Notfall: „LEO von 75/007, dringend, kommen“ unterbricht zwischen zwei Sprüchen")
        # 7) Sprechtaste: wartet, solange jemand spricht – nur ein Warteplatz
        r = A.evaluate("async () => { " + w + " for (const g of G()) if (g.status !== 'ende') { g.status = 'ende'; g.ausstehend = null; } await frei(); const g = G()[0]; g.status = 'offen'; g.sprichtBis = Date.now() + 2500; const a = s.funkMensch(true); const warte = !!s.state.funkWartet; await w(3200); const jetzt = s.state.funkSendet && s.state.funkSendet.pid; s.funkMensch(false); g.status = 'ende'; return [a, warte, !!jetzt, s.state.funkSendet]; }")
        print("  ", r)
        check(r[0]["wartet"] and r[1] and r[2] and r[3] is None, "Sprechtaste wartet bis zum Ende des Spruchs, dann ist man dran")
        # 8) Sprechtaste (🎙) allein: gesprochen, erkannt, Ruf geht hinaus; während ein Fahrzeug spricht: „Warten“
        A.evaluate("() => { const s = window.__lw.sim; for (const g of s.state.funkGespraeche) if (g.status !== 'ende') { g.status = 'ende'; g.ausstehend = null; g.sprichtBis = 0; } window.__lw.sprachTest.erkenner = async () => 'sieben fünf null null acht von Leo kommen'; }")
        box = A.locator(".funk-fenster .fg-ptt").bounding_box()
        A.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); A.mouse.down(); A.wait_for_timeout(700)
        lage = A.inner_text(".funk-fenster .fg-pop")
        A.wait_for_timeout(700); A.mouse.up(); A.wait_for_timeout(5500)
        r = A.evaluate("() => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge).find(x => x.funkrufname === '75/008'); const g = s.state.funkGespraeche.find(x => x.fzId === f.id); return g ? [g.status, g.sprueche.map(x => x.von + ': ' + x.text)] : null; }")
        print("   ", lage, r)
        check("Senden" in lage or "SENDEN" in lage, f"beim Drücken: Display zeigt „Senden“ ({lage!r})")
        check(r and r[1][0] == "LEO: 75/008 von LEO kommen" and r[0] == "offen", "gesprochener Ruf „sieben fünf null null acht“ → 75/008, Fahrzeug meldet sich")
        A.evaluate("() => { const s = window.__lw.sim; const g = s.state.funkGespraeche[0]; g.sprichtBis = Date.now() + 4000; }")
        A.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); A.mouse.down(); A.wait_for_timeout(600)
        lage1 = A.inner_text(".funk-fenster .fg-pop")
        A.wait_for_timeout(4200)
        lage2 = A.inner_text(".funk-fenster .fg-pop")
        A.mouse.up(); A.wait_for_timeout(1500)
        print("   ", lage1, "|", lage2)
        check(("Warten" in lage1 or "WARTEN" in lage1) and "75008" in lage1 and ("Senden" in lage2 or "SENDEN" in lage2), f"während das Fahrzeug spricht: Warten – danach bist du dran ({lage1!r} | {lage2!r})")
        # Gruppen: stumm schalten
        A.evaluate("() => document.querySelector('.funk-gr').click()"); A.wait_for_timeout(300)
        r = A.evaluate("() => [document.querySelector('.funk-gr').textContent, document.querySelectorAll('.funk-z.stumm').length > 0]")
        check(r[0].startswith("🔇") and r[1], "Gruppe stumm: Text bleibt (grau)")
        A.evaluate("() => document.querySelector('.funk-gr').click()")
        A.screenshot(path=f"{S}/shots13/v101_funk.png")
        A.locator(".funk-fenster").screenshot(path=f"{S}/shots13/v101_funk_fenster.png")
        A.hover(".funk-info"); A.wait_for_timeout(300)
        A.locator(".funk-fenster").screenshot(path=f"{S}/shots13/v101_funk_info.png")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
