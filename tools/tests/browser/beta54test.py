# Beta 54 (Paul 14./15.11.2026): neue Lagen der Funk-KI.
# Besatzung meldet: Partner nachfordern + Erinnern (5, dann alle 10 min), mehrere Patienten (ein Fahrzeug bleibt, bis das
# nächste da ist), Fehleinsatz, Voranmeldung, KTW braucht NEF bzw. „NEF oder RTW-C“ (einstellbar), Spezialkräfte nur als Bitte.
# Rendezvous zwischen den Fahrzeugen mit einfachem Begriff am Funk. Leitstelle sagt: Abziehen, Krankenhaus ändern, Info mit
# Inhalt quittieren, Zeitfragen, Standort fragen/halten (10 min), verlegen, zurück zur Dienststelle.
# Aufruf: python3 beta54test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8954", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

HELFER = r"""
window.__t = {
  s: () => window.__lw.sim,
  rtw: (ausser = [], nahe) => { const s = window.__lw.sim; const d = (f) => nahe ? (f.lat - nahe.lat) ** 2 + (f.lon - nahe.lon) ** 2 : 0; return Object.values(s.state.fahrzeuge).filter((f) => f.kategorie === 'RTW' && s.verfuegbar(f) && !f.einsatzId && !f.wechselOffen && !/flughafen/i.test(`${f.funkrufname} ${f.stationName}`) && !ausser.includes(f.id)).sort((a, b) => d(a) - d(b))[0]; },
  gespr: (fz, e) => window.__lw.sim.neuesGespraech(fz, e ?? null, 'offen'),
  sag: (fz, e, text) => { const s = window.__lw.sim; const g = s.neuesGespraech(fz, e ?? null, 'offen'); return s.funkVerstehen(g, text); },
  einsatz: async (k = 'dringend') => { const s = window.__lw.sim; for (let i = 0; i < 20; i++) { const e = await s.generiere(k); if (e && e.wahr.lage) { e.adresse = { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse || 'Test' }; if (e.anruf) e.anruf.status = 'beendet'; return e; } } return null; },
};
"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1500, "height": 900})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'hell', einfuehrung:true})); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8954/?debug&seed=54"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; st.acnAktiv = false; st.tempoBeiNotruf = false; window.__lw.store.setSettings(st); window.__lw.sim.setWetter('klar'); }")
        A.evaluate(HELFER)

        # ---- Standort halten (freies Fahrzeug unterwegs): 10 Minuten, dann weiter heim, Status bleibt
        r = A.evaluate("""async () => { const s = __t.s(); const fz = __t.rtw(); fz.lat += 0.03; fz.lon += 0.02; fz.phase = 'frei'; s.setStatus(fz, 'freiFunk');
            const a = __t.sag(fz, null, 'Hier LEO, bitte Standort halten, kommen'); const st = structuredClone(fz.standort);
            const vor = s.state.zeit; s.state.zeit += 11 * 60000; s.standortTick(s.state.zeit); await new Promise((r) => setTimeout(r, 50));
            return { a, st, dauer: st && (st.bis - vor) / 60000, nach: fz.standort, phase: fz.phase, status: fz.status }; }""")
        print("    ", r["a"], r["phase"], r["status"])
        check(r["st"] and r["st"]["art"] == "halten" and round(r["dauer"]) == 10, "Standort halten: hält höchstens 10 Minuten")
        check("halten Standort" in r["a"], "Besatzung quittiert „halten Standort …“")
        check(r["nach"] is None and r["phase"] in ("routing", "rueckfahrt") and r["status"] == "freiFunk", "nach 10 Minuten weiter heim, Status unverändert (6)")

        # ---- Verlegen auf eine andere Dienststelle, dort Status 6, bleibt stehen; zurück zur Heimatdienststelle
        r = A.evaluate("""async () => { const s = __t.s(); const alle = Object.values(s.state.fahrzeuge);
            const fz = alle.filter((f) => f.kategorie === 'RTW' && s.verfuegbar(f) && !f.einsatzId && f.status === 'freiWache' && !/langenlois/i.test(f.stationName))[0];
            const a = __t.sag(fz, null, 'Hier LEO, bitte Standort wechseln auf die Dienststelle Langenlois, kommen');
            const st = structuredClone(fz.standort); const status1 = fz.status;
            for (let i = 0; i < 40 && fz.phase === 'routing'; i++) await new Promise((r) => setTimeout(r, 100));
            fz.phaseEnde = s.state.zeit; s.updateVehicle(fz, s.state.zeit);
            const da = { phase: fz.phase, status: fz.status, st: structuredClone(fz.standort) };
            s.heimWennFrei(fz); const bleibt = fz.phase;
            const b = __t.sag(fz, null, 'Hier LEO, bitte wieder zur Heimatdienststelle zurückkehren, kommen');
            return { a, st, status1, da, bleibt, b, nach: fz.standort, id: fz.id }; }""")
        print("    ", r["a"], "|", r["b"])
        check(r["st"] and r["st"]["art"] == "verlegt" and r["st"]["ziel"] and "Langenlois" in r["st"]["ziel"]["label"], "Verlegen: Ziel Dienststelle Langenlois erkannt")
        check(r["status1"] == "freiFunk", "während der Verlegung Status 6")
        check(r["da"]["phase"] == "frei" and r["da"]["status"] == "freiFunk" and r["da"]["st"] and r["da"]["st"]["unterwegs"] is False, "am Verlegungsort: frei über Funk, bleibt dort")
        check(r["bleibt"] == "frei", "fährt nicht von selbst heim")
        check(r["nach"] is None and "Frei Wache" in r["b"], "zurück zur Heimatdienststelle („mit Frei Wache“)")
        A.evaluate(f"() => {{ const s = __t.s(); const fz = s.state.fahrzeuge['{r['id']}']; fz.lat = fz.heim.lat; fz.lon = fz.heim.lon; fz.fahrt = null; fz.phase = 'frei'; s.setStatus(fz, 'freiWache'); }}")

        # ---- Abziehen auf der Anfahrt; mit Patient und Zielort nicht möglich
        r = A.evaluate("""async () => { const s = __t.s(); const e = await __t.einsatz(); const fz = __t.rtw([], e.wahr); s.alarmiere(e.id, [fz.id]);
            const a = __t.sag(fz, e, "Hier LEO, der aktuelle Einsatz ist ein Storno für euch. Für euch geht's weiter Richtung Rohrendorf, kommen");
            const fz2 = __t.rtw([fz.id], e.wahr); s.alarmiere(e.id, [fz2.id]); fz2.phase = 'transport'; e.kh = { hospitalId: 'kh002', grund: '', durch: 'dispo', zeit: s.state.zeit };
            const b = __t.sag(fz2, e, 'Hier LEO, bitte Navi neustarten, ihr bekommt von mir in Kürze einen anderen Einsatz geschickt, kommen');
            return { a, b, frei: fz.einsatzId, zustand1: e.zustand, st: structuredClone(fz.standort), noch: fz2.einsatzId === e.id, eid: e.id }; }""")
        print("    ", r["a"], "|", r["b"])
        check(r["frei"] is None and r["st"] and r["st"]["art"] == "richtung" and "Rohrendorf" in r["a"], "Abziehen: Einsatz abgegeben, fährt Richtung Rohrendorf")
        check("nicht möglich" in r["b"] and r["noch"], "mit Patient und gebuchtem Zielort: Abziehen nicht möglich")
        r2 = A.evaluate("""async () => { const s = __t.s(); const e = await __t.einsatz(); const fz = __t.rtw([], e.wahr); s.alarmiere(e.id, [fz.id]);
            __t.sag(fz, e, "Hier LEO, euren Einsatz übernimmt der 75/002, für euch geht's bitte woanders hin, kommen"); return { z: e.zustand, st: fz.standort && fz.standort.art }; }""")
        check(r2["z"] != "abgeschlossen" and r2["st"] == "halten", "letztes Fahrzeug abgezogen: Einsatz bleibt offen, Fahrzeug hält Standort")

        # ---- Krankenhaus ändern während des Transports
        r = A.evaluate("""async () => { const s = __t.s(); const e = await __t.einsatz(); const fz = __t.rtw([], e.wahr); s.alarmiere(e.id, [fz.id]);
            fz.phase = 'transport'; e.kh = { hospitalId: 'kh002', grund: e.wahr.verdacht ?? '', durch: 'rtw', zeit: s.state.zeit };
            const a = __t.sag(fz, e, 'Hier LEO, bitte fahrt ins UK St. Pölten statt Krems, kommen');
            return { a, kh: e.kh && e.kh.hospitalId }; }""")
        print("    ", r["a"])
        check(r["kh"] == "kh001" and "UK St. Pölten" in r["a"], "Krankenhaus ändern: neu gebucht, Quittung mit neuem Ziel")

        # ---- Info quittieren, Zeitfragen, Standort
        r = A.evaluate("""async () => { const s = __t.s(); const e = await __t.einsatz(); const fz = __t.rtw([], e.wahr); s.alarmiere(e.id, [fz.id]);
            fz.phase = 'vorOrt'; fz.phaseEnde = s.state.zeit + 8 * 60000; e.wahr.transport = true;
            return { info: __t.sag(fz, e, 'Hier LEO, zur Info, laut Anrufer ist der Patient jetzt bewusstlos, kommen'),
                     frei: __t.sag(fz, e, 'Hier LEO, wann seid ihr wieder frei, kommen'),
                     kh: __t.sag(fz, e, 'Hier LEO, wann seid ihr im Krankenhaus, kommen'),
                     ort: __t.sag(fz, e, 'Hier LEO, Frage Standort, kommen') }; }""")
        for k, v in r.items(): print("    ", k, v)
        check("laut Anrufer ist der Patient jetzt bewusstlos" in r["info"], "Info aus dem Folgeanruf: mit Inhalt quittiert")
        check("wieder frei" in r["frei"] and "Minuten" in r["frei"], "Zeitfrage „wann frei“ beantwortet")
        check("im " in r["kh"] and "Minuten" in r["kh"], "Zeitfrage „wann im Krankenhaus“ beantwortet")
        check("befinden uns gerade" in r["ort"] and "beim Patienten" in r["ort"], "Standort durchgegeben")

        # ---- Rendezvous-Treffpunkt: einfacher Begriff am Funk
        r = A.evaluate("""() => { const s = __t.s(); return { sport: s.treffpunktName({ lat: 48.396745, lon: 15.585355 }, { lat: 48.4, lon: 15.6 }), ort: s.treffpunktName({ lat: 48.3935, lon: 15.574 }, { lat: 48.4, lon: 15.6 }) }; }""")
        print("    ", r)
        check(r["sport"] == "beim Sportplatz Mautern", "Treffpunkt am Sportplatz: „beim Sportplatz Mautern“")
        check(r["ort"].startswith(("in ", "bei ", "beim ")) and len(r["ort"]) < 40, "Treffpunkt sonst als kurzer Ortsbegriff")

        # ---- mehrere Patienten: ein Transportfahrzeug bleibt, bis das nächste da ist
        r = A.evaluate("""async () => { const s = __t.s(); const e = await __t.einsatz(); const l = e.wahr.lage;
            const p0 = l.patienten[0]; l.patienten = [p0, { ...p0, nr: 2, sichtung: 'gelb' }, { ...p0, nr: 3, sichtung: 'gelb' }]; l.fall = undefined;
            const a = __t.rtw([], e.wahr); const b = __t.rtw([a.id], e.wahr); s.alarmiere(e.id, [a.id, b.id]);
            for (const x of [a, b]) { x.phase = 'warteKH'; x.phaseEnde = null; }
            e.kh = { hospitalId: 'kh002', grund: '', durch: 'dispo', zeit: s.state.zeit }; s.startTransport(e);
            const phasen = [a.phase, b.phase]; const fehlt = s.fehlendeKraefte(e);
            return { phasen, abf: e.abfahrten, fehlt }; }""")
        print("    ", r)
        check(sorted(r["phasen"]).count("warteKH") == 1 and r["abf"] == 1, "3 Patienten, 2 RTW: einer fährt, einer bleibt am Einsatzort")
        check(r["fehlt"]["rtw"] == 1, "es fehlt noch 1 Transportfahrzeug (abgefahrene zählen mit)")

        # ---- Nachforderung erinnern: nach 5 Minuten, dann alle 10 Minuten
        r = A.evaluate("""async () => { const s = __t.s(); const e = await __t.einsatz(); const fz = __t.rtw([], e.wahr); s.alarmiere(e.id, [fz.id]);
            fz.phase = 'vorOrt'; fz.phaseEnde = s.state.zeit + 30 * 60000; e.wahr.lage.patienten.push({ ...e.wahr.lage.patienten[0], nr: 2, sichtung: 'rot' }); e.wahr.lage.fall = undefined;
            const t0 = s.state.zeit; e.nachforderungen = [{ art: 'RTW', anzahl: 1, seit: t0, von: fz.funkrufname, erinnert: t0, erledigt: false }];
            const n = e.nachforderungen[0]; const z = [];
            for (const m of [4, 6, 12, 15, 17]) { s.state.zeit = t0 + m * 60000; s.funkTick(s.state.zeit); z.push(n.erinnerungen ?? 0); }
            return z; }""")
        print("    ", r)
        check(r == [0, 1, 1, 1, 2], "Erinnerung nach 5 Minuten, danach erst nach weiteren 10 Minuten")

        # ---- Voranmeldung: nur Polytrauma, Herzinfarkt, Schlaganfall
        r = A.evaluate("""async () => { const s = __t.s(); const e = await __t.einsatz(); e.wahr.lage.fall = { ...(e.wahr.lage.fall ?? {}), kern: 'Verdacht Schlaganfall, Hemiparese rechts' };
            const a = s.voranmeldungArt(e, ''); e.wahr.lage.fall.kern = 'Sturz, Prellung Unterarm'; const b = s.voranmeldungArt(e, ''); e.wahr.lage.fall.kern = 'Polytrauma nach Verkehrsunfall'; const c = s.voranmeldungArt(e, ''); return [a, b, c]; }""")
        check(r == ["Stroke Unit", None, "Schockraum"], f"Voranmeldung nur bei zeitkritischen Fällen ({r})")

        # ---- KTW braucht NEF bzw. NEF oder RTW-C; Einstellung
        r = A.evaluate("""async () => { const s = __t.s(); const e = await __t.einsatz(); e.ktHilfe = { braucht: 'NFS', ktwId: 'x', ktId: 'y' };
            const f1 = s.fehlendeKraefte(e); e.ktHilfe.braucht = 'NA'; const f2 = s.fehlendeKraefte(e); return { f1, f2, std: s.settings.ktVerschlechterungProzent ?? 1 }; }""")
        check(r["f1"]["nfs"] == 1 and r["f1"]["na"] == 0 and r["f2"]["na"] == 1 and r["f2"]["rtw"] == 0, "KTW-Nachforderung nach Kompetenz (NEF oder RTW-C bzw. NEF)")
        check(r["std"] == 1, "Standard: 1 von 100 Krankentransporten")

        # ---- Fehleinsatz: kein Patient, Besatzung meldet und rückt ein
        r = A.evaluate("""async () => { const s = __t.s(); const e = await __t.einsatz(); e.wahr.fehleinsatz = 'kein Patient angetroffen, laut Nachbarn ist er schon selbst ins Krankenhaus gefahren';
            const fz = __t.rtw([], e.wahr); s.alarmiere(e.id, [fz.id]); e.adresse = { lat: e.wahr.lat, lon: e.wahr.lon, label: 'Test' };
            fz.phase = 'anfahrt'; fz.phaseEnde = s.state.zeit; fz.lat = e.wahr.lat; fz.lon = e.wahr.lon; s.updateVehicle(fz, s.state.zeit); const p1 = fz.phase;
            fz.phaseEnde = s.state.zeit; s.updateVehicle(fz, s.state.zeit);
            const funk = JSON.stringify(s.state.funkGespraeche ?? []).includes('kein Patient angetroffen');
            return { p1, frei: fz.einsatzId, funk, zust: e.zustand }; }""")
        print("    ", r)
        check(r["p1"] == "suche", "Fehleinsatz: Besatzung sucht zuerst")
        check(r["frei"] is None and r["funk"], "danach Funk „kein Patient angetroffen …“ und Fahrzeug frei")

        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
