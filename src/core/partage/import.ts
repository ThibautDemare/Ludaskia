/* ============================================================
   Séance partagée (#734) — AJOUTER un résultat reçu au suivi d'un profil.

   L'import est optionnel et c'est l'encadrant qui choisit le profil : aucun identifiant
   d'enfant ne voyage, le rapprochement se fait à la main (le pseudo n'est qu'une aide à
   la présélection, `profilCorrespondant`).

   Ce qui entre dans le profil, et RIEN d'autre (critères 21 et 26) :
   - les erreurs du résultat, dans son journal, datées du passage ;
   - une entrée d'activité « séance partagée », sans score ;
   - l'identifiant du résultat, pour qu'un second import n'ajoute rien (critère 22).
   Ni XP, ni étoile, ni record, ni statistique de leçon, ni objectif, ni série, ni
   trophée, ni révision : le résultat a été joué ailleurs, il ne rapporte rien ici.

   Tout s'écrit PAR UUID, sans changer le profil actif : l'appareil reste à l'enfant qui
   jouait.
   ============================================================ */
import type { SchoolLevel } from '../catalog';
import { ERREURS_KEY, journaliserErreursFor, type ErreurEntry } from '../erreurs-journal';
import {
	addProfile,
	listProfiles,
	setNiveauReferenceFor,
	touchProfile,
	type Profile,
} from '../profiles';
import { ACTIVITY_KEY, recordActivitePartageFor } from '../progress';
import { lsGetItemRaw, lsGetRaw, lsRemoveRaw, lsSetRaw } from '../storage';
import { cleRecherche } from '../utils';
import { MODE_PARTAGE, passageJoueIci } from './passage';
import type { Resultat } from './resultat';

/** Identifiants des résultats déjà ajoutés au suivi de ce profil (clé par profil). */
export const RESULTATS_IMPORTES_KEY = 'ludaskia_resultatsImportes';

/** Résultats retenus par profil. Au-delà, le plus ancien import est oublié : réimporter
 *  CE résultat-là doublerait ses erreurs, ce qui suppose d'en avoir importé 500 depuis. */
export const MAX_IMPORTS_RETENUS = 500;

export type Import =
	{ ok: true; erreurs: number } | { ok: false; raison: 'deja' | 'profil' | 'stockage' };

/** Les erreurs d'un résultat, telles que le journal les garde : une par question fausse
 *  ou passée par « je ne sais pas » (marquée « n'a pas essayé », comme dans la séance),
 *  dans l'ordre des questions. Le même tri que la séance de l'enfant, qui journalise ces
 *  deux statuts et eux seuls. */
export function erreursDuResultat(r: Resultat): ErreurEntry[] {
	const erreurs: ErreurEntry[] = [];
	for (const item of r.reponses) {
		if (item.statut !== 'faux' && item.statut !== 'jnsp') continue;
		const e: ErreurEntry = {
			ts: r.date,
			lessonId: item.lecon,
			mode: MODE_PARTAGE,
			question: item.enonce,
			donnee: item.statut === 'jnsp' ? '' : item.saisie,
			attendue: item.attendue,
		};
		if (item.statut === 'jnsp') e.sansTentative = true;
		erreurs.push(e);
	}
	return erreurs;
}

function importes(uuid: string): string[] {
	const brut: unknown = lsGetRaw(uuid + '/' + RESULTATS_IMPORTES_KEY, []);
	return Array.isArray(brut) ? brut.filter((id): id is string => typeof id === 'string') : [];
}

/** Ce résultat est-il déjà dans le suivi de ce profil ? Importé auparavant, ou joué ici
 *  même par ce profil : dans les deux cas, ses erreurs sont déjà dans le journal. */
export function dejaImporte(r: Resultat, uuid: string): boolean {
	return importes(uuid).includes(r.id) || passageJoueIci(uuid, r);
}

/* Ce qu'un import écrit, photographié avant : un import à moitié écrit (stockage plein)
   est DÉFAIT, sinon le nouvel essai que propose l'écran doublerait les erreurs déjà
   passées. `null` : la clé n'existait pas. */
interface Photo {
	erreurs: string | null;
	activite: string | null;
	importes: string | null;
}

function photographier(uuid: string): Photo {
	return {
		erreurs: lsGetItemRaw(uuid + '/' + ERREURS_KEY),
		activite: lsGetItemRaw(uuid + '/' + ACTIVITY_KEY),
		importes: lsGetItemRaw(uuid + '/' + RESULTATS_IMPORTES_KEY),
	};
}

function restaurer(uuid: string, photo: Photo): void {
	if (photo.erreurs === null) lsRemoveRaw(uuid + '/' + ERREURS_KEY);
	else lsSetRaw(uuid + '/' + ERREURS_KEY, photo.erreurs);
	if (photo.activite === null) lsRemoveRaw(uuid + '/' + ACTIVITY_KEY);
	else lsSetRaw(uuid + '/' + ACTIVITY_KEY, photo.activite);
	if (photo.importes === null) lsRemoveRaw(uuid + '/' + RESULTATS_IMPORTES_KEY);
	else lsSetRaw(uuid + '/' + RESULTATS_IMPORTES_KEY, photo.importes);
}

/** Ajoute le résultat au suivi du profil `uuid` (cf. en-tête). Un second import du même
 *  résultat dans le même profil n'écrit rien. `stockage` : une écriture a été refusée
 *  (quota) ; tout ce que l'import avait écrit est défait, pour qu'il puisse être refait. */
export function importerResultat(r: Resultat, uuid: string): Import {
	if (!listProfiles().some((p) => p.uuid === uuid)) return { ok: false, raison: 'profil' };
	if (dejaImporte(r, uuid)) return { ok: false, raison: 'deja' };
	const photo = photographier(uuid);
	const erreurs = journaliserErreursFor(uuid, erreursDuResultat(r));
	const activite = recordActivitePartageFor(uuid, r.date);
	const retenus = [r.id, ...importes(uuid)].slice(0, MAX_IMPORTS_RETENUS);
	lsSetRaw(uuid + '/' + RESULTATS_IMPORTES_KEY, JSON.stringify(retenus));
	// `lsSetRaw` tait un refus du stockage : on relit. Un journal resté tel que photographié
	// n'a pas été écrit (des erreurs ajoutées passent en tête), un identifiant absent non
	// plus ; l'activité se relit elle-même (`recordActivitePartageFor`).
	const ecrit =
		(erreurs === 0 || lsGetItemRaw(uuid + '/' + ERREURS_KEY) !== photo.erreurs) &&
		activite &&
		importes(uuid).includes(r.id);
	if (!ecrit) {
		restaurer(uuid, photo);
		return { ok: false, raison: 'stockage' };
	}
	touchProfile(uuid);
	return { ok: true, erreurs };
}

/** Le profil à présélectionner : le premier dont le nom est le pseudo, à la casse, aux
 *  accents et aux espaces près (« Léa » pour « lea »). Jamais une correspondance
 *  partielle : « Léa » ne désigne pas « Léane ». Une présélection n'importe rien ;
 *  l'encadrant confirme (critère 19). */
export function profilCorrespondant(pseudo: string, profils: readonly Profile[]): Profile | null {
	const cle = cleRecherche(pseudo);
	if (!cle) return null;
	return profils.find((p) => cleRecherche(p.name) === cle) ?? null;
}

/** Crée le profil d'un enfant dont on reçoit le résultat : un profil normal, visible et
 *  jouable, nommé d'après son pseudo, avec la classe que l'encadrant a confirmée (aucune
 *  si l'envoi n'en avait pas et qu'il n'en a pas choisi). Le profil actif ne change pas. */
export function creerProfilImporte(nom: string, niveau?: SchoolLevel): Profile {
	const p: Profile = addProfile(nom, undefined, { activer: false });
	if (niveau) setNiveauReferenceFor(p.uuid, niveau);
	return listProfiles().find((x) => x.uuid === p.uuid) ?? p;
}
