/* ============================================================
   Proportionnalité CM1 (#258) — deux leçons, sur des moteurs EXISTANTS.
   ------------------------------------------------------------
   Le programme CM1 (docs/reference/programmes/cm1-maths.md, §5) fixe deux objectifs :
   IDENTIFIER une situation de proportionnalité et RÉSOUDRE un problème de
   proportionnalité. Deux leçons séparées, sans nouveau runner ni nouveau `type`
   d'`Exercise` :
   - A « Est-ce proportionnel ? » : QCM Oui/Non sur une banque de situations ;
   - B « Problèmes de proportionnalité » : runner « problème », une sous-question.

   AUCUN TABLEAU DE PROPORTIONNALITÉ, ni à remplir ni à lire (refus écrit, critère 10 de
   l'issue) : sur une grille, l'enfant complète en répétant l'écart entre les nombres
   visibles, sans relier les grandeurs. Ici, le raisonnement porte sur des quantités
   nommées (« 4 cahiers », « 10 € »), jamais sur des lignes ou des colonnes.

   ── Leçon A : anti-piège mots-clés (même discipline que problemes.ts) ──────────
   Les mots de liaison qu'un lecteur pressé prendrait pour un signal (« chaque »,
   « chacun », « identiques », « même », « de plus », « au début ») apparaissent DES DEUX
   CÔTÉS ; « d'abord », « puis », « ensuite », « en supplément » n'apparaissent nulle part.
   Les mots de CONTENU sont croisés aussi, pour qu'aucun ne devienne un indice : « carré »
   (périmètre Oui / aire Non), « aire » (rectangle de largeur fixe Oui / carré Non), « taxi »,
   « piscine », « tirelire », « canoë », « cookies », « cinéma », « baguettes », « pommes »
   (une version Oui, une version Non). Les non proportionnelles sont les situations
   TYPIQUES du programme : part fixe, âge et taille, aire du carré — plus l'écart constant
   (âges de deux enfants), le prix dégressif, la grandeur qui ne bouge pas et le partage.
   Chaque famille est d'un seul côté (Oui ou Non), et c'est le TYPE qui le garantit :
   `oui()` n'accepte qu'une famille proportionnelle, `non()` qu'une famille qui ne l'est pas.

   ── Leçon B : procédures visées ──────────────────────────────────────────────────
   Linéarité MULTIPLICATIVE (un couple connu, rapport entier ×k ou ÷k) et linéarité
   ADDITIVE (deux couples connus, quantité demandée = leur somme ou leur différence
   exacte), jamais combinées (les procédures mixtes relèvent du CM2). Garde-fous :
   - k de 3 à 10, JAMAIS 2 : sur un ×2, l'addition répétée fausse (v + v) et la
     multiplication juste donnent le même nombre (critère 6) ;
   - valeur ≠ quantité dans chaque couple : sinon l'erreur additive classique (« reporter
     l'écart entre les quantités ») tombe juste ;
   - aucune quantité ne vaut 1 : la valeur unitaire n'est ni donnée ni demandée, le passage
     par l'unité (CM2) n'est ni requis ni suggéré. La valeur unitaire est d'ailleurs souvent
     décimale (4 cahiers pour 10 €) : la linéarité est la voie la plus courte ;
   - additif : la quantité demandée n'est ni le double ni la moitié d'une quantité connue,
     et, par choix, ni un multiple ni un diviseur entier d'une quantité connue — sinon un
     rapport entier contourne la procédure additive visée (point soumis au pédagogue).

   INVARIANT PROJET : les réponses sont CALCULÉES puis STOCKÉES à la construction (par la
   procédure annoncée pour B), jamais recalculées au `check`. Aucun aléa à l'import : les
   deux banques sont des listes figées, dans un ordre fixe.
   ============================================================ */
import type {
	CalculEtape,
	Exercise,
	ExerciseType,
	GenerateOpts,
	ModeOption,
	UniteEtape,
} from '../../core/exercise';
import { checkAnswer } from '../../core/exercise';
import type { SchoolLevel } from '../../core/catalog';
import { bankByLevel, pickFromBank } from '../../core/level-combinators';
import { formatEuros } from '../../core/nombres';
import { etayageRedige, MODE_QCM_POINT } from '../_shared';
import type { LessonInput } from '../_shared';

const NIVEAUX: SchoolLevel[] = ['cm1'];

const OUI = 'Oui';
const NON = 'Non';

/* ---------- Lecture à voix haute des unités ----------
   Le moteur de lecture ne sait pas lire seuls « g », « L », « m » (lettres ambiguës, cf.
   core/tts-text.ts) : le texte PARLÉ les écrit en toutes lettres. Ancré sur le chiffre qui
   précède, donc sans risque sur un mot (« 2 mois » reste « 2 mois »). Toutes les mesures
   des deux banques valent au moins 2 : le pluriel est toujours juste. */
const UNITES_ORALES: Record<string, string> = {
	'cm²': 'centimètres carrés',
	kg: 'kilogrammes',
	km: 'kilomètres',
	cm: 'centimètres',
	g: 'grammes',
	L: 'litres',
	m: 'mètres',
};

function texteOral(texte: string): string {
	return texte.replace(
		/(\d) (cm²|kg|km|cm|g|L|m)(?![\p{L}\d²])/gu,
		(_tout: string, chiffre: string, unite: string) =>
			`${chiffre} ${UNITES_ORALES[unite] ?? unite}`,
	);
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/* ============================================================
   Leçon A — « Est-ce proportionnel ? » (identifier)
   ============================================================ */

/* Familles de situations PROPORTIONNELLES. */
export type FamilleOui =
	| 'prix-quantite' // prix constant par objet, par kilo, par mètre
	| 'tarif-sans-part-fixe' // tarif à la durée ou à la distance, rien d'autre à payer
	| 'recette' // ingrédients selon le nombre de personnes, de crêpes…
	| 'contenants-identiques' // œufs par boîte, chaises par rangée…
	| 'conversion' // heures et minutes, semaines et jours…
	| 'perimetre-carre' // le tour d'un carré
	| 'aire-rectangle' // rectangles de même largeur : l'aire suit la longueur
	| 'objets-identiques'; // masse, longueur ou hauteur de n objets pareils

/* Familles de situations NON proportionnelles. */
export type FamilleNon =
	| 'part-fixe' // prise en charge, inscription, somme de départ…
	| 'age-taille' // la croissance n'est pas proportionnelle à l'âge
	| 'aire-carre' // côté doublé, aire quadruplée
	| 'ecart-constant' // âges de deux personnes : l'écart reste, le rapport change
	| 'prix-degressif' // lot, promotion : le gros paquet revient moins cher
	| 'grandeur-constante' // une grandeur qui ne bouge pas quand l'autre change
	| 'partage'; // plus on est nombreux, plus la part est petite

export type FamilleIdentifier = FamilleOui | FamilleNon;

/* Item de banque tagué par niveau (contrat de `bankByLevel`). `proportionnel` est la
   réponse STOCKÉE ; `question` nomme les deux grandeurs en jeu ; `explication` est le
   retour affiché APRÈS la réponse (le test du double, ou ce qui le met en défaut). */
export interface ItemIdentifier {
	situation: string;
	question: string;
	proportionnel: boolean;
	famille: FamilleIdentifier;
	explication: string;
	levels: SchoolLevel[];
}

function oui(
	famille: FamilleOui,
	situation: string,
	question: string,
	explication: string,
): ItemIdentifier {
	return { situation, question, proportionnel: true, famille, explication, levels: NIVEAUX };
}

function non(
	famille: FamilleNon,
	situation: string,
	question: string,
	explication: string,
): ItemIdentifier {
	return { situation, question, proportionnel: false, famille, explication, levels: NIVEAUX };
}

/* Questions récurrentes (formulation identique d'une situation à l'autre). */
const Q_PRIX_PAYE = (de: string): string => `Le prix payé est-il proportionnel ${de} ?`;
const Q_PRIX = (de: string): string => `Le prix est-il proportionnel ${de} ?`;
const Q_COURSE = 'Le prix de la course est-il proportionnel au nombre de kilomètres ?';
const Q_AIRE_CARRE = "L'aire du carré est-elle proportionnelle à la longueur de son côté ?";
const Q_PERIMETRE_CARRE = 'Le périmètre du carré est-il proportionnel à la longueur de son côté ?';
const Q_TIRELIRE = 'La somme dans la tirelire est-elle proportionnelle au nombre de semaines ?';

const SITUATIONS_OUI: ItemIdentifier[] = [
	// --- prix constant ---
	oui(
		'prix-quantite',
		'Au marché, les tomates coûtent 3 € le kilo.',
		Q_PRIX_PAYE('à la masse de tomates'),
		'Pour 2 fois plus de tomates, on paie 2 fois plus : 2 kg coûtent 6 €, et 4 kg coûtent 12 €.',
	),
	oui(
		'prix-quantite',
		'À la boulangerie, chaque croissant coûte 2 €.',
		Q_PRIX_PAYE('au nombre de croissants'),
		'3 croissants coûtent 6 €, et 6 croissants coûtent 12 € : 2 fois plus de croissants, 2 fois plus cher.',
	),
	oui(
		'prix-quantite',
		'À la papeterie, les stylos coûtent 2 € chacun.',
		Q_PRIX_PAYE('au nombre de stylos'),
		'5 stylos coûtent 10 €, et 10 stylos coûtent 20 € : 2 fois plus de stylos, 2 fois plus cher.',
	),
	oui(
		'prix-quantite',
		'À la boulangerie, 4 baguettes coûtent 6 € et 8 baguettes coûtent 12 €.',
		Q_PRIX('au nombre de baguettes'),
		"8 baguettes, c'est 2 fois plus que 4 baguettes, et 12 €, c'est bien 2 fois 6 €.",
	),
	oui(
		'prix-quantite',
		'Au cinéma, 2 places coûtent 14 € et 6 places coûtent 42 €.',
		Q_PRIX('au nombre de places'),
		"6 places, c'est 3 fois plus que 2 places, et 42 €, c'est bien 3 fois 14 €.",
	),
	oui(
		'prix-quantite',
		'Au marché, 2 kg de pommes coûtent 5 € et 6 kg coûtent 15 €.',
		Q_PRIX('à la masse de pommes'),
		"6 kg, c'est 3 fois plus que 2 kg, et 15 €, c'est bien 3 fois 5 €.",
	),
	oui(
		'prix-quantite',
		'Au magasin, le tissu se vend 5 € le mètre.',
		Q_PRIX_PAYE('à la longueur de tissu'),
		'2 m coûtent 10 €, et 4 m coûtent 20 € : 2 fois plus de tissu, 2 fois plus cher.',
	),
	oui(
		'prix-quantite',
		'Tous les cahiers du rayon ont le même prix : 3 €.',
		Q_PRIX_PAYE('au nombre de cahiers'),
		'4 cahiers coûtent 12 €, et 8 cahiers coûtent 24 € : 2 fois plus de cahiers, 2 fois plus cher.',
	),
	// --- tarif sans part fixe ---
	oui(
		'tarif-sans-part-fixe',
		'Nina garde des enfants. Elle gagne 9 € par heure.',
		"La somme gagnée est-elle proportionnelle au nombre d'heures ?",
		"En 2 heures, Nina gagne 18 € ; en 4 heures, elle gagne 36 € : 2 fois plus d'heures, 2 fois plus d'argent.",
	),
	oui(
		'tarif-sans-part-fixe',
		'Le taxi de Paul fait payer 2 € pour chaque kilomètre parcouru.',
		Q_COURSE,
		'5 km coûtent 10 €, et 10 km coûtent 20 € : 2 fois plus de kilomètres, 2 fois plus cher.',
	),
	oui(
		'tarif-sans-part-fixe',
		'À la piscine, chaque entrée coûte 3 €.',
		Q_PRIX_PAYE("au nombre d'entrées"),
		"4 entrées coûtent 12 €, et 8 entrées coûtent 24 € : 2 fois plus d'entrées, 2 fois plus cher.",
	),
	oui(
		'tarif-sans-part-fixe',
		"Au lac, la location d'un canoë coûte 6 € par heure.",
		"Le prix de la location est-il proportionnel au nombre d'heures ?",
		"2 heures coûtent 12 €, et 4 heures coûtent 24 € : 2 fois plus d'heures, 2 fois plus cher.",
	),
	oui(
		'tarif-sans-part-fixe',
		'Au début, la tirelire de Léa était vide. Chaque semaine, elle y met 5 € de plus.',
		Q_TIRELIRE,
		"Après 2 semaines, il y a 10 € ; après 4 semaines, il y a 20 € : 2 fois plus de semaines, 2 fois plus d'argent.",
	),
	oui(
		'tarif-sans-part-fixe',
		'Au club de danse, chaque cours coûte 6 €.',
		Q_PRIX_PAYE('au nombre de cours'),
		'3 cours coûtent 18 €, et 6 cours coûtent 36 € : 2 fois plus de cours, 2 fois plus cher.',
	),
	// --- recettes ---
	oui(
		'recette',
		'Une recette de gâteau pour 4 personnes demande 200 g de chocolat. Pour 8 personnes, on en prend 400 g.',
		'La masse de chocolat est-elle proportionnelle au nombre de personnes ?',
		"8 personnes, c'est 2 fois plus que 4 personnes, et 400 g, c'est bien 2 fois 200 g.",
	),
	oui(
		'recette',
		'Pour une soupe, on compte 2 carottes par personne.',
		'Le nombre de carottes est-il proportionnel au nombre de personnes ?',
		'Pour 3 personnes, il faut 6 carottes ; pour 6 personnes, 12 carottes : 2 fois plus de personnes, 2 fois plus de carottes.',
	),
	oui(
		'recette',
		"Pour que sa limonade ait toujours le même goût, Zoé met 3 citrons dans 2 litres d'eau.",
		"Le nombre de citrons est-il proportionnel à la quantité d'eau ?",
		"Pour 4 litres d'eau, il faut 6 citrons : 2 fois plus d'eau, 2 fois plus de citrons.",
	),
	oui(
		'recette',
		'Pour une pâte à pizza, il faut 300 g de farine pour 2 pizzas identiques.',
		'La masse de farine est-elle proportionnelle au nombre de pizzas ?',
		'Pour 4 pizzas, il faut 600 g de farine : 2 fois plus de pizzas, 2 fois plus de farine.',
	),
	oui(
		'recette',
		'Pour faire 20 cookies, Maé utilise 200 g de chocolat.',
		'La masse de chocolat est-elle proportionnelle au nombre de cookies ?',
		'Pour 40 cookies, il faut 400 g de chocolat : 2 fois plus de cookies, 2 fois plus de chocolat.',
	),
	// --- contenants identiques ---
	oui(
		'contenants-identiques',
		'Les œufs sont vendus en boîtes de 6.',
		"Le nombre d'œufs est-il proportionnel au nombre de boîtes ?",
		"2 boîtes contiennent 12 œufs, et 4 boîtes contiennent 24 œufs : 2 fois plus de boîtes, 2 fois plus d'œufs.",
	),
	oui(
		'contenants-identiques',
		'Dans la salle de spectacle, chaque rangée compte 12 chaises.',
		'Le nombre de chaises est-il proportionnel au nombre de rangées ?',
		'3 rangées comptent 36 chaises, et 6 rangées comptent 72 chaises : 2 fois plus de rangées, 2 fois plus de chaises.',
	),
	oui(
		'contenants-identiques',
		"Chaque pochette d'images contient 5 images.",
		"Le nombre d'images est-il proportionnel au nombre de pochettes ?",
		"4 pochettes contiennent 20 images, et 8 pochettes en contiennent 40 : 2 fois plus de pochettes, 2 fois plus d'images.",
	),
	oui(
		'contenants-identiques',
		'Les feutres sont rangés dans des boîtes identiques de 10 feutres.',
		'Le nombre de feutres est-il proportionnel au nombre de boîtes ?',
		'3 boîtes contiennent 30 feutres, et 6 boîtes en contiennent 60 : 2 fois plus de boîtes, 2 fois plus de feutres.',
	),
	oui(
		'contenants-identiques',
		'Les chaussettes sont vendues par paires.',
		'Le nombre de chaussettes est-il proportionnel au nombre de paires ?',
		'3 paires, ce sont 6 chaussettes ; 6 paires, ce sont 12 chaussettes : 2 fois plus de paires, 2 fois plus de chaussettes.',
	),
	oui(
		'contenants-identiques',
		'Pour le concert, chaque musicien reçoit 3 partitions.',
		'Le nombre de partitions est-il proportionnel au nombre de musiciens ?',
		'4 musiciens reçoivent 12 partitions, et 8 musiciens en reçoivent 24 : 2 fois plus de musiciens, 2 fois plus de partitions.',
	),
	// --- conversions ---
	oui(
		'conversion',
		'Une heure dure 60 minutes.',
		"Le nombre de minutes est-il proportionnel au nombre d'heures ?",
		"2 heures, ce sont 120 minutes ; 4 heures, ce sont 240 minutes : 2 fois plus d'heures, 2 fois plus de minutes.",
	),
	oui(
		'conversion',
		'Une semaine compte 7 jours.',
		'Le nombre de jours est-il proportionnel au nombre de semaines ?',
		'2 semaines, ce sont 14 jours ; 4 semaines, ce sont 28 jours : 2 fois plus de semaines, 2 fois plus de jours.',
	),
	oui(
		'conversion',
		"Le petit frère de Nour a 2 ans, c'est-à-dire 24 mois.",
		"L'âge en mois est-il proportionnel à l'âge en années ?",
		"À 4 ans, on a 48 mois : 2 fois plus d'années, 2 fois plus de mois. Une année compte toujours 12 mois.",
	),
	// --- périmètre du carré ---
	oui(
		'perimetre-carre',
		'Un carré de 3 cm de côté a un périmètre de 12 cm. Un carré de 6 cm de côté a un périmètre de 24 cm.',
		Q_PERIMETRE_CARRE,
		"Le côté est 2 fois plus long, et le périmètre aussi : 24 cm, c'est bien 2 fois 12 cm.",
	),
	oui(
		'perimetre-carre',
		"Pour faire le tour d'un carré, on longe ses 4 côtés.",
		Q_PERIMETRE_CARRE,
		'Si le côté est 2 fois plus long, les 4 côtés le sont aussi : le tour est 2 fois plus long.',
	),
	// --- aire d'un rectangle de largeur fixe ---
	oui(
		'aire-rectangle',
		'Sur un quadrillage, Tom colorie des rectangles qui ont tous 3 carreaux de large.',
		"L'aire de ces rectangles est-elle proportionnelle à leur longueur ?",
		'Un rectangle de 4 carreaux de long en couvre 12 ; un rectangle de 8 carreaux de long en couvre 24 : 2 fois plus long, 2 fois plus de carreaux.',
	),
	// --- objets identiques ---
	oui(
		'objets-identiques',
		"Une bouteille d'eau pleine pèse 2 kg.",
		'La masse des bouteilles pleines est-elle proportionnelle à leur nombre ?',
		'3 bouteilles pèsent 6 kg, et 6 bouteilles pèsent 12 kg : 2 fois plus de bouteilles, 2 fois plus lourd.',
	),
	oui(
		'objets-identiques',
		'Chaque bille du sac pèse 5 g.',
		'La masse des billes est-elle proportionnelle au nombre de billes ?',
		'10 billes pèsent 50 g, et 20 billes pèsent 100 g : 2 fois plus de billes, 2 fois plus lourd.',
	),
	oui(
		'objets-identiques',
		'Pour faire une allée, on pose des dalles de 30 cm bout à bout.',
		"La longueur de l'allée est-elle proportionnelle au nombre de dalles ?",
		'4 dalles font 120 cm, et 8 dalles font 240 cm : 2 fois plus de dalles, une allée 2 fois plus longue.',
	),
	oui(
		'objets-identiques',
		'Dans cet escalier, toutes les marches ont la même hauteur : 15 cm.',
		'La hauteur montée est-elle proportionnelle au nombre de marches ?',
		'4 marches font monter de 60 cm, et 8 marches de 120 cm : 2 fois plus de marches, 2 fois plus haut.',
	),
];

const SITUATIONS_NON: ItemIdentifier[] = [
	// --- part fixe ---
	non(
		'part-fixe',
		'Le taxi de Lina fait payer 4 € de prise en charge, et 2 € pour chaque kilomètre parcouru.',
		Q_COURSE,
		'5 km coûtent 14 €, mais 10 km coûtent 24 €, pas 28 € : les 4 € de prise en charge ne doublent pas.',
	),
	non(
		'part-fixe',
		'À la piscine, il faut acheter une carte à 10 €, et chaque entrée coûte 2 €.',
		Q_PRIX_PAYE("au nombre d'entrées"),
		"4 entrées coûtent 18 €, mais 8 entrées coûtent 26 €, pas 36 € : la carte ne se paie qu'une fois.",
	),
	non(
		'part-fixe',
		"Au lac, il faut payer 10 € d'inscription, et la location d'un canoë coûte 6 € par heure.",
		Q_PRIX_PAYE("au nombre d'heures de location"),
		"2 heures coûtent 22 €, mais 4 heures coûtent 34 €, pas 44 € : l'inscription ne se paie qu'une fois.",
	),
	non(
		'part-fixe',
		'Au début, la tirelire de Tom contenait 20 €. Chaque semaine, il y met 5 € de plus.',
		Q_TIRELIRE,
		'Après 2 semaines, il y a 30 € ; après 4 semaines, 40 €, pas 60 € : les 20 € du début ne doublent pas.',
	),
	non(
		'part-fixe',
		'La boîte vide pèse 200 g, et chaque bille pèse 5 g.',
		'La masse de la boîte remplie est-elle proportionnelle au nombre de billes ?',
		'Avec 10 billes, la boîte pèse 250 g ; avec 20 billes, 300 g, pas 500 g : le poids de la boîte ne double pas.',
	),
	non(
		'part-fixe',
		'Sur ce site, les livres coûtent 8 € chacun, et la livraison coûte 5 €.',
		'Le prix de la commande est-il proportionnel au nombre de livres ?',
		"2 livres coûtent 21 €, mais 4 livres coûtent 37 €, pas 42 € : la livraison ne se paie qu'une fois.",
	),
	non(
		'part-fixe',
		"À la fête foraine, chacun paie 4 € d'entrée, et 2 € par tour de manège.",
		'Le prix payé par un enfant est-il proportionnel au nombre de tours de manège ?',
		"3 tours coûtent 10 €, mais 6 tours coûtent 16 €, pas 20 € : l'entrée ne se paie qu'une fois.",
	),
	non(
		'part-fixe',
		'Pour 2 km, le taxi coûte 7 €. Pour 4 km, il coûte 11 €.',
		Q_COURSE,
		"4 km, c'est 2 fois plus que 2 km, mais 11 €, ce n'est pas 2 fois 7 € (ce serait 14 €).",
	),
	non(
		'part-fixe',
		"Le club de judo demande 20 € d'inscription, et 5 € pour chaque cours.",
		Q_PRIX_PAYE('au nombre de cours'),
		"4 cours coûtent 40 €, mais 8 cours coûtent 60 €, pas 80 € : l'inscription ne se paie qu'une fois.",
	),
	non(
		'part-fixe',
		'Hugo a déjà lu 40 pages de son livre. Il en lit 10 chaque soir.',
		'Le nombre de pages lues est-il proportionnel au nombre de soirs ?',
		'Après 2 soirs, Hugo a lu 60 pages ; après 4 soirs, 80 pages, pas 120 : les 40 pages du début ne doublent pas.',
	),
	non(
		'part-fixe',
		"Quand on l'a achetée, la plante mesurait 10 cm. Elle grandit de 2 cm chaque semaine.",
		'La hauteur de la plante est-elle proportionnelle au nombre de semaines ?',
		'Après 2 semaines, elle mesure 14 cm ; après 4 semaines, 18 cm, pas 28 cm : elle mesurait déjà 10 cm.',
	),
	// --- âge et taille ---
	non(
		'age-taille',
		'À sa naissance, Noé mesurait 50 cm. À 4 ans, il mesurait 100 cm.',
		'La taille de Noé est-elle proportionnelle à son âge ?',
		'À sa naissance, Noé mesurait déjà 50 cm. Et à 8 ans, il ne mesurera pas 200 cm : on grandit de moins en moins vite.',
	),
	non(
		'age-taille',
		'À 4 ans, Jade mesurait 100 cm. À 8 ans, elle mesurait 125 cm.',
		'La taille de Jade est-elle proportionnelle à son âge ?',
		"8 ans, c'est 2 fois 4 ans, mais 125 cm, ce n'est pas 2 fois 100 cm (ce serait 200 cm).",
	),
	non(
		'age-taille',
		'À 5 ans, Sam chaussait du 28. À 10 ans, il chausse du 34.',
		'La pointure de Sam est-elle proportionnelle à son âge ?',
		"10 ans, c'est 2 fois 5 ans, mais 34, ce n'est pas 2 fois 28 (ce serait 56).",
	),
	non(
		'age-taille',
		'À 2 ans, Inès pesait 12 kg. À 6 ans, elle pesait 20 kg.',
		"La masse d'Inès est-elle proportionnelle à son âge ?",
		"6 ans, c'est 3 fois 2 ans, mais 20 kg, ce n'est pas 3 fois 12 kg (ce serait 36 kg).",
	),
	non(
		'age-taille',
		'Le chiot de Lina pesait 3 kg à 2 mois, et 12 kg à 6 mois.',
		'La masse du chiot est-elle proportionnelle à son âge ?',
		"6 mois, c'est 3 fois 2 mois, mais 12 kg, c'est 4 fois 3 kg : ce n'est pas le même nombre de fois.",
	),
	// --- aire du carré ---
	non(
		'aire-carre',
		'Un carré de 2 carreaux de côté couvre 4 carreaux. Un carré de 4 carreaux de côté en couvre 16.',
		Q_AIRE_CARRE,
		"Le côté est 2 fois plus long, mais l'aire est 4 fois plus grande : 16 carreaux, ce n'est pas 2 fois 4 carreaux.",
	),
	non(
		'aire-carre',
		'Un carré de 3 cm de côté a une aire de 9 cm². Un carré de 6 cm de côté a une aire de 36 cm².',
		Q_AIRE_CARRE,
		"Le côté est 2 fois plus long, mais l'aire est 4 fois plus grande : 36 cm², ce n'est pas 2 fois 9 cm².",
	),
	non(
		'aire-carre',
		'Un carré de 5 carreaux de côté couvre 25 carreaux. Un carré de 10 carreaux de côté en couvre 100.',
		Q_AIRE_CARRE,
		"Le côté est 2 fois plus long, mais l'aire est 4 fois plus grande : 100 carreaux, ce n'est pas 2 fois 25 carreaux.",
	),
	non(
		'aire-carre',
		'Mila trace deux carrés : le côté du second est 3 fois plus long que celui du premier.',
		Q_AIRE_CARRE,
		'Avec un côté 3 fois plus long, le carré couvre 9 fois plus de carreaux, pas 3 fois plus.',
	),
	// --- écart constant ---
	non(
		'ecart-constant',
		'Léo est né 3 ans avant sa sœur Lina.',
		"L'âge de Léo est-il proportionnel à l'âge de Lina ?",
		"Quand Lina a 2 ans, Léo a 5 ans ; quand Lina a 4 ans, Léo a 7 ans, pas 10 : l'écart reste de 3 ans.",
	),
	non(
		'ecart-constant',
		'La maman de Jade avait 30 ans quand Jade est née.',
		"L'âge de la maman est-il proportionnel à l'âge de Jade ?",
		"Quand Jade a 5 ans, sa maman a 35 ans ; quand Jade a 10 ans, sa maman a 40 ans, pas 70 : l'écart reste de 30 ans.",
	),
	non(
		'ecart-constant',
		'Quand Zoé avait 2 ans, son frère avait 5 ans. Maintenant, Zoé a 4 ans et son frère a 7 ans.',
		"L'âge du frère est-il proportionnel à l'âge de Zoé ?",
		"Zoé a 2 fois plus d'années qu'avant, mais son frère n'a pas 10 ans : il a toujours 3 ans de plus qu'elle.",
	),
	// --- prix dégressif ---
	non(
		'prix-degressif',
		'Au marché, 2 kg de pommes coûtent 6 € et 6 kg coûtent 15 €.',
		Q_PRIX('à la masse de pommes'),
		"6 kg, c'est 3 fois plus que 2 kg, mais 15 €, ce n'est pas 3 fois 6 € (ce serait 18 €).",
	),
	non(
		'prix-degressif',
		'À la boulangerie, 4 baguettes coûtent 6 € et 8 baguettes coûtent 10 €.',
		Q_PRIX('au nombre de baguettes'),
		"8 baguettes, c'est 2 fois plus que 4 baguettes, mais 10 €, ce n'est pas 2 fois 6 € (ce serait 12 €).",
	),
	non(
		'prix-degressif',
		'Au cinéma, 2 places coûtent 14 € et 6 places coûtent 36 €.',
		Q_PRIX('au nombre de places'),
		"6 places, c'est 3 fois plus que 2 places, mais 36 €, ce n'est pas 3 fois 14 € (ce serait 42 €).",
	),
	non(
		'prix-degressif',
		'Au magasin, le paquet de 3 cahiers coûte 6 € et le paquet de 9 cahiers coûte 12 €.',
		Q_PRIX('au nombre de cahiers'),
		"9 cahiers, c'est 3 fois plus que 3 cahiers, mais 12 €, ce n'est pas 3 fois 6 € (ce serait 18 €).",
	),
	non(
		'prix-degressif',
		'Le magasin fait une promotion sur les yaourts : 3 yaourts pour le prix de 2.',
		Q_PRIX_PAYE('au nombre de yaourts'),
		'2 yaourts et 3 yaourts coûtent le même prix : le prix ne suit pas le nombre de yaourts.',
	),
	non(
		'prix-degressif',
		'Les sachets de bonbons sont identiques, et le magasin en offre 1 pour 3 achetés.',
		Q_PRIX_PAYE('au nombre de sachets emportés'),
		'Emporter 3 sachets ou 4 sachets coûte le même prix : le prix ne suit pas le nombre de sachets.',
	),
	// --- grandeur qui ne change pas ---
	non(
		'grandeur-constante',
		'Au four, une plaque de 6 cookies et une plaque de 12 cookies cuisent le même temps : 10 minutes.',
		'La durée de cuisson est-elle proportionnelle au nombre de cookies sur la plaque ?',
		'Avec 2 fois plus de cookies, la cuisson dure toujours 10 minutes, pas 20 : elle ne change pas.',
	),
	non(
		'grandeur-constante',
		'Un orchestre de 4 musiciens joue un morceau en 5 minutes.',
		'La durée du morceau est-elle proportionnelle au nombre de musiciens ?',
		'Avec 8 musiciens, le morceau dure toujours 5 minutes, pas 10 : jouer à plus nombreux ne le rallonge pas.',
	),
	non(
		'grandeur-constante',
		'Dans cette ville, le ticket de bus a le même prix pour 2 arrêts ou pour 10 arrêts : 2 €.',
		"Le prix du ticket est-il proportionnel au nombre d'arrêts ?",
		'Le trajet est 5 fois plus long, mais le ticket coûte toujours 2 € : le prix ne change pas.',
	),
	non(
		'grandeur-constante',
		'Sur le fil, 5 chaussettes sèchent en 3 heures, et 10 chaussettes aussi.',
		'Le temps de séchage est-il proportionnel au nombre de chaussettes ?',
		'Avec 2 fois plus de chaussettes, le linge sèche toujours en 3 heures, pas en 6 heures.',
	),
	// --- partage ---
	non(
		'partage',
		'Un gâteau est partagé en parts égales entre les enfants présents.',
		"La taille de la part de chaque enfant est-elle proportionnelle au nombre d'enfants ?",
		"Avec 2 fois plus d'enfants, chaque part est 2 fois plus petite, pas 2 fois plus grande.",
	),
	non(
		'partage',
		'Les 24 billes du sac sont partagées entre les joueurs.',
		'Le nombre de billes de chaque joueur est-il proportionnel au nombre de joueurs ?',
		'Avec 2 joueurs, chacun a 12 billes ; avec 4 joueurs, chacun en a 6 : 2 fois plus de joueurs, 2 fois moins de billes.',
	),
];

/* Banque CM1-only (#225). L'ordre est figé (Oui puis Non) : le tirage, lui, se fait à
   l'appel de `generate`. */
export const BANQUE_IDENTIFIER = bankByLevel<ItemIdentifier>([
	...SITUATIONS_OUI,
	...SITUATIONS_NON,
]);

/* QCM d'un item : la situation, puis la question qui nomme les deux grandeurs. Réponse
   LUE dans l'item (jamais recalculée) ; choix fixes [Oui, Non] (positions stables). */
export function exerciceIdentifier(item: ItemIdentifier): Exercise {
	const question = `${item.situation} ${item.question}`;
	return {
		type: 'qcm',
		question,
		answer: item.proportionnel ? OUI : NON,
		choices: [OUI, NON],
		explication: item.explication,
		parle: texteOral(question),
	};
}

const MODES_IDENTIFIER: ModeOption[] = [MODE_QCM_POINT];

function identifierType(): ExerciseType {
	return {
		levels: BANQUE_IDENTIFIER.levels,
		modes: MODES_IDENTIFIER,
		generate(opts?: GenerateOpts): Exercise {
			return exerciceIdentifier(pickFromBank(BANQUE_IDENTIFIER, opts?.level));
		},
		check: checkAnswer,
	};
}

/* ============================================================
   Leçon B — « Problèmes de proportionnalité » (résoudre)
   ============================================================ */

export type Procedure = 'multiplicative' | 'additive';

export interface CoupleConnu {
	quantite: number;
	valeur: number;
}

/* Item de banque. `reponse` est CALCULÉE à la construction par la procédure annoncée
   (`multiplicatif` / `additif` ci-dessous), puis stockée. `calcul` est le calcul de
   LINÉARITÉ (jamais un calcul par la valeur unitaire) : il nourrit le déroulé d'étayage
   (#490) sur le problème raté. */
export interface ItemResoudre {
	procedure: Procedure;
	connus: CoupleConnu[];
	demande: number;
	reponse: number;
	enonce: string;
	question: string;
	unite?: UniteEtape;
	calcul: CalculEtape;
	explication: string;
	parle: string;
	levels: SchoolLevel[];
}

/* Habillage d'une famille de problèmes : comment se disent un couple, deux couples, la
   question, et, pour l'explication, une quantité, une valeur et la grandeur cherchée. */
interface Contexte {
	intro: string; // début de phrase (« Au marché, »), ou chaîne vide
	un: (c: CoupleConnu) => string; // « 4 cahiers coûtent 10 € »
	deux: (a: CoupleConnu, b: CoupleConnu) => string;
	question: (n: number) => string;
	qte: (n: number) => string; // « 12 cahiers »
	val: (v: number) => string; // « 30 € », « 450 g »
	grandeur: string; // sujet de l'explication : « Le prix », « La masse de farine »
	feminin: boolean;
	unite?: UniteEtape;
}

const euros = (v: number): string => `${formatEuros(v)} €`;

/* Un contexte « prix » : la valeur est un montant en euros. */
function contextePrix(
	intro: string,
	objets: (n: number) => string,
	objetsCourts: (n: number) => string,
): Contexte {
	return {
		intro,
		un: (c) => `${objets(c.quantite)} coûtent ${euros(c.valeur)}`,
		deux: (a, b) =>
			`${objets(a.quantite)} coûtent ${euros(a.valeur)} et ${objetsCourts(b.quantite)} coûtent ${euros(b.valeur)}`,
		question: (n) => `Combien coûtent ${objets(n)} ?`,
		qte: objets,
		val: euros,
		grandeur: 'Le prix',
		feminin: false,
		unite: 'euro',
	};
}

const CAHIERS = contextePrix(
	'À la papeterie, ',
	(n) => `${n} cahiers`,
	(n) => `${n} cahiers`,
);
const TOMATES = contextePrix(
	'Au marché, ',
	(n) => `${n} kg de tomates`,
	(n) => `${n} kg`,
);
const JUS = contextePrix(
	'Au supermarché, ',
	(n) => `${n} bouteilles de jus de pomme`,
	(n) => `${n} bouteilles`,
);
const CINEMA = contextePrix(
	'Au cinéma, ',
	(n) => `${n} places`,
	(n) => `${n} places`,
);
const TISSU = contextePrix(
	'Au magasin, ',
	(n) => `${n} m de tissu`,
	(n) => `${n} m`,
);
const CROISSANTS = contextePrix(
	'À la boulangerie, ',
	(n) => `${n} croissants`,
	(n) => `${n} croissants`,
);
const POMMES = contextePrix(
	'Chez le primeur, ',
	(n) => `${n} kg de pommes`,
	(n) => `${n} kg`,
);

const CREPES: Contexte = {
	intro: '',
	un: (c) => `Pour faire ${c.quantite} crêpes, il faut ${c.valeur} g de farine`,
	deux: (a, b) =>
		`Pour faire ${a.quantite} crêpes, il faut ${a.valeur} g de farine, et pour ${b.quantite} crêpes, il en faut ${b.valeur} g`,
	question: (n) => `Combien de grammes de farine faut-il pour faire ${n} crêpes ?`,
	qte: (n) => `${n} crêpes`,
	val: (v) => `${v} g`,
	grandeur: 'La masse de farine',
	feminin: true,
};

const CHOCOLAT: Contexte = {
	intro: '',
	un: (c) => `Pour un gâteau de ${c.quantite} personnes, il faut ${c.valeur} g de chocolat`,
	deux: (a, b) =>
		`Pour un gâteau de ${a.quantite} personnes, il faut ${a.valeur} g de chocolat, et pour ${b.quantite} personnes, il en faut ${b.valeur} g`,
	question: (n) => `Combien de grammes de chocolat faut-il pour un gâteau de ${n} personnes ?`,
	qte: (n) => `${n} personnes`,
	val: (v) => `${v} g`,
	grandeur: 'La masse de chocolat',
	feminin: true,
};

const BILLES: Contexte = {
	intro: 'Les billes de Tom sont toutes identiques : ',
	un: (c) => `${c.quantite} billes pèsent ${c.valeur} g`,
	deux: (a, b) =>
		`${a.quantite} billes pèsent ${a.valeur} g et ${b.quantite} billes pèsent ${b.valeur} g`,
	question: (n) => `Quelle est la masse de ${n} billes, en grammes ?`,
	qte: (n) => `${n} billes`,
	val: (v) => `${v} g`,
	grandeur: 'La masse',
	feminin: true,
};

const DALLES: Contexte = {
	intro: 'Pour faire une allée, Léa pose des dalles identiques bout à bout : ',
	un: (c) => `${c.quantite} dalles mesurent ${c.valeur} cm`,
	deux: (a, b) =>
		`${a.quantite} dalles mesurent ${a.valeur} cm et ${b.quantite} dalles mesurent ${b.valeur} cm`,
	question: (n) => `Quelle longueur mesurent ${n} dalles, en centimètres ?`,
	qte: (n) => `${n} dalles`,
	val: (v) => `${v} cm`,
	grandeur: 'La longueur',
	feminin: true,
};

const BABY_SITTING: Contexte = {
	intro: 'Nina garde des enfants. ',
	un: (c) => `Pour ${c.quantite} heures, elle gagne ${euros(c.valeur)}`,
	deux: (a, b) =>
		`Pour ${a.quantite} heures, elle gagne ${euros(a.valeur)}, et pour ${b.quantite} heures, elle gagne ${euros(b.valeur)}`,
	question: (n) => `Combien Nina gagne-t-elle pour ${n} heures ?`,
	qte: (n) => `${n} heures`,
	val: euros,
	grandeur: 'La somme gagnée',
	feminin: true,
	unite: 'euro',
};

const ARROSOIRS: Contexte = {
	intro: 'Les arrosoirs du jardin sont tous identiques : ',
	un: (c) => `${c.quantite} arrosoirs pleins contiennent ${c.valeur} L d'eau`,
	deux: (a, b) =>
		`${a.quantite} arrosoirs pleins contiennent ${a.valeur} L d'eau et ${b.quantite} arrosoirs en contiennent ${b.valeur} L`,
	question: (n) => `Combien de litres d'eau contiennent ${n} arrosoirs pleins ?`,
	qte: (n) => `${n} arrosoirs`,
	val: (v) => `${v} L`,
	grandeur: "La quantité d'eau",
	feminin: true,
};

const PAGES: Contexte = {
	intro: 'Les cahiers de la classe sont tous identiques : ',
	un: (c) => `${c.quantite} cahiers ont ${c.valeur} pages en tout`,
	deux: (a, b) =>
		`${a.quantite} cahiers ont ${a.valeur} pages en tout et ${b.quantite} cahiers en ont ${b.valeur}`,
	question: (n) => `Combien de pages ont ${n} cahiers ?`,
	qte: (n) => `${n} cahiers`,
	val: (v) => `${v} pages`,
	grandeur: 'Le nombre de pages',
	feminin: false,
};

const IMAGES: Contexte = {
	intro: "Les pochettes d'images contiennent toutes le même nombre d'images : ",
	un: (c) => `${c.quantite} pochettes contiennent ${c.valeur} images`,
	deux: (a, b) =>
		`${a.quantite} pochettes contiennent ${a.valeur} images et ${b.quantite} pochettes en contiennent ${b.valeur}`,
	question: (n) => `Combien d'images contiennent ${n} pochettes ?`,
	qte: (n) => `${n} pochettes`,
	val: (v) => `${v} images`,
	grandeur: "Le nombre d'images",
	feminin: false,
};

const CITRONS: Contexte = {
	intro: 'Zoé prépare de la limonade, toujours avec la même recette. ',
	un: (c) => `Pour ${c.quantite} L de limonade, elle utilise ${c.valeur} citrons`,
	deux: (a, b) =>
		`Pour ${a.quantite} L de limonade, elle utilise ${a.valeur} citrons, et pour ${b.quantite} L, elle en utilise ${b.valeur}`,
	question: (n) => `Combien de citrons faut-il pour ${n} L de limonade ?`,
	qte: (n) => `${n} L de limonade`,
	val: (v) => `${v} citrons`,
	grandeur: 'Le nombre de citrons',
	feminin: false,
};

/* Phrase d'énoncé : l'intro éventuelle, puis le corps, majuscule initiale et point final. */
function phrase(ctx: Contexte, corps: string): string {
	return `${ctx.intro ? ctx.intro + corps : cap(corps)}.`;
}

/* Calcul de linéarité, avec l'unité de chaque opérande quand c'est un montant. */
function calculLinearite(
	op: CalculEtape['op'],
	a: number,
	b: number,
	uniteA?: UniteEtape,
	uniteB?: UniteEtape,
): CalculEtape {
	return {
		op,
		a,
		b,
		...(uniteA ? { uniteA } : {}),
		...(uniteB ? { uniteB } : {}),
	};
}

function itemResoudre(
	ctx: Contexte,
	procedure: Procedure,
	connus: CoupleConnu[],
	demande: number,
	reponse: number,
	enonce: string,
	calcul: CalculEtape,
	explication: string,
): ItemResoudre {
	const question = ctx.question(demande);
	return {
		procedure,
		connus,
		demande,
		reponse,
		enonce,
		question,
		...(ctx.unite ? { unite: ctx.unite } : {}),
		calcul,
		explication,
		parle: `${texteOral(enonce)} ${texteOral(question)}`,
		levels: NIVEAUX,
	};
}

/* Linéarité MULTIPLICATIVE : un couple connu (q → v), une quantité demandée d, rapport
   entier k = d/q (« k fois plus ») ou k = q/d (« k fois moins »). */
function multiplicatif(
	ctx: Contexte,
	quantite: number,
	valeur: number,
	demande: number,
): ItemResoudre {
	const fois = demande > quantite;
	const k = fois ? demande / quantite : quantite / demande;
	const reponse = fois ? valeur * k : valeur / k;
	const e = ctx.feminin ? 'e' : '';
	const explication = fois
		? `${cap(ctx.qte(demande))}, c'est ${k} fois plus que ${ctx.qte(quantite)}. ${ctx.grandeur} est donc ${k} fois plus grand${e} : ${ctx.val(valeur)} × ${k} = ${ctx.val(reponse)}.`
		: `${cap(ctx.qte(demande))}, c'est ${k} fois moins que ${ctx.qte(quantite)}. ${ctx.grandeur} est donc ${k} fois plus petit${e} : ${ctx.val(valeur)} ÷ ${k} = ${ctx.val(reponse)}.`;
	return itemResoudre(
		ctx,
		'multiplicative',
		[{ quantite, valeur }],
		demande,
		reponse,
		phrase(ctx, ctx.un({ quantite, valeur })),
		calculLinearite(fois ? 'x' : ':', valeur, k, ctx.unite),
		explication,
	);
}

/* Linéarité ADDITIVE : deux couples connus de même rapport ; la quantité demandée est leur
   SOMME (`a.quantite + b.quantite`) ou leur DIFFÉRENCE (`a.quantite − b.quantite`, `a` étant
   alors le plus grand). La réponse se combine de la même façon, sans autre facteur. */
function additif(
	ctx: Contexte,
	a: CoupleConnu,
	b: CoupleConnu,
	sens: 'somme' | 'difference',
): ItemResoudre {
	const somme = sens === 'somme';
	const demande = somme ? a.quantite + b.quantite : a.quantite - b.quantite;
	const reponse = somme ? a.valeur + b.valeur : a.valeur - b.valeur;
	const explication = somme
		? `${cap(ctx.qte(demande))}, c'est ${ctx.qte(a.quantite)} et ${ctx.qte(b.quantite)} ensemble. ${ctx.grandeur} est donc ${ctx.val(a.valeur)} + ${ctx.val(b.valeur)} = ${ctx.val(reponse)}.`
		: `${cap(ctx.qte(demande))}, c'est ${ctx.qte(a.quantite)} moins ${ctx.qte(b.quantite)}. ${ctx.grandeur} est donc ${ctx.val(a.valeur)} − ${ctx.val(b.valeur)} = ${ctx.val(reponse)}.`;
	return itemResoudre(
		ctx,
		'additive',
		[a, b],
		demande,
		reponse,
		phrase(ctx, ctx.deux(a, b)),
		calculLinearite(somme ? '+' : '-', a.valeur, b.valeur, ctx.unite, ctx.unite),
		explication,
	);
}

const c = (quantite: number, valeur: number): CoupleConnu => ({ quantite, valeur });

/* Linéarité multiplicative : 40 items, k de 3 à 10 (jamais 2), dans les deux sens. */
const MULTIPLICATIFS: ItemResoudre[] = [
	multiplicatif(CAHIERS, 4, 10, 12),
	multiplicatif(CAHIERS, 3, 7, 15),
	multiplicatif(CAHIERS, 20, 50, 4),
	multiplicatif(CAHIERS, 5, 12, 50),
	multiplicatif(TOMATES, 3, 8, 9),
	multiplicatif(TOMATES, 2, 5, 20),
	multiplicatif(TOMATES, 12, 30, 4),
	multiplicatif(TOMATES, 10, 35, 2),
	multiplicatif(CREPES, 4, 150, 12),
	multiplicatif(CREPES, 6, 250, 18),
	multiplicatif(CREPES, 30, 750, 6),
	multiplicatif(CREPES, 36, 900, 4),
	multiplicatif(JUS, 4, 6, 16),
	multiplicatif(JUS, 24, 36, 8),
	multiplicatif(BILLES, 5, 40, 35),
	multiplicatif(BILLES, 4, 30, 24),
	multiplicatif(DALLES, 3, 90, 12),
	multiplicatif(DALLES, 40, 800, 8),
	multiplicatif(BABY_SITTING, 2, 17, 6),
	multiplicatif(BABY_SITTING, 3, 25, 12),
	multiplicatif(CINEMA, 2, 15, 8),
	multiplicatif(CINEMA, 30, 210, 5),
	multiplicatif(CINEMA, 4, 30, 28),
	multiplicatif(TISSU, 2, 9, 14),
	multiplicatif(TISSU, 24, 96, 3),
	multiplicatif(CHOCOLAT, 6, 200, 18),
	multiplicatif(CHOCOLAT, 16, 400, 4),
	multiplicatif(CHOCOLAT, 4, 125, 24),
	multiplicatif(ARROSOIRS, 3, 24, 21),
	multiplicatif(ARROSOIRS, 10, 80, 2),
	multiplicatif(PAGES, 2, 96, 6),
	multiplicatif(PAGES, 9, 432, 3),
	multiplicatif(CROISSANTS, 4, 5, 20),
	multiplicatif(CROISSANTS, 40, 50, 8),
	multiplicatif(POMMES, 2, 7, 18),
	multiplicatif(POMMES, 5, 12, 40),
	multiplicatif(IMAGES, 3, 15, 27),
	multiplicatif(IMAGES, 50, 250, 5),
	multiplicatif(CITRONS, 4, 6, 12),
	multiplicatif(CITRONS, 20, 30, 4),
];

/* Linéarité additive : 32 items (18 sommes, 14 différences). Quantité demandée jamais
   multiple ni diviseur entier d'une quantité connue. */
const ADDITIFS: ItemResoudre[] = [
	additif(CAHIERS, c(6, 15), c(8, 20), 'somme'),
	additif(CAHIERS, c(10, 24), c(15, 36), 'somme'),
	additif(CAHIERS, c(14, 35), c(6, 15), 'difference'),
	additif(TOMATES, c(6, 8), c(9, 12), 'somme'),
	additif(TOMATES, c(4, 14), c(6, 21), 'somme'),
	additif(CREPES, c(4, 100), c(6, 150), 'somme'),
	additif(CREPES, c(13, 325), c(5, 125), 'difference'),
	additif(JUS, c(4, 6), c(10, 15), 'somme'),
	additif(JUS, c(14, 21), c(6, 9), 'difference'),
	additif(BILLES, c(5, 30), c(8, 48), 'somme'),
	additif(BILLES, c(13, 78), c(5, 30), 'difference'),
	additif(DALLES, c(4, 120), c(7, 210), 'somme'),
	additif(DALLES, c(12, 300), c(5, 125), 'difference'),
	additif(BABY_SITTING, c(3, 27), c(5, 45), 'somme'),
	additif(BABY_SITTING, c(7, 56), c(2, 16), 'difference'),
	additif(CINEMA, c(4, 30), c(6, 45), 'somme'),
	additif(CINEMA, c(9, 63), c(4, 28), 'difference'),
	additif(TISSU, c(4, 18), c(6, 27), 'somme'),
	additif(TISSU, c(11, 33), c(4, 12), 'difference'),
	additif(CHOCOLAT, c(6, 300), c(8, 400), 'somme'),
	additif(CHOCOLAT, c(10, 500), c(4, 200), 'difference'),
	additif(ARROSOIRS, c(3, 24), c(5, 40), 'somme'),
	additif(ARROSOIRS, c(11, 66), c(3, 18), 'difference'),
	additif(PAGES, c(2, 96), c(3, 144), 'somme'),
	additif(PAGES, c(7, 336), c(2, 96), 'difference'),
	additif(CROISSANTS, c(8, 10), c(12, 15), 'somme'),
	additif(CROISSANTS, c(14, 21), c(4, 6), 'difference'),
	additif(POMMES, c(6, 15), c(10, 25), 'somme'),
	additif(POMMES, c(9, 27), c(2, 6), 'difference'),
	additif(IMAGES, c(4, 20), c(7, 35), 'somme'),
	additif(IMAGES, c(11, 66), c(4, 24), 'difference'),
	additif(CITRONS, c(6, 9), c(10, 15), 'somme'),
];

export const BANQUE_RESOUDRE = bankByLevel<ItemResoudre>([...MULTIPLICATIFS, ...ADDITIFS]);

/* Problème d'un item : une seule sous-question, réponse LUE dans l'item. */
export function exerciceResoudre(item: ItemResoudre): Exercise {
	return {
		type: 'probleme',
		enonce: item.enonce,
		etapes: [
			{
				question: item.question,
				answer: item.reponse,
				calcul: item.calcul,
				...(item.unite ? { unite: item.unite } : {}),
			},
		],
		parle: item.parle,
		explication: item.explication,
	};
}

function resoudreType(): ExerciseType {
	return {
		// Format « problème » (#199) : classé sans appeler generate() (#348), exclu du sprint.
		exerciseKind: 'probleme',
		levels: BANQUE_RESOUDRE.levels,
		generate(opts?: GenerateOpts): Exercise {
			return exerciceResoudre(pickFromBank(BANQUE_RESOUDRE, opts?.level));
		},
		check: () => false, // corrigé par le runner dédié, jamais génériquement
	};
}

/* ============================================================
   Catalogue
   ============================================================ */

/* Étend `LessonInput` pour porter l'exclusion du sprint (comme la divisibilité). */
export interface ProportionnaliteLessonDef extends LessonInput {
	excludeFromSprint?: boolean;
}

export const PROPORTIONNALITE_LESSONS: ProportionnaliteLessonDef[] = [
	{
		id: 'math-prob-proportion-identifier',
		label: 'Est-ce proportionnel ?',
		motsCles: ['proportionnalité', 'proportionnel', 'deux fois plus', 'double', 'recette'],
		exerciseType: identifierType(),
		// Le test de linéarité, sous sa forme CM1 non formelle (repères de progressivité :
		// « propriétés de linéarité privilégiées, institutionnalisées de façon non
		// formelle ») : doubler l'une, regarder si l'autre double.
		etayage: [
			etayageRedige(
				'La proportionnalité',
				"Deux grandeurs sont proportionnelles quand, si l'une devient 2 fois, 3 fois ou 10 fois plus grande, l'autre le devient aussi.",
				[
					'Imagine que la première grandeur devient 2 fois plus grande.',
					"Cherche ce que devient l'autre grandeur.",
					"Si elle devient aussi 2 fois plus grande, c'est proportionnel ; sinon, ça ne l'est pas.",
				],
			),
		],
		// QCM Oui/Non devinable à 50 % : sous le chrono, le sprint récompenserait le hasard.
		excludeFromSprint: true,
	},
	{
		id: 'math-prob-proportion-resoudre',
		label: 'Problèmes de proportionnalité',
		motsCles: ['proportionnalité', 'problème', 'énoncé', 'fois plus', 'recette', 'prix'],
		exerciseType: resoudreType(),
		// Règle seule, comme les autres problèmes : le déroulé se construit sur le problème
		// raté (calcul de linéarité porté par l'étape). Elle nomme la linéarité, jamais un
		// passage par la valeur unitaire.
		etayage: [
			{
				contenu: {
					titre: 'Problèmes de proportionnalité',
					regle:
						'Si une quantité devient 3 fois plus grande, ce qui va avec devient 3 fois plus grand ; si tu ajoutes deux quantités, tu ajoutes aussi ce qui va avec.',
				},
			},
		],
	},
];
