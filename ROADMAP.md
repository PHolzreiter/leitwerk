# LeitWerk – Merkliste für spätere Versionen

Gesammelte Wünsche, die noch nicht eingeplant sind (Reihenfolge noch offen).

## Phase 6 – „Die Lage lebt“ (umgesetzt in 0.7.0)
- Jeder Einsatz hat eine verborgene Lage: ein oder mehrere Patienten (B/A, Sichtung rot/gelb/grün, Notarzt nötig, Transport)
- Verlauf über die Zeit, passend zum Code: Verschlechterung, Besserung, „doch keine Reanimation“, mehr Betroffene als gemeldet
- Vor dem Eintreffen weiß nur der Anrufer davon: meldet es im laufenden Gespräch oder ruft erneut an (Folgeanruf zum selben Einsatz)
- Das Programm entscheidet, was passiert; die KI formuliert nur
- Einstellung „Komplikationen“: ruhig / normal / fordernd (normal ≈ jeder 10. Einsatz verändert sich, jede 5. Rea-Meldung ist keine)

## Phase 7 – Funkverkehr mit den Fahrzeugen (umgesetzt in 0.8.0)
- Funkkanal je Fahrzeug, Besatzung wird von der KI gespielt (ohne KI: feste Sätze)
- Funkablauf NÖ: Leitstelle heißt am Funk „LEO“; kein Sprechwunsch-Status, es wird direkt gerufen
  - „LEO von 75/001 kommen“ → „Hier LEO kommen“ → Meldung … „kommen“ → „Hier LEO, verstanden, ENDE“
  - „75/001 von LEO kommen“ → „Hier 75/001 kommen“ → „Hier LEO, bitte gebt mir eine Lagemeldung, wenn ihr vor Ort seid, kommen“ → „Hier 75/001, so verstanden, wir geben eine Lagemeldung, kommen“ → „Hier LEO ENDE“
- Ab Eintreffen kennt die Besatzung die ganze Lage und meldet: Lagemeldung (bei VU/unklarer Lage oder auf Anforderung), Nachforderung (Notarzt, weitere RTW), Storno (NEF/NA nicht mehr nötig), „keine Reanimation“ oder umgekehrt, KH-Anfrage
- Offene Nachforderungen bleiben beim Einsatz sichtbar, bis etwas geschickt wurde; Besatzung erinnert
- Multiplayer: wer zuerst antwortet, führt den Funk mit diesem Fahrzeug (Rechte evtl. feiner aufteilen)
- Multiplayer: ALLE Spieler hören (lesen) den Funk aller Fahrzeuge mit – den Funk zwischen den Disponenten gibt es über Discord

## Krankentransporte (umgesetzt in 0.10.0)
- KT-Hotline mit fester Abfrage, Online-Anmeldungen, Daueraufträge (Dialyse, Strahlentherapie)
- KTW primär, RTW/RTW-C wenn nötig, SKTW nie für normale KT; Sammelfahrten mit Platzprüfung
- später: Sekundärtransporte (Verlegungen KH–KH mit SKTW/SRTW/SNAW/BIT/ITH); BIT-Nachforderung bei adipösen Patienten

## Simulation
- **Ausrückzeiten** (einstellbar, Standard):
  - alle bodengebundenen Fahrzeuge: tagsüber bis zu 2 min, nachts bis zu 3 min
  - NAH: tagsüber bis zu 5 min, nachts bis zu 10 min
- **Hubschrauber:** am Einsatzort 1–3 Platzrunden kreisen, dann landen; das NAH-Symbol fliegt immer (auch ohne 3D-Modelle nicht am Boden entlang)
- Mehrfachaufträge pro Fahrzeug
- **Sekundärfahrzeuge (Grundgerüst):** für Verlegungen zwischen Kliniken, nach nötiger medizinischer Versorgung
  - SKTW: 2× RS
  - SRTW: 1× RS + 1× NFS bis NKV
  - SNAW: 1× RS + 1× NA + 1× NKV oder NKI
  - BIT (Betten-Intensivtransporter, kleiner LKW für adipöse Patienten): 1× RS–NFS Fahrer, 1× NKV–NKI, 1× RS–NFS; nur Verlegung oder Nachforderung
  - ITH (Intensivtransporthubschrauber, „AIR ICU-AMB“): besetzt wie NAH, für Interhospitaltransporte
  - EL ÖBB: Einsatzleiter der ÖBB, bei Unfällen auf/an Bahngleisen, Koordination ÖBB–Einsatzdienste
  - Aufträge dafür kommen später mit den Projekten „Krankentransporte“ und „Sekundärtransporte“
  - später: Nachforderung BIT durch RTW/KTW bei adipösen Patienten

## 3D-Ansicht
- **Fahrzeugmodelle im Low-Poly-Stil**, nur in 3D sichtbar: Fahrzeuge fahren auf der Straße, Hubschrauber fliegen über dem Boden
  - Formen nach Pauls Vorlagebildern (Kopie der Bilder liegt nur lokal, nicht im Repo):
    - VW T6 Hochdach: KTW, RTW, SKTW
    - VW Crafter Hochdach (länger, höher): RTW-C, SRTW, SNAW
    - VW T6 Bus ohne Hochdach, mit Lichtbalken: NEF
    - VW Passat Kombi mit Lichtbalken: BEL
    - EC135: NAH (Rumpf, Heckausleger, Kufen, Rotor)
  - keine Lackierung/Streifen: einheitlich in der Farbe der Organisation (wie auf der Karte), dazu Fenster, Räder, Blaulicht
  - so einfach wie möglich, aber erkennbar; Leistung geht vor
  - alle Fahrzeuge mit Sondersignal: Blaulicht blinkt auch in 3D
  - in den Einstellungen abschaltbar

## KI-Anrufer
- ~~Notrufabfrage per Text~~ (0.6.0); später per Sprache (lokal auf jedem Rechner)
  - Gesprochen UND mitgeschrieben (Verlauf zum Nachlesen bleibt)
  - Audio-Menü: Mikrofon (Eingabegerät) und Lautsprecher/Headset (Ausgabegerät) wählen, dazu Lautstärke, Empfindlichkeit, Sprechtaste usw.
- Optional: KI direkt in LeitWerk eingebaut statt Ollama als eigenes Programm
