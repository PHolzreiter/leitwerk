// LeitWerk-Plugin für X-Plane 12: die Einsatz-App als Fenster (auch in VR) und Befehle für Status/Sprechtaste.
// Daten kommen von LeitWerk auf demselben PC (wie bei der EFB-App in MSFS: http://127.0.0.1:47900–47905).
#include <cfloat>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>

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

static XPLMWindowID fenster = nullptr;
static ImGuiContext* ctx = nullptr;
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
static double letztesBild = 0;
static int cursorBild = 0, bildNr = 0;
static XPLMDataRef drVR, drMV, drPJ, drVP;
static double letzteMeldung = -100;

static const float BREITE = 460, HOEHE = 780;
static const float GROESSEN[3] = {1.0f, 1.25f, 1.5f};

static void log(const std::string& s) { XPLMDebugString(("LeitWerk: " + s + "\n").c_str()); }

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

static void imguiZeichnen(ImDrawData* dd, int l, int t) {
  float mv[16], pj[16];
  int vp[4];
  bool ok = false;
  if (drMV && drPJ && drVP) {
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
  glEnable(GL_BLEND);
  glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  glEnable(GL_SCISSOR_TEST);
  glEnableClientState(GL_VERTEX_ARRAY);
  glEnableClientState(GL_TEXTURE_COORD_ARRAY);
  glEnableClientState(GL_COLOR_ARRAY);
  glTexEnvi(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_MODULATE);
  glMatrixMode(GL_MODELVIEW);
  glPushMatrix();
  glTranslatef((float)l, (float)t, 0);
  glScalef(skala, -skala, 1);
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
      // Ausschnitt: logisch → Boxel → Bildschirmpixel
      float x0, y0, x1, y1;
      projizieren(mv, pj, vp, l + cmd.ClipRect.x * skala, t - cmd.ClipRect.w * skala, x0, y0);
      projizieren(mv, pj, vp, l + cmd.ClipRect.z * skala, t - cmd.ClipRect.y * skala, x1, y1);
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

static void zeichnen(XPLMWindowID w, void*) {
  ImGui::SetCurrentContext(ctx);
  if (!uiBereit) {
    ui::start(schriftOrdner, texNeu, texWeg);
    uiBereit = true;
  }
  int l, t, r, b;
  XPLMGetWindowGeometry(w, &l, &t, &r, &b);
  ImGuiIO& io = ImGui::GetIO();
  float W = (r - l) / skala, H = (t - b) / skala;
  if (W < 50 || H < 50) return;
  double jetzt = XPLMGetElapsedTime();
  io.DeltaTime = letztesBild > 0 && jetzt > letztesBild ? (float)(jetzt - letztesBild) : 1.f / 60.f;
  if (io.DeltaTime > 0.5f) io.DeltaTime = 0.5f;
  letztesBild = jetzt;
  io.DisplaySize = ImVec2(W, H);
  io.DisplayFramebufferScale = ImVec2(1, 1);
  bildNr++;
  if (cursorBild < bildNr - 2 && !io.MouseDown[0]) io.AddMousePosEvent(-FLT_MAX, -FLT_MAX);
  ImGui::NewFrame();
  ui::bild(W, H, jetzt);
  ImGui::Render();
  imguiZeichnen(ImGui::GetDrawData(), l, t);
}

static void mausAuf(XPLMWindowID w, int x, int y) {
  int l, t, r, b;
  XPLMGetWindowGeometry(w, &l, &t, &r, &b);
  ImGui::SetCurrentContext(ctx);
  ImGui::GetIO().AddMousePosEvent((x - l) / skala, (t - y) / skala);
}

static int klick(XPLMWindowID w, int x, int y, XPLMMouseStatus st, void*) {
  if (!ctx) return 1;
  mausAuf(w, x, y);
  cursorBild = bildNr;
  ImGuiIO& io = ImGui::GetIO();
  if (st == xplm_MouseDown) {
    io.AddMouseButtonEvent(0, true);
    if (!XPLMIsWindowInFront(w)) XPLMBringWindowToFront(w);
  } else if (st == xplm_MouseUp) io.AddMouseButtonEvent(0, false);
  return 1;
}

static int rechtsKlick(XPLMWindowID, int, int, XPLMMouseStatus, void*) { return 1; }

static XPLMCursorStatus cursor(XPLMWindowID w, int x, int y, void*) {
  if (ctx) {
    mausAuf(w, x, y);
    cursorBild = bildNr;
  }
  return xplm_CursorDefault;
}

static int rad(XPLMWindowID w, int x, int y, int achse, int klicks, void*) {
  if (!ctx) return 1;
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

// ------------------------------------------------------------------ Fenster
static void vrPruefen() {
  bool vr = drVR && XPLMGetDatai(drVR) != 0;
  if (!fenster || vr == imVR) return;
  if (vr) {
    XPLMGetWindowGeometry(fenster, &geo[0], &geo[1], &geo[2], &geo[3]);
    XPLMSetWindowPositioningMode(fenster, xplm_WindowVR, -1);
    int w = vrGeo[0] > 0 ? vrGeo[0] : (int)(BREITE * skala), h = vrGeo[1] > 0 ? vrGeo[1] : (int)(HOEHE * skala);
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
  int w = (int)(BREITE * skala), h = (int)(HOEHE * skala);
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
  int art;          // 0 = an LeitWerk, 1 = Tablet ein/aus, 2 = Zielort, 3 = Status geben, 4 = Karte
  XPLMCommandRef ref;
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
    {"leitwerk/sprechen", "LeitWerk: Sprechtaste Leitstelle (halten)", "funk_an", "funk_aus", 0, nullptr},
    {"leitwerk/sprechen_2", "LeitWerk: zweite Sprechtaste (halten)", "funkRtw_an", "funkRtw_aus", 0, nullptr},
    {"leitwerk/zielort", "LeitWerk: Zielort buchen (Tablet)", nullptr, nullptr, 2, nullptr},
    {"leitwerk/status_geben", "LeitWerk: Status geben (Tablet)", nullptr, nullptr, 3, nullptr},
    {"leitwerk/navigation", "LeitWerk: Navigation (Tablet)", nullptr, nullptr, 4, nullptr},
};

static int befehl(XPLMCommandRef, XPLMCommandPhase phase, void* ref) {
  Befehl& b = *(Befehl*)ref;
  if (phase == xplm_CommandBegin) {
    switch (b.art) {
      case 0: netz::senden(b.an); break;
      case 1: umschalten(); break;
      case 2: zeigen(true); ImGui::SetCurrentContext(ctx); ui::buchenOeffnen(); break;
      case 3: zeigen(true); ImGui::SetCurrentContext(ctx); ui::statusOeffnen(); break;
      case 4: zeigen(true); ImGui::SetCurrentContext(ctx); ui::kartenOeffnen(); break;
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
      vrGeo[0] = (int)(BREITE * skala);
      vrGeo[1] = (int)(HOEHE * skala);
      XPLMSetWindowGeometryVR(fenster, vrGeo[0], vrGeo[1]);
    } else {
      lageStandard();
      XPLMSetWindowGeometry(fenster, geo[0], geo[1], geo[2], geo[3]);
    }
    zeigen(true);
  }
}

static float takt(float, float, int, void*) {
  vrPruefen();
  if (ctx) {
    ImGui::SetCurrentContext(ctx);
    bool will = fenster && XPLMGetWindowIsVisible(fenster) && ui::willTasten();
    if (will && !hatFokus) { XPLMTakeKeyboardFocus(fenster); hatFokus = true; }
    if (!will && hatFokus) { XPLMTakeKeyboardFocus(0); hatFokus = false; }
  }
  if (menue) XPLMSetMenuItemName(menue, mStatus, netz::verbunden() ? "LeitWerk: verbunden" : "LeitWerk: nicht verbunden", 0);
  // LeitWerk wissen lassen, dass das Plugin da ist (Anzeige im Cockpit)
  double jetzt = XPLMGetElapsedTime();
  if (netz::verbunden() && jetzt - letzteMeldung > 10) {
    letzteMeldung = jetzt;
    netz::senden(std::string("xp:plugin:") + LEITWERK_PLUGIN_VERSION + ":" + (imVR ? "vr" : "2d") + ":" + (fenster && XPLMGetWindowIsVisible(fenster) ? "an" : "aus"));
  }
  return 0.5f;
}

// ------------------------------------------------------------------ Plugin-Einstieg
PLUGIN_API int XPluginStart(char* name, char* sig, char* desc) {
  strcpy(name, "LeitWerk");
  strcpy(sig, "at.pholzreiter.leitwerk");
  strcpy(desc, "LeitWerk: Einsatz-App (Tablet, auch in VR) und Befehle f\xC3\xBCr Status und Sprechtaste.");
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
  log(std::string("Version ") + LEITWERK_PLUGIN_VERSION + ", Schrift " + schriftOrdner);
  return 1;
}

PLUGIN_API void XPluginStop(void) {}

PLUGIN_API int XPluginEnable(void) {
  prefLesen();
  IMGUI_CHECKVERSION();
  ctx = ImGui::CreateContext();
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
  netz::starten();
  XPLMRegisterFlightLoopCallback(takt, 1.0f, nullptr);
  if (startSichtbar) zeigen(true);
  return 1;
}

PLUGIN_API void XPluginDisable(void) {
  prefSchreiben();
  XPLMUnregisterFlightLoopCallback(takt, nullptr);
  for (auto& b : befehle)
    if (b.ref) XPLMUnregisterCommandHandler(b.ref, befehl, 1, &b);
  netz::stoppen();
  if (hatFokus) XPLMTakeKeyboardFocus(0);
  hatFokus = false;
  if (menue) XPLMDestroyMenu(menue);
  menue = nullptr;
  if (menueId >= 0) XPLMRemoveMenuItem(XPLMFindPluginsMenu(), menueId);
  menueId = -1;
  if (fenster) XPLMDestroyWindow(fenster);
  fenster = nullptr;
  if (ctx) {
    ImGui::SetCurrentContext(ctx);
    if (uiBereit) ui::ende();
    ImGui::DestroyContext(ctx);
  }
  ctx = nullptr;
  uiBereit = false;
}

PLUGIN_API void XPluginReceiveMessage(XPLMPluginID, int, void*) {}
