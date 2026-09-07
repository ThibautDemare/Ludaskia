/* ============================================================
   Sudoku (#666) — smoke e2e, contre les critères numérotés de l'issue.

   Ce que couvrent les 151 tests Vitest et qui n'a donc rien à faire ici : la
   génération (critères 3 et 4, par échantillon large), le décompte des conflits,
   les cases liées, la persistance et son bornage à la lecture. Ici, uniquement
   ce qui ne se vérifie que dans un navigateur.

   Sélecteurs stables : `.sudoku-taille[data-taille]`, `.sudoku-grille[data-cotes]`,
   `.sudoku-case[data-index]` et ses `data-valeur` / `data-fixe` / `data-conflit` /
   `data-lie` / `data-meme`, `.sudoku-symbole[data-valeur]`, `#sudokuEffacer`,
   `#sudokuRecommencer`, `#sudokuNouvelle`, `.sudoku-fin`, `#sudokuEcouterRegle`.

   ── Ce que cette spec NE teste PAS, et pourquoi ──────────────────────────────
   Le critère 36 (fin de grille calme, sans confettis ni modale) relève d'un
   JUGEMENT : l'issue le dit dans ses Notes, aucun test ne le tiendra, c'est une
   relecture `designer-ux-enfant` à demander dans la PR. Le critère 8
   (silhouettes distinguables) est tenu côté Vitest par la table des familles
   visuelles, et son reste — deux formes se confondent-elles vraiment pour un
   enfant de 8 ans sur un écran d'entrée de gamme — ne se mesure pas non plus
   ici.

   La complétion de grille exploite le critère 6 : la TOUTE PREMIÈRE grille d'un
   profil ne compte qu'une ou deux cases vides, donc la gagner pour de vrai coûte
   deux appuis. La valeur à poser est déduite de la RÈGLE DU JEU (une forme par
   ligne, par colonne, par bloc), pas lue dans l'implémentation.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedJeuxPossedesScript, ouvrirEtagere } from './helpers';

declare global {
	interface Window {
		/** Compteur posé par `ESPION_TTS` : combien de fois l'application a parlé. */
		__ttsAppels: number;
	}
}

/** Enregistre les appels à la synthèse vocale, pour prouver qu'on ne parle pas
    tout seul (critère 23). Posé AVANT le chargement de l'application. */
const ESPION_TTS = `(function(){
	window.__ttsAppels = 0;
	try {
		var s = window.speechSynthesis;
		if (s && typeof s.speak === 'function') {
			var vrai = s.speak.bind(s);
			s.speak = function(u){ window.__ttsAppels++; return vrai(u); };
		}
	} catch (e) {}
})();`;

/* On désigne le jeu par `data-jeu="sudoku"` plutôt que « le premier de la
   liste » : c'est plus précis, ça ne dépend pas de l'ordre de l'étagère, et
   c'est le marqueur que `tests/couverture-e2e-gate.test.ts` cherche pour
   rattacher ce fichier au runner. */
async function entrerDansLeJeu(page: Page): Promise<void> {
	await ouvrirEtagere(page);
	await page.locator('.jeu-item[data-jeu="sudoku"]').click();
	await page.locator('#jeuEcran').waitFor({ state: 'visible' });
	await expect(page.locator('.sudoku-grille')).toBeVisible();
}

async function ouvrirSudoku(page: Page): Promise<void> {
	await page.addInitScript(seedJeuxPossedesScript(['sudoku']));
	await gotoHash(page, 'accueil');
	await entrerDansLeJeu(page);
}

interface EtatGrille {
	cotes: number;
	valeurs: number[];
	fixes: boolean[];
}

async function lireGrille(page: Page): Promise<EtatGrille> {
	return page.evaluate(() => {
		const grille = document.querySelector('.sudoku-grille');
		const cases = [...document.querySelectorAll('.sudoku-case')] as HTMLElement[];
		const ordonnees = cases.sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
		return {
			cotes: Number(grille?.getAttribute('data-cotes') ?? 0),
			valeurs: ordonnees.map((c) => Number(c.dataset.valeur)),
			fixes: ordonnees.map((c) => c.dataset.fixe === '1'),
		};
	});
}

/** Les valeurs encore possibles pour une case, d'après la RÈGLE DU JEU seule.
    Régions 2×2 : on ne s'en sert que sur le 4×4, dont le découpage est le seul
    que l'issue fixe sans ambiguïté. */
function candidats(e: EtatGrille, index: number): number[] {
	const n = e.cotes;
	const x = index % n;
	const y = Math.floor(index / n);
	const pris = new Set<number>();
	for (let i = 0; i < n; i++) {
		pris.add(e.valeurs[y * n + i]);
		pris.add(e.valeurs[i * n + x]);
	}
	const rx = Math.floor(x / 2) * 2;
	const ry = Math.floor(y / 2) * 2;
	for (let dy = 0; dy < 2; dy++) {
		for (let dx = 0; dx < 2; dx++) pris.add(e.valeurs[(ry + dy) * n + rx + dx]);
	}
	const out: number[] = [];
	for (let v = 1; v <= n; v++) if (!pris.has(v)) out.push(v);
	return out;
}

/** Le geste du critère 10, dans l'ordre : la case, PUIS la forme. */
async function poser(page: Page, index: number, valeur: number): Promise<void> {
	await page.locator(`.sudoku-case[data-index="${index}"]`).click();
	await page.locator(`.sudoku-symbole[data-valeur="${valeur}"]`).click();
}

/* ---------- Critères 10, 11, 13 et 15 ---------- */

test('critères 10, 13 et 15 : poser en deux temps, un doublon marque TOUTES les cases en cause sans bloquer la pose, en registre --warn', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirSudoku(page);

	const etat = await lireGrille(page);
	const vide = etat.valeurs.findIndex((v, i) => v === 0 && !etat.fixes[i]);
	expect(vide, 'la grille doit laisser au moins une case à jouer').toBeGreaterThanOrEqual(0);

	// Une valeur DÉJÀ présente sur la ligne de cette case : le conflit est garanti,
	// et il met en cause une case DONNÉE, pas seulement celle que l'enfant pose.
	const n = etat.cotes;
	const ligne = Math.floor(vide / n);
	const voisine = [...Array(n).keys()].map((i) => ligne * n + i).find((i) => etat.valeurs[i] !== 0);
	expect(voisine, 'il faut une case déjà remplie sur la ligne').not.toBeUndefined();
	const enDouble = etat.valeurs[voisine as number];

	await poser(page, vide, enDouble);

	// Critère 13 : la pose n'est PAS bloquée.
	await expect(page.locator(`.sudoku-case[data-index="${vide}"]`)).toHaveAttribute(
		'data-valeur',
		String(enDouble),
	);
	// Critère 13 : les DEUX cases sont marquées, pas seulement la dernière posée.
	const marquees = page.locator('.sudoku-case[data-conflit]');
	expect(await marquees.count()).toBeGreaterThanOrEqual(2);
	await expect(page.locator(`.sudoku-case[data-index="${vide}"]`)).toHaveAttribute(
		'data-conflit',
		'1',
	);
	await expect(page.locator(`.sudoku-case[data-index="${voisine}"]`)).toHaveAttribute(
		'data-conflit',
		'1',
	);

	/* Critère 15 : registre `--warn`, jamais `--ko`, et aucune marque de
	   correction d'exercice. Un enfant qui verrait la couleur de ses fautes de
	   calcul y lirait un verdict, quelle que soit l'architecture derrière. */
	const registre = await page.evaluate(() => {
		const rgb = (hex: string): string => {
			const h = hex.trim().replace('#', '');
			const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16);
			return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
		};
		const racine = getComputedStyle(document.documentElement);
		const cible = document.querySelector('.sudoku-case[data-conflit]') as HTMLElement;
		const style = getComputedStyle(cible);
		const peint = `${style.boxShadow} ${style.backgroundImage} ${style.backgroundColor}`;
		return {
			warn: peint.includes(rgb(racine.getPropertyValue('--warn'))),
			ko: peint.includes(rgb(racine.getPropertyValue('--ko'))),
		};
	});
	expect(registre.warn, 'le conflit doit emprunter --warn').toBe(true);
	expect(registre.ko, '--ko est réservé à une réponse définitivement fausse').toBe(false);
	expect(await page.locator('#jeuEcran .mark, #jeuEcran .correct, #jeuEcran .wrong').count()).toBe(
		0,
	);

	// Critère 11 : effacer est un bouton explicite, pas un geste modifié.
	await page.locator(`.sudoku-case[data-index="${vide}"]`).click();
	await page.locator('#sudokuEffacer').click();
	await expect(page.locator(`.sudoku-case[data-index="${vide}"]`)).toHaveAttribute(
		'data-valeur',
		'0',
	);
	expect(await page.locator('.sudoku-case[data-conflit]').count()).toBe(0);

	expect(errors).toEqual([]);
});

/* ---------- Critère 16 ---------- */

test('critère 16 : toucher une case éclaire sa ligne, sa colonne et son bloc, et n’y écrit rien', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirSudoku(page);

	const avant = await lireGrille(page);
	await page.locator('.sudoku-case[data-index="0"]').click();

	// 7 cases liées au 4×4 : 3 de ligne, 3 de colonne, 3 de région, moins deux
	// recouvrements. La case choisie elle-même n'en fait jamais partie.
	expect(await page.locator('.sudoku-case[data-lie]').count()).toBe(7);
	await expect(page.locator('.sudoku-case[data-index="0"]')).not.toHaveAttribute('data-lie', '1');

	/* Toucher une case SÉLECTIONNE et n'écrit pas, même si une forme est déjà
	   choisie : sans ça, l'enfant qui explore la grille pour comprendre ses
	   contraintes la remplirait sans le vouloir, et l'aide se retournerait
	   contre elle-même. */
	await page.locator('.sudoku-symbole[data-valeur="1"]').first().click();
	await page.locator('.sudoku-case[data-index="0"]').click();
	await page.locator('.sudoku-case[data-index="3"]').click();
	const apres = await lireGrille(page);
	const modifiees = apres.valeurs.filter((v, i) => v !== avant.valeurs[i]).length;
	expect(modifiees, 'toucher des cases ne doit rien écrire').toBeLessThanOrEqual(1);

	expect(errors).toEqual([]);
});

/* ---------- Critères 6, 12 et 19 ---------- */

test('critères 6, 12 et 19 : la première grille se termine en deux appuis, le panneau de fin s’affiche, la suivante est neuve', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirSudoku(page);

	// Critère 12 : le repli est là AVANT tout, sans détection de blocage.
	await expect(page.locator('#sudokuRecommencer')).toBeVisible();

	// Critère 6 : une ou deux cases vides sur la toute première grille du profil.
	let etat = await lireGrille(page);
	const vides = etat.valeurs.filter((v) => v === 0).length;
	expect(vides).toBeGreaterThanOrEqual(1);
	expect(vides).toBeLessThanOrEqual(2);
	await expect(page.locator('.sudoku-fin')).toBeHidden();

	// On résout en ne posant QUE les cases à candidat unique, comme la règle du
	// jeu le permet — c'est ce que l'enfant fait.
	for (let tour = 0; tour < 4; tour++) {
		etat = await lireGrille(page);
		if (!etat.valeurs.includes(0)) break;
		const cible = etat.valeurs.findIndex((v, i) => v === 0 && candidats(etat, i).length === 1);
		expect(cible, 'une case doit avoir un candidat unique').toBeGreaterThanOrEqual(0);
		await poser(page, cible, candidats(etat, cible)[0]);
	}

	await expect(page.locator('.sudoku-fin')).toBeVisible();
	await expect(page.locator('.sudoku-case[data-conflit]')).toHaveCount(0);

	// Critère 19 : terminer libère l'emplacement, la suivante n'est pas la même.
	await page.locator('#sudokuNouvelle').click();
	await expect(page.locator('.sudoku-fin')).toBeHidden();
	const neuve = await lireGrille(page);
	expect(neuve.valeurs.filter((v) => v === 0).length).toBeGreaterThan(2);

	expect(errors).toEqual([]);
});

/* ---------- Critères 1 et 17 ---------- */

test('critères 1 et 17 : la taille choisie est reproposée, et la grille en cours se retrouve telle quelle', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirSudoku(page);

	await expect(page.locator('.sudoku-taille[data-taille="4"]')).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await page.locator('.sudoku-taille[data-taille="6"]').click();
	await expect(page.locator('.sudoku-grille')).toHaveAttribute('data-cotes', '6');
	await expect(page.locator('.sudoku-taille[data-taille="6"]')).toHaveAttribute(
		'aria-pressed',
		'true',
	);

	// Un coup, puis on quitte : le plafond peut tomber et l'onglet se fermer, donc
	// la grille est sauvée à CHAQUE coup et non à la sortie.
	const etat = await lireGrille(page);
	const vide = etat.valeurs.findIndex((v, i) => v === 0 && !etat.fixes[i]);
	await poser(page, vide, 1);
	await expect(page.locator(`.sudoku-case[data-index="${vide}"]`)).toHaveAttribute(
		'data-valeur',
		'1',
	);

	await page.locator('#btnQuitterJeu').click();
	await expect(page.locator('#jeuxEtagere')).toBeVisible();
	await page.locator('.jeu-item[data-jeu="sudoku"]').click();
	await expect(page.locator('.sudoku-grille')).toBeVisible();

	// Critère 1 : c'est bien le 6×6 qu'on retrouve, sans avoir à rechoisir.
	await expect(page.locator('.sudoku-grille')).toHaveAttribute('data-cotes', '6');
	// Critère 17 : et la forme posée est toujours là.
	await expect(page.locator(`.sudoku-case[data-index="${vide}"]`)).toHaveAttribute(
		'data-valeur',
		'1',
	);

	expect(errors).toEqual([]);
});

/* ---------- Critères 21 et 22 ---------- */

test('critères 21 et 22 : l’adulte peut couper les aides visuelles, sans toucher au compte des aménagements', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedJeuxPossedesScript(['sudoku']));
	await gotoHash(page, 'encadrant/reglages');

	/* Critère 22 : le réglage porte `set-jeux-pref`. Le total des aménagements
	   d'apprentissage ne bouge pas — une aide de jeu ne lève aucun obstacle
	   d'apprentissage, et le critère 35 interdit de faire échouer la spec qui
	   affirme ce total. */
	const bascule = page.locator('[data-act="set-jeux-pref"][data-pref="sansAidesJeux"]');
	await expect(bascule).toBeVisible();
	expect(await page.locator('[data-act="set-amenagement"]').count()).toBe(4);

	await bascule.check();
	await gotoHash(page, 'accueil');
	await entrerDansLeJeu(page);

	// Aides coupées : ni mise en évidence, ni marquage de doublon.
	const etat = await lireGrille(page);
	const n = etat.cotes;
	const vide = etat.valeurs.findIndex((v, i) => v === 0 && !etat.fixes[i]);
	const ligne = Math.floor(vide / n);
	const voisine = [...Array(n).keys()]
		.map((i) => ligne * n + i)
		.find((i) => etat.valeurs[i] !== 0) as number;

	await page.locator(`.sudoku-case[data-index="${vide}"]`).click();
	expect(await page.locator('.sudoku-case[data-lie]').count()).toBe(0);
	await page.locator(`.sudoku-symbole[data-valeur="${etat.valeurs[voisine]}"]`).click();
	// La pose a bien eu lieu : couper l'aide ne change pas la règle du jeu.
	await expect(page.locator(`.sudoku-case[data-index="${vide}"]`)).toHaveAttribute(
		'data-valeur',
		String(etat.valeurs[voisine]),
	);
	expect(await page.locator('.sudoku-case[data-conflit]').count()).toBe(0);

	expect(errors).toEqual([]);
});

/* ---------- Critères 24 et 28 ---------- */

test('critères 24 et 28 : à 360 px la palette tient dans l’écran, et rien ne compte le temps ni les coups', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 360, height: 640 });
	await ouvrirSudoku(page);

	// Critère 24 : la palette est dans l'écran, sans débordement horizontal.
	const boite = await page.locator('.sudoku-palette').boundingBox();
	expect(boite).not.toBeNull();
	expect(boite?.x ?? -1).toBeGreaterThanOrEqual(0);
	expect((boite?.x ?? 0) + (boite?.width ?? 0)).toBeLessThanOrEqual(360);
	expect(await page.locator('.sudoku-symbole').count()).toBeGreaterThanOrEqual(4);

	/* Critère 28 : aucun chiffre visible en dehors des libellés de taille. Le
	   compteur de COUPS est la moitié que les gates statiques ne voient pas — il
	   n'a besoin d'aucune horloge, donc rien ne le trahit dans le source. On
	   écarte aussi la région `role="status"`, qui n'est pas visible pour
	   l'enfant. */
	const texteVisible = await page.evaluate(() => {
		const copie = document.querySelector('.sudoku')?.cloneNode(true) as HTMLElement;
		copie.querySelector('.sudoku-tailles')?.remove();
		copie.querySelector('.sudoku-annonce')?.remove();
		return copie.innerText ?? '';
	});
	expect(texteVisible, 'ni chronomètre ni compteur de coups').not.toMatch(/\d/);

	expect(errors).toEqual([]);
});

/* ---------- Critères 18 et 23 ---------- */

test('critères 18 et 23 : une grille laissée en cours ne relance personne, et la règle ne se lit jamais toute seule', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(ESPION_TTS);
	await ouvrirSudoku(page);

	const etat = await lireGrille(page);
	const vide = etat.valeurs.findIndex((v, i) => v === 0 && !etat.fixes[i]);
	await poser(page, vide, 1);

	/* Critère 23 : la règle ne change jamais d'une grille à l'autre, donc elle ne
	   se relit pas toute seule — même quand la lecture automatique des consignes
	   est active ailleurs dans l'application. */
	expect(await page.evaluate(() => window.__ttsAppels)).toBe(0);
	await expect(page.locator('.sudoku-regle')).toBeVisible();

	// Critère 18 : de retour à l'accueil, rien ne pointe la grille inachevée.
	await page.locator('#btnQuitterJeu').click();
	await expect(page.locator('#jeuxEtagere')).toBeVisible();
	const etagere = (await page.locator('#jeuxEtagere').innerText()) || '';
	expect(etagere, 'aucune relance sur l’étagère').not.toMatch(/pas fini|inachev|reprends|termine/i);
	await page.keyboard.press('Escape');
	const nav = (await page.locator('#jeuxNav').innerText()) || '';
	expect(nav, 'aucun compteur ni pastille sur l’entrée').not.toMatch(/\d/);

	expect(errors).toEqual([]);
});
