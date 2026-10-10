/* ============================================================
   Séance partagée (#734), critère 37 : la CHAÎNE COMPLÈTE pour chacun des dix formats
   « une question à la fois » : créer l'envoi dans l'espace encadrant, le jouer côté enfant,
   renvoyer le résultat, le lire, l'importer dans un profil.

   Ici le contenu est TIRÉ au sort par l'appli (rien n'est fabriqué à la main, contrairement
   à `partage-runners.spec.ts`). Le test ne suppose donc rien du contenu : la question 1 est
   jouée par un VRAI geste du format, dont le verdict (juste ou faux) est laissé au hasard
   et admis tel quel ; toutes les autres par « Je ne sais pas ». Le nombre de questions est
   lu dans la barre de progression, jamais supposé.

   Libellés : le nom accessible « Valider » et la case « Je ne sais pas » (`#partageJnsp`)
   sont ceux du contrat d'écran de l'issue ; le reste s'asserte sur l'exigence.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { gotoHash, watchErrors } from './helpers';
import { decoderResultat, titreLecon } from './partage-fixtures';

/** Deux profils sur l'appareil, posés seulement si absents (`addInitScript` rejoue à chaque
 *  navigation et écraserait le profil créé par l'import). */
const SEED_DEUX_PROFILS = `(() => {
  if (localStorage.getItem('ludaskia_profiles')) return;
  localStorage.setItem('ludaskia_profiles', JSON.stringify({
    list: [
      { uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'ce2' },
      { uuid: 'lea', name: 'Léa', emoji: '\\uD83D\\uDC31', updatedAt: 1, niveauReference: 'ce2' },
    ],
    active: 'e2e',
  }));
})();`;

interface Format {
	type: string;
	lecon: string;
	/** Absent : la leçon n'a pas de mode (problème). */
	mode?: string;
	niveau: 'ce2' | 'cm1';
	/** Un vrai geste sur la question affichée, sans connaître la bonne réponse. */
	geste(page: Page): Promise<void>;
}

const FORMATS: Format[] = [
	{
		type: 'qcm',
		lecon: 'fr-homophones-a',
		mode: 'qcm',
		niveau: 'ce2',
		geste: async (page) => {
			await page.locator('#lqcmChoices .sprint-choice').first().click();
		},
	},
	{
		type: 'qcmMulti',
		lecon: 'geo-cm1-figures-proprietes',
		mode: 'coche',
		niveau: 'cm1',
		geste: async (page) => {
			await page.locator('.lqcm-multi-choice').first().click();
		},
	},
	{
		type: 'tuilesNombre',
		lecon: 'num-comparer',
		mode: 'tuiles',
		niveau: 'ce2',
		geste: async (page) => {
			await page.locator('.ltui-tuile').first().click();
		},
	},
	{
		type: 'tuilesOrdre',
		lecon: 'num-ranger',
		mode: 'tuiles',
		niveau: 'ce2',
		geste: async (page) => {
			const tuiles = page.locator('.lord-tuile');
			await tuiles.first().waitFor();
			const valeurs = await tuiles.evaluateAll((els) =>
				els.map((e) => e.getAttribute('data-val') ?? ''),
			);
			// Rangée complète exigée : toutes les tuiles, dans l'ordre où elles sont données.
			for (const v of valeurs) await page.locator(`.lord-tuile[data-val="${v}"]`).click();
		},
	},
	{
		type: 'tuilesTri',
		lecon: 'fr-vocab-champs-tri',
		mode: 'tri',
		niveau: 'ce2',
		geste: async (page) => {
			await page.locator('.ltri-tuile').first().waitFor();
			while ((await page.locator('.ltri-tuile').count()) > 0) {
				await page.locator('.ltri-tuile').first().click();
				await page.locator('.ltri-col').first().locator('.ltri-col-titre').click();
			}
		},
	},
	{
		type: 'tableauConversion',
		lecon: 'mes-longueurs',
		mode: 'tableau',
		niveau: 'ce2',
		geste: async (page) => {
			await page.locator('#tcTable').waitFor();
			const n = await page.locator('.tc-cell').count();
			for (let k = 0; k < n; k++) {
				const bon =
					(await page.locator(`.tc-cell[data-i="${k}"]`).getAttribute('data-answer')) ?? '0';
				await page.locator(`.tc-pave-btn[data-chiffre="${bon}"]`).click();
			}
		},
	},
	{
		type: 'appariement',
		lecon: 'fr-vocab-familles-relier',
		mode: 'relier',
		niveau: 'ce2',
		geste: async (page) => {
			await page.locator('.lapp-mot').first().waitFor();
			const gauche = page.locator('.lapp-mot[data-side="g"]');
			const droite = page.locator('.lapp-mot[data-side="d"]');
			const n = await gauche.count();
			for (let i = 0; i < n; i++) {
				await gauche.nth(i).click();
				await droite.nth(i).click();
			}
		},
	},
	{
		type: 'probleme',
		lecon: 'math-prob-composition',
		niveau: 'ce2',
		geste: async (page) => {
			const champs = page.locator('.prob-input');
			await champs.first().waitFor();
			const n = await champs.count();
			for (let i = 0; i < n; i++) await champs.nth(i).fill('1');
		},
	},
	{
		type: 'clicMot',
		lecon: 'fr-gram-clic-verbe',
		mode: 'clic',
		niveau: 'ce2',
		geste: async (page) => {
			await page.locator('.lclic-mot').first().click();
		},
	},
	{
		type: 'droiteGraduee',
		lecon: 'num-droite-entiers',
		mode: 'placer',
		niveau: 'ce2',
		geste: async (page) => {
			await page.locator('.dg-hit').first().click();
		},
	},
];

/* ---------- Aides ---------- */

const lire = <T>(page: Page, cle: string): Promise<T | null> =>
	page.evaluate((k) => {
		const v = localStorage.getItem(k);
		return v === null ? null : JSON.parse(v);
	}, cle);

const valider = (page: Page) => page.locator('[data-partage-valider]');
const progression = (page: Page) => page.locator('.lqcm-progress-lab');
const hashDe = (lien: string) => new URL(lien).hash.slice(1);

/** Crée l'envoi par l'interface : leçon, niveau, mode, libellé. Un mode que l'onglet ne
 *  propose pas fait échouer `selectOption` : c'est ce qui rend le test falsifiable. */
async function creerEnvoi(page: Page, f: Format, mode = f.mode): Promise<string> {
	await gotoHash(page, 'encadrant/envois');
	await expect(page.locator('.enc-tab[data-tab="envois"]')).toBeVisible();
	await page.locator('button[data-act="envoi-source"][data-source="lecon"]').click();
	// Le sélecteur ne montre par défaut que la classe du profil (CE2) : pour une leçon d'une
	// autre classe, on prend son jeton (absent quand il ferait doublon avec « Sa classe »).
	const recherche = page.getByPlaceholder(/Rechercher une leçon/i);
	await expect(recherche).toBeVisible();
	const jeton = page.locator(`[data-act="sel-niveau"][data-niveau="${f.niveau}"]`);
	if (await jeton.count()) await jeton.click();
	await recherche.fill(titreLecon(f.lecon));
	await page.locator(`button[data-act="envoi-lecon"][data-lesson="${f.lecon}"]`).first().click();
	await expect(page.locator('#envoiLeconChoisie')).toContainText(titreLecon(f.lecon));
	const niveau = page.locator('select#envoiNiveau');
	if (await niveau.count()) await niveau.selectOption(f.niveau);
	if (mode) {
		// Plusieurs modes : le sélecteur existe et doit proposer celui du format.
		// Un seul mode : pas de sélecteur, le mode par défaut est le bon.
		const choixMode = page.locator('select#envoiMode');
		if (await choixMode.count()) await choixMode.selectOption(mode, { timeout: 3000 });
	}
	await page.locator('input#envoiLibelle').fill(`Chaîne ${f.type}`);
	await page.locator('button#envoiCreer').click();
	await expect(page.locator('#envoiCree')).toBeVisible();
	return page.locator('input#envoiLien').inputValue();
}

/** Joue toutes les questions : la 1re par un vrai geste, les autres « Je ne sais pas ».
 *  Renvoie le nombre de questions jouées. */
async function jouerTout(page: Page, f: Format): Promise<number> {
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await page.locator('#partageCommencer').click();
	await expect(valider(page)).toBeVisible();
	const m = ((await progression(page).textContent()) ?? '').match(/(\d+)\s*\/\s*(\d+)/);
	expect(m, 'la barre de progression dit « k / n »').not.toBeNull();
	const total = Number(m![2]);
	expect(total).toBeGreaterThan(0);

	for (let k = 1; k <= total; k++) {
		await expect(progression(page)).toContainText(new RegExp(`\\b${k}\\s*/\\s*${total}\\b`));
		if (k === 1) await f.geste(page);
		else await page.locator('#partageJnsp').check();
		await expect(valider(page)).toBeEnabled();
		await valider(page).click();
	}
	await expect(page.locator('#partageFin')).toBeVisible();
	return total;
}

/* ---------- La chaîne, pour chaque format ---------- */

FORMATS.forEach((f, rang) => {
	test(`37 · chaîne ${f.type} : créer, jouer, lire le résultat, l’importer dans un profil`, async ({
		page,
	}) => {
		test.slow();
		const errors = watchErrors(page);
		await page.addInitScript(SEED_DEUX_PROFILS);
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

		const lienEnvoi = await creerEnvoi(page, f);
		await gotoHash(page, hashDe(lienEnvoi));
		const total = await jouerTout(page, f);

		await page.locator('#partagePseudo').fill('Zoé');
		let lienRes = '';
		await expect
			.poll(async () => {
				lienRes = await page.locator('#partageLien').inputValue();
				const code = lienRes.slice(lienRes.indexOf('#resultat/') + '#resultat/'.length);
				const r = await decoderResultat(code);
				return r.ok ? r.valeur.pseudo : '';
			})
			.toBe('Zoé');
		const code = lienRes.slice(lienRes.indexOf('#resultat/') + '#resultat/'.length);
		const decode = await decoderResultat(code);
		if (!decode.ok) throw new Error(`résultat non décodable : ${decode.raison}`);
		const statuts = decode.valeur.reponses.map((r) => r.statut);
		expect(statuts).toHaveLength(total);
		// Le geste de la question 1 est juste ou faux selon le tirage : les deux sont admis,
		// « je ne sais pas » ne l'est pas (une réponse posée n'est pas un aveu d'ignorance).
		expect(['juste', 'faux']).toContain(statuts[0]);
		for (const s of statuts.slice(1)) expect(s).toBe('jnsp');

		// Lecture : autant d'items que de questions, avec les mêmes statuts.
		await gotoHash(page, hashDe(lienRes));
		await expect(page.locator('#resultatTitre')).toContainText('Zoé');
		const items = page.locator('li.resultat-item');
		await expect(items).toHaveCount(total);
		for (let i = 0; i < total; i++) {
			await expect(items.nth(i)).toHaveAttribute('data-statut', statuts[i]);
		}

		// Import : profil existant (rang impair) ou nouveau (rang pair).
		await page.locator('button#resultatImporter').click();
		const existant = rang % 2 === 1;
		await page
			.locator(`input[name="resultatCible"][value="${existant ? 'lea' : 'nouveau'}"]`)
			.check();
		await page.locator('button#resultatConfirmer').click();
		await expect(page.locator('a#resultatVoirSuivi')).toBeVisible();

		let uuid = 'lea';
		if (!existant) {
			const profils = await lire<{ list: { uuid: string; name: string }[] }>(
				page,
				'ludaskia_profiles',
			);
			const zoe = profils!.list.find((p) => p.name === 'Zoé');
			expect(zoe).toBeDefined();
			uuid = zoe!.uuid;
		}
		const journal = (await lire<{ sansTentative?: true; lessonId: string }[]>(
			page,
			`${uuid}/ludaskia_erreurs`,
		))!;
		expect(journal.length).toBeGreaterThan(0);
		expect(journal.some((e) => e.lessonId === f.lecon)).toBe(true);
		// Au moins une question « je ne sais pas » (total >= 2) : entrée « n'a pas essayé ».
		if (total >= 2) expect(journal.some((e) => e.sansTentative)).toBe(true);

		await page.locator('a#resultatVoirSuivi').click();
		await expect(page.locator('.enc-err-lecon').first()).toBeVisible();
		expect(errors).toEqual([]);
	});
});
