// Die Einsatz-App (wie im Tablet bei MSFS) mit Dear ImGui gezeichnet.
#pragma once
#include <string>

namespace ui {

// Texturen erzeugen/löschen (vom Plugin über XPLM bereitgestellt)
typedef unsigned (*TexNeu)(int w, int h, const unsigned char* rgba);
typedef void (*TexWeg)(unsigned tex);

// Einmal beim Start (ImGui-Kontext muss bestehen). schrift = Ordner mit inter-400/600/700.ttf
// Die Schriften werden doppelt so groß gebacken (scharf auch vergrößert / in VR).
void start(const std::string& schriftOrdner, TexNeu neu, TexWeg weg);
void ende();

// Ein Bild der App (zwischen ImGui::NewFrame und ImGui::Render), w/h = logische Größe
void bild(float w, float h, double jetzt);

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
