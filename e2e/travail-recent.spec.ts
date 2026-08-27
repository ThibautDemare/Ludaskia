/* ============================================================
   Bloc « Travaillé récemment » (#520) — espace encadrant, onglet Suivi.
   ------------------------------------------------------------
   Couvre : le round-trip complet (jouer une VRAIE leçon la fait apparaître
   NOMMÉE, avec sa méta « catégorie · N fois · quand »), le sélecteur de
   période (resserrer la fenêtre retire une leçon devenue trop ancienne, le
   message dédié apparaît, l'option cochée suit le clic), l'état vide, et le
   décompte mixte leçons/dictées de la synthèse (relu langue après coup :
   « N fois » et non « travaillée N fois » — réservé au compte CUMULÉ de
   l'accordéon « Notions par catégorie », deux chiffres différents sous la
   même phrase se lisant comme un bug ; « Aucune session … » et non « Aucune
   leçon travaillée … », le mot déjà employé par le graphe d'activité juste
   au-dessus ; les dictées comptées À PART dans la synthèse, jamais annoncées
   comme une « leçon »), le compte inconnu d'une leçon vue seulement en bilan/sprint
   (« null, jamais 0 » vérifié aussi au RENDU, pas seulement côté core), et le repli
   au-delà de 6 lignes par matière (fermé par défaut, dépliable au clic).

   Le bloc partage l'onglet Suivi avec plusieurs AUTRES `.enc-sub-lab`
   (Couverture par matière, Évolution récente, À revoir ensemble) et
   `.enc-act-mode` (graphe d'activité, période des erreurs, révisions) :
   tous les sélecteurs ci-dessous sont scopés au bloc lui-même
   (`.enc-block` filtré sur son titre), jamais globaux.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors, gotoHash, seedAideVue } from './helpers';

/* Pas de verrou PIN hérité d'un test précédent. */
const CLEAR_PIN = `localStorage.removeItem('ludaskia_encadrant_lock');`;

/* Le bloc, scopé par son titre (h3) : point d'entrée de tous les sélecteurs
   de cette spec, pour ne jamais retomber sur un `.enc-sub-lab`/`.enc-act-mode`
   d'un AUTRE bloc de l'onglet Suivi. */
const bloc = (page: import('@playwright/test').Page) =>
	page.locator('.enc-block').filter({ hasText: 'Travaillé récemment' });

/* 1. Round-trip : jouer une VRAIE leçon (fiche en saisie, num-comparer) la fait
   apparaître nommée dans le bloc, avec sa catégorie, son compte de séances et
   sa date. Chemin le plus fidèle : le journal d'activité et les stats se
   remplissent comme en vrai (`ref` compris), pas un seed direct des stores. */
test('jouer une leçon la fait apparaître nommée dans « Travaillé récemment »', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await seedAideVue(page);
	await gotoHash(page, 'lecon-num-comparer'); // mode par défaut = saisie

	const fields = page.locator('#sheets input.ans');
	const n = await fields.count();
	expect(n).toBeGreaterThan(0);
	// Remplit CHAQUE champ avec sa VRAIE réponse (data-answer) : essai sans faute.
	for (let i = 0; i < n; i++) {
		const f = fields.nth(i);
		const ans = await f.getAttribute('data-answer');
		await f.fill(ans ?? '');
	}
	await page.locator('#btnVerify').click();
	await expect(page.locator('.mark.correct').first()).toBeVisible();
	await expect(page.locator('.mark.wrong')).toHaveCount(0);

	await gotoHash(page, 'encadrant');
	const b = bloc(page);
	await expect(b).toBeVisible();

	// Groupée sous l'en-tête de sa matière (« Mathématiques »), scopé au bloc.
	await expect(b.locator('.enc-sub-lab').filter({ hasText: 'Mathématiques' })).toBeVisible();

	// La leçon jouée est NOMMÉE (libellé du catalogue), avec sa méta factuelle :
	// catégorie (Numération) · 1 fois (un seul essai, PAS « travaillée 1 fois » —
	// formule réservée au compte CUMULÉ de l'accordéon « Notions par catégorie »,
	// pour ne pas afficher deux chiffres différents sous la même phrase) · aujourd'hui.
	const ligne = b.locator('.enc-trav-item').filter({ hasText: 'Je compare les nombres' });
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-trav-lab')).toHaveText('Je compare les nombres');
	await expect(ligne.locator('.enc-trav-meta')).toContainText('Numération');
	await expect(ligne.locator('.enc-trav-meta')).toContainText('1 fois');
	await expect(ligne.locator('.enc-trav-meta')).not.toContainText('travaillée');
	await expect(ligne.locator('.enc-trav-meta')).toContainText("aujourd'hui");

	expect(errors).toEqual([]);
});

/* Une leçon travaillée il y a 3 jours (ancrée sur le DÉBUT DU JOUR LOCAL, +10h —
   jamais une soustraction fixe en ms, cf. erreurs-encadrant.spec.ts) : visible
   dans la fenêtre par défaut (7 jours), hors fenêtre une fois resserré sur
   « Aujourd'hui » (1 jour). Seedé directement (pas de round-trip réel possible
   sans attendre 3 jours) : clé namespacée `lessonId@niveau`, champ `lastAt`. */
const SEED_TRAVAIL_ANCIEN = `(() => {
  const now = Date.now();
  const debutJour = new Date(now); debutJour.setHours(0, 0, 0, 0);
  const ilYA = (jours) => debutJour.getTime() - jours * 86400000 + 10 * 3600000;
  const stat = { attempts: 2, correct: 18, questions: 20, bestPct: 90, lastPct: 90, recentPct: [90], lastAt: ilYA(3) };
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({ 'math-complements@ce2': stat }));
})();`;

/* 2. Sélecteur de période : la fenêtre par défaut (7 jours) nomme la leçon,
   resserrer sur « Aujourd'hui » la retire (hors fenêtre) et affiche le message
   dédié, et l'option cochée suit le clic (contrat radiogroup, comme les autres
   segments de l'espace encadrant, cf. encadrant-segment.spec.ts). */
test("sélecteur de période : resserrer sur « Aujourd'hui » retire la leçon devenue trop ancienne", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_TRAVAIL_ANCIEN);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	const btn = (jours: string) =>
		b.locator(`.enc-act-mode[data-act="travail-periode"][data-jours="${jours}"]`);

	// Défaut : « 1 semaine » (7 jours), cochée — la leçon d'il y a 3 jours y est nommée.
	await expect(btn('7')).toHaveClass(/\bon\b/);
	await expect(btn('7')).toHaveAttribute('aria-checked', 'true');
	const ligne = b.locator('.enc-trav-item').filter({ hasText: 'Complément à 10/100/1000' });
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-trav-meta')).toContainText('il y a 3 jours');

	// Resserrer sur « Aujourd'hui » (1 jour) : la leçon sort de la fenêtre → message
	// dédié, ET l'option cochée bascule (re-rendu, focus/état conservés).
	await btn('1').click();
	await expect(btn('1')).toHaveClass(/\bon\b/);
	await expect(btn('1')).toHaveAttribute('aria-checked', 'true');
	await expect(btn('7')).toHaveAttribute('aria-checked', 'false');
	await expect(b.locator('.enc-trav-item')).toHaveCount(0);
	// « Aucune session … », pas « Aucune leçon travaillée … » : le mot déjà employé par
	// le graphe d'activité juste au-dessus, pour ne pas faire entendre « 0 leçon
	// travaillée » à un lecteur d'écran (ce texte sert aussi de nom accessible à l'option
	// de période active).
	await expect(b).toContainText("Aucune session aujourd'hui.");

	expect(errors).toEqual([]);
});

/* 3. État vide : aucune leçon travaillée dans la fenêtre (aucun seed) → message
   dédié, aucune ligne. */
test('état vide : aucune leçon travaillée récemment', async ({ page }) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	await expect(b).toBeVisible();
	await expect(b).toContainText('Aucune session sur les 7 derniers jours.');
	await expect(b.locator('.enc-trav-item')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Une leçon ET une dictée travaillées AUJOURD'HUI : la leçon via les stats (comme
   SEED_TRAVAIL_ANCIEN), la dictée via le SEUL journal d'activité (`k: 'dictee'`, `ref`
   = id d'une dictée PRÉDÉFINIE — pas besoin de seeder le store `ludaskia_ortho`,
   `labelLeconOrtho` la résout seule, cf. suivi-dictees-encadrant.spec.ts). */
const SEED_MIXTE = `(() => {
  const now = Date.now();
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'math-complements@ce2': { attempts: 1, correct: 8, questions: 10, bestPct: 80, lastPct: 80, recentPct: [80], lastAt: now },
  }));
  localStorage.setItem('e2e/ludaskia_activity', JSON.stringify([
    { t: now, k: 'dictee', ref: 'fr-ortho-invariables-1' },
  ]));
})();`;

/* 4. Synthèse mixte (relu langue, #520) : une leçon et une dictée sont comptées à part
   dans la phrase de synthèse (« 1 leçon et 1 dictée travaillées … »), jamais fondues
   sous « leçon » — c'est précisément la faute corrigée par la relecture. La dictée
   porte aussi sa propre étiquette de contexte (« Dictée »), fournie par l'UI (le champ
   `contexte` renvoyé par le calcul core est vide pour une dictée, `kind` porte la
   nature de la cible). */
test('synthèse : une leçon et une dictée sont comptées SÉPARÉMENT (pas « 1 leçon » pour une dictée)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_MIXTE);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	await expect(b).toContainText('1 leçon et 1 dictée travaillées sur les 7 derniers jours.');

	const ligneDictee = b.locator('.enc-trav-item').filter({ hasText: 'Mots invariables (1)' });
	await expect(ligneDictee).toBeVisible();
	await expect(ligneDictee.locator('.enc-trav-meta')).toContainText('Dictée');

	expect(errors).toEqual([]);
});

/* Une leçon travaillée SEULEMENT via un bilan (pas de jeu isolé) : `lastAt` la place
   dans la fenêtre, mais aucune entrée d'activité ne porte sa `ref` (un bilan porte sur
   plusieurs leçons, cf. encadrant-stats.ts) → `seances` vaut `null`, jamais 0. */
const SEED_BILAN_SANS_REF = `(() => {
  const now = Date.now();
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'math-complements@ce2': { attempts: 1, correct: 8, questions: 10, bestPct: 80, lastPct: 80, recentPct: [80], lastAt: now },
  }));
  localStorage.setItem('e2e/ludaskia_activity', JSON.stringify([
    { t: now, k: 'bilan' },
  ]));
})();`;

/* 5. Compte inconnu (#520) : `ligneTravailHTML` OMET le segment « N fois » quand
   `seances === null` (leçon vue seulement dans un bilan/sprint) — contrat aujourd'hui
   vérifié côté core (« null, jamais 0 »), jamais au rendu. Sans cette assertion, un
   « null fois » ou un « 0 fois » affiché par erreur passerait inaperçu. */
test('compte inconnu (bilan sans ref) : la ligne apparaît SANS "fois" ni "null"', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_BILAN_SANS_REF);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	const ligne = b.locator('.enc-trav-item').filter({ hasText: 'Complément à 10/100/1000' });
	// Assertion positive d'abord : la leçon est bien nommée (sinon les assertions
	// négatives ci-dessous passeraient aussi si le bloc était vide).
	await expect(ligne.locator('.enc-trav-lab')).toHaveText('Complément à 10/100/1000');
	const meta = ligne.locator('.enc-trav-meta');
	await expect(meta).not.toContainText('fois');
	await expect(meta).not.toContainText('null');
	// Le reste de la méta (catégorie, date) reste bien présent malgré le compte omis.
	await expect(meta).toContainText('Calcul mental');
	await expect(meta).toContainText("aujourd'hui");

	expect(errors).toEqual([]);
});

/* Sept leçons de la MÊME matière (math-calcul-mental), horodatées en ordre décroissant
   pour un tri déterministe : au-delà de MAX_TRAVAIL_PAR_MATIERE (6), la 7e (la plus
   ancienne, « Table de × ») tombe dans le repli déplié. */
const SEED_7_MEME_MATIERE = `(() => {
  const now = Date.now();
  const ids = [
    'math-tables-addition', 'math-complements', 'math-doubles', 'math-moities',
    'math-ajouter-9-19-29', 'math-soustraire-9-19-29', 'math-tables-multiplication',
  ];
  const stats = {};
  ids.forEach((id, i) => {
    stats[id + '@ce2'] = {
      attempts: 1, correct: 8, questions: 10, bestPct: 80, lastPct: 80, recentPct: [80],
      lastAt: now - i * 1000,
    };
  });
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify(stats));
})();`;

/* 6. Repli au-delà de 6 lignes par matière (même idiome que les erreurs plus anciennes,
   cf. erreurs-encadrant.spec.ts) : fermé par défaut, les lignes cachées deviennent
   visibles au clic. On teste le COMPORTEMENT, pas le chrome CSS (partagé via le mixin
   `repli-sum`, déjà vérifié côté styles). */
test('repli au-delà de 6 lignes par matière : fermé par défaut, se déplie au clic', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_7_MEME_MATIERE);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	// Les 6 premières (les plus récentes) sont visibles d'emblée, dans la liste DIRECTE
	// (avant le repli).
	const listeDirecte = b.locator('ul.enc-trav-list').first();
	await expect(listeDirecte.locator('.enc-trav-item')).toHaveCount(6);

	// La 7e (la plus ancienne) est repliée : présente dans le DOM, mais cachée.
	const plus = b.locator('.enc-trav-plus');
	await expect(plus).toHaveCount(1);
	const resume = plus.locator('.enc-trav-plus-sum');
	await expect(resume).toHaveText('1 autre');
	const itemCache = plus.locator('.enc-trav-item');
	await expect(itemCache).toHaveCount(1);
	await expect(itemCache).toBeHidden();

	// Dépliée, elle devient lisible.
	await resume.click();
	await expect(itemCache).toBeVisible();
	await expect(itemCache.locator('.enc-trav-lab')).toHaveText('Table de ×');

	expect(errors).toEqual([]);
});

/* ============================================================
   Mention d'un cap tout juste franchi (#536) — critère 5 de l'issue (« Spec
   e2e complétée »), et au passage les critères observables à l'écran : 1
   (mention positive dans la fenêtre affichée), 3 (bascule de fenêtre en
   JOURS, pas en semaines), 6 (aucun état bas ou intermédiaire) et 21 par
   analogie (rien côté enfant, #537 hors périmètre). Les critères 2, 4, 7, 8
   et le détail du plafonnement (`capAnnoncable`) sont couverts côté Vitest
   (`tests/travail-recent-cap.test.ts`) : logique pure, pas de rendu.

   Élargi par deux commentaires du mainteneur sur l'issue :
   - 26 août 2026 — la mention couvre aussi les listes de dictée, via LEUR
     journal (`ludaskia_paliersOrtho`, indexé par l'id NU de la liste — piège
     réel : une première version l'adressait comme le journal des leçons,
     indexé par la clé de stats `@niveau`, et la mention n'apparaissait pour
     aucune leçon) ;
   - 27 août 2026 — un cap n'est annoncé que s'il est encore porté par l'état
     COURANT de la cible (`capAnnoncable`) : les journaux de paliers sont
     monotones, une redescente réelle (ex. un mot ajouté à une liste déjà
     acquise) ne doit pas laisser la mention affirmer un état démenti par
     l'accordéon du même écran.
   ============================================================ */

/* Deux leçons de calcul mental travaillées AUJOURD'HUI : l'une ÉTOILÉE (état
   courant forcé « acquis », cf. niveauNotion) avec un palier « acquis » daté
   de maintenant → mention ; l'autre travaillée sans AUCUNE entrée dans le
   journal des paliers → `capDansFenetre` renvoie null quel que soit son état,
   donc pas de mention. Les deux dans le MÊME seed pour que le contraste
   positif/silence se lise sur un seul chargement. */
const SEED_CAP_LECON = `(() => {
  const now = Date.now();
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'math-complements@ce2': { attempts: 1, correct: 10, questions: 10, bestPct: 100, lastPct: 100, lastAt: now },
    'math-doubles@ce2': { attempts: 1, correct: 8, questions: 10, bestPct: 80, lastPct: 80, lastAt: now },
  }));
  localStorage.setItem('e2e/ludaskia_stars', JSON.stringify({ 'math-complements@ce2': 1 }));
  localStorage.setItem('e2e/ludaskia_paliers', JSON.stringify({
    'math-complements@ce2': { acquis: now },
  }));
})();`;

test('critère 1 : une leçon qui franchit « acquis » dans la fenêtre porte la mention « … acquise », une leçon travaillée sans cap reste muette', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_CAP_LECON);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	const ligneAcquise = b.locator('.enc-trav-item').filter({ hasText: 'Complément à 10/100/1000' });
	await expect(ligneAcquise).toBeVisible();
	// Fragment stable plutôt que le texte exact (`MOT_CAP`, encadrant-travail.ts, déjà
	// reformulé une fois par la relecture langue) : « acquise » suffit à distinguer ce
	// cap de « … en cours » sans se casser au prochain ajustement de formulation.
	await expect(ligneAcquise.locator('.enc-trav-cap')).toContainText('acquise');
	// La mention est dans la méta, PAS un badge séparé (avis pédago, #536).
	await expect(ligneAcquise.locator('.enc-trav-meta')).toContainText('acquise');

	const ligneSansCap = b.locator('.enc-trav-item').filter({ hasText: 'Doubles' });
	await expect(ligneSansCap).toBeVisible();
	await expect(ligneSansCap.locator('.enc-trav-cap')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Élargissement du 26 août 2026 : une LISTE de dictée (pas une leçon du catalogue)
   travaillée aujourd'hui, dont le mot unique est déjà maîtrisé (atelier fait +
   tuiles/mot caché validés — la dictée n'est pas un mode requis en Chromium
   headless, sans voix FR, cf. `dicteeDisponible`/`modesRequis`), avec un
   franchissement « acquis » daté de maintenant dans SON journal
   (`ludaskia_paliersOrtho`, indexé par l'ID NU de la liste — le seul endroit où
   cette indexation se vérifie pour de vrai, cf. l'en-tête). La ligne n'existe
   QUE via le journal d'activité typé (`k: 'dictee'`), comme le reste du bloc. */
const SEED_ORTHO_CAP_ACQUIS = {
	banque: {
		m1: {
			id: 'm1',
			mot: 'chat',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: true, dictee: false },
			revision: { palier: 4, prochaineRevision: null, reussites: 3, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{ id: 'l-e2e-cap-dictee', label: 'Mots du soir', motIds: ['m1'], createdAt: 1, updatedAt: 1 },
	],
	motIdParForme: { chat: 'm1' },
};
const SEED_PALIERS_ORTHO_CAP = `(() => {
  const now = Date.now();
  localStorage.setItem('e2e/ludaskia_activity', JSON.stringify([
    { t: now, k: 'dictee', ref: 'l-e2e-cap-dictee' },
  ]));
  localStorage.setItem('e2e/ludaskia_paliersOrtho', JSON.stringify({
    'l-e2e-cap-dictee': { acquis: now },
  }));
})();`;

test('élargissement du 26 août : une liste de dictée qui franchit « acquis » affiche la mention, indexée par son id nu', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_ORTHO_CAP_ACQUIS);
	await page.addInitScript(SEED_PALIERS_ORTHO_CAP);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	const ligne = b.locator('.enc-trav-item').filter({ hasText: 'Mots du soir' });
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-trav-meta')).toContainText('Dictée'); // prémisse : bien une dictée
	await expect(ligne.locator('.enc-trav-cap')).toContainText('acquise'); // fragment stable, cf. test précédent

	expect(errors).toEqual([]);
});

/* Critère 3, vu de l'écran : un cap daté d'il y a 5 jours (ancré sur le DÉBUT DU
   JOUR LOCAL, +10h, même construction que SEED_TRAVAIL_ANCIEN plus haut) est dans
   la fenêtre « 1 semaine » (7 jours) mais hors de « Aujourd'hui » (1 jour). La
   DERNIÈRE SÉANCE, elle, reste aujourd'hui (`lastAt: now`) : la ligne elle-même
   reste visible dans les deux fenêtres, seule la MENTION doit disparaître — sans
   ça, la disparition de la ligne masquerait celle, plus fine, de la mention. */
const SEED_CAP_FENETRE = `(() => {
  const now = Date.now();
  const debutJour = new Date(now); debutJour.setHours(0, 0, 0, 0);
  const ilYA = (jours) => debutJour.getTime() - jours * 86400000 + 10 * 3600000;
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'math-moities@ce2': { attempts: 1, correct: 10, questions: 10, bestPct: 100, lastPct: 100, lastAt: now },
  }));
  localStorage.setItem('e2e/ludaskia_stars', JSON.stringify({ 'math-moities@ce2': 1 }));
  localStorage.setItem('e2e/ludaskia_paliers', JSON.stringify({
    'math-moities@ce2': { acquis: ilYA(5) },
  }));
})();`;

test("critère 3 : un cap vieux de 5 jours se voit en « 1 semaine » et disparaît en « Aujourd'hui », sans faire disparaître la ligne elle-même", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_CAP_FENETRE);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	const btn = (jours: string) =>
		b.locator(`.enc-act-mode[data-act="travail-periode"][data-jours="${jours}"]`);
	const ligne = b.locator('.enc-trav-item').filter({ hasText: 'Moitiés' });

	// Défaut : « 1 semaine » (7 jours) — le cap d'il y a 5 jours y est dedans.
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-trav-cap')).toContainText('acquise'); // fragment stable

	// Resserré sur « Aujourd'hui » (1 jour) : la ligne reste (séance d'aujourd'hui),
	// mais le cap, lui, sort de la fenêtre.
	await btn('1').click();
	await expect(btn('1')).toHaveClass(/\bon\b/);
	await expect(ligne).toBeVisible();
	await expect(ligne.locator('.enc-trav-cap')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Plafonnement du 27 août 2026, cas le plus simple : une liste de DEUX mots, l'un
   déjà maîtrisé, l'autre JAMAIS commencé (absent de la banque — `motsAttendusLecon`
   le résout en `undefined`, donc « nouveau »). L'état COURANT de la liste est donc
   « en cours » (`avancementLecon` : ni tous maîtrisés, ni tous nouveaux), alors que
   son journal date un « acquis » récent — un tampon posé quand la liste n'avait que
   son premier mot, jamais rejoué depuis l'ajout du second. `capAnnoncable` doit
   plafonner : pas de mention, ni celle d'« acquis » (démentie par l'état courant)
   ni celle d'« en cours » (aucun tampon `enCours` n'a été seedé). */
const SEED_ORTHO_PLAFOND = {
	banque: {
		m1: {
			id: 'm1',
			mot: 'chat',
			entourage: [],
			atelierFait: true,
			validation: { motCache: true, tuiles: true, dictee: false },
			revision: { palier: 4, prochaineRevision: null, reussites: 3, dernierTest: null },
			origine: 'liste',
		},
	},
	listes: [
		{
			id: 'l-e2e-cap-plafond',
			label: 'Liste avec un mot neuf',
			motIds: ['m1', 'm2'], // m2 : jamais matérialisé en banque → jamais commencé
			createdAt: 1,
			updatedAt: 1,
		},
	],
	motIdParForme: { chat: 'm1' },
};
const SEED_PALIERS_ORTHO_PLAFOND = `(() => {
  const now = Date.now();
  localStorage.setItem('e2e/ludaskia_activity', JSON.stringify([
    { t: now, k: 'dictee', ref: 'l-e2e-cap-plafond' },
  ]));
  localStorage.setItem('e2e/ludaskia_paliersOrtho', JSON.stringify({
    'l-e2e-cap-plafond': { acquis: now },
  }));
})();`;

test("plafonnement du 27 août : un « acquis » daté sur une liste dont un mot n'a jamais été commencé n'affiche aucune mention", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript((seed) => {
		localStorage.setItem('e2e/ludaskia_ortho', JSON.stringify(seed));
	}, SEED_ORTHO_PLAFOND);
	await page.addInitScript(SEED_PALIERS_ORTHO_PLAFOND);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	const ligne = b.locator('.enc-trav-item').filter({ hasText: 'Liste avec un mot neuf' });
	await expect(ligne).toBeVisible(); // prémisse : la ligne existe bien
	await expect(ligne.locator('.enc-trav-cap')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Critère 6, vu de l'écran : TROIS lignes à la fois — une acquise (cap « acquis »),
   une en cours (cap « en-cours »), une à faible performance SANS aucun palier. Vérifié
   en NÉGATIF plutôt que sur le texte exact des deux mentions (`MOT_CAP`,
   encadrant-travail.ts, déjà reformulé une fois par la relecture langue — une
   assertion figée sur le libellé se casserait au prochain ajustement) : aucun
   `.enc-trav-cap` ne doit jamais porter un mot d'état bas ou intermédiaire, ni un
   chiffre. La ligne faible, elle, doit rester muette (aucun `.enc-trav-cap`). */
const SEED_CAP_VOCAB = `(() => {
  const now = Date.now();
  localStorage.setItem('e2e/ludaskia_lessonStats', JSON.stringify({
    'math-complements@ce2': { attempts: 1, correct: 10, questions: 10, bestPct: 100, lastPct: 100, lastAt: now },
    'math-doubles@ce2': { attempts: 1, correct: 7, questions: 10, bestPct: 70, lastPct: 70, lastAt: now },
    'math-moities@ce2': { attempts: 2, correct: 2, questions: 10, bestPct: 20, lastPct: 20, lastAt: now },
  }));
  localStorage.setItem('e2e/ludaskia_stars', JSON.stringify({ 'math-complements@ce2': 1 }));
  localStorage.setItem('e2e/ludaskia_paliers', JSON.stringify({
    'math-complements@ce2': { acquis: now },
    'math-doubles@ce2': { enCours: now },
  }));
})();`;

test('critère 6 : aucune mention de cap ne porte un état bas ou intermédiaire, une leçon à faible performance sans cap reste muette', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_CAP_VOCAB);
	await gotoHash(page, 'encadrant');

	const b = bloc(page);
	const caps = b.locator('.enc-trav-cap');
	// Deux mentions attendues (acquise + en-cours) : ni plus, ni une troisième ligne
	// qui aurait glissé une mention là où elle ne devrait pas en avoir.
	await expect(caps).toHaveCount(2);
	const textes = await caps.allTextContents();
	// Les deux caps se distinguent par un FRAGMENT stable, pas par le texte exact
	// (`MOT_CAP` a déjà été reformulé une fois par la relecture langue).
	expect(textes.some((t) => t.includes('acquise'))).toBe(true);
	expect(textes.some((t) => t.includes('en cours'))).toBe(true);
	// Négatif, critère 6 : jamais un mot de l'échelle basse/intermédiaire, jamais un
	// chiffre — le seul vocabulaire admis dans cette table est {en-cours, acquis}
	// (`MOT_CAP`), quelle que soit sa formulation exacte du jour.
	for (const t of textes) {
		expect(t).not.toMatch(/à renforcer|à découvrir|non[- ]acquis/i);
		expect(t).not.toMatch(/[0-9%]/);
	}

	const ligneFaible = b.locator('.enc-trav-item').filter({ hasText: 'Moitiés' });
	await expect(ligneFaible).toBeVisible();
	await expect(ligneFaible.locator('.enc-trav-cap')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* Critère 21 par analogie (l'issue ne le numérote pas — c'est celui de #537, hors
   périmètre ici — mais la règle « rien côté enfant » vaut déjà). Même seed que le
   premier test de ce bloc (une mention bien réelle côté encadrant) rejouée sur
   l'accueil ENFANT : le sélecteur `.enc-trav-cap` lui-même (pas le texte, qui a déjà
   changé une fois et n'a rien à faire dans une assertion de PORTÉE — le sélecteur,
   lui, est scopé au seul composant encadrant). */
test('critère 21 (par analogie, #537 hors périmètre) : aucune mention de cap côté enfant', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(CLEAR_PIN);
	await page.addInitScript(SEED_CAP_LECON);
	await gotoHash(page, 'accueil');

	await expect(page.locator('.enc-trav-cap')).toHaveCount(0);

	expect(errors).toEqual([]);
});
