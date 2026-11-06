# v0.76: RD und KT/SEK getrennt; Fahrzeugsuche; KT/SEK-Fahrzeugwahl (Alarmieren/Vormerken, zu früh, Mehrfachtransport); Fahrzeug-Info auf der Karte
import subprocess, sys, time, json, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8876", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
J = "window.__lw.sim"
KTO = "Krankentransport_Sekundärtransporte"
STEP = """const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const schritt = async (fz) => { while (fz.phase === 'routing') await sleep(20); s.state.zeit = Math.max(s.state.zeit, fz.phaseEnde ?? s.state.zeit); s.updateVehicle(fz, s.state.zeit); while (fz.phase === 'routing') await sleep(20); };"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8876/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate(f"() => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(9,0,0,0); s.state.zeit=d.getTime(); }}")
        # --- Aufräumen beim Start: alte gemischte Dateien weg, Unterordner bleiben
        r = A.evaluate(f"""async () => {{ const a = window.__lw.ablage;
          await a.ablageSpeichern('Abfrageschema', 'alt.json', '{{}}'); await a.ablageSpeichern('Codelisten', 'alt.csv', 'Code');
          await a.ablageSpeichern('Abfrageschema/RD', 'bleibt.json', '{{}}');
          const vorher = window.__lw.store.codesGetrennt;
          await a.abgleichen(true);
          return {{ vorher, nachher: window.__lw.store.codesGetrennt, root: (await a.ablageListe('Abfrageschema')).length + (await a.ablageListe('Codelisten')).length, rd: (await a.ablageListe('Abfrageschema/RD')).length }}; }}""")
        print("   ", r)
        check(r["nachher"] and r["root"] == 0 and r["rd"] == 1, f"einmalig: alte gemischte Dateien entfernt, neue Ordner bleiben ({r})")
        A.evaluate("async () => window.__lw.ablage.ablageLoeschen('Abfrageschema/RD', 'bleibt.json')")
        # --- KT-/SEK-Satz getrennt hochladen (eigene Codes = eingebaute, umbenannt)
        A.evaluate(f"""async () => {{ const kt = (await (await fetch('/abf_test.json')).json()).kt;
          await window.__lw.ablage.ablageSpeichern('Codelisten/{KTO}', 'Echt KT.json', JSON.stringify({{ codes: kt.codes }})); }}""")
        A.evaluate(f"() => {J}.call('start')"); A.wait_for_timeout(1000); A.evaluate(f"() => {J}.call('pause')")
        A.evaluate("() => window.__lw.startseite.zeigen()"); A.wait_for_timeout(900)
        A.click('.st [data-act="einstellungen"]'); A.wait_for_timeout(800)
        A.click('[data-seite="codes"]'); A.wait_for_timeout(800)
        A.click('[data-act-codes="saetze"]'); A.wait_for_timeout(900)
        check(A.locator('[data-bereich="rd"]').count() == 1 and A.locator('[data-bereich="kt"]').count() == 1, "Fenster mit zwei Bereichen: RD und KT/SEK")
        check(A.locator('[data-bereich="kt"] .cs-satz', has_text="Echt KT").count() == 1 and A.locator('[data-bereich="rd"] .cs-satz', has_text="Echt KT").count() == 0, "KT-Satz steht nur bei KT/SEK")
        A.locator('[data-bereich="kt"] .cs-satz', has_text="Echt KT").locator("button", has_text="Verwenden").click(); A.wait_for_timeout(800)
        st = A.evaluate("() => ({ kt: window.__lw.store.ktSatzRoh?.name, n: window.__lw.store.ktSatzRoh?.codes?.length, rdStd: window.__lw.store.schemaIstStandard })")
        check(st["kt"] == "Echt KT" and st["n"] == 136 and st["rdStd"], f"KT/SEK-Satz aktiv, RD bleibt eingebaut ({st})")
        codes = A.evaluate(f"""async () => {{ const s={J}; const out=[]; for (let i=0;i<6;i++) {{ const k=await s.generiereSek('online'); if(k) out.push(k.d.code); }} return out; }}""")
        check(all(c and re.match(r"^SEK-96[KBD]", c) for c in codes), f"Überstellungen mit den Codes des KT/SEK-Satzes {codes}")
        # Editor speichert in die KT/SEK-Ordner
        A.click('[data-bereich="kt"] [data-kt-editor]'); A.wait_for_timeout(800)
        A.fill('.kte input[name="satzname"]', "Editor KT")
        A.locator(".kte-dlg .dlg-foot .btn.primary").click(); A.wait_for_timeout(1500)
        f = A.evaluate(f"""async () => {{ const a = window.__lw.ablage; return {{ c: (await a.ablageListe('Codelisten/{KTO}')).map(x=>x.datei), q: (await a.ablageListe('Abfrageschema/{KTO}')).map(x=>x.datei), rd: (await a.ablageListe('Abfrageschema/RD')).length }}; }}""")
        print("   ", f)
        check("Editor KT.json" in f["c"] and "Editor KT.json" in f["q"] and f["rd"] == 0, "Editor: Codes und Abfrage in den KT/SEK-Ordnern, nichts bei RD")
        check(A.evaluate("() => window.__lw.store.ktSatzRoh?.name") == "Editor KT", "Editor-Satz aktiv")
        A.screenshot(path=f"{S}/v76_saetze.png")
        A.locator(".dlg-foot .btn", has_text="Schließen").last.click(); A.wait_for_timeout(300)
        A.keyboard.press("Escape"); A.wait_for_timeout(200)
        A.evaluate("() => document.querySelectorAll('.st').forEach(x => x.remove())"); A.wait_for_timeout(300)
        # --- RD: Fahrzeugsuche ohne „/“
        eid = A.evaluate(f"""async () => {{ const s={J}; const e = s.erstelleEinsatz({{ lat: 48.4106, lon: 15.6034, adresse: 'Krems, Südtiroler Platz', code: {{code:'TEST', name:'Test', stufe:'stabil'}} }}); e.adresse = {{ lat: 48.4106, lon: 15.6034, label: 'Krems, Südtiroler Platz' }}; s.emit(); return e.id; }}""")
        A.evaluate("(id) => window.__lw.sel.waehle('einsatz', id)", eid); A.wait_for_timeout(2500)
        ziel = A.evaluate(f"""() => {{ const l = Object.values({J}.state.fahrzeuge).filter(f => f.funkrufname.includes('/') && !{J}.verfuegbar(f)); return (l[0] ?? Object.values({J}.state.fahrzeuge).find(f => f.funkrufname.includes('/'))).funkrufname; }}""")
        q = ziel.replace("/", "")
        A.fill(".mask-box .fz-suche", q); A.wait_for_timeout(400)
        treffer = A.evaluate("() => [...document.querySelectorAll('.mask-box .sugg .sugg-row b')].map(b => b.textContent)")
        check(ziel in treffer, f"RD-Suche „{q}“ findet {ziel} ({treffer[:4]})")
        A.fill(".mask-box .fz-suche", "NEF"); A.wait_for_timeout(300)
        n = A.evaluate("() => document.querySelectorAll('.mask-box .sugg .sugg-row').length")
        check(n >= 2, f"Suche nach Typ NEF ({n} Treffer)")
        A.fill(".mask-box .fz-suche", ""); A.wait_for_timeout(200)
        # --- KT/SEK: Liste, Suche, Alarmieren/Vormerken
        kid = A.evaluate(f"async () => (await {J}.generiereSek('online')).id")
        A.evaluate(f"(id) => {J}.call('ktSetze', id, {{ sofort: false, sek: {{ arzt: false, monitoring: false, beatmet: false, inkubator: false, instabil: false, zusage: 'ja', bit: false }} }})", kid)
        A.evaluate("(id) => window.__lw.sel.waehle('kt', id)", kid); A.wait_for_timeout(2500)
        rows = A.locator(".kt-vorschlaege .kt-vs").count()
        btn = A.evaluate("() => [...document.querySelectorAll('.kt-vorschlaege .kt-vs button')].map(b => b.textContent)")
        check(rows >= 2 and "Alarmieren" in btn and "Vormerken" in btn, f"SEK: Vorschlagsliste mit Alarmieren/Vormerken ({rows} Fahrzeuge)")
        nef = A.evaluate(f"() => Object.values({J}.state.fahrzeuge).find(f => f.rmTyp === 'NEF' && {J}.verfuegbar(f)).funkrufname")
        A.locator(".fz-suche:visible").last.fill(nef.replace("/", "")); A.wait_for_timeout(3000)
        t2 = A.evaluate("() => [...document.querySelectorAll('.kt-vorschlaege .kt-vs b')].map(b => b.textContent)")
        check(nef in t2, f"SEK-Suche findet auch ein anderes Fahrzeug ({nef})")
        A.screenshot(path=f"{S}/v76_sek.png")
        # --- zu früh am Abholort
        r = A.evaluate(f"""async () => {{ const s={J}; {STEP}
          const k = await s.generiereKt('online');
          const fz = Object.values(s.state.fahrzeuge).find(f => f.rmTyp === 'KTW' && s.verfuegbar(f) && !f.kt);
          s.call('ktSetze', k.id, {{ sofort: false, von: {{ lat: fz.lat, lon: fz.lon, label: 'Gleich da' }}, abholung: s.state.zeit + 120*60000 }}); await sleep(300);
          await s.call('ktVormerken', k.id, fz.id, 'neu'); await s.call('ktSchicken', fz.id);
          for (let i=0;i<8 && fz.status !== 'amBO';i++) await schritt(fz);
          await sleep(50);
          const frage = fz.kt?.fruehFrage === k.id;
          const funk = (s.state.funk ?? []).slice(-5).map(m => m.text ?? '').join(' | ');
          const antwort = s.ktFrueh(fz.id, 'frei');
          return {{ frage, status: s.ktAuftrag(k.id).status, kfz: s.ktAuftrag(k.id).fz, fzStatus: fz.status, antwort }}; }}""")
        print("   ", r)
        check(r["frage"] and r["status"] == "offen" and r["kfz"] is None and r["fzStatus"] in ("freiFunk", "freiWache"), f"zu früh: Frage, „frei melden“ → Fahrzeug frei, Auftrag undisponiert ({r})")
        # --- Mehrfachtransport mit schlauester Reihenfolge
        r = A.evaluate(f"""async () => {{ const s={J}; {STEP}
          const fz = Object.values(s.state.fahrzeuge).find(f => f.rmTyp === 'KTW' && s.verfuegbar(f) && !f.kt);
          const mk = async (von, nach) => {{ const k = await s.generiereKt('online'); s.call('ktSetze', k.id, {{ von, nach, lage: 'sitzend', begleitung: false, infektion: false, sofort: false, abholung: s.state.zeit + 20*60000 }}); await sleep(200); return k; }};
          const P = (lat, lon, label) => ({{ lat, lon, label }});
          // A und B nah beieinander, Ziele weit weg und nah beieinander
          const a = await mk(P(fz.lat + 0.05, fz.lon, 'A'), P(fz.lat + 0.30, fz.lon + 0.20, 'ZA'));
          const b2 = await mk(P(fz.lat + 0.06, fz.lon + 0.01, 'B'), P(fz.lat + 0.31, fz.lon + 0.21, 'ZB'));
          await s.call('ktVormerken', a.id, fz.id, 'neu'); await s.call('ktSchicken', fz.id);
          await sleep(100);
          let fehler = null;
          try {{ await s.call('ktVormerken', b2.id, fz.id, 'sammel'); }} catch (e) {{ fehler = String(e.message ?? e); }}
          await sleep(100);
          const reihe = (fz.kt?.halte ?? []).map(h => (h.art === 'ab' ? 'ab:' : 'an:') + (h.kt === a.id ? 'A' : 'B'));
          return {{ fehler, reihe, status: s.ktAuftrag(b2.id).status }}; }}""")
        print("   ", r)
        rh = r["reihe"]
        check(not r["fehler"] and len(rh) == 4 and rh[0].startswith("ab") and rh[1].startswith("ab") and rh[2].startswith("an"), f"Mehrfachtransport: erst beide abholen, dann beide abliefern {rh}")
        r = A.evaluate(f"""async () => {{ const s={J};
          const fz = Object.values(s.state.fahrzeuge).find(f => f.rmTyp === 'SKTW' && s.verfuegbar(f) && !f.kt);
          if (!fz) return {{ skip: true }};
          const k1 = await s.generiereSek('online'); const k2 = await s.generiereSek('online');
          for (const k of [k1, k2]) s.call('ktSetze', k.id, {{ sofort: false, lage: 'sitzend', sek: {{ arzt: false, monitoring: false, beatmet: false, inkubator: false, instabil: false, zusage: 'ja', bit: false }} }});
          await s.call('ktVormerken', k1.id, fz.id, 'neu'); await s.call('ktSchicken', fz.id);
          let f1 = null; try {{ await s.call('ktVormerken', k2.id, fz.id, 'sammel'); }} catch (e) {{ f1 = String(e.message ?? e); }}
          const k3 = await s.generiereSek('online'); s.call('ktSetze', k3.id, {{ sofort: true, sek: {{ arzt: false, monitoring: true, beatmet: false, inkubator: false, instabil: false, zusage: 'ja', bit: false }} }});
          let f2 = null; try {{ await s.call('ktVormerken', k3.id, fz.id, 'sammel'); }} catch (e) {{ f2 = String(e.message ?? e); }}
          return {{ f1, f2, n: fz.kt?.fahrten?.[0]?.length, code3: s.ktAuftrag(k3.id).d.code }}; }}""")
        print("   ", r)
        if not r.get("skip"):
            check(r["f1"] is None and r["n"] == 2, f"zwei Überstellungen ohne Blaulicht zusammen ({r})")
            check(r["f2"] and "Blaulicht" in r["f2"], f"mit Blaulicht kein Mehrfachtransport ({r['f2']})")
        # --- Karte: Klick auf Fahrzeug zeigt Info, öffnet nichts
        A.evaluate("() => window.__lw.panelZeigen('karte')"); A.wait_for_timeout(2500)
        fid = A.evaluate(f"() => Object.values({J}.state.fahrzeuge).find(f => f.kt?.aktiv)?.id")
        A.evaluate("(id) => window.__lw.sel.waehle(null, null, { karte: false })")
        A.evaluate("(id) => window.__lw.sel.fahrzeugZeigen(id)", fid)
        A.wait_for_timeout(800)
        pop = A.evaluate("() => document.querySelector('.fz-popup')?.innerText ?? ''")
        print("   ", pop.replace("\n", " / ")[:200])
        if pop:
            check("Ankunft" in pop or "→" in pop, "Info-Fenster mit Auftrag/Ankunft")
            A.evaluate("() => document.querySelector('.fz-popup [data-fz-oeffnen]').click()"); A.wait_for_timeout(500)
            a = A.evaluate("() => window.__lw.sel.auswahl()")
            check(a and a.get("id"), f"„Zum Transport“ wählt in der Liste aus ({a})")
        check(not logs, f"keine Fehler im Programm {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print(f"FEHLER: {fails}")
