import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]; FAELLE = sys.argv[3].split(",")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8803", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
out = open(f"{S}/ki_gespraeche.md", "a")
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--renderer-process-limit=1", "--disable-gpu", "--js-flags=--max-old-space-size=512"]); ctx = b.new_context(viewport={"width": 1000, "height": 700})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); })()")
        A = ctx.new_page(); A.set_default_timeout(0)
        A.goto("http://localhost:8803/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("""() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; window.__p = [];
            window.__lw.kiTest.chat = async (messages, on) => { const r = await fetch('http://localhost:11434/api/chat', { method: 'POST', body: JSON.stringify({ model: 'qwen3:8b', stream: false, think: false, keep_alive: '30m', messages, options: { temperature: 0.75, num_ctx: 4096, num_predict: 110, repeat_penalty: 1.1, num_batch: 128 } }) }); const j = await r.json(); if (j.error) throw new Error(j.error); on(j.message.content + ' '); return j.message.content; }; }""")
        for fid in FAELLE:
            info = A.evaluate("""async (fid) => { const L = window.__lw; const e = await L.sim.probeFall(fid); window.__p.push(e); const x = e.wahr.abfrage.anrufer; e.anruf.antworten = {};
                return { i: window.__p.length - 1, rolle: x.rolle, emotion: x.emotion, sprache: x.sprache, persona: x.persona, patient: e.wahr.abfrage.szenario.patient }; }""", fid)
            pe = info["persona"] or {}
            out.write(f"\n## {fid} – {info['rolle']}, {info['emotion']}, {info['sprache']}, Stil {pe.get('stil')}, Einstieg {pe.get('einstieg')}, Wissen {pe.get('wissen')} (Patient {info['patient']['geschlecht']}, {info['patient']['alter']})\n\n"); out.flush()
            plan = ["ort_adresse", "schilderung", "anrufer", "@eintragen", "alter", "bw", "at", "@kapitel", "!Okay, die Rettung ist schon unterwegs. Bleiben Sie bitte am Telefon."]
            erste = True
            k = 0
            while k < len(plan):
                schritt = plan[k]; k += 1
                if schritt == "@eintragen":
                    A.evaluate("(i) => { const e = window.__p[i]; const w = e.wahr.abfrage; e.anruf.antworten.geschlecht = w.antworten.geschlecht; e.anruf.antworten.anzahl_patienten = '1'; e.anruf.antworten.anrufer = w.anrufer.anruferWert; }", info["i"]); continue
                t0 = time.time()
                r = A.evaluate("""async ([i, schritt, erste]) => { const L = window.__lw; const e = window.__p[i]; const sch = L.store.schema;
                    let f = null, text = null;
                    if (schritt.startsWith('!')) text = schritt.slice(1);
                    else if (schritt === '@kapitel') { const kk = sch.kapitel[e.wahr.abfrage.kapitel]; f = (kk.fragen || []).find(x => x.typ === 'single' && !['bw','at','alter','geschlecht','anzahl_patienten'].includes(x.id)); }
                    else f = Object.values(sch.globale_fragen).flat().find(x => x.id === schritt);
                    if (!text) text = L.sprechFrage(f, sch, e.anruf.antworten, { erste });
                    const { probeGespraech } = L; const out = [];
                    await L.probe(e, [{ text, frage: f || undefined }], (von, t) => out.push(t));
                    return out; }""", [info["i"], schritt, erste])
                erste = False
                out.write(f"- **Leitstelle:** {r[0]}\n- **Anrufer:** {r[1]}  _({time.time()-t0:.0f} s)_\n"); out.flush()
                if schritt == "ort_adresse" and pe.get("einstieg") in ("problem", "unvollstaendig"):
                    plan.insert(k, "ort_adresse"); pe["einstieg"] = "-"
        b.close()
finally:
    srv.terminate(); out.close()
print("fertig")
