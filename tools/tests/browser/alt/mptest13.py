import subprocess, sys, time, re
sys.path.insert(0, sys.argv[1])
from mockrelay import Relay
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
CSV = "/root/.claude/uploads/6f627245-05f7-528c-b2dc-002fcbfffd22/44a43149-Einsatzcodes.csv"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8772", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
logs = []; fails = 0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
relay = Relay()
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctxA = b.new_context(viewport={"width": 1500, "height": 900}, accept_downloads=True)
        ctxB = b.new_context(viewport={"width": 1500, "height": 900}, accept_downloads=True)
        A = ctxA.new_page(); B = ctxB.new_page()
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        for pg, tag in [(A, "A"), (B, "B")]:
            pg.on("pageerror", lambda e, t=tag: logs.append(f"{t} PAGEERROR: {e}"))
            relay.attach(pg, tag)
            pg.goto("http://localhost:8772/?debug"); pg.wait_for_timeout(1500)
        # A importiert Codes
        A.click("[data-act=einstellungen]"); A.click(".es-punkt[data-seite=codes]")
        with A.expect_file_chooser() as fc: A.click("[data-act=import]")
        fc.value.set_files(CSV); A.wait_for_timeout(800)
        A.click(".dlg-foot >> text=Importieren"); A.wait_for_timeout(800)
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        # A hostet
        A.click("#btn-spiel"); A.wait_for_timeout(300)
        A.fill(".spiel input[placeholder^='Dein Name']", "Paul")
        A.click(".spiel >> text=Spiel hosten"); A.wait_for_timeout(800)
        code = A.inner_text(".spiel-code").strip()
        check(re.fullmatch(r"\d{6}", code) is not None, f"Host-Code {code}")
        A.screenshot(path=f"{S}/shots4/mp_host_dialog.png")
        A.click(".dlg-foot >> text=Schließen")
        # B tritt bei
        B.click("#btn-spiel"); B.wait_for_timeout(300)
        B.fill(".spiel input[placeholder^='Dein Name']", "Max")
        B.fill(".code-input", code)
        B.click(".spiel >> text=Beitreten"); B.wait_for_timeout(1500)
        check("Mitspieler" in B.inner_text("#btn-spiel"), "B ist Mitspieler: " + B.inner_text("#btn-spiel"))
        B.screenshot(path=f"{S}/shots4/mp_client_dialog.png")
        B.click(".dlg-foot >> text=Schließen")
        B.click("[data-act=einstellungen]"); B.click(".es-punkt[data-seite=codes]"); B.wait_for_timeout(300)
        nA = A.evaluate("() => window.__lw.store.list('codes').length"); check(f"{nA} von {nA}" in B.inner_text(".table-foot"), "B hat die Codes des Hosts: " + B.inner_text(".table-foot")[:40])
        A.evaluate("() => { const s=window.__lw.store; const x=structuredClone(s.settings); x.anrufe=false; s.setSettings(x); }"); A.wait_for_timeout(500)
        B.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        check("2 Spieler" in A.inner_text("#btn-spiel"), "Host sieht 2 Spieler: " + A.inner_text("#btn-spiel"))
        # A erzeugt Einsatz, B sieht ihn
        A.click(".lw-panel[data-panel=einsatzliste] >> text=+ Test"); A.click(".ctx-menu.test >> text=Notfall"); A.wait_for_timeout(1500)
        check(B.locator(".el-row:has(.el-typ.rd)").count() == 1, "Einsatz kommt bei B an")
        # B bearbeitet: Code setzen
        B.click(".el-row:has(.el-typ.rd) >> nth=0"); B.wait_for_timeout(500)
        B.fill(".lw-panel[data-panel=einsatz] .mask .addr input >> nth=0", "Brust"); B.wait_for_timeout(400)
        B.click(".lw-panel[data-panel=einsatz] .mask .addr-list:not([hidden]) .addr-item >> nth=0"); B.wait_for_timeout(1500)
        A.click(".el-row:has(.el-typ.rd) >> nth=0"); A.wait_for_timeout(600)
        ainfo = A.inner_text(".code-info")
        check(len(ainfo.strip()) > 3, "Code von B kommt beim Host an: " + ainfo[:60])
        check("Max" in A.inner_text(".el-liste"), "Host sieht Bearbeiter Max")
        check("Max" in A.inner_text(".prot"), "Protokoll zeigt Max")
        # Chat
        B.evaluate("() => window.__lw.zeige('chat')"); B.fill(".chat-form input", "Hallo Paul"); B.press(".chat-form input", "Enter"); B.wait_for_timeout(1200)
        A.evaluate("() => window.__lw.zeige('chat')"); A.wait_for_timeout(500)
        check("Hallo Paul" in A.inner_text(".chat-list"), "Chat B → A")
        # Start durch B (darf steuern)
        B.click("#sim-play"); B.wait_for_timeout(1200)
        check("Pause" in A.inner_text("#sim-play"), "B startet die Simulation beim Host")
        B.click("#sim-play"); B.wait_for_timeout(1000)
        # Adresse durch B -> Vorschläge bei A
        B.evaluate("() => window.__lw.zeige('einsatz')"); B.wait_for_timeout(200)
        adrB = B.locator(".lw-panel[data-panel=einsatz] .mask .addr input").nth(1); adrB.fill("Krems"); B.wait_for_timeout(700)
        B.click(".lw-panel[data-panel=einsatz] .mask .addr-list:not([hidden]) .addr-item >> nth=0"); B.wait_for_timeout(2500)
        A.evaluate("() => window.__lw.zeige('einsatz')"); A.wait_for_timeout(300)
        check(A.locator(".sugg-row").count() > 0, f"Vorschläge bei A nach Adresse von B ({A.locator('.sugg-row').count()})")
        # Ping
        A.wait_for_timeout(6000)
        A.click("#btn-spiel"); A.wait_for_timeout(11000)
        pingtxt = A.inner_text(".spieler-tab")
        check(" ms" in pingtxt, "Ping sichtbar: " + pingtxt.replace(chr(10)," ")[:90])
        A.click(".dlg-foot >> text=Schließen")
        # Rechte entziehen
        A.click("#btn-spiel"); A.wait_for_timeout(300)
        A.locator(".spieler-tab tr:has-text('Max') input[type=checkbox]").nth(0).uncheck(); A.wait_for_timeout(800)
        A.click(".dlg-foot >> text=Schließen")
        B.evaluate("() => window.__lw.zeige('einsatz')"); B.wait_for_timeout(200)
        B.fill(".lw-panel[data-panel=einsatz] .mask textarea >> nth=0", "Test"); B.locator(".lw-panel[data-panel=einsatz] .mask textarea >> nth=0").blur(); B.wait_for_timeout(1200)
        toasts = " | ".join(B.locator(".toast").all_inner_texts())
        check("Keine Berechtigung" in toasts, "Ohne Recht abgelehnt: " + toasts[:80])
        A.click("#btn-spiel"); A.locator(".spieler-tab tr:has-text('Max') input[type=checkbox]").nth(0).check(); A.wait_for_timeout(500); A.click(".dlg-foot >> text=Schließen")
        # Host-Abbruch
        relay.kick("A"); B.wait_for_timeout(800)
        check(B.locator(".host-weg:not([hidden])").count() == 1, "B: Hinweis Host getrennt")
        B.screenshot(path=f"{S}/shots4/mp_host_weg.png")
        A.wait_for_timeout(3000)
        check(B.locator(".host-weg:not([hidden])").count() == 0, "Host verbindet neu, Hinweis weg bei B")
        # Client-Abbruch und Rückkehr
        relay.kick("B"); A.wait_for_timeout(500)
        check("Entwurf" in A.inner_text(".el-liste"), "Host: Einsatz von Max als Entwurf")
        A.evaluate("() => 0"); A.wait_for_timeout(300); A.click("text=+ Test"); A.wait_for_timeout(2500)
        nA = A.locator(".el-row:has(.el-typ.kt, .el-typ.sek)").count()
        B.evaluate("() => 0"); B.wait_for_timeout(1500)
        check(nA > 0 and B.locator(".el-row:has(.el-typ.kt, .el-typ.sek)").count() == nA, f"KT-Aufträge beim Mitspieler sichtbar ({nA})")
        A.evaluate("() => 0"); B.evaluate("() => 0")
        B.wait_for_timeout(300)
        B.wait_for_timeout(2500)
        check("2 Spieler" in A.inner_text("#btn-spiel"), "B wieder verbunden")
        # Speichern bei B
        B.click("#btn-spiel")
        with B.expect_download() as dl: B.click(".spiel >> text=Spielstand speichern")
        path = dl.value.path(); size = open(path).read().__len__()
        check(size > 100000, f"B speichert Spielstand ({size//1000} kB)")
        B.click(".dlg-foot >> text=Schließen")
        # Übergabe ohne Trennung: A -> B
        A.click("#btn-spiel"); A.click(".spieler-tab >> text=Zum Host machen"); A.wait_for_timeout(200)
        A.click(".dlg-foot >> text=Übergeben"); A.wait_for_timeout(1500)
        check("Host" in B.inner_text("#btn-spiel") and "Mitspieler" in A.inner_text("#btn-spiel"), f"Übergabe: A={A.inner_text('#btn-spiel')} B={B.inner_text('#btn-spiel')}")
        A.click(".dlg-foot >> text=Schließen")
        # B gibt per Anfrage zurück
        A.click("#btn-spiel"); A.click(".spiel >> text=Host-Rolle anfragen"); A.wait_for_timeout(800)
        B.click(".dlg-foot >> text=Übergeben"); B.wait_for_timeout(1500)
        check("Host" in A.inner_text("#btn-spiel") and "Mitspieler" in B.inner_text("#btn-spiel"), f"Anfrage: A={A.inner_text('#btn-spiel')} B={B.inner_text('#btn-spiel')}")
        A.click(".dlg-foot >> text=Schließen")
        # Host verlässt
        A.click("#btn-spiel"); A.click(".spiel >> text=Spiel verlassen"); A.wait_for_timeout(300)
        if A.locator(".dlg-foot >> text=Spiel verlassen").count(): A.click(".dlg-foot >> text=Spiel verlassen")
        A.wait_for_timeout(800)
        check("verlassen" in B.inner_text(".host-weg"), "B: Host hat verlassen")
        B.click(".host-weg >> text=Als Host übernehmen"); B.wait_for_timeout(1500)
        check("Host" in B.inner_text("#btn-spiel"), "B ist neuer Host: " + B.inner_text("#btn-spiel"))
        check(B.locator(".el-row:has(.el-typ.rd)").count() == 1, "Einsatz bleibt bei B erhalten")
        B.screenshot(path=f"{S}/shots4/mp_b_host.png")
        b.close()
finally:
    srv.terminate()
print("\n".join(logs[:20]))
print("Relay-Log:", relay.log[-12:])
print(f"{fails} Fehler")
