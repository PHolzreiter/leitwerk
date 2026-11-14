# v0.63: Schalter eigene Funkgruppe/alle, Wechsel nur auf der Wache, Vormerken + Anfunken über Dienstzeit, Dienstzeit-Anzeige, ACN-Funkrufnamen
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8861", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_page(viewport={"width": 1600, "height": 950}); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8861/?debug"); A.wait_for_timeout(3500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.funkgruppe = 'NÖ-03'; st.generatorAktiv = false; st.ktAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("() => window.__lw.sim.call('neuesSpiel', new Date('2026-10-26T13:30:00').getTime())"); A.wait_for_timeout(800)
        A.evaluate("() => { window.__lw.sim.call('pause'); window.__lw.panelZeigen('fahrzeuge'); }"); A.wait_for_timeout(1200)
        # --- Schalter
        sw = A.evaluate("() => [...document.querySelector('.fz-fenster:not(.aktive):not(.statuslog) .fz-bereich').querySelectorAll('button')].map(b => b.textContent)")
        check(sw[:2] == ["NÖ-03", "Alle"], f"Schalter NÖ-03 | Alle: {sw}")
        funk = A.evaluate("() => { const sw = document.querySelector('.fz-fenster:not(.aktive):not(.statuslog) .fz-bereich'); let r = sw; while (r && !r.querySelector('b[data-dienstfz]')) r = r.parentElement; return [...r.querySelectorAll('b[data-dienstfz]')].map(b => b.textContent); }")
        n_eigen = len(funk)
        fremd = [f for f in funk if f[:3] in ("52/", "53/", "64/", "65/", "71/", "74/", "77/")]
        check(n_eigen > 50 and not fremd, f"Standard: nur eigene Funkgruppe ({n_eigen} Zeilen, fremde: {fremd[:5]})")
        check(any(f.startswith("99/") for f in funk), "Hubschrauber immer dabei")
        A.evaluate("() => { const sw = document.querySelector('.fz-fenster:not(.aktive):not(.statuslog) .fz-bereich'); let r = sw; while (r && !r.querySelector('b[data-dienstfz]')) r = r.parentElement; sw.querySelectorAll('button')[1].click(); }"); A.wait_for_timeout(600)
        n_alle = A.evaluate("() => { const sw = document.querySelector('.fz-fenster:not(.aktive):not(.statuslog) .fz-bereich'); let r = sw; while (r && !r.querySelector('b[data-dienstfz]')) r = r.parentElement; return r.querySelectorAll('b[data-dienstfz]').length; }")
        check(n_alle > n_eigen + 150, f"Alle: deutlich mehr ({n_eigen} → {n_alle})")
        A.evaluate("() => { const sw = document.querySelector('.fz-fenster:not(.aktive):not(.statuslog) .fz-bereich'); let r = sw; while (r && !r.querySelector('b[data-dienstfz]')) r = r.parentElement; sw.querySelectorAll('button')[0].click(); }"); A.wait_for_timeout(400)
        # --- Anzeige Dienstzeiten
        d = A.evaluate("""() => { const s = window.__lw.sim; const f = (n) => Object.values(s.state.fahrzeuge).find(x => x.funkrufname === n);
          const html = (n) => { const fz = f(n); const r = document.createElement('div'); r.innerHTML = window.__lw.dienstHtml ? window.__lw.dienstHtml(fz) : ''; return r.textContent; };
          return { c2: html('99/002'), c9: html('99/009'), bel: html('52/119'), acn: Object.values(s.state.fahrzeuge).filter(x => x.rmTyp === 'ACN').map(x => x.funkrufname).sort() }; }""")
        print("   ", d)
        check(d["c9"].strip().startswith("◷ ca. ") and d["c9"].strip().endswith(":00"), f"NAH tagsüber: {d['c9']!r}")
        check("24 h" in d["bel"], f"BEL Baden ganze Tage: {d['bel']!r}")
        check(all(not x.endswith("ACN") for x in d["acn"]) and "80/003" in d["acn"], f"ACN ohne Zusatz: {d['acn']}")
        # --- Schichtende unterwegs: kein Abmelden, fährt heim, über Dienstzeit nur vormerken
        r = A.evaluate("""async () => { const s = window.__lw.sim; const fz = Object.values(s.state.fahrzeuge).find(x => x.funkrufname === '52/008');
          // frei unterwegs, 3 km weg
          fz.lat = fz.heim.lat + 0.03; fz.lon = fz.heim.lon; fz.phase = 'frei'; fz.status = 'freiFunk'; fz.fahrt = null; fz.einsatzId = null;
          s.state.zeit = new Date('2026-10-26T14:05:00').getTime(); s.dienstTick(s.state.zeit, true);
          await new Promise(r => setTimeout(r, 1500));
          const nach = { offen: fz.wechselOffen, status: fz.status, phase: fz.phase, aus: !!fz.ausserDienst };
          // Einsatz anlegen und alarmieren → nur vorgemerkt
          s.call('generiere'); await new Promise(r => setTimeout(r, 600));
          const e = s.state.einsaetze[s.state.einsaetze.length - 1];
          e.adresse = e.adresse ?? { label: 'Testort', lat: fz.heim.lat + 0.01, lon: fz.heim.lon };
          const h = s.alarmiere(e.id, [fz.id]);
          const vor = { status: fz.status, ueber: fz.ueberzeitFuer === e.id, hinweis: h.join(' | '), imEinsatz: e.fahrzeuge.includes(fz.id) };
          const antwort = s.funkVerstehen({ fzId: fz.id, funkname: '52/008', einsatzId: null }, 'Könnt ihr noch einen dringenden Einsatz übernehmen?');
          return { nach, vor, antwort, danach: { status: fz.status, einsatz: fz.einsatzId === e.id, ueber: fz.ueberzeitFuer } }; }""")
        print("   ", r)
        check(r["nach"]["offen"] == "ende" and r["nach"]["status"] == "freiFunk" and not r["nach"]["aus"], f"Dienstende unterwegs: nicht abgemeldet, Wechsel offen {r['nach']}")
        check(r["nach"]["phase"] in ("rueckfahrt", "routing"), f"fährt still zur Dienststelle ({r['nach']['phase']})")
        check(r["vor"]["ueber"] and r["vor"]["status"] == "freiFunk" and not r["vor"]["imEinsatz"] and "zuerst anfunken" in r["vor"]["hinweis"], f"Alarmieren über Dienstzeit = nur vormerken {r['vor']}")
        check(r["antwort"] and "übernehmen wir noch" in r["antwort"] and r["danach"]["status"] == "alarmFunk" and r["danach"]["einsatz"], f"nach dem Anfunken alarmiert über Funk {r['danach']} {r['antwort']!r}")
        # --- Wechsel nur auf der Dienststelle: Ankunft → abgemeldet
        r2 = A.evaluate("""async () => { const s = window.__lw.sim; const fz = Object.values(s.state.fahrzeuge).find(x => x.funkrufname === '52/009');
          fz.lat = fz.heim.lat + 0.02; fz.lon = fz.heim.lon; fz.phase = 'frei'; fz.status = 'freiFunk'; fz.fahrt = null; fz.einsatzId = null;
          s.state.zeit = new Date('2026-10-26T16:05:00').getTime(); s.dienstTick(s.state.zeit, true);
          const unterwegs = { offen: fz.wechselOffen, status: fz.status };
          // angekommen
          fz.lat = fz.heim.lat; fz.lon = fz.heim.lon; fz.phase = 'frei'; fz.fahrt = null; fz.status = 'freiWache';
          s.dienstTick(s.state.zeit + 30000, true);
          return { unterwegs, ankunft: { offen: fz.wechselOffen, status: fz.status, aus: !!fz.ausserDienst } }; }""")
        print("   ", r2)
        check(r2["unterwegs"]["status"] != "abgemeldet" and r2["ankunft"]["status"] == "abgemeldet" and r2["ankunft"]["aus"], f"abgemeldet erst auf der Dienststelle {r2}")
        # --- Hinweis in der Liste
        t = A.evaluate("""() => { const s = window.__lw.sim; const f = (n) => Object.values(s.state.fahrzeuge).find(x => x.funkrufname === n);
          const a = f('52/001'); a.wechselOffen = 'wechsel'; const b = f('52/002'); b.wechselOffen = 'ende';
          const t = (fz) => { const r = document.createElement('div'); r.innerHTML = window.__lw.dienstHtml(fz); return r.textContent; };
          return [t(a), t(b)]; }""")
        check("Wechsel ausständig" in t[0] and "Dienstende – fährt heim" in t[1], f"Hinweis in der Liste: {t}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
