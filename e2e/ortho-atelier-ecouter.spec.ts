/* ============================================================
   Atelier du mot — bouton « Écouter » (harmonisation TTS, cf. dictée/tuiles/
   mot caché). `renderAtelier` (ui/ortho-atelier.ts) rend un bouton `.ortho-ecouter`
   / `#btnEcouterAtelier` UNIQUEMENT si une voix FR est disponible
   (`dicteeDisponible()`, ui/tts.ts). Chromium headless n'expose AUCUNE voix par
   défaut : sans stub, ce test ne verrait jamais le bouton. On stubbe donc
   `speechSynthesis.getVoices()`/`speak()` via `addInitScript` (AVANT navigation)
   pour simuler une voix FR locale, en complément de la contre-épreuve sans stub
   (cf. commentaire en tête de accessibilite.spec.ts, qui documente ce piège).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Liste ortho à un seul mot, PAS ENCORE découvert (atelierFait: false) : la
   première activité du parcours (startOrthoRun) sera donc l'atelier. */
const ORTHO_SEED = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'bonjour',
			entourage: [],
			atelierFait: false,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-atelier',
			label: 'Test atelier écouter',
			motIds: ['w1'],
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { bonjour: 'w1' },
};

/* Simule une voix FR locale : `getVoices()` la renvoie, `speak()` devient un
   no-op instrumenté (compteur lu ensuite via page.evaluate). Doit être posé
   AVANT la navigation (addInitScript s'exécute avant les scripts de la page,
   donc avant l'appel `initTts()` de main.ts).
   `SpeechSynthesisUtterance` natif est aussi remplacé par une classe factice :
   affecter un objet JS ordinaire à `.voice` sur le VRAI constructeur lève
   « Failed to convert value to 'SpeechSynthesisVoice' » (contrôle de type
   WebIDL sur un objet plateforme) — la voix factice n'étant pas une instance
   native, seule une utterance factice l'accepte sans lever. */
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

async function seedOrtho(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, ORTHO_SEED);
}

test('Atelier du mot : voix FR dispo → bouton Écouter visible, libellé et clic sans erreur — #dictee-bouton-ecouter-permanent', async ({
	page,
}) => {
	const errors = watchErrors(page);

	await page.addInitScript(stubVoixFr());
	await seedOrtho(page);
	await seedAideVue(page); // neutralise la bulle d'aide 1er lancement (atelier)

	await gotoHash(page, 'ortho-l-e2e-atelier');

	const btn = page.locator('.ortho-ecouter');
	await expect(btn).toBeVisible();
	await expect(btn).toHaveAttribute('id', 'btnEcouterAtelier');
	await expect(btn).toContainText('Écouter le mot');

	await btn.click();
	const calls = await page.evaluate(
		() => (window as unknown as { __e2eSpeakCalls: number }).__e2eSpeakCalls,
	);
	expect(calls).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});

test('Atelier du mot : sans voix FR → pas de bouton Écouter (Chromium headless) — #dictee-bouton-ecouter-permanent', async ({
	page,
}) => {
	const errors = watchErrors(page);

	await seedOrtho(page);
	await seedAideVue(page);

	await gotoHash(page, 'ortho-l-e2e-atelier');

	// L'atelier se rend bien (mot affiché, action de fin présente)…
	await expect(page.locator('#atelierMot')).toBeVisible();
	await expect(page.locator('#btnAtelierDone')).toBeVisible();
	// … mais sans bouton d'écoute, faute de voix FR.
	await expect(page.locator('.ortho-ecouter')).toHaveCount(0);

	expect(errors).toEqual([]);
});
