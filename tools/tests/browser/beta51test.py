# Beta 51 (Paul 14.11.2026): automatische Unfallmeldung – Ansage (Computerstimme) fest, danach redet ein Mensch;
# „Hören Sie mich?“ direkt nach „Wer ruft an?“ (ohne Sprachkontakt: Anzahl/Bewusstsein/Atmung unbekannt);
# Leertaste-Fragen beim eCall an „Sie“ bzw. über „die verletzte Person“; wer der Patient ist, je Variante
# (Fußgänger/Radfahrer/Motorrad, beide, nur der Lenker); Person am Telefon hat ihr eigenes Alter.
# Aufruf: python3 beta51test.py <arbeitsordner> <web-build>
import subprocess, sys, time
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8951", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

FRAGE = "() => { const t = document.querySelector('.k-Abfrage .fe'); if (!t) return ''; const m = t.innerText.match(/Frage \\d+ von \\d+\\n([^\\n]+)/); return m ? m[1] : ''; }"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1600, "height": 1000}); logs = []
        A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8951/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => { await window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json()); }")
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        A.evaluate("() => window.__lw.panelZeigen('abfrage')"); A.wait_for_timeout(500)

        # ---- 1) wer ist der Patient, eigenes Alter, Anweisung an die KI
        r = A.evaluate("""async () => { const s = window.__lw.sim; const out = {};
            for (const v of ['A', 'B', 'C', 'D']) { const e = await s.generiereFall('ecall_kollision', v); const x = e.wahr.abfrage.anrufer; const k = window.__lw.kontext(e);
              out[v] = { selbst: x.selbst, alter: x.alter, pat: e.wahr.abfrage.antworten.alter, code: e.wahr.code, anz: e.wahr.abfrage.antworten.anzahl_patienten, prompt: window.__lw.systemPrompt(k) }; } return out; }""")
        for v, x in r.items(): print("    ", v, x["selbst"], x["alter"], x["pat"], x["code"], x["anz"])
        check(not r["A"]["selbst"] and isinstance(r["A"]["alter"], int) and "der Fußgänger" in r["A"]["prompt"] and "Jahre alt" in r["A"]["prompt"], "Fußgänger: Lenker ist nicht der Patient, hat eigenes Alter")
        check("du hast dich erwischt" not in r["A"]["prompt"] and "das warst NICHT du" in r["A"]["prompt"], "Anweisung: keine vertauschten Personen, Ansage war nicht die Person")
        check("unter Schock" in r["A"]["prompt"] and "erst, wenn die Leitstelle fragt" in r["A"]["prompt"], "Fußgänger-Variante: Schock, Details erst auf Nachfrage")
        check(not r["B"]["selbst"] and r["B"]["anz"] == "n" and r["B"]["code"] == "RD-34D1h", "Radfahrer: beide verletzt (mehrere), Code D1h")
        check(not r["C"]["selbst"] and r["C"]["code"] == "RD-34D1i", "Motorrad: Lenker unverletzt, Code D1i")
        check(r["D"]["selbst"] and r["D"]["alter"] is None and r["D"]["code"] == "RD-34B1", "Ausgewichen: nur der Lenker verletzt (selbst), Code B1")

        # ---- 2) Ansage fest (Computerstimme), danach ein Mensch
        r = A.evaluate("""async () => { const s = window.__lw.sim; for (const e of s.state.einsaetze) if (e.anruf && e.anruf.status !== 'beendet') e.anruf.status = 'beendet';
            const e = await s.generiereFall('ecall_kollision', 'A'); s.anrufAnnehmen(e.id); await window.__lw.eroeffnen(s.einsatz(e.id)); await new Promise((r) => setTimeout(r, 500));
            const g = s.einsatz(e.id).anruf.gespraech.filter((m) => m.von === 'anrufer'); return { id: e.id, g: g.map((m) => [m.quelle, m.text.slice(0, 60)]), meldung: e.wahr.abfrage.anrufer.meldung.slice(0, 60) }; }""")
        print("    Gespräch:", r["g"])
        check(len(r["g"]) == 1 and r["g"][0][0] == "fest" and r["g"][0][1] == r["meldung"], "erste Antwort ist die feste Ansage")
        eid = r["id"]

        # ---- 3) Reihenfolge: „Hören Sie mich?“ direkt nach „Wer ruft an?“
        A.evaluate("""(id) => { const s = window.__lw.sim; const e = s.einsatz(id); s.aktualisiere(id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, telefon: '0664 1', zusatz: '-' });
            s.abfrageSetze(id, 'rueckrufnummer', '0664 1'); s.abfrageSetze(id, 'anrufer', 'system'); }""", eid)
        A.wait_for_timeout(800)
        f1 = A.evaluate(FRAGE)
        check("Sprachkontakt" in f1, f"nach „Wer ruft an?“ kommt der Sprachkontakt ({f1!r})")
        A.evaluate("(id) => window.__lw.sim.abfrageSetze(id, 'sprachkontakt', 'ja')", eid); A.wait_for_timeout(600)
        f2 = A.evaluate(FRAGE)
        check("viele" in f2.lower(), f"danach die Anzahl ({f2!r})")
        # ohne Sprachkontakt: Anzahl, Bewusstsein, Atmung unbekannt
        r = A.evaluate("""async () => { const s = window.__lw.sim; for (const e of s.state.einsaetze) if (e.anruf && e.anruf.status !== 'beendet') e.anruf.status = 'beendet';
            const e = await s.generiereFall('ecall_stille', 'A'); s.anrufAnnehmen(e.id); await new Promise((r) => setTimeout(r, 1200));
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, telefon: '0664 1', zusatz: '-' }); s.abfrageSetze(e.id, 'rueckrufnummer', '0664 1');
            s.abfrageSetze(e.id, 'anrufer', 'system'); s.abfrageSetze(e.id, 'sprachkontakt', 'nein'); const a = s.einsatz(e.id).anruf.antworten; return [a.anzahl_patienten, a.bw, a.at, s.einsatz(e.id).anruf.ergebnis?.code]; }""")
        A.wait_for_timeout(600)
        f3 = A.evaluate(FRAGE)
        check(r[:3] == ["unbekannt", "unbekannt", "unbekannt"] and r[3] == "RD-34B4", f"kein Sprachkontakt → Anzahl/Bewusstsein/Atmung unbekannt, 34B4 ({r})")
        check("viele" not in f3.lower() and "wach" not in f3.lower() and "alt" not in f3.lower(), f"… und die Fragen werden übersprungen ({f3!r})")

        # ---- 4) Leertaste-Fragen beim eCall
        r = A.evaluate("""() => { const lw = window.__lw; const S = lw.store.schema; const K = S.kapitel['34']; const P = S.globale_fragen.phase_4_primaerabfrage;
            const f = (id) => K.fragen.find((x) => x.id === id) || P.find((x) => x.id === id); const a = { anrufer: 'system' }; const z = () => 0;
            return { sk: lw.sprechFrage(f('sprachkontakt'), S, a, { zufall: z }), vl: lw.sprechFrage(f('verletzte'), S, a, { zufall: z }), anz: lw.sprechFrage(f('anzahl_patienten'), S, a, { zufall: z }),
              bw: lw.sprechFrage(f('bw'), S, a, { zufall: z }), at: lw.sprechFrage(f('at'), S, a, { zufall: z }), alter: lw.sprechFrage(f('alter'), S, a, { zufall: z }),
              bwM: lw.sprechFrage(f('bw'), S, { ...a, anzahl_patienten: 'n' }, { zufall: z }), normal: lw.sprechFrage(f('at'), S, { anrufer: '2' }, { zufall: z }) }; }""")
        for k, v in r.items(): print("    ", k, v)
        check(r["sk"].startswith("Hallo, hier ist die Rettungsleitstelle") and "Sind Sie verletzt" in r["vl"] and r["anz"] == "Wie viele Personen sind verletzt?", "eCall: Hören Sie mich? / Sind Sie verletzt? / Wie viele sind verletzt?")
        check("verletzte Person" in r["bw"] and "verletzte Person" in r["at"] and "verletzte Person" in r["alter"], "eCall: Bewusstsein, Atmung, Alter über „die verletzte Person“")
        check(r["bwM"].startswith("Gibt es dort jemanden") and "verletzte Person" not in r["normal"], "mehrere → an alle; normaler Anruf unverändert")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
sys.exit(1 if fails else 0)
