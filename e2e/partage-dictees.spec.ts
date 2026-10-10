/* ============================================================
   Séance partagée (#734), PR 5, côté ENFANT : une DICTÉE envoyée par lien.

   Spec écrite AVANT l'implémentation, depuis le contrat de la PR 5 (§1, §2, §6 et §10, qui
   prime) et les critères 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 23, 25 et 30 de l'issue.
   Elle est ROUGE tant que l'envoi d'une dictée est refusé en `format` (`#partageRefus` au
   lieu de l'accueil) et que les écrans décrits ci-dessous n'existent pas.

   Trois mots écrits à la main (le tirage ne joue aucun rôle) : le 1er juste (avec un
   « comme dans »), le 2e faux, le 3e, une cible VERBE, en « Je ne sais pas ».

   Voix : l'hôte n'en a pas de fiable, donc elle est simulée AVANT la navigation par un stub
   qui (a) enregistre chaque texte passé à `speak` dans `window.__dits`, (b) rend ou non une
   voix selon le drapeau `e2e-sans-voix` du stockage, (c) fait ÉCHOUER les énoncés dès que
   `e2e-echec` vaut « 1 ». Drapeaux dans `localStorage` pour pouvoir les changer entre deux
   rechargements sans réamorcer.

   Libellés : seuls sont cités mot pour mot ceux qui SONT l'objet du test (nom accessible
   « Valider », annonces « Réponse enregistrée. Mot k sur n. » et « Réponds, ou coche… »,
   « Je ne sais pas », rang « Mot k sur n » dans le nom des éléments : validés au contrat
   §10 par la relecture a11y). Le reste s'asserte sur l'exigence.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { gotoHash, watchErrors } from './helpers';
import { STUB_SANS_VOIX, STUB_VOIX_FR } from './journal-couverture';
import { codeDe, decoderResultat } from './partage-fixtures';
import type { Envoi, MotDictee } from '../src/core/partage/envoi';
import { encoder } from '../src/core/partage/codec';
import { nouvelIdentifiant } from '../src/core/partage/liens';

type Verdict = 'juste' | 'faux' | 'jnsp';
const PLAN: Verdict[] = ['juste', 'faux', 'jnsp'];
const TOTAL = 3;
const LECON = 'fr-ortho-invariables-1';

const MOTS: MotDictee[] = [
	{ mot: 'souvent', commeDans: 'vent' },
	{ mot: 'renard' },
	{ mot: 'mangeons', contexte: { avant: 'nous ', apres: ' une pomme' } },
];
const PHRASE_VERBE = 'nous mangeons une pomme';
const ENONCE_MOT = 'Mot à écrire sous la dictée'; // contrat §2 : parité avec le journal du jeu libre
const ENONCE_VERBE = 'nous … une pomme'; // `${avant}…${apres}`

/** Un envoi de dictée. `lecon` est un champ du contrat §1 : le type `Envoi` actuel l'ignore
 *  (d'où l'assertion de type, sans effet quand le code l'aura ajouté). */
function envoiDictee(over: { mots?: MotDictee[]; lecon?: string; niveau?: 'ce2' | 'cm1' } = {}) {
	return {
		id: nouvelIdentifiant(),
		libelle: 'Dictée du lundi',
		nature: 'dictee',
		niveau: over.niveau ?? 'ce2',
		lecon: over.lecon ?? LECON,
		mots: over.mots ?? MOTS,
	} as unknown as Envoi;
}
const codeDictee = (over?: Parameters<typeof envoiDictee>[0]) => codeDe(envoiDictee(over));

/* ---------- Voix simulée ---------- */

/** Pendant de STUB_VOIX_FR, mais avec journal des énoncés, voix commutable et échec
 *  commandé. `addEventListener` garde les écouteurs (STUB_VOIX_FR les jette). */
const STUB_VOIX_JOURNAL = `(() => {
  const voix = { lang: 'fr-FR', name: 'Voix FR de test', localService: true, default: true, voiceURI: 'e2e-voix-fr' };
  window.__dits = [];
  class FakeUtterance {
    constructor(text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; this._l = {}; }
    addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
  }
  window.SpeechSynthesisUtterance = FakeUtterance;
  const synth = window.speechSynthesis;
  synth.getVoices = () => (localStorage.getItem('e2e-sans-voix') === '1' ? [] : [voix]);
  synth.speak = (u) => {
    window.__dits.push(u.text);
    if (localStorage.getItem('e2e-echec') === '1') {
      setTimeout(() => (u._l.error || []).forEach((f) => f({ error: 'synthesis-failed' })), 0);
    }
  };
})();`;

const dits = (page: Page): Promise<string[]> =>
	page.evaluate(() => (window as unknown as { __dits: string[] }).__dits);
const regler = (page: Page, cle: string, valeur: string) =>
	page.evaluate(([k, v]) => localStorage.setItem(k, v), [cle, valeur]);

async function avecVoix(page: Page) {
	await page.addInitScript(STUB_VOIX_JOURNAL);
}

/* ---------- Aides de séance (même modèle que partage-runners.spec.ts) ---------- */

const valider = (page: Page) => page.locator('[data-partage-valider]');
const jnsp = (page: Page) => page.locator('#partageJnsp');
const progression = (page: Page) => page.locator('.lqcm-progress-lab');
const champ = (page: Page) => page.locator('#sheets .sprint-stage #orthoInput');

async function commencer(page: Page, code: string) {
	await gotoHash(page, `envoi/${code}`);
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await page.locator('#partageCommencer').click();
	await expect(page.locator('#partageRepere')).toBeVisible();
	await expect(valider(page)).toBeVisible();
}

const VERDICT_DIT = /Bravo|Ce n.est pas|bonne réponse|juste|faux/i;

/** Critère 17 : rien ne trahit le verdict dans l'écran de la séance. */
async function aucunVerdict(page: Page) {
	const feuille = page.locator('#sheets');
	await expect(
		feuille.locator('.correct, .wrong, .mark, .is-hit, .is-missed, .is-false, .rempli-ok'),
	).toHaveCount(0);
	await expect(feuille.locator('.sprint-correction:visible')).toHaveCount(0);
	await expect(feuille).not.toContainText(/Bravo|Presque|Ce n.est pas ça|La bonne réponse/);
	const textes = await feuille
		.locator('[role="status"]:not(#partageAnnonce), [aria-live]:not(#partageAnnonce)')
		.allTextContents();
	for (const t of textes) expect(t, 'région live de la séance').not.toMatch(VERDICT_DIT);
}

async function attendreMot(page: Page, k: number) {
	await expect(progression(page)).toContainText(new RegExp(`\\b${k}\\s*/\\s*${TOTAL}\\b`));
}

/** Joue le mot `i` : juste (le mot, `saisie` si on veut le tapé exact), faux, ou « je ne sais pas ». */
async function jouerMot(page: Page, i: number, verdict: Verdict) {
	await attendreMot(page, i + 1);
	await expect(page.locator('#partageRepere')).toBeVisible();
	await expect(valider(page)).toBeDisabled();
	await aucunVerdict(page);
	if (verdict === 'jnsp') await jnsp(page).check();
	else await champ(page).fill(verdict === 'juste' ? MOTS[i].mot : 'zzz' + MOTS[i].mot.slice(2));
	await expect(valider(page)).toBeEnabled();
	await aucunVerdict(page);
	await valider(page).click();
}

async function jouerSeance(page: Page) {
	for (let i = 0; i < TOTAL; i++) {
		await jouerMot(page, i, PLAN[i]);
		if (i < TOTAL - 1) await attendreMot(page, i + 2);
	}
}

async function resultatAffiche(page: Page) {
	const lien = await page.locator('#partageLien').inputValue();
	expect(lien).toContain('#resultat/');
	const r = await decoderResultat(lien.slice(lien.indexOf('#resultat/') + '#resultat/'.length));
	if (!r.ok) throw new Error(`résultat non décodable : ${r.raison}`);
	return r.valeur;
}

const stockage = (page: Page) =>
	page.evaluate(() =>
		Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
	);
const xp = async (page: Page): Promise<number> =>
	JSON.parse((await page.evaluate(() => localStorage.getItem('e2e/ludaskia_xp'))) ?? '0');

interface Erreur {
	lessonId: string;
	mode: string;
	question: string;
	donnee: string;
	attendue: string;
	sansTentative?: true;
}
const journal = async (page: Page): Promise<Erreur[]> =>
	JSON.parse((await page.evaluate(() => localStorage.getItem('e2e/ludaskia_erreurs'))) ?? '[]');

/* ---------- La séance entière ---------- */

test('6, 7, 8, 9, 11, 14, 17, 23, 25 · dictée de trois mots (juste, faux, je ne sais pas) : mot dicté à l’arrivée, aucun verdict avant la fin, résultat, +5 XP, journal', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await avecVoix(page);
	const code = await codeDictee();
	await gotoHash(page, `envoi/${code}`);

	// 6 : un accueil d'abord, rien n'est dicté avant « Commencer ».
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await expect(page.locator('#partageRefus')).toHaveCount(0);
	expect(await dits(page)).toEqual([]);
	const xpAvant = await xp(page);
	await page.locator('#partageCommencer').click();
	await expect(page.locator('#partageRepere')).toBeVisible();
	// 8 : pas de chrono ; « Valider » (nom accessible, intentionnel) remplace « Vérifier ».
	await expect(page.locator('#chrono')).not.toBeVisible();
	await expect(page.getByRole('button', { name: 'Valider', exact: true })).toBeVisible();
	await expect(page.locator('#btnVerify')).not.toBeVisible();
	await expect(page.locator('#partageAnnonce')).toBeEmpty();

	const stage = page.locator('#sheets .sprint-stage');
	for (let i = 0; i < TOTAL; i++) {
		await attendreMot(page, i + 1);
		// Nom du rang (§10) : intentionnel, validé par la relecture a11y.
		await expect(stage).toHaveAttribute('role', 'group');
		await expect(stage).toHaveAttribute('aria-label', `Mot ${i + 1} sur ${TOTAL}`);
		await expect(champ(page)).toHaveAccessibleName(
			new RegExp(`^Mot ${i + 1} sur ${TOTAL}\\b.*écris`),
		);
		// Le mot est DICTÉ à l'arrivée : verbe = la phrase entière, sinon le mot (+ « comme dans »).
		const attendu = i === 2 ? PHRASE_VERBE : MOTS[i].mot;
		await expect
			.poll(async () => (await dits(page)).some((t) => t.includes(attendu)), {
				message: `le mot ${i + 1} est dicté`,
			})
			.toBe(true);
		if (i === 0) {
			// Le « comme dans » accompagne la dictée (texte du contrat : « mot. Comme dans : … »).
			const premier = (await dits(page)).find((t) => t.includes('souvent'))!;
			expect(premier).toContain('vent');
			expect(
				premier.indexOf('vent', premier.indexOf('souvent') + 'souvent'.length),
			).toBeGreaterThan(-1);
		}
		if (i === 2) {
			await expect(stage.locator('p.ortho-contexte')).toBeVisible();
			await expect(stage.locator('p.ortho-run-consigne')).toContainText(/verbe/);
			await expect(stage.locator('button#btnEcouter')).toContainText(/phrase/);
		} else {
			await expect(stage.locator('p.ortho-contexte')).toHaveCount(0);
			await expect(stage.locator('button#btnEcouter')).toContainText(/mot/);
		}
		await expect(stage.locator('.accent-kb')).toBeVisible();

		await jouerMot(page, i, PLAN[i]);
		if (i < TOTAL - 1) {
			await attendreMot(page, i + 2);
			// 17 : l'annonce dit l'enregistrement, jamais le verdict.
			await expect(page.locator('#partageAnnonce')).toContainText(
				`Réponse enregistrée. Mot ${i + 2} sur ${TOTAL}.`,
			);
			await aucunVerdict(page);
		}
	}
	await expect(page.locator('#partageFin')).toBeVisible();
	await expect(page.locator('.modal:visible')).toHaveCount(0);

	// 14, 11 : résultat décodé.
	const r = await resultatAffiche(page);
	expect(r.reponses.map((x) => x.statut)).toEqual(PLAN);
	expect(r.reponses.map((x) => x.attendue)).toEqual(MOTS.map((m) => m.mot));
	for (const x of r.reponses) {
		expect(x.lecon).toBe(LECON);
		expect(x.mode).toBe('dictee');
	}
	expect(r.reponses.map((x) => x.enonce)).toEqual([ENONCE_MOT, ENONCE_MOT, ENONCE_VERBE]);
	expect(r.reponses[0].saisie).toBe('souvent');
	expect(r.reponses[1].saisie).toBe('zzz' + 'renard'.slice(2));
	expect(r.reponses[2].saisie).toBe(''); // jnsp : pas de saisie, et pas « faux »

	// 23 : +5 XP exactement.
	expect(await xp(page)).toBe(xpAvant + 5);

	// 25 : journal « partage » pour la fausse et la « je ne sais pas », rien pour la juste.
	const entrees = await journal(page);
	expect(entrees).toHaveLength(2);
	expect(entrees.every((e) => e.mode === 'partage' && e.lessonId === LECON)).toBe(true);
	const faux = entrees.filter((e) => !e.sansTentative);
	const sans = entrees.filter((e) => e.sansTentative);
	expect(faux).toHaveLength(1);
	expect(faux[0]).toMatchObject({
		question: ENONCE_MOT,
		donnee: 'zzz' + 'renard'.slice(2),
		attendue: 'renard',
	});
	expect(sans).toHaveLength(1);
	expect(sans[0]).toMatchObject({ question: ENONCE_VERBE, donnee: '', attendue: 'mangeons' });

	// 17 : la correction n'arrive qu'à la demande, en liste, un item par mot.
	await page.locator('#partageVoirCorrection').click();
	await expect(page.locator('#partageCorrectionRunner')).toBeVisible();
	const lignes = page.locator('#partageCorrectionItems li.resultat-item');
	await expect(lignes).toHaveCount(TOTAL);
	for (let i = 0; i < TOTAL; i++) {
		await expect(lignes.nth(i)).toHaveAttribute('data-statut', PLAN[i]);
	}
	expect(errors).toEqual([]);
});

test('7 · « Écouter » re-dicte le mot courant', async ({ page }) => {
	const errors = watchErrors(page);
	await avecVoix(page);
	await commencer(page, await codeDictee());
	await expect.poll(async () => (await dits(page)).length).toBeGreaterThan(0);
	const avant = (await dits(page)).length;
	await page.locator('#sheets .sprint-stage button#btnEcouter').click();
	await expect.poll(async () => (await dits(page)).length).toBeGreaterThan(avant);
	expect((await dits(page)).at(-1)).toContain('souvent');
	expect(errors).toEqual([]);
});

test('9, 11 · « Valider » : désactivé champ vide ou fait d’espaces, actif après saisie ou case cochée ; taper décoche la case ; une réponse juste entourée d’espaces est « juste »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await avecVoix(page);
	await commencer(page, await codeDictee({ mots: [{ mot: 'renard' }, { mot: 'souvent' }] }));
	const c = champ(page);

	await expect(valider(page)).toBeDisabled();
	await c.fill('   ');
	await expect(valider(page)).toBeDisabled(); // espaces seuls = vide
	await c.fill('renard');
	await expect(valider(page)).toBeEnabled();
	await c.fill('');
	await expect(valider(page)).toBeDisabled();

	await jnsp(page).check();
	await expect(valider(page)).toBeEnabled();
	await c.pressSequentially('r');
	await expect(jnsp(page)).not.toBeChecked(); // taper décoche
	await expect(valider(page)).toBeEnabled();

	await c.fill('  renard  ');
	await valider(page).click();
	await expect(progression(page)).toContainText(/2\s*\/\s*2/);
	await jnsp(page).check();
	await valider(page).click();
	await expect(page.locator('#partageFin')).toBeVisible();
	const r = await resultatAffiche(page);
	expect(r.reponses[0].statut).toBe('juste');
	expect(r.reponses[0].saisie).toBe('renard'); // saisie rognée
	expect(errors).toEqual([]);
});

test('9 · Entrée dans le champ valide quand « Valider » est actif, et ne note rien sinon', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await avecVoix(page);
	await commencer(page, await codeDictee());
	const c = champ(page);

	await c.focus();
	await c.press('Enter'); // « Valider » désactivé : rien n'est noté
	await attendreMot(page, 1);
	await expect(valider(page)).toBeDisabled();
	// Contrat §10 : le refus se dit (texte intentionnel, repris du contrat).
	await expect(page.locator('#partageAnnonce')).toContainText(/Réponds, ou coche/);

	await c.fill('souvent');
	await c.press('Enter');
	await attendreMot(page, 2);
	expect(errors).toEqual([]);
});

test('9 · clavier d’accents : une lettre accentuée active « Valider » et décoche « Je ne sais pas »', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await avecVoix(page);
	await commencer(page, await codeDictee());
	await expect(page.locator('#accentKb')).toHaveAttribute('role', 'group');
	await expect(valider(page)).toBeDisabled();
	await jnsp(page).check();
	await expect(jnsp(page)).toBeChecked();
	await page.locator('.accent-key[data-c="é"]').click();
	await expect(jnsp(page)).not.toBeChecked();
	await expect(champ(page)).toHaveValue('é');
	await expect(valider(page)).toBeEnabled();

	await champ(page).fill('');
	await expect(valider(page)).toBeDisabled();
	await page.locator('.accent-key[data-c="é"]').click();
	await expect(valider(page)).toBeEnabled();
	expect(errors).toEqual([]);
});

/* ---------- Sans voix (critère 12) ---------- */

test('12 · accueil sans voix : message et retour, pas de « Commencer », rien d’écrit ; le même lien rouvert avec une voix le propose', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(STUB_SANS_VOIX);
	const code = await codeDictee();
	await gotoHash(page, `envoi/${code}`);
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await expect(page.locator('#partageSansVoix')).toBeVisible();
	await expect(page.locator('#partageCommencer')).toHaveCount(0);
	await expect(page.locator('#partageRetour')).toBeVisible();
	expect(await stockage(page)).not.toHaveProperty(['e2e/ludaskia_partagesRecus']);

	// Même lien, avec une voix : rien n'a été figé par la visite sans voix.
	const avec = await page.context().newPage();
	const errors2 = watchErrors(avec);
	await avec.addInitScript(STUB_VOIX_FR);
	await gotoHash(avec, `envoi/${code}`);
	await expect(avec.locator('#partageAccueil')).toBeVisible();
	await expect(avec.locator('#partageCommencer')).toBeVisible();
	await expect(avec.locator('#partageSansVoix')).toHaveCount(0);
	expect(errors).toEqual([]);
	expect(errors2).toEqual([]);
});

test('12 · une voix qui arrive après l’accueil le fait passer à « Commencer », sans recharger', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(`(() => {
		window.__voixPrete = false;
		const voix = { lang: 'fr-FR', name: 'Voix FR tardive', localService: true, default: true, voiceURI: 'e2e-tardive' };
		class FakeUtterance {
			constructor(text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; }
			addEventListener() {}
		}
		window.SpeechSynthesisUtterance = FakeUtterance;
		const synth = window.speechSynthesis;
		synth.getVoices = () => (window.__voixPrete ? [voix] : []);
		synth.speak = () => {};
	})();`);
	await gotoHash(page, `envoi/${await codeDictee()}`);
	await expect(page.locator('#partageSansVoix')).toBeVisible();
	await expect(page.locator('#partageCommencer')).toHaveCount(0);

	await page.evaluate(() => {
		(window as unknown as { __voixPrete: boolean }).__voixPrete = true;
		speechSynthesis.dispatchEvent(new Event('voiceschanged'));
	});
	await expect(page.locator('#partageCommencer')).toBeVisible();
	await expect(page.locator('#partageSansVoix')).toHaveCount(0);
	// §10 : la région vocale de l'accueil annonce le changement (région, pas le libellé exact).
	await expect(page.locator('#partageVoixStatut')).toHaveAttribute('role', 'status');
	await expect(page.locator('#partageVoixStatut')).not.toBeEmpty();
	expect(errors).toEqual([]);
});

test('15, 12 · « déjà fait » : sans voix on peut recopier mais pas s’entraîner ; avec voix l’entraînement n’ajoute ni XP ni lien', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await avecVoix(page);
	const code = await codeDictee();
	await commencer(page, code);
	await jouerSeance(page);
	await expect(page.locator('#partageFin')).toBeVisible();
	const xpApres = await xp(page);

	// Sans voix.
	await regler(page, 'e2e-sans-voix', '1');
	await gotoHash(page, `envoi/${code}`);
	await expect(page.locator('#partageDejaFait')).toBeVisible();
	await expect(page.locator('#partageRecopier')).toBeVisible();
	await expect(page.locator('#partageEntrainer')).toHaveCount(0);
	await expect(page.locator('#partageSansVoix')).toBeVisible();

	// Avec voix.
	await regler(page, 'e2e-sans-voix', '0');
	await gotoHash(page, `envoi/${code}`);
	await expect(page.locator('#partageDejaFait')).toBeVisible();
	await expect(page.locator('#partageEntrainer')).toBeVisible();
	await page.locator('#partageEntrainer').click();
	await expect(page.locator('#partageRepere')).toBeVisible();
	await jouerSeance(page);
	await expect(page.locator('#partageFinEntrainement')).toBeVisible();
	await expect(page.locator('#partageLien')).toHaveCount(0);
	await expect(page.locator('#partageCorrectionItems li.resultat-item')).toHaveCount(TOTAL);
	expect(await xp(page)).toBe(xpApres);
	expect(errors).toEqual([]);
});

test('16 · voix perdue au 2e mot : écran « le son manque », rien de figé ni de journalisé, on quitte sans confirmation, le lien rouvert repart de l’accueil', async ({
	page,
}) => {
	const errors = watchErrors(page);
	const dialogues: string[] = [];
	page.on('dialog', (d) => {
		dialogues.push(d.message());
		void d.dismiss();
	});
	await avecVoix(page);
	const code = await codeDictee();
	await commencer(page, code);
	const xpAvant = await xp(page);
	const avant = await stockage(page);

	// Les énoncés échouent dès maintenant : le 1er mot est déjà dicté, l'arrivée du 2e perd la voix.
	await attendreMot(page, 1);
	await champ(page).fill('souvent');
	await regler(page, 'e2e-echec', '1');
	await valider(page).click();

	await expect(page.locator('#partageSilence')).toBeVisible();
	await expect(page.locator('#partageRetour')).toBeVisible();
	await expect(page.locator('#partageFin')).toHaveCount(0);
	expect(await xp(page)).toBe(xpAvant);
	expect(await journal(page)).toEqual([]);
	const apres = await stockage(page);
	expect(apres['e2e/ludaskia_partagesRecus'] ?? null).toBe(
		avant['e2e/ludaskia_partagesRecus'] ?? null,
	);

	// Quitter : pas de confirmation (ni boîte native ni modale).
	await page.locator('#partageRetour').click();
	await expect(page.locator('.home-grid')).toBeVisible();
	await expect(page.locator('.modal:visible')).toHaveCount(0);
	expect(dialogues).toEqual([]);

	// Rouvrir : accueil normal, pas « déjà fait ».
	await regler(page, 'e2e-echec', '0');
	await gotoHash(page, `envoi/${code}`);
	await expect(page.locator('#partageAccueil')).toBeVisible();
	await expect(page.locator('#partageDejaFait')).toHaveCount(0);
	await expect(page.locator('#partageCommencer')).toBeVisible();
	expect(errors).toEqual([]);
});

/* ---------- Liste blanche (critère 30) ---------- */

test('30 · un mot hors liste blanche (a<b) fait refuser le lien : aucun écran de dictée, aucune balise injectée', async ({
	page,
}) => {
	const errors = watchErrors(page);
	await avecVoix(page);
	// Lien FORGÉ à la main : l'encodeur honnête refuse d'écrire `a<b` (ecrire aussi strict que lire),
	// seul un faussaire peut le fabriquer. On encode donc un JSON écrit à la main.
	const code = await encoder('envoi', {
		id: nouvelIdentifiant(),
		libelle: 'Dictée du lundi',
		nature: 'dictee',
		niveau: 'ce2',
		lecon: LECON,
		mots: [{ mot: 'a<b' }, { mot: 'renard' }],
	});
	await gotoHash(page, `envoi/${code}`);
	await expect(page.locator('#partageRefus')).toBeVisible();
	await expect(page.locator('#partageAccueil')).toHaveCount(0);
	await expect(page.locator('#partageCommencer')).toHaveCount(0);
	await expect(page.locator('#sheets img')).toHaveCount(0);
	expect(errors).toEqual([]);
});
