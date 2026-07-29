/* ============================================================
   Leçon du jour (#208) — correctif d'ALTERNANCE des matières (#484).
   ------------------------------------------------------------
   Règle éprouvée ici (dérivée de la spec, pas de l'implémentation) :
   - le fil (`sequenceLeconDuJour`) entrelace 1:1 les leçons RESTANT à acquérir de
     chaque matière, chacune prise au niveau ACTIF de SA matière (#225) ;
   - le round-robin PART de la matière la MOINS AVANCÉE = celle qui compte le moins
     de leçons ACQUISES dans la séquence de son niveau actif ; à égalité, l'ordre de
     déclaration du catalogue (`SUBJECTS`) tranche ;
   - « acquise » = au moins UNE étoile au niveau actif ;
   - la carte d'accueil n'affiche que la TÊTE du fil, donc `leconDuJour()` doit
     ALTERNER au fil des étoiles (c'était le bug #484).

   Complète le describe « leçon du jour » de `ordre-pedagogique.test.ts` (profil neuf,
   deux crans d'alternance, cyclicité de base, tout acquis, CM1, niveau par matière) :
   on prend ici les cas TORDUS — égalités répétées, matière épuisée, étoiles gagnées
   hors du fil, avancements différents par matière avec étoiles namespacées, et les
   invariants du fil sur échantillon large.

   Les séquences de référence sont lues dans la DONNÉE d'ordre pédagogique
   (`ordreLecons`) et non recalculées depuis le moteur testé ;
   `ordre-pedagogique.test.ts` garantit par ailleurs que le catalogue filtré par
   niveau rend exactement ces listes.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ordreLecons } from '../src/core/ordre';
import { SUBJECTS, getLessonById } from '../src/core/catalog';
import { leconDuJour, leconSuivante, sequenceLeconDuJour } from '../src/core/lecon-du-jour';
import {
	initProfiles,
	setNiveauMatiere,
	setNiveauReference,
	touchActiveProfile,
} from '../src/core/profiles';
import { recordLessonResult } from '../src/core/progress';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

const M_CE2 = ordreLecons('math', 'ce2');
const F_CE2 = ordreLecons('francais', 'ce2');
const M_CM1 = ordreLecons('math', 'cm1');
const F_CM1 = ordreLecons('francais', 'cm1');

/* Étoile « sans faute » via le chemin RÉEL (namespacée par le niveau de jeu). */
function etoiler(...ids: string[]): void {
	for (const id of ids) recordLessonResult(id, true);
}
/* Carte d'étoiles au format de la VUE scopée que `loadStars()` fournit au moteur
   (clés = id de leçon nu, valeur = nombre d'étoiles). Sert aux configurations
   massives / artificielles, sans passer par 130 écritures de localStorage. */
function etoilesDe(ids: string[], valeur = 1): Record<string, number> {
	const out: Record<string, number> = {};
	for (const id of ids) out[id] = valeur;
	return out;
}
const fil = (): string[] => sequenceLeconDuJour().map((l) => l.id);
const carte = (): string | null => leconDuJour()?.id ?? null;
const premier = (ids: string[]): string | undefined => (ids.length > 0 ? ids[0] : undefined);

describe('leçon du jour — prémisses du catalogue', () => {
	it('deux matières, les maths déclarées en premier : c’est l’arbitre des égalités', () => {
		// Les tests d'alternance ci-dessous attendent « maths » au premier cran d'égalité :
		// si le catalogue est réordonné, c'est ICI que ça doit échouer (message explicite).
		expect(SUBJECTS.map((s) => s.id)).toEqual(['math', 'francais']);
		expect(M_CE2.length).toBeGreaterThan(10);
		expect(F_CE2.length).toBeGreaterThan(M_CE2.length); // le français CE2 est le plus long
	});

	it('profil sans classe choisie : le fil démarre sur le programme CE2 (niveau par défaut)', () => {
		expect(carte()).toBe(M_CE2[0]);
		expect(fil()).toHaveLength(M_CE2.length + F_CE2.length);
	});
});

describe('leçon du jour — égalité d’avancement : l’ordre du catalogue tranche (#484)', () => {
	it('à CHAQUE cran d’égalité, les maths reprennent la main puis la rendent', () => {
		setNiveauReference('ce2');
		// 6 allers-retours : on ne veut pas seulement vérifier le profil neuf (0 ↔ 0),
		// mais que l'arbitrage par le NOMBRE d'acquises tient cran après cran.
		for (let n = 0; n < 6; n++) {
			expect(carte()).toBe(M_CE2[n]); // n ↔ n → égalité → maths
			etoiler(M_CE2[n]); // n+1 ↔ n → le français devient le moins avancé
			expect(carte()).toBe(F_CE2[n]);
			etoiler(F_CE2[n]); // écart refermé
		}
		expect(carte()).toBe(M_CE2[6]);
	});

	it('égalité obtenue par des étoiles ÉPARSES : c’est le NOMBRE d’acquises qui compte, pas la position atteinte', () => {
		setNiveauReference('ce2');
		etoiler(M_CE2[3], M_CE2[20]); // 2 acquises en maths, mais rien en tête de programme
		expect(carte()).toBe(F_CE2[0]);
		etoiler(F_CE2[9], F_CE2[40]); // 2 ↔ 2 → égalité → maths
		// La tête est la 1re leçon math NON acquise (M[0]), pas « la suivante après M[20] ».
		expect(carte()).toBe(M_CE2[0]);
		const seq = fil();
		expect(seq.slice(0, 8)).toEqual([
			M_CE2[0],
			F_CE2[0],
			M_CE2[1],
			F_CE2[1],
			M_CE2[2],
			F_CE2[2],
			M_CE2[4], // M[3] est acquise → sautée sur place, l'alternance ne décale pas
			F_CE2[3],
		]);
	});

	it('plusieurs étoiles sur la MÊME leçon ne comptent qu’une seule acquise', () => {
		setNiveauReference('ce2');
		etoiler(M_CE2[0], M_CE2[0], M_CE2[0]); // 3 étoiles, 1 leçon acquise
		expect(carte()).toBe(F_CE2[0]);
		etoiler(F_CE2[0]);
		// Si l'avancement SOMMAIT les étoiles (3 ↔ 1), le français garderait la main :
		// l'égalité 1 ↔ 1 doit rendre la main aux maths.
		expect(carte()).toBe(M_CE2[1]);
	});

	it('un essai AVEC faute ne fait pas avancer la leçon du jour', () => {
		setNiveauReference('ce2');
		recordLessonResult(M_CE2[0], false);
		recordLessonResult(M_CE2[0], false);
		expect(carte()).toBe(M_CE2[0]);
		expect(fil()).toHaveLength(M_CE2.length + F_CE2.length);
	});

	it('une entrée à 0 étoile n’est PAS une leçon acquise', () => {
		setNiveauReference('ce2');
		const stars = etoilesDe([M_CE2[0], F_CE2[0]], 0);
		expect(leconDuJour(stars)?.id).toBe(M_CE2[0]);
		expect(sequenceLeconDuJour(stars)).toHaveLength(M_CE2.length + F_CE2.length);
	});
});

describe('leçon du jour — matière épuisée : l’autre se déroule seule', () => {
	it('maths terminées (de loin les plus avancées) → le fil est le programme français, dans l’ordre', () => {
		setNiveauReference('ce2');
		etoiler(...M_CE2);
		expect(fil()).toEqual(F_CE2); // aucune leçon math parasite, ordre pédagogique intact
		expect(carte()).toBe(F_CE2[0]);
		expect(leconSuivante(F_CE2[0])?.id).toBe(F_CE2[1]);
	});

	it('matière épuisée et MOINS avancée en nombre : sa file vide est simplement sautée', () => {
		setNiveauReference('ce2');
		const n = M_CE2.length + 3; // le français compte PLUS d'acquises que les maths…
		expect(F_CE2.length).toBeGreaterThan(n); // …tout en ayant encore du programme
		etoiler(...M_CE2); // maths : tout acquis, 0 restante
		etoiler(...F_CE2.slice(0, n));
		// Les maths sont « la moins avancée » (moins d'acquises) mais n'ont plus rien à
		// proposer : le fil ne doit pas s'arrêter là ni devenir vide.
		expect(carte()).toBe(F_CE2[n]);
		expect(fil()).toEqual(F_CE2.slice(n));
	});

	it('symétrique : français terminé → le fil est le programme maths, dans l’ordre', () => {
		setNiveauReference('ce2');
		etoiler(...F_CE2);
		expect(fil()).toEqual(M_CE2);
		expect(carte()).toBe(M_CE2[0]);
	});

	it('matière SANS contenu au niveau actif : le fil ne s’arrête pas dessus', () => {
		// Une matière dont le niveau actif n'a aucune leçon a 0 acquise : elle est donc
		// « la moins avancée » et ouvrirait le fil, mais sa file est vide → l'autre
		// matière doit se dérouler seule (cas d'un niveau pas encore couvert côté contenu).
		setNiveauReference('ce2');
		setNiveauMatiere('francais', 'cp');
		expect(ordreLecons('francais', 'cp')).toEqual([]);
		expect(carte()).toBe(M_CE2[0]);
		etoiler(M_CE2[0], M_CE2[1]);
		expect(carte()).toBe(M_CE2[2]);
		expect(fil()).toEqual(M_CE2.slice(2));
	});
});

describe('leçon du jour — étoiles gagnées HORS du fil (catalogue libre)', () => {
	it('la matière prise d’avance rend la main jusqu’à ce que l’écart se referme, 1 pour 1', () => {
		setNiveauReference('ce2');
		// L'enfant étoile 4 leçons de maths piochées librement dans le catalogue.
		etoiler(M_CE2[10], M_CE2[3], M_CE2[20], M_CE2[1]);
		// Le français (0 acquise) garde la main tant qu'il n'a pas rattrapé les 4 acquises.
		for (const attendu of [F_CE2[0], F_CE2[1], F_CE2[2], F_CE2[3]]) {
			expect(carte()).toBe(attendu);
			etoiler(attendu);
		}
		// 4 ↔ 4 → égalité → retour aux maths, sur leur 1re leçon non acquise.
		expect(carte()).toBe(M_CE2[0]);
		etoiler(M_CE2[0]);
		expect(carte()).toBe(F_CE2[4]); // et l'alternance 1:1 reprend normalement
	});
});

describe('leçon du jour — niveau PAR MATIÈRE (#225)', () => {
	it('les acquises se comptent dans la séquence du niveau actif de CHAQUE matière', () => {
		setNiveauReference('ce2');
		setNiveauMatiere('math', 'cm1'); // maths en CM1, français en CE2
		etoiler(M_CM1[0], M_CM1[1], M_CM1[2]); // 3 acquises en maths CM1
		etoiler(F_CE2[0]); // 1 acquise en français CE2
		expect(carte()).toBe(F_CE2[1]); // le français est en retard : il garde la main
		etoiler(F_CE2[1], F_CE2[2]); // 3 ↔ 3 → égalité → maths
		expect(carte()).toBe(M_CM1[3]);
		const seq = fil();
		expect(seq[1]).toBe(F_CE2[3]);
		expect(seq).toHaveLength(M_CM1.length - 3 + (F_CE2.length - 3));
	});

	it('une étoile gagnée en CE2 ne rend pas la leçon acquise en CM1', () => {
		setNiveauReference('ce2');
		expect(M_CE2[0]).toBe('num-comparer'); // leçon présente aux DEUX niveaux
		expect(M_CM1[0]).toBe('num-comparer');
		etoiler('num-comparer'); // rangée @ce2 (niveau de jeu des maths)
		expect(carte()).toBe(F_CE2[0]); // maths 1 ↔ français 0
		setNiveauMatiere('math', 'cm1');
		// Au CM1 la leçon est de nouveau à acquérir : 0 ↔ 0 → égalité → maths.
		expect(carte()).toBe('num-comparer');
		expect(fil()).toHaveLength(M_CM1.length + F_CE2.length);
	});

	it('une étoile gagnée en CM1 ne compte pas quand la matière repasse en CE2', () => {
		setNiveauReference('ce2');
		setNiveauMatiere('math', 'cm1');
		etoiler('num-comparer'); // rangée @cm1
		expect(carte()).toBe(F_CE2[0]);
		setNiveauMatiere('math', 'ce2');
		expect(carte()).toBe('num-comparer');
		expect(fil()).toHaveLength(M_CE2.length + F_CE2.length);
	});

	it('leçon CE2-only étoilée par un profil CM1 : n’avance pas le fil CM1', () => {
		setNiveauReference('cm1');
		// Jouée hors filtre (favori / révision), son étoile est rangée au niveau où elle
		// se joue (@ce2) : elle ne peut pas faire avancer la séquence CM1 des maths.
		expect(getLessonById('math-tables-addition')?.levels).toEqual(['ce2']);
		etoiler('math-tables-addition');
		expect(carte()).toBe(M_CM1[0]);
		expect(fil()).toHaveLength(M_CM1.length + F_CM1.length);
	});
});

describe('leçon du jour — invariants du fil (échantillon large)', () => {
	it('permutation exacte des non acquises, alternance 1:1, tête = leçon du jour', () => {
		setNiveauReference('ce2');
		fc.assert(
			fc.property(fc.subarray(M_CE2), fc.subarray(F_CE2), (mAcquises, fAcquises) => {
				const stars = etoilesDe([...mAcquises, ...fAcquises]);
				const acquises = new Set([...mAcquises, ...fAcquises]);
				const restM = M_CE2.filter((id) => !acquises.has(id));
				const restF = F_CE2.filter((id) => !acquises.has(id));
				const obtenu = sequenceLeconDuJour(stars).map((l) => l.id);
				const setM = new Set(restM);

				// 1. Rien de perdu, rien en double, rien d'acquis.
				expect(new Set(obtenu).size).toBe(obtenu.length);
				expect([...obtenu].sort()).toEqual([...restM, ...restF].sort());

				// 2. Chaque matière garde son ordre pédagogique dans le fil.
				expect(obtenu.filter((id) => setM.has(id))).toEqual(restM);
				expect(obtenu.filter((id) => !setM.has(id))).toEqual(restF);

				// 3. Entrelacement 1:1 : sur les 2 × min(files) premiers éléments, les
				//    matières alternent strictement (au-delà, la plus longue déroule seule).
				const paires = 2 * Math.min(restM.length, restF.length);
				for (let i = 1; i < paires; i++) {
					expect(setM.has(obtenu[i])).toBe(!setM.has(obtenu[i - 1]));
				}

				// 4. La tête vient de la matière la MOINS avancée (égalité → catalogue,
				//    maths d'abord), et de l'autre si cette file est vide.
				const files = mAcquises.length <= fAcquises.length ? [restM, restF] : [restF, restM];
				expect(premier(obtenu)).toBe(premier(files[0]) ?? premier(files[1]));

				// 5. `leconDuJour` = tête du fil ; le contournement propose bien AUTRE chose.
				expect(leconDuJour(stars)?.id).toBe(premier(obtenu));
				if (obtenu.length >= 2) {
					expect(leconSuivante(obtenu[0], stars)?.id).toBe(obtenu[1]);
				}
			}),
			{ numRuns: 200 },
		);
	});
});

describe('leçon du jour — contournement « voir une autre leçon »', () => {
	it('boucle en fin de fil : après la dernière leçon on revient à la tête', () => {
		setNiveauReference('ce2');
		const seq = fil();
		expect(leconSuivante(seq[seq.length - 1])?.id).toBe(seq[0]);
	});

	it('fil réduit à UNE leçon : le contournement la repropose (jamais de cul-de-sac)', () => {
		setNiveauReference('ce2');
		const derniere = F_CE2[F_CE2.length - 1];
		const stars = etoilesDe([...M_CE2, ...F_CE2.filter((id) => id !== derniere)]);
		expect(sequenceLeconDuJour(stars).map((l) => l.id)).toEqual([derniere]);
		expect(leconDuJour(stars)?.id).toBe(derniere);
		// Une seule leçon restante : le seul « suivant » possible est elle-même — le
		// bouton doit rester utilisable plutôt que de renvoyer `null`.
		expect(leconSuivante(derniere, stars)?.id).toBe(derniere);
	});
});
