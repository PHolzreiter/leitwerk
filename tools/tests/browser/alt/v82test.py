# v0.82: neue Abfrage-Ansicht – Notruf Frage für Frage mit Protokoll, KT/SEK als Karten, Rückrufnummer
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8882", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
J = "window.__lw.sim"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 2200, "height": 1200})
        ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e))); A.on("dialog", lambda d: d.accept())
        A.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true})); })()")
        A.goto("http://localhost:8882/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        A.evaluate(f"() => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(10,0,0,0); s.state.zeit=d.getTime(); }}")
        A.evaluate(f"() => {J}.call('start')"); A.wait_for_timeout(800); A.evaluate(f"() => {J}.call('pause')")
        eid = A.evaluate(f"async () => {{ const s={J}; const e = await s.generiereFall('kollaps', 'A'); return e.id; }}")
        A.wait_for_timeout(800)
        A.evaluate("() => { const b=[...document.querySelectorAll('.tel-row .btn.primary')][0]; b && b.click(); }"); A.wait_for_timeout(1500)
        A.evaluate("() => window.__lw.panelZeigen && window.__lw.panelZeigen('abfrage')"); A.wait_for_timeout(500)
        check(A.locator(".gf-karte").count() == 1, "neue Ansicht: eine Frage-Karte")
        teil = A.inner_text(".gf-karte .gf-teil").lower()
        check("einsatzort" in teil, f"erste Frage: Einsatzort ({teil!r})")
        # #225: angezeigte Nummer = Nummer des Anrufers
        nr = A.evaluate(f"(id) => {J}.einsatz(id).wahr.abfrage.anrufer.nummer", eid)
        karte = A.inner_text(".abf-karte")
        check(nr in karte, f"angezeigte Nummer = genannte Nummer ({nr})")
        A.screenshot(path=f"{S}/shots82/0_ganz.png"); A.locator(".lw-panel[data-panel=abfrage]").screenshot(path=f"{S}/shots82/1_ort.png")
        # Ort setzen → weiter zum Zusatz
        A.evaluate(f"(id) => {{ const e={J}.einsatz(id); {J}.call('aktualisiere', id, {{ adresse: {{ lat: e.wahr.lat ?? 48.41, lon: e.wahr.lon ?? 15.6, label: 'Teststraße 1, Krems' }} }}); }}", eid); A.wait_for_timeout(500)
        teil = A.inner_text(".gf-karte .gf-teil").lower()
        check("einsatzort" in teil and A.locator(".gf-karte input.gf-feld").count() == 1, f"danach: Zusatz zum Ort ({teil!r})")
        A.press(".gf-karte input.gf-feld", "Enter"); A.wait_for_timeout(400)
        teil = A.inner_text(".gf-karte .gf-teil").lower()
        check("rückruf" in teil, f"danach: Rückrufnummer ({teil!r})")
        # Rückruf ohne Nummer nicht möglich
        A.click(".gf-rueckruf .btn"); A.wait_for_timeout(200)
        v = A.input_value(".gf-rueckruf input")
        check(v == nr, f"⤵ fügt die angezeigte Nummer ein ({v})")
        A.press(".gf-rueckruf input", "Enter"); A.wait_for_timeout(500)
        tel = A.evaluate(f"(id) => [{J}.einsatz(id).telefon, {J}.einsatz(id).anruf.antworten.rueckrufnummer]", eid)
        check(tel[0] == nr and tel[1] == nr, f"Rückrufnummer im Einsatz und in der Abfrage ({tel})")
        teil = A.inner_text(".gf-karte .gf-teil").lower(); fr = A.inner_text(".gf-karte .gf-frage")
        check("anrufer" in teil, f"#226: nach der Rückrufnummer kommt „Wer ruft an?“ ({fr!r})")
        # Leertaste stellt die Frage
        n0 = A.evaluate(f"(id) => {J}.einsatz(id).anruf.gespraech.length", eid)
        A.evaluate("() => document.activeElement && document.activeElement.blur()")
        A.keyboard.press("Space"); A.wait_for_timeout(1500)
        n1 = A.evaluate(f"(id) => {J}.einsatz(id).anruf.gespraech.filter(m => m.von === 'leitstelle').length", eid)
        check(n1 >= 1, f"Leertaste stellt die Frage ({n1} Fragen der Leitstelle)")
        A.keyboard.press("2"); A.wait_for_timeout(600)
        an = A.evaluate(f"(id) => {J}.einsatz(id).anruf.antworten.anrufer", eid)
        check(an is not None, f"Taste 2 beantwortet ({an})")
        fr = A.inner_text(".gf-karte .gf-frage")
        check("wach" in fr.lower() or "ansprechbar" in fr.lower(), f"danach Bewusstsein ({fr!r})")
        A.keyboard.press("1"); A.wait_for_timeout(500)
        A.keyboard.press("1"); A.wait_for_timeout(500)
        fr = A.inner_text(".gf-karte .gf-frage")
        check("Was ist passiert" in fr, f"danach „Was ist passiert?“ ({fr!r})")
        A.locator(".lw-panel[data-panel=abfrage]").screenshot(path=f"{S}/shots82/2_was.png")
        A.fill(".gf-was-feld", "Er ist zusammengebrochen"); A.wait_for_timeout(300)
        erste = A.inner_text(".gf-kapitel .kapitel-opt.erster") if A.locator(".gf-kapitel .kapitel-opt.erster").count() else ""
        print("    erstes Kapitel:", erste)
        check(erste != "", "#227: Freitext schlägt Kapitel vor")
        A.locator(".lw-panel[data-panel=abfrage]").screenshot(path=f"{S}/shots82/3_kapitel.png")
        A.press(".gf-was-feld", "Enter"); A.wait_for_timeout(700)
        kap = A.evaluate(f"(id) => [{J}.einsatz(id).anruf.kapitel, {J}.einsatz(id).anruf.antworten.schilderung]", eid)
        check(kap[0] is not None and kap[1] == "Er ist zusammengebrochen", f"Enter wählt das Kapitel und merkt den Text ({kap})")
        # durch die Fragen: immer die erste Antwort, bis fertig
        for i in range(40):
            if A.locator(".gf-fertig").count(): break
            if A.locator(".gf-karte .gf-opt").count():
                A.evaluate("() => document.activeElement && document.activeElement.blur()")
                A.keyboard.press("1")
            elif A.locator(".gf-karte input.zahl").count():
                A.fill(".gf-karte input.zahl", "67"); A.press(".gf-karte input.zahl", "Enter")
            else:
                A.click(".gf-nav .btn >> nth=1")
            A.wait_for_timeout(350)
        check(A.locator(".gf-fertig").count() == 1, "alle Fragen beantwortet")
        saetze = A.evaluate("() => [...document.querySelectorAll('.gf-alt')].map(x => x.innerText.replace(/\\n/g,' '))")
        print("    Protokoll:", saetze[:12])
        check(len(saetze) >= 8, f"beantwortete Fragen bleiben stehen ({len(saetze)})")
        code = A.evaluate(f"(id) => {J}.einsatz(id).code", eid)
        check(bool(code), f"Code aus der Abfrage ({code})")
        A.locator(".lw-panel[data-panel=abfrage]").screenshot(path=f"{S}/shots82/4_fertig.png")
        # Satz anklicken → Frage kommt zurück, Antwort ändern
        A.click(".gf-alt-kopf >> nth=4"); A.wait_for_timeout(400)
        check(A.locator(".gf-alt.offen .gf-opt, .gf-alt.offen input").count() >= 1, "Klick klappt die Antworten auf")
        A.locator(".lw-panel[data-panel=abfrage]").screenshot(path=f"{S}/shots82/5_aendern.png")
        # Umschalten auf die bisherige Ansicht
        A.evaluate("() => { localStorage.setItem('lw.abfrageAnsicht','klassisch'); }")
        A.evaluate("() => window.__lw.abfrageAnsichtSetzen && window.__lw.abfrageAnsichtSetzen('klassisch')"); A.wait_for_timeout(800)
        check(A.locator(".abf-rechts .abfrage-abschnitt").count() > 2 and A.locator(".gf-karte").count() == 0, "Einstellung: bisherige Ansicht")
        A.evaluate("() => window.__lw.abfrageAnsichtSetzen && window.__lw.abfrageAnsichtSetzen('neu')"); A.wait_for_timeout(800)
        check(A.locator(".gf-karte").count() == 1, "zurück zur neuen Ansicht")
        # Kapitel-Treffer für typische Worte
        t = A.evaluate("() => ['Brustschmerzen','gestürzt','Atemnot','Bauchweh','Kopfweh','Verkehrsunfall','Krampfanfall','blutet stark','Er ist zusammengebrochen','sie kriegt keine Luft','mein Mann ist umgekippt','der Opa ist von der Leiter gefallen','sie hat zu viele Tabletten genommen','das Baby kommt','er hat einen Stromschlag bekommen'].map(w => [w, (window.__lw.kapitelZumText(window.__lw.store.schema, w)[0]||{}).titel])")
        print("    Worte → Kapitel:", t)
        check(sum(1 for w, k in t if k) >= 14, "Freitext findet für die meisten Worte ein Kapitel")
        A.evaluate("() => document.querySelector('.abf-fuss .btn.danger').click()"); A.wait_for_timeout(800)
        # --- KT-Hotline
        kid = A.evaluate(f"async () => {{ const s={J}; const k = await s.generiereKt('hotline'); return k && k.id; }}")
        A.wait_for_timeout(800)
        if kid:
            A.evaluate("() => { const b=[...document.querySelectorAll('.tel-row .btn.primary')][0]; b && b.click(); }"); A.wait_for_timeout(1500)
            check(A.locator(".lw-panel[data-panel=abfrage] .kt-naechste").count() == 1 and A.locator(".lw-panel[data-panel=abfrage] .kt-karte").count() >= 4, "KT: nächste Frage und Karten")
            check(A.locator(".kt-fragenleiste").count() == 0, "KT: keine lange Fragenleiste mehr")
            txt = A.inner_text(".lw-panel[data-panel=abfrage] .kt-formular")
            for w in ["Transportart", "Transportmittel", "Bis zum Fahrzeug", "Transportauftrag", "Krankenkasse", "Behandlung", "Hygienemaßnahme"]:
                check(w in txt, f"KT-Feld {w}")
            q0 = A.inner_text(".lw-panel[data-panel=abfrage] .kt-naechste-text")
            A.click(".lw-panel[data-panel=abfrage] .kt-naechste .btn.primary"); A.wait_for_timeout(1500)
            q1 = A.inner_text(".lw-panel[data-panel=abfrage] .kt-naechste-text")
            check(q0 != q1, f"nach dem Fragen kommt die nächste ({q0!r} → {q1!r})")
            A.click(".lw-panel[data-panel=abfrage] .kt-naechste .btn >> text=erledigt"); A.wait_for_timeout(500)
            q2 = A.inner_text(".lw-panel[data-panel=abfrage] .kt-naechste-text")
            check(q2 != q1, f"„erledigt“ geht weiter ({q2!r})")
            w = A.evaluate(f"(id) => {{ const d={J}.ktAuftrag(id).wahr.d; return [d.ktArt, d.transportmittel, d.gehfaehig, d.auftrag, d.kasse, d.behandlung]; }}", kid)
            check(all(x is not None for x in w), f"Wahrheit hat die neuen Angaben {w}")
            A.locator(".lw-panel[data-panel=abfrage]").screenshot(path=f"{S}/shots82/6_kt.png")
            ans = A.evaluate(f"(id) => {{ const L=window.__lw; const k=L.sim.ktAuftrag(id); return ['ktArt','kasse','gehfaehig','auftrag'].map(f => L.ktAntwortOhneKi ? L.ktAntwortOhneKi(k, {{id:f, text:''}}) : null); }}", kid)
            print("    KT-Antworten:", ans)
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
