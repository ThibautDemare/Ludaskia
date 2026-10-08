/* ============================================================
   Séance partagée (#734) — l'ENVOI : l'exercice figé que l'encadrant transmet.

   Les items sont TIRÉS une fois, à la création, et voyagent tels quels dans le
   lien (critères 2 et 3) : ni graine ni identifiant de banque. Mesure du cadrage :
   53 des 84 fichiers de `src/data/` modifiés en 90 jours — une graine ferait
   dériver la série entre l'envoi et le passage.

   Un envoi n'a AUCUNE date limite ni compteur (critère 34).
   ============================================================ */
import type { Exercise, ExerciseMode } from '../exercise';
import type { SchoolLevel } from '../catalog';
import { decoder, encoder, type Decodage } from './codec';
import { facultatif, liste, objet, parmi, refuser, tuple, union, type Schema } from './schema';
import { schemaExercice } from './exercices';
import {
	apresVerbe,
	avantVerbe,
	commeDans,
	identifiant,
	idLecon,
	idMode,
	libelle,
	motDictee,
	niveauScolaire,
	NOMBRE_MAX_MOTS,
} from './textes';

/** Une série d'exercices d'UNE leçon, jouée dans UN mode. */
export interface BlocEnvoi {
	lecon: string;
	/** Mode retenu par l'encadrant. Absent : mode par défaut de la leçon. */
	mode?: ExerciseMode;
	exercices: Exercise[];
}

/** Une cible de dictée : le mot à écrire et ce qui l'accompagne à l'écran et à l'oral.
 *  Matérialisée à la création — un verbe d'une liste personnalisée arrive donc ici
 *  déjà conjugué, avec sa phrase à trou (`contexte`). */
export interface MotDictee {
	mot: string;
	commeDans?: string;
	contexte?: { avant: string; apres: string };
}

interface EnvoiCommun {
	/** Identifiant ALÉATOIRE de l'envoi (cf. `nouvelIdentifiant`). Sert au premier
	 *  passage figé (un passage par couple envoi × profil) et au regroupement futur
	 *  (#735). Ne dit rien de l'encadrant ni de l'appareil. */
	id: string;
	/** Libellé choisi par l'encadrant, affiché à l'enfant (liste blanche, critère 39). */
	libelle: string;
}

export type Envoi =
	/** Une leçon dans un mode : un seul bloc. */
	| (EnvoiCommun & { nature: 'lecon'; niveau: SchoolLevel; blocs: [BlocEnvoi] })
	/** Un bilan : un bloc par leçon. */
	| (EnvoiCommun & {
			nature: 'bilan';
			variante: 'express' | 'complet';
			niveau: SchoolLevel;
			blocs: BlocEnvoi[];
	  })
	/** Une dictée, prédéfinie (niveau connu) ou tirée d'une liste personnalisée (pas de niveau). */
	| (EnvoiCommun & { nature: 'dictee'; niveau?: SchoolLevel; mots: MotDictee[] });

/** Nombre d'items d'un envoi : ce que l'enfant aura à faire, et la longueur attendue du résultat. */
export function nombreItems(envoi: Envoi): number {
	return envoi.nature === 'dictee'
		? envoi.mots.length
		: envoi.blocs.reduce((n, b) => n + b.exercices.length, 0);
}

/* ---------- Schéma ---------- */

/** Plafonds d'un envoi : de quoi composer un bilan complet de catégorie, pas davantage.
 *  Au-delà, le lien deviendrait trop long pour être collé dans un message, et la
 *  séance trop longue pour un enfant. */
export const MAX_EXERCICES_PAR_BLOC = 40;
export const MAX_BLOCS = 30;
export const MAX_ITEMS = 300;

const bloc = objet<BlocEnvoi>({
	lecon: idLecon,
	mode: facultatif(idMode),
	exercices: liste(schemaExercice, { min: 1, max: MAX_EXERCICES_PAR_BLOC }),
});

const mot = objet<MotDictee>({
	mot: motDictee,
	commeDans: facultatif(commeDans),
	contexte: facultatif(objet({ avant: avantVerbe, apres: apresVerbe })),
});

type Nature<N extends Envoi['nature']> = Extract<Envoi, { nature: N }>;

const schemaEnvoi: Schema<Envoi> = union<'nature', Envoi>('nature', {
	lecon: objet<Nature<'lecon'>>({
		id: identifiant,
		libelle,
		nature: parmi('lecon'),
		niveau: niveauScolaire,
		blocs: tuple<[BlocEnvoi]>(bloc),
	}),
	bilan: objet<Nature<'bilan'>>(
		{
			id: identifiant,
			libelle,
			nature: parmi('bilan'),
			variante: parmi('express', 'complet'),
			niveau: niveauScolaire,
			blocs: liste(bloc, { min: 1, max: MAX_BLOCS }),
		},
		(e, chemin) => {
			if (nombreItems(e) > MAX_ITEMS) refuser(chemin, "trop d'items");
		},
	),
	dictee: objet<Nature<'dictee'>>({
		id: identifiant,
		libelle,
		nature: parmi('dictee'),
		niveau: facultatif(niveauScolaire),
		mots: liste(mot, { min: 1, max: NOMBRE_MAX_MOTS }),
	}),
});

/** Forme JSON d'un envoi, telle qu'elle voyage : figures et vues riches en RECETTE.
 *  C'est elle que comparent les liens de référence (critère 36) — un changement de
 *  dessin d'une figure ne doit pas faire croire qu'un ancien lien a changé de contenu.
 *  Lève si l'envoi porte un champ ou un fragment qui ne peut pas voyager. */
export function envoiEnJson(envoi: Envoi): unknown {
	return schemaEnvoi.ecrire(envoi);
}

/** Encode un envoi composé par l'application. Lève comme `envoiEnJson` : mieux vaut un
 *  échec chez l'encadrant qu'une séance différente chez l'enfant. */
export async function encoderEnvoi(envoi: Envoi): Promise<string> {
	return encoder('envoi', envoiEnJson(envoi));
}

export async function decoderEnvoi(code: string): Promise<Decodage<Envoi>> {
	const brut = await decoder('envoi', code);
	if (!brut.ok) return brut;
	try {
		return { ok: true, valeur: schemaEnvoi.lire(brut.valeur, '') };
	} catch {
		return { ok: false, raison: 'schema' };
	}
}
