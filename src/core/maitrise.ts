/* ============================================================
   Échelle de maîtrise d'une notion (type LSU) — logique PURE, sans stockage.
   ------------------------------------------------------------
   Socle partagé entre `progress.ts` (écriture : stats par leçon, journal des
   paliers franchis) et `encadrant-stats.ts` (lecture : récap de l'espace
   encadrant). Isolé ici pour casser le cycle d'import qui existerait sinon
   (progress ↔ encadrant-stats) : ce module ne dépend d'AUCUN autre module de
   l'app, il ne manipule que la forme `LessonStat` et des seuils.

   Le % récent PILOTE l'état d'acquisition mais n'est JAMAIS affiché en nombre
   (avis pédagogique : un parent lit « 64 % » comme une note).
   ============================================================ */

// Taille de la fenêtre glissante des derniers essais d'une leçon (#234) : « à revoir »
// et l'état d'acquisition de l'espace encadrant se fondent sur la performance RÉCENTE,
// pas sur le cumul historique (lessonAvgPct), qui sous-estime un enfant ayant progressé.
export const RECENT_MAX = 5;

export interface LessonStat {
	attempts: number;
	correct: number;
	questions: number;
	bestPct: number;
	lastPct: number;
	/** % des RECENT_MAX derniers essais (fenêtre glissante, non bornée par dates : un enfant
	 *  qui espace ses essais ne perd pas la visu). Absent sur les données antérieures à #234. */
	recentPct?: number[];
	/** Horodatage (ms) de la DERNIÈRE session travaillée (leçon/bilan/express/sprint) — alimente
	 *  le suivi « dernière fois travaillée » de l'espace encadrant. Absent sur données antérieures.
	 *  Non agrégé par loadLessonStatsAll (aucun consommateur global n'en a besoin à ce jour). */
	lastAt?: number;
}

/* Moyenne CUMULÉE historique (toutes les réponses) ; null si aucune question posée. */
export const lessonAvgPct = (e: LessonStat | undefined) =>
	e && e.questions ? Math.round((e.correct / e.questions) * 100) : null;
/* Moyenne des derniers essais (fenêtre glissante recentPct) ; null si aucun historique
   récent (repli sur lessonAvgPct laissé à l'appelant). Performance RÉCENTE pour l'espace
   encadrant (#234), distincte du cumul historique de lessonAvgPct. */
export const recentAvgPct = (e: LessonStat | undefined): number | null =>
	e && Array.isArray(e.recentPct) && e.recentPct.length
		? Math.round(e.recentPct.reduce((sum, p) => sum + p, 0) / e.recentPct.length)
		: null;

/* ---------- Seuils (réglables) ---------- */
// Échelle d'acquisition (type LSU). Le % récent PILOTE l'état mais n'est jamais affiché.
export const SEUIL_NON_ACQUIS = 40; // perf récente < 40 % → « non acquis »
export const SEUIL_REVOIR = 70; // perf récente < 70 % → proposé « à revoir » (cf. WEAK_PCT, rewards.ts)
// Tendance par notion : dérivée de la fenêtre glissante recentPct, JAMAIS présentée en note.
// Sous ce nombre d'essais, aucun signal (un signal sur trop peu d'essais serait du bruit lu comme
// une régression — avis pédago). Seuil = écart de % moyen entre 1re et 2de moitié de la fenêtre.
export const TENDANCE_MIN_ESSAIS = 4;
export const TENDANCE_SEUIL = 10;

export type NiveauNotion = 'a-decouvrir' | 'non-acquis' | 'en-cours' | 'acquis';
export type TendanceNotion = 'progresse' | 'stable' | 'a-relancer';

/* ---------- Notion « solide » : plus besoin d'être revue ----------
   Étoilée (≥ 1 réussite sans faute) OU perf récente au-dessus du seuil « à revoir ».
   Point unique de vérité partagé par le filtre d'AFFICHAGE de la carte enfant
   (revoirActives) et par le DÉSÉPINGLAGE automatique de la file (purgeRevoirSolides,
   #465) : leur parité est ainsi garantie par le code, pas seulement par les tests.
   `pct` = perf récente (repli sur le cumul) ; `null` (jamais travaillée) = pas solide,
   une leçon épinglée « à l'avance » ne doit pas être considérée comme acquise. */
export function estNotionSolide(etoilee: boolean, pct: number | null): boolean {
	return etoilee || (pct != null && pct >= SEUIL_REVOIR);
}

/* ---------- État d'acquisition d'une notion (échelle 4 niveaux) ----------
   - acquis : étoilée (≥ 1 réussite sans faute) ;
   - à découvrir : jamais travaillée (aucune stat) ;
   - sinon piloté par la perf RÉCENTE (repli cumul) : < 40 % « non acquis », sinon « en cours ».
   Le wording côté UI est validé par le pédagogue/rédacteur ; ici, valeurs internes. */
export function niveauNotion(stat: LessonStat | undefined, etoilee: boolean): NiveauNotion {
	if (etoilee) return 'acquis';
	if (!stat || !stat.questions) return 'a-decouvrir';
	const pct = recentAvgPct(stat) ?? lessonAvgPct(stat) ?? 0;
	return pct < SEUIL_NON_ACQUIS ? 'non-acquis' : 'en-cours';
}

/* ---------- Tendance récente d'une notion ----------
   Signal COURT TERME dérivé de la fenêtre glissante recentPct (derniers essais, non datés) :
   on compare la moyenne de la 1re moitié de la fenêtre à celle de la 2de. Renvoie null tant
   qu'il n'y a pas assez d'essais (le silence n'est pas un signal négatif). Ce n'est PAS une
   note ni un pourcentage affiché : juste une direction (progresse / stable / à relancer). */
export function tendanceNotion(stat: LessonStat | undefined): TendanceNotion | null {
	const r = stat?.recentPct;
	if (!Array.isArray(r) || r.length < TENDANCE_MIN_ESSAIS) return null;
	const mid = Math.floor(r.length / 2);
	const moy = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
	const delta = moy(r.slice(mid)) - moy(r.slice(0, mid));
	if (delta >= TENDANCE_SEUIL) return 'progresse';
	if (delta <= -TENDANCE_SEUIL) return 'a-relancer';
	return 'stable';
}

/* Note (frise d'évolution, #397) : seuls « en cours » et « acquis » comptent comme
   « palier franchi vers le haut » (cf. recordMonteesPalier dans progress.ts). Entrer en
   « à renforcer » (< 40 %) n'est PAS un progrès de maîtrise — la couverture par matière
   rend déjà compte de l'exposition (avis pédago). */
