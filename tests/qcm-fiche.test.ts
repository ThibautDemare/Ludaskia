/* ============================================================
   QCM d'une fiche, d'un bilan ou d'une révision d'erreurs (#734, décision du mainteneur
   du 10 octobre 2026).

   Avant : un item porteur de `choices` se rendait à l'écran SANS rien à répondre (39
   couples leçon × niveau dont le mode par défaut est un QCM). Maintenant :
   - un QCM SANS trou devient un groupe de boutons radio dont la valeur alimente un champ
     `.ans` caché, corrigé comme les autres ;
   - un QCM À TROU garde son champ texte au trou ;
   - l'impression garde ses cases à cocher.
   Et le journal lit le LIBELLÉ d'un choix (« trois quarts », pas « 3/4 »).

   Attendus dérivés de la décision et des commentaires de contrat, jamais de la ligne de
   code : ce que l'enfant doit pouvoir faire (choisir, être corrigé juste), ce que le parent
   doit lire. Le câblage DOM (écouteur `change`, marquage) est dans `qcm-fiche-session`.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	renderItem,
	createRenderContext,
	checkItemAnswer,
	withLessonId,
	type Item,
	type RenderContext,
} from '../src/core/items';
import { saisieLisibleItem, attendueLisibleItem } from '../src/core/erreur-representation';
import { brut } from '../src/core/html';
import { getAllLessons } from '../src/core/catalog';
import { buildLessonFiche } from '../src/core/build';
import { withSeed } from '../src/core/utils';

const U202F = String.fromCharCode(0x202f);

/* ---------- Fixtures ---------- */

/** QCM texte sans trou (type de phrase). La bonne réponse n'est PAS en tête. */
const QCM_SIMPLE: Item = {
	text: 'Que fait cette phrase ? Où vas-tu ?',
	answer: 'Poser une question',
	choices: ['Raconter ou dire', 'Poser une question', 'Donner un ordre'],
	kind: 'text',
};

/** QCM à vue riche (fractions) : la valeur comparée est « 3/4 », l'enfant voit une fraction
 *  empilée et entend « trois quarts ». Bonne réponse en DERNIÈRE position, pour qu'une
 *  confusion d'index se voie. */
const QCM_RICHE: Item = {
	text: 'Quelle fraction est coloriée ?',
	answer: '3/4',
	choices: ['1/4', '2/4', '3/4'],
	choicesView: [
		{ html: brut('<span class="frac">1/4</span>'), label: 'un quart' },
		{ html: brut('<span class="frac">2/4</span>'), label: 'deux quarts' },
		{ html: brut('<span class="frac">3/4</span>'), label: 'trois quarts' },
	],
	kind: 'text',
};

/** QCM À TROU (homophones) : l'enfant écrit le mot au trou. */
const QCM_TROU: Item = {
	text: 'Le chat @ mangé.',
	answer: 'a',
	choices: ['a', 'à'],
	kind: 'text',
};

function dom(balisage: string): HTMLDivElement {
	const racine = document.createElement('div');
	racine.innerHTML = balisage;
	return racine;
}

function rendreEcran(it: Item, ctx: RenderContext = createRenderContext()) {
	const racine = dom(renderItem(it, ctx).balisage);
	const groupes = [...racine.querySelectorAll<HTMLFieldSetElement>('fieldset.fiche-choix')];
	const radios = [...racine.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
	const caches = [...racine.querySelectorAll<HTMLInputElement>('input.ans[type="hidden"]')];
	const visibles = [...racine.querySelectorAll<HTMLInputElement>('input.ans:not([type="hidden"])')];
	return { racine, ctx, groupes, radios, caches, visibles };
}

/* ============================================================ */

describe('renderItem à l’écran — QCM SANS trou : un groupe de boutons radio', () => {
	it('un groupe, un bouton radio par choix (dans l’ordre), aucun champ à écrire', () => {
		const r = rendreEcran(QCM_SIMPLE);
		expect(r.groupes).toHaveLength(1);
		expect(r.radios.map((x) => x.value)).toEqual(QCM_SIMPLE.choices);
		// Les radios sont DANS le groupe (c'est lui qui les nomme).
		expect(r.groupes[0].querySelectorAll('input[type="radio"]')).toHaveLength(3);
		// La réponse se choisit : rien à taper.
		expect(r.visibles).toHaveLength(0);
	});

	it('le groupe est nommé par l’énoncé (legend) et chaque choix par son texte', () => {
		const r = rendreEcran(QCM_SIMPLE);
		const legend = r.groupes[0].querySelector('legend');
		expect(legend?.parentElement).toBe(r.groupes[0]);
		expect(legend?.textContent).toContain('Que fait cette phrase');
		expect(r.radios.map((x) => x.closest('label')?.textContent?.trim())).toEqual(
			QCM_SIMPLE.choices,
		);
	});

	it('un champ caché `.ans` porte la réponse attendue, VIDE au départ (non répondu)', () => {
		const r = rendreEcran(QCM_SIMPLE);
		expect(r.caches).toHaveLength(1);
		const cache = r.caches[0];
		expect(cache.dataset.answer).toBe('Poser une question');
		expect(cache.value).toBe('');
		// Le groupe désigne SON champ, et la marque ✓/✗ a sa place.
		expect(r.groupes[0].dataset.for).toBe(cache.id);
		expect(r.racine.querySelector(`.mark[data-for="${cache.id}"]`)).not.toBeNull();
		// Corrigé comme les autres champs : l'item est retrouvable par l'id du champ.
		expect(r.ctx.items[cache.id]).toBe(QCM_SIMPLE);
	});

	it('aucun choix n’est pré-coché : l’enfant n’a pas de réponse donnée d’avance', () => {
		const r = rendreEcran(QCM_SIMPLE);
		expect(r.radios.some((x) => x.checked || x.hasAttribute('checked'))).toBe(false);
	});

	it('choix simples : ce qui sera révélé est le texte de la bonne réponse', () => {
		// La révélation lit `data-attendue`, à défaut `data-answer` (ui/session.ts). On assère
		// ce qu'elle dira, pas la présence ou l'absence de l'un des deux attributs.
		const r = rendreEcran(QCM_SIMPLE);
		const revele = r.caches[0].dataset.attendue ?? r.caches[0].dataset.answer;
		expect(revele).toBe('Poser une question');
	});

	it('vue riche : `data-attendue` = libellé de la BONNE réponse ; chaque radio est nommée par son libellé', () => {
		const r = rendreEcran(QCM_RICHE);
		const cache = r.caches[0];
		expect(cache.dataset.answer).toBe('3/4'); // la clé de correction reste la valeur
		expect(cache.dataset.attendue).toBe('trois quarts'); // pas « un quart » (index 0)
		expect(r.radios.map((x) => x.getAttribute('aria-label'))).toEqual([
			'un quart',
			'deux quarts',
			'trois quarts',
		]);
		// La vue riche est rendue (fragment de confiance), pas la valeur brute échappée.
		expect(r.groupes[0].querySelectorAll('span.frac')).toHaveLength(3);
	});

	it('le champ caché est rattaché à la leçon (agrégat de stats par leçon)', () => {
		const ctx = createRenderContext();
		const balisage = withLessonId(ctx, 'fr-gram-type-phrase', () =>
			renderItem(QCM_SIMPLE, ctx),
		).balisage;
		const cache = dom(balisage).querySelector<HTMLInputElement>('input.ans[type="hidden"]');
		expect(cache?.dataset.lesson).toBe('fr-gram-type-phrase');
	});

	it('deux QCM d’une même fiche : groupes de radios DISJOINTS (cocher l’un ne décoche pas l’autre)', () => {
		const ctx = createRenderContext();
		const a = rendreEcran(QCM_SIMPLE, ctx);
		const b = rendreEcran(QCM_RICHE, ctx);
		const nomsA = new Set(a.radios.map((x) => x.name));
		const nomsB = new Set(b.radios.map((x) => x.name));
		// Un seul `name` par groupe, non vide…
		expect(nomsA.size).toBe(1);
		expect(nomsB.size).toBe(1);
		expect([...nomsA][0]).not.toBe('');
		// …et différent d'un groupe à l'autre.
		expect([...nomsA][0]).not.toBe([...nomsB][0]);
		expect(a.caches[0].id).not.toBe(b.caches[0].id);
	});
});

describe('renderItem à l’écran — QCM À TROU : le champ texte au trou, inchangé', () => {
	it('rend exactement ce que rendrait le même item SANS choix', () => {
		// La décision : « rien ne change pour lui ». On le vérifie sans figer le balisage du
		// champ texte, en le comparant à l'item débarrassé de ses choix.
		const avec = renderItem(QCM_TROU, createRenderContext()).balisage;
		const sans = renderItem({ ...QCM_TROU, choices: undefined }, createRenderContext()).balisage;
		expect(avec).toBe(sans);
	});

	it('un champ à écrire, nommé, au trou ; aucun bouton radio', () => {
		const r = rendreEcran(QCM_TROU);
		expect(r.groupes).toHaveLength(0);
		expect(r.radios).toHaveLength(0);
		expect(r.caches).toHaveLength(0);
		expect(r.visibles).toHaveLength(1);
		expect(r.visibles[0].dataset.answer).toBe('a');
		expect(r.visibles[0].getAttribute('aria-label')?.trim()).toBeTruthy();
		expect(r.racine.textContent).not.toContain('@');
	});
});

describe('renderItem à l’impression — cases à cocher, jamais de radio', () => {
	const impression = () => createRenderContext({ printMode: true });

	it.each([
		['sans trou', QCM_SIMPLE],
		['à vue riche', QCM_RICHE],
		['à trou', QCM_TROU],
	])('QCM %s : une case par choix, ni radio ni champ', (_nom, item) => {
		const racine = dom(renderItem(item, impression()).balisage);
		expect(racine.querySelectorAll('.qcm-print-box')).toHaveLength(item.choices!.length);
		expect(racine.querySelectorAll('input')).toHaveLength(0);
		expect(racine.querySelectorAll('fieldset')).toHaveLength(0);
	});
});

describe('renderItem — un QCM sans trou échappe énoncé et choix', () => {
	const piege: Item = {
		text: 'Choisis <b>bien</b> : "a" & <img src=x onerror=alert(1)>',
		answer: '<img src=x>',
		choices: ['<img src=x>', 'a"b', 'x & y'],
		kind: 'text',
	};

	it('aucune balise injectée : ni <img>, ni <b> ne deviennent des éléments', () => {
		const r = rendreEcran(piege);
		expect(r.racine.querySelector('img')).toBeNull();
		expect(r.racine.querySelector('b')).toBeNull();
	});

	it('les choix restent du TEXTE et leurs valeurs sont intactes (guillemet compris)', () => {
		const r = rendreEcran(piege);
		expect(r.radios.map((x) => x.value)).toEqual(piege.choices);
		expect(r.radios.map((x) => x.closest('label')?.textContent)).toEqual(piege.choices);
		expect(r.caches[0].dataset.answer).toBe('<img src=x>');
		// L'énoncé aussi : la question affichée montre les chevrons tels quels.
		expect(r.racine.querySelector('.fiche-question')?.textContent).toContain('<b>bien</b>');
	});

	it('choisir la valeur piégée qui est la bonne réponse est jugé juste', () => {
		// Ce que copie l'écouteur de `initSession` : la valeur du radio, telle quelle.
		const r = rendreEcran(piege);
		const item = r.ctx.items[r.caches[0].id];
		expect(r.radios.filter((x) => checkItemAnswer(item, x.value)).map((x) => x.value)).toEqual([
			'<img src=x>',
		]);
	});
});

/* ============================================================
   Journal : ce que lit le parent
   ============================================================ */

describe('saisieLisibleItem — la réponse DONNÉE, lisible hors de l’appli', () => {
	it('choix à vue riche : le libellé (« un quart »), pas la valeur (« 1/4 »)', () => {
		expect(saisieLisibleItem(QCM_RICHE, '1/4')).toBe('un quart');
		expect(saisieLisibleItem(QCM_RICHE, '3/4')).toBe('trois quarts');
	});

	it('choix simple : le texte du choix', () => {
		expect(saisieLisibleItem(QCM_SIMPLE, 'Donner un ordre')).toBe('Donner un ordre');
	});

	it('item sans choix : la saisie telle quelle (pas regroupée, pas réécrite)', () => {
		const calcul: Item = { text: '45 + @ = 57', answer: 12, kind: 'num' };
		expect(saisieLisibleItem(calcul, '12000')).toBe('12000');
		expect(saisieLisibleItem(calcul, '1/4')).toBe('1/4');
	});

	it('valeur introuvable dans les choix : la valeur elle-même, jamais le libellé d’un autre choix', () => {
		// Un index -1 lu « depuis la fin » rendrait « trois quarts » : le parent lirait une
		// réponse juste là où l'enfant a donné autre chose.
		expect(saisieLisibleItem(QCM_RICHE, '5/4')).toBe('5/4');
		expect(saisieLisibleItem(QCM_RICHE, '')).toBe('');
	});
});

describe('attendueLisibleItem — la réponse ATTENDUE, lisible hors de l’appli', () => {
	it('choix à vue riche : le libellé de la bonne réponse, où qu’elle soit dans la liste', () => {
		expect(attendueLisibleItem(QCM_RICHE)).toBe('trois quarts');
	});

	it('choix simple : le texte de la bonne réponse', () => {
		expect(attendueLisibleItem(QCM_SIMPLE)).toBe('Poser une question');
	});

	it('item sans choix : la réponse révélée comme dans les énoncés (groupée, virgule)', () => {
		expect(attendueLisibleItem({ text: '@', answer: 12000, kind: 'num' })).toBe(`12${U202F}000`);
		expect(attendueLisibleItem({ text: '@', answer: '3.5', kind: 'num' })).toBe('3,5');
		// Intercalation : la bande acceptée, pas l'exemple.
		expect(
			attendueLisibleItem({ text: '@', answer: 457, kind: 'num', intervalle: [450, 465] }),
		).toBe('un nombre entre 450 et 465');
	});

	it('réponse absente des choix (donnée incohérente) : la valeur brute, pas un libellé voisin', () => {
		expect(attendueLisibleItem({ ...QCM_RICHE, answer: '5/4' })).toBe('5/4');
	});
});

/* ============================================================
   Sur le catalogue réel : chaque QCM de fiche se joue et se corrige
   ============================================================ */

describe('Catalogue — chaque QCM de fiche est jouable (#734)', () => {
	const GRAINES = [1, 7, 42, 99, 2026];
	const COUPLES = getAllLessons().flatMap((l) => l.levels.map((niveau) => ({ id: l.id, niveau })));

	it('la bonne réponse est UN des choix, et c’est le SEUL choix jugé juste ; groupes disjoints, rien de pré-coché', () => {
		let groupesVus = 0;
		for (const graine of GRAINES) {
			for (const { id, niveau } of COUPLES) {
				const ctx = createRenderContext();
				const racine = dom(withSeed(graine, () => buildLessonFiche(id, niveau, ctx)).balisage);
				const groupes = [...racine.querySelectorAll<HTMLFieldSetElement>('fieldset.fiche-choix')];
				const noms = new Set<string>();
				for (const groupe of groupes) {
					groupesVus++;
					const champ = racine.querySelector<HTMLInputElement>(`#${groupe.dataset.for}`);
					const item = ctx.items[champ?.id ?? ''];
					const radios = [...groupe.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
					const nom = `${id} (${niveau}, graine ${graine}) « ${item?.text} »`;
					expect(champ?.type, `${nom} : pas de champ caché`).toBe('hidden');
					expect(item, `${nom} : item introuvable pour la correction`).toBeDefined();
					// Choisir la bonne réponse doit être POSSIBLE…
					expect(
						radios.map((x) => x.value),
						nom,
					).toContain(champ!.dataset.answer);
					// …et elle seule doit être jugée juste (deux choix équivalents, « 3,4 » et
					// « 3,40 », rendraient le QCM juste quoi qu'on coche).
					const justes = radios.filter((x) => checkItemAnswer(item, x.value));
					expect(
						justes.map((x) => x.value),
						`${nom} : choix jugés justes`,
					).toEqual([champ!.dataset.answer]);
					expect(
						radios.some((x) => x.checked),
						`${nom} : choix pré-coché`,
					).toBe(false);
					const nomsGroupe = new Set(radios.map((x) => x.name));
					expect(nomsGroupe.size, `${nom} : plusieurs name dans un groupe`).toBe(1);
					const [n] = nomsGroupe;
					expect(noms.has(n), `${nom} : name partagé avec un autre groupe`).toBe(false);
					noms.add(n);
				}
			}
		}
		// 39 couples × 8 questions × 5 graines attendus ; le plancher garde contre un vide.
		expect(groupesVus).toBeGreaterThan(30 * 8 * GRAINES.length);
	});
});
