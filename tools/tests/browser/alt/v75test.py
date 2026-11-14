# v0.75: KT-Abfrage-Editor mit freien Fragen (einfügen, bearbeiten, löschen, verschieben, Art + Kriterien); SNAW-Code nach Fahrzeug
import subprocess, sys, time, json, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8875", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
J = "window.__lw.sim"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8875/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate(f"() => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(9,0,0,0); s.state.zeit=d.getTime(); }}")
        A.evaluate(f"() => {J}.call('start')"); A.wait_for_timeout(1200); A.evaluate(f"() => {J}.call('pause')")
        # --- Editor öffnen
        A.evaluate("() => window.__lw.startseite.zeigen()"); A.wait_for_timeout(900)
        A.click('.st [data-act="einstellungen"]'); A.wait_for_timeout(800)
        A.click('[data-seite="codes"]'); A.wait_for_timeout(800)
        A.click('[data-act-codes="saetze"]'); A.wait_for_timeout(700)
        A.click("[data-kt-editor]"); A.wait_for_timeout(800)
        hin = A.inner_text(".kte-pruefung")
        check("Nie automatisch" not in hin, f"alle Codes erreichbar, auch SNAW bei SOFORT ({hin[:120]!r})")
        A.click('[data-kte="abfrage"]'); A.wait_for_timeout(300)
        ids = A.evaluate("() => [...document.querySelectorAll('.kte-frage')].map(x => x.dataset.frage)")
        arten = A.evaluate("() => Object.fromEntries([...document.querySelectorAll('.kte-frage')].map(x => [x.dataset.frage, x.classList.contains('code') ? 'code' : 'info']))")
        print("   ", ids)
        check(arten.get("lage") == "code" and arten.get("patient") == "info" and arten.get("zustand") == "code", f"Art erkannt: lage/zustand code-bestimmend, patient Zusatzinfo")
        # verschieben
        i0 = ids.index("lage")
        A.click('[data-frage="lage"] [data-frage-act="hoch"]'); A.wait_for_timeout(300)
        ids2 = A.evaluate("() => [...document.querySelectorAll('.kte-frage')].map(x => x.dataset.frage)")
        check(ids2.index("lage") == i0 - 1, "Frage nach oben verschoben")
        # löschen → Pflicht fehlt
        A.click('[data-frage="lage"] [data-frage-act="loeschen"]'); A.wait_for_timeout(300)
        check("Lage" in A.inner_text(".kte-liste"), "ohne Frage zur Lage: Fehler")
        # neue Frage einfügen: ohne Text/Kriterium → Fehler
        A.click('[data-frage-neu="code"]'); A.wait_for_timeout(300)
        neu = A.evaluate("() => [...document.querySelectorAll('.kte-frage')].find(x => x.querySelector('.kte-frage-detail'))?.dataset.frage")
        fl = A.inner_text(".kte-liste")
        check(neu and "keinen Text" in fl and "bitte wählen" in fl, f"neue Frage ({neu}) ohne Text und Kriterium wird gemeldet")
        A.fill(f'[data-frage="{neu}"] input[name="frage-text-{neu}"]', "Kann der Patient gehen oder muss er liegen?")
        A.press(f'[data-frage="{neu}"] input[name="frage-text-{neu}"]', "Tab")
        A.check(f'[data-frage="{neu}"] input[name="klaert-lage"]'); A.wait_for_timeout(300)
        st = A.inner_text(".kte-status")
        check("Alles vollständig" in st, f"neue Lage-Frage → wieder vollständig ({st})")
        # Zusatzinfo-Frage
        A.click('[data-frage-neu="info"]'); A.wait_for_timeout(300)
        neu2 = A.evaluate("() => [...document.querySelectorAll('.kte-frage')].find(x => x.querySelector('.kte-frage-detail'))?.dataset.frage")
        A.fill(f'[data-frage="{neu2}"] input[name="frage-text-{neu2}"]', "Hat der Patient ein Haustier dabei?")
        A.press(f'[data-frage="{neu2}"] input[name="frage-text-{neu2}"]', "Tab")
        A.check(f'[data-frage="{neu2}"] input[name="klaert-zusatz"]'); A.wait_for_timeout(300)
        A.screenshot(path=f"{S}/v75_editor.png")
        A.fill('.kte input[name="satzname"]', "Fragen Test")
        A.locator(".kte-dlg .dlg-foot .btn.primary").click(); A.wait_for_timeout(1500)
        ab = A.evaluate("() => window.__lw.store.ktSatzRoh.abfrage")
        texte = [f["text"] for f in ab]
        check(any("gehen oder muss er liegen" in t for t in texte) and not any(f["id"] == "lage" for f in ab), "gespeichert: eigene Fragen, Reihenfolge")
        f1 = next(f for f in ab if "liegen" in f["text"])
        check(f1["art"] == "code" and f1["klaert"] == ["lage"], f"Frage mit Art und Kriterium gespeichert {f1}")
        A.locator(".dlg-foot .btn", has_text="Schließen").last.click(); A.wait_for_timeout(300)
        # Auftrag: 🗨 der Lage nimmt den neuen Wortlaut
        t = A.evaluate("() => window.__lw.ktFrageText ? window.__lw.ktFrageText('lage') : null")
        if t is not None: check("liegen" in t, f"🗨 Lage fragt mit eigenem Wortlaut ({t})")
        # --- SNAW: Code folgt dem geschickten Fahrzeug
        r = A.evaluate(f"""async () => {{
          const s={J};
          for (let i=0;i<40;i++) {{ const k = await s.generiereSek('online'); if (!k) continue;
            s.call('ktSetze', k.id, {{ sofort: true, sek: {{ ...(k.d.sek||{{}}), arzt: true, monitoring: false, inkubator: false, instabil: true }} }});
            const k2 = s.ktAuftrag(k.id); if (!k2.d.code) continue;
            const vor = k2.d.code;
            const fz = Object.values(s.state.fahrzeuge).find(f => f.rmTyp === 'SNAW');
            if (!fz) return {{ vor, fehlt: 'kein SNAW', typen: [...new Set(Object.values(s.state.fahrzeuge).map(f=>f.rmTyp))] }};
            await s.call('ktVormerken', k.id, fz.id);
            return {{ vor, nach: s.ktAuftrag(k.id).d.code }};
          }}
          return null; }}""")
        print("   ", r)
        check(r and r.get("nach", "").endswith("-SNAW") and not r["vor"].endswith("-SNAW"), f"SOFORT mit Notarzt: SNAW geschickt → SNAW-Code ({r})")
        check(not logs, f"keine Fehler im Programm {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print(f"FEHLER: {fails}")
