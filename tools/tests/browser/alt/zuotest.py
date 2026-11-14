import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8826", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} })()")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8826/?debug"); A.wait_for_timeout(1500)
        # ab v0.73 kein „Eigenes Codesystem laden“ mehr in der Leiste – Satz direkt laden
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/fremd_a.json')).json())"); A.wait_for_timeout(800)
        A.click("[data-act=einstellungen]"); A.click(".es-punkt[data-seite=codes]"); A.wait_for_timeout(600)
        A.screenshot(path=f"{S}/zuo_laden.png")
        if A.locator(".dlg-foot >> text=Laden").count(): A.click(".dlg-foot >> text=Laden"); A.wait_for_timeout(1200)
        bar = A.inner_text(".schema-bar"); print("   ", bar.replace("\n", " | ")[:300])
        check("Übersetzt auf die LeitWerk-Merkmale" in bar, "Leiste zeigt die Übersetzung")
        A.click(".schema-bar >> text=Zuordnung"); A.wait_for_timeout(500)
        A.screenshot(path=f"{S}/zuo_dialog.png", full_page=False)
        n = A.locator(".zuo-tab tbody tr").count(); print("    Zeilen", n)
        check(n >= 40, "alle Fragen in der Liste")
        stufen = A.inner_text(".zuo-stufen"); print("   ", stufen.replace("\n", " | ")[:400])
        check("Prio 1 – Notarzt → kritisch" in stufen and "Prio 4 – Krankentransport → stabil" in stufen, "Einsatzstufen eingeordnet")
        # q_n_arm von Hand zuordnen
        zeile = A.locator(".zuo-tab tbody tr", has_text="beide Arme gleich hoch")
        zeile.locator("select.zuo-sel").select_option("fast_arm"); A.wait_for_timeout(500)
        r = A.evaluate("() => { const u = window.__lw.store.uebersetzung; return u.zuordnung.find(z => z.frage === 'q_n_arm'); }")
        print("   ", r)
        check(r["merkmal"] == "fast_arm" and r["quelle"] == "explizit", "von Hand gewählt")
        # „Arme gleich hoch? Ja“ heißt: es sinkt keiner ab → Antworten von Hand umdrehen
        zeile = A.locator(".zuo-tab tbody tr", has_text="beide Arme gleich hoch")
        zeile.locator(".zuo-wert", has_text="Ja →").locator("select").select_option("nein"); A.wait_for_timeout(300)
        zeile = A.locator(".zuo-tab tbody tr", has_text="beide Arme gleich hoch")
        zeile.locator(".zuo-wert", has_text="Nein →").locator("select").select_option("ja"); A.wait_for_timeout(300)
        r = A.evaluate("() => { const u = window.__lw.store.uebersetzung; return u.zuordnung.find(z => z.frage === 'q_n_arm'); }")
        print("   ", r)
        check(r["werte"].get("J") == "nein" and r["werte"].get("N") == "ja", "Antworten von Hand umgedreht")
        q = A.evaluate("() => window.__lw.store.schema.kapitel.N4.fragen.find(f => f.text.includes('Arme')).optionen.map(o => o.wert)")
        check(q[:2] == ["nein", "ja"], f"übersetztes Schema hat die neutralen Werte ({q})")
        A.screenshot(path=f"{S}/zuo_hand.png")
        # KI-Vorschläge (Test-KI): nimmt den ersten vorgeschlagenen Kandidaten, Ja→ja / Nein→nein
        A.evaluate("""() => { const lw = window.__lw; lw.kiTest.chat = async () => 'ok'; lw.kiTest.json = async (msgs) => {
            const t = msgs[1].content; const m = t.match(/MÖGLICHE MERKMALE:\\n- ([a-z0-9_]+):/); const w = {};
            for (const x of t.matchAll(/(\\w+) = „(Ja|Nein|Unklar)[^“]*“/g)) w[x[1]] = x[2] === 'Ja' ? 'ja' : x[2] === 'Nein' ? 'nein' : 'unbekannt';
            return JSON.stringify({ merkmal: m ? m[1] : 'keins', werte: w }); }; }""")
        A.click(".zuo-ki >> text=KI-Vorschläge"); A.wait_for_timeout(2500)
        info = A.inner_text(".zuo-ki"); print("   ", info)
        r = A.evaluate("() => window.__lw.store.uebersetzung.zuordnung.filter(z => z.ki).length")
        check(r >= 1 and "übernommen" in info, f"KI-Vorschläge eingetragen ({r})")
        check(A.locator(".zuo-tab td", has_text="KI-Vorschlag").count() >= 1, "Quelle „KI-Vorschlag“ sichtbar")
        A.evaluate("() => { window.__lw.kiTest.chat = null; window.__lw.kiTest.json = null; }")
        A.click(".dlg-foot >> text=Fertig"); A.wait_for_timeout(300)
        r = A.evaluate("() => window.__lw.store.schemaRoh.kapitel.N4.fragen.find(f => f.id === 'q_n_arm').merkmal")
        check(r == "fast_arm", "in der Datei gespeichert")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
