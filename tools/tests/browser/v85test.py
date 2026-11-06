import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8885", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails=0; logs=[]
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails+=1
WIEN = {"kh%03d" % i for i in list(range(23, 34)) + list(range(42, 46)) + list(range(92, 99))}
HOLLA = (48.5606, 16.0789); STP = (48.2050, 15.6230)
FALL = """async ([lat, lon, wer]) => { const s = window.__lw.sim;
  s.flugHindernis = () => null;
  for (const f of Object.values(s.state.fahrzeuge)) if (f.einsatzId) s.freigeben(f);
  const e = await s.generiereFall('brustschmerz', 'A'); e.anruf.status = 'beendet';
  e.wahr.lat = lat; e.wahr.lon = lon; e.wahr.transport = true;
  s.aktualisiere(e.id, { adresse: { lat, lon, label: 'Testadresse' }, code: e.wahr.code });
  e.wahr.lage.fall.naMit = true; e.kh = null; e.nahEntscheid = undefined;
  const frei = Object.values(s.state.fahrzeuge).filter(f => s.verfuegbar(f) && !f.einsatzId);
  const d = (f) => Math.hypot(f.lat - lat, (f.lon - lon) * 0.66);
  const nimm = (k) => frei.filter(f => f.kategorie === k && !f.pilot && !f.ersatzFuer).sort((a, b) => d(a) - d(b))[0];
  const ids = { RTW: nimm('RTW'), NEF: nimm('NEF'), NAH: nimm('NAH') };
  const sel = wer.map(k => ids[k]);
  s.alarmiere(e.id, sel.map(f => f.id));
  for (const f of sel) { f.phase = 'vorOrt'; f.phaseEnde = null; f.lat = lat; f.lon = lon; }
  return { id: e.id, ids: Object.fromEntries(wer.map(k => [k, ids[k].id])), verdacht: s.verdacht(e) };
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8885/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.khGrundAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; s.state.khBelegung = {}; }")
        def zeit(iso): A.evaluate("(iso) => { window.__lw.sim.state.zeit = new Date(iso).getTime(); }", iso)
        def vor(pos, bu):
            return A.evaluate("([lat, lon, bu]) => window.__lw.sim.khFuer({lat, lon}, bu, true).slice(0, 6).map(v => ({ id: v.h.id, n: v.h.kurzname || v.h.name, e: v.eignung, zu: v.zu, voll: v.voll, km: Math.round(v.km) }))", [pos[0], pos[1], bu])
        def bestes(pos, bu):
            return A.evaluate("([lat, lon, bu]) => window.__lw.sim.naechstesKh({lat, lon}, bu, true)?.id", [pos[0], pos[1], bu])
        ZW = "avn:reanimation_stemi:30:e"
        # 1) Mittwoch 15 Uhr, Hollabrunn: Reanimation/STEMI → NÖ-Haus mit offenem Herzkatheter, nicht Floridsdorf
        zeit("2026-10-28T15:00:00")
        r = vor(HOLLA, ZW); print("    Mi 15h:", r)
        bid = bestes(HOLLA, ZW)
        check(bid not in WIEN, f"Reanimation/STEMI Hollabrunn Mi 15 Uhr → NÖ ({bid})")
        check(bid != "kh025" and not any(x["id"] == bid and x["zu"] for x in r), "Ziel hat den Herzkatheter offen")
        flo = [x for x in r if "Floridsdorf" in x["n"]]
        check(not flo or flo[0]["zu"], f"Floridsdorf ohne offenen Herzkatheter passt nicht ({flo})")
        check(bid == "kh005", f"nach Reanimation (kein laufender Stillstand): nächstes Haus mit offenem Herzkatheter = Mistelbach ({bid})")
        cac = A.evaluate("([lat, lon, bu]) => window.__lw.sim.naechstesKh({lat, lon}, bu, true, false, false, true)?.id", [HOLLA[0], HOLLA[1], ZW])
        check(cac == "kh001", f"laufende Reanimation unter 60: Cardiac Arrest Center St. Pölten geht vor ({cac})")
        cv = A.evaluate("""() => { const s = window.__lw.sim; const mk = (st, alter) => ({ wahr: { lage: { patienten: [{ alter, sichtung: 'rot', bw: 'nein', at: st === 'stillstand' ? 'keine' : 'normal' }] } } });
          return [s.cacVorrang(mk('stillstand', 45)), s.cacVorrang(mk('stillstand', 70)), s.cacVorrang(null)]; }""")
        check(cv == [True, False, False], f"Vorrang nur bei laufender Reanimation unter 60 ({cv})")
        r2 = vor(HOLLA, "bu_reanimation_mit_rosc"); print("    alte Buchung ROSC:", r2[:4])
        b2 = bestes(HOLLA, "bu_reanimation_mit_rosc")
        check(b2 not in WIEN, f"alte Buchung ROSC → NÖ ({b2})")
        # STEMI allgemein: NÖ zuerst
        r3 = vor(HOLLA, "avn:st_hebungsinfarkt_oder_stemi_aequivalent:30:e"); print("    STEMI:", r3[:4])
        check(bestes(HOLLA, "avn:st_hebungsinfarkt_oder_stemi_aequivalent:30:e") not in WIEN, "STEMI Hollabrunn → NÖ")
        # Wien-Gürtel nahe Wien: Mödling-Gegend Bauchschmerz → NÖ bevorzugt
        b4 = bestes((48.10, 16.29), "avn:bauchschmerz:20:e") if False else None

        def entscheid(pos, wer):
            f = A.evaluate(FALL, [pos[0], pos[1], wer])
            n = A.evaluate("(id) => { const s = window.__lw.sim; const e = s.einsatz(id); const r = s.nahTransportiert(e, s.state.zeit); return r === 'warten' ? 'warten' : r ? r.kategorie : null; }", f["id"])
            return f, n
        # 2) RTW+NEF+NAH Hollabrunn (STEMI, über 25 km) → NAH fliegt, NEF frei
        f, n = entscheid(HOLLA, ["RTW", "NEF", "NAH"]); print("    Holla 3er:", f, n)
        check(n == "NAH", f"RTW+NEF+NAH, zeitkritisch weit → NAH transportiert ({n})")
        A.evaluate("([id, nef]) => { const s = window.__lw.sim; s.entscheideTransport(s.state.fahrzeuge[nef], s.einsatz(id), s.state.zeit); }", [f["id"], f["ids"]["NEF"]])
        st = A.evaluate("(nef) => { const x = window.__lw.sim.state.fahrzeuge[nef]; return { e: x.einsatzId, b: x.begleitet }; }", f["ids"]["NEF"])
        check(not st["e"], f"NEF wird frei, wenn der NAH fliegt ({st})")
        # 3) RTW+NEF+NAH St. Pölten (KH nah) → NEF begleitet, NAH frei
        f, n = entscheid(STP, ["RTW", "NEF", "NAH"]); print("    StP 3er:", f, n)
        check(n is None, f"RTW+NEF+NAH, KH nah → bodengebunden ({n})")
        A.evaluate("([id, nef, nah]) => { const s = window.__lw.sim; const e = s.einsatz(id); s.entscheideTransport(s.state.fahrzeuge[nef], e, s.state.zeit); s.entscheideTransport(s.state.fahrzeuge[nah], e, s.state.zeit); }", [f["id"], f["ids"]["NEF"], f["ids"]["NAH"]])
        st = A.evaluate("([nef, nah]) => { const F = window.__lw.sim.state.fahrzeuge; return { nef: [F[nef].einsatzId, F[nef].begleitet], nah: [F[nah].einsatzId, F[nah].begleitet] }; }", [f["ids"]["NEF"], f["ids"]["NAH"]])
        check(st["nef"][1] and st["nef"][0], f"NEF begleitet den RTW ({st['nef']})")
        check(not st["nah"][0], f"NAH wird frei ({st['nah']})")
        # 4) RTW+NAH St. Pölten → NAH übernimmt (auch bei kurzem Weg), RTW frei
        f, n = entscheid(STP, ["RTW", "NAH"]); print("    StP RTW+NAH:", f, n)
        check(n == "NAH", f"RTW+NAH, Notarzt nötig → NAH transportiert ({n})")
        # 5) RTW+NEF → NEF begleitet
        f, n = entscheid(STP, ["RTW", "NEF"])
        A.evaluate("([id, nef]) => { const s = window.__lw.sim; s.entscheideTransport(s.state.fahrzeuge[nef], s.einsatz(id), s.state.zeit); }", [f["id"], f["ids"]["NEF"]])
        st = A.evaluate("(nef) => { const x = window.__lw.sim.state.fahrzeuge[nef]; return [x.einsatzId, x.begleitet]; }", f["ids"]["NEF"])
        check(st[0] and st[1], f"RTW+NEF → NEF begleitet im Konvoi ({st})")
        # 6) RTW+NAH, NAH kann nicht fliegen → Notarzt fährt im RTW mit
        f = A.evaluate(FALL, [STP[0], STP[1], ["RTW", "NAH"]])
        A.evaluate("() => { window.__lw.sim.flugHindernis = () => 'Nebel'; }")
        n = A.evaluate("(id) => { const s = window.__lw.sim; const r = s.nahTransportiert(s.einsatz(id), s.state.zeit); return r && r !== 'warten' ? r.kategorie : r; }", f["id"])
        A.evaluate("([id, nah]) => { const s = window.__lw.sim; s.entscheideTransport(s.state.fahrzeuge[nah], s.einsatz(id), s.state.zeit); }", [f["id"], f["ids"]["NAH"]])
        st = A.evaluate("(nah) => { const x = window.__lw.sim.state.fahrzeuge[nah]; return [x.einsatzId, x.begleitet]; }", f["ids"]["NAH"])
        print("    prot:", A.evaluate("(id) => window.__lw.sim.einsatz(id).protokoll.slice(-5).map(p => p.text)", f["id"]), A.evaluate("(id) => { const s = window.__lw.sim; const e = s.einsatz(id); return [s.naBegleitetFall(e), e.fahrzeuge.map(i => s.state.fahrzeuge[i].kategorie + ':' + s.state.fahrzeuge[i].phase + ':' + s.transportfaehig(s.state.fahrzeuge[i]))]; }", f["id"]))
        check(n is None and st[0] and st[1], f"NAH kann nicht fliegen → Notarzt bleibt beim Patienten im RTW ({n}, {st})")
        for l in logs: print(l)
        check(not logs, "keine Seitenfehler")
finally:
    srv.terminate()
print("FEHLER:", fails)
sys.exit(1 if fails else 0)
