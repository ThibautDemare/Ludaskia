/* ============================================================
   Utilitaires : aléatoire, déduplication, échappement, temps
   ============================================================ */
import type { Item } from './items';

export const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const choice = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
export function sample<T>(arr: T[], n: number): T[] {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, n);
}
export const commKey = (op: string) => {
  const m = op.match(/(\d+)\s*([+×])\s*(\d+)/);
  if (m) {
    const a = +m[1],
      s = m[2],
      b = +m[3];
    return `${s}${Math.min(a, b)}-${Math.max(a, b)}`;
  }
  return op;
};
export function uniqueComm(gen: () => Item, n: number, mt = 10000): Item[] {
  const k: string[] = [],
    o: Item[] = [];
  let t = 0;
  while (o.length < n && t < mt) {
    const it = gen();
    const key = commKey(it.text);
    if (!k.includes(key)) {
      k.push(key);
      o.push(it);
    }
    t++;
  }
  return o;
}
export function uniqueExact(gen: () => Item, n: number, mt = 10000): Item[] {
  const k: string[] = [],
    o: Item[] = [];
  let t = 0;
  while (o.length < n && t < mt) {
    const it = gen();
    if (!k.includes(it.text)) {
      k.push(it.text);
      o.push(it);
    }
    t++;
  }
  return o;
}
export const escapeHTML = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* Normalisation d'une réponse TEXTE pour comparaison (conjugaison, orthographe…) :
   - trim des bords,
   - toute suite d'espaces internes réduite à une seule (une double espace entre
     l'auxiliaire et le verbe — « a  mangé » — ne doit pas être comptée fausse),
   - NFC (accents et apostrophes exigés).
   Ne concerne PAS la correction numérique (calcul). */
export const normalizeText = (s: string) => s.trim().replace(/\s+/g, ' ').normalize('NFC');

/* Formatage mm:ss d'une durée en millisecondes */
export function fmt(ms: number) {
  const s = Math.floor(ms / 1000),
    m = Math.floor(s / 60),
    r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
