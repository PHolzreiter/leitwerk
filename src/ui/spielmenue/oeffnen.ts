/**
 * Spielmenü von überall öffnen, ohne das ganze Menü zu laden (keine Import-Ringe):
 * index.ts meldet sich hier an; andere Teile (KH-Info, Kopfleiste, Pilotenansicht) rufen nur diese Funktionen.
 */
type Oeffner = {
  oeffnen(punkt?: string, seite?: string, extra?: Record<string, unknown>): void;
  einstellungen(seite?: string, extra?: Record<string, unknown>): void;
};
let o: Oeffner | null = null;

export function spielmenueAnmelden(x: Oeffner): void {
  o = x;
}

/** Spielmenü öffnen (optional gleich ein Punkt: „spielstand“, „einstellungen“, „multiplayer“, „faelle“) */
export function spielmenue(punkt?: string, seite?: string, extra?: Record<string, unknown>): void {
  o?.oeffnen(punkt, seite, extra);
}

/** Einstellungen im Spielmenü auf einer Seite öffnen (z. B. „khauf“ mit { s_kh_haus: id }) */
export function einstellungenSeite(seite?: string, extra?: Record<string, unknown>): void {
  o?.einstellungen(seite, extra);
}
