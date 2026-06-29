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
		// CM1 math : numération « grands nombres » jusqu'au million (#240) ET calcul
		// mental (#241), entrelacés, puis géométrie (#242). Dépendances respectées —
		// numération : comparer → encadrer/intercaler → valeur de position → décompositions
		// (« en rangs » puis multiplicative) → situer ; calcul mental : multiples de 50 tôt
		// (réinvestit les multiples de 25 du CE2) puis ÷10/÷100 (quotients entiers) après
		// ×10/×100 ; géométrie : figures planes AVANT solides, triangles (avec le quelconque
		// en contre-exemple) AVANT quadrilatères, le parallélogramme en DERNIER des planes ;
		// solides : reconnaissance → polyèdre/non-polyèdre (structurant) → comptage de mémoire.
		cm1: [
			'num-comparer',
			'math-multiples-50',
			'num-encadrer-intercaler',
			'num-valeur-position',
			'math-diviser-10-100',
			'num-decompose-10000',
			'num-decompose-multiplicative',
			'num-situer-10000',
			'geo-cm1-triangles',
			'geo-cm1-triangles-prop',
			'geo-cm1-quadrilateres',
			'geo-cm1-solides',
			'geo-cm1-polyedre',
			'geo-cm1-solides-comptage',
		],
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
			// QCM méta « infinitif » : retrouver l'infinitif dès qu'on a conjugué au présent.
			'fr-conj-infinitif',
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
			// QCM méta « simple/composé » : APRÈS le passé composé (notion de temps composé vue).
			'fr-conj-simple-compose',
			'fr-accords-participe-etre',
			// QCM méta « groupe » : posé en FIN de programme CE2 (notion en retrait au cycle 2,
			// signalée « plus dur ») ; au CM1 il arrive tôt, après le présent. #239 suite
			'fr-conj-groupe',
		],
		// CM1 conjugaison (#239) : les 13 verbes du corpus × 4 temps (52 leçons) + 3 QCM
		// « méta ». Progression par TEMPS dans l'ordre des TENSES (présent → futur →
		// imparfait → passé composé) ; à l'intérieur d'un temps, auxiliaires d'abord puis
		// verbes (ordre de déclaration de VERBS, naître en dernier). Les QCM « groupe » et
		// « infinitif » arrivent TÔT (après le bloc présent : on reconnaît un verbe/son
		// groupe dès qu'on a conjugué au présent). Le QCM « simple/composé » vient APRÈS le
		// passé composé (la notion de temps composé y est introduite). Le plus-que-parfait
		// est un attendu CM2 (B.O. 2025), donc HORS périmètre CM1 (différé).
		cm1: [
			// Grammaire — les phrases (#245) : le « type » (3 types, B.O. 2025) puis l'axe
			// FORME (identifier affirmative/négative, puis transformer à la forme négative).
			'fr-gram-type-phrase',
			'fr-gram-forme',
			'fr-gram-transfo-negative',
			// Présent
			'fr-conj-etre-present',
			'fr-conj-avoir-present',
			'fr-conj-aimer-present',
			'fr-conj-finir-present',
			'fr-conj-aller-present',
			'fr-conj-faire-present',
			'fr-conj-venir-present',
			'fr-conj-voir-present',
			'fr-conj-dire-present',
			'fr-conj-pouvoir-present',
			'fr-conj-vouloir-present',
			'fr-conj-prendre-present',
			'fr-conj-naitre-present',
			// QCM méta de classement des verbes (tôt) : groupe puis infinitif.
			'fr-conj-groupe',
			'fr-conj-infinitif',
			// Vocabulaire — les contraires CM1 (#244) : relation binaire franche, vocab
			// transversal sans dépendance forte → placé tôt (comme au CE2). Les contraires
			// AVANT les mots de sens proche (relation plus floue), comme au CE2.
			'fr-vocab-contraires-cm1',
			// Orthographe — accords CM1 (#243) sur mots ISOLÉS : terminaisons d'adjectifs plus
			// subtiles (-er/-ère, -f/-ve, -et/-ète, -eur/-trice, -al/-aux) et noms à pluriel
			// -aux. Travaillé TÔT (compétence cœur du CM1), comme les accords réguliers au CE2.
			// L'accord de TOUT le groupe (fr-accords-groupe-nominal) viendra plus tard (apex).
			'fr-accords-cm1',
			// Futur
			'fr-conj-etre-futur',
			'fr-conj-avoir-futur',
			'fr-conj-aimer-futur',
			'fr-conj-finir-futur',
			'fr-conj-aller-futur',
			'fr-conj-faire-futur',
			'fr-conj-venir-futur',
			'fr-conj-voir-futur',
			'fr-conj-dire-futur',
			'fr-conj-pouvoir-futur',
			'fr-conj-vouloir-futur',
			'fr-conj-prendre-futur',
			'fr-conj-naitre-futur',
			// Vocabulaire — les mots de sens proche CM1 (#244) : synonymie (relation plus
			// fine que les contraires) → après les contraires, dans le fil du milieu d'année.
			'fr-vocab-sens-proche-cm1',
			// Imparfait
			'fr-conj-etre-imparfait',
			'fr-conj-avoir-imparfait',
			'fr-conj-aimer-imparfait',
			'fr-conj-finir-imparfait',
			'fr-conj-aller-imparfait',
			'fr-conj-faire-imparfait',
			'fr-conj-venir-imparfait',
			'fr-conj-voir-imparfait',
			'fr-conj-dire-imparfait',
			'fr-conj-pouvoir-imparfait',
			'fr-conj-vouloir-imparfait',
			'fr-conj-prendre-imparfait',
			'fr-conj-naitre-imparfait',
			// Vocabulaire — morphologie CM1 (#244) : familles de mots (dérivations un cran
			// moins transparentes) PUIS préfixes/suffixes savants (anti-, trans-, bi-, -age,
			// -eur qualité, -iste…). Placés plus tard que les synonymes/contraires : analyse
			// du mot plus exigeante. Familles avant affixes (reconnaître la famille d'abord).
			'fr-vocab-familles-cm1',
			'fr-vocab-affixes-cm1',
			// Passé composé (auxiliaire + participe)
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
			// QCM méta « temps simple / composé » : APRÈS le passé composé (notion introduite).
			'fr-conj-simple-compose',
			// Orthographe — accord de TOUT le groupe nominal (#243) : chaîne d'accord
			// (déterminant + adjectif + nom), APEX de l'accord au CM1, signalé « plus
			// difficile ». Placé tard : il suppose l'accord d'un mot isolé (fr-accords-cm1, plus haut).
			'fr-accords-groupe-nominal',
		],
	},
};
