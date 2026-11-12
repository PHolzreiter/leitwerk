# Beta 48 (Paul 12.11.2026): Kompetenz je Fall (RS/NFS/NKV/NKI/NA), ACN wie ein NEF mit NKV/NKI, Nachforderung nach
# Kompetenz (vor Ort + auf Zufahrt), Frage nach NEF oder RTW-C, Storno nur wenn die Kompetenz auch ohne NA reicht,
# „reicht nicht immer“ → Notarzt nachfordern, Hubschrauber: immer warten
# Aufruf: python3 kompetenztest.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8948", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

HILFE = r"""
window.T = {
  s: () => window.__lw.sim,
  schlaf: (ms) => new Promise((r) => setTimeout(r, ms)),
  // Einsatz aus einem Katalog-Fall, RTW mit gewählter Besatzung vor Ort, weitere Fahrzeuge nach Wunsch (vorOrt/anfahrt)
  async lage(fall, v, rtwQuali, weitere) {
    const s = T.s();
    const e = await s.generiereFall(fall, v); e.anruf.status = 'beendet';
    s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
    const lf = e.wahr.lage.fall; lf.reichtNicht = false;
    const frei = Object.values(s.state.fahrzeuge).filter((f) => s.verfuegbar(f) && !f.pilot);
    const d = (f) => Math.hypot(f.lat - e.wahr.lat, f.lon - e.wahr.lon);
    const nimm = (kat) => frei.filter((f) => f.kategorie === kat && !f.ersatzFuer).sort((a, b) => d(a) - d(b)).find((f) => !e.fahrzeuge.includes(f.id));
    const rtw = nimm('RTW');
    rtw.besetzung = rtwQuali.map((q, i) => ({ rolle: i ? 'Transportführer' : 'Fahrer', quali: q }));
    const ids = [rtw.id]; const extra = {};
    for (const [kat, phase, quali] of weitere) { const f = nimm(kat); if (!f) continue; if (quali) f.besetzung = [{ rolle: kat, quali }]; ids.push(f.id); extra[kat] = { id: f.id, phase }; }
    s.alarmiere(e.id, ids);
    for (const id of ids) { const f = s.state.fahrzeuge[id]; f.einsatzId = e.id; if (!e.fahrzeuge.includes(id)) e.fahrzeuge.push(id); }
    rtw.phase = 'vorOrt'; rtw.lat = e.wahr.lat; rtw.lon = e.wahr.lon;
    for (const k of Object.keys(extra)) { const f = s.state.fahrzeuge[extra[k].id]; f.phase = extra[k].phase; if (f.phase === 'anfahrt') f.phaseEnde = s.state.zeit + 15 * 60000; }
    e.wahr.lage.aufgedeckt = true; e.naEntscheidUm = s.state.zeit;
    return { e: e.id, rtw: rtw.id, extra, braucht: s.brauchtJetzt(e) };
  },
};
"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); logs = []
        A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8948/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => { await window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json()); }")
        A.evaluate(HILFE)
        A.evaluate("() => { const s = T.s(); const d = new Date(s.state.zeit); d.setHours(10, 0, 0, 0); s.state.zeit = d.getTime(); s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.rate = 0; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")

        # ---- 0) Katalog: jede Variante hat eine Kompetenz
        r = A.evaluate("""() => { const F = window.__lw.faelle.alleFaelle(true); const v = F.flatMap((f) => f.varianten.map((x) => [f.id + '/' + x.id, x.braucht]));
            const z = {}; for (const [, k] of v) z[k] = (z[k] || 0) + 1; return { ohne: v.filter(([, k]) => !k).map(([id]) => id), z, n: v.length }; }""")
        print("    Kompetenzen im Katalog:", r["z"], "von", r["n"])
        check(not r["ohne"] and set(r["z"]) <= {"RS", "NFS", "NKV", "NKI", "NA"}, f"alle {r['n']} Varianten haben „braucht“ ({r['ohne'][:5]})")
        # ---- 1) Kompetenz der Fahrzeuge
        r = A.evaluate("""() => { const s = T.s(); const fz = Object.values(s.state.fahrzeuge); const k = (typ) => { const f = fz.find((x) => x.rmTyp === typ); return f ? s.kompetenzVon(f) : null; };
            return { NEF: k('NEF'), NAH: k('NAH'), ACN: k('ACN'), BEL: k('BEL'), KTW: k('KTW') }; }""")
        check(r["NEF"] == "NA" and r["NAH"] == "NA" and r["ACN"] in ("NKV", "NKI") and r["BEL"] is None, f"Kompetenz der Fahrzeuge {r}")

        # ---- 2) NKV reicht, RS-RTW vor Ort: Notarzt nachfordern – außer eine ACN ist schon auf Zufahrt
        x = A.evaluate("() => T.lage('hypoglykaemie', 'A', ['RS', 'RS'], [])")
        r = A.evaluate("(x) => { const s = T.s(); return s.fehlendeKraefte(s.einsatz(x.e)); }", x)
        check(x["braucht"] == "NKV" and r["na"] == 1, f"Unterzucker (NKV), nur RS vor Ort → Notarzt nachfordern ({x['braucht']}, {r})")
        x = A.evaluate("() => T.lage('hypoglykaemie', 'A', ['RS', 'RS'], [['ACN', 'anfahrt', 'NFS-NKV']])")
        r = A.evaluate("(x) => { const s = T.s(); return s.fehlendeKraefte(s.einsatz(x.e)); }", x)
        check(r["na"] == 0, f"… ACN (NKV) schon auf Zufahrt → keine Nachforderung ({r})")
        x = A.evaluate("() => T.lage('hypoglykaemie', 'A', ['RS', 'NFS-NKV'], [])")
        r = A.evaluate("(x) => { const s = T.s(); return [s.fehlendeKraefte(s.einsatz(x.e)), s.naBedarfFall(s.einsatz(x.e))]; }", x)
        check(r[0]["na"] == 0 and not r[1], f"… NKV im RTW → kein Notarzt ({r})")
        # ---- 3) nur NFS nötig, RS-RTW: Frage nach NEF oder RTW-C
        x = A.evaluate("() => T.lage('asthma', 'A', ['RS', 'RS'], [])")
        r = A.evaluate("(x) => { const s = T.s(); const E = s.einsatz(x.e); return [s.fehlendeKraefte(E), window.__lw.sim.state && 1]; }", x)
        check(x["braucht"] == "NFS" and r[0].get("nfs") == 1 and r[0]["na"] == 0, f"Asthma (NFS), nur RS → Frage nach NEF oder RTW-C ({r[0]})")
        lm = A.evaluate("""async (x) => { const s = T.s(); const E = s.einsatz(x.e); const fz = s.state.fahrzeuge[x.rtw];
            E.lageGeplant = { um: s.state.zeit, fzId: fz.id, angefordert: false, erstes: true }; s.lageMeldungJetzt(E);
            const g = (s.state.funkGespraeche || []).find((g) => g.einsatzId === E.id && g.anliegen); return [g && g.anliegen.text, (E.nachforderungen || []).map((n) => n.art)]; }""", x)
        print("    Lagemeldung:", lm)
        check(lm[0] and "NEF oder RTW-C" in lm[0] and "NFS" in lm[1], "Lagemeldung fragt nach NEF oder RTW-C, Nachforderung NFS")
        # ---- 4) Storno: NKV nötig, nur RS vor Ort, NEF kommt → bleibt; mit ACN auf Zufahrt → NEF storniert
        x = A.evaluate("() => T.lage('hypoglykaemie', 'A', ['RS', 'RS'], [['NEF', 'anfahrt', null]])")
        r = A.evaluate("""(x) => { const s = T.s(); const E = s.einsatz(x.e); const n = (s.state.funkGespraeche || []).length; s.naStornoWennUnnoetig(E, s.state.fahrzeuge[x.rtw]);
            return (s.state.funkGespraeche || []).length - n; }""", x)
        check(r == 0, f"NKV nötig, nur RS: NEF wird nicht storniert ({r} Funk)")
        x = A.evaluate("() => T.lage('hypoglykaemie', 'A', ['RS', 'RS'], [['NEF', 'anfahrt', null], ['ACN', 'anfahrt', 'NFS-NKI']])")
        r = A.evaluate("""(x) => { const s = T.s(); const E = s.einsatz(x.e); const n = (s.state.funkGespraeche || []).length; s.naStornoWennUnnoetig(E, s.state.fahrzeuge[x.rtw]);
            return (s.state.funkGespraeche || []).length - n; }""", x)
        check(r >= 1, f"… mit ACN (NKI) auf Zufahrt: NEF wird storniert ({r} Funk)")
        # ---- 5) „reicht nicht immer“: NKV vor Ort, nach ein paar Minuten Notarzt nachfordern
        x = A.evaluate("() => T.lage('sturz_leiter', 'B', ['RS', 'NFS-NKV'], [])")
        r = A.evaluate("""(x) => { const s = T.s(); const E = s.einsatz(x.e); const lf = E.wahr.lage.fall; lf.reichtNicht = true; lf.reichtNichtUm = null;
            const t = s.state.zeit; s.reichtNichtPruefen(E, t); const um = lf.reichtNichtUm; const vor = s.brauchtJetzt(E);
            s.state.zeit = um + 1000; s.reichtNichtPruefen(E, s.state.zeit); const nach = s.brauchtJetzt(E);
            return { um: um && Math.round((um - t) / 60000), vor, nach, nf: (E.nachforderungen || []).map((n) => n.art), log: E.protokoll.slice(-2).map((p) => p.text) }; }""", x)
        print("   ", r)
        check(r["vor"] == "NKV" and r["nach"] == "NA" and "NA" in r["nf"] and 5 <= (r["um"] or 0) <= 10, "Schmerztherapie reicht nicht → nach 5–10 min Notarzt nachgefordert")
        # ---- 6) Hubschrauber kommt: immer warten (auch nach 2 Stunden)
        x = A.evaluate("() => T.lage('hypoglykaemie', 'A', ['RS', 'RS'], [['NAH', 'anfahrt', null]])")
        r = A.evaluate("""(x) => { const s = T.s(); const E = s.einsatz(x.e); const fz = s.state.fahrzeuge[x.rtw]; const t = s.state.zeit;
            return [s.wartetAufNotarzt(fz, E, t), s.wartetAufNotarzt(fz, E, t + 120 * 60000)]; }""", x)
        check(r == [True, True], f"Hubschrauber auf Zufahrt: RTW wartet immer ({r})")
        # ---- 7) ACN da und NKV reicht: kein Warten
        x = A.evaluate("() => T.lage('hypoglykaemie', 'A', ['RS', 'RS'], [['ACN', 'vorOrt', 'NFS-NKV']])")
        r = A.evaluate("""(x) => { const s = T.s(); const E = s.einsatz(x.e); return s.wartetAufNotarzt(s.state.fahrzeuge[x.rtw], E, s.state.zeit); }""", x)
        check(r is False, "ACN (NKV) beim Patienten, NKV reicht: RTW wartet nicht")
        # ---- 8) Antwort „kein NEF oder RTW-C verfügbar“ wird verstanden
        a = A.evaluate("(t) => window.__lw.funkAbsicht.absichtErkennen(t, {})", "Hier LEO, kein NEF oder RTW-C verfügbar, kommen")
        check(a.get("thema") == "keinNa", f"„kein NEF oder RTW-C verfügbar“ verstanden ({a})")
        print("\n".join(logs[:5])); check(not logs, "keine Fehler auf der Seite")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
