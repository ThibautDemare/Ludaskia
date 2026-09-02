/* ============================================================
   Une réponse en euros révélée garde ses centimes (#542) — logique PURE.
   ------------------------------------------------------------
   Tests écrits AVANT l'implémentation, depuis les critères de l'issue et la règle du
   programme — pas depuis le code, qui n'existe pas encore. Ils sont donc ROUGES tant que
   `formatEuros` (core/nombres.ts), `UniteEtape` (core/exercise.ts) et le second paramètre
   d'`attenduEtapeTexte` (core/probleme-etapes.ts) ne sont pas là.

   LA RÈGLE, une seule (docs/reference/programmes/ce2-maths.md § 2.4, qui écrit
   « 43,45 € + 68 € » ; arbitrage pedagogue-primaire) :
     DEUX chiffres après la virgule dès qu'il y a des centimes, AUCUNE décimale si le
     montant est entier. Donc « 7,50 » et « 6 » — jamais « 7,5 », jamais « 6,00 ».
   C'est la règle des ÉNONCÉS d'argent depuis toujours ; #542 la fait tenir aussi pour la
   réponse RÉVÉLÉE, qui prolonge l'énoncé et doit donc s'écrire comme lui. Un problème à
   4,50 € affiche aujourd'hui « → 4,5 » dans sa case révélée, parce que la mise en forme
   passe par `String(x).replace('.', ',')` et que 4,50 se stocke en 4.5.

   Ce qui est éprouvé :
   - `formatEuros` : la règle elle-même, sur les cas qui font mal (centimes finissant par
     zéro, centimes < 10, montant entier, zéro) puis par balayage de tous les centimes
     d'une plage réaliste (graphie + relecture exacte de la valeur) ;
   - `attenduEtapeTexte(attendu, unite)` : « euro » → deux décimales ; SANS unité →
     l'écriture d'aujourd'hui, inchangée (critère 6) ; et le fait que SEULE l'unité change
     l'écriture, jamais la valeur (critère 7 : pas de « si ça ressemble à un prix ») ;
   - le catalogue en vrai : toute sous-question d'un problème dont l'énoncé parle d'euros
     est DÉCLARÉE « euro » (critère 2 : la déclaration vient de l'appelant) — c'est
     l'invariant qui attrapera le générateur d'argent qu'on oubliera de taguer, ce qu'aucun
     test de `formatEuros` ne verrait — et aucune sous-question hors argent ne l'est ;
   - la CASE RÉVÉLÉE et la marque de correction dans le DOM (critère 1, « y compris dans
     la case révélée ») : la solution affichée et son `aria-label` ;
   - l'étayage (« 4,50 + 2,25 = 6,75 ») et le repli fiche du catalogue, les deux autres
     chemins qui recopiaient la mise en forme de la réponse attendue ;
   - l'unité des OPÉRANDES du calcul, déclarée séparément (`uniteA`/`uniteB`) : une
     multiplication mélange une quantité et un prix, donc « 3 × 3,20 = 9,60 » et jamais
     « 3,00 × 3,20 » ; un calcul ADDITIF, lui, a forcément ses deux opérandes dans
     l'unité de son résultat.

   Ce que ce fichier NE couvre PAS, et pourquoi :
   - les quatre appels au journal encadrant (`attendue: String(etape.answer)`, donc avec
     un POINT) vivent dans le corps non exporté de ui/lecon-probleme.ts et ui/revision.ts
     → seul un e2e peut lire ce que le parent voit (→ auteur-tests-e2e) ;
   - la graphie des ÉNONCÉS et les prémisses de l'échantillonnage sont dans
     tests/euros-graphie-enonces.test.ts (comportement CONSTANT du refactoring).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { formatEuros, parseNombreFr } from '../src/core/nombres';
import { attenduEtapeTexte, etatEtape } from '../src/core/probleme-etapes';
import { derouleProbleme } from '../src/core/etayage-probleme';
import {
	corrigerEtapesProbleme,
	renderProblemeBoardHTML,
	revelerEtapesProbleme,
} from '../src/ui/lecon-probleme';
import type { ProbQuestion } from '../src/ui/lecon-probleme';
import { genLessonItem, getAllLessons } from '../src/core/catalog';
import { checkItemAnswer } from '../src/core/items';
import { withSeed } from '../src/core/utils';
import type { Exercise, ProblemeEtape, UniteEtape } from '../src/core/exercise';

type ProbEx = Extract<Exercise, { type: 'probleme' }>;

/** La règle du programme, en un motif : « 6 » ou « 7,50 ». Interdit « 7,5 », « 6,00 »,
    « 7.50 », « 7,500 ». */
const MONTANT_EURO = /^\d+(?:,\d{2})?$/;

/** Un nombre à UNE seule décimale dans un texte (« 4,5 ») — la forme tronquée que #542
    fait disparaître des montants, et qui doit RESTER pour une mesure au dixième. */
const UNE_DECIMALE = /\d,\d(?!\d)/;

/* ================================================================== */
/* 1. `formatEuros` — la règle monétaire, en un seul endroit           */
/* ================================================================== */
describe('#542 critère 3 — formatEuros : la règle du programme, une seule fois', () => {
	/* Cas dérivés à la main de la règle. Le premier est LE cas du bug : 4,50 € se stocke
	   en 4.5, donc toute mise en forme qui passe par `String` perd le zéro des centièmes. */
	it('centimes finissant par zéro : « 4,50 », jamais « 4,5 »', () => {
		expect(formatEuros(4.5)).toBe('4,50');
		expect(formatEuros(7.5)).toBe('7,50');
		expect(formatEuros(6.9)).toBe('6,90');
		expect(formatEuros(1.1)).toBe('1,10');
		expect(formatEuros(0.5)).toBe('0,50');
	});

	it('centimes inférieurs à 10 : le zéro des dizaines est écrit (« 4,05 »)', () => {
		expect(formatEuros(4.05)).toBe('4,05');
		expect(formatEuros(0.05)).toBe('0,05');
		expect(formatEuros(12.01)).toBe('12,01');
	});

	it('centimes quelconques : recopiés tels quels', () => {
		expect(formatEuros(4.25)).toBe('4,25');
		expect(formatEuros(12.75)).toBe('12,75');
		expect(formatEuros(22.45)).toBe('22,45');
	});

	/* Arbitrage pedagogue-primaire : un montant ENTIER s'écrit sans décimale. « 6,00 »
	   n'est pas la graphie de l'école et n'apparaît nulle part dans les énoncés. */
	it('montant entier : « 6 », jamais « 6,00 »', () => {
		expect(formatEuros(6)).toBe('6');
		expect(formatEuros(20)).toBe('20');
		expect(formatEuros(1)).toBe('1');
		expect(formatEuros(6)).not.toContain(',');
	});

	it('zéro : « 0 » (ni « 0,00 » ni vide)', () => {
		expect(formatEuros(0)).toBe('0');
	});

	it('jamais le point décimal anglo-saxon, ni de notation scientifique', () => {
		for (const v of [0, 0.05, 4.5, 6, 12.75, 99.99]) {
			expect(formatEuros(v)).not.toContain('.');
			expect(formatEuros(v)).not.toMatch(/e[+-]/i);
		}
	});

	/* Balayage de TOUS les centimes de la plage réaliste des problèmes d'argent
	   (0 → 100 €). Deux invariants indissociables : la GRAPHIE (0 ou 2 décimales, selon
	   que le montant est entier) et la VALEUR (le montant se relit exactement — un
	   formatage ne doit jamais arrondir ni tronquer une réponse). */
	it('sur tous les centimes de 0 à 100 € : graphie conforme et valeur intacte', () => {
		for (let c = 0; c <= 10000; c++) {
			const v = c / 100;
			const texte = formatEuros(v);
			expect(texte, `${c} c`).toMatch(MONTANT_EURO);
			// Décimales présentes SI ET SEULEMENT SI le montant n'est pas entier.
			expect(texte.includes(','), `${c} c → « ${texte} »`).toBe(c % 100 !== 0);
			// Relecture : la valeur affichée est exactement la valeur reçue.
			expect(Number(texte.replace(',', '.')), `${c} c → « ${texte} »`).toBe(v);
		}
	});

	/* AFFICHER NE DOIT PAS CASSER CORRIGER — la propriété de bouclage de #542, et la seule
	   qui interdise à une amélioration de graphie de se payer sur la correction. Elle ne
	   nomme AUCUN séparateur et aucune graphie : ce qui est proposé à la recopie doit être
	   accepté, quoi qu'on décide d'écrire demain. C'est exactement ce qui manquait : la case
	   d'un problème était le SEUL correcteur numérique de l'appli à relire par un `Number`
	   nu, là où la réponse révélée s'écrit groupée (« 12 345,50 ») — recopier ce qu'on lui
	   montrait aurait fait compter l'enfant faux. */
	it('ce que formatEuros affiche est accepté si l’enfant le recopie', () => {
		for (let c = 0; c <= 10000; c += 5) {
			const v = c / 100;
			expect(etatEtape(formatEuros(v), v), `${c} c`).toBe('juste');
		}
	});
});

/* ================================================================== */
/* 1 bis. Le GROUPEMENT des grands montants                            */
/* ------------------------------------------------------------------ */
/* Convention française (docs de core/nombres.ts, leçons « grands nombres » CM1) : les
   chiffres se groupent par classes de 3 depuis le millier, séparées par une ESPACE FINE
   INSÉCABLE U+202F — jamais une virgule (séparateur DÉCIMAL en français) ni un point
   (écriture anglo-saxonne) — et seulement À PARTIR DE 5 CHIFFRES (≥ 10 000), la plage CE2
   restant sans séparateur. Le caractère n'est jamais écrit en clair (invisible, fragile à
   l'édition) : on le désigne par son CODE, comme le source.

   Ce que ces tests gardent n'est pas le groupement pour lui-même, c'est qu'ANNONCER une
   unité ne fasse rien PERDRE à une réponse. Sans ça, déclarer « euro » sur une réponse de
   12 345,50 € l'aurait rendue « 12345,50 » là où le même nombre sans unité s'écrit
   « 12 345,5 » : une régression déclenchée par la bonne intention. */
const FINE = String.fromCharCode(0x202f); // U+202F, séparateur de milliers français
/** La graphie française d'un montant GROUPÉ : classes de 3, séparateur fin, 0 ou 2 décimales. */
const MONTANT_GROUPE = new RegExp('^[0-9]{1,3}(?:' + FINE + '[0-9]{3})+(?:,[0-9]{2})?$');
/** La graphie d'un montant SOUS le seuil : au plus 4 chiffres, aucun séparateur. */
const MONTANT_NON_GROUPE = /^[0-9]{1,4}(?:,[0-9]{2})?$/;

describe('#542 — formatEuros groupe les grands montants comme n’importe quel nombre', () => {
	it('un grand montant à centimes : « 12 345,50 »', () => {
		expect(formatEuros(12345.5)).toBe(`12${FINE}345,50`);
		expect(formatEuros(12345.05)).toBe(`12${FINE}345,05`);
		expect(formatEuros(1234567.05)).toBe(`1${FINE}234${FINE}567,05`);
	});

	it('un grand montant entier : « 12 345 » (et toujours aucune décimale)', () => {
		expect(formatEuros(12345)).toBe(`12${FINE}345`);
		expect(formatEuros(1234567)).toBe(`1${FINE}234${FINE}567`);
	});

	/* La frontière, des deux côtés et dans les deux formes. Elle vaut 5 chiffres (10 000) :
	   4 chiffres restent la plage CE2, où rien n'est groupé. Un seuil pris à 4 chiffres
	   ferait apparaître « 1 400 », qui n'est pas la graphie scolaire usuelle. */
	it('frontière 9 999 / 10 000 — montant entier', () => {
		expect(formatEuros(9999)).toBe('9999');
		expect(formatEuros(10000)).toBe(`10${FINE}000`);
	});

	it('frontière 9 999 / 10 000 — montant à centimes', () => {
		expect(formatEuros(9999.5)).toBe('9999,50');
		expect(formatEuros(9999.99)).toBe('9999,99');
		expect(formatEuros(10000.5)).toBe(`10${FINE}000,50`);
		expect(formatEuros(10000.05)).toBe(`10${FINE}000,05`);
	});

	it('le séparateur est l’espace FINE insécable, jamais une espace ordinaire ni une ponctuation', () => {
		const texte = formatEuros(1234567.5);
		expect(texte).toContain(FINE);
		expect(texte).not.toContain(' '); // espace ordinaire
		expect(texte).not.toContain(String.fromCharCode(0x00a0)); // insécable LARGE, pas la fine
		expect(texte).not.toContain('.'); // ni point décimal, ni point de milliers
		expect(texte.match(/,/g)?.length).toBe(1); // UNE virgule : la décimale
	});

	/* La propriété qui compte : le groupement n'INSÈRE que des séparateurs, il ne recalcule
	   rien. On le vérifie par la relecture, avec le lecteur de l'appli (`parseNombreFr`, qui
	   neutralise les séparateurs de milliers) : aucun centime perdu, aucun chiffre déplacé.
	   Balayage FIN autour du seuil, au centime, dans les deux formes. */
	it('autour du seuil, au centime : graphie conforme et valeur relue exacte', () => {
		for (let c = 999500; c <= 1000500; c++) {
			const v = c / 100;
			const texte = formatEuros(v);
			expect(texte, `${c} c`).toMatch(v < 10000 ? MONTANT_NON_GROUPE : MONTANT_GROUPE);
			expect(texte.includes(','), `${c} c → « ${texte} »`).toBe(c % 100 !== 0);
			expect(parseNombreFr(texte), `${c} c → « ${texte} »`).toBe(v);
		}
	});

	it('sur de grands montants échelonnés jusqu’au million : valeur relue exacte', () => {
		for (let e = 10000; e <= 2000000; e += 7919) {
			for (const cent of [0, 5, 50, 99]) {
				const v = (e * 100 + cent) / 100;
				const texte = formatEuros(v);
				expect(texte, `${v}`).toMatch(MONTANT_GROUPE);
				expect(texte.includes(','), `${v} → « ${texte} »`).toBe(cent !== 0);
				expect(parseNombreFr(texte), `${v} → « ${texte} »`).toBe(v);
			}
		}
	});

	/* LE GATE de bouclage : « affiché ⇒ accepté » tenu AU-DESSUS du seuil de groupement,
	   dans les deux écritures (avec et sans unité déclarée), et sans nommer un seul
	   séparateur. C'est le versant correction du même invariant que le balayage à 100 € plus
	   haut : la case d'un problème était le seul correcteur numérique de l'appli à relire par
	   un `Number` nu, donc un montant groupé recopié tel quel était compté FAUX. Formulé
	   ainsi, le test survit à n'importe quel changement de graphie — il dit seulement que
	   les deux bouts de la chaîne ne peuvent pas se contredire.

	   Deux bandes : au CENTIME de part et d'autre du seuil (la frontière est là), puis des
	   ordres de grandeur échelonnés pour couvrir plusieurs classes de 3. */
	it('un montant groupé recopié tel qu’affiché est JUSTE, avec ou sans unité déclarée', () => {
		const recopie = (v: number): void => {
			expect(etatEtape(attenduEtapeTexte(v, 'euro'), v), `euro ${v}`).toBe('juste');
			expect(etatEtape(attenduEtapeTexte(v), v), `sans unité ${v}`).toBe('juste');
		};
		for (let c = 999500; c <= 1000500; c++) recopie(c / 100);
		for (let e = 10000; e <= 2000000; e += 7919) {
			for (const cent of [0, 5, 50, 99]) recopie((e * 100 + cent) / 100);
		}
	});
});

/* ================================================================== */
/* 2. `attenduEtapeTexte(attendu, unite)`                              */
/* ================================================================== */
describe('#542 critère 5 — la réponse révélée d’une sous-question d’argent', () => {
	it('« euro » → deux décimales dès qu’il y a des centimes', () => {
		expect(attenduEtapeTexte(4.5, 'euro')).toBe('4,50');
		expect(attenduEtapeTexte(4.05, 'euro')).toBe('4,05');
		expect(attenduEtapeTexte(22.45, 'euro')).toBe('22,45');
		expect(attenduEtapeTexte(0.5, 'euro')).toBe('0,50');
	});

	it('« euro » → aucune décimale sur un montant entier (« 6 », pas « 6,00 »)', () => {
		expect(attenduEtapeTexte(6, 'euro')).toBe('6');
		expect(attenduEtapeTexte(0, 'euro')).toBe('0');
		expect(attenduEtapeTexte(20, 'euro')).toBe('20');
	});

	it('la réponse révélée en euros reste acceptée si l’enfant la recopie', () => {
		for (const v of [0, 0.05, 4.5, 6, 12.75, 27.25]) {
			expect(etatEtape(attenduEtapeTexte(v, 'euro'), v), String(v)).toBe('juste');
		}
	});
});

describe('#542 critère 6 — aucune réponse non monétaire ne gagne de décimales', () => {
	it('une mesure au dixième garde son unique décimale (« 3,5 »)', () => {
		expect(attenduEtapeTexte(3.5)).toBe('3,5');
		expect(attenduEtapeTexte(5.9)).toBe('5,9');
		expect(attenduEtapeTexte(0.4)).toBe('0,4');
	});

	it('un compte ou un résultat de calcul reste entier (« 12 », « 0 »)', () => {
		expect(attenduEtapeTexte(12)).toBe('12');
		expect(attenduEtapeTexte(0)).toBe('0');
		expect(attenduEtapeTexte(148)).toBe('148');
	});

	/* Même valeur QUE celle d'un prix : sans unité déclarée, elle s'écrit comme avant.
	   C'est la moitié du critère 7 — le nombre ne dit rien de son domaine. */
	it('4,5 sans unité s’écrit « 4,5 » : c’est l’unité qui décide, pas la valeur', () => {
		expect(attenduEtapeTexte(4.5)).toBe('4,5');
		expect(attenduEtapeTexte(4.5, undefined)).toBe('4,5');
		expect(attenduEtapeTexte(4.5)).not.toBe(attenduEtapeTexte(4.5, 'euro'));
	});

	/* Balayage : SANS unité, l'écriture reste celle d'aujourd'hui — la valeur à virgule
	   française, décimales telles quelles. Aucune valeur ne doit se voir « promue » en
	   montant par une heuristique (critère 7). Plage bornée à 10 000, seuil au-delà
	   duquel les réponses révélées groupent les chiffres (aucune réponse de problème
	   n'y arrive — prémisse vérifiée dans tests/euros-graphie-enonces.test.ts). */
	it('sur toutes les valeurs au centième de 0 à 100 : écriture inchangée sans unité', () => {
		for (let c = 0; c <= 10000; c++) {
			const v = c / 100;
			expect(attenduEtapeTexte(v), `${c} c`).toBe(String(v).replace('.', ','));
		}
	});

	it('sur toutes les mesures au dixième de 0 à 100 : une seule décimale conservée', () => {
		for (let d = 1; d <= 1000; d++) {
			if (d % 10 === 0) continue; // entier : pas de décimale à conserver
			const v = d / 10;
			expect(attenduEtapeTexte(v), `${d} dixièmes`).toBe(String(v).replace('.', ','));
			expect(attenduEtapeTexte(v), `${d} dixièmes`).toMatch(/^\d+,\d$/);
		}
	});
});

/* LA raison d'être du groupement dans `formatEuros`, et l'invariant qui aurait attrapé le
   piège : DÉCLARER une unité ne doit rien RETIRER à une réponse. L'unité gouverne les
   DÉCIMALES (« 4,5 » → « 4,50 ») et rien d'autre — surtout pas la graphie de la partie
   entière, qui suit la même convention française pour TOUS les nombres de l'appli. Sans ça,
   `attenduEtapeTexte(12345.5, 'euro')` rendait « 12345,50 » là où le même nombre sans unité
   s'écrit « 12 345,5 » : le groupement perdu en échange des centimes gagnés. Une régression
   déclenchée par la bonne intention, invisible tant qu'aucun montant n'atteint 10 000 €. */
describe('#542 — déclarer l’unité ne change QUE les décimales, jamais le groupement', () => {
	const partieEntiere = (texte: string): string => texte.split(',')[0];
	const nbSeparateurs = (texte: string): number => [...texte].filter((c) => c === FINE).length;

	it('la partie ENTIÈRE s’écrit pareil avec et sans unité', () => {
		const valeurs = [
			0, 6, 4.5, 0.05, 9999, 9999.5, 10000, 10000.5, 12345, 12345.5, 12345.05, 99999.99, 100000,
			1234567, 1234567.5,
		];
		for (const n of valeurs) {
			expect(partieEntiere(attenduEtapeTexte(n, 'euro')), String(n)).toBe(
				partieEntiere(attenduEtapeTexte(n)),
			);
		}
	});

	/* Balayage sur des ordres de grandeur échelonnés, de part et d'autre du seuil, dans les
	   trois formes (entier, un chiffre décimal, deux chiffres décimaux). */
	it('le nombre de séparateurs de milliers est le même avec et sans unité', () => {
		for (let e = 1; e <= 3000000; e = e * 3 + 1) {
			for (const n of [e, e + 0.5, e + 0.05]) {
				const avec = attenduEtapeTexte(n, 'euro');
				const sans = attenduEtapeTexte(n);
				expect(nbSeparateurs(avec), `${n} : « ${avec} » vs « ${sans} »`).toBe(nbSeparateurs(sans));
			}
		}
	});

	/* Dit à l'envers, et c'est la formulation la plus serrée : sur un montant à UN chiffre
	   décimal, tout ce que l'unité fait est d'AJOUTER le zéro des centièmes — elle ne
	   réécrit rien de ce qui précède. */
	it('sur un montant à un seul chiffre décimal, l’unité n’AJOUTE que le zéro des centièmes', () => {
		for (const n of [0.5, 4.5, 12.5, 9999.5, 10000.5, 12345.5, 1234567.5]) {
			expect(attenduEtapeTexte(n, 'euro'), String(n)).toBe(attenduEtapeTexte(n) + '0');
		}
	});

	it('sur un montant ENTIER, déclarer l’unité ne change rien du tout', () => {
		for (const n of [0, 6, 20, 9999, 10000, 100000, 1234567]) {
			expect(attenduEtapeTexte(n, 'euro'), String(n)).toBe(attenduEtapeTexte(n));
		}
	});

	it('sur un montant déjà à deux décimales, déclarer l’unité ne change rien du tout', () => {
		for (const n of [0.05, 4.25, 12.75, 9999.99, 12345.05, 1234567.99]) {
			expect(attenduEtapeTexte(n, 'euro'), String(n)).toBe(attenduEtapeTexte(n));
		}
	});
});

describe('#542 critères 2 et 7 — l’unité se DÉCLARE sur la sous-question', () => {
	it('contrat de type : une sous-question peut porter l’unité « euro »', () => {
		const euro: UniteEtape = 'euro';
		const etape: ProblemeEtape = {
			question: 'Combien paie-t-il en tout ?',
			answer: 4.5,
			unite: euro,
		};
		expect(etape.unite).toBe('euro');
		expect(attenduEtapeTexte(etape.answer, etape.unite)).toBe('4,50');
	});

	it('une sous-question sans unité déclarée s’écrit comme avant', () => {
		const etape: ProblemeEtape = { question: 'Quelle est la longueur totale ?', answer: 4.5 };
		expect(etape.unite).toBeUndefined();
		expect(attenduEtapeTexte(etape.answer, etape.unite)).toBe('4,5');
	});
});

/* ================================================================== */
/* 3. Le catalogue en vrai — le tag est-il POSÉ là où il faut ?         */
/* ================================================================== */

const TIRAGES = 100;
const SEED = 542001;

interface Tire {
	id: string;
	ex: ProbEx;
}

function tirerProblemes(): Tire[] {
	const out: Tire[] = [];
	for (const lecon of getAllLessons()) {
		for (const level of lecon.levels) {
			withSeed(SEED, () => {
				for (let i = 0; i < TIRAGES; i++) {
					const ex = lecon.exerciseType.generate({ level });
					if (ex.type === 'probleme') out.push({ id: `${lecon.id}/${level}`, ex });
				}
			});
		}
	}
	return out;
}

const PROBLEMES = tirerProblemes();
/** Un problème « d'argent » se reconnaît à son énoncé : c'est lui qui porte les montants
    (« 7,50 € »), et c'est à lui que la réponse révélée doit ressembler. */
const ARGENT = PROBLEMES.filter((t) => t.ex.enonce.includes('€'));
const HORS_ARGENT = PROBLEMES.filter((t) => !t.ex.enonce.includes('€'));

/** Sous-questions d'un problème d'argent dont la réponse N'EST PAS un montant (par
    exemple un NOMBRE d'articles achetés). VIDE aujourd'hui, et c'est le fond de
    l'invariant : toute exception future doit être DÉCLARÉE ici avec sa raison, jamais
    laissée passer en silence — sinon l'invariant ne garde plus rien. */
const ETAPES_NON_MONETAIRES: { motif: RegExp; raison: string }[] = [];

const nonMonetaire = (question: string): boolean =>
	ETAPES_NON_MONETAIRES.some((e) => e.motif.test(question));

/** Les montants écrits devant un « € » dans un texte. */
const montantsEuro = (texte: string): string[] =>
	[...texte.matchAll(/(\d+(?:[.,]\d+)?)\s*€/g)].map((m) => m[1]);

describe('#542 critères 1 et 2 — le catalogue déclare ses sous-questions d’argent', () => {
	it('l’échantillon contient des problèmes d’argent ET des problèmes hors argent', () => {
		expect(ARGENT.length).toBeGreaterThan(20);
		expect(HORS_ARGENT.length).toBeGreaterThan(20);
	});

	/* L'invariant qui vaut le plus cher : il n'éprouve pas une fonction, il éprouve que le
	   générateur a bien DIT ce qu'il produisait. C'est ce qui attrapera le prochain
	   générateur d'argent ajouté sans son unité — un test de `formatEuros`, lui, resterait
	   vert pendant que la case révélée afficherait « → 4,5 ».

	   Il porte sur TOUS les problèmes d'argent, y compris `math-prob-deux-etapes` (CE2),
	   dont les montants sont entiers : la déclaration n'y change rien à l'affichage
	   (« 20 » reste « 20 »), mais un générateur d'argent à moitié déclaré est un piège
	   pour le prochain qui rendra ses montants décimaux — ce qui est justement arrivé aux
	   quatre structures rouvertes au CM1 (#255). */
	it('toute sous-question d’un problème dont l’énoncé parle d’euros est déclarée « euro »', () => {
		for (const { id, ex } of ARGENT) {
			ex.etapes.forEach((etape, i) => {
				if (nonMonetaire(etape.question)) return;
				expect(
					etape.unite,
					`${id} — étape ${i} : « ${etape.question} » (énoncé : ${ex.enonce})`,
				).toBe('euro');
			});
		}
	});

	/* Le pendant négatif : le tag ne doit pas se recopier là où il n'a rien à faire. Un
	   problème de mesures (« 3,5 m ») déclaré « euro » verrait ses réponses gagner une
	   décimale — exactement le défaut inverse de celui que #542 corrige. */
	it('aucune sous-question d’un problème hors argent ne se déclare « euro »', () => {
		for (const { id, ex } of HORS_ARGENT) {
			for (const etape of ex.etapes) {
				const ou = `${id} : « ${etape.question} » (énoncé : ${ex.enonce})`;
				expect(etape.unite, ou).not.toBe('euro');
				// Même garde sur les opérandes : un `uniteB: 'euro'` recopié dans un générateur de
				// mesures ferait écrire « 3,50 m » à l'étayage, là où l'énoncé dit « 3,5 m ».
				expect(etape.calcul?.uniteA, `${ou} — opérande a`).not.toBe('euro');
				expect(etape.calcul?.uniteB, `${ou} — opérande b`).not.toBe('euro');
			}
		}
	});

	/* L'unité des OPÉRANDES (#542, contrat revu) — vrai EN DROIT, pas par constat du code :
	   on n'additionne pas des euros à des kilos. Si le résultat d'une somme ou d'une
	   différence est un montant, ses deux opérandes en sont un aussi, et doivent donc être
	   déclarés — sinon l'étayage écrit « 10 − 4,5 = 5,50 », une égalité dont les trois
	   nombres n'ont pas la même graphie sous les yeux de l'enfant. C'est l'invariant qui
	   attrapera l'opérande oublié dans six mois, et il ne peut pas se déduire d'un test de
	   `formatEuros`. */
	it('calcul ADDITIF en euros : les DEUX opérandes sont déclarés en euros', () => {
		let vus = 0;
		for (const { id, ex } of ARGENT) {
			for (const etape of ex.etapes) {
				const c = etape.calcul;
				if (etape.unite !== 'euro' || !c || (c.op !== '+' && c.op !== '-')) continue;
				vus++;
				const ou = `${id} — « ${etape.question} » (${c.a} ${c.op} ${c.b})`;
				expect(c.uniteA, `${ou} : opérande a`).toBe('euro');
				expect(c.uniteB, `${ou} : opérande b`).toBe('euro');
			}
		}
		// L'échantillon contient bien des sommes et des différences d'argent.
		expect(vus).toBeGreaterThan(20);
	});

	/* Multiplication et division : l'unité CHANGE par nature, et une seule règle se
	   justifie. Un montant ne s'obtient jamais en multipliant deux montants (des €² n'ont
	   pas de sens) ni en divisant un montant par un montant (le résultat serait un
	   nombre) : un résultat en euros vient donc d'un montant et d'un SCALAIRE. Donc
	   EXACTEMENT un opérande déclaré en euros — zéro serait un oubli, deux serait le
	   « 3,00 × 3,20 » que le contrat par étape produisait. */
	it('calcul × ou ÷ en euros : EXACTEMENT un opérande déclaré en euros', () => {
		let vus = 0;
		for (const { id, ex } of ARGENT) {
			for (const etape of ex.etapes) {
				const c = etape.calcul;
				if (etape.unite !== 'euro' || !c || (c.op !== 'x' && c.op !== ':')) continue;
				vus++;
				const euros = [c.uniteA, c.uniteB].filter((u) => u === 'euro').length;
				expect(
					euros,
					`${id} — « ${etape.question} » (${c.a} ${c.op} ${c.b}) : a=${c.uniteA}, b=${c.uniteB}`,
				).toBe(1);
			}
		}
		expect(vus).toBeGreaterThan(10);
	});
});

describe('#542 critère 1 — énoncé et réponse révélée s’écrivent de la même façon', () => {
	it('toute réponse révélée d’un problème d’argent s’écrit « 6 » ou « 7,50 »', () => {
		for (const { id, ex } of ARGENT) {
			for (const etape of ex.etapes) {
				if (nonMonetaire(etape.question)) continue;
				const texte = attenduEtapeTexte(etape.answer, etape.unite);
				expect(texte, `${id} : « ${etape.question} » → « ${texte} »`).toMatch(MONTANT_EURO);
			}
		}
	});

	/* LE bug de #542, mesuré sur les données réelles : un montant dont les centimes
	   finissent par zéro (4,50 €, stocké 4.5) doit garder son zéro. Le filtre garantit
	   que ces cas existent, sinon l'assertion ne prouverait rien. */
	it('un montant à centimes finissant par zéro garde son zéro (4,50, pas 4,5)', () => {
		const cas = ARGENT.flatMap(({ id, ex }) =>
			ex.etapes
				.filter((e) => !Number.isInteger(e.answer) && Math.round(e.answer * 100) % 10 === 0)
				.map((e) => ({ id, e })),
		);
		expect(cas.length).toBeGreaterThan(5);
		for (const { id, e } of cas) {
			const texte = attenduEtapeTexte(e.answer, e.unite);
			expect(texte, `${id} : ${e.answer}`).toMatch(/^\d+,\d0$/);
		}
	});

	/* Cohérence de graphie, le cœur de l'issue : la case révélée prolonge l'énoncé. Les
	   montants de l'énoncé et la réponse révélée doivent employer le MÊME jeu de deux
	   écritures ; une réponse à une seule décimale à côté d'un énoncé à deux est
	   précisément ce que l'enfant lit aujourd'hui. */
	it('la réponse révélée emploie la même graphie que les montants de son énoncé', () => {
		for (const { id, ex } of ARGENT) {
			for (const montant of montantsEuro(ex.enonce)) {
				expect(montant, `${id} (énoncé)`).toMatch(MONTANT_EURO);
			}
			for (const etape of ex.etapes) {
				if (nonMonetaire(etape.question)) continue;
				expect(
					attenduEtapeTexte(etape.answer, etape.unite),
					`${id} (réponse) — énoncé : ${ex.enonce}`,
				).toMatch(MONTANT_EURO);
			}
		}
	});

	it('la réponse révélée d’un problème d’argent reste acceptée si l’enfant la recopie', () => {
		for (const { id, ex } of ARGENT) {
			for (const etape of ex.etapes) {
				expect(
					etatEtape(attenduEtapeTexte(etape.answer, etape.unite), etape.answer),
					`${id} : « ${etape.question} »`,
				).toBe('juste');
			}
		}
	});
});

describe('#542 critère 6 — les problèmes hors argent sont écrits comme avant', () => {
	it('la réponse révélée d’une sous-question hors argent est inchangée', () => {
		for (const { id, ex } of HORS_ARGENT) {
			for (const etape of ex.etapes) {
				expect(attenduEtapeTexte(etape.answer, etape.unite), `${id} : « ${etape.question} »`).toBe(
					String(etape.answer).replace('.', ','),
				);
			}
		}
	});

	it('une mesure au dixième conserve son unique décimale', () => {
		const dixiemes = HORS_ARGENT.flatMap(({ id, ex }) =>
			ex.etapes
				.filter((e) => !Number.isInteger(e.answer) && Math.round(e.answer * 10) === e.answer * 10)
				.map((e) => ({ id, e })),
		);
		expect(dixiemes.length).toBeGreaterThan(5);
		for (const { id, e } of dixiemes) {
			expect(attenduEtapeTexte(e.answer, e.unite), `${id} : ${e.answer}`).toMatch(/^\d+,\d$/);
		}
	});
});

/* ================================================================== */
/* 4. La CASE RÉVÉLÉE et la marque de correction (critère 1)            */
/* ================================================================== */

/** Un problème d'argent à une sous-question, monté dans un DOM jetable. */
function monter(etapes: ProblemeEtape[]): HTMLElement {
	const q: ProbQuestion = {
		enonce: 'Léa achète un livre à 2,25 € et un cahier à 2,25 €.',
		etapes,
		parle: 'peu importe',
	};
	const root = document.createElement('div');
	root.innerHTML = renderProblemeBoardHTML(q).balisage;
	return root;
}

/** Texte de la solution affichée à côté de la case `i`, et son `aria-label`. */
function marque(root: HTMLElement, i = 0): { sol: string; aria: string } {
	const mark = root.querySelector(`.prob-mark[data-for="${i}"]`);
	return {
		sol: mark?.querySelector('.sol')?.textContent ?? '',
		aria: mark?.getAttribute('aria-label') ?? '',
	};
}

describe('#542 critère 1 — la case révélée d’un problème d’argent', () => {
	const ETAPE_ARGENT: ProblemeEtape = {
		question: 'Combien Léa paie-t-elle en tout ?',
		answer: 4.5,
		unite: 'euro',
	};

	it('« Je ne sais pas, montre-moi » affiche « → 4,50 » à côté de la case', () => {
		const root = monter([ETAPE_ARGENT]);
		revelerEtapesProbleme(root, [ETAPE_ARGENT]);
		const { sol, aria } = marque(root);
		expect(sol).toContain('4,50');
		expect(sol).not.toMatch(UNE_DECIMALE); // jamais « → 4,5 »
		// Le glyphe « → » n'est pas vocalisé : l'annonce doit porter le montant COMPLET.
		expect(aria).toContain('4,50');
		expect(aria).not.toMatch(UNE_DECIMALE);
	});

	it('la correction d’une case ratée affiche et annonce « 4,50 »', () => {
		const root = monter([ETAPE_ARGENT]);
		const inp = root.querySelector<HTMLInputElement>('.prob-input')!;
		inp.value = '4';
		const toutJuste = corrigerEtapesProbleme(root, [ETAPE_ARGENT]);
		expect(toutJuste).toBe(false);
		const { sol, aria } = marque(root);
		expect(sol).toContain('4,50');
		expect(sol).not.toMatch(UNE_DECIMALE);
		expect(aria).toContain('4,50');
		expect(aria).not.toMatch(UNE_DECIMALE);
	});

	it('un montant entier révélé s’écrit « 6 » (pas « 6,00 »)', () => {
		const etape: ProblemeEtape = { question: 'Combien paie-t-elle ?', answer: 6, unite: 'euro' };
		const root = monter([etape]);
		revelerEtapesProbleme(root, [etape]);
		expect(marque(root).sol).not.toContain(',');
		expect(marque(root).sol).toContain('6');
	});

	/* Critère 6 dans le DOM : la même mécanique, sur une mesure, ne doit rien ajouter. */
	it('une sous-question de MESURE révèle « → 3,5 » (aucune décimale ajoutée)', () => {
		const etape: ProblemeEtape = { question: 'Quelle longueur en tout ?', answer: 3.5 };
		const root = monter([etape]);
		revelerEtapesProbleme(root, [etape]);
		expect(marque(root).sol).toContain('3,5');
		expect(marque(root).sol).not.toContain('3,50');
	});

	/* L'enfant qui écrit « 4,5 » a JUSTE : la graphie de la solution ne change pas la
	   correction. Sans ça, corriger le formatage aurait transformé une bonne réponse en
	   faute — le pire des effets de bord possibles. */
	it('l’enfant qui écrit « 4,5 » sur une réponse à 4,50 € reste juste', () => {
		const root = monter([ETAPE_ARGENT]);
		root.querySelector<HTMLInputElement>('.prob-input')!.value = '4,5';
		expect(corrigerEtapesProbleme(root, [ETAPE_ARGENT])).toBe(true);
	});
});

/* ================================================================== */
/* 5. L'étayage (« 4,50 + 2,25 = 6,75 »)                               */
/* ================================================================== */
describe('#542 — l’étayage d’un problème d’argent écrit ses montants en entier', () => {
	it('le calcul déroulé s’écrit « 4,50 + 2,25 = 6,75 »', () => {
		const etapes: ProblemeEtape[] = [
			{
				question: 'Combien paie-t-elle en tout ?',
				answer: 6.75,
				calcul: { op: '+', a: 4.5, b: 2.25, uniteA: 'euro', uniteB: 'euro' },
				unite: 'euro',
			},
		];
		const deroule = derouleProbleme({ enonce: 'Léa achète deux livres.', etapes });
		expect(deroule.pas.some((p) => p.phrase.includes('4,50 + 2,25 = 6,75'))).toBe(true);
		// Aucun montant tronqué dans TOUT le déroulé (phrases et cases remplies).
		for (const pas of deroule.pas) {
			expect(pas.phrase).not.toMatch(UNE_DECIMALE);
			for (const e of pas.ecritures ?? []) expect(e.texte).not.toMatch(UNE_DECIMALE);
		}
	});

	it('la case remplie par l’étayage porte le montant complet (« 4,50 »)', () => {
		const etapes: ProblemeEtape[] = [
			{
				question: 'Combien lui reste-t-il ?',
				answer: 4.5,
				calcul: { op: '-', a: 6.75, b: 2.25, uniteA: 'euro', uniteB: 'euro' },
				unite: 'euro',
			},
		];
		const ecritures = derouleProbleme({ enonce: 'Léa avait 6,75 €.', etapes }).pas.flatMap(
			(p) => p.ecritures ?? [],
		);
		expect(ecritures.map((e) => e.texte)).toContain('4,50');
	});

	/* Critère 6 : le même moteur, sur une mesure, garde « 3,5 + 2,4 = 5,9 ». */
	it('un problème de MESURE garde ses dixièmes (« 3,5 + 2,4 = 5,9 »)', () => {
		const etapes: ProblemeEtape[] = [
			{
				question: 'Quelle est la longueur totale ?',
				answer: 5.9,
				calcul: { op: '+', a: 3.5, b: 2.4 },
			},
		];
		const deroule = derouleProbleme({ enonce: 'Un ruban de 3,5 m et un de 2,4 m.', etapes });
		expect(deroule.pas.some((p) => p.phrase.includes('3,5 + 2,4 = 5,9'))).toBe(true);
	});

	/* LA raison pour laquelle l'unité se déclare par OPÉRANDE et non par étape : une
	   multiplication dont le RÉSULTAT est en euros mélange une quantité et un prix
	   unitaire (« 3 stylos à 3,20 € »). Écrire la quantité au format monétaire donnerait
	   « 3,00 × 3,20 », qui ne veut rien dire — et « 3 stylos » n'est pas « 3,00 stylos ».
	   Invisible avec des quantités entières (`formatEuros(3)` vaut « 3 ») ; faux dès la
	   première quantité décimale. Le test le dit sur les deux bouts : le prix et le
	   résultat gagnent leurs centimes, la quantité n'en gagne aucun. */
	it('multiplication : le PRIX est en euros, la QUANTITÉ ne l’est pas (« 3 × 3,20 = 9,60 »)', () => {
		const etapes: ProblemeEtape[] = [
			{
				question: 'Combien paie-t-il en tout ?',
				answer: 9.6,
				calcul: { op: 'x', a: 3, b: 3.2, uniteB: 'euro' },
				unite: 'euro',
			},
		];
		const deroule = derouleProbleme({ enonce: 'Tom achète 3 stylos à 3,20 € chacun.', etapes });
		const phrases = deroule.pas.map((p) => p.phrase).join(' | ');
		expect(phrases).toContain('3 × 3,20 = 9,60');
		// La quantité n'est pas devenue un montant.
		expect(phrases).not.toContain('3,00');
		// Et aucun montant n'est tronqué au passage.
		expect(phrases).not.toMatch(UNE_DECIMALE);
	});

	/* Chaînage d'un problème à deux étapes : le résultat repris se nomme dans la phrase.
	   Il doit s'y écrire comme dans la case, sinon l'enfant ne reconnaît pas son nombre. */
	it('le résultat repris d’une étape à l’autre garde sa graphie monétaire', () => {
		const etapes: ProblemeEtape[] = [
			{
				question: 'Combien coûtent les 2 livres ?',
				answer: 4.5,
				calcul: { op: 'x', a: 2, b: 2.25, uniteB: 'euro' },
				unite: 'euro',
			},
			{
				question: 'Combien lui rend-on ?',
				answer: 5.5,
				calcul: { op: '-', a: 10, b: 4.5, deB: 0, uniteA: 'euro', uniteB: 'euro' },
				unite: 'euro',
			},
		];
		const deroule = derouleProbleme({ enonce: 'Léa paie avec un billet de 10 €.', etapes });
		const phrases = deroule.pas.map((p) => p.phrase).join(' | ');
		expect(phrases).toContain('4,50');
		expect(phrases).not.toMatch(UNE_DECIMALE);
	});

	/* Le même contrôle sur les VRAIS problèmes du catalogue, et par le résultat plutôt que
	   par la structure : aucun nombre du déroulé d'un problème d'argent ne s'écrit avec une
	   seule décimale. C'est la même exigence que les invariants d'opérandes plus haut, prise
	   par l'autre bout — elle tient quelle que soit l'opération, y compris celles que ces
	   invariants ne contraignent pas, et elle survivrait à un changement de modèle. Les
	   intitulés de sous-question d'argent ne portent que des entiers (« les 3 livres »),
	   donc une seule décimale dans la phrase ne peut venir que d'un montant tronqué. */
	it('sur les problèmes d’argent du catalogue : aucun montant tronqué dans le déroulé', () => {
		let derouies = 0;
		for (const { id, ex } of ARGENT) {
			const deroule = derouleProbleme({ enonce: ex.enonce, etapes: ex.etapes });
			if (!deroule.pas.length) continue;
			derouies++;
			for (const pas of deroule.pas) {
				expect(pas.phrase, `${id} : « ${pas.phrase} »`).not.toMatch(UNE_DECIMALE);
				for (const e of pas.ecritures ?? []) {
					expect(e.texte, `${id} : case « ${e.texte} »`).not.toMatch(UNE_DECIMALE);
				}
			}
		}
		expect(derouies).toBeGreaterThan(20);
	});
});

/* ================================================================== */
/* 6. Le repli fiche/bilan du catalogue                                */
/* ================================================================== */
describe('#542 — le repli fiche d’un problème d’argent garde ses centimes', () => {
	/** Items de repli tirés des leçons de problèmes (fiche / bilan). */
	function itemsProblemes(): { id: string; text: string; answer: string }[] {
		const out: { id: string; text: string; answer: string }[] = [];
		for (const lecon of getAllLessons()) {
			for (const level of lecon.levels) {
				withSeed(SEED, () => {
					for (let i = 0; i < 40; i++) {
						const ex = lecon.exerciseType.generate({ level });
						if (ex.type !== 'probleme') continue;
						const item = genLessonItem(lecon, level);
						out.push({ id: `${lecon.id}/${level}`, text: item.text, answer: String(item.answer) });
					}
				});
			}
		}
		return out;
	}

	const ITEMS = itemsProblemes();
	const ITEMS_ARGENT = ITEMS.filter((i) => i.text.includes('€'));

	it('l’échantillon contient des replis de problèmes d’argent', () => {
		expect(ITEMS_ARGENT.length).toBeGreaterThan(10);
	});

	it('la réponse du repli s’écrit « 6 » ou « 7,50 »', () => {
		for (const item of ITEMS_ARGENT) {
			expect(item.answer, `${item.id} : ${item.text}`).toMatch(MONTANT_EURO);
		}
	});

	it('aucune réponse de repli n’emploie le point décimal', () => {
		for (const item of ITEMS) expect(item.answer, item.id).not.toContain('.');
	});

	/* Non-régression : la fiche compare NUMÉRIQUEMENT (checkItemAnswer). Un enfant qui
	   écrit « 4,5 » là où la fiche stocke « 4,50 » doit rester juste — sans quoi corriger
	   un affichage aurait transformé de bonnes réponses en fautes. */
	it('l’enfant qui écrit « 4,5 » là où la fiche stocke « 4,50 » reste juste', () => {
		const ecrituresDifferentes: string[] = [];
		for (const item of ITEMS_ARGENT) {
			const valeur = Number(item.answer.replace(',', '.'));
			const court = String(valeur).replace('.', ',');
			expect(
				checkItemAnswer({ text: item.text, answer: item.answer, kind: 'num' }, court),
				`${item.id} : « ${court} » vs « ${item.answer} »`,
			).toBe(true);
			if (court !== item.answer) ecrituresDifferentes.push(`${court} ≠ ${item.answer}`);
		}
		// Au moins un cas où la saisie courte DIFFÈRE de la réponse stockée, sinon la
		// tolérance n'est pas éprouvée (c'est le cas aujourd'hui : la fiche stocke déjà
		// la forme courte « 3,3 », ce que #542 corrige en « 3,30 »).
		expect(
			ecrituresDifferentes.length,
			'aucun cas « 4,5 » vs « 4,50 » dans le repli',
		).toBeGreaterThan(0);
	});
});
