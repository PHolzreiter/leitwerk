import{k as Vt,h as pn,e as p,j as Zt,m as Ye,t as Re,n as at,p as Ut,q as st,O as qt,r as kn,s as Yt,u as Xt,v as yn,w as nn,K as Qt,x as Fn,N as ve,E as er,A as nr,y as b,z as tr,B as rr,C as ir,D as ar,G as Cn,H as sr,J as Le,L as lr,M as or,P as ur,Q as dr,U as cr,V as me,W as hr,g as gr,X as fr,Y as mr,Z as In,_ as pr,$ as kr,a0 as tn,a1 as Wn,a2 as br,a3 as _n,a4 as xn,a5 as wr,a6 as rn,a7 as an,a8 as sn,a9 as Sr,aa as zr,ab as Ar,ac as J,ad as Oe,ae as Er,af as Pe,ag as Be,ah as Me,ai as ln,aj as on,ak as Rn,al as Tr,am as vr,an as On,ao as Lr,ap as Br,aq as Kr,ar as $r,as as Ke,at as Nr,au as Dr,av as yr,aw as Pn,ax as Fr,ay as Cr,az as un,aA as Ir,aB as Wr,aC as _r,aD as xr,aE as Rr,aF as Or,aG as Mn,aH as Pr,aI as Ge,aJ as Gn,aK as Mr,aL as Hn,aM as dn,aN as Gr,aO as cn,aP as Hr,aQ as jr,aR as jn,aS as Jr,aT as hn,aU as Jn,aV as Vr,aW as Zr,aX as He,aY as Ur,aZ as Vn,a_ as Zn,a$ as qr,b0 as Yr,b1 as je,b2 as Xr,b3 as Qr,b4 as Un,b5 as Je,b6 as ei,b7 as ni,b8 as qn,b9 as ti,ba as $e,bb as ri,bc as ii,bd as ai,be as pe,bf as si,bg as gn,bh as li,bi as oi,bj as ui,bk as di,bl as ci,bm as hi,bn as gi,bo as Yn,bp as fi,bq as mi,br as pi,bs as ki,bt as bi,bu as wi,bv as Si,bw as zi,bx as Ai,by as Xn,bz as Ei,bA as Ti,bB as vi,bC as Qn,bD as et,bE as Li,bF as Bi,bG as Ki,bH as $i,bI as Ni,bJ as Di,bK as nt,bL as fn,bM as yi,bN as Fi,bO as Ci,bP as Ii,bQ as Wi,bR as _i,bS as xi,bT as Ri}from"./index-CEFZ1DJh.js";const Oi={ok:"#4CC38A",grau:"#9AA3B5",gelb:"#FFC72C",blau:"#3B8BFF",rot:"#E5484D"},Pi={freiWache:"frei auf der Wache",zumBO:"Anfahrt zum Einsatzort",amBO:"am Einsatzort",zumZO:"Transport zum Zielort",amZO:"am Zielort / Übergabe",freiFunk:"frei, unterwegs",dienstfahrt:"Dienstfahrt (alarmierbar)",bereitschaft:"Bereitschaft (alarmierbar)",alarmiert:"alarmiert, rückt aus",abgemeldet:"nicht im Dienst"},tt=`{
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
`;function rt(z={}){const f=z.satz??Vt(),F={codes:structuredClone(f.codes??[])},ne=pn("ktsek"),$=z.name??(ne?ne.replace(/\.json$/i,""):null),G=p("div",{class:"kte"}),w=p("div",{class:"kte-kopf"}),te=p("input",{type:"text",name:"satzname",placeholder:"Name der Datei"});te.value=$??"Meine KT-SEK-Codes";const W=p("label",{class:"fld"});W.append(p("span",{class:"fld-label"},"Name der Datei"),te),w.appendChild(W);const de=p("div",{class:"kte-pruefung"}),se=p("div",{class:"mh-reiter"}),re=p("div",{class:"kte-inhalt"});G.append(w,de,se,re);let U="",_=null;const V=()=>{const d=Yt({codes:F.codes},Xt());de.innerHTML="";const v=p("div",{class:`kte-status ${d.fehler.length?"fehler":"ok"}`});if(v.textContent=d.fehler.length?`${d.fehler.length} Problem${d.fehler.length===1?"":"e"} – so nur als Entwurf speicherbar`:`Alles vollständig: jede mögliche Kombination hat genau einen Code (${F.codes.length} Codes)`,de.appendChild(v),d.fehler.length||d.hinweise.length){const L=p("ul",{class:"kte-liste"});let R=0;d.fehler.forEach(C=>{const D=p("li",{class:"fehler"},C),ce=C.startsWith("Kein Code für")?d.fehlend[R++]:void 0;if(ce){const A=p("button",{class:"btn small",type:"button"},"Code anlegen");A.addEventListener("click",()=>De(ce)),D.appendChild(A)}L.appendChild(D)});for(const C of d.hinweise)L.appendChild(p("li",{class:"hinweis"},C));de.appendChild(L)}return Se?.setActionEnabled(2,d.fehler.length===0),d},De=(d={})=>{F.codes.unshift({code:"",name:"",kapitel:"",bed:{...d}}),_=0,U="",q()};function we(){const d=p("div",{class:"kte-leiste"}),v=p("input",{type:"search",placeholder:"Codes durchsuchen …",class:"kte-suche"});v.value=U,v.addEventListener("input",()=>{U=v.value,C()});const L=p("button",{class:"btn small primary",type:"button"},"+ Neuer Code");L.addEventListener("click",()=>De()),d.append(v,L);const R=p("div",{class:"kte-codes"});re.append(d,R);const C=()=>{R.innerHTML="";const A=U.trim().toLowerCase();F.codes.forEach((y,O)=>{A&&!`${y.code} ${y.name} ${yn(y.bed)}`.toLowerCase().includes(A)&&_!==O||R.appendChild(O===_?ce(y):D(y,O))}),R.childElementCount||R.appendChild(p("p",{class:"muted"},"Keine Codes gefunden."))},D=(A,y)=>{const O=p("div",{class:"kte-zeile"});O.innerHTML=`<b class="kte-code">${nn(A.code||"(ohne Namen)")}</b><span class="kte-name">${nn(A.name)}</span><span class="muted small kte-bed">${nn(yn(A.bed))}</span>`;const ie=p("div",{class:"row-btns"}),H=p("button",{class:"btn small",type:"button",title:"Bearbeiten"},"✎");H.addEventListener("click",()=>{_=y,C()});const Q=p("button",{class:"btn small",type:"button",title:"Kopieren"},"⧉");Q.addEventListener("click",()=>{F.codes.splice(y+1,0,{...structuredClone(A),code:`${A.code}-Kopie`}),_=y+1,V(),C()});const Y=p("button",{class:"btn small danger-text",type:"button",title:"Löschen"},"✕");return Y.addEventListener("click",()=>{F.codes.splice(y,1),_=null,V(),C()}),ie.append(H,Q,Y),O.appendChild(ie),O},ce=(A,y)=>{const O=p("div",{class:"kte-form"}),ie=p("div",{class:"form-grid"}),H=(j,Z)=>{const ge=p("label",{class:"fld"});ge.append(p("span",{class:"fld-label"},j),Z),ie.appendChild(ge)},Q=p("input",{type:"text",name:"code",placeholder:"z. B. KTR-90T3"});Q.value=A.code,Q.addEventListener("input",()=>{A.code=Q.value.trim(),V()});const Y=p("input",{type:"text",name:"name",placeholder:"Bezeichnung"});Y.value=A.name,Y.addEventListener("input",()=>A.name=Y.value);const he=p("input",{type:"text",name:"kapitel",placeholder:"Gruppe in der Auswahl (optional)"});he.value=A.kapitel??"",he.addEventListener("input",()=>A.kapitel=he.value),H("Code *",Q),H("Bezeichnung",Y),H("Gruppe",he);for(const j of Qt){const Z=p("select",{name:`bed-${j}`});Z.appendChild(p("option",{value:""},j==="fahrt"?"– bitte wählen –":"beliebig"));for(const[ge,Fe]of Object.entries(Fn[j].werte))Z.appendChild(p("option",{value:ge},Fe));Z.value=A.bed[j]??"",Z.addEventListener("change",()=>{Z.value?A.bed[j]=Z.value:delete A.bed[j],V()}),H(Fn[j].label+(j==="fahrt"?" *":""),Z)}O.appendChild(ie);const ze=p("button",{class:"btn small primary",type:"button"},"Fertig");return ze.addEventListener("click",()=>{_=null,C()}),O.appendChild(ze),O};C()}function q(){se.innerHTML="",se.appendChild(p("p",{class:"muted small"},`${F.codes.length} Codes · die Fragen der KT-Hotline sind die eingebauten`)),re.innerHTML="",we(),V()}const ye=async d=>{const v=Ye(te.value.trim()||"Meine KT-SEK-Codes");if(/^LeitWerk/i.test(v))return Re("Bitte einen eigenen Namen wählen – die eingebauten Codes bleiben unverändert","error"),!1;const L=V();if(!d&&L.fehler.length)return!1;const R=(await at("ktsek")).find(D=>D.name.toLowerCase()===v.toLowerCase());if(R&&R.name.toLowerCase()!==($??"").toLowerCase()&&!await Ut("Datei ersetzen?",`Es gibt schon eine Datei „${R.name}“.`,"Ersetzen"))return!1;const C=d?{entwurf:!0}:{};return await st(qt.kt.codes,`${v}.json`,JSON.stringify({...C,codes:F.codes.filter(D=>D.code||D.name)})),d?Re(`Entwurf „${v}“ gespeichert – ${L.fehler.length} Problem${L.fehler.length===1?"":"e"} offen`):await kn("ktsek",`${v}.json`).then(D=>Re(D)).catch(D=>Re(String(D.message??D),"error")),z.fertig?.(),!0},Se=Zt({title:"KT/SEK-Codes bearbeiten",body:G,wide:!0,actions:[{label:"Abbrechen"},{label:"Als Entwurf speichern",onClick:()=>ye(!0)},{label:"Speichern & verwenden",kind:"primary",onClick:()=>ye(!1)}]});Se.root.parentElement?.classList.add("kte-dlg"),q()}const{ok:E,grau:m,gelb:T,blau:ee,rot:Ve}=Oi,M="nur im Programm",I="wird geprüft …",x={},bn={},lt={},mn={},Ze={},ke={};let ue=null;function Hi(z,f){if(bn[z]=f,z.startsWith("ak_"))return void lt[z]?.(String(f??""));const F=z.match(/^kp_(.+)$/);F?ue?.regionSchalten(F[1],!!f):z.startsWith("tq_")&&ue?.bald()}const K=z=>z.toLocaleString("de-DE"),oe=(z,f=1)=>z.toFixed(f).replace(".",","),be=(z,f)=>`${Math.min(100,Math.round(z/Math.max(1,f)*100))} %`,Ne=z=>String(z?.message??z),it=z=>String(z??"").toLowerCase().replace(/ä/g,"a").replace(/ö/g,"o").replace(/ü/g,"u").replace(/ß/g,"ss"),Ue=z=>new Promise(f=>setTimeout(f,z));async function qe(z){return Ci(await z.arrayBuffer())}function ji(z){const f={};let F=!1,ne=0;const $=()=>{F||z()},G=()=>{ne||F||(ne=window.setTimeout(()=>{ne=0,$()},200))},w=On(),te=async()=>{f.dateien=(await sr().catch(()=>[])).filter(e=>e.art!=="alarm"),$()},W=async()=>{w&&(f.ki=await Le().catch(()=>null),$())},de=async()=>{w&&(f.ram=await lr().catch(()=>0),$())},se=async()=>{w&&(f.piper=await or().catch(()=>[]),$())},re=async()=>{w&&(f.whisper=(await ur().catch(()=>({modelle:[],ordner:""}))).modelle,$())},U=async()=>{try{await dr().catch(()=>{});const e=await cr("Namen");f.namen=e.filter(n=>/\.(csv|txt)$/i.test(n.datei)).sort((n,r)=>n.datei===me?-1:r.datei===me?1:n.datei.localeCompare(r.datei,"de"))}catch{f.namen=[]}$()},_=async()=>{const e=Object.keys(Pn),n=await Promise.all(e.map(r=>at(r).catch(()=>[])));f.teile=Object.fromEntries(e.map((r,t)=>[r,n[t]])),$()},V=async()=>{if(w){f.local=await hr().catch(()=>null),f.geo=await gr().catch(()=>null),$();try{f.packs=await fr(),f.packsFehler=void 0}catch(e){f.packsFehler=Ne(e),f.packs??=null}$()}},De=async()=>{f.version=await mr().catch(()=>"?"),f.update=In(),f.basis=await pr().catch(e=>Ne(e)),$()};let we=0;const q=[],ye=()=>{q.push(b.onChange(()=>{we++,G()})),q.push(tr(()=>G())),q.push(rr(()=>G())),q.push(ir(()=>G())),q.push(ar(()=>{f.update=In(),G()}));const e=()=>G();Cn.add(e),q.push(()=>Cn.delete(e))};ue={bald:G,regionSchalten(e,n){w&&Yr(e,n).then(()=>un()).catch(r=>console.warn("Region",r)).finally(()=>void V())}};const Se=(e,n)=>async()=>{try{const r=await e();return typeof r=="string"?r:void 0}finally{try{await n?.()}catch{}$()}},d=(e,n,r={},t)=>({l:e,...r,act:Se(n,t)}),v=(e,n,r,t)=>({l:e,datei:{accept:n,f:l=>Se(()=>r(l[0]),t)()}});async function L(e,n,r){if(x[e])throw new Error("Läuft schon");x[e]=n,G();try{return await r(t=>{x[e]=t,ue?.bald()})}finally{delete x[e],ue?.bald()}}function R(e){const n=b.settings.funkgruppe??"NÖ-03";return[...Dr.map(r=>e.C(r.id+(r.id===n?" (deine)":""),"fgc_"+r.id,yr[r.id],r.bezirke,["fgo_"+r.id,!0])),e.B("",[d("Standardfarben",()=>(hn({funkFarben:{},funkGruppen:{}}),"Zurückgesetzt"),{cfm:"Alle Funkgruppen wieder einblenden und die Standardfarben verwenden?"})])]}function C(e){return[...b.settings.status.map((n,r)=>e.C(`${n.nummer} – ${n.name}`,"sf_st"+(r+1),Nr(n.key),En(n.key))),e.B("",[d("Farben der Leitstelle verwenden",()=>(hn({statusFarben:{}}),"Zurückgesetzt"),{cfm:"Eigene Statusfarben verwerfen?"})])]}const D={notruf:"te_notruf",kt:"te_kt",anklopfen:"te_anklopfen",funk:"te_funk",funkDringend:"te_funkD",chat:"te_chat",warnung:"te_warn"};function ce(e){return Object.entries(cn).map(([n,r])=>e.TON(r,D[n],Hr[jr[n].slice(8)]?.name??""))}function A(e){const n=[],r=f.dateien;if(!r)n.push(e.I("Eigene Dateien",I,"",m));else if(!r.length)n.push(e.I("Eigene Dateien","noch keine","Unten hochladen – danach unter „Töne je Ereignis“ auswählbar",m));else{const s=jn().sounds;for(const a of r){const u=Object.keys(cn).filter(c=>s[c]?.quelle===`datei:${a.id}`).map(c=>`„${cn[c]}“`);n.push(e.IT(a.name,`${oe(a.sek)} s · ${Math.max(1,Math.round(a.bytes/1e3))} KB${u.length?` · für ${u.join(", ")}`:""}`,"","",{btns:[d("▶",()=>(je("chat",`datei:${a.id}`,70),"▶ läuft")),d("Löschen",async()=>{await Jr(a.id);const c={...jn().sounds};for(const[o,h]of Object.entries(c))h.quelle===`datei:${a.id}`&&delete c[o];return hn({sounds:c}),"Gelöscht"},{cfm:`„${a.name}“ löschen? Ereignisse, die ihn nutzen, bekommen wieder den Standardton.`},te)]}))}}const t=s=>async a=>{const u=await Di(a,s);return gn("Töne",a.name,await a.arrayBuffer()),`„${u.name}“ gespeichert (${oe(u.sek)} s)`},l=".mp3,.wav,audio/mpeg,audio/wav";n.push(e.B("Hochladen",[v("Klingelton …",l,t("klingel"),te),v("Kurzer Ton …",l,t("kurz"),te)],`Klingelton bis ${Jn.klingel.maxSek} s, kurzer Ton bis ${Jn.kurz.maxSek} s · MP3, WAV`));const i=(r??[]).reduce((s,a)=>s+a.bytes,0);return n.push(e.I("Belegt",r?`${oe(i/1e6,2)} MB`:"…","",m)),n}const y=e=>!!f.ki?.modelle.some(n=>n===e||n.startsWith(e)),O=[{role:"system",content:"Du spielst eine echte Person, die beim Notruf 144 in Niederösterreich anruft: Dein Vater (78) ist im Garten von der Leiter gefallen und blutet am Kopf, er ist wach, aber ganz blass. Du bist aufgeregt. Sag nur, was du ins Telefon sprichst: kurz, umgangssprachlich österreichisch, keine Listen."},{role:"user",content:"Leitstelle: Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?"},{role:"assistant",content:"Gartengasse 4 in Gföhl, bitte schnell!"},{role:"user",content:"Leitstelle: Was ist denn passiert?"}];async function ie(){if(!w)throw new Error("Die lokale KI gibt es nur im Programm");const e=await Le();if(f.ki=e,!e.installiert)throw new Error("Ollama ist nicht installiert");if(!e.laeuft)throw new Error("Ollama läuft nicht – erst starten");const n=Be().modell;if(!y(n))throw new Error(`Modell ${n} ist nicht geladen (Sprachmodelle → Laden)`);const r=performance.now();let t=0;return{antwort:await Fi(O,()=>{t||(t=performance.now())}),s1:((t||performance.now())-r)/1e3,s2:(performance.now()-r)/1e3}}const H=async()=>{if(!on())throw new Error("Noch kein Schlüssel – unter „Einrichten“ einfügen");return`Gemini antwortet: ${await Un()}`};function Q(e){const n="Läuft auf deinem PC – ohne Internet, ohne Konto";if(!w)return e.B("Lokale KI (Ollama)",[],n,{chip:M,dot:m});if(x.ollama)return e.B("Lokale KI (Ollama)",[],n,{chip:x.ollama,dot:ee});const r=f.ki;return r===void 0?e.B("Lokale KI (Ollama)",[],n,{chip:I,dot:m}):r===null?e.B("Lokale KI (Ollama)",[d("Prüfen",()=>{},{},W)],n,{chip:"Status unbekannt",dot:T}):r.installiert?r.laeuft?e.B("Lokale KI (Ollama)",[d("Beenden",async()=>(await Zr(),"Beendet"),{},W)],n,{chip:"installiert · läuft",dot:E}):e.B("Lokale KI (Ollama)",[d("Starten",async()=>{await Vr();for(let t=0;t<10;t++){if((await Le()).laeuft)return"Läuft";await Ue(1e3)}throw new Error("Ollama startet nicht")},{},W)],n,{chip:`installiert${r.version?` (${r.version})`:""} · läuft nicht`,dot:T}):e.B("Lokale KI (Ollama)",[d("Installieren",()=>L("ollama","wird heruntergeladen …",async t=>{const l=await Xr(i=>t(i.total?`${i.text||"lädt"} ${be(i.done,i.total)}`:i.text||"läuft …"));for(let i=0;i<20&&(await Ue(1500),!(await Le()).laeuft);i++);return l||"Installiert"}),{},W)],n,{chip:"nicht installiert",dot:m})}const Y="https://aistudio.google.com/apikey";function he(e){return[e.B("1. Schlüssel holen",[d("Seite von Google öffnen",async()=>{if(!w)return window.open(Y,"_blank","noopener"),"Im Browser geöffnet";try{return await navigator.clipboard.writeText(Y),"Adresse kopiert – im Browser einfügen: aistudio.google.com/apikey"}catch{return"Im Browser öffnen: aistudio.google.com/apikey"}})],"Mit deinem Google-Konto anmelden, „API-Schlüssel erstellen“, kopieren"),e.F("2. Schlüssel einfügen","gkey","Schlüssel einfügen …",ln()?"✓ geprüft – Gemini ist bereit":on()?"Noch nicht geprüft":"",{pw:!0,btns:[d("Prüfen",async()=>{if(Qr().schluessel.trim().length<20)throw new Error("Das sieht nicht nach einem Schlüssel aus – bitte ganz kopieren");return`Schlüssel gültig – ${await Un()}`})]}),e.B("3. Ausprobieren",[d("Testanruf mit Gemini",H)])]}async function ze(e){const n=await Le();if(f.ki=n,!n.laeuft)throw new Error("Ollama läuft nicht – erst unter „Telefon, Funk & KI“ starten");return await L(`ki:${e}`,"Download startet …",r=>qr(e,t=>r(t.total?`wird geladen … ${be(t.done,t.total)}`:t.text||"wird geladen …"))),`${e} geladen`}function j(e){const n=[];if(!w)return n.push(e.I("Dieser Rechner",M,"Die lokale KI gibt es nur im installierten Programm",m)),n;const r=f.ram??0,t=r?Hn(r):null;n.push(e.I("Dieser Rechner",f.ram===void 0?I:r?`${r} GB Arbeitsspeicher${t?` · empfohlen: ${Pe[t]}`:""}`:"Arbeitsspeicher unbekannt","Größere Modelle sprechen natürlicher, brauchen aber mehr Speicher und antworten langsamer",ee));const l=f.ki;l&&!l.laeuft&&n.push(e.I("Ollama",l.installiert?"läuft nicht":"nicht installiert","Laden und Löschen geht nur, wenn Ollama läuft (Telefon, Funk & KI)",T));const i=Be().modell,s=(a,u,c,o)=>{const h=y(a),g=i===a,k=x[`ki:${a}`],S=k??(g&&h?"aktiv":g?"gewählt · nicht geladen":h?"geladen":r&&o>r?"zu groß":""),P=k?ee:g&&h?E:g?T:h?m:S?T:"",B=[];if(l===void 0){n.push(e.IT(u,c,I,m));return}if(!k){if(h&&!g&&B.push(d("Verwenden",()=>(dn({modell:a}),"Wird verwendet"),{},W)),!h){const N=r>0&&o>r;B.push(d(N?"Trotzdem laden":"Laden",()=>ze(a),N?{cfm:`${a} braucht etwa ${o} GB, dieser Rechner hat ${r} GB. Es kann sein, dass Ollama sehr langsam wird oder das Modell gar nicht lädt. Kaputt geht nichts – du kannst es wieder löschen. Trotzdem laden?`}:{},W)),g||B.push(d("Verwenden",()=>(dn({modell:a}),"Gewählt – noch laden"),{},W))}h&&B.push(d("Löschen",async()=>(await Gr(a),"Gelöscht"),{cfm:`${a} löschen?${g?" Es ist gerade aktiv – danach antwortet die KI einfacher.":""} Du kannst es jederzeit wieder laden.`},W))}n.push(e.IT(u,c,S,P,{btns:B}))};for(const a of Me)s(a.name,`${Pe[a.stufe]} · ${a.name}`,`${oe(a.gb)} GB · ab ${a.ram} GB Arbeitsspeicher · ${a.info}${a.stufe===t?" · empfohlen":""}`,a.ram);for(const a of l?.modelle??[])Me.some(u=>a===u.name||a.startsWith(u.name))||s(a,`Eigenes · ${a}`,"aus der Ollama-Bibliothek",0);return i&&!Me.some(a=>a.name===i)&&!(l?.modelle??[]).some(a=>a===i||a.startsWith(i))&&s(i,`Eigenes · ${i}`,"aus der Ollama-Bibliothek",0),n.push(e.F("Anderes Modell","omod","z. B. llama3.1:8b","Name aus der Ollama-Bibliothek – wird geladen und verwendet",{btns:[d("Laden",async()=>{const a=String(bn.omod??"").trim();if(!a)throw new Error("Bitte einen Modellnamen eingeben");return await ze(a),dn({modell:a}),`${a} geladen und verwendet`},{},W)]})),n}function Z(e){if(!w)return[e.I("Stimmen (Piper)",M,"Piper-Stimmen gibt es nur im installierten Programm – im Browser liest der Computer vor",m)];const n=f.piper;return Er.map(r=>{const t=r.label.match(/^(.*?)\s*\((.*)\)$/),l=t?t[1]:r.label,i=t?t[2]:r.g==="w"?"Frau":"Mann",s=x[`piper:${r.name}`],a=!!n?.includes(r.name),u=[];return n&&!s&&(a?(u.push(d("▶",()=>(Je(r.g,r.name),"▶ Probe"))),u.push(d("Löschen",async()=>(await ei(r.name),"Gelöscht"),{cfm:`Stimme „${l}“ löschen?`},se))):u.push(d("Laden",async()=>(await L(`piper:${r.name}`,"startet …",c=>ni(r.name,(o,h,g)=>c(g?"wird entpackt …":h?`wird geladen … ${be(o,h)}`:`${Math.round(o/1e6)} MB`))),J().stimmeArt!=="piper"&&He({stimmeArt:"piper"}),`Stimme „${l}“ ist bereit`),{},se))),e.IT(l,`${i} · ${r.mb} MB`,s??(n===void 0?I:a?"geladen":""),s?ee:a?E:"",{btns:u})})}function ge(e){if(!w)return[e.I("Erkennung (Whisper)",M,"Die Spracherkennung auf dem Rechner gibt es nur im installierten Programm",m)];const n=f.whisper,r=J().modell;return Oe.map(t=>{const l=t.label.split(/\s+–\s+/),i=l[0],s=l.slice(1).join(" – "),a=x[`wh:${t.name}`],u=!!n?.includes(t.name),c=u&&r===t.name,o=[];n&&!a&&(u&&!c&&o.push(d("Verwenden",()=>(He({modell:t.name}),"Wird verwendet"))),u||o.push(d("Laden",async()=>(await L(`wh:${t.name}`,"startet …",g=>qn(t.name,(k,S)=>g(S?`wird geladen … ${be(k,S)}`:`${Math.round(k/1e6)} MB`))),He({modell:t.name}),`„${i}“ ist bereit und wird verwendet`),{},re)),u&&o.push(d("Löschen",async()=>(await ti(t.name),"Gelöscht"),{cfm:`Modell „${i}“ löschen?${c?" Es wird gerade verwendet.":""}`},re)));const h=t.mb>=1e3?`${oe(t.mb/1e3)} GB`:`${t.mb} MB`;return e.IT(i,`${h}${s?` · ${s}`:""}`,a??(n===void 0?I:c?"aktiv":u?"geladen":""),a?ee:c?E:u?m:"",{btns:o})})}const Fe=e=>{const n=Math.round(Math.max(0,Math.min(1,e))*10);return`${"▮".repeat(n)}${"▯".repeat(10-n)}`};async function Ce(e){const n=`pegel:${e}`;return L(n,"Jetzt sprechen …",async r=>{const t=await nt(4,{welches:e,pegel:l=>r(`${Fe(l)}  sprich jetzt …`)});if(!t.startsWith("⚠"))return e==="telefon"&&$e({mikro:J().mikro}),t;throw new Error(t.replace(/^⚠\s*/,""))})}const Ie=(e,n)=>{const r=x[`pegel:${n}`];return r?[e.I("Pegel",r,"Die Balken sollen beim Sprechen deutlich ausschlagen",ee)]:[]},wn=()=>(je("notruf",void 0,70),setTimeout(()=>Je("w"),1800),"▶ Klingeln, dann eine Stimme – hörst du beides?"),ot=()=>{if(!J().funkVorlesen)throw new Error("„Funk vorlesen“ ist aus (Telefon, Funk & KI)");return yi("Test","Hier 75 1, Test, kommen.",1),"▶ Funkspruch – kommt er aus dem richtigen Gerät?"},ut=()=>new Promise((e,n)=>{const r=J(),t={[r.taste]:"Telefon",[r.funkTaste]:"Funk"},l=()=>{window.removeEventListener("keydown",s,!0),window.removeEventListener("mousedown",a,!0),clearTimeout(u)},i=c=>t[c]?(l(),$e({tasten:!0}),e(`✓ ${t[c]}-Sprechtaste (${fn(c)}) erkannt`),!0):!1,s=c=>{i(c.code)&&c.preventDefault()},a=c=>void i(`Mouse${c.button}`),u=window.setTimeout(()=>{l(),n(new Error(`Keine Sprechtaste gedrückt – Telefon: ${fn(r.taste)}, Funk: ${fn(r.funkTaste)}`))},8e3);window.addEventListener("keydown",s,!0),window.addEventListener("mousedown",a,!0)});async function dt(){return L("probeanruf","Es klingelt …",async e=>{if(je("notruf",void 0,70),await Ue(2500),e("Der Anrufer spricht …"),Je("w"),await Ue(5500),!J().eingabe)return $e({probe:!0}),"Gehört? Die Spracheingabe ist aus – im Spiel tippst du deine Fragen";e("Jetzt antworten: 4 Sekunden sprechen, z. B. „Wo genau ist der Notfallort?“");const n=await nt(4,{welches:"telefon",pegel:r=>e(`${Fe(r)}  sprich jetzt …`)});if(n.startsWith("⚠"))throw new Error(n.replace(/^⚠\s*/,""));return $e({probe:!0,mikro:J().mikro}),`${n} – so kommt es im Spiel an`})}const fe=(e,n="offen")=>e===null?{chip:"nicht nötig",dot:m}:e?{chip:"✓ erledigt",dot:E}:{chip:n,dot:T},ct=()=>Ke()==="gemini"?ln():!Be().aktiv||!w?null:!!f.ki?.laeuft&&y(Be().modell),ht=()=>!J().eingabe||!w?null:!!f.whisper?.includes(J().modell);function gt(e){const n=J(),r=Lr(),t=ht(),l=n.eingabe?Br():null,i=n.eingabe?Kr():null,s=ct(),a=$r(),u=[r,t,l,i,s,a],c=u.filter(h=>h!==!1).length,o=[e.I("So weit bist du",`${c} von ${u.length} Schritten`,"Geh die Schritte von oben nach unten durch. Dauert etwa 5 Minuten. Alles lässt sich später ändern.",c===u.length?E:T),e.H("Schritt 1 · Hören"),e.S("Wie hörst und sprichst du?","auArt",["Headset (Kopfhörer mit Mikrofon)","Lautsprecher und Mikrofon","Telefon und Funk auf getrennten Geräten"],"Headset (Kopfhörer mit Mikrofon)","Ein Headset ist am besten: Du hörst die Anrufer gut, und sie hören sich nicht selbst"),e.L("Kopfhörer bzw. Lautsprecher","sdev",["Wie das System"],"Wie das System","Hier kommen die Anrufer, der Funk und die Töne heraus"),e.B("Probeton",[d("▶ Abspielen",wn),d("Ich habe beides gehört",()=>($e({hoeren:J().geraetStimmen}),"✓ Gemerkt"))],"Zuerst klingelt es, dann spricht eine Stimme. Nichts gehört? Oben ein anderes Gerät wählen und noch einmal",fe(r,"noch nicht gehört")),e.H("Schritt 2 · Sprechen statt tippen"),e.T("Mit der Stimme sprechen","eingabe",!0,"Du sprichst mit Anrufern und Fahrzeugen. Aus: Du tippst alles")];if(n.eingabe){const h=Oe.find(S=>/ausgewogen/i.test(S.label))??Oe[0],g=x[`wh:${h.name}`],k=w&&t===!1&&!g?[d(`Laden (${h.mb} MB)`,async()=>(await L(`wh:${h.name}`,"startet …",S=>qn(h.name,(P,B)=>S(B?`wird geladen … ${be(P,B)}`:`${Math.round(P/1e6)} MB`))),He({modell:h.name}),"Spracherkennung ist bereit"),{},re)]:[];k.push({l:"Andere Größe …",sub:"whisper"}),o.push(e.B("Spracherkennung",k,"Damit LeitWerk versteht, was du sagst. Läuft nur auf deinem PC, ohne Internet",g?{chip:g,dot:ee}:t===null?{chip:M,dot:m}:fe(t,"noch nicht geladen"))),o.push(e.H("Schritt 3 · Mikrofon")),Rn()==="getrennt"?o.push(e.L("Mikrofon fürs Telefon","mic",["Wie das System"],"Wie das System")):o.push(e.L("Mikrofon","mic",["Wie das System"],"Wie das System","Beim Headset: das Mikrofon des Headsets")),o.push(e.B("Mikrofon testen",[d("Testen – 4 Sekunden sprechen",()=>Ce("telefon"))],"Klicken und z. B. sagen: „Notruf 144, wo genau ist der Notfallort?“ – danach steht da, was verstanden wurde",fe(l,"noch nicht getestet"))),o.push(...Ie(e,"telefon")),o.push(e.H("Schritt 4 · Sprechtasten")),o.push(e.K("Sprechtaste fürs Telefon (gedrückt halten)","kSprech","F9","Solange du sie hältst, hört dich der Anrufer")),o.push(e.K("Sprechtaste für den Funk (gedrückt halten)","kFunk","F10","Solange du sie hältst, sendest du im Funk")),o.push(e.B("Ausprobieren",[d("Jetzt eine Sprechtaste drücken",ut)],"Klicken, dann innerhalb von 8 Sekunden eine der beiden Tasten drücken",fe(i,"noch nicht probiert")))}else o.push(e.I("Mikrofon und Sprechtasten","nicht nötig","Die Spracheingabe ist aus – du tippst deine Fragen und Funksprüche",m));return o.push(e.H("Schritt 5 · Wer spielt die Anrufer?")),o.push(e.S("Anrufer-KI","kimodus",["Gemini (Cloud)","Lokal (Ollama)"],"Lokal (Ollama)","Gemini: am natürlichsten, braucht Internet und einen kostenlosen Schlüssel. Lokal: läuft auf deinem PC, braucht einen kräftigen Rechner")),o.push(e.B("Einrichten",Ke()==="gemini"?[{l:"Gemini-Schlüssel …",sub:"gemini"}]:[{l:"Lokale KI …",sub:"modelle"}],Ke()==="gemini"?"Schlüssel holen und einfügen – Schritt für Schritt erklärt":"Ein Sprachmodell laden – LeitWerk schlägt die passende Größe für deinen PC vor",fe(s,"noch nicht bereit"))),o.push(e.H("Schritt 6 · Probeanruf")),o.push(e.B("Probeanruf",[d("Starten",dt)],n.eingabe?"Es klingelt, ein Anrufer spricht, dann antwortest du – so wie im Spiel":"Es klingelt und ein Anrufer spricht – so wie im Spiel",x.probeanruf?{chip:x.probeanruf,dot:ee}:fe(a,"noch nicht gemacht"))),o.push(e.B("Mehr einstellen",[{l:"Kopfhörer & Mikrofon",go:["platz","audio"]},{l:"Telefon, Funk & KI",go:["platz","gespraech"]}],"Lautstärken, Funk, Stimmen und alles Weitere")),o}function ft(e){const n=Rn(),r=n==="getrennt",t=[e.S("Wie hörst und sprichst du?","auArt",["Headset (Kopfhörer mit Mikrofon)","Lautsprecher und Mikrofon","Telefon und Funk auf getrennten Geräten"],"Headset (Kopfhörer mit Mikrofon)","Ein Headset ist am besten. Bei Lautsprechern nicht „Freisprechen“ verwenden – sonst hört sich der Anrufer selbst"),e.H("Hören")];return w||t.push(e.I("Geräte wählen",M,"Im Browser kommt alles aus dem Gerät, das am Computer eingestellt ist",m)),r?(t.push(e.L("Telefon: Anrufer","sdev",["Wie das System"],"Wie das System","Hier hörst du die Anrufer")),t.push(e.B("",[d("▶ Testen",()=>(Je("w"),"▶ Stimme"))])),t.push(e.L("Funk: Fahrzeuge","fdev",["Wie am Telefon"],"Wie am Telefon","Hier hörst du den Funk")),t.push(e.B("",[d("▶ Testen",ot)])),t.push(e.L("Töne (Klingeln, Funk-Piep)","tdev",["Wie das System"],"Wie das System","Z. B. Klingeln über die Lautsprecher, damit du es auch ohne Headset hörst")),t.push(e.B("",[d("▶ Testen",()=>(je("notruf",void 0,70),"▶ Klingeln"))])),t.push(e.T("Telefon links, Funk rechts","stereo",!1,"Im Headset: Anrufer nur im linken Ohr, Funk nur im rechten – wie in einer echten Leitstelle. Töne bleiben auf beiden Seiten"))):(t.push(e.L(n==="headset"?"Headset":"Lautsprecher","sdev",["Wie das System"],"Wie das System","Anrufer, Funk und Töne kommen alle hier heraus")),t.push(e.B("Probeton",[d("▶ Abspielen",wn)],"Zuerst klingelt es, dann spricht eine Stimme")),n==="headset"&&t.push(e.T("Telefon links, Funk rechts","stereo",!1,"Anrufer nur im linken Ohr, Funk nur im rechten – wie in einer echten Leitstelle. Töne bleiben auf beiden Seiten"))),t.push(e.H("Sprechen")),r?(t.push(e.L("Mikrofon fürs Telefon","mic",["Wie das System"],"Wie das System")),t.push(e.B("",[d("Testen – 4 Sekunden sprechen",()=>Ce("telefon"))])),t.push(...Ie(e,"telefon")),t.push(e.L("Mikrofon für den Funk","micFunk",["Wie am Telefon"],"Wie am Telefon")),t.push(e.B("",[d("Testen – 4 Sekunden sprechen",()=>Ce("funk"))])),t.push(...Ie(e,"funk"))):(t.push(e.L("Mikrofon","mic",["Wie das System"],"Wie das System",n==="headset"?"Das Mikrofon des Headsets":"Am besten ein Mikrofon nahe am Mund")),t.push(e.B("Mikrofon testen",[d("Testen – 4 Sekunden sprechen",()=>Ce("telefon"))],"Klicken und sprechen – danach steht da, was verstanden wurde")),t.push(...Ie(e,"telefon"))),t.push(e.H("Lautstärken")),t.push(e.R("Anrufer am Telefon","slaut",0,100,5,85,l=>`${l} %`)),t.push(e.R("Fahrzeuge im Funk","sfLautKi",0,150,5,100,l=>`${l} %`,"Fahrzeuge, die der Computer spricht")),t.push(e.R("Mitspieler im Funk","sfLaut",0,150,5,90,l=>`${l} %`,"Stimmen echter Spieler (Disponenten, Piloten)")),t.push(e.R("Andere Funkgruppen","fgLaut",0,100,5,60,l=>`${l} %`,"Gruppen, die du nur mithörst – dringende Rufe kommen immer voll")),t.push(e.L("Funk, während du telefonierst","fTel",["Normal","Leiser","Stumm"],"Leiser","Dringende Rufe bleiben hörbar")),t.push(e.R("Töne","tlaut",0,100,5,80,l=>`${l} %`,"Klingeln, Funk-Piep, Chat")),t.push(e.R("Deine Stimme im Funk","sfSende",0,200,5,100,l=>`${l} %`,"Wie laut dich die Mitspieler hören")),t.push(e.H("Tipps")),t.push(e.I("Bluetooth-Headset","","Viele Bluetooth-Headsets klingen schlecht, sobald das Mikrofon an ist. Ein Headset mit Kabel oder USB ist besser",m)),t.push(e.I("Nichts zu hören?","","Lautstärke am Computer prüfen und oben das richtige Gerät wählen. Neu angesteckte Geräte erscheinen nach dem Neustart von LeitWerk",m)),t}function mt(e){const n=J(),r=ln(),t=on(),l=Be().modell,i=Me.find(h=>h.name===l),s=f.ram?Hn(f.ram):null,a=`${i?`${Pe[i.stufe]}: `:""}${l}${f.ram?` · dein PC: ${f.ram} GB Arbeitsspeicher${s?`, passend: ${Pe[s]}`:""}`:""}`,u=w?f.ki===void 0?{chip:l,dot:m}:y(l)?{chip:"bereit",dot:E}:{chip:"noch nicht geladen",dot:T}:{chip:M,dot:m},c=f.piper?.length??0,o=Oe.find(h=>h.name===n.modell);return[e.H("Telefon"),e.T("Ich nehme Notrufe an","notrufe",!0,"Aus: Bei dir klingelt kein Notruf (z. B. wenn du nur den Funk machst)"),e.T("Ich nehme die KT-Hotline an","kthot",!0,"Bestellungen von Krankentransporten"),e.T("Ich nehme Überstellungen an","ueberst",!0,"Anrufe von Krankenhäusern, die einen Patienten verlegen"),e.T("Mit der Stimme sprechen","eingabe",!0,"Aus: Du tippst deine Fragen"),e.K("Sprechtaste fürs Telefon (gedrückt halten)","kSprech","F9","Solange du sie hältst, hört dich der Anrufer"),e.T("Erkannten Text gleich abschicken","autosend",!0,"Aus: Du kannst den Text vor dem Abschicken noch ändern"),e.T("Freisprechen (ohne Sprechtaste)","freispr",!1,"Der Anrufer hört dich, sobald du sprichst – nur mit Headset, sonst hört er sich selbst"),e.T("Anrufer vorlesen","vorl",!0,"Aus: Du liest nur mit, was der Anrufer sagt"),e.T("Telefonklang und Geräusche","klang",!0,"Der Anrufer klingt wie am Telefon, dazu Geräusche vom Notfallort"),e.T("Knopf „Gespräch exportieren“","gexp",!1,"Speichert ein Gespräch als Datei – zum Melden von Fehlern"),e.H("Funk"),e.K("Sprechtaste für den Funk (gedrückt halten)","kFunk","F10","Spricht in die Gruppe, die am Funkgerät gewählt ist"),e.K("Eigene Funktaste: normale Gruppe","kFunkN","–","Nur wenn du für jede Gruppe eine eigene Taste willst"),e.K("Eigene Funktaste: RD-NOE-09","kF09","–","Gruppe für Großeinsätze"),e.K("Eigene Funktaste: RD-NOE-10","kF10","–","Zweite Gruppe für Großeinsätze"),e.T("Funk vorlesen","fvorl",!0,"Aus: Du liest die Funksprüche nur mit"),e.T("Funk-Klang","fklang",!0,"Stimmen klingen blechern wie im echten Funk"),e.T("Echte Disponenten hören","echteD",!0,"Nur im Mehrspieler"),e.T("Echte Piloten hören","echteP",!0,"Nur im Mehrspieler"),e.T("Funkmeldungen manchmal unvollständig","unvoll",!0,"Wie im echten Leben: Manchmal fehlt etwas, dann fragst du nach"),e.T("Funk-Aufnahmen an Fehlerberichte anhängen","sfAufn",!1,"Die letzten 10 eigenen Funksprüche – hilft, die Spracherkennung zu verbessern"),e.H("KI – wer spricht Anrufer und Fahrzeuge?"),e.S("Anrufer-KI","kimodus",["Gemini (Cloud)","Lokal (Ollama)"],"Lokal (Ollama)","Gemini: am natürlichsten, braucht Internet. Lokal: läuft auf deinem PC. Fällt Gemini aus, springt die lokale KI ein"),e.B("Gemini",[{l:"Einrichten …",sub:"gemini"},d("Testen",H)],"Kostenloser Schlüssel von Google – bleibt nur auf deinem PC",r?{chip:"bereit",dot:E}:t?{chip:"Schlüssel nicht geprüft",dot:T}:{chip:"nicht eingerichtet",dot:m}),e.T("Gemini versteht den Funk","gfunk",!1,"Test: kennt alle Fahrzeuge, schreibt Rufnamen richtig"),e.T("Fahrzeuge sprechen mit Gemini","gfzg",!1,"Jedes Fahrzeug mit eigener Stimme (immer an, wenn Gemini die Anrufer spielt)"),Q(e),e.B("Lokale KI: Sprachmodell",[{l:"Wählen …",sub:"modelle"}],a,u),e.T("Lokale KI verwenden","lokal",!0,"Aus: Die Anrufer antworten mit vorbereiteten Sätzen"),e.T("Lokale KI beim Beenden schließen","olbeend",!0),e.T("Schnelles Gespräch (Test)","schnell",!1,"Anrufer fängt früher zu sprechen an"),e.B("Ausprobieren",[d("Testanruf",async()=>Ke()==="gemini"&&t?H():`Anrufer: „${(await ie()).antwort}“`),d("Wie schnell?",async()=>{if(Ke()==="gemini"&&t)return H();const{s1:h,s2:g}=await ie();return`${g<=5?"Flüssig – passt gut":g<=10?"Brauchbar":g<=18?"Eher langsam – ein kleineres Modell wäre flüssiger":"Zu langsam – bitte ein kleineres Modell"}: erste Wörter nach ${oe(h)} s, fertig nach ${oe(g)} s`},{},W)],"Ein kurzes Probegespräch ohne Spiel (das erste dauert länger)"),e.H("Stimmen und Spracherkennung"),e.B("Stimmen",[{l:"Wählen …",sub:"piper"}],"Je mehr Stimmen, desto abwechslungsreicher klingen Anrufer und Fahrzeuge (Piper, läuft auf deinem PC)",w?f.piper===void 0?{chip:I,dot:m}:c?{chip:`${c} geladen`,dot:E}:{chip:"Computerstimme",dot:T}:{chip:M,dot:m}),e.R("Sprechtempo","tempo",70,140,5,100,h=>`${h} %`),e.B("Spracherkennung",[{l:"Wählen …",sub:"whisper"}],"Versteht, was du sagst (Whisper, läuft auf deinem PC)",w?f.whisper===void 0?{chip:I,dot:m}:f.whisper.includes(n.modell)?{chip:o?o.label.split(/\s+–\s+/)[0]:"bereit",dot:E}:{chip:"noch nicht geladen",dot:T}:{chip:M,dot:m}),e.B("Alles in Ruhe einrichten",[{l:"Zum Einrichten",go:["platz","einrichten"]}],"Schritt für Schritt mit Probeanruf")]}let Ae=null;function pt(e){if(!Ae||Date.now()-Ae.um>5e3){const l=Ae?.ok;Tr().then(i=>{Ae={ok:i,um:Date.now()},i!==l&&z()})}const n=vr(),r=Ae?.ok,t=[e.H("Discord"),e.T("In Discord zeigen, dass ich LeitWerk spiele","discord",!0,"Freunde sehen „Spielt LeitWerk“ in deinem Profil und in der Mitgliederliste"),e.T("Details zeigen","discordDetails",!0,"Rolle, Funkgruppe, offene Einsätze und Spieltyp – nie Adressen, Namen oder Codes")];return n?r===void 0?t.push(e.I("Verbindung",I,"",m)):r?t.push(e.I("Verbindung","verbunden","Discord zeigt jetzt „Spielt LeitWerk“",E)):t.push(e.I("Verbindung","Discord läuft nicht",On()?"Discord (Programm, nicht im Browser) auf diesem Rechner starten – LeitWerk verbindet sich dann von selbst (spätestens nach 30 Sekunden)":"Nur im installierten Programm",T)):t.push(e.I("Verbindung","aus","Eingeschaltet erscheint es nach wenigen Sekunden",m)),t.push(e.I("Tipp","","Ganz ausschalten geht auch in Discord: Einstellungen › Aktivitätsprivatsphäre",m)),t}function kt(e){return[e.T("Klingelton bei Anrufen","klingel",!0),e.T("Funk-Piep, wenn ein Fahrzeug ruft","fpiep",!0),e.R("Lautstärke der Töne","tlaut",0,100,5,80,n=>`${n} %`),e.H("Welcher Ton wann?"),...ce(e),e.H("Eigene Tondateien"),...A(e)]}function bt(e){const n=[],r=zr();r.length||n.push(e.I("Gespeicherte Anordnungen","noch keine","Eigene Anordnungen speicherst du im Spiel unter „Anordnung“ – oder lädst sie unten aus einer Datei",m));for(const t of r)n.push(e.IT(t.name,t.fenster.length?`Hauptfenster + ${t.fenster.length} weitere${t.fenster.length>1?"":"s"} Fenster`:"Hauptfenster","","",{btns:[d("Übernehmen",async()=>ri()?(await ii(t),"Übernommen"):(localStorage.setItem(ai,JSON.stringify(t.haupt)),t.fenster.length?"Gilt beim nächsten Spielstart (ohne Nebenfenster)":"Gilt beim nächsten Spielstart")),d("Als Datei …",async()=>await pe(`leitwerk-anordnung-${t.name}.json`,JSON.stringify(t,null,1),{name:"Anordnung",extensions:["json"]})?"Gespeichert":"Abgebrochen"),d("Löschen",()=>(Ar(t.name),"Gelöscht"),{cfm:`„${t.name}“ löschen?`})]}));return n.push(e.B("Aus Datei",[v("Anordnung laden …",".json,application/json",async t=>{const l=await qe(t),i=si(l);return gn("Anordnungen",Ye(t.name,"json"),l),`„${i.name}“ übernommen`})],"Zum Beispiel von einem Freund")),n}const Xe=e=>e.name?.trim()||e.id;function wt(e){const n=an(!0).slice().sort((s,a)=>Xe(s).localeCompare(Xe(a),"de")),r=n.filter(s=>!sn(s.id)),t=s=>{const a=new Set(s.varianten.map(u=>Pr(u)));return a.size===1&&a.has("NA")?"ja":a.has("NA")?"teils":[...a].sort((u,c)=>Ge(c)-Ge(u))[0]==="RS"?"nein":`bis ${[...a].sort((u,c)=>Ge(c)-Ge(u))[0]}`},l=s=>`${sn(s.id)?Gn(s.id)?"eingebaut, geändert":"eingebaut":"eigener"}${Mr(s.id)?"":" · aus"}`,i=n.map(s=>s.id);return[e.TAB(["Fall","Art","Notarzt","Herkunft"],n.map(s=>[Xe(s),s.spezial?"besonderer Anruf":"Notfall",t(s),l(s)]),{suche:"Fälle durchsuchen …",neu:"Neuer Fall",anzahl:`${K(n.length)} Fälle · ${K(r.length)} eigene`,edit:!0,ding:"Fall",oeffnen:s=>Sr(i[s]),neuZiel:"neuerFall",hint:"Stift öffnet den Fall-Editor (Telefonat, Abfrage, Ausgänge, Krankenhaus)"}),e.B("Prüfen",[d("Alle Fälle prüfen",()=>{const s=an(!0),a=li(b.schema,s);if(!a.length)return`Alle ${K(s.length)} in Ordnung`;const u=new Set(a.map(o=>o.fall)),c=a[0];throw new Error(`${a.length} Problem${a.length===1?"":"e"} in ${u.size} Fäll${u.size===1?"":"en"} – z. B. ${c.fall}${c.variante?` (${c.variante})`:""}: ${c.fehler}`)})],"Telefonat, Verlauf, Krankenhaus stimmig?"),e.B("Import & Export",[v("Importieren …",".json,application/json",async s=>{const a=await qe(s),u=oi(a,!1);if(!u.neu&&!u.ersetzt)throw new Error(u.fehler[0]??"Keine Fälle in der Datei");return gn("Fälle",Ye(s.name,"json"),a),`${u.neu} neu, ${u.ersetzt} ersetzt${u.fehler.length?`, ${u.fehler.length} übersprungen (${u.fehler[0]})`:""}`}),d("Exportieren …",async()=>{const s=an(!0),a=s.filter(o=>!sn(o.id)||Gn(o.id)),u=(a.length?a:s).map(o=>o.id);return await pe(`leitwerk-faelle-${new Date().toISOString().slice(0,10)}.json`,ui(u),{name:"Fallpaket",extensions:["json"]})?`${u.length} ${a.length?"eigene/geänderte ":""}Fälle exportiert`:"Abgebrochen"})],"Fallpakete (JSON) – exportiert werden die eigenen und geänderten Fälle")]}function St(){const e=b.settings.stufen.map(n=>({...n}));for(const n of xr())e.some(r=>r.stufe===n)||e.push(Rr(n)??Or(n));return e}const zt=Object.keys(ve).map(e=>ve[e]),At=Mn.map(e=>rn[e]);function Sn(e){const n=structuredClone(b.settings);e(n),b.setSettings(n),Ii.call("neuPlanen").catch(()=>{})}function Et(e){const n=St(),r=l=>[l.stufe,l.rettungsmittel||"– (Weitergabe)",l.nfsErforderlich?"ja":"nein",ve[l.notarzt]??l.notarzt,l.sondersignal?"ja":"nein",rn[l.kategorie]??l.kategorie,`${l.transportProzent} %`],t=[e.T("Rendezvous RTW – NEF","rdv",!0,"NEF mehr als 15 min entfernt: RTW fährt los und trifft das NEF unterwegs"),e.N("Toleranz für besser passende Rettungsmittel","tol",5,"min"),e.H("Stufen-Zuordnung")];return ke.alarmierung&&t.push(e.I("Nicht gespeichert",ke.alarmierung,"",Ve)),t.push(e.TAB(["Stufe","Rettungsmittel","NFS","Notarzt","Signal","Kategorie","Transport"],n.map(r),{edit:!0,neu:"Neue Stufe",ding:"Stufe",typen:["text","text","tog",["sel",zt],"tog",["sel",At],"num"],hint:"„>“ trennt die Ränge, „/“ heißt gleichwertig. Ein schlechter passendes Rettungsmittel kommt nur, wenn das bessere mehr als die Toleranz länger braucht.",speichern:(l,i)=>We("alarmierung",()=>{const s=l>=0?n[l]:void 0,a=(i[0]??"").trim();if(!a)throw new Error("Bitte einen Namen für die Stufe eingeben");if(n.some(o=>o.stufe===a&&o!==s))throw new Error(`Die Stufe „${a}“ gibt es schon`);const u=(i[1]??"").trim(),c={stufe:a,rettungsmittel:/^–|weitergabe/i.test(u)||!u?"":u.toUpperCase().replace(/\s+/g,""),nfsErforderlich:i[2]==="ja",notarzt:Object.keys(ve).find(o=>ve[o]===i[3])??s?.notarzt??"nein",sondersignal:i[4]==="ja",kategorie:Mn.find(o=>rn[o]===i[5])??s?.kategorie??"dringend",transportProzent:Math.max(0,Math.min(100,Math.round(parseFloat(String(i[6]).replace(",","."))||0)))};Sn(o=>{const h=s?o.stufen.findIndex(g=>g.stufe===s.stufe):-1;h>=0?o.stufen[h]=c:o.stufen.push(c)})}),loeschen:l=>We("alarmierung",()=>{const i=n[l];if(!i)return;const s=di().stufen.find(a=>a.stufe===i.stufe);Sn(a=>{s?a.stufen=a.stufen.map(u=>u.stufe===i.stufe?{...s}:u):a.stufen=a.stufen.filter(u=>u.stufe!==i.stufe)})})})),t}async function We(e,n){try{await n(),delete ke[e]}catch(r){ke[e]=Ne(r),console.warn("Hauptmenü speichern",r)}$()}const Tt={stations:"ds",vehicles:"fz",hospitals:"kh",pois:"poi",templates:"ev",codes:"code"},_e=e=>`${e.lat.toFixed(5)}, ${e.lon.toFixed(5)}`;async function xe(e,n,r){const t=e.trim();if(n&&t===(r??"").trim())return{lat:n.lat,lon:n.lon};if(!t)throw new Error("Bitte die Lage angeben (Breite, Länge oder eine Adresse)");const l=t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)??t.match(/^(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)$/);if(l){let s=Number(l[1].replace(",",".")),a=Number(l[2].replace(",","."));const u=o=>o>=44&&o<=52,c=o=>o>=7&&o<=21;if(!u(s)&&u(a)&&c(s)&&([s,a]=[a,s]),!u(s)||!c(a))throw new Error(`Koordinate ${t} liegt außerhalb des Kartengebiets`);return{lat:s,lon:a}}const i=(await _i(t,1).catch(()=>[]))[0];if(!i)throw new Error(`„${t}“ nicht gefunden – bitte Koordinaten angeben (Breite, Länge)`);return{lat:i.lat,lon:i.lon}}const zn=new Map;function vt(e,n,r){const t=it(bn[`tq_${r}`]??"").trim(),l=zn.get(e);if(l&&l.stand===we&&l.q===t)return l.d;const i=b.list(e);let s=i,a;if(i.length<=2e3)a=i.map(n);else{const c=[];a=[];for(const o of i){const h=n(o);if(!(t&&!it(h.join(" ")).includes(t))&&(c.push(o),a.push(h),c.length>=200))break}s=c}const u={recs:s,rows:a,gesamt:i.length};return zn.set(e,{stand:we,q:t,d:u}),u}const Lt=(e,n)=>e.recs.length<e.gesamt?`${K(e.gesamt)} ${n} · ${K(e.recs.length)} gezeigt – Suche zeigt mehr`:`${K(e.gesamt)} ${n}`;function Bt(e,n){return e.B("Import & Export",[{l:"CSV importieren …",imp:!0},d("Exportieren …",async()=>{const r=ci(n,b.list(n),b.list("stations"));return await pe(`leitwerk_${hi[n]}.csv`,r)?`${gi[n]} exportiert`:"Abgebrochen"})],"CSV-Dateien · erst prüfen, dann ergänzen oder ersetzen · Vorlage und Beispiel liegen in Dokumente/LeitWerk")}function Ee(e,n,r,t){const l=vt(r,t.zeile,n),i=[];return ke[n]&&i.push(e.I("Nicht gespeichert",ke[n],"",Ve)),i.push(e.TAB(t.cols,l.rows,{...t.x,edit:!0,anzahl:Lt(l,t.wort),speichern:(s,a)=>We(n,async()=>{const u=s>=0?l.recs[s]:void 0,c=await t.bauen(u,a.map(o=>String(o??"")),s>=0?l.rows[s]:void 0);b.upsert(r,c)}),loeschen:s=>We(n,()=>{const a=l.recs[s];a&&b.remove(r,a.id)})})),i.push(Bt(e,r)),i}const Te=(e,n,r)=>({id:e?.id??b.newId(Tt[n]),hinweis:r.trim(),herkunft:e?.herkunft==="import"?"import":"manuell",herkunftDetail:e?.herkunftDetail}),X=(e,n,r)=>!n||(e[r]??"")!==(n[r]??"");function Kt(e){const n=b.list("stations"),r=new Map(n.map(i=>[i.id,i.name])),t=i=>`${i.typ}${i.aufbau==="gross"&&i.typ!=="RTW-C"?" (groß)":""}`,l=i=>i.ersatzFuer?`nur bei Flugverbot (Ersatz für ${i.ersatzFuer})`:Wi(i.dienstplan);return Ee(e,"fahrzeuge","vehicles",{cols:["Funkrufname","Kurzname","Kategorie","Typ","Dienststelle","Dienstplan","Aktiv"],wort:"Fahrzeuge",zeile:i=>[i.funkrufname,i.kurzname,i.kategorie,t(i),r.get(i.dienststelleId)??"⚠ fehlt",l(i),i.aktiv?"ja":"nein",i.nachtflug?"ja":"nein",i.ersatzFuer??"",i.hinweis??""],x:{suche:"Fahrzeug suchen …",neu:"Neues Fahrzeug",ding:"Fahrzeug",typen:["text","text",["sel",[...Yn]],"text","text","plan","tog"],extra:[["Nachtflug","tog","nein"],["Ersatz für","text",""],["Hinweis","text",""]]},bauen:(i,s,a)=>{const u=s[0].trim();if(!u)throw new Error("Bitte einen Funkrufnamen eingeben");const c=Yn.includes(s[2])?s[2]:i?.kategorie??"RTW";let o=i?.dienststelleId??"";if(X(s,a,4)||!i){const N=s[4].trim().toLowerCase(),ae=n.filter(le=>le.name.trim().toLowerCase()===N);if(!ae.length)throw new Error(`Dienststelle „${s[4]}“ gibt es nicht`);if(ae.length>1&&!ae.some(le=>le.id===o))throw new Error(`Dienststelle „${s[4]}“ gibt es mehrmals – bitte im Spiel unter Daten zuordnen`);o=ae.some(le=>le.id===o)?o:ae[0].id}let h=s[3].replace(/\s*\(groß\)\s*$/,"").trim(),g=i?.aufbau;i&&!X(s,a,3)?h=i.kategorie===c?i.typ:c:X(s,a,3)&&(g=/\(groß\)\s*$/.test(s[3])?"gross":void 0),h||(h=c);let k=i?.dienstplan;if(!i||X(s,a,5)){const N=fi(s[5]);if(N.fehler)throw new Error(N.fehler);k=N.plan}const S={...i??{},...Te(i,"vehicles",s[9]??""),funkrufname:u,kurzname:s[1].trim(),kategorie:c,typ:h,dienststelleId:o,aktiv:s[6]==="ja",nachtflug:s[7]==="ja",dienstplan:k??[]};g?S.aufbau=g:delete S.aufbau;const P=(s[8]??"").trim();(P||i?.ersatzFuer!==void 0)&&(S.ersatzFuer=P);const B=[S];if(S.typ.toUpperCase()==="RTW-C"){S.typ="RTW-C",S.aufbau="gross";for(const N of b.list("vehicles"))N.id!==S.id&&N.dienststelleId===S.dienststelleId&&N.typ.trim().toUpperCase()==="RTW-C"&&B.push({...N,typ:"RTW",aufbau:"gross"})}return B}})}function $t(e){const n=new Map;for(const t of b.list("vehicles"))n.set(t.dienststelleId,(n.get(t.dienststelleId)??0)+1);const r=[...new Set([...wr,...b.list("stations").map(t=>t.typ).filter(Boolean)])];return Ee(e,"dienststellen","stations",{cols:["Name","Typ","Ort","Bezirk","Fahrzeuge"],wort:"Dienststellen",zeile:t=>[t.name,t.typ,t.ort,t.bezirk,String(n.get(t.id)??0),t.adresse??"",_e(t),t.hinweis??""],x:{suche:"Dienststelle suchen …",neu:"Neue Dienststelle",ding:"Dienststelle",typen:["text",["sel",r],"text","text","fix"],extra:[["Adresse","text",""],["Lage","lage",""],["Hinweis","text",""]]},bauen:async(t,l,i)=>{const s=l[0].trim();if(!s)throw new Error("Bitte einen Namen eingeben");const a=await xe(l[6]||(t?"":l[5]),t,i?.[6]);return[{...t??{},...Te(t,"stations",l[7]??""),name:s,typ:l[1]||"Rettungsdienst",organisation:t?.organisation??"",ort:l[2].trim(),bezirk:l[3].trim(),adresse:(l[5]??"").trim(),lat:a.lat,lon:a.lon}]}})}const Nt=new Map(er.flatMap(e=>[[e.name.toLowerCase(),e.id],[e.id.toLowerCase(),e.id]])),Dt=new Map(nr.flatMap(e=>[[e.name.toLowerCase(),e.id],[e.id.toLowerCase(),e.id]])),An=(e,n,r)=>e.split(/\s*[;,]\s*/).map(t=>t.trim()).filter(Boolean).map(t=>{const l=n.get(t.toLowerCase());if(!l)throw new Error(`${r} „${t}“ gibt es nicht`);return l});function yt(e){return Ee(e,"krankenhaeuser","hospitals",{cols:["Name","Kurzname","Ort"],wort:"Krankenhäuser",zeile:n=>[n.name,n.kurzname,n.ort,_e(n),ki(n.zufahrt),bi(n.landeplatz),(n.einrichtungen??[]).map(r=>wi(r)?.name??r).join(", "),(n.akutAus??[]).map(r=>Si(r)?.name??r).join(", "),"",n.hinweis??""],x:{suche:"Krankenhaus suchen …",neu:"Neues Krankenhaus",ding:"Krankenhaus",typen:["text","text","text"],extra:[["Lage","lage",""],["Rettungszufahrt","text",""],["Hubschrauberlandeplatz","text",""],["Einrichtungen","einr",""],["Akut-Bereiche aus","text",""],["Aufnahme bei Notfällen","khlink",""],["Hinweis","text",""]],hint:"„Akut-Bereiche aus“ mit Komma getrennt · Öffnungszeiten der Akut-Bereiche unter KH-Aufnahme"},bauen:async(n,r,t)=>{const l=r[0].trim();if(!l)throw new Error("Bitte einen Namen eingeben");const i=await xe(r[3],n,t?.[3]),s={...n??{},...Te(n,"hospitals",r[9]??""),name:l,kurzname:r[1].trim(),ort:r[2].trim(),lat:i.lat,lon:i.lon};if((!n||X(r,t,6))&&(s.einrichtungen=An(r[6],Nt,"Einrichtung")),(!n||X(r,t,7))&&(s.akutAus=An(r[7],Dt,"Akut-Abteilung")),!n||X(r,t,4)){const a=mi(r[4]);if(r[4].trim()&&!a)throw new Error("Zufahrt: bitte so angeben: einfahrt=48.41296,15.61544; p=48.41247,15.61458");s.zufahrt=a}if(!n||X(r,t,5)){const a=pi(r[5]);if(r[5].trim()&&!a)throw new Error("Landeplatz: bitte Koordinaten („48.41210,15.61480“) oder „kein“ angeben");s.landeplatz=a}return delete s.abteilungen,delete s.bereiche,[s]}})}function Ft(e){const n=r=>xi(r).map(Ri).join(", ");return Ee(e,"pois","pois",{cols:["Name","Kategorien","Ort"],wort:"Orte",zeile:r=>[r.name,n(r),r.ort,_e(r),r.hinweis??""],x:{suche:"Ort suchen …",neu:"Neuer Ort",ding:"Ort",typen:["text","text","text"],extra:[["Lage","lage",""],["Hinweis","text",""]],hint:"Kategorien mit Komma getrennt, z. B. „Pflegeheim, Schule“"},bauen:async(r,t,l)=>{const i=t[0].trim();if(!i)throw new Error("Bitte einen Namen eingeben");const s=await xe(t[3],r,l?.[3]);let a=r?.typ??"";if(!r||X(t,l,1)){const c=[],o=[];for(const h of t[1].split(/\s*[;,]\s*/).map(g=>g.trim()).filter(Boolean)){const g=zi.find(k=>!k.liste&&(k.key===h.toLowerCase()||k.label.toLowerCase()===h.toLowerCase()));g?c.push(g.key):o.push(h)}a=Ai(c,o.join(", "))}return[{...r??{},...Te(r,"pois",t[4]??""),name:i,typ:a,ort:t[2].trim(),lat:s.lat,lon:s.lon}]}})}const Ct=["nach Stufe","ja","nein"];function It(e){return Ee(e,"vorlagen","templates",{cols:["Code","Adresse","Meldung"],wort:"Vorlagen",zeile:n=>[n.code,n.adresse,n.meldung,_e(n),n.patientAlter==null?"":String(n.patientAlter),n.transport==null?"nach Stufe":n.transport?"ja":"nein",n.hinweis??""],x:{suche:"Vorlage suchen …",neu:"Neue Vorlage",ding:"Vorlage",typen:["text","text","text"],extra:[["Lage","lage",""],["Patient Alter","text",""],["Transport",["sel",Ct],"nach Stufe"],["Hinweis","text",""]]},bauen:async(n,r,t)=>{const l=r[0].trim();if(!l)throw new Error("Bitte einen Code eingeben");const i=await xe(r[3]||(n&&!X(r,t,1)?"":r[1]),n,t?.[3]),s=r[4].trim();if(s&&!Number.isFinite(Number(s)))throw new Error(`Alter „${s}“ ist keine Zahl`);return[{...n??{},...Te(n,"templates",r[6]??""),code:l,adresse:r[1].trim(),meldung:r[2].trim(),lat:i.lat,lon:i.lon,patientAlter:s===""?null:Number(s),transport:r[5]==="ja"?!0:r[5]==="nein"?!1:null}]}})}function Wt(e){const n=_n(),r=pn("notruf"),t=r?r.replace(/\.(json|csv|txt)$/i,""):null,l=b.schema?Object.keys(b.schema.kapitel).length:new Set(n.map(o=>o.gruppenname)).size,i=xn(),s=b.ktSatzRoh?b.ktSatzRoh.name||"Eigener Satz":null,a=t?`Eigene Datei: ${t}`:"LeitWerk-Codesystem (eingebaut)",u=s?`Eigene Datei: ${s}`:"LeitWerk-Transportcodes (eingebaut)",c=o=>o.gruppe?`${o.gruppe} - ${o.gruppenname}`:o.gruppenname;return[e.I("Notruf (RD)",a,`${K(n.length)} Codes in ${l} Kapiteln${b.schema?", mit Abfrage":""}`,n.length?E:T),e.I("Krankentransport & Überstellung (KT/SEK)",u,`${K(i.length)} Codes, mit KT-Abfrage`,i.length?E:T),e.B("Eigene Codes & Abfrage",[{l:"Notruf (RD)",go:["real","notruf"]},{l:"KT/SEK",go:["real","ktsek"]}],"Unter Eigene Dateien hochladen und umschalten – jeder Spieler selbst"),e.S("Codeliste","codeart",["Notruf (RD)","KT/SEK"],"Notruf (RD)"),e.TAB(["Code","Name","Kategorie","Kapitel"],n.map(o=>[o.code,o.beschreibung,o.stufe,c(o)]),{suche:"Code suchen …",anzahl:`${K(n.length)} Codes · ${t??"LeitWerk-Codesystem"}`,when:o=>o("codeart","Notruf (RD)")==="Notruf (RD)"}),e.TAB(["Code","Name","Kapitel","Art"],i.map(o=>[o.code,o.name,o.kapitel,o.gruppe]),{suche:"Code suchen …",anzahl:`${K(i.length)} Codes · ${s??"LeitWerk-Transportcodes"}`,when:o=>o("codeart","Notruf (RD)")==="KT/SEK"})]}const _t={alarmWache:"alarmiert auf der Wache",alarmFunk:"alarmiert über Funk"},En=e=>Pi[e]??_t[e]??e;function xt(e){return[e.H("Bedeutung · Nummer · Bezeichnung · Farbe · alarmierbar"),...b.settings.status.map((n,r)=>({t:"stat",label:En(n.key),key:"st"+(r+1),nr:n.nummer,nm:n.name,color:n.farbe,on:n.verfuegbar}))]}const Tn=e=>e.replace(/\.(json|csv|txt)$/i,""),Qe={notruf:"Eingebaut – LeitWerk-Codesystem",ktsek:"Eingebaut – LeitWerk-Transportcodes"},Rt={notruf:"Eine JSON-Datei mit Kapiteln, Fragen, Regeln und Codes – Aufbau wie die Beispieldatei",ktsek:"Eine JSON-Datei mit allen KT/SEK-Codes und ihren Bedingungen – Aufbau wie die Beispieldatei"},Ot={notruf:{datei:"Beispiel Notruf.json",hint:"Kleines, vollständiges Beispiel (3 Kapitel) – zeigt den Aufbau. Oben in der Datei steht eine Anleitung für eine KI.",text:()=>tt,ki:()=>{const e=JSON.parse(tt).anleitung_fuer_ki??"";return Array.isArray(e)?e.join(`
`):e}},ktsek:{datei:"Beispiel KT-SEK.json",hint:"Die eingebauten KT/SEK-Codes als Beispiel – vollständig, weil jede Kombination genau einen Code braucht. Oben in der Datei steht eine Anleitung für eine KI.",text:Fr,ki:()=>Ur().join(`
`)}},Pt=(e,n,r)=>`${e}

## Beispieldatei (${r})

\`\`\`
${n}
\`\`\`

## Mein Auftrag
Region: 
Worauf achten: 
`,vn=(e,n,r)=>d("KI-Anleitung kopieren",async()=>(await navigator.clipboard.writeText(Pt(e(),n(),r)),"Kopiert – in eine KI einfügen, unten Region und Wünsche ergänzen"));function Ln(e,n,r,t,l,i){const s=`ak_${n}_${mn[n]??0}`;lt[s]=c=>{c!==t&&(Ze[n]={t:"wird umgeschaltet …",dot:m},$(),l(c).then(o=>Ze[n]={t:o,dot:E}).catch(o=>Ze[n]={t:Ne(o),dot:Ve}).finally(()=>{mn[n]=(mn[n]??0)+1,Promise.all([_(),U()]).finally($)}))};const a=[e.L("Aktiv",s,r,t,i)],u=Ze[n];return u&&a.push(e.I("Rückmeldung",u.t,"",u.dot)),a}const Bn=(e,n)=>w?e.B("Ordner",[d("Ordner öffnen",()=>Xn(n))],`Dokumente/LeitWerk/${n}`):e.B("Ordner",[],`Dokumente/LeitWerk/${n}`,{chip:M,dot:m});function Kn(e,n){const r=Pn[n],t=f.teile?.[n],l=pn(n),i=[],s=(t??[]).filter(g=>!g.entwurf),a=s.map(g=>g.name),u=l?Tn(l):Qe[n],c=[Qe[n],...a];if(l&&!a.some(g=>g.toLowerCase()===u.toLowerCase())&&c.push(u),i.push(...Ln(e,n,c,u,async g=>{if(g===Qe[n])return kn(n,null);const k=s.find(S=>S.name===g);if(!k)throw new Error(`„${g}“ ist nicht mehr im Ordner – bitte neu hochladen`);return kn(n,k.datei)},"Gilt sofort · nur auf diesem Rechner · Liste = Dateien im Ordner")),n==="notruf"){const g=b.schemaRoh;i.push(e.I("Inhalt",g?`${K(Object.keys(g.kapitel).length)} Kapitel · ${K(Object.keys(g.codes??{}).length)} Codes`:`${K(_n().length)} Codes`,"Codes und Abfrage stecken in derselben Datei",E)),i.push(e.B("Zuordnung zu den LeitWerk-Merkmalen",[{l:"Zuordnung …",sub:"zuordnung"}],"Nur für eine eigene Datei: welche Frage welchem Merkmal entspricht – damit die Anrufer passend antworten"))}else i.push(e.I("Inhalt",`${K(xn().length)} Codes`,"Die Fragen der KT-Hotline sind immer die eingebauten",E)),i.push(e.B("KT-Code-Editor",[d("Editor öffnen",()=>(rt({fertig:()=>void _()}),"Im Editor geöffnet"))],"Codes und Bedingungen im Spiel bearbeiten – speichert als neue Datei; dort auch Entwürfe fertigstellen"));const o=Ot[n];i.push(e.H("Eigene Datei hinzufügen")),i.push(e.B("Datei hochladen",[v("Datei wählen …",".json,application/json",async g=>Ei(n,g.name,await qe(g)),_)],`${Rt[n]} · wird in den Ordner kopiert und gleich verwendet`));const h=[d("Beispieldatei herunterladen …",async()=>await pe(o.datei,o.text(),{name:"JSON-Datei",extensions:["json"]})?`Gespeichert: ${o.datei}`:"Abgebrochen")];n==="notruf"&&h.push(d("Eingebautes System herunterladen …",async()=>await pe("LeitWerk-Codesystem.json",Ti,{name:"JSON-Datei",extensions:["json"]})?"Gespeichert: LeitWerk-Codesystem.json":"Abgebrochen")),i.push(e.B("Beispieldatei",h,o.hint)),i.push(e.B("Mit einer KI erstellen",[vn(o.ki,o.text,"JSON")],"Kopiert die Anleitung samt Beispieldatei – in eine KI einfügen und nur noch Region und Wünsche dazuschreiben")),i.push(Bn(e,r.ordner)),i.push(e.H(`Dateien im Ordner ${r.ordner}`)),t?t.length||i.push(e.I("Dateien","noch keine eigene Datei","Mit „Datei hochladen“ hinzufügen oder direkt in den Ordner legen",m)):i.push(e.I("Dateien",I,"",m));for(const g of t??[]){const k=l?.toLowerCase()===g.datei.toLowerCase(),S=[];n==="ktsek"&&S.push(d("Bearbeiten",async()=>{const P=vi(await Zn(r.ordner,g.datei),g.datei);return rt({satz:{codes:P},name:g.name,fertig:()=>void _()}),"Im Editor geöffnet"})),S.push(d("Löschen",()=>Cr(n,g.datei),{cfm:`„${g.datei}“ wird aus Dokumente/LeitWerk/${r.ordner} gelöscht.`},_)),i.push(e.IT(g.name,`${g.entwurf?"ENTWURF – im KT-Code-Editor fertigstellen · ":""}${g.datei}`,k?"aktiv":g.entwurf?"Entwurf":"",k?E:g.entwurf?T:"",{btns:S}))}return i}function Mt(e){const n="Eingebaut – neutrale Namen",r=b.namen.length?b.namenDatei??"":null,t=f.namen??[],l=r===null?n:r||"eigene Namen",i=[n,...t.map(u=>u.datei)];r!==null&&!i.includes(l)&&i.push(l);const s=[...Ln(e,"namen",i,l,async u=>u===n?(b.setNamen(null),"Wieder neutrale Namen"):$n(u),"Gilt sofort · nur auf diesem Rechner · Liste = Dateien im Ordner"),e.I("Ersetzungen",r===null?"Rettungsdienst, Rettungswache, Krankentransport, Luftrettung, NAH 2 …":`${K(b.namen.length)} Ersetzungen aus „${r}“`,"Gilt für Dienststellen, Organisationen, Hubschrauber-Namen und Orte – auch für Krankentransport und Überstellungen",E),e.H("Eigene Datei hinzufügen")],a=v("Datei wählen …",".csv,.txt,text/csv,text/plain",async u=>{const c=await qe(u),o=Vn(c);if(!o.length)throw new Error("Keine Ersetzungen gefunden (Zeilen „neutral;eigen“, rechts ausgefüllt)");const h=Ye(u.name,"csv");return await st("Namen",h,c),b.setNamen(o,h),`${K(o.length)} Ersetzungen aktiv – „${h}“ in Dokumente/LeitWerk/Namen`},U);s.push(e.B("Datei hochladen",[a],"CSV „neutral;eigen“ – links der neutrale Name aus der Vorlage, rechts dein Name · wird in den Ordner kopiert und gleich verwendet")),s.push(e.B("Beispieldatei",[d("Beispieldatei herunterladen …",async()=>await pe(me,Qn(et()))?`Gespeichert: ${me}`:"Abgebrochen")],"Alle neutralen Namen: Organisationen, Hubschrauber, Stützpunkte für Krankentransport & Überstellung (KT/SEK), Dienststellen – rechts eintragen. Oben steht eine Anleitung für eine KI. Liegt auch im Ordner.")),s.push(e.B("Mit einer KI erstellen",[vn(()=>Li().join(`
`),()=>Qn(et()),"CSV")],"Kopiert die Anleitung samt Beispieldatei – in eine KI einfügen und nur noch die Region dazuschreiben")),s.push(Bn(e,"Namen")),s.push(e.B("Im Ordner geändert?",[d("Neu einlesen",()=>U().then(()=>r?$n(r):"Eingelesen"))],"Nach dem Bearbeiten einer Datei im Ordner")),s.push(e.H("Dateien im Ordner Namen")),f.namen||s.push(e.I("Dateien",I,"",m));for(const u of t){const c=r!==null&&r.toLowerCase()===u.datei.toLowerCase(),o=u.datei===me,h=o?[]:[d("Löschen",async()=>(await br("Namen",u.datei),c&&b.setNamen(null),"Gelöscht"),{cfm:`„${u.datei}“ wird aus Dokumente/LeitWerk/Namen gelöscht.`},U)];s.push(e.IT(Tn(u.datei),o?"Vorlage mit allen neutralen Namen – rechts eintragen, unter neuem Namen speichern":u.datei,c?"aktiv":"",c?E:"",{btns:h}))}return s}async function $n(e){const n=Vn(await Zn("Namen",e));if(!n.length)throw new Error(e===me?"Die Vorlage ist noch leer – rechts die eigenen Namen eintragen":"Keine Ersetzungen in der Datei (rechte Spalte leer?)");return b.setNamen(n,e),`${K(n.length)} Ersetzungen aktiv`}function Gt(e){if(!w)return[e.I("Kartenpakete",M,"Kartenpakete gibt es nur im installierten Programm",m),e.I("Satellitenbild","online, ohne Paket","",m)];const n=[],r=f.local,t=f.geo,l=r?.installed??{};if(n.push(e.I("Grundpaket & Straßen Niederösterreich",r===void 0?I:l[tn]&&l["bl-noe"]?"immer installiert":"fehlt – wird beim Start geladen","",r===void 0?m:l[tn]&&l["bl-noe"]?E:T)),t===void 0)n.push(e.I("Straßennetz und Adressen",I,"",m));else if(!t)n.push(e.I("Straßennetz und Adressen","Status unbekannt","",T));else{const h=(t.regionen??[]).map(g=>g==="alt"?"älteres Gesamtnetz":Wn[g]??g).join(", ");n.push(e.I("Straßennetz und Adressen",t.roads,[t.roads_nodes?`${K(t.roads_nodes)} Knoten`:"",t.address_count?`${K(t.address_count)} Adressen`:"",h?`Bundesländer: ${h}`:""].filter(Boolean).join(" · "),t.roads_nodes?E:T))}f.packsFehler&&n.push(e.I("Paketverzeichnis","nicht erreichbar",`${f.packsFehler} – Download derzeit nicht möglich`,T));const i=f.packs??[],s=[...new Set([...i.map(h=>h.id),...Object.keys(l)])].filter(h=>h!==tn&&h!=="bl-noe"),a=t?.regionen_aus??[],u=h=>{const g=i.find(en=>en.id===h),k=l[h],S=x[`pack:${h}`],P=!!(g&&k&&g.version!==k.version),B=h.startsWith("bl-")?h.slice(3):null,N=[];S||(g&&(!k||P)&&N.push(d(k?"Aktualisieren":"Laden",async()=>(await L(`pack:${h}`,"Wird geladen … 0 %",en=>Bi(h,Dn=>en(`Wird geladen … ${be(Dn.done,Dn.total)}`))),un(),`${g.name} installiert`),{},V)),k&&!(g?.pflicht??!1)&&N.push(d("Löschen",async()=>(await Ir(h),un(),"Gelöscht"),{cfm:`${g?.name??h} löschen?${B?` Ohne Paket gibt es keine Transporte nach ${Wn[B]??B}.`:""} Du kannst es jederzeit wieder laden.`},V)));const ae={btns:N};k&&B&&B!=="noe"&&(ae.tog=["kp_"+B,!a.includes(B)]);const le=[g?.beschreibung,g?Wr(_r(g)):""].filter(Boolean).join(" · ");return e.IT(g?.name??h,le,S??(P?"Update verfügbar":k?"installiert":""),S?ee:P?T:k?E:"",ae)},c=s.filter(h=>h.startsWith("bl-")),o=s.filter(h=>!h.startsWith("bl-"));return n.push(e.H("Straßen weiterer Bundesländer")),f.packs===void 0&&!c.length&&n.push(e.I("Paketverzeichnis",I,"",m)),n.push(...c.map(u)),n.push(e.H("Detailkarten und Gelände")),n.push(...o.map(u)),n.push(e.I("Satellitenbild","online, ohne Paket","",m)),r?.dir&&n.push(e.I("Speicherort",r.dir,"",m)),n}function Ht(e){const n=f.update,r=[e.I("Version",f.version===void 0?I:w?n?`${f.version} · Update auf ${n.version} verfügbar`:`${f.version} · aktuell`:`${f.version} · Entwicklung im Browser`,"",w?n?T:E:m)];if(!w)r.push(e.B("Updates",[],"",{chip:M,dot:m}));else{const t=[d("Jetzt suchen",async()=>{const l=await Ki();return f.update=l,l?`Version ${l.version} verfügbar`:"Auf dem neuesten Stand"})];n&&t.push(d("Installieren",()=>($i(n),"Wird installiert – LeitWerk startet danach neu"),{cfm:"Jetzt aktualisieren? LeitWerk startet danach neu – deine Daten und Einstellungen bleiben."})),r.push(e.B("Updates",t,n?.notes?n.notes.split(`
`)[0]:void 0))}r.push(e.H("Eigene Dateien & Spielstände")),r.push(e.I("Ordner",f.basis??"…","Alles, was du selbst dazugibst, liegt dort – je Art ein Ordner",m)),r.push(e.B("Spielstände",[{l:"Ansehen",tab:"fort"},...w?[d("Ordner öffnen",()=>Ni())]:[]],"Gespeicherte Schichten"));for(const[t,l]of Object.entries(kr))["Abfrageschema","Codelisten","Codelisten/RD","Abfrageschema/Krankentransport_Sekundärtransporte"].includes(t)||r.push(w?e.B(t.replace(/_/g," "),[d("Ordner öffnen",()=>Xn(t))],l):e.B(t.replace(/_/g," "),[],l,{chip:M,dot:m}));return r}const jt={fgfarben:R,statusfarben:C,einrichten:gt,discord:pt,audio:ft,gespraech:mt,toene:kt,gemini:he,modelle:j,piper:Z,whisper:ge,anordnungen:bt,faelle:wt,alarmierung:Et,fahrzeuge:Kt,dienststellen:$t,krankenhaeuser:yt,pois:Ft,vorlagen:It,codes:Wt,status:xt,notruf:e=>Kn(e,"notruf"),ktsek:e=>Kn(e,"ktsek"),namen:Mt,karten:Gt,programm:Ht},Jt=(e,n)=>{const r=jt[e];if(r)try{return r(n)}catch(t){return console.error("Hauptmenü-Zeilen",e,t),[n.I("Fehler",Ne(t),"Diese Seite konnte nicht aufgebaut werden",Ve)]}};let Nn=!1;return{zeilen:Jt,laden(){Nn||(Nn=!0,ye(),te(),W(),de(),se(),re(),_(),U(),V(),De())},beenden(){F=!0,ne&&clearTimeout(ne),q.splice(0).forEach(e=>e()),ue?.bald===G&&(ue=null)}}}export{Hi as feldWert,ji as zeilenQuelle};
