/* ============================================================
   Mots casés (#664) — smoke e2e, contre les critères numérotés de l'issue.

   Ce que couvrent déjà les tests Vitest (`tests/grille-mots.test.ts`,
   `tests/mots-cases.test.ts`, `tests/mots-cases-etat.test.ts`) et qui n'a donc
   rien à faire ici : le catalogue (1, 2), l'absence de lecture d'horloge (4),
   les motifs en tant que DONNÉES (5-8), la résolubilité et la « non-devinabilité »
   du remplissage sur 200 tirages (9, 10), l'unicité des mots (11), leur origine
   dans les banques relues (12), le refus silencieux d'une pose de mauvaise
   longueur (16), le double signalement d'un conflit ET les couleurs à 3:1 (20,
   21), la lettre commune accents compris (22), la définition de « terminée »
   (23), le bornage à la LECTURE d'un état bricolé dans le stockage (35), le
   préfixe des clés (36, `tests/cles-stockage-gate.test.ts`), l'absence de
   `capterErreur` (37, `tests/erreurs-journal-gate.test.ts`) et l'indifférence à
   la classe du profil (40). Ici, uniquement ce qui ne se vérifie que dans un
   navigateur : le geste, le rendu, la persistance RÉELLE (survivre à un
   rechargement, pas seulement à une relecture pure) et deux critères qui
   réclament une MESURE (19) ou un DEUX-SENS (30 + 31 ensemble).

   Sélecteurs stables : `.mc-taille[data-taille]`, `.mc-grille[data-taille]`,
   `.mc-case[data-ligne][data-colonne]` et ses `data-h`/`data-v`/`data-cible`/
   `data-conflit`/`data-conflit-mot`/`data-double`, `.mc-item[data-mot]`,
   `.mc-mot[data-mot]`, `.mc-mot-nb`, `.mc-ecoute[data-ecoute]`, `#mcMain`,
   `#mcProgres`, `#mcCoince`, `.mc-fin`, `#mcNouvelle`, `#mcEcouterRegle`.

   ── Comment cette spec pose un mot sans jamais connaître LA solution ────────
   Le jeu ne l'expose nulle part (hors périmètre : « un indice qui révélerait un
   mot ou son emplacement »). Deux façons, selon le besoin :
   - la plupart des tests posent N'IMPORTE QUEL mot compatible : sélectionner un
     mot puis toucher un `.mc-case[data-cible]` (la mise en évidence des
     emplacements compatibles, elle-même testée au critère 30) — la pose fautive
     étant acceptée (critère 20, pas testé ici), la case n'a pas besoin d'être
     LA bonne ;
   - deux tests ont besoin de mieux : « finir la grille » (24, 39) exige une
     assignation SANS AUCUN conflit, et « provoquer un conflit » (30, 31) en
     exige une AVEC. Les deux se déduisent en lisant la géométrie exposée par le
     DOM (`data-h`/`data-v`, qui donnent croisements et longueurs) et les mots
     affichés en toutes lettres dans la liste — jamais en import de `src/`. Un
     petit solveur par retour en arrière (`resoudreGrille`) trouve UNE
     assignation valide ; rien n'exige qu'elle soit CELLE tirée par le jeu
     (aucune exigence d'unicité, cf. les notes de cadrage de l'issue).
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash, seedJeuxPossedesScript, ouvrirEtagere } from './helpers';

declare global {
	interface Window {
		/** Compteur posé par `ESPION_TTS` : combien de fois l'app a parlé. */
		__ttsAppels: number;
		/** Compteur posé par `stubVoixFr` : idem, avec une voix FR simulée. */
		__e2eSpeakCalls: number;
	}
}

/* Enregistre les appels à la synthèse vocale et FORCE l'absence de voix.
   Chromium headless n'en expose normalement aucune par défaut — mais ce n'est
   pas garanti sur toute machine : sur ce poste Windows, `getVoices()` a fini
   par rendre de vraies voix système une fois le moteur SAPI « chaud » (constaté
   après quelques tests, jamais sur les deux premiers). Écraser `getVoices()`
   ferme la question plutôt que de parier sur l'environnement — c'est ce que le
   critère 26 doit rester vrai QUEL QUE SOIT l'appareil. Posé AVANT le
   chargement de l'application (même motif que sudoku.spec.ts). */
const ESPION_TTS = `(function(){
	window.__ttsAppels = 0;
	try {
		var s = window.speechSynthesis;
		if (s) {
			s.getVoices = function(){ return []; };
			if (typeof s.speak === 'function') {
				var vrai = s.speak.bind(s);
				s.speak = function(u){ window.__ttsAppels++; return vrai(u); };
			}
		}
	} catch (e) {}
})();`;

/* Simule une voix FR locale (repris de ortho-atelier-ecouter.spec.ts) : sans ce
   stub, aucun bouton `.mc-ecoute` ne serait jamais posé, et le critère 25 ne
   pourrait pas être exercé du tout en headless. */
function stubVoixFr(): string {
	return `(() => {
		const voix = { lang: 'fr-FR', name: 'Voix FR de test', localService: true, default: true, voiceURI: 'e2e-voix-fr' };
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

/* Sème un plafond du jour presque atteint : `secondesRestantes` de marge avant
   la borne (10 minutes par défaut, `PLAFOND_DEFAUT_MINUTES`). Le jour est
   calculé EN LOCAL, comme `jourLocal()` (`src/core/jeux/plafond.ts`) — sinon la
   graine tomberait sur « hier » ou « demain » selon le fuseau du runner. */
function seedPlafondPresqueAtteintScript(secondesDeMarge: number, uuid = 'e2e'): string {
	const consomme = 10 * 60 - secondesDeMarge;
	return `(function(){
		var d = new Date();
		var mm = String(d.getMonth() + 1).padStart(2, '0');
		var jj = String(d.getDate()).padStart(2, '0');
		var jour = d.getFullYear() + '-' + mm + '-' + jj;
		localStorage.setItem(${JSON.stringify(`${uuid}/ludaskia_jeux_plafond`)}, JSON.stringify({ jour: jour, secondes: ${consomme} }));
	})();`;
}

/* On désigne le jeu par `data-jeu="mots-cases"` plutôt que « le premier de la
   liste » : c'est le marqueur que `tests/couverture-e2e-gate.test.ts` cherche
   pour rattacher ce fichier au runner (#664). */
async function entrerDansLeJeu(page: Page): Promise<void> {
	await ouvrirEtagere(page);
	await page.locator('.jeu-item[data-jeu="mots-cases"]').click();
	await page.locator('#jeuEcran').waitFor({ state: 'visible' });
	await expect(page.locator('.mc-grille')).toBeVisible();
}

async function ouvrirMotsCases(page: Page): Promise<void> {
	await page.addInitScript(seedJeuxPossedesScript(['mots-cases']));
	await gotoHash(page, 'accueil');
	await entrerDansLeJeu(page);
}

/* ---------- Lire la géométrie exposée par le DOM, sans jamais importer src/ ---------- */

/** Lit `data-h`/`data-v` de chaque `.mc-case` pour reconstruire, PUREMENT depuis
    le rendu, la liste des emplacements (leurs cases, dans l'ordre de lecture du
    mot) — le même DOM que celui que l'enfant voit, rien de plus. */
function lireEmplacementsJS(): string {
	return `
		(() => {
			const cases = [...document.querySelectorAll('.mc-case')];
			const par = new Map();
			for (const el of cases) {
				const ligne = Number(el.dataset.ligne);
				const colonne = Number(el.dataset.colonne);
				for (const attr of ['h', 'v']) {
					const brut = el.dataset[attr];
					if (brut === undefined) continue;
					const i = Number(brut);
					const liste = par.get(i) || [];
					liste.push({ ligne, colonne });
					par.set(i, liste);
				}
			}
			return [...par.entries()]
				.map(([index, cellules]) => {
					const memeLigne = cellules.every((c) => c.ligne === cellules[0].ligne);
					const triees = [...cellules].sort((a, b) => memeLigne ? a.colonne - b.colonne : a.ligne - b.ligne);
					return { index, cellules: triees, longueur: triees.length };
				})
				.sort((a, b) => a.index - b.index);
		})()
	`;
}

interface PlacementSolution {
	mot: string;
	ligne: number;
	colonne: number;
}

/** Trouve UNE assignation complète, valide sur tous les croisements, de mots à
    emplacements — un petit solveur par retour en arrière, tournant sur la seule
    géométrie et les mots affichés (jamais sur une solution cachée : il n'y en a
    pas d'exposée, et aucune exigence d'unicité ne pèse sur celle qu'il trouve).
    `null` si la grille rendue n'admet aucune assignation (violerait le critère 9,
    déjà éprouvé par Vitest sur 200 tirages — ce cas ne devrait jamais survenir
    ici, d'où l'assertion explicite côté appelant plutôt qu'un échec muet). */
async function resoudreGrille(page: Page): Promise<PlacementSolution[] | null> {
	return page.evaluate(`
		(() => {
			const emplacements = ${lireEmplacementsJS()};
			function croise(a, b) {
				for (let pa = 0; pa < a.cellules.length; pa++) {
					for (let pb = 0; pb < b.cellules.length; pb++) {
						if (a.cellules[pa].ligne === b.cellules[pb].ligne && a.cellules[pa].colonne === b.cellules[pb].colonne) {
							return { pa, pb };
						}
					}
				}
				return null;
			}
			const mots = [...document.querySelectorAll('.mc-mot')].map((b) => b.dataset.mot || '');
			const lettres = (mot) => [...mot.normalize('NFC')];
			const maj = (l) => l.toLocaleUpperCase('fr');
			const assignation = emplacements.map(() => null);
			const pris = new Set();
			function backtrack(k) {
				if (k === emplacements.length) return true;
				const e = emplacements[k];
				for (const mot of mots) {
					if (pris.has(mot)) continue;
					const l = lettres(mot);
					if (l.length !== e.longueur) continue;
					let ok = true;
					for (let j = 0; j < k; j++) {
						const cr = croise(e, emplacements[j]);
						if (!cr) continue;
						const autre = lettres(assignation[j]);
						if (maj(l[cr.pa]) !== maj(autre[cr.pb])) { ok = false; break; }
					}
					if (!ok) continue;
					assignation[k] = mot;
					pris.add(mot);
					if (backtrack(k + 1)) return true;
					pris.delete(mot);
					assignation[k] = null;
				}
				return false;
			}
			if (!backtrack(0)) return null;
			return emplacements.map((e, k) => ({ mot: assignation[k], ligne: e.cellules[0].ligne, colonne: e.cellules[0].colonne }));
		})()
	`) as Promise<PlacementSolution[] | null>;
}

interface PaireConflit {
	motA: string;
	ligneA: number;
	colonneA: number;
	motB: string;
	ligneB: number;
	colonneB: number;
}

/** Trouve deux mots à poser sur un MÊME croisement dont la lettre commune
    diffère — un conflit garanti, construit depuis le seul rendu (géométrie +
    mots affichés), jamais depuis une solution cachée. Parcourt tous les
    croisements et tous les couples de mots compatibles ; `null` seulement si
    aucune combinaison de la grille rendue ne se contredit nulle part (cas non
    rencontré en pratique — le vivier est assez varié — d'où l'échec explicite
    plutôt qu'un silence, cf. e2e/README.md). */
async function trouverPaireConflit(page: Page): Promise<PaireConflit | null> {
	return page.evaluate(`
		(() => {
			const emplacements = ${lireEmplacementsJS()};
			function croise(a, b) {
				for (let pa = 0; pa < a.cellules.length; pa++) {
					for (let pb = 0; pb < b.cellules.length; pb++) {
						if (a.cellules[pa].ligne === b.cellules[pb].ligne && a.cellules[pa].colonne === b.cellules[pb].colonne) {
							return { pa, pb };
						}
					}
				}
				return null;
			}
			const mots = [...document.querySelectorAll('.mc-mot')].map((b) => b.dataset.mot || '');
			const lettres = (mot) => [...mot.normalize('NFC')];
			const maj = (l) => l.toLocaleUpperCase('fr');
			for (let a = 0; a < emplacements.length; a++) {
				for (let b = a + 1; b < emplacements.length; b++) {
					const cr = croise(emplacements[a], emplacements[b]);
					if (!cr) continue;
					for (const motA of mots) {
						if (lettres(motA).length !== emplacements[a].longueur) continue;
						for (const motB of mots) {
							if (motB === motA) continue;
							if (lettres(motB).length !== emplacements[b].longueur) continue;
							if (maj(lettres(motA)[cr.pa]) !== maj(lettres(motB)[cr.pb])) {
								return {
									motA, ligneA: emplacements[a].cellules[0].ligne, colonneA: emplacements[a].cellules[0].colonne,
									motB, ligneB: emplacements[b].cellules[0].ligne, colonneB: emplacements[b].cellules[0].colonne,
								};
							}
						}
					}
				}
			}
			return null;
		})()
	`) as Promise<PaireConflit | null>;
}

interface PoseMot {
	mot: string;
	ligne: string;
	colonne: string;
}

/** Sélectionne le PREMIER mot de la liste et le pose sur le premier emplacement
    compatible mis en évidence (`data-cible`) : la pose fautive étant acceptée
    (critère 20), l'endroit n'a pas besoin d'être LE bon. */
async function poserPremierMotCible(page: Page): Promise<PoseMot> {
	const motBtn = page.locator('.mc-mot').first();
	const mot = (await motBtn.getAttribute('data-mot')) ?? '';
	await motBtn.click();
	const cible = page.locator('.mc-case[data-cible]').first();
	await cible.waitFor({ state: 'visible' });
	const ligne = (await cible.getAttribute('data-ligne')) ?? '';
	const colonne = (await cible.getAttribute('data-colonne')) ?? '';
	await cible.click();
	return { mot, ligne, colonne };
}

/* ---------- Critère 3 ---------- */

test('critère 3 : le plafond du jour atteint refuse toute grille neuve — le refus reste le défaut', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedJeuxPossedesScript(['mots-cases']));
	await page.addInitScript(seedPlafondPresqueAtteintScript(4)); // 4 s de marge
	await gotoHash(page, 'accueil');
	await entrerDansLeJeu(page);

	const lireMotifSauvegarde = () =>
		page.evaluate(() => {
			const brut = localStorage.getItem('e2e/ludaskia_jeux_mots-cases_partie');
			if (!brut) return null;
			try {
				return (JSON.parse(brut) as { motif?: string }).motif ?? null;
			} catch {
				return null;
			}
		});

	const motifAvant = await lireMotifSauvegarde();
	expect(motifAvant, 'la toute première grille doit déjà être sauvegardée').not.toBeNull();

	// Horloge truquée : seul moyen déterministe de dépasser les 4 s de marge sans
	// un `waitForTimeout` non déterministe (cf. e2e/README.md).
	await page.clock.install();
	await page.clock.fastForward(8000); // dépasse largement la marge

	// Choisir l'AUTRE taille force `charger()` → exactement la même porte
	// (`avantNouvellePartie`) qu'un appui sur « Nouvelle grille ».
	const autreTaille =
		(await page.locator('.mc-grille').getAttribute('data-taille')) === 'petite'
			? 'grande'
			: 'petite';
	await page.locator(`.mc-taille[data-taille="${autreTaille}"]`).click();
	await page.clock.fastForward(1000); // laisse partir le `setTimeout(openEtagere, 0)` du refus

	await expect(page.locator('#jeuxEtagere')).toBeVisible();

	// Refusé : la grille SAUVEGARDÉE n'a jamais changé — aucune grille neuve n'a démarré.
	const motifApres = await lireMotifSauvegarde();
	expect(motifApres).toBe(motifAvant);

	expect(errors).toEqual([]);
});

/* ---------- Critères 14, 17, 18 et 29 ---------- */

test('critères 14, 17, 18 et 29 : un mot se prend en main puis se pose ou se retire, rien ne se saisit au clavier, la longueur est en clair', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCases(page);

	// Critère 29 : chaque mot affiche SA longueur, à ne pas compter à l'œil.
	const items = page.locator('.mc-item');
	const total = await items.count();
	expect(total).toBeGreaterThan(0);
	for (let i = 0; i < total; i++) {
		const item = items.nth(i);
		const mot = (await item.getAttribute('data-mot')) ?? '';
		const nb = ((await item.locator('.mc-mot-nb').textContent()) ?? '').trim();
		expect(Number(nb)).toBe([...mot.normalize('NFC')].length);
	}

	// Critère 18 : aucun champ de saisie n'existe dans ce plateau.
	await expect(page.locator('.mc input, .mc [contenteditable="true"]')).toHaveCount(0);

	const motBtn = page.locator('.mc-mot').first();
	const mot = await motBtn.getAttribute('data-mot');

	// Critère 14, premier temps : sélectionner un mot le prend EN MAIN.
	await motBtn.click();
	await expect(motBtn).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#mcMain')).toContainText(mot ?? '');

	const cible = page.locator('.mc-case[data-cible]').first();
	await cible.waitFor({ state: 'visible' });
	const ligne = await cible.getAttribute('data-ligne');
	const colonne = await cible.getAttribute('data-colonne');

	// Critère 18 : la case est un vrai bouton, atteignable au Tab…
	await cible.focus();
	await expect(cible).toBeFocused();
	// … et une lettre tapée n'y écrit rien (aucun écouteur clavier sur le plateau).
	await page.keyboard.press('KeyB');
	await expect(cible).toHaveText('');
	await expect(motBtn).toHaveAttribute('aria-pressed', 'true'); // le mot en main n'a pas bougé

	// Critère 14, second temps : toucher la case y pose le mot.
	await cible.click();
	await expect(page.locator(`.mc-item[data-mot="${mot}"]`)).toBeHidden();
	const caseCible = page.locator(`.mc-case[data-ligne="${ligne}"][data-colonne="${colonne}"]`);
	await expect(caseCible).not.toHaveText('');

	// Critère 17 : retirer (rien en main → la case retire) rend le mot à la liste.
	await caseCible.click();
	await expect(page.locator(`.mc-item[data-mot="${mot}"]`)).toBeVisible();
	await expect(caseCible).toHaveText('');

	expect(errors).toEqual([]);
});

/* ---------- Critère 15 ---------- */

test('critère 15 : le mot en main reste visible après avoir fait défiler la grille', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 360, height: 480 }); // court, pour forcer le défilement
	await ouvrirMotsCases(page);
	await page.locator('.mc-taille[data-taille="grande"]').click(); // le plus de contenu à faire défiler
	await expect(page.locator('.mc-grille')).toHaveAttribute('data-taille', 'grande');

	const motBtn = page.locator('.mc-mot').first();
	const mot = await motBtn.getAttribute('data-mot');
	await motBtn.click();
	await expect(page.locator('#mcMain')).toHaveAttribute('data-plein', '1');

	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

	const boite = await page.locator('#mcMain').boundingBox();
	expect(
		boite,
		'le bandeau du mot en main doit rester mesurable après le défilement',
	).not.toBeNull();
	expect(
		boite?.y ?? -1,
		'il doit rester DANS le viewport, pas défilé hors champ',
	).toBeGreaterThanOrEqual(0);
	expect((boite?.y ?? 0) + (boite?.height ?? 0)).toBeLessThanOrEqual(480);
	await expect(page.locator('#mcMain')).toContainText(mot ?? '');

	expect(errors).toEqual([]);
});

/* ---------- Critère 19 ---------- */

test('critère 19 : à 360 px, une case de la petite grille mesure au moins 44 px et une case de la grande au moins 24 px', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 360, height: 640 });
	await ouvrirMotsCases(page);

	async function minCotePx(): Promise<number> {
		const cases = page.locator('.mc-case');
		const n = await cases.count();
		expect(n).toBeGreaterThan(0);
		let min = Infinity;
		for (let i = 0; i < n; i++) {
			const boite = await cases.nth(i).boundingBox();
			expect(boite).not.toBeNull();
			min = Math.min(min, boite?.width ?? 0, boite?.height ?? 0);
		}
		return min;
	}

	await expect(page.locator('.mc-grille')).toHaveAttribute('data-taille', 'petite');
	const minPetite = await minCotePx();
	console.log(`[mots-cases] case PETITE à 360 px : ${minPetite.toFixed(1)} px (plancher 44 px)`);
	expect(
		minPetite,
		`case de la petite grille mesurée à ${minPetite.toFixed(1)} px`,
	).toBeGreaterThanOrEqual(44);

	await page.locator('.mc-taille[data-taille="grande"]').click();
	await expect(page.locator('.mc-grille')).toHaveAttribute('data-taille', 'grande');
	const minGrande = await minCotePx();
	console.log(`[mots-cases] case GRANDE à 360 px : ${minGrande.toFixed(1)} px (plancher 24 px)`);
	expect(
		minGrande,
		`case de la grande grille mesurée à ${minGrande.toFixed(1)} px`,
	).toBeGreaterThanOrEqual(24);

	expect(errors).toEqual([]);
});

/* ---------- Critères 26 et 27, sans voix (Chromium headless par défaut) ---------- */

test('critères 26 et 27 : sans voix disponible, aucun bouton d’écoute, et rien ne parle tout seul à l’ouverture', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(ESPION_TTS);
	await ouvrirMotsCases(page);

	// Critère 26 : Chromium headless n'expose aucune voix par défaut → aucun bouton.
	await expect(page.locator('.mc-ecoute')).toHaveCount(0);
	// Critère 27 : ouvrir le jeu n'a rien fait parler.
	expect(await page.evaluate(() => window.__ttsAppels)).toBe(0);

	expect(errors).toEqual([]);
});

/* ---------- Critères 25 et 27, avec une voix simulée ---------- */

test('critères 25 et 27 : une voix disponible → un bouton d’écoute PAR mot, et un appui lit un seul mot à la fois', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFr());
	await ouvrirMotsCases(page);

	// Critère 27 : monter l'écran n'a rien lu tout seul, même avec une voix disponible.
	expect(await page.evaluate(() => window.__e2eSpeakCalls)).toBe(0);

	// Critère 25 : UN bouton PAR mot — jamais une lecture globale de la liste.
	const total = await page.locator('.mc-item').count();
	await expect(page.locator('.mc-ecoute')).toHaveCount(total);

	await page.locator('.mc-ecoute').first().click();
	expect(await page.evaluate(() => window.__e2eSpeakCalls)).toBe(1);

	// Un second mot lu : un second appel, pas un paquet entier relu d'un coup.
	await page.locator('.mc-ecoute').nth(1).click();
	expect(await page.evaluate(() => window.__e2eSpeakCalls)).toBe(2);

	expect(errors).toEqual([]);
});

/* ---------- Critères 28 et 32 ---------- */

test('critères 28 et 32 : les lettres posées s’affichent en MAJUSCULES, la progression se lit en MONTANT sans chrono', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCases(page);

	const lireProgres = async (): Promise<number[]> => {
		const texte = (await page.locator('#mcProgres').textContent()) ?? '';
		return [...texte.matchAll(/\d+/g)].map((m) => Number(m[0]));
	};

	const avant = await lireProgres();
	expect(avant, 'la progression doit afficher deux nombres (posés / total)').toHaveLength(2);
	expect(avant[0]).toBe(0);
	const total = avant[1];
	expect(total).toBeGreaterThan(0);
	const texteAvant = (await page.locator('#mcProgres').textContent()) ?? '';
	expect(texteAvant, 'aucun compte à rebours ni chronomètre').not.toMatch(
		/\d+\s*:\s*\d\d|minute|seconde|restant|\breste\b/i,
	);

	const { ligne, colonne } = await poserPremierMotCible(page);
	const caseCible = page.locator(`.mc-case[data-ligne="${ligne}"][data-colonne="${colonne}"]`);

	// Critère 28 : que des majuscules dans la case, jamais une minuscule.
	const lettre = ((await caseCible.textContent()) ?? '').trim();
	expect(lettre.length).toBeGreaterThan(0);
	expect(lettre).toBe(lettre.toLocaleUpperCase('fr'));
	expect(lettre).not.toMatch(/\p{Ll}/u);

	// Critère 32 : la progression a MONTÉ d'une unité, le total n'a pas bougé.
	const apres = await lireProgres();
	expect(apres[0]).toBe(1);
	expect(apres[1]).toBe(total);

	expect(errors).toEqual([]);
});

/* ---------- Critères 30 et 31 ---------- */

test('critères 30 et 31 : couper les aides visuelles éteint le surlignage des emplacements, jamais le signalement de conflit', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(seedJeuxPossedesScript(['mots-cases']));
	await gotoHash(page, 'accueil');
	await entrerDansLeJeu(page);

	// Aides ON par défaut : sélectionner un mot éclaire au moins un emplacement.
	const premierMot = page.locator('.mc-mot').first();
	await premierMot.click();
	await expect(page.locator('.mc-case[data-cible]').first()).toBeVisible();
	await premierMot.click(); // on redépose le mot en main avant de choisir la paire du conflit

	const paire = await trouverPaireConflit(page);
	expect(
		paire,
		'aucune paire de mots en conflit n’a pu être formée sur cette grille',
	).not.toBeNull();
	const { motA, ligneA, colonneA, motB, ligneB, colonneB } = paire as PaireConflit;

	await page.locator(`.mc-mot[data-mot="${motA}"]`).click();
	await page.locator(`.mc-case[data-ligne="${ligneA}"][data-colonne="${colonneA}"]`).click();
	await page.locator(`.mc-mot[data-mot="${motB}"]`).click();
	await page.locator(`.mc-case[data-ligne="${ligneB}"][data-colonne="${colonneB}"]`).click();

	await expect(page.locator('.mc-case[data-conflit]')).toHaveCount(1);

	// L'encadrant coupe les aides visuelles des jeux (même réglage que le sudoku).
	await gotoHash(page, 'encadrant/reglages');
	const bascule = page.locator('[data-act="set-jeux-pref"][data-pref="sansAidesJeux"]');
	await expect(bascule).toBeVisible();
	await bascule.check();

	await gotoHash(page, 'accueil');
	await entrerDansLeJeu(page);

	// Critère 31 : le conflit est toujours là, sans qu'on ait rien reposé.
	await expect(page.locator('.mc-case[data-conflit]')).toHaveCount(1);

	// Critère 30 : le surlignage, lui, a disparu — même en reprenant un mot de la liste.
	const motRestant = page.locator('.mc-item:not([hidden]) .mc-mot').first();
	await motRestant.click();
	await expect(page.locator('.mc-case[data-cible]')).toHaveCount(0);

	expect(errors).toEqual([]);
});

/* ---------- Critères 24 et 39 ---------- */

test('critères 24 et 39 : finir une grille reste calme, et une seconde d’affilée ne fait apparaître aucun compteur', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCases(page);

	const finirLaGrille = async (): Promise<void> => {
		const solution = await resoudreGrille(page);
		expect(
			solution,
			'la grille servie doit être résoluble (critère 9, éprouvé côté Vitest)',
		).not.toBeNull();
		for (const { mot, ligne, colonne } of solution ?? []) {
			await page.locator(`.mc-mot[data-mot="${mot}"]`).click();
			await page.locator(`.mc-case[data-ligne="${ligne}"][data-colonne="${colonne}"]`).click();
		}
		await expect(page.locator('.mc-fin')).toBeVisible();
	};

	await finirLaGrille();

	// Critère 24 : un panneau discret, jamais un habillage de récompense. Les
	// coquilles `.modal-overlay` (célébration, montée de niveau, trophées…) sont
	// TOUJOURS présentes dans le DOM (`app.html`), juste masquées par défaut —
	// c'est donc leur VISIBILITÉ qu'il faut vérifier, pas leur seule existence.
	await expect(page.locator('.modal-overlay:visible')).toHaveCount(0);
	const texteFin = ((await page.locator('.mc-fin').innerText()) ?? '').toLowerCase();
	expect(texteFin).not.toMatch(/\bxp\b|médaille|trophée|niveau|palier|objectif/);
	await expect(page.locator('#mcNouvelle')).toBeVisible();

	// Critère 39 : pas de compteur de série, même après une seconde grille enchaînée.
	await page.locator('#mcNouvelle').click();
	await expect(page.locator('.mc-fin')).toBeHidden();
	await finirLaGrille();

	const texteEcran = (await page.locator('#jeuEcran').innerText()) ?? '';
	expect(texteEcran).not.toMatch(/\d+\s*(grilles?|parties?)\s*(d['’]affil|de suite|enchaîn)/i);

	expect(errors).toEqual([]);
});

/* ---------- Critères 33 (moitié e2e) et 34 (moitié e2e) ---------- */

test('critères 33 et 34 (moitié e2e) : la grille survit à un rechargement BRUTAL — donc à chaque pose, pas seulement à la sortie —, et à la sortie par le bouton', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await ouvrirMotsCases(page);

	const { mot, ligne, colonne } = await poserPremierMotCible(page);
	const caseCible = page.locator(`.mc-case[data-ligne="${ligne}"][data-colonne="${colonne}"]`);
	await expect(caseCible).not.toHaveText('');

	// Critère 34 : rechargement BRUTAL, SANS passer par le bouton de sortie — seule
	// une sauvegarde faite AU MOMENT de la pose (pas à la sortie) peut survivre à ça.
	await page.reload({ waitUntil: 'networkidle' });
	await page.locator('.mc-grille').waitFor({ state: 'visible' });

	await expect(caseCible).not.toHaveText('');
	await expect(page.locator(`.mc-item[data-mot="${mot}"]`)).toBeHidden();

	// Critère 33 : et la sortie PAR le bouton prévu la retrouve aussi.
	await page.locator('#btnQuitterJeu').click();
	await expect(page.locator('#jeuxEtagere')).toBeVisible();
	await page.locator('.jeu-item[data-jeu="mots-cases"]').click();
	await expect(page.locator('.mc-grille')).toBeVisible();
	await expect(caseCible).not.toHaveText('');

	expect(errors).toEqual([]);
});
