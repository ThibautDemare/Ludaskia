/* ============================================================
   Utilitaires : aléatoire, déduplication, échappement, temps
   ============================================================ */
import type { Item } from './items';

/* Source d'aléa indirecte (#41). Par défaut `Math.random` ; `withSeed` la remplace
   temporairement par un PRNG DÉTERMINISTE. Sert au corrigé imprimable : la feuille et
   son corrigé doivent contenir EXACTEMENT les mêmes items, or le pipeline régénère à
   chaque appel — on rejoue donc la génération avec la même graine. INVARIANT : tout
   l'aléa de GÉNÉRATION (`rnd`/`choice`/`sample` ET les générateurs de leçons) doit
   passer par `randFloat()`, JAMAIS par `Math.random` direct, sinon le corrigé diverge
   de la feuille. */
let randomSource: () => number = Math.random;
/* Réel dans [0,1), équivalent de `Math.random` mais déroutable par `withSeed`. */
export const randFloat = (): number => randomSource();

/* PRNG déterministe (mulberry32) : rapide, sans dépendance, suffisant pour varier des
   exercices (pas un usage cryptographique). */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/* Graine aléatoire (tirée AVANT tout seed → varie d'une impression à l'autre). */
export const randomSeed = (): number => Math.floor(randFloat() * 0x100000000) >>> 0;

/* Exécute `fn` avec un RNG déterministe : deux appels de même graine produisent la
   MÊME suite de tirages. La source précédente est restaurée même si `fn` lève (et les
   appels imbriqués sont gérés : on restaure la source englobante, pas Math.random).
   USAGE SYNCHRONE uniquement — un tirage asynchrone après le retour ne serait pas seedé. */
export function withSeed<T>(seed: number, fn: () => T): T {
	const prev = randomSource;
	randomSource = mulberry32(seed);
	try {
		return fn();
	} finally {
		randomSource = prev;
	}
}

export const rnd = (min: number, max: number) => Math.floor(randFloat() * (max - min + 1)) + min;
export const choice = <T>(a: T[]): T => a[Math.floor(randFloat() * a.length)];
export function sample<T>(arr: T[], n: number): T[] {
	const c = [...arr];
	for (let i = c.length - 1; i > 0; i--) {
		const j = Math.floor(randFloat() * (i + 1));
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
/* Réordonnancement pur d'un tableau d'index (aucune mutation en place : renvoie
   toujours un NOUVEAU tableau, index bornés). Utilisés par les tuiles d'orthographe
   (ui/ortho-runner) où `assembled` — l'ordre des lettres posées — est la source de
   vérité (cf. #68), mais logique agnostique et testable sans DOM (#374). */
export function insertAt(arr: number[], pos: number, value: number): number[] {
	const p = Math.max(0, Math.min(arr.length, pos));
	return [...arr.slice(0, p), value, ...arr.slice(p)];
}
export function removeAt(arr: number[], pos: number): number[] {
	if (pos < 0 || pos >= arr.length) return arr.slice();
	return [...arr.slice(0, pos), ...arr.slice(pos + 1)];
}
export function moveAt(arr: number[], from: number, to: number): number[] {
	if (from < 0 || from >= arr.length) return arr.slice();
	return insertAt(removeAt(arr, from), to, arr[from]);
}

export const escapeHTML = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* Élision de la préposition « de » devant un mot à initiale vocalique : « d'images »,
   « d'arêtes », « d'œufs » — sinon « de billes », « de faces ». Classe = voyelles simples,
   accentuées et ligatures `œ`/`æ` ; PAS `y` (« de yaourts », `y` consonantique) ni `h`
   (ambigu : « d'homme » vs « de hibou ») — ces cas restent volontairement non élidés. Règle
   unique partagée par les fabriques de contenu (données, géométrie…) pour éviter les
   divergences. */
export const elisionDe = (mot: string) =>
	/^[aeiouàâäéèêëïîôöùûüœæ]/i.test(mot) ? `d'${mot}` : `de ${mot}`;

/* Normalisation d'une réponse TEXTE pour comparaison (conjugaison, orthographe…) :
   - trim des bords,
   - toute suite d'espaces internes réduite à une seule (une double espace entre
     l'auxiliaire et le verbe — « a  mangé » — ne doit pas être comptée fausse),
   - NFC (accents et apostrophes exigés).
   Ne concerne PAS la correction numérique (calcul). */
export const normalizeText = (s: string) => s.trim().replace(/\s+/g, ' ').normalize('NFC');

/* Début du jour LOCAL d'un horodatage (ms) — socle de tous les raisonnements en jours
   CALENDAIRES de l'app (« dernière fois travaillée », graphe d'activité, délai d'ici une
   révision, filtre de période des erreurs). Passe par `setHours` plutôt qu'un modulo de
   86400000 : les jours locaux ne durent pas tous 24 h (changement d'heure). Pur. */
export function startOfDay(ts = Date.now()): number {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/* Formatage mm:ss d'une durée en millisecondes */
export function fmt(ms: number) {
	const s = Math.floor(ms / 1000),
		m = Math.floor(s / 60),
		r = s % 60;
	return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
