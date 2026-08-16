/* ============================================================
   Résolution GÉNÉRÉE d'une question de numération (#490) — logique pure.
   ------------------------------------------------------------
   Valeur de position et décomposition : quatre questions qui se ressemblent à l'œil et
   qui ne demandent PAS le même geste (cf. data/maths/position.ts). Les confondre est
   précisément l'erreur que ces leçons testent, donc le déroulé doit les séparer :

   - `chiffre` — « quel est le chiffre des centaines ? » : une LECTURE, la case du rang,
     un seul chiffre, rien à calculer ;
   - `entout` — « combien de centaines EN TOUT ? » : une autre manipulation, celle qu'on
     rate. On masque tout ce qui est à droite du rang et on lit ce qui reste (dans 3 472,
     34 centaines, et non 4). Le déroulé le dit explicitement, sinon il renforce la
     confusion au lieu de la lever (avis `pedagogue-primaire`) ;
   - `rangs` — « 3 472 = 3 milliers + @ centaines + … » : la décomposition additive ;
   - `multiplicative` — « 3 × 1000 + @ × 100 + … » (CM1), la même en produits.

   Le zéro intercalaire (305, 4 070) a sa phrase à lui : il n'est pas un trou, il tient un
   rang. Sans ça, l'enfant lit « il n'y a rien » et saute la colonne.

   Le générateur, lui, produit une CHAÎNE déjà formatée (« 3 472 = 3 milliers + @ … ») et
   ne garde ni le nombre ni le rang troué : on ne peut donc pas reconstruire la question
   qu'un enfant vient de rater. Ce module part d'une spécification EXPLICITE, celle que la
   leçon déclare dans son contenu d'étayage. Conséquence assumée, et documentée côté
   données : ces leçons montrent leur exemple canonique, pas l'item raté.
   ============================================================ */
import type { DerouleEtayage, PasEtayage } from './etayage-deroule';
import { formatNombre, genreRang, nomRang, quantiteRang } from './nombres';

/** Les quatre questions de la famille, dans les termes de `data/maths/position.ts`. */
export type GenrePosition = 'chiffre' | 'entout' | 'rangs' | 'multiplicative';

/** La question à dérouler : son genre, le nombre en jeu, et le rang dont on parle
    (0 = les unités, comme partout ailleurs). */
export interface PositionSpec {
	genre: GenrePosition;
	n: number;
	rang: number;
}

/** Un pas de numération : en plus de ce qu'on surligne, ce qu'on MASQUE — « je cache les
    chiffres à droite » est le geste même de la question « combien en tout », et il ne se
    raconte pas sans se montrer. */
export interface PasPosition extends PasEtayage {
	masques?: string[];
}

export interface DeroulePosition extends DerouleEtayage {
	pas: PasPosition[];
}

/** Clé de la case du rang `rang` (0 = les unités). */
export function cibleRang(rang: number): string {
	return `rang${rang}`;
}

/** Chiffres du nombre par RANG (unités d'abord) : l'ordre de la numération. */
export function chiffresParRang(n: number): number[] {
	return String(n).split('').reverse().map(Number);
}

/* Le chiffre du rang, et la quantité TOTALE de ce rang (ce qui reste quand on masque la
   droite) : les deux réponses que les enfants confondent, calculées côté à côté pour que
   la narration puisse les opposer. */
const chiffreDe = (n: number, rang: number) => Math.floor(n / 10 ** rang) % 10;
const totalDe = (n: number, rang: number) => Math.floor(n / 10 ** rang);

/* Termes de la décomposition, du rang le plus haut au plus bas. `produit` donne la forme
   multiplicative (« 4 × 100 ») plutôt que la forme en rangs (« 4 centaines »). */
function termes(n: number, produit: boolean): string[] {
	const chiffres = chiffresParRang(n);
	const out: string[] = [];
	for (let r = chiffres.length - 1; r >= 0; r--) {
		out.push(produit ? `${chiffres[r]} × ${formatNombre(10 ** r)}` : quantiteRang(chiffres[r], r));
	}
	return out;
}

/* « aucune dizaine », mais « aucun millier » : le genre vient de la table commune des rangs
   (core/nombres.ts), jamais d'une liste d'index recopiée ici — elle divergerait au premier
   rang ajouté. Sans cet accord, la phrase du zéro intercalaire disait « aucune millier »
   (constat du `redacteur-contenu-francais`, sur un cas encore dormant). */
function aucun(rang: number): string {
	return genreRang(rang) === 'm' ? 'aucun' : 'aucune';
}

/* Le rang d'un zéro INTERCALAIRE (jamais celui de tête, qui n'existe pas), ou -1. On ne
   nomme que le premier : deux phrases sur deux zéros diraient deux fois la même chose. */
function zeroIntercalaire(n: number): number {
	const chiffres = chiffresParRang(n);
	for (let r = chiffres.length - 2; r >= 0; r--) {
		if (chiffres[r] === 0) return r;
	}
	return -1;
}

/** Déroulé d'une question de numération. Vide (donc pas de panneau) si le rang demandé
    n'existe pas dans le nombre ou n'a pas de nom : une démonstration qui désigne une case
    absente vaut moins que la règle seule. */
export function deroulePosition(spec: PositionSpec): DeroulePosition {
	const { genre, n, rang } = spec;
	const chiffres = chiffresParRang(n);
	const nom = nomRang(rang);
	const nomSingulier = nomRang(rang, false);
	if (!nom || !nomSingulier || rang >= chiffres.length) return { titre: '', pas: [] };
	const nombre = formatNombre(n);
	const chiffre = chiffreDe(n, rang);
	const pas: PasPosition[] = [];

	// 1. Poser les rangs. Le détail (quel chiffre pour quel rang) est porté par la FIGURE,
	//    qui le montre d'un coup d'œil ; l'énumérer en toutes lettres jusqu'au million
	//    ferait une phrase que personne ne suit.
	pas.push({
		phrase: `Je pose ${nombre} rang par rang : je commence par la droite, c'est la colonne des unités.`,
		actifs: chiffres.map((_, r) => cibleRang(r)),
	});

	// 2. Le zéro qui tient un rang, quand il y en a un.
	const zero = zeroIntercalaire(n);
	if (zero >= 0) {
		pas.push({
			phrase: `Le 0 des ${nomRang(zero)} n'est pas un trou : il dit qu'il n'y a ${aucun(zero)} ${nomRang(zero, false)}, et il garde la place pour que les autres chiffres restent à leur rang.`,
			actifs: [cibleRang(zero)],
		});
	}

	if (genre === 'chiffre') {
		pas.push({
			phrase: `On me demande le chiffre des ${nom} : c'est UNE seule case, celle des ${nom}. Ici, c'est ${chiffre}.`,
			actifs: [cibleRang(rang)],
		});
		return { titre: `Le chiffre des ${nom} de ${nombre}`, pas };
	}

	if (genre === 'entout') {
		const total = totalDe(n, rang);
		const droite = Array.from({ length: rang }, (_, r) => cibleRang(r));
		pas.push({
			phrase: `Attention : on ne demande pas le chiffre des ${nom}, qui est ${chiffre}. On demande combien il y a de ${nom} dans TOUT le nombre.`,
			actifs: [cibleRang(rang)],
		});
		pas.push({
			// `quantiteRang` et non `${total} ${nom}` : le total peut valoir 1 (dans 105, il y a
			// UNE centaine en tout), et « 1 centaines » est faux.
			phrase:
				`Je cache tout ce qui est à droite des ${nom}. Il reste ${formatNombre(total)} : ` +
				`il y a ${quantiteRang(total, rang)} en tout dans ${nombre}.`,
			masques: droite,
			actifs: chiffres.slice(rang).map((_, i) => cibleRang(rang + i)),
		});
		return { titre: `Les ${nom} de ${nombre}`, pas };
	}

	// Décomposition : le terme manquant se LIT dans la case de son rang, puis on relit tout
	// pour vérifier que la somme redonne bien le nombre de départ.
	const produit = genre === 'multiplicative';
	pas.push({
		phrase: produit
			? `Le terme qui manque est celui des ${nom} : je regarde leur case. C'est ${chiffre}, donc ${chiffre} × ${formatNombre(10 ** rang)}.`
			: `Le terme qui manque, ce sont les ${nom} : je regarde leur case. C'est ${chiffre}, donc ${quantiteRang(chiffre, rang)}.`,
		actifs: [cibleRang(rang)],
	});
	pas.push({
		phrase: `Je relis tout : ${termes(n, produit).join(' + ')} = ${nombre}.`,
		actifs: chiffres.map((_, r) => cibleRang(r)),
	});
	return { titre: `Décomposer ${nombre}`, pas };
}
