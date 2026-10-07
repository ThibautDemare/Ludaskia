/* ============================================================
   Séance partagée (#734), côté ENFANT : fiche (`nature: 'lecon'`) et bilan.

   Spec écrite AVANT l'implémentation : elle est ROUGE tant que les écrans
   `#envoi/<code>` n'existent pas. Les titres portent le numéro du critère de
   l'issue, pour qu'un échec dise ce qui n'est pas tenu.

   Les liens sont fabriqués par `partage-fixtures.ts` avec le vrai encodeur ; le
   résultat renvoyé par l'écran est relu avec le vrai décodeur. Le tirage ne joue
   aucun rôle : les exercices sont écrits à la main, et la bonne réponse d'un champ
   se lit dans son `data-answer`.

   Libellés : les chaînes citées (« Ce lien ne marche pas. », « Je ne sais pas »,
   « Oui, arrêter »…) sont celles du contrat d'écran de l'issue, validées avec le
   mainteneur ; ce sont elles l'objet du test là où elles sont citées.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { gotoHash, watchErrors } from './helpers';
import {
	alterer,
	codeDe,
	decoderResultat,
	envoiBilan,
	envoiBilanDe,
	envoiFicheDe,
	envoiFiche,
	EXERCICES_FICHE,
	LECON_A,
	LECON_B,
	LIBELLE_BILAN,
	LIBELLE_FICHE,
	titreLecon,
	type Alteration,
} from './partage-fixtures';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

type Plan = 'juste' | 'faux' | 'jnsp' | 'vide';

/* ---------- Aides ---------- */

const ouvrir = (page: Page, code: string) => gotoHash(page, `envoi/${code}`);

async function commencer(page: Page) {
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await page.locator('#partageCommencer').click();
	await expect(page.locator('.partage-item').first()).toBeVisible();
}

/** Joue chaque item selon son plan (ordre du DOM = ordre de l'envoi). */
async function repondre(page: Page, plan: Plan[]) {
	const items = page.locator('.partage-item');
	await expect(items).toHaveCount(plan.length);
	for (let i = 0; i < plan.length; i++) {
		const it = items.nth(i);
		if (plan[i] === 'juste') {
			const attendu = await it.locator('input.ans').getAttribute('data-answer');
			// Espaces superflus : la normalisation est celle du jeu libre (critère 11).
			await it.locator('input.ans').fill(`  ${attendu}  `);
		} else if (plan[i] === 'faux') {
			await it.locator('input.ans').fill('zzz');
		} else if (plan[i] === 'jnsp') {
			await it.locator('.partage-jnsp input[type=checkbox]').check();
		}
	}
}

/** Accueil → séance → fin du premier passage, jusqu'à `#partageFin`. */
async function premierPassage(page: Page, code: string, plan: Plan[]) {
	await ouvrir(page, code);
	await commencer(page);
	await repondre(page, plan);
	await page.locator('#partageFini').click();
	await expect(page.locator('#partageFin')).toBeVisible();
}

async function codeResultat(page: Page): Promise<string> {
	const lien = await page.locator('#partageLien').inputValue();
	expect(lien).toContain('#resultat/');
	return lien.slice(lien.indexOf('#resultat/') + '#resultat/'.length);
}

async function resultatAffiche(page: Page) {
	const r = await decoderResultat(await codeResultat(page));
	if (!r.ok) throw new Error(`résultat non décodable : ${r.raison}`);
	return r.valeur;
}

const stockage = (page: Page) =>
	page.evaluate(() =>
		Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
	);

const xp = async (page: Page): Promise<number> =>
	JSON.parse((await page.evaluate(() => localStorage.getItem('e2e/ludaskia_xp'))) ?? '0');

const PLAN_MIXTE: Plan[] = ['juste', 'faux', 'jnsp', 'juste', 'vide'];

/* ---------- Lien refusé (29) ---------- */

for (const quoi of ['caractere', 'tronque', 'version', 'controle'] as Alteration[]) {
	test(`29 · lien altéré (${quoi}) : refusé, aucun item affiché, aucune erreur JS`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		const code = alterer(await codeDe(envoiFiche()), quoi);
		await ouvrir(page, code);

		await expect(page.locator('#partageRefus')).toBeVisible();
		await expect(page.locator('#partageRefus')).toContainText('Ce lien ne marche pas.');
		await expect(page.locator('#partageRefus details')).toHaveCount(1); // « Pour l'adulte »
		await expect(page.locator('#partageRetour')).toBeVisible();
		await expect(page.locator('.partage-item')).toHaveCount(0);
		await expect(page.locator('#partageAccueil')).toHaveCount(0);

		await page.locator('#partageRetour').click();
		await expect(page.locator('.home-grid')).toBeVisible();
		expect(errors).toEqual([]);
	});
}

/* ---------- Accueil, repère, pas de chrono (6, 7, 8, 9, 10, 34) ---------- */

test('6, 7, 8, 9 · accueil avant la séance, repère, pas de chrono, « Je ne sais pas » partout', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page, await codeDe(envoiFiche()));

	// 6 : l'accueil précède la séance, et attribue le contenu à l'expéditeur.
	const accueil = page.locator('#partageAccueil');
	await expect(accueil).toBeVisible();
	await expect(accueil).toContainText(LIBELLE_FICHE);
	await expect(accueil).toContainText("La personne qui t'a envoyé cet exercice verra tes réponses");
	await expect(page.locator('.partage-item')).toHaveCount(0);
	// 34 : ni date limite ni compteur, ni rappel.
	await expect(accueil).not.toContainText(/date limite|échéance|avant le|plus que|reste \d/i);

	await page.locator('#partageCommencer').click();

	// 7 : repère visible pendant la séance.
	await expect(page.locator('#partageRepere')).toBeVisible();
	await expect(page.locator('#partageRepere')).toContainText('Exercice envoyé');
	await expect(page.locator('#partageRepere')).toContainText(LIBELLE_FICHE);
	// 8 : pas de chrono ; pas de bouton « Vérifier » (la correction attend la fin).
	await expect(page.locator('#chrono')).not.toBeVisible(); // présent dans la barre d'outils, masqué hors chrono
	await expect(page.locator('#btnVerify')).not.toBeVisible();

	// 9 : chaque item propose « Je ne sais pas ».
	const items = page.locator('.partage-item');
	await expect(items).toHaveCount(EXERCICES_FICHE.length);
	for (let i = 0; i < EXERCICES_FICHE.length; i++) {
		const it = items.nth(i);
		await expect(it.locator('input.ans')).toHaveAttribute('data-answer', /.+/);
		await expect(it.locator('.partage-jnsp')).toContainText('Je ne sais pas');
		await expect(it.locator('.partage-jnsp input[type=checkbox]')).toBeVisible();
	}
	expect(errors).toEqual([]);
});

test('9 · cocher « Je ne sais pas » vide le champ, taper décoche, décocher restitue la saisie', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page, await codeDe(envoiFiche()));
	await commencer(page);

	const it = page.locator('.partage-item').first();
	const champ = it.locator('input.ans');
	const case_ = it.locator('.partage-jnsp input[type=checkbox]');

	await champ.fill('abc');
	await case_.check();
	await expect(champ).toHaveValue('');
	await case_.uncheck();
	await expect(champ).toHaveValue('abc');

	await case_.check();
	await champ.fill('x');
	await expect(case_).not.toBeChecked();
	expect(errors).toEqual([]);
});

test('10 · une préférence d’accessibilité du profil (confort de lecture) s’applique en séance', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'profils');
	await page.locator('#prefConfort').click();
	await expect(page.locator('html')).toHaveClass(/confort-lecture/);
	// Rechargement : la classe doit être reposée depuis le stockage, pas héritée de la page.
	await page.reload({ waitUntil: 'networkidle' });
	await ouvrir(page, await codeDe(envoiFiche()));
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await expect(page.locator('html')).toHaveClass(/confort-lecture/);
	expect(errors).toEqual([]);
});

/* ---------- Seuil (23) ---------- */

test('23 · sous le seuil de 60 % : message, rien n’est figé, la fiche reste sans correction', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const code = await codeDe(envoiFiche());
	await ouvrir(page, code);
	await commencer(page);
	const avant = await xp(page);

	await repondre(page, ['juste', 'jnsp', 'vide', 'vide', 'vide']); // 2 sur 5 = 40 %
	await page.locator('#partageFini').click();

	await expect(page.locator('#partageSeuil')).toBeVisible();
	// Le focus mène à la première question sans réponse (index 2).
	await expect(page.locator('.partage-item').nth(2).locator('input.ans')).toBeFocused();
	await expect(page.locator('.partage-item')).toHaveCount(EXERCICES_FICHE.length);
	await expect(
		page.locator(
			'.mark.correct:visible, .mark.wrong:visible, input.ans.correct:visible, input.ans.wrong:visible',
		),
	).toHaveCount(0);
	await expect(page.locator('#partageFin')).toHaveCount(0);
	expect(await xp(page)).toBe(avant);

	// Compléter fait passer le seuil : le passage n'avait donc rien consommé.
	await repondre(page, ['juste', 'jnsp', 'juste', 'juste', 'vide']);
	await page.locator('#partageFini').click();
	await expect(page.locator('#partageFin')).toBeVisible();
	expect(errors).toEqual([]);
});

/* ---------- Parcours complet : résultat, XP, journal, stockage, réseau ---------- */

test('11, 13, 14, 17, 23, 24, 25, 26, 28, 32 · premier passage : fin, résultat décodé, XP, journal, stockage, réseau', async ({
	page,
	baseURL,
}) => {
	const errors = watchErrors(page);
	const sortants: string[] = [];
	const origine = new URL(baseURL ?? 'http://localhost:4173').origin;
	page.on('request', (r) => {
		const type = r.resourceType();
		const u = new URL(r.url());
		const externe = !['data:', 'blob:'].includes(u.protocol) && u.origin !== origine;
		// Seule exception : le GET de `foret-pied.svg`, décor de l'accueil chargé au démarrage
		// (SVG servi par le site lui-même). Aucune extension générique, `.json` compris.
		const decor = r.method() === 'GET' && !u.search && u.pathname.endsWith('/foret-pied.svg');
		if (((type === 'fetch' || type === 'xhr') && !decor) || externe)
			sortants.push(`${type} ${r.method()} ${r.url()}`);
	});

	const envoi = envoiFiche();
	const code = await codeDe(envoi);
	await ouvrir(page, code);
	await expect(page.locator('#partageAccueil')).toBeVisible();
	// 32 : rien de l'énoncé ni des réponses n'est lisible dans l'URL.
	const url = page.url().toLowerCase();
	for (const mot of ['chante', 'danse', 'mange', 'jouons', 'rient', 'jouer', 'chanter']) {
		expect(url).not.toContain(mot);
	}

	const avant = await stockage(page);
	const xpAvant = await xp(page);
	await commencer(page);
	await repondre(page, PLAN_MIXTE);
	// 17 : aucune correction avant que le résultat soit figé.
	await expect(
		page.locator(
			'.mark.correct:visible, .mark.wrong:visible, input.ans.correct:visible, input.ans.wrong:visible',
		),
	).toHaveCount(0);
	await page.locator('#partageFini').click();

	// 13 : l'écran de fin.
	await expect(page.locator('#partageFin')).toBeVisible();
	await expect(page.locator('#partageFin')).not.toBeEmpty();
	await expect(
		page.locator(
			'.mark.correct:visible, .mark.wrong:visible, input.ans.correct:visible, input.ans.wrong:visible',
		),
	).toHaveCount(0); // toujours pas de correction
	await expect(page.locator('#partagePseudo')).toHaveValue('E2E');
	await expect(page.locator('#partageLien')).toHaveJSProperty('readOnly', true);
	await expect(page.locator('#partageCopier')).toBeEnabled();
	await expect(page.locator('#partageFinEntrainement')).toHaveCount(0);

	// 14 : contenu du résultat, relu avec le vrai décodeur.
	const r = await resultatAffiche(page);
	expect(r.envoi).toEqual({ id: envoi.id, libelle: LIBELLE_FICHE, niveau: 'ce2' });
	expect(r.pseudo).toBe('E2E');
	expect(r.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
	expect(r.id).not.toBe(envoi.id);
	expect(Math.abs(Date.now() - r.date)).toBeLessThan(10 * 60 * 1000);
	expect(r.reponses.map((x) => x.statut)).toEqual(PLAN_MIXTE);
	r.reponses.forEach((x, i) => {
		expect(x.lecon).toBe(LECON_A);
		expect(x.enonce).toContain(['chanter', 'danser', 'manger', 'jouer', 'rire'][i]);
		expect(x.attendue).toContain(EXERCICES_FICHE[i].answer);
	});
	expect(r.reponses[0].saisie.trim()).toBe('chante'); // 11 : acceptée malgré les espaces
	expect(r.reponses[1].saisie).toBe('zzz');
	expect(r.reponses[2].saisie).toBe(''); // jnsp : pas de saisie, et pas « faux »
	expect(r.reponses[4].saisie).toBe(''); // vide : distinct de jnsp
	expect(r.reponses[2].statut).not.toBe(r.reponses[4].statut);

	// 17 : la correction n'apparaît qu'à la demande, une fois le résultat figé.
	await page.locator('#partageVoirCorrection').click();
	await expect(page.locator('.mark.correct')).toHaveCount(2);
	await expect(page.locator('.mark.wrong').first()).toBeVisible();

	// 23, 24, 26 : +5 XP exactement, aucune modale, et seuls XP / activité / journal / passage bougent.
	await expect(page.locator('.modal:visible')).toHaveCount(0);
	expect(await xp(page)).toBe(xpAvant + 5);
	const apres = await stockage(page);
	const changees = Object.keys({ ...avant, ...apres }).filter((k) => avant[k] !== apres[k]);
	const toleres = new Set([
		'e2e/ludaskia_xp',
		'e2e/ludaskia_activity',
		'e2e/ludaskia_erreurs',
		'e2e/ludaskia_partagesRecus',
		// Méta du profil : seul `updatedAt` peut bouger (horodatage d'écriture), jamais le reste.
		'ludaskia_profiles',
	]);
	expect(changees.filter((k) => !toleres.has(k))).toEqual([]);
	if (changees.includes('ludaskia_profiles')) {
		const sansDate = (s: string | null | undefined) =>
			JSON.stringify(JSON.parse(s ?? 'null'), (k, v) => (k === 'updatedAt' ? undefined : v));
		expect(sansDate(apres['ludaskia_profiles'])).toBe(sansDate(avant['ludaskia_profiles']));
	}
	expect(changees).toContain('e2e/ludaskia_partagesRecus');
	// 24 : une entrée d'activité de plus, sans score.
	const act = (s: string | null | undefined): Record<string, unknown>[] => JSON.parse(s ?? '[]');
	const nouvelles = act(apres['e2e/ludaskia_activity']).slice(
		act(avant['e2e/ludaskia_activity']).length,
	);
	expect(nouvelles).toHaveLength(1);
	expect(Object.keys(nouvelles[0]).filter((k) => /score|note|pct|pourcent/i.test(k))).toEqual([]);

	// 25 : l'erreur commise est au journal, en mode « partage ».
	const journal = JSON.parse(apres['e2e/ludaskia_erreurs'] ?? '[]') as {
		mode: string;
		donnee: string;
	}[];
	expect(journal.some((e) => e.mode === 'partage' && e.donnee === 'zzz')).toBe(true);

	// 28 : aucune requête fetch / xhr, aucune origine étrangère.
	expect(sortants).toEqual([]);
	expect(errors).toEqual([]);
});

/* ---------- Écran de fin : pseudo, copie, partage (13) ---------- */

test('13 · pseudo : le lien se régénère, un pseudo invalide bloque « Copier », la copie est confirmée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await premierPassage(page, await codeDe(envoiFiche()), PLAN_MIXTE);

	const lienInitial = await page.locator('#partageLien').inputValue();
	await page.locator('#partagePseudo').fill('Léa 2');
	await expect.poll(() => page.locator('#partageLien').inputValue()).not.toBe(lienInitial);
	expect((await resultatAffiche(page)).pseudo).toBe('Léa 2');

	await page.locator('#partagePseudo').fill('<b>');
	await expect(page.locator('#partageCopier')).toBeDisabled();
	await page.locator('#partagePseudo').fill('Léa');
	await expect(page.locator('#partageCopier')).toBeEnabled();

	await page.locator('#partageCopier').click();
	await expect(page.locator('#partageCopie')).toContainText('Lien copié');
	const presse = await page.evaluate(() => navigator.clipboard.readText());
	expect(presse).toBe(await page.locator('#partageLien').inputValue());
	expect(errors).toEqual([]);
});

test('13 · « Partager » n’existe que si le navigateur sait partager', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
	});
	await premierPassage(page, await codeDe(envoiFiche()), PLAN_MIXTE);
	await expect(page.locator('#partagePartager')).toHaveCount(0);

	const autre = await page.context().newPage();
	await autre.addInitScript(() => {
		Object.defineProperty(navigator, 'share', {
			value: () => Promise.resolve(),
			configurable: true,
		});
	});
	await premierPassage(autre, await codeDe(envoiFiche()), PLAN_MIXTE);
	await expect(autre.locator('#partagePartager')).toBeVisible();
});

/* ---------- Réouverture : recopier / s'entraîner (15) ---------- */

test('15 · rouvrir le lien : recopier rend le MÊME résultat, l’entraînement n’envoie rien et ne rapporte pas d’XP', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const code = await codeDe(envoiFiche());
	await premierPassage(page, code, PLAN_MIXTE);
	const premier = await resultatAffiche(page);
	const xpApres = await xp(page);

	await ouvrir(page, code);
	await expect(page.locator('#partageDejaFait')).toBeVisible();
	await expect(page.locator('#partageDejaFait')).toContainText('Tu as déjà fait cet exercice.');
	// L'exigence est « rien n'est envoyé », pas le choix de l'apostrophe.
	await expect(page.locator('#partageDejaFait')).toContainText(/Rien n.est envoyé/);
	await expect(page.locator('#partageAccueil')).toHaveCount(0);

	await page.locator('#partageRecopier').click();
	const recopie = await resultatAffiche(page);
	expect(recopie.id).toBe(premier.id);
	expect(recopie.reponses).toEqual(premier.reponses);

	await ouvrir(page, code);
	await page.locator('#partageEntrainer').click();
	await expect(page.locator('#partageRepere')).toContainText('Entraînement');
	await expect(page.locator('#partageRepere')).toContainText(/rien n.est envoyé/);
	await repondre(page, PLAN_MIXTE);
	await page.locator('#partageFini').click();

	await expect(page.locator('#partageFinEntrainement')).toBeVisible();
	await expect(page.locator('#partageLien')).toHaveCount(0);
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	expect(await xp(page)).toBe(xpApres);
	await expect(page.locator('.modal:visible')).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* ---------- Abandon (16) ---------- */

test('16 · quitter en cours demande confirmation et ne consomme pas le premier passage', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const code = await codeDe(envoiFiche());
	await ouvrir(page, code);
	await commencer(page);
	await repondre(page, ['juste', 'juste', 'juste', 'vide', 'vide']);

	await page.evaluate(() => document.getElementById('btnHome')?.click());
	await expect(page.getByText('Tu veux arrêter ?')).toBeVisible();
	await page.getByRole('button', { name: 'Oui, arrêter' }).click();
	await expect(page.locator('.home-grid')).toBeVisible();

	await ouvrir(page, code);
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await expect(page.locator('#partageDejaFait')).toHaveCount(0);
	expect(await xp(page)).toBe(0);
	expect(errors).toEqual([]);
});

/* ---------- Texte forgé (30) et discrétion (34) ---------- */

test('30 · un énoncé forgé s’affiche comme du texte, aucun élément injecté', async ({ page }) => {
	const errors = watchErrors(page);
	const forge = '<img src=x onerror="window.__xss=1"> je @ (chanter)';
	const code = await codeDe(
		envoiFiche({ exercices: [{ type: 'text', question: forge, answer: 'chante' }] }),
	);
	await ouvrir(page, code);
	await commencer(page);

	await expect(page.locator('.partage-item')).toContainText('<img src=x');
	await expect(page.locator('.partage-item img')).toHaveCount(0);
	await expect(page.locator('img[src="x"]')).toHaveCount(0);
	expect(
		await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
	).toBeUndefined();
	expect(errors).toEqual([]);
});

test('34 · après un passage, rien sur l’accueil de l’enfant ne rappelle l’envoi', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await premierPassage(page, await codeDe(envoiFiche()), PLAN_MIXTE);
	await gotoHash(page, 'accueil');
	await expect(page.locator('.home-grid')).toBeVisible();
	await expect(page.locator('body')).not.toContainText(LIBELLE_FICHE);
	await expect(page.locator('body')).not.toContainText(/exercice envoyé/i);
	await expect(page.locator('[id^="partage"]:visible')).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* ---------- Bilan ---------- */

test('6, 9, 14 · bilan à deux leçons : titres de bloc, « Je ne sais pas » par item, toutes les réponses', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const envoi = envoiBilan();
	await ouvrir(page, await codeDe(envoi));
	await expect(page.locator('#partageAccueil')).toContainText(LIBELLE_BILAN);
	await commencer(page);

	// Les deux leçons sont titrées : l'enfant sait quel exercice relève de quelle notion.
	await expect(page.locator('#partageRepere')).toContainText(LIBELLE_BILAN);
	await expect(page.locator('body')).toContainText(titreLecon(LECON_A));
	await expect(page.locator('body')).toContainText(titreLecon(LECON_B));
	await expect(page.locator('#chrono')).not.toBeVisible(); // présent dans la barre d'outils, masqué hors chrono

	const items = page.locator('.partage-item');
	await expect(items).toHaveCount(4);
	for (let i = 0; i < 4; i++) {
		await expect(items.nth(i).locator('.partage-jnsp input[type=checkbox]')).toBeVisible();
	}

	await repondre(page, ['juste', 'faux', 'jnsp', 'juste']);
	await page.locator('#partageFini').click();
	await expect(page.locator('#partageFin')).toBeVisible();

	const r = await resultatAffiche(page);
	expect(r.envoi.id).toBe(envoi.id);
	expect(r.envoi.libelle).toBe(LIBELLE_BILAN);
	expect(r.reponses.map((x) => x.lecon)).toEqual([LECON_A, LECON_A, LECON_B, LECON_B]);
	expect(r.reponses.map((x) => x.statut)).toEqual(['juste', 'faux', 'jnsp', 'juste']);
	expect(errors).toEqual([]);
});

/* ---------- Chemins neufs de l'écran ---------- */

const qcm = (question: string, answer: string) => ({
	type: 'qcm' as const,
	question,
	answer,
	choices: ['3', '4', '5'],
});

const radio = (page: Page, i: number, valeur: string) =>
	page
		.locator('.partage-item')
		.nth(i)
		.locator('label.partage-choix-opt', { has: page.locator(`input[value="${valeur}"]`) });

test('9, 11, 14, 17 · QCM dans un bilan : radios, « Je ne sais pas » exclusif, résultat, correction décrite', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const code = await codeDe(
		envoiBilanDe([
			{
				lecon: 'num-frac-sens',
				exercices: [
					qcm('Combien font 2 + 2 ?', '4'),
					qcm('Combien font 1 + 2 ?', '3'),
					qcm('Combien font 3 + 2 ?', '5'),
					qcm('Combien font 2 + 3 ?', '5'),
				],
			},
		]),
	);
	await ouvrir(page, code);
	await commencer(page);
	const items = page.locator('.partage-item');
	await expect(items).toHaveCount(4);
	for (let i = 0; i < 4; i++) {
		await expect(items.nth(i).locator('fieldset.partage-choix input[type=radio]')).toHaveCount(3);
		await expect(items.nth(i).locator('input.ans[type=hidden]')).toHaveCount(1);
	}

	// Choix, puis « Je ne sais pas » (le radio se décoche), puis re-choix (la case se décoche).
	const cache = items.nth(2).locator('input.ans[type=hidden]');
	const jnsp = items.nth(2).locator('.partage-jnsp input[type=checkbox]');
	await radio(page, 2, '4').click();
	await expect(cache).toHaveValue('4');
	await jnsp.check();
	await expect(items.nth(2).locator('input[type=radio]:checked')).toHaveCount(0);
	await expect(cache).toHaveValue('');
	await radio(page, 2, '4').click();
	await expect(jnsp).not.toBeChecked();
	await jnsp.check();

	await radio(page, 0, '4').click(); // juste
	await radio(page, 1, '5').click(); // faux (attendu 3)
	await radio(page, 3, '5').click(); // juste
	await page.locator('#partageFini').click();
	await expect(page.locator('#partageFin')).toBeVisible();

	const r = await resultatAffiche(page);
	expect(r.reponses.map((x) => x.statut)).toEqual(['juste', 'faux', 'jnsp', 'juste']);
	expect(r.reponses[0].saisie).toBe('4');
	expect(r.reponses[1].saisie).toBe('5');
	expect(r.reponses[2].saisie).toBe('');

	await page.locator('#partageVoirCorrection').click();
	// La question fausse est décrite pour un lecteur d'écran : le groupe pointe une marque non vide.
	const groupe = items.nth(1).locator('fieldset.partage-choix');
	const cible = await groupe.getAttribute('aria-describedby');
	expect(cible).toBeTruthy();
	await expect(page.locator(`[id="${cible}"]`)).not.toBeEmpty();
	// Après la fin : radios et cases sont aria-disabled et ne changent plus au clic.
	await expect(items.nth(0).locator('input[type=radio]').first()).toHaveAttribute(
		'aria-disabled',
		'true',
	);
	await expect(items.nth(0).locator('.partage-jnsp input')).toHaveAttribute(
		'aria-disabled',
		'true',
	);
	await radio(page, 0, '3').click({ force: true });
	await expect(items.nth(0).locator('input[type=radio][value="4"]')).toBeChecked();
	expect(errors).toEqual([]);
});

test('14 · opération posée : tous les chiffres justes → juste, un chiffre vide → faux « (incomplet) »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const posee = (a: number, b: number) => ({ type: 'posed' as const, op: '+' as const, a, b });
	const code = await codeDe(
		envoiFicheDe('calc-addition-posee', [posee(123, 456), posee(234, 145), posee(111, 222)]),
	);
	await ouvrir(page, code);
	await commencer(page);
	const items = page.locator('.partage-item');
	await expect(items).toHaveCount(3);

	const chiffres = (i: number) => items.nth(i).locator('input.ans[data-answer]');
	for (const i of [0, 1, 2]) {
		const champs = chiffres(i);
		const n = await champs.count();
		expect(n).toBeGreaterThan(1);
		// Item 1 : le dernier chiffre reste vide, tous les autres sont justes.
		for (let k = 0; k < (i === 1 ? n - 1 : n); k++) {
			await champs.nth(k).fill((await champs.nth(k).getAttribute('data-answer')) ?? '');
		}
	}
	await page.locator('#partageFini').click();
	await expect(page.locator('#partageFin')).toBeVisible();

	const r = await resultatAffiche(page);
	expect(r.reponses.map((x) => x.statut)).toEqual(['juste', 'faux', 'juste']);
	expect(r.reponses[1].saisie).toContain('(incomplet)');
	expect(errors).toEqual([]);
});

test('Entrée sur le dernier champ : le focus va à « J’ai fini », rien n’est figé', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrir(page, await codeDe(envoiFiche()));
	await commencer(page);
	await expect(page.locator('#partageRepere')).toBeFocused();

	const dernier = page.locator('.partage-item').last().locator('input.ans');
	await dernier.fill('x');
	await dernier.press('Enter');
	await expect(page.locator('#partageFini')).toBeFocused();
	await expect(page.locator('#partageFin')).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem('e2e/ludaskia_partagesRecus'))).toBeNull();
	expect(errors).toEqual([]);
});

test('9, 17 · « Je ne sais pas » révèle la réponse sans croix, le focus va à la correction', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await premierPassage(page, await codeDe(envoiFiche()), PLAN_MIXTE);
	await page.locator('#partageVoirCorrection').click();
	await expect(page.locator('#partageCorrection')).toBeFocused();

	const cochee = page.locator('.partage-item').nth(2); // « il @ (manger) » : cochée jnsp
	await expect(cochee.locator('.mark.revelee')).toContainText('mange');
	await expect(cochee.locator('.mark.wrong')).toHaveCount(0);
	expect(errors).toEqual([]);
});
