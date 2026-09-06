/* ============================================================
   Étagère de jeux (#661) — le catalogue des jeux (moitié LOGIQUE des critères
   14, 16 et 3 ; la moitié visible est du ressort des specs Playwright).

   Ce qui se teste ici : le Motus DÉCLARE une compétence et le 2048 n'en déclare
   AUCUNE (« l'espace encadrant ne peut pas affirmer qu'il travaille quelque
   chose »), le 2048 ignore le niveau scolaire, et aucun libellé côté enfant ne
   trahit la compétence travaillée — l'étagère est une liste de jeux, pas un
   sommaire de matières.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { JEUX, jeuParId, jeuxDisponibles } from '../src/core/jeux/catalogue';
import { LEVEL_ORDER } from '../src/core/levels';

describe('catalogue des jeux — forme générale', () => {
	it('embarque les deux jeux du lot 1', () => {
		expect(jeuParId('motus')).toBeDefined();
		expect(jeuParId('2048')).toBeDefined();
	});

	it('donne à chaque jeu un id unique, un libellé et un type', () => {
		expect(new Set(JEUX.map((j) => j.id)).size).toBe(JEUX.length);
		for (const j of JEUX) {
			expect(j.id).not.toBe('');
			expect(j.label.trim()).not.toBe('');
			expect(['C', 'R']).toContain(j.type);
		}
	});

	it('ne connaît pas d’id inventé', () => {
		expect(jeuParId('jeu-qui-n-existe-pas')).toBeUndefined();
	});
});

describe('compétence déclarée (critères 14 et 16)', () => {
	it('le Motus déclare une compétence', () => {
		expect(jeuParId('motus')?.competence).toBeTruthy();
	});

	it('le 2048 n’en déclare AUCUNE', () => {
		// Cas d'échec du critère 16 : « l'espace encadrant affirme qu'il travaille
		// quelque chose ». Un jeu refuge ne travaille rien, et le dit en ne disant rien.
		expect(jeuParId('2048')?.competence).toBeUndefined();
	});

	it('aucun libellé enfant ne révèle la compétence travaillée (critère 3)', () => {
		/* L'étagère est UNE liste sans étiquette de matière. Un libellé qui contiendrait
		   « orthographe » ou « calcul » transformerait le cadeau en exercice déguisé. */
		for (const j of JEUX) {
			if (j.competence) expect(j.label.toLowerCase()).not.toContain(j.competence.toLowerCase());
			expect(j.label).not.toMatch(
				/orthograph|calcul|conjugais|grammair|vocabulair|lexical|compétence|entra[îi]n/i,
			);
		}
	});
});

describe('disponibilité par niveau scolaire (critère 16)', () => {
	it('le 2048 est proposé à toutes les classes (il ignore le niveau scolaire)', () => {
		for (const niveau of LEVEL_ORDER) {
			expect(jeuxDisponibles(niveau).map((j) => j.id)).toContain('2048');
		}
	});

	it('ne rend que des jeux du catalogue, et jamais un jeu hors de sa classe', () => {
		const parId = new Map(JEUX.map((j) => [j.id, j]));
		for (const niveau of LEVEL_ORDER) {
			for (const j of jeuxDisponibles(niveau)) {
				expect(parId.has(j.id)).toBe(true);
				const levels = parId.get(j.id)?.levels;
				if (levels) expect(levels).toContain(niveau);
			}
		}
	});

	it('n’oublie aucun jeu sans restriction de classe', () => {
		const sansRestriction = JEUX.filter((j) => !j.levels).map((j) => j.id);
		for (const niveau of LEVEL_ORDER) {
			const dispo = jeuxDisponibles(niveau).map((j) => j.id);
			for (const id of sansRestriction) expect(dispo).toContain(id);
		}
	});
});
