/**
 * Kopfleiste: Inhalte der Schubladen (Wetter, Fenster, Anordnung, Update, Fehler melden, vorläufiges Spielmenü)
 * und die Symbole. Aufbau und Texte nach dem Entwurf „Kopfleiste“ (09.11.); die Werte kommen aus dem Spiel.
 */
import { sim } from "../../sim/engine";
import {
  fahrFaktor,
  flugEingeschraenkt,
  flugverbot,
  JAHRESZEIT_LABEL,
  jahreszeitVon,
  LAGE,
  lageVon,
  modusVon,
  tagesPrognose,
  warnungen,
  wetterSatz,
  windText,
  type PrognoseStunde,
  type Warnung,
  type WetterLage,
} from "../../sim/weather";
import { esc } from "../dom";
import { aufteilungTeile, VORLAGEN, type GespeicherteAnordnung } from "./arbeitsplatz";

// ---------------------------------------------------------------- Symbole (Pfade aus dem Entwurf)

export const IC = {
  regen: "M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.5 3.5 0 0 1-.5 6.9M9 18l-1 2M13 18l-1 2M17 18l-1 2",
  wolke: "M7 18a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18.5 11 3.5 3.5 0 0 1 18 18z",
  teil: "M8 3v1.5M3 8h1.5M4.6 4.6l1 1M11.4 4.6l-1 1M5.6 10.4a3 3 0 1 1 5.6-1.9M8 20a3.5 3.5 0 1 1 .8-6.9A4.5 4.5 0 0 1 17.5 14 3 3 0 0 1 17 20z",
  sonne: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  mond: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  nebel: "M7 10a4 4 0 0 1 8.5-1.5A3 3 0 0 1 18 11M4 14h16M3 17.5h18M6 21h12",
  gewitter: "M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.5 3.5 0 0 1-.5 6.9M13 12l-2.5 4.5h3L11 21",
  schnee: "M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.5 3.5 0 0 1-.5 6.9M9 19h.01M13 19h.01M17 19h.01M11 21.5h.01M15 21.5h.01",
  flug: "M2 5h18M11 5v3M5 12a4 4 0 0 1 4-4h5a4 4 0 0 1 0 8H9a4 4 0 0 1-4-4zM18 12h4M8 20h9M10 16v4M15 16v4",
  haken: "M5 12.5l4.5 4.5L19 7",
  warn: "M12 3l9 16H3zM12 10v4M12 17h.01",
  pause: "M8 5v14M16 5v14",
  play: "M7 5l12 7-12 7z",
  menue: "M4 7h16M4 12h16M4 17h16",
  telefon: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  fenster: "M3 5h18v14H3zM3 9h18",
  anordnung: "M3 5h18v14H3zM11 5v14M11 12h10",
  pfeil: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  update: "M12 4v11M7 10l5 5 5-5M5 20h14",
  kaefer: "M9 8a3 3 0 0 1 6 0M8 10h8v5a4 4 0 0 1-8 0zM12 11v8M4 13h4M16 13h4M5 8.5l3 1.5M19 8.5l-3 1.5M5 19l3-2M19 19l-3-2",
  mehr: "M5 12h.01M12 12h.01M19 12h.01",
  schloss: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  neuesFenster: "M3 5h13v11H3zM8 20h13V9",
  speichern: "M5 3h11l3 3v15H5zM8 3v6h7M8 21v-7h8v7",
  regler: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  zahnrad: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  buch: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10M9 8h5",
  leute: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18.5 14a6 6 0 0 1 3 6",
  tuer: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h11",
} as const;

export function ic(pfad: string, cls = "ic s", extra = ""): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"${extra}><path d="${pfad}"></path></svg>`;
}

// ---------------------------------------------------------------- Wetter

/** Kurzer Name für die Leiste (z. B. „Regen“ statt „Leichter Regen“) */
const KURZ: Record<WetterLage, string> = {
  klar: "Klar",
  heiter: "Heiter",
  leicht_bewoelkt: "Wolkig",
  bewoelkt: "Bewölkt",
  bedeckt: "Bedeckt",
  dunst: "Dunst",
  nebel: "Nebel",
  hochnebel: "Hochnebel",
  niesel: "Niesel",
  leichter_regen: "Regen",
  regen: "Regen",
  starkregen: "Starkregen",
  gewitter: "Gewitter",
  hagel: "Hagel",
  unwetter: "Unwetter",
  schneeregen: "Schneeregen",
  leichter_schnee: "Schnee",
  schnee: "Schnee",
  starker_schnee: "Schnee",
  eisregen: "Eisregen",
};

export function wetterSymbol(lage: WetterLage, nacht = false): string {
  const l = lageVon(lage);
  if (l === "klar") return nacht ? IC.mond : IC.sonne;
  if (l === "heiter" || l === "leicht_bewoelkt") return nacht ? IC.mond : IC.teil;
  if (l === "bewoelkt" || l === "bedeckt") return IC.wolke;
  if (l === "dunst" || l === "nebel" || l === "hochnebel") return IC.nebel;
  if (l === "gewitter" || l === "hagel" || l === "unwetter") return IC.gewitter;
  if (l === "schneeregen" || l === "leichter_schnee" || l === "schnee" || l === "starker_schnee") return IC.schnee;
  return IC.regen;
}

type Flug = "ok" | "gelb" | "rot";
const FLUG_T: Record<Flug, string> = { ok: "möglich", gelb: "eingeschränkt", rot: "kein Flug" };
const RICHTUNG = ["Nord", "Nordost", "Ost", "Südost", "Süd", "Südwest", "West", "Nordwest"];
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const STUFE_T: Record<Warnung["stufe"], string> = { gelb: "Gelb", orange: "Orange", rot: "Rot" };
export const STUFE_FARBE: Record<Warnung["stufe"], string> = { gelb: "#FFC72C", orange: "#F2913A", rot: "#E5484D" };

const uhr = (t: number) => new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
const minus = (n: number) => String(Math.round(n)).replace("-", "−");
const sichtText = (km: number) => (km >= 10 ? "> 10 km" : km >= 1 ? `${Math.round(km)} km` : `${Math.round(km * 1000)} m`);

/** NAH-Fluglage zu einer Stunde (wie im Spiel: Wetter aus = keine Einschränkung) */
function flugLage(p: PrognoseStunde): Flug {
  if (!sim.settings.wetterAktiv) return "ok";
  return flugverbot(p.lage, p.wind) ? "rot" : flugEingeschraenkt(p.lage, p.wind) ? "gelb" : "ok";
}

/** Grund für Einschränkung oder Flugverbot (aus denselben Regeln wie im Spiel) */
function flugGrund(p: PrognoseStunde): string {
  const l = lageVon(p.lage);
  if (LAGE[l].kein_flug) return l === "nebel" ? `Nebel, Sichtweite ${sichtText(p.sicht)}` : LAGE[l].label;
  return `Böen bis ${p.boeen} km/h`;
}

/** Folge einer Warnung fürs Spiel – nur was die Simulation wirklich daraus macht */
function warnFolge(w: Warnung, p: PrognoseStunde[]): string {
  const imZeitraum = p.filter((x) => x.zeit >= w.von - 3_600_000 && x.zeit < w.bis);
  const teile: string[] = [];
  const fl = imZeitraum.map(flugLage);
  if (fl.includes("rot")) teile.push("Kein Flugbetrieb");
  else if (fl.includes("gelb")) teile.push("NAH eingeschränkt");
  if (imZeitraum.some((x) => fahrFaktor(x.lage, x.temp) > 1)) teile.push("Fahrzeiten länger");
  return teile.join(" · ");
}

export interface WetterKurz {
  symbol: string;
  kurz: string;
  grad: string;
  /** Punkt am Symbol: Farbe der höchsten Warnung bzw. rot bei Flugverbot; leer = kein Punkt */
  punkt: string;
  titel: string;
}

/** Werte für den Wetter-Knopf in der Leiste */
export function wetterKurz(): WetterKurz {
  const p = sim.wetterPrognose(24);
  const jetzt = p[0];
  const fl = flugLage(jetzt);
  const ws = warnungen(sim.state.wetter, sim.state.zeit, sim.wetterOpt());
  const rang = { gelb: 0, orange: 1, rot: 2 };
  const hoechste = ws.reduce<Warnung | null>((m, w) => (!m || rang[w.stufe] > rang[m.stufe] ? w : m), null);
  const punkt = fl === "rot" ? STUFE_FARBE.rot : hoechste ? STUFE_FARBE[hoechste.stufe] : fl === "gelb" ? STUFE_FARBE.gelb : "";
  return {
    symbol: wetterSymbol(jetzt.lage, jetzt.nacht),
    kurz: KURZ[lageVon(jetzt.lage)],
    grad: `${minus(jetzt.temp)}°`,
    punkt,
    titel: `${LAGE[lageVon(jetzt.lage)].label} ${minus(jetzt.temp)} °C · NAH ${FLUG_T[fl]}${ws.length ? ` · ${ws.length} Warnung${ws.length > 1 ? "en" : ""}` : ""} – Wetter, Prognose und Warnungen`,
  };
}

export type WetterReiter = "aktuell" | "prognose" | "warnungen";

/** Inhalt der Wetter-Schublade */
export function wetterHtml(reiter: WetterReiter, funkgruppe: string): string {
  const o = sim.wetterOpt();
  const t = sim.state.zeit;
  const p = sim.wetterPrognose(24);
  const jetzt = p[0];
  const lage = lageVon(jetzt.lage);
  const ws = warnungen(sim.state.wetter, t, o);
  const fl = flugLage(jetzt);

  // NAH-Band: jetzt und wann es sich ändert
  let flugT = "NAH: Flugbetrieb möglich";
  let flugZ = "";
  if (!sim.settings.wetterAktiv) flugZ = "Das Wetter ist ausgeschaltet – es hat keinen Einfluss auf Flugbetrieb und Fahrzeiten.";
  else if (fl === "ok") {
    const spaeter = p.slice(1, 13).find((x) => flugLage(x) !== "ok");
    flugZ = spaeter
      ? `Ab etwa ${new Date(spaeter.zeit).getHours()} Uhr ${flugLage(spaeter) === "rot" ? "kein Flug" : "eingeschränkt"} (${flugGrund(spaeter)}).`
      : "Keine Einschränkung in den nächsten 12 Stunden.";
  } else {
    const besser = p.slice(1).find((x) => flugLage(x) === "ok");
    const wann = besser ? `Ab etwa ${new Date(besser.zeit).getHours()} Uhr wieder möglich.` : "Auch in den nächsten 24 Stunden nicht besser.";
    if (fl === "gelb") {
      flugT = "NAH: Flugbetrieb eingeschränkt";
      flugZ = `${flugGrund(jetzt)} – der Pilot entscheidet je Einsatz. ${wann}`;
    } else {
      flugT = "NAH: kein Flug";
      flugZ = `${flugGrund(jetzt)} – Hubschrauber bleiben am Boden. ${wann}`;
    }
  }

  const reiterI = reiter === "aktuell" ? 0 : reiter === "prognose" ? 1 : 2;
  const tabs = (
    [
      ["aktuell", "Aktuell"],
      ["prognose", "Prognose"],
      ["warnungen", "Warnungen"],
    ] as const
  )
    .map(([k, l]) => `<button type="button" class="seg${k === reiter ? " on" : ""}" role="tab" aria-selected="${k === reiter}" data-wreiter="${k}">${l}${k === "warnungen" && ws.length ? `<span class="kl-zahl">${ws.length}</span>` : ""}</button>`)
    .join("");

  let inhalt = "";
  if (reiter === "aktuell") {
    const werte: [string, string, string?][] = [
      ["Gefühlt", `${minus(jetzt.gefuehlt)} °C`],
      ["Luftfeuchtigkeit", `${jetzt.feuchte} %`],
      ["Wind", `${jetzt.wind} km/h`, `${windText(jetzt.wind)}, aus ${RICHTUNG[Math.round((((jetzt.richtung % 360) + 360) % 360) / 45) % 8]}`],
      ["Böen", `${jetzt.boeen} km/h`],
      ["Sichtweite", sichtText(jetzt.sicht)],
      ["Luftdruck", `${Math.round(jetzt.druck)} hPa`],
    ];
    const std = p.slice(1, 9).map((x) => {
      const f = flugLage(x);
      return `<div class="${f === "gelb" ? "fl" : f === "rot" ? "fr" : ""}" title="NAH ${FLUG_T[f]}"><span>${uhr(x.zeit)}</span>${ic(wetterSymbol(x.lage, x.nacht))}<b>${minus(x.temp)}°</b><span>${x.regen} %</span></div>`;
    });
    const tage = tagesPrognose(sim.state.wetter, t, o, 5).map((d, i) => {
      const dt = new Date(d.tag);
      return `<div><span class="kl-tn">${i === 0 ? "Heute" : WT[dt.getDay()]}</span><span>${dt.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" })}</span>${ic(wetterSymbol(d.lage))}<b>${minus(d.min)}° / ${minus(d.max)}°</b><span>${d.regen} %</span></div>`;
    });
    inhalt = `
      <div class="kl-jetzt kl-z"><span class="kl-gsym">${ic(wetterSymbol(lage, jetzt.nacht), "ic")}</span><div><div class="kl-temp">${minus(jetzt.temp)} °C</div><div class="kl-lage">${esc(LAGE[lage].label)}</div></div><div class="kl-satz">${esc(wetterSatz(p))}</div></div>
      <div class="kl-werte kl-z" style="--d:1">${werte.map(([l, v, z]) => `<div><span>${l}</span><b>${v}${z ? ` <i>${esc(z)}</i>` : ""}</b></div>`).join("")}</div>
      <div class="kl-abs kl-z" style="--d:2">Nächste Stunden</div>
      <div class="kl-std kl-z" style="--d:3">${std.join("")}</div>
      <div class="kl-abs kl-z" style="--d:4">Nächste 5 Tage</div>
      <div class="kl-tage kl-z" style="--d:5">${tage.join("")}</div>`;
  } else if (reiter === "prognose") {
    // 24 Stunden in 2-Stunden-Schritten (erste Zeile = jetzt)
    const zeilen = [p[0], ...p.slice(2, 24).filter((_, i) => i % 2 === 0)].slice(0, 12);
    inhalt = `<div class="kl-tab kopf"><span>Zeit</span><span></span><span>Wetter</span><span class="r">Temp.</span><span>Wind</span><span class="r">Regen</span><span>NAH</span></div>
      ${zeilen
        .map((x, i) => {
          const f = flugLage(x);
          return `<div class="kl-tab z kl-z${i === 0 ? " jetzt" : ""}" style="--d:${i}"><span class="nr">${i === 0 ? "jetzt" : uhr(x.zeit)}</span>${ic(wetterSymbol(x.lage, x.nacht))}<span title="${esc(LAGE[lageVon(x.lage)].label)}">${esc(LAGE[lageVon(x.lage)].label)}</span><b class="r">${minus(x.temp)}°</b><span>${x.wind} (${x.boeen})</span><span class="r">${x.regen} %</span><span class="kl-fm ${f}">${FLUG_T[f]}</span></div>`;
        })
        .join("")}
      <div class="kl-hinw" style="padding:8px 6px 2px">Wind in km/h mit Böen in Klammern. Ab Böen von 70 km/h fliegt der NAH nur eingeschränkt, ab 90 km/h und bei Nebel, Hochnebel oder Gewitter gar nicht.</div>`;
  } else {
    inhalt = ws.length
      ? ws
          .map(
            (w, i) =>
              `<div class="kl-warn kl-z" style="--d:${i}"><span class="kl-wst ${w.stufe}">${STUFE_T[w.stufe]}</span><div><b>${esc(w.text)}</b><div class="kl-wz">${uhr(w.von)} – ${uhr(w.bis)} Uhr</div>${(() => {
                const f = warnFolge(w, p);
                return f ? `<div class="kl-wf">${esc(f)}</div>` : "";
              })()}</div></div>`,
          )
          .join("")
      : `<div class="kl-keine kl-z">${ic(IC.haken, "ic")}<div><b>Keine Warnungen</b><div class="kl-hinw">Für den Einsatzraum liegen zurzeit keine Wetterwarnungen vor.</div></div></div>`;
    inhalt += `<div class="kl-wfuss">Gelb = Vorsicht · Orange = Gefahr · Rot = große Gefahr.</div>`;
  }

  const fuss = [`${JAHRESZEIT_LABEL[jahreszeitVon(t, o)]}`, `Wetter ${modusVon(o.wechsel)}`, sim.settings.wetterAktiv ? "bei Glätte, Schnee, Starkregen und Nebel längere Fahrzeiten" : "Wetter ist ausgeschaltet"];
  return `
    <div class="kl-wk"><span class="kl-wsym">${ic(wetterSymbol(lage, jetzt.nacht), "ic")}</span><div><div class="kl-wt">Wetter</div><div class="kl-ws">Einsatzraum ${esc(funkgruppe)} · Stand ${uhr(t)} Uhr (Spielzeit)</div></div></div>
    <div class="kl-flug ${fl}">${ic(IC.flug, "ic")}<div><b>${flugT}</b>${flugZ ? `<div class="kl-fz">${esc(flugZ)}</div>` : ""}</div></div>
    <div class="segs kl-wsegs" role="tablist" style="--i:${reiterI};--n:3">${tabs}</div>
    <div class="kl-winh">${inhalt}</div>
    <div class="kl-wfuss">${fuss.map(esc).join(" · ")}</div>`;
}

/** Kurzfassung für einen Vergleich: hat sich am Inhalt etwas geändert? */
export function wetterSchluessel(): string {
  const p = sim.wetterPrognose(24);
  return `${Math.floor(sim.state.zeit / 60_000)}|${p.map((x) => `${x.lage}${Math.round(x.temp)}${x.wind}`).join(",")}|${sim.settings.wetterAktiv}`;
}

// ---------------------------------------------------------------- Fenster

/** Gruppen im Fenster-Menü (übrige Fenster kommen unter „Weitere“) */
export const FENSTER_GRUPPEN: [string, string[]][] = [
  ["Einsätze", ["einsatzliste", "einsatz", "kt", "grosseinsatz"]],
  ["Kommunikation", ["telefon", "abfrage", "funk", "chat"]],
  ["Lage", ["aktive", "fahrzeuge", "statuslog", "karte", "khstatus", "akutversorgung", "khaufnahme"]],
];

/** kurze Beschreibung und Symbol je Fenster (sonst die Beschreibung aus dem Fenster selbst) */
export const FENSTER_KURZ: Record<string, [string, string]> = {
  einsatzliste: ["Alle Einsätze und Anrufe", "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"],
  einsatz: ["Notfall: Code, Ort, Fahrzeuge, Krankenhaus", "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5"],
  kt: ["Krankentransport und Überstellung", "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5"],
  grosseinsatz: ["Bereitstellungsraum, Patienten, Voraviso", "M12 3l10 18H2zM12 10v5M12 18h.01"],
  telefon: ["Anrufe annehmen, halten, weiterleiten", IC.telefon],
  abfrage: ["Notruf- und KT-Abfrage", "M4 5h16v11H9l-5 4zM8 9h8M8 12h5"],
  funk: ["Funkgerät, Sprechgruppen, Statusmeldungen", "M8 9h8v12H8zM10 9V3M10 13h4M10 16h4"],
  chat: ["Nachrichten an die anderen Disponenten", "M4 5h16v11H9l-5 4zM8 9h8M8 12h5"],
  aktive: ["Unterwegs, mit Status und Auftrag", "M2 7h12v9H2zM14 10h4l3 3v3h-7M6 18.5a1.5 1.5 0 1 0 0-.1M17 18.5a1.5 1.5 0 1 0 0-.1"],
  fahrzeuge: ["Alle Fahrzeuge nach Dienststelle", "M2 7h12v9H2zM14 10h4l3 3v3h-7M6 18.5a1.5 1.5 0 1 0 0-.1M17 18.5a1.5 1.5 0 1 0 0-.1"],
  statuslog: ["Statuswechsel, neueste oben", "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18"],
  karte: ["Einsätze, Fahrzeuge, Wachen", "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"],
  khstatus: ["Freie Plätze und Akutversorgung", "M4 21V8l8-4 8 4v13M9 21v-5h6v5M3 21h18M10 10h4"],
  akutversorgung: ["Was jedes Krankenhaus gerade hat", "M4 21V8l8-4 8 4v13M3 21h18M12 9v6M9 12h6"],
  khaufnahme: ["Was jedes Haus bei Notfällen aufnimmt", "M4 21V8l8-4 8 4v13M3 21h18M9 13l2 2 4-4"],
};

// ---------------------------------------------------------------- Anordnung: Vorschaubilder

interface Rechteck {
  x: number;
  y: number;
  w: number;
  h: number;
  sch?: boolean;
}

/** Bildschirm mit Fenstern (Anteile in Prozent) in der 74 × 42-Fläche */
function schirm(ox: number, oy: number, sw: number, sh: number, fs: number[][]): Rechteck[] {
  return [
    { x: ox, y: oy, w: sw, h: sh, sch: true },
    ...fs.map(([x, y, w, h]) => ({
      x: ox + 1.5 + (x * (sw - 3)) / 100,
      y: oy + 1.5 + (y * (sh - 3)) / 100,
      w: Math.max(1, (w * (sw - 3)) / 100 - 1),
      h: Math.max(1, (h * (sh - 3)) / 100 - 1),
    })),
  ];
}
const E16 = (fs: number[][]) => schirm(1, 0.5, 72, 41, fs);

interface GridKnoten {
  type: "branch" | "leaf";
  data: GridKnoten[] | unknown;
  size?: number;
}

/** Aufteilung aus einer gespeicherten Anordnung (dockview-JSON) in Prozent der Fläche */
function teile(json: unknown): number[][] {
  const g = (json as { grid?: { root?: GridKnoten; orientation?: string } } | null)?.grid;
  if (!g?.root) return [];
  const out: number[][] = [];
  const lauf = (k: GridKnoten, x: number, y: number, w: number, h: number, waagrecht: boolean) => {
    if (k.type !== "branch" || !Array.isArray(k.data)) {
      out.push([x, y, w, h]);
      return;
    }
    const kinder = k.data as GridKnoten[];
    const summe = kinder.reduce((s, c) => s + (c.size ?? 1), 0) || 1;
    let pos = 0;
    for (const c of kinder) {
      const anteil = (c.size ?? 1) / summe;
      if (waagrecht) lauf(c, x + pos * w, y, anteil * w, h, !waagrecht);
      else lauf(c, x, y + pos * h, w, anteil * h, !waagrecht);
      pos += anteil;
    }
  };
  lauf(g.root, 0, 0, 100, 100, g.orientation !== "VERTICAL");
  return out;
}

/** Vorschaubild einer Vorlage – aus derselben Aufteilung, mit der vorlageAnwenden() in arbeitsplatz.ts baut */
export function vorlageBild(id: string): Rechteck[] {
  const v = VORLAGEN.find((x) => x.id === id);
  if (!v) return E16([[0, 0, 100, 100]]);
  const t = v.schirme.map(aufteilungTeile);
  if (t.length > 1) return [...schirm(0.5, 10.5, 35.5, 21, t[0]), ...schirm(38, 10.5, 35.5, 21, t[1])];
  if (v.format === "32:9") return schirm(0.5, 10.5, 73, 21, t[0]);
  return E16(t[0]);
}

export function anordnungBild(a: GespeicherteAnordnung): Rechteck[] {
  const haupt = teile(a.haupt);
  const weitere = a.fenster.length;
  if (!weitere) return E16(haupt.length ? haupt : [[0, 0, 100, 100]]);
  const zweit = teile(a.fenster[0]?.layout);
  return [...schirm(0.5, 10.5, 35.5, 21, haupt), ...schirm(38, 10.5, 35.5, 21, zweit.length ? zweit : [[0, 0, 100, 100]])];
}

export function bildSvg(r: Rechteck[]): string {
  const z = (n: number) => Math.round(n * 10) / 10;
  return `<svg class="kl-vb" viewBox="0 0 74 42" aria-hidden="true">${r
    .map((q) => `<rect x="${z(q.x)}" y="${z(q.y)}" width="${z(q.w)}" height="${z(q.h)}" rx="${q.sch ? 2.5 : 1.5}"${q.sch ? ` class="sch"` : ""}></rect>`)
    .join("")}</svg>`;
}

// ---------------------------------------------------------------- Zeilen

/** Eine Zeile in einer Schublade (Haken · Symbol · Text · rechts) */
export function zeile(o: { haken?: boolean; symbol?: string; name: string; info?: string; rechts?: string; d: number; cls?: string; attr?: string }): string {
  return `<div class="kl-p kl-z${o.cls ? ` ${o.cls}` : ""}" role="button" tabindex="0" style="--d:${o.d}"${o.attr ?? ""}><span class="kl-hk">${o.haken ? ic(IC.haken) : ""}</span><span class="kl-pi">${o.symbol ? ic(o.symbol) : ""}</span><span class="kl-pt"><div class="kl-pn">${esc(o.name)}</div>${o.info ? `<div class="kl-pinfo">${esc(o.info)}</div>` : ""}</span><span class="kl-pr">${o.rechts ?? ""}</span></div>`;
}
