# LeitWerk-Plugin für X-Plane 12

Die Einsatz-App (wie im Tablet der H145 bzw. im EFB bei MSFS) als X-Plane-Fenster – auch in VR – und
X-Plane-Befehle für Status, Sprechtaste und Tablet.

- Daten wie die EFB-App: `GET http://127.0.0.1:47900–47905/stand`, Tastendrücke `POST /befehl`.
  Kartenkacheln holt LeitWerk (`/kachel/z/y/x.png`), weil das Plugin kein HTTPS spricht.
- Gezeichnet mit Dear ImGui (eigene Zeichenroutine über XPLM/OpenGL, Ausschnitte wie im SDK-Beispiel
  „window scissoring“). In VR: `XPLMSetWindowPositioningMode(xplm_WindowVR)`.
- Lebenszeichen alle 10 s: `xp:plugin:<version>:<vr|2d>:<an|aus>` (Anzeige im Piloten-Cockpit).
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

## Bauen und testen

```
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release
test/lauf.sh test/skript-rundgang.txt /tmp/xp-test        # Linux: nachgebautes X-Plane (Xvfb) + LeitWerk-Attrappe
```

`test/attrappe.cpp` lädt das Plugin, stellt die benutzten XPLM-Funktionen bereit, spielt ein Skript ab
(Klicks, Ziehen, Tasten, VR an/aus, Befehle) und macht Bildschirmfotos. `test/stand-*.json` sind Beispiel-Stände.

## Fremder Code

- X-Plane SDK 4.1.1 (`sdk/`, Lizenz in `sdk/license.txt`)
- Dear ImGui 1.91.9 (`extern/imgui`, MIT)
- stb_image / stb_image_write (`extern/stb`, gemeinfrei bzw. MIT)
