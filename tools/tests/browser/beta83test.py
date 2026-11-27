# Beta 83 (Paul 27.11.2026): Stimmen – Stimme nach Alter und Geschlecht, Stimmung realistisch je Anruf,
# Beruhigen und hektische Leitstelle (nie endlos), Telefonverhalten, Affective Dialog mit Rückfall,
# Geräusche folgen dem Zustand des Patienten, NÖ-Färbung vorbereitet (Probehör-Blatt).
# Aufruf: python3 beta83test.py <arbeitsordner> <web-build>
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
HIER = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HIER, "..", "..", ".."))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8984", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    # 0) Probehör-Blatt: gleicher NÖ-Text wie im Spiel, alle 30 Stimmen, gleiche Vorschläge
    html = open(os.path.join(REPO, "tools", "stimmen", "probehoeren.html"), encoding="utf-8").read()
    anrufer = open(os.path.join(REPO, "src", "abfrage", "anrufer.ts"), encoding="utf-8").read()
    import re
    noe_spiel = re.search(r'export const NOE_TEXT =\s*"([^"]+)"', anrufer).group(1)
    noe_blatt = re.search(r'const NOE_TEXT = "([^"]+)"', html).group(1)
    check(noe_spiel == noe_blatt, "NÖ-Text im Probehör-Blatt gleich wie im Spiel")
    check("schluessel" in html and "localStorage" not in html, "Probehör-Blatt speichert den Schlüssel nicht")
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8984/?debug&seed=8984"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.rufhilfeAufnahme = 'selbst'; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)

        # 1) Stimmen-Tabelle: alle 30 genau einmal, Stimme passt zur Altersgruppe; Blatt schlägt dasselbe vor
        r = A.evaluate("""() => { const St = window.__lw.stimmen, T = St.STIMMEN_ALTER; const alle = [...Object.values(T.w).flat(), ...Object.values(T.m).flat()];
            const falsch = []; for (const g of ['w', 'm']) for (const [n, j] of [['jung', 22], ['mittel', 45], ['alt', 78]]) for (let i = 0; i < 40; i++) { const v = St.stimmeFuer(g, 'x' + i, j); if (!T[g][n].includes(v)) falsch.push(g + n + v); }
            return { n: alle.length, einzig: new Set(alle).size, w: Object.values(T.w).flat().length, falsch, tabelle: T }; }""")
        check(r["n"] == 30 and r["einzig"] == 30 and r["w"] == 14, f"30 Stimmen je einmal ({r['n']}/{r['einzig']}, {r['w']} Frauen)")
        check(not r["falsch"], f"Stimme passt zur Altersgruppe ({r['falsch'][:4]})")
        blatt_ok = all(f'["{v}", "{g}", ' in html and html.split(f'["{v}", "{g}", ')[1].split("]")[0].endswith(f'"{grp}"') for g in ("w", "m") for grp, l in r["tabelle"][g].items() for v in l)
        check(blatt_ok, "Probehör-Blatt schlägt dieselbe Zuordnung vor")

        # 2) Alter der Person am Telefon: passt zur Rolle, fest pro Anrufer, Stimmbild nennt es
        r = A.evaluate("""async () => { const L = window.__lw, s = L.sim, St = L.stimmen; const out = { n: 0, falsch: [], wackelt: 0, bild: 0, emo: {}, profiRea: [], privatRuhig: 0, privat: 0 };
            const faelle = L.faelle.alleFaelle().filter(f => f.gruppe !== 'rufhilfe').slice(0, 160);
            for (const f of faelle) { let e; try { e = await s.generiereFall(f.id); } catch (x) { continue; } const ab = e && e.wahr.abfrage; if (!ab) continue; out.n++;
              const a = ab.anrufer, pa = Number(ab.szenario?.patient?.alter ?? ab.antworten?.alter ?? 0) || null;
              const j = St.anruferAlter(a, e.id, pa); if (j !== St.anruferAlter(a, e.id, pa)) out.wackelt++;
              if (a.typ === 'eltern' && pa && pa < 14 && !(j >= 19 && j <= 62)) out.falsch.push('eltern ' + j);
              if (a.typ === 'kind' && pa && pa >= 70 && !(j >= 22 && j <= 70)) out.falsch.push('kind ' + j);
              if (a.selbst && pa && j !== pa) out.falsch.push('selbst ' + j + '/' + pa);
              const bild = St.stimmBild(a, e.id, pa ?? undefined); if (/(jung|mittleres Alter|älter|alt|jugendlich)/.test(bild)) out.bild++;
              if ((a.art ?? 'privat') === 'privat') { out.privat++; if (a.emotion === 'ruhig') out.privatRuhig++; out.emo[a.emotion] = (out.emo[a.emotion] || 0) + 1; }
              if (['pflege', 'arzt'].includes(a.typ) && ab.antworten?.bw === 'nein' && ['keine', 'agonal'].includes(ab.antworten?.at)) out.profiRea.push(a.emotion);
              e.anruf.status = 'verpasst'; e.zustand = 'abgeschlossen'; }
            s.state.einsaetze = []; return out; }""")
        print("   ", r)
        check(r["n"] > 60 and not r["falsch"] and r["wackelt"] == 0, f"Alter passt zur Rolle und bleibt gleich ({r['falsch'][:5]})")
        check(r["bild"] == r["n"], "Stimmbild nennt das Alter")
        check(r["privat"] > 30 and r["privatRuhig"] / r["privat"] < 0.15, f"private Anrufer selten ganz ruhig ({r['privatRuhig']} von {r['privat']})")
        check(len(set(r["emo"])) >= 4, f"Stimmungen gemischt ({r['emo']})")
        check(all(x != "ruhig" for x in r["profiRea"]), f"Pflege/Arzt bei Reanimation nicht ruhig ({r['profiRea']})")
        r = A.evaluate("""() => { const L = window.__lw; const emo = { rea: {}, sonst: {} }; let i = 0; const rnd = () => { i = (i * 9301 + 49297) % 233280; return i / 233280; };
            for (let n = 0; n < 300; n++) for (const [k, a] of [['rea', { bw: 'nein', at: 'keine', alter: 84 }], ['sonst', { bw: 'ja', at: 'normal', alter: 84 }]]) {
              const x = L.anruferWaehlen('', a, rnd, '', { typen: ['pflege'], ort: 'Pflegeheim', ortArt: 'pflegeheim' }, { arten: ['pflegeheim'] }); if (x.typ !== 'pflege') continue; emo[k][x.emotion] = (emo[k][x.emotion] || 0) + 1; }
            return emo; }""")
        print("   ", r)
        check(not r["rea"].get("ruhig") and (r["rea"].get("aufgeregt", 0) + r["rea"].get("panisch", 0)) > 0 and set(r["sonst"]) == {"ruhig"}, f"Pflegeheim: sonst ruhig, bei Reanimation auch hektisch ({r})")

        # 3) Stimmungsverlauf: beruhigen hilft, Hektik regt auf (höchstens 1 über Anfang, mit Pause), große Panik hält nie ewig
        r = A.evaluate("""async () => { const L = window.__lw, s = L.sim, St = L.stimmen; let e = null;
            for (const id of ['sturz_leiter', 'sturz', 'atemnot', 'brustschmerz']) { try { e = await s.generiereFall(id); } catch (x) {} if (e && e.wahr.abfrage && (e.wahr.abfrage.anrufer.art ?? 'privat') === 'privat') break; }
            const ab = e.wahr.abfrage; ab.anrufer.emotion = 'aufgeregt'; ab.stimmung = undefined; const k = L.kontext(e); k.anrufer.emotion = 'aufgeregt';
            const g = e.anruf.gespraech; g.length = 0; const sag = (von, text, alt = 60000) => g.push({ zeit: 0, echt: Date.now() - alt, von, text });
            const st = () => ab.stimmung.stufe; const out = {};
            St.stimmungHinweis(e, k, 'frage', 'Wie alt ist er?', null); out.start = st(); sag('leitstelle', 'Wie alt ist er?'); sag('anrufer', '70.');
            out.hHinweis = St.stimmungHinweis(e, k, 'frage', 'Antworten Sie endlich!', null); out.hektisch = st(); sag('leitstelle', 'Antworten Sie endlich!'); sag('anrufer', 'Ja, ja …');
            St.stimmungHinweis(e, k, 'frage', 'Sagen Sie mir jetzt die Adresse!', null); out.nochmal = st();
            for (let i = 0; i < 3; i++) { sag('leitstelle', 'Bitte?'); sag('anrufer', 'Ja.'); }
            St.stimmungHinweis(e, k, 'frage', 'Wie oft noch, antworten Sie mir!', null); out.nachPause = st();
            St.stimmungHinweis(e, k, 'mitteilung', 'Die Rettung ist schon unterwegs.', null); out.beruhigt = st();
            // schnelle Fragen hintereinander
            g.length = 0; for (let i = 0; i < 3; i++) g.push({ zeit: 0, echt: Date.now() - 2000, von: 'leitstelle', text: 'Frage ' + i });
            out.schnell = St.leitstelleHektisch(e, 'Atmet er?'); g.length = 0; out.langsam = St.leitstelleHektisch(e, 'Atmet er?');
            // Sicherheitsnetz
            ab.stimmung.stufe = 5; ab.stimmung.hochSeit = undefined; for (let i = 0; i < 2; i++) sag('anrufer', '…');
            St.stimmungHinweis(e, k, 'frage', 'Wo sind Sie?', null); const vorher = st(); for (let i = 0; i < 5; i++) sag('anrufer', 'Bitte!');
            St.stimmungHinweis(e, k, 'frage', 'Wo sind Sie?', null); out.netz = [vorher, st()];
            e.anruf.status = 'verpasst'; e.zustand = 'abgeschlossen'; s.state.einsaetze = [];
            return out; }""")
        print("   ", r)
        check(r["start"] == 2 and r["hektisch"] == 3 and "hektisch" in (r["hHinweis"] or ""), f"Hektik regt auf ({r['start']} → {r['hektisch']})")
        check(r["nochmal"] == 3 and r["nachPause"] == 3, f"höchstens eine Stufe über dem Anfang ({r['nochmal']}, {r['nachPause']})")
        check(r["beruhigt"] < r["nachPause"], f"„Rettung ist unterwegs“ beruhigt ({r['beruhigt']})")
        check(r["schnell"] and not r["langsam"], "viele Fragen kurz hintereinander = hektisch")
        check(r["netz"][0] == 5 and r["netz"][1] == 4, f"große Panik hält nicht ewig ({r['netz']})")

        # 4) Mitschrift ohne Regieanweisungen; Telefonverhalten im Prompt
        r = A.evaluate("""() => window.__lw.stimmen.ohneRegie('*schluchzt* Er atmet nicht (seufzt) mehr … [atmet schwer] bitte!')""")
        check(r == "Er atmet nicht mehr … bitte!", f"Regieanweisungen raus: {r}")

        # 5) Affective Dialog: wird verlangt; lehnt das Modell ab, verbindet es ohne und merkt sich das
        r = A.evaluate("""async () => { const L = window.__lw, St = L.stimmen; localStorage.removeItem('leitwerk.gemini.affektiv'); const echt = window.WebSocket; const setups = [];
            class Fake { static OPEN = 1; constructor(u) { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 10); }
              send(d) { const m = JSON.parse(d); if (m.setup) { setups.push(m.setup); if (m.setup.generationConfig.enableAffectiveDialog) setTimeout(() => { this.readyState = 3; this.onclose && this.onclose({ code: 1007, reason: 'Request contains an invalid argument.' }); }, 10);
                else setTimeout(() => this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }), 10); }
                else if (m.clientContent && m.clientContent.turnComplete) setTimeout(() => { this.onmessage({ data: JSON.stringify({ serverContent: { outputTranscription: { text: 'Verbindung steht.' } } }) }); this.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) }); }, 10); }
              close() { this.readyState = 3; } }
            window.WebSocket = Fake; const vorher = St.affektivMoeglich(); L.live.setLivePrefs({ schluessel: 'testschluessel-1234567890' }); let t = '';
            try { t = await L.live.liveTesten(); } catch (x) { t = 'FEHLER ' + x.message; }
            const nachher = St.affektivMoeglich(); window.WebSocket = echt; L.live.setLivePrefs({ schluessel: '' }); localStorage.removeItem('leitwerk.gemini.affektiv');
            return { vorher, nachher, t, n: setups.length, erst: !!setups[0]?.generationConfig.enableAffectiveDialog, dann: !!setups[1]?.generationConfig.enableAffectiveDialog, stimme: setups[0]?.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
              zusatz: /Moment …/.test(setups[1]?.systemInstruction.parts[0].text || '') && /ECHTE GEFÜHLE/.test(setups[1]?.systemInstruction.parts[0].text || '') }; }""")
        print("   ", r)
        check(r["vorher"] and r["erst"] and not r["dann"] and r["n"] == 2, "Affective Dialog verlangt, bei Ablehnung ohne neu verbunden")
        check(r["t"].startswith("Verbindung steht") and not r["nachher"], f"Verbindung steht trotzdem, gemerkt ({r['t']})")
        check(r["zusatz"], "Telefonverhalten („Moment …“) und echte Gefühle im Prompt")
        r = A.evaluate("() => { const f = window.__lw.stimmen.affektivAbgelehnt; return [f(1007, 'Request contains an invalid argument.'), f(1007, 'Unknown name \"enableAffectiveDialog\"'), f(1008, 'API key not valid'), f(1011, 'Quota exhausted'), f(1006, '')]; }")
        check(r == [True, True, False, False, False], f"Rückfall nur bei ungültiger Anfrage, nicht bei Schlüssel/Kontingent ({r})")

        # 6) Geräusche folgen dem Zustand: Stöhnen, dann bewusstlos mit Schnappatmung → Röcheln, kein Stöhnen
        r = A.evaluate("""async () => { const L = window.__lw, s = L.sim, T = L.telefonKlang; L.live.setLivePrefs({ hintergrund: 'realistisch', klang: true });
            const e = await s.generiereFall('sturz_leiter'); const ab = e.wahr.abfrage; ab.antworten.bw = 'ja'; ab.antworten.at = 'normal';
            const tags = (pl) => pl.ereignisse.map(([k]) => k);
            const vorher = tags(T.plan(e)); T.wechsel.length = 0; T.starten(e); await new Promise(r => setTimeout(r, 800));
            ab.antworten = { ...ab.antworten, bw: 'nein', at: 'agonal' }; await new Promise(r => setTimeout(r, 3500));
            const j = T.jetzt(); const lauf = j ? tags(j.plan) : []; const wechsel = [...T.wechsel];
            ab.antworten = { ...ab.antworten, bw: 'nein', at: 'keine' }; const still = tags(T.plan(e)); T.stoppen(); L.live.setLivePrefs({ hintergrund: 'dezent' });
            e.anruf.status = 'verpasst'; e.zustand = 'abgeschlossen'; s.state.einsaetze = [];
            return { vorher, lauf, wechsel, still }; }""")
        print("   ", r)
        check("stoehnen" in r["vorher"] and "roecheln" not in r["vorher"], f"wach: Stöhnen, kein Röcheln ({r['vorher']})")
        check("roecheln" in r["lauf"] and "stoehnen" not in r["lauf"] and r["wechsel"], f"bewusstlos mit Schnappatmung: Röcheln, während der Anruf läuft ({r['lauf']}, {r['wechsel']})")
        check("roecheln" not in r["still"] and "stoehnen" not in r["still"], f"Atemstillstand: vom Patienten nichts ({r['still']})")
        for l in logs[:8]: print("    ", l[:300])
        check(not [l for l in logs if l.startswith("PAGEERROR")], "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
