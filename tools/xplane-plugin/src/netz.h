// Verbindung zu LeitWerk (nur dieser Rechner, 127.0.0.1, Port 47900–47905) – in einem eigenen Thread,
// damit X-Plane nie auf das Netz wartet.
#pragma once
#include <string>
#include <vector>

namespace netz {

void starten();
void stoppen();

// Neuester Stand (JSON-Text) und ob er sich seit dem letzten Abholen geändert hat
bool standNeu(std::string& json);
// Verbunden mit LeitWerk? (Port gefunden und letzte Anfrage gelungen)
bool verbunden();
int port();

// Befehl an LeitWerk (wie die Einsatz-App: „s3“, „bu:kh:…“, „funk_an“ …)
void senden(const std::string& befehl);

// Kartenkachel anfordern (z/y/x); fertige Kacheln abholen
void kachelHolen(int z, int y, int x);
struct Kachel {
  int z, y, x;
  std::vector<unsigned char> png;  // leer = nicht verfügbar
};
bool kachelFertig(Kachel& k);

}  // namespace netz
