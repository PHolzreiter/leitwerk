import{k as Ht,h as mn,e as p,j as jt,m as qe,t as xe,n as rt,p as Jt,q as it,O as Zt,r as pn,s as Ut,u as Vt,v as yn,w as en,K as qt,x as Dn,N as Te,E as Yt,A as Xt,y as b,z as Qt,B as er,C as nr,D as tr,G as Fn,H as rr,J as Le,L as ir,M as ar,P as sr,Q as lr,U as or,V as me,W as ur,g as dr,X as cr,Y as hr,Z as Cn,_ as gr,$ as fr,a0 as nn,a1 as In,a2 as mr,a3 as Wn,a4 as _n,a5 as pr,a6 as tn,a7 as rn,a8 as an,a9 as kr,aa as br,ab as wr,ac as J,ad as Re,ae as Sr,af as Oe,ag as ve,ah as Pe,ai as sn,aj as ln,ak as xn,al as zr,am as Ar,an as Er,ao as Tr,ap as Be,aq as Lr,ar as vr,as as Br,at as Kr,au as Rn,av as $r,aw as Nr,ax as on,ay as yr,az as Dr,aA as Fr,aB as Cr,aC as Ir,aD as Wr,aE as On,aF as _r,aG as Me,aH as Pn,aI as xr,aJ as Mn,aK as un,aL as Rr,aM as dn,aN as Or,aO as Pr,aP as Gn,aQ as Mr,aR as cn,aS as Hn,aT as Gr,aU as Hr,aV as Ge,aW as jr,aX as jn,aY as Jn,aZ as Jr,a_ as Zr,a$ as He,b0 as Ur,b1 as Vr,b2 as Zn,b3 as je,b4 as qr,b5 as Yr,b6 as Un,b7 as Xr,b8 as Ke,b9 as Qr,ba as ei,bb as ni,bc as pe,bd as ti,be as hn,bf as ri,bg as ii,bh as ai,bi as si,bj as li,bk as oi,bl as ui,bm as Vn,bn as di,bo as ci,bp as hi,bq as gi,br as fi,bs as mi,bt as pi,bu as ki,bv as bi,bw as qn,bx as wi,by as Si,bz as zi,bA as Yn,bB as Xn,bC as Ai,bD as Ei,bE as Ti,bF as Li,bG as vi,bH as Bi,bI as Qn,bJ as gn,bK as Ki,bL as $i,bM as Ni,bN as yi,bO as Di,bP as Fi,bQ as Ci,bR as Ii}from"./index-T-euFroQ.js";const Wi={ok:"#4CC38A",grau:"#9AA3B5",gelb:"#FFC72C",blau:"#3B8BFF",rot:"#E5484D"},_i={freiWache:"frei auf der Wache",zumBO:"Anfahrt zum Einsatzort",amBO:"am Einsatzort",zumZO:"Transport zum Zielort",amZO:"am Zielort / Übergabe",freiFunk:"frei, unterwegs",dienstfahrt:"Dienstfahrt (alarmierbar)",bereitschaft:"Bereitschaft (alarmierbar)",alarmiert:"alarmiert, rückt aus",abgemeldet:"nicht im Dienst"},et=`{
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
`;function nt(z={}){const f=z.satz??Ht(),F={codes:structuredClone(f.codes??[])},ne=mn("ktsek"),$=z.name??(ne?ne.replace(/\.json$/i,""):null),G=p("div",{class:"kte"}),w=p("div",{class:"kte-kopf"}),te=p("input",{type:"text",name:"satzname",placeholder:"Name der Datei"});te.value=$??"Meine KT-SEK-Codes";const I=p("label",{class:"fld"});I.append(p("span",{class:"fld-label"},"Name der Datei"),te),w.appendChild(I);const de=p("div",{class:"kte-pruefung"}),se=p("div",{class:"mh-reiter"}),re=p("div",{class:"kte-inhalt"});G.append(w,de,se,re);let V="",W=null;const Z=()=>{const d=Ut({codes:F.codes},Vt());de.innerHTML="";const T=p("div",{class:`kte-status ${d.fehler.length?"fehler":"ok"}`});if(T.textContent=d.fehler.length?`${d.fehler.length} Problem${d.fehler.length===1?"":"e"} – so nur als Entwurf speicherbar`:`Alles vollständig: jede mögliche Kombination hat genau einen Code (${F.codes.length} Codes)`,de.appendChild(T),d.fehler.length||d.hinweise.length){const v=p("ul",{class:"kte-liste"});let R=0;d.fehler.forEach(C=>{const y=p("li",{class:"fehler"},C),ce=C.startsWith("Kein Code für")?d.fehlend[R++]:void 0;if(ce){const A=p("button",{class:"btn small",type:"button"},"Code anlegen");A.addEventListener("click",()=>Ne(ce)),y.appendChild(A)}v.appendChild(y)});for(const C of d.hinweise)v.appendChild(p("li",{class:"hinweis"},C));de.appendChild(v)}return Se?.setActionEnabled(2,d.fehler.length===0),d},Ne=(d={})=>{F.codes.unshift({code:"",name:"",kapitel:"",bed:{...d}}),W=0,V="",q()};function we(){const d=p("div",{class:"kte-leiste"}),T=p("input",{type:"search",placeholder:"Codes durchsuchen …",class:"kte-suche"});T.value=V,T.addEventListener("input",()=>{V=T.value,C()});const v=p("button",{class:"btn small primary",type:"button"},"+ Neuer Code");v.addEventListener("click",()=>Ne()),d.append(T,v);const R=p("div",{class:"kte-codes"});re.append(d,R);const C=()=>{R.innerHTML="";const A=V.trim().toLowerCase();F.codes.forEach((D,O)=>{A&&!`${D.code} ${D.name} ${yn(D.bed)}`.toLowerCase().includes(A)&&W!==O||R.appendChild(O===W?ce(D):y(D,O))}),R.childElementCount||R.appendChild(p("p",{class:"muted"},"Keine Codes gefunden."))},y=(A,D)=>{const O=p("div",{class:"kte-zeile"});O.innerHTML=`<b class="kte-code">${en(A.code||"(ohne Namen)")}</b><span class="kte-name">${en(A.name)}</span><span class="muted small kte-bed">${en(yn(A.bed))}</span>`;const ie=p("div",{class:"row-btns"}),H=p("button",{class:"btn small",type:"button",title:"Bearbeiten"},"✎");H.addEventListener("click",()=>{W=D,C()});const Q=p("button",{class:"btn small",type:"button",title:"Kopieren"},"⧉");Q.addEventListener("click",()=>{F.codes.splice(D+1,0,{...structuredClone(A),code:`${A.code}-Kopie`}),W=D+1,Z(),C()});const Y=p("button",{class:"btn small danger-text",type:"button",title:"Löschen"},"✕");return Y.addEventListener("click",()=>{F.codes.splice(D,1),W=null,Z(),C()}),ie.append(H,Q,Y),O.appendChild(ie),O},ce=(A,D)=>{const O=p("div",{class:"kte-form"}),ie=p("div",{class:"form-grid"}),H=(j,U)=>{const ge=p("label",{class:"fld"});ge.append(p("span",{class:"fld-label"},j),U),ie.appendChild(ge)},Q=p("input",{type:"text",name:"code",placeholder:"z. B. KTR-90T3"});Q.value=A.code,Q.addEventListener("input",()=>{A.code=Q.value.trim(),Z()});const Y=p("input",{type:"text",name:"name",placeholder:"Bezeichnung"});Y.value=A.name,Y.addEventListener("input",()=>A.name=Y.value);const he=p("input",{type:"text",name:"kapitel",placeholder:"Gruppe in der Auswahl (optional)"});he.value=A.kapitel??"",he.addEventListener("input",()=>A.kapitel=he.value),H("Code *",Q),H("Bezeichnung",Y),H("Gruppe",he);for(const j of qt){const U=p("select",{name:`bed-${j}`});U.appendChild(p("option",{value:""},j==="fahrt"?"– bitte wählen –":"beliebig"));for(const[ge,De]of Object.entries(Dn[j].werte))U.appendChild(p("option",{value:ge},De));U.value=A.bed[j]??"",U.addEventListener("change",()=>{U.value?A.bed[j]=U.value:delete A.bed[j],Z()}),H(Dn[j].label+(j==="fahrt"?" *":""),U)}O.appendChild(ie);const ze=p("button",{class:"btn small primary",type:"button"},"Fertig");return ze.addEventListener("click",()=>{W=null,C()}),O.appendChild(ze),O};C()}function q(){se.innerHTML="",se.appendChild(p("p",{class:"muted small"},`${F.codes.length} Codes · die Fragen der KT-Hotline sind die eingebauten`)),re.innerHTML="",we(),Z()}const ye=async d=>{const T=qe(te.value.trim()||"Meine KT-SEK-Codes");if(/^LeitWerk/i.test(T))return xe("Bitte einen eigenen Namen wählen – die eingebauten Codes bleiben unverändert","error"),!1;const v=Z();if(!d&&v.fehler.length)return!1;const R=(await rt("ktsek")).find(y=>y.name.toLowerCase()===T.toLowerCase());if(R&&R.name.toLowerCase()!==($??"").toLowerCase()&&!await Jt("Datei ersetzen?",`Es gibt schon eine Datei „${R.name}“.`,"Ersetzen"))return!1;const C=d?{entwurf:!0}:{};return await it(Zt.kt.codes,`${T}.json`,JSON.stringify({...C,codes:F.codes.filter(y=>y.code||y.name)})),d?xe(`Entwurf „${T}“ gespeichert – ${v.fehler.length} Problem${v.fehler.length===1?"":"e"} offen`):await pn("ktsek",`${T}.json`).then(y=>xe(y)).catch(y=>xe(String(y.message??y),"error")),z.fertig?.(),!0},Se=jt({title:"KT/SEK-Codes bearbeiten",body:G,wide:!0,actions:[{label:"Abbrechen"},{label:"Als Entwurf speichern",onClick:()=>ye(!0)},{label:"Speichern & verwenden",kind:"primary",onClick:()=>ye(!1)}]});Se.root.parentElement?.classList.add("kte-dlg"),q()}const{ok:E,grau:m,gelb:L,blau:ee,rot:Je}=Wi,M="nur im Programm",_="wird geprüft …",x={},kn={},at={},fn={},Ze={},ke={};let ue=null;function Oi(z,f){if(kn[z]=f,z.startsWith("ak_"))return void at[z]?.(String(f??""));const F=z.match(/^kp_(.+)$/);F?ue?.regionSchalten(F[1],!!f):z.startsWith("tq_")&&ue?.bald()}const K=z=>z.toLocaleString("de-DE"),oe=(z,f=1)=>z.toFixed(f).replace(".",","),be=(z,f)=>`${Math.min(100,Math.round(z/Math.max(1,f)*100))} %`,$e=z=>String(z?.message??z),tt=z=>String(z??"").toLowerCase().replace(/ä/g,"a").replace(/ö/g,"o").replace(/ü/g,"u").replace(/ß/g,"ss"),Ue=z=>new Promise(f=>setTimeout(f,z));async function Ve(z){return Ni(await z.arrayBuffer())}function Pi(z){const f={};let F=!1,ne=0;const $=()=>{F||z()},G=()=>{ne||F||(ne=window.setTimeout(()=>{ne=0,$()},200))},w=Kr(),te=async()=>{f.dateien=(await rr().catch(()=>[])).filter(e=>e.art!=="alarm"),$()},I=async()=>{w&&(f.ki=await Le().catch(()=>null),$())},de=async()=>{w&&(f.ram=await ir().catch(()=>0),$())},se=async()=>{w&&(f.piper=await ar().catch(()=>[]),$())},re=async()=>{w&&(f.whisper=(await sr().catch(()=>({modelle:[],ordner:""}))).modelle,$())},V=async()=>{try{await lr().catch(()=>{});const e=await or("Namen");f.namen=e.filter(n=>/\.(csv|txt)$/i.test(n.datei)).sort((n,r)=>n.datei===me?-1:r.datei===me?1:n.datei.localeCompare(r.datei,"de"))}catch{f.namen=[]}$()},W=async()=>{const e=Object.keys(Rn),n=await Promise.all(e.map(r=>rt(r).catch(()=>[])));f.teile=Object.fromEntries(e.map((r,t)=>[r,n[t]])),$()},Z=async()=>{if(w){f.local=await ur().catch(()=>null),f.geo=await dr().catch(()=>null),$();try{f.packs=await cr(),f.packsFehler=void 0}catch(e){f.packsFehler=$e(e),f.packs??=null}$()}},Ne=async()=>{f.version=await hr().catch(()=>"?"),f.update=Cn(),f.basis=await gr().catch(e=>$e(e)),$()};let we=0;const q=[],ye=()=>{q.push(b.onChange(()=>{we++,G()})),q.push(Qt(()=>G())),q.push(er(()=>G())),q.push(nr(()=>G())),q.push(tr(()=>{f.update=Cn(),G()}));const e=()=>G();Fn.add(e),q.push(()=>Fn.delete(e))};ue={bald:G,regionSchalten(e,n){w&&Zr(e,n).then(()=>on()).catch(r=>console.warn("Region",r)).finally(()=>void Z())}};const Se=(e,n)=>async()=>{try{const r=await e();return typeof r=="string"?r:void 0}finally{try{await n?.()}catch{}$()}},d=(e,n,r={},t)=>({l:e,...r,act:Se(n,t)}),T=(e,n,r,t)=>({l:e,datei:{accept:n,f:l=>Se(()=>r(l[0]),t)()}});async function v(e,n,r){if(x[e])throw new Error("Läuft schon");x[e]=n,G();try{return await r(t=>{x[e]=t,ue?.bald()})}finally{delete x[e],ue?.bald()}}function R(e){const n=b.settings.funkgruppe??"NÖ-03";return[...vr.map(r=>e.C(r.id+(r.id===n?" (deine)":""),"fgc_"+r.id,Br[r.id],r.bezirke,["fgo_"+r.id,!0])),e.B("",[d("Standardfarben",()=>(cn({funkFarben:{},funkGruppen:{}}),"Zurückgesetzt"),{cfm:"Alle Funkgruppen wieder einblenden und die Standardfarben verwenden?"})])]}function C(e){return[...b.settings.status.map((n,r)=>e.C(`${n.nummer} – ${n.name}`,"sf_st"+(r+1),Lr(n.key),An(n.key))),e.B("",[d("Farben der Leitstelle verwenden",()=>(cn({statusFarben:{}}),"Zurückgesetzt"),{cfm:"Eigene Statusfarben verwerfen?"})])]}const y={notruf:"te_notruf",kt:"te_kt",anklopfen:"te_anklopfen",funk:"te_funk",funkDringend:"te_funkD",chat:"te_chat",warnung:"te_warn"};function ce(e){return Object.entries(dn).map(([n,r])=>e.TON(r,y[n],Or[Pr[n].slice(8)]?.name??""))}function A(e){const n=[],r=f.dateien;if(!r)n.push(e.I("Eigene Dateien",_,"",m));else if(!r.length)n.push(e.I("Eigene Dateien","noch keine","Unten hochladen – danach unter „Töne je Ereignis“ auswählbar",m));else{const s=Gn().sounds;for(const i of r){const u=Object.keys(dn).filter(c=>s[c]?.quelle===`datei:${i.id}`).map(c=>`„${dn[c]}“`);n.push(e.IT(i.name,`${oe(i.sek)} s · ${Math.max(1,Math.round(i.bytes/1e3))} KB${u.length?` · für ${u.join(", ")}`:""}`,"","",{btns:[d("▶",()=>(He("chat",`datei:${i.id}`,70),"▶ läuft")),d("Löschen",async()=>{await Mr(i.id);const c={...Gn().sounds};for(const[o,h]of Object.entries(c))h.quelle===`datei:${i.id}`&&delete c[o];return cn({sounds:c}),"Gelöscht"},{cfm:`„${i.name}“ löschen? Ereignisse, die ihn nutzen, bekommen wieder den Standardton.`},te)]}))}}const t=s=>async i=>{const u=await Bi(i,s);return hn("Töne",i.name,await i.arrayBuffer()),`„${u.name}“ gespeichert (${oe(u.sek)} s)`},l=".mp3,.wav,audio/mpeg,audio/wav";n.push(e.B("Hochladen",[T("Klingelton …",l,t("klingel"),te),T("Kurzer Ton …",l,t("kurz"),te)],`Klingelton bis ${Hn.klingel.maxSek} s, kurzer Ton bis ${Hn.kurz.maxSek} s · MP3, WAV`));const a=(r??[]).reduce((s,i)=>s+i.bytes,0);return n.push(e.I("Belegt",r?`${oe(a/1e6,2)} MB`:"…","",m)),n}const D=e=>!!f.ki?.modelle.some(n=>n===e||n.startsWith(e)),O=[{role:"system",content:"Du spielst eine echte Person, die beim Notruf 144 in Niederösterreich anruft: Dein Vater (78) ist im Garten von der Leiter gefallen und blutet am Kopf, er ist wach, aber ganz blass. Du bist aufgeregt. Sag nur, was du ins Telefon sprichst: kurz, umgangssprachlich österreichisch, keine Listen."},{role:"user",content:"Leitstelle: Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?"},{role:"assistant",content:"Gartengasse 4 in Gföhl, bitte schnell!"},{role:"user",content:"Leitstelle: Was ist denn passiert?"}];async function ie(){if(!w)throw new Error("Die lokale KI gibt es nur im Programm");const e=await Le();if(f.ki=e,!e.installiert)throw new Error("Ollama ist nicht installiert");if(!e.laeuft)throw new Error("Ollama läuft nicht – erst starten");const n=ve().modell;if(!D(n))throw new Error(`Modell ${n} ist nicht geladen (Sprachmodelle → Laden)`);const r=performance.now();let t=0;return{antwort:await $i(O,()=>{t||(t=performance.now())}),s1:((t||performance.now())-r)/1e3,s2:(performance.now()-r)/1e3}}const H=async()=>{if(!ln())throw new Error("Noch kein Schlüssel – unter „Einrichten“ einfügen");return`Gemini antwortet: ${await Zn()}`};function Q(e){const n="Läuft auf deinem PC – ohne Internet, ohne Konto";if(!w)return e.B("Lokale KI (Ollama)",[],n,{chip:M,dot:m});if(x.ollama)return e.B("Lokale KI (Ollama)",[],n,{chip:x.ollama,dot:ee});const r=f.ki;return r===void 0?e.B("Lokale KI (Ollama)",[],n,{chip:_,dot:m}):r===null?e.B("Lokale KI (Ollama)",[d("Prüfen",()=>{},{},I)],n,{chip:"Status unbekannt",dot:L}):r.installiert?r.laeuft?e.B("Lokale KI (Ollama)",[d("Beenden",async()=>(await Hr(),"Beendet"),{},I)],n,{chip:"installiert · läuft",dot:E}):e.B("Lokale KI (Ollama)",[d("Starten",async()=>{await Gr();for(let t=0;t<10;t++){if((await Le()).laeuft)return"Läuft";await Ue(1e3)}throw new Error("Ollama startet nicht")},{},I)],n,{chip:`installiert${r.version?` (${r.version})`:""} · läuft nicht`,dot:L}):e.B("Lokale KI (Ollama)",[d("Installieren",()=>v("ollama","wird heruntergeladen …",async t=>{const l=await Ur(a=>t(a.total?`${a.text||"lädt"} ${be(a.done,a.total)}`:a.text||"läuft …"));for(let a=0;a<20&&(await Ue(1500),!(await Le()).laeuft);a++);return l||"Installiert"}),{},I)],n,{chip:"nicht installiert",dot:m})}const Y="https://aistudio.google.com/apikey";function he(e){return[e.B("1. Schlüssel holen",[d("Seite von Google öffnen",async()=>{if(!w)return window.open(Y,"_blank","noopener"),"Im Browser geöffnet";try{return await navigator.clipboard.writeText(Y),"Adresse kopiert – im Browser einfügen: aistudio.google.com/apikey"}catch{return"Im Browser öffnen: aistudio.google.com/apikey"}})],"Mit deinem Google-Konto anmelden, „API-Schlüssel erstellen“, kopieren"),e.F("2. Schlüssel einfügen","gkey","Schlüssel einfügen …",sn()?"✓ geprüft – Gemini ist bereit":ln()?"Noch nicht geprüft":"",{pw:!0,btns:[d("Prüfen",async()=>{if(Vr().schluessel.trim().length<20)throw new Error("Das sieht nicht nach einem Schlüssel aus – bitte ganz kopieren");return`Schlüssel gültig – ${await Zn()}`})]}),e.B("3. Ausprobieren",[d("Testanruf mit Gemini",H)])]}async function ze(e){const n=await Le();if(f.ki=n,!n.laeuft)throw new Error("Ollama läuft nicht – erst unter „Telefon, Funk & KI“ starten");return await v(`ki:${e}`,"Download startet …",r=>Jr(e,t=>r(t.total?`wird geladen … ${be(t.done,t.total)}`:t.text||"wird geladen …"))),`${e} geladen`}function j(e){const n=[];if(!w)return n.push(e.I("Dieser Rechner",M,"Die lokale KI gibt es nur im installierten Programm",m)),n;const r=f.ram??0,t=r?Mn(r):null;n.push(e.I("Dieser Rechner",f.ram===void 0?_:r?`${r} GB Arbeitsspeicher${t?` · empfohlen: ${Oe[t]}`:""}`:"Arbeitsspeicher unbekannt","Größere Modelle sprechen natürlicher, brauchen aber mehr Speicher und antworten langsamer",ee));const l=f.ki;l&&!l.laeuft&&n.push(e.I("Ollama",l.installiert?"läuft nicht":"nicht installiert","Laden und Löschen geht nur, wenn Ollama läuft (Telefon, Funk & KI)",L));const a=ve().modell,s=(i,u,c,o)=>{const h=D(i),g=a===i,k=x[`ki:${i}`],S=k??(g&&h?"aktiv":g?"gewählt · nicht geladen":h?"geladen":r&&o>r?"zu groß":""),P=k?ee:g&&h?E:g?L:h?m:S?L:"",B=[];if(l===void 0){n.push(e.IT(u,c,_,m));return}if(!k){if(h&&!g&&B.push(d("Verwenden",()=>(un({modell:i}),"Wird verwendet"),{},I)),!h){const N=r>0&&o>r;B.push(d(N?"Trotzdem laden":"Laden",()=>ze(i),N?{cfm:`${i} braucht etwa ${o} GB, dieser Rechner hat ${r} GB. Es kann sein, dass Ollama sehr langsam wird oder das Modell gar nicht lädt. Kaputt geht nichts – du kannst es wieder löschen. Trotzdem laden?`}:{},I)),g||B.push(d("Verwenden",()=>(un({modell:i}),"Gewählt – noch laden"),{},I))}h&&B.push(d("Löschen",async()=>(await Rr(i),"Gelöscht"),{cfm:`${i} löschen?${g?" Es ist gerade aktiv – danach antwortet die KI einfacher.":""} Du kannst es jederzeit wieder laden.`},I))}n.push(e.IT(u,c,S,P,{btns:B}))};for(const i of Pe)s(i.name,`${Oe[i.stufe]} · ${i.name}`,`${oe(i.gb)} GB · ab ${i.ram} GB Arbeitsspeicher · ${i.info}${i.stufe===t?" · empfohlen":""}`,i.ram);for(const i of l?.modelle??[])Pe.some(u=>i===u.name||i.startsWith(u.name))||s(i,`Eigenes · ${i}`,"aus der Ollama-Bibliothek",0);return a&&!Pe.some(i=>i.name===a)&&!(l?.modelle??[]).some(i=>i===a||i.startsWith(a))&&s(a,`Eigenes · ${a}`,"aus der Ollama-Bibliothek",0),n.push(e.F("Anderes Modell","omod","z. B. llama3.1:8b","Name aus der Ollama-Bibliothek – wird geladen und verwendet",{btns:[d("Laden",async()=>{const i=String(kn.omod??"").trim();if(!i)throw new Error("Bitte einen Modellnamen eingeben");return await ze(i),un({modell:i}),`${i} geladen und verwendet`},{},I)]})),n}function U(e){if(!w)return[e.I("Stimmen (Piper)",M,"Piper-Stimmen gibt es nur im installierten Programm – im Browser liest der Computer vor",m)];const n=f.piper;return Sr.map(r=>{const t=r.label.match(/^(.*?)\s*\((.*)\)$/),l=t?t[1]:r.label,a=t?t[2]:r.g==="w"?"Frau":"Mann",s=x[`piper:${r.name}`],i=!!n?.includes(r.name),u=[];return n&&!s&&(i?(u.push(d("▶",()=>(je(r.g,r.name),"▶ Probe"))),u.push(d("Löschen",async()=>(await qr(r.name),"Gelöscht"),{cfm:`Stimme „${l}“ löschen?`},se))):u.push(d("Laden",async()=>(await v(`piper:${r.name}`,"startet …",c=>Yr(r.name,(o,h,g)=>c(g?"wird entpackt …":h?`wird geladen … ${be(o,h)}`:`${Math.round(o/1e6)} MB`))),J().stimmeArt!=="piper"&&Ge({stimmeArt:"piper"}),`Stimme „${l}“ ist bereit`),{},se))),e.IT(l,`${a} · ${r.mb} MB`,s??(n===void 0?_:i?"geladen":""),s?ee:i?E:"",{btns:u})})}function ge(e){if(!w)return[e.I("Erkennung (Whisper)",M,"Die Spracherkennung auf dem Rechner gibt es nur im installierten Programm",m)];const n=f.whisper,r=J().modell;return Re.map(t=>{const l=t.label.split(/\s+–\s+/),a=l[0],s=l.slice(1).join(" – "),i=x[`wh:${t.name}`],u=!!n?.includes(t.name),c=u&&r===t.name,o=[];n&&!i&&(u&&!c&&o.push(d("Verwenden",()=>(Ge({modell:t.name}),"Wird verwendet"))),u||o.push(d("Laden",async()=>(await v(`wh:${t.name}`,"startet …",g=>Un(t.name,(k,S)=>g(S?`wird geladen … ${be(k,S)}`:`${Math.round(k/1e6)} MB`))),Ge({modell:t.name}),`„${a}“ ist bereit und wird verwendet`),{},re)),u&&o.push(d("Löschen",async()=>(await Xr(t.name),"Gelöscht"),{cfm:`Modell „${a}“ löschen?${c?" Es wird gerade verwendet.":""}`},re)));const h=t.mb>=1e3?`${oe(t.mb/1e3)} GB`:`${t.mb} MB`;return e.IT(a,`${h}${s?` · ${s}`:""}`,i??(n===void 0?_:c?"aktiv":u?"geladen":""),i?ee:c?E:u?m:"",{btns:o})})}const De=e=>{const n=Math.round(Math.max(0,Math.min(1,e))*10);return`${"▮".repeat(n)}${"▯".repeat(10-n)}`};async function Fe(e){const n=`pegel:${e}`;return v(n,"Jetzt sprechen …",async r=>{const t=await Qn(4,{welches:e,pegel:l=>r(`${De(l)}  sprich jetzt …`)});if(!t.startsWith("⚠"))return e==="telefon"&&Ke({mikro:J().mikro}),t;throw new Error(t.replace(/^⚠\s*/,""))})}const Ce=(e,n)=>{const r=x[`pegel:${n}`];return r?[e.I("Pegel",r,"Die Balken sollen beim Sprechen deutlich ausschlagen",ee)]:[]},bn=()=>(He("notruf",void 0,70),setTimeout(()=>je("w"),1800),"▶ Klingeln, dann eine Stimme – hörst du beides?"),st=()=>{if(!J().funkVorlesen)throw new Error("„Funk vorlesen“ ist aus (Telefon, Funk & KI)");return Ki("Test","Hier 75 1, Test, kommen.",1),"▶ Funkspruch – kommt er aus dem richtigen Gerät?"},lt=()=>new Promise((e,n)=>{const r=J(),t={[r.taste]:"Telefon",[r.funkTaste]:"Funk"},l=()=>{window.removeEventListener("keydown",s,!0),window.removeEventListener("mousedown",i,!0),clearTimeout(u)},a=c=>t[c]?(l(),Ke({tasten:!0}),e(`✓ ${t[c]}-Sprechtaste (${gn(c)}) erkannt`),!0):!1,s=c=>{a(c.code)&&c.preventDefault()},i=c=>void a(`Mouse${c.button}`),u=window.setTimeout(()=>{l(),n(new Error(`Keine Sprechtaste gedrückt – Telefon: ${gn(r.taste)}, Funk: ${gn(r.funkTaste)}`))},8e3);window.addEventListener("keydown",s,!0),window.addEventListener("mousedown",i,!0)});async function ot(){return v("probeanruf","Es klingelt …",async e=>{if(He("notruf",void 0,70),await Ue(2500),e("Der Anrufer spricht …"),je("w"),await Ue(5500),!J().eingabe)return Ke({probe:!0}),"Gehört? Die Spracheingabe ist aus – im Spiel tippst du deine Fragen";e("Jetzt antworten: 4 Sekunden sprechen, z. B. „Wo genau ist der Notfallort?“");const n=await Qn(4,{welches:"telefon",pegel:r=>e(`${De(r)}  sprich jetzt …`)});if(n.startsWith("⚠"))throw new Error(n.replace(/^⚠\s*/,""));return Ke({probe:!0,mikro:J().mikro}),`${n} – so kommt es im Spiel an`})}const fe=(e,n="offen")=>e===null?{chip:"nicht nötig",dot:m}:e?{chip:"✓ erledigt",dot:E}:{chip:n,dot:L},ut=()=>Be()==="gemini"?sn():!ve().aktiv||!w?null:!!f.ki?.laeuft&&D(ve().modell),dt=()=>!J().eingabe||!w?null:!!f.whisper?.includes(J().modell);function ct(e){const n=J(),r=zr(),t=dt(),l=n.eingabe?Ar():null,a=n.eingabe?Er():null,s=ut(),i=Tr(),u=[r,t,l,a,s,i],c=u.filter(h=>h!==!1).length,o=[e.I("So weit bist du",`${c} von ${u.length} Schritten`,"Geh die Schritte von oben nach unten durch. Dauert etwa 5 Minuten. Alles lässt sich später ändern.",c===u.length?E:L),e.H("Schritt 1 · Hören"),e.S("Wie hörst und sprichst du?","auArt",["Headset (Kopfhörer mit Mikrofon)","Lautsprecher und Mikrofon","Telefon und Funk auf getrennten Geräten"],"Headset (Kopfhörer mit Mikrofon)","Ein Headset ist am besten: Du hörst die Anrufer gut, und sie hören sich nicht selbst"),e.L("Kopfhörer bzw. Lautsprecher","sdev",["Wie das System"],"Wie das System","Hier kommen die Anrufer, der Funk und die Töne heraus"),e.B("Probeton",[d("▶ Abspielen",bn),d("Ich habe beides gehört",()=>(Ke({hoeren:J().geraetStimmen}),"✓ Gemerkt"))],"Zuerst klingelt es, dann spricht eine Stimme. Nichts gehört? Oben ein anderes Gerät wählen und noch einmal",fe(r,"noch nicht gehört")),e.H("Schritt 2 · Sprechen statt tippen"),e.T("Mit der Stimme sprechen","eingabe",!0,"Du sprichst mit Anrufern und Fahrzeugen. Aus: Du tippst alles")];if(n.eingabe){const h=Re.find(S=>/ausgewogen/i.test(S.label))??Re[0],g=x[`wh:${h.name}`],k=w&&t===!1&&!g?[d(`Laden (${h.mb} MB)`,async()=>(await v(`wh:${h.name}`,"startet …",S=>Un(h.name,(P,B)=>S(B?`wird geladen … ${be(P,B)}`:`${Math.round(P/1e6)} MB`))),Ge({modell:h.name}),"Spracherkennung ist bereit"),{},re)]:[];k.push({l:"Andere Größe …",sub:"whisper"}),o.push(e.B("Spracherkennung",k,"Damit LeitWerk versteht, was du sagst. Läuft nur auf deinem PC, ohne Internet",g?{chip:g,dot:ee}:t===null?{chip:M,dot:m}:fe(t,"noch nicht geladen"))),o.push(e.H("Schritt 3 · Mikrofon")),xn()==="getrennt"?o.push(e.L("Mikrofon fürs Telefon","mic",["Wie das System"],"Wie das System")):o.push(e.L("Mikrofon","mic",["Wie das System"],"Wie das System","Beim Headset: das Mikrofon des Headsets")),o.push(e.B("Mikrofon testen",[d("Testen – 4 Sekunden sprechen",()=>Fe("telefon"))],"Klicken und z. B. sagen: „Notruf 144, wo genau ist der Notfallort?“ – danach steht da, was verstanden wurde",fe(l,"noch nicht getestet"))),o.push(...Ce(e,"telefon")),o.push(e.H("Schritt 4 · Sprechtasten")),o.push(e.K("Sprechtaste fürs Telefon (gedrückt halten)","kSprech","F9","Solange du sie hältst, hört dich der Anrufer")),o.push(e.K("Sprechtaste für den Funk (gedrückt halten)","kFunk","F10","Solange du sie hältst, sendest du im Funk")),o.push(e.B("Ausprobieren",[d("Jetzt eine Sprechtaste drücken",lt)],"Klicken, dann innerhalb von 8 Sekunden eine der beiden Tasten drücken",fe(a,"noch nicht probiert")))}else o.push(e.I("Mikrofon und Sprechtasten","nicht nötig","Die Spracheingabe ist aus – du tippst deine Fragen und Funksprüche",m));return o.push(e.H("Schritt 5 · Wer spielt die Anrufer?")),o.push(e.S("Anrufer-KI","kimodus",["Gemini (Cloud)","Lokal (Ollama)"],"Lokal (Ollama)","Gemini: am natürlichsten, braucht Internet und einen kostenlosen Schlüssel. Lokal: läuft auf deinem PC, braucht einen kräftigen Rechner")),o.push(e.B("Einrichten",Be()==="gemini"?[{l:"Gemini-Schlüssel …",sub:"gemini"}]:[{l:"Lokale KI …",sub:"modelle"}],Be()==="gemini"?"Schlüssel holen und einfügen – Schritt für Schritt erklärt":"Ein Sprachmodell laden – LeitWerk schlägt die passende Größe für deinen PC vor",fe(s,"noch nicht bereit"))),o.push(e.H("Schritt 6 · Probeanruf")),o.push(e.B("Probeanruf",[d("Starten",ot)],n.eingabe?"Es klingelt, ein Anrufer spricht, dann antwortest du – so wie im Spiel":"Es klingelt und ein Anrufer spricht – so wie im Spiel",x.probeanruf?{chip:x.probeanruf,dot:ee}:fe(i,"noch nicht gemacht"))),o.push(e.B("Mehr einstellen",[{l:"Kopfhörer & Mikrofon",go:["platz","audio"]},{l:"Telefon, Funk & KI",go:["platz","gespraech"]}],"Lautstärken, Funk, Stimmen und alles Weitere")),o}function ht(e){const n=xn(),r=n==="getrennt",t=[e.S("Wie hörst und sprichst du?","auArt",["Headset (Kopfhörer mit Mikrofon)","Lautsprecher und Mikrofon","Telefon und Funk auf getrennten Geräten"],"Headset (Kopfhörer mit Mikrofon)","Ein Headset ist am besten. Bei Lautsprechern nicht „Freisprechen“ verwenden – sonst hört sich der Anrufer selbst"),e.H("Hören")];return w||t.push(e.I("Geräte wählen",M,"Im Browser kommt alles aus dem Gerät, das am Computer eingestellt ist",m)),r?(t.push(e.L("Telefon: Anrufer","sdev",["Wie das System"],"Wie das System","Hier hörst du die Anrufer")),t.push(e.B("",[d("▶ Testen",()=>(je("w"),"▶ Stimme"))])),t.push(e.L("Funk: Fahrzeuge","fdev",["Wie am Telefon"],"Wie am Telefon","Hier hörst du den Funk")),t.push(e.B("",[d("▶ Testen",st)])),t.push(e.L("Töne (Klingeln, Funk-Piep)","tdev",["Wie das System"],"Wie das System","Z. B. Klingeln über die Lautsprecher, damit du es auch ohne Headset hörst")),t.push(e.B("",[d("▶ Testen",()=>(He("notruf",void 0,70),"▶ Klingeln"))])),t.push(e.T("Telefon links, Funk rechts","stereo",!1,"Im Headset: Anrufer nur im linken Ohr, Funk nur im rechten – wie in einer echten Leitstelle. Töne bleiben auf beiden Seiten"))):(t.push(e.L(n==="headset"?"Headset":"Lautsprecher","sdev",["Wie das System"],"Wie das System","Anrufer, Funk und Töne kommen alle hier heraus")),t.push(e.B("Probeton",[d("▶ Abspielen",bn)],"Zuerst klingelt es, dann spricht eine Stimme")),n==="headset"&&t.push(e.T("Telefon links, Funk rechts","stereo",!1,"Anrufer nur im linken Ohr, Funk nur im rechten – wie in einer echten Leitstelle. Töne bleiben auf beiden Seiten"))),t.push(e.H("Sprechen")),r?(t.push(e.L("Mikrofon fürs Telefon","mic",["Wie das System"],"Wie das System")),t.push(e.B("",[d("Testen – 4 Sekunden sprechen",()=>Fe("telefon"))])),t.push(...Ce(e,"telefon")),t.push(e.L("Mikrofon für den Funk","micFunk",["Wie am Telefon"],"Wie am Telefon")),t.push(e.B("",[d("Testen – 4 Sekunden sprechen",()=>Fe("funk"))])),t.push(...Ce(e,"funk"))):(t.push(e.L("Mikrofon","mic",["Wie das System"],"Wie das System",n==="headset"?"Das Mikrofon des Headsets":"Am besten ein Mikrofon nahe am Mund")),t.push(e.B("Mikrofon testen",[d("Testen – 4 Sekunden sprechen",()=>Fe("telefon"))],"Klicken und sprechen – danach steht da, was verstanden wurde")),t.push(...Ce(e,"telefon"))),t.push(e.H("Lautstärken")),t.push(e.R("Anrufer am Telefon","slaut",0,100,5,85,l=>`${l} %`)),t.push(e.R("Fahrzeuge im Funk","sfLautKi",0,150,5,100,l=>`${l} %`,"Fahrzeuge, die der Computer spricht")),t.push(e.R("Mitspieler im Funk","sfLaut",0,150,5,90,l=>`${l} %`,"Stimmen echter Spieler (Disponenten, Piloten)")),t.push(e.R("Andere Funkgruppen","fgLaut",0,100,5,60,l=>`${l} %`,"Gruppen, die du nur mithörst – dringende Rufe kommen immer voll")),t.push(e.L("Funk, während du telefonierst","fTel",["Normal","Leiser","Stumm"],"Leiser","Dringende Rufe bleiben hörbar")),t.push(e.R("Töne","tlaut",0,100,5,80,l=>`${l} %`,"Klingeln, Funk-Piep, Chat")),t.push(e.R("Deine Stimme im Funk","sfSende",0,200,5,100,l=>`${l} %`,"Wie laut dich die Mitspieler hören")),t.push(e.H("Tipps")),t.push(e.I("Bluetooth-Headset","","Viele Bluetooth-Headsets klingen schlecht, sobald das Mikrofon an ist. Ein Headset mit Kabel oder USB ist besser",m)),t.push(e.I("Nichts zu hören?","","Lautstärke am Computer prüfen und oben das richtige Gerät wählen. Neu angesteckte Geräte erscheinen nach dem Neustart von LeitWerk",m)),t}function gt(e){const n=J(),r=sn(),t=ln(),l=ve().modell,a=Pe.find(h=>h.name===l),s=f.ram?Mn(f.ram):null,i=`${a?`${Oe[a.stufe]}: `:""}${l}${f.ram?` · dein PC: ${f.ram} GB Arbeitsspeicher${s?`, passend: ${Oe[s]}`:""}`:""}`,u=w?f.ki===void 0?{chip:l,dot:m}:D(l)?{chip:"bereit",dot:E}:{chip:"noch nicht geladen",dot:L}:{chip:M,dot:m},c=f.piper?.length??0,o=Re.find(h=>h.name===n.modell);return[e.H("Telefon"),e.T("Ich nehme Notrufe an","notrufe",!0,"Aus: Bei dir klingelt kein Notruf (z. B. wenn du nur den Funk machst)"),e.T("Ich nehme die KT-Hotline an","kthot",!0,"Bestellungen von Krankentransporten"),e.T("Ich nehme Überstellungen an","ueberst",!0,"Anrufe von Krankenhäusern, die einen Patienten verlegen"),e.T("Mit der Stimme sprechen","eingabe",!0,"Aus: Du tippst deine Fragen"),e.K("Sprechtaste fürs Telefon (gedrückt halten)","kSprech","F9","Solange du sie hältst, hört dich der Anrufer"),e.T("Erkannten Text gleich abschicken","autosend",!0,"Aus: Du kannst den Text vor dem Abschicken noch ändern"),e.T("Freisprechen (ohne Sprechtaste)","freispr",!1,"Der Anrufer hört dich, sobald du sprichst – nur mit Headset, sonst hört er sich selbst"),e.T("Anrufer vorlesen","vorl",!0,"Aus: Du liest nur mit, was der Anrufer sagt"),e.T("Telefonklang und Geräusche","klang",!0,"Der Anrufer klingt wie am Telefon, dazu Geräusche vom Notfallort"),e.T("Knopf „Gespräch exportieren“","gexp",!1,"Speichert ein Gespräch als Datei – zum Melden von Fehlern"),e.H("Funk"),e.K("Sprechtaste für den Funk (gedrückt halten)","kFunk","F10","Spricht in die Gruppe, die am Funkgerät gewählt ist"),e.K("Eigene Funktaste: normale Gruppe","kFunkN","–","Nur wenn du für jede Gruppe eine eigene Taste willst"),e.K("Eigene Funktaste: RD-NOE-09","kF09","–","Gruppe für Großeinsätze"),e.K("Eigene Funktaste: RD-NOE-10","kF10","–","Zweite Gruppe für Großeinsätze"),e.T("Funk vorlesen","fvorl",!0,"Aus: Du liest die Funksprüche nur mit"),e.T("Funk-Klang","fklang",!0,"Stimmen klingen blechern wie im echten Funk"),e.T("Echte Disponenten hören","echteD",!0,"Nur im Mehrspieler"),e.T("Echte Piloten hören","echteP",!0,"Nur im Mehrspieler"),e.T("Funkmeldungen manchmal unvollständig","unvoll",!0,"Wie im echten Leben: Manchmal fehlt etwas, dann fragst du nach"),e.T("Funk-Aufnahmen an Fehlerberichte anhängen","sfAufn",!1,"Die letzten 10 eigenen Funksprüche – hilft, die Spracherkennung zu verbessern"),e.H("KI – wer spricht Anrufer und Fahrzeuge?"),e.S("Anrufer-KI","kimodus",["Gemini (Cloud)","Lokal (Ollama)"],"Lokal (Ollama)","Gemini: am natürlichsten, braucht Internet. Lokal: läuft auf deinem PC. Fällt Gemini aus, springt die lokale KI ein"),e.B("Gemini",[{l:"Einrichten …",sub:"gemini"},d("Testen",H)],"Kostenloser Schlüssel von Google – bleibt nur auf deinem PC",r?{chip:"bereit",dot:E}:t?{chip:"Schlüssel nicht geprüft",dot:L}:{chip:"nicht eingerichtet",dot:m}),e.T("Gemini versteht den Funk","gfunk",!1,"Test: kennt alle Fahrzeuge, schreibt Rufnamen richtig"),e.T("Fahrzeuge sprechen mit Gemini","gfzg",!1,"Jedes Fahrzeug mit eigener Stimme (immer an, wenn Gemini die Anrufer spielt)"),Q(e),e.B("Lokale KI: Sprachmodell",[{l:"Wählen …",sub:"modelle"}],i,u),e.T("Lokale KI verwenden","lokal",!0,"Aus: Die Anrufer antworten mit vorbereiteten Sätzen"),e.T("Lokale KI beim Beenden schließen","olbeend",!0),e.T("Schnelles Gespräch (Test)","schnell",!1,"Anrufer fängt früher zu sprechen an"),e.B("Ausprobieren",[d("Testanruf",async()=>Be()==="gemini"&&t?H():`Anrufer: „${(await ie()).antwort}“`),d("Wie schnell?",async()=>{if(Be()==="gemini"&&t)return H();const{s1:h,s2:g}=await ie();return`${g<=5?"Flüssig – passt gut":g<=10?"Brauchbar":g<=18?"Eher langsam – ein kleineres Modell wäre flüssiger":"Zu langsam – bitte ein kleineres Modell"}: erste Wörter nach ${oe(h)} s, fertig nach ${oe(g)} s`},{},I)],"Ein kurzes Probegespräch ohne Spiel (das erste dauert länger)"),e.H("Stimmen und Spracherkennung"),e.B("Stimmen",[{l:"Wählen …",sub:"piper"}],"Je mehr Stimmen, desto abwechslungsreicher klingen Anrufer und Fahrzeuge (Piper, läuft auf deinem PC)",w?f.piper===void 0?{chip:_,dot:m}:c?{chip:`${c} geladen`,dot:E}:{chip:"Computerstimme",dot:L}:{chip:M,dot:m}),e.R("Sprechtempo","tempo",70,140,5,100,h=>`${h} %`),e.B("Spracherkennung",[{l:"Wählen …",sub:"whisper"}],"Versteht, was du sagst (Whisper, läuft auf deinem PC)",w?f.whisper===void 0?{chip:_,dot:m}:f.whisper.includes(n.modell)?{chip:o?o.label.split(/\s+–\s+/)[0]:"bereit",dot:E}:{chip:"noch nicht geladen",dot:L}:{chip:M,dot:m}),e.B("Alles in Ruhe einrichten",[{l:"Zum Einrichten",go:["platz","einrichten"]}],"Schritt für Schritt mit Probeanruf")]}function ft(e){return[e.T("Klingelton bei Anrufen","klingel",!0),e.T("Funk-Piep, wenn ein Fahrzeug ruft","fpiep",!0),e.R("Lautstärke der Töne","tlaut",0,100,5,80,n=>`${n} %`),e.H("Welcher Ton wann?"),...ce(e),e.H("Eigene Tondateien"),...A(e)]}function mt(e){const n=[],r=br();r.length||n.push(e.I("Gespeicherte Anordnungen","noch keine","Eigene Anordnungen speicherst du im Spiel unter „Anordnung“ – oder lädst sie unten aus einer Datei",m));for(const t of r)n.push(e.IT(t.name,t.fenster.length?`Hauptfenster + ${t.fenster.length} weitere${t.fenster.length>1?"":"s"} Fenster`:"Hauptfenster","","",{btns:[d("Übernehmen",async()=>Qr()?(await ei(t),"Übernommen"):(localStorage.setItem(ni,JSON.stringify(t.haupt)),t.fenster.length?"Gilt beim nächsten Spielstart (ohne Nebenfenster)":"Gilt beim nächsten Spielstart")),d("Als Datei …",async()=>await pe(`leitwerk-anordnung-${t.name}.json`,JSON.stringify(t,null,1),{name:"Anordnung",extensions:["json"]})?"Gespeichert":"Abgebrochen"),d("Löschen",()=>(wr(t.name),"Gelöscht"),{cfm:`„${t.name}“ löschen?`})]}));return n.push(e.B("Aus Datei",[T("Anordnung laden …",".json,application/json",async t=>{const l=await Ve(t),a=ti(l);return hn("Anordnungen",qe(t.name,"json"),l),`„${a.name}“ übernommen`})],"Zum Beispiel von einem Freund")),n}const Ye=e=>e.name?.trim()||e.id;function pt(e){const n=rn(!0).slice().sort((s,i)=>Ye(s).localeCompare(Ye(i),"de")),r=n.filter(s=>!an(s.id)),t=s=>{const i=new Set(s.varianten.map(u=>_r(u)));return i.size===1&&i.has("NA")?"ja":i.has("NA")?"teils":[...i].sort((u,c)=>Me(c)-Me(u))[0]==="RS"?"nein":`bis ${[...i].sort((u,c)=>Me(c)-Me(u))[0]}`},l=s=>`${an(s.id)?Pn(s.id)?"eingebaut, geändert":"eingebaut":"eigener"}${xr(s.id)?"":" · aus"}`,a=n.map(s=>s.id);return[e.TAB(["Fall","Art","Notarzt","Herkunft"],n.map(s=>[Ye(s),s.spezial?"besonderer Anruf":"Notfall",t(s),l(s)]),{suche:"Fälle durchsuchen …",neu:"Neuer Fall",anzahl:`${K(n.length)} Fälle · ${K(r.length)} eigene`,edit:!0,ding:"Fall",oeffnen:s=>kr(a[s]),neuZiel:"neuerFall",hint:"Stift öffnet den Fall-Editor (Telefonat, Abfrage, Ausgänge, Krankenhaus)"}),e.B("Prüfen",[d("Alle Fälle prüfen",()=>{const s=rn(!0),i=ri(b.schema,s);if(!i.length)return`Alle ${K(s.length)} in Ordnung`;const u=new Set(i.map(o=>o.fall)),c=i[0];throw new Error(`${i.length} Problem${i.length===1?"":"e"} in ${u.size} Fäll${u.size===1?"":"en"} – z. B. ${c.fall}${c.variante?` (${c.variante})`:""}: ${c.fehler}`)})],"Telefonat, Verlauf, Krankenhaus stimmig?"),e.B("Import & Export",[T("Importieren …",".json,application/json",async s=>{const i=await Ve(s),u=ii(i,!1);if(!u.neu&&!u.ersetzt)throw new Error(u.fehler[0]??"Keine Fälle in der Datei");return hn("Fälle",qe(s.name,"json"),i),`${u.neu} neu, ${u.ersetzt} ersetzt${u.fehler.length?`, ${u.fehler.length} übersprungen (${u.fehler[0]})`:""}`}),d("Exportieren …",async()=>{const s=rn(!0),i=s.filter(o=>!an(o.id)||Pn(o.id)),u=(i.length?i:s).map(o=>o.id);return await pe(`leitwerk-faelle-${new Date().toISOString().slice(0,10)}.json`,ai(u),{name:"Fallpaket",extensions:["json"]})?`${u.length} ${i.length?"eigene/geänderte ":""}Fälle exportiert`:"Abgebrochen"})],"Fallpakete (JSON) – exportiert werden die eigenen und geänderten Fälle")]}function kt(){const e=b.settings.stufen.map(n=>({...n}));for(const n of Cr())e.some(r=>r.stufe===n)||e.push(Ir(n)??Wr(n));return e}const bt=Object.keys(Te).map(e=>Te[e]),wt=On.map(e=>tn[e]);function wn(e){const n=structuredClone(b.settings);e(n),b.setSettings(n),yi.call("neuPlanen").catch(()=>{})}function St(e){const n=kt(),r=l=>[l.stufe,l.rettungsmittel||"– (Weitergabe)",l.nfsErforderlich?"ja":"nein",Te[l.notarzt]??l.notarzt,l.sondersignal?"ja":"nein",tn[l.kategorie]??l.kategorie,`${l.transportProzent} %`],t=[e.T("Rendezvous RTW – NEF","rdv",!0,"NEF mehr als 15 min entfernt: RTW fährt los und trifft das NEF unterwegs"),e.N("Toleranz für besser passende Rettungsmittel","tol",5,"min"),e.H("Stufen-Zuordnung")];return ke.alarmierung&&t.push(e.I("Nicht gespeichert",ke.alarmierung,"",Je)),t.push(e.TAB(["Stufe","Rettungsmittel","NFS","Notarzt","Signal","Kategorie","Transport"],n.map(r),{edit:!0,neu:"Neue Stufe",ding:"Stufe",typen:["text","text","tog",["sel",bt],"tog",["sel",wt],"num"],hint:"„>“ trennt die Ränge, „/“ heißt gleichwertig. Ein schlechter passendes Rettungsmittel kommt nur, wenn das bessere mehr als die Toleranz länger braucht.",speichern:(l,a)=>Ie("alarmierung",()=>{const s=l>=0?n[l]:void 0,i=(a[0]??"").trim();if(!i)throw new Error("Bitte einen Namen für die Stufe eingeben");if(n.some(o=>o.stufe===i&&o!==s))throw new Error(`Die Stufe „${i}“ gibt es schon`);const u=(a[1]??"").trim(),c={stufe:i,rettungsmittel:/^–|weitergabe/i.test(u)||!u?"":u.toUpperCase().replace(/\s+/g,""),nfsErforderlich:a[2]==="ja",notarzt:Object.keys(Te).find(o=>Te[o]===a[3])??s?.notarzt??"nein",sondersignal:a[4]==="ja",kategorie:On.find(o=>tn[o]===a[5])??s?.kategorie??"dringend",transportProzent:Math.max(0,Math.min(100,Math.round(parseFloat(String(a[6]).replace(",","."))||0)))};wn(o=>{const h=s?o.stufen.findIndex(g=>g.stufe===s.stufe):-1;h>=0?o.stufen[h]=c:o.stufen.push(c)})}),loeschen:l=>Ie("alarmierung",()=>{const a=n[l];if(!a)return;const s=si().stufen.find(i=>i.stufe===a.stufe);wn(i=>{s?i.stufen=i.stufen.map(u=>u.stufe===a.stufe?{...s}:u):i.stufen=i.stufen.filter(u=>u.stufe!==a.stufe)})})})),t}async function Ie(e,n){try{await n(),delete ke[e]}catch(r){ke[e]=$e(r),console.warn("Hauptmenü speichern",r)}$()}const zt={stations:"ds",vehicles:"fz",hospitals:"kh",pois:"poi",templates:"ev",codes:"code"},We=e=>`${e.lat.toFixed(5)}, ${e.lon.toFixed(5)}`;async function _e(e,n,r){const t=e.trim();if(n&&t===(r??"").trim())return{lat:n.lat,lon:n.lon};if(!t)throw new Error("Bitte die Lage angeben (Breite, Länge oder eine Adresse)");const l=t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)??t.match(/^(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)$/);if(l){let s=Number(l[1].replace(",",".")),i=Number(l[2].replace(",","."));const u=o=>o>=44&&o<=52,c=o=>o>=7&&o<=21;if(!u(s)&&u(i)&&c(s)&&([s,i]=[i,s]),!u(s)||!c(i))throw new Error(`Koordinate ${t} liegt außerhalb des Kartengebiets`);return{lat:s,lon:i}}const a=(await Fi(t,1).catch(()=>[]))[0];if(!a)throw new Error(`„${t}“ nicht gefunden – bitte Koordinaten angeben (Breite, Länge)`);return{lat:a.lat,lon:a.lon}}const Sn=new Map;function At(e,n,r){const t=tt(kn[`tq_${r}`]??"").trim(),l=Sn.get(e);if(l&&l.stand===we&&l.q===t)return l.d;const a=b.list(e);let s=a,i;if(a.length<=2e3)i=a.map(n);else{const c=[];i=[];for(const o of a){const h=n(o);if(!(t&&!tt(h.join(" ")).includes(t))&&(c.push(o),i.push(h),c.length>=200))break}s=c}const u={recs:s,rows:i,gesamt:a.length};return Sn.set(e,{stand:we,q:t,d:u}),u}const Et=(e,n)=>e.recs.length<e.gesamt?`${K(e.gesamt)} ${n} · ${K(e.recs.length)} gezeigt – Suche zeigt mehr`:`${K(e.gesamt)} ${n}`;function Tt(e,n){return e.B("Import & Export",[{l:"CSV importieren …",imp:!0},d("Exportieren …",async()=>{const r=li(n,b.list(n),b.list("stations"));return await pe(`leitwerk_${oi[n]}.csv`,r)?`${ui[n]} exportiert`:"Abgebrochen"})],"CSV-Dateien · erst prüfen, dann ergänzen oder ersetzen · Vorlage und Beispiel liegen in Dokumente/LeitWerk")}function Ae(e,n,r,t){const l=At(r,t.zeile,n),a=[];return ke[n]&&a.push(e.I("Nicht gespeichert",ke[n],"",Je)),a.push(e.TAB(t.cols,l.rows,{...t.x,edit:!0,anzahl:Et(l,t.wort),speichern:(s,i)=>Ie(n,async()=>{const u=s>=0?l.recs[s]:void 0,c=await t.bauen(u,i.map(o=>String(o??"")),s>=0?l.rows[s]:void 0);b.upsert(r,c)}),loeschen:s=>Ie(n,()=>{const i=l.recs[s];i&&b.remove(r,i.id)})})),a.push(Tt(e,r)),a}const Ee=(e,n,r)=>({id:e?.id??b.newId(zt[n]),hinweis:r.trim(),herkunft:e?.herkunft==="import"?"import":"manuell",herkunftDetail:e?.herkunftDetail}),X=(e,n,r)=>!n||(e[r]??"")!==(n[r]??"");function Lt(e){const n=b.list("stations"),r=new Map(n.map(a=>[a.id,a.name])),t=a=>`${a.typ}${a.aufbau==="gross"&&a.typ!=="RTW-C"?" (groß)":""}`,l=a=>a.ersatzFuer?`nur bei Flugverbot (Ersatz für ${a.ersatzFuer})`:Di(a.dienstplan);return Ae(e,"fahrzeuge","vehicles",{cols:["Funkrufname","Kurzname","Kategorie","Typ","Dienststelle","Dienstplan","Aktiv"],wort:"Fahrzeuge",zeile:a=>[a.funkrufname,a.kurzname,a.kategorie,t(a),r.get(a.dienststelleId)??"⚠ fehlt",l(a),a.aktiv?"ja":"nein",a.nachtflug?"ja":"nein",a.ersatzFuer??"",a.hinweis??""],x:{suche:"Fahrzeug suchen …",neu:"Neues Fahrzeug",ding:"Fahrzeug",typen:["text","text",["sel",[...Vn]],"text","text","plan","tog"],extra:[["Nachtflug","tog","nein"],["Ersatz für","text",""],["Hinweis","text",""]]},bauen:(a,s,i)=>{const u=s[0].trim();if(!u)throw new Error("Bitte einen Funkrufnamen eingeben");const c=Vn.includes(s[2])?s[2]:a?.kategorie??"RTW";let o=a?.dienststelleId??"";if(X(s,i,4)||!a){const N=s[4].trim().toLowerCase(),ae=n.filter(le=>le.name.trim().toLowerCase()===N);if(!ae.length)throw new Error(`Dienststelle „${s[4]}“ gibt es nicht`);if(ae.length>1&&!ae.some(le=>le.id===o))throw new Error(`Dienststelle „${s[4]}“ gibt es mehrmals – bitte im Spiel unter Daten zuordnen`);o=ae.some(le=>le.id===o)?o:ae[0].id}let h=s[3].replace(/\s*\(groß\)\s*$/,"").trim(),g=a?.aufbau;a&&!X(s,i,3)?h=a.kategorie===c?a.typ:c:X(s,i,3)&&(g=/\(groß\)\s*$/.test(s[3])?"gross":void 0),h||(h=c);let k=a?.dienstplan;if(!a||X(s,i,5)){const N=di(s[5]);if(N.fehler)throw new Error(N.fehler);k=N.plan}const S={...a??{},...Ee(a,"vehicles",s[9]??""),funkrufname:u,kurzname:s[1].trim(),kategorie:c,typ:h,dienststelleId:o,aktiv:s[6]==="ja",nachtflug:s[7]==="ja",dienstplan:k??[]};g?S.aufbau=g:delete S.aufbau;const P=(s[8]??"").trim();(P||a?.ersatzFuer!==void 0)&&(S.ersatzFuer=P);const B=[S];if(S.typ.toUpperCase()==="RTW-C"){S.typ="RTW-C",S.aufbau="gross";for(const N of b.list("vehicles"))N.id!==S.id&&N.dienststelleId===S.dienststelleId&&N.typ.trim().toUpperCase()==="RTW-C"&&B.push({...N,typ:"RTW",aufbau:"gross"})}return B}})}function vt(e){const n=new Map;for(const t of b.list("vehicles"))n.set(t.dienststelleId,(n.get(t.dienststelleId)??0)+1);const r=[...new Set([...pr,...b.list("stations").map(t=>t.typ).filter(Boolean)])];return Ae(e,"dienststellen","stations",{cols:["Name","Typ","Ort","Bezirk","Fahrzeuge"],wort:"Dienststellen",zeile:t=>[t.name,t.typ,t.ort,t.bezirk,String(n.get(t.id)??0),t.adresse??"",We(t),t.hinweis??""],x:{suche:"Dienststelle suchen …",neu:"Neue Dienststelle",ding:"Dienststelle",typen:["text",["sel",r],"text","text","fix"],extra:[["Adresse","text",""],["Lage","lage",""],["Hinweis","text",""]]},bauen:async(t,l,a)=>{const s=l[0].trim();if(!s)throw new Error("Bitte einen Namen eingeben");const i=await _e(l[6]||(t?"":l[5]),t,a?.[6]);return[{...t??{},...Ee(t,"stations",l[7]??""),name:s,typ:l[1]||"Rettungsdienst",organisation:t?.organisation??"",ort:l[2].trim(),bezirk:l[3].trim(),adresse:(l[5]??"").trim(),lat:i.lat,lon:i.lon}]}})}const Bt=new Map(Yt.flatMap(e=>[[e.name.toLowerCase(),e.id],[e.id.toLowerCase(),e.id]])),Kt=new Map(Xt.flatMap(e=>[[e.name.toLowerCase(),e.id],[e.id.toLowerCase(),e.id]])),zn=(e,n,r)=>e.split(/\s*[;,]\s*/).map(t=>t.trim()).filter(Boolean).map(t=>{const l=n.get(t.toLowerCase());if(!l)throw new Error(`${r} „${t}“ gibt es nicht`);return l});function $t(e){return Ae(e,"krankenhaeuser","hospitals",{cols:["Name","Kurzname","Ort"],wort:"Krankenhäuser",zeile:n=>[n.name,n.kurzname,n.ort,We(n),gi(n.zufahrt),fi(n.landeplatz),(n.einrichtungen??[]).map(r=>mi(r)?.name??r).join(", "),(n.akutAus??[]).map(r=>pi(r)?.name??r).join(", "),"",n.hinweis??""],x:{suche:"Krankenhaus suchen …",neu:"Neues Krankenhaus",ding:"Krankenhaus",typen:["text","text","text"],extra:[["Lage","lage",""],["Rettungszufahrt","text",""],["Hubschrauberlandeplatz","text",""],["Einrichtungen","einr",""],["Akut-Bereiche aus","text",""],["Aufnahme bei Notfällen","khlink",""],["Hinweis","text",""]],hint:"„Akut-Bereiche aus“ mit Komma getrennt · Öffnungszeiten der Akut-Bereiche unter KH-Aufnahme"},bauen:async(n,r,t)=>{const l=r[0].trim();if(!l)throw new Error("Bitte einen Namen eingeben");const a=await _e(r[3],n,t?.[3]),s={...n??{},...Ee(n,"hospitals",r[9]??""),name:l,kurzname:r[1].trim(),ort:r[2].trim(),lat:a.lat,lon:a.lon};if((!n||X(r,t,6))&&(s.einrichtungen=zn(r[6],Bt,"Einrichtung")),(!n||X(r,t,7))&&(s.akutAus=zn(r[7],Kt,"Akut-Abteilung")),!n||X(r,t,4)){const i=ci(r[4]);if(r[4].trim()&&!i)throw new Error("Zufahrt: bitte so angeben: einfahrt=48.41296,15.61544; p=48.41247,15.61458");s.zufahrt=i}if(!n||X(r,t,5)){const i=hi(r[5]);if(r[5].trim()&&!i)throw new Error("Landeplatz: bitte Koordinaten („48.41210,15.61480“) oder „kein“ angeben");s.landeplatz=i}return delete s.abteilungen,delete s.bereiche,[s]}})}function Nt(e){const n=r=>Ci(r).map(Ii).join(", ");return Ae(e,"pois","pois",{cols:["Name","Kategorien","Ort"],wort:"Orte",zeile:r=>[r.name,n(r),r.ort,We(r),r.hinweis??""],x:{suche:"Ort suchen …",neu:"Neuer Ort",ding:"Ort",typen:["text","text","text"],extra:[["Lage","lage",""],["Hinweis","text",""]],hint:"Kategorien mit Komma getrennt, z. B. „Pflegeheim, Schule“"},bauen:async(r,t,l)=>{const a=t[0].trim();if(!a)throw new Error("Bitte einen Namen eingeben");const s=await _e(t[3],r,l?.[3]);let i=r?.typ??"";if(!r||X(t,l,1)){const c=[],o=[];for(const h of t[1].split(/\s*[;,]\s*/).map(g=>g.trim()).filter(Boolean)){const g=ki.find(k=>!k.liste&&(k.key===h.toLowerCase()||k.label.toLowerCase()===h.toLowerCase()));g?c.push(g.key):o.push(h)}i=bi(c,o.join(", "))}return[{...r??{},...Ee(r,"pois",t[4]??""),name:a,typ:i,ort:t[2].trim(),lat:s.lat,lon:s.lon}]}})}const yt=["nach Stufe","ja","nein"];function Dt(e){return Ae(e,"vorlagen","templates",{cols:["Code","Adresse","Meldung"],wort:"Vorlagen",zeile:n=>[n.code,n.adresse,n.meldung,We(n),n.patientAlter==null?"":String(n.patientAlter),n.transport==null?"nach Stufe":n.transport?"ja":"nein",n.hinweis??""],x:{suche:"Vorlage suchen …",neu:"Neue Vorlage",ding:"Vorlage",typen:["text","text","text"],extra:[["Lage","lage",""],["Patient Alter","text",""],["Transport",["sel",yt],"nach Stufe"],["Hinweis","text",""]]},bauen:async(n,r,t)=>{const l=r[0].trim();if(!l)throw new Error("Bitte einen Code eingeben");const a=await _e(r[3]||(n&&!X(r,t,1)?"":r[1]),n,t?.[3]),s=r[4].trim();if(s&&!Number.isFinite(Number(s)))throw new Error(`Alter „${s}“ ist keine Zahl`);return[{...n??{},...Ee(n,"templates",r[6]??""),code:l,adresse:r[1].trim(),meldung:r[2].trim(),lat:a.lat,lon:a.lon,patientAlter:s===""?null:Number(s),transport:r[5]==="ja"?!0:r[5]==="nein"?!1:null}]}})}function Ft(e){const n=Wn(),r=mn("notruf"),t=r?r.replace(/\.(json|csv|txt)$/i,""):null,l=b.schema?Object.keys(b.schema.kapitel).length:new Set(n.map(o=>o.gruppenname)).size,a=_n(),s=b.ktSatzRoh?b.ktSatzRoh.name||"Eigener Satz":null,i=t?`Eigene Datei: ${t}`:"LeitWerk-Codesystem (eingebaut)",u=s?`Eigene Datei: ${s}`:"LeitWerk-Transportcodes (eingebaut)",c=o=>o.gruppe?`${o.gruppe} - ${o.gruppenname}`:o.gruppenname;return[e.I("Notruf (RD)",i,`${K(n.length)} Codes in ${l} Kapiteln${b.schema?", mit Abfrage":""}`,n.length?E:L),e.I("Krankentransport & Überstellung (KT/SEK)",u,`${K(a.length)} Codes, mit KT-Abfrage`,a.length?E:L),e.B("Eigene Codes & Abfrage",[{l:"Notruf (RD)",go:["real","notruf"]},{l:"KT/SEK",go:["real","ktsek"]}],"Unter Eigene Dateien hochladen und umschalten – jeder Spieler selbst"),e.S("Codeliste","codeart",["Notruf (RD)","KT/SEK"],"Notruf (RD)"),e.TAB(["Code","Name","Kategorie","Kapitel"],n.map(o=>[o.code,o.beschreibung,o.stufe,c(o)]),{suche:"Code suchen …",anzahl:`${K(n.length)} Codes · ${t??"LeitWerk-Codesystem"}`,when:o=>o("codeart","Notruf (RD)")==="Notruf (RD)"}),e.TAB(["Code","Name","Kapitel","Art"],a.map(o=>[o.code,o.name,o.kapitel,o.gruppe]),{suche:"Code suchen …",anzahl:`${K(a.length)} Codes · ${s??"LeitWerk-Transportcodes"}`,when:o=>o("codeart","Notruf (RD)")==="KT/SEK"})]}const Ct={alarmWache:"alarmiert auf der Wache",alarmFunk:"alarmiert über Funk"},An=e=>_i[e]??Ct[e]??e;function It(e){return[e.H("Bedeutung · Nummer · Bezeichnung · Farbe · alarmierbar"),...b.settings.status.map((n,r)=>({t:"stat",label:An(n.key),key:"st"+(r+1),nr:n.nummer,nm:n.name,color:n.farbe,on:n.verfuegbar}))]}const En=e=>e.replace(/\.(json|csv|txt)$/i,""),Xe={notruf:"Eingebaut – LeitWerk-Codesystem",ktsek:"Eingebaut – LeitWerk-Transportcodes"},Wt={notruf:"Eine JSON-Datei mit Kapiteln, Fragen, Regeln und Codes – Aufbau wie die Beispieldatei",ktsek:"Eine JSON-Datei mit allen KT/SEK-Codes und ihren Bedingungen – Aufbau wie die Beispieldatei"},_t={notruf:{datei:"Beispiel Notruf.json",hint:"Kleines, vollständiges Beispiel (3 Kapitel) – zeigt den Aufbau. Oben in der Datei steht eine Anleitung für eine KI.",text:()=>et,ki:()=>{const e=JSON.parse(et).anleitung_fuer_ki??"";return Array.isArray(e)?e.join(`
`):e}},ktsek:{datei:"Beispiel KT-SEK.json",hint:"Die eingebauten KT/SEK-Codes als Beispiel – vollständig, weil jede Kombination genau einen Code braucht. Oben in der Datei steht eine Anleitung für eine KI.",text:$r,ki:()=>jr().join(`
`)}},xt=(e,n,r)=>`${e}

## Beispieldatei (${r})

\`\`\`
${n}
\`\`\`

## Mein Auftrag
Region: 
Worauf achten: 
`,Tn=(e,n,r)=>d("KI-Anleitung kopieren",async()=>(await navigator.clipboard.writeText(xt(e(),n(),r)),"Kopiert – in eine KI einfügen, unten Region und Wünsche ergänzen"));function Ln(e,n,r,t,l,a){const s=`ak_${n}_${fn[n]??0}`;at[s]=c=>{c!==t&&(Ze[n]={t:"wird umgeschaltet …",dot:m},$(),l(c).then(o=>Ze[n]={t:o,dot:E}).catch(o=>Ze[n]={t:$e(o),dot:Je}).finally(()=>{fn[n]=(fn[n]??0)+1,Promise.all([W(),V()]).finally($)}))};const i=[e.L("Aktiv",s,r,t,a)],u=Ze[n];return u&&i.push(e.I("Rückmeldung",u.t,"",u.dot)),i}const vn=(e,n)=>w?e.B("Ordner",[d("Ordner öffnen",()=>qn(n))],`Dokumente/LeitWerk/${n}`):e.B("Ordner",[],`Dokumente/LeitWerk/${n}`,{chip:M,dot:m});function Bn(e,n){const r=Rn[n],t=f.teile?.[n],l=mn(n),a=[],s=(t??[]).filter(g=>!g.entwurf),i=s.map(g=>g.name),u=l?En(l):Xe[n],c=[Xe[n],...i];if(l&&!i.some(g=>g.toLowerCase()===u.toLowerCase())&&c.push(u),a.push(...Ln(e,n,c,u,async g=>{if(g===Xe[n])return pn(n,null);const k=s.find(S=>S.name===g);if(!k)throw new Error(`„${g}“ ist nicht mehr im Ordner – bitte neu hochladen`);return pn(n,k.datei)},"Gilt sofort · nur auf diesem Rechner · Liste = Dateien im Ordner")),n==="notruf"){const g=b.schemaRoh;a.push(e.I("Inhalt",g?`${K(Object.keys(g.kapitel).length)} Kapitel · ${K(Object.keys(g.codes??{}).length)} Codes`:`${K(Wn().length)} Codes`,"Codes und Abfrage stecken in derselben Datei",E)),a.push(e.B("Zuordnung zu den LeitWerk-Merkmalen",[{l:"Zuordnung …",sub:"zuordnung"}],"Nur für eine eigene Datei: welche Frage welchem Merkmal entspricht – damit die Anrufer passend antworten"))}else a.push(e.I("Inhalt",`${K(_n().length)} Codes`,"Die Fragen der KT-Hotline sind immer die eingebauten",E)),a.push(e.B("KT-Code-Editor",[d("Editor öffnen",()=>(nt({fertig:()=>void W()}),"Im Editor geöffnet"))],"Codes und Bedingungen im Spiel bearbeiten – speichert als neue Datei; dort auch Entwürfe fertigstellen"));const o=_t[n];a.push(e.H("Eigene Datei hinzufügen")),a.push(e.B("Datei hochladen",[T("Datei wählen …",".json,application/json",async g=>wi(n,g.name,await Ve(g)),W)],`${Wt[n]} · wird in den Ordner kopiert und gleich verwendet`));const h=[d("Beispieldatei herunterladen …",async()=>await pe(o.datei,o.text(),{name:"JSON-Datei",extensions:["json"]})?`Gespeichert: ${o.datei}`:"Abgebrochen")];n==="notruf"&&h.push(d("Eingebautes System herunterladen …",async()=>await pe("LeitWerk-Codesystem.json",Si,{name:"JSON-Datei",extensions:["json"]})?"Gespeichert: LeitWerk-Codesystem.json":"Abgebrochen")),a.push(e.B("Beispieldatei",h,o.hint)),a.push(e.B("Mit einer KI erstellen",[Tn(o.ki,o.text,"JSON")],"Kopiert die Anleitung samt Beispieldatei – in eine KI einfügen und nur noch Region und Wünsche dazuschreiben")),a.push(vn(e,r.ordner)),a.push(e.H(`Dateien im Ordner ${r.ordner}`)),t?t.length||a.push(e.I("Dateien","noch keine eigene Datei","Mit „Datei hochladen“ hinzufügen oder direkt in den Ordner legen",m)):a.push(e.I("Dateien",_,"",m));for(const g of t??[]){const k=l?.toLowerCase()===g.datei.toLowerCase(),S=[];n==="ktsek"&&S.push(d("Bearbeiten",async()=>{const P=zi(await Jn(r.ordner,g.datei),g.datei);return nt({satz:{codes:P},name:g.name,fertig:()=>void W()}),"Im Editor geöffnet"})),S.push(d("Löschen",()=>Nr(n,g.datei),{cfm:`„${g.datei}“ wird aus Dokumente/LeitWerk/${r.ordner} gelöscht.`},W)),a.push(e.IT(g.name,`${g.entwurf?"ENTWURF – im KT-Code-Editor fertigstellen · ":""}${g.datei}`,k?"aktiv":g.entwurf?"Entwurf":"",k?E:g.entwurf?L:"",{btns:S}))}return a}function Rt(e){const n="Eingebaut – neutrale Namen",r=b.namen.length?b.namenDatei??"":null,t=f.namen??[],l=r===null?n:r||"eigene Namen",a=[n,...t.map(u=>u.datei)];r!==null&&!a.includes(l)&&a.push(l);const s=[...Ln(e,"namen",a,l,async u=>u===n?(b.setNamen(null),"Wieder neutrale Namen"):Kn(u),"Gilt sofort · nur auf diesem Rechner · Liste = Dateien im Ordner"),e.I("Ersetzungen",r===null?"Rettungsdienst, Rettungswache, Krankentransport, Luftrettung, NAH 2 …":`${K(b.namen.length)} Ersetzungen aus „${r}“`,"Gilt für Dienststellen, Organisationen, Hubschrauber-Namen und Orte – auch für Krankentransport und Überstellungen",E),e.H("Eigene Datei hinzufügen")],i=T("Datei wählen …",".csv,.txt,text/csv,text/plain",async u=>{const c=await Ve(u),o=jn(c);if(!o.length)throw new Error("Keine Ersetzungen gefunden (Zeilen „neutral;eigen“, rechts ausgefüllt)");const h=qe(u.name,"csv");return await it("Namen",h,c),b.setNamen(o,h),`${K(o.length)} Ersetzungen aktiv – „${h}“ in Dokumente/LeitWerk/Namen`},V);s.push(e.B("Datei hochladen",[i],"CSV „neutral;eigen“ – links der neutrale Name aus der Vorlage, rechts dein Name · wird in den Ordner kopiert und gleich verwendet")),s.push(e.B("Beispieldatei",[d("Beispieldatei herunterladen …",async()=>await pe(me,Yn(Xn()))?`Gespeichert: ${me}`:"Abgebrochen")],"Alle neutralen Namen: Organisationen, Hubschrauber, Stützpunkte für Krankentransport & Überstellung (KT/SEK), Dienststellen – rechts eintragen. Oben steht eine Anleitung für eine KI. Liegt auch im Ordner.")),s.push(e.B("Mit einer KI erstellen",[Tn(()=>Ai().join(`
`),()=>Yn(Xn()),"CSV")],"Kopiert die Anleitung samt Beispieldatei – in eine KI einfügen und nur noch die Region dazuschreiben")),s.push(vn(e,"Namen")),s.push(e.B("Im Ordner geändert?",[d("Neu einlesen",()=>V().then(()=>r?Kn(r):"Eingelesen"))],"Nach dem Bearbeiten einer Datei im Ordner")),s.push(e.H("Dateien im Ordner Namen")),f.namen||s.push(e.I("Dateien",_,"",m));for(const u of t){const c=r!==null&&r.toLowerCase()===u.datei.toLowerCase(),o=u.datei===me,h=o?[]:[d("Löschen",async()=>(await mr("Namen",u.datei),c&&b.setNamen(null),"Gelöscht"),{cfm:`„${u.datei}“ wird aus Dokumente/LeitWerk/Namen gelöscht.`},V)];s.push(e.IT(En(u.datei),o?"Vorlage mit allen neutralen Namen – rechts eintragen, unter neuem Namen speichern":u.datei,c?"aktiv":"",c?E:"",{btns:h}))}return s}async function Kn(e){const n=jn(await Jn("Namen",e));if(!n.length)throw new Error(e===me?"Die Vorlage ist noch leer – rechts die eigenen Namen eintragen":"Keine Ersetzungen in der Datei (rechte Spalte leer?)");return b.setNamen(n,e),`${K(n.length)} Ersetzungen aktiv`}function Ot(e){if(!w)return[e.I("Kartenpakete",M,"Kartenpakete gibt es nur im installierten Programm",m),e.I("Satellitenbild","online, ohne Paket","",m)];const n=[],r=f.local,t=f.geo,l=r?.installed??{};if(n.push(e.I("Grundpaket & Straßen Niederösterreich",r===void 0?_:l[nn]&&l["bl-noe"]?"immer installiert":"fehlt – wird beim Start geladen","",r===void 0?m:l[nn]&&l["bl-noe"]?E:L)),t===void 0)n.push(e.I("Straßennetz und Adressen",_,"",m));else if(!t)n.push(e.I("Straßennetz und Adressen","Status unbekannt","",L));else{const h=(t.regionen??[]).map(g=>g==="alt"?"älteres Gesamtnetz":In[g]??g).join(", ");n.push(e.I("Straßennetz und Adressen",t.roads,[t.roads_nodes?`${K(t.roads_nodes)} Knoten`:"",t.address_count?`${K(t.address_count)} Adressen`:"",h?`Bundesländer: ${h}`:""].filter(Boolean).join(" · "),t.roads_nodes?E:L))}f.packsFehler&&n.push(e.I("Paketverzeichnis","nicht erreichbar",`${f.packsFehler} – Download derzeit nicht möglich`,L));const a=f.packs??[],s=[...new Set([...a.map(h=>h.id),...Object.keys(l)])].filter(h=>h!==nn&&h!=="bl-noe"),i=t?.regionen_aus??[],u=h=>{const g=a.find(Qe=>Qe.id===h),k=l[h],S=x[`pack:${h}`],P=!!(g&&k&&g.version!==k.version),B=h.startsWith("bl-")?h.slice(3):null,N=[];S||(g&&(!k||P)&&N.push(d(k?"Aktualisieren":"Laden",async()=>(await v(`pack:${h}`,"Wird geladen … 0 %",Qe=>Ei(h,Nn=>Qe(`Wird geladen … ${be(Nn.done,Nn.total)}`))),on(),`${g.name} installiert`),{},Z)),k&&!(g?.pflicht??!1)&&N.push(d("Löschen",async()=>(await yr(h),on(),"Gelöscht"),{cfm:`${g?.name??h} löschen?${B?` Ohne Paket gibt es keine Transporte nach ${In[B]??B}.`:""} Du kannst es jederzeit wieder laden.`},Z)));const ae={btns:N};k&&B&&B!=="noe"&&(ae.tog=["kp_"+B,!i.includes(B)]);const le=[g?.beschreibung,g?Dr(Fr(g)):""].filter(Boolean).join(" · ");return e.IT(g?.name??h,le,S??(P?"Update verfügbar":k?"installiert":""),S?ee:P?L:k?E:"",ae)},c=s.filter(h=>h.startsWith("bl-")),o=s.filter(h=>!h.startsWith("bl-"));return n.push(e.H("Straßen weiterer Bundesländer")),f.packs===void 0&&!c.length&&n.push(e.I("Paketverzeichnis",_,"",m)),n.push(...c.map(u)),n.push(e.H("Detailkarten und Gelände")),n.push(...o.map(u)),n.push(e.I("Satellitenbild","online, ohne Paket","",m)),r?.dir&&n.push(e.I("Speicherort",r.dir,"",m)),n}function Pt(e){const n=f.update,r=[e.I("Version",f.version===void 0?_:w?n?`${f.version} · Update auf ${n.version} verfügbar`:`${f.version} · aktuell`:`${f.version} · Entwicklung im Browser`,"",w?n?L:E:m)];if(!w)r.push(e.B("Updates",[],"",{chip:M,dot:m}));else{const t=[d("Jetzt suchen",async()=>{const l=await Ti();return f.update=l,l?`Version ${l.version} verfügbar`:"Auf dem neuesten Stand"})];n&&t.push(d("Installieren",()=>(Li(n),"Wird installiert – LeitWerk startet danach neu"),{cfm:"Jetzt aktualisieren? LeitWerk startet danach neu – deine Daten und Einstellungen bleiben."})),r.push(e.B("Updates",t,n?.notes?n.notes.split(`
`)[0]:void 0))}r.push(e.H("Eigene Dateien & Spielstände")),r.push(e.I("Ordner",f.basis??"…","Alles, was du selbst dazugibst, liegt dort – je Art ein Ordner",m)),r.push(e.B("Spielstände",[{l:"Ansehen",tab:"fort"},...w?[d("Ordner öffnen",()=>vi())]:[]],"Gespeicherte Schichten"));for(const[t,l]of Object.entries(fr))["Abfrageschema","Codelisten","Codelisten/RD","Abfrageschema/Krankentransport_Sekundärtransporte"].includes(t)||r.push(w?e.B(t.replace(/_/g," "),[d("Ordner öffnen",()=>qn(t))],l):e.B(t.replace(/_/g," "),[],l,{chip:M,dot:m}));return r}const Mt={fgfarben:R,statusfarben:C,einrichten:ct,audio:ht,gespraech:gt,toene:ft,gemini:he,modelle:j,piper:U,whisper:ge,anordnungen:mt,faelle:pt,alarmierung:St,fahrzeuge:Lt,dienststellen:vt,krankenhaeuser:$t,pois:Nt,vorlagen:Dt,codes:Ft,status:It,notruf:e=>Bn(e,"notruf"),ktsek:e=>Bn(e,"ktsek"),namen:Rt,karten:Ot,programm:Pt},Gt=(e,n)=>{const r=Mt[e];if(r)try{return r(n)}catch(t){return console.error("Hauptmenü-Zeilen",e,t),[n.I("Fehler",$e(t),"Diese Seite konnte nicht aufgebaut werden",Je)]}};let $n=!1;return{zeilen:Gt,laden(){$n||($n=!0,ye(),te(),I(),de(),se(),re(),W(),V(),Z(),Ne())},beenden(){F=!0,ne&&clearTimeout(ne),q.splice(0).forEach(e=>e()),ue?.bald===G&&(ue=null)}}}export{Oi as feldWert,Pi as zeilenQuelle};
