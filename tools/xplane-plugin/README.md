# LeitWerk-Plugin für X-Plane 12

Die Einsatz-App (wie im Tablet der H145 bzw. im EFB bei MSFS) als X-Plane-Fenster – auch in VR – und im Cockpit,
X-Plane-Befehle für Status, Sprechtaste und Tablet, das TETRA-Funkgerät der EC135 und das Wetter von LeitWerk.

## Cockpit (X-Plane 12.1+, eigene Geräte über `XPLMCreateAvionicsEx`)

| Gerät | Bildpunkte | Wo |
|---|---|---|
| `leitwerk_mfd` | 600 × 720 | EC135: linkes MFD (Platz der EuroNav-Karte), solange LeitWerk läuft (`leitwerk/aktiv`) |
| `leitwerk_tablet` | 1000 × 600 | EC135: Klapp-Tablet (AviTab-Fläche), wenn `leitwerk/tablet/app` = 1 – Querformat, Transport \| Patient |
| `leitwerk_kachel` | 202 × 220 | Kachel „LeitWerk“ auf der AviTab-Startseite (`avitab/is_in_menu`), öffnet die App |
| `leitwerk_tetra` | 1280 × 960 | TETRA-Funkgerät (Modell vom Kollegen), Anzeige wie das CARLS |

Datarefs: `leitwerk/aktiv`, `leitwerk/tablet/app` (schreibbar), `leitwerk/tetra/eingebaut`, `leitwerk/tetra/strom`,
`leitwerk/tetra/rotation`, `leitwerk/tetra/anim/<Taste>`. Den Einbau in die EC135 macht LeitWerk (Rust `ec135.rs`).
Neue XPLM-Funktionen holt das Plugin über `XPLMFindSymbol` – es lädt auch in X-Plane 12.0 (dann nur das Fenster).

## Wetter (X-Plane 12.3+, `XPLMSetWeatherAtLocation`)

Das Plugin liest `neu.wx` aus `/stand` und setzt das Wetter um den Hubschrauber (60 NM). X-Plane blendet es über
1–2 Minuten ein; Wechsel über die eingestellte Dauer in Schritten (alle 20 s). Sofort nur am Boden (Anfang, „Sofort“).

- Daten wie die EFB-App: `GET http://127.0.0.1:47900–47905/stand`, Tastendrücke `POST /befehl`.
  Kartenkacheln holt LeitWerk (`/kachel/z/y/x.png`), weil das Plugin kein HTTPS spricht.
- Gezeichnet mit Dear ImGui (eigene Zeichenroutine über XPLM/OpenGL, Ausschnitte wie im SDK-Beispiel
  „window scissoring“). In VR: `XPLMSetWindowPositioningMode(xplm_WindowVR)`.
- Lebenszeichen alle 10 s: `xp:plugin:<version>:<vr|2d>:<an|aus>:<kann>:<cockpit>:<wetter>` (Anzeige im Piloten-Cockpit).
- Funkgerät: Tasten gehen als `tt:<Taste>` an LeitWerk (gleiche Logik wie das CARLS), grüne Taste = `funk_an/_aus`.
- Einbau: LeitWerk legt `LeitWerk/<win_x64|mac_x64>/LeitWerk.xpl` und `LeitWerk/schrift/inter-*.ttf` in
  `X-Plane 12/Resources/plugins` (Rust `xplane_plugin`). Die Datei baut GitHub Actions (`build.yml`, Job
  „X-Plane-Plugin“) und legt sie nach `src-tauri/xplane-plugin/…`, `build.rs` packt sie ins Programm.

## Befehle (in X-Plane auf Tasten legen, Suche „LeitWerk“)

| Befehl | Wirkung |
|---|---|
| `leitwerk/tablet` | Tablet zeigen/verbergen |
| `leitwerk/status_9`, `leitwerk/status_1` … `_6` | Status geben |
| `leitwerk/sprechen`, `leitwerk/sprechen_2` | Sprechtaste (halten) |
| `leitwerk/zielort` | Tablet mit „Zielort buchen“ |
| `leitwerk/status_geben` | Tablet mit „Status geben“ |
| `leitwerk/navigation` | Tablet mit großer Karte |
| `leitwerk/tablet_app`, `_auf`, `_zu` | Klapp-Tablet im Cockpit: LeitWerk / AviTab |
| `leitwerk/tetra/<Taste>` | Tasten des TETRA-Funkgeräts (KEY_0…9, NAV_*, END_POWER, CALL, DREHKNOPF, turn_left/right …) |

## Bauen und testen

```
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release
test/lauf.sh test/skript-rundgang.txt /tmp/xp-test        # Linux: nachgebautes X-Plane (Xvfb) + LeitWerk-Attrappe
test/lauf.sh test/skript-cockpit.txt /tmp/xp-cockpit     # Cockpit-Geräte, Funkgerät, Wetter (ATTRAPPE_ALT=1: wie X-Plane 12.0)
```

`test/attrappe.cpp` lädt das Plugin, stellt die benutzten XPLM-Funktionen bereit, spielt ein Skript ab
(Klicks, Ziehen, Tasten, VR an/aus, Befehle) und macht Bildschirmfotos. `test/stand-*.json` sind Beispiel-Stände.

## Fremder Code

- X-Plane SDK 4.3.0 (`sdk/`, Lizenz in `sdk/license.txt`)
- Dear ImGui 1.91.9 (`extern/imgui`, MIT)
- stb_image / stb_image_write (`extern/stb`, gemeinfrei bzw. MIT)
