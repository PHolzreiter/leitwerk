import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8793", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails=0; logs=[]
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails+=1

SETUP = """async (kap) => {
  const s = window.__lw.sim, st = window.__lw.store;
  const rtw = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'RTW' && s.verfuegbar(f) && !f.einsatzId);
  const P = { lat: rtw.heim.lat + 0.03, lon: rtw.heim.lon + 0.01 };
  const mk = (id, name, typ, dlat, dlon) => ({ id, name, organisation: typ, typ, ort: 'Testort', bezirk: '', adresse: '', lat: P.lat + dlat, lon: P.lon + dlon, hinweis: '', herkunft: 'manuell' });
  st.upsert('stations', [mk('t-pol', 'Polizeiinspektion Testort', 'Polizei', 0.02, 0), mk('t-fw', 'Freiwillige Feuerwehr Testort', 'Feuerwehr', 0, 0.02), mk('t-pol2', 'Polizeiinspektion Weitweg', 'Polizei', 0.3, 0.3)]);
  const c = st.list('codes').find(x => x.code.startsWith('RD-' + kap + 'D')) || st.list('codes').find(x => x.code.startsWith('RD-' + kap));
  const code = { code: c.code, gruppe: Number(kap), gruppenname: '', beschreibung: c.name, stufe: c.kategorie };
  const ant = kap === '4' ? { taeter_vor_ort: 'ja' } : { eingeklemmt: 'nein' };
  const e = s.erstelleEinsatz({ lat: P.lat, lon: P.lon, adresse: 'Testgasse 1, Testort', code, fall: { kapitel: kap, antworten: ant, code: c.code }, transport: true });
  e.wahr.transport = true;
  e.anruf.status = 'beendet'; e.anruf.kapitel = kap; e.anruf.antworten = { ...ant };
  s.aktualisiere(e.id, { adresse: { lat: P.lat, lon: P.lon, label: 'Testgasse 1, Testort' }, code: c.code });
  return { id: e.id, rtw: rtw.id, code: c.code };
}"""

ZUSTAND = """(id) => { const s = window.__lw.sim; const e = s.einsatz(id); return {
  rd: e.fahrzeuge.map(i => s.state.fahrzeuge[i]).map(f => f.funkrufname + ':' + f.phase + ':' + (f.einsatzId === id ? 'E' : '-')),
  p: s.partnerVon(e).map(u => u.name + ':' + u.phase),
  br: e.br ? e.br.label : null, sicher: e.boSicher || null, um: e.boSicherUm || null, da: e.partnerDa || {}, zustand: e.zustand,
  funk: s.state.funk.slice(0, 5).map(f => f.von + ': ' + f.text),
  prot: e.protokoll.slice(-4).map(p => p.text) }; }"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8793/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")

        # --- Gewalt: Bereitstellungsraum, Polizei sichert, begleitet ins KH
        r = A.evaluate(SETUP, "4")
        print("   ", r)
        erk = A.evaluate("(id) => window.__lw.sim.partnerErkannt(window.__lw.sim.einsatz(id))", r["id"])
        check(any(x["art"] == "pol" and x.get("eigenschutz") for x in erk), f"Polizei mit Eigenschutz erkannt {erk}")
        A.evaluate("([id, rtw]) => window.__lw.sim.alarmiere(id, [rtw])", [r["id"], r["rtw"]])
        z = A.evaluate(ZUSTAND, r["id"])
        check(bool(z["br"]), f"Bereitstellungsraum festgelegt: {z['br']}")
        # Einsatz öffnen: Partner-Knopf leuchtet
        A.evaluate("(id) => window.__lw.sim.oeffne(id)", r["id"]); A.wait_for_timeout(300)
        A.evaluate("() => { window.__lw.sim.setTempo(60); window.__lw.sim.start(); }")
        A.wait_for_timeout(6000)
        z = A.evaluate(ZUSTAND, r["id"]); print("   ", z)
        check(any("bereitstellung" in x or "wartetBR" in x for x in z["rd"]), "RTW fährt in den Bereitstellungsraum")
        A.evaluate("(id) => window.__lw.sim.partnerAnfordern(id, 'pol')", r["id"])
        z = A.evaluate(ZUSTAND, r["id"])
        check(len(z["p"]) == 3, f"3 Polizeifahrzeuge {z['p']}")
        check(all("PI Testort" in x for x in z["p"]), "von der nächsten Polizeiinspektion")
        gesehen = set(); sicher = None; begleit = False
        for i in range(90):
            A.wait_for_timeout(1000)
            z = A.evaluate(ZUSTAND, r["id"])
            for x in z["rd"] + z["p"]: gesehen.add(x.split(":")[1])
            if z["sicher"] and not sicher:
                sicher = z; print("    sicher:", z)
            if any("begleitung" in x or "amKH" in x for x in z["p"]): begleit = True
            if z["zustand"] == "abgeschlossen" and not z["p"]: break
        print("    Phasen:", sorted(gesehen)); print("   ", z)
        check("wartetBR" in gesehen, "RTW wartet im Bereitstellungsraum")
        check(sicher is not None, "Polizei meldet Einsatzort gesichert")
        check(sicher is not None and any("Polizei-Leitstelle" in f for f in sicher["funk"]), "Funkmeldung der Polizei-Leitstelle")
        check(begleit, "Polizei begleitet ins Krankenhaus")
        A.screenshot(path=f"{S}/partner_gewalt.png")

        # --- Feuerwehr bleibt länger, Knopf leuchtet
        A.evaluate("() => window.__lw.sim.pause()")
        r = A.evaluate(SETUP, "29")
        erk = A.evaluate("(id) => window.__lw.sim.partnerErkannt(window.__lw.sim.einsatz(id))", r["id"])
        check(any(x["art"] == "fw" for x in erk) and any(x["art"] == "pol" for x in erk), f"VU: Feuerwehr und Polizei erkannt {[x['art'] for x in erk]}")
        A.evaluate("([id, rtw]) => window.__lw.sim.alarmiere(id, [rtw])", [r["id"], r["rtw"]])
        z = A.evaluate(ZUSTAND, r["id"])
        check(not z["br"], "kein Bereitstellungsraum beim VU")
        A.evaluate("(id) => { window.__lw.sim.partnerAnfordern(id, 'fw'); }", r["id"])
        nr = A.evaluate("(id) => window.__lw.sim.einsatz(id).nummer", r["id"])
        A.locator(".el-row:has(.el-typ.rd)").first.click(); A.wait_for_timeout(800)
        A.screenshot(path=f"{S}/partner_vu.png")
        n_unterwegs = A.locator(".partner-b.unterwegs").count()
        n_noetig = A.locator(".partner-b.noetig").count()
        check(n_unterwegs >= 1, f"Feuerwehr-Knopf zeigt „unterwegs“ ({n_unterwegs})")
        check(n_noetig >= 1, f"Polizei-Knopf leuchtet ({n_noetig})")
        A.evaluate("() => window.__lw.sim.start()")
        fw_nach = None; rd_weg = None
        for i in range(120):
            A.wait_for_timeout(1000)
            z = A.evaluate(ZUSTAND, r["id"])
            rd_da = any(x.split(":")[1] in ("ausruecken", "anfahrt", "vorOrt", "warteKH", "suche") for x in z["rd"])
            if not rd_da and rd_weg is None: rd_weg = A.evaluate("() => window.__lw.sim.state.zeit")
            if rd_weg and not any("vorOrt" in x for x in z["p"]) and fw_nach is None:
                fw_nach = (A.evaluate("() => window.__lw.sim.state.zeit") - rd_weg) / 60000
                break
        print("   ", z)
        check(fw_nach is not None and 8 <= fw_nach <= 23, f"Feuerwehr bleibt nach dem RD noch {fw_nach} min")
        # Daten und erzeugte Einsätze
        n = A.evaluate("() => { const l = window.__lw.store.list('stations'); return ['Feuerwehr','Polizei','Bergrettung','Wasserrettung'].map(t => l.filter(s => s.typ === t).length); }")
        print("    Stützpunkte FW/Pol/Berg/Wasser:", n)
        check(n[0] > 400 and n[1] > 150 and n[2] > 10 and n[3] >= 1, "Partner-Dienststellen in den Standarddaten")
        A.evaluate("() => window.__lw.sim.pause()")
        r = A.evaluate("""async () => { const s = window.__lw.sim; const z = {}; let n = 0; for (let i = 0; i < 80; i++) { const e = await s.generiere(); if (!e) continue; n++; for (const x of s.partnerBedarf(e)) z[x.art + (x.blockiert ? '!' : '')] = (z[x.art + (x.blockiert ? '!' : '')] || 0) + 1; } return [n, z]; }""")
        print("    Bedarf in", r)
        check(r[0] > 50, "Einsätze erzeugt")
        # Karte: Ebenen vorhanden
        n = A.evaluate("() => { const m = window.__lw.map; return m ? ['lw-partner-fz','lw-partner-stations'].filter(l => m.getLayer(l)).length : -1 }")
        print("    Kartenebenen:", n)
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:10]))
