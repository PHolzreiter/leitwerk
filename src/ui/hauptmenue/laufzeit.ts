/**
 * Kleine Laufzeit für die Hauptmenü-Vorlage (aus dem Design übernommen):
 * {{Platzhalter}}, <sc-for list as>, <sc-if value>, on…-Handler, ref.
 * Jedes Zeichnen baut den Baum neu und gleicht ihn mit dem bestehenden DOM ab (Elemente bleiben erhalten,
 * dadurch laufen CSS-Übergänge, Fokus und Cursor bleiben). Knoten, die nicht von hier stammen (Animationen,
 * Popover), und Klassen/Attribute, die das Programm selbst setzt, werden nicht angefasst – wie bei React.
 */

type Werte = Record<string, unknown>;
type Bereich = Record<string, unknown>;

interface LwKnoten {
  __lw?: true;
  __a?: Record<string, string>;
  __h?: Record<string, ((e: Event) => void) | undefined>;
  __on?: Set<string>;
  __wert?: unknown;
  __ref?: { current: unknown };
}
type K = Node & LwKnoten;
type E = Element & LwKnoten;

const EIN = /^\{\{([^}]+)\}\}$/;
const EV: Record<string, string[]> = {
  onclick: ["click"],
  onchange: ["input", "change"],
  oninput: ["input"],
  onkeydown: ["keydown"],
  onmousedown: ["mousedown"],
  onfocus: ["focus"],
  onblur: ["blur"],
  onpointerdown: ["pointerdown"],
  onpointermove: ["pointermove"],
  onpointerup: ["pointerup"],
  onmouseenter: ["mouseenter"],
  onmouseleave: ["mouseleave"],
};

function nachsehen(ausdruck: string, b: Bereich, w: Werte): unknown {
  const p = ausdruck.trim().split(".");
  let o: unknown = p[0] in b ? b[p[0]] : w[p[0]];
  for (let i = 1; i < p.length; i++) o = o == null ? undefined : (o as Record<string, unknown>)[p[i]];
  return o;
}
function ersetzen(t: string, b: Bereich, w: Werte): string {
  return t.replace(/\{\{([^}]+)\}\}/g, (_m, a: string) => {
    const v = nachsehen(a, b, w);
    return v == null ? "" : String(v);
  });
}

/** Neuen Baum aus der Vorlage bauen (noch nicht im Dokument) */
function bauen(von: Node, nach: Node, b: Bereich, w: Werte): void {
  for (const n of Array.from(von.childNodes)) {
    if (n.nodeType === 3) {
      const t = document.createTextNode(ersetzen(n.nodeValue ?? "", b, w)) as K;
      t.__lw = true;
      nach.appendChild(t);
      continue;
    }
    if (n.nodeType !== 1) continue;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "sc-for") {
      const m = (el.getAttribute("list") ?? "").match(EIN);
      const liste = (m ? (nachsehen(m[1], b, w) as unknown[]) : null) ?? [];
      const als = el.getAttribute("as") ?? "x";
      liste.forEach((it, i) => bauen(el, nach, { ...b, [als]: it, index: i }, w));
      continue;
    }
    if (tag === "sc-if") {
      const m = (el.getAttribute("value") ?? "").match(EIN);
      if (m && nachsehen(m[1], b, w)) bauen(el, nach, b, w);
      continue;
    }
    const neu = el.cloneNode(false) as E;
    neu.__lw = true;
    neu.__a = {};
    neu.__h = {};
    for (const at of Array.from(el.attributes)) {
      const name = at.name.toLowerCase();
      const m = at.value.match(EIN);
      if (EV[name]) {
        neu.removeAttribute(at.name);
        const f = m ? nachsehen(m[1], b, w) : undefined;
        for (const t of EV[name]) neu.__h[t] = typeof f === "function" ? (f as (e: Event) => void) : undefined;
        continue;
      }
      if (name === "ref") {
        neu.removeAttribute(at.name);
        const r = m ? nachsehen(m[1], b, w) : undefined;
        if (r && typeof r === "object") neu.__ref = r as { current: unknown };
        continue;
      }
      if (name === "value" && m) {
        neu.__wert = nachsehen(m[1], b, w);
        neu.removeAttribute(at.name);
        continue;
      }
      const wert = at.value.includes("{{") ? ersetzen(at.value, b, w) : at.value;
      neu.setAttribute(at.name, wert);
      neu.__a[at.name] = wert;
    }
    bauen((el as HTMLTemplateElement).content ?? el, neu, b, w);
    nach.appendChild(neu);
  }
}

function lauschen(el: E): void {
  el.__on ??= new Set();
  for (const t of Object.keys(el.__h ?? {})) {
    if (el.__on.has(t)) continue;
    el.__on.add(t);
    el.addEventListener(t, (e) => el.__h?.[t]?.(e));
  }
}
function wertSetzen(el: E): void {
  if (el.__wert === undefined) return;
  const f = el as unknown as HTMLInputElement;
  const s = el.__wert == null ? "" : String(el.__wert);
  if (f.value !== s) f.value = s;
}
/** Neu gebauten Knoten zum ersten Mal ins Dokument: Handler, Werte, Refs nachziehen */
function einhaengen(n: K): void {
  if (n.nodeType !== 1) return;
  const el = n as E;
  lauschen(el);
  for (const c of Array.from(el.childNodes)) einhaengen(c as K);
  wertSetzen(el);
  if (el.__ref) el.__ref.current = el;
}

function gleich(alt: K, neu: K): boolean {
  return alt.nodeType === neu.nodeType && alt.nodeName === neu.nodeName;
}

function abgleichen(alt: E, neu: E): void {
  // Attribute: nur, was sich gegenüber dem letzten Zeichnen geändert hat (fremde Klassen bleiben)
  const vorher = alt.__a ?? {};
  const jetzt = neu.__a ?? {};
  for (const [k, v] of Object.entries(jetzt)) if (vorher[k] !== v) alt.setAttribute(k, v);
  for (const k of Object.keys(vorher)) if (!(k in jetzt)) alt.removeAttribute(k);
  alt.__a = jetzt;
  alt.__h = neu.__h;
  lauschen(alt);
  alt.__wert = neu.__wert;
  if (neu.__ref) {
    alt.__ref = neu.__ref;
    alt.__ref.current = alt;
  }
  kinder(alt, neu);
  wertSetzen(alt);
}

function kinder(alt: Node, neu: Node): void {
  const eigene = Array.from(alt.childNodes).filter((n) => (n as K).__lw) as K[];
  const neue = Array.from(neu.childNodes) as K[];
  let i = 0;
  for (; i < neue.length; i++) {
    const n = neue[i];
    const a = eigene[i];
    if (a && gleich(a, n)) {
      if (n.nodeType === 3) {
        if (a.nodeValue !== n.nodeValue) a.nodeValue = n.nodeValue;
      } else abgleichen(a as E, n as E);
      continue;
    }
    // ab hier passt die Reihe nicht mehr: alten Knoten ersetzen bzw. neuen einfügen
    neu.removeChild(n);
    neue.splice(i, 1, n); // Liste bleibt gleich lang
    if (a) alt.replaceChild(n, a);
    else {
      // hinter dem letzten eigenen Knoten einfügen (fremde Knoten am Ende bleiben dahinter)
      const letzter = i > 0 ? eigene[i - 1] : null;
      const ref = letzter && letzter.parentNode === alt ? letzter.nextSibling : alt.firstChild;
      alt.insertBefore(n, ref);
    }
    eigene[i] = n;
    einhaengen(n);
  }
  for (let j = i; j < eigene.length; j++) eigene[j].parentNode?.removeChild(eigene[j]);
}

export interface Ansicht {
  zeichnen(werte: Werte): void;
}

/** Vorlage (HTML-Text) an ein Wurzel-Element binden */
export function ansicht(vorlage: string, wurzel: HTMLElement): Ansicht {
  const tpl = document.createElement("template");
  tpl.innerHTML = vorlage;
  return {
    zeichnen(werte: Werte) {
      const frag = document.createElement("div");
      bauen(tpl.content, frag, {}, werte);
      kinder(wurzel, frag);
    },
  };
}
