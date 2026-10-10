/* ============================================================
   Séance partagée par lien (#734) — la COMPOSITION d'un envoi par l'encadrant
   (`src/core/partage/composition.ts`).

   Écrits AVANT l'implémentation, par un auteur distinct, depuis les critères de
   l'issue et le contrat du module transmis par le fil principal — pas depuis le
   code. Rouges tant que le module n'est pas écrit : c'est attendu.

   Critères tenus ici (versant logique) :
   - 1 : une leçon (dans un de ses modes) ou un bilan (catégorie express/complet,
     favori) est composé à un niveau EXPLICITE ; le profil actif de l'encadrant ne
     change rien aux items ;
   - 2 : les items sont tirés une fois et figés dans le lien — le lien les rend à
     l'identique, quel que soit le profil qui l'ouvre ;
   - 39 : liste blanche du libellé (lettres, chiffres, apostrophe droite, trait
     d'union, espace ; 60 caractères au plus) — EXACTEMENT celle du décodage ;
   - un envoi composé n'est JAMAIS refusé côté enfant.

   Depuis la PR 4, les modes joués dans un runner « une question à la fois » sont
   envoyables aussi : ce qui le garde (modes runner proposés, `runner` du passage,
   garantie sur tout le catalogue) vit dans `partage-runners-passage.test.ts`.

   Références d'attendu (aucune n'est le module testé) :
   - « liste blanche du décodage » : `decoderEnvoi` lui-même, nourri d'un JSON forgé ;
   - « même règle que l'express de l'enfant » : `expressQuestionsPerLesson`,
     `EXPRESS_CAP`, et `buildExpressConfig` pour montrer que la mesure statistique
     sait voir une pondération ;
   - les valeurs concrètes (6 formes de « être » au présent, plafond de 10 000 du
     CE2, nombre de questions d'un express) sont calculées à la main.
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
import {
	buildExpressConfig,
	EXPRESS_CAP,
	expressQuestionsPerLesson,
} from '../src/core/bilan-express';
import {
	CATEGORIES,
	getAllLessons,
	getLessonById,
	getLessonsByCategory,
	type BilanConfig,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { modesPourNiveau, type Exercise, type ExerciseMode } from '../src/core/exercise';
import { labelLecon } from '../src/core/levels';
import { lessonAvgPct, loadLessonStats, recordLessonStats } from '../src/core/progress';
import {
	addProfile,
	initProfiles,
	setNiveauMatiere,
	setNiveauReference,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { encoder } from '../src/core/partage/codec';
import {
	decoderEnvoi,
	encoderEnvoi,
	envoiEnJson,
	MAX_ITEMS,
	type Envoi,
} from '../src/core/partage/envoi';
import { preparerPassage } from '../src/core/partage/passage';
import {
	bilanCategorie,
	bilanFavori,
	composerBilan,
	composerLecon,
	libelleParDefaut,
	libelleValide,
	modesEnvoyables,
	niveauxEnvoyables,
	niveauxFavori,
	QUESTIONS_PAR_FICHE,
	type Composition,
} from '../src/core/partage/composition';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Outils ---------- */

/** Identifiant de 12 caractères base64url, comme ceux du lien. */
const ID = 'EnvoiTest001';
const LIBELLE = 'Fiche du lundi';

function lecon(id: string): LessonDef {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
}

/** Règle la classe du profil ACTIF partout où elle peut jouer sur un tirage. */
function regleClasse(niveau: SchoolLevel): void {
	setNiveauReference(niveau);
	setNiveauMatiere('math', niveau);
	setNiveauMatiere('francais', niveau);
}

/** Forme canonique (clés triées, `undefined` écartés) : deux exercices égaux en contenu
 *  ont la même clé, quel que soit l'ordre de construction de leurs champs. */
function canonique(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(canonique);
	if (v === null || typeof v !== 'object') return v;
	const entrees = Object.entries(v)
		.filter(([, x]) => x !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([k, x]) => [k, canonique(x)]);
	return Object.fromEntries(entrees);
}
const cle = (ex: Exercise): string => JSON.stringify(canonique(ex));

/** L'envoi d'une composition qui DOIT réussir. Lève (donc échoue) sur un refus. */
function envoiDe(c: Composition, quoi: string): Envoi {
	if (!c.ok) throw new Error(`${quoi} : composition refusée (« ${c.raison} »)`);
	return c.envoi;
}

type EnvoiLecon = Extract<Envoi, { nature: 'lecon' }>;
function envoiLeconDe(c: Composition, quoi: string): EnvoiLecon {
	const e = envoiDe(c, quoi);
	if (e.nature !== 'lecon')
		throw new Error(`${quoi} : nature « ${e.nature} » au lieu de « lecon »`);
	return e;
}

const raison = (c: Composition): string => (c.ok ? 'ok' : c.raison);

function exercicesDe(envoi: Envoi): Exercise[] {
	return envoi.nature === 'dictee' ? [] : envoi.blocs.flatMap((b) => b.exercices);
}

async function allerRetour(envoi: Envoi): Promise<Envoi> {
	const d = await decoderEnvoi(await encoderEnvoi(envoi));
	if (!d.ok) throw new Error(`lien refusé au décodage (« ${d.raison} »)`);
	return d.valeur;
}

/** Nombres écrits dans l'énoncé d'un exercice texte, groupes de milliers recollés
 *  (« 1 005 390 » → 1005390). */
const NOMBRE = /\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?!\d)|\d+/g;
function nombresDe(ex: Exercise): number[] {
	if (ex.type !== 'text')
		throw new Error(`précondition : exercice « text » attendu, reçu « ${ex.type} »`);
	return (ex.question.match(NOMBRE) ?? []).map((s) => Number(s.replace(/\D/g, '')));
}

/** Options de `composerLecon` sans clé `mode` quand il n'y en a pas. */
function optsLecon(
	l: LessonDef,
	niveau: SchoolLevel,
	mode: ExerciseMode | undefined,
	libelle = LIBELLE,
) {
	return mode === undefined
		? { lesson: l, niveau, libelle, id: ID }
		: { lesson: l, niveau, mode, libelle, id: ID };
}

/* ============================================================
   Ce qui est envoyable : forme de la réponse (modes runner : voir
   `partage-runners-passage.test.ts`)
   ============================================================ */

describe('modesEnvoyables / niveauxEnvoyables : ordre des modes, niveaux en ordre scolaire', () => {
	it('l’ordre est celui des modes de la leçon ; les niveaux suivent l’ordre scolaire', () => {
		const romains = lecon('num-chiffres-romains');
		expect(
			modesPourNiveau(romains.exerciseType, 'cm1').map((m) => m.id),
			'précondition',
		).toEqual(['ecrire', 'lire']);
		expect(modesEnvoyables(romains, 'cm1')).toEqual(['ecrire', 'lire']);

		const conj = lecon('fr-conj-etre-present');
		expect([...conj.levels].sort(), 'précondition : CE2 et CM1').toEqual(['ce2', 'cm1']);
		expect(niveauxEnvoyables(conj)).toEqual(['ce2', 'cm1']);
	});

	it('leçon sans modes jouée en fiche : [undefined] ; niveaux = ceux de la leçon', () => {
		const l = lecon('math-complements');
		expect(l.exerciseType.modes ?? [], 'précondition : pas de modes').toEqual([]);
		expect(modesEnvoyables(l, 'ce2')).toEqual([undefined]);
		expect(niveauxEnvoyables(l)).toEqual(['ce2']);
		expect(niveauxEnvoyables(lecon('math-multiples-50'))).toEqual(['cm1']);
	});
});

/* ============================================================
   composerLecon
   ============================================================ */

describe('composerLecon : forme de l’envoi et nombre d’exercices', () => {
	it('QUESTIONS_PAR_FICHE vaut 8, comme une fiche de jeu libre', () => {
		expect(QUESTIONS_PAR_FICHE).toBe(8);
	});

	it('leçon à variantes nombreuses : 8 exercices distincts, un seul bloc, id/libellé/niveau/mode donnés', () => {
		const l = lecon('num-comparer');
		const e = envoiLeconDe(composerLecon(optsLecon(l, 'cm1', 'saisie')), 'num-comparer');
		expect(e.niveau).toBe('cm1');
		expect(e.id).toBe(ID);
		expect(e.libelle).toBe(LIBELLE);
		expect(e.blocs).toHaveLength(1);
		const [b] = e.blocs;
		expect(b.lecon).toBe('num-comparer');
		expect(b.mode).toBe('saisie');
		expect(b.exercices).toHaveLength(QUESTIONS_PAR_FICHE);
		expect(new Set(b.exercices.map(cle)).size).toBe(QUESTIONS_PAR_FICHE);
	});

	it('leçon sans modes : le bloc ne porte pas de mode', () => {
		const e = envoiLeconDe(
			composerLecon(optsLecon(lecon('math-complements'), 'ce2', undefined)),
			'math-complements',
		);
		expect(e.blocs[0].mode).toBeUndefined();
		expect(e.blocs[0].exercices).toHaveLength(QUESTIONS_PAR_FICHE);
	});

	it('moins de variantes que 8 : toutes, une fois chacune (les six formes de « être » au présent)', () => {
		const e = envoiLeconDe(
			composerLecon(optsLecon(lecon('fr-conj-etre-present'), 'ce2', 'saisie')),
			'fr-conj-etre-present',
		);
		const exs = e.blocs[0].exercices;
		expect(new Set(exs.map(cle)).size, 'aucun doublon').toBe(exs.length);
		const reponses = exs.map((ex) => (ex.type === 'text' ? ex.answer : `type ${ex.type}`));
		expect([...reponses].sort()).toEqual(['es', 'est', 'sommes', 'sont', 'suis', 'êtes'].sort());
	});

	it('mode d’une autre leçon, mode inconnu, mode réservé à un autre niveau : refus « format »', () => {
		const conj = lecon('fr-conj-etre-present');
		// `tuiles` n'est pas un mode de cette leçon : sa fabrique rendrait peut-être du texte,
		// mais l'encadrant n'a pas pu le choisir.
		expect(raison(composerLecon(optsLecon(conj, 'ce2', 'tuiles')))).toBe('format');
		expect(raison(composerLecon(optsLecon(conj, 'ce2', 'inexistant')))).toBe('format');

		const longueurs = lecon('mes-longueurs');
		expect(
			modesPourNiveau(longueurs.exerciseType, 'ce2').map((m) => m.id),
			'précondition : « virgule » n’est pas proposé au CE2',
		).not.toContain('virgule');
		expect(raison(composerLecon(optsLecon(longueurs, 'ce2', 'virgule')))).toBe('format');
	});

	it('critère 39 : libellé hors liste blanche → refus « libelle »', () => {
		const l = lecon('math-complements');
		for (const libelle of [
			'<b>',
			'Dictée n°3',
			'Semaine 12 : les sons',
			'',
			'a'.repeat(61),
			' Fiche',
		])
			expect(
				raison(composerLecon(optsLecon(l, 'ce2', undefined, libelle))),
				JSON.stringify(libelle),
			).toBe('libelle');
	});
});

describe('critère 1 : le niveau des items est celui DONNÉ, jamais celui du profil actif', () => {
	/* `num-comparer` : CE2 compare des nombres à trois chiffres (programme CE2 : jusqu'à
	   10 000), CM1 jusqu'au million. Un tirage CE2 ne dépasse donc jamais 10 000 ; une
	   série CM1 en contient forcément au-delà. */
	const PLAFOND_CE2 = 10_000;

	it('composerLecon au CM1 sur un profil CE2, puis au CE2 sur un profil CM1', () => {
		const l = lecon('num-comparer');
		regleClasse('ce2');
		const auCm1 = Array.from({ length: 5 }, () =>
			envoiDe(composerLecon(optsLecon(l, 'cm1', 'saisie')), 'CM1 sur profil CE2'),
		);
		for (const e of auCm1) expect(e.niveau).toBe('cm1');
		expect(Math.max(...auCm1.flatMap(exercicesDe).flatMap(nombresDe))).toBeGreaterThan(PLAFOND_CE2);

		addProfile('Enfant CM1');
		regleClasse('cm1');
		const auCe2 = Array.from({ length: 5 }, () =>
			envoiDe(composerLecon(optsLecon(l, 'ce2', 'saisie')), 'CE2 sur profil CM1'),
		);
		for (const e of auCe2) expect(e.niveau).toBe('ce2');
		const tropGrands = auCe2
			.flatMap(exercicesDe)
			.flatMap(nombresDe)
			.filter((n) => n > PLAFOND_CE2);
		expect(tropGrands).toEqual([]);
	});

	it('composerBilan au CM1 sur un profil CE2, puis au CE2 sur un profil CM1', () => {
		const lessons = [lecon('num-comparer')];
		const composer = (niveau: SchoolLevel) =>
			envoiDe(
				composerBilan({
					lessons,
					niveau,
					variante: 'complet',
					parLecon: QUESTIONS_PAR_FICHE,
					libelle: LIBELLE,
					id: ID,
				}),
				`bilan @${niveau}`,
			);
		regleClasse('ce2');
		const auCm1 = Array.from({ length: 5 }, () => composer('cm1'));
		for (const e of auCm1) expect(e.niveau).toBe('cm1');
		expect(Math.max(...auCm1.flatMap(exercicesDe).flatMap(nombresDe))).toBeGreaterThan(PLAFOND_CE2);

		addProfile('Enfant CM1');
		regleClasse('cm1');
		const auCe2 = Array.from({ length: 5 }, () => composer('ce2'));
		for (const e of auCe2) expect(e.niveau).toBe('ce2');
		expect(
			auCe2
				.flatMap(exercicesDe)
				.flatMap(nombresDe)
				.filter((n) => n > PLAFOND_CE2),
		).toEqual([]);
	});
});

describe('critère 2 : les items sont figés dans le lien', () => {
	it('le lien rend l’envoi à l’identique, ouvert sur un profil CE2 puis sur un profil CM1', async () => {
		regleClasse('ce2');
		const envoi = envoiDe(
			composerLecon(optsLecon(lecon('num-comparer'), 'cm1', 'saisie')),
			'num-comparer',
		);
		const code = await encoderEnvoi(envoi);
		const surCe2 = await decoderEnvoi(code);
		addProfile('Enfant CM1');
		regleClasse('cm1');
		const surCm1 = await decoderEnvoi(code);
		expect(surCe2).toEqual({ ok: true, valeur: envoi });
		expect(surCm1).toEqual({ ok: true, valeur: envoi });
	});
});

describe('jamais refusé côté enfant : tout le catalogue envoyable', () => {
	it('chaque leçon × niveau × mode envoyable se compose, se joue (preparerPassage) et revient du lien à l’identique', async () => {
		const echecs: string[] = [];
		let compositions = 0;
		for (const l of getAllLessons())
			for (const niv of niveauxEnvoyables(l))
				for (const mode of modesEnvoyables(l, niv)) {
					const quoi = `${l.id} @${niv} (${mode ?? 'sans mode'})`;
					const c = composerLecon(optsLecon(l, niv, mode));
					if (!c.ok) {
						echecs.push(`${quoi} : refus « ${c.raison} »`);
						continue;
					}
					compositions++;
					const e = c.envoi;
					if (e.nature !== 'lecon' || e.niveau !== niv || e.blocs.length !== 1) {
						echecs.push(`${quoi} : forme d’envoi inattendue`);
						continue;
					}
					const [b] = e.blocs;
					if (b.lecon !== l.id) echecs.push(`${quoi} : bloc de ${b.lecon}`);
					if (b.mode !== mode) echecs.push(`${quoi} : mode du bloc ${String(b.mode)}`);
					const n = b.exercices.length;
					if (n < 1 || n > QUESTIONS_PAR_FICHE) echecs.push(`${quoi} : ${n} exercices`);
					if (new Set(b.exercices.map(cle)).size !== n)
						echecs.push(`${quoi} : exercices en double`);
					const p = preparerPassage(e);
					if (!p.ok) echecs.push(`${quoi} : refusé par la séance (« ${p.raison} »)`);
					try {
						const relu = await allerRetour(e);
						if (JSON.stringify(canonique(relu)) !== JSON.stringify(canonique(e)))
							echecs.push(`${quoi} : le lien ne rend pas l’envoi à l’identique`);
					} catch (err) {
						echecs.push(`${quoi} : ${err instanceof Error ? err.message : String(err)}`);
					}
				}
		expect(echecs).toEqual([]);
		// Garde de vacuité : une implémentation qui ne déclarerait rien d'envoyable passerait
		// la boucle sans rien éprouver.
		expect(compositions).toBeGreaterThan(100);
	}, 120_000);
});

/* ============================================================
   Bilans de catégorie
   ============================================================ */

const NIVEAUX: SchoolLevel[] = ['ce2', 'cm1'];
const ids = (ls: LessonDef[]): string[] => ls.map((l) => l.id);

function composerDepuis(
	b: { lessons: LessonDef[]; parLecon: number },
	niveau: SchoolLevel,
	variante: 'express' | 'complet',
	libelle = LIBELLE,
): Composition {
	return composerBilan({
		lessons: b.lessons,
		niveau,
		variante,
		parLecon: b.parLecon,
		libelle,
		id: ID,
	});
}

/** Vérifie un bilan composé contre les leçons demandées ; renvoie les écarts. */
function ecartsBilan(
	e: Envoi,
	lessons: LessonDef[],
	niveau: SchoolLevel,
	variante: string,
	parLecon: number,
): string[] {
	const ecarts: string[] = [];
	if (e.nature !== 'bilan') return [`nature ${e.nature}`];
	if (e.niveau !== niveau) ecarts.push(`niveau ${e.niveau}`);
	if (e.variante !== variante) ecarts.push(`variante ${e.variante}`);
	if (e.id !== ID || e.libelle !== LIBELLE) ecarts.push('id ou libellé changés');
	if (JSON.stringify(e.blocs.map((b) => b.lecon)) !== JSON.stringify(ids(lessons)))
		ecarts.push(`blocs ${e.blocs.map((b) => b.lecon).join(',')}`);
	for (const b of e.blocs) {
		if (b.mode !== undefined) ecarts.push(`${b.lecon} : mode ${b.mode}`);
		const n = b.exercices.length;
		if (n < 1 || n > parLecon) ecarts.push(`${b.lecon} : ${n} exercices (au plus ${parLecon})`);
		if (new Set(b.exercices.map(cle)).size !== n) ecarts.push(`${b.lecon} : doublons`);
	}
	const p = preparerPassage(e);
	if (!p.ok) ecarts.push(`refusé par la séance (« ${p.raison} »)`);
	return ecarts;
}

describe('bilanCategorie : quelles leçons, combien de questions', () => {
	it('complet : toutes les leçons de la catégorie à ce niveau, dans l’ordre du catalogue, 8 par leçon', () => {
		for (const c of CATEGORIES)
			for (const niv of NIVEAUX) {
				const b = bilanCategorie(c.id, niv, 'complet');
				expect(ids(b.lessons), `${c.id} @${niv}`).toEqual(ids(getLessonsByCategory(c.id, niv)));
				expect(b.parLecon, `${c.id} @${niv}`).toBe(QUESTIONS_PAR_FICHE);
			}
	});

	it('express : la règle de l’enfant (≤ 20 leçons ; 3, 2 puis 1 question selon la taille) — valeurs calculées à la main', () => {
		// [catégorie, niveau, questions par leçon attendues] : 20 // N plafonné à 3, plancher 1.
		const cas: [string, SchoolLevel, number][] = [
			['math-calcul', 'ce2', 3], // 3 leçons → 6, plafonné à 3
			['math-geometrie', 'ce2', 2], // 7 leçons → 2
			['fr-conjugaison', 'ce2', 1], // 55 leçons → 0, plancher 1
		];
		for (const [cat, niv, q] of cas) {
			const total = getLessonsByCategory(cat, niv).length;
			expect(Math.min(3, Math.max(1, Math.floor(20 / total))), `précondition ${cat}`).toBe(q);
			const b = bilanCategorie(cat, niv, 'express');
			expect(b.parLecon, cat).toBe(q);
			expect(b.lessons.length, cat).toBe(Math.min(total, 20));
		}
	});

	it('express sur tout le catalogue : au plus EXPRESS_CAP leçons distinctes, toutes de la catégorie ; toutes si elles tiennent', () => {
		for (const c of CATEGORIES)
			for (const niv of NIVEAUX) {
				const toutes = ids(getLessonsByCategory(c.id, niv));
				const b = bilanCategorie(c.id, niv, 'express');
				const obtenues = ids(b.lessons);
				const quoi = `${c.id} @${niv}`;
				expect(new Set(obtenues).size, `${quoi} : doublons`).toBe(obtenues.length);
				expect(
					obtenues.filter((id) => !toutes.includes(id)),
					`${quoi} : hors catégorie`,
				).toEqual([]);
				expect(obtenues.length, quoi).toBe(Math.min(toutes.length, EXPRESS_CAP));
				expect(b.parLecon, quoi).toBe(expressQuestionsPerLesson(toutes.length));
			}
	});

	it('express d’une grande catégorie : la sélection ne suit PAS les statistiques du profil actif', () => {
		regleClasse('ce2');
		const toutes = ids(getLessonsByCategory('fr-conjugaison', 'ce2'));
		expect(toutes.length, 'précondition : la catégorie dépasse le plafond').toBeGreaterThan(
			EXPRESS_CAP,
		);
		const faibles = toutes.filter((_, i) => i % 2 === 0);
		const fortes = toutes.filter((_, i) => i % 2 === 1);
		recordLessonStats(Object.fromEntries(faibles.map((id) => [id, { ok: 0, total: 10 }])), 'bilan');
		recordLessonStats(Object.fromEntries(fortes.map((id) => [id, { ok: 10, total: 10 }])), 'bilan');
		const stats = loadLessonStats();
		expect(
			faibles.map((id) => lessonAvgPct(stats[id])),
			'précondition : stats visibles',
		).toEqual(faibles.map(() => 0));
		expect(
			fortes.map((id) => lessonAvgPct(stats[id])),
			'précondition : stats visibles',
		).toEqual(fortes.map(() => 100));

		/** Taux de sortie d'une leçon faible rapporté à celui d'une leçon forte. */
		const TOURS = 300;
		const rapport = (tirer: () => string[]): number => {
			let f = 0;
			let o = 0;
			for (let i = 0; i < TOURS; i++)
				for (const id of tirer()) {
					if (faibles.includes(id)) f++;
					else if (fortes.includes(id)) o++;
				}
			return f / faibles.length / (o / fortes.length);
		};
		// Puissance de la mesure : l'express de l'ENFANT pondère, et la mesure le voit.
		expect(rapport(() => buildExpressConfig('Bilan', toutes).lessonIds)).toBeGreaterThan(1.5);
		// Sans pondération : ~1 (écart-type de l'ordre de 0,02 sur 300 tours).
		const r = rapport(() => ids(bilanCategorie('fr-conjugaison', 'ce2', 'express').lessons));
		expect(r).toBeGreaterThan(0.8);
		expect(r).toBeLessThan(1.25);
	});
});

/* ============================================================
   composerBilan
   ============================================================ */

describe('composerBilan : un bloc par leçon, au niveau donné, dans les plafonds du lien', () => {
	it('toute catégorie × niveau, express et complet : composé, joué, rendu par le lien — ou refusé pour la bonne raison', async () => {
		const echecs: string[] = [];
		for (const c of CATEGORIES)
			for (const niv of NIVEAUX)
				for (const variante of ['express', 'complet'] as const) {
					const quoi = `${c.id} @${niv} ${variante}`;
					const b = bilanCategorie(c.id, niv, variante);
					const comp = composerDepuis(b, niv, variante);
					const attendu =
						b.lessons.length === 0 ? 'vide' : b.lessons.length > 30 ? 'trop-grand' : 'ok';
					if (raison(comp) !== attendu) {
						echecs.push(`${quoi} : « ${raison(comp)} » au lieu de « ${attendu} »`);
						continue;
					}
					if (!comp.ok) continue;
					echecs.push(
						...ecartsBilan(comp.envoi, b.lessons, niv, variante, b.parLecon).map(
							(x) => `${quoi} : ${x}`,
						),
					);
					try {
						const relu = await allerRetour(comp.envoi);
						if (JSON.stringify(canonique(relu)) !== JSON.stringify(canonique(comp.envoi)))
							echecs.push(`${quoi} : le lien ne rend pas l’envoi à l’identique`);
					} catch (err) {
						echecs.push(`${quoi} : ${err instanceof Error ? err.message : String(err)}`);
					}
				}
		expect(echecs).toEqual([]);
	}, 120_000);

	it('express à une question par leçon : chaque bloc a exactement 1 exercice', () => {
		const b = bilanCategorie('fr-conjugaison', 'ce2', 'express');
		expect(b.parLecon, 'précondition').toBe(1);
		const e = envoiDe(composerDepuis(b, 'ce2', 'express'), 'express conjugaison');
		expect(exercicesDe(e)).toHaveLength(b.lessons.length);
	});

	it('bornes : 30 leçons passent, 31 sont « trop-grand »', () => {
		const conj = getLessonsByCategory('fr-conjugaison', 'ce2');
		expect(conj.length, 'précondition').toBeGreaterThanOrEqual(31);
		const trente = composerDepuis({ lessons: conj.slice(0, 30), parLecon: 1 }, 'ce2', 'express');
		const e = envoiDe(trente, '30 leçons');
		expect(e.nature === 'bilan' ? e.blocs.length : 0).toBe(30);
		expect(preparerPassage(e).ok).toBe(true);
		expect(
			raison(composerDepuis({ lessons: conj.slice(0, 31), parLecon: 1 }, 'ce2', 'express')),
		).toBe('trop-grand');
		expect(
			raison(composerDepuis({ lessons: conj, parLecon: QUESTIONS_PAR_FICHE }, 'ce2', 'complet')),
		).toBe('trop-grand');
	});

	it('plus de MAX_ITEMS items en moins de 30 blocs : « trop-grand », pas un lien tronqué', async () => {
		// Huit leçons à variantes très nombreuses (des milliers de tirages distincts).
		const lessons = [
			'num-comparer',
			'num-decompose-10000',
			'num-encadrer-intercaler',
			'num-situer-10000',
			'math-dizaines-centaines',
			'calc-addition-posee',
			'calc-soustraction-posee',
			'num-valeur-position',
		].map(lecon);
		const parLecon = 40;
		expect(lessons.length * parLecon, 'précondition').toBeGreaterThan(MAX_ITEMS);
		const comp = composerDepuis({ lessons, parLecon }, 'ce2', 'express');
		expect(raison(comp)).toBe('trop-grand');
		// Et ce qui passe le plafond se code : un envoi `ok` ne lève jamais à l'encodage.
		const juste = composerDepuis({ lessons: lessons.slice(0, 7), parLecon }, 'ce2', 'express');
		const e = envoiDe(juste, '7 × 40 = 280 items');
		await expect(encoderEnvoi(e)).resolves.toEqual(expect.any(String));
	});

	it('aucune leçon : « vide » ; libellé hors liste blanche : « libelle »', () => {
		expect(raison(composerDepuis({ lessons: [], parLecon: 3 }, 'ce2', 'express'))).toBe('vide');
		const b = bilanCategorie('math-calcul', 'ce2', 'complet');
		expect(raison(composerDepuis(b, 'ce2', 'complet', 'Bilan : calcul'))).toBe('libelle');
	});

	it('un bilan accepte les leçons à runner : la séance les replie en fiche', () => {
		const lessons = ['math-prob-composition', 'fr-gram-clic-verbe', 'fr-homophones-a'].map(lecon);
		const comp = composerDepuis({ lessons, parLecon: 2 }, 'ce2', 'express');
		const e = envoiDe(comp, 'bilan à runners');
		expect(ecartsBilan(e, lessons, 'ce2', 'express', 2)).toEqual([]);
	});
});

/* ============================================================
   Bilan favori
   ============================================================ */

describe('bilan favori : niveaux, leçons écartées, variante', () => {
	const CE2_SEUL = 'math-complements';
	const CM1_SEUL = 'math-multiples-50';
	const CM1_SEUL_2 = 'num-dec-position';
	const LES_DEUX = 'num-comparer';
	const INCONNUE = 'lecon-qui-n-existe-pas';

	function favori(lessonIds: string[], questionsPerLesson: number | 'all'): BilanConfig {
		return { id: 'fav-test', label: 'Mon favori', lessonIds, questionsPerLesson };
	}

	beforeEach(() => {
		expect(lecon(CE2_SEUL).levels, 'précondition').toEqual(['ce2']);
		expect(lecon(CM1_SEUL).levels, 'précondition').toEqual(['cm1']);
		expect(lecon(CM1_SEUL_2).levels, 'précondition').toEqual(['cm1']);
		expect(lecon(LES_DEUX).levels, 'précondition').toEqual(['ce2', 'cm1']);
		expect(getLessonById(INCONNUE), 'précondition').toBeUndefined();
	});

	it('niveauxFavori : niveaux où au moins une leçon existe, en ordre scolaire', () => {
		expect(niveauxFavori(favori([CM1_SEUL, CE2_SEUL], 'all'))).toEqual(['ce2', 'cm1']);
		expect(niveauxFavori(favori([CM1_SEUL, INCONNUE], 'all'))).toEqual(['cm1']);
		expect(niveauxFavori(favori([INCONNUE], 'all'))).toEqual([]);
		expect(niveauxFavori(favori([], 'all'))).toEqual([]);
	});

	it('bilanFavori : leçons du niveau dans l’ordre du favori ; hors niveau et inconnues écartées et comptées', () => {
		const fav = favori([CM1_SEUL, CE2_SEUL, INCONNUE, LES_DEUX, CM1_SEUL_2], 2);
		const auCe2 = bilanFavori(fav, 'ce2');
		expect(ids(auCe2.lessons)).toEqual([CE2_SEUL, LES_DEUX]);
		expect(auCe2.ecartees).toBe(3);
		const auCm1 = bilanFavori(fav, 'cm1');
		expect(ids(auCm1.lessons)).toEqual([CM1_SEUL, LES_DEUX, CM1_SEUL_2]);
		expect(auCm1.ecartees).toBe(2);
	});

	it('questionsPerLesson : « all » → complet à 8 ; un nombre n → express à n', () => {
		const tout = bilanFavori(favori([CE2_SEUL, LES_DEUX], 'all'), 'ce2');
		expect(tout.variante).toBe('complet');
		expect(tout.parLecon).toBe(QUESTIONS_PAR_FICHE);
		const deux = bilanFavori(favori([CE2_SEUL, LES_DEUX], 2), 'ce2');
		expect(deux.variante).toBe('express');
		expect(deux.parLecon).toBe(2);
	});

	it('un favori composé à un niveau se joue, avec les seules leçons de ce niveau', () => {
		const b = bilanFavori(favori([CM1_SEUL, CE2_SEUL, LES_DEUX], 'all'), 'cm1');
		const e = envoiDe(composerDepuis(b, 'cm1', b.variante), 'favori au CM1');
		expect(ecartsBilan(e, b.lessons, 'cm1', 'complet', QUESTIONS_PAR_FICHE)).toEqual([]);
	});
});

/* ============================================================
   Critère 39 : le libellé
   ============================================================ */

/** Le DÉCODAGE accepte-t-il un envoi portant ce libellé ? Le JSON est forgé à la main
 *  (seul le libellé change), pour juger le décodeur sans passer par l'écriture. */
const ENVOI_BASE: Envoi = {
	id: ID,
	libelle: LIBELLE,
	nature: 'lecon',
	niveau: 'ce2',
	blocs: [
		{
			lecon: 'num-comparer',
			exercices: [{ type: 'text', question: 'Compare : 3 @ 4', answer: '<' }],
		},
	],
};
function estObjet(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}
async function decodageAccepte(libelle: string): Promise<boolean> {
	const json = envoiEnJson(ENVOI_BASE);
	if (!estObjet(json)) throw new Error('forme JSON d’envoi inattendue');
	const d = await decoderEnvoi(await encoder('envoi', { ...json, libelle }));
	return d.ok;
}

const LIBELLES_VALIDES = [
	'Fiche du lundi',
	"Révisions d'été",
	'CE2-CM1 semaine 3',
	'Œuvre de Noël à faire',
	'É',
	'7',
	'a'.repeat(60),
	'e\u0301te', // « été » en forme décomposée : lettre + accent combinant
];
const LIBELLES_INVALIDES = [
	'',
	' ',
	' Fiche',
	'Fiche ',
	'<b>',
	'Dictée n°3',
	'Semaine 12 : les sons',
	'a'.repeat(61),
	'Révisions d’été', // apostrophe typographique
	'---',
	"' - '",
	'Fiche\u00a0du lundi', // espace insécable
	'Fiche\tdu lundi',
	'Fiche\ndu lundi',
	'Bravo 🎉',
	'Fiche_du_lundi',
	'a&b',
	'"cité"',
	'x\u202ey', // forçage bidirectionnel
	'Fiche \uff13', // chiffre pleine chasse : un chiffre, mais pas 0-9
];

describe('critère 39 : libelleValide = la liste blanche du décodage, exactement', () => {
	it('valeurs écrites à la main', () => {
		for (const s of LIBELLES_VALIDES) expect(libelleValide(s), JSON.stringify(s)).toBe(true);
		for (const s of LIBELLES_INVALIDES) expect(libelleValide(s), JSON.stringify(s)).toBe(false);
	});

	it('même verdict que le décodage du lien, cas par cas (dont la double espace interne)', async () => {
		expect(await decodageAccepte(LIBELLE), 'précondition : l’envoi de base se décode').toBe(true);
		const cas = [
			...LIBELLES_VALIDES,
			...LIBELLES_INVALIDES,
			'Fiche  du lundi',
			"l'",
			'-a-',
			"Aujourd'hui c'est 2",
		];
		const ecarts: string[] = [];
		for (const s of cas) {
			const decode = await decodageAccepte(s);
			if (libelleValide(s) !== decode)
				ecarts.push(`${JSON.stringify(s)} : décodage ${decode ? 'accepte' : 'refuse'}`);
		}
		expect(ecarts).toEqual([]);
	});
});

describe('critère 39 : libelleParDefaut ramène un texte libre dans la liste blanche', () => {
	it('valeurs exactes (calculées à la main)', () => {
		expect(libelleParDefaut('J’écris le verbe')).toBe("J'écris le verbe");
		expect(libelleParDefaut('  Fiche  du   lundi  ')).toBe('Fiche du lundi');
		expect(libelleParDefaut('Bilan : Calcul (CE2)')).toBe('Bilan Calcul CE2');
		expect(libelleParDefaut('Semaine 12 : les sons')).toBe('Semaine 12 les sons');
		expect(libelleParDefaut('Bilan\u00a0: Calcul')).toBe('Bilan Calcul');
		expect(libelleParDefaut('<b>')).toBe('b');
		expect(libelleParDefaut('Bravo 🎉')).toBe('Bravo');
		expect(['Dictée n3', 'Dictée n 3']).toContain(libelleParDefaut('Dictée n°3'));
	});

	it('rien de plein ne reste : chaîne vide (un trait d’union seul n’est pas un libellé)', () => {
		for (const s of ['', '   ', '!!!', '---', "' - '", '🎉🎉', '<>'])
			expect(libelleParDefaut(s), JSON.stringify(s)).toBe('');
	});

	it('troncature à 60 : sans espace finale, sans couper un caractère en deux', () => {
		expect(libelleParDefaut('a'.repeat(61))).toBe('a'.repeat(60));
		// Le 60ᵉ caractère est une espace : elle ne finit pas le libellé.
		expect(libelleParDefaut('a'.repeat(59) + ' bcdef')).toBe('a'.repeat(59));
		// Une lettre hors du plan de base tient sur deux unités UTF-16, à cheval sur la borne.
		const coupe = libelleParDefaut('a'.repeat(59) + '\u{1d49c}bc');
		expect(libelleValide(coupe), JSON.stringify(coupe)).toBe(true);
		expect(coupe.length).toBeLessThanOrEqual(60);
	});

	it('un texte déjà valide (espaces simples) ressort inchangé', () => {
		// La forme décomposée est écartée : une normalisation NFC serait légitime ici.
		for (const s of LIBELLES_VALIDES.filter((x) => x === x.normalize('NFC')))
			expect(libelleParDefaut(s), JSON.stringify(s)).toBe(s);
	});

	it('tout texte (catalogue, bilans, pièges) donne un libellé accepté par le DÉCODAGE, ou vide', async () => {
		const textes = [
			...LIBELLES_INVALIDES,
			'Fiche\tdu\nlundi',
			'Calcul\u00a0mental',
			'a'.repeat(59) + '\u{1d49c}bc',
			...getAllLessons().flatMap((l) => l.levels.map((n) => labelLecon(l, n))),
			...CATEGORIES.flatMap((c) => NIVEAUX.map((n) => `Bilan : ${c.label} (${n.toUpperCase()})`)),
		];
		const ecarts: string[] = [];
		for (const t of textes) {
			const r = libelleParDefaut(t);
			if (r === '') continue;
			if (!libelleValide(r) || !(await decodageAccepte(r)))
				ecarts.push(`${JSON.stringify(t)} → ${JSON.stringify(r)}`);
		}
		expect(ecarts).toEqual([]);
	}, 60_000);

	it('un libellé de leçon ou de bilan ne se vide jamais (il porte toujours des lettres)', () => {
		const vides = [
			...getAllLessons().flatMap((l) => l.levels.map((n) => labelLecon(l, n))),
			...CATEGORIES.map((c) => `Bilan : ${c.label} (CE2)`),
		].filter((t) => libelleParDefaut(t) === '');
		expect(vides).toEqual([]);
	});
});
