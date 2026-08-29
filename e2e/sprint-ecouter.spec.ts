/* ============================================================
   Smoke e2e — Sprint : bouton « Écouter » l'énoncé (#630).
   Le sprint chronométré était le seul écran d'exercice sans accès à l'oral. On
   greffe le bouton `.consigne-tts` existant (cf. `ortho-atelier-ecouter.spec.ts`,
   `revision-ortho.spec.ts`) DANS `.sprint-theme`, dans les trois rendus du mode
   (saisie, QCM, correction) ; le décompte est gelé pendant la lecture (double
   codage, pas la seule couleur) ; deux textes documentent l'exception « sprint »
   de la lecture auto ; et la lecture auto ne se déclenche JAMAIS d'elle-même en
   sprint (le mode réécrit son écran à chaque question).

   Piège Chromium headless (aucune voix exposée par défaut, cf. les deux specs
   citées ci-dessus) : stub de `speechSynthesis` posé via `addInitScript` AVANT
   toute navigation. Plus riche que leur no-op : ici la FIN de l'énoncé relance le
   décompte, donc `speak(u)` mémorise l'utterance courante et `cancel()`/un appel
   explicite depuis le test déclenchent `error`/`end` dessus — sous CONTRÔLE du
   test (jamais un vrai délai), pour observer le gel PENDANT la lecture puis la
   reprise APRÈS, de façon déterministe.

   Scoping déterministe du sprint (cf. e2e/README.md « Sprint déterministe »,
   pattern de `pave-signes.spec.ts`) : composeur de bilan personnalisé scopé à UNE
   seule leçon.
   - `math-tables-addition` (catégorie « Calcul mental ») : `ExerciseType` toujours
     `type: 'text'` (jamais de mode qcm, cf. `mathType()` dans `core/catalog.ts`)
     → question à SAISIE (`#sprintInput`) garantie.
   - `num-comparer` (catégorie « Numération ») : réponse signe de comparaison,
     posée en QCM à 3 choix `.sprint-choice` (cf. `pave-signes.spec.ts`).

   Sélecteurs stables : .consigne-tts, .sprint-theme[data-tts], #sprintTime.en-pause,
   #sprintPause[hidden], #sprintStatus, #sprintInput, .sprint-choice, #sprintContinue.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

/* Voix FR stubbée, ENRICHIE (cf. en-tête) : compte les appels à `speak()` et
   permet au test de déclencher lui-même la fin (`end`) ou l'échec (`error`) de
   l'utterance en cours, via deux fonctions exposées sur `window`. */
function stubVoixFrRiche(): string {
	return `(() => {
		const voix = {
			lang: 'fr-FR',
			name: 'Voix FR de test',
			localService: true,
			default: true,
			voiceURI: 'e2e-voix-fr',
		};
		window.__e2eSpeakCalls = 0;
		window.__e2eCurrent = null;
		class FakeUtterance {
			constructor(text) {
				this.text = text; this.voice = null; this.lang = ''; this.rate = 1;
				this._listeners = {};
			}
			addEventListener(type, cb) { (this._listeners[type] || (this._listeners[type] = [])).push(cb); }
			_emit(type, detail) { (this._listeners[type] || []).forEach((cb) => cb(detail || {})); }
		}
		window.SpeechSynthesisUtterance = FakeUtterance;
		const synth = window.speechSynthesis;
		synth.getVoices = () => [voix];
		synth.speak = (u) => { window.__e2eSpeakCalls++; window.__e2eCurrent = u; };
		synth.cancel = () => {
			const u = window.__e2eCurrent;
			window.__e2eCurrent = null;
			if (u) u._emit('error', { error: 'canceled' });
		};
		// Déclenchée PAR LE TEST : simule la fin naturelle de l'énoncé en cours.
		window.__e2eFinishSpeak = () => {
			const u = window.__e2eCurrent;
			window.__e2eCurrent = null;
			if (u) u._emit('end', {});
		};
	})();`;
}

async function finirLecture(page: Page): Promise<void> {
	await page.evaluate(() =>
		(window as unknown as { __e2eFinishSpeak: () => void }).__e2eFinishSpeak(),
	);
}

async function nbAppelsSpeak(page: Page): Promise<number> {
	return page.evaluate(() => (window as unknown as { __e2eSpeakCalls: number }).__e2eSpeakCalls);
}

/* Sprint personnalisé (#64) scopé à UNE seule leçon, via le composeur de bilan
   (cf. e2e/README.md « Sprint déterministe », e2e/pave-signes.spec.ts). */
async function lancerSprintSurLeçon(
	page: Page,
	categoryId: string,
	lessonId: string,
	{ installClockBeforeLaunch = false }: { installClockBeforeLaunch?: boolean } = {},
): Promise<void> {
	await gotoHash(page, `bilan-cat-${categoryId}`);
	await page.locator('#bcSelectNone').click();
	await page.locator(`.bc-lesson-check[value="${lessonId}"]`).check();
	await page.locator('.bc-mode-radio[value="sprint"]').check();
	if (installClockBeforeLaunch) await page.clock.install(); // AVANT le lancement (cf. README)
	await page.locator('#bcRun').click();
	await expect(page.locator('#sprintTime')).toBeVisible();
}

/* Pose un intercepteur sur `#sprintStatus.textContent` : chaque AFFECTATION (pas
   chaque mutation DOM batchée, plus fiable pour compter des annonces distinctes)
   est journalisée dans `window.__e2eAnnonces`. Une région live n'a droit qu'à UNE
   annonce par question répondue (#630, C16) : deux `sprintAnnonce()` distincts
   produiraient deux entrées même s'ils tombent dans le même tour de boucle JS. */
async function espionnerAnnonces(page: Page): Promise<void> {
	await page.evaluate(() => {
		const el = document.getElementById('sprintStatus')!;
		(window as unknown as { __e2eAnnonces: string[] }).__e2eAnnonces = [];
		const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
		Object.defineProperty(el, 'textContent', {
			configurable: true,
			get() {
				return desc.get!.call(this);
			},
			set(v) {
				(window as unknown as { __e2eAnnonces: string[] }).__e2eAnnonces.push(v);
				desc.set!.call(this, v);
			},
		});
	});
}
async function lireAnnonces(page: Page): Promise<string[]> {
	return page.evaluate(() => (window as unknown as { __e2eAnnonces: string[] }).__e2eAnnonces);
}

test('Sprint (saisie) : Écouter dans .sprint-theme, gèle le minuteur (double codage) et l’annonce, puis dégèle à la fin — #630 C1 C2 C5 C6', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFrRiche());
	await lancerSprintSurLeçon(page, 'math-calcul-mental', 'math-tables-addition');

	// Forme « saisie ».
	await expect(page.locator('#sprintInput')).toBeVisible();

	// C2 : le bouton est greffé DANS .sprint-theme, qui porte l'énoncé à lire.
	const theme = page.locator('.sprint-theme');
	await expect(theme).toHaveAttribute('data-tts', /\S+/);
	const btn = theme.locator('.consigne-tts');
	await expect(btn).toBeVisible();

	// Repos : pas de pause, badge caché.
	await expect(page.locator('#sprintTime')).not.toHaveClass(/en-pause/);
	await expect(page.locator('#sprintPause')).toBeHidden();

	await btn.click();
	expect(await nbAppelsSpeak(page)).toBe(1);

	// C5 : double codage (classe + badge à mot ouvert), pas la seule couleur.
	await expect(page.locator('#sprintTime')).toHaveClass(/en-pause/);
	await expect(page.locator('#sprintPause')).toBeVisible();
	// C6 : la mise en pause est annoncée dans la région live.
	await expect(page.locator('#sprintStatus')).not.toHaveText('');

	await finirLecture(page);

	// Fin de lecture : retour à l'état initial des DEUX marqueurs.
	await expect(page.locator('#sprintTime')).not.toHaveClass(/en-pause/);
	await expect(page.locator('#sprintPause')).toBeHidden();

	expect(errors).toEqual([]);
});

test('Sprint (QCM) : Écouter au même endroit qu’en saisie, même gel/dégel — #630 C1 C2', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFrRiche());
	await lancerSprintSurLeçon(page, 'math-numeration', 'num-comparer');

	// Forme « choix » — pas de champ texte.
	await expect(page.locator('#sprintInput')).toHaveCount(0);
	await expect(page.locator('.sprint-choice')).toHaveCount(3);

	// Même greffe, même endroit (.sprint-theme).
	const theme = page.locator('.sprint-theme');
	await expect(theme).toHaveAttribute('data-tts', /\S+/);
	const btn = theme.locator('.consigne-tts');
	await expect(btn).toBeVisible();

	await btn.click();
	expect(await nbAppelsSpeak(page)).toBe(1);
	await expect(page.locator('#sprintTime')).toHaveClass(/en-pause/);
	await expect(page.locator('#sprintPause')).toBeVisible();

	await finirLecture(page);
	await expect(page.locator('#sprintTime')).not.toHaveClass(/en-pause/);
	await expect(page.locator('#sprintPause')).toBeHidden();

	expect(errors).toEqual([]);
});

test('Sprint : deux clics consécutifs sur Écouter ne déclenchent qu’UNE lecture et un seul gel — #630 C11 (négatif)', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFrRiche());
	await lancerSprintSurLeçon(page, 'math-calcul-mental', 'math-tables-addition');

	const btn = page.locator('.sprint-theme .consigne-tts');
	await btn.click();
	await btn.click(); // second clic PENDANT la lecture : sans effet (exclusif)

	expect(await nbAppelsSpeak(page)).toBe(1);
	await expect(page.locator('#sprintTime')).toHaveClass(/en-pause/);

	// Un seul gel à lever : UNE fin de lecture suffit à tout dégeler.
	await finirLecture(page);
	await expect(page.locator('#sprintTime')).not.toHaveClass(/en-pause/);
	await expect(page.locator('#sprintPause')).toBeHidden();

	expect(errors).toEqual([]);
});

test('Sprint (QCM) : une bonne réponse annonce une seule fois AVANT la question suivante, puis le focus repart sur le premier choix — #630 C7 C8 C16', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const SIGNE_LABELS: Record<string, string> = {
		'<': 'plus petit que',
		'=': 'égal à',
		'>': 'plus grand que',
	};

	await gotoHash(page, 'bilan-cat-math-numeration');
	await page.locator('#bcSelectNone').click();
	await page.locator('.bc-lesson-check[value="num-comparer"]').check();
	await page.locator('.bc-mode-radio[value="sprint"]').check();
	// Horloge truquée AVANT le lancement (avant la création du setInterval du
	// chrono ET du futur setTimeout de 600 ms qui enchaîne sur la question
	// suivante) : seul moyen déterministe d'observer l'état PENDANT cette fenêtre.
	await page.clock.install();
	await page.locator('#bcRun').click();
	await expect(page.locator('#sprintTime')).toBeVisible();

	await espionnerAnnonces(page);

	const enonce = await page.locator('.sprint-q-qcm').innerText();
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	expect(m).not.toBeNull();
	const a = Number(m![1]),
		b = Number(m![2]);
	const signe = a < b ? '<' : a > b ? '>' : '=';
	await page.locator(`.sprint-choice[aria-label="${SIGNE_LABELS[signe]}"]`).click();

	// AVANT la question suivante (le setTimeout de 600 ms n'a pas encore couru) :
	// une seule annonce, non vide.
	const annonces = await lireAnnonces(page);
	expect(annonces.filter((t) => t.trim() !== '')).toHaveLength(1);
	await expect(page.locator('.sprint-check')).toBeVisible(); // feedback ✓ affiché

	// On avance le temps pour atteindre la question suivante.
	await page.clock.fastForward(700);
	await expect(page.locator('.sprint-choice').first()).toBeVisible();

	// C8 : le focus clavier repart sur le premier choix (pas le <body>).
	const focusSurChoix = await page.evaluate(
		() => document.activeElement?.classList.contains('sprint-choice') ?? false,
	);
	expect(focusSurChoix).toBe(true);

	expect(errors).toEqual([]);
});

test('Sprint (saisie) : une erreur affiche sa propre correction avec Écouter, annoncée une seule fois — #630 C2 (correction) C16', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFrRiche());
	await lancerSprintSurLeçon(page, 'math-calcul-mental', 'math-tables-addition');

	await espionnerAnnonces(page);

	// Validation à vide (#467) : réponse fausse assumée, déterministe sans
	// recalculer la somme aléatoire.
	await page.locator('#sprintInput').press('Enter');

	await expect(page.locator('#sprintContinue')).toBeVisible();
	// C2, 3ᵉ rendu : la correction porte, elle aussi, .sprint-theme + Écouter.
	const theme = page.locator('.sprint-theme');
	await expect(theme).toHaveAttribute('data-tts', /\S+/);
	await expect(theme.locator('.consigne-tts')).toBeVisible();

	const annonces = await lireAnnonces(page);
	expect(annonces.filter((t) => t.trim() !== '')).toHaveLength(1);

	expect(errors).toEqual([]);
});

/* ---------- Régression : le décompte gèle la LECTURE, pas l'ÉCRAN ----------
   Défaut trouvé en relecture (et par l'auteur des tests Vitest) : la garde de
   `sprintAnswer` demandait « le décompte est-il gelé ? » là où elle voulait dire
   « une correction est-elle affichée ? ». Pendant une lecture, une réponse
   (saisie OU choix QCM) était donc silencieusement ignorée — l'enfant valide et
   rien ne se passe. Pire, sur la saisie, `Entrée` était routée vers « Continuer »
   dès que le décompte était gelé, donc appuyer sur Entrée pendant l'audio
   enchaînait sur la question suivante SANS compter la réponse.
   Les tests Vitest verrouillent la primitive de décompte ; seul l'e2e voit
   comment l'ÉCRAN la consomme — d'où leur intérêt ici. */

test('Sprint (saisie) : valider PENDANT la lecture compte la réponse (le sprint avance) — #630 régression sprintAnswer/enPause', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFrRiche());
	await lancerSprintSurLeçon(page, 'math-calcul-mental', 'math-tables-addition');

	await page.locator('.sprint-theme .consigne-tts').click(); // lecture démarrée, PAS terminée
	await expect(page.locator('#sprintTime')).toHaveClass(/en-pause/);

	// Validation à vide (#467) : réponse fausse assumée, déterministe. Le bouton
	// « Valider » (pas Entrée, cf. test suivant) appelle le même `sprintSubmit`.
	await page.locator('#sprintValidate').click();

	// Si la réponse avait été ignorée (bug), l'écran resterait identique (même
	// champ vide, aucune correction). Ici elle doit être prise en compte : écran
	// de correction affiché.
	await expect(page.locator('#sprintContinue')).toBeVisible();
	await expect(page.locator('.sprint-donnee')).toHaveText('Pas de réponse cette fois.');

	expect(errors).toEqual([]);
});

test('Sprint (QCM) : choisir PENDANT la lecture compte la réponse (le sprint avance) — #630 régression sprintAnswer/enPause', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const SIGNE_LABELS: Record<string, string> = {
		'<': 'plus petit que',
		'=': 'égal à',
		'>': 'plus grand que',
	};
	await page.addInitScript(stubVoixFrRiche());
	await lancerSprintSurLeçon(page, 'math-numeration', 'num-comparer');

	await page.locator('.sprint-theme .consigne-tts').click(); // lecture démarrée, PAS terminée
	await expect(page.locator('#sprintTime')).toHaveClass(/en-pause/);

	// Choix délibérément FAUX (peu importe lequel, cf. pave-signes.spec.ts) :
	// déterministe sans recalculer le tirage, et distingue nettement un clic pris
	// en compte (écran de correction) d'un clic ignoré (rien ne change).
	const enonce = await page.locator('.sprint-q-qcm').innerText();
	const m = enonce.match(/(\d+)\D+?(\d+)/);
	expect(m).not.toBeNull();
	const a = Number(m![1]),
		b = Number(m![2]);
	const bon = a < b ? '<' : a > b ? '>' : '=';
	const faux = bon === '<' ? '>' : '<';
	await page.locator(`.sprint-choice[aria-label="${SIGNE_LABELS[faux]}"]`).click();

	await expect(page.locator('#sprintContinue')).toBeVisible();

	expect(errors).toEqual([]);
});

test('Sprint (saisie) : Entrée PENDANT la lecture valide la saisie, ne saute pas la question — #630 régression Entrée/enPause', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFrRiche());
	await lancerSprintSurLeçon(page, 'math-calcul-mental', 'math-tables-addition');

	await page.locator('.sprint-theme .consigne-tts').click(); // lecture démarrée, PAS terminée
	await expect(page.locator('#sprintTime')).toHaveClass(/en-pause/);

	// Entrée sur le champ vide : si elle était routée vers « Continuer » (bug),
	// on sauterait directement à une AUTRE question, sans jamais voir la
	// correction. Ici elle doit valider (comme `sprintSubmit`) : écran de
	// correction de CETTE question.
	await page.locator('#sprintInput').press('Enter');

	await expect(page.locator('#sprintContinue')).toBeVisible();
	await expect(page.locator('.sprint-donnee')).toHaveText('Pas de réponse cette fois.');

	expect(errors).toEqual([]);
});

test('Sprint (saisie) : le témoin de pause suit précisément la lecture (pas la correction), y compris après Continuer — #630 régression sprintSyncPause', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(stubVoixFrRiche());
	await lancerSprintSurLeçon(page, 'math-calcul-mental', 'math-tables-addition');

	// 1. Écouter l'énoncé (aucune correction affichée) : le témoin s'allume.
	await page.locator('.sprint-theme .consigne-tts').click();
	await expect(page.locator('#sprintTime')).toHaveClass(/en-pause/);
	await expect(page.locator('#sprintPause')).toBeVisible();

	// 2. Répondre FAUX pendant que l'audio joue encore (validation à vide, #467) :
	// l'écran de correction s'affiche ; rien n'a encore coupé la lecture, le témoin
	// reste donc allumé (il ne s'éteint pas juste parce que l'écran a changé).
	await page.locator('#sprintValidate').click();
	await expect(page.locator('#sprintContinue')).toBeVisible();
	await expect(page.locator('#sprintTime')).toHaveClass(/en-pause/);

	// 3. L'audio se termine normalement : le témoin s'éteint aussitôt — il suit
	// SPÉCIFIQUEMENT la cause « lecture », pas la pause en général (l'écran de
	// correction, lui, se signale déjà par sa propre présence à l'écran).
	await finirLecture(page);
	await expect(page.locator('#sprintTime')).not.toHaveClass(/en-pause/);
	await expect(page.locator('#sprintPause')).toBeHidden();

	// 4. « Continuer » : le décompte repart pour de bon. Régression #630 : le
	// témoin restait allumé pour tout le reste de la partie après cet enchaînement
	// précis (écoute puis erreur PENDANT l'audio puis Continuer) — il doit rester
	// éteint, pas se rallumer ni rester bloqué au-dessus d'un chiffre qui tourne.
	await page.locator('#sprintContinue').click();
	await expect(page.locator('#sprintTime')).not.toHaveClass(/en-pause/);
	await expect(page.locator('#sprintPause')).toBeHidden();

	expect(errors).toEqual([]);
});

test('Réglages : les deux textes de l’exception « lecture auto » nomment le sprint, et aucune lecture ne s’y déclenche seule — #630 C9 C10', async ({
	page,
}) => {
	const errors = watchErrors(page);
	// Voix stubbée : sans elle la case « Lire la consigne… » reste désactivée
	// (gate identique au bouton Écouter), impossible à cocher pour le test.
	await page.addInitScript(stubVoixFrRiche());

	// C9 (a) — toggle encadrant : son libellé nomme le sprint.
	await gotoHash(page, 'encadrant/reglages');
	const toggle = page.locator('label.enc-toggle:has([data-pref="lectureConsigneAuto"])');
	await expect(toggle).toBeVisible();
	await expect(toggle).toContainText(/sprint/i);
	await toggle.locator('input').check();

	// C9 (b) — ligne enfant en lecture seule (préférences) : même exception nommée.
	await gotoHash(page, 'profils');
	await expect(page.locator('.pref-amenagements')).toContainText(/sprint/i);

	// C10 (négatif) — le réglage activé ne déclenche AUCUNE lecture en sprint,
	// même en enchaînant plusieurs questions (chacune ré-écrit l'écran, donc
	// chacune serait « la première » sans la garde `auto: false`).
	await lancerSprintSurLeçon(page, 'math-calcul-mental', 'math-tables-addition');
	await expect(page.locator('#sprintInput')).toBeVisible();
	expect(await nbAppelsSpeak(page)).toBe(0);

	await page.locator('#sprintInput').press('Enter'); // validation à vide, déterministe
	await page.locator('#sprintContinue').click();
	await expect(page.locator('#sprintInput')).toBeVisible(); // question suivante
	expect(await nbAppelsSpeak(page)).toBe(0);

	expect(errors).toEqual([]);
});
