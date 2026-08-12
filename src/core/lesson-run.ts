/* ============================================================
   Enregistrement d'un essai d'exercice (leçon ou bilan), commun à tous
   les modes de rendu (fiche en saisie, runner QCM…). Centralisé ici pour
   garantir la PARITÉ : quel que soit le mode choisi, un même résultat
   produit les mêmes XP, étoiles, objectifs et trophées (#69).
   Logique pure (pas de DOM) ; l'appelant gère l'affichage et le garde
   « un seul enregistrement par essai ».
   ============================================================ */
import {
	updateStreak,
	recordLessonStats,
	recordLessonResult,
	recordEssaiLecon,
	recordRun,
	addXP,
	getXP,
	niveauDepuisXP,
} from './progress';
import { updateGoal, evaluateTrophies } from './rewards';
import type { Trophy } from './rewards';
import { recompensesEntre } from './unlocks';
import type { Recompense } from './unlocks';

export interface LessonRunInput {
	mode: string; // mode d'enregistrement : 'lecon' | 'express' | 'complet' …
	lessonId: string | null; // leçon concernée (mode 'lecon')
	ok: number; // bonnes réponses
	questionCount: number; // nombre de questions posées
	ms: number; // temps écoulé (classement des bilans)
	perLesson: Record<string, { ok: number; total: number }>; // stats agrégées par leçon
}

export interface LessonRunOutcome {
	starInfo: { perfect: boolean; newStar: boolean; count: number } | null; // mode 'lecon'
	streakDays: number;
	goalRes: ReturnType<typeof updateGoal> | null;
	niveauGagne: number; // > 0 si un nouveau niveau vient d'être atteint
	recompensesNiv: Recompense[]; // déblocages du(des) palier(s) franchi(s)
	newTrophies: Trophy[];
	celeb: { icon: string; text: string }[]; // récompenses à annoncer (modale + confettis)
}

/* Enregistre un essai et renvoie de quoi animer le bandeau / les modales.
   À n'appeler qu'UNE fois par essai (le garde « déjà enregistré » reste chez
   l'appelant). Comportement identique à l'ancien chemin de session.verify :
   - mode 'lecon' : étoile si sans-faute (toutes les réponses justes) ;
   - autres modes (bilan express/complet) : essai classé via recordRun, sans étoile. */
export function recordLessonRun(p: LessonRunInput): LessonRunOutcome {
	const streakDays = updateStreak().days;
	// Type journalisé pour le graphe d'activité (#319) : 'lecon' (leçon seule) sinon
	// 'bilan' (express/complet). Le sprint a son propre chemin (ui/sprint.ts).
	// La référence (#498) n'est portée qu'en mode 'lecon' : un bilan couvre plusieurs
	// leçons, aucune cible unique à désigner pour l'attribution du programme du jour.
	const kindActivite = p.mode === 'lecon' ? 'lecon' : 'bilan';
	recordLessonStats(
		p.perLesson,
		kindActivite,
		kindActivite === 'lecon' ? (p.lessonId ?? undefined) : undefined,
	);
	const niveauAvant = niveauDepuisXP(getXP());
	addXP(p.ok);
	const niveauApres = niveauDepuisXP(getXP());
	const niveauGagne = niveauApres > niveauAvant ? niveauApres : 0;
	const recompensesNiv = recompensesEntre(niveauAvant, niveauApres);

	let starInfo: LessonRunOutcome['starInfo'] = null;
	let perfect = false;
	const lessonPct = p.questionCount ? Math.round((p.ok / p.questionCount) * 100) : 0;
	if (p.mode === 'lecon') {
		// Un essai SANS question n'est pas un sans-faute : `0 === 0` donnait sinon l'étoile
		// (donc, depuis #485, une leçon franchie) sur une série vide. Non atteignable par les
		// runners actuels, mais l'étoile et l'avancement ne doivent pas en dépendre.
		perfect = p.questionCount > 0 && p.ok === p.questionCount; // toutes les réponses justes
		const res = recordLessonResult(p.lessonId!, perfect);
		starInfo = { perfect, newStar: res.newStar, count: res.count };
		// Avancement / report de la leçon du jour (#485) : SEUL endroit où le score d'un
		// essai COMPLET est enregistré pour ce calcul (ni sprint ni bilan, cf. report-lecon.ts).
		if (p.questionCount > 0) recordEssaiLecon(p.lessonId!, lessonPct, Date.now(), res.count > 0);
	} else {
		recordRun(p.mode, p.ok, p.questionCount, p.ms);
	}

	// Franchissements de palier (frise d'évolution, #397) : plus rien à appeler ici. C'est
	// `recordLessonStats` qui les journalise lui-même, en microtâche, donc APRÈS l'étoile écrite
	// juste au-dessus (dont dépend l'état « acquis ») — l'ordre reste celui-ci, il n'est
	// simplement plus à la charge de l'appelant, qui ne peut donc plus l'oublier.

	const goalRes = updateGoal({
		mode: p.mode,
		newStar: !!(starInfo && starInfo.newStar),
		perfect,
		lessonId: p.lessonId,
		lessonPct,
	});
	const newTrophies = evaluateTrophies();

	const celeb: { icon: string; text: string }[] = [];
	if (starInfo && starInfo.newStar)
		celeb.push({ icon: '⭐', text: 'Étoile gagnée pour cette leçon !' });
	newTrophies.forEach((t) => celeb.push({ icon: t.icon, text: `Nouveau trophée : ${t.title}` }));
	if (goalRes && goalRes.justDone) celeb.push({ icon: '🎯', text: 'Objectif du jour réussi !' });

	return { starInfo, streakDays, goalRes, niveauGagne, recompensesNiv, newTrophies, celeb };
}
