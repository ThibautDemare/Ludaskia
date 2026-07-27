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
   - l'ATTRIBUTION d'une complétion à une étape : un marqueur « étape en cours »
     est posé au lancement depuis le programme (`marquerEtapeLancee`) et consommé
     au retour (`resoudrePending`) en lisant le JOURNAL D'ACTIVITÉ existant
     (`loadActivity`, #319) — aucun runner de mode n'a besoin d'être modifié ;
   - les étapes CONDITIONNELLES (#464) : une étape « à revoir » ne s'applique que
     s'il y a quelque chose d'épinglé ; ce que le cœur ne sait pas lire seul lui est
     passé dans un `ContexteSeance` (cf. plus bas) ;
   - les MÉTRIQUES de temps (#440) : chaque étape réalisée est horodatée avec sa
     durée, archivée dans un journal de séances au passage de minuit (base d'un
     futur récap encadrant « durée des séances », visuel différé).
   ============================================================ */
import { lsGet, lsSet, lsGetRaw, lsSetRaw, lsRemoveQuiet } from './storage';
import { loadActivity, type ActivityKind } from './progress';
import { touchProfile } from './profiles';

/* ---------- Modèle ---------- */

/** Modes qu'une étape de programme peut viser. */
export type SeanceModeKind = 'sprint' | 'revision' | 'aRevoir' | 'leconDuJour' | 'lecon' | 'dictee';

/** Métadonnées par mode : libellé (voix encadrant), type d'activité journalisé
    (#319, sert à l'attribution), durée estimée (min, pour le repère encadrant) et
    nature de la référence à préciser (`lecon` = id de leçon, `dictee` = id de liste).

    `activite` de `aRevoir` (#464) est un DÉFAUT : la file épinglée mêle leçons et
    dictées, le type réellement lancé est donc mémorisé dans le marqueur `pending`
    (`SeancePending.activite`) et c'est lui qui sert à l'attribution. */
export const SEANCE_MODE_INFOS: Record<
	SeanceModeKind,
	{ label: string; activite: ActivityKind; dureeMin: number; ref: 'lecon' | 'dictee' | null }
> = {
	sprint: { label: 'Sprint 5 min', activite: 'sprint', dureeMin: 5, ref: null },
	revision: { label: 'Révision', activite: 'revision', dureeMin: 8, ref: null },
	// Même mot que la carte d'accueil et la tuile enfant : un seul vocabulaire, sur tous
	// les écrans, pour la file épinglée.
	aRevoir: { label: 'À revoir', activite: 'lecon', dureeMin: 7, ref: null },
	leconDuJour: { label: 'Leçon du jour', activite: 'lecon', dureeMin: 7, ref: null },
	lecon: { label: 'Une leçon précise', activite: 'lecon', dureeMin: 7, ref: 'lecon' },
	dictee: { label: 'Une dictée', activite: 'dictee', dureeMin: 10, ref: 'dictee' },
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
/** Contexte du jour : ce qui, HORS de la définition, conditionne la présence d'une
    étape. Une seule entrée aujourd'hui : `aRevoir` = nombre de leçons/dictées épinglées
    ENCORE à travailler pour le profil. Le cœur ne peut pas le calculer seul (l'« acquis »
    d'une dictée dépend de la disponibilité du TTS, connue de l'UI seule) : c'est l'UI qui
    le fournit (`ui/seance.ts`), ce qui garde ce module pur et testable. */
export interface ContexteSeance {
	aRevoir: number;
}
/** Contexte NEUTRE (rien d'épinglé) : défaut PRUDENT des lectures de séance — un appelant
    qui l'omet escamote une étape « à revoir » plutôt que de l'afficher à vide. */
export const CONTEXTE_VIDE: ContexteSeance = { aRevoir: 0 };

/** Une étape s'applique-t-elle aujourd'hui ? Seules les étapes CONDITIONNELLES peuvent
    ne pas s'appliquer : « à revoir » disparaît du programme quand rien n'est épinglé —
    sinon le programme porterait une étape VIDE, impossible à réaliser, qui bloquerait sa
    complétion (#464). Pur. */
export function etapeApplicable(etape: SeanceEtape, ctx: ContexteSeance): boolean {
	return etape.kind === 'aRevoir' ? ctx.aRevoir > 0 : true;
}
/** Étapes d'une définition applicables aujourd'hui, dans l'ordre de composition. Pur. */
export function etapesApplicables(def: SeanceDef, ctx: ContexteSeance): SeanceEtape[] {
	return def.etapes.filter((e) => etapeApplicable(e, ctx));
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

/** Marqueur « étape en cours » : posé au lancement d'un mode depuis le programme,
    consommé au retour par `resoudrePending`. Persisté pour survivre à un rechargement. */
export interface SeancePending {
	etapeId: string;
	kind: SeanceModeKind;
	launchTs: number;
	ref?: string; // cible RÉELLEMENT lancée (tirée d'un pool, #463/#464) — pour la métrique
	activite?: ActivityKind; // type RÉELLEMENT lancé quand le mode n'en fixe pas un seul
	// (étape « à revoir » #464 : leçon ou dictée selon la cible tirée) ; absent ⇒ celui du mode
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
	};
	lsSet(SEANCE_JOUR_KEY, neuf); // persiste l'état vierge une fois (stable pour la journée)
	return neuf;
}

/* ---------- Vue (pour le rendu) ---------- */
export interface VueEtape {
	etape: SeanceEtape;
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
    (#464) filtre les étapes conditionnelles : une définition dont AUCUNE étape ne
    s'applique aujourd'hui vaut « pas de programme » (`null`) — jamais un programme vide.

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
	const applicables = etapesApplicables(def, ctx);
	if (applicables.length === 0) return null; // aucune étape à proposer ⇒ pas de programme du jour
	const etapes: VueEtape[] = applicables.map((etape) => {
		const fait = jour.faits[etape.id] ?? 0;
		const reste = Math.max(0, countRequis(etape) - fait);
		return { etape, fait, reste, epuise: reste === 0 };
	});
	const restantes = etapes.filter((v) => v.reste > 0);
	return {
		def,
		etapes,
		restantes,
		complete: restantes.length === 0,
		totalRequis: applicables.reduce((s, e) => s + countRequis(e), 0),
		totalFait: etapes.reduce((s, v) => s + Math.min(v.fait, countRequis(v.etape)), 0),
		pendingEtapeId: jour.pending?.etapeId ?? null,
	};
}

/* ---------- Attribution ---------- */
/** Pose le marqueur « étape en cours » au lancement d'un mode DEPUIS le programme.
    Sans effet si aucune séance ne s'applique ou si l'étape est inconnue. `ref` (facultatif,
    #463) mémorise la cible réellement lancée quand elle est tirée d'un pool (dictée, épinglée) :
    elle est reportée telle quelle dans la complétion (la métrique conserve la dictée VUE, pas le
    pool). Absente ⇒ on retombe sur `etape.ref` (leçon / dictée figée) à la résolution.
    `activite` (facultatif, #464) fixe le type d'activité attendu à l'attribution quand le mode
    n'en impose pas un seul (une épinglée peut être une leçon OU une dictée). */
export function marquerEtapeLancee(
	etapeId: string,
	now: number,
	ref?: string,
	activite?: ActivityKind,
): void {
	const jour = etatSeanceJour(now);
	if (!jour) return;
	const etape = defApplicable(chargerSeances(), now)?.etapes.find((e) => e.id === etapeId);
	if (!etape) return;
	jour.pending = { etapeId, kind: etape.kind, launchTs: now, ref, activite };
	if (jour.debutTs == null) jour.debutTs = now;
	lsSet(SEANCE_JOUR_KEY, jour);
}

export interface ResolutionSeance {
	credited: boolean; // une étape vient d'être créditée
	etapeId: string | null;
	justCompleted: boolean; // la séance ENTIÈRE vient d'être complétée
}
/** Résout le marqueur en cours au retour vers le programme : si une complétion du
    bon type a été journalisée depuis le lancement, crédite l'étape (avec sa durée)
    et détecte la complétion de la séance ; sinon (abandon) nettoie le marqueur.
    Idempotent : sans marqueur, ne fait rien.

    ATTRIBUTION PAR TYPE, PAS PAR RÉFÉRENCE. Le journal d'activité ne retient que le
    TYPE (`ActivityKind`), pas l'id de la leçon/liste jouée. On crédite donc l'étape
    `pending` dès qu'une activité du bon type est survenue depuis `launchTs`, sans
    vérifier que c'est bien la leçon/dictée VISÉE par `ref`. C'est correct grâce à un
    invariant du flux enfant : lancer une étape mène à un écran qu'on ne peut quitter
    que par l'accueil / `#seance`, où `resoudrePending` s'exécute et vide `pending`
    AVANT qu'un autre mode puisse être lancé — un seul marqueur vit à la fois, pour la
    seule étape que l'enfant vient de faire. ⚠️ Si un jour un runner permet d'enchaîner
    un AUTRE exercice sans repasser par l'accueil, cet invariant tombe et il faudrait
    alors vérifier `ref` (que le journal ne porte pas) → à rouvrir à ce moment-là. */
export function resoudrePending(
	now: number,
	ctx: ContexteSeance = CONTEXTE_VIDE,
): ResolutionSeance {
	const jour = etatSeanceJour(now);
	if (!jour || !jour.pending) return { credited: false, etapeId: null, justCompleted: false };
	const p = jour.pending;
	// Type attendu : celui RÉELLEMENT lancé s'il a été mémorisé (étape « à revoir », #464),
	// sinon celui du mode.
	const activite = p.activite ?? SEANCE_MODE_INFOS[p.kind].activite;
	// plus ancienne complétion du bon type survenue DEPUIS le lancement (une activité
	// antérieure à `launchTs` — mode déjà fait plus tôt dans la journée — ne compte pas).
	const hit = loadActivity()
		.filter((e) => e.k === activite && e.t >= p.launchTs)
		.sort((a, b) => a.t - b.t)[0];
	if (!hit) {
		// aucune complétion enregistrée depuis le lancement → étape abandonnée
		jour.pending = null;
		lsSet(SEANCE_JOUR_KEY, jour);
		return { credited: false, etapeId: null, justCompleted: false };
	}
	const def = defApplicable(chargerSeances(), now);
	const etape = def?.etapes.find((e) => e.id === p.etapeId);
	if (etape) {
		jour.faits[p.etapeId] = Math.min(countRequis(etape), (jour.faits[p.etapeId] ?? 0) + 1);
		jour.completions.push({
			etapeId: p.etapeId,
			kind: p.kind,
			ref: p.ref ?? etape.ref, // dictée tirée du pool (#463) sinon cible figée
			ts: hit.t,
			dureeMs: Math.max(0, hit.t - p.launchTs),
		});
	}
	jour.pending = null;
	const justCompleted = acterCompletion(jour, def, ctx);
	lsSet(SEANCE_JOUR_KEY, jour);
	return { credited: !!etape, etapeId: etape ? p.etapeId : null, justCompleted };
}

/* Mémoire de RÉCOMPENSE du jour : passe l'état à « complet » s'il l'est devenu et signale
   la primeur, pour que célébration et trophée n'arrivent qu'une fois. Ne redescend JAMAIS à
   « incomplet » : une étape qui réapparaît en cours de journée (le parent épingle après coup,
   #464) rouvre le programme À L'ÉCRAN — la vue le dérive de ce qui reste à faire — mais ne
   reprend pas une récompense déjà donnée. Complétion calculée sur les seules étapes
   APPLICABLES : aucune applicable ⇒ rien à célébrer (`every` sur une liste vide vaut `true`,
   ce qui fêterait un programme sans activité). Mute `jour`, à l'appelant de le persister. */
function acterCompletion(
	jour: SeanceJour,
	def: SeanceDef | null | undefined,
	ctx: ContexteSeance,
): boolean {
	if (jour.complete || !def) return false;
	const applicables = etapesApplicables(def, ctx);
	if (applicables.length === 0) return false;
	if (!applicables.every((e) => (jour.faits[e.id] ?? 0) >= countRequis(e))) return false;
	jour.complete = true;
	lsSet(SEANCES_DONE_KEY, seancesCompletees() + 1);
	return true;
}

/** Acte la complétion du programme du jour SANS qu'une étape vienne d'être réalisée : le
    contexte peut changer de lui-même (#464) et escamoter la DERNIÈRE étape restante — une
    épinglée que l'adulte retire, ou qui redevient solide parce que l'enfant l'a travaillée
    depuis la carte d'accueil. Le programme est alors terminé sans passer par
    `resoudrePending`, et sa récompense serait perdue. Renvoie `true` la seule fois où la
    complétion est actée (⇒ à célébrer). Idempotent, sans effet s'il reste à faire. */
export function consoliderCompletion(now: number, ctx: ContexteSeance = CONTEXTE_VIDE): boolean {
	const jour = etatSeanceJour(now);
	if (!jour || jour.complete) return false;
	const justCompleted = acterCompletion(jour, defApplicable(chargerSeances(), now), ctx);
	if (justCompleted) lsSet(SEANCE_JOUR_KEY, jour);
	return justCompleted;
}

/** Nombre CUMULÉ de séances complétées (jamais remis à zéro) — base du trophée. */
export function seancesCompletees(): number {
	const v = lsGet(SEANCES_DONE_KEY, 0);
	return typeof v === 'number' ? v : 0;
}
