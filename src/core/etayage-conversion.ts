/* ============================================================
   Résolution GÉNÉRÉE d'une conversion au tableau (#490) — logique pure.
   ------------------------------------------------------------
   Le tableau de conversion est le frère du calcul posé : des RANGS, un chiffre par
   case, et un zéro qui n'est pas un « rien » mais une place tenue. Il relève donc du
   même traitement — du code, aucun arriéré éditorial — et du même découpage : un pas
   = une colonne (avis `pedagogue-primaire`).

   Ce que le déroulé doit dire, et que le tableau seul ne dit pas :
   - le SENS de lecture, une fois, au premier pas : grandes unités à gauche, petites à
     droite. Sans lui, l'enfant ne sait pas dans quel sens relire le nombre qu'il vient
     d'écrire, et un tableau juste se lit à l'envers ;
   - à CHAQUE colonne vide, l'unité qu'elle représente : « il n'y a aucun hectomètre
     entier à compter : j'écris 0 ». Un « j'écris 0 » sec est exactement le « écris 2,
     retiens 1 » du calcul posé : le geste sans la notion. C'est aussi ce que dit déjà
     l'explication d'après-coup du runner (`explicationTransit`), mais une fois la
     réponse donnée — ici on le dit AU MOMENT où la case se remplit ;
   - jamais « on ajoute des zéros » ni « on décale la virgule ». Ce raccourci marche sur
     les entiers et casse au premier décimal (3,2 km = 3 200 m, et non 32 000) : le
     déroulé arme une règle qui explosera au CM1 s'il l'emploie. On place des chiffres
     dans des colonnes, on ne fabrique pas des zéros.

   Le tableau se LIT dans l'unité qu'on veut : c'est toute la notion, et c'est une seule
   fonction pure ici (`lireDansUnite`), qui sert autant à retrouver le nombre donné qu'à
   énoncer la réponse. Aucun DOM, aucune dépendance au rendu.
   ============================================================ */
import type { DerouleEtayage, EcritureEtayage, PasEtayage } from './etayage-deroule';
import { formatNombre } from './nombres';

/** Une colonne du tableau : son symbole, son nom complet au singulier, et le chiffre
    attendu dedans (la colonne de tête en porte un ou deux, comme dans l'exercice). */
export interface ColonneConversion {
	unite: string;
	nom: string;
	chiffres: string;
	/** Unité non étudiée au niveau : en-tête démoté et case en pointillés (cf. le runner). */
	transit?: boolean;
}

/** Une conversion à dérouler : le tableau rempli (la réponse), plus les deux unités qui
    en font une question — celle qu'on donne et celle qu'on cherche. Les valeurs, elles,
    ne sont pas données : elles se LISENT dans le tableau, ce qui évite de les tenir en
    double et fait porter la démonstration par la notion elle-même. */
export interface ConversionSpec {
	colonnes: ColonneConversion[]; // GRANDE unité d'abord (l'ordre du tableau à l'écran)
	depart: string; // symbole de l'unité donnée
	cible: string; // symbole de l'unité demandée
}

/** Clé de la case de la colonne d'index `i`. */
export function cibleColonne(i: number): string {
	return `c${i}`;
}

/** Spécification tirée de l'exercice que l'enfant vient de RATER, pour lui dérouler sa
    conversion à lui et pas un exemple voisin.

    L'unité DONNÉE ne figure nulle part en clair dans l'exercice (elle n'existe que dans
    l'énoncé, en texte). On ne la relit pas là-dedans : on la déduit de la STRUCTURE, qui
    est un invariant du générateur — le tableau couvre exactement l'empan entre la grande et
    la petite unité de la paire convertie, et l'unité cherchée est l'une des deux extrémités.
    L'autre extrémité est donc l'unité donnée. `undefined` si cet invariant ne tient pas :
    on préfère ne rien montrer à désigner la mauvaise colonne. */
export function conversionDepuisTableau(ex: {
	colonnes: readonly { unite: string; nom: string; transit: boolean; chiffres: string }[];
	answerUnit: string;
}): ConversionSpec | undefined {
	const premier = ex.colonnes[0]?.unite;
	const dernier = ex.colonnes[ex.colonnes.length - 1]?.unite;
	if (!premier || !dernier) return undefined;
	const depart =
		ex.answerUnit === premier ? dernier : ex.answerUnit === dernier ? premier : undefined;
	if (depart === undefined || depart === ex.answerUnit) return undefined;
	return {
		colonnes: ex.colonnes.map((c) => ({
			unite: c.unite,
			nom: c.nom,
			chiffres: c.chiffres,
			...(c.transit ? { transit: true } : {}),
		})),
		depart,
		cible: ex.answerUnit,
	};
}

/* Pluriel des noms d'unités : régulier pour toutes les unités métriques de l'appli
   (mètre, gramme, litre et leurs préfixes). Même règle que le runner du tableau. */
function pluriel(nom: string): string {
	return `${nom}s`;
}

/** Le nombre écrit dans le tableau, LU dans l'unité de la colonne `i` : les colonnes de
    gauche jusqu'à `i` forment la partie entière, celles de droite la partie décimale.
    C'est la notion entière du tableau de conversion en une fonction — et la raison pour
    laquelle un même tableau donne « 3 » en kilomètres et « 3000 » en mètres.
    Les zéros inutiles disparaissent des deux côtés (« 045 » → « 45 », « 2,500 » → « 2,5 »),
    comme les écrit un enfant. */
export function lireDansUnite(colonnes: ColonneConversion[], i: number): string {
	const entier = colonnes
		.slice(0, i + 1)
		.map((c) => c.chiffres)
		.join('')
		.replace(/^0+(?=\d)/, '');
	const decimal = colonnes
		.slice(i + 1)
		.map((c) => c.chiffres)
		.join('')
		.replace(/0+$/, '');
	// Groupement des milliers comme partout ailleurs dans l'appli (20 000 mm, pas 20000) —
	// mais seulement sur un entier : `formatNombre` ne sait pas écrire une virgule française.
	return decimal ? `${entier},${decimal}` : formatNombre(Number(entier));
}

/* Index de la dernière colonne qui porte un chiffre significatif (0 si le tableau est
   tout à zéro) : c'est elle qui borne à droite le nombre DONNÉ quand il est décimal. */
function derniereSignificative(colonnes: ColonneConversion[]): number {
	for (let i = colonnes.length - 1; i > 0; i--) {
		if (Number(colonnes[i].chiffres) !== 0) return i;
	}
	return 0;
}

/** Déroulé d'une conversion : on pose le nombre donné dans SES colonnes, on remplit une à
    une les colonnes qui manquent jusqu'à l'unité demandée, puis on relit. Déroulé vide
    (donc pas de panneau, cf. `derouleMontrable`) si l'une des deux unités n'est pas dans
    le tableau : mieux vaut ne rien montrer qu'une démonstration qui désigne une colonne
    absente. */
export function derouleConversion(spec: ConversionSpec): DerouleEtayage {
	const { colonnes } = spec;
	const iDepart = colonnes.findIndex((c) => c.unite === spec.depart);
	const iCible = colonnes.findIndex((c) => c.unite === spec.cible);
	if (iDepart < 0 || iCible < 0) return { titre: '', pas: [] };

	const valeurDepart = lireDansUnite(colonnes, iDepart);
	const valeurCible = lireDansUnite(colonnes, iCible);
	const nomDepart = colonnes[iDepart].nom;
	const nomCible = colonnes[iCible].nom;
	// Le nombre donné occupe ses colonnes entières, et déborde à droite s'il est décimal
	// (« 2,5 km » remplit les kilomètres ET les hectomètres).
	const finDepart = Math.max(iDepart, derniereSignificative(colonnes));
	const posees = colonnes.slice(0, finDepart + 1);
	const ecrit = (i: number): EcritureEtayage => ({
		cible: cibleColonne(i),
		texte: colonnes[i].chiffres,
	});

	// 1. Ancrage : où va le nombre qu'on me donne, et dans quel sens se lit le tableau.
	const sens = 'Dans le tableau, les grandes unités sont à gauche et les petites à droite.';
	const ancrage: PasEtayage = {
		// Trois cas, et pas un seul gabarit : le nombre donné tient dans une case, s'étale vers
		// la GAUCHE (un entier de plusieurs chiffres) ou déborde vers la DROITE (un décimal).
		// Un texte unique aurait envoyé l'enfant du mauvais côté deux fois sur trois. Et jamais
		// « le chiffre des unités » ici : le mot « unité » désigne déjà l'unité de MESURE dans
		// la même phrase, et c'est précisément la confusion que la leçon combat.
		phrase:
			posees.length === 1
				? `On me donne ${valeurDepart} ${spec.depart}. ${sens} J'écris ${valeurDepart} dans la colonne des ${pluriel(nomDepart)}.`
				: finDepart > iDepart
					? `On me donne ${valeurDepart} ${spec.depart}. ${sens} Le chiffre juste avant la virgule va dans la colonne des ${pluriel(nomDepart)}, les suivants à sa droite.`
					: `On me donne ${valeurDepart} ${spec.depart}. ${sens} Son dernier chiffre va dans la colonne des ${pluriel(nomDepart)}, les autres vers la gauche.`,
		ecritures: posees.map((_, i) => ecrit(i)),
		actifs: posees.map((_, i) => cibleColonne(i)),
	};

	// 2. Les colonnes qui manquent jusqu'à l'unité demandée, une par une, chacune NOMMÉE :
	//    c'est là que se joue la notion (le 0 tient un rang, il ne « rallonge » pas le nombre).
	const pas: PasEtayage[] = [ancrage];
	for (let i = finDepart + 1; i <= iCible; i++) {
		// « La colonne reste vide », et non « il n'y a aucun mètre » : sur la colonne CIBLE, la
		// seconde formulation contredirait la conclusion (3 km = 3 000 m, il y a bien des
		// mètres). Ce qui est vrai des deux, c'est le RANG : rien à cette place-là, donc un 0
		// pour la tenir. C'est aussi le mot du runner (« marquer le rang vide »).
		pas.push({
			phrase: `Rien à compter dans la colonne des ${pluriel(colonnes[i].nom)} : j'écris 0 pour qu'elle garde sa place.`,
			ecritures: [ecrit(i)],
			actifs: [cibleColonne(i)],
		});
	}

	// 3. Lecture : la même case de départ, un autre point de lecture. Quand la réponse est
	//    décimale, on dit OÙ tombe la virgule (juste après la colonne demandée) — et jamais
	//    qu'on la « décale », qui ferait croire à un déplacement mécanique.
	const lecture = valeurCible.includes(',')
		? `L'unité demandée, c'est le ${nomCible} : la virgule se place juste après sa colonne. Je lis ${valeurCible}.`
		: `Je lis le nombre jusqu'à la colonne des ${pluriel(nomCible)} : ${valeurCible}.`;
	pas.push({
		phrase: `${lecture} Donc ${valeurDepart} ${spec.depart} = ${valeurCible} ${spec.cible}.`,
		actifs: [cibleColonne(iCible)],
	});

	return { titre: `${valeurDepart} ${spec.depart} = ? ${spec.cible}`, pas };
}
