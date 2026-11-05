/**
 * Funk (rechter Reiter): EIN Chat für den ganzen Funkverkehr – Fahrzeuge, Piloten, Leitstelle – und EINE Eingabe.
 * - Wem ein Funkspruch gilt, entscheidet der Text: „56/006 von LEO, kommen“ ruft, danach geht alles ohne Rufnamen
 *   an 56/006, bis „Ende“ kommt, eine Minute nichts gesagt wird oder ein anderes Fahrzeug gerufen wird.
 * - Oben steht nur, wer gerade spricht. Sprechgruppen (TETRA-Gruppe, Großeinsatz) lassen sich stumm schalten
 *   (Text bleibt sichtbar); gesprochen wird in der gewählten Gruppe.
 * - Funktaste bzw. 🎙 gedrückt halten: spricht gerade jemand, wartet man bis zu seinem Ende-Ton.
 */
import { funkGlaetten } from "./funkNamen";
import { funkGeraetErstellen, gruppenName } from "./funkGeraet";
import { sprachPrefs, tastenName } from "./sprache";
import { funkEmpfang, funkPegel, funkGruppenSetzen, funkGruppenWahl, funkSendeZustand, onFunkEmpfang, onFunkGruppen, onFunkSenden, sprechGruppe, sprechKnopfAnbinden } from "./sprechfunk";
import { mp } from "../net/mehrspieler";
import { sim, type FunkGespraech, type Sprechgruppe } from "../sim/engine";
import { el, esc, toast } from "./dom";

function uhr(t: number): string {
  return new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Was man am Funk sagen kann (Hilfe beim ⓘ) */
const HILFE = `<b>Das Funkgerät</b>
<ul>
<li><b>Sprechen:</b> PTT gedrückt halten – oder die Funktaste (in jedem Reiter, einstellbar unter Einstellungen → Anrufe &amp; KI → Sprache). Am Display steht „Senden“; spricht gerade jemand, „Warten …“ – nach seinem Ende-Ton bist du dran.</li>
<li><b>Sprechgruppe wechseln:</b> Steuerkreuz links/rechts. Normal ist es RD-NOE-03; bei einem Großeinsatz kommt RD-NOE-09 dazu, bei einem zweiten gleichzeitig RD-NOE-10. Wahlweise hat jede Gruppe eine eigene Funktaste.</li>
<li><b>Hören:</b> Die Gruppe, in die du sprichst, hörst du voll, die anderen leiser (einstellbar). Die Lampe neben der Gruppe leuchtet, wenn in einer anderen Gruppe gefunkt wird; wer spricht, steht im Fenster am Display. Dringende Rufe hörst du immer voll.</li>
<li><b>Verlauf</b> aufklappen: dort lassen sich Gruppen stumm schalten (der Text bleibt). Beim Telefonieren den Funk ganz stumm: Schalter im Reiter Telefon.</li>
</ul>
<b>Funken</b>
<ul>
<li><b>Rufen:</b> „56/006 von LEO, kommen“ (auch „NEF Krems …“, „C2 …“). Danach ohne Rufnamen weiterfunken – es gilt das zuletzt gerufene Fahrzeug.</li>
<li><b>Antworten,</b> wenn ein Fahrzeug ruft: „Hier LEO, kommen“.</li>
<li><b>Beenden:</b> „Verstanden, Ende“. Nach einer Minute ohne Funkspruch ist das Gespräch auch aus – dann neu rufen.</li>
<li>Ein anderes Fahrzeug rufen beendet das laufende Gespräch (z. B. „NEF Hollabrunn, mitgehört?“). Was das erste Fahrzeug noch sagen wollte, meldet es später.</li>
<li>Ein Fahrzeug, das auf einer anderen Gruppe ist (z. B. beim Großeinsatz auf RD-NOE-09), hört dich dort nicht – du bekommst einen Hinweis.</li>
</ul>
<b>Das verstehen die Fahrzeuge</b>
<ul>
<li>Lagemeldung anfordern, Status / Eintreffzeit, Zustand des Patienten und weitere Kräfte</li>
<li>Vitalwerte, Verdacht, Zielkrankenhaus nennen oder fragen</li>
<li>Einsatzauftrag („neuer Einsatz …, Code …, Einsatzort …“), Zusatzinfo, Polizei/Feuerwehr vor Ort, Storno („Storno, rückt ein“)</li>
<li>Funkcheck („wie hört ihr mich?“), „mitgehört“ beim Funk zwischen Fahrzeugen</li>
</ul>
<b>Regeln</b>
<ul>
<li>Je Gruppe spricht immer nur einer, es gibt nur einen Warteplatz. In verschiedenen Gruppen darf gleichzeitig gefunkt werden.</li>
<li>Kein Fahrzeug ruft, solange mit einem anderen gefunkt wird – außer „dringend“ (Reanimation, Gefahr für die Besatzung), und auch das erst zwischen zwei Funksprüchen.</li>
<li>Wer keine Antwort bekommt, ruft nach 30 s wieder, dann nach 1, 3, 6, 12 … Minuten.</li>
</ul>`;

/** echte Sekunden seit dem ersten Funkspruch mit derselben Spielzeit (in der Pause steht die Spieluhr) */
function funkVersatz(zeilen: { s: { zeit: number; echt?: number } }[], i: number): number {
  const z = zeilen[i].s;
  if (z.echt === undefined) return 0;
  let j = i;
  while (j > 0 && zeilen[j - 1].s.zeit === z.zeit && zeilen[j - 1].s.echt !== undefined) j--;
  return Math.max(0, z.echt - (zeilen[j].s.echt ?? z.echt));
}

export function createFunkView(root: HTMLElement, deps: { select(einsatzId: string): void }): { refresh(): void; rufen(fzId: string): void; offen(): number } {
  root.innerHTML = "";
  /** ein Funkgerät für alle Gruppen */
  const nurKanal: Sprechgruppe | undefined = undefined;
  const gruppen = el("div", { class: "funk-gruppen" });
  const lage = el("div", { class: "funk-lage", hidden: "" });
  const chat = el("div", { class: "funk-chat" });
  const form = el("form", { class: "funk-form funk-eine" });
  const eingabe = el("input", { type: "text", placeholder: "Funkspruch … z. B. „75/001 von LEO, kommen“ (Enter)" });
  // Sprechtaste wie am echten Gerät (gedrückt halten); die Funktaste der Tastatur geht in jedem Reiter
  const ptt = el("button", { class: "fg-ptt", type: "button", title: `Gedrückt halten zum Sprechen – oder die Funktaste ${tastenName(sprachPrefs().funkTaste)} (in jedem Reiter)` }, "PTT");
  const geraet = funkGeraetErstellen();
  const senden = el("button", { class: "btn small primary", type: "submit" }, "Senden");
  const info = el("span", { class: "funk-info", tabindex: "0" }, "ⓘ");
  const infoBox = el("div", { class: "funk-info-box" });
  infoBox.innerHTML = HILFE;
  info.appendChild(infoBox);
  form.append(eingabe, senden, info);
  sprechKnopfAnbinden(ptt, () => "leo", () => meineGruppe());
  const unten = el("div", { class: "funk-unten" });
  unten.append(ptt, form);
  // Verlauf: zu Beginn zu (kompaktes Fenster), auf Knopfdruck auf
  const titel = el("div", { class: "funk-verlauf-titel" });
  const klapp = el("button", { class: "btn small funk-klapp", type: "button", "aria-expanded": "false" }, "Verlauf ▸");
  titel.append(klapp, gruppen);
  const verlaufTeil = el("div", { class: "funk-verlauf-teil", hidden: "" });
  gruppen.hidden = true;
  verlaufTeil.append(chat);
  let offenV = false;
  klapp.addEventListener("click", () => {
    offenV = !offenV;
    verlaufTeil.hidden = !offenV;
    gruppen.hidden = !offenV;
    klapp.textContent = offenV ? "Verlauf ▾" : "Verlauf ▸";
    klapp.setAttribute("aria-expanded", String(offenV));
    root.classList.toggle("funk-offen", offenV);
    letzterChat = "";
    refresh();
  });
  void lage;
  root.append(geraet.el, unten, titel, verlaufTeil);
  onFunkSenden(() => refresh());
  onFunkEmpfang(() => refresh());
  const ausG = onFunkGruppen(() => refresh());

  /** Gruppe, in der ich spreche */
  const meineGruppe = (): Sprechgruppe => sprechGruppe();

  /** Gesprächspartner jetzt (zuletzt aktives Gespräch der Leitstelle auf meiner Gruppe) */
  function partner(): FunkGespraech | undefined {
    const k = meineGruppe();
    return (sim.state.funkGespraeche ?? [])
      .filter((g) => (g.kanal ?? null) === k && !g.an && ["offen", "leoRuft", "mensch"].includes(g.status))
      .sort((a, b) => (b.echtLetzt ?? 0) - (a.echtLetzt ?? 0))[0];
  }

  // Wer gerade schreibt, bekommt keine Minute Stille: Gespräch bleibt offen
  let tipptGemeldet = 0;
  const tippt = () => {
    const p = partner();
    if (!p || Date.now() - tipptGemeldet < 3000) return;
    tipptGemeldet = Date.now();
    sim.call("funkTippt", p.id).catch(() => {});
  };
  eingabe.addEventListener("input", tippt);
  const tipptUhr = setInterval(() => {
    if (!eingabe.isConnected) {
      clearInterval(tipptUhr);
      ausG();
      return;
    }
    if (eingabe.value.trim()) tippt();
    lageZeigen();
  }, 150);

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const roh = eingabe.value.trim();
    if (!roh) return;
    const t = funkGlaetten(roh);
    eingabe.value = "";
    void sim
      .call("funkLeo", t, meineGruppe(), false)
      .then((id) => {
        const g = sim.state.funkGespraeche?.find((x) => x.id === id);
        if (g?.einsatzId) deps.select(g.einsatzId);
        refresh();
      })
      .catch((e) => {
        if (!eingabe.value) eingabe.value = roh;
        toast(String((e as Error).message ?? e), "error");
      });
  });

  /** von außen: Fahrzeug anfunken (Kontextmenü) */
  function rufen(fzId: string): void {
    void sim
      .call("funkRufen", fzId)
      .then(() => {
        refresh();
        eingabe.focus();
      })
      .catch((e) => toast(String((e as Error).message ?? e), "error"));
  }

  /** Oben: nur wer gerade spricht (bzw. dass ich warte) */
  function lageZeigen(): void {
    const ich = funkSendeZustand();
    const hoert = funkEmpfang();
    const sendet = sim.state.funkSendet;
    const jetzt = Date.now();
    const sichtbar = (g: FunkGespraech) => nurKanal === undefined || (g.kanal ?? null) === nurKanal;
    let sprecher = "";
    if (hoert) sprecher = hoert.von === "LEO" ? `LEO (${hoert.wer})` : hoert.von;
    else if (sendet && sendet.pid !== (sim.ich?.pid ?? mp.ich.pid)) sprecher = sendet.von === "LEO" ? `LEO (${sendet.name})` : sendet.von;
    else {
      const ki = (sim.state.funkGespraeche ?? []).find((g) => g.status !== "ende" && sichtbar(g) && (g.ausstehend || (g.sprichtBis ?? 0) > jetzt));
      if (ki) sprecher = ki.ausstehend?.von ?? [...ki.sprueche].reverse().find((s) => s.von !== "LEO")?.von ?? ki.funkname;
    }
    let html = "";
    let klasse = "";
    if (ich?.art === "sendet") {
      // Pegel: sieht man, ob das Mikrofon ankommt
      const p = Math.min(100, Math.round(Math.sqrt(funkPegel()) * 260));
      html = `🎙 Du sprichst … <span class="funk-pegel"><span style="width:${p}%"></span></span>`;
      klasse = "ich";
    } else if (ich?.art === "wartet") {
      html = `⏳ Warten …${sprecher ? ` ${esc(sprecher)} spricht` : ""} – nach dem Ende-Ton bist du dran`;
      klasse = "wartet";
    } else if (sprecher) {
      html = `<span class="funk-lampe"></span> <b>${esc(sprecher)}</b>`;
      klasse = "spricht";
    }
    void klasse;
    void html;
    geraet.refresh();
    ptt.classList.toggle("an", ich?.art === "sendet");
    ptt.classList.toggle("wartet", ich?.art === "wartet");
  }

  function gruppenZeigen(): void {
    const w = funkGruppenWahl();
    const offen = sim.offeneGruppen();
    const key = JSON.stringify([w, offen, sim.funkgruppe().id]);
    if (gruppen.dataset.k === key) return;
    gruppen.dataset.k = key;
    gruppen.innerHTML = "";
    const chip = (name: string, k: "normal" | "gs" | "gs2") => {
      const stumm = !!w.stumm[k];
      const b = el("button", { class: `funk-gr${stumm ? " stumm" : ""}`, type: "button", title: stumm ? "Stumm – zum Hören klicken (Text bleibt sichtbar)" : "Zum Stummschalten klicken (Text bleibt sichtbar)" }, `${stumm ? "🔇" : "🔊"} ${name}`);
      b.addEventListener("click", () => funkGruppenSetzen({ stumm: { [k]: !stumm } }));
      gruppen.appendChild(b);
    };
    for (const g of offen) chip(g === null ? gruppenName(null) : `${gruppenName(g)} (Großeinsatz)`, g === null ? "normal" : g);
  }

  let letzterChat = "";
  function refresh(): void {
    gruppenZeigen();
    lageZeigen();
    const w = funkGruppenWahl();
    const alle = (sim.state.funkGespraeche ?? []).filter((g) => nurKanal === undefined || (g.kanal ?? null) === nurKanal);
    const zeilen = alle
      .flatMap((g) => g.sprueche.map((s, i) => ({ s, g, t: s.echt ?? (g.echtSeit ?? 0) + i })))
      .sort((a, b) => a.t - b.t)
      .slice(-160);
    const key = JSON.stringify([zeilen.length, zeilen[zeilen.length - 1]?.t, w.stumm, alle.map((g) => g.sprueche.length).join(",")]);
    if (key !== letzterChat) {
      letzterChat = key;
      const unten = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
      chat.innerHTML = zeilen.length
        ? zeilen
            .map(({ s, g }, i) => {
              // Spielzeit steht (Pause) oder springt: die Funksprüche laufen in echter Zeit – Sekunden seit dem ersten mit gleicher Spielzeit dazu
              const zeit = s.zeit + funkVersatz(zeilen, i);
              const stumm = w.stumm[g.kanal ?? "normal"] ? " stumm" : "";
              const gsTag = g.kanal ? `<span class="funk-tag gr-${g.kanal}">${gruppenName(g.kanal).slice(-2)}</span> ` : "";
              const leo = s.von === "LEO";
              return `<div class="funk-z ${leo ? "leo" : "fz"}${stumm}" data-g="${g.id}"><span class="muted">${uhr(zeit)}</span> ${gsTag}${s.stimme ? `<span title="gesprochen">🎙</span> ` : ""}<b>${esc(s.von)}:</b> ${esc(s.text)}${leo && s.wer && mp.aktiv ? ` <span class="prot-von">${esc(s.wer)}</span>` : ""}</div>`;
            })
            .join("")
        : `<div class="muted pad">Noch kein Funkverkehr. Fahrzeuge rufen „LEO“, wenn sie etwas melden. Selbst rufen: „75/001 von LEO, kommen“ – tippen oder ${esc(tastenName(sprachPrefs().funkTaste))} halten.</div>`;
      if (unten || zeilen.length < 12) chat.scrollTop = chat.scrollHeight;
    }
  }
  chat.addEventListener("click", (ev) => {
    const z = (ev.target as HTMLElement).closest<HTMLElement>(".funk-z");
    const g = z ? sim.state.funkGespraeche?.find((x) => x.id === Number(z.dataset.g)) : undefined;
    if (g?.einsatzId) deps.select(g.einsatzId);
  });

  refresh();
  return {
    refresh,
    rufen,
    // Badge: Fahrzeuge, die gerade rufen
    offen: () => (sim.state.funkGespraeche ?? []).filter((g) => (nurKanal === undefined || (g.kanal ?? null) === nurKanal) && (g.status === "ruft" || g.status === "mithoeren")).length,
  };
}
