/** Jede Übersetzung hat genau die Schlüssel des deutschen Textes; Platzhalter als Funktionen mit denselben Werten. */
export type Uebersetzung<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : T[K] extends (...a: infer A) => infer R ? (...a: A) => R : Uebersetzung<T[K]>;
};
