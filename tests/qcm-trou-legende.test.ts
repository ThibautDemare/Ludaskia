/* ============================================================
   Nom du groupe de choix d'un QCM À TROU (#777, relecture accessibilité, bloquant B2).

   Écrit AVANT la correction : rouge à l'arrivée (`legendeQcmTrou` n'existe pas encore).

   Décision : le nom du groupe de choix d'un QCM à trou reprend l'ÉNONCÉ avec le trou
   MARQUÉ « (trou) » à la place du `@`. Jamais « @ », jamais un silence au trou, jamais le
   seul « réponse » — y compris pour un item MUET (`parle: ''`, accords) ou dont `parle`
   n'est qu'une consigne générique (homophones : « Choisis le bon mot… »), qui ne dit pas
   la phrase. Sans ça, qui n'entend que le nom du groupe ne sait ni la phrase, ni où va le
   mot : « réponse, groupe, a, à ».

   Ce que ce fichier tient :
   - `legendeQcmTrou(it)` (contrat proposé, `src/core/items.ts`) sur des items fabriqués,
     puis sur tous les QCM à trou des fiches du catalogue ;
   - le RENDU : la `legend` du `fieldset` de `renderItem` à l'écran, mêmes exigences ;
   - le critère négatif : un QCM SANS trou ne gagne pas de « (trou) » ;
   - les témoins du détecteur partagé `defautsNom` (`tests/qcm-trou-nom.ts`).
   Le nom du groupe dans le PARCOURS de bilan est tenu par `bilan-parcours-ecran.test.ts`.
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
// `legendeQcmTrou` n'existe pas encore : l'import rouge est voulu (typecheck compris).
import {
	createRenderContext,
	legendeQcmTrou,
	nomChampReponse,
	renderItem,
	type Item,
} from '../src/core/items';
import { getAllLessons } from '../src/core/catalog';
import { buildLessonFiche } from '../src/core/build';
import { withSeed } from '../src/core/utils';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { defautsNom, TROU } from './qcm-trou-nom';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const lu = (s: string): string => s.replace(/\s+/g, ' ').trim();

/* ---------- Fixtures ---------- */

const PHRASE: Item = { text: 'Le chat @ mangé.', answer: 'a', choices: ['a', 'à'], kind: 'text' };
/** Item MUET (`parle: ''`) : son nom actuel est « réponse ». */
const MUET: Item = { ...PHRASE, parle: '' };
/** Homophones : `parle` n'est qu'une consigne, qui ne dit pas la phrase. */
const CONSIGNE: Item = { ...PHRASE, parle: 'Choisis le bon mot pour compléter la phrase.' };
/** Accords, tel que le catalogue l'écrit : gras, flèche, item muet. */
const ACCORD: Item = {
	text: 'Il est revenu. → **Elle** est @',
	answer: 'revenue',
	choices: ['revenu', 'revenue', 'revenus'],
	kind: 'text',
	parle: '',
};
/** Trou DANS un mot (m/b/p). */
const DANS_LE_MOT: Item = {
	text: 'lo@gue',
	answer: 'n',
	choices: ['n', 'm'],
	kind: 'text',
	parle: 'Choisis la bonne lettre pour compléter le mot.',
};
/** QCM SANS trou : il garde son nom d'énoncé. */
const SANS_TROU: Item = {
	text: 'Que fait cette phrase ? Où vas-tu ?',
	answer: 'Poser une question',
	choices: ['Raconter ou dire', 'Poser une question', 'Donner un ordre'],
	kind: 'text',
};

/** Nom du groupe de choix rendu à l'écran : la `legend`, enfant direct du `fieldset`. */
function legendeRendue(it: Item): string {
	const racine = document.createElement('div');
	racine.innerHTML = renderItem(it, createRenderContext()).balisage;
	const legend = racine.querySelector('fieldset.fiche-choix > legend');
	if (!legend) throw new Error('aucune legend de groupe de choix');
	return legend.textContent ?? '';
}

/** QCM à trou des fiches du catalogue, à chaque niveau, sur deux graines. */
function qcmTrouCatalogue(): { ou: string; couple: string; it: Item; legend: string }[] {
	const vus: { ou: string; couple: string; it: Item; legend: string }[] = [];
	for (const l of getAllLessons())
		for (const niveau of l.levels)
			for (const graine of [1, 7]) {
				const ctx = createRenderContext();
				const racine = document.createElement('div');
				racine.innerHTML = withSeed(graine, () => buildLessonFiche(l.id, niveau, ctx)).balisage;
				for (const groupe of racine.querySelectorAll<HTMLFieldSetElement>('fieldset.fiche-choix')) {
					const it = ctx.items[groupe.dataset.for ?? ''];
					if (!it?.text.includes('@')) continue;
					const legend = groupe.querySelector(':scope > legend')?.textContent ?? '';
					const couple = `${l.id} @${niveau}`;
					vus.push({ ou: `${couple} / graine ${graine} « ${it.text} »`, couple, it, legend });
				}
			}
	return vus;
}

/* ============================================================ */

describe('legendeQcmTrou — l’énoncé, trou marqué « (trou) »', () => {
	it('le trou est dit « (trou) », à sa place dans la phrase', () => {
		expect(lu(legendeQcmTrou(PHRASE))).toContain(`Le chat ${TROU} mangé`);
		expect(defautsNom(legendeQcmTrou(PHRASE), PHRASE.text)).toEqual([]);
	});

	it('item muet (parle vide) : la phrase et son trou, jamais « réponse » ni un silence', () => {
		expect(lu(legendeQcmTrou(MUET))).toContain(`Le chat ${TROU} mangé`);
		expect(defautsNom(legendeQcmTrou(ACCORD), ACCORD.text)).toEqual([]);
		expect(lu(legendeQcmTrou(ACCORD))).toContain(`Elle est ${TROU}`);
	});

	it('parle réduit à une consigne (homophones) : la légende dit la PHRASE, pas la consigne seule', () => {
		expect(lu(legendeQcmTrou(CONSIGNE))).toContain(`Le chat ${TROU} mangé`);
	});

	it('trou au milieu d’un mot : le marqueur entre les deux morceaux du mot', () => {
		expect(defautsNom(legendeQcmTrou(DANS_LE_MOT), DANS_LE_MOT.text)).toEqual([]);
	});

	it('catalogue : chaque QCM à trou des fiches, à chaque niveau', () => {
		const vus = qcmTrouCatalogue();
		// 24 couples leçon × niveau en portent aujourd'hui : le plancher garde contre un vide.
		expect(new Set(vus.map((v) => v.couple)).size).toBeGreaterThanOrEqual(20);
		const fautes = vus.flatMap(({ ou, it }) =>
			defautsNom(legendeQcmTrou(it), it.text).map((d) => `${ou} : ${d}`),
		);
		expect(fautes).toEqual([]);
	});
});

describe('renderItem à l’écran — la legend du groupe de choix d’un QCM à trou', () => {
	it.each([
		['phrase', PHRASE],
		['item muet', MUET],
		['consigne en parle (homophones)', CONSIGNE],
		['accord (gras, flèche, muet)', ACCORD],
		['trou dans un mot', DANS_LE_MOT],
	] as const)('%s : la legend dit l’énoncé, trou marqué', (_nom, it) => {
		expect(defautsNom(legendeRendue(it), it.text)).toEqual([]);
	});

	it('catalogue : la legend de chaque QCM à trou des fiches', () => {
		const fautes = qcmTrouCatalogue().flatMap(({ ou, it, legend }) =>
			defautsNom(legend, it.text).map((d) => `${ou} : ${d}`),
		);
		expect(fautes).toEqual([]);
	});

	it('critère négatif : un QCM SANS trou garde son nom d’énoncé, sans « (trou) »', () => {
		const legend = legendeRendue(SANS_TROU);
		expect(legend).not.toContain(TROU);
		expect(lu(legend)).toContain('Que fait cette phrase');
	});
});

describe('Témoins : defautsNom signale ce qu’il prétend signaler', () => {
	it('les noms d’aujourd’hui sont signalés : « réponse », la consigne seule, le trou tu', () => {
		expect(defautsNom(nomChampReponse(MUET), MUET.text)).not.toEqual([]);
		expect(defautsNom(nomChampReponse(CONSIGNE), CONSIGNE.text)).not.toEqual([]);
		expect(defautsNom(nomChampReponse(PHRASE), PHRASE.text)).not.toEqual([]);
	});

	it('« @ » brut, marqueur déplacé, mot perdu, marqueur en double, nom vide : signalés', () => {
		expect(defautsNom('Le chat @ mangé.', PHRASE.text)).toContain('« @ » dans le nom');
		expect(defautsNom(`Le chat mangé ${TROU}`, PHRASE.text)).not.toEqual([]);
		expect(defautsNom(`Le ${TROU} mangé`, PHRASE.text)).not.toEqual([]);
		expect(defautsNom(`Le chat ${TROU} ${TROU} mangé`, PHRASE.text)).not.toEqual([]);
		expect(defautsNom('', PHRASE.text)).not.toEqual([]);
		expect(defautsNom(`Il est revenu. **Elle** est ${TROU}`, ACCORD.text)).toEqual([
			'« ** » dans le nom',
		]);
	});

	it('un nom conforme n’est PAS signalé, quelle que soit la tournure autour', () => {
		expect(defautsNom(`Le chat ${TROU} mangé.`, PHRASE.text)).toEqual([]);
		expect(defautsNom(`le chat ${TROU} mangé`, PHRASE.text)).toEqual([]);
		expect(defautsNom(`Il est revenu. Elle est ${TROU}`, ACCORD.text)).toEqual([]);
		expect(defautsNom(`lo${TROU}gue`, DANS_LE_MOT.text)).toEqual([]);
		expect(defautsNom(`lo ${TROU} gue`, DANS_LE_MOT.text)).toEqual([]);
	});
});
