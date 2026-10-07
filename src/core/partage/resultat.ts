/* ============================================================
   Séance partagée (#734) — le RÉSULTAT : ce que l'enfant renvoie à l'encadrant.

   Il ne contient AUCUNE donnée de profil autre que le prénom ou pseudo saisi
   (critère 31) : ni UUID, ni historique, ni niveau du profil. Son identifiant est
   aléatoire et propre à ce résultat — il sert au dédoublonnage d'un import
   (critère 22), pas à reconnaître un enfant d'un envoi à l'autre.

   Tout y est du TEXTE déjà lisible (énoncé, saisie, attendu) : la vue de lecture
   l'affiche échappé, sans rien rejouer.
   ============================================================ */
import type { ExerciseMode } from '../exercise';
import type { SchoolLevel } from '../catalog';
import { decoder, encoder, type Decodage } from './codec';
import { chaine, entier, facultatif, liste, objet, parmi } from './schema';
import { identifiant, idLeconResultat, idMode, libelle, niveauScolaire, pseudo } from './textes';
import { MAX_ITEMS } from './envoi';

/** Statut d'un item. « Je ne sais pas » (`jnsp`) et « sans réponse » (`vide`) sont
 *  distincts d'une réponse fausse (critère 9) : l'encadrant ne lit pas la même chose
 *  dans un renoncement et dans une erreur. */
export type StatutReponse = 'juste' | 'faux' | 'jnsp' | 'vide';

export interface ReponseItem {
	lecon: string;
	mode?: ExerciseMode;
	/** Énoncé lisible hors de l'application (même forme que le journal d'erreurs). */
	enonce: string;
	/** Réponse saisie, déjà mise en forme. Vide pour `jnsp` et `vide`. */
	saisie: string;
	/** Réponse attendue, déjà mise en forme. */
	attendue: string;
	statut: StatutReponse;
}

export interface Resultat {
	/** Identifiant ALÉATOIRE, propre à ce résultat. */
	id: string;
	/** Rappel de l'envoi joué : de quoi titrer la vue sans l'envoi sous la main. */
	envoi: { id: string; libelle: string; niveau?: SchoolLevel };
	/** Prénom ou pseudo saisi par l'enfant à la fin (liste blanche, critère 39). */
	pseudo: string;
	/** Date de fin du passage (ms depuis l'époque Unix). */
	date: number;
	reponses: ReponseItem[];
}

/* ---------- Schéma ---------- */

/** Une date affichable : le plus grand horodatage qu'un `Date` sait représenter. */
const DATE_MAX = 8_640_000_000_000_000;

/** Plafonds des textes d'une réponse. `figerResultat` y ramène ce que le runner lui
 *  donne (`borner`) : le lien d'un enfant qui a fini sa séance doit toujours s'encoder. */
export const LONGUEUR_MAX_ENONCE = 1500;
export const LONGUEUR_MAX_REPONSE = 500;

const reponse = objet<ReponseItem>({
	lecon: idLeconResultat,
	mode: facultatif(idMode),
	enonce: chaine({ max: LONGUEUR_MAX_ENONCE }),
	saisie: chaine({ max: LONGUEUR_MAX_REPONSE }),
	attendue: chaine({ max: LONGUEUR_MAX_REPONSE }),
	statut: parmi('juste', 'faux', 'jnsp', 'vide'),
});

const schemaResultat = objet<Resultat>({
	id: identifiant,
	// Le libellé repasse par sa liste blanche : un lien de résultat se forge aussi bien
	// qu'un envoi, et ce libellé titre la vue de l'encadrant.
	envoi: objet({ id: identifiant, libelle, niveau: facultatif(niveauScolaire) }),
	pseudo,
	date: entier(0, DATE_MAX),
	reponses: liste(reponse, { max: MAX_ITEMS }),
});

export async function encoderResultat(resultat: Resultat): Promise<string> {
	return encoder('resultat', schemaResultat.ecrire(resultat));
}

export async function decoderResultat(code: string): Promise<Decodage<Resultat>> {
	const brut = await decoder('resultat', code);
	if (!brut.ok) return brut;
	try {
		return { ok: true, valeur: schemaResultat.lire(brut.valeur, '') };
	} catch {
		return { ok: false, raison: 'schema' };
	}
}

/** Score « x sur y » de la vue de lecture (critère 18) : x = items `juste`, y = tous
 *  les items. Ni pourcentage ni note (critère 33). */
export function score(resultat: Resultat): { justes: number; total: number } {
	return {
		justes: resultat.reponses.filter((r) => r.statut === 'juste').length,
		total: resultat.reponses.length,
	};
}
