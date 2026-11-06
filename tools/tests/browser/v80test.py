# v0.80: Fälle mit Symptom und Dringlichkeit. Basis v0.79: Kinder nur in Häuser mit Kinderabteilung (sonst gekennzeichnetes Ausweich-Haus); Altersgruppen <1 / 1–17 / 18+. Basis v0.78: Zuweisung nach Symptom, Altersgruppe und Dringlichkeit
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8883", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
# Hilfsfunktion: Top-3 Häuser (offen) für Symptom/Dringlichkeit/Alter an Ort und Zeit
TOP = """([ort, sym, d, a, zeit]) => { const s = window.__lw.sim; s.state.zeit = zeit;
  const id = `avn:${sym}:${d}:${a}`;
  const v = s.khFuer({ lat: ort[0], lon: ort[1] }, id, d === 30, a !== 'e');
  return v.filter(x => !x.zu).slice(0, 3).map(x => x.h.id + ':' + x.eignung); }"""
KREMS = [48.4106, 15.6141]
STP = [48.2047, 15.6256]
def zeit(A, j, m, t, h):
    return A.evaluate(f"() => new Date({j}, {m - 1}, {t}, {h}, 0).getTime()")
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8883/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); window.__lw.sim.settings.khGrundAktiv = false; window.__lw.sim.state.khBelegung = {}; }")
        # --- alle eingebauten Fälle: Symptom und Dringlichkeit hinterlegt, Prüfung ohne Fehler
        r = A.evaluate("""() => { const f = window.__lw.faelle.alleFaelle(); const ohne = []; let n = 0;
          for (const x of f) for (const v of x.varianten) { n++; if (v.transport !== false && (!v.symptom || !v.dringlichkeit)) ohne.push(x.id + '/' + v.id); }
          const bef = window.__lw.faellePruefen().filter(b => /Symptom|Dringlichkeit|Buchung/.test(b.fehler));
          return { n, ohne, bef }; }""")
        print("   ", r["n"], r["ohne"][:5], r["bef"][:5])
        check(r["n"] >= 69 and not r["ohne"], "alle Varianten haben Symptom und Dringlichkeit")
        check(not r["bef"], "Prüfung der Fälle ohne Symptom-Fehler")
        # --- Engine: Fall bestimmt die Zuweisung
        z = A.evaluate("""async () => { const s = window.__lw.sim; const out = {};
          for (const [f, v] of [['sturz_huefte', 'A'], ['rast_lkw_brust', 'A'], ['hyperventilation', 'A'], ['reiten_sturz', 'B'], ['insult', 'B']]) {
            const e = await s.generiereFall(f, v); if (e.anruf) e.anruf.status = 'beendet';
            out[f + '/' + v] = s.verdacht(e); }
          return out; }""")
        print("   ", z)
        check(z.get("sturz_huefte/A", "").startswith("avn:schenkelhalsfraktur:20:"), "Sturz Hüfte → Schenkelhalsfraktur, dringend")
        check(z.get("rast_lkw_brust/A", "").startswith("avn:st_hebungsinfarkt_oder_stemi_aequivalent:30:"), "STEMI → Schockraum/rot")
        check(z.get("hyperventilation/A", "").startswith("avn:angstsymptomatik:10:"), "Hyperventilation → stabil")
        check(z.get("reiten_sturz/B", "").startswith("avn:schaedelhirntrauma:30:"), "Sturz vom Pferd B → SHT")
        # Verschlechterung auf rot stuft hoch
        h = A.evaluate("""async () => { const s = window.__lw.sim; const e = await s.generiereFall('insult', 'B'); if (e.anruf) e.anruf.status = 'beendet';
          const p0 = e.wahr.lage.patienten[0]; p0.sichtung = 'rot'; e.wahr.verdacht = undefined; return s.verdacht(e); }""")
        print("    Insult B nach Verschlechterung:", h)
        check(h.startswith("avn:schlaganfall_apss_4_9:30:"), "Verschlechterung auf rot → Schockraum")
        # --- Überstellungen ins Zentrum nach Öffnungszeiten (Krems: Herzkatheter Mo–Fr 7–15, Mi 24 h)
        r = A.evaluate("""() => { const st = window.__lw.store; const khs = st.list('hospitals');
          const mitte = { lat: 48.41, lon: 15.61 }; const t = (d, h) => new Date(2026, 9, d, h, 0).getTime();
          const lauf = (zeit) => { const out = []; for (let i = 0; i < 1500; i++) { const r = window.__lw.sek.sekZufall({ mitte, khs, jetzt: zeit });
            if (r && /PCI|Koronarangiografie/.test(r[0].grund) && r[0].sofort) out.push(r[0].von.khId + '>' + r[0].nach.khId + '|' + r[0].grund); } return out; };
          return { doNacht: lauf(t(29, 20)), miNacht: lauf(t(28, 20)) }; }""")
        dn, mn = r["doNacht"], r["miNacht"]
        print("    Do 20 Uhr:", len(dn), dn[:4]); print("    Mi 20 Uhr:", len(mn), mn[:4])
        check(dn and not any(x.split("|")[0].endswith(">kh002") for x in dn), "Donnerstag 20 Uhr: keine Akut-PCI nach Krems")
        check(any(x.startswith("kh002>") and "nicht verfügbar" in x for x in dn), "Donnerstag 20 Uhr: Krems überstellt (Herzkatheter nicht verfügbar)")
        check(not any(x.startswith("kh002>") for x in mn), "Mittwoch 20 Uhr: Krems macht es selbst")
        # --- Krankentransporte: Lage, Sauerstoff, Isolation passen zum Grund
        r = A.evaluate("""async () => { const s = window.__lw.sim; const out = [];
          for (let i = 0; i < 250; i++) { const k = await s.generiereKt('online'); if (k) out.push({ g: k.d.grund, l: k.d.lage, o: k.d.sauerstoff, inf: k.d.infektion, info: k.d.patient.info, nach: k.d.nach?.bereich, sofort: k.d.sofort }); }
          return out; }""")
        naht = [x for x in r if any(w in x["g"].lower() for w in ["nahtentfernung", "gipskontrolle", "katarakt"])]
        deku = [x for x in r if "dekubitus" in x["g"].lower()]
        print("   ", len(r), "KT; Naht/Gips:", [x["l"] for x in naht][:8], "Dekubitus:", [x["l"] for x in deku][:5])
        check(len(r) > 150, "Krankentransporte erzeugt")
        check(all(x["l"] in ("gehend", "sitzend") for x in naht), "Nahtentfernung/Gips/Katarakt: gehfähig oder sitzend")
        check(all(x["l"] == "liegend" for x in deku), "Dekubitus: liegend")
        inf = [x for x in r if x["inf"]]
        check(all("Isolation" in x["info"] for x in inf), f"Isolation mit Keim im Hinweis ({len(inf)})")
        o2 = [x for x in r if x["o"]]
        check(all("Sauerstoff" in x["info"] for x in o2), f"Sauerstoff mit Menge im Hinweis ({len(o2)})")
        ein = [x for x in r if x["sofort"]]
        print("    Einweisungen:", [(x["g"][:25], x["nach"]) for x in ein][:6])
        check(all(not ("Gallenkolik" in x["g"]) or x["nach"] in ("CHI", "ZNA") for x in ein), "Einweisung: Ziel passt zum Grund")
        # --- neue Fälle: jeder Ausgang erzeugt einen Einsatz mit Code und Zuweisung (auch mit dem Test-Abfrageschema)
        for name in ["eingebaut", "test"]:
            if name == "test":
                A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
            r = A.evaluate("""async () => { const s = window.__lw.sim; const neu = ['herzrasen','herzinsuffizienz','copd','pseudokrupp','bauchschmerzen','nierenkolik','harnverhalt','wespenstich','nasenbluten','bluterbrechen','verbrennung_kueche','hitze','unterkuehlung','fieberkrampf','fieber_kind','az_verschlechterung','schwindel','kopfschmerz_ploetzlich','spielplatz_sturz','arbeitsunfall_hand','rauferei','messerstich','tabletten','auge_veraetzung','bluthochdruck'];
              const out = []; const f = window.__lw.faelle.alleFaelle();
              for (const id of neu) { const F = f.find(x => x.id === id); if (!F) { out.push(id + ': fehlt'); continue; }
                for (const v of F.varianten) { let e; try { e = await s.generiereFall(id, v.id); } catch (x) { out.push(id + '/' + v.id + ': ' + x.message); continue; }
                  if (!e) { out.push(id + '/' + v.id + ': kein Einsatz'); continue; }
                  if (e.anruf) e.anruf.status = 'beendet';
                  const z = s.verdacht(e); if (!z.startsWith('avn:' + v.symptom + ':')) out.push(id + '/' + v.id + ': Zuweisung ' + z);
                  if (!e.wahr.code) out.push(id + '/' + v.id + ': kein Code'); } }
              return out; }""")
            print("   ", name, r[:10])
            check(not r, f"neue Fälle spielbar ({name})")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
finally:
    srv.terminate()
print("FEHLER gesamt:", fails) if fails else print("alles OK")
