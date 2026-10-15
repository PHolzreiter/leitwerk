/**
 * Wetter in der 3D-Ansicht: ganz zurückhaltend – feiner Regen/Schnee/Hagel, Dunst zum Horizont,
 * bei Gewitter ab und zu ein kurzes Aufhellen. Liegt als dünne Schicht über der Karte (Klicks gehen durch),
 * zeichnet nur in 3D, nur wenn das Fenster sichtbar ist und höchstens ~30 Bilder pro Sekunde.
 */
import { sim } from "./sim/engine";
import { lageVon, type WetterLage } from "./sim/weather";
import { onPers, pers } from "./ui/ws/persoenlich";

interface Teilchen {
  x: number;
  y: number;
  v: number;
  l: number;
  a: number;
}

type Art = "regen" | "schnee" | "hagel";

function stil(l: WetterLage): { art: Art | null; n: number; zweit?: { art: Art; n: number }; dunst: number; blitz: number } {
  switch (l) {
    case "niesel":
      return { art: "regen", n: 35, dunst: 0.1, blitz: 0 };
    case "leichter_regen":
      return { art: "regen", n: 60, dunst: 0.08, blitz: 0 };
    case "regen":
      return { art: "regen", n: 100, dunst: 0.12, blitz: 0 };
    case "starkregen":
      return { art: "regen", n: 170, dunst: 0.18, blitz: 0 };
    case "gewitter":
      return { art: "regen", n: 130, dunst: 0.14, blitz: 1 };
    case "hagel":
      return { art: "regen", n: 90, zweit: { art: "hagel", n: 45 }, dunst: 0.14, blitz: 1 };
    case "unwetter":
      return { art: "regen", n: 190, dunst: 0.2, blitz: 2 };
    case "schneeregen":
      return { art: "regen", n: 45, zweit: { art: "schnee", n: 30 }, dunst: 0.12, blitz: 0 };
    case "leichter_schnee":
      return { art: "schnee", n: 45, dunst: 0.1, blitz: 0 };
    case "schnee":
      return { art: "schnee", n: 90, dunst: 0.16, blitz: 0 };
    case "starker_schnee":
      return { art: "schnee", n: 160, dunst: 0.26, blitz: 0 };
    case "eisregen":
      return { art: "regen", n: 60, dunst: 0.12, blitz: 0 };
    case "dunst":
      return { art: null, n: 0, dunst: 0.16, blitz: 0 };
    case "nebel":
      return { art: null, n: 0, dunst: 0.42, blitz: 0 };
    case "hochnebel":
      return { art: null, n: 0, dunst: 0.26, blitz: 0 };
    default:
      return { art: null, n: 0, dunst: 0, blitz: 0 };
  }
}

export function wetter3dAnbinden(container: HTMLElement, ist3d: () => boolean): { aktualisieren(): void; dispose(): void } {
  const schicht = document.createElement("div");
  schicht.className = "wetter3d";
  const dunst = document.createElement("div");
  dunst.className = "wetter3d-dunst";
  const canvas = document.createElement("canvas");
  canvas.className = "wetter3d-canvas";
  const blitz = document.createElement("div");
  blitz.className = "wetter3d-blitz";
  schicht.append(dunst, canvas, blitz);
  container.appendChild(schicht);
  const ctx = canvas.getContext("2d")!;

  let teilchen: { art: Art; t: Teilchen[] }[] = [];
  let laeuft = 0;
  let letzt = 0;
  let lage: WetterLage = "klar";
  let blitzTimer: number | undefined;
  let schraeg = 0;

  const groesse = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { w, h };
  };

  const neu = (art: Art, w: number, h: number, zufallsY = true): Teilchen => ({
    x: Math.random() * (w + 200) - 100,
    y: zufallsY ? Math.random() * h : -20,
    v: art === "regen" ? 9 + Math.random() * 6 : art === "hagel" ? 14 + Math.random() * 6 : 0.8 + Math.random() * 1.2,
    l: art === "regen" ? 10 + Math.random() * 10 : art === "hagel" ? 2 : 1.2 + Math.random() * 1.6,
    a: art === "regen" ? 0.12 + Math.random() * 0.14 : art === "hagel" ? 0.45 : 0.35 + Math.random() * 0.3,
  });

  const zeichnen = (bewegen: boolean) => {
    const { w, h } = groesse();
    ctx.clearRect(0, 0, w, h);
    for (const gruppe of teilchen) {
      for (const p of gruppe.t) {
        if (bewegen) {
          p.y += p.v;
          p.x += gruppe.art === "schnee" ? Math.sin((p.y + p.x) / 40) * 0.4 + schraeg * 0.15 : schraeg * p.v * 0.06;
          if (p.y > h + 20 || p.x < -120 || p.x > w + 120) Object.assign(p, neu(gruppe.art, w, h, false));
        }
        if (gruppe.art === "regen") {
          // mittlerer Blaugrauton: auf heller und dunkler Karte sichtbar, aber zurückhaltend
          ctx.strokeStyle = lage === "eisregen" ? `rgba(120,160,210,${p.a * 1.4})` : `rgba(110,130,160,${p.a * 1.4})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - schraeg * p.l * 0.06, p.y - p.l);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(255,255,255,${p.a})`;
          ctx.strokeStyle = `rgba(120,135,155,${p.a * 0.5})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.l, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  };

  const schleife = (t: number) => {
    laeuft = requestAnimationFrame(schleife);
    if (t - letzt < 33) return; // ~30 Bilder/s
    letzt = t;
    if (document.hidden || !container.offsetParent) return;
    zeichnen(true);
  };

  const blitzen = () => {
    const s = stil(lage);
    if (!s.blitz || !aktiv() || pers().animationen === false) return;
    const einmal = (verz: number) =>
      setTimeout(() => {
        blitz.classList.remove("an");
        void blitz.offsetWidth;
        blitz.classList.add("an");
      }, verz);
    einmal(0);
    if (Math.random() < 0.35) einmal(180);
    const naechster = (s.blitz > 1 ? 10_000 + Math.random() * 20_000 : 20_000 + Math.random() * 40_000) / Math.max(1, Math.min(3, sim.state.tempo || 1));
    blitzTimer = window.setTimeout(blitzen, naechster);
  };

  const aktiv = () => ist3d() && pers().wetter3d !== false && sim.settings.wetterAktiv;

  const aktualisieren = () => {
    const l = lageVon(sim.state.wetter.lage);
    const an = aktiv();
    const s = stil(l);
    const wind = sim.state.wetter.wind ?? 10;
    schraeg = Math.min(40, wind * 0.6) * ((sim.state.wetter.richtung ?? 270) > 180 ? 1 : -1);
    schicht.hidden = !an || (s.n === 0 && s.dunst === 0);
    dunst.style.opacity = an ? String(s.dunst) : "0";
    const bewegt = pers().animationen !== false;
    if (l !== lage || !teilchen.length !== !s.art) {
      lage = l;
      const { w, h } = groesse();
      teilchen = [];
      if (s.art) teilchen.push({ art: s.art, t: Array.from({ length: s.n }, () => neu(s.art!, w, h)) });
      if (s.zweit) teilchen.push({ art: s.zweit.art, t: Array.from({ length: s.zweit.n }, () => neu(s.zweit!.art, w, h)) });
      window.clearTimeout(blitzTimer);
      if (s.blitz) blitzTimer = window.setTimeout(blitzen, 5000 + Math.random() * 10_000);
    }
    const braucht = an && teilchen.length > 0;
    if (braucht && bewegt && !laeuft) laeuft = requestAnimationFrame(schleife);
    if ((!braucht || !bewegt) && laeuft) {
      cancelAnimationFrame(laeuft);
      laeuft = 0;
    }
    if (braucht && !bewegt) zeichnen(false); // nur angedeutet, steht still
    if (!braucht) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!an) window.clearTimeout(blitzTimer);
    else if (s.blitz && !blitzTimer) blitzTimer = window.setTimeout(blitzen, 5000);
  };

  let letzteLage = "";
  const ausSim = sim.onChange(() => {
    const k = `${sim.state.wetter.lage}|${Math.round((sim.state.wetter.wind ?? 0) / 5)}|${ist3d()}`;
    if (k !== letzteLage) {
      letzteLage = k;
      aktualisieren();
    }
  });
  const ausPers = onPers(() => aktualisieren());
  aktualisieren();
  return {
    aktualisieren,
    dispose: () => {
      ausSim();
      ausPers();
      cancelAnimationFrame(laeuft);
      window.clearTimeout(blitzTimer);
      schicht.remove();
    },
  };
}
