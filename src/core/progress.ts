/* ============================================================
   Progression persistée : records de bilans, série de jours,
   étoiles et statistiques par leçon. (localStorage via lsGet/lsSet)
   ============================================================ */
import { fmt } from './utils';
import { lsGet, lsSet, lsSetQuiet, lsRemoveQuiet } from './storage';
import { getAllLessons, getLessonById } from './catalog';
import type { SchoolLevel } from './catalog';
import { LEVEL_ORDER } from './levels';
import { niveauActif, niveauActifMatiere, niveauLecon } from './niveau-actif';
import { etatNeuf, avancerEtat } from './revision';
import type { EtatRevision } from './orthographe/types';

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
   exclue de la vue. Mémoïse le niveau par matière (peu de matières). */
function scopeActif<V>(raw: Record<string, V>): Record<string, V> {
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

/* Bornes de période calendaire (pour les objectifs de régularité) */
export function startOfWeek() {
	const d = new Date();
	const day = (d.getDay() + 6) % 7; // lundi = 0
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - day);
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

/* Enregistre l'essai courant et calcule médaille / rang / record */
export function recordRun(mode: string, ok: number, count: number, ms: number) {
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
// Taille de la fenêtre glissante des derniers essais d'une leçon (#234) : « à revoir »
// et l'état d'acquisition de l'espace encadrant se fondent sur la performance RÉCENTE,
// pas sur le cumul historique (lessonAvgPct), qui sous-estime un enfant ayant progressé.
const RECENT_MAX = 5;
export interface LessonStat {
	attempts: number;
	correct: number;
	questions: number;
	bestPct: number;
	lastPct: number;
	/** % des RECENT_MAX derniers essais (fenêtre glissante, non bornée par dates : un enfant
	 *  qui espace ses essais ne perd pas la visu). Absent sur les données antérieures à #234. */
	recentPct?: number[];
}
function loadLessonStatsRaw(): Record<string, LessonStat> {
	return lsGet(LESSON_STATS_KEY, {});
}
export function loadLessonStats() {
	return scopeActif(loadLessonStatsRaw());
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
) {
	const s = loadLessonStatsRaw();
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
		e.attempts++;
		e.correct += ok;
		e.questions += total;
		const pct = Math.round((ok / total) * 100);
		e.bestPct = Math.max(e.bestPct, pct);
		e.lastPct = pct;
		// Fenêtre glissante des derniers % (#234) : base de la performance « récente ».
		e.recentPct = [...(e.recentPct ?? []), pct].slice(-RECENT_MAX);
		s[k] = e;
	}
	lsSet(LESSON_STATS_KEY, s);
	const now = Date.now();
	// Journal d'activité (#234) : un point par session finalisée, typé par contexte (#319).
	if (hadActivity) recordActivity(now, kind);
	// Première rencontre : on date le premier passage (objectif « nouvelle leçon »)
	// puis on entre la leçon en révision espacée (cf. #45).
	markLessonsFirstSeen(premieres, now);
	enterLessonsRevision(
		Object.keys(perLesson).filter((id) => perLesson[id].total > 0),
		now,
	);
}
export const lessonAvgPct = (e: any) =>
	e && e.questions ? Math.round((e.correct / e.questions) * 100) : null;
/* Moyenne des derniers essais (fenêtre glissante recentPct) ; null si aucun historique
   récent (repli sur lessonAvgPct laissé à l'appelant). Performance RÉCENTE pour l'espace
   encadrant (#234), distincte du cumul historique de lessonAvgPct. */
export const recentAvgPct = (e: any): number | null =>
	e && Array.isArray(e.recentPct) && e.recentPct.length
		? Math.round(e.recentPct.reduce((sum: number, p: number) => sum + p, 0) / e.recentPct.length)
		: null;

/* ---------- Journal d'activité : sessions finalisées (#234, typé #319) ----------
   Une entrée par session d'entraînement finalisée (tout ce qui passe par
   recordLessonStats), pour le graphe d'activité de l'espace encadrant. Indépendant
   des Run, qui ne couvrent pas les leçons jouées seules. Par profil (clé préfixée),
   borné aux ACTIVITY_MAX dernières entrées.

   Format : `{ t, k }` — horodatage + TYPE de session (#319 : permet la répartition
   « par type » dans le graphe). Types : 'lecon' | 'bilan' | 'sprint' (via
   recordLessonStats) + 'revision' | 'dictee' (sessions qui ne passent PAS par
   recordLessonStats → journalisées via recordSessionActivity).
   MIGRATION : l'ancien format était un simple `number` (horodatage) ; on le lit
   encore (→ type 'inconnu') et on le réécrit au format objet au prochain passage. */
export const ACTIVITY_KEY = 'ludaskia_activity';
const ACTIVITY_MAX = 200;
export type ActivityKind = 'lecon' | 'bilan' | 'sprint' | 'revision' | 'dictee'; // enregistrables
export type ActivityKindStored = ActivityKind | 'inconnu'; // + héritage (ancien format)
const ACTIVITY_KINDS: readonly ActivityKind[] = ['lecon', 'bilan', 'sprint', 'revision', 'dictee'];
export interface ActivityEntry {
	t: number; // horodatage (ms)
	k: ActivityKindStored;
}
/* Normalise un journal brut (lu en localStorage) en entrées typées, en tolérant
   l'ANCIEN format `number[]` (chaque nombre → entrée de type 'inconnu'). Pur. */
export function normalizeActivity(raw: unknown): ActivityEntry[] {
	if (!Array.isArray(raw)) return [];
	const out: ActivityEntry[] = [];
	for (const e of raw) {
		if (typeof e === 'number') {
			out.push({ t: e, k: 'inconnu' }); // ancien format : horodatage nu
		} else if (e && typeof e === 'object' && typeof (e as ActivityEntry).t === 'number') {
			const k = (e as ActivityEntry).k;
			out.push({
				t: (e as ActivityEntry).t,
				k: (ACTIVITY_KINDS as readonly string[]).includes(k) ? (k as ActivityKind) : 'inconnu',
			});
		}
	}
	return out;
}
export function loadActivity(): ActivityEntry[] {
	return normalizeActivity(lsGet(ACTIVITY_KEY, []));
}
function recordActivity(now: number, kind: ActivityKind) {
	const a = loadActivity(); // normalisé : réécrit aussi l'éventuel héritage au format objet
	a.push({ t: now, k: kind });
	if (a.length > ACTIVITY_MAX) a.splice(0, a.length - ACTIVITY_MAX);
	lsSet(ACTIVITY_KEY, a);
}
/* Journalise une session finalisée d'un type qui NE passe PAS par recordLessonStats
   (révision espacée, dictée d'orthographe) — un point d'activité daté (#319). */
export function recordSessionActivity(kind: ActivityKind): void {
	recordActivity(Date.now(), kind);
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

/* Met à jour l'état SR d'une leçon après une réponse en révision. */
export function avancerLessonRevision(lessonId: string, reussi: boolean, now: number) {
	const all = loadLessonRevisionsRaw();
	const k = nsKey(lessonId, niveauStockage(lessonId));
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
