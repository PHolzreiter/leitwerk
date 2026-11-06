# v0.78: Zuweisung nach Symptom, Altersgruppe und Dringlichkeit
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8879", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
# Hilfsfunktion: Top-3 Häuser (offen) für Symptom/Dringlichkeit/Alter an Ort und Zeit
TOP = """([ort, sym, d, a, zeit]) => { const s = window.__lw.sim; s.state.zeit = zeit;
  const id = `avn:${sym}:${d}:${a}`;
  const v = s.khFuer({ lat: ort[0], lon: ort[1] }, id, d === 30, a !== 'e');
  return v.filter(x => !x.zu).slice(0, 3).map(x => x.h.id + ':' + x.eignung); }"""
KREMS = [48.4106, 15.6141]
STP = [48.2047, 15.6256]
def zeit(A, j, m, t, h):
    return A.evaluate(f"() => new Date({j}, {m - 1}, {t}, {h}, 0).getTime()")
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8879/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); window.__lw.sim.settings.khGrundAktiv = false; window.__lw.sim.state.khBelegung = {}; }")
        # --- Symptomliste und Suche
        n = A.evaluate("() => window.__lw.zuweisung.SYMPTOME.length")
        check(n == 121, f"121 Symptome ({n})")
        such = A.evaluate("() => ['herzinfarkt', 'stemi', 'atemnot', 'schenkelhals', 'krampf', 'wehen'].map(q => window.__lw.zuweisung.symptomSuche(q, 3).map(x => x.id))")
        print("   ", such)
        check("st_hebungsinfarkt_oder_stemi_aequivalent" in such[0], "Suche über Synonym (Herzinfarkt → STEMI)")
        check(such[2][0] == "atemnot" and such[3][0] == "schenkelhalsfraktur", "Suche nach Name")
        # --- Krems: PCI Mo–Fr 7–15, Mittwoch rund um die Uhr
        mi_nacht = zeit(A, 2026, 10, 28, 22)   # Mittwoch 22 Uhr
        do_nacht = zeit(A, 2026, 10, 29, 22)   # Donnerstag 22 Uhr
        do_tag = zeit(A, 2026, 10, 29, 10)     # Donnerstag 10 Uhr
        r1 = A.evaluate(TOP, [KREMS, "st_hebungsinfarkt_oder_stemi_aequivalent", 20, "e", mi_nacht])
        r2 = A.evaluate(TOP, [KREMS, "st_hebungsinfarkt_oder_stemi_aequivalent", 20, "e", do_nacht])
        r3 = A.evaluate(TOP, [KREMS, "st_hebungsinfarkt_oder_stemi_aequivalent", 20, "e", do_tag])
        print("    STEMI Krems Mi 22:", r1, "Do 22:", r2, "Do 10:", r3)
        check(r1 and r1[0] == "kh002:passend", "STEMI Mittwoch Nacht: Krems")
        check(r2 and r2[0] != "kh002:passend" and "kh002:passend" not in r2, "STEMI Donnerstag Nacht: nicht Krems")
        check(r3 and r3[0] == "kh002:passend", "STEMI Donnerstag 10 Uhr: Krems")
        # --- Schockraum: SHT braucht Neurochirurgie (nicht Krems), Polytrauma ohne SHT geht nach Krems
        sht = A.evaluate(TOP, [KREMS, "schaedelhirntrauma", 30, "e", do_tag])
        poly = A.evaluate(TOP, [KREMS, "polytrauma_ohne_sht", 30, "e", do_tag])
        print("    SHT:", sht, "Polytrauma:", poly)
        check(sht and not sht[0].startswith("kh002") and sht[0].endswith("passend"), "SHT Schockraum: nicht Krems (keine Neurochirurgie)")
        check(poly and poly[0] == "kh002:passend", "Polytrauma ohne SHT: Krems")
        # Schockraum-Art: Haus nur mit Trauma-Schockraum nimmt keinen internistischen Schockraum
        art = A.evaluate("""() => { const s = window.__lw.sim; const st = window.__lw.store;
          const h = st.list('hospitals').filter(x => (x.plaetze?.schockraum_trauma ?? 0) > 0 && !(x.plaetze?.schockraum_intern) && !(x.plaetze?.schockraum))[0];
          if (!h) return null;
          const v = s.khFuer({ lat: h.lat, lon: h.lon }, 'avn:sepsis:30:e', true, false);
          const w = s.khFuer({ lat: h.lat, lon: h.lon }, 'avn:polytrauma_ohne_sht:30:e', true, false);
          return { h: h.id, intern: v.some(x => x.h.id === h.id && x.eignung === 'passend'), trauma: w.some(x => x.h.id === h.id && x.eignung === 'passend') }; }""")
        print("    Schockraum-Art:", art)
        check(art is None or (not art["intern"]), "Trauma-Schockraum nimmt keinen internistischen Schockraum")
        # --- Kinder
        kind = A.evaluate(TOP, [KREMS, "fieber", 10, "k", do_tag])
        print("    Fieber Kleinkind:", kind)
        check(kind and kind[0] == "kh002:passend", "Kleinkind mit Fieber: Krems (Kinderabteilung)")
        # --- Abdeckung: jedes Symptom mit jeder Dringlichkeit bekommt ein Haus
        luecken = A.evaluate("""([ort, zeit]) => { const s = window.__lw.sim; s.state.zeit = zeit; const out = [];
          for (const x of window.__lw.zuweisung.SYMPTOME) for (const d of x.dringlichkeiten) for (const a of ['k', 'e']) {
            const v = s.khFuer({ lat: ort[0], lon: ort[1] }, `avn:${x.id}:${d}:${a}`, d === 30, a !== 'e');
            if (!v.some(y => !y.zu)) out.push(`${x.id}:${d}:${a}`);
            else if (!v.some(y => !y.zu && y.eignung === 'passend')) out.push(`(rf) ${x.id}:${d}:${a}`);
          } return out; }""", [STP, do_tag])
        print("    ohne passendes Haus:", len(luecken), luecken[:20])
        check(not [x for x in luecken if not x.startswith("(rf)")], "jede Zuweisung bekommt ein offenes Haus")
        # --- Plätze: Herzkatheter, Schockraum
        res = A.evaluate("() => [window.__lw.zuweisung.zuweisungRessourcen('avn:st_hebungsinfarkt_oder_stemi_aequivalent:20:e', 'passend', false), window.__lw.zuweisung.zuweisungRessourcen('avn:polytrauma_ohne_sht:30:e', 'passend', false), window.__lw.zuweisung.zuweisungRessourcen('avn:fieber:10:k', 'passend', true)]")
        print("   ", res)
        check(res[0][0] == ["herzkatheter"] and "schockraum_trauma" in res[1][0] and res[2][0] == ["kindernotaufnahme"], "Plätze passend zur Zuweisung")
        # --- Engine: Besatzung meldet Symptom + Dringlichkeit
        r = A.evaluate("""async (ort) => { const s = window.__lw.sim; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          s.settings.wetterAktiv = false;
          const out = [];
          for (let i = 0; i < 6; i++) {
            const kc = window.__lw.store.list('codes')[i * 7 % window.__lw.store.list('codes').length];
            const e = s.erstelleEinsatz({ lat: ort[0] + i * 0.01, lon: ort[1], adresse: 'Test', code: { code: kc.code, name: kc.name ?? 'Test', stufe: kc.stufe ?? 'B' } });
            e.adresse = { lat: e.wahr.lat, lon: e.wahr.lon, label: 'Test' };
            out.push({ v: s.verdacht(e), d: s.diagnose(e), sicht: e.wahr.lage?.patienten[0]?.sichtung, alter: e.wahr.lage?.patienten[0]?.alter });
          }
          return out; }""", STP)
        print("   ", r)
        check(all(x["v"].startswith("avn:") for x in r), "Einsatz bekommt eine Zuweisung (Symptom, Dringlichkeit, Alter)")
        ok = True
        for x in r:
            d = int(x["v"].split(":")[2])
            want = {"rot": 30, "gelb": 20, "gruen": 10}.get(x["sicht"])
            if want == 30 and d < 20: ok = False
            if want == 10 and d > 20: ok = False
        check(ok, "Dringlichkeit folgt der Sichtung")
        # --- Einsatzmaske: Symptom suchen → Alter → Dringlichkeit → drei Häuser → buchen
        A.evaluate("() => window.__lw.dock && window.__lw.testAnordnung && window.__lw.testAnordnung()")
        eid = A.evaluate("""(ort) => { const s = window.__lw.sim; s.state.zeit = Date.now();
          const kc = window.__lw.store.list('codes')[0];
          const e = s.erstelleEinsatz({ lat: ort[0], lon: ort[1], adresse: 'Test', code: { code: kc.code, name: kc.name ?? 'Test', stufe: kc.stufe ?? 'B' } });
          e.adresse = { lat: ort[0], lon: ort[1], label: 'Krems Test' }; s.emit && s.emit(); window.__lw.sel.waehle('einsatz', e.id); return e.id; }""", KREMS)
        A.wait_for_timeout(800)
        A.fill(".zw-suche", "brustschmerz")
        A.wait_for_timeout(200)
        tr = A.locator(".zw-treffer").all_inner_texts()
        print("    Treffer:", tr[:4])
        check(len(tr) > 0, "Symptomsuche in der Maske")
        A.keyboard.press("Enter")
        A.wait_for_timeout(200)
        chip = A.locator(".zw-chip").inner_text()
        check(len(chip) > 3, f"Symptom gewählt ({chip.splitlines()[0] if chip else ''})")
        A.click("[data-zw-alter=kind]")
        A.wait_for_timeout(100)
        dis = A.evaluate("() => [...document.querySelectorAll('[data-zw-dring]')].map(b => b.disabled)")
        A.click("[data-zw-dring]:not([disabled])")
        A.wait_for_timeout(200)
        karten = A.locator(".zw-khk").all_inner_texts()
        print("    Häuser:", karten, "gesperrt:", dis)
        check(1 <= len(karten) <= 3, "bis zu drei Häuser zur Auswahl")
        A.locator(".zw-khk").last.click()
        A.click(".zw-row .btn")
        A.wait_for_timeout(300)
        kh = A.evaluate("(id) => { const e = window.__lw.sim.einsatz(id); return e.kh; }", eid)
        print("    gebucht:", kh)
        check(kh and kh["grund"].startswith("avn:") and kh["grund"].endswith(":j"), "Buchung mit Symptom, Dringlichkeit und Altersgruppe")
        A.screenshot(path=f"{S}/v78maske.png")
        # --- Fenster KH-Aufnahme: Krems, STEMI dringend ausschalten
        A.evaluate("() => window.__lw.zuweisung.khAufnahmeOeffnen('kh002')")
        A.wait_for_timeout(800)
        z = A.locator(".kha-z").count()
        n = A.locator(".kha-s:not(.kha-skopf)").count()
        print("    Zeiten-Zeilen:", z, "Symptome:", n, A.locator(".kha-z").first.inner_text().replace("\n", " | ") if z else "")
        check(z > 0 and n == 121, "Fenster KH-Aufnahme zeigt Zeiten und alle Symptome")
        q = A.evaluate("() => [...document.querySelectorAll('.kha-z')].map(z => z.dataset.einr + '=' + z.querySelector('.kha-q').textContent)")
        print("   ", q)
        check(any("fb_herzkatheter=von Paul" in x for x in q), "Herkunft der Zeiten sichtbar")
        sel = "[data-sym=st_hebungsinfarkt_oder_stemi_aequivalent][data-d='20']"
        vor = A.locator(sel).inner_text()
        A.click(sel); A.wait_for_timeout(200); A.click(sel); A.wait_for_timeout(300)
        nach = A.locator(sel).inner_text()
        h = A.evaluate("() => window.__lw.store.get('hospitals', 'kh002').zuweisungAus")
        r4 = A.evaluate(TOP, [KREMS, "st_hebungsinfarkt_oder_stemi_aequivalent", 20, "e", do_tag])
        print("    vorher", vor, "nachher", nach, h, r4)
        check(h == ["st_hebungsinfarkt_oder_stemi_aequivalent:20"] and "kh002:passend" not in r4, "Symptom einzeln ausschalten wirkt auf die Vorschläge")
        A.click("text=Ganzes Haus zurück auf Vorgabe"); A.wait_for_timeout(300)
        h = A.evaluate("() => window.__lw.store.get('hospitals', 'kh002').zuweisungAus ?? null")
        check(h is None, "Zurück auf Vorgabe")
        A.locator(".kha-plan").first.fill("Mo–Fr 07:00–15:00"); A.locator(".kha-plan").first.press("Enter"); A.locator(".kha-plan").first.dispatch_event("change"); A.wait_for_timeout(300)
        q2 = A.evaluate("() => document.querySelector('.kha-z .kha-q').textContent")
        check(q2 == "von dir geändert", f"geänderte Zeit wird markiert ({q2})")
        A.click("[data-zeit-vorgabe]"); A.wait_for_timeout(300)
        A.screenshot(path=f"{S}/v78aufnahme.png")
        t0 = time.time()
        l = A.evaluate("() => window.__lw.zuweisung.luecken(window.__lw.store.get('hospitals', 'kh002'), Date.now()).map(x => x.was + ': ' + x.zeiten.slice(0, 3).join(', '))")
        print(f"    Lücken um Krems ({time.time() - t0:.1f}s):", len(l), l[:12])
        check(time.time() - t0 < 20, "Lücken-Prüfung läuft schnell genug")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER gesamt:", fails) if fails else print("alles OK")
