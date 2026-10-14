/** Gleichbleibende Rufnummer aus einer Kennung (der Anrufer „hat“ eine Nummer). */
export function nummerAus(id: string, mobil: boolean): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const s = String(h).padStart(10, "0");
  return mobil ? `0${["664", "676", "699", "650", "660"][h % 5]} ${s.slice(0, 3)} ${s.slice(3, 7)}` : `0${2700 + (h % 90)} ${s.slice(0, 3)} ${s.slice(3, 6)}`;
}
