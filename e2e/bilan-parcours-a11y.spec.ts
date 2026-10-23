/* ============================================================
   Bilan en PARCOURS guidé (#777), passe de corrections : focus, trou du QCM, Entrée,
   modales de récompense, « Réviser mes erreurs », règle des 60 %, reprise par la carte.
   ------------------------------------------------------------
   Écrit AVANT les corrections (#777) : rouge là où le défaut existe. Les seeds et le
   jeu du parcours sont recopiés de `bilan-parcours.spec.ts` / `bilan-parcours-suivi.spec.ts`
   (une spec ne partage pas ses helpers de jeu).

   Les libellés ne sont pas figés. Exceptions INTENTIONNELLES : « (trou) » dans le nom du
   groupe de choix (point 2) et la phrase « Pour que ton bilan compte, réponds à au moins N
   questions sur M. » (point 7), validées comme telles : c'est elles, l'objet du test.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* ---------- Seeds ---------- */

interface FavoriSeed {
	id: string;
	label: string;
	lessonIds: string[];
	questionsPerLesson: number | 'all';
	mode: 'bilan';
}

const ID_FAVORI = 'fav-777';

function favori(lessonIds: string[], nbq: number): FavoriSeed {
	return {
		id: ID_FAVORI,
		label: 'Parcours 777',
		lessonIds,
		questionsPerLesson: nbq,
		mode: 'bilan',
	};
}

async function seedFavoris(page: Page, bilans: FavoriSeed[]): Promise<void> {
	await page.addInitScript(
		(json) => localStorage.setItem('e2e/ludaskia_bilans', json),
		JSON.stringify(bilans),
	);
}

/* Programme du jour d'UNE étape « Un bilan favori » (comme `programme-favori.spec.ts`). */
async function seedFavorisEtProgramme(page: Page, bilans: FavoriSeed[]): Promise<void> {
	const defs = [
		{
			id: 'd1',
			etapes: [{ id: 'e1', kind: 'favori', refs: [ID_FAVORI], count: 1 }],
			recurrence: { type: 'hebdo', jours: [1, 2, 3, 4, 5, 6, 7] },
		},
	];
	await page.addInitScript(
		(seed) => {
			localStorage.setItem('e2e/ludaskia_bilans', seed.bilans);
			localStorage.setItem('e2e/ludaskia_seance', seed.defs);
			localStorage.removeItem('ludaskia_encadrant_lock');
		},
		{ bilans: JSON.stringify(bilans), defs: JSON.stringify(defs) },
	);
}

async function lancerFavoriAccueil(page: Page, bilans: FavoriSeed[]): Promise<void> {
	await seedFavoris(page, bilans);
	await gotoHash(page, 'accueil');
	await page.locator('.favori-btn-run').first().click();
	await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();
}

const LECON_NUM = 'math-complements'; // saisie numérique, calcul mental
const LECON_POSEE = 'calc-addition-posee'; // opération posée, calcul posé
const LECON_TROU = 'fr-homophones-et'; // QCM à trou

/* ---------- Jeu du parcours (recopié de bilan-parcours.spec.ts) ---------- */

type Geste = 'juste' | 'faux' | 'passe';

interface Trace {
	kind: string;
	lesson: string;
	answer: string | null;
}

interface Crochets {
	surEcran?: (ecran: 'question' | 'fin-partie') => Promise<void>;
	surQuestion?: (trace: Trace) => Promise<void>;
	surFinPartie?: () => Promise<void>;
	surRecap?: () => Promise<void>;
}

/* Joue tout le parcours jusqu'au récapitulatif. Seules les saisies numériques (`num`,
   `posee`) se répondent juste/faux ; tout autre format est « passé ». */
async function jouer(
	page: Page,
	geste: (i: number, t: Trace) => Geste,
	crochets: Crochets = {},
): Promise<Trace[]> {
	const traces: Trace[] = [];
	const t = (sel: string) => page.locator(sel);
	for (let garde = 0; garde < 200; garde++) {
		await t('#bpStage, .bp-fin-partie, .bp-recap').first().waitFor({ state: 'visible' });
		if (await t('.bp-recap').isVisible()) {
			await crochets.surRecap?.();
			return traces;
		}
		if (await t('.bp-fin-partie').isVisible()) {
			await crochets.surEcran?.('fin-partie');
			await crochets.surFinPartie?.();
			await t('#bpPartieSuivante, #bpVoirBilan').first().click();
			continue;
		}
		const stage = t('#bpStage');
		const kind = (await stage.getAttribute('data-kind')) ?? '';
		const trace: Trace = {
			kind,
			lesson: (await stage.getAttribute('data-lesson')) ?? '',
			answer: kind === 'num' ? await t('#bpInput').getAttribute('data-answer') : null,
		};
		await crochets.surEcran?.('question');
		await crochets.surQuestion?.(trace);
		const g = geste(traces.length, trace);
		traces.push(trace);
		const avant = await numerotation(page);
		if (g !== 'passe' && (kind === 'num' || kind === 'posee')) {
			await remplir(page, kind, g === 'juste');
			await t('#bpValider').click();
		} else {
			await t('#bpPasser').click();
		}
		await page.waitForFunction((a) => {
			if (!document.querySelector('#bpStage') || document.querySelector('.bp-fin-partie'))
				return true;
			const p = document.querySelector('.bp-partie-num')?.textContent?.trim();
			const q = document.querySelector('.bp-question-num')?.textContent?.trim();
			return `${p}|${q}` !== a;
		}, avant);
	}
	throw new Error('Le parcours ne se termine pas (garde 200 écrans)');
}

const numerotation = async (page: Page): Promise<string> =>
	`${(await page.locator('.bp-partie-num').innerText()).trim()}|${(await page.locator('.bp-question-num').innerText()).trim()}`;

/* Remplit la question numérique affichée (saisie ou opération posée), juste ou fausse. */
async function remplir(page: Page, kind: string, juste: boolean): Promise<void> {
	if (kind === 'num') {
		const input = page.locator('#bpInput');
		const rep = (await input.getAttribute('data-answer')) ?? '';
		await input.fill(juste ? rep : `${rep}7`);
		return;
	}
	const cells = page.locator('.posee-input[data-answer]');
	const n = await cells.count();
	for (let c = 0; c < n; c++) {
		const rep = (await cells.nth(c).getAttribute('data-answer')) ?? '';
		await cells.nth(c).fill(juste ? rep : `${rep}7`);
	}
}

/* Ferme les modales de récompense (niveau, célébration) qui intercepteraient un clic. */
async function fermerModalesRecompense(page: Page): Promise<void> {
	for (let i = 0; i < 5; i++) {
		for (const ok of ['#levelupOk', '#celebrateOk']) {
			const bouton = page.locator(ok);
			if (await bouton.isVisible().catch(() => false)) {
				await bouton.click();
				break;
			}
		}
	}
}

const lireStockage = (page: Page, cle: string): Promise<string | null> =>
	page.evaluate((k) => localStorage.getItem(k), cle);

interface Activite {
	k: string;
	ref?: string;
}
async function lireBilans(page: Page): Promise<Activite[]> {
	const raw = await lireStockage(page, 'e2e/ludaskia_activity');
	return ((raw ? JSON.parse(raw) : []) as Activite[]).filter((a) => a.k === 'bilan');
}

/* ============================================================
   Point 1 : le focus tombe toujours sur un élément NOMMÉ
   ============================================================ */

/* 'ok' si le focus est sur #bpInput, un .bp-choice, ou un role="group" au nom non vide ;
   sinon une description de l'élément fautif (pour que l'échec dise OÙ est le focus). */
async function etatDuFocus(page: Page): Promise<string> {
	return page.evaluate(() => {
		const el = document.activeElement as HTMLElement | null;
		if (!el || el === document.body) return 'ko: le focus est sur <body>';
		if (el.id === 'bpInput' || el.classList.contains('bp-choice')) return 'ok';
		const nom = (el.getAttribute('aria-label') ?? '').trim();
		const par = (el.getAttribute('aria-labelledby') ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
			.join(' ')
			.trim();
		if (el.getAttribute('role') === 'group' && (nom || par)) return 'ok';
		return `ko: <${el.tagName.toLowerCase()} id="${el.id}" class="${el.className}" role="${el.getAttribute('role') ?? ''}"> sans nom de groupe`;
	});
}

const FORMATS = [
	LECON_NUM,
	LECON_POSEE,
	'fr-conj-groupe',
	'num-comparer',
	'fr-vocab-alpha-initiale',
	'fr-vocab-champs-tri',
	'fr-vocab-familles-relier',
	'fr-gram-clic-verbe',
	'math-prob-composition',
];

test('point 1 : à chaque question (dont la 1re de chaque partie), en fin de partie et au récapitulatif, le focus est sur un élément nommé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori(FORMATS, 1)]);
	// Les écrans fautifs sont tous listés (pas seulement le premier) : l'échec dit lesquels.
	const fautifs: string[] = [];
	const focusNomme = async (ou: string) => {
		try {
			await expect.poll(() => etatDuFocus(page), { timeout: 1500 }).toBe('ok');
		} catch {
			fautifs.push(`${ou} : ${await etatDuFocus(page)}`);
		}
	};
	let questions = 0;
	let finsDePartie = 0;
	await jouer(page, () => 'passe', {
		surEcran: async (ecran) => {
			if (ecran === 'question') questions++;
			else finsDePartie++;
			await focusNomme(
				ecran === 'question'
					? `question ${questions} (${await numerotation(page).catch(() => '?')})`
					: `fin de la partie ${finsDePartie}`,
			);
		},
		surRecap: async () => focusNomme('récapitulatif'),
	});
	expect(fautifs, 'écrans dont le focus n’est pas nommé').toEqual([]);
	expect(questions, 'une question par leçon').toBe(FORMATS.length);
	expect(finsDePartie, 'au moins deux parties jouées').toBeGreaterThanOrEqual(2);
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : `stage.focus()` sur un `#bpStage` sans `role="group"` ni nom
	// (état actuel pour toute question sans `#bpInput`), ou `.bp-fin-partie` / `.bp-recap`
	// focalisés avec seulement `tabindex="-1"`.
});

/* ============================================================
   Point 2 : le trou du QCM à trou
   ============================================================ */

test('point 2 : toucher un choix le place dans le trou, le trou reste lisible aux technologies d’assistance, le groupe se dit « (trou) » sans « @ »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_TROU], 3)]);
	const stage = page.locator('#bpStage');
	await expect(stage).toHaveAttribute('data-kind', 'qcm');
	const choix = stage.locator('.bp-choice');
	await expect(choix).not.toHaveCount(0);
	expect(await choix.count()).toBeGreaterThanOrEqual(2);
	const trou = stage.locator('.fiche-trou, .bp-trou').first();
	await expect(trou).toHaveCount(1);

	const mots = (s: string) => s.split(/[^\p{L}]+/u).filter(Boolean);
	const textes = (await choix.allInnerTexts()).map((s) => s.trim());
	const [premier, second] = textes;
	await choix.nth(0).click();
	await expect
		.poll(async () => mots(await trou.innerText()))
		.toEqual(expect.arrayContaining(mots(premier)));
	await choix.nth(1).click();
	await expect
		.poll(async () => mots(await trou.innerText()))
		.toEqual(expect.arrayContaining(mots(second)));
	const apres = mots(await trou.innerText());
	for (const m of mots(premier).filter((m) => !mots(second).includes(m)))
		expect(apres, 'le choix précédent a quitté le trou').not.toContain(m);

	// Le trou n'est masqué ni par lui-même ni par un ancêtre de la carte.
	const masque = await trou.evaluate((el) => {
		for (let n: Element | null = el; n && n.id !== 'bpStage'; n = n.parentElement)
			if (n.getAttribute('aria-hidden') === 'true') return `${n.tagName}.${n.className}`;
		return null;
	});
	expect.soft(masque, 'élément aria-hidden autour du trou').toBeNull();

	// Nom du groupe de choix : dit le trou, jamais le marqueur interne « @ ».
	const nomGroupe = await choix.first().evaluate((el) => {
		const g = el.closest('[role="radiogroup"]');
		if (!g) return null;
		const ids = (g.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
		return `${g.getAttribute('aria-label') ?? ''} ${ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')}`;
	});
	expect(nomGroupe, 'les choix sont dans un role="radiogroup"').not.toBeNull();
	expect.soft(nomGroupe).toContain('(trou)');
	expect.soft(nomGroupe).not.toContain('@');
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : `aria-hidden="true"` sur `.bp-trou` (état actuel), un nom de
	// groupe fixe « Choix de réponse », ou un nom construit sur l'énoncé brut contenant « @ ».
});

test('point 2 bis : les choix du QCM forment un radiogroup nommé (aria-checked, tabindex mobile, flèches qui déplacent ET sélectionnent)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_TROU], 3)]);
	const stage = page.locator('#bpStage');
	await expect(stage).toHaveAttribute('data-kind', 'qcm');
	const groupe = stage.locator('[role="radiogroup"]');
	await expect(groupe, 'un radiogroup autour des choix').toHaveCount(1);
	const nom = await groupe.evaluate((g) => {
		const ids = (g.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
		return `${g.getAttribute('aria-label') ?? ''} ${ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')}`.trim();
	});
	expect.soft(nom, 'nom du radiogroup').not.toBe('');
	const choix = groupe.locator('.bp-choice[data-value]');
	const n = await choix.count();
	expect(n).toBeGreaterThanOrEqual(2);
	// Contrat radio : role, aria-checked, plus aucun aria-pressed.
	for (let i = 0; i < n; i++) {
		await expect.soft(choix.nth(i), `choix ${i} : role`).toHaveAttribute('role', 'radio');
		await expect
			.soft(choix.nth(i), `choix ${i} : aria-checked`)
			.toHaveAttribute('aria-checked', 'false');
		await expect
			.soft(choix.nth(i), `choix ${i} : pas d'aria-pressed`)
			.not.toHaveAttribute('aria-pressed', /.*/);
	}
	const tabindex = () => choix.evaluateAll((els) => els.map((e) => e.getAttribute('tabindex')));
	const coches = () => choix.evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked')));
	// Aucun choix coché : seul le premier est dans l'ordre de tabulation.
	expect
		.soft(await tabindex(), 'tabindex sans sélection')
		.toEqual(['0', ...Array(n - 1).fill('-1')]);

	await choix.nth(0).click();
	expect.soft(await coches(), 'un seul coché').toEqual(['true', ...Array(n - 1).fill('false')]);
	expect
		.soft(await tabindex(), 'tabindex = le choix coché')
		.toEqual(['0', ...Array(n - 1).fill('-1')]);

	// Flèche droite : déplace le focus ET sélectionne le suivant.
	await choix.nth(0).focus();
	await page.keyboard.press('ArrowRight');
	expect
		.soft(await coches(), 'la flèche sélectionne le suivant')
		.toEqual(['false', 'true', ...Array(n - 2).fill('false')]);
	expect
		.soft(await tabindex(), 'le tabindex suit')
		.toEqual(['-1', '0', ...Array(n - 2).fill('-1')]);
	await expect.soft(choix.nth(1), 'le focus suit').toBeFocused();
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : `aria-pressed` au lieu de `role="radio"` + `aria-checked` (état actuel),
	// tous les choix à tabindex 0, une flèche qui ne sélectionne pas, ou plusieurs `aria-checked="true"`.
});

/* ============================================================
   Point 3 : Entrée sans effet dit pourquoi
   ============================================================ */

test('point 3 : Entrée sur un champ vide ne passe pas à la suite, dit pourquoi dans une région role="status", et « Valider » reste atteignable (aria-disabled, pas disabled)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM], 3)]);
	const input = page.locator('#bpInput');
	await expect(input).toBeVisible();
	const avant = await numerotation(page);
	const valider = page.locator('#bpValider');

	// Valider est dans l'ordre de tabulation : non `disabled`, mais `aria-disabled="true"`.
	expect
		.soft(await valider.evaluate((b) => b.hasAttribute('disabled')), 'attribut disabled')
		.toBe(false);
	await expect.soft(valider).toHaveAttribute('aria-disabled', 'true', { timeout: 1000 });

	await input.focus();
	await input.press('Enter');
	const statut = page.locator('#sheets [role="status"]');
	await expect.soft(statut.first()).toHaveText(/\S/, { timeout: 1500 });
	expect(await numerotation(page), 'Entrée ne passe pas à la question suivante').toBe(avant);
	await expect(input).toBeVisible();

	// Cliquer « Valider » tant que la réponse est vide n'avance pas non plus.
	await valider.click({ force: true }); // force : un `disabled` natif bloquerait l’attente
	expect(await numerotation(page)).toBe(avant);

	// Réponse complète : Valider n'est plus aria-disabled.
	await input.fill((await input.getAttribute('data-answer')) ?? '');
	await expect(valider).not.toHaveAttribute('aria-disabled', 'true');
	expect(await valider.evaluate((b) => b.hasAttribute('disabled'))).toBe(false);
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : `disabled` natif sur #bpValider (état actuel), aucune région
	// `role="status"` alimentée sur Entrée vide (état actuel : seul le focus bouge), ou Entrée
	// vide qui appelle `enregistrer(PASSE)` (la numérotation changerait).
});

/* ============================================================
   Point 4 : Entrée dans la grille posée ne corrige rien
   ============================================================ */

test('point 4 : Entrée dans une case de l’opération posée ne valide pas la question et ne corrige rien', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_POSEE], 2)]);
	const stage = page.locator('#bpStage');
	await expect(stage).toHaveAttribute('data-kind', 'posee');
	const cases = page.locator('.posee-input[data-answer]');
	expect(await cases.count()).toBeGreaterThanOrEqual(2);
	const avant = await numerotation(page);

	// Une seule case remplie (juste) : la grille est incomplète, Entrée ne doit rien corriger.
	await cases.first().fill((await cases.first().getAttribute('data-answer')) ?? '');
	await cases.first().press('Enter');
	await expect(stage).toBeVisible();
	await expect(page.locator('.bp-fin-partie')).toBeHidden();
	expect(await numerotation(page), 'la question reste affichée').toBe(avant);
	await expect(page.locator('#sheets .mark, #sheets .correct, #sheets .wrong')).toHaveCount(0);
	await expect(page.locator('#sheets .posee-input.ok, #sheets .posee-input.ko')).toHaveCount(0);
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : retirer `ev.stopPropagation()` du keydown du parcours (l'écouteur
	// global de la fiche, `ui/session.ts`, corrigerait la page : marques `.mark`), ou faire
	// avancer Entrée vers la question suivante (la numérotation changerait). Mutation non
	// jouée ici : `src/` m'est interdit.
});

/* ============================================================
   Point 5 : modales de récompense, comme après une leçon
   ============================================================ */

test('point 5 : un bilan qui franchit un niveau montre le récapitulatif PUIS la modale de niveau, sans ligne de récompense dans .bp-recap', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// XP juste sous le palier 1 → 2 (12 XP, `xpVersSuivant(1)`) : 3 bonnes réponses le franchissent.
	await page.addInitScript(() => {
		if (localStorage.getItem('e2e/ludaskia_xp') === null)
			localStorage.setItem('e2e/ludaskia_xp', '11');
	});
	await lancerFavoriAccueil(page, [favori([LECON_NUM], 3)]);
	await jouer(page, () => 'juste', {
		surFinPartie: async () => {
			// La modale n'écrase pas l'écran de correction : elle suit le récapitulatif.
			await expect(page.locator('#levelup')).toBeHidden();
		},
		surRecap: async () => {
			await expect(page.locator('.bp-recap')).toBeVisible();
			await expect(page.locator('#levelupOk')).toBeVisible();
			await expect(page.locator('.bp-recap .bp-recompenses')).toHaveCount(0);
		},
	});
	await fermerModalesRecompense(page);
	await expect(page.locator('#levelupOk')).toBeHidden();
	await expect(page.locator('.bp-recap')).toBeVisible();
	await expect(page.locator('.bp-recap .bp-recompenses')).toHaveCount(0);
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : ne pas appeler `announceRewards` à l'affichage du récapitulatif
	// (état actuel : les gains sont écrits dans `.bp-recompenses`, aucune modale), ou garder la
	// liste `.bp-recompenses` EN PLUS de la modale (doublon).
});

/* ============================================================
   Point 6 : « Réviser mes erreurs » ne crédite rien
   ============================================================ */

test('point 6a : finir le rejeu des erreurs d’un bilan compté ne crée aucune activité de plus', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM], 5)]);
	await jouer(page, (i) => (i === 0 ? 'faux' : 'juste'));
	await fermerModalesRecompense(page);
	expect(await lireBilans(page), 'le bilan compté a créé son activité').toHaveLength(1);
	const activiteAvant = await lireStockage(page, 'e2e/ludaskia_activity');

	await page.locator('#bpReviserErreurs').click();
	await expect(page.locator('#bpStage')).toBeVisible();
	let rejouees = 0;
	await jouer(page, () => 'juste', { surQuestion: async () => void rejouees++ });
	await fermerModalesRecompense(page);
	expect(rejouees, 'seule la question ratée est rejouée').toBe(1);
	await expect(page.locator('.bp-recap')).toBeVisible();
	expect(await lireStockage(page, 'e2e/ludaskia_activity'), 'journal d’activité inchangé').toBe(
		activiteAvant,
	);
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : appeler `cloreBilan` / `recordLessonRun` en fin de rejeu (une
	// 2e entrée « bilan » apparaîtrait). Mutation non jouée (`src/` interdit) : état actuel,
	// `corrigerPartie` sort dès que `e.rejeu`.
});

test('point 6b : un bilan non compté puis rejoué juste ne coche pas l’étape « Un bilan favori » du programme', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedFavorisEtProgramme(page, [favori([LECON_NUM], 5)]);
	await gotoHash(page, 'seance');
	await page.locator('.programme-tuile[data-act="lancer"]').first().click();
	await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();
	// 2 réponses sur 5 : sous les 60 %, le bilan ne compte pas ; les 3 passées sont à réviser.
	await jouer(page, (i) => (i < 2 ? 'juste' : 'passe'));
	await fermerModalesRecompense(page);
	expect(await lireBilans(page), 'bilan non compté').toEqual([]);

	await page.locator('#bpReviserErreurs').click();
	let rejouees = 0;
	await jouer(page, () => 'juste', { surQuestion: async () => void rejouees++ });
	await fermerModalesRecompense(page);
	expect(rejouees, 'les 3 questions passées sont rejouées').toBe(3);
	expect(await lireBilans(page), 'le rejeu ne crée aucune activité').toEqual([]);

	await page.locator('#bpAccueil').click();
	await expect(page.locator('#home')).toBeVisible();
	await fermerModalesRecompense(page);
	await expect(page.locator('#cardProgramme')).not.toHaveClass(/programme-card--fini/);
	await expect(page.locator('#cardProgramme .go').first()).toBeVisible();
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : un rejeu qui porte `favoriId` et appelle `recordLessonRun`
	// (une activité « bilan » rattachée au favori coche l'étape : carte `--fini`, plus de `.go`).
});

/* ============================================================
   Point 7 : règle des 60 %
   ============================================================ */

test('point 7 : plus de 40 % de questions passées, le récapitulatif dit combien répondre (N sur M, cohérents) et aucune activité n’est créée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM], 5)]);
	const traces = await jouer(page, (i) => (i < 2 ? 'juste' : 'passe')); // 2 réponses sur 5
	await fermerModalesRecompense(page);
	const m = traces.length;
	expect(m).toBe(5);
	const seuil = page.locator('.bp-recap .bp-seuil');
	await expect(seuil).toHaveCount(1);
	// Libellé intentionnel (validé) : c'est la phrase elle-même qui est testée.
	const lu =
		/^\s*Pour que ton bilan compte, réponds à au moins (\d+) questions? sur (\d+)\.\s*$/.exec(
			await seuil.innerText(),
		);
	expect(lu, 'phrase du seuil').not.toBeNull();
	const [n, total] = [Number(lu![1]), Number(lu![2])];
	expect(total, 'M = nombre de questions du bilan').toBe(m);
	expect(n, 'N = 60 % de M, arrondi au-dessus').toBe(Math.ceil(0.6 * m));
	expect(n, 'N dépasse ce que l’enfant a répondu').toBeGreaterThan(2);
	expect(await lireBilans(page), 'aucune activité').toEqual([]);
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : `assezDeReponses` toujours vrai (activité créée), un seuil
	// non rendu, ou un N/M calculé sur autre chose que le total du bilan.
});

test('point 7, contre-épreuve : 60 % de réponses suffisent, pas de message et une activité créée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM], 5)]);
	await jouer(page, (i) => (i < 3 ? 'juste' : 'passe')); // 3 réponses sur 5
	await fermerModalesRecompense(page);
	await expect(page.locator('.bp-recap')).toBeVisible();
	await expect(page.locator('.bp-recap .bp-seuil')).toHaveCount(0);
	expect(await lireBilans(page)).toHaveLength(1);
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : un seuil appliqué à 60 % pile (comparaison `>` au lieu de `>=`).
});

/* ============================================================
   Point 8 : reprise depuis la carte « À continuer » de l'accueil
   ============================================================ */

async function signature(page: Page): Promise<string> {
	return page.locator('#bpStage').evaluate((el) => {
		const attendues = [...el.querySelectorAll('[data-answer]')]
			.map((e) => e.getAttribute('data-answer'))
			.join('|');
		return `${(el as HTMLElement).innerText.trim()}##${el.getAttribute('data-answer') ?? ''}##${attendues}`;
	});
}

const numeros = (texte: string): number[] => (texte.match(/\d+/g) ?? []).map(Number);

/* Répond juste à la question affichée et attend le changement d'écran. */
async function repondreJuste(page: Page): Promise<void> {
	const kind = (await page.locator('#bpStage').getAttribute('data-kind')) ?? '';
	const avant = await numerotation(page);
	await remplir(page, kind, true);
	await page.locator('#bpValider').click();
	await page.waitForFunction((a) => {
		if (!document.querySelector('#bpStage') || document.querySelector('.bp-fin-partie'))
			return true;
		const p = document.querySelector('.bp-partie-num')?.textContent?.trim();
		const q = document.querySelector('.bp-question-num')?.textContent?.trim();
		return `${p}|${q}` !== a;
	}, avant);
}

test('point 8 : « Continuer » sur la carte « À continuer » rouvre le parcours à la bonne partie et à la bonne question', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await lancerFavoriAccueil(page, [favori([LECON_NUM, LECON_POSEE], 2)]);
	// Partie 1 en entier, puis la 1re question de la partie 2 : on s'arrête sur la question 2.
	await repondreJuste(page);
	await repondreJuste(page);
	await expect(page.locator('.bp-fin-partie')).toBeVisible();
	await page.locator('#bpPartieSuivante').click();
	await expect(page.locator('#bpStage')).toBeVisible();
	await repondreJuste(page);
	await expect(page.locator('#bpStage')).toBeVisible();
	expect(numeros(await page.locator('.bp-partie-num').innerText())[0]).toBe(2);
	expect(numeros(await page.locator('.bp-question-num').innerText())[0]).toBe(2);
	const sig = await signature(page);

	await page.locator('#toolbarBurger').click();
	await page.locator('#btnHome').click();
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('.reprise-card')).toHaveCount(1);
	await page.locator('.reprise-card .reprise-continue').click();

	await expect(page.locator('#sheets .bilan-parcours')).toBeVisible();
	await expect(page.locator('#bpStage')).toBeVisible();
	expect(numeros(await page.locator('.bp-partie-num').innerText())[0], 'partie rouverte').toBe(2);
	expect(numeros(await page.locator('.bp-question-num').innerText())[0], 'question rouverte').toBe(
		2,
	);
	expect(await signature(page), 'la même question, pas un nouveau tirage').toBe(sig);
	expect(errors).toEqual([]);
	// Ce qui le ferait rougir : une carte qui relance le bilan depuis la partie 1 (numéros
	// 1/1), ou qui retire un nouveau tirage (la signature de la question changerait).
});
