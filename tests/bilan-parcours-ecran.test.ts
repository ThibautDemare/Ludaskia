/* ============================================================
   Écran du parcours de bilan (#777) : ce qu'il DIT à qui ne le voit pas.
   Relecture accessibilité (B2) et décision sur la jauge.

   - Le groupe de choix d'un QCM à trou est nommé par l'énoncé, trou marqué « (trou) »
     (même exigence que la `legend` des fiches, `qcm-trou-legende.test.ts`), et garde un
     nom quand la question n'a pas d'énoncé écrit.
   - La jauge se dit en questions faites : « 0 question faite sur 3 », « 1 question faite
     sur 3 » (accords de `libelleAvancee`, spec de la décision), et non « 0 sur 3 ».
   - Le bouton « Écouter » de la consigne ne dit pas deux fois un même texte (à la casse et
     à la ponctuation près), et laisse muet un énoncé `parle: ''`. La composition vit dans
     l'écran (`consigneHTML`) : on la lit dans `data-tts`, sur des questions FABRIQUÉES
     montées par le chemin de la reprise.
   - Les récompenses passent par les modales habituelles, APRÈS le récapitulatif : jamais
     de liste `.bp-recompenses` dans l'écran (décision du mainteneur). `announceRewards`
     est seulement observé, pour prouver qu'il y avait bien un gain à annoncer.

   L'écran est monté pour de vrai (happy-dom) par `lancerParcours`, sans clé de reprise.
   Le nom d'un groupe est lu comme le calcule un lecteur d'écran, quel que soit le
   mécanisme : `aria-labelledby`, sinon `aria-label`, sinon la `legend` d'un `fieldset`.
   ============================================================ */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/ui/navigation';
import { lancerParcours } from '../src/ui/bilan-parcours';
import { restaurerRunner } from '../src/ui/runner-reprise';
import { announceRewards } from '../src/ui/effects';
import { getAllLessons, getLessonById, type BilanConfig } from '../src/core/catalog';
import { questionsDuBilan } from '../src/core/bilan-parcours';
import { RESUME_VERSION, type ResumeParcours } from '../src/core/resume';
import type { QuestionRevision } from '../src/core/revision-question';
import { niveauLecon } from '../src/core/niveau-actif';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { withSeed } from '../src/core/utils';
import { defautsNom } from './qcm-trou-nom';

/* Les modales de récompense restent les vraies ; on ne fait qu'observer ce qui leur est
   remis, pour savoir qu'il y avait bien quelque chose à annoncer. */
vi.mock('../src/ui/effects', async (original) => {
	const vrai = await original<typeof import('../src/ui/effects')>();
	return { ...vrai, announceRewards: vi.fn(vrai.announceRewards) };
});

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	// Ce que l'écran réclame autour de lui : barre d'outils, chrono, zone des feuilles.
	document.body.innerHTML =
		'<button id="btnVerify"></button><button id="btnHome"></button><span id="chrono"></span><div id="sheets"></div>';
	location.hash = 'bilan-en-cours';
});

const bilan = (lessonIds: string[], questionsPerLesson: number): BilanConfig => ({
	id: '',
	label: 'Bilan d’essai',
	lessonIds,
	questionsPerLesson,
});

/** Nom accessible d'un groupe : `aria-labelledby`, sinon `aria-label`, sinon la `legend`. */
function nomAccessible(el: Element): string {
	const ids = el.getAttribute('aria-labelledby');
	if (ids)
		return ids
			.split(/\s+/)
			.map((id) => document.getElementById(id)?.textContent ?? '')
			.join(' ');
	const label = el.getAttribute('aria-label');
	if (label !== null) return label;
	return el.querySelector(':scope > legend')?.textContent ?? '';
}

/** L'énoncé affiché, trou rendu en `@` : de quoi vérifier le nom contre la phrase vue. */
function enonceAffiche(): string {
	const copie = document.querySelector('.bp-enonce')?.cloneNode(true) as HTMLElement | undefined;
	if (!copie) return '';
	copie.querySelector('.bp-trou')?.replaceWith('@');
	return copie.textContent ?? '';
}

/* Leçons dont la question de bilan est un QCM à trou, énumérées depuis le catalogue. */
function leconsQcmTrou(): string[] {
	return getAllLessons()
		.filter((l) => {
			const [q] = withSeed(5, () => questionsDuBilan(l, 1, niveauLecon(l)));
			return q?.kind === 'qcm' && q.item.text.includes('@');
		})
		.map((l) => l.id);
}

describe('Parcours : le groupe de choix d’un QCM à trou porte la phrase et son trou', () => {
	it('homophones : le groupe dit « La phrase … (trou) … », pas « Choix de réponse »', () => {
		withSeed(3, () => lancerParcours(bilan(['fr-homophones-et'], 3), null));
		const groupe = document.querySelector('#bpStage .bp-choix, #bpStage fieldset');
		expect(groupe, 'groupe de choix introuvable').not.toBe(null);
		expect(document.querySelector('.bp-trou'), 'précondition : un QCM à trou').not.toBe(null);
		expect(defautsNom(nomAccessible(groupe!), enonceAffiche())).toEqual([]);
	});

	it('toutes les leçons dont la question est un QCM à trou, item muet compris', () => {
		const ids = leconsQcmTrou();
		expect(ids.length, 'plancher : leçons à QCM à trou').toBeGreaterThanOrEqual(15);
		expect(ids, 'précondition : un item muet (parle vide) dans le lot').toContain(
			'fr-accords-groupe-nominal',
		);
		const fautes: string[] = [];
		let vus = 0;
		for (const id of ids) {
			document.getElementById('sheets')!.innerHTML = '';
			withSeed(5, () => lancerParcours(bilan([id], 1), null));
			const stage = document.getElementById('bpStage');
			if (stage?.dataset.kind !== 'qcm' || !stage.querySelector('.bp-trou')) continue;
			vus++;
			const groupe = stage.querySelector('.bp-choix, fieldset');
			if (!groupe) {
				fautes.push(`${id} : pas de groupe de choix`);
				continue;
			}
			for (const d of defautsNom(nomAccessible(groupe), enonceAffiche()))
				fautes.push(`${id} : ${d}`);
		}
		expect(vus).toBeGreaterThanOrEqual(15);
		expect(fautes).toEqual([]);
	});
});

describe('Parcours : la jauge se dit en questions faites', () => {
	it('« 0 question faite sur 3 », puis « 1 question faite sur 3 » après une réponse', () => {
		withSeed(3, () => lancerParcours(bilan(['fr-homophones-et'], 3), null));
		const jauge = () => document.querySelector('.bp-progression[role="progressbar"]');
		expect(jauge()?.getAttribute('aria-valuetext')).toBe('0 question faite sur 3');
		document.querySelector<HTMLButtonElement>('.bp-choice')!.click();
		document.querySelector<HTMLButtonElement>('#bpValider')!.click();
		expect(jauge()?.getAttribute('aria-valuetext')).toBe('1 question faite sur 3');
		document.querySelector<HTMLButtonElement>('.bp-choice')!.click();
		document.querySelector<HTMLButtonElement>('#bpValider')!.click();
		expect(jauge()?.getAttribute('aria-valuetext')).toBe('2 questions faites sur 3');
	});
});

/* ============================================================
   Lecture vocale de la consigne (bouton « Écouter ») : sans doublon, muet si voulu.
   ============================================================ */

/** Monte UNE question fabriquée, par le chemin de la reprise (« Continuer ») : c'est la
    seule entrée qui fait jouer au parcours une question qu'on choisit. */
function monterQuestion(q: QuestionRevision): void {
	const snap: ResumeParcours = {
		kind: 'runner',
		key: 'bilan-custom',
		version: RESUME_VERSION,
		savedAt: Date.now(),
		mode: 'custom',
		label: 'Bilan d’essai',
		icon: 'clipboard-text',
		categoryId: null,
		relaunch: { type: 'bilan', config: bilan([q.lessonId], 1) },
		total: 1,
		answered: 0,
		runner: 'bilan-parcours',
		exerciseMode: null,
		questions: [{ categoryId: getLessonById(q.lessonId)?.category ?? '', questions: [q] }],
		idx: 0,
		score: 0,
		parcours: { reponses: [null], partiesCorrigees: 0, ecouleMs: 0 },
	};
	expect(restaurerRunner(snap), 'le parcours ne s’est pas monté').toBe(true);
	expect(document.getElementById('bpStage'), 'carte de question absente').not.toBe(null);
}

/** Texte lu par le bouton « Écouter » de la consigne. */
const texteLu = (): string =>
	document.querySelector('#bpStage .bp-consigne [data-tts]')?.getAttribute('data-tts') ?? '';

/** Forme ORALE d'un texte : sans la casse ni la ponctuation, qui ne s'entendent pas. */
const oral = (t: string): string =>
	t
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();

/** Combien de fois `morceau` est dit dans `texte`, à l'oral. */
const fois = (texte: string, morceau: string): number =>
	oral(texte).split(oral(morceau)).length - 1;

const CONSIGNE = 'Choisis le bon mot pour compléter la phrase.';
const qcmHomophone = (parle?: string, text = 'Mon papa @ pompier.'): QuestionRevision => ({
	kind: 'qcm',
	lessonId: 'fr-homophones-et',
	item: {
		text,
		answer: 'est',
		kind: 'text',
		...(parle === undefined ? {} : { parle }),
	},
	choices: ['et', 'est'],
	consigneRenforcee: CONSIGNE,
});

describe('Parcours : la consigne se lit sans doublon, et un énoncé muet le reste', () => {
	it('homophones du catalogue (parle = consigne) : la consigne n’est dite qu’UNE fois', () => {
		withSeed(3, () => lancerParcours(bilan(['fr-homophones-et'], 3), null));
		const consigne = document.getElementById('bpConsigneAction')?.textContent ?? '';
		expect(consigne.trim(), 'précondition : une consigne affichée').not.toBe('');
		expect(fois(texteLu(), consigne)).toBe(1);
	});

	it('parle identique à la casse et à la ponctuation près : dit une seule fois', () => {
		monterQuestion(qcmHomophone('CHOISIS le bon mot, pour compléter la phrase !'));
		expect(fois(texteLu(), CONSIGNE)).toBe(1);
		expect(oral(texteLu())).toBe(oral(CONSIGNE));
	});

	it('parle vide : seule la consigne est lue, jamais la phrase (l’oral trahirait la réponse)', () => {
		monterQuestion(qcmHomophone(''));
		expect(oral(texteLu())).toBe(oral(CONSIGNE));
		expect(oral(texteLu())).not.toMatch(/papa|pompier/);
	});

	it('sans parle : la consigne PUIS la phrase, trou tu — deux textes différents, deux lectures', () => {
		monterQuestion(qcmHomophone());
		expect(oral(texteLu())).toBe(oral(`${CONSIGNE} Mon papa pompier.`));
	});

	it('parle distinct de la consigne : les deux sont lus, chacun une fois', () => {
		monterQuestion(qcmHomophone('Mon papa, blanc, pompier.'));
		expect(fois(texteLu(), CONSIGNE)).toBe(1);
		expect(fois(texteLu(), 'Mon papa blanc pompier')).toBe(1);
	});

	it('QCM sans énoncé écrit : le groupe de choix garde un nom (jamais un silence)', () => {
		monterQuestion(qcmHomophone(undefined, ''));
		const groupe = document.querySelector('#bpStage .bp-choix, #bpStage fieldset');
		expect(groupe).not.toBe(null);
		expect(nomAccessible(groupe!).trim()).not.toBe('');
	});
});

/* ============================================================
   Récompenses : les modales habituelles, après le récapitulatif — jamais une liste dans
   l'écran du parcours (décision du mainteneur, #777).
   ============================================================ */
describe('Parcours : les récompenses passent par les modales, pas par une liste à l’écran', () => {
	it('bilan fini : aucune liste `.bp-recompenses`, ni en fin de partie ni au récapitulatif ; la modale après le récapitulatif', () => {
		vi.mocked(announceRewards).mockClear();
		withSeed(3, () => lancerParcours(bilan(['fr-homophones-et'], 3), null));
		for (let n = 0; n < 3; n++) {
			document.querySelector<HTMLButtonElement>('.bp-choice')!.click();
			document.querySelector<HTMLButtonElement>('#bpValider')!.click();
		}
		// Fin de la dernière partie : le bilan est crédité, rien n'est encore annoncé.
		expect(document.getElementById('bpVoirBilan'), 'précondition : fin de partie').not.toBe(null);
		expect(document.querySelector('.bp-recompenses')).toBe(null);
		expect(vi.mocked(announceRewards)).not.toHaveBeenCalled();

		document.getElementById('bpVoirBilan')!.click();
		expect(document.querySelector('.bp-recap'), 'précondition : récapitulatif').not.toBe(null);
		expect(vi.mocked(announceRewards)).toHaveBeenCalledTimes(1);
		const [niveau, deblocages, celeb] = vi.mocked(announceRewards).mock.calls[0];
		// Non vide : sans gain, l'absence de liste ne prouverait rien.
		expect(niveau > 0 || deblocages.length > 0 || celeb.length > 0, 'aucun gain annoncé').toBe(
			true,
		);
		const ecran = document.getElementById('sheets')!;
		expect(ecran.querySelector('.bp-recompenses')).toBe(null);
		for (const c of celeb) expect(ecran.textContent ?? '', c.text).not.toContain(c.text);
		for (const r of deblocages) expect(ecran.textContent ?? '', r.texte).not.toContain(r.texte);
	});
});

/* ============================================================
   Résidus de la relecture accessibilité (R1, R3). Écrits avant la correction : rouges.
   ============================================================ */

const lu = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Bilan dont les questions se répondent dans un champ (`#bpInput`). */
const SAISIE = 'math-complements';

/** Éléments désignés par l'`aria-describedby` de `el`, dans l'ordre ; `null` pour un id
    qui ne désigne rien. */
const decritPar = (el: Element): (HTMLElement | null)[] =>
	(el.getAttribute('aria-describedby') ?? '')
		.split(/\s+/)
		.filter(Boolean)
		.map((id) => document.getElementById(id));

describe('Parcours : le champ de saisie dit d’abord son numéro, puis la consigne (R1)', () => {
	it('« Question i sur m » en tête de la description de #bpInput, puis la consigne ; chaque id existe et a du texte', () => {
		withSeed(3, () => lancerParcours(bilan([SAISIE], 2), null));
		const champ = document.getElementById('bpInput');
		expect(champ, 'précondition : une question à champ').not.toBe(null);
		const decrits = decritPar(champ!);
		expect(decrits.length, 'numéro ET consigne').toBeGreaterThanOrEqual(2);
		expect(decrits.every((e) => e !== null && lu(e.textContent ?? '') !== '')).toBe(true);
		expect(lu(decrits[0]?.textContent ?? '')).toBe('Question 1 sur 2');
		const consigne = lu(document.querySelector('#bpStage .bp-consigne-action')?.textContent ?? '');
		expect(consigne, 'précondition : une consigne affichée').not.toBe('');
		expect(
			lu(
				decrits
					.slice(1)
					.map((e) => e?.textContent ?? '')
					.join(' '),
			),
		).toContain(consigne);
	});

	it('à la question suivante, le numéro décrit est le nouveau', () => {
		withSeed(3, () => lancerParcours(bilan([SAISIE], 2), null));
		const champ = document.getElementById('bpInput') as HTMLInputElement;
		champ.value = '1';
		champ.dispatchEvent(new Event('input', { bubbles: true }));
		document.getElementById('bpValider')!.click();
		const suivant = document.getElementById('bpInput');
		expect(suivant, 'précondition : 2e question à champ').not.toBe(null);
		expect(lu(decritPar(suivant!)[0]?.textContent ?? '')).toBe('Question 2 sur 2');
	});
});

const REPONDS = "Réponds d'abord, ou touche « Je passe ».";

/** Est-il VISIBLE ? Ni `.sr-only`, ni `hidden`, ni `display: none` en style, lui ou un parent.
    (happy-dom ne charge pas les feuilles : un masquage par classe CSS ne se verrait pas ici —
    le message se retire en vidant son texte, par `hidden` ou par `display: none`.) */
function visible(el: Element): boolean {
	for (let n: Element | null = el; n; n = n.parentElement) {
		if (n.classList.contains('sr-only') || n.hasAttribute('hidden')) return false;
		if (n instanceof HTMLElement && n.style.display === 'none') return false;
	}
	return true;
}

/** Le message « Réponds d'abord… » affiché à l'écran (pas la région lue), ou `null`. */
const messageVisible = (): HTMLElement | null =>
	[...document.querySelectorAll<HTMLElement>('#sheets *')].find(
		(e) => lu(e.textContent ?? '') === REPONDS && e.children.length === 0 && visible(e),
	) ?? null;

const regionStatut = (): string =>
	lu(document.querySelector('#sheets [role="status"]')?.textContent ?? '');

/** Laisse passer l'annonce différée de la région (vidée puis remplie). */
const attendre = (): Promise<void> => new Promise((r) => setTimeout(r, 120));

describe('Parcours : valider trop tôt le DIT à l’écran, pas seulement à l’oreille (R3)', () => {
	it('clic sur Valider sans choix : message visible SOUS les boutons, et lu par la région', async () => {
		withSeed(3, () => lancerParcours(bilan(['fr-homophones-et'], 3), null));
		expect(messageVisible(), 'aucun message avant d’avoir validé').toBe(null);
		document.getElementById('bpValider')!.click();
		await attendre();
		const msg = messageVisible();
		expect(msg, 'message visible').not.toBe(null);
		const valider = document.getElementById('bpValider')!;
		expect(valider.compareDocumentPosition(msg!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(regionStatut()).toBe(lu(REPONDS));
	});

	it('Entrée dans un champ vide : même message visible ; il disparaît dès que la réponse est complète', async () => {
		withSeed(3, () => lancerParcours(bilan([SAISIE], 2), null));
		const champ = document.getElementById('bpInput') as HTMLInputElement;
		champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await attendre();
		expect(messageVisible(), 'message visible après Entrée').not.toBe(null);
		champ.value = '1';
		champ.dispatchEvent(new Event('input', { bubbles: true }));
		expect(messageVisible(), 'message encore visible, réponse complète').toBe(null);
		await attendre();
		expect(messageVisible(), 'message revenu après coup').toBe(null);
	});

	it('choisir une réponse pendant l’annonce en vol : le message ne réapparaît pas', async () => {
		withSeed(3, () => lancerParcours(bilan(['fr-homophones-et'], 3), null));
		document.getElementById('bpValider')!.click();
		document.querySelector<HTMLButtonElement>('.bp-choice')!.click();
		await attendre();
		expect(messageVisible()).toBe(null);
		expect(regionStatut()).toBe('');
	});

	it('la question change (« Je passe ») : le message disparaît', async () => {
		withSeed(3, () => lancerParcours(bilan(['fr-homophones-et'], 3), null));
		document.getElementById('bpValider')!.click();
		await attendre();
		expect(messageVisible(), 'précondition : message visible').not.toBe(null);
		document.getElementById('bpPasser')!.click();
		expect(document.querySelector('.bp-question-num')?.textContent).toContain('Question 2');
		expect(messageVisible()).toBe(null);
	});

	it('témoins : visible() refuse sr-only, hidden et display none', () => {
		document.getElementById('sheets')!.innerHTML =
			`<p class="sr-only">${REPONDS}</p><div hidden><p>${REPONDS}</p></div><p style="display: none">${REPONDS}</p>`;
		expect(messageVisible()).toBe(null);
		document.getElementById('sheets')!.insertAdjacentHTML('beforeend', `<p>${REPONDS}</p>`);
		expect(messageVisible()).not.toBe(null);
	});
});
