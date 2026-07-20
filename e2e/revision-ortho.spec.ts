/* ============================================================
   Mode Révision — parité orthographe avec le parcours d'entraînement.
   Le mot caché (motCache) rejoué en révision espacée a désormais :
   - un bouton « Écouter le mot » (#revEcouter) aux deux phases (regarde /
     écris), comme la dictée/les tuiles/l'atelier — rendu seulement si une
     voix FR est disponible (dicteeDisponible()) ;
   - un rebasculement sur l'atelier du mot à l'erreur (renderWordCorrection →
     renderAtelier), au lieu d'un simple verdict, pour revoir où l'enfant
     s'est trompé (lettres soulignées via le diff) et ré-entourer le piège.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Un seul mot d'orthographe, DÛ dès maintenant (palier en rotation, ni neuf ni
   acquis — cf. estDu/PALIER_ACQUIS, core/revision.ts). `selectDueGroups` ne lit
   que `ortho.banque[].revision` : la liste n'a pas besoin d'exister pour la
   sélection, mais on la garde pour un état réaliste. Clé préfixée par le profil
   par défaut créé par `gotoHash` (uuid 'e2e' → 'e2e/ludaskia_ortho'). */
const ORTHO_SEED_DUE = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'bonjour',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: false, dictee: false },
			revision: { palier: 2, prochaineRevision: 1, reussites: 2, dernierTest: 1 },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-rev',
			label: 'Test révision ortho',
			motIds: ['w1'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { bonjour: 'w1' },
};

async function seedOrthoDue(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, ORTHO_SEED_DUE);
}

/* Simule une voix FR locale (cf. ortho-atelier-ecouter.spec.ts) : `getVoices()` la
   renvoie, `speak()` devient un no-op instrumenté (compteur lu via page.evaluate).
   `SpeechSynthesisUtterance` natif est remplacé par une classe factice : affecter un
   objet JS ordinaire à `.voice` sur le vrai constructeur lève une TypeError WebIDL. */
function stubVoixFr(): string {
	return `(() => {
		const voix = {
			lang: 'fr-FR',
			name: 'Voix FR de test',
			localService: true,
			default: true,
			voiceURI: 'e2e-voix-fr',
		};
		window.__e2eSpeakCalls = 0;
		class FakeUtterance {
			constructor(text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; }
			addEventListener() {}
		}
		window.SpeechSynthesisUtterance = FakeUtterance;
		const synth = window.speechSynthesis;
		synth.getVoices = () => [voix];
		synth.speak = () => { window.__e2eSpeakCalls++; };
	})();`;
}

test('Révision ortho : bouton Écouter aux deux phases (voix stubbée), clic sans erreur', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await seedOrthoDue(page);
	await gotoHash(page, 'revision-espacee');

	// Phase 1 — « Regarde bien ce mot » : le mot est affiché ET écoutable.
	await expect(page.locator('.rev-word')).toHaveText('bonjour');
	const ecouterLook = page.locator('#revEcouter');
	await expect(ecouterLook).toBeVisible();
	await expect(ecouterLook).toContainText('Écouter le mot');

	// Phase 2 — « Cacher et écrire » : le mot disparaît, le bouton Écouter reste dispo.
	await page.locator('#revHide').click();
	await expect(page.locator('.rev-word')).toHaveCount(0);
	await expect(page.locator('#revInput')).toBeVisible();
	const ecouterWrite = page.locator('#revEcouter');
	await expect(ecouterWrite).toBeVisible();

	await ecouterWrite.click();
	const calls = await page.evaluate(
		() => (window as unknown as { __e2eSpeakCalls: number }).__e2eSpeakCalls,
	);
	expect(calls).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});

test('Révision ortho : sans voix FR (Chromium headless) → pas de bouton Écouter', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedOrthoDue(page);
	await gotoHash(page, 'revision-espacee');

	await expect(page.locator('.rev-word')).toHaveText('bonjour');
	await expect(page.locator('#revEcouter')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test("Révision ortho : une réponse fausse rebascule sur l'atelier du mot, puis la révision avance", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await seedOrthoDue(page);
	await seedAideVue(page); // neutralise la bulle d'aide 1er lancement (atelier, sous mode 'revision')
	await gotoHash(page, 'revision-espacee');

	// On passe directement à la phase d'écriture, puis on saisit une réponse fausse.
	await page.locator('#revHide').click();
	const input = page.locator('#revInput');
	await expect(input).toBeVisible();
	await input.fill('bonjourxx');
	await page.locator('#revValidate').click();

	// L'atelier du mot s'affiche : le mot en grand, la consigne de correction.
	await expect(page.locator('#atelierMot')).toBeVisible();
	await expect(page.locator('.ortho-run-consigne')).toContainText('Presque !');

	// « Continuer → » sans rien entourer ouvre la modale de confirmation (cf.
	// ortho-atelier.ts) ; on confirme pour avancer, comme atelier.spec.ts.
	await page.locator('#btnAtelierDone').click();
	const continuer = page.getByRole('button', { name: 'Continuer quand même' });
	await expect(continuer).toBeVisible();
	await continuer.click();

	// L'atelier disparaît ; seul mot dû → la révision est terminée (0/1, réponse fausse).
	await expect(page.locator('#atelierMot')).toHaveCount(0);
	await expect(page.locator('.rev-done')).toContainText('terminée');

	expect(errors).toEqual([]);
});

/* Non-régression clavier (revue a11y) : `bindEnter()` interceptait TOUT
   `keydown Enter` sur #revStage et le redirigeait vers Valider/Continuer, même le
   focus posé sur un bouton (ex. « Écouter le mot ») — Entrée validait alors la
   saisie en cours (même fausse) au lieu d'activer nativement le bouton focus.
   La garde `tagName === 'BUTTON'` (revision.ts) corrige ça : Entrée sur un bouton
   l'active nativement, le hijack ne sert plus qu'à valider depuis #revInput. */
test('Révision ortho : Entrée sur #revEcouter (bouton) ne valide PAS la saisie en cours — #keydown-enter-bouton', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await seedOrthoDue(page);
	await gotoHash(page, 'revision-espacee');

	await page.locator('#revHide').click();
	const input = page.locator('#revInput');
	await expect(input).toBeVisible();
	await input.fill('bonjourxx'); // réponse FAUSSE, non vide (sinon Valider re-focusse sans agir)

	await page.locator('#revEcouter').focus();
	await page.keyboard.press('Enter');

	// (a) Entrée a bien activé le bouton focus (écoute déclenchée)…
	const calls = await page.evaluate(
		() => (window as unknown as { __e2eSpeakCalls: number }).__e2eSpeakCalls,
	);
	expect(calls).toBeGreaterThan(0);
	// (b) … et n'a PAS validé la saisie fausse : on reste en phase « Écris », pas d'atelier.
	await expect(page.locator('#atelierMot')).toHaveCount(0);
	await expect(input).toBeVisible();

	expect(errors).toEqual([]);
});
