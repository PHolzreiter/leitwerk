# Funk-Umbau: Szenarien direkt an der Simulation (ohne Oberfläche)
# - Information über Dritte („das NEF ist abbestellt“) → nur „verstanden“, NEF bleibt alarmiert
# - Unverständliches → „bitte wiederholen“, keine Lagemeldung
# - „NEF ist zu euch alarmiert“ → RTW wartet auf den Notarzt
# - RTW fährt nicht ohne Notarzt los, solange er noch kommt
# - Lagemeldung kommt nur einmal, auf Nachfrage „Lage unverändert“
# Aufruf: python3 funkszenariotest.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8922", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

HILFE = r"""
window.T = {
  s: () => window.__lw.sim,
  schlaf: (ms) => new Promise((r) => setTimeout(r, ms)),
  async warte(f, ms = 15000) { const bis = Date.now() + ms; while (Date.now() < bis) { try { const x = f(); if (x) return x; } catch (e) {} await T.schlaf(100); } return null; },
  g: (id) => T.s().state.funkGespraeche.find((x) => x.id === id),
  text: (id) => (T.g(id)?.sprueche ?? []).map((x) => `${x.von}: ${x.text}`),
  letzte: (id) => { const sp = T.g(id)?.sprueche ?? []; return sp[sp.length - 1]; },
  // Einsatz mit RTW (+ NEF) anlegen und alarmieren
  async einsatz(mitNef) {
    const s = T.s();
    const e = await s.generiere("kritisch");
    s.anrufAnnehmen(e.id); s.anrufBeenden(e.id);
    s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse } });
    const fz = Object.values(s.state.fahrzeuge).filter((f) => f.phase === "frei" && !f.pilot && !f.funkrufname.startsWith("77/8"));
    const nah = (f) => Math.hypot(f.lat - e.wahr.lat, f.lon - e.wahr.lon);
    const rtw = fz.filter((f) => f.kategorie === "RTW").sort((a, b) => nah(a) - nah(b))[0];
    const nef = fz.filter((f) => f.kategorie === "NEF").sort((a, b) => nah(a) - nah(b))[0];
    const ids = mitNef ? [rtw.id, nef.id] : [rtw.id];
    const r = s.alarmiere(e.id, ids);
    return { e: e.id, rtw: rtw.id, nef: nef.id, rtwName: s.rufname(rtw), nefName: s.rufname(nef), alarm: r };
  },
  // LEO ruft ein Fahrzeug und wartet, bis es sich meldet
  async rufe(fzId) {
    const s = T.s();
    await T.warte(() => !s.funkKanalSpricht(null), 20000);
    const id = s.funkRufen(fzId);
    await T.warte(() => T.g(id)?.status === "offen" && !T.g(id).ausstehend && T.letzte(id)?.von !== "LEO", 20000);
    return id;
  },
  // LEO sagt etwas, wartet auf die Antwort der Besatzung
  async sage(id, text) {
    const s = T.s();
    await T.warte(() => !s.funkKanalSpricht(T.g(id).kanal ?? null), 20000);
    const n = T.g(id).sprueche.length;
    s.funkSenden(id, text);
    await T.warte(() => { const g = T.g(id); return g.sprueche.length > n + 1 && !g.ausstehend; }, 20000);
    await T.schlaf(300);
    return T.g(id).sprueche.slice(n + 1).map((x) => x.text).join(" | ");
  },
};
"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); logs = []
        A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8922/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => { await window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json()); }")
        A.evaluate(HILFE)
        A.evaluate("() => { const s = T.s(); s.funkFestNach = 600; s.settings.rate = 0; s.start(); s.setTempo(1); }")
        A.wait_for_timeout(500)
        x = A.evaluate("() => T.einsatz(true)")
        print("   ", json.dumps(x, ensure_ascii=False))
        check(not x["alarm"] or all("vorgemerkt" in h or "Hinweis" in h for h in x["alarm"]), f"RTW und NEF alarmiert {x['alarm']}")

        # 1) Info über Dritte: NEF abbestellt → nur verstanden, kein Storno für den RTW
        gid = A.evaluate("(id) => T.rufe(id)", x["rtw"])
        print("   ", A.evaluate("(id) => T.text(id)", gid))
        a = A.evaluate("([id, n]) => T.sage(id, `Hier LEO, das ${n} ist abbestellt, kommen`)", [gid, x["nefName"]])
        check("verstanden" in a.lower() and "lage" not in a.lower(), f"Information über das NEF → „{a}“")
        st = A.evaluate("([e, r]) => { const s = T.s(); return [s.state.fahrzeuge[r].einsatzId === e, s.state.fahrzeuge[r].phase]; }", [x["e"], x["rtw"]])
        check(st[0], f"RTW bleibt am Einsatz ({st[1]})")

        # 1b) gesprochen (über funkLeo wie die Sprechtaste): Rufname des NEF mitten im Satz – die Antwort kommt vom RTW
        r = A.evaluate("""async ([id, n, nef]) => { const s = T.s(); await T.warte(() => !s.funkKanalSpricht(null), 20000);
            const vor = T.g(id).sprueche.length;
            const ziel = s.funkLeo(`Hier LEO, ${n} ist ab Wache zu euch alarmiert, Eintreffzeit 12 Minuten, kommen`, null, true);
            await T.warte(() => T.g(id).sprueche.length > vor + 1 && !T.g(id).ausstehend, 20000);
            const nefRuf = s.state.funkGespraeche.some((g) => g.fzId === nef && g.status !== 'ende');
            return [ziel === id, nefRuf, T.g(id).sprueche.slice(vor).map((x) => `${x.von}: ${x.text}`)]; }""", [gid, x["nefName"], x["nef"]])
        print("   ", r[2])
        check(r[0] and not r[1], "Spruch mit erwähntem NEF bleibt im Gespräch mit dem RTW (NEF wird nicht gerufen)")

        # 2) Unverständliches → bitte wiederholen
        a = A.evaluate("(id) => T.sage(id, 'moneda')", gid)
        check("wiederhol" in a.lower() or "nochmal" in a.lower(), f"Unverständlich → „{a}“")
        check("lage" not in a.lower() and "patient" not in a.lower(), "keine Lagemeldung auf Unverständliches")

        # 3) Frage nach dem Patienten vor Eintreffen → keine ausgedachte Lage
        a = A.evaluate("(id) => T.sage(id, 'Hier LEO, wann seid ihr vor Ort, kommen')", gid)
        check(any(w in a.lower() for w in ["minute", "anfahrt", "vor ort", "unterwegs"]), f"Eintreffzeit → „{a}“")

        # 4) NEF zu euch alarmiert → naAngekuendigt
        a = A.evaluate("([id, n]) => T.sage(id, `Hier LEO, das ${n} ist zu euch alarmiert, Eintreffzeit 15 Minuten, kommen`)", [gid, x["nefName"]])
        ang = A.evaluate("(e) => !!T.s().einsatz(e).naAngekuendigt", x["e"])
        check("verstanden" in a.lower() and ang, f"NA angekündigt → „{a}“, gemerkt: {ang}")
        A.evaluate("(id) => T.sage(id, 'verstanden, Ende')", gid)

        # 5) RTW vor Ort, NEF noch unterwegs: RTW wartet, fährt nicht los
        r = A.evaluate("""([e, r, n]) => { const s = T.s(); const E = s.einsatz(e); const fz = s.state.fahrzeuge[r]; const nef = s.state.fahrzeuge[n];
            nef.phase = 'anfahrt'; nef.phaseEnde = s.state.zeit + 6 * 60000;
            const t = s.state.zeit; const w1 = s.wartetAufNotarzt(fz, E, t);
            const w2 = s.wartetAufNotarzt(fz, E, t + 3 * 60000);
            const w3 = s.wartetAufNotarzt(fz, E, t + 26 * 60000);
            return [w1, w2, w3, E.protokoll.slice(-3).map((p) => p.text)]; }""", [x["e"], x["rtw"], x["nef"]])
        check(r[0] and r[1], f"RTW wartet auf das NEF ({r[3]})")
        check(not r[2], "nach 25 Minuten fährt der RTW ohne Notarzt los")

        # 6) roter Patient: Notarzt nötig, Storno des NEF nicht ohne Rückfrage
        r = A.evaluate("""(e) => { const s = T.s(); const E = s.einsatz(e); const l = E.wahr.lage; if (l) l.patienten = [{ nr: 1, geschlecht: 'm', alter: 60, bw: 'nein', at: 'abnorm', sichtung: 'rot' }];
            return [s.naBedarfFall ? s.naBedarfFall(E) : null, s.bedarfVon(E).na]; }""", x["e"])
        check(r[1] > 0 or r[0], f"roter Patient → Notarzt nötig ({r})")

        # 7) Lagemeldung nur einmal; Nachfrage → „Lage unverändert“
        y = A.evaluate("() => T.einsatz(false)")
        r = A.evaluate("""async (y) => { const s = T.s(); const E = s.einsatz(y.e); const fz = s.state.fahrzeuge[y.rtw];
            s.fzRuft(fz, E, 'lage', 'Patient wach, Verdacht auf Hüftfraktur, Transport ins Krankenhaus');
            s.fzRuft(fz, E, 'lage', 'Patient wach, Verdacht auf Hüftfraktur, Transport ins Krankenhaus');
            await T.schlaf(300);
            const rufe = s.state.funkGespraeche.filter((g) => g.fzId === y.rtw && g.status !== 'ende' && g.anliegen?.art === 'lage');
            return [rufe.length, rufe.map((g) => g.anliegen.text), E.protokoll.some((p) => /schon gemeldet/.test(p.text))]; }""", y)
        check(r[0] == 1 and r[1][0].count("Hüftfraktur") == 1 and r[2], f"gleiche Lagemeldung nur einmal ({r})")

        # 8) Storno-Knopf: LEO ruft, sagt den Storno durch, die Besatzung bestätigt „Storno verstanden“
        z = A.evaluate("() => T.einsatz(false)")
        r = A.evaluate("""async (z) => { const s = T.s(); await T.warte(() => !s.funkKanalSpricht(null), 20000);
            s.storno(z.rtw);
            const g = await T.warte(() => s.state.funkGespraeche.find((g) => g.fzId === z.rtw && g.sprueche.some((x) => /Storno verstanden/.test(x.text))), 30000);
            const alle = s.state.funkGespraeche.filter((g) => g.fzId === z.rtw).map((g) => g.sprueche.map((x) => `${x.von}: ${x.text}`));
            return [!!g, alle]; }""", z)
        print("   ", r[1])
        check(r[0], "Storno-Knopf: Besatzung bestätigt „Storno verstanden“ über Funk")
        b.close()
        print("\n".join(logs[:8]))
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
