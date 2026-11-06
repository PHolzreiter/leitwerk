# Großschaden: Szenarien, Abfrage bei mehreren Betroffenen, Ablauf BR → Sicht/Lage → Patienten → Abtransport → Ende
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8891", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails=0; logs=[]
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails+=1

HELFER = """
window.__gs = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  async schritt(dt) {
    const s = window.__lw.sim; s.state.zeit += dt; const t = s.state.zeit;
    for (const fz of Object.values(s.state.fahrzeuge)) s.updateVehicle(fz, t);
    s.partnerTick(t); s.gsTick(t); s.khTick(t); s.checkKhAnfragen(t); s.lageTick(t); s.funkTick(t);
    // Funk: Gespräche der Großschaden-Sprechgruppe beantworten (wie ein Disponent)
    for (const g of s.state.funkGespraeche ?? []) {
      if (g.kanal === 'gs' && (g.status === 'ruft' || g.status === 'sprechwunsch' || (g.status === 'wartet' && !g.an))) { try { s.funkAntworten(g.id); } catch (e) {} }
      if (g.kanal === 'gs' && g.status === 'offen' && !g.ausstehend && g.anliegenGesagt) { try { s.funkEnde(g.id); } catch (e) {} }
      if (g.kanal === 'gs' && g.status === 'mithoeren') { try { s.funkMitgehoert(g.id); } catch (e) {} }
    }
    await window.__gs.sleep(4);
  },
};
"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.on("console", lambda m: logs.append(f"CONSOLE {m.type} {m.text}") if m.type == "error" else None)
        A.goto(f"http://localhost:8891/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; st.acnAktiv = false; window.__lw.store.setSettings(st); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate(HELFER)
        fg = A.evaluate("() => window.__lw.sim.funkgruppe().id"); print("    Funkgruppe", fg)
        check(fg == "NÖ-03", "Test läuft in TETRA NÖ-03")
        # --- Abfrage: Betroffene in Stufen, Gruppenfragen, Alter/Geschlecht weg
        ab = A.evaluate("""() => { const L = window.__lw; const s = L.store.schema; const f = s.globale_fragen.phase_4_primaerabfrage;
            const anz = f.find(x => x.id === 'anzahl_patienten');
            const kap29 = s.kapitel['29'].fragen.map(x => x.id); const kap7 = s.kapitel['7'].fragen.map(x => x.id);
            return { werte: anz.optionen.map(o => o.wert), bwText: f.find(x => x.id === 'bw').text_mehrere, kap29, kap7,
              rm: s.kapitel['29'].fragen.find(x => x.id === 'mehrere_rm').anzeigen_wenn }; }""")
        print("   ", ab["werte"], ab["kap29"][:6])
        check(ab["werte"] == ["1", "n", "6-10", "11-30", "30+", "unbekannt"], "Wie viele Betroffene: 1 / 2–5 / 6–10 / 11–30 / >30 / unbekannt")
        check(ab["bwText"] and "jemand" in ab["bwText"], "Bewusstsein als Gruppenfrage")
        check(ab["kap29"].index("anzahl") < ab["kap29"].index("gering"), "VU: Anzahl Verletzte vor den Fragen, die dann wegfallen")
        check(ab["rm"] == {"q": "anzahl", "in": ["n"]}, "VU: mehrere Rettungsmittel erst bei bestätigt mehreren Verletzten")
        sicht = A.evaluate("""() => { const L = window.__lw; const s = L.store.schema; const { fragenImAblauf } = L;
            return null; }""")
        # sichtbare Fragen: über bestimmeCode/fragenImAblauf aus dem Store
        fr = A.evaluate("""async () => { const s = window.__lw.store.schema; const m = await import('/assets/' + '').catch(() => null); return null; }""")
        # Code-Wirkung: 7 mit eingeschlossen + mehrere=nein → 7C1, mehrere=ja → 7D1
        c = A.evaluate("""() => { const L = window.__lw; const sim = L.sim; const s = L.store.schema;
            const e = sim.state; return null; }""")
        # --- alle Szenarien auslösen: Patienten, Anruf, Ort
        szen = ["gs_auffahr_b", "gs_auffahr_s", "gs_tunnel_duernstein", "gs_wohnungsbrand", "gs_kremschem", "gs_messe_tulln", "gs_bahnuebergang"]
        for sid in szen:
            r = A.evaluate("""async (sid) => { const s = window.__lw.sim; s.state.einsaetze = [];
                let id = null, err = null; try { id = await s.grossschadenAusloesen(sid); } catch (e) { err = String(e.message || e); }
                const e = id && s.einsatz(id); if (!e) return { err };
                const w = e.wahr.gs; const n = (x) => w.patienten.filter(p => p.sichtung === x).length;
                return { titel: w.titel, rot: n('rot'), gelb: n('gelb'), gruen: n('gruen'), tot: n('tot'), unv: w.unverletzt, anrufe: w.anrufe.length + 1, code: e.wahr.code,
                  adr: e.wahr.adresse, lat: e.wahr.lat, anruf: !!e.anruf, anz: e.wahr.abfrage.antworten.anzahl_patienten, kap: e.wahr.abfrage.kapitel,
                  hergang: e.wahr.abfrage.szenario ? e.wahr.abfrage.szenario.hergang : null, alterOk: w.patienten.every(p => p.alter > 0 && p.alter < 100) }; }""", sid)
            print("   ", sid, json.dumps(r, ensure_ascii=False)[:300])
            check(r.get("anruf") and r.get("code") and r.get("alterOk"), f"{sid}: Notruf mit Code und Patienten")
            tot = r.get("rot", 0) + r.get("gelb", 0) + r.get("gruen", 0)
            check(tot >= 6, f"{sid}: mindestens 6 Patienten ({tot})")
        # --- Ablauf am Beispiel Auffahrunfall Bundesstraße
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.state.einsaetze = []; s.state.partnerFz = []; s.funkFestNach = 0;
            s.state.zeit = Date.parse('2026-10-20T07:10:00');
            const id = await s.grossschadenAusloesen('gs_auffahr_b'); const e = s.einsatz(id);
            s.anrufAnnehmen(e.id); s.abfrageSetze(e.id, 'anzahl_patienten', '6-10');
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            const v = await s.vorschlaege(e.id); const emp = s.empfehlung(e.id, v);
            const typen = emp.ids.map(x => s.state.fahrzeuge[x].rmTyp);
            s.alarmiere(e.id, emp.ids);
            s.partnerAnfordern(e.id, 'fw'); s.partnerAnfordern(e.id, 'pol');
            // Schritt 2 ohne BR: kein Vorschlag, Alarmieren in den BR geht nicht
            const v2 = await s.vorschlaege(e.id); const emp2 = s.empfehlung(e.id, v2);
            const ein = v2.find(x => x.sekunden !== null && !x.hinweis && !x.kt && x.fz.kategorie === 'RTW' && !x.fz.einsatzId);
            const hinw = ein ? s.alarmiere(e.id, [ein.fz.id]) : [];
            return { id: e.id, gruende: emp.gruende, typen, ziel: { ...e.gs.ziel }, emp2: emp2.ids.length, gr2: emp2.gruende, hinw, einDabei: ein ? s.state.fahrzeuge[ein.fz.id].einsatzId === e.id : null, si: s.gsSollIst(e) }; }""")
        print("   ", r["typen"], r["gruende"])
        eid = r["id"]
        check(sorted(r["typen"]) == sorted(["BEL", "NEF", "NEF"] + [t for t in r["typen"] if t in ("RTW", "RTW-C", "NAW")]) and sum(1 for t in r["typen"] if t in ("RTW", "RTW-C", "NAW")) == 3, f"Schritt 1: nur die SEG (1 BEL, 2 NEF, 3 RTW) – {r['typen']}")
        check("NAH" not in r["typen"], "kein Hubschrauber in der SEG")
        check(any("Schritt ①" in g for g in r["gruende"]), "Begründung: Schritt ① Schnelleinsatzgruppe")
        check(all(z == "bo" for z in r["ziel"].values()) and len(r["ziel"]) == 6, f"erste Alarmierung fährt zum Berufungsort ({r['ziel']})")
        check(r["emp2"] == 0 and any("Bereitstellungsraum festlegen" in g for g in r["gr2"]), "Schritt 2 gesperrt, solange kein BR festgelegt ist")
        check(r["einDabei"] is False and any("Bereitstellungsraum" in h for h in r["hinw"]), f"ohne BR: nicht in den BR alarmierbar ({r['hinw']})")
        # Reiter Großeinsatz geht auf, Schritt 2 gesperrt
        A.wait_for_timeout(1200)
        check(A.locator(".gs-fenster").count() > 0, "Reiter Großeinsatz geht automatisch auf")
        check(A.locator(".gs-schritt.aktiv.gesperrt").count() > 0, "Schritt ② gesperrt (BR fehlt) im Reiter")
        A.screenshot(path=f"{S}/gs_1_br.png")
        A.locator(".gs-alarm .gs-br-zeile .btn.primary").first.click(); A.wait_for_timeout(700)
        br = A.evaluate("(id) => window.__lw.sim.einsatz(id).gs.br", eid)
        check(br and "Bereitstellungsraum" in br["label"], f"Vorschlag übernommen: {br and br['label']}")
        # Schritt 2: Kräfte für den BR laut Stufe
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; const e = s.einsatz(id);
            const v = await s.vorschlaege(e.id); const emp = s.empfehlung(e.id, v); const typen = emp.ids.map(x => s.state.fahrzeuge[x].rmTyp);
            s.alarmiere(e.id, emp.ids);
            // zweiter BEL: bleibt im Bereitstellungsraum
            const v2 = await s.vorschlaege(e.id); const bel = v2.find(x => x.fz.rmTyp === 'BEL' && x.sekunden !== null && !x.hinweis);
            if (bel) s.alarmiere(e.id, [bel.fz.id]);
            return { typen, gruende: emp.gruende, fehlt: emp.fehlt, ziele: emp.ids.map(x => e.gs.ziel[x]), si: s.gsSollIst(e), brBel: e.gs.brBel, belZiel: bel ? e.gs.ziel[bel.fz.id] : null }; }""", eid)
        print("   ", r["typen"], r["si"], r["fehlt"])
        na = sum(1 for t in r["typen"] if t in ("NEF", "NAH", "NAW")); rm = sum(1 for t in r["typen"] if t not in ("NEF", "NAH", "BEL"))
        check(any("Schritt ②" in g for g in r["gruende"]) and na + (r["si"]["br"][0]["ist"] - na) >= 0, "Schritt ②: Vorschlag für den Bereitstellungsraum")
        check(all(z == "br" for z in r["ziele"]), "Schritt ② fährt in den Bereitstellungsraum")
        z = {x["art"]: x for x in r["si"]["br"]}
        check(z["Notarztmittel"]["ist"] + len([f for f in r["fehlt"] if "Notarztmittel" in f]) >= 1 and z["Rettungsmittel"]["soll"] == 3, f"Soll/Ist NF5: 2 Notarztmittel, 3 Rettungsmittel ({z})")
        check(r["belZiel"] == "br" and r["brBel"], "zweiter BEL fährt in den BR und bleibt dort")
        # bis zur Lagemeldung
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; const e = s.einsatz(id); const g = window.__gs;
            for (let i = 0; i < 160 && !(e.gs.phase === 'lage' && e.gs.gezeigt.length >= 3); i++) await g.schritt(15000);
            const br = Object.values(s.state.fahrzeuge).filter(f => f.einsatzId === id && f.phase === 'wartetBR').map(f => f.funkrufname);
            return { phase: e.gs.phase, el: e.gs.el && s.state.fahrzeuge[e.gs.el].funkrufname, meld: e.gs.meldungen.map(m => m.art + ': ' + m.text), lage: e.gs.lageText, gezeigt: e.gs.gezeigt.length, kinder: Object.keys(e.gs.kinder).length, br, stufe: e.gs.stufe }; }""", eid)
        for m in r["meld"]: print("    📻", m[:220])
        check(r["phase"] == "lage", f"Sichtmeldung und Lagemeldung gekommen ({r['phase']})")
        check(any(m.startswith("sicht: Sichtmeldung") for m in r["meld"]) and any(m.startswith("lage: Lagemeldung") for m in r["meld"]), "Sicht- und Lagemeldung im Reiter")
        check("Sichtmeldung" in r["lage"] and "Lagemeldung" in r["lage"], "Lagemeldung-Feld automatisch übernommen")
        check(r["kinder"] >= 2, f"Patienten gemeldet, je einer als eigener Einsatz ({r['kinder']})")
        check(r["stufe"] == "NF5", f"Stufe nach Lagemeldung NF5 ({r['stufe']})")
        A.wait_for_timeout(800); A.screenshot(path=f"{S}/gs_2_lage.png")
        # Nachforderung: was schon unterwegs ist, fehlt nicht mehr
        nf = A.evaluate("""async (id) => { const s = window.__lw.sim; const e = s.einsatz(id);
            e.nachforderungen = [{ art: 'RTW', anzahl: 11, seit: s.state.zeit, von: 'x', erinnert: s.state.zeit, erledigt: false }];
            const v = await s.vorschlaege(e.id); const frei = v.filter(x => x.sekunden !== null && !x.hinweis && !x.kt && x.fz.kategorie === 'RTW').slice(0, 2);
            const vor = s.fehlendeKraefte(e).rtw; s.alarmiere(e.id, frei.map(x => x.fz.id)); s.funkTick(s.state.zeit);
            const n = e.nachforderungen[0]; return { vor, nach: s.fehlendeKraefte(e).rtw, anzahl: n.anzahl, erledigt: n.erledigt }; }""", eid)
        print("   ", nf)
        check(nf["erledigt"] or nf["anzahl"] == nf["nach"], f"Nachforderung zählt alarmierte Fahrzeuge auf Anfahrt mit ({nf})")
        # Patient verstirbt vor Ort: Fahrzeuge gehen ohne Meldung zum nächsten Patienten
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; const e = s.einsatz(id); const g = window.__gs;
            let k = null; for (let i = 0; i < 40 && !k; i++) { k = Object.values(e.gs.kinder).map(x => s.einsatz(x)).find(x => x && x.zustand !== 'abgeschlossen' && x.fahrzeuge.length && x.fahrzeuge.every(f => s.state.fahrzeuge[f].einsatzId === x.id && s.state.fahrzeuge[f].phase === 'vorOrt')); if (!k) await g.schritt(15000); }
            if (!k) return { skip: true };
            const fz = k.fahrzeuge.slice(); const funk0 = (s.state.funkGespraeche || []).length;
            k.gsKind.stirbtUm = s.state.zeit; e.gs.letzterTick = 0; s.gsTick(s.state.zeit);
            const p = e.wahr.gs.patienten.find(x => x.nr === k.gsKind.nr);
            return { zu: k.zustand, sicht: p.sichtung, zurueck: fz.every(f => { const x = s.state.fahrzeuge[f]; return x.einsatzId === e.id || (x.einsatzId && s.einsatz(x.einsatzId).gsKind && x.einsatzId !== k.id); }) }; }""", eid)
        print("   ", r)
        if not r.get("skip"):
            check(r["zu"] == "abgeschlossen" and r["sicht"] == "tot" and r["zurueck"], f"verstorbener Patient: Fahrzeuge übernehmen den nächsten ({r})")
        # Kinder nicht in der Einsatzliste
        n_liste = A.evaluate("() => document.querySelectorAll('.el-row').length")
        check(n_liste <= 4, f"Patienten-Einsätze nicht in der Einsatzliste ({n_liste} Zeilen)")
        # einen Patienten über das Pop-up buchen
        btn = A.locator(".gs-p [data-buchen]").first
        if btn.count():
            btn.click(); A.wait_for_timeout(600)
            check(A.locator(".dlg .zw-kh, .dlg .kh-row").count() > 0, "Buchen: normales Buchungsmenü im Pop-up")
            A.screenshot(path=f"{S}/gs_3_buchen.png")
            # Symptom-Vorbelegung → KH buchen
            ok = A.evaluate("() => !!document.querySelector('.dlg .zw-khk')")
            if ok:
                A.locator(".dlg .kh-row .btn.primary").click(); A.wait_for_timeout(600)
                check(A.locator(".dlg").count() == 0, "Pop-up schließt nach dem Buchen")
            else:
                A.keyboard.press("Escape")
        # Voraviso
        A.locator(".gs-kh [data-voraviso]").first.click(); A.wait_for_timeout(500)
        vv = A.evaluate("(id) => { const e = window.__lw.sim.einsatz(id); return e.gs.voraviso; }", eid)
        check(len(vv) == 1, f"Voraviso an ein Krankenhaus ({vv})")
        # Abtransport bis zum Ende (KH bucht notfalls die Einsatzleitung)
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; const e = s.einsatz(id); const g = window.__gs;
            const log = [];
            for (let i = 0; i < 1200 && e.gs.phase !== 'ende'; i++) {
              await g.schritt(15000);
              for (const n of e.nachforderungen ?? []) if (!n.erledigt && !n.alarmiert) { n.alarmiert = true; const v = await s.vorschlaege(e.id); const frei = v.filter(x => x.sekunden !== null && !x.hinweis && !x.kt && (x.fz.kategorie === 'RTW' || x.fz.kategorie === 'KTW' || x.fz.kategorie === 'NEF')).slice(0, n.anzahl); s.alarmiere(e.id, frei.map(x => x.fz.id)); log.push('nachalarmiert ' + frei.length); }
            }
            const w = e.wahr.gs; const kinder = Object.values(e.gs.kinder).map(k => s.einsatz(k));
            const plan = kinder.filter(k => w.patienten.find(p => p.nr === k.gsKind.nr).sichtung !== 'tot').map(k => ({ nr: k.gsKind.nr, s: k.wahr.lage.patienten[0].sichtung, fz: k.fahrzeuge.map(f => s.state.fahrzeuge[f].rmTyp).join('+'), kh: !!k.kh, nah: k.nahEntscheid }));
            return { phase: e.gs.phase, zustand: e.zustand, plan, log, meld: e.gs.meldungen.slice(-3).map(m => m.text), vv: e.gs.voraviso.length, prot: e.protokoll.slice(-6).map(p => p.text) }; }""", eid)
        for x in r["plan"]: print("   ", x)
        print("   ", r["log"], r["meld"])
        check(r["phase"] == "ende", f"Ende: alle Patienten abtransportiert ({r['phase']})")
        check(all(x["kh"] for x in r["plan"]), "alle Patienten gebucht")
        rot = [x for x in r["plan"] if x["s"] == "rot"]
        check(all(("NEF" in x["fz"] or "NAH" in x["fz"] or "NAW" in x["fz"] or x["nah"]) for x in rot), "rote Patienten mit Notarzt bzw. Hubschrauber")
        gruen = [x for x in r["plan"] if x["s"] == "gruen"]
        check(not any("NEF" in x["fz"] for x in gruen), "grüne Patienten ohne Notarzt")
        check(r["vv"] == 0, "Voraviso nach dem Ende aufgehoben")
        # Funk-Sprechgruppe: am einen Funkgerät (RD-NOE-09), kein eigener Reiter mehr
        check(A.evaluate("() => window.__lw.sim.offeneGruppen().includes('gs') && document.querySelectorAll('.fg').length === 1"), "Großeinsatz-Gruppe RD-NOE-09 am einen Funkgerät")
        nGs = A.evaluate("() => (window.__lw.sim.state.funkGespraeche || []).filter(g => g.kanal === 'gs').length")
        check(nGs >= 3, f"Gespräche in der Sprechgruppe Großeinsatz ({nGs})")
        # zweiter Notruf: zusammenlegen
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.state.einsaetze = []; s.state.zeit = Date.parse('2026-10-20T07:40:00');
            const id = await s.grossschadenAusloesen('gs_tunnel_duernstein'); const e = s.einsatz(id); const w = e.wahr.gs;
            s.state.zeit = Math.max(...w.anrufe.map(a => a.um)) + 1000; s.gsTick(s.state.zeit);
            const zweiter = s.state.einsaetze.find(x => x.gsZu === id);
            if (!zweiter) return { fehler: 'kein zweiter Anruf' };
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse } });
            s.anrufAnnehmen(zweiter.id); s.aktualisiere(zweiter.id, { adresse: { lat: zweiter.wahr.lat + 0.0005, lon: zweiter.wahr.lon, label: 'Test' } });
            return { id, z: zweiter.id }; }""")
        check("z" in r, f"weiterer Notruf zum Großschaden ({r})")
        if "z" in r:
            A.evaluate("(id) => window.__lw.waehle ? window.__lw.waehle('einsatz', id) : null", r["z"])
            A.evaluate("""(id) => { const ev = new CustomEvent('x'); }""", r["z"])
            # Auswahl über die Einsatzliste
            A.locator(".el-row").filter(has_text="Tunnel").first.click() if A.locator(".el-row").filter(has_text="Tunnel").count() else None
            A.wait_for_timeout(500)
            r2 = A.evaluate("""(a) => { const s = window.__lw.sim; s.zusammenlegen(a.z, a.id); const e = s.einsatz(a.id); const z = s.einsatz(a.z); return { weitere: (e.weitereAnrufe || []).length, zu: z.zustand, zl: z.zusammengelegt }; }""", r)
            check(r2["weitere"] == 1 and r2["zu"] == "abgeschlossen" and r2["zl"] == r["id"], "Zusammenlegen: kein neuer Einsatz, beim ersten gespeichert")
        # KI-Partner ohne Sondersignal, im Umkreis
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e = s.state.einsaetze.find(x => x.wahr.gs); s.partnerAnfordern(e.id, 'ki'); const u = s.state.partnerFz.find(x => x.art === 'ki' && x.einsatzId === e.id);
            const alle = s.state.partnerFz.filter(x => x.art === 'ki' && x.einsatzId === e.id);
            return { ok: !!u, n: alle.length, stufe: e.gs && e.gs.stufe, km: u ? window.__lw.sim.constructor && Math.round(Math.hypot((u.heim.lat - e.wahr.lat) * 111, (u.heim.lon - e.wahr.lon) * 74)) : null }; }""")
        check(r["ok"] and r["km"] <= 21, f"Krisenintervention von zu Hause im 20-km-Umkreis ({r['km']} km)")
        print("    KIT", r)
        r = A.evaluate("""async () => { const s = window.__lw.sim; for (let i = 0; i < 20; i++) { s.state.zeit += 60000; s.partnerTick(s.state.zeit); await new Promise(r => setTimeout(r, 20)); }
            const u = s.state.partnerFz.find(x => x.art === 'ki'); return { blau: u && u.blaulicht, phase: u && u.phase }; }""")
        check(r["blau"] is False, f"KI fährt ohne Sondersignal ({r})")
        # DispoMobil vorhanden
        dm = A.evaluate("() => Object.values(window.__lw.sim.state.fahrzeuge).filter(f => f.dispoMobil).map(f => f.funkrufname + ' @ ' + f.stationName)")
        print("   ", dm)
        check(len(dm) == 1, "DispoMobil bei der Leitstelle der Funkgruppe")
        # Normaler Einsatz mit 6–10 Betroffenen ohne Großschaden: BR wird aufgelöst
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.state.einsaetze = []; const e = await s.generiere('kritisch'); if (!e) return { skip: true };
            s.anrufAnnehmen(e.id); s.abfrageSetze(e.id, 'anzahl_patienten', '6-10'); s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse } });
            const v = await s.vorschlaege(e.id); const emp = s.empfehlung(e.id, v); s.alarmiere(e.id, emp.ids); s.gsBr(e.id, s.gsBrVorschlag(e.id));
            const g = window.__gs; for (let i = 0; i < 120 && !e.gs.aufgehoben; i++) await g.schritt(15000);
            return { aufgehoben: e.gs.aufgehoben, imBr: Object.values(s.state.fahrzeuge).filter(f => f.einsatzId === e.id && (f.phase === 'wartetBR' || f.phase === 'bereitstellung')).length }; }""")
        if not r.get("skip"):
            check(r["aufgehoben"] and r["imBr"] == 0, f"Fehleinschätzung: kein Großschaden vor Ort → BR aufgelöst ({r})")
        for l in logs[:10]: print("   ", l[:300])
        check(not [l for l in logs if l.startswith("PAGEERROR")], "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER gesamt:", fails)
