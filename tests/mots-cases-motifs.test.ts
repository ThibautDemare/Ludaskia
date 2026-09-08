/* ============================================================
   Mots casés (#664) — les MOTIFS, en données.

   Écrit AVANT l'implémentation. `src/data/jeux/motifs-mots-cases.ts` n'existe
   pas encore : ce fichier est ROUGE À L'IMPORT, et c'est le résultat attendu.

   ── LE CONTRAT QUE CES TESTS FIGENT ─────────────────────────────────────────

   `src/data/jeux/motifs-mots-cases.ts` doit exporter :

     export type TailleMotsCases = 'petite' | 'grande';
     export const TAILLES_MOTS_CASES: readonly TailleMotsCases[];
     export interface MotifMotsCases extends Motif { taille: TailleMotsCases }
     export const MOTIFS_MOTS_CASES: readonly MotifMotsCases[];

   `Motif` vient du moteur générique (`src/core/jeux/grille-mots.ts`). La taille
   est une propriété DU MOTIF et non deux listes séparées : un 5×5 est petit par
   nature, et une seule liste garde `motifsDe` trivial.

   Pourquoi le type de taille vit ICI et pas dans le jeu : `mots-cases.ts`
   importe les motifs, donc l'inverse ferait un cycle. Le jeu peut le
   ré-exporter s'il le veut ; ces tests l'importent depuis les données.

   Critères portés : 5 (des données, au moins six motifs), 6 (aucun emplacement
   isolé), 7 (dix colonnes et dix lignes au plus), 8 (au moins deux emplacements
   de même longueur), plus la condition NÉCESSAIRE du 19 sur la petite grille
   (voir le dernier bloc) et quelques invariants de forme sans lesquels un motif
   n'est pas dessinable.

   Ce que ce fichier NE couvre pas : qu'un motif soit REMPLISSABLE avec le vivier
   du dépôt. Ça ne se lit pas dans la donnée, ça se mesure — c'est
   `mots-cases.test.ts`, par échantillon.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	MOTIFS_MOTS_CASES,
	TAILLES_MOTS_CASES,
	type MotifMotsCases,
} from '../src/data/jeux/motifs-mots-cases';
import { casesDe, croisements } from '../src/core/jeux/grille-mots';

const cle = (ligne: number, colonne: number): string => `${ligne},${colonne}`;

/** Nom lisible dans le message d'échec : sans lui, « expected false to be true »
    ne dit pas QUEL motif est en cause parmi les six. */
const nom = (m: MotifMotsCases): string => `motif ${m.id} (${m.taille})`;

describe('#664 critère 5 — les motifs sont des données, et il y en a au moins six', () => {
	it('en livre six ou plus', () => {
		expect(MOTIFS_MOTS_CASES.length).toBeGreaterThanOrEqual(6);
	});

	it('leur donne à chacun un identifiant unique et non vide', () => {
		// L'id est ce que la sauvegarde stocke pour retrouver la grille en cours
		// (critère 33) : deux motifs homonymes rendraient la restauration ambiguë.
		for (const m of MOTIFS_MOTS_CASES) expect(m.id.trim(), nom(m)).not.toBe('');
		expect(new Set(MOTIFS_MOTS_CASES.map((m) => m.id)).size).toBe(MOTIFS_MOTS_CASES.length);
	});

	it('déclare exactement deux tailles, et sert les deux (critère 13)', () => {
		expect([...TAILLES_MOTS_CASES].sort()).toEqual(['grande', 'petite']);
		for (const t of TAILLES_MOTS_CASES) {
			expect(
				MOTIFS_MOTS_CASES.filter((m) => m.taille === t).length,
				`aucun motif de taille « ${t} » : cette moitié du choix de l'enfant n'existe pas`,
			).toBeGreaterThanOrEqual(1);
		}
	});

	it('n’attribue à aucun motif une taille inconnue', () => {
		for (const m of MOTIFS_MOTS_CASES) expect(TAILLES_MOTS_CASES, nom(m)).toContain(m.taille);
	});
});

describe('#664 — un motif est dessinable', () => {
	it('a des dimensions entières et positives', () => {
		for (const m of MOTIFS_MOTS_CASES) {
			expect(Number.isInteger(m.largeur) && m.largeur > 0, nom(m)).toBe(true);
			expect(Number.isInteger(m.hauteur) && m.hauteur > 0, nom(m)).toBe(true);
		}
	});

	it('garde tous ses emplacements DANS la grille annoncée', () => {
		/* Un emplacement qui déborde ne se voit pas dans la donnée : il se voit à
		   l'écran, en lettres coupées ou en cases fantômes. */
		for (const m of MOTIFS_MOTS_CASES) {
			for (const e of m.emplacements) {
				for (const c of casesDe(e)) {
					expect(
						c.ligne >= 0 && c.ligne < m.hauteur && c.colonne >= 0 && c.colonne < m.largeur,
						`${nom(m)} : la case ${cle(c.ligne, c.colonne)} sort de la grille ${m.largeur}×${m.hauteur}`,
					).toBe(true);
				}
			}
		}
	});

	it('n’a que des emplacements d’au moins deux lettres, horizontaux ou verticaux', () => {
		for (const m of MOTIFS_MOTS_CASES) {
			for (const e of m.emplacements) {
				expect(['h', 'v'], nom(m)).toContain(e.sens);
				expect(Number.isInteger(e.longueur), nom(m)).toBe(true);
				expect(
					e.longueur,
					`${nom(m)} : un emplacement d'une seule case n'est pas un mot`,
				).toBeGreaterThanOrEqual(2);
			}
		}
	});

	it('ne déclare pas deux fois le même emplacement', () => {
		for (const m of MOTIFS_MOTS_CASES) {
			const signatures = m.emplacements.map(
				(e) => `${e.sens}${e.ligne}:${e.colonne}:${e.longueur}`,
			);
			expect(new Set(signatures).size, nom(m)).toBe(signatures.length);
		}
	});

	it('ne fait jamais se RECOUVRIR deux mots de même sens', () => {
		/* Deux horizontaux qui partagent une case ne se croisent pas, ils se
		   marchent dessus : la case appartiendrait à deux mots dans la même
		   direction, et aucune règle ne dirait laquelle des deux lettres afficher.
		   Le moteur n'a pas à arbitrer ça — la donnée ne doit pas le produire. */
		for (const m of MOTIFS_MOTS_CASES) {
			for (const sens of ['h', 'v'] as const) {
				const vues = new Set<string>();
				for (const e of m.emplacements.filter((x) => x.sens === sens)) {
					for (const c of casesDe(e)) {
						const k = cle(c.ligne, c.colonne);
						expect(vues.has(k), `${nom(m)} : la case ${k} est prise deux fois en « ${sens} »`).toBe(
							false,
						);
						vues.add(k);
					}
				}
			}
		}
	});
});

describe('#664 critère 6 — aucun emplacement isolé', () => {
	it('fait croiser chaque emplacement avec au moins un autre', () => {
		/* Cas d'échec littéral : « un emplacement isolé, où le mot se poserait sans
		   aucune contrainte ». Un tel emplacement se remplit au hasard parmi les mots
		   de la bonne longueur : ce n'est plus une déduction, c'est un tirage, et
		   l'enfant n'a aucun moyen de savoir s'il a raison. */
		for (const m of MOTIFS_MOTS_CASES) {
			const croises = new Set<number>();
			for (const c of croisements(m)) {
				croises.add(c.a);
				croises.add(c.b);
			}
			for (let i = 0; i < m.emplacements.length; i++) {
				expect(
					croises.has(i),
					`${nom(m)} : l'emplacement ${i} (${JSON.stringify(m.emplacements[i])}) ne croise rien`,
				).toBe(true);
			}
		}
	});
});

describe('#664 critère 7 — pas plus de dix colonnes ni dix lignes', () => {
	it('tient les deux dimensions sous la barre', () => {
		// « Au-delà, la case tombe sous le seuil de lisibilité d'une lettre sur un
		// téléphone en portrait. » La borne vaut pour les DEUX dimensions : une
		// grille de 6 colonnes sur 14 lignes tient en largeur et se lit quand même
		// mal, parce que la case reste carrée.
		for (const m of MOTIFS_MOTS_CASES) {
			expect(m.largeur, nom(m)).toBeLessThanOrEqual(10);
			expect(m.hauteur, nom(m)).toBeLessThanOrEqual(10);
		}
	});
});

describe('#664 critère 8 — au moins deux emplacements de même longueur', () => {
	it('empêche que la seule longueur suffise à tout placer', () => {
		/* Cas d'échec littéral : « un motif a toutes ses longueurs distinctes, la
		   longueur suffisant alors à tout placer sans regarder une seule lettre ».
		   C'est le socle du critère 10, qui ne veut plus rien dire sans lui : s'il
		   n'existe aucun couple de même longueur, « au moins un couple non
		   échangeable » est faux par vacuité. */
		for (const m of MOTIFS_MOTS_CASES) {
			const parLongueur = new Map<number, number>();
			for (const e of m.emplacements)
				parLongueur.set(e.longueur, (parLongueur.get(e.longueur) ?? 0) + 1);
			expect(
				[...parLongueur.values()].some((n) => n >= 2),
				`${nom(m)} : toutes ses longueurs sont distinctes (${[...parLongueur.keys()].sort((a, b) => a - b).join(', ')})`,
			).toBe(true);
		}
	});
});

describe('#664 — condition nécessaire du critère 19 sur la petite grille', () => {
	it('ne donne jamais plus de huit colonnes à un motif « petite »', () => {
		/* Le critère 19 se mesure au rendu (Playwright) : « sur un écran de 360 px de
		   large, une case de la PETITE grille mesure au moins 44 px ». Mais une part
		   s'en déduit ICI, sans rendu et pour TOUS les motifs — 360 / 44 = 8,18 : au
		   delà de huit colonnes, aucune feuille de style ne peut tenir la borne, même
		   sans marge ni gouttière. Un e2e ne verrait que les motifs qu'il tire.

		   La grande grille, elle, est déjà couverte : 10 colonnes × 24 px = 240 px. */
		for (const m of MOTIFS_MOTS_CASES.filter((x) => x.taille === 'petite')) {
			expect(
				m.largeur,
				`${nom(m)} : ${m.largeur} colonnes × 44 px = ${m.largeur * 44} px, soit plus que les 360 px de l'écran de référence`,
			).toBeLessThanOrEqual(8);
		}
	});

	it('donne bien à la grande grille de quoi être plus grande que la petite', () => {
		// Sinon le « choix » du critère 13 n'en est pas un : deux étiquettes pour la
		// même difficulté. On compare les SURFACES utiles (le nombre de cases à
		// remplir), pas les dimensions : c'est ce que l'enfant ressent.
		const cases = (m: MotifMotsCases): number =>
			new Set(m.emplacements.flatMap((e) => casesDe(e).map((c) => cle(c.ligne, c.colonne)))).size;
		const petites = MOTIFS_MOTS_CASES.filter((m) => m.taille === 'petite').map(cases);
		const grandes = MOTIFS_MOTS_CASES.filter((m) => m.taille === 'grande').map(cases);
		expect(Math.min(...grandes)).toBeGreaterThan(Math.max(...petites));
	});
});
