/* ============================================================
   Scan a11y automatique (axe-core) sur un échantillon de vues (#411).

   Signal AUTOMATISÉ en complément de l'agent-conseil `relecteur-accessibilite`
   (qui reste utile pour tout ce qu'axe ne mesure pas : sémantique, TTS, contexte).
   Chaque vue est amenée à un état stable (attente d'un élément repère PUIS de la
   fin des animations d'entrée, cf. `settleAnimations`, partagé dans `helpers.ts` avec
   etayage-redige.spec.ts — même défaut d'actionnabilité sous `modal-pop`), puis scannée
   en WCAG A/AA.
   Le rapport groupé par règle/élément est imprimé dans les logs (exploitable tel
   quel par un agent) et le détail JSON complet est attaché au rapport Playwright.

   GATE BLOQUANT (#583, ex-#411) : le scan FAIT ÉCHOUER le build sur toute violation.
   Il a atterri non bloquant en #411 pour ne pas figer le merge sur la dette existante ;
   cette dette est aujourd'hui soldée ou déclarée. Le drapeau `A11Y_GATE` a disparu avec
   la bascule — un gate qu'il faut penser à activer n'est pas un gate.

   Ce que la bascule a demandé, dans l'ordre : #576 (le token `--muted` sous AA, qui
   ressortait sur cinq vues), #577 (six champs sans nom accessible), #386 (la ligne du
   champ de réponse invisible en Nuit), et le gate de paires de tokens #582. Mesure
   d'avant/après : 6 vues en échec sur 9 et 2 règles en cause (`color-contrast`, `label`)
   le 19/08/2026 ; 2 vues et 1 règle le 20/08. La règle `label` a entièrement disparu.

   DÉROGATIONS PAR CAUSE (cf. plus bas) : ce qui reste est déclaré par COUPLE DE COULEURS,
   pas par sélecteur. C'est la bonne maille — les 38 éléments signalés en août ne
   correspondaient qu'à 4 causes racines, et une allow-list par élément aurait grossi à
   chaque vue ajoutée sans rien dire de plus. Chaque entrée porte son issue, sa mesure et
   sa date, et le test exige qu'elle serve ENCORE : corriger le défaut fait échouer la
   dérogation devenue fausse, donc force à la retirer.

   `incomplete` (règles qu'axe n'a pas su trancher, ex. `target-size` sur un élément
   partiellement masqué) reste NON bloquant et purement informatif : par construction axe
   dit qu'il ne sait pas, et faire échouer un build sur un « je ne sais pas » ne se
   corrige pas, ça se contourne.

   ÉCHANTILLON (représentatif des grandes familles de rendu, pas exhaustif) :
   - Accueil / grille des leçons  → structure de navigation principale.
   - Leçon maths avec figure SVG  → libellés `<title>`/`<desc>` + contraste des tracés.
   - Leçon français (saisie)      → consigne + champ de saisie (label de formulaire).
   - Leçon à tuiles (tri)          → ARIA sur-mesure (rôles, zone de dépôt), famille à risque.
   - Espace encadrant             → écran adulte dense (stats, réglages, contrôles).
   - Modale « nouveau profil »     → dialog de saisie superposé (rôle, focus, contraste).
   - Modale Récompenses           → dialog de gamification (couleurs des récompenses).
   - Encart « Pour les parents »  → bandeau du registre encadrant sur l'accueil enfant (#306 §7).
   - Config du sprint             → écran de réglage (radiogroup, boutons de choix).
   - Catégorie (grille de leçons) → liste dense de cartes, seconde famille de navigation.
   - Profils                      → écran de réglages a11y (bascules, formulaire).
   - Espace encadrant — réglages  → onglet le plus dense en contrôles adultes.
   - Atelier d'orthographe        → runner de dictée, famille de rendu absente jusqu'ici.

   ÉLARGISSEMENT — décidé sur mesure (#583). Sept vues candidates ont été scannées avant
   la bascule : cinq sont ajoutées ci-dessus, deux sont ÉCARTÉES et c'est délibéré.
   « Révision espacée » et « Séance » rendent un écran dont le contenu dépend de
   l'historique du profil ; sur un profil neuf elles affichent un état vide (0 violation,
   mais 0 information). Les amorcer pour les remplir relève de leurs specs dédiées, pas
   d'un scan a11y — un gate sur un écran vide ne garde rien.
   Résultat notable de cette mesure : les cinq vues ajoutées n'apportent AUCUNE cause
   racine nouvelle. Toutes leurs violations sont le même `--accent` employé comme texte
   sur un fond clair, déjà suivi en #600. Élargir coûtait donc de la couverture gratuite.
   ============================================================ */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
	watchErrors,
	gotoHash,
	seedAideVue,
	seedRappelSauvegardeScript,
	settleAnimations,
} from './helpers';
import { scanA11y, formatA11yReport } from './axe';
import type { NodeResult } from 'axe-core';

/* ---------- Dérogations : par CAUSE, jamais par élément ---------- */

interface Derogation {
	/** Règle axe visée. */
	regle: string;
	/** Le couple de couleurs que mesure AXE — donc la couleur RÉELLEMENT rendue,
	 *  composition alpha comprise. C'est tout l'intérêt : `#4f8d6a` n'est écrit dans
	 *  aucune feuille, c'est un voile blanc à 16 % posé sur l'accent. */
	avant: string;
	arriere: string;
	/** Vues où ce défaut se manifeste. Une vue de plus qui le déclenche doit être
	 *  ajoutée ici : sans ça, la dérogation s'étendrait en silence à mesure que
	 *  l'échantillon grossit. */
	vues: string[];
	issue: string;
	/** Date de la mesure, pour qu'une dérogation qui traîne se voie. */
	mesure: string;
	raison: string;
}

const DEROGATIONS: Derogation[] = [
	// VIDE, et c'est l'état visé. Les trois dernières entrées sont tombées avec leurs
	// correctifs : `--accent` en texte sur `--accent-soft` puis sur `--page-bg` (#600,
	// accents assombris à la source), et la pastille composée du chronomètre (#609,
	// voile inversé). Une entrée ajoutée ici doit porter son couple de couleurs MESURÉ
	// PAR AXE (composition alpha comprise), son issue, sa date — et le test exige
	// qu'elle serve encore, donc elle s'auto-périme le jour du correctif.
];

/** La dérogation qui couvre ce nœud, s'il y en a une. */
function derogationDe(regle: string, node: NodeResult, vue: string): Derogation | undefined {
	const donnees = [...node.any, ...node.all, ...node.none]
		.map((c) => c.data as { fgColor?: string; bgColor?: string } | undefined)
		.filter((d): d is { fgColor?: string; bgColor?: string } => !!d);
	return DEROGATIONS.find(
		(d) =>
			d.regle === regle &&
			d.vues.includes(vue) &&
			donnees.some(
				(x) => x.fgColor?.toLowerCase() === d.avant && x.bgColor?.toLowerCase() === d.arriere,
			),
	);
}

/* Supprime un éventuel verrou PIN persistant avant d'ouvrir l'espace encadrant. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

interface View {
	name: string;
	hash: string;
	/* Amène la vue à un état stable (navigation + attente d'un repère + interaction). */
	open: (page: Page) => Promise<void>;
	/* Restreint le scan axe à un sous-arbre (ex. la modale ouverte). */
	include?: string;
}

const VIEWS: View[] = [
	{
		name: 'Accueil / grille des leçons',
		hash: 'accueil',
		open: async (page) => {
			await gotoHash(page, 'accueil');
			await page.locator('#home').waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Leçon maths avec figure SVG (Les angles)',
		hash: 'lecon-geo-angles',
		open: async (page) => {
			await gotoHash(page, 'lecon-geo-angles');
			await page.locator('.figure svg').first().waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Leçon français (conjugaison — être au présent)',
		hash: 'lecon-fr-conj-etre-present',
		open: async (page) => {
			await gotoHash(page, 'lecon-fr-conj-etre-present');
			await page.locator('.consigne-line').first().waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Leçon à tuiles (tri de mots)',
		hash: 'lecon-fr-vocab-champs-tri',
		open: async (page) => {
			// Masque l'auto-modale d'aide du runner tuiles pour scanner le runner lui-même.
			await seedAideVue(page);
			await gotoHash(page, 'lecon-fr-vocab-champs-tri');
			await page.locator('.ltri-tuile').first().waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Espace encadrant',
		hash: 'encadrant',
		open: async (page) => {
			await page.addInitScript(CLEAR_PIN);
			await gotoHash(page, 'encadrant');
			await page.locator('.enc-frame').waitFor({ state: 'visible' });
		},
	},
	{
		// Onglet PROGRAMME, sélecteur de leçon déployé et recherche posée (#571). L'échantillon
		// s'arrêtait à l'onglet Suivi, alors que le sélecteur tous niveaux (#556) vit ici et
		// n'était scanné par rien : cinquième site du radiogroup partagé, arbre de `<details>`
		// à deux étages, région live différée, badge de classe conditionnel. La recherche force
		// l'ouverture des groupes, donc scanne l'arbre DÉPLIÉ — l'état où il porte le plus de
		// contrôles, et le seul où sa borne d'affichage entre en jeu.
		name: 'Espace encadrant — sélecteur de leçon (onglet Programme)',
		hash: 'encadrant/programme',
		open: async (page) => {
			await page.addInitScript(CLEAR_PIN);
			await gotoHash(page, 'encadrant/programme');
			// Le sous-bloc « Épingler une leçon » porte un sélecteur toujours rendu : pas besoin
			// de composer un programme pour en avoir un à scanner.
			const selecteur = page.locator('.enc-sel').first();
			await selecteur.waitFor({ state: 'visible' });
			await selecteur.locator('input[data-act="sel-recherche"]').fill('e');
			await selecteur.locator('.enc-sel-item').first().waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Modale « nouveau profil »',
		hash: 'encadrant/profils',
		include: '.modal-overlay:not([id])',
		open: async (page) => {
			await page.addInitScript(CLEAR_PIN);
			// Le bouton « Nouveau profil » vit dans l'onglet Profils (#459).
			await gotoHash(page, 'encadrant/profils');
			await page.locator('[data-act="enc-add"]').click();
			await page.locator('.modal-overlay:not([id])').waitFor({ state: 'visible' });
			await page.locator('#uimodal-input').waitFor({ state: 'visible' });
			await settleAnimations(page, '.modal-overlay:not([id]) .modal');
		},
	},
	{
		name: 'Modale Récompenses (gamification)',
		hash: 'accueil',
		include: '#recompenses',
		open: async (page) => {
			await gotoHash(page, 'accueil');
			await page.locator('#home').waitFor({ state: 'visible' });
			await page.locator('[data-act="open-recompenses"]').click();
			await page.locator('#recompenses').waitFor({ state: 'visible' });
			await settleAnimations(page, '#recompenses .modal');
		},
	},
	{
		// Un profil frais (sans amorçage) ne réunit jamais les trois verrous qui
		// commandent l'apparition de cet encart (#306 §7) : il ne serait donc JAMAIS
		// scanné sans amorcer ces signaux ici (relecture accessibilité). Pas
		// d'animation d'entrée (cf. rappel-sauvegarde.scss) : un simple repère suffit.
		name: 'Encart « Pour les parents » (rappel de sauvegarde)',
		hash: 'accueil',
		include: '#rappelSauvegarde',
		open: async (page) => {
			await page.addInitScript(seedRappelSauvegardeScript());
			await gotoHash(page, 'accueil');
			await page.locator('#rappelSauvegarde').waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Config du sprint',
		hash: 'sprint-config',
		open: async (page) => {
			await gotoHash(page, 'sprint-config');
			await page.locator('#scLaunch').waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Catégorie (grille de leçons)',
		hash: 'categorie-fr-orthographe',
		open: async (page) => {
			await gotoHash(page, 'categorie-fr-orthographe');
			await page.locator('.cat-rubrique').first().waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Profils',
		hash: 'profils',
		open: async (page) => {
			await gotoHash(page, 'profils');
			await page.locator('#prefConfort').waitFor({ state: 'visible' });
		},
	},
	{
		name: 'Espace encadrant — réglages',
		hash: 'encadrant/reglages',
		open: async (page) => {
			await page.addInitScript(CLEAR_PIN);
			await gotoHash(page, 'encadrant/reglages');
			await page.locator('.enc-tab.active .enc-tab-lab').waitFor({ state: 'visible' });
		},
	},
	{
		// Le runner de dictée : famille de rendu qu'aucune vue de l'échantillon ne couvrait
		// (l'atelier compose des mots, avec ses propres contrôles).
		name: "Atelier d'orthographe",
		hash: 'ortho-fr-ortho-invariables-1',
		open: async (page) => {
			await seedAideVue(page);
			await gotoHash(page, 'ortho-fr-ortho-invariables-1');
			await page.locator('#atelierUndo').waitFor({ state: 'visible' });
		},
	},
];

for (const view of VIEWS) {
	test(`axe — ${view.name}`, async ({ page }, testInfo) => {
		const errors = watchErrors(page);
		await view.open(page);

		const results = await scanA11y(page, { include: view.include });
		const report = formatA11yReport(view.name, view.hash, results);

		// Rapport lisible dans les logs CI + détail JSON complet attaché (débogage à distance).
		console.log('\n' + report + '\n');
		await testInfo.attach(`axe-${view.hash}.json`, {
			body: JSON.stringify(
				{ violations: results.violations, incomplete: results.incomplete },
				null,
				2,
			),
			contentType: 'application/json',
		});

		// Smoke : la vue se rend sans erreur JS et axe a bien tourné.
		expect(errors).toEqual([]);
		expect(results.testEngine.name).toBe('axe-core');

		// A11y : BLOQUANT (#583). On retire d'abord les nœuds couverts par une dérogation
		// déclarée pour cette vue, puis on exige qu'il ne reste rien.
		const utilisees = new Set<Derogation>();
		const restantes = results.violations
			.map((v) => ({
				...v,
				nodes: v.nodes.filter((n) => {
					const d = derogationDe(v.id, n, view.name);
					if (d) utilisees.add(d);
					return !d;
				}),
			}))
			.filter((v) => v.nodes.length > 0);

		expect(
			restantes,
			`${report}\n\nCe scan est BLOQUANT (#583). Corriger le défaut, ou — s'il est connu, ` +
				`tracé et non corrigeable ici — déclarer une DÉROGATION dans ce fichier : par couple ` +
				`de couleurs (pas par sélecteur), avec son issue, sa mesure et sa date.`,
		).toEqual([]);

		// Une dérogation qui n'excuse plus rien est une dérogation périmée : soit le défaut
		// a été corrigé (bonne nouvelle, il faut retirer l'entrée), soit la vue ne le
		// déclenche plus. Sans cette exigence, l'allow-list survivrait à ce qu'elle
		// justifiait et finirait par couvrir une vraie régression.
		for (const d of DEROGATIONS.filter((x) => x.vues.includes(view.name)))
			expect(
				utilisees.has(d),
				`La dérogation ${d.issue} (${d.avant} sur ${d.arriere}, mesurée le ${d.mesure}) ` +
					`n'a rien excusé sur la vue « ${view.name} ».\n` +
					`Si le défaut est corrigé : retirer l'entrée (ou cette vue de sa liste), et fermer ` +
					`${d.issue} si plus rien ne la déclenche.\n` +
					`Motif d'origine : ${d.raison}`,
			).toBe(true);
	});
}
