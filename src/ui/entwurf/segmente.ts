/**
 * Auswahlleisten im Spiel (.segs / .seg) gleiten wie im Hauptmenü (reglerAnim in einstellungen/seiten.js):
 * Die blaue Markierung gleitet (260 ms, cubic-bezier(.4,0,.2,1)). Sie ist ein Fenster: darunter bleibt die
 * helle Schrift, im Fenster liegt dieselbe Schrift dunkel und steht still. So wird eine Schrift erst dunkel,
 * wenn die Markierung wirklich darunter ist – nie weiß auf blau, kein vorzeitiger Farbwechsel.
 *
 * Läuft für alle Leisten im Spiel (Kopfleiste, Fenster, Masken, Pilot) über einen einzigen Klick-Beobachter.
 * Die Leisten werden beim Umschalten oft neu gezeichnet; deshalb wird der neue Zustand per MutationObserver abgewartet.
 */
import "./segmente.css";

const ohneAnimation = () =>
  document.documentElement.classList.contains("ohne-animation") || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function segAnim(e: Event): void {
  const t = (e.target as Element | null)?.closest?.(".segs .seg") as HTMLElement | null;
  if (!t || !t.animate || t.classList.contains("on") || t.classList.contains("segc")) return;
  if ((t as HTMLButtonElement).disabled || t.getAttribute("aria-disabled") === "true") return;
  if (ohneAnimation()) return;
  const box0 = t.closest(".segs") as HTMLElement | null;
  if (!box0 || box0.closest(".l-segs")) return;
  const vorher = box0.querySelector<HTMLElement>(":scope > .seg.on");
  if (!vorher) return;
  const r = box0.getBoundingClientRect();
  const vr = vorher.getBoundingClientRect();
  // Leiste am selben Ort wiederfinden (sie kann beim Umschalten neu gebaut worden sein)
  const finden = (): HTMLElement | null => {
    if (box0.isConnected) return box0;
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return (el?.closest(".segs") as HTMLElement | null) ?? null;
  };
  const istUm = (b: HTMLElement) => {
    const o = b.querySelector<HTMLElement>(":scope > .seg.on");
    return !!o && Math.abs(o.getBoundingClientRect().left - vr.left) > 1;
  };
  let fertig = false;
  let nt = 0;
  const lauf = () => {
    if (fertig) return;
    fertig = true;
    mo.disconnect();
    window.clearTimeout(nt);
    const b = finden();
    if (!b || !istUm(b) || b.classList.contains("segsani")) return;
    const neu = b.querySelector<HTMLElement>(":scope > .seg.on")!;
    const br = b.getBoundingClientRect();
    const nr = neu.getBoundingClientRect();
    // Farben der Markierung und der Schrift darauf (bei .gleit malt ::before die Markierung)
    const gleit = b.classList.contains("gleit");
    // Zielfarben ohne laufenden Übergang lesen
    b.classList.add("segsfix");
    const farbe = gleit ? getComputedStyle(b, "::before").backgroundColor : getComputedStyle(neu).backgroundColor;
    const schrift = getComputedStyle(neu).color;
    const radius = gleit ? getComputedStyle(b, "::before").borderRadius : getComputedStyle(neu).borderRadius;
    b.classList.remove("segsfix");
    const ox = br.left + b.clientLeft;
    const oy = br.top + b.clientTop;
    const L0 = vr.left - ox, L1 = nr.left - ox, W0 = vr.width, W1 = nr.width;
    const pill = document.createElement("span");
    pill.className = "segpill";
    Object.assign(pill.style, { left: `${L1}px`, top: `${nr.top - oy}px`, width: `${W1}px`, height: `${nr.height}px`, background: farbe, borderRadius: radius });
    const cl = document.createElement("span");
    cl.className = "segclone";
    Object.assign(cl.style, { left: `${-L1}px`, top: `${-(nr.top - oy)}px`, width: `${b.clientWidth}px`, height: `${b.clientHeight}px` });
    b.querySelectorAll<HTMLElement>(":scope > .seg").forEach((x) => {
      const xr = x.getBoundingClientRect();
      const c = x.cloneNode(true) as HTMLElement;
      c.className = "seg segc";
      c.removeAttribute("onclick");
      c.removeAttribute("id");
      c.setAttribute("aria-hidden", "true");
      c.tabIndex = -1;
      Object.assign(c.style, { left: `${xr.left - ox}px`, top: `${xr.top - oy}px`, width: `${xr.width}px`, height: `${xr.height}px`, color: schrift });
      cl.appendChild(c);
    });
    pill.appendChild(cl);
    b.appendChild(pill);
    b.classList.add("segsani");
    // ruhig wie macOS/iOS: glattes Gleiten, kein Dehnen, kein Nachfedern
    const opt: KeyframeAnimationOptions = { duration: 260, easing: "cubic-bezier(.4,0,.2,1)" };
    const kf = [
      { left: `${L0}px`, width: `${W0}px` },
      { left: `${L1}px`, width: `${W1}px` },
    ];
    const a = pill.animate(kf, opt);
    cl.animate(
      kf.map((k) => ({ left: `${-parseFloat(k.left)}px` })),
      opt,
    );
    a.onfinish = a.oncancel = () => {
      // Endzustand ohne Farb- und Gleitübergang übernehmen – sonst blitzt die Schrift kurz hell auf
      b.classList.add("segsfix");
      b.classList.remove("segsani");
      pill.remove();
      void b.offsetWidth;
      requestAnimationFrame(() => b.classList.remove("segsfix"));
    };
  };
  const mo = new MutationObserver(() => {
    const b = finden();
    if (b && istUm(b)) lauf();
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  nt = window.setTimeout(lauf, 150);
}

let an = false;
/** einmal beim Start: alle Auswahlleisten im Spiel gleiten wie im Hauptmenü */
export function segmenteGleiten(): void {
  if (an) return;
  an = true;
  document.addEventListener("click", segAnim, true);
}
