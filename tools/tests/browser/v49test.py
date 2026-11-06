# v0.49: Öffnungszeiten je Ort, Tag/Nacht je Fall, Ausnahme „auch wenn zu“, KTs aus Einrichtungen
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8834", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
GEN = """async ([t, n]) => { const L = window.__lw; const s = L.sim; s.state.zeit = new Date(t).getTime(); const out = [];
  for (let i = 0; i < n; i++) { const e = await s.generiere(['stabil','dringend','kritisch'][i % 3]); const w = e?.wahr.abfrage; if (!w) continue;
    out.push({ vorlage: w.szenario?.vorlage ?? null, kat: w.szenario?.ortKat ?? null, ortArt: w.szenario?.ortArt ?? null, stelle: w.szenario?.stelle ?? '', zu: !!(w.szenario?.ortKat && !L.zeiten.katOffen(w.szenario.ortKat, s.state.zeit)) }); }
  return out; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8834/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        z = A.evaluate("""() => { const Z = window.__lw.zeiten; const t = (x) => new Date(x).getTime(); return {
            disco_fr23: Z.offenUm('Fr-Sa 22-5', t('2026-10-23T23:00')), disco_sa3: Z.offenUm('Fr-Sa 22-5', t('2026-10-24T03:00')), disco_mo3: Z.offenUm('Fr-Sa 22-5', t('2026-10-26T03:00')),
            schule_di: Z.katOffen('volksschule', t('2026-10-20T10:00')), schule_feiertag: Z.katOffen('volksschule', t('2026-10-26T10:00')), schule_so: Z.katOffen('volksschule', t('2026-10-25T10:00')),
            ostermontag: Z.istFeiertag(new Date('2027-03-29T12:00')), bahnhof_nacht: Z.katOffen('bahnhof', t('2026-10-25T03:00')),
            kt_heim_so: Z.katKtOffen('pflegeheim', t('2026-10-25T10:00')), kt_heim_di: Z.katKtOffen('pflegeheim', t('2026-10-20T10:00')) }; }""")
        check(z["disco_fr23"] and z["disco_sa3"] and not z["disco_mo3"], f"Disco Fr/Sa 22–5 über Mitternacht ({z})")
        check(z["schule_di"] and not z["schule_feiertag"] and not z["schule_so"] and z["ostermontag"], "Schule werktags, nicht am Nationalfeiertag/Sonntag; Ostermontag erkannt")
        check(z["bahnhof_nacht"] and not z["kt_heim_so"] and z["kt_heim_di"], "Bahnhof 24 h; Pflegeheim-KT nur werktags")
        # Sonntag 3 Uhr: keine Fälle an geschlossenen Orten (außer Ausnahme)
        r = A.evaluate(GEN, ["2026-10-25T03:00", 60])
        zu = [x for x in r if x["zu"] and x["vorlage"] not in ("parkbank", "rauferei", "rauferei_betrunken", "betrunken_bewusstlos", "festival_drogen", "demenz_aufgefunden", "jugend_betrunken", "polizei_platzwunde")]
        check(len(r) > 30 and not zu, f"Sonntag 3 Uhr: kein Fall an einem geschlossenen Ort ({len(r)} Fälle, {zu[:3]})")
        check(not any(x["vorlage"] in ("bahnhof_stiege", "museum_sturz", "tierpark_biss") for x in r), "Tag-Fälle kommen nachts nicht")
        r2 = A.evaluate(GEN, ["2026-10-20T10:00", 60])
        kats = sorted(set(x["kat"] for x in r2 if x["kat"]))
        check(len(r2) > 30 and len(kats) >= 3, f"Dienstag 10 Uhr: Fälle an vielen Orten ({kats})")
        # KTs aus Einrichtungen
        kt = A.evaluate("""async ([t]) => { const s = window.__lw.sim; s.state.zeit = new Date(t).getTime(); const out = []; for (let i = 0; i < 60; i++) { const k = await s.generiereKt('online'); if (k) out.push([k.d.von?.label ?? '', k.d.nach?.label ?? '']); } return out; }""", ["2026-10-20T08:00"])
        heim = [x for x in kt if any(w in (x[0] + x[1]) for w in ("Pflege", "Senior", "Betreu", "PBZ", "Haus", "Reha", "Dr.", "Ordination"))]
        check(len(heim) >= 5, f"Dienstag früh: KTs auch aus Pflegeheimen/Reha/Praxis ({len(heim)}/{len(kt)}: {heim[:3]})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
