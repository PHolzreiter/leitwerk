# Eigene KT-/SEK-Codes des eingebauten LeitWerk-Codesystems (Abschnitt „kt“), über Bedingungen.
# Aufbau (eigene Unterteilung, gewohnte Präfixe und Kapitel):
#   KTR/KTA/KTx-<Kapitel><Art><Lage>[S|A]   Kapitel 90 zum Krankenhaus, 93 Therapie, 95 Heimtransport
#     Art: T Transport, C Chemotherapie, R Strahlentherapie, D Dialyse
#     Lage: 1 gehend, 2 eigener Rollstuhl, 3 sitzend (Tragstuhl), 4 liegend
#     S = SOFORT (ohne Blaulicht), A = nach ambulanter Behandlung
#   SEK-96<Zeit><Art>[-Fahrzeug]   Zeit: G geplant, S sofort (ohne Blaulicht), N mit Blaulicht
#     Art: 1/3/4 Lage (SKTW), 5 Überwachung, 6 Notarzt, 7 Inkubator/Kind
ORGS = [("KTR", "rk"), ("KTA", "asb"), ("KTx", "egal")]
LAGEN = [("1", "gehend", "gehend"), ("2", "rollstuhl", "eigener Rollstuhl"), ("3", "sitzend", "sitzend (Tragstuhl)"), ("4", "liegend", "liegend")]
THERAPIEN = [("C", "chemo", "Chemotherapie"), ("R", "strahlen", "Strahlentherapie"), ("D", "dialyse", "Dialyse")]
KAP = {"90": "90 – Fahrt zum Krankenhaus", "93": "93 – Fahrt zur Therapie", "95": "95 – Heimtransport", "96": "96 – Überstellung"}


def kt_codes():
    out = []

    def c(code, name, kap, **bed):
        out.append({"code": code, "name": name, "kapitel": KAP[kap], "bed": bed})

    for p, org in ORGS:
        for d, lage, lt in LAGEN:
            c(f"{p}-90T{d}", f"Fahrt zum Krankenhaus – {lt}", "90", org=org, fahrt="zum_kh", lage=lage, zeit="geplant")
            c(f"{p}-90T{d}S", f"Einweisung SOFORT – {lt}", "90", org=org, fahrt="zum_kh", lage=lage, zeit="sofort")
        for b, th, tl in THERAPIEN:
            for d, lage, lt in LAGEN:
                c(f"{p}-93{b}{d}", f"Fahrt zur {tl} – {lt}", "93", org=org, fahrt="therapie", therapie=th, lage=lage)
        for d, lage, lt in LAGEN:
            c(f"{p}-95T{d}", f"Entlassung nach Hause – {lt}", "95", org=org, fahrt="heim", therapie="keine", heim="stationaer", lage=lage)
            c(f"{p}-95T{d}A", f"Heimfahrt nach ambulanter Behandlung – {lt}", "95", org=org, fahrt="heim", therapie="keine", heim="ambulant", lage=lage)
        for b, th, tl in THERAPIEN:
            for d, lage, lt in LAGEN:
                c(f"{p}-95{b}{d}", f"Heimfahrt nach {tl} – {lt}", "95", org=org, fahrt="heim", therapie=th, lage=lage)
    ue = dict(fahrt="ueberstellung")
    for d, lage, lt in [("1", "gehend", "gehend"), ("3", "sitzend", "sitzend (Tragstuhl)"), ("4", "liegend", "liegend")]:
        c(f"SEK-96G{d}", f"Überstellung mit SKTW – {lt}", "96", **ue, lage=lage, begleitung="keine", fahrzeug="sktw", zeit="geplant", sondersignal="nein", inkubator="nein")
        c(f"SEK-96S{d}", f"Überstellung SOFORT mit SKTW – {lt}", "96", **ue, lage=lage, begleitung="keine", fahrzeug="sktw", zeit="sofort", sondersignal="nein", inkubator="nein")
    c("SEK-96G5-SRTW", "Überstellung mit Überwachung (SRTW)", "96", **ue, begleitung="monitoring", fahrzeug="srtw", zeit="geplant", sondersignal="nein", inkubator="nein")
    c("SEK-96N5-SRTW", "Dringende Überstellung mit Überwachung (SRTW, Blaulicht)", "96", **ue, begleitung="monitoring", fahrzeug="srtw", zeit="sofort", sondersignal="ja", inkubator="nein")
    c("SEK-96N6-RTW", "Dringende Notarztüberstellung im Rettungsdienst (RTW mit Notarzt)", "96", **ue, begleitung="notarzt", fahrzeug="rtw_na", zeit="sofort", sondersignal="ja", inkubator="nein")
    c("SEK-96G6-SNAW", "Geplante Notarztüberstellung mit SNAW", "96", **ue, begleitung="notarzt", fahrzeug="snaw", zeit="geplant", sondersignal="nein", inkubator="nein")
    c("SEK-96N6-SNAW", "Dringende Notarztüberstellung mit SNAW", "96", **ue, begleitung="notarzt", fahrzeug="snaw", zeit="sofort", sondersignal="ja", inkubator="nein")
    c("SEK-96N6-ITH", "Dringende Notarztüberstellung mit Hubschrauber (ITH)", "96", **ue, begleitung="notarzt", fahrzeug="ith", zeit="sofort", sondersignal="ja", inkubator="nein")
    c("SEK-96N7-RTW", "Dringende Kinder-/Inkubatorüberstellung im Rettungsdienst", "96", **ue, begleitung="notarzt", fahrzeug="rtw_na", zeit="sofort", sondersignal="ja", inkubator="ja")
    c("SEK-96G7-SNAW", "Geplante Kinder-/Inkubatorüberstellung mit SNAW", "96", **ue, begleitung="notarzt", fahrzeug="snaw", zeit="geplant", sondersignal="nein", inkubator="ja")
    c("SEK-96N7-SNAW", "Dringende Kinder-/Inkubatorüberstellung mit SNAW", "96", **ue, begleitung="notarzt", fahrzeug="snaw", zeit="sofort", sondersignal="ja", inkubator="ja")
    c("SEK-96N7-ITH", "Dringende Kinder-/Inkubatorüberstellung mit Hubschrauber (ITH)", "96", **ue, begleitung="notarzt", fahrzeug="ith", zeit="sofort", sondersignal="ja", inkubator="ja")
    return out
