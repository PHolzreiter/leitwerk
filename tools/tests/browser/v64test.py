# v0.64: Flughafen Wien – NAW, Flughafenambulanz nur am Gelände, Sicherheitskontrolle, Medical/Health Center, Überstellung
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8864", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
FH = "{ lat: 48.11960, lon: 16.56300 }"   # Vorfeld/Terminal
AUSSEN = "{ lat: 48.14050, lon: 16.47600 }"  # Schwechat Stadt
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_page(viewport={"width": 1600, "height": 950}); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8864/?debug"); A.wait_for_timeout(3500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.funkgruppe = 'NÖ-05'; st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("() => window.__lw.sim.call('neuesSpiel', new Date('2026-10-27T10:30:00').getTime())"); A.wait_for_timeout(1000)
        A.evaluate("() => window.__lw.sim.call('pause')")
        d = A.evaluate(f"""() => {{ const s = window.__lw.sim, F = window.__lw.flughafen; const f = (n) => Object.values(s.state.fahrzeuge).find(x => x.funkrufname === n);
          const rtw = f('77/898'), naw = f('77/899');
          return {{ rtw: rtw && [rtw.rmTyp, s.rufname(rtw), rtw.status], naw: naw && [naw.rmTyp, s.rufname(naw), naw.besetzung.map(x => x.quali), s.mitNotarzt(naw), s.transportfaehig(naw)],
            st: window.__lw.store.list('stations').filter(x => /Flughafen/.test(x.name)).map(x => x.name),
            kh: ['kh115','kh116'].map(id => window.__lw.store.get('hospitals', id)?.kurzname),
            drin: [F.amFlughafen({FH}), F.amFlughafen({AUSSEN}), F.amFlughafen(rtw.heim)] }}; }}""")
        print("   ", d)
        check(d["rtw"] and d["rtw"][0] == "RTW" and d["rtw"][1] == "RTW Flughafen", f"RTW 77/898 „RTW Flughafen“ {d['rtw']}")
        n = d["naw"]
        check(n and n[0] == "NAW" and n[1] == "NAW Flughafen" and "NA" in n[2] and any(q in ("NFS-NKV", "NFS-NKI") for q in n[2]) and n[3] and n[4], f"NAW 77/899: Notarzt + NKV/NKI, transportiert {n}")
        check(any("Wache 1" in x for x in d["st"]) and any("Wache 2" in x for x in d["st"]) and any(x.startswith("Polizei Flughafen") for x in d["st"]) and any("Flughafenambulanz" in x for x in d["st"]), f"Dienststellen: {d['st']}")
        check(d["kh"] == ["Health Center Flughafen", "Medical Center Flughafen"], f"Health Center und Medical Center {d['kh']}")
        check(d["drin"] == [True, False, True], f"Flughafengelände erkannt {d['drin']}")
        # Vorschläge und Empfehlung
        r = A.evaluate(f"""async () => {{ const s = window.__lw.sim; const f = (n) => Object.values(s.state.fahrzeuge).find(x => x.funkrufname === n);
          const mk = (pos, stufe) => {{ const e = s.erstelleEinsatz({{ ...pos, adresse: 'Test', code: {{ code: 'T', gruppe: 0, gruppenname: '', beschreibung: 'Test', stufe }}, transport: true }}); e.adresse = {{ ...pos, label: 'Test' }}; e.code = 'T'; e.codeQuelle = 'dispo'; return e; }};
          const stufeMit = (e, stufe) => {{ s.stufeVon = ((alt) => (x) => x.id === e.id ? s.stufeDef(stufe) : alt.call(s, x))(s.stufeVon); }};
          const out = {{}};
          const ea = mk({AUSSEN}, 'ALS orange'); stufeMit(ea, 'ALS orange');
          const va = await s.vorschlaege(ea.id);
          out.aussenFh = va.filter(v => v.fz.stationId === 'btf-flughafen-wien').length;
          out.aussenAlarm = s.alarmiere(ea.id, [f('77/899').id]).join(' | ');
          const ei = mk({FH}, 'ALS orange'); stufeMit(ei, 'ALS orange');
          const vi = await s.vorschlaege(ei.id);
          const emp = s.empfehlung(ei.id, vi);
          out.orange = emp.ids.map(id => s.state.fahrzeuge[id].funkrufname + '/' + s.state.fahrzeuge[id].rmTyp);
          const eg = mk({FH}, 'BLS gelb'); stufeMit(eg, 'BLS gelb');
          out.gelb = s.empfehlung(eg.id, await s.vorschlaege(eg.id)).ids.map(id => s.state.fahrzeuge[id].funkrufname);
          // NAW besetzt: RTW Flughafen + NEF von außen
          const naw = f('77/899'); const alt = naw.status; naw.status = 'zumBO';
          const eo = mk({FH}, 'ALS orange'); stufeMit(eo, 'ALS orange');
          out.ohneNaw = s.empfehlung(eo.id, await s.vorschlaege(eo.id)).ids.map(id => s.state.fahrzeuge[id].funkrufname + '/' + s.state.fahrzeuge[id].rmTyp);
          naw.status = alt;
          // Kontrolle in der Ankunftszeit: externes Fahrzeug zum Flughafen
          const ext = vi.find(v => v.fz.stationId !== 'btf-flughafen-wien' && !['NAH','ITH'].includes(v.fz.rmTyp) && v.sekunden);
          out.ext = ext && [ext.fz.funkrufname, Math.round(ext.sekunden)];
          return out; }}""")
        print("   ", r)
        check(r["aussenFh"] == 0 and "nur am Flughafengelände" in r["aussenAlarm"], f"außerhalb: Flughafenambulanz nicht im Vorschlag, Alarmieren abgelehnt ({r['aussenAlarm']})")
        check(any(x.startswith("77/899") for x in r["orange"]) and not any(x.endswith("/NEF") or x.endswith("/NAH") for x in r["orange"]), f"ALS orange am Flughafen: NAW, kein NEF {r['orange']}")
        check(r["gelb"][:1] == ["77/898"], f"BLS gelb: RTW Flughafen {r['gelb']}")
        check(any(x.startswith("77/898") for x in r["ohneNaw"]) and any(x.endswith("/NEF") or x.endswith("/NAH") for x in r["ohneNaw"]), f"NAW besetzt: RTW Flughafen + Notarzt von außen {r['ohneNaw']}")
        # Sicherheitskontrolle
        k = A.evaluate(f"""() => {{ const F = window.__lw.flughafen; const a = {AUSSEN}, z = {FH};
          const r0 = {{ coords: [[a.lon, a.lat], [z.lon, z.lat]], times: [0, 600], duration: 600, distance: 7000 }};
          const hin = F.mitKontrolle(r0); const rueck = F.mitKontrolle({{ ...r0, coords: [...r0.coords].reverse() }});
          const halt = hin.route.coords[1]; return {{ halte: hin.halte, dauer: hin.route.duration, n: hin.route.coords.length, rand: [F.amFlughafen({{ lat: halt[1] - 0.0003, lon: halt[0] - 0.0003 }}), F.amFlughafen({{ lat: halt[1] + 0.0003, lon: halt[0] + 0.0003 }})], rueck: rueck.route.duration, sek: F.kontrolleSek(a, z) }}; }}""")
        print("   ", k)
        check(k["halte"] == 1 and k["dauer"] == 660 and k["rueck"] == 660 and k["sek"] == 60, f"Sicherheitskontrolle: 1 Minute hinein und hinaus {k}")
        # Fahrt eines Fahrzeugs von außen: Halt an der Einfahrt
        fa = A.evaluate(f"""async () => {{ const s = window.__lw.sim; const fz = Object.values(s.state.fahrzeuge).find(x => x.funkrufname === '77/001') ?? Object.values(s.state.fahrzeuge).find(x => x.rmTyp === 'RTW' && x.stationId !== 'btf-flughafen-wien' && x.funkrufname.startsWith('77/'));
          const eigen = Object.values(s.state.fahrzeuge).find(x => x.funkrufname === '77/898');
          s.fahre(fz, {FH}, 'anfahrt', false); s.fahre(eigen, {AUSSEN}, 'rueckfahrt', false);
          await new Promise(r => setTimeout(r, 400));
          const stehen = (f) => {{ for (let i = 1; i < f.coords.length; i++) if (f.coords[i][0] === f.coords[i-1][0] && f.coords[i][1] === f.coords[i-1][1] && f.times[i] - f.times[i-1] >= 59) return true; return false; }};
          const r = {{ fz: fz.funkrufname, halt: stehen(fz.fahrt), eigenHalt: stehen(eigen.fahrt) }};
          fz.fahrt = null; fz.phase = 'frei'; eigen.fahrt = null; eigen.phase = 'frei'; return r; }}""")
        print("   ", fa)
        check(fa["halt"] and not fa["eigenHalt"], f"Fahrzeug von außen hält an der Einfahrt, Flughafenambulanz nicht {fa}")
        # Ziele
        z = A.evaluate(f"""() => {{ const s = window.__lw.sim; const pos = {FH};
          const erst = (v, rot) => s.khFuer(pos, v, rot)[0]?.h.kurzname;
          const out = {{ haus: erst('bu_hausaerztlich', false), bein: erst('bu_isolierte_extremitaetenverletzung', false), rot: erst('bu_stemi', true), aussenMc: s.khFuer({AUSSEN}, 'bu_isolierte_extremitaetenverletzung', false).some(x => x.h.id === 'kh116') }};
          // Health Center voll
          const b = (s.state.khBelegung ??= {{}}); const alt = b.kh115; b.kh115 = {{ pvz: [1,2,3].map(() => ({{ bis: s.state.zeit + 3600000, einsatz: '' }})) }};
          out.voll = erst('bu_hausaerztlich', false); b.kh115 = alt;
          // Freitag: Health Center zu
          const t0 = s.state.zeit; s.state.zeit = new Date('2026-10-30T10:30:00').getTime(); out.freitag = erst('bu_hausaerztlich', false); s.state.zeit = t0;
          return out; }}""")
        print("   ", z)
        check(z["haus"] == "Health Center Flughafen", f"hausärztlich, Health Center offen: dorthin ({z['haus']})")
        check(z["bein"] == "Medical Center Flughafen", f"nicht kritisch, braucht ein KH: Medical Center ({z['bein']})")
        check(z["rot"] not in ("Medical Center Flughafen", "Health Center Flughafen", None), f"kritisch: direkt in die Klinik ({z['rot']})")
        check(not z["aussenMc"], "Medical Center nur für Patienten vom Flughafen")
        check(z["voll"] == "Medical Center Flughafen" and z["freitag"] == "Medical Center Flughafen", f"Health Center voll/zu: Medical Center ({z['voll']}, {z['freitag']})")
        # Überstellung vom Medical Center
        u = A.evaluate(f"""() => {{ const s = window.__lw.sim; const fz = Object.values(s.state.fahrzeuge).find(x => x.funkrufname === '77/898');
          const e = s.erstelleEinsatz({{ ...{FH}, adresse: 'Terminal 1', code: {{ code: 'T', gruppe: 0, gruppenname: '', beschreibung: 'Test', stufe: 'BLS gelb' }}, transport: true }});
          e.adresse = {{ ...{FH}, label: 'Terminal 1' }};
          e.kh = {{ hospitalId: 'kh116', grund: 'bu_isolierte_extremitaetenverletzung', durch: 'rtw', zeit: s.state.zeit }};
          e.fahrzeuge.push(fz.id); fz.einsatzId = e.id; fz.phase = 'transport'; fz.phaseEnde = s.state.zeit; fz.fahrt = null;
          const n0 = (s.state.kt ?? []).length;
          s.updateVehicle(fz, s.state.zeit + 1000);
          const k = s.state.kt[0];
          const r = {{ neu: (s.state.kt ?? []).length - n0, von: k?.wahr.d.von?.khId, nach: k?.wahr.d.nach?.label, quelle: k?.quelle, status: k?.status, grund: k?.wahr.d.grund, log: e.protokoll.map(x => x.text).filter(t => /Medical Center/.test(t)) }};
          // hausärztlich: keine Überstellung
          const e2 = s.erstelleEinsatz({{ ...{FH}, adresse: 'Terminal 1', code: {{ code: 'T', gruppe: 0, gruppenname: '', beschreibung: 'Test', stufe: 'BLS gelb' }}, transport: true }});
          e2.kh = {{ hospitalId: 'kh116', grund: 'bu_hausaerztlich', durch: 'rtw', zeit: s.state.zeit }};
          fz.einsatzId = e2.id; e2.fahrzeuge.push(fz.id); fz.phase = 'transport'; fz.phaseEnde = s.state.zeit;
          const n1 = s.state.kt.length; s.updateVehicle(fz, s.state.zeit + 1000); r.haus = s.state.kt.length - n1;
          return r; }}""")
        print("   ", u)
        check(u["neu"] == 1 and u["von"] == "kh116" and u["quelle"] == "hotline" and u["status"] == "aufnahme" and "Flughafen" in (u["grund"] or "") and u["log"], f"Medical Center ruft an der KT-Hotline an: Überstellung ins KH {u}")
        check(u["nach"] and "Flughafen" not in u["nach"], f"Ziel ist ein Klinikum ({u['nach']})")
        check(u["haus"] == 0, "hausärztlich: Medical Center versorgt selbst, keine Überstellung")
        # KT-Vorschläge ohne Flughafenambulanz
        kv = A.evaluate("""async () => { const s = window.__lw.sim; const k = s.state.kt[s.state.kt.length > 1 ? 1 : 0]; k.d = structuredClone(k.wahr.d); const v = await s.ktVorschlaege(k.id); return v.filter(x => x.fz.stationId === 'btf-flughafen-wien').length; }""")
        check(kv == 0, "Flughafenambulanz nicht für Krankentransporte")
        # Feuerwehr
        fw = A.evaluate(f"""() => {{ const s = window.__lw.sim; return [s.partnerStation('fw', {FH})?.name, s.partnerStation('fw', {AUSSEN})?.name]; }}""")
        check(fw[0] and "Betriebsfeuerwehr Flughafen" in fw[0] and "Flughafen" not in (fw[1] or "Flughafen"), f"Feuerwehr: Betriebsfeuerwehr nur am Gelände {fw}")
        # Nacht: RTW Flughafen außer Dienst – der NAW fährt auch leichte Einsätze
        A.evaluate("() => window.__lw.sim.call('neuesSpiel', new Date('2026-10-28T02:00:00').getTime())"); A.wait_for_timeout(1000)
        A.evaluate("() => window.__lw.sim.call('pause')")
        nacht = A.evaluate(f"""async () => {{ const s = window.__lw.sim; const f = (n) => Object.values(s.state.fahrzeuge).find(x => x.funkrufname === n);
          const e = s.erstelleEinsatz({{ ...{FH}, adresse: 'Test', code: {{ code: 'T', gruppe: 0, gruppenname: '', beschreibung: 'Test', stufe: 'BLS gelb' }}, transport: true }}); e.adresse = {{ ...{FH}, label: 'Test' }}; e.code = 'T'; e.codeQuelle = 'dispo';
          s.stufeVon = ((alt) => (x) => x.id === e.id ? s.stufeDef('BLS gelb') : alt.call(s, x))(s.stufeVon);
          return {{ rtw: f('77/898').status, naw: f('77/899').status, emp: s.empfehlung(e.id, await s.vorschlaege(e.id)).ids.map(id => s.state.fahrzeuge[id].funkrufname) }}; }}""")
        check(nacht["rtw"] == "abgemeldet" and nacht["emp"][:1] == ["77/899"], f"Nacht: RTW außer Dienst, NAW fährt {nacht}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
