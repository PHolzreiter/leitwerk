# v0.83: Fragen bleiben stehen, Ortung in der Pause, Genannte Adresse, KT-Orte sinnvoll, Drogen/Medikamente-Frage
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8883", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
J = "window.__lw.sim"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 2200, "height": 1200})
        ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e))); A.on("dialog", lambda d: d.accept())
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8883/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        # --- eingebautes Schema: Drogen/Medikamente
        r = A.evaluate("""() => { const L = window.__lw; const s = L.store.schema; const K = s.kapitel['10'];
            const ids = K.fragen.map(f => f.id);
            const code = (a) => L.schemaFkt.bestimmeCode(s, '10', a)?.code;
            const basis = { bw: 'ja', at: 'normal', alter: 30, kaltschweiss: 'nein', hautfarbe: 'nein', sprachschw: 'nein', herz_vg: 'nein' };
            const sicht = (a) => L.schemaFkt.fragenImAblauf(s, '10', a).map(x => x.frage.id);
            return { ids, k: code({ ...basis, drogen_12h: 'drogen', drogen_welche: 'kokain' }), c: code({ ...basis, drogen_12h: 'drogen', drogen_welche: 'cannabis' }), m: code({ ...basis, drogen_12h: 'medikamente' }),
              ohne: sicht({ ...basis, drogen_12h: 'keine' }).includes('drogen_welche'), mit: sicht({ ...basis, drogen_12h: 'drogen' }).includes('drogen_welche') }; }""")
        print("   ", r)
        check("drogen_12h" in r["ids"] and "kokain" not in r["ids"], "eingebaut: Frage Drogen/Medikamente statt Kokain")
        check(r["k"] == "RD-10D4" and r["c"] != "RD-10D4" and r["m"] != "RD-10D4", "nur Kokain ändert den Code")
        check(r["mit"] and not r["ohne"], "„Welche Drogen?“ nur bei Drogen")
        # --- Pauls Schema mit der neuen Frage
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_drogen.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        A.evaluate(f"() => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(10,0,0,0); s.state.zeit=d.getTime(); }}")
        A.evaluate(f"() => {J}.call('start')"); A.wait_for_timeout(800); A.evaluate(f"() => {J}.call('pause')")
        w = A.evaluate(f"async () => {{ const s={J}; const out=[]; for (let i=0;i<6;i++) {{ const e = await s.generiereFall('brustschmerz'); const w = {{ ...(e.wahr.abfrage.szenario?.zusatz ?? {{}}), ...e.wahr.abfrage.antworten }}; out.push([w.drogen_12h, w.alter]); s.call('schliesse', e.id).catch(()=>{{}}); }} return out; }}")
        print("    Wahrheit drogen_12h:", w)
        check(all(x[0] in ("medikamente", "keine") for x in w), "Fälle beantworten die neue Frage")
        # --- Notruf: Fragen bleiben stehen
        eid = A.evaluate(f"async () => {{ const e = await {J}.generiereFall('kollaps', 'A'); return e.id; }}")
        A.wait_for_timeout(600)
        A.evaluate("() => { const b=[...document.querySelectorAll('.tel-row .btn.primary')][0]; b && b.click(); }"); A.wait_for_timeout(1500)
        # Ortung in der Pause
        A.evaluate(f"(id) => {J}.call('ortung', id)", eid)
        A.wait_for_timeout(10000)
        st = A.evaluate(f"(id) => {J}.einsatz(id).anruf.ortung.status", eid)
        check(st == "fertig", f"#229 Ortung in der Pause fertig ({st})")
        # Genannte
        A.evaluate("() => document.activeElement && document.activeElement.blur()")
        A.keyboard.press("Space"); A.wait_for_timeout(1500)
        dis = A.evaluate("() => { const b=[...document.querySelectorAll('.gf-karte .ort-feld button')].find(x => x.textContent.includes('Genannte')); return b ? b.disabled : null; }")
        check(dis is False, "#232 „Genannte“ nach der Antwort aktiv")
        t = A.evaluate("() => window.__lw.gesagteAdresse('Florianigasse 9, 2054 Haugsdorf', ['Wir sind im Wohnzimmer in der Florianigasse 9, 2054 Haugsdorf. Die Tür ist zu, aber das Gartentor steht offen.'])")
        check(t == "Florianigasse 9, 2054 Haugsdorf", f"nur die Adresse wird übernommen ({t})")
        A.evaluate(f"(id) => {{ const e={J}.einsatz(id); {J}.call('aktualisiere', id, {{ adresse: {{ lat: 48.41, lon: 15.6, label: 'Teststraße 1, Krems' }} }}); }}", eid); A.wait_for_timeout(500)
        A.press(".gf-karte input.gf-feld", "Enter"); A.wait_for_timeout(300)
        A.click(".gf-rueckruf .btn"); A.press(".gf-rueckruf input", "Enter"); A.wait_for_timeout(400)
        A.evaluate("() => document.activeElement && document.activeElement.blur()")
        A.keyboard.press("2"); A.wait_for_timeout(400); A.keyboard.press("1"); A.wait_for_timeout(400); A.keyboard.press("1"); A.wait_for_timeout(400)
        alt = A.evaluate("() => [...document.querySelectorAll('.gf-alt')].map(x => x.dataset.alt)")
        print("    alte Fragen:", alt)
        check(A.locator(".gf-protokoll").count() == 0, "#230 keine Satz-Liste mehr in der Abfrage")
        check(len(alt) >= 5 and alt[0] == "at" and alt[-1] == "ort_adresse", "neueste oben, Einsatzort ganz unten")
        check(A.locator(".gf-alt.ohne").count() >= 1, "übersprungene Frage steht grau dabei")
        txt = A.inner_text(".gf-alt[data-alt=at]")
        check("normal" in txt.lower() and A.locator(".gf-alt[data-alt=at] .gf-opt").count() == 0, f"zeigt nur die gewählte Antwort ({txt!r})")
        A.click(".gf-alt[data-alt=at] .gf-alt-kopf"); A.wait_for_timeout(300)
        n = A.locator(".gf-alt[data-alt=at] .gf-opt").count()
        check(n >= 3, f"Klick klappt alle Antworten auf ({n})")
        A.locator(".gf-alt[data-alt=at] .gf-opt").nth(1).click(); A.wait_for_timeout(500)
        v = A.evaluate(f"(id) => {J}.einsatz(id).anruf.antworten.at", eid)
        check(v == "abnorm" and A.locator(".gf-alt.offen").count() == 0, f"Antwort geändert und zugeklappt ({v})")
        A.locator(".lw-panel[data-panel=abfrage]").screenshot(path=f"{S}/shots82/v83_alt.png")
        A.evaluate("() => document.querySelector('.abf-fuss .btn.danger')?.click()"); A.wait_for_timeout(500)
        # --- KT-Orte
        r = A.evaluate(f"""async () => {{ const s={J}; const out = []; for (let i=0;i<40;i++) {{ const k = await s.generiereKt('online'); if (!k) continue; const d = k.wahr.d; out.push({{ von: d.von.label, nach: d.nach.label, vk: d.von.khId||'', nk: d.nach.khId||'', ve: d.von.einrichtung||'', ne: d.nach.einrichtung||'', km: Math.round(Math.hypot((d.von.lat-d.nach.lat)*111, (d.von.lon-d.nach.lon)*74)) }}); }} return out; }}""")
        gleich = [x for x in r if x["vk"] and x["vk"] == x["nk"]]
        check(not gleich, f"#231 nie dasselbe Haus ({len(r)} KT)")
        einr = [x for x in r if x["ve"] or x["ne"]]
        print("    Einrichtungen:", [(x["von"], x["ve"], "→", x["nach"]) for x in einr][:4])
        print("    weiteste Fahrten (km):", sorted(x["km"] for x in r)[-5:])
        check(max(x["km"] for x in r) <= 75, "keine Fahrten quer durch NÖ")
        a = A.evaluate(f"""async () => {{ const s={J}; const L=window.__lw; for (let i=0;i<200;i++) {{ const k = await s.generiereKt('hotline'); if (k && k.wahr.d.von.einrichtung === 'Ordination') return [k.wahr.d.von.label, L.ktAntwortOhneKi(k, {{id:'von', text:''}}), L.kt.ktPrompt(k).split('\\n').find(l => l.startsWith('Abholort'))]; }} return null; }}""")
        print("    Ordination:", a)
        check(a is not None and "Ordination" in a[1] and "zu Hause" not in a[1] and "Wohnadresse" not in a[2], "Ordination: „bei uns in der Ordination“, nicht „zu Hause“")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
