/* ============================================================
   Aide contextuelle des exercices (#272) — logique pure : contenu des aides
   et mémoire « aide déjà vue » par profil. (Le rendu est testé en e2e.)
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	AIDES,
	AIDE_VUE_KEY,
	aideVue,
	marquerAideVue,
	texteTtsAide,
	type TypeAide,
} from '../src/core/aide';
import { setActivePrefix } from '../src/core/storage';

/* Les types RÉELS, lus du code — et non une liste tenue à la main.
   Pourquoi ce changement : la liste figée écrite à la création de ce fichier (#272)
   portait cinq types et n'a plus bougé, pendant que `TypeAide` en gagnait huit
   (`ordreNombres`, `tableau`, `tableauVirgule`, `appariement`, `appariementEtiquettes`,
   `clicMot`, `segmentMot`, `droiteGraduee`). Les règles de rédaction ci-dessous étaient
   donc vertes en ne regardant plus que le tiers des aides — dont aucune de celles qui
   sont effectivement rédigées depuis. Aucune trace, nulle part, d'un choix de ne couvrir
   qu'un échantillon : c'est une dérive, pas un parti pris.
   `AIDES` est un `Record<TypeAide, …>`, donc exhaustif par construction : énumérer ses
   clés couvre TOUTE aide future sans que personne y pense. Même forme que les deux autres
   fichiers qui lisent cet inventaire (`langue-enfant.test.ts`, `aide-vue-seed-gate.test.ts`),
   dont l'écart avec celui-ci rendait la dérive invisible. */
const TYPES: TypeAide[] = Object.keys(AIDES) as TypeAide[];

/* Types ajoutés APRÈS l'écriture de ce fichier : ils ne bornent pas l'énumération
   (c'est `AIDES` qui la donne), ils l'empêchent de se re-figer en silence — si
   quelqu'un remplace `TYPES` par une liste écrite à la main, ce témoin le dit. */
const AJOUTS_POSTERIEURS: TypeAide[] = [
	'ordreNombres',
	'tableau',
	'tableauVirgule',
	'appariement',
	'appariementEtiquettes',
	'clicMot',
	'segmentMot',
	'droiteGraduee',
];

beforeEach(() => {
	localStorage.clear();
	setActivePrefix(''); // profil par défaut
});

describe('contenu des aides', () => {
	it('l’énumération couvre TOUS les types d’aide du code, sans liste à maintenir', () => {
		// Plancher bas, comme dans `aide-vue-seed-gate.test.ts` : il attrape un
		// effondrement de la détection (inventaire vide), pas le retrait d'un type.
		expect(
			TYPES.length,
			'aucun type d’aide trouvé : les règles de rédaction ci-dessous ne regarderaient plus rien',
		).toBeGreaterThanOrEqual(10);
		for (const t of AJOUTS_POSTERIEURS) {
			expect(
				TYPES,
				`« ${t} » n’est plus couvert : l’énumération a été re-figée en liste manuelle`,
			).toContain(t);
		}
	});

	it('chaque type expose un titre et au moins une étape, toutes non vides', () => {
		for (const t of TYPES) {
			expect(AIDES[t].titre.trim().length, `AIDES.${t}.titre vide`).toBeGreaterThan(0);
			expect(AIDES[t].etapes.length, `AIDES.${t} n’a aucune étape`).toBeGreaterThan(0);
			expect(
				AIDES[t].etapes.filter((e) => e.trim().length === 0),
				`AIDES.${t} porte une étape vide`,
			).toEqual([]);
		}
	});

	it('limite les étapes à 3 (charge cognitive CE2)', () => {
		const trop = TYPES.filter((t) => AIDES[t].etapes.length > 3).map(
			(t) => `AIDES.${t} : ${AIDES[t].etapes.length} étapes`,
		);
		expect(trop, 'une bulle d’aide au-delà de 3 étapes dépasse la mémoire de travail').toEqual([]);
	});

	it("l'atelier présente une voie alternative ET un filet anti-erreur", () => {
		expect(AIDES.atelier.alternative?.trim().length).toBeGreaterThan(0);
		expect(AIDES.atelier.reparation?.trim().length).toBeGreaterThan(0);
	});

	it('le texte TTS enchaîne titre, étapes et filets', () => {
		const txt = texteTtsAide('ordre');
		expect(txt).toContain(AIDES.ordre.titre);
		expect(txt).toContain(AIDES.ordre.etapes[0]);
		expect(txt).toContain(AIDES.ordre.reparation!);
	});
});

describe('mémoire « aide déjà vue » par profil', () => {
	it('une aide est « non vue » par défaut, puis « vue » après marquage', () => {
		expect(aideVue('tuiles')).toBe(false);
		marquerAideVue('tuiles');
		expect(aideVue('tuiles')).toBe(true);
	});

	it('marque chaque type indépendamment (aucune aide n’en éteint une autre)', () => {
		// Sur TOUS les types, et non quatre d'entre eux : une clé mal formée (ou deux types
		// repliés sur la même) priverait l'enfant de l'affichage automatique d'une aide
		// qu'il n'a jamais vue, en silence.
		for (const t of TYPES) {
			localStorage.clear();
			marquerAideVue(t);
			expect(aideVue(t), `AIDES.${t} marquée vue, mais relue non vue`).toBe(true);
			const fuites = TYPES.filter((autre) => autre !== t && aideVue(autre));
			expect(fuites, `marquer « ${t} » a aussi marqué ${fuites.join(', ')}`).toEqual([]);
		}
	});

	it('est idempotent (marquer deux fois ne casse rien)', () => {
		marquerAideVue('tri');
		marquerAideVue('tri');
		expect(aideVue('tri')).toBe(true);
		expect(localStorage.getItem(AIDE_VUE_KEY)).toContain('tri');
	});

	it('est isolée par profil (préfixe de clé)', () => {
		setActivePrefix('u-a/');
		marquerAideVue('tuiles');
		expect(aideVue('tuiles')).toBe(true);
		// Autre profil : l'état ne fuit pas.
		setActivePrefix('u-b/');
		expect(aideVue('tuiles')).toBe(false);
		marquerAideVue('ordre');
		// Retour au 1er profil : son état est intact.
		setActivePrefix('u-a/');
		expect(aideVue('tuiles')).toBe(true);
		expect(aideVue('ordre')).toBe(false);
	});
});
