import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ============================================================
   Gate STATIQUE de l'annonce des récompenses (#659, critère 4).

   Un écran de fin qui n'annonce rien ne casse RIEN de visible : les compteurs
   avancent, la CI est verte, et l'enfant découvre son trophée des semaines plus tard
   dans la galerie. Le défaut de la révision espacée n'a d'ailleurs été trouvé
   qu'incidemment, en cherchant autre chose. D'où un contrôle de CÂBLAGE, que ni les
   tests de calcul (tests/recompenses-fin.test.ts) ni la spec Playwright ne peuvent
   faire : le premier ne sait pas qui l'appelle, la seconde ne voit pas par quel
   chemin l'annonce est arrivée.

   Lu comme du TEXTE (pas de DOM, quelques millisecondes).

   CE QU'IL NE PROUVE PAS : que l'annonce tombe au bon MOMENT (en fin de session et
   pas entre deux items, critère 6) ni qu'elle s'affiche vraiment — c'est l'objet de
   la spec `e2e/revision*.spec.ts`.
   ============================================================ */

const lire = (chemin: string) => readFileSync(chemin, 'utf8');

// Le calcul factorisé : trophées nouvellement débloqués + palier(s) de niveau franchis.
const IMPORTE_MODULE = /from\s*'\.\.\/core\/recompenses-fin'/;
// La copie qu'on ne veut plus voir se refaire à la main dans un écran de fin.
const RECALCULE_SEUL: [string, RegExp][] = [
	['evaluateTrophies', /\bevaluateTrophies\b/],
	['recompensesEntre', /\brecompensesEntre\b/],
];

/* Assertions sur des BOOLÉENS et non sur le texte du fichier : un `toMatch` en échec
   recracherait le millier de lignes du module dans le rapport. */
const contient = (fichier: string, motif: RegExp) => motif.test(lire(fichier));

const passeParLeModule = (fichier: string) => {
	expect({ fichier, importeRecompensesFin: contient(fichier, IMPORTE_MODULE) }).toEqual({
		fichier,
		importeRecompensesFin: true,
	});
	for (const [nom, motif] of RECALCULE_SEUL) {
		expect({ fichier, recalculeSeul: nom, present: contient(fichier, motif) }).toEqual({
			fichier,
			recalculeSeul: nom,
			present: false,
		});
	}
};

describe('#659 — les écrans de fin annoncent, et par le même chemin (critère 4)', () => {
	it('critères 1-2 : la révision espacée annonce ses récompenses', () => {
		// `announceRewards` (ui/effects.ts) est LA porte commune : modale de niveau puis
		// célébration des autres gains. Aujourd'hui, revision.ts ne l'appelle jamais.
		const importe = contient(
			'src/ui/revision.ts',
			/import\s*\{[^}]*\bannounceRewards\b[^}]*\}\s*from\s*'\.\/effects'/,
		);
		expect({ fichier: 'src/ui/revision.ts', importeAnnounceRewards: importe }).toEqual({
			fichier: 'src/ui/revision.ts',
			importeAnnounceRewards: true,
		});
	});

	it('la révision passe par le calcul factorisé, sans en refaire une troisième copie', () => {
		passeParLeModule('src/ui/revision.ts');
	});

	it("la copie privée d'ortho-runner est remplacée par le module partagé", () => {
		passeParLeModule('src/ui/ortho-runner.ts');
	});

	it('le module factorisé reste de la logique PURE (aucun import de src/ui)', () => {
		// Séparation core/ui : un import de rendu ici le rendrait intestable sans DOM et
		// ramènerait la décision d'affichage dans le calcul.
		expect(contient('src/core/recompenses-fin.ts', /from\s*'\.\.\/ui\//)).toBe(false);
	});
});
