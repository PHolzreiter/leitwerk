# Erzeugt data/beispiele/beispiel_codesystem.json (Beispiel-Codesystem mit Anleitung für eine KI).
# Aufruf: python3 tools/beispiel_codesystem.py data/beispiele/beispiel_codesystem.json
import json, sys
JN = [{"wert": "ja", "label": "Ja"}, {"wert": "nein", "label": "Nein"}, {"wert": "unbekannt", "label": "Weiß nicht"}]

anleitung = r"""
# Anleitung für eine KI: ein neues LeitWerk-Codesystem erstellen

Du bekommst diese Datei ohne weiteren Zusammenhang. Sie ist ein **kleines, vollständiges Beispiel** für ein Codesystem des Leitstellen-Spiels „LeitWerk“ (Rettungsdienst-Leitstelle, Niederösterreich). Deine Aufgabe: zusammen mit einer Person (dem „Ersteller“) ein **neues, vollständiges Codesystem** im selben Format erstellen und am Ende als **eine gültige JSON-Datei** ausgeben.

## 1. Worum es geht

- In LeitWerk nimmt der Spieler Notrufe an. Er wählt die **Hauptbeschwerde** (= ein **Kapitel**), stellt die **Fragen** dieses Kapitels, und aus den Antworten ergibt sich **automatisch ein Einsatzcode**.
- Jeder Code hat eine **Kategorie** (= Einsatzstufe, z. B. „Notfall mit Notarzt“). Die Einsatzstufe bestimmt, welche Fahrzeuge das Spiel vorschlägt, ob mit Blaulicht gefahren wird und ob ein Notarzt mitkommt.
- Das Spiel erzeugt auch selbst Notfälle: Es zieht zufällige, aber zueinander passende Antworten und lässt eine KI den Anrufer spielen. Deshalb müssen Fragen und Antworten **eindeutig** und **für Laien beantwortbar** sein.
- Codes und Abfrage stehen in **einer** Datei. Keine zweite Codeliste nötig.

## 2. Ablauf mit dem Ersteller – stelle diese Fragen, bevor du schreibst

Frage nacheinander (nicht alles auf einmal), fasse die Antworten kurz zusammen und lass sie bestätigen:

1. **Zweck und Name:** Wie soll das Codesystem heißen? Für welches Gebiet/Land? Wird es veröffentlicht? (Wenn ja: alles muss **eigenständig formuliert** sein – keine Texte, Nummern oder Codes aus geschützten Systemen wie AMPDS/MPDS, ProQA o. Ä. übernehmen.)
2. **Kapitel:** Welche Hauptbeschwerden soll es geben? Schlage eine Liste vor (z. B. Atemnot, Brustschmerz, Bewusstlosigkeit, Kreislaufstillstand, Sturz, Verkehrsunfall, Blutung, Schlaganfall, Krampfanfall, Vergiftung, Allergie, Verbrennung, Schwangerschaft/Geburt, Psychiatrie, Kranke Person unklar, Unterzuckerung, Hitze/Kälte, Ertrinken, Stromunfall, Tierbiss, Gewalt, Anforderung durch Arzt/Pflege, Anforderung durch Polizei, Anforderung anderer Leitstelle, Alpinunfall) und frag, was weg oder dazu soll.
3. **Codeaufbau:** Wie sieht ein Code aus? Vorschlag wie in diesem Beispiel: `KK-Sx-NN` (Kapitel zweistellig, Dringlichkeitsstufe, laufende Nummer), Zusatz mit Schrägstrich (z. B. `/L` = liegt lange am Boden). Wie viele Dringlichkeitsstufen, und welche ist die höchste?
4. **Einsatzstufen (Kategorien):** Welche Einsatzstufen gibt es, und was gehört jeweils dazu: Rettungsmittel-Reihenfolge (z. B. `RTW>KTW`), Notarzt (`nein`, `nef` = Notarzteinsatzfahrzeug, `schnellster` = NEF oder Hubschrauber), Sondersignal ja/nein, Notfallsanitäter nötig ja/nein, Dringlichkeit (`stabil`, `dringend`, `kritisch`), wie oft transportiert wird (Prozent)?
5. **Zusätze:** Sollen Polizei, Feuerwehr oder mehrere Patienten den Code verändern (eigene Zusatzcodes)? Soll der Calltaker manuell aufwerten dürfen?
6. **Je Kapitel:** Welche Fragen sind entscheidend, und welche Antworten führen zu welcher Stufe? Arbeite **Kapitel für Kapitel**: schlage Fragen und Regeln vor, lass sie bestätigen, dann das nächste Kapitel.
7. **Abschluss:** Gibt es Sonderfälle (Kinder, Schwangere, Kreislaufstillstand, Unbekanntes Alter)? Wie soll „weiß nicht“ gewertet werden? (Empfehlung: im Zweifel dringlicher.)

Danach erzeugst du die Datei. Ist sie lang, gib sie in Teilen aus (erst `globale_fragen`, dann je ein paar Kapitel, am Ende `codes`) und sag dem Ersteller, wie er die Teile zusammensetzt – oder gib sie in einem Stück, wenn möglich.

## 3. Aufbau der Datei

```
{
  "format": "leitwerk-codesystem",
  "version": 1,
  "name": "…",
  "beschreibung": "…",
  "anleitung_fuer_ki": [ … ],          // optional, diese Anleitung
  "stufen": { "muster": "…", "reihenfolge": [ … ] },
  "einsatzstufen": [ … ],
  "globale_fragen": { … },
  "kapitel": { "<Kapitel-ID>": { … }, … },
  "codes": { "<Code>": { "name": "…", "kategorie": "…", "kapitel": "…" }, … }
}
```

### 3.1 stufen
- `muster`: regulärer Ausdruck (JavaScript), dessen **erste Klammer** die Dringlichkeitsstufe aus einem Code liest. Beispiel `^\d{2}-S(\d)` liest aus `02-S4-01` die `4`.
- `reihenfolge`: alle Stufen **von niedrig nach hoch**. Wird für das manuelle Aufwerten gebraucht (nur nach oben).

### 3.2 einsatzstufen
Liste der Kategorien, die in `codes[…].kategorie` vorkommen. Felder: `stufe` (Name, genau wie in den Codes), `rettungsmittel` (Reihenfolge mit `>`, gleichwertig mit `/`, leer = kein Fahrzeug), `nfs_erforderlich`, `notarzt` (`nein`/`nef`/`schnellster`), `sondersignal`, `kategorie` (`stabil`/`dringend`/`kritisch`), `transport_prozent`. Fahrzeugtypen im Spiel: `RTW-C` (RTW mit Notfallsanitäter-Kompetenz), `RTW`, `KTW`, `NEF`, `NAH` (Hubschrauber).

### 3.3 globale_fragen
Vier Phasen, jede eine Liste von Fragen:
- `phase_1_einsatzort`: `ort_adresse`, `ort_zusatz` (Typ `text`)
- `phase_2_rueckruf`: `rueckrufnummer` (Typ `text`)
- `phase_3_was_ist_passiert`: `schilderung` (`text`), `anrufer` (`single`), `kapitel` (Typ `kapitelwahl`)
- `phase_4_primaerabfrage`: `anzahl_patienten`, `alter` (Typ `zahl`), `geschlecht`, `bw` (Bewusstsein), `at` (Atmung)

**Diese IDs und Antwortwerte nicht ändern** – das Spiel braucht sie, um Anrufer und Patienten zu erzeugen:
- `anrufer`: `1` (Patient selbst), `2` (jemand beim Patienten), `3` (jemand nicht beim Patienten), `einrichtung` (Arzt/Pflege), `polizei`, `ls` (andere Leitstelle), `system` (automatische Meldung)
- `anzahl_patienten`: `1`, `n`, `unbekannt`
- `geschlecht`: `m`, `w`, `unbekannt`
- `bw`: `ja` (wach, normal), `getruebt` (wach, aber verwirrt/schläfrig), `nein` (bewusstlos), `unbekannt`
- `at`: `normal`, `abnorm` (erschwert, Atemnot), `agonal` (Schnappatmung), `keine`, `unbekannt`
Die Fragetexte und Beschriftungen darfst (und sollst) du eigenständig formulieren.

### 3.4 Frage
`{"id": "…", "text": "…", "typ": "single" | "zahl" | "text" | "kapitelwahl", "optionen": [{"wert": "…", "label": "…"}], "hinweis": "…", "anzeigen_wenn": <Bedingung>}`
- `id`: kurz, klein, ohne Leerzeichen. Alle Antworten landen in **einem** gemeinsamen Wörterbuch – gleiche IDs in verschiedenen Kapiteln bedeuten dieselbe Antwort.
- `single` braucht `optionen`; biete fast immer auch `unbekannt` an.
- `zahl`: Zahleneingabe plus „unbekannt“.
- `anzeigen_wenn`: Frage nur stellen, wenn die Bedingung stimmt.

### 3.5 Bedingung
- `{"q": "bw", "in": ["nein", "getruebt"]}` – Antwort ist einer der Werte (nicht gestellt → falsch)
- `{"q": "alter", "gte": 65}`, `{"q": "alter", "lt": 6}` – Zahlenvergleich. **Unbekannte Zahl gilt als erfüllt** (sichere Seite), außer `"unbekannt_ist": false`.
- `{"q": "alter", "ist_unbekannt": true}`
- `{"all": [ … ]}` (UND), `{"any": [ … ]}` (ODER), `{"not": … }` (NICHT)

### 3.6 Kapitel
```
"02": {
  "kapitel": "02",                  // gleich wie der Schlüssel
  "titel": "Sturz",
  "stichworte": ["gestürzt", …],    // hilft beim Finden
  "primaerabfrage": true,           // Phase 4 stellen (fast immer true)
  "kreislaufstillstand": {"code": "…"} | {"wechsel_zu_kapitel": "…"} | {"weiter_mit_fragen": true} | null,
  "fragen": [ … ],
  "regeln": [ … ],
  "suffix": {"regeln": [{"wenn": <Bedingung>, "suffix": "L"}], "standard": ""},
  "aufwertung": {"4": "02-S4-00"},  // optional: Stufe → Code
  "polizei_kennung": {"*": "…"},    // optional: Code, wenn „Polizei“ markiert ist (Schlüssel: Code, Stufe oder *)
  "zusatzkennungen": {"<Code>": ["<Sondercode>"]},  // optional
  "aufloesung": { … },              // optional, siehe unten
  "hinweis": "…"                    // optional
}
```
- `kreislaufstillstand` greift, wenn `bw` = `nein` und `at` = `keine` (bzw. Schnappatmung).
- **Regeln** werden von oben nach unten geprüft, die **erste passende** gilt. Jede Regel hat optional `wenn` und **genau eines** von:
  - `"code": "02-S3-01"`
  - `"wechsel_zu_kapitel": "05"` (+ optional `"vorbelegung": {"frage": "wert"}`) – in ein anderes Kapitel wechseln
  - `"code_nach_antwort": {"frage": "x", "zuordnung": {"antwort": "CODE"}}` – Code direkt aus einer Antwort
- **Die letzte Regel hat kein `wenn`.** So endet jeder Weg sicher auf einem Code.
- Ordne die Regeln **von dringlich nach weniger dringlich**.

### 3.7 Suffix und Auflösung
- Nach der Regel wird ein Suffix bestimmt (erste passende `suffix.regeln`, sonst `suffix.standard`).
- Ohne `aufloesung` ist der fertige Code `Code + Suffix`, **wenn es diesen Code in `codes` gibt**, sonst der Code ohne Suffix. Das ist die einfache Variante – nimm sie.
- Mit `aufloesung` (`{"<Code>": {"_": "<Code>", "L": "<Code/L>"}}`) legst du jede Kombination selbst fest; `_` = ohne Suffix.

### 3.8 codes
Jeder Code, der herauskommen kann, braucht einen Eintrag: `name` (kurz und eindeutig), `kategorie` (genau ein `einsatzstufen[].stufe`), `kapitel` („02 - Sturz“).

## 4. Regeln für gute Abfragen

- Kurze, klare Fragen, wie man sie am Telefon stellt. Eine Sache pro Frage.
- Zuerst Lebensgefahr klären, dann Details.
- Antworten so wählen, dass ein Laie sie geben kann („Ist die Haut blass und kaltschweißig?“ statt Fachbegriffe).
- Jede Antwort, die die Dringlichkeit ändert, muss in einer Regel vorkommen; Fragen ohne Wirkung weglassen.
- Kinder, Schwangere und sehr alte Menschen beachten (Altersgrenzen über `alter`).
- Bei Unsicherheit: dringlicher.

## 5. Prüfen, bevor du die Datei ausgibst

1. Gültiges JSON (doppelte Anführungszeichen, keine Kommentare, keine Komma-Fehler).
2. Jeder Code in `regeln`, `kreislaufstillstand`, `aufwertung`, `polizei_kennung`, `zusatzkennungen` steht in `codes` (oder ist in `aufloesung` aufgelöst).
3. Jede `kategorie` in `codes` steht in `einsatzstufen`.
4. Jedes Kapitel: letzte Regel ohne `wenn`; `wechsel_zu_kapitel` zeigt auf ein vorhandenes Kapitel.
5. Jede Bedingung fragt nur IDs, die es gibt.
6. Gehe pro Kapitel mindestens drei Fälle durch (leicht, mittel, lebensbedrohlich) und schreib dem Ersteller kurz auf, welcher Code jeweils herauskommt.

LeitWerk prüft die Datei beim Laden (Einstellungen → Einsatzcodes & Abfrage → „CSV importieren …“ bzw. „Codesystem laden …“) und zeigt Fehler und Hinweise an.

## 6. Dieses Beispiel

Unten folgen drei Beispielkapitel (01 Atemnot, 02 Sturz, 03 Brustschmerz) mit Codes im Aufbau `KK-Sx-NN`: Stufe S0 (Beratung) bis S5 (Kreislaufstillstand). Die Inhalte sind frei erfunden und nur zur Veranschaulichung – nicht medizinisch geprüft.
""".strip("\n").split("\n")

def code(c, name, kat, kap): return c, {"name": name, "kategorie": kat, "kapitel": kap}

K1 = "01 - Atemnot"; K2 = "02 - Sturz"; K3 = "03 - Brustschmerz"
codes = dict([
 code("01-S5-01", "Atemnot – Atemstillstand / Kreislaufstillstand", "S5 Reanimation", K1),
 code("01-S4-01", "Atemnot – bewusstseinsgetrübt", "S4 Notarzt", K1),
 code("01-S4-02", "Atemnot – kann nicht sprechen, blau/grau", "S4 Notarzt", K1),
 code("01-S3-01", "Atemnot – deutlich, spricht in Satzteilen", "S3 Notfall", K1),
 code("01-S3-02", "Atemnot – Kind unter 6 Jahren", "S3 Notfall", K1),
 code("01-S2-01", "Atemnot – leicht, spricht normal", "S2 Dringend", K1),
 code("02-S5-01", "Sturz – Kreislaufstillstand", "S5 Reanimation", K2),
 code("02-S4-01", "Sturz – bewusstlos oder bewusstseinsgetrübt", "S4 Notarzt", K2),
 code("02-S4-02", "Sturz – aus großer Höhe (über 3 m)", "S4 Notarzt", K2),
 code("02-S3-01", "Sturz – starke Blutung oder Kopfverletzung", "S3 Notfall", K2),
 code("02-S3-02", "Sturz – vermutlicher Knochenbruch Hüfte/Oberschenkel", "S3 Notfall", K2),
 code("02-S2-01", "Sturz – Schmerzen, sonst stabil", "S2 Dringend", K2),
 code("02-S2-01/L", "Sturz – Schmerzen, liegt über 1 Stunde am Boden", "S2 Dringend", K2),
 code("02-S1-01", "Sturz – nicht verletzt, braucht Hilfe beim Aufstehen", "S1 Nicht dringend", K2),
 code("02-S1-01/L", "Sturz – nicht verletzt, liegt über 1 Stunde am Boden", "S2 Dringend", K2),
 code("02-S4-00", "Sturz – manuell aufgewertet (Notarzt)", "S4 Notarzt", K2),
 code("02-S3-01/P", "Sturz – starke Blutung, Polizei verständigt", "S3 Notfall", K2),
 code("03-S5-01", "Brustschmerz – Kreislaufstillstand", "S5 Reanimation", K3),
 code("03-S4-01", "Brustschmerz – bewusstseinsgetrübt", "S4 Notarzt", K3),
 code("03-S4-02", "Brustschmerz – blass, kaltschweißig oder Atemnot", "S4 Notarzt", K3),
 code("03-S3-01", "Brustschmerz – ab 35 Jahren", "S3 Notfall", K3),
 code("03-S2-01", "Brustschmerz – unter 35 Jahren, sonst unauffällig", "S2 Dringend", K3),
 code("03-S0-01", "Brustschmerz – atemabhängig nach Husten, telefonische Beratung", "S0 Beratung", K3),
])

prim_ks_code = lambda c: {"code": c}
kapitel = {
 "01": {"kapitel": "01", "titel": "Atemnot", "stichworte": ["Atemnot", "kriegt keine Luft", "Asthma", "schnauft schwer"], "primaerabfrage": True,
   "kreislaufstillstand": prim_ks_code("01-S5-01"),
   "fragen": [
     {"id": "spricht", "text": "Kann die Person in ganzen Sätzen sprechen?", "typ": "single", "optionen": [{"wert": "saetze", "label": "Ja, ganze Sätze"}, {"wert": "teile", "label": "Nur Satzteile / einzelne Wörter"}, {"wert": "gar_nicht", "label": "Kann gar nicht sprechen"}, {"wert": "unbekannt", "label": "Weiß nicht"}]},
     {"id": "farbe", "text": "Sind Lippen oder Gesicht bläulich oder grau?", "typ": "single", "optionen": JN},
   ],
   "regeln": [
     {"wenn": {"q": "bw", "in": ["nein", "getruebt"]}, "code": "01-S4-01"},
     {"wenn": {"any": [{"q": "spricht", "in": ["gar_nicht"]}, {"q": "farbe", "in": ["ja"]}]}, "code": "01-S4-02"},
     {"wenn": {"q": "alter", "lt": 6, "unbekannt_ist": False}, "code": "01-S3-02"},
     {"wenn": {"q": "spricht", "in": ["teile", "unbekannt"]}, "code": "01-S3-01"},
     {"code": "01-S2-01"},
   ],
   "suffix": {"regeln": [], "standard": ""}},
 "02": {"kapitel": "02", "titel": "Sturz", "stichworte": ["gestürzt", "hingefallen", "Leiter", "Treppe", "liegt am Boden"], "primaerabfrage": True,
   "kreislaufstillstand": prim_ks_code("02-S5-01"),
   "fragen": [
     {"id": "hoehe", "text": "Aus welcher Höhe ist die Person gefallen?", "typ": "single", "optionen": [{"wert": "eben", "label": "Auf ebener Erde / aus dem Stand"}, {"wert": "niedrig", "label": "Bis etwa 3 Meter (Stufen, Sessel, kleine Leiter)"}, {"wert": "hoch", "label": "Mehr als 3 Meter"}, {"wert": "unbekannt", "label": "Weiß nicht"}]},
     {"id": "blutung", "text": "Blutet es stark, oder ist der Kopf verletzt?", "typ": "single", "optionen": JN},
     {"id": "huefte", "text": "Kann die Person ein Bein nicht bewegen, oder ist ein Bein verdreht/verkürzt?", "typ": "single", "optionen": JN},
     {"id": "schmerz", "text": "Hat die Person Schmerzen?", "typ": "single", "optionen": JN},
     {"id": "liegezeit", "text": "Wie lange liegt die Person schon am Boden?", "typ": "single", "optionen": [{"wert": "kurz", "label": "Weniger als 1 Stunde"}, {"wert": "lang", "label": "1 Stunde oder länger"}, {"wert": "steht", "label": "Liegt nicht mehr"}, {"wert": "unbekannt", "label": "Weiß nicht"}]},
   ],
   "regeln": [
     {"wenn": {"q": "bw", "in": ["nein", "getruebt"]}, "code": "02-S4-01"},
     {"wenn": {"q": "hoehe", "in": ["hoch"]}, "code": "02-S4-02"},
     {"wenn": {"q": "blutung", "in": ["ja"]}, "code": "02-S3-01"},
     {"wenn": {"q": "huefte", "in": ["ja"]}, "code": "02-S3-02"},
     {"wenn": {"q": "schmerz", "in": ["ja", "unbekannt"]}, "code": "02-S2-01"},
     {"code": "02-S1-01"},
   ],
   "suffix": {"regeln": [{"wenn": {"q": "liegezeit", "in": ["lang"]}, "suffix": "/L"}], "standard": ""},
   "aufwertung": {"4": "02-S4-00"},
   "polizei_kennung": {"02-S3-01": "02-S3-01/P"}},
 "03": {"kapitel": "03", "titel": "Brustschmerz", "stichworte": ["Brustschmerz", "Druck auf der Brust", "Herz", "Engegefühl"], "primaerabfrage": True,
   "kreislaufstillstand": prim_ks_code("03-S5-01"),
   "fragen": [
     {"id": "kaltschweiss", "text": "Ist die Person blass und kaltschweißig?", "typ": "single", "optionen": JN},
     {"id": "atemnot_bs", "text": "Hat die Person zusätzlich Atemnot?", "typ": "single", "optionen": JN},
     {"id": "husten_bs", "text": "Wird der Schmerz nur beim Husten oder tiefen Einatmen stärker, und ist die Person unter 35?", "typ": "single", "optionen": JN, "anzeigen_wenn": {"q": "alter", "lt": 35, "unbekannt_ist": False}},
   ],
   "regeln": [
     {"wenn": {"q": "bw", "in": ["nein", "getruebt"]}, "code": "03-S4-01"},
     {"wenn": {"any": [{"q": "kaltschweiss", "in": ["ja"]}, {"q": "atemnot_bs", "in": ["ja"]}, {"q": "at", "in": ["abnorm", "agonal"]}]}, "code": "03-S4-02"},
     {"wenn": {"q": "alter", "gte": 35}, "code": "03-S3-01"},
     {"wenn": {"q": "husten_bs", "in": ["ja"]}, "code": "03-S0-01"},
     {"code": "03-S2-01"},
   ],
   "suffix": {"regeln": [], "standard": ""}},
}

globale = {
 "phase_1_einsatzort": [
   {"id": "ort_adresse", "text": "Wo ist der Notfall? (Ort, Straße, Hausnummer)", "typ": "text"},
   {"id": "ort_zusatz", "text": "Genauere Angaben zum Ort (Stiege, Stock, Zufahrt, Merkmale)", "typ": "text"}],
 "phase_2_rueckruf": [{"id": "rueckrufnummer", "text": "Unter welcher Nummer erreichen wir Sie?", "typ": "text"}],
 "phase_3_was_ist_passiert": [
   {"id": "schilderung", "text": "Was ist passiert? (Schilderung in Stichworten)", "typ": "text"},
   {"id": "anrufer", "text": "Wer ruft an?", "typ": "single", "optionen": [
     {"wert": "1", "label": "Betroffene Person selbst"}, {"wert": "2", "label": "Jemand bei der Person"}, {"wert": "3", "label": "Jemand, der nicht bei der Person ist"},
     {"wert": "einrichtung", "label": "Arzt / Pflege / Einrichtung"}, {"wert": "polizei", "label": "Polizei"}, {"wert": "ls", "label": "Andere Leitstelle"}, {"wert": "system", "label": "Automatische Meldung"}]},
   {"id": "kapitel", "text": "Hauptbeschwerde wählen", "typ": "kapitelwahl"}],
 "phase_4_primaerabfrage": [
   {"id": "anzahl_patienten", "text": "Wie viele Personen brauchen Hilfe?", "typ": "single", "optionen": [{"wert": "1", "label": "Eine"}, {"wert": "n", "label": "Mehrere"}, {"wert": "unbekannt", "label": "Weiß nicht"}]},
   {"id": "alter", "text": "Wie alt ist die Person ungefähr?", "typ": "zahl", "hinweis": "Schätzung reicht."},
   {"id": "geschlecht", "text": "Ist die Person ein Mann oder eine Frau?", "typ": "single", "optionen": [{"wert": "m", "label": "Mann"}, {"wert": "w", "label": "Frau"}, {"wert": "unbekannt", "label": "Weiß nicht / divers"}]},
   {"id": "bw", "text": "Ist die Person wach und reagiert sie normal?", "typ": "single", "optionen": [{"wert": "ja", "label": "Ja, wach und normal"}, {"wert": "getruebt", "label": "Wach, aber verwirrt oder sehr schläfrig"}, {"wert": "nein", "label": "Nein, reagiert nicht"}, {"wert": "unbekannt", "label": "Weiß nicht"}]},
   {"id": "at", "text": "Atmet die Person? Wie?", "typ": "single", "optionen": [{"wert": "normal", "label": "Ja, normal"}, {"wert": "abnorm", "label": "Ja, aber schwer / mit Atemnot"}, {"wert": "agonal", "label": "Nur vereinzelte Schnapper"}, {"wert": "keine", "label": "Nein, atmet nicht"}, {"wert": "unbekannt", "label": "Weiß nicht"}]}],
}

einsatzstufen = [
 {"stufe": "S5 Reanimation", "rettungsmittel": "RTW-C>RTW>KTW", "nfs_erforderlich": False, "notarzt": "schnellster", "sondersignal": True, "kategorie": "kritisch", "transport_prozent": 70},
 {"stufe": "S4 Notarzt", "rettungsmittel": "RTW-C>RTW>KTW", "nfs_erforderlich": False, "notarzt": "nef", "sondersignal": True, "kategorie": "kritisch", "transport_prozent": 85},
 {"stufe": "S3 Notfall", "rettungsmittel": "RTW-C>RTW>KTW", "nfs_erforderlich": True, "notarzt": "nein", "sondersignal": True, "kategorie": "dringend", "transport_prozent": 80},
 {"stufe": "S2 Dringend", "rettungsmittel": "RTW>KTW>RTW-C", "nfs_erforderlich": False, "notarzt": "nein", "sondersignal": False, "kategorie": "dringend", "transport_prozent": 70},
 {"stufe": "S1 Nicht dringend", "rettungsmittel": "KTW>RTW", "nfs_erforderlich": False, "notarzt": "nein", "sondersignal": False, "kategorie": "stabil", "transport_prozent": 50},
 {"stufe": "S0 Beratung", "rettungsmittel": "", "nfs_erforderlich": False, "notarzt": "nein", "sondersignal": False, "kategorie": "stabil", "transport_prozent": 0},
]

d = {"format": "leitwerk-codesystem", "version": 1, "name": "Beispiel-Codesystem (LeitWerk)",
     "beschreibung": "Kleines, frei erfundenes Beispiel: drei Kapitel. Zeigt den Aufbau einer Codesystem-Datei (Codes und Abfrage in einer Datei).",
     "anleitung_fuer_ki": anleitung,
     "stufen": {"muster": "^\\d{2}-S(\\d)", "reihenfolge": ["0", "1", "2", "3", "4", "5"]},
     "einsatzstufen": einsatzstufen, "globale_fragen": globale, "kapitel": kapitel, "codes": codes}
open(sys.argv[1], "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
