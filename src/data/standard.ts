/** Standarddaten, die mit LeitWerk ausgeliefert werden (data/default). */
import stationsCsv from "../../data/default/dienststellen.csv?raw";
import vehiclesCsv from "../../data/default/fahrzeuge.csv?raw";
import hospitalsCsv from "../../data/default/krankenhaeuser.csv?raw";
import poisCsv from "../../data/default/pois.csv?raw";
import templatesCsv from "../../data/default/einsatzvorlagen.csv?raw";

import vorlageStations from "../../data/beispiele/vorlage_dienststellen.csv?raw";
import vorlageVehicles from "../../data/beispiele/vorlage_fahrzeuge.csv?raw";
import vorlageHospitals from "../../data/beispiele/vorlage_krankenhaeuser.csv?raw";
import vorlagePois from "../../data/beispiele/vorlage_pois.csv?raw";
import vorlageTemplates from "../../data/beispiele/vorlage_einsatzvorlagen.csv?raw";
import beispielStations from "../../data/beispiele/beispiel_dienststellen.csv?raw";
import beispielVehicles from "../../data/beispiele/beispiel_fahrzeuge.csv?raw";
import beispielHospitals from "../../data/beispiele/beispiel_krankenhaeuser.csv?raw";
import beispielPois from "../../data/beispiele/beispiel_pois.csv?raw";
import beispielTemplates from "../../data/beispiele/beispiel_einsatzvorlagen.csv?raw";
import vorlageCodes from "../../data/beispiele/vorlage_einsatzcodes.csv?raw";
import beispielCodes from "../../data/beispiele/beispiel_einsatzcodes.csv?raw";

import { type Kind, type Records } from "./model";
import { importCsv } from "./schema";

export const STANDARD_INFO = "Niederösterreich, Stand Oktober 2026";

let cache: Records | null = null;

export function standardRecords(): Records {
  if (cache) return cache;
  const ctx = { stations: [], herkunft: "standard" as const, herkunftDetail: "LeitWerk-Standarddaten", zufallKtw: false };
  const stations = importCsv("stations", stationsCsv, ctx);
  const vehicles = importCsv("vehicles", vehiclesCsv, { ...ctx, stations: stations.records });
  const hospitals = importCsv("hospitals", hospitalsCsv, ctx);
  const pois = importCsv("pois", poisCsv, ctx);
  const templates = importCsv("templates", templatesCsv, ctx);
  for (const r of [stations, vehicles, hospitals, pois, templates]) {
    if (r.fehler.length) console.warn("Fehler in Standarddaten", r.kind, r.fehler);
  }
  cache = {
    stations: stations.records,
    vehicles: vehicles.records,
    hospitals: hospitals.records,
    pois: pois.records,
    templates: templates.records,
    // Einsatzcodes gibt es keine mitgelieferten – jeder importiert seine eigene Liste
    codes: [],
  };
  return cache;
}

export const VORLAGE: Record<Kind, string> = {
  stations: vorlageStations,
  vehicles: vorlageVehicles,
  hospitals: vorlageHospitals,
  pois: vorlagePois,
  templates: vorlageTemplates,
  codes: vorlageCodes,
};

export const BEISPIEL: Record<Kind, string> = {
  stations: beispielStations,
  vehicles: beispielVehicles,
  hospitals: beispielHospitals,
  pois: beispielPois,
  templates: beispielTemplates,
  codes: beispielCodes,
};
