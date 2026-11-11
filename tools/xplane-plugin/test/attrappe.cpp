// Nachgebautes X-Plane zum Testen des Plugins unter Linux (Xvfb + Mesa):
// lädt LeitWerk.xpl, stellt die benutzten XPLM-Funktionen bereit, spielt ein Skript ab und macht Bildschirmfotos.
//   attrappe <plugin.xpl> <skript.txt> <ausgabeordner>
// Skript: warte <s> | klick <x> <y> | shell <befehl> | ziehen <x> <y> <dx> <dy> | rad <x> <y> <n> | befehl <name> [halten]
//         bild <datei.png> | tippe <text> | vr <0|1> | menue <nr>
// x/y sind Boxel im Fenster (links oben = 0,0)
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
  if (getenv("ATTRAPPE_OHNE_MATRIX")) return nullptr;
  if (!strcmp(n, "sim/graphics/view/modelview_matrix")) return (XPLMDataRef)&drMV;
  if (!strcmp(n, "sim/graphics/view/projection_matrix")) return (XPLMDataRef)&drPJ;
  if (!strcmp(n, "sim/graphics/view/viewport")) return (XPLMDataRef)&drVP;
  return nullptr;
}
XPLM_API int XPLMGetDatai(XPLMDataRef d) { return d ? *(int*)d : 0; }
XPLM_API int XPLMGetDatavf(XPLMDataRef d, float* v, int, int n) {
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
XPLM_API void XPLMRegisterFlightLoopCallback(XPLMFlightLoop_f f, float t, void* r) { flug = f; flugRef = r; flugNaechst = jetzt() + t; }
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
  if (flug && jetzt() >= flugNaechst) {
    float n = flug(0, 0, 0, flugRef);
    flugNaechst = jetzt() + (n > 0 ? n : 1);
  }
  bildMalen();
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
