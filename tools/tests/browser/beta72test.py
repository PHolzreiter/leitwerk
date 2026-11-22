# Beta 72 (Tickets 14 und 15, Paul 22.11.2026):
# - NEF-Ausrückzeit nachts 1–5, tagsüber 0,5–3 Minuten (alter Standard wird umgestellt); holt das NEF den Notarzt
#   im Krankenhaus ab, gehört das Abholen zur Ausrückzeit („zum BO“ erst mit Arzt, spätestens nach der Ausrückzeit)
# - Funk in der Phase „ausrücken“: „noch auf der Dienststelle“ bzw. „holen noch den Notarzt ab“, nicht „auf Anfahrt“
# - Themen nach der echten Verteilung (eCall ≈ 1 %, Anforderungen durch Ärzte/Pflege häufig), derselbe Fall nicht
#   unter den letzten 6 Einsätzen (der gleiche Code darf)
# Aufruf: python3 beta72test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8972", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8972/?debug&seed=8972"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.khGrundAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; s.setWetter('klar'); s.state.zeit = new Date(2026, 10, 22, 23, 10).getTime(); }")

        # 1) alter Standard wird umgestellt, eigene Werte bleiben
        r = A.evaluate("""() => { const st = window.__lw.store; const alt = st.data.einstellungen; const cache = st.settingsCache;
            const a = JSON.parse(JSON.stringify(st.settings.ausrueck));
            st.data.einstellungen = { ...(alt ?? {}), stufenStand: 67, ausrueck: { ...a, nefTag: [20, 240], nefNacht: [90, 780] } }; st.settingsCache = null;
            const neu = st.settings.ausrueck;
            st.data.einstellungen = { ...(alt ?? {}), stufenStand: 67, ausrueck: { ...a, nefTag: [20, 240], nefNacht: [100, 700] } }; st.settingsCache = null;
            const eigen = st.settings.ausrueck;
            st.data.einstellungen = alt; st.settingsCache = cache;
            return { tag: neu.nefTag, nacht: neu.nefNacht, eigenTag: eigen.nefTag, eigenNacht: eigen.nefNacht }; }""")
        check(r["tag"] == [30, 180] and r["nacht"] == [60, 300], f"alter NEF-Standard → tags 30–180 s, nachts 60–300 s ({r['tag']}, {r['nacht']})")
        check(r["eigenNacht"] == [100, 700] and r["eigenTag"] == [30, 180], f"eigener Wert bleibt, alter Standard daneben wird umgestellt ({r['eigenTag']}, {r['eigenNacht']})")

        # 2) Ausrückzeiten im Bereich
        r = A.evaluate("""() => { const s = window.__lw.sim; s.settings.ausrueck.nefTag = [30, 180]; s.settings.ausrueck.nefNacht = [60, 300];
            const nef = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'NEF' && !f.naAbholung && !f.ersatzFuer);
            const st = nef.status; nef.status = 'freiWache';
            const n = []; for (let i = 0; i < 300; i++) n.push(s.ausrueckSek(nef, false));
            s.state.zeit = new Date(2026, 10, 22, 12, 0).getTime();
            const t = []; for (let i = 0; i < 300; i++) t.push(s.ausrueckSek(nef, false));
            s.state.zeit = new Date(2026, 10, 22, 23, 10).getTime(); nef.status = st;
            return { nMin: Math.min(...n), nMax: Math.max(...n), tMin: Math.min(...t), tMax: Math.max(...t) }; }""")
        check(r["nMin"] >= 60 and r["nMax"] <= 300, f"NEF nachts 1–5 Minuten ({r['nMin']:.0f}–{r['nMax']:.0f} s)")
        check(r["tMin"] >= 30 and r["tMax"] <= 180, f"NEF tagsüber 0,5–3 Minuten ({r['tMin']:.0f}–{r['tMax']:.0f} s)")

        # 3) NEF holt den Notarzt ab: Frist = Ausrückzeit, Ausrücken kürzer um das Abholen
        r = A.evaluate("""async () => { const s = window.__lw.sim;
            const nef = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'NEF' && f.naAbholung && s.verfuegbar(f) && f.status === 'freiWache');
            if (!nef) return null;
            const e = await s.generiereFall('brustschmerz', 'A'); e.anruf.status = 'beendet';
            const lat = nef.heim.lat + 0.04, lon = nef.heim.lon + 0.03; e.wahr.lat = lat; e.wahr.lon = lon;
            s.aktualisiere(e.id, { adresse: { lat, lon, label: 'Testadresse' }, code: e.wahr.code });
            const t0 = s.state.zeit; s.alarmiere(e.id, [nef.id]);
            const u = s.naUmweg(nef);
            const g = { id: 9001, fzId: nef.id, funkname: nef.funkrufname, einsatzId: e.id, status: 'offen', seit: t0 };
            const antw = s.funkVerstehen(g, 'Wann seid ihr vor Ort?');
            const frei = s.funkVerstehen(g, 'Wann seid ihr wieder frei?');
            return { id: nef.id, name: nef.funkrufname, phase: nef.phase, aus: (nef.phaseEnde - t0) / 1000, frist: (nef.naFrist - t0) / 1000, umweg: u ? u.sek : null, antw, frei, eid: e.id }; }""")
        if r is None:
            check(False, "kein NEF mit Notarzt-Abholung frei")
        else:
            print("    ", r["name"], f"ausrücken {r['aus']:.0f} s, Frist {r['frist']:.0f} s, Abholen geschätzt {r['umweg'] and round(r['umweg'])} s")
            check(r["phase"] == "ausruecken" and 60 <= r["frist"] <= 300, f"Frist bis „zum BO“ = Ausrückzeit nachts ({r['frist']:.0f} s)")
            check(r["aus"] <= r["frist"] and (r["aus"] <= max(10, r["frist"] - (r["umweg"] or 0)) + 1), f"Ausrücken um das Abholen kürzer ({r['aus']:.0f} s)")
            check("holen noch den Notarzt" in r["antw"] and "auf Anfahrt" not in r["antw"] and "Eintreffen in ca." in r["antw"], f"Funk beim Ausrücken: {r['antw']}")
            check("auf Anfahrt" not in r["frei"], f"„wann frei“ beim Ausrücken: {r['frei']}")
            # 3b) bis „zum BO“ laufen lassen: Status 3 spätestens kurz nach der Frist (Fahrt zum Krankenhaus lässt sich nicht kürzen)
            A.evaluate("() => { const s = window.__lw.sim; s.state.tempo = 30; s.start(); }")
            t_end = time.time() + 90; zum = None; seen = []
            while time.time() < t_end:
                x = A.evaluate("(id) => { const s = window.__lw.sim, f = s.state.fahrzeuge[id]; return { st: f.status, ph: f.phase, dt: (s.state.zeit - f.alarmUm) / 1000, an: !!f.naAnBord }; }", r["id"])
                if not seen or seen[-1][:2] != (x["st"], x["ph"]): seen.append((x["st"], x["ph"], round(x["dt"])))
                if x["st"] == "zumBO": zum = x; break
                time.sleep(0.15)
            A.evaluate("() => { const s = window.__lw.sim; s.pause(); s.state.tempo = 1; s.state.zeit = new Date(2026, 10, 22, 23, 10).getTime(); }")
            print("     Ablauf:", seen)
            check(zum is not None and zum["an"], "NEF fährt mit Notarzt an Bord „zum BO“")
            erlaubt = max(r["frist"], (r["umweg"] or 0) - 90 + 15) + 25
            check(zum is not None and zum["dt"] <= erlaubt, f"„zum BO“ nach {zum and round(zum['dt'])} s (Ausrückzeit {r['frist']:.0f} s)")
            check(any(st == "alarmiert" for st, ph, _ in seen) or (zum and zum["dt"] <= r["frist"] + 25), "während des Abholens „alarmiert/quittiert“")

        # 4) Einstieg des Notarztes hält die Frist (mindestens 15 s), ohne Frist 1–2 Minuten
        r = A.evaluate("""() => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge).find(x => x.kategorie === 'NEF');
            const alt = f.naFrist; const out = {};
            f.naFrist = s.state.zeit + 30000; out.mit = s.naEinstiegMs(f);
            f.naFrist = s.state.zeit - 5000; out.vorbei = s.naEinstiegMs(f);
            f.naFrist = null; const o = []; for (let i = 0; i < 50; i++) o.push(s.naEinstiegMs(f)); out.ohneMin = Math.min(...o); out.ohneMax = Math.max(...o);
            f.naFrist = alt; return out; }""")
        check(15000 <= r["mit"] <= 30000 and r["vorbei"] == 15000, f"Einstieg mit Frist {r['mit']/1000:.0f} s, Frist vorbei {r['vorbei']/1000:.0f} s")
        check(r["ohneMin"] >= 60000 and r["ohneMax"] <= 120000, "Einstieg ohne Frist 1–2 Minuten")

        # 5) RTW beim Ausrücken: „noch auf der Dienststelle“; NEF wartet höchstens bis zum Ende seiner Ausrückzeit auf den RTW
        r = A.evaluate("""async () => { const s = window.__lw.sim;
            const e = await s.generiereFall('brustschmerz', 'A'); e.anruf.status = 'beendet';
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            const frei = Object.values(s.state.fahrzeuge).filter(f => s.verfuegbar(f) && f.status === 'freiWache');
            const nef = frei.find(f => f.kategorie === 'NEF' && !f.naAbholung && !f.ersatzFuer);
            const rtw = frei.find(f => f.kategorie === 'RTW' && !f.ueberzeitFuer && Math.hypot(f.heim.lat - nef.heim.lat, f.heim.lon - nef.heim.lon) < 0.3) ?? frei.find(f => f.kategorie === 'RTW');
            const t0 = s.state.zeit; const h = s.alarmiere(e.id, [rtw.id, nef.id]);
            if (rtw.phase !== 'ausruecken') return { antw: 'nicht alarmiert: ' + JSON.stringify(h) + ' ' + rtw.phase + ' ' + rtw.status, nef: 0 };
            const g = { id: 9002, fzId: rtw.id, funkname: rtw.funkrufname, einsatzId: e.id, status: 'offen', seit: t0 };
            const antw = s.funkVerstehen(g, 'Wann seid ihr vor Ort?');
            rtw.phaseEnde = t0 + 600000; nef.phaseEnde = t0 + 70000; s.nefNachRtw(e);
            return { antw, nef: (nef.phaseEnde - t0) / 1000 }; }""")
        check("noch auf der Dienststelle" in r["antw"] and "auf Anfahrt" not in r["antw"], f"RTW beim Ausrücken: {r['antw']}")
        check(r["nef"] <= 300, f"NEF nach dem RTW, aber höchstens 5 Minuten nachts ({r['nef']:.0f} s)")

        # 6) Verteilung und Wiederholungen (Fallkatalog, ganzer Tag)
        # (seit Beta 73 gilt die echte Verteilung für den Spieltyp „Realistisch“)
        r = A.evaluate("""() => { const L = window.__lw, s = L.sim; const out = []; s.settings.aufkommenStufe = 'realistisch';
            for (let h = 0; h < 24; h++) { s.state.zeit = new Date(2026, 9, 14, h, 30).getTime();
              for (let i = 0; i < 90; i++) { const k = s.fallAusKatalog(L.store.schema); if (k) out.push([k.fall.katalog.id, k.fall.kapitel, k.code.code]); } }
            const n = out.length, th = (k) => L.store.schema.kapitel[k] ? k : k;
            const anteil = (re) => out.filter(x => re.test(x[1])).length / n * 100;
            let wdh = 0, gleicherCode = 0;
            for (let i = 1; i < n; i++) { if (out.slice(Math.max(0, i - 6), i).some(x => x[0] === out[i][0])) wdh++; if (out[i - 1][2] === out[i][2]) gleicherCode++; }
            s.settings.aufkommenStufe = 'standard'; return { n, ecall: anteil(/^34$/), arzt: anteil(/^33$/), sturz: anteil(/^17$/), wdh, gleicherCode }; }""")
        print("    ", r)
        check(r["ecall"] < 2, f"eCall ≈ 1 % ({r['ecall']:.2f} %)")
        check(r["arzt"] > 12, f"Anforderung Arzt/Pflege häufig ({r['arzt']:.1f} %)")
        check(8 < r["sturz"] < 16, f"Sturz ≈ 11 % ({r['sturz']:.1f} %)")
        check(r["wdh"] == 0, f"kein Fall doppelt unter den letzten 6 ({r['wdh']} von {r['n']})")
        r = A.evaluate("""() => { const L = window.__lw; const ctx = { jahreszeit: 'herbst', stunde: 15, temp: 12, glatt: false };
            const ohne = new Set(L.faelle.alleFaelle().filter(f => f.thema !== 'sturz').map(f => f.id));
            const z = []; for (let i = 0; i < 40; i++) { const x = L.fallUndVariante(ctx, { harmlos: 35, mittel: 50, kritisch: 15 }, 'normal', Math.random, ohne); if (x) z.push(x.f.thema); }
            const alle = new Set(L.faelle.alleFaelle().map(f => f.id));
            const y = L.fallUndVariante(ctx, { harmlos: 35, mittel: 50, kritisch: 15 }, 'normal', Math.random, alle);
            return { nurSturz: z.every(t => t === 'sturz') && z.length > 30, trotzdem: !!y }; }""")
        check(r["nurSturz"], "ausgeschlossene Fälle werden nicht gezogen")
        check(r["trotzdem"], "sind alle ausgeschlossen, kommt trotzdem ein Fall")
        for l in logs[:5]: print("    ", l)
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
