/* ============================================================
   Mots croisés (#665) — les MOTIFS, en données (critères 14 et 15).

   Écrit AVANT l'implémentation. `src/data/jeux/motifs-mots-croises.ts` n'existe
   pas encore : ce fichier est ROUGE À L'IMPORT, et c'est le résultat attendu.

   ── LE CONTRAT QUE CES TESTS FIGENT ─────────────────────────────────────────

     // src/data/jeux/motifs-mots-croises.ts
     export const MOTIFS_MOTS_CROISES: readonly Motif[];

   `Motif` vient du moteur générique (`src/core/jeux/grille-mots.ts`), posé en
   #664 : `{ id, largeur, hauteur, emplacements }`. Le type peut être ÉTENDU (un
   motif qui porterait un nom d'affichage reste un `Motif`), il ne peut pas être
   remplacé — c'est ce type que `remplirMotif` et `croisements` savent lire, et
   c'est la seule raison pour laquelle ce lot n'a pas de solveur à écrire.

   **Pas de taille jouable ici**, contrairement aux mots casés : l'issue #665 ne
   demande aucun choix de format à l'enfant (rien dans les critères 14, 29 ou 30
   n'en parle), et sa seule porte de sortie est « Nouvelle grille ». Une
   propriété `taille` serait une fonctionnalité inventée, avec sa clé de
   stockage — que le critère 43 refuse.

   **Une liste propre à ce jeu, et pas les motifs des mots casés.** Le critère 14
   le dit (« propres à ce jeu ») et la géométrie l'impose : quatre des sept
   motifs de #664 dépassent sept lignes ou six colonnes une fois le clavier
   posé. Que le fichier n'aille pas les rechercher est tenu par
   `mots-croises-gate.test.ts` ; ce qu'on vérifie ICI, c'est le dessin.

   ── LES DEUX BORNES DE TAILLE, ET D'OÙ ELLES VIENNENT ───────────────────────

   • **Sept lignes** est le critère 14 lui-même, avec sa raison : le clavier
     affiché (critère 21) prend plus de 200 px de hauteur, la grille n'a que ce
     qui reste.
   • **Six colonnes** n'est écrit nulle part dans l'issue : c'est la condition
     NÉCESSAIRE du critère 36 (« sur un écran de 360 px, une case mesure au moins
     44 px »), et elle se calcule. Mesure reprise de #664
     (`src/data/jeux/motifs-mots-cases.ts`) : l'écran de jeu vit dans `.home`,
     qui prend 20 px de marge de chaque côté, et une barre de défilement peut
     manger 15 px de plus — il reste 305 px, soit 50 px par case à six colonnes
     et 43,6 px à sept. Sept colonnes rendent donc le critère 36 INATTEIGNABLE,
     quel que soit le SCSS.

     Cette borne-ci est la seule de ce fichier qui repose sur une mesure faite
     ailleurs. Si le rendu de #665 dégageait plus de largeur (grille hors `.home`,
     marges réduites), c'est CE test qu'on corrige, en y écrivant la nouvelle
     mesure — pas le critère 36 qu'on abandonne. La mesure au rendu, elle, reste
     du ressort de la spec Playwright.

   ── CE QUE CE FICHIER NE COUVRE PAS ─────────────────────────────────────────

   Qu'un motif soit REMPLISSABLE avec la banque de définitions. Ça ne se lit pas
   dans la donnée, ça se mesure par échantillon : c'est `mots-croises.test.ts`,
   critère 16. Mesuré avant d'écrire, sur le vivier des 231 mots définis et
   200 tirages : un motif de cinq ou six emplacements et six croisements au plus
   se remplit 200 fois sur 200 ; à partir de huit croisements sur sept
   emplacements, 0 fois sur 200 — et multiplier le budget du solveur par 64 n'y
   change rien, ce n'est pas une recherche qui s'épuise, c'est une grille qui
   n'existe pas.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { MOTIFS_MOTS_CROISES } from '../src/data/jeux/motifs-mots-croises';
import { casesDe, croisements, type Motif } from '../src/core/jeux/grille-mots';

/** Critère 14, tel qu'il est écrit. */
const LIGNES_MAX = 7;

/** Condition nécessaire du critère 36 : 305 px utiles / 44 px de plancher. */
const COLONNES_MAX = 6;

const nom = (m: Motif): string => `motif ${m.id}`;
const cle = (ligne: number, colonne: number): string => `${ligne},${colonne}`;

describe('#665 critère 14 — les motifs sont des données propres à ce jeu', () => {
	it('en livre au moins deux', () => {
		/* Le critère 30 donne à l'enfant coincé une porte de sortie (« changer de
		   grille, sans que la grille ait à être finie »). Avec un seul dessin, cette
		   porte rend la même géométrie et les mêmes longueurs de mots : l'enfant
		   coincé sur « le mot de quatre lettres qui croise celui du haut » retombe
		   exactement dessus. Deux dessins suffisent à ce que la sortie change quelque
		   chose ; les mots casés en livrent sept. */
		expect(MOTIFS_MOTS_CROISES.length).toBeGreaterThanOrEqual(2);
	});

	it('donne à chacun un identifiant unique et non vide', () => {
		// C'est l'id que la sauvegarde range pour retrouver la grille en cours
		// (critère 37) : deux motifs homonymes rendraient la restauration ambiguë,
		// et l'enfant retrouverait une grille qui n'est pas la sienne.
		for (const m of MOTIFS_MOTS_CROISES) expect(m.id.trim(), nom(m)).not.toBe('');
		expect(new Set(MOTIFS_MOTS_CROISES.map((m) => m.id)).size).toBe(MOTIFS_MOTS_CROISES.length);
	});

	it('ne dépasse jamais sept lignes', () => {
		// Cas d'échec littéral du critère 14 : « un motif livré est plus haut ».
		for (const m of MOTIFS_MOTS_CROISES) {
			expect(m.hauteur, `${nom(m)} : ${String(m.hauteur)} lignes`).toBeLessThanOrEqual(LIGNES_MAX);
		}
	});

	it('ne dépasse jamais six colonnes (condition nécessaire du critère 36)', () => {
		/* 305 px utiles sur un écran de 360 : 50 px par case à six colonnes, 43,6 px
		   à sept — sous le plancher de 44 px. Une septième colonne ne rend pas le
		   critère 36 difficile, elle le rend impossible. */
		for (const m of MOTIFS_MOTS_CROISES) {
			expect(
				m.largeur,
				`${nom(m)} : ${String(m.largeur)} colonnes, soit ${(305 / m.largeur).toFixed(1)} px par case sur un écran de 360`,
			).toBeLessThanOrEqual(COLONNES_MAX);
		}
	});

	it('a des dimensions entières et positives', () => {
		for (const m of MOTIFS_MOTS_CROISES) {
			expect(Number.isInteger(m.largeur) && m.largeur > 0, nom(m)).toBe(true);
			expect(Number.isInteger(m.hauteur) && m.hauteur > 0, nom(m)).toBe(true);
		}
	});
});

describe('#665 — un motif de mots croisés est dessinable', () => {
	it('garde toutes ses cases DANS la grille annoncée', () => {
		// Un emplacement qui déborde ne se voit pas dans la donnée : il se voit à
		// l'écran, en lettres coupées ou en cases fantômes — et le critère 24
		// deviendrait indéchiffrable sur une case qui n'est nulle part.
		for (const m of MOTIFS_MOTS_CROISES) {
			for (const e of m.emplacements) {
				for (const c of casesDe(e)) {
					expect(
						c.ligne >= 0 && c.ligne < m.hauteur && c.colonne >= 0 && c.colonne < m.largeur,
						`${nom(m)} : la case ${cle(c.ligne, c.colonne)} sort de la grille ${String(m.largeur)}×${String(m.hauteur)}`,
					).toBe(true);
				}
			}
		}
	});

	it('n’a que des emplacements horizontaux ou verticaux d’au moins deux lettres', () => {
		for (const m of MOTIFS_MOTS_CROISES) {
			expect(m.emplacements.length, `${nom(m)} : aucun emplacement`).toBeGreaterThanOrEqual(2);
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
		for (const m of MOTIFS_MOTS_CROISES) {
			const signatures = m.emplacements.map(
				(e) => `${e.sens}${String(e.ligne)}:${String(e.colonne)}:${String(e.longueur)}`,
			);
			expect(new Set(signatures).size, nom(m)).toBe(signatures.length);
		}
	});

	it('ne fait jamais se recouvrir deux emplacements de même sens', () => {
		/* Deux mots horizontaux qui partagent une case ne sont pas deux mots : ce
		   sont deux lectures d'une même suite de lettres, et le critère 24 n'aurait
		   plus de sens (la case « partagée » ne croise rien, elle appartient deux
		   fois au même axe). */
		for (const m of MOTIFS_MOTS_CROISES) {
			for (const sens of ['h', 'v'] as const) {
				const vues = new Set<string>();
				for (const e of m.emplacements) {
					if (e.sens !== sens) continue;
					for (const c of casesDe(e)) {
						const k = cle(c.ligne, c.colonne);
						expect(vues.has(k), `${nom(m)} : deux mots « ${sens} » sur la case ${k}`).toBe(false);
						vues.add(k);
					}
				}
			}
		}
	});
});

describe('#665 critère 15 — tout emplacement croise au moins un autre emplacement', () => {
	it('ne livre aucun mot isolé', () => {
		/* Cas d'échec littéral : « un mot isolé existe ». Un mot qui ne croise rien
		   ne reçoit jamais une lettre de son voisin (critère 34), donc l'enfant le
		   remplit à l'aveugle sur la seule foi de sa définition — et, si sa réponse
		   est un autre mot que la solution, la grille le refuse sans qu'aucune case
		   ne lui montre pourquoi.

		   Le calcul vient de la GÉOMÉTRIE (`croisements`, éprouvé dans
		   `grille-mots.test.ts`) et jamais d'une liste écrite à la main dans les
		   données : une liste tenue en parallèle finirait par mentir. */
		for (const m of MOTIFS_MOTS_CROISES) {
			const cr = croisements(m);
			const isoles = m.emplacements
				.map((e, i) => ({ e, i }))
				.filter(({ i }) => !cr.some((c) => c.a === i || c.b === i))
				.map(
					({ e, i }) =>
						`#${String(i)} ${e.sens}(${String(e.ligne)},${String(e.colonne)}) de ${String(e.longueur)} lettres`,
				);
			expect(isoles, `${nom(m)} : emplacement(s) sans croisement`).toEqual([]);
		}
	});

	it('n’a pas non plus de MORCEAU de grille détaché du reste', () => {
		/* Le critère 15 pris mot à mot est satisfait par deux paires de mots qui se
		   croisent deux à deux sans jamais se rencontrer : chaque mot croise bien
		   « au moins un autre ». Ce serait pourtant deux grilles côte à côte, et la
		   moitié des lettres offertes par les voisins (critère 34) disparaîtrait.

		   La lecture connexe est la seule qui donne au critère son effet ; elle est
		   plus stricte que sa lettre, et c'est assumé. Le jour où un motif à deux
		   blocs est délibérément voulu, c'est ici qu'on écrit pourquoi. */
		for (const m of MOTIFS_MOTS_CROISES) {
			const cr = croisements(m);
			const vus = new Set<number>([0]);
			const file = [0];
			while (file.length > 0) {
				const i = file.shift() as number;
				for (const c of cr) {
					const voisin = c.a === i ? c.b : c.b === i ? c.a : -1;
					if (voisin >= 0 && !vus.has(voisin)) {
						vus.add(voisin);
						file.push(voisin);
					}
				}
			}
			const detaches = m.emplacements
				.map((_, i) => i)
				.filter((i) => !vus.has(i))
				.map(String);
			expect(detaches, `${nom(m)} : emplacement(s) hors du bloc principal`).toEqual([]);
		}
	});
});

/* Écarté volontairement, pour que le prochain relecteur n'ait pas à le
   re-remonter : « au moins un croisement par emplacement en moyenne » n'ajoute
   rien — un graphe connexe à n sommets a toujours au moins n−1 arêtes, donc le
   contrôle de connexité ci-dessus l'implique déjà. Et « chaque mot garde au
   moins une case non contrainte » est écrit dans l'issue comme un PLAIDOYER
   sous « Limites connues, à ne pas re-remonter en relecture », pas comme un
   critère : en faire un test contredirait le cadrage. */
