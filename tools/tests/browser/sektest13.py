import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8782", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
J = "window.__lw.sim"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type == "error" and "404" not in m.text and "glyph" not in m.text.lower() and "sprite" not in m.text.lower() else None)
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8782/?debug"); A.wait_for_timeout(1500)
        # ab v0.74: echte KT-/SEK-Codes kommen mit dem eigenen Codesatz (Abfrageschema mit Abschnitt „kt“)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        # Tag, damit der ITH fliegen darf
        A.evaluate(f"() => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(9,0,0,0); s.state.zeit=d.getTime(); }}")
        A.evaluate(f"() => {J}.call('start')"); A.wait_for_timeout(1500); A.evaluate(f"() => {J}.call('pause')")
        print("   Uhrzeit:", A.evaluate(f"() => new Date({J}.state.zeit).toTimeString().slice(0,5)"), A.evaluate(f"() => Object.values({J}.state.fahrzeuge).filter(f=>f.kategorie==='ITH'||f.kategorie==='NAH').map(f=>f.funkrufname+':'+({J}.flugHindernis(f)||'ok')).join(' ')"))
        A.evaluate("() => 0"); A.wait_for_timeout(400)
        check(A.locator(".lw-panel[data-panel=einsatzliste] .pl-chip").count() == 4, "Filter Alle / Notfall / KT / Überstellung")
        check(A.locator(".lw-panel[data-panel=einsatzliste] >> text=+ Neu").is_visible(), "Knopf + Neu sichtbar")
        # 14 Überstellungen erzeugen
        faelle = A.evaluate(f"""async () => {{ const s={J}; const out=[]; for (let i=0;i<14;i++) {{ const k=await s.generiereSek('online'); if(k) out.push([k.d.code, k.d.von.label, k.d.nach.label, k.d.grund, k.d.lage, k.d.sofort]); }} return out; }}""")
        check(len(faelle) >= 12, f"Überstellungen erzeugt: {len(faelle)}")
        for f in faelle: print("   ", f[0].ljust(14), f[1][:34].ljust(34), "→", f[2][:34].ljust(34), "|", f[3][:60], "|", f[4], "SOFORT" if f[5] else "")
        codes = A.evaluate(f"() => ({J}.state.kt||[]).filter(k=>k.d.code && k.d.code.startsWith('SEK')).length")
        check(codes >= 12, f"SEK-Codes vergeben: {codes}")
        # KT-Codes der normalen Aufträge
        kts = A.evaluate(f"""async () => {{ const s={J}; const out=[]; for (let i=0;i<10;i++) {{ const k=await s.generiereKt('online'); if(k) out.push([k.d.code, k.d.von.label.slice(0,25), k.d.nach.label.slice(0,25), k.d.lage, k.d.sofort]); }} return out; }}""")
        for f in kts: print("   KT", f)
        check(all(f[0] and f[0][:3] in ("KTA","KTR","KTx") for f in kts), "KT-Aufträge haben KT-Codes")
        check(not any(f[0] and f[0].startswith("KTx-96") for f in kts), "keine KT-96 Überstellungscodes erzeugt")
        A.click(".lw-panel[data-panel=einsatzliste] .pl-chip >> nth=3"); A.wait_for_timeout(400)
        n = A.locator(".el-row:has(.el-typ.kt, .el-typ.sek)").count()
        check(n >= 12, f"Filter Überstellungen zeigt {n}")
        A.screenshot(path=f"{S}/shots6/liste.png")

        # --- K3: SKTW vorgeschlagen
        kid = A.evaluate(f"""() => {{ const s={J}; const k=(s.state.kt||[]).find(k=>k.d.code && k.d.code.startsWith('SEK-96K')); if(!k) return null; return k.id; }}""")
        A.evaluate(f"(id) => {J}.call('ktSetze', id, {{ code: 'SEK-96K3' }})", kid)
        vs = A.evaluate(f"async (id) => (await {J}.ktVorschlaege(id)).slice(0,4).map(v=>[v.fz.rmTyp, v.ersatz])", kid)
        print("   K3 Vorschläge:", vs)
        check(len(vs)>0 and vs[0][0]=="SKTW" and not vs[0][1], "SEK-96K3: SKTW zuerst")

        # --- D6: Maske, Vorschläge SNAW / Ersatz RTW+NEF
        kid = A.evaluate(f"""() => {{ const s={J}; const k=(s.state.kt||[]).filter(k=>k.d.sek && k.status==='offen')[1]; return k.id; }}""")
        A.evaluate(f"(id) => {J}.call('ktSetze', id, {{ code: 'SEK-96D6', sofort: true }})", kid)
        A.evaluate("(id) => document.querySelectorAll('.kt-row').forEach(r=>0)", kid)
        A.evaluate(f"(id) => {{ }}", kid)
        # öffnen über die Liste: Zeile mit dieser Nummer anklicken
        nummer = A.evaluate(f"(id) => {J}.ktAuftrag(id).nummer", kid)
        A.locator(".el-row:has(.el-typ.kt, .el-typ.sek)", has_text=A.evaluate(f"(id) => {J}.ktAuftrag(id).d.patient.name", kid)).first.click(); A.wait_for_timeout(2500)
        print("   Kopf:", A.inner_text(".lw-panel[data-panel=kt] .mask-head").replace("\n"," | "))
        check("SEK-96D6" in A.inner_text(".lw-panel[data-panel=kt] .mask-head"), "Maske zeigt Code SEK-96D6")
        check("überstellung" in A.inner_text(".kt-mask .kt-zusammen").lower(), "Art: Überstellung")
        A.locator(".kt-mask").screenshot(path=f"{S}/shots6/maske_d6.png")
        vs = A.evaluate(f"async (id) => (await {J}.ktVorschlaege(id)).map(v=>[v.fz.funkrufname, v.fz.rmTyp, v.begleit && v.begleit.funkrufname, v.ersatz, Math.round((v.sekunden||0)/60), v.hinweis])", kid)
        for v in vs[:8]: print("   D6:", v)
        check(any(v[1]=="SNAW" and not v[3] for v in vs), "D6: SNAW als Vorschlag")
        paar = [v for v in vs if v[2] and v[3]]
        check(len(paar)>0, "D6: Ersatz RTW/SRTW + NEF")
        # Paar schicken
        pv = A.evaluate(f"async (id) => {{ const v=(await {J}.ktVorschlaege(id)).find(v=>v.begleit && v.ersatz && {J}.verfuegbar(v.fz)); await {J}.call('ktVormerken', id, v.fz.id, 'neu', v.begleit.id); await {J}.call('ktSchicken', v.fz.id); return [v.fz.id, v.begleit.id]; }}", kid)
        A.wait_for_timeout(500)
        st = A.evaluate(f"([id,f,n]) => {{ const s={J}; const k=s.ktAuftrag(id); return [k.status, k.fz, k.begleit, s.state.fahrzeuge[f].phase, s.state.fahrzeuge[n].phase, s.state.fahrzeuge[n].kt && s.state.fahrzeuge[n].kt.aktiv, s.state.fahrzeuge[f].blaulicht]; }}", [kid]+pv)
        print("   Paar:", st)
        check(st[0]=="unterwegs" and st[2]==pv[1] and st[5], "RTW + NEF unterwegs")
        # --- Heli: ITH für weite Strecke
        hid = A.evaluate(f"""() => {{ const s={J}; const k=(s.state.kt||[]).find(k=>k.d.sek && k.status==='offen' && k.id); return k && k.id; }}""")
        A.evaluate(f"(id) => {J}.call('ktSetze', id, {{ code: 'SEK-96D7-ITH' }})", hid)
        print("   Wetter/Flugverbot:", A.evaluate(f"() => [{J}.state.wetter.lage, {J}.flugverbotJetzt(), {J}.istTag()]"))
        hv = A.evaluate(f"async (id) => (await {J}.ktVorschlaege(id)).slice(0,4).map(v=>[v.fz.funkrufname, v.fz.rmTyp, v.ersatz])", hid)
        print("   D7-ITH:", hv)
        check(len(hv)>0 and hv[0][1] in ("ITH","NAH"), "D7-ITH: Hubschrauber zuerst")
        # laufen lassen
        A.evaluate(f"() => {{ const st = structuredClone(window.__lw.store.settings); st.tempoBeiNotruf = false; window.__lw.store.setSettings(st); {J}.call('setTempo', 30); {J}.call('start'); }}")
        seen=set(); nefSeen=set()
        for i in range(330):
            A.wait_for_timeout(1000)
            r = A.evaluate(f"([id,f,n]) => {{ const s={J}; const k=s.ktAuftrag(id); return [k.status, s.state.fahrzeuge[f].status, s.state.fahrzeuge[n].status]; }}", [kid]+pv)
            seen.add(r[0]); nefSeen.add(r[2])
            if i % 25 == 0: print("   t", i, r)
            if r[0] in ("erledigt","storniert"): break
        A.evaluate(f"() => {J}.call('pause')")
        print("   Status:", seen, "NEF:", nefSeen)
        check("erledigt" in seen, "Notarzt-Überstellung erledigt")
        check("amBO" in nefSeen and "zumZO" in nefSeen, "NEF fährt mit (am Abholort, zum Ziel)")
        prot = A.evaluate(f"(id) => {J}.ktAuftrag(id).protokoll.map(p=>p.text).join(' | ')", kid)
        print("   Protokoll:", prot)

        # --- Abziehen: KTW mit KT ohne Patient
        k2 = A.evaluate(f"async () => {{ const s={J}; const k=await s.generiereKt('online'); const v=(await s.ktVorschlaege(k.id)).find(v=>v.fz.rmTyp==='KTW' && !v.fz.kt && s.verfuegbar(v.fz)); await s.call('ktVormerken', k.id, v.fz.id, 'neu'); await s.call('ktSchicken', v.fz.id); return [k.id, v.fz.id]; }}")
        A.wait_for_timeout(300)
        ab = A.evaluate(f"([k,f]) => {J}.ktAbziehbar({J}.state.fahrzeuge[f])", k2)
        check(ab, "KTW ohne Patient ist abziehbar")

        # --- Neu von Hand: einheitliche Maske, Überstellung ergibt sich aus den Orten
        A.click(".lw-panel[data-panel=einsatzliste] .pl-chip >> nth=0"); A.wait_for_timeout(200)
        A.click(".lw-panel[data-panel=einsatzliste] >> text=+ Neu"); A.wait_for_timeout(800)
        check("krankentransport" in A.inner_text(".kt-mask .kt-titel").lower(), "Neuer Auftrag: Krankentransport")
        check(A.locator(".kt-seg-b", has_text="Dienstfahrt").count()==0, "keine Dienstfahrt mehr")
        nid = A.evaluate(f"() => {J}.state.kt[0].id")
        A.evaluate(f"""(id) => {{ const s={J}; const h=window.__lw.store.list('hospitals'); const o=(x,b)=>({{lat:x.lat,lon:x.lon,label:x.kurzname,khId:x.id,bereich:b}}); return s.call('ktSetze', id, {{ von:o(h[1],'INT'), nach:o(h[0],'KAR') }}); }}""", nid)
        A.wait_for_timeout(800)
        check("überstellung" in A.inner_text(".kt-mask .kt-titel").lower(), "KH → KH: automatisch Überstellung")
        check(A.locator(".kt-abschnitt", has_text="Transport").count()==1 and A.locator(".kt-lbl", has_text="Medizinisch").count()==1, "Überstellung: medizinische Angaben sichtbar")
        A.locator(".kt-mask").screenshot(path=f"{S}/shots6/maske_sek_neu.png")
        # Hotline-Überstellung: Fragen
        hk = A.evaluate(f"async () => {{ const s={J}; for (let i=0;i<20;i++) {{ const k=await s.generiereSek('hotline'); if (k) return k.id; }} return null; }}")
        A.wait_for_timeout(400)
        A.locator(".tel-row.st-klingelt:not(.typ-notruf) .btn.primary").first.click(); A.wait_for_timeout(1800)
        print("   Anrufer:", A.inner_text(".lw-panel[data-panel=abfrage] .anruf-verlauf").split("\n")[-1][:160])
        for t in ["Dringlichkeit", "Sitzen/Liegen", "Übernahme"]:
            row = A.locator(".lw-panel[data-panel=abfrage] .kt-lbl", has_text=t).first
            if row.locator(".frag-knopf").count():
                row.locator(".frag-knopf").first.click(); A.wait_for_timeout(1300)
                print("   ", t, "→", A.inner_text(".lw-panel[data-panel=abfrage] .anruf-verlauf").split("\n")[-1][:140])
        A.locator(".kt-mask").screenshot(path=f"{S}/shots6/maske_hotline.png")
        A.click("[data-act=einstellungen]"); A.click(".es-punkt[data-seite=aufkommen]"); A.wait_for_timeout(600)
        A.click(".auf-modus [data-wert=tabelle]"); A.wait_for_timeout(300)
        check("Überst. / h" in A.inner_text("table.stunden"), "Einstellungen: Spalte Überstellungen")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:25]))
