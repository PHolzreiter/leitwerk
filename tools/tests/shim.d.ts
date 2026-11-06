declare module "*?raw" { const s: string; export default s; }
declare module "*.css";

declare module "*?url" { const u: string; export default u; }

// Testbuild-Ersatz für Pakete, die hier nicht installiert werden können (CI hat die echten)
declare module "qrcode-generator" {
  const qrcode: (typ: number, fehler: string) => { addData(s: string): void; make(): void; createSvgTag(o?: unknown): string; createDataURL(z?: number, r?: number): string; getModuleCount(): number; isDark(r: number, c: number): boolean };
  export default qrcode;
}
declare module "@tauri-apps/plugin-global-shortcut" {
  export function register(k: string | string[], h: (ev: { shortcut: string; state: string }) => void): Promise<void>;
  export function unregister(k: string | string[]): Promise<void>;
  export function unregisterAll(): Promise<void>;
  export function isRegistered(k: string): Promise<boolean>;
}
