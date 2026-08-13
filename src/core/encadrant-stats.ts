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
import { lsGet, lsGetRaw, lsGetItemRaw, lsSetRaw } from './storage';
import { startOfDay, debutJourLocal } from './utils';
import {
	STARS_KEY,
	LESSON_STATS_KEY,
	LESSON_FIRST_SEEN_KEY,
	LESSON_PALIERS_KEY,
	PALIERS_DEBUT_KEY,
	ACTIVITY_KEY,
	LESSON_REVISION_KEY,
	LESSON_REPORT_KEY,
	loadLessonStats,
	loadStars,
	normalizeActivity,
	lessonOfKey,
	niveauOfKey,
	startOfWeek,
	type PaliersNotion,
} from './progress';
import {
	perfRecente,
	niveauNotion,
	tendanceNotion,
	estNotionSolide,
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
import { niveauDefautCatalogue, labelLecon } from './levels';
import { BLOCAGES_SIGNAL_ADULTE, type EtatReport } from './report-lecon';
import { niveauActifMatiere } from './niveau-actif';
import { touchProfile, type Profile } from './profiles';
import {
	loadOrtho,
	loadOrthoFor,
	saveOrthoFor,
	supprimerMot,
	ORTHO_KEY,
} from './orthographe/store';
import {
	listOrthoLecons,
	labelLeconOrtho,
	motsApercu,
	type SourceLecon,
} from './orthographe/lessons';
import { niveauListeOrtho, avancementLecon } from './orthographe/progression';
import { ORTHO_PALIERS_KEY, ORTHO_PALIERS_DEBUT_KEY } from './orthographe/paliers';
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
const SEMAINES_FRISE = 12; // frise d'états par leçon (#521) : 12 dernières semaines (au-delà, le contenu a souvent changé)

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
/* Écriture BRUTE dans le profil ciblé (pas l'actif) : on ne bascule pas l'enfant.
   SILENCIEUSE par nature (comme `lsSetQuiet` face à `lsSet`) : contourner le préfixe actif
   contourne aussi le hook `onDataWrite`, donc c'est à l'APPELANT de décider s'il marque le
   profil comme modifié (`touchProfile`). Un geste de l'adulte le fait (toggleRevoirFor),
   un nettoyage automatique NON (purgeRevoirSolides). */
function saveRevoirFor(uuid: string, ids: string[]) {
	lsSetRaw(uuid + '/' + REVOIR_KEY, JSON.stringify(ids));
}
/* Épingle/désépingle une leçon pour un profil. Renvoie la nouvelle file.
   `entryId` est soit un id de leçon du catalogue (`LessonDef.id`), soit une entrée de
   liste de dictée préfixée (`orthoRevoirId`). La file reste un simple `string[]` : la
   nature de chaque entrée est portée par le préfixe (rétro-compatible avec l'existant).
   Geste EXPLICITE de l'adulte → on bumpe `updatedAt` du profil : sans ça, un export fait
   depuis un autre appareil paraîtrait plus récent et la fusion par récence de
   l'import écraserait silencieusement les épingles posées ici. */
export function toggleRevoirFor(uuid: string, entryId: string): string[] {
	const ids = loadRevoirFor(uuid);
	const next = ids.includes(entryId) ? ids.filter((x) => x !== entryId) : [...ids, entryId];
	saveRevoirFor(uuid, next);
	touchProfile(uuid);
	return next;
}

/* Supprime DÉFINITIVEMENT un mot de la banque d'un profil (#496). Pendant de
   `toggleRevoirFor` pour la banque : opération ATOMIQUE (lire → muter → écrire → bumper),
   côté core, testable sans DOM. La couche UI n'a donc pas à recomposer la séquence, ni à se
   souvenir que l'écriture brute par UUID contourne `onDataWrite` et réclame un `touchProfile`
   explicite. Renvoie `false` si le mot n'existe pas — et ne bumpe alors RIEN : une
   consultation ne doit pas rajeunir un profil, sous peine de fausser la fusion par récence de
   l'import/export. L'état est relu ici, au plus près de l'écriture : l'appelant a pu laisser
   passer plusieurs secondes dans une modale de confirmation. */
export function supprimerMotFor(uuid: string, wordId: string): boolean {
	const state = loadOrthoFor(uuid);
	if (!supprimerMot(state, wordId)) return false;
	saveOrthoFor(uuid, state);
	touchProfile(uuid);
	return true;
}

/* ---------- Entrées « liste de dictée » de la file « à revoir » ----------
   Les listes de dictée (orthographe) ne sont PAS des `LessonDef` du catalogue : leur id
   (opaque pour une liste du parent, `fr-ortho-*` pour une dictée prédéfinie) est préfixé
   dans la file pour le distinguer d'un id de leçon, sans changer le type de stockage. */
export const REVOIR_ORTHO_PREFIX = 'ortho:';
export const orthoRevoirId = (orthoId: string): string => REVOIR_ORTHO_PREFIX + orthoId;
export const isOrthoRevoirId = (entryId: string): boolean =>
	entryId.startsWith(REVOIR_ORTHO_PREFIX);
export const orthoIdFromRevoir = (entryId: string): string =>
	entryId.slice(REVOIR_ORTHO_PREFIX.length);

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
	/** Leçons dont la frise montre au moins deux états dans la fenêtre (#521, cf.
	    aChangeRecemment). Seule trace de « ça bouge » lisible sans déplier une catégorie. */
	changementsRecents: number;
}
export interface RecapNotion {
	lessonId: string;
	label: string;
	niveau: NiveauNotion;
	pctRecent: number | null; // sert au tri/seuil — JAMAIS affiché en nombre côté UI
	epingle: boolean; // présente dans la file « à revoir »
	vues: number; // nombre de sessions travaillées (stat.attempts) ; 0 si jamais abordée
	derniereFois: number | null; // horodatage (ms) de la dernière session (stat.lastAt), null si inconnue
	tendance: TendanceNotion | null; // direction récente ; null si trop peu de questions (#541)
	/** Nombre de JOURS où l'enfant a buté sur cette leçon dans la leçon du jour (#485) —
	    le 1er ne reporte rien, les suivants la mettent de côté. 0 = jamais butée. */
	blocages: number;
	/** Trajectoire d'états semaine par semaine (#521, cf. friseNotion) ; `null` quand la leçon
	    n'a jamais été travaillée, donc qu'il n'y a rien à tracer. */
	frise: FriseNotion | null;
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

/* ---------- « Travaillé récemment » (#520) ----------
   Le parent avait la donnée sans jamais l'avoir sous les yeux : le graphe d'activité
   compte les séances par jour sans NOMMER une seule leçon, et le détail par leçon est
   enfermé dans l'accordéon « Notions par catégorie ». Ce bloc nomme directement ce qui
   a été travaillé sur une fenêtre courte, en jours CALENDAIRES locaux comme le reste de
   l'espace encadrant. `jours` = largeur de la fenêtre, aujourd'hui INCLUS (l'UI le tire
   de son sélecteur) ; on ne propose pas de fenêtre « tout », qui reviendrait à lister le
   catalogue.

   DEUX sources, complémentaires :
   - `statsRaw[...].lastAt` décide de l'APPARTENANCE à la fenêtre. Il couvre TOUS les
     chemins (leçon jouée seule, bilan, sprint), au prix de ne retenir qu'une date, la
     dernière — il ne peut donc pas dire combien de fois.
   - le journal d'activité dit COMBIEN de séances sont attribuables à la cible, via la
     `ref` posée depuis #498. Une leçon travaillée seulement dans un bilan ou un sprint
     n'en a pas (une telle séance porte sur plusieurs leçons) : `seances` vaut alors
     `null` — « travaillée, sans compte fiable » — et jamais 0, qui se lirait « pas
     travaillée » alors qu'on vient de l'affirmer.
   Les dictées ne passent pas par les stats de leçons : elles n'existent QUE dans le
   journal d'activité (`{k:'dictee', ref}`), d'où leur collecte à part. Sans elles, le
   bloc annoncerait « aucune leçon travaillée » un jour où l'enfant n'a fait que des
   dictées, en contradiction avec le graphe d'activité juste au-dessus.

   AUCUN filtre de niveau, ni sur les leçons ni sur les dictées : ce qui a été travaillé
   l'a forcément été à la portée de l'enfant, et l'écarter au prétexte du niveau suivi
   rouvrirait le trou même que ce bloc ferme. Le cas est réel — une leçon CE2 rejouée par
   un profil CM1 (favori, révision, épingle) est rangée `@ce2` par `niveauStockage`, et la
   filtrer la ferait compter dans le graphe d'activité sans être nommée nulle part. Une
   leçon travaillée sous deux niveaux a donc DEUX clés de stats : on dédoublonne par leçon
   en gardant la date la plus récente, plutôt que de la lister deux fois.

   Pas d'état d'acquisition sur les lignes (avis pédago) : une notion tout juste abordée
   est normalement encore « à découvrir », un badge par ligne afficherait donc un niveau
   bas sur ce qu'il y a de plus récent. C'est une photo d'activité, le jugement vit dans
   l'accordéon. Pur (`now` injecté). */
export interface CibleTravaillee {
	id: string; // leçon du catalogue, ou liste d'orthographe (une dictée)
	label: string;
	/** Nature de la cible. C'est une DONNÉE et non un libellé : l'UI compte les dictées à part
	    (« 2 leçons et 1 dictée travaillées ») et ne doit pas avoir à reconnaître un mot français
	    dans `contexte` pour savoir à quoi elle a affaire. */
	kind: 'lecon' | 'dictee';
	contexte: string; // catégorie de la leçon (« Calcul mental ») ; vide pour une dictée
	seances: number | null; // séances attribuables dans la fenêtre ; null = compte inconnu
	derniereFois: number; // horodatage le plus récent connu dans la fenêtre
}
export interface GroupeTravail {
	subject: SubjectId;
	label: string; // libellé de matière (« Mathématiques »)
	cibles: CibleTravaillee[]; // la plus récemment travaillée en tête
}
export function travailRecent(
	statsRaw: Record<string, LessonStat>,
	activityRaw: unknown,
	ortho: OrthoState | null,
	jours: number,
	now: number,
): GroupeTravail[] {
	const seuil = debutJourLocal(now, jours - 1);
	const activite = normalizeActivity(activityRaw).filter((e) => e.t >= seuil);
	// Séances attribuables par cible : compte + date la plus récente. `dictee` retient le
	// type pour distinguer une liste d'orthographe d'une leçon du catalogue (espaces d'ids
	// disjoints, mais on ne veut pas en dépendre) : il suffit qu'UNE entrée de la cible soit
	// une dictée, sinon l'ordre des entrées déciderait de l'affichage de la ligne.
	const parRef = new Map<string, { seances: number; derniereFois: number; dictee: boolean }>();
	for (const e of activite) {
		if (!e.ref) continue;
		const acc = parRef.get(e.ref);
		if (acc) {
			acc.seances++;
			acc.derniereFois = Math.max(acc.derniereFois, e.t);
			acc.dictee = acc.dictee || e.k === 'dictee';
		} else {
			parRef.set(e.ref, { seances: 1, derniereFois: e.t, dictee: e.k === 'dictee' });
		}
	}

	const parMatiere = new Map<SubjectId, CibleTravaillee[]>();
	const pousser = (subject: SubjectId, cible: CibleTravaillee) => {
		const liste = parMatiere.get(subject);
		if (liste) liste.push(cible);
		else parMatiere.set(subject, [cible]);
	};

	// Leçons du catalogue, dédoublonnées par id : deux clés `@niveau` de la même leçon ne
	// font qu'une ligne, datée de la plus récente des deux.
	const derniereFoisLecon = new Map<string, number>();
	for (const key in statsRaw) {
		const lastAt = statsRaw[key].lastAt;
		if (typeof lastAt !== 'number' || lastAt < seuil) continue;
		const id = lessonOfKey(key);
		derniereFoisLecon.set(id, Math.max(derniereFoisLecon.get(id) ?? lastAt, lastAt));
	}
	for (const [id, derniereFois] of derniereFoisLecon) {
		const lesson = getLessonById(id);
		if (!lesson) continue; // leçon retirée du catalogue depuis : plus rien à nommer
		pousser(lesson.subject, {
			id,
			label: lesson.label,
			kind: 'lecon',
			contexte: CATEGORIES.find((c) => c.id === lesson.category)?.label ?? '',
			seances: parRef.get(id)?.seances ?? null,
			derniereFois,
		});
	}

	// Dictées, depuis le seul journal d'activité (aucune stat de leçon ne les couvre).
	for (const [id, acc] of parRef) {
		if (!acc.dictee) continue;
		const label = labelLeconOrtho(id, ortho?.listes ?? []);
		if (!label) continue; // liste supprimée depuis : rien à afficher
		pousser('francais', {
			id,
			label,
			kind: 'dictee',
			contexte: '', // une liste d'orthographe n'a pas de catégorie du catalogue
			seances: acc.seances,
			derniereFois: acc.derniereFois,
		});
	}

	// La plus récente en tête ; à horodatage IDENTIQUE (cas courant : un bilan écrit le même
	// `lastAt` à toutes ses leçons), la plus travaillée, un compte inconnu passant derrière
	// un compte connu ; puis l'ordre alphabétique, sans quoi l'ordre d'itération des clés de
	// stats déciderait et deux rendus successifs pourraient différer.
	return SUBJECTS.filter((s) => parMatiere.has(s.id)).map((s) => ({
		subject: s.id,
		label: s.label,
		cibles: parMatiere
			.get(s.id)!
			.sort(
				(a, b) =>
					b.derniereFois - a.derniereFois ||
					(b.seances ?? 0) - (a.seances ?? 0) ||
					a.label.localeCompare(b.label, 'fr'),
			),
	}));
}

/* Lecture des stores du profil consulté, puis délégation à `travailRecent` — même patron
   que `progressionProfil` (clés brutes préfixées par l'UUID).
   Pourquoi ce calcul n'entre PAS dans `RecapProfil` : `jours` est un choix d'INTERFACE, porté
   par l'état du widget, pas une donnée du profil. L'y intégrer obligerait soit à calculer les
   trois fenêtres à chaque fois pour n'en afficher qu'une, soit à faire porter un paramètre de
   sélection à un calcul qui est une photo de l'état. (Ce n'est pas une question de coût : le
   récap est lui aussi recalculé à chaque rendu de l'onglet.) */
export function travailRecentProfil(profile: Profile, jours: number, now: number): GroupeTravail[] {
	const uuid = profile.uuid;
	return travailRecent(
		lsGetRaw(uuid + '/' + LESSON_STATS_KEY, {}) as Record<string, LessonStat>,
		lsGetRaw(uuid + '/' + ACTIVITY_KEY, []),
		loadOrthoFor(uuid),
		jours,
		now,
	);
}

/* Début de la semaine LOCALE (lundi 00:00) d'un horodatage — base des seaux hebdomadaires
   de la frise. Alias de startOfWeek (progress.ts) : la frise et les objectifs de régularité
   partagent la MÊME notion de « semaine calendaire ». Exporté : l'UI l'utilise pour dater
   les colonnes dans les libellés accessibles. */
export const debutSemaine = startOfWeek;

/* Frise d'états d'UNE notion (#521), reconstruite depuis son journal de paliers daté
   (LESSON_PALIERS_KEY) : sous quel état d'acquisition la leçon se trouvait, semaine par
   semaine, sur les SEMAINES_FRISE dernières. Remplace le compteur hebdomadaire par matière
   de #397, dont l'usage réel a montré qu'il ne disait NI où l'enfant progresse NI où il
   stagne : franchir un cap est rare, donc la plupart des colonnes valaient 0, et un
   dénombrement par matière ne nomme aucune leçon. Une trajectoire par leçon, elle, est
   pleine de bout en bout, et « ça n'a pas bougé depuis six semaines » se voit sans être écrit.

   INVARIANT sur lequel tout repose : depuis la mise en service du journal, TOUTE session
   susceptible de faire monter une leçon enregistre ses franchissements — les deux seuls
   chemins qui écrivent des stats de leçon (`recordLessonRun` et le sprint) appellent
   `recordMonteesPalier`. Passé cette borne (PALIERS_DEBUT_KEY), un horodatage ABSENT signifie
   donc « aucune montée observée », et l'état d'une semaine se déduit. Avant la borne, rien ne
   se déduit : les cellules valent 'inconnu'.

   Ce que la donnée permet, et ce qu'elle interdit :
   - `PaliersNotion` ne date que les MONTÉES vers « en cours » et « acquis », et seulement la
     première fois. Une cellule ne vaut donc que « l'état le plus haut atteint à cette date ».
     L'état RÉEL du jour est connu par ailleurs (`RecapNotion.niveau`) et peut être PLUS BAS :
     c'est l'UI qui met les deux côte à côte, un écart valant signal de recul.
   - « à renforcer » n'est jamais daté (entrer là n'est pas un progrès de maîtrise, cf.
     maitrise.ts) mais il se DÉDUIT : une leçon travaillée, suivie, sans cap franchi, était à
     renforcer. C'est ce qui manquait à la version précédente, qui escamotait ce palier et
     laissait donc SANS frise les leçons n'ayant jamais dépassé 40 % — les plus fragiles, donc
     celles qui intéressent le plus l'adulte.
   - Sans aucun cap daté, l'état COURANT vaut pour toute la période suivie : aucune montée n'a
     été observée, et l'échelle ne redescend pas d'elle-même (l'étoile n'est jamais retirée).
     C'est ce qui rend sa frise à une leçon acquise AVANT le journal.
   - Un cap daté sur une leçon plus ANCIENNE que la borne ne se déduit pas vers l'arrière : le
     tampon peut n'être que la première observation d'un état déjà atteint (une leçon étoilée en
     juin fait tamponner « acquis » à sa première session de juillet, `recordMonteesPalier` ne
     posant l'horodatage qu'au premier passage où il constate le palier). Les semaines qui
     précèdent restent donc 'inconnu' : « à renforcer » y affirmerait moins de 40 % sur une
     leçon peut-être déjà maîtrisée.
   - « à découvrir » n'est un FAIT que si la première rencontre (LESSON_FIRST_SEEN_KEY, #178)
     est POSTÉRIEURE à la borne. Sinon la leçon était déjà travaillée hors suivi et son état
     d'alors est inconnu. C'est le défaut corrigé ici : #178 précédant #397, l'ancienne règle
     tenait l'historique pour complet dès qu'une première rencontre existait, si bien que deux
     leçons voisines travaillées la même semaine s'affichaient selon deux règles différentes,
     départagées par la version de l'appli au moment du premier passage — critère invisible
     pour le lecteur, et affirmation fausse pour les leçons rencontrées entre les deux.
     Coût assumé : la borne est celle du journal des PALIERS, pas celle de firstSeen (#178, plus
     ancienne). Une leçon rencontrée entre les deux a donc une date fiable à laquelle on refuse
     son préfixe « à découvrir ». Lui rendre justice demanderait une SECONDE borne, donc deux
     règles possibles pour deux lignes voisines : ce qu'on vient de supprimer.
   - Les cellules 'inconnu' sont TOUJOURS un préfixe de la rangée (une rangée commence soit par
     'a-decouvrir', soit par 'inconnu', jamais les deux) : une cellule sans rang au milieu
     dessinerait un creux, que la hauteur ferait lire comme une régression.

   Renvoie `null` pour une leçon jamais travaillée : rien à tracer, et une rangée de cellules
   « à découvrir » sur chaque leçon du catalogue noierait celles qui disent quelque chose.
   `now` injecté (pur/testable). */
export type CelluleFrise = 'inconnu' | NiveauNotion;

/* Lundi de la semaine située `semainesAvant` semaines plus tôt (négatif = plus tard).
   Passe par un décalage en JOURS CALENDAIRES (`debutJourLocal`) plutôt que par une
   soustraction de 7 × 86 400 000 ms : sinon les frontières des semaines anciennes dérivent
   d'une heure de part et d'autre d'un changement d'heure, et un cap franchi un dimanche
   soir basculerait dans la semaine suivante. Exporté : l'UI date les cellules avec. */
export function lundiDecale(now: number, semainesAvant: number): number {
	return debutSemaine(debutJourLocal(now, 7 * semainesAvant));
}
/* Horodatage exploitable, ou null. `typeof === 'number'` laisserait passer NaN et Infinity,
   qui produiraient une frise entière au lieu du `null` promis. Inatteignable via le stockage
   (JSON les écrit `null`), mais le garde coûte une ligne. */
const horodatage = (v: unknown): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? v : null;
export interface FriseNotion {
	/** Longueur SEMAINES_FRISE, de la plus ancienne à la plus récente ; la DERNIÈRE est la
	    semaine EN COURS (partielle), que l'UI distingue. */
	semaines: CelluleFrise[];
	enCoursDepuis: number | null; // horodatage du franchissement, s'il est daté
	acquisDepuis: number | null;
}
/* Mise en service du journal des paliers pour un profil : le PLUS ANCIEN entre la borne stockée
   (PALIERS_DEBUT_KEY) et les franchissements déjà datés, toutes leçons confondues.
   Les deux, et pas seulement la borne : celle-ci n'est posée qu'à la première fin de session
   SUIVANT son arrivée dans le code, donc un profil qui journalise depuis des semaines la
   recevra datée d'aujourd'hui. Un franchissement plus ancien PROUVE que le journal tournait
   déjà, et fait donc foi contre elle. Et pas seulement les franchissements : chez l'enfant qui
   débute, aucun cap n'est franchi et seule la borne existe.
   `Infinity` quand le profil ne fournit ni l'un ni l'autre : aucune semaine n'est alors
   déductible, et toute la frise reste 'inconnu' plutôt que d'affirmer un état par défaut. Pur. */
export function debutSuiviPaliers(depuis: unknown, paliers: Record<string, PaliersNotion>): number {
	let debut = horodatage(depuis) ?? Infinity;
	for (const p of Object.values(paliers ?? {}))
		for (const t of [horodatage(p?.enCours), horodatage(p?.acquis)])
			if (t !== null && t < debut) debut = t;
	return debut;
}
/* Fin de la période « à découvrir » d'une leçon : la date de sa première rencontre quand celle-ci
   est un fait exploitable, `-Infinity` sinon (aucune semaine ne vaudra « à découvrir »).
   Elle ne l'est que si elle tombe à la borne de suivi ou après : avant la borne, des semaines
   entières ont été travaillées hors suivi et leur état reste inconnu.
   Comparaison à la SEMAINE, granularité de la frise : la rencontre est datée quelques
   millisecondes avant la borne au sein d'une même fin de session (deux `Date.now()`, cf.
   recordLessonRun), ce qui aurait fait juger « antérieures au journal » les leçons de la toute
   première session d'un profil — le même critère invisible que celui corrigé ici.
   Une borne inconnue (Infinity) rend la comparaison fausse, donc pas de période « à découvrir » :
   sans borne aucune semaine n'est déductible, et une rangée « à découvrir » puis 'inconnu'
   romprait le préfixe et dessinerait un creux. */
function finDecouverte(rencontre: number | null, debutSuivi: number): number {
	return rencontre !== null && debutSemaine(rencontre) >= debutSemaine(debutSuivi)
		? rencontre
		: -Infinity;
}
/* État des semaines SUIVIES tant qu'aucun cap n'est encore franchi. Trois situations, et une
   seule des trois autorise « à renforcer » :
   - aucun cap daté du tout : rien n'est monté sous l'œil du journal, donc l'état courant tient
     depuis la borne (une montée aurait été datée, et l'étoile ne se retire pas). Ce cas est
     testé EN PREMIER : le plancher couvre alors jusqu'à la dernière cellule, qui ne peut donc
     pas se retrouver SOUS le mot d'état de la ligne — un faux signal de recul, si un chemin
     d'écriture des stats oubliait un jour d'appeler recordMonteesPalier ;
   - première rencontre datée (donc postérieure à la borne) : toute la trajectoire est
     journalisée, donc avant son premier cap la leçon était travaillée sous les 40 % ;
   - un cap daté, mais un historique antérieur au journal : le tampon peut n'être que la PREMIÈRE
     OBSERVATION d'un état déjà atteint avant la borne — une leçon étoilée en juin fait tamponner
     « acquis » à sa première session de juillet. Affirmer « à renforcer » avant ce tampon
     reviendrait à déclarer sous les 40 % une leçon peut-être déjà maîtrisée. */
function plancherSuivi(
	niveau: NiveauNotion,
	aucunCap: boolean,
	decouverteDatee: boolean,
): CelluleFrise {
	if (aucunCap) return niveau;
	return decouverteDatee ? 'non-acquis' : 'inconnu';
}
/* `niveau` = état courant de la notion (`niveauNotion`), qui sert deux fois : il dit si la
   leçon a été travaillée (sinon pas de frise) et il tient lieu d'état des semaines suivies
   quand aucun cap n'est daté. `debutSuivi` vient de `debutSuiviPaliers`, calculé UNE fois par
   profil (il ne dépend pas de la leçon). */
export function friseNotion(
	paliers: PaliersNotion | undefined,
	firstSeen: number | undefined,
	niveau: NiveauNotion,
	debutSuivi: number,
	now: number,
): FriseNotion | null {
	const enCours = horodatage(paliers?.enCours);
	const acquis = horodatage(paliers?.acquis);
	const aucunCap = enCours === null && acquis === null;
	if (niveau === 'a-decouvrir' && aucunCap) return null; // jamais travaillée
	const finDecouv = finDecouverte(horodatage(firstSeen), debutSuivi);
	const plancher = plancherSuivi(niveau, aucunCap, finDecouv !== -Infinity);
	return {
		semaines: cellulesFrise(acquis, enCours, finDecouv, plancher, debutSuivi, now),
		enCoursDepuis: enCours,
		acquisDepuis: acquis,
	};
}

/* Cellules d'une frise, à partir des caps datés, de la fin de la période « à découvrir » et de
   l'état à supposer sur les semaines SUIVIES qu'aucun cap ne couvre encore. Cœur commun aux deux
   frises (leçon du catalogue, liste de dictée), qui ne diffèrent que par la façon d'établir ces
   trois éléments — la fenêtre, l'ordre de priorité et le sens d'une cellule, eux, sont les mêmes
   et ne doivent pas pouvoir diverger. */
function cellulesFrise(
	acquis: number | null,
	enCours: number | null,
	finDecouv: number,
	plancher: CelluleFrise,
	debutSuivi: number,
	now: number,
): CelluleFrise[] {
	const semaines: CelluleFrise[] = [];
	for (let i = 0; i < SEMAINES_FRISE; i++) {
		// L'état d'une cellule est celui atteint à la FIN de sa semaine, soit le lundi suivant
		// (exclu). Pour la dernière cellule cette borne est dans le futur : on lit donc l'état
		// atteint À CE JOUR, ce qui est bien le sens de « semaine en cours ».
		const finSemaine = lundiDecale(now, SEMAINES_FRISE - 2 - i);
		// Les caps datés passent AVANT « à découvrir » : sur données saines l'ordre est
		// indifférent (aucun cap ne précède la première rencontre), mais un journal abîmé
		// (horloge faussée, import bancal) daterait sinon 12 semaines « à découvrir » sur une
		// leçon dont la ligne annonce par ailleurs, en texte, la date d'acquisition.
		if (acquis !== null && acquis < finSemaine) semaines.push('acquis');
		else if (enCours !== null && enCours < finSemaine) semaines.push('en-cours');
		else if (finSemaine <= finDecouv) semaines.push('a-decouvrir');
		else if (finSemaine <= debutSuivi) semaines.push('inconnu');
		else semaines.push(plancher);
	}
	return semaines;
}

/* Frise d'états d'UNE LISTE de dictée (#541) : même journal daté (ORTHO_PALIERS_KEY), même
   fenêtre, même lecture des cellules que pour une leçon — avec une DÉDUCTION de plus.

   L'échelle des listes ne compte que trois valeurs (cf. orthographe/progression.ts) : « en cours »
   y signifie « au moins un mot commencé », et « à renforcer » n'existe pas, l'acquisition d'un mot
   étant binaire. Une semaine SUIVIE antérieure au tampon « en cours » était donc forcément
   « à découvrir » — rien n'était commencé. La frise d'une liste ne montre ainsi de creux
   qu'AVANT la mise en service du journal, jamais après ; là où celle d'une leçon doit rester dans
   le doute, l'état d'avant son premier cap pouvant aussi bien avoir été « à renforcer ».

   `niveau` = état courant (`niveauListeOrtho`) : il dit si la liste a été commencée (sinon pas de
   frise) et tient lieu d'état des semaines suivies quand AUCUN cap n'est daté — cas d'un profil
   qui travaillait ses listes avant l'arrivée de ce journal. `debutSuivi` vient de
   `debutSuiviPaliers` appliqué à la borne PROPRE à ce journal (ORTHO_PALIERS_DEBUT_KEY). */
export function friseListeOrtho(
	paliers: PaliersNotion | undefined,
	niveau: NiveauNotion,
	debutSuivi: number,
	now: number,
): FriseNotion | null {
	const enCours = horodatage(paliers?.enCours);
	// Le journal est MONOTONE, l'état d'une liste ne l'est PAS : une liste acquise peut
	// redescendre (le parent y ajoute un mot ; ou la voix de synthèse, chargée en asynchrone,
	// réapparaît et remet la dictée au rang des modes requis — cf. ui/tts.ts). On lit donc le cap
	// « acquis » À TRAVERS l'état courant, seul à faire foi : sinon la dernière cellule
	// annoncerait « acquis » pendant que le mot de la même ligne dit « en cours », juste à côté.
	// Le tampon lui-même n'est pas touché : si la voix vient de nouveau à manquer, la date
	// d'acquisition d'origine réapparaît telle quelle au lieu d'avoir été réécrite. Ce que la
	// frise perd alors, c'est l'épisode « acquis » du passé, rendu « en cours » — elle sous-dit,
	// et ne prétend jamais au parent un acquis que la ligne démentirait.
	const acquisStocke = horodatage(paliers?.acquis);
	const acquis = niveau === 'acquis' ? acquisStocke : null;
	// « Jamais commencée » se juge sur le journal TEL QU'IL EST STOCKÉ, pas sur la lecture
	// plafonnée : un cap daté prouve que la liste a été travaillée, et doit donner une frise même
	// si l'état courant dit « à découvrir » (liste que le parent a depuis vidée de ses mots). Même
	// robustesse que pour une leçon, où les caps datés passent avant « à découvrir ».
	if (niveau === 'a-decouvrir' && enCours === null && acquisStocke === null) return null;
	// Plancher établi sur la lecture PLAFONNÉE, elle : quand le seul cap du journal est un
	// « acquis » que l'état courant démentit, il ne reste rien de daté, et c'est donc l'état
	// courant qui tient lieu d'état des semaines suivies — sinon la frise afficherait
	// « à découvrir » sous un mot qui dit « en cours ».
	const aucunCap = enCours === null && acquis === null;
	const plancher: CelluleFrise = aucunCap ? niveau : 'a-decouvrir';
	// Pas de date de « première rencontre » pour une liste (aucun équivalent de firstSeen) : la
	// période « à découvrir » n'est pas bornée par une date mais déduite du plancher ci-dessus.
	return {
		semaines: cellulesFrise(acquis, enCours, -Infinity, plancher, debutSuivi, now),
		enCoursDepuis: enCours,
		acquisDepuis: acquis,
	};
}

/* La frise montre-t-elle un changement d'état ? Alimente le compteur « N changements récents »
   de la couverture par matière (#521), seule trace de « ça bouge » lisible SANS déplier une
   catégorie, maintenant que la frise vit dans les lignes de leçon.
   Lu SUR LES CELLULES et non recalculé depuis les dates de franchissement : c'est la même
   définition que ce que le parent voit, donc les deux ne peuvent pas diverger.
   Le recalcul, lui, se trompait deux fois — il comptait un cap franchi pendant la semaine la
   plus ancienne, déjà porté par la cellule 0 et donc invisible, et il s'allumait sur une frise
   plate quand le journal était incohérent (un `acquis` ancien avec un `enCours` récent, forme
   que `recordMonteesPalier` ne produit pas mais qu'il ne coûte rien d'ignorer). Pur. */
export function aChangeRecemment(frise: FriseNotion | null): boolean {
	if (frise === null) return false;
	// Deux états CONNUS dans la fenêtre : la frise change de rang sous les yeux du lecteur.
	if (new Set(frise.semaines.filter((c) => c !== 'inconnu')).size > 1) return true;
	// Un seul état connu, précédé de pointillé : c'en est un changement si et seulement si un CAP
	// DATÉ l'a produit — c'est alors le passage du pointillé à la couleur, visible lui aussi.
	// Sans cap daté, la frise ne fait que sortir de l'ignorance à la borne de suivi : ce qui a
	// changé est le SUIVI, pas l'enfant, et compter ça allumerait le compteur sur chaque leçon
	// travaillée du profil.
	// Ce compteur ne se lit donc PLUS entièrement sur les cellules, contrairement à la première
	// version : deux rangées au dessin identique (pointillé puis un seul état) répondent
	// différemment selon qu'un cap est daté ou non, parce que le dessin ne peut pas montrer un
	// franchissement dont les semaines antérieures sont inconnues. L'inverse, lui, reste vrai —
	// pas de changement compté sans deux états visibles ou un cap daté — et c'est le sens qui
	// compte : le compteur ne promet jamais un mouvement inexistant. Verrouillé par un test.
	const premierEtatConnu = frise.semaines.findIndex((c) => c !== 'inconnu');
	return premierEtatConnu > 0 && (frise.enCoursDepuis !== null || frise.acquisDepuis !== null);
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
	// Borne de suivi : la MÊME pour toutes les leçons du profil, sinon deux lignes voisines
	// s'afficheraient selon deux règles (cf. friseNotion).
	const debutSuivi = debutSuiviPaliers(lsGetRaw(uuid + '/' + PALIERS_DEBUT_KEY, null), paliersRaw);
	const reportsRaw = lsGetRaw(uuid + '/' + LESSON_REPORT_KEY, {}) as Record<string, EtatReport>;
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
				label: labelLecon(l, niveau),
				niveau: etat,
				pctRecent: perfRecente(stat)?.pct ?? null,
				epingle: fileSet.has(l.id),
				vues: stat?.attempts ?? 0,
				derniereFois: stat?.lastAt ?? null,
				tendance: tendanceNotion(stat),
				blocages: reportsRaw[k]?.jours ?? 0,
				frise: friseNotion(paliersRaw[k], firstSeenRaw[k], etat, debutSuivi, now),
			};
			rc.lecons.push(notion);

			totalLecons++;
			if (etoilee) {
				totalMaitrisees++;
				const fs = firstSeenRaw[k];
				if (typeof fs === 'number' && now - fs <= RECENT_FENETRE_NOUVELLES_MS) nouvellesRecentes++;
			}
			// « À revoir » : travaillée (≥ 1 question, sinon rien à suggérer) et pas encore
			// solide — OU butée assez de fois dans la leçon du jour (#485) pour que l'adulte
			// le sache : un mur qui revient trois fois demande une explication humaine, et le
			// % récent peut le masquer (il agrège aussi sprint et bilans, où la leçon ne pèse
			// parfois qu'une question). Suggestion seulement, jamais un épinglage d'office.
			if (
				stat?.questions &&
				notion.pctRecent != null &&
				(!estNotionSolide(etoilee, notion.pctRecent) || notion.blocages >= BLOCAGES_SIGNAL_ADULTE)
			)
				aRevoir.push(notion);
		}
		rc.travaillees = rc.acquis + rc.enCours + rc.nonAcquis;
		parCategorie.push(rc);
	}

	// Roll-up par matière (couverture) pour équilibrer entre matières.
	const parMatiere: RecapMatiere[] = SUBJECTS.map((sub) => {
		const cats = parCategorie.filter((c) => c.subject === sub.id);
		const compte = (f: (c: RecapCategorie) => number) => cats.reduce((n, c) => n + f(c), 0);
		return {
			subject: sub.id,
			label: sub.label,
			travaillees: compte((c) => c.travaillees),
			acquis: compte((c) => c.acquis),
			total: compte((c) => c.total),
			changementsRecents: compte((c) => c.lecons.filter((l) => aChangeRecemment(l.frise)).length),
		};
	}).filter((m) => m.total > 0);

	// Les plus fragiles d'abord (l'UI en montre 2-3). Les notions BUTÉES à répétition dans
	// la leçon du jour passent devant : c'est le signal le plus fort qu'un adulte doit
	// s'en mêler, et il ne doit pas être évincé de la liste écourtée par un simple % bas.
	const signale = (n: RecapNotion) => Number(n.blocages >= BLOCAGES_SIGNAL_ADULTE);
	aRevoir.sort((a, b) => signale(b) - signale(a) || (a.pctRecent ?? 100) - (b.pctRecent ?? 100));

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

/* ---------- File « à revoir » côté enfant (union catalogue / dictée) ----------
   Une entrée épinglée est soit une leçon du catalogue, soit une liste de dictée. La
   carte d'accueil résout le libellé/lancement selon `kind`. `id` = id BRUT (sans préfixe),
   utilisé pour le lancement (startLecon / startOrthoLecon). */
export type RevoirEntry =
	| { kind: 'lecon'; id: string; label: string; lesson: LessonDef }
	| { kind: 'ortho'; id: string; label: string; source: SourceLecon };

/* Entrées « à revoir » actuellement actives pour le profil ACTIF, filtrées sur celles
   ENCORE à travailler (auto-nettoyage : une leçon/liste redevenue solide quitte la boucle) :
   - leçon du catalogue : non étoilée ET (jamais re-travaillée OU perf récente < seuil) ;
   - liste de dictée : pas encore « acquise » (tous les mots maîtrisés).
   Sert à la carte d'accueil de l'enfant (ui/a-revoir-card.ts). Lit le profil actif.
   `dicteeDispo` (dispo du TTS, fourni par l'UI) conditionne l'« acquis » d'une dictée. */
export function revoirActives(dicteeDispo = false): RevoirEntry[] {
	const ids = loadRevoir();
	if (ids.length === 0) return [];
	// Vues SCOPÉES au profil et au niveau actifs (clés `lessonId` simples).
	const stats = loadLessonStats() as Record<string, LessonStat>;
	const stars = loadStars();
	// État orthographe du profil actif, chargé une seule fois si au moins une dictée est épinglée.
	const ortho = ids.some(isOrthoRevoirId) ? loadOrtho() : null;
	const out: RevoirEntry[] = [];
	for (const entryId of ids) {
		if (isOrthoRevoirId(entryId)) {
			if (!ortho) continue;
			const orthoId = orthoIdFromRevoir(entryId);
			const ref = listOrthoLecons(ortho).find((l) => l.id === orthoId);
			if (!ref) continue; // liste supprimée / dictée inconnue → ignorée
			// Encore « à revoir » tant que la liste n'est pas entièrement maîtrisée.
			if (niveauListeOrtho(ortho, orthoId, dicteeDispo) === 'acquis') continue;
			out.push({ kind: 'ortho', id: orthoId, label: ref.label, source: ref.source });
			continue;
		}
		const lesson = getAllLessons().find((l) => l.id === entryId);
		if (!lesson) continue;
		// On n'affiche que des leçons du niveau actif de l'enfant (une leçon épinglée
		// puis sortie du catalogue actif — ex. changement de classe — est ignorée).
		const niveau = niveauActifMatiere(lesson.subject);
		if (!lesson.levels.includes(niveau)) continue;
		const etoilee = (stars[entryId] || 0) > 0;
		const stat = stats[entryId];
		// Encore « à revoir » tant que la notion n'est pas solide (non étoilée ET jamais
		// re-travaillée ou perf récente sous le seuil) — MÊME prédicat que la purge (#465).
		if (!estNotionSolide(etoilee, perfRecente(stat)?.pct ?? null))
			out.push({ kind: 'lecon', id: entryId, label: labelLecon(lesson, niveau), lesson });
	}
	return out;
}

/* ---------- Récap des listes de dictée d'un profil (espace encadrant) ----------
   Les dictées (store orthographe) ne sont pas dans le catalogue → agrégées à part.
   Lecture BRUTE par UUID (comme le reste du récap), sans changer le profil actif. */
export interface RecapListeOrtho {
	id: string; // id BRUT (sans préfixe « ortho: »)
	label: string;
	source: SourceLecon;
	niveau: NiveauNotion; // 'a-decouvrir' | 'en-cours' | 'acquis'
	epingle: boolean; // présente dans la file « à revoir » (entrée préfixée)
	nbMots: number; // mots attendus de la liste
	maitrises: number; // mots déjà maîtrisés (compte factuel, accolé à « en cours » par l'UI)
	mots: string[]; // mots de la liste, dans l'ordre d'AFFICHAGE (cf. motsApercu) — #441
	/** Trajectoire d'états semaine par semaine (#541, cf. friseListeOrtho) ; `null` quand la
	    liste n'a jamais été commencée, donc qu'il n'y a rien à tracer. */
	frise: FriseNotion | null;
}
/* `dicteeDispo` fourni par l'UI (dispo du TTS) : conditionne l'« acquis » (mode dictée requis).
   Les dictées PRÉDÉFINIES ne sont listées que si l'enfant en a commencé au moins un mot
   (≠ « à découvrir ») — sinon les ~45 prédéfinies noieraient les listes du parent. Les listes
   CRÉÉES par le parent restent toujours visibles. */
export function listesOrthoProfil(
	profile: Profile,
	dicteeDispo = false,
	now = Date.now(),
): RecapListeOrtho[] {
	const state = loadOrthoFor(profile.uuid);
	const niveau = niveauProfilMatiere(profile, 'francais');
	const epinglees = new Set(loadRevoirFor(profile.uuid));
	const paliersRaw = lsGetRaw(profile.uuid + '/' + ORTHO_PALIERS_KEY, {}) as Record<
		string,
		PaliersNotion
	>;
	// Borne de suivi : la MÊME pour toutes les listes du profil, comme pour les leçons (deux
	// lignes voisines ne doivent pas s'afficher selon deux règles). Le plus ancien franchissement
	// sert de repli, ce qu'assure `debutSuiviPaliers` : il PROUVE que le journal tournait déjà.
	const debutSuivi = debutSuiviPaliers(
		lsGetRaw(profile.uuid + '/' + ORTHO_PALIERS_DEBUT_KEY, null),
		paliersRaw,
	);
	const out: RecapListeOrtho[] = [];
	for (const ref of listOrthoLecons(state, niveau)) {
		const av = avancementLecon(state, ref.id, dicteeDispo);
		const epingle = epinglees.has(orthoRevoirId(ref.id));
		// Prédéfinie jamais commencée : masquée du SUIVI (sinon ~45 lignes « à découvrir »
		// noieraient les listes du parent), SAUF si elle a été épinglée « à l'avance » (elle
		// est alors un suivi voulu). Les non commencées non épinglées sont, elles, proposées
		// séparément par dicteesProposees (sous-section « Parcourir »).
		if (ref.source === 'predefini' && av.niveau === 'a-decouvrir' && !epingle) continue;
		out.push({
			id: ref.id,
			label: ref.label,
			source: ref.source,
			niveau: av.niveau,
			epingle,
			nbMots: ref.nbMots,
			maitrises: av.maitrises,
			mots: motsApercu(ref.mots, ref.source),
			frise: friseListeOrtho(paliersRaw[ref.id], av.niveau, debutSuivi, now),
		});
	}
	return out;
}

/* ---------- Dictées prédéfinies « à épingler à l'avance » ----------
   Les dictées PRÉDÉFINIES du niveau du profil, pas encore commencées ET pas déjà épinglées
   (donc absentes du bloc de suivi ci-dessus). Permet à l'encadrant de pousser une dictée
   prête AVANT que l'enfant ne la rencontre — parité avec « épingler n'importe quelle leçon,
   même pas encore abordée » du catalogue, sans noyer le suivi. */
export interface DicteeProposee {
	id: string; // id BRUT (dictée prédéfinie `fr-ortho-*`)
	label: string;
	nbMots: number;
	mots: string[]; // mots de la dictée, dans l'ordre d'AFFICHAGE (cf. motsApercu) — #441
}
export function dicteesProposees(profile: Profile, dicteeDispo = false): DicteeProposee[] {
	const state = loadOrthoFor(profile.uuid);
	const niveau = niveauProfilMatiere(profile, 'francais');
	const epinglees = new Set(loadRevoirFor(profile.uuid));
	const out: DicteeProposee[] = [];
	for (const ref of listOrthoLecons(state, niveau)) {
		if (ref.source !== 'predefini') continue;
		if (epinglees.has(orthoRevoirId(ref.id))) continue;
		if (niveauListeOrtho(state, ref.id, dicteeDispo) !== 'a-decouvrir') continue;
		out.push({
			id: ref.id,
			label: ref.label,
			nbMots: ref.nbMots,
			mots: motsApercu(ref.mots, ref.source),
		});
	}
	return out;
}

/* ---------- Entrées épinglées d'un profil (espace encadrant, « Épinglées ») ----------
   TOUTES les entrées de la file (aucun filtre de faiblesse : c'est la liste de gestion),
   résolues en libellé. Une entrée dont la cible n'existe plus (leçon hors catalogue actif,
   liste supprimée) est écartée. */
export interface EpingleEntry {
	kind: 'lecon' | 'ortho';
	id: string; // id BRUT (sert au dé-épinglage : lecon → id ; ortho → orthoRevoirId(id))
	label: string;
	// Cible absente du niveau suivi par le profil (#518) → l'épingle est INERTE : `revoirActives`
	// l'écarte, elle ne revient jamais sur l'accueil de l'enfant. Reste dans cette liste de
	// GESTION, justement pour que l'adulte puisse la retirer en sachant pourquoi. Calculé ici,
	// là où le niveau de la cible est déjà connu, et non déduit d'une absence dans le récap :
	// deux façons de répondre à la même question divergeraient en silence.
	horsNiveau: boolean;
}
export function epingleesProfil(profile: Profile): EpingleEntry[] {
	const ids = loadRevoirFor(profile.uuid);
	if (ids.length === 0) return [];
	const ortho = ids.some(isOrthoRevoirId) ? loadOrthoFor(profile.uuid) : null;
	// Dictées visibles au niveau du profil (filtrage CUMULATIF : un CM1 garde les listes CE2).
	// Les listes CRÉÉES par le parent ne sont pas taguées par niveau, donc jamais hors niveau.
	const orthoDuNiveau = ortho
		? new Set(listOrthoLecons(ortho, niveauProfilMatiere(profile, 'francais')).map((l) => l.id))
		: null;
	const out: EpingleEntry[] = [];
	for (const entryId of ids) {
		if (isOrthoRevoirId(entryId)) {
			const orthoId = orthoIdFromRevoir(entryId);
			const label = labelLeconOrtho(orthoId, ortho?.listes ?? []);
			if (label)
				out.push({ kind: 'ortho', id: orthoId, label, horsNiveau: !orthoDuNiveau?.has(orthoId) });
			continue;
		}
		const lesson = getLessonById(entryId);
		if (lesson)
			out.push({
				kind: 'lecon',
				id: entryId,
				label: labelLecon(lesson, niveauProfilMatiere(profile, lesson.subject)),
				horsNiveau: !lesson.levels.includes(niveauProfilMatiere(profile, lesson.subject)),
			});
	}
	return out;
}

/* État d'acquisition à afficher sur une entrée ÉPINGLÉE (#518) — pur, sans DOM.
   Sans lui, l'adulte voyait une épingle sans savoir où en était l'enfant sur cette notion,
   donc sans pouvoir juger s'il fallait la retirer. Aucun calcul nouveau : on relit le niveau
   déjà porté par le récap (leçons) ou par le suivi des dictées (listes) — les deux échelles
   sont le même `NiveauNotion`, celle des dictées n'en utilisant que 3 crans.

   Une leçon JAMAIS TRAVAILLÉE n'est pas un trou : elle est bien dans le récap, à
   'a-decouvrir'. Le `null` dit seulement « aucun état disponible » : en pratique la cible est
   hors du niveau suivi (le récap et `listesOrthoProfil` ne couvrent que le niveau du profil,
   là où `epingleesProfil` retient une épingle de n'importe quel niveau). Cette RAISON n'est
   pas déduite ici : elle est portée par `EpingleEntry.horsNiveau`, calculé là où le niveau de
   la cible est connu. Un `null` sans `horsNiveau` serait donc une incohérence de données, et
   l'UI n'affiche alors rien plutôt que d'avancer un motif faux. */
export function niveauEpingle(
	e: EpingleEntry,
	recap: RecapProfil,
	listes: readonly RecapListeOrtho[],
): NiveauNotion | null {
	if (e.kind === 'ortho') return listes.find((l) => l.id === e.id)?.niveau ?? null;
	for (const cat of recap.parCategorie) {
		const n = cat.lecons.find((x) => x.lessonId === e.id);
		if (n) return n.niveau;
	}
	return null;
}

/* ============================================================
   Désépinglage automatique (#465) — la file « à revoir » se nettoie.
   ------------------------------------------------------------
   Jusqu'ici seul l'AFFICHAGE enfant se nettoyait (revoirActives filtre les entrées
   redevenues solides) : la file persistée, elle, gardait l'entrée à vie et l'espace
   encadrant la listait encore (« entrée fantôme »). purgeRevoirSolides retire donc
   pour de bon les entrées redevenues solides, avec EXACTEMENT le critère de l'affichage
   enfant (parité voulue : ce que l'enfant ne voit plus ne traîne pas en file) — leçon
   étoilée ou perf récente ≥ SEUIL_REVOIR, liste de dictée « acquise ».

   Deux garde-fous, sans quoi le retrait automatique casserait l'existant :
   - une entrée épinglée ALORS QU'ELLE ÉTAIT DÉJÀ SOLIDE n'est jamais retirée d'office
     (« épingler n'importe quelle leçon, même déjà acquise » est une capacité assumée de
     l'espace encadrant) — sinon l'épingle disparaîtrait au rendu suivant et un
     ré-épinglage manuel serait impossible. D'où la mémoire des entrées VUES fragiles
     alors qu'épinglées (REVOIR_FRAGILE_KEY) : seules celles-là sont candidates ;
   - le retrait est TRACÉ (REVOIR_AUTO_KEY) et rendu visible côté encadrant, pour qu'une
     épingle ne disparaisse pas sans explication et puisse être remise d'un clic.

   Adoption de l'existant : à la toute première passe (clé de marques ABSENTE), toute la
   file est considérée candidate — c'est ce qui purge les fantômes accumulés avant #465.

   Une cible non résolue (leçon hors catalogue/hors niveau du profil, liste supprimée)
   n'est JAMAIS retirée : on ne sait pas juger sa solidité, et l'affichage l'ignore déjà.
   ============================================================ */
export const REVOIR_AUTO_KEY = 'ludaskia_revoirAuto'; // journal daté des retraits automatiques
export const REVOIR_FRAGILE_KEY = 'ludaskia_revoirFragile'; // entrées vues fragiles alors qu'épinglées

/* Retrait automatique tracé. Le libellé est FIGÉ à l'instant du retrait : la cible peut
   disparaître ensuite (liste supprimée, changement de classe) sans rendre la trace muette. */
export interface RetraitAuto {
	id: string; // entryId TEL QUEL (préfixe « ortho: » inclus) → ré-épinglage direct
	kind: 'lecon' | 'ortho';
	label: string;
	at: number; // horodatage du retrait
}
// Trace RÉCENTE, pas un historique : l'onglet reste lisible. Dimensionné pour absorber la
// passe d'ADOPTION (celle qui purge d'un coup les fantômes d'avant #465) — c'est le moment
// où l'explication compte le plus ; au-delà, les retraits les plus anciens ne sont pas tracés.
const RETRAITS_AUTO_MAX = 10;
const RETRAITS_AUTO_FENETRE_MS = 30 * 86400000; // au-delà, la trace n'apprend plus rien

function loadRetraitsAuto(uuid: string): RetraitAuto[] {
	const v = lsGetRaw(uuid + '/' + REVOIR_AUTO_KEY, []);
	if (!Array.isArray(v)) return [];
	return v.filter(
		(r): r is RetraitAuto =>
			!!r &&
			typeof r.id === 'string' &&
			typeof r.label === 'string' &&
			typeof r.at === 'number' &&
			(r.kind === 'lecon' || r.kind === 'ortho'),
	);
}
/* Marques de fragilité ; `null` = clé JAMAIS écrite, seul cas qui déclenche l'adoption.
   Une clé présente mais illisible (JSON cassé, mauvaise forme) rend une liste VIDE et non
   `null` : sinon une donnée corrompue rouvrirait l'adoption et retirerait d'office une
   épingle posée sur une notion déjà solide (le garde-fou doit être « fail-safe »). */
function loadFragiles(uuid: string): string[] | null {
	if (lsGetItemRaw(uuid + '/' + REVOIR_FRAGILE_KEY) == null) return null;
	const v = lsGetRaw(uuid + '/' + REVOIR_FRAGILE_KEY, []);
	return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

/* Solidité d'une entrée épinglée pour un profil donné ; `null` si la cible n'est pas
   résolvable (donc intouchable). Contexte de lecture passé par l'appelant : la file
   entière est jugée sur UNE seule lecture du stockage. */
interface EtatEpingle {
	kind: 'lecon' | 'ortho';
	label: string;
	solide: boolean;
}
interface CtxSolidite {
	starsRaw: Record<string, number>;
	statsRaw: Record<string, LessonStat>;
	ortho: OrthoState | null;
	dicteeDispo: boolean;
}
function etatEpingle(entryId: string, profile: Profile, ctx: CtxSolidite): EtatEpingle | null {
	if (isOrthoRevoirId(entryId)) {
		if (!ctx.ortho) return null;
		const orthoId = orthoIdFromRevoir(entryId);
		const ref = listOrthoLecons(ctx.ortho).find((l) => l.id === orthoId);
		if (!ref) return null; // liste supprimée / dictée inconnue
		return {
			kind: 'ortho',
			label: ref.label,
			// Solide = liste entièrement maîtrisée (même critère que revoirActives), MAIS on
			// exige la dispo du TTS : sans elle, le mode dictée n'est pas requis (modesRequis)
			// et « acquis » devient plus FACILE. Le filtre d'affichage peut se le permettre (il
			// est réversible), pas un retrait définitif → sur un appareil sans voix de synthèse,
			// une dictée épinglée n'est jamais retirée d'office.
			solide: ctx.dicteeDispo && niveauListeOrtho(ctx.ortho, orthoId, ctx.dicteeDispo) === 'acquis',
		};
	}
	const lesson = getLessonById(entryId);
	if (!lesson) return null;
	const niveau = niveauProfilMatiere(profile, lesson.subject);
	if (!lesson.levels.includes(niveau)) return null; // hors niveau du profil → ignorée, pas retirée
	const k = lesson.id + '@' + niveau; // stats/étoiles namespacées par niveau (#225)
	const etoilee = (ctx.starsRaw[k] || 0) > 0;
	const pct = perfRecente(ctx.statsRaw[k])?.pct ?? null;
	return {
		kind: 'lecon',
		label: labelLecon(lesson, niveau),
		solide: estNotionSolide(etoilee, pct), // même prédicat que le filtre d'affichage enfant
	};
}

/* Nettoie la file « à revoir » d'un profil : retire les entrées redevenues solides
   (candidates seulement), journalise les retraits et met à jour les marques de fragilité.
   Renvoie les entryId retirés (vide = rien à faire). `dicteeDispo` (dispo du TTS) vient de
   l'UI : il conditionne l'« acquis » d'une dictée. `now` injecté (testable).
   Écritures BRUTES **sans `touchProfile`**, contrairement à l'épinglage manuel
   (`toggleRevoirFor`) : ce nettoyage tourne tout seul à l'ouverture de l'espace, donc
   bumper `updatedAt` rendrait un profil « plus récent » pour une simple CONSULTATION et
   fausserait la fusion par récence de l'export/import. La règle est « une modification
   VOULUE par l'adulte bumpe, un effet automatique non ». */
export function purgeRevoirSolides(profile: Profile, dicteeDispo: boolean, now: number): string[] {
	const uuid = profile.uuid;
	const ids = loadRevoirFor(uuid);
	const marques = loadFragiles(uuid);
	if (ids.length === 0) {
		// File vide : on pose la clé de marques pour clore l'adoption (sinon une file
		// remplie plus tard serait adoptée à tort comme « existante »).
		if (marques == null) lsSetRaw(uuid + '/' + REVOIR_FRAGILE_KEY, '[]');
		return [];
	}
	const ctx: CtxSolidite = {
		starsRaw: lsGetRaw(uuid + '/' + STARS_KEY, {}) as Record<string, number>,
		statsRaw: lsGetRaw(uuid + '/' + LESSON_STATS_KEY, {}) as Record<string, LessonStat>,
		ortho: ids.some(isOrthoRevoirId) ? loadOrthoFor(uuid) : null,
		dicteeDispo,
	};
	// Clé absente → adoption : toute la file existante est candidate (purge des fantômes).
	const candidates = new Set(marques ?? ids);
	const restants: string[] = [];
	const fragiles: string[] = []; // marques de la passe suivante (les ids partis sont oubliés)
	const retires: RetraitAuto[] = [];
	for (const entryId of ids) {
		const etat = etatEpingle(entryId, profile, ctx);
		// Retrait SEULEMENT si la cible est résolvable, solide, ET déjà candidate (vue fragile
		// alors qu'épinglée) : une épingle posée sur une notion solide est un choix du parent.
		if (etat != null && etat.solide && candidates.has(entryId)) {
			retires.push({ id: entryId, kind: etat.kind, label: etat.label, at: now });
			continue; // sortie de la file ET de la mémoire de fragilité
		}
		restants.push(entryId);
		// Reste candidate si elle est fragile maintenant, ou si elle l'était déjà et qu'on ne
		// peut pas en juger (cible non résolvable — on ne perd pas la marque acquise).
		if (etat != null ? !etat.solide : candidates.has(entryId)) fragiles.push(entryId);
	}
	if (retires.length) {
		saveRevoirFor(uuid, restants);
		// Journal : plus récent d'abord, borné en nombre ET en ancienneté.
		const journal = [...retires, ...loadRetraitsAuto(uuid)]
			.filter((r) => now - r.at <= RETRAITS_AUTO_FENETRE_MS)
			.slice(0, RETRAITS_AUTO_MAX);
		lsSetRaw(uuid + '/' + REVOIR_AUTO_KEY, JSON.stringify(journal));
	}
	// Marques réécrites seulement si elles changent : le rendu est idempotent.
	const inchangees =
		marques != null &&
		marques.length === fragiles.length &&
		fragiles.every((x, i) => marques[i] === x);
	if (!inchangees) lsSetRaw(uuid + '/' + REVOIR_FRAGILE_KEY, JSON.stringify(fragiles));
	return retires.map((r) => r.id);
}

/* Trace des retraits automatiques d'un profil (bloc « Retirées automatiquement » de
   l'espace encadrant), la plus récente d'abord. Une entrée RÉ-ÉPINGLÉE depuis n'y figure
   plus (elle est de retour dans la file : la trace serait trompeuse). Lecture pure. */
export function retraitsAutoProfil(profile: Profile, now: number): RetraitAuto[] {
	const epinglees = new Set(loadRevoirFor(profile.uuid));
	return loadRetraitsAuto(profile.uuid)
		.filter((r) => !epinglees.has(r.id) && now - r.at <= RETRAITS_AUTO_FENETRE_MS)
		.slice(0, RETRAITS_AUTO_MAX);
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
		// doublon fantôme « en retard » que le parent ne pourrait jamais résorber. C'est le
		// seul endroit qui filtre les clés APRÈS coup : ailleurs, le récap parcourt les leçons
		// du niveau suivi et construit la clé avec ce niveau, donc n'atteint jamais les autres.
		// (Sans objet pour les mots d'ortho, non namespacés.)
		if (niveauOfKey(k) !== niveauProfilMatiere(profile, lesson.subject)) continue;
		entrees.push(
			entreeRevision(
				k,
				labelLecon(lesson, niveauProfilMatiere(profile, lesson.subject)),
				'lecon',
				lesson.category,
				etat,
				now,
			),
		);
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
