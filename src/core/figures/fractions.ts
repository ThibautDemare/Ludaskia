/* ---------- Fractions (#200 — sens, égalités, comparaison, bande graduée) ----------
   Modèle visuel UNIQUE (avis designer-ux-enfant) : la BARRE horizontale divisée en
   colonnes verticales d'égale largeur (métaphore « plaquette de chocolat »), pour
   toutes les fractions (dénominateur 2..12). Les parts sont RIGOUREUSEMENT égales
   (largeur = W/dén, garantie par le code — exigence absolue de l'issue : une part
   inégale serait un contresens). Distinction coloriée / vide par DOUBLE signal (jamais
   la seule couleur) : remplissage `--accent-soft` ET un point plein central `--accent`
   sur les parts coloriées (robuste au daltonisme), contour franc partout. */
import { type Attrs, circle, line, r2, rect, svgCanvas, text } from './primitives';

const FRAC_W = 320; // largeur viewBox des figures « barre » (plus large que haut)
const FRAC_BAR_X = 20; // marge gauche de la barre
const FRAC_BAR_W = 280; // largeur utile de la barre (parts = FRAC_BAR_W / dén)

/* Une barre divisée en `den` parts égales, les `num` premières coloriées. */
function barre(x0: number, y: number, w: number, h: number, num: number, den: number): string {
	const partW = w / den;
	const parts: string[] = [];
	for (let i = 0; i < den; i++) {
		const x = x0 + i * partW;
		const plein = i < num;
		parts.push(
			rect(r2(x), r2(y), r2(partW), r2(h), {
				fill: plein ? 'var(--accent-soft)' : 'var(--paper)',
				stroke: 'var(--accent)',
				'stroke-width': 2,
			}),
		);
		// Point central : signal de forme redondant (parts pleines lisibles sans la couleur).
		if (plein) parts.push(circle(r2(x + partW / 2), r2(y + h / 2), 3.5, { fill: 'var(--accent)' }));
	}
	return parts.join('');
}

/** Barre unique : `num` parts coloriées sur `den` (« quelle fraction est coloriée ? »). */
export function renderFractionBarre(num: number, den: number): string {
	const H = 140;
	const barH = 70;
	const y0 = (H - barH) / 2;
	return svgCanvas(
		FRAC_W,
		H,
		'Fraction',
		// On annonce le nombre de parts (aide le lecteur d'écran à dénombrer) mais
		// JAMAIS le nombre de coloriées : ce serait souffler le numérateur (la réponse).
		`Une barre partagée en ${den} parts égales ; certaines parts sont coloriées.`,
		barre(FRAC_BAR_X, y0, FRAC_BAR_W, barH, num, den),
		'figure-fraction',
	);
}

/* ---------- Axe gradué : bande 0→1 (CE2) et demi-droite 0→N (CM1, #249) ----------
   Un axe horizontal partagé en `unites × den` intervalles égaux : les multiples de `den`
   sont des BORNES ENTIÈRES (0, 1, 2… N) renforcées et numérotées, les graduations
   intermédiaires restent discrètes. Un repère corail marque la `num`-ième graduation
   (num/den). Étendre le span au-delà de 1 (`unites` > 1) donne à la fraction son STATUT DE
   NOMBRE : on lit entre quels entiers elle tombe (#249). À `unites = 1` le tracé est
   rigoureusement identique à la bande 0→1 du CE2 (mêmes bornes 0/1, mêmes graduations). */
const DD_X0 = 30;
const DD_X1 = 290;
const DD_AXIS_Y = 64;
const DD_LABEL: Attrs = {
	'text-anchor': 'middle',
	'font-family': 'var(--ui)',
	'font-weight': 700,
	'font-size': 16,
	fill: 'var(--ink)',
};

function dessinerAxeGradue(num: number, den: number, unites: number): string {
	const span = DD_X1 - DD_X0;
	const total = unites * den; // nombre d'intervalles sur tout l'axe
	const body: string[] = [
		line(DD_X0, DD_AXIS_Y, DD_X1, DD_AXIS_Y, {
			stroke: 'var(--ink)',
			'stroke-width': 2.5,
			'stroke-linecap': 'round',
		}),
	];
	// Graduations : bornes ENTIÈRES (multiples de den) renforcées, intermédiaires discrètes.
	for (let i = 0; i <= total; i++) {
		const x = DD_X0 + (i * span) / total;
		const borne = i % den === 0;
		const len = borne ? 14 : 9;
		body.push(
			line(r2(x), DD_AXIS_Y - len, r2(x), DD_AXIS_Y, {
				stroke: borne ? 'var(--ink)' : 'var(--grey)',
				'stroke-width': borne ? 2.5 : 1.5,
				'stroke-linecap': 'round',
			}),
		);
	}
	// Repère (mise en évidence corail : sa fonction officielle dans le moteur).
	const cx = DD_X0 + (num * span) / total;
	body.push(
		line(r2(cx), DD_AXIS_Y, r2(cx), DD_AXIS_Y - 22, {
			stroke: 'var(--clock-min)',
			'stroke-width': 2.5,
			'stroke-linecap': 'round',
		}),
	);
	body.push(circle(r2(cx), DD_AXIS_Y - 22, 6, { fill: 'var(--clock-min)' }));
	// Libellés des bornes entières 0, 1, … unites (sens de la graduation ; jamais la
	// fraction ni sa position, qui souffleraient la réponse — cf. desc de chaque figure).
	for (let u = 0; u <= unites; u++) {
		const x = DD_X0 + (u * den * span) / total;
		body.push(text(r2(x), DD_AXIS_Y + 26, String(u), DD_LABEL));
	}
	return body.join('');
}

/** Bande graduée de 0 à 1 (`den` intervalles) avec un repère sur la `num`-ième graduation. */
export function renderFractionBande(num: number, den: number): string {
	return svgCanvas(
		FRAC_W,
		120,
		'Bande graduée',
		// On annonce le nombre de parts, jamais la position du repère (la réponse).
		`Une bande de 0 à 1 partagée en ${den} parts égales, avec un repère sur une graduation.`,
		dessinerAxeGradue(num, den, 1),
		'figure-fraction-bande',
	);
}

/** Demi-droite graduée de 0 à `unites` (`unites × den` intervalles) : place une fraction
    ≥ 1 et donne à lire entre quels entiers consécutifs elle tombe (statut de nombre, #249). */
export function renderFractionDemiDroite(num: number, den: number, unites: number): string {
	return svgCanvas(
		FRAC_W,
		120,
		'Demi-droite graduée',
		// On annonce l'étendue (0 à N) et le partage, jamais la position du repère (la réponse).
		`Une demi-droite de 0 à ${unites} partagée en portions égales, avec un repère sur une graduation.`,
		dessinerAxeGradue(num, den, unites),
		'figure-fraction-demi-droite',
	);
}

/* Mise en page « deux barres de MÊME longueur empilées » (égalités, comparaison, somme) :
   alignées à gauche pour que la comparaison des longueurs coloriées soit visuellement
   honnête. Constantes partagées par la paire et la somme. */
const PAIRE_H = 180;
const PAIRE_BAR_H = 55;
const PAIRE_Y_HAUT = 30;
const PAIRE_Y_BAS = PAIRE_Y_HAUT + PAIRE_BAR_H + 20;

/* Corps commun : les deux barres empilées (haut/bas), avec un éventuel contenu central
   `milieu` inséré entre elles (ex. le « + » d'une somme). */
function deuxBarresEmpilees(haut: [number, number], bas: [number, number], milieu = ''): string {
	return (
		barre(FRAC_BAR_X, PAIRE_Y_HAUT, FRAC_BAR_W, PAIRE_BAR_H, haut[0], haut[1]) +
		milieu +
		barre(FRAC_BAR_X, PAIRE_Y_BAS, FRAC_BAR_W, PAIRE_BAR_H, bas[0], bas[1])
	);
}

/** Deux barres de même longueur empilées (égalités / comparaison). */
export function renderFractionPaire(haut: [number, number], bas: [number, number]): string {
	return svgCanvas(
		FRAC_W,
		PAIRE_H,
		'Deux fractions',
		'Deux barres de même longueur partagées en parts égales ; compare les parts coloriées.',
		deuxBarresEmpilees(haut, bas),
		'figure-fraction-paire',
	);
}

/** Somme de deux fractions de même dénominateur : les deux termes empilés, séparés
    par un « + » (on additionne les numérateurs, le dénominateur ne change pas). */
export function renderFractionSomme(a: [number, number], b: [number, number]): string {
	const plus = text(FRAC_W / 2, (PAIRE_Y_HAUT + PAIRE_BAR_H + PAIRE_Y_BAS) / 2, '+', {
		'text-anchor': 'middle',
		'dominant-baseline': 'central',
		'font-family': 'var(--ui)',
		'font-weight': 800,
		'font-size': 22,
		fill: 'var(--ink)',
	});
	return svgCanvas(
		FRAC_W,
		PAIRE_H,
		'Addition de fractions',
		'Deux fractions de même dénominateur à additionner, illustrées par deux barres.',
		deuxBarresEmpilees(a, b, plus),
		'figure-fraction-somme',
		'Addition de deux fractions',
	);
}

/** Fraction ≥ 1 en modèle « aire itérée » (#249) : une fraction impropre (num > den) se
    lit comme PLUSIEURS unités. On empile ⌊num/den⌋ barres ENTIÈREMENT coloriées (autant de
    « plaquettes » pleines) surmontant une barre partielle portant le reste (num % den sur
    den). La largeur de part ne change pas (FRAC_BAR_W/den) : on empile en HAUTEUR, jamais en
    largeur — lisible sur mobile même à plusieurs unités (designer #249). Plafond d'emploi :
    num < 3·den (≤ 2 unités entières → au plus 3 barres = la géométrie déjà éprouvée par
    `renderFractionPaire`) ; au-delà la fraction reste symbolique (pas de figure). */
export function renderFractionSuperieure(num: number, den: number): string {
	const entier = Math.floor(num / den);
	const reste = num % den; // ∈ [1, den-1] par construction (num non multiple de den)
	const nBarres = entier + 1; // unités pleines + la barre partielle
	const gap = 20;
	const H = PAIRE_Y_HAUT + nBarres * PAIRE_BAR_H + (nBarres - 1) * gap + PAIRE_Y_HAUT;
	const body: string[] = [];
	for (let i = 0; i < nBarres; i++) {
		const y = PAIRE_Y_HAUT + i * (PAIRE_BAR_H + gap);
		// Unités pleines EN HAUT (ordre de comptage naturel), partie fractionnaire EN BAS.
		const coloriees = i < entier ? den : reste;
		body.push(barre(FRAC_BAR_X, y, FRAC_BAR_W, PAIRE_BAR_H, coloriees, den));
	}
	return svgCanvas(
		FRAC_W,
		H,
		'Fraction plus grande que 1',
		// On annonce la structure (nombre de barres, partage) mais JAMAIS le nombre de parts
		// coloriées : ce serait souffler la réponse (même règle que `renderFractionBarre`).
		`${nBarres} barres partagées chacune en ${den} parts égales ; certaines parts sont coloriées.`,
		body.join(''),
		'figure-fraction-superieure',
	);
}

/** Collection de `den × parGroupe` jetons rangés en `den` groupes égaux, `num` coloriés
    (sens partitif sur le discret : « 1/2 de 8 », `num` paquets sur `den`). */
export function renderFractionCollection(num: number, den: number, parGroupe: number): string {
	const cols = parGroupe <= 2 ? 1 : 2;
	const rows = Math.ceil(parGroupe / cols);
	const dotR = 7;
	const dotGap = 22;
	const pad = 9;
	const groupGap = 12;
	const margin = 16;
	const boxW = cols * dotGap + 2 * pad;
	const boxH = rows * dotGap + 2 * pad;
	const W = 2 * margin + den * boxW + (den - 1) * groupGap;
	const H = 2 * margin + boxH;
	const body: string[] = [];
	for (let g = 0; g < den; g++) {
		const gx = margin + g * (boxW + groupGap);
		const plein = g < num;
		body.push(
			rect(r2(gx), margin, r2(boxW), r2(boxH), {
				rx: 8,
				fill: plein ? 'var(--accent-soft)' : 'var(--paper)',
				// Contour des groupes vides en `--grey` (≥ 3:1 sur blanc) plutôt que `--muted`
				// (sous le seuil WCAG 1.4.11) : le contour code l'état vide/plein, il doit rester
				// perceptible en basse vision (le jeton creux n'est qu'un second signal).
				stroke: plein ? 'var(--accent)' : 'var(--grey)',
				'stroke-width': 2,
			}),
		);
		for (let d = 0; d < parGroupe; d++) {
			const c = d % cols;
			const r = Math.floor(d / cols);
			const cx = gx + pad + dotGap / 2 + c * dotGap;
			const cy = margin + pad + dotGap / 2 + r * dotGap;
			// Jetons pleins (accent) dans les groupes coloriés ; contour seul ailleurs.
			body.push(
				circle(r2(cx), r2(cy), dotR, {
					fill: plein ? 'var(--accent)' : 'var(--paper)',
					stroke: plein ? 'var(--accent)' : 'var(--grey)',
					'stroke-width': 1.5,
				}),
			);
		}
	}
	return svgCanvas(
		W,
		H,
		'Collection',
		// On annonce la structure (groupes × jetons), jamais le nombre de groupes coloriés.
		`Des jetons rangés en ${den} groupes égaux de ${parGroupe} ; certains groupes sont coloriés.`,
		body.join(''),
		'figure-fraction-collection',
		'Collection en parts égales',
	);
}
