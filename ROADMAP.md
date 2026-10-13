# LeitWerk – Merkliste für spätere Versionen

Gesammelte Wünsche, die noch nicht eingeplant sind (Reihenfolge noch offen).

## Phase 6 – „Die Lage lebt“ (als Nächstes)
- Jeder Einsatz hat eine verborgene Lage: ein oder mehrere Patienten (B/A, Sichtung rot/gelb/grün, Notarzt nötig, Transport)
- Verlauf über die Zeit, passend zum Code: Verschlechterung, Besserung, „doch keine Reanimation“, mehr Betroffene als gemeldet
- Vor dem Eintreffen weiß nur der Anrufer davon: meldet es im laufenden Gespräch oder ruft erneut an (Folgeanruf zum selben Einsatz)
- Das Programm entscheidet, was passiert; die KI formuliert nur
- Einstellung „Komplikationen“: ruhig / normal / fordernd (normal ≈ jeder 10. Einsatz verändert sich, jede 5. Rea-Meldung ist keine)

## Phase 7 – Funkverkehr mit den Fahrzeugen
- Funkkanal je Fahrzeug, Besatzung wird von der KI gespielt (ohne KI: feste Sätze)
- Funkablauf NÖ: Leitstelle heißt am Funk „LEO“; kein Sprechwunsch-Status, es wird direkt gerufen
  - „LEO von 75/001 kommen“ → „Hier LEO kommen“ → Meldung … „kommen“ → „Hier LEO, verstanden, ENDE“
  - „75/001 von LEO kommen“ → „Hier 75/001 kommen“ → „Hier LEO, bitte gebt mir eine Lagemeldung, wenn ihr vor Ort seid, kommen“ → „Hier 75/001, so verstanden, wir geben eine Lagemeldung, kommen“ → „Hier LEO ENDE“
- Ab Eintreffen kennt die Besatzung die ganze Lage und meldet: Lagemeldung (bei VU/unklarer Lage oder auf Anforderung), Nachforderung (Notarzt, weitere RTW), Storno (NEF/NA nicht mehr nötig), „keine Reanimation“ oder umgekehrt, KH-Anfrage
- Offene Nachforderungen bleiben beim Einsatz sichtbar, bis etwas geschickt wurde; Besatzung erinnert
- Multiplayer: wer zuerst antwortet, führt den Funk mit diesem Fahrzeug (Rechte evtl. feiner aufteilen)

## Simulation
- **Ausrückzeiten** je Fahrzeugtyp, Tag/Nacht und Status (Wache, Funk, Bereitschaft) einstellbar
- **Hubschrauber:** eigene Ausrückzeiten; am Einsatzort 1–3 Platzrunden kreisen, dann landen
- Mehrfachaufträge pro Fahrzeug
- Sekundärtransporte (SKTW, SRTW, SNAW)

## 3D-Ansicht
- **Fahrzeugmodelle im Low-Poly-Stil**, nur in 3D sichtbar: Fahrzeuge fahren auf der Straße, Hubschrauber fliegen über dem Boden

## KI-Anrufer
- ~~Notrufabfrage per Text~~ (0.6.0); später per Sprache (lokal auf jedem Rechner)
- Optional: KI direkt in LeitWerk eingebaut statt Ollama als eigenes Programm
