/* ============================================================
   Séance partagée (#734) — SCHÉMAS : lire un JSON hostile, écrire un JSON de confiance.

   Un lien est une donnée NON FIABLE : n'importe qui peut en fabriquer un. Chaque
   valeur décodée est donc RECONSTRUITE champ par champ (critère 40) : on ne
   fusionne jamais l'objet décodé, on ne recopie jamais une clé qu'on n'a pas
   déclarée, et une clé inconnue fait refuser le lien plutôt que d'être ignorée en
   silence — c'est ce qui ferme `__proto__` et tout champ « en plus » (critère 31).

   Un schéma est BIDIRECTIONNEL :
   - `lire` part du JSON reçu et rend une valeur neuve, ou lève `RefusSchema` ;
   - `ecrire` part d'une valeur de l'application (de confiance) et rend sa forme JSON.
   Les deux sens ne diffèrent que pour les fragments de balisage (`SafeHtml`), qui
   voyagent sous forme de RECETTE et sont rebâtis à la lecture (cf. `fragments.ts`) :
   jamais de balisage dans un lien.

   `ecrire` est aussi STRICT que `lire`, et pour deux raisons distinctes :
   - une valeur hors schéma (libellé hors liste blanche, bloc trop long, borne
     dépassée) s'encoderait sans bruit puis serait refusée chez le destinataire, qui
     verrait un « lien altéré » sans que l'émetteur n'ait rien vu ;
   - un champ non déclaré disparaîtrait du lien en silence, et la séance jouée chez
     l'enfant différerait de celle composée par l'encadrant. Le gate d'aller-retour du
     catalogue (`tests/partage-gate.test.ts`) attrape ce cas avant une release.
   L'échec est donc chez l'émetteur, au moment où il peut encore corriger.
   ============================================================ */

/** Refus d'une valeur décodée. `chemin` situe la valeur fautive (« blocs[0].exercices[3].answer »),
 *  pour le diagnostic en test ; l'écran, lui, ne montre qu'un message générique. */
export class RefusSchema extends Error {
	constructor(
		readonly chemin: string,
		message: string,
	) {
		super(`${chemin || '(racine)'} : ${message}`);
		this.name = 'RefusSchema';
	}
}

export interface Schema<T> {
	lire(v: unknown, chemin: string): T;
	ecrire(v: T): unknown;
}

/** Schéma d'un champ FACULTATIF : `undefined` (champ absent) est une valeur admise. Porté
 *  par un type à part pour que `objet` exige `facultatif(…)` sur les champs optionnels du
 *  type, et le refuse sur les autres — l'oubli se voit au typecheck, pas en production. */
export interface SchemaFacultatif<T> extends Schema<T | undefined> {
	readonly facultatif: true;
}

export function refuser(chemin: string, message: string): never {
	throw new RefusSchema(chemin, message);
}

const sousChemin = (chemin: string, cle: string | number) =>
	typeof cle === 'number' ? `${chemin}[${cle}]` : chemin ? `${chemin}.${cle}` : cle;

/** Chemin des refus levés à l'écriture : la valeur vient de l'application, pas d'un lien. */
const ECRITURE = '(écriture)';

/** Schéma d'une valeur sans structure : sa forme JSON est elle-même, et l'écrire, c'est
 *  la valider avec les mêmes règles que la lire. */
export function valeurSimple<T>(lire: (v: unknown, chemin: string) => T): Schema<T> {
	return { lire, ecrire: (v) => lire(v, ECRITURE) };
}

/* ---------- Primitives ---------- */

export const booleen: Schema<boolean> = valeurSimple((v, chemin) =>
	typeof v === 'boolean' ? v : refuser(chemin, 'booléen attendu'),
);

/** Nombre FINI et BORNÉ. `1e999` écrit dans un JSON devient `Infinity` : refusé ici. */
export function nombre(min: number, max: number): Schema<number> {
	return valeurSimple((v, chemin) => {
		if (typeof v !== 'number' || !Number.isFinite(v)) refuser(chemin, 'nombre fini attendu');
		if (v < min || v > max) refuser(chemin, `nombre hors de [${min} ; ${max}]`);
		return v;
	});
}

export function entier(min: number, max: number): Schema<number> {
	const n = nombre(min, max);
	return valeurSimple((v, chemin) => {
		const x = n.lire(v, chemin);
		return Number.isInteger(x) ? x : refuser(chemin, 'entier attendu');
	});
}

/** Caractères refusés dans TOUT texte décodé, quelle que soit la liste blanche du champ :
 *  les contrôles C0/C1 (jamais légitimes dans un énoncé) et les forçages de sens
 *  bidirectionnel, qui permettraient d'afficher un texte dans un ordre trompeur.
 *  Les espaces insécables (U+00A0, U+202F, posée par `formatNombre`) restent admises. */
// eslint-disable-next-line no-control-regex -- les contrôles sont précisément ce qu'on traque
export const CARACTERES_INTERDITS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

export interface OptionsChaine {
	max: number;
	/** Longueur minimale (défaut 0). */
	min?: number;
	/** Liste blanche, appliquée à la chaîne ENTIÈRE (ancrer le motif). */
	motif?: RegExp;
}

export function chaine({ max, min = 0, motif }: OptionsChaine): Schema<string> {
	return valeurSimple((v, chemin) => {
		if (typeof v !== 'string') refuser(chemin, 'texte attendu');
		if (v.length < min || v.length > max) refuser(chemin, `longueur hors de [${min} ; ${max}]`);
		if (CARACTERES_INTERDITS.test(v)) refuser(chemin, 'caractère de contrôle');
		if (motif && !motif.test(v)) refuser(chemin, 'caractère hors liste blanche');
		return v;
	});
}

/** Une valeur parmi une liste FERMÉE (énumération). */
export function parmi<const T extends readonly (string | number | boolean)[]>(
	...valeurs: T
): Schema<T[number]> {
	return valeurSimple((v, chemin) => {
		if (!valeurs.includes(v as T[number])) refuser(chemin, 'valeur hors énumération');
		return v as T[number];
	});
}

/* ---------- Composés ---------- */

export function facultatif<T>(s: Schema<T>): SchemaFacultatif<T> {
	return {
		facultatif: true,
		lire: (v, chemin) => (v === undefined ? undefined : s.lire(v, chemin)),
		ecrire: (v) => (v === undefined ? undefined : s.ecrire(v)),
	};
}

export function liste<T>(
	s: Schema<T>,
	{ max, min = 0 }: { max: number; min?: number },
): Schema<T[]> {
	const taille = (v: unknown[], chemin: string) => {
		if (v.length < min || v.length > max) refuser(chemin, `taille hors de [${min} ; ${max}]`);
	};
	return {
		lire(v, chemin) {
			if (!Array.isArray(v)) refuser(chemin, 'liste attendue');
			taille(v, chemin);
			return v.map((x, i) => s.lire(x, sousChemin(chemin, i)));
		},
		ecrire(v) {
			taille(v, ECRITURE);
			return v.map((x) => s.ecrire(x));
		},
	};
}

type SchemasTuple<T extends readonly unknown[]> = { [I in keyof T]: Schema<T[I]> };

/** Liste de longueur FIXE, un schéma par position (`[number, number]`). */
export function tuple<T extends readonly unknown[]>(...schemas: SchemasTuple<T>): Schema<T> {
	return {
		lire(v, chemin) {
			if (!Array.isArray(v) || v.length !== schemas.length)
				refuser(chemin, `liste de ${schemas.length} éléments attendue`);
			return schemas.map((s, i) => s.lire(v[i], sousChemin(chemin, i))) as unknown as T;
		},
		ecrire(v) {
			if (v.length !== schemas.length)
				refuser(ECRITURE, `liste de ${schemas.length} éléments attendue`);
			return schemas.map((s, i) => s.ecrire(v[i]));
		},
	};
}

/** Un schéma par champ du type, SANS exception : un champ ajouté au type sans schéma
 *  casse le typecheck. Les champs optionnels exigent `facultatif(…)`. */
export type Champs<T> = {
	[K in keyof Required<T>]-?: undefined extends T[K]
		? SchemaFacultatif<Exclude<T[K], undefined>>
		: Schema<T[K]>;
};

const estFacultatif = (s: Schema<unknown>): boolean =>
	(s as Partial<SchemaFacultatif<unknown>>).facultatif === true;

const estObjetSimple = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Objet reconstruit champ par champ. `verifier` porte les invariants ENTRE champs (un
 *  index qui doit tomber dans une liste, une borne inférieure à l'autre) : ce qu'un
 *  runner suppose vrai et qui, faux, lèverait une erreur chez l'enfant (critère 29). */
export function objet<T extends object>(
	champs: Champs<T>,
	verifier?: (v: T, chemin: string) => void,
): Schema<T> {
	const declares = champs as Record<string, Schema<unknown>>;
	const cles = Object.keys(declares);
	return {
		lire(v, chemin) {
			if (!estObjetSimple(v)) refuser(chemin, 'objet attendu');
			for (const cle of Object.keys(v))
				if (!Object.hasOwn(declares, cle)) refuser(sousChemin(chemin, cle), 'champ inconnu');
			const sortie: Record<string, unknown> = {};
			for (const cle of cles) {
				const s = declares[cle];
				if (!Object.hasOwn(v, cle)) {
					if (estFacultatif(s)) continue;
					refuser(sousChemin(chemin, cle), 'champ manquant');
				}
				const lu = s.lire(v[cle], sousChemin(chemin, cle));
				if (lu !== undefined) sortie[cle] = lu;
			}
			const resultat = sortie as T;
			verifier?.(resultat, chemin);
			return resultat;
		},
		ecrire(v) {
			const source = v as Record<string, unknown>;
			for (const cle of Object.keys(source))
				if (source[cle] !== undefined && !Object.hasOwn(declares, cle))
					throw new Error(`partage : champ « ${cle} » sans schéma, il ne peut pas voyager`);
			const sortie: Record<string, unknown> = {};
			for (const cle of cles) {
				if (source[cle] === undefined) {
					if (estFacultatif(declares[cle])) continue;
					throw new Error(`partage : champ obligatoire « ${cle} » absent`);
				}
				sortie[cle] = declares[cle].ecrire(source[cle]);
			}
			verifier?.(v, ECRITURE);
			return sortie;
		},
	};
}

/** Union discriminée par un champ texte (`type`, `kind`, `k`, `nature`). La table des
 *  branches est typée sur les valeurs du discriminant : une branche oubliée ne compile pas. */
export function union<D extends string, T extends { [P in D]: string }>(
	discriminant: D,
	branches: { [K in T[D]]: Schema<Extract<T, { [P in D]: K }>> },
): Schema<T> {
	const table = branches as Record<string, Schema<T>>;
	return {
		lire(v, chemin) {
			if (!estObjetSimple(v)) refuser(chemin, 'objet attendu');
			const tag = v[discriminant];
			if (typeof tag !== 'string' || !Object.hasOwn(table, tag))
				refuser(sousChemin(chemin, discriminant), 'variante inconnue');
			return table[tag].lire(v, chemin);
		},
		ecrire(v) {
			const tag = v[discriminant];
			if (!Object.hasOwn(table, tag)) throw new Error(`partage : variante « ${tag} » sans schéma`);
			return table[tag].ecrire(v);
		},
	};
}

/** Schéma dont la forme JSON diffère de la valeur (un fragment rebâti depuis sa recette). */
export function transforme<T, J>(
	json: Schema<J>,
	versValeur: (j: J, chemin: string) => T,
	versJson: (v: T) => J,
): Schema<T> {
	return {
		lire: (v, chemin) => versValeur(json.lire(v, chemin), chemin),
		ecrire: (v) => json.ecrire(versJson(v)),
	};
}

/** Schéma défini plus loin (types récursifs : une recette `suite` contient des recettes). */
export function differe<T>(obtenir: () => Schema<T>): Schema<T> {
	return {
		lire: (v, chemin) => obtenir().lire(v, chemin),
		ecrire: (v) => obtenir().ecrire(v),
	};
}
