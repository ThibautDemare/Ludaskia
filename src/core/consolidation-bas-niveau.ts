/* ============================================================
   Consolidation de la classe précédente (#723) — logique PURE.
   ------------------------------------------------------------
   Quand une matière passe à la classe suivante (CE2 → CM1), une partie de ce que
   l'enfant avait commencé sans le finir disparaît de tout ce qui est scopé à la classe
   suivie : catalogue, récap, suggestions. Ce module dit, pour UNE matière, ce qui reste
   de la classe juste en dessous.

   Trois bornes, qui sont aussi les trois conditions d'extinction :
   - UN SEUL niveau d'écart (`niveauInferieurImmediat`, même règle que l'entretien de
     révision #232) : au CM2, plus rien du CE2 ne ressort, quel que soit son état ;
   - leçons PROPRES à la classe précédente : une leçon qui existe aussi à la classe suivie
     est servie dans sa version de la classe suivie, qui la remplace ;
   - leçons TRAVAILLÉES à ce niveau (au moins une question, tous modes) et PAS FRANCHIES
     (`estFranchie` : étoile, ou score au seuil sur un essai complet en mode leçon).

   Pourquoi « franchie » et pas « solide » (`estNotionSolide`, qui lit la perf récente sur
   une fenêtre glissante) : la sortie doit être à SENS UNIQUE. Une notion solide peut
   redevenir fragile après un mauvais sprint ; une notion franchie ne l'est plus jamais
   (étoile et meilleur score sont monotones). Décision du 27/09/2026 (#723). Contrepartie
   assumée : une leçon réussie en sprint seulement reste listée jusqu'à une leçon complète
   réussie.

   Entrée : les cartes BRUTES (clés `lessonId@niveau`), jamais une vue scopée — la vue
   scopée au niveau actif exclut précisément ce qu'on cherche ici. Sans DOM ni stockage :
   l'espace encadrant la nourrit avec les cartes du profil CONSULTÉ, les canaux enfant de
   #724 la nourriront avec celles du profil actif.
   ============================================================ */
import { getLessonsBySubject, type LessonDef, type SchoolLevel, type SubjectId } from './catalog';
import { niveauInferieurImmediat } from './levels';
import { niveauNotion, perfRecente, type LessonStat, type NiveauNotion } from './maitrise';
import { estFranchie, type EtatReport } from './report-lecon';

/** Cartes brutes d'un profil, clés `lessonId@niveau`. */
export interface CartesBrutes {
	stars: Record<string, number>;
	stats: Record<string, LessonStat>;
	reports: Record<string, EtatReport>;
}

/** Leçon de la classe précédente commencée et pas encore franchie. */
export interface LeconFragile {
	lesson: LessonDef;
	/** Niveau de STOCKAGE (celui de la clé) : c'est à ce niveau qu'elle se joue et s'écrit. */
	niveau: SchoolLevel;
	/** 'non-acquis' ou 'en-cours' par construction (travaillée, donc jamais « à découvrir » ;
	    non franchie, donc jamais étoilée, donc jamais « acquis »). */
	etat: NiveauNotion;
	/** Perf récente (repli sur le cumul) : sert au TRI, jamais affichée en nombre. */
	pctRecent: number | null;
}

export interface ConsolidationBasNiveau {
	/** La classe précédente dont il est question. */
	niveau: SchoolLevel;
	/** Travaillées et pas franchies, les plus fragiles d'abord. */
	fragiles: LeconFragile[];
	/** Leçons éligibles travaillées à ce niveau, franchies COMPRISES : distingue « rien à
	    consolider parce que tout est franchi » (> 0, fragiles vide) de « rien à
	    consolider parce que rien n'a jamais été fait à ce niveau » (0). */
	nbTravaillees: number;
}

/* Rang de tri des états : le plus fragile d'abord. */
const RANG_ETAT: Partial<Record<NiveauNotion, number>> = { 'non-acquis': 0, 'en-cours': 1 };

/* Perf croissante, une perf inconnue en dernier (deux inconnues sont à égalité). */
function comparerPct(a: number | null, b: number | null): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return a - b;
}

/** Ce qui reste de la classe juste en dessous pour UNE matière, suivie à `niveauActif`.
    `undefined` quand la question ne se pose pas : pas de classe en dessous, ou aucune leçon
    propre à cette classe dans la matière (le catalogue n'a rien à y consolider). */
export function consolidationBasNiveau(
	subject: SubjectId,
	niveauActif: SchoolLevel,
	cartes: CartesBrutes,
): ConsolidationBasNiveau | undefined {
	const niveau = niveauInferieurImmediat(niveauActif);
	if (!niveau) return undefined;
	// Déjà triées dans l'ordre pédagogique de la classe précédente : ce rang sert de
	// dernier départage.
	const eligibles = getLessonsBySubject(subject, niveau).filter(
		(l) => !l.levels.includes(niveauActif),
	);
	if (eligibles.length === 0) return undefined;

	const rang = new Map(eligibles.map((l, i) => [l.id, i]));
	const fragiles: LeconFragile[] = [];
	let nbTravaillees = 0;
	for (const lesson of eligibles) {
		const k = `${lesson.id}@${niveau}`;
		const stat = cartes.stats[k];
		if (!stat?.questions) continue; // jamais travaillée à ce niveau
		nbTravaillees++;
		const etoilee = (cartes.stars[k] ?? 0) > 0;
		if (estFranchie(cartes.reports[k], etoilee)) continue;
		fragiles.push({
			lesson,
			niveau,
			etat: niveauNotion(stat, etoilee),
			pctRecent: perfRecente(stat)?.pct ?? null,
		});
	}

	fragiles.sort(
		(a, b) =>
			(RANG_ETAT[a.etat] ?? 2) - (RANG_ETAT[b.etat] ?? 2) ||
			comparerPct(a.pctRecent, b.pctRecent) ||
			(rang.get(a.lesson.id) ?? 0) - (rang.get(b.lesson.id) ?? 0),
	);
	return { niveau, fragiles, nbTravaillees };
}
