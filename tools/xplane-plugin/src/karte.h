// Karte mit Kacheln von basemap.at (über LeitWerk geholt), Norden oben – wie in der Einsatz-App.
#pragma once
#include "imgui.h"
#include "json.h"

namespace karte {

struct Ansicht {
  double lat = 48.4, lon = 15.6;
  int z = 12;
  bool folgen = true;
};

typedef unsigned (*TexNeu)(int w, int h, const unsigned char* rgba);
typedef void (*TexWeg)(unsigned tex);
void start(TexNeu neu, TexWeg weg);
void ende();
// fertige Kacheln hochladen (im GL-Kontext, einmal pro Bild)
void takt(double jetzt);

// Ausschnitt so legen, dass beide Punkte drin sind
void passend(Ansicht& a, double lat1, double lon1, double lat2, double lon2, float w, float h);
// d = stand.neu.tab.karte; klein = Vorschau im Einsatz
void zeichnen(Ansicht& a, ImVec2 p0, ImVec2 groesse, const Json& d, bool klein, ImFont* fKlein, ImFont* fFett);
// verschieben um Pixel
void schieben(Ansicht& a, float dx, float dy);
void zoom(Ansicht& a, int d);

}  // namespace karte
