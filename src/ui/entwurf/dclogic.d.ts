/** Basis für die Logik aus den Entwürfen (reines JavaScript, siehe dclogic.js) */
export declare class DCLogic {
  constructor(props?: Record<string, unknown>);
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  _zeichnen?: () => void;
  setState(p: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>)): void;
  forceUpdate(): void;
  componentDidMount(): void;
  componentWillUnmount(): void;
  renderVals(): Record<string, unknown>;
}
