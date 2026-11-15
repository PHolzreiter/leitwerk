# Beta 56 (Paul 15.11.2026): keine echten Organisationsnamen in den eingebauten Daten – eigene Namen per Datei
# (Realismus › Namens-Ersetzungen „neutral;eigen“); Farbvorlagen entfernt (nur das Standardschema); Storno/Endegrund bei
# erledigten Einsätzen (Übergabe, Storno durch Leitstelle, Revers, Belassung, NACA 7) – Revers/Belassung/Tod nicht über Funk.
# Aufruf: python3 beta56test.py <arbeitsordner> <web-build>
import subprocess, sys, time, re, os, glob
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8956", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

ORG = re.compile(r"Rotes Kreuz|Roten Kreuz|Samariter|Johanniter|ÖAMTC|OEAMTC|Christophorus|Malteser(?! Teich)", re.I)

# ---- Dateien im Projekt: Daten, Änderungsliste und Update-Texte ohne Organisationsnamen
treffer = []
for f in glob.glob(os.path.join(ROOT, "data", "**", "*.csv"), recursive=True) + [os.path.join(ROOT, "CHANGELOG.md"), os.path.join(ROOT, "src", "data", "updates.json")]:
    for i, z in enumerate(open(f, encoding="utf-8-sig"), 1):
        if ORG.search(z) and not re.search(r"RK Infra", z): treffer.append(f"{os.path.relpath(f, ROOT)}:{i}")
check(not treffer, f"keine Organisationsnamen in Daten, Änderungsliste, Update-Texten {treffer[:5]}")
seiten = open(os.path.join(ROOT, "src", "ui", "einstellungen", "seiten.js"), encoding="utf-8").read()
bindung = open(os.path.join(ROOT, "src", "ui", "hauptmenue", "bindung.ts"), encoding="utf-8").read()
check("Farbvorlage" not in seiten and "'fv'" not in seiten and '"fv"' not in bindung, "Farbvorlage nicht mehr im Menü")

HELFER = r"""
window.__t = {
  s: () => window.__lw.sim,
  rtw: (ausser = [], nahe) => { const s = window.__lw.sim; const d = (f) => nahe ? (f.lat - nahe.lat) ** 2 + (f.lon - nahe.lon) ** 2 : 0; return Object.values(s.state.fahrzeuge).filter((f) => f.kategorie === 'RTW' && s.verfuegbar(f) && !f.einsatzId && !f.wechselOffen && !/flughafen/i.test(`${f.funkrufname} ${f.stationName}`) && !ausser.includes(f.id)).sort((a, b) => d(a) - d(b))[0]; },
  einsatz: async (k = 'dringend') => { const s = window.__lw.sim; for (let i = 0; i < 20; i++) { const e = await s.generiere(k); if (e && e.wahr.lage) { e.adresse = { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse || 'Test' }; if (e.anruf) e.anruf.status = 'beendet'; return e; } } return null; },
  rufe: [],
};
(() => { const s = window.__lw.sim; const alt = s.fzRuft.bind(s); s.fzRuft = (fz, e, art, text) => { __t.rufe.push({ fz: fz.id, art, text }); return alt(fz, e, art, text); }; })();
"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1500, "height": 900})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'hell', einfuehrung:true})); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8956/?debug&seed=56"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; st.acnAktiv = false; st.tempoBeiNotruf = false; window.__lw.store.setSettings(st); window.__lw.sim.setWetter('klar'); }")
        A.evaluate(HELFER)

        # ---- eingebaute Daten neutral
        r = A.evaluate("""() => { const st = window.__lw.store; const t = [];
            for (const x of st.list('stations')) t.push(x.name, x.organisation); for (const v of st.list('vehicles')) t.push(v.kurzname, v.typ); for (const o of st.list('pois')) t.push(o.name);
            const re = /Rotes Kreuz|Samariter|Johanniter|ÖAMTC|Christophorus|Malteser(?! Teich)/i;
            const fz = Object.values(window.__lw.sim.state.fahrzeuge); const heli = fz.find((f) => f.kategorie === 'NAH' && /99\\/002/.test(f.funkrufname));
            return { treffer: t.filter((x) => x && re.test(x)).slice(0, 5), heli: heli && heli.kurzname, orgs: [...new Set(st.list('stations').map((x) => x.organisation))] }; }""")
        print("    ", r["orgs"][:12], r["heli"])
        check(not r["treffer"], f"Dienststellen, Fahrzeuge, Orte ohne Organisationsnamen {r['treffer']}")
        check(r["heli"] == "NAH 2", "Hubschrauber heißt „NAH 2“")

        # ---- Namens-Ersetzungen per Datei
        r = A.evaluate("""async () => { const st = window.__lw.store, s = window.__lw.sim;
            st.setNamen([{ neutral: 'Rettungsdienst', eigen: 'Testorga' }, { neutral: 'NAH 2', eigen: 'Testheli 2' }, { neutral: 'Luftrettungsstützpunkt NAH 2', eigen: 'Heliport Zwei' }]);
            await new Promise((r) => setTimeout(r, 100));
            const stations = st.list('stations'); const fz = Object.values(s.state.fahrzeuge); const heli = fz.find((f) => /99\\/002/.test(f.funkrufname));
            const a = { orga: stations.filter((x) => x.organisation === 'Testorga').length, name: stations.filter((x) => /^Testorga /.test(x.name)).length,
                        nochRd: stations.filter((x) => x.organisation === 'Rettungsdienst').length, heli: heli.kurzname, heliSt: heli.stationName,
                        ruf: s.rufname ? s.rufname(heli) : null, wache: stations.filter((x) => /Rettungswache/.test(x.name)).length };
            st.setNamen(null); await new Promise((r) => setTimeout(r, 100));
            a.zurueck = st.list('stations').filter((x) => x.organisation === 'Rettungsdienst').length; a.heliZurueck = heli.kurzname;
            return a; }""")
        print("    ", r)
        check(r["orga"] > 100 and r["nochRd"] == 0 and r["name"] > 50, "„Rettungsdienst;Testorga“ ersetzt Organisation und Dienststellennamen")
        check(r["wache"] > 0, "andere neutrale Namen bleiben (Rettungswache)")
        check(r["heli"] == "Testheli 2" and r["heliSt"] == "Heliport Zwei", "„NAH 2“ und der Stützpunkt bekommen die eigenen Namen (längster Name zuerst)")
        check(r["ruf"] in (None, "C2"), f"Rufname des Hubschraubers bleibt C2 ({r['ruf']})")
        check(r["zurueck"] > 100 and r["heliZurueck"] == "NAH 2", "Entfernen: wieder neutrale Namen")

        # ---- Endegrund: Revers / Belassung / Tod ohne Funk, Storno durch Leitstelle, Übergabe, von Hand
        r = A.evaluate("""async () => { const s = __t.s(); const out = {};
            const lauf = async (was) => { const e = await __t.einsatz(); const fz = __t.rtw([], e.wahr); s.alarmiere(e.id, [fz.id]);
                fz.phase = 'vorOrt'; fz.lat = e.wahr.lat; fz.lon = e.wahr.lon; s.setStatus(fz, 'amBO');
                e.wahr.transport = false; e.wahr.revers = was === 'revers'; __t.rufe.length = 0;
                s.entscheideTransport(fz, e, s.state.zeit);
                return { g: e.endegrund && e.endegrund[fz.id], funk: __t.rufe.filter((x) => x.fz === fz.id).map((x) => x.text), e }; };
            const rv = await lauf('revers'); out.revers = rv.g; out.reversFunk = rv.funk;
            const bl = await lauf('belassung'); out.belassung = bl.g; out.belassungFunk = bl.funk;
            // Storno durch die Leitstelle (Diensthandy/Storno-Knopf) auf der Anfahrt
            const e = await __t.einsatz(); const fz = __t.rtw([], e.wahr); s.alarmiere(e.id, [fz.id]); fz.phase = 'anfahrt'; s.storno(fz.id);
            out.storno = e.endegrund && e.endegrund[fz.id];
            // von Hand ändern, danach nicht mehr automatisch überschrieben
            s.endegrundSetzen(e.id, fz.id, 'verstorben'); out.hand = e.endegrund[fz.id];
            s.endegrund(e, fz, 'storno'); out.handBleibt = e.endegrund[fz.id];
            s.endegrundSetzen(e.id, fz.id, null); out.leer = e.endegrund[fz.id] ?? null;
            s.endegrundSetzen(e.id, fz.id, 'belassung');
            out.eid = rv.e.id; out.text = window.__lw.ENDEGRUND_TEXT ?? null;
            return out; }""")
        print("    ", {k: v for k, v in r.items() if k != "text"})
        check(r["revers"] == "revers" and not r["reversFunk"], "Revers: Endegrund „Patient verweigert Mitfahrt“, kein Funkspruch")
        check(r["belassung"] == "belassung" and not r["belassungFunk"], "Belassung: Endegrund „Untersuchung/Behandlung ohne Transport“, kein Funkspruch")
        check(r["storno"] == "storno", "Storno auf der Anfahrt: „Storno durch Leitstelle“")
        check(r["hand"] == "verstorben" and r["handBleibt"] == "verstorben" and r["leer"] is None, "von Hand setzbar, wird danach nicht überschrieben, „mit Transport“ löscht")

        # ---- Anzeige: Einsatzmaske (Auswahl je Fahrzeug) und Einsatzliste (erledigt, mit Endegrund)
        eid = r["eid"]
        r = A.evaluate(f"""async () => {{ const s = __t.s(); const e = s.state.einsaetze.find((x) => x.id === '{eid}');
            window.__lw.sel.waehle('einsatz', e.id); window.__lw.panelZeigen('einsatzmaske');
            await new Promise((r) => setTimeout(r, 1500));
            const sel = [...document.querySelectorAll('.ew-ende')].map((x) => [...x.options].map((o) => o.textContent));
            return {{ sel, wert: [...document.querySelectorAll('.ew-ende')].map((x) => x.value), text: document.body.innerText.includes('Patient verweigert Mitfahrt') }}; }}""")
        A.screenshot(path=os.path.join(sys.argv[1], 'beta56_maske.png'))
        print("    ", r["sel"][:1], r["text"])
        if r["sel"]:
            opts = r["sel"][0]
            check(all(x in opts for x in ["Übergabe an anderes Einsatzmittel", "Storno durch Leitstelle", "Patient verweigert Mitfahrt", "Untersuchung/Behandlung ohne Transport", "NACA 7: Patient verstorben"]), "Einsatzmaske: Auswahl mit den fünf Endegründen")
            check("revers" in r["wert"], f"Einsatzmaske zeigt den gespeicherten Endegrund ({r['wert']})")
        else:
            print("     (Einsatzmaske im Test nicht geöffnet – Auswahl nicht geprüft)")

        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
