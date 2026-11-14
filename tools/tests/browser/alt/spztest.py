# Besondere Anrufe und Wissensstufen (ohne KI)
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8886", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
SPIEL = """async ([fall, variante, saetze, wunsch]) => { const L = window.__lw; const s = L.sim;
  for (let i = 0; i < 40; i++) {
    const e = await s.generiereFall(fall, variante); if (!e) continue;
    const a = e.wahr.abfrage.anrufer;
    if (wunsch && (a.typ || '') !== wunsch) { s.call('schliesse', e.id).catch(()=>{}); continue; }
    s.anrufAnnehmen(e.id);
    await L.eroeffnen(e);
    const out = e.anruf.gespraech.filter(m => m.von !== 'system').map(m => [m.von === 'anrufer' ? 'A' : 'L', m.text]);
    for (const t of saetze) { const n = e.anruf.gespraech.length; await L.fragen(e, t); out.push(['L', t]); for (const m of e.anruf.gespraech.slice(n)) if (m.von === 'anrufer') out.push(['A', m.text]); }
    return { typ: a.typ, rolle: a.rolle, emotion: a.emotion, status: e.anruf.status, out, wahr: e.wahr.abfrage.antworten, lage: e.wahr.lage && e.wahr.lage.patienten && e.wahr.lage.patienten[0], wissen: e.wahr.abfrage.szenario && e.wahr.abfrage.szenario.wissen };
  } return null; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8886/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
        r = A.evaluate(SPIEL, ["hosentasche", "A", ["Hallo? Hören Sie mich?", "Wo sind Sie?"], ""])
        print("--- Hosentasche:", r["out"])
        check(all(t.startswith("(") for w, t in r["out"] if w == "A"), "Hosentasche: nur Rascheln")
        r = A.evaluate(SPIEL, ["scherzanruf", "A", ["Wo genau ist das?", "Wie alt ist er?", "Das ist ein Missbrauch des Notrufs und strafbar."], ""])
        print("--- Scherz:", r["out"], r["status"])
        check(r["status"] == "beendet" and any(w in r["out"][-1][1].lower() for w in ["tschuldigung", "sorry"]), "Scherzanruf: nach der Belehrung kleinlaut aufgelegt")
        r = A.evaluate(SPIEL, ["fieber_ehemann", "A", [], ""])
        check(r["emotion"] in ("aufgeregt", "panisch"), f"Fieber-Ehefrau aufgeregt ({r['emotion']})")
        r = A.evaluate(SPIEL, ["betrunken_bewusstlos", "A", [], ""])
        print("    betrunken: gemeldet bw", r["wahr"].get("bw"), "Lage", json.dumps(r["lage"], ensure_ascii=False)[:160])
        check(r["wahr"].get("bw") == "nein", "„bewusstlos“ gemeldet")
        r = A.evaluate(SPIEL, ["taxi_fahrgast", "A", ["Wer spricht da bitte, wer sind Sie?"], ""])
        print("--- Taxi:", r["rolle"], r["out"][-1])
        check("taxi" in r["out"][-1][1].lower(), "Taxifahrer stellt sich vor")
        r = A.evaluate(SPIEL, ["aerztefunk_einweisung", "A", [], ""])
        print("--- Ärztefunk:", r["rolle"], r["out"][:2])
        check("funkdienst" in r["rolle"].lower(), "Ärztefunkdienst als Anrufer")
        # Wissensstufe: Taxi weiß Herzleiden nicht
        t = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const e = await s.generiereFall('taxi_fahrgast', 'A'); const k = L.kontext(e);
            const f = L.schemaFkt.fragenImAblauf(L.store.schema, e.wahr.abfrage.kapitel, e.wahr.abfrage.antworten).map(x => x.frage).find(x => /herz/i.test(x.id)); return f ? [f.id, L.antwortOhneKi(k, f), L.systemPrompt(k).split('\\n').filter(z => /weißt du NICHT|Nur ungefähr/.test(z))] : null; }""")
        print("    Taxi Wissen:", t)
        check(t is not None and "weiß ich nicht" in t[1].lower() and len(t[2]) >= 1, "Wissensstufe: weiß es nicht (feste Antwort und Fallakte)")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
