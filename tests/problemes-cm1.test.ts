/* ============================================================
   Micro-problèmes CM1 « à une étape » + décimaux (#255) — logique de génération
   (src/data/maths/problemes). Quatre structures (composition, transformation,
   comparaison, multiplication) sont rouvertes au CM1 en DÉCIMAL, sans nouvelle leçon :
   `generate(opts)` branche sur `opts.level`.
     - level absent / 'ce2' → chemin CE2 INCHANGÉ, réponse ENTIÈRE ;
     - level 'cm1' → MIX ~50 % entiers (chemin CE2) + ~50 % décimaux loyaux
       (argent en centimes / mesures au dixième).
   Les attendus sont DÉRIVÉS de la consigne #255 (pas recopiés du générateur). Tirage
   verrouillé par `withSeed` (graine fixe) → reproductible, pas de flakiness. Sans DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { PROBLEMES_LESSONS } from '../src/data/maths/problemes';
import { withSeed } from '../src/core/utils';
import { genLessonItem, getLessonById } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import type { Item } from '../src/core/items';
import type { Exercise, GenerateOpts } from '../src/core/exercise';

type ProbEx = Extract<Exercise, { type: 'probleme' }>;

// Les quatre structures rouvertes au CM1 en décimal (#255).
const IDS_ETENDUES = [
	'math-prob-composition',
	'math-prob-transformation',
	'math-prob-comparaison',
	'math-prob-multiplication',
] as const;

const typeDe = (id: string) => PROBLEMES_LESSONS.find((l) => l.id === id)!.exerciseType;

// Graine fixe : la génération est aléatoire mais doit être testable → on la déroute vers
// un PRNG déterministe (même suite de tirages à chaque exécution).
const SEED = 424255;
const N_ECH = 600;

// N problèmes d'une leçon (niveau via `opts`), tous sous la même graine.
function tirer(id: string, n: number, opts?: GenerateOpts): ProbEx[] {
	const t = typeDe(id);
	return withSeed(SEED, () =>
		Array.from({ length: n }, () => {
			const ex = t.generate(opts);
			if (ex.type !== 'probleme') throw new Error(`${id} : type inattendu « ${ex.type} »`);
			return ex;
		}),
	);
}

// Échantillons précalculés (identiques à chaque appel : re-seed depuis SEED).
const ECH_CE2 = new Map(IDS_ETENDUES.map((id) => [id, tirer(id, N_ECH)] as const));
const ECH_CM1 = new Map(
	IDS_ETENDUES.map((id) => [id, tirer(id, N_ECH, { level: 'cm1' })] as const),
);

const toutesReponses = (ex: ProbEx): number[] => ex.etapes.map((e) => e.answer);

/* ---------------------------------------------------------------
   Invariant #1 — une seule étape (borne « à une étape » de #255).
   --------------------------------------------------------------- */
describe('#255 — micro-problèmes « à une étape »', () => {
	for (const id of IDS_ETENDUES) {
		it(`${id} : exactement 1 sous-question à CE2 comme à CM1`, () => {
			for (const ex of ECH_CE2.get(id)!) expect(ex.etapes).toHaveLength(1);
			for (const ex of ECH_CM1.get(id)!) expect(ex.etapes).toHaveLength(1);
		});
	}

	// Garde-fou : « deux étapes » (hors périmètre « à une étape ») en produit bien 2.
	it('garde-fou : math-prob-deux-etapes produit 2 sous-questions', () => {
		for (const ex of tirer('math-prob-deux-etapes', 200)) {
			expect(ex.etapes).toHaveLength(2);
		}
	});
});

/* ---------------------------------------------------------------
   Invariant #2 — CE2 strictement entier + byte-identité level absent ⇔ 'ce2'.
   Le chemin CE2 doit rester inchangé : la branche décimale n'est atteinte que par
   `level === 'cm1'`, donc `generate()` et `generate({ level: 'ce2' })` doivent produire
   EXACTEMENT le même exercice à graine égale (aucun tirage supplémentaire consommé).
   --------------------------------------------------------------- */
describe('#255 — CE2 inchangé (entiers positifs, byte-identité)', () => {
	for (const id of IDS_ETENDUES) {
		it(`${id} : réponses entières ≥ 0 sans opts ET avec level 'ce2'`, () => {
			const ce2Explicite = tirer(id, N_ECH, { level: 'ce2' });
			for (const ech of [ECH_CE2.get(id)!, ce2Explicite]) {
				for (const ex of ech) {
					for (const r of toutesReponses(ex)) {
						expect(Number.isInteger(r)).toBe(true);
						expect(r).toBeGreaterThanOrEqual(0);
					}
				}
			}
		});

		it(`${id} : generate() ≡ generate({ level: 'ce2' }) à graine égale (byte-identité)`, () => {
			const t = typeDe(id);
			for (let s = 1; s <= 60; s++) {
				const sansOpts = withSeed(s, () => t.generate());
				const ce2 = withSeed(s, () => t.generate({ level: 'ce2' }));
				expect(ce2).toEqual(sansOpts);
			}
		});
	}
});

/* ---------------------------------------------------------------
   Invariant #3 — CM1 = un vrai MIX (entiers ET décimaux) pour chaque leçon.
   Preuve que la branche décimale est atteinte sans dégénérer (ni tout-entier ni
   tout-décimal). On considère une réponse « décimale » = non entière.
   --------------------------------------------------------------- */
describe('#255 — CM1 mixe entiers et décimaux', () => {
	for (const id of IDS_ETENDUES) {
		it(`${id} : au moins un item entier ET un item décimal sur ${N_ECH} tirages`, () => {
			const rep = ECH_CM1.get(id)!.map((ex) => ex.etapes[0].answer);
			expect(rep.some((r) => Number.isInteger(r))).toBe(true);
			expect(rep.some((r) => !Number.isInteger(r))).toBe(true);
		});
	}
});

/* ---------------------------------------------------------------
   Invariant #4 — calibrage décimal « propre » (robustesse flottante).
   Toute réponse CM1 non entière doit être un multiple exact de 0,01 (argent) ou 0,1
   (mesure), ≥ 0, sans dérive flottante (jamais de 3ᵉ décimale ni de 6,000000001), et
   re-parsable à l'identique comme le fait la saisie de l'enfant (virgule ↔ point).

   NB (à remonter) : le critère littéral de #255 « Math.round(answer*100) === answer*100 »
   est TROP STRICT — il échoue sur des réponses MESURE légitimes à 1 décimale (2,2 → 2.2*100
   = 220.00000000000003 en IEEE754), sans qu'il y ait de bug : 2,2 se stocke et se re-parse
   correctement. On teste donc « au plus 2 décimales sans dérive » via
   `Number(a.toFixed(2)) === a` (exact et sûr) + le round-trip demandé.
   --------------------------------------------------------------- */
describe('#255 — décimaux CM1 propres (au plus 2 décimales, sans dérive)', () => {
	for (const id of IDS_ETENDUES) {
		it(`${id} : chaque réponse non entière est un décimal loyal (≥ 0, ≤ 2 décimales, round-trip)`, () => {
			for (const ex of ECH_CM1.get(id)!) {
				for (const a of toutesReponses(ex)) {
					if (Number.isInteger(a)) continue;
					// Positive (jamais un « reste » ou un écart négatif).
					expect(a).toBeGreaterThanOrEqual(0);
					// Au plus 2 décimales, sans dérive : arrondi au centième = valeur exacte.
					expect(Number(a.toFixed(2))).toBe(a);
					// L'écriture décimale usuelle n'a jamais de 3ᵉ décimale (pas de « 6.000000001 »).
					const decimales = String(a).split('.')[1] ?? '';
					expect(decimales.length).toBeLessThanOrEqual(2);
					// Round-trip du runner : « 7.5 » → affiché « 7,5 » → re-saisi/re-parsé « 7.5 ».
					const rt = Number(String(a).replace('.', ',').replace(',', '.'));
					expect(rt).toBe(a);
				}
			}
		});
	}
});

/* ---------------------------------------------------------------
   Invariant #5 — `parle` sûr et lisible (tous niveaux).
   `parle` = énoncé LU + intitulés des sous-questions, jamais la réponse. On ne teste
   PAS « la valeur de la réponse n'apparaît nulle part » : un donné de l'énoncé peut
   légitimement coïncider avec la réponse (ex. composition « recherche d'une partie »
   où t = 2a rend la partie affichée égale à la réponse). Le contrôle robuste est
   STRUCTUREL : les intitulés sont bien dans `parle`, rien n'est ajouté APRÈS eux, et
   aucun intitulé des 4 structures ne contient de chiffre (donc ne peut fuiter la réponse).
   --------------------------------------------------------------- */
describe('#255 — parle contient énoncé + sous-questions, sans fuite de réponse', () => {
	for (const id of IDS_ETENDUES) {
		it(`${id} : chaque intitulé est dans parle, rien n'est ajouté après, aucun chiffre dans les intitulés`, () => {
			for (const ech of [ECH_CE2.get(id)!, ECH_CM1.get(id)!]) {
				for (const ex of ech) {
					const derniere = ex.etapes[ex.etapes.length - 1].question;
					for (const et of ex.etapes) {
						expect(ex.parle).toContain(et.question);
						// Un intitulé sans chiffre ne peut pas révéler la réponse numérique.
						expect(et.question).not.toMatch(/\d/);
					}
					// `parle` se termine par la dernière sous-question → aucune réponse appendue.
					expect(ex.parle.trimEnd().endsWith(derniere)).toBe(true);
				}
			}
		});
	}

	// Les items non-mesure (CE2 et argent CM1) affichent l'énoncé tel qu'il est lu.
	// Détection mesure par le RADICAL singulier : « mètre » est un préfixe de « mètres »,
	// donc `includes` couvre l'unité au singulier (valeur < 2) COMME au pluriel (≥ 2).
	it('items non-mesure : parle reprend l’énoncé affiché mot pour mot', () => {
		const RADICAUX = ['mètre', 'kilogramme', 'litre'];
		for (const id of IDS_ETENDUES) {
			for (const ech of [ECH_CE2.get(id)!, ECH_CM1.get(id)!]) {
				for (const ex of ech) {
					if (RADICAUX.some((m) => ex.parle.includes(m))) continue; // item mesure : cf. test dédié
					expect(ex.parle).toContain(ex.enonce);
				}
			}
		}
	});
});

/* ---------------------------------------------------------------
   Invariant #5 (suite) — mesures décimales : le TTS lit le NOM PLEIN d'unité, ACCORDÉ.
   L'énoncé AFFICHÉ garde le symbole (« 3,5 m ») ; le `parle` porte le nom plein, accordé
   en nombre : SINGULIER quand la valeur < 2 (« 1,2 mètre »), PLURIEL à partir de 2
   (« 3,5 mètres ») — règle française du nom après un nombre fractionnaire. On détecte
   l'unité par son RADICAL singulier (préfixe du pluriel). Seules composition et
   comparaison produisent des mesures décimales.
   --------------------------------------------------------------- */
describe('#255 — mesures décimales : nom plein lu et accordé, symbole affiché', () => {
	// `mot` = radical singulier (couvre sg et pl via `includes`) ; `sym` = symbole affiché.
	const UNITES = [
		{ mot: 'mètre', sym: 'm' },
		{ mot: 'kilogramme', sym: 'kg' },
		{ mot: 'litre', sym: 'L' },
	];
	// Regex « valeur décimale + symbole » (les mesures ont toujours une virgule, dixième 1..9).
	const symRe = (sym: string) => new RegExp('\\d,\\d ' + sym + '(?![A-Za-zÀ-ÿ])');
	// « valeur nom-d'unité » dans le parle : capture la valeur et le nom (sg OU pl).
	const uniteRe = /(\d+(?:,\d+)?) (mètres?|kilogrammes?|litres?)/g;

	const echMesure = () =>
		(['math-prob-composition', 'math-prob-comparaison'] as const).flatMap((id) => ECH_CM1.get(id)!);

	it('au moins un item mesure : nom plein (radical) dans parle, symbole dans enonce', () => {
		let vus = 0;
		for (const ex of echMesure()) {
			for (const { mot, sym } of UNITES) {
				if (!ex.parle.includes(mot)) continue;
				vus++;
				// Le nom plein est lu (parle) mais ABSENT de l'affiché (qui garde le symbole).
				expect(ex.enonce).not.toContain(mot);
				// L'affiché porte bien la valeur décimale suivie du symbole d'unité.
				expect(symRe(sym).test(ex.enonce)).toBe(true);
			}
		}
		expect(vus).toBeGreaterThan(0); // les items mesure décimaux sont bien atteints
	});

	// Verrouille le correctif d'accord : chaque « valeur nom » du parle s'accorde en nombre.
	it('accord du nom d’unité lu : singulier si valeur < 2, pluriel si ≥ 2', () => {
		let singuliers = 0;
		let pluriels = 0;
		for (const ex of echMesure()) {
			for (const m of ex.parle.matchAll(uniteRe)) {
				const valeur = Number(m[1].replace(',', '.'));
				const estPluriel = m[2].endsWith('s');
				if (valeur < 2) {
					expect(estPluriel).toBe(false); // « 1,6 mètre » (jamais « mètres »)
					singuliers++;
				} else {
					expect(estPluriel).toBe(true); // « 3,5 mètres »
					pluriels++;
				}
			}
		}
		// Les deux accords sont réellement exercés (le correctif n'est pas testé à vide).
		expect(singuliers).toBeGreaterThan(0);
		expect(pluriels).toBeGreaterThan(0);
	});
});

/* ---------------------------------------------------------------
   Invariant #6 — repli texte (bilan/révision) via genLessonItem(_, 'cm1').
   Réponse décimale → écriture à VIRGULE française (contient ',', jamais '.') ;
   réponse entière → sans virgule ; item numérique ; la saisie « 7,5 »/« 7.5 » valide.
   --------------------------------------------------------------- */
describe('#255 — repli texte catalogue (genLessonItem CM1)', () => {
	for (const id of IDS_ETENDUES) {
		it(`${id} : items 'num', décimaux en virgule (jamais de point), entiers sans virgule`, () => {
			const lesson = getLessonById(id)!;
			let avecVirgule = 0;
			let sansVirgule = 0;
			withSeed(SEED, () => {
				for (let i = 0; i < 400; i++) {
					const item = genLessonItem(lesson, 'cm1');
					expect(item.kind).toBe('num');
					const ans = String(item.answer);
					expect(ans).not.toContain('.'); // jamais de séparateur point
					if (ans.includes(',')) {
						avecVirgule++;
						// La saisie de l'enfant (virgule OU point) valide la réponse stockée.
						expect(checkItemAnswer(item, ans)).toBe(true);
						expect(checkItemAnswer(item, ans.replace(',', '.'))).toBe(true);
					} else {
						sansVirgule++;
						expect(Number.isInteger(Number(ans))).toBe(true);
						expect(checkItemAnswer(item, ans)).toBe(true);
					}
				}
			});
			// Le repli expose bien les DEUX formes (le mix décimal remonte jusqu'au catalogue).
			expect(avecVirgule).toBeGreaterThan(0);
			expect(sansVirgule).toBeGreaterThan(0);
		});
	}

	it('checkItemAnswer tolère virgule et point pour une réponse décimale stockée', () => {
		const item: Item = { text: 'q @', answer: '7,5', kind: 'num' };
		expect(checkItemAnswer(item, '7,5')).toBe(true);
		expect(checkItemAnswer(item, '7.5')).toBe(true); // point accepté
		expect(checkItemAnswer(item, '7,50')).toBe(true); // écriture équivalente
		expect(checkItemAnswer(item, '7,6')).toBe(false); // mauvaise valeur
	});
});

/* ---------------------------------------------------------------
   Bonus — transformation décimale (argent) : jamais la variante piège « état initial »
   (« au début »). Ce piège reste réservé au chemin ENTIER CE2 ; le décimal est loyal.
   --------------------------------------------------------------- */
describe('#255 — bonus : transformation décimale sans piège « état initial »', () => {
	it('les items ARGENT de transformation ne demandent jamais « au début »', () => {
		let vusArgent = 0;
		for (const ex of ECH_CM1.get('math-prob-transformation')!) {
			if (!ex.enonce.includes('€')) continue; // item décimal argent (chemin loyal)
			vusArgent++;
			expect(ex.etapes[0].question).not.toContain('au début');
		}
		expect(vusArgent).toBeGreaterThan(0); // des items argent existent bien
	});
});
