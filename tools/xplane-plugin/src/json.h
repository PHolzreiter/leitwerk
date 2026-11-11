// Kleiner JSON-Leser für den Stand aus LeitWerk (/stand). Nur lesen, keine Abhängigkeiten.
#pragma once
#include <cstdio>
#include <cstdlib>
#include <map>
#include <memory>
#include <string>
#include <vector>

struct Json {
  enum Art { Nichts, Bool, Zahl, Text, Liste, Objekt };
  Art art = Nichts;
  bool b = false;
  double n = 0;
  std::string s;
  std::vector<Json> l;
  std::map<std::string, Json> o;

  static const Json& leer() {
    static Json j;
    return j;
  }
  const Json& operator[](const char* k) const {
    if (art != Objekt) return leer();
    auto it = o.find(k);
    return it == o.end() ? leer() : it->second;
  }
  const Json& operator[](size_t i) const { return art == Liste && i < l.size() ? l[i] : leer(); }
  const Json& operator[](int i) const { return i < 0 ? leer() : (*this)[(size_t)i]; }
  size_t size() const { return art == Liste ? l.size() : 0; }
  bool da() const { return art != Nichts && !(art == Bool && !b) && !(art == Text && s.empty()); }
  explicit operator bool() const { return da(); }
  // Text (Zahlen werden als Text ausgegeben, wie in JS)
  std::string t() const {
    if (art == Text) return s;
    if (art == Zahl) {
      char buf[32];
      if (n == (long long)n) snprintf(buf, sizeof buf, "%lld", (long long)n);
      else snprintf(buf, sizeof buf, "%g", n);
      return buf;
    }
    if (art == Bool) return b ? "true" : "false";
    return "";
  }
  double z(double sonst = 0) const {
    if (art == Zahl) return n;
    if (art == Text) return atof(s.c_str());
    return sonst;
  }
  bool istNull() const { return art == Nichts; }
};

class JsonLeser {
 public:
  explicit JsonLeser(const std::string& t) : p(t.c_str()), e(t.c_str() + t.size()) {}
  bool lesen(Json& j) {
    wert(j);
    leer();
    return ok;
  }

 private:
  const char* p;
  const char* e;
  bool ok = true;
  void leer() {
    while (p < e && (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t')) p++;
  }
  static void utf8(std::string& s, unsigned c) {
    if (c < 0x80) s += (char)c;
    else if (c < 0x800) { s += (char)(0xC0 | (c >> 6)); s += (char)(0x80 | (c & 0x3F)); }
    else if (c < 0x10000) { s += (char)(0xE0 | (c >> 12)); s += (char)(0x80 | ((c >> 6) & 0x3F)); s += (char)(0x80 | (c & 0x3F)); }
    else { s += (char)(0xF0 | (c >> 18)); s += (char)(0x80 | ((c >> 12) & 0x3F)); s += (char)(0x80 | ((c >> 6) & 0x3F)); s += (char)(0x80 | (c & 0x3F)); }
  }
  unsigned hex4() {
    unsigned v = 0;
    for (int i = 0; i < 4 && p < e; i++, p++) {
      char c = *p;
      v <<= 4;
      if (c >= '0' && c <= '9') v |= c - '0';
      else if (c >= 'a' && c <= 'f') v |= c - 'a' + 10;
      else if (c >= 'A' && c <= 'F') v |= c - 'A' + 10;
      else ok = false;
    }
    return v;
  }
  void text(std::string& s) {
    p++;  // "
    while (p < e && *p != '"') {
      if (*p == '\\' && p + 1 < e) {
        p++;
        char c = *p++;
        switch (c) {
          case 'n': s += '\n'; break;
          case 't': s += '\t'; break;
          case 'r': s += '\r'; break;
          case 'b': s += '\b'; break;
          case 'f': s += '\f'; break;
          case 'u': {
            unsigned c1 = hex4();
            if (c1 >= 0xD800 && c1 < 0xDC00 && p + 1 < e && p[0] == '\\' && p[1] == 'u') {
              p += 2;
              unsigned c2 = hex4();
              c1 = 0x10000 + ((c1 - 0xD800) << 10) + (c2 - 0xDC00);
            }
            utf8(s, c1);
            break;
          }
          default: s += c;
        }
      } else s += *p++;
    }
    if (p < e) p++;
    else ok = false;
    glyphen(s);
  }
  // Zeichen, die die Schrift (Inter) nicht hat, ersetzen
  static void glyphen(std::string& s) {
    if (s.find('\xE2') == std::string::npos) return;
    static const char* tausch[][2] = {{"\xE2\x82\x82", "2"}, {"\xE2\x82\x83", "3"}, {"\xE2\x9C\x93", "\xC2\xB7"}, {"\xE2\x9C\x94", "\xC2\xB7"},
                                      {"\xE2\x9C\x95", "\xC3\x97"}, {"\xE2\x9C\x97", "\xC3\x97"}, {"\xE2\x9A\xA0", "!"}, {"\xE2\x96\xB2", "\xE2\x86\x91"}, {"\xE2\x96\xBC", "\xE2\x86\x93"}};
    for (auto& t : tausch) {
      size_t i;
      while ((i = s.find(t[0])) != std::string::npos) s.replace(i, 3, t[1]);
    }
  }
  void wert(Json& j) {
    leer();
    if (p >= e) { ok = false; return; }
    char c = *p;
    if (c == '{') {
      j.art = Json::Objekt;
      p++;
      leer();
      if (p < e && *p == '}') { p++; return; }
      while (ok && p < e) {
        leer();
        if (p >= e || *p != '"') { ok = false; return; }
        std::string k;
        text(k);
        leer();
        if (p >= e || *p != ':') { ok = false; return; }
        p++;
        wert(j.o[k]);
        leer();
        if (p < e && *p == ',') { p++; continue; }
        if (p < e && *p == '}') { p++; return; }
        ok = false;
      }
    } else if (c == '[') {
      j.art = Json::Liste;
      p++;
      leer();
      if (p < e && *p == ']') { p++; return; }
      while (ok && p < e) {
        j.l.emplace_back();
        wert(j.l.back());
        leer();
        if (p < e && *p == ',') { p++; continue; }
        if (p < e && *p == ']') { p++; return; }
        ok = false;
      }
    } else if (c == '"') {
      j.art = Json::Text;
      text(j.s);
    } else if (c == 't' && e - p >= 4) { j.art = Json::Bool; j.b = true; p += 4; }
    else if (c == 'f' && e - p >= 5) { j.art = Json::Bool; j.b = false; p += 5; }
    else if (c == 'n' && e - p >= 4) { j.art = Json::Nichts; p += 4; }
    else {
      char* ende = nullptr;
      j.n = strtod(p, &ende);
      if (ende == p) { ok = false; return; }
      j.art = Json::Zahl;
      p = ende;
    }
  }
};
