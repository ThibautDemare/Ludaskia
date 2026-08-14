/* ============================================================
   Résolution GÉNÉRÉE d'une opération posée (#490) — logique pure.
   ------------------------------------------------------------
   L'étayage d'une notion a deux contenus (cf. #490) : un texte RÉDIGÉ, écrit à la
   main leçon par leçon, et une résolution CALCULÉE, sans arriéré éditorial. Le
   calcul posé relève du second cas : la méthode est mécanique, donc c'est du code.

   Ce que ce module produit n'est PAS la grille remplie — qui serait la réponse et
   non la méthode — mais la SUITE DES DÉCISIONS de l'enfant, colonne par colonne :
   ce qu'il lit dans la colonne, la retenue qui arrive, ce qu'il écrit, la retenue
   qui repart. C'est le rendu (ui/etayage-*.ts) qui en déroule une à la fois et
   remplit la grille au fur et à mesure ; c'est la NARRATION (`phrasePosee`) qui la
   met en mots.

   Découpage : une étape = UNE COLONNE, l'unité de décision de l'algorithme posé.
   Une multiplication par un nombre à deux chiffres se découpe en LIGNES (les deux
   produits partiels, puis leur addition) : chacune est une opération posée complète
   aux yeux de l'enfant, et c'est le passage d'une ligne à l'autre qu'il perd.

   Aucun DOM, aucun stockage, `PosedSpec` pour seule entrée : testable seul, et
   utilisable indifféremment sur l'opération que l'enfant vient de rater ou sur
   l'exemple canonique de sa leçon (avant-série, où il n'y a pas encore d'item).
   ============================================================ */
import type { PosedSpec } from './items';

/** Une colonne de l'opération, du point de vue de l'enfant qui la traite. */
export interface EtapePosee {
	/** Rang de la colonne, 0 = les unités (l'ordre de traitement, donc l'ordre des étapes). */
	colonne: number;
	/** Chiffres lus dans la colonne, de haut en bas. Vide = il ne reste que la retenue. */
	chiffres: number[];
	/** Retenue arrivée de la colonne précédente (0 = aucune). */
	retenueEntrante: number;
	/** Chiffre écrit sous la barre. */
	ecrit: number;
	/** Retenue à reporter sur la colonne suivante (0 = aucune). */
	retenueSortante: number;
	/** Soustraction : le chiffre du haut était trop petit, il a fallu emprunter une dizaine. */
	emprunt?: boolean;
}

/* Rôle d'une ligne de chiffres écrite sous la barre :
   - `total` : le résultat lui-même (addition, soustraction, multiplication ×1 chiffre) ;
   - `produit-partiel` : la multiplication par le chiffre des UNITÉS du multiplicateur ;
   - `produit-partiel-dizaines` : celle par le chiffre des DIZAINES, dont le 0 de décalage
     est FOURNI par la grille (cf. `posedGridHTML`) — donc jamais une étape ici ;
   - `somme-partiels` : l'addition finale des deux produits partiels. */
export type RolePosee = 'total' | 'produit-partiel' | 'produit-partiel-dizaines' | 'somme-partiels';

export interface LignePosee {
	role: RolePosee;
	/** Valeur écrite sur cette ligne (le résultat pour `total`, un produit partiel sinon). */
	valeur: number;
	/** Multiplicateur de la ligne (produits partiels seulement) : le chiffre par lequel on multiplie. */
	multiplicateur?: number;
	/** Décalage de la ligne en colonnes : le 2ᵉ produit partiel s'écrit une colonne plus à
	    GAUCHE (on multiplie par des dizaines), le 0 des unités étant fourni par la grille.
	    Le rang d'une étape est donc celui de son CALCUL ; sa colonne à l'écran est
	    `colonne + decalage`. Confondre les deux écrirait le chiffre dans la mauvaise case
	    et nommerait la mauvaise colonne. */
	decalage?: number;
	etapes: EtapePosee[];
}

/** Les retenues de cette ligne ont-elles une case dans la grille ? Non pour un produit
    partiel : la grille n'a qu'UNE rangée de retenues, celle de l'addition finale (les
    retenues des produits partiels se gardent « dans la tête », les multiplicateurs étant
    calibrés doux — cf. data/maths/posee.ts et `dispositionPosee`). */
export function retenueDansLaGrille(ligne: LignePosee): boolean {
	return ligne.role === 'total' || ligne.role === 'somme-partiels';
}

export interface ResolutionPosee {
	/** L'opération, lisible (« 347 + 285 ») — la grille, elle, n'a pas d'énoncé. */
	operation: string;
	resultat: number;
	lignes: LignePosee[];
}

/* Chiffres d'un nombre par RANG (unités d'abord) : l'ordre dans lequel on calcule. */
function parRang(n: number): number[] {
	return String(n).split('').reverse().map(Number);
}

/** Résultat d'une opération posée (source unique de la valeur attendue, cf. `posedGridHTML`). */
export function resultatPosee({ op, a, b }: PosedSpec): number {
	return op === '+' ? a + b : op === '-' ? a - b : a * b;
}

/* Signe affiché — celui de la grille (« × », « − » typographiques), pas l'opérateur interne. */
function signePosee(op: PosedSpec['op']): string {
	return op === '+' ? '+' : op === '-' ? '−' : '×';
}

/* Colonnes d'une ADDITION de deux termes : on additionne les deux chiffres et la retenue,
   on écrit les unités du total, on reporte les dizaines. Une dernière retenue devient le
   chiffre de gauche du résultat (« il ne reste que la retenue » : `chiffres` vide). */
function etapesAddition(a: number, b: number): EtapePosee[] {
	const A = parRang(a);
	const B = parRang(b);
	const etapes: EtapePosee[] = [];
	let retenue = 0;
	for (let i = 0; i < Math.max(A.length, B.length); i++) {
		const x = A[i] ?? 0;
		const y = B[i] ?? 0;
		const somme = x + y + retenue;
		etapes.push({
			colonne: i,
			chiffres: [x, y],
			retenueEntrante: retenue,
			ecrit: somme % 10,
			retenueSortante: Math.floor(somme / 10),
		});
		retenue = Math.floor(somme / 10);
	}
	if (retenue) {
		etapes.push({
			colonne: etapes.length,
			chiffres: [],
			retenueEntrante: retenue,
			ecrit: retenue,
			retenueSortante: 0,
		});
	}
	return etapes;
}

/* Colonnes d'une SOUSTRACTION (a ≥ b garanti par le générateur, donc jamais de retenue
   qui sorte de la dernière colonne). La retenue vaut 1 dizaine empruntée : les CHIFFRES
   écrits et la retenue sont les mêmes quelle que soit la façon de l'enseigner (casser une
   dizaine du haut ou l'ajouter en bas) — seule la NARRATION diffère, et elle vit dans
   `phrasePosee`. Les colonnes dont le chiffre écrit serait un zéro de tête (105 − 100 = 5)
   sont conservées : le calcul de la retenue en dépend. C'est au rendu de ne pointer que
   les cellules qui existent dans la grille. */
function etapesSoustraction(a: number, b: number): EtapePosee[] {
	const A = parRang(a);
	const B = parRang(b);
	const etapes: EtapePosee[] = [];
	let retenue = 0;
	for (let i = 0; i < A.length; i++) {
		const haut = A[i];
		const bas = B[i] ?? 0;
		const aRetirer = bas + retenue;
		const emprunt = haut < aRetirer;
		etapes.push({
			colonne: i,
			chiffres: [haut, bas],
			retenueEntrante: retenue,
			ecrit: emprunt ? haut + 10 - aRetirer : haut - aRetirer,
			retenueSortante: emprunt ? 1 : 0,
			emprunt,
		});
		retenue = emprunt ? 1 : 0;
	}
	return etapes;
}

/* Colonnes d'une MULTIPLICATION par UN chiffre : chaque chiffre du haut est multiplié par
   le multiplicateur, on ajoute la retenue, on écrit les unités, on reporte les dizaines.
   La dernière retenue (jusqu'à 8 : 9 × 9 + 8 = 89) devient le chiffre de gauche. */
function etapesMultiplication(a: number, chiffre: number): EtapePosee[] {
	const A = parRang(a);
	const etapes: EtapePosee[] = [];
	let retenue = 0;
	for (let i = 0; i < A.length; i++) {
		const produit = A[i] * chiffre + retenue;
		etapes.push({
			colonne: i,
			chiffres: [A[i]],
			retenueEntrante: retenue,
			ecrit: produit % 10,
			retenueSortante: Math.floor(produit / 10),
		});
		retenue = Math.floor(produit / 10);
	}
	if (retenue) {
		etapes.push({
			colonne: etapes.length,
			chiffres: [],
			retenueEntrante: retenue,
			ecrit: retenue,
			retenueSortante: 0,
		});
	}
	return etapes;
}

/* ---------- Narration ----------
   Ce qui doit être dit à CHAQUE colonne (avis `pedagogue-primaire`, et le programme 2025
   demande « mêmes formes, mêmes mots » d'une classe à l'autre pour le calcul posé) :
   1. ce qu'on lit dans la colonne, retenue entrante comprise ;
   2. le FAIT NUMÉRIQUE isolé, énoncé comme un vrai petit calcul (« 3 + 8 + 1 = 12 ») —
      sans lui, l'enfant ne refait rien, il constate ;
   3. ce qu'on écrit, et POURQUOI : la VALEUR DE POSITION (« 12, c'est 1 dizaine et 2
      unités »). Une narration qui dit seulement « écris 2, retiens 1 » enseigne le geste
      sans la notion — c'est la façon la plus insidieuse de baisser l'exigence, et c'est
      précisément ce qui manque à un enfant dyscalculique (avis
      `specialiste-troubles-apprentissage`) ;
   4. où part la retenue, nommée. */

/* Nom de l'unité d'une colonne, au singulier puis au pluriel. Les opérations posées de
   l'appli (cf. data/maths/posee.ts) ne dépassent pas les milliers ; au-delà, on ne nomme
   plus la colonne plutôt que d'inventer un nom que l'enfant n'a pas encore rencontré. */
const UNITES: [string, string][] = [
	['unité', 'unités'],
	['dizaine', 'dizaines'],
	['centaine', 'centaines'],
	['millier', 'milliers'],
];

/** Nom de la colonne de rang `rang` (0 = les unités), au pluriel : « les dizaines ». */
export function nomColonne(rang: number): string {
	return UNITES[rang]?.[1] ?? 'colonne suivante';
}

/* « 1 dizaine », « 7 dizaines » : la quantité et son unité de position, accordées. */
function quantite(n: number, rang: number): string {
	const nom = UNITES[rang];
	if (!nom) return String(n);
	return `${n} ${n > 1 ? nom[1] : nom[0]}`;
}

/* Ce qu'on écrit, et pourquoi : la décomposition en valeur de position quand il y a une
   retenue (« 12, c'est 1 dizaine et 2 unités : j'écris 2 et je retiens 1 »), la simple
   écriture sinon. Partagé par l'addition et la multiplication, dont c'est le même geste.
   `rang` est le rang À L'ÉCRAN (décalage compris) : c'est lui qui nomme les unités.
   `enTete` = la retenue n'a pas de case à elle (produit partiel), on ne fait donc pas
   croire à l'enfant qu'il doit l'écrire quelque part. */
function phraseEcriture(e: EtapePosee, total: number, rang: number, enTete: boolean): string {
	if (!e.retenueSortante) return `J'écris ${e.ecrit}.`;
	const suite = enTete
		? `je garde ${e.retenueSortante} dans ma tête pour la suite.`
		: `je retiens ${e.retenueSortante} pour les ${nomColonne(rang + 1)}.`;
	return (
		`${total}, c'est ${quantite(e.retenueSortante, rang + 1)} et ${quantite(e.ecrit, rang)} : ` +
		`j'écris ${e.ecrit} et ${suite}`
	);
}

/** Ce qu'on dit à l'enfant pour UNE colonne, sachant la ligne en cours (elle porte le
    multiplicateur, le décalage et le sort de ses retenues). Une phrase par idée, trois au
    maximum : c'est la charte des aides au geste (#272), et la limite de ce qu'un enfant
    emporte d'un écran au suivant. */
export function phrasePosee(e: EtapePosee, op: PosedSpec['op'], ligne: LignePosee): string {
	const rang = e.colonne + (ligne.decalage ?? 0);
	const enTete = !retenueDansLaGrille(ligne);
	const colonne = `Colonne des ${nomColonne(rang)}`;
	// C'est la LIGNE qui commande le calcul raconté, pas l'opération : l'addition finale d'une
	// multiplication à deux chiffres est une ADDITION, et la raconter comme une multiplication
	// (elle n'a pas de multiplicateur) énonçait un fait numérique faux — « 8 × undefined = 0 »
	// —, dans l'exemple canonique servi à l'enfant qui vient de buter comme ailleurs.
	const calculDe = ligne.role === 'somme-partiels' ? '+' : op;
	// Dernière colonne d'une addition ou d'une multiplication : il ne reste que la retenue,
	// qui devient le chiffre de gauche de la ligne (elle n'est donc pas reportée plus loin).
	if (!e.chiffres.length) return `Il reste la retenue : j'écris ${e.ecrit} tout à gauche.`;
	if (calculDe === 'x') {
		const chiffre = e.chiffres[0];
		const produit = chiffre * (ligne.multiplicateur ?? 0);
		const calcul = e.retenueEntrante
			? `${chiffre} × ${ligne.multiplicateur} = ${produit}, plus la retenue de ${e.retenueEntrante}, ça fait ${produit + e.retenueEntrante}.`
			: `${chiffre} × ${ligne.multiplicateur} = ${produit}.`;
		return `${colonne} : ${calcul} ${phraseEcriture(e, produit + e.retenueEntrante, rang, enTete)}`;
	}
	const [haut, bas] = e.chiffres;
	if (calculDe === '+') {
		const somme = haut + bas + e.retenueEntrante;
		const calcul = e.retenueEntrante
			? `${haut} + ${bas} + ${e.retenueEntrante} (la retenue) = ${somme}.`
			: `${haut} + ${bas} = ${somme}.`;
		return `${colonne} : ${calcul} ${phraseEcriture(e, somme, rang, enTete)}`;
	}
	// SOUSTRACTION. La retenue vaut « 1 de plus à retirer à la colonne suivante » — la
	// méthode par emprunt, celle que montrent les manuels CE2 et celle que la grille sait
	// écrire (une case de retenue, pas un chiffre du haut barré).
	// UNE IDÉE PAR PHRASE, y compris dans les cas durs : ce qu'il faut retirer, puis
	// l'obstacle, puis l'emprunt et son calcul, puis ce qu'on écrit. Quatre phrases COURTES
	// se suivent mieux qu'une seule qui empile tout.
	const aRetirer = bas + e.retenueEntrante;
	const retirer = e.retenueEntrante
		? `il faut retirer ${bas}, plus la retenue de 1 : ça fait ${aRetirer}.`
		: `il faut retirer ${bas}.`;
	// Colonne dont le chiffre écrit serait un ZÉRO DE TÊTE : la grille n'a pas de case pour
	// lui (105 − 100 s'écrit « 5 », pas « 005 »), donc « j'écris 0 » désignerait une case qui
	// ne s'allume pas. On change la CONCLUSION, pas le calcul : dans 99,5 % de ces colonnes il
	// y a un vrai fait à énoncer, et une fois sur deux c'est même là que la dizaine empruntée
	// est RENDUE — le seul moment que la règle affichée en permanence promet (constat chiffré
	// de l'auteur des tests). Le taire laissait l'enfant croire l'arrêt sur parole.
	const rienAEcrire = rang >= String(ligne.valeur).length;
	const finRien = "Il ne reste rien à écrire : le résultat s'arrête ici.";
	if (!e.emprunt) {
		const fin = rienAEcrire ? finRien : `J'écris ${e.ecrit}.`;
		return `${colonne} : ${retirer} ${haut} − ${aRetirer} = ${e.ecrit}. ${fin}`;
	}
	// On dit À QUI on emprunte — la colonne d'à côté, jamais la sienne — puis ce que le
	// chiffre DEVIENT : c'est le dégroupement en base 10 rendu concret (« le 2 devient 12 »),
	// précisément la notion qui échappe à l'enfant, et non un tour de main. Deux phrases
	// courtes plutôt qu'une longue, et la colonne source nommée avant tout le reste.
	const emprunt = UNITES[rang + 1]
		? `J'emprunte 1 aux ${nomColonne(rang + 1)} : le ${haut} devient ${haut + 10}.`
		: `J'emprunte 10 : le ${haut} devient ${haut + 10}.`;
	const fin = rienAEcrire
		? finRien
		: `J'écris ${e.ecrit} et je retiens 1 à retirer aux ${nomColonne(rang + 1)}.`;
	const suite = `${emprunt} ${haut + 10} − ${aRetirer} = ${e.ecrit}. ${fin}`;
	// Emprunt à travers un ZÉRO (503 − 287, cas explicitement prévu par le générateur) : la
	// colonne n'a rien du tout, pas seulement « trop peu ». C'est LE point dur du CE2 sur
	// cette notion, il mérite sa phrase et pas celle de l'emprunt ordinaire. Pas de « plus
	// loin » : on emprunte toujours à la colonne d'à côté, la cascade se poursuit d'elle-même
	// par la retenue. (Ni de « (0) » : ce texte est aussi LU à voix haute.)
	if (haut === 0) {
		return `${colonne} : ${retirer} Mais ici il n'y a rien du tout : c'est un zéro. ${suite}`;
	}
	return `${colonne} : ${retirer} Mais ${haut} est trop petit. ${suite}`;
}

/** Annonce d'une LIGNE, quand il y en a plusieurs : sans ce chapeau, l'enfant perd le fil
    entre les deux produits partiels bien avant l'addition finale (avis
    `pedagogue-primaire`). `undefined` quand l'opération n'a qu'une ligne — il n'y a alors
    rien à annoncer. Affiché en tête de la PREMIÈRE colonne de sa ligne, pas comme une
    étape de plus : le volume est déjà à la limite haute du suivable. */
export function chapeauLigne(ligne: LignePosee, spec: PosedSpec): string | undefined {
	switch (ligne.role) {
		// « de ${spec.b} » : sans lui, le référent du « chiffre des unités » n'est porté que par
		// le titre du panneau, qu'un enfant qui a perdu le fil ne relie plus au calcul.
		case 'produit-partiel':
			return `D'abord, je multiplie ${spec.a} par ${ligne.multiplicateur}, le chiffre des unités de ${spec.b}.`;
		case 'produit-partiel-dizaines':
			return `Maintenant, je multiplie ${spec.a} par ${ligne.multiplicateur}, le chiffre des dizaines de ${spec.b}. Le 0 est déjà écrit : c'est lui qui décale la ligne.`;
		case 'somme-partiels':
			return `Il ne reste plus qu'à additionner mes deux lignes.`;
		default:
			return undefined;
	}
}

/** Résolution complète d'une opération posée : les lignes à écrire, chacune découpée en
    colonnes. Une addition, une soustraction ou une multiplication par un chiffre n'ont
    qu'une ligne (le résultat) ; une multiplication par un nombre à deux chiffres en a
    trois (les deux produits partiels, puis leur addition). */
export function resolutionPosee(spec: PosedSpec): ResolutionPosee {
	const { op, a, b } = spec;
	const resultat = resultatPosee(spec);
	const operation = `${a} ${signePosee(op)} ${b}`;
	if (op === '+') {
		return {
			operation,
			resultat,
			lignes: [{ role: 'total', valeur: resultat, etapes: etapesAddition(a, b) }],
		};
	}
	if (op === '-') {
		return {
			operation,
			resultat,
			lignes: [{ role: 'total', valeur: resultat, etapes: etapesSoustraction(a, b) }],
		};
	}
	if (b < 10) {
		return {
			operation,
			resultat,
			lignes: [
				{ role: 'total', valeur: resultat, multiplicateur: b, etapes: etapesMultiplication(a, b) },
			],
		};
	}
	// Multiplicateur à deux chiffres : on multiplie par les unités, puis par les dizaines
	// (le 0 de décalage est fourni par la grille), puis on additionne les deux lignes.
	const unites = b % 10;
	const dizaines = Math.floor(b / 10);
	const pp1 = a * unites;
	const pp2 = a * dizaines;
	return {
		operation,
		resultat,
		lignes: [
			{
				role: 'produit-partiel',
				valeur: pp1,
				multiplicateur: unites,
				etapes: etapesMultiplication(a, unites),
			},
			{
				role: 'produit-partiel-dizaines',
				valeur: pp2,
				multiplicateur: dizaines,
				// Le 0 des unités est fourni par la grille : cette ligne commence une colonne
				// plus à gauche que son calcul.
				decalage: 1,
				etapes: etapesMultiplication(a, dizaines),
			},
			{ role: 'somme-partiels', valeur: resultat, etapes: etapesAddition(pp1, pp2 * 10) },
		],
	};
}
