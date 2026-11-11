/*
  LeitWerk Pilot – App für das EFB-Tablet von Microsoft Flight Simulator 2024 (Testversion).

  Zeigt die Piloten-Seite von LeitWerk (Status-Tasten, Einsatz, Patient) im Tablet an. LeitWerk muss auf
  demselben Rechner laufen und das Piloten-Interface offen sein: es stellt die Seite unter
  http://127.0.0.1:47900/efb bereit (Port 47900–47905, nur auf diesem Rechner erreichbar).

  Reines JavaScript ohne Bauschritt. Benutzt zwei Dinge, die das EFB bereitstellt:
    window.EFB_API   das EFB (use() meldet die App an)
    window.msfssdk   @microsoft/msfs-sdk (DisplayComponent, FSComponent, Subject)

  Aufbau und Anmeldung beim EFB nach dem Beispiel „msfs-efb-iframe“ (MIT-Lizenz, siehe LICENSE-msfs-efb-iframe.txt)
  und der „EFB Template Sample“ aus dem MSFS-2024-SDK.

  Wichtig: Name dieser Datei, Ordnername und INTERNAL_NAME müssen gleich sein (LeitWerkPilot),
  sonst übergeht der Simulator die App ohne Fehlermeldung.
*/
(function () {
  'use strict';

  var APP_NAME = 'LeitWerk';
  var INTERNAL_NAME = 'LeitWerkPilot';
  var VERSION = '0.4.0';
  var PORTS = [47900, 47901, 47902, 47903, 47904, 47905];
  var SUCHEN_MS = 2500;

  var EFB_API_VERSION = '1.0.3';
  var BASE_URL = 'coui://html_ui/efb_ui/efb_apps/' + INTERNAL_NAME;
  var STYLE_ID = 'leitwerk-efb-style';

  function getSdk() {
    return window.msfssdk || (typeof msfssdk !== 'undefined' ? msfssdk : null);
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    // Bewusst einfaches CSS (kein calc(), keine Variablen, kein Grid): der Browser im Simulator ist alt.
    var css =
      '.lw-root{position:absolute;left:0;top:0;right:0;bottom:0;width:100%;height:100%;overflow:hidden;background:#0e1726;}' +
      '.lw-frame{position:absolute;left:0;top:0;width:100%;height:100%;border:0;background:#0e1726;}' +
      '.lw-msg{position:absolute;left:8%;right:8%;top:30%;padding:22px;text-align:center;font:20px/28px Arial,sans-serif;' +
      'color:#e8eef8;background:#16233a;border:1px solid #2a3a57;border-radius:12px;z-index:5;}' +
      '.lw-msg b{display:block;font-size:26px;margin-bottom:8px;}' +
      '.lw-msg small{display:block;margin-top:10px;font-size:15px;color:#93a6c0;}' +
      '.lw-hidden{display:none;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.type = 'text/css';
    el.appendChild(document.createTextNode(css));
    document.head.appendChild(el);
  }

  function createViewClass(sdk) {
    return class LeitWerkView extends sdk.DisplayComponent {
      constructor(props) {
        super(props);
        this.rootRef = sdk.FSComponent.createRef();
        this.frame = null;
        this.msgEl = null;
        this.port = null;
        this.timer = null;
        this.destroyed = false;
        this.pageKeyActions = new Map();
      }

      render() {
        var h = sdk.FSComponent.buildComponent;
        return h('div', { class: 'lw-root', ref: this.rootRef },
          h('div', { class: 'lw-msg' }));
      }

      onAfterRender() {
        var root = this.rootRef.instance;
        if (!root) return;
        this.msgEl = root.querySelector('.lw-msg');
        this.meldung('Suche LeitWerk …', 'LeitWerk starten und das Piloten-Interface öffnen.');
        this.suchen();
      }

      meldung(titel, text) {
        if (!this.msgEl) return;
        if (!titel) {
          this.msgEl.className = 'lw-msg lw-hidden';
          return;
        }
        this.msgEl.className = 'lw-msg';
        this.msgEl.innerHTML = '<b>' + titel + '</b>' + text + '<small>LeitWerk-App ' + VERSION + '</small>';
      }

      // LeitWerk auf einem der Ports suchen (/ping); gefunden: Seite laden, sonst später erneut
      suchen() {
        if (this.destroyed) return;
        var self = this;
        var offen = PORTS.length;
        var gefunden = false;
        PORTS.forEach(function (p) {
          var x = new XMLHttpRequest();
          x.open('GET', 'http://127.0.0.1:' + p + '/ping?z=' + Date.now());
          x.timeout = 1500;
          x.onreadystatechange = function () {
            if (x.readyState !== 4) return;
            offen--;
            if (!gefunden && x.status === 200 && String(x.responseText).indexOf('leitwerk') === 0) {
              gefunden = true;
              self.laden(p);
            }
            if (offen === 0 && !gefunden) self.spaeter();
          };
          try { x.send(); } catch (e) { offen--; if (offen === 0 && !gefunden) self.spaeter(); }
        });
      }

      spaeter() {
        this.meldung('LeitWerk nicht gefunden', 'LeitWerk auf diesem Rechner starten und das Piloten-Interface öffnen – die App verbindet sich dann von selbst.');
        var self = this;
        this.stop();
        this.timer = window.setTimeout(function () { self.timer = null; self.suchen(); }, SUCHEN_MS);
      }

      // Verbindung prüfen, solange die Seite angezeigt wird (LeitWerk beendet → wieder suchen)
      pruefen() {
        var self = this;
        this.stop();
        this.timer = window.setTimeout(function () {
          self.timer = null;
          if (self.destroyed || !self.port) return;
          var x = new XMLHttpRequest();
          x.open('GET', 'http://127.0.0.1:' + self.port + '/ping?z=' + Date.now());
          x.timeout = 2000;
          x.onreadystatechange = function () {
            if (x.readyState !== 4) return;
            if (x.status === 200) return self.pruefen();
            self.port = null;
            if (self.frame && self.frame.parentNode) self.frame.parentNode.removeChild(self.frame);
            self.frame = null;
            self.suchen();
          };
          try { x.send(); } catch (e) { self.port = null; self.suchen(); }
        }, 5000);
      }

      laden(port) {
        var root = this.rootRef.instance;
        if (!root || this.destroyed) return;
        this.port = port;
        if (this.frame && this.frame.parentNode) this.frame.parentNode.removeChild(this.frame);
        var f = document.createElement('iframe');
        f.className = 'lw-frame';
        f.setAttribute('frameborder', '0');
        this.frame = f;
        root.appendChild(f);
        f.src = 'http://127.0.0.1:' + port + '/efb';
        this.meldung(null);
        this.pruefen();
      }

      stop() {
        if (this.timer !== null) {
          window.clearTimeout(this.timer);
          this.timer = null;
        }
      }

      // Lebenszyklus im EFB
      onOpen() { if (!this.port) this.suchen(); }
      onResume() { if (!this.port) this.suchen(); }
      onPause() {}
      onClose() {}
      onUpdate() {}
      routeGamepadInteractionEvent() {}
      handlePageKeyAction() {}

      destroy() {
        this.destroyed = true;
        this.stop();
        if (this.frame) this.frame.src = 'about:blank';
        super.destroy();
      }
    };
  }

  function registerApp() {
    var sdk = getSdk();
    var efb = window.EFB_API;
    if (!sdk || !efb || typeof efb.use !== 'function') return false;

    injectStyle();
    var View = createViewClass(sdk);

    class LeitWerkPilot {
      constructor() {
        this.available = sdk.Subject.create(true);
        this.BootMode = 0;     // AppBootMode.COLD
        this.SuspendMode = 0;  // AppSuspendMode.SLEEP
        this._isReady = false;
        this._favoriteIndex = -1;
        this.bus = null;
      }

      get name() { return APP_NAME; }
      get internalName() { return INTERNAL_NAME; }
      get icon() { return BASE_URL + '/Assets/app-icon.svg'; }
      get isReady() { return this._isReady; }
      get favoriteIndex() { return this._favoriteIndex; }
      set favoriteIndex(value) { this._favoriteIndex = value; }
      get compatibleAircraftModels() { return undefined; }
      get unitsSettingsManager() { return this._unitsSettingsManager; }
      getIsSearchable() { return true; }
      getIsFavoritable() { return true; }
      getVersion() { return VERSION; }

      async install() {}

      async _install(props) {
        this.bus = props && props.bus;
        this._unitsSettingsManager = props && props.unitsSettingManager;
        this.notificationManager = props && props.notificationManager;
        this.efbSettingsManager = props && props.efbSettingsManager;
        this.options = props && props.options;
        await this.install(props);
        this._isReady = true;
        try {
          if (window.Coherent && typeof window.Coherent.trigger === 'function') {
            window.Coherent.trigger('EFB_APP_INSTALLED', APP_NAME, INTERNAL_NAME, EFB_API_VERSION, VERSION);
          }
        } catch (_) { /* nur zur Info */ }
      }

      render() {
        return sdk.FSComponent.buildComponent(View, { bus: this.bus });
      }
    }

    efb.use(LeitWerkPilot);
    return true;
  }


  // ------------------------------------------------------------------ Wetter und Uhrzeit von LeitWerk (Test 0.2.0)
  // Läuft unabhängig von der Anzeige: sobald das EFB diese Datei lädt (Flugbeginn), nicht erst beim Öffnen der App.
  // Nutzt die Wetter-Schnittstelle des Simulators wie das Wettermenü (JS_LISTENER_WEATHER, Datei fs-base-ui
  // html_ui/JS/Services/Weather.js): Liste der Voreinstellungen, aktuelle Voreinstellung (UpdatePreset),
  // eigenes Wetter (UpdateTempWeatherPreset), Uhrzeit (SET_DATE, SET_ZULU_TIME).
  // Jede Rückmeldung geht als „wx:…“ an LeitWerk (Anzeige im Cockpit-Bereich + Datei msfs-wetter-test.json).
  var Wetter = (function () {
    var port = null;
    var lst = null;
    var bereit = false;
    var liste = null;
    var preset = null;
    var zeitDaten = null;
    var letzt = '';
    var zeitGesetzt = 0;
    var zeitSoll = 0;
    var gemeldet = {};
    var wartetAufPreset = null;
    var bereitSeit = 0;
    var angestossen = false;

    function melden(text, daten) {
      if (!port) return;
      var t = 'wx:' + text;
      if (daten !== undefined) {
        var j = '';
        try { j = JSON.stringify(daten); } catch (e) { j = String(daten); }
        t += '|' + j.slice(0, 14000);
      }
      try {
        var x = new XMLHttpRequest();
        x.open('POST', 'http://127.0.0.1:' + port + '/befehl');
        x.send(t);
      } catch (e) {}
    }
    function einmal(key, text, daten) { if (gemeldet[key]) return; gemeldet[key] = 1; melden(text, daten); }

    function portSuchen(fertig) {
      var offen = PORTS.length, ok = false;
      PORTS.forEach(function (p) {
        var x = new XMLHttpRequest();
        x.open('GET', 'http://127.0.0.1:' + p + '/ping?z=' + Date.now());
        x.timeout = 1500;
        x.onreadystatechange = function () {
          if (x.readyState !== 4) return;
          offen--;
          if (!ok && x.status === 200 && String(x.responseText).indexOf('leitwerk') === 0) { ok = true; port = p; fertig(true); }
          if (offen === 0 && !ok) fertig(false);
        };
        try { x.send(); } catch (e) { offen--; if (offen === 0 && !ok) fertig(false); }
      });
    }

    function verbinden() {
      if (lst) return;
      var reg = window.RegisterViewListener;
      if (typeof reg !== 'function') { einmal('noreg', 'fehler: RegisterViewListener gibt es im EFB nicht'); return; }
      try {
        lst = reg('JS_LISTENER_WEATHER', function () {
          bereit = true;
          melden('Wetter-Schnittstelle bereit (EFB-App ' + VERSION + ')');
          lst.on('SetWeatherList', function (l) { liste = l; einmal('liste', 'daten: Liste der Voreinstellungen', l); });
          lst.on('UpdatePreset', function (p) {
            preset = p;
            einmal('preset', 'daten: aktuelle Voreinstellung', p);
            if (wartetAufPreset) { var f = wartetAufPreset; wartetAufPreset = null; f(); }
          });
          lst.on('ON_GAME_TIME_UPDATED', function (d, gesperrt) { zeitDaten = d; einmal('zeit', 'daten: Uhrzeit im Simulator', { d: d, gesperrt: gesperrt }); });
          lst.on('OnFlightTimeUpdated', function (d) { zeitDaten = d; einmal('flugzeit', 'daten: Flugzeit', d); });
          lst.trigger('ASK_WEATHER_LIST');
        });
      } catch (e) { lst = null; einmal('regfehler', 'fehler: Wetter-Schnittstelle nicht erreichbar: ' + e); }
    }

    // Wert in der Einheit setzen, die der Simulator mitliefert (dv = {value, unit, clamp_min, clamp_max})
    function setzen(dv, wert, art) {
      if (!dv || typeof dv !== 'object') return;
      var u = String(dv.unit || '').toLowerCase();
      var v = wert;
      if (art === 'temp') v = /kelvin|^k$/.test(u) ? wert + 273.15 : /fahr|^f$/.test(u) ? wert * 9 / 5 + 32 : wert;
      else if (art === 'druck') v = /inhg|inch/.test(u) ? wert * 0.02953 : /hpa|mbar|millibar/.test(u) ? wert : /pa/.test(u) ? wert * 100 : wert;
      else if (art === 'hoehe') v = /f(ee)?t|foot/.test(u) ? wert * 3.28084 : wert;
      else if (art === 'tempo') v = /km/.test(u) ? wert * 1.852 : /m\/s|mps|meter/.test(u) ? wert * 0.514444 : /mph/.test(u) ? wert * 1.150779 : wert;
      else if (art === 'schnee') v = /cm/.test(u) ? wert * 100 : /in/.test(u) ? wert * 39.37 : wert;
      else if (art === 'zahl' && u === '%') v = wert * 100; // Anteile 0–1 → Prozent (Bedeckung, Gewitter)
      if (typeof dv.clamp_min === 'number' && v < dv.clamp_min) v = dv.clamp_min;
      if (typeof dv.clamp_max === 'number' && dv.clamp_max > dv.clamp_min && v > dv.clamp_max) v = dv.clamp_max;
      dv.value = v;
    }
    // Sichtweite → Dunst (0 = klar … 1 = sehr diesig) im Bereich, den der Simulator erlaubt
    function dunst(dv, sicht) {
      if (!dv || typeof dv !== 'object') return;
      var a = sicht >= 30 ? 0.02 : sicht >= 15 ? 0.12 : sicht >= 8 ? 0.3 : sicht >= 3 ? 0.55 : sicht >= 1 ? 0.75 : 0.9;
      var lo = typeof dv.clamp_min === 'number' ? dv.clamp_min : 0;
      var hi = typeof dv.clamp_max === 'number' && dv.clamp_max > lo ? dv.clamp_max : 1;
      dv.value = lo + (hi - lo) * a;
    }

    // ---- sanfter Übergang: Werte als Zahlen, gemischt nach Fortschritt in SPIELZEIT (läuft mit dem Zeitraffer)
    var ist = null;          // zuletzt gesendete Werte
    var zuletztViertel = -1;
    var von = null, ziel = null, start = 0, dauer = 0, fLetzt = 1, schritte = 20, plan = null, modus = 'bedeckung', fRest = 1;

    function werteVon(wx) {
      var w = [];
      for (var i = 0; i < 3; i++) w.push(wx.wolken && wx.wolken[i] ? { ab: wx.wolken[i].ab, bis: wx.wolken[i].bis, dichte: wx.wolken[i].dichte, bedeckung: wx.wolken[i].bedeckung } : null);
      return { text: wx.text || wx.lage, temp: wx.temp, druck: wx.druck, regen: wx.regen, schnee: wx.schnee, gewitter: wx.gewitter, sicht: wx.sicht, wind: wx.wind, boe: wx.boe, richtung: wx.richtung, art: wx.art, wolken: w };
    }
    function lerp(a, b, f) { return a + (b - a) * f; }
    // weicher Verlauf: am Anfang und am Ende langsamer
    function weich(f) { return f * f * (3 - 2 * f); }
    function gleicheHoehe(A, B) { return A && B && Math.abs(A.ab - B.ab) < 1 && Math.abs(A.bis - B.bis) < 1; }

    // Wolkenplan für einen Übergang: jede Schicht behält ihre Höhe. Gleiche Höhe → am selben Platz weich ändern;
    // sonst blendet die alte Schicht aus und die neue auf einem freien Platz ein (MSFS hat 3 Plätze).
    function wolkenPlan(V, Z) {
      var plan = [null, null, null];
      var frei = [true, true, true];
      var zOffen = [];
      var i, k;
      for (i = 0; i < 3; i++) if (V[i]) { plan[i] = { von: V[i], nach: null }; frei[i] = false; }
      for (k = 0; k < 3; k++) {
        if (!Z[k]) continue;
        var gefunden = -1;
        for (i = 0; i < 3; i++) if (plan[i] && !plan[i].nach && gleicheHoehe(plan[i].von, Z[k])) { gefunden = i; break; }
        if (gefunden >= 0) plan[gefunden].nach = Z[k];
        else zOffen.push(Z[k]);
      }
      for (k = 0; k < zOffen.length; k++) {
        var platz = -1;
        for (i = 0; i < 3; i++) if (frei[i]) { platz = i; break; }
        if (platz < 0) {
          // kein freier Platz: die schwächste ausblendende Schicht ersetzen (selten)
          for (i = 0; i < 3; i++) if (plan[i] && !plan[i].nach) { platz = i; break; }
          if (platz < 0) break;
        }
        frei[platz] = false;
        plan[platz] = { von: null, nach: zOffen[k] };
      }
      return plan;
    }
    function wolkeBei(e, f, modus) {
      if (!e) return null;
      var A = e.von, B = e.nach;
      if (A && B) return { ab: A.ab, bis: A.bis, dichte: lerp(A.dichte, B.dichte, f), bedeckung: lerp(A.bedeckung, B.bedeckung, f) };
      var L = A || B;
      var stark = A ? 1 - f : f; // ausblenden bzw. einblenden
      if (modus === 'dichte') return { ab: L.ab, bis: L.bis, dichte: L.dichte * stark, bedeckung: L.bedeckung };
      return { ab: L.ab, bis: L.bis, dichte: L.dichte, bedeckung: L.bedeckung * stark };
    }
    function mischen(a, b, fRest, fWolken, plan, modus) {
      var d = ((b.richtung - a.richtung + 540) % 360) - 180; // kürzester Weg (Wind dreht über Nord richtig)
      var w = [];
      for (var i = 0; i < 3; i++) w.push(wolkeBei(plan[i], fWolken, modus));
      var f = fRest;
      return {
        text: fWolken >= 1 && fRest >= 1 ? b.text : a.text + ' → ' + b.text,
        temp: lerp(a.temp, b.temp, f), druck: lerp(a.druck, b.druck, f), regen: lerp(a.regen, b.regen, f), schnee: lerp(a.schnee, b.schnee, f),
        gewitter: lerp(a.gewitter, b.gewitter, f), sicht: lerp(a.sicht, b.sicht, f), wind: lerp(a.wind, b.wind, f), boe: lerp(a.boe, b.boe, f),
        richtung: (a.richtung + d * f + 360) % 360, art: f >= 0.5 ? b.art : a.art, wolken: w,
      };
    }
    // Ziel-Wolken auf die Plätze des Plans legen (damit der nächste Übergang von dort weitermacht)
    function zielAufPlaetze(z, plan) {
      var w = [null, null, null];
      for (var i = 0; i < 3; i++) if (plan[i] && plan[i].nach) w[i] = plan[i].nach;
      var r = {};
      for (var k in z) r[k] = z[k];
      r.wolken = w;
      return r;
    }

    function echtSetzen() {
      var live = 0;
      if (liste && liste.length) for (var i = 0; i < liste.length; i++) if (liste[i].live) live = i;
      lst.trigger('CUSTOM_WEATHER_PRESET_CHANGED', live);
      ist = null;
      melden('Echtes Wetter: Live-Wetter im Simulator eingeschaltet');
    }

    function wetterSetzen(wx, wie) {
      if (!preset) { einmal('keinpreset', 'fehler: noch keine Voreinstellung vom Simulator bekommen'); return; }
      // Live-Wetter läuft: erst auf eine Voreinstellung wechseln, dann ändern
      if (preset.index === 0) {
        var ziel = liste && liste[1] ? liste[1].index : 1;
        wartetAufPreset = function () { wetterSetzen(wx, wie); };
        lst.trigger('CUSTOM_WEATHER_PRESET_CHANGED', ziel);
        melden('Live-Wetter aus, wechsle auf Voreinstellung ' + ziel);
        return;
      }
      var p;
      try { p = JSON.parse(JSON.stringify(preset)); } catch (e) { return; }
      var s = p.oSettings || {};
      s.bIsAltitudeAMGL = true;
      setzen(s.dvMSLGLTemperature, wx.temp, 'temp');
      setzen(s.dvMSLPressure, wx.druck, 'druck');
      setzen(s.dvPrecipitation, wx.regen, 'zahl');
      setzen(s.dvSnowCover, wx.schnee, 'schnee');
      setzen(s.dvThunderstormRatio, wx.gewitter, 'zahl');
      dunst(s.dvPollution, wx.sicht);
      if (s.sPrecipitationType !== undefined) s.sPrecipitationType = wx.art;
      p.oSettings = s;
      ist = wx;
      var w = wx.wolken || [];
      var cl = p.tCloudLayers || [];
      for (var c = 0; c < cl.length; c++) {
        var L = cl[c] || {};
        var q = w[c];
        if (q) {
          setzen(L.dvAltitudeBot, q.ab, 'hoehe');
          setzen(L.dvAltitudeTop, q.bis, 'hoehe');
          setzen(L.dvDensityMultiplier, q.dichte, 'zahl');
          setzen(L.dvCoverageRatio, q.bedeckung, 'zahl');
        } else {
          setzen(L.dvCoverageRatio, 0, 'zahl');
          setzen(L.dvDensityMultiplier, 0, 'zahl');
        }
        L.__Type = 'CloudLayerData';
      }
      var wl = p.tWindLayers || [];
      for (var k = 0; k < wl.length; k++) {
        var W = wl[k] || {};
        var faktor = k === 0 ? 1 : 1.3;
        setzen(W.dvSpeed, wx.wind * faktor, 'tempo');
        if (W.dvAngleRad) W.dvAngleRad.value = (((wx.richtung + (k ? 10 : 0)) % 360) * Math.PI) / 180;
        if (W.gustWaveData) {
          if (W.gustWaveData.dvSpeedMultiplier) W.gustWaveData.dvSpeedMultiplier.value = wx.wind > 0 ? Math.min(2, 1 + wx.boe / wx.wind) : 1;
          if (W.gustWaveData.dvAngleRad) W.gustWaveData.dvAngleRad.value = W.dvAngleRad ? W.dvAngleRad.value : 0;
        }
        W.__Type = 'WindLayerData';
      }
      try {
        lst.call('UpdateTempWeatherPreset', p).then(function (antwort) {
          if (wie) melden('Wetter ' + wie + ': ' + wx.text + ', ' + Math.round(wx.temp) + ' °C, Wind ' + Math.round(wx.wind) + ' kt aus ' + Math.round(wx.richtung) + '°');
          else if (Math.floor(fLetzt * 4) !== zuletztViertel) { zuletztViertel = Math.floor(fLetzt * 4); melden('Übergang ' + Math.round(fLetzt * 100) + ' %: ' + wx.text); }
          einmal('antwort', 'daten: Antwort auf UpdateTempWeatherPreset', antwort);
          einmal('gesendet', 'daten: gesendete Voreinstellung', p);
        }).catch(function (e) { melden('fehler: Wetter nicht gesetzt', e); });
      } catch (e) { melden('fehler: UpdateTempWeatherPreset: ' + e); }
    }

    function zeitSetzen(ms) {
      var d = new Date(ms);
      // Monat wird mitgeschickt wie im Datumsfeld des Wettermenüs; Rückmeldung zeigt, was der Simulator daraus macht
      lst.trigger('SET_DATE', d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear());
      lst.trigger('SET_ZULU_TIME', d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds());
      zeitGesetzt = Date.now();
      zeitSoll = ms;
      melden('Uhrzeit gesetzt: ' + d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
      setTimeout(function () { melden('daten: Uhrzeit danach', zeitDaten); }, 3000);
    }

    function takt() {
      if (!port) { portSuchen(function (ok) { if (ok) verbinden(); }); return; }
      verbinden();
      if (!bereit) return;
      var x = new XMLHttpRequest();
      x.open('GET', 'http://127.0.0.1:' + port + '/stand?z=' + Date.now());
      x.timeout = 2500;
      x.onreadystatechange = function () {
        if (x.readyState !== 4) return;
        if (x.status !== 200) { port = null; return; }
        var st;
        try { st = JSON.parse(x.responseText); } catch (e) { return; }
        var wx = st && st.neu && st.neu.wx;
        if (!wx) return;
        if (wx.zeit) {
          // MSFS läuft in Echtzeit weiter; im Zeitraffer von LeitWerk öfter nachziehen, in der Pause nicht zurückstellen
          var erwartet = zeitSoll + (Date.now() - zeitGesetzt);
          var grenze = wx.tempo > 1 ? 5000 : 60000;
          if (!zeitGesetzt || (wx.tempo !== 0 && Math.abs(wx.zeit - erwartet) > grenze)) zeitSetzen(wx.zeit);
        }
        if (wx.nurZeit) return;
        if (!preset) {
          // keine Voreinstellung bekommen: eine auswählen, damit der Simulator sie schickt
          if (!bereitSeit) bereitSeit = Date.now();
          if (Date.now() - bereitSeit > 10000 && !angestossen && liste && liste.length > 1) {
            angestossen = true;
            lst.trigger('CUSTOM_WEATHER_PRESET_CHANGED', liste[1].index);
            melden('noch keine Voreinstellung – wähle Voreinstellung ' + liste[1].index);
          }
          return;
        }
        var key = wx.echt ? 'echt' : [wx.lage, Math.round(wx.wind / 5), Math.round(wx.richtung / 30), wx.temp].join('|');
        var jetzt = wx.jetzt || wx.zeit || 0;
        if (key !== letzt) {
          letzt = key;
          if (wx.echt) { dauer = 0; echtSetzen(); return; }
          var z = werteVon(wx);
          if (!ist || !wx.ueb) {
            // Beitreten (oder „sofort“): gleich ganz setzen
            dauer = 0; fLetzt = 1; von = z; ziel = z;
            wetterSetzen(z, 'gesetzt');
          } else {
            // laufender Übergang: vom gerade gezeigten Zwischenstand weiter
            von = ist; plan = wolkenPlan(ist.wolken, z.wolken); ziel = zielAufPlaetze(z, plan);
            start = jetzt; dauer = wx.ueb * 60000; fLetzt = 0; fRest = 0; zuletztViertel = -1;
            schritte = wx.ueb <= 3 ? 12 : 20;
            modus = wx.wolkenModus === 'dichte' ? 'dichte' : 'bedeckung';
            melden('Übergang zu ' + z.text + ' über ' + wx.ueb + ' Spielminuten – Wolken über ' + (modus === 'dichte' ? 'Dichte' : 'Bedeckung') + ', Rest in ' + schritte + ' Schritten');
          }
        }
        if (dauer > 0 && fLetzt < 1) {
          var f = Math.max(0, Math.min(1, (jetzt - start) / dauer));
          if (f > fLetzt) {
            // Wolken: bei jeder Abfrage ein kleines Stück (alle 2,5 s); Rest nur in seinen Schritten
            if (f >= 1 || f - fRest >= 1 / schritte - 1e-6) fRest = f;
            fLetzt = f;
            var m = mischen(von, ziel, weich(fRest), weich(f), plan, modus);
            if (f >= 1) { m = ziel; plan = null; }
            wetterSetzen(m, f >= 1 ? 'fertig' : null);
          }
        }
      };
      try { x.send(); } catch (e) { port = null; }
    }

    return {
      start: function () {
        setInterval(takt, 2500);
        takt();
      },
    };
  })();

  // EFB und diese Datei laden unabhängig voneinander; use() geht erst, wenn das EFB bereit ist (bis ca. 15 s versuchen)
  var VERSUCH_MS = 100;
  var VERSUCHE = 150;
  function anmelden(n) {
    var ok = false;
    try { ok = registerApp(); } catch (e) { ok = false; }
    if (!ok && n < VERSUCHE) window.setTimeout(function () { anmelden(n + 1); }, VERSUCH_MS);
  }
  anmelden(1);
  try { Wetter.start(); } catch (e) { /* Test */ }
})();
