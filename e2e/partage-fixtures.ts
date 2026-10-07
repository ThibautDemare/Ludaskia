/* ============================================================
   Fabrique des liens de la séance partagée (#734), côté Node.

   L'écran qui compose un envoi n'existe pas dans ce lot : la spec construit donc
   ses envois ici, avec LE VRAI encodeur (`encoderEnvoi`) et LE VRAI décodeur de
   résultat (`decoderResultat`). Dérogation assumée à « pas d'import de `src/` dans
   une spec » (comme `journal-couverture.ts`) : un lien fabriqué à la main
   dériverait du format réel, et la spec testerait alors son propre format.

   Le fichier n'est pas une spec : aucun `expect`, rien de `@playwright/test`.
   ============================================================ */
import type { Exercise } from '../src/core/exercise';
import { encoderEnvoi, type BlocEnvoi, type Envoi } from '../src/core/partage/envoi';
import { decoderResultat } from '../src/core/partage/resultat';
import { getLessonById } from '../src/core/catalog';
import { labelLecon } from '../src/core/levels';
import { nouvelIdentifiant } from '../src/core/partage/liens';

export { decoderResultat };

/* Deux leçons RÉELLES dont le mode par défaut se joue en fiche de saisie. */
export const LECON_A = 'fr-conj-etre-present';
export const LECON_B = 'fr-conj-avoir-present';

/** Titre d'une leçon tel que l'écran le présente au niveau CE2 (celui du profil e2e). */
export function titreLecon(id: string): string {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon inconnue : ${id}`);
	return labelLecon(l, 'ce2');
}

const texte = (question: string, answer: string) => ({ type: 'text' as const, question, answer });

/** Cinq questions : tout le monde a la même fiche, quel que soit le tirage. */
export const EXERCICES_FICHE = [
	texte('je @ (chanter)', 'chante'),
	texte('tu @ (danser)', 'danses'),
	texte('il @ (manger)', 'mange'),
	texte('nous @ (jouer)', 'jouons'),
	texte('elles @ (rire)', 'rient'),
];

export const LIBELLE_FICHE = 'Fiche du lundi';
export const LIBELLE_BILAN = 'Bilan de la semaine';

export function envoiFiche(over: { id?: string; exercices?: Exercise[] } = {}): Envoi {
	return {
		id: over.id ?? nouvelIdentifiant(),
		libelle: LIBELLE_FICHE,
		nature: 'lecon',
		niveau: 'ce2',
		blocs: [{ lecon: LECON_A, exercices: over.exercices ?? EXERCICES_FICHE }],
	};
}

/** Un bilan à deux leçons, deux questions chacune. */
export function envoiBilan(): Envoi {
	return {
		id: nouvelIdentifiant(),
		libelle: LIBELLE_BILAN,
		nature: 'bilan',
		variante: 'express',
		niveau: 'ce2',
		blocs: [
			{
				lecon: LECON_A,
				exercices: [texte('je @ (chanter)', 'chante'), texte('tu @ (danser)', 'danses')],
			},
			{
				lecon: LECON_B,
				exercices: [texte('il @ (manger)', 'mange'), texte('nous @ (jouer)', 'jouons')],
			},
		],
	};
}

export async function codeDe(envoi: Envoi): Promise<string> {
	return encoderEnvoi(envoi);
}

/** Les quatre altérations visées par le critère 29. */
export type Alteration = 'caractere' | 'tronque' | 'version' | 'controle';

export function alterer(code: string, quoi: Alteration): string {
	if (quoi === 'tronque') return code.slice(0, Math.floor(code.length / 2));
	if (quoi === 'caractere') {
		const i = Math.floor(code.length / 2);
		const autre = code[i] === 'A' ? 'B' : 'A';
		return code.slice(0, i) + autre + code.slice(i + 1);
	}
	const octets = Buffer.from(code, 'base64url');
	if (quoi === 'version') octets[0] = 99;
	else octets[2] ^= 0xff; // somme de contrôle : le contenu, lui, reste intact
	return octets.toString('base64url');
}

/** Un bilan sur des blocs écrits à la main. */
export function envoiBilanDe(blocs: BlocEnvoi[]): Envoi {
	return {
		id: nouvelIdentifiant(),
		libelle: LIBELLE_BILAN,
		nature: 'bilan',
		variante: 'express',
		niveau: 'ce2',
		blocs,
	};
}

/** Une fiche sur une leçon et des exercices donnés. */
export function envoiFicheDe(lecon: string, exercices: Exercise[]): Envoi {
	return {
		id: nouvelIdentifiant(),
		libelle: LIBELLE_FICHE,
		nature: 'lecon',
		niveau: 'ce2',
		blocs: [{ lecon, exercices }],
	};
}
