# Beta 47 (Fehlerliste Paul 12.11.2026): Funk-Quittungen, kein zweiter „mitgehört“-Ruf, Rückruf immer, KT blinken nur bald,
# sofort ohne Termin, „Zusätzlich mitnehmen“ mit Platzprüfung, abgemeldete Fahrzeuge weg, Info-Zeile änderbar,
# stornierte Fahrzeuge grau unten, Besatzung beim Darüberfahren, Abfrage-Zeile bricht um, Trefferliste im SEK-Formular
# Aufruf: python3 beta47test.py <arbeitsordner> <web-build> [bilder-ordner]
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]; BILD = sys.argv[3] if len(sys.argv) > 3 else None
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8947", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
J = "window.__lw.sim"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = ctx.new_page(); logs = []
        A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8947/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => { await window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json()); }")
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate(f"() => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(10,0,0,0); s.state.zeit=d.getTime(); s.settings.rate=0; s.settings.ktAktiv=false; s.funkFestNach=600; s.call('start'); s.call('setTempo', 1); }}")

        # ---- 1) Storno des NEF durch den RTW: NEF fragt „LEO mitgehört“, danach kein zweiter Ruf
        x = A.evaluate(f"""async () => {{ const s={J};
            const e = await s.generiere('kritisch'); s.anrufAnnehmen(e.id); s.anrufBeenden(e.id);
            s.aktualisiere(e.id, {{ adresse: {{ lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }} }});
            const nah = (f) => Math.hypot(f.lat - e.wahr.lat, f.lon - e.wahr.lon);
            const fz = Object.values(s.state.fahrzeuge).filter((f) => f.phase === 'frei' && !f.pilot && s.verfuegbar(f));
            const rtw = fz.filter((f) => f.kategorie === 'RTW').sort((a, b) => nah(a) - nah(b))[0];
            const nef = fz.filter((f) => f.kategorie === 'NEF').sort((a, b) => nah(a) - nah(b))[0];
            s.alarmiere(e.id, [rtw.id, nef.id]);
            return {{ e: e.id, rtw: rtw.id, nef: nef.id, nefName: s.rufname(nef) }}; }}""")
        A.wait_for_timeout(1500)
        A.evaluate(f"(x) => {{ const s={J}; s.naStornoFunk(s.einsatz(x.e), s.state.fahrzeuge[x.rtw], s.state.fahrzeuge[x.nef]); }}", x)
        g = None
        for i in range(120):
            A.wait_for_timeout(500)
            g = A.evaluate(f"(x) => ({J}.state.funkGespraeche || []).find(g => g.einsatzId === x.e && g.an && g.fzId === x.rtw)", x)
            if g and g["status"] == "mithoeren": break
        sp = [s["von"] + ": " + s["text"] for s in (g or {}).get("sprueche", [])]
        print("    Storno-Funk:", json.dumps(sp, ensure_ascii=False))
        check(g and g["status"] == "mithoeren" and "mitgehört" in sp[-1], "NEF fragt im Storno-Spruch, ob LEO mitgehört hat")
        A.wait_for_timeout(4000)
        g = A.evaluate(f"(id) => ({J}.state.funkGespraeche || []).find(g => g.id === id)", g["id"]) if g else None
        zweiter = [s for s in (g or {}).get("sprueche", []) if "Storno durch" in s["text"]]
        check(g and not zweiter, f"kein zweiter Ruf „Storno durch … mitgehört“ ({len(zweiter)})")
        A.evaluate(f"(t) => {J}.funkLeo(t, null, false)", f"LEO verstanden, Storno fürs {x['nefName']}, Ende")
        g = A.evaluate(f"(id) => ({J}.state.funkGespraeche || []).find(g => g.id === id)", g["id"]) if g else None
        check(g and g["status"] == "ende" and "Storno fürs" in g["sprueche"][-1]["text"], f"„LEO verstanden, Storno fürs NEF …, Ende“ beendet das Gespräch ({g and g['status']})")

        # ---- 2) Rückruf ohne aufgenommene Nummer
        r = A.evaluate(f"""async () => {{ const s={J}; const e = await s.generiere('kritisch'); e.telefon = '';
            try {{ s.rueckruf(e.id); return 'ok'; }} catch (x) {{ return String(x.message || x); }} }}""")
        check("Rückrufnummer" not in r, f"Rückruf geht auch ohne eingetragene Nummer ({r})")

        # ---- 3) Info-Zeile („83w B+ A~ // …“) ganz änderbar
        r = A.evaluate(f"""async () => {{ const s={J}; const e = await s.generiere('kritisch'); e.infoAuto = '83w B+ A~'; e.infoRtw = '83w B+ A~ // Hund';
            s.aktualisiere(e.id, {{ infoRtw: '84w B+ A+ // Hund im Garten' }}); return [e.infoRtw, !!e.infoManuell, e.infoAuto]; }}""")
        check(r[0] == "84w B+ A+ // Hund im Garten" and r[1], f"Info-Zeile von Hand geändert, auch der vordere Teil ({r})")

        # ---- 4) KT: sofort ohne Termin anlegen, blinken nur bald, „Zusätzlich mitnehmen“ prüft den Platz
        r = A.evaluate(f"""async () => {{ const s={J}; const k = await s.generiereSek('online'); k.status = 'aufnahme';
            s.ktSetze(k.id, {{ sofort: true, termin: null, abholung: null, zeitVorgabe: null }});
            try {{ s.ktAnlegen(k.id); return s.ktAuftrag(k.id).status; }} catch (x) {{ return String(x.message || x); }} }}""")
        check(r == "offen", f"SEK „sofort“ ohne Termin angelegt ({r})")
        r = A.evaluate(f"""async () => {{ const s={J}; const morgen = s.state.zeit + 20 * 3600e3;
            const a = await s.generiereKt('online'); s.ktSetze(a.id, {{ abholung: morgen, termin: null, sofort: false }});
            const b = await s.generiereKt('online'); s.ktSetze(b.id, {{ abholung: s.state.zeit + 30 * 60e3, termin: null, sofort: false }});
            for (const k of [a, b]) if (s.ktAuftrag(k.id).status === 'aufnahme') s.ktAnlegen(k.id);
            window.__lw.panelZeigen('einsatzliste'); await new Promise(r => setTimeout(r, 1500));
            const neu = [...document.querySelectorAll('.k-Einsatzliste .ez.neu')].map(x => x.innerText.replace(/\\s+/g, ' '));
            const hm = (t) => new Date(t).toTimeString().slice(0, 5); const nr = (k) => k.nummer;
            return {{ spaet: neu.some(t => t.includes(hm(s.ktAuftrag(a.id).d.abholung))), bald: neu.some(t => t.includes(hm(s.ktAuftrag(b.id).d.abholung))), n: neu.length, st: [s.ktAuftrag(a.id).status, s.ktAuftrag(b.id).status], nr: [nr(a), nr(b)], neu: neu.map(t => t.slice(0, 40)) }}; }}""")
        check(not r["spaet"] and r["bald"], f"nur die KT der nächsten Stunde blinkt ({r})")
        r = A.evaluate(f"""async () => {{ const s={J};
            const a = await s.generiereKt('online'); s.ktSetze(a.id, {{ lage: 'liegend', abholung: s.state.zeit + 3600e3, termin: null, sofort: false, infektion: false }});
            const von = s.ktAuftrag(a.id).d.von, nach = s.ktAuftrag(a.id).d.nach;
            const b = await s.generiereKt('online'); s.ktSetze(b.id, {{ von, nach, lage: 'liegend', abholung: s.state.zeit + 3600e3, termin: null, sofort: false, infektion: false }});
            const c = await s.generiereKt('online'); s.ktSetze(c.id, {{ von, nach, lage: 'sitzend', abholung: s.state.zeit + 3600e3, termin: null, sofort: false, infektion: false, begleitung: false }});
            for (const k of [a, b, c]) if (s.ktAuftrag(k.id).status === 'aufnahme') s.ktAnlegen(k.id);
            const ktw = (await s.ktVorschlaege(a.id)).find(x => x.fz.rmTyp === 'KTW' && !x.ersatz && !x.fz.kt).fz;
            await s.ktVormerken(a.id, ktw.id, 'neu', null);
            return {{ liegend: s.ktSammelGrund(b.id, ktw.id), sitzend: s.ktSammelGrund(c.id, ktw.id), ktw: ktw.id, b: b.id, c: c.id }}; }}""")
        check(r["liegend"] and "Liegeplatz" in r["liegend"] and r["sitzend"] is None, f"Platzprüfung: zweiter Liegend-Patient geht nicht, Sitzend schon ({r['liegend']} / {r['sitzend']})")
        # Maske: bei vollem Fahrzeug ist „Zusätzlich mitnehmen“ ausgegraut und „Als nächste Fahrt“ gewählt
        A.evaluate("(id) => { window.__lw.sel.waehle('kt', id); window.__lw.panelZeigen('kt'); }", r["b"]); A.wait_for_timeout(3000)
        print("    Zeilen:", A.evaluate("() => [...document.querySelectorAll('.ew-maske .lz')].slice(0, 8).map(z => z.innerText.replace(/\\s+/g, ' ').slice(0, 50))"))
        zeile = A.locator(".ew-kt .lz.vz", has_text=A.evaluate(f"(id) => {J}.state.fahrzeuge[id].funkrufname", r["ktw"])).first
        if zeile.count():
            print("    Zeile:", zeile.inner_text().replace("\n", " ")[:80])
            (zeile.evaluate('z => z.click()') if ' gew' not in (zeile.get_attribute('class') or '') else None); A.wait_for_timeout(800)
            if BILD: A.screenshot(path=f"{BILD}/b47_klick.png")
            print("    gewählt:", A.evaluate("() => [...document.querySelectorAll('.ew-maske .lz.gew, .ew-maske .lz.on, .ew-maske .lz[aria-selected=true]')].map(z => z.innerText.slice(0, 30))"), A.evaluate("() => document.querySelector('.ew-maske .wie, .ew-maske [aria-label=\"Wann fährt es\"]')?.outerHTML?.slice(0, 200)"))
            segs = A.evaluate("() => [...document.querySelectorAll('.ew-kt .wie .seg')].map(x => [x.innerText.trim(), x.className, x.title])")
            print("    Wann fährt es:", segs)
            sam = [s for s in segs if "Zusätzlich" in s[0]]
            na = [s for s in segs if "nächste" in s[0]]
            check(sam and " aus" in sam[0][1] and "Liegeplatz" in sam[0][2] and na and " on" in na[0][1], "voll: „Zusätzlich mitnehmen“ ausgegraut mit Grund, „Als nächste Fahrt“ gewählt")
            if BILD: A.screenshot(path=f"{BILD}/b47_sammel_voll.png")
        else:
            check(False, "KTW in der KT-Maske gefunden")
        A.evaluate("(id) => { window.__lw.sel.waehle('kt', id); window.__lw.panelZeigen('kt'); }", r["c"]); A.wait_for_timeout(1500)
        zeile = A.locator(".ew-kt .lz.vz", has_text=A.evaluate(f"(id) => {J}.state.fahrzeuge[id].funkrufname", r["ktw"])).first
        if zeile.count():
            (zeile.evaluate('z => z.click()') if ' gew' not in (zeile.get_attribute('class') or '') else None); A.wait_for_timeout(800)
            segs = A.evaluate("() => [...document.querySelectorAll('.ew-kt .wie .seg')].map(x => [x.innerText.trim(), x.className])")
            sam = [s for s in segs if "Zusätzlich" in s[0]]
            check(sam and " on" in sam[0][1], f"Platz frei: „Zusätzlich mitnehmen“ ist vorausgewählt ({segs})")

        # ---- 5) abgemeldete Fahrzeuge fallen aus den KT-Vorschlägen
        r = A.evaluate(f"""async () => {{ const s={J}; const k = await s.generiereKt('online');
            const f = Object.values(s.state.fahrzeuge).find(f => f.rmTyp === 'KTW' && s.verfuegbar(f) && !f.kt);
            f.ausserDienst = true; f.status = 'abgemeldet';
            const v = await s.ktVorschlaege(k.id); const drin = v.some(x => x.fz.id === f.id);
            f.ausserDienst = false; f.status = 'freiWache'; return drin; }}""")
        check(r is False, "abgemeldetes Fahrzeug wird nicht vorgeschlagen")

        # ---- 6) stornierte Fahrzeuge im Einsatz grau und unten, Besatzung beim Darüberfahren
        A.evaluate(f"(x) => {{ const s={J}; window.__lw.sel.waehle('einsatz', x.e); window.__lw.panelZeigen('einsatzmaske'); }}", x); A.wait_for_timeout(1500)
        zeilen = A.evaluate("() => [...document.querySelectorAll('.ew-maske .alarmiert .fz')].map(z => [z.querySelector('.nr')?.innerText, z.className, getComputedStyle(z).backgroundColor])")
        print("    alarmiert:", zeilen)
        weg = [z for z in zeilen if " weg" in z[1]]
        check(weg and zeilen[-1][1].find(" weg") >= 0, "storniertes NEF grau hinterlegt und ganz unten")
        nr = A.locator(".ew-maske .alarmiert .fz .nr").first
        if nr.count():
            nr.hover(); A.wait_for_timeout(300)
            sicht = A.evaluate("() => { const v = document.querySelector('.ew-maske .alarmiert .fz .nr:hover ~ .vcrew'); return v ? getComputedStyle(v).display + ' ' + v.innerText.replace(/\\s+/g, ' ') : 'keins'; }")
            check(sicht.startswith("flex") and len(sicht) > 5, f"Besatzung beim Darüberfahren über ein alarmiertes Fahrzeug ({sicht})")
            if BILD: A.screenshot(path=f"{BILD}/b47_alarmiert.png")

        # ---- 7) Abfrage: lange Live-Zeile bricht um; SEK-Formular: Trefferliste der Ortssuche
        r = A.evaluate(f"""async () => {{ const s={J}; const k = await s.generiereSek('hotline'); s.ktAnrufAnnehmen(k.id); window.__lw.panelZeigen('abfrage'); return k.id; }}""")
        A.wait_for_timeout(2500)
        feld = A.locator(".a-form .ff", has_text="Wohin").first.locator(".ff-ein")
        if not feld.count(): feld = A.locator(".a-form .ff-ort .ff-ein").nth(1)
        feld.fill("AKH"); A.wait_for_timeout(1500)
        tr = A.evaluate("""() => [...document.querySelectorAll('.a-form .ff-ort .treffer')].slice(0, 3).map(t => { const a = t.children[0].getBoundingClientRect(); const b = t.children[1].getBoundingClientRect(); return [Math.round(a.width), Math.round(b.left - a.right)]; })""")
        print("    Treffer (Breite Name, Abstand):", tr)
        check(tr and all(w > 120 and d >= 0 for w, d in tr), "Trefferliste im Formular: Name breit, nichts überlappt")
        if BILD and A.locator(".a-form .ff-ort .treffer").count(): A.locator(".a-form .ff-ort", has=A.locator(".treffer")).first.screenshot(path=f"{BILD}/b47_sek_treffer.png")
        lang = "Ja also der Patient liegt auf der Station und braucht dringend einen Transport ins andere Krankenhaus weil wir hier keine Möglichkeit haben das weiter zu behandeln und der Oberarzt hat gesagt es eilt"
        A.evaluate("(t) => { const k = window.__lw.sim.state.kt.find(k => k.anruf && k.anruf.status === 'aktiv'); k.anruf.gespraech.push({ von: 'anrufer', text: t, zeit: window.__lw.sim.state.zeit, live: true }); window.__lw.sim.notify?.(); window.__lw.sim.emit?.(); }", lang)
        A.wait_for_timeout(1200)
        m = A.evaluate("""() => { const l = [...document.querySelectorAll('.k-Abfrage .msg')].pop(); if (!l) return null; const r = l.getBoundingClientRect(); return [l.className, Math.round(r.height), l.scrollWidth <= l.clientWidth + 1]; }""")
        print("    letzte Blase:", m)
        check(m and m[1] > 30 and m[2], "lange Anrufer-Zeile bricht in der Blase um")
        if BILD: A.locator(".k-Abfrage .fe").first.screenshot(path=f"{BILD}/b47_abfrage.png")

        print("\n".join(logs[:5])); check(not logs, "keine Fehler auf der Seite")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
