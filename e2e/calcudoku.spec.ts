/* ============================================================
   Calcudoku (#667) — smoke e2e.

   Le moteur, le tirage et la persistance sont purs et vivent dans
   `core/jeux/` (couverts par Vitest) : ici, uniquement ce qui ne se vérifie
   que dans un navigateur — le rendu, le geste en deux temps, la zone de
   phrase et sa hauteur fixe, la mise en évidence, le signalement, la
   persistance.

   Sélecteurs stables : `.jeu-item[data-jeu="calcudoku"]`, `.calcudoku-grille`,
   `.calcudoku-case[data-index]` et ses `data-valeur` / `data-fixe` /
   `data-operation` / `data-conflit` / `data-lie` / `data-cage-sel`,
   `.calcudoku-nombre[data-valeur]`, `#calcudokuPhrase`, `#calcudokuEffacer`,
   `#calcudokuRecommencer`, `#calcudokuNouvelle`.

   ── Point de méthode : l'objectif d'une cage se lit dans `localStorage` ────
   La grille est tirée au hasard, donc son découpage en cages et leurs
   objectifs ne sont pas prévisibles depuis le test. La partie est SAUVÉE à
   chaque coup (`sauverPartie`, cf. `jeu-calcudoku.ts`) sous une clé qui
   contient « calcudoku » : on la relit dans `localStorage` plutôt que
   d'importer `core/jeux/calcudoku` (une spec reste une boîte noire du
   rendu). Aucune hypothèse sur le NOM du champ portant l'objectif : on
   compare la phrase à TOUTE valeur numérique trouvée dans l'objet cage.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedJeuxPossedesScript, ouvrirEtagere } from './helpers';

/** La grille est toujours 4×4 (16 cases) — le calcudoku, contrairement au
    sudoku voisin, n'a qu'une seule taille (cf. le test « aucun sélecteur de
    taille » plus bas). */
const COTE = 4;

async function entrerDansLeJeu(page: Page): Promise<void> {
	await ouvrirEtagere(page);
	await page.locator('.jeu-item[data-jeu="calcudoku"]').click();
	await page.locator('#jeuEcran').waitFor({ state: 'visible' });
	await expect(page.locator('.calcudoku-grille')).toBeVisible();
}

async function ouvrirCalcudoku(page: Page): Promise<void> {
	await page.addInitScript(seedJeuxPossedesScript(['calcudoku']));
	await gotoHash(page, 'accueil');
	await entrerDansLeJeu(page);
}

/** Quitte puis rouvre : la partie a déjà été SAUVÉE au premier montage
    (`sauverPartie` est appelé dès le tirage), donc cette deuxième entrée la
    REPREND (`partieEnCours`) au lieu d'en tirer une neuve — ce qui écarte le
    cas d'exemple de la toute première grille du profil (case
    présélectionnée) et retombe sur l'état « rien n'est sélectionné » que
    jouent la plupart des cas ci-dessous. */
async function quitterEtRouvrir(page: Page): Promise<void> {
	await page.locator('#btnQuitterJeu').click();
	await page.locator('#jeuxEtagere').waitFor({ state: 'visible' });
	await page.locator('.jeu-item[data-jeu="calcudoku"]').click();
	await page.locator('#jeuEcran').waitFor({ state: 'visible' });
}

async function ouvrirCalcudokuSansSelection(page: Page): Promise<void> {
	await ouvrirCalcudoku(page);
	await quitterEtRouvrir(page);
	await expect(page.locator('.calcudoku-case.sel')).toHaveCount(0);
}

interface EtatGrille {
	valeurs: number[];
	fixes: boolean[];
}

async function lireGrille(page: Page): Promise<EtatGrille> {
	return page.evaluate(() => {
		const cases = [...document.querySelectorAll('.calcudoku-case')] as HTMLElement[];
		const ordonnees = cases.sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
		return {
			valeurs: ordonnees.map((c) => Number(c.dataset.valeur)),
			fixes: ordonnees.map((c) => c.dataset.fixe === '1'),
		};
	});
}

/** L'état de partie sauvé par le runner (`sauverPartie`), lu tel quel dans
    `localStorage` — sans jamais importer `core/jeux/calcudoku`. */
async function lireEtatSauve(page: Page): Promise<{ cages: Record<string, unknown>[] } | null> {
	return page.evaluate(() => {
		for (let i = 0; i < localStorage.length; i++) {
			const cle = localStorage.key(i);
			if (!cle || !cle.toLowerCase().includes('calcudoku')) continue;
			try {
				const valeur: unknown = JSON.parse(localStorage.getItem(cle) ?? 'null');
				if (
					valeur &&
					typeof valeur === 'object' &&
					Array.isArray((valeur as { cages?: unknown }).cages)
				) {
					return valeur as { cages: Record<string, unknown>[] };
				}
			} catch {
				// Pas du JSON (ex. le simple drapeau « déjà initié ») : on ignore.
			}
		}
		return null;
	});
}

function cageDeIndex(
	etat: { cages: Record<string, unknown>[] },
	index: number,
): Record<string, unknown> | undefined {
	return etat.cages.find((c) => {
		const cases = (c as { cases?: unknown }).cases;
		return Array.isArray(cases) && (cases as number[]).includes(index);
	});
}

function candidatsNumeriques(cage: Record<string, unknown>): number[] {
	return Object.values(cage).filter((v): v is number => typeof v === 'number');
}

/* ---------- 1. Ouverture et rendu ---------- */

test('le jeu s’ouvre sans erreur depuis l’étagère et rend sa grille de 16 cases', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirCalcudoku(page);

	await expect(page.locator('.calcudoku-case')).toHaveCount(COTE * COTE);

	expect(errors).toEqual([]);
});

/* ---------- 2. Aucun sélecteur de taille (cas négatif) ---------- */

test('critère négatif : aucun sélecteur de taille — le calcudoku n’a qu’une seule taille', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirCalcudoku(page);

	expect(await page.locator('[data-taille]').count()).toBe(0);
	// Sur le sudoku voisin, le sélecteur de taille est le seul élément à
	// porter `aria-pressed` : son absence ici est le même signal, générique.
	expect(await page.locator('.calcudoku [aria-pressed]').count()).toBe(0);

	expect(errors).toEqual([]);
});

/* ---------- 3. La zone de phrase, présente et non vide ---------- */

test('la zone de phrase est présente au montage, non vide, et reste non vide quand rien n’est sélectionné', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirCalcudoku(page);

	const phrase = page.locator('#calcudokuPhrase');
	await expect(phrase).toBeVisible();
	expect(((await phrase.textContent()) ?? '').trim().length).toBeGreaterThan(0);

	await quitterEtRouvrir(page);
	await expect(page.locator('.calcudoku-case.sel')).toHaveCount(0);
	expect(
		((await phrase.textContent()) ?? '').trim().length,
		'le texte par défaut ne doit pas être vide quand rien n’est sélectionné',
	).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});

/* ---------- 4. Toucher une case affiche l'objectif de sa cage ---------- */

test('toucher une case remplace la phrase par l’objectif de sa cage, en toutes lettres', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirCalcudokuSansSelection(page);

	const phrase = page.locator('#calcudokuPhrase');
	const avant = ((await phrase.textContent()) ?? '').trim();

	await page.locator('.calcudoku-case[data-index="0"]').click();

	const apres = ((await phrase.textContent()) ?? '').trim();
	expect(apres, 'la phrase doit changer une fois la case touchée').not.toBe(avant);
	expect(apres.length).toBeGreaterThan(0);

	const etat = await lireEtatSauve(page);
	expect(etat, 'la partie doit être persistée en localStorage').not.toBeNull();
	const cage = etat ? cageDeIndex(etat, 0) : undefined;
	expect(cage, 'la case 0 doit appartenir à une cage').toBeTruthy();
	const nombres = cage ? candidatsNumeriques(cage) : [];
	expect(nombres.length, 'la cage doit exposer au moins un nombre').toBeGreaterThan(0);
	expect(
		nombres.some((n) => apres.includes(String(n))),
		`la phrase « ${apres} » doit citer l’objectif numérique de la cage`,
	).toBe(true);

	expect(errors).toEqual([]);
});

/* ---------- 5. La grille ne bouge pas quand la phrase change ---------- */

test('la grille ne bouge pas quand la phrase change (hauteur fixe de la zone de texte)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirCalcudokuSansSelection(page);

	const phrase = page.locator('#calcudokuPhrase');
	const texteAvant = ((await phrase.textContent()) ?? '').trim();
	const grille = page.locator('.calcudoku-grille');
	const avant = await grille.boundingBox();
	expect(avant).not.toBeNull();

	await page.locator('.calcudoku-case[data-index="0"]').click();
	const texteApres = ((await phrase.textContent()) ?? '').trim();
	expect(texteApres, 'la phrase doit vraiment avoir changé pour que ce test soit probant').not.toBe(
		texteAvant,
	);

	const apres = await grille.boundingBox();
	expect(apres).not.toBeNull();
	expect(apres).toEqual(avant);

	expect(errors).toEqual([]);
});

/* ---------- 6. La pose en deux temps ---------- */

test('la pose se fait en deux temps (case puis chiffre), et un chiffre sans case sélectionnée ne pose rien', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirCalcudokuSansSelection(page);

	const avant = await lireGrille(page);
	const libre = avant.valeurs.findIndex((v, i) => v === 0 && !avant.fixes[i]);
	expect(libre, 'il faut au moins une case libre').toBeGreaterThanOrEqual(0);

	// Sans case sélectionnée, un chiffre ne pose rien.
	await page.locator('.calcudoku-nombre[data-valeur="2"]').click();
	const intermediaire = await lireGrille(page);
	expect(intermediaire.valeurs, 'un chiffre sans case sélectionnée ne doit rien écrire').toEqual(
		avant.valeurs,
	);

	// La pose, en deux temps : la case, PUIS le chiffre.
	await page.locator(`.calcudoku-case[data-index="${libre}"]`).click();
	await page.locator('.calcudoku-nombre[data-valeur="2"]').click();
	await expect(page.locator(`.calcudoku-case[data-index="${libre}"]`)).toHaveAttribute(
		'data-valeur',
		'2',
	);

	expect(errors).toEqual([]);
});

/* ---------- 7. Une case pré-remplie refuse la saisie ---------- */

test('une case pré-remplie refuse la saisie', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrirCalcudokuSansSelection(page);

	const etat = await lireGrille(page);
	const fixe = etat.fixes.findIndex((f) => f);
	expect(fixe, 'il faut au moins une case donnée').toBeGreaterThanOrEqual(0);
	const valeurAvant = etat.valeurs[fixe];
	expect(valeurAvant).toBeGreaterThan(0);

	await page.locator(`.calcudoku-case[data-index="${fixe}"]`).click();
	// Un chiffre qui n'est PAS déjà la valeur donnée, pour être sûr que le
	// refus ne tient pas à une coïncidence.
	const autre = valeurAvant === 1 ? 2 : 1;
	await page.locator(`.calcudoku-nombre[data-valeur="${autre}"]`).click();

	await expect(page.locator(`.calcudoku-case[data-index="${fixe}"]`)).toHaveAttribute(
		'data-valeur',
		String(valeurAvant),
	);

	expect(errors).toEqual([]);
});

/* ---------- 8. Ligne, colonne et cage, deux marqueurs distincts ---------- */

test('la sélection met en évidence la ligne, la colonne et la cage — deux marqueurs distincts', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirCalcudokuSansSelection(page);

	await page.locator('.calcudoku-case[data-index="0"]').click();

	const { lie, cageSel } = await page.evaluate(() => {
		const cases = [...document.querySelectorAll('.calcudoku-case')] as HTMLElement[];
		return {
			lie: cases.filter((c) => c.dataset.lie === '1').map((c) => Number(c.dataset.index)),
			cageSel: cases.filter((c) => c.dataset.cageSel === '1').map((c) => Number(c.dataset.index)),
		};
	});

	// 4×4 sans région : trois cases de ligne + trois de colonne ; la case
	// touchée elle-même n'est jamais « liée » à elle-même.
	expect([...lie].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 8, 12]);
	expect(lie).not.toContain(0);

	// La cage, elle, INCLUT la case touchée : c'est ce qui distingue les deux
	// marqueurs — pas seulement leur nom d'attribut.
	expect(cageSel).toContain(0);
	expect(new Set(lie)).not.toEqual(new Set(cageSel));

	expect(errors).toEqual([]);
});

/* ---------- 9. Doublon de ligne : signalé, non bloquant, registre --warn ---------- */

test('un doublon de ligne est signalé sur les deux cases, sans bloquer la pose, en registre --warn, sans marque de correction d’exercice', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirCalcudokuSansSelection(page);

	// Le calcudoku peut ne compter AUCUNE case donnée sur une ligne donnée
	// (contrairement au sudoku voisin) : on ne peut donc pas compter sur un
	// doublon avec un indice déjà là. On pose soi-même deux fois la même
	// valeur sur la même ligne, dans deux cases libres.
	const etat = await lireGrille(page);
	let paire: [number, number] | null = null;
	for (let ligne = 0; ligne < COTE; ligne++) {
		const libres = [...Array(COTE).keys()]
			.map((c) => ligne * COTE + c)
			.filter((i) => etat.valeurs[i] === 0 && !etat.fixes[i]);
		if (libres.length >= 2) {
			paire = [libres[0], libres[1]];
			break;
		}
	}
	expect(paire, 'il faut une ligne avec au moins deux cases libres').not.toBeNull();
	const [premiere, seconde] = paire as [number, number];

	await page.locator(`.calcudoku-case[data-index="${premiere}"]`).click();
	await page.locator('.calcudoku-nombre[data-valeur="1"]').click();
	await page.locator(`.calcudoku-case[data-index="${seconde}"]`).click();
	await page.locator('.calcudoku-nombre[data-valeur="1"]').click();

	// La pose N'EST PAS bloquée.
	await expect(page.locator(`.calcudoku-case[data-index="${seconde}"]`)).toHaveAttribute(
		'data-valeur',
		'1',
	);
	// Les DEUX cases sont marquées.
	await expect(page.locator(`.calcudoku-case[data-index="${premiere}"]`)).toHaveAttribute(
		'data-conflit',
		'1',
	);
	await expect(page.locator(`.calcudoku-case[data-index="${seconde}"]`)).toHaveAttribute(
		'data-conflit',
		'1',
	);

	// Registre d'avertissement, jamais celui du verdict d'exercice.
	const registre = await page.evaluate(() => {
		const rgb = (hex: string): string => {
			const h = hex.trim().replace('#', '');
			const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16);
			return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
		};
		const racine = getComputedStyle(document.documentElement);
		const cible = document.querySelector('.calcudoku-case[data-conflit]') as HTMLElement;
		const style = getComputedStyle(cible);
		const peint = `${style.boxShadow} ${style.backgroundImage} ${style.backgroundColor}`;
		return { warn: peint.includes(rgb(racine.getPropertyValue('--warn'))) };
	});
	expect(registre.warn, 'le conflit doit emprunter --warn').toBe(true);

	expect(
		await page.locator('#jeuEcran .mark.correct, #jeuEcran .mark.wrong').count(),
		'un conflit de cage n’est pas une correction d’exercice',
	).toBe(0);

	expect(errors).toEqual([]);
});

/* ---------- 10. Persistance au rechargement ---------- */

test('la partie survit à un rechargement : la grille et le chiffre posé sont retrouvés', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirCalcudokuSansSelection(page);

	const etat = await lireGrille(page);
	const libre = etat.valeurs.findIndex((v, i) => v === 0 && !etat.fixes[i]);
	expect(libre).toBeGreaterThanOrEqual(0);

	await page.locator(`.calcudoku-case[data-index="${libre}"]`).click();
	await page.locator('.calcudoku-nombre[data-valeur="1"]').click();
	await expect(page.locator(`.calcudoku-case[data-index="${libre}"]`)).toHaveAttribute(
		'data-valeur',
		'1',
	);

	await page.reload({ waitUntil: 'networkidle' });
	await page.locator('.calcudoku-grille').waitFor({ state: 'visible' });

	await expect(page.locator(`.calcudoku-case[data-index="${libre}"]`)).toHaveAttribute(
		'data-valeur',
		'1',
	);

	expect(errors).toEqual([]);
});
