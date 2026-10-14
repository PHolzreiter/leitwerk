# Änderungen

## 0.12.0 – Straßen und Spitäler für ganz Ostösterreich
- Straßennetz je Bundesland als eigenes Kartenpaket: Niederösterreich (immer dabei), Wien, Burgenland, Oberösterreich, Steiermark – einzeln herunterladen, ein- und ausschalten (Einstellungen → Kartenpakete); die Netze passen an den Landesgrenzen nahtlos zusammen
- Ohne Straßenpaket eines Bundeslands gibt es keine Krankentransporte und Überstellungen dorthin; im Mehrspieler müssen alle dieselben Straßenpakete eingeschaltet haben (sonst Hinweis beim Beitreten)
- Detailkarte „Umland“ und Gelände (3D) reichen jetzt über ganz Oberösterreich, Steiermark und Burgenland
- Alle Akutspitäler in Oberösterreich, Steiermark und Burgenland, dazu weitere in Wien (insgesamt 96 Häuser) mit Stationen und Ambulanzen – änderbar unter Daten → Krankenhäuser
- Fahrzeiten: Fahrzeuge bleiben nicht mehr in Einbahn-Zufahrten (z. B. auf Spitalsgeländen) hängen – vorher fuhren sie dort manchmal in gerader Linie quer über die Karte
- BIT: Selten ist ein Patient zu schwer für die normale Trage (ca. 150 kg und mehr). Die Besatzung meldet das beim Eintreffen über Funk und fordert den BIT nach; der BIT transportiert, das erste Fahrzeug wird frei, ein nötiger Notarzt fährt mit dem NEF mit. Kommt kein BIT, transportiert die Besatzung nach einer Wartezeit selbst
- Überstellungen können ebenfalls einen BIT brauchen (Vermerk bei der Online-Anmeldung, der Anrufer sagt es dazu, Häkchen „BIT nötig“); dann wird der BIT vorgeschlagen

## 0.11.1 – Fahrzeuge im Blick
- Fahrzeug anklicken: kleines Fenster mit Status, Auftrag (Einsatz oder Krankentransport) und Ankunftszeit, die restliche Route wird orange gezeichnet; die Auftragsmaske öffnet sich rechts, die Karte bleibt beim Fahrzeug
- Fahrzeug doppelt anklicken (oder „🎥 Kamera folgen“): Die Karte zoomt heran und die Kamera folgt dem Fahrzeug – in 2D von oben, in 3D schräg von der Seite. Karte verschieben, ✕ oder Esc beendet das Folgen; zoomen geht weiter mit dem Mausrad
- 3D: Fliegende Hubschrauber sind schon beim Herauszoomen (ab Zoomstufe 12,5) als Modell zu sehen, vergrößert, statt nur als Punkt; 3D-Modelle lassen sich anklicken
- Karte: Krankenhäuser, Dienststellen, POIs und Fahrzeuge werden beim Herauszoomen kleiner (Krankenhäuser als kleine rote Punkte, das „H“ erst beim Hineinzoomen)
- KT-Maske einheitlich für Krankentransporte und Überstellungen: Anrufer → Patient → Fahrt → Transport → Code; ob es eine Überstellung ist, ergibt sich aus Abholort und Ziel (Krankenhaus → Krankenhaus); Sitzen/Liegen und Dringlichkeit als Knöpfe
- Dienstfahrten entfernt

## 0.11.0 – Überstellungen
- Überstellungen zwischen Krankenhäusern mit den SEK-96-Codes: geplant (SEK-96K1–K3), SOFORT (!), mit SRTW (K6/B6), notarztbegleitet (D6, mit SNAW), mit Hubschrauber (K7/D7-ITH) und Inkubator-/Kinderüberstellungen (D8, K8)
- Medizinisch stimmige Fälle: das abgebende Haus hat etwas nicht (Herzkatheter, Thrombektomie, Neurochirurgie, Herzchirurgie, Verbrennung, Neonatologie, Kinderintensiv, Psychiatrie, Geriatrie …), hat kein Bett frei, oder der Patient kommt zurück ins Heimatkrankenhaus; dazu Untersuchungen in einem anderen Haus mit Rückfahrt
- Fahrzeugvorschlag nach Code: SKTW ohne Sondersignal, SRTW mit Sondersignal oder Monitoring, SNAW wenn ein Notarzt nötig ist, ITH oder SNAW bei Inkubator/Kind; bei langen Strecken (über ca. 30 min) der Hubschrauber, außer der Patient ist instabil. Der normale Rettungsdienst steht darunter als Ersatz, wenn nichts Passendes frei ist – bei Notarzt-Überstellungen RTW/SRTW mit einem NEF, das mitfährt
- Dringliche Überstellungen kommen immer als Anruf (meist vom Arzt der Station) über die KT-Hotline, geplante meist als Online-Anmeldung; neue Fragen: Dringlichkeit, Notarzt, Monitoring/beatmet, stabil, Inkubator/Kind, Übernahme zugesagt
- Alle Krankentransport-Codes (KTA, KTR, KTx: 90 Krankentransport/Einweisung SOFORT, 93 Therapie, 95 Heimtransport, 96 Überstellung) und Dienstfahrten (DF-99): der Code wird aus den Angaben vorgeschlagen und kann geändert werden („↺ Vorschlag“ stellt wieder auf automatisch)
- Neu: Einweisungen durch den Hausarzt (SOFORT), Chemotherapie-Fahrten (normale Termine und einige fixe)
- KT-Liste: Filter „Alle / Krankentransporte / Überstellungen“, Codes farbig (rot = Notarzt mit Sondersignal, orange = Sondersignal, gelb = SOFORT, violett = Überstellung), dringende Überstellungen oben
- „+ Neu“ im KT-Reiter: Auftrag von Hand anlegen (Krankentransport, Überstellung oder Dienstfahrt)
- KTW, die einen Krankentransport ohne Patient fahren, stehen beim Notfall in der Liste („KT – abziehen“) und können alarmiert werden; ihre Transporte sind dann wieder offen
- Krankenhäuser: neue Bereiche Neonatologie, Kinderintensiv, Herzchirurgie, Verbrennungszentrum, Neurointervention (Thrombektomie); neue Häuser LK Mauer, LK Allentsteig, UK Hochegg, Hanusch, Klinik Penzing, Speising, Göttlicher Heiland, KUK Linz (Neuromed, Kinder), Ordensklinikum Linz (BHS, Elisabethinen), Steyr, Freistadt
- Einstellungen: Überstellungen je Stunde (Standard ca. 10 am Tag im Gebiet), Chemotherapie-Patienten mit fixem Termin
- Behoben: SKTW, SRTW, SNAW, BIT, ITH (C33), BEL und EL ÖBB waren in den Standarddaten nicht aktiv; Christophorus 2 und 9 fliegen nachts
- KT-Maske passt in die schmale rechte Spalte

## 0.10.0 – „Wollen Sie sitzen oder liegen?“ – Krankentransporte
- Neuer Reiter „KT“ links neben „Einsätze“: alle Krankentransporte mit Termin, Abholzeit, Patient, Wunsch (KTR/KTA/KTx) und Status (nicht disponiert, vorgemerkt, unterwegs, an Bord, erledigt)
- Aufträge kommen auf drei Wegen: Anruf an der KT-Hotline (eigener Klingelton, feste Abfrage – Patient, Abholort, Ziel, Termin, Grund, sitzend/liegend/gehend/Rollstuhl, Begleitperson, Sauerstoff, Infektion …), fertige Online-Anmeldung, Daueraufträge (Dialyse in drei Schichten, Strahlentherapie) – die sind schon bei Spielbeginn da, ab 16 Uhr auch für den nächsten Tag
- Hin- und Rückfahrt sind eigene Aufträge; Abholort und Ziel: Krankenhaus mit Station/Ambulanz oder eine Adresse
- Disponieren: Fahrzeugvorschläge (zuerst KTW, wenn nötig RTW/RTW-C, nie SKTW) mit „los spätestens“-Zeit; vormerken, als nächste Fahrt anhängen, Sammelfahrt (Platz wird geprüft: 2 Sitze + 1 Liege, Begleitperson braucht einen Sitz, Rollstuhl keinen, Infektion fährt allein) oder sofort schicken
- Status beim KTW: zum Berufungsort bis zum letzten Patienten, dann zum Zielort; nach Infektionstransport 5–10 min Desinfektion
- Ein KTW ohne Patient an Bord kann für einen Notfall abgezogen werden – seine Transporte sind dann wieder offen; Storno: vorgemerkt einfach, unterwegs über Funk
- Was passieren kann: Abholung dauert länger (vor allem zu Hause), Patient fährt doch nicht mit, Patient verschlechtert sich und der KTW fordert über Funk Hilfe an; kommt der Transport zu spät, ruft jemand an „Wo bleibt der Transport?“
- Krankenhäuser haben jetzt Stationen und Ambulanzen (Daten → Krankenhäuser, änderbar)
- Einstellungen: Aufkommen je Stunde für Notfälle und Krankentransporte (24-Stunden-Tabelle), Zahl der Dialyse-/Bestrahlungspatienten je Krankenhaus
- Mehrspieler: neues Recht „KT disponieren“; alle sehen die KT-Liste

## 0.9.0 – Fahrzeuge realistischer, 3D-Modelle
- Ausrückzeiten (Einstellungen → Ausrückzeiten): bodengebunden tagsüber 0,5–2 min, nachts 2–10 min; Hubschrauber tagsüber 2–5 min, nachts 5–10 min; Tag = 5–22 Uhr; frei unterwegs (Status Funk) nach ca. 10 Sekunden; Bereitschaft + 5 min
- Hubschrauber fliegen: steigen nach dem Start, sinken vor der Landung, kreisen 1–3 Mal über Einsatzorten (nicht über Krankenhäusern und Landeplätzen); in 2D zeigt ein Schatten, dass er in der Luft ist
- Neue Fahrzeugtypen: SKTW, SRTW, SNAW, BIT, ITH (Intensivtransporthubschrauber), BEL und EL ÖBB – mit Besetzungsregeln; werden aus der Fahrzeugliste erkannt (z. B. Johanniter 79/xxx)
- Sekundärfahrzeuge werden nur vorgeschlagen, wenn kein passendes Primärfahrzeug verfügbar ist; BIT und ITH nur von Hand
- BEL wird bei Großeinsätzen mit vorgeschlagen (ab 3 Rettungsmitteln oder bei schweren Verkehrsunfällen, Bränden usw.) und ist vor Ort Ansprechpartner am Funk; EL ÖBB bei Unfällen an Bahngleisen
- 3D-Fahrzeugmodelle in der 3D-Ansicht (ab Zoomstufe 16): einfache Formen nach Fahrzeugtyp (T6 Hochdach, Crafter, T6 Bus, Passat, LKW, EC135), in der Farbe der Organisation, Blaulicht blinkt bei Sondersignal und am Einsatzort, Hubschrauber mit drehendem Rotor; beim Herauszoomen wieder Punkte; abschaltbar unter „Ebenen“
- Karte lässt sich weiter hineinzoomen

## 0.8.0 – Funkverkehr
- Funk wie in NÖ: Fahrzeuge rufen „LEO von 75/001 kommen“, du antwortest mit einem Klick („Hier LEO kommen“) und bekommst die Meldung; „Verstanden, ENDE“ beendet das Gespräch
- Du kannst Fahrzeuge selbst rufen (📻 beim Fahrzeug in der Einsatzmaske oder „Fahrzeug rufen“ im Funk) und frei schreiben oder Schnellknöpfe nutzen: Lagemeldung anfordern, Status/Eintreffen, Zustand Patient, Storno
- Besatzungen melden sich von selbst: Lagemeldung beim Eintreffen (bei Verkehrsunfall, mehreren Betroffenen, Abweichungen oder auf Anforderung), Verschlechterung vor Ort, KH-Anfrage, „kein Patient an der Adresse“
- Nachforderungen (Notarzt, weitere Rettungsmittel) bleiben beim Einsatz rot sichtbar, bis genug alarmiert ist; nach 5 Minuten erinnert die Besatzung
- Storno-Empfehlung: „Notarzt nicht erforderlich, kann storniert werden“ – Storno-Knopf beim Fahrzeug auf der Anfahrt (läuft über Funk, Fahrzeug rückt ein)
- Ruft ein Fahrzeug unbeantwortet, wiederholt es den Ruf; kurzer Funk-Piep
- Freie Fragen beantwortet die Besatzung mit der KI (ohne KI: „verstanden“)
- Multiplayer: alle sehen den gesamten Funkverkehr; wer antwortet, führt das Gespräch
- Statusmeldungen stehen weiterhin darunter (aufklappbar)

## 0.7.0 – Die Lage lebt
- Jeder Notruf hat eine verborgene Lage: ein oder mehrere Patienten mit Zustand und Sichtung (rot/gelb/grün)
- Der Zustand kann sich im Lauf des Einsatzes verändern (Verschlechterung bis zum Kreislaufstillstand, Besserung z. B. nach Krampfanfall oder Ohnmacht)
- Vor dem Eintreffen erfährst du das nur vom Anrufer: im laufenden Gespräch („Moment … er atmet nicht mehr!“) oder als Folgeanruf zum selben Einsatz
- Anrufer können sich irren: „Reanimation“, die keine ist, oder mehr Betroffene als gemeldet
- Beim Eintreffen meldet die erste Besatzung Abweichungen über Funk (z. B. „Keine Reanimation“, „4 Betroffene statt 1, 1× rot, 1× gelb, 2× grün – benötigen weitere Rettungsmittel“); spätere Veränderungen ebenso
- Reanimation vor Ort dauert länger
- Einstellung „Komplikationen“: ruhig / normal / fordernd (Einstellungen → Einsatzaufkommen)
- Medizinisch plausiblere Fälle (z. B. keine Geburt mit 60, keine Schwangerschaft beim Mann)
- Auflösung zeigt, was tatsächlich vor Ort war, und den Verlauf

## 0.6.2
- Anrufer passend zum Kapitel: 38 Landesleitzentrale der Polizei (für eine Streife vor Ort), 33 Pflegekraft eines bestimmten Heims bzw. Arzt/Telemedizin/141, 42 andere Leitstelle (Feuerwehr, Bergrettung, Wasserrettung, Nachbarbundesland) mit Kurz-Lagebild, 34 eCall mit automatischer Ansage (Fahrzeug, Fahrtrichtung, Insassen, Position)
- Kapitel 42: keine Abfrage – nur den passenden Code wählen
- KI bleibt bei der Wahrheit: der Zustand ändert sich im Gespräch nicht, Suggestivfragen werden korrigiert, „falls“-Anweisungen nur bestätigt, unpassende Anweisungen hinterfragt, keine Wiederholungen
- „Was ist passiert?“: Die Kernaussage kommt vom Programm und passt immer zu den Fakten
- „Wer ruft an?“: Anrufer nennt seine Rolle (Tochter, Pflegekraft …)
- Auflösung: oben die Lage in einem Satz und der Patient (z. B. „Mann, ca. 71 J., wach, atmet schwer“); ein Kapitelwechsel zählt nicht als Fehler, wenn er zum richtigen Code führt

## 0.6.1
- KI-Anrufer reden menschlicher: Alltagssprache statt Fachbegriffe, nur das, wonach gefragt wird, kurze Antworten; auf „Wo ist der Notfallort?“ kommt die Adresse (bei Panik vorher ein Ausruf)
- Nach dem Gespräch: Knopf „Auflösung zeigen“ – was wirklich war (Kapitel, Code, Anrufer) im Vergleich zu deinen Eingaben
- Code selbst suchen: ein selbst gewählter Code wird von der Abfrage nicht mehr überschrieben; der Vorschlag der Abfrage lässt sich per Knopf übernehmen
- Einsatzort: „Genannte Adresse übernehmen“ und „📡 Ortung“ (GPS oder Funkzelle mit Genauigkeit, als Einsatzort übernehmbar)
- Manche Notrufe kommen von Leuten, die nicht genau wissen, wo sie sind (Berg, Wald, Wasser, Freilandstraße)
- Info an RTW: Geschlecht, Alter, B und A aus der Abfrage stehen automatisch vorne (z. B. „m 67J B~ A+“), eigener Text folgt nach „//“
- Liste: bei verpassten Anrufen steht die Anzahl der Versuche

## 0.6.0 – KI-Anrufer und Abfrage
- Abfrageschema (JSON) laden unter Daten → Einsatzcodes (oder direkt im Import-Fenster); die Codes darin werden mit übernommen
- Mit Abfrageschema kommen Einsätze als Notruf: Anruf klingelt (mit Klingelton), annehmen in der Liste oder in der Maske
- Gespräch mit dem Anrufer: frei tippen oder mit 🗨 die Frage aus dem Schema stellen; die Antworten trägst du per Knopf ein
- Der Code ergibt sich live aus der Abfrage, inklusive Kapitelwechsel, Aufwertung, Zusatzkennung und Reanimationshinweis
- Anrufer passend zur Lage, aber jedes Mal anders: Patient selbst, Angehörige, Passanten, Pflegepersonal, Hausarzt … – ruhig, aufgeregt, panisch, Dialekt oder gebrochenes Deutsch
- Nicht angenommene Anrufe legen auf („Verpasster Anruf“ mit Rückruf); nach 2–3 Minuten ruft der Anrufer selbst wieder an
- Bei Pause klingelt nichts und die Wartezeit läuft nicht weiter
- Multiplayer: wer zuerst annimmt, führt das Gespräch; alle anderen sehen mit und dürfen trotzdem Fahrzeuge alarmieren. Ist der Gesprächsführer getrennt, kann jemand übernehmen
- Einstellungen → „Notrufe und KI-Anrufer“: Ollama installieren und starten, Sprachmodell laden, Testanruf. Ollama startet automatisch mit LeitWerk
- Ohne KI antwortet der Anrufer mit einfachen Sätzen

## 0.5.1
- Karte: Umschalter „2D | 3D“ und „Karte | Satellit“ zeigen immer, was aktiv ist
- 3D ist ausgegraut, solange das Paket „Gelände (3D)“ fehlt – mit Hinweis und Link zu den Kartenpaketen
- Satellitenbild: Orts- und Straßennamen hell mit dunklem Rand, gut lesbar
- Ebenen-Liste einklappbar, mit Farblegende
- Dienststellen in der Farbe ihrer Organisation (Rotes Kreuz, ASB, Johanniter, ÖAMTC …); Fahrzeuge auf der Wache werden nicht mehr einzeln angezeigt, ein Klick auf die Wache zeigt sie mit Status
- Unterwegs steht bei jedem Fahrzeug der Funkrufname
- Multiplayer: Host-Rolle übergeben bzw. anfragen, ohne dass jemand die Verbindung verliert
- Multiplayer: Antwortzeit (Ping) je Spieler, Meldung wenn jemand die Verbindung verliert oder zurückkommt
- Multiplayer: Adresse eines anderen Spielers aktualisiert jetzt auch die Fahrzeugvorschläge
- Multiplayer: klare Meldung, wenn ein anderer Spieler inzwischen Host ist, mit Angebot als Mitspieler beizutreten

## 0.5.0 – Multiplayer
- Knopf „Spiel“ oben: Spiel hosten oder mit 6-stelligem Code beitreten (bis zu 6 Spieler)
- Der Host teilt Leitstelle, Einsatzcodes und Einstellungen automatisch mit allen
- Rechte je Spieler: Disponieren, Simulation steuern, Einstellungen & Daten (Standard: alles außer Einstellungen)
- Chat zwischen den Disponenten (Reiter „Chat“ rechts)
- Wer an einem Einsatz arbeitet, steht in der Liste; nach Verbindungsabbruch als „Entwurf“, den andere übernehmen können
- Verbindungsabbruch: automatisch neu verbinden; ist der Host weg, pausiert das Spiel für alle
- Host verlässt das Spiel: Mitspieler können speichern oder „Als Host übernehmen“
- Spielstand speichern und laden (für alle), automatische Sicherung jede Minute

## 0.4.2
- Test der Update-Funktion: Wenn du das hier liest, hat das Update aus der App heraus funktioniert 🎉

## 0.4.1
- Beim ersten Start der Simulation erscheint „Einsatzcodes importieren“, falls noch keine Liste geladen ist
- Die Liste kann jederzeit unter Daten → Einsatzcodes importiert, bearbeitet und gelöscht werden

## 0.4.0
- Programm-Updates direkt in der App („Neue Version verfügbar“)
- Karten als Pakete: kleines Programm, Grundpaket beim ersten Start, Detailkarten und Gelände zum Nachladen (Einstellungen → Kartenpakete)
- Satellitenbild (2D): amtliches Orthofoto von basemap.at, wird online geladen
- Einsatzcodes als eigene Liste: Import per CSV (Daten → Einsatzcodes), bearbeiten und löschen; LeitWerk liefert keine Codeliste mehr mit

## 0.3.1
- Besetzung je Fahrzeugtyp, änderbar per Rechtsklick
- KTW fahren Einsätze
- Einsatzmittelvorschlag nach Rangfolge, NFS-Pflicht und Notarzt-Regel
