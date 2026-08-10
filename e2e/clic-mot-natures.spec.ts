/* ============================================================
   Smoke e2e — Grammaire « Clique sur… » les natures de mots, CM1 (#437) ET
   CE2 (#436). Réutilise le runner d'écran « clique sur le mot »
   (ui/lecon-clic-mot.ts) déjà couvert en profondeur par clic-verbe.spec.ts
   (#259) : sélection MULTIPLE réversible de tokens `.lclic-mot`, correction
   par égalité d'ensembles, feedback `.lqcm-ok/.lqcm-ko` + `.lqcm-expl`,
   révélation `.is-cible`. On ne réexerce pas ici toute la mécanique (déjà
   testée), on couvre : la présence des leçons par niveau, un smoke jeu par
   leçon, les cas spécifiques à ces natures (cible à PLUSIEURS mots NON
   ADJACENTS), le libellé PAR NIVEAU (#436, `labelNiveau`) et l'annonce de
   correction de la région live (#436, `explicationNommeCible`).

   CM1 (#437, 5 natures) : `levels: ['cm1']` pour la conjonction/nom
   noyau/sujet, `['ce2','cm1']` pour déterminant/pronom — on seed un profil
   CM1 et on navigue DIRECTEMENT vers le hash de la leçon (gotoHash forcerait
   ce2, catalogue où la variante CM1 n'est jamais servie par défaut).

   CE2 (#436, 4 natures : nom, adjectif, déterminant, pronom personnel sujet) :
   navigation HABITUELLE (gotoHash force ce2, niveau par défaut du catalogue).
   « nom » et « déterminant » y ont une cible PLURIELLE (tous les noms / tous
   les déterminants de la phrase, garde-fou ≥ 2) ; « adjectif » et « pronom
   sujet » restent à cible UNIQUE, comme au CM1.

   Aide contextuelle (#272/#435) : `#aideOverlay` s'ouvre au 1er lancement d'un
   profil neuf et intercepte les clics → fermée systématiquement avant toute
   interaction (fermerAideSiPresente).
   ============================================================ */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Ferme l'aide auto-affichée si présente (1er lancement, profil neuf) ; ne fait
   rien si absente. */
async function fermerAideSiPresente(page: Page): Promise<void> {
	const overlay = page.locator('#aideOverlay');
	if (await overlay.isVisible()) {
		await page.locator('.aide-ok').click();
		await expect(overlay).toHaveCount(0);
	}
}

/* Profil en CM1 (sans popup d'onboarding : niveauReference déjà fixé). */
const SEED_CM1 = `localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '🦊', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));`;

async function gotoCM1(page: Page, hash: string): Promise<void> {
	await page.addInitScript(SEED_CM1);
	await page.goto(`app.html#${hash}`, { waitUntil: 'networkidle' });
	// Une relance sur le MÊME hash (trouverCibleDouble) est un no-op de navigation
	// (URL identique) sous Chromium : .reload() force un vrai rechargement à coup sûr.
	await page.reload({ waitUntil: 'networkidle' });
}

const NB_QUESTIONS = 8; // cf. ui/lecon-clic-mot.ts (partagé par tous les runners clicMot)

/* ============================================================
   CM1 (#437) — 5 leçons.
   ============================================================ */

const LECONS_CM1 = [
	{ id: 'fr-gram-clic-det', label: 'Clique sur le déterminant' },
	{ id: 'fr-gram-clic-conj', label: 'Clique sur la conjonction' },
	{ id: 'fr-gram-clic-pron', label: 'Clique sur le pronom' },
	{ id: 'fr-gram-clic-noyau', label: 'Clique sur le nom noyau' },
	{ id: 'fr-gram-clic-sujet', label: 'Clique sur le sujet' },
];

test('les 5 leçons « Clique sur… » apparaissent en Grammaire (profil CM1)', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoCM1(page, 'categorie-fr-grammaire');
	for (const { id } of LECONS_CM1) {
		await expect(page.locator(`[data-id="${id}"]`)).toBeVisible();
	}
	expect(errors).toEqual([]);
});

for (const { id, label } of LECONS_CM1) {
	test(`CM1 : « ${label} » se rend et se joue (sélection, Vérifier, feedback)`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoCM1(page, `lecon-${id}`); // mono-mode → lancement direct
		const mots = page.locator('.lclic-mot');
		await mots.first().waitFor();
		await fermerAideSiPresente(page); // écarte l'auto-aide (#435) avant toute interaction

		await expect(page.locator('#lclicVerif')).toBeDisabled();

		await mots.first().click();
		await expect(mots.first()).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('#lclicVerif')).toBeEnabled();

		await page.locator('#lclicVerif').click();
		await expect(page.locator('#lclicVerif')).toBeHidden();
		await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
		await expect(page.locator('.lqcm-expl')).toBeVisible();
		await expect(mots.first()).toHaveClass(/correct|wrong/);
		expect(errors).toEqual([]);
	});
}

/* Avance dans les questions d'un run jusqu'à tomber sur une cible DOUBLE non
   adjacente (« ni…ni » en conjonction, sujet composé de noms propres en sujet).
   Le mot cliqué (le dernier mot cliquable de la phrase) sert de pari pour
   déclencher Vérifier ; la taille RÉELLE de la cible se déduit du nombre de
   mots marqués (`.correct` + `.is-cible`) après correction — jamais lue depuis
   les données. Relance bornée (5 runs) plutôt qu'un waitForTimeout, comme
   trouverCibleDouble dans clic-verbe.spec.ts. Laisse la page sur l'item trouvé,
   déjà vérifié. */
async function trouverCibleDouble(page: Page, hash: string): Promise<boolean> {
	for (let run = 0; run < 5; run++) {
		await gotoCM1(page, hash);
		for (let q = 0; q < NB_QUESTIONS; q++) {
			const mots = page.locator('.lclic-mot');
			await mots.first().waitFor();
			if (q === 0) await fermerAideSiPresente(page); // écarte l'auto-aide (#435), 1re question du run
			const n = await mots.count();
			await mots.nth(n - 1).click();
			await page.locator('#lclicVerif').click();
			const tailleCible = await page.locator('.lclic-mot.correct, .lclic-mot.is-cible').count();
			if (tailleCible === 2) return true;
			if (q < NB_QUESTIONS - 1) await page.locator('#lclicActions button').click();
		}
	}
	return false;
}

test('CM1 : une cible à deux mots non adjacents (ni…ni) est révélée par .is-cible', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const trouve = await trouverCibleDouble(page, 'lecon-fr-gram-clic-conj');
	expect(trouve).toBe(true); // un item « ni…ni » a bien été tiré (dans les runs tentés)
	await expect(page.locator('.lclic-mot.correct, .lclic-mot.is-cible')).toHaveCount(2);
	expect(errors).toEqual([]);
});

/* ============================================================
   CE2 (#436) — 4 leçons : nom, adjectif, déterminant, pronom personnel sujet.
   ============================================================ */

const LECONS_CE2 = [
	{ id: 'fr-gram-clic-det', label: 'Clique sur le déterminant' },
	{ id: 'fr-gram-clic-noyau', label: 'Clique sur le nom' },
	{ id: 'fr-gram-clic-adj', label: "Clique sur l'adjectif" },
	{ id: 'fr-gram-clic-pron', label: 'Clique sur le pronom' },
];

test('les 4 leçons CE2 « Clique sur… » apparaissent en Grammaire', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'categorie-fr-grammaire'); // gotoHash force le niveau ce2 par défaut
	for (const { id } of LECONS_CE2) {
		await expect(page.locator(`[data-id="${id}"]`)).toBeVisible();
	}
	expect(errors).toEqual([]);
});

for (const { id, label } of LECONS_CE2) {
	test(`CE2 : « ${label} » se rend et se joue (sélection, Vérifier, feedback)`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoHash(page, `lecon-${id}`); // mono-mode → lancement direct
		const mots = page.locator('.lclic-mot');
		await mots.first().waitFor();
		await fermerAideSiPresente(page);

		await expect(page.locator('#lclicVerif')).toBeDisabled();

		await mots.first().click();
		await expect(mots.first()).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('#lclicVerif')).toBeEnabled();

		await page.locator('#lclicVerif').click();
		await expect(page.locator('#lclicVerif')).toBeHidden();
		await expect(page.locator('.lqcm-ok, .lqcm-ko')).toBeVisible();
		await expect(page.locator('.lqcm-expl')).toBeVisible();
		await expect(mots.first()).toHaveClass(/correct|wrong/);
		expect(errors).toEqual([]);
	});
}

/* Libellé PAR NIVEAU (#436, `LessonDef.labelNiveau`) : « nom » se nomme
   « Clique sur le nom » au CE2 et « Clique sur le nom noyau » au CM1, résolu
   par le même helper `leconTitreHTML`/`labelLecon` pour la carte de leçon
   (`.lz-title`) ET le titre du runner (`.sprint-lesson`). C'est le test qui
   verrouille le mécanisme transverse (10 runners partagent `leconTitreHTML`). */
test('libellé par niveau : « nom » se nomme différemment en CE2 et en CM1 (carte + runner)', async ({
	page,
}) => {
	const errors = watchErrors(page);

	await gotoHash(page, 'categorie-fr-grammaire'); // ce2 par défaut
	await expect(page.locator('[data-id="fr-gram-clic-noyau"] .lz-title')).toHaveText(
		'Clique sur le nom',
	);

	await gotoHash(page, 'lecon-fr-gram-clic-noyau');
	await page.locator('.lclic-mot').first().waitFor();
	await fermerAideSiPresente(page);
	await expect(page.locator('.sprint-lesson')).toHaveText('Clique sur le nom');

	await gotoCM1(page, 'categorie-fr-grammaire');
	await expect(page.locator('[data-id="fr-gram-clic-noyau"] .lz-title')).toHaveText(
		'Clique sur le nom noyau',
	);

	await gotoCM1(page, 'lecon-fr-gram-clic-noyau');
	await page.locator('.lclic-mot').first().waitFor();
	await fermerAideSiPresente(page);
	await expect(page.locator('.sprint-lesson')).toHaveText('Clique sur le nom noyau');

	expect(errors).toEqual([]);
});

/* Régression (relecture qualité, #436) : `encadrant-erreurs.ts` lisait le libellé BRUT
   de la leçon (`lesson.label`) au lieu de le résoudre par niveau (`labelLecon`) — les
   erreurs d'un enfant CM1 sur cette leçon s'affichaient sous « Clique sur le nom » au
   lieu de « Clique sur le nom noyau ». Un test en profil CE2 ne peut PAS attraper ce
   bug : le libellé neutre (`label`, utilisé par erreur) y est PAR COÏNCIDENCE identique
   au libellé CE2 (`labelNiveau.ce2`) — le test passerait pour la mauvaise raison. Seul
   un profil CM1 distingue vraiment le libellé résolu (« … nom noyau ») du libellé
   neutre (« … nom ») : c'est le cœur de ce test, pas un détail. Couvre aussi un second
   site du même libellé résolu (l'`aria-label` du bouton « Épingler »), le correctif
   ayant touché 7 endroits au total. */
test('round-trip encadrant CM1 : le groupe d’erreurs porte le libellé RÉSOLU (« nom noyau »), pas le libellé neutre', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(`localStorage.removeItem('ludaskia_encadrant_lock');`);
	await gotoCM1(page, 'lecon-fr-gram-clic-noyau'); // CM1 : cible unique (nom noyau)
	const mots = page.locator('.lclic-mot');
	await mots.first().waitFor();
	await fermerAideSiPresente(page);

	// Cible size == 1 (banque CM1 « nom noyau ») : sélectionner DEUX mots garantit une
	// erreur (cardinal 2 ≠ cible 1), sans avoir besoin de savoir lequel est le bon.
	const n = await mots.count();
	expect(n).toBeGreaterThanOrEqual(2);
	await mots.nth(0).click();
	await mots.nth(1).click();
	await page.locator('#lclicVerif').click();
	await expect(page.locator('.lqcm-ko')).toBeVisible();

	await gotoCM1(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	// Titre du groupe : le libellé RÉSOLU pour le niveau du profil consulté (CM1),
	// jamais le libellé neutre — la régression exacte trouvée par la relecture qualité.
	await expect(lecon.locator('.enc-err-lecon-lab')).toHaveText('Clique sur le nom noyau');

	// Second site du même libellé résolu : l'aria-label du bouton « Épingler ».
	await lecon.locator('.enc-err-sum').click();
	await expect(lecon.locator('[data-act="epingler"]')).toHaveAttribute(
		'aria-label',
		'Épingler « Clique sur le nom noyau »',
	);

	expect(errors).toEqual([]);
});

/* Sous-ensemble des phrases CE2 « Clique sur les noms » (grammaire-clic-mot.ts,
   PHRASES_NOM_CE2) dont la cible fait TROIS mots — copie VERBATIM de la
   banque. Nécessaire pour vérifier qu'une sélection COMPLÈTE d'une cible
   plurielle est acceptée juste : contrairement à un champ `.ans`, ce widget
   n'expose pas la réponse via un `data-answer` (a11y voulue : la bonne réponse
   ne se lit qu'après Vérifier), donc la seule façon de sélectionner EXACTEMENT
   la cible sur un rendu encore vierge est de la connaître à l'avance. Si cette
   banque change, ce dictionnaire doit être mis à jour en conséquence.
   Clé = les mots CLIQUABLES joints par « | », dans l'ORDRE du DOM (ponctuation
   exclue, comme `.lclic-mot`). */
const NOM_CE2_TRIPLES: Record<string, string[]> = {
	'Dans|la|cour|les|enfants|jouent|au|ballon': ['cour', 'enfants', 'ballon'],
	'Sur|la|table|un|vase|attend|les|fleurs': ['table', 'vase', 'fleurs'],
	'Chaque|matin|le|coq|réveille|la|ferme': ['matin', 'coq', 'ferme'],
	'Pendant|les|vacances|ma|famille|visite|un|château': ['vacances', 'famille', 'château'],
	'Le|soir|les|étoiles|brillent|dans|le|ciel': ['soir', 'étoiles', 'ciel'],
	'Derrière|la|maison|un|chien|creuse|un|trou': ['maison', 'chien', 'trou'],
	'Au|marché|le|vendeur|pèse|les|pommes': ['marché', 'vendeur', 'pommes'],
	'Sous|le|lit|le|chat|cache|une|balle': ['lit', 'chat', 'balle'],
	'Après|la|récréation|les|élèves|rangent|leurs|cahiers': ['récréation', 'élèves', 'cahiers'],
	'Devant|le|portail|une|voiture|attend|le|facteur': ['portail', 'voiture', 'facteur'],
	'Paul|et|Léa|partagent|un|goûter': ['Paul', 'Léa', 'goûter'],
	'Le|chien|de|Julie|aboie|dans|le|jardin': ['chien', 'Julie', 'jardin'],
	'Tom|range|ses|jouets|dans|la|boîte': ['Tom', 'jouets', 'boîte'],
	'Emma|apporte|un|cadeau|à|sa|cousine': ['Emma', 'cadeau', 'cousine'],
	'Lucas|oublie|son|cartable|dans|la|classe': ['Lucas', 'cartable', 'classe'],
	'Ce|matin|Marie|promène|le|chien': ['matin', 'Marie', 'chien'],
	'Nina|et|son|frère|préparent|une|surprise': ['Nina', 'frère', 'surprise'],
};

/* Clique le bouton `.lclic-mot` portant EXACTEMENT le texte `mot` (déduit de
   `textes`, capturé dans le même ordre DOM que `mots`). */
async function clicTexte(mots: Locator, textes: string[], mot: string): Promise<void> {
	const i = textes.indexOf(mot);
	await mots.nth(i).click();
}

/* Recherche, dans les tirages aléatoires de « Clique sur les noms » (CE2), une
   phrase RECONNUE de `NOM_CE2_TRIPLES` (cible à 3 mots) ; `agir` sélectionne
   et Vérifie sur la phrase trouvée. Relance bornée (5 runs), comme
   trouverCibleDouble : ~31 % des phrases de la banque ont 3 cibles, la
   probabilité de n'en tirer AUCUNE en 40 tirages est négligeable. */
async function trouverTriple(
	page: Page,
	hash: string,
	agir: (mots: Locator, textes: string[], cibles: string[]) => Promise<void>,
): Promise<boolean> {
	for (let run = 0; run < 5; run++) {
		await gotoHash(page, hash);
		await page.reload({ waitUntil: 'networkidle' }); // nouveau tirage même sur hash inchangé (#511)
		for (let q = 0; q < NB_QUESTIONS; q++) {
			const mots = page.locator('.lclic-mot');
			await mots.first().waitFor();
			if (run === 0 && q === 0) await fermerAideSiPresente(page);
			const textes = (await mots.allTextContents()).map((t) => t.trim());
			const cibles = NOM_CE2_TRIPLES[textes.join('|')];
			if (cibles) {
				await agir(mots, textes, cibles);
				return true;
			}
			if (q < NB_QUESTIONS - 1) {
				await mots.first().click();
				await page.locator('#lclicVerif').click();
				await page.locator('#lclicActions button').click();
			}
		}
	}
	return false;
}

test('CE2 « nom » : cible à 3 mots — sélection incomplète fausse, sélection complète juste', async ({
	page,
}) => {
	const errors = watchErrors(page);

	// 1) Sélection INCOMPLÈTE (2 des 3 mots-cibles) : comptée fausse malgré 2
	// mots corrects choisis — le contrat est une égalité d'ensembles EXACTE.
	const incomplet = await trouverTriple(
		page,
		'lecon-fr-gram-clic-noyau',
		async (mots, textes, cibles) => {
			await clicTexte(mots, textes, cibles[0]);
			await clicTexte(mots, textes, cibles[1]);
			await page.locator('#lclicVerif').click();
		},
	);
	expect(incomplet).toBe(true); // un item à 3 cibles a bien été tiré (dans les runs tentés)
	await expect(page.locator('.lqcm-ko')).toBeVisible();
	await expect(page.locator('.lclic-mot.correct')).toHaveCount(2);
	await expect(page.locator('.lclic-mot.is-cible')).toHaveCount(1); // le 3e mot, non choisi, révélé

	// 2) Sélection COMPLÈTE (les 3 mots-cibles, non adjacents) : comptée juste.
	const complet = await trouverTriple(
		page,
		'lecon-fr-gram-clic-noyau',
		async (mots, textes, cibles) => {
			for (const c of cibles) await clicTexte(mots, textes, c);
			await page.locator('#lclicVerif').click();
		},
	);
	expect(complet).toBe(true);
	await expect(page.locator('.lqcm-ok')).toBeVisible();
	await expect(page.locator('.lclic-mot.correct')).toHaveCount(3);
	await expect(page.locator('.lclic-mot.wrong')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Annonce de correction (région live #lclicStatus, #436) : une cible PLURIELLE
   (nom, déterminant) porte `explicationNommeCible` — l'explication nomme déjà
   les mots, la live region ne doit PAS réénumérer « La bonne réponse : … ».
   Cible ≥ 2 (garde-fou de construction de nomsCE2) : un seul mot choisi est
   TOUJOURS faux, quel que soit le tirage — pas besoin de connaître la phrase. */
test('annonce #lclicStatus : réponse OMISE sur une leçon plurielle (l’explication la nomme déjà)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-gram-clic-noyau'); // CE2, cible plurielle
	const mots = page.locator('.lclic-mot');
	await mots.first().waitFor();
	await fermerAideSiPresente(page);

	await mots.first().click();
	await page.locator('#lclicVerif').click();
	await expect(page.locator('.lqcm-ko')).toBeVisible();

	const annonce = ((await page.locator('#lclicStatus').textContent()) ?? '').trim();
	expect(annonce.length).toBeGreaterThan(0); // l'explication reste annoncée (jamais silencieux)
	expect(annonce).not.toContain('La bonne réponse');
	expect(errors).toEqual([]);
});

/* Symétrique : sur une leçon à cible UNIQUE (pronom personnel sujet, sans
   `explicationNommeCible`), « La bonne réponse : … » doit TOUJOURS être
   annoncée. Sélectionner DEUX mots garantit une erreur (cardinal 2 ≠ cible 1)
   sans avoir besoin de savoir lequel des deux est le bon. */
test('annonce #lclicStatus : réponse TOUJOURS présente sur une leçon à cible unique', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-gram-clic-pron'); // CE2, cible unique (pronom sujet)
	const mots = page.locator('.lclic-mot');
	await mots.first().waitFor();
	await fermerAideSiPresente(page);

	const n = await mots.count();
	expect(n).toBeGreaterThanOrEqual(2);
	await mots.nth(0).click();
	await mots.nth(1).click();
	await page.locator('#lclicVerif').click();
	await expect(page.locator('.lqcm-ko')).toBeVisible();
	await expect(page.locator('#lclicStatus')).toContainText('La bonne réponse');
	expect(errors).toEqual([]);
});

/* Round-trip journal encadrant (#391) + énumération française (#436) : une
   cible à 3 mots ratée doit remonter dans #encadrant avec sa réponse
   énumérée « a, b et c » (virgules + un SEUL « et » avant le dernier), jamais
   « a et b et c ». Réutilise trouverTriple : une seule des 3 cibles choisie
   garantit une réponse fausse. */
test('round-trip encadrant : la réponse à 3 mots est énumérée « à la française »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(`localStorage.removeItem('ludaskia_encadrant_lock');`);

	const trouve = await trouverTriple(
		page,
		'lecon-fr-gram-clic-noyau',
		async (mots, textes, cibles) => {
			await clicTexte(mots, textes, cibles[0]);
			await page.locator('#lclicVerif').click();
		},
	);
	expect(trouve).toBe(true);
	await expect(page.locator('.lqcm-ko')).toBeVisible();

	await gotoHash(page, 'encadrant');
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	const texte = (await lecon.locator('.enc-err-bonne').first().textContent()) ?? '';
	expect(texte).toContain(', '); // virgule(s) entre les mots qui précèdent le dernier
	expect(texte.match(/ et /g)?.length ?? 0).toBe(1); // un SEUL « et », jamais « a et b et c »
	expect(errors).toEqual([]);
});
