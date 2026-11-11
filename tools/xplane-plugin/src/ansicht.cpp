// Einsatz-App für X-Plane: dieselben Ansichten und Befehle wie efb.html (MSFS-Tablet), gezeichnet mit Dear ImGui.
#include "ansicht.h"

#include <algorithm>
#include <cctype>
#include <cfloat>
#include <cstdint>
#include <cmath>
#include <deque>
#include <string>
#include <utility>
#include <vector>

#include "farbe.h"
#include "imgui.h"
#include "imgui_internal.h"
#include "json.h"
#include "karte.h"
#include "netz.h"

namespace ui {

// ------------------------------------------------------------------ Schriften
static ImFont *fN, *fM, *fF, *fK, *fKF, *fG, *fGG, *fUhr, *fT;
static TexNeu texNeu;
static TexWeg texWeg;
static unsigned schriftTex = 0;

static float gr(ImFont* f) { return f->FontSize * ImGui::GetIO().FontGlobalScale; }

static ImFont* fRiesig = nullptr;  // TETRA-Display (große Ziffern/Texte)

void stilSetzen() {
  ImGuiIO& io = ImGui::GetIO();
  io.IniFilename = nullptr;
  io.LogFilename = nullptr;
  io.FontGlobalScale = 0.5f;  // doppelt gebacken
  ImGuiStyle& s = ImGui::GetStyle();
  s.WindowPadding = ImVec2(0, 0);
  s.WindowRounding = 0;
  s.WindowBorderSize = 0;
  s.ChildBorderSize = 0;
  s.ItemSpacing = ImVec2(8, 0);
  s.ScrollbarSize = 8;
  s.ScrollbarRounding = 4;
  s.DisabledAlpha = 1.0f;
  s.Colors[ImGuiCol_WindowBg] = ImColor(rgb(fb::GRUND));
  s.Colors[ImGuiCol_ChildBg] = ImVec4(0, 0, 0, 0);
  s.Colors[ImGuiCol_Text] = ImColor(rgb(fb::TEXT));
  s.Colors[ImGuiCol_ScrollbarBg] = ImVec4(0, 0, 0, 0);
  s.Colors[ImGuiCol_ScrollbarGrab] = ImColor(rgb(fb::RAND));
  s.Colors[ImGuiCol_ScrollbarGrabHovered] = ImColor(rgb(fb::DUNKELGRAU));
  s.Colors[ImGuiCol_ScrollbarGrabActive] = ImColor(rgb(fb::GRAU));
}

void start(const std::string& ordner, TexNeu neu, TexWeg weg) {
  texNeu = neu;
  texWeg = weg;
  karte::start(neu, weg);
  ImGuiIO& io = ImGui::GetIO();
  static ImVector<ImWchar> bereiche;
  ImFontGlyphRangesBuilder b;
  static const ImWchar grund[] = {0x0020, 0x00FF, 0x2010, 0x2027, 0x2030, 0x203A, 0x2190, 0x2193, 0x2212, 0x2212, 0x2713, 0x2715, 0x25B2, 0x25BC, 0};
  b.AddRanges(grund);
  b.BuildRanges(&bereiche);
  ImFontConfig cfg;
  cfg.OversampleH = 2;
  cfg.OversampleV = 1;
  cfg.PixelSnapH = false;
  auto laden = [&](const char* datei, float px) -> ImFont* {
    std::string p = ordner + datei;
    FILE* f = fopen(p.c_str(), "rb");
    if (!f) return nullptr;
    fclose(f);
    return io.Fonts->AddFontFromFileTTF(p.c_str(), px * 2, &cfg, bereiche.Data);
  };
  fN = laden("inter-400.ttf", 14);
  if (!fN) {
    // ohne Schriftdateien: eingebaute Schrift (ohne Umlaute)
    ImFontConfig c2;
    c2.SizePixels = 26;
    fN = io.Fonts->AddFontDefault(&c2);
    fM = fF = fK = fKF = fG = fGG = fUhr = fT = fRiesig = fN;
  } else {
    fM = laden("inter-600.ttf", 14);
    fF = laden("inter-700.ttf", 14);
    fK = laden("inter-400.ttf", 12);
    fKF = laden("inter-700.ttf", 11);
    fG = laden("inter-700.ttf", 17);
    fGG = laden("inter-700.ttf", 20);
    fUhr = laden("inter-600.ttf", 20);
    fT = laden("inter-700.ttf", 26);
    // nur Grundzeichen: TETRA-Display
    static const ImWchar klein[] = {0x0020, 0x00FF, 0x2026, 0x2026, 0};
    ImFontConfig c3 = cfg;
    std::string p = ordner + "inter-600.ttf";
    fRiesig = io.Fonts->AddFontFromFileTTF(p.c_str(), 48 * 2, &c3, klein);
    if (!fRiesig) fRiesig = fT;
  }
  unsigned char* px;
  int w, h;
  io.Fonts->GetTexDataAsRGBA32(&px, &w, &h);
  schriftTex = texNeu(w, h, px);
  io.Fonts->SetTexID((ImTextureID)(uintptr_t)schriftTex);
  io.Fonts->ClearTexData();
  stilSetzen();
}

void ende() {
  karte::ende();
  if (schriftTex && texWeg) texWeg(schriftTex);
  schriftTex = 0;
}

// ------------------------------------------------------------------ Zustand (wie in efb.html)
static Json stand;
// je Bildschirm (Fenster, MFD, Tablet): siehe Zustand in ansicht.h – hier die Arbeitskopie des gerade gezeichneten
static std::string tab = "transport";
static std::string patGesehen;
static std::string blattArt;  // "", "status", "buchen"
static bool navAuf = false;
static std::string khWahl, khFuer;
static bool selbstBuchen = false;
static std::string suchText;
static bool suchAktiv = false;
static bool suchTextGesetzt = false;
static bool suchScrollen = false;
static double suchSendenUm = 0;
struct Frage {
  std::string t, ja, befehl;
};
static Frage frage;
static bool frageOffen = false;
static karte::Ansicht kleineKarte, grosseKarte;
static double jetzt = 0;
static std::string tabZuletzt;
// Ziehen zum Scrollen (VR-Controller, Maus): danach kein Klick
static bool gezogen = false;
static unsigned zieht = 0;
static float ziehS0 = 0;
static bool zurueckGedrueckt = false;

struct Zustand::Daten {
  std::string tab = "transport", patGesehen, blattArt, khWahl, khFuer, suchText, tabZuletzt;
  bool navAuf = false, selbstBuchen = false, suchAktiv = false, suchTextGesetzt = false, suchScrollen = false, frageOffen = false, gezogen = false;
  double suchSendenUm = 0;
  Frage frage;
  karte::Ansicht kleineKarte, grosseKarte;
  unsigned zieht = 0;
  float ziehS0 = 0;
};

Zustand::Zustand() : d(new Daten) {}
Zustand::~Zustand() { delete d; }

static Zustand* aktiv = nullptr;

static void sichern(Zustand::Daten& z) {
  z.tab = tab; z.patGesehen = patGesehen; z.blattArt = blattArt; z.khWahl = khWahl; z.khFuer = khFuer; z.suchText = suchText;
  z.tabZuletzt = tabZuletzt; z.navAuf = navAuf; z.selbstBuchen = selbstBuchen; z.suchAktiv = suchAktiv; z.suchTextGesetzt = suchTextGesetzt;
  z.suchScrollen = suchScrollen; z.frageOffen = frageOffen; z.gezogen = gezogen; z.suchSendenUm = suchSendenUm; z.frage = frage;
  z.kleineKarte = kleineKarte; z.grosseKarte = grosseKarte; z.zieht = zieht; z.ziehS0 = ziehS0;
}

static void laden(const Zustand::Daten& z) {
  tab = z.tab; patGesehen = z.patGesehen; blattArt = z.blattArt; khWahl = z.khWahl; khFuer = z.khFuer; suchText = z.suchText;
  tabZuletzt = z.tabZuletzt; navAuf = z.navAuf; selbstBuchen = z.selbstBuchen; suchAktiv = z.suchAktiv; suchTextGesetzt = z.suchTextGesetzt;
  suchScrollen = z.suchScrollen; frageOffen = z.frageOffen; gezogen = z.gezogen; suchSendenUm = z.suchSendenUm; frage = z.frage;
  kleineKarte = z.kleineKarte; grosseKarte = z.grosseKarte; zieht = z.zieht; ziehS0 = z.ziehS0;
}

void zustand(Zustand* z) {
  if (z == aktiv) return;
  if (aktiv) sichern(*aktiv->d);
  aktiv = z;
  if (z) laden(*z->d);
}

const Json& standJson() { return stand; }

void standLesen() {
  std::string neu;
  if (netz::standNeu(neu)) {
    Json j;
    if (JsonLeser(neu).lesen(j)) stand = std::move(j);
  }
}

void takt(double jetztZeit) {
  jetzt = jetztZeit;
  karte::takt(jetzt);
}

bool zurueck() {
  bool z = zurueckGedrueckt;
  zurueckGedrueckt = false;
  return z;
}

static void senden(const std::string& b) { netz::senden(b); }

// ------------------------------------------------------------------ Bausteine
static std::vector<float> breiten;
static float breite() { return breiten.empty() ? ImGui::GetContentRegionAvail().x : breiten.back(); }

static std::string gross(const std::string& s) {
  std::string r;
  for (size_t i = 0; i < s.size(); i++) {
    unsigned char c = (unsigned char)s[i];
    if (c == 0xC3 && i + 1 < s.size()) {
      unsigned char d = (unsigned char)s[i + 1];
      if (d >= 0xA0 && d <= 0xBE && d != 0xB7) d -= 0x20;
      r += (char)c;
      r += (char)d;
      i++;
    } else r += (char)toupper(c);
  }
  return r;
}

// Haken (die Schrift hat kein ✓)
static void haken(ImDrawList* dl, ImVec2 p, float g, ImU32 c) {
  dl->AddLine(ImVec2(p.x, p.y + g * 0.55f), ImVec2(p.x + g * 0.35f, p.y + g * 0.9f), c, g * 0.16f);
  dl->AddLine(ImVec2(p.x + g * 0.35f, p.y + g * 0.9f), ImVec2(p.x + g, p.y + g * 0.15f), c, g * 0.16f);
}

static void luecke(float h) { ImGui::Dummy(ImVec2(1, h)); }

static void text(ImFont* f, ImU32 c, const std::string& s, float w = -1) {
  ImGui::PushFont(f);
  ImGui::PushStyleColor(ImGuiCol_Text, c);
  ImGui::PushTextWrapPos(ImGui::GetCursorPosX() + (w > 0 ? w : breite()));
  ImGui::TextUnformatted(s.c_str());
  ImGui::PopTextWrapPos();
  ImGui::PopStyleColor();
  ImGui::PopFont();
}

static ImVec2 textGroesse(ImFont* f, const std::string& s, float w = FLT_MAX) {
  return f->CalcTextSizeA(gr(f), FLT_MAX, w, s.c_str());
}

static void textAn(ImDrawList* dl, ImFont* f, ImVec2 p, ImU32 c, const std::string& s, float wrap = 0) {
  dl->AddText(f, gr(f), p, c, s.c_str(), nullptr, wrap);
}

// Kasten mit Hintergrund: Inhalt zuerst, Fläche danach darunter
struct Kasten {
  ImDrawListSplitter sp;
  ImVec2 p0;
  float w, px, py, r;
  ImU32 bg, rand, randOben;
  bool linieUnten;
};
static std::deque<Kasten> kaesten;

static void kastenAuf(ImU32 bg, float px = 12, float py = 12, float r = 10, ImU32 rand = 0, float w = -1, bool linieUnten = false, ImU32 randOben = 0) {
  kaesten.emplace_back();
  Kasten& k = kaesten.back();
  ImDrawList* dl = ImGui::GetWindowDrawList();
  k.sp.Split(dl, 2);
  k.sp.SetCurrentChannel(dl, 1);
  k.p0 = ImGui::GetCursorScreenPos();
  k.w = w > 0 ? w : breite();
  k.px = px;
  k.py = py;
  k.r = r;
  k.bg = bg;
  k.rand = rand;
  k.randOben = randOben;
  k.linieUnten = linieUnten;
  ImGui::SetCursorScreenPos(ImVec2(k.p0.x + px, k.p0.y + py));
  ImGui::BeginGroup();
  breiten.push_back(k.w - 2 * px);
  ImGui::Dummy(ImVec2(k.w - 2 * px, 0));
}

static void kastenZu(float minH = 0) {
  Kasten& k = kaesten.back();
  breiten.pop_back();
  ImGui::EndGroup();
  ImDrawList* dl = ImGui::GetWindowDrawList();
  float unten = ImGui::GetItemRectMax().y + k.py;
  if (unten - k.p0.y < minH) unten = k.p0.y + minH;
  ImVec2 p1(k.p0.x + k.w, unten);
  k.sp.SetCurrentChannel(dl, 0);
  if (k.bg) dl->AddRectFilled(k.p0, p1, k.bg, k.r);
  if (k.rand) dl->AddRect(k.p0, p1, k.rand, k.r, 0, 1.5f);
  if (k.randOben) dl->AddRectFilled(k.p0, ImVec2(p1.x, k.p0.y + 3), k.randOben, k.r, ImDrawFlags_RoundCornersTop);
  if (k.linieUnten) dl->AddLine(ImVec2(k.p0.x, p1.y - 0.5f), ImVec2(p1.x, p1.y - 0.5f), rgb(fb::LINIE), 1);
  k.sp.Merge(dl);
  ImGui::SetCursorScreenPos(k.p0);
  ImGui::Dummy(ImVec2(k.w, p1.y - k.p0.y));
  kaesten.pop_back();
}

// Abschnitt (.ab): 14/12 Rand, Linie unten
static void abAuf(bool linie = true) { kastenAuf(0, 14, 12, 0, 0, -1, linie); }
static void abZu() { kastenZu(); }

static void lbl(const std::string& t, const std::string& zusatz = "") {
  ImGui::PushFont(fKF);
  ImGui::PushStyleColor(ImGuiCol_Text, ImColor(rgb(fb::GRAU)).Value);
  ImGui::TextUnformatted(gross(t).c_str());
  ImGui::PopStyleColor();
  ImGui::PopFont();
  if (!zusatz.empty()) {
    ImGui::SameLine(0, 4);
    float y = ImGui::GetCursorPosY();
    ImGui::SetCursorPosY(y - 1);
    text(fK, rgb(fb::GRAU), zusatz);
  }
  luecke(8);
}

// Knopf ohne eigenes Aussehen; true bei Klick (nicht nach Ziehen)
static bool knopfRoh(const char* id, ImVec2 g, bool aus = false) {
  bool k = ImGui::InvisibleButton(id, g);
  return k && !gezogen && !aus;
}

static ImU32 heller(ImU32 c, float f) {
  ImVec4 v = ImColor(c).Value;
  v.x = std::min(1.f, v.x * f);
  v.y = std::min(1.f, v.y * f);
  v.z = std::min(1.f, v.z * f);
  return ImColor(v);
}

// Knopf mit Titel (und kleinem Untertext), Text mittig
static bool knopf(const char* id, const std::string& titel, const std::string& unter, ImU32 bg, ImU32 fg, float w, float h, ImFont* f = nullptr, bool aus = false, ImU32 rand = 0, float r = 10) {
  if (!f) f = fF;
  ImVec2 p = ImGui::GetCursorScreenPos();
  bool k = knopfRoh(id, ImVec2(w, h), aus);
  ImDrawList* dl = ImGui::GetWindowDrawList();
  ImU32 c = bg;
  if (!aus && ImGui::IsItemActive() && !gezogen) c = heller(bg, 1.25f);
  if (c) dl->AddRectFilled(p, ImVec2(p.x + w, p.y + h), c, r);
  if (rand) dl->AddRect(p, ImVec2(p.x + w, p.y + h), rand, r, 0, 1.5f);
  ImVec2 ts = textGroesse(f, titel, w - 12);
  ImVec2 us = unter.empty() ? ImVec2(0, 0) : textGroesse(fK, unter, w - 12);
  float y = p.y + (h - ts.y - us.y) / 2;
  // zentriert, Zeile für Zeile (AddText zentriert nicht)
  auto mittig = [&](ImFont* ff, const std::string& t, ImU32 col, float& yy) {
    const char* s = t.c_str();
    const char* e = s + t.size();
    while (s < e) {
      const char* zeilenEnde = ff->CalcWordWrapPositionA(gr(ff) / ff->FontSize, s, e, w - 12);
      if (zeilenEnde == s) zeilenEnde = s + 1;
      std::string z(s, zeilenEnde);
      while (!z.empty() && z.back() == ' ') z.pop_back();
      ImVec2 zs = textGroesse(ff, z);
      dl->AddText(ff, gr(ff), ImVec2(p.x + (w - zs.x) / 2, yy), col, z.c_str());
      yy += gr(ff) * 1.2f;
      s = zeilenEnde;
      while (s < e && *s == ' ') s++;
    }
  };
  mittig(f, titel, fg, y);
  if (!unter.empty()) mittig(fK, unter, fg, y);
  return k;
}

// Wahlknopf (.wahl button): links ausgerichtet, Titel fett + Untertext; on = blau
struct Wahl {
  std::string id, t, d;
  bool on = false, aus = false;
};
// gibt den angeklickten Index zurück (-1 = keiner)
static int wahlReihe(const std::vector<Wahl>& ws, int spalten, const char* idPrefix) {
  int geklickt = -1;
  float W = breite();
  float lueck = 8;
  float w = (W - lueck * (spalten - 1)) / spalten;
  for (size_t i = 0; i < ws.size(); i += spalten) {
    float h = 58;
    for (size_t j = i; j < ws.size() && j < i + spalten; j++) {
      float hh = 18 + textGroesse(fF, ws[j].t, w - 22).y + (ws[j].d.empty() ? 0 : 2 + textGroesse(fK, ws[j].d, w - 22).y);
      h = std::max(h, hh);
    }
    for (size_t j = i; j < ws.size() && j < i + spalten; j++) {
      if (j > i) ImGui::SameLine(0, lueck);
      const Wahl& x = ws[j];
      ImVec2 p = ImGui::GetCursorScreenPos();
      std::string id = std::string(idPrefix) + std::to_string(j);
      bool k = knopfRoh(id.c_str(), ImVec2(w, h), x.aus);
      ImDrawList* dl = ImGui::GetWindowDrawList();
      ImU32 bg = x.on ? rgb(fb::BLAU, 0.12f) : rgb(fb::KARTE);
      if (ImGui::IsItemActive() && !gezogen && !x.aus) bg = rgb(fb::BLAU, 0.22f);
      float a = x.aus ? 0.4f : 1.f;
      dl->AddRectFilled(p, ImVec2(p.x + w, p.y + h), bg, 10);
      dl->AddRect(p, ImVec2(p.x + w, p.y + h), x.on ? rgb(fb::BLAU) : rgb(fb::RAND), 10, 0, 1.5f);
      textAn(dl, fF, ImVec2(p.x + 11, p.y + 9), rgb(fb::TEXT, a), x.t, w - 22);
      if (!x.d.empty()) textAn(dl, fK, ImVec2(p.x + 11, p.y + 11 + textGroesse(fF, x.t, w - 22).y), rgb(fb::GRAU, a), x.d, w - 22);
      if (k) geklickt = (int)j;
    }
    luecke(8);
  }
  return geklickt;
}

// kleiner Rahmen-Knopf (.kn)
static bool kn(const char* id, const std::string& t) {
  ImVec2 ts = textGroesse(fM, t);
  return knopf(id, t, "", 0, rgb(fb::TEXT2), ts.x + 22, 30, fM, false, rgb(fb::RAND), 7);
}

// Pille (gebucht, frei …)
static void pille(ImDrawList* dl, ImVec2 p, const std::string& t, unsigned farbeHex, float hgA = 0.12f) {
  ImVec2 ts = textGroesse(fM, t);
  dl->AddRectFilled(p, ImVec2(p.x + ts.x + 16, p.y + ts.y + 4), rgb(farbeHex, hgA), 99);
  textAn(dl, fM, ImVec2(p.x + 8, p.y + 2), rgb(farbeHex), t);
}

// Ziehen zum Scrollen im aktuellen Fenster
static void ziehScroll() {
  ImGuiWindow* w = ImGui::GetCurrentWindow();
  float& s0 = ziehS0;
  if (ImGui::IsMouseClicked(0) && ImGui::IsWindowHovered(ImGuiHoveredFlags_ChildWindows | ImGuiHoveredFlags_AllowWhenBlockedByActiveItem)) {
    zieht = w->ID;
    s0 = w->Scroll.y;
  }
  if (zieht == w->ID && ImGui::IsMouseDown(0)) {
    float dy = ImGui::GetIO().MousePos.y - ImGui::GetIO().MouseClickedPos[0].y;
    if (fabsf(dy) > 6) gezogen = true;
    if (gezogen) ImGui::SetScrollY(std::max(0.f, std::min(w->ScrollMax.y, s0 - dy)));
  }
  if (!ImGui::IsMouseDown(0) && zieht == w->ID && !ImGui::IsMouseReleased(0)) zieht = 0;
}

// ------------------------------------------------------------------ Kopf
static void kopf(float W, const Json& t, bool mitZurueck = false) {
  ImDrawList* dl = ImGui::GetWindowDrawList();
  ImVec2 p = ImGui::GetWindowPos();
  float x0 = 14;
  dl->AddRectFilled(p, ImVec2(p.x + W, p.y + 56), rgb(fb::KOPF));
  dl->AddLine(ImVec2(p.x, p.y + 55.5f), ImVec2(p.x + W, p.y + 55.5f), rgb(fb::LINIE));
  std::string heli = t["heli"] ? t["heli"].t() : stand["heli"] ? stand["heli"].t() : "LeitWerk";
  std::string unter = !netz::verbunden() ? (netz::port() ? "verbinde …" : "LeitWerk nicht erreichbar")
                      : t["unter"] ? t["unter"].t() : stand["unter"] ? stand["unter"].t() : stand["hinweis"].t();
  std::string uhr = t["uhr"].t();
  if (mitZurueck) {
    // Tablet im Cockpit: zurück zu AviTab
    std::string z = "\xE2\x80\xB9 AviTab";
    float zw = textGroesse(fM, z).x + 22;
    ImGui::SetCursorPos(ImVec2(10, 11));
    if (knopf("##avitab", z, "", rgb(fb::KARTE), rgb(fb::TEXT), zw, 34, fM, false, rgb(fb::RAND), 8)) zurueckGedrueckt = true;
    x0 = 10 + zw + 12;
  }
  float rechts = W - 10 - 40;
  float uw = uhr.empty() ? 0 : textGroesse(fUhr, uhr).x;
  float tw = rechts - uw - 10 - x0;
  dl->PushClipRect(ImVec2(p.x + x0, p.y), ImVec2(p.x + x0 + tw, p.y + 56), true);
  textAn(dl, fG, ImVec2(p.x + x0, p.y + 9), rgb(fb::TEXT), heli);
  textAn(dl, fK, ImVec2(p.x + x0, p.y + 31), rgb(fb::GRAU), unter);
  dl->PopClipRect();
  if (!uhr.empty()) textAn(dl, fUhr, ImVec2(p.x + rechts - 6 - uw, p.y + 15), rgb(fb::TEXT), uhr);
  // Statuspunkt: öffnet „Status geben“
  ImGui::SetCursorPos(ImVec2(rechts, 8));
  ImVec2 q = ImGui::GetCursorScreenPos();
  bool k = knopfRoh("##stpkt", ImVec2(40, 40));
  if (ImGui::IsItemActive()) dl->AddRectFilled(q, ImVec2(q.x + 40, q.y + 40), rgb(fb::KARTE), 9);
  ImU32 sf = t["st"] ? farbe(t["st"]["f"].t(), rgb(fb::DUNKELGRAU)) : rgb(fb::DUNKELGRAU);
  dl->AddCircleFilled(ImVec2(q.x + 20, q.y + 20), 9.5f, IM_COL32(255, 255, 255, 20), 24);
  dl->AddCircleFilled(ImVec2(q.x + 20, q.y + 20), 6.5f, sf, 24);
  if (k && netz::verbunden()) blattArt = blattArt == "status" ? "" : "status";
}

// ------------------------------------------------------------------ Transport
static const char* GS_SCHRITTE[] = {"Alarm", "Bereitstellungsraum", "Abruf", "Einsatzort", "Patient"};

static void gsZeichnen(const Json& g) {
  luecke(10);
  float W = breite();
  ImVec2 p0 = ImGui::GetCursorScreenPos();
  ImDrawListSplitter sp;
  ImDrawList* dl = ImGui::GetWindowDrawList();
  sp.Split(dl, 2);
  sp.SetCurrentChannel(dl, 1);
  bool abruf = g["abruf"].art == Json::Objekt;
  unsigned fa = abruf ? fb::GELB : fb::BLAU;
  kastenAuf(0, 12, 11, 0, 0, W);
  text(fKF, rgb(abruf ? fb::GELBTEXT : fb::HELLBLAU), gross(abruf ? "Abruf durch die Einsatzleitung" : "Dein Auftrag"));
  luecke(3);
  text(fG, rgb(fb::TEXT), g["auftrag"].t());
  if (abruf && g["abruf"]["pct"]) {
    luecke(8);
    ImVec2 b = ImGui::GetCursorScreenPos();
    float bw = breite();
    dl->AddRectFilled(b, ImVec2(b.x + bw, b.y + 6), rgb(fb::RAND), 3);
    float pct = (float)std::min(100.0, std::max(0.0, g["abruf"]["pct"].z()));
    dl->AddRectFilled(b, ImVec2(b.x + bw * pct / 100, b.y + 6), rgb(fb::GELB), 3);
    luecke(6);
  }
  ImVec2 aufTop = kaesten.back().p0;
  kastenZu();
  ImVec2 aufBot(p0.x + W, ImGui::GetItemRectMax().y);
  // Schritte
  int schritt = (int)g["schritt"].z();
  ImGui::SetCursorScreenPos(ImVec2(p0.x + 12, ImGui::GetCursorScreenPos().y + 10));
  ImVec2 sp0 = ImGui::GetCursorScreenPos();
  float x = sp0.x;
  float maxX = p0.x + W - 12;
  float y = sp0.y;
  for (int i = 0; i < 5; i++) {
    std::string t = GS_SCHRITTE[i];
    ImU32 c = i < schritt ? rgb(fb::GRUEN) : i == schritt ? rgb(fb::TEXT) : rgb(fb::DUNKELGRAU);
    float hw = i < schritt ? gr(fM) * 0.8f + 4 : 0;
    float tw = textGroesse(fM, t).x + hw;
    if (x + tw > maxX && x > sp0.x) { x = sp0.x; y += gr(fM) * 1.4f; }
    if (hw) haken(dl, ImVec2(x, y + gr(fM) * 0.1f), gr(fM) * 0.75f, c);
    textAn(dl, fM, ImVec2(x + hw, y), c, t);
    x += tw;
    if (i < 4) { textAn(dl, fM, ImVec2(x + 3, y), rgb(0x3A4150), "\xE2\x80\xBA"); x += 14; }
  }
  ImGui::SetCursorScreenPos(ImVec2(p0.x, y + gr(fM) * 1.4f + 4));
  // Werte
  const Json& w = g["werte"];
  ImGui::SetCursorScreenPos(ImVec2(p0.x + 12, ImGui::GetCursorScreenPos().y));
  breiten.push_back(W - 24);
  ImGui::BeginGroup();
  for (size_t i = 0; i < w.size(); i++) {
    ImVec2 z0 = ImGui::GetCursorScreenPos();
    if (i > 0) dl->AddLine(z0, ImVec2(z0.x + W - 24, z0.y), rgb(fb::KARTE2));
    luecke(5);
    ImVec2 z1 = ImGui::GetCursorScreenPos();
    text(fN, rgb(fb::GRAU), w[i]["l"].t(), 124);
    float h1 = ImGui::GetItemRectSize().y;
    ImGui::SetCursorScreenPos(ImVec2(z1.x + 130, z1.y));
    text(fM, rgb(fb::TEXT), w[i]["v"].t(), W - 24 - 130);
    float h2 = ImGui::GetItemRectSize().y;
    ImGui::SetCursorScreenPos(ImVec2(z1.x, z1.y + std::max(h1, h2) + 5));
    ImGui::Dummy(ImVec2(1, 0));
  }
  ImGui::EndGroup();
  breiten.pop_back();
  luecke(8);
  float unten = ImGui::GetItemRectMax().y + 2;
  sp.SetCurrentChannel(dl, 0);
  dl->AddRectFilled(p0, ImVec2(p0.x + W, unten), rgb(fb::KARTE), 12);
  dl->AddRectFilled(aufTop, aufBot, rgb(fa, 0.14f), 12, ImDrawFlags_RoundCornersTop);
  dl->AddLine(ImVec2(aufTop.x, aufBot.y), aufBot, rgb(fa, 0.32f));
  sp.Merge(dl);
  ImGui::SetCursorScreenPos(p0);
  ImGui::Dummy(ImVec2(W, unten - p0.y));
}

static const Json* knopfMitNummer(const char* nr) {
  const Json& kn = stand["knoepfe"];
  for (size_t i = 0; i < kn.size(); i++)
    if (kn[i]["nummer"].t() == nr) return &kn[i];
  return nullptr;
}

static void navOeffnen() {
  navAuf = true;
  grosseKarte.folgen = true;
  grosseKarte.z = 12;
}

static void transportZeichnen(const Json& t) {
  const Json& e = t["ein"];
  const Json& gs = t["gs"];
  ImDrawList* dl = ImGui::GetWindowDrawList();
  if (t["alarm"]) {
    luecke(10);
    ImGui::SetCursorPosX(ImGui::GetCursorPosX() + 14);
    breiten.push_back(breite() - 28);
    float W = breite();
    ImVec2 p = ImGui::GetCursorScreenPos();
    dl->AddRectFilled(p, ImVec2(p.x + W, p.y + 40), rgb(fb::ALARM), 9);
    textAn(dl, fF, ImVec2(p.x + 12, p.y + 11), IM_COL32_WHITE, "ALARM");
    textAn(dl, fM, ImVec2(p.x + 12 + textGroesse(fF, "ALARM").x + 10, p.y + 11), IM_COL32(255, 255, 255, 230), t["alarm"]["zeit"].t());
    if (t["alarm"]["quitt"]) {
      std::string q = "Status 9 \xE2\x80\x93 quittiert";
      ImVec2 qs = textGroesse(fM, q);
      ImVec2 q0(p.x + W - 10 - qs.x - 16, p.y + 9);
      dl->AddRectFilled(q0, ImVec2(q0.x + qs.x + 16, q0.y + 22), IM_COL32(255, 255, 255, 46), 6);
      textAn(dl, fM, ImVec2(q0.x + 8, q0.y + 3), IM_COL32_WHITE, q);
      ImGui::Dummy(ImVec2(W, 40));
    } else if (const Json* k9 = knopfMitNummer("9")) {
      ImGui::Dummy(ImVec2(W - 130, 40));
      ImGui::SameLine(0, 0);
      ImGui::SetCursorScreenPos(ImVec2(p.x + W - 128, p.y + 6));
      if (knopf("##quitt", "9 Quittieren", "", IM_COL32(255, 255, 255, 235), rgb(fb::ALARM), 118, 28, fF, false, 0, 7)) senden((*k9)["aktion"].t());
      ImGui::SetCursorScreenPos(ImVec2(p.x, p.y + 40));
      ImGui::Dummy(ImVec2(1, 0));
    } else ImGui::Dummy(ImVec2(W, 40));
    breiten.pop_back();
  }
  abAuf();
  {
    // Code-Kasten
    kastenAuf(rgb(fb::KARTE), 12, 12, 10);
    ImVec2 p = ImGui::GetCursorScreenPos();
    float x = p.x;
    if (e["stufe"]) {
      std::string st = gross(e["stufe"].t());
      ImVec2 ss = textGroesse(fF, st);
      ImDrawList* d2 = ImGui::GetWindowDrawList();
      d2->AddRectFilled(p, ImVec2(p.x + ss.x + 16, p.y + ss.y + 6), farbe(e["sf"].t(), rgb(fb::ALARM)), 5);
      textAn(d2, fF, ImVec2(p.x + 8, p.y + 3), IM_COL32_WHITE, st);
      x += ss.x + 16 + 8;
    }
    textAn(ImGui::GetWindowDrawList(), fF, ImVec2(x, p.y + 3), rgb(fb::TEXT2), e["code"].t());
    luecke(gr(fF) + 6 + 7);
    text(fG, rgb(fb::TEXT), e["sw"].t());
    if (e["zi"]) {
      luecke(8);
      ImVec2 q = ImGui::GetCursorScreenPos();
      std::string zi = e["zi"].t();
      ImVec2 zs = textGroesse(fN, zi, breite() - 18);
      ImGui::GetWindowDrawList()->AddRectFilled(q, ImVec2(q.x + zs.x + 18, q.y + zs.y + 8), rgb(0x2A2E38), 6);
      ImGui::SetCursorScreenPos(ImVec2(q.x + 9, q.y + 4));
      text(fN, rgb(fb::TEXT3), zi, breite() - 18);
      luecke(4);
    }
    kastenZu();
  }
  if (e["gs"] && !gs) {
    luecke(8);
    kastenAuf(rgb(fb::WARN), 10, 8, 8);
    text(fN, rgb(fb::GELBTEXT), e["gs"].t());
    kastenZu();
  }
  auto reihe = [&](const char* l, const std::string& w, bool fett) {
    luecke(10);
    ImVec2 p = ImGui::GetCursorScreenPos();
    ImGui::SetCursorScreenPos(ImVec2(p.x, p.y + 3));
    text(fKF, rgb(fb::GRAU), gross(l), 70);
    ImGui::SetCursorScreenPos(ImVec2(p.x + 72, p.y));
    text(fett ? fG : fN, rgb(fett ? fb::TEXT : fb::TEXT2), w, breite() - 72);
  };
  reihe("Ort", e["adr"].t(), true);
  if (e["zusatz"]) reihe("Zusatz", e["zusatz"].t(), false);
  if (gs.art == Json::Objekt) gsZeichnen(gs);
  // kleine Karte
  luecke(12);
  {
    ImVec2 p = ImGui::GetCursorScreenPos();
    float W = breite();
    bool k = knopfRoh("##kleinekarte", ImVec2(W, 170));
    karte::zeichnen(kleineKarte, p, ImVec2(W, 170), t["karte"], true, fK, fF);
    if (k) navOeffnen();
  }
  abZu();
  if (gs.art == Json::Objekt && gs["zahlen"].size()) {
    abAuf();
    lbl("Lage am Einsatzort");
    const Json& z = gs["zahlen"];
    int n = (int)z.size();
    float W = breite();
    float w = (W - 6 * (n - 1)) / n;
    for (int i = 0; i < n; i++) {
      if (i) ImGui::SameLine(0, 6);
      ImVec2 p = ImGui::GetCursorScreenPos();
      ImGui::Dummy(ImVec2(w, 54));
      dl = ImGui::GetWindowDrawList();
      dl->AddRectFilled(p, ImVec2(p.x + w, p.y + 54), rgb(fb::KARTE), 9);
      dl->AddRectFilled(p, ImVec2(p.x + w, p.y + 3), farbe(z[i]["f"].t(), rgb(fb::DUNKELGRAU)), 9, ImDrawFlags_RoundCornersTop);
      std::string nn = z[i]["n"].t(), tt = z[i]["t"].t();
      ImVec2 a = textGroesse(fGG, nn), b = textGroesse(fK, tt);
      textAn(dl, fGG, ImVec2(p.x + (w - a.x) / 2, p.y + 8), rgb(fb::TEXT), nn);
      dl->PushClipRect(p, ImVec2(p.x + w, p.y + 54), true);
      textAn(dl, fK, ImVec2(p.x + std::max(2.f, (w - b.x) / 2), p.y + 33), rgb(fb::GRAU), tt);
      dl->PopClipRect();
    }
    abZu();
  }
  if (gs.art == Json::Objekt && gs["liste"].size()) {
    abAuf();
    lbl("Bereitstellungsraum", "\xC2\xB7 Reihenfolge des Abrufs");
    const Json& l = gs["liste"];
    for (size_t i = 0; i < l.size(); i++) {
      std::string c = l[i]["c"].t();
      bool du = c.find("du") != std::string::npos, weg = c.find("weg") != std::string::npos;
      float a = weg ? 0.55f : 1.f;
      kastenAuf(rgb(fb::KARTE, a), 10, 7, 8, du ? rgb(fb::BLAU) : 0);
      ImVec2 p = ImGui::GetCursorScreenPos();
      text(fF, rgb(fb::GRAU, a), l[i]["nr"].t(), 24);
      ImGui::SetCursorScreenPos(ImVec2(p.x + 26, p.y));
      text(fM, rgb(fb::TEXT, a), l[i]["t"].t(), breite() - 26 - 70);
      std::string zz = l[i]["z"].t();
      ImVec2 zs = textGroesse(fK, zz);
      textAn(ImGui::GetWindowDrawList(), fK, ImVec2(p.x + breite() - zs.x, p.y + 1), rgb(fb::GRAU, a), zz);
      kastenZu();
      luecke(5);
    }
    abZu();
  }
  if (gs.art == Json::Objekt && gs["meld"].size()) {
    abAuf();
    lbl("Lagemeldungen", "\xC2\xB7 Funk " + gs["gruppe"].t());
    const Json& m = gs["meld"];
    for (size_t i = 0; i < m.size(); i++) {
      ImVec2 p = ImGui::GetCursorScreenPos();
      if (i) ImGui::GetWindowDrawList()->AddLine(p, ImVec2(p.x + breite(), p.y), rgb(fb::LINIE));
      luecke(7);
      p = ImGui::GetCursorScreenPos();
      text(fM, rgb(fb::GRAU), m[i]["z"].t(), 44);
      ImGui::SetCursorScreenPos(ImVec2(p.x + 46, p.y));
      text(fN, rgb(fb::TEXT2), m[i]["t"].t(), breite() - 46);
      luecke(7);
    }
    abZu();
  }
  const Json& f = t["fz"];
  if (f.size()) {
    abAuf();
    lbl("Alarmierte Fahrzeuge", "\xC2\xB7 " + std::to_string(f.size()));
    for (size_t i = 0; i < f.size(); i++) {
      const Json& x = f[i];
      bool funk = (bool)x["funk"];
      ImU32 tc = funk ? rgb(0xA3141B) : rgb(fb::SCHWARZ);
      ImU32 tc2 = funk ? rgb(0xA3141B) : rgb(0x3A4150);
      kastenAuf(farbe(x["f"].t(), rgb(fb::GRAU)), 10, 7, 9, x["ich"] ? rgb(fb::BLAU) : 0);
      ImVec2 p = ImGui::GetCursorScreenPos();
      float W = breite();
      std::string s = x["s"].t();
      ImVec2 ss = textGroesse(fG, s);
      std::string eta = x["eta"].t();
      float etaW = eta.empty() ? 0 : textGroesse(fM, eta).x + 16 + 8;
      ImGui::SetCursorScreenPos(ImVec2(p.x + 32, p.y));
      ImGui::BeginGroup();
      ImVec2 q = ImGui::GetCursorScreenPos();
      std::string ruf = x["ruf"].t();
      textAn(ImGui::GetWindowDrawList(), fF, q, tc, ruf);
      textAn(ImGui::GetWindowDrawList(), fM, ImVec2(q.x + textGroesse(fF, ruf).x + 5, q.y + 1), tc2, x["typ"].t());
      luecke(gr(fF) + 2);
      ImGui::GetWindowDrawList()->PushClipRect(ImGui::GetCursorScreenPos(), ImVec2(p.x + W - etaW, ImGui::GetCursorScreenPos().y + 30), true);
      textAn(ImGui::GetWindowDrawList(), fK, ImGui::GetCursorScreenPos(), tc2, x["txt"].t());
      ImGui::GetWindowDrawList()->PopClipRect();
      luecke(gr(fK) + 2);
      ImGui::EndGroup();
      float mitte = (ImGui::GetItemRectMin().y + ImGui::GetItemRectMax().y) / 2;
      ImDrawList* d2 = ImGui::GetWindowDrawList();
      textAn(d2, fG, ImVec2(p.x + 12 - ss.x / 2, mitte - ss.y / 2), tc, s);
      if (!eta.empty()) {
        ImVec2 es = textGroesse(fM, eta);
        ImVec2 e0(p.x + W - es.x - 16, mitte - es.y / 2 - 2);
        d2->AddRectFilled(e0, ImVec2(e0.x + es.x + 16, e0.y + es.y + 4), IM_COL32(255, 255, 255, 153), 99);
        textAn(d2, fM, ImVec2(e0.x + 8, e0.y + 2), rgb(0x174EA6), eta);
      }
      kastenZu();
      luecke(6);
    }
    abZu();
  }
  if (gs.art != Json::Objekt) {
    abAuf(false);
    const Json& a = t["abf"];
    lbl("Abfrage", a.size() ? "\xC2\xB7 " + std::to_string(a.size()) + " beantwortet" : "");
    if (a.size()) {
      kastenAuf(rgb(fb::KARTE), 10, 2, 10);
      for (size_t i = 0; i < a.size(); i++) {
        ImVec2 p = ImGui::GetCursorScreenPos();
        if (i) ImGui::GetWindowDrawList()->AddLine(p, ImVec2(p.x + breite(), p.y), rgb(fb::LINIE));
        luecke(7);
        if (a[i]["f"]) text(fK, rgb(fb::GRAU), a[i]["f"].t());
        text(fM, rgb(fb::TEXT), a[i]["a"].t());
        luecke(7);
      }
      kastenZu();
    } else {
      kastenAuf(rgb(fb::KARTE), 11, 9, 9);
      text(fN, rgb(fb::TEXT2), "Keine Notrufabfrage zu diesem Einsatz.");
      kastenZu();
    }
    abZu();
  }
}

// ------------------------------------------------------------------ Patient
static const unsigned PUNKT[] = {fb::GRUEN, fb::GELB, fb::ROT};

static std::string sichtRoemisch(const std::string& s) {
  if (s == "rot") return "I";
  if (s == "gelb") return "II";
  if (s == "gr\xC3\xBCn") return "III";
  if (s == "tot") return "\xE2\x80\x93";
  return "";
}

static std::string kleinGeschrieben(std::string s) {
  for (auto& c : s) c = (char)tolower((unsigned char)c);
  return s;
}

static bool istEmpfehlung(const std::string& t) {
  std::string k = kleinGeschrieben(t);
  for (const char* w : {"transport", "klinik", "stroke", "herzkatheter", "schockraum", "krankenhaus"})
    if (k.find(w) != std::string::npos) return true;
  return false;
}

static void punktZeile(const std::string& t, ImU32 c) {
  ImVec2 p = ImGui::GetCursorScreenPos();
  luecke(6);
  ImVec2 q = ImGui::GetCursorScreenPos();
  ImGui::GetWindowDrawList()->AddCircleFilled(ImVec2(q.x + 6, q.y + gr(fN) / 2 + 1), 3, rgb(fb::GRAU), 12);
  ImGui::SetCursorScreenPos(ImVec2(q.x + 18, q.y));
  text(fN, c, t, breite() - 18);
  luecke(6);
  (void)p;
}

static void patientZeichnen(const Json& t) {
  if (!t["pat"]) {
    abAuf(false);
    kastenAuf(rgb(fb::KARTE), 11, 9, 9);
    text(fN, rgb(fb::TEXT2), t["patZu"] ? t["patZu"].t() : "Was der Patient hat, siehst du, sobald ihr beim Patienten seid.");
    kastenZu();
    abZu();
    return;
  }
  const Json& p = t["pat"];
  const Json& l = p["liste"];
  for (size_t i = 0; i < l.size(); i++) {
    const Json& x = l[i];
    abAuf();
    ImVec2 p0 = ImGui::GetCursorScreenPos();
    float W = breite();
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImDrawListSplitter sp;
    sp.Split(dl, 2);
    sp.SetCurrentChannel(dl, 1);
    // Band mit Sichtung
    ImU32 bandC = farbe(x["sf"].t(), rgb(fb::DUNKELGRAU));
    ImU32 bandT = farbe(x["sc"].t(), IM_COL32_WHITE);
    float bandH = 34;
    std::string ro = sichtRoemisch(x["s"].t());
    float bx = p0.x + 12;
    if (!ro.empty() || true) {
      ImVec2 rs = textGroesse(fF, ro);
      float bw = std::max(28.f, rs.x + 12);
      dl->AddRectFilled(ImVec2(bx, p0.y + 7), ImVec2(bx + bw, p0.y + 27), IM_COL32(0, 0, 0, 41), 5);
      textAn(dl, fF, ImVec2(bx + (bw - rs.x) / 2, p0.y + 9), bandT, ro);
      bx += bw + 8;
    }
    textAn(dl, fF, ImVec2(bx, p0.y + 10), bandT, gross("Sichtung " + x["s"].t()));
    std::string nr = x["nr"] ? x["nr"].t() : (l.size() > 1 ? "Patient " + std::to_string(i + 1) : "");
    if (!nr.empty()) {
      ImVec2 ns = textGroesse(fM, nr);
      textAn(dl, fM, ImVec2(p0.x + W - 12 - ns.x, p0.y + 10), bandT, nr);
    }
    ImGui::SetCursorScreenPos(ImVec2(p0.x, p0.y + bandH));
    kastenAuf(0, 12, 12, 0, 0, W);
    text(fGG, rgb(fb::TEXT), x["wer"] ? x["wer"].t() : x["t"].t());
    if (x["rolle"]) { luecke(2); text(fK, rgb(fb::GRAU), x["rolle"].t()); }
    auto vd = [&](const char* titel, const std::string& w) {
      luecke(10);
      kastenAuf(rgb(fb::KARTE2), 11, 9, 9);
      text(fKF, rgb(fb::GRAU), gross(titel));
      luecke(2);
      text(fG, rgb(fb::TEXT), w);
      kastenZu();
    };
    if (x["muster"]) vd("Verletzungsmuster / Krankheitsbild", x["muster"].t());
    if (x["vd"]) vd("Verdacht", x["vd"].t());
    const Json& vit = x["vit"];
    if (vit.size()) {
      luecke(10);
      float w2 = (breite() - 8) / 2;
      for (size_t j = 0; j < vit.size(); j++) {
        if (j % 2) ImGui::SameLine(0, 8);
        else if (j) luecke(8);
        kastenAuf(rgb(fb::KARTE2), 11, 9, 9, 0, w2);
        text(fKF, rgb(fb::GRAU), gross(vit[j]["k"].t()));
        luecke(2);
        ImVec2 q = ImGui::GetCursorScreenPos();
        int g = std::max(0, std::min(2, (int)vit[j]["g"].z()));
        ImGui::GetWindowDrawList()->AddCircleFilled(ImVec2(q.x + 4.5f, q.y + gr(fF) / 2 + 1), 4.5f, rgb(PUNKT[g]), 12);
        ImGui::SetCursorScreenPos(ImVec2(q.x + 16, q.y));
        text(fF, rgb(fb::TEXT), vit[j]["w"].t(), breite() - 16);
        kastenZu();
      }
    }
    // Lagebild: Befund und Empfehlung
    std::vector<std::string> bef, empf;
    std::string lage = x["lage"].t();
    size_t a = 0;
    while (a <= lage.size()) {
      size_t b = lage.find(',', a);
      if (b == std::string::npos) b = lage.size();
      std::string tx = lage.substr(a, b - a);
      size_t s0 = tx.find_first_not_of(" \t"), s1 = tx.find_last_not_of(" \t");
      a = b + 1;
      if (s0 == std::string::npos) continue;
      tx = tx.substr(s0, s1 - s0 + 1);
      bool doppelt = false;
      for (size_t v = 0; v < vit.size(); v++)
        if (kleinGeschrieben(tx) == kleinGeschrieben(vit[v]["w"].t())) doppelt = true;
      if (doppelt) continue;
      if (!tx.empty() && tx[0] >= 'a' && tx[0] <= 'z') tx[0] = (char)(tx[0] - 32);
      (istEmpfehlung(tx) ? empf : bef).push_back(tx);
    }
    if (!bef.empty()) {
      luecke(12);
      text(fKF, rgb(fb::GRAU), "BEFUND");
      luecke(2);
      for (size_t j = 0; j < bef.size(); j++) {
        if (j) { ImVec2 q = ImGui::GetCursorScreenPos(); ImGui::GetWindowDrawList()->AddLine(q, ImVec2(q.x + breite(), q.y), rgb(fb::KARTE2)); }
        punktZeile(bef[j], rgb(fb::TEXT3));
      }
    }
    auto empfKasten = [&](const char* titel, const std::string& w) {
      luecke(10);
      kastenAuf(rgb(fb::BLAU, 0.14f), 12, 10, 9, rgb(fb::BLAU, 0.35f));
      text(fKF, rgb(fb::HELLBLAU), gross(titel));
      luecke(2);
      text(fM, rgb(fb::BLAUTEXT), w);
      kastenZu();
    };
    if (!empf.empty()) {
      std::string e;
      for (size_t j = 0; j < empf.size(); j++) e += (j ? " \xC2\xB7 " : "") + empf[j];
      empfKasten("Empfehlung", e);
    }
    const Json& fk = x["fakt"];
    if (fk.size()) {
      luecke(12);
      text(fKF, rgb(fb::GRAU), "VOR ORT FESTGESTELLT");
      luecke(2);
      for (size_t j = 0; j < fk.size(); j++) {
        if (j) { ImVec2 q = ImGui::GetCursorScreenPos(); ImGui::GetWindowDrawList()->AddLine(q, ImVec2(q.x + breite(), q.y), rgb(fb::KARTE2)); }
        luecke(7);
        text(fK, rgb(fb::GRAU), fk[j]["k"].t());
        luecke(1);
        text(fM, fk[j]["c"].t() == "w" ? rgb(fb::GELBTEXT) : rgb(fb::TEXT), fk[j]["w"].t());
        luecke(7);
      }
    }
    auto warn = [&](const std::string& w) {
      luecke(10);
      kastenAuf(rgb(fb::WARN), 11, 9, 9);
      text(fM, rgb(fb::GELBTEXT), w);
      kastenZu();
    };
    if (x["fw"]) warn("Erst nach Befreiung bzw. Rettung durch die Feuerwehr erreichbar");
    if (x["bit"]) warn("Sehr schwer (ca. 150 kg+) \xE2\x80\x93 Transport braucht BIT");
    if (x["versorgt"]) empfKasten("Versorgung", x["versorgt"].t());
    kastenZu();
    float unten = ImGui::GetItemRectMax().y;
    sp.SetCurrentChannel(dl, 0);
    dl->AddRectFilled(p0, ImVec2(p0.x + W, unten), rgb(fb::KARTE), 12);
    dl->AddRectFilled(p0, ImVec2(p0.x + W, p0.y + bandH), bandC, 12, ImDrawFlags_RoundCornersTop);
    sp.Merge(dl);
    ImGui::SetCursorScreenPos(p0);
    ImGui::Dummy(ImVec2(W, unten - p0.y));
    abZu();
  }
  if (!l.size()) {
    abAuf();
    kastenAuf(rgb(fb::KARTE), 12, 12, 12);
    text(fGG, rgb(fb::TEXT), p["verdacht"] ? "Verdacht: " + p["verdacht"].t() : "Keine weiteren Angaben");
    kastenZu();
    abZu();
  }
  // Zielort
  abAuf();
  lbl("Zielort");
  {
    kastenAuf(rgb(fb::KARTE), 12, 10, 10);
    ImVec2 p0 = ImGui::GetCursorScreenPos();
    float W = breite();
    std::string bt = t["plan"] ? "\xC3\x84ndern" : "Zielort buchen";
    float bw = textGroesse(fF, bt).x + 24;
    text(fM, rgb(fb::TEXT), t["plan"] ? t["plan"].t() : "Noch nicht entschieden", W - bw - 10);
    text(fK, rgb(fb::GRAU), t["plan"] ? "gebucht" : "Transport und Krankenhaus festlegen", W - bw - 10);
    float h = ImGui::GetItemRectMax().y - p0.y;
    ImGui::SetCursorScreenPos(ImVec2(p0.x + W - bw, p0.y + std::max(0.f, (h - 34) / 2)));
    bool da = (bool)t["buchenDa"];
    if (knopf("##patbuchen", bt, "", da ? rgb(fb::BLAU) : rgb(fb::AUS), da ? rgb(fb::SCHWARZ) : rgb(fb::DUNKELGRAU), bw, 34, fF, !da, 0, 8)) blattArt = "buchen";
    ImGui::SetCursorScreenPos(ImVec2(p0.x, p0.y + std::max(h, 34.f)));
    ImGui::Dummy(ImVec2(1, 0));
    kastenZu();
  }
  abZu();
  if (p["meldung"]) {
    abAuf();
    lbl("Notruf");
    ImVec2 q = ImGui::GetCursorScreenPos();
    ImGui::SetCursorScreenPos(ImVec2(q.x + 12, q.y + 9));
    text(fN, rgb(fb::TEXT2), "\xE2\x80\x9E" + p["meldung"].t() + "\xE2\x80\x9C", breite() - 24);
    float u = ImGui::GetItemRectMax().y + 9;
    ImGui::GetWindowDrawList()->AddRectFilled(q, ImVec2(q.x + 3, u), rgb(0x3A4150));
    ImGui::SetCursorScreenPos(ImVec2(q.x, u));
    ImGui::Dummy(ImVec2(1, 0));
    abZu();
  }
  const Json& vl = p["verlauf"];
  if (vl.size()) {
    abAuf(false);
    lbl("Verlauf");
    for (int i = (int)vl.size() - 1; i >= 0; i--) {
      ImVec2 q = ImGui::GetCursorScreenPos();
      ImGui::SetCursorScreenPos(ImVec2(q.x + 22, q.y));
      text(fM, rgb(fb::GRAU), vl[i]["z"].t(), breite() - 22);
      text(fN, rgb(fb::TEXT2), vl[i]["t"].t(), breite() - 22);
      float u = ImGui::GetItemRectMax().y;
      ImDrawList* dl = ImGui::GetWindowDrawList();
      if (i > 0) dl->AddRectFilled(ImVec2(q.x + 7, q.y + 15), ImVec2(q.x + 9, u + 12), rgb(fb::RAND));
      dl->AddCircleFilled(ImVec2(q.x + 8, q.y + 9), 4, rgb(fb::BLAU), 12);
      ImGui::SetCursorScreenPos(ImVec2(q.x, u + 12));
      ImGui::Dummy(ImVec2(1, 0));
    }
    abZu();
  }
}

// ------------------------------------------------------------------ Blätter: Status, Buchen
static void statusZeichnen() {
  const Json& kn = stand["knoepfe"];
  float W = breite();
  float w = (W - 16) / 3;
  for (size_t i = 0; i < kn.size(); i++) {
    if (i % 3) ImGui::SameLine(0, 8);
    else if (i) luecke(8);
    ImU32 f = farbe(kn[i]["farbe"].t(), rgb(fb::RAND));
    bool aktiv = (bool)kn[i]["aktiv"];
    ImVec2 p = ImGui::GetCursorScreenPos();
    std::string id = "##st" + std::to_string(i);
    bool k = knopfRoh(id.c_str(), ImVec2(w, 70));
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImU32 bg = aktiv ? f : rgb(0x1E2129);
    if (ImGui::IsItemActive() && !gezogen) bg = aktiv ? heller(f, 1.15f) : rgb(fb::KARTE2);
    dl->AddRectFilled(p, ImVec2(p.x + w, p.y + 70), bg, 10);
    dl->AddRect(p, ImVec2(p.x + w, p.y + 70), f, 10, 0, 2);
    ImU32 tc = aktiv ? rgb(fb::SCHWARZ) : rgb(fb::TEXT);
    std::string n = kn[i]["nummer"].t(), name = kn[i]["name"].t();
    ImVec2 ns = textGroesse(fT, n);
    textAn(dl, fT, ImVec2(p.x + (w - ns.x) / 2, p.y + 8), tc, n);
    ImVec2 ms = textGroesse(fF, name, w - 8);
    dl->PushClipRect(p, ImVec2(p.x + w, p.y + 70), true);
    float yy = p.y + 42;
    const char* s = name.c_str();
    const char* e = s + name.size();
    while (s < e) {
      const char* ze = fF->CalcWordWrapPositionA(gr(fF) / fF->FontSize, s, e, w - 8);
      if (ze == s) ze = s + 1;
      std::string z(s, ze);
      ImVec2 zs = textGroesse(fF, z);
      dl->AddText(fF, gr(fF), ImVec2(p.x + (w - zs.x) / 2, yy), tc, z.c_str());
      yy += gr(fF) * 1.15f;
      s = ze;
      while (s < e && *s == ' ') s++;
    }
    (void)ms;
    dl->PopClipRect();
    if (k) {
      senden(kn[i]["aktion"].t());
      blattArt = "";
    }
  }
  luecke(8);
}

static void suchFeld(const std::string& symQ) {
  if (!suchTextGesetzt) {
    suchText = symQ;
    suchTextGesetzt = true;
  }
  float W = breite();
  if (suchScrollen) {
    // Feld nach oben holen, damit die Vorschläge über der Tastatur Platz haben
    ImGui::SetScrollHereY(0.05f);
    suchScrollen = false;
  }
  ImVec2 p = ImGui::GetCursorScreenPos();
  bool k = knopfRoh("##such", ImVec2(W, 42));
  ImDrawList* dl = ImGui::GetWindowDrawList();
  dl->AddRectFilled(p, ImVec2(p.x + W, p.y + 42), rgb(fb::SCHWARZ), suchAktiv ? 0 : 8, suchAktiv ? 0 : ImDrawFlags_RoundCornersAll);
  dl->AddRect(p, ImVec2(p.x + W, p.y + 42), suchAktiv ? rgb(fb::BLAU) : rgb(fb::RAND), suchAktiv ? 0 : 8, 0, 1.5f);
  if (suchText.empty() && !suchAktiv) textAn(dl, fN, ImVec2(p.x + 10, p.y + 12), rgb(fb::DUNKELGRAU), "Symptom suchen \xE2\x80\xA6");
  else {
    textAn(dl, fN, ImVec2(p.x + 10, p.y + 12), rgb(fb::TEXT), suchText);
    if (suchAktiv && fmod(jetzt, 1.0) < 0.6) {
      float x = p.x + 11 + textGroesse(fN, suchText).x;
      dl->AddLine(ImVec2(x, p.y + 10), ImVec2(x, p.y + 32), rgb(fb::BLAU), 1.5f);
    }
  }
  if (k && !suchAktiv) {
    suchAktiv = true;
    suchScrollen = true;
  }
}

static void buchenZeichnen() {
  const Json& b = stand["neu"]["ent"];
  if (b.art != Json::Objekt) {
    kastenAuf(rgb(fb::KARTE), 11, 9, 9);
    text(fN, rgb(fb::TEXT2), "Buchen geht, sobald ihr beim Patienten seid.");
    kastenZu();
    return;
  }
  const Json& khs = b["khs"];
  if (khFuer != b["fuer"].t()) {
    khFuer = b["fuer"].t();
    khWahl.clear();
    selbstBuchen = false;
    suchTextGesetzt = false;
  }
  bool gefunden = false;
  for (size_t i = 0; i < khs.size(); i++)
    if (khs[i]["id"].t() == khWahl) gefunden = true;
  if (!gefunden) {
    khWahl.clear();
    for (size_t i = 0; i < khs.size(); i++)
      if (khs[i]["id"].t() == b["gebuchtId"].t() && b["gebuchtId"]) khWahl = b["gebuchtId"].t();
    if (khWahl.empty() && khs.size()) khWahl = khs[0]["id"].t();
  }
  lbl("Was passiert mit dem Patienten?");
  {
    std::vector<Wahl> ws;
    const Json& w = b["wahl"];
    for (size_t i = 0; i < w.size(); i++) ws.push_back({w[i]["id"].t(), w[i]["t"].t(), w[i]["d"].t(), (bool)w[i]["on"], false});
    int k = wahlReihe(ws, 2, "##wahl");
    if (k >= 0) senden("bu:seite:" + ws[k].id);
  }
  if (b["keinWahl"].size()) {
    std::vector<Wahl> ws;
    const Json& w = b["keinWahl"];
    for (size_t i = 0; i < w.size(); i++) ws.push_back({w[i]["id"].t(), w[i]["t"].t(), w[i]["s"].t(), (bool)w[i]["on"], false});
    int k = wahlReihe(ws, 3, "##kein");
    if (k >= 0) {
      frage = {ws[k].t + " \xE2\x80\x93 so an die Leitstelle melden?", "Melden", "bu:kein:" + ws[k].id};
      frageOffen = true;
    }
  }
  if (b["rtwFehlt"]) {
    kastenAuf(rgb(fb::KARTE), 11, 9, 9);
    text(fN, rgb(fb::TEXT2), "Noch kein RTW im Einsatz \xE2\x80\x93 bitte bei der Leitstelle anfordern.");
    kastenZu();
    luecke(8);
  }
  bool zeigSchritte = (bool)b["buchen"];
  if (b["rtwWahl"].art == Json::Objekt) {
    luecke(6);
    lbl("Wer bucht das Krankenhaus?");
    bool on = (bool)b["rtwWahl"]["on"];
    std::vector<Wahl> ws = {{"rtw", "\xC3\x9C" "bergeben \xE2\x80\x93 RTW bucht selbst", on ? "erledigt \xC2\xB7 RTW sucht das Krankenhaus" : "ihr seid danach frei", on, false},
                            {"selbst", "Selbst buchen", "Krankenhaus f\xC3\xBCr den RTW w\xC3\xA4hlen", selbstBuchen || b["gebuchtId"], false}};
    int k = wahlReihe(ws, 2, "##rtw");
    if (k == 0) senden("bu:rtwbucht");
    if (k == 1) selbstBuchen = true;
    zeigSchritte = b["buchen"] && (selbstBuchen || b["gebuchtId"]);
  }
  if (zeigSchritte) {
    luecke(8);
    {
      ImVec2 p = ImGui::GetCursorScreenPos();
      lbl("Krankenhaus");
      if (b["gebuchtId"]) pille(ImGui::GetWindowDrawList(), ImVec2(p.x + textGroesse(fKF, "KRANKENHAUS").x + 8, p.y - 3), "gebucht " + b["gebuchtT"].t(), fb::GRUEN);
    }
    const Json& sch = b["schritte"];
    for (size_t i = 0; i < sch.size(); i++) {
      const Json& k = sch[i];
      std::string idx = std::to_string(i);
      if (k["fertig"]) {
        kastenAuf(rgb(fb::KARTE), 10, 7, 9);
        ImVec2 p = ImGui::GetCursorScreenPos();
        float W = breite();
        std::string an = "\xC3\x84ndern";
        float aw = textGroesse(fM, an).x + 22;
        haken(ImGui::GetWindowDrawList(), ImVec2(p.x + 1, p.y + 9), 13, rgb(fb::GRUEN));
        ImGui::SetCursorScreenPos(ImVec2(p.x + 22, p.y));
        ImGui::BeginGroup();
        text(fKF, rgb(fb::GRAU), gross(k["titel"].t()), W - 22 - aw - 8);
        text(fN, rgb(fb::TEXT), k["wert"].t(), W - 22 - aw - 8);
        ImGui::EndGroup();
        float h = ImGui::GetItemRectSize().y;
        ImGui::SetCursorScreenPos(ImVec2(p.x + W - aw, p.y + std::max(0.f, (h - 30) / 2)));
        if (kn(("##aendern" + idx).c_str(), an)) senden("bu:schritt:" + k["nr"].t());
        ImGui::SetCursorScreenPos(ImVec2(p.x, p.y + std::max(h, 30.f)));
        ImGui::Dummy(ImVec2(1, 0));
        kastenZu();
        luecke(6);
      } else if (k["offen"]) {
        ImVec2 p = ImGui::GetCursorScreenPos();
        ImDrawList* dl = ImGui::GetWindowDrawList();
        dl->AddRectFilled(ImVec2(p.x + 10, p.y + 7), ImVec2(p.x + 32, p.y + 29), rgb(fb::AUS), 6);
        std::string nr = k["nr"].t();
        ImVec2 ns = textGroesse(fF, nr);
        textAn(dl, fF, ImVec2(p.x + 21 - ns.x / 2, p.y + 18 - ns.y / 2), rgb(fb::DUNKELGRAU), nr);
        ImGui::SetCursorScreenPos(ImVec2(p.x + 40, p.y + 9));
        text(fN, rgb(fb::DUNKELGRAU), k["titel"].t(), breite() - 40);
        luecke(8);
      } else {
        {
          luecke(4);
          ImVec2 p = ImGui::GetCursorScreenPos();
          ImDrawList* dl = ImGui::GetWindowDrawList();
          dl->AddRectFilled(p, ImVec2(p.x + 22, p.y + 22), rgb(fb::BLAU), 6);
          std::string nr = k["nr"].t();
          ImVec2 ns = textGroesse(fF, nr);
          textAn(dl, fF, ImVec2(p.x + 11 - ns.x / 2, p.y + 11 - ns.y / 2), rgb(fb::SCHWARZ), nr);
          ImGui::SetCursorScreenPos(ImVec2(p.x + 30, p.y + 3));
          text(fF, rgb(fb::TEXT), k["frage"].t(), breite() - 30);
          luecke(8);
        }
        if (k["istAlter"]) {
          std::vector<Wahl> ws;
          const Json& w = b["altW"];
          for (size_t j = 0; j < w.size(); j++) ws.push_back({w[j]["id"].t(), w[j]["t"].t(), w[j]["s"].t(), (bool)w[j]["on"], false});
          int c = wahlReihe(ws, 3, ("##alt" + idx).c_str());
          if (c >= 0) senden("bu:alter:" + ws[c].id);
        }
        if (k["istDringlich"]) {
          std::vector<Wahl> ws;
          const Json& w = b["drW"];
          for (size_t j = 0; j < w.size(); j++) ws.push_back({w[j]["id"].t(), w[j]["t"].t(), w[j]["s"].t(), (bool)w[j]["on"], (bool)w[j]["aus"]});
          int c = wahlReihe(ws, 3, ("##dr" + idx).c_str());
          if (c >= 0) senden("bu:dring:" + ws[c].id);
        }
        if (k["istSymptom"]) {
          suchFeld(b["symQ"].t());
          if (suchAktiv) {
            // Vorschläge (Liste unter dem Feld)
            float W = breite();
            ImVec2 p0 = ImGui::GetCursorScreenPos();
            ImDrawListSplitter sp;
            ImDrawList* dl = ImGui::GetWindowDrawList();
            sp.Split(dl, 2);
            sp.SetCurrentChannel(dl, 1);
            ImGui::BeginGroup();
            if (b["symHinweis"]) {
              ImGui::SetCursorScreenPos(ImVec2(p0.x + 12, p0.y + 7));
              text(fKF, rgb(fb::GRAU), gross(b["symHinweis"].t()), W - 24);
              luecke(4);
            }
            const Json& sw = b["symW"];
            for (size_t j = 0; j < sw.size(); j++) {
              ImVec2 q = ImGui::GetCursorScreenPos();
              q.x = p0.x;
              ImGui::SetCursorScreenPos(q);
              std::string t = sw[j]["t"].t();
              float h = textGroesse(fN, t, W - 24).y + 20;
              bool c = knopfRoh(("##sym" + std::to_string(j)).c_str(), ImVec2(W, h));
              if (ImGui::IsItemActive() && !gezogen) dl->AddRectFilled(q, ImVec2(q.x + W, q.y + h), rgb(fb::BLAU, 0.16f));
              dl->AddLine(q, ImVec2(q.x + W, q.y), rgb(fb::RAND));
              textAn(dl, fN, ImVec2(q.x + 12, q.y + 10), rgb(fb::TEXT), t, W - 24);
              if (c) {
                senden("bu:sym:" + sw[j]["id"].t());
                suchAktiv = false;
              }
            }
            if (!sw.size() && !b["symHinweis"]) {
              ImGui::SetCursorScreenPos(ImVec2(p0.x + 12, ImGui::GetCursorScreenPos().y + 10));
              text(fN, rgb(fb::GRAU), "Kein Symptom gefunden.");
              luecke(10);
            }
            ImGui::EndGroup();
            float u = std::max(ImGui::GetItemRectMax().y, p0.y + 10);
            sp.SetCurrentChannel(dl, 0);
            dl->AddRectFilled(p0, ImVec2(p0.x + W, u), rgb(0x20242C), 9, ImDrawFlags_RoundCornersBottom);
            dl->AddRect(ImVec2(p0.x, p0.y - 1), ImVec2(p0.x + W, u), rgb(fb::BLAU), 9, ImDrawFlags_RoundCornersBottom, 1.5f);
            sp.Merge(dl);
            ImGui::SetCursorScreenPos(ImVec2(p0.x, u));
            ImGui::Dummy(ImVec2(W, 0));
          }
          luecke(8);
        }
        if (k["istVorschlag"]) {
          if (b["khLeer"]) {
            kastenAuf(rgb(fb::KARTE), 11, 9, 9);
            text(fN, rgb(fb::TEXT2), b["khLeer"].t());
            kastenZu();
            luecke(8);
          }
          const Json* gew = nullptr;
          for (size_t j = 0; j < khs.size(); j++) {
            const Json& x = khs[j];
            bool g = x["id"].t() == khWahl;
            if (g) gew = &x;
            float W = breite();
            ImVec2 p = ImGui::GetCursorScreenPos();
            // Inhalt messen: Name · km min, Merkmale
            ImDrawListSplitter sp;
            ImDrawList* dl = ImGui::GetWindowDrawList();
            sp.Split(dl, 2);
            sp.SetCurrentChannel(dl, 1);
            std::string frei = x["frei"].t();
            float freiW = frei.empty() ? 0 : textGroesse(fM, frei).x + 16 + 8;
            float tw = W - 22 - 26 - freiW;
            ImGui::SetCursorScreenPos(ImVec2(p.x + 37, p.y + 9));
            ImGui::BeginGroup();
            text(fF, rgb(fb::TEXT), x["n"].t() + "  \xC2\xB7 " + x["km"].t() + x["min"].t(), tw);
            const Json& m = x["merk"];
            if (m.size()) {
              luecke(3);
              float mx = 0;
              ImVec2 m0 = ImGui::GetCursorScreenPos();
              float my = 0;
              for (size_t q = 0; q < m.size(); q++) {
                std::string mt = m[q]["t"].t();
                ImVec2 ms = textGroesse(fK, mt);
                if (mx > 0 && mx + ms.x + 14 > tw) { mx = 0; my += ms.y + 8; }
                bool ok = m[q]["c"].t() == "ok";
                dl->AddRectFilled(ImVec2(m0.x + mx, m0.y + my), ImVec2(m0.x + mx + ms.x + 14, m0.y + my + ms.y + 4), ok ? rgb(fb::GRUEN, 0.12f) : rgb(0x20242A), 5);
                textAn(dl, fK, ImVec2(m0.x + mx + 7, m0.y + my + 2), ok ? rgb(fb::GRUEN) : rgb(fb::TEXT2), mt);
                mx += ms.x + 14 + 4;
                if (q + 1 == m.size()) my += ms.y + 4;
              }
              ImGui::Dummy(ImVec2(tw, my));
            }
            ImGui::EndGroup();
            float h = ImGui::GetItemRectMax().y + 9 - p.y;
            if (h < 44) h = 44;
            ImGui::SetCursorScreenPos(p);
            bool c = knopfRoh(("##kh" + std::to_string(j)).c_str(), ImVec2(W, h));
            sp.SetCurrentChannel(dl, 0);
            ImU32 bg = g ? rgb(fb::BLAU, 0.12f) : 0;
            if (ImGui::IsItemActive() && !gezogen) bg = rgb(fb::BLAU, 0.2f);
            if (bg) dl->AddRectFilled(p, ImVec2(p.x + W, p.y + h), bg, 10);
            dl->AddRect(p, ImVec2(p.x + W, p.y + h), g ? rgb(fb::BLAU) : rgb(fb::RAND), 10, 0, 1.5f);
            ImVec2 rc(p.x + 19, p.y + h / 2);
            dl->AddCircle(rc, 7, g ? rgb(fb::BLAU) : rgb(fb::GRAU), 20, 2);
            if (g) dl->AddCircleFilled(rc, 4, rgb(fb::BLAU), 16);
            sp.Merge(dl);
            if (!frei.empty()) {
              std::string fc = x["freiCls"].t();
              unsigned col = fc.find("rot") != std::string::npos ? fb::ROTTEXT : fc.find("gelb") != std::string::npos ? fb::GELBTEXT : fb::GRUEN;
              ImVec2 fs = textGroesse(fM, frei);
              pille(dl, ImVec2(p.x + W - 10 - fs.x - 16, p.y + h / 2 - fs.y / 2 - 2), frei, col, col == fb::GRUEN ? 0.12f : 0.1f);
            }
            if (c) khWahl = x["id"].t();
            ImGui::SetCursorScreenPos(ImVec2(p.x, p.y + h + 8));
            ImGui::Dummy(ImVec2(1, 0));
          }
          if (gew) {
            bool schon = b["gebuchtId"] && b["gebuchtId"].t() == (*gew)["id"].t();
            luecke(6);
            if (knopf("##khok", (*gew)["n"].t() + (schon ? " gebucht" : " buchen"), "", rgb(fb::BLAU), rgb(fb::SCHWARZ), breite(), 46, fF) && !schon)
              senden("bu:kh:" + (*gew)["id"].t());  // ohne Rückfrage buchen (Paul 10.11.2026)
          }
        }
      }
    }
  }
  if (frageOffen) {
    luecke(10);
    kastenAuf(rgb(0x20242A), 12, 12, 10);
    text(fN, rgb(fb::TEXT), frage.t);
    luecke(10);
    if (kn("##fja", frage.ja)) {
      senden(frage.befehl);
      frageOffen = false;
    }
    ImGui::SameLine(0, 6);
    if (kn("##fnein", "Abbrechen")) frageOffen = false;
    kastenZu();
  }
}

// ------------------------------------------------------------------ Bildschirmtastatur (VR)
static const char* REIHEN[] = {"1234567890", "qwertzuiop\xC3\xBC", "asdfghjkl\xC3\xB6\xC3\xA4", "yxcvbnm-\xC3\x9F"};

static float tastaturHoehe() { return 4 * 46 + 46 + 18; }

static void tastatur(ImVec2 p0, float W) {
  ImDrawList* dl = ImGui::GetWindowDrawList();
  float H = tastaturHoehe();
  dl->AddRectFilled(p0, ImVec2(p0.x + W, p0.y + H), rgb(0x15171C));
  dl->AddLine(p0, ImVec2(p0.x + W, p0.y), rgb(fb::LINIE));
  float y = p0.y + 8;
  for (int r = 0; r < 4; r++) {
    // Zeichen der Reihe (UTF-8)
    std::vector<std::string> z;
    const char* s = REIHEN[r];
    while (*s) {
      int n = ((unsigned char)*s >= 0xC0) ? 2 : 1;
      z.emplace_back(s, n);
      s += n;
    }
    size_t spalten = 11;
    float kw = (W - 12 - (spalten - 1) * 4) / spalten;
    float x = p0.x + 6 + (spalten - z.size() - (r == 3 ? 1.5f : 0)) * (kw + 4) / 2;
    for (size_t i = 0; i < z.size(); i++) {
      ImGui::SetCursorScreenPos(ImVec2(x, y));
      std::string zeig = r == 0 ? z[i] : gross(z[i]);
      if (z[i] == "\xC3\x9F") zeig = z[i];
      if (knopf(("##t" + std::to_string(r) + "_" + std::to_string(i)).c_str(), zeig, "", rgb(fb::KARTE2), rgb(fb::TEXT), kw, 40, fG, false, 0, 7)) tasteText(z[i]);
      x += kw + 4;
    }
    if (r == 3) {
      ImGui::SetCursorScreenPos(ImVec2(x, y));
      if (knopf("##zur", "\xE2\x86\x90", "", rgb(fb::RAND), rgb(fb::TEXT), kw * 1.5f + 4, 40, fG, false, 0, 7)) tasteZurueck();
    }
    y += 46;
  }
  float bw = W - 12;
  ImGui::SetCursorScreenPos(ImVec2(p0.x + 6, y));
  if (knopf("##leer", "Leerzeichen", "", rgb(fb::KARTE2), rgb(fb::TEXT2), bw * 0.48f, 40, fM, false, 0, 7)) tasteText(" ");
  ImGui::SameLine(0, bw * 0.04f);
  if (knopf("##fertig", "Fertig", "", rgb(fb::BLAU), rgb(fb::SCHWARZ), bw * 0.48f, 40, fF, false, 0, 7)) tasteFertig();
}

bool willTasten() { return suchAktiv && blattArt == "buchen"; }

void tasteText(const std::string& u) {
  suchText += u;
  suchSendenUm = jetzt + 0.25;
}

void tasteZurueck() {
  if (suchText.empty()) return;
  size_t i = suchText.size() - 1;
  while (i > 0 && ((unsigned char)suchText[i] & 0xC0) == 0x80) i--;
  suchText.erase(i);
  suchSendenUm = jetzt + 0.25;
}

void tasteFertig() {
  suchAktiv = false;
  if (suchSendenUm) {
    senden("bu:q:" + suchText);
    suchSendenUm = 0;
  }
}

void buchenOeffnen() {
  const Json& t = stand["neu"]["tab"];
  if (t["buchenDa"]) {
    blattArt = "buchen";
    navAuf = false;
  }
}
void statusOeffnen() { blattArt = "status"; }
void kartenOeffnen() { navOeffnen(); }

// ------------------------------------------------------------------ Leer, Navigation
static void leerZeichnen(float W, float top, float H, const std::string& t1, const std::string& t2, const Json* st) {
  ImDrawList* dl = ImGui::GetWindowDrawList();
  ImVec2 wp = ImGui::GetWindowPos();
  float h = gr(fT) + 6 + textGroesse(fN, t2, W - 40).y + (st ? 18 + 30 : 0);
  float y = wp.y + top + (H - top - h) / 2;
  ImVec2 s1 = textGroesse(fT, t1);
  textAn(dl, fT, ImVec2(wp.x + (W - s1.x) / 2, y), rgb(fb::TEXT), t1);
  y += gr(fT) + 6;
  ImGui::SetCursorScreenPos(ImVec2(wp.x + 20, y));
  // mittig umbrochen
  const char* s = t2.c_str();
  const char* e = s + t2.size();
  while (s < e) {
    const char* ze = fN->CalcWordWrapPositionA(gr(fN) / fN->FontSize, s, e, W - 40);
    if (ze == s) ze = s + 1;
    std::string z(s, ze);
    ImVec2 zs = textGroesse(fN, z);
    textAn(dl, fN, ImVec2(wp.x + (W - zs.x) / 2, y), rgb(fb::GRAU), z);
    y += gr(fN) * 1.3f;
    s = ze;
    while (s < e && *s == ' ') s++;
  }
  if (st) {
    y += 18;
    std::string n = (*st)["n"].t(), tt = (*st)["t"].t();
    ImVec2 ns = textGroesse(fG, n), ts = textGroesse(fF, tt);
    float bw = 6 + ns.x + 16 + 8 + ts.x + 14;
    ImVec2 b0(wp.x + (W - bw) / 2, y);
    dl->AddRectFilled(b0, ImVec2(b0.x + bw, b0.y + 32), farbe((*st)["f"].t(), rgb(fb::GRAU)), 9);
    dl->AddRectFilled(ImVec2(b0.x + 6, b0.y + 5), ImVec2(b0.x + 6 + ns.x + 16, b0.y + 27), IM_COL32(0, 0, 0, 31), 6);
    textAn(dl, fG, ImVec2(b0.x + 14, b0.y + 16 - ns.y / 2), rgb(fb::SCHWARZ), n);
    textAn(dl, fF, ImVec2(b0.x + 6 + ns.x + 16 + 8, b0.y + 16 - ts.y / 2), rgb(fb::SCHWARZ), tt);
  }
}

static void navZeichnen(float W, float H, const Json& t) {
  ImDrawList* dl = ImGui::GetWindowDrawList();
  ImVec2 wp = ImGui::GetWindowPos();
  float top = 56;
  const Json& k = t["karte"];
  // Kopfzeile der Navigation
  dl->AddRectFilled(ImVec2(wp.x, wp.y + top), ImVec2(wp.x + W, wp.y + top + 52), rgb(fb::KOPF));
  dl->AddLine(ImVec2(wp.x, wp.y + top + 51.5f), ImVec2(wp.x + W, wp.y + top + 51.5f), rgb(fb::LINIE));
  auto nk = [&](const char* id, const std::string& tt, bool on, float x) {
    float w = textGroesse(fM, tt).x + 22;
    ImGui::SetCursorScreenPos(ImVec2(x, wp.y + top + 10));
    bool c = knopf(id, tt, "", on ? rgb(fb::BLAU) : rgb(fb::KARTE), on ? rgb(fb::SCHWARZ) : rgb(fb::TEXT), w, 32, fM, false, on ? rgb(fb::BLAU) : rgb(fb::RAND), 8);
    return std::make_pair(c, w);
  };
  float x = wp.x + 10;
  auto z = nk("##navzu", "\xE2\x80\xB9 Zur\xC3\xBC" "ck", false, x);
  if (z.first) navAuf = false;
  x += z.second + 8;
  float rx = wp.x + W - 10;
  float wF = textGroesse(fM, "Folgen").x + 22, wA = textGroesse(fM, "Alle Fahrzeuge").x + 22;
  if (nk("##folgen", "Folgen", grosseKarte.folgen, rx - wF).first) grosseKarte.folgen = true;
  if (nk("##alle", "Alle Fahrzeuge", (bool)k["alle"], rx - wF - 6 - wA).first) senden(std::string("ka:alle:") + (k["alle"] ? "0" : "1"));
  std::string titel = k["ziel"].art == Json::Objekt ? "Ziel: " + k["ziel"]["t"].t() : "Navigation";
  float tw = rx - wF - 6 - wA - 8 - x;
  dl->PushClipRect(ImVec2(x, wp.y + top), ImVec2(x + std::max(0.f, tw), wp.y + top + 52), true);
  textAn(dl, fF, ImVec2(x, wp.y + top + 26 - gr(fF) / 2), rgb(fb::TEXT), titel);
  dl->PopClipRect();
  // Karte
  ImVec2 p0(wp.x, wp.y + top + 52);
  ImVec2 g(W, H - top - 52);
  ImGui::SetCursorScreenPos(p0);
  ImGui::InvisibleButton("##grossekarte", g);
  if (ImGui::IsItemActive() && ImGui::IsMouseDragging(0, 3)) {
    ImVec2 d = ImGui::GetIO().MouseDelta;
    if (d.x || d.y) {
      grosseKarte.folgen = false;
      karte::schieben(grosseKarte, d.x, d.y);
    }
  }
  if (ImGui::IsItemHovered() && ImGui::GetIO().MouseWheel != 0) karte::zoom(grosseKarte, ImGui::GetIO().MouseWheel > 0 ? 1 : -1);
  karte::zeichnen(grosseKarte, p0, g, k, false, fK, fF);
  ImGui::SetCursorScreenPos(ImVec2(wp.x + W - 54, p0.y + 12));
  if (knopf("##zplus", "+", "", IM_COL32(17, 18, 22, 225), rgb(fb::TEXT), 44, 44, fGG, false, 0, 9)) karte::zoom(grosseKarte, 1);
  ImGui::SetCursorScreenPos(ImVec2(wp.x + W - 54, p0.y + 62));
  if (knopf("##zminus", "\xE2\x88\x92", "", IM_COL32(17, 18, 22, 225), rgb(fb::TEXT), 44, 44, fGG, false, 0, 9)) karte::zoom(grosseKarte, -1);
}

// ------------------------------------------------------------------ Ein Bild
// Reiter Transport / Patient (Hochformat)
static void reiterZeichnen(float W, float top, bool ueber, const Json& t, const std::string& pk) {
  ImVec2 wp = ImGui::GetWindowPos();
  ImDrawList* dl = ImGui::GetWindowDrawList();
  ImVec2 s0(wp.x + 14, wp.y + top + 10), s1(wp.x + W - 14, wp.y + top + 50);
  dl->AddRectFilled(s0, s1, rgb(fb::SCHWARZ), 10);
  dl->AddRect(s0, s1, rgb(0x262A35), 10);
  float hw = (s1.x - s0.x - 6) / 2;
  bool rechts = tab == "patient";
  ImVec2 m0(s0.x + 3 + (rechts ? hw : 0), s0.y + 3);
  dl->AddRectFilled(m0, ImVec2(m0.x + hw, s1.y - 3), rgb(fb::BLAU), 8);
  ImGui::BeginDisabled(ueber);
  ImGui::SetCursorScreenPos(ImVec2(s0.x + 3, s0.y + 3));
  if (knopfRoh("##segT", ImVec2(hw, 34))) tab = "transport";
  ImGui::SameLine(0, 0);
  if (knopfRoh("##segP", ImVec2(hw, 34)) && (t["pat"] || t["ein"])) tab = "patient";
  ImGui::EndDisabled();
  ImVec2 a = textGroesse(fM, "Transport"), b = textGroesse(fM, "Patient");
  textAn(dl, fM, ImVec2(s0.x + 3 + (hw - a.x) / 2, s0.y + 20 - a.y / 2), rechts ? rgb(fb::TEXT2) : rgb(fb::SCHWARZ), "Transport");
  float bx = s0.x + 3 + hw + (hw - b.x) / 2;
  textAn(dl, fM, ImVec2(bx, s0.y + 20 - b.y / 2), rechts ? rgb(fb::SCHWARZ) : rgb(fb::TEXT2), "Patient");
  if (t["pat"] && pk != patGesehen) dl->AddCircleFilled(ImVec2(bx + b.x + 9, s0.y + 20), 3.5f, rgb(fb::GELB), 12);
}

// Knopf „Zielort buchen“ unten (x, y = Fenster-Koordinaten)
static void buchenKnopf(float x, float y, float w, bool ueber, const Json& t) {
  ImGui::SetCursorPos(ImVec2(x, y));
  bool da = (bool)t["buchenDa"];
  std::string titel = t["plan"] ? "Zielort \xC3\xA4ndern" : da ? "Zielort buchen \xE2\x80\xBA" : "Zielort buchen";
  std::string unter = t["plan"] ? t["plan"].t() : da ? "" : (t["buchenText"] ? t["buchenText"].t() : "geht am Einsatzort");
  ImGui::BeginDisabled(ueber);
  if (knopf("##buchenK", titel, unter, da ? rgb(fb::BLAU) : rgb(fb::AUS), da ? rgb(fb::SCHWARZ) : rgb(fb::DUNKELGRAU), w, 48, fF, !da)) blattArt = "buchen";
  ImGui::EndDisabled();
}

// Inhalt einer Spalte (Transport oder Patient) als eigener Bereich mit Scrollen
static void spalte(const char* id, float x, float y, float w, float h, bool ueber, bool patient, const Json& t, bool obenBeginnen) {
  ImGui::SetCursorPos(ImVec2(x, y));
  if (obenBeginnen) ImGui::SetNextWindowScroll(ImVec2(0, 0));
  ImGui::BeginChild(id, ImVec2(w, h), ImGuiChildFlags_None, ueber ? ImGuiWindowFlags_NoMouseInputs : 0);
  ImGui::BeginDisabled(ueber);
  breiten.push_back(w);
  if (patient) patientZeichnen(t);
  else transportZeichnen(t);
  breiten.pop_back();
  luecke(10);
  ImGui::EndDisabled();
  if (!ueber) ziehScroll();
  ImGui::EndChild();
}

void bild(float W, float H, Art art) {
  bool quer = art == QUER;
  if (!ImGui::IsMouseDown(0) && !ImGui::IsMouseReleased(0)) gezogen = false;
  if (suchSendenUm && jetzt >= suchSendenUm) {
    senden("bu:q:" + suchText);
    suchSendenUm = 0;
  }
  const Json& t = stand["neu"]["tab"];
  bool verb = netz::verbunden();

  ImGui::SetNextWindowPos(ImVec2(0, 0));
  ImGui::SetNextWindowSize(ImVec2(W, H));
  ImGui::Begin("LeitWerk", nullptr,
               ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoSavedSettings |
                   ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse | ImGuiWindowFlags_NoBringToFrontOnFocus);
  kopf(W, t, quer);
  float top = 56;
  const Json& ein = t["ein"];
  bool hatEin = verb && ein.art == Json::Objekt;
  if (!verb) {
    blattArt.clear();
    navAuf = false;
    leerZeichnen(W, top, H, "LeitWerk", netz::port() ? "Verbinde mit LeitWerk \xE2\x80\xA6" : "LeitWerk nicht gefunden \xE2\x80\x93 LeitWerk auf diesem PC starten und im Piloten-Interface den Hubschrauber w\xC3\xA4hlen.", nullptr);
    ImGui::End();
    return;
  }
  if (navAuf) {
    navZeichnen(W, H, t);
    ImGui::End();
    return;
  }
  bool ueber = !blattArt.empty();
  if (!hatEin) {
    if (blattArt == "buchen") blattArt.clear();
    const Json* st = t["st"].art == Json::Objekt ? &t["st"] : nullptr;
    leerZeichnen(W, top, H, st ? "Kein Alarm" : "Kein Hubschrauber", st ? "Neue Eins\xC3\xA4tze erscheinen hier automatisch." : (t["unter"] ? t["unter"].t() : "im Piloten-Interface w\xC3\xA4hlen"), st);
  } else {
    std::string pk;
    if (t["pat"]) {
      const Json& l = t["pat"]["liste"];
      for (size_t i = 0; i < l.size(); i++) pk += l[i]["wer"].t() + l[i]["vd"].t() + l[i]["lage"].t() + "|";
    }
    if (quer) {
      // Querformat (Tablet im Cockpit): Transport links, Patient rechts – beides sichtbar
      patGesehen = pk;
      bool neuEin = tabZuletzt != ein["code"].t() + ein["sw"].t();
      tabZuletzt = ein["code"].t() + ein["sw"].t();
      float sw = std::floor((W - 1) / 2);
      float inhTop = top + 4;
      spalte("##links", 0, inhTop, sw, H - inhTop - 72, ueber, false, t, neuEin);
      buchenKnopf(14, H - 60, sw - 28, ueber, t);
      ImDrawList* dl = ImGui::GetWindowDrawList();
      ImVec2 wp = ImGui::GetWindowPos();
      dl->AddLine(ImVec2(wp.x + sw + 0.5f, wp.y + top), ImVec2(wp.x + sw + 0.5f, wp.y + H), rgb(fb::LINIE));
      spalte("##rechts", sw + 1, inhTop, W - sw - 1, H - inhTop, ueber, true, t, neuEin);
    } else {
      if (!t["pat"] && tab == "patient") tab = "transport";
      if (tab == "patient") patGesehen = pk;
      reiterZeichnen(W, top, ueber, t, pk);
      float inhTop = top + 60;
      bool mitKnopf = tab == "transport";
      bool neuerReiter = tab != tabZuletzt;
      tabZuletzt = tab;
      spalte("##inh", 0, inhTop, W, H - inhTop - (mitKnopf ? 72 : 0), ueber, tab == "patient", t, neuerReiter);
      if (mitKnopf) buchenKnopf(14, H - 60, W - 28, ueber, t);
    }
  }
  // Blatt (Status geben / Zielort buchen) über allem
  if (!blattArt.empty()) {
    if (blattArt == "buchen" && !t["buchenDa"]) blattArt.clear();
  }
  if (!blattArt.empty()) {
    ImGui::SetCursorPos(ImVec2(0, 0));
    ImGui::BeginChild("##ueber", ImVec2(W, H), ImGuiChildFlags_None, ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImVec2 wp = ImGui::GetWindowPos();
    dl->AddRectFilled(wp, ImVec2(wp.x + W, wp.y + H), IM_COL32(0, 0, 0, 128));
    // im Querformat: Blatt mittig in Hochformat-Breite
    float BW = quer ? std::min(W, 540.f) : W;
    float bx = (W - BW) / 2;
    bool kbd = willTasten();
    float kh = kbd ? tastaturHoehe() : 0;
    bool kurz = blattArt == "status";
    const Json& kn = stand["knoepfe"];
    float statusH = 52 + 12 + ((kn.size() + 2) / 3) * 78 + 16;
    float minTop = quer ? 12.f : 96.f;
    float bTop = kurz ? std::max(minTop, H - statusH) : minTop;
    // Klick ins Dunkle schließt
    ImGui::SetCursorPos(ImVec2(0, 0));
    if (knopfRoh("##dunkel", ImVec2(W, bTop))) { blattArt.clear(); suchAktiv = false; }
    if (bx > 0) {
      ImGui::SetCursorPos(ImVec2(0, bTop));
      if (knopfRoh("##dunkelL", ImVec2(bx, H - bTop))) { blattArt.clear(); suchAktiv = false; }
      ImGui::SetCursorPos(ImVec2(bx + BW, bTop));
      if (knopfRoh("##dunkelR", ImVec2(W - bx - BW, H - bTop))) { blattArt.clear(); suchAktiv = false; }
    }
    ImVec2 b0(wp.x + bx, wp.y + bTop);
    dl->AddRectFilled(b0, ImVec2(b0.x + BW, wp.y + H), rgb(fb::BLATT), 16, ImDrawFlags_RoundCornersTop);
    dl->AddLine(ImVec2(b0.x + 8, b0.y), ImVec2(b0.x + BW - 8, b0.y), rgb(0x2E3340));
    textAn(dl, fGG, ImVec2(b0.x + 16, b0.y + 26 - gr(fGG) / 2), rgb(fb::TEXT), kurz ? "Status geben" : "Zielort buchen");
    std::string zu = "Schlie\xC3\x9F" "en \xC3\x97";
    float zw = textGroesse(fM, zu).x + 16;
    ImGui::SetCursorScreenPos(ImVec2(b0.x + BW - 8 - zw, b0.y + 8));
    if (knopf("##blattx", zu, "", 0, rgb(fb::GRAU), zw, 36, fM)) { blattArt.clear(); suchAktiv = false; }
    dl->AddLine(ImVec2(b0.x, b0.y + 52), ImVec2(b0.x + BW, b0.y + 52), rgb(fb::LINIE));
    ImGui::SetCursorScreenPos(ImVec2(b0.x, b0.y + 53));
    ImGui::BeginChild("##blattinh", ImVec2(BW, H - bTop - 53 - kh));
    ImGui::SetCursorPos(ImVec2(16, 12));
    ImGui::BeginGroup();
    breiten.push_back(BW - 32);
    if (kurz) statusZeichnen();
    else buchenZeichnen();
    breiten.pop_back();
    luecke(16);
    ImGui::EndGroup();
    ziehScroll();
    ImGui::EndChild();
    if (kbd) tastatur(ImVec2(wp.x + bx, wp.y + H - kh), BW);
    ImGui::EndChild();
  }
  ImGui::End();
}

// ------------------------------------------------------------------ Kachel „LeitWerk“ im AviTab (wie dessen App-Kacheln)
void kachel(float W, float H) {
  ImGui::SetNextWindowPos(ImVec2(0, 0));
  ImGui::SetNextWindowSize(ImVec2(W, H));
  ImGui::PushStyleColor(ImGuiCol_WindowBg, ImVec4(0, 0, 0, 0));
  ImGui::Begin("Kachel", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoInputs | ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoBackground);
  ImDrawList* dl = ImGui::GetWindowDrawList();
  // Hintergrund wie die AviTab-Startseite, Kachel etwas heller mit feinem Rand
  dl->AddRectFilled(ImVec2(0, 0), ImVec2(W, H), IM_COL32(43, 45, 48, 255));
  dl->AddRectFilled(ImVec2(3, 3), ImVec2(W - 3, H - 3), IM_COL32(52, 55, 59, 255), 4);
  dl->AddRect(ImVec2(3, 3), ImVec2(W - 3, H - 3), IM_COL32(70, 73, 78, 255), 4);
  // Symbol: rote Kachel mit weißem Kreuz und „LW“
  float g = std::min(W, H) * 0.52f;
  ImVec2 m(W / 2, H * 0.40f);
  ImVec2 a(m.x - g / 2, m.y - g / 2), b(m.x + g / 2, m.y + g / 2);
  dl->AddRectFilled(ImVec2(a.x + 2, a.y + 3), ImVec2(b.x + 2, b.y + 3), IM_COL32(0, 0, 0, 90), g * 0.2f);
  dl->AddRectFilled(a, b, IM_COL32(206, 32, 41, 255), g * 0.2f);
  dl->AddRectFilled(ImVec2(a.x, a.y), ImVec2(b.x, m.y), IM_COL32(255, 255, 255, 28), g * 0.2f, ImDrawFlags_RoundCornersTop);
  float k = g * 0.17f;
  dl->AddRectFilled(ImVec2(m.x - k, a.y + g * 0.16f), ImVec2(m.x + k, b.y - g * 0.16f), IM_COL32(255, 255, 255, 255));
  dl->AddRectFilled(ImVec2(a.x + g * 0.16f, m.y - k), ImVec2(b.x - g * 0.16f, m.y + k), IM_COL32(255, 255, 255, 255));
  // Beschriftung wie bei AviTab (weiß, mittig)
  std::string n = "LeitWerk";
  float sk = std::max(0.6f, H / 110.f);
  ImFont* f = fM;
  float fs = gr(f) * 1.15f * sk;
  ImVec2 ts = f->CalcTextSizeA(fs, FLT_MAX, 0, n.c_str());
  dl->AddText(f, fs, ImVec2((W - ts.x) / 2, H * 0.80f - ts.y / 2), IM_COL32(235, 236, 238, 255), n.c_str());
  ImGui::End();
  ImGui::PopStyleColor();
}

// ------------------------------------------------------------------ TETRA-Display (wie das CARLS / Funkgerät im Spiel)
// Entwurf 470 × 348 (CARLS-Fläche): hellblau, Kopfzeile mit Netz und Uhr, TETRA / BOS / Gruppe / Status, rechts „KWlist“ /
// „Optionen“; spricht jemand, das Fenster „Gruppe aktiv“ mit „ID: …“ und der Gruppe.
static void mitte(ImDrawList* dl, ImFont* f, float px, float x, float w, float y, ImU32 c, const std::string& s) {
  ImVec2 ts = f->CalcTextSizeA(px, FLT_MAX, 0, s.c_str());
  if (ts.x > w - 4) {
    px *= (w - 4) / ts.x;
    ts = f->CalcTextSizeA(px, FLT_MAX, 0, s.c_str());
  }
  dl->AddText(f, px, ImVec2(x + (w - ts.x) / 2, y - ts.y / 2), c, s.c_str());
}

static void dreieck(ImDrawList* dl, float x, float y, bool rechts, ImU32 c) {
  if (rechts) dl->AddTriangleFilled(ImVec2(x, y - 12), ImVec2(x + 15, y), ImVec2(x, y + 12), c);
  else dl->AddTriangleFilled(ImVec2(x + 15, y - 12), ImVec2(x, y), ImVec2(x + 15, y + 12), c);
}

void tetra(float W, float H, bool strom) {
  ImGui::SetNextWindowPos(ImVec2(0, 0));
  ImGui::SetNextWindowSize(ImVec2(W, H));
  ImGui::Begin("TETRA", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoInputs | ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoBackground);
  ImDrawList* dl = ImGui::GetWindowDrawList();
  if (!strom) {
    dl->AddRectFilled(ImVec2(0, 0), ImVec2(W, H), IM_COL32(6, 8, 10, 255));
    ImGui::End();
    return;
  }
  // Maßstab: Entwurf 470 breit
  float s = W / 470.f;
  auto X = [&](float v) { return v * s; };
  auto P = [&](float px) { return px * s; };
  ImFont* f = fRiesig;
  dl->AddRectFilledMultiColor(ImVec2(0, 0), ImVec2(W, H), IM_COL32(211, 225, 245, 255), IM_COL32(211, 225, 245, 255), IM_COL32(182, 203, 234, 255), IM_COL32(182, 203, 234, 255));
  const Json& d = stand["neu"]["tetra"];
  bool verb = netz::verbunden() && d.art == Json::Objekt;
  float B = 368;
  // Kopfzeile: Netz-Balken, Symbol, Uhr
  dl->AddRectFilled(ImVec2(0, 0), ImVec2(X(B), X(42)), IM_COL32(255, 255, 255, 64));
  dl->AddLine(ImVec2(0, X(42)), ImVec2(X(B), X(42)), IM_COL32(40, 70, 120, 56), X(1));
  const float pr[4] = {30, 55, 80, 100};
  for (int i = 0; i < 4; i++) {
    float hh = std::round(pr[i] * 0.22f);
    dl->AddRectFilled(ImVec2(X(16 + i * 9), X(32 - hh)), ImVec2(X(22 + i * 9), X(32)), verb ? IM_COL32(43, 154, 58, 255) : IM_COL32(120, 130, 140, 255), X(1));
  }
  dl->AddTriangleFilled(ImVec2(X(58), X(16)), ImVec2(X(72), X(16)), ImVec2(X(65), X(26)), IM_COL32(197, 138, 0, 255));
  std::string uhr = verb ? d["uhr"].t() : "";
  if (!uhr.empty()) {
    ImVec2 ts = f->CalcTextSizeA(P(26), FLT_MAX, 0, uhr.c_str());
    dl->AddText(f, P(26), ImVec2(X(B - 14) - ts.x, X(21) - ts.y / 2), IM_COL32(36, 54, 79, 255), uhr.c_str());
  }
  ImU32 dunkel = IM_COL32(15, 23, 36, 255), mittel = IM_COL32(36, 54, 79, 255);
  mitte(dl, f, P(46), 0, X(B), X(84), dunkel, "TETRA");
  mitte(dl, f, P(40), 0, X(B), X(142), mittel, "BOS");
  if (!verb) {
    mitte(dl, f, P(34), 0, X(B), X(214), dunkel, "LeitWerk");
    mitte(dl, f, P(24), X(8), X(B - 16), X(299), mittel, netz::verbunden() ? "kein Hubschrauber" : "nicht verbunden");
  } else {
    std::string gruppe = d["gruppe"].t();
    bool pfeile = (bool)d["pfeile"];
    bool lampe = !d["neben"].t().empty();
    ImVec2 gs = f->CalcTextSizeA(P(46), FLT_MAX, 0, gruppe.c_str());
    float gx = (X(B) - gs.x) / 2;
    dl->AddText(f, P(46), ImVec2(gx, X(214) - gs.y / 2), dunkel, gruppe.c_str());
    if (pfeile) {
      dreieck(dl, gx - X(29), X(214), false, IM_COL32(42, 94, 168, 255));
      dreieck(dl, gx + gs.x + X(14), X(214), true, IM_COL32(42, 94, 168, 255));
    }
    if (lampe) dl->AddCircleFilled(ImVec2(gx + gs.x + X(pfeile ? 41 : 17), X(214)), X(7), IM_COL32(224, 138, 0, (int)(155 + 100 * std::fabs(std::sin(jetzt * 3.1)))), 16);
    dl->AddLine(ImVec2(X(40), X(258)), ImVec2(X(B - 40), X(258)), IM_COL32(40, 70, 120, 56), X(1));
    std::string st = d["status"].t();
    float stGr = st.size() <= 14 ? 42 : st.size() <= 17 ? 37 : 32;
    mitte(dl, f, P(stGr), X(8), X(B - 16), X(299), dunkel, st);
  }
  // Leiste rechts
  dl->AddRectFilledMultiColor(ImVec2(X(B), 0), ImVec2(W, H), IM_COL32(128, 160, 208, 140), IM_COL32(128, 160, 208, 140), IM_COL32(110, 145, 198, 153), IM_COL32(110, 145, 198, 153));
  dl->AddLine(ImVec2(X(B), 0), ImVec2(X(B), H), IM_COL32(40, 70, 120, 77), X(1));
  dl->AddLine(ImVec2(X(B + 10), X(174)), ImVec2(X(B + 92), X(174)), IM_COL32(40, 70, 120, 64), X(1));
  mitte(dl, f, P(26), X(B), X(102), X(57), IM_COL32(22, 38, 63, 255), "KWlist");
  mitte(dl, f, P(23), X(B), X(102), X(271), IM_COL32(22, 38, 63, 255), "Optionen");
  // Fenster „Gruppe aktiv“ / „Senden“ / „Warten …“
  std::string kopfT = verb ? d["kopf"].t() : "";
  if (!kopfT.empty()) {
    std::string art = d["art"].t();
    ImU32 popFarbe = art == "senden" ? IM_COL32(198, 40, 40, 255) : art == "warten" ? IM_COL32(168, 111, 0, 255) : IM_COL32(86, 101, 124, 255);
    ImU32 popRand = art == "senden" ? IM_COL32(198, 40, 40, 255) : IM_COL32(45, 90, 160, 255);
    float PW = 336;
    dl->AddRectFilled(ImVec2(X(14), X(52)), ImVec2(X(14 + PW + 6), X(52 + 282)), IM_COL32(10, 25, 50, 71), X(8));
    ImVec2 p0(X(10), X(48)), p1(X(10 + PW), X(48 + 278));
    dl->AddRectFilled(p0, p1, IM_COL32(243, 247, 253, 255), X(8));
    dl->AddRectFilled(p0, ImVec2(p1.x, p0.y + X(58)), popFarbe, X(8), ImDrawFlags_RoundCornersTop);
    dl->AddRect(p0, p1, popRand, X(8), 0, X(3));
    mitte(dl, f, P(32), p0.x, X(PW), p0.y + X(29), IM_COL32(255, 255, 255, 255), kopfT);
    mitte(dl, f, P(54), p0.x, X(PW), p0.y + X(119), dunkel, d["wer"].t());
    mitte(dl, f, P(art == "warten" ? 28 : 38), p0.x, X(PW), p0.y + X(181), mittel, d["popGruppe"].t());
    if (art == "senden") {
      float bw = PW * 0.6f, bx = 10 + PW * 0.2f;
      float ph = 0.25f + 0.6f * (0.5f + 0.5f * (float)std::sin(jetzt * 7.0));
      dl->AddRectFilled(ImVec2(X(bx), p0.y + X(222)), ImVec2(X(bx + bw), p0.y + X(232)), IM_COL32(0, 0, 0, 31), X(5));
      dl->AddRectFilled(ImVec2(X(bx), p0.y + X(222)), ImVec2(X(bx + bw * ph), p0.y + X(232)), IM_COL32(198, 40, 40, 255), X(5));
    }
    if (!d["neben"].t().empty()) mitte(dl, f, P(24), p0.x, X(PW), p0.y + X(252), IM_COL32(122, 84, 0, 255), d["neben"].t());
  }
  ImGui::End();
}

}  // namespace ui
