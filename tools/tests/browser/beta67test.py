# Beta 67 (Tickets vom 18.11.2026): Großeinsatz mit Spieler-NAH – Patient festlegen ruft ihn aus dem BR ab und
# überschreibt die Versorgung (anderes Notarztmittel wird frei), mehrere Spieler-NAH ohne Doppelvergabe; Zahlen der
# Alarmierung live; BEL schickt nicht mehr benötigte Notarztmittel aus dem BR frei; RTW antwortet auf „entgegenkommen“;
# BLS gelb ohne Sondersignal.
# Aufruf: python3 beta67test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
HELFER = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gstest.py')).read().split('HELFER = """')[1].split('"""')[0]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8967", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8967/?debug&seed=8967"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; st.acnAktiv = false; st.tempoBeiNotruf = false; window.__lw.store.setSettings(st); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate(HELFER)
        # ---- Einstellungen: BLS gelb ohne Sondersignal (Ticket 1), auch bei alten gespeicherten Einstellungen
        st = A.evaluate("""() => { const s = window.__lw.store.settings; const bg = s.stufen.find(x => x.stufe === 'BLS gelb');
            return { neu: bg && bg.sondersignal, stand: s.stufenStand }; }""")
        check(st["neu"] is False, f"BLS gelb ohne Sondersignal ({st})")
        # ---- Großeinsatz mit zwei Spieler-NAH im Bereitstellungsraum
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.funkFestNach = 0; s.state.zeit = Date.parse('2026-10-20T10:10:00'); s.setWetter('klar');
            const id = await s.grossschadenAusloesen('gs_auffahr_s'); const e = s.einsatz(id);
            s.anrufAnnehmen(e.id); s.abfrageSetze(e.id, 'anzahl_patienten', '6-10'); s.anrufBeenden(e.id);
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            const v = await s.vorschlaege(e.id);
            const nahs = v.filter(x => x.fz.rmTyp === 'NAH' && !x.hinweis && !x.fz.ersatzFuer && x.sekunden !== null).slice(0, 2);
            if (nahs.length < 2) return { fehler: 'keine zwei NAH', n: nahs.length };
            // zwei Spieler: der zweite fliegt als „Tobi“
            s.pilotUebernehmen(nahs[0].fz.id);
            const w0 = s.wer.bind(s); s.wer = () => ({ ...w0(), pid: 'tobi', name: 'Tobi' }); try { s.pilotUebernehmen(nahs[1].fz.id); } finally { s.wer = w0; }
            const emp = s.empfehlung(e.id, v).ids.filter(x => s.state.fahrzeuge[x].rmTyp !== 'NAH');
            s.alarmiere(e.id, emp); s.partnerAnfordern(e.id, 'fw'); s.partnerAnfordern(e.id, 'pol');
            s.gsBr(e.id, s.gsBrVorschlag(e.id));
            const ids = nahs.map(n => n.fz.id);
            s.alarmiere(e.id, ids);
            for (const fid of ids) { const f = s.state.fahrzeuge[fid]; const w1 = s.wer.bind(s); s.wer = () => ({ ...w1(), pid: f.pilot.pid, name: f.pilot.name });
              try { s.pilotStatus(fid, 'alarmiert'); s.pilotStatus(fid, 'zumBO'); s.pilotFliegen(fid, 'bo'); s.pilotPosition(fid, e.gs.br.lat, e.gs.br.lon); s.pilotStatus(fid, 'amBO'); } finally { s.wer = w1; } }
            return { id: e.id, a: ids[0], b: ids[1], phase: ids.map(i => s.state.fahrzeuge[i].phase), ziel: ids.map(i => e.gs.ziel[i]) }; }""")
        print("   ", r)
        if "fehler" in r: raise SystemExit("Abbruch: " + json.dumps(r, ensure_ascii=False))
        eid, fa, fb = r["id"], r["a"], r["b"]
        check(r["phase"] == ["wartetBR", "wartetBR"], "zwei Spieler-NAH warten im Bereitstellungsraum")
        # gleich im BR: Patient für den zweiten Spieler-NAH festlegen → Einsatzleitung ruft ihn sofort ab
        r = A.evaluate("""(a) => { const s = window.__lw.sim; const e = s.einsatz(a.id); const f = s.state.fahrzeuge[a.b];
            const p = e.wahr.gs.patienten.find(x => x.sichtung === 'rot') || e.wahr.gs.patienten[0];
            let fehler = null; try { s.gsSpielerPatient(e.id, a.b, p.nr); } catch (x) { fehler = x.message; }
            return { nr: p.nr, fehler, ziel: e.gs.ziel[a.b], team: !!f.gsAmBr, log: e.protokoll.map(x => x.text).filter(t => /Abruf aus dem Bereitstellungsraum/.test(t)) }; }""", {"id": eid, "b": fb})
        print("   ", r)
        check(r["fehler"] is None and r["ziel"] == "bo" and r["team"] and any("für Patient" in x for x in r["log"]), f"Patient für Spieler-NAH im BR festgelegt: sofort abgerufen, Team wird gebracht")
        # bis Patienten bekannt sind (Lagemeldung), solange die NAH noch im BR stehen
        r = A.evaluate("""async (a) => { const s = window.__lw.sim; const e = s.einsatz(a.id); const g = window.__gs;
            for (let i = 0; i < 200 && !(e.gs.phase === 'lage' && Object.keys(e.gs.kinder).length >= 2); i++) await g.schritt(15000);
            // ein Patient mit Versorgung durch ein anderes Notarztmittel (wenn schon da), sonst der erste rote
            const pat = e.wahr.gs.patienten.filter(p => p.sichtung === 'rot' || p.sichtung === 'gelb');
            const ohnePilot = pat.filter(p => { const k = s.einsatz(e.gs.kinder[p.nr] || ''); return p.nr !== a.nrB && (!k || !s.einsatzFz(k).some(x => x.pilot)); });
            const mitNa = ohnePilot.find(p => { const k = s.einsatz(e.gs.kinder[p.nr] || ''); return k && s.einsatzFz(k).some(x => s.mitNotarzt(x) && !s.transportfaehig(x)); });
            const nr = (mitNa || ohnePilot[0]).nr;
            const imBr = s.state.fahrzeuge[a.a].phase === 'wartetBR' && e.gs.ziel[a.a] !== 'bo';
            const vorher = (() => { const k = s.einsatz(e.gs.kinder[nr] || ''); return k ? s.einsatzFz(k).map(x => x.funkrufname) : []; })();
            const fa = s.state.fahrzeuge[a.a];
            let fehler = null; try { s.gsSpielerPatient(e.id, a.a, nr); } catch (x) { fehler = x.message; }
            let doppelt = null; try { s.gsSpielerPatient(e.id, a.b, nr); } catch (x) { doppelt = x.message; }
            const log = e.protokoll.map(x => x.text).filter(t => /für Patient|festgelegt/.test(t));
            let doppelt2 = null; try { s.gsSpielerPatient(e.id, a.a, a.nrB); } catch (x) { doppelt2 = x.message; }
            return { nr, imBr, mitNa: !!mitNa, vorher, fehler, doppelt, doppelt2, zielA: e.gs.ziel[a.a], zielB: e.gs.ziel[a.b], fuss: !!fa.gsFussBis || fa.gsAmBr, log, phase: e.gs.phase }; }""", {"id": eid, "a": fa, "b": fb, "nrB": r["nr"]})
        print("   ", json.dumps(r, ensure_ascii=False)[:600])
        nr = r["nr"]
        check(r["fehler"] is None and r["zielA"] == "bo", f"Patient {nr} für den ersten Spieler-NAH festgelegt")
        check(r["doppelt"] and "schon" in r["doppelt"] and r["doppelt2"] and "schon" in r["doppelt2"], f"kein Patient doppelt für zwei Spieler-NAH ({r['doppelt']} / {r['doppelt2']})")
        # Team am Einsatzort → übernimmt genau diesen Patienten; anderes Notarztmittel dort wird frei, RTW bleibt
        r = A.evaluate("""async (a) => { const s = window.__lw.sim; const e = s.einsatz(a.id); const g = window.__gs; const f = s.state.fahrzeuge[a.a];
            for (let i = 0; i < 80; i++) { const k = f.einsatzId ? s.einsatz(f.einsatzId) : null; if (k && k.gsKind && k.gsKind.nr === a.nr) break; await g.schritt(15000); }
            const k = f.einsatzId ? s.einsatz(f.einsatzId) : null;
            const dort = k ? s.einsatzFz(k) : [];
            return { nr: k && k.gsKind ? k.gsKind.nr : null, dort: dort.map(x => [x.funkrufname, s.mitNotarzt(x), s.transportfaehig(x)]),
              andererNa: dort.filter(x => x !== f && s.mitNotarzt(x) && !s.transportfaehig(x)).length }; }""", {"id": eid, "a": fa, "nr": nr})
        print("   ", r)
        check(r["nr"] == nr, f"Spieler-NAH übernimmt den festgelegten Patienten {nr}")
        check(r["andererNa"] == 0, "kein anderes Notarztmittel mehr bei diesem Patienten (getauscht gegen den Spieler-NAH)")
        # Großeinsatz-Fenster: Patient zeigt den Spieler-NAH, der andere kann ihn nicht wählen
        A.evaluate("() => window.__lw.fenster && window.__lw.fenster.oeffnen && window.__lw.fenster.oeffnen('grosseinsatz')")
        # ---- Zahlen live: im BR zählt nur, wer noch keinen Patienten hat
        r = A.evaluate("""(a) => { const s = window.__lw.sim; const e = s.einsatz(a.id); const si = s.gsSollIst(e);
            const imBr = (e.gs.brAlarm || []).filter(id => { const f = s.state.fahrzeuge[id]; return f && f.einsatzId === e.id; });
            const rm = imBr.filter(id => s.transportfaehig(s.state.fahrzeuge[id])).length;
            return { brRm: si.br.find(z => z.art === 'Rettungsmittel').ist, rm, alle: (e.gs.brAlarm || []).length }; }""", {"id": eid})
        print("   ", r)
        check(r["brRm"] == r["rm"], f"Alarmierung live: Rettungsmittel im BR {r['brRm']} (alarmiert insgesamt {r['alle']})")
        # ---- Notarztmittel im BR, die keiner mehr braucht: BEL schickt sie frei
        r = A.evaluate("""async (a) => { const s = window.__lw.sim; const e = s.einsatz(a.id); const g = window.__gs;
            for (let i = 0; i < 120 && e.gs.gezeigt.length < e.wahr.gs.patienten.length; i++) await g.schritt(15000);
            // freies NEF in den BR
            const nef = Object.values(s.state.fahrzeuge).filter(f => f.kategorie === 'NEF' && f.status === 'freiWache' && !f.einsatzId)
              .sort((x, y) => Math.hypot(x.lat - e.gs.br.lat, x.lon - e.gs.br.lon) - Math.hypot(y.lat - e.gs.br.lat, y.lon - e.gs.br.lon))[0];
            // kein Patient braucht mehr einen Notarzt
            for (const p of e.wahr.gs.patienten) e.gs.naBedarf[p.nr] = false;
            s.alarmiere(e.id, [nef.id]);
            const ziel = e.gs.ziel[nef.id];
            const spur = [];
            for (let i = 0; i < 200 && nef.phase !== 'wartetBR' && nef.einsatzId === e.id; i++) { await g.schritt(15000); if (i % 8 == 0) spur.push([nef.phase, Math.round(Math.hypot(nef.lat - e.gs.br.lat, nef.lon - e.gs.br.lon) * 111000), nef.fahrt ? Math.round((s.state.zeit - nef.fahrt.start) / 1000) + '/' + Math.round(nef.fahrt.dauer) : '-']); }
            window.__spur = spur;
            const inBr = nef.phase === 'wartetBR';
            for (let i = 0; i < 24 && nef.einsatzId === e.id; i++) await g.schritt(15000);
            return { spur: window.__spur, nef: nef.funkrufname, ph: [nef.phase, nef.status, !!nef.fahrt, Math.round(Math.hypot(nef.lat - e.gs.br.lat, nef.lon - e.gs.br.lon) * 111000)], ziel, inBr, frei: nef.einsatzId !== e.id, meld: e.gs.meldungen.filter(m => /nicht mehr benötigt/.test(m.text)).map(m => m.text) }; }""", {"id": eid})
        print("   ", r)
        check(r["inBr"] and r["frei"] and r["meld"], f"BEL schickt nicht benötigtes Notarztmittel aus dem BR frei ({r['meld'][:1]})")
        # ---- RTW antwortet auf „entgegenkommen“ (Ticket 11)
        r = A.evaluate("""() => { const s = window.__lw.sim; const rtw = Object.values(s.state.fahrzeuge).find(f => f.rmTyp === 'RTW');
            const vorPh = rtw.phase; rtw.phase = 'vorOrt'; const t1 = s.nahRtwAntwort(rtw, 'Nach Informationen vom Landeplatz am Sportplatz könnt ihr uns entgegenkommen'); rtw.phase = vorPh;
            return t1; }""")
        check(r and "entgegen" in r, f"RTW: „{r}“")
        print("    LOGS", json.dumps(logs[:6], ensure_ascii=False))
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
