#include "wetter.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <string>

#include "XPLMDataAccess.h"
#include "XPLMPlugin.h"
#include "XPLMProcessing.h"
#include "XPLMUtilities.h"
#include "XPLMWeather.h"
#include "ansicht.h"
#include "json.h"
#include "netz.h"

namespace wetter {

typedef void (*Begin_f)(void);
typedef void (*End_f)(int, int);
typedef void (*Setzen_f)(double, double, double, XPLMWeatherInfo_t*);
static Begin_f xBegin = nullptr;
static End_f xEnd = nullptr;
static Setzen_f xSetzen = nullptr;
static XPLMFlightLoopID schleife = nullptr;
static XPLMDataRef drLat, drLon, drHoehe, drAgl, drBoden;

struct Wolke {
  float ab = 0, bis = 0, bedeckung = 0;
  int typ = 2;  // X-Plane: 0 Cirrus, 1 Stratus, 2 Cumulus, 3 Cumulonimbus
  bool da = false;
};
struct Werte {
  float temp = 15, druck = 1013, sicht = 30, wind = 0, boe = 0, richtung = 270, regen = 0, gewitter = 0;
  Wolke wolken[3];
};

static bool hatIst = false, hatVon = false, fertig = true, gesetzt = false;
static Werte ist, von, ziel;
static std::string zielSchluessel;
static double startSpiel = 0, dauerMs = 0, letzteSendung = -100;
static double ortLat = 0, ortLon = 0;
static bool sofortErlaubt = false;
static std::string stand = "-";

bool moeglich() { return xBegin && xEnd && xSetzen; }
std::string text() { return stand; }

static float z(const Json& j, float std) { return j.art == Json::Zahl ? (float)j.z() : std; }

static Werte lesen(const Json& w) {
  Werte v;
  v.temp = z(w["temp"], 15);
  v.druck = z(w["druck"], 1013);
  v.sicht = z(w["sicht"], 30);
  v.wind = z(w["wind"], 0);
  v.boe = z(w["boe"], 0);
  v.richtung = z(w["richtung"], 270);
  v.regen = z(w["regen"], 0);
  v.gewitter = z(w["gewitter"], 0);
  const Json& wo = w["wolken"];
  for (size_t i = 0; i < 3 && i < wo.size(); i++) {
    Wolke& k = v.wolken[i];
    k.da = true;
    k.ab = z(wo[i]["ab"], 600);
    k.bis = z(wo[i]["bis"], 1500);
    k.bedeckung = z(wo[i]["bedeckung"], 0.5f);
    std::string t = wo[i]["typ"].t();
    k.typ = t == "stratus" ? 1 : t == "cb" ? 3 : 2;
  }
  return v;
}

static std::string schluessel(const Werte& v) {
  char b[512];
  int n = snprintf(b, sizeof b, "%.0f|%.0f|%.1f|%.0f|%.0f|%.0f|%.1f|%.2f", v.temp, v.druck, v.sicht, v.wind, v.boe, v.richtung, v.regen, v.gewitter);
  std::string s(b, n > 0 ? n : 0);
  for (const Wolke& k : v.wolken)
    if (k.da) {
      n = snprintf(b, sizeof b, "|%.0f-%.0f-%.2f-%d", k.ab, k.bis, k.bedeckung, k.typ);
      s.append(b, n > 0 ? n : 0);
    }
  return s;
}

static float lerp(float a, float b, float f) { return a + (b - a) * f; }

static Werte mischen(const Werte& a, const Werte& b, float f) {
  Werte m;
  m.temp = lerp(a.temp, b.temp, f);
  m.druck = lerp(a.druck, b.druck, f);
  m.sicht = lerp(a.sicht, b.sicht, f);
  m.wind = lerp(a.wind, b.wind, f);
  m.boe = lerp(a.boe, b.boe, f);
  float d = fmodf(b.richtung - a.richtung + 540.f, 360.f) - 180.f;
  m.richtung = fmodf(a.richtung + d * f + 360.f, 360.f);
  m.regen = lerp(a.regen, b.regen, f);
  m.gewitter = lerp(a.gewitter, b.gewitter, f);
  for (int i = 0; i < 3; i++) {
    const Wolke &x = a.wolken[i], &y = b.wolken[i];
    Wolke& k = m.wolken[i];
    if (x.da && y.da) {
      k = y;
      k.ab = lerp(x.ab, y.ab, f);
      k.bis = lerp(x.bis, y.bis, f);
      k.bedeckung = lerp(x.bedeckung, y.bedeckung, f);
    } else if (x.da || y.da) {
      k = x.da ? x : y;
      k.bedeckung = (x.da ? x.bedeckung * (1 - f) : y.bedeckung * f);
    }
  }
  return m;
}

static double bodenMsl() { return (drHoehe ? XPLMGetDatad(drHoehe) : 0) - (drAgl ? XPLMGetDataf(drAgl) : 0); }

static void senden(const Werte& w, bool sofort) {
  double lat = drLat ? XPLMGetDatad(drLat) : 0, lon = drLon ? XPLMGetDatad(drLon) : 0;
  float boden = (float)std::max(0.0, bodenMsl());
  XPLMWeatherInfo_t in;
  memset(&in, 0, sizeof in);
  in.structSize = sizeof in;
  bool nass = w.regen > 0.2f;
  in.temperature_alt = w.temp;
  in.dewpoint_alt = w.temp - (nass || w.sicht < 2 ? 1.0f : 6.0f);
  in.pressure_alt = w.druck * 100.f;  // QNH
  in.pressure_sl = w.druck * 100.f;
  in.visibility = std::max(100.f, w.sicht * 1000.f);
  in.precip_rate = std::min(1.f, w.regen / 15.f);
  in.thermal_climb = 0;
  in.wave_height = 0.5f;
  in.wave_dir = (int)w.richtung;
  for (int i = 0; i < XPLM_NUM_WIND_LAYERS; i++) in.wind_layers[i].speed = XPLM_WIND_UNDEFINED_LAYER;
  float ms = w.wind * 0.514444f, boe = (w.wind + w.boe) * 0.514444f;
  float turb = w.boe > 10 ? 0.35f : w.wind > 15 ? 0.2f : 0.05f;
  in.wind_layers[0] = {boden + 300.f, ms, w.richtung, std::max(ms, boe), 10.f, turb};
  in.wind_layers[1] = {boden + 1500.f, ms * 1.4f, fmodf(w.richtung + 15.f, 360.f), std::max(ms, boe) * 1.3f, 10.f, turb / 2};
  for (int i = 0; i < 3; i++) {
    const Wolke& k = w.wolken[i];
    in.cloud_layers[i].cloud_type = (float)k.typ;
    in.cloud_layers[i].coverage = k.da ? std::max(0.f, std::min(1.f, k.bedeckung)) : 0;
    in.cloud_layers[i].alt_base = k.da ? boden + k.ab : 0;
    in.cloud_layers[i].alt_top = k.da ? boden + std::max(k.bis, k.ab + 100) : 0;
  }
  if (w.gewitter > 0.3f && !in.cloud_layers[0].coverage) {
    in.cloud_layers[0] = {3.f, std::min(1.f, w.gewitter), boden + 9000.f, boden + 900.f};
  }
  for (int i = 0; i < XPLM_NUM_TEMPERATURE_LAYERS; i++) in.temp_layers[i] = in.dewp_layers[i] = -300.f;  // aus temperature_alt
  in.troposphere_alt = 0;
  in.troposphere_temp = 0;
  in.age = 0;
  in.radius_nm = 60;
  in.max_altitude_msl_ft = 40000;
  xBegin();
  xSetzen(lat, lon, boden, &in);
  xEnd(0, sofort ? 1 : 0);  // nicht schrittweise: ersetzt das bisherige Wetter dieses Plugins
  ortLat = lat;
  ortLon = lon;
  ist = w;
  hatIst = true;
  gesetzt = true;
}

static void loeschen() {
  if (!gesetzt) return;
  xBegin();
  xEnd(0, 0);  // ohne neue Daten: alles von diesem Plugin entfernen
  gesetzt = false;
  hatIst = false;
}

// Abstand in Seemeilen (grob)
static double nm(double la1, double lo1, double la2, double lo2) {
  double dy = (la2 - la1) * 60, dx = (lo2 - lo1) * 60 * cos(la1 * 3.14159265 / 180);
  return sqrt(dx * dx + dy * dy);
}

static float takt(float, float, int, void*) {
  if (!moeglich()) return 0;
  const Json& w = ui::standJson()["neu"]["wx"];
  double jetzt = XPLMGetElapsedTime();
  bool amBoden = drBoden ? XPLMGetDatai(drBoden) != 0 : true;
  if (w.art != Json::Objekt || w["nurZeit"] || !netz::verbunden()) {
    // LeitWerk gibt kein Wetter vor (Pilot stellt selbst ein) oder ist weg: eigenes Wetter stehen lassen
    if (w.art == Json::Objekt && w["nurZeit"]) {
      loeschen();
      stand = "-";
    }
    return 1.0f;
  }
  if (w["echt"]) {
    loeschen();
    zielSchluessel.clear();
    stand = "echt";
    return 1.0f;
  }
  Werte neu = lesen(w);
  std::string k = schluessel(neu);
  double spiel = z(w["jetzt"], 0);
  if (k != zielSchluessel) {
    zielSchluessel = k;
    hatVon = hatIst;
    von = ist;
    ziel = neu;
    startSpiel = spiel;
    dauerMs = std::max(0.f, z(w["ueb"], 10)) * 60000.0;
    fertig = false;
    sofortErlaubt = !hatIst || dauerMs <= 0;  // Anfang oder Wechsel „Sofort“ – aber nur am Boden
    letzteSendung = -100;
  }
  if (!fertig && jetzt - letzteSendung >= 20) {
    float f = hatVon && dauerMs > 0 ? (float)std::max(0.0, std::min(1.0, (spiel - startSpiel) / dauerMs)) : 1.f;
    float g = f * f * (3 - 2 * f);
    Werte m = hatVon ? mischen(von, ziel, g) : ziel;
    senden(m, sofortErlaubt && amBoden);
    sofortErlaubt = false;
    letzteSendung = jetzt;
    if (f >= 1) fertig = true;
    char b[64];
    snprintf(b, sizeof b, f >= 1 ? "gesetzt" : "wechsel %d%%", (int)(f * 100));
    stand = b;
  } else if (fertig && hatIst && drLat && nm(ortLat, ortLon, XPLMGetDatad(drLat), XPLMGetDatad(drLon)) > 20 && jetzt - letzteSendung > 60) {
    // weit geflogen: dasselbe Wetter um die neue Position
    senden(ist, false);
    letzteSendung = jetzt;
  }
  return 1.0f;
}

void start() {
  xBegin = (Begin_f)XPLMFindSymbol("XPLMBeginWeatherUpdate");
  xEnd = (End_f)XPLMFindSymbol("XPLMEndWeatherUpdate");
  xSetzen = (Setzen_f)XPLMFindSymbol("XPLMSetWeatherAtLocation");
  drLat = XPLMFindDataRef("sim/flightmodel/position/latitude");
  drLon = XPLMFindDataRef("sim/flightmodel/position/longitude");
  drHoehe = XPLMFindDataRef("sim/flightmodel/position/elevation");
  drAgl = XPLMFindDataRef("sim/flightmodel/position/y_agl");
  drBoden = XPLMFindDataRef("sim/flightmodel/failures/onground_any");
  XPLMDebugString(moeglich() ? "LeitWerk: Wetter \xC3\xBC" "ber das Plugin m\xC3\xB6glich\n" : "LeitWerk: Wetter \xC3\xBC" "ber das Plugin erst ab X-Plane 12.3\n");
}

void stopp() {}

void an() {
  if (!moeglich() || schleife) return;
  XPLMCreateFlightLoop_t p;
  memset(&p, 0, sizeof p);
  p.structSize = sizeof p;
  p.phase = xplm_FlightLoop_Phase_BeforeFlightModel;
  p.callbackFunc = takt;
  p.refcon = nullptr;
  schleife = XPLMCreateFlightLoop(&p);
  XPLMScheduleFlightLoop(schleife, 1.0f, 1);
}

void aus() {
  if (schleife) {
    if (moeglich()) loeschen();
    XPLMDestroyFlightLoop(schleife);
  }
  schleife = nullptr;
}

}  // namespace wetter
