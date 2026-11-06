# v0.53: ACN (Acute Community Nurse)
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8839", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
STEP = """const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const schritt = async (fz) => { while (fz.phase === 'routing') await sleep(20); s.state.zeit = fz.phaseEnde; s.updateVehicle(fz, s.state.zeit); while (fz.phase === 'routing') await sleep(20); };
  const frei = () => { for (const f of Object.values(s.state.fahrzeuge)) Object.assign(f, { einsatzId: null, phase: 'frei', status: 'freiWache', fahrt: null, phaseEnde: null, lat: f.heim.lat, lon: f.heim.lon, ausserDienst: false, kt: null }); };"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8839/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        d = A.evaluate("""() => { const s = window.__lw.sim; const acn = Object.values(s.state.fahrzeuge).filter(f => f.rmTyp === 'ACN');
          return { n: acn.length, bes: [...new Set(acn.map(f => f.besetzung.map(p => p.quali).join('+')))], funk: acn.map(f => f.funkrufname).sort(),
            modell: [...new Set(acn.map(f => f.modell))], code: window.__lw.sim.stufeDef?.('ACN')?.rettungsmittel ?? null }; }""")
        check(d["n"] == 6 and d["bes"] == ["NFS-NKI"] and d["modell"] == ["passat"], f"6 ACN, je eine Person (DGKP/NKI), PKW ({d})")
        # ACN-Einsatz: kommt mit Code über 1450, nur die ACN, 30–60 min, Patient bleibt zu Hause
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; """ + STEP + """
          s.state.zeit = new Date('2026-10-20T10:00').getTime(); frei();
          let e = null; const ids = ['NÖ-01','NÖ-02','NÖ-03','NÖ-04','NÖ-05','NÖ-06','NÖ-07','NÖ-08','NÖ-09','NÖ-10','NÖ-11','NÖ-12'];
          for (const id of ids) { s.settings.funkgruppe = id; e = await s.generiereAcn(); if (e) break; }
          if (!e) return { fehlt: true };
          const liste = await s.vorschlaege(e.id); const emp = s.empfehlung(e.id, liste);
          const acn = s.state.fahrzeuge[emp.ids[0]];
          s.alarmiere(e.id, [acn.id]); await schritt(acn); await schritt(acn); const t0 = s.state.zeit;
          const dauer = (acn.phaseEnde - t0) / 60000; const phase1 = acn.phase;
          while (acn.einsatzId) await schritt(acn);
          // keine ACN frei: Einsatz wartet
          for (const f of Object.values(s.state.fahrzeuge)) if (f.rmTyp === 'ACN') f.einsatzId = 'x';
          const e2 = await s.generiereAcn(); const emp2 = e2 ? s.empfehlung(e2.id, await s.vorschlaege(e2.id)) : null;
          return { code: e.code, meldung: e.meldung.text, ids: emp.ids.map(id => s.state.fahrzeuge[id].rmTyp), dauer, phase1, transport: e.wahr.transport, kh: e.kh, zustand: e.zustand, warten: emp2 && { ids: emp2.ids, g: emp2.gruende.join(' ') }, fg: s.settings.funkgruppe }; }""")
        check(not r.get("fehlt") and r["code"].startswith("ACN-O") and "1450" in r["meldung"] and r["ids"] == ["ACN"], f"ACN-Einsatz über 1450 mit ACN-Code, Vorschlag nur die ACN ({r.get('code')}, {r.get('ids')}, {r.get('fg')})")
        check(r.get("phase1") == "vorOrt" and 30 <= r["dauer"] <= 60.5 and r["transport"] is False and r["kh"] is None and r["zustand"] == "abgeschlossen", f"ACN 30–60 min vor Ort, Patient bleibt zu Hause ({r.get('dauer')}, {r.get('zustand')})")
        check(r.get("warten") and r["warten"]["ids"] == [] and "wartet" in r["warten"]["g"], f"Keine ACN frei: Einsatz wartet ({r.get('warten')})")
        # KTW statt ACN: nimmt den Patienten mit
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; """ + STEP + """
          frei(); const e = await s.generiereAcn();
          const ktw = Object.values(s.state.fahrzeuge).filter(f => f.kategorie === 'KTW').sort((a, b) => Math.hypot(a.lat - e.wahr.lat, a.lon - e.wahr.lon) - Math.hypot(b.lat - e.wahr.lat, b.lon - e.wahr.lon))[0];
          s.alarmiere(e.id, [ktw.id]); await schritt(ktw); await schritt(ktw); return { t: e.wahr.transport }; }""")
        check(r["t"] is True, "KTW bei ACN-Code: transportiert ins Krankenhaus")
        # ALS gelb, nur RS-RTW in der Nähe: RS-RTW + ACN statt NEF
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; """ + STEP + """
          frei(); s.settings.funkgruppe = s.settings.funkgruppe;
          for (const f of Object.values(s.state.fahrzeuge)) if (f.kategorie === 'RTW') f.besetzung = [{ rolle: 'Fahrer', quali: 'RS' }, { rolle: 'SR1', quali: 'RS' }];
          const codes = L.store.list('codes'); const cg = codes.find(c => c.kategorie === 'ALS gelb'); const co = codes.find(c => c.kategorie === 'ALS orange'); const cb = codes.find(c => c.kategorie === 'BLS gelb');
          const acn = Object.values(s.state.fahrzeuge).find(f => f.funkrufname.startsWith('80/003'));
          const p = { lat: acn.heim.lat + 0.004, lon: acn.heim.lon + 0.002 };
          const mk = (c) => { const e = s.erstelleEinsatz({ lat: p.lat, lon: p.lon, adresse: 'Test', code: { code: c.code, gruppe: 0, gruppenname: '', beschreibung: c.name, stufe: c.kategorie } }); e.adresse = { ...p, label: 'Test' }; e.code = c.code; return e; };
          const typen = async (e) => { const emp = s.empfehlung(e.id, await s.vorschlaege(e.id)); return { t: emp.ids.map(id => s.state.fahrzeuge[id].rmTyp), g: emp.gruende.join(' | ') }; };
          const g = await typen(mk(cg)); const b2 = await typen(mk(cb));
          // ALS orange: ACN ist das nächste Fahrzeug → First Responder, dazu RTW + Notarzt
          const pn = { lat: acn.heim.lat, lon: acn.heim.lon + 0.0005 };
          const eo = s.erstelleEinsatz({ lat: pn.lat, lon: pn.lon, adresse: 'Test', code: { code: co.code, gruppe: 0, gruppenname: '', beschreibung: co.name, stufe: co.kategorie } }); eo.adresse = { ...pn, label: 'Test' }; eo.code = co.code;
          const o = await typen(eo);
          return { g, b2, o }; }""")
        check("ACN" in r["g"]["t"] and "NEF" not in r["g"]["t"] and "NAH" not in r["g"]["t"] and any(t in ("RTW", "RTW-C") for t in r["g"]["t"]), f"ALS gelb ohne NFS am RTW: RS-RTW + ACN statt Notarzt ({r['g']})")
        check("ACN" not in r["b2"]["t"], f"BLS gelb: keine ACN ({r['b2']['t']})")
        check("ACN" in r["o"]["t"] and ("NEF" in r["o"]["t"] or "NAH" in r["o"]["t"]) and "First Responder" in r["o"]["g"], f"ALS orange, ACN am nächsten: First Responder + RTW + Notarzt ({r['o']})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
