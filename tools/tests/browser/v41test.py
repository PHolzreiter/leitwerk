import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8821", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1700, "height": 1000}); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8821/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; s.funkFestNach = 1500; }")
        # 1) Rufnamen
        r = A.evaluate("""() => { const s = window.__lw.sim; const f = (n) => { const x = Object.values(s.state.fahrzeuge).find(v => v.funkrufname === n); return x ? s.rufname(x) : '?'; };
          return { a: f('75/001'), gfoehl: f('75/051'), spitz: f('75/071'), c2: f('99/002'), c33: f('99/033'), oeamtc: f('99/902'), nefTulln: f('69/099'), bel: f('75/030'), oebb: f('EL ÖBB Tulln'), kirchberg: f('69/061') }; }""")
        print("   ", r)
        check(r == {"a": "75/001", "gfoehl": "RTW Gföhl", "spitz": "RTW Spitz", "c2": "C2", "c33": "C33", "oeamtc": "NEF ÖAMTC 2", "nefTulln": "NEF Tulln", "bel": "BEL Krems", "oebb": "ÖBB Einsatzleiter Tulln", "kirchberg": "69/061"}, "Rufnamen nach Pauls Regeln")
        # 2) Prüfen
        r = A.evaluate("""() => { const P = window.__lw.funk.funkPruefen; const fest = 'Hier 75/001 mit einer Lagemeldung, Mann 67, Thoraxtrauma, benötigen Notarzt, Frage: ist der C2 verfügbar, kommen';
          return { gut: P(fest, 'Pat. männlich 67 mit Thoraxtrauma, wir bräuchten einen Notarzt. Frage, ist der C2 verfügbar', {}),
            ohneNa: P(fest, 'Pat. männlich 67 mit Thoraxtrauma', {}),
            name: P(fest, 'Herr Huber, 67, Thoraxtrauma, benötigen Notarzt, ist C2 verfügbar', { namen: ['Huber'] }),
            wert: P(fest, 'Pat. 67, Thoraxtrauma, Sättigung 88 Prozent, benötigen Notarzt, C2 verfügbar?', {}),
            wertGefragt: P('Hier 75/001, Sättigung 88, kommen', 'Sättigung liegt bei 88 %', { frage: 'wie ist die Sättigung', art: 'frage' }),
            erfunden: P('Hier 75/001 mit einer Lagemeldung, Frau 80, gestürzt, kreislaufstabil, kommen', 'Pat. 80 gestürzt, kreislaufstabil, bitte noch einen Notarzt', {}),
            zahl: P('Hier 75/001, Patient übernommen, Transport ins UK Krems, Eintreffen in ca. 12 Minuten, kommen', 'Pat. übernommen, fahren ins UK Krems, sind in circa zwanzig Minuten dort', {}),
            zahlWort: P('Hier 75/001, Patient übernommen, Transport ins UK Krems, Eintreffen in ca. 12 Minuten, kommen', 'Pat. übernommen, Transport UK Krems, Eintreffen in zwölf Minuten', {}) }; }""")
        print("   ", r)
        check(not r["gut"], "richtige Formulierung geht durch")
        check(any("fehlt" in x for x in r["ohneNa"]), "fehlende Nachforderung erkannt")
        check(any("Name" in x for x in r["name"]), "Patientenname wird erkannt")
        check(any("Messwerte" in x for x in r["wert"]) and not r["wertGefragt"], "Messwerte nur auf Nachfrage")
        check(any("erfunden" in x for x in r["erfunden"]), "erfundene Anforderung erkannt")
        check(any("Zahl 12" in x for x in r["zahl"]) and not r["zahlWort"], "Zahlen müssen stimmen (auch ausgeschrieben)")
        r = A.evaluate("""() => { const F = window.__lw.funk; const z = F.zerlegen('Hier 75/001 mit einer Lagemeldung, Mann 67, Thoraxtrauma, kommen'); return [z, F.zusammensetzen(z.kopf, 'Pat. männlich 67 mit Thoraxtrauma', z.schluss), F.zusammensetzen('Hier NEF Tulln', 'Rendezvous verstanden', 'Ende')]; }""")
        print("   ", r)
        check(r[1] == "Hier 75/001 mit einer Lagemeldung. Pat. männlich 67 mit Thoraxtrauma, kommen." and r[2] == "Hier NEF Tulln, Rendezvous verstanden, Ende", "Rahmen „Hier …, kommen“ wie in Pauls Beispielen")
        # 3) Kanal: nur ein Gespräch, Reihenfolge, Ende
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.state.laeuft = true; const w = (ms) => new Promise(r => setTimeout(r, ms)); const frei = async () => { for (let i = 0; i < 100 && s.funkKanalSpricht(null); i++) await w(150); };
          const fz = Object.values(s.state.fahrzeuge).filter(f => f.kategorie === 'RTW' && f.phase === 'frei').slice(0, 2);
          s.fzRuft(fz[0], null, 'info', 'Zwischenmeldung: Versorgung dauert noch an, voraussichtlich 10 Minuten');
          s.fzRuft(fz[1], null, 'nachforderung', 'benötigen Notarzt');
          await w(1200);
          const G = () => s.state.funkGespraeche; const st1 = G().filter(g => g.fzId === fz[0].id || g.fzId === fz[1].id).map(g => [s.state.fahrzeuge[g.fzId].funkrufname, g.status]);
          const rufer = G().find(g => g.status === 'ruft');
          // LEO will den anderen rufen, während einer ruft: vorgemerkt
          rufer.sprichtBis = Date.now() + 2500; // der Ruf wird gerade gesprochen
          let fehler = ''; try { s.funkAntworten(G().find(g => g.status === 'wartet' && (g.fzId === fz[0].id || g.fzId === fz[1].id)).id); } catch (e) { fehler = e.message; }
          await frei(); s.funkAntworten(rufer.id); await w(2200); await frei();
          const nachAntwort = rufer.sprueche.map(x => x.text);
          s.funkSenden(rufer.id, 'Hier LEO, verstanden'); await w(1200); await frei(); await w(900);
          const st2 = rufer.status; const anderer = G().find(g => (g.fzId === fz[0].id || g.fzId === fz[1].id) && g !== rufer);
          return { st1, ersterWarDringend: s.state.fahrzeuge[rufer.fzId].id === fz[1].id, fehler, nachAntwort, st2, anderer: anderer.status }; }""")
        print("   ", r)
        check(sorted(x[1] for x in r["st1"]) == ["ruft", "wartet"], "nur einer ruft, der andere wartet")
        check(r["ersterWarDringend"], "Dringendes (Nachforderung) zuerst")
        check("Funk belegt" in r["fehler"], "nichts wird unterbrochen (Antworten auf den Wartenden geht nicht)")
        check(len(r["nachAntwort"]) >= 3 and "kommen" in r["nachAntwort"][-1], "nach „Hier LEO, kommen“ kommt die Meldung")
        check(r["st2"] == "ende" and r["anderer"] == "ruft", "„verstanden“ beendet – dann ruft der Nächste")
        # 4) keine Antwort: Kanal frei, nach 30 s wieder rufen (dann 1, 3, 6 … Minuten)
        r = A.evaluate("""async () => { const s = window.__lw.sim; const w = (ms) => new Promise(r => setTimeout(r, ms));
          const g = s.state.funkGespraeche.find(x => x.status === 'ruft'); g.echtLetzt -= 13000; g.sprichtBis = 0; await w(900);
          return [g.status, g.rufe, Math.round((g.echtNaechster - Date.now()) / 1000)]; }""")
        print("   ", r)
        check(r[0] == "wartet" and r[1] == 1 and 27 <= r[2] <= 30, "keine Antwort: nach 30 s wieder rufen")
        # 5) LEO ruft, Fahrzeug meldet sich; 30 s Stille beendet
        r = A.evaluate("""async () => { const s = window.__lw.sim; const w = (ms) => new Promise(r => setTimeout(r, ms));
          const fz = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '75/051');
          for (const x of s.state.funkGespraeche) if (x.status !== 'ende') { x.status = 'ende'; x.ausstehend = null; }
          const id = s.funkRufen(fz.id); await w(5600); const g = s.state.funkGespraeche.find(x => x.id === id);
          const texte = g.sprueche.map(x => x.text); const st = g.status; g.echtLetzt -= 61000; g.sprichtBis = 0; await w(900); return { texte, st, danach: g.status }; }""")
        print("   ", r)
        check(r["texte"][0] == "RTW Gföhl von LEO, kommen" and ("RTW Gföhl" in r["texte"][1]) and r["st"] == "offen", "LEO ruft „RTW Gföhl“, Fahrzeug meldet sich")
        check(r["danach"] == "ende", "eine Minute Stille beendet das Gespräch")
        # 6) Telefon hat Vorrang
        r = A.evaluate("""async () => { const s = window.__lw.sim; const w = (ms) => new Promise(r => setTimeout(r, ms));
          for (const g of s.state.funkGespraeche) if (g.status !== 'ende') { g.status = 'ende'; g.ausstehend = null; }
          const e = await s.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; if (!s.state.einsaetze.includes(e)) s.state.einsaetze.push(e);
          const fz = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '75/002'); s.fzRuft(fz, null, 'info', 'Fahrzeug wieder einsatzbereit'); await w(1200);
          const g = s.state.funkGespraeche.find(x => x.fzId === fz.id && x.status !== 'ende'); const waehrend = [g.status, g.wegenTelefon];
          e.anruf.status = 'beendet'; await w(1200); s.state.einsaetze = s.state.einsaetze.filter(x => x !== e); return { waehrend, nachher: g.status }; }""")
        print("   ", r)
        check(r["waehrend"] == ["wartet", True] and r["nachher"] == "ruft", "während telefoniert wird, wartet der Funk – danach ruft er")
        # 7) KI formuliert, Programm prüft
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; L.kiPrefsSetzen({ funk: 'ki', aktiv: true });
          const g = s.state.funkGespraeche.find(x => x.status === 'ruft');
          let n = 0; L.kiTest.chat = async (msgs) => { n++; return n === 1 ? 'Hier 75/002, alles wieder bereit, wir brauchen aber noch einen Notarzt, kommen' : 'Fahrzeug wieder einsatzbereit'; };
          const a1 = await L.funk.funkSpruchErzeugen(g, { von: g.funkname, art: 'info', fest: 'Hier 75/002, Fahrzeug wieder einsatzbereit, kommen', bis: 0 });
          n = 0; L.kiTest.chat = async () => 'Sind wieder einsatzbereit';
          const a2 = await L.funk.funkSpruchErzeugen(g, { von: g.funkname, art: 'info', fest: 'Hier 75/002, Fahrzeug wieder einsatzbereit, kommen', bis: 0 });
          L.kiTest.chat = async () => 'Wir brauchen einen Notarzt';
          const a3 = await L.funk.funkSpruchErzeugen(g, { von: g.funkname, art: 'info', fest: 'Hier 75/002, Fahrzeug wieder einsatzbereit, kommen', bis: 0 });
          L.kiTest.chat = null; return { a1, a2, a3 }; }""")
        print("   ", r)
        check(r["a1"]["quelle"] == "ki" and r["a1"]["nachgebessert"] and "Notarzt" not in r["a1"]["text"], "erfundene Anforderung → neu erzeugt")
        check(r["a2"]["text"].lower() == "hier 75/002, sind wieder einsatzbereit, kommen", f"KI-Satz im Rahmen: {r['a2']['text']}")
        check(r["a3"]["quelle"] == "fest", "zweimal falsch → feste Meldung")
        # 8) Testlauf „Funk“: je Fall ein Durchlauf, KI formuliert, Programm prüft
        r = A.evaluate("""async () => { const L = window.__lw; let n = 0;
          L.kiTest.chat = async (msgs) => { n++; const u = msgs[msgs.length - 1].content; const m = u.match(/(?:INHALT[^:]*|dazuzuerfinden): (.*)/); return m ? m[1].replace(/benötigen/g, 'brauchen') : 'Sättigung kann ich nicht sagen, noch nicht gemessen'; };
          const auf = L.testlauf.auftraegeFuer(L.faelle.alleFaelle(false).slice(0, 3), 'alle', 1).map(x => ({ ...x, art: 'funk' }));
          const liste = await L.testlauf.testlaufAusfuehren(auf.slice(0, 4), { abbruch: { ja: false } });
          L.kiTest.chat = null; const dat = L.testlauf.testlaufDateien(liste, false);
          return { n, anzahl: liste.length, auff: liste.flatMap(d => d.auffaellig.map(a => a.grund)), probe: dat[1] ? dat[1][1].slice(0, 1500) : '' }; }""")
        print("   ", {k: v for k, v in r.items() if k != "probe"}); print(r["probe"])
        check(r["anzahl"] >= 3 and r["n"] >= 12, "Testlauf „Funk“ läuft durch")
        check(not [x for x in r["auff"] if "feste Meldung" in x or "fehlt" in x], "richtige KI-Sätze werden im Testlauf nicht beanstandet")
        # 9) Messwerte und Patientenname nie in der festen Lagemeldung
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e = await s.probeFall('fk_kleinkind', 'B'); s.state.einsaetze.push(e);
          const fz = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '75/001'); const t = s.funkProbe(e, fz).filter(a => !/Vitalwerte/.test(a.frage || '')).map(a => a.fest); const vital = s.funkProbe(e, fz).find(a => /Vitalwerte/.test(a.frage || '')).fest; s.state.einsaetze = s.state.einsaetze.filter(x => x !== e);
          return { t, vital, kern: e.wahr.lage.fall.kern, name: e.wahr.abfrage.szenario.patient.name }; }""")
        print("   ", r)
        check(not any("Sättigung" in x for x in r["t"]) and not any(r["name"].split()[-1] in x for x in r["t"]), "keine Messwerte und kein Patientenname in den Meldungen")
        check("Sättigung 90" in r["vital"], "auf Nachfrage nach den Vitalwerten: die Werte aus dem Fall")
        # 10) Antwort auf die Hubschrauber-Frage wird verstanden
        r = A.evaluate("""async () => { const s = window.__lw.sim; const w = (ms) => new Promise(r => setTimeout(r, ms));
          for (const g of s.state.funkGespraeche) if (g.status !== 'ende') { g.status = 'ende'; g.ausstehend = null; }
          const e = await s.probeFall('kreislaufstillstand', 'rea'); s.state.einsaetze.push(e); e.heliFrage = 'C2';
          const fz = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '75/051'); e.fahrzeuge.push(fz.id); fz.einsatzId = e.id; fz.phase = 'vorOrt';
          const id = s.funkRufen(fz.id); await w(5600); for (let i = 0; i < 100 && s.funkKanalSpricht(null); i++) await w(150); s.funkSenden(id, 'Hier LEO, C2 ist alarmiert und kommt, kommen'); await w(1200);
          const g = s.state.funkGespraeche.find(x => x.id === id); return { t: g.sprueche.map(x => x.text), offen: e.heliFrage }; }""")
        print("   ", r)
        check(any("warten auf C2" in x for x in r["t"]) and r["offen"] is None, "Antwort auf „Ist der C2 verfügbar?“ wird verstanden")
        check(logs == [], f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
