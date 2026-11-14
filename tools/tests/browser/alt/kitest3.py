import subprocess, sys, time, json, re
from collections import Counter
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8811", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8811/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        # 1) freie Fragen ohne Fragezeichen
        arten = A.evaluate("""() => { const n = window.__lw.nachrichtArt; return Object.fromEntries(['okay verstanden können sie mir sagen wo sie sind', 'was ist ihre addresse', 'okay danke was ist passiert', 'erzählen sie mal was passiert ist', 'gibt es mehrere verletzte', 'dann tun sie dies und regen sie sie zum husten an', 'der rettungsdienst ist unterwegs', 'Die Rettung ist unterwegs, bleiben Sie am Telefon', 'Er ist wach und atmet normal'].map(t => [t, n(t)])); }""")
        print("   ", arten)
        erw = ["frage", "frage", "frage", "frage", "frage", "anweisung", "mitteilung", "mitteilung", "zusammenfassung"]
        check(list(arten.values()) == erw, "freie Fragen ohne „?“ werden als Fragen erkannt")
        # 2) Pflegeheim: Profi-Anweisung, keine „meine Frau“, Abwechslung
        res = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const out = [];
            for (let i = 0; i < 8; i++) { const e = await s.probeFall('pflegeheim_fieber'); if (!e) continue; const k = L.kontext(e);
              out.push({ prompt: L.systemPrompt(k), persona: e.wahr.abfrage.anrufer.persona, geschehen: e.wahr.abfrage.szenario.geschehen, stelle: e.wahr.abfrage.szenario.stelle, hint: L.erinnerung(k, { id: 'schilderung', typ: 'text', text: 'Was ist passiert?' }, { erste: false }) }); }
            return out; }""")
        check(len(res) == 8, f"Pflegeheim-Proben ({len(res)})")
        check(not any("meine Frau" in x["prompt"] or "mein Mann" in x["prompt"] for x in res), "Pflegekraft sagt nicht „meine Frau“/„mein Mann“")
        check(all("Du bist Profi" in x["prompt"] and "Keine Fachwörter" not in x["prompt"] for x in res), "Profi-Regeln statt Laien-Regeln")
        check(all("liegend" in x["prompt"] or "sitzen" in x["prompt"] for x in res), "Transportart steht in den Fakten")
        geschehen = Counter(" ".join(x["geschehen"]) for x in res)
        check(len(geschehen) >= 5, f"Fakten unterscheiden sich ({len(geschehen)} von 8)")
        check(len(Counter((x["persona"]["stil"], x["persona"]["einstieg"], x["persona"]["eigenheit"]) for x in res)) >= 3, "Pflegekräfte reden unterschiedlich")
        check(all("worum es geht" in x["hint"] for x in res), "Kern (Stichworte) bei „Was ist passiert?“")
        print("    Beispiel-Hinweis:", res[0]["hint"][:300])
        # 3) Anweisung an die KI bleibt im Gespräch gleich
        same = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const e = await s.generiereFall('kollaps', 'A'); s.anrufAnnehmen(e.id); const k = L.kontext(e);
            const a = L.kiVerlauf(e, k, 'Was ist passiert?')[0].content; const b = L.kiVerlauf(e, k, 'Wie alt ist er?')[0].content; return a === b; }""")
        check(same, "Anweisung an die KI ist in jeder Runde gleich (Ollama kann sie wiederverwenden)")
        # 4) Vorwärmen: erste Antwort entsteht schon beim Klingeln
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; let n = 0;
            L.kiTest.chat = async (msgs, on) => { n++; await new Promise(r => setTimeout(r, 1500)); const t = 'Hauptstraße 1, Testort.'; on(t); return t; };
            const e = await s.generiereFall('asthma', 'A'); const ring = e.anruf.status;
            L.vorwaermen(); await new Promise(r => setTimeout(r, 1800));
            s.anrufAnnehmen(e.id); const t0 = performance.now(); await L.eroeffnen(e); const dauer = performance.now() - t0;
            const ant = e.anruf.gespraech.filter(m => m.von === 'anrufer').map(m => m.text);
            L.kiTest.chat = null; return { ring, n, dauer, ant }; }""")
        print("   ", r)
        check(r["ring"] == "klingelt" and r["n"] == 1 and 2500 < r["dauer"] < 7000 and len(r["ant"]) == 1 and r["ant"][0].startswith("Hauptstraße 1"), "Vorwärmen: erste Antwort vorbereitet, kommt nach dem Eröffnungssatz, KI nur einmal gefragt")
        # 5) Orte: überall / außer
        r = A.evaluate("""async () => { const L = window.__lw; const k = L.ortKandidaten;
            const nur = k({ orte: ['pflegeheim'], anrufer: ['pflege'] }).map(x => x[0]);
            const ueberall = k({ orte: [], ortModus: 'ueberall', anrufer: ['passant', 'partner'] }).map(x => x[0]);
            const ausser = k({ orte: ['pflegeheim', 'arzt'], ortModus: 'ausser', anrufer: ['partner', 'pflege', 'passant'] }).map(x => x[0]);
            return { nur, ueberall, ausser }; }""")
        print("   ", r)
        check(r["nur"] == ["pflegeheim"], "nur: genau die gewählten Orte")
        check(len(r["ueberall"]) >= 6 and "wohnung" in r["ueberall"] and "natur" not in r["ueberall"], "überall: viele passende Orte")
        check("pflegeheim" not in r["ausser"] and "arzt" not in r["ausser"] and "wohnung" in r["ausser"], "außer: die gewählten Orte nie")
        r = A.evaluate("""async () => { const L = window.__lw; const f = L.faelle.alleFaelle(true).find(x => x.id === 'hexenschuss'); const c = JSON.parse(JSON.stringify(f));
            c.id = 'test_ausser'; c.name = 'Test außer'; c.ortModus = 'ausser'; c.orte = ['wohnung', 'haus']; L.faelle.fallSpeichern(c);
            const orte = []; for (let i = 0; i < 12; i++) { const e = await L.sim.probeFall('test_ausser'); if (e) orte.push(e.wahr.abfrage.szenario.ortArt); }
            L.faelle.fallLoeschen('test_ausser'); return orte; }""")
        print("    außer Wohnung/Haus:", r)
        check(len(r) >= 10 and not any(o in ("wohnung", "haus") for o in r), "Fall „überall außer Wohnung/Haus“ passiert nie dort")
        # 6) gesprochene Fragen ohne „der Anrufer“
        r = A.evaluate("""() => { const L = window.__lw; const sch = L.store.schema; const kap = Object.values(sch.kapitel).flatMap(k => k.fragen || []);
            return kap.filter(x => ['anrufer_selbst', 'grund', 'transportart', 'lage', 'hohe_geschw'].includes(x.id)).map(x => L.sprechFrage(x, sch, { geschlecht: 'w', anzahl_patienten: '1' }, { zufall: () => 0 })); }""")
        print("   ", r)
        check(r and not any("Anrufer" in x or "Grund der" in x for x in r), "Schemafragen klingen gesprochen")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
