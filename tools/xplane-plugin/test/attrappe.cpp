// Nachgebautes X-Plane zum Testen des Plugins unter Linux (Xvfb + Mesa):
// lädt LeitWerk.xpl, stellt die benutzten XPLM-Funktionen bereit, spielt ein Skript ab und macht Bildschirmfotos.
//   attrappe <plugin.xpl> <skript.txt> <ausgabeordner>
// Skript: warte <s> | klick <x> <y> | shell <befehl> | ziehen <x> <y> <dx> <dy> | rad <x> <y> <n> | befehl <name> [halten]
//         bild <datei.png> | tippe <text> | vr <0|1> | menue <nr>
//         geraet <id> <x> <y> (Tippen auf ein Cockpit-Gerät, Bildpunkte links oben) | geraetzieh <id> <x> <y> <dx> <dy>
//         sim <name> <wert> (boden, volt, avionik) | zeige <dataref>
// x/y sind Boxel im Fenster (links oben = 0,0). Cockpit-Geräte werden verkleinert unten ins Bild gezeichnet.
#include <GL/gl.h>
#include <GL/glx.h>
#include <X11/Xlib.h>
#include <dlfcn.h>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

#define XPLM200 1
#define XPLM210 1
#define XPLM300 1
#define XPLM301 1
#define XPLM400 1
#define XPLM410 1
#define XPLM411 1
#define XPLM420 1
#include "XPLMWeather.h"
#include "XPLMDataAccess.h"
#include "XPLMDisplay.h"
#include "XPLMGraphics.h"
#include "XPLMMenus.h"
#include "XPLMPlugin.h"
#include "XPLMProcessing.h"
#include "XPLMUtilities.h"

static const int SW = 1400, SH = 1000;
static std::string pluginPfad;
static double startZeit;
static double jetzt() { return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count() - startZeit; }
static int vr = 0;

struct Fenster {
  XPLMCreateWindow_t p;
  int l, t, r, b;
  int sichtbar;
  int modus;
  int vrW, vrH;
};
static std::vector<Fenster*> fenster;
static XPLMWindowID fokus = nullptr;
struct Cmd {
  std::string name, text;
  std::vector<std::pair<XPLMCommandCallback_f, void*>> h;
};
static std::vector<Cmd*> cmds;
struct Menue {
  std::string name;
  XPLMMenuHandler_f h;
  void* ref;
  std::vector<std::pair<std::string, void*>> items;
};
static std::vector<Menue*> menues;
static XPLMFlightLoop_f flug = nullptr;
static void* flugRef = nullptr;
static double flugNaechst = 0;
// weitere Flugschleifen (XPLMCreateFlightLoop)
struct Schleife {
  XPLMCreateFlightLoop_t p;
  double naechst;
  bool an;
};
static std::vector<Schleife*> schleifen;
static int zyklus = 0;
// Cockpit-Geräte (XPLMCreateAvionicsEx): Lage im Bild (links unten) und Verkleinerung
struct Geraet {
  XPLMCreateAvionics_t p;
  std::string id;
  int x, y;
  float s;
  bool zeichnen = true;
};
static std::vector<Geraet*> geraete;
// Werte des „Simulators“
static float simVolt[4] = {28, 28, 0, 0};
static int simAvionik = 1, simBoden = 1;
static double simLat = 48.4, simLon = 15.6, simHoehe = 250;
static float simAgl = 0.5f;
// Datarefs des Plugins
struct EigenerDr {
  std::string name;
  XPLMDataTypeID typ;
  XPLMGetDatai_f gi;
  XPLMSetDatai_f si;
  XPLMGetDataf_f gf;
  void* r;
};
static std::vector<EigenerDr*> eigene;

extern "C" {
XPLM_API void XPLMDebugString(const char* s) { fprintf(stderr, "[xplm] %s", s); }
XPLM_API void XPLMEnableFeature(const char*, int) {}
XPLM_API XPLMPluginID XPLMGetMyID(void) { return 1; }
XPLM_API void XPLMGetPluginInfo(XPLMPluginID, char* name, char* path, char* sig, char* desc) {
  if (path) strcpy(path, pluginPfad.c_str());
  if (name) strcpy(name, "LeitWerk");
  (void)sig;
  (void)desc;
}
XPLM_API void XPLMGetPrefsPath(char* p) { strcpy(p, "/tmp/leitwerk-attrappe-prefs/X-Plane.prf"); }
XPLM_API const char* XPLMGetDirectorySeparator(void) { return "/"; }
XPLM_API float XPLMGetElapsedTime(void) { return (float)jetzt(); }
// Matrizen wie in X-Plane über Datarefs (aus dem aktuellen GL-Zustand)
static int drMV, drPJ, drVP;
XPLM_API XPLMDataRef XPLMFindDataRef(const char* n) {
  if (!strcmp(n, "sim/graphics/VR/enabled")) return (XPLMDataRef)&vr;
  if (!strcmp(n, "sim/cockpit2/electrical/bus_volts")) return (XPLMDataRef)simVolt;
  if (!strcmp(n, "sim/cockpit/electrical/avionics_on")) return (XPLMDataRef)&simAvionik;
  if (!strcmp(n, "sim/flightmodel/failures/onground_any")) return (XPLMDataRef)&simBoden;
  if (!strcmp(n, "sim/flightmodel/position/latitude")) return (XPLMDataRef)&simLat;
  if (!strcmp(n, "sim/flightmodel/position/longitude")) return (XPLMDataRef)&simLon;
  if (!strcmp(n, "sim/flightmodel/position/elevation")) return (XPLMDataRef)&simHoehe;
  if (!strcmp(n, "sim/flightmodel/position/y_agl")) return (XPLMDataRef)&simAgl;
  for (EigenerDr* e : eigene)
    if (e->name == n) return (XPLMDataRef)e;
  if (getenv("ATTRAPPE_OHNE_MATRIX")) return nullptr;
  if (!strcmp(n, "sim/graphics/view/modelview_matrix")) return (XPLMDataRef)&drMV;
  if (!strcmp(n, "sim/graphics/view/projection_matrix")) return (XPLMDataRef)&drPJ;
  if (!strcmp(n, "sim/graphics/view/viewport")) return (XPLMDataRef)&drVP;
  return nullptr;
}
XPLM_API int XPLMGetDatai(XPLMDataRef d) { return d ? *(int*)d : 0; }
XPLM_API double XPLMGetDatad(XPLMDataRef d) { return d ? *(double*)d : 0; }
XPLM_API float XPLMGetDataf(XPLMDataRef d) { return d ? *(float*)d : 0; }
XPLM_API int XPLMGetDatavf(XPLMDataRef d, float* v, int o, int n) {
  if (d == simVolt) { for (int i = 0; i < n && o + i < 4; i++) v[i] = simVolt[o + i]; return n; }
  if (d == &drMV && n >= 16) { glGetFloatv(GL_MODELVIEW_MATRIX, v); return 16; }
  if (d == &drPJ && n >= 16) { glGetFloatv(GL_PROJECTION_MATRIX, v); return 16; }
  return 0;
}
XPLM_API int XPLMGetDatavi(XPLMDataRef d, int* v, int, int n) {
  if (d == &drVP && n >= 4) { glGetIntegerv(GL_VIEWPORT, v); return 4; }
  return 0;
}
XPLM_API void XPLMGenerateTextureNumbers(int* ids, int n) {
  GLuint t[64];
  glGenTextures(n, t);
  for (int i = 0; i < n; i++) ids[i] = (int)t[i];
}
XPLM_API void XPLMBindTexture2d(int t, int) { glBindTexture(GL_TEXTURE_2D, t); }
XPLM_API void XPLMSetGraphicsState(int, int tex, int, int, int blend, int, int) {
  if (tex) glEnable(GL_TEXTURE_2D); else glDisable(GL_TEXTURE_2D);
  if (blend) glEnable(GL_BLEND); else glDisable(GL_BLEND);
  glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  glDisable(GL_DEPTH_TEST);
}
XPLM_API XPLMWindowID XPLMCreateWindowEx(XPLMCreateWindow_t* p) {
  Fenster* f = new Fenster{*p, p->left, p->top, p->right, p->bottom, p->visible, 0, 0, 0};
  fenster.push_back(f);
  return f;
}
XPLM_API void XPLMDestroyWindow(XPLMWindowID w) {
  for (size_t i = 0; i < fenster.size(); i++)
    if (fenster[i] == w) { delete fenster[i]; fenster.erase(fenster.begin() + i); break; }
}
XPLM_API void XPLMGetWindowGeometry(XPLMWindowID w, int* l, int* t, int* r, int* b) {
  Fenster* f = (Fenster*)w;
  if (f->modus == xplm_WindowVR) {
    // VR: eigenes Bild, links unten = 0,0
    if (l) *l = 0; if (b) *b = 0; if (r) *r = f->vrW; if (t) *t = f->vrH;
    return;
  }
  if (l) *l = f->l; if (t) *t = f->t; if (r) *r = f->r; if (b) *b = f->b;
}
XPLM_API void XPLMSetWindowGeometry(XPLMWindowID w, int l, int t, int r, int b) {
  Fenster* f = (Fenster*)w;
  f->l = l; f->t = t; f->r = r; f->b = b;
}
XPLM_API void XPLMGetWindowGeometryVR(XPLMWindowID w, int* wi, int* he) { *wi = ((Fenster*)w)->vrW; *he = ((Fenster*)w)->vrH; }
XPLM_API void XPLMSetWindowGeometryVR(XPLMWindowID w, int wi, int he) { ((Fenster*)w)->vrW = wi; ((Fenster*)w)->vrH = he; }
XPLM_API int XPLMGetWindowIsVisible(XPLMWindowID w) { return ((Fenster*)w)->sichtbar; }
XPLM_API void XPLMSetWindowIsVisible(XPLMWindowID w, int v) { ((Fenster*)w)->sichtbar = v; }
XPLM_API void XPLMSetWindowPositioningMode(XPLMWindowID w, XPLMWindowPositioningMode m, int) { ((Fenster*)w)->modus = m; }
XPLM_API void XPLMSetWindowTitle(XPLMWindowID, const char*) {}
XPLM_API void XPLMSetWindowResizingLimits(XPLMWindowID, int, int, int, int) {}
XPLM_API void XPLMTakeKeyboardFocus(XPLMWindowID w) { fokus = w; fprintf(stderr, "[attrappe] Tastatur: %s\n", w ? "Plugin" : "frei"); }
XPLM_API int XPLMIsWindowInFront(XPLMWindowID) { return 1; }
XPLM_API void XPLMBringWindowToFront(XPLMWindowID) {}
XPLM_API void XPLMGetScreenBoundsGlobal(int* l, int* t, int* r, int* b) { *l = 0; *t = SH; *r = SW; *b = 0; }
XPLM_API XPLMCommandRef XPLMCreateCommand(const char* n, const char* d) {
  Cmd* c = new Cmd{n, d, {}};
  cmds.push_back(c);
  return c;
}
XPLM_API void XPLMRegisterCommandHandler(XPLMCommandRef c, XPLMCommandCallback_f f, int, void* r) { ((Cmd*)c)->h.push_back({f, r}); }
XPLM_API void XPLMUnregisterCommandHandler(XPLMCommandRef, XPLMCommandCallback_f, int, void*) {}
XPLM_API XPLMMenuID XPLMFindPluginsMenu(void) {
  static Menue m{"Plugins", nullptr, nullptr, {}};
  return &m;
}
XPLM_API XPLMMenuID XPLMCreateMenu(const char* n, XPLMMenuID, int, XPLMMenuHandler_f h, void* r) {
  Menue* m = new Menue{n, h, r, {}};
  menues.push_back(m);
  return m;
}
XPLM_API void XPLMDestroyMenu(XPLMMenuID) {}
XPLM_API int XPLMAppendMenuItem(XPLMMenuID m, const char* n, void* r, int) {
  ((Menue*)m)->items.push_back({n, r});
  return (int)((Menue*)m)->items.size() - 1;
}
XPLM_API void XPLMAppendMenuSeparator(XPLMMenuID m) { ((Menue*)m)->items.push_back({"-", nullptr}); }
XPLM_API void XPLMSetMenuItemName(XPLMMenuID m, int i, const char* n, int) { ((Menue*)m)->items[i].first = n; }
XPLM_API void XPLMCheckMenuItem(XPLMMenuID, int, XPLMMenuCheck) {}
XPLM_API void XPLMEnableMenuItem(XPLMMenuID, int, int) {}
XPLM_API void XPLMRemoveMenuItem(XPLMMenuID, int) {}
XPLM_API void XPLMRegisterFlightLoopCallback(XPLMFlightLoop_f f, float t, void* r) { flug = f; flugRef = r; flugNaechst = jetzt() + (t > 0 ? t : 0); }
XPLM_API int XPLMGetCycleNumber(void) { return zyklus; }
XPLM_API XPLMFlightLoopID XPLMCreateFlightLoop(XPLMCreateFlightLoop_t* p) {
  Schleife* s = new Schleife{*p, 0, false};
  schleifen.push_back(s);
  return (XPLMFlightLoopID)s;
}
XPLM_API void XPLMDestroyFlightLoop(XPLMFlightLoopID f) { ((Schleife*)f)->an = false; }
XPLM_API void XPLMScheduleFlightLoop(XPLMFlightLoopID f, float t, int) {
  ((Schleife*)f)->an = true;
  ((Schleife*)f)->naechst = jetzt() + (t > 0 ? t : 0);
}
XPLM_API XPLMDataRef XPLMRegisterDataAccessor(const char* n, XPLMDataTypeID typ, int, XPLMGetDatai_f gi, XPLMSetDatai_f si, XPLMGetDataf_f gf,
                                              XPLMSetDataf_f, XPLMGetDatad_f, XPLMSetDatad_f, XPLMGetDatavi_f, XPLMSetDatavi_f,
                                              XPLMGetDatavf_f, XPLMSetDatavf_f, XPLMGetDatab_f, XPLMSetDatab_f, void* r, void*) {
  EigenerDr* e = new EigenerDr{n, typ, gi, si, gf, r};
  eigene.push_back(e);
  return (XPLMDataRef)e;
}
XPLM_API void XPLMUnregisterDataAccessor(XPLMDataRef) {}
}

// ------------------------------------------------------------------ neuere Funktionen (über XPLMFindSymbol)
static XPLMAvionicsID avNeu(XPLMCreateAvionics_t* p) {
  Geraet* g = new Geraet;
  g->p = *p;
  g->id = p->deviceID;
  // Lage im Bild (links unten, verkleinert)
  if (g->id == "leitwerk_mfd") { g->x = 10; g->y = 10; g->s = 0.6f; }
  else if (g->id == "leitwerk_tablet") { g->x = 380; g->y = 10; g->s = 0.7f; }
  else if (g->id == "leitwerk_kachel") { g->x = 1100; g->y = 10; g->s = 1.0f; }
  else { g->x = 380; g->y = 450; g->s = 0.5f; }
  geraete.push_back(g);
  fprintf(stderr, "[attrappe] Ger\xC3\xA4t %s %dx%d\n", g->id.c_str(), p->screenWidth, p->screenHeight);
  return (XPLMAvionicsID)g;
}
static void avWeg(XPLMAvionicsID) {}
static void avZeichnen(XPLMAvionicsID a) { ((Geraet*)a)->zeichnen = true; }
static int avGebunden(XPLMAvionicsID) { return 1; }
static int wxSofort = -1;
static void wxBeginn() {}
static void wxSetzen(double lat, double lon, double boden, XPLMWeatherInfo_t* w) {
  fprintf(stderr, "[attrappe] Wetter %.3f %.3f Boden %.0f m: %.1f \xC2\xB0" "C, QNH %.0f hPa, Sicht %.0f m, Regen %.2f, Wind %.1f m/s aus %.0f (B\xC3\xB6" "en %.1f), Wolke %.0f %.2f %.0f\xE2\x80\x93%.0f m, Gr\xC3\xB6\xC3\x9F" "e %d\n",
          lat, lon, boden, w->temperature_alt, w->pressure_alt / 100, w->visibility, w->precip_rate, w->wind_layers[0].speed, w->wind_layers[0].direction,
          w->wind_layers[0].gust_speed, w->cloud_layers[0].cloud_type, w->cloud_layers[0].coverage, w->cloud_layers[0].alt_base, w->cloud_layers[0].alt_top, w->structSize);
}
static void wxEnde(int inkr, int sofort) {
  wxSofort = sofort;
  fprintf(stderr, "[attrappe] Wetter fertig: schrittweise %d, sofort %d\n", inkr, sofort);
}
extern "C" {
XPLM_API void* XPLMFindSymbol(const char* n) {
  if (getenv("ATTRAPPE_ALT")) return nullptr;  // wie X-Plane 12.0
  if (!strcmp(n, "XPLMCreateAvionicsEx")) return (void*)avNeu;
  if (!strcmp(n, "XPLMDestroyAvionics")) return (void*)avWeg;
  if (!strcmp(n, "XPLMAvionicsNeedsDrawing")) return (void*)avZeichnen;
  if (!strcmp(n, "XPLMIsAvionicsBound")) return (void*)avGebunden;
  if (!strcmp(n, "XPLMBeginWeatherUpdate")) return (void*)wxBeginn;
  if (!strcmp(n, "XPLMEndWeatherUpdate")) return (void*)wxEnde;
  if (!strcmp(n, "XPLMSetWeatherAtLocation")) return (void*)wxSetzen;
  return nullptr;
}
XPLM_API void XPLMUnregisterFlightLoopCallback(XPLMFlightLoop_f, void*) { flug = nullptr; }
}

// ------------------------------------------------------------------ Bild
static Display* dpy;
static Window win;

static void bildMalen(bool tauschen = true) {
  glViewport(0, 0, SW, SH);
  glClearColor(0.25f, 0.32f, 0.4f, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  for (Fenster* f : fenster) {
    if (!f->sichtbar) continue;
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    if (f->modus == xplm_WindowVR) {
      // VR: Fenster in ein eigenes Bild (hier: links unten im Bildschirm)
      glViewport(20, 20, f->vrW, f->vrH);
      glOrtho(0, f->vrW, 0, f->vrH, -1, 1);
    } else {
      glViewport(0, 0, SW, SH);
      glOrtho(0, SW, 0, SH, -1, 1);
    }
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    if (f->modus == xplm_WindowVR) glOrtho(0, f->vrW, 0, f->vrH, -1, 1);
    else glOrtho(0, SW, 0, SH, -1, 1);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    // Rahmen wie X-Plane
    int l, t, r, b;
    XPLMGetWindowGeometry(f, &l, &t, &r, &b);
    glDisable(GL_TEXTURE_2D);
    glColor4f(0.1f, 0.1f, 0.1f, 1);
    glBegin(GL_QUADS);
    glVertex2i(l - 4, b - 4); glVertex2i(r + 4, b - 4); glVertex2i(r + 4, t + 24); glVertex2i(l - 4, t + 24);
    glEnd();
    f->p.drawWindowFunc(f, f->p.refcon);
  }
  // Cockpit-Geräte (verkleinert): Ursprung links unten, Einheiten = Bildpunkte des Geräts
  for (Geraet* g : geraete) {
    int w = (int)(g->p.screenWidth * g->s), h = (int)(g->p.screenHeight * g->s);
    glViewport(g->x, g->y, w, h);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glOrtho(0, g->p.screenWidth, 0, g->p.screenHeight, -1, 1);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glDisable(GL_SCISSOR_TEST);
    glDisable(GL_TEXTURE_2D);
    glColor4f(0, 0, 0, 1);
    glBegin(GL_QUADS);
    glVertex2i(0, 0); glVertex2i(g->p.screenWidth, 0); glVertex2i(g->p.screenWidth, g->p.screenHeight); glVertex2i(0, g->p.screenHeight);
    glEnd();
    if (g->p.drawCallback) g->p.drawCallback(g->p.refcon);
  }
  glViewport(0, 0, SW, SH);
  glFinish();
  if (tauschen) glXSwapBuffers(dpy, win);
}

static void foto(const std::string& datei) {
  bildMalen(false);
  std::vector<unsigned char> px(SW * SH * 4), umg(SW * SH * 4);
  glReadBuffer(GL_BACK);
  glReadPixels(0, 0, SW, SH, GL_RGBA, GL_UNSIGNED_BYTE, px.data());
  for (int y = 0; y < SH; y++) memcpy(&umg[y * SW * 4], &px[(SH - 1 - y) * SW * 4], SW * 4);
  stbi_write_png(datei.c_str(), SW, SH, 4, umg.data(), SW * 4);
  glXSwapBuffers(dpy, win);
  fprintf(stderr, "[attrappe] Bild %s\n", datei.c_str());
}

static void takt() {
  zyklus++;
  for (Schleife* l : schleifen) {
    if (!l->an || jetzt() < l->naechst) continue;
    float n = l->p.callbackFunc(0, 0, 0, l->p.refcon);
    if (n == 0) l->an = false;
    else l->naechst = jetzt() + (n > 0 ? n : 0);
  }
  if (flug && jetzt() >= flugNaechst) {
    float n = flug(0, 0, 0, flugRef);
    flugNaechst = jetzt() + (n > 0 ? n : 0);
  }
  bildMalen();
}

static Geraet* geraetNach(const std::string& id) {
  for (Geraet* g : geraete)
    if (g->id == id || g->id == "leitwerk_" + id) return g;
  return nullptr;
}

static void warte(double s) {
  double ende = jetzt() + s;
  while (jetzt() < ende) {
    takt();
    std::this_thread::sleep_for(std::chrono::milliseconds(16));
  }
}

// Fensterkoordinaten (Boxel, links oben) → global
static void global(Fenster* f, int x, int y, int& gx, int& gy) {
  int l, t, r, b;
  XPLMGetWindowGeometry(f, &l, &t, &r, &b);
  gx = l + x;
  gy = t - y;
}

int main(int argc, char** argv) {
  if (argc < 4) { fprintf(stderr, "attrappe <plugin.xpl> <skript> <ausgabe>\n"); return 1; }
  startZeit = 0;
  startZeit = jetzt();
  pluginPfad = argv[1];
  std::string aus = argv[3];
  system("mkdir -p /tmp/leitwerk-attrappe-prefs");
  dpy = XOpenDisplay(nullptr);
  if (!dpy) { fprintf(stderr, "kein X-Display\n"); return 1; }
  int attr[] = {GLX_RGBA, GLX_DOUBLEBUFFER, GLX_RED_SIZE, 8, GLX_GREEN_SIZE, 8, GLX_BLUE_SIZE, 8, GLX_ALPHA_SIZE, 8, None};
  XVisualInfo* vi = glXChooseVisual(dpy, 0, attr);
  Colormap cm = XCreateColormap(dpy, RootWindow(dpy, vi->screen), vi->visual, AllocNone);
  XSetWindowAttributes swa;
  swa.colormap = cm;
  swa.event_mask = 0;
  win = XCreateWindow(dpy, RootWindow(dpy, vi->screen), 0, 0, SW, SH, 0, vi->depth, InputOutput, vi->visual, CWColormap | CWEventMask, &swa);
  XMapWindow(dpy, win);
  GLXContext gc = glXCreateContext(dpy, vi, nullptr, GL_TRUE);
  glXMakeCurrent(dpy, win, gc);

  void* h = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
  if (!h) { fprintf(stderr, "dlopen: %s\n", dlerror()); return 1; }
  auto start = (int (*)(char*, char*, char*))dlsym(h, "XPluginStart");
  auto enable = (int (*)())dlsym(h, "XPluginEnable");
  auto disable = (void (*)())dlsym(h, "XPluginDisable");
  char n[256], s[256], d[256];
  if (!start || !start(n, s, d)) { fprintf(stderr, "XPluginStart fehlgeschlagen\n"); return 1; }
  fprintf(stderr, "[attrappe] %s / %s\n", n, s);
  enable();
  std::ifstream sk(argv[2]);
  std::string zeile;
  while (std::getline(sk, zeile)) {
    std::istringstream z(zeile);
    std::string w;
    z >> w;
    if (w.empty() || w[0] == '#') continue;
    Fenster* f = fenster.empty() ? nullptr : fenster[0];
    if (w == "warte") { double t; z >> t; warte(t); }
    else if (w == "bild") { std::string dt; z >> dt; foto(aus + "/" + dt); }
    else if (w == "vr") { z >> vr; warte(0.6); }
    else if (w == "shell") { std::string t; std::getline(z, t); if (system(t.c_str()) != 0) fprintf(stderr, "[attrappe] shell fehlgeschlagen: %s\n", t.c_str()); }
    else if (w == "befehl" || w == "halten") {
      std::string nm;
      z >> nm;
      for (Cmd* c : cmds)
        if (c->name == nm)
          for (auto& hh : c->h) {
            hh.first(c, xplm_CommandBegin, hh.second);
            if (w == "halten") warte(0.5);
            hh.first(c, xplm_CommandEnd, hh.second);
          }
      warte(0.1);
    } else if (w == "menue") {
      int i; z >> i;
      Menue* m = menues[0];
      m->h(m->ref, m->items[i].second);
      warte(0.1);
    } else if (w == "klick" && f) {
      int x, y, gx, gy; z >> x >> y;
      global(f, x, y, gx, gy);
      f->p.handleCursorFunc(f, gx, gy, nullptr);
      takt();
      f->p.handleMouseClickFunc(f, gx, gy, xplm_MouseDown, nullptr);
      takt(); takt();
      f->p.handleMouseClickFunc(f, gx, gy, xplm_MouseUp, nullptr);
      warte(0.15);
    } else if (w == "ziehen" && f) {
      int x, y, dx, dy, gx, gy; z >> x >> y >> dx >> dy;
      global(f, x, y, gx, gy);
      f->p.handleMouseClickFunc(f, gx, gy, xplm_MouseDown, nullptr);
      takt();
      for (int i = 1; i <= 12; i++) {
        f->p.handleMouseClickFunc(f, gx + dx * i / 12, gy - dy * i / 12, xplm_MouseDrag, nullptr);
        takt();
      }
      f->p.handleMouseClickFunc(f, gx + dx, gy - dy, xplm_MouseUp, nullptr);
      warte(0.15);
    } else if (w == "rad" && f) {
      int x, y, k, gx, gy; z >> x >> y >> k;
      global(f, x, y, gx, gy);
      f->p.handleMouseWheelFunc(f, gx, gy, 0, k, nullptr);
      warte(0.1);
    } else if (w == "geraet" || w == "geraetzieh") {
      std::string id;
      int x, y, dx = 0, dy = 0;
      z >> id >> x >> y;
      if (w == "geraetzieh") z >> dx >> dy;
      Geraet* g = geraetNach(id);
      if (!g || !g->p.screenTouchCallback) { fprintf(stderr, "[attrappe] Ger\xC3\xA4t %s ohne Tippen\n", id.c_str()); continue; }
      int H = g->p.screenHeight;
      if (g->p.screenCursorCallback) g->p.screenCursorCallback(x, H - y, g->p.refcon);
      takt();
      g->p.screenTouchCallback(x, H - y, xplm_MouseDown, g->p.refcon);
      takt(); takt();
      for (int i = 1; dx | dy ? i <= 12 : false; i++) {
        g->p.screenTouchCallback(x + dx * i / 12, H - (y + dy * i / 12), xplm_MouseDrag, g->p.refcon);
        takt();
      }
      g->p.screenTouchCallback(x + dx, H - (y + dy), xplm_MouseUp, g->p.refcon);
      warte(0.2);
    } else if (w == "sim") {
      std::string n;
      double v;
      z >> n >> v;
      if (n == "boden") simBoden = (int)v;
      else if (n == "volt") simVolt[0] = (float)v;
      else if (n == "avionik") simAvionik = (int)v;
      else if (n == "lat") simLat = v;
      warte(0.1);
    } else if (w == "zeige") {
      std::string n;
      z >> n;
      for (EigenerDr* e : eigene)
        if (e->name == n) fprintf(stderr, "[attrappe] %s = %g\n", n.c_str(), e->typ == xplmType_Int ? (double)e->gi(e->r) : (double)e->gf(e->r));
    } else if (w == "tippe" && f) {
      std::string t;
      std::getline(z, t);
      if (!t.empty() && t[0] == ' ') t.erase(0, 1);
      for (char c : t) {
        f->p.handleKeyFunc(f, c, xplm_DownFlag, (char)toupper(c), nullptr, 0);
        takt();
      }
      warte(0.1);
    }
  }
  disable();
  return 0;
}
