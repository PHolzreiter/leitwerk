# Anleitungs-Bausteine ohne KI: Reanimation (Hinknien, Drücken, Lautsprecher, Erschöpfung, Ablöse), Blutung, Fremdkörper
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8884", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
J = "window.__lw.sim"
SPIEL = """async ([fall, variante, saetze, wunsch]) => { const L = window.__lw; const s = L.sim;
  for (let i = 0; i < 40; i++) {
    const e = await s.generiereFall(fall, variante); if (!e) continue;
    const a = e.wahr.abfrage.anrufer;
    if (wunsch && !wunsch.split('|').some(w => (a.typ || '') === w)) { s.call('schliesse', e.id).catch(()=>{}); continue; }
    s.anrufAnnehmen(e.id);
    const out = [];
    for (const t of saetze) { const n = e.anruf.gespraech.length; await L.fragen(e, t); out.push(['L', t]); for (const m of e.anruf.gespraech.slice(n)) if (m.von === 'anrufer') out.push(['A', m.text]); }
    return { typ: a.typ, dabei: a.persona && a.persona.dabei, out, gesagt: e.wahr.abfrage.rea, anl: e.wahr.abfrage.szenario && e.wahr.abfrage.szenario.anleitung };
  } return null; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_page(viewport={"width": 1600, "height": 900}); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8884/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
        rea = ["Knien Sie sich neben ihn und legen Sie die Hände auf die Mitte der Brust.", "Drücken Sie jetzt fest und schnell, zählen Sie laut mit.", "Sie schaffen das, drücken Sie einfach fest auf die Brust.", "Schalten Sie bitte das Handy auf Lautsprecher.", "Sehr gut, weiter so.", "Weiter drücken, die Rettung ist unterwegs.", "Gut, nicht aufhören.", "Sie machen das gut.", "Lassen Sie sich bitte ablösen, wenn jemand da ist."]
        for wunsch in ["passant", "partner"]:
            r = A.evaluate(SPIEL, ["kreislaufstillstand", "rea", rea, wunsch])
            if not r: print("   (kein Fall mit", wunsch, ")"); continue
            print(f"--- Reanimation, Anrufer {r['typ']} (dabei: {r['dabei']}), Abweichungen {r['anl']}")
            for w, t in r["out"]: print(f"   {w}: {t}")
            ans = [t for w, t in r["out"] if w == "A"]
            check("knie" in ans[0].lower() or "hände" in ans[0].lower() or "bett" in ans[0].lower(), "Hinknien: Hände auf die Brust")
            if wunsch == "passant": check("trau" in ans[1].lower(), "Passant traut sich zuerst nicht (angst)")
            check(any("lautsprecher" in a.lower() or "hörer" in a.lower() for a in ans), "Lautsprecher")
            check(any("nicht mehr" in a.lower() for a in ans), "Erschöpfung nach einer Weile")
            check(sum(1 for a in ans[2:] if sum(a.lower().count(z) for z in ["eins","zwei","drei","vier","fünf","sechs","sieben","acht","neun","zehn","elf","zwölf"]) >= 2) >= 4, "zählt mit")
        r = A.evaluate(SPIEL, ["schnittwunde", "A", ["Drücken Sie bitte ein sauberes Tuch fest auf die Wunde."], ""])
        print("--- Schnittwunde:", r["out"], r["anl"])
        check(any(w in r["out"][1][1].lower() for w in ["tuch", "t-shirt", "wunde"]), "Blutung: Tuch bzw. Ersatz")
        r = A.evaluate(SPIEL, ["fk_kleinkind", "A", ["Legen Sie das Kind bäuchlings über Ihren Unterarm, Kopf nach unten, und klopfen Sie kräftig zwischen die Schulterblätter.", "Klopfen Sie nochmal kräftig auf den Rücken."], ""])
        print("--- Fremdkörper:", r["out"], r["anl"])
        ans = [t for w, t in r["out"] if w == "A"]
        check("arm" in ans[0].lower(), "Kleinkind über den Arm")
        check("raus" in ans[1].lower(), "kommt beim 2. Mal heraus")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
