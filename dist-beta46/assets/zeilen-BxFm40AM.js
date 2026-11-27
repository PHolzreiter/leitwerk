import{O as Zt,Q as kn,e as p,o as Ut,U as Xe,t as Re,V as st,X as qt,Y as lt,Z as Yt,$ as bn,a0 as Xt,a1 as Qt,a2 as Fn,g as tn,a3 as er,a4 as Cn,a5 as ve,a6 as nr,a7 as tr,h as b,a8 as rr,a9 as ir,aa as ar,ab as sr,ac as In,ad as lr,ae as Le,af as or,ag as ur,ah as dr,ai as cr,aj as hr,ak as fe,al as gr,y as mr,am as fr,an as pr,ao as Wn,ap as kr,aq as br,ar as Oe,as as rn,at as _n,au as wr,av as xn,aw as Rn,ax as Sr,ay as an,az as sn,aA as ln,aB as zr,aC as Ar,aD as Er,aE as J,aF as Pe,aG as Tr,aH as Me,aI as $e,aJ as Ge,aK as on,aL as un,aM as On,aN as vr,aO as Lr,m as Pn,aP as $r,aQ as Br,aR as Kr,aS as Nr,aT as Be,aU as Dr,aV as yr,aW as Fr,aX as Mn,aY as Cr,aZ as Ir,a_ as dn,a$ as Wr,b0 as _r,b1 as xr,b2 as Rr,b3 as Or,b4 as Pr,b5 as Gn,b6 as Mr,b7 as He,b8 as Hn,b9 as Gr,ba as jn,bb as cn,bc as Hr,bd as hn,be as jr,bf as Jr,bg as Jn,bh as Vr,bi as gn,bj as Vn,bk as Zr,bl as Ur,bm as je,bn as qr,bo as Zn,bp as Un,bq as Yr,br as Xr,bs as Je,bt as Qr,bu as ei,bv as qn,bw as Ve,bx as ni,by as ti,bz as Yn,bA as ri,bB as Ke,bC as ii,bD as ai,bE as si,bF as pe,bG as li,bH as mn,bI as oi,bJ as ui,bK as di,bL as ci,bM as hi,bN as gi,bO as mi,bP as Xn,bQ as fi,bR as pi,bS as ki,bT as bi,bU as wi,bV as Si,bW as zi,bX as Ai,bY as Ei,bZ as Qn,b_ as Ti,b$ as vi,c0 as Li,c1 as et,c2 as nt,c3 as $i,c4 as Bi,c5 as Ki,c6 as Ni,c7 as Di,c8 as yi,c9 as tt,ca as fn,cb as Fi,cc as Ci,cd as Ii,ce as Wi,cf as _i,v as xi,cg as Ri,ch as Oi}from"./index-BJiI1poe.js";const Pi={ok:"#4CC38A",grau:"#9AA3B5",gelb:"#FFC72C",blau:"#3B8BFF",rot:"#E5484D"},Mi={freiWache:"frei auf der Wache",zumBO:"Anfahrt zum Einsatzort",amBO:"am Einsatzort",zumZO:"Transport zum Zielort",amZO:"am Zielort / Übergabe",freiFunk:"frei, unterwegs",dienstfahrt:"Dienstfahrt (alarmierbar)",bereitschaft:"Bereitschaft (alarmierbar)",alarmiert:"alarmiert, rückt aus",abgemeldet:"nicht im Dienst"},rt=`{
 "format": "leitwerk-codesystem",
 "version": 1,
 "name": "Beispiel-Codesystem (LeitWerk)",
 "beschreibung": "Kleines, frei erfundenes Beispiel: drei Kapitel. Zeigt den Aufbau einer Codesystem-Datei (Codes und Abfrage in einer Datei).",
 "anleitung_fuer_ki": [
  "# Anleitung für eine KI: ein neues LeitWerk-Codesystem erstellen",
  "",
  "**Auftrag des Spielers** (steht unter dieser Anleitung bzw. in seiner Nachricht): für welche Region das Codesystem sein soll und worauf du achten sollst. Fehlt das, frag zuerst danach.",
  "",
  "Du bekommst diese Datei ohne weiteren Zusammenhang. Sie ist ein **kleines, vollständiges Beispiel** für ein Codesystem des Leitstellen-Spiels „LeitWerk“ (Rettungsdienst-Leitstelle, Niederösterreich). Deine Aufgabe: zusammen mit einer Person (dem „Ersteller“) ein **neues, vollständiges Codesystem** im selben Format erstellen und am Ende als **eine gültige JSON-Datei** ausgeben.",
  "",
  "## 1. Worum es geht",
  "",
  "- In LeitWerk nimmt der Spieler Notrufe an. Er wählt die **Hauptbeschwerde** (= ein **Kapitel**), stellt die **Fragen** dieses Kapitels, und aus den Antworten ergibt sich **automatisch ein Einsatzcode**.",
  "- Jeder Code hat eine **Kategorie** (= Einsatzstufe, z. B. „Notfall mit Notarzt“). Die Einsatzstufe bestimmt, welche Fahrzeuge das Spiel vorschlägt, ob mit Blaulicht gefahren wird und ob ein Notarzt mitkommt.",
  "- Das Spiel erzeugt auch selbst Notfälle: Es zieht zufällige, aber zueinander passende Antworten und lässt eine KI den Anrufer spielen. Deshalb müssen Fragen und Antworten **eindeutig** und **für Laien beantwortbar** sein.",
  "- Codes und Abfrage stehen in **einer** Datei. Keine zweite Codeliste nötig.",
  "",
  "## 2. Ablauf mit dem Ersteller – stelle diese Fragen, bevor du schreibst",
  "",
  "Frage nacheinander (nicht alles auf einmal), fasse die Antworten kurz zusammen und lass sie bestätigen:",
  "",
  "1. **Zweck und Name:** Wie soll das Codesystem heißen? Für welches Gebiet/Land? Wird es veröffentlicht? (Wenn ja: alles muss **eigenständig formuliert** sein – keine Texte, Nummern oder Codes aus geschützten Systemen wie AMPDS/MPDS, ProQA o. Ä. übernehmen.)",
  "2. **Kapitel:** Welche Hauptbeschwerden soll es geben? Schlage eine Liste vor (z. B. Atemnot, Brustschmerz, Bewusstlosigkeit, Kreislaufstillstand, Sturz, Verkehrsunfall, Blutung, Schlaganfall, Krampfanfall, Vergiftung, Allergie, Verbrennung, Schwangerschaft/Geburt, Psychiatrie, Kranke Person unklar, Unterzuckerung, Hitze/Kälte, Ertrinken, Stromunfall, Tierbiss, Gewalt, Anforderung durch Arzt/Pflege, Anforderung durch Polizei, Anforderung anderer Leitstelle, Alpinunfall) und frag, was weg oder dazu soll.",
  "3. **Codeaufbau:** Wie sieht ein Code aus? Vorschlag wie in diesem Beispiel: \`KK-Sx-NN\` (Kapitel zweistellig, Dringlichkeitsstufe, laufende Nummer), Zusatz mit Schrägstrich (z. B. \`/L\` = liegt lange am Boden). Wie viele Dringlichkeitsstufen, und welche ist die höchste?",
  "4. **Einsatzstufen (Kategorien):** Welche Einsatzstufen gibt es, und was gehört jeweils dazu: Rettungsmittel-Reihenfolge (z. B. \`RTW>KTW\`), Notarzt (\`nein\`, \`nef\` = Notarzteinsatzfahrzeug, \`schnellster\` = NEF oder Hubschrauber), Sondersignal ja/nein, Notfallsanitäter nötig ja/nein, Dringlichkeit (\`stabil\`, \`dringend\`, \`kritisch\`), wie oft transportiert wird (Prozent)?",
  "5. **Zusätze:** Sollen Polizei, Feuerwehr oder mehrere Patienten den Code verändern (eigene Zusatzcodes)? Soll der Calltaker manuell aufwerten dürfen?",
  "6. **Je Kapitel:** Welche Fragen sind entscheidend, und welche Antworten führen zu welcher Stufe? Arbeite **Kapitel für Kapitel**: schlage Fragen und Regeln vor, lass sie bestätigen, dann das nächste Kapitel.",
  "7. **Abschluss:** Gibt es Sonderfälle (Kinder, Schwangere, Kreislaufstillstand, Unbekanntes Alter)? Wie soll „weiß nicht“ gewertet werden? (Empfehlung: im Zweifel dringlicher.)",
  "",
  "Danach erzeugst du die Datei. Ist sie lang, gib sie in Teilen aus (erst \`globale_fragen\`, dann je ein paar Kapitel, am Ende \`codes\`) und sag dem Ersteller, wie er die Teile zusammensetzt – oder gib sie in einem Stück, wenn möglich.",
  "",
  "## 3. Aufbau der Datei",
  "",
  "\`\`\`",
  "{",
  "  \\"format\\": \\"leitwerk-codesystem\\",",
  "  \\"version\\": 1,",
  "  \\"name\\": \\"…\\",",
  "  \\"beschreibung\\": \\"…\\",",
  "  \\"anleitung_fuer_ki\\": [ … ],          // optional, diese Anleitung",
  "  \\"stufen\\": { \\"muster\\": \\"…\\", \\"reihenfolge\\": [ … ] },",
  "  \\"einsatzstufen\\": [ … ],",
  "  \\"globale_fragen\\": { … },",
  "  \\"kapitel\\": { \\"<Kapitel-ID>\\": { … }, … },",
  "  \\"codes\\": { \\"<Code>\\": { \\"name\\": \\"…\\", \\"kategorie\\": \\"…\\", \\"kapitel\\": \\"…\\" }, … }",
  "}",
  "\`\`\`",
  "",
  "### 3.1 stufen",
  "- \`muster\`: regulärer Ausdruck (JavaScript), dessen **erste Klammer** die Dringlichkeitsstufe aus einem Code liest. Beispiel \`^\\\\d{2}-S(\\\\d)\` liest aus \`02-S4-01\` die \`4\`.",
  "- \`reihenfolge\`: alle Stufen **von niedrig nach hoch**. Wird für das manuelle Aufwerten gebraucht (nur nach oben).",
  "",
  "### 3.2 einsatzstufen",
  "Liste der Kategorien, die in \`codes[…].kategorie\` vorkommen. Felder: \`stufe\` (Name, genau wie in den Codes), \`rettungsmittel\` (Reihenfolge mit \`>\`, gleichwertig mit \`/\`, leer = kein Fahrzeug), \`nfs_erforderlich\`, \`notarzt\` (\`nein\`/\`nef\`/\`schnellster\`), \`sondersignal\`, \`kategorie\` (\`stabil\`/\`dringend\`/\`kritisch\`), \`transport_prozent\`. Fahrzeugtypen im Spiel: \`RTW-C\` (RTW mit Notfallsanitäter-Kompetenz), \`RTW\`, \`KTW\`, \`NEF\`, \`NAH\` (Hubschrauber).",
  "",
  "### 3.3 globale_fragen",
  "Vier Phasen, jede eine Liste von Fragen:",
  "- \`phase_1_einsatzort\`: \`ort_adresse\`, \`ort_zusatz\` (Typ \`text\`)",
  "- \`phase_2_rueckruf\`: \`rueckrufnummer\` (Typ \`text\`)",
  "- \`phase_3_was_ist_passiert\`: \`schilderung\` (\`text\`), \`anrufer\` (\`single\`), \`kapitel\` (Typ \`kapitelwahl\`)",
  "- \`phase_4_primaerabfrage\`: \`anzahl_patienten\`, \`alter\` (Typ \`zahl\`), \`geschlecht\`, \`bw\` (Bewusstsein), \`at\` (Atmung)",
  "",
  "**Diese IDs und Antwortwerte nicht ändern** – das Spiel braucht sie, um Anrufer und Patienten zu erzeugen:",
  "- \`anrufer\`: \`1\` (Patient selbst), \`2\` (jemand beim Patienten), \`3\` (jemand nicht beim Patienten), \`einrichtung\` (Arzt/Pflege), \`polizei\`, \`ls\` (andere Leitstelle), \`system\` (automatische Meldung)",
  "- \`anzahl_patienten\`: \`1\`, \`n\`, \`unbekannt\`",
  "- \`geschlecht\`: \`m\`, \`w\`, \`unbekannt\`",
  "- \`bw\`: \`ja\` (wach, normal), \`getruebt\` (wach, aber verwirrt/schläfrig), \`nein\` (bewusstlos), \`unbekannt\`",
  "- \`at\`: \`normal\`, \`abnorm\` (erschwert, Atemnot), \`agonal\` (Schnappatmung), \`keine\`, \`unbekannt\`",
  "Die Fragetexte und Beschriftungen darfst (und sollst) du eigenständig formulieren.",
  "",
  "### 3.4 Frage",
  "\`{\\"id\\": \\"…\\", \\"text\\": \\"…\\", \\"typ\\": \\"single\\" | \\"zahl\\" | \\"text\\" | \\"kapitelwahl\\", \\"optionen\\": [{\\"wert\\": \\"…\\", \\"label\\": \\"…\\"}], \\"hinweis\\": \\"…\\", \\"anzeigen_wenn\\": <Bedingung>}\`",
  "- \`id\`: kurz, klein, ohne Leerzeichen. Alle Antworten landen in **einem** gemeinsamen Wörterbuch – gleiche IDs in verschiedenen Kapiteln bedeuten dieselbe Antwort.",
  "- \`single\` braucht \`optionen\`; biete fast immer auch \`unbekannt\` an.",
  "- \`zahl\`: Zahleneingabe plus „unbekannt“.",
  "- \`anzeigen_wenn\`: Frage nur stellen, wenn die Bedingung stimmt.",
  "",
  "### 3.5 Bedingung",
  "- \`{\\"q\\": \\"bw\\", \\"in\\": [\\"nein\\", \\"getruebt\\"]}\` – Antwort ist einer der Werte (nicht gestellt → falsch)",
  "- \`{\\"q\\": \\"alter\\", \\"gte\\": 65}\`, \`{\\"q\\": \\"alter\\", \\"lt\\": 6}\` – Zahlenvergleich. **Unbekannte Zahl gilt als erfüllt** (sichere Seite), außer \`\\"unbekannt_ist\\": false\`.",
  "- \`{\\"q\\": \\"alter\\", \\"ist_unbekannt\\": true}\`",
  "- \`{\\"all\\": [ … ]}\` (UND), \`{\\"any\\": [ … ]}\` (ODER), \`{\\"not\\": … }\` (NICHT)",
  "",
  "### 3.6 Kapitel",
  "\`\`\`",
  "\\"02\\": {",
  "  \\"kapitel\\": \\"02\\",                  // gleich wie der Schlüssel",
  "  \\"titel\\": \\"Sturz\\",",
  "  \\"stichworte\\": [\\"gestürzt\\", …],    // hilft beim Finden",
  "  \\"primaerabfrage\\": true,           // Phase 4 stellen (fast immer true)",
  "  \\"kreislaufstillstand\\": {\\"code\\": \\"…\\"} | {\\"wechsel_zu_kapitel\\": \\"…\\"} | {\\"weiter_mit_fragen\\": true} | null,",
  "  \\"fragen\\": [ … ],",
  "  \\"regeln\\": [ … ],",
  "  \\"suffix\\": {\\"regeln\\": [{\\"wenn\\": <Bedingung>, \\"suffix\\": \\"L\\"}], \\"standard\\": \\"\\"},",
  "  \\"aufwertung\\": {\\"4\\": \\"02-S4-00\\"},  // optional: Stufe → Code",
  "  \\"polizei_kennung\\": {\\"*\\": \\"…\\"},    // optional: Code, wenn „Polizei“ markiert ist (Schlüssel: Code, Stufe oder *)",
  "  \\"zusatzkennungen\\": {\\"<Code>\\": [\\"<Sondercode>\\"]},  // optional",
  "  \\"aufloesung\\": { … },              // optional, siehe unten",
  "  \\"hinweis\\": \\"…\\"                    // optional",
  "}",
  "\`\`\`",
  "- \`kreislaufstillstand\` greift, wenn \`bw\` = \`nein\` und \`at\` = \`keine\` (bzw. Schnappatmung).",
  "- **Regeln** werden von oben nach unten geprüft, die **erste passende** gilt. Jede Regel hat optional \`wenn\` und **genau eines** von:",
  "  - \`\\"code\\": \\"02-S3-01\\"\`",
  "  - \`\\"wechsel_zu_kapitel\\": \\"05\\"\` (+ optional \`\\"vorbelegung\\": {\\"frage\\": \\"wert\\"}\`) – in ein anderes Kapitel wechseln",
  "  - \`\\"code_nach_antwort\\": {\\"frage\\": \\"x\\", \\"zuordnung\\": {\\"antwort\\": \\"CODE\\"}}\` – Code direkt aus einer Antwort",
  "- **Die letzte Regel hat kein \`wenn\`.** So endet jeder Weg sicher auf einem Code.",
  "- Ordne die Regeln **von dringlich nach weniger dringlich**.",
  "",
  "### 3.7 Suffix und Auflösung",
  "- Nach der Regel wird ein Suffix bestimmt (erste passende \`suffix.regeln\`, sonst \`suffix.standard\`).",
  "- Ohne \`aufloesung\` ist der fertige Code \`Code + Suffix\`, **wenn es diesen Code in \`codes\` gibt**, sonst der Code ohne Suffix. Das ist die einfache Variante – nimm sie.",
  "- Mit \`aufloesung\` (\`{\\"<Code>\\": {\\"_\\": \\"<Code>\\", \\"L\\": \\"<Code/L>\\"}}\`) legst du jede Kombination selbst fest; \`_\` = ohne Suffix.",
  "",
  "### 3.8 Themen und Merkmale (damit die Fallgeschichten des Spiels passen)",
  "LeitWerk erzeugt Notrufe aus fertigen Fallgeschichten („Opa ist in der Nacht im Bad gestürzt …“). Damit sie zu deinem Codesystem passen:",
  "- Jedes Kapitel bekommt ein **„thema“** – eines von: bauch, allergie, tierbiss, gewalt, ruecken, atemnot, brand, gefahrstoff, stillstand, brustschmerz, ersticken, krampf, zucker, wasser, strom, auge, sturz, kopfschmerz, herz, hitze_kaelte, blutung, eingeklemmt, vergiftung, schwangerschaft, psych, krank, stich_schuss, schlaganfall, verkehrsunfall, verletzung, bewusstlos, unklar, anforderung_arzt, ecall, infekt, anforderung_polizei, anforderung_ls, alpin. Ein Thema ohne Kapitel bekommt keine Fallgeschichten; ein Kapitel ohne Thema wird nur zufällig abgefragt.",
  "- Die Geschichten setzen **Merkmale** mit festen IDs und Werten (z. B. \`hoehe\` = \`boden\` / \`treppe\` / \`gross\` / \`extrem\`, \`blutung_stark\` = \`ja\`/\`nein\`, \`umstand\` = \`boden_2\` für „liegt 1–2 Stunden am Boden“). Am einfachsten: deine Fragen verwenden genau diese IDs und Werte. Das eingebaute LeitWerk-Codesystem enthält alle (in LeitWerk: Einstellungen → Eigene Dateien → Notruf (RD) → „Eingebautes System herunterladen“) – bitte den Ersteller, es dir zu geben, und übernimm IDs und Werte von dort (die Texte formulierst du selbst).",
  "- Weicht eine Frage ab, ordne sie zu: an der Frage \`\\"merkmal\\": \\"<ID>\\"\`, an einer Antwort \`\\"merkmal_wert\\": \\"<Wert>\\"\` (siehe Fragen „spricht“, „farbe“, „hoehe“ und „blutung“ unten). Fehlt die Zuordnung, versucht LeitWerk sie beim Laden selbst über Fragetext und Antworten (auch umgedrehte Fragen wie „bewusstlos?“) und rät ein fehlendes „thema“ aus dem Kapiteltitel – der Spieler kann das unter „Zuordnung …“ prüfen. Eine ausdrückliche Zuordnung ist trotzdem am sichersten.",
  "- Diese Antworten wertet das Spiel selbst aus und sollten deshalb gleich heißen: \`grund\` (Anforderung Arzt), \`tod\`, \`verletzte\`, \`eingeklemmt\`, \`gefahrgut\`, \`andere_gefahren\`, \`aggressiv\`, \`gewalt\`, \`wo\` (Wasser), \`problem\` (Polizei), \`mittel\` (andere Leitstelle), \`sprachkontakt\` (automatische Meldung).",
  "",
  "### 3.9 codes",
  "Jeder Code, der herauskommen kann, braucht einen Eintrag: \`name\` (kurz und eindeutig), \`kategorie\` (genau ein \`einsatzstufen[].stufe\`), \`kapitel\` („02 - Sturz“).",
  "",
  "## 4. Regeln für gute Abfragen",
  "",
  "- Kurze, klare Fragen, wie man sie am Telefon stellt. Eine Sache pro Frage.",
  "- Zuerst Lebensgefahr klären, dann Details.",
  "- Antworten so wählen, dass ein Laie sie geben kann („Ist die Haut blass und kaltschweißig?“ statt Fachbegriffe).",
  "- Jede Antwort, die die Dringlichkeit ändert, muss in einer Regel vorkommen; Fragen ohne Wirkung weglassen.",
  "- Kinder, Schwangere und sehr alte Menschen beachten (Altersgrenzen über \`alter\`).",
  "- Bei Unsicherheit: dringlicher.",
  "",
  "## 5. Prüfen, bevor du die Datei ausgibst",
  "",
  "1. Gültiges JSON (doppelte Anführungszeichen, keine Kommentare, keine Komma-Fehler).",
  "2. Jeder Code in \`regeln\`, \`kreislaufstillstand\`, \`aufwertung\`, \`polizei_kennung\`, \`zusatzkennungen\` steht in \`codes\` (oder ist in \`aufloesung\` aufgelöst).",
  "3. Jede \`kategorie\` in \`codes\` steht in \`einsatzstufen\`.",
  "3a. Jedes Kapitel hat ein \`thema\`, und kein Thema kommt doppelt vor.",
  "4. Jedes Kapitel: letzte Regel ohne \`wenn\`; \`wechsel_zu_kapitel\` zeigt auf ein vorhandenes Kapitel.",
  "5. Jede Bedingung fragt nur IDs, die es gibt.",
  "6. Gehe pro Kapitel mindestens drei Fälle durch (leicht, mittel, lebensbedrohlich) und schreib dem Ersteller kurz auf, welcher Code jeweils herauskommt.",
  "",
  "LeitWerk prüft die Datei beim Hochladen (Einstellungen → Eigene Dateien → Notruf (RD) → „Datei hochladen“) und zeigt Fehler an. Codes und Abfrage werden immer zusammen als diese eine Datei hochgeladen – eine getrennte Codeliste gibt es nicht.",
  "",
  "## 6. Dieses Beispiel",
  "",
  "Unten folgen drei Beispielkapitel (01 Atemnot, 02 Sturz, 03 Brustschmerz) mit Codes im Aufbau \`KK-Sx-NN\`: Stufe S0 (Beratung) bis S5 (Kreislaufstillstand). Die Inhalte sind frei erfunden und nur zur Veranschaulichung – nicht medizinisch geprüft."
 ],
 "stufen": {
  "muster": "^\\\\d{2}-S(\\\\d)",
  "reihenfolge": [
   "0",
   "1",
   "2",
   "3",
   "4",
   "5"
  ]
 },
 "einsatzstufen": [
  {
   "stufe": "S5 Reanimation",
   "rettungsmittel": "RTW-C>RTW>KTW",
   "nfs_erforderlich": false,
   "notarzt": "schnellster",
   "sondersignal": true,
   "kategorie": "kritisch",
   "transport_prozent": 70
  },
  {
   "stufe": "S4 Notarzt",
   "rettungsmittel": "RTW-C>RTW>KTW",
   "nfs_erforderlich": false,
   "notarzt": "nef",
   "sondersignal": true,
   "kategorie": "kritisch",
   "transport_prozent": 85
  },
  {
   "stufe": "S3 Notfall",
   "rettungsmittel": "RTW-C>RTW>KTW",
   "nfs_erforderlich": true,
   "notarzt": "nein",
   "sondersignal": true,
   "kategorie": "dringend",
   "transport_prozent": 80
  },
  {
   "stufe": "S2 Dringend",
   "rettungsmittel": "RTW>KTW>RTW-C",
   "nfs_erforderlich": false,
   "notarzt": "nein",
   "sondersignal": false,
   "kategorie": "dringend",
   "transport_prozent": 70
  },
  {
   "stufe": "S1 Nicht dringend",
   "rettungsmittel": "KTW>RTW",
   "nfs_erforderlich": false,
   "notarzt": "nein",
   "sondersignal": false,
   "kategorie": "stabil",
   "transport_prozent": 50
  },
  {
   "stufe": "S0 Beratung",
   "rettungsmittel": "",
   "nfs_erforderlich": false,
   "notarzt": "nein",
   "sondersignal": false,
   "kategorie": "stabil",
   "transport_prozent": 0
  }
 ],
 "globale_fragen": {
  "phase_1_einsatzort": [
   {
    "id": "ort_adresse",
    "text": "Wo ist der Notfall? (Ort, Straße, Hausnummer)",
    "typ": "text"
   },
   {
    "id": "ort_zusatz",
    "text": "Genauere Angaben zum Ort (Stiege, Stock, Zufahrt, Merkmale)",
    "typ": "text"
   }
  ],
  "phase_2_rueckruf": [
   {
    "id": "rueckrufnummer",
    "text": "Unter welcher Nummer erreichen wir Sie?",
    "typ": "text"
   }
  ],
  "phase_3_was_ist_passiert": [
   {
    "id": "schilderung",
    "text": "Was ist passiert? (Schilderung in Stichworten)",
    "typ": "text"
   },
   {
    "id": "anrufer",
    "text": "Wer ruft an?",
    "typ": "single",
    "optionen": [
     {
      "wert": "1",
      "label": "Betroffene Person selbst"
     },
     {
      "wert": "2",
      "label": "Jemand bei der Person"
     },
     {
      "wert": "3",
      "label": "Jemand, der nicht bei der Person ist"
     },
     {
      "wert": "einrichtung",
      "label": "Arzt / Pflege / Einrichtung"
     },
     {
      "wert": "polizei",
      "label": "Polizei"
     },
     {
      "wert": "ls",
      "label": "Andere Leitstelle"
     },
     {
      "wert": "system",
      "label": "Automatische Meldung"
     }
    ]
   },
   {
    "id": "kapitel",
    "text": "Hauptbeschwerde wählen",
    "typ": "kapitelwahl"
   }
  ],
  "phase_4_primaerabfrage": [
   {
    "id": "anzahl_patienten",
    "text": "Wie viele Personen brauchen Hilfe?",
    "typ": "single",
    "optionen": [
     {
      "wert": "1",
      "label": "Eine"
     },
     {
      "wert": "n",
      "label": "Mehrere"
     },
     {
      "wert": "unbekannt",
      "label": "Weiß nicht"
     }
    ]
   },
   {
    "id": "alter",
    "text": "Wie alt ist die Person ungefähr?",
    "typ": "zahl",
    "hinweis": "Schätzung reicht."
   },
   {
    "id": "geschlecht",
    "text": "Ist die Person ein Mann oder eine Frau?",
    "typ": "single",
    "optionen": [
     {
      "wert": "m",
      "label": "Mann"
     },
     {
      "wert": "w",
      "label": "Frau"
     },
     {
      "wert": "unbekannt",
      "label": "Weiß nicht / divers"
     }
    ]
   },
   {
    "id": "bw",
    "text": "Ist die Person wach und reagiert sie normal?",
    "typ": "single",
    "optionen": [
     {
      "wert": "ja",
      "label": "Ja, wach und normal"
     },
     {
      "wert": "getruebt",
      "label": "Wach, aber verwirrt oder sehr schläfrig"
     },
     {
      "wert": "nein",
      "label": "Nein, reagiert nicht"
     },
     {
      "wert": "unbekannt",
      "label": "Weiß nicht"
     }
    ]
   },
   {
    "id": "at",
    "text": "Atmet die Person? Wie?",
    "typ": "single",
    "optionen": [
     {
      "wert": "normal",
      "label": "Ja, normal"
     },
     {
      "wert": "abnorm",
      "label": "Ja, aber schwer / mit Atemnot"
     },
     {
      "wert": "agonal",
      "label": "Nur vereinzelte Schnapper"
     },
     {
      "wert": "keine",
      "label": "Nein, atmet nicht"
     },
     {
      "wert": "unbekannt",
      "label": "Weiß nicht"
     }
    ]
   }
  ]
 },
 "kapitel": {
  "01": {
   "kapitel": "01",
   "thema": "atemnot",
   "titel": "Atemnot",
   "stichworte": [
    "Atemnot",
    "kriegt keine Luft",
    "Asthma",
    "schnauft schwer"
   ],
   "primaerabfrage": true,
   "kreislaufstillstand": {
    "code": "01-S5-01"
   },
   "fragen": [
    {
     "id": "spricht",
     "merkmal": "sprachschw",
     "text": "Kann die Person in ganzen Sätzen sprechen?",
     "typ": "single",
     "optionen": [
      {
       "wert": "saetze",
       "label": "Ja, ganze Sätze",
       "merkmal_wert": "nein"
      },
      {
       "wert": "teile",
       "label": "Nur Satzteile / einzelne Wörter",
       "merkmal_wert": "ja"
      },
      {
       "wert": "gar_nicht",
       "label": "Kann gar nicht sprechen"
      },
      {
       "wert": "unbekannt",
       "label": "Weiß nicht"
      }
     ]
    },
    {
     "id": "farbe",
     "merkmal": "hautfarbe",
     "text": "Sind Lippen oder Gesicht bläulich oder grau?",
     "typ": "single",
     "optionen": [
      {
       "wert": "ja",
       "label": "Ja"
      },
      {
       "wert": "nein",
       "label": "Nein"
      },
      {
       "wert": "unbekannt",
       "label": "Weiß nicht"
      }
     ]
    }
   ],
   "regeln": [
    {
     "wenn": {
      "q": "bw",
      "in": [
       "nein",
       "getruebt"
      ]
     },
     "code": "01-S4-01"
    },
    {
     "wenn": {
      "any": [
       {
        "q": "spricht",
        "in": [
         "gar_nicht"
        ]
       },
       {
        "q": "farbe",
        "in": [
         "ja"
        ]
       }
      ]
     },
     "code": "01-S4-02"
    },
    {
     "wenn": {
      "q": "alter",
      "lt": 6,
      "unbekannt_ist": false
     },
     "code": "01-S3-02"
    },
    {
     "wenn": {
      "q": "spricht",
      "in": [
       "teile",
       "unbekannt"
      ]
     },
     "code": "01-S3-01"
    },
    {
     "code": "01-S2-01"
    }
   ],
   "suffix": {
    "regeln": [],
    "standard": ""
   }
  },
  "02": {
   "kapitel": "02",
   "thema": "sturz",
   "titel": "Sturz",
   "stichworte": [
    "gestürzt",
    "hingefallen",
    "Leiter",
    "Treppe",
    "liegt am Boden"
   ],
   "primaerabfrage": true,
   "kreislaufstillstand": {
    "code": "02-S5-01"
   },
   "fragen": [
    {
     "id": "hoehe",
     "text": "Aus welcher Höhe ist die Person gefallen?",
     "typ": "single",
     "optionen": [
      {
       "wert": "eben",
       "label": "Auf ebener Erde / aus dem Stand",
       "merkmal_wert": "boden"
      },
      {
       "wert": "niedrig",
       "label": "Bis etwa 3 Meter (Stufen, Sessel, kleine Leiter)",
       "merkmal_wert": "treppe"
      },
      {
       "wert": "hoch",
       "label": "Mehr als 3 Meter",
       "merkmal_wert": "gross"
      },
      {
       "wert": "unbekannt",
       "label": "Weiß nicht"
      }
     ]
    },
    {
     "id": "blutung",
     "merkmal": "blutung_stark",
     "text": "Blutet es stark, oder ist der Kopf verletzt?",
     "typ": "single",
     "optionen": [
      {
       "wert": "ja",
       "label": "Ja"
      },
      {
       "wert": "nein",
       "label": "Nein"
      },
      {
       "wert": "unbekannt",
       "label": "Weiß nicht"
      }
     ]
    },
    {
     "id": "huefte",
     "text": "Kann die Person ein Bein nicht bewegen, oder ist ein Bein verdreht/verkürzt?",
     "typ": "single",
     "optionen": [
      {
       "wert": "ja",
       "label": "Ja"
      },
      {
       "wert": "nein",
       "label": "Nein"
      },
      {
       "wert": "unbekannt",
       "label": "Weiß nicht"
      }
     ]
    },
    {
     "id": "schmerz",
     "text": "Hat die Person Schmerzen?",
     "typ": "single",
     "optionen": [
      {
       "wert": "ja",
       "label": "Ja"
      },
      {
       "wert": "nein",
       "label": "Nein"
      },
      {
       "wert": "unbekannt",
       "label": "Weiß nicht"
      }
     ]
    },
    {
     "id": "liegezeit",
     "text": "Wie lange liegt die Person schon am Boden?",
     "typ": "single",
     "optionen": [
      {
       "wert": "kurz",
       "label": "Weniger als 1 Stunde"
      },
      {
       "wert": "lang",
       "label": "1 Stunde oder länger"
      },
      {
       "wert": "steht",
       "label": "Liegt nicht mehr"
      },
      {
       "wert": "unbekannt",
       "label": "Weiß nicht"
      }
     ]
    }
   ],
   "regeln": [
    {
     "wenn": {
      "q": "bw",
      "in": [
       "nein",
       "getruebt"
      ]
     },
     "code": "02-S4-01"
    },
    {
     "wenn": {
      "q": "hoehe",
      "in": [
       "hoch"
      ]
     },
     "code": "02-S4-02"
    },
    {
     "wenn": {
      "q": "blutung",
      "in": [
       "ja"
      ]
     },
     "code": "02-S3-01"
    },
    {
     "wenn": {
      "q": "huefte",
      "in": [
       "ja"
      ]
     },
     "code": "02-S3-02"
    },
    {
     "wenn": {
      "q": "schmerz",
      "in": [
       "ja",
       "unbekannt"
      ]
     },
     "code": "02-S2-01"
    },
    {
     "code": "02-S1-01"
    }
   ],
   "suffix": {
    "regeln": [
     {
      "wenn": {
       "q": "liegezeit",
       "in": [
        "lang"
       ]
      },
      "suffix": "/L"
     }
    ],
    "standard": ""
   },
   "aufwertung": {
    "4": "02-S4-00"
   },
   "polizei_kennung": {
    "02-S3-01": "02-S3-01/P"
   }
  },
  "03": {
   "kapitel": "03",
   "thema": "brustschmerz",
   "titel": "Brustschmerz",
   "stichworte": [
    "Brustschmerz",
    "Druck auf der Brust",
    "Herz",
    "Engegefühl"
   ],
   "primaerabfrage": true,
   "kreislaufstillstand": {
    "code": "03-S5-01"
   },
   "fragen": [
    {
     "id": "kaltschweiss",
     "text": "Ist die Person blass und kaltschweißig?",
     "typ": "single",
     "optionen": [
      {
       "wert": "ja",
       "label": "Ja"
      },
      {
       "wert": "nein",
       "label": "Nein"
      },
      {
       "wert": "unbekannt",
       "label": "Weiß nicht"
      }
     ]
    },
    {
     "id": "atemnot_bs",
     "text": "Hat die Person zusätzlich Atemnot?",
     "typ": "single",
     "optionen": [
      {
       "wert": "ja",
       "label": "Ja"
      },
      {
       "wert": "nein",
       "label": "Nein"
      },
      {
       "wert": "unbekannt",
       "label": "Weiß nicht"
      }
     ]
    },
    {
     "id": "husten_bs",
     "text": "Wird der Schmerz nur beim Husten oder tiefen Einatmen stärker, und ist die Person unter 35?",
     "typ": "single",
     "optionen": [
      {
       "wert": "ja",
       "label": "Ja"
      },
      {
       "wert": "nein",
       "label": "Nein"
      },
      {
       "wert": "unbekannt",
       "label": "Weiß nicht"
      }
     ],
     "anzeigen_wenn": {
      "q": "alter",
      "lt": 35,
      "unbekannt_ist": false
     }
    }
   ],
   "regeln": [
    {
     "wenn": {
      "q": "bw",
      "in": [
       "nein",
       "getruebt"
      ]
     },
     "code": "03-S4-01"
    },
    {
     "wenn": {
      "any": [
       {
        "q": "kaltschweiss",
        "in": [
         "ja"
        ]
       },
       {
        "q": "atemnot_bs",
        "in": [
         "ja"
        ]
       },
       {
        "q": "at",
        "in": [
         "abnorm",
         "agonal"
        ]
       }
      ]
     },
     "code": "03-S4-02"
    },
    {
     "wenn": {
      "q": "alter",
      "gte": 35
     },
     "code": "03-S3-01"
    },
    {
     "wenn": {
      "q": "husten_bs",
      "in": [
       "ja"
      ]
     },
     "code": "03-S0-01"
    },
    {
     "code": "03-S2-01"
    }
   ],
   "suffix": {
    "regeln": [],
    "standard": ""
   }
  }
 },
 "codes": {
  "01-S5-01": {
   "name": "Atemnot – Atemstillstand / Kreislaufstillstand",
   "kategorie": "S5 Reanimation",
   "kapitel": "01 - Atemnot"
  },
  "01-S4-01": {
   "name": "Atemnot – bewusstseinsgetrübt",
   "kategorie": "S4 Notarzt",
   "kapitel": "01 - Atemnot"
  },
  "01-S4-02": {
   "name": "Atemnot – kann nicht sprechen, blau/grau",
   "kategorie": "S4 Notarzt",
   "kapitel": "01 - Atemnot"
  },
  "01-S3-01": {
   "name": "Atemnot – deutlich, spricht in Satzteilen",
   "kategorie": "S3 Notfall",
   "kapitel": "01 - Atemnot"
  },
  "01-S3-02": {
   "name": "Atemnot – Kind unter 6 Jahren",
   "kategorie": "S3 Notfall",
   "kapitel": "01 - Atemnot"
  },
  "01-S2-01": {
   "name": "Atemnot – leicht, spricht normal",
   "kategorie": "S2 Dringend",
   "kapitel": "01 - Atemnot"
  },
  "02-S5-01": {
   "name": "Sturz – Kreislaufstillstand",
   "kategorie": "S5 Reanimation",
   "kapitel": "02 - Sturz"
  },
  "02-S4-01": {
   "name": "Sturz – bewusstlos oder bewusstseinsgetrübt",
   "kategorie": "S4 Notarzt",
   "kapitel": "02 - Sturz"
  },
  "02-S4-02": {
   "name": "Sturz – aus großer Höhe (über 3 m)",
   "kategorie": "S4 Notarzt",
   "kapitel": "02 - Sturz"
  },
  "02-S3-01": {
   "name": "Sturz – starke Blutung oder Kopfverletzung",
   "kategorie": "S3 Notfall",
   "kapitel": "02 - Sturz"
  },
  "02-S3-02": {
   "name": "Sturz – vermutlicher Knochenbruch Hüfte/Oberschenkel",
   "kategorie": "S3 Notfall",
   "kapitel": "02 - Sturz"
  },
  "02-S2-01": {
   "name": "Sturz – Schmerzen, sonst stabil",
   "kategorie": "S2 Dringend",
   "kapitel": "02 - Sturz"
  },
  "02-S2-01/L": {
   "name": "Sturz – Schmerzen, liegt über 1 Stunde am Boden",
   "kategorie": "S2 Dringend",
   "kapitel": "02 - Sturz"
  },
  "02-S1-01": {
   "name": "Sturz – nicht verletzt, braucht Hilfe beim Aufstehen",
   "kategorie": "S1 Nicht dringend",
   "kapitel": "02 - Sturz"
  },
  "02-S1-01/L": {
   "name": "Sturz – nicht verletzt, liegt über 1 Stunde am Boden",
   "kategorie": "S2 Dringend",
   "kapitel": "02 - Sturz"
  },
  "02-S4-00": {
   "name": "Sturz – manuell aufgewertet (Notarzt)",
   "kategorie": "S4 Notarzt",
   "kapitel": "02 - Sturz"
  },
  "02-S3-01/P": {
   "name": "Sturz – starke Blutung, Polizei verständigt",
   "kategorie": "S3 Notfall",
   "kapitel": "02 - Sturz"
  },
  "03-S5-01": {
   "name": "Brustschmerz – Kreislaufstillstand",
   "kategorie": "S5 Reanimation",
   "kapitel": "03 - Brustschmerz"
  },
  "03-S4-01": {
   "name": "Brustschmerz – bewusstseinsgetrübt",
   "kategorie": "S4 Notarzt",
   "kapitel": "03 - Brustschmerz"
  },
  "03-S4-02": {
   "name": "Brustschmerz – blass, kaltschweißig oder Atemnot",
   "kategorie": "S4 Notarzt",
   "kapitel": "03 - Brustschmerz"
  },
  "03-S3-01": {
   "name": "Brustschmerz – ab 35 Jahren",
   "kategorie": "S3 Notfall",
   "kapitel": "03 - Brustschmerz"
  },
  "03-S2-01": {
   "name": "Brustschmerz – unter 35 Jahren, sonst unauffällig",
   "kategorie": "S2 Dringend",
   "kapitel": "03 - Brustschmerz"
  },
  "03-S0-01": {
   "name": "Brustschmerz – atemabhängig nach Husten, telefonische Beratung",
   "kategorie": "S0 Beratung",
   "kapitel": "03 - Brustschmerz"
  }
 }
}
`;function it(z={}){const m=z.satz??Zt(),F={codes:structuredClone(m.codes??[])},ne=kn("ktsek"),K=z.name??(ne?ne.replace(/\.json$/i,""):null),G=p("div",{class:"kte"}),w=p("div",{class:"kte-kopf"}),te=p("input",{type:"text",name:"satzname",placeholder:"Name der Datei"});te.value=K??"Meine KT-SEK-Codes";const W=p("label",{class:"fld"});W.append(p("span",{class:"fld-label"},"Name der Datei"),te),w.appendChild(W);const de=p("div",{class:"kte-pruefung"}),se=p("div",{class:"mh-reiter"}),re=p("div",{class:"kte-inhalt"});G.append(w,de,se,re);let U="",_=null;const V=()=>{const d=Xt({codes:F.codes},Qt());de.innerHTML="";const v=p("div",{class:`kte-status ${d.fehler.length?"fehler":"ok"}`});if(v.textContent=d.fehler.length?`${d.fehler.length} Problem${d.fehler.length===1?"":"e"} – so nur als Entwurf speicherbar`:`Alles vollständig: jede mögliche Kombination hat genau einen Code (${F.codes.length} Codes)`,de.appendChild(v),d.fehler.length||d.hinweise.length){const L=p("ul",{class:"kte-liste"});let R=0;d.fehler.forEach(C=>{const D=p("li",{class:"fehler"},C),ce=C.startsWith("Kein Code für")?d.fehlend[R++]:void 0;if(ce){const A=p("button",{class:"btn small",type:"button"},"Code anlegen");A.addEventListener("click",()=>De(ce)),D.appendChild(A)}L.appendChild(D)});for(const C of d.hinweise)L.appendChild(p("li",{class:"hinweis"},C));de.appendChild(L)}return Se?.setActionEnabled(2,d.fehler.length===0),d},De=(d={})=>{F.codes.unshift({code:"",name:"",kapitel:"",bed:{...d}}),_=0,U="",q()};function we(){const d=p("div",{class:"kte-leiste"}),v=p("input",{type:"search",placeholder:"Codes durchsuchen …",class:"kte-suche"});v.value=U,v.addEventListener("input",()=>{U=v.value,C()});const L=p("button",{class:"btn small primary",type:"button"},"+ Neuer Code");L.addEventListener("click",()=>De()),d.append(v,L);const R=p("div",{class:"kte-codes"});re.append(d,R);const C=()=>{R.innerHTML="";const A=U.trim().toLowerCase();F.codes.forEach((y,O)=>{A&&!`${y.code} ${y.name} ${Fn(y.bed)}`.toLowerCase().includes(A)&&_!==O||R.appendChild(O===_?ce(y):D(y,O))}),R.childElementCount||R.appendChild(p("p",{class:"muted"},"Keine Codes gefunden."))},D=(A,y)=>{const O=p("div",{class:"kte-zeile"});O.innerHTML=`<b class="kte-code">${tn(A.code||"(ohne Namen)")}</b><span class="kte-name">${tn(A.name)}</span><span class="muted small kte-bed">${tn(Fn(A.bed))}</span>`;const ie=p("div",{class:"row-btns"}),H=p("button",{class:"btn small",type:"button",title:"Bearbeiten"},"✎");H.addEventListener("click",()=>{_=y,C()});const Q=p("button",{class:"btn small",type:"button",title:"Kopieren"},"⧉");Q.addEventListener("click",()=>{F.codes.splice(y+1,0,{...structuredClone(A),code:`${A.code}-Kopie`}),_=y+1,V(),C()});const Y=p("button",{class:"btn small danger-text",type:"button",title:"Löschen"},"✕");return Y.addEventListener("click",()=>{F.codes.splice(y,1),_=null,V(),C()}),ie.append(H,Q,Y),O.appendChild(ie),O},ce=(A,y)=>{const O=p("div",{class:"kte-form"}),ie=p("div",{class:"form-grid"}),H=(j,Z)=>{const ge=p("label",{class:"fld"});ge.append(p("span",{class:"fld-label"},j),Z),ie.appendChild(ge)},Q=p("input",{type:"text",name:"code",placeholder:"z. B. KTR-90T3"});Q.value=A.code,Q.addEventListener("input",()=>{A.code=Q.value.trim(),V()});const Y=p("input",{type:"text",name:"name",placeholder:"Bezeichnung"});Y.value=A.name,Y.addEventListener("input",()=>A.name=Y.value);const he=p("input",{type:"text",name:"kapitel",placeholder:"Gruppe in der Auswahl (optional)"});he.value=A.kapitel??"",he.addEventListener("input",()=>A.kapitel=he.value),H("Code *",Q),H("Bezeichnung",Y),H("Gruppe",he);for(const j of er){const Z=p("select",{name:`bed-${j}`});Z.appendChild(p("option",{value:""},j==="fahrt"?"– bitte wählen –":"beliebig"));for(const[ge,Fe]of Object.entries(Cn[j].werte))Z.appendChild(p("option",{value:ge},Fe));Z.value=A.bed[j]??"",Z.addEventListener("change",()=>{Z.value?A.bed[j]=Z.value:delete A.bed[j],V()}),H(Cn[j].label+(j==="fahrt"?" *":""),Z)}O.appendChild(ie);const ze=p("button",{class:"btn small primary",type:"button"},"Fertig");return ze.addEventListener("click",()=>{_=null,C()}),O.appendChild(ze),O};C()}function q(){se.innerHTML="",se.appendChild(p("p",{class:"muted small"},`${F.codes.length} Codes · die Fragen der KT-Hotline sind die eingebauten`)),re.innerHTML="",we(),V()}const ye=async d=>{const v=Xe(te.value.trim()||"Meine KT-SEK-Codes");if(/^LeitWerk/i.test(v))return Re("Bitte einen eigenen Namen wählen – die eingebauten Codes bleiben unverändert","error"),!1;const L=V();if(!d&&L.fehler.length)return!1;const R=(await st("ktsek")).find(D=>D.name.toLowerCase()===v.toLowerCase());if(R&&R.name.toLowerCase()!==(K??"").toLowerCase()&&!await qt("Datei ersetzen?",`Es gibt schon eine Datei „${R.name}“.`,"Ersetzen"))return!1;const C=d?{entwurf:!0}:{};return await lt(Yt.kt.codes,`${v}.json`,JSON.stringify({...C,codes:F.codes.filter(D=>D.code||D.name)})),d?Re(`Entwurf „${v}“ gespeichert – ${L.fehler.length} Problem${L.fehler.length===1?"":"e"} offen`):await bn("ktsek",`${v}.json`).then(D=>Re(D)).catch(D=>Re(String(D.message??D),"error")),z.fertig?.(),!0},Se=Ut({title:"KT/SEK-Codes bearbeiten",body:G,wide:!0,actions:[{label:"Abbrechen"},{label:"Als Entwurf speichern",onClick:()=>ye(!0)},{label:"Speichern & verwenden",kind:"primary",onClick:()=>ye(!1)}]});Se.root.parentElement?.classList.add("kte-dlg"),q()}const{ok:E,grau:f,gelb:T,blau:ee,rot:Ze}=Pi,M="nur im Programm",I="wird geprüft …",x={},wn={},ot={},pn={},Ue={},ke={};let ue=null;function ji(z,m){if(wn[z]=m,z.startsWith("ak_"))return void ot[z]?.(String(m??""));const F=z.match(/^kp_(.+)$/);F?ue?.regionSchalten(F[1],!!m):z.startsWith("tq_")&&ue?.bald()}const B=z=>z.toLocaleString("de-DE"),oe=(z,m=1)=>z.toFixed(m).replace(".",","),be=(z,m)=>`${Math.min(100,Math.round(z/Math.max(1,m)*100))} %`,Ne=z=>String(z?.message??z),at=z=>String(z??"").toLowerCase().replace(/ä/g,"a").replace(/ö/g,"o").replace(/ü/g,"u").replace(/ß/g,"ss"),qe=z=>new Promise(m=>setTimeout(m,z));async function Ye(z){return Ii(await z.arrayBuffer())}function Ji(z){const m={};let F=!1,ne=0;const K=()=>{F||z()},G=()=>{ne||F||(ne=window.setTimeout(()=>{ne=0,K()},200))},w=Pn(),te=async()=>{m.dateien=(await lr().catch(()=>[])).filter(e=>e.art!=="alarm"),K()},W=async()=>{w&&(m.ki=await Le().catch(()=>null),K())},de=async()=>{w&&(m.ram=await or().catch(()=>0),K())},se=async()=>{w&&(m.piper=await ur().catch(()=>[]),K())},re=async()=>{w&&(m.whisper=(await dr().catch(()=>({modelle:[],ordner:""}))).modelle,K())},U=async()=>{try{await cr().catch(()=>{});const e=await hr("Namen");m.namen=e.filter(n=>/\.(csv|txt)$/i.test(n.datei)).sort((n,t)=>n.datei===fe?-1:t.datei===fe?1:n.datei.localeCompare(t.datei,"de"))}catch{m.namen=[]}K()},_=async()=>{const e=Object.keys(Mn),n=await Promise.all(e.map(t=>st(t).catch(()=>[])));m.teile=Object.fromEntries(e.map((t,r)=>[t,n[r]])),K()},V=async()=>{if(w){m.local=await gr().catch(()=>null),m.geo=await mr().catch(()=>null),K();try{m.packs=await fr(),m.packsFehler=void 0}catch(e){m.packsFehler=Ne(e),m.packs??=null}K()}},De=async()=>{m.version=await pr().catch(()=>"?"),m.update=Wn(),m.basis=await kr().catch(e=>Ne(e)),K()};let we=0;const q=[],ye=()=>{q.push(b.onChange(()=>{we++,G()})),q.push(rr(()=>G())),q.push(ir(()=>G())),q.push(ar(()=>G())),q.push(sr(()=>{m.update=Wn(),G()}));const e=()=>G();In.add(e),q.push(()=>In.delete(e))};ue={bald:G,regionSchalten(e,n){w&&Xr(e,n).then(()=>dn()).catch(t=>console.warn("Region",t)).finally(()=>void V())}};const Se=(e,n)=>async()=>{try{const t=await e();return typeof t=="string"?t:void 0}finally{try{await n?.()}catch{}K()}},d=(e,n,t={},r)=>({l:e,...t,act:Se(n,r)}),v=(e,n,t,r)=>({l:e,datei:{accept:n,f:s=>Se(()=>t(s[0]),r)()}});async function L(e,n,t){if(x[e])throw new Error("Läuft schon");x[e]=n,G();try{return await t(r=>{x[e]=r,ue?.bald()})}finally{delete x[e],ue?.bald()}}function R(e){const n=b.settings.funkgruppe??"NÖ-03";return[...yr.map(t=>e.C(t.id+(t.id===n?" (deine)":""),"fgc_"+t.id,Fr[t.id],t.bezirke,["fgo_"+t.id,!0])),e.B("",[d("Standardfarben",()=>(gn({funkFarben:{},funkGruppen:{}}),"Zurückgesetzt"),{cfm:"Alle Funkgruppen wieder einblenden und die Standardfarben verwenden?"})])]}function C(e){return[...b.settings.status.map((n,t)=>e.C(`${n.nummer} – ${n.name}`,"sf_st"+(t+1),Dr(n.key),Tn(n.key))),e.B("",[d("Farben der Leitstelle verwenden",()=>(gn({statusFarben:{}}),"Zurückgesetzt"),{cfm:"Eigene Statusfarben verwerfen?"})])]}const D={notruf:"te_notruf",kt:"te_kt",anklopfen:"te_anklopfen",funk:"te_funk",funkDringend:"te_funkD",chat:"te_chat",warnung:"te_warn"};function ce(e){return Object.entries(hn).map(([n,t])=>e.TON(t,D[n],jr[Jr[n].slice(8)]?.name??""))}function A(e){const n=[],t=m.dateien;if(!t)n.push(e.I("Eigene Dateien",I,"",f));else if(!t.length)n.push(e.I("Eigene Dateien","noch keine","Unten hochladen – danach unter „Töne je Ereignis“ auswählbar",f));else{const l=Jn().sounds;for(const a of t){const u=Object.keys(hn).filter(c=>l[c]?.quelle===`datei:${a.id}`).map(c=>`„${hn[c]}“`);n.push(e.IT(a.name,`${oe(a.sek)} s · ${Math.max(1,Math.round(a.bytes/1e3))} KB${u.length?` · für ${u.join(", ")}`:""}`,"","",{btns:[d("▶",()=>(Je("chat",`datei:${a.id}`,70),"▶ läuft")),d("Löschen",async()=>{await Vr(a.id);const c={...Jn().sounds};for(const[o,h]of Object.entries(c))h.quelle===`datei:${a.id}`&&delete c[o];return gn({sounds:c}),"Gelöscht"},{cfm:`„${a.name}“ löschen? Ereignisse, die ihn nutzen, bekommen wieder den Standardton.`},te)]}))}}const r=l=>async a=>{const u=await yi(a,l);return mn("Töne",a.name,await a.arrayBuffer()),`„${u.name}“ gespeichert (${oe(u.sek)} s)`},s=".mp3,.wav,audio/mpeg,audio/wav";n.push(e.B("Hochladen",[v("Klingelton …",s,r("klingel"),te),v("Kurzer Ton …",s,r("kurz"),te)],`Klingelton bis ${Vn.klingel.maxSek} s, kurzer Ton bis ${Vn.kurz.maxSek} s · MP3, WAV`));const i=(t??[]).reduce((l,a)=>l+a.bytes,0);return n.push(e.I("Belegt",t?`${oe(i/1e6,2)} MB`:"…","",f)),n}const y=e=>!!m.ki?.modelle.some(n=>n===e||n.startsWith(e)),O=[{role:"system",content:"Du spielst eine echte Person, die beim Notruf 144 in Niederösterreich anruft: Dein Vater (78) ist im Garten von der Leiter gefallen und blutet am Kopf, er ist wach, aber ganz blass. Du bist aufgeregt. Sag nur, was du ins Telefon sprichst: kurz, umgangssprachlich österreichisch, keine Listen."},{role:"user",content:"Leitstelle: Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?"},{role:"assistant",content:"Gartengasse 4 in Gföhl, bitte schnell!"},{role:"user",content:"Leitstelle: Was ist denn passiert?"}];async function ie(){if(!w)throw new Error("Die lokale KI gibt es nur im Programm");const e=await Le();if(m.ki=e,!e.installiert)throw new Error("Ollama ist nicht installiert");if(!e.laeuft)throw new Error("Ollama läuft nicht – erst starten");const n=$e().modell;if(!y(n))throw new Error(`Modell ${n} ist nicht geladen (Sprachmodelle → Laden)`);const t=performance.now();let r=0;return{antwort:await Ci(O,()=>{r||(r=performance.now())}),s1:((r||performance.now())-t)/1e3,s2:(performance.now()-t)/1e3}}const H=async()=>{if(!un())throw new Error("Noch kein Schlüssel – unter „Einrichten“ einfügen");return`Gemini antwortet: ${await qn()}`};function Q(e){const n="Läuft auf deinem PC – ohne Internet, ohne Konto";if(!w)return e.B("Lokale KI (Ollama)",[],n,{chip:M,dot:f});if(x.ollama)return e.B("Lokale KI (Ollama)",[],n,{chip:x.ollama,dot:ee});const t=m.ki;return t===void 0?e.B("Lokale KI (Ollama)",[],n,{chip:I,dot:f}):t===null?e.B("Lokale KI (Ollama)",[d("Prüfen",()=>{},{},W)],n,{chip:"Status unbekannt",dot:T}):t.installiert?t.laeuft?e.B("Lokale KI (Ollama)",[d("Beenden",async()=>(await Ur(),"Beendet"),{},W)],n,{chip:"installiert · läuft",dot:E}):e.B("Lokale KI (Ollama)",[d("Starten",async()=>{await Zr();for(let r=0;r<10;r++){if((await Le()).laeuft)return"Läuft";await qe(1e3)}throw new Error("Ollama startet nicht")},{},W)],n,{chip:`installiert${t.version?` (${t.version})`:""} · läuft nicht`,dot:T}):e.B("Lokale KI (Ollama)",[d("Installieren",()=>L("ollama","wird heruntergeladen …",async r=>{const s=await Qr(i=>r(i.total?`${i.text||"lädt"} ${be(i.done,i.total)}`:i.text||"läuft …"));for(let i=0;i<20&&(await qe(1500),!(await Le()).laeuft);i++);return s||"Installiert"}),{},W)],n,{chip:"nicht installiert",dot:f})}const Y="https://aistudio.google.com/apikey";function he(e){return[e.B("1. Schlüssel holen",[d("Seite von Google öffnen",async()=>{if(!w)return window.open(Y,"_blank","noopener"),"Im Browser geöffnet";try{return await navigator.clipboard.writeText(Y),"Adresse kopiert – im Browser einfügen: aistudio.google.com/apikey"}catch{return"Im Browser öffnen: aistudio.google.com/apikey"}})],"Mit deinem Google-Konto anmelden, „API-Schlüssel erstellen“, kopieren"),e.F("2. Schlüssel einfügen","gkey","Schlüssel einfügen …",on()?"✓ geprüft – Gemini ist bereit":un()?"Noch nicht geprüft":"",{pw:!0,btns:[d("Prüfen",async()=>{if(ei().schluessel.trim().length<20)throw new Error("Das sieht nicht nach einem Schlüssel aus – bitte ganz kopieren");return`Schlüssel gültig – ${await qn()}`})]}),e.B("3. Ausprobieren",[d("Testanruf mit Gemini",H)])]}async function ze(e){const n=await Le();if(m.ki=n,!n.laeuft)throw new Error("Ollama läuft nicht – erst unter „Telefon, Funk & KI“ starten");return await L(`ki:${e}`,"Download startet …",t=>Yr(e,r=>t(r.total?`wird geladen … ${be(r.done,r.total)}`:r.text||"wird geladen …"))),`${e} geladen`}function j(e){const n=[];if(!w)return n.push(e.I("Dieser Rechner",M,"Die lokale KI gibt es nur im installierten Programm",f)),n;const t=m.ram??0,r=t?jn(t):null;n.push(e.I("Dieser Rechner",m.ram===void 0?I:t?`${t} GB Arbeitsspeicher${r?` · empfohlen: ${Me[r]}`:""}`:"Arbeitsspeicher unbekannt","Größere Modelle sprechen natürlicher, brauchen aber mehr Speicher und antworten langsamer",ee));const s=m.ki;s&&!s.laeuft&&n.push(e.I("Ollama",s.installiert?"läuft nicht":"nicht installiert","Laden und Löschen geht nur, wenn Ollama läuft (Telefon, Funk & KI)",T));const i=$e().modell,l=(a,u,c,o)=>{const h=y(a),g=i===a,k=x[`ki:${a}`],S=k??(g&&h?"aktiv":g?"gewählt · nicht geladen":h?"geladen":t&&o>t?"zu groß":""),P=k?ee:g&&h?E:g?T:h?f:S?T:"",$=[];if(s===void 0){n.push(e.IT(u,c,I,f));return}if(!k){if(h&&!g&&$.push(d("Verwenden",()=>(cn({modell:a}),"Wird verwendet"),{},W)),!h){const N=t>0&&o>t;$.push(d(N?"Trotzdem laden":"Laden",()=>ze(a),N?{cfm:`${a} braucht etwa ${o} GB, dieser Rechner hat ${t} GB. Es kann sein, dass Ollama sehr langsam wird oder das Modell gar nicht lädt. Kaputt geht nichts – du kannst es wieder löschen. Trotzdem laden?`}:{},W)),g||$.push(d("Verwenden",()=>(cn({modell:a}),"Gewählt – noch laden"),{},W))}h&&$.push(d("Löschen",async()=>(await Hr(a),"Gelöscht"),{cfm:`${a} löschen?${g?" Es ist gerade aktiv – danach antwortet die KI einfacher.":""} Du kannst es jederzeit wieder laden.`},W))}n.push(e.IT(u,c,S,P,{btns:$}))};for(const a of Ge)l(a.name,`${Me[a.stufe]} · ${a.name}`,`${oe(a.gb)} GB · ab ${a.ram} GB Arbeitsspeicher · ${a.info}${a.stufe===r?" · empfohlen":""}`,a.ram);for(const a of s?.modelle??[])Ge.some(u=>a===u.name||a.startsWith(u.name))||l(a,`Eigenes · ${a}`,"aus der Ollama-Bibliothek",0);return i&&!Ge.some(a=>a.name===i)&&!(s?.modelle??[]).some(a=>a===i||a.startsWith(i))&&l(i,`Eigenes · ${i}`,"aus der Ollama-Bibliothek",0),n.push(e.F("Anderes Modell","omod","z. B. llama3.1:8b","Name aus der Ollama-Bibliothek – wird geladen und verwendet",{btns:[d("Laden",async()=>{const a=String(wn.omod??"").trim();if(!a)throw new Error("Bitte einen Modellnamen eingeben");return await ze(a),cn({modell:a}),`${a} geladen und verwendet`},{},W)]})),n}function Z(e){if(!w)return[e.I("Stimmen (Piper)",M,"Piper-Stimmen gibt es nur im installierten Programm – im Browser liest der Computer vor",f)];const n=m.piper;return Tr.map(t=>{const r=t.label.match(/^(.*?)\s*\((.*)\)$/),s=r?r[1]:t.label,i=r?r[2]:t.g==="w"?"Frau":"Mann",l=x[`piper:${t.name}`],a=!!n?.includes(t.name),u=[];return n&&!l&&(a?(u.push(d("▶",()=>(Ve(t.g,t.name),"▶ Probe"))),u.push(d("Löschen",async()=>(await ni(t.name),"Gelöscht"),{cfm:`Stimme „${s}“ löschen?`},se))):u.push(d("Laden",async()=>(await L(`piper:${t.name}`,"startet …",c=>ti(t.name,(o,h,g)=>c(g?"wird entpackt …":h?`wird geladen … ${be(o,h)}`:`${Math.round(o/1e6)} MB`))),J().stimmeArt!=="piper"&&je({stimmeArt:"piper"}),`Stimme „${s}“ ist bereit`),{},se))),e.IT(s,`${i} · ${t.mb} MB`,l??(n===void 0?I:a?"geladen":""),l?ee:a?E:"",{btns:u})})}function ge(e){if(!w)return[e.I("Erkennung (Whisper)",M,"Die Spracherkennung auf dem Rechner gibt es nur im installierten Programm",f)];const n=m.whisper,t=J().modell;return Pe.map(r=>{const s=r.label.split(/\s+–\s+/),i=s[0],l=s.slice(1).join(" – "),a=x[`wh:${r.name}`],u=!!n?.includes(r.name),c=u&&t===r.name,o=[];n&&!a&&(u&&!c&&o.push(d("Verwenden",()=>(je({modell:r.name}),"Wird verwendet"))),u||o.push(d("Laden",async()=>(await L(`wh:${r.name}`,"startet …",g=>Yn(r.name,(k,S)=>g(S?`wird geladen … ${be(k,S)}`:`${Math.round(k/1e6)} MB`))),je({modell:r.name}),`„${i}“ ist bereit und wird verwendet`),{},re)),u&&o.push(d("Löschen",async()=>(await ri(r.name),"Gelöscht"),{cfm:`Modell „${i}“ löschen?${c?" Es wird gerade verwendet.":""}`},re)));const h=r.mb>=1e3?`${oe(r.mb/1e3)} GB`:`${r.mb} MB`;return e.IT(i,`${h}${l?` · ${l}`:""}`,a??(n===void 0?I:c?"aktiv":u?"geladen":""),a?ee:c?E:u?f:"",{btns:o})})}const Fe=e=>{const n=Math.round(Math.max(0,Math.min(1,e))*10);return`${"▮".repeat(n)}${"▯".repeat(10-n)}`};async function Ce(e){const n=`pegel:${e}`;return L(n,"Jetzt sprechen …",async t=>{const r=await tt(4,{welches:e,pegel:s=>t(`${Fe(s)}  sprich jetzt …`)});if(!r.startsWith("⚠"))return e==="telefon"&&Ke({mikro:J().mikro}),r;throw new Error(r.replace(/^⚠\s*/,""))})}const Ie=(e,n)=>{const t=x[`pegel:${n}`];return t?[e.I("Pegel",t,"Die Balken sollen beim Sprechen deutlich ausschlagen",ee)]:[]},Sn=()=>(Je("notruf",void 0,70),setTimeout(()=>Ve("w"),1800),"▶ Klingeln, dann eine Stimme – hörst du beides?"),ut=()=>{if(!J().funkVorlesen)throw new Error("„Funk vorlesen“ ist aus (Telefon, Funk & KI)");return Fi("Test","Hier 75 1, Test, kommen.",1),"▶ Funkspruch – kommt er aus dem richtigen Gerät?"},dt=()=>new Promise((e,n)=>{const t=J(),r={[t.taste]:"Telefon",[t.funkTaste]:"Funk"},s=()=>{window.removeEventListener("keydown",l,!0),window.removeEventListener("mousedown",a,!0),clearTimeout(u)},i=c=>r[c]?(s(),Ke({tasten:!0}),e(`✓ ${r[c]}-Sprechtaste (${fn(c)}) erkannt`),!0):!1,l=c=>{i(c.code)&&c.preventDefault()},a=c=>void i(`Mouse${c.button}`),u=window.setTimeout(()=>{s(),n(new Error(`Keine Sprechtaste gedrückt – Telefon: ${fn(t.taste)}, Funk: ${fn(t.funkTaste)}`))},8e3);window.addEventListener("keydown",l,!0),window.addEventListener("mousedown",a,!0)});async function ct(){return L("probeanruf","Es klingelt …",async e=>{if(Je("notruf",void 0,70),await qe(2500),e("Der Anrufer spricht …"),Ve("w"),await qe(5500),!J().eingabe)return Ke({probe:!0}),"Gehört? Die Spracheingabe ist aus – im Spiel tippst du deine Fragen";e("Jetzt antworten: 4 Sekunden sprechen, z. B. „Wo genau ist der Notfallort?“");const n=await tt(4,{welches:"telefon",pegel:t=>e(`${Fe(t)}  sprich jetzt …`)});if(n.startsWith("⚠"))throw new Error(n.replace(/^⚠\s*/,""));return Ke({probe:!0,mikro:J().mikro}),`${n} – so kommt es im Spiel an`})}const me=(e,n="offen")=>e===null?{chip:"nicht nötig",dot:f}:e?{chip:"✓ erledigt",dot:E}:{chip:n,dot:T},ht=()=>Be()==="gemini"?on():!$e().aktiv||!w?null:!!m.ki?.laeuft&&y($e().modell),gt=()=>!J().eingabe||!w?null:!!m.whisper?.includes(J().modell);function mt(e){const n=J(),t=$r(),r=gt(),s=n.eingabe?Br():null,i=n.eingabe?Kr():null,l=ht(),a=Nr(),u=[t,r,s,i,l,a],c=u.filter(h=>h!==!1).length,o=[e.I("So weit bist du",`${c} von ${u.length} Schritten`,"Geh die Schritte von oben nach unten durch. Dauert etwa 5 Minuten. Alles lässt sich später ändern.",c===u.length?E:T),e.H("Schritt 1 · Hören"),e.S("Wie hörst und sprichst du?","auArt",["Headset (Kopfhörer mit Mikrofon)","Lautsprecher und Mikrofon","Telefon und Funk auf getrennten Geräten"],"Headset (Kopfhörer mit Mikrofon)","Ein Headset ist am besten: Du hörst die Anrufer gut, und sie hören sich nicht selbst"),e.L("Kopfhörer bzw. Lautsprecher","sdev",["Wie das System"],"Wie das System","Hier kommen die Anrufer, der Funk und die Töne heraus"),e.B("Probeton",[d("▶ Abspielen",Sn),d("Ich habe beides gehört",()=>(Ke({hoeren:J().geraetStimmen}),"✓ Gemerkt"))],"Zuerst klingelt es, dann spricht eine Stimme. Nichts gehört? Oben ein anderes Gerät wählen und noch einmal",me(t,"noch nicht gehört")),e.H("Schritt 2 · Sprechen statt tippen"),e.T("Mit der Stimme sprechen","eingabe",!0,"Du sprichst mit Anrufern und Fahrzeugen. Aus: Du tippst alles")];if(n.eingabe){const h=Pe.find(S=>/ausgewogen/i.test(S.label))??Pe[0],g=x[`wh:${h.name}`],k=w&&r===!1&&!g?[d(`Laden (${h.mb} MB)`,async()=>(await L(`wh:${h.name}`,"startet …",S=>Yn(h.name,(P,$)=>S($?`wird geladen … ${be(P,$)}`:`${Math.round(P/1e6)} MB`))),je({modell:h.name}),"Spracherkennung ist bereit"),{},re)]:[];k.push({l:"Andere Größe …",sub:"whisper"}),o.push(e.B("Spracherkennung",k,"Damit LeitWerk versteht, was du sagst. Läuft nur auf deinem PC, ohne Internet",g?{chip:g,dot:ee}:r===null?{chip:M,dot:f}:me(r,"noch nicht geladen"))),o.push(e.H("Schritt 3 · Mikrofon")),On()==="getrennt"?o.push(e.L("Mikrofon fürs Telefon","mic",["Wie das System"],"Wie das System")):o.push(e.L("Mikrofon","mic",["Wie das System"],"Wie das System","Beim Headset: das Mikrofon des Headsets")),o.push(e.B("Mikrofon testen",[d("Testen – 4 Sekunden sprechen",()=>Ce("telefon"))],"Klicken und z. B. sagen: „Notruf 144, wo genau ist der Notfallort?“ – danach steht da, was verstanden wurde",me(s,"noch nicht getestet"))),o.push(...Ie(e,"telefon")),o.push(e.H("Schritt 4 · Sprechtasten")),o.push(e.K("Sprechtaste fürs Telefon (gedrückt halten)","kSprech","F9","Solange du sie hältst, hört dich der Anrufer")),o.push(e.K("Sprechtaste für den Funk (gedrückt halten)","kFunk","F10","Solange du sie hältst, sendest du im Funk")),o.push(e.B("Ausprobieren",[d("Jetzt eine Sprechtaste drücken",dt)],"Klicken, dann innerhalb von 8 Sekunden eine der beiden Tasten drücken",me(i,"noch nicht probiert")))}else o.push(e.I("Mikrofon und Sprechtasten","nicht nötig","Die Spracheingabe ist aus – du tippst deine Fragen und Funksprüche",f));return o.push(e.H("Schritt 5 · Wer spielt die Anrufer?")),o.push(e.S("Anrufer-KI","kimodus",["Gemini (Cloud)","Lokal (Ollama)"],"Lokal (Ollama)","Gemini: am natürlichsten, braucht Internet und einen kostenlosen Schlüssel. Lokal: läuft auf deinem PC, braucht einen kräftigen Rechner")),o.push(e.B("Einrichten",Be()==="gemini"?[{l:"Gemini-Schlüssel …",sub:"gemini"}]:[{l:"Lokale KI …",sub:"modelle"}],Be()==="gemini"?"Schlüssel holen und einfügen – Schritt für Schritt erklärt":"Ein Sprachmodell laden – LeitWerk schlägt die passende Größe für deinen PC vor",me(l,"noch nicht bereit"))),o.push(e.H("Schritt 6 · Probeanruf")),o.push(e.B("Probeanruf",[d("Starten",ct)],n.eingabe?"Es klingelt, ein Anrufer spricht, dann antwortest du – so wie im Spiel":"Es klingelt und ein Anrufer spricht – so wie im Spiel",x.probeanruf?{chip:x.probeanruf,dot:ee}:me(a,"noch nicht gemacht"))),o.push(e.B("Mehr einstellen",[{l:"Kopfhörer & Mikrofon",go:["platz","audio"]},{l:"Telefon, Funk & KI",go:["platz","gespraech"]}],"Lautstärken, Funk, Stimmen und alles Weitere")),o}function ft(e){const n=On(),t=n==="getrennt",r=[e.S("Wie hörst und sprichst du?","auArt",["Headset (Kopfhörer mit Mikrofon)","Lautsprecher und Mikrofon","Telefon und Funk auf getrennten Geräten"],"Headset (Kopfhörer mit Mikrofon)","Ein Headset ist am besten. Bei Lautsprechern nicht „Freisprechen“ verwenden – sonst hört sich der Anrufer selbst"),e.H("Hören")];return w||r.push(e.I("Geräte wählen",M,"Im Browser kommt alles aus dem Gerät, das am Computer eingestellt ist",f)),t?(r.push(e.L("Telefon: Anrufer","sdev",["Wie das System"],"Wie das System","Hier hörst du die Anrufer")),r.push(e.B("",[d("▶ Testen",()=>(Ve("w"),"▶ Stimme"))])),r.push(e.L("Funk: Fahrzeuge","fdev",["Wie am Telefon"],"Wie am Telefon","Hier hörst du den Funk")),r.push(e.B("",[d("▶ Testen",ut)])),r.push(e.L("Töne (Klingeln, Funk-Piep)","tdev",["Wie das System"],"Wie das System","Z. B. Klingeln über die Lautsprecher, damit du es auch ohne Headset hörst")),r.push(e.B("",[d("▶ Testen",()=>(Je("notruf",void 0,70),"▶ Klingeln"))])),r.push(e.T("Telefon links, Funk rechts","stereo",!1,"Im Headset: Anrufer nur im linken Ohr, Funk nur im rechten – wie in einer echten Leitstelle. Töne bleiben auf beiden Seiten"))):(r.push(e.L(n==="headset"?"Headset":"Lautsprecher","sdev",["Wie das System"],"Wie das System","Anrufer, Funk und Töne kommen alle hier heraus")),r.push(e.B("Probeton",[d("▶ Abspielen",Sn)],"Zuerst klingelt es, dann spricht eine Stimme")),n==="headset"&&r.push(e.T("Telefon links, Funk rechts","stereo",!1,"Anrufer nur im linken Ohr, Funk nur im rechten – wie in einer echten Leitstelle. Töne bleiben auf beiden Seiten"))),r.push(e.H("Sprechen")),t?(r.push(e.L("Mikrofon fürs Telefon","mic",["Wie das System"],"Wie das System")),r.push(e.B("",[d("Testen – 4 Sekunden sprechen",()=>Ce("telefon"))])),r.push(...Ie(e,"telefon")),r.push(e.L("Mikrofon für den Funk","micFunk",["Wie am Telefon"],"Wie am Telefon")),r.push(e.B("",[d("Testen – 4 Sekunden sprechen",()=>Ce("funk"))])),r.push(...Ie(e,"funk"))):(r.push(e.L("Mikrofon","mic",["Wie das System"],"Wie das System",n==="headset"?"Das Mikrofon des Headsets":"Am besten ein Mikrofon nahe am Mund")),r.push(e.B("Mikrofon testen",[d("Testen – 4 Sekunden sprechen",()=>Ce("telefon"))],"Klicken und sprechen – danach steht da, was verstanden wurde")),r.push(...Ie(e,"telefon"))),r.push(e.H("Lautstärken")),r.push(e.R("Anrufer am Telefon","slaut",0,100,5,85,s=>`${s} %`)),r.push(e.R("Fahrzeuge im Funk","sfLautKi",0,150,5,100,s=>`${s} %`,"Fahrzeuge, die der Computer spricht")),r.push(e.R("Mitspieler im Funk","sfLaut",0,150,5,90,s=>`${s} %`,"Stimmen echter Spieler (Disponenten, Piloten)")),r.push(e.R("Andere Funkgruppen","fgLaut",0,100,5,60,s=>`${s} %`,"Gruppen, die du nur mithörst – dringende Rufe kommen immer voll")),r.push(e.L("Funk, während du telefonierst","fTel",["Normal","Leiser","Stumm"],"Leiser","Dringende Rufe bleiben hörbar")),r.push(e.R("Töne","tlaut",0,100,5,80,s=>`${s} %`,"Klingeln, Funk-Piep, Chat")),r.push(e.R("Deine Stimme im Funk","sfSende",0,200,5,100,s=>`${s} %`,"Wie laut dich die Mitspieler hören")),r.push(e.H("Tipps")),r.push(e.I("Bluetooth-Headset","","Viele Bluetooth-Headsets klingen schlecht, sobald das Mikrofon an ist. Ein Headset mit Kabel oder USB ist besser",f)),r.push(e.I("Nichts zu hören?","","Lautstärke am Computer prüfen und oben das richtige Gerät wählen. Neu angesteckte Geräte erscheinen nach dem Neustart von LeitWerk",f)),r}function pt(e){const n=J(),t=on(),r=un(),s=$e().modell,i=Ge.find(h=>h.name===s),l=m.ram?jn(m.ram):null,a=`${i?`${Me[i.stufe]}: `:""}${s}${m.ram?` · dein PC: ${m.ram} GB Arbeitsspeicher${l?`, passend: ${Me[l]}`:""}`:""}`,u=w?m.ki===void 0?{chip:s,dot:f}:y(s)?{chip:"bereit",dot:E}:{chip:"noch nicht geladen",dot:T}:{chip:M,dot:f},c=m.piper?.length??0,o=Pe.find(h=>h.name===n.modell);return[e.H("Telefon"),e.T("Ich nehme Notrufe an","notrufe",!0,"Aus: Bei dir klingelt kein Notruf (z. B. wenn du nur den Funk machst)"),e.T("Ich nehme die KT-Hotline an","kthot",!0,"Bestellungen von Krankentransporten"),e.T("Ich nehme Überstellungen an","ueberst",!0,"Anrufe von Krankenhäusern, die einen Patienten verlegen"),e.T("Mit der Stimme sprechen","eingabe",!0,"Aus: Du tippst deine Fragen"),e.K("Sprechtaste fürs Telefon (gedrückt halten)","kSprech","F9","Solange du sie hältst, hört dich der Anrufer"),e.T("Erkannten Text gleich abschicken","autosend",!0,"Aus: Du kannst den Text vor dem Abschicken noch ändern"),e.T("Freisprechen (ohne Sprechtaste)","freispr",!1,"Der Anrufer hört dich, sobald du sprichst – nur mit Headset, sonst hört er sich selbst"),e.T("Anrufer vorlesen","vorl",!0,"Aus: Du liest nur mit, was der Anrufer sagt"),e.T("Telefonklang","klang",!0,"Der Anrufer klingt wie am Telefon – über Handy (manchmal mit Aussetzern) oder Festnetz. Nur mit Gemini"),e.S("Hintergrundgeräusche","hgr",["Aus","Dezent","Realistisch"],"Dezent","Was man beim Anrufer hört: Straße, Wohnung, Wind, Stöhnen, Husten, Hund … – passend zum Notfall. Nur mit Gemini"),e.T("Knopf „Gespräch exportieren“","gexp",!1,"Speichert ein Gespräch als Datei – zum Melden von Fehlern"),e.H("Funk"),e.K("Sprechtaste für den Funk (gedrückt halten)","kFunk","F10","Spricht in die Gruppe, die am Funkgerät gewählt ist"),e.K("Eigene Funktaste: normale Gruppe","kFunkN","–","Nur wenn du für jede Gruppe eine eigene Taste willst"),e.K("Eigene Funktaste: RD-NOE-09","kF09","–","Gruppe für Großeinsätze"),e.K("Eigene Funktaste: RD-NOE-10","kF10","–","Zweite Gruppe für Großeinsätze"),e.T("Funk vorlesen","fvorl",!0,"Aus: Du liest die Funksprüche nur mit"),e.T("Funk-Klang","fklang",!0,"Stimmen klingen blechern wie im echten Funk"),e.T("Echte Disponenten hören","echteD",!0,"Nur im Mehrspieler"),e.T("Echte Piloten hören","echteP",!0,"Nur im Mehrspieler"),e.T("Funkmeldungen manchmal unvollständig","unvoll",!0,"Wie im echten Leben: Manchmal fehlt etwas, dann fragst du nach"),e.T("Funk-Aufnahmen an Fehlerberichte anhängen","sfAufn",!1,"Die letzten 10 eigenen Funksprüche – hilft, die Spracherkennung zu verbessern"),e.H("KI – wer spricht Anrufer und Fahrzeuge?"),e.S("Anrufer-KI","kimodus",["Gemini (Cloud)","Lokal (Ollama)"],"Lokal (Ollama)","Gemini: am natürlichsten, braucht Internet. Lokal: läuft auf deinem PC. Fällt Gemini aus, springt die lokale KI ein"),e.B("Gemini",[{l:"Einrichten …",sub:"gemini"},d("Testen",H)],"Kostenloser Schlüssel von Google – bleibt nur auf deinem PC",t?{chip:"bereit",dot:E}:r?{chip:"Schlüssel nicht geprüft",dot:T}:{chip:"nicht eingerichtet",dot:f}),e.T("Gemini versteht den Funk","gfunk",!1,"Test: kennt alle Fahrzeuge, schreibt Rufnamen richtig"),e.T("Fahrzeuge sprechen mit Gemini","gfzg",!1,"Jedes Fahrzeug mit eigener Stimme (immer an, wenn Gemini die Anrufer spielt)"),Q(e),e.B("Lokale KI: Sprachmodell",[{l:"Wählen …",sub:"modelle"}],a,u),e.T("Lokale KI verwenden","lokal",!0,"Aus: Die Anrufer antworten mit vorbereiteten Sätzen"),e.T("Lokale KI beim Beenden schließen","olbeend",!0),e.T("Schnelles Gespräch (Test)","schnell",!1,"Anrufer fängt früher zu sprechen an"),e.B("Ausprobieren",[d("Testanruf",async()=>Be()==="gemini"&&r?H():`Anrufer: „${(await ie()).antwort}“`),d("Wie schnell?",async()=>{if(Be()==="gemini"&&r)return H();const{s1:h,s2:g}=await ie();return`${g<=5?"Flüssig – passt gut":g<=10?"Brauchbar":g<=18?"Eher langsam – ein kleineres Modell wäre flüssiger":"Zu langsam – bitte ein kleineres Modell"}: erste Wörter nach ${oe(h)} s, fertig nach ${oe(g)} s`},{},W)],"Ein kurzes Probegespräch ohne Spiel (das erste dauert länger)"),e.H("Stimmen und Spracherkennung"),e.B("Stimmen",[{l:"Wählen …",sub:"piper"}],"Je mehr Stimmen, desto abwechslungsreicher klingen Anrufer und Fahrzeuge (Piper, läuft auf deinem PC)",w?m.piper===void 0?{chip:I,dot:f}:c?{chip:`${c} geladen`,dot:E}:{chip:"Computerstimme",dot:T}:{chip:M,dot:f}),e.R("Sprechtempo","tempo",70,140,5,100,h=>`${h} %`),e.B("Spracherkennung",[{l:"Wählen …",sub:"whisper"}],"Versteht, was du sagst (Whisper, läuft auf deinem PC)",w?m.whisper===void 0?{chip:I,dot:f}:m.whisper.includes(n.modell)?{chip:o?o.label.split(/\s+–\s+/)[0]:"bereit",dot:E}:{chip:"noch nicht geladen",dot:T}:{chip:M,dot:f}),e.B("Alles in Ruhe einrichten",[{l:"Zum Einrichten",go:["platz","einrichten"]}],"Schritt für Schritt mit Probeanruf")]}let Ae=null;function kt(e){if(!Ae||Date.now()-Ae.um>5e3){const s=Ae?.ok;vr().then(i=>{Ae={ok:i,um:Date.now()},i!==s&&z()})}const n=Lr(),t=Ae?.ok,r=[e.H("Discord"),e.T("In Discord zeigen, dass ich LeitWerk spiele","discord",!0,"Freunde sehen „Spielt LeitWerk“ in deinem Profil und in der Mitgliederliste"),e.T("Details zeigen","discordDetails",!0,"Rolle, Funkgruppe, offene Einsätze und Spieltyp – nie Adressen, Namen oder Codes")];return n?t===void 0?r.push(e.I("Verbindung",I,"",f)):t?r.push(e.I("Verbindung","verbunden","Discord zeigt jetzt „Spielt LeitWerk“",E)):r.push(e.I("Verbindung","Discord läuft nicht",Pn()?"Discord (Programm, nicht im Browser) auf diesem Rechner starten – LeitWerk verbindet sich dann von selbst (spätestens nach 30 Sekunden)":"Nur im installierten Programm",T)):r.push(e.I("Verbindung","aus","Eingeschaltet erscheint es nach wenigen Sekunden",f)),r.push(e.I("Tipp","","Ganz ausschalten geht auch in Discord: Einstellungen › Aktivitätsprivatsphäre",f)),r}function bt(e){return[e.T("Klingelton bei Anrufen","klingel",!0),e.T("Funk-Piep, wenn ein Fahrzeug ruft","fpiep",!0),e.R("Lautstärke der Töne","tlaut",0,100,5,80,n=>`${n} %`),e.H("Welcher Ton wann?"),...ce(e),e.H("Eigene Tondateien"),...A(e)]}function wt(e){const n=[],t=Ar();t.length||n.push(e.I("Gespeicherte Anordnungen","noch keine","Eigene Anordnungen speicherst du im Spiel unter „Anordnung“ – oder lädst sie unten aus einer Datei",f));for(const r of t)n.push(e.IT(r.name,r.fenster.length?`Hauptfenster + ${r.fenster.length} weitere${r.fenster.length>1?"":"s"} Fenster`:"Hauptfenster","","",{btns:[d("Übernehmen",async()=>ii()?(await ai(r),"Übernommen"):(localStorage.setItem(si,JSON.stringify(r.haupt)),r.fenster.length?"Gilt beim nächsten Spielstart (ohne Nebenfenster)":"Gilt beim nächsten Spielstart")),d("Als Datei …",async()=>await pe(`leitwerk-anordnung-${r.name}.json`,JSON.stringify(r,null,1),{name:"Anordnung",extensions:["json"]})?"Gespeichert":"Abgebrochen"),d("Löschen",()=>(Er(r.name),"Gelöscht"),{cfm:`„${r.name}“ löschen?`})]}));return n.push(e.B("Aus Datei",[v("Anordnung laden …",".json,application/json",async r=>{const s=await Ye(r),i=li(s);return mn("Anordnungen",Xe(r.name,"json"),s),`„${i.name}“ übernommen`})],"Zum Beispiel von einem Freund")),n}const Qe=e=>e.name?.trim()||e.id;function St(e){const n=sn(!0).slice().sort((l,a)=>Qe(l).localeCompare(Qe(a),"de")),t=n.filter(l=>!ln(l.id)),r=l=>{const a=new Set(l.varianten.map(u=>Mr(u)));return a.size===1&&a.has("NA")?"ja":a.has("NA")?"teils":[...a].sort((u,c)=>He(c)-He(u))[0]==="RS"?"nein":`bis ${[...a].sort((u,c)=>He(c)-He(u))[0]}`},s=l=>`${ln(l.id)?Hn(l.id)?"eingebaut, geändert":"eingebaut":"eigener"}${Gr(l.id)?"":" · aus"}`,i=n.map(l=>l.id);return[e.TAB(["Fall","Art","Notarzt","Herkunft"],n.map(l=>[Qe(l),l.spezial?"besonderer Anruf":"Notfall",r(l),s(l)]),{suche:"Fälle durchsuchen …",neu:"Neuer Fall",anzahl:`${B(n.length)} Fälle · ${B(t.length)} eigene`,edit:!0,ding:"Fall",oeffnen:l=>zr(i[l]),neuZiel:"neuerFall",hint:"Stift öffnet den Fall-Editor (Telefonat, Abfrage, Ausgänge, Krankenhaus)"}),e.B("Prüfen",[d("Alle Fälle prüfen",()=>{const l=sn(!0),a=oi(b.schema,l);if(!a.length)return`Alle ${B(l.length)} in Ordnung`;const u=new Set(a.map(o=>o.fall)),c=a[0];throw new Error(`${a.length} Problem${a.length===1?"":"e"} in ${u.size} Fäll${u.size===1?"":"en"} – z. B. ${c.fall}${c.variante?` (${c.variante})`:""}: ${c.fehler}`)})],"Telefonat, Verlauf, Krankenhaus stimmig?"),e.B("Import & Export",[v("Importieren …",".json,application/json",async l=>{const a=await Ye(l),u=ui(a,!1);if(!u.neu&&!u.ersetzt)throw new Error(u.fehler[0]??"Keine Fälle in der Datei");return mn("Fälle",Xe(l.name,"json"),a),`${u.neu} neu, ${u.ersetzt} ersetzt${u.fehler.length?`, ${u.fehler.length} übersprungen (${u.fehler[0]})`:""}`}),d("Exportieren …",async()=>{const l=sn(!0),a=l.filter(o=>!ln(o.id)||Hn(o.id)),u=(a.length?a:l).map(o=>o.id);return await pe(`leitwerk-faelle-${new Date().toISOString().slice(0,10)}.json`,di(u),{name:"Fallpaket",extensions:["json"]})?`${u.length} ${a.length?"eigene/geänderte ":""}Fälle exportiert`:"Abgebrochen"})],"Fallpakete (JSON) – exportiert werden die eigenen und geänderten Fälle")]}function zt(){const e=b.settings.stufen.map(n=>({...n}));for(const n of Rr())e.some(t=>t.stufe===n)||e.push(Or(n)??Pr(n));return e}const At=Object.keys(ve).map(e=>ve[e]),Et=Gn.map(e=>an[e]);function zn(e){const n=structuredClone(b.settings);e(n),b.setSettings(n),Wi.call("neuPlanen").catch(()=>{})}function Tt(e){const n=zt(),t=s=>[s.stufe,s.rettungsmittel||"– (Weitergabe)",s.nfsErforderlich?"ja":"nein",ve[s.notarzt]??s.notarzt,s.sondersignal?"ja":"nein",an[s.kategorie]??s.kategorie,`${s.transportProzent} %`],r=[e.T("Rendezvous RTW – NEF","rdv",!0,"NEF mehr als 15 min entfernt: RTW fährt los und trifft das NEF unterwegs"),e.N("Toleranz für besser passende Rettungsmittel","tol",5,"min"),e.H("Stufen-Zuordnung")];return ke.alarmierung&&r.push(e.I("Nicht gespeichert",ke.alarmierung,"",Ze)),r.push(e.TAB(["Stufe","Rettungsmittel","NFS","Notarzt","Signal","Kategorie","Transport"],n.map(t),{edit:!0,neu:"Neue Stufe",ding:"Stufe",typen:["text","text","tog",["sel",At],"tog",["sel",Et],"num"],hint:"„>“ trennt die Ränge, „/“ heißt gleichwertig. Ein schlechter passendes Rettungsmittel kommt nur, wenn das bessere mehr als die Toleranz länger braucht.",speichern:(s,i)=>We("alarmierung",()=>{const l=s>=0?n[s]:void 0,a=(i[0]??"").trim();if(!a)throw new Error("Bitte einen Namen für die Stufe eingeben");if(n.some(o=>o.stufe===a&&o!==l))throw new Error(`Die Stufe „${a}“ gibt es schon`);const u=(i[1]??"").trim(),c={stufe:a,rettungsmittel:/^–|weitergabe/i.test(u)||!u?"":u.toUpperCase().replace(/\s+/g,""),nfsErforderlich:i[2]==="ja",notarzt:Object.keys(ve).find(o=>ve[o]===i[3])??l?.notarzt??"nein",sondersignal:i[4]==="ja",kategorie:Gn.find(o=>an[o]===i[5])??l?.kategorie??"dringend",transportProzent:Math.max(0,Math.min(100,Math.round(parseFloat(String(i[6]).replace(",","."))||0)))};zn(o=>{const h=l?o.stufen.findIndex(g=>g.stufe===l.stufe):-1;h>=0?o.stufen[h]=c:o.stufen.push(c)})}),loeschen:s=>We("alarmierung",()=>{const i=n[s];if(!i)return;const l=ci().stufen.find(a=>a.stufe===i.stufe);zn(a=>{l?a.stufen=a.stufen.map(u=>u.stufe===i.stufe?{...l}:u):a.stufen=a.stufen.filter(u=>u.stufe!==i.stufe)})})})),r}async function We(e,n){try{await n(),delete ke[e]}catch(t){ke[e]=Ne(t),console.warn("Hauptmenü speichern",t)}K()}const vt={stations:"ds",vehicles:"fz",hospitals:"kh",pois:"poi",templates:"ev",codes:"code"},_e=e=>`${e.lat.toFixed(5)}, ${e.lon.toFixed(5)}`;async function xe(e,n,t){const r=e.trim();if(n&&r===(t??"").trim())return{lat:n.lat,lon:n.lon};if(!r)throw new Error("Bitte die Lage angeben (Breite, Länge oder eine Adresse)");const s=r.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)??r.match(/^(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)$/);if(s){let l=Number(s[1].replace(",",".")),a=Number(s[2].replace(",","."));const u=o=>o>=44&&o<=52,c=o=>o>=7&&o<=21;if(!u(l)&&u(a)&&c(l)&&([l,a]=[a,l]),!u(l)||!c(a))throw new Error(`Koordinate ${r} liegt außerhalb des Kartengebiets`);return{lat:l,lon:a}}const i=(await xi(r,1).catch(()=>[]))[0];if(!i)throw new Error(`„${r}“ nicht gefunden – bitte Koordinaten angeben (Breite, Länge)`);return{lat:i.lat,lon:i.lon}}const An=new Map;function Lt(e,n,t){const r=at(wn[`tq_${t}`]??"").trim(),s=An.get(e);if(s&&s.stand===we&&s.q===r)return s.d;const i=b.list(e);let l=i,a;if(i.length<=2e3)a=i.map(n);else{const c=[];a=[];for(const o of i){const h=n(o);if(!(r&&!at(h.join(" ")).includes(r))&&(c.push(o),a.push(h),c.length>=200))break}l=c}const u={recs:l,rows:a,gesamt:i.length};return An.set(e,{stand:we,q:r,d:u}),u}const $t=(e,n)=>e.recs.length<e.gesamt?`${B(e.gesamt)} ${n} · ${B(e.recs.length)} gezeigt – Suche zeigt mehr`:`${B(e.gesamt)} ${n}`;function Bt(e,n){return e.B("Import & Export",[{l:"CSV importieren …",imp:!0},d("Exportieren …",async()=>{const t=hi(n,b.list(n),b.list("stations"));return await pe(`leitwerk_${gi[n]}.csv`,t)?`${mi[n]} exportiert`:"Abgebrochen"})],"CSV-Dateien · erst prüfen, dann ergänzen oder ersetzen · Vorlage und Beispiel liegen in Dokumente/LeitWerk")}function Ee(e,n,t,r){const s=Lt(t,r.zeile,n),i=[];return ke[n]&&i.push(e.I("Nicht gespeichert",ke[n],"",Ze)),i.push(e.TAB(r.cols,s.rows,{...r.x,edit:!0,anzahl:$t(s,r.wort),speichern:(l,a)=>We(n,async()=>{const u=l>=0?s.recs[l]:void 0,c=await r.bauen(u,a.map(o=>String(o??"")),l>=0?s.rows[l]:void 0);b.upsert(t,c)}),loeschen:l=>We(n,()=>{const a=s.recs[l];a&&b.remove(t,a.id)})})),i.push(Bt(e,t)),i}const Te=(e,n,t)=>({id:e?.id??b.newId(vt[n]),hinweis:t.trim(),herkunft:e?.herkunft==="import"?"import":"manuell",herkunftDetail:e?.herkunftDetail}),X=(e,n,t)=>!n||(e[t]??"")!==(n[t]??"");function Kt(e){const n=b.list("stations"),t=new Map(n.map(i=>[i.id,i.name])),r=i=>`${i.typ}${i.aufbau==="gross"&&i.typ!=="RTW-C"?" (groß)":""}`,s=i=>i.ersatzFuer?`nur bei Flugverbot (Ersatz für ${i.ersatzFuer})`:_i(i.dienstplan);return Ee(e,"fahrzeuge","vehicles",{cols:["Funkrufname","Kurzname","Kategorie","Typ","Dienststelle","Dienstplan","Aktiv"],wort:"Fahrzeuge",zeile:i=>[i.funkrufname,i.kurzname,i.kategorie,r(i),t.get(i.dienststelleId)??"⚠ fehlt",s(i),i.aktiv?"ja":"nein",i.nachtflug?"ja":"nein",i.ersatzFuer??"",i.hinweis??""],x:{suche:"Fahrzeug suchen …",neu:"Neues Fahrzeug",ding:"Fahrzeug",typen:["text","text",["sel",[...Xn]],"text","text","plan","tog"],extra:[["Nachtflug","tog","nein"],["Ersatz für","text",""],["Hinweis","text",""]]},bauen:(i,l,a)=>{const u=l[0].trim();if(!u)throw new Error("Bitte einen Funkrufnamen eingeben");const c=Xn.includes(l[2])?l[2]:i?.kategorie??"RTW";let o=i?.dienststelleId??"";if(X(l,a,4)||!i){const N=l[4].trim().toLowerCase(),ae=n.filter(le=>le.name.trim().toLowerCase()===N);if(!ae.length)throw new Error(`Dienststelle „${l[4]}“ gibt es nicht`);if(ae.length>1&&!ae.some(le=>le.id===o))throw new Error(`Dienststelle „${l[4]}“ gibt es mehrmals – bitte im Spiel unter Daten zuordnen`);o=ae.some(le=>le.id===o)?o:ae[0].id}let h=l[3].replace(/\s*\(groß\)\s*$/,"").trim(),g=i?.aufbau;i&&!X(l,a,3)?h=i.kategorie===c?i.typ:c:X(l,a,3)&&(g=/\(groß\)\s*$/.test(l[3])?"gross":void 0),h||(h=c);let k=i?.dienstplan;if(!i||X(l,a,5)){const N=fi(l[5]);if(N.fehler)throw new Error(N.fehler);k=N.plan}const S={...i??{},...Te(i,"vehicles",l[9]??""),funkrufname:u,kurzname:l[1].trim(),kategorie:c,typ:h,dienststelleId:o,aktiv:l[6]==="ja",nachtflug:l[7]==="ja",dienstplan:k??[]};g?S.aufbau=g:delete S.aufbau;const P=(l[8]??"").trim();(P||i?.ersatzFuer!==void 0)&&(S.ersatzFuer=P);const $=[S];if(S.typ.toUpperCase()==="RTW-C"){S.typ="RTW-C",S.aufbau="gross";for(const N of b.list("vehicles"))N.id!==S.id&&N.dienststelleId===S.dienststelleId&&N.typ.trim().toUpperCase()==="RTW-C"&&$.push({...N,typ:"RTW",aufbau:"gross"})}return $}})}function Nt(e){const n=new Map;for(const r of b.list("vehicles"))n.set(r.dienststelleId,(n.get(r.dienststelleId)??0)+1);const t=[...new Set([...Sr,...b.list("stations").map(r=>r.typ).filter(Boolean)])];return Ee(e,"dienststellen","stations",{cols:["Name","Typ","Ort","Bezirk","Fahrzeuge"],wort:"Dienststellen",zeile:r=>[r.name,r.typ,r.ort,r.bezirk,String(n.get(r.id)??0),r.adresse??"",_e(r),r.hinweis??""],x:{suche:"Dienststelle suchen …",neu:"Neue Dienststelle",ding:"Dienststelle",typen:["text",["sel",t],"text","text","fix"],extra:[["Adresse","text",""],["Lage","lage",""],["Hinweis","text",""]]},bauen:async(r,s,i)=>{const l=s[0].trim();if(!l)throw new Error("Bitte einen Namen eingeben");const a=await xe(s[6]||(r?"":s[5]),r,i?.[6]);return[{...r??{},...Te(r,"stations",s[7]??""),name:l,typ:s[1]||"Rettungsdienst",organisation:r?.organisation??"",ort:s[2].trim(),bezirk:s[3].trim(),adresse:(s[5]??"").trim(),lat:a.lat,lon:a.lon}]}})}const Dt=new Map(nr.flatMap(e=>[[e.name.toLowerCase(),e.id],[e.id.toLowerCase(),e.id]])),yt=new Map(tr.flatMap(e=>[[e.name.toLowerCase(),e.id],[e.id.toLowerCase(),e.id]])),En=(e,n,t)=>e.split(/\s*[;,]\s*/).map(r=>r.trim()).filter(Boolean).map(r=>{const s=n.get(r.toLowerCase());if(!s)throw new Error(`${t} „${r}“ gibt es nicht`);return s});function Ft(e){return Ee(e,"krankenhaeuser","hospitals",{cols:["Name","Kurzname","Ort"],wort:"Krankenhäuser",zeile:n=>[n.name,n.kurzname,n.ort,_e(n),bi(n.zufahrt),wi(n.landeplatz),(n.einrichtungen??[]).map(t=>Si(t)?.name??t).join(", "),(n.akutAus??[]).map(t=>zi(t)?.name??t).join(", "),"",n.hinweis??""],x:{suche:"Krankenhaus suchen …",neu:"Neues Krankenhaus",ding:"Krankenhaus",typen:["text","text","text"],extra:[["Lage","lage",""],["Rettungszufahrt","text",""],["Hubschrauberlandeplatz","text",""],["Einrichtungen","einr",""],["Akut-Bereiche aus","text",""],["Aufnahme bei Notfällen","khlink",""],["Hinweis","text",""]],hint:"„Akut-Bereiche aus“ mit Komma getrennt · Öffnungszeiten der Akut-Bereiche unter KH-Aufnahme"},bauen:async(n,t,r)=>{const s=t[0].trim();if(!s)throw new Error("Bitte einen Namen eingeben");const i=await xe(t[3],n,r?.[3]),l={...n??{},...Te(n,"hospitals",t[9]??""),name:s,kurzname:t[1].trim(),ort:t[2].trim(),lat:i.lat,lon:i.lon};if((!n||X(t,r,6))&&(l.einrichtungen=En(t[6],Dt,"Einrichtung")),(!n||X(t,r,7))&&(l.akutAus=En(t[7],yt,"Akut-Abteilung")),!n||X(t,r,4)){const a=pi(t[4]);if(t[4].trim()&&!a)throw new Error("Zufahrt: bitte so angeben: einfahrt=48.41296,15.61544; p=48.41247,15.61458");l.zufahrt=a}if(!n||X(t,r,5)){const a=ki(t[5]);if(t[5].trim()&&!a)throw new Error("Landeplatz: bitte Koordinaten („48.41210,15.61480“) oder „kein“ angeben");l.landeplatz=a}return delete l.abteilungen,delete l.bereiche,[l]}})}function Ct(e){const n=t=>Ri(t).map(Oi).join(", ");return Ee(e,"pois","pois",{cols:["Name","Kategorien","Ort"],wort:"Orte",zeile:t=>[t.name,n(t),t.ort,_e(t),t.hinweis??""],x:{suche:"Ort suchen …",neu:"Neuer Ort",ding:"Ort",typen:["text","text","text"],extra:[["Lage","lage",""],["Hinweis","text",""]],hint:"Kategorien mit Komma getrennt, z. B. „Pflegeheim, Schule“"},bauen:async(t,r,s)=>{const i=r[0].trim();if(!i)throw new Error("Bitte einen Namen eingeben");const l=await xe(r[3],t,s?.[3]);let a=t?.typ??"";if(!t||X(r,s,1)){const c=[],o=[];for(const h of r[1].split(/\s*[;,]\s*/).map(g=>g.trim()).filter(Boolean)){const g=Ai.find(k=>!k.liste&&(k.key===h.toLowerCase()||k.label.toLowerCase()===h.toLowerCase()));g?c.push(g.key):o.push(h)}a=Ei(c,o.join(", "))}return[{...t??{},...Te(t,"pois",r[4]??""),name:i,typ:a,ort:r[2].trim(),lat:l.lat,lon:l.lon}]}})}const It=["nach Stufe","ja","nein"];function Wt(e){return Ee(e,"vorlagen","templates",{cols:["Code","Adresse","Meldung"],wort:"Vorlagen",zeile:n=>[n.code,n.adresse,n.meldung,_e(n),n.patientAlter==null?"":String(n.patientAlter),n.transport==null?"nach Stufe":n.transport?"ja":"nein",n.hinweis??""],x:{suche:"Vorlage suchen …",neu:"Neue Vorlage",ding:"Vorlage",typen:["text","text","text"],extra:[["Lage","lage",""],["Patient Alter","text",""],["Transport",["sel",It],"nach Stufe"],["Hinweis","text",""]]},bauen:async(n,t,r)=>{const s=t[0].trim();if(!s)throw new Error("Bitte einen Code eingeben");const i=await xe(t[3]||(n&&!X(t,r,1)?"":t[1]),n,r?.[3]),l=t[4].trim();if(l&&!Number.isFinite(Number(l)))throw new Error(`Alter „${l}“ ist keine Zahl`);return[{...n??{},...Te(n,"templates",t[6]??""),code:s,adresse:t[1].trim(),meldung:t[2].trim(),lat:i.lat,lon:i.lon,patientAlter:l===""?null:Number(l),transport:t[5]==="ja"?!0:t[5]==="nein"?!1:null}]}})}function _t(e){const n=xn(),t=kn("notruf"),r=t?t.replace(/\.(json|csv|txt)$/i,""):null,s=b.schema?Object.keys(b.schema.kapitel).length:new Set(n.map(o=>o.gruppenname)).size,i=Rn(),l=b.ktSatzRoh?b.ktSatzRoh.name||"Eigener Satz":null,a=r?`Eigene Datei: ${r}`:"LeitWerk-Codesystem (eingebaut)",u=l?`Eigene Datei: ${l}`:"LeitWerk-Transportcodes (eingebaut)",c=o=>o.gruppe?`${o.gruppe} - ${o.gruppenname}`:o.gruppenname;return[e.I("Notruf (RD)",a,`${B(n.length)} Codes in ${s} Kapiteln${b.schema?", mit Abfrage":""}`,n.length?E:T),e.I("Krankentransport & Überstellung (KT/SEK)",u,`${B(i.length)} Codes, mit KT-Abfrage`,i.length?E:T),e.B("Eigene Codes & Abfrage",[{l:"Notruf (RD)",go:["real","notruf"]},{l:"KT/SEK",go:["real","ktsek"]}],"Unter Eigene Dateien hochladen und umschalten – jeder Spieler selbst"),e.S("Codeliste","codeart",["Notruf (RD)","KT/SEK"],"Notruf (RD)"),e.TAB(["Code","Name","Kategorie","Kapitel"],n.map(o=>[o.code,o.beschreibung,o.stufe,c(o)]),{suche:"Code suchen …",anzahl:`${B(n.length)} Codes · ${r??"LeitWerk-Codesystem"}`,when:o=>o("codeart","Notruf (RD)")==="Notruf (RD)"}),e.TAB(["Code","Name","Kapitel","Art"],i.map(o=>[o.code,o.name,o.kapitel,o.gruppe]),{suche:"Code suchen …",anzahl:`${B(i.length)} Codes · ${l??"LeitWerk-Transportcodes"}`,when:o=>o("codeart","Notruf (RD)")==="KT/SEK"})]}const xt={alarmWache:"alarmiert auf der Wache",alarmFunk:"alarmiert über Funk"},Tn=e=>Mi[e]??xt[e]??e;function Rt(e){return[e.H("Bedeutung · Nummer · Bezeichnung · Farbe · alarmierbar"),...b.settings.status.map((n,t)=>({t:"stat",label:Tn(n.key),key:"st"+(t+1),nr:n.nummer,nm:n.name,color:n.farbe,on:n.verfuegbar}))]}const vn=e=>e.replace(/\.(json|csv|txt)$/i,""),en={notruf:"Eingebaut – LeitWerk-Codesystem",ktsek:"Eingebaut – LeitWerk-Transportcodes"},Ot={notruf:"Eine JSON-Datei mit Kapiteln, Fragen, Regeln und Codes – Aufbau wie die Beispieldatei",ktsek:"Eine JSON-Datei mit allen KT/SEK-Codes und ihren Bedingungen – Aufbau wie die Beispieldatei"},Pt={notruf:{datei:"Beispiel Notruf.json",hint:"Kleines, vollständiges Beispiel (3 Kapitel) – zeigt den Aufbau. Oben in der Datei steht eine Anleitung für eine KI.",text:()=>rt,ki:()=>{const e=JSON.parse(rt).anleitung_fuer_ki??"";return Array.isArray(e)?e.join(`
`):e}},ktsek:{datei:"Beispiel KT-SEK.json",hint:"Die eingebauten KT/SEK-Codes als Beispiel – vollständig, weil jede Kombination genau einen Code braucht. Oben in der Datei steht eine Anleitung für eine KI.",text:Cr,ki:()=>qr().join(`
`)}},Mt=(e,n,t)=>`${e}

## Beispieldatei (${t})

\`\`\`
${n}
\`\`\`

## Mein Auftrag
Region: 
Worauf achten: 
`,Ln=(e,n,t)=>d("KI-Anleitung kopieren",async()=>(await navigator.clipboard.writeText(Mt(e(),n(),t)),"Kopiert – in eine KI einfügen, unten Region und Wünsche ergänzen"));function $n(e,n,t,r,s,i){const l=`ak_${n}_${pn[n]??0}`;ot[l]=c=>{c!==r&&(Ue[n]={t:"wird umgeschaltet …",dot:f},K(),s(c).then(o=>Ue[n]={t:o,dot:E}).catch(o=>Ue[n]={t:Ne(o),dot:Ze}).finally(()=>{pn[n]=(pn[n]??0)+1,Promise.all([_(),U()]).finally(K)}))};const a=[e.L("Aktiv",l,t,r,i)],u=Ue[n];return u&&a.push(e.I("Rückmeldung",u.t,"",u.dot)),a}const Bn=(e,n)=>w?e.B("Ordner",[d("Ordner öffnen",()=>Qn(n))],`Dokumente/LeitWerk/${n}`):e.B("Ordner",[],`Dokumente/LeitWerk/${n}`,{chip:M,dot:f});function Kn(e,n){const t=Mn[n],r=m.teile?.[n],s=kn(n),i=[],l=(r??[]).filter(g=>!g.entwurf),a=l.map(g=>g.name),u=s?vn(s):en[n],c=[en[n],...a];if(s&&!a.some(g=>g.toLowerCase()===u.toLowerCase())&&c.push(u),i.push(...$n(e,n,c,u,async g=>{if(g===en[n])return bn(n,null);const k=l.find(S=>S.name===g);if(!k)throw new Error(`„${g}“ ist nicht mehr im Ordner – bitte neu hochladen`);return bn(n,k.datei)},"Gilt sofort · nur auf diesem Rechner · Liste = Dateien im Ordner")),n==="notruf"){const g=b.schemaRoh;i.push(e.I("Inhalt",g?`${B(Object.keys(g.kapitel).length)} Kapitel · ${B(Object.keys(g.codes??{}).length)} Codes`:`${B(xn().length)} Codes`,"Codes und Abfrage stecken in derselben Datei",E)),i.push(e.B("Zuordnung zu den LeitWerk-Merkmalen",[{l:"Zuordnung …",sub:"zuordnung"}],"Nur für eine eigene Datei: welche Frage welchem Merkmal entspricht – damit die Anrufer passend antworten"))}else i.push(e.I("Inhalt",`${B(Rn().length)} Codes`,"Die Fragen der KT-Hotline sind immer die eingebauten",E)),i.push(e.B("KT-Code-Editor",[d("Editor öffnen",()=>(it({fertig:()=>void _()}),"Im Editor geöffnet"))],"Codes und Bedingungen im Spiel bearbeiten – speichert als neue Datei; dort auch Entwürfe fertigstellen"));const o=Pt[n];i.push(e.H("Eigene Datei hinzufügen")),i.push(e.B("Datei hochladen",[v("Datei wählen …",".json,application/json",async g=>Ti(n,g.name,await Ye(g)),_)],`${Ot[n]} · wird in den Ordner kopiert und gleich verwendet`));const h=[d("Beispieldatei herunterladen …",async()=>await pe(o.datei,o.text(),{name:"JSON-Datei",extensions:["json"]})?`Gespeichert: ${o.datei}`:"Abgebrochen")];n==="notruf"&&h.push(d("Eingebautes System herunterladen …",async()=>await pe("LeitWerk-Codesystem.json",vi,{name:"JSON-Datei",extensions:["json"]})?"Gespeichert: LeitWerk-Codesystem.json":"Abgebrochen")),i.push(e.B("Beispieldatei",h,o.hint)),i.push(e.B("Mit einer KI erstellen",[Ln(o.ki,o.text,"JSON")],"Kopiert die Anleitung samt Beispieldatei – in eine KI einfügen und nur noch Region und Wünsche dazuschreiben")),i.push(Bn(e,t.ordner)),i.push(e.H(`Dateien im Ordner ${t.ordner}`)),r?r.length||i.push(e.I("Dateien","noch keine eigene Datei","Mit „Datei hochladen“ hinzufügen oder direkt in den Ordner legen",f)):i.push(e.I("Dateien",I,"",f));for(const g of r??[]){const k=s?.toLowerCase()===g.datei.toLowerCase(),S=[];n==="ktsek"&&S.push(d("Bearbeiten",async()=>{const P=Li(await Un(t.ordner,g.datei),g.datei);return it({satz:{codes:P},name:g.name,fertig:()=>void _()}),"Im Editor geöffnet"})),S.push(d("Löschen",()=>Ir(n,g.datei),{cfm:`„${g.datei}“ wird aus Dokumente/LeitWerk/${t.ordner} gelöscht.`},_)),i.push(e.IT(g.name,`${g.entwurf?"ENTWURF – im KT-Code-Editor fertigstellen · ":""}${g.datei}`,k?"aktiv":g.entwurf?"Entwurf":"",k?E:g.entwurf?T:"",{btns:S}))}return i}function Gt(e){const n="Eingebaut – neutrale Namen",t=b.namen.length?b.namenDatei??"":null,r=m.namen??[],s=t===null?n:t||"eigene Namen",i=[n,...r.map(u=>u.datei)];t!==null&&!i.includes(s)&&i.push(s);const l=[...$n(e,"namen",i,s,async u=>u===n?(b.setNamen(null),"Wieder neutrale Namen"):Nn(u),"Gilt sofort · nur auf diesem Rechner · Liste = Dateien im Ordner"),e.I("Ersetzungen",t===null?"Rettungsdienst, Rettungswache, Krankentransport, Luftrettung, NAH 2 …":`${B(b.namen.length)} Ersetzungen aus „${t}“`,"Gilt für Dienststellen, Organisationen, Hubschrauber-Namen und Orte – auch für Krankentransport und Überstellungen",E),e.H("Eigene Datei hinzufügen")],a=v("Datei wählen …",".csv,.txt,text/csv,text/plain",async u=>{const c=await Ye(u),o=Zn(c);if(!o.length)throw new Error("Keine Ersetzungen gefunden (Zeilen „neutral;eigen“, rechts ausgefüllt)");const h=Xe(u.name,"csv");return await lt("Namen",h,c),b.setNamen(o,h),`${B(o.length)} Ersetzungen aktiv – „${h}“ in Dokumente/LeitWerk/Namen`},U);l.push(e.B("Datei hochladen",[a],"CSV „neutral;eigen“ – links der neutrale Name aus der Vorlage, rechts dein Name · wird in den Ordner kopiert und gleich verwendet")),l.push(e.B("Beispieldatei",[d("Beispieldatei herunterladen …",async()=>await pe(fe,et(nt()))?`Gespeichert: ${fe}`:"Abgebrochen")],"Alle neutralen Namen: Organisationen, Hubschrauber, Stützpunkte für Krankentransport & Überstellung (KT/SEK), Dienststellen – rechts eintragen. Oben steht eine Anleitung für eine KI. Liegt auch im Ordner.")),l.push(e.B("Mit einer KI erstellen",[Ln(()=>$i().join(`
`),()=>et(nt()),"CSV")],"Kopiert die Anleitung samt Beispieldatei – in eine KI einfügen und nur noch die Region dazuschreiben")),l.push(Bn(e,"Namen")),l.push(e.B("Im Ordner geändert?",[d("Neu einlesen",()=>U().then(()=>t?Nn(t):"Eingelesen"))],"Nach dem Bearbeiten einer Datei im Ordner")),l.push(e.H("Dateien im Ordner Namen")),m.namen||l.push(e.I("Dateien",I,"",f));for(const u of r){const c=t!==null&&t.toLowerCase()===u.datei.toLowerCase(),o=u.datei===fe,h=o?[]:[d("Löschen",async()=>(await wr("Namen",u.datei),c&&b.setNamen(null),"Gelöscht"),{cfm:`„${u.datei}“ wird aus Dokumente/LeitWerk/Namen gelöscht.`},U)];l.push(e.IT(vn(u.datei),o?"Vorlage mit allen neutralen Namen – rechts eintragen, unter neuem Namen speichern":u.datei,c?"aktiv":"",c?E:"",{btns:h}))}return l}async function Nn(e){const n=Zn(await Un("Namen",e));if(!n.length)throw new Error(e===fe?"Die Vorlage ist noch leer – rechts die eigenen Namen eintragen":"Keine Ersetzungen in der Datei (rechte Spalte leer?)");return b.setNamen(n,e),`${B(n.length)} Ersetzungen aktiv`}function Ht(e){if(!w)return[e.I("Kartenpakete",M,"Kartenpakete gibt es nur im installierten Programm",f),e.I("Satellitenbild","online, ohne Paket","",f)];const n=[],t=m.local,r=m.geo,s=t?.installed??{};if(n.push(e.I("Grundpaket & Straßen Niederösterreich",t===void 0?I:s[rn]&&s["bl-noe"]?"immer installiert":"fehlt – wird beim Start geladen","",t===void 0?f:s[rn]&&s["bl-noe"]?E:T)),r===void 0)n.push(e.I("Straßennetz und Adressen",I,"",f));else if(!r)n.push(e.I("Straßennetz und Adressen","Status unbekannt","",T));else{const h=(r.regionen??[]).map(g=>g==="alt"?"älteres Gesamtnetz":_n[g]??g).join(", ");n.push(e.I("Straßennetz und Adressen",r.roads,[r.roads_nodes?`${B(r.roads_nodes)} Knoten`:"",r.address_count?`${B(r.address_count)} Adressen`:"",h?`Bundesländer: ${h}`:""].filter(Boolean).join(" · "),r.roads_nodes?E:T))}m.packsFehler&&n.push(e.I("Paketverzeichnis","nicht erreichbar",`${m.packsFehler} – Download derzeit nicht möglich`,T));const i=m.packs??[],l=[...new Set([...i.map(h=>h.id),...Object.keys(s)])].filter(h=>h!==rn&&h!=="bl-noe"),a=r?.regionen_aus??[],u=h=>{const g=i.find(nn=>nn.id===h),k=s[h],S=x[`pack:${h}`],P=!!(g&&k&&g.version!==k.version),$=h.startsWith("bl-")?h.slice(3):null,N=[];S||(g&&(!k||P)&&N.push(d(k?"Aktualisieren":"Laden",async()=>(await L(`pack:${h}`,"Wird geladen … 0 %",nn=>Bi(h,yn=>nn(`Wird geladen … ${be(yn.done,yn.total)}`))),dn(),`${g.name} installiert`),{},V)),k&&!(g?.pflicht??!1)&&N.push(d("Löschen",async()=>(await Wr(h),dn(),"Gelöscht"),{cfm:`${g?.name??h} löschen?${$?` Ohne Paket gibt es keine Transporte nach ${_n[$]??$}.`:""} Du kannst es jederzeit wieder laden.`},V)));const ae={btns:N};k&&$&&$!=="noe"&&(ae.tog=["kp_"+$,!a.includes($)]);const le=[g?.beschreibung,g?_r(xr(g)):""].filter(Boolean).join(" · ");return e.IT(g?.name??h,le,S??(P?"Update verfügbar":k?"installiert":""),S?ee:P?T:k?E:"",ae)},c=l.filter(h=>h.startsWith("bl-")),o=l.filter(h=>!h.startsWith("bl-"));return n.push(e.H("Straßen weiterer Bundesländer")),m.packs===void 0&&!c.length&&n.push(e.I("Paketverzeichnis",I,"",f)),n.push(...c.map(u)),n.push(e.H("Detailkarten und Gelände")),n.push(...o.map(u)),n.push(e.I("Satellitenbild","online, ohne Paket","",f)),t?.dir&&n.push(e.I("Speicherort",t.dir,"",f)),n}function jt(e){const n=m.update,t=[e.I("Version",m.version===void 0?I:w?n?`${m.version} · Update auf ${n.version} verfügbar`:`${m.version} · aktuell`:`${m.version} · Entwicklung im Browser`,"",w?n?T:E:f)];if(!w)t.push(e.B("Updates",[],"",{chip:M,dot:f}));else{const s=[d("Jetzt suchen",async()=>{const i=await Ki();return m.update=i,i?`Version ${i.version} verfügbar`:"Auf dem neuesten Stand"})];n&&s.push(d("Installieren",()=>(Ni(n),"Wird installiert – LeitWerk startet danach neu"),{cfm:"Jetzt aktualisieren? LeitWerk startet danach neu – deine Daten und Einstellungen bleiben."})),t.push(e.B("Updates",s,n?.notes?n.notes.split(`
`)[0]:void 0))}t.push(e.H("Eigene Dateien & Spielstände")),t.push(e.I("Ordner",m.basis??"…","Alles, was du selbst dazugibst, liegt dort – je Art ein Ordner",f)),t.push(e.B("Spielstände",[{l:"Ansehen",tab:"fort"},...w?[d("Ordner öffnen",()=>Di())]:[]],"Gespeicherte Schichten"));for(const[s,i]of Object.entries(br))["Abfrageschema","Codelisten","Codelisten/RD","Abfrageschema/Krankentransport_Sekundärtransporte"].includes(s)||t.push(w?e.B(s.replace(/_/g," "),[d("Ordner öffnen",()=>Qn(s))],i):e.B(s.replace(/_/g," "),[],i,{chip:M,dot:f}));const r=Oe.filter(s=>s.lizenz.startsWith("CC BY"));if(Oe.length){t.push(e.H("Geräusche am Telefon")),t.push(e.I("Herkunft",`${Oe.length} Aufnahmen von freesound.org`,`${Oe.length-r.length} frei (CC0), ${r.length} mit Namensnennung (CC BY)`,f));for(const s of r)t.push(e.I(s.titel||s.tag,`${s.urheber} · ${s.lizenz}`,s.quelle,f))}return t}const Jt={fgfarben:R,statusfarben:C,einrichten:mt,discord:kt,audio:ft,gespraech:pt,toene:bt,gemini:he,modelle:j,piper:Z,whisper:ge,anordnungen:wt,faelle:St,alarmierung:Tt,fahrzeuge:Kt,dienststellen:Nt,krankenhaeuser:Ft,pois:Ct,vorlagen:Wt,codes:_t,status:Rt,notruf:e=>Kn(e,"notruf"),ktsek:e=>Kn(e,"ktsek"),namen:Gt,karten:Ht,programm:jt},Vt=(e,n)=>{const t=Jt[e];if(t)try{return t(n)}catch(r){return console.error("Hauptmenü-Zeilen",e,r),[n.I("Fehler",Ne(r),"Diese Seite konnte nicht aufgebaut werden",Ze)]}};let Dn=!1;return{zeilen:Vt,laden(){Dn||(Dn=!0,ye(),te(),W(),de(),se(),re(),_(),U(),V(),De())},beenden(){F=!0,ne&&clearTimeout(ne),q.splice(0).forEach(e=>e()),ue?.bald===G&&(ue=null)}}}export{ji as feldWert,Ji as zeilenQuelle};
