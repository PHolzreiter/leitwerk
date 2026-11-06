# v0.52: NEF-Status beim Notarzt-Abholen, Hubschrauberlandeplätze, Fahrzeug bleibt auf der Straße, Fußweg der Besatzung
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8837", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
STEP = """const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const schritt = async (fz) => { while (fz.phase === 'routing') await sleep(20); s.state.zeit = fz.phaseEnde; s.updateVehicle(fz, s.state.zeit); while (fz.phase === 'routing') await sleep(20); };"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8837/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        # 1. Route endet auf der Straße
        r = A.evaluate("""() => { const f = window.__lw.fuss.anStrasse;
          const r = { coords: [[15.0, 48.0], [15.001, 48.0], [15.002, 48.0], [15.004, 48.0], [15.003, 48.001]], times: [0, 10, 20, 40, 60], duration: 60, distance: 0 };
          const x = f(r); return { ende: x.coords.at(-1), dauer: x.duration, n: x.coords.length, kurz: f({ coords: [[15, 48], [15.1, 48]], times: [0, 9], duration: 9, distance: 0 }).coords.length }; }""")
        check(abs(r["ende"][0] - 15.003) < 1e-9 and abs(r["ende"][1] - 48.0) < 1e-9 and abs(r["dauer"] - 30) < 1e-6 and r["kurz"] == 2, f"Route endet am nächsten Punkt der Straße, nicht im Haus ({r})")
        # 2. NEF Krems: Status beim Abholen, Bereitschaft nach dem Zurückbringen
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; """ + STEP + """
          s.state.zeit = new Date('2026-10-20T10:00').getTime();
          const nef = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '75/099');
          Object.assign(nef, { phase: 'frei', status: 'freiWache', einsatzId: null, lat: nef.heim.lat, lon: nef.heim.lon, naAnBord: false, ausserDienst: false, fahrt: null });
          const e = await s.generiereFall('kollaps', 'A'); e.adresse = { lat: 48.4738, lon: 15.6809, label: 'Hauptplatz Langenlois' };
          s.alarmiere(e.id, [nef.id]); const st = [nef.status];
          await schritt(nef); st.push(nef.phase + ':' + nef.status);
          await schritt(nef); st.push(nef.phase + ':' + nef.status);
          await schritt(nef); st.push(nef.phase + ':' + nef.status);
          nef.lat = e.adresse.lat; nef.lon = e.adresse.lon; nef.fahrt = null; nef.phaseEnde = null; s.freigeben(nef); while (nef.phase === 'routing') await sleep(20);
          st.push(nef.phase + ':' + nef.status);
          await schritt(nef); st.push(nef.phase + ':' + nef.status);
          const imm = s.ausrueckSek(nef, true);
          return { st, ausr: imm, unterwegs: s.settings.ausrueck.unterwegs }; }""")
        st = r["st"]
        check(st[1] == "naAbholung:alarmiert" and st[2] == "naEinstieg:alarmiert" and st[3] == "anfahrt:zumBO", f"Abhol-NEF: „alarmiert und quittiert“ bis zur Abfahrt beim KH, dann „zum BO“ ({st})")
        check(st[4] == "rueckfahrt:freiFunk" and st[5] == "rueckfahrt:bereitschaft" and r["ausr"] == r["unterwegs"], f"Nach dem Zurückbringen: Bereitschaft, fährt heim (Alarm wie unterwegs) ({st}, {r['ausr']})")
        # 3. Fußweg: RTW steht 200 m vom Patienten entfernt auf der Straße
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; """ + STEP + """
          s.state.zeit = new Date('2026-10-20T11:00').getTime();
          const rtw = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'RTW' && f.status === 'freiWache' && !f.einsatzId && !f.funkrufname.startsWith('77/8'));
          const e = await s.generiereFall('kollaps', 'A'); e.adresse = { lat: e.wahr.lat, lon: e.wahr.lon, label: 'Test' };
          s.alarmiere(e.id, [rtw.id]);
          await schritt(rtw);
          // simuliert: Straße endet 200 m vor dem Patienten
          const park = [e.wahr.lon + 200 / (111320 * Math.cos(e.wahr.lat * Math.PI / 180)), e.wahr.lat];
          rtw.fahrt.coords[rtw.fahrt.coords.length - 1] = park;
          const ankunft = rtw.phaseEnde;
          await schritt(rtw);
          const f = rtw.fuss; const vorOrtEnde = rtw.phaseEnde;
          const mitte = L.fuss.besatzungBei(rtw, ankunft + f.hinSek * 500); const beimPat = L.fuss.besatzungBei(rtw, ankunft + f.hinSek * 1000 + 1000);
          const leute = L.fuss.personenBei(rtw, ankunft + 1000);
          const funk = (s.state.funk ?? []).slice(-5).map(x => x.text).join(' | ');
          await schritt(rtw); const zur = rtw.fuss ? { ab: rtw.fuss.zurueckAb, sek: rtw.fuss.zurueckSek } : null; const phase2 = rtw.phase;
          const zurueckMitte = L.fuss.besatzungBei(rtw, rtw.fuss.zurueckAb + rtw.fuss.zurueckSek * 500);
          await schritt(rtw); const amFz = L.fuss.besatzungBei(rtw, s.state.zeit + 1000);
          const d = (a, lat, lon) => Math.hypot((a[1] - lat) * 111320, (a[0] - lon) * 111320 * Math.cos(lat * Math.PI / 180));
          return { m: f && Math.round(f.m), hin: f && f.hinSek, extra: (vorOrtEnde - ankunft) / 1000, mitteZumPat: mitte && Math.round(d(mitte.pos, e.wahr.lat, e.wahr.lon)), geht: mitte?.geht, beimPat: beimPat && Math.round(d(beimPat.pos, e.wahr.lat, e.wahr.lon)), steht: beimPat && !beimPat.geht,
            n: leute.length, besetzung: rtw.besetzung.length, zur, phase2, zurueckMitte: zurueckMitte && Math.round(d(zurueckMitte.pos, e.wahr.lat, e.wahr.lon)), amFz, phase3: rtw.phase, funk }; }""")
        check(r["m"] and 195 <= r["m"] <= 205 and r["hin"] > 150 and r["extra"] > 600 + r["hin"] - 1, f"Fahrzeug 200 m entfernt: Fußweg verlängert die Zeit bis zum Patientenkontakt ({r['m']} m, {r['hin']:.0f} s)")
        check(r["geht"] and 90 <= r["mitteZumPat"] <= 110 and r["beimPat"] == 0 and r["steht"] and r["n"] == r["besetzung"], f"Besatzung geht zum Patienten, steht dort; je Person ein Punkt ({r})")
        check(r["zur"] and r["phase2"] == "vorOrt" and r["zur"]["sek"] > r["hin"] and 90 <= r["zurueckMitte"] <= 110 and r["amFz"] is None, f"Rückweg zum Fahrzeug (mit Patient langsamer), danach sitzt die Besatzung im Fahrzeug ({r['zur']}, {r['phase3']})")
        r2 = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; """ + STEP + """
          const rtw = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'RTW' && f.status === 'freiWache' && !f.einsatzId && !f.funkrufname.startsWith('77/8'));
          const e = await s.generiereFall('kollaps', 'A'); e.adresse = { lat: e.wahr.lat, lon: e.wahr.lon, label: 'Test' };
          s.alarmiere(e.id, [rtw.id]); await schritt(rtw);
          rtw.fahrt.coords[rtw.fahrt.coords.length - 1] = [e.wahr.lon, e.wahr.lat + 600 / 111320];
          const n0 = (e.protokoll ?? []).length; await schritt(rtw);
          return e.protokoll.slice(n0).map(x => x.text).join(' | '); }""")
        check("Fußweg" in r2 and "600 m" in r2, f"Größere Entfernung wird gemeldet ({r2})")
        # 4. Hubschrauber: Landeplatz, „kein Landeplatz“ wird nicht gewählt
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const st = L.store; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          const kh = st.get('hospitals', 'kh002'); const lp = { lat: kh.lat + 0.001, lon: kh.lon + 0.001 };
          st.upsert('hospitals', [{ ...kh, landeplatz: lp }]);
          const nah = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'NAH');
          s.fahre(nah, st.get('hospitals', 'kh002'), 'transport', false); await sleep(100);
          const ende = nah.fahrt.coords.at(-1);
          const k = st.get('hospitals', 'kh002');
          st.upsert('hospitals', [{ ...k, landeplatz: 'kein' }]);
          const alle = s.khFuer({ lat: 48.41, lon: 15.6 }, null, true, false, true).map(v => v.h.id);
          const ohne = s.khFuer({ lat: 48.41, lon: 15.6 }, null, true, false, false).map(v => v.h.id);
          st.upsert('hospitals', [{ ...k, landeplatz: undefined }]);
          return { ende, lp, mitLp: alle.includes('kh002'), ohneFilter: ohne.includes('kh002'), parse: [L.landeplatz.lesen('kein'), L.landeplatz.lesen('48.1, 15.2'), L.landeplatz.lesen('')] }; }""")
        check(abs(r["ende"][0] - r["lp"]["lon"]) < 1e-9 and abs(r["ende"][1] - r["lp"]["lat"]) < 1e-9, "Hubschrauber landet auf dem Landeplatz, nicht in der Hausmitte")
        check(not r["mitLp"] and r["ohneFilter"] and r["parse"] == ["kein", {"lat": 48.1, "lon": 15.2}, None], f"Haus ohne Landeplatz wird für Hubschraubertransporte nicht gewählt ({r['parse']})")
        d = A.evaluate("""() => { const st = window.__lw.store; const g = (id) => st.get('hospitals', id).landeplatz ?? null;
          return { stp: g('kh001'), mauer: g('kh039'), hinterbr: g('kh099'), gaens: g('kh108'), korneub: g('kh011'), gmuend: g('kh021'), akh: g('kh023'),
            kein: st.list('hospitals').filter(h => h.landeplatz === 'kein').map(h => h.id).sort() }; }""")
        check(d["kein"] == ["kh039", "kh099", "kh108"] and d["korneub"] is None and d["gmuend"] is None, f"„Kein Landeplatz“ nur Mauer, Hinterbrühl, Gänserndorf; Schockraum-Häuser und Außenlandungen landen in der Klinik ({d['kein']})")
        check(isinstance(d["stp"], dict) and isinstance(d["akh"], dict) and abs(d["akh"]["lat"] - 48.221426) < 1e-6, f"Landeplätze aus Recherche/OpenStreetMap (St. Pölten {d['stp']}, AKH {d['akh']})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
