import{k as At,h as tn,e as m,j as Nt,m as Fe,t as Te,n as Hn,p as $t,q as Jn,O as vt,r as an,s as Bt,u as Kt,v as bn,w as Pe,K as Lt,x as wn,N as ze,E as Tt,A as yt,y as k,z as Dt,B as Ct,C as _t,D as xt,G as zn,H as It,J as Se,L as Ft,M as Wt,P as Ot,Q as Rt,U as jt,V as he,W as Pt,g as Gt,X as Mt,Y as Ht,Z as Sn,_ as Jt,$ as Ut,a0 as Ge,a1 as En,a2 as Zt,a3 as An,a4 as Nn,a5 as Vt,a6 as Me,a7 as He,a8 as Je,a9 as qt,aa as Yt,ab as Xt,ac as $n,ad as Qt,ae as ea,af as ye,ag as Ue,ah as De,ai as vn,aj as Ze,ak as Bn,al as Ve,am as na,an as qe,ao as Kn,ap as ta,aq as aa,ar as ra,as as ia,at as sa,au as la,av as Ln,aw as oa,ax as ua,ay as Ye,az as da,aA as ca,aB as ha,aC as ga,aD as fa,aE as ma,aF as Tn,aG as pa,aH as Ce,aI as yn,aJ as ka,aK as Dn,aL as Xe,aM as ba,aN as wa,aO as za,aP as Sa,aQ as Cn,aR as _n,aS as Ea,aT as Aa,aU as Na,aV as $a,aW as xn,aX as va,aY as In,aZ as Ba,a_ as Ka,a$ as La,b0 as Qe,b1 as Ta,b2 as ya,b3 as Da,b4 as Ca,b5 as _a,b6 as ge,b7 as xa,b8 as en,b9 as Ia,ba as Fa,bb as Wa,bc as Oa,bd as Ra,be as ja,bf as Pa,bg as Fn,bh as Ga,bi as Ma,bj as Ha,bk as Ja,bl as Ua,bm as Za,bn as Va,bo as qa,bp as Ya,bq as Wn,br as Xa,bs as Qa,bt as er,bu as On,bv as Rn,bw as nr,bx as tr,by as ar,bz as rr,bA as ir,bB as sr,bC as lr,bD as or,bE as ur,bF as dr,bG as cr,bH as hr,bI as gr}from"./index-BNO6I7KE.js";const fr={ok:"#4CC38A",grau:"#9AA3B5",gelb:"#FFC72C",blau:"#3B8BFF",rot:"#E5484D"},mr={freiWache:"frei auf der Wache",zumBO:"Anfahrt zum Einsatzort",amBO:"am Einsatzort",zumZO:"Transport zum Zielort",amZO:"am Zielort / Übergabe",freiFunk:"frei, unterwegs",dienstfahrt:"Dienstfahrt (alarmierbar)",bereitschaft:"Bereitschaft (alarmierbar)",alarmiert:"alarmiert, rückt aus",abgemeldet:"nicht im Dienst"},jn=`{
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
`;function Pn(w={}){const g=w.satz??At(),D={codes:structuredClone(g.codes??[])},Q=tn("ktsek"),$=w.name??(Q?Q.replace(/\.json$/i,""):null),R=m("div",{class:"kte"}),S=m("div",{class:"kte-kopf"}),ee=m("input",{type:"text",name:"satzname",placeholder:"Name der Datei"});ee.value=$??"Meine KT-SEK-Codes";const x=m("label",{class:"fld"});x.append(m("span",{class:"fld-label"},"Name der Datei"),ee),S.appendChild(x);const ue=m("div",{class:"kte-pruefung"}),ae=m("div",{class:"mh-reiter"}),re=m("div",{class:"kte-inhalt"});R.append(S,ue,ae,re);let H="",I=null;const G=()=>{const c=Bt({codes:D.codes},Kt());ue.innerHTML="";const A=m("div",{class:`kte-status ${c.fehler.length?"fehler":"ok"}`});if(A.textContent=c.fehler.length?`${c.fehler.length} Problem${c.fehler.length===1?"":"e"} – so nur als Entwurf speicherbar`:`Alles vollständig: jede mögliche Kombination hat genau einen Code (${D.codes.length} Codes)`,ue.appendChild(A),c.fehler.length||c.hinweise.length){const K=m("ul",{class:"kte-liste"});let F=0;c.fehler.forEach(C=>{const L=m("li",{class:"fehler"},C),de=C.startsWith("Kein Code für")?c.fehlend[F++]:void 0;if(de){const E=m("button",{class:"btn small",type:"button"},"Code anlegen");E.addEventListener("click",()=>Ne(de)),L.appendChild(E)}K.appendChild(L)});for(const C of c.hinweise)K.appendChild(m("li",{class:"hinweis"},C));ue.appendChild(K)}return ke?.setActionEnabled(2,c.fehler.length===0),c},Ne=(c={})=>{D.codes.unshift({code:"",name:"",kapitel:"",bed:{...c}}),I=0,H="",J()};function pe(){const c=m("div",{class:"kte-leiste"}),A=m("input",{type:"search",placeholder:"Codes durchsuchen …",class:"kte-suche"});A.value=H,A.addEventListener("input",()=>{H=A.value,C()});const K=m("button",{class:"btn small primary",type:"button"},"+ Neuer Code");K.addEventListener("click",()=>Ne()),c.append(A,K);const F=m("div",{class:"kte-codes"});re.append(c,F);const C=()=>{F.innerHTML="";const E=H.trim().toLowerCase();D.codes.forEach((_,W)=>{E&&!`${_.code} ${_.name} ${bn(_.bed)}`.toLowerCase().includes(E)&&I!==W||F.appendChild(W===I?de(_):L(_,W))}),F.childElementCount||F.appendChild(m("p",{class:"muted"},"Keine Codes gefunden."))},L=(E,_)=>{const W=m("div",{class:"kte-zeile"});W.innerHTML=`<b class="kte-code">${Pe(E.code||"(ohne Namen)")}</b><span class="kte-name">${Pe(E.name)}</span><span class="muted small kte-bed">${Pe(bn(E.bed))}</span>`;const ne=m("div",{class:"row-btns"}),j=m("button",{class:"btn small",type:"button",title:"Bearbeiten"},"✎");j.addEventListener("click",()=>{I=_,C()});const q=m("button",{class:"btn small",type:"button",title:"Kopieren"},"⧉");q.addEventListener("click",()=>{D.codes.splice(_+1,0,{...structuredClone(E),code:`${E.code}-Kopie`}),I=_+1,G(),C()});const Y=m("button",{class:"btn small danger-text",type:"button",title:"Löschen"},"✕");return Y.addEventListener("click",()=>{D.codes.splice(_,1),I=null,G(),C()}),ne.append(j,q,Y),W.appendChild(ne),W},de=(E,_)=>{const W=m("div",{class:"kte-form"}),ne=m("div",{class:"form-grid"}),j=(O,M)=>{const ce=m("label",{class:"fld"});ce.append(m("span",{class:"fld-label"},O),M),ne.appendChild(ce)},q=m("input",{type:"text",name:"code",placeholder:"z. B. KTR-90T3"});q.value=E.code,q.addEventListener("input",()=>{E.code=q.value.trim(),G()});const Y=m("input",{type:"text",name:"name",placeholder:"Bezeichnung"});Y.value=E.name,Y.addEventListener("input",()=>E.name=Y.value);const ie=m("input",{type:"text",name:"kapitel",placeholder:"Gruppe in der Auswahl (optional)"});ie.value=E.kapitel??"",ie.addEventListener("input",()=>E.kapitel=ie.value),j("Code *",q),j("Bezeichnung",Y),j("Gruppe",ie);for(const O of Lt){const M=m("select",{name:`bed-${O}`});M.appendChild(m("option",{value:""},O==="fahrt"?"– bitte wählen –":"beliebig"));for(const[ce,We]of Object.entries(wn[O].werte))M.appendChild(m("option",{value:ce},We));M.value=E.bed[O]??"",M.addEventListener("change",()=>{M.value?E.bed[O]=M.value:delete E.bed[O],G()}),j(wn[O].label+(O==="fahrt"?" *":""),M)}W.appendChild(ne);const ve=m("button",{class:"btn small primary",type:"button"},"Fertig");return ve.addEventListener("click",()=>{I=null,C()}),W.appendChild(ve),W};C()}function J(){ae.innerHTML="",ae.appendChild(m("p",{class:"muted small"},`${D.codes.length} Codes · die Fragen der KT-Hotline sind die eingebauten`)),re.innerHTML="",pe(),G()}const $e=async c=>{const A=Fe(ee.value.trim()||"Meine KT-SEK-Codes");if(/^LeitWerk/i.test(A))return Te("Bitte einen eigenen Namen wählen – die eingebauten Codes bleiben unverändert","error"),!1;const K=G();if(!c&&K.fehler.length)return!1;const F=(await Hn("ktsek")).find(L=>L.name.toLowerCase()===A.toLowerCase());if(F&&F.name.toLowerCase()!==($??"").toLowerCase()&&!await $t("Datei ersetzen?",`Es gibt schon eine Datei „${F.name}“.`,"Ersetzen"))return!1;const C=c?{entwurf:!0}:{};return await Jn(vt.kt.codes,`${A}.json`,JSON.stringify({...C,codes:D.codes.filter(L=>L.code||L.name)})),c?Te(`Entwurf „${A}“ gespeichert – ${K.fehler.length} Problem${K.fehler.length===1?"":"e"} offen`):await an("ktsek",`${A}.json`).then(L=>Te(L)).catch(L=>Te(String(L.message??L),"error")),w.fertig?.(),!0},ke=Nt({title:"KT/SEK-Codes bearbeiten",body:R,wide:!0,actions:[{label:"Abbrechen"},{label:"Als Entwurf speichern",onClick:()=>$e(!0)},{label:"Speichern & verwenden",kind:"primary",onClick:()=>$e(!1)}]});ke.root.parentElement?.classList.add("kte-dlg"),J()}const{ok:v,grau:p,gelb:y,blau:fe,rot:_e}=fr,X="nur im Programm",P="wird geprüft …",V={},rn={},Un={},nn={},xe={},me={};let oe=null;function br(w,g){if(rn[w]=g,w.startsWith("ak_"))return void Un[w]?.(String(g??""));const D=w.match(/^kp_(.+)$/);D?oe?.regionSchalten(D[1],!!g):w.startsWith("tq_")&&oe?.bald()}const N=w=>w.toLocaleString("de-DE"),le=(w,g=1)=>w.toFixed(g).replace(".",","),Ee=(w,g)=>`${Math.min(100,Math.round(w/Math.max(1,g)*100))} %`,Ae=w=>String(w?.message??w),Gn=w=>String(w??"").toLowerCase().replace(/ä/g,"a").replace(/ö/g,"o").replace(/ü/g,"u").replace(/ß/g,"ss"),Mn=w=>new Promise(g=>setTimeout(g,w));async function Ie(w){return or(await w.arrayBuffer())}function wr(w){const g={};let D=!1,Q=0;const $=()=>{D||w()},R=()=>{Q||D||(Q=window.setTimeout(()=>{Q=0,$()},200))},S=la(),ee=async()=>{g.dateien=(await It().catch(()=>[])).filter(e=>e.art!=="alarm"),$()},x=async()=>{S&&(g.ki=await Se().catch(()=>null),$())},ue=async()=>{S&&(g.ram=await Ft().catch(()=>0),$())},ae=async()=>{S&&(g.piper=await Wt().catch(()=>[]),$())},re=async()=>{S&&(g.whisper=(await Ot().catch(()=>({modelle:[],ordner:""}))).modelle,$())},H=async()=>{try{await Rt().catch(()=>{});const e=await jt("Namen");g.namen=e.filter(n=>/\.(csv|txt)$/i.test(n.datei)).sort((n,t)=>n.datei===he?-1:t.datei===he?1:n.datei.localeCompare(t.datei,"de"))}catch{g.namen=[]}$()},I=async()=>{const e=Object.keys(Ln),n=await Promise.all(e.map(t=>Hn(t).catch(()=>[])));g.teile=Object.fromEntries(e.map((t,a)=>[t,n[a]])),$()},G=async()=>{if(S){g.local=await Pt().catch(()=>null),g.geo=await Gt().catch(()=>null),$();try{g.packs=await Mt(),g.packsFehler=void 0}catch(e){g.packsFehler=Ae(e),g.packs??=null}$()}},Ne=async()=>{g.version=await Ht().catch(()=>"?"),g.update=Sn(),g.basis=await Jt().catch(e=>Ae(e)),$()};let pe=0;const J=[],$e=()=>{J.push(k.onChange(()=>{pe++,R()})),J.push(Dt(()=>R())),J.push(Ct(()=>R())),J.push(_t(()=>R())),J.push(xt(()=>{g.update=Sn(),R()}));const e=()=>R();zn.add(e),J.push(()=>zn.delete(e))};oe={bald:R,regionSchalten(e,n){S&&Aa(e,n).then(()=>Ye()).catch(t=>console.warn("Region",t)).finally(()=>void G())}};const ke=(e,n)=>async()=>{try{const t=await e();return typeof t=="string"?t:void 0}finally{try{await n?.()}catch{}$()}},c=(e,n,t={},a)=>({l:e,...t,act:ke(n,a)}),A=(e,n,t,a)=>({l:e,datei:{accept:n,f:l=>ke(()=>t(l[0]),a)()}});async function K(e,n,t){if(V[e])throw new Error("Läuft schon");V[e]=n,R();try{return await t(a=>{V[e]=a,oe?.bald()})}finally{delete V[e],oe?.bald()}}function F(e){const n=k.settings.funkgruppe??"NÖ-03";return[...ia.map(t=>e.C(t.id+(t.id===n?" (deine)":""),"fgc_"+t.id,sa[t.id],t.bezirke,["fgo_"+t.id,!0])),e.B("",[c("Standardfarben",()=>(qe({funkFarben:{},funkGruppen:{}}),"Zurückgesetzt"),{cfm:"Alle Funkgruppen wieder einblenden und die Standardfarben verwenden?"})])]}function C(e){return[...k.settings.status.map((n,t)=>e.C(`${n.nummer} – ${n.name}`,"sf_st"+(t+1),ra(n.key),un(n.key))),e.B("",[c("Farben der Leitstelle verwenden",()=>(qe({statusFarben:{}}),"Zurückgesetzt"),{cfm:"Eigene Statusfarben verwerfen?"})])]}const L={notruf:"te_notruf",kt:"te_kt",anklopfen:"te_anklopfen",funk:"te_funk",funkDringend:"te_funkD",chat:"te_chat",warnung:"te_warn"};function de(e){return Object.entries(Ve).map(([n,t])=>e.TON(t,L[n],ta[aa[n].slice(8)]?.name??""))}function E(e){const n=[],t=g.dateien;if(!t)n.push(e.I("Eigene Dateien",P,"",p));else if(!t.length)n.push(e.I("Eigene Dateien","noch keine","Unten hochladen – danach unter „Töne je Ereignis“ auswählbar",p));else{const s=Bn().sounds;for(const r of t){const o=Object.keys(Ve).filter(d=>s[d]?.quelle===`datei:${r.id}`).map(d=>`„${Ve[d]}“`);n.push(e.IT(r.name,`${le(r.sek)} s · ${Math.max(1,Math.round(r.bytes/1e3))} KB${o.length?` · für ${o.join(", ")}`:""}`,"","",{btns:[c("▶",()=>(Na("chat",`datei:${r.id}`,70),"▶ läuft")),c("Löschen",async()=>{await na(r.id);const d={...Bn().sounds};for(const[u,f]of Object.entries(d))f.quelle===`datei:${r.id}`&&delete d[u];return qe({sounds:d}),"Gelöscht"},{cfm:`„${r.name}“ löschen? Ereignisse, die ihn nutzen, bekommen wieder den Standardton.`},ee)]}))}}const a=s=>async r=>{const o=await sr(r,s);return en("Töne",r.name,await r.arrayBuffer()),`„${o.name}“ gespeichert (${le(o.sek)} s)`},l=".mp3,.wav,audio/mpeg,audio/wav";n.push(e.B("Hochladen",[A("Klingelton …",l,a("klingel"),ee),A("Kurzer Ton …",l,a("kurz"),ee)],`Klingelton bis ${Kn.klingel.maxSek} s, kurzer Ton bis ${Kn.kurz.maxSek} s · MP3, WAV`));const i=(t??[]).reduce((s,r)=>s+r.bytes,0);return n.push(e.I("Belegt",t?`${le(i/1e6,2)} MB`:"…","",p)),n}const _=e=>!!g.ki?.modelle.some(n=>n===e||n.startsWith(e)),W=[{role:"system",content:"Du spielst eine echte Person, die beim Notruf 144 in Niederösterreich anruft: Dein Vater (78) ist im Garten von der Leiter gefallen und blutet am Kopf, er ist wach, aber ganz blass. Du bist aufgeregt. Sag nur, was du ins Telefon sprichst: kurz, umgangssprachlich österreichisch, keine Listen."},{role:"user",content:"Leitstelle: Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?"},{role:"assistant",content:"Gartengasse 4 in Gföhl, bitte schnell!"},{role:"user",content:"Leitstelle: Was ist denn passiert?"}];async function ne(){if(!S)throw new Error("Die lokale KI gibt es nur im Programm");const e=await Se();if(g.ki=e,!e.installiert)throw new Error("Ollama ist nicht installiert");if(!e.laeuft)throw new Error("Ollama läuft nicht – erst starten");const n=Ue().modell;if(!_(n))throw new Error(`Modell ${n} ist nicht geladen (Sprachmodelle → Laden)`);const t=performance.now();let a=0;return{antwort:await lr(W,()=>{a||(a=performance.now())}),s1:((a||performance.now())-t)/1e3,s2:(performance.now()-t)/1e3}}const j=async()=>{if(!Ze())throw new Error("Noch kein Schlüssel – unter „Einrichten“ einfügen");return`Gemini antwortet: ${await In()}`};function q(e){const n="Läuft auf diesem Rechner – ohne Internet, ohne Konto";if(!S)return e.B("Ollama",[],n,{chip:X,dot:p});if(V.ollama)return e.B("Ollama",[],n,{chip:V.ollama,dot:fe});const t=g.ki;return t===void 0?e.B("Ollama",[],n,{chip:P,dot:p}):t===null?e.B("Ollama",[c("Prüfen",()=>{},{},x)],n,{chip:"Status unbekannt",dot:y}):t.installiert?t.laeuft?e.B("Ollama",[c("Beenden",async()=>(await za(),"Beendet"),{},x)],n,{chip:"installiert · läuft",dot:v}):e.B("Ollama",[c("Starten",async()=>{await wa();for(let a=0;a<10;a++){if((await Se()).laeuft)return"Läuft";await Mn(1e3)}throw new Error("Ollama startet nicht")},{},x)],n,{chip:`installiert${t.version?` (${t.version})`:""} · läuft nicht`,dot:y}):e.B("Ollama",[c("Installieren",()=>K("ollama","wird heruntergeladen …",async a=>{const l=await $a(i=>a(i.total?`${i.text||"lädt"} ${Ee(i.done,i.total)}`:i.text||"läuft …"));for(let i=0;i<20&&(await Mn(1500),!(await Se()).laeuft);i++);return l||"Installiert"}),{},x)],n,{chip:"nicht installiert",dot:p})}function Y(e){const n=vn(),t=Ze(),a=Ue().modell,l=De.find(o=>o.name===a),i=g.ram?Dn(g.ram):null,s=`${l?`${ye[l.stufe]}: `:""}${a}${g.ram?` · dieser Rechner: ${g.ram} GB${i?`, empfohlen: ${ye[i]}`:""}`:""}`,r=S?g.ki===void 0?{chip:a,dot:p}:_(a)?{chip:a,dot:v}:{chip:`${a} · nicht geladen`,dot:y}:{chip:X,dot:p};return[e.S("Anrufer-KI","kimodus",["Gemini (Cloud)","Lokal (Ollama)"],"Lokal (Ollama)","Fällt Gemini aus, springt die lokale KI ein"),e.H("Gemini (Cloud)"),e.B("Schlüssel",[{l:"Einrichten …",sub:"gemini"},c("Testen",j)],"Kostenlos, wird nur auf diesem Rechner gespeichert",n?{chip:"geprüft",dot:v}:t?{chip:"eingerichtet · nicht geprüft",dot:y}:{chip:"nicht eingerichtet",dot:p}),e.T("Freisprechen (ohne Sprechtaste)","freispr",!1,"Am besten mit Kopfhörern"),e.T("Telefonklang und Geräusche vom Notfallort","klang",!0),e.T("Funk: Gemini versteht den Funk (Test)","gfunk",!1,"Kennt alle Fahrzeuge, schreibt Rufnamen richtig"),e.T("Funk: Mit Gemini sprechen auch die Fahrzeuge","gfzg",!1,"Jedes Fahrzeug mit eigener Stimme, neu verteilt bei jedem Schichtwechsel"),e.H("Lokale KI (Ollama)"),q(e),e.B("Sprachmodell",[{l:"Modelle …",sub:"modelle"}],s,r),e.T("Lokale KI verwenden","lokal",!0,"Sonst einfache, vorbereitete Antworten"),e.T("Ollama beim Beenden von LeitWerk schließen","olbeend",!0),e.T("Schnelles Gespräch (Test)","schnell",!1,"Anrufer spricht ab dem ersten geprüften Satz"),e.B("Ausprobieren",[c("Testanruf",async()=>xn()==="gemini"&&t?j():`Anrufer: „${(await ne()).antwort}“`),c("Geschwindigkeit",async()=>{if(xn()==="gemini"&&t)return j();const{s1:o,s2:d}=await ne();return`${d<=5?"Flüssig – passt gut":d<=10?"Brauchbar":d<=18?"Eher langsam – eine Stufe kleiner wäre flüssiger":"Zu langsam für Gespräche – bitte eine kleinere Stufe"}: erste Wörter nach ${le(o)} s, fertig nach ${le(d)} s`},{},x)],"Probegespräch ohne Spiel · wie schnell der Anrufer antwortet (der erste Test nach dem Laden dauert länger)"),e.H("Funk"),e.T("Funkmeldungen manchmal unvollständig","unvoll",!0,"NEF meist vollständig, RTW öfter nicht, KTW am öftesten – dann nachfragen")]}const ie="https://aistudio.google.com/apikey";function ve(e){return[e.B("1. Schlüssel holen",[c("Seite von Google öffnen",async()=>{if(!S)return window.open(ie,"_blank","noopener"),"Im Browser geöffnet";try{return await navigator.clipboard.writeText(ie),"Adresse kopiert – im Browser einfügen: aistudio.google.com/apikey"}catch{return"Im Browser öffnen: aistudio.google.com/apikey"}})],"Mit deinem Google-Konto anmelden, „API-Schlüssel erstellen“, kopieren"),e.F("2. Schlüssel einfügen","gkey","Schlüssel einfügen …",vn()?"✓ geprüft – Gemini ist bereit":Ze()?"Noch nicht geprüft":"",{pw:!0,btns:[c("Prüfen",async()=>{if(va().schluessel.trim().length<20)throw new Error("Das sieht nicht nach einem Schlüssel aus – bitte ganz kopieren");return`Schlüssel gültig – ${await In()}`})]}),e.B("3. Ausprobieren",[c("Testanruf mit Gemini",j)])]}async function O(e){const n=await Se();if(g.ki=n,!n.laeuft)throw new Error("Ollama läuft nicht – erst unter „Anrufe & KI“ starten");return await K(`ki:${e}`,"Download startet …",t=>Ea(e,a=>t(a.total?`wird geladen … ${Ee(a.done,a.total)}`:a.text||"wird geladen …"))),`${e} geladen`}function M(e){const n=[];if(!S)return n.push(e.I("Dieser Rechner",X,"Die lokale KI gibt es nur im installierten Programm",p)),n;const t=g.ram??0,a=t?Dn(t):null;n.push(e.I("Dieser Rechner",g.ram===void 0?P:t?`${t} GB Arbeitsspeicher${a?` · empfohlen: ${ye[a]}`:""}`:"Arbeitsspeicher unbekannt","Größere Modelle sprechen natürlicher, brauchen aber mehr Speicher und antworten langsamer",fe));const l=g.ki;l&&!l.laeuft&&n.push(e.I("Ollama",l.installiert?"läuft nicht":"nicht installiert","Laden und Löschen geht nur, wenn Ollama läuft (Anrufe & KI)",y));const i=Ue().modell,s=(r,o,d,u)=>{const f=_(r),h=i===r,b=V[`ki:${r}`],z=b??(h&&f?"aktiv":h?"gewählt · nicht geladen":f?"geladen":t&&u>t?"zu groß":""),Z=b?fe:h&&f?v:h?y:f?p:z?y:"",T=[];if(l===void 0){n.push(e.IT(o,d,P,p));return}if(!b){if(f&&!h&&T.push(c("Verwenden",()=>(Xe({modell:r}),"Wird verwendet"),{},x)),!f){const B=t>0&&u>t;T.push(c(B?"Trotzdem laden":"Laden",()=>O(r),B?{cfm:`${r} braucht etwa ${u} GB, dieser Rechner hat ${t} GB. Es kann sein, dass Ollama sehr langsam wird oder das Modell gar nicht lädt. Kaputt geht nichts – du kannst es wieder löschen. Trotzdem laden?`}:{},x)),h||T.push(c("Verwenden",()=>(Xe({modell:r}),"Gewählt – noch laden"),{},x))}f&&T.push(c("Löschen",async()=>(await ba(r),"Gelöscht"),{cfm:`${r} löschen?${h?" Es ist gerade aktiv – danach antwortet die KI einfacher.":""} Du kannst es jederzeit wieder laden.`},x))}n.push(e.IT(o,d,z,Z,{btns:T}))};for(const r of De)s(r.name,`${ye[r.stufe]} · ${r.name}`,`${le(r.gb)} GB · ab ${r.ram} GB Arbeitsspeicher · ${r.info}${r.stufe===a?" · empfohlen":""}`,r.ram);for(const r of l?.modelle??[])De.some(o=>r===o.name||r.startsWith(o.name))||s(r,`Eigenes · ${r}`,"aus der Ollama-Bibliothek",0);return i&&!De.some(r=>r.name===i)&&!(l?.modelle??[]).some(r=>r===i||r.startsWith(i))&&s(i,`Eigenes · ${i}`,"aus der Ollama-Bibliothek",0),n.push(e.F("Anderes Modell","omod","z. B. llama3.1:8b","Name aus der Ollama-Bibliothek – wird geladen und verwendet",{btns:[c("Laden",async()=>{const r=String(rn.omod??"").trim();if(!r)throw new Error("Bitte einen Modellnamen eingeben");return await O(r),Xe({modell:r}),`${r} geladen und verwendet`},{},x)]})),n}function ce(e){if(!S)return[e.I("Stimmen (Piper)",X,"Piper-Stimmen gibt es nur im installierten Programm – im Browser liest der Computer vor",p)];const n=g.piper;return ea.map(t=>{const a=t.label.match(/^(.*?)\s*\((.*)\)$/),l=a?a[1]:t.label,i=a?a[2]:t.g==="w"?"Frau":"Mann",s=V[`piper:${t.name}`],r=!!n?.includes(t.name),o=[];return n&&!s&&(r?(o.push(c("▶",()=>(Ba(t.g,t.name),"▶ Probe"))),o.push(c("Löschen",async()=>(await Ka(t.name),"Gelöscht"),{cfm:`Stimme „${l}“ löschen?`},ae))):o.push(c("Laden",async()=>(await K(`piper:${t.name}`,"startet …",d=>La(t.name,(u,f,h)=>d(h?"wird entpackt …":f?`wird geladen … ${Ee(u,f)}`:`${Math.round(u/1e6)} MB`))),$n().stimmeArt!=="piper"&&Qe({stimmeArt:"piper"}),`Stimme „${l}“ ist bereit`),{},ae))),e.IT(l,`${i} · ${t.mb} MB`,s??(n===void 0?P:r?"geladen":""),s?fe:r?v:"",{btns:o})})}function We(e){if(!S)return[e.I("Erkennung (Whisper)",X,"Die Spracherkennung auf dem Rechner gibt es nur im installierten Programm",p)];const n=g.whisper,t=$n().modell;return Qt.map(a=>{const l=a.label.split(/\s+–\s+/),i=l[0],s=l.slice(1).join(" – "),r=V[`wh:${a.name}`],o=!!n?.includes(a.name),d=o&&t===a.name,u=[];n&&!r&&(o&&!d&&u.push(c("Verwenden",()=>(Qe({modell:a.name}),"Wird verwendet"))),o||u.push(c("Laden",async()=>(await K(`wh:${a.name}`,"startet …",h=>Ta(a.name,(b,z)=>h(z?`wird geladen … ${Ee(b,z)}`:`${Math.round(b/1e6)} MB`))),Qe({modell:a.name}),`„${i}“ ist bereit und wird verwendet`),{},re)),o&&u.push(c("Löschen",async()=>(await ya(a.name),"Gelöscht"),{cfm:`Modell „${i}“ löschen?${d?" Es wird gerade verwendet.":""}`},re)));const f=a.mb>=1e3?`${le(a.mb/1e3)} GB`:`${a.mb} MB`;return e.IT(i,`${f}${s?` · ${s}`:""}`,r??(n===void 0?P:d?"aktiv":o?"geladen":""),r?fe:d?v:o?p:"",{btns:u})})}function Zn(e){const n=[],t=Yt();t.length||n.push(e.I("Gespeicherte Anordnungen","noch keine","Eigene Anordnungen speicherst du im Spiel unter „Anordnung“ – oder lädst sie unten aus einer Datei",p));for(const a of t)n.push(e.IT(a.name,a.fenster.length?`Hauptfenster + ${a.fenster.length} weitere${a.fenster.length>1?"":"s"} Fenster`:"Hauptfenster","","",{btns:[c("Übernehmen",async()=>Da()?(await Ca(a),"Übernommen"):(localStorage.setItem(_a,JSON.stringify(a.haupt)),a.fenster.length?"Gilt beim nächsten Spielstart (ohne Nebenfenster)":"Gilt beim nächsten Spielstart")),c("Als Datei …",async()=>await ge(`leitwerk-anordnung-${a.name}.json`,JSON.stringify(a,null,1),{name:"Anordnung",extensions:["json"]})?"Gespeichert":"Abgebrochen"),c("Löschen",()=>(Xt(a.name),"Gelöscht"),{cfm:`„${a.name}“ löschen?`})]}));return n.push(e.B("Aus Datei",[A("Anordnung laden …",".json,application/json",async a=>{const l=await Ie(a),i=xa(l);return en("Anordnungen",Fe(a.name,"json"),l),`„${i.name}“ übernommen`})],"Zum Beispiel von einem Freund")),n}const Oe=e=>e.name?.trim()||e.id;function Vn(e){const n=He(!0).slice().sort((s,r)=>Oe(s).localeCompare(Oe(r),"de")),t=n.filter(s=>!Je(s.id)),a=s=>{const r=new Set(s.varianten.map(o=>pa(o)));return r.size===1&&r.has("NA")?"ja":r.has("NA")?"teils":[...r].sort((o,d)=>Ce(d)-Ce(o))[0]==="RS"?"nein":`bis ${[...r].sort((o,d)=>Ce(d)-Ce(o))[0]}`},l=s=>`${Je(s.id)?yn(s.id)?"eingebaut, geändert":"eingebaut":"eigener"}${ka(s.id)?"":" · aus"}`,i=n.map(s=>s.id);return[e.TAB(["Fall","Art","Notarzt","Herkunft"],n.map(s=>[Oe(s),s.spezial?"besonderer Anruf":"Notfall",a(s),l(s)]),{suche:"Fälle durchsuchen …",neu:"Neuer Fall",anzahl:`${N(n.length)} Fälle · ${N(t.length)} eigene`,edit:!0,ding:"Fall",oeffnen:s=>qt(i[s]),neuZiel:"neuerFall",hint:"Stift öffnet den Fall-Editor (Telefonat, Abfrage, Ausgänge, Krankenhaus)"}),e.B("Prüfen",[c("Alle Fälle prüfen",()=>{const s=He(!0),r=Ia(k.schema,s);if(!r.length)return`Alle ${N(s.length)} in Ordnung`;const o=new Set(r.map(u=>u.fall)),d=r[0];throw new Error(`${r.length} Problem${r.length===1?"":"e"} in ${o.size} Fäll${o.size===1?"":"en"} – z. B. ${d.fall}${d.variante?` (${d.variante})`:""}: ${d.fehler}`)})],"Telefonat, Verlauf, Krankenhaus stimmig?"),e.B("Import & Export",[A("Importieren …",".json,application/json",async s=>{const r=await Ie(s),o=Fa(r,!1);if(!o.neu&&!o.ersetzt)throw new Error(o.fehler[0]??"Keine Fälle in der Datei");return en("Fälle",Fe(s.name,"json"),r),`${o.neu} neu, ${o.ersetzt} ersetzt${o.fehler.length?`, ${o.fehler.length} übersprungen (${o.fehler[0]})`:""}`}),c("Exportieren …",async()=>{const s=He(!0),r=s.filter(u=>!Je(u.id)||yn(u.id)),o=(r.length?r:s).map(u=>u.id);return await ge(`leitwerk-faelle-${new Date().toISOString().slice(0,10)}.json`,Wa(o),{name:"Fallpaket",extensions:["json"]})?`${o.length} ${r.length?"eigene/geänderte ":""}Fälle exportiert`:"Abgebrochen"})],"Fallpakete (JSON) – exportiert werden die eigenen und geänderten Fälle")]}function qn(){const e=k.settings.stufen.map(n=>({...n}));for(const n of ga())e.some(t=>t.stufe===n)||e.push(fa(n)??ma(n));return e}const Yn=Object.keys(ze).map(e=>ze[e]),Xn=Tn.map(e=>Me[e]);function sn(e){const n=structuredClone(k.settings);e(n),k.setSettings(n),ur.call("neuPlanen").catch(()=>{})}function Qn(e){const n=qn(),t=l=>[l.stufe,l.rettungsmittel||"– (Weitergabe)",l.nfsErforderlich?"ja":"nein",ze[l.notarzt]??l.notarzt,l.sondersignal?"ja":"nein",Me[l.kategorie]??l.kategorie,`${l.transportProzent} %`],a=[e.T("Rendezvous RTW – NEF","rdv",!0,"NEF mehr als 15 min entfernt: RTW fährt los und trifft das NEF unterwegs"),e.N("Toleranz für besser passende Rettungsmittel","tol",5,"min"),e.H("Stufen-Zuordnung")];return me.alarmierung&&a.push(e.I("Nicht gespeichert",me.alarmierung,"",_e)),a.push(e.TAB(["Stufe","Rettungsmittel","NFS","Notarzt","Signal","Kategorie","Transport"],n.map(t),{edit:!0,neu:"Neue Stufe",ding:"Stufe",typen:["text","text","tog",["sel",Yn],"tog",["sel",Xn],"num"],hint:"„>“ trennt die Ränge, „/“ heißt gleichwertig. Ein schlechter passendes Rettungsmittel kommt nur, wenn das bessere mehr als die Toleranz länger braucht.",speichern:(l,i)=>Be("alarmierung",()=>{const s=l>=0?n[l]:void 0,r=(i[0]??"").trim();if(!r)throw new Error("Bitte einen Namen für die Stufe eingeben");if(n.some(u=>u.stufe===r&&u!==s))throw new Error(`Die Stufe „${r}“ gibt es schon`);const o=(i[1]??"").trim(),d={stufe:r,rettungsmittel:/^–|weitergabe/i.test(o)||!o?"":o.toUpperCase().replace(/\s+/g,""),nfsErforderlich:i[2]==="ja",notarzt:Object.keys(ze).find(u=>ze[u]===i[3])??s?.notarzt??"nein",sondersignal:i[4]==="ja",kategorie:Tn.find(u=>Me[u]===i[5])??s?.kategorie??"dringend",transportProzent:Math.max(0,Math.min(100,Math.round(parseFloat(String(i[6]).replace(",","."))||0)))};sn(u=>{const f=s?u.stufen.findIndex(h=>h.stufe===s.stufe):-1;f>=0?u.stufen[f]=d:u.stufen.push(d)})}),loeschen:l=>Be("alarmierung",()=>{const i=n[l];if(!i)return;const s=Oa().stufen.find(r=>r.stufe===i.stufe);sn(r=>{s?r.stufen=r.stufen.map(o=>o.stufe===i.stufe?{...s}:o):r.stufen=r.stufen.filter(o=>o.stufe!==i.stufe)})})})),a}async function Be(e,n){try{await n(),delete me[e]}catch(t){me[e]=Ae(t),console.warn("Hauptmenü speichern",t)}$()}const et={stations:"ds",vehicles:"fz",hospitals:"kh",pois:"poi",templates:"ev",codes:"code"},Ke=e=>`${e.lat.toFixed(5)}, ${e.lon.toFixed(5)}`;async function Le(e,n,t){const a=e.trim();if(n&&a===(t??"").trim())return{lat:n.lat,lon:n.lon};if(!a)throw new Error("Bitte die Lage angeben (Breite, Länge oder eine Adresse)");const l=a.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)??a.match(/^(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)$/);if(l){let s=Number(l[1].replace(",",".")),r=Number(l[2].replace(",","."));const o=u=>u>=44&&u<=52,d=u=>u>=7&&u<=21;if(!o(s)&&o(r)&&d(s)&&([s,r]=[r,s]),!o(s)||!d(r))throw new Error(`Koordinate ${a} liegt außerhalb des Kartengebiets`);return{lat:s,lon:r}}const i=(await cr(a,1).catch(()=>[]))[0];if(!i)throw new Error(`„${a}“ nicht gefunden – bitte Koordinaten angeben (Breite, Länge)`);return{lat:i.lat,lon:i.lon}}const ln=new Map;function nt(e,n,t){const a=Gn(rn[`tq_${t}`]??"").trim(),l=ln.get(e);if(l&&l.stand===pe&&l.q===a)return l.d;const i=k.list(e);let s=i,r;if(i.length<=2e3)r=i.map(n);else{const d=[];r=[];for(const u of i){const f=n(u);if(!(a&&!Gn(f.join(" ")).includes(a))&&(d.push(u),r.push(f),d.length>=200))break}s=d}const o={recs:s,rows:r,gesamt:i.length};return ln.set(e,{stand:pe,q:a,d:o}),o}const tt=(e,n)=>e.recs.length<e.gesamt?`${N(e.gesamt)} ${n} · ${N(e.recs.length)} gezeigt – Suche zeigt mehr`:`${N(e.gesamt)} ${n}`;function at(e,n){return e.B("Import & Export",[{l:"CSV importieren …",imp:!0},c("Exportieren …",async()=>{const t=Ra(n,k.list(n),k.list("stations"));return await ge(`leitwerk_${ja[n]}.csv`,t)?`${Pa[n]} exportiert`:"Abgebrochen"})],"CSV-Dateien · erst prüfen, dann ergänzen oder ersetzen · Vorlage und Beispiel liegen in Dokumente/LeitWerk")}function be(e,n,t,a){const l=nt(t,a.zeile,n),i=[];return me[n]&&i.push(e.I("Nicht gespeichert",me[n],"",_e)),i.push(e.TAB(a.cols,l.rows,{...a.x,edit:!0,anzahl:tt(l,a.wort),speichern:(s,r)=>Be(n,async()=>{const o=s>=0?l.recs[s]:void 0,d=await a.bauen(o,r.map(u=>String(u??"")),s>=0?l.rows[s]:void 0);k.upsert(t,d)}),loeschen:s=>Be(n,()=>{const r=l.recs[s];r&&k.remove(t,r.id)})})),i.push(at(e,t)),i}const we=(e,n,t)=>({id:e?.id??k.newId(et[n]),hinweis:t.trim(),herkunft:e?.herkunft==="import"?"import":"manuell",herkunftDetail:e?.herkunftDetail}),U=(e,n,t)=>!n||(e[t]??"")!==(n[t]??"");function rt(e){const n=k.list("stations"),t=new Map(n.map(i=>[i.id,i.name])),a=i=>`${i.typ}${i.aufbau==="gross"&&i.typ!=="RTW-C"?" (groß)":""}`,l=i=>i.ersatzFuer?`nur bei Flugverbot (Ersatz für ${i.ersatzFuer})`:dr(i.dienstplan);return be(e,"fahrzeuge","vehicles",{cols:["Funkrufname","Kurzname","Kategorie","Typ","Dienststelle","Dienstplan","Aktiv"],wort:"Fahrzeuge",zeile:i=>[i.funkrufname,i.kurzname,i.kategorie,a(i),t.get(i.dienststelleId)??"⚠ fehlt",l(i),i.aktiv?"ja":"nein",i.nachtflug?"ja":"nein",i.ersatzFuer??"",i.hinweis??""],x:{suche:"Fahrzeug suchen …",neu:"Neues Fahrzeug",ding:"Fahrzeug",typen:["text","text",["sel",[...Fn]],"text","text","plan","tog"],extra:[["Nachtflug","tog","nein"],["Ersatz für","text",""],["Hinweis","text",""]]},bauen:(i,s,r)=>{const o=s[0].trim();if(!o)throw new Error("Bitte einen Funkrufnamen eingeben");const d=Fn.includes(s[2])?s[2]:i?.kategorie??"RTW";let u=i?.dienststelleId??"";if(U(s,r,4)||!i){const B=s[4].trim().toLowerCase(),te=n.filter(se=>se.name.trim().toLowerCase()===B);if(!te.length)throw new Error(`Dienststelle „${s[4]}“ gibt es nicht`);if(te.length>1&&!te.some(se=>se.id===u))throw new Error(`Dienststelle „${s[4]}“ gibt es mehrmals – bitte im Spiel unter Daten zuordnen`);u=te.some(se=>se.id===u)?u:te[0].id}let f=s[3].replace(/\s*\(groß\)\s*$/,"").trim(),h=i?.aufbau;i&&!U(s,r,3)?f=i.kategorie===d?i.typ:d:U(s,r,3)&&(h=/\(groß\)\s*$/.test(s[3])?"gross":void 0),f||(f=d);let b=i?.dienstplan;if(!i||U(s,r,5)){const B=Ga(s[5]);if(B.fehler)throw new Error(B.fehler);b=B.plan}const z={...i??{},...we(i,"vehicles",s[9]??""),funkrufname:o,kurzname:s[1].trim(),kategorie:d,typ:f,dienststelleId:u,aktiv:s[6]==="ja",nachtflug:s[7]==="ja",dienstplan:b??[]};h?z.aufbau=h:delete z.aufbau;const Z=(s[8]??"").trim();(Z||i?.ersatzFuer!==void 0)&&(z.ersatzFuer=Z);const T=[z];if(z.typ.toUpperCase()==="RTW-C"){z.typ="RTW-C",z.aufbau="gross";for(const B of k.list("vehicles"))B.id!==z.id&&B.dienststelleId===z.dienststelleId&&B.typ.trim().toUpperCase()==="RTW-C"&&T.push({...B,typ:"RTW",aufbau:"gross"})}return T}})}function it(e){const n=new Map;for(const a of k.list("vehicles"))n.set(a.dienststelleId,(n.get(a.dienststelleId)??0)+1);const t=[...new Set([...Vt,...k.list("stations").map(a=>a.typ).filter(Boolean)])];return be(e,"dienststellen","stations",{cols:["Name","Typ","Ort","Bezirk","Fahrzeuge"],wort:"Dienststellen",zeile:a=>[a.name,a.typ,a.ort,a.bezirk,String(n.get(a.id)??0),a.adresse??"",Ke(a),a.hinweis??""],x:{suche:"Dienststelle suchen …",neu:"Neue Dienststelle",ding:"Dienststelle",typen:["text",["sel",t],"text","text","fix"],extra:[["Adresse","text",""],["Lage","lage",""],["Hinweis","text",""]]},bauen:async(a,l,i)=>{const s=l[0].trim();if(!s)throw new Error("Bitte einen Namen eingeben");const r=await Le(l[6]||(a?"":l[5]),a,i?.[6]);return[{...a??{},...we(a,"stations",l[7]??""),name:s,typ:l[1]||"Rettungsdienst",organisation:a?.organisation??"",ort:l[2].trim(),bezirk:l[3].trim(),adresse:(l[5]??"").trim(),lat:r.lat,lon:r.lon}]}})}const st=new Map(Tt.flatMap(e=>[[e.name.toLowerCase(),e.id],[e.id.toLowerCase(),e.id]])),lt=new Map(yt.flatMap(e=>[[e.name.toLowerCase(),e.id],[e.id.toLowerCase(),e.id]])),on=(e,n,t)=>e.split(/\s*[;,]\s*/).map(a=>a.trim()).filter(Boolean).map(a=>{const l=n.get(a.toLowerCase());if(!l)throw new Error(`${t} „${a}“ gibt es nicht`);return l});function ot(e){return be(e,"krankenhaeuser","hospitals",{cols:["Name","Kurzname","Ort"],wort:"Krankenhäuser",zeile:n=>[n.name,n.kurzname,n.ort,Ke(n),Ja(n.zufahrt),Ua(n.landeplatz),(n.einrichtungen??[]).map(t=>Za(t)?.name??t).join(", "),(n.akutAus??[]).map(t=>Va(t)?.name??t).join(", "),"",n.hinweis??""],x:{suche:"Krankenhaus suchen …",neu:"Neues Krankenhaus",ding:"Krankenhaus",typen:["text","text","text"],extra:[["Lage","lage",""],["Rettungszufahrt","text",""],["Hubschrauberlandeplatz","text",""],["Einrichtungen","einr",""],["Akut-Bereiche aus","text",""],["Aufnahme bei Notfällen","khlink",""],["Hinweis","text",""]],hint:"„Akut-Bereiche aus“ mit Komma getrennt · Öffnungszeiten der Akut-Bereiche unter KH-Aufnahme"},bauen:async(n,t,a)=>{const l=t[0].trim();if(!l)throw new Error("Bitte einen Namen eingeben");const i=await Le(t[3],n,a?.[3]),s={...n??{},...we(n,"hospitals",t[9]??""),name:l,kurzname:t[1].trim(),ort:t[2].trim(),lat:i.lat,lon:i.lon};if((!n||U(t,a,6))&&(s.einrichtungen=on(t[6],st,"Einrichtung")),(!n||U(t,a,7))&&(s.akutAus=on(t[7],lt,"Akut-Abteilung")),!n||U(t,a,4)){const r=Ma(t[4]);if(t[4].trim()&&!r)throw new Error("Zufahrt: bitte so angeben: einfahrt=48.41296,15.61544; p=48.41247,15.61458");s.zufahrt=r}if(!n||U(t,a,5)){const r=Ha(t[5]);if(t[5].trim()&&!r)throw new Error("Landeplatz: bitte Koordinaten („48.41210,15.61480“) oder „kein“ angeben");s.landeplatz=r}return delete s.abteilungen,delete s.bereiche,[s]}})}function ut(e){const n=t=>hr(t).map(gr).join(", ");return be(e,"pois","pois",{cols:["Name","Kategorien","Ort"],wort:"Orte",zeile:t=>[t.name,n(t),t.ort,Ke(t),t.hinweis??""],x:{suche:"Ort suchen …",neu:"Neuer Ort",ding:"Ort",typen:["text","text","text"],extra:[["Lage","lage",""],["Hinweis","text",""]],hint:"Kategorien mit Komma getrennt, z. B. „Pflegeheim, Schule“"},bauen:async(t,a,l)=>{const i=a[0].trim();if(!i)throw new Error("Bitte einen Namen eingeben");const s=await Le(a[3],t,l?.[3]);let r=t?.typ??"";if(!t||U(a,l,1)){const d=[],u=[];for(const f of a[1].split(/\s*[;,]\s*/).map(h=>h.trim()).filter(Boolean)){const h=qa.find(b=>!b.liste&&(b.key===f.toLowerCase()||b.label.toLowerCase()===f.toLowerCase()));h?d.push(h.key):u.push(f)}r=Ya(d,u.join(", "))}return[{...t??{},...we(t,"pois",a[4]??""),name:i,typ:r,ort:a[2].trim(),lat:s.lat,lon:s.lon}]}})}const dt=["nach Stufe","ja","nein"];function ct(e){return be(e,"vorlagen","templates",{cols:["Code","Adresse","Meldung"],wort:"Vorlagen",zeile:n=>[n.code,n.adresse,n.meldung,Ke(n),n.patientAlter==null?"":String(n.patientAlter),n.transport==null?"nach Stufe":n.transport?"ja":"nein",n.hinweis??""],x:{suche:"Vorlage suchen …",neu:"Neue Vorlage",ding:"Vorlage",typen:["text","text","text"],extra:[["Lage","lage",""],["Patient Alter","text",""],["Transport",["sel",dt],"nach Stufe"],["Hinweis","text",""]]},bauen:async(n,t,a)=>{const l=t[0].trim();if(!l)throw new Error("Bitte einen Code eingeben");const i=await Le(t[3]||(n&&!U(t,a,1)?"":t[1]),n,a?.[3]),s=t[4].trim();if(s&&!Number.isFinite(Number(s)))throw new Error(`Alter „${s}“ ist keine Zahl`);return[{...n??{},...we(n,"templates",t[6]??""),code:l,adresse:t[1].trim(),meldung:t[2].trim(),lat:i.lat,lon:i.lon,patientAlter:s===""?null:Number(s),transport:t[5]==="ja"?!0:t[5]==="nein"?!1:null}]}})}function ht(e){const n=An(),t=tn("notruf"),a=t?t.replace(/\.(json|csv|txt)$/i,""):null,l=k.schema?Object.keys(k.schema.kapitel).length:new Set(n.map(u=>u.gruppenname)).size,i=Nn(),s=k.ktSatzRoh?k.ktSatzRoh.name||"Eigener Satz":null,r=a?`Eigene Datei: ${a}`:"LeitWerk-Codesystem (eingebaut)",o=s?`Eigene Datei: ${s}`:"LeitWerk-Transportcodes (eingebaut)",d=u=>u.gruppe?`${u.gruppe} - ${u.gruppenname}`:u.gruppenname;return[e.I("Notruf (RD)",r,`${N(n.length)} Codes in ${l} Kapiteln${k.schema?", mit Abfrage":""}`,n.length?v:y),e.I("Krankentransport & Überstellung (KT/SEK)",o,`${N(i.length)} Codes, mit KT-Abfrage`,i.length?v:y),e.B("Eigene Codes & Abfrage",[{l:"Notruf (RD)",go:["real","notruf"]},{l:"KT/SEK",go:["real","ktsek"]}],"Unter Eigene Dateien hochladen und umschalten – jeder Spieler selbst"),e.S("Codeliste","codeart",["Notruf (RD)","KT/SEK"],"Notruf (RD)"),e.TAB(["Code","Name","Kategorie","Kapitel"],n.map(u=>[u.code,u.beschreibung,u.stufe,d(u)]),{suche:"Code suchen …",anzahl:`${N(n.length)} Codes · ${a??"LeitWerk-Codesystem"}`,when:u=>u("codeart","Notruf (RD)")==="Notruf (RD)"}),e.TAB(["Code","Name","Kapitel","Art"],i.map(u=>[u.code,u.name,u.kapitel,u.gruppe]),{suche:"Code suchen …",anzahl:`${N(i.length)} Codes · ${s??"LeitWerk-Transportcodes"}`,when:u=>u("codeart","Notruf (RD)")==="KT/SEK"})]}const gt={alarmWache:"alarmiert auf der Wache",alarmFunk:"alarmiert über Funk"},un=e=>mr[e]??gt[e]??e;function ft(e){return[e.H("Bedeutung · Nummer · Bezeichnung · Farbe · alarmierbar"),...k.settings.status.map((n,t)=>({t:"stat",label:un(n.key),key:"st"+(t+1),nr:n.nummer,nm:n.name,color:n.farbe,on:n.verfuegbar}))]}const dn=e=>e.replace(/\.(json|csv|txt)$/i,""),Re={notruf:"Eingebaut – LeitWerk-Codesystem",ktsek:"Eingebaut – LeitWerk-Transportcodes"},mt={notruf:"Eine JSON-Datei mit Kapiteln, Fragen, Regeln und Codes – Aufbau wie die Beispieldatei",ktsek:"Eine JSON-Datei mit allen KT/SEK-Codes und ihren Bedingungen – Aufbau wie die Beispieldatei"},pt={notruf:{datei:"Beispiel Notruf.json",hint:"Kleines, vollständiges Beispiel (3 Kapitel) – zeigt den Aufbau. Oben in der Datei steht eine Anleitung für eine KI.",text:()=>jn,ki:()=>{const e=JSON.parse(jn).anleitung_fuer_ki??"";return Array.isArray(e)?e.join(`
`):e}},ktsek:{datei:"Beispiel KT-SEK.json",hint:"Die eingebauten KT/SEK-Codes als Beispiel – vollständig, weil jede Kombination genau einen Code braucht. Oben in der Datei steht eine Anleitung für eine KI.",text:oa,ki:()=>Sa().join(`
`)}},kt=(e,n,t)=>`${e}

## Beispieldatei (${t})

\`\`\`
${n}
\`\`\`

## Mein Auftrag
Region: 
Worauf achten: 
`,cn=(e,n,t)=>c("KI-Anleitung kopieren",async()=>(await navigator.clipboard.writeText(kt(e(),n(),t)),"Kopiert – in eine KI einfügen, unten Region und Wünsche ergänzen"));function hn(e,n,t,a,l,i){const s=`ak_${n}_${nn[n]??0}`;Un[s]=d=>{d!==a&&(xe[n]={t:"wird umgeschaltet …",dot:p},$(),l(d).then(u=>xe[n]={t:u,dot:v}).catch(u=>xe[n]={t:Ae(u),dot:_e}).finally(()=>{nn[n]=(nn[n]??0)+1,Promise.all([I(),H()]).finally($)}))};const r=[e.L("Aktiv",s,t,a,i)],o=xe[n];return o&&r.push(e.I("Rückmeldung",o.t,"",o.dot)),r}const gn=(e,n)=>S?e.B("Ordner",[c("Ordner öffnen",()=>Wn(n))],`Dokumente/LeitWerk/${n}`):e.B("Ordner",[],`Dokumente/LeitWerk/${n}`,{chip:X,dot:p});function fn(e,n){const t=Ln[n],a=g.teile?.[n],l=tn(n),i=[],s=(a??[]).filter(h=>!h.entwurf),r=s.map(h=>h.name),o=l?dn(l):Re[n],d=[Re[n],...r];if(l&&!r.some(h=>h.toLowerCase()===o.toLowerCase())&&d.push(o),i.push(...hn(e,n,d,o,async h=>{if(h===Re[n])return an(n,null);const b=s.find(z=>z.name===h);if(!b)throw new Error(`„${h}“ ist nicht mehr im Ordner – bitte neu hochladen`);return an(n,b.datei)},"Gilt sofort · nur auf diesem Rechner · Liste = Dateien im Ordner")),n==="notruf"){const h=k.schemaRoh;i.push(e.I("Inhalt",h?`${N(Object.keys(h.kapitel).length)} Kapitel · ${N(Object.keys(h.codes??{}).length)} Codes`:`${N(An().length)} Codes`,"Codes und Abfrage stecken in derselben Datei",v)),i.push(e.B("Zuordnung zu den LeitWerk-Merkmalen",[{l:"Zuordnung …",sub:"zuordnung"}],"Nur für eine eigene Datei: welche Frage welchem Merkmal entspricht – damit die Anrufer passend antworten"))}else i.push(e.I("Inhalt",`${N(Nn().length)} Codes`,"Die Fragen der KT-Hotline sind immer die eingebauten",v)),i.push(e.B("KT-Code-Editor",[c("Editor öffnen",()=>(Pn({fertig:()=>void I()}),"Im Editor geöffnet"))],"Codes und Bedingungen im Spiel bearbeiten – speichert als neue Datei; dort auch Entwürfe fertigstellen"));const u=pt[n];i.push(e.H("Eigene Datei hinzufügen")),i.push(e.B("Datei hochladen",[A("Datei wählen …",".json,application/json",async h=>Xa(n,h.name,await Ie(h)),I)],`${mt[n]} · wird in den Ordner kopiert und gleich verwendet`));const f=[c("Beispieldatei herunterladen …",async()=>await ge(u.datei,u.text(),{name:"JSON-Datei",extensions:["json"]})?`Gespeichert: ${u.datei}`:"Abgebrochen")];n==="notruf"&&f.push(c("Eingebautes System herunterladen …",async()=>await ge("LeitWerk-Codesystem.json",Qa,{name:"JSON-Datei",extensions:["json"]})?"Gespeichert: LeitWerk-Codesystem.json":"Abgebrochen")),i.push(e.B("Beispieldatei",f,u.hint)),i.push(e.B("Mit einer KI erstellen",[cn(u.ki,u.text,"JSON")],"Kopiert die Anleitung samt Beispieldatei – in eine KI einfügen und nur noch Region und Wünsche dazuschreiben")),i.push(gn(e,t.ordner)),i.push(e.H(`Dateien im Ordner ${t.ordner}`)),a?a.length||i.push(e.I("Dateien","noch keine eigene Datei","Mit „Datei hochladen“ hinzufügen oder direkt in den Ordner legen",p)):i.push(e.I("Dateien",P,"",p));for(const h of a??[]){const b=l?.toLowerCase()===h.datei.toLowerCase(),z=[];n==="ktsek"&&z.push(c("Bearbeiten",async()=>{const Z=er(await _n(t.ordner,h.datei),h.datei);return Pn({satz:{codes:Z},name:h.name,fertig:()=>void I()}),"Im Editor geöffnet"})),z.push(c("Löschen",()=>ua(n,h.datei),{cfm:`„${h.datei}“ wird aus Dokumente/LeitWerk/${t.ordner} gelöscht.`},I)),i.push(e.IT(h.name,`${h.entwurf?"ENTWURF – im KT-Code-Editor fertigstellen · ":""}${h.datei}`,b?"aktiv":h.entwurf?"Entwurf":"",b?v:h.entwurf?y:"",{btns:z}))}return i}function bt(e){const n="Eingebaut – neutrale Namen",t=k.namen.length?k.namenDatei??"":null,a=g.namen??[],l=t===null?n:t||"eigene Namen",i=[n,...a.map(o=>o.datei)];t!==null&&!i.includes(l)&&i.push(l);const s=[...hn(e,"namen",i,l,async o=>o===n?(k.setNamen(null),"Wieder neutrale Namen"):mn(o),"Gilt sofort · nur auf diesem Rechner · Liste = Dateien im Ordner"),e.I("Ersetzungen",t===null?"Rettungsdienst, Rettungswache, Krankentransport, Luftrettung, NAH 2 …":`${N(k.namen.length)} Ersetzungen aus „${t}“`,"Gilt für Dienststellen, Organisationen, Hubschrauber-Namen und Orte – auch für Krankentransport und Überstellungen",v),e.H("Eigene Datei hinzufügen")],r=A("Datei wählen …",".csv,.txt,text/csv,text/plain",async o=>{const d=await Ie(o),u=Cn(d);if(!u.length)throw new Error("Keine Ersetzungen gefunden (Zeilen „neutral;eigen“, rechts ausgefüllt)");const f=Fe(o.name,"csv");return await Jn("Namen",f,d),k.setNamen(u,f),`${N(u.length)} Ersetzungen aktiv – „${f}“ in Dokumente/LeitWerk/Namen`},H);s.push(e.B("Datei hochladen",[r],"CSV „neutral;eigen“ – links der neutrale Name aus der Vorlage, rechts dein Name · wird in den Ordner kopiert und gleich verwendet")),s.push(e.B("Beispieldatei",[c("Beispieldatei herunterladen …",async()=>await ge(he,On(Rn()))?`Gespeichert: ${he}`:"Abgebrochen")],"Alle neutralen Namen: Organisationen, Hubschrauber, Stützpunkte für Krankentransport & Überstellung (KT/SEK), Dienststellen – rechts eintragen. Oben steht eine Anleitung für eine KI. Liegt auch im Ordner.")),s.push(e.B("Mit einer KI erstellen",[cn(()=>nr().join(`
`),()=>On(Rn()),"CSV")],"Kopiert die Anleitung samt Beispieldatei – in eine KI einfügen und nur noch die Region dazuschreiben")),s.push(gn(e,"Namen")),s.push(e.B("Im Ordner geändert?",[c("Neu einlesen",()=>H().then(()=>t?mn(t):"Eingelesen"))],"Nach dem Bearbeiten einer Datei im Ordner")),s.push(e.H("Dateien im Ordner Namen")),g.namen||s.push(e.I("Dateien",P,"",p));for(const o of a){const d=t!==null&&t.toLowerCase()===o.datei.toLowerCase(),u=o.datei===he,f=u?[]:[c("Löschen",async()=>(await Zt("Namen",o.datei),d&&k.setNamen(null),"Gelöscht"),{cfm:`„${o.datei}“ wird aus Dokumente/LeitWerk/Namen gelöscht.`},H)];s.push(e.IT(dn(o.datei),u?"Vorlage mit allen neutralen Namen – rechts eintragen, unter neuem Namen speichern":o.datei,d?"aktiv":"",d?v:"",{btns:f}))}return s}async function mn(e){const n=Cn(await _n("Namen",e));if(!n.length)throw new Error(e===he?"Die Vorlage ist noch leer – rechts die eigenen Namen eintragen":"Keine Ersetzungen in der Datei (rechte Spalte leer?)");return k.setNamen(n,e),`${N(n.length)} Ersetzungen aktiv`}function wt(e){if(!S)return[e.I("Kartenpakete",X,"Kartenpakete gibt es nur im installierten Programm",p),e.I("Satellitenbild","online, ohne Paket","",p)];const n=[],t=g.local,a=g.geo,l=t?.installed??{};if(n.push(e.I("Grundpaket & Straßen Niederösterreich",t===void 0?P:l[Ge]&&l["bl-noe"]?"immer installiert":"fehlt – wird beim Start geladen","",t===void 0?p:l[Ge]&&l["bl-noe"]?v:y)),a===void 0)n.push(e.I("Straßennetz und Adressen",P,"",p));else if(!a)n.push(e.I("Straßennetz und Adressen","Status unbekannt","",y));else{const f=(a.regionen??[]).map(h=>h==="alt"?"älteres Gesamtnetz":En[h]??h).join(", ");n.push(e.I("Straßennetz und Adressen",a.roads,[a.roads_nodes?`${N(a.roads_nodes)} Knoten`:"",a.address_count?`${N(a.address_count)} Adressen`:"",f?`Bundesländer: ${f}`:""].filter(Boolean).join(" · "),a.roads_nodes?v:y))}g.packsFehler&&n.push(e.I("Paketverzeichnis","nicht erreichbar",`${g.packsFehler} – Download derzeit nicht möglich`,y));const i=g.packs??[],s=[...new Set([...i.map(f=>f.id),...Object.keys(l)])].filter(f=>f!==Ge&&f!=="bl-noe"),r=a?.regionen_aus??[],o=f=>{const h=i.find(je=>je.id===f),b=l[f],z=V[`pack:${f}`],Z=!!(h&&b&&h.version!==b.version),T=f.startsWith("bl-")?f.slice(3):null,B=[];z||(h&&(!b||Z)&&B.push(c(b?"Aktualisieren":"Laden",async()=>(await K(`pack:${f}`,"Wird geladen … 0 %",je=>tr(f,kn=>je(`Wird geladen … ${Ee(kn.done,kn.total)}`))),Ye(),`${h.name} installiert`),{},G)),b&&!(h?.pflicht??!1)&&B.push(c("Löschen",async()=>(await da(f),Ye(),"Gelöscht"),{cfm:`${h?.name??f} löschen?${T?` Ohne Paket gibt es keine Transporte nach ${En[T]??T}.`:""} Du kannst es jederzeit wieder laden.`},G)));const te={btns:B};b&&T&&T!=="noe"&&(te.tog=["kp_"+T,!r.includes(T)]);const se=[h?.beschreibung,h?ca(ha(h)):""].filter(Boolean).join(" · ");return e.IT(h?.name??f,se,z??(Z?"Update verfügbar":b?"installiert":""),z?fe:Z?y:b?v:"",te)},d=s.filter(f=>f.startsWith("bl-")),u=s.filter(f=>!f.startsWith("bl-"));return n.push(e.H("Straßen weiterer Bundesländer")),g.packs===void 0&&!d.length&&n.push(e.I("Paketverzeichnis",P,"",p)),n.push(...d.map(o)),n.push(e.H("Detailkarten und Gelände")),n.push(...u.map(o)),n.push(e.I("Satellitenbild","online, ohne Paket","",p)),t?.dir&&n.push(e.I("Speicherort",t.dir,"",p)),n}function zt(e){const n=g.update,t=[e.I("Version",g.version===void 0?P:S?n?`${g.version} · Update auf ${n.version} verfügbar`:`${g.version} · aktuell`:`${g.version} · Entwicklung im Browser`,"",S?n?y:v:p)];if(!S)t.push(e.B("Updates",[],"",{chip:X,dot:p}));else{const a=[c("Jetzt suchen",async()=>{const l=await ar();return g.update=l,l?`Version ${l.version} verfügbar`:"Auf dem neuesten Stand"})];n&&a.push(c("Installieren",()=>(rr(n),"Wird installiert – LeitWerk startet danach neu"),{cfm:"Jetzt aktualisieren? LeitWerk startet danach neu – deine Daten und Einstellungen bleiben."})),t.push(e.B("Updates",a,n?.notes?n.notes.split(`
`)[0]:void 0))}t.push(e.H("Eigene Dateien & Spielstände")),t.push(e.I("Ordner",g.basis??"…","Alles, was du selbst dazugibst, liegt dort – je Art ein Ordner",p)),t.push(e.B("Spielstände",[{l:"Ansehen",tab:"fort"},...S?[c("Ordner öffnen",()=>ir())]:[]],"Gespeicherte Schichten"));for(const[a,l]of Object.entries(Ut))["Abfrageschema","Codelisten","Codelisten/RD","Abfrageschema/Krankentransport_Sekundärtransporte"].includes(a)||t.push(S?e.B(a.replace(/_/g," "),[c("Ordner öffnen",()=>Wn(a))],l):e.B(a.replace(/_/g," "),[],l,{chip:X,dot:p}));return t}const St={fgfarben:F,statusfarben:C,toene:de,tondateien:E,anrufe:Y,gemini:ve,modelle:M,piper:ce,whisper:We,anordnungen:Zn,faelle:Vn,alarmierung:Qn,fahrzeuge:rt,dienststellen:it,krankenhaeuser:ot,pois:ut,vorlagen:ct,codes:ht,status:ft,notruf:e=>fn(e,"notruf"),ktsek:e=>fn(e,"ktsek"),namen:bt,karten:wt,programm:zt},Et=(e,n)=>{const t=St[e];if(t)try{return t(n)}catch(a){return console.error("Hauptmenü-Zeilen",e,a),[n.I("Fehler",Ae(a),"Diese Seite konnte nicht aufgebaut werden",_e)]}};let pn=!1;return{zeilen:Et,laden(){pn||(pn=!0,$e(),ee(),x(),ue(),ae(),re(),I(),H(),G(),Ne())},beenden(){D=!0,Q&&clearTimeout(Q),J.splice(0).forEach(e=>e()),oe?.bald===R&&(oe=null)}}}export{br as feldWert,wr as zeilenQuelle};
