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
        # eben erst alarmiert: die Besatzung fragt zurück (Plausibilität), LEO bestätigt
        check("verstehe ich richtig" in a.lower() and "lage" not in a.lower(), f"Information über das eben alarmierte NEF → Rückfrage „{a}“")
        a = A.evaluate("(id) => T.sage(id, 'Hier LEO, ja richtig, kommen')", gid)
        check("verstanden" in a.lower() or "alles klar" in a.lower(), f"nach „ja richtig“ → „{a}“")
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

        # 5) Notarzt-Regeln (Paul 12.11.): nicht ROT → warten ohne Grenze; ROT → 10 min bzw. Fahrzeit ins KH, dann Rendezvous
        r = A.evaluate("""([e, r, n]) => { const s = T.s(); const E = s.einsatz(e); const fz = s.state.fahrzeuge[r]; const nef = s.state.fahrzeuge[n];
            const l = E.wahr.lage; l.patienten = [{ ...l.patienten[0], sichtung: 'gelb' }]; E.naAngekuendigt = { um: s.state.zeit, wer: 'NEF' };
            nef.phase = 'anfahrt'; nef.phaseEnde = s.state.zeit + 60 * 60000; E.naWarten = null; E.rendezvous = null;
            const t = s.state.zeit;
            return [s.wartetAufNotarzt(fz, E, t), s.wartetAufNotarzt(fz, E, t + 30 * 60000), s.wartetAufNotarzt(fz, E, t + 90 * 60000), !!E.rendezvous]; }""", [x["e"], x["rtw"], x["nef"]])
        check(r[0] and r[1] and r[2] and not r[3], f"nicht ROT, NA nötig: RTW wartet ohne Zeitgrenze, kein Rendezvous ({r})")

        def rotFall(richtung):
            return A.evaluate("""async ([e, r, n, richtung]) => { const s = T.s(); const E = s.einsatz(e); const fz = s.state.fahrzeuge[r]; const nef = s.state.fahrzeuge[n];
                const l = E.wahr.lage; l.patienten = [{ ...l.patienten[0], sichtung: 'rot' }];
                E.naWarten = null; E.rendezvous = null; E.naStorniert = false;
                fz.lat = E.wahr.lat; fz.lon = E.wahr.lon; fz.phase = 'vorOrt';
                const kh = s.khFuerTransport(E);
                // NEF: in Richtung KH (auf halbem Weg) bzw. in der Gegenrichtung (20 km hinter dem Einsatzort)
                const dl = kh.lat - E.wahr.lat, dn = kh.lon - E.wahr.lon, len = Math.hypot(dl, dn) || 1;
                if (richtung === 'mit') { nef.lat = E.wahr.lat + dl * 0.6 + 0.01; nef.lon = E.wahr.lon + dn * 0.6; }
                else { nef.lat = E.wahr.lat - dl / len * 0.18; nef.lon = E.wahr.lon - dn / len * 0.27; }
                nef.phase = 'anfahrt'; nef.phaseEnde = s.state.zeit + 40 * 60000; nef.einsatzId = E.id;
                const t = s.state.zeit;
                const grenze = Math.max(10 * 60000, s.khFahrzeit(fz, E));
                const w1 = s.wartetAufNotarzt(fz, E, t);
                const w2 = s.wartetAufNotarzt(fz, E, t + grenze - 60000);
                const w3 = s.wartetAufNotarzt(fz, E, t + grenze + 60000);
                await T.warte(() => E.naWarten?.rv !== 'rechnet', 10000);
                const w4 = s.wartetAufNotarzt(fz, E, t + grenze + 2 * 60000);
                return { w1, w2, w3, w4, rv: E.rendezvous && E.rendezvous.punkt.label, grenzeMin: Math.round(grenze / 60000), kh: kh.name, log: E.protokoll.slice(-2).map((p) => p.text) }; }""", [x["e"], x["rtw"], x["nef"], richtung])
        r = rotFall("mit")
        print("   ", r)
        check(r["w1"] and r["w2"] and r["w3"] and r["grenzeMin"] >= 10, f"ROT: wartet bis zur Grenze ({r['grenzeMin']} min = max(10, Fahrzeit ins {r['kh']}))")
        check(bool(r["rv"]) and not r["w4"], f"ROT, NEF Richtung KH: Rendezvous {r['rv']} – RTW fährt los")
        r = rotFall("gegen")
        print("   ", r)
        check(not r["rv"] and r["w4"], "ROT, NEF in der Gegenrichtung: kein Rendezvous, RTW wartet weiter")
        r = A.evaluate("""([e, r, n]) => { const s = T.s(); const E = s.einsatz(e); const fz = s.state.fahrzeuge[r]; const nef = s.state.fahrzeuge[n];
            nef.einsatzId = null; E.fahrzeuge = E.fahrzeuge.filter((id) => id !== n); E.naWarten = null; E.rendezvous = null; E.naAngekuendigt = null; E.naKeiner = null;
            const t = s.state.zeit;
            const a = s.wartetAufNotarzt(fz, E, t), b = s.wartetAufNotarzt(fz, E, t + 40 * 60000);
            E.naKeiner = { seit: t + 40 * 60000 };
            const c = s.wartetAufNotarzt(fz, E, t + 45 * 60000), d = s.wartetAufNotarzt(fz, E, t + 51 * 60000);
            return [a, b, c, d]; }""", [x["e"], x["rtw"], x["nef"]])
        check(r[0] and r[1] and r[2] and not r[3], f"NA nötig, keiner alarmiert: wartet; nach „kein NA in Reichweite“ noch 10 min, dann los ({r})")
        a = A.evaluate("(t) => window.__lw.funkAbsicht.absichtErkennen(t, {})", "Hier LEO, kein Notarzt in Reichweite, kommen")
        check(a.get("thema") == "keinNa", f"„kein Notarzt in Reichweite“ verstanden ({a})")

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

        # 8) Storno-Knopf (Diensthandy): Fahrzeug sofort frei, KEIN Funkspruch; Storno über Funk → „Storno verstanden“
        z = A.evaluate("() => T.einsatz(false)")
        r = A.evaluate("""async (z) => { const s = T.s(); const vor = s.state.funkGespraeche.filter((g) => g.fzId === z.rtw).length;
            s.storno(z.rtw); await T.schlaf(3000);
            const fz = s.state.fahrzeuge[z.rtw];
            return [s.state.funkGespraeche.filter((g) => g.fzId === z.rtw).length - vor, fz.einsatzId, fz.status, fz.phase]; }""", z)
        check(r[0] == 0 and not r[1] and r[2] in ("freiFunk", "freiWache"), f"Storno-Knopf: frei ({r[2]}, {r[3]}) ohne Funkspruch ({r[0]} Gespräche)")
        z = A.evaluate("() => T.einsatz(false)")
        A.evaluate("(z) => { const s = T.s(); s.state.fahrzeuge[z.rtw].alarmiertUm = s.state.zeit - 10 * 60000; }", z)
        gid2 = A.evaluate("(id) => T.rufe(id)", z["rtw"])
        a = A.evaluate("(id) => T.sage(id, 'Hier LEO, Storno für euch, kommen')", gid2)
        check("storno" in a.lower() and "verstanden" in a.lower(), f"Storno über Funk → „{a}“")
        # KTW zu früh: Dauer gesprochen
        r = A.evaluate("() => [5, 2, 37, 61, 354].map((m) => window.__lw.dauerGesprochen(m))")
        check(r == ["5 Minuten", "wenige Minuten", "35 Minuten", "1 Stunde", "6 Stunden"], f"Dauer gesprochen: {r}")
        # Abwechslung am Funk: verschiedene Fassungen, Inhalt bleibt
        r = A.evaluate("() => { const v = new Set(); for (let i = 0; i < 40; i++) v.add(window.__lw.abwandeln('bitte wiederholen', 'fz-genau-' + (i % 3), i / 40)); return [...v]; }")
        check(len(r) >= 2 and all("wiederhol" in x or "nochmal" in x for x in r), f"„bitte wiederholen“ in {len(r)} Fassungen: {r}")
        b.close()
        print("\n".join(logs[:8]))
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
