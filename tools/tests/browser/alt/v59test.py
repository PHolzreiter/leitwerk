# v0.59: Spielstände-Ordner (Übersicht, speichern, umbenennen, löschen, importieren, laden), einheitliche Startseite, neue Einstellungs-Gliederung mit Suche
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8853", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_page(viewport={"width": 1600, "height": 950})
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8853/?debug&start"); A.wait_for_timeout(3500)
        # --- Startseite einheitlich
        segs = A.evaluate("() => [...document.querySelectorAll('.st .st-seg:not(.st-arten)')].map(s => [s.dataset.seg, Math.round(s.getBoundingClientRect().height), getComputedStyle(s).borderRadius])")
        check(len(segs) == 5 and len({x[1] for x in segs}) == 1 and len({x[2] for x in segs}) == 1, f"alle Schalter gleich hoch und rund: {segs}")
        labs = A.evaluate("() => [...document.querySelectorAll('.st-karte-cfg .st-feld')].map(f => { const l = f.querySelector('label').getBoundingClientRect(); const c = f.lastElementChild.getBoundingClientRect(); return c.top >= l.bottom - 1; })")
        check(all(labs) and len(labs) == 5, f"überall Beschriftung oben ({labs})")
        th = A.evaluate("() => { const t = document.querySelector('.st-thema').getBoundingClientRect(), k = document.querySelector('.st-karte-cfg').getBoundingClientRect(); return [Math.round(t.right), Math.round(k.right), t.bottom <= k.top]; }")
        check(abs(th[0] - th[1]) <= 2 and th[2], f"Hell/Dunkel/System rechtsbündig über der Konfiguration {th}")
        mk = A.evaluate("() => { const m = document.querySelector('.st-holo').getBoundingClientRect(), k = document.querySelector('.st-karte-cfg').getBoundingClientRect(); return [Math.round(m.top), Math.round(k.top)]; }")
        check(abs(mk[0] - mk[1]) < 90, f"NÖ-Karte auf Höhe 'Simulation konfigurieren' {mk}")
        ka = A.evaluate("() => { const r = [...document.querySelectorAll('.st-kachel')].map(k => k.getBoundingClientRect()); const c = document.querySelector('.st-rechts').getBoundingClientRect(); return [r.length, Math.round(r[r.length-1].right), Math.round(c.right)]; }")
        check(ka[0] == 6 and abs(ka[1] - ka[2]) <= 2, f"6 Kacheln über die ganze Breite {ka}")
        A.click('.st-seg[data-seg="aufkommen"] button[data-v="stressig"]'); A.wait_for_timeout(600)
        sch = A.evaluate("() => { const s = document.querySelector('.st-seg[data-seg=aufkommen]'); const i = s.querySelector('.st-seg-i').getBoundingClientRect(), b = s.querySelector('button.an').getBoundingClientRect(); return Math.abs(i.left - b.left) < 2 && Math.abs(i.width - b.width) < 2; }")
        check(sch, "Schieber gleitet zur Auswahl")
        check(A.locator(".st-check-p").count() >= 5, "Bereitschafts-Check kompakt mit Symbolen")
        # --- Spiel starten und speichern
        A.click(".st-start"); A.wait_for_timeout(1500)
        A.evaluate("() => { window.__lw.sim.call('generiere'); window.__lw.sim.call('generiere'); }"); A.wait_for_timeout(800)
        A.click("#btn-spiel"); A.wait_for_timeout(500)
        A.click("text=Spielstand speichern …"); A.wait_for_timeout(500)
        check(A.locator(".lw-ss-name").count() == 1 and "NÖ-03" in A.input_value(".lw-ss-name"), "Speichern: Name vorgeschlagen")
        A.fill(".lw-ss-name", "Testspiel Krems"); A.keyboard.press("Enter"); A.wait_for_timeout(800)
        check(A.locator(".lw-ss").count() == 0, "Speichern-Fenster geht zu")
        A.click("text=Spielstand speichern …"); A.wait_for_timeout(400); A.fill(".lw-ss-name", "Testspiel Krems"); A.keyboard.press("Enter"); A.wait_for_timeout(800)
        A.keyboard.press("Escape"); A.wait_for_timeout(300)
        A.evaluate("() => document.querySelectorAll('.dlg-overlay').forEach(x => x.remove())")
        # --- Übersicht
        A.click("#steuerleiste .brand"); A.wait_for_timeout(1200)
        A.click('.st [data-act="laden"]'); A.wait_for_timeout(1000)
        titel = A.evaluate("() => [...document.querySelectorAll('.lw-ss-eintrag .lw-ss-titel b')].map(x => x.textContent)")
        check("Testspiel Krems" in titel and "Testspiel Krems (2)" in titel, f"beide Spielstände in der Übersicht (doppelter Name bekommt (2)): {titel}")
        chips = A.inner_text('.lw-ss-eintrag[data-datei="Testspiel Krems.leitwerk"] .lw-ss-chips')
        check("NÖ-03" in chips and "Einsätze" in chips and "Spielzeit" in chips, f"Infos: {chips!r}")
        A.screenshot(path=f"{S}/v59_ss_liste.png")
        # umbenennen
        A.click('.lw-ss-eintrag[data-datei="Testspiel Krems (2).leitwerk"] [data-a="umbenennen"]'); A.wait_for_timeout(200)
        A.fill(".lw-ss-umbenennen", "Nachtdienst"); A.keyboard.press("Enter"); A.wait_for_timeout(600)
        titel = A.evaluate("() => [...document.querySelectorAll('.lw-ss-eintrag .lw-ss-titel b')].map(x => x.textContent)")
        check("Nachtdienst" in titel and "Testspiel Krems (2)" not in titel, f"umbenannt: {titel}")
        # suchen
        A.fill(".lw-ss-suche input", "nacht"); A.wait_for_timeout(200)
        check(A.locator(".lw-ss-eintrag").count() == 1, "Suche in den Spielständen")
        A.fill(".lw-ss-suche input", ""); A.wait_for_timeout(200)
        # löschen
        A.click('.lw-ss-eintrag[data-datei="Nachtdienst.leitwerk"] [data-a="loeschen"]'); A.wait_for_timeout(300)
        A.click(".dlg-foot .btn.danger, .dlg-foot .btn.primary"); A.wait_for_timeout(800)
        check(A.locator('.lw-ss-eintrag[data-datei="Nachtdienst.leitwerk"]').count() == 0, "gelöscht")
        # importieren
        roh = A.evaluate("async () => (await window.__lw.spielstaende.lesen('Testspiel Krems.leitwerk'))")
        pfad = f"{S}/import_test.leitwerk"; open(pfad, "w").write(roh)
        open(f"{S}/kaputt.leitwerk", "w").write("hallo")
        with A.expect_file_chooser() as fc: A.click('[data-a="import"]')
        fc.value.set_files(pfad); A.wait_for_timeout(1000)
        check(A.locator('.lw-ss-eintrag[data-datei="import_test.leitwerk"]').count() == 1, "Import landet im Ordner")
        with A.expect_file_chooser() as fc: A.click('[data-a="import"]')
        fc.value.set_files(f"{S}/kaputt.leitwerk"); A.wait_for_timeout(800)
        check(A.locator('.lw-ss-eintrag[data-datei="kaputt.leitwerk"]').count() == 0, "keine fremden Dateien importiert")
        # laden
        n0 = A.evaluate("() => window.__lw.sim.state.einsaetze.length")
        A.evaluate("() => window.__lw.sim.reset()")
        A.click('.lw-ss-eintrag[data-datei="import_test.leitwerk"] [data-a="laden"]'); A.wait_for_timeout(1500)
        n1 = A.evaluate("() => window.__lw.sim.state.einsaetze.length")
        check(n1 == n0 and n1 >= 1 and A.locator(".lw-ss").count() == 0 and A.locator(".st").count() == 0, f"Spielstand geladen ({n1} Einsätze), Startseite zu")
        # --- Einstellungen: Gliederung und Suche
        A.click('#steuerleiste [data-act="einstellungen"]'); A.wait_for_timeout(800)
        seiten = A.evaluate("() => [...document.querySelectorAll('.es-punkt')].map(b => b.dataset.seite)")
        for sid in ["aufkommen", "ki", "alarmierung", "krankenhaus", "zeiten", "wetter", "farben"]:
            check(sid in seiten, f"Seite {sid}")
        A.click('.es-punkt[data-seite="alarmierung"]'); A.wait_for_timeout(400)
        check(A.locator(".set-rendezvous").is_visible() and A.locator("text=Toleranz für besser passende").is_visible(), "Rendezvous und Stufen-Zuordnung gemeinsam unter Alarmierung")
        A.click('.es-punkt[data-seite="krankenhaus"]'); A.wait_for_timeout(400)
        check(A.locator(".kh-grund").count() >= 1 and A.locator("text=Dialyse-Patienten").is_visible(), "Krankenhäuser und Daueraufträge beisammen")
        A.click('.es-punkt[data-seite="aufkommen"]'); A.wait_for_timeout(400)
        check(A.locator(".auf-stufe").is_visible() and A.locator(".auf-svg").is_visible(), "Aufkommen-Stufe und Grafik auch im Spiel")
        check(A.locator(".es-seitenkopf h2:visible").first.inner_text() == "Einsatzaufkommen", "Seitenkopf mit Titel")
        # alle bisherigen Einstellungen noch da?
        alle = ["Komplikationen", "Transportverweigerung", "Anrufer mit falscher Adresse", "Rückruf auch ohne", "ACN-Einsätze", "Einsätze in Nachbarzonen", "Quelle", "Einsätze aus dem Fallkatalog", "Bestrahlungs-Patienten", "Chemotherapie-Patienten", "Grundbelegung", "Sondersignal", "Verortung richtig bis", "Echtes Wetter", "NAH Reisegeschwindigkeit", "Jahreszeit", "Ausrückzeiten"]
        txt = A.evaluate("() => document.querySelector('.es-q-simulation').textContent")
        fehlt = [x for x in alle if x not in txt]
        check(not fehlt, f"keine Einstellung verloren (fehlt: {fehlt})")
        # Suche
        for q, erwartet in [("dunkel", "Farbschema"), ("groesse", "Größe der Oberfläche"), ("rendezvous", "Rendezvous RTW – NEF"), ("stressig", "Aufkommen"), ("mikrofon", "Mikrofon"), ("dialyse", "Dialyse-Patienten")]:
            A.fill(".es-suche", q); A.wait_for_timeout(350)
            t = A.evaluate("() => [...document.querySelectorAll('.es-treffer-z b')].map(x => x.textContent)")
            check(any(erwartet in x for x in t[:5]), f"Suche '{q}' findet '{erwartet}' (oben: {t[:4]})")
        A.fill(".es-suche", "dialyse"); A.wait_for_timeout(300); A.keyboard.press("Enter"); A.wait_for_timeout(900)
        print("   ", A.evaluate("() => [document.querySelectorAll('.es-blink').length, document.querySelector('.es-punkt.aktiv')?.dataset.seite, document.querySelector('.es-treffer').hidden]"))
        check(A.locator(".es-blink").count() >= 1 and A.locator('.es-punkt.aktiv[data-seite="krankenhaus"]').count() == 1, "Enter springt zur Einstellung und hebt sie hervor")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
