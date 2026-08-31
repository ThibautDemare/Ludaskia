/* ============================================================
   Accessibilité (#42) : confort de lecture + réglages de lecture vocale.
   Le BOUTON « Écouter » dépend d'une voix FR de l'appareil — absente en
   Chromium headless (dicteeDisponible() faux → pas de bouton). On teste donc
   le déterministe : le confort de lecture (classe + espacement, persistance) et
   le bloc Préférences (réglage auto + statut de la lecture vocale).
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue, seedAideVueScript } from './helpers';

/* Simule une voix FR locale, pour faire apparaître le(s) bouton(s) « Écouter »
   (dicteeDisponible() faux par défaut sous Chromium headless, cf. en-tête). On
   ne clique jamais dessus dans les tests ci-dessous (lectureConsigneAuto est
   désactivée par défaut) : seul getVoices() est nécessaire, mais on garde
   speak()/SpeechSynthesisUtterance en no-op par défense, comme les autres
   specs qui stubbent la voix (ortho-atelier-ecouter.spec.ts,
   revision-ortho.spec.ts, sprint-ecouter.spec.ts). Doit être posé AVANT la
   navigation (addInitScript s'exécute avant les scripts de la page). */
function stubVoixFr(): string {
	return `(() => {
		const voix = {
			lang: 'fr-FR',
			name: 'Voix FR de test',
			localService: true,
			default: true,
			voiceURI: 'e2e-voix-fr',
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

test('Confort de lecture : classe, espacement et persistance', async ({ page }) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'profils');

	const toggle = page.locator('#prefConfort');
	await expect(toggle).toBeVisible();
	await expect(page.locator('html')).not.toHaveClass(/confort-lecture/);

	await toggle.check();
	await expect(page.locator('html')).toHaveClass(/confort-lecture/);
	// L'espacement inter-lettres devient non nul (Nunito gardée, juste aérée).
	const ls = await page
		.locator('body')
		.evaluate((el) => parseFloat(getComputedStyle(el).letterSpacing) || 0);
	expect(ls).toBeGreaterThan(0);

	// Réglage rangé dans la méta de profil → survit au rechargement.
	await gotoHash(page, 'profils');
	await expect(page.locator('html')).toHaveClass(/confort-lecture/);
	await expect(page.locator('#prefConfort')).toBeChecked();

	expect(errors).toEqual([]);
});

test('Consigne de conjugaison : nomme la tâche, et le texte lu est une phrase', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-conj-etre-present'); // fiche en saisie
	const consigne = page.locator('.consigne-line').first();
	await consigne.waitFor();
	// Affichage : la consigne nomme le verbe à conjuguer et le temps (plus de
	// « Écris la forme correcte. » générique).
	await expect(consigne).toContainText('Conjugue');
	await expect(consigne).toContainText('présent');
	// Texte lu (dissociation #42) : présent dans l'attribut data-tts (indépendant de
	// la disponibilité d'une voix), et c'est une vraie phrase (pas le `@` télégraphique).
	const lu = await consigne.getAttribute('data-tts');
	expect(lu).toBeTruthy();
	expect(lu).toContain('Conjugue');
	expect(lu).not.toContain('@');
	expect(errors).toEqual([]);
});

test('Champs de conjugaison : chaque saisie a un nom accessible, et ils diffèrent', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await gotoHash(page, 'lecon-fr-conj-etre-present');
	const champs = page.locator('#sheets input.ans');
	await champs.first().waitFor();

	// Sans nom accessible, un lecteur d'écran annonçait six fois « zone de saisie »
	// sans dire de quelle personne il s'agissait (#577, axe : règle `label`, critical).
	const noms = await champs.evaluateAll((els) =>
		els.map((el) => el.getAttribute('aria-label') ?? ''),
	);
	expect(noms.length).toBeGreaterThanOrEqual(6);
	for (const nom of noms) expect(nom).toContain('Conjugue');

	// Et surtout : ils se DISTINGUENT. Six noms identiques satisferaient axe sans rien
	// résoudre — c'est le pronom qui manquait, pas l'attribut.
	expect(new Set(noms.slice(0, 6)).size).toBe(6);
	expect(errors).toEqual([]);
});

/* ============================================================
   #470 — « Clique sur le mot » greffe DEUX boutons « Écouter » (la consigne
   d'action ET la phrase entière). Avant le correctif, `fabriquerBouton`
   codait en dur le même aria-label/title pour tout bouton généré : deux
   boutons consécutifs au Tab, même nom accessible, deux textes lus
   différents (WCAG 2.4.6 / 4.1.2). `bindConsigneTts` lit désormais
   `data-tts-label` (posé par `bindClicMot`, ui/clic-mot-interaction.ts, sur
   la zone de phrase) pour distinguer les deux, avec repli sur « Écouter la
   consigne » par défaut. Le widget étant mutualisé, on éprouve les DEUX
   chemins qui le montent : la leçon (ui/lecon-clic-mot.ts) et la révision
   (ui/revision.ts, renderClicMot).
   ============================================================ */

test('« Clique sur le mot » (leçon) : deux boutons Écouter, jamais un 3e, noms accessibles distincts — critères 3 et 6', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await seedAideVue(page); // écarte l'auto-aide (#435), sans intérêt pour ce test
	await gotoHash(page, 'lecon-fr-gram-clic-verbe'); // mono-mode → lancement direct

	const boutons = page.locator('.consigne-tts');
	await boutons.first().waitFor();
	// Critère 6 : aucun bouton Écouter surnuméraire — toujours exactement deux
	// (consigne d'action + phrase entière), jamais un troisième empilé au-dessus.
	await expect(boutons).toHaveCount(2);

	// Critère 3 : deux noms accessibles DIFFÉRENTS — chacun retrouvable par son
	// propre nom, exact (un match par substring confondrait les deux : « Écouter »
	// est commun aux deux libellés).
	await expect(page.getByRole('button', { name: 'Écouter la consigne', exact: true })).toHaveCount(
		1,
	);
	await expect(page.getByRole('button', { name: 'Écouter la phrase', exact: true })).toHaveCount(1);

	expect(errors).toEqual([]);
});

const UUID_CLICMOT = 'e2e-470-clicmot';

/* Amorce un profil dédié avec une leçon « clique sur le mot » DUE, pour rejouer
   la même vérification en révision (cf. revision.spec.ts, seedDueLesson). */
function seedDueClicMot(): string {
	return `
    localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
			JSON.stringify({
				list: [{ uuid: UUID_CLICMOT, name: 'Test', emoji: '🦊', updatedAt: 1 }],
				active: UUID_CLICMOT,
			}),
		)});
    localStorage.setItem('${UUID_CLICMOT}/ludaskia_lessonRevision', JSON.stringify({
      'fr-gram-clic-verbe': { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
    }));
    ${seedAideVueScript(UUID_CLICMOT)}
  `;
}

test('« Clique sur le mot » (révision) : deux boutons Écouter, jamais un 3e, noms accessibles distincts — critères 3 et 6', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await page.addInitScript(seedDueClicMot());
	await gotoHash(page, 'revision-espacee');

	const boutons = page.locator('.consigne-tts');
	await boutons.first().waitFor();
	await expect(boutons).toHaveCount(2); // critère 6, même garde-fou qu'en leçon

	await expect(page.getByRole('button', { name: 'Écouter la consigne', exact: true })).toHaveCount(
		1,
	);
	await expect(page.getByRole('button', { name: 'Écouter la phrase', exact: true })).toHaveCount(1);

	expect(errors).toEqual([]);
});

/* Critère 5 (négatif) : le comportement PAR DÉFAUT ne change pas. Un écran à
   consigne simple (un seul `data-tts`, sans `data-tts-label`) doit toujours
   produire un unique bouton nommé « Écouter la consigne » — c'est le test qui
   rougit si quelqu'un renomme le libellé par défaut ou le rend conditionnel. */
test('Comportement par défaut inchangé : un écran à un seul bouton Écouter reste « Écouter la consigne » — critère 5', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await gotoHash(page, 'lecon-fr-conj-etre-present'); // fiche en saisie, un seul data-tts

	const boutons = page.locator('.consigne-tts');
	await boutons.first().waitFor();
	await expect(boutons).toHaveCount(1);
	await expect(boutons.first()).toHaveAttribute('aria-label', 'Écouter la consigne');
	await expect(page.getByRole('button', { name: 'Écouter la consigne', exact: true })).toHaveCount(
		1,
	);

	expect(errors).toEqual([]);
});

test('Aménagements (espace encadrants) : lecture auto + statut de la lecture vocale', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// La lecture auto des consignes est devenue un aménagement posé par l'adulte (#234),
	// réglable dans l'onglet Réglages (#459).
	await gotoHash(page, 'encadrant/reglages');

	await expect(
		page.locator('[data-act="set-amenagement"][data-pref="lectureConsigneAuto"]'),
	).toHaveCount(1);
	// Le statut de la lecture vocale sur l'appareil est affiché.
	await expect(page.getByText(/Lecture vocale/)).toBeVisible();

	expect(errors).toEqual([]);
});
