/* ============================================================
   Prérequis inter-niveaux (#724) — logique PURE.
   ------------------------------------------------------------
   Lit la table `PREREQUIS` (data/ordre-pedagogique.ts) : une leçon propre à une classe,
   et les leçons propres à la classe en dessous sans lesquelles l'enfant y échoue pour une
   raison étrangère à ce qu'elle enseigne. Trois consommateurs, qui n'en font pas le même
   usage :
   - le fil de « Ta prochaine leçon » insère un prérequis ouvert DÉJÀ TRAVAILLÉ avant la
     leçon qui en dépend (core/lecon-du-jour.ts) ;
   - le panneau d'étayage le nomme, travaillé ou non (`leconAvant`, core/etayage.ts) ;
   - l'historique des erreurs le signale au parent, travaillé ou non.
   Un prérequis jamais travaillé n'est donc jamais inséré d'office : l'insertion sur échec
   se déclencherait à chaque échec sans prouver que le prérequis manque (27/09/2026).

   Mêmes bornes d'extinction que la consolidation de la classe précédente (#723) : UN
   SEUL niveau d'écart, et sortie définitive au franchissement (`estFranchie`, monotone).
   Entrée : les cartes BRUTES (clés `lessonId@niveau`), jamais une vue scopée.
   ============================================================ */
import { getLessonById, getLessonsBySubject, type LessonDef, type SchoolLevel } from './catalog';
import type { CartesBrutes } from './consolidation-bas-niveau';
import { LEVEL_ORDER, niveauInferieurImmediat } from './levels';
import { estFranchie } from './report-lecon';
import { PREREQUIS, type ExigencePrerequis } from '../data/ordre-pedagogique';

/** Prérequis encore ouvert d'une leçon : une exigence de la table qu'aucune leçon n'a franchie. */
export interface PrerequisOuvert {
	/** La leçon qui représente l'exigence (la 1re travaillée du groupe, sinon la 1re). */
	lesson: LessonDef;
	/** Niveau de STOCKAGE du prérequis : c'est là qu'il se joue, s'écrit et se lit. */
	niveau: SchoolLevel;
	/** Au moins une question posée à ce niveau (tous modes). */
	travaillee: boolean;
}

type TablePrerequis = Record<string, readonly ExigencePrerequis[]>;

const membres = (e: ExigencePrerequis): readonly string[] => (typeof e === 'string' ? [e] : e);
const rangNiveau = (n: SchoolLevel): number => LEVEL_ORDER.indexOf(n);

/* Cycle éventuel dans le graphe dépendante → prérequis, rendu comme un chemin. La règle de
   niveau (prérequis d'une classe strictement inférieure) les interdit déjà ; ce contrôle ne
   dépend pas d'elle, pour qu'un assouplissement futur de la règle ne les laisse pas passer. */
function cycles(table: TablePrerequis): string[] {
	const out: string[] = [];
	const etat = new Map<string, 'en-cours' | 'fini'>();
	const visiter = (id: string, chemin: string[]): void => {
		if (etat.get(id) === 'fini') return;
		if (etat.get(id) === 'en-cours') {
			out.push(`cycle : ${[...chemin.slice(chemin.indexOf(id)), id].join(' → ')}`);
			return;
		}
		etat.set(id, 'en-cours');
		for (const e of table[id] ?? []) for (const p of membres(e)) visiter(p, [...chemin, id]);
		etat.set(id, 'fini');
	};
	for (const id of Object.keys(table)) visiter(id, []);
	return out;
}

/** Anomalies de la table (vide = table saine) : ids inconnus, exigence vide, prérequis
    d'une autre matière, prérequis qui n'est pas d'une classe STRICTEMENT inférieure à la
    plus basse de la leçon dépendante (ce qui écarte toute leçon à deux niveaux qui
    couvrirait la classe de la dépendante), cycles. */
export function anomaliesPrerequis(table: TablePrerequis = PREREQUIS): string[] {
	const out: string[] = [];
	for (const [id, exigences] of Object.entries(table)) {
		const dep = getLessonById(id);
		if (!dep) {
			out.push(`${id} : leçon dépendante inconnue du catalogue`);
			continue;
		}
		const plancher = Math.min(...dep.levels.map(rangNiveau));
		for (const e of exigences) {
			if (membres(e).length === 0) out.push(`${id} : exigence vide`);
			for (const pid of membres(e)) {
				const pre = getLessonById(pid);
				if (!pre) {
					out.push(`${id} → ${pid} : prérequis inconnu du catalogue`);
					continue;
				}
				if (pre.subject !== dep.subject) out.push(`${id} → ${pid} : prérequis d'une autre matière`);
				if (pre.levels.some((n) => rangNiveau(n) >= plancher))
					out.push(`${id} → ${pid} : prérequis qui n'est pas d'une classe strictement inférieure`);
			}
		}
	}
	return [...out, ...cycles(table)];
}

/** Prérequis ouverts de `lesson` pour une matière suivie à `niveauActif` : une entrée par
    exigence dont aucun membre n'est franchi à son niveau, dans l'ordre pédagogique de ce
    niveau. Vide hors de la classe juste en dessous (au CM2, plus rien du CE2), et pour une
    leçon absente de la table. Travaillés ou non : c'est à l'appelant de filtrer. */
export function prerequisOuverts(
	lesson: LessonDef,
	niveauActif: SchoolLevel,
	cartes: CartesBrutes,
): PrerequisOuvert[] {
	const exigences = PREREQUIS[lesson.id];
	const niveau = niveauInferieurImmediat(niveauActif);
	if (!exigences || !niveau) return [];
	const ordre = getLessonsBySubject(lesson.subject, niveau).map((l) => l.id);
	const rang = (l: LessonDef): number => {
		const i = ordre.indexOf(l.id);
		return i < 0 ? ordre.length : i;
	};
	const cle = (l: LessonDef) => `${l.id}@${niveau}`;
	const travaillee = (l: LessonDef) => (cartes.stats[cle(l)]?.questions ?? 0) > 0;
	const franchie = (l: LessonDef) =>
		estFranchie(cartes.reports[cle(l)], (cartes.stars[cle(l)] ?? 0) > 0);

	const out: PrerequisOuvert[] = [];
	for (const e of exigences) {
		const candidats = membres(e)
			.map((id) => getLessonById(id))
			.filter(
				(l): l is LessonDef => !!l && l.levels.includes(niveau) && !l.levels.includes(niveauActif),
			)
			.sort((a, b) => rang(a) - rang(b));
		if (candidats.length === 0 || candidats.some(franchie)) continue;
		const representant = candidats.find(travaillee) ?? candidats[0];
		out.push({ lesson: representant, niveau, travaillee: travaillee(representant) });
	}
	return out.sort((a, b) => rang(a.lesson) - rang(b.lesson));
}
