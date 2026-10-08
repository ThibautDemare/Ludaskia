/* ============================================================
   Séance partagée (#734) — les ENVOIS CRÉÉS par l'encadrant (« Vos envois »).

   L'encadrant doit pouvoir recopier un lien déjà donné, à l'identique (critère 4) :
   on garde donc le CODE du lien tel qu'il a été créé, jamais de quoi le refaire (un
   nouveau tirage donnerait un autre exercice).

   Clé GLOBALE de l'appareil, comme le code d'accès (`encadrant-lock.ts`) : un envoi
   appartient à l'adulte, pas à un profil d'enfant. Changer de profil actif ne le cache
   pas, et supprimer un profil ne l'emporte pas. Corollaire assumé : la sauvegarde des
   profils (export) ne le contient pas.
   ============================================================ */
import { lsGetRaw, lsSetRaw } from '../storage';
import { TAILLE_MAX_CODE } from './codec';
import { chaine, entier, objet } from './schema';

export const ENVOIS_KEY = 'ludaskia_envois';

/** Envois gardés, les plus récents. Un code de bilan complet pèse quelques dizaines de
 *  Ko, dans un stockage d'environ 5 Mo partagé avec les profils des enfants. */
export const MAX_ENVOIS_GARDES = 50;

export interface EnvoiCree {
	/** Identifiant de l'envoi (le même que dans le lien). */
	id: string;
	libelle: string;
	/** Date de création (ms). */
	date: number;
	/** Ce que contient l'envoi, en clair (« Leçon · … · CE2 · 8 questions »). */
	detail: string;
	/** Code du lien, sans le préfixe `#envoi/`. */
	code: string;
}

const DATE_MAX = 8_640_000_000_000_000;

/* Relu champ par champ : la liste vient du stockage, qu'une sauvegarde importée ou une
   main d'adulte peut avoir modifié. */
const schemaEnvoiCree = objet<EnvoiCree>({
	// Un jeton sûr dans un attribut (`data-id`, id de titre) suffit : la liste ne fait que
	// RANGER des envois, c'est leur code qui porte l'identifiant aléatoire du lien.
	id: chaine({ min: 1, max: 40, motif: /^[A-Za-z0-9_-]+$/ }),
	// Texte affiché à l'adulte, échappé à l'affichage : la liste blanche du LIEN (celle qui
	// protège l'enfant) n'a pas à s'appliquer à ce qui reste sur l'appareil de l'encadrant.
	libelle: chaine({ min: 1, max: 200 }),
	date: entier(0, DATE_MAX),
	detail: chaine({ max: 300 }),
	code: chaine({ min: 1, max: TAILLE_MAX_CODE, motif: /^[A-Za-z0-9_-]+$/ }),
});

/** Les envois gardés, plus récent d'abord. Une entrée illisible est oubliée, sans lever. */
export function chargerEnvoisCrees(): EnvoiCree[] {
	const brut: unknown = lsGetRaw(ENVOIS_KEY, []);
	if (!Array.isArray(brut)) return [];
	const envois: EnvoiCree[] = [];
	for (const valeur of brut) {
		try {
			envois.push(schemaEnvoiCree.lire(valeur, 'envoi'));
		} catch {
			// entrée corrompue : oubliée
		}
	}
	return envois.sort((a, b) => b.date - a.date);
}

/* Écrit la liste, puis vérifie qu'elle a bien été écrite : `lsSetRaw` tait un refus du
   stockage (quota), et l'écran doit pouvoir dire que l'envoi n'est pas gardé. */
function ecrire(envois: EnvoiCree[]): boolean {
	try {
		const json = JSON.stringify(envois.map((e) => schemaEnvoiCree.ecrire(e)));
		lsSetRaw(ENVOIS_KEY, json);
		return JSON.stringify(lsGetRaw(ENVOIS_KEY, null)) === json;
	} catch {
		return false;
	}
}

/** Garde un envoi créé. Au-delà de `MAX_ENVOIS_GARDES`, les plus anciens sont oubliés.
 *  `false` si l'envoi est invalide ou si le stockage refuse l'écriture. */
export function garderEnvoiCree(e: EnvoiCree): boolean {
	let lu: EnvoiCree;
	try {
		lu = schemaEnvoiCree.lire(e, 'envoi');
	} catch {
		return false;
	}
	const envois = [lu, ...chargerEnvoisCrees().filter((x) => x.id !== lu.id)]
		.sort((a, b) => b.date - a.date)
		.slice(0, MAX_ENVOIS_GARDES);
	return ecrire(envois);
}

/** Retire un envoi de la liste. Le lien, lui, reste valable : il vit chez ceux qui l'ont. */
export function oublierEnvoiCree(id: string): void {
	const envois = chargerEnvoisCrees();
	const restants = envois.filter((e) => e.id !== id);
	if (restants.length !== envois.length) ecrire(restants);
}
