# v0.73: eingebautes Codesystem (RD-Muster), eigene Codesätze, Entwicklungsfortschritt, Changelog
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8873", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
gesendet = []
def dienst(route):
    u = route.request.url
    if u.endswith("/api/fortschritt"):
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"punkte": [
            {"id": "a", "titel": "Funk neu", "text": "klarer", "stand": "arbeit", "prozent": 40},
            {"id": "b", "titel": "Tablet", "text": "", "stand": "geplant", "prozent": 0},
            {"id": "c", "titel": "Eigenes Codesystem", "text": "", "stand": "fertig", "prozent": 100}]}))
    if u.endswith("/api/tickets") and route.request.method == "POST":
        gesendet.append(json.loads(route.request.post_data))
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"nr": 7, "geheim": "b" * 32, "status": "eingegangen"}))
    return route.abort()
schema_text = open(f"{DIST}/abf_test.json", encoding="utf-8").read()
csv_text = "code;name;kategorie;kapitel\nRD-99A1;Eigener Testcode;BLS grün;99 - Test\nRD-99D1;Eigener Notfall;ALS rot;99 - Test\n"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.route("https://tickets.leitwerk.workers.dev/**", dienst)
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8873/?debug&start"); A.wait_for_timeout(3000)
        # --- eingebautes Codesystem
        c = A.evaluate("""() => { const s = window.__lw.store; const codes = s.list('codes'); const sch = s.schema;
          return { std: s.schemaIstStandard, n: codes.length, alleRD: codes.every(c => /^(RD|ALP)-\\d+[OABCDE]\\d+[A-Z]?$/.test(c.code)),
            kats: [...new Set(codes.map(c => c.kategorie))].sort(), kap: Object.keys(sch.kapitel).length, k17: sch.kapitel['17']?.titel, k6: sch.kapitel['6']?.titel }; }""")
        print("   ", c)
        check(c["std"] and c["n"] > 500 and c["alleRD"] and c["kap"] == 38, f"eingebautes Codesystem ab der Installation: {c['n']} Codes im RD-Muster, {c['kap']} Kapitel")
        check({"ALS rot", "ALS orange", "ALS gelb", "ALS grün", "BLS rot", "BLS gelb", "Telemedizin"} <= set(c["kats"]) and not any(k.startswith("S") and k[1:2].isdigit() for k in c["kats"]), f"Kategorien wie gewohnt: {c['kats']}")
        check(c["k17"] == "Sturz" and c["k6"] == "Atemnot", "Kapitelnummern wie gewohnt (17 Sturz, 6 Atemnot)")
        # Abfrage mit dem eingebauten System ergibt einen Code
        r = A.evaluate("""() => { const { bestimmeCode } = window.__lw.schemaFkt; const s = window.__lw.store.schema;
          const a1 = bestimmeCode(s, '17', { bw: 'ja', at: 'normal', alter: 80, hoehe: 'boden', umstand: 'boden_2' }, {});
          const a2 = bestimmeCode(s, '9', { bw: 'nein', at: 'keine', tod: 'nein', beobachtet: 'ja' }, {});
          const a3 = bestimmeCode(s, '10', { bw: 'ja', at: 'normal', alter: 60 }, {});
          return [a1 && [a1.code, s.codes[a1.code]?.kategorie], a2 && [a2.code, s.codes[a2.code]?.kategorie, a2.reanimation], a3 && [a3.code, s.codes[a3.code]?.kategorie]]; }""")
        print("   ", r)
        check(all(r) and r[0][0].startswith("RD-17") and r[1][0].startswith("RD-9E") and r[1][2] and r[2][0].startswith("RD-10"), f"Abfrage ergibt RD-Codes: {r}")
        # Spiel mit dem eingebauten System: Einsätze haben RD-Codes
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("() => window.__lw.sim.call('neuesSpiel', new Date('2026-10-27T10:00:00').getTime())"); A.wait_for_timeout(1200)
        e = A.evaluate("async () => { const s = window.__lw.sim; await s.call('pause'); const out = []; for (let i = 0; i < 6; i++) { const e = await s.generiere(); if (e) out.push(e.wahr?.code ?? e.code ?? ''); } return out; }")
        check(len(e) >= 4 and all(x.startswith(("RD-", "ALP-", "ACN-")) for x in e if x), f"generierte Einsätze: {e}")
        A.evaluate("() => window.__lw.startseite.zeigen()"); A.wait_for_timeout(1200)
        # --- Entwicklungsfortschritt
        A.click('[data-act="fortschritt"]'); A.wait_for_timeout(1000)
        f = A.evaluate("() => ({ gruppen: [...document.querySelectorAll('.fs-gruppe h3')].map(x => x.textContent), balken: [...document.querySelectorAll('.fs-balken span')].map(x => x.style.width), idee: !!document.querySelector('.fs-idee button') })")
        check(f["gruppen"] == ["In Arbeit", "Geplant", "Gerade fertig geworden"] and f["balken"] == ["40%", "0%", "100%"] and f["idee"], f"Fortschritt mit Balken: {f}")
        A.screenshot(path=f"{S}/v73_fortschritt.png")
        A.click(".fs-idee button"); A.wait_for_timeout(600)
        check(A.evaluate("() => document.querySelector('.mh-reiter-b.aktiv')?.dataset.r") == "idee", "Knopf öffnet „Idee/Wunsch“")
        A.fill('.mh input[name="titel"]', "Nachtmodus"); A.fill('.mh textarea[name="text"]', "Bitte dunklere Karte in der Nacht")
        A.click('.dlg-foot .btn.primary'); A.wait_for_timeout(900)
        check(gesendet and gesendet[-1]["art"] == "idee" and gesendet[-1]["titel"] == "Nachtmodus", f"Idee als Ticket geschickt ({gesendet[-1]['art'] if gesendet else '-'})")
        A.click('.dlg-foot .btn:not(.primary)'); A.wait_for_timeout(300)
        # --- Changelog
        A.click('[data-act="changelog"]'); A.wait_for_timeout(600)
        cl = A.evaluate("() => ({ n: document.querySelectorAll('.cl-eintrag').length, erst: document.querySelector('.cl-eintrag h3')?.textContent, ver: document.querySelector('.cl-version')?.textContent, text: document.querySelector('.cl-liste').textContent })")
        verboten = [w for w in [w[::-1] for w in ["ÖN furtoN", "MISOEL", "miSoeL", "miStsL", "murofnas", "paMteertSnepO", "oeteM-nepO", "SDPMA"]] if w.lower() in cl["text"].lower()]
        check(cl["n"] >= 90 and cl["erst"] and cl["ver"].startswith("v"), f"Changelog: {cl['n']} Updates, neuestes „{cl['erst']}“ ({cl['ver']})")
        check(not verboten, f"Changelog ohne Quellen {verboten}")
        A.fill(".cl-suche", "Flughafen"); A.wait_for_timeout(300)
        n2 = A.evaluate("() => document.querySelectorAll('.cl-eintrag').length")
        check(0 < n2 < cl["n"], f"Changelog durchsuchen: {n2} Treffer")
        A.screenshot(path=f"{S}/v73_changelog.png")
        A.click('.dlg-foot .btn'); A.wait_for_timeout(300)
        # --- Einsatzcodes & Abfrage: Hinweis und eigener Satz
        A.screenshot(path=f"{S}/v73_start.png"); print("   ", A.evaluate("() => { const r = document.querySelector('[data-act=\"einstellungen\"]').getBoundingClientRect(); return [r.top, r.bottom, document.querySelector('.st-seite').getBoundingClientRect().bottom]; }"))
        A.click('.st [data-act="einstellungen"]'); A.wait_for_timeout(900)
        A.click('[data-seite="codes"]'); A.wait_for_timeout(900)
        h = A.evaluate("() => document.querySelector('.schema-bar .cs-rechtlich')?.textContent ?? ''")
        check("rechtlichen Gründen" in h, "deutlicher Hinweis im Menü Einsatzcodes & Abfrage")
        A.click('[data-act-codes="saetze"]'); A.wait_for_timeout(700)
        A.click('[data-satz-neu="rd"]'); A.wait_for_timeout(500)
        A.set_input_files('input[name="abfrageschema"]', files=[{"name": "Meine Leitstelle.json", "mimeType": "application/json", "buffer": schema_text.encode()}])
        A.set_input_files('input[name="codeliste"]', files=[{"name": "liste.csv", "mimeType": "text/csv", "buffer": csv_text.encode()}])
        A.wait_for_timeout(200)
        nm = A.evaluate("() => document.querySelector('input[name=\"satzname\"]').value")
        A.click('.dlg:last-of-type .dlg-foot .btn.primary') if False else A.locator(".dlg-foot .btn.primary").last.click(); A.wait_for_timeout(1500)
        s1 = A.evaluate("""async () => { const s = window.__lw.store; const l = await window.__lw.ablage.ablageListe('Abfrageschema/RD'); const c = await window.__lw.ablage.ablageListe('Codelisten/RD');
           return { std: s.schemaIstStandard, eigen: s.list('codes').some(c => c.code === 'RD-99A1'), schemaCodes: Object.keys(s.schema.codes).length, a: l.map(x => x.datei), c: c.map(x => x.datei),
             saetze: [...document.querySelectorAll('.cs-satz')].map(x => x.textContent.replace(/\\s+/g, ' ').trim()) }; }""")
        print("   ", nm, s1)
        check(nm == "Meine Leitstelle" and not s1["std"] and s1["eigen"] and "Meine Leitstelle.json" in s1["a"] and "Meine Leitstelle.csv" in s1["c"], "Satz hochgeladen (Schema + Codeliste), gespeichert und aktiv")
        check(any("Meine Leitstelle" in x and "aktiv" in x for x in s1["saetze"]), "Satz in der Liste als aktiv")
        A.screenshot(path=f"{S}/v73_saetze.png")
        # zurück zum eingebauten und wieder zum eigenen
        A.locator(".cs-satz").first.locator("button").click(); A.wait_for_timeout(700)
        s2 = A.evaluate("() => ({ std: window.__lw.store.schemaIstStandard, eigen: window.__lw.store.list('codes').some(c => c.code === 'RD-99A1') })")
        check(s2["std"] and not s2["eigen"], "zurück zum eingebauten Codesystem")
        A.locator(".cs-satz", has_text="Meine Leitstelle").locator("button", has_text="Verwenden").click(); A.wait_for_timeout(1200)
        check(not A.evaluate("() => window.__lw.store.schemaIstStandard"), "wieder zum eigenen Satz gewechselt")
        # einmaliges Aufräumen löscht nur, wenn noch nicht aufgeräumt (hier: Test-Browser frisch → einmal)
        A.evaluate("async () => window.__lw.ablage.abgleichen(true)"); A.wait_for_timeout(600)
        s3 = A.evaluate("async () => ({ std: window.__lw.store.schemaIstStandard, a: (await window.__lw.ablage.ablageListe('Abfrageschema')).length, c: (await window.__lw.ablage.ablageListe('Codelisten')).length })")
        check(s3 == {"std": True, "a": 0, "c": 0}, f"einmaliges Aufräumen entfernt alte Schemas und Dateien {s3}")
        A.evaluate("async () => { const r = await fetch('/abf_test.json'); window.__lw.codesystemLaden(await r.json()); }"); A.wait_for_timeout(600)
        A.evaluate("async () => window.__lw.ablage.abgleichen(true)"); A.wait_for_timeout(600)
        check(not A.evaluate("() => window.__lw.store.schemaIstStandard"), "danach bleibt ein neu geladenes Schema")
        check(not logs, f"keine Fehler im Programm {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print(f"FEHLER: {fails}")
