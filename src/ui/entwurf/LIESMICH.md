# Fenster aus dem Entwurf ins Spiel bringen

Die Entwürfe („LeitWerk Arbeitsplatz“, „LeitWerk Spielmenü“) sind Canvas-Komponenten (`*.dc.html`):
Vorlage mit `{{…}}`, `<sc-for list="{{…}}" as="x">`, `<sc-if value="{{…}}">`, CSS in `<style>`, Logik in
`class Component extends DCLogic { renderVals() { … } }`. Im Spiel werden sie **so direkt wie möglich** übernommen:

1. Ordner `src/ui/fenster/<name>/` anlegen:
   - `vorlage.html` – Inhalt von `<x-dc>` ohne `<helmet>`. `onClick` usw. bleiben (die Laufzeit kennt alle üblichen Ereignisse).
   - `<name>.css` – CSS aus `<style>` (ohne `body{…}`); Klassen am besten mit eigener Vorsilbe lassen, wie im Entwurf.
   - `logik.js` – die Klasse aus dem Entwurf: `import { DCLogic } from "../../entwurf/dclogic.js"; export class XLogik extends DCLogic { … }`
     (+ `logik.d.ts`). Beispieldaten im Entwurf durch `this.props.app.…` ersetzen (echte Daten, Aktionen).
   - `index.ts` – Anbindung an Spiel, Store, Simulation; ruft `entwurfEinbinden(...)` aus `../../entwurf/einbinden` auf und
     zeichnet bei Änderungen neu (`fenster.zeichnen()`).
2. Die gemeinsamen Klassen des Entwurfs (`.fe`, `.kn`, `.segs`, `.pill`, `.feld`, `.stufe`, `.ic` …) liegen in
   `entwurf/fenster.css` und gelten innerhalb von `.ap`. Die Wurzel bekommt `ap ew-fenster` automatisch.
   Im Entwurf hat die Vorlage oft selbst eine Wurzel mit `class="{{wCls}}"` = `ap dunkel …`: dort `ap`/`dunkel`/`hell`
   weglassen (Farben kommen aus dem Farbschema des Spiels, `props.thema` gibt es trotzdem).
3. `props.breite` / `props.hoehe` / `props.thema` kommen laufend aus dem Fenster (wie auf der Entwurfsfläche).
4. Den Fenster-Kopf aus dem Entwurf (`.fe-kopf` mit Reitern und Knöpfen) **nicht** zeichnen – den liefert dockview
   (Reitertitel, Zahl am Reiter über `setzeBadge` in `ws/arbeitsplatz.ts`). Nur den Inhalt (`.inhalt` …) übernehmen.
5. Texte, Abstände, Animationen und Verhalten 1:1 wie im Entwurf. Wo das Spiel etwas (noch) nicht kann: weglassen und notieren,
   nichts Erfundenes fest einbauen.
