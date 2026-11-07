/** Hauptmenü-Logik (aus dem Design übernommen, reines JavaScript) */
export declare class Komponente {
  constructor(app: unknown, props?: Record<string, unknown>);
  state: Record<string, unknown>;
  props: Record<string, unknown>;
  _zeichnen?: () => void;
  setState(p: Record<string, unknown>): void;
  renderVals(): Record<string, unknown>;
  componentDidMount(): void;
  componentWillUnmount(): void;
}
