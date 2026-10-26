/**
 * Sprache für den Sprechfunk: 8 kHz, μ-law (G.711) – die Klangqualität von Funk und Telefon,
 * läuft überall ohne Zusatzbibliothek. 100 ms Sprache = 800 Byte (als Text ca. 1,1 kB).
 */

export const FUNK_RATE = 8000;
/** Länge eines Stücks in Samples (100 ms) */
export const FUNK_STUECK = 800;

// ------------------------------------------------------------ μ-law

const BIAS = 0x84;
const CLIP = 32635;

function ulawByte(sample: number): number {
  let s = Math.max(-1, Math.min(1, sample)) * 32767;
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  s = Math.min(CLIP, s) + BIAS;
  let exp = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exp > 0; mask >>= 1) exp--;
  const mant = (s >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mant) & 0xff;
}

const ULAW_DEKODIERT = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const u = ~i & 0xff;
    const sign = u & 0x80;
    const exp = (u >> 4) & 0x07;
    const mant = u & 0x0f;
    let s = ((mant << 3) + BIAS) << exp;
    s -= BIAS;
    t[i] = (sign ? -s : s) / 32768;
  }
  return t;
})();

// ------------------------------------------------------------ Base64

function nachBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x2000) s += String.fromCharCode(...b.subarray(i, i + 0x2000));
  return btoa(s);
}

function ausBase64(t: string): Uint8Array {
  const s = atob(t);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

/** Stück (Base64, μ-law) → Samples (8 kHz, −1…1) */
export function funkDekodieren(b64: string): Float32Array<ArrayBuffer> {
  const b = ausBase64(b64);
  const out = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = ULAW_DEKODIERT[b[i]];
  return out;
}

/**
 * Mikrofon (beliebige Abtastrate) → Stücke à 100 ms (8 kHz, μ-law, Base64).
 * Vor dem Ausdünnen wird gemittelt (einfacher Tiefpass), damit nichts klirrt.
 */
export class FunkKodierer {
  private schritt: number;
  private pos = 0;
  private rest: number[] = [];
  private puffer = new Uint8Array(FUNK_STUECK);
  private n = 0;

  constructor(
    rate: number,
    private stueck: (b64: string) => void,
  ) {
    this.schritt = rate / FUNK_RATE;
  }

  /** Samples vom Mikrofon hinzufügen; fertige Stücke gehen an stueck() */
  daten(d: Float32Array): void {
    const alle = this.rest.length ? Float32Array.from([...this.rest, ...d]) : d;
    const halb = Math.max(0.5, this.schritt / 2);
    let p = this.pos;
    while (p + halb < alle.length) {
      const a = Math.max(0, Math.floor(p - halb + 0.5));
      const b = Math.min(alle.length, Math.ceil(p + halb));
      let s = 0;
      for (let i = a; i < b; i++) s += alle[i];
      this.puffer[this.n++] = ulawByte(s / Math.max(1, b - a));
      if (this.n === FUNK_STUECK) {
        this.stueck(nachBase64(this.puffer));
        this.n = 0;
      }
      p += this.schritt;
    }
    // was noch fehlt, fürs nächste Mal aufheben
    const ab = Math.max(0, Math.floor(p - halb));
    this.rest = Array.from(alle.subarray(ab));
    this.pos = p - ab;
  }

  /** angefangenes Stück noch schicken */
  ende(): void {
    if (this.n > 0) this.stueck(nachBase64(this.puffer.subarray(0, this.n)));
    this.n = 0;
    this.rest = [];
    this.pos = 0;
  }
}
