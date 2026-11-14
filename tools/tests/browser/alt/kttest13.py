import subprocess, sys, time, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8780", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type == "error" and "404" not in m.text and "glyph" not in m.text.lower() else None)
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8780/?debug"); A.wait_for_timeout(1500)
        # Codes nicht nötig für KT; Simulation kurz laufen lassen -> Daueraufträge
        A.evaluate("() => { const s=window.__lw.sim; s.settings; }")
        n0 = A.evaluate("() => window.__lw.store.list('hospitals').filter(h=>h.einrichtungen&&h.einrichtungen.length).length")
        check(n0 > 30, f"Krankenhäuser mit Einrichtungen: {n0}")
        A.evaluate("() => window.__lw.sim.call('start')"); A.wait_for_timeout(2500); A.evaluate("() => window.__lw.sim.call('pause')")
        A.wait_for_timeout(4000)
        dauer = A.evaluate("() => (window.__lw.sim.state.kt||[]).filter(k=>k.quelle==='dauer').length")
        check(dauer > 0, f"Daueraufträge angelegt: {dauer}")
        A.evaluate("() => 0"); A.wait_for_timeout(500)
        check(A.locator(".el-row:has(.el-typ.kt, .el-typ.sek)").count() > 0, "KT-Liste zeigt Aufträge")
        # Hotline-Auftrag
        kid = A.evaluate("async () => (await window.__lw.sim.generiereKt('hotline')).id")
        A.wait_for_timeout(700)
        check(A.locator(".tel-row.st-klingelt:not(.typ-notruf)").count() >= 1, "KT-Hotline klingelt in der Liste")
        knr = A.evaluate("(id) => window.__lw.sim.ktAuftrag(id).nummer", kid)
        A.locator(f".tel-row.st-klingelt:not(.typ-notruf):has-text('{knr}') .btn.primary").first.click(); A.wait_for_timeout(1800)
        v = A.inner_text(".lw-panel[data-panel=abfrage] .anruf-verlauf")
        check("Anrufer:" in v, "Anrufer meldet sich: " + v.split("Anrufer:")[-1].strip()[:100])
        A.locator(".lw-panel[data-panel=abfrage] .kt-lbl", has_text="Sitzen/Liegen").locator(".frag-knopf").click(); A.wait_for_timeout(1500)
        print("   Lage-Frage:", A.inner_text(".lw-panel[data-panel=abfrage] .anruf-verlauf").split("\n")[-1][:150])
        # Daten übernehmen wie ein Disponent (aus der Wahrheit) und anlegen
        A.evaluate("(id) => { const s=window.__lw.sim; const k=s.ktAuftrag(id); return s.call('ktSetze', id, JSON.parse(JSON.stringify(k.wahr.d))); }", kid)
        A.wait_for_timeout(600)
        A.click(".lw-panel[data-panel=abfrage] >> text=Auftrag anlegen"); A.wait_for_timeout(900)
        st = A.evaluate("(id) => window.__lw.sim.ktAuftrag(id).status", kid)
        check(st == "offen", "Auftrag angelegt: " + st)
        A.wait_for_timeout(1500)
        nvs = A.locator(".kt-vs").count()
        check(nvs > 0, f"Fahrzeugvorschläge: {nvs}")
        A.locator(".kt-mask").screenshot(path=f"{S}/shots5/kt_maske.png")
        first = A.inner_text(".kt-vs >> nth=0")
        print("   1. Vorschlag:", first.replace("\n"," ")[:160])
        # ab v0.76 wartet ein zu früh eintreffendes Fahrzeug auf die Abholzeit – hier gleich abholbereit
        A.evaluate("(id) => window.__lw.sim.call('ktSetze', id, { abholung: window.__lw.sim.state.zeit + 15 * 60000 })", kid); A.wait_for_timeout(1500)
        A.locator(".kt-vs:has-text('Alarmieren')").first.locator("text=Alarmieren").click(); A.wait_for_timeout(1000)
        info = A.evaluate("(id) => { const s=window.__lw.sim; const k=s.ktAuftrag(id); const f=s.state.fahrzeuge[k.fz]; return [k.status, f && f.funkrufname, f && f.phase, f && f.status]; }", kid)
        check(info[0] == "unterwegs", f"Transport unterwegs: {info}")
        fzid = A.evaluate("(id) => window.__lw.sim.ktAuftrag(id).fz", kid)
        # Sammelfahrt: zweiten (online) Auftrag dazu
        k2 = A.evaluate("async () => (await window.__lw.sim.generiereKt('online')).id")
        A.wait_for_timeout(300)
        r = A.evaluate("([k,f]) => window.__lw.sim.call('ktVormerken', k, f, 'sammel').then(()=> 'ok').catch(e=> String(e.message||e))", [k2, fzid])
        print("   Sammelfahrt:", r)
        # Kapazität: drei liegende sollen scheitern
        # laufen lassen
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.tempoBeiNotruf = false; window.__lw.store.setSettings(st); window.__lw.sim.call('setTempo', 30); window.__lw.sim.call('start'); }")
        seen = set()
        for i in range(240):
            A.wait_for_timeout(1000)
            stx = A.evaluate("(id) => window.__lw.sim.ktAuftrag(id).status", kid)
            if i % 20 == 0: print("   t", i, A.evaluate("(f) => { const s=window.__lw.sim; const x=s.state.fahrzeuge[f]; return [new Date(s.state.zeit).toTimeString().slice(0,5), x.status, x.phase, x.kt && x.kt.halt, x.kt && x.kt.halte.map(h=>h.art+':'+s.ktAuftrag(h.kt).status).join(','), x.kt && x.kt.wartetKt]; }", fzid))
            seen.add(stx)
            if stx in ("erledigt", "storniert"): break
        A.evaluate("() => window.__lw.sim.call('pause')")
        print("   Statusfolge:", seen)
        print("   Fahrzeug danach:", A.evaluate("(f) => { const x=window.__lw.sim.state.fahrzeuge[f]; return [x.status, x.phase, x.kt && x.kt.aktiv]; }", fzid))
        print("   Dauer-Uhrzeiten:", A.evaluate("() => (window.__lw.sim.state.kt||[]).filter(k=>k.quelle==='dauer').slice(0,6).map(k=>new Date(k.d.termin).toTimeString().slice(0,5)+' '+k.d.von.label.slice(0,25)+'→'+k.d.nach.label.slice(0,25))"))
        check("anBord" in seen or "erledigt" in seen or "storniert" in seen, "Patient abgeholt (an Bord/erledigt)")
        prot = A.evaluate("(id) => window.__lw.sim.ktAuftrag(id).protokoll.map(p=>p.text).join(' | ')", kid)
        print("   Protokoll:", prot[:400])
        # Funk-Storno eines neuen Transports
        k3 = A.evaluate("async () => (await window.__lw.sim.generiereKt('online')).id")
        A.wait_for_timeout(300)
        A.evaluate("(id) => window.__lw.sim.ktVorschlaege(id).then(v => { const f=v.find(x=>window.__lw.sim.verfuegbar(x.fz) && !x.fz.kt && x.fz.rmTyp==='KTW'); return window.__lw.sim.call('ktVormerken', id, f.fz.id, 'neu').then(()=>window.__lw.sim.call('ktSchicken', f.fz.id)); })", k3)
        A.wait_for_timeout(600)
        f3 = A.evaluate("(id) => window.__lw.sim.ktAuftrag(id).fz", k3)
        A.evaluate("(f) => window.__lw.sim.call('ktFunkStorno', f)", f3); A.wait_for_timeout(500)
        st3 = A.evaluate("(id) => [window.__lw.sim.ktAuftrag(id).status, window.__lw.sim.ktAuftrag(id).fz]", k3)
        check(st3[0] == "offen" and st3[1] is None, f"Storno über Funk: Auftrag wieder offen {st3}")
        A.screenshot(path=f"{S}/shots5/kt_liste.png")
        A.click("[data-act=einstellungen]"); A.click(".es-punkt[data-seite=aufkommen]"); A.wait_for_timeout(600)
        check(A.locator(".auf-reihe[data-reihe=kt]").count() == 1, "Krankentransporte je Stunde im Aufkommen")
        A.locator(".auf").screenshot(path=f"{S}/shots5/stunden.png")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:25]))
