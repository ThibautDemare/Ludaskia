/* ============================================================
   File « à revoir » d'un profil (#234, #465, #556, #573) — logique pure + persistance.
   ------------------------------------------------------------
   Les leçons et dictées épinglées par l'adulte (ou mises de côté par l'enfant), ce que
   l'enfant en voit sur son accueil (`revoirActives`), la liste de gestion de l'espace
   encadrant (`epingleesProfil`), le désépinglage automatique (`purgeRevoirSolides`), la
   tentative de la version de la classe suivie (« sonde », `cloreSondesRevoir`) et la
   trace des retraits (`retraitsAutoProfil`). Forme d'une épingle de leçon :
   `core/revoir-cible.ts`.

   Sorti d'`encadrant-stats` (#573, pur déplacement) : le bloc y dépassait 700 lignes, et
   l'enregistrement d'un essai (`lesson-run.ts`) n'a besoin que de lui. `encadrant-stats`
   le ré-exporte : ses consommateurs historiques n'ont pas à changer d'import.
   ============================================================ */
import { lsGet, lsGetRaw, lsGetItemRaw, lsSetRaw } from './storage';
import { STARS_KEY, LESSON_STATS_KEY, loadCartesBrutes } from './progress';
import {
	perfRecente,
	niveauNotion,
	estNotionSolide,
	type LessonStat,
	type NiveauNotion,
} from './maitrise';
import { getLessonById, type LessonDef, type SchoolLevel, type SubjectId } from './catalog';
import { LEVEL_ORDER, labelLecon } from './levels';
import { niveauActifMatiere } from './niveau-actif';
import { activeProfile, touchProfile, type Profile } from './profiles';
import { loadOrtho, loadOrthoFor } from './orthographe/store';
import { listOrthoLecons, labelLeconOrtho, type SourceLecon } from './orthographe/lessons';
import { niveauListeOrtho } from './orthographe/progression';
import type { OrthoState } from './orthographe/types';
import { lireRevoirLecon, niveauEntreeLecon } from './revoir-cible';
import { niveauProfilMatiere, origineLecon, type OrigineLecon } from './niveau-profil';

/* ---------- File « à revoir » (suggestions de l'encadrant) ----------
   IDs de leçons épinglées par l'encadrant ; rendues comme une carte sur l'accueil
   de l'enfant (cf. ui/a-revoir-card.ts). Stockée par profil (clé préfixée).
   Une leçon y est épinglée À UNE CLASSE depuis #573 (`lessonId@niveau`, cf.
   core/revoir-cible.ts) ; les ids nus d'avant se jouent toujours à la classe suivie. */
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

/* ---------- Lecture d'une épingle de leçon (#573) ----------
   Une épingle porte sa classe (`lessonId@niveau`, core/revoir-cible.ts) : son état se lit À
   CETTE CLASSE, pas à la classe suivie. Et quand une épingle d'une classe ANTÉRIEURE devient
   solide alors que la leçon existe dans la classe suivie, elle ne quitte pas la file tout de
   suite : la version de la classe suivie est d'abord proposée UNE FOIS (la « sonde »).
   Pourquoi (avis pédagogue, issue #573) : « Clique sur le nom » (CE2) et « Clique sur le nom
   noyau » (CM1) ne sont pas une même tâche recalibrée mais deux notions, la seconde
   s'appuyant sur la première. Réussir la version CE2 ne prouve rien sur la version CM1, et un
   retrait immédiat ferait croire à l'adulte que le point est réglé.

   Sonde, conditions cumulées : classe épinglée STRICTEMENT inférieure à la classe suivie, leçon
   présente dans la classe suivie, solide à la classe épinglée, et CANDIDATE au retrait (vue
   fragile alors qu'épinglée, cf. le désépinglage automatique #465 plus bas) — une épingle
   posée sur une notion déjà solide reste le choix assumé de l'adulte, sans sonde ni retrait.
   Elle prend fin au premier essai complet de la leçon joué à la classe suivie
   (`cloreSondesRevoir`), réussi ou non : l'épingle sort alors de la file, avec une trace
   lisible par l'adulte, et rien ne renvoie l'enfant à la version antérieure sans lui.

   Une seule lecture pour les quatre lecteurs (affichage enfant, liste adulte, désépinglage,
   fin de sonde) : deux façons de répondre à la même question divergeraient en silence. */
interface LectureEpingle {
	lesson: LessonDef;
	/** Classe épinglée, résolue (id nu : la classe suivie). */
	niveau: SchoolLevel;
	suivi: SchoolLevel;
	/** Solide à la classe épinglée (même prédicat que l'affichage enfant, #465). */
	solide: boolean;
	/** Classe suivie dont la version est proposée une fois ; `null` hors sonde. */
	sonde: SchoolLevel | null;
}
function lireEpingleLecon(
	entryId: string,
	suiviDe: (subject: SubjectId) => SchoolLevel,
	starsRaw: Record<string, number>,
	statsRaw: Record<string, LessonStat>,
	candidate: boolean,
): LectureEpingle | null {
	const { lessonId, niveau: epingle } = lireRevoirLecon(entryId);
	const lesson = getLessonById(lessonId);
	if (!lesson) return null; // cible sortie du catalogue (mise à jour de l'appli)
	const suivi = suiviDe(lesson.subject);
	const niveau = niveauEntreeLecon(lesson, epingle, suivi);
	const k = lesson.id + '@' + niveau;
	const solide = estNotionSolide((starsRaw[k] || 0) > 0, perfRecente(statsRaw[k])?.pct ?? null);
	const anterieure = LEVEL_ORDER.indexOf(niveau) < LEVEL_ORDER.indexOf(suivi);
	const sonde = solide && candidate && anterieure && lesson.levels.includes(suivi) ? suivi : null;
	return { lesson, niveau, suivi, solide, sonde };
}

/* ---------- File « à revoir » côté enfant (union catalogue / dictée) ----------
   Une entrée épinglée est soit une leçon du catalogue, soit une liste de dictée. La
   carte d'accueil résout le libellé/lancement selon `kind`. `id` = id BRUT (sans préfixe ni
   classe), utilisé pour le lancement (startLecon / startOrthoLecon) et pour la comparaison
   avec la leçon du jour (#516, #573) ; `entryId` = id tel que stocké dans la file, seul à
   désigner UNE entrée quand une leçon est épinglée dans deux classes ; `niveau` = classe où
   jouer la leçon. */
export type RevoirEntry =
	| {
			kind: 'lecon';
			id: string;
			entryId: string;
			niveau: SchoolLevel;
			label: string;
			lesson: LessonDef;
	  }
	| { kind: 'ortho'; id: string; entryId: string; label: string; source: SourceLecon };

/* Entrées « à revoir » actuellement actives pour le profil ACTIF, filtrées sur celles
   ENCORE à travailler (auto-nettoyage : une leçon/liste redevenue solide quitte la boucle) :
   - leçon du catalogue : non étoilée ET (jamais re-travaillée OU perf récente < seuil), à sa
     classe épinglée — ou, en sonde, rendue à la classe suivie (cf. `lireEpingleLecon`) ;
   - liste de dictée : pas encore « acquise » (tous les mots maîtrisés).
   Sert à la carte d'accueil de l'enfant (ui/a-revoir-card.ts). Lit le profil actif.
   `dicteeDispo` (dispo du TTS, fourni par l'UI) conditionne l'« acquis » d'une dictée.

   Une leçon d'une AUTRE classe que celle suivie est rendue comme les autres (#556) : c'est
   l'objet même de l'assignation hors classe, l'adulte l'a désignée pour qu'elle revienne sur
   l'accueil. Ce qu'elle change, c'est le NIVEAU DE LECTURE de son état — il faut la lire là
   où elle est jouée et stockée, sinon une leçon CE2 épinglée pour un CM1 paraîtrait
   éternellement « jamais travaillée » et ne quitterait jamais la boucle. L'enfant, lui, ne
   voit aucune étiquette de classe : la carte d'accueil est identique (#232).
   Deux entrées qui se joueraient pareil (même leçon, même classe : une sonde CM1 et une
   épingle CM1, ou un id nu et son équivalent scopé) n'en font qu'une, et c'est l'épingle
   ordinaire qui la porte plutôt que la sonde : l'adulte l'a posée pour durer, la sonde n'est
   qu'un essai proposé une fois — et la fin de sonde la retirera de toute façon au premier
   essai de cette classe. */
export function revoirActives(dicteeDispo = false): RevoirEntry[] {
	const ids = loadRevoir();
	if (ids.length === 0) return [];
	// Cartes BRUTES du profil actif : chaque épingle se lit à SA classe (#573).
	const { stars, stats } = loadCartesBrutes();
	const marques = loadFragiles(activeProfile().uuid);
	// État orthographe du profil actif, chargé une seule fois si au moins une dictée est épinglée.
	const ortho = ids.some(isOrthoRevoirId) ? loadOrtho() : null;
	const out: { entree: RevoirEntry; sonde: boolean }[] = [];
	for (const entryId of ids) {
		if (isOrthoRevoirId(entryId)) {
			if (!ortho) continue;
			const orthoId = orthoIdFromRevoir(entryId);
			const ref = listOrthoLecons(ortho).find((l) => l.id === orthoId);
			if (!ref) continue; // liste supprimée / dictée inconnue → ignorée
			// Encore « à revoir » tant que la liste n'est pas entièrement maîtrisée.
			if (niveauListeOrtho(ortho, orthoId, dicteeDispo) === 'acquis') continue;
			out.push({
				entree: { kind: 'ortho', id: orthoId, entryId, label: ref.label, source: ref.source },
				sonde: false,
			});
			continue;
		}
		const e = lireEpingleLecon(
			entryId,
			niveauActifMatiere,
			stars,
			stats,
			marques == null || marques.includes(entryId),
		);
		if (!e) continue;
		// Encore « à revoir » tant que la notion n'est pas solide à sa classe — MÊME prédicat que
		// la purge (#465) ; en sonde, c'est la version de la classe suivie qui est proposée.
		const joue = e.sonde ?? (e.solide ? null : e.niveau);
		if (!joue) continue;
		out.push({
			entree: {
				kind: 'lecon',
				id: e.lesson.id,
				entryId,
				niveau: joue,
				label: labelLecon(e.lesson, joue),
				lesson: e.lesson,
			},
			sonde: e.sonde != null,
		});
	}
	// Dédoublonnage (cf. en-tête) : une entrée cède à une autre qui se joue pareil si elle est
	// une sonde et l'autre non, ou, à nature égale, si l'autre la précède dans la file.
	const memeJeu = (a: RevoirEntry, b: RevoirEntry) =>
		a.kind === 'lecon' && b.kind === 'lecon' && a.id === b.id && a.niveau === b.niveau;
	return out
		.filter(
			(x, i) =>
				!out.some(
					(y, j) =>
						j !== i &&
						memeJeu(x.entree, y.entree) &&
						(x.sonde && !y.sonde ? true : x.sonde === y.sonde && j < i),
				),
		)
		.map((x) => x.entree);
}

/* ---------- Entrées épinglées d'un profil (espace encadrant, « Épinglées ») ----------
   TOUTES les entrées de la file (aucun filtre de faiblesse : c'est la liste de gestion),
   résolues en libellé. Une entrée dont la cible n'existe plus (leçon hors catalogue actif,
   liste supprimée) est écartée. */
export interface EpingleEntry {
	kind: 'lecon' | 'ortho';
	/** Sert au dé-épinglage : leçon → id de FILE tel que stocké (`lessonId@niveau`, ou id nu
	    d'avant #573) ; dictée → id brut, l'appelant le repréfixe (`orthoRevoirId`). */
	id: string;
	/** Id NU de la cible (leçon du catalogue, ou liste de dictée) : identité de la notion,
	    pour ce qui ne connaît pas la classe (impression, blocages du récap). */
	lessonId: string;
	label: string;
	/** Classe d'où vient la cible et sens de l'écart avec celle que suit le profil (#556) —
	    `null` quand on ne sait pas la nommer (listes de dictée du parent, non taguées par
	    niveau). Calculé ici, là où le niveau de la cible est déjà connu, et non déduit d'une
	    absence ailleurs : deux façons de répondre à la même question divergeraient en silence.
	    Un booléen « hors niveau » ne suffit plus depuis que l'assignation hors classe est le
	    cas NOMINAL : l'affichage a besoin de la classe (pour le badge) ET du sens (les deux
	    n'appellent pas le même régime, cf. `EtatEpingle`). */
	origine: OrigineLecon | null;
	/** Ce que la ligne doit montrer de l'avancement, déjà résolu (cf. `EtatEpingle`). */
	etat: EtatEpingle;
	/** Épingle d'une classe antérieure réussie, dont la version de la classe suivie est
	    proposée une fois à l'enfant (#573, cf. `lireEpingleLecon`) : sans ce mot, la ligne
	    dirait « acquis » sur une épingle qui reste pourtant dans la file. */
	sonde?: { niveau: SchoolLevel; label: string };
}

/** Ce qu'une ligne épinglée dit de l'avancement, selon d'où vient la leçon (#556) :

    - classe suivie, ou classe EN DESSOUS : l'état d'acquisition habituel, lu au niveau de
      STOCKAGE de la cible. Une consolidation part d'un état bas, c'est normal et non une
      alerte — la masquer priverait l'adulte de la seule mesure du progrès ;
    - classe AU-DESSUS : un compte-rendu FACTUEL, jamais un état d'acquisition (avis
      pédagogue). Un échec afficherait « à renforcer » sur une notion pas encore enseignée,
      une réussite « acquis » sur un seul essai. Cet essai ne compte donc ni dans les
      compteurs de maîtrise, ni dans les suggestions « à revoir », ni dans le signal « reste
      un point dur » (#492), qui supposent tous du contenu de la classe suivie ;
    Toujours renseigné : une entrée dont la cible n'est pas résolvable n'est pas rendue du tout
    par `epingleesProfil`, il n'y a donc pas de troisième cas « état inconnu » — l'UI n'a jamais
    à choisir entre afficher un motif faux et n'afficher rien.

    `essaye` distingue « pas encore travaillée » de « essayée sans succès » : une leçon d'une
    classe suivante vient le plus souvent d'être épinglée et n'a encore jamais été jouée. Le
    déduire d'une absence de date ou d'un `reussi` faux ferait dire à la ligne qu'elle a été
    tentée et ratée, ce qui n'est PAS un fait — or c'est tout ce que ce régime prétend dire.
    `at` peut manquer même après un essai : le suivi des dictées ne date pas les siens. */
export type EtatEpingle =
	| { kind: 'acquisition'; niveau: NiveauNotion }
	| { kind: 'essai'; essaye: boolean; at: number | null; reussi: boolean };

/* État d'une leçon lu à un niveau DONNÉ, depuis les cartes brutes d'un profil. Même calcul
   que le récap (`progressionProfil`), à ceci près que le niveau est imposé au lieu d'être
   celui de la classe suivie : c'est ce qui permet de lire une cible assignée hors classe. */
function etatLeconAuNiveau(
	lesson: LessonDef,
	niveau: SchoolLevel,
	starsRaw: Record<string, number>,
	statsRaw: Record<string, LessonStat>,
): { etoilee: boolean; stat: LessonStat | undefined } {
	const k = lesson.id + '@' + niveau;
	return { etoilee: (starsRaw[k] || 0) > 0, stat: statsRaw[k] };
}

export function epingleesProfil(profile: Profile, dicteeDispo = false): EpingleEntry[] {
	const ids = loadRevoirFor(profile.uuid);
	if (ids.length === 0) return [];
	const ortho = ids.some(isOrthoRevoirId) ? loadOrthoFor(profile.uuid) : null;
	// Dictées visibles au niveau du profil (filtrage CUMULATIF : un CM1 garde les listes CE2).
	// Les listes CRÉÉES par le parent ne sont pas taguées par niveau : jamais hors classe.
	const orthoDuNiveau = ortho
		? new Set(listOrthoLecons(ortho, niveauProfilMatiere(profile, 'francais')).map((l) => l.id))
		: null;
	const starsRaw = lsGetRaw(profile.uuid + '/' + STARS_KEY, {}) as Record<string, number>;
	const statsRaw = lsGetRaw(profile.uuid + '/' + LESSON_STATS_KEY, {}) as Record<
		string,
		LessonStat
	>;
	const marques = loadFragiles(profile.uuid);
	const out: EpingleEntry[] = [];
	for (const entryId of ids) {
		if (isOrthoRevoirId(entryId)) {
			if (!ortho) continue; // état d'orthographe illisible : cible non résolvable
			const orthoId = orthoIdFromRevoir(entryId);
			const label = labelLeconOrtho(orthoId, ortho.listes);
			if (!label) continue;
			// Une dictée prédéfinie d'une classe SUIVANTE sort du cumul visible au niveau du
			// profil : même régime « au-dessus » que les leçons, mais sans classe à nommer (le
			// store d'orthographe n'expose pas le niveau d'une référence).
			const auDessus = !orthoDuNiveau?.has(orthoId);
			out.push({
				kind: 'ortho',
				id: orthoId,
				lessonId: orthoId,
				label,
				origine: null,
				etat: etatOrthoEpingle(ortho, orthoId, auDessus, dicteeDispo),
			});
			continue;
		}
		// Lue à SA classe (#573) : celle de l'épingle, ou la classe suivie pour un id nu.
		const e = lireEpingleLecon(
			entryId,
			(s) => niveauProfilMatiere(profile, s),
			starsRaw,
			statsRaw,
			marques == null || marques.includes(entryId),
		);
		if (!e) continue;
		const origine = origineLecon(e.lesson, profile, e.niveau);
		const { etoilee, stat } = etatLeconAuNiveau(e.lesson, origine.niveau, starsRaw, statsRaw);
		out.push({
			kind: 'lecon',
			id: entryId,
			lessonId: e.lesson.id,
			label: labelLecon(e.lesson, origine.niveau),
			origine,
			etat:
				origine.direction === 'au-dessus'
					? { kind: 'essai', essaye: !!stat?.attempts, at: stat?.lastAt ?? null, reussi: etoilee }
					: { kind: 'acquisition', niveau: niveauNotion(stat, etoilee) },
			...(e.sonde ? { sonde: { niveau: e.sonde, label: labelLecon(e.lesson, e.sonde) } } : {}),
		});
	}
	return out;
}

/* État d'une liste de dictée épinglée. Une liste d'une classe suivante suit le même parti
   pris que les leçons prises au-dessus : pas d'état d'acquisition, un compte-rendu factuel.
   Le store d'orthographe ne date pas les essais par liste — le compte-rendu se réduit donc à
   « déjà réussie ou pas », sans date, plutôt qu'à un état qui se lirait comme un jugement. */
function etatOrthoEpingle(
	ortho: OrthoState,
	orthoId: string,
	auDessus: boolean,
	dicteeDispo: boolean,
): EtatEpingle {
	const niveau = niveauListeOrtho(ortho, orthoId, dicteeDispo);
	if (!auDessus) return { kind: 'acquisition', niveau };
	return { kind: 'essai', essaye: niveau !== 'a-decouvrir', at: null, reussi: niveau === 'acquis' };
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
	/** Ce que le retrait a le droit d'annoncer (#571, cf. `MotifRetrait`). FIGÉ à l'instant du
	    retrait, comme le libellé, et pour la même raison : la trace explique un ÉVÉNEMENT
	    PASSÉ, survenu sous la classe suivie de ce moment-là — la recalculer plus tard la ferait
	    changer d'explication si l'adulte change de classe entre-temps.
	    ABSENT sur les entrées d'avant #571 : la ligne n'annonce alors aucun motif, plutôt que
	    d'en supposer un. C'est le repli prudent — on ne prononce pas une maîtrise dont on n'a
	    pas la trace. Ces entrées sortent d'elles-mêmes en 30 jours. */
	motif?: MotifRetrait;
	/** Fin de sonde (#573, motif `'version-suivie'`) : la version de la classe suivie
	    proposée après la réussite de l'épingle, et ce qu'en a fait l'enfant. Figée elle aussi.
	    Présente si et seulement si le motif est `'version-suivie'`. */
	versionSuivie?: { niveau: SchoolLevel; label: string; reussie: boolean };
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
			(r.kind === 'lecon' || r.kind === 'ortho') &&
			// `motif` n'est PAS exigé (entrées d'avant #571) ; une valeur inconnue est refusée
			// avec toute l'entrée plutôt que silencieusement lue comme « maîtrise ». Une fin de
			// sonde sans son récit n'aurait rien à dire : refusée de même.
			(r.motif === undefined ||
				r.motif === 'maitrise' ||
				r.motif === 'essai' ||
				(r.motif === 'version-suivie' && versionSuivieValide(r.versionSuivie))),
	);
}
function versionSuivieValide(v: unknown): v is RetraitAuto['versionSuivie'] {
	if (!v || typeof v !== 'object') return false;
	const o = v as Record<string, unknown>;
	return (
		(LEVEL_ORDER as unknown[]).includes(o.niveau) &&
		typeof o.label === 'string' &&
		typeof o.reussie === 'boolean'
	);
}
/* Ajoute des retraits à la trace d'un profil : plus récent d'abord, bornée en nombre ET en
   ancienneté. Commun au désépinglage (#465) et à la fin de sonde (#573). */
function tracerRetraits(uuid: string, retires: RetraitAuto[], now: number): void {
	const journal = [...retires, ...loadRetraitsAuto(uuid)]
		.filter((r) => now - r.at <= RETRAITS_AUTO_FENETRE_MS)
		.slice(0, RETRAITS_AUTO_MAX);
	lsSetRaw(uuid + '/' + REVOIR_AUTO_KEY, JSON.stringify(journal));
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
/** Ce qu'un retrait automatique a le droit d'annoncer (#571). Le retrait lui-même ne
    distingue pas les cas — c'est le même prédicat de solidité pour tous, et c'est voulu (cf.
    `etatEpingle`) — mais ce qu'on en DIT, oui :

    - `'maitrise'` : la notion est redevenue solide, ce que l'écran peut affirmer ;
    - `'essai'` : la cible venait d'une classe SUIVANTE, et l'essai a réussi. On ne parle
      alors pas de maîtrise. La ligne d'épingle refuse déjà d'écrire « acquis » sur un seul
      essai d'une notion pas encore enseignée (cf. `EtatEpingle`) ; l'annoncer ici serait un
      verdict plus fort encore, sur le même contenu, à deux blocs d'écart. Et « de nouveau »
      supposerait une maîtrise antérieure qui n'a jamais existé ;
    - `'version-suivie'` (#573) : une épingle d'une classe ANTÉRIEURE, réussie, puis la
      version de la classe suivie tentée une fois (`RetraitAuto.versionSuivie`). Ce n'est
      pas le désépinglage qui la retire mais la fin de sonde (`cloreSondesRevoir`). */
export type MotifRetrait = 'maitrise' | 'essai' | 'version-suivie';

interface SoliditeEpingle {
	kind: 'lecon' | 'ortho';
	label: string;
	solide: boolean;
	motif: Exclude<MotifRetrait, 'version-suivie'>;
	/** En sonde (#573) : ni retirée ni oubliée — sa marque de fragilité est conservée, sans
	    quoi la passe suivante la jugerait « posée solide » et la sonde s'éteindrait. */
	enSonde?: true;
}
interface CtxSolidite {
	starsRaw: Record<string, number>;
	statsRaw: Record<string, LessonStat>;
	ortho: OrthoState | null;
	dicteeDispo: boolean;
}
function etatEpingle(
	entryId: string,
	profile: Profile,
	ctx: CtxSolidite,
	candidate: boolean,
): SoliditeEpingle | null {
	if (isOrthoRevoirId(entryId)) {
		if (!ctx.ortho) return null;
		const orthoId = orthoIdFromRevoir(entryId);
		const ref = listOrthoLecons(ctx.ortho).find((l) => l.id === orthoId);
		if (!ref) return null; // liste supprimée / dictée inconnue
		// Dictée prédéfinie d'une classe SUIVANTE : absente du cumul visible au niveau du
		// profil (filtrage cumulatif — un CM1 garde les listes CE2). Même régime que les
		// leçons prises au-dessus, cf. `MotifRetrait`.
		const auDessus = !listOrthoLecons(ctx.ortho, niveauProfilMatiere(profile, 'francais')).some(
			(l) => l.id === orthoId,
		);
		return {
			kind: 'ortho',
			label: ref.label,
			motif: auDessus ? 'essai' : 'maitrise',
			// Solide = liste entièrement maîtrisée (même critère que revoirActives), MAIS on
			// exige la dispo du TTS : sans elle, le mode dictée n'est pas requis (modesRequis)
			// et « acquis » devient plus FACILE. Le filtre d'affichage peut se le permettre (il
			// est réversible), pas un retrait définitif → sur un appareil sans voix de synthèse,
			// une dictée épinglée n'est jamais retirée d'office.
			solide: ctx.dicteeDispo && niveauListeOrtho(ctx.ortho, orthoId, ctx.dicteeDispo) === 'acquis',
		};
	}
	// Classe où la leçon est jouée et STOCKÉE, par la MÊME lecture que l'affichage enfant et
	// la liste adulte (`lireEpingleLecon`) : celle de l'épingle (#573), ou la classe suivie pour
	// un id nu. Une épingle d'une autre classe se juge donc comme les autres. Depuis qu'elle
	// atteint l'accueil de l'enfant, l'écarter ici la laisserait dans la file à vie, alors que
	// l'affichage enfant, lui, cesserait de la montrer une fois redevenue solide — le
	// désépinglage automatique doit rester le MIROIR exact de cet affichage, jusqu'au niveau
	// auquel il lit l'état, sonde comprise.
	const e = lireEpingleLecon(
		entryId,
		(s) => niveauProfilMatiere(profile, s),
		ctx.starsRaw,
		ctx.statsRaw,
		candidate,
	);
	if (!e) return null;
	const auDessus = LEVEL_ORDER.indexOf(e.niveau) > LEVEL_ORDER.indexOf(e.suivi);
	return {
		kind: 'lecon',
		label: labelLecon(e.lesson, e.niveau),
		solide: e.solide && !e.sonde,
		motif: auDessus ? 'essai' : 'maitrise',
		...(e.sonde ? { enSonde: true as const } : {}),
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
		const etat = etatEpingle(entryId, profile, ctx, candidates.has(entryId));
		// Retrait SEULEMENT si la cible est résolvable, solide, ET déjà candidate (vue fragile
		// alors qu'épinglée) : une épingle posée sur une notion solide est un choix du parent.
		// Une épingle en sonde (#573) n'est pas « solide » ici : elle reste, marque comprise,
		// jusqu'à l'essai de la version de la classe suivie (`cloreSondesRevoir`).
		if (etat != null && etat.solide && candidates.has(entryId)) {
			retires.push({
				id: entryId,
				kind: etat.kind,
				label: etat.label,
				at: now,
				motif: etat.motif,
			});
			continue; // sortie de la file ET de la mémoire de fragilité
		}
		restants.push(entryId);
		// Reste candidate si elle est fragile maintenant, ou si elle l'était déjà et qu'on ne
		// peut pas en juger (cible non résolvable — on ne perd pas la marque acquise).
		if (etat != null ? !etat.solide : candidates.has(entryId)) fragiles.push(entryId);
	}
	if (retires.length) {
		saveRevoirFor(uuid, restants);
		tracerRetraits(uuid, retires, now);
	}
	// Marques réécrites seulement si elles changent : le rendu est idempotent.
	const inchangees =
		marques != null &&
		marques.length === fragiles.length &&
		fragiles.every((x, i) => marques[i] === x);
	if (!inchangees) lsSetRaw(uuid + '/' + REVOIR_FRAGILE_KEY, JSON.stringify(fragiles));
	return retires.map((r) => r.id);
}

/* Fin de sonde (#573, critères 11 et 12) : un essai COMPLET de `lessonId` vient d'être joué,
   en mode leçon, à `niveauJoue`, sur le profil ACTIF. Toute épingle de cette leçon dont la
   sonde proposait justement cette classe-là quitte la file, réussie ou non, avec une trace
   qui le dit à l'adulte. La version antérieure n'est plus proposée : y revenir est une
   décision d'adulte (ré-épingler la trace). Appelée par `recordLessonRun` APRÈS l'écriture de
   l'essai, qui ne touche que la classe jouée : la lecture de la classe épinglée est intacte.
   Un sprint, un bilan, une session jouée à une autre classe (niveau imposé) ne clôt rien : ce
   n'est pas la tentative de la version suivie. Sans `touchProfile`, comme le désépinglage :
   c'est un effet automatique, pas un geste de l'adulte. Rend les entryId retirés. */
export function cloreSondesRevoir(
	lessonId: string,
	niveauJoue: SchoolLevel,
	reussie: boolean,
	now: number,
): string[] {
	const profile = activeProfile();
	const uuid = profile.uuid;
	const ids = loadRevoirFor(uuid);
	const concernees = ids.filter(
		(id) => !isOrthoRevoirId(id) && lireRevoirLecon(id).lessonId === lessonId,
	);
	if (!concernees.length) return [];
	const marques = loadFragiles(uuid);
	const starsRaw = lsGetRaw(uuid + '/' + STARS_KEY, {}) as Record<string, number>;
	const statsRaw = lsGetRaw(uuid + '/' + LESSON_STATS_KEY, {}) as Record<string, LessonStat>;
	const retires: RetraitAuto[] = [];
	for (const entryId of concernees) {
		const e = lireEpingleLecon(
			entryId,
			(s) => niveauProfilMatiere(profile, s),
			starsRaw,
			statsRaw,
			marques == null || marques.includes(entryId),
		);
		if (!e || e.sonde !== niveauJoue) continue;
		retires.push({
			id: entryId,
			kind: 'lecon',
			label: labelLecon(e.lesson, e.niveau),
			at: now,
			motif: 'version-suivie',
			versionSuivie: { niveau: e.sonde, label: labelLecon(e.lesson, e.sonde), reussie },
		});
	}
	if (!retires.length) return [];
	const partis = new Set(retires.map((r) => r.id));
	saveRevoirFor(
		uuid,
		ids.filter((id) => !partis.has(id)),
	);
	tracerRetraits(uuid, retires, now);
	// Sortie de la mémoire de fragilité aussi, comme tout retrait : ré-épinglée plus tard, elle
	// repartira comme une épingle neuve.
	if (marques != null)
		lsSetRaw(
			uuid + '/' + REVOIR_FRAGILE_KEY,
			JSON.stringify(marques.filter((id) => !partis.has(id))),
		);
	return [...partis];
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
