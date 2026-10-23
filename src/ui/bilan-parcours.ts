/* ============================================================
   Bilan en PARCOURS guidé (#777) — état, correction, crédit.
   ------------------------------------------------------------
   Tout bilan joué à l'écran passe par ici (configurateur, favoris, « Bilan express » et
   « Bilan complet » de catégorie, programme du jour) ; la page unique ne sert plus qu'à
   l'impression. Trois écrans, dans `#sheets`, chacun dans son module :

   A. une QUESTION par écran (`bilan-parcours-question.ts`), en mode COLLECTE : aucune
      marque juste/faux ; « Je passe » laisse la question sans réponse ;
   B. la FIN DE PARTIE (`bilan-parcours-recap.ts`) : c'est là, et seulement là, que la
      partie est corrigée et que ses erreurs partent au journal du parent (#391) ;
   C. le RÉCAPITULATIF (`bilan-parcours-recap.ts`), puis les modales de récompense.

   Ce module tient ce qui ne s'affiche pas : l'état du parcours, le lancement, la reprise
   (`runner-reprise.ts`), la correction de chaque partie, le journal et le crédit (UNE
   fois, à la correction de la dernière partie). Toute la logique (tirage, découpage,
   correction, verdict, phrases) vit dans `core/bilan-parcours.ts`.
   ============================================================ */
import { CATEGORIES, type BilanConfig } from '../core/catalog';
import type { QuestionRevision } from '../core/revision-question';
import type { ResumeParcours } from '../core/resume';
import {
	assezDeReponses,
	construireParcours,
	corrigerQuestion,
	debutsDesParties,
	figureDeQuestion,
	libelleSeuilNonAtteint,
	PASSE,
	positionDuRang,
	premiereSansReponse,
	repartirEnParties,
	syntheseParLecon,
	trierParVerdict,
	type Correction,
	type ErreurCorrigee,
	type PartieBilan,
	type ReponseQuestion,
} from '../core/bilan-parcours';
import { questionPourJournal } from '../core/erreur-representation';
import { recordLessonRun, type LessonRunOutcome } from '../core/lesson-run';
import {
	goHome,
	hideMenus,
	setCurrentFavoriId,
	setCurrentLessonId,
	setCurrentMode,
	setToolbar,
} from './navigation';
import type { ResumeCtx } from './resume';
import {
	declarerSessionParcours,
	enregistrerParcours,
	finirSessionParcours,
	quitterSessionRunner,
} from './runner-reprise';
import { capterErreur } from './erreur-capture';
import { capterPasse } from './revelation-neutre';
import { resetChrono } from './chrono';
import { afficherQuestion } from './bilan-parcours-question';
import { afficherFinPartie, afficherRecap } from './bilan-parcours-recap';

/** Nom stable du parcours dans le registre de reprise (`runner-reprise.ts`). */
const RUNNER = 'bilan-parcours';

/* ---------- État du parcours en cours ---------- */

interface EtatParcours {
	config: BilanConfig;
	/** Contexte de reprise du bilan, `null` quand il ne se reprend pas (classe choisie, #772). */
	ctx: ResumeCtx | null;
	/** « Réviser mes erreurs » : on rejoue les questions ratées, sans crédit, sans journal
	    ni reprise — comme l'ancienne reprise des erreurs (`runRevision`). */
	rejeu: boolean;
	parties: PartieBilan[];
	/** Réponse de chaque question, au rang global ; `null` = pas encore traitée. */
	reponses: (ReponseQuestion | null)[];
	/** Parties déjà corrigées (journal écrit) : ni re-corrigées ni re-journalisées. */
	partiesCorrigees: number;
	/** Temps passé avant la session courante (reprise), et début de celle-ci. */
	ecouleMs: number;
	debutMs: number;
	/** Gains du crédit (bilan clos et compté) À ANNONCER, ou `null` : consommés par
	    l'annonce du récapitulatif, pour qu'une modale ne s'ouvre jamais deux fois. */
	credit: LessonRunOutcome | null;
	/** Le bilan est-il compté (règle des 60 %) ? `null` tant qu'il n'est pas clos. */
	compte: boolean | null;
}

let etat: EtatParcours | null = null;

/* Questions de toutes les parties, à plat (le rang global de chacune est son index). */
const toutesLesQuestions = (e: EtatParcours): QuestionRevision[] =>
	e.parties.flatMap((p) => p.questions);

/* Mode d'enregistrement d'un bilan, inchangé (#35) : « complet » quand toutes les
   questions sont demandées, « express » sinon. */
const modeBilan = (config: BilanConfig): 'complet' | 'express' =>
	config.questionsPerLesson === 'all' ? 'complet' : 'express';

const corriger = (q: QuestionRevision, r: ReponseQuestion | null): Correction =>
	corrigerQuestion(q, r ?? PASSE);

/* Résultat de chaque question du parcours, au rang global : juste ou non, répondue ou
   passée (une question pas encore traitée compte comme passée). Le SEUL calcul, pour la
   reprise, le crédit et le récapitulatif. */
function resultatsDe(e: EtatParcours): { reussi: boolean; repondue: boolean }[] {
	return toutesLesQuestions(e).map((q, i) => ({
		reussi: corriger(q, e.reponses[i]).reussi,
		repondue: (e.reponses[i]?.kind ?? 'passe') !== 'passe',
	}));
}

/* ---------- Lancement, reprise ---------- */

/** Lance le parcours d'un bilan. `ctx` : contexte de reprise (`null` = pas de reprise). */
export function lancerParcours(config: BilanConfig, ctx: ResumeCtx | null): void {
	const parties = construireParcours(config);
	if (!parties.length) return;
	demarrer({
		config,
		ctx,
		rejeu: false,
		parties,
		reponses: parties.flatMap((p) => p.questions.map(() => null)),
		partiesCorrigees: 0,
		ecouleMs: 0,
		debutMs: Date.now(),
		credit: null,
		compte: null,
	});
}

/* État sauvegardé avec l'instantané, en plus des parties (`questions`) et du rang (`idx`). */
interface EtatSauve {
	reponses: (ReponseQuestion | null)[];
	partiesCorrigees: number;
	ecouleMs: number;
}

/* Forme des parties relues d'un instantané (aller-retour JSON) : de quoi rejouer. Le
   contenu des questions est celui que ce même écran a écrit. */
function partiesRelues(x: unknown): x is PartieBilan[] {
	return (
		Array.isArray(x) &&
		x.length > 0 &&
		x.every(
			(p) =>
				typeof p === 'object' &&
				p !== null &&
				'categoryId' in p &&
				typeof p.categoryId === 'string' &&
				'questions' in p &&
				Array.isArray(p.questions),
		)
	);
}

function etatRelu(x: unknown, total: number): x is EtatSauve {
	return (
		typeof x === 'object' &&
		x !== null &&
		'reponses' in x &&
		Array.isArray(x.reponses) &&
		x.reponses.length === total &&
		'partiesCorrigees' in x &&
		typeof x.partiesCorrigees === 'number' &&
		'ecouleMs' in x &&
		typeof x.ecouleMs === 'number'
	);
}

/* Reprise (#777, critère 16) : on rejoue les questions DÉJÀ TIRÉES avec les réponses déjà
   données et les parties déjà corrigées ; l'écran rouvre la première question sans
   réponse. L'instantané a fait un aller-retour JSON (déjà revivifié par
   `restaurerRunner`) : sa forme est celle que `etatPhotographie` a écrite. Une forme
   inattendue (instantané d'une autre version) rend la main à l'accueil. */
enregistrerParcours(RUNNER, (snap: ResumeParcours) => {
	const parties = snap.questions;
	const total = partiesRelues(parties) ? parties.reduce((s, p) => s + p.questions.length, 0) : 0;
	const sauve = snap.parcours;
	if (!partiesRelues(parties) || !total || !etatRelu(sauve, total)) {
		goHome();
		return;
	}
	demarrer({
		config: snap.relaunch.config,
		ctx: {
			key: snap.key,
			mode: snap.mode,
			label: snap.label,
			icon: snap.icon,
			categoryId: snap.categoryId,
			relaunch: snap.relaunch,
		},
		rejeu: false,
		parties,
		reponses: sauve.reponses,
		partiesCorrigees: sauve.partiesCorrigees,
		ecouleMs: sauve.ecouleMs,
		debutMs: Date.now(),
		credit: null,
		compte: null,
	});
});

function demarrer(e: EtatParcours): void {
	etat = e;
	setCurrentMode(e.rejeu ? 'revision' : modeBilan(e.config));
	setCurrentLessonId(null);
	setCurrentFavoriId(e.rejeu ? null : e.config.id || null);
	hideMenus();
	// Ni « Vérifier » ni chrono (critère 17) : la correction est celle de la fin de partie,
	// et le temps se mesure sans s'afficher.
	setToolbar({ verify: false, home: true, profile: false });
	resetChrono();
	if (e.ctx && !e.rejeu)
		declarerSessionParcours({
			runner: RUNNER,
			identite: {
				key: e.ctx.key,
				mode: e.ctx.mode,
				label: e.ctx.label,
				icon: e.ctx.icon,
				categoryId: e.ctx.categoryId,
				config: e.config,
			},
			etat: () => etatPhotographie(e),
		});
	else quitterSessionRunner();
	afficherEcranCourant();
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Ce que la reprise photographie, relu à l'instant de la photo. */
function etatPhotographie(e: EtatParcours) {
	const sauve: EtatSauve = {
		reponses: e.reponses,
		partiesCorrigees: e.partiesCorrigees,
		ecouleMs: e.ecouleMs + (Date.now() - e.debutMs),
	};
	const idx = premiereSansReponse(e.reponses);
	return {
		parties: e.parties,
		idx,
		total: e.reponses.length,
		score: resultatsDe(e)
			.slice(0, idx)
			.filter((r) => r.reussi).length,
		parcours: sauve,
	};
}

/* Écran à montrer d'après l'état : la première question sans réponse, la fin d'une partie
   répondue mais pas encore corrigée, ou le récapitulatif. */
function afficherEcranCourant(): void {
	const e = etat;
	if (!e) return;
	const rang = premiereSansReponse(e.reponses);
	const pos = positionDuRang(e.parties, rang);
	if (pos && pos.partie <= e.partiesCorrigees) {
		montrerQuestion(pos.partie, pos.question);
		return;
	}
	const aCorriger = pos ? pos.partie - 1 : e.parties.length - 1;
	if (aCorriger >= e.partiesCorrigees) {
		corrigerPartie(aCorriger);
		montrerFinPartie(aCorriger);
		return;
	}
	montrerRecap();
}

/* ---------- Les trois écrans, alimentés par l'état ---------- */

function montrerQuestion(k: number, i: number): void {
	const e = etat!;
	const partie = e.parties[k];
	afficherQuestion({
		nomBilan: e.config.label,
		rejeu: e.rejeu,
		categorie: CATEGORIES.find((c) => c.id === partie.categoryId)?.label ?? '',
		partie: { numero: k + 1, total: e.parties.length },
		question: { numero: i + 1, total: partie.questions.length },
		avancee: { faites: premiereSansReponse(e.reponses), total: e.reponses.length },
		q: partie.questions[i],
		repondre: enregistrer,
	});
}

function montrerFinPartie(k: number): void {
	const e = etat!;
	const debut = debutsDesParties(e.parties)[k];
	const derniere = k === e.parties.length - 1;
	afficherFinPartie({
		numero: k + 1,
		derniere,
		corrections: e.parties[k].questions.map((q, i) => ({
			q,
			c: corriger(q, e.reponses[debut + i]),
		})),
		continuer: () => (derniere ? montrerRecap() : montrerQuestion(k + 1, 0)),
	});
}

function montrerRecap(): void {
	const e = etat!;
	quitterSessionRunner(); // plus rien à photographier (bilan clos, ou révision des erreurs)
	const questions = toutesLesQuestions(e);
	const resultats = resultatsDe(e);
	const ratees = questions.filter((_, i) => !resultats[i].reussi);
	// Gains consommés : un récapitulatif réaffiché ne rouvre pas la modale.
	const gains = e.credit;
	e.credit = null;
	afficherRecap({
		rejeu: e.rejeu,
		lignes: trierParVerdict(syntheseParLecon(questions, resultats)),
		seuil: !e.rejeu && e.compte === false ? libelleSeuilNonAtteint(questions.length) : null,
		reviser: ratees.length ? () => revoirErreurs(ratees) : null,
		gains,
	});
}

/* Range la réponse de la question affichée, puis passe à la suivante, ou corrige la partie
   quand c'était sa dernière question. */
function enregistrer(r: ReponseQuestion): void {
	const e = etat;
	if (!e) return;
	const rang = premiereSansReponse(e.reponses);
	const pos = positionDuRang(e.parties, rang);
	if (!pos) return;
	e.reponses[rang] = r;
	if (pos.question + 1 < e.parties[pos.partie].questions.length) {
		montrerQuestion(pos.partie, pos.question + 1);
		return;
	}
	corrigerPartie(pos.partie);
	montrerFinPartie(pos.partie);
}

/* ---------- Correction d'une partie : journal, crédit ---------- */

/* Corrige la partie `k` UNE fois : ses erreurs partent au journal du parent, et la
   dernière partie clôt le bilan (crédit). Une partie déjà corrigée (reprise) ne refait
   rien. */
function corrigerPartie(k: number): void {
	const e = etat!;
	if (k < e.partiesCorrigees) return;
	e.partiesCorrigees = k + 1;
	if (e.rejeu) return; // révision des erreurs : déjà journalisées, rien à créditer
	const debut = debutsDesParties(e.parties)[k];
	e.parties[k].questions.forEach((q, i) => {
		for (const err of corriger(q, e.reponses[debut + i]).erreurs) journaliser(q, err);
	});
	if (k === e.parties.length - 1) cloreBilan();
}

/* Journal du parent (#391) : une entrée par erreur ciblable, avec la leçon, l'énoncé
   lisible et les deux réponses ; une question passée suit la convention « n'a pas
   essayé » (`capterPasse`). Le dessin éventuel est signalé par le journal lui-même. */
function journaliser(q: QuestionRevision, err: ErreurCorrigee): void {
	const mode = modeBilan(etat!.config);
	const figure = figureDeQuestion(q);
	// Un énoncé qui n'est QUE « Exercice avec un dessin » le dit déjà : pas de double marque.
	const avecFigure = figure && err.enonce !== questionPourJournal('', true) ? figure : undefined;
	if (err.sansTentative && err.donnee === '') {
		capterPasse({
			text: err.enonce,
			figure: avecFigure,
			attendue: err.attendue,
			lessonId: q.lessonId,
			mode,
		});
		return;
	}
	capterErreur({
		text: err.enonce,
		figure: avecFigure,
		donnee: err.donnee,
		attendue: err.attendue,
		lessonId: q.lessonId,
		mode,
		sansTentative: err.sansTentative,
	});
}

/* Clôture du bilan, après la correction de sa dernière partie : crédité UNE fois (critère
   15, N4) s'il compte (règle des 60 %), avec les stats par leçon et l'id du favori ; la
   reprise est effacée. */
function cloreBilan(): void {
	const e = etat!;
	const questions = toutesLesQuestions(e);
	const resultats = resultatsDe(e);
	const repondues = resultats.filter((r) => r.repondue).length;
	e.compte = assezDeReponses(repondues, questions.length);
	if (e.compte) {
		// Même agrégat que la fiche (`scoreItems`) : par leçon, les réussites sur les questions
		// RÉPONDUES ; une question passée ne compte que dans le total du bilan.
		const perLesson: Record<string, { ok: number; total: number }> = {};
		for (const b of syntheseParLecon(questions, resultats))
			perLesson[b.lessonId] = { ok: b.reussies, total: b.repondues };
		e.credit = recordLessonRun({
			mode: modeBilan(e.config),
			lessonId: null,
			ok: resultats.filter((r) => r.reussi).length,
			questionCount: questions.length,
			ms: e.ecouleMs + (Date.now() - e.debutMs),
			perLesson,
			favoriId: e.config.id || undefined,
		});
	}
	finirSessionParcours();
}

/* « Réviser mes erreurs » (critère 14) : les questions ratées du bilan, rejouées avec le
   même parcours (parties, correction en fin de partie, récapitulatif), sans crédit, sans
   journal ni reprise. */
function revoirErreurs(ratees: QuestionRevision[]): void {
	const e = etat;
	if (!e || !ratees.length) return;
	const parties = repartirEnParties(ratees);
	demarrer({
		config: e.config,
		ctx: null,
		rejeu: true,
		parties,
		reponses: ratees.map(() => null),
		partiesCorrigees: 0,
		ecouleMs: 0,
		debutMs: Date.now(),
		credit: null,
		compte: null,
	});
}
