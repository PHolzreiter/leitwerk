# Beta 81 (Tickets 18–24, Paul 25./26.11.2026): Protokoll untereinander + „Änderung“ mit nur dem Geänderten; kein alter Funk
# nach dem Beitreten; Zusammenlegen beendet das Gespräch; NAH-Transport ohne Notarzt-Nachforderung; Sichtmeldung kurz;
# Großschaden: „noch nicht geborgen“, Rot vor Grün, manuelle Zuteilung (verschieben, Lücke füllen, festgelegt/automatisch).
# Aufruf: python3 beta81test.py <arbeitsordner> <web-build>
import subprocess, sys, time, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
sys.path.insert(0, __file__.rsplit("/", 1)[0])
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8982", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
src = open(__file__.rsplit("/", 1)[0] + "/gstest.py", encoding="utf-8").read()
HELFER = src[src.index('HELFER = """') + 12: src.index('"""', src.index('HELFER = """') + 12)]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8982/?debug&seed=8982"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; st.acnAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
        A.evaluate(HELFER)

        # 1) #18 Erstaufnahme untereinander, spätere Änderung nur mit dem Geänderten
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.state.einsaetze = []; s.settings.rufhilfeAufnahme = 'extern'; const e0 = await s.generiereFall('rufhilfe_sturz', 'B'); const id = e0.id;
            const a = { ...s.einsatz(id).anruf.antworten };
            const e = s.einsatz(id); const n0 = e.protokoll.length;
            const erst = e.protokoll.find(p => p.text.startsWith('*** Erstaufnahme'));
            s.abfrageSetze(id, 'alter', (a.alter || 30) + 7); const n1 = e.protokoll.length; const t1 = e.protokoll[n1 - 1].text;
            s.abfrageSetze(id, 'geschlecht', a.geschlecht === 'm' ? 'w' : 'm'); const n2 = e.protokoll.length; const t2 = e.protokoll[n2 - 1].text;
            s.abfrageSetze(id, 'alter', a.alter); s.abfrageSetze(id, 'geschlecht', a.geschlecht); const n3 = e.protokoll.length;
            s.state.zeit += 2 * 60000; s.abfrageSetze(id, 'alter', (a.alter || 30) + 1); s.state.zeit += 2 * 60000; s.abfrageSetze(id, 'alter', (a.alter || 30) + 2); const n4 = e.protokoll.length;
            return { id, erst: erst && erst.text, n0, n1, n2, n3, n4, t1, t2 }; }""")
        print("    " + r["t1"].replace("\n", "\n    ")); print("    " + r["t2"].replace("\n", "\n    "))
        check(r["erst"] and r["erst"].count("\n") >= 4, "Erstaufnahme mit Zeilenumbrüchen")
        check(r["n1"] == r["n0"] + 1 and r["t1"].startswith("*** Änderung") and len(re.findall(r"^\d+\.", r["t1"], re.M)) == 1, "Änderung: eigener Eintrag mit nur dem geänderten Punkt")
        check(r["n2"] == r["n1"] and len(re.findall(r"^\d+\.", r["t2"], re.M)) == 2, "zweite Änderung gleich danach: im selben Eintrag")
        check(r["n3"] == r["n0"], "zurückgeändert: Änderungs-Eintrag wieder weg")
        check(r["n4"] == r["n0"] + 2, "spätere Änderungen (> 1 min): je ein eigener Eintrag")
        A.evaluate("(id) => window.__lw.sel.waehle('einsatz', id)", r["id"]); A.wait_for_timeout(800)
        loc = A.locator(".prot > span:not(.t)")
        ws = loc.first.evaluate("(x) => getComputedStyle(x).whiteSpace") if loc.count() else None
        if ws is None: A.screenshot(path=f"{S}/beta81_maske.png")
        check(ws == "pre-line", f"Einsatzmaske: Protokoll zeigt die Zeilen untereinander ({ws})")

        # 2) #19 ganzer Spielstand neu (Beitreten): alte Funksprüche nicht vorlesen
        r = A.evaluate("""async () => { const L = window.__lw, s = L.sim; const z = L.funkVorleseZaehler; const n0 = z.n;
            const neu = structuredClone(s.state); neu.funkGespraeche = [...(neu.funkGespraeche || []), { id: 99001, fzId: 'x', funkname: 'RTW Test', an: null, fuehrer: null, sprueche: [{ von: 'RTW Test', text: 'Hier RTW Test, kommen' }, { von: 'LEO', text: 'Hier LEO, kommen' }] }];
            L.spiegelUebernehmen(neu); s.notify(); await new Promise(r => setTimeout(r, 300)); const n1 = z.n;
            const g = s.state.funkGespraeche.find(x => x.id === 99001); g.sprueche.push({ von: 'RTW Test', text: 'Hier RTW Test, verstanden' }); s.notify(); await new Promise(r => setTimeout(r, 300));
            s.state.funkGespraeche = s.state.funkGespraeche.filter(x => x.id !== 99001); return { n0, n1, n2: z.n }; }""")
        check(r["n1"] == r["n0"] and r["n2"] == r["n0"] + 1, f"nach dem Beitreten: alter Funk nicht vorgelesen, neuer schon ({r})")

        # 3) #21 NAH fliegt den Patienten: der RTW wartet nicht auf einen Notarzt
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e0 = await s.generiereFall('kind_platzwunde'); const e = s.einsatz(e0.id);
            const rtw = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'RTW' && !f.einsatzId); const nah = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'NAH' && !f.einsatzId && !f.pilot);
            if (!rtw || !nah) return { skip: true };
            e.fahrzeuge.push(rtw.id, nah.id); rtw.einsatzId = e.id; nah.einsatzId = e.id; rtw.phase = 'vorOrt'; nah.phase = 'anfahrt'; nah.begleitet = true; e.nahEntscheid = nah.id; e.naAngekuendigt = true;
            const warten = s.wartetAufNotarzt(rtw, e, s.state.zeit);
            rtw.einsatzId = null; nah.einsatzId = null; rtw.phase = 'frei'; nah.phase = 'frei'; nah.begleitet = false; e.zustand = 'abgeschlossen';
            return { warten }; }""")
        if not r.get("skip"): check(r["warten"] is False, "NAH transportiert: RTW wartet nicht auf einen Notarzt (keine Nachforderung)")

        # 4) #22 Sichtmeldung kurz, ohne Wiederholungen; „Übernehme Einsatzleitung“ nur ohne BEL
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.state.einsaetze = []; s.state.zeit = Date.parse('2026-10-20T07:40:00');
            const id = await s.grossschadenAusloesen('gs_tunnel_duernstein'); const e = s.einsatz(id); const w = e.wahr.gs;
            s.anrufAnnehmen(e.id); s.abfrageSetze(e.id, 'anzahl_patienten', '6-10'); s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            if (!e.gs) return { a: 'kein gs', b: '', id };
            const a = s.gsSichtText(e, w); e.gs.bel = true; const b = s.gsSichtText(e, w); e.gs.bel = false; return { a, b, id }; }""")
        print("    📻", r["a"])
        check(r["a"].startswith("Sichtmeldung, Meldung bestätigt:") and r["a"].endswith("Übernehme Einsatzleitung"), "Sichtmeldung nach Schema, übernimmt die Einsatzleitung")
        check(r["a"].lower().count("fahrzeugbrand") <= 1 and "Wir sehen" not in r["a"] and len(r["a"]) < len(r["a"]) + 1, f"keine Wiederholungen ({r['a'].lower().count('fahrzeugbrand')}× Fahrzeugbrand)")
        check(not r["b"].endswith("Übernehme Einsatzleitung"), "mit BEL: keine Übernahme der Einsatzleitung")

        # 5) #20 Zusammenlegen beendet das Gespräch
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; const e = s.einsatz(id); const w = e.wahr.gs;
            s.state.zeit = Math.max(...w.anrufe.map(a => a.um)) + 1000; s.gsTick(s.state.zeit);
            const z = s.state.einsaetze.find(x => x.gsZu === id); if (!z) return { skip: true };
            s.anrufAnnehmen(z.id); const vor = s.einsatz(z.id).anruf.status; s.zusammenlegen(z.id, id); const n = s.einsatz(z.id);
            return { vor, nach: n.anruf.status, zu: n.zustand }; }""", r["id"])
        if not r.get("skip"): check(r["vor"] == "aktiv" and r["nach"] == "beendet" and r["zu"] == "abgeschlossen", f"Zusammenlegen: Gespräch beendet ({r})")

        # 6) #23 Großschaden durchspielen bis zur Lage (Tunnel: eingeklemmte Person)
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.state.einsaetze = []; s.state.partnerFz = []; s.funkFestNach = 0; s.state.zeit = Date.parse('2026-10-20T07:10:00');
            const id = await s.grossschadenAusloesen('gs_tunnel_duernstein'); const e = s.einsatz(id);
            s.anrufAnnehmen(e.id); s.abfrageSetze(e.id, 'anzahl_patienten', '6-10');
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            let v = await s.vorschlaege(e.id); s.alarmiere(e.id, s.empfehlung(e.id, v).ids); s.partnerAnfordern(e.id, 'fw'); s.partnerAnfordern(e.id, 'pol');
            s.gsBr(e.id, s.gsBrVorschlag(e.id)); v = await s.vorschlaege(e.id); s.alarmiere(e.id, s.empfehlung(e.id, v).ids);
            const g = window.__gs; for (let i = 0; i < 200 && !(e.gs.phase === 'lage' && e.gs.gezeigt.length >= e.wahr.gs.patienten.length); i++) await g.schritt(15000);
            const fw = e.wahr.gs.patienten.filter(p => p.fw).map(p => ({ nr: p.nr, s: p.sichtung, ab: e.gs.erreichbar[p.nr], jetzt: s.state.zeit }));
            return { id, phase: e.gs.phase, gezeigt: e.gs.gezeigt.length, n: e.wahr.gs.patienten.length, fw }; }""")
        gid = r["id"]; print("   ", r)
        check(r["phase"] == "lage" and r["gezeigt"] >= 3, f"Großschaden bis zur Lagemeldung ({r['phase']}, {r['gezeigt']} Patienten)")
        fw = [x for x in r["fw"] if x["ab"] and x["ab"] > x["jetzt"]]
        if fw:
            A.evaluate("() => window.__lw.panelZeigen && window.__lw.panelZeigen('grosseinsatz')"); A.wait_for_timeout(900)
            reiter = A.get_by_text("Patienten", exact=True)
            if reiter.count(): reiter.first.click(); A.wait_for_timeout(600)
            txt = " | ".join(A.locator(".pz").evaluate_all("(l) => l.map(x => x.getAttribute('title'))"))
            check("noch nicht geborgen" in txt and "transportbereit" not in txt.split("noch nicht geborgen")[0][-60:], f"nicht befreiter Patient: „noch nicht geborgen“ ({[t for t in txt.split(' | ') if 'geborgen' in t][:1]})")
        # 7) Rot vor Grün: bis alle erreichbar sind – jeder erreichbare Rote hat ein Transportmittel, sobald einer am Einsatzort frei ist
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; const e = s.einsatz(id); const g = window.__gs; const w = e.wahr.gs; const fehl = [];
            for (let i = 0; i < 120; i++) { await g.schritt(15000);
              for (const p of w.patienten) { if (p.sichtung !== 'rot' || !e.gs.gezeigt.includes(p.nr)) continue; const ab = e.gs.erreichbar[p.nr];
                if (ab === undefined || ab > s.state.zeit - 2 * 15000) continue;
                const k = s.einsatz(e.gs.kinder[p.nr]); if (!k || k.zustand === 'abgeschlossen') continue;
                const hat = s.einsatzFz(k).some(x => s.transportfaehig(x) || x.kategorie === 'NAH'); const gruenHat = w.patienten.filter(q => q.sichtung === 'gruen' && s.einsatzFz(s.einsatz(e.gs.kinder[q.nr]) || { fahrzeuge: [] }).some(x => s.transportfaehig(x) && x.phase === 'vorOrt' && x.status === 'amBO')).length;
                if (!hat && gruenHat) fehl.push({ nr: p.nr, t: i }); }
              if (w.patienten.every(p => p.sichtung === 'tot' || (e.gs.erreichbar[p.nr] ?? Infinity) < s.state.zeit - 60000)) break; }
            return { fehl: fehl.slice(0, 3) }; }""", gid)
        check(not r["fehl"], f"erreichbarer Roter nie ohne Transport, während ein Grüner einen RTW am Einsatzort hat ({r['fehl']})")
        # 8) manuelle Zuteilung: Fahrzeug eines anderen Patienten verschieben, Lücke wird gefüllt, festgelegt bleibt
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; const e = s.einsatz(id); const g = window.__gs; const w = e.wahr.gs;
            const offen = (nr) => { const k = s.einsatz(e.gs.kinder[nr]); return k && k.zustand !== 'abgeschlossen' && !s.einsatzFz(k).some(x => x.status === 'zumZO' || x.status === 'amZO') ? k : null; };
            let A_ = null, B_ = null, fz = null;
            for (let i = 0; i < 40 && !(A_ && B_); i++) {
              for (const p of w.patienten) { const k = offen(p.nr); if (!k) continue; const x = s.einsatzFz(k).find(y => s.transportfaehig(y) && !y.pilot);
                if (x && !A_) { A_ = p.nr; fz = x; } else if (p.nr !== A_ && !B_ && p.sichtung !== 'tot') B_ = p.nr; }
              if (!(A_ && B_)) { A_ = null; B_ = null; await g.schritt(15000); } }
            if (!A_ || !B_) return { skip: true };
            const kB = s.einsatz(e.gs.kinder[B_]); const vorB = s.einsatzFz(kB).map(x => x.id);
            let fehler = ''; try { s.gsPatientZuteilen(id, B_, [fz.id]); } catch (x) { fehler = String(x.message); }
            const nachB = s.einsatzFz(kB).map(x => x.id); const fest = !!(e.gs.fest || {})[B_]; const vorgemerkt = (e.gs.fuer || {})[fz.id];
            const kA = s.einsatz(e.gs.kinder[A_]);
            const fzBeiA = s.einsatzFz(kA).some(x => x.id === fz.id);
            for (let i = 0; i < 16; i++) await g.schritt(15000);
            const bleibt = s.einsatzFz(kB).filter(x => x.status !== 'zumZO' && x.status !== 'amZO').every(x => x.id === fz.id) || s.einsatzFz(kB).some(x => x.id === fz.id) || kB.zustand === 'abgeschlossen';
            const aHatWas = kA.zustand === 'abgeschlossen' || s.einsatzFz(kA).length > 0 || s.gsVersorgt(e, A_);
            let fehl2 = ''; try { s.gsPatientZuteilen(id, B_, ['gibtsnicht']); } catch (x) { fehl2 = String(x.message); }
            s.gsPatientAutomatisch(id, B_); const auto = !(e.gs.fest || {})[B_];
            const prot = e.protokoll.slice(-12).map(p => p.text).filter(t => /Leitstelle|automatisch/.test(t));
            return { A: A_, B: B_, fz: fz.funkrufname, fehler, vorB, nachB, fest, vorgemerkt, fzBeiA, bleibt, aHatWas, fehl2, auto, prot }; }""", gid)
        print("   ", {k: v for k, v in r.items() if k != "prot"}); [print("     ", t) for t in r.get("prot", [])]
        if not r.get("skip"):
            check(not r["fehler"] and r["fest"] and (r["fz"] and (r["vorgemerkt"] == r["B"] or len(r["nachB"]) == 1)), f"Zuteilen: {r['fz']} von Patient {r['A']} zu Patient {r['B']} ({r['fehler']})")
            check(not r["fzBeiA"], "verschobenes Fahrzeug ist nicht mehr beim alten Patienten")
            check(r["bleibt"], "festgelegter Patient: die Einsatzleitung ändert nichts")
            check(r["aHatWas"], "Lücke beim alten Patienten wird von der Einsatzleitung gefüllt")
            check("gehört nicht" in r["fehl2"] or "nicht" in r["fehl2"], f"fremdes Fahrzeug abgelehnt ({r['fehl2']})")
            check(r["auto"], "Wieder automatisch")
        # Fenster: Knopf „Fahrzeuge“ und Dialog
        A.evaluate("() => window.__lw.panelZeigen && window.__lw.panelZeigen('grosseinsatz')"); A.wait_for_timeout(800)
        reiter = A.get_by_text("Patienten", exact=True)
        if reiter.count(): reiter.first.click(); A.wait_for_timeout(600)
        kn = A.locator(".pz .khz button", has_text="Fahrzeuge")
        if kn.count():
            kn.first.click(); A.wait_for_timeout(500)
            check(A.locator(".dlg .gs-zuteilen .gs-zt-zeile").count() > 0, f"Dialog „Fahrzeuge“ mit Fahrzeugen des Großeinsatzes ({A.locator('.dlg .gs-zt-zeile').count()})")
            A.screenshot(path=f"{S}/beta81_zuteilen.png"); A.keyboard.press("Escape")
        else:
            A.screenshot(path=f"{S}/beta81_gs.png"); check(False, "Knopf „Fahrzeuge“ je Patient")
        for l in logs[:8]: print("    ", l[:300])
        check(not [l for l in logs if l.startswith("PAGEERROR")], "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
