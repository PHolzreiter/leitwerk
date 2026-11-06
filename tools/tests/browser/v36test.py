import subprocess, sys, time, json, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8815", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8815/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        probe = """async ([id, v, n, ereignis]) => { const L = window.__lw; const out = [];
            for (let i = 0; i < n; i++) { const e = await L.sim.probeFall(id, v); if (!e) continue; e.anruf.status = 'aktiv';
              if (ereignis) L.sim.testEreignis(e);
              const k = L.kontext(e); out.push({ p: L.systemPrompt(k), w: e.wahr.abfrage.antworten, dabei: e.wahr.abfrage.anrufer.persona?.dabei ?? '', ort: e.wahr.abfrage.szenario?.ortArt, selbst: e.wahr.abfrage.anrufer.selbst, rolle: e.wahr.abfrage.anrufer.rolle, name: e.wahr.abfrage.anrufer.name, pname: e.wahr.abfrage.szenario?.patient.name }); }
            return out; }"""
        r = A.evaluate(probe, ["fk_kleinkind", "C", 6, True])
        nach = [x for x in r if "GERADE GEÄNDERT" in x["p"]]
        check(len(nach) >= 3, f"FK C: Ereignis kommt im Prompt an ({len(nach)}/6)")
        check(not any("Rot ist" in x["p"] or "Gesichtsfarbe ist normal" in x["p"] or "ein bisschen Luft kriegt" in x["p"] for x in nach), "FK C: alte Befunde nach dem Ereignis weg")
        check(not any("redet" in x["p"].split("DAS STIMMT SICHER")[1].split("WIE DU REDEST")[0] for x in r), "Kleinkind: niemand „redet“")
        r = A.evaluate(probe, ["psych_eingesperrt", "A", 6, False])
        check(not any(re.search(r"zugesperrt|Lautsprecher|Hund|Katze", x["p"]) for x in r), "Psych: keine Haustür-/Lautsprecher-/Haustier-Zeilen")
        check(all("vor der Tür" in x["dabei"] for x in r), "Psych: wer dabei ist, steht vor der Tür")
        check(not any("UBG" in x["p"] for x in r), "Psych: UBG-Frage nur für die Polizei")
        r = A.evaluate(probe, ["kollaps", "A", 14, False])
        oeff = [x for x in r if x["ort"] in ("geschaeft", "lokal", "bahnhof", "sport", "freizeit", "schule", "arbeit")]
        check(not any("allein" in x["dabei"] for x in oeff), f"öffentliche Orte: nie allein ({len(oeff)} Proben)")
        check(not any(x["name"].split(" ")[0] == (x["pname"] or "").split(" ")[0] for x in r), "Anrufer und Patient heißen nicht gleich")
        r = A.evaluate(probe, ["parkbank", "A", 6, False])
        check(all("kann dir nichts sagen" in x["p"] for x in r if x["w"].get("bw") != "ja"), "Parkbank: Passant kennt Namen und Krankheiten nicht")
        check(all("Gefunden hast du" in x["p"] for x in r), "Parkbank: Zeit = seit dem Finden")
        r = A.evaluate(probe, ["brustschmerz", "0", 12, False])
        ich = [x for x in r if x["selbst"]]
        check(not any(re.search(r"\b(kann er|weiß, wo er|Er ist|Sie ist) ", x["p"].split("DAS STIMMT SICHER")[1].split("WIE DU REDEST")[0]) for x in ich), f"Selbstanrufer: Fakten in Du-Form ({len(ich)})")
        check(not any(re.search(r"sechs Stunden|4 Stunden|Mittagessen|vielleicht zehn", x["p"]) for x in r), "keine konkurrierenden Zeitangaben im Prompt")
        check(all(re.search(r"„Sie“", x["p"]) for x in r), "Regel: Leitstelle siezen")
        # Ausgänge nur mit p > 0 bei „alle“
        n = A.evaluate("() => { const L = window.__lw; const f = L.faelle.alleFaelle(false).find(x => x.id === 'kreislaufstillstand'); return L.testlauf.auftraegeFuer([f], 'alle', 1).map(x => x.variante); }")
        check(n == ["rea"], f"Testlauf „alle“: nur Ausgänge, die von selbst vorkommen ({n})")
        # Nachbearbeitung
        t = A.evaluate("() => { const L = window.__lw; return [L.ohneFrageEcho('Wie atmet sie? Sie kriegt kaum Luft.', 'Wie atmet sie?'), L.fuellwortDosis('Sozusagen eine Person.', [], ['sozusagen','gell']), L.ohneRollentausch('Sie atmet schwer. Wie geht\\'s ihr jetzt?')]; }")
        print("   ", t)
        check(t == ["Sie kriegt kaum Luft.", "Eine Person.", "Sie atmet schwer."], "Echo, Füllwort-Überdosis und Rollentausch werden entfernt")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
