# Beta 82 (Paul 27.11.2026): Telefon-Klang – Leitung (Handy/Festnetz, Aussetzer verschlucken Wörter), Hintergrund je Ort,
# Wetter, Geräusche je Fall (echte Aufnahmen), Einstellung Aus/Dezent/Realistisch.
# Aufruf: python3 beta82test.py <arbeitsordner> <web-build>
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8983", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8983/?debug&seed=8983"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.rufhilfeAufnahme = 'selbst'; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)

        # 1) alle Aufnahmen da und abspielbar
        r = A.evaluate("""async () => { const T = window.__lw.telefonKlang; const ctx = new OfflineAudioContext(1, 22050, 22050); const kaputt = [];
            for (const d of T.dateien) { try { const ab = await (await fetch('/klang/' + d.datei)).arrayBuffer(); const b = await ctx.decodeAudioData(ab); if (b.duration < 0.5) kaputt.push(d.datei + ' kurz'); } catch (x) { kaputt.push(d.datei); } }
            return { n: T.dateien.length, kaputt, ohneHerkunft: T.dateien.filter(d => !d.urheber || !d.quelle || !d.lizenz).map(d => d.datei) }; }""")
        check(r["n"] >= 50 and not r["kaputt"], f"{r['n']} Aufnahmen laden ({r['kaputt'][:5]})")
        check(not r["ohneHerkunft"], "jede Aufnahme mit Urheber, Lizenz und Quelle")

        # 2) Pläne: jeder Fall bekommt Umgebung, alle genannten Geräusche gibt es als Datei
        r = A.evaluate("""async () => { const L = window.__lw, s = L.sim, T = L.telefonKlang; const tags = new Set(T.dateien.map(d => d.tag)); const fehlt = new Set(); const orte = {}; let n = 0, festnetz = 0, handyDraussen = 0, draussen = 0;
            const faelle = L.faelle.alleFaelle().filter(f => f.gruppe !== 'rufhilfe').slice(0, 140);
            for (const f of faelle) { let e; try { e = await s.generiereFall(f.id); } catch (x) { continue; } if (!e || !e.wahr.abfrage) continue; n++;
              const pl = T.plan(e, { lage: 'regen', wind: 50 });
              for (const t of [...pl.umgebung, ...pl.wetter]) if (!tags.has(t)) fehlt.add(t);
              for (const [t] of pl.ereignisse) if (!tags.has(t) && !tags.has(t + '_w')) fehlt.add(t);
              const o = e.wahr.abfrage.szenario.ortArt; orte[o] = (orte[o] || 0) + 1;
              if (pl.leitung.art === 'festnetz') festnetz++; if (pl.draussen) { draussen++; if (pl.leitung.art === 'handy') handyDraussen++; }
              if (!pl.umgebung.length) fehlt.add('keine Umgebung: ' + o);
              e.anruf.status = 'verpasst'; e.zustand = 'abgeschlossen'; }
            s.state.einsaetze = []; return { n, fehlt: [...fehlt], orte, festnetz, draussen, handyDraussen }; }""")
        print("   ", r)
        check(r["n"] > 50 and not r["fehlt"], f"alle Geräusche der Pläne vorhanden ({r['fehlt']})")
        check(r["draussen"] == r["handyDraussen"] and 0 < r["festnetz"] < r["n"], f"draußen immer Handy, sonst gemischt ({r['festnetz']} Festnetz von {r['n']})")

        # 3) Leitung: Handy mit schlechtem Netz verschluckt, Festnetz nie
        r = A.evaluate("""() => { const T = window.__lw.telefonKlang; const rate = 24000; const ton = () => { const f = new Float32Array(rate * 20); for (let i = 0; i < f.length; i++) f[i] = Math.sin(i / rate * 2 * Math.PI * 440) * 0.5; return f; };
            const h = new T.Filter(rate, { art: 'handy', netz: 0.35, seed: 7 }); h.verarbeiten(ton()); const fe = new T.Filter(rate, { art: 'festnetz', netz: 1, seed: 7 }); const y = fe.verarbeiten(ton());
            const gut = new T.Filter(rate, { art: 'handy', netz: 0.95, seed: 7 }); gut.verarbeiten(ton());
            let max = 0; for (const v of y) max = Math.max(max, Math.abs(v));
            return { schlecht: h.luecken.length, festnetz: fe.luecken.length, gut: gut.luecken.length, max,
              v1: T.verschlucken('Wir sind in der Hauptstraße 12 in Krems.', [0.5]), v2: T.verschlucken('Ja.', []) }; }""")
        print("   ", r)
        check(r["schlecht"] >= 2 and r["festnetz"] == 0 and r["gut"] <= r["schlecht"], f"Aussetzer: schlechtes Netz {r['schlecht']}, gutes {r['gut']}, Festnetz {r['festnetz']}")
        check("…" in r["v1"] and r["v1"].count("…") == 1 and r["v2"] == "Ja." and r["max"] <= 1, f"Mitschrift mit „…“: {r['v1']}")

        # 4) Hintergrund läuft (Realistisch), Ereignisse kommen, Aus = nichts
        r = A.evaluate("""async () => { const L = window.__lw, s = L.sim, T = L.telefonKlang; L.live.setLivePrefs({ hintergrund: 'realistisch', klang: true });
            const e = await s.generiereFall('sturz_leiter'); T.starten(e); const j = T.jetzt();
            await new Promise(r => setTimeout(r, 11000)); const log = [...T.log]; T.stoppen();
            L.live.setLivePrefs({ hintergrund: 'aus' }); T.starten(e); const aus = T.jetzt(); L.live.setLivePrefs({ hintergrund: 'dezent' });
            return { laeuft: !!j, umgebung: j && j.plan.umgebung, ereignisse: j && j.plan.ereignisse, log, aus: !!aus, stufe: T.stufe() }; }""")
        print("   ", r)
        check(r["laeuft"] and r["umgebung"], f"Hintergrund läuft ({r['umgebung']})")
        check(len(r["log"]) >= 1, f"Geräusche kommen ({r['log']})")
        check(not r["aus"] and r["stufe"] == "dezent", "Aus: kein Hintergrund; Standard Dezent")
        for l in logs[:8]: print("    ", l[:300])
        check(not [l for l in logs if l.startswith("PAGEERROR")], "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
