// Farben aus dem Stand („#RRGGBB“, „#RGB“, „rgba(r,g,b,a)“) und die Farben der Einsatz-App
#pragma once
#include <cstdio>
#include <cstdlib>
#include <string>
#include "imgui.h"

inline ImU32 rgb(unsigned hex, float a = 1.f) {
  return IM_COL32((hex >> 16) & 255, (hex >> 8) & 255, hex & 255, (int)(a * 255.f + 0.5f));
}

inline ImU32 farbe(const std::string& s, ImU32 sonst) {
  if (s.size() == 7 && s[0] == '#') return rgb((unsigned)strtoul(s.c_str() + 1, nullptr, 16));
  if (s.size() == 4 && s[0] == '#') {
    unsigned v = (unsigned)strtoul(s.c_str() + 1, nullptr, 16);
    unsigned r = (v >> 8) & 15, g = (v >> 4) & 15, b = v & 15;
    return IM_COL32(r * 17, g * 17, b * 17, 255);
  }
  int r, g, b;
  float a = 1;
  if (sscanf(s.c_str(), "rgba(%d,%d,%d,%f)", &r, &g, &b, &a) >= 3 || sscanf(s.c_str(), "rgb(%d,%d,%d)", &r, &g, &b) == 3)
    return IM_COL32(r, g, b, (int)(a * 255));
  return sonst;
}

// Farben wie efb.html
namespace fb {
const unsigned GRUND = 0x0E0F12, KOPF = 0x13151A, LINIE = 0x23262F, KARTE = 0x1E2129, KARTE2 = 0x262A34, BLATT = 0x1A1D24,
               RAND = 0x2A2F3A, TEXT = 0xF5F7FA, TEXT2 = 0xC4CAD6, TEXT3 = 0xE2E6EE, GRAU = 0x9AA3B5, DUNKELGRAU = 0x6B7385,
               BLAU = 0x3B8BFF, HELLBLAU = 0x7FB0FF, BLAUTEXT = 0xCFE0FF, SCHWARZ = 0x111216, GRUEN = 0x4CC38A, GELB = 0xFFC72C,
               GELBTEXT = 0xFFD866, ROT = 0xFF5A5F, ROTTEXT = 0xFF7A7E, ALARM = 0xB42318, AUS = 0x20242A, WARN = 0x3A3020;
}
