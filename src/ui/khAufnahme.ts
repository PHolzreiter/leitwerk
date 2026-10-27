/**
 * Fenster „KH-Aufnahme“: was jedes Krankenhaus bei Notfalleinsätzen aufnimmt (Zuweisung nach Symptom und Dringlichkeit).
 * Zeigt die Öffnungszeiten der Akut-Bereiche (mit Herkunft: recherchiert / Annahme / von Paul / von dir geändert)
 * und je Symptom und Dringlichkeit, ob das Haus es nimmt – einzeln ein- oder ausschaltbar, „Zurück auf Vorgabe“.
 * Lücken-Prüfung: Symptome, für die im Umkreis zu bestimmten Zeiten kein Haus offen ist.
 * Gilt nur für Notfalleinsätze (nicht für Krankentransporte und Überstellungen). Im Mehrspieler gelten die Daten des Hosts.
 */
import type { Hospital } from "../data/model";
import { store } from "../data/store";
import { standardRecords } from "../data/standard";
import { akutJetzt, buchung, EINRICHTUNGEN, eignung, eignungJetzt } from "../data/klinik";
import { ALTERSGRUPPEN, DRINGLICHKEIT_NAME, SYMPTOME, zuweisungId, type Altersgruppe, type Dringlichkeit } from "../data/zuweisung";
import { MIT_ZEITEN } from "../sim/khStatus";
import { planLesen, planText } from "../sim/dienst";
import { sim } from "../sim/engine";
import { distanceM } from "../sim/geo";
import { el, esc, toast } from "./dom";
import { panelZeigen, registriere, type PanelKontext } from "./ws/arbeitsplatz";

const WTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Herkunft der mitgelieferten Zeiten (ohne Eintrag: recherchiert) */
const ANNAHME = "Annahme";
const VON_PAUL = "von Paul";
const QUELLE: Record<string, string> = {
  "kh023|fb_herzkatheter": ANNAHME,
  "kh024|fb_herzkatheter": ANNAHME,
  "kh025|fb_herzkatheter": ANNAHME,
  "kh026|fb_herzkatheter": ANNAHME,
  "kh029|fb_herzkatheter": ANNAHME,
  "kh042|fb_herzkatheter": ANNAHME,
  "kh027|fb_herzkatheter": ANNAHME,
  "kh035|fb_herzkatheter": ANNAHME,
  "kh023|fb_angiographie": ANNAHME,
  "kh029|fb_angiographie": ANNAHME,
  "kh032|fb_angiographie": ANNAHME,
  "kh002|fb_herzkatheter": VON_PAUL,
  "kh004|fb_herzkatheter": VON_PAUL,
  "kh034|fb_herzkatheter": VON_PAUL,
};
function quelleVorgabe(h: Hospital, einr: string): string {
  const q = QUELLE[`${h.id}|${einr}`];
  if (q) return q;
  // Thrombektomie in NÖ rund um die Uhr (Vorgabe Paul)
  if (einr === "fb_angiographie" && /^kh0(0\d|1\d|2[0-2])$/.test(h.id)) return VON_PAUL;
  return "recherchiert";
}

let vorgabeCache: Map<string, Hospital> | null = null;
function vorgabe(id: string): Hospital | undefined {
  vorgabeCache ??= new Map(standardRecords().hospitals.map((h) => [h.id, h]));
  return vorgabeCache.get(id);
}

const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Eignung ohne eigene Schalter (wie es sich aus den Abteilungen ergibt) */
function nachAbteilungen(ohne: Hospital, id: string, d: Dringlichkeit): "ja" | "ausweich" | "nein" {
  const e = eignung(ohne, buchung(id), d === 30);
  return e === "passend" ? "ja" : e === "ausweich" ? "ausweich" : "nein";
}

function schalter(h: Hospital, sid: string, d: Dringlichkeit): "an" | "aus" | null {
  const k = `${sid}:${d}`;
  if (h.zuweisungAus?.includes(k) || h.zuweisungAus?.includes(sid)) return "aus";
  if (h.zuweisungAn?.includes(k) || h.zuweisungAn?.includes(sid)) return "an";
  return null;
}

let naechstesHaus: string | null = null;
/** Fenster öffnen, ein Haus vorwählen */
export function khAufnahmeOeffnen(hId?: string): void {
  if (hId) naechstesHaus = hId;
  panelZeigen("khaufnahme");
  if (hId) window.dispatchEvent(new CustomEvent("lw-khaufnahme", { detail: hId }));
}

function panel(ctx: PanelKontext) {
  const root = el("div", { class: "kha" });
  const kopf = el("div", { class: "kha-kopf" });
  const hSel = el("select", { class: "kha-kh" }) as HTMLSelectElement;
  const altSel = el("select", { class: "kha-alter", title: "Altersgruppe" }) as HTMLSelectElement;
  for (const a of ALTERSGRUPPEN) altSel.appendChild(el("option", { value: a.id }, a.name));
  altSel.value = "erwachsener";
  const wann = el("input", { type: "datetime-local", class: "kha-wann", title: "Zeitpunkt für „jetzt offen“" }) as HTMLInputElement;
  const such = el("input", { type: "search", class: "kha-such", placeholder: "Symptom filtern …" }) as HTMLInputElement;
  kopf.append(hSel, altSel, wann, such);
  const hinweis = el("div", { class: "kha-hinweis muted" }, "Gilt nur für Notfalleinsätze – nicht für Krankentransporte und Überstellungen. Im Mehrspieler gelten die Einstellungen des Hosts.");
  const zeitenBox = el("div", { class: "kha-zeiten" });
  const symBox = el("div", { class: "kha-sym" });
  const lueckeBox = el("div", { class: "kha-luecken" });
  const fuss = el("div", { class: "kha-fuss" });
  const btnReset = el("button", { class: "btn small" }, "Ganzes Haus zurück auf Vorgabe");
  const btnLuecke = el("button", { class: "btn small" }, "Lücken im Umkreis prüfen (eine Woche)");
  fuss.append(btnLuecke, btnReset);
  root.append(kopf, hinweis, zeitenBox, symBox, fuss, lueckeBox);

  const zeitVon = (): number => {
    const v = wann.value ? new Date(wann.value).getTime() : NaN;
    return Number.isFinite(v) ? v : sim.state.zeit || Date.now();
  };
  const lokal = (t: number) => {
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  wann.value = lokal(sim.state.zeit || Date.now());

  const haeuserFuellen = () => {
    const alt = hSel.value || naechstesHaus || String(ctx.params.kh ?? "");
    const g = sim.funkgruppe();
    const mitte = { lat: (g.bbox[1] + g.bbox[3]) / 2, lon: (g.bbox[0] + g.bbox[2]) / 2 };
    const l = store
      .list("hospitals")
      .filter((h) => (h.einrichtungen ?? []).some((x) => ["amb_notaufnahme", "amb_unfall", "fb_schockraum", "amb_kindernotaufnahme", "amb_pvz"].includes(x)))
      .sort((a, b) => distanceM(mitte, a) - distanceM(mitte, b));
    hSel.innerHTML = l.map((h) => `<option value="${esc(h.id)}">${esc(h.kurzname || h.name)}</option>`).join("");
    if (alt && l.some((h) => h.id === alt)) hSel.value = alt;
    naechstesHaus = null;
  };
  const haus = () => store.get("hospitals", hSel.value);

  const speichern = (h: Hospital, text: string) => {
    if (!h.zuweisungAn?.length) delete h.zuweisungAn;
    if (!h.zuweisungAus?.length) delete h.zuweisungAus;
    if (h.zeiten && !Object.keys(h.zeiten).length) delete h.zeiten;
    store.upsert("hospitals", [h]);
    toast(text);
  };

  const render = () => {
    const h = haus();
    if (!h) {
      zeitenBox.innerHTML = symBox.innerHTML = "";
      return;
    }
    ctx.setzeTitel(`KH-Aufnahme · ${h.kurzname || h.name}`);
    const v = vorgabe(h.id);
    const t = zeitVon();
    // Öffnungszeiten der Akut-Bereiche
    const einr = new Set(h.einrichtungen ?? []);
    const zeilen = MIT_ZEITEN.filter((x) => einr.has(x)).map((id) => {
      const plan = h.zeiten?.[id];
      const geaendert = !gleich(plan ?? [], v?.zeiten?.[id] ?? []);
      const q = !v ? "eigenes Haus" : geaendert ? "von dir geändert" : quelleVorgabe(h, id);
      const rad = h.aufnahmerad?.einrichtungen[id] !== undefined ? ` · wechselnd (${esc(h.aufnahmerad!.gruppe)})` : "";
      return `<div class="kha-z" data-einr="${id}">
        <span class="kha-n">${esc(EINRICHTUNGEN.find((e) => e.id === id)?.name ?? id)}</span>
        <input class="kha-plan" value="${esc(planText(plan))}" placeholder="rund um die Uhr">
        <span class="kha-q ${geaendert ? "eigen" : q === ANNAHME ? "annahme" : ""}">${esc(q)}${rad}</span>
        ${geaendert && v ? `<button class="btn small" data-zeit-vorgabe="${id}" title="${esc(planText(v.zeiten?.[id]) || "rund um die Uhr")}">Vorgabe</button>` : "<span></span>"}
      </div>`;
    });
    zeitenBox.innerHTML = `<h4>Öffnungszeiten der Akut-Bereiche</h4>${zeilen.join("") || '<div class="muted">keine</div>'}<div class="muted kha-tipp">Leer = rund um die Uhr. Beispiel: „Mo–Fr 07:00–15:00; Mi 07:00–07:00“ (bis zum nächsten Morgen).</div>`;
    // Symptome × Dringlichkeit
    const a = altSel.value as Altersgruppe;
    const q = such.value.trim().toLowerCase();
    const jetzt = akutJetzt(h, t);
    const ohne: Hospital = { ...h, zuweisungAn: [], zuweisungAus: [] };
    const kat = [...new Set(SYMPTOME.map((s) => s.kategorie))];
    let html = `<h4>Symptome <span class="muted">– ${esc(WTAG[new Date(t).getDay()])} ${new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}</span></h4>
      <div class="kha-leg"><span class="kha-c ja">✓</span> nimmt auf <span class="kha-c zu">◐</span> nimmt auf, jetzt zu <span class="kha-c ausweich">~</span> nur Ausweich <span class="kha-c nein">–</span> nimmt nicht · <b>Klick</b>: an → aus → wie Abteilungen</div>`;
    html += `<div class="kha-s kha-skopf"><span></span><span>stabil</span><span>dringend</span><span title="Schockraum/Intensiv">Schock</span></div>`;
    for (const k of kat) {
      const l = SYMPTOME.filter((s) => s.kategorie === k && (!q || `${s.name} ${s.synonyme.join(" ")}`.toLowerCase().includes(q)));
      if (!l.length) continue;
      html += `<div class="kha-kat">${esc(k)}</div>`;
      for (const s of l) {
        const zellen = ([10, 20, 30] as Dringlichkeit[]).map((d) => {
          if (!s.dringlichkeiten.includes(d)) return `<span class="kha-c leer"></span>`;
          const id = zuweisungId(s.id, d, a);
          const auto = nachAbteilungen(ohne, id, d);
          const sw = schalter(h, s.id, d);
          const wirk = sw === "an" ? "ja" : sw === "aus" ? "nein" : auto;
          const offenJetzt = wirk === "ja" && eignungJetzt(h, buchung(id), d === 30, jetzt, t) === "passend";
          const sym = wirk === "ja" ? (offenJetzt ? "✓" : "◐") : wirk === "ausweich" ? "~" : "–";
          const cls = wirk === "ja" ? (offenJetzt ? "ja" : "zu") : wirk;
          const titel = `${DRINGLICHKEIT_NAME[d]}: ${sw ? `von dir ${sw === "an" ? "eingeschaltet" : "ausgeschaltet"} (Abteilungen: ${auto === "ja" ? "ja" : auto === "ausweich" ? "Ausweich" : "nein"})` : `aus den Abteilungen${wirk === "ja" && !offenJetzt ? " – zu diesem Zeitpunkt zu" : ""}`}`;
          return `<button class="kha-c ${cls}${sw ? " eigen" : ""}" data-sym="${esc(s.id)}" data-d="${d}" title="${esc(titel)}">${sym}</button>`;
        });
        html += `<div class="kha-s"><span class="kha-sn" title="${esc(s.synonyme.join(", "))}">${esc(s.name)}</span>${zellen.join("")}</div>`;
      }
    }
    symBox.innerHTML = html;
    btnReset.disabled = !v;
  };

  zeitenBox.addEventListener("change", (ev) => {
    const inp = (ev.target as HTMLElement).closest<HTMLInputElement>(".kha-plan");
    const z = inp?.closest<HTMLElement>("[data-einr]");
    const h0 = haus();
    if (!inp || !z || !h0) return;
    const r = planLesen(inp.value);
    if (r.fehler) return void toast(r.fehler, "error");
    const h = structuredClone(h0);
    h.zeiten = { ...(h.zeiten ?? {}) };
    if (r.plan.length) h.zeiten[z.dataset.einr!] = r.plan;
    else delete h.zeiten[z.dataset.einr!];
    speichern(h, "Zeiten gespeichert");
  });
  zeitenBox.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-zeit-vorgabe]");
    const h0 = haus();
    if (!b || !h0) return;
    const v = vorgabe(h0.id);
    const id = b.dataset.zeitVorgabe!;
    const h = structuredClone(h0);
    h.zeiten = { ...(h.zeiten ?? {}) };
    if (v?.zeiten?.[id]) h.zeiten[id] = structuredClone(v.zeiten[id]);
    else delete h.zeiten[id];
    speichern(h, "Zeiten zurück auf Vorgabe");
  });
  symBox.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-sym]");
    const h0 = haus();
    if (!b || !h0) return;
    const sid = b.dataset.sym!;
    const d = Number(b.dataset.d) as Dringlichkeit;
    const k = `${sid}:${d}`;
    const h = structuredClone(h0);
    const jetzt = schalter(h, sid, d);
    // ganze Symptom-Einträge (ohne Dringlichkeit) auflösen, damit einzelne Dringlichkeiten schaltbar bleiben
    const s = SYMPTOME.find((x) => x.id === sid)!;
    for (const feld of ["zuweisungAn", "zuweisungAus"] as const) {
      const l = h[feld] ?? [];
      if (l.includes(sid)) h[feld] = [...l.filter((x) => x !== sid), ...s.dringlichkeiten.map((x) => `${sid}:${x}`)];
    }
    h.zuweisungAn = (h.zuweisungAn ?? []).filter((x) => x !== k);
    h.zuweisungAus = (h.zuweisungAus ?? []).filter((x) => x !== k);
    if (jetzt === null) h.zuweisungAn.push(k);
    else if (jetzt === "an") h.zuweisungAus.push(k);
    speichern(h, jetzt === null ? "eingeschaltet" : jetzt === "an" ? "ausgeschaltet" : "wie Abteilungen");
  });
  btnReset.addEventListener("click", () => {
    const h0 = haus();
    const v = h0 && vorgabe(h0.id);
    if (!h0 || !v) return;
    const h = structuredClone(h0);
    delete h.zuweisungAn;
    delete h.zuweisungAus;
    if (v.zeiten) h.zeiten = structuredClone(v.zeiten);
    else delete h.zeiten;
    speichern(h, "Haus zurück auf Vorgabe");
  });
  btnLuecke.addEventListener("click", () => {
    const h = haus();
    if (!h) return;
    lueckeBox.innerHTML = `<div class="muted">prüfe …</div>`;
    setTimeout(() => {
      lueckeBox.innerHTML = lueckenHtml(h, zeitVon());
    }, 20);
  });

  hSel.addEventListener("change", () => {
    ctx.setzeParams({ kh: hSel.value });
    lueckeBox.innerHTML = "";
    render();
  });
  altSel.addEventListener("change", render);
  wann.addEventListener("change", render);
  such.addEventListener("input", render);
  const vorwahl = (ev: Event) => {
    haeuserFuellen();
    hSel.value = (ev as CustomEvent<string>).detail;
    lueckeBox.innerHTML = "";
    render();
  };
  window.addEventListener("lw-khaufnahme", vorwahl);
  const aus = store.onChange(() => {
    vorgabeCache = null;
    const scroll = symBox.scrollTop;
    haeuserFuellen();
    render();
    symBox.scrollTop = scroll;
  });
  haeuserFuellen();
  render();
  return {
    el: root,
    dispose: () => {
      aus();
      window.removeEventListener("lw-khaufnahme", vorwahl);
    },
  };
}

/** Lücken: Symptom/Dringlichkeit/Alter, für die im Umkreis (60 km) zu einer Stunde der Woche kein Haus offen ist */
export function luecken(h: Hospital, start: number, km = 60): { was: string; zeiten: string[] }[] {
  const t0 = new Date(start);
  t0.setHours(0, 0, 0, 0);
  t0.setDate(t0.getDate() - ((t0.getDay() + 6) % 7)); // Montag
  const umkreis = store.list("hospitals").filter((x) => distanceM(h, x) / 1000 <= km);
  const fehlt = new Map<string, number[]>();
  for (let st = 0; st < 168; st++) {
    const t = t0.getTime() + st * 3_600_000 + 30 * 60_000;
    const jetzt = new Map(umkreis.map((x) => [x.id, akutJetzt(x, t)]));
    for (const s of SYMPTOME)
      for (const d of s.dringlichkeiten)
        for (const a of ["erwachsener", "kleinkind"] as Altersgruppe[]) {
          const id = zuweisungId(s.id, d, a);
          const b = buchung(id);
          if (!umkreis.some((x) => eignungJetzt(x, b, d === 30, jetzt.get(x.id)!, t) === "passend")) {
            const l = fehlt.get(id) ?? [];
            l.push(st);
            fehlt.set(id, l);
          }
        }
  }
  const out: { was: string; zeiten: string[] }[] = [];
  for (const [id, stunden] of fehlt) {
    const [, sid, d, a] = id.split(":");
    // Kleinkind mit denselben Zeiten wie Erwachsene: nur einmal zeigen
    if (a === "k" && gleich(stunden, fehlt.get(`avn:${sid}:${d}:e`))) continue;
    const s = SYMPTOME.find((x) => x.id === sid)!;
    // zusammenhängende Stunden zusammenfassen
    const zeiten: string[] = [];
    let von = stunden[0];
    for (let i = 1; i <= stunden.length; i++) {
      if (i < stunden.length && stunden[i] === stunden[i - 1] + 1) continue;
      const bis = stunden[i - 1] + 1;
      const tag = (x: number) => ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][Math.floor(x / 24) % 7];
      const uhr = (x: number) => `${String(x % 24).padStart(2, "0")}:00`;
      zeiten.push(bis - von >= 168 ? "immer" : `${tag(von)} ${uhr(von)}–${tag(bis) !== tag(von) ? `${tag(bis)} ` : ""}${uhr(bis)}`);
      if (i < stunden.length) von = stunden[i];
    }
    const auchKind = a === "e" && gleich(stunden, fehlt.get(`avn:${sid}:${d}:k`));
    out.push({ was: `${s.name}, ${DRINGLICHKEIT_NAME[Number(d) as Dringlichkeit]}${a === "k" ? ", Kleinkind" : auchKind ? " (alle Altersgruppen)" : ""}`, zeiten });
  }
  return out.sort((x, y) => x.was.localeCompare(y.was, "de"));
}

function lueckenHtml(h: Hospital, t: number): string {
  const l = luecken(h, t);
  if (!l.length) return `<h4>Lücken</h4><div class="kha-ok">Keine Lücken: im Umkreis von 60 km nimmt zu jeder Stunde der Woche ein Haus jedes Symptom auf.</div>`;
  return `<h4>Lücken im Umkreis von 60 km (${l.length})</h4><div class="muted">Dann bleibt nur ein weiter entferntes Haus oder ein Ausweich-Haus.</div>${l
    .map((x) => `<div class="kha-lz"><b>${esc(x.was)}</b> <span class="muted">${esc(x.zeiten.slice(0, 6).join(", "))}${x.zeiten.length > 6 ? ` … (+${x.zeiten.length - 6})` : ""}</span></div>`)
    .join("")}`;
}

registriere({
  komponente: "khaufnahme",
  titel: "KH-Aufnahme",
  info: "Was jedes Krankenhaus bei Notfällen aufnimmt: Zeiten der Akut-Bereiche und je Symptom und Dringlichkeit – einstellbar, mit Lücken-Prüfung",
  bereich: "rechts",
  erstellen: (ctx) => panel(ctx),
});
