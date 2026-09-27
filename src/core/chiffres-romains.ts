/* ============================================================
   Chiffres romains (#717) — logique PURE, sans DOM ni stockage.

   Un second système de numération, NON POSITIONNEL : la valeur d'un signe ne dépend
   pas de sa place (le X de XL vaut 10 comme celui de LX), on additionne les signes et
   on ne soustrait que dans six cas. C'est ce qui justifie un module à part plutôt
   qu'une fonction dans le fichier de la leçon : trois surfaces distinctes en
   dépendent — la GÉNÉRATION (data/maths/chiffres-romains.ts), la CORRECTION
   (`checkItemAnswer`, insensible à la casse, cf. plus bas) et le FEEDBACK d'erreur
   (`ui/session.ts`, qui nomme la règle enfreinte).

   Tout y est borné à 1-3999 : au-delà, l'usage scolaire passe par la barre de
   multiplication (V̄ = 5 000), hors périmètre de la leçon.
   ============================================================ */
import { choice, randFloat } from './utils';

/** Les sept signes, et eux seuls. */
export const VALEURS_ROMAINES: Record<string, number> = {
	I: 1,
	V: 5,
	X: 10,
	L: 50,
	C: 100,
	D: 500,
	M: 1000,
};

/** Les six formes soustractives, et six seulement. Toute autre paire « petit signe
    devant un plus grand » est fautive (`IC`, `VX`, `IL`…). */
export const FORMES_SOUSTRACTIVES: readonly string[] = ['IV', 'IX', 'XL', 'XC', 'CD', 'CM'];

/** Signes qui ne se répètent JAMAIS et ne se soustraient jamais. */
export const SIGNES_UNIQUES: readonly string[] = ['V', 'L', 'D'];

export const ROMAIN_MIN = 1;
export const ROMAIN_MAX = 3999;

/** Écriture d'UN chiffre à un rang donné, à partir de ses trois signes (unité, cinq,
    dix). Les deux seules formes soustractives d'un rang sont 4 (`un` devant `cinq`) et
    9 (`un` devant `dix`) ; tout le reste est additif, avec au plus trois répétitions de
    `un`. */
function rangRomain(d: number, un: string, cinq: string, dix: string): string {
	if (d === 4) return un + cinq;
	if (d === 9) return un + dix;
	return (d >= 5 ? cinq : '') + un.repeat(d % 5);
}

/** Écriture canonique d'un entier de 1 à 3999 — l'UNIQUE écriture valide de ce nombre.
    Hors bornes : chaîne vide (aucune écriture ne doit être fabriquée au-delà). */
export function enRomain(n: number): string {
	if (!Number.isInteger(n) || n < ROMAIN_MIN || n > ROMAIN_MAX) return '';
	return (
		'M'.repeat(Math.floor(n / 1000)) +
		rangRomain(Math.floor(n / 100) % 10, 'C', 'D', 'M') +
		rangRomain(Math.floor(n / 10) % 10, 'X', 'L', 'C') +
		rangRomain(n % 10, 'I', 'V', 'X')
	);
}

/** Forme comparable d'une saisie : espaces retirés et MAJUSCULES.

    La casse est repliée VOLONTAIREMENT, et c'est la seule tolérance du moteur
    (arbitrage mainteneur) : la saisie est déjà mise en majuscules à la frappe
    (`ui/session.ts`), mais d'autres chemins atteignent la même réponse — révision,
    bilan, collage dans le champ — et une correction sensible à la casse y compterait
    faux un « xiv » parfaitement juste. Accents et apostrophes restent exigés partout
    ailleurs (`normalizeText`) : une écriture romaine n'en contient aucun. */
export function normaliserRomain(saisie: string): string {
	return saisie.replace(/\s+/g, '').toUpperCase();
}

/** Lecture NAÏVE d'une suite de signes : somme, en soustrayant celui qui précède un
    signe plus grand. C'est ce que fait n'importe quel décodeur permissif — elle donne
    donc la valeur qu'un enfant CROIT avoir écrite (`IIII` vaut bien 4 pour elle), ce
    qui sert au diagnostic d'erreur. Elle ne VALIDE rien : voir `enNombre`. */
export function lireRomainNaif(romain: string): number {
	const s = normaliserRomain(romain);
	if (s === '') return NaN;
	let total = 0;
	for (let i = 0; i < s.length; i++) {
		const v = VALEURS_ROMAINES[s[i]];
		if (v === undefined) return NaN;
		const suivant = i + 1 < s.length ? (VALEURS_ROMAINES[s[i + 1]] ?? 0) : 0;
		total += v < suivant ? -v : v;
	}
	return total;
}

/** Nombre écrit par `romain`, SI et seulement si c'est la forme canonique. `undefined`
    pour tout le reste : `IIII`, `VX`, `IC`, `MMMM`, « ABC », vide. C'est l'unique porte
    de validation — on ne décode jamais une écriture fautive pour l'accepter ensuite. */
export function enNombre(romain: string): number | undefined {
	const s = normaliserRomain(romain);
	if (!/^[IVXLCDM]+$/.test(s)) return undefined;
	const valeur = lireRomainNaif(s);
	if (!Number.isInteger(valeur) || valeur < ROMAIN_MIN || valeur > ROMAIN_MAX) return undefined;
	return enRomain(valeur) === s ? valeur : undefined;
}

/** L'écriture est-elle la FORME CANONIQUE d'un nombre de 1 à 3999 ? */
export function estRomainCanonique(romain: string): boolean {
	return enNombre(romain) !== undefined;
}

/* ------------------------------------------------------------------
   Règle enfreinte (critère 5 de #717)
   ------------------------------------------------------------------ */

/** Identifiant STABLE de la règle qu'une écriture fautive enfreint. Le libellé affiché
    en DÉRIVE (`libelleRegleRomaine`) : un test peut donc affirmer la règle diagnostiquée
    sans figer une phrase d'écran. */
export type RegleRomaine =
	| 'signe-inconnu' // une lettre hors des sept signes
	| 'repetition-quadruple' // quatre fois le même signe d'affilée (IIII, XXXX…)
	| 'repetition-interdite' // V, L ou D écrit deux fois
	| 'soustraction-interdite' // une paire « petit devant grand » hors des six formes
	| 'ordre-des-signes' // suite mal rangée, sans faute plus précise (IXI…)
	| 'autre-nombre'; // écriture correcte, mais celle d'un AUTRE nombre

/** Ce qui cloche dans `saisie` si l'on visait `cible` (1-3999). `undefined` quand la
    saisie est vide (rien à reprocher à qui n'a pas répondu) ou quand elle EST la forme
    canonique attendue.

    L'ordre des tests va du plus concret au plus abstrait : c'est ce que l'enfant peut
    regarder dans sa propre écriture, dans cet ordre (« compte tes signes », puis
    « regarde ce qui est placé devant quoi »). Une saisie qui cumule deux fautes reçoit
    donc la plus visible, pas les deux — trois reproches à la fois ne s'entendent pas. */
export function regleEnfreinte(saisie: string, cible: number): RegleRomaine | undefined {
	const s = normaliserRomain(saisie);
	if (s === '') return undefined;
	if (s === enRomain(cible)) return undefined;
	if (!/^[IVXLCDM]+$/.test(s)) return 'signe-inconnu';
	// Les signes UNIQUES d'abord, et c'est un correctif, pas un détail d'ordre : « VVVV »
	// déclenchait le contrôle du quadruple, dont la phrase dit « au-delà de trois, on change
	// de signe » — elle enseignait donc à l'enfant que « VVV » serait correct. C'est faux : V,
	// L et D ne se répètent JAMAIS, pas même deux fois (constat redacteur-contenu-francais).
	// Conséquence assumée quand une saisie cumule les deux fautes (« VVIIII ») : les deux
	// messages sont vrais, on montre le plus SPÉCIFIQUE — celui qui ne vaut que pour trois
	// signes — plutôt que la règle générale, qu'il faudrait nuancer juste après.
	for (const signe of SIGNES_UNIQUES) {
		if (s.split(signe).length - 1 > 1) return 'repetition-interdite';
	}
	if (/(.)\1{3}/.test(s)) return 'repetition-quadruple';
	for (let i = 0; i + 1 < s.length; i++) {
		const paire = s.slice(i, i + 2);
		if (
			VALEURS_ROMAINES[s[i]] < VALEURS_ROMAINES[s[i + 1]] &&
			!FORMES_SOUSTRACTIVES.includes(paire)
		)
			return 'soustraction-interdite';
	}
	// Restent les écritures dont chaque MORCEAU est licite mais dont l'assemblage ne l'est
	// pas : soit elles ne sont canoniques de rien (IXI), soit elles écrivent bel et bien
	// un nombre — un autre que celui demandé.
	return estRomainCanonique(s) ? 'autre-nombre' : 'ordre-des-signes';
}

/** Phrase montrée à l'enfant pour une règle enfreinte. Tutoiement, une idée par phrase
    (charte des aides, #272) ; la règle est ÉNONCÉE, jamais la réponse — celle-ci est
    déjà révélée à côté. */
export function libelleRegleRomaine(regle: RegleRomaine): string {
	switch (regle) {
		case 'signe-inconnu':
			return 'Il existe seulement sept signes romains : I, V, X, L, C, D et M.';
		case 'repetition-quadruple':
			return "On n'écrit jamais quatre fois le même signe : au-delà de trois, on change de signe.";
		case 'repetition-interdite':
			return "Les signes V, L et D ne s'écrivent qu'une seule fois.";
		case 'soustraction-interdite':
			return 'Seuls IV, IX, XL, XC, CD et CM se soustraient : ailleurs, le petit signe se place après le grand.';
		case 'ordre-des-signes':
			// Recentrée sur l'ASSEMBLAGE (constat redacteur-contenu-francais) : l'ancienne
			// formulation « du plus grand au plus petit, sauf les six formes » paraphrasait mot
			// pour mot la règle de `soustraction-interdite`, et l'enfant ne pouvait pas savoir
			// laquelle des deux visait SA faute. Le test ne compare que les chaînes : il ne voit
			// pas une paraphrase. Ici la faute est ailleurs — chaque morceau est licite, c'est le
			// tout qui n'écrit rien (« IXI », « IIX »).
			return "Chaque signe pris seul est correct, mais assemblés dans cet ordre, ils n'écrivent aucun nombre.";
		case 'autre-nombre':
			return 'Cette écriture est correcte, mais elle ne donne pas le nombre demandé.';
	}
}

/* ------------------------------------------------------------------
   Paliers de difficulté (critère 4 de #717)
   ------------------------------------------------------------------ */

/** Les trois paliers de la progression, dans l'ordre où ils se travaillent :
    1. l'écriture purement ADDITIVE, sous le millier (aucune des six formes
       soustractives, donc aucun chiffre 4 ni 9) — on empile et on additionne ;
    2. les formes SOUSTRACTIVES, toujours sous le millier — le petit signe AVANT ;
    3. les MILLIERS (1000-3999), où tout se combine.

    Le palier ne se déduit PAS d'un seuil numérique (888 est du palier 1, et 4 du
    palier 2) : il se lit dans les chiffres du nombre, d'où `palierDe`. */
export type PalierRomain = 1 | 2 | 3;

export const PALIERS_ROMAINS: readonly PalierRomain[] = [1, 2, 3];

/** Un nombre de 1 à 3999 mobilise-t-il une forme soustractive ? (un chiffre 4 ou 9 sur
    les centaines, dizaines ou unités — les milliers, eux, ne s'écrivent qu'en M). */
function aUneSoustraction(n: number): boolean {
	return [Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10].some(
		(d) => d === 4 || d === 9,
	);
}

/** Palier auquel appartient un entier de 1 à 3999. */
export function palierDe(n: number): PalierRomain {
	if (n >= 1000) return 3;
	return aUneSoustraction(n) ? 2 : 1;
}

/* Partition de 1-3999 par palier, calculée une fois. Pure (aucun effet de bord à
   l'import) : trois tableaux d'entiers, ~4 000 valeurs au total. Un tirage y pioche
   UNIFORMÉMENT, ce qui garde chaque palier dense sur toute son étendue. */
const NOMBRES_PAR_PALIER: Record<PalierRomain, number[]> = { 1: [], 2: [], 3: [] };
for (let n = ROMAIN_MIN; n <= ROMAIN_MAX; n++) NOMBRES_PAR_PALIER[palierDe(n)].push(n);

/** Tous les nombres d'un palier, dans l'ordre croissant (lecture seule). */
export function nombresDuPalier(palier: PalierRomain): readonly number[] {
	return NOMBRES_PAR_PALIER[palier];
}

/** Tire un nombre au hasard DANS un palier (aléa déroutable par `withSeed`, #41). */
export function tirerNombreRomain(palier: PalierRomain): number {
	return choice(NOMBRES_PAR_PALIER[palier]);
}

/** Poids de chaque palier pour un tirage ISOLÉ (`generate()` hors session) : la
    progression y devient une FRÉQUENCE, faute d'un ordre à respecter. Le palier 1
    domine, mais les milliers restent atteignables — sinon une fiche tirée item par
    item ne montrerait jamais l'étendue annoncée par la leçon. */
const POIDS_PALIERS: Record<PalierRomain, number> = { 1: 0.4, 2: 0.35, 3: 0.25 };

/** Tire un palier selon `POIDS_PALIERS`. */
export function tirerPalierRomain(): PalierRomain {
	let reste = randFloat();
	for (const palier of PALIERS_ROMAINS) {
		reste -= POIDS_PALIERS[palier];
		if (reste < 0) return palier;
	}
	return 3;
}

/** Suite ORDONNÉE des paliers d'une série de `count` questions : les écritures
    additives d'abord, les soustractives ensuite, les milliers pour finir. C'est la
    forme observable du critère 4 — l'ordre rendu est affirmable tel quel.

    Les trois paliers sont TOUJOURS représentés dès que la série en a la place : une
    série qui s'arrêterait aux deux premiers ne couvrirait pas l'étendue 1-3999
    annoncée par la leçon. */
export function progressionPaliers(count: number): PalierRomain[] {
	if (count <= 0) return [];
	if (count <= 3) return PALIERS_ROMAINS.slice(0, count) as PalierRomain[];
	const n1 = Math.max(1, Math.round(count * POIDS_PALIERS[1]));
	const n3 = Math.max(1, Math.round(count * POIDS_PALIERS[3]));
	const n2 = Math.max(1, count - n1 - n3);
	const suite: PalierRomain[] = [
		...Array<PalierRomain>(n1).fill(1),
		...Array<PalierRomain>(n2).fill(2),
		...Array<PalierRomain>(n3).fill(3),
	];
	// `slice` de sûreté : les arrondis peuvent dépasser d'une unité sur de petits counts.
	return suite.slice(0, count);
}
