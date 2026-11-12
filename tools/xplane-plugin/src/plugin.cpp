// LeitWerk-Plugin für X-Plane 12: die Einsatz-App als Fenster (auch in VR) und im Cockpit (MFD, Klapp-Tablet),
// TETRA-Funkgerät, Wetter von LeitWerk und Befehle für Status/Sprechtaste.
// Daten kommen von LeitWerk auf demselben PC (wie bei der EFB-App in MSFS: http://127.0.0.1:47900–47905).
#include <cfloat>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <algorithm>
#include <string>
#include <vector>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif
#if defined(__APPLE__)
#include <OpenGL/gl.h>
#else
#include <GL/gl.h>
#endif
#ifndef GL_CLAMP_TO_EDGE
#define GL_CLAMP_TO_EDGE 0x812F
#endif

#include "XPLMDataAccess.h"
#include "XPLMDisplay.h"
#include "XPLMGraphics.h"
#include "XPLMMenus.h"
#include "XPLMPlugin.h"
#include "XPLMProcessing.h"
#include "XPLMUtilities.h"
#include "ansicht.h"
#include "imgui.h"
#include "netz.h"

#ifndef LEITWERK_PLUGIN_VERSION
#define LEITWERK_PLUGIN_VERSION "0.0.0"
#endif

#include "wetter.h"

// ------------------------------------------------------------------ Bildschirme
// Jeder Bildschirm hat einen eigenen ImGui-Kontext (gemeinsame Schriften) und einen eigenen Zustand (Reiter, Blatt …).
enum SchirmArt { FENSTER, MFD, TABLET, KACHEL, TETRA };
struct Schirm {
  SchirmArt art;
  const char* id;    // Gerät im Cockpit (ATTR_cockpit_device …)
  const char* name;
  int pxW, pxH;      // Bildpunkte des Geräts
  float logW, logH;  // logische Größe (Entwurf)
  ImGuiContext* ctx = nullptr;
  ui::Zustand z;
  XPLMAvionicsID av = nullptr;
  double letztesBild = 0, aktivBis = 0, naechstes = 0;
  int cursorBild = 0, bildNr = 0;
  bool gezeichnet = false;  // seit dem Start schon einmal gezeichnet (Gerät steckt im Cockpit)
};

static Schirm sFenster{FENSTER, nullptr, nullptr, 0, 0, 460, 780};
// MFD links (EuroNav-Platz, Hochformat ~ 0,83), Klapp-Tablet rechts (AviTab-Fläche 800 × 480), Kachel, Funkgerät-LCD
static Schirm sMfd{MFD, "leitwerk_mfd", "LeitWerk MFD", 600, 720, 460, 552};
static Schirm sTablet{TABLET, "leitwerk_tablet", "LeitWerk Tablet", 1000, 600, 800, 480};
static Schirm sKachel{KACHEL, "leitwerk_kachel", "LeitWerk Kachel", 202, 220, 101, 110};
static Schirm sTetra{TETRA, "leitwerk_tetra", "LeitWerk TETRA", 1280, 960, 470, 352.5f};
static Schirm* const GERAETE[] = {&sMfd, &sTablet, &sKachel, &sTetra};

static XPLMWindowID fenster = nullptr;
static bool uiBereit = false;
static float skala = 1.0f;
static bool imVR = false;
static bool hatFokus = false;
static int menueId = -1;
static XPLMMenuID menue = nullptr;
static int mZeigen, mStatus, mGroesse[3];
static std::string schriftOrdner, prefDatei;
static int geo[4] = {0, 0, 0, 0};  // gespeicherte Lage (l, t, r, b) außerhalb von VR
static int vrGeo[2] = {0, 0};
static bool startSichtbar = false;
static XPLMDataRef drVR, drMV, drPJ, drVP, drVolt, drAvionik, drBatterie;
static double letzteMeldung = -100;
static int letzterZyklus = -1;

static const float GROESSEN[3] = {1.0f, 1.25f, 1.5f};

static void log(const std::string& s) { XPLMDebugString(("LeitWerk: " + s + "\n").c_str()); }

// ------------------------------------------------------------------ Neuere XPLM-Funktionen (erst ab X-Plane 12.1 / 12.3):
// über XPLMFindSymbol, damit das Plugin auch in älteren Versionen lädt
typedef XPLMAvionicsID (*CreateAvionicsEx_f)(XPLMCreateAvionics_t*);
typedef void (*DestroyAvionics_f)(XPLMAvionicsID);
typedef void (*AvionicsNeedsDrawing_f)(XPLMAvionicsID);
typedef int (*IsAvionicsBound_f)(XPLMAvionicsID);
static CreateAvionicsEx_f xCreateAvionicsEx = nullptr;
static DestroyAvionics_f xDestroyAvionics = nullptr;
static AvionicsNeedsDrawing_f xAvionicsNeedsDrawing = nullptr;
static IsAvionicsBound_f xIsAvionicsBound = nullptr;

// ------------------------------------------------------------------ Texturen
static unsigned texNeu(int w, int h, const unsigned char* rgba) {
  int id = 0;
  XPLMGenerateTextureNumbers(&id, 1);
  XPLMBindTexture2d(id, 0);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, rgba);
  return (unsigned)id;
}

static void texWeg(unsigned t) {
  GLuint g = t;
  glDeleteTextures(1, &g);
}

// ------------------------------------------------------------------ Einstellungen
static void prefLesen() {
  FILE* f = fopen(prefDatei.c_str(), "r");
  if (!f) return;
  char z[256];
  while (fgets(z, sizeof z, f)) {
    float v;
    int a, b, c, d;
    if (sscanf(z, "skala %f", &v) == 1 && v >= 0.75f && v <= 2.5f) skala = v;
    else if (sscanf(z, "geo %d %d %d %d", &a, &b, &c, &d) == 4) { geo[0] = a; geo[1] = b; geo[2] = c; geo[3] = d; }
    else if (sscanf(z, "vr %d %d", &a, &b) == 2) { vrGeo[0] = a; vrGeo[1] = b; }
    else if (sscanf(z, "sichtbar %d", &a) == 1) startSichtbar = a != 0;
  }
  fclose(f);
}

static void prefSchreiben() {
  if (fenster) {
    if (!imVR) XPLMGetWindowGeometry(fenster, &geo[0], &geo[1], &geo[2], &geo[3]);
    else XPLMGetWindowGeometryVR(fenster, &vrGeo[0], &vrGeo[1]);
  }
  FILE* f = fopen(prefDatei.c_str(), "w");
  if (!f) return;
  fprintf(f, "skala %.2f\ngeo %d %d %d %d\nvr %d %d\nsichtbar %d\n", skala, geo[0], geo[1], geo[2], geo[3], vrGeo[0], vrGeo[1],
          fenster && XPLMGetWindowIsVisible(fenster) ? 1 : 0);
  fclose(f);
}

// ------------------------------------------------------------------ Zeichnen (ImGui → X-Plane)
static void projizieren(const float* mv, const float* pj, const int* vp, float x, float y, float& ox, float& oy) {
  float e[4], c[4];
  for (int i = 0; i < 4; i++) e[i] = mv[i] * x + mv[4 + i] * y + mv[12 + i];
  for (int i = 0; i < 4; i++) c[i] = pj[i] * e[0] + pj[4 + i] * e[1] + pj[8 + i] * e[2] + pj[12 + i] * e[3];
  if (fabsf(c[3]) < 1e-6f) c[3] = 1;
  ox = vp[0] + (c[0] / c[3] + 1) * 0.5f * vp[2];
  oy = vp[1] + (c[1] / c[3] + 1) * 0.5f * vp[3];
}

// l, t = linke obere Ecke in Zeichen-Koordinaten (y nach oben), k = Bildpunkte je logischer Einheit.
// glMatrizen: Matrizen aus OpenGL lesen (Geräte im Cockpit) statt aus den Datarefs (Fenster).
static void imguiZeichnen(ImDrawData* dd, float l, float t, float k, bool glMatrizen) {
  float mv[16], pj[16];
  int vp[4];
  bool ok = false;
  if (!glMatrizen && drMV && drPJ && drVP) {
    ok = XPLMGetDatavf(drMV, mv, 0, 16) == 16 && XPLMGetDatavf(drPJ, pj, 0, 16) == 16 && XPLMGetDatavi(drVP, vp, 0, 4) == 4;
    // wie im SDK-Beispiel „window scissoring“: Viewport = (x, y, Breite, Höhe)
    if (ok && (vp[2] <= 0 || vp[3] <= 0)) ok = false;
  }
  if (!ok) {
    glGetFloatv(GL_MODELVIEW_MATRIX, mv);
    glGetFloatv(GL_PROJECTION_MATRIX, pj);
    glGetIntegerv(GL_VIEWPORT, vp);
  }
  XPLMSetGraphicsState(0, 1, 0, 0, 1, 0, 0);
  glPushAttrib(GL_ENABLE_BIT | GL_SCISSOR_BIT | GL_COLOR_BUFFER_BIT | GL_TRANSFORM_BIT | GL_TEXTURE_BIT);
  glPushClientAttrib(GL_CLIENT_VERTEX_ARRAY_BIT);
  GLboolean hatteSchere = glIsEnabled(GL_SCISSOR_TEST);
  GLint alt[4];
  glGetIntegerv(GL_SCISSOR_BOX, alt);
  glDisable(GL_CULL_FACE);
  glDisable(GL_DEPTH_TEST);
  glEnable(GL_BLEND);
  glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  glEnable(GL_SCISSOR_TEST);
  glEnableClientState(GL_VERTEX_ARRAY);
  glEnableClientState(GL_TEXTURE_COORD_ARRAY);
  glEnableClientState(GL_COLOR_ARRAY);
  glTexEnvi(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_MODULATE);
  glMatrixMode(GL_MODELVIEW);
  glPushMatrix();
  glTranslatef(l, t, 0);
  glScalef(k, -k, 1);
  for (int n = 0; n < dd->CmdListsCount; n++) {
    const ImDrawList* cl = dd->CmdLists[n];
    const ImDrawVert* vb = cl->VtxBuffer.Data;
    const ImDrawIdx* ib = cl->IdxBuffer.Data;
    glVertexPointer(2, GL_FLOAT, sizeof(ImDrawVert), (const GLvoid*)((const char*)vb + offsetof(ImDrawVert, pos)));
    glTexCoordPointer(2, GL_FLOAT, sizeof(ImDrawVert), (const GLvoid*)((const char*)vb + offsetof(ImDrawVert, uv)));
    glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(ImDrawVert), (const GLvoid*)((const char*)vb + offsetof(ImDrawVert, col)));
    for (int c = 0; c < cl->CmdBuffer.Size; c++) {
      const ImDrawCmd& cmd = cl->CmdBuffer[c];
      if (cmd.UserCallback) {
        cmd.UserCallback(cl, &cmd);
        continue;
      }
      // Ausschnitt: logisch → Zeichen-Koordinaten → Bildschirmpixel
      float x0, y0, x1, y1;
      projizieren(mv, pj, vp, l + cmd.ClipRect.x * k, t - cmd.ClipRect.w * k, x0, y0);
      projizieren(mv, pj, vp, l + cmd.ClipRect.z * k, t - cmd.ClipRect.y * k, x1, y1);
      int sx = (int)floorf(fminf(x0, x1)), sy = (int)floorf(fminf(y0, y1));
      int sw = (int)ceilf(fmaxf(x0, x1)) - sx, sh = (int)ceilf(fmaxf(y0, y1)) - sy;
      if (hatteSchere) {
        int ax1 = alt[0] + alt[2], ay1 = alt[1] + alt[3];
        int bx1 = sx + sw, by1 = sy + sh;
        if (sx < alt[0]) sx = alt[0];
        if (sy < alt[1]) sy = alt[1];
        sw = (bx1 < ax1 ? bx1 : ax1) - sx;
        sh = (by1 < ay1 ? by1 : ay1) - sy;
      }
      if (sw <= 0 || sh <= 0) continue;
      glScissor(sx, sy, sw, sh);
      XPLMBindTexture2d((int)(intptr_t)cmd.GetTexID(), 0);
      glDrawElements(GL_TRIANGLES, (GLsizei)cmd.ElemCount, sizeof(ImDrawIdx) == 2 ? GL_UNSIGNED_SHORT : GL_UNSIGNED_INT, ib + cmd.IdxOffset);
    }
  }
  glPopMatrix();
  glPopClientAttrib();
  glPopAttrib();
}

// Schriften einmal bauen (braucht OpenGL), dann alle Kontexte mit gemeinsamem Atlas anlegen
static void uiSicherstellen() {
  if (uiBereit) return;
  ImGui::SetCurrentContext(sFenster.ctx);
  ui::start(schriftOrdner, texNeu, texWeg);
  ImFontAtlas* atlas = ImGui::GetIO().Fonts;
  for (Schirm* s : GERAETE) {
    s->ctx = ImGui::CreateContext(atlas);
    ImGui::SetCurrentContext(s->ctx);
    ui::stilSetzen();
  }
  uiBereit = true;
}

// Strom fürs Funkgerät: Avionik an und mehr als 10 V auf der ersten Schiene (wie im Cockpit üblich)
static bool tetraEin = true;
static float tetraStrom = 0;

// Ein Bild eines Bildschirms (W, H logisch)
static ImDrawData* schirmBild(Schirm& s, float W, float H) {
  uiSicherstellen();
  double jetzt = XPLMGetElapsedTime();
  int zyklus = XPLMGetCycleNumber();
  if (zyklus != letzterZyklus) {
    letzterZyklus = zyklus;
    ui::takt(jetzt);
  }
  ImGui::SetCurrentContext(s.ctx);
  ui::zustand(&s.z);
  ImGuiIO& io = ImGui::GetIO();
  io.DeltaTime = s.letztesBild > 0 && jetzt > s.letztesBild ? (float)(jetzt - s.letztesBild) : 1.f / 60.f;
  if (io.DeltaTime > 0.5f) io.DeltaTime = 0.5f;
  if (io.DeltaTime <= 0) io.DeltaTime = 1.f / 60.f;
  s.letztesBild = jetzt;
  io.DisplaySize = ImVec2(W, H);
  io.DisplayFramebufferScale = ImVec2(1, 1);
  s.bildNr++;
  // Maus weg (VR-Strahl / Finger nicht mehr da): kein Hover
  if (s.cursorBild < s.bildNr - 2 && !io.MouseDown[0]) io.AddMousePosEvent(-FLT_MAX, -FLT_MAX);
  ImGui::NewFrame();
  switch (s.art) {
    case FENSTER: ui::bild(W, H, ui::HOCH); break;
    case MFD: ui::bild(W, H, ui::HOCH); break;
    case TABLET: ui::bild(W, H, ui::QUER); break;
    case KACHEL: ui::kachel(W, H); break;
    case TETRA: ui::tetra(W, H, tetraStrom > 0.5f); break;
  }
  ImGui::Render();
  return ImGui::GetDrawData();
}

static void zeichnen(XPLMWindowID w, void*) {
  int l, t, r, b;
  XPLMGetWindowGeometry(w, &l, &t, &r, &b);
  float W = (r - l) / skala, H = (t - b) / skala;
  if (W < 50 || H < 50) return;
  ImDrawData* dd = schirmBild(sFenster, W, H);
  imguiZeichnen(dd, (float)l, (float)t, skala, false);
}

static void mausAuf(XPLMWindowID w, int x, int y) {
  int l, t, r, b;
  XPLMGetWindowGeometry(w, &l, &t, &r, &b);
  ImGui::SetCurrentContext(sFenster.ctx);
  ImGui::GetIO().AddMousePosEvent((x - l) / skala, (t - y) / skala);
}

static int klick(XPLMWindowID w, int x, int y, XPLMMouseStatus st, void*) {
  if (!sFenster.ctx) return 1;
  mausAuf(w, x, y);
  sFenster.cursorBild = sFenster.bildNr;
  ImGuiIO& io = ImGui::GetIO();
  if (st == xplm_MouseDown) {
    io.AddMouseButtonEvent(0, true);
    if (!XPLMIsWindowInFront(w)) XPLMBringWindowToFront(w);
  } else if (st == xplm_MouseUp) io.AddMouseButtonEvent(0, false);
  return 1;
}

static int rechtsKlick(XPLMWindowID, int, int, XPLMMouseStatus, void*) { return 1; }

static XPLMCursorStatus cursor(XPLMWindowID w, int x, int y, void*) {
  if (sFenster.ctx) {
    mausAuf(w, x, y);
    sFenster.cursorBild = sFenster.bildNr;
  }
  return xplm_CursorDefault;
}

static int rad(XPLMWindowID w, int x, int y, int achse, int klicks, void*) {
  if (!sFenster.ctx) return 1;
  mausAuf(w, x, y);
  ImGui::GetIO().AddMouseWheelEvent(achse == 1 ? (float)klicks : 0, achse == 0 ? (float)klicks : 0);
  return 1;
}

static void taste(XPLMWindowID, char key, XPLMKeyFlags flags, char vkey, void*, int verliert) {
  if (verliert) {
    hatFokus = false;
    return;
  }
  if (!(flags & xplm_DownFlag)) return;
  if (sFenster.ctx) {
    ImGui::SetCurrentContext(sFenster.ctx);
    ui::zustand(&sFenster.z);
  }
  unsigned char vk = (unsigned char)vkey;
  if (vk == XPLM_VK_BACK) ui::tasteZurueck();
  else if (vk == XPLM_VK_RETURN || vk == XPLM_VK_ENTER || vk == XPLM_VK_ESCAPE) ui::tasteFertig();
  else {
    unsigned char c = (unsigned char)key;
    if (c >= 32 && c < 127) ui::tasteText(std::string(1, (char)c));
    else if (c >= 160) {
      // Latin-1 → UTF-8 (ä, ö, ü, ß)
      std::string u;
      u += (char)(0xC0 | (c >> 6));
      u += (char)(0x80 | (c & 0x3F));
      ui::tasteText(u);
    }
  }
}

// ------------------------------------------------------------------ Geräte im Cockpit (X-Plane 12.1+)
// Zeichnen und Tippen kommen in Bildpunkten des Geräts, Ursprung links unten.
static void geraetZeichnen(void* ref) {
  Schirm& s = *(Schirm*)ref;
  if (!s.gezeichnet) log(std::string("Ger\xC3\xA4t ") + s.id + ": erstes Bild");
  s.gezeichnet = true;
  ImDrawData* dd = schirmBild(s, s.logW, s.logH);
  imguiZeichnen(dd, 0, (float)s.pxH, s.pxW / s.logW, true);
}

static void geraetMaus(Schirm& s, int x, int y) {
  if (!s.ctx) return;
  float k = s.pxW / s.logW;
  ImGui::SetCurrentContext(s.ctx);
  ImGui::GetIO().AddMousePosEvent(x / k, (s.pxH - y) / k);
  s.cursorBild = s.bildNr;
  s.aktivBis = XPLMGetElapsedTime() + 3;
}

static int geraetTippen(int x, int y, XPLMMouseStatus st, void* ref) {
  Schirm& s = *(Schirm*)ref;
  if (!s.ctx) return 1;
  geraetMaus(s, x, y);
  ImGuiIO& io = ImGui::GetIO();
  if (st == xplm_MouseDown) io.AddMouseButtonEvent(0, true);
  else if (st == xplm_MouseUp) io.AddMouseButtonEvent(0, false);
  if (xAvionicsNeedsDrawing && s.av) xAvionicsNeedsDrawing(s.av);
  return 1;
}

static int geraetRad(int x, int y, int achse, int klicks, void* ref) {
  Schirm& s = *(Schirm*)ref;
  if (!s.ctx) return 1;
  geraetMaus(s, x, y);
  ImGui::GetIO().AddMouseWheelEvent(achse == 1 ? (float)klicks : 0, achse == 0 ? (float)klicks : 0);
  return 1;
}

static XPLMCursorStatus geraetCursor(int x, int y, void* ref) {
  Schirm& s = *(Schirm*)ref;
  if (s.ctx) geraetMaus(s, x, y);
  return xplm_CursorDefault;
}

// Helligkeit im Cockpit: ohne eigene Angabe nimmt X-Plane Regler × Spannung der Schiene – die EC135 von Rotorsim hat ein
// eigenes Bordnetz, dort bleibt das 0 und der Bildschirm dunkel (Test 11.11.). Daher: Umgebungshelligkeit, nie ganz dunkel.
static float geraetHelligkeit(float regler, float umgebung, float spannung, void* ref) {
  Schirm& s = *(Schirm*)ref;
  (void)regler;
  (void)spannung;
  if (s.art == TETRA && tetraStrom < 0.5f) return 0.f;
  float h = umgebung > 0 ? umgebung : 1.f;
  return h < 0.45f ? 0.45f : (h > 1 ? 1.f : h);
}

static void geraeteErzeugen() {
  xCreateAvionicsEx = (CreateAvionicsEx_f)XPLMFindSymbol("XPLMCreateAvionicsEx");
  xDestroyAvionics = (DestroyAvionics_f)XPLMFindSymbol("XPLMDestroyAvionics");
  xAvionicsNeedsDrawing = (AvionicsNeedsDrawing_f)XPLMFindSymbol("XPLMAvionicsNeedsDrawing");
  xIsAvionicsBound = (IsAvionicsBound_f)XPLMFindSymbol("XPLMIsAvionicsBound");
  if (!xCreateAvionicsEx) {
    log("X-Plane ohne eigene Cockpit-Ger\xC3\xA4te (erst ab 12.1) \xE2\x80\x93 nur das Fenster");
    return;
  }
  for (Schirm* s : GERAETE) {
    XPLMCreateAvionics_t d;
    memset(&d, 0, sizeof d);
    d.structSize = sizeof d;
    d.screenWidth = d.bezelWidth = s->pxW;
    d.screenHeight = d.bezelHeight = s->pxH;
    d.drawOnDemand = 1;
    d.drawCallback = geraetZeichnen;
    d.brightnessCallback = geraetHelligkeit;
    if (s->art == MFD || s->art == TABLET) {
      d.screenTouchCallback = geraetTippen;
      d.screenScrollCallback = geraetRad;
      d.screenCursorCallback = geraetCursor;
    }
    d.deviceID = (char*)s->id;
    d.deviceName = (char*)s->name;
    d.refcon = s;
    s->av = xCreateAvionicsEx(&d);
    log(std::string("Ger\xC3\xA4t ") + s->id + (s->av ? " angelegt" : " nicht angelegt"));
  }
}

static void geraeteEntfernen() {
  for (Schirm* s : GERAETE) {
    if (s->av && xDestroyAvionics) xDestroyAvionics(s->av);
    s->av = nullptr;
  }
}

static bool gebunden(const Schirm& s) { return s.av && (xIsAvionicsBound ? xIsAvionicsBound(s.av) != 0 : s.gezeichnet); }

// ------------------------------------------------------------------ Datarefs für das Cockpit
// leitwerk/aktiv: LeitWerk läuft (MFD zeigt dann LeitWerk statt EuroNav, die Kachel erscheint im AviTab)
// leitwerk/tablet/app: 1 = LeitWerk auf dem Klapp-Tablet, 0 = AviTab
static int aktivWert = 0;
static double zuletztVerbunden = -100;
static int tabletApp = 0;
static int liesInt(void* ref) { return *(int*)ref; }
static int liesTabletApp(void*) { return aktivWert ? tabletApp : 0; }
static void schreibTabletApp(void*, int v) { tabletApp = v ? 1 : 0; }
static float liesFloat(void* ref) { return *(float*)ref; }
static int eingebaut = 1;

static std::vector<XPLMDataRef> datarefs;

static XPLMDataRef intRef(const char* name, int* wert) {
  return XPLMRegisterDataAccessor(name, xplmType_Int, 0, liesInt, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
                                  nullptr, nullptr, nullptr, nullptr, wert, nullptr);
}
static XPLMDataRef floatRef(const std::string& name, float* wert) {
  return XPLMRegisterDataAccessor(name.c_str(), xplmType_Float, 0, nullptr, nullptr, liesFloat, nullptr, nullptr, nullptr, nullptr,
                                  nullptr, nullptr, nullptr, nullptr, nullptr, wert, nullptr);
}

// ------------------------------------------------------------------ TETRA-Funkgerät (Modell vom Kollegen: Tasten, Knopf)
// Tasten wie beim CARLS (Paul 11.11.): Ziffer = Status (geht nach 1 s), ◄ ► / Knopf = Sprechgruppe, rote Taste = abbrechen.
// Zusätzlich grüne Taste = Sprechtaste (halten). Die Logik steckt in LeitWerk (Befehl „tt:<Taste>“).
struct Taste {
  const char* name;
  const char* an;    // an LeitWerk beim Drücken
  int sonder;        // 0 = nichts weiter, 1 = Ein/Aus, 2 = links drehen, 3 = rechts drehen, 4 = Sprechtaste
  XPLMCommandRef ref = nullptr;
  float hub = 0;
  bool gedrueckt = false;
  float halt = 0;    // letztes Lebenszeichen der gehaltenen Sprechtaste
};
static Taste tasten[] = {
    {"KEY_0", "tt:0", 0}, {"KEY_1", "tt:1", 0}, {"KEY_2", "tt:2", 0}, {"KEY_3", "tt:3", 0}, {"KEY_4", "tt:4", 0},
    {"KEY_5", "tt:5", 0}, {"KEY_6", "tt:6", 0}, {"KEY_7", "tt:7", 0}, {"KEY_8", "tt:8", 0}, {"KEY_9", "tt:9", 0},
    {"KEY_STAR", nullptr, 0}, {"KEY_HASH", nullptr, 0}, {"SOFT_TOP", nullptr, 0}, {"SOFT_BOTTOM", nullptr, 0},
    {"MENU", nullptr, 0}, {"NAV_CENTER", nullptr, 0}, {"NAV_UP", nullptr, 0}, {"NAV_DOWN", nullptr, 0},
    {"NAV_LEFT", "tt:LEFT", 0}, {"NAV_RIGHT", "tt:RIGHT", 0}, {"END_POWER", "tt:HANG", 0}, {"CALL", nullptr, 4},
    {"EMERGENCY", nullptr, 0}, {"FUNC_0", nullptr, 0}, {"FUNC_1", nullptr, 0}, {"FUNC_2", nullptr, 0},
    {"DREHKNOPF", nullptr, 1}, {"turn_left", "tt:LEFT", 2}, {"turn_right", "tt:RIGHT", 3},
};
static float tetraDrehung = 0, tetraZielwinkel = 0;

static int tetraTaste(XPLMCommandRef, XPLMCommandPhase phase, void* ref) {
  Taste& k = *(Taste*)ref;
  if (phase == xplm_CommandBegin) {
    k.gedrueckt = true;
    k.halt = XPLMGetElapsedTime();
    if (k.sonder == 1) tetraEin = !tetraEin;
    if (k.sonder == 2) tetraZielwinkel -= 15;
    if (k.sonder == 3) tetraZielwinkel += 15;
    if (tetraStrom > 0.5f) {
      if (k.an) netz::senden(k.an);
      if (k.sonder == 4) netz::senden("funk_an");
    }
    if (xAvionicsNeedsDrawing && sTetra.av) xAvionicsNeedsDrawing(sTetra.av);
  } else if (phase == xplm_CommandContinue && k.sonder == 4 && tetraStrom > 0.5f) {
    // grüne Taste gehalten: Lebenszeichen jede Sekunde
    float jetzt = XPLMGetElapsedTime();
    if (jetzt - k.halt >= 1.0f) {
      k.halt = jetzt;
      netz::senden("funk_halt");
    }
  } else if (phase == xplm_CommandEnd) {
    k.gedrueckt = false;
    if (k.sonder == 4) netz::senden("funk_aus");
  }
  return 0;
}

static void tetraTakt(float dt) {
  // Strom: irgendeine Schiene über 10 V, Avionik oder Batterie an (die EC135 hat ein eigenes Bordnetz – dort zeigen die
  // X-Plane-Werte nicht immer Strom an; lieber an als tot)
  float volt[4] = {0, 0, 0, 0};
  if (drVolt) XPLMGetDatavf(drVolt, volt, 0, 4);
  float vmax = std::max(std::max(volt[0], volt[1]), std::max(volt[2], volt[3]));
  bool avionik = drAvionik && XPLMGetDatai(drAvionik) != 0;
  bool batterie = drBatterie && XPLMGetDatai(drBatterie) != 0;
  bool an = tetraEin && (vmax > 10 || avionik || batterie);
  if (tetraStrom > 0.5f && !an) {
    for (auto& k : tasten)
      if (k.gedrueckt && k.sonder == 4) netz::senden("funk_aus");
  }
  tetraStrom = an ? 1.f : 0.f;
  float f = 1 - expf(-22 * fmaxf(0.f, dt));
  for (auto& k : tasten) k.hub += ((k.gedrueckt ? 1.f : 0.f) - k.hub) * f;
  tetraDrehung += (tetraZielwinkel - tetraDrehung) * f;
  if (tetraDrehung >= 360 && tetraZielwinkel >= 360) { tetraDrehung -= 360; tetraZielwinkel -= 360; }
  if (tetraDrehung < 0 && tetraZielwinkel < 0) { tetraDrehung += 360; tetraZielwinkel += 360; }
}

// ------------------------------------------------------------------ Fenster
static void vrPruefen() {
  bool vr = drVR && XPLMGetDatai(drVR) != 0;
  if (!fenster || vr == imVR) return;
  if (vr) {
    XPLMGetWindowGeometry(fenster, &geo[0], &geo[1], &geo[2], &geo[3]);
    XPLMSetWindowPositioningMode(fenster, xplm_WindowVR, -1);
    int w = vrGeo[0] > 0 ? vrGeo[0] : (int)(sFenster.logW * skala), h = vrGeo[1] > 0 ? vrGeo[1] : (int)(sFenster.logH * skala);
    XPLMSetWindowGeometryVR(fenster, w, h);
  } else {
    XPLMGetWindowGeometryVR(fenster, &vrGeo[0], &vrGeo[1]);
    XPLMSetWindowPositioningMode(fenster, xplm_WindowPositionFree, -1);
    XPLMSetWindowGeometry(fenster, geo[0], geo[1], geo[2], geo[3]);
  }
  imVR = vr;
}

static void lageStandard() {
  int sl, st, sr, sb;
  XPLMGetScreenBoundsGlobal(&sl, &st, &sr, &sb);
  int w = (int)(sFenster.logW * skala), h = (int)(sFenster.logH * skala);
  if (h > st - sb - 80) h = st - sb - 80;
  geo[2] = sr - 40;
  geo[0] = geo[2] - w;
  geo[1] = st - 60;
  geo[3] = geo[1] - h;
}

static void fensterErzeugen() {
  if (geo[2] - geo[0] < 200 || geo[1] - geo[3] < 200) lageStandard();
  XPLMCreateWindow_t p;
  memset(&p, 0, sizeof p);
  p.structSize = sizeof p;
  p.left = geo[0];
  p.top = geo[1];
  p.right = geo[2];
  p.bottom = geo[3];
  p.visible = 0;
  p.drawWindowFunc = zeichnen;
  p.handleMouseClickFunc = klick;
  p.handleRightClickFunc = rechtsKlick;
  p.handleKeyFunc = taste;
  p.handleCursorFunc = cursor;
  p.handleMouseWheelFunc = rad;
  p.refcon = nullptr;
  p.decorateAsFloatingWindow = xplm_WindowDecorationRoundRectangle;
  p.layer = xplm_WindowLayerFloatingWindows;
  fenster = XPLMCreateWindowEx(&p);
  XPLMSetWindowTitle(fenster, "LeitWerk");
  XPLMSetWindowResizingLimits(fenster, (int)(340 * skala), (int)(480 * skala), (int)(1400 * skala), (int)(2000 * skala));
  XPLMSetWindowPositioningMode(fenster, xplm_WindowPositionFree, -1);
  imVR = false;
}

static void zeigen(bool an) {
  if (!fenster) return;
  if (an) vrPruefen();
  XPLMSetWindowIsVisible(fenster, an ? 1 : 0);
  if (an) XPLMBringWindowToFront(fenster);
  if (menue) XPLMCheckMenuItem(menue, mZeigen, an ? xplm_Menu_Checked : xplm_Menu_Unchecked);
}

static void umschalten() { zeigen(!XPLMGetWindowIsVisible(fenster)); }

static void skalaSetzen(float s) {
  if (!fenster) return;
  float alt = skala;
  skala = s;
  if (imVR) {
    int w, h;
    XPLMGetWindowGeometryVR(fenster, &w, &h);
    XPLMSetWindowGeometryVR(fenster, (int)(w / alt * s), (int)(h / alt * s));
  } else {
    int l, t, r, b;
    XPLMGetWindowGeometry(fenster, &l, &t, &r, &b);
    XPLMSetWindowGeometry(fenster, r - (int)((r - l) / alt * s), t, r, t - (int)((t - b) / alt * s));
  }
  XPLMSetWindowResizingLimits(fenster, (int)(340 * skala), (int)(480 * skala), (int)(1400 * skala), (int)(2000 * skala));
  for (int i = 0; i < 3; i++) XPLMCheckMenuItem(menue, mGroesse[i], fabsf(GROESSEN[i] - skala) < 0.01f ? xplm_Menu_Checked : xplm_Menu_Unchecked);
}

// ------------------------------------------------------------------ Befehle und Menü
struct Befehl {
  const char* name;
  const char* text;
  const char* an;   // beim Drücken
  const char* aus;  // beim Loslassen (Sprechtaste)
  int art;          // 0 = an LeitWerk, 1 = Tablet ein/aus, 2 = Zielort, 3 = Status geben, 4 = Karte, 5/6/7 = Cockpit-Tablet LeitWerk um/an/aus
  XPLMCommandRef ref;
  float halt = 0;   // letztes Lebenszeichen der gehaltenen Sprechtaste
};
static Befehl befehle[] = {
    {"leitwerk/tablet", "LeitWerk: Tablet zeigen/verbergen", nullptr, nullptr, 1, nullptr},
    {"leitwerk/status_9", "LeitWerk: Quittieren (Status 9)", "s9", nullptr, 0, nullptr},
    {"leitwerk/status_1", "LeitWerk: Status 1 \xE2\x80\x93 frei auf Wache", "s1", nullptr, 0, nullptr},
    {"leitwerk/status_2", "LeitWerk: Status 2 \xE2\x80\x93 zum Berufungsort", "s2", nullptr, 0, nullptr},
    {"leitwerk/status_3", "LeitWerk: Status 3 \xE2\x80\x93 am Berufungsort", "s3", nullptr, 0, nullptr},
    {"leitwerk/status_4", "LeitWerk: Status 4 \xE2\x80\x93 zum Zielort", "s4", nullptr, 0, nullptr},
    {"leitwerk/status_5", "LeitWerk: Status 5 \xE2\x80\x93 am Zielort", "s5", nullptr, 0, nullptr},
    {"leitwerk/status_6", "LeitWerk: Status 6 \xE2\x80\x93 frei \xC3\xBC" "ber Funk", "s6", nullptr, 0, nullptr},
    {"leitwerk/status_8", "LeitWerk: Status 8 \xE2\x80\x93 Bereitschaft", "s8", nullptr, 0, nullptr},
    {"leitwerk/sprechen", "LeitWerk: Sprechtaste Leitstelle (halten)", "funk_an", "funk_aus", 0, nullptr},
    {"leitwerk/sprechen_2", "LeitWerk: zweite Sprechtaste (halten)", "funkRtw_an", "funkRtw_aus", 0, nullptr},
    {"leitwerk/zielort", "LeitWerk: Zielort buchen (Tablet)", nullptr, nullptr, 2, nullptr},
    {"leitwerk/status_geben", "LeitWerk: Status geben (Tablet)", nullptr, nullptr, 3, nullptr},
    {"leitwerk/navigation", "LeitWerk: Navigation (Tablet)", nullptr, nullptr, 4, nullptr},
    {"leitwerk/tablet_app", "LeitWerk: Klapp-Tablet im Cockpit LeitWerk/AviTab", nullptr, nullptr, 5, nullptr},
    {"leitwerk/tablet_app_auf", "LeitWerk: Klapp-Tablet im Cockpit \xE2\x86\x92 LeitWerk", nullptr, nullptr, 6, nullptr},
    {"leitwerk/tablet_app_zu", "LeitWerk: Klapp-Tablet im Cockpit \xE2\x86\x92 AviTab", nullptr, nullptr, 7, nullptr},
};

static void fensterZustand() {
  uiSicherstellen();
  ImGui::SetCurrentContext(sFenster.ctx);
  ui::zustand(&sFenster.z);
}

static int befehl(XPLMCommandRef, XPLMCommandPhase phase, void* ref) {
  Befehl& b = *(Befehl*)ref;
  if (phase == xplm_CommandBegin) {
    switch (b.art) {
      case 0: netz::senden(b.an); break;
      case 1: umschalten(); break;
      case 2: zeigen(true); fensterZustand(); ui::buchenOeffnen(); break;
      case 3: zeigen(true); fensterZustand(); ui::statusOeffnen(); break;
      case 4: zeigen(true); fensterZustand(); ui::kartenOeffnen(); break;
      case 5: tabletApp = !tabletApp; break;
      case 6: tabletApp = 1; break;
      case 7: tabletApp = 0; break;
    }
    if (b.art >= 5 && xAvionicsNeedsDrawing && sTablet.av) xAvionicsNeedsDrawing(sTablet.av);
    b.halt = XPLMGetElapsedTime();
  } else if (phase == xplm_CommandContinue && b.aus) {
    // Sprechtaste gehalten: jede Sekunde ein Lebenszeichen („funk_halt“) – fehlt es, beendet LeitWerk die Sendung
    float jetzt = XPLMGetElapsedTime();
    if (jetzt - b.halt >= 1.0f) {
      b.halt = jetzt;
      std::string h = b.an;
      size_t u = h.rfind("_an");
      if (u != std::string::npos) netz::senden((h.substr(0, u) + "_halt").c_str());
    }
  } else if (phase == xplm_CommandEnd && b.aus) netz::senden(b.aus);
  return 0;
}

static void menueKlick(void*, void* item) {
  intptr_t i = (intptr_t)item;
  if (i == 1) umschalten();
  else if (i >= 10 && i < 13) skalaSetzen(GROESSEN[i - 10]);
  else if (i == 20) {
    if (imVR) {
      vrGeo[0] = (int)(sFenster.logW * skala);
      vrGeo[1] = (int)(sFenster.logH * skala);
      XPLMSetWindowGeometryVR(fenster, vrGeo[0], vrGeo[1]);
    } else {
      lageStandard();
      XPLMSetWindowGeometry(fenster, geo[0], geo[1], geo[2], geo[3]);
    }
    zeigen(true);
  }
}

// Wie oft die Geräte neu gezeichnet werden (Sekunden): beim Bedienen flüssig, sonst sparsam
static double neuZeichnenAlle(const Schirm& s, double jetzt) {
  switch (s.art) {
    case MFD:
    case TABLET: return jetzt < s.aktivBis ? 1.0 / 30 : 0.25;
    case TETRA: return 0.1;
    default: return 1.0;
  }
}

static double letzterTakt = 0;
static float takt(float, float, int, void*) {
  double jetzt = XPLMGetElapsedTime();
  float dt = letzterTakt > 0 ? (float)(jetzt - letzterTakt) : 0;
  letzterTakt = jetzt;
  ui::standLesen();
  vrPruefen();
  if (sFenster.ctx && uiBereit) {
    ImGui::SetCurrentContext(sFenster.ctx);
    ui::zustand(&sFenster.z);
    bool will = fenster && XPLMGetWindowIsVisible(fenster) && ui::willTasten();
    if (will && !hatFokus) { XPLMTakeKeyboardFocus(fenster); hatFokus = true; }
    if (!will && hatFokus) { XPLMTakeKeyboardFocus(0); hatFokus = false; }
  }
  // LeitWerk läuft? (kurze Aussetzer überbrücken)
  if (netz::verbunden()) zuletztVerbunden = jetzt;
  aktivWert = jetzt - zuletztVerbunden < 10 ? 1 : 0;
  // „‹ AviTab“ im Cockpit-Tablet gedrückt
  if (sTablet.ctx) {
    ImGui::SetCurrentContext(sTablet.ctx);
    if (ui::zurueck()) tabletApp = 0;
  }
  tetraTakt(dt);
  static bool warGebunden[4] = {false, false, false, false};
  for (int i = 0; i < 4; i++) {
    bool g = gebunden(*GERAETE[i]);
    if (g != warGebunden[i]) log(std::string("Ger\xC3\xA4t ") + GERAETE[i]->id + (g ? " im Cockpit" : " nicht mehr im Cockpit"));
    warGebunden[i] = g;
  }
  if (xAvionicsNeedsDrawing) {
    for (Schirm* s : GERAETE) {
      if (!s->av || jetzt < s->naechstes) continue;
      s->naechstes = jetzt + neuZeichnenAlle(*s, jetzt);
      xAvionicsNeedsDrawing(s->av);
    }
  }
  if (menue) XPLMSetMenuItemName(menue, mStatus, netz::verbunden() ? "LeitWerk: verbunden" : "LeitWerk: nicht verbunden", 0);
  // LeitWerk wissen lassen, dass das Plugin da ist (Anzeige im Cockpit): Version, VR, Fenster, was das Plugin kann/zeigt
  if (netz::verbunden() && jetzt - letzteMeldung > 10) {
    letzteMeldung = jetzt;
    std::string kann;
    if (xCreateAvionicsEx) kann += "geraete";
    if (wetter::moeglich()) kann += kann.empty() ? "wetter" : ",wetter";
    std::string cockpit;
    if (gebunden(sMfd)) cockpit += "mfd";
    if (gebunden(sTablet)) cockpit += cockpit.empty() ? "tablet" : ",tablet";
    if (gebunden(sTetra)) cockpit += cockpit.empty() ? "tetra" : ",tetra";
    netz::senden(std::string("xp:plugin:") + LEITWERK_PLUGIN_VERSION + ":" + (imVR ? "vr" : "2d") + ":" + (fenster && XPLMGetWindowIsVisible(fenster) ? "an" : "aus") +
                 ":" + kann + ":" + cockpit + ":" + wetter::text());
  }
  return -1.0f;  // jedes Bild (Tasten-Hub, Neuzeichnen der Geräte)
}

// ------------------------------------------------------------------ Plugin-Einstieg
PLUGIN_API int XPluginStart(char* name, char* sig, char* desc) {
  strcpy(name, "LeitWerk");
  strcpy(sig, "at.pholzreiter.leitwerk");
  strcpy(desc, "LeitWerk: Einsatz-App (Fenster, auch VR, und im Cockpit), TETRA-Funkger\xC3\xA4t, Wetter, Befehle f\xC3\xBCr Status und Sprechtaste.");
  XPLMEnableFeature("XPLM_USE_NATIVE_PATHS", 1);
  XPLMEnableFeature("XPLM_USE_NATIVE_WIDGET_WINDOWS", 1);
  char pfad[1024] = {0};
  XPLMGetPluginInfo(XPLMGetMyID(), nullptr, pfad, nullptr, nullptr);
  std::string p = pfad;
  // …/plugins/LeitWerk/win_x64/LeitWerk.xpl → …/plugins/LeitWerk/schrift/
  size_t a = p.find_last_of("/\\");
  if (a != std::string::npos) p = p.substr(0, a);
  a = p.find_last_of("/\\");
  if (a != std::string::npos) p = p.substr(0, a + 1);
  schriftOrdner = p + "schrift" + XPLMGetDirectorySeparator();
  char pref[1024] = {0};
  XPLMGetPrefsPath(pref);
  std::string pp = pref;
  a = pp.find_last_of("/\\");
  prefDatei = (a != std::string::npos ? pp.substr(0, a + 1) : std::string()) + "LeitWerk.prf";
  drVR = XPLMFindDataRef("sim/graphics/VR/enabled");
  drMV = XPLMFindDataRef("sim/graphics/view/modelview_matrix");
  drPJ = XPLMFindDataRef("sim/graphics/view/projection_matrix");
  drVP = XPLMFindDataRef("sim/graphics/view/viewport");
  drVolt = XPLMFindDataRef("sim/cockpit2/electrical/bus_volts");
  drAvionik = XPLMFindDataRef("sim/cockpit/electrical/avionics_on");
  drBatterie = XPLMFindDataRef("sim/cockpit/electrical/battery_on");
  // Datarefs für die Cockpit-Objekte (auch ohne Gerät-Schnittstelle: Sichtbarkeit)
  datarefs.push_back(intRef("leitwerk/aktiv", &aktivWert));
  datarefs.push_back(XPLMRegisterDataAccessor("leitwerk/tablet/app", xplmType_Int, 1, liesTabletApp, schreibTabletApp, nullptr, nullptr,
                                              nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr));
  datarefs.push_back(intRef("leitwerk/tetra/eingebaut", &eingebaut));
  datarefs.push_back(floatRef("leitwerk/tetra/strom", &tetraStrom));
  datarefs.push_back(floatRef("leitwerk/tetra/rotation", &tetraDrehung));
  for (auto& k : tasten) datarefs.push_back(floatRef(std::string("leitwerk/tetra/anim/") + k.name, &k.hub));
  wetter::start();
  log(std::string("Version ") + LEITWERK_PLUGIN_VERSION + ", Schrift " + schriftOrdner);
  return 1;
}

PLUGIN_API void XPluginStop(void) {
  wetter::stopp();
  for (auto r : datarefs) XPLMUnregisterDataAccessor(r);
  datarefs.clear();
}

PLUGIN_API int XPluginEnable(void) {
  prefLesen();
  IMGUI_CHECKVERSION();
  sFenster.ctx = ImGui::CreateContext();
  fensterErzeugen();
  menueId = XPLMAppendMenuItem(XPLMFindPluginsMenu(), "LeitWerk", nullptr, 0);
  menue = XPLMCreateMenu("LeitWerk", XPLMFindPluginsMenu(), menueId, menueKlick, nullptr);
  mZeigen = XPLMAppendMenuItem(menue, "Tablet zeigen", (void*)1, 0);
  XPLMAppendMenuSeparator(menue);
  mGroesse[0] = XPLMAppendMenuItem(menue, "Gr\xC3\xB6\xC3\x9F" "e 100 %", (void*)10, 0);
  mGroesse[1] = XPLMAppendMenuItem(menue, "Gr\xC3\xB6\xC3\x9F" "e 125 %", (void*)11, 0);
  mGroesse[2] = XPLMAppendMenuItem(menue, "Gr\xC3\xB6\xC3\x9F" "e 150 %", (void*)12, 0);
  XPLMAppendMenuItem(menue, "Tablet zur\xC3\xBC" "cksetzen", (void*)20, 0);
  XPLMAppendMenuSeparator(menue);
  mStatus = XPLMAppendMenuItem(menue, "LeitWerk: nicht verbunden", (void*)99, 0);
  XPLMEnableMenuItem(menue, mStatus, 0);
  for (int i = 0; i < 3; i++) XPLMCheckMenuItem(menue, mGroesse[i], fabsf(GROESSEN[i] - skala) < 0.01f ? xplm_Menu_Checked : xplm_Menu_Unchecked);
  for (auto& b : befehle) {
    b.ref = XPLMCreateCommand(b.name, b.text);
    XPLMRegisterCommandHandler(b.ref, befehl, 1, &b);
  }
  for (auto& k : tasten) {
    k.ref = XPLMCreateCommand((std::string("leitwerk/tetra/") + k.name).c_str(), (std::string("LeitWerk TETRA: ") + k.name).c_str());
    XPLMRegisterCommandHandler(k.ref, tetraTaste, 1, &k);
  }
  geraeteErzeugen();
  netz::starten();
  wetter::an();
  XPLMRegisterFlightLoopCallback(takt, -1.0f, nullptr);
  if (startSichtbar) zeigen(true);
  return 1;
}

PLUGIN_API void XPluginDisable(void) {
  prefSchreiben();
  XPLMUnregisterFlightLoopCallback(takt, nullptr);
  wetter::aus();
  for (auto& b : befehle)
    if (b.ref) XPLMUnregisterCommandHandler(b.ref, befehl, 1, &b);
  for (auto& k : tasten)
    if (k.ref) XPLMUnregisterCommandHandler(k.ref, tetraTaste, 1, &k);
  geraeteEntfernen();
  netz::stoppen();
  if (hatFokus) XPLMTakeKeyboardFocus(0);
  hatFokus = false;
  if (menue) XPLMDestroyMenu(menue);
  menue = nullptr;
  if (menueId >= 0) XPLMRemoveMenuItem(XPLMFindPluginsMenu(), menueId);
  menueId = -1;
  if (fenster) XPLMDestroyWindow(fenster);
  fenster = nullptr;
  ui::zustand(nullptr);
  for (Schirm* s : GERAETE) {
    if (s->ctx) ImGui::DestroyContext(s->ctx);
    s->ctx = nullptr;
  }
  if (sFenster.ctx) {
    ImGui::SetCurrentContext(sFenster.ctx);
    if (uiBereit) ui::ende();
    ImGui::DestroyContext(sFenster.ctx);
  }
  sFenster.ctx = nullptr;
  uiBereit = false;
}

PLUGIN_API void XPluginReceiveMessage(XPLMPluginID, int, void*) {}
