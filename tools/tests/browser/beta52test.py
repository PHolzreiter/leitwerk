# Beta 52 (Paul 14.11.2026): Großschaden – Großeinsatz schon mit der Antwort 6–10/11–30/>30, Stufe im Reiter änderbar
# (fehlt / zu viel), Notarzt-Bedarf je Patient aus dem Fallkatalog, Abruf nach Bedarf mit Sammelruf (Spieler-NAH ca. 10 s,
# danach einzeln), BR = Status 3 (auch BR → BO), NAH-Team mit Fahrzeug (keine Ressource, auf der Karte), NAH transportiert
# statt RTW + NEF (RTW wird frei, neuer Patient), Computer-NAH: Patient zum BR gebracht; Spieler-NAH: Patient zuteilen und
# umteilen; Voraviso-Liste (alle KH, Suche, Sortierung); Telefon-Reiter → Abfrage nach dem Gespräch ändern.
# Aufruf: python3 beta52test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
HELFER = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gstest.py")).read().split('HELFER = """')[1].split('"""')[0]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8952", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

START = """async (szen) => { const s = window.__lw.sim; s.funkFestNach = 0; s.state.zeit = Date.parse('2026-10-20T10:10:00'); s.setWetter('klar');
  for (const e of s.state.einsaetze) if (e.anruf && e.anruf.status !== 'beendet') e.anruf.status = 'beendet';
  window.__aufraeumen();
  const id = await s.grossschadenAusloesen(szen); const e = s.einsatz(id); s.anrufAnnehmen(e.id); return id; }"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1700, "height": 1000})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8952/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; st.acnAktiv = false; st.tempoBeiNotruf = false; window.__lw.store.setSettings(st); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate(HELFER)
        A.evaluate("""() => { window.__aufraeumen = () => { const s = window.__lw.sim; for (const x of s.state.einsaetze) if (x.wahr.gs || x.gsKind) { x.zustand = 'abgeschlossen'; if (x.gs) x.gs.ende = 1; }
            for (const f of Object.values(s.state.fahrzeuge)) if (f.einsatzId && s.einsatz(f.einsatzId)?.zustand === 'abgeschlossen') s.freigeben(f); }; }""")
        A.evaluate("""() => { const s = window.__lw.sim; window.__rufe = []; const o = s.fzFunk.bind(s);
            s.fzFunk = (von, an, e, saetze, m) => { window.__rufe.push(saetze.map((x) => x.wartePilot ? '[' + x.von + ' meldet sich selbst]' : x.text)); return o(von, an, e, saetze, m); }; }""")

        # ---- 1) Großeinsatz mit der Antwort auf „Wie viele Patienten?“ – vor der ersten Alarmierung; Stufe aus der Abfrage
        eid = A.evaluate(START, "gs_auffahr_s")
        r = A.evaluate("""(id) => { const s = window.__lw.sim; const e = s.einsatz(id); const vorher = !!e.gs;
            s.abfrageSetze(id, 'anzahl_patienten', '6-10'); const a = e.gs ? e.gs.stufe : null;
            s.abfrageSetze(id, 'anzahl_patienten', '11-30'); const b = e.gs ? e.gs.stufe : null;
            s.abfrageSetze(id, 'anzahl_patienten', 'n'); const weg = !e.gs;
            s.abfrageSetze(id, 'anzahl_patienten', '6-10'); s.anrufBeenden(id);
            s.aktualisiere(id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            return { vorher, a, b, weg, c: e.gs && e.gs.stufe, fz: s.state.einsaetze.filter((x) => x.id === id)[0].fahrzeuge.length }; }""", eid)
        print("    ", r)
        check(not r["vorher"] and r["a"] == "NF5" and r["b"] == "NF10", "Antwort 6–10 bzw. 11–30: Großeinsatz sofort (NF5/NF10), ohne Alarmierung")
        check(r["weg"] and r["c"] == "NF5" and r["fz"] == 0, "wieder 2–5 (vor der Alarmierung): kein Großeinsatz mehr; 6–10 wieder NF5")

        # ---- 2) Stufe im Reiter ändern: Soll/Ist je Fahrzeugtyp
        r = A.evaluate("""(id) => { const s = window.__lw.sim; const e = s.einsatz(id);
            const soll = (st) => { s.gsStufe(id, st); return s.gsSollIst(e).br.map((z) => z.art + ':' + z.soll).join(' '); };
            const x = { nf10: soll('NF10'), nf30: soll('NF30'), nf5: soll('NF5') }; return x; }""", eid)
        print("    ", r)
        check(r["nf10"] != r["nf5"] and r["nf30"] != r["nf10"], "Stufe NF5/NF10/NF30 änderbar – Soll im BR ändert sich")

        # ---- 3) Ablauf mit Computer-NAH aus dem BR: SEG ohne NEF, BR mit NAH + NEF + RTW
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; const e = s.einsatz(id);
            const v = await s.vorschlaege(id);
            const emp = s.empfehlung(id, v).ids.filter((x) => s.state.fahrzeuge[x].kategorie !== 'NEF');
            s.alarmiere(id, emp); s.partnerAnfordern(id, 'fw'); s.partnerAnfordern(id, 'pol');
            s.gsBr(id, s.gsBrVorschlag(id));
            const frei = (f) => v.find((x) => f(x.fz) && !x.hinweis && x.sekunden !== null && !x.kt && !x.fz.pilot && !emp.includes(x.fz.id));
            const nah = frei((f) => f.rmTyp === 'NAH') || v.find((x) => x.fz.rmTyp === 'NAH' && x.sekunden !== null && !x.kt && !x.fz.pilot && x.fz.einsatzId === null); const nef = frei((f) => f.kategorie === 'NEF' && f.rmTyp !== 'NAH');
            const rtw = v.filter((x) => ['RTW', 'RTW-C'].includes(x.fz.rmTyp) && !x.hinweis && x.sekunden !== null && !x.kt && !emp.includes(x.fz.id)).slice(0, 4).map((x) => x.fz.id);
            const ids = [nah && nah.fz.id, nef && nef.fz.id, ...rtw].filter(Boolean);
            const h = s.alarmiere(id, ids);
            return { nahH: nah && nah.hinweis, nahs: v.filter((x) => x.fz.rmTyp === 'NAH').map((x) => [x.fz.funkrufname, x.sekunden, x.hinweis]), nah: nah && nah.fz.id, nef: nef && nef.fz.id, rtw, h, ziel: ids.map((x) => e.gs.ziel[x]) }; }""", eid)
        print("    ", r)
        nahId = r["nah"]
        check(nahId and all(z == "br" for z in r["ziel"]), "NAH, NEF und RTW in den Bereitstellungsraum alarmiert")
        r = A.evaluate("""async (a) => { const s = window.__lw.sim; const e = s.einsatz(a.id); const g = window.__gs; const nah = s.state.fahrzeuge[a.nah];
            const st = { brSt: new Set(), brBoSt: new Set(), shuttle: [], heliBewegt: false, heliPos: null, amBrBeiAbruf: null, nahTr: false, patBr: false, imBr: new Set() };
            for (let i = 0; i < 2000 && e.gs.phase !== 'ende'; i++) {
              await g.schritt(15000);
              for (const f of Object.values(s.state.fahrzeuge)) {
                if (f.einsatzId !== e.id && !(s.einsatz(f.einsatzId || '')?.gsKind?.parent === e.id)) continue;
                if (f.phase === 'wartetBR' && !f.pilot) { st.brSt.add(f.status); st.imBr.add(f.id); }
                if (st.imBr.has(f.id) && !s.state.fahrzeuge[f.id].gsAmBr && ['routing', 'anfahrt'].includes(f.phase) && e.gs.ziel[f.id] === 'bo') st.brBoSt.add(f.status);
              }
              for (const x of s.state.gsShuttles || []) if (!st.shuttle.some((y) => y.id === x.id && y.bis === x.bis)) st.shuttle.push({ id: x.id, name: x.name, bis: x.bis, start: x.fahrt && x.fahrt.start });
              if (nah.gsAmBr && !st.heliPos) { st.heliPos = [nah.lat, nah.lon]; st.amBrBeiAbruf = e.gs.br ? [e.gs.br.lat, e.gs.br.lon] : null; }
              if (st.heliPos && nah.gsAmBr && nah.status === 'amBO' && Math.abs(nah.lat - st.heliPos[0]) + Math.abs(nah.lon - st.heliPos[1]) > 1e-6) st.heliBewegt = true;
              if (nah.status === 'zumZO' && s.einsatz(nah.einsatzId || '')?.gsKind) st.nahTr = true;
              for (const n of e.nachforderungen ?? []) if (!n.erledigt && !n.alarmiert) { const v = await s.vorschlaege(e.id); const art = n.art === 'NA' ? (x => x.fz.kategorie === 'NEF') : (x => ['RTW','KTW'].includes(x.fz.kategorie)); const ids = v.filter(x => x.sekunden !== null && !x.kt && !x.fz.pilot && !x.hinweis && art(x)).slice(0, n.anzahl).map(x => x.fz.id); if (ids.length) { n.alarmiert = true; s.alarmiere(e.id, ids); } }
            }
            const prot = [e, ...Object.values(e.gs.kinder).map((k) => s.einsatz(k))].flatMap((x) => x ? x.protokoll.map((p) => p.text) : []);
            const naB = e.wahr.gs.patienten.filter((p) => p.sichtung !== 'tot').map((p) => [p.nr, p.sichtung, e.gs.naBedarf ? e.gs.naBedarf[p.nr] : null]);
            return { phase: e.gs.phase, brSt: [...st.brSt], brBoSt: [...st.brBoSt], shuttle: st.shuttle, nahName: nah.funkrufname, heliBewegt: st.heliBewegt, nahTr: st.nahTr,
              patBr: prot.some((x) => /zum Hubschrauber in den Bereitstellungsraum/.test(x)), pool: prot.filter((x) => /wieder bei der Einsatzleitung/.test(x)).length,
              abruf: prot.filter((x) => /^Abruf aus dem Bereitstellungsraum/.test(x)), teamDa: prot.some((x) => /Team am Einsatzort \\(Hubschrauber bleibt/.test(x)), naB, dazu: prot.filter((x) => /kommt dazu/.test(x)).slice(0, 3) }; }""", {"id": eid, "nah": nahId})
        print("    ", json.dumps(r, ensure_ascii=False)[:1600])
        check(r["phase"] == "ende", f"Großeinsatz bis zum Ende ({r['phase']})")
        check(r["brSt"] == ["amBO"], f"im Bereitstellungsraum Status 3 ({r['brSt']})")
        check(r["brBoSt"] in (["amBO"], []) and r["brBoSt"] == ["amBO"], f"Fahrt BR → BO bleibt Status 3 ({r['brBoSt']})")
        check(any(x["name"] == r["nahName"] for x in r["shuttle"]) and r["teamDa"], "NAH-Team mit einem Fahrzeug (Rufname des Hubschraubers) zum Einsatzort gebracht")
        check(not r["heliBewegt"], "Hubschrauber bleibt im Bereitstellungsraum, bis er transportiert")
        check(r["patBr"] and r["nahTr"], "Computer-NAH: Patient wird zum BR gebracht, NAH fliegt von dort")
        check(any(x[2] is True for x in r["naB"]) and any(x[2] is False for x in r["naB"]), f"Notarzt-Bedarf je Patient bestimmt ({r['naB']})")
        rufe = A.evaluate("() => window.__rufe.filter((l) => /von Einsatzleiter, kommen/.test(l[0]))")
        print("     Sammelrufe:", rufe[:2])
        check(rufe and all(l[-1].startswith("Hier Einsatzleiter, bitte") and "zum Berufungsort zufahren" in l[-1] for l in rufe), "Sammelruf: „… von Einsatzleiter, kommen“ → „Hier Einsatzleiter, bitte zum Berufungsort zufahren“")
        check(rufe and all(not any("verstanden" in x for x in l) for l in rufe) and all(all(x.startswith("Hier ") for x in l[1:-1]) for l in rufe), "jeder meldet sich („Hier …, kommen“), kein einzelnes „verstanden“")

        # ---- 4) NAH transportiert statt RTW + NEF: RTW beim Patienten wird frei (neuer Patient im Einsatz)
        r = A.evaluate("""async () => { const s = window.__lw.sim; window.__aufraeumen(); const id = await s.grossschadenAusloesen('gs_auffahr_s'); const e = s.einsatz(id); s.anrufAnnehmen(id);
            s.abfrageSetze(id, 'anzahl_patienten', '6-10'); s.anrufBeenden(id); s.aktualisiere(id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            const w = e.wahr.gs; const p = w.patienten.find((x) => x.sichtung === 'rot'); e.gs.phase = 'lage'; e.gs.naBedarf = { [p.nr]: true }; e.gs.gezeigt = [p.nr]; e.gs.erreichbar[p.nr] = 0;
            s.gsKindAnlegen(e, p); const k = s.einsatz(e.gs.kinder[p.nr]);
            const v = await s.vorschlaege(id); const rtw = v.find((x) => x.fz.rmTyp === 'RTW' && !x.hinweis && x.sekunden !== null && !x.kt).fz; const nah = v.find((x) => x.fz.rmTyp === 'NAH' && !x.hinweis && x.sekunden !== null && !x.fz.pilot).fz;
            for (const f of [rtw, nah]) { f.einsatzId = id; e.fahrzeuge.push(f.id); f.phase = 'vorOrt'; f.status = 'amBO'; e.gs.ziel[f.id] = 'bo'; }
            s.gsZuweisen(e, k, p, [rtw], true); const t0 = s.state.zeit;
            s.gsZuteilen(e, w, s.state.zeit); const mitNah = s.einsatzFz(k).map((f) => f.rmTyp); const ent = k.nahEntscheid === nah.id;
            for (let i = 0; i < 30 && rtw.einsatzId === k.id; i++) await window.__gs.schritt(15000);
            return { mitNah, ent, rtwBei: rtw.einsatzId === id ? 'pool' : rtw.einsatzId === k.id ? 'kind' : rtw.einsatzId, rtwPhase: rtw.phase, dt: (s.state.zeit - t0) / 60000 }; }""")
        print("    ", r)
        check("NAH" in r["mitNah"] and r["ent"], "Patient mit RTW, braucht Notarzt: NAH kommt dazu und transportiert")
        check(r["rtwBei"] in ("pool",) or (r["rtwBei"] not in ("kind",) and r["rtwPhase"] == "vorOrt"), f"RTW übergibt und ist wieder bei der Einsatzleitung ({r['rtwBei']}, {r['rtwPhase']})")

        # ---- 5) Spieler-NAH: Sammelruf (meldet sich nicht → einzeln), Zuteilung, Umteilen im Reiter
        eid2 = A.evaluate(START, "gs_auffahr_s")
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; const e = s.einsatz(id); const L = window.__lw;
            s.abfrageSetze(id, 'anzahl_patienten', '6-10'); s.anrufBeenden(id); s.aktualisiere(id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            const v = await s.vorschlaege(id); const nah = v.find((x) => x.fz.rmTyp === 'NAH' && !x.hinweis && x.sekunden !== null && !x.fz.ersatzFuer && x.fz.einsatzId === null);
            s.pilotUebernehmen(nah.fz.id); const f = s.state.fahrzeuge[nah.fz.id]; const ich = s.ich || L.mp.ich; f.pilot.pid = ich.pid;
            const emp = s.empfehlung(id, v).ids.filter((x) => s.state.fahrzeuge[x].kategorie !== 'NEF' && s.state.fahrzeuge[x].einsatzId === null);
            s.alarmiere(id, emp); s.partnerAnfordern(id, 'fw'); s.partnerAnfordern(id, 'pol'); s.gsBr(id, s.gsBrVorschlag(id)); s.alarmiere(id, [f.id]);
            s.pilotStatus(f.id, 'alarmiert'); s.pilotStatus(f.id, 'zumBO'); s.pilotPosition(f.id, e.gs.br.lat, e.gs.br.lon); s.pilotStatus(f.id, 'amBO');
            const g = window.__gs; window.__rufe = [];
            for (let i = 0; i < 300 && !f.gsFussBis && e.gs.ziel[f.id] !== 'bo'; i++) await g.schritt(15000);
            const sg = (s.state.funkGespraeche || []).find((x) => x.ablauf && x.ablauf.some((y) => y.wartePilot === f.id));
            return { fz: f.id, name: s.rufname(f), ziel: e.gs.ziel[f.id], team: !!f.gsFussBis, st: f.status, gid: sg ? sg.id : null, rufe: window.__rufe }; }""", eid2)
        print("    ", json.dumps(r, ensure_ascii=False)[:600])
        fid, pname = r["fz"], r["name"]
        check(r["ziel"] == "bo" and r["team"] and r["st"] == "amBO", "Spieler-NAH abgerufen: Team wird gebracht, Hubschrauber bleibt Status 3 im BR")
        check(r["gid"] is not None and any(f"[{pname} meldet sich selbst]" in l for l in r["rufe"]), "Sammelruf wartet auf die Meldung des Piloten")
        # Funk in echter Zeit: ohne Meldung nach ca. 10 s weiter, danach einzeln gerufen
        r = A.evaluate("""async (a) => { const s = window.__lw.sim; const sl = (ms) => new Promise((r) => setTimeout(r, ms)); const t0 = Date.now(); s.state.laeuft = true;
            const g = () => (s.state.funkGespraeche || []).find((x) => x.id === a.gid);
            for (const x of s.state.funkGespraeche || []) if (x.id !== a.gid && x.status !== 'ende') s.funkSchliessen(x);
            const hist = [];
            for (let i = 0; i < 160; i++) { s.funkKanal(); const x = g(); const k = x ? x.status + '/' + (x.ablauf || []).length + '/' + !!x.gsWarte + '/' + x.wegenTelefon + '/' + x.wegenNah : 'weg'; if (hist[hist.length - 1] !== k) hist.push(k); if (x && x.status === 'direkt' && x.gsWarte) break; await sl(250); }
            window.__hist = hist;
            const start = Date.now(); let weiter = null;
            for (let i = 0; i < 120; i++) { s.funkKanal(); const x = g(); if (!x || !x.gsWarte) { weiter = Date.now() - start; break; } await sl(250); }
            for (let i = 0; i < 80; i++) { s.funkKanal(); const x = g(); if (!x || x.status === 'ende') break; await sl(250); }
            const nach = (s.state.funkGespraeche || []).find((x) => x.gsNachruf && x.status !== 'ende');
            const sp = (g()?.sprueche || []).map((y) => y.von + ': ' + y.text);
            return { hist: window.__hist, laeuft: s.state.laeuft, sendet: s.state.funkSendet, weiter, sp, nach: !!nach, nachId: nach ? nach.id : null, nachAblauf: nach ? nach.ablauf.map((y) => y.text || '[' + y.wartePilot + ']') : null }; }""", {"gid": r["gid"]})
        print("    ", json.dumps(r, ensure_ascii=False)[:900])
        check(r["weiter"] is not None and 8000 <= r["weiter"] <= 14000, f"ohne Meldung des Piloten geht es nach ca. 10 s weiter ({r['weiter']} ms)")
        check(r["nach"], "Pilot danach einzeln gerufen")
        # Pilot meldet sich im Einzelruf
        r = A.evaluate("""async (a) => { const s = window.__lw.sim; const sl = (ms) => new Promise((r) => setTimeout(r, ms)); const f = s.state.fahrzeuge[a.fz];
            const g = () => (s.state.funkGespraeche || []).find((x) => x.id === a.nid);
            for (let i = 0; i < 160; i++) { s.funkKanal(); const x = g(); if (x && x.gsWarte) break; await sl(250); }
            const offen = f.gsRufOffen === a.nid; s.funkMenschText(null, 'Hier ' + a.name + ', kommen');
            for (let i = 0; i < 60; i++) { s.funkKanal(); const x = g(); if (!x || x.status === 'ende') break; await sl(250); }
            return { offen, sp: (g()?.sprueche || []).map((y) => y.von + ': ' + y.text), verpasst: g()?.gsVerpasst || [] }; }""", {"nid": r["nachId"], "fz": fid, "name": pname})
        print("    ", json.dumps(r, ensure_ascii=False)[:700])
        check(r["offen"] and any(x.endswith(f"Hier {pname}, kommen") for x in r["sp"]) and "zum Berufungsort zufahren" in r["sp"][-1], "Pilot meldet sich im Einzelruf, danach der Auftrag")
        # Zuteilung beim Eintreffen, Umteilen durch die Leitstelle (sofort), danach gesperrt mit gebuchtem Zielort
        r = A.evaluate("""async (a) => { const s = window.__lw.sim; const e = s.einsatz(a.id); const f = s.state.fahrzeuge[a.fz]; const g = window.__gs;
            for (let i = 0; i < 200 && !s.einsatz(f.einsatzId || '')?.gsKind; i++) await g.schritt(15000);
            const k1 = s.einsatz(f.einsatzId); const p1 = e.wahr.gs.patienten.find((p) => p.nr === k1.gsKind.nr);
            const ander = e.wahr.gs.patienten.find((p) => p.nr !== p1.nr && p.sichtung !== 'tot' && e.gs.kinder[p.nr] && !s.einsatzFz(s.einsatz(e.gs.kinder[p.nr])).some((x) => x.status === 'zumZO'));
            let fehler = null; if (ander) try { s.gsSpielerPatient(a.id, f.id, ander.nr); } catch (x) { fehler = String(x.message || x); }
            const k2 = s.einsatz(f.einsatzId); const altNah = k1.nahEntscheid;
            for (let i = 0; i < 6; i++) await g.schritt(15000);
            const altBekommt = s.einsatzFz(k1).map((x) => x.funkrufname);
            const h = s.store ? null : null; const kh = window.__lw.store.list('hospitals')[0];
            s.pilotPlan(f.id, { art: 'transport', hospitalId: kh.id }); let gesperrt = null; try { s.gsSpielerPatient(a.id, f.id, p1.nr); } catch (x) { gesperrt = String(x.message || x); }
            return { p1: [p1.nr, p1.sichtung, p1.alter], jung: e.wahr.gs.patienten.filter((p) => (p.sichtung === 'rot' || p.sichtung === 'gelb') && e.gs.gezeigt.includes(p.nr)).map((p) => [p.nr, p.sichtung, p.alter]),
              neu: k2 && k2.gsKind ? k2.gsKind.nr : null, ander: ander ? ander.nr : null, fehler, altNah, altBekommt, gesperrt }; }""", {"id": eid2, "fz": fid})
        print("    ", json.dumps(r, ensure_ascii=False)[:700])
        check(r["p1"][1] in ("rot", "gelb"), f"Spieler-NAH bekommt beim Eintreffen einen roten oder gelben Patienten ({r['p1']})")
        check(r["ander"] is not None and r["neu"] == r["ander"] and not r["fehler"] and r["altNah"] != fid, f"Leitstelle teilt um: sofort bei Patient {r['neu']}, der alte ist nicht mehr seiner")
        check(r["gesperrt"] and "Zielort" in r["gesperrt"], f"nach gebuchtem Zielort kein Umteilen mehr ({r['gesperrt']})")

        # ---- 6) Reiter Großeinsatz: Stufe-Knöpfe, Voraviso-Liste (alle KH, Suche, Sortieren, ca. 8 sichtbar), Spieler-NAH-Auswahl
        A.evaluate("(id) => { window.__lw.panelZeigen('grosseinsatz'); }", eid2); A.wait_for_timeout(900)
        def tab(n):
            t = A.locator(".gs-ew .unterreiter button", has_text=n)
            if t.count(): t.first.click(); A.wait_for_timeout(500)
        tab("Patienten"); spn = A.evaluate("() => document.querySelectorAll('.gs-ew .spnah select').length + document.querySelectorAll('.gs-ew .spnah .spfest').length")
        tab("Alarmierung"); dz = A.evaluate("() => [...document.querySelectorAll('.gs-ew .soll .dz')].map((x) => x.textContent)")
        tab("Voraviso")
        r = A.evaluate("""() => { const w = document.querySelector('.gs-ew'); if (!w) return null; const kh = [...w.querySelectorAll('.khl .khr')]; const l = w.querySelector('.khl');
            return { stufen: [...w.querySelectorAll('.stufen .stb')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')), kh: kh.length, scroll: l ? l.scrollHeight > l.clientHeight + 5 : false,
              knopf: kh[0] ? kh[0].querySelector('button').textContent : '', sp: w.querySelectorAll('.spnah select').length + w.querySelectorAll('.spnah .spfest').length, dz: [...w.querySelectorAll('.soll .dz')].map((x) => x.textContent) }; }""")
        r["sp"] = max(r["sp"], spn); r["dz"] = r["dz"] or dz
        print("    ", r)
        check(r and len(r["stufen"]) == 3 and sum(1 for x in r["stufen"] if x.endswith("*")) == 1, f"Kopf: NF5 / NF10 / NF30, eine aktiv ({r and r['stufen']})")
        check(r and r["kh"] > 8 and r["scroll"] and "Vorinformieren" in r["knopf"] or (r and "vorinformiert" in r["knopf"]), f"Voraviso: alle Krankenhäuser, Liste scrollt, Knopf „Vorinformieren“ ({r and r['kh']})")
        check(r and r["sp"] >= 1, "Patientenübersicht: Spieler-NAH mit Patientenwahl")
        check(r and any("fehlt" in x or "zu viel" in x or x == "✓" for x in r["dz"]), f"Soll/Ist zeigt fehlt / zu viel ({r and r['dz']})")
        A.locator(".gs-ew .stufen .stb").nth(2).click(); A.wait_for_timeout(500)
        st = A.evaluate("(id) => window.__lw.sim.einsatz(id).gs.stufe", eid2)
        check(st == "NF30", f"Klick auf NF30 ändert die Stufe ({st})")
        A.evaluate("(id) => window.__lw.sim.gsStufe(id, 'NF5')", eid2); A.wait_for_timeout(500)
        A.locator(".gs-ew .khsuch input").fill("krems"); A.wait_for_timeout(500)
        n = A.evaluate("() => [...document.querySelectorAll('.gs-ew .khl .khr')].map((x) => x.querySelector('.n b').textContent + ' ' + x.title)")
        check(n and all("krems" in x.lower() for x in n), f"Suche im Voraviso ({len(n)} Treffer)")
        A.locator(".gs-ew .khsuch input").fill(""); A.wait_for_timeout(300)
        A.locator(".gs-ew .khk .sk").first.click(); A.wait_for_timeout(400)
        namen = A.evaluate("() => [...document.querySelectorAll('.gs-ew .khl .khr .n b')].map((x) => x.textContent)")
        check(namen == sorted(namen, key=lambda x: x.lower()), "Sortieren nach Name")
        A.screenshot(path=f"{S}/b52_grosseinsatz.png")

        # ---- 7) Telefon-Reiter → Abfrage nach dem Gespräch ändern (auch fremder Einsatz), Code wird neu gesetzt, ≥ 6 → Großschaden
        r = A.evaluate("""async () => { const s = window.__lw.sim; for (const e of s.state.einsaetze) if (e.anruf && e.anruf.status !== 'beendet') e.anruf.status = 'beendet';
            const e = await s.generiereFall('ecall_kollision', 'D'); s.anrufAnnehmen(e.id); await new Promise((r) => setTimeout(r, 800));
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, telefon: '0664 1', zusatz: '-' });
            s.abfrageSetze(e.id, 'anrufer', 'system'); if (!s.einsatz(e.id).anruf.kapitel) s.abfrageSetze(e.id, 'kapitel', e.wahr.abfrage.kapitel);
            for (const [k, w] of Object.entries(e.wahr.abfrage.antworten)) { if (k !== 'anrufer') try { s.abfrageSetze(e.id, k, w); } catch (x) {} }
            s.anrufBeenden(e.id); const x = s.einsatz(e.id); x.anruf.angenommenVon = { pid: 'fremd', name: 'Anna' }; x.codeQuelle = 'dispo';
            return { id: e.id, code: x.code, st: x.anruf.status }; }""")
        print("    ", r)
        tid = r["id"]
        A.evaluate("() => window.__lw.panelZeigen('telefon')"); A.wait_for_timeout(800)
        zeile = A.locator(".k-Telefon .t-z.notruf.beendet").first
        check(zeile.count() > 0, "Telefon-Reiter listet den beendeten Notruf")
        zeile.click(); A.wait_for_timeout(1000)
        r = A.evaluate("""(id) => { const w = document.querySelector('.k-Abfrage'); const t = w ? w.innerText : '';
            return { nach: /Nachbearbeitung/.test(t), fertig: [...(w ? w.querySelectorAll('button') : [])].some((b) => b.textContent.trim() === 'Fertig') }; }""", tid)
        check(r["nach"] and r["fertig"], "Klick öffnet die Abfrage zum Ändern (Nachbearbeitung, „Fertig“)")
        r = A.evaluate("""(id) => { const s = window.__lw.sim; const e = s.einsatz(id); const vor = e.code; let fehler = null;
            try { s.abfrageSetze(id, 'anzahl_patienten', 'n'); s.abfrageSetze(id, 'bw', 'nein'); } catch (x) { fehler = String(x.message || x); }
            const nachher = e.code; s.abfrageSetze(id, 'anzahl_patienten', '6-10'); return { vor, nachher, fehler, gs: !!e.gs, stufe: e.gs && e.gs.stufe, prot: e.protokoll.some((p) => /Änderung/.test(p.text)) }; }""", tid)
        print("    ", r)
        check(not r["fehler"] and r["vor"] != r["nachher"], f"Abfrage eines fremden Einsatzes geändert: Code neu gesetzt ({r['vor']} → {r['nachher']})")
        check(r["gs"] and r["stufe"] == "NF5", "Anzahl auf 6–10 geändert: Großeinsatz")
        A.evaluate("() => [...document.querySelectorAll('.k-Abfrage button')].find((b) => b.textContent.trim() === 'Fertig').click()"); A.wait_for_timeout(500)
        check(not A.evaluate("() => /Nachbearbeitung/.test(document.querySelector('.k-Abfrage')?.innerText || '')"), "„Fertig“ schließt die Nachbearbeitung")

        for l in logs[:5]: print("   ", l[:300])
        check(not [l for l in logs if l.startswith("PAGEERROR")], "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
sys.exit(1 if fails else 0)
