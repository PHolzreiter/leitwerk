/*
 * LeitWerk-Hinweis am CARLS-Funkgerät der HPG H145 – von LeitWerk eingebaut (zusammen mit der App im Tablet).
 * Diese Datei gehört zu LeitWerk, nicht zur H145. Am Code der H145 wird nichts verändert.
 * Solange keine Mission das Display beschreibt und LeitWerk auf diesem Rechner läuft, steht statt
 * „Connect a mission to begin“ ein Hinweis, die Mission über die App „LeitWerk“ im Tablet zu verbinden.
 * Sobald die Mission Daten schickt, gehört das Display wieder ihr.
 */
(function () {
  "use strict";
  var PING = "__PING__";
  var HINWEIS = { LSK: ["", "", ""], RSK: ["", "", ""], Items: [["LeitWerk bereit", ""], ["Tablet: App LeitWerk", ""], ["dort Verbinden tippen", ""]] };
  var fremd = { text: "", um: 0 };
  var leitwerkDa = false;
  var zeigtHinweis = false;
  var gepatcht = null;

  function einhaengen() {
    var c = window.CARLS;
    if (!c || c === gepatcht || typeof c.LoadData !== "function") return;
    var orig = c.LoadData;
    c.LoadData = function (d) {
      if (d !== HINWEIS) {
        zeigtHinweis = false;
        var t = "";
        try { t = String(d && d.Items && d.Items[0] && d.Items[0][0] || ""); } catch (e) {}
        fremd = { text: t, um: Date.now() };
      }
      return orig.apply(this, arguments);
    };
    gepatcht = c;
    // Startbild von HPG („Connect a mission to begin“) wurde schon vor dem Einhängen gezeichnet
    if (!fremd.um) fremd = { text: "Connect a mission to begin", um: Date.now() };
  }

  function pruefen() {
    var x = new XMLHttpRequest();
    x.open("GET", PING);
    x.timeout = 1500;
    x.onreadystatechange = function () {
      if (x.readyState === 4) leitwerkDa = x.status === 200;
    };
    try { x.send(); } catch (e) { leitwerkDa = false; }
  }

  function takt() {
    einhaengen();
    var c = window.CARLS;
    if (!c || !gepatcht) return;
    // frei: HPG-Startbild, oder die LeitWerk-Mission schickt seit 12 s nichts mehr (sie sendet alle 4 s)
    var frei = /Connect a mission/i.test(fremd.text) || (fremd.text.indexOf("lwcl") >= 0 && Date.now() - fremd.um > 12000);
    if (frei && leitwerkDa && !zeigtHinweis) {
      zeigtHinweis = true;
      try { c.LoadData(HINWEIS); } catch (e) {}
    } else if (zeigtHinweis && !leitwerkDa) {
      // LeitWerk beendet: wieder das Startbild von HPG
      zeigtHinweis = false;
      try { c.LoadData({ LSK: ["*", "*", "*"], RSK: ["*", "*", "*"], Items: [["Connect a mission to begin", ""], ["", ""], ["", ""]] }); } catch (e) {}
    }
  }

  setInterval(pruefen, 3000);
  setInterval(takt, 1000);
  pruefen();
})();
