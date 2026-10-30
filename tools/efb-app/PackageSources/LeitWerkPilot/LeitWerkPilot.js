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
  var VERSION = '0.1.0';
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

  // EFB und diese Datei laden unabhängig voneinander; use() geht erst, wenn das EFB bereit ist (bis ca. 15 s versuchen)
  var VERSUCH_MS = 100;
  var VERSUCHE = 150;
  function anmelden(n) {
    var ok = false;
    try { ok = registerApp(); } catch (e) { ok = false; }
    if (!ok && n < VERSUCHE) window.setTimeout(function () { anmelden(n + 1); }, VERSUCH_MS);
  }
  anmelden(1);
})();
