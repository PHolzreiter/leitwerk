# Änderungen

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
