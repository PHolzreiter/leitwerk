/** Spielmenü-Logik (aus dem Entwurf übernommen, reines JavaScript) */
export declare class SpielmenueKomponente {
  constructor(app: unknown, props?: Record<string, unknown>);
  state: Record<string, unknown>;
  props: Record<string, unknown>;
  _zeichnen?: () => void;
  setState(p: Record<string, unknown>): void;
  renderVals(): Record<string, unknown>;
  componentDidMount(): void;
  componentWillUnmount(): void;
  oeffne(punkt: string, seite?: string, extra?: Record<string, unknown>): void;
  escTaste(e: KeyboardEvent): void;
}
