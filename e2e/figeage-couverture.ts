/* ============================================================
   Table de couverture du FIGEAGE post-réponse (#543), par RUNNER.

   Après une réponse, le widget reste visible (l'enfant compare sa tentative avec la
   solution) mais ne doit plus être manipulable. Deux chemins y mènent : « Vérifier » /
   « Valider », et « Je ne sais pas, montre-moi ». Le risque que cette table garde : un
   runner figé à moitié sur l'un des deux chemins (Tab qui s'arrête dans une zone morte,
   tuile qu'on déplace encore sur une question terminée).

   Clé = MODULE du runner qui emprunte le chemin de révélation (`revelerSolution(` pour
   les runners de leçon, `figerScene` côté révision), nom de fichier sans extension.
   Elle sert de source unique à deux vérifications :

   - `tests/figeage-couverture-gate.test.ts` (Vitest) — le GATE : un runner qui révèle sans
     être déclaré ici fait échouer `npm test` (critère 5 de #543).
   - `e2e/figeage.spec.ts` (Playwright) — la PREUVE PAR L'USAGE : chaque entrée est
     jouée par les DEUX chemins (`verifier`, `passer`) et le figeage est mesuré.

   Le QCM de leçon (`lecon-qcm`) est DANS le périmètre (décision du mainteneur, commentaire
   daté de #543) bien qu'il n'ait pas de lien « Je ne sais pas » : son entrée porte
   `sansRevelation` (la raison, écrite) et n'est jouée que par le chemin `verifier`.

   CONTRAINTE D'IMPORT (comme `journal-couverture.ts`) : ce fichier est importé par un test
   VITEST, donc rien de `@playwright/test` à l'exécution (`import type` seulement) ni
   d'`expect` : les gestes n'emploient que des méthodes de `Page`/`Locator`.
   ============================================================ */
import type { Page } from '@playwright/test';
import type { SchoolLevel } from '../src/core/catalog';
import { gotoHash, seedAideVue, seedAideVueScript } from './helpers';

export interface EntreeFigeage {
	titre: string;
	/** Écran où se joue l'entrée : détermine la scène, la zone d'après-verdict et les ids. */
	ecran: 'lecon' | 'revision';
	/** Leçon du catalogue sur laquelle l'entrée s'appuie (confrontée au catalogue par le gate). */
	source: { lecon: string; mode?: string; niveau?: SchoolLevel };
	/** Le geste, en français : ce que fait l'enfant avant de valider. */
	geste: string;
	/** Amorçage AVANT navigation (`addInitScript` uniquement, jamais de `goto`). */
	amorce?: (page: Page) => Promise<void>;
	/** Navigue jusqu'à la question affichée, sans rien y toucher. */
	ouvrir: (page: Page) => Promise<void>;
	/** Amène le widget jusqu'à un bouton de validation CLIQUABLE (réponse non cherchée
	 *  juste : seul le geste complet compte). Pour un format sans bouton (QCM de la
	 *  révision), ce geste ENGAGE la réponse lui-même (`valider: null`). */
	completer: (page: Page) => Promise<void>;
	/** Sélecteur du bouton « Vérifier » / « Valider », `null` s'il n'y en a pas. */
	valider: string | null;
	/** Raison écrite pour laquelle l'entrée n'est jouée que par le chemin `verifier` (pas de
	 *  lien « Je ne sais pas » sur ce runner). Absent = les deux chemins sont joués. */
	sansRevelation?: string;
	/** Widget à glisser-déposer : une tuile et sa cible, pour tenter un dépôt après figeage. */
	glisser?: { source: string; cible: string };
}

export const COUVERTURE_FIGEAGE: Record<string, EntreeFigeage[]> = {
	/* ----- runners de leçon (`src/ui/lecon-*.ts` qui appellent `revelerSolution(`) ----- */

	'lecon-tuiles': [
		{
			titre: 'tuiles (comparer)',
			ecran: 'lecon',
			source: { lecon: 'num-comparer', mode: 'tuiles' },
			geste: 'poser une tuile dans la case',
			ouvrir: async (page) => {
				await ouvrirMode(page, 'num-comparer', 'tuiles');
				await page.locator('#ltuiSlot').waitFor();
			},
			completer: async (page) => {
				await page.locator('.ltui-tuile').first().click();
				await page.locator('#ltuiVerif:not([disabled])').waitFor();
			},
			valider: '#ltuiVerif',
			glisser: { source: '.ltui-tuile', cible: '#ltuiSlot' },
		},
	],

	'lecon-ordre': [
		{
			titre: 'ranger une suite (nombres)',
			ecran: 'lecon',
			source: { lecon: 'num-ranger', mode: 'tuiles' },
			geste: 'poser toutes les tuiles dans l’ordre où elles viennent',
			ouvrir: async (page) => {
				await ouvrirLecon(page, 'num-ranger');
				await page.locator('.lord-tuile').first().waitFor();
			},
			completer: async (page) => {
				await viderBac(page, '.lord-tuile');
				await page.locator('#lordVerif:not([disabled])').waitFor();
			},
			valider: '#lordVerif',
			glisser: { source: '.lord-tuile', cible: '.lord-cell' },
		},
	],

	'lecon-tri': [
		{
			titre: 'trier par thème',
			ecran: 'lecon',
			source: { lecon: 'fr-vocab-champs-tri', mode: 'tri' },
			geste: 'ranger tous les mots dans la première colonne',
			ouvrir: async (page) => {
				await ouvrirLecon(page, 'fr-vocab-champs-tri');
				await page.locator('.ltri-tuile').first().waitFor();
			},
			completer: async (page) => {
				await classerToutDansPremiereColonne(page);
				await page.locator('#ltriVerif:not([disabled])').waitFor();
			},
			valider: '#ltriVerif',
			glisser: { source: '.ltri-tuile', cible: '.ltri-col' },
		},
	],

	'lecon-appariement': [
		{
			titre: 'relier des paires (familles de mots)',
			ecran: 'lecon',
			source: { lecon: 'fr-vocab-familles-relier', mode: 'relier' },
			geste: 'relier le i-ème mot de gauche au i-ème mot de droite',
			ouvrir: async (page) => {
				await ouvrirLecon(page, 'fr-vocab-familles-relier');
				await page.locator('.lapp-mot').first().waitFor();
			},
			completer: async (page) => {
				await relierEnDiagonale(page);
				await page.locator('#lappVerif:not([disabled])').waitFor();
			},
			valider: '#lappVerif',
		},
	],

	'lecon-clic-mot': [
		{
			titre: 'cliquer sur le mot (les verbes)',
			ecran: 'lecon',
			source: { lecon: 'fr-gram-clic-verbe', mode: 'clic' },
			geste: 'cliquer sur le premier mot de la phrase',
			ouvrir: async (page) => {
				await ouvrirLecon(page, 'fr-gram-clic-verbe');
				await page.locator('.lclic-mot').first().waitFor();
			},
			completer: async (page) => {
				await page.locator('.lclic-mot').first().click();
				await page.locator('#lclicVerif:not([disabled])').waitFor();
			},
			valider: '#lclicVerif',
		},
		{
			// Binder `segment-mot` (#716) : sa propre mécanique de figeage, donc sa propre entrée.
			titre: 'délimiter le groupe nominal (deux bornes)',
			ecran: 'lecon',
			source: { lecon: 'fr-gram-groupe-nominal', mode: 'segment', niveau: 'cm1' },
			geste: 'poser les bornes sur le premier et le dernier mot de la phrase',
			amorce: async (page) => {
				await page.addInitScript(SEED_CM1);
			},
			ouvrir: async (page) => {
				await ouvrirLecon(page, 'fr-gram-groupe-nominal');
				await page.locator('.lseg-mot').first().waitFor();
			},
			completer: async (page) => {
				const mots = page.locator('.lseg-mot');
				await mots.first().click();
				await mots.last().click();
				await page.locator('#lclicVerif:not([disabled])').waitFor();
			},
			valider: '#lclicVerif',
		},
	],

	'lecon-qcm': [
		{
			titre: 'QCM (le mot juste)',
			ecran: 'lecon',
			source: { lecon: 'fr-vocab-champs-mots', mode: 'qcm' },
			geste: 'choisir la première proposition (le clic engage la réponse, pas de « Vérifier »)',
			sansRevelation: 'valide au clic sur un choix, pas de lien Je ne sais pas',
			ouvrir: async (page) => {
				await ouvrirLecon(page, 'fr-vocab-champs-mots');
				await page.locator('#lqcmChoices .sprint-choice').first().waitFor();
			},
			completer: async (page) => {
				await page.locator('#lqcmChoices .sprint-choice').first().click();
			},
			valider: null,
		},
	],

	'lecon-qcm-multi': [
		{
			titre: 'QCM multi (cocher les propriétés)',
			ecran: 'lecon',
			source: { lecon: 'geo-cm1-figures-proprietes', mode: 'coche', niveau: 'cm1' },
			geste: 'cocher les 4 propositions',
			amorce: async (page) => {
				await page.addInitScript(SEED_CM1);
			},
			ouvrir: async (page) => {
				await ouvrirMode(page, 'geo-cm1-figures-proprietes', 'coche');
				await page.locator('.lqcm-multi-choice').first().waitFor();
			},
			completer: async (page) => {
				const choix = page.locator('.lqcm-multi-choice');
				const n = await choix.count();
				for (let i = 0; i < n; i++) await choix.nth(i).click();
				await page.locator('#lqmValider:not([disabled])').waitFor();
			},
			valider: '#lqmValider',
		},
	],

	'lecon-droite-graduee': [
		{
			titre: 'droite graduée (placer un entier)',
			ecran: 'lecon',
			source: { lecon: 'num-droite-entiers', mode: 'placer' },
			geste: 'poser le repère sur la première graduation',
			ouvrir: async (page) => {
				await ouvrirLecon(page, 'num-droite-entiers');
				await page.locator('.dg-interactif').waitFor();
			},
			completer: async (page) => {
				await page.locator('.dg-hit').first().click();
				await page.locator('#dgVerify:not([disabled])').waitFor();
			},
			valider: '#dgVerify',
		},
	],

	'lecon-probleme': [
		{
			titre: 'résolution de problème (composition)',
			ecran: 'lecon',
			source: { lecon: 'math-prob-composition' },
			geste: 'écrire 1 dans chaque case-réponse',
			ouvrir: async (page) => {
				await ouvrirLecon(page, 'math-prob-composition');
				await page.locator('.prob-enonce').waitFor();
			},
			completer: async (page) => {
				const champs = page.locator('.prob-input');
				const n = await champs.count();
				for (let i = 0; i < n; i++) await champs.nth(i).fill('1');
			},
			valider: '#probVerif',
		},
	],

	'lecon-tableau': [
		{
			titre: 'tableau de conversion (longueurs)',
			ecran: 'lecon',
			source: { lecon: 'mes-longueurs', mode: 'tableau' },
			geste: 'remplir toutes les cases au pavé',
			ouvrir: async (page) => {
				await ouvrirMode(page, 'mes-longueurs', 'tableau');
				await page.locator('#tcTable').waitFor();
			},
			completer: async (page) => {
				const n = await page.locator('.tc-cell').count();
				for (let i = 0; i < n; i++) {
					const bon = await page.locator(`.tc-cell[data-i="${i}"]`).getAttribute('data-answer');
					await page.locator(`.tc-pave-btn[data-chiffre="${bon}"]`).click();
				}
				await page.locator('#tcVerif:not([disabled])').waitFor();
			},
			valider: '#tcVerif',
		},
	],

	/* ----- révision (`src/ui/revision.ts`) ----- */

	// Une entrée par FAMILLE de widget que la révision rejoue. Hors table, et pourquoi :
	// le tableau de conversion n'y est pas atteignable (aucun `kind` de tableau dans
	// `RevItem` : ses leçons retombent en saisie libre, sans widget à figer) ; le
	// problème et le binder `segment-mot` y sont montés mais ne gagnent rien de plus ici
	// que leurs entrées de leçon (même fonction de figeage, même zone d'après-verdict).
	revision: [
		{
			titre: 'révision : tuiles (comparer)',
			ecran: 'revision',
			source: { lecon: 'num-comparer', mode: 'tuiles' },
			geste: 'poser une tuile dans la case',
			amorce: amorceRevision('num-comparer'),
			ouvrir: ouvrirRevision('#ltuiSlot'),
			completer: async (page) => {
				await page.locator('#revStage .tuile').first().click();
				await page.locator('#revValidate:not([disabled])').waitFor();
			},
			valider: '#revValidate',
			glisser: { source: '#revStage .tuile', cible: '#ltuiSlot' },
		},
		{
			titre: 'révision : trier par thème (widget à glisser)',
			ecran: 'revision',
			source: { lecon: 'fr-vocab-champs-tri', mode: 'tri' },
			geste: 'ranger tous les mots dans la première colonne',
			amorce: amorceRevision('fr-vocab-champs-tri'),
			ouvrir: ouvrirRevision('.ltri-tuile'),
			completer: async (page) => {
				await classerToutDansPremiereColonne(page);
				await page.locator('#revValidate:not([disabled])').waitFor();
			},
			valider: '#revValidate',
			glisser: { source: '.ltri-tuile', cible: '.ltri-col' },
		},
		{
			titre: 'révision : relier des paires',
			ecran: 'revision',
			source: { lecon: 'fr-vocab-familles-relier', mode: 'relier' },
			geste: 'relier le i-ème mot de gauche au i-ème mot de droite',
			amorce: amorceRevision('fr-vocab-familles-relier'),
			ouvrir: ouvrirRevision('.lapp-mot'),
			completer: async (page) => {
				await relierEnDiagonale(page);
				await page.locator('#revValidate:not([disabled])').waitFor();
			},
			valider: '#revValidate',
		},
		{
			titre: 'révision : cliquer sur le mot',
			ecran: 'revision',
			source: { lecon: 'fr-gram-clic-verbe', mode: 'clic' },
			geste: 'cliquer sur le premier mot de la phrase',
			amorce: amorceRevision('fr-gram-clic-verbe'),
			ouvrir: ouvrirRevision('.lclic-mot'),
			completer: async (page) => {
				await page.locator('.lclic-mot').first().click();
				await page.locator('#revValidate:not([disabled])').waitFor();
			},
			valider: '#revValidate',
		},
		{
			// Format figé par #503 (la question reste à l'écran) : champ TEXTE → lecture seule
			// et hors Tab, jamais `disabled` (critère 10 : la réponse tapée reste à plein contraste).
			titre: 'révision : saisie (champ texte)',
			ecran: 'revision',
			source: { lecon: 'num-valeur-position' },
			geste: 'taper une réponse dans le champ',
			amorce: amorceRevision('num-valeur-position'),
			ouvrir: ouvrirRevision('#revInput'),
			completer: async (page) => {
				await page.locator('#revInput').fill('999999');
				await page.locator('#revValidate:not([disabled])').waitFor();
			},
			valider: '#revValidate',
		},
		{
			titre: 'révision : opération posée',
			ecran: 'revision',
			source: { lecon: 'calc-addition-posee' },
			geste: 'écrire 1 dans chaque case-réponse de la grille',
			amorce: amorceRevision('calc-addition-posee'),
			ouvrir: ouvrirRevision('.posee-input'),
			completer: async (page) => {
				const cases = page.locator('.posee-input');
				const n = await cases.count();
				for (let i = 0; i < n; i++) await cases.nth(i).fill('1');
				await page.locator('#revValidate:not([disabled])').waitFor();
			},
			valider: '#revValidate',
		},
		{
			titre: 'révision : QCM (le mot juste)',
			ecran: 'revision',
			source: { lecon: 'fr-vocab-champs-mots', mode: 'qcm' },
			geste: 'choisir la première proposition (le clic engage la réponse, pas de « Valider »)',
			amorce: amorceRevision('fr-vocab-champs-mots'),
			ouvrir: ouvrirRevision('.rev-choice'),
			completer: async (page) => {
				await page.locator('.rev-choice').first().click();
			},
			valider: null,
		},
	],
};

/** Les clés de la table : les runners que le gate (Vitest) confronte au code. */
export const CLES_FIGEAGE: string[] = Object.keys(COUVERTURE_FIGEAGE);

/* ------------------------------------------------------------------ */
/* Amorçages et gestes partagés                                         */
/* ------------------------------------------------------------------ */

/* Profil CM1 (les deux leçons à niveau CM1 de la table). */
const SEED_CM1 = `(() => {
  localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));
  localStorage.setItem('e2e/ludaskia_tour_seen', 'true');
  localStorage.setItem('e2e/ludaskia_parents_seen', 'true');
})();`;

const UUID_FIGEAGE = 'e2e-543';

/* Révision : une seule leçon DUE, donc toutes les questions de la séance sont du format
   visé. Le profil porte son niveau (sinon la popup de choix de classe bloque l'écran). */
function amorceRevision(lecon: string): (page: Page) => Promise<void> {
	return async (page) => {
		await page.addInitScript(`
      localStorage.setItem('ludaskia_profiles', ${JSON.stringify(
				JSON.stringify({
					list: [
						{ uuid: UUID_FIGEAGE, name: 'Test', emoji: '🦊', updatedAt: 1, niveauReference: 'ce2' },
					],
					active: UUID_FIGEAGE,
				}),
			)});
      localStorage.setItem('${UUID_FIGEAGE}/ludaskia_lessonRevision', JSON.stringify({
        '${lecon}': { palier: 0, prochaineRevision: 1, reussites: 0, dernierTest: null }
      }));
      ${seedAideVueScript(UUID_FIGEAGE)}
    `);
	};
}

function ouvrirRevision(signeDeRendu: string): (page: Page) => Promise<void> {
	return async (page) => {
		await gotoHash(page, 'revision-espacee');
		await page.locator(signeDeRendu).first().waitFor();
	};
}

/* Bulle d'aide au 1er lancement d'un runner : `seedAideVue` la neutralise pour les types
   qu'elle connaît, pas pour tous (droite graduée). On la ferme si elle est là. */
async function fermerAideSiPresente(page: Page): Promise<void> {
	const overlay = page.locator('#aideOverlay');
	if (await overlay.isVisible()) await page.locator('.aide-ok').click();
}

async function ouvrirMode(page: Page, lecon: string, mode: string): Promise<void> {
	await seedAideVue(page);
	await gotoHash(page, `mode-${lecon}`);
	await page.locator(`.mode-btn[data-mode="${mode}"]`).click();
	await fermerAideSiPresente(page);
}

async function ouvrirLecon(page: Page, lecon: string): Promise<void> {
	await seedAideVue(page);
	await gotoHash(page, `lecon-${lecon}`);
	await fermerAideSiPresente(page);
}

/* Pose toutes les tuiles d'un bac, l'une après l'autre : chaque clic en retire une du bac. */
async function viderBac(page: Page, tuile: string): Promise<void> {
	// Une tuile posée reste dans le bac, désactivée : on ne compte que les actives.
	const tuiles = page.locator(`${tuile}:enabled`);
	for (let reste = await tuiles.count(); reste > 0; reste--) await tuiles.first().click();
}

async function classerToutDansPremiereColonne(page: Page): Promise<void> {
	const tuiles = page.locator('.ltri-tuile');
	for (let reste = await tuiles.count(); reste > 0; reste--) {
		await tuiles.first().click();
		await page.locator('.ltri-col').first().locator('.ltri-col-titre').click();
	}
}

async function relierEnDiagonale(page: Page): Promise<void> {
	const gauche = page.locator('.lapp-mot[data-side="g"]');
	const droite = page.locator('.lapp-mot[data-side="d"]');
	const n = await gauche.count();
	for (let i = 0; i < n; i++) {
		await gauche.nth(i).click();
		await droite.nth(i).click();
	}
}
