/* ============================================================
   Table de couverture du journal d'erreurs (#581), par FORMAT d'exercice.

   « Pas de correction sans sa capture » (#391) : tout chemin qui corrige une réponse
   d'enfant doit alimenter le journal de l'espace encadrant. Le gate statique (#580,
   `tests/erreurs-journal-gate.test.ts`) vérifie qu'un module correctif IMPORTE
   `capterErreur` ; il ne dit rien de ce qui se passe à l'exécution. Cette table dit,
   pour CHAQUE format déclaré dans `src/core/exercise.ts`, quelle leçon et quel geste
   produisent une erreur, et sert de source unique à deux vérifications :

   - `tests/journal-couverture.test.ts` (Vitest, quelques millisecondes) — le GATE :
     un format sans entrée fait échouer `npm test`, et chaque entrée est confrontée au
     catalogue réel (la leçon existe, le mode est déclaré, et elle produit bien CE
     format).
   - `e2e/journal-couverture.spec.ts` (Playwright) — la PREUVE PAR L'USAGE : chaque
     entrée est jouée dans un navigateur, l'erreur est produite par une vraie
     interaction (jamais par un seed direct du journal : c'est le code de capture
     qu'on verrouille), et on vérifie qu'elle remonte côté encadrant.

   CONTRAINTE D'IMPORT à respecter : ce fichier est importé par un test VITEST, donc
   il ne doit rien importer de `@playwright/test` À L'EXÉCUTION — `Page`/`Locator`
   n'entrent qu'en `import type` (effacé à la compilation). Corollaire pour les gestes :
   pas d'`expect` ici, seulement des méthodes de `Page`/`Locator` (`waitFor`, `click`,
   `fill`…). Les assertions vivent dans la spec.
   ============================================================ */
import type { Locator, Page } from '@playwright/test';
import type { Exercise } from '../src/core/exercise';
import type { SchoolLevel } from '../src/core/catalog';
import type { ModeOrtho } from '../src/core/orthographe/types';
import { gotoHash, seedAideVue } from './helpers';

/* ------------------------------------------------------------------ */
/* Types de la table                                                    */
/* ------------------------------------------------------------------ */

/** D'où vient l'exercice joué. Deux origines RÉELLEMENT différentes, et le gate ne
 *  peut pas les vérifier pareil : une leçon du catalogue a une `LessonDef` (donc un
 *  id, des modes et des niveaux confrontables), une liste d'orthographe n'en a pas —
 *  l'atelier (`ui/ortho-runner.ts`) travaille des MOTS, pas des leçons. */
export type SourceExercice =
	| { origine: 'catalogue'; lecon: string; mode?: string; niveau?: SchoolLevel }
	| { origine: 'ortho'; liste: string; modeOrtho: ModeOrtho };

export interface EntreeCouverture {
	/** Titre du test e2e engendré. */
	titre: string;
	/** Le geste, en français : ce que fait l'enfant pour produire une erreur. Sert la
	 *  lecture humaine de la table — le code qui le joue est `jouer`. */
	geste: string;
	source: SourceExercice;
	/** Amorçage AVANT navigation (profil CM1, liste d'orthographe seedée, voix
	 *  stubbée…) : `addInitScript` uniquement, jamais de `goto`. */
	amorce?: (page: Page) => Promise<void>;
	/** Joue le geste, navigation comprise, jusqu'à la correction fausse. */
	jouer: (page: Page) => Promise<void>;
	/** Vérification SUPPLÉMENTAIRE sur la carte-leçon du journal, quand le format a
	 *  une promesse propre (une opération posée remonte comme UNE entrée, une paire
	 *  mal reliée s'écrit « gauche → droite »…). Le round-trip commun est déjà
	 *  assuré par la spec. */
	verifie?: (carte: Locator) => Promise<void>;
}

/** Un format couvert porte au moins une entrée ; un format non couvert porte une
 *  raison ÉCRITE. L'allow-list est vide aujourd'hui, et c'est voulu : chaque format
 *  déclaré est joignable dans un navigateur. Elle existe pour que la prochaine
 *  exception s'écrive et se relise, pas pour que le gate s'affaisse en silence. */
export type CouvertureFormat =
	{ couvert: true; entrees: EntreeCouverture[] } | { couvert: false; raison: string };

/* ------------------------------------------------------------------ */
/* Amorçages et petits gestes partagés                                  */
/* ------------------------------------------------------------------ */

/* Pas de verrou PIN hérité d'un test précédent (l'espace encadrant est la
   destination de CHAQUE entrée de cette table). */
export const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Profil CM1 : deux formats ne sont servis qu'à ce niveau (« Coche les bonnes
   propriétés », droite graduée décimale). */
const SEED_CM1 = `(() => {
  localStorage.setItem('ludaskia_profiles', JSON.stringify({ list: [{ uuid: 'e2e', name: 'E2E', emoji: '\\uD83E\\uDD8A', updatedAt: 1, niveauReference: 'cm1' }], active: 'e2e' }));
  localStorage.setItem('e2e/ludaskia_tour_seen', 'true');
  localStorage.setItem('e2e/ludaskia_parents_seen', 'true');
})();`;

/* Liste d'orthographe à deux mots, DÉCOUVERTE (`atelierFait: true`) et rien de
   validé : les trois modes de l'atelier (tuiles, mot caché, dictée) sont donc
   proposés d'emblée par l'écran de choix. */
const ORTHO_SEED = {
	banque: {
		w1: {
			id: 'w1',
			mot: 'bonjour',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
		w2: {
			id: 'w2',
			mot: 'alors',
			entourage: [],
			atelierFait: true,
			validation: { motCache: false, tuiles: false, dictee: false },
			revision: { palier: 0, prochaineRevision: null, reussites: 0, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{ id: 'l-e2e-journal', label: 'Journal e2e', motIds: ['w1', 'w2'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { bonjour: 'w1', alors: 'w2' },
};

/* Voix FR locale simulée : Chromium headless n'en expose aucune, donc le mode
   « dictée » n'apparaît même pas (`dicteeDisponible()`, ui/tts.ts). Même piège
   `SpeechSynthesisUtterance` que `ortho-atelier-ecouter.spec.ts` et
   `ortho-dictee-muette.spec.ts` : affecter un objet JS ordinaire à `.voice` sur le
   VRAI constructeur lève une erreur WebIDL, d'où l'utterance factice.
   Exportée : plusieurs specs orthographe en ont besoin (pas seulement cette table). */
export const STUB_VOIX_FR = `(() => {
  const voix = { lang: 'fr-FR', name: 'Voix FR de test', localService: true, default: true, voiceURI: 'e2e-voix-fr' };
  class FakeUtterance {
    constructor(text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; }
    addEventListener() {}
  }
  window.SpeechSynthesisUtterance = FakeUtterance;
  window.speechSynthesis.getVoices = () => [voix];
  window.speechSynthesis.speak = () => {};
})();`;

/* Pendant de STUB_VOIX_FR : force l'ABSENCE de voix française, quel que soit
   l'hôte qui exécute la suite. Chromium headless sous Linux (CI) n'expose déjà
   aucune voix par défaut, mais Chromium expose les voix SAPI du système sous
   Windows — souvent françaises. Une spec qui compte sur « pas de voix » pour
   garder `dicteeDisponible()` fausse (modes ciblés sans dictée, écran de choix
   sans le 3e bouton…) devient alors dépendante de la machine qui l'exécute :
   verte en CI, rouge (ou fausse verte) en local. `getVoices` renvoie un tableau
   vide sans toucher au reste de l'API. */
export const STUB_SANS_VOIX = `(() => {
  if (typeof speechSynthesis === 'undefined') return;
  window.speechSynthesis.getVoices = () => [];
})();`;

async function amorcerOrtho(page: Page, avecVoix = false): Promise<void> {
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, ORTHO_SEED);
	if (avecVoix) await page.addInitScript(STUB_VOIX_FR);
}

/* Bulle d'aide au 1er lancement d'un runner : `seedAideVue` la neutralise pour les
   types qu'elle connaît, mais pas pour tous (droite graduée). On ferme donc
   l'overlay s'il est là — no-op sinon. */
async function fermerAideSiPresente(page: Page): Promise<void> {
	const overlay = page.locator('#aideOverlay');
	if (await overlay.isVisible()) await page.locator('.aide-ok').click();
}

/* Navigue vers l'écran de choix de mode d'une leçon et prend le mode demandé. */
async function ouvrirMode(page: Page, lecon: string, mode: string): Promise<void> {
	await seedAideVue(page);
	await gotoHash(page, `mode-${lecon}`);
	await page.locator(`.mode-btn[data-mode="${mode}"]`).click();
	await fermerAideSiPresente(page);
}

/* Lance une leçon mono-mode (ou son mode par défaut) sans passer par l'écran de choix. */
async function ouvrirLecon(page: Page, lecon: string): Promise<void> {
	await seedAideVue(page);
	await gotoHash(page, `lecon-${lecon}`);
	await fermerAideSiPresente(page);
}

/* Remplit chaque champ `.ans` d'une fiche avec un signe de comparaison FAUX. */
async function ficheComparerFausse(page: Page): Promise<void> {
	const champs = page.locator('#sheets input.ans');
	// `ouvrirLecon` retourne dès le clic envoyé, pas dès le rendu de la fiche (navigation
	// par hash asynchrone) : attendre le 1er champ AVANT le `.count()` one-shot, sinon il
	// lit 0 au hasard du timing de la machine (#511, e2e/README.md).
	await champs.first().waitFor();
	const n = await champs.count();
	for (let i = 0; i < n; i++) {
		const champ = champs.nth(i);
		const bon = await champ.getAttribute('data-answer');
		await champ.fill(bon === '<' ? '>' : '<');
	}
	await page.locator('#btnVerify').click();
	await page.locator('.mark.wrong').first().waitFor();
}

/* Rejoue des manches jusqu'à en rater une. Sert aux formats dont la bonne réponse
   n'est PAS exposée dans le DOM avant correction (voulu : anti-suggestion, a11y) —
   on ne peut donc pas se tromper à coup sûr du premier coup. `manche` joue et
   valide, `suivant` passe à la question suivante. */
async function jusquAUneErreur(
	page: Page,
	manche: (tour: number) => Promise<void>,
	suivant: Locator,
	maxTours = 5,
): Promise<void> {
	for (let tour = 0; tour < maxTours; tour++) {
		await manche(tour);
		await page.locator('.lqcm-ok, .lqcm-ko').first().waitFor();
		if (await page.locator('.lqcm-ko').first().isVisible()) return;
		await suivant.click();
	}
	throw new Error(
		`Aucune manche ratée en ${maxTours} tours : le geste ne produit plus d'erreur, ` +
			`la couverture de ce format ne prouve donc plus rien.`,
	);
}

/* ------------------------------------------------------------------ */
/* La table                                                             */
/* ------------------------------------------------------------------ */

/** Un couple (leçon, geste) par format déclaré dans `src/core/exercise.ts`. Le type
 *  `Record<Exercise['type'], …>` fait le premier gate, à la COMPILATION : ajouter un
 *  format à l'union sans l'inscrire ici casse `npm run typecheck`. Le test Vitest
 *  reprend la même vérification à l'exécution (message explicite, et `npm test` la
 *  signale même si l'on ne lance que lui) et y ajoute ce que le typage ne peut pas
 *  voir : que la leçon citée existe vraiment et produit bien ce format. */
export const COUVERTURE_JOURNAL: Record<Exercise['type'], CouvertureFormat> = {
	text: {
		couvert: true,
		entrees: [
			{
				titre: 'fiche en saisie (comparer)',
				geste: 'écrire le mauvais signe dans chaque champ de la fiche, puis Vérifier',
				source: { origine: 'catalogue', lecon: 'num-comparer', mode: 'saisie' },
				jouer: async (page) => {
					await ouvrirLecon(page, 'num-comparer');
					await ficheComparerFausse(page);
				},
			},
		],
	},

	qcm: {
		couvert: true,
		entrees: [
			{
				titre: 'QCM (le mot juste)',
				geste: 'choisir une proposition au hasard jusqu’à en rater une',
				source: { origine: 'catalogue', lecon: 'fr-vocab-champs-mots', mode: 'qcm' },
				jouer: async (page) => {
					await ouvrirLecon(page, 'fr-vocab-champs-mots');
					await page.locator('.sprint-choice').first().waitFor();
					await jusquAUneErreur(
						page,
						// Le rang du choix change à chaque tour : rester sur le 1er finirait
						// par tomber juste tous les tours si la bonne réponse s'y trouvait.
						async (tour) => {
							const choix = page.locator('#lqcmChoices .sprint-choice');
							await choix.nth(tour % (await choix.count())).click();
						},
						page.locator('#lqcmActions button'),
					);
				},
			},
		],
	},

	qcmMulti: {
		couvert: true,
		entrees: [
			{
				titre: 'QCM multi (cocher les propriétés)',
				geste:
					'cocher LES 4 propositions — le pool n’en contient jamais plus de 3 vraies, donc au moins une cochée est fausse',
				source: {
					origine: 'catalogue',
					lecon: 'geo-cm1-figures-proprietes',
					mode: 'coche',
					niveau: 'cm1',
				},
				amorce: async (page) => {
					await page.addInitScript(SEED_CM1);
				},
				jouer: async (page) => {
					await ouvrirMode(page, 'geo-cm1-figures-proprietes', 'coche');
					const choix = page.locator('.lqcm-multi-choice');
					// `ouvrirMode` retourne dès le clic envoyé, pas dès le rendu de la question
					// (navigation par hash asynchrone) : attendre le 1er choix AVANT le `.count()`
					// one-shot, sinon il lit 0 au hasard du timing de la machine (#511,
					// e2e/README.md) — DIAGNOSTIQUÉ : reproduit 100 % du temps aussi bien avec
					// qu'avec la voix stubbée absente, donc bien une lecture prématurée du test,
					// pas une course avec l'injection TTS (`bindItemTts`, ui/consigne-tts.ts, qui
					// est d'ailleurs entièrement synchrone).
					await choix.first().waitFor();
					const n = await choix.count();
					for (let i = 0; i < n; i++) await choix.nth(i).click();
					await page.locator('#lqmValider').click();
					await page.locator('.lqm-badge--revoir').waitFor();
				},
			},
		],
	},

	tuilesNombre: {
		couvert: true,
		entrees: [
			{
				titre: 'tuiles (comparer)',
				geste: 'poser un signe de comparaison différent de celui qu’exige l’énoncé',
				source: { origine: 'catalogue', lecon: 'num-comparer', mode: 'tuiles' },
				jouer: async (page) => {
					await ouvrirMode(page, 'num-comparer', 'tuiles');
					await page.locator('#ltuiSlot').waitFor();
					// Le bon signe se déduit des deux nombres de l'énoncé (même lecture que
					// numeration.spec.ts) ; on en pose donc un AUTRE, sans deviner.
					const enonce = await page.locator('.ltui-enonce').innerText();
					const m = enonce.match(/(\d+)\D+?(\d+)/);
					if (!m) throw new Error(`Énoncé illisible pour en déduire le signe : « ${enonce} »`);
					const a = Number(m[1]);
					const b = Number(m[2]);
					const bon = a < b ? '<' : a > b ? '>' : '=';
					const faux = bon === '<' ? '>' : '<';
					await page.locator('.ltui-tuile', { hasText: faux }).first().click();
					await page.locator('#ltuiVerif').click();
					await page.locator('#ltuiSlot.wrong').waitFor();
				},
			},
		],
	},

	tuilesOrdre: {
		couvert: true,
		entrees: [
			{
				titre: 'ranger une suite (nombres)',
				geste:
					'poser les nombres triés MAIS les deux premiers échangés — une suite ni croissante ni décroissante est fausse dans les deux sens, sans lire la consigne',
				source: { origine: 'catalogue', lecon: 'num-ranger', mode: 'tuiles' },
				jouer: async (page) => {
					await ouvrirLecon(page, 'num-ranger');
					await page.locator('.lord-tuile').first().waitFor();
					const valeurs = (await page.locator('.lord-tuile').allTextContents())
						.map((t) => Number(t.trim()))
						.sort((x, y) => x - y);
					const ordre = [valeurs[1], valeurs[0], ...valeurs.slice(2)];
					for (const val of ordre) await page.locator(`.lord-tuile[data-val="${val}"]`).click();
					await page.locator('#lordVerif').click();
					await page.locator('.lord-cell.wrong').first().waitFor();
				},
			},
		],
	},

	tuilesTri: {
		couvert: true,
		entrees: [
			{
				titre: 'trier par thème',
				geste:
					'ranger TOUS les mots dans la première colonne — la moitié y est forcément mal classée',
				source: { origine: 'catalogue', lecon: 'fr-vocab-champs-tri', mode: 'tri' },
				jouer: async (page) => {
					await ouvrirLecon(page, 'fr-vocab-champs-tri');
					await page.locator('.ltri-tuile').first().waitFor();
					while ((await page.locator('.ltri-tuile').count()) > 0) {
						await page.locator('.ltri-tuile').first().click();
						await page.locator('.ltri-col').first().locator('.ltri-col-titre').click();
					}
					await page.locator('#ltriVerif').click();
					await page.locator('.ltri-posee.wrong').first().waitFor();
				},
			},
		],
	},

	appariement: {
		couvert: true,
		entrees: [
			{
				titre: 'relier des paires (familles de mots)',
				geste:
					'relier le i-ème mot de gauche au i-ème mot de droite, manche après manche, jusqu’à en rater une',
				source: { origine: 'catalogue', lecon: 'fr-vocab-familles-relier', mode: 'relier' },
				jouer: async (page) => {
					await ouvrirLecon(page, 'fr-vocab-familles-relier');
					await page.locator('.lapp-mot').first().waitFor();
					await jusquAUneErreur(
						page,
						async () => {
							const gauche = page.locator('.lapp-mot[data-side="g"]');
							const droite = page.locator('.lapp-mot[data-side="d"]');
							const n = await gauche.count();
							for (let i = 0; i < n; i++) {
								await gauche.nth(i).click();
								await droite.nth(i).click();
							}
							await page.locator('#lappVerif').click();
						},
						page.locator('#lappActions button'),
					);
				},
				verifie: async (carte) => {
					// Promesse propre à l'appariement : le journal ne montre PAS « c'est faux »
					// en bloc, mais les paires FAUSSES (`pairesErreur`), écrites « gauche → droite ».
					const donnee = await carte.locator('.enc-err-donnee').first().textContent();
					if (!donnee?.includes('→')) {
						throw new Error(
							`Réponse donnée « ${donnee} » : ce n'est plus une liste de paires reliées.`,
						);
					}
				},
			},
		],
	},

	clicMot: {
		couvert: true,
		entrees: [
			{
				titre: 'cliquer sur le mot (les verbes)',
				geste: 'cliquer sur TOUS les mots de la phrase — les intrus rendent la sélection fausse',
				source: { origine: 'catalogue', lecon: 'fr-gram-clic-verbe', mode: 'clic' },
				jouer: async (page) => {
					await ouvrirLecon(page, 'fr-gram-clic-verbe');
					await page.locator('.lclic-mot').first().waitFor();
					await jusquAUneErreur(
						page,
						async () => {
							const mots = page.locator('.lclic-mot');
							const n = await mots.count();
							for (let i = 0; i < n; i++) await mots.nth(i).click();
							await page.locator('#lclicVerif').click();
						},
						page.locator('#lclicActions button'),
					);
				},
			},
		],
	},

	droiteGraduee: {
		couvert: true,
		entrees: [
			{
				titre: 'droite graduée (placer un entier)',
				geste: 'poser le repère sur une graduation autre que celle demandée par la consigne',
				source: { origine: 'catalogue', lecon: 'num-droite-entiers', mode: 'placer' },
				jouer: async (page) => {
					await ouvrirLecon(page, 'num-droite-entiers');
					await page.locator('.dg-interactif').waitFor();
					const consigne = await page.locator('#dgConsigne').innerText();
					const m = consigne.match(/Place le nombre (.+) sur la droite graduée/);
					if (!m) throw new Error(`Consigne illisible : « ${consigne} »`);
					const cible = m[1];
					const hits = page.locator('.dg-hit');
					const n = await hits.count();
					let pose = false;
					for (let i = 0; i < n && !pose; i++) {
						if ((await hits.nth(i).getAttribute('data-label')) !== cible) {
							await hits.nth(i).click();
							pose = true;
						}
					}
					if (!pose) throw new Error('Aucune graduation autre que la cible : erreur impossible.');
					await page.locator('#dgVerify').click();
					await page.locator('.lqcm-ko').waitFor();
				},
			},
		],
	},

	posed: {
		couvert: true,
		entrees: [
			{
				titre: 'opération posée (addition)',
				geste: 'écrire un chiffre faux dans chaque case-résultat de la grille, puis Vérifier',
				source: { origine: 'catalogue', lecon: 'calc-addition-posee' },
				jouer: async (page) => {
					await ouvrirLecon(page, 'calc-addition-posee');
					await page.locator('.posee').first().waitFor();
					const cases = page.locator('.posee-input');
					const n = await cases.count();
					for (let i = 0; i < n; i++) {
						const c = cases.nth(i);
						const bon = Number((await c.getAttribute('data-answer')) ?? '0');
						await c.fill(String((bon + 1) % 10));
					}
					await page.locator('#btnVerify').click();
					await page.locator('.posee-input.wrong').first().waitFor();
				},
				verifie: async (carte) => {
					// Promesse propre au posé : une entrée par OPÉRATION (« a + b »), pas une
					// par cellule-chiffre. La fiche en contient plusieurs, donc on ne compte
					// pas les entrées — on vérifie que chacune se lit comme une opération,
					// ce qu'une capture cellule par cellule ne produirait jamais.
					// `allTextContents` et non `allInnerTexts` : au-delà de 5 erreurs, les plus
					// anciennes sont repliées dans un second <details> — invisibles, donc
					// `innerText` les rendrait vides et l'assertion passerait à côté.
					for (const texte of await carte.locator('.enc-err-q').allTextContents()) {
						if (!texte.includes('+')) {
							throw new Error(
								`Entrée « ${texte} » : ce n'est pas une opération. Les cellules-chiffres ` +
									`ne sont plus agrégées en une erreur par opération.`,
							);
						}
					}
				},
			},
		],
	},

	tableauConversion: {
		couvert: true,
		entrees: [
			{
				titre: 'tableau de conversion (longueurs)',
				geste: 'remplir la 1re case avec un chiffre faux au pavé, le reste juste, puis Vérifier',
				source: { origine: 'catalogue', lecon: 'mes-longueurs', mode: 'tableau' },
				jouer: async (page) => {
					await ouvrirMode(page, 'mes-longueurs', 'tableau');
					await page.locator('#tcTable').waitFor();
					const n = await page.locator('.tc-cell').count();
					for (let i = 0; i < n; i++) {
						const cellule = page.locator(`.tc-cell[data-i="${i}"]`);
						const bon = await cellule.getAttribute('data-answer');
						const chiffre = i === 0 ? String((Number(bon) + 1) % 10) : (bon ?? '0');
						await page.locator(`.tc-pave-btn[data-chiffre="${chiffre}"]`).click();
					}
					await page.locator('#tcVerif').click();
					await page.locator('.tc-cell[data-i="0"].wrong').waitFor();
				},
			},
		],
	},

	probleme: {
		couvert: true,
		entrees: [
			{
				titre: 'résolution de problème (composition)',
				geste: 'répondre à côté à chaque sous-question, puis Vérifier',
				source: { origine: 'catalogue', lecon: 'math-prob-composition' },
				jouer: async (page) => {
					await ouvrirLecon(page, 'math-prob-composition');
					await page.locator('.prob-enonce').waitFor();
					const champs = page.locator('.prob-input');
					const n = await champs.count();
					for (let i = 0; i < n; i++) {
						const champ = champs.nth(i);
						const bon = Number((await champ.getAttribute('data-answer')) ?? '0');
						await champ.fill(String(bon + 1));
					}
					await page.locator('#probVerif').click();
					await page.locator('.prob-mark.wrong').first().waitFor();
				},
			},
		],
	},

	motCache: {
		couvert: true,
		entrees: [
			{
				titre: 'mot caché (atelier d’orthographe)',
				geste: 'cacher le mot puis en écrire un autre',
				source: { origine: 'ortho', liste: 'l-e2e-journal', modeOrtho: 'motCache' },
				amorce: (page) => amorcerOrtho(page),
				jouer: async (page) => {
					await seedAideVue(page);
					await gotoHash(page, 'ortho-mode-l-e2e-journal');
					await page.locator('[data-mode="motCache"]').click();
					await page.locator('#btnCacher').click();
					await page.locator('#orthoInput').fill('zzzz');
					await page.locator('#btnVerifMot').click();
					await page.locator('.fb-ko').waitFor();
				},
			},
		],
	},

	tuiles: {
		couvert: true,
		entrees: [
			{
				titre: 'lettres à remettre dans l’ordre (atelier d’orthographe)',
				geste: 'ne poser que deux lettres du bac : le mot construit est trop court, donc faux',
				source: { origine: 'ortho', liste: 'l-e2e-journal', modeOrtho: 'tuiles' },
				amorce: (page) => amorcerOrtho(page),
				jouer: async (page) => {
					await seedAideVue(page);
					await gotoHash(page, 'ortho-mode-l-e2e-journal');
					await page.locator('[data-mode="tuiles"]').click();
					const lettres = page.locator('#bac .tuile[data-i]');
					await lettres.first().waitFor();
					await lettres.nth(0).click();
					await lettres.nth(0).click(); // le bac se referme sur les restantes
					await page.locator('#btnVerifTuiles').click();
					await page.locator('.fb-ko').waitFor();
				},
			},
		],
	},

	dictee: {
		couvert: true,
		entrees: [
			{
				titre: 'dictée (atelier d’orthographe)',
				geste: 'écrire un autre mot que celui dicté',
				source: { origine: 'ortho', liste: 'l-e2e-journal', modeOrtho: 'dictee' },
				// Sans voix FR, le mode « dictée » n'est même pas proposé : Chromium
				// headless n'en expose aucune.
				amorce: (page) => amorcerOrtho(page, true),
				jouer: async (page) => {
					await seedAideVue(page);
					await gotoHash(page, 'ortho-mode-l-e2e-journal');
					await page.locator('[data-mode="dictee"]').click();
					await page.locator('#orthoInput').fill('zzzz');
					await page.locator('#btnVerifMot').click();
					await page.locator('.fb-ko').waitFor();
				},
			},
		],
	},
};
