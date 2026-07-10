/* ============================================================
   Espace encadrant (#234) — lecture de la progression PAR PROFIL,
   sans changer le profil actif.
   ------------------------------------------------------------
   Tout le reste de l'app lit le profil ACTIF (clés préfixées par
   `activePrefix`) et le niveau ACTIF (niveau-actif.ts lit meta.active).
   Le tableau de bord doit consulter N'IMPORTE QUEL profil par UUID :
   on lit donc les clés BRUTES `uuid + '/' + KEY` (sur le modèle de
   getXPFor, profiles.ts) et on résout le niveau depuis la méta du
   profil ciblé. Module de logique pure (sans DOM), testable seul.

   INVARIANT : aucune fonction ici n'écrit `meta.active` ni n'appelle
   setActivePrefix — la consultation ne bascule jamais l'enfant courant.

   Portée v1 : le récap couvre le catalogue LessonDef (maths + grammaire/
   conjugaison/vocabulaire + accords/homophones d'orthographe). Les dictées
   de mots (store orthographe dynamique) ont leur propre modèle de maîtrise
   et ne sont pas agrégées ici (suivi possible ultérieurement).
   ============================================================ */
import { lsGet, lsGetRaw, lsSetRaw } from './storage';
import {
	STARS_KEY,
	LESSON_STATS_KEY,
	LESSON_FIRST_SEEN_KEY,
	ACTIVITY_KEY,
	lessonAvgPct,
	recentAvgPct,
	loadLessonStats,
	loadStars,
	normalizeActivity,
	type LessonStat,
} from './progress';
import {
	getAllLessons,
	getLessonsByCategory,
	CATEGORIES,
	SUBJECTS,
	type LessonDef,
	type SchoolLevel,
	type SubjectId,
} from './catalog';
import { niveauDefautCatalogue } from './levels';
import { niveauActifMatiere } from './niveau-actif';
import type { Profile } from './profiles';

/* ---------- Seuils (réglables) ---------- */
// Échelle d'acquisition (type LSU). Le % récent PILOTE l'état mais n'est jamais
// affiché en nombre (avis pédagogique : un parent lit « 64 % » comme une note).
const SEUIL_NON_ACQUIS = 40; // perf récente < 40 % → « non acquis »
const SEUIL_REVOIR = 70; // perf récente < 70 % → proposé « à revoir » (cf. WEAK_PCT, rewards.ts)
const RECENT_FENETRE_NOUVELLES_MS = 30 * 86400000; // « notions maîtrisées récemment » : 30 jours
const JOURS_ACTIVITE = 7; // graphe d'activité : 7 derniers jours
// Tendance par notion : dérivée de la fenêtre glissante recentPct, JAMAIS présentée en note.
// Sous ce nombre d'essais, aucun signal (un signal sur trop peu d'essais serait du bruit lu comme
// une régression — avis pédago). Seuil = écart de % moyen entre 1re et 2de moitié de la fenêtre.
const TENDANCE_MIN_ESSAIS = 4;
const TENDANCE_SEUIL = 10;

export type NiveauNotion = 'a-decouvrir' | 'non-acquis' | 'en-cours' | 'acquis';
export type TendanceNotion = 'progresse' | 'stable' | 'a-relancer';

/* ---------- File « à revoir » (suggestions de l'encadrant) ----------
   IDs de leçons épinglées par l'encadrant ; rendues comme une carte sur l'accueil
   de l'enfant (cf. ui/a-revoir-card.ts). Stockée par profil (clé préfixée). */
export const REVOIR_KEY = 'ludaskia_revoir';
/* File du profil ACTIF (lecture sur l'accueil enfant). */
export function loadRevoir(): string[] {
	const v = lsGet(REVOIR_KEY, []);
	return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}
/* File d'un profil donné par UUID (consultation/écriture côté encadrant). */
export function loadRevoirFor(uuid: string): string[] {
	const v = lsGetRaw(uuid + '/' + REVOIR_KEY, []);
	return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}
function saveRevoirFor(uuid: string, ids: string[]) {
	// Écriture BRUTE dans le profil ciblé (pas l'actif) : on ne bascule pas l'enfant.
	lsSetRaw(uuid + '/' + REVOIR_KEY, JSON.stringify(ids));
}
/* Épingle/désépingle une leçon pour un profil. Renvoie la nouvelle file. */
export function toggleRevoirFor(uuid: string, lessonId: string): string[] {
	const ids = loadRevoirFor(uuid);
	const next = ids.includes(lessonId) ? ids.filter((x) => x !== lessonId) : [...ids, lessonId];
	saveRevoirFor(uuid, next);
	return next;
}

/* ---------- Résolution du niveau d'un profil ARBITRAIRE ----------
   Réplique niveauActifMatiere (niveau-actif.ts) mais paramétré par profil, sans
   lire meta.active : ajustement par matière, sinon classe de référence, sinon défaut
   (niveauDefautCatalogue, source unique dans levels.ts — #351). */
export function niveauProfilMatiere(profile: Profile, subject: SubjectId): SchoolLevel {
	return (
		profile.niveauParMatiere?.[subject] ??
		profile.niveauReference ??
		niveauDefautCatalogue(getAllLessons())
	);
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

/* ---------- Récap par profil ---------- */
export interface RecapCategorie {
	categoryId: string;
	label: string;
	subject: SubjectId;
	acquis: number;
	enCours: number;
	nonAcquis: number;
	aDecouvrir: number;
	total: number;
	travaillees: number; // leçons déjà abordées (≥ 1 session) = total − aDecouvrir ; sert à équilibrer la couverture
	/** Détail par leçon (état + épinglage) : alimente le dépliage « voir le détail » et
	   l'épinglage de N'IMPORTE quelle leçon, même non abordée (#234). */
	lecons: RecapNotion[];
}
/* Agrégat au niveau d'une MATIÈRE (roll-up des catégories de même sujet) : donne au
   parent une vue « couverture » d'un coup d'œil pour équilibrer entre matières. */
export interface RecapMatiere {
	subject: SubjectId;
	label: string;
	travaillees: number; // leçons abordées dans la matière
	acquis: number; // leçons acquises (étoilées) dans la matière
	total: number; // leçons du périmètre (niveau du profil) dans la matière
}
export interface RecapNotion {
	lessonId: string;
	label: string;
	niveau: NiveauNotion;
	pctRecent: number | null; // sert au tri/seuil — JAMAIS affiché en nombre côté UI
	epingle: boolean; // présente dans la file « à revoir »
	vues: number; // nombre de sessions travaillées (stat.attempts) ; 0 si jamais abordée
	derniereFois: number | null; // horodatage (ms) de la dernière session (stat.lastAt), null si inconnue
	tendance: TendanceNotion | null; // direction récente (recentPct) ; null si trop peu d'essais
}
export interface RecapProfil {
	uuid: string;
	parMatiere: RecapMatiere[]; // roll-up par matière (couverture), matières non vides au niveau du profil
	parCategorie: RecapCategorie[]; // catégories non vides au niveau du profil
	totalMaitrisees: number; // notions acquises (étoilées) au niveau du profil
	totalLecons: number; // notions du périmètre (niveau du profil)
	nouvellesRecentes: number; // notions maîtrisées dont la 1re rencontre date de < 30 j
	aRevoir: RecapNotion[]; // notions faibles (perf récente < 70 %), triées, UI cape à 3
	activite7j: JourActivite[]; // activité par jour, 7 derniers (index 6 = aujourd'hui), avec répartition par type
}

/* Activité d'un jour : total + détail par type de session (#319). `inconnu` =
   sessions de l'ancien format (sans type) ; en pratique quasi toujours 0. */
export interface JourActivite {
	total: number;
	lecon: number;
	bilan: number;
	sprint: number;
	revision: number;
	dictee: number;
	inconnu: number;
}

/* Début du jour LOCAL d'un horodatage (ms) — base des différences en jours CALENDAIRES
   (graphe d'activité + « dernière fois travaillée »). Pur. */
function startOfDay(ts: number): number {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/* Libellé « dernière fois travaillée » pour l'espace encadrant, lisible pour un parent :
   relatif sur la semaine écoulée (aujourd'hui / hier / il y a N jours), date absolue au-delà.
   `now` injecté (testable). Pur. Renvoie '' si aucune date connue (leçon jamais travaillée
   ou donnée antérieure à l'arrivée de ce suivi). */
export function libelleDerniereFois(ts: number | null, now: number): string {
	if (ts == null) return '';
	const jours = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);
	if (jours <= 0) return "aujourd'hui";
	if (jours === 1) return 'hier';
	if (jours <= 7) return `il y a ${jours} jours`;
	return (
		'le ' +
		new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
	);
}

/* Activité par jour ET par type sur les `n` derniers jours (index n-1 = aujourd'hui).
   `activity` est le journal BRUT (lu en localStorage) : normalizeActivity tolère
   l'ancien format (nombres → 'inconnu') ET le nouveau, c'est donc l'unique frontière
   de normalisation. Pur (déterministe pour un `now` donné). Exporté pour test. */
export function activiteParJourParType(
	activity: unknown,
	now: number,
	n = JOURS_ACTIVITE,
): JourActivite[] {
	const today = startOfDay(now);
	const jours: JourActivite[] = Array.from({ length: n }, () => ({
		total: 0,
		lecon: 0,
		bilan: 0,
		sprint: 0,
		revision: 0,
		dictee: 0,
		inconnu: 0,
	}));
	for (const e of normalizeActivity(activity)) {
		const diff = Math.round((today - startOfDay(e.t)) / 86400000);
		if (diff >= 0 && diff < n) {
			const j = jours[n - 1 - diff];
			j.total++;
			j[e.k]++; // e.k ∈ {lecon,bilan,sprint,inconnu} ⊆ clés numériques de JourActivite
		}
	}
	return jours;
}

/* Compteur de sessions par jour (totaux seuls) — vue « Total » du graphe et tests
   existants. Dérivé de la version par type. Pur. Exporté pour test. */
export function activiteParJour(activity: unknown, now: number, n = JOURS_ACTIVITE): number[] {
	return activiteParJourParType(activity, now, n).map((j) => j.total);
}

/* Échelle Y « ronde » du graphe d'activité à partir du max journalier (#319) : pas = 1
   si max ≤ 5, sinon ≈ max/4 ; sommet = multiple du pas ≥ max ; graduations du sommet à 0.
   Pure (logique de calcul sortie de l'UI pour être testable). Exportée pour test. */
export function echelleActivite(max: number): { top: number; step: number; ticks: number[] } {
	const m = Math.max(1, Math.round(max));
	const step = m <= 5 ? 1 : Math.ceil(m / 4);
	const top = Math.ceil(m / step) * step;
	const ticks: number[] = [];
	for (let v = top; v >= 0; v -= step) ticks.push(v);
	return { top, step, ticks };
}

/* Tableau de bord d'un profil (par UUID), SANS changer le profil actif.
   `now` injecté pour testabilité (l'UI passe Date.now()). */
export function progressionProfil(profile: Profile, now: number): RecapProfil {
	const uuid = profile.uuid;
	const starsRaw = lsGetRaw(uuid + '/' + STARS_KEY, {}) as Record<string, number>;
	const statsRaw = lsGetRaw(uuid + '/' + LESSON_STATS_KEY, {}) as Record<string, LessonStat>;
	const firstSeenRaw = lsGetRaw(uuid + '/' + LESSON_FIRST_SEEN_KEY, {}) as Record<string, number>;
	const activity = lsGetRaw(uuid + '/' + ACTIVITY_KEY, []); // brut : normalisé par activiteParJourParType
	const file = loadRevoirFor(uuid);
	const fileSet = new Set(file);

	const parCategorie: RecapCategorie[] = [];
	const aRevoir: RecapNotion[] = [];
	let totalMaitrisees = 0;
	let totalLecons = 0;
	let nouvellesRecentes = 0;

	for (const cat of CATEGORIES) {
		const niveau = niveauProfilMatiere(profile, cat.subject);
		const lecons = getLessonsByCategory(cat.id, niveau);
		if (lecons.length === 0) continue; // catégorie vide à ce niveau → pas affichée
		const rc: RecapCategorie = {
			categoryId: cat.id,
			label: cat.label,
			subject: cat.subject,
			acquis: 0,
			enCours: 0,
			nonAcquis: 0,
			aDecouvrir: 0,
			total: lecons.length,
			travaillees: 0,
			lecons: [],
		};
		for (const l of lecons) {
			const k = l.id + '@' + niveau; // clé de stockage (le niveau est supporté → exact)
			const etoilee = (starsRaw[k] || 0) > 0;
			const stat = statsRaw[k];
			const etat = niveauNotion(stat, etoilee);
			if (etat === 'acquis') rc.acquis++;
			else if (etat === 'en-cours') rc.enCours++;
			else if (etat === 'non-acquis') rc.nonAcquis++;
			else rc.aDecouvrir++;
			// Détail par leçon (état + épinglage + vues/dernière fois/tendance) : le MÊME objet
			// alimente le dépliage de la catégorie ET, s'il est faible, la file « à revoir ».
			const notion: RecapNotion = {
				lessonId: l.id,
				label: l.label,
				niveau: etat,
				pctRecent: recentAvgPct(stat) ?? lessonAvgPct(stat),
				epingle: fileSet.has(l.id),
				vues: stat?.attempts ?? 0,
				derniereFois: stat?.lastAt ?? null,
				tendance: tendanceNotion(stat),
			};
			rc.lecons.push(notion);

			totalLecons++;
			if (etoilee) {
				totalMaitrisees++;
				const fs = firstSeenRaw[k];
				if (typeof fs === 'number' && now - fs <= RECENT_FENETRE_NOUVELLES_MS) nouvellesRecentes++;
			}
			// « À revoir » : travaillée, non étoilée, perf récente sous le seuil.
			if (
				!etoilee &&
				stat?.questions &&
				notion.pctRecent != null &&
				notion.pctRecent < SEUIL_REVOIR
			) {
				aRevoir.push(notion);
			}
		}
		rc.travaillees = rc.acquis + rc.enCours + rc.nonAcquis;
		parCategorie.push(rc);
	}

	// Roll-up par matière (couverture) pour équilibrer entre matières.
	const parMatiere: RecapMatiere[] = SUBJECTS.map((sub) => {
		const cats = parCategorie.filter((c) => c.subject === sub.id);
		return {
			subject: sub.id,
			label: sub.label,
			travaillees: cats.reduce((n, c) => n + c.travaillees, 0),
			acquis: cats.reduce((n, c) => n + c.acquis, 0),
			total: cats.reduce((n, c) => n + c.total, 0),
		};
	}).filter((m) => m.total > 0);

	// Les plus fragiles d'abord (l'UI en montre 2-3).
	aRevoir.sort((a, b) => (a.pctRecent ?? 100) - (b.pctRecent ?? 100));

	return {
		uuid,
		parMatiere,
		parCategorie,
		totalMaitrisees,
		totalLecons,
		nouvellesRecentes,
		aRevoir,
		activite7j: activiteParJourParType(activity, now),
	};
}

/* Leçons « à revoir » actuellement actives pour le profil ACTIF, filtrées sur celles
   ENCORE faibles (auto-nettoyage : une notion redevenue solide quitte la boucle).
   Sert à la carte d'accueil de l'enfant (ui/a-revoir-card.ts). Lit le profil actif. */
export function revoirActives(): LessonDef[] {
	const ids = loadRevoir();
	if (ids.length === 0) return [];
	// Vues SCOPÉES au profil et au niveau actifs (clés `lessonId` simples).
	const stats = loadLessonStats() as Record<string, LessonStat>;
	const stars = loadStars();
	const out: LessonDef[] = [];
	for (const id of ids) {
		const lesson = getAllLessons().find((l) => l.id === id);
		// On n'affiche que des leçons du niveau actif de l'enfant (une leçon épinglée
		// puis sortie du catalogue actif — ex. changement de classe — est ignorée).
		if (!lesson || !lesson.levels.includes(niveauActifMatiere(lesson.subject))) continue;
		const etoilee = (stars[id] || 0) > 0;
		const stat = stats[id];
		const pct = recentAvgPct(stat) ?? lessonAvgPct(stat);
		// Encore « à revoir » si non étoilée ET (jamais re-travaillée OU perf récente < seuil).
		if (!etoilee && (pct == null || pct < SEUIL_REVOIR)) out.push(lesson);
	}
	return out;
}
