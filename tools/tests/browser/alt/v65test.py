# v0.65: Flughafen-POIs, angekündigte Notfälle an Bord (Warteort, Landung, Flugzeug-Symbol), Flughafen-Leitstelle mit wenig Wissen
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8865", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_page(viewport={"width": 1600, "height": 950}); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8865/?debug"); A.wait_for_timeout(3500)
        A.evaluate("async () => { const r = await fetch('abf_test.json'); window.__lw.codesystemLaden(await r.json()); }"); A.wait_for_timeout(800)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.funkgruppe = 'NÖ-05'; st.generatorAktiv = false; st.anrufe = true; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("() => window.__lw.sim.call('neuesSpiel', new Date('2026-10-27T10:30:00').getTime())"); A.wait_for_timeout(1000)
        A.evaluate("() => window.__lw.sim.call('pause')")
        # POIs
        k = A.evaluate("""() => { const L = window.__lw; const z = {}; for (const p of L.store.list('pois')) for (const k of L.orte.poiKategorien(p)) if (k.startsWith('flughafen_')) z[k] = (z[k] ?? 0) + 1;
          return { z, bahnhof: L.orte.kategorienFuerOrtArt('bahnhof').filter(k => k.startsWith('flughafen_')), nicht: L.orte.kategorienFuerOrtArt('arbeit').filter(k => k.startsWith('flughafen_')) }; }""")
        print("   ", k)
        z = k["z"]
        check(z.get("flughafen_flugzeug_gate", 0) >= 2 and z.get("flughafen_flugzeug_vorfeld", 0) >= 2 and z.get("flughafen_notlandung") == 1, f"Flugzeug-POIs (Gate, Außenposition, Notfall-Abstellposition) {z}")
        check(all(z.get(x, 0) >= 1 for x in ["flughafen_terminal", "flughafen_sicherheitskontrolle", "flughafen_gatebereich", "flughafen_gepaeckausgabe", "flughafen_lounge", "flughafen_hangar", "flughafen_vorfeld", "flughafen_cargo", "flughafen_gepaecksortierung", "flughafen_parkhaus", "flughafen_tankstelle"]), "alle Flughafen-Bereiche als POI")
        check("flughafen_terminal" in k["bahnhof"] and not k["nicht"], f"Passagierbereiche: normaler Notruf (wie Bahnhof) {k['bahnhof']}; Arbeitsbereiche nur über Flughafen-Fälle")
        # angekündigter Notfall
        r = A.evaluate("""async () => { const L = window.__lw, s = L.sim; const e = await s.generiereFlughafen('landung', 12);
          if (!e) return null; const a = e.wahr.abfrage.anrufer; const kx = L.kontext(e);
          const fragen = L.schemaFkt.fragenImAblauf(L.store.schema, e.wahr.abfrage.kapitel, e.wahr.abfrage.antworten).map(x => x.frage);
          const andere = fragen.find(f => !['bw','at','alter','geschlecht','ort_adresse','schilderung','anrufer','rueckrufnummer'].includes(f.id) && !f.id.startsWith('alter'));
          const bw = fragen.find(f => f.id === 'bw');
          return { nr: e.nummer, flug: e.flughafen.flug && { nummer: e.flughafen.flug.nummer, inMin: Math.round((e.flughafen.flug.landung - s.state.zeit) / 60000), amStand: Math.round((e.flughafen.flug.amStand - s.state.zeit) / 60000) },
            br: e.br && e.br.label, art: a.art, stelle: a.stelle, meldung: a.meldung, bekannt: a.nurBekannt,
            andere: andere && [andere.id, L.antwortOhneKi(kx, andere)], bw: bw && L.antwortOhneKi(kx, bw), wahrBw: e.wahr.abfrage.antworten.bw,
            partner: s.partnerBedarf(e).map(x => x.art), code: e.wahr.code, kap: e.wahr.abfrage.kapitel, ortKat: e.flughafen.ortKat }; }""")
        print("   ", r)
        check(r and r["flug"] and r["flug"]["inMin"] == 12 and r["flug"]["amStand"] > 12, f"Flug mit Landung in 12 min {r and r['flug']}")
        check(r and r["art"] == "leitstelle" and r["stelle"] == "Flughafen Wien, Leitstelle" and "Landung" in r["meldung"] and "Warteort" in r["meldung"], f"Flughafen-Leitstelle ruft an: {r and r['meldung']}")
        check(r and r["andere"] and "nicht gemeldet" in r["andere"][1], f"weiß nur, was gemeldet wurde ({r and r['andere']})")
        check(r and r["bw"] and "nicht gemeldet" not in r["bw"], f"Bewusstsein ist bekannt ({r and r['bw']}, wahr {r and r['wahrBw']})")
        check(r and "fw" in r["partner"], f"Feuerwehr fährt bei angekündigtem Notfall immer mit {r and r['partner']}")
        check(r and r["br"] and "Feuerwehr-Wache 1" in r["br"], "Warteort bei der Feuerwehr-Wache 1")
        # Ablauf: Ausrücken → Warteort → Landung → Abstellposition
        a = A.evaluate("""async (nr) => { const s = window.__lw.sim; const e = s.state.einsaetze.find(x => x.nummer === nr); const F = window.__lw.flughafen;
          e.adresse = { lat: e.wahr.lat, lon: e.wahr.lon, label: 'Abstellposition' };
          const naw = Object.values(s.state.fahrzeuge).find(x => x.funkrufname === '77/899');
          s.alarmiere(e.id, [naw.id]);
          naw.phase = 'ausruecken'; naw.phaseEnde = s.state.zeit; s.updateVehicle(naw, s.state.zeit);
          await new Promise(r => setTimeout(r, 300));
          const ziel = naw.fahrt.coords[naw.fahrt.coords.length - 1];
          const zumWarteort = Math.hypot((ziel[0] - F.WARTEORT.lon) * 74000, (ziel[1] - F.WARTEORT.lat) * 111000) < 60;
          naw.phase = 'bereitstellung'; naw.fahrt = null; naw.lat = F.WARTEORT.lat; naw.lon = F.WARTEORT.lon; naw.phaseEnde = s.state.zeit; s.updateVehicle(naw, s.state.zeit);
          const warte = naw.phase; const funk = s.state.funk.slice(0, 6).map(x => x.text).join(' | ');
          // vor der Landung: Flugzeug im Anflug noch nicht sichtbar, kurz vor der Landung schon
          const f = e.flughafen.flug;
          const pos0 = F.flugPosition(f, s.state.zeit), pos1 = F.flugPosition(f, f.landung - 60000), pos2 = F.flugPosition(f, f.landung + 20000), pos3 = F.flugPosition(f, f.amStand + 60000);
          s.state.zeit = f.landung - 30000; s.flugTick(s.state.zeit); const vorher = !!e.boSicher;
          s.state.zeit = f.amStand + 1000; s.flugTick(s.state.zeit);
          await new Promise(r => setTimeout(r, 300));
          const z2 = naw.fahrt && naw.fahrt.coords[naw.fahrt.coords.length - 1];
          return { zumWarteort, warte, funk, pos0, pos1: pos1 && [F.amFlughafen(pos1), pos1.amBoden], pos2: pos2 && [F.amFlughafen(pos2), pos2.amBoden], pos3: pos3 && Math.hypot((pos3.lon - F.NOTFALL_STAND.lon) * 74000, (pos3.lat - F.NOTFALL_STAND.lat) * 111000),
            vorher, frei: !!e.boSicher, phase: naw.phase, zumStand: z2 && Math.hypot((z2[0] - e.adresse.lon) * 74000, (z2[1] - e.adresse.lat) * 111000) < 80, log: e.protokoll.map(x => x.text).filter(t => /Flug/.test(t)) }; }""", r["nr"])
        print("   ", a)
        check(a["zumWarteort"] and a["warte"] == "wartetBR" and any("am Warteort" in x for x in a["log"]), f"Fahrzeug fährt zum Warteort und wartet ({a['warte']})")
        check(a["pos0"] is None and a["pos1"] and a["pos1"][1] is False and a["pos2"] and a["pos2"][0] and a["pos2"][1] and a["pos3"] is not None and a["pos3"] < 30, f"Flugzeug: Anflug, Landung auf der Piste, rollt zur Abstellposition ({a['pos1']}, {a['pos2']}, {a['pos3']})")
        check(not a["vorher"] and a["frei"] and a["zumStand"], f"erst wenn das Flugzeug steht, fährt die Rettung zur Abstellposition ({a['phase']})")
        # Kartensymbol
        A.evaluate("() => window.__lw.sim.call('start')"); A.wait_for_timeout(1200)
        n = A.evaluate("() => { const m = window.__lw.map; const d = m?.getSource('lw-flugzeuge')?.serialize().data; return [d?.features?.length ?? -1, m?.hasImage('lw-flugzeug')]; }")
        A.evaluate("() => window.__lw.sim.call('pause')")
        check(n[0] >= 1 and n[1], f"Flugzeug-Symbol auf der Karte {n}")
        # Notfall an Bord am Gate, Personal
        g = A.evaluate("""async () => { const L = window.__lw, s = L.sim; const out = {};
          for (const art of ['flugzeug', 'personal']) { const e = await s.generiereFlughafen(art); if (!e) { out[art] = null; continue; }
            const a = e.wahr.abfrage.anrufer; out[art] = { kat: e.flughafen.ortKat, meldung: a.meldung, satz: a.unbekanntSatz, flug: !!e.flughafen.flug, br: !!e.br, alter: e.wahr.abfrage.antworten.alter, fw: s.partnerBedarf(e).some(x => x.art === 'fw' && /angekündigt/.test(x.grund)) }; }
          return out; }""")
        print("   ", g)
        check(g["flugzeug"] and g["flugzeug"]["kat"].startswith("flughafen_flugzeug_") and "an Bord" in g["flugzeug"]["meldung"] and not g["flugzeug"]["flug"] and not g["flugzeug"]["br"], f"Notfall an Bord eines gelandeten Flugzeugs: kein Warteort {g['flugzeug']}")
        check(g["personal"] and g["personal"]["kat"] in ("flughafen_hangar", "flughafen_vorfeld", "flughafen_cargo", "flughafen_gepaecksortierung") and 18 <= g["personal"]["alter"] <= 65 and "Kollegen" in g["personal"]["meldung"], f"Notfall beim Personal: Flughafen-Leitstelle {g['personal']}")
        check(not g["flugzeug"]["fw"] and not g["personal"]["fw"], "Feuerwehr-Pflicht nur bei angekündigten Notfällen")
        # erster Satz ohne KI
        e1 = A.evaluate("""async () => { const L = window.__lw, s = L.sim; const e = s.state.einsaetze.find(x => x.flughafen?.art === 'landung'); return L.anruferAntwort ? await L.anruferAntwort(e, L.kontext(e), 'Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?', undefined) : null; }""")
        print("   ", e1)
        check(e1 is not None and e1.startswith("Flughafen Wien, Leitstelle") and "Flug" in e1, f"Meldung kommt fix: {e1!r}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
