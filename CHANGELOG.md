# Änderungen

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
