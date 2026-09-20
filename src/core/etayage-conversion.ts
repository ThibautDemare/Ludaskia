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

    L'unité DONNÉE est portée par l'exercice (`uniteConnue`, #711). Elle était auparavant
    DÉDUITE de la géométrie — « la cible est une des deux extrémités, donc l'autre extrémité
    est le départ » — ce qui ne tenait que tant que le tableau était taillé sur la paire
    convertie. La tranche fixe supprime cet invariant, et la déduction échouerait alors en
    SILENCE, de deux façons : cible à l'intérieur du tableau, plus aucun étayage ; cible au
    bord mais départ à l'intérieur, un déroulé qui démontre une conversion qui n'est pas la
    sienne. `undefined` si l'une des deux unités n'a pas de colonne, ou si elles sont
    confondues : mieux vaut ne rien montrer que désigner la mauvaise colonne. */
export function conversionDepuisTableau(ex: {
	colonnes: readonly { unite: string; nom: string; transit: boolean; chiffres: string }[];
	answerUnit: string;
	uniteConnue: string;
}): ConversionSpec | undefined {
	const presente = (u: string) => ex.colonnes.some((c) => c.unite === u);
	if (ex.uniteConnue === ex.answerUnit) return undefined;
	if (!presente(ex.uniteConnue) || !presente(ex.answerUnit)) return undefined;
	return {
		colonnes: ex.colonnes.map((c) => ({
			unite: c.unite,
			nom: c.nom,
			chiffres: c.chiffres,
			...(c.transit ? { transit: true } : {}),
		})),
		depart: ex.uniteConnue,
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

/* Index de la PREMIÈRE colonne significative : elle borne à GAUCHE le nombre donné. Depuis
   la tranche fixe (#711), le tableau commence en général bien avant lui — « 3 cm » s'écrit
   dans un tableau qui va du kilomètre au millimètre, précédé de cinq colonnes à 0. Sans
   cette borne, l'ancrage annoncerait « son dernier chiffre va dans la colonne des
   centimètres, les autres vers la gauche » en désignant des zéros qui ne sont pas des
   chiffres du nombre donné. */
function premiereSignificative(colonnes: ColonneConversion[]): number {
	for (let i = 0; i < colonnes.length - 1; i++) {
		if (Number(colonnes[i].chiffres) !== 0) return i;
	}
	return colonnes.length - 1;
}

/** Déroulé d'une conversion : on pose le nombre donné dans SES colonnes, on remplit une à
    une les colonnes qui manquent jusqu'à l'unité demandée, on complète celles qui restent,
    puis on relit. Déroulé vide (donc pas de panneau, cf. `derouleMontrable`) si l'une des
    deux unités n'est pas dans le tableau : mieux vaut ne rien montrer qu'une démonstration
    qui désigne une colonne absente. */
export function derouleConversion(spec: ConversionSpec): DerouleEtayage {
	const { colonnes } = spec;
	const iDepart = colonnes.findIndex((c) => c.unite === spec.depart);
	const iCible = colonnes.findIndex((c) => c.unite === spec.cible);
	if (iDepart < 0 || iCible < 0) return { titre: '', pas: [] };

	const valeurDepart = lireDansUnite(colonnes, iDepart);
	const valeurCible = lireDansUnite(colonnes, iCible);
	const nomDepart = colonnes[iDepart].nom;
	const nomCible = colonnes[iCible].nom;
	// Le nombre donné occupe ses colonnes entières, déborde à droite s'il est décimal
	// (« 2,5 km » remplit les kilomètres ET les hectomètres) et ne commence qu'à son premier
	// chiffre significatif : les colonnes de rang supérieur ne lui appartiennent pas.
	const debut = Math.min(iDepart, premiereSignificative(colonnes));
	const fin = Math.max(iDepart, derniereSignificative(colonnes));
	const posees = colonnes.slice(debut, fin + 1).map((_, k) => debut + k);
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
				: fin > iDepart
					? `On me donne ${valeurDepart} ${spec.depart}. ${sens} Le chiffre juste avant la virgule va dans la colonne des ${pluriel(nomDepart)}, les suivants à sa droite.`
					: `On me donne ${valeurDepart} ${spec.depart}. ${sens} Son dernier chiffre va dans la colonne des ${pluriel(nomDepart)}, les autres vers la gauche.`,
		ecritures: posees.map(ecrit),
		actifs: posees.map(cibleColonne),
	};

	// 2. Les colonnes qui manquent jusqu'à l'unité demandée, une par une, chacune NOMMÉE :
	//    c'est là que se joue la notion (le 0 tient un rang, il ne « rallonge » pas le nombre).
	//    Le chemin va vers la droite (grande → petite) ou vers la gauche (petite → grande).
	const pas: PasEtayage[] = [ancrage];
	const chemin: number[] = [];
	if (iCible > fin) for (let i = fin + 1; i <= iCible; i++) chemin.push(i);
	else if (iCible < debut) for (let i = debut - 1; i >= iCible; i--) chemin.push(i);
	for (const i of chemin) {
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

	// 3. Les colonnes encore vides HORS du chemin. Elles n'existaient pas avant la tranche
	//    fixe (#711) : le tableau affiche désormais toute l'échelle du niveau, pas le seul
	//    empan de la paire, et l'enfant doit les remplir aussi. Groupées en UN pas — ce sont
	//    des rangs où il n'y a rien, pas la notion qu'on démontre ; les détailler une à une
	//    noierait les pas qui, eux, comptent.
	//    Pas de « non plus » dans la phrase : ce pas n'est pas toujours précédé d'un pas de
	//    même nature — sur « 250 cm = ? m » le chemin est vide, et il est alors le PREMIER à
	//    parler de rangs vides. Deux phrases courtes plutôt qu'une parenthèse, aussi : elle
	//    peut énumérer jusqu'à cinq unités (avis redacteur-contenu-francais).
	const vues = new Set([...posees, ...chemin]);
	const restantes = colonnes.map((_, i) => i).filter((i) => !vues.has(i));
	if (restantes.length) {
		const noms = restantes.map((i) => pluriel(colonnes[i].nom));
		pas.push({
			phrase:
				noms.length === 1
					? `Rien à compter dans la colonne des ${noms[0]} : j'écris 0 pour qu'elle garde sa place.`
					: `Il reste des colonnes vides : ${noms.join(', ')}. J'écris 0 dans chacune pour qu'elles gardent leur place.`,
			ecritures: restantes.map(ecrit),
			actifs: restantes.map(cibleColonne),
		});
	}

	// 4. Lecture : la même case de départ, un autre point de lecture. Quand la réponse est
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
