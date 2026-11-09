import { DCLogic } from "../../entwurf/dclogic";

export declare class FunkLogik extends DCLogic {
  verlaufRef: { current: HTMLElement | null };
  chatRef: { current: HTMLElement | null };
  eingabeRef: { current: HTMLInputElement | null };
  chatEingabeRef: { current: HTMLInputElement | null };
  zeige(txt: string): void;
}
