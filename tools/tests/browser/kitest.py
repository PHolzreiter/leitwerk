import subprocess, sys, time, json, urllib.request
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]; MODELL = sys.argv[4] if len(sys.argv) > 4 else "qwen3:8b"; FAELLE = sys.argv[3].split(",") if len(sys.argv) > 3 else ["asthma", "insult", "sturz_huefte", "kollaps"]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8802", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
out = open(f"{S}/ki_gespraeche.md", "a")
def ki(msgs):
    body = json.dumps({"model": MODELL, "stream": False, "think": False, "keep_alive": "30m", "messages": msgs, "options": {"temperature": 0.75, "num_ctx": 4096, "num_batch": 128, "num_predict": 110, "repeat_penalty": 1.1, "use_mmap": True}}).encode()
    r = urllib.request.urlopen(urllib.request.Request("http://localhost:11434/api/chat", data=body, headers={"Content-Type": "application/json"}), timeout=900)
    return json.loads(r.read())["message"]["content"]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--renderer-process-limit=1", "--disable-gpu", "--js-flags=--max-old-space-size=512"]); ctx = b.new_context(viewport={"width": 1200, "height": 800})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); })()")
        A = ctx.new_page()
        A.goto("http://localhost:8802/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; window.__p = []; }")
        for fid in FAELLE:
            info = A.evaluate("""async (fid) => { const L = window.__lw; const e = await L.sim.probeFall(fid); window.__p.push(e); const x = e.wahr.abfrage.anrufer; e.anruf.antworten = {};
                return { i: window.__p.length - 1, rolle: x.rolle, emotion: x.emotion, sprache: x.sprache, persona: x.persona, patient: e.wahr.abfrage.szenario.patient, wahr: e.wahr.abfrage.antworten, kapitel: e.wahr.abfrage.kapitel }; }""", fid)
            pe = info["persona"] or {}
            out.write(f"\n## {fid} – {info['rolle']}, {info['emotion']}, {info['sprache']}, Stil {pe.get('stil')}, Einstieg {pe.get('einstieg')}, Wissen {pe.get('wissen')} (Patient {info['patient']['geschlecht']}, {info['patient']['alter']})\n\n"); out.flush()
            # Fragen: Eröffnung, ggf. Ort nochmal, Was ist passiert, Wer ruft an, Alter, (Geschlecht eintragen), bw, at, eine Kapitelfrage, Mitteilung
            plan = [("ort_adresse", None), ("schilderung", None), ("anrufer", None), ("alter", None), ("@geschlecht", None), ("bw", None), ("at", None), ("@kapitel", None), (None, "Okay, die Rettung ist schon unterwegs. Bleiben Sie bitte am Telefon.")]
            erste = True
            for fid2, frei in plan:
                if fid2 == "@geschlecht":
                    A.evaluate("([i]) => { const e = window.__p[i]; e.anruf.antworten.geschlecht = e.wahr.abfrage.antworten.geschlecht; e.anruf.antworten.anzahl_patienten = '1'; e.anruf.antworten.anrufer = e.wahr.abfrage.anrufer.anruferWert; }", [info["i"]]); continue
                q = A.evaluate("""([i, id, frei, erste]) => { const L = window.__lw; const e = window.__p[i]; const sch = L.store.schema;
                    let f = null;
                    if (id === '@kapitel') { const k = sch.kapitel[e.wahr.abfrage.kapitel]; f = (k.fragen || []).find(x => x.typ === 'single' && !['bw','at','alter','geschlecht','anzahl_patienten'].includes(x.id)); }
                    else if (id) f = Object.values(sch.globale_fragen).flat().find(x => x.id === id);
                    const text = frei ?? L.sprechFrage(f, sch, e.anruf.antworten, { erste });
                    const k = L.kontext(e);
                    const msgs = L.kiVerlauf(e, k, text, f || undefined);
                    return { text, msgs, fid: f ? f.id : null }; }""", [info["i"], fid2, frei, erste])
                erste = False
                t0 = time.time()
                roh = ki(q["msgs"])
                a = A.evaluate("([i, roh, text]) => { const L = window.__lw; const e = window.__p[i]; const w = e.wahr.abfrage.szenario.patient.geschlecht === 'w'; const t = L.ohnePatientWort(L.satzEnde(L.bereinigen(roh)), w); e.anruf.gespraech.push({ zeit: 0, echt: 0, von: 'leitstelle', text }); e.anruf.gespraech.push({ zeit: 0, echt: 0, von: 'anrufer', text: t }); return t; }", [info["i"], roh, q["text"]])
                out.write(f"- **Leitstelle:** {q['text']}\n- **Anrufer:** {a}  _({time.time()-t0:.0f} s)_\n"); out.flush()
                # Einstieg ohne Adresse: nochmal nach dem Ort fragen
                if fid2 == "ort_adresse" and pe.get("einstieg") in ("problem", "unvollstaendig"):
                    plan.insert(1, ("ort_adresse", None))
                    pe["einstieg"] = "-"
        b.close()
finally:
    srv.terminate(); out.close()
print("fertig")
