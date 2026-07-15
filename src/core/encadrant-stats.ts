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
	LESSON_PALIERS_KEY,
	ACTIVITY_KEY,
	LESSON_REVISION_KEY,
	loadLessonStats,
	loadStars,
	normalizeActivity,
	lessonOfKey,
	niveauOfKey,
	startOfWeek,
	type PaliersNotion,
} from './progress';
import {
	lessonAvgPct,
	recentAvgPct,
	niveauNotion,
	tendanceNotion,
	SEUIL_REVOIR,
	type LessonStat,
	type NiveauNotion,
	type TendanceNotion,
} from './maitrise';
import {
	getAllLessons,
	getLessonById,
	getLessonsByCategory,
	CATEGORIES,
	SUBJECTS,
	ORTHO_CATEGORY_ID,
	type LessonDef,
	type SchoolLevel,
	type SubjectId,
} from './catalog';
import { niveauDefautCatalogue } from './levels';
import { niveauActifMatiere } from './niveau-actif';
import type { Profile } from './profiles';
import { ORTHO_KEY } from './orthographe/store';
import { REVISION_INTERVALLES, PALIER_ACQUIS, JOUR, estAcquis } from './revision';
import type { EtatRevision, OrthoState } from './orthographe/types';

/* L'échelle de maîtrise (types + niveauNotion/tendanceNotion) vit dans maitrise.ts ; on la
   re-expose ici pour les consommateurs historiques de l'espace encadrant (UI + tests) qui
   importent « depuis encadrant-stats ». */
export { niveauNotion, tendanceNotion } from './maitrise';
export type { NiveauNotion, TendanceNotion } from './maitrise';

/* ---------- Seuils propres à l'espace encadrant ----------
   (L'échelle de maîtrise et ses seuils — SEUIL_NON_ACQUIS, tendance — vivent dans maitrise.ts.) */
const RECENT_FENETRE_NOUVELLES_MS = 30 * 86400000; // « notions maîtrisées récemment » : 30 jours
const JOURS_ACTIVITE = 7; // graphe d'activité : 7 derniers jours
const SEMAINES_FRISE = 12; // frise d'évolution (#397) : 12 dernières semaines (au-delà, le contenu a souvent changé)
const PALIERS_MIN_SEMAINES = 3; // frise masquée tant que la matière a moins de recul (avis pédago/designer)

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
	frises: FriseMatiere[]; // évolution récente par matière (#397) ; vide tant qu'aucune matière n'a assez de recul
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

/* Frise d'évolution d'une matière (#397) : nombre de NOTIONS DISTINCTES ayant franchi un
   cap (« en cours » ou « acquis ») par semaine, sur les SEMAINES_FRISE dernières semaines.
   `semaines` : du plus ancien (index 0) au plus récent ; le DERNIER élément est la semaine
   EN COURS (partielle) — l'UI la distingue pour ne pas la comparer à hauteur égale. */
export interface FriseMatiere {
	subject: SubjectId;
	label: string;
	semaines: number[]; // longueur = SEMAINES_FRISE ; count de notions distinctes ayant franchi un cap
	total: number; // notions distinctes ayant franchi un cap sur toute la fenêtre affichée
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

const SEMAINE_MS = 7 * 86400000;
/* Début de la semaine LOCALE (lundi 00:00) d'un horodatage — base des seaux hebdomadaires
   de la frise. Alias de startOfWeek (progress.ts) : la frise et les objectifs de régularité
   partagent la MÊME notion de « semaine calendaire ». Exporté : l'UI l'utilise pour dater
   les colonnes dans les libellés accessibles. */
export const debutSemaine = startOfWeek;

/* Frise d'évolution par matière (#397), calculée à partir du journal daté des paliers
   (LESSON_PALIERS_KEY) du profil consulté. Pour chaque matière (au niveau du profil) :
   compte, par semaine, les NOTIONS DISTINCTES ayant franchi un cap cette semaine-là.
   `paliersRaw` : brut (clés `lessonId@niveau`). `now` injecté (pur/testable).

   Une matière n'apparaît que si (a) elle a au moins une marche DANS la fenêtre affichée
   ET (b) sa toute 1re marche remonte à ≥ PALIERS_MIN_SEMAINES semaines (assez de recul) —
   sinon on n'affiche rien plutôt qu'une frise trop courte, lue comme « aucun progrès »
   alors que c'est « trop tôt » (avis pédago/designer). */
export function frisesParMatiere(
	paliersRaw: Record<string, PaliersNotion>,
	profile: Profile,
	now: number,
): FriseMatiere[] {
	const debutCourante = debutSemaine(now);
	const out: FriseMatiere[] = [];
	for (const sub of SUBJECTS) {
		const niveau = niveauProfilMatiere(profile, sub.id);
		const semaines = new Array<number>(SEMAINES_FRISE).fill(0);
		let premiereMarche = Infinity;
		let totalFenetre = 0;
		for (const key in paliersRaw) {
			if (niveauOfKey(key) !== niveau) continue;
			if (getLessonById(lessonOfKey(key))?.subject !== sub.id) continue;
			const rec = paliersRaw[key];
			const marches = [rec.enCours, rec.acquis].filter((t): t is number => typeof t === 'number');
			if (marches.length === 0) continue;
			premiereMarche = Math.min(premiereMarche, ...marches);
			// Une notion ne compte qu'UNE fois par semaine (même si elle franchit « en cours »
			// puis « acquis » la même semaine) : on dédoublonne ses semaines de franchissement.
			const indices = new Set<number>();
			for (const t of marches) {
				const idx = SEMAINES_FRISE - 1 - Math.round((debutCourante - debutSemaine(t)) / SEMAINE_MS);
				if (idx >= 0 && idx < SEMAINES_FRISE) indices.add(idx);
			}
			for (const idx of indices) semaines[idx]++;
			if (indices.size > 0) totalFenetre++;
		}
		if (premiereMarche === Infinity || totalFenetre === 0) continue; // matière sans marche affichable
		const reculSemaines = Math.round((debutCourante - debutSemaine(premiereMarche)) / SEMAINE_MS);
		if (reculSemaines < PALIERS_MIN_SEMAINES) continue; // pas encore assez de recul
		out.push({ subject: sub.id, label: sub.label, semaines, total: totalFenetre });
	}
	return out;
}

/* Tableau de bord d'un profil (par UUID), SANS changer le profil actif.
   `now` injecté pour testabilité (l'UI passe Date.now()). */
export function progressionProfil(profile: Profile, now: number): RecapProfil {
	const uuid = profile.uuid;
	const starsRaw = lsGetRaw(uuid + '/' + STARS_KEY, {}) as Record<string, number>;
	const statsRaw = lsGetRaw(uuid + '/' + LESSON_STATS_KEY, {}) as Record<string, LessonStat>;
	const firstSeenRaw = lsGetRaw(uuid + '/' + LESSON_FIRST_SEEN_KEY, {}) as Record<string, number>;
	const activity = lsGetRaw(uuid + '/' + ACTIVITY_KEY, []); // brut : normalisé par activiteParJourParType
	const paliersRaw = lsGetRaw(uuid + '/' + LESSON_PALIERS_KEY, {}) as Record<string, PaliersNotion>;
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
		frises: frisesParMatiere(paliersRaw, profile, now),
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

/* ============================================================
   Récap du mode Révision espacée (#423) — vue ENCADRANT de la file.
   ------------------------------------------------------------
   Projette, PAR PROFIL (par UUID, sans bascule), l'état de répétition
   espacée (#45) des deux sources : les LEÇONS (LESSON_REVISION_KEY) et les
   MOTS d'orthographe (ORTHO_KEY → banque[].revision). Pour chaque entrée :
   son palier courant (position dans l'escalier d'intervalles) et sa prochaine
   échéance, en langage relatif (« à réviser demain », « en retard de 2 jours »),
   dans l'esprit de l'espace encadrant (pas de pourcentage ni de note).
   Pure/lecture ; `now` injecté (testable). Ne mute jamais l'état SR.
   ============================================================ */
export type NatureRevision = 'lecon' | 'mot';

export interface EntreeRevision {
	cle: string; // clé d'affichage unique (`lessonId@niveau` pour une leçon, `mot:<id>` pour un mot)
	label: string; // libellé de leçon résolu, ou le mot lui-même
	nature: NatureRevision;
	categoryId: string; // catégorie de rattachement (catalogue ; mots → ORTHO_CATEGORY_ID)
	palier: number; // 0..PALIER_ACQUIS
	palierLabel: string; // intervalle courant (« 1 semaine ») ; '' si acquis
	acquis: boolean; // palier maximal atteint → sorti de la rotation active
	prochaineRevision: number | null; // échéance (ms) ; null si acquis
	echeance: string; // libellé relatif de l'échéance ('' si acquis)
	du: boolean; // échue (aujourd'hui ou en retard) et pas encore acquise
	joursRestants: number | null; // jours calendaires jusqu'à l'échéance (<0 = en retard) ; null si acquis
}

export interface GroupeRevision {
	categoryId: string;
	label: string;
	subject: SubjectId;
	entrees: EntreeRevision[]; // triées par urgence (dues d'abord, acquises en fin)
	enRotation: number; // entrées non acquises
	acquises: number;
	dues: number; // non acquises et échues (aujourd'hui ou en retard)
}

export interface RecapRevision {
	total: number;
	enRotation: number;
	acquises: number;
	dues: number;
	groupes: GroupeRevision[]; // vue « par catégorie » (ordre du catalogue)
	parUrgence: EntreeRevision[]; // vue « par urgence » (plus en retard d'abord, acquises en fin)
}

/* Libellé d'un palier = intervalle de re-test correspondant, en langage courant, DÉRIVÉ
   de REVISION_INTERVALLES (source unique — pas de valeurs recopiées). '' pour l'acquis
   (rendu par un badge dédié côté UI). Pur. */
export function libellePalier(palier: number): string {
	if (palier >= PALIER_ACQUIS) return '';
	const jours = REVISION_INTERVALLES[Math.min(palier, REVISION_INTERVALLES.length - 1)] / JOUR;
	if (jours < 7) return `${jours} jour${jours > 1 ? 's' : ''}`;
	if (jours < 30) {
		const s = Math.round(jours / 7);
		return `${s} semaine${s > 1 ? 's' : ''}`;
	}
	const m = Math.round(jours / 30);
	return `${m} mois`;
}

/* L'escalier complet des paliers, pour la légende (« 1 jour → 3 jours → … → acquis »).
   Dérivé de REVISION_INTERVALLES + « acquis ». Pur. */
export function echelleRevisionLabels(): string[] {
	return REVISION_INTERVALLES.map((_, p) => libellePalier(p)).concat('acquis');
}

/* Échéance en langage RELATIF pour un parent (jamais une date brute — cf. principe
   de l'espace encadrant). Formulation NEUTRE en genre (« à réviser … » plutôt que
   « dû/due … », qui s'accorderait différemment pour une leçon ou un mot). Pur. */
export function libelleEcheanceRevision(prochaineRevision: number | null, now: number): string {
	if (prochaineRevision == null) return '';
	const j = Math.round((startOfDay(prochaineRevision) - startOfDay(now)) / JOUR);
	if (j < 0) return `en retard de ${-j} jour${-j > 1 ? 's' : ''}`;
	if (j === 0) return "à réviser aujourd'hui";
	if (j === 1) return 'à réviser demain';
	return `à réviser dans ${j} jours`;
}

function entreeRevision(
	cle: string,
	label: string,
	nature: NatureRevision,
	categoryId: string,
	etat: EtatRevision,
	now: number,
): EntreeRevision {
	const acquis = estAcquis(etat);
	const joursRestants =
		acquis || etat.prochaineRevision == null
			? null
			: Math.round((startOfDay(etat.prochaineRevision) - startOfDay(now)) / JOUR);
	return {
		cle,
		label,
		nature,
		categoryId,
		palier: etat.palier,
		palierLabel: libellePalier(etat.palier),
		acquis,
		prochaineRevision: acquis ? null : etat.prochaineRevision, // un acquis n'a plus d'échéance
		echeance: libelleEcheanceRevision(acquis ? null : etat.prochaineRevision, now),
		// « dû » CALENDAIRE (échéance ≤ aujourd'hui) pour la lecture parent — volontairement plus
		// large que estDu() (revision.ts, comparaison en ms) : un élément programmé pour ce soir est
		// déjà annoncé « à réviser aujourd'hui » ici, même si le moteur ne le proposera qu'à l'heure dite.
		du: !acquis && joursRestants != null && joursRestants <= 0,
		joursRestants,
	};
}

/* Tri par urgence : les plus en retard d'abord (jour restant le plus petit/négatif),
   puis les échéances futures, enfin les acquises ; à égalité, ordre alphabétique. */
function compareUrgence(a: EntreeRevision, b: EntreeRevision): number {
	if (a.acquis !== b.acquis) return a.acquis ? 1 : -1;
	const ja = a.joursRestants ?? Infinity;
	const jb = b.joursRestants ?? Infinity;
	if (ja !== jb) return ja - jb;
	return a.label.localeCompare(b.label, 'fr');
}

/* File de révision d'un profil (par UUID), SANS changer le profil actif.
   `now` injecté pour testabilité (l'UI passe Date.now()). */
export function revisionProfil(profile: Profile, now: number): RecapRevision {
	const uuid = profile.uuid;
	const lessonRev = lsGetRaw(uuid + '/' + LESSON_REVISION_KEY, {}) as Record<string, EtatRevision>;
	const ortho = lsGetRaw(uuid + '/' + ORTHO_KEY, null) as OrthoState | null;

	const entrees: EntreeRevision[] = [];
	for (const k in lessonRev) {
		const etat = lessonRev[k];
		if (!etat || !Number.isFinite(etat.palier)) continue;
		const lesson = getLessonById(lessonOfKey(k));
		if (!lesson) continue; // leçon sortie du catalogue (ex. après un changement de version) → ignorée
		// N'afficher que le niveau ACTIF de la matière : le moteur ne révise que celui-là
		// (loadLessonRevisions → scopeActif). Une clé `@ancien-niveau` laissée après un
		// changement de classe est DORMANTE (jamais reproposée) — l'afficher créerait un
		// doublon fantôme « en retard » que le parent ne pourrait jamais résorber. Même
		// filtre que frisesParMatiere. (Sans objet pour les mots d'ortho, non namespacés.)
		if (niveauOfKey(k) !== niveauProfilMatiere(profile, lesson.subject)) continue;
		entrees.push(entreeRevision(k, lesson.label, 'lecon', lesson.category, etat, now));
	}
	if (ortho && ortho.banque && typeof ortho.banque === 'object') {
		for (const id in ortho.banque) {
			const m = ortho.banque[id];
			if (!m || !m.revision || !Number.isFinite(m.revision.palier)) continue;
			entrees.push(entreeRevision('mot:' + id, m.mot, 'mot', ORTHO_CATEGORY_ID, m.revision, now));
		}
	}

	// Regroupement par catégorie, dans l'ORDRE DU CATALOGUE (comme « Notions par catégorie »).
	const groupes: GroupeRevision[] = [];
	for (const cat of CATEGORIES) {
		const es = entrees.filter((e) => e.categoryId === cat.id).sort(compareUrgence);
		if (es.length === 0) continue;
		groupes.push({
			categoryId: cat.id,
			label: cat.label,
			subject: cat.subject,
			entrees: es,
			enRotation: es.filter((e) => !e.acquis).length,
			acquises: es.filter((e) => e.acquis).length,
			dues: es.filter((e) => e.du).length,
		});
	}

	return {
		total: entrees.length,
		enRotation: entrees.filter((e) => !e.acquis).length,
		acquises: entrees.filter((e) => e.acquis).length,
		dues: entrees.filter((e) => e.du).length,
		groupes,
		parUrgence: [...entrees].sort(compareUrgence),
	};
}
