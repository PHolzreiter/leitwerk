# Beta 73 (Paul 22.11.2026):
# - Verteilung je Spieltyp: Realistisch = echte Verteilung, Standard/Stressig = spannende Session (mehr Akutes),
#   bei Standard/Stressig kein Thema öfter als 2-mal hintereinander
# - Rufhilfe: „Wer ruft an?“ = Rufhilfe, Band (Name, Alter, Adresse, Schlüsselsafe), Sprechverbindung oder „…“,
#   Adresse automatisch, Bewusstsein/Atmung aus der Primärabfrage, Schlüsselsafe + „Was ist passiert?“ (Freitext,
#   auch in der Info an den RTW), immer 32B2 ohne Aufwertung, Vorschlag der nächste RTW, Fehleinsatz möglich
# Aufruf: python3 beta73test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
EIGEN = json.load(open(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "codesystem", "leitwerk_codesystem.json")))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8973", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
FRAGE = "() => { const t = document.querySelector('.k-Abfrage .fe'); if (!t) return ''; const m = t.innerText.match(/Frage \\d+ von \\d+\\n([^\\n]+)/); return m ? m[1] : ''; }"
SCHRITTE = "() => [...document.querySelectorAll('.k-Abfrage .fe')].map(x => x.innerText).join(' | ')"
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1600, "height": 1000}); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8973/?debug&seed=8973"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.rufhilfeAufnahme = 'selbst'; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; s.setWetter('klar'); s.state.zeit = new Date(2026, 10, 22, 15, 10).getTime(); }")
        A.evaluate("() => window.__lw.panelZeigen('abfrage')"); A.wait_for_timeout(500)

        # 1) Schema: Auswahl, Kapitel, Code
        r = A.evaluate("""() => { const L = window.__lw, S = L.store.schema, F = L.schemaFkt;
            const wer = S.globale_fragen.phase_3_was_ist_passiert.find(f => f.id === 'anrufer');
            const k = F.kapitelFuerAnrufer(S, 'rufhilfe');
            const c1 = F.bestimmeCode(S, k.kapitel, { anrufer: 'rufhilfe', anzahl_patienten: '1', bw: 'ja', at: 'normal', rh_kontakt: 'ja' });
            const c2 = F.bestimmeCode(S, k.kapitel, { anrufer: 'rufhilfe', anzahl_patienten: '1', bw: 'nein', at: 'normal', rh_kontakt: 'nein' });
            const K = S.kapitel[k.kapitel];
            const sicht = F.fragenImAblauf(S, k.kapitel, { anrufer: 'rufhilfe', anzahl_patienten: '1' }).map(x => x.frage.id);
            return { opt: wer.optionen.map(o => o.wert + ':' + o.label), kap: k.kapitel, vor: k.vor, c1: c1 && c1.code, c2: c2 && c2.code, stufe: S.codes[c1.code].kategorie, sicht, zus: (K.zusatzkennungen || {})[c1.code] || null }; }""")
        print("    ", r["opt"]); print("    Fragen:", r["sicht"])
        check(any(o.startswith("rufhilfe:") for o in r["opt"]), "„Wer ruft an?“ hat „Rufhilfe“")
        check(r["kap"] == "32" and r["vor"].get("anzahl_patienten") == "1", f"Rufhilfe → Kapitel 32, eine Person ({r['kap']})")
        check(r["c1"] == "RD-32B2" and r["c2"] == "RD-32B2" and r["stufe"] == "BLS/ALS aufwertbar", f"immer RD-32B2, BLS/ALS aufwertbar ({r['c1']}, {r['c2']}, {r['stufe']})")
        check(all(x in r["sicht"] for x in ["rh_kontakt", "rh_safe_nr", "rh_safe_ort", "rh_was"]) and "bw" in r["sicht"] and r["sicht"].index("bw") < r["sicht"].index("rh_was"), "Bewusstsein/Atmung vorher, dann Rufhilfe-Fragen")
        check(not any(x in r["sicht"] for x in ["art"]), "keine anderen Kapitel-Fragen")
        check(not r["zus"], "keine Zusatzkennung")

        # 2) Fall: Band, Adresse automatisch, Gespräch
        r = A.evaluate("""async () => { const s = window.__lw.sim;
            const e = await s.generiereFall('rufhilfe_sturz', 'B'); s.anrufAnnehmen(e.id); await window.__lw.eroeffnen(s.einsatz(e.id)); await new Promise(r => setTimeout(r, 600));
            const x = s.einsatz(e.id); const g = x.anruf.gespraech.filter(m => m.von === 'anrufer');
            return { id: e.id, meldung: x.wahr.abfrage.anrufer.meldung, art: x.wahr.abfrage.anrufer.art, g: g.map(m => [m.quelle, m.text.slice(0, 80)]), adr: x.adresse && x.adresse.label, wahrAdr: x.wahr.adresse, falsch: x.meldung.adresseFalsch,
              safe: [x.wahr.abfrage.antworten.rh_safe_nr, x.wahr.abfrage.antworten.rh_safe_ort], alter: x.wahr.abfrage.antworten.alter, code: x.wahr.code, prompt: window.__lw.systemPrompt(window.__lw.kontext(x)) }; }""")
        print("    Band:", r["meldung"])
        eid = r["id"]
        nr = str(r["safe"][0])
        check(r["art"] == "rufhilfe" and r["meldung"].startswith("Rufhilfe-Alarm.") and (" ".join(nr)) in r["meldung"] and r["safe"][1] in r["meldung"] and f"{r['alter']} Jahre" in r["meldung"] and r["wahrAdr"] in r["meldung"], "Band: Name, Alter, Adresse, Schlüsselsafe")
        check(len(r["g"]) == 1 and r["g"][0][0] == "fest" and r["g"][0][1] == r["meldung"][:80], "erste Antwort ist das Band")
        check(r["adr"] == r["wahrAdr"] and not r["falsch"], f"Adresse automatisch eingetragen ({r['adr']})")
        check(r["code"] == "RD-32B2", f"Wahrheit: RD-32B2 ({r['code']})")
        check("Rufhilfe-Uhr" in r["prompt"] and "das warst NICHT du" in r["prompt"] and "Hüfte" in r["prompt"], "KI: Person selbst an der Rufhilfe-Basis, Geschichte der Variante")

        # 3) Abfrage-Schritte im Fenster
        A.evaluate("""(id) => { const s = window.__lw.sim; s.aktualisiere(id, { telefon: '0664 1', zusatz: '-' }); s.abfrageSetze(id, 'rueckrufnummer', '0664 1'); s.abfrageSetze(id, 'anrufer', 'rufhilfe'); }""", eid)
        A.wait_for_timeout(800)
        f1 = A.evaluate(FRAGE)
        check("Sprechverbindung" in f1, f"nach „Wer ruft an?“ kommt die Sprechverbindung ({f1!r})")
        A.evaluate("(id) => window.__lw.sim.abfrageSetze(id, 'rh_kontakt', 'ja')", eid); A.wait_for_timeout(500)
        f2 = A.evaluate(FRAGE)
        check("wach" in f2.lower() or "bewusst" in f2.lower() or "ansprechbar" in f2.lower(), f"dann Bewusstsein (Primärabfrage, keine Anzahl) ({f2!r})")
        r = A.evaluate("""(id) => { const s = window.__lw.sim; const w = s.einsatz(id).wahr.abfrage.antworten;
            for (const [k, v] of [['bw', 'ja'], ['at', 'normal'], ['alter', w.alter], ['geschlecht', w.geschlecht], ['rh_safe_nr', w.rh_safe_nr], ['rh_safe_ort', w.rh_safe_ort], ['rh_was', 'Sturz, Schmerzen rechte Hüfte']]) s.abfrageSetze(id, k, v);
            const e = s.einsatz(id); return { code: e.anruf.ergebnis && e.anruf.ergebnis.code, info: e.infoRtw, kap: e.anruf.kapitel, auto: e.anruf.kapitelAuto }; }""", eid)
        A.wait_for_timeout(600)
        txt = A.evaluate(SCHRITTE)
        print("    ", r)
        check(r["code"] == "RD-32B2" and r["kap"] == "32" and r["auto"], f"Code RD-32B2, Kapitel automatisch ({r['code']})")
        check(r["info"].endswith("// Sturz, Schmerzen rechte Hüfte") and "B+" in r["info"] and "A+" in r["info"], f"Info an den RTW: {r['info']!r}")
        check("aufgewertet" not in txt, "keine Frage „Muss aufgewertet werden?“")
        # Protokoll (Erstaufnahme beim Auflegen)
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; s.anrufBeenden ? s.anrufBeenden(id) : s.auflegen(id); await new Promise(r => setTimeout(r, 300));
            const e = s.einsatz(id); return e.protokoll.map(p => p.text).filter(t => /Erstaufnahme/.test(t)).join('\\n'); }""", eid)
        print("    Protokoll:\\n      " + r.replace("\\n", "\\n      "))
        check("Anrufer: Rufhilfe" in r and "Sprechverbindung zur Person besteht" in r and f"Schlüsselsafe Nummer: {nr}" in r and "Schlüsselsafe Ort:" in r and "Was ist passiert: Sturz, Schmerzen rechte Hüfte" in r and "RD-32B2" in r, "Erstaufnahme mit Rufhilfe, Schlüsselsafe, Was ist passiert")
        # Vorschlag: der nächste RTW
        r = A.evaluate("""async (id) => { const s = window.__lw.sim; const v = await s.vorschlaege(id); const em = s.empfehlung(id, v);
            const kat = em.ids.map(i => s.state.fahrzeuge[i].kategorie); const rtw = v.filter(x => x.fz.kategorie === 'RTW' && x.sekunden !== null && !x.hinweis && !x.kt).sort((a, b) => a.sekunden - b.sekunden)[0];
            return { kat, erst: em.ids[0], naechster: rtw && rtw.fz.id }; }""", eid)
        check(r["kat"] == ["RTW"] and r["erst"] == r["naechster"], f"Vorschlag: nur der nächste RTW ({r})")

        # 4) ohne Sprechverbindung: „…“, Bewusstsein/Atmung unbekannt
        r = A.evaluate("""async () => { const s = window.__lw.sim; for (const e of s.state.einsaetze) if (e.anruf && e.anruf.status !== 'beendet') e.anruf.status = 'beendet';
            const e = await s.generiereFall('rufhilfe_still', 'C'); s.anrufAnnehmen(e.id); await window.__lw.eroeffnen(s.einsatz(e.id)); await new Promise(r => setTimeout(r, 400));
            const a1 = await window.__lw.anruferAntwort(s.einsatz(e.id), window.__lw.kontext(s.einsatz(e.id)), 'Hallo, hier ist die Rettung, hören Sie mich?');
            s.abfrageSetze(e.id, 'anrufer', 'rufhilfe'); s.abfrageSetze(e.id, 'rh_kontakt', 'nein'); const a = s.einsatz(e.id).anruf.antworten;
            return { a1, bw: a.bw, at: a.at, code: s.einsatz(e.id).anruf.ergebnis && s.einsatz(e.id).anruf.ergebnis.code, kontakt: e.wahr.abfrage.anrufer.sprachkontakt }; }""")
        print("    ", r)
        check(r["kontakt"] is False and (r["a1"] or "").strip() in ("…", "..."), f"keine Sprechverbindung: nur „…“ ({r['a1']!r})")
        check(r["bw"] == "unbekannt" and r["at"] == "unbekannt" and r["code"] == "RD-32B2", "Bewusstsein/Atmung unbekannt, trotzdem 32B2")

        # 5) Fehleinsatz (aus Versehen)
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e = await s.generiereFall('rufhilfe_versehen', 'A'); return { f: e.wahr.fehleinsatz, t: e.wahr.transport }; }""")
        check(bool(r["f"]) and "Versehen" in r["f"] and r["t"] is False, f"aus Versehen: Fehleinsatz ({r['f']})")

        # 6) eingebautes LeitWerk-Codesystem: auch dort 32B2
        r = A.evaluate("""async (cs) => { const L = window.__lw; await L.codesystemLaden(cs); await new Promise(r => setTimeout(r, 500)); const S = L.store.schema, F = L.schemaFkt;
            const k = F.kapitelFuerAnrufer(S, 'rufhilfe'); const c = k && F.bestimmeCode(S, k.kapitel, { anrufer: 'rufhilfe', anzahl_patienten: '1', bw: 'getruebt', at: 'normal' });
            const res = { kap: k && k.kapitel, code: c && c.code, name: c && S.codes[c.code].name };
            await L.codesystemLaden(await (await fetch('/abf_test.json')).json()); await new Promise(r => setTimeout(r, 500)); return res; }""", EIGEN)
        check(r["code"] == "RD-32B2" and "Rufhilfe" in (r["name"] or ""), f"eingebautes Codesystem: {r}")

        # 7) Verteilung je Spieltyp und Themen-Serien
        r = A.evaluate("""() => { const L = window.__lw, s = L.sim; const gr = new Map(L.faelle.alleFaelle().map(f => [f.id, f.gruppe || f.thema])); const out = {};
            for (const v of ['realistisch', 'standard', 'stressig']) { s.settings.aufkommenStufe = v; const z = [];
              for (let h = 0; h < 24; h++) { s.state.zeit = new Date(2026, 9, 14, h, 30).getTime();
                for (let i = 0; i < 60; i++) { const k = s.fallAusKatalog(L.store.schema); if (k) z.push(gr.get(k.fall.katalog.id)); } }
              const n = z.length, an = (g) => z.filter(x => x === g).length / n * 100; let serie = 0; for (let i = 2; i < n; i++) if (z[i] === z[i - 1] && z[i] === z[i - 2]) serie++;
              out[v] = { n, arzt: an('anforderung_arzt'), rufhilfe: an('rufhilfe'), akut: an('brustschmerz') + an('atemnot') + an('schlaganfall') + an('verkehrsunfall') + an('bewusstlos'), ecall: an('ecall'), serie }; }
            s.settings.aufkommenStufe = 'standard'; return out; }""")
        for v, x in r.items(): print("    ", v, {k: (round(y, 1) if isinstance(y, float) else y) for k, y in x.items()})
        check(r["realistisch"]["arzt"] > 15 and r["realistisch"]["rufhilfe"] > 4.5, "Realistisch: viele Anforderungen (Arzt/Pflege) und Rufhilfe wie in echt")
        check(r["standard"]["arzt"] < 11 and r["stressig"]["arzt"] < r["standard"]["arzt"], "Standard/Stressig: weniger Anforderungen")
        check(r["stressig"]["akut"] > r["standard"]["akut"] > r["realistisch"]["akut"], "mehr Akutes: Stressig > Standard > Realistisch")
        check(r["standard"]["serie"] <= 2 and r["stressig"]["serie"] <= 2, f"Standard/Stressig: kaum ein Thema 3-mal hintereinander ({r['standard']['serie']}, {r['stressig']['serie']})")
        check(r["realistisch"]["ecall"] < 1.5 and r["standard"]["ecall"] < 2.5, "eCall selten")

        for l in logs[:5]: print("    ", l)
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
