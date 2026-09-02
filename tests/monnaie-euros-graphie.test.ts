/* ============================================================
   « Je rends la monnaie » — graphie de la réponse STOCKÉE (#542) — logique pure.
   ------------------------------------------------------------
   La leçon rendait un montant au centime en le stockant `String(renduC / 100)`, soit
   « 3.5 ». Deux défauts d'un coup, et le second est plus grave que la notation :
     - la réponse RÉVÉLÉE s'écrivait « 3,5 » sous un énoncé qui dit « 1,50 € » — le défaut
       d'origine de #542, ici sur une leçon qui n'est pas un problème à étapes ;
     - `inputMode` (core/items.ts) n'expose le clavier DÉCIMAL du mobile qu'à une réponse
       PORTANT UNE VIRGULE. Avec un point, l'enfant recevait un pavé de chiffres seuls :
       aucune touche pour écrire sa réponse. La leçon était injouable au doigt à ce niveau,
       pas seulement mal affichée.

   Le niveau CM1 n'est pas surfacé au catalogue (`LessonDef.levels` vaut `['ce2']`) mais le
   moteur calibré le sert derrière `generate({ level: 'cm1' })` : on l'atteint par là, sinon
   la seule branche non triviale de la leçon ne serait gardée par rien.

   Les attendus viennent de la règle du programme (deux décimales dès qu'il y a des
   centimes, aucune sur un montant entier) et du besoin (« une graphie de stockage ne doit
   jamais rendre une réponse fausse »), jamais du générateur. Le calibrage de la leçon
   (billets, rendu = billet − prix) reste dans tests/monnaie.test.ts.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { MONNAIE_LESSONS } from '../src/data/maths/monnaie';
import type { Exercise } from '../src/core/exercise';
import type { SchoolLevel } from '../src/core/catalog';
import { genLessonItem, getLessonById } from '../src/core/catalog';
import { checkItemAnswer, createRenderContext, renderItem } from '../src/core/items';
import { attendueItem } from '../src/core/erreur-representation';
import { parseNombreFr } from '../src/core/nombres';
import { withSeed } from '../src/core/utils';

/** La graphie monétaire du programme : « 15 » ou « 3,50 ». Interdit « 3,5 », « 6,00 »,
    « 3.50 ». C'est celle des ÉNONCÉS depuis toujours, et la réponse doit s'écrire comme
    l'énoncé qu'elle prolonge. */
const MONTANT_EURO = /^[0-9]+(?:,[0-9]{2})?$/;

const TIRAGES = 400;

const typeDe = (id: string) => MONNAIE_LESSONS.find((l) => l.id === id)!.exerciseType;

/** Réponses stockées par un échantillon d'exercices d'une leçon, à un niveau donné. */
function reponses(id: string, level?: SchoolLevel, n = TIRAGES): string[] {
	const t = typeDe(id);
	return Array.from({ length: n }, () => {
		const ex: Exercise = t.generate(level ? { level } : undefined);
		if (!('answer' in ex)) throw new Error(`${id} : exercice sans réponse`);
		return String(ex.answer);
	});
}

/** Le balisage du champ de saisie de la fiche, pour un item réellement tiré. */
function baliserItems(level: SchoolLevel, seed: number, n: number): { a: string; html: string }[] {
	const lecon = getLessonById('mes-monnaie-rendu');
	expect(lecon, 'mes-monnaie-rendu absente du catalogue').toBeDefined();
	return withSeed(seed, () =>
		Array.from({ length: n }, () => {
			const item = genLessonItem(lecon!, level);
			return { a: String(item.answer), html: renderItem(item, createRenderContext()).balisage };
		}),
	);
}

describe('#542 — CM1 : la réponse est stockée dans sa graphie monétaire', () => {
	const REPONSES = reponses('mes-monnaie-rendu', 'cm1');

	it('toute réponse s’écrit « 15 » ou « 3,50 », jamais « 3,5 » ni « 3.5 »', () => {
		for (const a of REPONSES) {
			expect(a, `réponse stockée ${JSON.stringify(a)}`).toMatch(MONTANT_EURO);
			expect(a, `réponse stockée ${JSON.stringify(a)}`).not.toContain('.');
		}
	});

	it('les DEUX formes sortent du tirage (sinon la règle n’est pas éprouvée)', () => {
		// Le tirage est au pas de 5 centimes : les centimes non nuls dominent, mais un prix
		// rond donne un rendu entier.
		expect(REPONSES.some((a) => /^[0-9]+$/.test(a))).toBe(true); // « 15 »
		expect(REPONSES.some((a) => /^[0-9]+,[0-9]{2}$/.test(a))).toBe(true); // « 3,50 »
		// Et LE cas qui faisait perdre le zéro : des centimes multiples de 10.
		expect(REPONSES.some((a) => /,[0-9]0$/.test(a))).toBe(true);
	});

	/* La graphie stockée est aussi celle qu'on RÉVÈLE : journal encadrant, corrigé de fiche
	   et verdict de révision passent tous par `attendueItem`. Le zéro des centièmes doit y
	   survivre — c'est la plainte d'origine de #542, appliquée à cette leçon. */
	it('la réponse RÉVÉLÉE garde ses deux décimales', () => {
		let avecCentimes = 0;
		for (const a of REPONSES) {
			expect(attendueItem({ answer: a }), a).toMatch(MONTANT_EURO);
			if (a.includes(',')) avecCentimes++;
		}
		expect(avecCentimes, 'aucun rendu à centimes dans l’échantillon').toBeGreaterThan(50);
	});

	/* LE versant qui rendait la leçon injouable au doigt : le champ doit proposer un clavier
	   où la virgule EXISTE. Assertion sur le VRAI rendu (`renderItem`, le chemin « math
	   moderne » par lequel cette leçon s'affiche), pas sur le critère interne qui le décide. */
	it('le champ d’un rendu à centimes propose le clavier DÉCIMAL', () => {
		const avecCentimes = baliserItems('cm1', 542096, 80).filter((x) => x.a.includes(','));
		expect(avecCentimes.length, 'aucun rendu à centimes tiré').toBeGreaterThan(10);
		for (const { a, html } of avecCentimes) {
			expect(html, a).toContain('inputmode="decimal"');
			expect(html, a).not.toContain('inputmode="numeric"');
		}
	});

	/* Même invariant que celui qu'on vient de fermer sur `etatEtape` : ce qui est PROPOSÉ à
	   la recopie doit être accepté par la correction, et l'écriture courte aussi. Une
	   graphie de stockage ne doit jamais rendre une réponse fausse. */
	it('la réponse affichée ET l’écriture courte sont toutes deux acceptées', () => {
		for (const { a, html } of baliserItems('cm1', 542097, 60)) {
			const item = { text: 'q @', answer: a, kind: 'num' as const };
			const valeur = parseNombreFr(a);
			for (const saisie of [a, a.replace(',', '.'), String(valeur).replace('.', ',')]) {
				expect(checkItemAnswer(item, saisie), `${a} ← ${JSON.stringify(saisie)}`).toBe(true);
			}
			// La tolérance ne déborde pas : 5 centimes de plus reste faux.
			expect(checkItemAnswer(item, String(valeur + 0.05)), a).toBe(false);
			// Le champ porte bien la réponse stockée (le repère de correction et d'e2e).
			expect(html, a).toContain(`data-answer="${a}"`);
		}
	});
});

/* Le critère NÉGATIF du correctif : le CE2 est le niveau que les enfants jouent
   aujourd'hui, et il ne doit RIEN gagner. Aucune virgule dans une réponse (ni « 6,00 »,
   ni un rendu décimal), et le clavier reste celui des chiffres. */
describe('#542 — CE2 inchangé : aucune décimale gagnée', () => {
	for (const [id, level] of [
		['mes-monnaie-rendu', 'ce2'],
		['mes-monnaie-calcul', undefined],
	] as const) {
		it(`${id} : réponses entières, sans virgule ni point`, () => {
			for (const a of reponses(id, level)) {
				expect(a, a).toMatch(/^[0-9]+$/);
				expect(Number.isInteger(parseNombreFr(a)), a).toBe(true);
			}
		});
	}

	it('mes-monnaie-rendu au CE2 : le champ garde le clavier des chiffres', () => {
		for (const { a, html } of baliserItems('ce2', 542098, 40)) {
			expect(html, a).toContain('inputmode="numeric"');
			expect(html, a).not.toContain('inputmode="decimal"');
		}
	});
});
