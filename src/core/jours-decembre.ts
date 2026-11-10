/* ============================================================
   Jours de travail de décembre (#785) : base des trophées de Noël.

   Un « jour de travail » est une journée (date LOCALE de l'appareil) où l'enfant a
   terminé au moins une partie qui compte. Plusieurs parties le même jour ne comptent
   qu'une fois (critère 20) : on veut inciter à revenir, pas à enchaîner. Seuls comptent
   les jours du 1er au 31 décembre ; une partie compte pour le jour où elle se TERMINE ;
   le compte repart de zéro chaque 1er décembre (critère 21).

   Pourquoi un état dédié plutôt qu'une relecture du journal d'activité : ce journal est
   borné à ses 200 dernières entrées. Un enfant qui enchaîne beaucoup de parties verrait
   ses premiers jours de décembre en tomber, et le décompte BAISSER en cours de mois.
   Ici, 31 dates au plus, jamais élaguées dans le mois.

   L'alimentation se fait à un seul endroit, la porte du journal d'activité
   (`progress.ts:recordActivity`), par où passent toutes les parties finalisées.
   ============================================================ */
import { lsGet, lsSet } from './storage';
import { DECEMBRE, jourLocal } from './date-locale';

/** Clé de stockage, par profil (lsGet/lsSet). */
export const JOURS_DECEMBRE_KEY = 'ludaskia_joursDecembre';

/** Le mois de décembre en cours de décompte : son année, et ses jours de travail
 *  distincts au format `AAAA-MM-JJ`. */
export interface JoursDecembre {
	annee: number;
	jours: string[];
}

/** Pur. Ajoute le jour local de `now` s'il tombe en décembre (sans doublon). Un
 *  décembre d'une autre année que celui mémorisé repart de zéro. Hors décembre, ou
 *  quand le jour est déjà compté, l'état est rendu tel quel (même référence). */
export function ajouterJourDecembre(etat: JoursDecembre | null, now: number): JoursDecembre | null {
	const d = new Date(now);
	if (d.getMonth() !== DECEMBRE) return etat;
	const annee = d.getFullYear();
	const jour = jourLocal(d);
	const jours = etat && etat.annee === annee ? etat.jours : [];
	if (etat && jours.includes(jour)) return etat;
	return { annee, jours: [...jours, jour] };
}

/** Pur. Nombre de jours de travail du mois de décembre mémorisé. Ne regarde pas la date
 *  du jour : entre deux décembres, il rend le compte du dernier, déjà évalué au moment
 *  de chaque partie, et qui ne peut donc plus rien débloquer. */
export function compterJoursDecembre(etat: JoursDecembre | null): number {
	return etat ? etat.jours.length : 0;
}

/** État mémorisé du profil actif (`null` si jamais écrit, ou illisible : un import de
 *  sauvegarde bancal repart d'un décompte vide plutôt que de planter). */
export function loadJoursDecembre(): JoursDecembre | null {
	const brut: unknown = lsGet(JOURS_DECEMBRE_KEY, null);
	if (!brut || typeof brut !== 'object') return null;
	const { annee, jours } = brut as Partial<JoursDecembre>;
	if (typeof annee !== 'number' || !Number.isInteger(annee)) return null;
	if (!Array.isArray(jours) || !jours.every((j) => typeof j === 'string')) return null;
	return { annee, jours: [...new Set(jours)] };
}

/** Note, pour le profil actif, qu'une partie qui compte s'est terminée à `now`. */
export function noterJourDecembre(now: number): void {
	const avant = loadJoursDecembre();
	const apres = ajouterJourDecembre(avant, now);
	if (apres && apres !== avant) lsSet(JOURS_DECEMBRE_KEY, apres);
}
