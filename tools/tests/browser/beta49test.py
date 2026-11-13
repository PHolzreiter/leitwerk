# Beta 49 (Paul 13.11.2026): Sonderanrufer in der Abfrage – „Wer ruft an?“ wählt das Kapitel (überstimmbar),
# Gesundheitshotline (LowCode), Pistenrettung (SCHI), Feuerwehr/Berg-/Wasserrettung (42B7/42C7), automatische
# Unfallmeldung (Ansage + Ortung, Stille „…“, Fehlalarm), „-Polizei“ nur wenn die Polizei anruft, Arbeitsunfall,
# nie NAH-Codes, keine „Weitergabe“-Codes in Fällen und Listen (außer 34), Fahrzeuge-Fenster-Spalten.
# Aufruf: python3 beta49test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8949", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

CODE = """(x) => { const lw = window.__lw; const S = lw.store.schema; const k = x.kap; const e = lw.schemaFkt.bestimmeCode(S, k, x.a); return e ? e.code : null; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1600, "height": 1000}); logs = []
        A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8949/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => { await window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json()); }")
        A.evaluate("() => { const s = window.__lw.sim; const d = new Date(s.state.zeit); d.setHours(10, 0, 0, 0); s.state.zeit = d.getTime(); s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.rate = 0; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")

        # ---- 1) „Wer ruft an?“
        r = A.evaluate("() => { const S = window.__lw.store.schema; return S.globale_fragen.phase_3_was_ist_passiert.find((f) => f.id === 'anrufer').optionen.map((o) => o.wert + '=' + o.label); }")
        print("    Wer ruft an?", r)
        werte = [x.split("=")[0] for x in r]
        check(werte == ["1", "2", "3", "einrichtung", "hotline", "piste", "polizei", "ls", "system"], "„Wer ruft an?“ mit allen Sonderanrufern")
        r = A.evaluate("""() => { const S = window.__lw.store.schema; const f = window.__lw.schemaFkt.kapitelFuerAnrufer; return ['einrichtung','hotline','piste','polizei','ls','system','2'].map((w) => { const x = f(S, w); return x ? x.kapitel + ':' + JSON.stringify(x.vor) : null; }); }""")
        check(r == ['33:{"anforderer":"normal"}', '33:{"anforderer":"ecn","anzahl_patienten":"1"}', '33:{"anforderer":"schi"}', "38:{}", '42:{"von":"org"}', "34:{}", None], f"Kapitel je Anrufer {r}")

        # ---- 2) Kapitel 33: keine Frage „Wer fordert an?“, kein Telefonarzt/141, kein Hubschrauber
        r = A.evaluate("""() => { const S = window.__lw.store.schema; const K = S.kapitel['33']; const anf = K.fragen.find((f) => f.id === 'anforderer'); const g = K.fragen.find((f) => f.id === 'grund');
            const sicht = (a) => window.__lw.schemaFkt.fragenImAblauf(S, '33', a).map((x) => x.frage.id);
            return { anf: anf.optionen.map((o) => o.wert), grund: g.optionen.map((o) => o.wert), normal: sicht({ anforderer: 'normal' }), ecn: sicht({ anforderer: 'ecn' }), schi: sicht({ anforderer: 'schi', schi_anf: 'transport' }) }; }""")
        print("    33 normal:", r["normal"]); print("    33 ECN:", r["ecn"]); print("    33 SCHI:", r["schi"])
        check("telemed" not in r["anf"] and "141" not in r["anf"] and "nah" not in r["grund"], "kein Telefonarzt, kein 141, kein Hubschrauber-Grund")
        check("anforderer" not in r["normal"] and "grund" in r["normal"] and "bw" in r["normal"] and "at" in r["normal"], "Einrichtung: wach, atmet, Grund – „Wer fordert an?“ kommt nicht")
        check("ecn_anf" in r["ecn"] and "ecn_symptome" in r["ecn"] and "grund" not in r["ecn"] and "dringlichkeit" not in r["ecn"], "Hotline: „Was wird angefordert?“ + Symptome")
        check("schi_anf" in r["schi"] and "dringlichkeit" in r["schi"] and "transportart" in r["schi"] and "grund" not in r["schi"], "Pistenrettung: Was wird angefordert? → Dringlichkeit, Transportart")

        faelle = [
            ("ECN ohne", "33", {"anforderer": "ecn", "ecn_anf": "ohne", "bw": "ja", "at": "normal"}, "RD-33O3-LowCode"),
            ("ECN sofort", "33", {"anforderer": "ecn", "ecn_anf": "sofort", "bw": "getruebt", "at": "normal"}, "RD-33A3-LowCode"),
            ("ECN Geräte", "33", {"anforderer": "ecn", "ecn_anf": "geraete", "bw": "ja", "at": "abnorm"}, "RD-33B3-LowCode"),
            ("ECN Notarzt", "33", {"anforderer": "ecn", "ecn_anf": "na", "bw": "ja", "at": "normal"}, "RD-33C7-LowCode"),
            ("SCHI ohne gehend", "33", {"anforderer": "schi", "schi_anf": "transport", "dringlichkeit": "ohne", "transportart": "gehend", "bw": "ja", "at": "normal"}, "RD-33O1-SCHI"),
            ("SCHI ohne sitzend", "33", {"anforderer": "schi", "schi_anf": "transport", "dringlichkeit": "ohne", "transportart": "sitzend", "bw": "ja", "at": "normal"}, "RD-33O2-SCHI"),
            ("SCHI ohne liegend", "33", {"anforderer": "schi", "schi_anf": "transport", "dringlichkeit": "ohne", "transportart": "liegend", "bw": "ja", "at": "normal"}, "RD-33O3-SCHI"),
            ("SCHI sofort sitzend", "33", {"anforderer": "schi", "schi_anf": "transport", "dringlichkeit": "sofort", "transportart": "sitzend", "bw": "ja", "at": "normal"}, "RD-33A2-SCHI"),
            ("SCHI sofort liegend", "33", {"anforderer": "schi", "schi_anf": "transport", "dringlichkeit": "sofort", "transportart": "liegend", "bw": "ja", "at": "normal"}, "RD-33A3-SCHI"),
            ("SCHI Geräte sitzend", "33", {"anforderer": "schi", "schi_anf": "transport", "dringlichkeit": "geraete", "transportart": "sitzend", "bw": "ja", "at": "normal"}, "RD-33B2-SCHI"),
            ("SCHI Geräte liegend", "33", {"anforderer": "schi", "schi_anf": "transport", "dringlichkeit": "geraete", "transportart": "liegend", "bw": "getruebt", "at": "normal"}, "RD-33B3-SCHI"),
            ("SCHI Notarzt", "33", {"anforderer": "schi", "schi_anf": "na", "bw": "getruebt", "at": "normal"}, "RD-33C7-SCHI"),
            ("Einrichtung Notarzt", "33", {"anforderer": "normal", "grund": "na", "bw": "ja", "at": "normal"}, "RD-33C7"),
            ("Einrichtung Transport", "33", {"anforderer": "normal", "grund": "transport", "dringlichkeit": "sofort", "transportart": "liegend", "bw": "ja", "at": "normal"}, "RD-33A3"),
            ("Feuerwehr RTW", "42", {"mittel": "rtw"}, "RD-42B7"),
            ("Feuerwehr Notarzt", "42", {"mittel": "na"}, "RD-42C7"),
        ]
        for name, kap, a, soll in faelle:
            ist = A.evaluate(CODE, {"kap": kap, "a": a})
            check(ist == soll, f"{name}: {ist} (soll {soll})")
        r = A.evaluate("""() => { const S = window.__lw.store.schema; const f = S.kapitel['33'].fragen.find((x) => x.id === 'transportart'); const o = window.__lw.schemaFkt.optionenFuer;
            return [o(f, { anforderer: 'schi', dringlichkeit: 'sofort' }).map((x) => x.wert), o(f, { anforderer: 'schi', dringlichkeit: 'ohne' }).map((x) => x.wert), o(f, { anforderer: 'normal', dringlichkeit: 'sofort' }).map((x) => x.wert)]; }""")
        check(r[0] == ["sitzend", "liegend"] and r[1] == ["gehend", "sitzend", "liegend"] and "rollstuhl" in r[2], f"Pistenrettung: gehend nur ohne Dringlichkeit, kein Rollstuhl {r}")
        r = A.evaluate("() => window.__lw.store.schema.kapitel['42'].fragen.map((f) => f.id + ':' + (f.optionen || []).map((o) => o.wert).join('/'))")
        check(r == ["von:ls/org", "mittel:rtw/na"], f"42: nur RTW oder Notarzt {r}")

        # ---- 3) gesperrte Codes: NAH, TELEMED, 141, alte 42er, Weitergabe (außer 34)
        r = A.evaluate("""() => { const S = window.__lw.store.schema; const g = (c) => window.__lw.schemaFkt.codeGesperrt(S, c); const l = new Set(window.__lw.schemaFkt.allCodes().map((c) => c.code));
            const w = Object.entries(S.codes).filter(([, v]) => v.kategorie === 'Weitergabe').map(([c]) => c);
            return { nah: ['RD-33C7-NAH', 'RD-42C6-NAH'].map(g), tel: ['RD-33C7-TELEMED', 'RD-33A3-141'].map(g), alt42: ['RD-42C6', 'RD-42B6', 'RD-42A6'].map(g), weiter: w.filter((c) => !g(c)), inListe: w.filter((c) => l.has(c)), c34: g('RD-34O1'), ok: ['RD-42B7', 'RD-42C7', 'RD-33C7-LowCode', 'RD-33O1-SCHI'].map(g) }; }""")
        print("    gesperrt:", r)
        check(all(r["nah"]) and all(r["tel"]) and all(r["alt42"]), "NAH-, Telefonarzt-/141- und alte 42er-Codes gesperrt")
        check(r["weiter"] == ["RD-34O1"] and r["inListe"] == ["RD-34O1"] and not r["c34"], f"Weitergabe gesperrt außer 34O1 ({r['weiter']})")
        check(not any(r["ok"]), "42B7/42C7/LowCode/SCHI erlaubt")

        # ---- 4) Polizei: Kennung nur, wenn die Polizei anruft; Arbeitsunfall nur bei Trauma
        r = A.evaluate("""() => { const S = window.__lw.store.schema; const b = window.__lw.schemaFkt.bestimmeCode; const a = { verletzte: 'ja', grossunfall: 'nein', mechanismus: 'nein', hohe_geschw: 'nein', gefahrgut: 'nein', eingeklemmt: 'nein', blutung_stark: 'nein', andere_gefahren: 'nein', gering: 'nein', anrufer_selbst: 'nein', anzahl: '1', anzahl_patienten: '1', bw: 'ja', at: 'normal' };
            return [b(S, '29', a).code, b(S, '29', { ...a, anrufer: 'polizei' }).code, b(S, '29', { ...a, anrufer: '2' }).code]; }""")
        check("Polizei" not in r[0] and r[1].endswith("-Polizei") and "Polizei" not in r[2], f"VU: -Polizei nur bei Anrufer Polizei {r}")
        r = A.evaluate("""() => { const S = window.__lw.store.schema; return Object.entries(S.kapitel).filter(([, K]) => K.fragen.some((f) => f.id === 'arbeitsunfall')).map(([k]) => k); }""")
        print("    Arbeitsunfall in Kapiteln:", r)
        check("17" in r and "29" in r and "30" in r and "10" not in r and "6" not in r, "Arbeitsunfall nur bei Trauma (Sturz, VU, Verletzung …, nicht Brustschmerz/Atemnot)")
        r = A.evaluate("""() => { const S = window.__lw.store.schema; const z = Object.values(S.kapitel).flatMap((K) => Object.values(K.zusatzkennungen || {}).flat()); const f = S.kapitel['27'].fragen.find((x) => x.id === 'polizei'); return [z.filter((c) => /-(Polizei|NAH|TELEMED|141|LowCode|SCHI)$/.test(c)), f ? JSON.stringify(f.anzeigen_wenn) : null]; }""")
        check(not r[0] and r[1] and "__nie" in r[1], f"keine Polizei-/NAH-Zusatzkennung mehr zum Wählen, „Polizei-Kennung setzen?“ (27) nie gefragt {r}")
        r = A.evaluate("() => { const pn = window.__lw.sim.partnerNoetig; return null; }")

        # ---- 5) Abfrage im Spiel: Anrufer wählt Kapitel automatisch, überstimmen bleibt
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e = await s.generiereFall('hotline_fieber', 'A'); s.anrufAnnehmen ? 0 : 0; e.anruf.status = 'aktiv'; e.anruf.angenommenVon = null;
            s.abfrageSetze(e.id, 'anrufer', 'hotline'); const a1 = { k: e.anruf.kapitel, auto: e.anruf.kapitelAuto, anf: e.anruf.antworten.anforderer };
            s.abfrageSetze(e.id, 'ecn_anf', 'ohne'); const c1 = e.anruf.ergebnis && e.anruf.ergebnis.code;
            s.abfrageSetze(e.id, 'anrufer', 'polizei'); const a2 = { k: e.anruf.kapitel, auto: e.anruf.kapitelAuto, anf: e.anruf.antworten.anforderer };
            s.abfrageSetze(e.id, 'kapitel', '26'); s.abfrageSetze(e.id, 'anrufer', 'system'); const a3 = { k: e.anruf.kapitel, auto: e.anruf.kapitelAuto };
            return { a1, c1, a2, a3, wahr: e.wahr.code }; }""")
        print("    Abfrage:", r)
        check(r["a1"]["k"] == "33" and r["a1"]["auto"] and r["a1"]["anf"] == "ecn", "Hotline → Kapitel 33 automatisch, Anforderer ECN")
        check(r["c1"] == "RD-33O3-LowCode", f"… Liegendtransport ohne Dringlichkeit → {r['c1']}")
        check(r["a2"]["k"] == "38" and r["a2"]["anf"] is None, "Anrufer geändert auf Polizei → Kapitel 38, Vorbelegung weg")
        check(r["a3"]["k"] == "26" and not r["a3"]["auto"], "selbst gewähltes Kapitel bleibt beim Anruferwechsel")
        check(r["wahr"] in ("RD-33O3-LowCode", "RD-33A3-LowCode"), f"Fall hotline_fieber/A ergibt LowCode ({r['wahr']})")

        # ---- 6) Fälle: alle neuen Fälle ergeben ihren Code (privates Schema)
        r = A.evaluate("""async () => { const s = window.__lw.sim; const out = {}; const F = window.__lw.faelle.alleFaelle(true).filter((f) => /^(ecall_|hotline_|piste_)/.test(f.id));
            for (const f of F) for (const v of f.varianten) { const c = new Set(); for (let i = 0; i < 4; i++) { const e = await s.generiereFall(f.id, v.id); if (e) c.add(e.wahr.code); } out[f.id + '/' + v.id] = [...c]; } return out; }""")
        for k, v in r.items(): print("     ", k, v)
        soll = {"ecall_auffahrunfall/A": "RD-34A1", "ecall_auffahrunfall/B": "RD-34B1", "ecall_auffahrunfall/C": "RD-34B5", "ecall_mehrere/A": "RD-34B2", "ecall_mehrere/B": "RD-34B3",
                "ecall_stille/A": "RD-34B4", "ecall_stille/B": "RD-34B4", "ecall_ueberschlag/A": "RD-34D1m", "ecall_eingeklemmt/A": "RD-34D1l", "ecall_kollision/A": "RD-34D1j", "ecall_kollision/B": "RD-34D1h",
                "ecall_kollision/C": "RD-34D1i", "ecall_absturz/A": "RD-34D1n", "ecall_lenker_bewusstlos/A": "RD-34D2", "ecall_lenker_bewusstlos/B": "RD-34D3", "ecall_lenker_bewusstlos/C": "RD-34D4",
                "ecall_sos_versehen/A": "RD-34O1", "ecall_uhr_motorrad/A": "RD-34D1k", "ecall_uhr_fehlalarm/A": "RD-34O1", "hotline_atemnot/A": "RD-33B3-LowCode", "hotline_brustschmerz/A": "RD-33C7-LowCode",
                "piste_sturz/A": "RD-33A3-SCHI", "piste_sturz/B": "RD-33O2-SCHI", "piste_sturz/C": "RD-33O1-SCHI", "piste_sturz/D": "RD-33A2-SCHI", "piste_oberschenkel/A": "RD-33B3-SCHI", "piste_oberschenkel/B": "RD-33B2-SCHI", "piste_kollision_na/A": "RD-33C7-SCHI"}
        for k, c in soll.items():
            check(r.get(k) == [c], f"Fall {k} → {r.get(k)} (soll {c})")
        alle34 = set(c for v in r.values() for c in v if c.startswith("RD-34"))
        fehlt = {"RD-34O1", "RD-34A1", "RD-34B1", "RD-34B2", "RD-34B3", "RD-34B4", "RD-34B5", "RD-34D1h", "RD-34D1i", "RD-34D1j", "RD-34D1k", "RD-34D1l", "RD-34D1m", "RD-34D1n", "RD-34D2", "RD-34D3", "RD-34D4"} - alle34
        print("    34er-Codes aus Fällen fehlen:", sorted(fehlt))

        # ---- 7) Anrufer der Sonderfälle: Ansage, Ortung, Stille
        r = A.evaluate("""async () => { const s = window.__lw.sim; const lw = window.__lw; const e = await s.generiereFall('ecall_stille', 'A'); const x = e.wahr.abfrage.anrufer;
            const k = lw.kontakt ? null : null; return { art: x.art, wert: x.anruferWert, meldung: x.meldung, ortung: e.anruf.ortung, kontakt: x.sprachkontakt }; }""")
        print("    eCall-Ansage:", r["meldung"])
        check(r["art"] == "ecall" and r["wert"] == "system" and "Kennzeichen" in r["meldung"] and "automatische Unfallmeldung" in r["meldung"], "eCall: Ansage mit Fahrzeug und Kennzeichen")
        check(r["ortung"] and r["ortung"]["status"] == "fertig" and r["ortung"]["radius"] <= 25, f"eCall: Position kommt automatisch ({r['ortung']})")
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e = await s.generiereFall('ecall_uhr_fehlalarm', 'A'); const x = e.wahr.abfrage.anrufer; return [x.meldung, x.quelle, x.selbst, e.wahr.transport]; }""")
        print("    Uhr-Ansage:", r[0])
        check("Smartwatch" in r[0] and r[1] == "uhr" and r[2] and r[3] is False, "Smartwatch: eigene Ansage, Träger redet selbst, Fehlalarm ohne Transport")
        r = A.evaluate("""async () => { const s = window.__lw.sim; const lw = window.__lw; const e = await s.generiereFall('ecall_stille', 'A'); e.anruf.status = 'aktiv';
            const K = lw.kontext ? lw.kontext(e) : null; if (!K) return 'kein Kontext'; const t = await lw.anruferAntwort(e, K, 'Hallo, hören Sie mich?', undefined); return t; }""")
        check(r == "…", f"niemand antwortet → „…“ ({r})")
        r = A.evaluate("""async () => { const s = window.__lw.sim; const out = []; for (const [f, v] of [['hotline_fieber', 'A'], ['piste_sturz', 'A']]) { const e = await s.generiereFall(f, v); const x = e.wahr.abfrage.anrufer; out.push([x.anruferWert, x.rolle, x.stelle]); } return out; }""")
        print("    Hotline/Piste:", r)
        check(r[0][0] == "hotline" and "1450" not in json.dumps(r) and r[1][0] == "piste", "Hotline ohne „1450“, Pistenrettung als eigener Anrufer")
        r = A.evaluate("""async () => { const s = window.__lw.sim; const out = []; for (let i = 0; i < 6; i++) { const e = await s.generiereFall('ecall_kollision', 'A'); } const F = window.__lw.faelle.alleFaelle(true); return F.filter((f) => /telemed/.test(f.id) || f.anrufer.includes('telemed')).map((f) => f.id); }""")
        check(not r, f"keine Telefonarzt-Fälle mehr ({r})")

        # ---- 8) Fall-Prüfung
        r = A.evaluate("() => window.__lw.faellePruefen()")
        neu = [x for x in (r or []) if any(t in json.dumps(x, ensure_ascii=False) for t in ("ecall_", "hotline_", "piste_"))]
        check(not neu, f"Fall-Prüfung der neuen Fälle ohne Hinweise ({neu[:4]})")

        # ---- 8b) Abfrage-Fenster: ab 10 Antworten Nummer + Enter (Grund der Anforderung hat 10)
        A.evaluate("() => window.__lw.panelZeigen('abfrage')"); A.wait_for_timeout(600)
        eid = A.evaluate("""async () => { const s = window.__lw.sim; for (const e of s.state.einsaetze) if (e.anruf && e.anruf.status !== 'beendet') e.anruf.status = 'beendet';
            const e = await s.generiereFall('hotline_fieber', 'A'); s.anrufAnnehmen(e.id); return e.id; }""")
        A.wait_for_timeout(1200)
        A.evaluate("""(id) => { const s = window.__lw.sim; const e = s.einsatz(id); s.aktualisiere(id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, telefon: '0664 1', zusatz: '-' });
            for (const [k, v] of [['rueckrufnummer', '0664 1'], ['anrufer', 'einrichtung'], ['bw', 'ja'], ['at', 'normal'], ['schilderung', 'Transport'], ['anzahl_patienten', '1'], ['alter', 80], ['geschlecht', 'w']]) s.abfrageSetze(id, k, v); }""", eid)
        A.wait_for_timeout(1200)
        frage = A.evaluate("() => { const t = document.querySelector('.k-Abfrage .fe'); return t ? t.innerText.slice(0, 600) : ''; }")
        check("Nummer eintippen" in frage, f"Grund der Anforderung zeigt „Nummer eintippen, Enter wählt“ ({frage[:200]!r})")
        A.focus(".k-Abfrage section.fe"); A.keyboard.press("1"); A.wait_for_timeout(200); A.keyboard.press("0"); A.wait_for_timeout(300)
        hinweis = A.evaluate("() => document.querySelector('.k-Abfrage .fe').innerText")
        A.keyboard.press("Enter"); A.wait_for_timeout(800)
        r = A.evaluate("(id) => window.__lw.sim.einsatz(id).anruf.antworten.grund", eid)
        check(r == "sturz" and "Nr. 10" in hinweis, f"„1“ „0“ Enter wählt die 10. Antwort ({r})")
        A.evaluate("(id) => { const s = window.__lw.sim; s.anrufBeenden(id); }", eid)

        # ---- 9) Fahrzeuge-Fenster: Status und Fahrtziel in eigenen Spalten, bei jeder Breite und Skalierung
        A.evaluate("() => window.__lw.panelZeigen('fahrzeuge')"); A.wait_for_timeout(800)
        A.evaluate("() => window.__lw.dock.panels.find((p) => p.id === 'fahrzeuge').api.maximize()")
        for zoom in (0.67, 1, 1.25):
            A.evaluate("(z) => { document.documentElement.style.zoom = String(z); }", zoom)
            for breite in (420, 700, 1100, 1500):
                A.set_viewport_size({"width": breite, "height": 900}); A.wait_for_timeout(900)
                r = A.evaluate("""() => { const fe = document.querySelector('.k-Fahrzeuge .fe'); if (!fe) return 'kein Fenster';
                    const z = fe.querySelector('.lz.fzz'); if (!z) return 'keine Zeile'; const l = fe.querySelector('.liste2');
                    const box = (el) => { if (!el) return null; const c = getComputedStyle(el); if (c.display === 'none') return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), c.gridColumnStart]; };
                    return { lay: [...l.classList].find((c) => c.startsWith('lay-')), st: box(z.querySelector('.stx')) || box(z.querySelector('.stz')), o: box(z.querySelector('.ort2')) || box(z.querySelector('.ziel')) }; }""")
                if isinstance(r, str):
                    check(False, f"Fahrzeuge-Fenster {zoom}/{breite}: {r}"); continue
                ueber = r["st"] and r["o"] and not (r["st"][1] <= r["o"][0] + 1 or r["o"][1] <= r["st"][0] + 1)
                check(r["st"] and r["o"] and not ueber and r["st"][2] != r["o"][2], f"Fahrzeuge-Fenster Zoom {zoom}, {breite} px: {r}")
        A.evaluate("() => { document.documentElement.style.zoom = '1'; }")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
sys.exit(1 if fails else 0)
