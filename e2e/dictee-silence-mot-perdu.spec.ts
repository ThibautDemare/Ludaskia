/* ============================================================
   Orthographe — la voix qui meurt EN PLEIN MOT, en tour de révision (#706,
   critère 12 ajouté après coup — commentaire daté sur l'issue).

   Le correctif des critères 8-11 (`dictee-revision-plafond.spec.ts`) sauve le mot tiré
   au moment où le PLAFOND de séance se déclenche (`motEnAttente`, ortho-runner.ts). Mais
   ce n'est pas le seul chemin qui abandonne un mot déjà tiré : `onSilence`
   (`optionsTacheParcours`, ortho-runner.ts ~l.503) bascule directement sur l'écran de
   dictée muette sans rien remettre de côté :

     onSilence: () => {
         dispoDictee = false;
         renderDicteeMuette();
     },

   En tour de révision, le curseur (`idx`) a déjà avancé pour tirer CE mot avant même de
   le rendre (`renderNext`) : si la voix se tait en plein milieu, ce mot est perdu pour de
   bon, exactement comme au plafond avant #706 — sauf qu'ici aucune pause n'est en cause.

   Amorçage TTS repris tel quel d'`ortho-dictee-muette.spec.ts` (lire ce fichier pour le
   détail) : une voix française DISTANTE stubée, démarrage EN LIGNE (la dictée est donc
   proposée), puis `context.setOffline` juste avant de redemander l'écoute — c'est ce
   redéclenchement qui bascule sur l'écran muet. Transposé ici sur une liste de PLUSIEURS
   mots déjà maîtrisés (`seedListeMaitrisee`, fixture partagée avec les critères 8-11) :
   un vrai tour de révision, pas le cas à un seul mot de #391/#306.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';
import { seedListeMaitrisee } from './ortho-liste-maitrisee';

const LESSON_ID = 'l-e2e-silence-revision';
const MOTS = ['renard', 'guitare', 'bonjour'];

async function seedOrtho(page: Page): Promise<void> {
	const seed = seedListeMaitrisee(LESSON_ID, MOTS);
	await page.addInitScript((s) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(s));
	}, seed);
}

/* Une seule voix FR, DISTANTE : copié tel quel d'`ortho-dictee-muette.spec.ts`. */
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

/* Lit le mot actuellement affiché en clair par la tâche « mot caché » (avant le clic sur
   « Cacher et écrire → »). Même lecture que `dictee-revision-plafond.spec.ts`. */
async function lireMotAffiche(page: Page): Promise<string> {
	const texte = await page.locator('#motAffiche').textContent();
	return (texte ?? '').trim();
}

test('critère 12 (#706) : le mot interrompu par une dictée devenue muette est resservi, pas perdu, dans un tour de révision', async ({
	page,
	context,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixDistante());
	await seedOrtho(page);

	// Liste déjà entièrement maîtrisée + parcours complet => tour de révision. La voix
	// distante compte tant qu'on est en ligne : la marche la plus haute jouable est donc
	// la dictée pour les trois mots.
	await gotoHash(page, 'ortho-mode-' + LESSON_ID);
	await page.locator('.mode-btn.recommended').click();

	// 1er mot : dictée jouée en ligne, complétée normalement (témoin que le tour démarre
	// bien en dictée, pas déjà replié sur un autre mode).
	await expect(page.locator('#btnEcouter')).toBeVisible();
	await page.locator('#orthoInput').fill(MOTS[0]);
	await page.locator('#btnVerifMot').click();
	await page.locator('#fb button.btn-primary').click();

	// 2e mot : la dictée s'affiche encore, toujours en ligne — ce mot vient d'être TIRÉ
	// par le tour (le curseur a avancé), rien n'a encore été répondu.
	await expect(page.locator('#btnEcouter')).toBeVisible();

	// Le réseau tombe EN PLEIN MOT : redemander l'écoute bascule sur l'écran muet, sans
	// que ce 2e mot ait pu être répondu.
	await context.setOffline(true);
	await page.locator('#btnEcouter').click();
	await expect(page.locator('h2', { hasText: 'La dictée a besoin du son' })).toBeVisible();

	await page.locator('#btnAutrementDictee').click();

	// Le parcours reprend, dictée désormais indisponible pour LA SÉANCE (`dispoDictee`
	// ne redevient jamais vraie en cours de route) → la marche la plus haute jouable
	// retombe sur le mot caché, qui affiche le mot en clair : de quoi savoir LEQUEL est
	// resservi.
	await expect(page.locator('.ortho-run-consigne')).toBeVisible();
	await expect(page.locator('#btnCacher')).toBeVisible();
	const motResservi = await lireMotAffiche(page);

	// Le cœur du critère : c'est le mot INTERROMPU (le 2e, « guitare ») qui doit revenir —
	// pas le 3e (« bonjour »), pris à sa place si le mot en cours de tirage au moment du
	// silence est perdu, comme au plafond de séance avant le correctif des critères 8/9.
	expect(motResservi).toBe(MOTS[1]);

	// Achève le tour normalement (mot caché pour les deux mots restants) : confirme que
	// rien n'est cassé au-delà du seul point du critère.
	await page.locator('#btnCacher').click();
	await page.locator('#orthoInput').fill(motResservi);
	await page.locator('#btnVerifMot').click();
	await page.locator('#fb button.btn-primary').click();

	await expect(page.locator('.ortho-run-consigne')).toBeVisible();
	const dernierMot = await lireMotAffiche(page);
	await page.locator('#btnCacher').click();
	await page.locator('#orthoInput').fill(dernierMot);
	await page.locator('#btnVerifMot').click();
	await page.locator('#fb button.btn-primary').click();

	await expect(page.getByRole('heading', { name: 'Révision terminée !' })).toBeVisible();

	expect(errors).toEqual([]);
});
