/* ============================================================
   Décor de saison (#785) : QUELLE saison décorer, et avec QUOI.
   Module pur, sans autre dépendance que `date-locale.ts` (pur lui aussi) : la vitrine
   (index.html) l'importe, et elle ne charge ni profils ni stockage. Le rendu est dans
   `ui/decor-saison.ts`.

   Motifs autorisés pour Noël, liste FERMÉE (critère 11) : flocons, sapin, cadeaux,
   guirlandes, bonnet. Aucun motif religieux. Tout autre motif passe par le mainteneur.
   ============================================================ */
import { DECEMBRE } from './date-locale';

/** Saisons décorées. Noël seulement pour l'instant (#785) ; Halloween et l'été sont
 *  cadrés à part (#786, #787). */
export type Saison = 'noel';

/** Saison à décorer pour une date, lue à l'heure LOCALE de l'appareil (critère 10) :
 *  `'noel'` du 1er au 31 décembre, `null` le reste de l'année. Changer l'horloge de la
 *  tablette change donc le décor : accepté au cadrage, sans enjeu. */
export function saisonDu(date: Date): Saison | null {
	return date.getMonth() === DECEMBRE ? 'noel' : null;
}

/** Un flocon du décor de Noël. Positions et durées FIXES (pas de tirage) : le décor est
 *  le même à chaque visite, et les tests peuvent en vérifier les bornes (critère 12). */
export interface FloconSpec {
	/** Position horizontale, en % de la largeur de la bande (0-100). */
	x: number;
	/** Taille, en px. */
	taille: number;
	/** Durée d'une traversée complète de la bande, en secondes. */
	duree: number;
	/** Avance dans le cycle au chargement (0-1) : délai négatif, pour que les flocons ne
	 *  partent pas tous du haut en même temps. */
	phase: number;
	forme: 'point' | 'cristal';
	/** Opacité au plus visible (0-1). */
	opacite: number;
	/** Amplitude de la dérive horizontale, en px. */
	derive: number;
	/** Rotation fixe du dessin, en degrés. */
	rotation: number;
}

/** Constructeur compact : une ligne par flocon, dans l'ordre des champs de `FloconSpec`. */
const f = (
	x: number,
	taille: number,
	duree: number,
	phase: number,
	forme: FloconSpec['forme'],
	opacite: number,
	derive: number,
	rotation: number,
): FloconSpec => ({ x, taille, duree, phase, forme, opacite, derive, rotation });

/** Les flocons du décor de Noël. Réglages de `designer-ux-enfant` (09/11/2026) :
 *  - 10 flocons, presque toujours tous visibles : l'opacité n'est nulle qu'aux deux
 *    bouts du cycle, d'où « entre 6 et 10 visibles à la fois » (critère 12) ;
 *  - 16 à 24 s par traversée, jamais moins de 15 s (critère 12) ;
 *  - 8 à 18 px, sous la taille des icônes de l'appli (20-24 px) : de la neige, pas un
 *    pictogramme ; cristaux à six branches fines et points ronds, jamais d'étoile ;
 *  - opacités de pic de 0,75 à 1, tenues avec la couleur `--flocon` dans la fourchette
 *    de contraste du critère 15 (gate : `tests/contraste-tokens.test.ts`) ;
 *  - le centre de la bande est laissé un peu plus libre : sur tablette, le logo y est. */
export const FLOCONS: readonly FloconSpec[] = [
	// x %, taille px, durée s, phase, forme, opacité de pic, dérive px, rotation °
	f(5, 11, 16, 0.05, 'cristal', 0.9, 18, 0),
	f(14, 8, 21, 0.55, 'point', 0.8, 12, 0),
	f(24, 18, 18, 0.3, 'cristal', 1, 26, 15),
	f(34, 14, 24, 0.8, 'cristal', 0.85, 22, 30),
	f(43, 8, 17, 0.15, 'point', 0.75, 14, 0),
	f(57, 11, 22, 0.65, 'cristal', 0.9, 20, 45),
	f(66, 14, 19, 0.4, 'point', 0.8, 16, 0),
	f(76, 18, 23, 0.9, 'cristal', 0.95, 30, 10),
	f(86, 11, 16, 0.25, 'point', 0.85, 12, 0),
	f(95, 14, 20, 0.7, 'cristal', 0.9, 24, 25),
];
