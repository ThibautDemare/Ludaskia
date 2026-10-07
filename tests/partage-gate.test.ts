import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAllLessons } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { modesPourNiveau } from '../src/core/exercise';
import type { Exercise, ExerciseMode } from '../src/core/exercise';
import { withSeed } from '../src/core/utils';
import { SCHEMAS_EXERCICE } from '../src/core/partage/exercices';
import { SCHEMAS_FIGURE } from '../src/core/partage/figures';
import { tirerExercices } from '../src/core/partage/tirage';
import { encoderEnvoi, decoderEnvoi } from '../src/core/partage/envoi';
import type { BlocEnvoi, Envoi, MotDictee } from '../src/core/partage/envoi';
import type { Decodage } from '../src/core/partage/codec';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';

/* ============================================================
   Gate de la SÉANCE PARTAGÉE PAR LIEN (#734).

   Deux familles de garde-fous :

   1. Critère 35 — tout format de l'union `Exercise` et toute figure de l'union
      `FigureSpec` a son schéma de lien. Le TYPAGE de `SchemasExercice` /
      `SchemasFigure` casse déjà `npm run typecheck` ; ce fichier tient la moitié
      `npm test`, en relisant les unions dans le SOURCE (comme
      `tests/journal-couverture.test.ts`). Il survit donc à un `as`, à un
      `Partial<>` ou à un `// @ts-expect-error` posé sur la table, et il dit quoi
      faire. Les clés doivent être EXACTEMENT celles de l'union : ni manquante (un
      format qui ne voyage pas), ni en trop (un schéma mort qui rassure à tort).

   2. Aller-retour de TOUT le catalogue (garde-fou des critères 2, 3 et 36 : les
      items tirés voyagent tels quels, et chaque format partageable survit au
      lien). Pour chaque leçon × niveau × mode proposable, trois tirages graines
      fixes ; l'envoi encodé puis décodé doit revenir identique. Même chose pour
      les dictées prédéfinies, une cible de verbe conjugué et un bilan complet.

   Égalité : on compare `JSON.parse(JSON.stringify(x))` des deux côtés (un
   `SafeHtml` se sérialise en `{__html: …}`, un champ `undefined` disparaît).
   L'attendu est figé AVANT l'encodage, pour qu'un encodeur qui muterait son
   entrée ne rende pas la comparaison vide de sens.

   Les échecs sont COLLECTÉS, puis signalés en une seule assertion : le rapport
   sert de liste de travail (une ligne par combinaison, premier échec seulement).
   ============================================================ */

const SOURCE_EXERCISE = 'src/core/exercise.ts';
const SOURCE_FIGURES = 'src/core/figures/index.ts';
const TABLE_EXERCICES = 'src/core/partage/exercices.ts';
const TABLE_FIGURES = 'src/core/partage/figures.ts';

const ID_ENVOI = 'AAAAAAAAAAAA';
const LIBELLE = 'Gate';
const N_EXERCICES = 8;
/** Graines des tirages par combinaison : un échec se rejoue à l'identique. */
const GRAINES = [1, 2, 3];

/* ---------- Lecture des unions dans le source ---------- */

/** Formats déclarés par l'union `Exercise`, lus dans le SOURCE. Même lecteur que
 *  `tests/journal-couverture.test.ts` (reproduit, pas importé) : de
 *  `export type Exercise =` au premier paragraphe vide qui suit. */
function typesDeExercise(source: string): string[] {
	const debut = source.indexOf('export type Exercise =');
	if (debut < 0) throw new Error(`union Exercise introuvable dans ${SOURCE_EXERCISE}`);
	const fin = source.indexOf('\n\n', source.indexOf('type: ', debut));
	const union = source.slice(debut, fin > debut ? fin : undefined);
	return [...new Set([...union.matchAll(/\btype:\s*'([A-Za-z]+)'/g)].map((m) => m[1]))];
}

/** Figures déclarées par l'union `FigureSpec`, lues dans le SOURCE : de
 *  `export type FigureSpec =` au `;` qui la ferme, c'est-à-dire le premier `;` hors de
 *  toute accolade, crochet ou parenthèse (les membres en contiennent : `{ kind: …; … }`).
 *  Les commentaires sont retirés avant le comptage, pour qu'un `;` ou une accolade
 *  dans une JSDoc de membre ne coupe pas l'union en deux. */
function kindsDeFigureSpec(source: string): string[] {
	const entete = 'export type FigureSpec =';
	const debut = source.indexOf(entete);
	if (debut < 0) throw new Error(`union FigureSpec introuvable dans ${SOURCE_FIGURES}`);
	const suite = source
		.slice(debut + entete.length)
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
	let profondeur = 0;
	let fin = -1;
	for (let i = 0; i < suite.length; i++) {
		const c = suite[i];
		if (c === '{' || c === '[' || c === '(') profondeur++;
		else if (c === '}' || c === ']' || c === ')') profondeur--;
		else if (c === ';' && profondeur === 0) {
			fin = i;
			break;
		}
	}
	if (fin < 0) throw new Error(`fin de l'union FigureSpec introuvable dans ${SOURCE_FIGURES}`);
	const union = suite.slice(0, fin);
	return [...new Set([...union.matchAll(/\bkind:\s*'([A-Za-z]+)'/g)].map((m) => m[1]))];
}

function ecartCles(
	declares: readonly string[],
	cles: readonly string[],
): { manquants: string[]; enTrop: string[] } {
	return {
		manquants: declares.filter((d) => !cles.includes(d)).sort(),
		enTrop: cles.filter((c) => !declares.includes(c)).sort(),
	};
}

/** Insère un membre fantôme juste après l'en-tête d'une union, comme le ferait un
 *  développeur qui ajoute un format. */
function avecMembreFantome(source: string, entete: string, membre: string): string {
	const i = source.indexOf(entete);
	if (i < 0) throw new Error(`en-tête « ${entete} » introuvable`);
	const j = i + entete.length;
	return `${source.slice(0, j)}\n\t${membre}${source.slice(j)}`;
}

/* ---------- Aller-retour ---------- */

function enJson(x: unknown): unknown {
	return JSON.parse(JSON.stringify(x));
}

function estObjet(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function apercu(x: unknown): string {
	const s = JSON.stringify(x) ?? String(x);
	return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

/** Premier écart entre deux valeurs JSON, sous forme de chemin lisible. */
function premierEcart(attendu: unknown, recu: unknown, chemin: string): string | null {
	if (Array.isArray(attendu) && Array.isArray(recu)) {
		if (attendu.length !== recu.length)
			return `${chemin}.length : ${attendu.length} attendu, ${recu.length} reçu`;
		for (let i = 0; i < attendu.length; i++) {
			const e = premierEcart(attendu[i], recu[i], `${chemin}[${i}]`);
			if (e) return e;
		}
		return null;
	}
	if (estObjet(attendu) && estObjet(recu)) {
		const cles = [...new Set([...Object.keys(attendu), ...Object.keys(recu)])].sort();
		for (const k of cles) {
			if (!(k in recu)) return `${chemin}.${k} perdu au décodage (valait ${apercu(attendu[k])})`;
			if (!(k in attendu)) return `${chemin}.${k} apparu au décodage (${apercu(recu[k])})`;
			const e = premierEcart(attendu[k], recu[k], `${chemin}.${k}`);
			if (e) return e;
		}
		return null;
	}
	if (Object.is(attendu, recu)) return null;
	return `${chemin} : ${apercu(attendu)} attendu, ${apercu(recu)} reçu`;
}

function messageDe(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** Encode puis décode un envoi ; rend `null` s'il revient identique, sinon la cause. */
async function verifierAllerRetour(envoi: Envoi): Promise<string | null> {
	const attendu = enJson(envoi);
	let code: string;
	try {
		code = await encoderEnvoi(envoi);
	} catch (e) {
		return `encoderEnvoi lève : ${messageDe(e)}`;
	}
	let decodage: Decodage<Envoi>;
	try {
		decodage = await decoderEnvoi(code);
	} catch (e) {
		return `decoderEnvoi lève (un refus doit être une valeur, jamais une exception) : ${messageDe(e)}`;
	}
	if (!decodage.ok) return `decoderEnvoi refuse son propre code (raison « ${decodage.raison} »)`;
	const ecart = premierEcart(attendu, enJson(decodage.valeur), 'envoi');
	return ecart ? `l'envoi décodé diffère de l'envoi encodé : ${ecart}` : null;
}

function bloc(lecon: string, mode: ExerciseMode | undefined, exercices: Exercise[]): BlocEnvoi {
	return { lecon, ...(mode ? { mode } : {}), exercices };
}

/** Un tirage d'une combinaison, emballé dans un envoi `lecon` ; `null` si tout tient. */
async function allerRetourLecon(
	lesson: LessonDef,
	niveau: SchoolLevel,
	mode: ExerciseMode | undefined,
	graine: number,
): Promise<string | null> {
	let exercices: Exercise[];
	try {
		exercices = withSeed(graine, () => tirerExercices(lesson, N_EXERCICES, niveau, mode));
	} catch (e) {
		return `tirerExercices lève : ${messageDe(e)}`;
	}
	if (exercices.length === 0) return 'tirerExercices ne rend aucun exercice';
	if (exercices.length > N_EXERCICES)
		return `tirerExercices rend ${exercices.length} exercices pour n = ${N_EXERCICES}`;
	const formats = [...new Set(exercices.map((x) => x.type))].join(', ');
	const envoi: Envoi = {
		id: ID_ENVOI,
		libelle: LIBELLE,
		nature: 'lecon',
		niveau,
		blocs: [bloc(lesson.id, mode, exercices)],
	};
	const echec = await verifierAllerRetour(envoi);
	return echec ? `[formats : ${formats}] ${echec}` : null;
}

/** Modes à éprouver pour une leçon à un niveau : les modes proposables, ou « pas de
 *  mode » (`undefined`) pour une leçon qui n'en déclare aucun. */
function modesAEprouver(lesson: LessonDef, niveau: SchoolLevel): (ExerciseMode | undefined)[] {
	const modes = modesPourNiveau(lesson.exerciseType, niveau).map((m) => m.id);
	return modes.length > 0 ? modes : [undefined];
}

/* ============================================================
   Critère 35 — un schéma de lien par format
   ============================================================ */

describe('Critère 35 : chaque format d’exercice a son schéma de lien', () => {
	it('les clés de SCHEMAS_EXERCICE sont exactement les `type` de l’union Exercise', () => {
		const declares = typesDeExercise(readFileSync(SOURCE_EXERCISE, 'utf8'));
		expect(declares.length, `aucun format lu dans ${SOURCE_EXERCISE}`).toBeGreaterThan(0);
		const { manquants, enTrop } = ecartCles(declares, Object.keys(SCHEMAS_EXERCICE));
		expect(
			manquants,
			`Format(s) de l'union Exercise sans schéma de lien : ${manquants.join(', ')}. ` +
				`Déclarer le schéma dans ${TABLE_EXERCICES} (SCHEMAS_EXERCICE) : sans lui, ` +
				`un exercice de ce format ne peut pas voyager dans une séance partagée.`,
		).toEqual([]);
		expect(
			enTrop,
			`Schéma(s) de lien pour un format absent de l'union Exercise : ${enTrop.join(', ')}. ` +
				`Retirer l'entrée de SCHEMAS_EXERCICE dans ${TABLE_EXERCICES} (format renommé ou supprimé ?).`,
		).toEqual([]);
	});

	it('le lecteur du source verrait un format ajouté à l’union Exercise (garde du gate)', () => {
		const source = readFileSync(SOURCE_EXERCISE, 'utf8');
		const mute = avecMembreFantome(
			source,
			'export type Exercise =',
			"| { type: 'formatFantome'; prompt: string }",
		);
		const { manquants } = ecartCles(typesDeExercise(mute), Object.keys(SCHEMAS_EXERCICE));
		expect(manquants).toEqual(['formatFantome']);
	});
});

describe('Critère 35 : chaque figure a son schéma de lien', () => {
	it('les clés de SCHEMAS_FIGURE sont exactement les `kind` de l’union FigureSpec', () => {
		const declares = kindsDeFigureSpec(readFileSync(SOURCE_FIGURES, 'utf8'));
		expect(declares.length, `aucune figure lue dans ${SOURCE_FIGURES}`).toBeGreaterThan(0);
		const { manquants, enTrop } = ecartCles(declares, Object.keys(SCHEMAS_FIGURE));
		expect(
			manquants,
			`Figure(s) de l'union FigureSpec sans schéma de lien : ${manquants.join(', ')}. ` +
				`Déclarer le schéma dans ${TABLE_FIGURES} (SCHEMAS_FIGURE), paramètres finis ET ` +
				`bornés (critère 40) : sans lui, un exercice qui porte cette figure ne voyage pas.`,
		).toEqual([]);
		expect(
			enTrop,
			`Schéma(s) de lien pour une figure absente de l'union FigureSpec : ${enTrop.join(', ')}. ` +
				`Retirer l'entrée de SCHEMAS_FIGURE dans ${TABLE_FIGURES} (figure renommée ou supprimée ?).`,
		).toEqual([]);
	});

	it('le lecteur du source verrait une figure ajoutée, même précédée d’une JSDoc à « ; » et accolade', () => {
		const source = readFileSync(SOURCE_FIGURES, 'utf8');
		const mute = avecMembreFantome(
			source,
			'export type FigureSpec =',
			"/** Fantôme ; avec { une accolade. */\n\t| { kind: 'figureFantome'; cote: number }",
		);
		const { manquants } = ecartCles(kindsDeFigureSpec(mute), Object.keys(SCHEMAS_FIGURE));
		expect(manquants).toEqual(['figureFantome']);
	});
});

/* ============================================================
   Aller-retour — critères 2, 3 et 36
   ============================================================ */

describe('Aller-retour du lien : tout le catalogue survit à l’encodage', () => {
	it('chaque leçon × niveau × mode proposable : tirage non vide, envoi décodé identique', async () => {
		const echecs: string[] = [];
		let combinaisons = 0;
		for (const lesson of getAllLessons()) {
			for (const niveau of lesson.levels) {
				for (const mode of modesAEprouver(lesson, niveau)) {
					combinaisons++;
					for (const graine of GRAINES) {
						const echec = await allerRetourLecon(lesson, niveau, mode, graine);
						if (echec) {
							echecs.push(
								`${lesson.id} @${niveau} [${mode ?? 'sans mode'}] graine ${graine} : ${echec}`,
							);
							break;
						}
					}
				}
			}
		}
		expect(combinaisons, 'catalogue vide : rien n’a été éprouvé').toBeGreaterThan(0);
		expect(
			echecs.length,
			`${echecs.length} combinaison(s) leçon × niveau × mode sur ${combinaisons} ne survivent ` +
				`pas au lien (premier échec par combinaison, ${GRAINES.length} tirages chacune). ` +
				`Tirage : src/core/partage/tirage.ts ; schéma du format : ${TABLE_EXERCICES} ` +
				`(ou ${TABLE_FIGURES} pour une figure).\n` +
				echecs.join('\n'),
		).toBe(0);
	}, 180_000);
});

describe('Aller-retour du lien : dictées', () => {
	it('chaque dictée prédéfinie revient identique, phrases d’exemple comprises', async () => {
		expect(ORTHO_PREDEF.length).toBeGreaterThan(0);
		const echecs: string[] = [];
		for (const l of ORTHO_PREDEF) {
			const mots: MotDictee[] = l.mots.map((m) => ({
				mot: m.mot,
				...(m.commeDans ? { commeDans: m.commeDans } : {}),
			}));
			const envoi: Envoi = {
				id: ID_ENVOI,
				libelle: LIBELLE,
				nature: 'dictee',
				niveau: l.niveau,
				mots,
			};
			const echec = await verifierAllerRetour(envoi);
			if (echec) echecs.push(`${l.id} : ${echec}`);
		}
		expect(
			echecs.length,
			`${echecs.length} dictée(s) prédéfinie(s) sur ${ORTHO_PREDEF.length} ne survivent pas ` +
				`au lien (schéma du format dictee dans ${TABLE_EXERCICES}) :\n` +
				echecs.join('\n'),
		).toBe(0);
	});

	it('une cible de verbe conjugué (liste personnalisée, sans niveau) garde sa phrase à trou, espace initial compris', async () => {
		const envoi: Envoi = {
			id: ID_ENVOI,
			libelle: LIBELLE,
			nature: 'dictee',
			mots: [{ mot: 'mangeons', contexte: { avant: 'nous', apres: ' une pomme' } }],
		};
		expect(await verifierAllerRetour(envoi)).toBeNull();
	});
});

describe('Aller-retour du lien : bilan', () => {
	/** Trois leçons de catégories distinctes au niveau donné, dont au moins deux
	 *  matières : la première leçon du catalogue, la première d'une autre matière,
	 *  puis la première d'une troisième catégorie. */
	function troisLeconsDeCategoriesDistinctes(niveau: SchoolLevel): LessonDef[] {
		const premiereParCategorie = new Map<string, LessonDef>();
		for (const l of getAllLessons()) {
			if (l.levels.includes(niveau) && !premiereParCategorie.has(l.category))
				premiereParCategorie.set(l.category, l);
		}
		const candidates = [...premiereParCategorie.values()];
		const choisies: LessonDef[] = [];
		const a = candidates[0];
		if (a) choisies.push(a);
		const b = candidates.find((l) => a && l.subject !== a.subject);
		if (b) choisies.push(b);
		const c = candidates.find((l) => !choisies.includes(l));
		if (c) choisies.push(c);
		return choisies;
	}

	it('un bilan complet de trois leçons de catégories différentes revient identique', async () => {
		const niveau: SchoolLevel = 'ce2';
		const lecons = troisLeconsDeCategoriesDistinctes(niveau);
		expect(
			new Set(lecons.map((l) => l.category)).size,
			'il faut trois catégories distinctes au CE2 pour éprouver un bilan',
		).toBe(3);
		const blocs = lecons.map((lesson, i) => {
			const mode = modesPourNiveau(lesson.exerciseType, niveau)[0]?.id;
			const exercices = withSeed(100 + i, () => tirerExercices(lesson, N_EXERCICES, niveau, mode));
			expect(exercices.length, `${lesson.id} : tirage vide`).toBeGreaterThan(0);
			return bloc(lesson.id, mode, exercices);
		});
		const envoi: Envoi = {
			id: ID_ENVOI,
			libelle: LIBELLE,
			nature: 'bilan',
			variante: 'complet',
			niveau,
			blocs,
		};
		expect(await verifierAllerRetour(envoi)).toBeNull();
	});
});
