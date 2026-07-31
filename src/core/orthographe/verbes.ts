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
import { displayPronoun } from '../../data/francais/conjugaison';
import {
	lookupConjugatedForms,
	normVerbKey,
	type VerbTense,
	type FormesConjuguees,
} from '../../data/francais/verbs-lookup';
import type { MotOrtho, OrthoState, VerbeConfig } from './types';

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
