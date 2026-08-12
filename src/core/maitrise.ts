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

// Taille de la fenêtre glissante d'une leçon (#234, recomptée en QUESTIONS par #541) :
// « à revoir » et l'état d'acquisition de l'espace encadrant se fondent sur la performance
// RÉCENTE, pas sur le cumul historique (lessonAvgPct), qui sous-estime un enfant ayant progressé.
//
// La fenêtre valait 5 ESSAIS, chacun réduit à son pourcentage et pesant autant que les autres.
// Une leçon peut sortir d'un sprint avec UNE question (cf. ui/sprint.ts) : cette question comptait
// alors autant qu'une série complète de huit, si bien qu'un enfant la ratant voyait sa notion
// redescendre d'un cran, puis remonter à l'essai suivant. Le parent lisait une régression qui
// n'en était pas une. En questions, cette question pèse 1/40 : le biais disparaît par construction,
// et la révision espacée peut alimenter la fenêtre (#541) sans la déformer.
//
// 40 questions ≈ 5 séries de leçon (les runners en posent 6 à 8) : même profondeur temporelle
// qu'avant, ce qui était le point d'équilibre voulu par #234. Non bornée par dates (un enfant
// qui espace ses essais ne perd pas la visu) : la péremption calendaire a été ÉCARTÉE sur avis
// pédagogique, l'escalier de révision espacée montant jusqu'à 75 jours — une notion non retouchée
// depuis deux mois y est dans le rythme prévu, et un niveau qui bougerait sans qu'aucune réponse
// n'ait été donnée se lirait comme un bug, pas comme un signal.
export const FENETRE_QUESTIONS = 40;

/** Un essai dans la fenêtre récente : ses bonnes réponses ET son nombre de questions, pour
 *  que le poids de l'essai suive ce qu'il a réellement mesuré (#541). */
export interface EssaiRecent {
	ok: number;
	total: number;
}

export interface LessonStat {
	attempts: number;
	correct: number;
	questions: number;
	bestPct: number;
	lastPct: number;
	/** Essais récents, bornés à FENETRE_QUESTIONS questions (#541). Absent sur les données
	 *  antérieures ; `essaisRecents` sait alors reconstituer la fenêtre depuis `recentPct`. */
	recents?: EssaiRecent[];
	/** ANCIENNE forme de la fenêtre (#234) : un % par essai, sans son nombre de questions —
	 *  d'où l'impossibilité de pondérer. Plus JAMAIS écrite : convertie à la lecture
	 *  (`essaisRecents`) et remplacée par `recents` au prochain essai enregistré. */
	recentPct?: number[];
	/** Horodatage (ms) de la DERNIÈRE session travaillée (leçon/bilan/express/sprint) — alimente
	 *  le suivi « dernière fois travaillée » de l'espace encadrant. Absent sur données antérieures.
	 *  Non agrégé par loadLessonStatsAll (aucun consommateur global n'en a besoin à ce jour). */
	lastAt?: number;
}

/* Moyenne CUMULÉE historique (toutes les réponses) ; null si aucune question posée. */
export const lessonAvgPct = (e: LessonStat | undefined) =>
	e && e.questions ? Math.round((e.correct / e.questions) * 100) : null;
/* Nombre de questions par essai ESTIMÉ, pour les données antérieures à #541 : la moyenne
   historique de la leçon, faute d'avoir gardé le détail par essai. Au moins 1 — un essai
   enregistré a forcément posé une question. */
function questionsParEssai(e: LessonStat): number {
	return Math.max(1, Math.round((e.questions || 0) / Math.max(1, e.attempts || 0)));
}
/* Fenêtre des essais récents dans la forme PONDÉRÉE, quelle que soit la forme stockée.
   L'ancienne (`recentPct`) est CONVERTIE plutôt que jetée : chaque % y redevient un couple
   {ok,total} sur le nombre de questions moyen de la leçon. L'approximation est assumée (elle
   lisse les essais courts et longs d'un même historique vers leur moyenne), mais elle préserve
   ce qui sert : l'ordre des essais, leur niveau de performance, et un ordre de grandeur de
   fenêtre — là où repartir de zéro effacerait d'un coup plusieurs semaines de travail et
   ferait basculer les niveaux affichés au prochain essai enregistré. */
export function essaisRecents(e: LessonStat | undefined): EssaiRecent[] {
	if (!e) return [];
	if (Array.isArray(e.recents)) return e.recents;
	if (!Array.isArray(e.recentPct)) return [];
	const total = questionsParEssai(e);
	return e.recentPct.map((pct) => ({ ok: Math.round((pct / 100) * total), total }));
}
/* Nombre de questions couvertes par la fenêtre — la taille de l'échantillon sur lequel la
   performance récente est calculée, dont dépend le droit de prononcer une baisse d'état. */
export const questionsFenetre = (e: LessonStat | undefined): number =>
	essaisRecents(e).reduce((s, x) => s + x.total, 0);
/* Ajoute un essai à la fenêtre et la borne à FENETRE_QUESTIONS questions. Un essai ancien
   n'est retiré que si la fenêtre reste au-dessus de la borne SANS lui : elle couvre donc au
   moins 40 questions dès qu'elles existent, plutôt que de retomber sous la borne à chaque
   écriture. Le dernier essai n'est jamais retiré, même s'il excède seul la borne. Pur. */
export function ajouterEssaiRecent(fenetre: EssaiRecent[], essai: EssaiRecent): EssaiRecent[] {
	const out = [...fenetre, essai];
	let cumul = out.reduce((s, x) => s + x.total, 0);
	while (out.length > 1 && cumul - out[0].total >= FENETRE_QUESTIONS) {
		cumul -= out[0].total;
		out.shift();
	}
	return out;
}
/* Performance RÉCENTE (#234) : bonnes réponses / questions posées sur la fenêtre, donc
   PONDÉRÉE par le nombre de questions de chaque essai (#541) et non moyenne de pourcentages.
   null si aucun historique récent (repli sur lessonAvgPct laissé à l'appelant). Distincte du
   cumul historique de lessonAvgPct. */
export const recentAvgPct = (e: LessonStat | undefined): number | null => {
	const f = essaisRecents(e);
	const q = f.reduce((s, x) => s + x.total, 0);
	return q ? Math.round((f.reduce((s, x) => s + x.ok, 0) / q) * 100) : null;
};
/* Performance récente ET taille de l'échantillon qui la porte — les deux vont ensemble depuis
   #541, puisque l'état affiché ne se prononce pas à la baisse sur trop peu de questions (cf.
   MIN_QUESTIONS_ETAT_BAS). Repli sur le cumul historique quand la fenêtre est vide (données
   d'avant #234) : l'échantillon est alors tout l'historique de la leçon. */
export function perfRecente(e: LessonStat | undefined): { pct: number; questions: number } | null {
	const pct = recentAvgPct(e);
	if (pct != null) return { pct, questions: questionsFenetre(e) };
	const cumul = lessonAvgPct(e);
	return cumul == null ? null : { pct: cumul, questions: e?.questions ?? 0 };
}

/* ---------- Seuils (réglables) ---------- */
// Échelle d'acquisition (type LSU). Le % récent PILOTE l'état mais n'est jamais affiché.
export const SEUIL_NON_ACQUIS = 40; // perf récente < 40 % → « non acquis »
export const SEUIL_REVOIR = 70; // perf récente < 70 % → proposé « à revoir » (cf. WEAK_PCT, rewards.ts)
// Plancher d'échantillon pour ANNONCER « à renforcer » (#541). Sous ce nombre de questions dans
// la fenêtre, l'état reste « en cours » : on ne dit pas au parent qu'une notion est à renforcer
// sur la foi d'une ou deux questions croisées en sprint ou en révision. Le code appliquait déjà
// cette prudence à la TENDANCE (ci-dessous) mais pas au mot d'état, celui que le parent lit —
// l'incohérence a été relevée par le pédagogue, pas seulement le principe.
// Calé sur la PLUS PETITE série de leçon (6 questions : lecon-ordre, lecon-tri, lecon-qcm-multi) :
// une série complète, même courte, DOIT pouvoir dire « à renforcer » — la masquer cacherait une
// vraie difficulté ; deux items isolés, non. Ne protège que l'état affiché : la performance
// récente elle-même reste lue telle quelle par « à revoir » (estNotionSolide), qui a le droit
// d'être plus réactif qu'un mot montré au parent.
export const MIN_QUESTIONS_ETAT_BAS = 6;
// Tendance par notion : dérivée de la fenêtre glissante, JAMAIS présentée en note.
// Sous ce nombre de QUESTIONS, aucun signal (un signal sur trop peu de matière serait du bruit lu
// comme une régression — avis pédago). Le seuil valait 4 ESSAIS, ce que quatre questions isolées
// de sprint suffisaient à atteindre : exactement le bruit qu'il devait taire. 24 questions ≈ 3 à 4
// séries. Seuil = écart de % entre 1re et 2de moitié de la fenêtre, moitiés comptées en questions.
export const TENDANCE_MIN_QUESTIONS = 24;
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
   - acquis : étoilée (≥ 1 réussite sans faute) — VERROU assumé : un sans-faute déjà obtenu ne se
     perd pas sur un item ultérieur ambigu (juste/faux ne distingue pas l'oubli de l'inattention ;
     ce qui vacille se dit par la tendance et par « à revoir », pas en retirant un acquis) ;
   - à découvrir : jamais travaillée (aucune stat) ;
   - sinon piloté par la perf RÉCENTE (repli cumul) : < 40 % « non acquis », sinon « en cours »,
     avec le plancher d'échantillon MIN_QUESTIONS_ETAT_BAS avant d'annoncer « non acquis ».
   Le wording côté UI est validé par le pédagogue/rédacteur ; ici, valeurs internes.

   PÉRIMÈTRE (à savoir avant de toucher à ceci) : c'est l'UNE des trois mesures de « maîtrise » du
   code, et la seule que #541 modifie. Les deux autres restent inchangées et ne regardent pas cette
   fenêtre : `report-lecon.ts` (SEUIL_FRANCHIE, porte d'avancement de la leçon du jour) ne juge que
   des essais COMPLETS en mode leçon, et `rewards.ts` (weakLessons, défi de remédiation) juge sur le
   cumul historique. Qu'elles doivent ou non converger est un arbitrage produit non tranché. */
export function niveauNotion(stat: LessonStat | undefined, etoilee: boolean): NiveauNotion {
	if (etoilee) return 'acquis';
	if (!stat || !stat.questions) return 'a-decouvrir';
	const perf = perfRecente(stat) ?? { pct: 0, questions: 0 };
	const assezDeMatiere = perf.questions >= MIN_QUESTIONS_ETAT_BAS;
	return perf.pct < SEUIL_NON_ACQUIS && assezDeMatiere ? 'non-acquis' : 'en-cours';
}

/* ---------- Tendance récente d'une notion ----------
   Signal COURT TERME dérivé de la fenêtre glissante (derniers essais, non datés) : on compare la
   performance de la 1re moitié de la fenêtre à celle de la 2de. Renvoie null tant qu'il n'y a pas
   assez de questions (le silence n'est pas un signal négatif). Ce n'est PAS une note ni un
   pourcentage affiché : juste une direction (progresse / stable / à relancer).

   Les moitiés se comptent en QUESTIONS (#541) : deux séries de huit questions ne se comparent pas
   à huit questions isolées de sprint, alors que la coupe « au milieu des essais » les traitait
   comme deux moitiés équivalentes. */
export function tendanceNotion(stat: LessonStat | undefined): TendanceNotion | null {
	const f = essaisRecents(stat);
	const q = f.reduce((s, x) => s + x.total, 0);
	if (f.length < 2 || q < TENDANCE_MIN_QUESTIONS) return null;
	let coupe = 0;
	let cumul = 0;
	while (coupe < f.length - 1 && cumul + f[coupe].total <= q / 2) cumul += f[coupe++].total;
	// Premier essai à lui seul plus gros que la moitié : il forme la 1re moitié. Sans cette
	// garde, la 1re moitié serait vide et la comparaison partirait de 0 % — donc « progresse »
	// systématique dès qu'un gros essai ouvre la fenêtre.
	if (coupe === 0) coupe = 1;
	const perf = (xs: EssaiRecent[]) => {
		const t = xs.reduce((s, x) => s + x.total, 0);
		return t ? (xs.reduce((s, x) => s + x.ok, 0) / t) * 100 : 0;
	};
	const delta = perf(f.slice(coupe)) - perf(f.slice(0, coupe));
	if (delta >= TENDANCE_SEUIL) return 'progresse';
	if (delta <= -TENDANCE_SEUIL) return 'a-relancer';
	return 'stable';
}

/* Note (frise d'évolution, #397) : seuls « en cours » et « acquis » comptent comme
   « palier franchi vers le haut » (cf. recordMonteesPalier dans progress.ts). Entrer en
   « à renforcer » (< 40 %) n'est PAS un progrès de maîtrise — la couverture par matière
   rend déjà compte de l'exposition (avis pédago). */
