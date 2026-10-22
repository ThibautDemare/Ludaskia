/* ============================================================
   Forme IMPRIMÉE de chaque format d'exercice (#777, critère 23).

   Le papier n'a ni widget ni geste : chaque format de l'union `Exercise` y est replié en
   une question écrite (`itemDepuisExercice`, core/catalog.ts) puis rendu par `renderItem`
   en mode impression (core/items.ts). Cette table dit, format par format, ce que la feuille
   montre, pour qu'aucun format n'arrive sur papier sans que quelqu'un ait décidé comment.

   Deux verrous, sur le modèle de la table de couverture du journal (`e2e/journal-couverture.ts`,
   #581) :
   - le `Record` sur l'union fait échouer `npm run typecheck` dès qu'un `type` d'exercice est
     ajouté sans entrée ici ;
   - `tests/impression-couverture.test.ts` vérifie à l'exécution que chaque format que le
     catalogue produit vraiment a une entrée, à forme non vide.
   Ce que la table ne prouve pas, et que tiennent les gates de `tests/impression-gate.test.ts`
   (critères 19 à 22) : que la forme décrite est bien celle qui s'imprime.

   Module pur, sans import d'exécution : il ne fait que décrire.
   ============================================================ */
import type { Exercise } from './exercise';

/** Forme imprimée d'un format : une phrase, pour un lecteur humain. */
export interface FormeImprimee {
	forme: string;
}

/** Formats de l'atelier d'orthographe : ils ne viennent d'aucune leçon du catalogue. */
const HORS_CATALOGUE =
	"Format de l'atelier d'orthographe, hors catalogue : aucune fiche ni aucun bilan ne l'imprime.";

export const FORMES_IMPRIMEES: Record<Exercise['type'], FormeImprimee> = {
	text: {
		forme:
			"L'énoncé, avec une case à remplir à la place du trou (ou une ligne d'écriture en fin d'énoncé) ; le corrigé y écrit la réponse.",
	},
	qcm: {
		forme:
			"La question, puis chacun de ses choix précédé d'une case à cocher ; le trou d'un QCM à trou devient un rectangle vide, et le corrigé coche la bonne case.",
	},
	qcmMulti: {
		forme:
			"Une seule proposition, posée en « Vrai ou faux ? » avec une ligne d'écriture ; le corrigé y écrit Vrai ou Faux.",
	},
	tuilesNombre: {
		forme:
			"L'énoncé avec une case à remplir à la place du trou : les tuiles ne s'impriment pas, le nombre s'écrit.",
	},
	tuilesOrdre: {
		forme: 'Les éléments mélangés entre parenthèses, puis une ligne où écrire la suite rangée.',
	},
	tuilesTri: {
		forme: 'Un mot tiré au sort et les deux thèmes, puis une ligne où écrire le thème.',
	},
	appariement: {
		forme:
			"Une paire de la manche devient une question à choix en cases à cocher : la nature d'un mot désigné de son groupe (étiquettes en choix), ou le mot de la même famille (colonne de droite en choix).",
	},
	clicMot: {
		forme: 'La phrase citée entre guillemets, puis une ligne où recopier le ou les mots demandés.',
	},
	droiteGraduee: {
		forme: 'La droite graduée avec le repère déjà posé, puis une ligne où écrire le nombre repéré.',
	},
	posed: {
		forme:
			"L'opération posée en colonnes, cases du résultat vides ; le corrigé remplit chaque chiffre.",
	},
	tableauConversion: {
		forme:
			"Jamais imprimé en tableau : l'impression tire le mode par défaut de la leçon, une conversion à écrire sur une ligne.",
	},
	probleme: {
		forme:
			"L'énoncé du problème et sa question finale en gras, puis une ligne d'écriture ; seule la réponse finale est demandée.",
	},
	motCache: { forme: HORS_CATALOGUE },
	tuiles: { forme: HORS_CATALOGUE },
	dictee: { forme: HORS_CATALOGUE },
};
