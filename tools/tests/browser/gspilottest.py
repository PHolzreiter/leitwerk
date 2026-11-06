# Großeinsatz mit Spieler-NAH: BR anfliegen, warten, Abruf, Patient zugeteilt, Transport, Ende
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
HELFER = open(S + '/gstest.py').read().split('HELFER = """')[1].split('"""')[0]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8895", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8895/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; st.acnAktiv = false; st.tempoBeiNotruf = false; window.__lw.store.setSettings(st); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate(HELFER)
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.funkFestNach = 0; s.state.zeit = Date.parse('2026-10-20T10:10:00'); s.setWetter('klar');
            const id = await s.grossschadenAusloesen('gs_auffahr_s'); const e = s.einsatz(id);
            s.anrufAnnehmen(e.id); s.abfrageSetze(e.id, 'anzahl_patienten', '6-10'); s.anrufBeenden(e.id);
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            const v = await s.vorschlaege(e.id);
            const nah = v.find(x => x.fz.rmTyp === 'NAH' && !x.hinweis && !x.fz.ersatzFuer && x.sekunden !== null);
            if (!nah) return { fehler: 'kein NAH', nahs: v.filter(x => x.fz.rmTyp === 'NAH').map(x => [x.fz.funkrufname, x.sekunden, x.hinweis, x.fz.ersatzFuer]) };
            s.pilotUebernehmen(nah.fz.id);
            // Schritt 1: SEG ohne NEF (der Notarzt soll aus dem BR kommen: der Spieler-NAH)
            const emp = s.empfehlung(e.id, v).ids.filter(x => s.state.fahrzeuge[x].kategorie !== 'NEF');
            s.alarmiere(e.id, emp); s.partnerAnfordern(e.id, 'fw'); s.partnerAnfordern(e.id, 'pol');
            const f = s.state.fahrzeuge[nah.fz.id];
            // Schritt 2 ohne BR geht nicht
            const ohne = s.alarmiere(e.id, [f.id]);
            s.gsBr(e.id, s.gsBrVorschlag(e.id));
            s.alarmiere(e.id, [f.id]);
            return { ohne, id: e.id, fz: f.id, ziel: e.gs.ziel[f.id], bo: s.pilotBo(f), hinweis: s.pilotGsHinweis(f) }; }""")
        print("   ", r)
        if "fehler" in r: raise SystemExit("Abbruch: " + json.dumps(r, ensure_ascii=False))
        eid, fid = r["id"], r["fz"]
        check(any("Bereitstellungsraum" in h for h in r["ohne"]), "NAH ohne BR nicht in den BR alarmierbar")
        check(r["ziel"] == "br" and r["bo"]["br"], "Spieler-NAH (2. Alarmierung): Ziel ist der Bereitstellungsraum")
        check("Bereitstellungsraum" in r["hinweis"]["text"], f"Hinweis im Piloten-Interface: {r['hinweis']['text']}")
        r = A.evaluate("""(a) => { const s = window.__lw.sim; const f = s.state.fahrzeuge[a.fz]; const e = s.einsatz(a.id);
            s.pilotStatus(f.id, 'alarmiert'); s.pilotStatus(f.id, 'zumBO'); const fl = s.pilotFliegen(f.id, 'bo'); const flugZiel = f.pilot.flugZiel;
            s.pilotPosition(f.id, e.gs.br.lat, e.gs.br.lon); const st = s.pilotStatus(f.id, 'amBO');
            return { fl, flugZiel, st, phase: f.phase, hinweis: s.pilotGsHinweis(f).text }; }""", {"id": eid, "fz": fid})
        print("   ", r)
        check(r["flugZiel"] == "Bereitstellungsraum" and r["phase"] == "wartetBR", "Flug in den BR, Status 3 dort = am BO, warten im BR")
        A.evaluate("""async (fid) => { const L = window.__lw; await L.pilotUi.oeffnen(); const f = L.sim.state.fahrzeuge[fid]; const ich = L.sim.ich || L.mp.ich; f.pilot.pid = ich.pid; L.sim.notify?.(); }""", fid); A.wait_for_timeout(1500)
        A.set_viewport_size({"width": 1500, "height": 950}); A.wait_for_timeout(800)
        A.screenshot(path=f"{S}/gsp_1_br.png")
        tx = A.locator(".plt-gs").first.inner_text() if A.locator(".plt-gs").count() else ""
        check("Bereitstellungsraum" in tx, f"Piloten-Interface zeigt den Hinweis ({tx[:60]})")
        check(A.locator(".plt-plan .plt-kh").count() == 0, "keine Patienten-Entscheidung, solange kein Patient zugeteilt ist")
        # Abruf: das Team geht zu Fuß, der Hubschrauber bleibt im BR
        r = A.evaluate("""async (a) => { const s = window.__lw.sim; const f = s.state.fahrzeuge[a.fz]; const e = s.einsatz(a.id); const g = window.__gs;
            for (let i = 0; i < 300 && e.gs.ziel[f.id] !== 'bo'; i++) await g.schritt(15000);
            const h = s.pilotGsHinweis(f); const pos = [f.lat, f.lon];
            for (let i = 0; i < 60 && f.einsatzId === e.id; i++) await g.schritt(15000);
            const k = s.einsatz(f.einsatzId);
            return { ziel: e.gs.ziel[f.id], h, bewegt: Math.abs(pos[0] - f.lat) + Math.abs(pos[1] - f.lon) > 1e-6, kind: !!k?.gsKind, nr: k?.gsKind?.nr, sicht: k?.wahr.lage?.patienten[0].sichtung, el: e.gs.el === f.id, amBr: f.gsAmBr,
              versorgt: s.pilotVersorgtIn(f), h2: s.pilotGsHinweis(f)?.text, nav: s.pilotBo(f)?.label }; }""", {"id": eid, "fz": fid})
        print("   ", json.dumps(r, ensure_ascii=False)[:700])
        check(r["ziel"] == "bo" and r["h"] and r["h"].get("abruf") and "zu Fuß" in r["h"]["text"], "Abruf: Team geht zu Fuß zum Einsatzort")
        check(not r["bewegt"] and r["amBr"], "Hubschrauber bleibt im Bereitstellungsraum stehen")
        check(not r["el"], "Spieler-NAH übernimmt keine Einsatzleitung")
        check(r["kind"] and r["sicht"] == "rot", f"Einsatzleitung teilt dem NAH-Team einen roten Patienten zu ({r['nr']})")
        check(r["h2"] and "Patient" in r["h2"], f"Hinweis: {r['h2']}")
        check(r["nav"] and "Bereitstellungsraum" in r["nav"], "Navigation: Hubschrauber steht im BR")
        # Buchung wie in der Leitstelle
        A.wait_for_timeout(1500)
        check(A.locator(".plt-wahl4 .plt-wahl-k").count() == 4, "Auswahl: NAH / RTW allein / NA im RTW + NAH leer / kein Transport")
        A.locator(".plt-wahl4 .plt-wahl-k").first.click(); A.wait_for_timeout(400)
        if A.locator(".plt-sym-chip .plt-x").count(): A.locator(".plt-sym-chip .plt-x").click(); A.wait_for_timeout(300)
        A.locator(".plt-sym-suche").fill("Polytrauma"); A.wait_for_timeout(500)
        check(A.locator(".plt-sym").count() > 0, "Stichwortsuche zeigt Treffer")
        A.locator(".plt-sym").first.click(); A.wait_for_timeout(500)
        check(A.locator(".plt-seg button.an").count() >= 2, "Alter und Dringlichkeit vorbelegt")
        A.screenshot(path=f"{S}/gsp_2_patient.png")
        check(A.locator(".plt-plan .plt-kh").count() > 0, "Vorschläge mit Krankenhäusern")
        check("frei" in A.locator(".plt-plan").inner_text(), "Krankenhausliste zeigt freie Plätze")
        A.locator(".plt-plan .plt-kh").first.click(); A.wait_for_timeout(600)
        r = A.evaluate("""async (a) => { const s = window.__lw.sim; const f = s.state.fahrzeuge[a.fz]; const k = s.einsatz(f.einsatzId); const g = window.__gs;
            const plan = f.pilot.plan; const belegt = Object.values(s.state.khBelegung || {}).some(kh => Object.values(kh).some(l => (l || []).some(x => x.einsatz === k.id)));
            const zu = s.pilotStatus(f.id, 'zumZO');
            for (let i = 0; i < 80 && s.pilotVersorgtIn(f) > 0; i++) await g.schritt(15000);
            const z4 = s.pilotStatus(f.id, 'zumZO'); s.pilotStatus(f.id, 'amZO'); s.pilotStatus(f.id, 'freiFunk');
            await g.schritt(15000);
            return { plan, belegt, zu, z4, kindZu: k.zustand, kh: !!k.kh, grund: k.kh && k.kh.grund }; }""", {"id": eid, "fz": fid})
        print("   ", r)
        check(r["plan"] and r["plan"]["art"] == "transport" and (r["plan"].get("grund") or "").startswith("avn:"), "Buchung mit Stichwort, Alter, Dringlichkeit")
        check(r["belegt"], "Buchung belegt einen Platz im Krankenhaus")
        check(r["zu"] and "versorgt" in r["zu"], f"Status 4 erst nach der Versorgung ({r['zu']})")
        check(r["z4"] is None and r["kindZu"] == "abgeschlossen", "nach der Versorgung: Transport, Patienten-Einsatz abgeschlossen")
        r = A.evaluate("""async (a) => { const s = window.__lw.sim; const e = s.einsatz(a.id); const g = window.__gs;
            for (let i = 0; i < 1500 && e.gs.phase !== 'ende'; i++) {
              await g.schritt(15000);
              for (const n of e.nachforderungen ?? []) if (!n.erledigt && !n.alarmiert) { const v = await s.vorschlaege(e.id); const art = n.art === 'NA' ? (x => x.fz.kategorie === 'NEF' || x.fz.rmTyp === 'NAH') : n.art === 'RTW' ? (x => ['RTW','KTW'].includes(x.fz.kategorie)) : (x => ['RTW','NEF','KTW'].includes(x.fz.kategorie)); const ids = v.filter(x => x.sekunden !== null && !x.kt && !x.fz.pilot && art(x)).slice(0, n.anzahl).map(x => x.fz.id); if (ids.length) { n.alarmiert = true; s.alarmiere(e.id, ids); } }
            }
            const w = e.wahr.gs; const dbg = w.patienten.map(p => { const k = s.einsatz(e.gs.kinder[p.nr] || ''); return p.nr + p.sichtung[0] + ':' + (k ? k.zustand + '/' + k.fahrzeuge.map(f => s.state.fahrzeuge[f].funkrufname + '=' + s.state.fahrzeuge[f].phase + '@' + (s.state.fahrzeuge[f].einsatzId === k.id)).join(',') + '/kh' + !!k.kh : 'nokind') + '/err' + e.gs.erreichbar[p.nr]; });
            const fz = s.einsatzFz ? Object.values(s.state.fahrzeuge).filter(f => f.einsatzId === e.id).map(f => f.funkrufname + ':' + f.rmTyp + ':' + f.phase) : [];
            return { phase: e.gs.phase, dbg, fz, gezeigt: e.gs.gezeigt, nf: e.nachforderungen, fw: e.partnerDa, t: s.state.zeit }; }""", {"id": eid, "fz": fid})
        print("   ", json.dumps(r, ensure_ascii=False)[:2000])
        check(r["phase"] == "ende", f"Großeinsatz mit Spieler-NAH bis zum Ende ({r['phase']})")
        for l in logs[:5]: print("   ", l[:300])
        check(not [l for l in logs if l.startswith("PAGEERROR")], "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER gesamt:", fails)
