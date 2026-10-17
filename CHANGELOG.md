# Änderungen

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
