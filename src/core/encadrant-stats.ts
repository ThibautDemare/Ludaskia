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
import { lsGetRaw } from './storage';
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
	etoilesParNiveau,
	type EtoilesNiveau,
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
	getLessonById,
	getLessonsByCategory,
	CATEGORIES,
	SUBJECTS,
	ORTHO_CATEGORY_ID,
	type LessonDef,
	type SchoolLevel,
	type SubjectId,
} from './catalog';
import { LEVEL_ORDER, estNiveau, labelLecon, niveauInferieurImmediat } from './levels';
import { BLOCAGES_SIGNAL_ADULTE, type EtatReport } from './report-lecon';
import { consolidationBasNiveau } from './consolidation-bas-niveau';
import { touchProfile, type Profile } from './profiles';
import { epingleLecon } from './revoir-cible';
import { niveauProfilMatiere } from './niveau-profil';
import { loadRevoirFor, orthoRevoirId } from './revoir-file';
import { loadOrthoFor, saveOrthoFor, supprimerMot, ORTHO_KEY } from './orthographe/store';
import {
	listOrthoLecons,
	labelLeconOrtho,
	motsApercu,
	type SourceLecon,
} from './orthographe/lessons';
import { niveauListeOrtho, avancementLecon, motsAttendusLecon } from './orthographe/progression';
import {
	ORTHO_PALIERS_KEY,
	ORTHO_PALIERS_DEBUT_KEY,
	ORTHO_ETAPES_DEBUT_KEY,
	debutSuiviEtapes,
} from './orthographe/paliers';
import { composition, type RangMot } from './orthographe/etapes';
import {
	REVISION_INTERVALLES,
	PALIER_ACQUIS,
	JOUR,
	estAcquis,
	estHorsRotation,
	estDuControle,
} from './revision';
import { chargerRetardsFor, tauxParTranche, type TauxTranche } from './retard-journal';
import type { EtatRevision, OrthoState, MotOrtho } from './orthographe/types';

/* L'échelle de maîtrise (types + niveauNotion/tendanceNotion) vit dans maitrise.ts ; on la
   re-expose ici pour les consommateurs historiques de l'espace encadrant (UI + tests) qui
   importent « depuis encadrant-stats ». */
export { niveauNotion, tendanceNotion } from './maitrise';
export type { NiveauNotion, TendanceNotion } from './maitrise';
/* Le cumul d'étoiles par classe est calculé par `progress` (qui connaît le namespacing des
   clés) et consommé par l'espace encadrant : on re-expose son type avec le récap qui le porte. */
export type { EtoilesNiveau } from './progress';
/* La file « à revoir » et le niveau d'un profil désigné vivent dans leurs propres modules
   depuis #573 (`revoir-file.ts`, `niveau-profil.ts`) ; ré-exportés ici pour les mêmes
   consommateurs historiques. Un nouveau code importe directement le module d'origine. */
export * from './revoir-file';
export { niveauProfilMatiere, origineLecon } from './niveau-profil';
export type { DirectionNiveau, OrigineLecon } from './niveau-profil';

/* ---------- Seuils propres à l'espace encadrant ----------
   (L'échelle de maîtrise et ses seuils — SEUIL_NON_ACQUIS, tendance — vivent dans maitrise.ts.) */
const RECENT_FENETRE_NOUVELLES_MS = 30 * 86400000; // « notions maîtrisées récemment » : 30 jours
const JOURS_ACTIVITE = 7; // graphe d'activité : 7 derniers jours
const SEMAINES_FRISE = 12; // frise d'états par leçon (#521) : 12 dernières semaines (au-delà, le contenu a souvent changé)

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
	epingle: boolean; // présente dans la file « à revoir » À CETTE CLASSE-CI (#573)
	/** Id de file de la notion (#573) : celui qui l'épingle déjà, sinon celui à poser — la
	    leçon à la classe de la ligne. C'est ce que bascule le bouton « Épingler ». */
	entryId: string;
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
	/** Étoiles cumulées PAR CLASSE, tous niveaux confondus (#556). Contrepartie adulte du
	    « trésor » cumulé de l'enfant : elle dit quelle part du travail se fait hors de la
	    classe suivie, donc si les assignations hors classe restent ponctuelles. Vide tant que
	    rien n'est étoilé ; un seul niveau ⇒ l'UI n'a rien d'utile à comparer. */
	etoilesParNiveau: EtoilesNiveau[];
	/** Ce qui reste de la classe JUSTE EN DESSOUS, par matière (#723) : une entrée par matière
	    dont la classe suivie a une classe précédente au catalogue ET où l'enfant a travaillé au
	    moins une leçon propre à cette classe. Hors du périmètre ci-dessus (compteurs, catégories,
	    suggestions restent scopés à la classe suivie) : c'est une liste d'ACTION pour l'adulte,
	    pas une extension du suivi. Ordre de `SUBJECTS`. */
	classePrecedente: RecapClassePrecedente[];
}

/* Matière dont la classe précédente a encore du travail commencé et pas franchi (#723).
   Sélection, tri et règle de sortie : `core/consolidation-bas-niveau.ts`. */
export interface RecapClassePrecedente {
	subject: SubjectId;
	label: string; // libellé de la MATIÈRE
	niveau: SchoolLevel; // la classe précédente
	/** Leçons propres à cette classe travaillées à ce niveau, franchies comprises : > 0 avec
	    `fragiles` vide = tout ce qui avait été commencé est franchi (phrase de clôture). */
	nbTravaillees: number;
	fragiles: RecapNotion[]; // les plus fragiles d'abord ; `epingle` dit si elle est déjà épinglée
}

/* Leçons de la classe précédente encore en cours, sommées PAR CLASSE (#723) : alimente les
   tuiles des chiffres-clés. Deux matières au CM1 donnent une seule classe (CE2) ; maths au
   CM1 et français au CM2, deux. Les leçons ÉPINGLÉES comptent : l'épingle ne les franchit
   pas, elles sont toujours en cours (le sous-bloc, lui, les montre dans « Épinglées », pas
   dans sa propre liste). Classe à zéro omise ; ordre scolaire. */
export function resteClassePrecedente(
	classes: readonly RecapClassePrecedente[],
): { niveau: SchoolLevel; n: number }[] {
	const parClasse = new Map<SchoolLevel, number>();
	for (const cl of classes)
		parClasse.set(cl.niveau, (parClasse.get(cl.niveau) ?? 0) + cl.fragiles.length);
	return LEVEL_ORDER.flatMap((niveau) => {
		const n = parClasse.get(niveau) ?? 0;
		return n > 0 ? [{ niveau, n }] : [];
	});
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
	partage: number; // séance partagée par lien (#734)
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
		partage: 0,
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
/* Cap positif franchi par une cible (#536). Deux valeurs seulement, et jamais rien de bas :
   ce sont les deux seuls franchissements que les journaux de paliers datent, et ce sont aussi
   les deux seuls qu'on accepte d'annoncer ici. */
export type CapFranchi = 'en-cours' | 'acquis';

/* Cap le plus HAUT franchi depuis `seuil`, ou `null` si aucun ne l'a été dans cette fenêtre.
   Comparaison directe des horodatages à une borne en MILLISECONDES, sans passer par la frise :
   celle-ci raisonne en semaines calendaires alors que ce bloc-ci offre des fenêtres de 1, 2 ou
   7 jours (`joursTravail`), et un « aujourd'hui » qui se lirait sur une semaine annoncerait des
   progrès vieux de six jours.
   Le plus haut des deux, et non les deux : une notion acquise ce matin a franchi « en cours »
   dans la même fenêtre si elle a démarré hier, et « commencée puis acquise » sur une seule ligne
   raconterait deux fois le même élan. Pur. */
export function capDansFenetre(
	paliers: PaliersNotion | undefined,
	seuil: number,
): CapFranchi | null {
	// Borne basse INCLUSIVE, comme celle qui retient la ligne elle-même (`lastAt >= seuil`) :
	// sinon la mention arriverait un jour après la ligne qu'elle décore. Pas de borne haute —
	// rien dans ce bloc ne recale un horodatage sur `now` — mais `Infinity` est rejeté, comme
	// partout ailleurs dans ce module.
	const dans = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= seuil;
	if (dans(paliers?.acquis)) return 'acquis';
	if (dans(paliers?.enCours)) return 'en-cours';
	return null;
}

/* Le plus haut de deux caps. Sert quand une même leçon a PLUSIEURS clés de journal (travaillée
   sous deux classes) : le progrès compte, qu'il ait eu lieu sous l'une ou sous l'autre. */
const capPlusHaut = (a: CapFranchi | null, b: CapFranchi | null): CapFranchi | null =>
	a === 'acquis' || b === 'acquis' ? 'acquis' : (a ?? b);

/* Tout ce qu'il faut pour décider si un cap est ANNONÇABLE (#536), en un seul paramètre plutôt
   qu'en quatre de plus.
   Deux journaux et non un : les leçons du catalogue et les listes de dictée ont chacune le leur
   (`LESSON_PALIERS_KEY`, indexé par la clé de stats namespacée, et `ORTHO_PALIERS_KEY`, indexé
   par l'id nu), et une ligne de « Travaillé récemment » peut être l'une ou l'autre
   (`CibleTravaillee.kind`).
   Les étoiles et la dispo du TTS servent, elles, à établir l'état COURANT de la cible, sans quoi
   un cap démenti serait annoncé — voir `capAnnoncable`. */
export interface SourcesCapFranchi {
	paliersLecons: Record<string, PaliersNotion>;
	paliersOrtho: Record<string, PaliersNotion>;
	/** Étoiles par clé de stats (même indexation que `paliersLecons`). */
	etoiles: Record<string, number>;
	/** Dispo de la voix de synthèse : conditionne l'« acquis » d'une liste (un mode requis en moins). */
	dicteeDispo: boolean;
}
/* Forme PLATE et non imbriquée par famille (`{ lecons: {...}, ortho: {...} }`), qui serait plus
   parlante au premier regard : `dicteeDispo` n'est pas une donnée de la famille ortho mais une
   propriété de l'APPAREIL, et la ranger avec deux journaux lus en stockage laisserait croire
   qu'elle vient du profil comme eux. Les quatre champs ont en commun d'être des entrées de la
   décision, pas une origine. */

/* Cap franchi dans la fenêtre ET encore porté par l'état COURANT de la cible.
   Sans ce plafonnement, la mention annoncerait « tout juste acquise » pendant que l'accordéon du
   même écran dit « à renforcer ». Les journaux de paliers sont MONOTONES : ils ne datent que les
   montées, jamais les redescentes, et il y a des redescentes réelles — une leçon dont la perf
   récente retombe sous le seuil, un parent qui ajoute un mot à une liste déjà acquise, ou la voix
   de synthèse qui réapparaît et remet la dictée au rang des modes requis. C'est exactement le
   raisonnement que `friseListeOrtho` tient déjà, et le même patron de plafonnement.
   On filtre AVANT de prendre le plus haut, et non après : un « acquis » démenti ne doit pas
   effacer un « en cours » de la même fenêtre qui, lui, est encore vrai. */
export function capAnnoncable(
	paliers: PaliersNotion | undefined,
	seuil: number,
	niveau: NiveauNotion,
): CapFranchi | null {
	return capDansFenetre(
		{
			acquis: niveau === 'acquis' ? paliers?.acquis : undefined,
			enCours: niveau === 'acquis' || niveau === 'en-cours' ? paliers?.enCours : undefined,
		},
		seuil,
	);
}

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
	/** Cap POSITIF franchi pendant la fenêtre affichée (#536), `null` sinon — et c'est le cas
	    ordinaire. Seule exception à la règle « pas d'état sur ces lignes » : le pédagogue a
	    écarté tout badge systématique (une notion tout juste abordée est encore « à découvrir »,
	    donc un badge afficherait un niveau bas sur ce qu'il y a de plus récent) mais autorisé
	    explicitement la mention d'un progrès. */
	capFranchi: CapFranchi | null;
	/** Classe dans laquelle la leçon a été jouée : celle de sa clé de stats (#772). Une leçon
	    travaillée dans deux classes fait DEUX lignes, une par classe. Absente pour une dictée,
	    qui n'a pas de classe. */
	niveau?: SchoolLevel;
}
export interface GroupeTravail {
	subject: SubjectId;
	label: string; // libellé de matière (« Mathématiques »)
	cibles: CibleTravaillee[]; // la plus récemment travaillée en tête
}
/* Séances d'UNE ligne de « Travaillé récemment » (#772), une leçon dans une classe : celles
   journalisées avec cette classe (`n`), plus les entrées d'avant #772, qui n'en ont pas — mais
   seulement si la leçon n'a qu'une ligne dans la fenêtre. Sinon une entrée sans classe ne
   s'attribue à aucune : la donner à l'une irait au hasard de l'ordre des clés de stats. */
function seancesDeLaClasse(
	acc: { parClasse: Map<SchoolLevel, number>; sansClasse: number } | undefined,
	niveau: SchoolLevel,
	nbLignes: number,
): number {
	if (!acc) return 0;
	return (acc.parClasse.get(niveau) ?? 0) + (nbLignes === 1 ? acc.sansClasse : 0);
}

/* `classeSuivie` (#772) : classe suivie par le profil dans chaque matière. Une ligne jouée
   AU-DESSUS d'elle (un essai en classe supérieure) ne porte jamais d'état d'acquisition, donc
   pas de cap : c'est le régime factuel de #556. Absente, aucune ligne n'est jugée au-dessus. */
export function travailRecent(
	statsRaw: Record<string, LessonStat>,
	activityRaw: unknown,
	ortho: OrthoState | null,
	sources: SourcesCapFranchi,
	jours: number,
	now: number,
	classeSuivie?: (subject: SubjectId) => SchoolLevel,
): GroupeTravail[] {
	const seuil = debutJourLocal(now, jours - 1);
	const activite = normalizeActivity(activityRaw).filter((e) => e.t >= seuil);
	// Séances attribuables par cible : compte + date la plus récente. `dictee` retient le
	// type pour distinguer une liste d'orthographe d'une leçon du catalogue (espaces d'ids
	// disjoints, mais on ne veut pas en dépendre) : il suffit qu'UNE entrée de la cible soit
	// une dictée, sinon l'ordre des entrées déciderait de l'affichage de la ligne.
	// `parClasse`/`sansClasse` (#772) : la même chose, ventilée par classe JOUÉE (`n`) pour les
	// leçons ; les entrées d'avant #772 n'en ont pas et restent à part.
	const parRef = new Map<
		string,
		{
			seances: number;
			derniereFois: number;
			dictee: boolean;
			parClasse: Map<SchoolLevel, number>;
			sansClasse: number;
		}
	>();
	for (const e of activite) {
		if (!e.ref) continue;
		let acc = parRef.get(e.ref);
		if (acc) {
			acc.seances++;
			acc.derniereFois = Math.max(acc.derniereFois, e.t);
			acc.dictee = acc.dictee || e.k === 'dictee';
		} else {
			acc = {
				seances: 1,
				derniereFois: e.t,
				dictee: e.k === 'dictee',
				parClasse: new Map(),
				sansClasse: 0,
			};
			parRef.set(e.ref, acc);
		}
		if (e.n) acc.parClasse.set(e.n, (acc.parClasse.get(e.n) ?? 0) + 1);
		else acc.sansClasse++;
	}

	const parMatiere = new Map<SubjectId, CibleTravaillee[]>();
	const pousser = (subject: SubjectId, cible: CibleTravaillee) => {
		const liste = parMatiere.get(subject);
		if (liste) liste.push(cible);
		else parMatiere.set(subject, [cible]);
	};

	// Leçons du catalogue : une ligne par CLASSE jouée (#772). Avant, deux clés `@niveau` de la
	// même leçon ne faisaient qu'une ligne, et l'adulte ne voyait pas que l'enfant avait
	// travaillé la version CE2 d'une leçon qu'il suit en CM1. Une clé héritée (sans `@`) est
	// du CE2 et rejoint la ligne `@ce2`.
	const derniereFoisLecon = new Map<string, number>(); // clé de ligne `id@classe`
	const capLecon = new Map<string, CapFranchi | null>();
	const lignesParLecon = new Map<string, number>();
	for (const key in statsRaw) {
		const lastAt = statsRaw[key].lastAt;
		if (typeof lastAt !== 'number' || lastAt < seuil) continue;
		const niveauCle = niveauOfKey(key);
		if (!estNiveau(niveauCle)) continue; // clé illisible : rien à nommer
		const id = `${lessonOfKey(key)}@${niveauCle}`;
		if (!derniereFoisLecon.has(id)) {
			const nu = lessonOfKey(key);
			lignesParLecon.set(nu, (lignesParLecon.get(nu) ?? 0) + 1);
		}
		derniereFoisLecon.set(id, Math.max(derniereFoisLecon.get(id) ?? lastAt, lastAt));
		// Le journal des paliers des leçons est indexé par la CLÉ DE STATS, namespacée `@niveau`
		// (`recordMonteesPalier` l'écrit ainsi, et la frise le relit ainsi) — PAS par l'id nu.
		// L'adresser par l'id rendait la mention muette pour TOUTE leçon, et la panne était
		// invisible : « aucun cap franchi » est le cas ordinaire, donc rien n'aurait signalé que
		// ce n'était jamais autre chose. Le journal des LISTES, lui, est bien indexé par l'id nu
		// (cf. plus bas) : les deux n'ont pas la même clé, et c'est là que l'élargissement de
		// cette mention aux dictées pouvait échouer sans bruit.
		// L'état courant se lit sur la MÊME clé que le journal, avec la définition employée
		// partout ailleurs dans ce module (`niveauNotion(stat, etoilee)`) : en réécrire une
		// seconde ici donnerait deux états possibles pour une même leçon selon qui la regarde.
		const etat = niveauNotion(statsRaw[key], (sources.etoiles[key] || 0) > 0);
		capLecon.set(
			id,
			capPlusHaut(capLecon.get(id) ?? null, capAnnoncable(sources.paliersLecons[key], seuil, etat)),
		);
	}
	for (const [cle, derniereFois] of derniereFoisLecon) {
		const id = lessonOfKey(cle);
		const niveau = niveauOfKey(cle);
		const lesson = getLessonById(id);
		// Leçon retirée du catalogue depuis : plus rien à nommer. (`niveau` est toujours valide
		// ici, la clé de ligne ayant été construite sur une classe vérifiée.)
		if (!lesson || !estNiveau(niveau)) continue;
		const seances = seancesDeLaClasse(parRef.get(id), niveau, lignesParLecon.get(id) ?? 0);
		const suivie = classeSuivie?.(lesson.subject);
		const auDessus = !!suivie && LEVEL_ORDER.indexOf(niveau) > LEVEL_ORDER.indexOf(suivie);
		pousser(lesson.subject, {
			id,
			label: labelLecon(lesson, niveau),
			kind: 'lecon',
			contexte: CATEGORIES.find((c) => c.id === lesson.category)?.label ?? '',
			seances: seances > 0 ? seances : null,
			derniereFois,
			capFranchi: auDessus ? null : (capLecon.get(cle) ?? null),
			niveau,
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
			// Journal des LISTES, pas celui des leçons : deux clés de stockage distinctes, indexées
			// différemment, et un id de liste n'existe pas dans l'autre (cf. SourcesCapFranchi).
			// `ortho` est ici forcément non nul — sans lui, `labelLeconOrtho` n'aurait rendu aucun
			// libellé et la ligne aurait été écartée juste au-dessus.
			capFranchi: capAnnoncable(
				sources.paliersOrtho[id],
				seuil,
				ortho ? niveauListeOrtho(ortho, id, sources.dicteeDispo) : 'a-decouvrir',
			),
		});
	}

	// La plus récente en tête ; à horodatage IDENTIQUE (cas courant : un bilan écrit le même
	// `lastAt` à toutes ses leçons), la plus travaillée, un compte inconnu passant derrière
	// un compte connu ; puis l'ordre alphabétique, sans quoi l'ordre d'itération des clés de
	// stats déciderait et deux rendus successifs pourraient différer ; enfin, pour les deux
	// lignes d'une même leçon au même libellé (#772), la classe la plus basse d'abord.
	const rangClasse = (c: CibleTravaillee) => (c.niveau ? LEVEL_ORDER.indexOf(c.niveau) : -1);
	return SUBJECTS.filter((s) => parMatiere.has(s.id)).map((s) => ({
		subject: s.id,
		label: s.label,
		cibles: parMatiere
			.get(s.id)!
			.sort(
				(a, b) =>
					b.derniereFois - a.derniereFois ||
					(b.seances ?? 0) - (a.seances ?? 0) ||
					a.label.localeCompare(b.label, 'fr') ||
					rangClasse(a) - rangClasse(b),
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
/* `dicteeDispo` est OBLIGATOIRE, contrairement aux autres lectures de profil de ce module qui
   le défaultent à `false`. Un défaut ici serait silencieusement optimiste — sans voix de
   synthèse une liste compte un mode requis de moins, donc elle s'acquiert plus tôt, et une
   mention pourrait s'afficher sur une liste que l'appareil ne considère pas comme acquise.
   C'est précisément la classe de panne muette que le reste de cette fonction s'emploie à
   éviter, et il n'y a qu'un appelant : le coût de l'exiger est nul. */
export function travailRecentProfil(
	profile: Profile,
	jours: number,
	now: number,
	dicteeDispo: boolean,
): GroupeTravail[] {
	const uuid = profile.uuid;
	return travailRecent(
		lsGetRaw(uuid + '/' + LESSON_STATS_KEY, {}) as Record<string, LessonStat>,
		lsGetRaw(uuid + '/' + ACTIVITY_KEY, []),
		loadOrthoFor(uuid),
		// Les DEUX journaux de paliers (#536), lus ici et non dans la fonction pure : c'est ce
		// qui garde `travailRecent` testable sans monter un profil en localStorage.
		{
			paliersLecons: lsGetRaw(uuid + '/' + LESSON_PALIERS_KEY, {}) as Record<string, PaliersNotion>,
			paliersOrtho: lsGetRaw(uuid + '/' + ORTHO_PALIERS_KEY, {}) as Record<string, PaliersNotion>,
			etoiles: lsGetRaw(uuid + '/' + STARS_KEY, {}) as Record<string, number>,
			dicteeDispo,
		},
		jours,
		now,
		(subject) => niveauProfilMatiere(profile, subject),
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
     première fois. Une cellule PASSÉE ne vaut donc que « l'état le plus haut atteint à cette
     date » : ce préfixe croît et ne redescend jamais, faute d'une donnée qui daterait les
     baisses. La DERNIÈRE cellule, elle, échappe à cette limite — l'état du jour est connu
     (`RecapNotion.niveau`, le même que le mot de la ligne) et lui est imposé (cf.
     `finaliserFrise`, correctif « état du jour »). C'était la faille : la frise pouvait finir plus haut que ce que
     la ligne annonçait juste à côté, et plus haut que la barre de la catégorie.
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
     testé EN PREMIER, ce qui étend l'état courant à TOUTE la période suivie plutôt qu'à la
     seule dernière cellule — celle-ci le porte de toute façon depuis le correctif « état du jour » (`finaliserFrise`),
     mais rien ne justifierait de laisser les semaines antérieures dans le doute quand aucune
     montée n'a été observée ;
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
	const semaines = cellulesFrise(acquis, enCours, finDecouv, plancher, debutSuivi, now);
	return finaliserFrise(semaines, niveau, enCours, acquis);
}

/* Rangée FINALISÉE : la dernière cellule porte l'ÉTAT DU JOUR, et non le rang le plus haut
   atteint (correctif « état du jour »).
   Pourquoi ce forçage. Le journal des paliers est MONOTONE (il ne date que les montées, cf.
   recordMonteesPalier) ; une rangée reconstruite depuis lui ne peut donc que croître. L'état
   courant, lui, redescend — la fenêtre glissante de 40 questions retombe sous les 40 %. Sans
   ce forçage, une leçon affichait « à renforcer » en toutes lettres, comptait pour un segment
   ORANGE dans la barre de sa catégorie, et gardait une frise BLEUE jusqu'au bout. Les deux
   widgets mesuraient deux choses différentes (état du jour / plus haut rang atteint) sans que
   rien ne le dise, et le parent qui balaie les frises ne voyait jamais la baisse — c'est le
   défaut rapporté, reproduit, qui a motivé ce correctif.
   L'état du jour n'est pas une déduction : il est calculé pour cette même ligne, juste à côté,
   et c'est le sens même de la cellule « semaine en cours ». La rangée peut donc DÉCROCHER sur
   sa dernière marche, et ce décrochage EST l'information (le mot de la ligne le dit déjà, la
   frise cesse de le démentir).
   Placé APRÈS `aucuneSemaineConnue`, et c'est essentiel : sans ça, forcer la dernière cellule
   ferait apparaître une frise d'une seule marche sur toutes les lignes dont aucune semaine
   n'est déductible — précisément la population qu'on a choisi de laisser sans frise.
   Partagé par les deux frises d'états (leçon, liste de dictée) : elles ne peuvent pas diverger
   sur ce point. La liste plafonnait déjà ses caps par l'état courant (cf. friseListeOrtho), ce
   qui couvrait presque le même besoin ; ce forçage ferme le cas qui lui échappait — un « acquis »
   courant sans tampon « acquis » au journal, dont la rangée s'arrêtait à « en cours ». */
function finaliserFrise(
	semaines: CelluleFrise[],
	etatDuJour: NiveauNotion,
	enCoursDepuis: number | null,
	acquisDepuis: number | null,
): FriseNotion | null {
	if (aucuneSemaineConnue(semaines)) return null;
	semaines[semaines.length - 1] = etatDuJour;
	return { semaines, enCoursDepuis, acquisDepuis };
}

/* Une frise dont AUCUNE semaine n'est connue n'est PAS dessinée. Douze blocs creux côte à côte
   n'apprennent rien et se lisent comme un défaut d'affichage — le reproche même qui avait fait
   abandonner le pointillé (#540). La ligne retombe alors sur sa puce d'état et son mot, comme
   avant qu'elle ait une frise, et la frise apparaît le jour où une semaine se déduit.
   Le cas est RÉEL, pas théorique : à la mise en service d'un journal, tant qu'aucune session n'a
   posé la borne de suivi, rien n'est déductible d'aucune semaine. C'est l'état de TOUTES les
   listes de dictée d'un profil existant le jour où le journal des listes arrive (#541). */
const aucuneSemaineConnue = (semaines: CelluleFrise[]): boolean =>
	semaines.every((c) => c === 'inconnu');

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
   « à découvrir » — rien n'était commencé. La frise d'une liste ne montre ainsi de creux qu'AVANT
   sa borne de suivi, jamais après ; là où celle d'une leçon doit rester dans le doute, l'état
   d'avant son premier cap pouvant aussi bien avoir été « à renforcer ».

   `niveau` = état courant (`niveauListeOrtho`) : il dit si la liste a été commencée (sinon pas de
   frise) et tient lieu d'état des semaines suivies quand AUCUN cap n'est daté — cas d'un profil
   qui travaillait ses listes avant l'arrivée de ce journal. `debutSuivi` vient de
   `debutSuiviPaliers` appliqué à la borne PROPRE à ce journal (ORTHO_PALIERS_DEBUT_KEY) ; la ligne
   peut ensuite se donner une borne plus ANCIENNE que celle du profil, si une séance datée le
   prouve (cf. amorçage ci-dessous). */
export function friseListeOrtho(
	paliers: PaliersNotion | undefined,
	niveau: NiveauNotion,
	debutSuivi: number,
	now: number,
	premiereSeance: number | null = null,
): FriseNotion | null {
	// Le journal est MONOTONE, l'état d'une liste ne l'est PAS. AUCUN cap n'est donc lu si l'état
	// courant ne le porte plus : sans ce plafonnement, une cellule annoncerait un état que le mot
	// de la même ligne démentirait, juste à côté. Deux redescentes réelles, une par cap :
	// - « acquis » perdu : le parent ajoute un mot à une liste acquise ; ou, sans aucun changement
	//   de donnée, la voix de synthèse (chargée en asynchrone, cf. ui/tts.ts) réapparaît et remet
	//   la dictée au rang des modes requis ;
	// - « en cours » perdu : le parent retire de la liste les mots déjà commencés, ne laissant que
	//   des mots neufs — la liste retombe à « à découvrir ».
	// Les tampons eux-mêmes ne sont pas touchés : si la voix vient de nouveau à manquer, la date
	// d'acquisition d'origine réapparaît telle quelle au lieu d'avoir été réécrite. Ce que la frise
	// perd alors, c'est l'épisode passé du cap démenti — elle sous-dit, et ne prétend jamais au
	// parent un état que la ligne contredirait.
	// Ce plafonnement reste utile APRÈS le correctif « état du jour », qui force la dernière cellule à l'état du jour pour
	// les deux frises (`finaliserFrise`) : il gouverne, lui, les cellules PASSÉES et le plancher
	// des semaines suivies. Les deux se complètent — la dernière cellule dit le présent, celui-ci
	// évite que les précédentes racontent un cap que l'état courant dément.
	const enCoursStocke = horodatage(paliers?.enCours);
	const acquisStocke = horodatage(paliers?.acquis);
	const acquis = niveau === 'acquis' ? acquisStocke : null;
	let enCours = niveau === 'acquis' || niveau === 'en-cours' ? enCoursStocke : null;
	// AMORÇAGE pour les profils d'avant ce journal (#541). Le graphe d'activité garde des séances
	// DATÉES par liste (`{k:'dictee', ref}`, #498) : une séance sur cette liste le T PROUVE qu'à T
	// au moins un de ses mots était commencé, donc qu'elle était « en cours ». C'est une observation
	// déjà stockée, pas une reconstitution — sans quoi un enfant qui fait des dictées depuis des
	// mois n'aurait AUCUNE frise avant sa prochaine séance, alors que la donnée existe.
	// Deux conséquences, dans cet ordre :
	// - la séance sert de cap « en cours » quand le journal n'en a pas de plus ANCIEN. Elle prime
	//   donc sur un tampon posé après coup : sinon la première séance jouée sur la nouvelle version
	//   écraserait l'histoire connue et ferait dire « à découvrir » à des semaines travaillées ;
	// - et elle devient la BORNE DE SUIVI de cette ligne, car avant T elle ne prouve rien, et la
	//   borne du profil (posée plus tard, ou pas encore) ne dit rien de cette liste-là.
	// Ce que l'amorçage NE fait PAS : dater une ACQUISITION. Rien dans le stockage ne le permet, et
	// l'inventer peindrait « acquise » sur une semaine choisie au hasard. D'où la condition
	// ci-dessous : on n'amorce que si le sommet de la rangée atteindra l'état courant (« en cours »,
	// ou « acquis » déjà daté par le journal). Une liste maîtrisée avant ce journal reste donc sans
	// frise jusqu'à sa prochaine séance, qui la datera pour de bon.
	// PORTÉE de l'amorçage, à connaître : le graphe d'activité est borné aux 200 dernières séances
	// et ne porte de `ref` que depuis #498 ; une liste travaillée seulement en révision espacée n'y
	// a pas d'entrée à son nom (un tour de révision couvre plusieurs cibles, il n'en réfère aucune).
	// L'amorce ne sert que si elle est PLUS ANCIENNE que tout cap déjà daté. Sur `enCours`, c'est la
	// non-régression décrite ci-dessus. Sur `acquis`, c'est une cohérence interne : une liste
	// tamponnée « acquis » par un tour de révision espacée (qui journalise, mais dont l'entrée
	// d'activité ne réfère aucune cible) n'a pas de tampon « en cours » ; la première dictée venue
	// serait alors postérieure à l'acquisition, et l'installer comme début rendrait le couple
	// (commencée, acquise) non monotone — la donnée fausse en attente d'un lecteur, exactement ce
	// que le journal lui-même s'interdit de produire (cf. orthographe/paliers.ts).
	let borne = debutSuivi;
	const sommetAtteignable = niveau === 'en-cours' || (niveau === 'acquis' && acquis !== null);
	const plusAncienneQueTout =
		premiereSeance !== null &&
		(enCours === null || premiereSeance < enCours) &&
		(acquis === null || premiereSeance < acquis);
	if (premiereSeance !== null && sommetAtteignable && plusAncienneQueTout) {
		enCours = premiereSeance;
		borne = premiereSeance;
	}
	// « Jamais commencée » se juge sur le journal TEL QU'IL EST STOCKÉ, pas sur la lecture
	// plafonnée : un cap daté prouve que la liste a été travaillée, et doit donner une frise même
	// si l'état courant dit « à découvrir » (liste que le parent a depuis vidée de ses mots). Même
	// robustesse que pour une leçon, où les caps datés passent avant « à découvrir ».
	if (niveau === 'a-decouvrir' && enCoursStocke === null && acquisStocke === null) return null;
	// Plancher établi sur la lecture PLAFONNÉE, elle : quand tous les caps du journal sont démentis
	// par l'état courant, il ne reste rien de daté, et c'est donc cet état qui tient lieu d'état des
	// semaines suivies — sinon la frise afficherait « à découvrir » sous un mot disant « en cours ».
	const aucunCap = enCours === null && acquis === null;
	const plancher: CelluleFrise = aucunCap ? niveau : 'a-decouvrir';
	// Pas de date de « première rencontre » pour une liste (aucun équivalent de firstSeen) : la
	// période « à découvrir » n'est pas bornée par une date mais déduite du plancher ci-dessus.
	const semaines = cellulesFrise(acquis, enCours, -Infinity, plancher, borne, now);
	return finaliserFrise(semaines, niveau, enCours, acquis);
}

/* Première séance de dictée DATÉE de chaque liste, tirée du graphe d'activité (`{k:'dictee', ref}`,
   #498). Alimente l'amorçage de `friseListeOrtho` ci-dessus, où l'on trouve ce que cette date
   prouve et ce qu'elle ne prouve pas. `activityRaw` est le journal BRUT (lu en localStorage) :
   `normalizeActivity` tolère l'ancien format, comme partout ailleurs. Pur. */
export function premieresSeancesDictee(activityRaw: unknown): Map<string, number> {
	const out = new Map<string, number>();
	for (const e of normalizeActivity(activityRaw)) {
		if (e.k !== 'dictee' || !e.ref) continue;
		const connue = out.get(e.ref);
		if (connue === undefined || e.t < connue) out.set(e.ref, e.t);
	}
	return out;
}

/* Frise de COMPOSITION d'une liste de dictée (#545) : combien de ses mots étaient à chaque étape
   du parcours, semaine par semaine, sur la même fenêtre de SEMAINES_FRISE que les frises d'états.

   Elle ne mesure PAS la même chose que `friseListeOrtho`, et c'est tout son objet. L'état d'une
   liste ne connaît que trois valeurs et ne bouge qu'à deux moments (premier mot commencé, dernier
   mot maîtrisé) : entre les deux, des semaines de travail réel ne changent rien à l'écran. La
   composition, elle, bouge dès qu'UN mot monte d'une marche, ce qui est le fait que l'adulte
   cherche quand il se demande si l'apprentissage avance.

   CONVENTION D'APPARTENANCE, à connaître avant de lire une colonne ancienne : rien ne date la
   composition d'une LISTE (`ListeOrtho` n'a qu'un `updatedAt`, qui ne dit pas quels mots elle
   contenait). La frise montre donc où en étaient, chaque semaine, les mots qu'elle contient
   AUJOURD'HUI. Un mot ajouté hier apparaît au bas de l'escalier sur toutes les colonnes
   antérieures — ce qui est vrai de lui, mais fait « grandir » une liste rétrospectivement. On ne
   corrige pas : masquer ce mot demanderait un historique d'appartenance qui n'existe pas, et
   l'inventer serait la seule des deux options à produire un chiffre faux.

   Les semaines antérieures à `debutSuivi` valent `null` (inconnues) et non « rien n'était
   commencé », même langage que les cellules creuses des frises d'états. La DERNIÈRE colonne, elle,
   est TOUJOURS connue : la répartition du jour se lit sur les booléens du mot, qui n'ont jamais eu
   besoin de dates. C'est ce qui rend cette frise utile dès le premier jour, là où les frises
   d'états doivent attendre leur borne — et ce qui la fait échapper à la règle « aucune semaine
   connue → pas de frise du tout ».

   `null` pour une liste SANS mot attendu : il n'y a alors rien à répartir. `now` injecté (pur). */
export interface FriseComposition {
	/** Rangs de l'escalier, du bas vers le haut (dépend de `dicteeDispo`, cf. `paliersComposition`). */
	paliers: RangMot[];
	/** SEMAINES_FRISE colonnes, de la plus ANCIENNE à la plus récente (la dernière = semaine en
	    cours). Chacune : le nombre de mots à chaque rang, indexé comme `paliers` — ou `null` quand
	    la semaine précède la mise en service du datage. */
	semaines: (number[] | null)[];
	total: number; // mots attendus de la liste (constant d'une colonne à l'autre, cf. convention)
}
export function friseComposition(
	mots: readonly (MotOrtho | undefined)[],
	dicteeDispo: boolean,
	debutSuivi: number,
	now: number,
): FriseComposition | null {
	const jour = composition(mots, dicteeDispo);
	if (jour.total === 0) return null;
	// Rien de commencé AUJOURD'HUI vaut rien de commencé jamais : un mot ne redescend pas de
	// l'escalier, donc toutes les colonnes vaudraient la même, et on afficherait douze fois
	// « aucun mot commencé » sous une ligne qui le dit déjà en toutes lettres. Même refus que
	// `aucuneSemaineConnue` pour les frises d'états, et même effet de bord voulu : la frise
	// APPARAÎT le jour où le premier mot bouge. Le cas est réel des deux côtés — dictée
	// prédéfinie épinglée à l'avance, ou liste dont le parent vient de retirer les mots
	// travaillés.
	if (jour.compte[0] === jour.total) return null;
	const semaines: (number[] | null)[] = [];
	for (let i = 0; i < SEMAINES_FRISE; i++) {
		// Dernière colonne = la semaine EN COURS, lue sans date : les booléens du mot suffisent
		// à dire où il en est aujourd'hui. Elle échappe donc à la borne, et c'est ce qui rend
		// cette frise utile dès le premier jour (critère 11 de #545) — là où une frise d'états
		// sans borne n'a que des cellules creuses et n'est pas dessinée du tout.
		if (i === SEMAINES_FRISE - 1) {
			semaines.push(jour.compte);
			continue;
		}
		// Même découpage que `cellulesFrise` : l'état d'une colonne est celui atteint à la FIN
		// de sa semaine, soit le lundi suivant, exclu. Les deux frises doivent tomber sur les
		// mêmes frontières, sinon un même franchissement change de colonne d'une frise à l'autre.
		const finSemaine = lundiDecale(now, SEMAINES_FRISE - 2 - i);
		if (finSemaine <= debutSuivi) semaines.push(null);
		else semaines.push(composition(mots, dicteeDispo, finSemaine).compte);
	}
	return { paliers: jour.paliers, semaines, total: jour.total };
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
	// Depuis le correctif « état du jour », ce « changement » couvre aussi les BAISSES : la dernière cellule porte l'état
	// du jour, qui peut décrocher du rang atteint. C'est voulu — une notion qui retombe sous les
	// 40 % est exactement ce qu'un adulte doit pouvoir repérer sans déplier chaque catégorie, et
	// le compteur ne promet rien de plus qu'un mouvement, dans un sens ou dans l'autre.
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

	// Détail d'une leçon à UN niveau de stockage (état + épinglage + vues/dernière fois/
	// tendance/frise). Partagé par le récap par catégorie (classe suivie) et par la classe
	// précédente (#723) : une même leçon se lit ainsi pareil des deux côtés. L'épinglage aussi
	// se lit à ce niveau (#573) : épingler la version CE2 n'épingle pas la ligne CM1.
	const notionDe = (l: LessonDef, niveau: SchoolLevel): RecapNotion => {
		const k = l.id + '@' + niveau;
		const stat = statsRaw[k];
		const etat = niveauNotion(stat, (starsRaw[k] || 0) > 0);
		const pin = epingleLecon(file, l, niveau, niveauProfilMatiere(profile, l.subject));
		return {
			lessonId: l.id,
			label: labelLecon(l, niveau),
			niveau: etat,
			pctRecent: perfRecente(stat)?.pct ?? null,
			epingle: pin.epingle,
			entryId: pin.entryId,
			vues: stat?.attempts ?? 0,
			derniereFois: stat?.lastAt ?? null,
			tendance: tendanceNotion(stat),
			blocages: reportsRaw[k]?.jours ?? 0,
			frise: friseNotion(paliersRaw[k], firstSeenRaw[k], etat, debutSuivi, now),
		};
	};

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
			// Le MÊME objet alimente le dépliage de la catégorie ET, s'il est faible, la file
			// « à revoir ».
			const notion = notionDe(l, niveau);
			const etat = notion.niveau;
			if (etat === 'acquis') rc.acquis++;
			else if (etat === 'en-cours') rc.enCours++;
			else if (etat === 'non-acquis') rc.nonAcquis++;
			else rc.aDecouvrir++;
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

	// Classe précédente (#723), lue sur les cartes BRUTES : la vue de la classe suivie ne
	// contient pas, par construction, ce qu'on cherche ici.
	const classePrecedente: RecapClassePrecedente[] = [];
	for (const sub of SUBJECTS) {
		const c = consolidationBasNiveau(sub.id, niveauProfilMatiere(profile, sub.id), {
			stars: starsRaw,
			stats: statsRaw,
			reports: reportsRaw,
		});
		if (!c || c.nbTravaillees === 0) continue;
		classePrecedente.push({
			subject: sub.id,
			label: sub.label,
			niveau: c.niveau,
			nbTravaillees: c.nbTravaillees,
			fragiles: c.fragiles.map((f) => notionDe(f.lesson, f.niveau)),
		});
	}

	return {
		uuid,
		parMatiere,
		parCategorie,
		totalMaitrisees,
		totalLecons,
		nouvellesRecentes,
		aRevoir,
		activite7j: activiteParJourParType(activity, now),
		// Aucune lecture de plus : la carte d'étoiles brute est déjà en main, et c'est le seul
		// endroit qui la voit TOUS niveaux confondus (le reste du récap est scopé à la classe).
		etoilesParNiveau: etoilesParNiveau(starsRaw),
		classePrecedente,
	};
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
	/** Répartition des mots entre les étapes du parcours, semaine par semaine (#545, cf.
	    `friseComposition`) ; `null` quand la liste n'attend aucun mot. La DERNIÈRE colonne est la
	    répartition du JOUR, celle que la ligne affiche ; les précédentes ne servent qu'au
	    dépliable. */
	composition: FriseComposition | null;
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
	// Séances de dictée datées : elles amorcent la frise des listes travaillées AVANT ce journal
	// (cf. friseListeOrtho). Sans elles, un enfant qui fait des dictées depuis des mois n'aurait
	// aucune trajectoire à montrer tant qu'il n'en a pas rejoué une.
	const premieres = premieresSeancesDictee(lsGetRaw(profile.uuid + '/' + ACTIVITY_KEY, []));
	// Borne du DATAGE par mot (#545), distincte de celle des paliers ci-dessus et calculée une
	// seule fois : elle balaye toute la banque, et la refaire par liste serait quadratique.
	const debutEtapes = debutSuiviEtapes(
		lsGetRaw(profile.uuid + '/' + ORTHO_ETAPES_DEBUT_KEY, null),
		state.banque,
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
			frise: friseListeOrtho(
				paliersRaw[ref.id],
				av.niveau,
				debutSuivi,
				now,
				premieres.get(ref.id) ?? null,
			),
			composition: friseComposition(
				motsAttendusLecon(state, ref.id),
				dicteeDispo,
				debutEtapes,
				now,
			),
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
	/* Niveau d'ORIGINE, renseigné seulement pour une notion entretenue depuis le niveau
	   inférieur (#232). Deux raisons de l'exposer, toutes deux côté ADULTE uniquement :
	   rendre visible ce que la séance entretient (« il reste X notions CE2 en
	   consolidation », info que l'architecture rendait invisible), et LEVER une ambiguïté
	   — une leçon multi-niveaux a une entrée par niveau, donc son libellé peut apparaître
	   deux fois dans la même catégorie. Rien de tel n'est montré à l'ENFANT : lui coller
	   une étiquette de niveau en pleine séance ajoute une charge métacognitive (« est-ce
	   que je régresse ? ») sans bénéfice d'apprentissage. */
	niveauOrigine?: SchoolLevel;
	/* En ATTENTE d'entrée en rotation (#690, #641) : l'élément existe, son compteur
	   d'espacement n'a pas démarré. Une leçon déclarée « vue en classe » pas encore
	   rencontrée, un mot dont l'atelier n'est pas fait. Ni dû, ni acquis, ni « en retard » :
	   sans cette distinction, le récap le rangeait avec les vraies entrées de palier 0, et
	   l'adulte lisait « en rotation » ce qui n'a jamais commencé. */
	enAttente: boolean;
	/* Acquis dont le CONTRÔLE annuel est échu (#689). Volontairement distinct de `du`, qui
	   reste réservé aux éléments non acquis : sans cette séparation, un parent lisant
	   « 3 dus » ne saurait pas s'il a devant lui trois notions fragiles ou trois vieux
	   contrôles de routine — deux situations qui n'appellent pas la même réaction. */
	enControle: boolean;
}

export interface GroupeRevision {
	categoryId: string;
	label: string;
	subject: SubjectId;
	entrees: EntreeRevision[]; // triées par urgence (dues d'abord, acquises en fin)
	enRotation: number; // entrées non acquises ET démarrées
	enAttente: number; // entrées dont le compteur d'espacement n'a pas démarré (#690)
	acquises: number;
	dues: number; // non acquises et échues (aujourd'hui ou en retard)
}

/* Un étage de l'escalier de répétition espacée (#555), pour la vue « Par palier ».
   Répond à « qu'est-ce qui stagne en bas / qu'est-ce qui est presque ancré ? », lecture
   qu'aucune des deux autres vues ne donne : la catégorie mélange les paliers, et
   l'urgence trie sur l'échéance, qui DÉCOULE du palier sans le dire (deux notions dues
   aujourd'hui peuvent être l'une au 1er étage, l'autre au 5e). */
export interface PalierRevision {
	palier: number; // 0..PALIER_ACQUIS (index d'étage)
	label: string; // intervalle courant (« 1 semaine ») ; « acquis » au sommet
	acquis: boolean; // étage sommital (sorti de la rotation)
	entrees: EntreeRevision[]; // triées par urgence
	dues: number; // non acquises et échues
	enAttente: number; // entrées dont le compteur d'espacement n'a pas démarré (#690)
}

export interface RecapRevision {
	total: number;
	enRotation: number;
	/* Éléments EN ATTENTE d'entrée en rotation (#690) : le compte que l'adulte doit pouvoir
	   lire pour savoir que son stock déclaré n'est pas perdu, seulement différé.
	   `total === enAttente + enRotation + acquises` : ces trois-là ne se recouvrent pas,
	   et `enRotation` ne compte donc plus ce qui n'a pas démarré. */
	enAttente: number;
	acquises: number;
	dues: number;
	/* Acquis dont le contrôle annuel est échu (#689). SOUS-ENSEMBLE d'`acquises`, et non un
	   quatrième terme de la somme ci-dessus : un élément en contrôle est toujours acquis,
	   il n'a pas quitté le sommet. Le compte existe pour que le parent distingue une file
	   fragile d'un fond d'entretien de routine (critère 6). */
	enControle: number;
	groupes: GroupeRevision[]; // vue « par catégorie » (ordre du catalogue)
	parUrgence: EntreeRevision[]; // vue « par urgence » (plus en retard d'abord, acquises en fin)
	parPalier: PalierRevision[]; // vue « par palier » (bas de l'escalier d'abord, acquis en fin)
}

/* Libellé d'un palier = intervalle de re-test correspondant, en langage courant, DÉRIVÉ
   de REVISION_INTERVALLES (source unique — pas de valeurs recopiées). '' pour l'acquis
   (rendu par un badge dédié côté UI). Pur.
   L'index est BORNÉ à l'escalier, et entier : un palier corrompu dans le stockage (négatif,
   fractionnaire) sortait sinon du tableau et affichait « Palier : NaN mois » à l'adulte.
   Même bornage que `etagePalier`, pour qu'une ligne ne puisse pas contredire l'en-tête de
   l'étage sous lequel elle est rangée. */
export function libellePalier(palier: number): string {
	if (palier >= PALIER_ACQUIS) return '';
	const i = Math.min(Math.max(Math.floor(palier), 0), REVISION_INTERVALLES.length - 1);
	const jours = REVISION_INTERVALLES[i] / JOUR;
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
	niveauOrigine?: SchoolLevel,
): EntreeRevision {
	const acquis = estAcquis(etat);
	const enAttente = !acquis && estHorsRotation(etat);
	const joursRestants =
		acquis || etat.prochaineRevision == null
			? null
			: Math.round((startOfDay(etat.prochaineRevision) - startOfDay(now)) / JOUR);
	return {
		enAttente,
		/* L'ÉCHÉANCE d'un acquis reste masquée (`prochaineRevision: null` plus bas) : le
		   contrôle est un entretien de routine à un an, pas un rendez-vous que l'adulte doit
		   surveiller, et l'afficher rangerait l'acquis parmi les entrées « en retard ». Seul
		   son COMPTE remonte, par ce drapeau. */
		enControle: acquis && estDuControle(etat, now),
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
		niveauOrigine,
	};
}

/* Étage d'escalier d'une entrée, BORNÉ à [0, PALIER_ACQUIS] et entier. Les trois vues
   doivent contenir exactement les mêmes entrées : un palier corrompu (négatif, au-dessus
   du sommet, non entier) doit atterrir sur un étage existant plutôt qu'en ouvrir un à lui
   ou disparaître de la vue.
   `floor` et NON `round` : c'est ce qui rend l'étage sommital équivalent à `estAcquis`
   (`palier >= PALIER_ACQUIS`) sur toute la plage. Avec un arrondi, un palier de 5,5 serait
   rangé sous « Acquis » tout en restant en rotation — l'en-tête annoncerait « 1 entrée,
   dont 1 à réviser » sous le mot « acquis », et la même entrée s'afficherait « Palier :
   3 mois » en vue Urgence. */
function etagePalier(e: EntreeRevision): number {
	return Math.min(Math.max(Math.floor(e.palier), 0), PALIER_ACQUIS);
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
		// Afficher ce que le moteur RÉVISE VRAIMENT : le niveau actif de la matière, plus le
		// niveau immédiatement inférieur depuis que la séance l'entretient (#232). Ces clés-là
		// ne sont plus dormantes — les masquer rendrait le suivi faux, le parent ne verrait pas
		// ce qui est reproposé. Tout le reste (au-dessus du niveau actif, ou à plus d'un niveau
		// en dessous) est bien DORMANT et reste masqué : l'afficher créerait un doublon fantôme
		// « en retard » que le parent ne pourrait jamais résorber. C'est le seul endroit qui
		// filtre les clés APRÈS coup : ailleurs, le récap parcourt les leçons du niveau suivi et
		// construit la clé avec ce niveau, donc n'atteint jamais les autres.
		// (Sans objet pour les mots d'ortho, non namespacés.)
		const actif = niveauProfilMatiere(profile, lesson.subject);
		const niveau = niveauOfKey(k) as SchoolLevel;
		const entretien = niveau !== actif;
		if (entretien && niveau !== niveauInferieurImmediat(actif)) continue;
		entrees.push(
			entreeRevision(
				k,
				labelLecon(lesson, niveau), // libellé du niveau de l'ENTRÉE, pas du niveau suivi (#436)
				'lecon',
				lesson.category,
				etat,
				now,
				entretien ? niveau : undefined,
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
			enRotation: es.filter((e) => !e.acquis && !e.enAttente).length,
			enAttente: es.filter((e) => e.enAttente).length,
			acquises: es.filter((e) => e.acquis).length,
			dues: es.filter((e) => e.du).length,
		});
	}

	// Regroupement par PALIER (#555), du bas de l'escalier vers le sommet : ce qui stagne
	// au pied d'abord, l'acquis en fin (comme les deux autres vues). Les étages VIDES sont
	// omis, exactement comme une catégorie sans entrée : sept en-têtes dont cinq à zéro se
	// lisent moins bien que trois pleins.
	const parPalier: PalierRevision[] = [];
	for (let p = 0; p <= PALIER_ACQUIS; p++) {
		const es = entrees.filter((e) => etagePalier(e) === p).sort(compareUrgence);
		if (es.length === 0) continue;
		const acquis = p >= PALIER_ACQUIS;
		parPalier.push({
			palier: p,
			// Le sommet n'a pas d'intervalle (libellePalier rend '') : on le NOMME, sinon
			// l'en-tête de son étage serait vide. Même mot que la légende de l'escalier.
			label: acquis ? 'acquis' : libellePalier(p),
			acquis,
			entrees: es,
			dues: es.filter((e) => e.du).length,
			enAttente: es.filter((e) => e.enAttente).length,
		});
	}

	return {
		total: entrees.length,
		enRotation: entrees.filter((e) => !e.acquis && !e.enAttente).length,
		enAttente: entrees.filter((e) => e.enAttente).length,
		acquises: entrees.filter((e) => e.acquis).length,
		dues: entrees.filter((e) => e.du).length,
		enControle: entrees.filter((e) => e.enControle).length,
		groupes,
		parUrgence: [...entrees].sort(compareUrgence),
		parPalier,
	};
}

/* ---------- Le retard fait-il échouer ? (#691) ----------
   Tout le lot « révision espacée soutenable » repose sur l'hypothèse qu'un rendez-vous
   servi très en retard fait rater l'enfant, et que cet échec est imputable à la file
   plutôt qu'à lui. Ce récap la rend LISIBLE : trois taux de réussite, un par tranche de
   retard, sur le journal du profil consulté. Si les trois se ressemblent, l'hypothèse ne
   tient pas et le calibrage des autres issues est à revoir ; si le dernier s'effondre,
   elle tient.

   Lu sur le profil AFFICHÉ (par UUID), jamais sur le profil actif : l'adulte consulte
   souvent un enfant qui n'est pas celui qui joue. */
export function tauxRetardProfil(profile: Profile): TauxTranche[] {
	return tauxParTranche(chargerRetardsFor(profile.uuid));
}
