#include "netz.h"

#include <atomic>
#include <cctype>
#include <cstdlib>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <deque>
#include <mutex>
#include <set>
#include <thread>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
typedef SOCKET Sock;
#define SOCK_UNGUELTIG INVALID_SOCKET
static void sockZu(Sock s) { closesocket(s); }
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>
typedef int Sock;
#define SOCK_UNGUELTIG (-1)
static void sockZu(Sock s) { close(s); }
#endif

namespace netz {

static std::thread faden;
static std::atomic<bool> laeuft{false};
static std::mutex mx;
static std::condition_variable cv;
static std::string stand;
static bool neu = false;
static std::atomic<bool> verb{false};
static std::atomic<int> gefundenerPort{0};
static std::deque<std::string> befehle;
static std::deque<Kachel> kachelWunsch;
static std::set<long long> kachelUnterwegs;
static std::deque<Kachel> kachelFertigListe;

static long long kachelSchluessel(int z, int y, int x) { return ((long long)z << 48) | ((long long)y << 24) | x; }

// Eine HTTP-Anfrage an 127.0.0.1:port. Gibt den Statuscode zurück (0 = keine Verbindung).
static int anfrage(int port, const char* methode, const std::string& pfad, const std::string& body, std::string& antwort, int timeoutMs) {
  antwort.clear();
  Sock s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (s == SOCK_UNGUELTIG) return 0;
#ifdef _WIN32
  DWORD to = timeoutMs;
  setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char*)&to, sizeof to);
  setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char*)&to, sizeof to);
#else
  timeval tv{timeoutMs / 1000, (timeoutMs % 1000) * 1000};
  setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof tv);
  setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof tv);
#endif
#ifdef SO_NOSIGPIPE
  int eins = 1;
  setsockopt(s, SOL_SOCKET, SO_NOSIGPIPE, &eins, sizeof eins);  // macOS: kein Absturz, wenn LeitWerk die Verbindung schließt
#endif
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_port = htons((unsigned short)port);
  a.sin_addr.s_addr = htonl(0x7F000001);
  if (connect(s, (sockaddr*)&a, sizeof a) != 0) {
    sockZu(s);
    return 0;
  }
  std::string req = std::string(methode) + " " + pfad + " HTTP/1.1\r\nHost: 127.0.0.1\r\nUser-Agent: LeitWerk-XPlane\r\nConnection: close\r\n";
  if (!body.empty() || strcmp(methode, "POST") == 0) req += "Content-Type: text/plain; charset=utf-8\r\nContent-Length: " + std::to_string(body.size()) + "\r\n";
  req += "\r\n" + body;
  size_t ges = 0;
  while (ges < req.size()) {
#ifdef MSG_NOSIGNAL
    int n = (int)send(s, req.data() + ges, (int)(req.size() - ges), MSG_NOSIGNAL);
#else
    int n = (int)send(s, req.data() + ges, (int)(req.size() - ges), 0);
#endif
    if (n <= 0) { sockZu(s); return 0; }
    ges += n;
  }
  std::string roh;
  char buf[16384];
  for (;;) {
    int n = (int)recv(s, buf, sizeof buf, 0);
    if (n <= 0) break;
    roh.append(buf, n);
    if (roh.size() > 8 * 1024 * 1024) break;
  }
  sockZu(s);
  size_t kopfEnde = roh.find("\r\n\r\n");
  if (kopfEnde == std::string::npos || roh.compare(0, 5, "HTTP/") != 0) return 0;
  int code = atoi(roh.c_str() + roh.find(' ') + 1);
  antwort = roh.substr(kopfEnde + 4);
  // Content-Length beachten (falls mehr kam)
  std::string kopf = roh.substr(0, kopfEnde);
  for (auto& c : kopf) c = (char)tolower((unsigned char)c);
  size_t cl = kopf.find("content-length:");
  if (cl != std::string::npos) {
    size_t len = (size_t)atoll(kopf.c_str() + cl + 15);
    if (antwort.size() > len) antwort.resize(len);
  }
  return code;
}

static bool pingen(int port) {
  std::string a;
  return anfrage(port, "GET", "/ping", "", a, 600) == 200 && a.compare(0, 8, "leitwerk") == 0;
}

static void schleife() {
  auto naechsterStand = std::chrono::steady_clock::now();
  int fehler = 0;
  while (laeuft) {
    int p = gefundenerPort;
    if (!p) {
      for (int k = 47900; k <= 47905 && laeuft; k++)
        if (pingen(k)) { p = k; break; }
      if (!p) {
        verb = false;
        std::unique_lock<std::mutex> l(mx);
        cv.wait_for(l, std::chrono::seconds(2), [] { return !laeuft; });
        continue;
      }
      gefundenerPort = p;
      fehler = 0;
    }
    // Befehle zuerst (Knopfdruck soll sofort ankommen)
    std::string bef;
    {
      std::lock_guard<std::mutex> l(mx);
      if (!befehle.empty()) { bef = befehle.front(); befehle.pop_front(); }
    }
    if (!bef.empty()) {
      std::string a;
      anfrage(p, "POST", "/befehl", bef, a, 1500);
      naechsterStand = std::chrono::steady_clock::now() + std::chrono::milliseconds(150);
      continue;
    }
    if (std::chrono::steady_clock::now() >= naechsterStand) {
      std::string a;
      int c = anfrage(p, "GET", "/stand", "", a, 2500);
      if (c == 200) {
        verb = true;
        fehler = 0;
        std::lock_guard<std::mutex> l(mx);
        if (a != stand) { stand = a; neu = true; }
      } else if (++fehler >= 3) {
        verb = false;
        gefundenerPort = 0;  // LeitWerk neu gestartet? Port neu suchen
      }
      naechsterStand = std::chrono::steady_clock::now() + std::chrono::milliseconds(1000);
      continue;
    }
    Kachel k{};
    bool kachel = false;
    {
      std::lock_guard<std::mutex> l(mx);
      if (!kachelWunsch.empty()) { k = kachelWunsch.front(); kachelWunsch.pop_front(); kachel = true; }
    }
    if (kachel) {
      std::string a;
      int c = anfrage(p, "GET", "/kachel/" + std::to_string(k.z) + "/" + std::to_string(k.y) + "/" + std::to_string(k.x) + ".png", "", a, 8000);
      if (c == 200) k.png.assign(a.begin(), a.end());
      std::lock_guard<std::mutex> l(mx);
      kachelFertigListe.push_back(std::move(k));
      continue;
    }
    std::unique_lock<std::mutex> l(mx);
    cv.wait_until(l, naechsterStand, [] { return !laeuft || !befehle.empty() || !kachelWunsch.empty(); });
  }
}

void starten() {
  if (laeuft) return;
#ifdef _WIN32
  WSADATA w;
  WSAStartup(MAKEWORD(2, 2), &w);
#endif
  laeuft = true;
  faden = std::thread(schleife);
}

void stoppen() {
  if (!laeuft) return;
  laeuft = false;
  cv.notify_all();
  if (faden.joinable()) faden.join();
#ifdef _WIN32
  WSACleanup();
#endif
}

bool standNeu(std::string& json) {
  std::lock_guard<std::mutex> l(mx);
  if (!neu) return false;
  json = stand;
  neu = false;
  return true;
}

bool verbunden() { return verb; }
int port() { return gefundenerPort; }

void senden(const std::string& befehl) {
  {
    std::lock_guard<std::mutex> l(mx);
    befehle.push_back(befehl);
  }
  cv.notify_all();
}

void kachelHolen(int z, int y, int x) {
  {
    std::lock_guard<std::mutex> l(mx);
    long long key = kachelSchluessel(z, y, x);
    if (kachelUnterwegs.count(key)) return;
    kachelUnterwegs.insert(key);
    // jüngste Wünsche zuerst (aktueller Ausschnitt), alte verwerfen
    kachelWunsch.push_front(Kachel{z, y, x, {}});
    while (kachelWunsch.size() > 48) {
      auto& alt = kachelWunsch.back();
      kachelUnterwegs.erase(kachelSchluessel(alt.z, alt.y, alt.x));
      kachelWunsch.pop_back();
    }
  }
  cv.notify_all();
}

bool kachelFertig(Kachel& k) {
  std::lock_guard<std::mutex> l(mx);
  if (kachelFertigListe.empty()) return false;
  k = std::move(kachelFertigListe.front());
  kachelFertigListe.pop_front();
  kachelUnterwegs.erase(kachelSchluessel(k.z, k.y, k.x));
  return true;
}

}  // namespace netz
