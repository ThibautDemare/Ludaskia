/* ============================================================
   Grands nombres CM1 « millions » (#240) — logique pure.
   - formatage unique (groupes de 3, espace fine insécable U+202F, jamais de
     virgule) et nettoyage de la saisie (tolérance aux espaces) ;
   - bornes CM1 (≤ 9 999 999) respectées, CE2 INCHANGÉ (plages gelées) ;
   - encadrement au bon rang aux grandes plages ;
   - intercalation : CM1 = check par INTERVALLE (accepte dedans, rejette dehors),
     CE2 = réponse unique (comportement inchangé) ;
   - décomposition multiplicative (produit = nombre, chiffre troué juste).
   On génère beaucoup d'items (aléa réel) pour couvrir la pondération.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	formatNombre,
	nettoyerSaisieNombre,
	wrapGrandsNombres,
	grouperChiffresSaisis,
	ESPACE_FINE,
} from '../src/core/nombres';
import { getLessonById, genLessonItem } from '../src/core/catalog';
import { checkItemAnswer, renderItem } from '../src/core/items';

/* Espaces de référence, désignés par leur point de code pour ne JAMAIS écrire de
   caractère invisible dans ce source (fragile à l'édition / au lint). */
const U202F = String.fromCharCode(0x202f); // espace fine insécable (séparateur de milliers)
const U00A0 = String.fromCharCode(0x00a0); // espace insécable

describe('formatNombre / nettoyerSaisieNombre (#240)', () => {
	it('groupe par classes de 3 avec l’espace fine insécable U+202F (jamais de virgule)', () => {
		expect(formatNombre(1002050)).toBe(`1${U202F}002${U202F}050`);
		expect(formatNombre(12000)).toBe(`12${U202F}000`);
		expect(formatNombre(10000)).toBe(`10${U202F}000`); // 1er nombre groupé (5 chiffres)
		expect(formatNombre(9999999)).toBe(`9${U202F}999${U202F}999`);
		// Jamais le séparateur anglo-saxon (virgule / point) comme séparateur de milliers.
		expect(formatNombre(1000000)).not.toContain(',');
		expect(formatNombre(1000000)).not.toContain('.');
		expect(ESPACE_FINE).toBe(U202F);
	});

	it('ne groupe pas en-dessous de 10 000 (≤ 4 chiffres, plage CE2 inchangée)', () => {
		expect(formatNombre(9999)).toBe('9999');
		expect(formatNombre(1234)).toBe('1234');
		expect(formatNombre(999)).toBe('999');
		expect(formatNombre(42)).toBe('42');
		expect(formatNombre(0)).toBe('0');
	});

	it('nettoyerSaisieNombre neutralise tous les espaces (normal, U+202F, U+00A0)', () => {
		expect(nettoyerSaisieNombre(`1${U202F}002${U202F}050`)).toBe('1002050');
		expect(nettoyerSaisieNombre('1 002 050')).toBe('1002050'); // espaces normaux
		expect(nettoyerSaisieNombre(`1${U00A0}002`)).toBe('1002'); // insécable
		expect(nettoyerSaisieNombre('1002050')).toBe('1002050'); // déjà collé
		// La virgule décimale n'est PAS touchée (réservée aux décimaux à venir).
		expect(nettoyerSaisieNombre('3,5')).toBe('3,5');
	});

	it('wrapGrandsNombres enveloppe seulement les nombres groupés (≥ 10 000)', () => {
		const html = wrapGrandsNombres(`Compare : ${formatNombre(1234567)} @ 999`);
		expect(html).toContain('<span class="bignum">1');
		// Le petit nombre 999 reste hors .bignum.
		expect(html).toContain('@ 999');
		expect(wrapGrandsNombres('chiffre des unités de 305')).toBe('chiffre des unités de 305');
		// Un nombre à 4 chiffres (plage CE2) n'est pas groupé → pas enveloppé.
		expect(wrapGrandsNombres(`situe ${formatNombre(1234)}`)).toBe('situe 1234');
	});
});

/* Helper : tous les nombres ENTIERS d'un énoncé (séparateur de milliers neutralisé). */
function nombresDe(it: { text: string; answer: number | string }): number[] {
	const nums = (nettoyerSaisieNombre(it.text).match(/\d+/g) ?? []).map(Number);
	const ans = Number(nettoyerSaisieNombre(String(it.answer)));
	if (!Number.isNaN(ans)) nums.push(ans);
	return nums;
}

describe('Bornes CM1 = LE MILLION, CE2 inchangé (#240)', () => {
	const ids = [
		'num-comparer',
		'num-encadrer-intercaler',
		'num-situer-10000',
		'num-valeur-position',
	];

	it('CM1 : aucun nombre ne dépasse 9 999 999, et de grands nombres apparaissent', () => {
		for (const id of ids) {
			const lesson = getLessonById(id)!;
			expect(lesson.levels).toEqual(['ce2', 'cm1']); // niveaux dérivés du calibrage
			let maxVu = 0;
			for (let i = 0; i < 600; i++) {
				const it = genLessonItem(lesson, 'cm1');
				for (const n of nombresDe(it)) {
					expect(n).toBeLessThanOrEqual(9_999_999);
					maxVu = Math.max(maxVu, n);
				}
			}
			// On voit bien de GRANDS nombres en CM1 (au-delà de la plage CE2 4 chiffres).
			expect(maxVu).toBeGreaterThan(100_000);
		}
	});

	it('CE2 : plages GELÉES (comparer ≤ ~1001, encadrer ≤ 1000, situer ≤ 10000)', () => {
		const bornesCe2: Record<string, number> = {
			'num-comparer': 1001, // cas charnière 999/1000 inclus
			'num-encadrer-intercaler': 1000,
			'num-situer-10000': 10000,
			'num-valeur-position': 9999, // 4 chiffres au plus en CE2
		};
		for (const id of ids) {
			const lesson = getLessonById(id)!;
			for (let i = 0; i < 600; i++) {
				const it = genLessonItem(lesson, 'ce2');
				for (const n of nombresDe(it)) expect(n).toBeLessThanOrEqual(bornesCe2[id]);
			}
		}
	});
});

describe('Encadrement aux grandes plages : bon rang (#240)', () => {
	it('CM1 : la réponse est un multiple du rang demandé, voisin du nombre encadré', () => {
		const lesson = getLessonById('num-encadrer-intercaler')!;
		const exType = lesson.exerciseType;
		let vusEncadre = 0;
		for (let i = 0; i < 1000; i++) {
			const ex = exType.generate({ level: 'cm1' });
			if (ex.type !== 'text') continue;
			// On ne traite que les encadrements (« juste avant/après ») ; l'intercalation
			// (« entre … et … ») a son propre test.
			const m = ex.question.match(/juste (avant|après) (.+?) : @/);
			if (!m) continue;
			vusEncadre++;
			const n = Number(nettoyerSaisieNombre(m[2]));
			const rep = Number(ex.answer);
			// Déduit le rang (10 000 / 100 000 / 1 000 000) de l'énoncé.
			const rang = ex.question.includes('million')
				? 1_000_000
				: ex.question.includes('centaine de mille')
					? 100_000
					: ex.question.includes('dizaine de mille')
						? 10_000
						: ex.question.includes('millier')
							? 1000
							: ex.question.includes('centaine')
								? 100
								: 10;
			expect(rep % rang).toBe(0); // multiple du rang
			// La réponse est l'un des deux multiples encadrant n (avant ou après).
			const inf = Math.floor(n / rang) * rang;
			expect([inf, inf + rang]).toContain(rep);
			// La saisie de la réponse exacte est validée.
			expect(exType.check(ex, String(rep))).toBe(true);
		}
		expect(vusEncadre).toBeGreaterThan(0);
	});
});

describe('Intercalation : CM1 par intervalle, CE2 réponse unique (#240)', () => {
	it('CM1 : le check accepte une valeur DANS l’intervalle et REJETTE hors intervalle', () => {
		const exType = getLessonById('num-encadrer-intercaler')!.exerciseType;
		let vusIntervalle = 0;
		for (let i = 0; i < 2000 && vusIntervalle < 50; i++) {
			const ex = exType.generate({ level: 'cm1' });
			if (ex.type !== 'text' || !ex.intervalle) continue;
			vusIntervalle++;
			const [min, max] = ex.intervalle;
			expect(max).toBeGreaterThan(min + 1); // un vrai intervalle (plusieurs valeurs)
			const milieu = Math.floor((min + max) / 2);
			// Une valeur strictement dedans est acceptée (le milieu, et min+1).
			expect(exType.check(ex, String(milieu))).toBe(true);
			expect(exType.check(ex, String(min + 1))).toBe(true);
			// Les bornes (exclues) et au-delà sont rejetées.
			expect(exType.check(ex, String(min))).toBe(false);
			expect(exType.check(ex, String(max))).toBe(false);
			expect(exType.check(ex, String(max + 1))).toBe(false);
			// `answer` (exemple) est lui-même une valeur valide de l'intervalle.
			expect(exType.check(ex, ex.answer)).toBe(true);
		}
		expect(vusIntervalle).toBeGreaterThan(0); // l'intercalation par intervalle existe bien en CM1
	});

	it('CE2 : intercalation = réponse UNIQUE (aucun intervalle, comportement inchangé)', () => {
		const exType = getLessonById('num-encadrer-intercaler')!.exerciseType;
		for (let i = 0; i < 1000; i++) {
			const ex = exType.generate({ level: 'ce2' });
			if (ex.type !== 'text') continue;
			// AUCUN exercice CE2 ne porte d'intervalle.
			expect(ex.intervalle).toBeUndefined();
			if (ex.question.startsWith('Place un nombre entre')) {
				const rep = Number(ex.answer);
				expect(exType.check(ex, String(rep))).toBe(true);
				// Réponse unique : le voisin immédiat est faux (bornes serrées de 2).
				expect(exType.check(ex, String(rep + 1))).toBe(false);
				expect(exType.check(ex, String(rep - 1))).toBe(false);
			}
		}
	});
});

describe('Décomposition multiplicative — nouvelle leçon CM1 (#240)', () => {
	const lesson = getLessonById('num-decompose-multiplicative')!;

	it('est une leçon CM1-only, en numération', () => {
		expect(lesson).toBeDefined();
		expect(lesson.levels).toEqual(['cm1']);
		expect(lesson.category).toBe('math-numeration');
	});

	it('forme « chiffre × valeur de rang » : produit-somme = nombre, chiffre troué juste', () => {
		for (let i = 0; i < 800; i++) {
			const it = genLessonItem(lesson, 'cm1');
			expect(it.kind).toBe('num');
			const ans = Number(it.answer);
			expect(Number.isInteger(ans)).toBe(true);
			expect(ans).toBeGreaterThanOrEqual(0);
			// La réponse exacte est validée ; une réponse fausse ne l'est pas.
			expect(checkItemAnswer(it, String(ans))).toBe(true);
			expect(checkItemAnswer(it, String(ans + 1))).toBe(false);

			const txt = nettoyerSaisieNombre(it.text);
			if (txt.endsWith('=@')) {
				// Composer (minoritaire) : « d × valeur + … = @ » → la somme des produits
				// affichés vaut le nombre, et la réponse à taper reste ≤ 6 chiffres.
				const produits = [...txt.matchAll(/(\d+)×(\d+)/g)].map(([, d, v]) => Number(d) * Number(v));
				expect(produits.reduce((s, p) => s + p, 0)).toBe(ans);
				expect(ans).toBeLessThanOrEqual(999999);
			} else {
				// Décomposer (dominant) : un FACTEUR troué « @ × valeur », réponse = le
				// chiffre du rang (1 caractère, conforme à la contrainte de saisie #240).
				expect(it.text).toContain('@ × ');
				expect(ans).toBeGreaterThanOrEqual(0);
				expect(ans).toBeLessThanOrEqual(9);
				// Reconstruit le nombre = nombre affiché à gauche du « = ».
				const nombre = Number(nettoyerSaisieNombre(it.text.split('=')[0]));
				// La somme des produits (en remplaçant le @ par la réponse) redonne le nombre.
				const factVisibles = [...txt.matchAll(/(\d+)×(\d+)/g)].map(
					([, d, v]) => Number(d) * Number(v),
				);
				// Le terme troué « @×valeur » : sa valeur de rang figure dans l'énoncé
				// (texte nettoyé, car la valeur de rang est groupée — « 1 000 000 »).
				const trou = txt.match(/@×(\d+)/);
				expect(trou).not.toBeNull();
				const rangTrou = Number(trou![1]);
				const total = factVisibles.reduce((s, p) => s + p, 0) + ans * rangTrou;
				expect(total).toBe(nombre);
			}
		}
	});

	it('décomposition multiplicative : on ne fait jamais taper plus de 6 chiffres', () => {
		for (let i = 0; i < 800; i++) {
			const it = genLessonItem(lesson, 'cm1');
			expect(String(it.answer).length).toBeLessThanOrEqual(6);
		}
	});
});

describe('Check tolérant aux espaces de groupement (#240)', () => {
	it('un nombre tapé groupé (« 1 002 050 ») ou collé (« 1002050 ») est accepté', () => {
		const exType = getLessonById('num-valeur-position')!.exerciseType;
		// On force un exercice « combien en tout » dont la réponse dépasse 1000 pour
		// éprouver la tolérance : on cherche un item dont la réponse a ≥ 4 chiffres.
		let testé = false;
		for (let i = 0; i < 3000 && !testé; i++) {
			const ex = exType.generate({ level: 'cm1' });
			if (ex.type !== 'text') continue;
			const rep = Number(ex.answer);
			if (rep < 1000) continue;
			testé = true;
			const groupe = formatNombre(rep); // « 1 002 050 » avec U+202F
			expect(exType.check(ex, groupe)).toBe(true); // groupé U+202F
			expect(exType.check(ex, groupe.replace(new RegExp(U202F, 'g'), ' '))).toBe(true); // espaces normaux
			expect(exType.check(ex, String(rep))).toBe(true); // collé
			expect(exType.check(ex, String(rep + 1))).toBe(false); // faux reste faux
		}
		expect(testé).toBe(true);
	});
});

describe('Accord des libellés de rang (#240)', () => {
	// Garde-fou langue : « mille » est invariable et seul le premier mot s'accorde.
	// On vérifie qu'aucun énoncé généré ne produit la forme fautive « de milles »
	// (ex. « dizaines de mille », jamais « dizaine de milles »).
	it('aucun énoncé de valeur de position / décomposition ne contient « de milles »', () => {
		for (const id of ['num-valeur-position', 'num-decompose-multiplicative']) {
			const lesson = getLessonById(id)!;
			for (let i = 0; i < 1500; i++) {
				const it = genLessonItem(lesson, 'cm1');
				expect(it.text).not.toContain('de milles');
			}
		}
	});
});

describe('Ajustements numération (suite des retours mainteneur)', () => {
	// « combien de X en tout » ne doit JAMAIS porter sur le rang le plus haut du nombre :
	// là, countOf = le chiffre du rang (ex. dizaines de mille de 71 347 = 7), « en tout »
	// ne distingue rien et l'item est trompeur. On exclut ce cas → la réponse est toujours
	// strictement > le chiffre, donc ≥ 10 (au moins 2 chiffres).
	it('valeur de position « combien en tout » : non dégénéré (réponse ≥ 10), CE2 et CM1', () => {
		const exType = getLessonById('num-valeur-position')!.exerciseType;
		for (const level of ['ce2', 'cm1'] as const) {
			let vusEnTout = 0;
			for (let i = 0; i < 2000; i++) {
				const ex = exType.generate({ level });
				if (ex.type !== 'text' || !ex.question.includes('combien y a-t-il de')) continue;
				vusEnTout++;
				expect(Number(ex.answer)).toBeGreaterThanOrEqual(10);
			}
			expect(vusEnTout).toBeGreaterThan(0); // ce type de question apparaît bien
		}
	});

	// Champ de saisie élargi (.ans-grand) pour une réponse numérique à ≥ 5 chiffres.
	it('renderItem : un grand nombre (≥ 10 000) reçoit la classe ans-grand, pas un petit', () => {
		expect(renderItem({ text: 'x = @', answer: 1_400_000, kind: 'num' })).toContain('ans-grand');
		expect(renderItem({ text: 'x = @', answer: 90_000, kind: 'num' })).toContain('ans-grand');
		expect(renderItem({ text: 'x = @', answer: 7, kind: 'num' })).not.toContain('ans-grand');
		expect(renderItem({ text: 'x = @', answer: 999, kind: 'num' })).not.toContain('ans-grand');
	});
});

describe('grouperChiffresSaisis (#327 — écho de saisie groupé)', () => {
	it('groupe par classes de 3 depuis la droite avec U+202F, à partir de 5 chiffres', () => {
		expect(grouperChiffresSaisis('14000')).toBe(`14${U202F}000`);
		expect(grouperChiffresSaisis('1400000')).toBe(`1${U202F}400${U202F}000`);
		expect(grouperChiffresSaisis('9999999')).toBe(`9${U202F}999${U202F}999`);
		expect(grouperChiffresSaisis('100000')).toBe(`100${U202F}000`);
	});

	it('ne groupe pas en-dessous de 5 chiffres (plage CE2 / saisie en cours)', () => {
		expect(grouperChiffresSaisis('')).toBe('');
		expect(grouperChiffresSaisis('7')).toBe('7');
		expect(grouperChiffresSaisis('999')).toBe('999');
		expect(grouperChiffresSaisis('1400')).toBe('1400'); // 4 chiffres : pas encore groupé
	});

	it('préserve EXACTEMENT les chiffres (zéros de tête compris), n’insère que des séparateurs', () => {
		// Travaille sur la chaîne, pas via Number : « 007012 » garde ses zéros de tête.
		expect(grouperChiffresSaisis('007012')).toBe(`007${U202F}012`);
		// Réversible par neutralisation : le groupé se renettoie en la saisie d'origine.
		expect(nettoyerSaisieNombre(grouperChiffresSaisis('1400000'))).toBe('1400000');
	});
});
