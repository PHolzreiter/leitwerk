/**
 * Handy als Statusgerät: Das Programm startet einen kleinen Webserver im Heimnetz (Rust, handy.rs).
 * Hier: QR-Code anzeigen, den Stand fürs Handy schicken und Tastendrücke vom Handy ausführen.
 */
import qrcode from "qrcode-generator";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { buchungName } from "../../data/klinik";
import { store } from "../../data/store";
import { findCode } from "../../sim/codes";
import { sim, type Einsatz, type SimFahrzeug } from "../../sim/engine";
import { inTauri } from "../../platform";
import { openDialog } from "../dialog";
import { el, esc, toast } from "../dom";
import { AKTIONEN, type PilotAktion } from "./tasten";

interface HandyInfo {
  url: string;
  ip: string;
  port: number;
}

let info: HandyInfo | null = null;
let hoertZu = false;
let letzterStand = "";
let ausfuehren: ((a: PilotAktion) => void) | null = null;

/** Wer die Tastendrücke vom Handy ausführt (Piloten-Interface) */
export function handyAktionen(f: (a: PilotAktion) => void): void {
  ausfuehren = f;
}

async function starten(): Promise<HandyInfo> {
  if (!inTauri()) throw new Error("Das Handy geht nur im Programm (nicht im Browser)");
  if (info) return info;
  info = await invoke<HandyInfo>("handy_starten");
  if (!hoertZu) {
    hoertZu = true;
    await listen<string>("handy-befehl", (ev) => {
      const a = ev.payload as PilotAktion;
      if (AKTIONEN.some((x) => x.id === a)) ausfuehren?.(a);
    });
  }
  letzterStand = "";
  return info;
}

function qrSvg(text: string): string {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

export function handyDialog(): void {
  const body = el("div", { class: "plt-handy" });
  body.innerHTML = `<p class="plt-leise">Verbinde …</p>`;
  openDialog({ title: "Handy als Statusgerät", body, actions: [{ label: "Fertig", kind: "primary" }] });
  starten()
    .then((i) => {
      body.innerHTML = `
        <div class="plt-qr">${qrSvg(i.url)}</div>
        <ol class="plt-schritte">
          <li>Handy im <b>selben WLAN</b> wie dieser Rechner.</li>
          <li>QR-Code mit der Kamera scannen – keine App nötig.</li>
          <li>Fragt Windows oder macOS nach dem Netzwerkzugriff für LeitWerk: <b>erlauben</b> (privates Netzwerk).</li>
        </ol>
        <p class="plt-leise">Oder im Browser des Handys öffnen:<br><code>${esc(i.url)}</code></p>`;
    })
    .catch((e) => {
      body.innerHTML = `<p class="plt-warn">${esc(String((e as Error)?.message ?? e))}</p>`;
    });
}

/** Stand fürs Handy (nur wenn der Server läuft und sich etwas geändert hat) */
export function handyStand(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  if (!info) return;
  const st = fz ? sim.statusDef(fz.status) : null;
  const alarmiert = !!fz && !!e && ["alarmWache", "alarmFunk", "alarmiert"].includes(fz.status);
  const c = e ? findCode(e.code ?? undefined) : undefined;
  const kh = e?.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  const amPatient = !!fz && !!e && ["amBO", "zumZO", "amZO"].includes(fz.status);
  const l = e?.wahr.lage;
  const f = fz?.fahrt;
  const rest = f ? Math.max(0, f.start / 1000 + f.dauer - sim.state.zeit / 1000) : 0;
  const stand = {
    heli: fz ? fz.kurzname || fz.funkrufname : "",
    unter: fz ? `${fz.funkrufname} · ${fz.stationName}` : "",
    hinweis: fz ? "" : "kein Hubschrauber gewählt",
    status: st ? { nummer: st.nummer, name: st.name, farbe: st.farbe } : null,
    alarm: alarmiert && e ? `${c?.beschreibung ?? e.code ?? ((e.meldung?.text ?? "").split(/[.;]/)[0] || "Einsatz")} – ${e.adresse?.label ?? ""}` : "",
    knoepfe: fz
      ? AKTIONEN.filter((a) => a.status).map((a) => {
          const d = sim.statusDef(a.status!);
          return { aktion: a.id, nummer: d.nummer, name: d.name, farbe: d.farbe, aktiv: fz.status === a.status };
        })
      : [],
    flug: fz ? (f ? `Anhalten (${fz.pilot?.flugZiel ?? "Flug"}, noch ${Math.max(1, Math.round(rest / 60))} min)` : "Übungsflug zum nächsten Ziel") : "",
    einsatz: e ? { nummer: e.nummer, stichwort: c?.beschreibung ?? e.code ?? (e.meldung?.text ?? "").split(/[.;]/)[0], adresse: e.adresse?.label ?? "", info: e.infoRtw ?? "", ziel: kh ? kh.kurzname || kh.name : "" } : null,
    patient: amPatient
      ? [
          ...(l?.fall?.kern ? [l.fall.kern] : []),
          ...(e?.wahr.verdacht ? [`Verdacht: ${buchungName(e.wahr.verdacht)}`] : []),
          ...(l?.patienten ?? []).map((p) => `${p.alter < 14 ? "Kind" : p.geschlecht === "w" ? "Frau" : "Mann"} ${p.alter} J. · ${p.sichtung} · ${{ ja: "wach", getruebt: "eingetrübt", nein: "bewusstlos" }[p.bw]}`),
        ]
      : null,
  };
  const json = JSON.stringify(stand);
  if (json === letzterStand) return;
  letzterStand = json;
  void invoke("handy_stand", { json }).catch((err) => {
    console.warn("Handy", err);
    toast("Handy: Stand konnte nicht übergeben werden", "error");
  });
}
