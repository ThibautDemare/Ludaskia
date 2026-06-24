/* ============================================================
   Ordre pédagogique des leçons (#208).
   ------------------------------------------------------------
   Pour chaque matière × niveau, l'ORDRE DE DÉCOUVERTE des leçons sur l'année
   scolaire (du plus simple au plus complexe), tel qu'un enseignant le déroulerait.
   La POSITION dans le tableau EST l'ordre — rien à renuméroter, et c'est
   indépendant du découpage en catégories (on entrelace les domaines au fil de
   l'année). C'est une simple liste d'IDs, donc une donnée, pas de la logique.

   Source de vérité UNIQUE, consommée par `core/ordre.ts` :
   - tri d'affichage des leçons d'une catégorie (projection de l'ordre) ;
   - « leçon du jour » (premier pas pas encore acquis, cf. core/lecon-du-jour.ts).

   Ordre LINÉAIRE de découverte seulement : la consolidation/spirale est portée
   par la révision espacée (core/revision.ts), pas par cet ordre.

   INVARIANT : une leçon ABSENTE de la liste de son niveau n'est pas perdue —
   `core/ordre.ts` la relègue en queue, dans l'ordre de déclaration du catalogue.
   Quand on AJOUTE une leçon au catalogue, penser à l'insérer ici au bon endroit
   (sinon elle s'affiche en fin de catégorie et n'apparaît jamais en leçon du jour
   avant les leçons déjà ordonnées). Cf. CONTRIBUTING / docs/ARCHITECTURE.md.

   Ordres validés avec `pedagogue-primaire` (progression du manuel, programme 2025) :
   dépendances honorées en maths (numération → opérations posées, tables →
   multiplicatif, fractions en fin d'année) et en français (présent → futur →
   imparfait → passé composé en dernier, auxiliaires d'abord, participe passé
   avec être tout à la fin).
   ============================================================ */
import type { SchoolLevel, SubjectId } from '../core/catalog';

/* Ordre des leçons par matière puis par niveau. Tous les niveaux ne sont pas
   forcément renseignés (CM1 n'a aujourd'hui qu'une poignée de leçons). */
export const ORDRE_LECONS: Record<SubjectId, Partial<Record<SchoolLevel, string[]>>> = {
	math: {
		ce2: [
			'num-comparer',
			'math-tables-addition',
			'geo-figures-reconnaitre',
			'num-encadrer-intercaler',
			'math-complements',
			'math-doubles',
			'mes-longueurs',
			'math-prob-composition',
			'num-valeur-position',
			'math-moities',
			'math-ajouter-9-19-29',
			'geo-figures-proprietes',
			'num-decompose-100',
			'math-soustraire-9-19-29',
			'calc-addition-posee',
			'mes-lecture-heure',
			'math-prob-transformation',
			'num-decompose-1000',
			'math-moitie-pair',
			'calc-soustraction-posee',
			'math-tables-multiplication',
			'mes-masses',
			'geom-cercle',
			'math-prob-comparaison',
			'math-dizaines-centaines',
			'math-multiplier-10-100',
			'num-situer-10000',
			'math-multiples-25',
			'mes-contenances',
			'geo-solides-reconnaitre',
			'num-decompose-10000',
			'math-multiplier-4-8',
			'math-decomposer-multiplication',
			'calc-multiplication-posee',
			'mes-durees',
			'math-prob-multiplication',
			'geo-solides-proprietes',
			'math-multiplier-20-30-40',
			'math-div-moitie-quart',
			'math-div-partage',
			'mes-monnaie-calcul',
			'geo-angles',
			'math-decompo-60',
			'math-div-reste',
			'math-prob-partage',
			'mes-monnaie-rendu',
			'mes-perimetre-cotes',
			'mes-perimetre-quadrillage',
			'geo-symetrie-axiale',
			'math-prob-deux-etapes',
			'mes-perimetre-formule',
			'num-frac-sens',
			'num-frac-collection',
			'num-frac-bande',
			'num-frac-egalites',
			'num-frac-comparaison',
			'num-frac-addition',
		],
		// Calcul mental CM1 (#241) en plus de « comparer » (combinateur calibré #225) :
		// les multiples de 50 tôt (réinvestit les multiples de 25 du CE2), puis
		// ÷10/÷100 (quotients entiers) une fois la multiplication ×10/×100 consolidée.
		cm1: ['num-comparer', 'math-multiples-50', 'math-diviser-10-100'],
	},
	francais: {
		ce2: [
			'fr-gram-ponctuation',
			'fr-gram-type-phrase',
			'fr-vocab-alpha-initiale',
			'fr-gram-pronom-sujet',
			'fr-mbp',
			'fr-vocab-alpha-deuxieme',
			'fr-gram-accord-sujet-verbe',
			'fr-conj-etre-present',
			'fr-conj-avoir-present',
			'fr-gram-classes',
			'fr-conj-aimer-present',
			'fr-conj-finir-present',
			'fr-vocab-contraires',
			'fr-conj-aller-present',
			'fr-conj-faire-present',
			'fr-accords-reguliers',
			'fr-conj-venir-present',
			'fr-conj-voir-present',
			'fr-vocab-sens-proche',
			'fr-conj-dire-present',
			'fr-conj-pouvoir-present',
			'fr-conj-vouloir-present',
			'fr-conj-prendre-present',
			'fr-conj-naitre-present',
			'fr-homophones-a',
			'fr-conj-etre-futur',
			'fr-conj-avoir-futur',
			'fr-homophones-et',
			'fr-conj-aimer-futur',
			'fr-conj-finir-futur',
			'fr-vocab-sens',
			'fr-conj-aller-futur',
			'fr-conj-faire-futur',
			'fr-homophones-on',
			'fr-conj-venir-futur',
			'fr-conj-voir-futur',
			'fr-conj-dire-futur',
			'fr-homophones-son',
			'fr-conj-pouvoir-futur',
			'fr-conj-vouloir-futur',
			'fr-conj-prendre-futur',
			'fr-conj-naitre-futur',
			'fr-vocab-familles',
			'fr-homophones-ou',
			'fr-conj-etre-imparfait',
			'fr-conj-avoir-imparfait',
			'fr-accords-irreguliers',
			'fr-conj-aimer-imparfait',
			'fr-conj-finir-imparfait',
			'fr-conj-aller-imparfait',
			'fr-conj-faire-imparfait',
			'fr-vocab-champs-mots',
			'fr-conj-venir-imparfait',
			'fr-conj-voir-imparfait',
			'fr-conj-dire-imparfait',
			'fr-conj-pouvoir-imparfait',
			'fr-conj-vouloir-imparfait',
			'fr-conj-prendre-imparfait',
			'fr-conj-naitre-imparfait',
			'fr-vocab-champs-tri',
			'fr-conj-etre-passe_compose',
			'fr-conj-avoir-passe_compose',
			'fr-conj-aimer-passe_compose',
			'fr-conj-finir-passe_compose',
			'fr-conj-aller-passe_compose',
			'fr-conj-faire-passe_compose',
			'fr-conj-venir-passe_compose',
			'fr-conj-voir-passe_compose',
			'fr-conj-dire-passe_compose',
			'fr-conj-pouvoir-passe_compose',
			'fr-conj-vouloir-passe_compose',
			'fr-conj-prendre-passe_compose',
			'fr-conj-naitre-passe_compose',
			'fr-accords-participe-etre',
		],
		// CM1 : les 13 passé composé (seules leçons FR taguées CM1), auxiliaires
		// d'abord puis groupes croissants (verbes en auxiliaire « être » regroupés).
		cm1: [
			'fr-conj-etre-passe_compose',
			'fr-conj-avoir-passe_compose',
			'fr-conj-aimer-passe_compose',
			'fr-conj-finir-passe_compose',
			'fr-conj-aller-passe_compose',
			'fr-conj-venir-passe_compose',
			'fr-conj-faire-passe_compose',
			'fr-conj-voir-passe_compose',
			'fr-conj-dire-passe_compose',
			'fr-conj-pouvoir-passe_compose',
			'fr-conj-vouloir-passe_compose',
			'fr-conj-prendre-passe_compose',
			'fr-conj-naitre-passe_compose',
		],
	},
};
