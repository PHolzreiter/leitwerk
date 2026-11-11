// Die Einsatz-App (wie im Tablet bei MSFS) mit Dear ImGui gezeichnet – für mehrere Bildschirme:
// schwebendes Fenster (auch VR), linkes MFD und Klapp-Tablet im Cockpit, AviTab-Kachel, TETRA-Funkgerät.
#pragma once
#include <string>

struct Json;

namespace ui {

// Texturen erzeugen/löschen (vom Plugin über XPLM bereitgestellt)
typedef unsigned (*TexNeu)(int w, int h, const unsigned char* rgba);
typedef void (*TexWeg)(unsigned tex);

// Einmal beim Start im ersten ImGui-Kontext: Schriften (doppelt gebacken, scharf auch vergrößert / in VR).
// Weitere Kontexte teilen sich den Schrift-Atlas (ImGui::CreateContext(atlas)) und rufen stilSetzen().
void start(const std::string& schriftOrdner, TexNeu neu, TexWeg weg);
void stilSetzen();
void ende();

// Neuen Stand von LeitWerk übernehmen (Flugschleife, auch ohne sichtbaren Bildschirm)
void standLesen();
// Einmal pro Bild (vor allen Bildschirmen, im OpenGL-Kontext): Uhr, Kartenkacheln hochladen
void takt(double jetzt);
const Json& standJson();

// Zustand eines Bildschirms (Reiter, offenes Blatt, Karte, Suchfeld …)
struct Zustand {
  struct Daten;
  Daten* d;
  Zustand();
  ~Zustand();
  Zustand(const Zustand&) = delete;
  Zustand& operator=(const Zustand&) = delete;
};
// vor dem Zeichnen und vor Befehlen von außen: welcher Bildschirm gemeint ist
void zustand(Zustand* z);

enum Art { HOCH, QUER };
// Ein Bild der App (zwischen ImGui::NewFrame und ImGui::Render), w/h = logische Größe
void bild(float w, float h, Art art);
// Knopf „‹ AviTab“ im Querformat gedrückt? (einmal true)
bool zurueck();
// Kachel „LeitWerk“ auf der AviTab-Startseite
void kachel(float w, float h);
// Display des TETRA-Funkgeräts (wie das CARLS)
void tetra(float w, float h, bool strom);

// Tastatur (Suchfeld): will die App gerade Tasten haben?
bool willTasten();
void tasteText(const std::string& utf8);
void tasteZurueck();
void tasteFertig();

// Von außen (Befehle, Menü)
void buchenOeffnen();
void statusOeffnen();
void kartenOeffnen();

}  // namespace ui
