# Erzeugt das eigene LeitWerk-Codesystem (Codes + Abfrage in einer Datei):
#   python3 tools/leitwerk_codesystem.py data/codesystem/leitwerk_codesystem.json
#
# Alles hier ist eigenständig formuliert (Fragen, Kapitel, Nummern, Codes). Aufbau:
#   Code = KK-Sx-NN  (KK = Kapitel, x = Dringlichkeitsstufe 0–5, NN = laufende Nummer)
#   Zusatz mit Schrägstrich: /L liegt lange am Boden, /M mehrere Betroffene, /A Patient der Witterung
#   ausgesetzt oder schwer erreichbar, /P Polizei verständigt (vom Disponenten markiert)
# Fragen-IDs und Antwortwerte sind die neutralen Merkmale der LeitWerk-Fallgeschichten (z. B. hoehe = boden).
import json
import sys

STUFEN_KAT = {5: "S5 Reanimation", 4: "S4 Notarzt", 3: "S3 Notfall", 2: "S2 Dringend", 1: "S1 Nicht dringend", 0: "S0 Beratung / Weitergabe"}
MANV = "S4 Mehrere Verletzte"

EINSATZSTUFEN = [
    {"stufe": "S5 Reanimation", "rettungsmittel": "RTW-C>RTW>KTW", "nfs_erforderlich": False, "notarzt": "schnellster", "sondersignal": True, "kategorie": "kritisch", "transport_prozent": 70},
    {"stufe": "S4 Notarzt", "rettungsmittel": "RTW-C>RTW>KTW", "nfs_erforderlich": False, "notarzt": "nef", "sondersignal": True, "kategorie": "kritisch", "transport_prozent": 85},
    {"stufe": MANV, "rettungsmittel": "RTW-C>RTW>KTW", "nfs_erforderlich": False, "notarzt": "schnellster", "sondersignal": True, "kategorie": "kritisch", "transport_prozent": 90},
    {"stufe": "S3 Notfall", "rettungsmittel": "RTW-C>RTW>KTW", "nfs_erforderlich": True, "notarzt": "nein", "sondersignal": True, "kategorie": "dringend", "transport_prozent": 80},
    {"stufe": "S2 Dringend", "rettungsmittel": "RTW>KTW>RTW-C", "nfs_erforderlich": False, "notarzt": "nein", "sondersignal": True, "kategorie": "dringend", "transport_prozent": 75},
    {"stufe": "S1 Nicht dringend", "rettungsmittel": "KTW>RTW>RTW-C", "nfs_erforderlich": False, "notarzt": "nein", "sondersignal": False, "kategorie": "stabil", "transport_prozent": 65},
    {"stufe": "S0 Beratung / Weitergabe", "rettungsmittel": "", "nfs_erforderlich": False, "notarzt": "nein", "sondersignal": False, "kategorie": "stabil", "transport_prozent": 0},
]


# ---------------------------------------------------------------- Bausteine
def o(*paare):
    return [{"wert": w, "label": l} for w, l in paare]


JN = o(("ja", "Ja"), ("nein", "Nein"), ("unbekannt", "Weiß nicht"))
JN2 = o(("ja", "Ja"), ("nein", "Nein"))


def F(id, text, opts=None, typ="single", hinweis=None, wenn=None):
    f = {"id": id, "text": text, "typ": typ}
    if opts is not None:
        f["optionen"] = opts
    if hinweis:
        f["hinweis"] = hinweis
    if wenn:
        f["anzeigen_wenn"] = wenn
    return f


def eq(q, *v):
    return {"q": q, "in": list(v)}


def ja(q):
    return eq(q, "ja")


def ge(q, n, unbekannt=True):
    c = {"q": q, "gte": n}
    if not unbekannt:
        c["unbekannt_ist"] = False
    return c


def lt(q, n, unbekannt=False):
    c = {"q": q, "lt": n}
    if not unbekannt:
        c["unbekannt_ist"] = False
    return c


def ALL(*c):
    return {"all": list(c)}


def ANY(*c):
    return {"any": list(c)}


def NOT(c):
    return {"not": c}


def R(wenn, stufe, name, kat=None):
    return ("code", wenn, stufe, name, kat)


def W(wenn, kap, vorbelegung=None):
    return ("wechsel", wenn, kap, vorbelegung)


GETRUEBT = eq("bw", "getruebt")
REAGIERT_NICHT = eq("bw", "nein")


# ---------------------------------------------------------------- Kapitel
KAPITEL = []


def kap(nr, thema, titel, stichworte, fragen, regeln, zusaetze=(), polizei=False, prim=True, ks="04", std=True, hinweis=None):
    KAPITEL.append(dict(nr=nr, thema=thema, titel=titel, stichworte=stichworte, fragen=fragen, regeln=regeln, zusaetze=list(zusaetze), polizei=polizei, prim=prim, ks=ks, std=std, hinweis=hinweis))


REGION = o(("extremitaet", "Arm, Bein, Hand oder Fuß"), ("kopf", "Kopf oder Gesicht"), ("hals_brust", "Hals oder Brustkorb"), ("rumpf", "Bauch, Rücken oder Becken"), ("mehrere", "Mehrere Körperstellen"), ("unbekannt", "Weiß nicht"))
LANG_HER = F("aelter6h", "Ist das Ganze schon mehr als sechs Stunden her?", JN2)

kap("01", "atemnot", "Atemnot", ["Atemnot", "kriegt keine Luft", "Asthma", "schnauft", "COPD"],
    [F("sprachschw", "Kann die Person nur noch einzelne Wörter sagen, weil die Luft fehlt?", JN),
     F("hautfarbe", "Sind Lippen oder Gesicht bläulich oder grau?", JN),
     F("kaltschweiss", "Ist die Person blass und kaltschweißig?", JN),
     F("lungenerkrankung", "Hat die Person eine bekannte Lungenkrankheit?", o(("asthma", "Asthma"), ("copd", "COPD / chronische Bronchitis"), ("andere", "Andere"), ("nein", "Nein / weiß nicht"))),
     F("tracheostoma", "Atmet die Person über eine Kanüle im Hals (Tracheostoma)?", JN)],
    [R(GETRUEBT, 4, "Atemnot mit Bewusstseinsstörung"),
     R(ANY(ja("hautfarbe"), ja("sprachschw")), 4, "Schwere Atemnot (spricht kaum, blau/grau)"),
     R(ja("tracheostoma"), 4, "Atemnot bei Tracheostoma"),
     R(ja("kaltschweiss"), 3, "Atemnot mit Kaltschweiß"),
     R(lt("alter", 6), 3, "Atemnot bei Kleinkind"),
     R(eq("lungenerkrankung", "asthma", "copd"), 3, "Atemnot bei bekannter Lungenkrankheit"),
     R(eq("at", "abnorm", "unbekannt"), 3, "Atemnot"),
     R(None, 2, "Leichte Atembeschwerden")])

kap("02", "brustschmerz", "Brustschmerz", ["Brustschmerz", "Druck auf der Brust", "Engegefühl", "Herzinfarkt"],
    [F("kaltschweiss", "Ist die Person blass und kaltschweißig?", JN),
     F("hautfarbe", "Ist die Haut grau oder bläulich?", JN),
     F("sprachschw", "Fällt das Sprechen wegen Atemnot schwer?", JN),
     F("herz_vg", "Hatte die Person schon einmal einen Herzinfarkt oder ist ein Herzleiden bekannt?", JN),
     F("kokain", "Hat die Person Kokain oder ähnliche Drogen genommen?", JN)],
    [R(GETRUEBT, 4, "Brustschmerz mit Bewusstseinsstörung"),
     R(ANY(ja("kaltschweiss"), ja("hautfarbe"), ja("sprachschw"), eq("at", "abnorm")), 4, "Brustschmerz mit Schockzeichen oder Atemnot"),
     R(ja("kokain"), 4, "Brustschmerz nach Drogenkonsum"),
     R(ja("herz_vg"), 3, "Brustschmerz bei bekanntem Herzleiden"),
     R(ge("alter", 35), 3, "Brustschmerz ab 35 Jahren"),
     R(None, 2, "Brustschmerz unter 35 Jahren")])

kap("03", "bewusstlos", "Kollaps / Ohnmacht", ["umgekippt", "ohnmächtig", "Kollaps", "zusammengebrochen", "bewusstlos"],
    [F("hautfarbe", "Ist die Haut blass, grau oder bläulich?", JN),
     F("herzleiden", "Ist ein Herzleiden bekannt?", JN),
     F("bauchschmerz", "Hat die Patientin Bauchschmerzen?", JN, wenn=ALL(eq("geschlecht", "w"), ge("alter", 12, False), lt("alter", 50)))],
    [R(GETRUEBT, 4, "Kollaps, weiterhin benommen"),
     R(eq("at", "abnorm"), 4, "Kollaps mit Atemproblemen"),
     R(ja("hautfarbe"), 3, "Kollaps, Haut blass/grau"),
     R(ALL(ja("herzleiden"), ge("alter", 35)), 3, "Kollaps bei Herzleiden"),
     R(ja("bauchschmerz"), 3, "Kollaps mit Bauchschmerzen (Frau, gebärfähiges Alter)"),
     R(ge("alter", 35), 3, "Kollaps ab 35 Jahren, wieder wach"),
     R(None, 2, "Kurzer Kollaps, wieder wach")])

kap("04", "stillstand", "Leblose Person / Kreislaufstillstand", ["atmet nicht", "leblos", "tot", "Reanimation", "Herzstillstand"],
    [F("tod", "Ist die Person eindeutig verstorben?", o(("nein", "Nein – Wiederbelebung anleiten"), ("moeglich", "Möglicherweise – Anrufer ist unsicher"), ("offensichtlich", "Ja, eindeutig (kalt, steif o. Ä.)"), ("erwartet", "Erwarteter Tod (schwere Krankheit, Palliativ)"))),
     F("todeszeichen", "Woran erkennt der Anrufer, dass die Person tot ist?", o(("kalt_steif", "Kalt und steif"), ("verwesung", "Verwesung"), ("lange_tot", "Offensichtlich schon lange tot"), ("schwerste_verl", "Verletzungen, die man nicht überleben kann"), ("andere", "Andere / keine Angabe")), wenn=eq("tod", "offensichtlich")),
     F("erwartet_grund", "Warum war der Tod erwartet?", o(("endstadium", "Schwere Krankheit im Endstadium"), ("verfuegung", "Patientenverfügung: keine Wiederbelebung"), ("andere", "Anderer Grund")), wenn=eq("tod", "erwartet")),
     F("unzweifelhaft", "Ist der Anrufer ganz sicher, dass die Person tot ist?", JN, wenn=eq("tod", "offensichtlich", "erwartet")),
     F("ursache_9", "Gibt es einen erkennbaren Grund?", o(("erhaengen", "Erhängen"), ("strangulation", "Strangulation / Würgen"), ("ersticken", "Ersticken"), ("keine", "Nein / nichts erkennbar")), wenn=NOT(eq("tod", "offensichtlich", "erwartet"))),
     F("beobachtet", "Hat jemand gesehen, wie die Person zusammengebrochen ist?", o(("ja", "Ja – beobachtet"), ("nein", "Nein – so aufgefunden"), ("unbekannt", "Weiß nicht")), wenn=NOT(eq("tod", "offensichtlich", "erwartet")))],
    [R(ALL(eq("tod", "offensichtlich"), ja("unzweifelhaft")), 1, "Tod mit sicheren Zeichen – Totenbeschau"),
     R(ALL(eq("tod", "erwartet"), ja("unzweifelhaft")), 1, "Erwarteter Tod – Totenbeschau"),
     R(eq("ursache_9", "erhaengen", "strangulation"), 5, "Kreislaufstillstand nach Erhängen/Strangulation"),
     R(eq("ursache_9", "ersticken"), 5, "Kreislaufstillstand nach Ersticken"),
     R(ALL(eq("at", "keine"), eq("beobachtet", "ja")), 5, "Kreislaufstillstand, beobachtet"),
     R(eq("at", "keine"), 5, "Kreislaufstillstand, aufgefunden"),
     R(eq("at", "agonal"), 5, "Ineffektive Atmung (Schnappatmung)"),
     R(ALL(REAGIERT_NICHT, eq("at", "unbekannt")), 5, "Reagiert nicht, Atmung unklar"),
     R(REAGIERT_NICHT, 4, "Reagiert nicht, atmet"),
     R(None, 4, "Leblose Person – Lage unklar")],
    ks={"weiter_mit_fragen": True}, std=False)

kap("05", "schlaganfall", "Schlaganfall", ["Schlaganfall", "hängender Mundwinkel", "Lähmung", "spricht verwaschen", "Insult"],
    [F("fast_gesicht", "Bitten Sie die Person zu lächeln: Hängt eine Gesichtshälfte?", JN),
     F("fast_arm", "Bitten Sie die Person, beide Arme zu heben: Sinkt einer ab?", JN),
     F("fast_sprache", "Ist die Sprache verwaschen oder findet die Person keine Worte?", JN),
     F("sprachstoerung", "Spricht die Person anders als sonst?", JN),
     F("schwaeche", "Ist eine Körperseite plötzlich schwach oder taub?", JN),
     F("laehmung", "Kann die Person Arm oder Bein einer Seite gar nicht bewegen?", JN),
     F("gleichgewicht", "Hat die Person plötzlich Schwindel oder kann nicht mehr sicher stehen?", JN),
     F("sehen", "Sieht die Person plötzlich doppelt oder schlecht?", JN),
     F("kopfschmerz", "Hat die Person plötzlich sehr starke Kopfschmerzen?", JN),
     F("vg_schlaganfall", "Hatte die Person schon einmal einen Schlaganfall?", JN),
     F("seit", "Wann haben die Beschwerden angefangen?", o(("unter", "Vor weniger als 4½ Stunden"), ("ueber", "Vor mehr als 4½ Stunden"), ("unbekannt", "Weiß nicht (z. B. so aufgewacht)")))],
    [R(GETRUEBT, 4, "Schlaganfall mit Bewusstseinsstörung"),
     R(eq("at", "abnorm"), 4, "Schlaganfall mit Atemproblemen"),
     R(ja("kopfschmerz"), 4, "Schlaganfallzeichen mit plötzlichem Kopfschmerz"),
     R(ALL(ANY(ja("fast_gesicht"), ja("fast_arm"), ja("fast_sprache"), ja("sprachstoerung"), ja("schwaeche"), ja("laehmung")), eq("seit", "unter", "unbekannt")), 3, "Schlaganfall, Beginn unter 4½ Stunden"),
     R(ANY(ja("fast_gesicht"), ja("fast_arm"), ja("fast_sprache"), ja("sprachstoerung"), ja("schwaeche"), ja("laehmung")), 2, "Schlaganfall, Beginn über 4½ Stunden"),
     R(ANY(ja("gleichgewicht"), ja("sehen")), 3, "Plötzlicher Schwindel oder Sehstörung"),
     R(None, 2, "Unklare neurologische Beschwerden")])

kap("06", "krampf", "Krampfanfall", ["Krampfanfall", "Anfall", "Epilepsie", "zuckt", "Fieberkrampf"],
    [F("krampft", "Krampft die Person jetzt noch?", o(("ja", "Ja, länger als 5 Minuten"), ("mehrere", "Mehrere Anfälle hintereinander"), ("nein", "Nein, der Anfall ist vorbei"), ("aura", "Noch nicht – sie spürt einen Anfall kommen"), ("fokal", "Nur ein Körperteil zuckt"))),
     F("atmung_geprueft", "Haben Sie nachgeschaut: Atmet die Person jetzt ruhig und normal?", JN, wenn=eq("krampft", "nein")),
     F("epilepsie", "Ist eine Epilepsie bekannt?", JN),
     F("atypisch", "Ist dieser Anfall anders als sonst?", JN, wenn=ja("epilepsie")),
     F("schwanger", "Ist die Patientin schwanger oder hat vor kurzem entbunden?", JN, wenn=ALL(eq("geschlecht", "w"), ge("alter", 12, False), lt("alter", 50))),
     F("diabetiker", "Ist die Person zuckerkrank?", JN),
     F("vergiftung", "Hat die Person etwas genommen (Drogen, Tabletten, Alkohol)?", JN),
     F("vg_schlaganfall", "Hatte die Person einen Schlaganfall oder einen Hirntumor?", JN)],
    [R(eq("krampft", "ja", "mehrere"), 4, "Anhaltender Krampfanfall oder Anfallsserie"),
     R(ANY(eq("at", "abnorm"), eq("atmung_geprueft", "nein", "unbekannt")), 4, "Nach Anfall, Atmung nicht sicher normal"),
     R(ja("schwanger"), 4, "Krampfanfall in der Schwangerschaft"),
     R(GETRUEBT, 3, "Nach Anfall, noch benommen"),
     R(ja("diabetiker"), 3, "Krampfanfall bei Diabetes"),
     R(ja("vergiftung"), 3, "Krampfanfall nach Substanzeinnahme"),
     R(ja("vg_schlaganfall"), 3, "Krampfanfall nach Schlaganfall/Hirntumor"),
     R(eq("epilepsie", "nein", "unbekannt"), 3, "Erstmaliger Krampfanfall"),
     R(ja("atypisch"), 3, "Krampfanfall, anders als sonst"),
     R(lt("alter", 6), 3, "Krampfanfall bei Kleinkind"),
     R(eq("krampft", "fokal", "aura"), 2, "Beginnender oder örtlicher Anfall"),
     R(None, 2, "Krampfanfall vorbei, Epilepsie bekannt")])

kap("07", "zucker", "Blutzucker", ["Zucker", "Unterzucker", "Diabetes", "Insulin"],
    [F("diabetiker", "Ist die Person zuckerkrank?", JN),
     F("verhalten", "Verhält sich die Person anders als sonst (verwirrt, aggressiv)?", JN),
     F("gewalttaetig", "Ist oder war die Person gewalttätig?", JN)],
    [R(eq("at", "abnorm"), 4, "Blutzuckerentgleisung mit Atemproblemen"),
     R(GETRUEBT, 3, "Blutzuckerentgleisung, benommen"),
     R(ja("gewalttaetig"), 3, "Blutzuckerentgleisung, Person gewalttätig"),
     R(ja("verhalten"), 3, "Blutzuckerentgleisung, verändertes Verhalten"),
     R(None, 2, "Blutzuckerproblem, wach und normal")], polizei=True)

kap("08", "allergie", "Allergische Reaktion", ["Allergie", "Schwellung", "Wespenstich", "Ausschlag", "Quaddeln"],
    [F("ursache", "Was hat die Reaktion ausgelöst?", o(("schwarm", "Viele Stiche (Schwarm)"), ("schlange", "Schlangenbiss"), ("spinne", "Spinne / Skorpion"), ("anderes", "Etwas anderes (Essen, Medikament, Einzelstich)"), ("unbekannt", "Weiß nicht"))),
     F("atem_schluck", "Hat die Person Probleme beim Atmen oder Schlucken?", JN),
     F("sprachschw", "Ist die Stimme heiser oder fällt das Sprechen schwer?", JN),
     F("vorgeschichte", "Hatte die Person schon einmal eine schwere allergische Reaktion?", JN),
     F("symptome", "Hat die Person jetzt Beschwerden (Ausschlag, Schwellung, Juckreiz)?", JN),
     F("medikation", "Wurde schon ein Notfallmedikament genommen?", o(("injektion", "Ja, Notfallspritze"), ("medikamente", "Ja, Tabletten/Tropfen"), ("nein", "Nein"), ("unbekannt", "Weiß nicht")))],
    [R(GETRUEBT, 4, "Allergische Reaktion mit Bewusstseinsstörung"),
     R(ANY(ja("atem_schluck"), ja("sprachschw"), eq("at", "abnorm")), 4, "Allergische Reaktion mit Atem- oder Schluckbeschwerden"),
     R(eq("ursache", "schwarm", "schlange"), 3, "Viele Stiche oder Schlangenbiss"),
     R(ja("vorgeschichte"), 3, "Allergie, früher schwere Reaktion"),
     R(eq("medikation", "injektion"), 3, "Allergie, Notfallspritze gegeben"),
     R(eq("symptome", "nein"), 1, "Allergie, derzeit keine Beschwerden"),
     R(None, 2, "Allergische Reaktion (Haut)")])

kap("09", "bauch", "Bauchschmerzen", ["Bauchschmerzen", "Bauchweh", "Übelkeit", "Koliken"],
    [F("ohnmacht", "War die Person ohnmächtig oder fast ohnmächtig?", JN),
     F("schmerzort", "Wo genau tut es weh?", o(("oberhalb", "Oberbauch (über dem Nabel)"), ("unterhalb", "Unterbauch (unter dem Nabel)"), ("unbekannt", "Ganzer Bauch / weiß nicht"))),
     F("zerreiss", "Ist der Schmerz reißend oder wie zerreißend, bis in den Rücken?", JN),
     F("aneurysma", "Ist eine Erweiterung der Hauptschlagader (Aneurysma) bekannt?", JN),
     F("grau", "Ist die Haut grau oder fahl?", JN)],
    [R(GETRUEBT, 4, "Bauchschmerz mit Bewusstseinsstörung"),
     R(ANY(ja("aneurysma"), ALL(ja("zerreiss"), ge("alter", 50))), 4, "Bauchschmerz, Verdacht auf Gefäßnotfall"),
     R(ja("grau"), 4, "Bauchschmerz mit grauer Haut"),
     R(ALL(ja("ohnmacht"), ge("alter", 50)), 3, "Bauchschmerz mit Ohnmacht ab 50"),
     R(ALL(eq("schmerzort", "oberhalb"), ge("alter", 45)), 3, "Oberbauchschmerz ab 45 Jahren"),
     R(ja("ohnmacht"), 3, "Bauchschmerz mit Ohnmacht"),
     R(None, 2, "Bauchschmerzen")])

kap("10", "ruecken", "Rückenschmerzen", ["Rückenschmerzen", "Hexenschuss", "Kreuzweh"],
    [F("ursache", "Gab es einen Unfall oder Sturz?", o(("nein", "Nein"), ("alt", "Ja, schon länger her (über 6 Stunden)"), ("frisch", "Ja, gerade eben"), ("unbekannt", "Weiß nicht"))),
     F("zerreiss", "Ist der Schmerz reißend, wie zerreißend?", JN),
     F("aneurysma", "Ist eine Erweiterung der Hauptschlagader (Aneurysma) bekannt?", JN),
     F("ohnmacht", "War die Person ohnmächtig oder fast ohnmächtig?", JN),
     F("grau", "Ist die Haut grau oder fahl?", JN)],
    [R(GETRUEBT, 4, "Rückenschmerz mit Bewusstseinsstörung"),
     R(ANY(ja("aneurysma"), ALL(ja("zerreiss"), ge("alter", 50))), 4, "Rückenschmerz, Verdacht auf Gefäßnotfall"),
     R(ja("grau"), 4, "Rückenschmerz mit grauer Haut"),
     R(ja("ohnmacht"), 3, "Rückenschmerz mit Ohnmacht"),
     R(eq("ursache", "frisch"), 2, "Rückenschmerz nach frischem Unfall"),
     R(ge("alter", 50), 2, "Rückenschmerz ab 50 Jahren"),
     R(None, 1, "Rückenschmerzen")])

kap("11", "kopfschmerz", "Kopfschmerzen", ["Kopfschmerzen", "Migräne", "Kopfweh"],
    [F("ploetzlich_stark", "Kam der Schmerz schlagartig und so stark wie nie zuvor?", JN),
     F("sprachstoerung", "Spricht die Person anders als sonst?", JN),
     F("taubheit", "Ist irgendwo ein Taubheitsgefühl?", JN),
     F("laehmung", "Kann die Person einen Arm oder ein Bein nicht richtig bewegen?", JN),
     F("verhalten", "Verhält sich die Person anders als sonst?", JN),
     F("fast_gesicht", "Hängt beim Lächeln eine Gesichtshälfte?", JN, wenn=ANY(ja("sprachstoerung"), ja("taubheit"), ja("laehmung"))),
     F("fast_arm", "Sinkt beim Heben beider Arme einer ab?", JN, wenn=ANY(ja("sprachstoerung"), ja("taubheit"), ja("laehmung"))),
     F("fast_sprache", "Ist die Sprache verwaschen?", JN, wenn=ANY(ja("sprachstoerung"), ja("taubheit"), ja("laehmung"))),
     F("seit", "Wann hat es angefangen?", o(("unter", "Vor weniger als 4½ Stunden"), ("ueber", "Vor mehr als 4½ Stunden"), ("unbekannt", "Weiß nicht")))],
    [R(GETRUEBT, 4, "Kopfschmerz mit Bewusstseinsstörung"),
     R(ja("ploetzlich_stark"), 4, "Schlagartiger, stärkster Kopfschmerz"),
     R(ANY(ja("sprachstoerung"), ja("taubheit"), ja("laehmung"), ja("fast_gesicht"), ja("fast_arm"), ja("fast_sprache")), 3, "Kopfschmerz mit neurologischen Ausfällen"),
     R(ANY(eq("at", "abnorm"), ja("verhalten")), 3, "Kopfschmerz mit Atem- oder Verhaltensänderung"),
     R(None, 1, "Kopfschmerzen")])

kap("12", "herz", "Herzbeschwerden", ["Herzrasen", "Herzstolpern", "Puls", "Defibrillator", "Herzschrittmacher"],
    [F("reanimiert", "Wurde die Person gerade wiederbelebt oder geschockt?", JN),
     F("defi", "Hat ein eingebauter Defibrillator ausgelöst?", JN),
     F("brustschmerz", "Hat die Person Schmerzen in der Brust?", JN),
     F("sprachschw", "Fällt das Sprechen wegen Atemnot schwer?", JN),
     F("hautfarbe", "Ist die Haut grau oder bläulich?", JN),
     F("kaltschweiss", "Ist die Person kaltschweißig?", JN),
     F("herzleiden", "Ist ein Herzleiden bekannt?", JN),
     F("kokain", "Hat die Person Kokain oder ähnliche Drogen genommen?", JN),
     F("puls", "Kennen Sie den Puls?", o(("normal", "Zwischen 50 und 130"), ("langsam", "Unter 50"), ("schnell", "Über 130"), ("unbekannt", "Weiß nicht")))],
    [R(ja("reanimiert"), 4, "Nach Wiederbelebung"),
     R(GETRUEBT, 4, "Herzbeschwerden mit Bewusstseinsstörung"),
     R(ja("defi"), 4, "Eingebauter Defibrillator hat ausgelöst"),
     R(ANY(ja("hautfarbe"), ja("kaltschweiss"), ja("sprachschw"), eq("at", "abnorm")), 4, "Herzbeschwerden mit Schockzeichen oder Atemnot"),
     R(ALL(ja("brustschmerz"), ge("alter", 35)), 3, "Herzbeschwerden mit Brustschmerz"),
     R(eq("puls", "langsam", "schnell"), 3, "Herzbeschwerden, Puls sehr schnell oder langsam"),
     R(ja("kokain"), 3, "Herzbeschwerden nach Drogenkonsum"),
     R(ja("herzleiden"), 3, "Herzbeschwerden bei bekanntem Herzleiden"),
     R(None, 2, "Herzstolpern / Herzrasen, stabil")])

kap("13", "krank", "Kranke Person", ["krank", "Fieber", "schwach", "erbricht", "Schwindel", "fühlt sich schlecht"],
    [F("hauptbeschwerde", "Was ist die Hauptbeschwerde?", o(("fieber", "Fieber / Schüttelfrost"), ("az", "Allgemein schlechter Zustand"), ("schwaeche", "Schwäche"), ("erbrechen", "Erbrechen"), ("uebelkeit", "Übelkeit"), ("schwindel", "Schwindel"), ("schmerzen", "Andere Schmerzen"), ("wasserlassen", "Kann kein Wasser lassen"), ("blutdruck", "Blutdruck zu hoch/niedrig, ohne Beschwerden"), ("transport", "Möchte nur ins Krankenhaus"), ("andere", "Etwas anderes"))),
     F("verwirrt", "Ist die Person verwirrt oder nicht richtig orientiert?", JN),
     F("sonderdiagnose", "Gibt es eine bekannte Krankheit mit Notfallplan (z. B. vom Arzt)?", JN2)],
    [R(GETRUEBT, 3, "Kranke Person, benommen"),
     R(eq("at", "abnorm"), 3, "Kranke Person mit Atembeschwerden"),
     R(ja("verwirrt"), 3, "Kranke Person, verwirrt"),
     R(ja("sonderdiagnose"), 3, "Bekannte Krankheit mit Notfallplan"),
     R(ALL(eq("hauptbeschwerde", "fieber", "az", "schwaeche"), ge("alter", 75, False)), 2, "Kranke Person über 75"),
     R(eq("hauptbeschwerde", "wasserlassen"), 2, "Harnverhalt"),
     R(eq("hauptbeschwerde", "transport"), 1, "Krankentransport gewünscht"),
     R(None, 1, "Kranke Person, stabil")])

kap("14", "infekt", "Infekt / Fieber", ["Grippe", "Husten", "Fieber", "COVID", "Infekt"],
    [F("anz_symptome", "Wie viele Beschwerden hat die Person (Fieber, Husten, Gliederschmerzen …)?", o(("eins", "Eine"), ("mehrere", "Mehrere"))),
     F("brust", "Hat die Person Schmerzen oder Druck in der Brust?", JN),
     F("sprachschw", "Fällt das Sprechen wegen Atemnot schwer?", JN),
     F("hautfarbe", "Sind Lippen oder Gesicht bläulich oder grau?", JN),
     F("hochrisiko", "Gehört die Person zu einer Risikogruppe (sehr alt, schwer vorerkrankt, geschwächtes Immunsystem)?", JN)],
    [R(ja("hautfarbe"), 4, "Infekt mit Blaufärbung"),
     R(GETRUEBT, 3, "Infekt mit Bewusstseinsstörung"),
     R(ANY(ja("sprachschw"), eq("at", "abnorm")), 3, "Infekt mit Atemnot"),
     R(ja("brust"), 3, "Infekt mit Brustschmerzen"),
     R(ja("hochrisiko"), 2, "Infekt bei Risikoperson"),
     R(eq("anz_symptome", "eins"), 0, "Infekt, telefonische Beratung"),
     R(None, 1, "Infekt, stabil")])

kap("15", "psych", "Psychische Krise / Suizidgefahr", ["Suizid", "psychisch", "Selbstmord", "Krise", "droht zu springen"],
    [F("lage", "Was ist die Situation?", o(("kein_suizid", "Psychische Krise, keine Selbstmordgedanken"), ("gedanken", "Äußert Selbstmordgedanken"), ("absicht", "Konkrete Absicht oder Versuch"), ("springen", "Droht zu springen"), ("gesprungen", "Ist gesprungen"), ("erhaengen", "Hat versucht, sich zu erhängen/strangulieren"), ("unbekannt", "Weiß nicht"))),
     F("ubg", "Will die Polizei eine Unterbringung (Zwangseinweisung)?", o(("nein", "Nein"), ("normal", "Ja"), ("dringend", "Ja, dringend"))),
     F("substanzen", "Hat die Person Medikamente, Drogen oder viel Alkohol genommen?", JN),
     F("verwirrt", "Ist die Person verwirrt oder nicht orientiert?", JN),
     F("ploetzlich", "Hat sich das Verhalten plötzlich verändert?", JN),
     F("psych_vorerkrankung", "Ist eine psychische Erkrankung bekannt?", JN),
     F("blutung", "Blutet die Person?", o(("gefaehrlich", "Stark, spritzt"), ("stark", "Stark"), ("schwach", "Leicht"), ("nein", "Nein"), ("unbekannt", "Weiß nicht"))),
     F("gewalt", "Ist die Person gewalttätig?", JN),
     F("waffen", "Hat die Person eine Waffe oder einen gefährlichen Gegenstand?", JN),
     F("selbstverbrennung", "Droht die Person, sich anzuzünden?", JN),
     F("krisenteam", "Reicht ein Gespräch mit dem Krisendienst (keine Verletzung, keine Gefahr)?", JN)],
    [R(GETRUEBT, 4, "Psychische Krise mit Bewusstseinsstörung"),
     R(eq("lage", "erhaengen"), 4, "Nach Strangulationsversuch"),
     R(eq("lage", "gesprungen"), 4, "Nach Sprung aus der Höhe"),
     R(ANY(eq("blutung", "gefaehrlich", "stark"), ja("selbstverbrennung")), 4, "Selbstverletzung mit starker Blutung oder Brandgefahr"),
     R(eq("lage", "springen"), 3, "Droht zu springen"),
     R(ANY(ja("waffen"), ja("gewalt")), 3, "Psychische Krise, gewalttätig oder bewaffnet"),
     R(eq("lage", "absicht"), 3, "Selbstmordversuch oder konkrete Absicht"),
     R(ja("substanzen"), 3, "Psychische Krise nach Substanzeinnahme"),
     R(eq("ubg", "dringend"), 3, "Dringende Unterbringung"),
     R(eq("ubg", "normal"), 2, "Unterbringung"),
     R(ANY(eq("lage", "gedanken"), ja("verwirrt"), ja("ploetzlich")), 2, "Psychische Krise mit Selbstmordgedanken oder Verwirrtheit"),
     R(ja("krisenteam"), 0, "Krisendienst, telefonische Hilfe"),
     R(None, 1, "Psychische Krise")], polizei=True)

kap("16", "vergiftung", "Vergiftung / Überdosis", ["Vergiftung", "Tabletten", "Überdosis", "Drogen", "geschluckt"],
    [F("absicht", "Wie ist es passiert?", o(("absichtlich", "Absichtlich"), ("versehentlich", "Versehentlich (z. B. Kind)"), ("medikationsfehler", "Falsche Medikamente / Dosis"), ("drogen", "Beim Drogenkonsum"), ("unbekannt", "Weiß nicht"))),
     F("substanz", "Was wurde genommen?", o(("opiate", "Opiate (Heroin, Morphin, Fentanyl …)"), ("antidepressiva", "Antidepressiva"), ("kokain", "Kokain / Aufputschmittel"), ("saeure", "Säure oder Lauge"), ("knopfzelle", "Knopfzellenbatterie"), ("andere", "Etwas anderes"), ("unbekannt", "Weiß nicht"))),
     F("viz", "Hat die Vergiftungsinformation geraten, die Rettung zu holen?", JN),
     F("hautfarbe", "Ist die Haut grau oder bläulich?", JN),
     F("aggressiv", "Ist die Person aggressiv?", JN),
     F("waffen", "Gibt es Waffen in der Nähe?", JN)],
    [R(GETRUEBT, 4, "Vergiftung mit Bewusstseinsstörung"),
     R(ANY(eq("at", "abnorm"), ja("hautfarbe")), 4, "Vergiftung mit Atemproblemen"),
     R(eq("substanz", "opiate", "antidepressiva"), 4, "Vergiftung mit gefährlicher Substanz"),
     R(ANY(ja("aggressiv"), ja("waffen")), 3, "Vergiftung, Person aggressiv"),
     R(eq("substanz", "kokain", "saeure", "knopfzelle"), 3, "Vergiftung (Aufputschmittel, Säure/Lauge, Batterie)"),
     R(eq("absicht", "absichtlich"), 3, "Absichtliche Vergiftung"),
     R(ja("viz"), 2, "Vergiftung, Rettung empfohlen"),
     R(None, 2, "Vergiftung, derzeit ohne Beschwerden")], polizei=True)

kap("17", "schwangerschaft", "Schwangerschaft / Geburt", ["Geburt", "Wehen", "schwanger", "Blasensprung", "Fehlgeburt"],
    [F("ssw", "In welcher Schwangerschaftswoche ist die Frau?", typ="zahl", hinweis="Zahl der Woche oder „unbekannt“"),
     F("mehrlinge", "Erwartet sie Zwillinge oder mehr?", JN),
     F("situation", "Was ist die Situation?", o(("fruchtwasser", "Fruchtblase geplatzt, keine Wehen"), ("wehen", "Wehen"), ("unmittelbar", "Starker Pressdrang – Geburt steht bevor"), ("kopf", "Kopf ist zu sehen"), ("fehllage", "Etwas anderes als der Kopf ist zu sehen"), ("geboren", "Baby ist schon da"), ("blutung", "Blutung / drohende Fehlgeburt"), ("bauchschmerz", "Bauchschmerzen ohne Blutung"), ("unbekannt", "Weiß nicht"))),
     F("kompl_baby", "Hat das Baby Probleme (atmet schlecht, blau, schlaff)?", JN, wenn=eq("situation", "geboren")),
     F("kompl_mutter", "Geht es der Mutter schlecht (starke Blutung, benommen)?", JN, wenn=eq("situation", "geboren")),
     F("blutung_stark", "Blutet es stark?", JN),
     F("komplikationen", "Sind Probleme in der Schwangerschaft bekannt?", JN)],
    [R(GETRUEBT, 4, "Schwangerschaft mit Bewusstseinsstörung"),
     R(eq("situation", "fehllage"), 4, "Geburt mit Fehllage"),
     R(ANY(ja("kompl_baby"), ja("kompl_mutter")), 4, "Nach Geburt, Mutter oder Kind in Gefahr"),
     R(ja("blutung_stark"), 4, "Schwangerschaft mit starker Blutung"),
     R(eq("situation", "kopf"), 4, "Geburt im Gange"),
     R(ALL(lt("ssw", 37), eq("situation", "wehen", "unmittelbar", "fruchtwasser")), 4, "Drohende Frühgeburt"),
     R(eq("situation", "unmittelbar"), 3, "Geburt steht unmittelbar bevor"),
     R(eq("situation", "geboren"), 3, "Baby geboren, beiden geht es gut"),
     R(eq("situation", "blutung"), 3, "Blutung in der Schwangerschaft"),
     R(ANY(ja("komplikationen"), ja("mehrlinge")), 3, "Wehen bei Risikoschwangerschaft"),
     R(None, 2, "Wehen / Blasensprung, Geburt nicht unmittelbar")])

kap("18", "sturz", "Sturz", ["gestürzt", "hingefallen", "Leiter", "Stiege", "liegt am Boden"],
    [F("hoehe", "Aus welcher Höhe ist die Person gefallen?", o(("boden", "Ebenerdig / unter 3 Meter"), ("treppe", "Stiege hinunter"), ("gross", "3 bis 10 Meter"), ("extrem", "Über 10 Meter"), ("unbekannt", "Weiß nicht"))),
     F("verletzt", "Ist die Person verletzt?", JN),
     F("region", "Wo ist sie verletzt?", REGION, wenn=ja("verletzt")),
     F("blutung_stark", "Blutet es stark?", JN, wenn=ja("verletzt")),
     F("fehlstellung", "Steht etwas schief oder sieht gebrochen aus?", JN, wenn=ja("verletzt")),
     F("ohnmacht", "War die Person vor oder nach dem Sturz bewusstlos?", JN),
     LANG_HER,
     F("umstand", "Gibt es besondere Umstände?", o(("keine", "Nein"), ("boden_1", "Liegt noch am Boden, unter 1 Stunde"), ("boden_2", "Liegt schon 1–2 Stunden am Boden"), ("boden_3", "Liegt schon über 2 Stunden am Boden"), ("wetter", "Liegt draußen in Kälte, Hitze oder Regen"), ("erschwert", "Schwer erreichbar"), ("oeffentlich", "Liegt auf einem öffentlichen Platz"))),
     F("schwer_pat", "Wiegt die Person deutlich über 120 kg?", JN)],
    [R(GETRUEBT, 4, "Sturz mit Bewusstseinsstörung"),
     R(eq("hoehe", "extrem"), 4, "Sturz aus über 10 Metern"),
     R(eq("hoehe", "gross"), 4, "Sturz aus 3 bis 10 Metern"),
     R(eq("at", "abnorm"), 4, "Sturz mit Atemproblemen"),
     R(eq("region", "hals_brust", "rumpf", "mehrere"), 3, "Sturz mit Verletzung an Rumpf oder mehreren Stellen"),
     R(ja("blutung_stark"), 3, "Sturz mit starker Blutung"),
     R(ja("ohnmacht"), 3, "Sturz mit Bewusstlosigkeit"),
     R(ALL(eq("region", "kopf"), ge("alter", 65)), 3, "Kopfverletzung ab 65 Jahren"),
     R(eq("hoehe", "treppe"), 2, "Sturz über die Stiege"),
     R(ja("fehlstellung"), 2, "Sturz, Knochenbruch möglich"),
     R(ja("aelter6h"), 1, "Sturz vor über 6 Stunden"),
     R(ja("verletzt"), 2, "Sturz mit Verletzung"),
     R(None, 1, "Sturz ohne Verletzung (braucht Hilfe)")],
    zusaetze=[("/L", eq("umstand", "boden_2", "boden_3"), "liegt über 1 Stunde am Boden", 1),
              ("/A", eq("umstand", "wetter", "erschwert"), "der Witterung ausgesetzt oder schwer erreichbar", 1)])

kap("19", "verletzung", "Verletzung", ["verletzt", "gebrochen", "Schnitt", "Wunde", "abgetrennt"],
    [F("amputation", "Ist ein Körperteil abgetrennt?", JN2),
     F("region", "Wo ist die Person verletzt?", REGION),
     F("blutung_stark", "Blutet es stark?", JN),
     F("fehlstellung", "Steht etwas schief oder sieht gebrochen aus?", JN),
     LANG_HER,
     F("hohe_energie", "Ist es durch große Wucht passiert (Maschine, Aufprall, Explosion)?", JN)],
    [R(GETRUEBT, 4, "Verletzung mit Bewusstseinsstörung"),
     R(ALL(ja("amputation"), NOT(eq("region", "extremitaet"))), 4, "Abtrennung am Rumpf oder Kopf"),
     R(ja("hohe_energie"), 4, "Verletzung durch große Wucht"),
     R(eq("at", "abnorm"), 4, "Verletzung mit Atemproblemen"),
     R(ja("amputation"), 3, "Abgetrenntes Körperteil (Finger, Hand, Fuß)"),
     R(eq("region", "hals_brust", "rumpf", "mehrere"), 3, "Verletzung an Rumpf oder mehreren Stellen"),
     R(ja("blutung_stark"), 3, "Verletzung mit starker Blutung"),
     R(eq("region", "kopf"), 2, "Kopfverletzung"),
     R(ja("fehlstellung"), 2, "Knochenbruch möglich"),
     R(ja("aelter6h"), 1, "Verletzung vor über 6 Stunden"),
     R(None, 1, "Verletzung an Arm oder Bein")])

kap("20", "blutung", "Blutung", ["Blutung", "blutet", "Nasenbluten", "Krampfader"],
    [F("ursache", "Kommt die Blutung von einer Verletzung?", o(("trauma", "Ja, Verletzung"), ("medizinisch", "Nein, von selbst"))),
     F("stelle", "Blutet es aus einer besonderen Stelle?", o(("koerperoeffnung", "Künstlicher Ausgang / Katheter"), ("shunt", "Dialyse-Shunt"), ("krampfader", "Krampfader"), ("nach_geburt", "Nach einer Geburt"), ("keine", "Nein"))),
     F("staerke", "Wie stark blutet es?", o(("gefaehrlich", "Spritzt oder hört nicht auf"), ("stark", "Läuft, Tücher werden durchtränkt"), ("schwach", "Tropft, lässt sich stillen"), ("gering", "Kaum noch"), ("unbekannt", "Weiß nicht"))),
     F("region", "Wo blutet es?", REGION),
     F("bluter", "Ist die Person Bluter?", JN),
     F("blutverduenner", "Nimmt die Person Blutverdünner?", JN)],
    [R(GETRUEBT, 4, "Blutung mit Bewusstseinsstörung"),
     R(eq("staerke", "gefaehrlich"), 4, "Lebensgefährliche Blutung"),
     R(eq("at", "abnorm"), 4, "Blutung mit Atemproblemen"),
     R(eq("stelle", "nach_geburt"), 3, "Blutung nach Geburt"),
     R(ALL(eq("stelle", "shunt", "krampfader"), eq("staerke", "stark", "unbekannt")), 3, "Starke Blutung aus Shunt oder Krampfader"),
     R(eq("staerke", "stark"), 3, "Starke Blutung"),
     R(eq("region", "hals_brust"), 3, "Blutung an Hals oder Brust"),
     R(ja("bluter"), 3, "Blutung bei Bluterkrankheit"),
     R(ja("blutverduenner"), 2, "Blutung unter Blutverdünnern"),
     R(None, 1, "Leichte Blutung")])

kap("21", "verkehrsunfall", "Verkehrsunfall", ["Unfall", "Verkehrsunfall", "Auto", "Motorrad", "Zusammenstoß"],
    [F("verletzte", "Gibt es Verletzte?", o(("ja", "Ja"), ("nein_sicher", "Nein, sicher nicht"), ("nein_unsicher", "Wahrscheinlich nicht"), ("unbekannt", "Weiß nicht"))),
     F("grossunfall", "Ist ein großes Verkehrsmittel beteiligt?", o(("nein", "Nein"), ("bus", "Bus"), ("zug", "Zug / Straßenbahn"), ("massen", "Viele Fahrzeuge (Massenkarambolage)"))),
     F("mechanismus", "Was ist passiert?", o(("nein", "Zusammenstoß von Autos"), ("fahrrad", "Auto gegen Radfahrer"), ("motorrad", "Motorradunfall"), ("fussgaenger", "Auto gegen Fußgänger"), ("geschleudert", "Person aus dem Fahrzeug geschleudert"), ("ueberschlag", "Fahrzeug überschlagen"), ("absturz", "Fahrzeug abgestürzt (Böschung, Brücke)"), ("sinkend", "Fahrzeug im Wasser"))),
     F("hohe_geschw", "War es bei hoher Geschwindigkeit (Freiland, Autobahn)?", JN),
     F("gefahrgut", "Ist ein Gefahrgut-Fahrzeug beteiligt?", JN),
     F("eingeklemmt", "Ist jemand eingeklemmt?", JN),
     F("blutung_stark", "Blutet jemand stark?", JN),
     F("andere_gefahren", "Gibt es andere Gefahren (Feuer, Rauch, auslaufendes Benzin, Verkehr)?", JN),
     F("gering", "War es nur ein leichter Anstoß (Parkplatz, Schritttempo)?", JN),
     F("anrufer_selbst", "Sind Sie selbst beteiligt und nur leicht verletzt?", JN)],
    [R(eq("grossunfall", "bus", "zug", "massen"), 4, "Verkehrsunfall mit großem Verkehrsmittel", MANV),
     R(GETRUEBT, 4, "Verkehrsunfall, Person benommen"),
     R(ja("eingeklemmt"), 4, "Verkehrsunfall mit eingeklemmter Person"),
     R(eq("mechanismus", "geschleudert", "ueberschlag", "absturz", "fussgaenger", "motorrad", "sinkend"), 4, "Verkehrsunfall mit schwerem Unfallhergang"),
     R(ja("hohe_geschw"), 4, "Verkehrsunfall bei hoher Geschwindigkeit"),
     R(eq("at", "abnorm"), 4, "Verkehrsunfall mit Atemproblemen"),
     R(ja("blutung_stark"), 3, "Verkehrsunfall mit starker Blutung"),
     R(ANY(ja("andere_gefahren"), ja("gefahrgut")), 3, "Verkehrsunfall mit Gefahren an der Unfallstelle"),
     R(eq("mechanismus", "fahrrad"), 3, "Verkehrsunfall mit Radfahrer"),
     R(eq("verletzte", "ja"), 3, "Verkehrsunfall mit Verletzten"),
     R(ja("gering"), 1, "Leichter Verkehrsunfall"),
     R(eq("verletzte", "nein_sicher"), 1, "Verkehrsunfall ohne Verletzte"),
     R(None, 2, "Verkehrsunfall, Verletzte unklar")],
    zusaetze=[("/M", eq("anzahl_patienten", "n"), "mehrere Verletzte", 2)], polizei=True)

kap("22", "eingeklemmt", "Eingeklemmt / verschüttet", ["eingeklemmt", "verschüttet", "eingeschlossen", "eingesperrt"],
    [F("lage", "Was ist die Situation?", o(("eingeklemmt", "Ein Körperteil ist eingeklemmt"), ("frei", "War eingeklemmt, ist jetzt frei"), ("unter_fahrzeug", "Unter einem Fahrzeug"), ("eingeschlossen", "Eingeschlossen, aber nicht in Gefahr (Lift, Raum)"), ("graben", "In einem Graben verschüttet"), ("gebaeude", "Gebäude eingestürzt"), ("lawine", "Erdrutsch / Mure"), ("raumenge", "In einem Schacht, Silo oder Tank"), ("unbekannt", "Weiß nicht"))),
     F("koerperteil", "Was ist eingeklemmt?", o(("klein", "Finger, Zehe, Haare"), ("mittel", "Hand, Arm, Fuß, Unterschenkel"), ("gross", "Kopf, Rumpf, Oberschenkel oder ganzer Körper"), ("unbekannt", "Weiß nicht")), wenn=eq("lage", "eingeklemmt")),
     F("sicher_betroffen", "Ist sicher, dass ein Mensch betroffen ist?", JN),
     F("schwer_verletzt", "Ist die Person schwer verletzt?", JN),
     F("verletzt", "Ist die Person verletzt?", JN),
     F("anz_eingeklemmt", "Wie viele Personen sind eingeklemmt oder eingeschlossen?", o(("0", "Keine"), ("1", "Eine"), ("n", "Mehrere"))),
     F("anz_verletzt", "Wie viele sind verletzt?", o(("0", "Keine"), ("1", "Eine"), ("n", "Mehrere")))],
    [R(GETRUEBT, 4, "Eingeklemmt, Person benommen"),
     R(eq("lage", "unter_fahrzeug", "graben", "gebaeude", "lawine", "raumenge"), 4, "Verschüttet oder unter Last eingeklemmt"),
     R(eq("koerperteil", "gross"), 4, "Großer Körperteil eingeklemmt"),
     R(ja("schwer_verletzt"), 4, "Eingeklemmt, schwer verletzt"),
     R(eq("anz_eingeklemmt", "n"), 4, "Mehrere Personen eingeklemmt", MANV),
     R(eq("lage", "eingeklemmt"), 3, "Hand, Arm oder Fuß eingeklemmt"),
     R(ALL(eq("lage", "eingeschlossen"), NOT(ja("verletzt"))), 1, "Eingeschlossen, nicht verletzt"),
     R(eq("sicher_betroffen", "nein", "unbekannt"), 2, "Unklar, ob jemand eingeklemmt ist"),
     R(None, 2, "Eingeklemmt / eingeschlossen, leicht verletzt")])

kap("23", "brand", "Verbrennung / Brand / Explosion", ["Verbrennung", "verbrüht", "Brand", "Feuer", "Explosion"],
    [F("art", "Was ist passiert?", o(("verbrennung", "Verbrennung / Verbrühung"), ("explosion", "Explosion"), ("feuer", "Brand in einem Gebäude oder Fahrzeug"), ("feuerwerk", "Feuerwerkskörper"))),
     F("brennt_noch", "Brennt die Person noch?", JN2),
     F("eingeschlossen", "Sind Menschen im Feuer eingeschlossen?", JN),
     F("mehrere_verletzte", "Sind mehrere Menschen verletzt?", JN),
     F("sprachschw", "Ist die Stimme heiser oder fällt das Atmen schwer (Rauch eingeatmet)?", JN),
     F("gesicht", "Ist das Gesicht verbrannt?", JN),
     F("flaeche", "Wie groß ist die verbrannte Fläche?", o(("gross", "Groß (z. B. ganzer Rücken, ganzes Bein)"), ("mittel", "Mittel (größer als zwei Handflächen)"), ("gering", "Klein (Hand, Finger)"), ("sonnenbrand", "Sonnenbrand"), ("unbekannt", "Weiß nicht"))),
     LANG_HER,
     F("nur_alarm", "Ist es nur ein Brandalarm ohne bekannte Verletzte?", JN)],
    [R(ja("brennt_noch"), 4, "Person brennt"),
     R(ja("eingeschlossen"), 4, "Menschen im Feuer eingeschlossen", MANV),
     R(eq("art", "explosion"), 4, "Explosion"),
     R(GETRUEBT, 4, "Verbrennung mit Bewusstseinsstörung"),
     R(ANY(ja("sprachschw"), eq("at", "abnorm")), 4, "Verbrennung mit Atemproblemen"),
     R(eq("flaeche", "gross"), 4, "Großflächige Verbrennung"),
     R(ja("mehrere_verletzte"), 4, "Mehrere Verbrannte", MANV),
     R(ja("gesicht"), 3, "Verbrennung im Gesicht"),
     R(eq("flaeche", "mittel"), 3, "Mittelgroße Verbrennung"),
     R(ALL(lt("alter", 6), NOT(eq("flaeche", "gering", "sonnenbrand"))), 3, "Verbrennung bei Kleinkind"),
     R(ja("nur_alarm"), 2, "Brandalarm, keine Verletzten bekannt"),
     R(ja("aelter6h"), 1, "Verbrennung vor über 6 Stunden"),
     R(None, 2, "Kleine Verbrennung")])

kap("24", "gefahrstoff", "Gas / Rauch / Gefahrstoff", ["Gas", "Kohlenmonoxid", "CO-Melder", "Rauch", "Chemikalie"],
    [F("substanz", "Um welchen Stoff geht es?", o(("co", "Kohlenmonoxid (CO-Melder, Therme)"), ("gas", "Gasgeruch"), ("chemisch", "Chemikalie"), ("suizid_co", "Absichtlich Abgase eingeatmet"), ("unbekannt", "Weiß nicht"))),
     F("betroffene", "Hat jemand Beschwerden (Kopfweh, Übelkeit, Schwindel)?", JN),
     F("mehrere_verletzte", "Sind mehrere Menschen betroffen?", JN),
     F("sprachschw", "Fällt jemandem das Atmen oder Sprechen schwer?", JN)],
    [R(GETRUEBT, 4, "Gefahrstoff, Person benommen"),
     R(ANY(ja("sprachschw"), eq("at", "abnorm")), 4, "Gefahrstoff mit Atemproblemen"),
     R(eq("substanz", "suizid_co"), 4, "Absichtliche Vergiftung mit Abgasen"),
     R(ja("mehrere_verletzte"), 4, "Mehrere Betroffene durch Gefahrstoff", MANV),
     R(ja("betroffene"), 3, "Gefahrstoff mit Beschwerden"),
     R(eq("betroffene", "unbekannt"), 2, "Gefahrstoff, Beschwerden unklar"),
     R(None, 1, "Gefahrstoff, niemand hat Beschwerden")])

kap("25", "strom", "Stromunfall", ["Strom", "Stromschlag", "Blitz", "Starkstrom"],
    [F("art", "Was war es?", o(("strom", "Stromschlag"), ("blitz", "Blitzschlag"))),
     F("noch_verbunden", "Hat die Person noch Kontakt zur Stromquelle?", JN),
     F("strom_an", "Ist der Strom noch eingeschaltet?", JN),
     F("sturz", "Ist die Person dabei abgestürzt?", o(("extrem", "Ja, aus über 10 Metern"), ("gross", "Ja, aus 3 bis 10 Metern"), ("nein", "Nein"), ("unbekannt", "Weiß nicht"))),
     F("mehrere_verletzte", "Sind mehrere Menschen betroffen?", JN)],
    [R(ja("noch_verbunden"), 4, "Person hängt noch am Strom"),
     R(eq("art", "blitz"), 4, "Blitzschlag"),
     R(GETRUEBT, 4, "Stromunfall mit Bewusstseinsstörung"),
     R(eq("sturz", "extrem", "gross"), 4, "Stromunfall mit Absturz"),
     R(eq("at", "abnorm"), 4, "Stromunfall mit Atemproblemen"),
     R(ja("mehrere_verletzte"), 4, "Stromunfall mit mehreren Betroffenen", MANV),
     R(None, 3, "Stromunfall, wach")])

kap("26", "wasser", "Ertrinken / Wasserunfall", ["ertrunken", "Badeunfall", "untergegangen", "Eis eingebrochen", "Tauchen"],
    [F("art", "Was ist passiert?", o(("ertrinken", "Badeunfall / Ertrinken"), ("kopfsprung", "Kopfsprung ins seichte Wasser"), ("tauchen", "Tauchunfall"), ("eis", "Im Eis eingebrochen"), ("fliess", "In einen Fluss gefallen"), ("hochwasser", "Hochwasser"))),
     F("wo", "Wo ist die Person jetzt?", o(("land", "An Land"), ("im_wasser", "Noch im Wasser, an der Oberfläche"), ("gestrandet", "Festsitzend (Insel, Dach, Eisscholle)"), ("untergegangen", "Gerade untergegangen"), ("vermisst", "Vermisst, vermutlich unter Wasser"), ("unbekannt", "Weiß nicht"))),
     F("ueber6h", "Ist die Person seit über 6 Stunden vermisst?", JN, wenn=eq("wo", "vermisst")),
     F("reanimiert", "Wurde die Person schon wiederbelebt?", JN),
     F("hws", "Hat die Person Nackenschmerzen oder Gefühlsstörungen in Armen/Beinen?", JN),
     F("deko", "Hat der Taucher Gelenkschmerzen, Hautjucken oder Lähmungen?", JN, wenn=eq("art", "tauchen"))],
    [R(ALL(eq("wo", "vermisst"), ja("ueber6h")), 2, "Suche nach vermisster Person im Wasser (über 6 Stunden)"),
     R(eq("wo", "untergegangen", "vermisst"), 5, "Person unter Wasser"),
     R(eq("wo", "im_wasser"), 4, "Person noch im Wasser"),
     R(ja("reanimiert"), 4, "Nach Wiederbelebung aus dem Wasser"),
     R(GETRUEBT, 4, "Wasserunfall mit Bewusstseinsstörung"),
     R(eq("at", "abnorm"), 4, "Wasserunfall mit Atemproblemen"),
     R(ANY(eq("art", "kopfsprung"), ja("hws")), 4, "Wasserunfall, Verdacht auf Wirbelsäulenverletzung"),
     R(eq("wo", "gestrandet"), 3, "Person festsitzend im Wasser"),
     R(ANY(ja("deko"), eq("art", "tauchen")), 3, "Tauchunfall"),
     R(None, 3, "Badeunfall, Person an Land und wach")])

kap("27", "hitze_kaelte", "Hitze / Kälte", ["Hitze", "Sonnenstich", "unterkühlt", "Kälte", "erfroren"],
    [F("art", "Hitze oder Kälte?", o(("hitze", "Hitze"), ("kaelte", "Kälte"))),
     F("mehrere_symptome", "Sind mehrere Menschen betroffen und geht es jemandem schlecht?", JN),
     F("hautfarbe", "Ist die Haut auffällig (grau, sehr rot oder bläulich)?", JN),
     F("herz_vg", "Ist ein Herzleiden bekannt?", JN)],
    [R(GETRUEBT, 4, "Hitze-/Kältenotfall mit Bewusstseinsstörung"),
     R(eq("at", "abnorm"), 4, "Hitze-/Kältenotfall mit Atemproblemen"),
     R(ja("mehrere_symptome"), 3, "Mehrere Betroffene durch Hitze/Kälte"),
     R(ja("hautfarbe"), 3, "Hitze-/Kältenotfall mit Hautveränderung"),
     R(ja("herz_vg"), 3, "Hitze-/Kältenotfall bei Herzleiden"),
     R(ge("alter", 75, False), 2, "Hitze-/Kältenotfall über 75"),
     R(None, 1, "Hitze-/Kälteproblem, wach")])

kap("28", "tierbiss", "Tierbiss / Tierangriff", ["Hundebiss", "gebissen", "Tier", "Kuh", "Pferd"],
    [F("tierart", "Was für ein Tier war es?", o(("gross", "Großes Tier (Pferd, Rind, Wildschwein)"), ("exotisch", "Giftiges oder exotisches Tier"), ("hund_mehrere", "Heftiger Angriff durch Hund(e)"), ("normal", "Einzelner Biss / Kratzer"), ("unbekannt", "Weiß nicht"))),
     F("angriff_laeuft", "Greift das Tier noch an?", JN),
     F("region", "Wo ist die Verletzung?", REGION),
     F("schwer", "Ist die Wunde tief oder groß?", JN),
     F("blutung_stark", "Blutet es stark?", JN),
     F("fehlstellung", "Sieht etwas gebrochen aus?", JN),
     LANG_HER,
     F("oberflaechlich", "Ist es nur ein oberflächlicher Biss oder Kratzer?", JN)],
    [R(eq("tierart", "exotisch"), 4, "Biss eines giftigen/exotischen Tieres"),
     R(GETRUEBT, 4, "Tierangriff mit Bewusstseinsstörung"),
     R(ALL(eq("region", "hals_brust", "rumpf"), ja("schwer")), 4, "Schwerer Tierangriff an Hals oder Rumpf"),
     R(ja("angriff_laeuft"), 3, "Tierangriff läuft noch"),
     R(ja("blutung_stark"), 3, "Tierbiss mit starker Blutung"),
     R(eq("tierart", "gross", "hund_mehrere"), 3, "Angriff großes Tier oder mehrere Hunde"),
     R(ja("schwer"), 3, "Tiefe Bisswunde"),
     R(eq("region", "kopf"), 2, "Tierbiss im Gesicht"),
     R(ja("fehlstellung"), 2, "Tierangriff, Knochenbruch möglich"),
     R(ja("aelter6h"), 1, "Tierbiss vor über 6 Stunden"),
     R(ja("oberflaechlich"), 1, "Oberflächlicher Biss oder Kratzer"),
     R(None, 1, "Tierbiss")])

kap("29", "gewalt", "Gewalt / Überfall", ["Schlägerei", "angegriffen", "Überfall", "verprügelt", "Gewalt"],
    [F("deliktart", "Was ist passiert?", o(("koerperverletzung", "Schlägerei / Körperverletzung"), ("sexualdelikt", "Sexueller Übergriff"), ("elektroschocker", "Elektroschocker"))),
     F("taeter_vor_ort", "Ist der Täter noch da oder besteht Gefahr?", JN),
     F("region", "Wo ist die Person verletzt?", REGION),
     F("blutung_stark", "Blutet es stark?", JN),
     F("fehlstellung", "Sieht etwas gebrochen aus?", JN),
     LANG_HER,
     F("mehrere_verletzte", "Sind mehrere Personen verletzt?", JN)],
    [R(GETRUEBT, 4, "Gewalttat, Person benommen"),
     R(ALL(eq("region", "hals_brust", "rumpf"), ja("blutung_stark")), 4, "Gewalttat, starke Blutung am Rumpf"),
     R(eq("at", "abnorm"), 4, "Gewalttat mit Atemproblemen"),
     R(ja("mehrere_verletzte"), 4, "Gewalttat mit mehreren Verletzten", MANV),
     R(ja("blutung_stark"), 3, "Gewalttat mit starker Blutung"),
     R(eq("region", "kopf"), 3, "Gewalttat mit Kopfverletzung"),
     R(ja("taeter_vor_ort"), 3, "Gewalttat, Täter noch vor Ort"),
     R(eq("deliktart", "sexualdelikt"), 2, "Sexueller Übergriff"),
     R(ja("fehlstellung"), 2, "Gewalttat, Knochenbruch möglich"),
     R(ja("aelter6h"), 1, "Gewalttat vor über 6 Stunden"),
     R(None, 2, "Gewalttat, leicht verletzt")], polizei=True)

kap("30", "stich_schuss", "Stich- / Schussverletzung", ["Messer", "gestochen", "Schuss", "Stichwunde", "aufgespießt"],
    [F("art", "Was ist passiert?", o(("schuss", "Schuss"), ("stich", "Stich / Schnitt mit Messer"), ("pfaehlung", "Aufgespießt / gepfählt"))),
     F("tot", "Ist die Person eindeutig tot?", JN),
     F("selbst", "Hat sich die Person das selbst zugefügt?", JN),
     F("noch_gepfaehlt", "Steckt der Gegenstand noch im Körper?", JN),
     F("wunde", "Wo ist die Wunde?", o(("peripher", "Arm oder Bein"), ("zentral", "Kopf, Hals, Brust, Bauch, Rücken"), ("unbekannt", "Weiß nicht"))),
     F("anzahl_wunden", "Wie viele Wunden?", o(("eine", "Eine"), ("mehrere", "Mehrere"), ("unbekannt", "Weiß nicht"))),
     LANG_HER,
     F("blutung_stark", "Blutet es stark?", JN),
     F("mehrere_verletzte", "Sind mehrere Personen verletzt?", JN),
     F("polizei", "Ist die Polizei schon verständigt?", JN2)],
    [R(ja("tot"), 1, "Tod nach Stich/Schuss – Polizei"),
     R(GETRUEBT, 4, "Stich/Schuss, Person benommen"),
     R(eq("wunde", "zentral", "unbekannt"), 4, "Stich/Schuss am Rumpf, Hals oder Kopf"),
     R(eq("anzahl_wunden", "mehrere"), 4, "Mehrere Stich-/Schusswunden"),
     R(eq("art", "schuss"), 4, "Schussverletzung"),
     R(ja("mehrere_verletzte"), 4, "Stich/Schuss mit mehreren Verletzten", MANV),
     R(ja("noch_gepfaehlt"), 4, "Gegenstand steckt noch im Körper"),
     R(ja("blutung_stark"), 3, "Stich/Schuss mit starker Blutung"),
     R(ja("aelter6h"), 2, "Stich/Schuss vor über 6 Stunden"),
     R(None, 3, "Stich an Arm oder Bein")], polizei=True)

kap("31", "auge", "Augen", ["Auge", "Fremdkörper im Auge", "Verätzung", "sieht nichts"],
    [F("augen", "Was ist mit dem Auge?", o(("schwer", "Schwere Verletzung (Gegenstand im Auge, Verätzung)"), ("maessig", "Schlag oder Stoß aufs Auge"), ("gering", "Kleiner Fremdkörper, Rötung"), ("medizinisch", "Kein Unfall – plötzliche Sehstörung oder Schmerz")))],
    [R(GETRUEBT, 4, "Augenverletzung mit Bewusstseinsstörung"),
     R(eq("augen", "schwer"), 3, "Schwere Augenverletzung"),
     R(eq("augen", "maessig"), 2, "Augenverletzung"),
     R(eq("augen", "medizinisch"), 2, "Plötzliches Augenproblem"),
     R(None, 1, "Leichtes Augenproblem")])

kap("32", "ersticken", "Verschlucken / Ersticken", ["verschluckt", "erstickt", "Fremdkörper", "bekommt keine Luft beim Essen"],
    [F("woran", "Woran hat sich die Person verschluckt?", o(("essen", "Essen"), ("suessigkeit", "Zuckerl / Süßigkeit"), ("fluessigkeit", "Flüssigkeit"), ("objekt", "Gegenstand (Spielzeug, Münze …)"), ("unbekannt", "Weiß nicht"))),
     F("atemweg", "Kann die Person husten, sprechen oder atmen?", o(("frei", "Ja, ganz normal"), ("teilweise", "Ja, aber schwer"), ("komplett", "Nein, gar nicht"), ("unbekannt", "Weiß nicht")))],
    [R(eq("atemweg", "komplett"), 5, "Atemwege komplett verlegt"),
     R(GETRUEBT, 4, "Verschluckt, Person benommen"),
     R(eq("atemweg", "teilweise", "unbekannt"), 3, "Verschluckt, Atmung erschwert"),
     R(lt("alter", 2), 3, "Verschluckt, Säugling"),
     R(None, 2, "Verschluckt, atmet frei")])

kap("33", "alpin", "Alpin- / Bergunfall", ["Berg", "Lawine", "Klettersteig", "Paragleiter", "abgestürzt im Gelände"],
    [F("alpin", "Was ist passiert?", o(("vermisst", "Person vermisst"), ("signale", "Notsignale / Licht gesehen"), ("tier", "Tier in Not"), ("hilfe", "Sonstige Hilfe"), ("bergung", "Person sitzt fest, unverletzt"), ("spalte", "Sturz in Spalte oder Schlucht"), ("seil", "Hängt im Seil"), ("lawine_wenige", "Lawine – bis zu 3 Personen verschüttet"), ("lawine_viele", "Lawine – mehr als 3 Personen verschüttet"), ("lawine_unklar", "Lawine – unklar, ob jemand verschüttet ist"), ("flug_baum", "Gleitschirm / Drachen hängt im Baum"), ("flug_unfall", "Gleitschirm / Drachen abgestürzt"), ("absturz", "Absturz im Gelände"))),
     F("verletzt", "Ist jemand verletzt?", JN)],
    [R(eq("alpin", "lawine_viele"), 5, "Lawine, viele Verschüttete", MANV),
     R(eq("alpin", "lawine_wenige"), 5, "Lawine mit Verschütteten"),
     R(eq("alpin", "flug_unfall", "spalte", "absturz"), 4, "Absturz im Gelände"),
     R(eq("alpin", "seil"), 4, "Person hängt im Seil"),
     R(eq("alpin", "lawine_unklar"), 3, "Lawine, Lage unklar"),
     R(eq("alpin", "flug_baum"), 3, "Gleitschirm im Baum"),
     R(ALL(ja("verletzt"), NOT(eq("alpin", "tier", "hilfe"))), 3, "Bergunfall mit Verletzung"),
     R(eq("alpin", "signale", "vermisst"), 2, "Suche im Gelände"),
     R(eq("alpin", "bergung"), 2, "Bergung unverletzter Person"),
     R(None, 0, "Hilfeleistung Bergrettung (kein Patient)")],
    prim=False, ks=None, std=False)

kap("34", "ecall", "Automatische Unfallmeldung", ["eCall", "automatischer Notruf", "Fahrzeug meldet Unfall"],
    [F("sprachkontakt", "Gibt es Sprechkontakt mit jemandem im Fahrzeug?", JN2),
     F("lebensbedrohung", "Ist jemand schwer verletzt oder reagiert nicht?", JN, wenn=ja("sprachkontakt")),
     F("mechanismus", "Was ist passiert?", o(("nein", "Zusammenstoß"), ("fahrrad", "Radfahrer beteiligt"), ("motorrad", "Motorrad"), ("fussgaenger", "Fußgänger beteiligt"), ("geschleudert", "Person herausgeschleudert"), ("eingeklemmt", "Jemand ist eingeklemmt"), ("ueberschlag", "Überschlag"), ("absturz", "Absturz")), wenn=ja("sprachkontakt")),
     F("verletzte", "Gibt es Verletzte?", o(("keine", "Nein"), ("leicht", "Nur leicht"), ("eine", "Eine Person"), ("mehrere_1", "Zwei Personen"), ("mehrere_n", "Mehr als zwei"), ("unbekannt", "Weiß nicht")), wenn=ja("sprachkontakt"))],
    [R(ja("lebensbedrohung"), 4, "Automatische Unfallmeldung, lebensbedrohlich"),
     R(eq("mechanismus", "geschleudert", "eingeklemmt", "ueberschlag", "absturz", "fussgaenger", "motorrad"), 4, "Automatische Unfallmeldung, schwerer Hergang"),
     R(eq("verletzte", "mehrere_n"), 4, "Automatische Unfallmeldung, mehrere Verletzte", MANV),
     R(eq("sprachkontakt", "nein"), 3, "Automatische Unfallmeldung ohne Sprechkontakt"),
     R(eq("verletzte", "eine", "mehrere_1"), 3, "Automatische Unfallmeldung mit Verletzten"),
     R(eq("verletzte", "leicht"), 2, "Automatische Unfallmeldung, leicht verletzt"),
     R(eq("verletzte", "keine"), 1, "Automatische Unfallmeldung, niemand verletzt"),
     R(None, 2, "Automatische Unfallmeldung, Lage unklar")])

kap("35", "anforderung_arzt", "Anforderung Arzt / Pflege", ["Hausarzt", "Pflegeheim", "Ordination", "Arzt fordert an", "Telemedizin"],
    [F("anforderer", "Wer fordert an?", o(("normal", "Arzt, Pflege oder Einrichtung vor Ort"), ("telemed", "Telefonärztin/-arzt"), ("141", "Ärztefunkdienst 141"), ("ecn", "Gesundheitshotline 1450"), ("schi", "Pistenrettung"))),
     F("grund", "Warum wird angefordert?", o(("transport", "Transport ins Krankenhaus (stabil)"), ("na", "Notarzt nötig"), ("nah", "Hubschrauber nötig"), ("reanimiert", "Gerade wiederbelebt"), ("bewusstsein", "Plötzlich eingetrübt"), ("atmung", "Akute Atemnot"), ("blutung", "Starke Blutung"), ("herz", "Herzbeschwerden / Verdacht auf Infarkt"), ("neuro", "Verdacht auf Schlaganfall"), ("bz", "Blutzuckerentgleisung"), ("sturz", "Gestürzt, liegt noch am Boden"))),
     F("dringlichkeit", "Wie dringend ist der Transport?", o(("ohne", "Nicht dringend"), ("sofort", "Sofort"), ("geraete", "Sofort, mit Überwachung/Geräten")), wenn=eq("grund", "transport")),
     F("transportart", "Wie kann die Person transportiert werden?", o(("gehend", "Geht selbst"), ("sitzend", "Sitzend"), ("liegend", "Liegend"), ("rollstuhl", "Im Rollstuhl")), wenn=eq("grund", "transport"))],
    [R(eq("grund", "nah"), 5, "Anforderung Hubschrauber durch Arzt"),
     R(eq("grund", "reanimiert"), 4, "Anforderung nach Wiederbelebung"),
     R(eq("grund", "na"), 4, "Anforderung Notarzt durch Arzt"),
     R(eq("grund", "bewusstsein"), 4, "Anforderung wegen Bewusstseinstrübung"),
     R(eq("grund", "atmung"), 4, "Anforderung wegen Atemnot"),
     R(eq("grund", "herz"), 4, "Anforderung wegen Herzbeschwerden"),
     R(eq("grund", "blutung"), 3, "Anforderung wegen starker Blutung"),
     R(eq("grund", "neuro"), 3, "Anforderung wegen Schlaganfallverdacht"),
     R(eq("grund", "bz"), 3, "Anforderung wegen Blutzuckerentgleisung"),
     R(eq("grund", "sturz"), 2, "Anforderung nach Sturz"),
     R(ALL(eq("grund", "transport"), eq("dringlichkeit", "geraete")), 3, "Dringender Transport mit Überwachung"),
     R(ALL(eq("grund", "transport"), eq("dringlichkeit", "sofort")), 2, "Sofortiger Transport, stabil"),
     R(eq("grund", "transport"), 1, "Transport ohne Dringlichkeit"),
     R(REAGIERT_NICHT, 4, "Anforderung, Patient reagiert nicht"),
     R(ANY(GETRUEBT, eq("at", "abnorm")), 4, "Anforderung, Patient instabil"),
     R(None, 1, "Anforderung durch Arzt/Pflege")],
    std=False)

kap("36", "anforderung_polizei", "Anforderung Polizei", ["Polizei fordert an", "Streife", "Polizei vor Ort"],
    [F("problem", "Welches Problem meldet die Polizei?", o(("brust", "Brustschmerzen"), ("geburt", "Geburt"), ("krampf", "Krampfanfall"), ("schlaganfall", "Schlaganfall"), ("psych", "Psychischer Ausnahmezustand"), ("lebensbedrohlich", "Lebensbedrohlicher Zustand"), ("gering", "Leichte Beschwerden"), ("unbekannt", "Weiß nicht")))],
    [R(GETRUEBT, 4, "Polizei: Person benommen"),
     R(eq("problem", "lebensbedrohlich"), 4, "Polizei: lebensbedrohlicher Zustand"),
     R(eq("problem", "brust", "geburt", "krampf", "schlaganfall"), 3, "Polizei: akutes medizinisches Problem"),
     R(eq("problem", "psych"), 2, "Polizei: psychischer Ausnahmezustand"),
     R(eq("problem", "gering"), 1, "Polizei: leichte Beschwerden"),
     R(None, 2, "Polizei: medizinisches Problem unklar")])

kap("37", "anforderung_ls", "Anforderung andere Leitstelle / Organisation", ["Feuerwehr fordert an", "Nachbarleitstelle", "Bergrettung fordert an", "Wasserrettung"],
    [F("von", "Wer fordert an?", o(("ls", "Andere Rettungsleitstelle"), ("org", "Feuerwehr, Bergrettung, Wasserrettung o. Ä."))),
     F("mittel", "Was wird angefordert?", o(("ktw", "Krankentransportwagen"), ("rtw", "Rettungswagen"), ("na", "Notarzt"), ("nah", "Notarzthubschrauber")))],
    [R(eq("mittel", "nah"), 5, "Anforderung Hubschrauber durch andere Stelle"),
     R(eq("mittel", "na"), 4, "Anforderung Notarzt durch andere Stelle"),
     R(eq("mittel", "rtw"), 3, "Anforderung Rettungswagen durch andere Stelle"),
     R(eq("mittel", "ktw"), 1, "Anforderung Krankentransport durch andere Stelle"),
     R(None, 3, "Anforderung durch andere Stelle")],
    prim=False, ks=None, std=False)

kap("38", "unklar", "Unklare Lage", ["unklar", "Hausnotruf", "nur Stöhnen", "Fremdsprache", "hilflose Person"],
    [F("art", "Was ist die Lage?", o(("lebensbedrohung", "Hinweis auf Lebensgefahr"), ("fremdsprache", "Verständigung kaum möglich"), ("notrufsystem", "Hausnotruf / Notrufknopf ohne Sprechkontakt"), ("dritte_hand", "Anrufer ist nicht beim Patienten"), ("hilflos", "Hilflose Person (liegt, sitzt, reagiert kaum)"), ("unbekannt", "Weiß nicht")))],
    [R(eq("art", "lebensbedrohung"), 4, "Unklare Lage mit Hinweis auf Lebensgefahr"),
     R(GETRUEBT, 3, "Unklare Lage, Person benommen"),
     R(None, 2, "Unklare Lage")])


# ---------------------------------------------------------------- Zusammenbauen
def bauen():
    kapitel = {}
    codes = {}
    for K in KAPITEL:
        nr, titel = K["nr"], K["titel"]
        kapname = f"{nr} - {titel}"
        regeln = list(K["regeln"])
        if K["std"] and K["prim"]:
            regeln = [W(ALL(REAGIERT_NICHT, eq("at", "agonal", "keine")), "04"), R(REAGIERT_NICHT, 4, f"{titel} – reagiert nicht")] + regeln
        zaehler = {}
        name_code = {}
        rjson = []
        dets = []
        for r in regeln:
            if r[0] == "wechsel":
                _, wenn, ziel, vb = r
                x = {"wechsel_zu_kapitel": ziel}
                if vb:
                    x["vorbelegung"] = vb
                if wenn:
                    x["wenn"] = wenn
                rjson.append(x)
                continue
            _, wenn, stufe, name, kat = r
            if name in name_code:
                code = name_code[name]
            else:
                zaehler[stufe] = zaehler.get(stufe, 0) + 1
                code = f"{nr}-S{stufe}-{zaehler[stufe]:02d}"
                name_code[name] = code
                codes[code] = {"name": name, "kategorie": kat or STUFEN_KAT[stufe], "kapitel": kapname}
                dets.append((code, stufe, name, kat))
            x = {"code": code}
            if wenn:
                x["wenn"] = wenn
            rjson.append(x)
        assert "wenn" not in rjson[-1], f"Kapitel {nr}: letzte Regel braucht kein wenn"
        # Zusätze (Suffixe)
        suffix = {"regeln": [], "standard": ""}
        for (sfx, wenn, text, min_stufe) in K["zusaetze"]:
            suffix["regeln"].append({"wenn": wenn, "suffix": sfx})
            for (code, stufe, name, kat) in dets:
                if stufe < min_stufe:
                    continue
                k = kat or STUFEN_KAT[stufe]
                if sfx == "/M" and stufe >= 3:
                    k = MANV
                if sfx == "/L" and stufe == 1:
                    k = STUFEN_KAT[2]
                codes[code + sfx] = {"name": f"{name} – {text}", "kategorie": k, "kapitel": kapname}
        # Polizei
        pk = {}
        if K["polizei"]:
            for (code, stufe, name, kat) in dets:
                pk[code] = code + "/P"
                codes[code + "/P"] = {"name": f"{name} – Polizei verständigt", "kategorie": kat or STUFEN_KAT[stufe], "kapitel": kapname}
        # manuelles Aufwerten
        aufw = {}
        if nr not in ("04",):
            for st in (3, 4):
                c = f"{nr}-S{st}-00"
                codes[c] = {"name": f"{titel} – manuell aufgewertet", "kategorie": STUFEN_KAT[st], "kapitel": kapname}
                aufw[str(st)] = c
        ks = K["ks"]
        if ks == "04":
            ks = {"wechsel_zu_kapitel": "04"}
        kj = {
            "kapitel": nr,
            "thema": K["thema"],
            "titel": titel,
            "stichworte": K["stichworte"],
            "primaerabfrage": K["prim"],
            "kreislaufstillstand": ks,
            "fragen": K["fragen"],
            "regeln": rjson,
            "suffix": suffix,
            "aufwertung": aufw,
            "polizei_kennung": pk,
        }
        if K["hinweis"]:
            kj["hinweis"] = K["hinweis"]
        kapitel[nr] = kj
    return kapitel, codes


GLOBAL = {
    "phase_1_einsatzort": [
        F("ort_adresse", "Wo ist der Notfall? (Ort, Straße, Hausnummer)", typ="text"),
        F("ort_zusatz", "Genauere Angaben zum Ort (Stiege, Stock, Zufahrt, Merkmale)", typ="text"),
    ],
    "phase_2_rueckruf": [F("rueckrufnummer", "Unter welcher Nummer erreichen wir Sie?", typ="text")],
    "phase_3_was_ist_passiert": [
        F("schilderung", "Was ist passiert? (Schilderung in Stichworten)", typ="text"),
        F("anrufer", "Wer ruft an?", o(("1", "Betroffene Person selbst"), ("2", "Jemand bei der Person"), ("3", "Jemand, der nicht bei der Person ist"), ("einrichtung", "Arzt / Pflege / Einrichtung"), ("polizei", "Polizei"), ("ls", "Andere Leitstelle / Organisation"), ("system", "Automatische Meldung"))),
        F("kapitel", "Hauptbeschwerde wählen", typ="kapitelwahl"),
    ],
    "phase_4_primaerabfrage": [
        F("anzahl_patienten", "Wie viele Personen brauchen Hilfe?", o(("1", "Eine"), ("n", "Mehrere"), ("unbekannt", "Weiß nicht"))),
        F("alter", "Wie alt ist die Person ungefähr?", typ="zahl", hinweis="Schätzung reicht."),
        F("geschlecht", "Ist die Person ein Mann oder eine Frau?", o(("m", "Mann"), ("w", "Frau"), ("unbekannt", "Weiß nicht / divers"))),
        F("bw", "Ist die Person wach und reagiert sie normal?", o(("ja", "Ja, wach und normal"), ("getruebt", "Wach, aber verwirrt oder sehr schläfrig"), ("nein", "Nein, reagiert nicht"), ("unbekannt", "Weiß nicht"))),
        F("at", "Atmet die Person? Wie?", o(("normal", "Ja, normal"), ("abnorm", "Ja, aber schwer / mit Atemnot"), ("agonal", "Nur vereinzelte Schnapper"), ("keine", "Nein, atmet nicht"), ("unbekannt", "Weiß nicht"))),
    ],
}

ANLEITUNG = """
# LeitWerk-Codesystem

Eigenständiges Codesystem des Leitstellen-Spiels LeitWerk (Codes und Abfrage in einer Datei, frei verwendbar).
Es ist ein Spiel-Codesystem – nicht medizinisch geprüft und nicht für den echten Einsatz gedacht.

Aufbau eines Codes: KK-Sx-NN
- KK = Kapitel (Hauptbeschwerde), z. B. 18 = Sturz
- Sx = Dringlichkeitsstufe: S0 Beratung/Weitergabe, S1 nicht dringend, S2 dringend, S3 Notfall (Notfallsanitäter, Blaulicht), S4 Notarzt, S5 Reanimation/höchste Dringlichkeit
- NN = laufende Nummer innerhalb von Kapitel und Stufe
- Zusätze: /L liegt über 1 Stunde am Boden, /A Witterung/schwer erreichbar, /M mehrere Verletzte, /P Polizei verständigt
- KK-S3-00 / KK-S4-00 = vom Disponenten manuell aufgewertet

Jedes Kapitel hat ein „thema“ (neutrale Hauptbeschwerde, z. B. „sturz“). Fragen-IDs und Antwortwerte sind die neutralen Merkmale der LeitWerk-Fallgeschichten.
Wer ein eigenes Codesystem bauen will: siehe „Beispiel-Codesystem“ in LeitWerk (Einstellungen → Einsatzcodes & Abfrage) – dort steht eine Anleitung für eine KI.
""".strip("\n").split("\n")


def main(ziel):
    kapitel, codes = bauen()
    d = {
        "format": "leitwerk-codesystem",
        "version": 1,
        "name": "LeitWerk-Codesystem",
        "beschreibung": "Eigenständiges Codesystem von LeitWerk: 38 Kapitel, Codes KK-Sx-NN mit Dringlichkeitsstufen S0–S5. Frei verwendbar, nicht für den echten Einsatz.",
        "anleitung_fuer_ki": ANLEITUNG,
        "stufen": {"muster": "^\\d{2}-S(\\d)", "reihenfolge": ["0", "1", "2", "3", "4", "5"]},
        "einsatzstufen": EINSATZSTUFEN,
        "globale_fragen": GLOBAL,
        "kapitel": kapitel,
        "codes": codes,
    }
    with open(ziel, "w", encoding="utf-8") as f:
        f.write(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
    print(f"{ziel}: {len(kapitel)} Kapitel, {len(codes)} Codes")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data/codesystem/leitwerk_codesystem.json")
