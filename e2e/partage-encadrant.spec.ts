/* ============================================================
   Séance partagée (#734), côté ENCADRANT : composer un envoi, lire un
   résultat, l'importer dans un profil (PR 3).

   Spec écrite AVANT l'implémentation : elle est ROUGE tant que l'onglet
   « Envois » et la vue `#resultat/<code>` n'existent pas. Chaque titre porte le
   numéro du critère de l'issue, pour qu'un échec dise ce qui n'est pas tenu.

   Les résultats lus sont fabriqués avec le vrai encodeur (`partage-fixtures.ts`).
   Le tirage ne joue aucun rôle dans les tests déterministes ; les deux parcours
   complets (fiche, bilan) ne dépendent pas du contenu tiré : « Je ne sais pas »
   partout, sauf une question laissée fausse quand un champ texte existe.

   Libellés : les chaînes citées (« Ce lien de résultat ne s'ouvre pas. »,
   « Juste », « Faux »…) sont celles du contrat d'écran de l'issue, validées avec le
   mainteneur ; ce sont elles l'objet du test là où elles sont citées.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { gotoHash, watchErrors } from './helpers';
import {
	alterer,
	codeDe,
	codeResultatDe,
	decoderResultat,
	envoiFiche,
	LECON_A,
	LIBELLE_FICHE,
	resultatDe,
	encoderResultat,
	titreLecon,
} from './partage-fixtures';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/* ---------- Aides ---------- */

const stockage = (page: Page) =>
	page.evaluate(() =>
		Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
	);

const lire = <T>(page: Page, cle: string): Promise<T | null> =>
	page.evaluate((k) => {
		const v = localStorage.getItem(k);
		return v === null ? null : JSON.parse(v);
	}, cle);

/** Requêtes qui PARTENT pendant les gestes : fetch/xhr ou origine étrangère. Le décor
 *  `foret-pied.svg` (GET same-origin au démarrage) est le seul toléré. */
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

/** Deux profils sur l'appareil : l'actif « E2E » et « Léa » (accent, pour le rapprochement
 *  avec un pseudo « LEA »). Posé seulement si absent : `addInitScript` rejoue à chaque
 *  navigation et écraserait le profil créé par l'import. */
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

/** Un lien complet se ramène à son hash : `gotoHash` pose le profil et force le rechargement utile. */
const hashDe = (lien: string) => new URL(lien).hash.slice(1);

const ouvrirResultat = (page: Page, code: string) => gotoHash(page, `resultat/${code}`);

interface Profil {
	uuid: string;
	name: string;
	niveauReference?: string;
}
const profils = async (page: Page) =>
	(await lire<{ list: Profil[]; active: string }>(page, 'ludaskia_profiles')) ?? {
		list: [],
		active: '',
	};

/* ---------- Composer un envoi (UI) ---------- */

async function ouvrirEnvois(page: Page) {
	await gotoHash(page, 'encadrant/envois');
	await expect(page.locator('.enc-tab[data-tab="envois"]')).toBeVisible();
}

async function choisirNiveau(page: Page, niveau: string) {
	const sel = page.locator('select#envoiNiveau');
	if (await sel.count()) await sel.selectOption(niveau);
}

async function creerLien(page: Page, libelle: string): Promise<string> {
	await page.locator('input#envoiLibelle').fill(libelle);
	await page.locator('button#envoiCreer').click();
	await expect(page.locator('#envoiCree')).toBeVisible();
	return page.locator('input#envoiLien').inputValue();
}

async function creerFicheUI(page: Page, libelle = LIBELLE_FICHE): Promise<string> {
	await ouvrirEnvois(page);
	await page.locator('button[data-act="envoi-source"][data-source="lecon"]').click();
	await page.getByPlaceholder(/Rechercher une leçon/i).fill(titreLecon(LECON_A));
	await page.locator(`button[data-act="envoi-lecon"][data-lesson="${LECON_A}"]`).first().click();
	await expect(page.locator('#envoiLeconChoisie')).toContainText(titreLecon(LECON_A));
	await choisirNiveau(page, 'ce2');
	return creerLien(page, libelle);
}

async function creerBilanUI(page: Page, libelle = 'Bilan du jeudi'): Promise<string> {
	await ouvrirEnvois(page);
	await page.locator('button[data-act="envoi-source"][data-source="bilan"]').click();
	await page.locator('button[data-act="envoi-bilan"][data-bilan="categorie"]').click();
	const valeurs = await page
		.locator('select#envoiCategorie option')
		.evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ''));
	expect(valeurs.length).toBeGreaterThan(0);
	await page.locator('select#envoiCategorie').selectOption(valeurs[0]);
	await choisirNiveau(page, 'ce2');
	await page.locator('button[data-act="envoi-variante"][data-variante="express"]').click();
	return creerLien(page, libelle);
}

/* ---------- Jouer côté enfant (contenu tiré : on ne dépend de rien) ---------- */

/** « Je ne sais pas » partout, sauf une réponse fausse quand un champ texte existe.
 *  Renvoie vrai si une réponse fausse a été posée. */
async function jouerSansSavoir(page: Page): Promise<boolean> {
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await page.locator('#partageCommencer').click();
	const items = page.locator('.partage-item');
	await expect(items.first()).toBeVisible();
	const n = await items.count();
	let faux = -1;
	for (let i = 0; i < n && faux < 0; i++) {
		if ((await items.nth(i).locator('input.ans:not([type=hidden])').count()) > 0) faux = i;
	}
	for (let i = 0; i < n; i++) {
		if (i === faux) await items.nth(i).locator('input.ans:not([type=hidden])').first().fill('zzz');
		else await items.nth(i).locator('.partage-jnsp input[type=checkbox]').check();
	}
	await page.locator('#partageFini').click();
	await expect(page.locator('#partageFin')).toBeVisible();
	return faux >= 0;
}

async function lienResultat(page: Page, pseudo: string): Promise<string> {
	await page.locator('#partagePseudo').fill(pseudo);
	await expect
		.poll(async () => {
			const lien = await page.locator('#partageLien').inputValue();
			const code = lien.slice(lien.indexOf('#resultat/') + '#resultat/'.length);
			const r = await decoderResultat(code);
			return r.ok ? r.valeur.pseudo : '';
		})
		.toBe(pseudo);
	return page.locator('#partageLien').inputValue();
}

/* ---------- PIN (patron de encadrant.spec.ts) ---------- */

async function activerPin(page: Page) {
	await gotoHash(page, 'encadrant');
	await page.evaluate(() => localStorage.removeItem('ludaskia_encadrant_lock'));
	await gotoHash(page, 'encadrant/reglages');
	await page.locator('[data-act="pin-activer"]').click();
	for (const d of ['1', '2', '3', '4']) await page.locator(`.kp-key[data-d="${d}"]`).click();
	await page.locator('[data-act="secret-conserve"]').click();
	await page.locator('[data-act="pin-terminer"]').click();
	await expect(page.locator('select[data-act="set-niveau-ref"]')).toBeVisible();
}

/* ============================================================
   Créer un envoi (1, 4, 5, 28)
   ============================================================ */

test('1, 5, 28 · fiche : leçon choisie, lien copiable, mention de ce que contiendra le résultat, rien ne part', async ({
	page,
	baseURL,
}) => {
	const errors = watchErrors(page);
	await ouvrirEnvois(page);
	const sortants = surveillerReseau(page, baseURL);

	// 1 : les trois sources sont proposées.
	await expect(page.locator('button[data-act="envoi-source"][data-source="lecon"]')).toBeVisible();
	await expect(page.locator('button[data-act="envoi-source"][data-source="bilan"]')).toBeVisible();
	await page.locator('button[data-act="envoi-source"][data-source="bilan"]').click();
	await expect(
		page.locator('button[data-act="envoi-bilan"][data-bilan="categorie"]'),
	).toBeVisible();
	await expect(page.locator('button[data-act="envoi-bilan"][data-bilan="favori"]')).toBeVisible();

	// 1 : une leçon se trouve par la recherche et se choisit.
	await page.locator('button[data-act="envoi-source"][data-source="lecon"]').click();
	await page.getByPlaceholder(/Rechercher une leçon/i).fill(titreLecon(LECON_A));
	await page.locator(`button[data-act="envoi-lecon"][data-lesson="${LECON_A}"]`).first().click();
	await expect(page.locator('#envoiLeconChoisie')).toContainText(titreLecon(LECON_A));
	await choisirNiveau(page, 'ce2');

	// 5 : ce que le résultat contiendra, et l'absence de serveur.
	const mention = page.locator('#envoiMention');
	await expect(mention).toBeVisible();
	await expect(mention).toContainText(/prénom|pseudo/i);
	await expect(mention).toContainText(/réponses/i);
	await expect(mention).toContainText(/serveur/i);

	// Libellé prérempli et modifiable ; hors liste blanche → invalide.
	const libelle = page.locator('input#envoiLibelle');
	await expect(libelle).not.toHaveValue('');
	await libelle.fill('<b>Fiche</b>');
	await expect(libelle).toHaveAttribute('aria-invalid', 'true');
	await page.locator('button#envoiCreer').click();
	await expect(page.locator('#envoiCree')).toHaveCount(0);

	const lien = await creerLien(page, LIBELLE_FICHE);
	expect(lien).toMatch(/#envoi\/[A-Za-z0-9_-]+$/);
	await expect(page.locator('input#envoiLien')).toHaveJSProperty('readOnly', true);

	await page.locator('button#envoiCopier').click();
	await expect(page.locator('#envoiCopie')).not.toBeEmpty();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(lien);

	expect(sortants).toEqual([]); // 28
	expect(errors).toEqual([]);
});

test('1 · bilan de catégorie : express et complet proposés, le lien se crée', async ({ page }) => {
	const errors = watchErrors(page);
	await ouvrirEnvois(page);
	await page.locator('button[data-act="envoi-source"][data-source="bilan"]').click();
	await page.locator('button[data-act="envoi-bilan"][data-bilan="categorie"]').click();
	await expect(
		page.locator('button[data-act="envoi-variante"][data-variante="express"]'),
	).toBeVisible();
	await expect(
		page.locator('button[data-act="envoi-variante"][data-variante="complet"]'),
	).toBeVisible();

	const lien = await creerBilanUI(page);
	expect(lien).toMatch(/#envoi\/[A-Za-z0-9_-]+$/);
	expect(errors).toEqual([]);
});

test('4 · l’envoi est conservé après rechargement, avec son libellé et le même lien', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirEnvois(page);
	// L'exigence est l'état vide dit en clair, pas le choix de l'apostrophe.
	await expect(page.locator('#envoisListe')).toContainText(/Aucun envoi pour l.instant/);
	await expect(page.locator('#envoisListe li.enc-envoi')).toHaveCount(0);

	const lien = await creerFicheUI(page, 'Fiche gardée');
	await page.reload({ waitUntil: 'networkidle' });

	const ligne = page.locator('#envoisListe li.enc-envoi');
	await expect(ligne).toHaveCount(1);
	await expect(ligne).toContainText('Fiche gardée');
	await ligne.locator('button[data-act="envoi-copier"]').click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(lien);
	expect(errors).toEqual([]);
});

/* ============================================================
   Lire un résultat (18, 30, 33, 43, refus)
   ============================================================ */

test('18, 33, 43 · lecture : score, items et statuts, ni XP ni pourcentage, aucune écriture ni modale', async ({
	page,
	baseURL,
}) => {
	const errors = watchErrors(page);
	const r = resultatDe();
	const code = await encoderResultat(r);

	// Premier chargement stable, puis l'instantané AVANT d'ouvrir le résultat.
	await gotoHash(page, 'accueil');
	await expect(page.locator('.home-grid')).toBeVisible();
	const avant = await stockage(page);
	const sortants = surveillerReseau(page, baseURL);

	await ouvrirResultat(page, code);
	await expect(page.locator('#resultatTitre')).toContainText(`Résultat de ${r.pseudo}`);
	await expect(page.locator('#resultatLibelle')).toContainText(LIBELLE_FICHE);
	await expect(page.locator('#resultatDate')).toContainText(String(new Date(r.date).getFullYear()));
	await expect(page.locator('#resultatNiveau')).toBeVisible();
	await expect(page.locator('#resultatScore')).toContainText(/\b1\b.*\bsur 4\b/);

	const items = page.locator('ol#resultatItems > li.resultat-item');
	await expect(items).toHaveCount(4);
	const statuts = ['juste', 'faux', 'jnsp', 'vide'];
	// Libellés de statut : ceux du contrat d'écran, ils sont l'objet de l'assertion.
	const mots = ['Juste', 'Faux', 'Je ne sais pas', 'Sans réponse'];
	for (let i = 0; i < 4; i++) {
		const it = items.nth(i);
		await expect(it).toHaveAttribute('data-statut', statuts[i]);
		await expect(it.locator('.resultat-enonce')).toContainText(r.reponses[i].enonce);
		await expect(it.locator('.resultat-attendue')).toContainText(r.reponses[i].attendue);
		if (r.reponses[i].saisie)
			await expect(it.locator('.resultat-saisie')).toContainText(r.reponses[i].saisie);
		await expect(it.locator('.resultat-statut')).toContainText(mots[i]);
	}

	// 18 : aucun PIN demandé pour LIRE.
	await expect(page.locator('#resultatPin')).toHaveCount(0);
	// 33 : ni XP, ni pourcentage.
	const visible = await page.locator('body').innerText();
	expect(visible).not.toMatch(/\bXP\b/);
	expect(visible).not.toMatch(/%/);
	// 43 : aucune modale d'accueil, aucune écriture.
	await expect(page.locator('.modal:visible')).toHaveCount(0);
	expect(await stockage(page)).toEqual(avant);
	expect(sortants).toEqual([]); // 28
	expect(errors).toEqual([]);
});

test('18 · avec un code d’accès actif, la lecture ne le demande pas ; seul l’import le demande', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await activerPin(page);
	const code = await codeResultatDe();
	await ouvrirResultat(page, code);
	await page.reload({ waitUntil: 'networkidle' }); // mémoire vidée : session verrouillée

	await expect(page.locator('#resultatTitre')).toBeVisible();
	await expect(page.locator('#resultatPin')).toHaveCount(0);

	await page.locator('button#resultatImporter').click();
	await expect(page.locator('#resultatPin')).toBeVisible();
	await expect(page.locator('#resultatImport')).toHaveCount(0);

	await page.locator('input#resultatPinCode').fill('9999');
	await page.locator('button#resultatPinValider').click();
	await expect(page.locator('#resultatPinErreur')).toContainText(/Ce n.est pas le bon code/);
	await expect(page.locator('#resultatImport')).toHaveCount(0);

	await page.locator('input#resultatPinCode').fill('1234');
	await page.locator('button#resultatPinValider').click();
	await expect(page.locator('#resultatImport')).toBeVisible();
	expect(errors).toEqual([]);
});

test('30 · un énoncé forgé s’affiche comme du texte, aucun élément injecté', async ({ page }) => {
	const errors = watchErrors(page);
	const forge = '<img src=x onerror="window.__xss=1"> je chante';
	const base = resultatDe();
	base.reponses[0].enonce = forge;
	await gotoHash(page, 'accueil');
	await ouvrirResultat(page, await encoderResultat(base));

	await expect(page.locator('ol#resultatItems > li').first()).toContainText('<img src=x');
	await expect(page.locator('#resultatItems img')).toHaveCount(0);
	await expect(page.locator('img[src="x"]')).toHaveCount(0);
	expect(
		await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
	).toBeUndefined();
	expect(errors).toEqual([]);
});

for (const quoi of ['caractere', 'tronque', 'version', 'controle'] as const) {
	test(`18 · lien de résultat altéré (${quoi}) : refusé, aucun item, aucune erreur JS`, async ({
		page,
	}) => {
		const errors = watchErrors(page);
		await gotoHash(page, 'accueil');
		await ouvrirResultat(page, alterer(await codeResultatDe(), quoi));
		await expect(page.locator('#resultatRefus')).toContainText(
			/Ce lien de résultat ne s.ouvre pas/,
		);
		await expect(page.locator('li.resultat-item')).toHaveCount(0);
		await expect(page.locator('button#resultatImporter')).toHaveCount(0);
		expect(errors).toEqual([]);
	});
}

test('18 · un lien d’ENVOI ouvert en #resultat/ est refusé', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'accueil');
	await ouvrirResultat(page, await codeDe(envoiFiche()));
	await expect(page.locator('#resultatRefus')).toBeVisible();
	await expect(page.locator('li.resultat-item')).toHaveCount(0);
	expect(errors).toEqual([]);
});

/* ============================================================
   Importer (19, 20, 21, 22, 28)
   ============================================================ */

test('19, 21, 22, 28 · import : profil correspondant présélectionné, rien avant confirmation, journal + activité, XP intacte, doublon refusé', async ({
	page,
	baseURL,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_DEUX_PROFILS);
	// Pseudo en capitales sans accent : le profil « Léa » doit correspondre (casse et accents ignorés).
	const r = resultatDe({ pseudo: 'LEA' });
	const code = await encoderResultat(r);
	await gotoHash(page, 'accueil');
	const sortants = surveillerReseau(page, baseURL);
	const xpAvant = await lire<number>(page, 'lea/ludaskia_xp');

	await ouvrirResultat(page, code);
	await page.locator('button#resultatImporter').click();
	await expect(page.locator('#resultatImport')).toBeVisible();

	// 19 : un profil par radio + « nouveau » ; le profil correspondant est coché d'avance.
	const radios = page.locator('input[name="resultatCible"]');
	await expect(radios).toHaveCount(3);
	await expect(page.locator('input[name="resultatCible"][value="nouveau"]')).toBeVisible();
	await expect(page.locator('input[name="resultatCible"][value="lea"]')).toBeChecked();
	await expect(page.locator('#resultatImport')).toContainText(/Créer le profil LEA/);
	await expect(page.locator('button#resultatConfirmer')).toContainText('Léa');

	// 19 : rien n'est importé tant qu'on n'a pas confirmé.
	expect(await lire(page, 'lea/ludaskia_erreurs')).toBeNull();
	expect((await profils(page)).list).toHaveLength(2);

	await page.locator('button#resultatConfirmer').click();
	await expect(page.locator('#resultatImportStatut')).not.toBeEmpty();
	await expect(page.locator('a#resultatVoirSuivi')).toBeVisible();

	// 21 : erreurs datées du passage, entrée d'activité, XP inchangée.
	const journal = (await lire<
		{ ts: number; lessonId: string; mode: string; donnee: string; attendue: string }[]
	>(page, 'lea/ludaskia_erreurs'))!;
	const faute = journal.find((e) => e.donnee === 'zzz');
	expect(faute).toBeDefined();
	expect(faute!.ts).toBe(r.date);
	expect(faute!.lessonId).toBe(LECON_A);
	expect(faute!.attendue).toContain('danses');
	const activite = (await lire<Record<string, unknown>[]>(page, 'lea/ludaskia_activity')) ?? [];
	expect(activite).toHaveLength(1);
	expect(await lire<number>(page, 'lea/ludaskia_xp')).toBe(xpAvant);

	// Le suivi s'ouvre sur CE profil ; le profil actif ne change pas.
	await page.locator('a#resultatVoirSuivi').click();
	await expect(page.locator('.enc-err-lecon').first()).toBeVisible();
	expect((await profils(page)).active).toBe('e2e');

	// 22 : même résultat, même profil → rien n'est ajouté.
	const nbErreurs = journal.length;
	await ouvrirResultat(page, code);
	await page.locator('button#resultatImporter').click();
	await expect(page.locator('input[name="resultatCible"][value="lea"]')).toBeChecked();
	await page.locator('button#resultatConfirmer').click();
	await expect(page.locator('#resultatImportStatut')).toContainText(/déjà/i);
	expect((await lire<unknown[]>(page, 'lea/ludaskia_erreurs'))!.length).toBe(nbErreurs);
	expect(await lire<unknown[]>(page, 'lea/ludaskia_activity')).toHaveLength(1);

	expect(sortants).toEqual([]); // 28
	expect(errors).toEqual([]);
});

test('19, 20 · pseudo inconnu : rien de coché, nouveau profil nommé du pseudo, classe préremplie et modifiable ; sans niveau, classe vide', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_DEUX_PROFILS);
	await gotoHash(page, 'accueil');

	await ouvrirResultat(page, await codeResultatDe({ pseudo: 'Zoé' }));
	await page.locator('button#resultatImporter').click();
	await expect(page.locator('#resultatImport')).toBeVisible();
	// 19 : aucun profil ne correspond → rien de coché d'avance.
	await expect(page.locator('input[name="resultatCible"]:checked')).toHaveCount(0);

	await page.locator('input[name="resultatCible"][value="nouveau"]').check();
	await expect(page.locator('select#resultatClasse')).toHaveValue('ce2'); // niveau de l'envoi
	await page.locator('select#resultatClasse').selectOption('cm1'); // modifiable
	await page.locator('button#resultatConfirmer').click();
	await expect(page.locator('a#resultatVoirSuivi')).toBeVisible();

	// 20 : profil normal, nom = pseudo, classe choisie.
	const { list, active } = await profils(page);
	expect(list).toHaveLength(3);
	const zoe = list.find((p) => p.name === 'Zoé');
	expect(zoe).toBeDefined();
	expect(zoe!.niveauReference).toBe('cm1');
	expect(active).toBe('e2e');
	expect((await lire<unknown[]>(page, `${zoe!.uuid}/ludaskia_erreurs`))!.length).toBeGreaterThan(0);

	// 20 : envoi sans niveau → classe vide.
	await ouvrirResultat(
		page,
		await codeResultatDe({
			pseudo: 'Max',
			envoi: { id: resultatDe().envoi.id, libelle: LIBELLE_FICHE },
		}),
	);
	await page.locator('button#resultatImporter').click();
	await page.locator('input[name="resultatCible"][value="nouveau"]').check();
	await expect(page.locator('select#resultatClasse')).toHaveValue('');
	expect(errors).toEqual([]);
});

/* ============================================================
   Chaîne complète (37, partiel) : créer, ouvrir, jouer, renvoyer, lire, importer
   ============================================================ */

test('37 · chaîne FICHE : créer dans l’espace encadrant, jouer, lire le résultat, l’importer dans un nouveau profil', async ({
	page,
	baseURL,
}) => {
	const errors = watchErrors(page);
	const lienEnvoi = await creerFicheUI(page);
	const sortants = surveillerReseau(page, baseURL);

	await gotoHash(page, hashDe(lienEnvoi));
	const fauxPose = await jouerSansSavoir(page);
	expect(fauxPose).toBe(true);
	const lienRes = await lienResultat(page, 'Zoé');

	await gotoHash(page, hashDe(lienRes));
	await expect(page.locator('#resultatTitre')).toContainText('Zoé');
	await expect(page.locator('#resultatLibelle')).toContainText(LIBELLE_FICHE);
	await expect(page.locator('li.resultat-item[data-statut="faux"]')).toHaveCount(1);
	await expect(page.locator('li.resultat-item[data-statut="faux"] .resultat-saisie')).toContainText(
		'zzz',
	);

	await page.locator('button#resultatImporter').click();
	await page.locator('input[name="resultatCible"][value="nouveau"]').check();
	await expect(page.locator('select#resultatClasse')).toHaveValue('ce2');
	await page.locator('button#resultatConfirmer').click();
	await expect(page.locator('a#resultatVoirSuivi')).toBeVisible();

	await page.locator('a#resultatVoirSuivi').click();
	const lecon = page.locator('.enc-err-lecon').first();
	await expect(lecon).toBeVisible();
	await lecon.locator('.enc-err-sum').click();
	await expect(lecon).toContainText('zzz');
	await expect(lecon).toContainText(/séance partagée/i);

	expect(sortants).toEqual([]); // 28
	expect(errors).toEqual([]);
});

test('37 · chaîne BILAN : créer, jouer, lire le résultat, l’importer dans un profil existant', async ({
	page,
	baseURL,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(SEED_DEUX_PROFILS);
	const lienEnvoi = await creerBilanUI(page, 'Bilan du jeudi');
	const sortants = surveillerReseau(page, baseURL);

	await gotoHash(page, hashDe(lienEnvoi));
	const fauxPose = await jouerSansSavoir(page);
	const lienRes = await lienResultat(page, 'Zoé');

	await gotoHash(page, hashDe(lienRes));
	await expect(page.locator('#resultatLibelle')).toContainText('Bilan du jeudi');
	const total = await page.locator('li.resultat-item').count();
	expect(total).toBeGreaterThan(0);
	await expect(page.locator('li.resultat-item[data-statut="juste"]')).toHaveCount(0);
	await expect(page.locator('li.resultat-item[data-statut="jnsp"]')).toHaveCount(
		fauxPose ? total - 1 : total,
	);

	await page.locator('button#resultatImporter').click();
	await page.locator('input[name="resultatCible"][value="lea"]').check();
	await page.locator('button#resultatConfirmer').click();
	await expect(page.locator('#resultatImportStatut')).not.toBeEmpty();
	await expect(page.locator('a#resultatVoirSuivi')).toBeVisible();
	const act = await lire<unknown[]>(page, 'lea/ludaskia_activity');
	expect(act).toHaveLength(1);
	if (fauxPose) {
		await page.locator('a#resultatVoirSuivi').click();
		await expect(page.locator('.enc-err-lecon').first()).toBeVisible();
	}

	expect(sortants).toEqual([]); // 28
	expect(errors).toEqual([]);
});
