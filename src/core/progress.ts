/* ============================================================
   Progression persistée : records de bilans, série de jours,
   étoiles et statistiques par leçon. (localStorage via lsGet/lsSet)
   ============================================================ */
import { fmt, startOfDay } from './utils';
import { lsGet, lsSet, lsSetQuiet, lsRemoveQuiet, lsGetRaw, lsSetRaw } from './storage';
import { getAllLessons, getLessonById } from './catalog';
import type { SchoolLevel } from './catalog';
import { LEVEL_ORDER, niveauInferieurImmediat } from './levels';
import { niveauActif, niveauActifMatiere, niveauLecon } from './niveau-actif';
import { etatNeuf, avancerEtat } from './revision';
import { countDue } from './revision-select';
import type { LeconBasNiveau } from './revision-select';
import type { EtatRevision, OrthoState } from './orthographe/types';
import { ajouterEssaiRecent, essaisRecents, niveauNotion, type LessonStat } from './maitrise';
import { apresEssaiLecon, type EtatReport } from './report-lecon';

/* La forme `LessonStat` et ses dérivations pures (moyennes) vivent dans maitrise.ts
   (socle sans stockage, cf. cycle d'import) ; on les re-expose ici pour les nombreux
   consommateurs qui importent déjà « depuis progress ». */
export type { LessonStat } from './maitrise';
export { lessonAvgPct, recentAvgPct } from './maitrise';

/* ---------- Namespacing de la progression par niveau (#225) ----------
   Tout l'état PAR LEÇON (étoiles, stats, premier passage, état SR) est rangé sous
   une clé `lessonId@niveau`. En LECTURE, les `load*` renvoient une VUE scopée au
   niveau ACTIF (clés `lessonId` simples) → les consommateurs restent inchangés et
   deviennent automatiquement scopés. En ÉCRITURE, on namespace la clé. Les
   `load*All` exposent un agrégat tous-niveaux (clés simples) pour les métriques
   GLOBALES d'effort, distinctes de la complétude (scopée). Une clé « pleine »
   (legacy, sans `@`) est traitée comme CE2 (tout l'existant l'était). */
const NIVEAU_LEGACY: SchoolLevel = 'ce2';
function nsKey(lessonId: string, niveau: SchoolLevel): string {
	return `${lessonId}@${niveau}`;
}
export function lessonOfKey(key: string): string {
	const i = key.lastIndexOf('@');
	return i < 0 ? key : key.slice(0, i);
}
export function niveauOfKey(key: string): string {
	const i = key.lastIndexOf('@');
	return i < 0 ? NIVEAU_LEGACY : key.slice(i + 1);
}
/* Niveau de STOCKAGE d'une leçon = le niveau auquel elle est jouée/générée
   (niveauLecon, clampé sur les niveaux que la leçon supporte). Une leçon CE2-only
   jouée par un CM1 (favori/révision) est stockée @ce2 (cohérent avec sa génération). */
function niveauStockage(lessonId: string): SchoolLevel {
	const lesson = getLessonById(lessonId);
	return lesson ? niveauLecon(lesson) : niveauActif();
}

/* Vue { lessonId: valeur } d'une carte namespacée, restreinte au niveau actif PAR
   MATIÈRE : chaque leçon est lue au niveau actif de sa matière (non clampé) — une
   leçon hors du catalogue actif (ex. CE2-only quand la matière est en CM1) est donc
   exclue de la vue. Mémoïse le niveau par matière (peu de matières).
   Exporté pour les cartes par leçon qui vivent HORS de ce module (déclaration
   « vu en classe », #478) : elles doivent offrir le même contrat de lecture. */
export function scopeActif<V>(raw: Record<string, V>): Record<string, V> {
	const cache: Record<string, SchoolLevel> = {};
	const out: Record<string, V> = {};
	for (const k in raw) {
		const id = lessonOfKey(k);
		const subject = getLessonById(id)?.subject ?? '';
		const niveau =
			cache[subject] ?? (cache[subject] = subject ? niveauActifMatiere(subject) : niveauActif());
		if (niveauOfKey(k) === niveau) out[id] = raw[k];
	}
	return out;
}

/* Vue { lessonId: valeur } d'une carte namespacée où chaque leçon est lue à SON niveau de
   STOCKAGE (`niveauStockage`), et non au niveau actif de sa matière. C'est le contrat de
   lecture d'une référence assumée HORS FILTRE : une leçon assignée hors de la classe suivie
   (#556) est jouée et stockée au niveau qui est le sien, là où `scopeActif` l'exclut par
   construction — elle passerait alors pour « jamais travaillée » à chaque lecture.

   Les deux vues coïncident pour tout ce qui appartient au niveau actif. C'est celle-ci qu'il
   faut prendre pour une leçon DÉSIGNÉE (épingle, cible de programme) ; `scopeActif` reste
   celle des PÉRIMÈTRES (récap, complétude), qui doivent s'arrêter à la classe suivie. */
export function scopeStockage<V>(raw: Record<string, V>): Record<string, V> {
	const out: Record<string, V> = {};
	for (const k in raw) {
		const id = lessonOfKey(k);
		if (niveauOfKey(k) === niveauStockage(id)) out[id] = raw[k];
	}
	return out;
}

/* ---------- Records de bilans (classement), SCOPÉS par niveau (#233) ----------
   Un record CM1 (nombres plus grands, contenu plus dur) n'est pas comparable à un
   record CE2 : chaque mode est rangé PAR NIVEAU sous `ludaskia_runs_<mode>@<niveau>`.
   Le niveau d'un record = niveau scolaire ACTIF (un sprint/bilan balaie le catalogue
   du niveau, il n'est pas attaché à une matière). En LECTURE, `loadRuns` renvoie le
   classement du niveau ACTIF (affichage des podiums/records) ; `loadRunsAll` agrège
   TOUS les niveaux pour les compteurs d'EFFORT (trophées, régularité), qui restent
   GLOBAUX — un trophée acquis ne se reverrouille jamais au changement de classe. */
export interface Run {
	ts: number;
	ok: number;
	count: number;
	ms: number;
}
export const RUNS_KEY = (m: string) => `ludaskia_runs_${m}`;
function runsKey(mode: string, niveau: SchoolLevel): string {
	return `${RUNS_KEY(mode)}@${niveau}`;
}
const MAX_RUNS = 50; // on ne garde que les 50 derniers essais par mode ET par niveau
/* Classement du niveau ACTIF (affichage des podiums/records). */
export function loadRuns(mode: string): Run[] {
	return lsGet(runsKey(mode, niveauActif()), []);
}
/* Essais TOUS niveaux confondus : base des compteurs d'effort GLOBAUX (trophées,
   régularité), qui ne dépendent pas de la classe active. */
export function loadRunsAll(mode: string): Run[] {
	return LEVEL_ORDER.flatMap((niveau) => lsGet(runsKey(mode, niveau), []) as Run[]);
}
function saveRuns(mode: string, runs: Run[]) {
	lsSet(runsKey(mode, niveauActif()), runs);
}

/* Bornes de période calendaire (pour les objectifs de régularité, et la frise #397).
   `ts` par défaut = maintenant ; paramétrable pour dater un horodatage arbitraire (frise). */
export function startOfWeek(ts = Date.now()) {
	const d = new Date(startOfDay(ts));
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lundi = 0
	return d.getTime();
}
export function startOfMonth() {
	const d = new Date();
	return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
/* Nombre d'essais d'un mode depuis un instant donné, TOUS niveaux confondus :
   la régularité est un compteur d'EFFORT (comme les trophées), indépendant de la
   classe active — changer de niveau en cours de semaine ne remet pas à zéro
   l'objectif « 2 sprints cette semaine » (#233). */
export function countSince(mode: string, since: number) {
	return loadRunsAll(mode).filter((r) => r.ts >= since).length;
}

/* Classement « score puis temps » : plus de bonnes réponses d'abord,
   le chrono départage à égalité (le plus rapide gagne). */
export function cmpRun(a: Run, b: Run) {
	return b.ok !== a.ok ? b.ok - a.ok : a.ms - b.ms;
}
export const runPct = (r: Run) => (r.count ? Math.round((r.ok / r.count) * 100) : 0);
export const fmtRecord = (r: Run) => `${r.ok}/${r.count} · ${fmt(r.ms)}`;

/* Résultat d'un essai classé : rang dans le tableau, effectif, médaille et record.
   Type explicite (#350) : consommé par le bandeau de sprint et par `updateGoal`. */
export interface RunResult {
	rank: number; // position dans le classement (1 = meilleur)
	total: number; // nombre d'essais enregistrés dans ce mode
	medal: number; // 0 = aucune, 1 = or, 2 = argent, 3 = bronze
	isRecord: boolean; // meilleur essai jamais réalisé dans ce mode
}
/* Enregistre l'essai courant et calcule médaille / rang / record */
export function recordRun(mode: string, ok: number, count: number, ms: number): RunResult {
	const run = { ts: Date.now(), ok, count, ms };
	const runs = loadRuns(mode);
	const previous = [...runs];
	runs.push(run);
	if (runs.length > MAX_RUNS) runs.splice(0, runs.length - MAX_RUNS);
	saveRuns(mode, runs);
	const rank = [...runs].sort(cmpRun).indexOf(run) + 1;
	const isRecord = previous.length > 0 && cmpRun(run, [...previous].sort(cmpRun)[0]) < 0;
	const medal = runs.length >= 3 && rank <= 3 ? rank : 0; // 1=or, 2=argent, 3=bronze
	return { rank, total: runs.length, medal, isRecord };
}

/* ---------- Série de jours consécutifs ---------- */
export const STREAK_KEY = 'ludaskia_streak';
export function todayStr() {
	const d = new Date();
	return (
		d.getFullYear() +
		'-' +
		String(d.getMonth() + 1).padStart(2, '0') +
		'-' +
		String(d.getDate()).padStart(2, '0')
	);
}
export function daysBetween(a: string, b: string) {
	return Math.round(
		(new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000,
	);
}
export function getStreak() {
	return lsGet(STREAK_KEY, { days: 0, last: null, max: 0 });
}
export function updateStreak() {
	const today = todayStr();
	let s = getStreak();
	if (!s.last) {
		s = { days: 1, last: today, max: 1 };
	} else {
		const d = daysBetween(s.last, today);
		if (d === 1) {
			s.days++;
			s.last = today;
		} else if (d !== 0) {
			s.days = 1;
			s.last = today;
		}
	}
	s.max = Math.max(s.max || 0, s.days); // record de série, jamais reperdu
	lsSet(STREAK_KEY, s);
	return s;
}
/* Suffixe « · 🔥 N jours d'affilée » (vide si série < 2) */
export const streakSuffix = (days: number) => (days >= 2 ? ` · 🔥 ${days} jours d'affilée` : '');

/* ---------- Étoiles par leçon (1 dès le premier sans-faute) ---------- */
export const STARS_KEY = 'ludaskia_stars';
function loadStarsRaw(): Record<string, number> {
	return lsGet(STARS_KEY, {});
}
function loadStars(): Record<string, number> {
	return scopeActif(loadStarsRaw());
}
/* Étoiles vues au niveau de STOCKAGE de chaque leçon (cf. `scopeStockage`) : la lecture des
   références désignées hors de la classe suivie (#556). */
export function loadStarsStockage(): Record<string, number> {
	return scopeStockage(loadStarsRaw());
}
function saveStars(s: Record<string, number>) {
	lsSet(STARS_KEY, s);
}
export function recordLessonResult(lessonId: string, perfect: boolean) {
	const stars = loadStarsRaw();
	const k = nsKey(lessonId, niveauStockage(lessonId));
	const had = (stars[k] || 0) > 0;
	if (perfect) stars[k] = (stars[k] || 0) + 1;
	saveStars(stars);
	return { count: stars[k] || 0, newStar: perfect && !had };
}
export function starsEarned() {
	const s = loadStars();
	return getAllLessons().filter((l) => (s[l.id] || 0) > 0).length;
}
/* Étoiles gagnées TOUS NIVEAUX confondus (chaque leçon@niveau étoilée compte une
   fois) : compteur « trésor » cumulatif qui ne baisse JAMAIS au changement de
   classe — il évite le sentiment de perte (#225, avis gamification/UX). */
export function starsEarnedAll(): number {
	const raw = loadStarsRaw();
	return Object.keys(raw).filter((k) => (raw[k] || 0) > 0).length;
}
/* Étoiles gagnées PAR NIVEAU (chaque leçon@niveau étoilée compte une fois), dans l'ordre
   scolaire, niveaux vides omis. Détail du cumul `starsEarnedAll`, réservé à l'espace
   ENCADRANT (#556) : il dit à l'adulte quelle part du travail se fait hors de la classe
   suivie, donc si une assignation hors classe reste un coup de pouce ponctuel ou devient le
   mode par défaut. Côté enfant, rien ne change : le « trésor » reste un total unique, sans
   détail par niveau (avis gamification, #225).

   Pur, la carte brute étant passée par l'appelant — l'espace encadrant lit par UUID, sans
   jamais basculer le profil actif. Un niveau inconnu dans une clé (stockage édité à la main)
   est ignoré, l'ordre scolaire servant de liste blanche. */
export interface EtoilesNiveau {
	niveau: SchoolLevel;
	etoiles: number;
}
export function etoilesParNiveau(raw: Record<string, number>): EtoilesNiveau[] {
	const compte = new Map<string, number>();
	for (const k in raw) {
		if ((raw[k] || 0) <= 0) continue;
		const lv = niveauOfKey(k);
		compte.set(lv, (compte.get(lv) ?? 0) + 1);
	}
	return LEVEL_ORDER.filter((lv) => compte.has(lv)).map((lv) => ({
		niveau: lv,
		etoiles: compte.get(lv) as number,
	}));
}

/* Niveaux auxquels une leçon est étoilée (≥1 sans-faute). Sert au badge « déjà
   maîtrisée en CE2 » quand l'enfant retrouve la même leçon à un niveau supérieur. */
export function etoileAuxNiveaux(lessonId: string): SchoolLevel[] {
	const raw = loadStarsRaw();
	return Object.keys(raw)
		.filter((k) => lessonOfKey(k) === lessonId && (raw[k] || 0) > 0)
		.map((k) => niveauOfKey(k) as SchoolLevel);
}
export { loadStars };

/* ---------- Stats de réussite par leçon ----------
   Agrégées sur tous les contextes (leçon seule, bilan complet, express).
   Sert à repérer les thèmes à retravailler. */
export const LESSON_STATS_KEY = 'ludaskia_lessonStats';
function loadLessonStatsRaw(): Record<string, LessonStat> {
	return lsGet(LESSON_STATS_KEY, {});
}
export function loadLessonStats() {
	return scopeActif(loadLessonStatsRaw());
}
/* Stats vues au niveau de STOCKAGE de chaque leçon (cf. `scopeStockage`), pendant de
   `loadStarsStockage` : les deux vont toujours ensemble (état d'une notion = étoile + perf). */
export function loadLessonStatsStockage(): Record<string, LessonStat> {
	return scopeStockage(loadLessonStatsRaw());
}
/* Stats CUMULÉES par leçon, TOUS niveaux confondus (clé `lessonId` simple). Sert
   aux agrégats GLOBAUX d'effort (total de réponses, bonnes réponses par matière),
   distincts de la complétude (scopée au niveau actif). */
export function loadLessonStatsAll(): Record<string, LessonStat> {
	const raw = loadLessonStatsRaw();
	const out: Record<string, LessonStat> = {};
	for (const k in raw) {
		const id = lessonOfKey(k);
		const s = raw[k];
		const e = out[id] || { attempts: 0, correct: 0, questions: 0, bestPct: 0, lastPct: 0 };
		e.attempts += s.attempts || 0;
		e.correct += s.correct || 0;
		e.questions += s.questions || 0;
		e.bestPct = Math.max(e.bestPct, s.bestPct || 0);
		e.lastPct = s.lastPct || 0;
		out[id] = e;
	}
	return out;
}
export function recordLessonStats(
	perLesson: Record<string, { ok: number; total: number }>,
	kind: ActivityKind = 'lecon', // type journalisé pour le graphe d'activité (#319)
	ref?: string, // cible travaillée (#498) : id de leçon en mode 'lecon', rien pour un bilan/sprint
) {
	const s = loadLessonStatsRaw();
	const now = Date.now(); // instant unique de la session (stats, activité, 1re/dernière fois)
	// Leçons rencontrées pour la 1re fois dans cet essai (aucune stat antérieure) :
	// sert au suivi « première fois » (objectif « nouvelle leçon », #178).
	const premieres: string[] = [];
	let hadActivity = false; // au moins une leçon réellement travaillée (≥1 question)
	for (const num in perLesson) {
		const { ok, total } = perLesson[num];
		if (!total) continue;
		hadActivity = true;
		const k = nsKey(num, niveauStockage(num));
		if (!s[k]) premieres.push(num);
		const e = s[k] || { attempts: 0, correct: 0, questions: 0, bestPct: 0, lastPct: 0 };
		// Fenêtre AVANT mise à jour des compteurs : la conversion de l'ancienne forme estime le
		// nombre de questions par essai depuis `questions / attempts`, qui ne doit pas déjà
		// inclure l'essai en cours (il tirerait l'estimation vers la taille de CE seul essai).
		const fenetre = essaisRecents(e);
		e.attempts++;
		e.correct += ok;
		e.questions += total;
		const pct = Math.round((ok / total) * 100);
		e.bestPct = Math.max(e.bestPct, pct);
		e.lastPct = pct;
		// Fenêtre glissante (#234), comptée en QUESTIONS depuis #541 : base de la performance
		// « récente ». L'ancienne forme est convertie puis retirée — les garder toutes deux
		// laisserait deux sources de vérité divergentes pour la même fenêtre.
		e.recents = ajouterEssaiRecent(fenetre, { ok, total });
		delete e.recentPct;
		e.lastAt = now; // dernière fois travaillée (suivi de l'espace encadrant)
		s[k] = e;
	}
	lsSet(LESSON_STATS_KEY, s);
	// Journal d'activité (#234) : un point par session finalisée, typé par contexte (#319),
	// référencé quand la session porte sur une seule leçon (#498).
	if (hadActivity) recordActivity(now, kind, ref);
	// Première rencontre : on date le premier passage (objectif « nouvelle leçon »)
	// puis on entre la leçon en révision espacée (cf. #45).
	markLessonsFirstSeen(premieres, now);
	const travaillees = Object.keys(perLesson).filter((id) => perLesson[id].total > 0);
	enterLessonsRevision(travaillees, now);
	// Franchissements de palier : MÊME liste que ci-dessus, mais l'état « acquis » dépend de
	// l'étoile, que l'appelant écrit APRÈS ce retour (cf. recordLessonRun). D'où le report à la
	// fin de la tâche courante — les microtâches s'exécutent quand la session est entièrement
	// écrite, et avant toute I/O, donc rien ne peut se perdre entre les deux.
	// Ce report est ce qui rend l'invariant STRUCTUREL, et pas seulement documenté : la frise de
	// l'espace encadrant déduit l'état d'une semaine de l'ABSENCE d'horodatage (« aucune montée
	// observée »), ce qui n'est vrai que si TOUT chemin écrivant des stats de leçon journalise
	// aussi les paliers. Les deux appels étaient jusqu'ici côte à côte chez chaque appelant, sans
	// rien pour les lier : un futur runner qui aurait oublié le second aurait fait mentir la frise
	// des semaines durant, sans que rien ne le signale (relecture qualité de PR #540).
	// Prix du report, à connaître avant de bâtir dessus : un lecteur du journal situé dans la MÊME
	// tâche que la session y verrait l'état d'AVANT. Aucun consommateur ne s'y trouve aujourd'hui
	// (l'espace encadrant s'atteint par navigation, donc dans une autre tâche), et la persistance
	// elle-même ne risque rien puisque les microtâches précèdent toute I/O — mais l'une n'implique
	// pas l'autre. Même remarque pour un changement de profil intra-tâche, hors d'atteinte via l'UI.
	// La marche porte l'instant du DÉBUT de cette fonction, celui de `lastAt` et du journal
	// d'activité, plutôt qu'un `Date.now()` relu en fin de session comme le faisaient les
	// appelants : une seule date pour toute la session, donc trois journaux qui l'attribuent à la
	// même semaine.
	queueMicrotask(() => recordMonteesPalier(travaillees, now));
}
/* ---------- Journal d'activité : sessions finalisées (#234, typé #319) ----------
   Une entrée par session d'entraînement finalisée (tout ce qui passe par
   recordLessonStats), pour le graphe d'activité de l'espace encadrant. Indépendant
   des Run, qui ne couvrent pas les leçons jouées seules. Par profil (clé préfixée),
   borné aux ACTIVITY_MAX dernières entrées.

   Format : `{ t, k, ref? }` — horodatage + TYPE de session (#319 : permet la répartition
   « par type » dans le graphe) + RÉFÉRENCE de ce qui a été travaillé (#498). Types :
   'lecon' | 'bilan' | 'sprint' (via recordLessonStats) + 'revision' | 'dictee' (sessions
   qui ne passent PAS par recordLessonStats → journalisées via recordSessionActivity).

   `ref` (#498) = id de la leçon ('lecon') ou de la liste d'orthographe ('dictee') jouée.
   Il n'a de sens que pour une session portant sur UNE seule cible : un bilan, un sprint
   ou un tour de révision espacée en couvrent plusieurs et n'en portent donc pas. Sans
   cette référence, le programme du jour ne peut attribuer une étape que par TYPE, ce qui
   l'obligeait à s'appuyer sur un marqueur posé au lancement — donc à ignorer le travail
   fait depuis une autre porte que ses tuiles (cf. core/seance.ts).

   MIGRATION : l'ancien format était un simple `number` (horodatage) ; on le lit
   encore (→ type 'inconnu') et on le réécrit au format objet au prochain passage. Les
   entrées d'avant #498 n'ont pas de `ref` : elles restent lisibles, simplement
   inattribuables autrement que par type. */
export const ACTIVITY_KEY = 'ludaskia_activity';
const ACTIVITY_MAX = 200;
export type ActivityKind = 'lecon' | 'bilan' | 'sprint' | 'revision' | 'dictee'; // enregistrables
export type ActivityKindStored = ActivityKind | 'inconnu'; // + héritage (ancien format)
const ACTIVITY_KINDS: readonly ActivityKind[] = ['lecon', 'bilan', 'sprint', 'revision', 'dictee'];
export interface ActivityEntry {
	t: number; // horodatage (ms)
	k: ActivityKindStored;
	ref?: string; // cible travaillée (id de leçon / de liste) quand la session n'en a qu'une
	/* La séance a-t-elle comporté au moins une activité qui POUVAIT faire progresser ce
	   qu'elle travaillait (#641) ? Écrit UNIQUEMENT quand la réponse est `false` : son
	   ABSENCE vaut « oui ». C'est ce qui empêche une mise à jour de décréditer les entrées
	   déjà en stockage (critère 18), et ce qui garde le journal court dans le cas courant.
	   Ne concerne aujourd'hui que les sessions de dictée (cf. `etapeSatisfaite`). */
	progressive?: boolean;
}

/** Une session a-t-elle pu faire progresser ce qu'elle travaillait (#641) ? Lecture unique
    du drapeau, absence comprise — à n'écrire qu'ici pour que « absent = oui » ne se
    réinvente pas à chaque appelant. Pur. */
export function sessionProgressive(e: ActivityEntry): boolean {
	return e.progressive !== false;
}
/* Normalise un journal brut (lu en localStorage) en entrées typées, en tolérant
   l'ANCIEN format `number[]` (chaque nombre → entrée de type 'inconnu'). Une `ref` vide
   ou non textuelle est écartée plutôt que propagée : « pas de cible » se lit à l'absence
   de la clé, un seul cas à traiter côté attribution. Pur. */
export function normalizeActivity(raw: unknown): ActivityEntry[] {
	if (!Array.isArray(raw)) return [];
	const out: ActivityEntry[] = [];
	for (const e of raw) {
		if (typeof e === 'number') {
			out.push({ t: e, k: 'inconnu' }); // ancien format : horodatage nu
		} else if (e && typeof e === 'object' && typeof (e as ActivityEntry).t === 'number') {
			const k = (e as ActivityEntry).k;
			const ref = (e as ActivityEntry).ref;
			const entry: ActivityEntry = {
				t: (e as ActivityEntry).t,
				k: (ACTIVITY_KINDS as readonly string[]).includes(k) ? (k as ActivityKind) : 'inconnu',
			};
			if (typeof ref === 'string' && ref !== '') entry.ref = ref;
			// Seul le `false` explicite est conservé (#641) : tout le reste — clé absente,
			// valeur d'un import bancal — retombe sur « la séance comptait », donc sur le
			// comportement d'avant, jamais sur un crédit retiré à l'enfant.
			if ((e as ActivityEntry).progressive === false) entry.progressive = false;
			out.push(entry);
		}
	}
	return out;
}
export function loadActivity(): ActivityEntry[] {
	return normalizeActivity(lsGet(ACTIVITY_KEY, []));
}
function recordActivity(now: number, kind: ActivityKind, ref?: string, progressive = true) {
	// Toute session finalisée, de n'importe quel type, atteste que le journal des paliers tourne
	// (cf. marquerDebutSuivi) : sans ça, un enfant qui ne ferait que des dictées et de la révision
	// espacée n'aurait aucune borne, et l'espace encadrant afficherait « aucun suivi » sur toutes
	// ses leçons alors qu'il travaille. La déduction reste juste, ces chemins n'écrivant aucune
	// stat de leçon et l'étoile ne s'obtenant que par celui qui en écrit (cf. recordLessonRun) :
	// entre une telle borne et la première session de leçon, aucun état ne peut avoir bougé.
	marquerDebutSuivi(now);
	const a = loadActivity(); // normalisé : réécrit aussi l'éventuel héritage au format objet
	const entry: ActivityEntry = ref ? { t: now, k: kind, ref } : { t: now, k: kind };
	if (!progressive) entry.progressive = false; // absent = « oui » (#641)
	a.push(entry);
	if (a.length > ACTIVITY_MAX) a.splice(0, a.length - ACTIVITY_MAX);
	lsSet(ACTIVITY_KEY, a);
}
/* Journalise une session finalisée d'un type qui NE passe PAS par recordLessonStats
   (révision espacée, dictée d'orthographe) — un point d'activité daté (#319). `ref`
   (#498) = cible travaillée quand la session n'en a qu'une (id de liste pour une dictée) ;
   omise pour la révision espacée, qui rejoue des items de plusieurs origines.
   `progressive` (#641) = la séance a-t-elle comporté au moins une activité qui POUVAIT
   faire progresser un mot ; défaut `true`, donc un appelant qui l'ignore garde son
   comportement d'avant. */
export function recordSessionActivity(kind: ActivityKind, ref?: string, progressive = true): void {
	recordActivity(Date.now(), kind, ref, progressive);
}

/* ---------- Premier passage par leçon (objectif « nouvelle leçon », #178) ----------
   Date (ms) de la 1re fois qu'une leçon est travaillée, tous modes confondus.
   On ne stocke QUE la première occurrence (jamais réécrite), si bien qu'une
   leçon déjà rencontrée avant l'arrivée de ce suivi reste « ancienne » : elle
   ne sera datée que si elle est vraiment nouvelle. */
export const LESSON_FIRST_SEEN_KEY = 'ludaskia_lessonFirstSeen';
function loadLessonFirstSeenRaw(): Record<string, number> {
	return lsGet(LESSON_FIRST_SEEN_KEY, {});
}
export function loadLessonFirstSeen(): Record<string, number> {
	return scopeActif(loadLessonFirstSeenRaw());
}
export function markLessonsFirstSeen(lessonIds: string[], now: number) {
	const all = loadLessonFirstSeenRaw();
	let changed = false;
	for (const id of lessonIds) {
		const k = nsKey(id, niveauStockage(id));
		if (all[k] == null) {
			all[k] = now;
			changed = true;
		}
	}
	if (changed) lsSet(LESSON_FIRST_SEEN_KEY, all);
}
/* Nombre de leçons découvertes (1er passage) depuis un instant donné. */
export function countNewLessonsSince(since: number): number {
	return Object.values(loadLessonFirstSeen()).filter((ts) => ts >= since).length;
}

/* ---------- Journal daté des paliers franchis « vers le haut » (frise #397) ----------
   Aucun historique daté des changements de NIVEAU n'existe ailleurs (recentPct et
   niveauNotion sont recalculés à la volée, non datés). Ce journal, sur le modèle de
   firstSeen (« écrit une fois, au bon moment, par profil »), date le PREMIER moment où
   une notion atteint « en cours » puis « acquis ». Deux horodatages max par notion
   (namespacée par niveau, comme stats/étoiles), donc structure bornée par le nombre de
   leçons — pas de rétention à gérer. Chaque horodatage présent = une « marche » datée ;
   la frise de l'espace encadrant les regroupe par semaine et par matière.

   Modèle MONOTONE (premier franchissement seulement) → aucune oscillation autour du seuil
   des 40 % (une notion qui remonte à « en cours » après y être déjà passée ne re-loggue
   pas). « acquis » repose sur l'étoile (jamais retirée), donc naturellement définitif. */
export const LESSON_PALIERS_KEY = 'ludaskia_paliers';
export interface PaliersNotion {
	enCours?: number; // ms de la 1re fois où la notion a atteint « en cours »
	acquis?: number; // ms de la 1re fois où la notion a atteint « acquis »
}
/* MISE EN SERVICE du journal pour ce profil : horodatage écrit une seule fois, à la première
   fin de session qui passe par recordMonteesPalier. Sans cette borne, un horodatage ABSENT est
   ambigu — « aucun cap franchi » ou « rien n'était encore journalisé » — et l'espace encadrant
   ne peut rien affirmer d'une semaine ancienne. Le plus ancien franchissement du profil sert de
   repli (il PROUVE que le journal tournait déjà), mais il reste muet tant qu'aucun cap n'est
   franchi, c'est-à-dire précisément chez l'enfant qui débute. */
export const PALIERS_DEBUT_KEY = 'ludaskia_paliersDepuis';
/* Pose la borne si elle manque, jamais deux fois : ce qu'elle date, c'est le journal EN SERVICE,
   pas un franchissement. Appelée par toute session finalisée (`recordActivity`) et par
   `recordMonteesPalier`, qui couvre en plus la session sans aucune question. */
function marquerDebutSuivi(now: number) {
	if (lsGet(PALIERS_DEBUT_KEY, null) == null) lsSet(PALIERS_DEBUT_KEY, now);
}
function loadPaliersRaw(): Record<string, PaliersNotion> {
	return lsGet(LESSON_PALIERS_KEY, {});
}
/* Enregistre les franchissements de palier pour les leçons TRAVAILLÉES dans une session
   (profil ACTIF). Appelé par `recordLessonStats` LUI-MÊME, en microtâche, une fois l'étoile
   écrite (dont dépend l'état « acquis ») : aucun appelant applicatif n'a donc à s'en soucier,
   et c'est voulu — cf. le commentaire du report là-bas. Reste exporté parce que les tests
   l'exercent directement, la règle de franchissement méritant d'être éprouvée sans monter
   une session entière. `now` daté par l'appelant (testable). Un saut direct « à renforcer » →
   « acquis » ne compte qu'UNE marche (« acquis ») : on ne fabrique pas rétroactivement un
   palier « en cours ». */
export function recordMonteesPalier(lessonIds: string[], now: number) {
	// Borne de mise en service : posée même si cette session ne franchit aucun palier, et même si
	// la liste est vide — cas qu'aucun point d'activité ne couvre, faute de session à journaliser.
	marquerDebutSuivi(now);
	const paliers = loadPaliersRaw();
	const stars = loadStarsRaw();
	const stats = loadLessonStatsRaw();
	let changed = false;
	for (const id of lessonIds) {
		const k = nsKey(id, niveauStockage(id));
		const niveau = niveauNotion(stats[k], (stars[k] || 0) > 0);
		const rec = paliers[k] ?? {};
		if (niveau === 'acquis' && rec.acquis == null) {
			rec.acquis = now;
			paliers[k] = rec;
			changed = true;
		} else if (niveau === 'en-cours' && rec.enCours == null) {
			rec.enCours = now;
			paliers[k] = rec;
			changed = true;
		}
		// « à découvrir » / « à renforcer » : pas un palier franchi vers le haut → rien.
	}
	if (changed) lsSet(LESSON_PALIERS_KEY, paliers);
}

/* ---------- Révision espacée des leçons (maths / conjugaison) ----------
   État SR par leçon (les mots d'orthographe ont le leur dans MotOrtho.revision).
   La logique d'escalier est dans revision.ts (pure) ; ici, persistance + hooks. */
export const LESSON_REVISION_KEY = 'ludaskia_lessonRevision';
function loadLessonRevisionsRaw(): Record<string, EtatRevision> {
	return lsGet(LESSON_REVISION_KEY, {});
}
export function loadLessonRevisions(): Record<string, EtatRevision> {
	return scopeActif(loadLessonRevisionsRaw());
}
/* Leçons en rotation au niveau immédiatement INFÉRIEUR au niveau actif de leur matière
   (#232). `loadLessonRevisions` (vue scopée) les exclut par construction : leur état
   restait stocké mais n'était plus jamais reproposé — un CM1 cessait d'entretenir ses
   notions CE2 encore en cours de consolidation, qui se dégradaient alors que le CM1
   s'appuie dessus. Ce loader les expose SÉPARÉMENT, avec leur niveau de stockage, parce
   que la séance les traite comme une source secondaire PLAFONNÉE (cf. `plafondBasNiveau`) :
   les fondre dans la vue scopée les aurait mises en concurrence directe avec le niveau
   actif sur le retard, que leurs mois d'échéances dépassées leur font gagner d'office.
   Le niveau porté ici est celui de la CLÉ, pas un niveau recalculé : c'est lui qui doit
   servir à générer l'exercice ET à réécrire l'état, sinon la réussite s'inscrirait sur la
   clé du niveau actif et l'entrée basse resterait due à jamais.
   Un seul niveau d'écart, et rien au-dessus du niveau actif (cf. niveauInferieurImmediat).
   La forme `LeconBasNiveau` appartient à `revision-select.ts` (contrat de la sélection,
   pur) ; ce module en est seulement le producteur — lui seul sait lire le profil. */
export function loadLessonRevisionsBasNiveau(): LeconBasNiveau[] {
	const raw = loadLessonRevisionsRaw();
	const cache: Record<string, SchoolLevel | undefined> = {};
	const out: LeconBasNiveau[] = [];
	for (const k in raw) {
		const lessonId = lessonOfKey(k);
		const lesson = getLessonById(lessonId);
		if (!lesson) continue; // leçon sortie du catalogue → ignorée, comme dans la sélection
		const subject = lesson.subject;
		if (!(subject in cache)) {
			cache[subject] = niveauInferieurImmediat(niveauActifMatiere(subject));
		}
		const attendu = cache[subject];
		if (attendu === undefined || niveauOfKey(k) !== attendu) continue;
		out.push({ lessonId, niveau: attendu, etat: raw[k] });
	}
	return out;
}
function saveLessonRevisions(r: Record<string, EtatRevision>) {
	lsSet(LESSON_REVISION_KEY, r);
}
/* Entrée en rotation à la première rencontre (1er re-test dès J+1), sans
   rendre la leçon due immédiatement. */
export function enterLessonsRevision(lessonIds: string[], now: number) {
	const all = loadLessonRevisionsRaw();
	let changed = false;
	for (const id of lessonIds) {
		const k = nsKey(id, niveauStockage(id));
		if (!all[k]) {
			all[k] = etatNeuf(now);
			changed = true;
		}
	}
	if (changed) saveLessonRevisions(all);
}
/* Reprise : injecte en rotation les leçons déjà rencontrées (stats présentes)
   mais jamais entrées en révision espacée — activité antérieure à l'arrivée du
   mode Révision, qu'aucune migration ne rattrapait. `now` doit être daté de J-1
   par l'appelant → 1er re-test échu dès aujourd'hui (leçons dues immédiatement).
   Idempotent : `enterLessonsRevision` ne touche pas les leçons déjà en rotation. */
export function backfillLessonRevisions(now: number) {
	const stats = loadLessonStats();
	const ids = Object.keys(stats).filter((id) => (stats[id]?.questions ?? 0) > 0);
	enterLessonsRevision(ids, now);
}

/* Éléments dus AUJOURD'HUI pour le profil actif, tels que la séance les proposera : mots
   d'orthographe + leçons du niveau actif + la dose d'entretien du niveau inférieur (#232).
   Point de passage UNIQUE des trois écrans qui posent la même question (carte d'accueil,
   tuile de séance, rappel de navigation) : ils doivent rester d'accord entre eux ET avec la
   séance. Depuis #232 la réponse dépend du plafond (l'entretien y est proportionné) —
   reconstruire l'appel dans chaque écran laisserait le premier oubli dire « rien à réviser »
   alors que la séance a de quoi tourner. `ortho` et `plafond` viennent de l'appelant : les
   lire ici créerait un cycle d'imports (profiles.ts importe déjà ce module). */
export function countDusSeance(ortho: OrthoState, now: number, plafond: number): number {
	return countDue(ortho, loadLessonRevisions(), now, plafond, loadLessonRevisionsBasNiveau());
}

/* ---------- Rotation de révision d'un profil DONNÉ (espace encadrant, #478) ----------
   Variantes par UUID de l'entrée en rotation : l'adulte déclare depuis l'espace
   encadrant des leçons « déjà vues en classe » sur le profil CONSULTÉ, qui n'est pas
   forcément l'actif — on écrit donc en clé RÉELLE (lsGetRaw/lsSetRaw), sans jamais
   basculer le profil actif (même invariant que setPrefFor / loadRevoirFor). Les clés
   sont déjà namespacées par l'appelant : le niveau vient du profil consulté, pas du
   niveau actif (que `nsKey`/`niveauStockage` utiliseraient).
   Écritures SILENCIEUSES : marquer le profil modifié (`touchProfile`) reviendrait à
   importer `profiles.ts`, qui importe déjà ce module (cycle). C'est donc à l'appelant de
   le faire — `vu-ailleurs.ts:declarerVuAilleursFor` s'en charge pour ces deux fonctions. */
function revisionsFor(uuid: string): Record<string, EtatRevision> {
	return lsGetRaw(uuid + '/' + LESSON_REVISION_KEY, {}) as Record<string, EtatRevision>;
}
export function enterLessonsRevisionFor(uuid: string, cles: string[], now: number): void {
	const all = revisionsFor(uuid);
	let changed = false;
	for (const k of cles) {
		if (!all[k]) {
			all[k] = etatNeuf(now);
			changed = true;
		}
	}
	if (changed) lsSetRaw(uuid + '/' + LESSON_REVISION_KEY, JSON.stringify(all));
}
/* Annulation d'une déclaration « vu en classe » : retire l'état SR des clés données,
   SAUF s'il vient d'un vrai passage dans l'appli — leçon déjà travaillée (stat) ou
   état déjà re-testé au moins une fois (`dernierTest`). On ne détruit jamais un
   progrès de révision réel ; on ne défait que ce que la déclaration avait créé. */
export function retirerRevisionsDeclareesFor(uuid: string, cles: string[]): void {
	const all = revisionsFor(uuid);
	const stats = lsGetRaw(uuid + '/' + LESSON_STATS_KEY, {}) as Record<string, LessonStat>;
	let changed = false;
	for (const k of cles) {
		const e = all[k];
		if (!e || e.dernierTest != null) continue; // absent, ou déjà révisé pour de vrai
		if ((stats[k]?.questions ?? 0) > 0) continue; // déjà travaillée dans l'appli
		delete all[k];
		changed = true;
	}
	if (changed) lsSetRaw(uuid + '/' + LESSON_REVISION_KEY, JSON.stringify(all));
}

/* ---------- Avancement / report de la leçon du jour (#485) ----------
   État par leçon de l'avancement « leçon du jour » : meilleur score sur un essai
   COMPLET en mode leçon (critère d'avancement, cf. report-lecon.ts) et report en
   cours. Namespacé par niveau comme les étoiles et les stats, donc structure bornée
   par le nombre de leçons (aucune rétention à gérer).

   Écrit UNIQUEMENT depuis un essai en mode leçon : le sprint, les bilans et la révision
   espacée peuvent ne poser qu'une question sur une leçon, leur score n'est pas comparable
   à celui d'une série complète (c'est justement pourquoi la fenêtre récente de `LessonStat`
   ne peut pas servir de critère d'avancement — et ça reste vrai depuis qu'elle est
   PONDÉRÉE (#541) : pondérer corrige le poids d'un item dans une moyenne, ça ne fait pas
   d'un item la preuve qu'une série complète est réussie). */
export const LESSON_REPORT_KEY = 'ludaskia_leconReport';
function loadLessonReportsRaw(): Record<string, EtatReport> {
	return lsGet(LESSON_REPORT_KEY, {});
}
/* Vue scopée au niveau actif (clés = id de leçon nu), comme `loadStars`. */
export function loadLessonReports(): Record<string, EtatReport> {
	return scopeActif(loadLessonReportsRaw());
}
/* Enregistre un essai complet en mode leçon (`pct` = % de bonnes réponses) et renvoie
   l'état obtenu. `now` daté par l'appelant (testable). */
export function recordEssaiLecon(
	lessonId: string,
	pct: number,
	now: number,
	etoilee = false,
): EtatReport {
	const all = loadLessonReportsRaw();
	const k = nsKey(lessonId, niveauStockage(lessonId));
	const etat = apresEssaiLecon(all[k], pct, now, etoilee);
	all[k] = etat;
	lsSet(LESSON_REPORT_KEY, all);
	return etat;
}

/* ---------- Mémoire de l'exemple d'avant-série (#490) ----------
   « Une fois par ÉPISODE de blocage », et non « une fois pour toujours » comme la mémoire
   des aides au geste (`AIDE_VUE_KEY`, core/aide.ts) — même si le calibrage actuel ne rend
   qu'un seul épisode atteignable par leçon et par niveau (cf. `episodeEtayable`, qui porte
   le raisonnement). On mémorise donc, par leçon, l'ÉPISODE déjà couvert —
   l'horodatage du report qui l'a ouvert (`episodeEtayable`, core/etayage.ts) : une
   signature stable et directement comparable, là où un booléen ne saurait pas distinguer
   deux blocages et une date demanderait une règle d'expiration de plus.
   Namespacé par niveau comme le report dont il dépend, donc borné par le nombre de
   leçons (aucune rétention à gérer). */
export const ETAYAGE_VU_KEY = 'ludaskia_etayageVu';
/* Vue scopée au niveau actif (clés = id de leçon nu), comme `loadLessonReports`. */
export function loadEtayagesVus(): Record<string, number> {
	return scopeActif(lsGet(ETAYAGE_VU_KEY, {}) as Record<string, number>);
}
export function marquerEtayageVu(lessonId: string, episode: number): void {
	const all = lsGet(ETAYAGE_VU_KEY, {}) as Record<string, number>;
	all[nsKey(lessonId, niveauStockage(lessonId))] = episode;
	lsSet(ETAYAGE_VU_KEY, all);
}

/* Met à jour l'état SR d'une leçon après une réponse en révision. `niveau` force le
   niveau de la clé écrite : la séance peut proposer une leçon en rotation à un niveau
   INFÉRIEUR au niveau actif (#232), et c'est ce niveau-là qu'il faut faire avancer.
   Sans lui, `niveauStockage` renverrait le niveau actif et la réussite s'inscrirait sur
   une AUTRE clé — l'entrée basse resterait éternellement due, et une entrée fantôme
   apparaîtrait au niveau actif. Absent = niveau de stockage habituel. */
export function avancerLessonRevision(
	lessonId: string,
	reussi: boolean,
	now: number,
	niveau?: SchoolLevel,
) {
	const all = loadLessonRevisionsRaw();
	const k = nsKey(lessonId, niveau ?? niveauStockage(lessonId));
	all[k] = avancerEtat(all[k] ?? etatNeuf(now), reussi, now);
	saveLessonRevisions(all);
}

/* ---------- Migration : namespacing de la progression par niveau (#225) ----------
   Renomme une fois les clés « pleines » (legacy, sans `@`) de chaque carte vers
   `@ce2` (tout l'existant était CE2). Idempotente. Doit tourner À L'ACTIVATION
   d'un profil AVANT migrateRevisions (qui écrit, lui, des clés namespacées). */
function migrateMapNamespacing(storageKey: string): void {
	const raw = lsGet(storageKey, {}) as Record<string, unknown>;
	let changed = false;
	const out: Record<string, unknown> = {};
	for (const k in raw) {
		if (k.includes('@')) out[k] = raw[k];
		else {
			out[nsKey(lessonOfKey(k), NIVEAU_LEGACY)] = raw[k];
			changed = true;
		}
	}
	// Écriture « silencieuse » : une migration ne doit pas bumper updatedAt.
	if (changed) lsSetQuiet(storageKey, out);
}
/* Records (#233) : la clé legacy GLOBALE `ludaskia_runs_<mode>` (tout l'existant
   était CE2) est renommée vers `…@ce2`. Idempotente et silencieuse. On préserve une
   éventuelle clé `@ce2` déjà présente (pas d'écrasement) ; en pratique l'écriture
   passe désormais toujours par une clé namespacée, donc la legacy ne coexiste avec
   `@ce2` que le temps de cette migration. */
const RUN_MODES = ['sprint', 'express', 'complet', 'revision-espacee']; // 'lecon' n'enregistre pas de run
function migrateRunsNamespacing(): void {
	for (const mode of RUN_MODES) {
		const legacyKey = RUNS_KEY(mode);
		const legacy = lsGet(legacyKey, null) as Run[] | null;
		if (legacy == null) continue; // rien de legacy à migrer
		const cible = runsKey(mode, NIVEAU_LEGACY);
		if (lsGet(cible, null) == null) lsSetQuiet(cible, legacy);
		lsRemoveQuiet(legacyKey);
	}
}
export function migrateNiveauNamespacing(): void {
	migrateMapNamespacing(STARS_KEY);
	migrateMapNamespacing(LESSON_STATS_KEY);
	migrateMapNamespacing(LESSON_FIRST_SEEN_KEY);
	migrateMapNamespacing(LESSON_REVISION_KEY);
	migrateRunsNamespacing();
}

/* ---------- XP global (1 point par bonne réponse, tous modes) ---------- */
export const XP_KEY = 'ludaskia_xp';
export function getXP(): number {
	return lsGet(XP_KEY, 0);
}
export function addXP(n: number) {
	if (n <= 0) return;
	lsSet(XP_KEY, getXP() + n);
}

/* ---------- Niveaux dérivés de l'XP (1 → NIVEAU_MAX) ----------
   On n'affiche pas l'XP brute mais un niveau. L'XP totale (XP_KEY)
   reste l'unique source de vérité : le niveau en est *dérivé* par une
   fonction pure (aucune migration, testable sans DOM).

   Courbe « de plus en plus dure » : le coût pour passer du niveau L au
   niveau L+1 croît en puissance →
     xpVersSuivant(L) = round(XP_COEFF × L^XP_EXPOSANT)
   Calibrage (validé avec un avis pédagogique CE2, 1 XP = 1 bonne réponse) :
     - palier 1→2 = 12 XP : une leçon isolée (~10 bonnes réponses) fait gagner
       *au plus 1 niveau* en début de jeu (vs ~3 niveaux auparavant) ;
     - niveau 10 ≈ 445 XP (~1-2 semaines), niveau 50 ≈ 10 100 XP (~quelques
       mois), niveau 100 ≈ 37 900 XP (horizon « plusieurs mois », atteignable) ;
     - exposant < 1.5 : la courbe ralentit mais le dernier palier (99→100)
       reste ~717 XP — franchissable en quelques sessions, pas un mur.
   Deux constantes à régler pour recalibrer (coefficient = générosité globale,
   exposant = vitesse à laquelle les paliers se durcissent). */
export const NIVEAU_MAX = 100;
const XP_COEFF = 12;
const XP_EXPOSANT = 0.89;

// Coût en XP pour passer du niveau `niveau` au niveau suivant.
export function xpVersSuivant(niveau: number): number {
	return Math.round(XP_COEFF * Math.pow(niveau, XP_EXPOSANT));
}

// XP cumulée nécessaire pour *atteindre* `niveau` (niveau 1 ⇒ 0 XP).
export function xpPourNiveau(niveau: number): number {
	let total = 0;
	for (let l = 1; l < niveau; l++) total += xpVersSuivant(l);
	return total;
}

// Niveau courant déduit de l'XP totale, plafonné à NIVEAU_MAX.
export function niveauDepuisXP(xp: number): number {
	let niveau = 1;
	while (niveau < NIVEAU_MAX && xp >= xpPourNiveau(niveau + 1)) niveau++;
	return niveau;
}

export interface ProgressionNiveau {
	niveau: number; // niveau courant (1 à NIVEAU_MAX)
	xpDansNiveau: number; // XP déjà acquise dans le niveau courant
	xpRequisPalier: number; // XP nécessaire pour finir le niveau courant (0 au max)
	pct: number; // progression du palier en cours, 0 à 100
	max: boolean; // niveau maximum atteint
}

// Détail de progression pour l'affichage (badge + barre).
export function progressionNiveau(xp: number): ProgressionNiveau {
	const niveau = niveauDepuisXP(xp);
	if (niveau >= NIVEAU_MAX) {
		return { niveau: NIVEAU_MAX, xpDansNiveau: 0, xpRequisPalier: 0, pct: 100, max: true };
	}
	const xpRequisPalier = xpVersSuivant(niveau);
	const xpDansNiveau = xp - xpPourNiveau(niveau);
	const pct = Math.min(100, Math.round((xpDansNiveau / xpRequisPalier) * 100));
	return { niveau, xpDansNiveau, xpRequisPalier, pct, max: false };
}
