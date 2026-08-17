/* ============================================================
   Dictée devenue MUETTE (#306 §5) : `renderDicteeMuette()` (ui/ortho-runner.ts)
   prend la main quand la voix qui semblait disponible ne peut plus rien dire — le
   cas visé ici est une voix française DISTANTE (`localService: false`) alors que
   l'appareil est hors ligne (cf. ui/tts.ts, `voixFr`) : le repli sur cette voix ne
   tient que tant qu'on peut joindre le serveur qui la synthétise.

   Amorçage : Chromium headless n'expose aucune voix par défaut, on stubbe donc
   `speechSynthesis.getVoices()` pour n'exposer QU'une voix FR distante (même piège
   `SpeechSynthesisUtterance` que `ortho-atelier-ecouter.spec.ts` : assigner un objet
   JS ordinaire à `.voice` sur le VRAI constructeur lève une erreur WebIDL). Le mot
   seedé a déjà validé tuiles + mot caché : la dictée est donc la PROCHAINE activité
   du parcours complet (cf. `prochaineActivite`, core/orthographe/runner.ts), pas
   besoin de passer par l'écran de choix de mode. On démarre EN LIGNE (la voix
   distante compte tant que le réseau répond, `dicteeDisponible()` est vraie), on
   atteint l'écran de dictée, puis `context.setOffline` avant de redemander
   l'écoute — c'est ce redéclenchement qui bascule sur l'écran muet.

   Point le plus important à verrouiller (#391) : une dictée muette ne journalise
   RIEN dans le journal d'erreurs de l'espace encadrant — sinon un parent y verrait
   une série de fautes qui n'en sont pas. L'écran muet ne propose d'ailleurs aucun
   champ de saisie : il ne reste rien à corriger, la garantie est aussi structurelle.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

const LESSON_ID = 'l-e2e-dictee-muette';

/* Mot déjà découvert (`atelierFait`), tuiles et mot caché déjà validés : dans
   l'ordre de déblocage (ORDRE_MODES = tuiles → motCache → dictee), la dictée est
   donc la seule activité qui reste due. */
const ORTHO_SEED = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'bonjour',
			entourage: [],
			atelierFait: true,
			validation: { tuiles: true, motCache: true, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{ id: LESSON_ID, label: 'Test dictée muette', motIds: ['w1'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { bonjour: 'w1' },
};

async function seedOrtho(page: Page): Promise<void> {
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, ORTHO_SEED);
}

/* Une seule voix FR, DISTANTE : le repli que #306 §5 rend conditionnel au réseau.
   `getVoices`/`speak` sont stubbés (aucune voix native en Chromium headless) ;
   `SpeechSynthesisUtterance` aussi, pour éviter l'erreur WebIDL sur `.voice`. */
function stubVoixDistante(): string {
	return `(() => {
		const voix = {
			lang: 'fr-FR',
			name: 'Voix FR distante de test',
			localService: false,
			default: true,
			voiceURI: 'e2e-voix-fr-distante',
		};
		class FakeUtterance {
			constructor(text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; }
			addEventListener() {}
		}
		window.SpeechSynthesisUtterance = FakeUtterance;
		const synth = window.speechSynthesis;
		synth.getVoices = () => [voix];
		synth.speak = () => {};
	})();`;
}

test('dictée devenue muette hors ligne : écran de sortie, sans rien journaliser (#391)', async ({
	page,
	context,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixDistante());
	await seedOrtho(page);

	// En ligne : la voix distante compte encore, la dictée est proposée directement.
	await gotoHash(page, 'ortho-' + LESSON_ID);
	await expect(page.locator('#btnEcouter')).toBeVisible();
	await expect(page.locator('#orthoInput')).toBeVisible();

	// Le réseau tombe : la même voix ne peut plus rien synthétiser.
	await context.setOffline(true);
	await page.locator('#btnEcouter').click();

	await expect(page.locator('h2', { hasText: 'La dictée a besoin du son' })).toBeVisible();
	await expect(page.locator('#btnAutrementDictee')).toBeVisible();
	await expect(page.locator('#btnStopDictee')).toBeVisible();
	// Aucun champ de saisie : rien à deviner, rien à corriger dans le silence.
	await expect(page.locator('#orthoInput')).toHaveCount(0);

	// Le message reprend bien la variante « hors ligne » (pas « aucune voix ») :
	// il dit explicitement que ce n'est pas définitif (#391, note de relecture).
	const texte = await page.locator('.ortho-run.ortho-bilan').innerText();
	expect(texte).toMatch(/connexion/i);
	expect(texte).toMatch(/revient/i);

	// #391 : rien n'atterrit dans le journal d'erreurs du profil actif.
	const journal = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_erreurs'));
	expect(journal === null || journal === '[]').toBe(true);

	expect(errors).toEqual([]);
});

test('« Travailler autrement » n’en redemande pas : le mot ne requiert plus la dictée', async ({
	page,
	context,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixDistante());
	await seedOrtho(page);

	await gotoHash(page, 'ortho-' + LESSON_ID);
	await expect(page.locator('#btnEcouter')).toBeVisible();

	await context.setOffline(true);
	await page.locator('#btnEcouter').click();
	await expect(page.locator('#btnAutrementDictee')).toBeVisible();

	await page.locator('#btnAutrementDictee').click();
	// Le mot avait déjà validé tuiles ET mot caché (seul manquait dictee) : dès que
	// la dictée n'est plus dispo, `modesRequis(false)` ne l'exige plus, et le mot
	// est donc déjà « maîtrisé » (cf. `statutMot`, core/orthographe/runner.ts) — la
	// liste se termine directement, jamais un nouveau champ de dictée muet.
	await expect(page.locator('h2', { hasText: 'Liste prête' })).toBeVisible();
	await expect(page.locator('h2', { hasText: 'La dictée a besoin du son' })).toHaveCount(0);
	await expect(page.locator('#btnEcouter')).toHaveCount(0);

	// Toujours rien dans le journal d'erreurs.
	const journal = await page.evaluate(() => localStorage.getItem('e2e/ludaskia_erreurs'));
	expect(journal === null || journal === '[]').toBe(true);

	expect(errors).toEqual([]);
});
