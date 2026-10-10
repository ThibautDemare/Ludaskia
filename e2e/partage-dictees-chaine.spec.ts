/* ============================================================
   Séance partagée (#734), PR 5, côté ENCADRANT : composer l'envoi d'une DICTÉE,
   puis la chaîne complète (critère 37) : créer, jouer, lire le résultat, importer.

   Spec écrite AVANT l'implémentation, depuis le contrat de la PR 5 (§5, §7, §8 et §10,
   qui prime). Elle est ROUGE tant que la source « Une dictée » n'existe pas dans l'onglet
   « Envois ». Le côté enfant détaillé est testé par `partage-dictees.spec.ts` : ici on se
   contente de le JOUER.

   Deux profils : « E2E » (actif) possède une liste d'orthographe personnalisée dont un mot,
   « 1er », est refusé par la liste blanche du lien ; « Léa » n'a aucune liste. Les mots
   attendus se lisent dans l'envoi DÉCODÉ (code lu dans le lien créé), jamais à l'écran.

   Libellés : sont cités mot pour mot ceux qui SONT l'objet du test (« Une dictée »,
   « Dictée : <label>, CE2, N mots », « Niveau : CE2 », lignes « Leçon » du résultat) ; ce
   sont ceux du contrat §7-§8. Le reste s'asserte sur l'exigence.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { gotoHash, watchErrors } from './helpers';
import { STUB_VOIX_FR } from './journal-couverture';
import { decoderResultat } from './partage-fixtures';
import { decoderEnvoi } from '../src/core/partage/envoi';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';

const ID_PREDEF = 'fr-ortho-invariables-1';
const PREDEF = ORTHO_PREDEF.find((d) => d.id === ID_PREDEF)!;
const ID_LISTE = '3f2c1a9e-5b7d-4c21-8e0f-a1b2c3d4e5f6';
const LABEL_LISTE = 'Mots de la semaine';
const MOT_REFUSE = '1er';
/* Libellé de repli d'une liste absente (contrat §5, `LABEL_LISTE_ABSENTE`). RECOPIÉ : importer
   `core/orthographe/lessons` charge le lexique des verbes (`manifest.json`), que Node ne sait
   pas importer sans attribut JSON. C'est le libellé lui-même qui est l'objet du test. */
const LABEL_LISTE_ABSENTE = 'Liste de dictée absente de ce profil';

/* ---------- Données semées ---------- */

const mot = (id: string, forme: string) => ({
	id,
	mot: forme,
	entourage: [],
	atelierFait: true,
	validation: { motCache: false, tuiles: false, dictee: false },
	revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
	origine: 'liste',
});

const ORTHO_AVEC_LISTE = {
	banque: {
		w1: mot('w1', 'bonjour'),
		w2: mot('w2', 'alors'),
		w3: mot('w3', MOT_REFUSE),
		w4: mot('w4', 'renard'),
	},
	listes: [
		{
			id: ID_LISTE,
			label: LABEL_LISTE,
			motIds: ['w1', 'w2', 'w3', 'w4'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { bonjour: 'w1', alors: 'w2', [MOT_REFUSE]: 'w3', renard: 'w4' },
};

/** Deux profils ; l'actif « E2E » a la liste, « Léa » rien. Posé seulement si absent :
 *  `addInitScript` rejoue à chaque navigation et écraserait un profil créé par l'import. */
const SEED = `(() => {
  if (localStorage.getItem('ludaskia_profiles')) return;
  localStorage.setItem('ludaskia_profiles', JSON.stringify({
    list: [
      { uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'ce2' },
      { uuid: 'lea', name: 'Léa', emoji: '\\uD83D\\uDC31', updatedAt: 1, niveauReference: 'ce2' },
    ],
    active: 'e2e',
  }));
  localStorage.setItem('e2e/ludaskia_ortho', ${JSON.stringify(JSON.stringify(ORTHO_AVEC_LISTE))});
})();`;

async function preparer(page: Page) {
	await page.addInitScript(STUB_VOIX_FR);
	await page.addInitScript(SEED);
}

/* ---------- Aides ---------- */

const lire = <T>(page: Page, cle: string): Promise<T | null> =>
	page.evaluate((k) => {
		const v = localStorage.getItem(k);
		return v === null ? null : JSON.parse(v);
	}, cle);

function surveillerReseau(page: Page, baseURL: string | undefined): string[] {
	const sortants: string[] = [];
	const origine = new URL(baseURL ?? 'http://localhost:4173').origin;
	page.on('request', (r) => {
		const type = r.resourceType();
		const u = new URL(r.url());
		const externe = !['data:', 'blob:'].includes(u.protocol) && u.origin !== origine;
		const decor = r.method() === 'GET' && !u.search && u.pathname.endsWith('/foret-pied.svg');
		if (((type === 'fetch' || type === 'xhr') && !decor) || externe)
			sortants.push(`${type} ${r.method()} ${r.url()}`);
	});
	return sortants;
}

const hashDe = (lien: string) => new URL(lien).hash.slice(1);
const codeDuLien = (lien: string, route: 'envoi' | 'resultat') =>
	lien.slice(lien.indexOf(`#${route}/`) + route.length + 2);

async function ouvrirEnvois(page: Page) {
	await gotoHash(page, 'encadrant/envois');
	await expect(page.locator('.enc-tab[data-tab="envois"]')).toBeVisible();
}

async function choisirDictee(page: Page, quoi: 'predefinie' | 'liste') {
	await page.locator('button[data-act="envoi-source"][data-source="dictee"]').click();
	await page.locator(`[data-act="envoi-dictee"][data-dictee="${quoi}"]`).click();
}

async function creerLien(page: Page, libelle?: string): Promise<string> {
	if (libelle !== undefined) await page.locator('input#envoiLibelle').fill(libelle);
	await page.locator('button#envoiCreer').click();
	await expect(page.locator('#envoiCree')).toBeVisible();
	return page.locator('input#envoiLien').inputValue();
}

/** L'envoi décodé depuis le lien (le vrai décodeur), avec `lecon` (contrat §1). */
async function envoiDecode(lien: string) {
	const r = await decoderEnvoi(codeDuLien(lien, 'envoi'));
	if (!r.ok) throw new Error(`lien d'envoi refusé : ${r.raison}`);
	const e = r.valeur as unknown as {
		nature: string;
		niveau?: string;
		lecon?: string;
		mots: { mot: string }[];
	};
	return e;
}

/** Joue la dictée : un mot à la fois ; le 2e est volontairement raté. Renvoie les mots. */
async function jouerDictee(page: Page, mots: string[]) {
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await page.locator('#partageCommencer').click();
	for (let i = 0; i < mots.length; i++) {
		await expect(page.locator('.lqcm-progress-lab')).toContainText(new RegExp(`Mot ${i + 1} / `));
		await expect(page.locator('#orthoInput')).toBeVisible();
		await page.locator('#orthoInput').fill(i === 1 ? 'zzz' : mots[i]);
		await page.locator('[data-partage-valider]').click();
	}
	await expect(page.locator('#partageFin')).toBeVisible();
}

async function lienResultat(page: Page, pseudo: string): Promise<string> {
	await page.locator('#partagePseudo').fill(pseudo);
	await expect
		.poll(async () => {
			const lien = await page.locator('#partageLien').inputValue();
			const r = await decoderResultat(codeDuLien(lien, 'resultat'));
			return r.ok ? r.valeur.pseudo : '';
		})
		.toBe(pseudo);
	return page.locator('#partageLien').inputValue();
}

async function ouvrirJournal(page: Page) {
	await page.locator('a#resultatVoirSuivi').click();
	const tout = page.locator('.enc-act-mode[data-act="erreurs-periode"][data-periode="tout"]');
	await expect(tout).toBeVisible();
	await tout.click();
}

/* ============================================================
   Composer l'envoi d'une dictée (1, 4, 39)
   ============================================================ */

test('1 · source « Une dictée » : prédéfinie groupée par niveau, niveau et nombre de mots affichés, libellé prérempli', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await preparer(page);
	await ouvrirEnvois(page);
	await choisirDictee(page, 'predefinie');

	const sel = page.locator('select#envoiDicteePredefinie');
	await expect(sel).toBeVisible();
	await expect(sel.locator('optgroup[label="CE2"]')).toHaveCount(1);
	await expect(sel.locator('optgroup[label="CM1"]')).toHaveCount(1);
	await expect(sel.locator('option')).toHaveCount(ORTHO_PREDEF.length);
	await sel.selectOption(ID_PREDEF);

	await expect(page.locator('.enc-envoi-fixe').filter({ hasText: 'Niveau : CE2' })).toBeVisible();
	await expect(page.locator('body')).toContainText(`${PREDEF.mots.length} mots.`);
	// Contrat §7 : `libelleParDefaut` ramène le nom dans la liste blanche du libellé (lettres,
	// chiffres, apostrophe, trait d'union, espace) ; la parenthèse devient une espace.
	const attendu = PREDEF.label
		.replace(/[^\p{L}\p{N}'\- ]/gu, ' ')
		.replace(/ {2,}/g, ' ')
		.trim();
	expect(await page.locator('input#envoiLibelle').inputValue()).toBe(attendu);
	expect(errors).toEqual([]);
});

test('1 · source « Une dictée » : la liste du profil consulté est proposée, un profil sans liste le dit', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await preparer(page);
	await ouvrirEnvois(page);
	await choisirDictee(page, 'liste');

	const sel = page.locator('select#envoiDicteeListe');
	await expect(sel).toBeVisible();
	await expect(sel.locator('option')).toHaveCount(1);
	await expect(sel.locator(`option[value="${ID_LISTE}"]`)).toHaveText(LABEL_LISTE);
	await expect(page.locator('#envoiDicteeAucune')).toHaveCount(0);
	expect(await page.locator('input#envoiLibelle').inputValue()).toContain(LABEL_LISTE);
	// Pas de niveau pour une liste personnalisée.
	await expect(page.locator('select#envoiNiveau')).toHaveCount(0);

	// Profil sans liste : consulter « Léa », puis rouvrir l'onglet.
	await gotoHash(page, 'encadrant/envois');
	await page.evaluate(() => {
		const p = JSON.parse(localStorage.getItem('ludaskia_profiles')!);
		p.active = 'lea';
		localStorage.setItem('ludaskia_profiles', JSON.stringify(p));
	});
	await ouvrirEnvois(page);
	await choisirDictee(page, 'liste');
	await expect(page.locator('#envoiDicteeAucune')).toBeVisible();
	await expect(page.locator('select#envoiDicteeListe')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('1, 4 · dictée prédéfinie : lien créé, ligne de « Vos envois », envoi décodé de nature dictée avec son id et son niveau', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await preparer(page);
	await ouvrirEnvois(page);
	await choisirDictee(page, 'predefinie');
	await page.locator('select#envoiDicteePredefinie').selectOption(ID_PREDEF);
	const lien = await creerLien(page);

	// Intitulé de l'historique : cité tel que le contrat §7 le fixe.
	await expect(page.locator('body')).toContainText(
		`Dictée : ${PREDEF.label}, CE2, ${PREDEF.mots.length} mots`,
	);

	const e = await envoiDecode(lien);
	expect(e.nature).toBe('dictee');
	expect(e.lecon).toBe(ID_PREDEF);
	expect(e.niveau).toBe('ce2');
	expect(e.mots.map((m) => m.mot)).toEqual(PREDEF.mots.map((m) => m.mot));
	expect(errors).toEqual([]);
});

test('1, 39 · dictée depuis la liste : le mot refusé est nommé, absent de l’envoi, qui porte l’id de la liste et pas de niveau', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await preparer(page);
	await ouvrirEnvois(page);
	await choisirDictee(page, 'liste');
	const lien = await creerLien(page);

	await expect(page.locator('#envoiEcartes')).toContainText(MOT_REFUSE);
	await expect(page.locator('body')).toContainText(`Dictée : ${LABEL_LISTE}`);

	const e = await envoiDecode(lien);
	expect(e.nature).toBe('dictee');
	expect(e.lecon).toBe(ID_LISTE);
	expect(e.niveau).toBeUndefined();
	const formes = e.mots.map((m) => m.mot);
	expect(formes).not.toContain(MOT_REFUSE);
	expect(formes).toEqual(expect.arrayContaining(['bonjour', 'alors', 'renard']));
	expect(errors).toEqual([]);
});

/* ============================================================
   Chaîne complète (37, 20) : créer, jouer, lire, importer
   ============================================================ */

test('37 · chaîne DICTÉE PRÉDÉFINIE : créer, jouer, lire (leçon et niveau), importer dans un nouveau profil de classe CE2', async ({
	page,
	baseURL,
}) => {
	const errors = watchErrors(page);
	await preparer(page);
	await ouvrirEnvois(page);
	await choisirDictee(page, 'predefinie');
	await page.locator('select#envoiDicteePredefinie').selectOption(ID_PREDEF);
	const lienEnvoi = await creerLien(page);
	const e = await envoiDecode(lienEnvoi);
	const sortants = surveillerReseau(page, baseURL);

	await gotoHash(page, hashDe(lienEnvoi));
	await jouerDictee(
		page,
		e.mots.map((m) => m.mot),
	);
	const lienRes = await lienResultat(page, 'Zoé');

	await gotoHash(page, hashDe(lienRes));
	await expect(page.locator('#resultatTitre')).toContainText('Zoé');
	await expect(page.locator('li.resultat-item')).toHaveCount(e.mots.length);
	await expect(page.locator('li.resultat-item[data-statut="faux"]')).toHaveCount(1);
	await expect(page.locator('li.resultat-item[data-statut="faux"] .resultat-saisie')).toContainText(
		'zzz',
	);
	// Lignes citées du contrat §8.
	await expect(page.locator('dt', { hasText: 'Leçon' })).toBeVisible();
	await expect(page.locator('body')).toContainText(PREDEF.label);
	await expect(page.locator('#resultatNiveau')).toHaveText('CE2');

	await page.locator('button#resultatImporter').click();
	await page.locator('input[name="resultatCible"][value="nouveau"]').check();
	await expect(page.locator('select#resultatClasse')).toHaveValue('ce2');
	await page.locator('button#resultatConfirmer').click();
	await expect(page.locator('a#resultatVoirSuivi')).toBeVisible();

	expect(sortants).toEqual([]); // 28
	expect(errors).toEqual([]);
});

test('37, 20 · chaîne LISTE : ni leçon ni niveau ni id dans le résultat, classe vide à l’import', async ({
	page,
	baseURL,
}) => {
	const errors = watchErrors(page);
	await preparer(page);
	await ouvrirEnvois(page);
	await choisirDictee(page, 'liste');
	const lienEnvoi = await creerLien(page);
	const e = await envoiDecode(lienEnvoi);
	const sortants = surveillerReseau(page, baseURL);

	await gotoHash(page, hashDe(lienEnvoi));
	await jouerDictee(
		page,
		e.mots.map((m) => m.mot),
	);
	const lienRes = await lienResultat(page, 'Zoé');

	await gotoHash(page, hashDe(lienRes));
	await expect(page.locator('#resultatTitre')).toContainText('Zoé');
	await expect(page.locator('li.resultat-item')).toHaveCount(e.mots.length);
	await expect(page.locator('dt', { hasText: 'Leçon' })).toHaveCount(0);
	await expect(page.locator('#resultatNiveau')).toHaveCount(0);
	// L'id de la liste ne doit se lire nulle part (arbitrage du mainteneur, §8).
	expect(await page.locator('body').innerText()).not.toContain(ID_LISTE);

	await page.locator('button#resultatImporter').click();
	await page.locator('input[name="resultatCible"][value="nouveau"]').check();
	await expect(page.locator('select#resultatClasse')).toHaveValue('');
	await page.locator('button#resultatConfirmer').click();
	await expect(page.locator('a#resultatVoirSuivi')).toBeVisible();
	const { list } = (await lire<{ list: { name: string; niveauReference?: string }[] }>(
		page,
		'ludaskia_profiles',
	))!;
	const zoe = list.find((p) => p.name === 'Zoé');
	expect(zoe).toBeDefined();
	expect(zoe!.niveauReference ?? '').toBe('');

	expect(sortants).toEqual([]); // 28
	expect(errors).toEqual([]);
});

/* ============================================================
   Libellé de repli dans le journal de l'encadrant (§5, §8)
   ============================================================ */

const activerProfil = (page: Page, uuid: string) =>
	page.evaluate((u) => {
		const p = JSON.parse(localStorage.getItem('ludaskia_profiles')!);
		p.active = u;
		localStorage.setItem('ludaskia_profiles', JSON.stringify(p));
	}, uuid);

/** Crée l'envoi de liste en « E2E », puis le fait jouer par `joueur` (profil actif pendant le
 *  jeu). Un profil qui a joué la séance ici a déjà ses erreurs au journal : importer SON
 *  résultat est refusé (`deja`), d'où un joueur distinct pour éprouver l'import. */
async function resultatDeListe(page: Page, joueur = 'e2e'): Promise<string> {
	await ouvrirEnvois(page);
	await choisirDictee(page, 'liste');
	const lienEnvoi = await creerLien(page);
	const e = await envoiDecode(lienEnvoi);
	if (joueur !== 'e2e') await activerProfil(page, joueur);
	await gotoHash(page, hashDe(lienEnvoi));
	await jouerDictee(
		page,
		e.mots.map((m) => m.mot),
	);
	return lienResultat(page, 'Zoé');
}

test('37 · résultat de liste importé dans le profil qui POSSÈDE la liste : le journal range l’erreur sous le nom de la liste', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await preparer(page);
	const lienRes = await resultatDeListe(page, 'lea');
	await activerProfil(page, 'e2e');

	await gotoHash(page, hashDe(lienRes));
	await page.locator('button#resultatImporter').click();
	await page.locator('input[name="resultatCible"][value="e2e"]').check();
	await page.locator('button#resultatConfirmer').click();
	await ouvrirJournal(page);

	await expect(page.locator('.enc-err-lecon-lab')).toHaveText([LABEL_LISTE]);
	expect(await page.locator('body').innerText()).not.toContain(ID_LISTE);
	expect(errors).toEqual([]);
});

test('37 · résultat joué par le profil même : l’import est refusé comme déjà au suivi, rien n’est ajouté', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await preparer(page);
	const lienRes = await resultatDeListe(page);

	await gotoHash(page, hashDe(lienRes));
	await page.locator('button#resultatImporter').click();
	await page.locator('input[name="resultatCible"][value="e2e"]').check();
	await page.locator('button#resultatConfirmer').click();
	// Message du contrat (`deja`) : il est l'objet du test.
	await expect(page.locator('#resultatImportStatut')).toContainText('déjà dans le suivi');
	await expect(page.locator('a#resultatVoirSuivi')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('37 · résultat de liste importé dans un AUTRE profil : le journal titre le groupe du libellé de repli, jamais de l’id', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await preparer(page);
	const lienRes = await resultatDeListe(page);

	await gotoHash(page, hashDe(lienRes));
	await page.locator('button#resultatImporter').click();
	await page.locator('input[name="resultatCible"][value="lea"]').check();
	await page.locator('button#resultatConfirmer').click();
	await ouvrirJournal(page);

	await expect(page.locator('.enc-err-lecon-lab')).toHaveText([LABEL_LISTE_ABSENTE]);
	expect(await page.locator('body').innerText()).not.toContain(ID_LISTE);
	expect(errors).toEqual([]);
});

/* ============================================================
   Avertissements à la création (§10) : mots refusés, verbes non conjugués
   ============================================================ */

test('39 · liste avec « 1er », « M. » et un verbe hors lexique : les deux avertissements nomment ce qui manque, le titre y renvoie, l’envoi ne les contient pas', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await preparer(page);
	const ortho = {
		banque: {
			w1: mot('w1', 'bonjour'),
			w2: mot('w2', 'alors'),
			w3: mot('w3', '1er'),
			w4: mot('w4', 'M.'),
		},
		listes: [
			{
				id: ID_LISTE,
				label: LABEL_LISTE,
				motIds: ['w1', 'w2', 'w3', 'w4'],
				verbes: [{ kind: 'verbe', infinitif: 'xyzzer', pronoms: [0], temps: ['present'] }],
				createdAt: 1,
				updatedAt: 1,
			},
		],
		motIdParForme: { bonjour: 'w1', alors: 'w2', '1er': 'w3', 'M.': 'w4' },
	};
	// Posé APRÈS le semis commun : il l'emporte à chaque navigation.
	await page.addInitScript(
		(o) => localStorage.setItem('e2e/ludaskia_ortho', o),
		JSON.stringify(ortho),
	);
	await ouvrirEnvois(page);
	await choisirDictee(page, 'liste');
	const lien = await creerLien(page);

	const ecartes = page.locator('#envoiEcartes');
	await expect(ecartes).toContainText('«');
	await expect(ecartes).toContainText('1er');
	await expect(ecartes).toContainText('M.');
	expect(await ecartes.innerText()).not.toContain('..');
	await expect(page.locator('#envoiNonConjugues')).toContainText('xyzzer');

	const decrit = (await page.locator('#envoiCreeTitre').getAttribute('aria-describedby')) ?? '';
	const ids = decrit.split(/\s+/).filter(Boolean);
	expect(ids).toContain('envoiEcartes');
	expect(ids).toContain('envoiNonConjugues');
	for (const id of ids) await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);

	const e = await envoiDecode(lien);
	const formes = e.mots.map((m) => m.mot);
	expect(formes).not.toContain('1er');
	expect(formes).not.toContain('M.');
	expect(formes.filter((f) => f.includes('xyzz'))).toEqual([]);
	expect(formes).toEqual(expect.arrayContaining(['bonjour', 'alors']));
	expect(errors).toEqual([]);
});
