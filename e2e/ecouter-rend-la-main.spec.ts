/* ============================================================
   Smoke e2e — Le bouton « Écouter » REND LA MAIN au champ de saisie (#702,
   critères 11 à 14). La greffe générique (`bindConsigneTts`, ui/consigne-tts.ts)
   ne restaure aujourd'hui JAMAIS le focus après une lecture : un enfant qui
   écrit perd le curseur au clic et doit recliquer dans son champ avant de
   pouvoir reprendre sa saisie. Écrit AVANT l'implémentation (#584) : les
   critères 11 et 12 (positifs) sont donc ROUGES tant que le correctif n'existe
   pas ; les critères 13 et 14 (négatifs) sont déjà VERTS aujourd'hui — c'est
   précisément leur rôle : ils continueront de l'être après le correctif, et
   attrapent une régression du type « on devine une cible » ou « le clavier
   perd le focus ».

   Écrans choisis par critère (cf. brief) :
   - critère 11 (quatre écrans) : fiche d'exercice (navigation.ts, input.ans),
     problème à étapes MONO-étape (lecon-probleme.ts, .prob-input) — le sprint
     est couvert à part dans sprint-ecouter.spec.ts, son terrain naturel ; et
     la révision espacée (revision.ts, #revInput) ici.
   - critère 12 (discrimination sur plusieurs champs) : le problème à DEUX
     étapes (`math-prob-deux-etapes`, toujours 2 sous-questions, jamais 1) —
     cas qui distingue une vraie restauration d'un « focalise le premier champ »
     paresseux, en se plaçant explicitement sur le second champ.
   - critère 13 négatif : un écran QCM sans aucun champ de saisie
     (`fr-vocab-sens`, mono-mode) ET, sur un écran À saisie, le cas où AUCUN
     champ n'a le focus au moment du clic (focus initial neutralisé) — pour
     écarter spécifiquement un repli « je choisis le premier champ trouvé »,
     que le seul cas QCM ne suffirait pas à attraper.
   - critère 14 négatif : même écran QCM, bouton atteint et activé AU CLAVIER
     (Tab puis Enter/Espace, jamais `.click()`) — la distinction porte sur
     `MouseEvent.detail === 0`, qui ne vaut que pour une vraie activation
     clavier.

   Stub de voix : Chromium headless n'expose aucune voix FR (cf.
   accessibilite.spec.ts, en-tête) → aucun bouton .consigne-tts ne serait
   greffé sans stub, posé via addInitScript AVANT toute navigation.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVueScript } from './helpers';

/* Voix FR stubbée + compteur d'appels à speak() (cf. accessibilite.spec.ts,
   revision-ortho.spec.ts) : suffisant ici, aucun test de ce fichier n'a besoin
   de contrôler la FIN d'une lecture (contrairement à sprint-ecouter.spec.ts). */
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

async function nbAppelsSpeak(page: Page): Promise<number> {
	return page.evaluate(() => (window as unknown as { __e2eSpeakCalls: number }).__e2eSpeakCalls);
}

const UUID_REV = 'e2e-702-focus';

/* Amorce un profil dédié avec UNE leçon « due » (cf. revision.spec.ts,
   seedDueLesson), pour atteindre #revInput directement sans historique réel. */
function seedDueLesson(lessonId: string): string {
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid: UUID_REV, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: UUID_REV,
			}),
		)});
    localStorage.setItem('${UUID_REV}/ludaskia_lessonRevision', JSON.stringify({
      ${JSON.stringify(lessonId)}: { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
    }));
    ${seedAideVueScript(UUID_REV)}
  `;
}

/* ---------------------------------------------------------------
   Critère 11 — quatre écrans (le sprint est dans sprint-ecouter.spec.ts)
   --------------------------------------------------------------- */

test('critère 11 — fiche d’exercice : Écouter rend le focus au champ, on tape sans recliquer', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await gotoHash(page, 'lecon-fr-conj-etre-present'); // fiche en saisie, mono-mode

	const champ = page.locator('#sheets input.ans').first();
	await champ.waitFor();
	await champ.click();
	await expect(champ).toBeFocused();

	await page.locator('.consigne-tts').first().click();
	await expect(champ).toBeFocused(); // le focus est REVENU au champ, pas resté sur le bouton

	await page.keyboard.type('suis'); // sans recliquer dans le champ
	await expect(champ).toHaveValue('suis');

	expect(errors).toEqual([]);
});

test('critère 11 — problème (une étape) : Écouter rend le focus au champ, on tape sans recliquer', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await gotoHash(page, 'lecon-math-prob-composition'); // mono-mode, toujours 1 sous-question

	const champ = page.locator('.prob-input').first();
	await champ.waitFor();
	await expect(page.locator('.prob-input')).toHaveCount(1);
	await champ.click();
	await expect(champ).toBeFocused();

	await page.locator('.consigne-tts').first().click();
	await expect(champ).toBeFocused();

	await page.keyboard.type('12');
	await expect(champ).toHaveValue('12');

	expect(errors).toEqual([]);
});

test('critère 11 — révision espacée : Écouter rend le focus au champ, on tape sans recliquer', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await page.addInitScript(seedDueLesson('num-valeur-position'));
	await gotoHash(page, 'revision-espacee');

	const champ = page.locator('#revInput');
	await champ.waitFor();
	await champ.click();
	await expect(champ).toBeFocused();

	await page.locator('.consigne-tts').first().click();
	await expect(champ).toBeFocused();

	await page.keyboard.type('5');
	await expect(champ).toHaveValue('5');

	expect(errors).toEqual([]);
});

/* ---------------------------------------------------------------
   Critère 12 — écran à PLUSIEURS champs : le champ où l'enfant ÉTAIT reprend
   la main, pas le premier de la page. `math-prob-deux-etapes` (#702) rend
   TOUJOURS deux `.prob-input` (genDeuxEtapes ne tire jamais un problème à une
   seule étape) : on se place explicitement sur le SECOND avant de cliquer.
   --------------------------------------------------------------- */

test('critère 12 — écran à plusieurs champs : Écouter rend le focus au champ où l’enfant ÉTAIT, pas au premier', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await gotoHash(page, 'lecon-math-prob-deux-etapes'); // mono-mode, toujours 2 sous-questions

	const champs = page.locator('.prob-input');
	await expect(champs).toHaveCount(2);
	const premier = champs.nth(0);
	const second = champs.nth(1);

	await second.click();
	await expect(second).toBeFocused();

	// Un seul bouton Écouter sur cet écran (sur l'énoncé global, pas par étape).
	await expect(page.locator('.consigne-tts')).toHaveCount(1);
	await page.locator('.consigne-tts').click();

	// C'est le SECOND champ qui reprend la main — pas le premier.
	await expect(second).toBeFocused();
	await expect(premier).not.toBeFocused();

	await page.keyboard.type('7');
	await expect(second).toHaveValue('7');
	await expect(premier).toHaveValue(''); // la frappe n'a pas atterri ailleurs

	expect(errors).toEqual([]);
});

/* ---------------------------------------------------------------
   Critère 13 (négatif) — pas de cible devinée.
   --------------------------------------------------------------- */

test('critère 13 (négatif) — écran sans champ de saisie (QCM) : le focus reste sur le bouton Écouter', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await gotoHash(page, 'lecon-fr-vocab-sens'); // QCM mono-mode, aucun champ texte

	await expect(page.locator('#sheets input, #sheets .sprint-stage input')).toHaveCount(0);
	const btn = page.locator('.consigne-tts').first();
	await btn.waitFor();

	await btn.click();
	await expect(btn).toBeFocused(); // aucune cible à deviner : le focus reste sur le bouton

	expect(errors).toEqual([]);
});

test('critère 13 (négatif) — écran à saisie mais AUCUN champ focus au clic : le focus reste sur le bouton Écouter', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await gotoHash(page, 'lecon-fr-conj-etre-present'); // fiche en saisie, focus initial posé au chargement

	const champ = page.locator('#sheets input.ans').first();
	await champ.waitFor();
	// Neutralise le focus initial (posé par la fiche au chargement, #42) : on simule un
	// enfant qui n'a encore RIEN touché — sinon ce cas serait indiscernable du critère 11.
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await expect(champ).not.toBeFocused();

	const btn = page.locator('.consigne-tts').first();
	await btn.click();

	// On n'invente pas de cible : ni le premier champ, ni aucun autre — le bouton la garde.
	await expect(btn).toBeFocused();
	await expect(champ).not.toBeFocused();

	expect(errors).toEqual([]);
});

/* ---------------------------------------------------------------
   Critère 14 (négatif) — activation CLAVIER : le focus ne bouge pas.
   Atteint au Tab (jamais `.focus()` ni `.click()`) puis activé par
   Enter/Espace (page.keyboard.press) — une vraie activation native, distincte
   d'un clic souris simulé (MouseEvent.detail === 0 côté implémentation).
   --------------------------------------------------------------- */

test('critère 14 (négatif) — activer Écouter au clavier (Tab puis Enter/Espace) ne déplace pas le focus, réactivable', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await gotoHash(page, 'lecon-fr-vocab-sens'); // QCM mono-mode : pas d'option `exclusif`

	const btn = page.locator('.consigne-tts').first();
	await btn.waitFor();

	// Atteint le bouton AU CLAVIER : Tab répété jusqu'à ce qu'il devienne l'élément actif
	// (plafond de sécurité — la position exacte dans l'ordre de tabulation n'est pas figée).
	let trouve = false;
	for (let i = 0; i < 40 && !trouve; i++) {
		await page.keyboard.press('Tab');
		trouve = await btn.evaluate((el) => el === document.activeElement);
	}
	expect(trouve, 'le bouton Écouter doit être atteignable au clavier (Tab)').toBe(true);

	await page.keyboard.press('Enter');
	expect(await nbAppelsSpeak(page)).toBe(1); // l'activation a bien déclenché la lecture
	await expect(btn).toBeFocused(); // et le focus est resté sur le bouton

	await page.keyboard.press('Space');
	expect(await nbAppelsSpeak(page)).toBe(2); // réactivable au clavier
	await expect(btn).toBeFocused();

	expect(errors).toEqual([]);
});
