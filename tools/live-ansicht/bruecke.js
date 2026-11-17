// Brücke für die Live-Ansicht: Handy- und EFB-Seite holen den Stand nicht vom Programm (/stand, /befehl über HTTP),
// sondern direkt vom Spiel im Rahmen nebenan (window.__pilot im Fenster #spiel). Alles andere bleibt die echte Seite.
(function () {
  function pilot() {
    try {
      var f = window.parent.document.getElementById("spiel");
      return (f && f.contentWindow && f.contentWindow.__pilot) || null;
    } catch (e) {
      return null;
    }
  }
  function antwort(pfad, body) {
    var p = pilot();
    if (!p) return { status: 503, text: "" };
    if (pfad.indexOf("/stand") === 0) return { status: 200, text: JSON.stringify(p.handy()) };
    if (pfad.indexOf("/befehl") === 0) {
      try {
        p.handyBefehl(String(body || ""));
      } catch (e) {
        console.warn("Befehl", e);
      }
      return { status: 200, text: "ok" };
    }
    return null;
  }
  function pfadVon(u) {
    try {
      return new URL(String(u), location.href).pathname.replace(/^.*\/(stand|befehl)$/, "/$1");
    } catch (e) {
      return String(u);
    }
  }
  var echtFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (u, opt) {
    var a = antwort(pfadVon(u), opt && opt.body);
    if (!a) return echtFetch(u, opt);
    return Promise.resolve(new Response(a.text, { status: a.status, headers: { "Content-Type": "application/json" } }));
  };
  var EchtXhr = window.XMLHttpRequest;
  function Xhr() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = "";
    this._echt = null;
  }
  Xhr.prototype.open = function (m, u) {
    this._pfad = pfadVon(u);
    this._m = m;
    this._u = u;
    this.readyState = 1;
  };
  Xhr.prototype.setRequestHeader = function () {};
  Xhr.prototype.abort = function () {};
  Xhr.prototype.send = function (body) {
    var self = this;
    var a = antwort(this._pfad, body);
    if (!a) {
      var x = new EchtXhr();
      x.open(this._m, this._u);
      x.onreadystatechange = function () {
        self.readyState = x.readyState;
        self.status = x.status;
        self.responseText = x.responseText;
        if (self.onreadystatechange) self.onreadystatechange();
        if (x.readyState === 4 && self.onload) self.onload();
      };
      x.send(body);
      return;
    }
    setTimeout(function () {
      self.readyState = 4;
      self.status = a.status;
      self.responseText = a.text;
      self.response = a.text;
      if (self.onreadystatechange) self.onreadystatechange();
      if (a.status >= 200 && a.status < 300) {
        if (self.onload) self.onload();
      } else if (self.onerror) self.onerror();
    }, 30);
  };
  window.XMLHttpRequest = Xhr;
})();
