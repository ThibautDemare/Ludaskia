/* ============================================================
   Bilan en PARCOURS guidé (#777) — logique PURE, sans DOM.
   ------------------------------------------------------------
   Un bilan joué à l'écran ne s'affiche plus en page unique : une question par écran
   (le vrai exercice de la leçon, comme en révision espacée), des PARTIES (une catégorie,
   au plus `PLAFOND_PARTIE` questions sauf leçon seule plus grosse), la correction à la
   FIN de chaque partie, puis un récapitulatif par leçon. L'écran vit dans
   `ui/bilan-parcours.ts` ; ce module décide de tout ce qui se décide sans écran :

   - QUELLES questions (`questionsDuBilan`) : tirées par `questionDeRevision`, donc sous
     la même forme qu'en révision (QCM avec ses choix, mots à toucher, tuiles…), sans
     doublon, et toute une banque courte plutôt que des répétitions ;
   - DANS QUEL ORDRE et en quelles parties (`construireParcours`, `planifierParties`) :
     catégories dans l'ordre de `CATEGORIES`, leçons dans l'ordre de l'écran de leur
     catégorie, une leçon jamais coupée, le MOINS de parties possible, équilibrées ;
   - COMMENT corriger une réponse collectée (`corrigerQuestion`) : par les règles déjà en
     place — le verdict d'un widget par les prédicats que le widget appelle lui-même
     (`core/regles-justesse.ts`), le reste par `checkItemAnswer`, `ordreErreur`,
     `pairesErreur`, `motsMalClasses`, `attendueItem`, `dispositionPosee`,
     `entreesEtapesPassees`…, jamais par une seconde copie ; chaque erreur est déjà mise en forme pour l'écran de fin de partie
     ET pour le journal du parent, qui disent la même chose ;
   - le VERDICT d'une leçon (`verdictLecon`) et les PHRASES à compteur du parcours
     (« 1 réussite », « Tu as réussi 6 leçons sur 9. »…), testables sur 0, 1, 2 et n.
   ============================================================ */
import {
	CATEGORIES,
	getAllLessons,
	getLessonById,
	getLessonsByCategory,
	isLegacyMathLesson,
	type BilanConfig,
	type LessonDef,
	type SchoolLevel,
} from './catalog';
import { questionDeRevision, type QuestionRevision } from './revision-question';
import { QUESTIONS_PAR_FICHE } from './build';
import { checkItemAnswer, dispositionPosee, type PosedSpec } from './items';
import { classeDeCategorie, niveauLecon } from './niveau-actif';
import { labelLecon } from './levels';
import {
	attendueIntervalle,
	attendueItem,
	enonceClicMotJournal,
	enonceEtapeLisible,
	enonceProblemeLisible,
	etapesLisibles,
	libelleChoix,
	motsMalClasses,
	ordreErreur,
	pairesErreur,
	PONCT_MOTS,
	questionPourJournal,
} from './erreur-representation';
import { attenduEtapeTexte, entreesEtapesPassees } from './probleme-etapes';
import {
	appariementJuste,
	chiffrePoseJuste,
	grillePoseeJuste,
	motsChoisisJustes,
	ordreJuste,
	triJuste,
	tuileJuste,
} from './regles-justesse';
import { reponseLisible } from './signes';
import type { SafeHtml } from './html';
import { libelleCible } from '../data/francais/grammaire-clic-mot';

/* ============================================================
   Verdict d'une leçon (critère 13).
   ============================================================ */

export type VerdictLecon = 'reussi' | 'presque' | 'a-retravailler';

/** Verdict d'une leçon sur `posees` questions réellement posées, dont `reussies` justes.
    - 3 questions ou moins : tout juste → réussi, sinon à retravailler (pas de « presque »,
      qui n'aurait pas de sens sur si peu) ;
    - 4 et plus : réussi dès ⌈0,8 × N⌉, à retravailler sous la moitié, presque entre les
      deux.
    En arithmétique ENTIÈRE : `reussies ≥ ⌈0,8 × N⌉` ⇔ `5 × reussies ≥ 4 × N` (reussies est
    entier), ce qui épargne à une borne exacte (0,8 × 10 = 8) un arrondi flottant. */
export function verdictLecon(reussies: number, posees: number): VerdictLecon {
	if (posees <= 3) return reussies === posees ? 'reussi' : 'a-retravailler';
	if (5 * reussies >= 4 * posees) return 'reussi';
	if (2 * reussies < posees) return 'a-retravailler';
	return 'presque';
}

/** Mot du verdict, tel qu'il s'affiche (et se lit) à côté de son icône. */
export const MOT_VERDICT: Record<VerdictLecon, string> = {
	reussi: 'Réussi',
	presque: 'Presque',
	'a-retravailler': 'À retravailler',
};

/** Rang d'affichage du récapitulatif : réussi, puis presque, puis à retravailler. */
const RANG_VERDICT: Record<VerdictLecon, number> = { reussi: 0, presque: 1, 'a-retravailler': 2 };

/* ============================================================
   Découpage en parties (critère 8).
   ============================================================ */

/** Plafond d'une partie, en questions. Une leçon seule plus grosse le dépasse (elle n'est
    jamais coupée), mais deux leçons ensemble jamais. */
export const PLAFOND_PARTIE = 15;

/** Une leçon du bilan, vue par le découpage : sa catégorie et ses questions servies. */
export interface LeconPlanifiee {
	lessonId: string;
	categoryId: string;
	nbQuestions: number;
}

/** Une partie : une catégorie, des leçons consécutives et entières. */
export interface PartiePlan {
	categoryId: string;
	lessonIds: string[];
	nbQuestions: number;
}

/** Découpe une liste ORDONNÉE de leçons en parties. Rien n'est réordonné : une catégorie qui
    revient plus loin fait une nouvelle partie. Deux catégories ne se mêlent jamais, une leçon
    n'est jamais coupée, et une partie à plusieurs leçons tient sous `plafond`.

    Le nombre de parties est MINIMAL. Une série de même catégorie se découpe d'abord aux
    leçons plus grosses que le plafond (seules dans leur partie, par force) ; chaque tronçon
    restant se découpe ensuite en autant de parties qu'un remplissage glouton en demande —
    ce qui est le minimum pour des segments consécutifs sous un plafond —, mais ÉQUILIBRÉES :
    13 leçons de 3 font 15 + 12 + 12 plutôt que 15 + 15 + 9, pour qu'une dernière partie
    maigre ne ressemble pas à un reste. */
export function planifierParties(
	lecons: readonly LeconPlanifiee[],
	plafond: number = PLAFOND_PARTIE,
): PartiePlan[] {
	const parties: PartiePlan[] = [];
	let i = 0;
	while (i < lecons.length) {
		let j = i;
		while (j < lecons.length && lecons[j].categoryId === lecons[i].categoryId) j++;
		const serie = lecons.slice(i, j);
		let debut = 0;
		for (let k = 0; k <= serie.length; k++) {
			if (k < serie.length && serie[k].nbQuestions <= plafond) continue;
			parties.push(...decouperEquilibre(serie.slice(debut, k), plafond));
			if (k < serie.length) parties.push(partieDe([serie[k]]));
			debut = k + 1;
		}
		i = j;
	}
	return parties;
}

function partieDe(lecons: readonly LeconPlanifiee[]): PartiePlan {
	return {
		categoryId: lecons[0].categoryId,
		lessonIds: lecons.map((l) => l.lessonId),
		nbQuestions: lecons.reduce((s, l) => s + l.nbQuestions, 0),
	};
}

/* Tronçon d'une seule catégorie dont chaque leçon tient sous le plafond. Nombre de parties :
   celui du remplissage glouton (minimal). Répartition : celle qui, à ce nombre de parties,
   rend la plus grosse partie la plus petite possible (programmation dynamique, quelques
   dizaines de leçons au plus). Elle tient forcément sous le plafond, puisque le glouton en
   est une. */
function decouperEquilibre(troncon: readonly LeconPlanifiee[], plafond: number): PartiePlan[] {
	const n = troncon.length;
	if (n === 0) return [];
	let nbParties = 1;
	let courant = 0;
	for (const l of troncon) {
		if (courant > 0 && courant + l.nbQuestions > plafond) {
			nbParties++;
			courant = 0;
		}
		courant += l.nbQuestions;
	}
	// prefixe[j] = questions des j premières leçons.
	const prefixe = [0];
	for (const l of troncon) prefixe.push(prefixe[prefixe.length - 1] + l.nbQuestions);
	// cout[p][j] = plus grosse partie, au mieux, pour couper les j premières leçons en p parties.
	const INF = Number.POSITIVE_INFINITY;
	const cout: number[][] = Array.from({ length: nbParties + 1 }, () =>
		new Array<number>(n + 1).fill(INF),
	);
	const coupe: number[][] = Array.from({ length: nbParties + 1 }, () =>
		new Array<number>(n + 1).fill(0),
	);
	cout[0][0] = 0;
	for (let p = 1; p <= nbParties; p++) {
		for (let j = p; j <= n; j++) {
			for (let d = p - 1; d < j; d++) {
				const taille = prefixe[j] - prefixe[d];
				if (taille > plafond) continue;
				const c = Math.max(cout[p - 1][d], taille);
				if (c < cout[p][j]) {
					cout[p][j] = c;
					coupe[p][j] = d;
				}
			}
		}
	}
	const parties: PartiePlan[] = [];
	let fin = n;
	for (let p = nbParties; p >= 1; p--) {
		const d = coupe[p][fin];
		parties.unshift(partieDe(troncon.slice(d, fin)));
		fin = d;
	}
	return parties;
}

/* ============================================================
   Questions d'une leçon (socle du critère 7).
   ============================================================ */

/** Taille d'une fiche du calcul mental HÉRITÉ (`LESSONS_CALCUL_MENTAL`) : 12 calculs pour
    presque toutes, 11 pour deux d'entre elles, dont la banque s'arrête de toute façon là
    (`questionsDuBilan` rend alors la banque entière). */
const QUESTIONS_FICHE_HERITEE = 12;

/** Questions à poser pour une leçon selon le réglage du bilan (Un peu / Moyen /
    Beaucoup / Tout) : le nombre réglé tel quel, ou, pour « Tout », autant que la fiche de
    la leçon — comme l'ancien bilan complet, qui en imprimait la fiche entière. */
export function nbQuestionsLecon(lesson: LessonDef, questionsPerLesson: number | 'all'): number {
	if (questionsPerLesson !== 'all') return questionsPerLesson;
	return isLegacyMathLesson(lesson) ? QUESTIONS_FICHE_HERITEE : QUESTIONS_PAR_FICHE;
}

/* Clé de DOUBLON d'une question : ce que l'enfant voit et doit trouver. L'ordre des choix,
   des tuiles ou des paires n'en fait pas partie — deux tirages qui ne diffèrent que par le
   mélange sont la même question posée deux fois. */
function cleQuestion(q: QuestionRevision): string {
	switch (q.kind) {
		case 'num':
			return [
				'num',
				q.item.text,
				String(q.item.answer),
				JSON.stringify(q.item.posed ?? null),
				q.item.figure?.balisage ?? '',
			].join('¦');
		case 'qcm':
			return ['qcm', q.item.text, String(q.item.answer), q.item.figure?.balisage ?? ''].join('¦');
		case 'tuile':
			return ['tuile', q.question, q.answer].join('¦');
		case 'ordre':
			return ['ordre', q.question, q.ordre.join('|')].join('¦');
		case 'tri':
			return [
				'tri',
				q.question,
				q.mots
					.map((m) => `${m.mot}:${m.cat}`)
					.sort()
					.join('|'),
			].join('¦');
		case 'appariement':
			return [
				'appariement',
				q.question,
				q.paires
					.map((p) => `${p.gauche}>${p.droite}`)
					.sort()
					.join('|'),
			].join('¦');
		case 'probleme':
			return [
				'probleme',
				q.enonce,
				q.etapes.map((e) => `${e.question}=${e.answer}`).join('|'),
				q.figure?.balisage ?? '',
			].join('¦');
		case 'clicMot':
			return ['clicMot', q.actionConsigne, q.tokens.join(' '), q.cibleIndices.join(',')].join('¦');
	}
}

/** Tirages consécutifs sans question nouvelle au bout desquels la banque est réputée
    épuisée. Assez pour qu'une banque courte soit rendue EN ENTIER — même une question rare
    finit par sortir —, sans coût notable : une leçon à grande banque n'y arrive jamais. */
const TIRAGES_SANS_NOUVEAUTE = 200;

/** `n` questions DISTINCTES d'une leçon, au niveau `level`, sous la forme de la révision
    espacée (`questionDeRevision`). Une banque plus courte que `n` est rendue en entier,
    chaque question une fois : une question répétée n'apprend rien de plus. */
export function questionsDuBilan(
	lesson: LessonDef,
	n: number,
	level: SchoolLevel,
): QuestionRevision[] {
	const questions: QuestionRevision[] = [];
	const vues = new Set<string>();
	let manques = 0;
	while (questions.length < n && manques < TIRAGES_SANS_NOUVEAUTE) {
		const q = questionDeRevision(lesson, level);
		const cle = q ? cleQuestion(q) : null;
		if (!q || cle === null || vues.has(cle)) {
			manques++;
			continue;
		}
		vues.add(cle);
		questions.push(q);
		manques = 0;
	}
	return questions;
}

/* ============================================================
   Le parcours d'un bilan (critère 8).
   ============================================================ */

/** Une partie du parcours : sa catégorie et ses questions, leçon après leçon. */
export interface PartieBilan {
	categoryId: string;
	questions: QuestionRevision[];
}

/** Leçons d'un bilan dans l'ordre du catalogue : catégories dans l'ordre de `CATEGORIES`,
    puis, dans une catégorie, l'ordre où l'écran de la catégorie les affiche (celui de la
    classe de la catégorie). Une leçon que cet écran ne montre pas (autre classe) vient
    après, dans l'ordre de déclaration. Une leçon inconnue du catalogue (favori ancien) est
    ignorée ; un id en double ne compte qu'une fois. */
export function leconsDuBilan(lessonIds: readonly string[]): LessonDef[] {
	const voulues = new Set(lessonIds);
	const lecons = getAllLessons().filter((l) => voulues.has(l.id));
	const rangCategorie = (l: LessonDef): number => {
		const r = CATEGORIES.findIndex((c) => c.id === l.category);
		return r < 0 ? CATEGORIES.length : r;
	};
	const rangs = new Map<string, number>();
	for (const cat of new Set(lecons.map((l) => l.category))) {
		const affichees = getLessonsByCategory(cat, classeDeCategorie(cat)).map((l) => l.id);
		const declarees = getLessonsByCategory(cat).map((l) => l.id);
		for (const l of lecons.filter((x) => x.category === cat)) {
			const a = affichees.indexOf(l.id);
			rangs.set(l.id, a >= 0 ? a : affichees.length + declarees.indexOf(l.id));
		}
	}
	return [...lecons].sort(
		(a, b) =>
			rangCategorie(a) - rangCategorie(b) || (rangs.get(a.id) ?? 0) - (rangs.get(b.id) ?? 0),
	);
}

/** Tire les questions d'un bilan et les range en parties. Chaque leçon est jouée au niveau
    où elle se joue ici (`niveauLecon`) ; une leçon qui ne sert aucune question est écartée.
    Le découpage se fait sur les tailles RÉELLES (une banque courte peut servir moins que
    demandé). */
export function construireParcours(config: BilanConfig): PartieBilan[] {
	return repartirEnParties(
		leconsDuBilan(config.lessonIds).flatMap((lesson) =>
			questionsDuBilan(
				lesson,
				nbQuestionsLecon(lesson, config.questionsPerLesson),
				niveauLecon(lesson),
			),
		),
	);
}

/** Range des questions déjà tirées en parties (`planifierParties`), dans l'ordre reçu :
    chaque série consécutive d'une même leçon est un bloc insécable, rattaché à la
    catégorie de sa leçon. Sert au parcours et à « Réviser mes erreurs », qui rejoue les
    questions ratées par le même découpage. */
export function repartirEnParties(questions: readonly QuestionRevision[]): PartieBilan[] {
	const series: { categoryId: string; questions: QuestionRevision[] }[] = [];
	let lessonId: string | null = null;
	for (const q of questions) {
		const derniere = series[series.length - 1];
		if (derniere && q.lessonId === lessonId) derniere.questions.push(q);
		else series.push({ categoryId: getLessonById(q.lessonId)?.category ?? '', questions: [q] });
		lessonId = q.lessonId;
	}
	// Le rang de la série sert d'identifiant au découpage : une même leçon revenue plus loin
	// reste un bloc distinct, et rien n'est réordonné.
	return planifierParties(
		series.map((s, n) => ({
			lessonId: String(n),
			categoryId: s.categoryId,
			nbQuestions: s.questions.length,
		})),
	).map((p) => ({
		categoryId: p.categoryId,
		questions: p.lessonIds.flatMap((n) => series[Number(n)].questions),
	}));
}

/* ============================================================
   Correction différée d'une question (critères 10 à 12).
   ============================================================ */

/** Réponse COLLECTÉE par l'écran, par format, sans aucun verdict. « Je passe » = `passe`.
    Les formes à widget reprennent celles que les widgets exposent déjà (`TuileReponse`,
    `selected()`), pour que l'écran les recopie sans les traduire. */
export type ReponseQuestion =
	| { kind: 'saisie'; valeur: string }
	| { kind: 'posee'; chiffres: string[] } // cellules à trouver, en ordre de lecture
	| { kind: 'choix'; valeur: string }
	| { kind: 'tuile'; posee: string | null }
	| { kind: 'ordre'; propose: string[] }
	| { kind: 'tri'; placement: Record<string, 0 | 1> }
	| { kind: 'appariement'; liens: { gauche: string; droite: string | null }[] }
	| { kind: 'probleme'; saisies: string[] }
	| { kind: 'clicMot'; indices: number[] }
	| { kind: 'passe' };

/** « Je passe » : la question reste sans réponse. */
export const PASSE: ReponseQuestion = { kind: 'passe' };

/** Le dessin d'une question, s'il y en a un : l'écran de fin de partie le remontre à côté
    de l'erreur, et le journal du parent signale qu'il y en avait un. */
export function figureDeQuestion(q: QuestionRevision): SafeHtml | undefined {
	if (q.kind === 'num' || q.kind === 'qcm') return q.item.figure;
	if (q.kind === 'probleme') return q.figure;
	return undefined;
}

/** Une erreur, mise en forme UNE fois pour l'écran de fin de partie et pour le journal du
    parent : l'énoncé lisible hors de l'exercice (sans `@` ni `**`), la réponse donnée et la
    bonne réponse. `sansTentative` : rien n'a été donné (question passée, case laissée
    vide, mot laissé sans thème ou sans lien, résultat d'une posée pas écrit), et `donnee`
    est alors VIDE — l'écran dit « Pas de réponse », le journal « n'a pas essayé ». Jamais
    un marqueur « (pas rangé) » ou « (incomplet) » affiché comme si c'était la réponse. */
export interface ErreurCorrigee {
	enonce: string;
	donnee: string;
	attendue: string;
	sansTentative?: boolean;
}

/** Verdict d'une question et ses erreurs ciblables : une par mot mal rangé, par paire mal
    reliée, par étape de problème fausse ; une seule pour une saisie, un choix, une
    opération posée ou une question passée. */
export interface Correction {
	reussi: boolean;
	erreurs: ErreurCorrigee[];
}

const JUSTE: Correction = { reussi: true, erreurs: [] };

/** Corrige une réponse collectée par les règles déjà en place, format par format. Une
    réponse vide (rien posé) ou d'un format qui n'est pas celui de la question compte comme
    une question passée : fausse, une seule erreur, sans réponse donnée. */
export function corrigerQuestion(q: QuestionRevision, r: ReponseQuestion): Correction {
	if (r.kind === 'passe' || reponseVide(r)) return passee(q);
	switch (q.kind) {
		case 'num':
			if (q.item.kind === 'posed' && q.item.posed)
				return r.kind === 'posee' ? corrigerPosee(q, q.item.posed, r.chiffres) : passee(q);
			if (r.kind !== 'saisie') return passee(q);
			return checkItemAnswer(q.item, r.valeur)
				? JUSTE
				: fausse(q, reponseLisible(r.valeur.trim()), attendueItem(q.item));
		case 'qcm':
			if (r.kind !== 'choix') return passee(q);
			return checkItemAnswer(q.item, r.valeur)
				? JUSTE
				: fausse(q, libelleQcm(q, r.valeur), libelleQcm(q, String(q.item.answer)));
		case 'tuile':
			if (r.kind !== 'tuile' || r.posee === null) return passee(q);
			return tuileJuste(r.posee, q.answer)
				? JUSTE
				: fausse(q, reponseLisible(r.posee), attendueQuestion(q));
		case 'ordre': {
			if (r.kind !== 'ordre') return passee(q);
			if (ordreJuste(r.propose, q.ordre)) return JUSTE;
			const { donnee, attendue } = ordreErreur(r.propose, q.ordre, q.nature);
			return fausse(q, donnee, attendue);
		}
		case 'tri':
			if (r.kind !== 'tri') return passee(q);
			return triJuste(q.mots, r.placement) ? JUSTE : erreursTri(q, r.placement);
		case 'appariement':
			if (r.kind !== 'appariement') return passee(q);
			return appariementJuste(q.paires, r.liens) ? JUSTE : erreursAppariement(q, r.liens);
		case 'probleme': {
			if (r.kind !== 'probleme') return passee(q);
			const erreurs = entreesEtapesPassees(q.etapes, r.saisies).map((e): ErreurCorrigee => ({
				enonce: lisible(enonceEtapeLisible(q.enonce, e.etape.question)),
				donnee: e.donnee,
				attendue: attenduEtapeTexte(e.etape.answer, e.etape.unite),
				...(e.sansTentative ? { sansTentative: true } : {}),
			}));
			return { reussi: erreurs.length === 0, erreurs };
		}
		case 'clicMot': {
			if (r.kind !== 'clicMot') return passee(q);
			if (motsChoisisJustes(r.indices, q.cibleIndices, q.tokens.length)) return JUSTE;
			const choisis = [...new Set(r.indices)]
				.filter((i) => i >= 0 && i < q.tokens.length)
				.sort((a, b) => a - b);
			return fausse(q, libelleCible(q.tokens, choisis), attendueQuestion(q));
		}
	}
}

/* Rien de posé : la réponse vaut une question passée. */
function reponseVide(r: ReponseQuestion): boolean {
	switch (r.kind) {
		case 'saisie':
		case 'choix':
			return r.valeur.trim() === '';
		case 'posee':
			return r.chiffres.every((c) => c.trim() === '');
		case 'tuile':
			return r.posee === null || r.posee === '';
		case 'ordre':
			return r.propose.length === 0;
		case 'tri':
			return Object.keys(r.placement).length === 0;
		case 'appariement':
			return r.liens.every((l) => l.droite === null);
		case 'probleme':
			return r.saisies.every((s) => s.trim() === '');
		case 'clicMot':
			return r.indices.length === 0;
		case 'passe':
			return true;
	}
}

function passee(q: QuestionRevision): Correction {
	return {
		reussi: false,
		erreurs: [
			{ enonce: enonceQuestion(q), donnee: '', attendue: attendueQuestion(q), sansTentative: true },
		],
	};
}

function fausse(q: QuestionRevision, donnee: string, attendue: string): Correction {
	return { reussi: false, erreurs: [{ enonce: enonceQuestion(q), donnee, attendue }] };
}

/* Une partie de la question laissée sans réponse (mot sans thème, mot sans lien, résultat
   pas écrit) : une non-tentative, comme une question passée, mais ciblée sur cette partie. */
function erreurRienDonne(enonce: string, attendue: string): ErreurCorrigee {
	return { enonce, donnee: '', attendue, sansTentative: true };
}

/* Énoncé lisible hors de l'exercice : sans le gras `**…**` (le mot reste, ses marques
   partent), le trou `@` devenu « … » (`questionPourJournal`). Le marqueur « exercice avec
   dessin » n'y est PAS : l'écran de fin de partie montre le dessin, et le journal l'ajoute
   lui-même à partir de la figure (`capterErreur`). */
function lisible(texte: string): string {
	return questionPourJournal(texte.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*\*/g, ''));
}

/** Énoncé d'une question, lisible hors de l'exercice (écran de fin de partie, journal). */
export function enonceQuestion(q: QuestionRevision): string {
	switch (q.kind) {
		case 'num': {
			if (q.item.posed) return dispositionPosee(q.item.posed).operation;
			const t = lisible(q.item.text);
			if (t) return t;
			return q.item.figure?.balisage
				? questionPourJournal('', true)
				: (q.consigneAction ?? libelleRepli(q.lessonId));
		}
		case 'qcm':
			return lisible(q.item.text) || (q.consigneRenforcee ?? libelleRepli(q.lessonId));
		case 'tuile':
		case 'ordre':
		case 'tri':
		case 'appariement':
			return lisible(q.question) || libelleRepli(q.lessonId);
		case 'probleme':
			return lisible(enonceProblemeLisible({ enonce: q.enonce, etapes: q.etapes }));
		case 'clicMot':
			return enonceClicMotJournal({ consigne: q.actionConsigne, tokens: q.tokens });
	}
}

/* Dernier recours d'un énoncé vide : le titre de la leçon, plutôt qu'une ligne blanche. */
function libelleRepli(lessonId: string): string {
	const l = getLessonById(lessonId);
	return l ? labelLecon(l, niveauLecon(l)) : 'Question';
}

/** Bonne réponse d'une question, lisible : la bande d'une intercalation, le libellé d'un
    choix, le signe nommé, la suite rangée, le classement, les paires, les réponses des
    étapes, les mots à toucher. */
export function attendueQuestion(q: QuestionRevision): string {
	switch (q.kind) {
		case 'num':
			return attendueItem(q.item);
		case 'qcm':
			return libelleQcm(q, String(q.item.answer));
		case 'tuile':
			return q.intervalle ? attendueIntervalle(q.intervalle) : reponseLisible(q.answer);
		case 'ordre':
			return ordreErreur([], q.ordre, q.nature).attendue;
		case 'tri':
			return ([0, 1] as const)
				.map(
					(col) =>
						`${q.categories[col]} : ${q.mots
							.filter((m) => m.cat === col)
							.map((m) => m.mot)
							.join(', ')}`,
				)
				.join(' ; ');
		case 'appariement':
			return pairesErreur(
				q.paires.map((p) => ({ gauche: p.gauche, droite: null })),
				q.paires,
			).attendue;
		case 'probleme':
			return etapesLisibles(q.etapes.map((e) => attenduEtapeTexte(e.answer, e.unite)));
		case 'clicMot':
			return libelleCible(q.tokens, q.cibleIndices);
	}
}

/* Libellé d'un choix de QCM : le MOT d'un signe de ponctuation (un « . » nu ne se lit
   pas), sinon le libellé de la vue riche (« trois quarts », pas « 3/4 »), sinon le choix. */
function libelleQcm(q: Extract<QuestionRevision, { kind: 'qcm' }>, valeur: string): string {
	if (q.variante === 'ponctuation') return PONCT_MOTS[valeur] ?? valeur;
	return libelleChoix(q.choices, q.choicesView, valeur);
}

/* Opération posée : TOUTES les cellules à trouver (produits partiels compris) doivent être
   justes, comme en révision (`grillePoseeJuste`, la même règle). Une seule erreur pour l'opération, jamais une par chiffre :
   l'énoncé est l'opération, la bonne réponse son résultat, la réponse donnée le résultat
   écrit — ou, quand le résultat est juste mais une autre ligne fausse, ce même résultat
   avec la précision qui dit où est la faute, sans jargon (« produit partiel » n'est pas un
   mot de CE2). Un résultat pas écrit en entier est une non-tentative : l'enfant n'a pas
   donné de résultat. */
function corrigerPosee(
	q: QuestionRevision,
	spec: PosedSpec,
	chiffres: readonly string[],
): Correction {
	const cellules = dispositionPosee(spec).rangees.flatMap((r) =>
		r.cellules.flatMap((c) => (c.role === 'saisie' ? [c] : [])),
	);
	const donne = (i: number): string => (chiffres[i] ?? '').trim();
	const juste = (i: number): boolean => chiffrePoseJuste(donne(i), cellules[i].chiffre);
	if (
		grillePoseeJuste(
			chiffres,
			cellules.map((c) => c.chiffre),
		)
	)
		return JUSTE;
	const resultat = cellules.map((c, i) => ({ c, i })).filter(({ c }) => c.resultat !== undefined);
	const attendue = attendueItem({ answer: String(dispositionPosee(spec).resultat) });
	if (resultat.some(({ i }) => donne(i) === ''))
		return { reussi: false, erreurs: [erreurRienDonne(enonceQuestion(q), attendue)] };
	const resultatEcrit = resultat.map(({ i }) => donne(i)).join('');
	const resultatJuste = resultat.every(({ i }) => juste(i));
	return fausse(
		q,
		resultatJuste ? `${resultatEcrit} (une ligne du calcul est fausse)` : resultatEcrit,
		attendue,
	);
}

/* Erreurs d'un tri jugé faux (`triJuste`) : une par mot mal rangé (`motsMalClasses`) ou
   laissé hors des thèmes, qui nomme le mot et son bon thème. Un mot laissé hors des
   thèmes n'a pas de réponse : non-tentative. */
function erreursTri(
	q: Extract<QuestionRevision, { kind: 'tri' }>,
	placement: Readonly<Record<string, 0 | 1>>,
): Correction {
	const erreurs: ErreurCorrigee[] = [];
	const malRanges = new Map(
		motsMalClasses(q.mots, q.categories, { ...placement }).map((m) => [m.mot, m]),
	);
	for (const m of q.mots) {
		const mal = malRanges.get(m.mot);
		if (mal) erreurs.push({ enonce: enonceTri(m.mot), donnee: mal.donnee, attendue: mal.attendue });
		else if (placement[m.mot] === undefined)
			erreurs.push(erreurRienDonne(enonceTri(m.mot), q.categories[m.cat]));
	}
	return { reussi: false, erreurs };
}

/* Même énoncé que la révision et le runner de leçon pour un mot mal rangé. */
const enonceTri = (mot: string): string => `Ranger le mot « ${mot} »`;

/* Erreurs d'un appariement jugé faux (`appariementJuste`, qui dit pourquoi la règle n'exige
   pas de bijection) : une par mot de gauche mal relié, mise en forme par `pairesErreur`
   sur ce seul lien ; un mot sans lien (ou absent des liens) est une non-tentative. */
function erreursAppariement(
	q: Extract<QuestionRevision, { kind: 'appariement' }>,
	liens: readonly { gauche: string; droite: string | null }[],
): Correction {
	const question = lisible(q.question);
	const erreurs: ErreurCorrigee[] = [];
	for (const p of q.paires) {
		const droite = liens.find((l) => l.gauche === p.gauche)?.droite ?? null;
		if (droite === p.droite) continue;
		const enonce = `${question} « ${p.gauche} »`;
		const { donnee, attendue } = pairesErreur([{ gauche: p.gauche, droite }], q.paires);
		erreurs.push(
			droite === null ? erreurRienDonne(enonce, attendue) : { enonce, donnee, attendue },
		);
	}
	return { reussi: false, erreurs };
}

/* ============================================================
   Synthèse par leçon et règle des 60 % (critères 10, 13, 15).
   ============================================================ */

/** Ce qu'une leçon a donné dans le bilan : questions posées, répondues (non passées),
    réussies, et son verdict. */
export interface BilanLecon {
	lessonId: string;
	posees: number;
	repondues: number;
	reussies: number;
	verdict: VerdictLecon;
}

/** Synthèse par leçon, dans l'ordre où les leçons ont été jouées. `resultats` est aligné
    sur `questions`. */
export function syntheseParLecon(
	questions: readonly QuestionRevision[],
	resultats: readonly { reussi: boolean; repondue: boolean }[],
): BilanLecon[] {
	const parLecon = new Map<string, BilanLecon>();
	questions.forEach((q, i) => {
		let b = parLecon.get(q.lessonId);
		if (!b) {
			b = { lessonId: q.lessonId, posees: 0, repondues: 0, reussies: 0, verdict: 'reussi' };
			parLecon.set(q.lessonId, b);
		}
		b.posees++;
		if (resultats[i]?.repondue) b.repondues++;
		if (resultats[i]?.reussi) b.reussies++;
	});
	return [...parLecon.values()].map((b) => ({ ...b, verdict: verdictLecon(b.reussies, b.posees) }));
}

/** Lignes du récapitulatif : réussi, puis presque, puis à retravailler ; l'ordre de jeu
    est gardé à verdict égal. */
export function trierParVerdict(lignes: readonly BilanLecon[]): BilanLecon[] {
	return [...lignes].sort((a, b) => RANG_VERDICT[a.verdict] - RANG_VERDICT[b.verdict]);
}

/** Réponses à donner, au moins, pour que le bilan compte : 60 % des questions (règle de la
    fiche, `ui/session.ts`), arrondi au-dessus, en arithmétique entière. */
export function minimumReponses(total: number): number {
	return Math.ceil((3 * total) / 5);
}

/** Le bilan compte-t-il ? Au moins 60 % des questions ont une réponse (question passée =
    sans réponse). */
export function assezDeReponses(repondues: number, total: number): boolean {
	return total > 0 && repondues >= minimumReponses(total);
}

/* ============================================================
   Phrases du parcours (spécification de rendu, §6) : à compteur, donc ici, testables
   sur 0, 1, 2 et n sur n.
   ============================================================ */

/** « Partie 2 sur 3 ». */
export const libellePartieSur = (k: number, n: number): string => `Partie ${k} sur ${n}`;

/** « Question 4 sur 12 ». */
export const libelleQuestionSur = (i: number, m: number): string => `Question ${i} sur ${m}`;

/** Jauge du bilan, pour l'oreille (`aria-valuetext`) : « 0 question faite sur 12 »,
    « 1 question faite sur 12 », « 3 questions faites sur 12 ». Singulier à 0 et à 1. */
export function libelleAvancee(faites: number, total: number): string {
	return faites < 2
		? `${faites} question faite sur ${total}`
		: `${faites} questions faites sur ${total}`;
}

/** « Partie 2 terminée ». */
export const libellePartieTerminee = (k: number): string => `Partie ${k} terminée`;

/** Réussites d'une partie : « 1 réussite », « 7 réussites », « Aucune réussite cette fois ». */
export function libelleReussites(n: number): string {
	if (n === 0) return 'Aucune réussite cette fois';
	return n === 1 ? '1 réussite' : `${n} réussites`;
}

/** Score brut d'une leçon, tel qu'affiché : « 4 sur 5 ». */
export const libelleScore = (reussies: number, posees: number): string =>
	`${reussies} sur ${posees}`;

/** Le même score, pour l'oreille : « 4 questions réussies sur 5 ». */
export function libelleScoreLu(reussies: number, posees: number): string {
	if (reussies === 0) return `Aucune question réussie sur ${posees}`;
	if (reussies === 1) return `1 question réussie sur ${posees}`;
	return `${reussies} questions réussies sur ${posees}`;
}

/** Dernière ligne du récapitulatif : le nombre de leçons réussies, jamais un pourcentage.
    Aucune réussie : on dit l'effort et la suite, pas l'échec. */
export function libelleTotalRecap(reussies: number, total: number): string {
	if (reussies === 0)
		return total === 1
			? 'Tu as essayé 1 leçon. On la reprend.'
			: `Tu as essayé ${total} leçons. On les reprend une par une.`;
	if (reussies === total)
		return total === 1
			? 'Tu as réussi la leçon. Bravo !'
			: `Tu as réussi les ${total} leçons. Bravo !`;
	return reussies === 1
		? `Tu as réussi 1 leçon sur ${total}.`
		: `Tu as réussi ${reussies} leçons sur ${total}.`;
}

/** Bilan qui ne compte pas (règle des 60 %) : ce qu'il aurait fallu, en questions, sans
    pourcentage. */
export function libelleSeuilNonAtteint(total: number): string {
	const min = minimumReponses(total);
	return `Pour que ton bilan compte, réponds à au moins ${min} question${min > 1 ? 's' : ''} sur ${total}.`;
}

/** Textes FIXES des écrans du parcours, avec les phrases à compteur : un seul endroit où
    les relire (relecture langue) et les tester, l'écran ne fait que les poser. */
export const TEXTES_PARCOURS = {
	/** « Valider » touché avant d'avoir répondu (écran de question). */
	reponseAttendue: "Réponds d'abord, ou touche « Je passe ».",
	/** Fin de partie : titre de la liste des erreurs, ou phrase quand il n'y en a pas. */
	aRevoir: 'À revoir',
	aucuneErreur: 'Aucune erreur dans cette partie. Bravo !',
	/** Une erreur sans tentative (question passée, partie laissée vide). */
	pasDeReponse: 'Pas de réponse',
	/** Amorces d'une erreur : la réponse donnée, puis la bonne, toujours dans cet ordre. */
	taReponse: 'Ta réponse :',
	bonneReponse: 'La bonne réponse :',
} as const;

/** Titre de l'écran de question : le nom du bilan, ou celui de la révision des erreurs. */
export const libelleTitreParcours = (rejeu: boolean, nomBilan: string): string =>
	rejeu ? 'Révision — tes erreurs' : nomBilan;

/** Titre du récapitulatif : « Ton bilan », ou « Révision terminée » après le rejeu. */
export const libelleTitreRecap = (rejeu: boolean): string =>
	rejeu ? 'Révision terminée' : 'Ton bilan';

/* ============================================================
   Navigation dans le parcours (écran, reprise).
   ============================================================ */

/** Rang global de la 1re question de chaque partie. */
export function debutsDesParties(parties: readonly PartieBilan[]): number[] {
	const debuts: number[] = [];
	let n = 0;
	for (const p of parties) {
		debuts.push(n);
		n += p.questions.length;
	}
	return debuts;
}

/** Position (partie, question dans la partie) d'un rang global ; `null` au-delà de la fin. */
export function positionDuRang(
	parties: readonly PartieBilan[],
	rang: number,
): { partie: number; question: number } | null {
	let reste = rang;
	for (let k = 0; k < parties.length; k++) {
		if (reste < parties[k].questions.length) return { partie: k, question: reste };
		reste -= parties[k].questions.length;
	}
	return null;
}

/** Rang global de la première question sans réponse (`reponses` aligné sur le parcours),
    ou le nombre total de questions si toutes en ont une. */
export function premiereSansReponse(reponses: readonly (ReponseQuestion | null)[]): number {
	const i = reponses.findIndex((r) => r === null);
	return i < 0 ? reponses.length : i;
}
