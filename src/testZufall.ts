// Nur für automatische Tests (…/?debug&seed=123): fester Zufall, damit Tests nicht zufällig scheitern.
// Muss als erstes Modul geladen werden (erste Zeile in main.ts), damit auch Zufall beim Laden fest ist.
if (typeof location !== "undefined" && /[?&]debug\b/.test(location.search)) {
  const m = location.search.match(/[?&]seed=(\d+)/);
  if (m) {
    let a = Number(m[1]) >>> 0;
    (globalThis as { __lwSeed?: number }).__lwSeed = a;
    // mulberry32
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
export {};
