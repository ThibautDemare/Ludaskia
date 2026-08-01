/* ============================================================
   Séance du jour (#440) — logique pure + stockage.
   ------------------------------------------------------------
   Une SÉANCE (voix encadrant) est un « programme du jour » (voix enfant) :
   une liste d'ÉTAPES (modes d'entraînement existants) que l'adulte compose à
   l'avance pour un profil. L'enfant les réalise dans l'ORDRE QU'IL VEUT ; une
   étape peut être demandée plusieurs fois (`count`) ; une étape épuisée sort des
   propositions ; « compléter » la séance = tout faire. Aucune obligation, aucun
   affichage punitif : une séance non finie à minuit est simplement remise à zéro.

   Ce module ne touche PAS au DOM (testable). Il expose :
   - le modèle (définitions par profil + état du jour + journal de réalisations) ;
   - la résolution de la définition APPLICABLE aujourd'hui (récurrence) et le
     RESET PARESSEUX à minuit (calculé à la lecture, comme le défi du jour / la
     série de jours — aucun timer) ;
   - l'ATTRIBUTION d'une complétion à une étape, faite sur ce que l'enfant A FAIT et
     non sur le bouton qu'il a pris (#498) : `resoudreProgramme` lit le JOURNAL
     D'ACTIVITÉ (`loadActivity`, #319) et apparie chaque session nouvelle à une étape
     restante, grâce à la RÉFÉRENCE que le journal porte désormais (id de leçon / de
     liste). Un marqueur « étape en cours » (`marquerEtapeLancee`) reste posé quand le
     lancement vient du programme, mais il ne sert plus qu'à DATER l'étape (métrique de
     durée) et à lever une ambiguïté d'appariement : son absence ne prive plus l'enfant
     de son crédit. Aucun runner de mode n'a besoin d'être modifié ;
   - les étapes CONDITIONNELLES (#464) : une étape « à revoir » ne s'applique que
     s'il y a quelque chose d'épinglé ; ce que le cœur ne sait pas lire seul lui est
     passé dans un `ContexteSeance` (cf. plus bas) ;
   - la PERSISTANCE du travail fait (#498) : une étape déjà travaillée aujourd'hui reste
     comptée et affichée même si elle cesse de s'appliquer en cours de journée (une
     épinglée réussie quitte aussitôt la file) ; elle n'est simplement plus proposée ;
   - les MÉTRIQUES de temps (#440) : chaque étape réalisée est horodatée avec sa
     durée, archivée dans un journal de séances au passage de minuit (base d'un
     futur récap encadrant « durée des séances », visuel différé).
   ============================================================ */
import { lsGet, lsSet, lsGetRaw, lsSetRaw, lsRemoveQuiet } from './storage';
import { loadActivity, type ActivityEntry } from './progress';
import { touchProfile } from './profiles';

/* ---------- Modèle ---------- */

/** Modes qu'une étape de programme peut viser. */
export type SeanceModeKind = 'sprint' | 'revision' | 'aRevoir' | 'leconDuJour' | 'lecon' | 'dictee';

/** Métadonnées par mode : libellé (voix encadrant), durée estimée (min, pour le repère
    encadrant) et nature de la référence à préciser (`lecon` = id de leçon,
    `dictee` = id de liste).

    Ce que vaut une session pour chaque mode ne vit PAS ici mais dans `etapeSatisfaite`
    (#498) : un mode « à revoir » accepte une leçon OU une dictée selon la cible épinglée,
    ce qu'un simple `ActivityKind` par mode ne pouvait pas dire. Une seule source de
    vérité pour l'appariement, donc aucun risque de désaccord entre les deux. */
export const SEANCE_MODE_INFOS: Record<
	SeanceModeKind,
	{ label: string; dureeMin: number; ref: 'lecon' | 'dictee' | null }
> = {
	sprint: { label: 'Sprint 5 min', dureeMin: 5, ref: null },
	revision: { label: 'Révision', dureeMin: 8, ref: null },
	// Même mot que la carte d'accueil et la tuile enfant : un seul vocabulaire, sur tous
	// les écrans, pour la file épinglée.
	aRevoir: { label: 'À revoir', dureeMin: 7, ref: null },
	leconDuJour: { label: 'Leçon du jour', dureeMin: 7, ref: null },
	lecon: { label: 'Une leçon précise', dureeMin: 7, ref: 'lecon' },
	dictee: { label: 'Une dictée', dureeMin: 10, ref: 'dictee' },
};

/** Une étape du programme : un mode, un nombre de fois requis, et une éventuelle
    référence (id de leçon pour `lecon`, id de liste d'orthographe pour `dictee`). */
export interface SeanceEtape {
	id: string; // id STABLE de l'étape (sert à l'attribution), unique dans la définition
	kind: SeanceModeKind;
	count: number; // nombre de fois requis (>= 1, défaut 1)
	ref?: string; // id de leçon (kind='lecon') ou d'UNE dictée figée (kind='dictee', legacy)
	refs?: string[]; // pool de dictées (kind='dictee', #463) : tirage au lancement, prime sur `ref`
}

/** Cibles (dictées) autorisées d'une étape, normalisées (#463). Le pool `refs`
    prime ; sinon on retombe sur l'ancien `ref` unique (rétrocompat des programmes
    déjà configurés). 1 cible ⇒ dictée figée ; 2+ ⇒ tirage aléatoire au lancement. */
export function ciblesEtape(etape: SeanceEtape): string[] {
	if (etape.refs && etape.refs.length) return etape.refs.slice(); // copie : jamais d'aliasing du pool
	return etape.ref ? [etape.ref] : [];
}

/** Cibles d'une étape encore présentes parmi les dictées `disponibles` (ids déjà
    résolus par l'appelant, côté UI). Une cible obsolète (liste supprimée, hors niveau)
    est écartée : le tirage ne pioche jamais une dictée introuvable. Pur → testable. */
export function ciblesValides(etape: SeanceEtape, disponibles: readonly string[]): string[] {
	const set = new Set(disponibles);
	return ciblesEtape(etape).filter((id) => set.has(id));
}

/** Tire un élément au hasard dans un pool DÉJÀ filtré, ou `undefined` s'il est vide.
    `rand` ∈ [0,1[ est injectable (défaut `Math.random`) pour un tirage déterministe en
    test. Sert aux deux pools d'étape : les dictées configurées (#463) et la file
    épinglée du jour (#464). Pur (hors `rand` par défaut). */
export function tirerParmi(
	pool: readonly string[],
	rand: () => number = Math.random,
): string | undefined {
	return pool.length ? pool[Math.floor(rand() * pool.length)] : undefined;
}

/** Tire une cible valide au hasard dans le pool d'une étape « dictée » (#463), ou
    `undefined` si aucune n'est disponible. 1 cible ⇒ toujours la même (dictée figée) ;
    2+ ⇒ une au hasard. Pur (hors `rand` par défaut). */
export function tirerCible(
	etape: SeanceEtape,
	disponibles: readonly string[],
	rand: () => number = Math.random,
): string | undefined {
	return tirerParmi(ciblesValides(etape, disponibles), rand);
}

/* ---------- Étapes CONDITIONNELLES (#464) ---------- */
/** Contexte du jour : ce qui, HORS de la définition, conditionne la présence d'une étape
    ET permet de reconnaître l'activité qui la satisfait. Une seule notion aujourd'hui, la
    file « à revoir », donnée en deux listes d'ids ENCORE à travailler. Le cœur ne peut pas
    la calculer seul (l'« acquis » d'une dictée dépend de la disponibilité du TTS, connue de
    l'UI seule) : c'est l'UI qui la fournit (`ui/seance.ts`), ce qui garde ce module pur et
    testable.

    Deux listes plutôt qu'une file préfixée (#498) : l'appariement doit distinguer « la
    leçon X a été travaillée » de « la liste X a été dictée », et le cœur n'a pas à
    connaître la convention de préfixe des ids de file (`ortho:`), qui appartient à
    l'espace encadrant. Ids BRUTS de part et d'autre. */
export interface ContexteSeance {
	aRevoirLecons: string[]; // ids de LEÇONS du catalogue épinglées
	aRevoirDictees: string[]; // ids de LISTES d'orthographe épinglées
}
/** Contexte NEUTRE (rien d'épinglé) : défaut PRUDENT des lectures de séance — un appelant
    qui l'omet escamote une étape « à revoir » plutôt que de l'afficher à vide. */
export const CONTEXTE_VIDE: ContexteSeance = { aRevoirLecons: [], aRevoirDictees: [] };

/** Nombre d'entrées épinglées « à revoir » du contexte (les deux natures confondues). Pur. */
export function nbARevoir(ctx: ContexteSeance): number {
	return ctx.aRevoirLecons.length + ctx.aRevoirDictees.length;
}

/** Une étape s'applique-t-elle aujourd'hui ? Seules les étapes CONDITIONNELLES peuvent
    ne pas s'appliquer : « à revoir » disparaît du programme quand rien n'est épinglé —
    sinon le programme porterait une étape VIDE, impossible à réaliser, qui bloquerait sa
    complétion (#464). Pur. */
export function etapeApplicable(etape: SeanceEtape, ctx: ContexteSeance): boolean {
	return etape.kind === 'aRevoir' ? nbARevoir(ctx) > 0 : true;
}

/** Nombre de fois requis d'une étape, ASSAINI (entier ≥ 1) — source unique de ce « combien ».
    Un `count` absent, ≤ 0 ou fractionnaire (stockage importé ou édité à la main) se lirait
    sinon comme « déjà fait », ou demanderait un nombre de passages impossible à atteindre
    pile : le programme se dirait terminé sans rien faire, ou jamais. Le compositeur, lui,
    borne déjà la saisie à 1..5 — d'où l'absence de borne HAUTE ici. Pur. */
export function countRequis(etape: SeanceEtape): number {
	return Math.max(1, Math.round(etape.count || 0));
}

/** Récurrence d'une séance : soit une DATE unique (ponctuelle), soit des JOURS de
    la semaine (1 = lundi … 7 = dimanche) où elle se répète. */
export type SeanceRecurrence =
	| { type: 'date'; date: string } // 'YYYY-MM-DD'
	| { type: 'hebdo'; jours: number[] }; // 1..7 (ISO : 1 = lundi, 7 = dimanche)

/** Une définition de séance, rattachée à un profil (plusieurs par profil possibles,
    tant qu'au plus une s'applique un jour donné — « une seule par jour »). */
export interface SeanceDef {
	id: string; // id stable de la définition
	nom?: string; // libellé libre (voix encadrant), facultatif
	etapes: SeanceEtape[];
	recurrence: SeanceRecurrence;
}

/** Une étape réalisée aujourd'hui : horodatage de complétion + durée (métriques #440). */
export interface SeanceCompletion {
	etapeId: string;
	kind: SeanceModeKind;
	ref?: string;
	ts: number; // horodatage de la complétion (ms) — celui du journal d'activité
	dureeMs: number; // durée entre le lancement de l'étape et sa complétion
}

/** Marqueur « étape en cours » : posé au lancement d'un mode depuis le programme, consommé
    au retour par `resoudreProgramme`. Persisté pour survivre à un rechargement.

    Depuis #498 ce marqueur est un CONFORT, plus une condition : il DATE l'étape (durée
    réelle, métrique) et désigne l'étape visée quand plusieurs pourraient accueillir la même
    session. Sans lui, l'appariement se fait sur la seule référence du journal d'activité. */
export interface SeancePending {
	etapeId: string;
	kind: SeanceModeKind;
	launchTs: number;
	ref?: string; // cible RÉELLEMENT lancée (tirée d'un pool, #463/#464) — pour la métrique
}

/** État du jour d'un profil : quelle définition s'applique, ce qui a été fait,
    complétion, marqueur en cours, et métriques de temps de la journée. */
export interface SeanceJour {
	date: string; // 'YYYY-MM-DD'
	defId: string;
	faits: Record<string, number>; // etapeId -> nombre de fois réalisé aujourd'hui
	completions: SeanceCompletion[]; // horodatées (métriques)
	complete: boolean; // RÉCOMPENSE attribuée (monotone : cf. acterCompletion). Depuis #464,
	// ce n'est plus strictement « toutes les étapes du jour faites » — une étape conditionnelle
	// peut avoir réapparu après coup ; « ce qu'il reste à faire » se lit dans la vue du jour.
	debutTs?: number; // horodatage du 1er lancement d'étape (span de la séance)
	pending?: SeancePending | null;
	/** Curseur d'attribution (#498) : horodatage jusqu'auquel le journal d'activité a déjà
	    été examiné. Posé à la naissance de l'état du jour (une session d'AVANT le programme
	    du jour ne le crédite pas), avancé à chaque passe. Sans lui, une même session
	    créditerait une étape à chaque rendu, et une session ancienne pourrait créditer une
	    étape conditionnelle apparue bien plus tard. */
	vuTs?: number;
	/** Épinglées « à revoir » VUES aujourd'hui (#498). Une notion réussie quitte AUSSITÔT la
	    file : au moment d'attribuer, le contexte ne la contient plus, alors que c'est
	    précisément la session qui l'a fait sortir qu'il faut reconnaître. On mémorise donc
	    l'union des contextes observés dans la journée. Ids bruts, comme `ContexteSeance`. */
	aRevoirVus?: { lecons: string[]; dictees: string[] };
}

/** Une séance archivée (journal, base d'un futur récap encadrant #440). */
export interface SeanceRealisation {
	date: string;
	defId: string;
	etapes: SeanceCompletion[];
	complete: boolean;
	debutTs: number;
	finTs: number;
	dureeActiveMs: number; // somme des durées d'étapes (« temps dans les modes »)
	dureeTotaleMs: number; // finTs - debutTs (temps écoulé, pauses comprises)
}

/* ---------- Clés de stockage (préfixées par profil) ---------- */
export const SEANCE_KEY = 'ludaskia_seance'; // SeanceDef[]
export const SEANCE_JOUR_KEY = 'ludaskia_seanceJour'; // SeanceJour | null
export const SEANCE_JOURNAL_KEY = 'ludaskia_seanceJournal'; // SeanceRealisation[]
export const SEANCES_DONE_KEY = 'ludaskia_seancesDone'; // number (cumul, pour le trophée)
const JOURNAL_MAX = 120; // borne du journal (≈ 4 mois de séances quotidiennes)

/* ---------- Dates / jours ---------- */
function pad2(n: number): string {
	return String(n).padStart(2, '0');
}
/** 'YYYY-MM-DD' d'un instant donné (heure locale, comme `todayStr`). */
export function dateStrDe(now: number): string {
	const d = new Date(now);
	return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
/** Jour de la semaine ISO d'un instant (1 = lundi … 7 = dimanche). */
export function isoJourSemaine(now: number): number {
	const j = new Date(now).getDay(); // 0 = dimanche … 6 = samedi
	return j === 0 ? 7 : j;
}

/* ---------- Définitions (par profil) ---------- */
function asDefs(v: unknown): SeanceDef[] {
	return Array.isArray(v) ? (v as SeanceDef[]) : [];
}
/** Séances du profil ACTIF (côté enfant). */
export function chargerSeances(): SeanceDef[] {
	return asDefs(lsGet(SEANCE_KEY, []));
}
/** Séances d'un profil DONNÉ par UUID (espace encadrant, sans bascule). */
export function chargerSeancesFor(uuid: string): SeanceDef[] {
	return asDefs(lsGetRaw(uuid + '/' + SEANCE_KEY, []));
}
/** Écrit les séances d'un profil par UUID + marque le profil comme modifié
    (fusion par récence de l'export/import). */
export function enregistrerSeancesFor(uuid: string, defs: SeanceDef[]): void {
	lsSetRaw(uuid + '/' + SEANCE_KEY, JSON.stringify(defs));
	touchProfile(uuid);
}
/** Copie les séances d'un profil source vers un profil cible (écrase la cible). */
export function copierSeances(sourceUuid: string, cibleUuid: string): void {
	if (!sourceUuid || !cibleUuid || sourceUuid === cibleUuid) return;
	enregistrerSeancesFor(cibleUuid, chargerSeancesFor(sourceUuid));
}

/** Id d'étape neuf, unique dans la définition (`e1`, `e2`, …). */
export function genEtapeId(def: SeanceDef): string {
	let max = 0;
	for (const e of def.etapes) {
		const m = /^e(\d+)$/.exec(e.id);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return 'e' + (max + 1);
}
/** Id de définition neuf, unique dans la liste (`d1`, `d2`, …). */
export function genDefId(defs: SeanceDef[]): string {
	let max = 0;
	for (const d of defs) {
		const m = /^d(\d+)$/.exec(d.id);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return 'd' + (max + 1);
}

/** Durée estimée d'une séance en minutes (repère non contraignant côté encadrant). */
export function estimationDureeMin(def: SeanceDef): number {
	return def.etapes.reduce((s, e) => s + countRequis(e) * SEANCE_MODE_INFOS[e.kind].dureeMin, 0);
}

/** Deux récurrences se disputent-elles un même jour ? (garde-fou « une par jour ».)
    Une DATE précise a priorité sur l'hebdo (cf. `defApplicable`) : on ne considère
    en conflit que date/date identiques et hebdo/hebdo à jours qui se chevauchent. */
export function recurrencesEnConflit(a: SeanceRecurrence, b: SeanceRecurrence): boolean {
	if (a.type === 'date' && b.type === 'date') return a.date === b.date;
	if (a.type === 'hebdo' && b.type === 'hebdo') return a.jours.some((j) => b.jours.includes(j));
	return false; // date vs hebdo : la date l'emporte, pas de conflit dur
}

/** Définition applicable aujourd'hui (une date précise l'emporte sur l'hebdo). */
export function defApplicable(defs: SeanceDef[], now: number): SeanceDef | null {
	const today = dateStrDe(now);
	const iso = isoJourSemaine(now);
	const parDate = defs.find((d) => d.recurrence.type === 'date' && d.recurrence.date === today);
	if (parDate) return parDate;
	return (
		defs.find((d) => d.recurrence.type === 'hebdo' && d.recurrence.jours.includes(iso)) ?? null
	);
}

/* ---------- Journal de réalisations (métriques) ---------- */
export function chargerJournalSeances(): SeanceRealisation[] {
	const v = lsGet(SEANCE_JOURNAL_KEY, []);
	return Array.isArray(v) ? (v as SeanceRealisation[]) : [];
}
/** Archive un état de jour PÉRIMÉ (autre date / définition changée / plus de séance)
    s'il porte au moins une étape réalisée — capture aussi les séances PARTIELLES. */
function archiver(jour: SeanceJour): void {
	if (!jour.completions || jour.completions.length === 0) return;
	const debut = jour.debutTs ?? jour.completions[0].ts;
	const fin = jour.completions[jour.completions.length - 1].ts;
	const real: SeanceRealisation = {
		date: jour.date,
		defId: jour.defId,
		etapes: jour.completions.slice(),
		complete: jour.complete,
		debutTs: debut,
		finTs: fin,
		dureeActiveMs: jour.completions.reduce((s, c) => s + c.dureeMs, 0),
		dureeTotaleMs: Math.max(0, fin - debut),
	};
	const j = chargerJournalSeances();
	j.push(real);
	if (j.length > JOURNAL_MAX) j.splice(0, j.length - JOURNAL_MAX);
	lsSet(SEANCE_JOURNAL_KEY, j);
}

/* ---------- État du jour (reset paresseux + archivage) ---------- */
/** État de la séance du jour du profil actif, ou `null` si aucune séance ne
    s'applique aujourd'hui. Archive et remet à zéro un état périmé (minuit passé,
    ou définition changée) au premier accès du nouveau jour. */
export function etatSeanceJour(now: number): SeanceJour | null {
	const today = dateStrDe(now);
	const def = defApplicable(chargerSeances(), now);
	const stored = lsGet(SEANCE_JOUR_KEY, null) as SeanceJour | null;
	const frais = !!stored && stored.date === today && !!def && stored.defId === def.id;
	if (stored && !frais) archiver(stored); // jour périmé → journalisé (partiel compris)
	if (!def) {
		if (stored && !frais) lsRemoveQuiet(SEANCE_JOUR_KEY); // nettoie sans bumper (pas de séance)
		return null;
	}
	if (frais) return stored;
	const neuf: SeanceJour = {
		date: today,
		defId: def.id,
		faits: {},
		completions: [],
		complete: false,
		pending: null,
		// Curseur d'attribution (#498) : le programme du jour naît maintenant, il ne
		// s'attribue pas une session finie avant lui (hier soir, ou ce matin sur un autre
		// programme si l'adulte vient d'en changer la définition).
		vuTs: now,
	};
	lsSet(SEANCE_JOUR_KEY, neuf); // persiste l'état vierge une fois (stable pour la journée)
	return neuf;
}

/* ---------- Étapes en jeu aujourd'hui (#498) ----------
   Les étapes APPLICABLES ne suffisent pas à décrire la journée : une étape « à revoir »
   réussie fait sortir la notion de la file épinglée, donc cesse de s'appliquer dans la
   seconde. La compter parmi les applicables seulement, c'était escamoter de la jauge et du
   récap un travail qui venait d'être crédité — l'enfant lisait « rien de fait » juste après
   avoir fait. On garde donc aussi les étapes DÉJÀ TRAVAILLÉES dans la journée. */
function etapesEnJeu(def: SeanceDef, jour: SeanceJour, ctx: ContexteSeance): SeanceEtape[] {
	return def.etapes.filter((e) => etapeApplicable(e, ctx) || (jour.faits[e.id] ?? 0) > 0);
}
/* Passages EXIGÉS aujourd'hui pour une étape en jeu. Une étape escamotée mais déjà
   travaillée est CLOSE : son exigence se ramène à ce qui a été fait. Sans ça, un « ×3 »
   fait une fois puis devenu impossible (plus rien d'épinglé) réclamerait à jamais deux
   passages introuvables, et le programme ne pourrait plus se terminer. Toujours ≥ 1 : une
   étape n'est « en jeu » que si elle s'applique (donc countRequis ≥ 1) ou si elle a déjà
   été faite au moins une fois. */
function requisJour(etape: SeanceEtape, jour: SeanceJour, ctx: ContexteSeance): number {
	return etapeApplicable(etape, ctx) ? countRequis(etape) : (jour.faits[etape.id] ?? 0);
}

/* ---------- Vue (pour le rendu) ---------- */
export interface VueEtape {
	etape: SeanceEtape;
	requis: number; // passages exigés AUJOURD'HUI (cf. requisJour) — source du « combien de fois »
	fait: number;
	reste: number;
	epuise: boolean;
}
export interface VueSeance {
	def: SeanceDef;
	etapes: VueEtape[]; // étapes APPLICABLES aujourd'hui, ordre de composition
	restantes: VueEtape[]; // étapes encore à faire (propositions actives)
	complete: boolean; // plus rien à faire aujourd'hui (DÉRIVÉ de `restantes`)
	totalRequis: number;
	totalFait: number;
	pendingEtapeId: string | null;
}
/** Vue de la séance du jour du profil actif (ou `null` si aucune aujourd'hui). `ctx`
    (#464) filtre les étapes conditionnelles : une définition dont AUCUNE étape n'est en jeu
    aujourd'hui vaut « pas de programme » (`null`) — jamais un programme vide.

    « En jeu » (#498), pas « applicable » : une étape déjà travaillée aujourd'hui reste
    présente, comptée dans la jauge et listée dans « Déjà fait », même si elle a cessé de
    s'appliquer entre-temps. Elle n'est plus dans `restantes`, donc plus proposée.

    `complete` est ici DÉRIVÉ (« plus rien à faire »), pas lu dans l'état stocké : avec des
    étapes conditionnelles, une étape peut apparaître APRÈS coup (le parent épingle en cours
    de journée) et le programme redevient alors incomplet à l'écran. Le marqueur stocké
    `SeanceJour.complete`, lui, reste la mémoire de la RÉCOMPENSE déjà attribuée (jamais
    deux fois la même célébration). */
export function vueSeanceDuJour(
	now: number,
	ctx: ContexteSeance = CONTEXTE_VIDE,
): VueSeance | null {
	const jour = etatSeanceJour(now);
	if (!jour) return null;
	const def = defApplicable(chargerSeances(), now);
	if (!def) return null; // cohérence (jour ⇒ def), défensif
	const enJeu = etapesEnJeu(def, jour, ctx);
	if (enJeu.length === 0) return null; // aucune étape en jeu ⇒ pas de programme du jour
	const etapes: VueEtape[] = enJeu.map((etape) => {
		const fait = jour.faits[etape.id] ?? 0;
		const requis = requisJour(etape, jour, ctx);
		const reste = Math.max(0, requis - fait);
		return { etape, requis, fait, reste, epuise: reste === 0 };
	});
	const restantes = etapes.filter((v) => v.reste > 0);
	return {
		def,
		etapes,
		restantes,
		complete: restantes.length === 0,
		totalRequis: etapes.reduce((s, v) => s + v.requis, 0),
		totalFait: etapes.reduce((s, v) => s + Math.min(v.fait, v.requis), 0),
		pendingEtapeId: jour.pending?.etapeId ?? null,
	};
}

/* ---------- Attribution ---------- */
/** Pose le marqueur « étape en cours » au lancement d'un mode DEPUIS le programme.
    Sans effet si aucune séance ne s'applique ou si l'étape est inconnue. `ref` (facultatif,
    #463) mémorise la cible réellement lancée quand elle est tirée d'un pool (dictée, épinglée) :
    elle est reportée telle quelle dans la complétion (la métrique conserve la dictée VUE, pas le
    pool). Absente ⇒ on retombe sur la référence de la session journalisée, puis sur `etape.ref`.

    Depuis #498, ce marqueur n'est plus ce qui OUVRE le droit au crédit (le journal d'activité
    s'en charge) : il date l'étape et lève une ambiguïté. Le programme fonctionne sans lui. */
export function marquerEtapeLancee(etapeId: string, now: number, ref?: string): void {
	const jour = etatSeanceJour(now);
	if (!jour) return;
	const etape = defApplicable(chargerSeances(), now)?.etapes.find((e) => e.id === etapeId);
	if (!etape) return;
	jour.pending = { etapeId, kind: etape.kind, launchTs: now, ref };
	if (jour.debutTs == null) jour.debutTs = now;
	lsSet(SEANCE_JOUR_KEY, jour);
}

/** Une session du journal d'activité satisfait-elle cette étape ? SOURCE UNIQUE de « ce que
    vaut une session » pour chaque mode (#498) : c'est ici, et nulle part ailleurs, qu'on dit
    qu'un sprint vaut l'étape « Sprint 5 min » ou qu'une dictée de la liste L vaut une étape
    « À revoir » où L est épinglée.

    Les modes à cible EXACTE (`lecon`, `dictee`) exigent la référence de la session : sans elle
    (entrée d'avant #498, ou session multi-cibles comme un bilan) l'étape n'est pas satisfaite,
    car on ne peut pas affirmer que c'est bien LA leçon demandée qui a été travaillée. Mieux
    vaut ne pas créditer que créditer à tort une consigne précise de l'adulte.

    `epinglees` porte les entrées « à revoir » reconnaissables aujourd'hui (contexte courant
    ET mémo de la journée, cf. `SeanceJour.aRevoirVus`). Pur. */
export function etapeSatisfaite(
	etape: SeanceEtape,
	activite: ActivityEntry,
	epinglees: ContexteSeance,
): boolean {
	switch (etape.kind) {
		case 'sprint':
			return activite.k === 'sprint';
		case 'revision':
			return activite.k === 'revision';
		case 'lecon':
			return activite.k === 'lecon' && !!activite.ref && activite.ref === etape.ref;
		case 'dictee':
			return activite.k === 'dictee' && !!activite.ref && ciblesEtape(etape).includes(activite.ref);
		case 'leconDuJour':
			// La leçon PROPOSÉE change dès qu'elle est réussie : impossible de la comparer après
			// coup. N'importe quelle leçon vaut donc l'étape, ce qui reste fidèle à la consigne
			// enfant (« fais une leçon ») sans lui retirer son crédit parce qu'il en a choisi
			// une autre depuis le catalogue.
			return activite.k === 'lecon' && !!activite.ref;
		case 'aRevoir':
			if (!activite.ref) return false;
			if (activite.k === 'lecon') return epinglees.aRevoirLecons.includes(activite.ref);
			if (activite.k === 'dictee') return epinglees.aRevoirDictees.includes(activite.ref);
			return false;
	}
}

/* Ordre de PRÉFÉRENCE quand plusieurs étapes restantes accepteraient la même session : de la
   plus spécifique à la plus large. Sans lui, une leçon épinglée travaillée pourrait aller
   nourrir « Leçon du jour » et laisser l'étape « À revoir » en plan, alors que l'inverse
   satisfait les deux consignes dans l'ordre le plus favorable à l'enfant. À égalité, l'ordre
   de composition tranche. */
const SPECIFICITE: Record<SeanceModeKind, number> = {
	lecon: 0, // cible unique fixée par l'adulte
	dictee: 0, // pool de cibles fixé par l'adulte
	aRevoir: 1, // cible prise dans la file épinglée
	leconDuJour: 2, // n'importe quelle leçon
	sprint: 3, // type seul : un seul mode produit ce type, aucune ambiguïté possible
	revision: 3,
};

/* Étape à créditer pour une session donnée, ou null si aucune ne l'attend. On ne retient que
   les étapes encore INACHEVÉES (`faits < countRequis`) — une étape épuisée ne prend pas un
   crédit qui pourrait servir à une autre. */
function etapeACrediter(
	def: SeanceDef | null | undefined,
	jour: SeanceJour,
	activite: ActivityEntry,
	epinglees: ContexteSeance,
): SeanceEtape | null {
	if (!def) return null;
	const candidates = def.etapes.filter(
		(e) => (jour.faits[e.id] ?? 0) < countRequis(e) && etapeSatisfaite(e, activite, epinglees),
	);
	if (candidates.length === 0) return null;
	// Le marqueur tranche s'il désigne une candidate : l'enfant a explicitement lancé CETTE
	// étape, sa volonté passe avant l'heuristique de spécificité.
	const p = jour.pending;
	if (p && activite.t >= p.launchTs) {
		const visee = candidates.find((e) => e.id === p.etapeId);
		if (visee) return visee;
	}
	return candidates.reduce((meilleure, e) =>
		SPECIFICITE[e.kind] < SPECIFICITE[meilleure.kind] ? e : meilleure,
	);
}

/* Union ordonnée sans doublon (mémo des épinglées : petits volumes, lisibilité d'abord). */
function union(a: readonly string[], b: readonly string[]): string[] {
	const out = a.slice();
	for (const x of b) if (!out.includes(x)) out.push(x);
	return out;
}
/* Mémorise les épinglées du contexte dans l'état du jour (union avec ce qui a déjà été vu).
   Renvoie true si le mémo a changé (donc s'il faut persister). Rien à mémoriser et aucun mémo
   existant ⇒ aucune écriture : un rendu d'accueil sans épinglée ne touche pas au stockage.
   Mute `jour`, à l'appelant de le persister. */
function memoriserEpinglees(jour: SeanceJour, ctx: ContexteSeance): boolean {
	const vus = jour.aRevoirVus;
	const lecons = union(vus?.lecons ?? [], ctx.aRevoirLecons);
	const dictees = union(vus?.dictees ?? [], ctx.aRevoirDictees);
	if (!lecons.length && !dictees.length) return false;
	if (vus && lecons.length === vus.lecons.length && dictees.length === vus.dictees.length)
		return false;
	jour.aRevoirVus = { lecons, dictees };
	return true;
}

export interface ResolutionSeance {
	etapesCreditees: string[]; // étapes créditées dans cette passe, ordre chronologique
	justCompleted: boolean; // la séance ENTIÈRE vient d'être complétée
}
/** Attribue au programme du jour les sessions d'entraînement NOUVELLES, et détecte la
    complétion. Appelée au retour vers l'accueil ou l'écran du programme. Idempotente : une
    session déjà examinée ne recrédite rien (curseur `SeanceJour.vuTs`).

    ATTRIBUTION SUR CE QUI A ÉTÉ FAIT (#498). On lit le journal d'activité (#319) et, pour
    chaque session survenue depuis la dernière passe, on cherche l'étape restante qu'elle
    satisfait (`etapeSatisfaite`, arbitrage par `SPECIFICITE`). Le chemin de lancement n'entre
    plus en jeu : une leçon épinglée travaillée depuis la carte « À revoir » de l'accueil, ou
    une dictée lancée depuis le catalogue, créditent leur étape comme si l'enfant avait pris
    la tuile du programme. C'est le sens de la fonctionnalité — « as-tu fait ton programme »,
    pas « as-tu cliqué au bon endroit » — et ça règle du même coup l'interruption : une leçon
    reprise et finie plus tard est créditée à ce moment-là.

    Le marqueur `pending`, s'il existe, sert à DATER l'étape (durée réelle) et à désigner
    l'étape visée en cas d'ambiguïté. Non consommé à la fin de la passe, il est nettoyé :
    l'étape a été lancée puis quittée sans rien terminer. Ce nettoyage ne coûte plus le crédit
    (le journal garde la trace), il ne fait perdre que la métrique de durée. */
export function resoudreProgramme(
	now: number,
	ctx: ContexteSeance = CONTEXTE_VIDE,
): ResolutionSeance {
	const jour = etatSeanceJour(now);
	if (!jour) return { etapesCreditees: [], justCompleted: false };
	const def = defApplicable(chargerSeances(), now);
	let modifie = memoriserEpinglees(jour, ctx);
	const epinglees: ContexteSeance = {
		aRevoirLecons: jour.aRevoirVus?.lecons ?? [],
		aRevoirDictees: jour.aRevoirVus?.dictees ?? [],
	};
	const depuis = jour.vuTs ?? 0;
	const nouvelles = loadActivity()
		.filter((e) => e.t > depuis && e.t <= now)
		.sort((a, b) => a.t - b.t);
	const etapesCreditees: string[] = [];
	for (const act of nouvelles) {
		const etape = etapeACrediter(def, jour, act, epinglees);
		if (!etape) continue;
		const p = jour.pending;
		// Le marqueur ne date la session que s'il désigne bien l'étape créditée et précède la
		// session : sinon la « durée » mesurerait le temps passé sur autre chose.
		const date = !!p && p.etapeId === etape.id && act.t >= p.launchTs;
		jour.faits[etape.id] = Math.min(countRequis(etape), (jour.faits[etape.id] ?? 0) + 1);
		jour.completions.push({
			etapeId: etape.id,
			kind: etape.kind,
			// Cible VUE : celle du marqueur (pool tiré, #463), sinon celle que la session
			// elle-même déclare, sinon la cible figée de l'étape.
			ref: (date ? p.ref : undefined) ?? act.ref ?? etape.ref,
			ts: act.t,
			dureeMs: date ? Math.max(0, act.t - p.launchTs) : 0, // 0 = durée inconnue (hors programme)
		});
		if (date) jour.pending = null;
		etapesCreditees.push(etape.id);
		modifie = true;
	}
	if (nouvelles.length) {
		jour.vuTs = nouvelles[nouvelles.length - 1].t;
		modifie = true;
	}
	if (jour.pending) {
		jour.pending = null; // lancée puis quittée sans rien terminer
		modifie = true;
	}
	const justCompleted = acterCompletion(jour, def, ctx);
	if (modifie || justCompleted) lsSet(SEANCE_JOUR_KEY, jour);
	return { etapesCreditees, justCompleted };
}

/* Mémoire de RÉCOMPENSE du jour : passe l'état à « complet » s'il l'est devenu et signale
   la primeur, pour que célébration et trophée n'arrivent qu'une fois. Ne redescend JAMAIS à
   « incomplet » : une étape qui réapparaît en cours de journée (le parent épingle après coup,
   #464) rouvre le programme À L'ÉCRAN — la vue le dérive de ce qui reste à faire — mais ne
   reprend pas une récompense déjà donnée.

   Calculée sur les étapes EN JEU, avec leur exigence du jour (#498). Deux conséquences
   voulues : une étape escamotée mais déjà faite ne bloque plus rien (son exigence se ramène à
   ce qu'elle a reçu), et un programme réduit à cette seule étape est enfin célébré — avant, il
   n'avait plus d'étape applicable et l'enfant perdait fête, trophée et compteur alors qu'il
   avait tout fait. Aucune étape en jeu ⇒ rien à célébrer : garde-fou contre le `every` sur
   liste vide, qui fêterait un programme sans la moindre activité. Comme toute étape en jeu
   exige au moins un passage, un programme où rien n'a été fait n'est jamais complet.
   Mute `jour`, à l'appelant de le persister. */
function acterCompletion(
	jour: SeanceJour,
	def: SeanceDef | null | undefined,
	ctx: ContexteSeance,
): boolean {
	if (jour.complete || !def) return false;
	const enJeu = etapesEnJeu(def, jour, ctx);
	if (enJeu.length === 0) return false;
	if (!enJeu.every((e) => (jour.faits[e.id] ?? 0) >= requisJour(e, jour, ctx))) return false;
	jour.complete = true;
	lsSet(SEANCES_DONE_KEY, seancesCompletees() + 1);
	return true;
}

/** Nombre CUMULÉ de séances complétées (jamais remis à zéro) — base du trophée. */
export function seancesCompletees(): number {
	const v = lsGet(SEANCES_DONE_KEY, 0);
	return typeof v === 'number' ? v : 0;
}
