# Änderungen

## 0.84.0 – Anleitungen, Wissensstufen, besondere Anrufe, Schwere einstellbar
- **Anleitungen am Telefon wie echt:** Wie Anrufer auf Anleitungen reagieren, ist jetzt einmal allgemein hinterlegt – Herzdruckmassage (erst hinknien, dann drücken und mitzählen, Lautsprecher, Schnappatmung macht unsicher, nach einer Weile werden die Arme schwer, Ablöse, wenn jemand da ist), Blutung, Seitenlage, Fremdkörper, Geburt, Lagerung, Zucker
- Ein Fall legt nur fest, was bei ihm anders ist: z. B. „Anrufer alt und schwach“, „Patient liegt im Bett“, „traut sich zuerst nicht“, „kein Tuch da“, „Fremdkörper kommt beim 2. Versuch heraus“, „Baby schreit nicht gleich“ – im Fall-Editor unter „Wenn die Leitstelle anleitet“
- **Was der Anrufer weiß:** je Antwort „weiß es“, „nur ungefähr“ („ich glaub …“) oder „weiß es nicht“ – im Fall-Editor neben jeder Antwort. Passanten wissen z. B. keine Vorerkrankungen
- **Besondere Anrufe:** Hosentaschenanruf (nur Rascheln), Scherzanruf (nach der Belehrung legt der Anrufer kleinlaut auf), „bewusstlos“ gemeldet – aber betrunken, Rauferei unter Betrunkenen, Ehefrau, deren Mann mit Fieber es „sooo schlecht“ geht, Taxifahrer mit kollabiertem Fahrgast, Ärztefunkdienst vom Hausbesuch
- **Schwere der Notfälle einstellbar:** Einstellungen → Einsatzaufkommen → „Schwere der Notfälle“ (Standard 35 % harmlos, 50 % mittel, 15 % kritisch)
- **Bessere Prüfung:** Das Prüfprogramm meldet mehr (Sichtung passt nicht zur Dringlichkeit, unbekannte Abweichungen, Anrufer passt nicht zum Alter …); der Testlauf meldet zusätzlich vorgelesene Antwort-Etiketten, Antworten gegen die Wissensstufe und eine Stimmung, die nicht zur Lage passt
- Kleiner Fehler im Fall „Reitunfall“ behoben

## 0.83.0 – Abfrage: Fragen bleiben stehen, Drogen/Medikamente-Frage, sinnvollere Krankentransporte
- **Notruf-Abfrage:** Beantwortete Fragen bleiben unter der aktuellen stehen – die neueste oben, die erste (Einsatzort) ganz unten. Jede zeigt nur die gewählte Antwort; ein Klick klappt alle Antworten zum Ändern auf
- Übersprungene Fragen stehen grau mit „nicht gefragt“ dabei und lassen sich nachholen
- Die Satz-Liste in der Abfrage ist weg – das Protokoll steht wie gewohnt beim Einsatz
- **Ortung** wird auch bei pausiertem Spiel nach ein paar Sekunden fertig
- **„📍 Genannte“** wird aktiv, sobald der Anrufer die Adresse sagt, und übernimmt nur Straße, Hausnummer, Postleitzahl und Ort
- **Brustschmerz und Herzbeschwerden:** statt „Kokain genommen?“ jetzt „Drogen oder Medikamente in den letzten 12 Stunden?“ (Medikamente / Drogen / keine), bei Drogen „Welche Drogen?“ – nur Kokain ändert den Code, der Rest steht als Info in der Abfrage
- **Krankentransporte sinnvoller:** Wohnadressen sind echte Hausadressen; Abholung aus einer Ordination oder einem Pflegeheim ist als solche gekennzeichnet („bei uns in der Ordination“ statt „zu Hause“); Abholort und Ziel sind nie dasselbe Haus; Ziel ist das nächste passende Haus, kein weiter Umweg

## 0.82.0 – Neue Abfrage-Ansicht: Notruf Frage für Frage, KT/SEK aufgeräumt
- **Notruf Frage für Frage:** Rechts steht immer nur die nächste Frage groß, mit Antwortknöpfen (Tasten 1, 2, 3 …). Leertaste stellt die Frage, Enter überspringt, ↑ geht zurück
- **Protokoll wie in echt:** Darunter wächst die Abfrage als nummerierte Sätze („1. Er ist wach und reagiert normal.“). Ein Klick auf einen Satz holt die Frage zurück, die Antwort lässt sich ändern
- **Neue Reihenfolge:** Ort → Rückrufnummer → Wer ruft an / beim Patienten? → Bewusstsein und Atmung → Was ist passiert?
- **„Was ist passiert?“ wählt das Kapitel:** Die Worte des Anrufers ins Feld schreiben („er ist umgekippt“, „von der Leiter gefallen“) – darunter erscheinen die passenden Kapitel, Enter nimmt das erste
- **Lange Antwortlisten** (z. B. Hauptbeschwerde bei „Kranke Person“) haben ein Suchfeld
- **Rückrufnummer:** Die angezeigte Nummer ist jetzt dieselbe, die der Anrufer nennt. „Nummer übernehmen“ trägt sie auch in die Abfrage ein, im Feld fügt ⤵ (oder die Taste Einfg) sie ein. Zurückrufen geht nur mit eingetragener Nummer (abschaltbar in den Einstellungen)
- **KT und Überstellung aufgeräumt:** Abschnitte als Karten, ✓/○ zeigt, was schon da ist, oben steht nur die nächste offene Frage (🗨 Fragen / ✓ erledigt) statt der langen Fragenleiste
- **Neue Angaben bei Krankentransporten:** Transportart (Hin-/Rücktransport, Dialyse, Therapie, Einweisung, Entlassung), Behandlung, einfacher oder qualifizierter KT, bis zum Fahrzeug gehfähig, Hygienemaßnahme, Transportauftrag und Krankenkasse – die Anrufer kennen die Antworten
- **Bisherige Ansicht** bleibt wählbar: Einstellungen → Anrufer und Verlauf → Abfrage-Ansicht

## 0.81.0 – Anrufer realistischer: kein Dialekt, Alltagssprache, Panik nach Regeln
- **Kein Dialekt und kein gebrochenes Deutsch mehr** – das klang oft nach Kauderwelsch. Österreichische Alltagswörter („Grüß Gott“, „Stiege“, „Kassa“) bleiben, Atemnot-Pausen und ein „Au“ bei Schmerzen auch
- **Alltagssprache statt Formular:** Anrufer lesen keine Antwort-Stichworte mehr vor („Andere Substanz“, „drei bis neun Meter“, „Hauptbeschwerde …“), sondern sagen es so, wie Leute es sagen
- **Aufregung nach Regeln:** Eltern und Angehörige bei Lebensgefahr sind panisch (hörbar: Satzfetzen, „Bitte, schnell!“), Passanten aufgeregt oder gefasst, Pflege und Ärzte sachlich, bei Harmlosem bleibt man ruhig – kein „Sie müssen sofort kommen!“ beim Fingerschnitt mehr
- „Unsicher“ heißt jetzt nur noch unsicher beim Beobachten (Atmung, wie schlimm) – nie bei Adresse, Name oder Alter der Angehörigen
- Anrufer sprechen zwischendurch kurz mit dem Patienten („Bleib ruhig, ich bin da“) – aber nicht mehr „Die Rettung kommt gleich!“, bevor überhaupt jemand alarmiert ist
- Wer sonst noch da ist, passt jetzt: keine Schaulustigen im Pflegeheimzimmer, die Mutter des Kindes hat nicht „ihren Sohn“ als Helfer, wenn der Sohn der Patient ist
- Gefährlicher Ort (Gärgas, Rauch, Strom): der Anrufer geht nicht hin, auch wenn man ihn darum bittet
- Benommene Patienten (Unterzucker) bekommen auf Anweisung ein paar Schlucke Süßes – nur wer gar nicht reagiert, bekommt nichts
- Fragen wie „Kann er die Arme normal bewegen?“ werden richtig herum verstanden
- Beim Einstieg „Hallo? Bin ich bei der Rettung?“ wird die Rückfrage nicht mehr weggebessert; die Adresse geht nicht mehr verloren
- **Die neuen Fälle aus 0.80 korrigiert** (u. a. Nasenbluten, Wespenstich, Fieberkrampf, Spielplatz, Tabletten, Arbeitsunfall, Rauferei, Augenverätzung, Blutdruck); Bademeister, Busfahrer und Tierpflegerin reden über sich in der Ich-Form
- Testlauf: passende Fragen je Alter (keine Schwangerschaft bei Kindern), weniger Fehlalarme bei „sagt etwas zum zweiten Mal“, Vorher/Nachher bei Bewusstsein und Atmung im Export

## 0.80.0 – Fälle überarbeitet: Symptom und Dringlichkeit, 25 neue Notfälle, Überstellungen nach Öffnungszeiten
- **Jeder Fall hat Symptom und Dringlichkeit hinterlegt** (stabil/grün, dringend/gelb, Schockraum/rot). Danach meldet die Besatzung und bucht der RTW. Verschlechtert sich der Patient auf rot, wird hochgestuft
- **Fall-Editor:** Symptom und Dringlichkeit statt der alten Verdachtsdiagnose; die Prüfung meldet Symptome oder Dringlichkeiten, die es nicht gibt
- **25 neue Notfälle**, die bisher fehlten: Herzrasen, sehr hoher Blutdruck, Atemnot bei Herzschwäche und bei COPD, Pseudokrupp, Bauchschmerzen, Nierenkolik, Harnverhalt, Wespenstich mit Allergie, Nasenbluten, Bluterbrechen, Verbrühung, Kollaps bei Hitze, Unterkühlung, Fieberkrampf, Kind mit hohem Fieber, älterer Mensch sehr schwach, Schwindel, plötzlich stärkste Kopfschmerzen, Kind vom Klettergerüst, Arbeitsunfall an der Hand, Rauferei, Messerstich, Tabletten genommen, Spritzer ins Auge
- **Häufigkeit der Fälle** näher an echten Einsatzzahlen (mehr Herz/Kreislauf und Stürze, weniger „Sonstiges“)
- Kleinere Fehler in zwei Fällen behoben (Schnittwunde, Badesee)
- **Überstellungen nach Öffnungszeiten:** Akut-Überstellungen ins Zentrum (Herzkatheter, Thrombektomie, Neurochirurgie …) entstehen, wenn das eigene Haus es gerade nicht kann – z. B. Krems am Donnerstagabend ohne Herzkatheter. Ziel ist das nächste Haus, das jetzt offen hat
- **Krankentransporte passen zum Grund:** Lage (z. B. Nahtentfernung gehfähig, Dekubitus liegend), Sauerstoff mit Menge, Isolation mit Keim (MRSA, Noro …), Einweisungen in die passende Abteilung

## 0.79.0 – Kinder in Häuser mit Kinderabteilung
- **Kinder nur in Häuser mit Kinderabteilung:** Für Kinder passt ein Haus nur, wenn es das Nötige auch für Kinder hat – z. B. Unfallambulanz und Kinderabteilung, bei Schädel-Hirn-Trauma Neurochirurgie und Kinderabteilung. Gilt für alle Dringlichkeiten gleich
- Häuser, die es nur für Erwachsene können, erscheinen als **„⚠ Ausweich – keine Kinderabteilung“** (gestrichelt) und werden nur genommen, wenn kein passendes Haus offen ist
- Ausnahme: Geburt und Schwangerschaft gehen wie bei Erwachsenen in die Geburtshilfe
- **Altersgruppen neu:** Kleinkind/Neugeboren (unter 1 Jahr), Kind (1–17), Erwachsener (ab 18)
- Fenster „KH-Aufnahme“: Mit Altersgruppe „Kind“ zeigt ~ jetzt, wo ein Haus Kinder nur als Ausweich nimmt

## 0.78.0 – Krankenhaus-Zuweisung nach Symptom, Altersgruppe und Dringlichkeit
- **Neue Zuweisung bei Notfalleinsätzen** (nicht bei Krankentransporten und Überstellungen): Jeder Patient hat ein **Symptom** (121 Symptome in Gruppen, mit Suchbegriffen), eine **Altersgruppe** (Kleinkind 0–4, Kind 5–17, Erwachsener) und eine **Dringlichkeit** (stabil, dringend, Schockraum/Intensiv)
- **KH buchen in der Einsatzmaske:** Symptom suchen (auch mit anderen Begriffen, z. B. „Herzinfarkt“) → Altersgruppe → Dringlichkeit (nur die möglichen) → die **drei nächsten passenden Häuser, die gerade aufnehmen**, mit freien Plätzen. Jedes andere Haus bleibt wählbar
- **Die Besatzung meldet** Symptom und Dringlichkeit über Funk (z. B. „Atemnot, dringend“) und bucht selbst nach denselben Regeln
- **Schockraum:** Häuser mit Schockraum nur für Trauma oder nur internistisch nehmen nur diese Patienten; kombinierte Schockräume beide. Ein Schockraum-Patient braucht auch, was dahinter nötig ist (z. B. Neurochirurgie bei Schädel-Hirn-Trauma)
- **Zeiten:** Herzkatheter, Thrombektomie und weitere Bereiche mit Wochentagen und Uhrzeiten (z. B. Krems Mo–Fr 7–15 Uhr, Mittwoch rund um die Uhr; Wiener Herzkatheter tageweise wechselnd; Wr. Neustadt und Eisenstadt im Wechsel)
- **Neues Fenster „KH-Aufnahme“** (Fenster-Menü oder „Mehr Info“ beim Krankenhaus → „Aufnahme bei Notfällen“): Öffnungszeiten der Akut-Bereiche bearbeiten, je Symptom und Dringlichkeit sehen, ob das Haus aufnimmt, und einzeln ein- oder ausschalten. Jede Einstellung zeigt, woher sie kommt (recherchiert, Annahme, von Paul, von dir geändert), mit „Zurück auf Vorgabe“
- **Lücken prüfen:** zeigt Symptome, für die im Umkreis von 60 km zu bestimmten Zeiten der Woche kein Haus aufnimmt
- Im Multiplayer gelten die Einstellungen des Hosts

## 0.77.0 – Übergabe NAH/RTW, Vorlesen, Multiplayer-Check, Hauptmenü im Vollbild
- **Übergabe Notarzthubschrauber ↔ RTW:** Bei kritischen Patienten entscheidet der Notarzt am Einsatzort: Ist das passende Krankenhaus weit weg (über 20 km) und darf der Hubschrauber fliegen, fliegt der NAH den Patienten (Krankenhaus mit Landeplatz) und der RTW meldet sich nach der Übergabe frei. Sonst übergibt der Notarzt an den RTW, der RTW transportiert und der NAH ist frei. Beim Spieler-NAH entscheidet der Pilot – der RTW wartet auf seine Entscheidung
- Behoben: Transportierte der NAH, fuhr der RTW trotzdem mit zum Zielort
- **Vorlesen:** Funkrufnamen mit Pause („69/902“ → „69 – 902“), Postleitzahlen geteilt („3481“ → „34 – 81“, „3500“ → „35 hundert“), Telefonnummern Ziffer für Ziffer – am Funk und am Telefon
- **Multiplayer:** Beitreten nur mit derselben LeitWerk-Version und denselben Kartenpaketen wie der Host. Sonst erscheint, was fehlt – mit Knopf zum Update bzw. zu den Kartenpaketen
- **Hauptmenü im Vollbild**, danach wieder die Fenstergröße von vorher

## 0.76.0 – RD und KT/SEK getrennt, Fahrzeugsuche, neue Fahrzeugwahl bei Transporten, Fahrzeug-Info auf der Karte
- **Notruf (RD) und Krankentransport/Überstellung (KT/SEK) getrennt:** eigene Sätze für beide Bereiche, einzeln wählbar (z. B. eigene RD-Codes mit den eingebauten Transportcodes). Ordner in Dokumente/LeitWerk: `Abfrageschema/RD`, `Abfrageschema/Krankentransport_Sekundärtransporte`, `Codelisten/RD`, `Codelisten/Krankentransport_Sekundärtransporte`. Der KT-/SEK-Editor speichert Codes und Abfrage in die KT/SEK-Ordner
- **Einmalig mit diesem Update:** bisherige eigene Sätze werden entfernt und müssen getrennt neu hinzugefügt werden
- **Fahrzeugsuche** in der Einsatzmaske und bei Transporten: nach Funkrufname (auch ohne „/“, z. B. 75001), Wache oder Typ – zeigt alle Fahrzeuge mit Status
- **Fahrzeugwahl bei Krankentransporten und Überstellungen:** immer eine Liste nach Einsatzmittelvorschlag und Fahrzeit (Ersatz markiert), dazu die Suche für jedes andere Fahrzeug. **Alarmieren** (fährt sofort) oder **Vormerken** (fährt zur richtigen Zeit selbst los)
- **Zu früh am Abholort:** Ist ein Fahrzeug mehr als 30 Minuten vor der Abholzeit dort, funkt es die Leitstelle an – **warten** (bis der Patient fertig ist) oder **frei melden** (zurück zur Dienststelle, der Transport steht wieder undisponiert). Antwort über Funk oder Knopf in der Maske
- **Mehrfachtransport:** Solange ein Fahrzeug noch keinen Patienten an Bord hat, kann ein weiterer Transport dazu – auch Überstellungen, nicht mit Blaulicht oder Notarzt. Das Fahrzeug fährt die kürzeste Reihenfolge (z. B. beide abholen, dann beide abliefern)
- **Fahrzeug-Info auf der Karte:** Klick auf ein Fahrzeug zeigt Funkrufname, Typ, Wache, Status, Einsatz mit Ziel und Ankunft – ohne etwas anderes zu öffnen. „Zum Einsatz“ wählt den Einsatz in der Liste der aktuellen Einsätze
- Behoben: Die Einstellungen konnten hängen bleiben, wenn auf dem Computer keine deutsche Vorlesestimme installiert ist

## 0.75.0 – KT-Abfrage frei gestalten, SNAW-Code nach Fahrzeug
- **Abfrage-Editor neu:** Fragen der KT-Hotline einfügen, umformulieren, löschen und in der Reihenfolge verschieben (↑↓ oder ziehen). Bei jeder Frage wählst du die Art – **Code-bestimmend** (Lage, Zeit, Notarzt, Überwachung, Inkubator, Organisation, Abholort, Ziel, stabil?) oder **Zusatzinfo** (Name, Termin, Abholzeit, Begleitperson, Sauerstoff, Infektion …) – und was sie genau klärt
- Die Prüfung meldet Fragen ohne Text oder ohne Auswahl und fehlende Pflichtangaben (Abholort, Ziel, Lage, Termin oder Abholzeit)
- In der Aufnahme stehen die Fragen des Codesatzes in ihrer Reihenfolge als Leiste; 🗨 bei einem Feld stellt die erste Frage, die es klärt
- **SOFORT-Überstellung mit Notarzt:** Schickt man den SNAW (weil er frei und schneller ist), gilt automatisch der SNAW-Code; mit RTW + NEF bzw. Hubschrauber der passende andere. Damit werden alle eingebauten Codes auch automatisch gewählt

## 0.74.0 – Krankentransport- und Überstellungs-Codes über Bedingungen, mit Editor
- **KT-/SEK-Codes über Bedingungen:** Was ein Code bedeutet, steht in festen Bedingungen (Organisation, Fahrt, Therapie, Lage, Zeit, Heimtransport, Begleitung, Fahrzeug, Sondersignal, Inkubator). Ein Code ist nur ein frei wählbarer Name mit diesen Bedingungen; aus den Angaben eines Auftrags gilt genau der eine passende Code
- **Eigene eingebaute KT-/SEK-Codes** (KTR/KTA/KTx-90/93/95 …, SEK-96 …) mit eigener Unterteilung und eigenen Namen. Eigene Codesätze bringen ihre Codes im Abschnitt „kt“ des Abfrageschemas mit
- Überstellungen sind immer SEK-Codes; NAH/ITH nur bei sofortigen Überstellungen; SOFORT heißt „sofort los, ohne Blaulicht“
- **Editor** (Einstellungen → Einsatzcodes & Abfrage → Eigene Codes & Abfrageschema → KT-/SEK-Codes & Abfrage bearbeiten): Codes anlegen, benennen, Bedingungen wählen; Fragen der KT-Abfrage ein-/ausschalten und umformulieren
- **Laufende Prüfung:** Jede Kombination, die im Spiel vorkommen kann, braucht genau einen Code; doppelte Bedingungen, fehlende Pflichtfragen und Unterscheidungen ohne passende Frage werden gemeldet. „Code anlegen“ übernimmt eine fehlende Kombination. Mit offenen Problemen nur als Entwurf speicherbar – Entwürfe sind nicht spielbar
- Passt im Spiel kein Code zu den Angaben, zeigt die Aufnahme das deutlich an (statt zu raten)

## 0.73.0 – Eigenes Codesystem, eigene Codesätze, Entwicklungsfortschritt und Changelog
- **Eingebautes Codesystem ab der Installation:** Codes im gewohnten Aufbau `RD-<Kapitel><Stufe><Nr>` (Stufen O–E), gewohnte Kapitelnummern und Kategorien (ALS rot, ALS orange, ALS gelb, ALS grün, BLS rot, BLS gelb, Telemedizin …) – mit eigener Abfrage, eigenen Namen und eigener Unterteilung. Die Kategorien sind je Kapitel und Stufe ähnlich verteilt wie gewohnt
- **Hinweis im Menü Einsatzcodes & Abfrage:** Die echten Codes dürfen aus rechtlichen Gründen nicht mitgeliefert werden – eigene können eingebaut werden
- **Eigene Codes & Abfrageschema:** ein Fenster mit zwei Feldern (Codeliste als CSV, Abfrageschema als JSON), einzeln oder zusammen. Gespeichert in Dokumente/LeitWerk (Codelisten, Abfrageschema); mehrere Sätze, zwischen denen man wechseln kann; das eingebaute System ist immer wählbar. Im Multiplayer gilt der Satz des Hosts
- **Einmalig mit diesem Update:** bisher importierte Codelisten und Abfrageschemas werden entfernt (auch die Dateien in Dokumente/LeitWerk) – danach gilt das eingebaute System, eigene lassen sich neu hinzufügen. Abfrageschemas werden nicht mehr automatisch aus dem Ordner geladen
- **Hauptmenü – Entwicklungsfortschritt:** woran gerade gearbeitet wird und was geplant ist, jeweils mit Fortschrittsbalken (live, ohne Update änderbar), dazu „Idee oder Wunsch schicken“ (landet als Ticket)
- **Hauptmenü – Changelog:** alle Updates kompakt mit Titeln, durchsuchbar
- Ticket-Dienst: Entwicklungsfortschritt auf der Admin-Seite pflegbar, neue Ticket-Art „Idee/Wunsch“

## 0.72.0 – Spieler-NAH: Sprechfunk (Teil 3)
- **Sprechfunk zwischen Pilot und Leitstelle:** Sprechtaste gedrückt halten und sprechen – die Stimme geht live an alle im Spiel (Verzögerung etwa eine halbe Sekunde) und klingt wie über Funk (blechern, kurzes Rauschen beim Loslassen; abschaltbar)
  - **Leitstelle:** eigene **Funktaste F4** (umstellbar unter Einstellungen → Sprache & Mikrofon) oder der Knopf **Sprechfunk** im Funkfenster. Geht auch während eines Telefonats; F2 bleibt für Notruf, KT und den KI-Funk
  - **Pilot:** **Leertaste** im Piloten-Fenster, **Strg + Umschalt + F** auch bei MSFS im Vordergrund, eine **Joystick-Taste** oder die Sprechtaste am **Handy** – alles umbelegbar im Fenster „Tasten“
- **Ein Kanal für alle, nichts wird unterbrochen:** Während jemand spricht oder ein Gespräch läuft, kommt ein kurzer Doppelton und der Hinweis „Funk belegt“. Gespräche zwischen Menschen enden wie bisher mit „verstanden“, „Ende“ oder „danke“ am Schluss oder nach 30 Sekunden Stille; die Fahrzeuge der KI warten so lange
- **Text im Funkfenster:** Was gesprochen wird, erkennt Whisper beim Sprecher und schreibt es ins Funkfenster und ins Einsatzprotokoll (🎙 = gesprochen). Der Pilot lädt das Sprachmodell einmal unter **Sprechfunk → Einstellungen**
- **Pilot ↔ RTW:** Im Anflug funkt der Pilot mit der Sprechtaste **RTW** (Standard **R**, global Strg + Umschalt + R) das Bodenfahrzeug am Einsatzort an. Der RTW meldet sich und antwortet über die Funk-KI: Landemöglichkeit, Zustand des Patienten, Werte, Verdacht, Eintreffen
- **Am Einsatzort funkt der Pilot:** Steht der Spieler-NAH auf Status 3, funkt kein anderes Fahrzeug dieses Einsatzes die Leitstelle an (es wartet bis Status 4 bzw. 6)
- **Der Pilot hört mit:** den übrigen Funkverkehr der Fahrzeuge leiser im Hintergrund (abschaltbar, eigene Lautstärke), alles, was ihn betrifft, in voller Lautstärke. Spricht die Leitstelle mit F2 mit einem KI-Fahrzeug, hört der Pilot ihre echte Stimme
- **Funkfenster der Leitstelle:** zeigt, wer gerade spricht, und einen Ruf des Piloten („C2 ruft LEO“) mit Knopf **Sprechen**
- Das Programmfenster läuft im Hintergrund ungebremst weiter (wichtig, wenn der Flugsimulator vorne ist)

## 0.71.0 – Spieler-NAH: HPG H145 – Tablet und Funkgerät
- **Einsatz aufs Tablet der HPG H145:** LeitWerk ist jetzt ein „Mission Server“ für das Missionssystem der H145. Einmal im Piloten-Interface **H145 einrichten** (legt die Mission „LeitWerk Leitstelle“ an und baut den Missions-Index neu), dann am Tablet **Missions → Library → LeitWerk Leitstelle** wählen. Danach:
  - **Alarm poppt am Tablet auf** – Stichwort, Adresse, Info – mit **Quittieren**
  - **Route automatisch:** Magenta-Linie und Peilzeiger zum Einsatzort, kurz vor dem Ziel die Schwebeanzeige; nach der Zielwahl zum Landeplatz des Krankenhauses
  - **Am Einsatzort:** Patient liegt als Figur am Boden, die Crew kniet daneben. Am Tablet das **Patientenblatt** und die Entscheidung: transportieren (die 3 passenden Krankenhäuser mit Landeplatz), Übergabe an den RTW (mit/ohne Notarzt) oder kein Transport. Beim Transport liegt der Patient auf der Trage
  - unten in der Missions-App: aktueller Status und Einsatznummer
- **Quittieren (Status 9 „Alarmiert und quittiert“):** Alarm angenommen – einsteigen, Rotor starten; Status 2 beim Abheben. Am Tablet, mit Taste **9** oder Strg + Umschalt + 9
- **Status über das CARLS-Funkgerät** in der Mittelkonsole der H145: die Ziffern 1–6 und 9 setzen den Status (über MSFS). Passt die Belegung nicht, im Fenster **Tasten** in der Spalte „H145-Funkgerät“ anlernen – Feld anklicken, Taste im Cockpit drücken

## 0.70.1 – Spieler-NAH: Flugplan fürs GTN750, Ruhe für den Piloten
- **Piloten-Interface:** keine Töne mehr von Notrufen, KT-Hotline, Funkrufen und Warnungen der Leitstelle – der Pilot hört nur seine Alarmierung und den Chat
- **Flugplan (.pln) repariert:** Start und Ziel heißen jetzt wie bei MSFS selbst (eigener Start/eigenes Ziel), Dateiname und Texte ohne Sonderzeichen – der Import auf der Weltkarte sollte damit klappen
- **PMS50 GTN750 (Premium):** LeitWerk legt den Flugplan bei der Alarmierung (zum Einsatzort) und nach der Zielwahl (zum Landeplatz des Krankenhauses) automatisch ins GTN. Im GTN nur noch **Flight Plan → Menu → Import**. Dazu die Wegpunkte **LWBO** (Einsatzort), **LWKH** (Krankenhaus) und **LWBAS** (Stützpunkt) für Direct-To (Waypoint Info → Import Waypoints)
  - Den Community-Ordner findet LeitWerk selbst (Store und Steam); sonst im Piloten-Interface einmal wählen. Abschaltbar unter „Flugsimulator“

## 0.70.0 – Spieler-NAH: Microsoft Flight Simulator (Teil 2)
- **Verbindung zum MSFS 2024** (geht auch mit MSFS 2020): Im Piloten-Interface „Mit MSFS verbinden“. Position, Höhe, Kurs, Geschwindigkeit und „am Boden“ kommen jede Sekunde aus dem Simulator; der Übungsflug ist dann aus. LeitWerk verbindet sich von selbst, sobald der Simulator läuft, und beim nächsten Mal automatisch
  - Dafür braucht es die **SimConnect.dll** aus dem kostenlosen MSFS-SDK (im Simulator den Entwicklermodus einschalten → „Help → SDK Installer“). LeitWerk sucht sie unter `C:\MSFS 2024 SDK\SimConnect SDK\lib`; liegt sie woanders, kann man sie wählen
- **Ortung bei der Leitstelle:** Der Hubschrauber bewegt sich auf der Karte, wie er im Simulator fliegt, mit **Flugspur**. Die **Ankunftszeit** in der Fahrzeugliste rechnet mit der echten Geschwindigkeit
- **Zeitregel:** Fliegt ein Pilot mit Simulator, läuft das Spiel 1:1 – auch wenn die Leitstelle Zeitraffer eingestellt hat (der Knopf ist dann gelb durchgestrichen, der Grund steht im Hinweis). Zeitraffer geht wieder, wenn jeder Pilot am Boden steht: am eigenen Stützpunkt von selbst, am Einsatzort oder Krankenhaus erst, wenn er ihn erlaubt. Beim Abheben fällt die Erlaubnis weg. Der Übungsflug läuft weiter mit dem Zeitraffer mit
- **Flugplan für MSFS:** Zum Einsatzort und zum Landeplatz des Zielkrankenhauses als `.pln`-Datei speichern (im MSFS auf der Weltkarte „Laden“). Dazu die Koordinaten zum Kopieren
- **Landeplatz** des Zielkrankenhauses mit Koordinaten; Hinweis, wenn ein Haus keinen Landeplatz hat
- **Wetter-Hilfe:** Beim ersten Mal und über „Wetter“: „wie LeitWerk“ oder „selbst einstellen“. Bei echtem Wetter in LeitWerk: im MSFS Live-Wetter einschalten; sonst die passende Voreinstellung mit Wind
- Bei Verbindungsproblemen zeigt das Piloten-Interface, was los ist (Simulator nicht gestartet, im Menü statt im Flug, keine Daten)

## 0.69.0 – Spieler-NAH: Hubschrauber selbst fliegen (Teil 1)
- **Als Pilot beitreten** (Startseite): Ein Mitspieler tritt mit dem Code bei, wählt einen Hubschrauber, der gerade im Dienst ist, und sieht statt der Leitstelle sein **Piloten-Interface**. Für die Leitstelle bleibt der Hubschrauber ein ganz normales Fahrzeug
- **Alarmierung** mit Ton und rotem Balken (Stichwort, Adresse). **Status drückt der Pilot selbst** – 2 zum Berufungsort, 3 am Berufungsort, 4 zum Zielort, 5 am Zielort, 6 frei über Funk, 1 frei auf Wache. Das Programm wartet auf ihn
- **Am Berufungsort (Status 3) siehst du den Patienten:** Lagebild, Verdacht, Sichtung, Bewusstsein, Atmung. Dann entscheidest du:
  - **Wir transportieren** – Zielkrankenhaus frei wählbar (passende zuerst, mit Entfernung, Flugzeit und Landeplatz), jedes Ziel wird genehmigt. Der RTW wird frei
  - **Übergabe an den RTW** – mit oder ohne Notarzt im RTW
  - **Kein Transport** – Patient bleibt vor Ort, Revers oder verstorben
- **Übungsflug ohne Flugsimulator:** zum Einsatzort, zum Zielkrankenhaus, zum Stützpunkt oder zu einem Punkt auf der Karte – gerade Linie mit Reisegeschwindigkeit. Die Karte folgt dem Hubschrauber
- **Tasten:** Ziffern 1–6 und F (Übungsflug) – alles umbelegbar, dazu **globale Tastenkürzel** (Standard Strg + Umschalt + Ziffer), die auch funktionieren, wenn der Flugsimulator vorne ist, und **Joystick-Tasten**
- **Handy als Statusgerät:** QR-Code scannen (selbes WLAN, keine App) – große Statustasten, Einsatz und Patient. Beim ersten Mal den Netzwerkzugriff für LeitWerk erlauben
- **Chat mit der Leitstelle** im Piloten-Interface (bis der Sprechfunk kommt). Funkrufe der Leitstelle an einen Spieler-NAH zeigen einen Hinweis statt einer KI-Antwort
- **Ausfallsicherung:** Verlässt der Pilot das Spiel oder ist er eine Minute nicht verbunden, fliegt der Computer genau dort weiter – mit Status, Einsatz, gewähltem Ziel und Patient an Bord. Wieder übernehmen geht mit „Wechseln“
- **Leitstelle:** In der Fahrzeugliste, auf der Karte und in der Lobby steht ✈ und der Name des Piloten. Bucht der Pilot das Krankenhaus, steht „durch NAH (Pilot)“ in der Einsatzmaske
- Noch nicht dabei: Sprechfunk zwischen Menschen, Sekundärflüge, X-Plane 12

## 0.68.0 – Ortung und schnellere Abfrage mit der Tastatur
- **Ortung:** Das Ergebnis erscheint jetzt immer auch beim Adressfeld der Abfrage – vorher blieb dort „Ortung läuft …“ stehen, solange der Cursor im Adressfeld war
- **„Was ist passiert?“ mit der Tastatur:** Nach „Wer ruft an“ steht der Cursor gleich in der Kapitel-Suche. Dort nur ein Stichwort tippen (z. B. „atem“, „Brust“, „VU“) – die **Leertaste stellt die Frage „Was ist passiert?“**, **Enter wählt den obersten Treffer** (ist markiert)
- **Alter:** Der Cursor steht gleich im Zahlenfeld; Leertaste stellt die Frage, Enter übernimmt und geht zur nächsten Frage
- Mit ↑/↓ oder Escape kommt man aus dem Feld wieder zur Fragenliste. Wer gerade eine freie Frage tippt, wird nicht aus dem Feld geholt

## 0.67.1 – Startseite: Hilfe-Feld passt sich an
- „Deine Hilfe wird gebraucht“ nutzt den Platz in der linken Leiste bis zur Versionsangabe; bei wenigen Punkten bleibt das Feld kleiner, bei vielen kann man in der Liste blättern

## 0.67.0 – Mithelfen: Daten melden mit Tickets
- **„Deine Hilfe wird gebraucht“ auf der Startseite:** offene Punkte, bei denen Wissen fehlt (zum Start: Fahrzeuge je Funkgruppe kontrollieren, Sekundärfahrzeuge der Johanniter). Mit „Ich weiß das“ direkt antworten
- **Mithelfen:** fehlende oder falsche Fahrzeuge, Dienststellen, Orte (POIs) und Krankenhäuser melden – mit fertigen Formularen:
  - Fahrzeug: Dienststelle aus der Liste, Funkrufname, Typ und (wenn bekannt) Dienstzeiten
  - Dienststelle, Ort und Krankenhaus: Lage über Adresssuche, Koordinaten oder Klick in die Karte
  - Änderungsvorschläge in eigenen Worten
  - .txt- und .csv-Dateien anhängen (höchstens 5, je 2 MB, zusammen 5 MB); Kontakt ist freiwillig
- Gemeldetes kommt **nicht** ins eigene Spiel – es geht an das LeitWerk-Team und kommt, wenn es stimmt, mit einem Update für alle
- **Meine Tickets:** was du geschickt hast und wie der Stand ist (eingegangen, in Arbeit, eingebaut in Version …) samt Antwort. Ändert sich der Stand, kommt ein kleiner Hinweis
- Ohne Internet wird das Ticket gespeichert und später geschickt

## 0.66.0 – Alle sechs Funkgruppen spielbar
- **NÖ-01 (Mostviertel · St. Pölten), NÖ-02 (Waldviertel) und NÖ-04 (Weinviertel) sind spielbar** – auf der Startseite sind jetzt alle sechs Funkgruppen wählbar
- **321 neue Fahrzeuge** aus öffentlich zugänglichen Daten (ungeprüft, im Hinweis jedes Fahrzeugs vermerkt): NÖ-01 177, NÖ-02 55, NÖ-04 89 – RTW-C, RTW, KTW und BEL; mit Rotkreuz-Fuhrparklisten, Presse und der Reformkarte abgeglichen
- Neue Dienststellen: Rotes Kreuz Münichreith, Winterstützpunkt Hochkar, Dienststelle Marchegg, Dienststelle Leopoldsdorf im Marchfelde
- **Dienstpläne mit Kalenderwochen und Saison:** Fahrzeuge, die nur in geraden oder ungeraden Kalenderwochen fahren, sind nur dann im Dienst; der RTW am Hochkar nur von November bis April. Im Dienstplan steht das z. B. als „gerade KW Mo–Fr 06:00–14:00“ oder „Nov–Apr täglich 09:00–16:30“
- Korrekturen: NEF Raabs heißt 70/199 (RK-Fuhrpark), NEF Groß Gerungs ist von 17 bis 6 Uhr im Dienst, 58/002 ist der RTW-C der Ortsstelle Geras

## 0.65.0 – Flughafen: Orte und angekündigte Notfälle an Bord
- **Neue Orte am Flughafen Wien** (aus OpenStreetMap, eigene Gruppe „Flughafen“ auf der Karte):
  - Flugzeuge am Gate (Pier Nord, Ost, West), auf Außenpositionen und eine Abstellposition für Notfälle
  - Terminals, Sicherheitskontrolle, Gatebereiche, Gepäckausgabe, Lounges, Parkhäuser, Tankstellen
  - Hangars, Vorfeld, Fracht und Gepäcksortierung
- **Passagiere und Besucher** im Terminal, am Gate usw.: normaler Notruf über 144 (selten)
- **Notfall an Bord oder beim Personal: die Flughafen-Leitstelle ruft an.** Sie ist nicht beim Patienten und weiß nur, was gemeldet wurde: Krankheitsbild, Bewusstsein, Alter, Geschlecht. Alles andere: „Das hat uns die Crew nicht gemeldet.“
- **Angekündigte Notfälle an Bord** (z. B. Reanimation, Herzinfarkt, Geburt):
  - Landung in 10–25 Minuten. Die alarmierten Fahrzeuge fahren zum Warteort bei der Feuerwehr-Wache 1 und warten dort
  - Erst wenn das Flugzeug an der Abstellposition steht, fahren sie zum Patienten
  - Auf der Karte sieht man das Flugzeug anfliegen, landen und zur Position rollen
  - Die Feuerwehr fährt immer mit (selbst alarmieren – sonst fordert die Besatzung sie nach)

## 0.64.0 – Flughafen Wien
- **Flughafenambulanz** am Flughafen Wien-Schwechat (Betriebsfeuerwehr): RTW 77/898 („RTW Flughafen“, 05–14 und 14–23 Uhr) und NAW 77/899 („NAW Flughafen“, rund um die Uhr). Sie fahren nur zu Einsätzen am Flughafengelände (Grenze aus OpenStreetMap)
- **Neuer Fahrzeugtyp NAW** (Notarztwagen): RTW-C und NEF in einem, Besatzung RS/NFS + Notarzt + NKV/NKI. Braucht ein Einsatz einen RTW-C oder einen RTW mit Notarzt, schlägt das Programm den NAW vor, ohne zusätzliches NEF. Ist nur der RTW frei, kommt ein NEF von außen dazu
- **Sicherheitskontrolle:** Fahrzeuge von außen (KTW, RTW, NEF …) stehen an der Einfahrt zum Flughafengelände 1 Minute, hinein und hinaus. Das ist auch in der Ankunftszeit eingerechnet. Hubschrauber landen direkt
- **Ziele am Flughafen:**
  - Kann das Health Center (Office Park 3, Mo–Do) den Patienten allein versorgen, kommt er dorthin. Dort gehen auch Leute selbst hin, es kann voll sein
  - Nicht kritische Patienten, die ins Krankenhaus müssen, kommen ins Medical Center (Terminal 1, rund um die Uhr). Von dort ruft das Medical Center an der KT-Hotline an: Überstellung mit KTW ins passende Klinikum
  - Kritische Patienten kommen direkt in die Klinik
- Neue Dienststellen: Flughafenambulanz, Betriebsfeuerwehr Flughafen Wien (Wache 1 und 2, fährt nur am Gelände), Polizei Flughafen Wien (Terminal)

## 0.63.0 – Eigene Funkgruppe, Schichtwechsel auf der Dienststelle, Vormerken
- **Schalter „NÖ-03 | Alle“** in „Aktive Fahrzeuge“, „Alle Fahrzeuge“ und „Statusänderungen“: standardmäßig nur die eigene Funkgruppe. Hubschrauber (und ihr Ausweich-NEF) sind immer dabei, fremde Fahrzeuge in einem eigenen Einsatz stehen mit „von außen“ in der Liste. Der Einsatzmittelvorschlag schlägt weiter das schnellste Fahrzeug vor, auch von außerhalb
- **Rückfahrt:** Fahrzeuge, die frei über Funk sind, fahren nach jedem Auftrag still zu ihrer Dienststelle zurück
- **Schichtwechsel nur auf der Dienststelle:** Die alte Mannschaft fährt weiter, bis sie auf der Dienststelle ist. Ohne Folgedienst meldet sich das Fahrzeug erst dort ab. In der Liste steht „Wechsel ausständig“ bzw. „Dienstende – fährt heim“
- **Über der Dienstzeit: Vormerken statt Alarmieren.** Das Fahrzeug wird nur markiert. Erst wenn man es anfunkt und fragt, übernimmt es den Einsatz („alarmiert über Funk“). Ein Hinweis in der Einsatzmaske erklärt das
- Hubschrauber mit Dienst von Sonnenaufgang bis Sonnenuntergang zeigen gerundete Zeiten („ca. 07:00–17:00“), ganztägige Dienste „24 h“ (z. B. BEL Baden 52/119)
- ACN-Funkrufnamen ohne den Zusatz „ACN“ (z. B. 80/006)

## 0.62.0 – NÖ-05 und NÖ-06 spielbar
- **Neue Funkgruppen:** NÖ-05 (Mödling, Bruck an der Leitha, Schwechat, Baden Nord) und NÖ-06 (Wiener Neustadt, Neunkirchen, Baden Süd) sind auf der Startseite wählbar – mit eigenen Einsätzen und Funk
- **194 neue Fahrzeuge** in beiden Gruppen: 52 RTW, 17 RTW-C, 118 KTW, 6 Bezirkseinsatzleiter, 1 NEF (APN1, PVZ Wienerwald) – mit Dienstplänen; Rotes Kreuz, Samariterbund, Sozialmedizinischer Dienst
- Neue Dienststellen: Samariterbund Wiener Neustadt, SMD Aspang, PVZ Wienerwald Breitenfurt; „Rotes Kreuz“ in Himberg heißt jetzt Ortsstelle Himberg
- Die Daten sind öffentlich zugänglich, aber noch nicht geprüft – im Hinweis jedes Fahrzeugs vermerkt

## 0.61.3 – Ein ACN je Stützpunkt
- An jedem ACN-Stützpunkt steht nur noch ein Fahrzeug: die zweite Einheit in Stockerau (80/007) und in Baden/Leobersdorf (80/009) entfallen
- ACN gibt es damit in St. Pölten (80/003), Stockerau (80/006), Waidhofen an der Thaya (80/004), Bruck an der Leitha (80/008), Baden/Leobersdorf (80/002) und Haag (80/005)

## 0.61.2 – ACN-Funkrufnamen laut LEOSIM
- ACN Bruck an der Leitha heißt jetzt **80/008** (vorher geschätzt 80/001)
- ACN Baden/Leobersdorf behält 80/002 (jetzt laut LEOSIM statt geschätzt) und bekommt eine **zweite Einheit 80/009** – im Funk heißen beide dann nach dem Funkrufnamen, damit sie eindeutig bleiben

## 0.61.1 – NEF-Funkrufnamen im Industrieviertel
- NEF Hainburg heißt jetzt **53/699** (vorher geschätzt 53/499), NEF Aspang **65/098** (vorher geschätzt 65/499)
- NEF Baden 52/099, Mödling 64/099, Neunkirchen 65/099 und Schwechat 77/099 bleiben gleich, gelten aber nicht mehr als geschätzt (Hinweis „Funkrufname laut LEOSIM“)

## 0.61.0 – Einstellungen und Dialoge im neuen Design
- Einstellungen, Bereitschafts-Check und alle Rückfragen sehen jetzt aus wie die Startseite und die Spielstände: dunkelblaues Glas (bzw. hell), gleiche Rundungen, Auswahllisten, Schalter und Knöpfe im Blauverlauf, Navigation wie die Startseiten-Leiste, Abschnitte als Karten
- Bereitschafts-Check: jeder Prüfpunkt als Karte mit farbigem Symbol
- Startseite im Multiplayer: die Kachelleiste wird nur noch schmäler, wenn die Lobby den Platz wirklich braucht (auf großen Bildschirmen bleibt sie breit)
- Wetter „Realistisch“: ohne Verbindung zum Wetterdienst ausgegraut und nicht wählbar (war es gewählt, gilt „Normal“); der Hinweis „braucht Internet“ entfällt
- Unten links nur noch Version und „Nur eine Simulation – keine echten Einsätze.“

## 0.60.0 – Eigene Dateien in Dokumente/LeitWerk, Startseite ohne Bildlauf
- Beim Programmstart öffnet sich nur das Hauptmenü – weitere Programmfenster (zweiter Bildschirm) gehen erst auf, wenn das Spiel beginnt
- Startseite im Multiplayer: die rechte Spalte bekommt die volle Höhe und wird etwas kompakter, die Kachelleiste unten wird mit einer Animation schmäler – kein Bildlauf mehr
- Alles, was du selbst dazugibst, liegt jetzt auch als Datei in **Dokumente/LeitWerk**, je Art in einem eigenen Ordner: Abfrageschema, Codelisten, Daten (CSV), Fälle, Töne, Designs, Anordnungen (dazu wie bisher Spielstände)
- Ein bereits geladenes Abfrageschema wird beim ersten Start in den Ordner gelegt; fehlt es einmal (z. B. nach einer Neuinstallation), lädt LeitWerk es von dort automatisch
- Einstellungen → Programm & Updates → „Eigene Dateien & Spielstände“: alle Ordner mit „Öffnen“

## 0.59.0 – Spielstände-Ordner, aufgeräumte Einstellungen, einheitliche Startseite
- **Spielstände** liegen jetzt als Dateien im Ordner **Dokumente/LeitWerk/Spielstände**. „Spielstand laden“ zeigt eine Übersicht mit Name, Speicherzeit, Funkgruppe, Spielzeit, Einsätzen (offen), Wetter und Mitspielern – mit Suche, Umbenennen, Exportieren (zum Weitergeben), Löschen und der automatischen Sicherung ganz oben
- **Spielstand importieren …** öffnet die Dateiauswahl; importierte Spielstände werden in den Ordner kopiert (nur echte LeitWerk-Spielstände)
- Speichern fragt nach einem Namen (Vorschlag: Funkgruppe und Spielzeit); gleiche Namen werden nicht überschrieben
- **Einstellungen neu geordnet** (nichts entfernt): Mein Platz (Darstellung, Farben, Telefon & Töne, Sprache & Mikrofon, Bedienung) · Spiel & Simulation (Spielgebiet & Aufkommen, Notrufe & Anrufer, Alarmierung, Krankenhäuser & KT, Zeiten, Wetter & Flugrettung) · Leitstelle (Daten) · Programm. Der große Block „Einsatzaufkommen“ ist in Spielgebiet, Aufkommen, Anrufer und Verlauf, Alarmierung sowie Krankenhäuser und Daueraufträge aufgeteilt. Jede Seite hat einen Kopf mit Titel und kurzer Erklärung
- „Aufkommen insgesamt“ (ruhig/normal/stressig) ist jetzt auch im Spiel einstellbar
- **Suche** findet die einzelne Einstellung (auch über andere Wörter wie „Dunkelmodus“, „Mikro“, ohne Umlaute wie „groesse“) – Klick oder Enter springt hin und hebt sie hervor
- Startseite: alle Schalter gleich (Beschriftung oben, gleiche Höhe und Rundung, gleitender Schieber), Hell/Dunkel/System sitzt rechts oben, die NÖ-Karte auf Höhe von „Simulation konfigurieren“, sechs Kacheln über die ganze Breite (dazu Hubschrauber und Dienststellen), Bereitschafts-Check kompakt mit Symbolen

## 0.58.0 – Echtes Wetter, Updates mit Anzeige, neues Einstellungs-Design
- Wetter auf der Startseite als Schiebeschalter: **Realistisch** (echtes Wetter), Normal, Wechselhaft, Fest
- Realistisch = das echte Wetter für die Mitte der Funkgruppe, Stunde für Stunde (Open-Meteo, frei, braucht Internet): auch für vergangene Tage (Wetterarchiv) und bis 15 Tage voraus. Ohne Internet oder weiter in der Zukunft wird simuliert (mit Funkmeldung). Auch im Spiel unter Einstellungen → Wetter & Flugrettung einschaltbar
- Updates: LeitWerk sieht alle 15 Minuten nach. Gibt es eine neue Version, erscheint auf der Startseite „Update verfügbar“ und im Spiel oben ein grüner Update-Knopf. Erst auf Klick wird geladen – mit großer Anzeige (Prozent, MB, Geschwindigkeit, Restzeit, Herunterladen → Installieren → Neustart). Vorher wird das laufende Spiel automatisch gesichert
- Einstellungen und Dialoge im neuen Design passend zur Startseite (Glas-Look, runde Schalter, Segmente, Suche mit Lupe)
- Bereitschafts-Check: das Fenster zeigt jetzt richtig alle Punkte (vorher verdeckte eine riesige Fläche alles)
- Multiplayer-Lobby: Rechte als Symbole mit Legende – nichts steht mehr über
- „Work in Progress“-Schild am großen LeitWerk-Schriftzug
- Multiplayer: Mitspieler sehen die Lobby bis zum Start (vorher ging die Startseite bei ihnen sofort zu)

## 0.57.0 – Neue Startseite und neues Logo
- Bei jedem Programmstart erscheint eine Startseite: Funkgruppe, Startzeit (jetzt oder Wunschzeit), Einsatzaufkommen (ruhig / normal / stressig), Wetter (realistisch / wechselhaft / fest) und Solo/Multiplayer direkt einstellen und los
- Holografische NÖ-Karte: die gewählte Funkgruppe leuchtet auf (Klick auf die Karte wählt sie auch)
- Echte Zahlen: Fahrzeuge, Notarztmittel, Krankenhäuser, Fälle im Katalog
- Bereitschafts-Check („Alles funktioniert!“): Kartenmaterial, Straßennetz, Einsatzcodes, KI-Anrufer, Spracheingabe, Speicherstand – Klick zeigt die Aufschlüsselung und wie man Probleme behebt
- Spiel fortsetzen (letzter automatischer Speicherstand) und Spielstand laden direkt von der Startseite
- Schiebeschalter Solo/Multiplayer: im Multiplayer klappt die Lobby auf; der Host stellt ein und vergibt die Rechte, Mitspieler sehen die Einstellungen nur an
- Hell / Dunkel / System – gilt auch im Spiel
- Klick auf das Logo oben links öffnet die Startseite wieder („Zurück zur Simulation“ oder Esc führt zurück)
- Neues Logo (ansteigende Balken) in der Kopfzeile und als Programmsymbol
- Hintergrundfoto: Dürnstein (Wachau), Uoaei1, Wikimedia Commons, CC BY-SA 4.0 – leicht austauschbar

## 0.56.0 – Flüssige Fahrzeuge, Mikrofon bleibt freigegeben, neues Mac-Symbol
- Karte: Fahrzeuge (und Besatzungen zu Fuß) bewegen sich flüssig statt zu springen – die Position wird zwischen den Simulationsschritten weitergerechnet (auch im Multiplayer)
- Mac: die App hat jetzt eine gleichbleibende Signatur – nach diesem Update das Mikrofon noch ein letztes Mal freigeben, danach bleibt die Freigabe auch über Updates erhalten
- Mac: Programmsymbol im Apple-Raster – kein verkleinertes Symbol auf heller Platte mehr (macOS 26)
- Einstellungen → Zeiten: Ausrückzeiten als Tabelle, Tag und Nacht nebeneinander

## 0.55.0 – Wer belegt den Platz?
- Akutversorgung: Klick auf ein belegtes Feld (rotes ✗) zeigt ein kleines Fenster: welcher Einsatz, welche Fahrzeuge am Transport beteiligt sind (RTW, begleitendes NEF/ACN, Hubschrauber), der Buchungsgrund und bis wann der Platz ungefähr belegt ist
- Plätze, die nicht vom eigenen Rettungsdienst kommen, stehen als „Anderer Patient“ dabei

## 0.54.0 – Bewusstsein und Atmung zuerst
- Abfrage: „Ist der Patient wach?“ und „Atmet er normal?“ kommen jetzt vor dem Grundproblem („3 · Bewusstsein und Atmung“, danach „4 · Was ist passiert?“) – in der Primärabfrage stehen sie nicht noch einmal
- Bewusstlos und keine Atmung: sofort der Hinweis „Kreislaufstillstand – Reanimation anleiten!“ mit Knopf, der das Stillstand-Kapitel wählt

## 0.53.0 – ACN (Acute Community Nurse)
**7 ACN an 6 Standorten** (Land NÖ, Oktober 2026): St. Pölten, Stockerau (2), Waidhofen an der Thaya, Bruck an der Leitha, Baden/Leobersdorf, Haag
- Eine diplomierte Pflegekraft mit Notfallsanitäter-Ausbildung (NKI) allein im PKW, rund um die Uhr
- Funkrufnamen 80/xxx; nicht belegte (80/001, 80/002, 80/005, 80/007) sind im Hinweis als „geschätzt“ markiert
- Eigene Fahrzeugart „ACN“ (Filter in der Fahrzeugliste)

**ACN-Einsätze (Akutpflege zu Hause)**
- Kommen selten über die Gesundheitsberatung 1450 schon mit ACN-Code herein (ACN-O1 … ACN-O8: Katheter, PEG-Sonde, Sturz ohne Verletzung, Wunde, Port/Pumpe, Stoma, Palliativ, Sonstiges) – keine zeitliche Dringlichkeit
- Nur die ACN fährt hin, ist 30–60 Minuten vor Ort, der Patient bleibt zu Hause; ist keine ACN frei, wartet der Einsatz
- Schickt man einen KTW/RTW, nimmt der den Patienten mit ins Krankenhaus
- Häufigkeit einstellbar (Einstellungen → „ACN-Einsätze“, Standard ca. 2 pro Standort und Tag)

**ACN unterstützt den Rettungsdienst**
- Fehlt am Rettungsmittel der Notfallsanitäter (z. B. nur ein RS-RTW, weil kein RTW-C frei ist), schlägt LeitWerk statt NEF/Hubschrauber die ACN vor, wenn sie nicht später da ist – sie fährt beim Transport mit
- Notarzt-Einsätze (ALS orange/rot): ist die ACN das nächste Fahrzeug, kommt sie als First Responder dazu (RTW und Notarzt wie gewohnt)

## 0.52.0 – Fußweg der Besatzung, Hubschrauberlandeplätze, NEF-Status beim Notarzt-Abholen
**Fahrzeuge bleiben auf der Straße stehen**
- RTW, NEF, KTW fahren nicht mehr „ins Haus“: sie halten am nächsten Punkt der Straße, die Besatzung geht zu Fuß zum Patienten (auch bei Krankentransporten)
- Der Fußweg kostet Zeit: hin mit Ausrüstung, zurück mit dem Patienten langsamer
- Abseits der Straße (Wald, Berg, Feld): das Fahrzeug fährt auf Wegen so nah wie möglich; ab ca. 300 m meldet die Besatzung „Patient liegt abseits der Straße, ca. … Meter Fußweg“
- Auf der Karte: weiter weg ein Punkt für die Besatzung, nah ein kleiner Punkt je Person, in 3D ganz nah Figuren (Jacke in der Farbe der Organisation)

**Hubschrauberlandeplätze**
- Hubschrauber landen auf dem Landeplatz des Krankenhauses (Recherche + OpenStreetMap), sonst in der Klinik
- Kein Landeplatz (laut Quelle): LK Mauer, LK Hinterbrühl, MZ Gänserndorf – dorthin fliegt kein Hubschrauber Patienten; bucht man so ein Haus, wird bodengebunden transportiert
- Häuser mit Schockraum haben immer einen Landeplatz; landet der Hubschrauber eigentlich außerhalb (Sportplatz, Flugfeld), zählt das als Landung in der Klinik
- Krankenhaus bearbeiten → „Hubschrauberlandeplatz“ (auf der Karte wählen oder „kein“); CSV-Spalte `landeplatz`
- In der KH-Auswahl steht „kein Hubschrauberlandeplatz“ dazu

**NEF mit Notarzt-Abholung**
- Bis zur Abfahrt beim Krankenhaus bleibt das NEF „alarmiert und quittiert“, erst dann „zum Berufungsort“
- Nach dem Zurückbringen des Notarztes geht das NEF auf Bereitschaft (Status 8) und fährt heim

## 0.51.0 – Alle NEF in Niederösterreich, Notarzt-Abholung im Krankenhaus
**19 neue NEF** (jetzt 32 NEF in ganz NÖ, Stand heute)
- Neu: Amstetten, Waidhofen/Ybbs, Waidhofen/Thaya, Mödling, Gmünd, Baden, Scheibbs, Wiener Neustadt, Lilienfeld, Neunkirchen, Aspang, Schwechat, Hainburg, Ybbs-Persenbeug, Groß-Enzersdorf, Gänserndorf, Pöggstall, Raabs, Groß Gerungs
- Pöggstall nur nachts 18–6 Uhr; Aspang rund um die Uhr
- NEF-141 Raabs und Groß Gerungs: 19–7 Uhr, besetzt vom Ärztefunkdienst 141, Stützpunkte heißen „Ärztefunkdienst 141 …“ – werden wie ein normales NEF alarmiert
- Purkersdorf, Neulengbach, Ybbs-Persenbeug und St. Pölten: RK/ASB geteilt
- Funkrufnamen ohne Beleg sind im Hinweis als „geschätzt“ markiert

**Notarzt im Krankenhaus abholen** (Krems, Tulln, Horn, Zwettl, Waidhofen/Ybbs, Amstetten)
- Das NEF fährt bei der Alarmierung zuerst zum Krankenhaus (Punkt P), der Notarzt steigt ein (1–2 Minuten), dann geht es zum Einsatz
- Auf dem Heimweg bringt es den Notarzt zurück ins Krankenhaus
- Die Ankunftszeit im Einsatzmittelvorschlag rechnet den Umweg mit
- Funkabfrage „Wo seid ihr?“: „holen gerade den Notarzt im UK Krems ab …“
- Fahrzeug bearbeiten (NEF) → „Notarzt“: am Stützpunkt oder im Krankenhaus abholen; CSV-Spalte `na_abholung`

**Behoben**
- Ein Ort mit zwei Kategorien (z. B. Lokal und Heuriger) konnte als „Heuriger“ in der Nacht vorkommen, obwohl der zu hat

## 0.50.0 – Rettungszufahrten der Krankenhäuser
**Fahrzeuge fahren über die Rettungseinfahrt zum Punkt P** (dort geht die Besatzung „ins KH“)
- UK St. Pölten (Einfahrt von der Matthias-Corvinus-Straße), UK Krems (vom Mitterweg zur Schleife), UK Tulln (vom Alten Ziegelweg bei der Föhrengasse)
- Gilt für Transporte und Krankentransporte; Hubschrauber landen weiter am Haus
- Auf der Karte steht ganz nah ein blaues „P“
- Krankenhaus bearbeiten → „Rettungszufahrt“: Einfahrt und Punkt P auf der Karte wählen (auch für weitere Häuser); in der CSV-Spalte `zufahrt`: `einfahrt=48.41296,15.61544; p=48.41247,15.61458`

**Behoben**
- Beim Bearbeiten eines Krankenhauses gingen Öffnungszeiten, Plätze und Aufnahmerad verloren

## 0.49.0 – Öffnungszeiten der Orte, Tag- und Nachtfälle
**Orte haben Zeiten** (Einsätze und Krankentransporte nur, wenn dort offen ist; Feiertage wie Sonntag)
- z. B. Schulen und Kindergärten Mo–Fr tagsüber, Supermarkt Mo–Sa 7–20, Arztpraxis Mo–Fr 8–18, Museum Di–So 10–17, Disco Fr/Sa 22–5, Freibad 9–19, Hochstand in der Dämmerung; Bahnhof, Pflegeheim, Hotel, Wohnung, alle Straßen und das Gelände immer
- Österreichische Feiertage (auch Ostermontag, Pfingstmontag, Christi Himmelfahrt, Fronleichnam) sind hinterlegt
- Die Zeiten stehen gesammelt in `src/data/ortZeiten.ts` (lesbar: „Mo-Fr 7-16; Sa 8-12“)

**Tag- und Nachtfälle** (Fall-Editor → „Wann?“)
- Jeder Fall: immer (24 h), tagsüber (7–19) oder nachts (19–7) – Orte wie Bahnhof oder Pflegeheim bringen so nachts andere Fälle als tagsüber
- Ausnahme „kann auch passieren, wenn der Ort zu ist“ (betrunkene Person, Rauferei, hilflose Person …): dann draußen vor dem Eingang oder am Parkplatz, und es ruft kein Personal an
- Vorbelegt: Sturz auf der Bahnhofsstiege, Museum, Tierpark nur tagsüber; Ausnahme bei Person auf der Parkbank, Rauferei, Stichverletzung im Streit, hilflose und unterkühlte Person, Polizei-Anforderungen

**Krankentransporte aus Einrichtungen**
- Etwa ein Drittel der KTs kommt jetzt aus Pflegeheimen, Betreutem Wohnen, Einrichtungen für Menschen mit Behinderung, Reha-Zentren und Arztpraxen (Einweisung) – nur zu deren KT-Zeiten (Pflegeheim Mo–Fr 7–16, Reha Mo–Fr 8–15, Praxis Mo–Fr 8–18)

## 0.48.0 – Straßen, Gelände und unsichtbare Einsatzstellen
**Karte**
- Orte (POIs) sind kleine, blasse Punkte; Namen erst ganz nah (ab Zoom 16)
- Bushaltestellen entfernt (Notfälle passieren einfach auf der Straße), Busbahnhöfe bleiben

**Unsichtbare Einsatzstellen** (zählen für Einsätze, stehen nicht auf der Karte)
- Strecken und Flächen als viele mögliche Einsatzstellen: Autobahn/Schnellstraße alle 500 m je Fahrtrichtung mit Kilometer, Landstraßen außerorts, Feld- und Forstwege, Radwege, Wald, Berg, Fluss- und Seeufer, Weingärten, Felder
- Unauffällige Punkte: Bahnübergänge, Brücken, Tunnel, Autobahn-Anschlussstellen, Kreisverkehre, Kreuzungen außerorts, Kellergassen, Hochstände, Windräder, Sendemasten, Biogasanlagen, Kletterfelsen, Klettersteige
- Leistung: die Daten werden erst beim ersten Einsatz geladen und je Funkgruppe zwischengespeichert
- Entwickler: unter Persönlich → Entwickler einschaltbar, dann in der Karte unter „Ebenen“ sichtbar

**Wo ein Notfall passiert** (im Fall-Editor unter „Wo?“ anhakbar, bestehende Fälle vorbelegt)
- Neue Ortsarten: Landstraße (außerorts), Autobahn/Schnellstraße, Feld-/Forst-/Radweg, Wald, Berg/Fels, Fluss/Seeufer, Feld/Weingarten – dazu wie bisher Wohnung, Haus, Straße im Ort, Einrichtungen …
- Im Freien ohne Adresse beschreibt der Anrufer, wo er ist („im Dunkelsteinerwald bei Mauer“, „am Ufer der Krems bei Rehberg“) – Ortung nötig; am Berg Bergrettung, am Ufer Wasserrettung
- Autobahn: „auf der A1 bei Kilometer 85,4 Richtung Wien“; Landstraße: „auf der B37 zwischen Lengenfeld und Gföhl“. Beides findet man in der Adresssuche („A1 85“, „B37 Gföhl“)
- Grundregel Straße: im Ort eher Fußgänger und Radfahrer, langsam; außerorts und auf der Autobahn hohe Geschwindigkeit
- Profile mit Hinweis für den Disponenten: Autobahn (Kilometer, Richtungsfahrbahn, Polizei), Bahnübergang (ÖBB, Oberleitung), Brücke (Polizei, Feuerwehr), Kellergasse (Gärgas – Atemschutz), Windrad (Höhenrettung) …

**Neue Fälle**: Auffahrunfall auf der Autobahn, Auto am Bahnübergang vom Zug erfasst, Person auf dem Brückengeländer, Gärgas im Weinkeller, Jäger vom Hochstand gestürzt, Forstarbeiter unter einem Baum, Traktor umgestürzt, Radfahrer am Radweg gestürzt

## 0.47.0 – Jeder Ort hat sein eigenes Einsatzprofil
Pro Ortskategorie ist festgelegt, wer anruft, wo genau der Patient ist, welche Partner mitkommen und was der Disponent wissen sollte.

**Wasser: Bad ≠ offenes Gewässer**
- Frei-/Hallenbad, Therme: der Bademeister ruft an, die Person ist meist schon aus dem Wasser – **keine Wasserrettung**
- Badesee, Fluss, Hafen/Anlegestelle/Fähre (neu, 64 Orte): kein Bademeister; ist die Person noch im Wasser, kommen **Wasserrettung und Feuerwehr (Wasserdienst)** – der Fall spielt dann an einem echten See oder Hafen in Reichweite einer Wasserrettung
- Badeseen und Bäder in den Daten sauber getrennt (Naturbadeteiche und Strandbäder zählen als offenes Gewässer)

**Verkehr: Bahnhof ≠ Bushaltestelle ≠ Raststation**
- Bahnhof: Anrufer auch ÖBB-Personal, Stelle Bahnsteig/Unterführung/Zug; bei Unfall im Gleis Polizei und Feuerwehr (Oberleitung erden), Hinweis „ÖBB verständigen“
- Bushaltestellen (neu, rund 7 700) und Busbahnhöfe: der Busfahrer ruft an, Patient im Bus oder an der Haltestelle
- Autobahn-Raststation: Anrufer Raststätten-Personal oder LKW-Fahrer, Hinweis „Anfahrt nur über die Richtungsfahrbahn“

**Freizeit: Museum ≠ Tierpark**
- Museum: die Aufsicht ruft an (Ausstellung, Stiege ohne Lift); Tierpark: die Tierpflegerin (Gehege, „ist das Tier gesichert?“); dazu Freizeitpark, Veranstaltung (Ordner), Campingplatz (Platzwart), Ausflugsziel
- Ebenso Profile für Sport (Trainer, Reitlehrerin), Schulen und Kindergärten (Pädagogin), Einkauf, Disco (Security), Heuriger, Hotel (Rezeption) und Betriebe (Werkstor, Silo)

**Neue Fälle an bestimmten Orten** (kommen nur, wo es so einen Ort im Gebiet gibt)
- Kopfsprung ins seichte Becken (Freibad), Schwimmer untergegangen (Badesee/Donau), Kollaps nach der Sauna (Therme), Sturz auf der Bahnhofsstiege, Krampfanfall im Bus, LKW-Fahrer mit Brustschmerz (Raststation), Biss im Tierpark, Sturz im Museum, Sturz vom Pferd, Alkoholvergiftung in der Disco

**Einsatzmaske und Karte**
- Liegt die eingegebene Adresse bei einem bekannten Ort, steht unter „Partner“ ein Hinweis (📍 Freibad … – Bademeister vor Ort, keine Wasserrettung nötig); die Partner-Knöpfe richten sich danach
- Der Hinweis steht auch im Ort-Fenster auf der Karte

## 0.46.0 – NEF nach dem RTW, Akutversorgung = Übersicht, Orte mit feinen Kategorien
**Leitstelle**
- Abfrage: Die **Leertaste** stellt die markierte Frage – genau wie ein Klick auf das Frage-Symbol (wie F)
- NEF: Werden NEF und RTW gleichzeitig alarmiert (innerhalb einer Minute), rückt das NEF von der Wache immer nach dem RTW aus (20 s – 1,5 min später) – der Notarzt muss erst dazukommen

**Krankenhäuser**
- Akutversorgung und Plätze-Ansicht kommen jetzt aus derselben Quelle wie die Krankenhaus-Übersicht (Akut-Abteilungen): was dort steht, steht auch in der Tabelle – bei allen Häusern und allen Spalten (Schockraum, PCI, CT, Endoskopie, Stroke, Notaufnahme, Unfall, Kinder, Kreißsaal). Abteilungen ohne gezählte Plätze zeigen offen/zu

**Orte (POIs)**
- Ganz Niederösterreich auf demselben Stand: rund 10 700 Orte aus OpenStreetMap (vorher 2 600, vor allem um Krems), doppelte zusammengelegt. Darunter 120 Pflegeheime (abgeglichen mit den Listen von LGA und Land NÖ), 840 Kindergärten, 520 Volksschulen, 320 Mittelschulen, 130 höhere Schulen, 450 Bahnhöfe/Haltestellen, 1 050 Supermärkte, 770 Sportplätze, 290 Reitanlagen, 230 Bäder, 850 Heurige, 47 Discos, 415 Industriebetriebe, 285 Steinbrüche
- Feine Kategorien mit Patientengruppe und typischen Notfällen, in Gruppen: Pflege & Betreuung, Kinder & Bildung, Gesundheit, Verkehr, Einkauf, Sport, Wasser, Freizeit & Kultur, Gastronomie & Hotel, Arbeit & Betriebe
- Einsätze passen zum Ort: das Alter passt zur Einrichtung (Kleinkind → Krabbelstube/Kindergarten, Jugendlicher → höhere Schule), das Thema zieht passende Orte an (Tierbiss → Tierpark/Reitanlage, Intoxikation → Disco, Einklemmung → Industriebetrieb/Sägewerk, Kreislauf → Therme)
- Karte: normale Orte erst ab Zoom 14, wichtige (Pflegeheime, Bahnhöfe, Landeplätze, große Einrichtungen) ab Zoom 11; einstellbar unter Persönlich → Darstellung. Farbe nach Gruppe
- Im Orte-Editor sind die Kategorien nach Gruppen sortiert, mit Hilfetext (wer dort ist, was dort passiert)

## 0.45.0 – Pauls Liste: Rückruf, Funk, Karte, Orte
**Leitstelle**
- Rückruf: Der 📞-Knopf bei „Rückruf“ ruft den Anrufer jetzt wirklich zurück – auch wenn das Gespräch schon beendet war (ohne Nummer übernimmt er die Nummer des Anrufers)
- Abfrage: Haken „🔊 Vorlesen“ direkt in der Abfrage (Antworten vorlesen ein/aus). Mit der **Leertaste** kommt die markierte Frage ins Eingabefeld (anpassen, Enter schickt sie ab); F stellt sie wie bisher direkt
- Funk: Wer gerade schreibt (oder Text im Feld stehen hat), verliert das Gespräch nicht mehr nach 30 Sekunden Stille
- SEK: „Dringlichkeit“ steht gleich unter „Abholung“

**Fahrzeuge**
- Hubschrauber: nur C2 und C17 fliegen rund um die Uhr, alle anderen von Sonnenaufgang bis Sonnenuntergang
- NEF rücken unterschiedlicher schnell aus als RTW/KTW (Tag 20 s – 4 min, Nacht 1,5 – 13 min; in den Einstellungen änderbar)

**Krankenhäuser**
- Wo es eine Geburtshilfe gibt, gibt es auch einen Kreißsaal (UK Krems, UK Tulln, Donaustadt, Braunau)
- Akutversorgung: Kreißsaal und Kinder (Kinderabteilung ohne eigene Kindernotaufnahme) stehen jetzt auch dort, wo sie in der Krankenhaus-Übersicht stehen

**Anrufer passt zum Ort**
- Kein Pflegeheim mehr, das aus einem Privathaus anruft: Pflegekräfte aus dem Heim nur, wenn die Adresse ein Pflegeheim ist; sonst mobile Hauskrankenpflege oder die Hausärztin auf Hausbesuch. Dasselbe für Ordination und Schule
- Geschichten im Pflegeheim, in der Ordination, Schule oder am Bahnhof kommen nur, wo es so einen Ort im Gebiet gibt

**Orte (POIs)**
- Neu in den Standarddaten: rund 2 600 Orte in Niederösterreich aus OpenStreetMap – 115 Pflegeheime, 660 Schulen, 240 Kindergärten, 290 Bahnhöfe, 375 Einkaufsorte, Sportplätze, Bäder, Freizeitanlagen, Betriebe und Arztpraxen. Pflegeheime sind mit den Listen des Landes NÖ abgeglichen
- Geschichten (Pflegeheim, Schule, Bahnhof …) spielen jetzt an diesen echten Orten; die Orte gelten auch mit eigenen Rettungsdienst-Daten, solange keine eigenen Orte importiert sind

**Karte**
- Suchfeld in der Karte (bei 2D/3D): Orte, Adressen und Einrichtungen (Pflegeheime, Schulen, Krankenhäuser, Dienststellen …) – auch nach Art, z. B. „Pflegeheim Krems“

## 0.44.0 – Fremde Codesysteme: die Schwächen behoben
Geprüft mit sechs fremden Codesystemen, die ein eigener Agent ohne Kenntnis des Übersetzers geschrieben hat (Leitstellen-Jargon, Laiensprache, Kürzel-Stil, Schweizer Stil, MPDS-Stil, Checkliste). Am eigenen Notruf-NÖ-Schema ändert sich weiterhin nichts (174 Fälle Zeichen für Zeichen gleich).

**Zuordnung der Fragen**
- Großes Wörterbuch: Fach-, Leitstellen- und Laiensprache je Merkmal, medizinische Abkürzungen (GCS, AVPU, SHT, HWS, ACS, Apoplex, Intox, VKOF, PPH …)
- Auch die Antwortmöglichkeiten zeigen, worum es geht („Hergang: absichtlich / versehentlich …“, „Noxe“, „Leitbeschwerde“)
- Umgedrehte Fragen auch ohne „nicht“: „Ist das Lächeln symmetrisch?“, „Atmung unauffällig?“, „Kann er beide Arme gleich hoch halten?“; dazu Gegenprobe über die Regeln
- Gemischte Antworten wie „Ja – keine Reaktion“ / „Nein, aber verwirrt“ / „Nein – wach“ und „Nein – erschwert“ / „Nein – Schnappatmung“ / „Nein – keine Atmung“
- Checklisten-Schreibweise „+ / – / ?“
- Zusammengesetzte Fragen („bewusstlos oder atmet nicht normal?“): die Antwort ergibt sich aus beiden Merkmalen
- Gleichbedeutende Merkmale (Brustschmerz/Brust, Gewalt/aggressiv …) teilen sich die Wahrheit
- Kapitel-Thema auch aus dem Inhalt, wenn der Titel nichts sagt („Kreislauf“, „Seele“, „Feuer & Hitze“)
- Neu: „KI-Vorschläge für offene und unsichere Fragen“ in der Zuordnung (lokale KI, Ergebnis als „KI-Vorschlag“ markiert)

**Einsatzstufen**
- Kategorien ohne sprechenden Namen („Stufe A“, „D1“, „P2“) werden aus dem Aufbau eingeordnet (Reihenfolge der Regeln, Stufen-Reihenfolge)
- Einsatzstufen aus der Datei ohne „kategorie“: aus Notarzt und Sondersignal abgeleitet

**Ergebnis** (Anteil richtig zugeordneter Fragen, vorher → jetzt): Schema 1: 66 % → 82 %, Schema 2: 67 % → 87 %, Schema 3 (Kürzel): 46 % → 62 %; drei weitere, vorher nie gesehene Schemas: 75 %, 88 %, 81 %. Dringlichkeit der Codes gegen die Wahrheit vor Ort (42 Fälle): eigenes Schema 28 passend / 12 eine Stufe daneben / 2 zwei daneben – fremde Schemas 18–29 / 10–21 / 1–5

## 0.43.0 – Jedes Codesystem funktioniert
Ziel: Ein gutes Telefonat, dessen Code zum Geschehen vor Ort passt – mit jedem Abfrageschema, egal welche Fragen, Antworten und Codes es verwendet. Am eigenen Notruf-NÖ-Schema ändert sich nichts (geprüft: Anrufer, KI-Anweisungen, Wahrheit und Codes von 174 Fällen sind Zeichen für Zeichen gleich).

**Übersetzung auf die LeitWerk-Merkmale**
- Innen arbeitet LeitWerk mit festen Merkmalen (Bewusstsein ja / getrübt / nein, Atmung, Alter, Sturzhöhe …). Ein Codesystem mit anderen Fragen wird beim Laden automatisch darauf übersetzt – über Fragetext und Antworten, auch bei umgedrehten Fragen („Ist der Patient bewusstlos?“ = Bewusstsein „nein“)
- Fehlt einem Kapitel das „thema“, wird es aus Titel und Stichworten erkannt
- Kann ein Codesystem etwas nicht abfragen (z. B. nur „atmet normal: ja/nein“), passt sich die Antwort an – der Anrufer weiß trotzdem, was wirklich ist (z. B. Schnappatmung)
- Fehlt ein Kapitel zu einem Fall (z. B. kein Kapitel „Ersticken“), kommt der Fall im verwandten Kapitel (Atemnot)
- Neu: Einstellungen → Einsatzcodes & Abfrage → „Zuordnung …“: welche Frage welchem Merkmal entspricht, mit Sicherheit; Merkmal und Antworten lassen sich von Hand ausbessern (wird im Codesystem gespeichert)
- Ein Codesystem, das schon die LeitWerk-IDs verwendet (wie deines), wird nicht umgebaut

**Einsatzstufen fremder Codesysteme**
- Unbekannte Kategorien werden nach dem Namen eingeordnet: „Prio 1“, „Notarzt“, „rot“ → kritisch mit Notarzt; „mit Sondersignal“, „Prio 2“ → dringend; „Prio 3“, „ohne Sondersignal“ → RTW ohne Eile; „Krankentransport“, „Prio 4“ → KTW; „Weitergabe“, „Beratung“
- Farben und Sortierung der Einsatzliste richten sich danach, auch bei anderem Code-Format

**Geprüft mit einem selbst gebauten fremden Schema** (eigene Formulierungen, umgedrehte Fragen, Codes „NF-S1-05“, Kategorien „Prio 1–4“): 40 von 40 Fragen richtig zugeordnet, alle 42 Fälle bekommen einen Code; bei 27 von 42 Fällen gleiche Dringlichkeit wie mit deinem Schema, sonst eine Stufe daneben (wo dem Testschema Kapitel fehlen)

## 0.42.0 – Ersatz-NEF nur bei Schlechtwetter, Lagemeldung nur mit Grund
**Ersatz-NEF (NEF ÖAMTC)**
- Ist nur im Dienst, wenn sein Hubschrauber im Dienst ist, aber wegen des **Wetters** nicht fliegen kann
- Nacht ist kein Grund: Ein Hubschrauber, der nur bei Tag fliegt, hat in der Nacht kein Ersatz-NEF

**Funk**
- Nicht mehr jeder Einsatz bekommt eine Lagemeldung – nur bei besonderen Umständen (Verkehrsunfall, Brand, eingeklemmt, Gefahrstoff, Absturz/Berg, Wasser, Strom, Stich/Schuss, mehrere Patienten, Lage ganz anders als gemeldet), bei einer Nachforderung oder wenn du darum bittest
- Fragst du „Was wird euer Zielkrankenhaus?“, sagt die Besatzung das Krankenhaus („wir würden ins UK Krems fahren“) statt „Zielkrankenhaus verstanden“. Gibst du das Ziel vor, wird es wie bisher bestätigt
- „Was habt ihr für einen Verdacht?“ wird fest beantwortet („Verdacht Akutes Koronarsyndrom“) – die KI hat hier oft Messwerte erfunden
- Bei freien Fragen bekommt die KI die Messwerte gar nicht mehr zu sehen, außer du fragst ausdrücklich danach
- „benötigen 1 weitere Rettungsmittel“ heißt jetzt „benötigen einen weiteren RTW“ (vom NEF/Hubschrauber: „benötigen einen RTW“)
- Testlauf: „… bis hier“ zählt nicht mehr als doppeltes „Hier“

## 0.41.1 – Vorlesen
- „1× Rot“, „2x NEF“ wird vorgelesen als „einmal Rot“, „zweimal NEF“ (Funkrufnamen wie bisher als „75 1“)

## 0.41.0 – Funk über die KI
Der Sprechfunk läuft jetzt wie echt – nach dem Prinzip „Das Programm denkt, die KI redet“: Was gemeldet, nachgefordert oder storniert wird, entscheidet weiter das Programm; die Besatzung formuliert es mit der KI in Funksprache; das Programm prüft jeden Funkspruch und nimmt sonst die feste Meldung. Das gilt für jeden Einsatz – auch für künftige und selbst erstellte Fälle.

**Funkablauf wie in echt**
- Immer zuerst der Anruf: „LEO von 75/001, kommen“ → „Hier LEO, kommen“ / „LEO hört“ → dann die Meldung. Ruft LEO: „75/001 von LEO, kommen“ → „Hier 75/001, kommen“ / „75/001 hört“
- Nur EIN Funkgespräch gleichzeitig. Wer etwas will, wartet, bis das laufende Gespräch zu Ende ist – nichts wird unterbrochen, auch LEO nicht (ein Ruf wird vorgemerkt und geht hinaus, sobald der Funk frei ist). Oben steht „🟢 Funk frei“ bzw. „🔴 Funk belegt – …“
- Warten mehrere: zuerst LEO, dann Dringendes (Nachforderung Notarzt, Verschlechterung, Reanimation), dann wer länger wartet
- Ende, wenn das letzte Wort „verstanden“, „Ende“ oder „danke“ ist – oder nach 30 Sekunden Stille (echte Zeit)
- Keine Antwort: nach 30 Sekunden ruft das Fahrzeug nochmal, höchstens dreimal – dann bleibt ein Sprechwunsch stehen
- Telefon hat Vorrang: Allein wartet der Funk, solange du telefonierst (ein kurzer Ton sagt, dass jemand funken möchte – abschaltbar über den Funkton). Im Mehrspieler funken die anderen normal weiter; nur wenn alle telefonieren, wartet der Funk (Ton bei jedem). Wer telefoniert, sieht den Funk trotzdem im Funkfenster
- Formuliert wird beim Spieler, der das Gespräch beginnt bzw. den Ruf beantwortet
- RTW und NEF funken beim Rendezvous bzw. beim NEF-Storno miteinander – nach denselben Regeln, LEO hört mit

**Rufnamen**
- Normal der Funkrufname (75/001); Dienststelle mit nur einem Fahrzeug: „RTW Gföhl“, „RTW Spitz“; Hubschrauber „C2“, „C33“; Ersatz-NEF „NEF ÖAMTC 2“; NEF „NEF Tulln“; „BEL Krems“; „ÖBB Einsatzleiter Tulln“; vorbereitet: „ACN St. Pölten“
- Anfunken geht mit Funkrufname oder Rufname („NEF Tulln von LEO, kommen“, „C 2“)

**Was die Besatzung sagt**
- Lagemeldung im Stil „Hier 75/001 mit einer Lagemeldung. Pat. mit …, kommen.“ – mit Fachbegriffen, kurz
- Nie der Name des Patienten; Messwerte (Sättigung, Blutdruck, Puls …) nur, wenn du ausdrücklich danach fragst – und nur die, die es im Fall gibt
- Nichts wird dazuerfunden: keine zusätzliche Nachforderung, kein Storno, keine Zahl, die das Programm nicht vorgibt. Fehlt etwas Wichtiges oder ist etwas erfunden, wird einmal neu formuliert, sonst kommt die feste Meldung
- Neu: Braucht der Patient einen Notarzt und ist kein NEF in der Nähe, fragt die Besatzung „Frage: ist der C2 verfügbar?“ – deine Antwort („ja, alarmiert“ / „nein“) wird verstanden
- Neu: Nicht jede Besatzung meldet vollständig – BEL fast immer, NEF meist, RTW öfter nicht, KTW am öftesten. Dann musst du nachfragen (Einstellungen → KI-Anrufer → „Funkmeldungen manchmal unvollständig“)
- Krankenhaus-Buchung über Funk nur noch in Ausnahmen (laufende Reanimation, mehrere Patienten) – sonst bucht die Besatzung selbst
- Vorlesen: „Pat.“ wird „Patient“, „St. Pölten“ wird „Sankt Pölten“, „KH“ wird „Krankenhaus“
- Kinder heißen in Meldungen „Bub“ bzw. „Mädchen“ statt „Mann“ bzw. „Frau“

**Einstellungen und Test**
- Einstellungen → KI-Anrufer → „Funk“: „KI“ (Standard) oder „fest – wie bis Version 0.40“
- Testlauf: neue Auswahl „Funk“ – erzeugt zu jedem Fall und Ausgang die typischen Funksprüche (Lagemeldung, Zustand und Vitalwerte auf Nachfrage, Verdacht, Transport mit Voranmeldung, Rendezvous, NEF-Storno) und prüft sie; „alles“ enthält jetzt auch den Funk

## 0.40.0 – Statusänderungen
**Fahrzeuge**
- Neuer Reiter „Statusänderungen“ neben „Aktive Fahrzeuge“ und „Alle Fahrzeuge“: jeder Statuswechsel mit Uhrzeit, Fahrzeug, alter → neuer Status, Einsatz bzw. Transport und Grund (Dienstende, Dienstbeginn, kein Flugwetter, von Hand); neueste oben, mit Suche und „nur im Einsatz“. Bei bestehenden Anordnungen erscheint er einmal automatisch neben „Aktive Fahrzeuge“; klappt auch im Mehrspieler
- „Aktive Fahrzeuge“ zeigt keine abgemeldeten Fahrzeuge (Status 0) mehr – nur solche, die unterwegs oder beschäftigt sind

**Gespräche**
- Herzdruckmassage: schon beim ersten „Drücken Sie …“ zählt der Anrufer laut ab eins

## 0.39.0 – Testlauf und Pauls Gespräche ausgewertet
Alle Verbesserungen gelten für jeden Fall – auch für selbst erstellte.

**Adresse**
- „📍 Genannte“ übernimmt nur, was der Anrufer wirklich gesagt hat (Straße, Hausnummer, Ort – auch ausgeschrieben wie „neunundsechzig“). Hat er nur „auf der Landstraße nach dem Ortsende“ gesagt, bleibt der Knopf aus – die Adresse wird nicht mehr verraten

**Anweisungen am Telefon**
- „Drücken Sie fest auf den Finger“ ist Druck auf die Wunde, keine Herzdruckmassage mehr (vorher: „Das geht nicht, ich bin wach“)
- Erkannt werden jetzt auch Bitten mitten im Satz („… und schlagen Sie ihm auf den Rücken“), mit beliebigem Verb („Ermutigen Sie ihn zu husten“) und mit „Wenn Sie so weit sind, dann drücken Sie …“
- Herzdruckmassage: „Hände auf die Brust“ heißt erst hinknien und Hände auflegen; ab „drücken“ zählt der Anrufer laut mit – und zählt weiter, auch bei „Sehr gut, machen Sie weiter“, bis sich etwas ändert
- „Nehmen Sie Blutverdünner?“ ist eine Frage, keine Anweisung

**Antworten prüfen**
- Alter auch in Worten („sechsundsiebzig“) und Unsinn wie „zwischen 76 und 70“ wird erkannt
- Wer den Patienten nicht sieht, sagt „weiß ich nicht“ statt „Nein, sie ist nicht durcheinander“
- Was ausdrücklich in der Fallakte steht („Sie hat Depressionen“), weiß auch ein Anrufer, der sonst wenig weiß
- Auf „Wer spricht da?“ kommt immer der Name
- Eine Gegenfrage statt einer Antwort („Wie lange braucht die Rettung noch?“) wird neu erzeugt
- Der Anrufer nennt keine erfundene Ankunftszeit der Rettung und plappert Durchsagen nicht nach
- Selbstanrufer mit Atemnot reden in der Ich-Form („Ich hab … Asthma …“), und auch ihre Antworten werden jetzt geprüft
- „Zur Patientin“, „beim Patienten“ sagt kein Angehöriger mehr; gebrochenes Deutsch ohne Dialekt („nicht“ statt „net“)

**Fälle und Wahrheit**
- Vorgeschichte passt zum Alter: Blutverdünner, Herzinfarkt, Schlaganfall u. Ä. erst ab einem glaubwürdigen Alter (keine 15-Jährige mit Xarelto)
- „Fordert die Polizei einen UBG-Transport an?“ ist „nein“, wenn nicht die Polizei anruft
- Wer den Patienten nicht sieht, für den sind Verwirrtheit, Hautfarbe, Schweiß u. Ä. „unbekannt“
- Hergang des Selbstanrufers in richtiger Ich-Form („Ich hab mich geschnitten“)

**Krankentransport und Überstellung**
- „Die Patientin“ statt „der Patient“ bei Frauen, „sie“ statt „er“; Angehörige sagen „meine Mutter“ bzw. „sie“
- Die Frage wird nicht mehr wiederholt („Wann ist der Termin? Um 13:54.“)
- Keine Leitstellen-Rückfragen mehr („Noch was anderes nötig?“, „Ist alles erledigt?“) und keine Notruf-Sätze („ich bleib dran“, „ich warte“)
- Verabschieden fest und freundlich („Danke, auf Wiederhören.“)
- „Wie schreibt sich der Nachname?“ – wird buchstabiert („Weber – W, E, B, E, R.“), auch beim Notruf
- Falsche Rückfrage der Leitstelle (Uhrzeit, liegend/sitzend, Begleitung) wird jetzt immer korrigiert; eine richtige wird kurz bestätigt, ohne alles zu wiederholen
- Termine realistischer: Ambulanztermine frühestens in gut einer Stunde und untertags; Gründe passend zum Geschlecht (kein Mammakarzinom beim Mann); Tochter bzw. Sohn mit passendem Vornamen
- Testlauf: „Ist die Übernahme im Zielkrankenhaus zugesagt?“ zählt nicht mehr als falsches Ziel; „14 Uhr 15“ wird als 14:15 erkannt

## 0.38.0 – Neuer Gesprächsablauf: Das Programm denkt, die KI redet
Bisher bekam die KI bei jeder Frage die ganze Fallakte und musste selbst herausfinden, was passt. Für ein kleines Modell ist das zu viel – daher kamen Verwechslungen, Erfundenes und Widersprüche. Jetzt läuft jede Antwort in Schritten ab, und das gilt für JEDEN Fall – auch für selbst erstellte:

**1. Verstehen** – Das Programm erkennt, worum es in einer frei getippten Frage geht (Atmung, Bewusstsein, Alter, Zeit, Vorerkrankungen, Medikamente, Blutung, Verletzung, Hautfarbe, Schweiß, wer dabei ist, Name …) – auch klein geschrieben, umgangssprachlich und mit mehreren Themen in einer Frage. Passt kein Thema, sucht es die passendste Frage aus der Abfrage.

**2. Wahrheit** – Für jedes Thema bestimmt das Programm, was DIESER Anrufer JETZT weiß (Zustand nach Ereignissen, sieht er den Patienten, kennt er ihn, ruft er selbst an) und gibt der KI genau das als „ehrliche Antwort“ mit. Bisher bekamen nur die Fragen per 🗨-Knopf diesen Hinweis – frei getippte nicht.

**3. Prüfen** – Die fertige Antwort wird gegen die Wahrheit geprüft: Atmung, Bewusstsein, Ja/Nein, Alter, Zeitangabe, Geschlecht, Anzahl, „allein“, Ich-Form beim Selbstanrufer.

**4. Reparieren** – Stimmt etwas nicht, wird die Antwort einmal mit klarer Korrektur neu erzeugt; klappt es dann immer noch nicht, kommt eine feste, richtige Antwort. Eine falsche Antwort wird nie angezeigt oder vorgelesen (prüfbare Antworten erscheinen erst nach der Prüfung).

**5. Anweisungen** – Das Programm entscheidet, ob eine Anweisung in dieser Lage geht: Einem Bewusstlosen wird nichts zu trinken gegeben, wer allein ist, kann niemanden zur Tür schicken, vor einer versperrten Tür kann man niemanden lagern, Herzdruckmassage bei einem wachen Patienten wird hinterfragt, ohne Spray kein Spray. Was ausgeführt wurde, merkt sich das Gespräch („Er liegt jetzt in stabiler Seitenlage“) und es gilt weiter.

**6. Stimmung** – Die Stimmung des Anrufers ändert sich: „Die Rettung ist unterwegs“ und klare Anweisungen beruhigen, eine Verschlechterung oder langes Warten ohne Zusage machen unruhiger.

**Zurück zum alten Verhalten**
- Einstellungen → KI-Anrufer → „Gesprächsablauf“: „neu“ (Standard) oder „klassisch – wie bis Version 0.37“
- Alle früheren Versionen bleiben auf GitHub unter „Releases“ zum Download

**Testlauf**
- In der Übersicht steht jetzt, wie oft das Programm eine Antwort nachbessern musste („vom Programm nachgebessert: neu erzeugt / feste Antwort“) – so sieht man, wie oft die KI danebenlag

## 0.37.0 – Testlauf für Krankentransporte und Überstellungen
**Testlauf**
- Der Testlauf spielt jetzt auch Anrufe an der Krankentransport-Hotline durch: Krankentransporte, Überstellungen oder beides – zu finden unter „🧪 Alle testen“ im Fall-Editor (Auswahl „Was“) und in der Einsatzliste unter „+ Test“ → „🧪 Testlauf KI-Gespräche …“
- Die Hotline fragt wie im Spiel (Wer, Patient, Grund, Abholort, Zeit, Ziel, sitzend/liegend, Besonderheiten; bei Überstellungen Dringlichkeit, Zustand, Übernahme), dazu eine frei getippte Frage, eine Rückfrage (manchmal absichtlich falsch), eine Mitteilung und den Abschied
- Kurz gehalten: ein Krankentransport hat etwa 12 Fragen, eine Überstellung etwa 16 – deutlich schneller als ein Notruf
- Jede Antwort wird gegen die Wahrheit geprüft: verdrehte Transportart, erfundene Uhrzeit, fehlender Name/Alter/Abholort/Ziel, falsche Angabe zu Begleitung, Sauerstoff oder Infektion, „der Patient“ beim Selbstanrufer, abgenickte falsche Rückfrage
- Nichts kommt ins Spiel, nichts wird vorgelesen; am Ende gibt es wie gewohnt die ZIP-Datei

**Krankentransport-Anrufer**
- „Der Patient kann nicht liegen, er muss liegend transportiert werden“: Die Transportart steht jetzt als ganzer Satz in der Anweisung an die KI („Sitzen geht nicht – er muss liegend transportiert werden“). Verdreht die KI es trotzdem, ersetzt das Programm die Antwort durch die richtige
- Ruft der Patient selbst an, redet er in der Ich-Form (nicht mehr „der Patient wohnt bei mir“)
- Begleitung, Sauerstoff und Infektion stehen als Sätze statt „ja/nein“; Uhrzeiten werden genau so genannt, wie sie ausgemacht sind; die Hotline wird gesiezt

## 0.36.0 – Zweiter Testlauf ausgewertet: Anrufer, Fälle und Testlauf feiner
Grundlage: der Testlauf mit v0.35.0 (420 Gespräche, qwen3:8b). Gegenüber dem Lauf davor: falsche Zusammenfassungen werden jetzt in 96 % der Fälle zurückgewiesen (vorher 13 %), „Seit wann?“ wird fast immer beantwortet, „der Patient“, „isch/nee/ick“ und erfundene Stockwerke sind weg.

**Anrufer-KI**
- Falsche Zeitangaben („seit dem Mittagessen“, „vielleicht zehn Minuten“) kamen aus Beispielsätzen in der Anweisung – die Beispiele haben jetzt keine Zeiten mehr; „weniger als 4/6 Stunden“ steht nicht mehr zusätzlich in den Fakten
- „Ich bin allein“, obwohl jemand da ist: der Satz zum Alleinsein steht nur noch, wenn der Anrufer wirklich allein ist, und wird nur auf Nachfrage gesagt
- Keine erfundenen Wegbeschreibungen, Hausfarben oder Geschäfte mehr; an Orten ohne Wohnung (Geschäft, Haltestelle, Spielfeld …) gibt es keine Tür zum Aufsperren
- Die Leitstelle wird gesiezt; Bewusstlosen wird nichts zu trinken gegeben; Anweisungen werden genau so ausgeführt („aufsetzen“ heißt nicht hinlegen)
- Auf „Die Rettung ist unterwegs“ kommt eine kurze menschliche Reaktion statt „Das mach ich eh schon“ oder Zustandsbericht
- Antworten, die die Frage wiederholen („Wie atmet sie? Sie …“), Fragen, die nur die Leitstelle stellt („Wie geht's ihm jetzt?“), und eine nochmals aufgesagte Adresse werden herausgefiltert
- Füllwörter höchstens jede dritte Antwort – zu viele werden automatisch entfernt
- Mehr falsche Dialektformen werden korrigiert (so'n, isser, ischt, keene, doll, guck, sorry …); „Jo, is net …“ wird zu „Na, is net …“
- Bestätigungen, Widerspruch und Verabschiedung wechseln ab (nicht mehr immer „Mhm, ja.“, „Nein, nein –“, „Danke, bis gleich.“)
- Wer selbst anruft und eingetrübt wird, bringt nur noch Laute heraus

**Fallakte (das, was die KI weiß)**
- Nach einer Verschlechterung stehen die alten Befunde (Farbe, Husten, „Baby hat keine Probleme“) nicht mehr in der Akte
- Protokoll-Stichworte („Nur Arme/Beine …“, „Schwach: tropft, lässt sich stillen“, „Ebenerdig / unter 3 m“) stehen als normale Sätze da
- Text gewinnt: wer verwaschen redet, „redet“ nicht „normal“; wer am Kopf blutet, ist nicht „unverletzt“; „rot im Gesicht“ ist nicht „normale Farbe“
- Selbstanrufer bekommen alle Fakten in Du-Form („Reden kannst du normal“)
- Kleinkinder „reden“ nicht und „wissen nicht, wo sie sind“
- Passanten kennen Namen und Krankheiten eines Bewusstlosen nicht; wer jemanden nur gefunden hat, sagt „gefunden vor …“

**Persönlichkeiten**
- Weg sind: „Ob er …? Moment …“ statt einer Antwort, „gerade erst heimgekommen“, „Kann wer eine Decke holen?“ ohne andere Leute
- „Unsicher“ gilt nur für Beobachtungen – nicht für den eigenen Namen, Alter oder Geschlecht der Angehörigen
- An öffentlichen Orten ist man nie allein; Rollen passen zum Namen (Maria ist „Freundin“, nicht „Freund“); Anrufer und Patient heißen nie gleich

**Fälle**
- Pflegeheim: Fieber seit gestern (vorher widersprach die Zeit), Ausgang B mit grauer Haut und dringendem Transport
- Sturz: keine widersprüchlichen Zeiten mehr; Kreislaufstillstand: kein „Gerät sagt Schock“ ohne Defi, kein Aufwärmen mit 80
- Psychische Krise: der Anrufer steht vor der Tür – keine Haustür, kein Lautsprecher, keine Haustiere, Substanzen „weiß ich nicht“
- Parkbank: Ausgänge klingen unterschiedlich (betrunken / schlägt nach dir / kein Alkohol)
- Fremdkörper Kind: der Ort passt zu dem, was verschluckt wurde; Asthma, Unterzucker, Geburt: kleinere Widersprüche behoben

**Testlauf**
- Hustet das Kind nicht mehr wirksam, kommen Rückenschläge statt Auflegen; nach Wiederbelebung Seitenlage; nach der Geburt Anleitung fürs Baby
- Reanimation erst im Kreislaufstillstand, Warnblinkanlage nur für Autofahrer, „Beine hoch“ nicht mehr bei Fieber
- Selbstanrufer werden nicht nach dem eigenen Geschlecht, der Hautfarbe oder „Sie reagieren nicht“ gefragt
- „Alle Ausgänge“ testet nur Ausgänge, die von selbst vorkommen
- Weniger Fehlalarme in der Übersicht („Eine Person.“ ist keine Wiederholung der Frage)

## 0.35.0 – Anrufer-KI, Fallmodell und Fall-Erstellung überarbeitet
Grundlage: der Testlauf mit 420 Gesprächen (alle Fälle, qwen3:8b), Gespräch für Gespräch ausgewertet.

**Der Anrufer widerspricht falschen Zusammenfassungen**
- Bisher wurde eine falsche Zusammenfassung fast immer mit „Ja, genau.“ bestätigt (93 %). Jetzt vergleicht das Programm die Zusammenfassung mit den Fakten: Ist etwas falsch, bekommt die KI den Hinweis „widersprich“ – und nickt sie trotzdem ab, wird die Antwort durch „Nein, nein – …“ mit dem richtigen Teil ersetzt
- Stimmt die Zusammenfassung, bestätigt der Anrufer kurz und abwechslungsreich (nicht immer „Ja, genau.“)

**Fragen, die vorher ins Leere gingen**
- „Seit wann ist das so?“, „Wie lange schon?“, „Um wie viel Uhr?“ werden als Fragen erkannt und beantwortet – vorher nie
- Die Zeit steht nur noch an einer Stelle in den Fakten (vorher widersprachen sich „seit zehn Minuten“ und „seit einer halben Stunde“)

**Was sich während des Gesprächs ändert, weiß jetzt auch die KI**
- Verschlechterung/Besserung (z. B. „Er wird ganz blau“) steht im Prompt unter „GERADE GEÄNDERT“ – vorher erzählte der Anrufer danach weiter vom alten Zustand
- Ruft der Patient selbst an und wird bewusstlos, kommt keine Antwort mehr, nur Geräusche

**Anrufer klingen echter**
- Ruft der Patient selbst an, redet er in der Ich-Form („Ich krieg schlecht Luft“) statt von „ihm“
- Kein erfundenes „Unten ist offen, zweiter Stock links“ mehr (das kam aus einem Beispiel im Prompt)
- „Ich schick jemanden raus“ nur, wenn wirklich jemand da ist – sonst sagt der Anrufer, dass er allein ist
- Fakten werden in eigenen Worten erzählt statt vorgelesen; dieselbe Tatsache hat mehrere Formulierungen, damit nicht jeder Anrufer gleich klingt
- Füllwörter, Eigenheiten und Stil werden pro Antwort neu angestoßen – vorher wirkten sie kaum
- Dialekt ohne deutsches „isch/nee/ick/so 'ne“, Hochdeutsch ohne „is/net“, gebrochenes Deutsch mit klaren Regeln; fremde Schriftzeichen werden entfernt
- Profis (Pflege, Ärzte) nennen Messwerte
- Persona passt zur Lage: wer allein ist, hat niemanden zum Türöffnen; „redet mit ihm“ nur, wenn der Patient wach ist; Medikamente nur bei Erwachsenen

**Fallgeschichten ohne Widersprüche**
- Hautfarbe und Schweiß ergeben sich aus dem Text (blass/grau → blass, „rot im Gesicht“ → nicht blass, „klatschnass“ → schwitzt)
- Bewusstlose sind nicht zugleich verwirrt oder „kurz weg gewesen“; schwanger nur bei Geburt/Schwangerschaft; „schwer zu tragen“ erst ab 16 Jahren
- Medikamente passen zu den Krankheiten (Herzinfarkt mit Aspirin, Blutverdünner bei Jüngeren wegen Thrombose, keine doppelten)
- Fälle korrigiert: Schnittwunde (Blutung passt zu „schwach“, Ausgang C blutet durch), Verkehrsunfall (Kurve, keine doppelte Beschreibung), Parkbank (brummt statt „rührt sich nicht“; Ausgang D ohne Alkohol, C schlägt nach dir), Hyperventilation, Psych (Anrufer sieht ihn nicht), Kreislaufstillstand (Defi nur im Geschäft/Sportplatz), Pflegeheim (Ausgang B mit schlechten Werten, keine Stockwerke), Schlaganfall, Geburt, Sturz

**Fall-Erstellung (Fall-Editor)**
- Die Anweisung für „Mit KI entwerfen“ ist neu: Felder für Ich-Form, Zustand (wach/Atmung), „sieht ihn nicht“, Vorerkrankungen, Stimmung, ein Ereignis pro Ausgang, Bedingungen wie [variante=B] – und klare Regeln gegen Widersprüche und Zeitangaben
- Neue Prüfung in Schritt 5: Widersprüche im Text (blass ↔ rot, stark ↔ schwach blutend, bewusstlos ↔ redet …), Zeitangaben im Text, Stockwerke in der Stelle, doppelte Texte, Bedingungen mit unbekanntem Ausgang, „sieht ihn nicht“ aber beschreibt ihn, Ausgänge, die am Telefon gleich klingen

**Testlauf**
- Fragt nach dem Ort, wenn er fehlt; überspringt unpassende Fragen (Geschlecht bei Geburt, Polizei-Fragen, „wach?“ beim Selbstanrufer)
- Anweisungen passen zur Lage (kein Auflegen bei Lebensgefahr, keine Rückenschläge bei Husten, keine Haustür im Freien); nach einer Verschlechterung kommt die passende Anleitung

## 0.34.0 – Testlauf für Notrufgespräche
**Testlauf (Fall-Editor)**
- Neuer Knopf „🧪 Testlauf“ bei jedem Fall: Ausgang wählen (A, B, C … oder alle) und wie oft – dann spielt das Programm die Notrufe automatisch durch, ohne Zwischenfragen
- „🧪 Alle testen“ spielt alle eingeschalteten Fälle durch
- Die Leitstelle fragt wie ein Calltaker: Adresse (bei Bedarf nachgefragt), was passiert ist, wer anruft, dann die Fragen des Kapitels in der Reihenfolge der Abfrage. Dazu kommen eine frei getippte Frage, eine Zusammenfassung (manchmal absichtlich falsch), „Die Rettung ist unterwegs“, eine passende Anweisung, die Nachfrage, ob sie etwas bringt, und – wenn der Fall eine hat – eine Verschlechterung oder Besserung
- Die KI formuliert wie sonst, es wird aber nichts vorgelesen. Das Spiel ist so lange pausiert, die Testgespräche kommen nicht ins Spiel
- Fortschritt mit Restzeit und Mitlesen; „Abbrechen“ hält an, die fertigen Gespräche bleiben
- Am Ende: ZIP-Ordner speichern – eine Übersicht mit allen auffälligen Antworten (sagt „der Patient“, zu lang, wiederholt die Frage, sagt etwas doppelt, verrät den Zustand zu früh, KI-Fehler, langsam) und je Gespräch ein Gesprächsexport

**Annehmen**
- Die vorbereitete erste Antwort kommt erst, wenn der Eröffnungssatz gesagt ist, mit einer kurzen Pause – nicht mehr sofort

**Fälle geprüft und bereinigt**
- Bewusstlose Patienten waren laut Fakten „im Kopf klar“, „kann ganze Sätze sprechen“ und „war kurz weg“ – das steht jetzt nicht mehr da
- „Ganz blass“ nur noch, wenn es schlimm ist – das verschluckte Kind ist rot im Gesicht, nicht blass
- Geburt: „schwanger ist sie nicht“ – jetzt richtig „sie ist schwanger“. Andere Frauen sind nicht mehr zufällig schwanger
- Unterzucker: spritzt Insulin (vorher stand Metformin da), ist verschwitzt und blass (vorher „schwitzt nicht“)
- Schlaganfall: die Seite im Einstiegssatz passt jetzt zur Seite in den Fakten
- Ruft der Patient selbst an, stehen Bewusstsein und Atmung in Ich-Form in den Fakten („Du kriegst ganz schlecht Luft“) statt „Du: ist wach“
- „Zuckerkranker“ → „zuckerkrank“, „Woran hat sich sie verschluckt?“ → „Woran hat sie sich verschluckt?“, „Das war seit heute früh“ → „Das geht so seit heute früh“, „es ist erst vor kurzem passiert“ bei zwei Stunden → „weniger als sechs Stunden her“

## 0.33.0 – Schnellere erste Antwort, freie Fragen, Orte je Fall
**Schneller**
- Klingelt ein Notruf, schreibt die KI schon die erste Antwort – beim Annehmen ist sie (fast) sofort da statt nach 10 Sekunden
- Die Anweisung an die KI bleibt während eines Anrufs gleich: Ollama muss sie nicht jedes Mal neu lesen, jede Antwort kommt schneller. Das Modell bleibt eine Stunde geladen (statt 15 Minuten)

**Freie Fragen werden verstanden**
- Fragen ohne Fragezeichen und klein geschrieben („was ist ihre adresse“, „okay danke was ist passiert“, „können sie mir sagen wo sie sind“) gelten jetzt als Fragen – vorher wurden sie als Mitteilung behandelt und der Anrufer antwortete „Ich schick jemanden raus“
- „Erzählen Sie mal, was passiert ist“ ist eine Frage, keine Anweisung; Fragen nach der Adresse werden als solche erkannt
- Anweisungen wie „dann tun Sie …“, „sonst führen Sie …“ werden erkannt

**Bessere Antworten**
- Adressen mit „St. Andrä“, „Dr.“ oder „3. Stock“ werden nicht mehr nach „St.“ abgeschnitten
- „Bitte schnell!“ zu Beginn: danach kommt jetzt auch die Adresse (vorher war nach „Es ist dringend!“ Schluss)
- „Hallo, bin ich richtig?“: der Anrufer fragt nur nach und wartet, statt sich selbst zu antworten
- Pflegekräfte sagten „meine Frau“ (wegen „Pflegeh**ehe**im“) – jetzt „die Frau Schmid“, „die Bewohnerin“
- Profis (Pflege, Ärzte) reden wie Profis: sachlich, mit Messwerten und Fachwörtern, stellen sich mit Namen und Heim vor. Sie wissen, ob jemand liegend transportiert werden muss und wie dringend es ist
- Anrufer wiederholen nicht mehr bloß die Frage („Der Transport ist dringend“, „Sie liegt liegend“) – sie sagen, was los ist
- Bei Anweisungen sagt der Anrufer, was er tut und sieht, statt „Aber sie atmet doch …“
- Weiß der Anrufer etwas nicht, weil er den Patienten nicht sieht (vor der versperrten Tür), sagt er das
- „Männlich“ → „ein Mann“
- Auf „Was ist passiert?“ bekommt die KI den Kern der Geschichte mit – damit sie nichts Falsches erfindet

**Mehr Abwechslung**
- Mehrere Einstiegssätze je Fall; das Pflegeheim-Beispiel würfelt Fieber, Werte, Stelle und Grund des Anrufs
- Pflegekräfte reden unterschiedlich (knapp, normal, neu im Haus, in Eile, schauen in die Doku …)
- Fall-Texte können Platzhalter in Wahlmöglichkeiten haben: „{Seit heute ist {er} schläfrig.|{Er} ist matt.}“

**Gesprochene Fragen**
- Mehr Fragen aus der Abfrage klingen gesprochen: „Sind Sie selbst auch verletzt?“, „Kann sie sitzen, oder muss sie liegend transportiert werden?“, „Warum braucht er die Rettung?“ statt „Ist der Anrufer selbst verletzt und nur leicht?“ oder „Grund der Anforderung“
- „A / B“ wird zu „A oder B“

**Orte je Fall (Fall-Editor)**
- Neu: „Vorkommen“ – nur an den markierten Orten, überall, oder überall außer an den markierten Orten (z. B. „überall außer Pflegeheim“)
- Fälle an Pflegeheim, Arztpraxis, Schule und Bahnhof passieren jetzt immer an einem echten Ort dieser Art (POI), wenn es einen im Gebiet gibt. Gibt es keinen und der Fall erlaubt andere Orte, wird einer davon gewählt

## 0.32.1 – Kürzere Antworten, Atemnot in Fetzen
- Auf die erste Frage und auf „Was ist passiert?“ sagen Anrufer jetzt nur das Wichtigste – ein, zwei kurze Sätze (gesprächige etwas mehr). Atmung, Bewusstsein, Alter und Zeit musst du erfragen
- Wer gleich mit dem Problem anfängt, ruft nur kurz heraus, was los ist
- Ruft jemand mit Atemnot selbst an, kommen nur kurze Fetzen mit Pausen („Ich krieg … kaum noch Luft … das Spray …“)
- Auch ein frei getipptes „Was ist passiert?“ gilt als diese Frage
- Kollaps: statt „in der Wärme“ steht jetzt da, wo es passiert ist (in der Messe, an der Kassa, beim Warten auf den Bus, im Wartezimmer)
- Ohne KI: auf Mitteilungen und Anweisungen kommt „Okay, danke“ bzw. „Okay, mach ich“ statt „Das weiß ich nicht“

## 0.32.0 – Notrufe wie echte Notrufe
**Jeder Anrufer ist anders**
- Jeder Anrufer bekommt eine eigene Persönlichkeit: wie er redet (knapp, normal, gesprächig, unsicher), eigene Füllwörter und manchmal eine Eigenheit (redet mit dem Patienten, sagt oft „Moment“, fragt, wie lange die Rettung braucht …)
- Wissen wie im echten Leben: Angehörige kennen Krankheiten und Alter (die Medikamente manchmal nur „irgendwas fürs Herz“), Nachbarn und Kollegen nur teilweise, Fremde gar nicht – sie schätzen das Alter („so zwischen 60 und 70“) und können den Patienten höchstens fragen
- Der Einstieg ist verschieden: mal gleich die Adresse, mal „Bitte schnell …“, mal „Hallo, bin ich da bei der Rettung?“, mal sprudelt das Problem heraus und die Adresse fehlt, mal fehlt die Gemeinde – dann musst du nachfragen
- Kein Anrufer sagt mehr „der Patient“: Angehörige sagen „meine Frau“, „die Mama“, „der Franz“, Fremde „der ältere Herr“, „die Dame“ – sonst „er“ oder „sie“

**Fälle mit Fakten statt fertiger Sätze**
- Die Fälle beschreiben jetzt, was wirklich passiert ist (Abfolge, Umstände) – die KI erzählt es bei jedem Anruf in den Worten des jeweiligen Anrufers neu. Die bisherigen Sätze dienen nur noch als Stilbeispiel
- Fakten mit Zufall („{beim Fernsehen|nach dem Essen}“) und Bedingungen: nach Ort, Anrufer, Ausgang und Wissen (eine Verkäuferin weiß nicht, wie es vor einer Stunde war)
- Anrufer passen zum Ort (keine Lehrerin in der Wohnung, kein Ehemann im Büro) und zum Alter; die Stelle passt zum Ort (kein Klassenzimmer in der Wohnung)

**Fragen aus der Abfrage**
- Ein Klick auf 🗨 stellt die Frage so, wie man sie spricht – ohne Klammertext und abwechselnd formuliert
- Bis das Geschlecht in der Abfrage eingetragen ist, fragst du allgemein („Ist der Patient wach?“), danach mit „er“/„sie“; bei mehreren Betroffenen bleibt es allgemein. Ruft der Patient selbst an, wird er mit „Sie“ gefragt

**Behoben**
- Die Anweisung an die KI widersprach sich („redet normal“ und gleichzeitig „nur einzelne Wörter“)
- „Wenn du selbst anrufst …“ stand auch bei anderen Anrufern drin
- Die Beispiel-Sätze in der KI-Anweisung enthalten keine Beschwerden mehr – die KI hat sie sonst übernommen („redet so komisch“, „schnauft schwer“), obwohl der Patient normal redet und atmet
- „Die Rettung ist unterwegs, bleiben Sie am Telefon“ gilt als Mitteilung: der Anrufer zählt nicht wieder den Zustand auf, sondern reagiert jedes Mal anders (Danke, „Wie lang dauert's?“, „Was soll ich tun?“, schickt jemanden zum Einweisen …)
- Fremde sagen auf „Wer ruft an?“ nicht mehr „Ich bin der Passant“, sondern wie sie dazugekommen sind
- Die erste Antwort bleibt bei der Adresse (Stock, Tür, Zufahrt erst auf Nachfrage)

**Fall-Editor**
- Schritt 2 heißt jetzt „Anrufer & Geschichte“: Fakten, Stilbeispiele, Details, feste Umgebung (z. B. „3. Stock, enges Stiegenhaus“) und Hinweise fürs Gespräch – mit Hilfe zu allen Bedingungen
- „Prüfen & Testen“: „3 Probe-Anrufe“ würfelt drei verschiedene Anrufer (Rolle, Stimmung, Art zu reden, Wissen, Einstieg) und lässt sie mit der KI die ersten Fragen beantworten – ohne dass etwas ins Spiel kommt
- Der KI-Entwurf schreibt auch Fakten

## 0.31.0 – Fall-Editor
**Fälle selbst schreiben**
- Neuer Knopf „Fälle“ oben (auch unter Einstellungen → Einsatzaufkommen): alle Fälle des Fallkatalogs ansehen, neue schreiben, prüfen und gleich durchspielen
- Fünf Schritte mit Auswahllisten statt Programmcode: 1 Grundlagen (Name, Thema, Häufigkeit, Alter, Ort, Jahreszeit/Uhrzeit/Wetter) · 2 Anrufer & Hergang (wer anruft, was er erzählt, Details, Stimmung) · 3 Abfrage (die Fragen deines Abfrageschemas der Reihe nach – du legst die wahre Antwort fest, der Code ergibt sich zur Kontrolle von selbst; auch je Ausgang unterschiedlich) · 4 Ausgänge (Wahrscheinlichkeit, Sichtung, Lagebild, Notarzt-Bedarf nach Kompetenz, Krankenhaus, Feuerwehr/Polizei, Revers, Tod, Verlauf mit Anleitungen am Telefon) · 5 Prüfen & Testen
- Die Ampel oben prüft live: grün = spielbar, gelb = spielbar mit Hinweisen (z. B. offene Fragen, die das Spiel selbst beantwortet), rot = so nicht spielbar
- „Diesen Fall durchspielen“ startet sofort einen Notruf mit dem Fall (auch mit einem bestimmten Ausgang)
- Optional: „✨ Entwurf mit KI“ – kurze Beschreibung eingeben, die KI macht einen Entwurf, danach ist alles von Hand änderbar. Leer beginnen geht immer
- Jeder Fall lässt sich im Spiel ein- und ausschalten

**Eingebaute Fälle**
- Eingebaute Fälle sind gesperrt (nur ansehen oder als eigenen Fall kopieren). Mit dem Admin-Passwort lassen sie sich ändern; die Änderung liegt neben dem Original und lässt sich jederzeit zurücksetzen

**Fallpakete**
- Exportieren: gewählte Fälle als .json-Datei speichern und weitergeben
- Importieren: eigene Fälle mit gleicher ID werden ersetzt; eingebaute nur mit Admin-Freigabe (sonst kommen sie als Kopie dazu). Fehlerhafte Fälle werden übersprungen und genannt

## 0.30.0 – Rendezvous mit dem NEF, Storno über Fahrzeugfunk
**Rendezvous RTW – NEF**
- Braucht der Patient (gelb oder rot) einen Notarzt und ist das alarmierte NEF noch mehr als 15 Minuten entfernt, fährt die Besatzung mit dem Patienten los und trifft das NEF unterwegs
- Der Treffpunkt liegt so, dass beide etwa gleich lange fahren; er ist auf der Karte markiert, bis sich beide getroffen haben
- Am Treffpunkt steigt der Notarzt zu (3–8 Minuten), danach entscheidet er wie am Einsatzort, ob er mitfährt
- Nur mit einem mit- oder nachalarmierten NEF (kein Hubschrauber). Den Funk zwischen RTW und NEF hörst du mit, an LEO geht keine eigene Meldung
- Neue Einstellung „Rendezvous RTW – NEF“ (Standard: an)

**NEF-Storno durch die Besatzung**
- Braucht der Patient keinen Notarzt, storniert der RTW das NEF selbst über Funk: „NEF von RTW kommen – Hier NEF kommen – Patient stabil, das ist ein Storno für euch – Storno verstanden, frage LEO mitgehört“
- Im Funk erscheint dann „fragt: LEO mitgehört?“ mit dem Knopf „Mitgehört, ENDE“ (oder sprechen/tippen: „Hier LEO, mitgehört, ENDE“)

**Kleinigkeiten**
- Funkverlauf zeigt Fahrzeugfunk mit beiden Funkrufnamen; Vorlesen mit der Stimme des jeweiligen Fahrzeugs
- Fallgeschichten: zwei Platzhalter wurden nicht ersetzt („{seines}“, „{zweimal}“)
- Verändert sich der Patient, bevor die Lagemeldung kommt, nennt die Besatzung jetzt alles, was sie braucht (auch BIT oder weitere Rettungsmittel), nicht nur den Notarzt

## 0.29.0 – Fallkatalog: Einsätze aus einer stimmigen Wahrheit
**Neu: Fallkatalog (Test)**
- Jeder Einsatz entsteht jetzt aus einem Fall: zuerst steht fest, was wirklich los ist (Patient, Verlauf, was die Besatzung vorfindet, Notarzt-Bedarf, Krankenhaus). Telefonat, Lagemeldung und Buchung werden daraus abgeleitet – so widerspricht sich nichts mehr (kein „wach + Schnappatmung“, keine Polizei ohne Grund)
- 16 Fälle zum Testen, viele davon harmlos oder „klingt schlimm, ist harmlos“: Fremdkörper beim Kleinkind, Brustschmerz (auch unauffällig), Schlaganfall, Sturz mit Hüftbruch, Kreislaufstillstand, Verkehrsunfall mit Eingeklemmtem, Unterzucker, Asthma, Geburt, psychische Krise, Kollaps, Hyperventilation, Person auf Parkbank, Schnittwunde, Pflegeheim mit Fieber, Hexenschuss. Jeder mit mehreren Varianten (Anrufer, Ort, Patient, Ausgang)
- Der Code ergibt sich aus deiner Abfrage – es gibt keinen „richtigen Code“, deshalb funktioniert es mit jedem Abfrageschema

**Notarzt nach Kompetenz**
- Ob ein Notarzt gebraucht wird, hängt vom Patienten und davon ab, wer vor Ort ist (RS, NFS, NKV, NKI – nach der Scope of Practice des RKNÖ; NKA zählt wie NFS). Beispiel Asthma: ein RS fordert den NA nach, ein NFS nicht
- Die Besatzung entscheidet nach dem, was sie sieht: unauffälliger Brustschmerz → kein NA („kann storniert werden“), kaltschweißig mit Hebungen im EKG → NA
- Ist der NA schon vor Ort, fährt er öfter mit (rot und nach NA-Maßnahmen immer, gelb oft, grün nie)
- Fehlt der nötige NA, verschlechtert sich der Patient nach der Zeit aus dem Fall
- Den Tod stellt der Notarzt fest – ohne NA wartet die Besatzung

**Anleitungen am Telefon**
- Anweisungen wie Fremdkörper-Manöver, Reanimation, Druck auf die Wunde, Zucker trinken, Beruhigen werden erkannt und verbessern den Verlauf (z. B. löst sich der Fremdkörper, Laien-Reanimation mit AED)

**Einstellungen**
- „Einsätze aus dem Fallkatalog“: nur Katalog (Standard, zum Testen) / gemischt / aus
- „Transportverweigerung (Revers)“: normal / selten / aus – höchstens ca. 15 % der passenden Fälle, nur bei wachen, stabilen Patienten

## 0.28.1 – Hausarzt-Fälle ins nächste Haus
- Hausärztlich versorgbare Patienten und Bagatellverletzungen kommen ins nächste offene Haus – PVZ oder Krankenhaus, je nachdem, was näher ist (vorher hatte das PVZ immer Vorrang, bis 25 km)

## 0.28.0 – Fenster „Akutversorgung“ und Primärversorgungszentren
**Akutversorgung**
- Neues Fenster „Akutversorgung“ (auch als Ansicht im KH-Status umschaltbar): je Haus SRT, SRI, PCI, CT, Endoskopie, Stroke, Notaufnahme, Unfall, Kinder und Kreißsaal – wie die Übersicht der Leitstelle
- Grün = verfügbar, rot = belegt, grau = geschlossen, leer = gibt es dort nicht. Schockräume mit einem Zeichen je Raum (St. Pölten: 2 × SRI)

**Primärversorgungszentren (PVZ)**
- Neu: PVZ Böheimkirchen, St. Pölten, St. Pölten Nord, Tullnerfeld, Wiener Neustadt und Wienerwald – Adressen und Öffnungszeiten von ihren Websites
- Ein PVZ ist keine Notaufnahme: Es nimmt nur unter der Woche zu den Öffnungszeiten Patienten, die sonst nur einen Hausarzt bräuchten (neue Verdachtsdiagnosen „Hausärztlich versorgbar“ und „Bagatellverletzung“, nur bei grün gesichteten Erwachsenen). Kleine Verletzungen nicht in Böheimkirchen
- Ist das PVZ zu, fährt die Besatzung ins Krankenhaus

**Daten**
- Zwettl hat eine Notaufnahme (laut Übersicht Akutversorgung)

## 0.27.2 – NÖ-Krankenhäuser nach der Akutversorgungs-Übersicht von Notruf NÖ
- Schockräume je Haus wie in der Übersicht: Trauma (SRT), internistisch (SRI) oder beides in einem Raum. St. Pölten 2 internistisch + 1 Trauma; nur Trauma: Korneuburg; nur internistisch: Melk, Mödling, Neunkirchen, Stockerau, Waidhofen/Thaya
- Kein Schockraum mehr in Hainburg und Klosterneuburg
- Unfallaufnahme jetzt auch in Gmünd, Hainburg, Hollabrunn, Klosterneuburg und Waidhofen/Thaya (eine Unfallaufnahme reicht für Unfallpatienten, auch ohne eigene Unfallabteilung)
- Neu: Medizinisches Zentrum Gänserndorf mit allgemeinmedizinischer Notfallambulanz rund um die Uhr (Unfälle gehen nach Mistelbach)
- Herzkatheter, Stroke Units und Notaufnahmen in NÖ stimmten schon und sind jetzt bestätigt
- Eisenstadt mit internistischem Schockraum, UKH Meidling und UKH Linz mit je einem Trauma-Schockraum

## 0.27.1 – Krankenhaus-Plätze aus amtlichen Daten statt Schätzungen
- Herzkatheterlabore laut ÖSG-Großgeräteplan (Ist-Stand), Stroke-Unit-Betten und Notaufnahme-Behandlungsplätze laut den Regionalen Strukturplänen (NÖ, Wien, OÖ, Steiermark, Burgenland)
- Schockräume: genannte Zahlen der Häuser (z. B. Graz 3, Ottakring 1 Trauma + 2 internistisch, Hietzing 2), sonst Mindestvorgabe nach Traumazentrum-Stufe (Weißbuch: überregional 2, regional/lokal 1); NÖ-Kliniken mit Unfall/Notaufnahme haben mindestens einen
- Kreißsäle aus genannten Zahlen bzw. Geburten pro Jahr (LGA- und OÖG-Geschäftsbericht 2025, Geburtenregister Steiermark, Kliniksuche des Ministeriums); Notaufnahmen aus Patientenzahlen, wo veröffentlicht
- Thrombektomie nur in den Schlaganfall-Spezialzentren laut RSG: St. Pölten, Tulln, Wiener Neustadt, AKH, Landstraße, Barmherzige Brüder Wien, Neuromed Linz, Uniklinikum Graz
- Geschätzt (nach Betten) wird nur noch, wo sich nichts finden ließ – vor allem Unfallambulanz und Kindernotaufnahme

## 0.27.0 – Öffnungszeiten, Plätze und Belegung der Krankenhäuser, Fenster „KH-Status“
**Öffnungszeiten**
- Notaufnahmen, Unfallambulanzen, Kindernotaufnahmen, Herzkatheter, Schockräume, Kreißsäle, Stroke Units und Druckkammer haben jetzt ihre Zeiten laut Website (z. B. Notaufnahme Elisabethinen Graz Mo–Fr 7–15, Barmherzige Schwestern Wien Mo–Fr 8–18, Herzkatheter Waidhofen/Ybbs Mo–Fr 7–19, Unfall Neunkirchen Mo–Fr 7:30–15:30). Ohne Angabe gilt rund um die Uhr
- Ist die Notaufnahme zu, nimmt das Haus keine allgemeinen Rettungspatienten; Kreißsaal, Herzkatheter, Stroke Unit und Schockraum zählen nach ihren eigenen Zeiten
- Linzer Aufnahmerad nach dem offiziellen Kalender (21-Tage-Zyklus, Wechsel um 7 Uhr): Barmherzige Schwestern, Barmherzige Brüder/Elisabethinen und Kepler wechseln sich ab; Stroke und PCI nach den Sonderregeln. Wiener Herzinfarkt- und Schlaganfall-Dienste (Landstraße, Hanusch) als Zeitfenster
- Thrombektomie nur noch, wo sie wirklich gemacht wird (Wien: AKH, Landstraße, Barmherzige Brüder; Graz: Uniklinikum; nicht Wels)

**Plätze und Belegung**
- Jedes Haus hat Plätze je Bereich: Schockraum (Trauma, internistisch oder kombiniert), Herzkatheter, ECMO, Notaufnahme, Unfall, Kindernotaufnahme, Kreißsaal, Stroke Unit, Druckkammer – genannte Zahlen von den Websites, sonst aus der Größe des Hauses (Betten laut Krankenanstalten-Verzeichnis, Patientenzahlen). St. Pölten: 2 internistische + 1 Unfall-Schockraum, Krems: 1 Schockraum
- Dein Patient belegt ab der Buchung einen Platz (Schockraum 30–60 min, PCI 60–90 min, Notaufnahme 2–4 h, Kreißsaal 4–8 h …)
- Grundbelegung durch andere Patienten mit Tageskurve (vormittags viel, nachts kaum); Schockraum, PCI, ECMO und Druckkammer nur sehr selten. Einstellungen → Einsatzaufkommen: Regler und Ausschalter
- Die Besatzung bucht ein offenes Haus mit freiem Platz. Beim Buchen siehst du „zu“ oder „belegt“ – wählen kannst du trotzdem, niemand meldet sich

**Anzeige**
- Karte: kleines Fenster mit dem Wichtigsten (offen/zu, freie Plätze) und „Mehr Info“ mit allen Akut-Abteilungen, Stationen, Ambulanzen und Zeiten. Quellen stehen nur noch in den Einstellungen
- Neues Fenster „KH-Status“ (Fenster-Menü): alle Häuser in der Nähe mit freien Plätzen in Notaufnahme, Unfall, Kinder, Schockraum, PCI, Stroke Unit und Kreißsaal

## 0.26.0 – Krankenhäuser mit Stationen und Ambulanzen, Buchung nach Verdachtsdiagnose
**Krankenhäuser**
- Für jedes Krankenhaus steht jetzt, welche Einrichtungen es hat: Stationen, Intensiv- und Überwachungsstationen, Ambulanzen, Funktionsbereiche (CT, Herzkatheter, Schockraum, Kreißsaal …) und Zentren. Recherchiert auf den offiziellen Websites aller 96 bisherigen Häuser (Stand Oktober 2026); was dort nicht belegt ist, ist nicht eingetragen
- 11 Häuser neu, darunter die Privatkliniken in Graz und Linz, das Evangelische Krankenhaus Wien, Hinterbrühl und Rosenhügel (Kinder- und Jugendpsychiatrie)
- Daraus ergeben sich automatisch die Akut-Abteilungen (z. B. Herzkatheter, Stroke Unit, Unfallchirurgie, Kreißsaal). Im Krankenhaus-Fenster hakst du die Einrichtungen an und kannst einzelne Akut-Abteilungen abschalten („nimmt nicht akut auf“). Privatkliniken und Häuser ohne Notaufnahme nehmen keine Rettung auf
- Die Karte zeigt beim Krankenhaus seine Akut-Abteilungen; die Krankentransport-Ziele kommen ebenfalls aus den Einrichtungen

**Buchen nach Verdachtsdiagnose**
- Jeder Patient hat eine verborgene Verdachtsdiagnose (STEMI, Schlaganfall, Polytrauma, Augenverletzung, Exsikkose …), die sich erst beim Patienten ergibt
- Die Besatzung bucht fast immer selbst das passende Haus. Nur bei Reanimation oder mehreren Patienten (selten auch sonst) bittet sie die Leitstelle und nennt den Verdacht
- Zeitkritische Diagnosen und Fächer wie Auge, HNO, Gyn/Geburt, Urologie, Psychiatrie und Kinder gehen immer ins passende Haus. Nicht kritische internistische Patienten dürfen auch auf jede Notaufnahme, nicht kritische Unfälle auf jede Unfallchirurgie
- In der Einsatzmaske wählst du den Verdacht; die Krankenhäuser stehen nach Entfernung mit „passend“, „Ausweich“ oder „Rückfall“, alle anderen bleiben (grau) wählbar. Die Farbe daneben zeigt die Dringlichkeit des Patienten. Deine Buchung gilt immer – die Besatzung fährt ohne Kommentar hin

## 0.25.0 – Feuerwehr, Polizei, Berg- und Wasserrettung mit eigenen Fahrzeugen
**Dienststellen auf der Karte**
- Neu in den Standarddaten (aus OpenStreetMap): 452 Feuerwehren (je Gemeinde die Hauptfeuerwehr, dazu die Bezirkskommanden), 197 Polizeiinspektionen, 30 Bergrettungs- und 4 Wasserrettungs-Stützpunkte. Sie erscheinen als kleine farbige Punkte erst beim Hineinzoomen (Feuerwehr rot, Polizei dunkelblau, Bergrettung grün, Wasserrettung türkis)
- Eigene Stützpunkte legst du wie bisher an (Dienststelle → Typ Feuerwehr/Polizei/Bergrettung/Wasserrettung). In den Fahrzeuglisten tauchen sie nicht auf

**Alarmieren und Fahren**
- Die Knöpfe im Einsatz alarmieren jetzt echte Fahrzeuge: Feuerwehr und Polizei mit 3, Berg- und Wasserrettung mit 1 Fahrzeug, immer von der nächsten Dienststelle, Ausrücken innerhalb von 2 Minuten. Sie fahren auf der Karte mit (klein, in ihrer Farbe) und stehen mit ihrem Status unter den Knöpfen
- Knopf gelb = wird gebraucht (aus Abfrage und Code), ⏱ = unterwegs, ✓ = vor Ort. Niemand davon transportiert Patienten
- Wann wer gebraucht wird: Feuerwehr bei Brand, austretenden Stoffen, eingeklemmten Personen, Verkehrsunfällen und Türöffnungen; Polizei bei Gewalt/Waffen, Unterbringung, Verkehrsunfällen, Unfällen im öffentlichen Raum, Arbeitsunfällen und wenn sie selbst anfordert (dann ist sie schon dort); Bergrettung, wenn jemand in der Natur nicht weiß, wo er ist (und beim Alpinunfall); Wasserrettung nur, solange die Person noch im Wasser ist
- Wo ohne sie nichts geht (Befreiung, Brand, Suche, Person im Wasser), wartet die Besatzung, bis sie eingetroffen sind, und erinnert per Funk
- Die Feuerwehr bleibt nach dem Rettungsdienst noch 10–20 Minuten, die anderen fahren mit ihm ab
- Person im Wasser bzw. verirrt in der Natur kommt vor allem dort vor, wo es eine Wasser- bzw. Bergrettung gibt

**Gewalt und Waffen**
- Ist beim Alarmieren klar, dass Gewalt oder Waffen im Spiel sind, legt LeitWerk einen Bereitstellungsraum ca. 500 m vom Einsatzort fest (Einsatzmaske und Karte). Alle Fahrzeuge außer der Polizei fahren zuerst dorthin
- Etwa 5–10 Minuten nach dem Eintreffen der Polizei meldet die Polizei-Leitstelle per Funk „Einsatzort gesichert“ – dann fährt der Rettungsdienst zu und es läuft ein normaler Einsatz
- Ein Polizeifahrzeug begleitet den Transport ins Krankenhaus und fährt nach der Übergabe wieder

## 0.24.0 – Fahrzeugarten und -modelle, Reiter NEF ÖAMTC und EL, Einsätze in Nachbarzonen (Work in Progress)
**Fahrzeuge**
- Im Fahrzeug-Fenster wählst du zuerst die Fahrzeugart (RTW, KTW, NEF, EL …). Ein zweites Feld kommt nur, wo es etwas zu unterscheiden gibt: RTW / RTW groß (Crafter, kein C) / RTW-C, KTW / KTW-B, NEF / NEF ÖAMTC, BEL / EL ÖBB. Beim KTW und BEL zusätzlich das Fahrzeug (oder „zufällig“). Die Felder „Fahrzeugtyp“ und „Fahrzeuggröße“ sind weg
- Passende 3D-Modelle: NEF = VW T6, NEF ÖAMTC = VW Tiguan, KTW = VW T6 Hochdach oder Mercedes Sprinter kurz, BEL = VW Passat oder T6, EL ÖBB = VW Caddy, SKTW = Sprinter lang, SRTW/SNAW = Sprinter groß, BIT = MAN TGL mit Koffer
- KTW: 30 % normale KTW, 70 % KTW-B (auch bei bereits importierten Fahrzeugen)
- Die Ausweich-NEFs heißen jetzt „NEF ÖAMTC“

**Fahrzeuglisten**
- Neue Reiter „NEF ÖAMTC“ (die Ausweich-NEFs, nicht mehr unter „NEF“) und „EL“ (BEL und EL ÖBB, mit Filter „nur BEL“ / „nur EL ÖBB“)
- „Nachtflug“ steht nicht mehr in den Listen – die Dienstzeiten sind ja sichtbar

**Einsätze in Nachbarzonen (Work in Progress, standardmäßig aus)**
- Einstellungen → Einsatzaufkommen: Einsätze knapp außerhalb deiner Funkgruppe, die der Kollege der Nachbarzone mit dem planmäßigen Code anlegt und nach Vorschlag disponiert. Du siehst nur die, zu denen deine Fahrzeuge fahren – meistens das NEF, manchmal auch RTW oder Hubschrauber; was die Nachbarzone selbst schneller schafft, fährt nicht
- Nur normale Einsätze mit einem Patienten. In deiner Liste und auf der Karte grau, mit „Zone NÖ-0x“. Funkverkehr hörst du nur, wenn du deine Fahrzeuge dort selbst anfunkst
- In der Gegend eines Notrufs, der gerade läutet oder abgefragt wird, kommen keine solchen Einsätze
- Häufigkeit mit Schieberegler; beim Einschalten ein Hinweis, dass Fehler auftreten können, die im laufenden Spiel nicht behebbar sind

## 0.23.0 – Eigenes LeitWerk-Codesystem
**LeitWerk-Codesystem (mitgeliefert, frei verwendbar)**
- LeitWerk bringt jetzt ein eigenes, eigenständig formuliertes Codesystem mit: 38 Kapitel (Hauptbeschwerden) mit eigenen Fragen und Regeln, über 500 Codes im Aufbau **KK-Sx-NN** – Kapitel, Dringlichkeitsstufe S0 (Beratung/Weitergabe) bis S5 (Reanimation), laufende Nummer. Zusätze: /L liegt über 1 Stunde am Boden, /A Witterung bzw. schwer erreichbar, /M mehrere Verletzte, /P Polizei verständigt. Manuelles Aufwerten auf S3/S4
- Passende Einsatzstufen (Rettungsmittel je Stufe) sind dabei. Ohne eigenes Codesystem gilt automatisch das LeitWerk-Codesystem – neue Spieler können sofort Notrufe abfragen
- Wer ein eigenes lädt (z. B. euer bisheriges), spielt wie gewohnt damit weiter; „Zurück zum LeitWerk-Codesystem“ wechselt zurück

**Fallgeschichten passen zu jedem Codesystem**
- Fallgeschichten, Anrufer, Lage, Feuerwehr/Polizei-Bedarf und Wetter hängen nicht mehr an Kapitelnummern, sondern an neutralen **Themen** (Sturz, Atemnot …) und **Merkmalen** („liegt 1–2 Stunden am Boden“, „Sturz über die Stiege“ …)
- Ein Codesystem ordnet seine Kapitel einem Thema zu („thema“); Fragen mit anderen Bezeichnungen lassen sich über „merkmal“/„merkmal_wert“ zuordnen. Ältere Schemas ohne Zuordnung laufen über die gewohnte Nummerierung weiter
- Beim Laden zeigt LeitWerk an, welche Kapitel kein Thema haben; Beispiel-Codesystem und KI-Anleitung erklären das neu
- Neue Einsatzstufe „Alpinunfall“ (fehlte bisher)

## 0.22.1 – Schicht in der Liste, Ausweich-NEF, Orte
- In den Fahrzeuglisten steht jetzt immer die aktuelle Schicht (z. B. „◷ 07–19“); kurz vor Dienstende hervorgehoben. Länger mit der Maus darauf: kleine Wochenübersicht aller Schichten
- „Rund um die Uhr“ zeigt im Dienstplan zwei echte Schichten (07–19 und 19–07) – Tage lassen sich jetzt auch dort wählen; ebenso bei allen anderen 24/7-Modellen
- Hubschrauber, die nicht fliegen können (Wetter, Nacht ohne Nachtflug), melden sich selbst ab und bei Flugwetter wieder an. Ist ein Hubschrauber abgemeldet – vom Spiel oder von dir –, meldet sich sein Ausweich-NEF an (gleiche Besatzung ohne Pilot)
- Im Fahrzeug-Dialog beim NEF: „Nur Ausweichfahrzeug für einen Hubschrauber“ mit Auswahl des Hubschraubers; der eigene Dienstplan entfällt dann. Beim Hubschrauber steht, welches NEF ihn vertritt
- Eigene oder früher importierte Fahrzeuge (z. B. 99/902) bekommen die Ausweich-Zuordnung der Standarddaten, solange du nichts anderes eingestellt hast
- Ein kleiner RTW (VW T6) ist nie ein RTW-C – egal, wer drauf sitzt
- Orte: Krankenhäuser und Dienststellen werden in der Orte-Liste gleich mit angezeigt und mitgezählt

## 0.22.0 – Ersatz-NEF, lesbare Dienstpläne, Filter, Orte mit Kategorien, Codesystem in einer Datei
**Fahrzeuge und Dienststellen**
- Jeder Notarzthubschrauber (nicht der ITH) hat ein **ÖAMTC-NEF** am selben Stützpunkt (99/002 → 99/902, 99/003 → 99/903 …). Es meldet sich nur an, wenn der Hubschrauber im Dienst ist, aber nicht fliegen kann (Wetter, Nacht ohne Nachtflug) – mit derselben Besatzung ohne Pilot. Kann wieder geflogen werden, meldet es sich nach dem laufenden Einsatz ab. Im Fahrzeug-Dialog unter „Ersatz für Hubschrauber“ einstellbar
- Stützpunkte heißen jetzt „ÖAMTC Luftrettungszentrum Christophorus 2“ usw. (C3/C33: „ÖAMTC Luftrettungszentrum Ost“); eigene Listen mit den alten Namen passen weiterhin
- In den Listen im Spiel steht beim Fahrzeug der ausgeschriebene Name (z. B. „Christophorus 2“) statt der Dienststelle
- 99/033 ist der ITH; „Quelle: Paul (Nord-NÖ)“ ist aus den Daten verschwunden

**Dienstpläne lesbar**
- Wochenübersicht (Mo–So, je eine 24-Stunden-Leiste, jedes Team in eigener Farbe, rote Linie = jetzt): im Fahrzeug-Dialog, beim Darüberfahren mit der Maus über einen Funkrufnamen in Listen und Vorschlägen, in der Dienstplan-Spalte der Fahrzeugliste und im Karten-Fenster einer Dienststelle
- Rund um die Uhr mit wählbarem Schichtmodell: 07–19 + 19–07, 06–18 + 18–06, 05–13 + 13–21 + 21–05 oder eigene Wechselzeiten (z. B. „06, 14, 22“)

**Einstellungen: filtern und sortieren**
- In allen Listen (Fahrzeuge, Dienststellen, Krankenhäuser, Orte, Einsatzcodes): Klick auf einen Spaltenkopf sortiert (nochmal = absteigend, dritter Klick = normal)
- Filter je Liste, z. B. Fahrzeuge nach Kategorie, Typ, Dienststelle, Organisation, Gebiet (Funkgruppe), im Dienst / außer Dienst, aktiv; Orte nach Kategorie und Ort

**Orte mit Kategorien**
- POIs heißen jetzt „Orte“ und haben eine oder mehrere Kategorien: Kindergarten, Schule, Pflegeheim, Bahnhof, Einkauf, Sport, Bad, Lokal, Arztpraxis, Betrieb, Freizeit, Hubschrauber-Landeplatz, Feuerwehr, Polizei, Wasserrettung, Bergrettung, Sonstiges. Krankenhäuser und Dienststellen zählen automatisch als Orte (in der Orte-Liste mit „auch Krankenhäuser und Dienststellen“)
- Die Kategorie wirkt im Spiel: passt eine Fallgeschichte (Sturz im Pflegeheim, Kind in der Schule, Notfall am Bahnhof …), passiert der Einsatz meist an einem echten Ort dieser Kategorie im Gebiet – Kleinkinder im Kindergarten, Schulkinder in der Schule. Orte sind in der Adresssuche zu finden
- Dienststellen-Typen Feuerwehr, Polizei, Wasserrettung und Bergrettung (eigene Fahrzeuge folgen später)

**Codesystem: Codes und Abfrage in einer Datei**
- Ein Codesystem ist eine JSON-Datei mit Einsatzcodes, Abfrage und (neu) Einsatzstufen. Beim Laden prüft LeitWerk die Datei und zeigt verständliche Fehler und Hinweise; beim Wechsel auf ein anderes Codesystem werden die alten Codes auf Wunsch entfernt
- „Als eine Datei speichern …“ schreibt das geladene Codesystem samt Codeliste in eine Datei
- „Beispiel-Codesystem …“: kleines, frei erfundenes Beispiel mit einer ausführlichen Anleitung für eine KI – sie weiß damit ohne weiteren Zusammenhang, welche Fragen sie dem Ersteller stellen muss, und erzeugt eine gültige Datei
- Eigene Dringlichkeitsstufen im Code (z. B. „02-S4-01“) für das Aufwerten

**Abfrage und Einsätze**
- Kapitel 33 (Anforderung Arzt/Pflege): der gewählte Grund (z. B. Herzbeschwerden) bestimmt den Code; Bewusstsein/Atmung zählen nur, wenn kein bestimmter Grund gewählt ist
- Ruft ein Arzt, Pflegeheim oder eine Ordination an, ist der Fall auch in Wahrheit eine Anforderung (Kapitel 33)
- Überstellungen STEMI/Akut-PCI und Thrombektomie immer mit Notarzt

## 0.21.0 – Dienstpläne, Fahrzeugtypen, neues Einstellungsfenster
**Dienstpläne**
- Jedes Fahrzeug hat einen Dienstplan aus Schichten: Wochentage (einzeln oder Mo–Fr / Sa / So / täglich), Beginn und Ende – auch „Sonnenaufgang bis Sonnenuntergang“ für Hubschrauber (je nach Datum). Ohne Dienstplan: rund um die Uhr mit zwei Teams (07–19 und 19–07)
- Jede Schicht hat ein eigenes Team. Läuft beim Schichtwechsel noch ein Einsatz oder Transport, macht das alte Team ihn fertig; danach steht das neue Team frei auf der Wache bzw. das Fahrzeug meldet sich ab
- Außer Dienst: nicht in den Vorschlägen, in den Listen „außer Dienst bis …“. Für Krankentransporte werden Fahrzeuge vorgeschlagen, die zur Abholzeit im Dienst sind – auch wenn sie jetzt noch nicht angefangen haben
- Eine Stunde vor Dienstende ein dezentes ◷ am Fahrzeug, 30 Minuten vorher deutlicher mit Uhrzeit
- Bearbeiten unter Einstellungen → Leitstelle → Fahrzeuge; Import mit Spalten „Wochentag(e) / Beginn / Ende“ (eine Zeile je Schicht, wie aus SIM Dispatcher) oder einer Spalte „Dienstplan“ („Mo–Fr 07:00–19:00; Sa 08:00–16:00“)
- Die mitgelieferten Fahrzeuge haben die Dienstzeiten aus deiner Liste (aktualisiert, nichts doppelt)

**Fahrzeugtypen**
- RTW gibt es klein (VW T6 Hochdach) und groß (VW Crafter). Je Dienststelle nur ein RTW-C – weitere „RTW-C“ sind große RTW (z. B. 75/002, 73/003); Ortsstellen haben ihren eigenen RTW-C. In 3D passt das Fahrzeug
- KTW und KTW-B werden beim Import zufällig verteilt. KTW-B (Zivildienst) fährt nie mit Blaulicht und kommt bei Blaulicht-Einsätzen in den Vorschlägen nach hinten; in der Rangfolge kann „KTW-B“ auch eigens stehen
- Typ, Größe und Dienstplan im Fahrzeug-Dialog einstellbar; ein neuer RTW-C macht den bisherigen der Dienststelle zum großen RTW

**Einstellungen**
- Ein Fenster für alles statt „Daten“ und „Einstellungen“: links die Navigation – **Mein Platz** (Darstellung, Telefon & Töne, Sprache, KI-Anrufer, Bedienung), **Leitstelle** (Fahrzeuge, Dienststellen, Krankenhäuser, Orte, Einsatzcodes & Abfrage, Einsatzvorlagen, Rettungsmittel je Stufe, Statusmodell), **Simulation** (Einsatzaufkommen, Zeiten, Wetter & Flugrettung), **Programm** (Kartenpakete, Programm & Updates)
- Suche oben findet die richtige Seite („Nachtflug“, „Dienstplan“, „Klingelton“ …)

**Sonst**
- Während du telefonierst, klingelt es nicht mehr dauernd: jeder neue Anruf gibt einen kurzen Anklopf-Ton (unter Telefon & Töne einstellbar)
- KI-Modelle: realistische Angaben zum Arbeitsspeicher (Mittel ab 16 GB, Stark ab 32 GB) und eine Warnung, bevor ein zu großes Modell heruntergeladen wird

## 0.20.0 – Gespräche, die sich echt anfühlen; Modellwahl; Oberfläche
**Gespräche (Notruf und KT-Hotline)**
- Anrufer wiederholen sich nicht mehr: LeitWerk prüft jeden Satz, bevor er angezeigt und vorgelesen wird. Was schon gesagt wurde, fällt weg; ist gar nichts Neues dabei, wird die Antwort neu erzeugt
- Der Anrufer erkennt, was die Leitstelle gerade macht: **fragen**, **zusammenfassen** („Ja, genau“), **anweisen** (tut es und sagt, was er sieht), **mitteilen** („Die Rettung ist unterwegs“ → „Danke! Wie lang dauert's?“) oder **verabschieden**. Kein Aufsagen von „wach, redet normal, atmet normal“ mehr bei jeder Gelegenheit
- KT-Hotline und Überstellungen: kein „Das heißt …, korrekt?“ mehr, Antworten passen genau zur Frage. Bei „Wo bleibt der Transport?“ kennt der Anrufer die aktuelle Uhrzeit und wie lange er schon wartet – und rechnet keine falschen Uhrzeiten mehr aus
- Rückruf und zweiter Anruf: der Anrufer sagt gleich „Endlich, ich hab vorhin schon angerufen!“
- Neue Geschichten für Anrufe vom **Pflegeheim, Hausarzt, von der Ordination, Telemedizin/141/1450, vom Palliativteam**, von der **Polizei** (Verkehrskontrolle, verwirrter Mann, Krampfanfall, Geburt am Pannenstreifen …) und für **Bergrettung/Alpin** (Vermisste, Klettersteig, Paragleiter im Baum, Lichtsignale, Hund in der Felswand). Keine Pistenrettung mehr im Oktober in Kirchberg am Wagram
- Telemedizin-Ärzte wissen, dass sie nicht vor Ort sind; die Polizei fragt bei der Streife nach; Passanten kennen den Hausarzt eines Fremden nicht; wer nur ein Licht am Hang sieht, kennt keinen Patienten
- Stimmung des Anrufers passt zur Geschichte; „Ist er gestürzt?“ wird beim Sturz nicht mehr verneint; kein Hausarzt „in wir sind ungefähr eine Stunde gegangen“ mehr; Stationsärzte melden sich mit „Ärztin auf der Neurochirurgie in der Klinik Donaustadt“
- **Sprachmodell nach Rechner-Stärke wählen** (Einstellungen → KI-Anrufer): Leicht, Standard, Mittel, Stark – mit Größe, nötigem Arbeitsspeicher und Empfehlung für diesen Rechner. Dazu ein Feld für jedes andere Ollama-Modell, „Löschen“ für nicht mehr gebrauchte Modelle und ein Testanruf mit Urteil („flüssig“, „zu langsam“)

**Oberfläche**
- **Kein verlorener Klick mehr**: Während ein Knopf gedrückt ist, zeichnet LeitWerk nichts neu – vorher konnte z. B. die Telefonliste genau dann neu aufgebaut werden, und man musste zweimal drücken
- Abfrage mit der Maus wie mit der Tastatur: ein Klick auf eine Antwort beantwortet und springt zur nächsten offenen Frage; größere Antwortknöpfe
- **📡 Orten** direkt neben der Adresse in der Abfrage (bei Anrufern, die nicht wissen, wo sie sind, hervorgehoben), mit „Karte“ und „Als Einsatzort“
- Reiter (z. B. Telefon) lassen sich **zwischen Programmfenstern ziehen** – vom Hauptfenster aufs Fenster am zweiten Bildschirm und zurück. Auf Windows funktioniert das Ziehen der Reiter jetzt überhaupt erst richtig
- Rechtsklick-Menü der Reiter: weiß hinterlegt und auf Deutsch (Maximieren, Schwebend, In eigenem Fenster öffnen, Schließen)
- Karte in **2D lässt sich nicht mehr kippen**; Kippen geht nur in 3D
- **Nebel in 3D**: dichter grauer Schleier zum Horizont, mit Höhendaten verschwinden Gelände und Häuser in der Ferne; auch Dunst, Hochnebel, starker Regen/Schnee trüben die Sicht

## 0.19.0 – Echte Geschichten statt Fragebogen
- Jeder Notruf hat jetzt eine **Fallgeschichte**: was genau passiert ist, wo, seit wann, was der Anrufer sieht, wer der Patient ist (Name, Alter, Vorerkrankungen, Medikamente, Hausarzt), Stockwerk, Lift, Hund … Über 70 Alltagsgeschichten – vom Sturz in der Nacht am Weg zum Klo über den Radfahrer beim Abbiegen bis zum Kind mit dem Legostein. Passend zu Jahreszeit, Uhrzeit und Wetter (Glatteis im Winter, Hitzekollaps im Sommer, Wespenstich im Garten)
- Die KI kennt die ganze Geschichte und beantwortet damit **jede** Frage – egal welches Abfrageschema man verwendet und in welcher Reihenfolge gefragt wird. Alle Antworten aus dem Schema sind enthalten, dazu viele Kleinigkeiten
- Anrufer reden wie Menschen: erzählen den Hergang in eigenen Worten, mit „äh“, „Moment, ich schau“, „Bitte kommen S' schnell“ – keine Checklisten-Sätze mehr, kein Nachplappern der Leitstelle, keine wortgleichen Wiederholungen
- Wer anruft, passt zur Geschichte (beim Sturz im Supermarkt die Verkäuferin, beim Badeunfall der Bademeister, beim Fieber im Pflegeheim die Pflegerin) und der Patient heißt wie die Familie
- Keine Widersprüche mehr: Zeitangaben, Verletzungen, Vorerkrankungen und Seite (rechts/links) passen zueinander; Schwangerschaft wird nur bei Frauen im passenden Alter erwähnt
- Unbekannte Orte (Wanderweg, Landesstraße, Badesee) werden so beschrieben, wie es zur Geschichte passt

## 0.18.0 – Natürlichere Stimmen, Ausgabegerät, schnellere Spracherkennung
- Vorlesen mit **Piper** (7 deutsche Stimmen, Männer und Frauen; „Thorsten emotional“ klingt bei aufgeregten Anrufern aufgeregt) oder **Supertonic 3** (10 Stimmen, am menschlichsten) – beide erzeugt LeitWerk selbst, ohne Internet. Einmal herunterladen unter Einstellungen → Persönlich → Sprache, dort auch Probehören. Jeder Anrufer bekommt eine eigene Stimme
- Ausgabegerät wählbar: Stimmen (Piper/Supertonic) und Töne (Klingeln, Funk-Piep, Chat, Warnungen) getrennt, z. B. Gespräch im Headset und Klingeln über den Lautsprecher
- Mac: Spracherkennung nutzt den Grafikchip – deutlich schneller

## 0.17.0 – Alarm-Anzeige, freies Funkfeld, wechselhafteres Wetter, schnelleres Vorlesen
- Alarmierte Fahrzeuge („auf Wache“ und „über Funk“) haben kein „A“/„F“ mehr, sondern eine hellgelb hinterlegte Zeile; Fahrzeuge auf Funk (Frei Funk, über Funk alarmiert) stehen in roter Schrift. Farben und Rot an/aus unter Einstellungen → Persönlich → Eigene Statusfarben. Die Funkrufnamen stehen in der Einsatzmaske sauber untereinander
- Für einen Krankentransport vorgemerkte Fahrzeuge sind in den Fahrzeugvorschlägen und in der Fahrzeugliste markiert („KT vorgemerkt ab 14:30“)
- Einsatzleiter ÖBB wird bei Bahnunfällen nicht mehr automatisch angehakt – nur noch als Hinweis oben in der Liste, alarmiert wird er selbst
- Funk: freies Feld „75/001 von LEO, kommen“ (tippen oder sprechen) – das Fahrzeug wird erkannt und gerufen; daneben weiter die Auswahl nur nach Funkrufname. Gesprochenes „75 1“ wird zu „75/001“, vorgelesen wird „75/001“ wie am Funk als „75 1“
- Wetter: „sehr wechselhaft“ wechselt jetzt wirklich stark (auch mal von Sonne direkt zum Schauer), „normal“ bleibt in Bewegung; Beschriftung am Regler aufgeräumt
- Wetter-Einstellungen geändert: „Ins laufende Spiel übernehmen (fließend)“ oder „Wetter komplett neu setzen“ (mit Warnung); Speichern übernimmt fließend
- Vorlesen beginnt schon nach dem ersten fertigen Satz, während die KI noch schreibt
- Jeder Anrufer bekommt eine andere der installierten Stimmen (je Stimme nur die beste Qualität, z. B. „Premium“)

## 0.16.2 – Mikrofon auf dem Mac
- Mac: LeitWerk darf jetzt das Mikrofon benutzen – vorher lieferte macOS nur Stille („Nichts gehört“), ohne nachzufragen. Beim ersten Sprechen fragt der Mac einmal nach der Erlaubnis

## 0.16.1 – Mikrofon direkt im Programm
- Spracheingabe: das Programm nimmt jetzt selbst über das Mikrofon auf – auf dem Mac durfte das Fenster das Mikrofon nicht öffnen („The request is not allowed …“). Beim ersten Sprechen fragt der Computer einmal nach der Erlaubnis
- Mikrofon-Auswahl zeigt die Namen der Mikrofone sofort

## 0.16.0 – Sprache: Vorlesen und Spracheingabe
- Anrufer werden vorgelesen (Notruf und KT-Hotline, nur beim Gesprächsführer): Frauen- oder Männerstimme passend zum Anrufer, aufgeregte Anrufer sprechen schneller. Regieanweisungen in Klammern werden nicht mitgelesen
- Funk wird vorgelesen: was die Fahrzeuge in deinen Funkgesprächen sagen
- Spracheingabe: 🎙 neben den Eingabefeldern (Notruf, KT-Hotline, Funkspruch, Fahrzeug rufen) gedrückt halten – oder die Sprechtaste (Mac: rechte ⌥, Windows: F2, änderbar). Loslassen → der Text steht im Feld und wird gleich abgeschickt (abschaltbar)
- Die Erkennung (Whisper) läuft nur auf dem eigenen Rechner, ohne Internet; das Sprachmodell wird einmal unter Einstellungen → Persönlich → Sprache heruntergeladen (150–575 MB)
- Einstellungen → Persönlich → Sprache: Vorlesen an/aus, Lautstärke, Tempo, Stimmen mit Probehören, Sprechtaste, Mikrofon, Ausprobieren
- Die Abfrage selbst ändert sich nicht – gesprochen wird nur, was sonst geschrieben steht

## 0.15.1 – Alarm-Status
- Neue Status beim Alarmieren: „A – Alarmiert auf Wache“ (Fahrzeug war auf der Wache) und „F – Alarmiert über Funk“ (Fahrzeug war unterwegs). Beide setzt nur die Leitstelle – das Fahrzeug funkt sie nicht und man kann sie nicht von Hand wählen
- Rettungsdienst (RTW, NEF, NAH …) geht danach direkt auf Status 2; Krankentransporte, die auf der Wache alarmiert werden, quittieren nach etwa 20 Sekunden mit Status 9 („Alarmiert und quittiert“) und rücken dann aus

## 0.15.0 – TETRA-Funkgruppen, neues Wetter, eigene Farben und Töne
- TETRA-Funkgruppen statt Einsatzgebiet: gespielt wird NÖ-03 (Krems Stadt und Land, Hollabrunn, Tulln inkl. Klosterneuburg). Einsätze und Krankentransporte entstehen nur dort, gefunkt wird auf NÖ-03; Fahrzeuge von außerhalb melden „wechselt auf TETRA NÖ-03“. Die anderen Gruppen (NÖ-01 bis NÖ-06) folgen später
- Grenzen der Funkgruppen als leichte Linien auf der Karte; Farben unter Einstellungen → Persönlich änderbar, Linien in der Karte abschaltbar (Gemeindegrenzen: Statistik Austria, CC BY 4.0)
- Neues Wetter-Fenster (Klick auf das Wetter oben): Aktuell mit Temperatur, gefühlter Temperatur, Wind und Böen, Sicht und Regen, die nächsten 12 Stunden, 5-Tage-Vorschau und Warnungen (gelb/orange/rot); Reiter Prognose (24 Stunden) und Warnungen
- Wetter-Regler von „fix“ (Wetter und Temperatur selbst wählen) bis „sehr wechselhaft“ (ändert sich etwa stündlich); Übergänge sind realistisch – nach Sonne kommt nicht sofort Gewitter
- 20 feinere Wetterlagen, von klar über Dunst, Nebel und Hochnebel, Niesel, Regen und Starkregen bis Schneeregen, Schneefall, starker Schneefall, gefrierender Regen, Gewitter, Gewitter mit Hagel und Unwetter – dazu Wind mit Böen; alles passend zu Jahreszeit, Tageszeit und Temperatur (unter 0 °C wird es glatt)
- Wetter wirkt mehr: Schnee, Glätte und Starkregen verlängern die Fahrzeit, Sturm bringt mehr Verletzungen und Unfälle; Hubschrauber fliegen bei Gewitter, Nebel, Hochnebel, starkem Schneefall und Böen ab 90 km/h nicht – Glatteis stört sie nicht
- Wetter in der 3D-Ansicht: ganz leichter Regen, Schnee, Hagel, Dunst und Nebel, bei Gewitter kurze Blitze; unter Persönlich abschaltbar
- Eigene Farben: Vorlagen (NÖ Blau-Gelb, Rotes Kreuz, Neutral Grau, Nachtschicht, Hoher Kontrast) und eigene Farben für Akzent, Menüleiste, Hintergrund, Fenster und Warnfarbe – getrennt für hell und dunkel; als Design-Datei speichern und laden
- Eigene Töne: für Notruf, KT-Hotline, Funkruf, dringenden Funkruf, Chat und Warnungen je ein Ton mit eigener Lautstärke und ▶ zum Probehören; eigene MP3/WAV-Dateien hochladen (Klingelton bis 10 s und 1 MB, kurze Töne bis 2 s und 300 KB)

## 0.14.0 – Partner-Organisationen, mehr Funk, Abfrage mit Tastatur
- Partner-Organisationen (einfache Version): in der Einsatzmaske 🚒 Feuerwehr, 🚓 Polizei, ⛰ Bergrettung, 🌊 Wasserrettung – angefordert heißt sofort vor Ort. Ist eine Organisation nötig (z. B. Verkehrsunfall, Brand, Eingeklemmte, Gefahrgut → Feuerwehr; Gewalt, Schuss/Stich, Suizid/UBG, VU mit Verletzten, Todesfall → Polizei; Alpinunfall → Bergrettung; Person im Wasser → Wasserrettung), ist der Knopf gelb markiert. Fehlt sie, meldet die Besatzung das per Funk und kann bis dahin nicht weiterarbeiten; bei Gewalt wartet sie zum Eigenschutz in sicherem Abstand
- Lagemeldung kommt erst nach 2–5 Minuten vor Ort (Verkehrsunfall nach etwa 1 Minute), Reanimation sofort
- Funk umfangreicher: dringende Rufe (Nachforderung, Verschlechterung, Eigenschutz) stehen oben und sind rot markiert; neue Meldungen der Besatzung (Transport mit Voranmeldung, Zwischenmeldung bei langer Versorgung, schwierige Zufahrt, selten ein technischer Defekt); neue Schnellknöpfe für LEO (Einsatzauftrag, Zielkrankenhaus, Zusatzinfo, Funkcheck); passendere Antworten ohne KI; alle Funksprüche stehen auch im Einsatzprotokoll
- Abfrage mit der Tastatur: die aktuelle Frage ist markiert, Tasten 1–9 wählen die Antwort, Enter/↓ springt zur nächsten offenen Frage, ↑ zurück, F stellt die Frage
- Einsatzliste: Sortierung wählbar (Zustand, Dringlichkeit, Eingang, Abholung/Termin, Code/Stufe); verspätete Krankentransporte sind ganz leicht rot hinterlegt
- 🐞 Fehler melden (oben rechts): speichert eine Datei mit Version, letzten Fehlermeldungen, Einstellungen und Spielzustand
- Schneller: Listen bauen nur geänderte Zeilen neu und verdeckte Reiter gar nicht; im Multiplayer werden abgeschlossene Einsätze nicht mehr ständig neu verglichen

## 0.13.4 – Gespräch exportieren, stimmigere Anrufer
- „⤓ Gespräch exportieren“ im Abfrage-Fenster und in Einsatz- und KT-Maske: speichert eine Textdatei mit dem ganzen Gespräch (Spielzeit und echte Uhrzeit, ob KI oder feste Antwort), der Abfrage (eingegeben und Wahrheit nebeneinander, Abweichungen markiert), dem Code, dem Ort, der Anweisung an die KI und dem Protokoll – für Notfälle, Krankentransporte und Überstellungen. Ausblenden unter Einstellungen → Persönlich
- Wird eine Frage wiederholt, sagt der Anrufer „Wie gesagt, …“ statt dieselbe Antwort noch einmal
- Eigene Fragen und Zusammenfassungen („Das heißt …, korrekt?“): die KI geht darauf ein, bestätigt oder korrigiert und wiederholt nicht ihre letzte Antwort; ohne KI wird die passendste Frage der Abfrage beantwortet
- Anrufer widersprechen sich nicht mehr: z. B. keine „Verletzten“ und trotzdem starke Blutung, Gefahrgut ohne Gefahr, oder „eine Person“, obwohl der Anrufer selbst verletzt ist

## 0.13.3 – Kreislaufstillstand, Wetterprognose, kompakte Einsatzliste
- Kreislaufstillstand richtig codiert: bewusstlos + atmet nicht → eigener Stillstand-Code des Kapitels (z. B. 6E1, 17D2, 23D1), sonst 9er-Code. Neue Frage „Haben Sie gesehen, wie der Patient zusammengebrochen ist?“: nicht beobachtet (aufgefunden) → 9D1, beobachtet → 9E1, beobachtet aber Atmung unsicher → 9E2; Erhängen/Strangulation/Ersticken → 9E3–9E5
- Bewusstlos + Schnappatmung ist kein Stillstand mehr, sondern 31D1 (ineffektive Atmung) bzw. der eigene Code des Kapitels (z. B. 2E1, 6E1, 15E1); erschwerte Atmung → 31D2
- KT/Überstellung: Krankenhaus und Station über ein Suchfeld finden (z. B. „St. Pölten Endo“); bei Adressen übernimmt 📍 die Adresse, die der Anrufer genannt hat
- Abholzeit oder Termin: sobald eines eingetragen ist, verschwindet das andere Feld; die berechnete Zeit steht klein daneben
- Rufnummer übernehmen: im Abfrage-Fenster „📞 Nummer übernehmen“, in Einsatz- und KT-Maske 📞 neben dem Rückruf-Feld. Neue Einstellung „Rückruf nur mit aufgenommener Nummer“ – ohne Nummer kann man verpasste Anrufer nicht zurückrufen
- Gesprächsverlauf flackert und springt nicht mehr: neue Nachrichten werden nur angehängt, die Antwort ersetzt die Live-Zeile ohne Aufblitzen
- KT/Überstellung: Zusatzfragen gebündelt – ein 🗨 für „Zusätzlich“ (Begleitung, Sauerstoff, Infektion) und einer für den Zustand bei Überstellungen; auf offene Fragen wie „Gibt es sonst etwas zu beachten?“ nennt der Anrufer alles Zutreffende
- Wetter: oben mit Temperatur, Klick zeigt die Prognose für die nächsten Stunden. Einstellungen: realistisch, wechselhaft oder immer gleich (festes Wetter und Temperatur) und die Jahreszeit (nach Spieldatum oder fix). Temperatur nach Jahreszeit und Tageszeit
- Wetter wirkt auf die Notrufe: Hitze bringt mehr Hitzenotfälle, Badeunfälle und Kreislaufprobleme, Kälte mehr Unterkühlung, Kohlenmonoxid und Infekte, Glätte mehr Stürze und Verkehrsunfälle, Gewitter auch Blitzschläge
- Einsatzliste kompakter: zwei Zeilen pro Einsatz (Code und Stichwort bzw. Patient, darunter der Ort); die Art erkennt man an der Farbe des Codes, Uhrzeit und Zustand stehen rechts

## 0.13.2 – KT-Aufnahme im Abfrage-Fenster, kompakte Masken
- Bewusstlose Patienten: Wird in der Abfrage „bewusstlos“ angeklickt, wechselt der Code auf Bewusstlosigkeit (31D1 agonal/keine Atmung, 31D2 abnorme Atmung, 31D3 normale Atmung, 31D4 Atmung unklar) – außer das Kapitel hat selbst einen Bewusstlos-Code (z. B. 23D2, 17D3). Codes mit „Bewusstseinstrübung“ gelten nur noch für getrübte Patienten
- Krankentransport und Überstellung: Der Calltaker trägt alles direkt im Abfrage-Fenster ein (Anrufer, Patient, Abholort, Ziel, Zeiten, Transportart, Code) – mit den 🗨-Knöpfen stellt er die passende Frage. „Auftrag anlegen“ gibt es dort auch
- KT-Maske kompakt: oben eine Zusammenfassung (Patient, Abholort → Ziel, Zeiten), Ändern über „✎ Bearbeiten“; Disposition und Protokoll stehen im Vordergrund
- Zeiten: Abholzeit ODER Termin eingeben – die andere Zeit rechnet das Spiel aus (Fahrzeit plus Ein- und Ausladen) und zeigt sie als „berechnet“
- Vormerken: Die Ausrückzeit wird automatisch berechnet („rückt automatisch um 14:35 aus“), das Fahrzeug fährt dann von selbst los. „Jetzt losschicken“ geht weiterhin
- Ein Anruf, der als Überstellung kommt, startet gleich als Überstellung mit den passenden Fragen
- Einsatzmaske: Code, Einsatzort mit Zusatz und die Infos stehen kompakt in einem Kasten; Karte 🗺, genannte Adresse 📍 und Ortung 📡 als kleine Knöpfe, die Infofelder gehen beim Hineinklicken auf
- Alle Fahrzeuge: eigene Gruppe „Notarzthubschrauber“ mit allen Hubschraubern (Standort, Nachtflug); der ITH zählt sowohl als NAH als auch als S-Fahrzeug

## 0.13.1 – Abfrage-Fenster neu
- Abfrage-Fenster wie eine echte Notrufabfrage: links der Anruf (Rufnummer, Dauer, Tonspur, Anruferstatus, Standort aus dem Netz mit Ortung, vorläufiges Ergebnis, „Einsatzmaske öffnen“, Zusatzinformationen wie Quelle, Netzbetreiber, Sprache), in der Mitte das Gespräch mit Uhrzeiten und darunter die Info an den RTW, rechts die ganze Abfrage übersichtlich in Spalten; unten Anruf beenden, Halten, Stummschalten und „Zur Einsatzmaske“
- Die Adresse und die Zusatzinfos zum Ort trägt man direkt in der Abfrage ein (mit Adresssuche, Karte und „Genannte“); sie landen in der Einsatzmaske
- Antworten anklicken lässt die Abfrage dort, wo sie ist – kein Springen nach oben mehr
- Die Abfrage ist ein eigenes Fenster, nicht mehr ein Reiter bei der Einsatzmaske; in der Standard-Anordnung liegt sie neben der Karte. Nach dem Auflegen kommen Karte und Einsatzmaske wieder nach vorne (gilt nach dem Update als neue Standard-Anordnung)
- Ein klingelnder Anruf steht nur noch im Telefon; in der Einsatzliste erscheint der Einsatz erst, wenn der Anruf angenommen ist
- Gehaltene Anrufe kann im Multiplayer jeder andere Disponent mit „Übernehmen“ aufgreifen und weiterführen
- Einsatzprotokoll: Die ausgefüllte Abfrage steht als Text im Protokoll („*** Erstaufnahme: … ***“ mit nummerierten Sätzen wie „Er ist wach und reagiert normal.“), beim Alarmieren oder Auflegen. Ändert sich danach der Code durch die Abfrage, kommt „*** Änderung: … ***“ mit den geänderten Antworten dazu

## 0.13.0 – Neue Oberfläche
- Fenster frei anordnen: Jeder Teil ist ein eigenes Fenster (Karte, Einsatzliste, Alle Fahrzeuge, Aktive Fahrzeuge, Telefon, Abfrage, Einsatzmaske, KT-Maske, Funk, Chat). Reiter ziehen und daneben, darunter oder als weiteren Reiter ablegen, Ränder ziehen ändert die Größe, ⤢ macht ein Fenster groß; auch schwebende Fenster sind möglich (Rechtsklick auf einen Reiter)
- Zweiter Bildschirm: ⧉ schiebt Fenster in ein eigenes Programmfenster, das man auf einen anderen Bildschirm ziehen kann; ⇱ holt sie zurück. Auswahl, Eingaben und neue Einsätze gehen sofort zwischen den Fenstern hin und her
- Geschlossene Fenster holt man oben über „Fenster ▾“ zurück; dort steht auch, in welchem Programmfenster etwas offen ist. Eine zweite Karte ist möglich
- Die Anordnung wird gemerkt und beim nächsten Start wiederhergestellt (auch weitere Programmfenster). Vorlagen unter „Anordnung ▾“: Alles auf einem Bildschirm, Notruf-Disponent, KT-Disponent, Funk, Zwei Monitore; eigene Anordnungen unter einem Namen speichern, als Datei exportieren und importieren, zurücksetzen unter Einstellungen → Persönlich
- Telefon: alle Anrufe in einer Liste, farbig nach Art (Notruf rot, KT-Hotline blau, Überstellung violett) mit Rufnummer und Dauer. Annehmen, Halten, Zurückwechseln, Auflegen; wer einen Anruf annimmt, legt das laufende Gespräch in die Warteschleife. Wartet ein Anrufer zu lange, legt er auf und ruft später wieder an
- Abfrage-Fenster: links der Anruf (Nummer, Dauer, Ortung, Halten, Mikrofon/Stumm als Vorbereitung für Sprache, Beenden), in der Mitte das Gespräch, rechts der Leitfaden – beim Notruf die Abfrage, bei KT und Überstellungen die Fragen der Hotline mit den schon eingetragenen Antworten. Darunter „Info an RTW“ (vorne automatisch aus der Abfrage) bzw. „Hinweise für die Besatzung“. Schmale Fenster ordnen sich untereinander an
- Einsatzliste: Notfälle, Krankentransporte und Überstellungen gemeinsam; Farbe nach Zustand (rot = disponieren, gelb = Anruf/Aufnahme, blau = unterwegs, grün = vor Ort/an Bord, grau = erledigt), Filter nach Art, „nur zu tun“, erledigte, Suche
- Aktive Fahrzeuge: alle, die nicht frei auf der Wache sind, mit Status, Auftrag und Ankunftszeit; Alle Fahrzeuge nach Dienststelle (einklappbar) mit Filter und Suche. Klick zeigt das Fahrzeug auf der Karte, Doppelklick lässt die Kamera folgen, Rechtsklick setzt den Status
- Oben in der Leiste: „📞 Notrufe“ und „🚑 KT-Hotline“ – nehme ich an oder nicht. Wer annimmt, bekommt Klingeln, und Telefon bzw. Abfrage gehen von selbst auf
- Hell, Dunkel oder wie das System; Grundfarben weiß bzw. grau, Kontrast in den NÖ-Farben Blau und Gelb. Die Karte wird im dunklen Schema dunkel (oder bleibt auf Wunsch hell)
- Einstellungen sind aufgeteilt: Persönlich (Aussehen, Größe der Oberfläche, Bewegungen, Anrufannahme, Klingelton und Lautstärke, Funk-Piep, Tastenkürzel, eigene Statusfarben, Anordnungen) gilt nur für dich; Leitstelle & Simulation kommt im Multiplayer immer vom Host; Programm & Karten (Kartenpakete, Updates)
- Tastenkürzel (änderbar): F1 annehmen, Esc auflegen, F3 halten/zurückwechseln, Strg+F Fahrzeug suchen, F5 neuer Test-Einsatz, Strg+1/2/3 Einsatzliste/Karte/Funk
- Daten und Einstellungen gehen als großes Pop-up über dem Arbeitsplatz auf

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
