/* ============================================================
   Orthographe — le témoin `progressive` d'un point d'activité décrit SON bloc, pas
   le précédent (#706, critère 3 ajouté après coup — commentaire daté sur l'issue).

   La ligne existe déjà dans `ortho-runner.ts` (gestionnaire de « Continuer encore un
   peu ») :

       actes = 0;
       orthoJournalisee = false;
       seanceProgressive = false;

   … mais rien ne la gardait avant ce fichier : la supprimer ne cassait aucun test.
   `progressive` n'est observable QUE dans un bloc qui ne fait plus rien progresser —
   en parcours complet et en tour de révision, il vaut vrai de toute façon
   (`!seanceMode || activiteProgressive(...)`, ortho-runner.ts), donc seul un MODE
   CIBLÉ franchissant une pause peut le faire varier.

   Scénario : mode ciblé « mot caché » sur une liste de 9 mots dont les 8 premiers
   n'ont PAS encore validé ce mode (bloc 1 : chaque activité progresse réellement) et
   dont le 9ᵉ l'a DÉJÀ (bloc 2, ouvert par « Continuer encore un peu » : tous les mots
   ont alors le mot caché validé, plus rien n'y progresse). La dictée est laissée
   DISPONIBLE (`STUB_VOIX_FR`) mais jamais validée pour personne : `modesRequis`
   exige alors aussi la dictée pour qu'un mot soit « maîtrisé », ce qui GARANTIT que
   la liste ne devient jamais entièrement étoilée pendant ce test — sans ce verrou, le
   bloc 1 finirait sur le bilan « Liste prête ! » (vérifié en tête de `renderNext`,
   AVANT le plafond de séance) plutôt que sur la pause visée.

   Cible délibérément le mot caché plutôt que les tuiles : `#motAffiche` révèle le mot
   en clair, ce qui permet de compléter chaque activité SANS connaître à l'avance
   l'ordre exact du cycle du mode ciblé (`idx % mots.length`, affecté lui aussi par le
   mot mis en attente au plafond, cf. `dictee-revision-plafond.spec.ts`).
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';
import { STUB_VOIX_FR } from './journal-couverture';

test.beforeEach(async ({ page }) => {
	await seedAideVue(page);
});

const LESSON_ID = 'l-e2e-cible-progressive';
const MOTS = ['chat', 'lune', 'radis', 'jupe', 'bocal', 'guide', 'minou', 'sirop', 'cheval'];

/* 9 mots : les 8 premiers n'ont pas encore le mot caché validé (bloc 1, chacun
   progresse) ; le 9ᵉ (dernier) l'a déjà (le témoin du bloc 2). `dictee` reste FAUX
   pour tous : la liste ne devient donc jamais « étoilée » pendant ce test (cf.
   en-tête de fichier), quel que soit l'état de `motCache`. */
const SEED = {
	banque: Object.fromEntries(
		MOTS.map((mot, i) => [
			`c${i + 1}`,
			{
				id: `c${i + 1}`,
				mot,
				entourage: [],
				atelierFait: true,
				validation: {
					tuiles: true,
					motCache: i === MOTS.length - 1,
					dictee: false,
				},
				revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
				origine: 'liste',
			},
		]),
	),
	listes: [
		{
			id: LESSON_ID,
			label: 'Test progressive',
			motIds: MOTS.map((_, i) => `c${i + 1}`),
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: Object.fromEntries(MOTS.map((mot, i) => [mot, `c${i + 1}`])),
};

interface JournalEntry {
	t: number;
	k: string;
	ref?: string;
	progressive?: boolean;
}

async function lireActiviteDictee(page: Page): Promise<JournalEntry[]> {
	const raw = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_activity'));
	const all: JournalEntry[] = raw ? JSON.parse(raw) : [];
	return all.filter((e) => e.k === 'dictee');
}

/* Une réussite peut décrocher un trophée ou une montée de niveau (progression réelle
   sur 16 activités) : la modale intercepterait le clic suivant si elle reste ouverte
   (même patron que `mots-difficiles.spec.ts`). No-op si aucune n'est présente. */
async function fermerModalesRecompense(page: Page): Promise<void> {
	for (const id of ['#celebrateOk', '#levelupOk']) {
		const btn = page.locator(id);
		if (await btn.isVisible().catch(() => false)) await btn.click();
	}
}

/* Complète l'activité « mot caché » affichée en relevant le mot montré, sans avoir
   besoin de connaître à l'avance lequel c'est (cf. en-tête de fichier). */
async function completerMotCache(page: Page): Promise<void> {
	await expect(page.locator('#motAffiche')).toBeVisible();
	const mot = (await page.locator('#motAffiche').textContent())?.trim() ?? '';
	await page.locator('#btnCacher').click();
	await page.locator('#orthoInput').fill(mot);
	await page.locator('#btnVerifMot').click();
	await page.locator('#fb button.btn-primary').click();
	await fermerModalesRecompense(page);
}

test('critère 3 (#706) : le témoin `progressive` décrit SON bloc, pas le précédent', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(STUB_VOIX_FR); // dictée dispo mais jamais validée (cf. seed)
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, SEED);

	await gotoHash(page, `ortho-mode-${LESSON_ID}`);
	await page.locator('.mode-btn[data-mode="motCache"]').click();

	// Bloc 1 : 8 activités, mot caché pas encore validé pour ces mots → chacune progresse.
	for (let i = 0; i < 8; i++) await completerMotCache(page);
	await expect(page.getByRole('heading', { name: 'Bonne séance !' })).toBeVisible();

	let entries = await lireActiviteDictee(page);
	expect(entries, 'témoin : le 1er bloc doit avoir écrit son point').toHaveLength(1);
	// `progressive` n'est écrit QUE quand la réponse est `false` (absence = « oui », cf.
	// `sessionProgressive`, core/progress.ts) : absent ici, le bloc était progressif.
	expect(entries[0].progressive, 'témoin : le 1er bloc était bien progressif').toBeUndefined();

	await fermerModalesRecompense(page); // au cas où la pause elle-même en déclenche une
	await page.locator('#btnContinuerSeance').click();

	// Bloc 2 : 8 activités de plus, mais routées sur des mots dont le mot caché est
	// DÉJÀ validé (le 9ᵉ l'était depuis le seed, les 8 premiers viennent de l'être au
	// bloc 1, quel que soit celui qu'un mot en attente ressert en premier) — aucune ne
	// progresse plus rien.
	for (let i = 0; i < 8; i++) await completerMotCache(page);
	await expect(page.getByRole('heading', { name: 'Bonne séance !' })).toBeVisible();

	entries = await lireActiviteDictee(page);
	expect(entries, 'chaque bloc mené à son écran terminal doit valoir un point').toHaveLength(2);
	// Le 1er point garde son témoin, INCHANGÉ par ce qui se passe dans le second.
	expect(entries[0].progressive, "le 1er bloc n'hérite pas de l'état du second").toBeUndefined();
	// Le cœur du critère : le 2ᵉ point porte SON PROPRE témoin — `false` explicite —
	// sans hériter du premier (resté « oui »). Rougirait si `seanceProgressive` n'était
	// plus remis à zéro par « Continuer encore un peu » : le 2e bloc afficherait alors
	// encore le `true` hérité du premier, et cette assertion échouerait.
	expect(entries[1].progressive, 'le 2e bloc, lui, ne progresse plus rien').toBe(false);

	expect(errors).toEqual([]);
});
