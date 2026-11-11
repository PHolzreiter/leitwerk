#include "karte.h"

#include <cmath>
#include <cstdint>
#include <map>
#include <set>
#include <string>

#include "farbe.h"
#include "netz.h"

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_NO_STDIO
#include "stb_image.h"

namespace karte {

static TexNeu texNeu = nullptr;
static TexWeg texWeg = nullptr;
struct Kach {
  unsigned tex = 0;
  int zuletzt = 0;
};
static std::map<long long, Kach> kacheln;
static std::map<long long, double> fehlgeschlagen;  // Schlüssel → nochmal versuchen ab
static double jetztZeit = 0;
static int bildNr = 0;
static const double PI = 3.14159265358979323846;

static long long schluessel(int z, int y, int x) { return ((long long)z << 48) | ((long long)y << 24) | x; }

void start(TexNeu neu, TexWeg weg) {
  texNeu = neu;
  texWeg = weg;
}

void ende() {
  for (auto& k : kacheln)
    if (k.second.tex && texWeg) texWeg(k.second.tex);
  kacheln.clear();
}

void takt(double jetzt) {
  jetztZeit = jetzt;
  bildNr++;
  netz::Kachel k;
  int n = 0;
  while (n < 6 && netz::kachelFertig(k)) {
    n++;
    long long key = schluessel(k.z, k.y, k.x);
    int w = 0, h = 0, kan = 0;
    unsigned char* px = k.png.empty() ? nullptr : stbi_load_from_memory(k.png.data(), (int)k.png.size(), &w, &h, &kan, 4);
    if (!px) {
      fehlgeschlagen[key] = jetzt + 30;
      continue;
    }
    unsigned t = texNeu ? texNeu(w, h, px) : 0;
    stbi_image_free(px);
    if (t) kacheln[key] = Kach{t, bildNr};
  }
  // alte Kacheln aufräumen (höchstens ~250 im Speicher)
  if (kacheln.size() > 250) {
    std::multimap<int, long long> alt;
    for (auto& k2 : kacheln) alt.insert({k2.second.zuletzt, k2.first});
    size_t weg = kacheln.size() - 200;
    for (auto it = alt.begin(); it != alt.end() && weg > 0; ++it, --weg) {
      auto f = kacheln.find(it->second);
      if (f->second.zuletzt >= bildNr - 2) break;
      if (texWeg) texWeg(f->second.tex);
      kacheln.erase(f);
    }
  }
}

static void px(int z, double lat, double lon, double& x, double& y) {
  double n = 256.0 * pow(2.0, z);
  double s = sin(lat * PI / 180.0);
  if (s > 0.9999) s = 0.9999;
  if (s < -0.9999) s = -0.9999;
  x = (lon + 180.0) / 360.0 * n;
  y = (0.5 - log((1 + s) / (1 - s)) / (4 * PI)) * n;
}

static void ll(int z, double x, double y, double& lat, double& lon) {
  double n = 256.0 * pow(2.0, z);
  lon = x / n * 360.0 - 180.0;
  double m = PI - 2 * PI * y / n;
  lat = 180.0 / PI * atan(0.5 * (exp(m) - exp(-m)));
}

void passend(Ansicht& a, double lat1, double lon1, double lat2, double lon2, float w, float h) {
  a.lat = (lat1 + lat2) / 2;
  a.lon = (lon1 + lon2) / 2;
  for (int z = 16; z >= 7; z--) {
    a.z = z;
    double x1, y1, x2, y2;
    px(z, lat1, lon1, x1, y1);
    px(z, lat2, lon2, x2, y2);
    if (fabs(x1 - x2) < w - 70 && fabs(y1 - y2) < h - 60) break;
  }
}

void schieben(Ansicht& a, float dx, float dy) {
  double x, y;
  px(a.z, a.lat, a.lon, x, y);
  ll(a.z, x - dx, y - dy, a.lat, a.lon);
}

void zoom(Ansicht& a, int d) {
  a.z += d;
  if (a.z < 7) a.z = 7;
  if (a.z > 18) a.z = 18;
}

static void textMitHalo(ImDrawList* dl, ImFont* f, float gr, ImVec2 p, ImU32 c, ImU32 halo, const char* t) {
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++)
      if (dx || dy) dl->AddText(f, gr, ImVec2(p.x + dx, p.y + dy), halo, t);
  dl->AddText(f, gr, p, c, t);
}

static void gestrichelt(ImDrawList* dl, ImVec2 a, ImVec2 b, ImU32 c, float dicke) {
  float dx = b.x - a.x, dy = b.y - a.y, len = sqrtf(dx * dx + dy * dy);
  if (len < 1) return;
  float ux = dx / len, uy = dy / len;
  for (float s = 0; s < len; s += 16) {
    float e = s + 9 < len ? s + 9 : len;
    dl->AddLine(ImVec2(a.x + ux * s, a.y + uy * s), ImVec2(a.x + ux * e, a.y + uy * e), c, dicke);
  }
}

void zeichnen(Ansicht& a, ImVec2 p0, ImVec2 gr, const Json& d, bool klein, ImFont* fKlein, ImFont* fFett) {
  ImDrawList* dl = ImGui::GetWindowDrawList();
  ImVec2 p1(p0.x + gr.x, p0.y + gr.y);
  const Json& ich = d["ich"];
  const Json& ziel = d["ziel"];
  if (ich.art == Json::Objekt) {
    if (klein) {
      if (ziel.art == Json::Objekt) passend(a, ich["lat"].z(), ich["lon"].z(), ziel["lat"].z(), ziel["lon"].z(), gr.x, gr.y);
      else { a.lat = ich["lat"].z(); a.lon = ich["lon"].z(); a.z = 12; }
    } else if (a.folgen) {
      a.lat = ich["lat"].z();
      a.lon = ich["lon"].z();
    }
  }
  dl->PushClipRect(p0, p1, true);
  dl->AddRectFilled(p0, p1, rgb(0xDDE3D5), 10.f);
  double cx, cy;
  px(a.z, a.lat, a.lon, cx, cy);
  double x0 = cx - gr.x / 2, y0 = cy - gr.y / 2;
  int n = 1 << a.z;
  // Kacheln (und eine Stufe gröber als Ersatz, solange die feinen fehlen)
  for (int tx = (int)floor(x0 / 256); tx <= (int)floor((x0 + gr.x) / 256); tx++) {
    for (int ty = (int)floor(y0 / 256); ty <= (int)floor((y0 + gr.y) / 256); ty++) {
      if (ty < 0 || ty >= n) continue;
      int xx = ((tx % n) + n) % n;
      long long key = schluessel(a.z, ty, xx);
      ImVec2 q0((float)(p0.x + tx * 256 - x0), (float)(p0.y + ty * 256 - y0));
      ImVec2 q1(q0.x + 256, q0.y + 256);
      auto it = kacheln.find(key);
      if (it != kacheln.end()) {
        it->second.zuletzt = bildNr;
        dl->AddImage((ImTextureID)(uintptr_t)it->second.tex, q0, q1);
        continue;
      }
      auto f = fehlgeschlagen.find(key);
      if (f == fehlgeschlagen.end() || f->second < jetztZeit) netz::kachelHolen(a.z, ty, xx);
      if (a.z > 7) {
        long long k2 = schluessel(a.z - 1, ty / 2, xx / 2);
        auto g = kacheln.find(k2);
        if (g != kacheln.end()) {
          g->second.zuletzt = bildNr;
          float u = (xx % 2) * 0.5f, v = (ty % 2) * 0.5f;
          dl->AddImage((ImTextureID)(uintptr_t)g->second.tex, q0, q1, ImVec2(u, v), ImVec2(u + 0.5f, v + 0.5f));
        }
      }
    }
  }
  auto pos = [&](double lat, double lon) {
    double x, y;
    px(a.z, lat, lon, x, y);
    return ImVec2((float)(p0.x + x - x0), (float)(p0.y + y - y0));
  };
  if (ich.art == Json::Objekt) {
    ImVec2 pi = pos(ich["lat"].z(), ich["lon"].z());
    if (ziel.art == Json::Objekt) gestrichelt(dl, pi, pos(ziel["lat"].z(), ziel["lon"].z()), rgb(fb::BLAU), 4.f);
    const Json& fz = d["fz"];
    bool label = a.z >= 11 || klein;
    for (size_t i = 0; i < fz.size(); i++) {
      const Json& f = fz[i];
      ImVec2 p = pos(f["lat"].z(), f["lon"].z());
      if (p.x < p0.x - 20 || p.y < p0.y - 20 || p.x > p1.x + 20 || p.y > p1.y + 20) continue;
      ImU32 c = farbe(f["f"].t(), rgb(fb::GRAU));
      if (f["nah"]) {
        ImVec2 r[4] = {ImVec2(p.x, p.y - 10), ImVec2(p.x + 10, p.y), ImVec2(p.x, p.y + 10), ImVec2(p.x - 10, p.y)};
        dl->AddConvexPolyFilled(r, 4, rgb(fb::SCHWARZ));
        ImVec2 r2[4] = {ImVec2(p.x, p.y - 7), ImVec2(p.x + 7, p.y), ImVec2(p.x, p.y + 7), ImVec2(p.x - 7, p.y)};
        dl->AddConvexPolyFilled(r2, 4, c);
      } else {
        dl->AddRectFilled(ImVec2(p.x - 7, p.y - 7), ImVec2(p.x + 7, p.y + 7), rgb(fb::SCHWARZ), 4);
        dl->AddRectFilled(ImVec2(p.x - 5, p.y - 5), ImVec2(p.x + 5, p.y + 5), c, 2);
      }
      if (label && (f["ein"] || f["nah"] || a.z >= 12))
        textMitHalo(dl, fFett, 12.f, ImVec2(p.x + 10, p.y - 8), rgb(fb::SCHWARZ), IM_COL32(255, 255, 255, 230), f["ruf"].t().c_str());
    }
    if (ziel.art == Json::Objekt) {
      ImVec2 p = pos(ziel["lat"].z(), ziel["lon"].z());
      if (ziel["kh"]) {
        dl->AddRectFilled(ImVec2(p.x - 12, p.y - 12), ImVec2(p.x + 12, p.y + 12), IM_COL32_WHITE, 6);
        dl->AddRectFilled(ImVec2(p.x - 9, p.y - 9), ImVec2(p.x + 9, p.y + 9), rgb(0x1F6FEB), 4);
        ImVec2 ts = fFett->CalcTextSizeA(14.f, 100, 0, "H");
        dl->AddText(fFett, 14.f, ImVec2(p.x - ts.x / 2, p.y - ts.y / 2), IM_COL32_WHITE, "H");
      } else {
        dl->AddCircleFilled(p, 12, IM_COL32_WHITE, 24);
        dl->AddCircleFilled(p, 9, rgb(0xA61B1B), 24);
      }
    }
    // eigener Hubschrauber: Dreieck in Flugrichtung (ohne Kurs: Kreis)
    const Json& kurs = ich["kurs"];
    if (kurs.art != Json::Zahl) {
      dl->AddCircleFilled(pi, 10, rgb(fb::SCHWARZ), 24);
      dl->AddCircleFilled(pi, 6, farbe(ich["f"].t(), rgb(0xDCC23A)), 24);
    } else {
      float w = (float)(kurs.z() * PI / 180.0);
      float s = sinf(w), c = cosf(w);
      auto rot = [&](float x, float y) { return ImVec2(pi.x + x * c - y * s, pi.y + x * s + y * c); };
      dl->AddTriangleFilled(rot(0, -15), rot(11, 12), rot(-11, 12), rgb(fb::SCHWARZ));
      dl->AddTriangleFilled(rot(0, -9), rot(6.5f, 8), rot(-6.5f, 8), farbe(ich["f"].t(), rgb(0xDCC23A)));
    }
  }
  // Info oben links
  std::string info;
  std::string grau;
  const Json& nv = d["nav"];
  if (nv.art == Json::Objekt) {
    info = "\xE2\x86\x92 " + nv["kurs"].t() + "\xC2\xB0 \xC2\xB7 " + nv["km"].t() + " \xC2\xB7 " + nv["min"].t();
    if (nv["an"]) grau = " an " + nv["an"].t();
  } else if (d["text"]) info = d["text"].t();
  else if (ziel.art == Json::Objekt && !klein) info = ziel["t"].t();
  if (!info.empty()) {
    ImVec2 ts = fFett->CalcTextSizeA(14.f, 1000, 0, info.c_str());
    ImVec2 tg = grau.empty() ? ImVec2(0, 0) : fKlein->CalcTextSizeA(14.f, 1000, 0, grau.c_str());
    ImVec2 b0(p0.x + 8, p0.y + 8), b1(b0.x + ts.x + tg.x + 20, b0.y + ts.y + 12);
    dl->AddRectFilled(b0, b1, IM_COL32(17, 18, 22, 225), 8);
    dl->AddText(fFett, 14.f, ImVec2(b0.x + 10, b0.y + 6), rgb(fb::TEXT), info.c_str());
    if (!grau.empty()) dl->AddText(fKlein, 14.f, ImVec2(b0.x + 10 + ts.x, b0.y + 6), rgb(fb::GRAU), grau.c_str());
  }
  if (klein) {
    const char* t = "Navigation \xE2\x80\xBA";
    ImVec2 ts = fFett->CalcTextSizeA(13.f, 1000, 0, t);
    ImVec2 b1(p1.x - 8, p1.y - 8), b0(b1.x - ts.x - 20, b1.y - ts.y - 12);
    dl->AddRectFilled(b0, b1, IM_COL32(17, 18, 22, 225), 8);
    dl->AddText(fFett, 13.f, ImVec2(b0.x + 10, b0.y + 6), rgb(fb::TEXT), t);
  }
  const char* q = "Datenquelle: basemap.at";
  ImVec2 qs = fKlein->CalcTextSizeA(10.5f, 1000, 0, q);
  ImVec2 c0(p0.x + 6, p1.y - qs.y - 7);
  dl->AddRectFilled(c0, ImVec2(c0.x + qs.x + 10, c0.y + qs.y + 2), IM_COL32(255, 255, 255, 200), 3);
  dl->AddText(fKlein, 10.5f, ImVec2(c0.x + 5, c0.y + 1), rgb(0x333333), q);
  dl->AddRect(p0, p1, rgb(fb::RAND), 10.f, 0, 1.f);
  dl->PopClipRect();
}

}  // namespace karte
