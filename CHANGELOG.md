# Änderungen

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
