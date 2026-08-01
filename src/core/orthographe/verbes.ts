/* ============================================================
   Mode Orthographe — cibles d'entraînement d'un VERBE paramétré (#261).
   Un VerbeConfig (infinitif + pronoms × temps + complément) se déplie en une
   cible MotOrtho par couple (pronom × temps) : la forme conjuguée est la réponse
   (`mot`), entourée d'une phrase de contexte « pronom + forme + complément »
   (`contexte`) affichée dans tous les modes et lue en TTS.

   - `expanseVerbe` est PURE (formes déjà résolues en entrée) → testable.
   - `materialiserVerbes` résout les formes via LEFFF (async) et matérialise les
     cibles dans la banque (id namespacé `v:…`, JAMAIS indexé par forme : les
     formes homophones je/il « mange » restent des cibles distinctes, et n'entrent
     pas en collision avec les mots classiques de la banque).
   ============================================================ */
import { etatNeuf } from '../revision';
import { displayPronoun, PRONOUNS } from '../../data/francais/conjugaison';
import {
	lookupConjugatedForms,
	normVerbKey,
	type VerbTense,
	type FormesConjuguees,
} from '../../data/francais/verbs-lookup';
import type { ListeOrtho, MotOrtho, OrthoState, VerbeConfig } from './types';

/** Id stable d'une cible verbe (distinct pour chaque couple temps × personne). */
export function cibleVerbeId(infinitif: string, temps: VerbTense, person: number): string {
	return `v:${normVerbKey(infinitif)}#${temps}#${person}`;
}

/** Liste du profil qui POSSÈDE cette cible verbe, `null` si aucune (#391).
 *
 *  Une cible verbe n'est pas référencée par `motIds` : elle est matérialisée dans la banque au
 *  lancement du parcours, depuis `liste.verbes`. On la rattache donc à la liste dont un verbe
 *  REGÉNÈRE le préfixe de son id — la même clé que `cibleVerbeId`, donc insensible aux accents
 *  et à la casse de la saisie du parent. Sert au journal d'erreurs à donner un groupe
 *  affichable à un verbe raté en révision. Pur. */
export function listeDeCibleVerbe(state: OrthoState, wordId: string): string | null {
	if (!wordId.startsWith('v:')) return null;
	for (const l of state.listes) {
		for (const v of l.verbes ?? []) {
			if (wordId.startsWith(`v:${normVerbKey(v.infinitif)}#`)) return l.id;
		}
	}
	return null;
}

/** TOUTES les listes dont un verbe REGÉNÈRE cette cible, dans l'ordre de `state.listes` (#496).
 *
 *  Pendant multi-listes de `listeDeCibleVerbe` (qui n'en renvoie qu'une, suffisante au journal
 *  d'erreurs). Sert à AVERTIR avant suppression : une cible verbe se recrée à l'identique au
 *  prochain lancement du parcours (`materialiserVerbes`, id déterministe), donc la supprimer ne
 *  tient que si plus aucune liste ne porte le verbe. L'adulte a besoin de savoir LESQUELLES pour
 *  aller y retirer le verbe ou le reconfigurer. Tableau vide pour un mot qui n'est pas une cible
 *  verbe, ou dont plus aucun verbe ne porte le préfixe. Pur. */
export function listesDeCibleVerbe(state: OrthoState, wordId: string): ListeOrtho[] {
	if (!wordId.startsWith('v:')) return [];
	return state.listes.filter((l) =>
		(l.verbes ?? []).some((v) => wordId.startsWith(`v:${normVerbKey(v.infinitif)}#`)),
	);
}

/* ---------- Vocabulaire d'un verbe configuré (partagé formulaire / aperçus) ----------
   Le formulaire de liste (`ui/ortho-liste.ts`) et les aperçus de mots (catalogue enfant,
   espace encadrant) décrivent le même objet : un verbe et ses couples pronom × temps.
   Les libellés vivent donc ici, pas dans l'écran qui les affiche. */

/** Temps d'entraînement en clair. v1 : le présent seul (cf. `VerbTense`). */
export const TEMPS_LABEL: Record<VerbTense, string> = { present: 'présent' };

/** Pronoms cochés en clair : « je, tu, il » — ou « tous les pronoms » quand ils y sont
    tous, pour ne pas énumérer six pronoms là où un mot suffit. Pur. */
export function libellePronoms(pronoms: readonly number[]): string {
	return pronoms.length === PRONOUNS.length
		? 'tous les pronoms'
		: pronoms.map((p) => PRONOUNS[p]).join(', ');
}

/** Étiquette d'APERÇU d'un verbe configuré : « manger (je, il — présent) ».
    Un verbe ne se prévisualise qu'une fois, à l'infinitif, alors qu'il vaut autant de
    dictées que de couples pronom × temps (`nbCiblesVerbe`) : sans cette annotation, une
    liste annonçant « 3 mots » n'en montrerait que 2, sans rien qui explique l'écart à
    l'adulte venu lire la liste (#441). Pur. */
export function apercuVerbe(cfg: VerbeConfig): string {
	const temps = cfg.temps.map((t) => TEMPS_LABEL[t]).join(', ');
	return `${cfg.infinitif} (${libellePronoms(cfg.pronoms)} — ${temps})`;
}

/** Nombre de cibles d'un verbe = |pronoms| × |temps| (pour le comptage catalogue). */
export function nbCiblesVerbe(cfg: VerbeConfig): number {
	return cfg.pronoms.length * cfg.temps.length;
}
export function nbCiblesVerbes(verbes: VerbeConfig[] = []): number {
	return verbes.reduce((n, v) => n + nbCiblesVerbe(v), 0);
}

/** Déplie un verbe en cibles MotOrtho « neuves » à partir des formes RÉSOLUES
    (Map temps → 6 formes). Fonction pure : `now` daté par l'appelant. */
export function expanseVerbe(
	cfg: VerbeConfig,
	formesParTemps: Map<VerbTense, FormesConjuguees>,
	now: number,
): MotOrtho[] {
	const apres = cfg.complement ? ' ' + cfg.complement : '';
	const out: MotOrtho[] = [];
	for (const temps of cfg.temps) {
		const formes = formesParTemps.get(temps);
		if (!formes) continue;
		for (const person of cfg.pronoms) {
			const form = formes[person];
			if (!form) continue;
			out.push({
				id: cibleVerbeId(cfg.infinitif, temps, person),
				mot: form,
				contexte: { avant: displayPronoun(person, form), apres },
				entourage: [],
				atelierFait: false,
				validation: { motCache: false, tuiles: false, dictee: false },
				revision: etatNeuf(now),
				origine: 'verbe',
			});
		}
	}
	return out;
}

/** Résout les verbes d'une liste via LEFFF et matérialise leurs cibles dans la
    banque (continuité de progression : une cible déjà présente est REUTILISÉE,
    seul son contexte est rafraîchi si le complément a changé). Un verbe absent du
    lexique (faute de frappe) est ignoré. Renvoie les cibles, dans l'ordre, sans
    doublon. L'appelant sauvegarde l'état. */
export async function materialiserVerbes(
	state: OrthoState,
	verbes: VerbeConfig[],
	now: number,
): Promise<MotOrtho[]> {
	const result: MotOrtho[] = [];
	const seen = new Set<string>();
	for (const cfg of verbes) {
		const formesParTemps = new Map<VerbTense, FormesConjuguees>();
		for (const temps of cfg.temps) {
			const formes = await lookupConjugatedForms(cfg.infinitif, temps);
			if (formes) formesParTemps.set(temps, formes);
		}
		if (formesParTemps.size === 0) continue; // verbe inconnu → ignoré
		for (const fresh of expanseVerbe(cfg, formesParTemps, now)) {
			if (seen.has(fresh.id)) continue;
			seen.add(fresh.id);
			const existing = state.banque[fresh.id];
			if (existing) {
				existing.mot = fresh.mot; // forme stable, resynchronisée par robustesse
				existing.contexte = fresh.contexte; // rafraîchit la phrase (complément modifié)
				existing.origine = 'verbe';
				result.push(existing);
			} else {
				state.banque[fresh.id] = fresh;
				result.push(fresh);
			}
		}
	}
	return result;
}
