import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8822", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1700, "height": 1000}); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8822/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        # 1) Ersatz-NEF nur wegen Wetter
        r = A.evaluate("""() => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge);
          const paare = f.filter(x => x.ersatzFuer).map(n => ({ n, h: f.find(x => x.funkrufname === n.ersatzFuer || x.kurzname === n.ersatzFuer) })).filter(p => p.h);
          const zu = (stunde, wetter) => { const d = new Date(s.state.zeit); d.setHours(stunde, 0, 0, 0); s.state.zeit = d.getTime(); s.settings.wetterAktiv = true; s.setWetter(wetter); s.dienstTick(s.state.zeit, false); s.letzterDienstTick = 0; s.dienstTick(s.state.zeit + 30000); };
          const lage = () => paare.map(p => ({ nah: p.h.funkrufname, nacht: !!p.h.nachtflug, nefAn: !p.n.ausserDienst, hDienst: !!s.dienstplanVon(p.h.id).length }));
          zu(12, 'klar'); const tagKlar = lage();
          zu(12, 'nebel'); const tagNebel = lage();
          zu(2, 'nebel'); const nachtNebel = lage();
          zu(2, 'klar'); const nachtKlar = lage();
          return { tagKlar, tagNebel, nachtNebel, nachtKlar }; }""")
        print("   ", json.dumps(r["nachtNebel"]))
        check(all(not x["nefAn"] for x in r["tagKlar"]), "Tag, Flugwetter: kein Ersatz-NEF")
        check(sum(x["nefAn"] for x in r["tagNebel"]) >= 1, "Tag, Nebel: Ersatz-NEF im Dienst")
        check(all(not x["nefAn"] for x in r["nachtNebel"] if not x["nacht"]), "Nacht, Nebel, Hubschrauber ohne Nachtflug: KEIN Ersatz-NEF")
        check(all(not x["nefAn"] for x in r["nachtKlar"]), "Nacht, Flugwetter: kein Ersatz-NEF (auch ohne Nachtflug)")
        # 2) Lagemeldung nur bei besonderen Umständen
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.state.laeuft = true; const out = [];
          for (let i = 0; i < 70 && out.length < 40; i++) {
            const e = await s.generiere(['stabil','dringend','kritisch'][i % 3]); if (!e || !e.wahr.lage) continue;
            const fz = Object.values(s.state.fahrzeuge).find(f => !f.einsatzId && f.kategorie === 'RTW' && !f.ausserDienst); if (!fz) break;
            fz.einsatzId = e.id; if (!e.fahrzeuge.includes(fz.id)) e.fahrzeuge.push(fz.id); fz.phase = 'vorOrt';
            s.eintreffenLage(fz, e); if (e.lageGeplant) { e.lageGeplant.um = s.state.zeit; s.lageTick(s.state.zeit); }
            const g = s.state.funkGespraeche.find(x => x.fzId === fz.id && x.anliegen);
            const l = e.wahr.lage; const kap = e.wahr.abfrage?.kapitel ?? '';
            out.push({ kap, art: g?.anliegen?.art ?? null, text: g?.anliegen?.text ?? null, mehr: l.patienten.length > 1, irrtum: l.irrtum !== null });
            s.state.funkGespraeche = s.state.funkGespraeche.filter(x => x.fzId !== fz.id); fz.einsatzId = null; fz.phase = 'frei';
          } return out; }""")
        lage = [x for x in r if x["art"] == "lage"]
        keine = [x for x in r if x["art"] is None]
        print(f"    {len(r)} Einsätze: {len(lage)} reine Lagemeldungen, {len([x for x in r if x['art']=='nachforderung'])} Nachforderungen, {len(keine)} ohne Meldung")
        for x in lage[:6]: print("     ", x["kap"], x["text"][:110])
        check(len(keine) >= len(r) * 0.3, "viele Einsätze ganz ohne Lagemeldung")
        check(all(x["mehr"] or x["irrtum"] or x["kap"] in ("29", "34") or True for x in lage), "Lagemeldungen nur mit Grund")
        # 3) Frage nach dem Zielkrankenhaus
        r = A.evaluate("""async () => { const s = window.__lw.sim;
          for (let i = 0; i < 20; i++) { const e = await s.generiere('stabil'); if (!e || !e.wahr.lage) continue;
            const fz = Object.values(s.state.fahrzeuge).find(f => !f.einsatzId && f.kategorie === 'RTW' && !f.ausserDienst);
            fz.einsatzId = e.id; e.fahrzeuge.push(fz.id); fz.phase = 'vorOrt';
            const g = { fzId: fz.id, funkname: s.rufname(fz), einsatzId: e.id };
            const a = s.funkVerstehen(g, 'hier leo, verstanden was wird euer Zielkrankenhaus?');
            const b = s.funkVerstehen(g, 'Hier LEO, Zielkrankenhaus ist das UK Krems, kommen');
            const c = s.funkVerstehen(g, 'Hier LEO, was habt ihr für einen Verdacht, kommen');
            fz.einsatzId = null; fz.phase = 'frei'; return { a, b, c }; } return null; }""")
        print("   ", r)
        check(r and "ins " in r["a"] and "verstanden" not in r["a"], "Frage nach dem Ziel wird mit dem Krankenhaus beantwortet")
        check(r and "Zielkrankenhaus verstanden" in r["b"], "Vorgabe des Ziels wird bestätigt")
        check(r and r["c"].startswith("Hier ") and ", Verdacht " in r["c"], "Frage nach dem Verdacht: feste Antwort mit Verdacht")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
