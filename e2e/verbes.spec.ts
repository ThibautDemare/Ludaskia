/* ============================================================
   Smoke e2e — Verbes dans « Mes listes » (#261).
   On vérifie : (1) la détection d'un verbe à la saisie déplie le panneau de
   paramétrage (chips pronoms/temps + complément + aperçu), et l'enregistrement ;
   (2) au lancement, le verbe est résolu via le lexique (chargement paresseux) et
   joué dans une phrase à trou affichée. Stub TTS comme les autres specs ortho.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Crée une liste contenant un verbe configuré et l'enregistre. Renvoie le label. */
async function creerListeAvecVerbe(page: import('@playwright/test').Page, label: string) {
	await gotoHash(page, 'ortho-new');
	const firstMot = page.locator('.ortho-mot').first();
	await firstMot.waitFor();
	await firstMot.fill('manger');
	// Détection au repos : la barre « est un verbe » apparaît (lookup async).
	const suggest = page.locator('.ortho-verbe-suggest').first();
	await expect(suggest).toBeVisible();
	await suggest.click();
	// Panneau verbe déplié : chips pronoms (6) + temps (1) + complément + aperçu.
	const panneau = page.locator('.ortho-verbe').first();
	await expect(panneau).toBeVisible();
	await expect(panneau.locator('.ortho-chip-pronom')).toHaveCount(6);
	await expect(panneau.locator('.ortho-chip-temps')).toHaveCount(1);
	await panneau.locator('.ortho-complement').fill('une pomme');
	await page.locator('#orthoLabel').fill(label);
	await page.locator('#orthoSave').click();
	await expect(page.locator('.cat-rubrique').first()).toBeVisible();
}

test('éditeur : détecter un verbe déplie le paramétrage et génère un aperçu', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'ortho-new');
	const firstMot = page.locator('.ortho-mot').first();
	await firstMot.waitFor();
	await firstMot.fill('manger');
	const suggest = page.locator('.ortho-verbe-suggest').first();
	await expect(suggest).toBeVisible();
	await suggest.click();
	const panneau = page.locator('.ortho-verbe').first();
	await expect(panneau).toBeVisible();
	// Garde-fou « au moins un pronom » : on peut décocher « tu » (2e chip).
	const tu = panneau.locator('.ortho-chip-pronom').nth(1);
	await expect(tu).toHaveAttribute('aria-pressed', 'true');
	await tu.click();
	await expect(tu).toHaveAttribute('aria-pressed', 'false');
	// Aperçu vivant : la phrase générée pour un pronom coché contient la forme.
	await panneau.locator('.ortho-complement').fill('une pomme');
	await expect(panneau.locator('.ortho-verbe-apercu')).toContainText('mange');
	expect(errors).toEqual([]);
});

test('un mot non-verbe ne propose pas de paramétrage de conjugaison', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'ortho-new');
	const firstMot = page.locator('.ortho-mot').first();
	await firstMot.waitFor();
	await firstMot.fill('maison');
	// Laisse le temps à la détection (debounce + lookup) de s'exécuter.
	await page.waitForTimeout(900);
	await expect(page.locator('.ortho-verbe-suggest').first()).toBeHidden();
	expect(errors).toEqual([]);
});

test('jouer une liste de verbe : la phrase à trou s’affiche', async ({ page }) => {
	const errors = watchErrors(page);
	await creerListeAvecVerbe(page, 'Verbe test');
	// Lance la liste créée (carte « Mes listes »).
	await page.locator('[data-ortho]').filter({ hasText: 'Verbe test' }).first().click();
	// Le verbe est résolu (shard chargé) et joué dans une phrase à trou.
	await expect(page.locator('.ortho-contexte').first()).toBeVisible();
	await expect(page.locator('.ortho-trou').first()).toBeVisible();
	await expect(page.locator('.ortho-contexte').first()).toContainText('pomme');
	expect(errors).toEqual([]);
});

/* ============================================================
   #702, critères 1-2 : cibles verbe absentes de « Relire mes mots » (#261).
   `motsDeLecon` (core/orthographe/lessons.ts), utilisé par la relecture,
   ne résout que `liste.motIds` — les cibles verbe sont matérialisées À PART
   dans la banque (id `v:<infinitif>#<temps>#<personne>`, cf.
   `materialiserVerbes`/`expanseVerbe`, core/orthographe/verbes.ts) et n'y
   figurent jamais. On seed directement une liste dont les cibles sont DÉJÀ
   matérialisées (l'état exact après un premier lancement réel du parcours),
   sans repasser par la résolution LEFFF (asynchrone, hors sujet ici).
   « je mange » / « il mange » (présent, personnes 0 et 2) sont homophones :
   exactement le cas que le critère 2 doit garder distinguable. ============================================================ */
const LESSON_RELECTURE_VERBE = 'l-e2e-relecture-verbe';
const SEED_RELECTURE_VERBE = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'chat',
			commeDans: 'chat noir',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		'v:manger#present#0': {
			id: 'v:manger#present#0',
			mot: 'mange',
			contexte: { avant: 'je ', apres: ' une pomme' },
			entourage: [],
			atelierFait: false,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'verbe',
		},
		'v:manger#present#2': {
			id: 'v:manger#present#2',
			mot: 'mange',
			contexte: { avant: 'il ', apres: ' une pomme' },
			entourage: [],
			atelierFait: false,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'verbe',
		},
	},
	listes: [
		{
			id: LESSON_RELECTURE_VERBE,
			label: 'Relecture verbe',
			motIds: ['w1'],
			verbes: [
				{
					kind: 'verbe',
					infinitif: 'manger',
					pronoms: [0, 2],
					temps: ['present'],
					complement: 'une pomme',
				},
			],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'w1' },
};

async function seedRelectureVerbe(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_RELECTURE_VERBE);
}

test('critère 1 (#702) : « Relire mes mots » affiche une carte par cible verbe, en plus des mots simples', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedRelectureVerbe(page);
	await gotoHash(page, 'ortho-revoir-' + LESSON_RELECTURE_VERBE);

	// 1 mot classique + 2 cibles verbe (je/il « mange ») déjà matérialisées en banque.
	await expect(page.locator('.relecture-carte')).toHaveCount(3);
	// Les 2 cartes verbe portent la phrase de contexte…
	await expect(page.locator('.relecture-carte .ortho-contexte')).toHaveCount(2);
	// … le mot classique, lui, garde son « comme dans » et n'a pas de contexte.
	await expect(page.locator('.relecture-carte .relecture-comme')).toHaveCount(1);

	expect(errors).toEqual([]);
});

test('critère 2 (#702) : la carte d’une cible verbe montre la phrase complète, deux homophones restent distinguables', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedRelectureVerbe(page);
	await gotoHash(page, 'ortho-revoir-' + LESSON_RELECTURE_VERBE);

	const contextes = page.locator('.relecture-carte .ortho-contexte');
	await expect(contextes).toHaveCount(2);
	// La forme conjuguée est bien affichée RÉVÉLÉE (pas le trou vide) dans les 2 cartes.
	await expect(page.locator('.relecture-carte .ortho-trou.is-rempli')).toHaveCount(2);

	const textes = await contextes.allInnerTexts();
	// Le complément de la phrase est repris (pas juste la forme seule)…
	for (const t of textes) expect(t).toContain('pomme');
	// … et les deux cibles homophones (« je mange » / « il mange ») restent distinguables :
	// la phrase de contexte diffère même si la forme jouée est identique.
	expect(textes.some((t) => t.includes('je'))).toBe(true);
	expect(textes.some((t) => t.includes('il'))).toBe(true);
	expect(textes[0]).not.toEqual(textes[1]);

	expect(errors).toEqual([]);
});
