// Basis für die Logik aus den Entwürfen (dort „class Component extends DCLogic“).
// setState wie im Entwurf: Zustand mischen, dann einmal (gebündelt) neu zeichnen.
/* eslint-disable */
export class DCLogic {
  constructor(props) {
    this.props = props || {};
    this.state = {};
    this._plan = false;
  }
  setState(p) {
    const neu = typeof p === 'function' ? p(this.state) : p;
    this.state = Object.assign({}, this.state, neu);
    if (this._plan) return;
    this._plan = true;
    Promise.resolve().then(() => { this._plan = false; if (this._zeichnen) this._zeichnen(); });
  }
  forceUpdate() { this.setState({}); }
  componentDidMount() {}
  componentWillUnmount() {}
  renderVals() { return {}; }
}
