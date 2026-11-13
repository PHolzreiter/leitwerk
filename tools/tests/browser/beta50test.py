# Beta 50 (Paul 13.11.2026): Anzahl der Patienten vor Bewusstsein/Atmung (bei mehreren „Gibt es dort jemanden, der …“,
# bei der Gesundheitshotline nicht gefragt), kein großer Hinweis über der Fahrzeugliste, macOS-Ampel überlappt das Logo nicht.
# Aufruf: python3 beta50test.py <arbeitsordner> <web-build>
import subprocess, sys, time
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8950", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

FRAGE = "() => { const t = document.querySelector('.k-Abfrage .fe'); if (!t) return ''; const m = t.innerText.match(/Frage \\d+ von \\d+\\n([^\\n]+)/); return m ? m[1] : ''; }"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1600, "height": 1000}); logs = []
        A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8950/?debug"); A.wait_for_timeout(2500)
        for privat in (False, True):
            name = "AMPDS" if privat else "LeitWerk"
            if privat:
                A.evaluate("async () => { await window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json()); }")
            A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
            A.evaluate("() => window.__lw.panelZeigen('abfrage')"); A.wait_for_timeout(500)
            def neu(fall, anrufer):
                eid = A.evaluate("""async (f) => { const s = window.__lw.sim; for (const e of s.state.einsaetze) if (e.anruf && e.anruf.status !== 'beendet') e.anruf.status = 'beendet';
                    const e = await s.generiereFall(f, 'A'); s.anrufAnnehmen(e.id); return e.id; }""", fall)
                A.wait_for_timeout(900)
                A.evaluate("""(x) => { const s = window.__lw.sim; const e = s.einsatz(x.id); s.aktualisiere(x.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, telefon: '0664 1', zusatz: '-' });
                    s.abfrageSetze(x.id, 'rueckrufnummer', '0664 1'); s.abfrageSetze(x.id, 'anrufer', x.anrufer); }""", {"id": eid, "anrufer": anrufer})
                A.wait_for_timeout(700)
                return eid
            eid = neu("ecall_mehrere", "2")
            f1 = A.evaluate(FRAGE)
            check("viele" in f1.lower() or "patient" in f1.lower() or "betroffen" in f1.lower(), f"{name}: nach „Wer ruft an?“ kommt die Anzahl ({f1!r})")
            A.evaluate("(id) => window.__lw.sim.abfrageSetze(id, 'anzahl_patienten', 'n')", eid); A.wait_for_timeout(600)
            f2 = A.evaluate(FRAGE)
            check(f2 == "Gibt es dort jemanden, der nicht bei vollem Bewusstsein ist?", f"{name}: mehrere → Bewusstsein für alle ({f2!r})")
            A.evaluate("(id) => window.__lw.sim.abfrageSetze(id, 'bw', 'ja')", eid); A.wait_for_timeout(600)
            f3 = A.evaluate(FRAGE)
            check(f3 == "Gibt es dort jemanden, der nicht normal atmet?", f"{name}: mehrere → Atmung für alle ({f3!r})")
            eid = neu("ecall_auffahrunfall", "2")
            A.evaluate("(id) => window.__lw.sim.abfrageSetze(id, 'anzahl_patienten', '1')", eid); A.wait_for_timeout(600)
            f4 = A.evaluate(FRAGE)
            check(f4 and "jemanden" not in f4, f"{name}: ein Patient → Frage zum Patienten ({f4!r})")
            eid = neu("hotline_fieber", "hotline")
            f5 = A.evaluate(FRAGE)
            r = A.evaluate("(id) => window.__lw.sim.einsatz(id).anruf.antworten.anzahl_patienten", eid)
            alle = A.evaluate("() => document.querySelector('.k-Abfrage .fe').innerText")
            check(r == "1" and "viele" not in f5.lower(), f"{name}: Hotline → keine Frage nach der Anzahl, ein Patient ({f5!r}, {r})")

        # ---- Fahrzeugliste: kein großer Hinweis beim Verweilen über einer Zeile
        A.evaluate("() => window.__lw.panelZeigen('fahrzeuge')"); A.wait_for_timeout(800)
        r = A.evaluate("() => { const z = [...document.querySelectorAll('.k-Fahrzeuge .lz.fzz')]; return [z.length, z.filter((x) => x.closest('[title*=\"Doppelklick\"]')).length, document.querySelector('.k-Fahrzeuge [role=row][title]')?.title || ''] }")
        check(r[0] > 0 and r[1] == 0 and "Doppelklick" in r[2], f"Fahrzeugzeilen ohne Hinweis, Hinweis am Spaltenkopf {r}")

        # ---- macOS: Platz für die Ampelknöpfe in Bildschirm-Pixeln (auch bei kleiner Programmgröße)
        r = A.evaluate("""() => { const h = document.documentElement; h.classList.add('tl-mac'); const k = document.querySelector('.kl-leiste:not(.kl-zweit-leiste)'); if (!k) return null;
            const out = []; for (const z of ['1', '0.8', '1.25']) { h.style.setProperty('--ui-zoom', z); out.push(parseFloat(getComputedStyle(k).paddingLeft) * Number(z)); }
            h.classList.remove('tl-mac'); h.style.removeProperty('--ui-zoom'); return out; }""")
        check(r and all(abs(x - 90) < 1 for x in r), f"macOS: links immer 90 Bildschirm-Pixel frei {r}")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
sys.exit(1 if fails else 0)
