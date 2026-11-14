import subprocess, sys, time, json, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8818", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8818/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        # 1) Themen erkennen
        t = A.evaluate("""() => { const T = window.__lw.verstehen.themenErkennen; return Object.fromEntries([
          'atmet er noch normal', 'is er wach', 'wie alt is ihr mann ungefähr', 'seit wann ist das so', 'hat er was mit dem herz',
          'nimmt er medikamente', 'blutet es stark', 'ist sonst noch wer bei ihnen', 'wie heißt er', 'wie heißen sie', 'ist er blass',
          'schwitzt er', 'ist sie schwanger', 'atmet er und reagiert er'].map(x => [x, T(x)])); }""")
        print("   ", t)
        erw = {'atmet er noch normal': ['atmung'], 'is er wach': ['bewusstsein'], 'wie alt is ihr mann ungefähr': ['alter'], 'seit wann ist das so': ['zeit'], 'hat er was mit dem herz': ['vorerkrankung'], 'nimmt er medikamente': ['medikamente'], 'blutet es stark': ['blutung'], 'ist sonst noch wer bei ihnen': ['dabei'], 'wie heißt er': ['name_patient'], 'wie heißen sie': ['name_anrufer'], 'ist er blass': ['haut'], 'schwitzt er': ['schweiss'], 'ist sie schwanger': ['schwanger']}
        check(all(t[k] == v for k, v in erw.items()), "freie Fragen werden dem richtigen Thema zugeordnet")
        check(set(t['atmet er und reagiert er']) == {'atmung', 'bewusstsein'}, "zwei Themen in einer Frage")
        # 2) Prüfen gegen die Wahrheit (Brustschmerz: wach, atmet normal)
        r = A.evaluate("""async () => { const L = window.__lw; const V = L.verstehen; const e = await L.sim.probeFall('brustschmerz', '0'); const k = L.kontext(e); k.anrufer = { ...k.anrufer, selbst: false };
          k.wahrheit.at = 'normal'; k.wahrheit.bw = 'ja';
          const P = (th, a) => V.antwortPruefen(k, th, V.antwortKern(k, th), a);
          return { falschAt: P(['atmung'], 'Er kriegt ganz schlecht Luft.'), richtigAt: P(['atmung'], 'Er atmet ganz normal.'), falschBw: P(['bewusstsein'], 'Er reagiert gar nicht mehr.'),
            richtigBw: P(['bewusstsein'], 'Ja, er ist wach und redet mit mir.'), zeit: P(['zeit'], 'Seit dem Mittagessen ungefähr.'), seit: k.szenario.seitMin,
            kern: V.antwortKern(k, ['atmung', 'zeit']).saetze }; }""")
        print("   ", r)
        check(r["falschAt"] and not r["richtigAt"], "Atmung: falsche Antwort erkannt, richtige durchgelassen")
        check(r["falschBw"] and not r["richtigBw"], "Bewusstsein: falsche Antwort erkannt, richtige durchgelassen")
        check(r["zeit"] if r["seit"] < 180 else True, "Zeit: „seit dem Mittagessen“ bei kurzer Dauer erkannt")
        # 3) Neu erzeugen: erste Antwort falsch, zweite richtig
        r = A.evaluate("""async () => { const L = window.__lw; L.kiPrefsSetzen({ ablauf: 'neu' }); let n = 0, korr = 0;
          L.kiTest.chat = async (msgs, on) => { n++; const c = msgs[msgs.length - 1].content; if (/Korrektur/.test(c)) korr++; const t = /Korrektur/.test(c) ? 'Nein, nein, er atmet ganz normal.' : 'Er kriegt ganz schlecht Luft.'; on(t); return t; };
          const e = await L.sim.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; const k = L.kontext(e); k.anrufer = { ...k.anrufer, selbst: false }; k.wahrheit.at = 'normal';
          const q = { wert: 'ki' }; let gezeigt = []; const a = await L.anruferAntwort(e, k, 'atmet er noch normal', undefined, (t) => gezeigt.push(t), q);
          return { a, n, korr, q, gezeigt }; }""")
        print("   ", r)
        check(r["korr"] == 1 and "normal" in r["a"] and r["q"].get("nachgebessert"), "falsche Antwort wird einmal neu erzeugt")
        check(not any("schlecht" in x for x in r["gezeigt"]), "die falsche Antwort wird nie angezeigt bzw. vorgelesen")
        # 4) zweimal falsch → feste Antwort aus dem Kern
        r = A.evaluate("""async () => { const L = window.__lw;
          L.kiTest.chat = async (msgs, on) => { const t = 'Er kriegt ganz schlecht Luft.'; on(t); return t; };
          const e = await L.sim.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; const k = L.kontext(e); k.anrufer = { ...k.anrufer, selbst: false }; k.wahrheit.at = 'normal';
          const q = { wert: 'ki' }; const a = await L.anruferAntwort(e, k, 'atmet er normal?', undefined, undefined, q); return { a, q }; }""")
        print("   ", r)
        check(r["q"]["wert"] == "fest" and "schlecht" not in r["a"], "zweimal falsch: feste, richtige Antwort")
        # 5) klassisch: keine Prüfung
        r = A.evaluate("""async () => { const L = window.__lw; L.kiPrefsSetzen({ ablauf: 'klassisch' });
          const e = await L.sim.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; const k = L.kontext(e); k.anrufer = { ...k.anrufer, selbst: false }; k.wahrheit.at = 'normal';
          const q = { wert: 'ki' }; const a = await L.anruferAntwort(e, k, 'atmet er normal?', undefined, undefined, q); L.kiPrefsSetzen({ ablauf: 'neu' }); L.kiTest.chat = null; return { a, q }; }""")
        check("schlecht" in r["a"] and not r["q"].get("nachgebessert"), "Ablauf „klassisch“ verhält sich wie bisher")
        # 6) Kern-Hinweis kommt bei freier Frage an
        r = A.evaluate("""async () => { const L = window.__lw; let hinweis = '';
          L.kiTest.chat = async (msgs, on) => { hinweis = msgs[msgs.length - 1].content; on('Ja.'); return 'Ja.'; };
          const e = await L.sim.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; const k = L.kontext(e); k.anrufer = { ...k.anrufer, selbst: false };
          await L.anruferAntwort(e, k, 'wie alt is er denn', undefined, undefined, { wert: 'ki' }); L.kiTest.chat = null; return hinweis; }""")
        print("   ", r[-300:])
        check("Die ehrliche Antwort darauf ist" in r, "freie Frage bekommt den Antwortkern als Hinweis")
        # 8) Anweisungen: geht das? Maßnahmen merken, Stimmung
        r = A.evaluate("""async () => { const L = window.__lw; const V = L.verstehen; let letzte = '';
          L.kiTest.chat = async (msgs, on) => { letzte = msgs[msgs.length - 1].content; const t = /Saft/.test(letzte) ? 'Okay, ich gebe ihm jetzt Saft.' : 'Okay, mach ich.'; on(t); return t; };
          const e = await L.sim.probeFall('kollaps', 'A'); e.anruf.status = 'aktiv'; const k = L.kontext(e); k.anrufer = { ...k.anrufer, selbst: false, emotion: 'panisch', art: 'privat' }; k.wahrheit.bw = 'nein'; k.wahrheit.at = 'normal';
          e.wahr.abfrage.anrufer = k.anrufer;
          const q1 = { wert: 'ki' }; const saft = await L.anruferAntwort(e, k, 'Geben Sie ihm bitte etwas Saft zu trinken.', undefined, undefined, q1);
          const q2 = { wert: 'ki' }; const seite = await L.anruferAntwort(e, k, 'Legen Sie ihn bitte in die stabile Seitenlage.', undefined, undefined, q2);
          const k2 = L.kontext(e); const prompt = L.systemPrompt(k2);
          await L.anruferAntwort(e, k2, 'Die Rettung ist schon unterwegs.', undefined, undefined, { wert: 'ki' });
          const stimmungHinweis = letzte;
          k.wahrheit.bw = 'ja';
          const rea = L.verstehen.antwortKern ? null : null;
          L.kiTest.chat = null;
          return { saft, q1, seite, massnahmen: e.wahr.abfrage.massnahmen, imPrompt: prompt.includes('WAS DU AUF ANWEISUNG'), stimmungHinweis: stimmungHinweis.slice(-250) }; }""")
        print("   ", r)
        check(r["q1"]["wert"] == "fest" and "geht nicht" in r["saft"].lower(), "Bewusstlosem wird nichts zu trinken gegeben (Antwort korrigiert)")
        check(r["massnahmen"] and any("Seitenlage" in m for m in r["massnahmen"]) and r["imPrompt"], "ausgeführte Anweisung wird gemerkt und steht in der Fallakte")
        check("Du bist jetzt" in r["stimmungHinweis"], "Stimmung ändert sich nach „Die Rettung ist unterwegs“")
        # 7) Einstellung sichtbar
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
