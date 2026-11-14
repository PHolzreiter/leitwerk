# v0.79: Kinder nur in Häuser mit Kinderabteilung (sonst gekennzeichnetes Ausweich-Haus); Altersgruppen <1 / 1–17 / 18+. Basis v0.78: Zuweisung nach Symptom, Altersgruppe und Dringlichkeit
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8881", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
        A.goto("http://localhost:8881/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); window.__lw.sim.settings.khGrundAktiv = false; window.__lw.sim.state.khBelegung = {}; }")
        MELK = [48.2274, 15.3317]
        alle = """([ort, sym, d, a, zeit]) => { const s = window.__lw.sim; s.state.zeit = zeit;
          return s.khFuer({ lat: ort[0], lon: ort[1] }, `avn:${sym}:${d}:${a}`, d === 30, a !== 'e').filter(x => !x.zu).slice(0, 6).map(x => x.h.id + ':' + x.eignung); }"""
        do_tag = zeit(A, 2026, 10, 29, 10)
        g = A.evaluate("() => [0, 0.5, 1, 5, 17.9, 18].map(a => window.__lw.zuweisung.altersgruppeVon(a))")
        check(g == ["kleinkind", "kleinkind", "kind", "kind", "kind", "erwachsener"], f"Altersgruppen nach Alter {g}")
        fe = A.evaluate(alle, [MELK, "fieber", 10, "j", do_tag])
        fe_e = A.evaluate(alle, [MELK, "fieber", 10, "e", do_tag])
        print("    Fieber Melk Kind:", fe, " Erwachsener:", fe_e)
        check(fe and fe[0].endswith("passend") and not fe[0].startswith("kh017"), "Kind mit Fieber: zuerst Haus mit Kinderabteilung")
        check("kh017:ausweich" in fe or "kh017:passend" not in fe, "Melk (ohne Kinderabteilung) für Kinder nur Ausweich")
        check(fe_e and fe_e[0] == "kh017:passend", "Erwachsener mit Fieber: Melk")
        un = A.evaluate(alle, [MELK, "unterschenkelverletzung", 10, "j", do_tag])
        print("    Unterschenkel Kind Melk:", un)
        check(un and un[0].endswith("passend") and un[0].split(":")[0] in ("kh001", "kh002", "kh003", "kh006"), "Kind mit Verletzung: Unfall mit Kinderabteilung")
        geb = A.evaluate(alle, [MELK, "drohende_geburt_ueber_ssw_37", 20, "j", do_tag])
        print("    Geburt (Jugendliche):", geb)
        check(geb and geb[0].endswith("passend"), "Geburt: Geburtshilfe wie bei Erwachsenen")
        b = A.evaluate("() => { const z = window.__lw.zuweisung.zuweisungBuchung('avn:schaedelhirntrauma:30:j'); return { o: z.optionen, a: z.ausweichKind }; }")
        print("   ", b)
        check(all(any(k.startswith("ak_kinder") for k in alt) for alt in b["o"]) and all("ak_neurochirurgie" in alt for alt in b["o"]), "SHT Kind: Neurochirurgie und Kinderabteilung")
        # Fenster: Melk für Kinder fast nur Ausweich
        A.evaluate("() => window.__lw.zuweisung.khAufnahmeOeffnen('kh017')"); A.wait_for_timeout(800)
        A.select_option(".kha-alter", "kind"); A.wait_for_timeout(400)
        n = A.evaluate("() => { const c = [...document.querySelectorAll('.kha-sym .kha-c[data-sym]')]; return { ja: c.filter(x => x.classList.contains('ja') || x.classList.contains('zu')).length, aus: c.filter(x => x.classList.contains('ausweich')).length }; }")
        A.select_option(".kha-alter", "erwachsener"); A.wait_for_timeout(400)
        m = A.evaluate("() => { const c = [...document.querySelectorAll('.kha-sym .kha-c[data-sym]')]; return { ja: c.filter(x => x.classList.contains('ja') || x.classList.contains('zu')).length, aus: c.filter(x => x.classList.contains('ausweich')).length }; }")
        print("    Melk Kind:", n, "Erwachsener:", m)
        check(n["ja"] < m["ja"] / 4 and n["aus"] > 20, "Fenster: Kinder in Melk fast nur Ausweich")
        lab = A.evaluate("() => [...document.querySelectorAll('.kha-alter option')].map(o => o.textContent)")
        check(lab == ["Kleinkind/Neugeboren", "Kind", "Erwachsener"], f"Altersgruppen {lab}")
        A.screenshot(path=f"{S}/v79.png")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
finally:
    srv.terminate()
print("FEHLER gesamt:", fails) if fails else print("alles OK")
