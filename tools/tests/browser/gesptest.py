import subprocess, sys, time, json, re
from collections import Counter
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8801", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails=0; logs=[]
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails+=1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8801/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        # 1) Fragen sprechen
        r = A.evaluate("""() => { const L = window.__lw; const sch = L.store.schema; const all = Object.values(sch.globale_fragen).flat(); const kap = Object.values(sch.kapitel).flatMap(k => k.fragen || []);
            const f = (id) => all.find(x => x.id === id) || kap.find(x => x.id === id);
            const z = () => 0;
            const out = {};
            for (const [n, a] of [['neutral', {}], ['w', {geschlecht: 'w', anzahl_patienten: '1'}], ['m', {geschlecht: 'm'}], ['mehrere', {geschlecht: 'w', anzahl_patienten: 'n'}], ['selbst', {anrufer: '1', geschlecht: 'm'}]]) {
              out[n] = ['alter', 'bw', 'at', 'hautfarbe', 'kaltschweiss', 'diabetiker', 'tracheostoma', 'sprachschw', 'zerreiss', 'region', 'schilderung'].map(id => f(id) ? L.sprechFrage(f(id), sch, a, { zufall: z }) : '-');
            }
            out.allgemein = kap.filter(x => /Patient/.test(x.text)).slice(0, 12).map(x => L.sprechFrage(x, sch, {geschlecht: 'w'}, { zufall: z }));
            out.selbstAllg = kap.filter(x => /der Patient/.test(x.text)).slice(0, 12).map(x => L.sprechFrage(x, sch, {anrufer: '1'}, { zufall: z }));
            return out; }""")
        for k, v in r.items(): print("   ", k, v)
        alle = sum(r.values(), [])
        check(not any("(" in x for x in alle), "kein Klammertext in gesprochenen Fragen")
        check(not any("Patient" in x for x in r["w"] + r["m"] + r["allgemein"] + r["selbst"] + r["selbstAllg"]), "mit Geschlecht/selbst kein „Patient“")
        check(any("Patient" in x for x in r["neutral"]) and any("Patient" in x for x in r["mehrere"]), "ohne Geschlecht bzw. mehrere: allgemein „Patient“")
        check(all(" sie " in x or x.startswith("Ist sie") or "Sie" in x or "sie" in x for x in r["w"][:3]), "weiblich → sie")
        # 2) Probe-Fälle: Anrufer, Ort, Prompt
        res = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const out = [];
            for (const id of ['asthma', 'insult', 'sturz_huefte', 'kollaps', 'hexenschuss', 'schnittwunde', 'brustschmerz', 'hyperventilation', 'parkbank', 'kreislaufstillstand']) for (let i = 0; i < 6; i++) {
              const e = await s.probeFall(id); if (!e) { out.push({ id, fehler: true }); continue; }
              const w = e.wahr.abfrage; const k = L.kontext(e); const pr = L.systemPrompt(k);
              out.push({ id, typ: w.anrufer.typ, rolle: w.anrufer.rolle, ort: w.szenario.ortArt, stelle: w.szenario.stelle, persona: w.anrufer.persona, emotion: w.anrufer.emotion, geschehen: w.szenario.geschehen, prompt: pr, nummer: e.nummer, drin: s.state.einsaetze.includes(e) });
            } return out; }""")
        check(all(not x.get("fehler") for x in res), f"Probe-Fälle erzeugt ({len(res)})")
        check(not any(x.get("drin") for x in res), "Proben kommen nicht ins Spiel")
        bad = [(x["id"], x["typ"], x["ort"]) for x in res if (x["typ"] == "lehrer" and x["ort"] not in ("schule", "sport", "freizeit")) or (x["typ"] == "verkauf" and x["ort"] not in ("geschaeft", "bahnhof")) or (x["typ"] == "kollege" and x["ort"] not in ("arbeit", "baustelle", "geschaeft", "lokal")) or (x["typ"] == "partner" and x["ort"] in ("schule", "arbeit"))]
        check(not bad, f"Anrufer passt zum Ort {bad[:5]}")
        bad = [(x["id"], x["ort"], x["stelle"]) for x in res if ("Klassenzimmer" in x["stelle"] and x["ort"] != "schule") or ("Kassa" in x["stelle"] and x["ort"] != "geschaeft") or ("Büro" in x["stelle"] and x["ort"] != "arbeit")]
        check(not bad, f"Stelle passt zum Ort {bad[:5]}")
        pa = [x for x in res if "Der Patient:" in x["prompt"] or re.search(r"- Wie alt ist der Patient", x["prompt"])]
        check(not pa, f"Anweisung ohne „Der Patient:“ ({len(pa)})")
        wid = [x["id"] for x in res if "ist wach und redet normal" in x["prompt"]]
        check(not wid, "kein „redet normal“ mehr")
        selbstzeile = [x["id"] for x in res if "Satzfetzen" in x["prompt"] and x["typ"] != "selbst"]
        check(not selbstzeile, "„nur Satzfetzen“ nur, wenn der Patient selbst anruft")
        check(all("WAS WIRKLICH PASSIERT IST" in x["prompt"] for x in res), "Fakten statt fertigem Satz")
        privat = [x for x in res if x["persona"] and x["persona"]["wissen"] != "profi"]
        check(all("DEINE ART" in x["prompt"] for x in privat), "Persönlichkeit in der Anweisung")
        ps = Counter((x["persona"]["stil"], x["persona"]["einstieg"], x["emotion"], x["rolle"]) for x in privat)
        print("    Kombinationen:", len(ps), "von", len(privat))
        check(len(ps) >= len(privat) * 0.7, "Anrufer sind fast alle verschieden")
        print("    Einstiege:", Counter(x["persona"]["einstieg"] for x in privat), "Stile:", Counter(x["persona"]["stil"] for x in privat), "Wissen:", Counter(x["persona"]["wissen"] for x in privat))
        fremd = [x for x in privat if x["persona"]["wissen"] == "fremd"]
        print("    fremd Alter:", [x["persona"]["alterGesagt"] for x in fremd][:8])
        ge = Counter(" ".join(x["geschehen"] or []) for x in res if x["id"] == "sturz_huefte")
        check(len(ge) >= 3, f"Fakten variieren ({len(ge)} verschiedene bei 6 Stürzen)")
        ins = [x for x in res if x["id"] == "insult"]
        for x in ins[:6]: print("    insult:", x["typ"], x["persona"]["wissen"], "|", " ".join(x["geschehen"])[:140])
        check(all(("Kassa" in " ".join(x["geschehen"])) == (x["persona"]["wissen"] != "nah") for x in ins), "Insult: Fakten passen zum Wissen des Anrufers")
        open(f"{S}/prompt_beispiel.txt", "w").write("\n\n=========\n\n".join(x["prompt"] for x in res[:3]))
        # 3) Erinnerung erster Satz
        er = A.evaluate("""async () => { const L = window.__lw; const e = await L.sim.probeFall('kollaps'); const k = L.kontext(e); k.anrufer.persona.einstieg = 'problem';
            return L.erinnerung(k, { id: 'ort_adresse', typ: 'text', text: 'x' }, { erste: true, text: 'Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?' }); }""")
        print("   ", er[:300])
        check("ohne Adresse" in er and k_ok(er) if False else ("ohne Adresse" in er and "Die ehrliche Antwort" not in er), "Einstieg „Problem zuerst“: keine Adresse vorgegeben")
        # Atemnot und Satzgrenze
        r = A.evaluate("""async () => { const L = window.__lw;
            const at = L.inAtemnot('Ich krieg kaum noch Luft, das Spray hilft gar nicht mehr. Es ist vor einer halben Stunde losgegangen und wird immer schlimmer.');
            const fake = async (m, on) => { for (const t of ['Da is a Mann umgefallen! ', 'Er liegt am Boden. ', 'Er atmet noch. ', 'Das war grad eben. ']) on(t); return ''; };
            const eins = await L.kiAntwortNeu([{role:'user', content:'x'}], [], () => {}, { chat: fake, maxSaetze: 1 });
            const zwei = await L.kiAntwortNeu([{role:'user', content:'x'}], [], () => {}, { chat: fake, maxSaetze: 2 });
            return { at, eins, zwei }; }""")
        print("   ", r)
        check(r["at"].count("…") >= 3 and len(r["at"].replace("…", "").split()) <= 12, "Atemnot: Fetzen mit Pausen")
        check(r["eins"] == "Da is a Mann umgefallen!" and r["zwei"].count(".") + r["zwei"].count("!") == 2, "nur so viele Sätze wie erlaubt")
        er = A.evaluate("""async () => { const L = window.__lw; const e = await L.sim.probeFall('kollaps'); const k = L.kontext(e); const m = L.kiVerlauf(e, k, 'Was ist passiert?', undefined); return m[m.length - 1].content; }""")
        check("EIN kurzer Satz" in er, "frei getipptes „Was ist passiert?“ bekommt den Hinweis „ein kurzer Satz“")
        st = A.evaluate("""async () => { const L = window.__lw; const out = []; for (let i = 0; i < 12; i++) { const e = await L.sim.probeFall('kollaps'); out.push(e.wahr.abfrage.szenario.geschehen.join(' ')); } return out; }""")
        check(not any("Wärme" in x for x in st), "kein „in der Wärme“ mehr")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:15]))
