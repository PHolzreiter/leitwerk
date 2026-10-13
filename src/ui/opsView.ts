/** Leitstellen-Oberfläche: Einsatzliste, Fahrzeugliste, Einsatzmaske, Funk. */
import { HOSPITAL_FLAGS, HOSPITAL_FLAG_LABEL, type HospitalFlag } from "../data/model";
import { store } from "../data/store";
import { findCode, hasCodes, searchCodes, type Einsatzcode } from "../sim/codes";
import { ALLE_QUALIS, REGELN, besetzungKurz, generiereBesetzung, hatNFS, pruefeBesetzung, type Platz, type Quali } from "../sim/crew";
import { sim, type Einsatz, type Ort, type SimFahrzeug } from "../sim/engine";
import { mp } from "../net/mehrspieler";
import { distanceM, searchAddress, type AddressHit } from "../sim/geo";
import { KATEGORIE_LABEL, type StatusKey } from "../sim/settings";
import { openDialog } from "./dialog";
import { ensureCodes } from "./codesPrompt";
import { el, esc, toast } from "./dom";

export interface OpsDeps {
  flyTo(lat: number, lon: number, zoom?: number): void;
  pickOnMap(hint: string): Promise<{ lat: number; lon: number } | null>;
  onSelectIncident(id: string | null): void;
}

const STUFE_FARBE: Record<string, string> = {
  rot: "#e53935",
  orange: "#fb8c00",
  gelb: "#fdd835",
  grün: "#7cb342",
};

export function stufeFarbe(stufe: string | undefined): string {
  if (!stufe) return "#6b7280";
  for (const [k, v] of Object.entries(STUFE_FARBE)) if (stufe.includes(k)) return v;
  return "#90a4ae";
}

function uhr(t: number): string {
  return new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}

function minuten(sek: number | null): string {
  if (sek === null) return "–";
  return `${Math.max(1, Math.round(sek / 60))} min`;
}

function crewHtml(fz: SimFahrzeug): string {
  if (!fz.besetzung.length) return "";
  const nfs = hatNFS(fz.besetzung);
  return `<span class="crew${nfs ? " nfs" : ""}" title="${esc(fz.besetzung.map((p) => `${p.rolle}: ${p.quali}`).join("\n"))}">${esc(besetzungKurz(fz.besetzung))}</span>`;
}

/** Dialog „Besetzung ändern“ */
function besetzungDialog(fz: SimFahrzeug): void {
  const regeln = REGELN[fz.rmTyp];
  const body = el("div", { class: "crew-edit" });
  const intro = el("div", { class: "muted" }, `${fz.funkrufname} · ${fz.rmTyp}. Leere Auswahl = Platz nicht besetzt.`);
  body.appendChild(intro);
  const selects: { rolle: string; sel: HTMLSelectElement }[] = [];
  const rollen = regeln.length ? regeln.map((r) => r.rolle) : fz.besetzung.map((p) => p.rolle);
  for (const rolle of rollen) {
    const row = el("label", { class: "crew-row" });
    row.appendChild(el("span", {}, rolle));
    const sel = el("select");
    sel.appendChild(el("option", { value: "" }, "– nicht besetzt –"));
    for (const q of ALLE_QUALIS) sel.appendChild(el("option", { value: q }, q));
    sel.value = fz.besetzung.find((p) => p.rolle === rolle)?.quali ?? "";
    row.appendChild(sel);
    selects.push({ rolle, sel });
    body.appendChild(row);
  }
  const warn = el("div", { class: "alert-text" });
  body.appendChild(warn);
  const lese = (): Platz[] =>
    selects.filter((x) => x.sel.value).map((x) => ({ rolle: x.rolle, quali: x.sel.value as Quali }));
  const pruefe = () => {
    warn.textContent = pruefeBesetzung(fz.rmTyp, lese()).join(" · ");
  };
  selects.forEach((x) => x.sel.addEventListener("change", pruefe));
  pruefe();
  openDialog({
    title: "Besetzung ändern",
    body,
    actions: [
      {
        label: "Zufällig neu",
        onClick: () => {
          const b = generiereBesetzung(fz.rmTyp);
          for (const x of selects) x.sel.value = b.find((p) => p.rolle === x.rolle)?.quali ?? "";
          pruefe();
          return false;
        },
      },
      { label: "Abbrechen" },
      {
        label: "Übernehmen",
        kind: "primary",
        onClick: () => {
          void sim.call("setzeBesetzung", fz.id, lese()).catch((e) => toast(String(e.message ?? e), "error"));
          toast(`Besetzung ${fz.funkrufname} geändert`);
        },
      },
    ],
  });
}

/** Fehler eines Befehls (z. B. keine Berechtigung im Multiplayer) als Meldung zeigen */
async function fehlerZeigen(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (e) {
    toast(String((e as Error).message ?? e), "error");
  }
}

/** Multiplayer: wer arbeitet an dem Einsatz (offline = Entwurf, den andere übernehmen können) */
function bearbeiterHtml(e: Einsatz): string {
  if (!mp.aktiv || !e.bearbeiter || e.zustand === "abgeschlossen") return "";
  const sp = mp.spieler.find((s) => s.pid === e.bearbeiter!.pid);
  const ich = e.bearbeiter.pid === mp.ich.pid;
  if (sp && !sp.online) return `<div class="bearbeiter entwurf">Entwurf von ${esc(e.bearbeiter.name)} (offline) – kann übernommen werden</div>`;
  return `<div class="bearbeiter${ich ? " ich" : ""}">👤 ${ich ? "du" : esc(e.bearbeiter.name)}</div>`;
}

function statusChip(fz: SimFahrzeug): string {
  const d = sim.statusDef(fz.status);
  return `<span class="st-chip" style="background:${d.farbe}" title="${esc(d.name)}">${esc(d.nummer)}</span>`;
}

/** Adress-Eingabe mit Vorschlägen. */
function addressInput(placeholder: string, onPick: (o: Ort) => void): { root: HTMLElement; input: HTMLInputElement } {
  const root = el("div", { class: "addr" });
  const input = el("input", { type: "text", placeholder });
  const list = el("div", { class: "addr-list", hidden: "" });
  root.append(input, list);
  let timer: number | undefined;
  let hits: AddressHit[] = [];
  const choose = (h: AddressHit) => {
    input.value = h.label;
    list.hidden = true;
    onPick({ lat: h.lat, lon: h.lon, label: h.label });
  };
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try {
        hits = await searchAddress(input.value, 12);
      } catch (e) {
        hits = [];
        list.innerHTML = `<div class="addr-item muted">${esc(String(e))}</div>`;
        list.hidden = false;
        return;
      }
      list.innerHTML = "";
      for (const h of hits) {
        const it = el("div", { class: "addr-item" }, h.label);
        if (h.place) it.classList.add("place");
        it.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          choose(h);
        });
        list.appendChild(it);
      }
      list.hidden = hits.length === 0;
    }, 250);
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && hits[0]) {
      ev.preventDefault();
      choose(hits[0]);
    }
  });
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
  return { root, input };
}

type Tab = "einsatz" | "funk" | "chat";

export function createOpsView(left: HTMLElement, right: HTMLElement, deps: OpsDeps): { select(id: string | null): void } {
  let selected: string | null = null;
  let showClosed = false;
  let rightTab: Tab = "funk";

  // ------------------------------------------------------------ linke Seite
  left.innerHTML = `
    <section class="ops-sec ops-inc">
      <div class="ops-head">
        <span>Einsätze</span>
        <label class="chk small"><input type="checkbox" class="inc-closed" />abgeschlossene</label>
        <button class="btn small" data-act="gen">+ Testeinsatz</button>
      </div>
      <div class="ops-list inc-list"></div>
    </section>
    <section class="ops-sec ops-veh">
      <div class="ops-head"><span>Fahrzeuge</span><input class="veh-filter" type="search" placeholder="Filter …" /></div>
      <div class="ops-list veh-list"></div>
    </section>`;
  const incList = left.querySelector<HTMLElement>(".inc-list")!;
  const vehList = left.querySelector<HTMLElement>(".veh-list")!;
  const vehFilter = left.querySelector<HTMLInputElement>(".veh-filter")!;
  left.querySelector<HTMLInputElement>(".inc-closed")!.addEventListener("change", (e) => {
    showClosed = (e.target as HTMLInputElement).checked;
    renderLists();
  });
  left.querySelector<HTMLButtonElement>("[data-act=gen]")!.addEventListener("click", async () => {
    if (!ensureCodes()) return;
    const e = await sim.call("generiere").catch((err) => (toast(String(err.message ?? err), "error"), null));
    // Als Mitspieler kommt der neue Einsatz erst mit dem nächsten Abgleich
    for (let i = 0; e && !sim.einsatz(e.id) && i < 20; i++) await new Promise((r) => setTimeout(r, 100));
    if (e) select(e.id);
    else toast("Kein Einsatz erzeugt – Adressen noch nicht geladen?", "error");
  });
  vehFilter.addEventListener("input", () => renderLists());

  function renderLists() {
    // Einsätze
    const list = sim.state.einsaetze.filter((e) => showClosed || e.zustand !== "abgeschlossen");
    const order = { neu: 0, offen: 1, laufend: 2, abgeschlossen: 3 };
    list.sort((a, b) => order[a.zustand] - order[b.zustand] || b.erstellt - a.erstellt);
    incList.innerHTML = "";
    for (const e of list) {
      const c = findCode(e.code ?? undefined);
      const row = el("div", { class: `inc-row z-${e.zustand}${e.id === selected ? " sel" : ""}` });
      const warn = e.adressePruefen || e.khAnfrage ? `<span class="warn-dot" title="Rückfrage offen">!</span>` : "";
      row.innerHTML = `
        <span class="inc-stufe" style="background:${stufeFarbe(c?.stufe)}"></span>
        <div class="inc-main">
          <div><b>${esc(e.nummer)}</b> · ${uhr(e.erstellt)} ${warn}</div>
          <div class="muted">${esc(c ? `${c.code} ${c.beschreibung}` : "Code fehlt")}</div>
          <div class="muted">${esc(e.adresse?.label ?? "Adresse fehlt")}</div>
          ${bearbeiterHtml(e)}
        </div>
        <span class="inc-state">${{ neu: "NEU", offen: "offen", laufend: `${e.fahrzeuge.length} Fz`, abgeschlossen: "erl." }[e.zustand]}</span>`;
      row.addEventListener("click", () => select(e.id));
      incList.appendChild(row);
    }
    if (list.length === 0) incList.innerHTML = `<div class="muted pad">Keine offenen Einsätze. Die Simulation erzeugt Einsätze, wenn die Uhr läuft.</div>`;

    // Fahrzeuge nach Dienststelle
    const q = vehFilter.value.trim().toLowerCase();
    const groups = new Map<string, SimFahrzeug[]>();
    for (const fz of Object.values(sim.state.fahrzeuge)) {
      if (q && !`${fz.funkrufname} ${fz.kurzname} ${fz.stationName}`.toLowerCase().includes(q)) continue;
      const g = groups.get(fz.stationName) ?? [];
      g.push(fz);
      groups.set(fz.stationName, g);
    }
    vehList.innerHTML = "";
    for (const [name, fzs] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"))) {
      const head = el("div", { class: "veh-group" }, name);
      vehList.appendChild(head);
      for (const fz of fzs.sort((a, b) => a.funkrufname.localeCompare(b.funkrufname))) {
        const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
        const row = el("div", { class: "veh-row" });
        row.innerHTML = `${statusChip(fz)}<b>${esc(fz.funkrufname)}</b><span class="muted">${esc(fz.rmTyp)}${fz.kurzname ? " · " + esc(fz.kurzname) : ""}</span>${crewHtml(fz)}<span class="spacer"></span><span class="muted">${esc(e?.nummer ?? "")}</span>`;
        row.addEventListener("click", () => {
          deps.flyTo(fz.lat, fz.lon, 13);
          if (e) select(e.id);
        });
        row.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          statusMenu(fz, ev.clientX, ev.clientY);
        });
        vehList.appendChild(row);
      }
    }
  }

  function statusMenu(fz: SimFahrzeug, x: number, y: number) {
    document.querySelector(".ctx-menu.status")?.remove();
    const m = el("div", { class: "ctx-menu status" });
    m.style.position = "fixed";
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    m.appendChild(el("div", { class: "ctx-title" }, `${fz.funkrufname} – Status setzen`));
    for (const key of ["freiWache", "freiFunk", "bereitschaft", "dienstfahrt", "abgemeldet"] as StatusKey[]) {
      const d = sim.statusDef(key);
      const b = el("button", {}, `${d.nummer} – ${d.name}`);
      b.addEventListener("click", async () => {
        m.remove();
        const err = await sim.call("manualStatus", fz.id, key).catch((x) => String(x.message ?? x));
        if (err) toast(err, "error");
      });
      m.appendChild(b);
    }
    if (fz.besetzung.length || REGELN[fz.rmTyp].length) {
      const b = el("button", {}, "Besetzung ändern …");
      b.addEventListener("click", () => {
        m.remove();
        besetzungDialog(fz);
      });
      m.appendChild(b);
    }
    if (fz.einsatzId) {
      const b = el("button", {}, "Aus dem Einsatz freigeben");
      b.addEventListener("click", () => {
        m.remove();
        void fehlerZeigen(sim.call("entlasse", fz.id));
      });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    setTimeout(() => document.addEventListener("mousedown", function off(ev) {
      if (!m.contains(ev.target as Node)) {
        m.remove();
        document.removeEventListener("mousedown", off);
      }
    }), 0);
  }

  // ------------------------------------------------------------ rechte Seite
  right.innerHTML = `
    <div class="rtabs">
      <button class="rtab" data-tab="einsatz">Einsatz</button>
      <button class="rtab" data-tab="funk">Funk <span class="funk-badge" hidden></span></button>
      <button class="rtab" data-tab="chat" hidden>Chat <span class="funk-badge chat-badge" hidden></span></button>
    </div>
    <div class="rbody rb-einsatz"></div>
    <div class="rbody rb-funk"></div>
    <div class="rbody rb-chat"><div class="chat-list"></div><form class="chat-form"><input type="text" maxlength="500" placeholder="Nachricht an alle Disponenten …" /><button class="btn small primary">Senden</button></form></div>`;
  const rbEinsatz = right.querySelector<HTMLElement>(".rb-einsatz")!;
  const rbFunk = right.querySelector<HTMLElement>(".rb-funk")!;
  const funkBadge = right.querySelector<HTMLElement>(".funk-badge")!;
  const rbChat = right.querySelector<HTMLElement>(".rb-chat")!;
  const chatTab = right.querySelector<HTMLButtonElement>(".rtab[data-tab=chat]")!;
  const chatBadge = right.querySelector<HTMLElement>(".chat-badge")!;
  const chatList = rbChat.querySelector<HTMLElement>(".chat-list")!;
  const chatForm = rbChat.querySelector<HTMLFormElement>(".chat-form")!;
  const chatInput = chatForm.querySelector<HTMLInputElement>("input")!;
  right.querySelectorAll<HTMLButtonElement>(".rtab").forEach((b) =>
    b.addEventListener("click", () => setTab(b.dataset.tab as Tab)),
  );
  chatForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = chatInput.value.trim();
    if (!t) return;
    chatInput.value = "";
    void fehlerZeigen(sim.call("chat", t));
  });

  function setTab(t: Tab) {
    rightTab = t;
    right.querySelectorAll<HTMLButtonElement>(".rtab").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    rbEinsatz.hidden = t !== "einsatz";
    rbFunk.hidden = t !== "funk";
    rbChat.hidden = t !== "chat";
    if (t === "chat") {
      mp.ungeleseneChats = 0;
      renderChat();
      chatInput.focus();
    }
  }

  let chatGezeigt = -1;
  function renderChat() {
    chatTab.hidden = !mp.aktiv;
    if (!mp.aktiv && rightTab === "chat") setTab("funk");
    const n = mp.ungeleseneChats;
    chatBadge.hidden = n === 0 || rightTab === "chat";
    chatBadge.textContent = String(n);
    if (rightTab === "chat") mp.ungeleseneChats = 0;
    const msgs = sim.state.chat ?? [];
    if (msgs.length === chatGezeigt) return;
    chatGezeigt = msgs.length;
    chatList.innerHTML = msgs.length
      ? msgs
          .map(
            (m) =>
              `<div class="chat-row${m.von === mp.ich.name ? " ich" : ""}"><span class="muted">${new Date(m.zeit).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}</span> <b>${esc(m.von)}</b><div>${esc(m.text)}</div></div>`,
          )
          .join("")
      : `<div class="muted pad">Noch keine Nachrichten. Hier schreiben sich die Disponenten untereinander.</div>`;
    chatList.scrollTop = chatList.scrollHeight;
  }
  mp.onChange(() => renderChat());

  function renderFunk() {
    const offen = sim.state.funk.filter((f) => !f.quittiert).length;
    funkBadge.hidden = offen === 0;
    funkBadge.textContent = String(offen);
    rbFunk.innerHTML = "";
    for (const f of sim.state.funk.slice(0, 120)) {
      const row = el("div", { class: `funk-row art-${f.art}${f.quittiert ? "" : " offen"}` });
      const e = f.einsatzId ? sim.einsatz(f.einsatzId) : undefined;
      row.innerHTML = `<span class="muted">${uhr(f.zeit)}</span> <b>${esc(f.von)}</b>${e ? ` <span class="muted">${esc(e.nummer)}</span>` : ""}<div>${esc(f.text)}</div>`;
      row.addEventListener("click", () => {
        if (!f.quittiert) void fehlerZeigen(sim.call("quittiere", f.id));
        if (e) select(e.id);
      });
      rbFunk.appendChild(row);
    }
    if (sim.state.funk.length === 0) rbFunk.innerHTML = `<div class="muted pad">Noch keine Funkmeldungen.</div>`;
  }

  // ------------------------------------------------------------ Einsatzmaske
  let maskFor: string | null = null;
  let dyn: { refresh(): void } | null = null;

  function buildMask(e: Einsatz) {
    maskFor = e.id;
    rbEinsatz.innerHTML = "";
    const root = el("div", { class: "mask" });
    rbEinsatz.appendChild(root);

    const head = el("div", { class: "mask-head" });
    root.appendChild(head);

    // Meldung
    const meld = el("div", { class: "mask-box meldung" });
    meld.innerHTML = `<div class="box-title">Meldung</div><div class="meld-text">${esc(e.meldung.text)}</div>
      <div class="muted">Gemeldete Adresse: <b class="meld-adr">${esc(e.meldung.adresse)}</b></div>`;
    const meldActions = el("div", { class: "row-btns" });
    const btnUse = el("button", { class: "btn small" }, "Adresse suchen");
    const btnRueck = el("button", { class: "btn small" }, "Rückruf beim Anrufer");
    meldActions.append(btnUse, btnRueck);
    meld.appendChild(meldActions);
    const rueckOut = el("div", { class: "rueck muted" });
    meld.appendChild(rueckOut);
    root.appendChild(meld);

    // Code
    const codeBox = el("div", { class: "mask-box" });
    codeBox.innerHTML = `<div class="box-title">AMPDS-Code</div>`;
    const codeInput = el("input", { type: "text", placeholder: "Code oder Stichwort suchen, z. B. „Brust“ oder „RD-10“" });
    const codeList = el("div", { class: "addr-list", hidden: "" });
    const codeInfo = el("div", { class: "code-info" });
    const codeWrap = el("div", { class: "addr" });
    codeWrap.append(codeInput, codeList);
    codeBox.append(codeWrap, codeInfo);
    root.appendChild(codeBox);
    const showCode = () => {
      const c = findCode(e.code ?? undefined);
      if (!c) {
        codeInfo.innerHTML = hasCodes()
          ? `<span class="muted">Noch kein Code.</span>`
          : `<span class="alert-text">Keine Einsatzcodes vorhanden – bitte unter Daten → Einsatzcodes importieren.</span>`;
        return;
      }
      const st = sim.stufeVon(e);
      codeInfo.innerHTML = `<span class="stufe-badge" style="background:${stufeFarbe(c.stufe)}">${esc(c.stufe)}</span>
        <b>${esc(c.code)}</b> ${esc(c.beschreibung)}
        <div class="muted">${esc(c.gruppenname)} · ${st ? `${esc(st.rettungsmittel.replace(/>/g, " › ") || "kein Fahrzeug")}${st.nfsErforderlich ? " · NFS" : ""}${st.notarzt !== "nein" ? " · Notarzt" : ""} · ${st.sondersignal ? "mit" : "ohne"} Sondersignal · ${KATEGORIE_LABEL[st.kategorie]}` : "Stufe nicht zugeordnet"}</div>`;
    };
    codeInput.addEventListener("input", () => {
      const hits = searchCodes(codeInput.value, 40);
      codeList.innerHTML = "";
      for (const c of hits) {
        const it = el("div", { class: "addr-item" });
        it.innerHTML = `<span class="stufe-dot" style="background:${stufeFarbe(c.stufe)}"></span><b>${esc(c.code)}</b> ${esc(c.beschreibung)} <span class="muted">· ${esc(c.stufe)}</span>`;
        it.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          pickCode(c);
        });
        codeList.appendChild(it);
      }
      codeList.hidden = hits.length === 0;
    });
    codeInput.addEventListener("blur", () => setTimeout(() => (codeList.hidden = true), 150));
    const pickCode = (c: Einsatzcode) => {
      codeInput.value = "";
      codeList.hidden = true;
      void fehlerZeigen(sim.call("aktualisiere", e.id, { code: c.code }));
      showCode();
      void refreshSuggestions();
    };
    showCode();

    // Adresse
    const adrBox = el("div", { class: "mask-box" });
    adrBox.innerHTML = `<div class="box-title">Einsatzort (Berufungsort)</div>`;
    const adr = addressInput("Straße Hausnummer Ort …", (o) => {
      void fehlerZeigen(sim.call("aktualisiere", e.id, { adresse: o }));
      deps.flyTo(o.lat, o.lon, 15);
      void refreshSuggestions();
    });
    if (e.adresse) adr.input.value = e.adresse.label;
    const adrRow = el("div", { class: "row-btns" });
    const btnPick = el("button", { class: "btn small" }, "Auf der Karte wählen");
    btnPick.addEventListener("click", async () => {
      const p = await deps.pickOnMap("Einsatzort anklicken");
      if (!p) return;
      const label = `Koordinate ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
      adr.input.value = label;
      void fehlerZeigen(sim.call("aktualisiere", e.id, { adresse: { ...p, label } }));
      void refreshSuggestions();
    });
    adrRow.appendChild(btnPick);
    const zusatz = el("input", { type: "text", placeholder: "Zusatz (Stiege, Stock, Tür, Zufahrt …)" });
    zusatz.value = e.zusatz;
    zusatz.addEventListener("change", () => void fehlerZeigen(sim.call("aktualisiere", e.id, { zusatz: zusatz.value })));
    adrBox.append(adr.root, adrRow, zusatz);
    root.appendChild(adrBox);

    btnUse.addEventListener("click", () => {
      adr.input.value = e.meldung.adresse;
      adr.input.dispatchEvent(new Event("input"));
      adr.input.focus();
    });
    btnRueck.addEventListener("click", async () => {
      const a = await sim.call("rueckruf", e.id).catch((x) => (toast(String(x.message ?? x), "error"), null));
      rueckOut.innerHTML = `Anrufer bestätigt: <b>${esc(a ?? "")}</b>`;
    });
    if (e.rueckrufGemacht) rueckOut.innerHTML = `Anrufer bestätigt: <b>${esc(e.wahr.adresse)}</b>`;

    // Infos
    const infoBox = el("div", { class: "mask-box" });
    infoBox.innerHTML = `<div class="box-title">Informationen</div>`;
    const infoRtw = el("textarea", { rows: "2", placeholder: "Info an die Fahrzeuge (z. B. Zufahrt über Hof, Hund im Haus)" });
    infoRtw.value = e.infoRtw;
    infoRtw.addEventListener("change", () => void fehlerZeigen(sim.call("aktualisiere", e.id, { infoRtw: infoRtw.value })));
    const infoIntern = el("textarea", { rows: "2", placeholder: "Interne Info für die Leitstelle" });
    infoIntern.value = e.infoIntern;
    infoIntern.addEventListener("change", () => void fehlerZeigen(sim.call("aktualisiere", e.id, { infoIntern: infoIntern.value })));
    infoBox.append(el("div", { class: "fld-label" }, "Info an RTW"), infoRtw, el("div", { class: "fld-label" }, "Interne Info"), infoIntern);
    root.appendChild(infoBox);

    // Alarmierung
    const alarmBox = el("div", { class: "mask-box" });
    alarmBox.innerHTML = `<div class="box-title">Fahrzeuge</div>`;
    const assigned = el("div", { class: "assigned" });
    const sugg = el("div", { class: "sugg" });
    const alarmRow = el("div", { class: "row-btns" });
    const btnAlarm = el("button", { class: "btn primary" }, "Alarmieren");
    const btnClose = el("button", { class: "btn" }, "Einsatz schließen");
    alarmRow.append(btnAlarm, btnClose);
    alarmBox.append(assigned, sugg, alarmRow);
    root.appendChild(alarmBox);

    // KH / BO / ZO
    const khBox = el("div", { class: "mask-box" });
    khBox.innerHTML = `<div class="box-title">Krankenhaus · Berufungs- und Zielort</div>`;
    const khInfo = el("div", { class: "kh-info" });
    const grundSel = el("select");
    for (const f of HOSPITAL_FLAGS) grundSel.appendChild(el("option", { value: f }, HOSPITAL_FLAG_LABEL[f]));
    const khSel = el("select");
    const btnBook = el("button", { class: "btn small" }, "KH buchen");
    const khRow = el("div", { class: "kh-row" });
    khRow.append(grundSel, khSel, btnBook);
    const boZo = el("div", { class: "muted bozo" });
    const zo = addressInput("Zielort (frei, z. B. für Krankentransport)", (o) => void fehlerZeigen(sim.call("aktualisiere", e.id, { zo: o })));
    khBox.append(khInfo, khRow, boZo, el("div", { class: "fld-label" }, "Zielort manuell"), zo.root);
    root.appendChild(khBox);

    const fillKh = () => {
      const grund = grundSel.value as HospitalFlag;
      const pos = e.adresse ?? e.wahr;
      const list = store
        .list("hospitals")
        .filter((h) => h.abteilungen[grund])
        .map((h) => ({ h, d: distanceM(pos, h) }))
        .sort((a, b) => a.d - b.d);
      khSel.innerHTML = "";
      for (const { h, d } of list) khSel.appendChild(el("option", { value: h.id }, `${h.kurzname || h.name} (${(d / 1000).toFixed(0)} km)`));
      if (list.length === 0) khSel.appendChild(el("option", { value: "" }, "kein KH mit dieser Abteilung"));
    };
    grundSel.addEventListener("change", fillKh);
    btnBook.addEventListener("click", () => {
      if (!khSel.value) return;
      void fehlerZeigen(sim.call("bucheKh", e.id, khSel.value, grundSel.value as HospitalFlag));
      toast("Krankenhaus gebucht");
    });
    if (e.khAnfrage) grundSel.value = e.khAnfrage.abteilung;
    fillKh();

    // Protokoll
    const protBox = el("div", { class: "mask-box" });
    protBox.innerHTML = `<div class="box-title">Protokoll</div>`;
    const prot = el("div", { class: "prot" });
    protBox.appendChild(prot);
    root.appendChild(protBox);

    // ---------- dynamische Teile
    let suggestions: Awaited<ReturnType<typeof sim.vorschlaege>> = [];
    const chosen = new Set<string>();
    let suggestFor = "";
    let empfohlen = new Set<string>();
    let gruende: string[] = [];

    async function refreshSuggestions() {
      if (!e.adresse) {
        sugg.innerHTML = `<div class="muted">Für Vorschläge zuerst den Einsatzort eingeben.</div>`;
        return;
      }
      const key = `${e.adresse.lat},${e.adresse.lon},${e.code}`;
      suggestFor = key;
      sugg.innerHTML = `<div class="muted">Fahrzeiten werden berechnet …</div>`;
      const res = await sim.vorschlaege(e.id);
      if (suggestFor !== key) return;
      suggestions = res;
      // Vorauswahl nach Stufe (Rangfolge, NFS, Notarzt; bereits alarmierte zählen mit)
      chosen.clear();
      const emp = sim.empfehlung(e.id, res);
      for (const id of emp.ids) chosen.add(id);
      empfohlen = new Set(emp.ids);
      gruende = emp.gruende;
      // Empfohlene zuerst, damit sie nicht aus der Liste fallen
      suggestions = [...res.filter((r) => empfohlen.has(r.fz.id)), ...res.filter((r) => !empfohlen.has(r.fz.id))];
      renderSuggestions();
    }

    function renderSuggestions() {
      sugg.innerHTML = "";
      if (gruende.length) {
        sugg.appendChild(el("div", { class: "sugg-why" }, gruende.join(" · ")));
      }
      const shown = suggestions.slice(0, 14);
      for (const s of shown) {
        const row = el("label", { class: `sugg-row${s.hinweis ? " blocked" : ""}${empfohlen.has(s.fz.id) ? " rec" : ""}` });
        const cb = el("input", { type: "checkbox" });
        cb.checked = chosen.has(s.fz.id);
        cb.disabled = !!s.hinweis;
        cb.addEventListener("change", () => (cb.checked ? chosen.add(s.fz.id) : chosen.delete(s.fz.id)));
        row.appendChild(cb);
        const info = el("span", { class: "sugg-info" });
        info.innerHTML = `${statusChip(s.fz)} <b>${esc(s.fz.funkrufname)}</b> <span class="muted">${esc(s.fz.rmTyp)} · ${esc(s.fz.stationName)}</span> ${crewHtml(s.fz)}`;
        row.appendChild(info);
        row.appendChild(el("span", { class: "sugg-eta" }, s.hinweis ? s.hinweis : minuten(s.sekunden)));
        sugg.appendChild(row);
      }
      if (shown.length === 0) sugg.appendChild(el("div", { class: "muted" }, "Keine freien Fahrzeuge."));
    }

    btnAlarm.addEventListener("click", async () => {
      if (chosen.size === 0) return toast("Bitte Fahrzeuge auswählen", "error");
      const hinweise = await sim.call("alarmiere", e.id, [...chosen]).catch((x) => [String(x.message ?? x)]);
      for (const h of hinweise) toast(h, "error");
      void refreshSuggestions();
    });
    btnClose.addEventListener("click", () => {
      void fehlerZeigen(sim.call("schliesse", e.id, e.fahrzeuge.length ? "durch Leitstelle" : "ohne Fahrzeug (z. B. Telemedizin, Beratung)"));
    });

    dyn = {
      refresh() {
        const c = findCode(e.code ?? undefined);
        head.innerHTML = `<span class="stufe-badge big" style="background:${stufeFarbe(c?.stufe)}">${esc(c?.stufe ?? "ohne Code")}</span>
          <div><div class="mask-nr">${esc(e.nummer)}</div><div class="muted">Eingang ${uhr(e.erstellt)} · ${Math.round((sim.state.zeit - e.erstellt) / 60000)} min · ${{ neu: "neu", offen: "in Bearbeitung", laufend: "laufend", abgeschlossen: "abgeschlossen" }[e.zustand]}</div></div>`;
        meld.classList.toggle("alert", e.adressePruefen);
        // zugeordnete Fahrzeuge
        assigned.innerHTML = "";
        for (const id of e.fahrzeuge) {
          const fz = sim.state.fahrzeuge[id];
          if (!fz) continue;
          const row = el("div", { class: "as-row" });
          const imEinsatz = fz.einsatzId === e.id;
          row.innerHTML = `${statusChip(fz)} <b>${esc(fz.funkrufname)}</b> <span class="muted">${esc(fz.rmTyp)} · ${esc(sim.statusDef(fz.status).name)}${imEinsatz ? "" : " (frei)"}</span> ${crewHtml(fz)}`;
          if (imEinsatz) {
            const b = el("button", { class: "btn small" }, "freigeben");
            b.addEventListener("click", () => void fehlerZeigen(sim.call("entlasse", fz.id)));
            row.appendChild(b);
          }
          assigned.appendChild(row);
        }
        // KH
        const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
        khInfo.innerHTML = e.kh
          ? `<div>Gebucht: <b>${esc(h?.name ?? e.kh.hospitalId)}</b></div><div class="muted">Grund: ${esc(HOSPITAL_FLAG_LABEL[e.kh.grund])} · durch ${e.kh.durch === "rtw" ? "RTW" : "Leitstelle"} · ${uhr(e.kh.zeit)}</div>`
          : e.khAnfrage
            ? `<div class="alert-text">${esc(e.khAnfrage.von)} erbittet KH-Buchung: <b>${esc(HOSPITAL_FLAG_LABEL[e.khAnfrage.abteilung])}</b></div>`
            : `<div class="muted">Noch kein Krankenhaus gebucht.</div>`;
        khBox.classList.toggle("alert", !!e.khAnfrage);
        boZo.innerHTML = `BO: ${esc(e.bo?.label ?? "–")}<br>ZO: ${esc(e.zo?.label ?? "–")}`;
        // Protokoll
        prot.innerHTML = e.protokoll
          .slice()
          .reverse()
          .map((p) => `<div><span class="muted">${uhr(p.zeit)}</span> ${esc(p.text)}${p.von ? ` <span class="prot-von">${esc(p.von)}</span>` : ""}</div>`)
          .join("");
        btnAlarm.disabled = e.zustand === "abgeschlossen";
      },
    };
    dyn.refresh();
    void refreshSuggestions();
  }

  function select(id: string | null) {
    if (id && id !== selected && sim.mode !== "solo") void sim.call("oeffne", id).catch(() => undefined);
    selected = id;
    deps.onSelectIncident(id);
    const e = id ? sim.einsatz(id) : undefined;
    if (!e) {
      maskFor = null;
      dyn = null;
      rbEinsatz.innerHTML = `<div class="muted pad">Einsatz in der Liste links anklicken.</div>`;
    } else {
      if (maskFor !== e.id) buildMask(e);
      if (e.adresse) deps.flyTo(e.adresse.lat, e.adresse.lon);
      setTab("einsatz");
    }
    renderLists();
  }

  // Aktualisierung (gedrosselt)
  let pending = false;
  sim.onChange(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      renderLists();
      renderFunk();
      renderChat();
      dyn?.refresh();
    }, 400);
  });

  setTab(rightTab);
  select(null);
  renderFunk();
  return { select };
}
