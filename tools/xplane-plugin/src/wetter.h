// Wetter von LeitWerk in X-Plane setzen (X-Plane 12.3+: XPLMSetWeatherAtLocation). X-Plane blendet neue Werte selbst
// über 1–2 Minuten ein – kein Ruckeln wie beim sofortigen Neuaufbau. Sofort nur am Boden (Anfang, Wechsel „Sofort“).
#pragma once
#include <string>

namespace wetter {
void start();         // XPluginStart: Funktionen suchen
void stopp();
void an();            // XPluginEnable: Flugschleife (vor dem Flugmodell)
void aus();
bool moeglich();      // X-Plane kann Wetter von Plugins annehmen
std::string text();   // kurzer Stand für LeitWerk (ohne „:“)
}  // namespace wetter
