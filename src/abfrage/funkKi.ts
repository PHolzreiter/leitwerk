/**
 * Freie Fragen der Leitstelle am Funk: die Besatzung antwortet mit der KI (Ollama)
 * oder, ohne KI, mit einem einfachen „verstanden“. Läuft beim Funk-Gesprächsführer.
 */
import { sim, type FunkGespraech } from "../sim/engine";
import { patientText } from "../sim/lage";
import { inTauri } from "../platform";
import { kiBereit, kiChat, kiPrefs, kiStatus, type KiNachricht } from "./ki";

const laufend = new Set<number>();

function lageWissen(g: FunkGespraech): string {
  const fz = sim.state.fahrzeuge[g.fzId];
  const e = g.einsatzId ? sim.einsatz(g.einsatzId) : undefined;
  if (!fz) return "";
  const teile = [`Ihr seid ${fz.funkrufname} (${fz.rmTyp}), Status: ${sim.statusDef(fz.status).name}.`];
  if (e) {
    teile.push(`Euer Einsatz: ${e.nummer}, Einsatzort ${e.adresse?.label ?? "unbekannt"}.`);
    const vorOrt = ["vorOrt", "warteKH", "transport", "uebergabe", "rendezvous", "treffpunkt"].includes(fz.phase);
    const l = e.wahr.lage;
    if (vorOrt && l) teile.push(`Was ihr vor Ort seht: ${l.patienten.map((p) => patientText(p)).join("; ")}.`);
    else teile.push("Ihr seid noch nicht beim Patienten und wisst nur, was die Leitstelle durchgegeben hat.");
    if (e.rendezvous && e.rendezvous.status !== "fertig") teile.push(`Rendezvous mit dem NEF: Treffpunkt ${e.rendezvous.punkt.label}.`);
    if (fz.phaseEnde && (fz.phase === "anfahrt" || fz.phase === "transport" || fz.phase === "rendezvous")) {
      teile.push(`Ankunft in ca. ${Math.max(1, Math.round((fz.phaseEnde - sim.state.zeit) / 60000))} Minuten.`);
    }
  } else teile.push("Ihr habt gerade keinen Einsatz.");
  return teile.join(" ");
}

function rueckfall(g: FunkGespraech): string {
  return `Hier ${g.funkname}, verstanden, kommen`;
}

/** Antwort der Besatzung erzeugen und senden (nur einmal je Gespräch gleichzeitig) */
export async function funkKiAntwort(g: FunkGespraech): Promise<void> {
  if (laufend.has(g.id) || !g.wartetAufKi) return;
  laufend.add(g.id);
  try {
    if (!kiBereit() && inTauri() && kiPrefs().aktiv) await kiStatus().catch(() => null);
    let text = rueckfall(g);
    if (kiBereit()) {
      const verlauf: KiNachricht[] = [
        {
          role: "system",
          content: [
            `Du spielst in einer Trainingssimulation die Besatzung des Rettungsdienst-Fahrzeugs ${g.funkname} in Niederösterreich am Funk. Die Leitstelle heißt am Funk „LEO“.`,
            lageWissen(g),
            `Funkregeln: Jede Antwort beginnt mit „Hier ${g.funkname},“ und endet mit „kommen“. Kurz, sachlich, Fachsprache des Rettungsdienstes, ein Satz. Keine Regieanweisungen.`,
            `Erfinde keine neuen Patienten oder Zustände; was ihr nicht wisst, sagt ihr („noch nicht beurteilbar“).`,
          ].join("\n"),
        },
      ];
      for (const s of g.sprueche) verlauf.push({ role: s.von === "LEO" ? "user" : "assistant", content: s.text });
      try {
        const k = await kiChat(verlauf);
        if (k) text = /^hier /i.test(k) ? k : `Hier ${g.funkname}, ${k}`;
      } catch (err) {
        console.warn("Funk-KI", err);
      }
    } else {
      await new Promise((r) => setTimeout(r, 800));
    }
    await sim.call("funkFzAntwort", g.id, text);
  } finally {
    laufend.delete(g.id);
  }
}
