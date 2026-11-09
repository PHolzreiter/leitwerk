/** Fahrzeugliste der Masken (siehe vliste.js) */
export interface VlEintrag {
  trenner?: boolean;
  trennText?: string;
  id?: string;
  status?: string;
  ruf?: string;
  typ?: string;
  crew?: string[];
  von?: string;
  nach?: string;
  codes?: { c: string; text: string }[];
  fahrt?: string;
  los?: string;
  losCls?: string;
  hinweis?: string;
  cls?: string;
  titel?: string;
  klick?: () => void;
}
export declare function breitenLaden(name: string): Record<string, number[]>;
export declare function vliste(
  k: { state: Record<string, unknown>; setState(p: Record<string, unknown>): void },
  eintraege: VlEintrag[],
  o: { zeitTitel: string; zeitPx: number; swExtra?: number; name: string },
): Record<string, unknown>;
export declare function knopfText(liste: { ruf: string }[], verb: string, mehrVerb?: string): string | null;
