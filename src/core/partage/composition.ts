/* ============================================================
   Séance partagée (#734) — COMPOSER un envoi, côté encadrant.

   Le tirage a lieu ici, une fois (critère 2) : l'envoi porte des exercices, jamais de
   quoi les refaire. Le niveau est TOUJOURS celui que l'encadrant a choisi (critère 1),
   jamais celui d'un profil : aucune fonction de ce module ne lit le profil actif.

   Garantie de sortie : un envoi composé (`ok`) est joué par l'enfant sans refus. On le
   vérifie avec la fonction même qui prépare la séance chez l'enfant (`preparerPassage`),
   plutôt qu'avec une seconde règle qui finirait par s'en écarter.
   ============================================================ */
import { QUESTIONS_PAR_FICHE } from '../build';
import { expressQuestionsPerLesson, sampleExpressLessons } from '../bilan-express';
import {
	getLessonsByCategory,
	lessonsForIds,
	type BilanConfig,
	type LessonDef,
	type SchoolLevel,
} from '../catalog';
import { defaultMode, modesPourNiveau, seJoueEnRunner, type ExerciseMode } from '../exercise';
import { LEVEL_ORDER } from '../levels';
import {
	envoiEnJson,
	MAX_BLOCS,
	MAX_EXERCICES_PAR_BLOC,
	MAX_ITEMS,
	nombreItems,
	type BlocEnvoi,
	type Envoi,
} from './envoi';
import { preparerPassage } from './passage';
import { libelle as schemaLibelle, LONGUEUR_MAX_LIBELLE } from './textes';
import { tirerExercices } from './tirage';

export { QUESTIONS_PAR_FICHE };

export type Composition =
	{ ok: true; envoi: Envoi } | { ok: false; raison: 'libelle' | 'vide' | 'trop-grand' | 'format' };

/* ---------- Ce qu'on peut envoyer aujourd'hui ---------- */

/* Exercices tirés pour sonder le format d'un mode : une fabrique peut alterner les types
   d'un tirage à l'autre, un seul essai la jugerait sur un coup de chance. */
const SONDAGES = 3;
const sondes = new Map<string, boolean>();

/* Le mode se joue-t-il en fiche à ce niveau ? Même règle que la séance de l'enfant
   (`preparerPassage`) : le type de l'exercice tiré, et le mode qui le jouera. Mémorisé :
   le sélecteur pose la question pour tout le catalogue. */
function seJoueEnFiche(lesson: LessonDef, niveau: SchoolLevel, mode?: ExerciseMode): boolean {
	const cle = `${lesson.id}|${niveau}|${mode ?? ''}`;
	let oui = sondes.get(cle);
	if (oui === undefined) {
		oui = sonder(lesson, niveau, mode);
		sondes.set(cle, oui);
	}
	return oui;
}

function sonder(lesson: LessonDef, niveau: SchoolLevel, mode?: ExerciseMode): boolean {
	const joue = mode ?? defaultMode(lesson.exerciseType);
	try {
		for (let i = 0; i < SONDAGES; i++) {
			const ex = lesson.exerciseType.generate({ level: niveau, mode });
			if (seJoueEnRunner(ex.type, joue)) return false;
		}
		return true;
	} catch {
		return false;
	}
}

/** Modes de la leçon, à ce niveau, qu'un enfant peut jouer depuis un lien : ceux qui se
 *  jouent en fiche (les runners « une question à la fois » viendront ensuite). Une leçon
 *  sans modes rend `[undefined]` si elle se joue en fiche. */
export function modesEnvoyables(
	lesson: LessonDef,
	niveau: SchoolLevel,
): (ExerciseMode | undefined)[] {
	if (!lesson.levels.includes(niveau)) return [];
	const modes = lesson.exerciseType.modes?.length
		? modesPourNiveau(lesson.exerciseType, niveau).map((m) => m.id)
		: [undefined];
	return modes.filter((m) => seJoueEnFiche(lesson, niveau, m));
}

/** Niveaux de la leçon où au moins un mode est envoyable, dans l'ordre scolaire. */
export function niveauxEnvoyables(lesson: LessonDef): SchoolLevel[] {
	return LEVEL_ORDER.filter((n) => modesEnvoyables(lesson, n).length > 0);
}

/* ---------- Libellé ---------- */

/** Le libellé passe-t-il la liste blanche du lien (critère 39) ? Le même schéma qu'au
 *  décodage : un libellé accepté ici est un libellé que l'enfant pourra lire. */
export function libelleValide(s: string): boolean {
	try {
		schemaLibelle.lire(s, 'libelle');
		return true;
	} catch {
		return false;
	}
}

/** Ramène un texte libre (le titre d'une leçon, « Bilan : Calcul (CE2) ») dans la liste
 *  blanche du libellé, pour préremplir le champ. Les signes refusés deviennent des espaces
 *  (« Calcul : addition » → « Calcul addition ») ; `''` s'il ne reste rien de lisible. */
export function libelleParDefaut(texte: string): string {
	let s = texte
		.normalize('NFC')
		.replace(/[’‘ʼ]/g, "'")
		.replace(/[^\p{L}\p{M}0-9' -]+/gu, ' ')
		.replace(/ {2,}/g, ' ')
		.trim()
		.slice(0, LONGUEUR_MAX_LIBELLE);
	// Une coupure au milieu d'un caractère hors du plan de base en laisserait la moitié.
	if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1);
	s = s.trimEnd();
	return libelleValide(s) ? s : '';
}

/* ---------- Composer ---------- */

/* Dernier contrôle, commun aux deux natures : l'enfant pourra jouer l'envoi, et l'envoi
   peut voyager (une figure sans recette, par exemple, ne le pourrait pas). */
function verifier(envoi: Envoi): Composition {
	if (!preparerPassage(envoi).ok) return { ok: false, raison: 'format' };
	try {
		envoiEnJson(envoi);
	} catch {
		return { ok: false, raison: 'format' };
	}
	return { ok: true, envoi };
}

/** Une fiche de leçon, dans un mode, au niveau choisi. */
export function composerLecon(o: {
	lesson: LessonDef;
	niveau: SchoolLevel;
	mode?: ExerciseMode;
	libelle: string;
	id: string;
}): Composition {
	if (!libelleValide(o.libelle)) return { ok: false, raison: 'libelle' };
	const joue = o.mode ?? defaultMode(o.lesson.exerciseType);
	if (!modesEnvoyables(o.lesson, o.niveau).includes(joue)) return { ok: false, raison: 'format' };
	const exercices = tirerExercices(o.lesson, QUESTIONS_PAR_FICHE, o.niveau, o.mode);
	if (exercices.length === 0) return { ok: false, raison: 'vide' };
	const bloc: BlocEnvoi = { lecon: o.lesson.id, exercices };
	if (o.mode !== undefined) bloc.mode = o.mode;
	return verifier({
		id: o.id,
		libelle: o.libelle,
		nature: 'lecon',
		niveau: o.niveau,
		blocs: [bloc],
	});
}

/** Un bilan : une série par leçon, tirée au niveau choisi, sans mode (chaque format se
 *  replie en fiche, comme dans le bilan de l'enfant). */
export function composerBilan(o: {
	lessons: LessonDef[];
	niveau: SchoolLevel;
	variante: 'express' | 'complet';
	parLecon: number;
	libelle: string;
	id: string;
}): Composition {
	if (!libelleValide(o.libelle)) return { ok: false, raison: 'libelle' };
	if (o.lessons.length === 0 || o.parLecon < 1) return { ok: false, raison: 'vide' };
	if (o.lessons.length > MAX_BLOCS || o.parLecon > MAX_EXERCICES_PAR_BLOC)
		return { ok: false, raison: 'trop-grand' };
	const blocs: BlocEnvoi[] = [];
	for (const lesson of o.lessons) {
		const exercices = tirerExercices(lesson, o.parLecon, o.niveau);
		if (exercices.length) blocs.push({ lecon: lesson.id, exercices });
	}
	if (blocs.length === 0) return { ok: false, raison: 'vide' };
	const envoi: Envoi = {
		id: o.id,
		libelle: o.libelle,
		nature: 'bilan',
		variante: o.variante,
		niveau: o.niveau,
		blocs,
	};
	if (nombreItems(envoi) > MAX_ITEMS) return { ok: false, raison: 'trop-grand' };
	return verifier(envoi);
}

/* ---------- Les leçons d'un bilan ---------- */

/** Leçons d'un bilan de catégorie à ce niveau, dans l'ordre où la catégorie les présente.
 *  Express : la même règle que le bilan express de l'enfant (au plus `EXPRESS_CAP`
 *  leçons, questions par leçon selon leur nombre), mais tirées SANS pondération : les
 *  statistiques qui la guident chez l'enfant sont celles d'un profil, et l'envoi ne doit
 *  dépendre d'aucun profil de l'appareil. */
export function bilanCategorie(
	categoryId: string,
	niveau: SchoolLevel,
	variante: 'express' | 'complet',
): { lessons: LessonDef[]; parLecon: number } {
	const lessons = getLessonsByCategory(categoryId, niveau);
	if (variante === 'complet') return { lessons, parLecon: QUESTIONS_PAR_FICHE };
	const tirees = new Set(sampleExpressLessons(lessons.map((l) => l.id)));
	return {
		lessons: lessons.filter((l) => tirees.has(l.id)),
		parLecon: expressQuestionsPerLesson(lessons.length),
	};
}

/** Niveaux où au moins une leçon d'un favori existe. Un favori ne garde pas de niveau :
 *  c'est à l'encadrant de le choisir. */
export function niveauxFavori(favori: BilanConfig): SchoolLevel[] {
	const lessons = lessonsForIds(favori.lessonIds);
	return LEVEL_ORDER.filter((n) => lessons.some((l) => l.levels.includes(n)));
}

/** Leçons d'un bilan favori à ce niveau. Celles qui n'existent pas à ce niveau (ou plus
 *  dans le catalogue) sont écartées et COMPTÉES, pour que l'écran le dise : un favori
 *  amputé en silence se lirait comme le favori entier. */
export function bilanFavori(
	favori: BilanConfig,
	niveau: SchoolLevel,
): { lessons: LessonDef[]; parLecon: number; variante: 'express' | 'complet'; ecartees: number } {
	const lessons = lessonsForIds(favori.lessonIds).filter((l) => l.levels.includes(niveau));
	const complet = favori.questionsPerLesson === 'all';
	return {
		lessons,
		parLecon: complet ? QUESTIONS_PAR_FICHE : (favori.questionsPerLesson as number),
		variante: complet ? 'complet' : 'express',
		ecartees: favori.lessonIds.length - lessons.length,
	};
}
