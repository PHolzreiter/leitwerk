# Funk-Umbau: Pilot (Spieler fliegt den Hubschrauber) – niemand spricht für ihn, der RTW ruft ihn selbst,
# während er sendet funkt kein Computer-Fahrzeug dazwischen.
# Aufruf: python3 funkpilottest.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8923", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
HILFE = r"""
window.T = {
  s: () => window.__lw.sim,
  schlaf: (ms) => new Promise((r) => setTimeout(r, ms)),
  async warte(f, ms = 15000) { const bis = Date.now() + ms; while (Date.now() < bis) { try { const x = f(); if (x) return x; } catch (e) {} await T.schlaf(100); } return null; },
  async einsatz() {
    const s = T.s();
    const e = await s.generiere("kritisch");
    s.anrufAnnehmen(e.id); s.anrufBeenden(e.id);
    s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse } });
    const fz = Object.values(s.state.fahrzeuge).filter((f) => f.phase === "frei" && !f.pilot && !f.funkrufname.startsWith("77/8"));
    const nah = (f) => Math.hypot(f.lat - e.wahr.lat, f.lon - e.wahr.lon);
    const rtw = fz.filter((f) => f.kategorie === "RTW").sort((a, b) => nah(a) - nah(b))[0];
    const heli = fz.filter((f) => f.kategorie === "NAH").sort((a, b) => nah(a) - nah(b))[0];
    return { e: e.id, rtw: rtw.id, heli: heli.id, rtwName: s.rufname(rtw), heliName: s.rufname(heli) };
  },
  mensch: (heli) => T.s().state.funkGespraeche.filter((g) => g.mensch && g.fzId === heli && g.status !== "ende"),
  sprueche: (g) => g.sprueche.map((x) => `${x.von}: ${x.text}`),
};
"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); logs = []
        A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8923/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => { await window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json()); }")
        A.evaluate(HILFE)
        A.evaluate("() => { const s = T.s(); s.funkFestNach = 600; s.settings.rate = 0; s.start(); s.setTempo(1); }")
        x = A.evaluate("() => T.einsatz()")
        print("   ", json.dumps(x, ensure_ascii=False))
        r = A.evaluate("(x) => { const s = T.s(); s.pilotUebernehmen(x.heli); return [s.alarmiere(x.e, [x.rtw, x.heli]), !!s.state.fahrzeuge[x.heli].pilot]; }", x)
        check(not r[0] and r[1], f"Spieler fliegt {x['heliName']}, alarmiert mit {x['rtwName']}")

        # 1) Programm darf nicht für den Piloten sprechen
        r = A.evaluate("""(x) => { const s = T.s(); const E = s.einsatz(x.e); const vor = s.state.funkGespraeche.length;
            s.fzRuft(s.state.fahrzeuge[x.heli], E, 'lage', 'Patient wach, kommen'); return [s.state.funkGespraeche.length - vor, E.protokoll.slice(-1)[0].text]; }""", x)
        check(r[0] == 0 and "Pilot" in r[1], f"kein Computer-Funk im Namen des Piloten ({r[1]})")

        # 2) Pilot sendet: kein Computer-Fahrzeug ruft dazwischen
        r = A.evaluate("""async (x) => { const s = T.s(); const E = s.einsatz(x.e);
            await T.warte(() => !s.funkKanalSpricht(null), 20000);
            const p = s.funkMensch(true, 'leo', undefined, 'test-1');
            s.fzRuft(s.state.fahrzeuge[x.rtw], E, 'info', 'sind auf Anfahrt, kommen');
            await T.schlaf(3000);
            const rufe = s.state.funkGespraeche.filter((g) => g.fzId === x.rtw && g.status !== 'ende' && g.sprueche.length > 0).length;
            const vorher = !!s.state.funkSendet;
            s.funkMensch(false, 'leo', undefined, 'test-alt');   // fremde Sendung: darf nicht frei geben
            const nochDa = !!s.state.funkSendet;
            s.funkMensch(false, 'leo', undefined, 'test-1');
            return [p, rufe, vorher, nochDa, !!s.state.funkSendet]; }""", x)
        check(r[0] and not r[0]["wartet"], f"Pilot bekommt den Kanal ({r[0]})")
        check(r[1] == 0, f"RTW ruft nicht, solange der Pilot sendet ({r[1]} Rufe)")
        check(r[2] and r[3] and not r[4], "Loslassen einer alten Sendung gibt den Kanal nicht frei; die eigene schon")

        # 3) RTW storniert den Pilot-NAH: ruft ihn, wartet auf seine Antwort, dann erst der Storno
        A.evaluate("(x) => { const s = T.s(); const E = s.einsatz(x.e); s.naStornoFunk(E, s.state.fahrzeuge[x.rtw], s.state.fahrzeuge[x.heli]); }", x)
        g = A.evaluate("async (x) => { await T.warte(() => T.mensch(x.heli).some((g) => g.sprueche.length), 20000); const g = T.mensch(x.heli)[0]; return g && T.sprueche(g); }", x)
        check(bool(g) and "kommen" in g[0] and x["rtwName"] in g[0], f"RTW ruft den Piloten: {g}")
        st = A.evaluate("(x) => T.s().state.fahrzeuge[x.heli].einsatzId === x.e", x)
        check(st, "noch kein Storno, bevor der Pilot antwortet")
        r = A.evaluate("""async (x) => { const s = T.s(); await T.warte(() => !s.funkKanalSpricht(null), 20000);
            s.funkMensch(true, 'leo', undefined, 'p2'); s.funkMensch(false, 'leo', undefined, 'p2');
            s.funkMenschText(null, `Hier ${x.heliName}, kommen`);
            await T.warte(() => { const g = T.mensch(x.heli)[0] ?? s.state.funkGespraeche.find((g) => g.mensch && g.fzId === x.heli); return g && g.sprueche.some((sp) => /Storno/.test(sp.text)); }, 20000);
            await T.schlaf(500);
            const g = s.state.funkGespraeche.find((g) => g.mensch && g.fzId === x.heli);
            return [T.sprueche(g), s.state.fahrzeuge[x.heli].einsatzId === x.e, s.einsatz(x.e).naStorniert]; }""", x)
        print("   ", r[0])
        check(any("Storno" in t for t in r[0]), "RTW sagt dem Piloten den Storno")
        check(not r[1] and r[2], f"Hubschrauber nach der Antwort storniert ({r[1:]})")
        check(not any(t.startswith(x["heliName"] + ":") and "Storno verstanden" in t for t in r[0]), "der Computer quittiert nicht im Namen des Piloten")
        # 4) Rollenwechsel: Funk der Fahrzeuge formuliert immer ein Disponent, nie der Pilot
        r = A.evaluate("""(x) => { const s = T.s(); const ich = s.wer(); const altMode = s.mode;
            s.mode = 'host'; s.onlineSpieler = () => [{ pid: ich.pid, name: ich.name }, { pid: 'dispo-2', name: 'Anna' }];
            const f = s.funkErzeuger(s.einsatz(x.e)); const d = s.disponentenOnline().map((b) => b.name);
            s.mode = altMode; s.onlineSpieler = null; return [f.name, d]; }""", x)
        check(r[0] == "Anna" and r[1] == ["Anna"], f"Funk formuliert der Disponent, nicht der Pilot ({r})")
        # 5) Storno-Knopf für den Pilot-Hubschrauber: wie Diensthandy – sofort frei, kein Funkspruch
        z = A.evaluate("() => T.einsatz()")
        r = A.evaluate("""async ([z, heli]) => { const s = T.s(); s.alarmiere(z.e, [heli]);
            const vor = s.state.funkGespraeche.filter((g) => g.fzId === heli && g.status !== 'ende').length;
            s.storno(heli); await T.schlaf(2000);
            return [s.state.funkGespraeche.filter((g) => g.fzId === heli && g.status !== 'ende').length - vor, s.state.fahrzeuge[heli].einsatzId]; }""", [z, x["heli"]])
        check(r[0] <= 0 and not r[1], f"Storno-Knopf Pilot-Hubschrauber: frei, kein Funkspruch ({r})")
        b.close(); print("\n".join(logs[:8]))
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
