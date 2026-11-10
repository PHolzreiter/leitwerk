/**
 * Kartenfenster nach dem Entwurf „Karte“ (08./09.11.): MapLibre mit den Kartenpaketen, darüber die Bedienung aus dem
 * Entwurf (Suche, 2D·3D, Karte·Satellit, Ebenen mit Legende, Zoom/Einsatz/Norden, Maßstab, Quelle, Info-Karten,
 * Rechtsklick-Menü, „Kamera folgt“, „Ort auf der Karte wählen“, Meldungsleiste) und die Marken aus „Kartenpunkte“.
 */
import vorlage from "./vorlage.html?raw";
import css from "./karte.css?raw";
import maplibregl from "maplibre-gl";
import { KarteLogik } from "./logik.js";
import type { KarteApp, KarteInfo, KarteSicht, KarteTreffer } from "./logik";
import { entwurfEinbinden, type EntwurfFenster } from "../../entwurf/einbinden";
import { addFahrzeug3D, type Fahrzeug3D } from "../../../fz3d";
import { addFzFokus, type FzFokus } from "../../../fzFokus";
import { alleOrte, kategorieLabel, poiKategorien, type Ort } from "../../../data/orte";
import { ORT_PROFIL } from "../../../data/ortProfile";
import { stellenLaden } from "../../../data/einsatzstellen";
import type { Hospital, Kind, Poi, Station } from "../../../data/model";
import { store } from "../../../data/store";
import { availableMaps, createMap, type MapHandle } from "../../../map";
import { searchAddress } from "../../../sim/geo";
import { addDataLayers, addSimLayers, daheim, FONT, funkgruppenName, pickLaeuft, setGroupVisible, setzePick, type SimLayers } from "../../../mapLayers";
import { anzeigeZeit, flughoehe, positionBei } from "../../../sim/bewegung";
import { findCode } from "../../../sim/codes";
import { fliegt, PARTNER_PHASE_TEXT, sim, type SimFahrzeug } from "../../../sim/engine";
import { hhmm } from "../../../sim/kt";
import { codeText, istUeberstellung } from "../../../sim/ktCodes";
import { PARTNER_ANZAHL, partnerArtVonTyp } from "../../../sim/partner";
import { plaetze, belegt, offen, RESSOURCEN, type Ressource } from "../../../sim/khStatus";
import { onPacksChanged } from "../../../updates";
import { openEditor, type EditorDeps } from "../../editForm";
import { khDetail } from "../../khInfo";
import { khAufnahmeOeffnen } from "../../khAufnahme";
import type { PanelInstanz, PanelKontext } from "../../ws/arbeitsplatz";
import { auswahl, funkRufen, onAuswahl, onFahrzeugZeigen, onKarteZeigen, setzeKartenWaehler, waehle } from "../../ws/auswahl";
import { wetter3dAnbinden } from "../../../wetter3d";
import { karteDunkel, onPers, onThema, pers, setzePers } from "../../ws/persoenlich";
import { einstellungenOeffnen } from "../../ws/steuerleiste";
import { addMarken, fahrtziel, khAufnahme, kurzNr, statusHex, ueberFunk, ZOOM_ORT, type Marken, type MarkenArt } from "./marken";

/** Nur eine Karte holt sich beim ersten Mal das ganze Gebiet */
let ersteKarte = true;

type InfoSel = { art: "einsatz" | "kt" | "fz" | "wache" | "kh" | "partner" | "poi"; id: string };

/** Anzeige unten in der Statusleiste */
function statusleiste(text: { pos?: string; zoom?: string }): void {
  if (text.pos !== undefined) {
    const p = document.getElementById("cursor-pos");
    if (p) p.textContent = text.pos;
  }
  if (text.zoom !== undefined) {
    const z = document.getElementById("zoom-level");
    if (z) z.textContent = text.zoom;
  }
}

/** Kurztexte der Status für die Fahrzeugliste im Einsatz („56/005 (zum BO, 2 min)“) */
const S_KURZ: Record<string, string> = { alarmWache: "alarmiert", alarmFunk: "alarmiert", alarmiert: "quittiert", zumBO: "zum BO", amBO: "am BO", zumZO: "zum ZO", amZO: "am ZO", freiFunk: "frei", freiWache: "frei" };

/** Maßstab: runde Länge, höchstens 100 px breit */
function massstab(map: maplibregl.Map): { text: string; px: number } {
  const lat = map.getCenter().lat;
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, map.getZoom()));
  const max = mpp * 100;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const n = [5, 2, 1].map((f) => f * p).find((x) => x <= max) ?? p;
  return { text: n >= 1000 ? `${n / 1000} km` : `${n} m`, px: Math.max(20, Math.round(n / mpp)) };
}

const EBENEN_START = { wachen: true, kh: true, poi: true };

export function karteFenster(ctx: PanelKontext, editorDeps: () => EditorDeps): PanelInstanz {
  const root = document.createElement("div");
  root.className = "pl karte-fenster";
  const mapEl = document.createElement("div");
  mapEl.className = "k-map";

  const folgtAuswahl = () => ctx.params.folgt !== false;
  const ebP = (ctx.params.ebenen as Partial<typeof EBENEN_START> | undefined) ?? {};
  const ebenen = { ...EBENEN_START, ...ebP, stellen: false };

  let h: MapHandle | null = null;
  let map: maplibregl.Map | null = null;
  let fz3d: Fahrzeug3D | null = null;
  let fokus: FzFokus | null = null;
  let marken: Marken | null = null;
  let simL: SimLayers | null = null;
  let is3d = false;
  let isSat = false;
  let wetter3dNeu: () => void = () => {};
  const aus: (() => void)[] = [];
  let entfernt = false;

  let info: InfoSel | null = null;
  let kontext: { x: number; y: number; lat: number; lon: number } | null = null;
  let meldung: { text: string; knopf: boolean } | null = null;
  let waehlt: { titel: string; fertig: (v: { lat: number; lon: number } | null) => void } | null = null;
  let gesetzt: { lng: number; lat: number; text: string } | null = null;
  let treffer: KarteTreffer[] = [];
  let trefferFuer = "";
  let markerKlick = 0;

  // ---------------------------------------------------------------- Zeichnen (gebündelt je Bild)
  let fenster: EntwurfFenster<KarteLogik> | null = null;
  let geplant = 0;
  const zeichnen = () => {
    if (geplant || entfernt) return;
    geplant = requestAnimationFrame(() => {
      geplant = 0;
      fenster?.zeichnen();
    });
  };
  const zeige = (t: string) => fenster?.k.zeige(t);
  const markenNeu = () => {
    marken?.neu();
    simL?.wegeNeu();
  };

  // ---------------------------------------------------------------- Info-Karten
  const bild = (lng: number, lat: number) => {
    const p = map!.project([lng, lat]);
    return { x: p.x, y: p.y };
  };
  const knopfReihe = (k: KarteInfo["knoepfe"]) => k;
  const bearbeiten = (kind: Kind, id: string) => ({ t: "Bearbeiten", cls: "leise", klick: () => openEditor(kind, id, editorDeps()) });

  function fzInfo(fz: SimFahrzeug): KarteInfo {
    const t = anzeigeZeit();
    const [lng, lat] = fz.fahrt ? positionBei(fz, t) : [fz.lon, fz.lat];
    const st = sim.statusDef(fz.status);
    const faehrt = !!fz.fahrt && t < fz.fahrt.start + fz.fahrt.dauer * 1000;
    const hoehe = fliegt(fz) ? flughoehe(fz, t) : 0;
    const zeilen: KarteInfo["zeilen"] = [];
    const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
    const ktIds = fz.kt?.aktiv ? (fz.kt.fahrten[0] ?? []) : [];
    if (e) zeilen.push({ l: "Auftrag", w: `Einsatz ${kurzNr(e.nummer)}${e.code ? ` · ${e.code}` : ""}` });
    else if (ktIds.length) zeilen.push({ l: "Auftrag", w: ktIds.map((id) => sim.ktAuftrag(id)).filter(Boolean).map((k) => `${kurzNr(k!.nummer, true, istUeberstellung(k!.d))} · ${k!.d.code ?? ""}`.trim()).join(", ") });
    else if (fz.kt) zeilen.push({ l: "Auftrag", w: `für ${fz.kt.fahrten.flat().length} Krankentransport(e) vorgemerkt` });
    const ziel = fahrtziel(fz);
    if (ziel) zeilen.push({ l: "Fahrtziel", w: ziel });
    if (faehrt && fz.fahrt) {
      const rest = Math.max(0, (fz.fahrt.start + fz.fahrt.dauer * 1000 - t) / 60_000);
      zeilen.push({ l: "Ankunft", w: `ca. ${hhmm(t + rest * 60_000)} (in ${Math.max(1, Math.round(rest))} min)` });
    }
    if (fz.besetzung?.length) zeilen.push({ l: "Besatzung", w: fz.besetzung.map((p) => p.quali).join(" · ") });
    const folgtHier = fokus?.folgtId() === fz.id;
    const knoepfe: KarteInfo["knoepfe"] = [
      {
        t: folgtHier ? "Nicht mehr folgen" : "Kamera folgen",
        cls: "prim",
        klick: () => {
          if (folgtHier) fokus?.folge(null);
          else {
            fokus?.folge(fz.id);
            info = null;
          }
          zeichnen();
        },
      },
    ];
    if (fz.einsatzId || fz.kt)
      knoepfe.push({
        t: fz.einsatzId ? "Zum Einsatz" : "Zum Transport",
        klick: () => {
          // in der Liste der aktuellen Einsätze wählen (keine Maske nach vorne, Karte bleibt)
          if (fz.einsatzId) waehle("einsatz", fz.einsatzId, { karte: false, maske: false });
          else if (fz.kt?.fahrten[0]?.[0]) waehle("kt", fz.kt.fahrten[0][0], { karte: false, maske: false });
          zeige(`${fz.einsatzId ? "Einsatz" : "Transport"} in der Liste gewählt – Karte bleibt`);
        },
      });
    knoepfe.push({ t: "Anfunken", cls: "leise", klick: () => funkRufen(fz.id) });
    return {
      ...bild(lng, lat),
      st: st.nummer,
      stCls: `stfahne${ueberFunk(fz.status) ? " funk" : ""}`,
      stStil: `background:${statusHex(fz.status)}`,
      titel: `${fz.funkrufname} · ${fz.typ || fz.rmTyp}`,
      unter: `${fz.stationName || fz.kurzname} · ${st.name}${fz.blaulicht && faehrt ? " · mit Sondersignal" : ""}${hoehe > 5 ? ` · in der Luft (${Math.round(hoehe)} m)` : ""}`,
      zeilen,
      knoepfe: knopfReihe(knoepfe),
    };
  }

  function einsatzInfo(id: string): KarteInfo | null {
    const e = sim.einsatz(id);
    if (!e?.adresse) return null;
    const c = findCode(e.code ?? undefined);
    const nr = kurzNr(e.nummer);
    const t = anzeigeZeit();
    const fz = e.fahrzeuge
      .map((fid) => sim.state.fahrzeuge[fid])
      .filter(Boolean)
      .map((f) => {
        const rest = f.fahrt && t < f.fahrt.start + f.fahrt.dauer * 1000 ? Math.max(1, Math.round((f.fahrt.start + f.fahrt.dauer * 1000 - t) / 60_000)) : null;
        return `${f.funkrufname} (${S_KURZ[f.status] ?? sim.statusDef(f.status).name}${rest ? `, ${rest} min` : ""})`;
      });
    const zeilen = [{ l: "Stufe", w: c?.stufe ?? "–" }, { l: "Ort", w: e.adresse.label }, { l: "Fahrzeuge", w: fz.length ? fz.join(" · ") : "noch keine" }];
    if (e.fremd) zeilen.push({ l: "Zone", w: `Nachbarzone ${e.fremd.zone}` });
    const oeffnen = () => waehle("einsatz", id, { karte: false });
    return {
      ...bild(e.adresse.lon, e.adresse.lat),
      titel: `Einsatz ${nr}${e.code ? ` · ${e.code}` : ""}`,
      unter: c?.beschreibung ?? e.meldung.text,
      zeilen,
      knoepfe: [
        { t: "RD-Übersicht öffnen", cls: "prim", klick: oeffnen },
        { t: "Fahrzeug nachalarmieren", klick: oeffnen },
      ],
    };
  }

  function ktInfo(id: string): KarteInfo | null {
    const k = sim.ktAuftrag(id);
    if (!k?.d.von) return null;
    const sek = istUeberstellung(k.d);
    const f = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
    const t = anzeigeZeit();
    const rest = f?.fahrt && t < f.fahrt.start + f.fahrt.dauer * 1000 ? Math.max(1, Math.round((f.fahrt.start + f.fahrt.dauer * 1000 - t) / 60_000)) : null;
    const zeilen = [{ l: "Abholort", w: k.d.von.label }];
    if (k.d.nach) zeilen.push({ l: "Zielort", w: k.d.nach.label });
    if (k.d.abholung) zeilen.push({ l: "Abholung", w: hhmm(k.d.abholung) });
    zeilen.push({ l: "Fahrzeuge", w: f ? `${f.funkrufname} (${S_KURZ[f.status] ?? sim.statusDef(f.status).name}${rest ? `, ${rest} min` : ""})` : "noch keines" });
    const oeffnen = () => waehle("kt", id, { karte: false });
    return {
      ...bild(k.d.von.lon, k.d.von.lat),
      titel: `${kurzNr(k.nummer, true, sek)}${k.d.code ? ` · ${k.d.code}` : ""}`,
      unter: codeText(k.d.code).replace(/^\S+\s/, "") || (sek ? "Überstellung" : "Krankentransport"),
      zeilen,
      knoepfe: [
        { t: sek ? "SEK-Übersicht öffnen" : "KT-Übersicht öffnen", cls: "prim", klick: oeffnen },
        { t: "Fahrzeug nachalarmieren", klick: oeffnen },
      ],
    };
  }

  function wacheInfo(s: Station): KarteInfo {
    const heli = s.typ === "Luftrettung";
    const fzs = Object.values(sim.state.fahrzeuge).filter((f) => f.stationId === s.id);
    const zuhause = fzs.filter(daheim).sort((a, b) => a.funkrufname.localeCompare(b.funkrufname, "de"));
    return {
      ...bild(s.lon, s.lat),
      titel: s.name,
      unter: heli ? "Flugrettung · Stützpunkt" : `${s.typ === "Rettungsdienst" ? "Rettungswache" : s.typ}${s.ort ? ` · ${s.ort}` : ""}`,
      zeilen: zuhause.length ? zuhause.map((f) => ({ l: f.funkrufname, w: `${f.typ || f.rmTyp} · ${sim.statusDef(f.status).name}` })) : [{ l: "Fahrzeuge", w: fzs.length ? "gerade alle unterwegs" : "keine Fahrzeuge" }],
      knoepfe: [bearbeiten("stations", s.id)],
    };
  }

  function partnerInfo(s: Station): KarteInfo {
    const art = partnerArtVonTyp(s.typ)!;
    const unterwegs = (sim.state.partnerFz ?? []).filter((u) => u.station === s.name);
    return {
      ...bild(s.lon, s.lat),
      titel: s.name,
      unter: [s.typ, s.ort].filter(Boolean).join(" · "),
      zeilen: [
        { l: "Im Einsatz", w: unterwegs.length ? unterwegs.map((u) => `${u.name} (${PARTNER_PHASE_TEXT[u.phase]})`).join(" · ") : "keine Fahrzeuge im Einsatz" },
        { l: "Alarmierung", w: `über den Einsatz (${PARTNER_ANZAHL[art]} Fahrzeug${PARTNER_ANZAHL[art] > 1 ? "e" : ""}, rückt von der nächsten Dienststelle aus)` },
      ],
      knoepfe: [bearbeiten("stations", s.id)],
    };
  }

  const KH_KURZ: Partial<Record<Ressource, string>> = { notaufnahme: "NFA", unfall: "Unfall", schockraum: "Schockraum", schockraum_trauma: "Schockraum T", schockraum_intern: "Schockraum I", herzkatheter: "PCI", stroke_unit: "Stroke", kreisssaal: "Kreißsaal" };
  function khInfoKarte(hh: Hospital): KarteInfo {
    const t = sim.state.zeit || Date.now();
    const frei = (Object.keys(KH_KURZ) as Ressource[])
      .filter((r) => plaetze(hh, r) > 0)
      .map((r) => {
        const def = RESSOURCEN.find((x) => x.id === r)!;
        const n = plaetze(hh, r);
        if (!offen(hh, def.einrichtung, t)) return `${KH_KURZ[r]} zu`;
        return `${KH_KURZ[r]} ${Math.max(0, n - belegt(sim.state.khBelegung, hh.id, r, t))}/${n}`;
      });
    const a = khAufnahme(hh, t);
    return {
      ...bild(hh.lon, hh.lat),
      titel: hh.name,
      unter: hh.ort,
      zeilen: [{ l: "Frei", w: frei.length ? frei.join(" · ") : "–" }, { l: "Aufnahme", w: a.text }],
      knoepfe: [
        { t: "KH-Status", cls: "prim", klick: () => khAufnahmeOeffnen(hh.id) },
        { t: "Mehr Info", klick: () => khDetail(hh) },
        bearbeiten("hospitals", hh.id),
      ],
    };
  }

  function poiInfo(p: Poi): KarteInfo {
    const kat = poiKategorien(p);
    const hinweis = kat.map((k) => ORT_PROFIL[k]?.hinweis).find(Boolean);
    const zeilen = [{ l: "Art", w: kat.map(kategorieLabel).join(", ") || "–" }];
    if (hinweis) zeilen.push({ l: "Hinweis", w: hinweis });
    return { ...bild(p.lon, p.lat), titel: p.name, unter: p.ort, zeilen, knoepfe: [bearbeiten("pois", p.id)] };
  }

  function infoKarte(): KarteInfo | null {
    if (!info || !map) return null;
    const i = info;
    if (i.art === "fz") {
      const fz = sim.state.fahrzeuge[i.id];
      return fz ? fzInfo(fz) : null;
    }
    if (i.art === "einsatz") return einsatzInfo(i.id);
    if (i.art === "kt") return ktInfo(i.id);
    if (i.art === "wache" || i.art === "partner") {
      const s = store.get("stations", i.id) as Station | undefined;
      return s ? (i.art === "wache" ? wacheInfo(s) : partnerInfo(s)) : null;
    }
    if (i.art === "kh") {
      const x = store.get("hospitals", i.id) as Hospital | undefined;
      return x ? khInfoKarte(x) : null;
    }
    const p = store.get("pois", i.id) as Poi | undefined;
    return p ? poiInfo(p) : null;
  }
  const zeigeInfo = (i: InfoSel | null) => {
    info = i;
    if (i?.art !== "fz" && fokus?.gewaehlt() && !fokus.folgt()) fokus.waehle(null);
    kontext = null;
    markenNeu();
    zeichnen();
  };

  // ---------------------------------------------------------------- Suche
  let suchTimer: number | undefined;
  const ortArt = (o: Ort) => (o.kind === "hospitals" ? "KH" : o.kind === "stations" ? (partnerArtVonTyp((store.get("stations", o.id) as Station | undefined)?.typ) ? "Dienststelle" : "Wache") : "POI");
  const ortZusatz = (o: Ort) => (o.kind === "pois" ? [o.kategorien.map(kategorieLabel).filter(Boolean)[0], o.ort].filter(Boolean).join(" · ") : o.ort);
  async function suchen(roh: string): Promise<void> {
    const q = roh.trim().toLowerCase();
    if (q.length < 2) {
      treffer = [];
      trefferFuer = "";
      zeichnen();
      return;
    }
    const woerter = q.split(/[\s,]+/).filter(Boolean);
    const passt = (text: string) => woerter.every((w) => text.toLowerCase().includes(w));
    const eins: KarteTreffer[] = [];
    for (const e of sim.state.einsaetze) {
      if (!e.adresse || e.zustand === "abgeschlossen" || e.gsKind) continue;
      const nr = kurzNr(e.nummer);
      if (passt(`${e.nummer} ${nr} ${e.code ?? ""} ${e.adresse.label}`)) eins.push({ art: "Einsatz", titel: `${e.code ?? "ohne Code"} · ${e.adresse.label}`, zusatz: nr, lat: e.adresse.lat, lon: e.adresse.lon, zoom: 15, ziel: { art: "einsatz", id: e.id } });
    }
    for (const k of (sim.state.kt ?? []).filter((x) => x.d.von && !["erledigt", "storniert"].includes(x.status))) {
      const nr = kurzNr(k.nummer, true, istUeberstellung(k.d));
      if (passt(`${k.nummer} ${nr} ${k.d.code ?? ""} ${k.d.von!.label} ${k.d.nach?.label ?? ""}`)) eins.push({ art: "KT", titel: `${k.d.code ?? ""} · ${k.d.von!.label}`.replace(/^ · /, ""), zusatz: nr, lat: k.d.von!.lat, lon: k.d.von!.lon, zoom: 15, ziel: { art: "kt", id: k.id } });
    }
    const fz: KarteTreffer[] = [];
    for (const f of Object.values(sim.state.fahrzeuge)) {
      if (!passt(`${f.funkrufname} ${f.typ ?? ""} ${f.rmTyp}`)) continue;
      const [lon, lat] = f.fahrt ? positionBei(f, anzeigeZeit()) : [f.lon, f.lat];
      fz.push({ art: "Fahrzeug", titel: `${f.funkrufname} ${f.typ || f.rmTyp}`, zusatz: sim.statusDef(f.status).name, lat, lon, zoom: 15, ziel: daheim(f) ? { art: "wache", id: f.stationId } : { art: "fz", id: f.id } });
    }
    fz.sort((a, b) => a.titel.localeCompare(b.titel, "de"));
    const orte = alleOrte()
      .map((o) => ({ o, text: `${o.name} ${o.ort} ${o.kategorien.map(kategorieLabel).join(" ")}` }))
      .filter((x) => passt(x.text))
      .sort((a, b) => Number(!a.o.name.toLowerCase().startsWith(woerter[0])) - Number(!b.o.name.toLowerCase().startsWith(woerter[0])) || a.o.name.localeCompare(b.o.name))
      .slice(0, 8)
      .map(({ o }): KarteTreffer => ({ art: ortArt(o), titel: o.name, zusatz: ortZusatz(o), lat: o.lat, lon: o.lon, zoom: 16, ziel: o.kind === "hospitals" ? { art: "kh", id: o.id } : o.kind === "stations" ? { art: "wache", id: o.id } : undefined }));
    // zuerst das Eigene sofort zeigen, dann Adressen nachladen
    treffer = [...eins.slice(0, 4), ...fz.slice(0, 4), ...orte].slice(0, 12);
    trefferFuer = roh.trim();
    zeichnen();
    let adressen: KarteTreffer[] = [];
    try {
      adressen = (await searchAddress(roh, 8))
        .filter((a) => !orte.some((o) => Math.abs(o.lat - a.lat) < 1e-4 && Math.abs(o.lon - a.lon) < 1e-4))
        .map((a) => ({ art: a.place ? "Ort" : "Adresse", titel: a.label, zusatz: "", lat: a.lat, lon: a.lon, zoom: a.place ? 13.5 : 17 }));
    } catch {
      /* ohne Adresssuche nur eigene Orte */
    }
    if (trefferFuer !== roh.trim() || entfernt) return; // inzwischen weitergetippt
    treffer = [...eins.slice(0, 4), ...fz.slice(0, 4), ...orte, ...adressen].slice(0, 14);
    zeichnen();
  }

  function trefferWaehlen(t: KarteTreffer | null): void {
    treffer = [];
    trefferFuer = "";
    if (!t || !map) {
      gesetzt = null;
      markenNeu();
      zeichnen();
      return;
    }
    gesetzt = t.ziel ? null : { lng: t.lon, lat: t.lat, text: t.titel };
    map.flyTo({ center: [t.lon, t.lat], zoom: Math.max(map.getZoom(), t.zoom), essential: true });
    if (t.ziel?.art === "fz") {
      fokus?.waehle(t.ziel.id);
      info = { art: "fz", id: t.ziel.id };
    } else if (t.ziel?.art === "einsatz" || t.ziel?.art === "kt") {
      waehle(t.ziel.art, t.ziel.id, { karte: false, maske: false });
      info = { art: t.ziel.art, id: t.ziel.id };
    } else if (t.ziel) {
      const s = t.ziel.art === "wache" ? (store.get("stations", t.ziel.id) as Station | undefined) : undefined;
      info = { art: t.ziel.art === "wache" && s && partnerArtVonTyp(s.typ) ? "partner" : t.ziel.art, id: t.ziel.id };
    }
    markenNeu();
    zeichnen();
  }

  // ---------------------------------------------------------------- Ebenen, Ansicht
  function setzeEbene(k: string, an: boolean): void {
    const m = map;
    if (k === "funk") setzePers({ funkLinien: an });
    else if (k === "modelle") fz3d?.setAktiv(an);
    else if (k === "folgt") ctx.setzeParams({ folgt: an });
    else if (k === "stellen") {
      ebenen.stellen = an;
      if (m) void stellenEbene(m, an);
    } else if (k === "wachen" || k === "kh" || k === "poi") {
      ebenen[k] = an;
      ctx.setzeParams({ ebenen: { wachen: ebenen.wachen, kh: ebenen.kh, poi: ebenen.poi } });
      if (k === "poi" && m) setGroupVisible(m, "pois", an);
      markenNeu();
    }
    zeichnen();
  }

  function setzeDim(d: "2d" | "3d"): void {
    const hh = h;
    if (!hh) return;
    const ziel = d === "3d";
    if (ziel && !hh.hasTerrain()) {
      meldung = { text: "Für 3D fehlt das Paket „Gelände (3D)“.", knopf: true };
      zeichnen();
      return;
    }
    if (ziel === is3d) return;
    is3d = ziel;
    hh.setMode3d(is3d);
    fz3d?.setMode3d(is3d);
    wetter3dNeu();
    markenNeu();
    zeichnen();
  }
  function setzeBasis(b: "karte" | "sat"): void {
    const ziel = b === "sat";
    if (!h || ziel === isSat) return;
    isSat = ziel;
    h.setSatellite(isSat);
    wetter3dNeu();
    zeichnen();
  }

  // ---------------------------------------------------------------- Anbindung an den Entwurf
  const app: KarteApp = {
    sicht(): KarteSicht {
      const m = map;
      const ii = infoKarte();
      return {
        dim: is3d ? "3d" : "2d",
        basis: isSat ? "sat" : "karte",
        gelaende: !!h?.hasTerrain(),
        ebenen: { ...ebenen, funk: pers().funkLinien !== false, modelle: fz3d ? fz3d.aktiv() : true, folgt: folgtAuswahl() },
        entwickler: !!pers().entwickler,
        funkgruppe: funkgruppenName(sim.funkgruppe().id),
        treffer,
        trefferFuer,
        info: ii,
        ctx: kontext,
        folgt: fokus?.folgtId() ? (sim.state.fahrzeuge[fokus.folgtId()!]?.funkrufname ?? null) : null,
        meldung,
        waehlt: waehlt?.titel ?? null,
        mass: m ? massstab(m) : { text: "", px: 80 },
        quelle: isSat ? "Kartendaten © OpenStreetMap-Mitwirkende · Luftbild: basemap.at, EOX" : "Kartendaten © OpenStreetMap-Mitwirkende",
        quelleTitel: `Protomaps © OpenStreetMap-Mitwirkende${isSat ? " · Luftbild: basemap.at (Österreich), Sentinel-2 cloudless – s2maps.eu von EOX IT Services GmbH (enthält veränderte Copernicus-Sentinel-Daten 2020)" : ""}${is3d ? " · Höhendaten: Mapzen / AWS Terrain Tiles" : ""}`,
        drehung: m?.getBearing() ?? 0,
      };
    },
    suche(q) {
      if (gesetzt) {
        gesetzt = null;
        markenNeu();
      }
      window.clearTimeout(suchTimer);
      suchTimer = window.setTimeout(() => void suchen(q), 200);
      if (q.trim().length < 2) {
        treffer = [];
        trefferFuer = "";
      }
    },
    trefferWaehlen,
    setzeDim,
    setzeBasis,
    setzeEbene,
    zoom: (r) => (r > 0 ? map?.zoomIn() : map?.zoomOut()),
    aufEinsatz() {
      const a = auswahl();
      const m = map;
      if (!m || !a.id) return false;
      const ziel = a.art === "einsatz" ? sim.einsatz(a.id)?.adresse : a.art === "kt" ? sim.ktAuftrag(a.id)?.d.von : null;
      if (!ziel) return false;
      fokus?.folge(null);
      m.flyTo({ center: [ziel.lon, ziel.lat], zoom: Math.max(m.getZoom(), 14), essential: true });
      zeigeInfo({ art: a.art === "kt" ? "kt" : "einsatz", id: a.id });
      return true;
    },
    norden() {
      const m = map;
      if (!m) return;
      fokus?.folge(null);
      const b = sim.funkgruppe().bbox;
      m.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        { padding: 40, bearing: 0, pitch: is3d ? m.getPitch() : 0, essential: true },
      );
    },
    infoZu: () => {
      if (info?.art === "fz") fokus?.waehle(null);
      zeigeInfo(null);
    },
    ctxZu: () => {
      kontext = null;
      zeichnen();
    },
    koordKopieren: () => {
      if (kontext) void navigator.clipboard?.writeText(`${kontext.lat.toFixed(6)};${kontext.lon.toFixed(6)}`);
    },
    anlegen: (art) => {
      if (kontext) openEditor(art, null, editorDeps(), { lat: kontext.lat, lon: kontext.lon });
    },
    folgtAus: () => {
      fokus?.folge(null);
      zeichnen();
    },
    meldungZu: () => {
      meldung = null;
      zeichnen();
    },
    meldungAktion: () => {
      meldung = null;
      einstellungenOeffnen("karten");
      zeichnen();
    },
    waehlZu: () => waehlt?.fertig(null),
  };

  fenster = entwurfEinbinden(root, "karte", vorlage, css, (p) => new KarteLogik(p), { app });
  const kf = () => root.querySelector<HTMLElement>(".kf");
  kf()?.prepend(mapEl);

  // ---------------------------------------------------------------- Karte starten
  async function starten(): Promise<void> {
    let maps: string[] = [];
    try {
      maps = await availableMaps();
    } catch (err) {
      console.error(err);
    }
    if (entfernt) return;
    if (!maps.includes("overview")) meldung = { text: "Die Kartendateien wurden nicht gefunden. Bitte das Grundpaket laden.", knopf: true };
    // Die Karte muss im Fenster liegen, bevor MapLibre die Größe misst
    if (!mapEl.isConnected) kf()?.prepend(mapEl);
    h = createMap(mapEl, maps, { dunkel: karteDunkel(), eigeneBedienung: true, ruhig: true });
    const m = h.map;
    map = m;
    const hh = h;
    if (location.search.includes("debug")) {
      const w = window as unknown as { __lw?: Record<string, unknown> };
      if (w.__lw && (!w.__lw.map || (w.__lw.map as { _removed?: boolean })._removed)) w.__lw.map = m;
    }

    m.on("load", () => {
      addDataLayers(m, {
        onPoi: (id) => {
          markerKlick = performance.now();
          zeigeInfo({ art: "poi", id });
        },
      });
      if (!ebenen.poi) setGroupVisible(m, "pois", false);
      fokus = addFzFokus(m, {
        is3d: () => is3d,
        geaendert: () => {
          markenNeu();
          zeichnen();
        },
      });
      simL = addSimLayers(m, {
        onIncident: (id) => {
          markerKlick = performance.now();
          waehle("einsatz", id, { karte: false, maske: false });
          zeigeInfo({ art: "einsatz", id });
        },
        wege: {
          fahrzeuge: () => {
            const sel = fokus?.gewaehlt();
            if (sel) return [sel];
            const a = auswahl();
            if (a.art === "einsatz" && a.id) return sim.einsatz(a.id)?.fahrzeuge ?? [];
            if (a.art === "kt" && a.id) {
              const k = sim.ktAuftrag(a.id);
              return [k?.fz, k?.begleit].filter((x): x is string => !!x);
            }
            return [];
          },
          farbe: (id) => statusHex(sim.state.fahrzeuge[id]?.status ?? "zumBO"),
        },
      });
      fz3d = addFahrzeug3D(m);
      if (location.search.includes("debug")) {
        const w = window as unknown as { __lw?: Record<string, unknown> };
        if (w.__lw) w.__lw.fz3d = fz3d;
      }
      marken = addMarken(m, {
        ebene: (k) => ebenen[k],
        auswahl: () => auswahl(),
        fahrzeug: () => fokus?.gewaehlt() ?? null,
        einrichtung: () => (info && (info.art === "wache" || info.art === "kh" || info.art === "partner") ? { art: info.art, id: info.id } : null),
        alsModell: (fl) => !!fz3d?.alsModell(fl),
        gesetzt: () => gesetzt,
        klick: (art: MarkenArt, id: string) => {
          markerKlick = performance.now();
          if (pickLaeuft()) return;
          if (art === "einsatz" || art === "kt" || art === "br") {
            // Klick öffnet den Einsatz bzw. Transport in der Einsatzansicht (Maske nach vorne)
            const a = art === "kt" ? "kt" : "einsatz";
            info = null;
            waehle(a, id, { karte: false, maske: true });
            zeichnen();
          } else if (art === "fz") {
            if (!sim.state.fahrzeuge[id]) return;
            fokus?.waehle(id);
            zeigeInfo({ art: "fz", id });
          } else if (art === "wache" || art === "partner" || art === "kh") zeigeInfo({ art, id });
          else if (art === "zuf" || art === "lp") zeigeInfo({ art: "kh", id });
          else if (art === "cluster") {
            const pkte = marken?.cluster(id) ?? [];
            if (!pkte.length) return;
            const b = new maplibregl.LngLatBounds(pkte[0], pkte[0]);
            for (const p of pkte) b.extend(p);
            const cam = m.cameraForBounds(b, { padding: 80, maxZoom: 16 });
            m.easeTo({ center: cam?.center ?? b.getCenter(), zoom: Math.max(ZOOM_ORT + 0.2, cam?.zoom ?? ZOOM_ORT + 0.2), essential: true });
          } else if (art === "gesetzt") {
            gesetzt = null;
            markenNeu();
          }
        },
        doppelklick: (art: MarkenArt, id: string) => {
          if (art !== "fz" || pickLaeuft()) return;
          fokus?.folge(id);
          info = null;
          zeichnen();
        },
      });
      const getroffen = (p: { x: number; y: number }) => m.queryRenderedFeatures([p.x, p.y], { layers: ["lw-pois", "lw-pois-w", "lw-flugzeuge", "lw-partner-fz"].filter((l) => m.getLayer(l)) }).length > 0;
      m.on("click", (e) => {
        if (performance.now() - markerKlick < 300) return;
        if (waehlt) {
          const fertig = waehlt.fertig;
          fertig({ lat: e.lngLat.lat, lon: e.lngLat.lng });
          return;
        }
        if (pickLaeuft() || getroffen(e.point)) return;
        const id = fz3d?.treffer(e.point.x, e.point.y);
        if (id) {
          fokus?.waehle(id);
          zeigeInfo({ art: "fz", id });
        } else if (info || fokus?.gewaehlt()) {
          fokus?.waehle(null);
          zeigeInfo(null);
        } else if (kontext) {
          kontext = null;
          zeichnen();
        }
      });
      m.on("dblclick", (e) => {
        if (pickLaeuft() || getroffen(e.point)) return;
        const id = fz3d?.treffer(e.point.x, e.point.y);
        if (id) {
          e.preventDefault();
          fokus?.folge(id);
          info = null;
          zeichnen();
        }
      });
      // Rechtsklick: Dienststelle / Krankenhaus / POI hier anlegen
      m.on("contextmenu", (e) => {
        if (waehlt || pickLaeuft()) return;
        e.preventDefault();
        kontext = { x: e.point.x, y: e.point.y, lat: e.lngLat.lat, lon: e.lngLat.lng };
        zeichnen();
      });
      let erzwungen = false;
      const w3d = wetter3dAnbinden(mapEl, () => is3d || erzwungen, m);
      aus.push(() => w3d.dispose());
      wetter3dNeu = () => w3d.aktualisieren();
      if (location.search.includes("debug")) {
        const w = window as unknown as { __lw?: Record<string, unknown> };
        if (w.__lw)
          w.__lw.wetter3dTest = (an: boolean) => {
            erzwungen = an;
            w3d.aktualisieren();
          };
      }
      fz3d.setMode3d(is3d);
      const b = sim.funkgruppe().bbox;
      if (ersteKarte) {
        ersteKarte = false;
        m.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: 40, duration: 0 },
        );
      } else m.jumpTo({ center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], zoom: 9 });
      zeichnen();
    });

    m.once("idle", zeichnen);
    m.on("move", zeichnen);

    onPacksChanged(async () => {
      if (entfernt) return;
      try {
        hh.refresh(await availableMaps());
        if (!hh.hasTerrain() && is3d) {
          is3d = false;
          hh.setMode3d(false);
          fz3d?.setMode3d(false);
        }
        if (meldung && /Kartendateien|Gelände/.test(meldung.text)) meldung = null;
        setTimeout(zeichnen, 300);
      } catch (e) {
        console.error(e);
      }
    });

    // Statusleiste
    m.on("mousemove", (e) => statusleiste({ pos: `Position: ${e.lngLat.lat.toFixed(5)}° N, ${e.lngLat.lng.toFixed(5)}° O` }));
    const zoomZeigen = () => statusleiste({ zoom: `Zoom: ${m.getZoom().toFixed(1)}` });
    m.on("zoom", zoomZeigen);
    m.on("load", zoomZeigen);

    const fehlerGesehen = new Set<string>();
    let satHinweis = false;
    m.on("error", (e) => {
      if (String((e as { sourceId?: string }).sourceId ?? "").startsWith("sat-")) {
        if (!satHinweis) {
          satHinweis = true;
          meldung = { text: "Satellitenbild nicht erreichbar – besteht eine Internetverbindung?", knopf: false };
          zeichnen();
          setTimeout(() => (satHinweis = false), 60_000);
        }
        return;
      }
      console.error("Kartenfehler", e.error);
      const msg = e.error?.message ?? String(e.error);
      if (fehlerGesehen.size < 5 && !fehlerGesehen.has(msg)) {
        fehlerGesehen.add(msg);
        meldung = { text: `Kartenfehler: ${[...fehlerGesehen].join(" | ")}`, knopf: false };
        zeichnen();
      }
    });

    const flyTo = (lat: number, lon: number, zoom?: number) => m.flyTo({ center: [lon, lat], zoom: zoom ?? Math.max(m.getZoom(), 12.5), essential: true });
    let simLast = 0;
    aus.push(
      onKarteZeigen((w) => folgtAuswahl() && !fokus?.folgt() && flyTo(w.lat, w.lon, w.zoom)),
      onAuswahl((a, opts) => {
        // Info-Karte eines anderen Einsatzes schließen
        if (info && (info.art === "einsatz" || info.art === "kt") && info.id !== a.id) info = null;
        markenNeu();
        zeichnen();
        if (opts.karte === false || !folgtAuswahl() || fokus?.folgt()) return;
        if (a.art === "einsatz" && a.id) {
          const e = sim.einsatz(a.id);
          if (e?.adresse) flyTo(e.adresse.lat, e.adresse.lon);
        } else if (a.art === "kt" && a.id) {
          const k = sim.ktAuftrag(a.id);
          if (k?.d.von) flyTo(k.d.von.lat, k.d.von.lon, 13);
        }
      }),
      onFahrzeugZeigen((id, folgen) => {
        if (folgen && id) {
          fokus?.folge(id);
          info = null;
        } else {
          fokus?.waehle(id);
          info = id ? { art: "fz", id } : null;
          const fz = id ? sim.state.fahrzeuge[id] : undefined;
          if (fz && !m.getBounds().contains([fz.lon, fz.lat])) m.easeTo({ center: [fz.lon, fz.lat], essential: true });
        }
        markenNeu();
        zeichnen();
      }),
      setzeKartenWaehler(
        (hinweis) =>
          new Promise((resolve) => {
            waehlt?.fertig(null);
            fokus?.folge(null);
            info = null;
            kontext = null;
            setzePick(true);
            const titel = /^(.*) anklicken$/.test(hinweis) ? hinweis.replace(/^(.*) anklicken$/, "$1 auf der Karte wählen") : hinweis;
            const esc = (e: KeyboardEvent) => {
              if (e.key === "Escape") {
                e.stopImmediatePropagation();
                fertig(null);
              }
            };
            const fertig = (v: { lat: number; lon: number } | null) => {
              document.removeEventListener("keydown", esc, true);
              setzePick(false);
              waehlt = null;
              if (v) zeige(/^Einsatzort/.test(titel) ? "Einsatzort übernommen – zurück zur Maske" : `${titel.replace(/ auf der Karte wählen$/, "")} übernommen`);
              zeichnen();
              resolve(v);
            };
            document.addEventListener("keydown", esc, true);
            waehlt = { titel, fertig };
            zeichnen();
          }),
      ),
      onThema(() => hh.setDunkel(karteDunkel())),
      onPers(() => zeichnen()),
      sim.onChange(() => {
        // Info-Karte (Status, Ankunft) und Folgen-Chip aktuell halten
        const now = performance.now();
        if (!info || now - simLast < 400) return;
        simLast = now;
        if (info.art === "fz" && !sim.state.fahrzeuge[info.id]) info = null;
        zeichnen();
      }),
    );
  }

  void starten();
  return {
    el: root,
    groesse: () => map?.resize(),
    sichtbar: (an: boolean) => an && requestAnimationFrame(() => map?.resize()),
    dispose: () => {
      entfernt = true;
      cancelAnimationFrame(geplant);
      waehlt?.fertig(null);
      aus.forEach((f) => f());
      try {
        const w = window as unknown as { __lw?: Record<string, unknown> };
        if (w.__lw?.map === map) delete w.__lw!.map;
        marken?.dispose();
        map?.remove();
      } catch (e) {
        console.warn(e);
      }
      fenster?.entfernen();
    },
  };
}

/** Entwickler-Ebene: alle Einsatzstellen als kleine Punkte, beschriftet mit Art und Name */
async function stellenEbene(map: maplibregl.Map, an: boolean): Promise<void> {
  if (!an) {
    for (const id of ["lw-stellen", "lw-stellen-label"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    return;
  }
  const l = await stellenLaden();
  if (!map.getSource("lw-stellen")) {
    map.addSource("lw-stellen", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: l.map((s) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { typ: s.typ, text: `${kategorieLabel(s.typ)}${s.name ? `: ${s.name}` : ""}${s.typ === "autobahn" && s.info ? ` (${s.info.replace("|", " km, → ")})` : ""}` } })),
      },
    });
    map.addLayer({
      id: "lw-stellen",
      type: "circle",
      source: "lw-stellen",
      minzoom: 8,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1, 14, 3],
        "circle-color": ["match", ["get", "typ"], "autobahn", "#d62828", "landstrasse", "#f77f00", "feldweg", "#a07a50", "radweg", "#7cb518", "wald", "#2d6a4f", "berg", "#6c584c", "ufer", "#0096c7", "weinberg", "#9d4edd", "feld", "#c9a227", "#e63946"],
        "circle-opacity": 0.8,
      },
    });
    map.addLayer({ id: "lw-stellen-label", type: "symbol", source: "lw-stellen", minzoom: 13, layout: { "text-field": ["get", "text"], "text-font": FONT, "text-size": 10, "text-offset": [0, 0.8], "text-anchor": "top" }, paint: { "text-color": "#333", "text-halo-color": "#fff", "text-halo-width": 1 } });
  }
  for (const id of ["lw-stellen", "lw-stellen-label"]) map.setLayoutProperty(id, "visibility", "visible");
}
