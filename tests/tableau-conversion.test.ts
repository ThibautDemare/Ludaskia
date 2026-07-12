/* ============================================================
   Mode « tableau de conversion » (#394) — logique PURE de génération (sans DOM).
   Vérifie la disposition des colonnes (empan variable, ordre grande→petite stable),
   les chiffres attendus par case (reconstruction : relus dans l'unité cible ils
   redonnent la réponse), la colonne de tête à 1-2 chiffres, le marquage des colonnes
   de transit, l'INVARIANT « zéro-de-transit ⊕ virgule jamais ensemble », et l'exclusion
   des durées. Itérations bornées. Le rendu/la correction cellule par cellule vivent dans
   le runner (ui/lecon-tableau.ts) et sa spec e2e.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { MESURE_LESSONS } from '../src/data/maths/mesures';
import { checkAnswer } from '../src/core/exercise';
import type { Exercise } from '../src/core/exercise';
import type { SchoolLevel } from '../src/core/catalog';

type Tableau = Extract<Exercise, { type: 'tableauConversion' }>;

const FAMILLES = ['mes-longueurs', 'mes-masses', 'mes-contenances'] as const;
const NIVEAUX = ['ce2', 'cm1'] as const;
const type = (id: string) => MESURE_LESSONS.find((l) => l.id === id)!.exerciseType;

// Échelles décimales (miroir des constantes de mesures.ts, non exportées) : sert à vérifier
// que l'ordre des colonnes suit toujours la même chaîne grande→petite.
const ECHELLES: Record<string, string[]> = {
	'mes-longueurs': ['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'],
	'mes-masses': ['kg', 'hg', 'dag', 'g', 'dg', 'cg', 'mg'],
	'mes-contenances': ['L', 'dL', 'cL', 'mL'],
};

function genTab(id: string, level: SchoolLevel, n: number): Tableau[] {
	const t = type(id);
	const out: Tableau[] = [];
	for (let i = 0; i < n; i++) {
		const ex = t.generate({ mode: 'tableau', level });
		if (ex.type === 'tableauConversion') out.push(ex);
	}
	return out;
}

describe('#394 tableau — structure des colonnes', () => {
	it('colonne de tête (la 1re) à 1-2 chiffres, les autres à 1 chiffre 0-9', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 200)) {
					expect(ex.colonnes.length).toBeGreaterThanOrEqual(2);
					ex.colonnes.forEach((col, i) => {
						expect(/^[0-9]+$/.test(col.chiffres)).toBe(true);
						if (i === 0) {
							// La tête (la seule à pouvoir porter 2 chiffres) est toujours en position 0.
							expect(col.chiffres.length).toBeGreaterThanOrEqual(1);
							expect(col.chiffres.length).toBeLessThanOrEqual(2);
						} else {
							expect(col.chiffres.length).toBe(1);
						}
						expect(col.nom.length).toBeGreaterThan(0); // nom complet visible (a11y dys)
					});
				}
			}
		}
	});

	it('colonnes ordonnées grande→petite, contiguës sur l’échelle de la famille', () => {
		for (const id of FAMILLES) {
			const ladder = ECHELLES[id];
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 200)) {
					const idx = ex.colonnes.map((c) => ladder.indexOf(c.unite));
					expect(idx.every((v) => v >= 0)).toBe(true); // toutes connues de l’échelle
					// Strictement croissant et sans trou (tranche contiguë).
					for (let i = 1; i < idx.length; i++) expect(idx[i]).toBe(idx[i - 1] + 1);
				}
			}
		}
	});
});

describe('#394 tableau — chiffres corrects (reconstruction)', () => {
	// Les chiffres joints valent la quantité dans la PETITE unité ; relus depuis la colonne
	// cible (`answerUnit`, avec sa valeur de rang), ils redonnent exactement `answer`.
	it('les chiffres des colonnes redonnent la réponse dans l’unité cible', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 300)) {
					const n = ex.colonnes.length;
					const joint = Number(ex.colonnes.map((c) => c.chiffres).join(''));
					const iCible = ex.colonnes.findIndex((c) => c.unite === ex.answerUnit);
					expect(iCible).toBeGreaterThanOrEqual(0);
					// Rang de la colonne cible en petites unités = 10^(distance à la petite unité).
					const rang = 10 ** (n - 1 - iCible);
					const attendu = joint / rang;
					expect(Number(ex.answer.replace(',', '.'))).toBeCloseTo(attendu, 6);
				}
			}
		}
	});

	it('`answerUnit` est renseigné, présent dans les colonnes et cohérent avec l’énoncé', () => {
		for (const ex of genTab('mes-longueurs', 'cm1', 200)) {
			expect(ex.answerUnit).not.toBe('');
			expect(ex.colonnes.some((c) => c.unite === ex.answerUnit)).toBe(true);
			// L’unité cible est bien celle collée au champ « @ » de l’énoncé partagé.
			expect(ex.question).toContain(`@ ${ex.answerUnit}`);
		}
	});
});

describe('#394 tableau — colonne de tête à 2 chiffres (option a)', () => {
	it('CM1 longueurs (maxBig 20) et CE2 contenances (maxBig 12) atteignent une tête à 2 chiffres', () => {
		const longueurs = genTab('mes-longueurs', 'cm1', 400);
		const contenances = genTab('mes-contenances', 'ce2', 400);
		expect(longueurs.some((ex) => ex.colonnes[0].chiffres.length === 2)).toBe(true);
		expect(contenances.some((ex) => ex.colonnes[0].chiffres.length === 2)).toBe(true);
	});
});

describe('#394 tableau — colonnes de transit', () => {
	it('longueurs km↔m : hm et dam en transit ; tête et cible jamais en transit', () => {
		const kmM = genTab('mes-longueurs', 'cm1', 400).filter((ex) =>
			ex.colonnes.some((c) => c.unite === 'km'),
		);
		expect(kmM.length).toBeGreaterThan(0);
		let vuTransit = false;
		for (const ex of kmM) {
			const cible = ex.answerUnit;
			for (const c of ex.colonnes) {
				if (c.transit) {
					vuTransit = true;
					expect(['hm', 'dam']).toContain(c.unite); // seules hm/dam sont non étudiées ici
					expect(c.unite).not.toBe(cible); // une colonne de transit n’est jamais la cible
				}
			}
			expect(ex.colonnes[0].transit).toBe(false); // la tête (unité étudiée) n’est pas démotée
		}
		expect(vuTransit).toBe(true);
	});

	it('masses : toujours au moins une colonne de transit (hg/dag ou dg/cg)', () => {
		for (const level of NIVEAUX) {
			for (const ex of genTab('mes-masses', level, 200)) {
				expect(ex.colonnes.some((c) => c.transit)).toBe(true);
			}
		}
	});

	it('contenances : AUCUNE colonne de transit (cas propre, dL/cL déjà étudiés)', () => {
		for (const level of NIVEAUX) {
			for (const ex of genTab('mes-contenances', level, 200)) {
				expect(ex.colonnes.every((c) => !c.transit)).toBe(true);
			}
		}
	});
});

describe('#394 tableau — invariant zéro-de-transit ⊕ virgule', () => {
	it('jamais une colonne de transit ET une virgule dans le même exercice', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 400)) {
					const aTransit = ex.colonnes.some((c) => c.transit);
					const aVirgule = ex.virguleApres !== undefined;
					expect(aTransit && aVirgule).toBe(false);
				}
			}
		}
	});

	it('virgule ⟺ réponse décimale, posée juste après la colonne cible', () => {
		for (const id of FAMILLES) {
			for (const ex of genTab(id, 'cm1', 400)) {
				const decimale = ex.answer.includes(',');
				expect(ex.virguleApres !== undefined).toBe(decimale);
				if (ex.virguleApres !== undefined) {
					expect(ex.colonnes[ex.virguleApres].unite).toBe(ex.answerUnit);
				}
			}
		}
	});

	it('CE2 : entier partout → jamais de virgule', () => {
		for (const id of FAMILLES) {
			for (const ex of genTab(id, 'ce2', 300)) {
				expect(ex.virguleApres).toBeUndefined();
				expect(ex.answer).not.toContain(',');
			}
		}
	});
});

describe('#394 tableau — modes exposés', () => {
	it('longueurs / masses / contenances proposent saisie + tableau ; durées mono-mode', () => {
		for (const id of FAMILLES) {
			const modes = type(id).modes?.map((m) => m.id) ?? [];
			expect(modes).toContain('saisie');
			expect(modes).toContain('tableau');
			expect(type(id).modes?.find((m) => m.recommended)?.id).toBe('saisie');
		}
		// Durées : pas d’échelle décimale → pas de mode tableau (reste mono-mode).
		const durees = type('mes-durees');
		expect(durees.modes).toBeUndefined();
		// Et un forçage du mode tableau retombe sur la saisie texte (jamais un tableau).
		for (let i = 0; i < 50; i++) {
			expect(durees.generate({ mode: 'tableau', level: 'cm1' }).type).toBe('text');
		}
	});

	it('checkAnswer renvoie false pour un tableau (corrigé cellule par cellule par le runner)', () => {
		const ex = genTab('mes-longueurs', 'cm1', 1)[0];
		expect(checkAnswer(ex, ex.answer)).toBe(false);
	});

	it('le `check` du type renvoie aussi false pour un tableau (garde-fou, jamais de correction générique)', () => {
		const t = type('mes-longueurs');
		const ex = genTab('mes-longueurs', 'cm1', 1)[0];
		// Même avec la « bonne » valeur cible, le check générique ne doit pas la valider.
		expect(t.check(ex, ex.answer)).toBe(false);
	});
});
