# Verteilung nach Versorgungsstufe: Einstellung sichtbar, Verteilung trifft die Statistik
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8889", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails=0; logs=[]
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails+=1
ZIEL={'Telemedizin':9.9,'BLS grün':1.2,'BLS gelb':19.0,'BLS rot':14.4,'ALS grün':17.0,'ALS gelb':12.6,'ALS orange':6.9,'ALS rot':0.7,'BLS/ALS aufwertbar':8.9,'Akuttransport grün':8.6}
VERT = """(n) => { const L = window.__lw, s = L.sim, schema = L.store.schema; const z = {}; let fehl = 0;
  for (let i = 0; i < n; i++) { s.state.zeit = Date.parse('2026-0' + (1 + (i % 9)) + '-1' + (i % 9) + 'T' + String(i % 24).padStart(2, '0') + ':30:00');
    let r = null; try { r = s.fallAusKatalog(schema); } catch (e) { fehl++; continue; } if (!r) { fehl++; continue; }
    const c = L.store.list('codes').find(x => x.code === r.code.code); const k = c ? c.kategorie : '?'; z[k] = (z[k] || 0) + 1; }
  return { z, fehl }; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto(f"http://localhost:8889/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; st.aufkommenStufe = 'realistisch'; window.__lw.store.setSettings(st); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        r = A.evaluate(VERT, 2000); t = sum(r["z"].values())
        ist = {k: r["z"].get(k, 0) / t * 100 for k in ZIEL}
        print("   ", {k: round(v, 1) for k, v in ist.items()})
        check(r["fehl"] == 0, f"jeder Notruf bekommt einen Fall ({r['fehl']} ohne)")
        check(all(abs(ist[k] - ZIEL[k]) <= max(2.5, ZIEL[k] * 0.3) for k in ZIEL), "Versorgungsstufen ≈ Statistik 2025")
        # Schwere-Modus: wie bisher
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.verteilungNach = 'schwere'; window.__lw.store.setSettings(st); }")
        r2 = A.evaluate(VERT, 600); t2 = sum(r2["z"].values())
        check(r2["fehl"] == 0 and t2 == 600, "Modus Schwere läuft weiter")
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.verteilungNach = undefined; window.__lw.store.setSettings(st); }")
        # eingebautes Codesystem (ohne Akuttransport): läuft ohne Fehler
        # Einstellungen sichtbar
        A.click('#steuerleiste [data-act="einstellungen"]'); A.wait_for_timeout(800)
        A.click('.es-punkt[data-seite="aufkommen"]'); A.wait_for_timeout(400)
        check(A.locator(".auf-modus").is_visible() and A.locator(".auf-stufe").is_visible(), "Umschalter Grafik/Tabelle und Voreinstellung")
        check(A.locator(".auf-reihe").count() == 14, f"14 Reihen (11 Stufen, KT, Überstellungen, ACN): {A.locator('.auf-reihe').count()}")
        check(A.locator(".set-table.stunden").count() == 0 or not A.locator(".set-table.stunden").first.is_visible(), "keine Tabelle im Grafik-Modus")
        gu = A.locator('.auf-reihe[data-reihe="rd:Großunfall"]').inner_text()
        check("0,0017" in gu or "0,0018" in gu, f"Großunfall ≈ 0,0017 % ({gu!r})")
        info = A.locator(".auf-info").inner_text(); print("   ", info)
        check("NÖ-03" in info and "Notfälle" in info, "Zusammenfassung für die Funkgruppe")
        A.click('.auf-reihe[data-reihe="rd:ALS rot"]'); A.wait_for_timeout(200)
        box = A.locator(".auf-svg").bounding_box()
        x14 = box["x"] + box["width"] * (14.5 / 24); x16 = box["x"] + box["width"] * (16.5 / 24); y = box["y"] + box["height"] * 0.3
        A.mouse.move(x14, y); A.mouse.down(); A.mouse.move(x16, y, steps=8); A.mouse.up(); A.wait_for_timeout(200)
        A.locator(".auf").screenshot(path=f"{S}/v89_grafik.png")
        pct = A.locator('.auf-reihe[data-reihe="rd:ALS rot"] .auf-pct').inner_text()
        check(float(pct.replace(" %", "").replace(",", ".")) > 2, f"ALS rot nach dem Ziehen höher ({pct})")
        A.click('.auf-reihe[data-reihe="acn"]'); A.wait_for_timeout(200)
        check("ACN" in A.locator(".auf-titel").inner_text(), "ACN in der Grafik einstellbar")
        A.click('.auf-modus [data-wert="tabelle"]'); A.wait_for_timeout(300)
        check(A.locator(".auf-tabelle table.stunden").is_visible() and A.locator(".auf-schwere input").count() == 3 and "ACN" in A.locator(".auf-tabelle table.stunden").inner_text(), "Tabelle: Stunden mit ACN-Spalte und Schwere")
        A.locator(".auf").screenshot(path=f"{S}/v89_tabelle.png")
        A.click('.auf-modus [data-wert="grafik"]'); A.wait_for_timeout(200)
        txt = A.evaluate("() => document.querySelector('.es-q-simulation')?.textContent || ''")
        check("Funkgruppe (TETRA)" not in txt and "Einsätze in Nachbarzonen" in txt, "Funkgruppe raus, Nachbarzonen im Aufkommen")
        check(A.locator(".auf-stufe button").count() == 3 and "Realistisch" in A.locator(".auf-stufe").inner_text() and "Stressig" in A.locator(".auf-stufe").inner_text(), "Voreinstellungen Realistisch/Standard/Stressig")
        # Generator: Aufkommen je Stunde aus den Kurven × Anteil der Funkgruppe
        GEN = """(a) => { const s = window.__lw.sim; const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = true; st.aufkommenStufe = a.v; st.rdAktiv = a.rd; st.stufenStunden = undefined; st.verteilungNach = undefined; window.__lw.store.setSettings(st);
            const z = {}; let n = 0; const orig = s.generiere.bind(s); s.generiere = async (k) => { n++; z[s.stufeWunsch] = (z[s.stufeWunsch] || 0) + 1; return null; };
            s.state.hilfe = undefined; s.state.zeit = Date.parse('2026-10-20T10:00:00'); for (let i = 0; i < 3600 * 20; i++) s.runGenerator(1000);
            s.generiere = orig; st.generatorAktiv = false; st.rdAktiv = true; window.__lw.store.setSettings(st); return { n, z, fg: s.funkgruppe().id }; }"""
        r = A.evaluate(GEN, {"v": "realistisch", "rd": True}); print("   ", r)
        # 10–11 Uhr ganz NÖ ≈ 787/Tag × 6,1 % ≈ 48/h; Funkgruppe-Anteil ~15 % → ≈ 7/h → 20 h ≈ 145
        check(80 < r["n"] < 230, f"Realistisch: Aufkommen 10 Uhr in der Funkgruppe plausibel ({r['n']} in 20 Stunden)")
        r3 = A.evaluate(GEN, {"v": "stressig", "rd": True}); print("   ", r3["n"])
        check(r3["n"] > r["n"] * 1.4 and r3["z"].get("ALS rot", 0) > r["z"].get("ALS rot", 0), f"Stressig: mehr Notfälle, mehr ALS rot ({r3['n']})")
        r4 = A.evaluate(GEN, {"v": "standard", "rd": False})
        check(r4["n"] == 0, f"RD aus: keine neuen Notfälle ({r4['n']})")
        # Zeitraffer springt bei neuem Notruf auf 1×
        tp = A.evaluate("""async () => { const s = window.__lw.sim; s.setTempo(8); await s.generiere('stabil'); return s.state.tempo; }""")
        check(tp == 1, f"Zeitraffer bei neuem Notruf auf 1× ({tp})")
        # Steuerleiste: kleine Schalter RD/KT/SEK/ACN
        A.keyboard.press("Escape"); A.wait_for_timeout(300)
        check(A.locator("#steuerleiste .sl-arten button").count() == 4, "Steuerleiste: Schalter RD/KT/SEK/ACN")
        A.click('#steuerleiste .sl-arten [data-art="sek"]'); A.wait_for_timeout(200)
        aus = A.evaluate("() => window.__lw.store.settings.sekAktiv")
        cl = A.locator('#steuerleiste .sl-arten [data-art="sek"]').get_attribute("class") or ""
        check(aus is False and "an" not in cl.split(), f"SEK ausgeschaltet ({aus})")
        A.click('#steuerleiste .sl-arten [data-art="sek"]'); A.wait_for_timeout(200)
        check(A.evaluate("() => window.__lw.store.settings.sekAktiv") is True, "SEK wieder ein")
        A.locator("#steuerleiste").screenshot(path=f"{S}/v91_leiste.png")
        for l in logs: print(l)
        check(not logs, "keine Seitenfehler")
finally:
    srv.terminate()
print("FEHLER:", fails)
sys.exit(1 if fails else 0)
