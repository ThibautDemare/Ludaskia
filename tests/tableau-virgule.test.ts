/* ============================================================
   Mode « virgule à placer » (#711 lot 4) — logique PURE, sans DOM.

   Le lot 1-2 (cf. `tableau-conversion.test.ts`) a fixé la tranche de colonnes et fait poser
   la virgule PAR L'APPLICATION, seulement quand la réponse est décimale. Ce lot-ci rend le
   geste à l'enfant, dans un mode NEUF (`virgule`) qui ne remplace pas l'ancien.

   Spécification CORRIGÉE le 29/09/2026 (écart tracé sur #711, avis pedagogue-primaire) :
   une virgule sans chiffre derrière n'est pas une écriture de nombre, et le critère n'est
   pas la position de la colonne cible mais le SENS de la conversion — vers une unité plus
   petite le résultat est toujours entier et aucun manuel n'y écrit de virgule. Le mode ne
   tire donc QUE des conversions dont la réponse porte une virgule. Conséquences éprouvées
   ici :

   - critère 8 : `virguleLibre` vrai et `virguleApres` défini sur 100 % des items, toujours
     sur la colonne cible — et, ce qui rend l'écriture licite, jamais en bout de tranche et
     toujours suivi d'au moins un chiffre significatif ;
   - critère 9 : la position de la virgule fait partie de la réponse — un cran d'écart donne
     un autre nombre, et c'est CE nombre que le journal encadrant montre ;
   - critère 10 : l'invariant « colonne de transit ⊕ virgule » tient aussi dans le nouveau
     mode ;
   - critère 20 : le CE2 ne bouge pas. Le mode y est refusé PAR LE GÉNÉRATEUR (pas seulement
     masqué à l'écran), sinon une URL directe ou une reprise périmée ramènerait l'écriture
     décimale dans une classe qui ne l'a pas vue.

   Ce que la restriction du vivier met en danger, et que ce fichier garde donc aussi : un
   vivier réduit peut se réduire à UNE relation (l'enfant refait le même exercice), et il ne
   doit jamais attraper une relation de CONSOLIDATION (hm, dam, hL, daL — entières par
   construction, et sans référent décimal réel).

   Hors de ce fichier : le rendu du pavé, le geste de pose, le blocage de la validation
   tant qu'une case est vide (critère 19) et le filtrage du mode à l'écran de choix — tout
   cela est du DOM, donc de la spec Playwright.

   Le bloc « témoins des détecteurs » en fin de fichier joue les prédicats maison sur des
   tableaux FABRIQUÉS portant exactement la faute annoncée : sans lui, un détecteur devenu
   permissif laisserait tout vert en silence.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { MESURE_LESSONS } from '../src/data/maths/mesures';
import { withSeed } from '../src/core/utils';
import { nombreTableauSaisi, type CelluleTableau } from '../src/core/erreur-representation';
import { modesPourNiveau, defaultMode, hasMode } from '../src/core/exercise';
import {
	derniereCaseDe,
	colonneDeCase,
	caseVirguleAttendue,
	type GeometrieTableau,
} from '../src/core/tableau-virgule';
import type { Exercise, ExerciseType, TableauColonne } from '../src/core/exercise';
import { getAllLessons } from '../src/core/catalog';
import type { SchoolLevel } from '../src/core/catalog';

type Tableau = Extract<Exercise, { type: 'tableauConversion' }>;

/* Les trois familles à échelle décimale (celles qui ont un tableau). */
const FAMILLES = ['mes-longueurs', 'mes-masses', 'mes-contenances'] as const;
/* Celles qui PROPOSENT la virgule à placer : il faut des conversions décimales pour que le
   mode ait un vivier. Les masses n'en ont aucune au CM1 (cf. le témoin plus bas). */
const FAMILLES_VIRGULE = ['mes-longueurs', 'mes-contenances'] as const;
const NIVEAUX = ['ce2', 'cm1'] as const;
const type = (id: string) => MESURE_LESSONS.find((l) => l.id === id)!.exerciseType;

/* Unités NOMMÉES par le programme CE2 (docs/reference/programmes/ce2-maths.md §2.1-2.3),
   recopiées depuis le programme et non depuis le calibrage du code : c'est la source du
   critère 20. La tonne en est écartée (trois rangs sous le kilogramme, dont deux sans
   symbole enseignable — elle n'entre dans aucun tableau). */
const PROGRAMME_CE2: Record<string, string[]> = {
	'mes-longueurs': ['km', 'm', 'dm', 'cm', 'mm'],
	'mes-masses': ['kg', 'g'],
	'mes-contenances': ['L', 'dL', 'cL'],
};

/* Unités que SEULES les relations de CONSOLIDATION mettent en jeu (#711 lot 1-2) : des
   rangs ouverts au CM1 pour que la colonne cesse d'être marquée « pas encore vue », pas des
   grandeurs qu'un enfant rencontre. Une réponse décimale en hectomètres ou en décalitres
   n'a aucun référent réel — c'est la raison même pour laquelle ces relations sont entières.
   Le mode « virgule » ne doit donc jamais les tirer. */
const UNITES_CONSOLIDATION: Record<string, string[]> = {
	'mes-longueurs': ['hm', 'dam'],
	'mes-contenances': ['hL', 'daL'],
};

/* Tirage d'items de tableau dans un MODE donné. Un exercice qui n'est PAS un tableau fait
   échouer net, avec son message : sans cela, un mode ignoré rendrait une liste vide et
   toutes les boucles ci-dessous passeraient à vide — vertes sur rien. */
function genTab(id: string, level: SchoolLevel, mode: string, n: number): Tableau[] {
	const t = type(id);
	const out: Tableau[] = [];
	for (let i = 0; i < n; i++) {
		const ex = t.generate({ mode, level });
		if (ex.type !== 'tableauConversion')
			throw new Error(
				`${id} / ${level} / mode « ${mode} » : exercice « ${ex.type} » au lieu d'un tableau (mode non reconnu ?)`,
			);
		out.push(ex);
	}
	return out;
}

/* ---------- Détecteurs (joués sur des cas fabriqués en fin de fichier) ---------- */

/** Index de la colonne de l'unité DEMANDÉE : une colonne = un rang décimal, donc c'est là
    et nulle part ailleurs que la virgule rend le tableau lisible dans cette unité. */
const colonneCible = (ex: Tableau) => ex.colonnes.findIndex((c) => c.unite === ex.answerUnit);

/** La virgule est attendue, ET elle est attendue juste après la colonne de l'unité visée.
    Le `cible >= 0` n'est pas une précaution de style : sans lui, une unité demandée SANS
    colonne (`findIndex` → -1) accompagnée d'un `virguleApres` de -1 était déclarée
    conforme. Le témoin de fin de fichier l'a attrapé. */
const virguleSurLaCible = (ex: Tableau) => {
	const cible = colonneCible(ex);
	return cible >= 0 && ex.virguleApres === cible;
};

/** Chiffres qui SUIVENT la virgule attendue, dans l'ordre des colonnes. Vide si aucune
    virgule n'est demandée. C'est la partie décimale telle que l'enfant l'écrit. */
const apresVirgule = (ex: Tableau) =>
	ex.virguleApres === undefined
		? ''
		: ex.colonnes
				.slice(ex.virguleApres + 1)
				.map((c) => c.chiffres)
				.join('');

/** Écriture licite : la virgule a au moins un chiffre SIGNIFICATIF derrière elle. « 3000, »
    et « 4,0 » ne sont pas des écritures de nombre (avis pedagogue-primaire). */
const virguleLicite = (ex: Tableau) => /[1-9]/.test(apresVirgule(ex));

/** Critère 10 : la faute à ne jamais produire (une colonne « pas encore vue en classe »
    dans un exercice qui demande aussi de gérer une virgule). */
const transitEtVirgule = (ex: Tableau) =>
	ex.colonnes.some((c) => c.transit) && ex.virguleApres !== undefined;

/** Tranche AFFICHÉE, sous une forme comparable d'un item et d'un mode à l'autre. Le `*`
    marque une colonne démotée : une démotion qui changerait d'un mode à l'autre doit se
    voir, pas seulement un changement d'unités. */
const signature = (ex: Tableau) =>
	ex.colonnes.map((c) => `${c.unite}${c.transit ? '*' : ''}`).join(' | ');

/** Ce qui doit rester IDENTIQUE quand le mode est REFUSÉ par le générateur (CE2) : tout.
    La virgule est comprise, contrairement au CM1 où elle est justement ce qui change. */
const empreinte = (ex: Tableau) =>
	JSON.stringify({
		question: ex.question,
		answer: ex.answer,
		answerUnit: ex.answerUnit,
		uniteConnue: ex.uniteConnue,
		colonnes: ex.colonnes,
		virguleApres: ex.virguleApres,
		parle: ex.parle,
	});

/* ---------- Le mode existe, et seulement où il doit ---------- */

describe('#711 lot 4 — le mode « virgule » est déclaré là où il a un vivier', () => {
	it('longueurs et contenances exposent le mode « virgule » ; la saisie reste conseillée', () => {
		for (const id of FAMILLES_VIRGULE) {
			const modes = (type(id).modes ?? []).map((m) => m.id);
			expect(modes, `${id} : modes exposés`).toEqual(expect.arrayContaining(['saisie', 'virgule']));
			// Le mode conseillé ne change pas : la saisie reste le premier contact.
			expect(type(id).modes?.find((m) => m.recommended)?.id, `${id} : mode conseillé`).toBe(
				'saisie',
			);
		}
	});

	it('le mode « tableau » reste proposé : « virgule » est une marche de plus, pas son remplacement', () => {
		// Spécification gelée du lot : « Deux modes, pas un. Le mode existant `tableau` garde
		// EXACTEMENT son comportement actuel. » Un enfant qui vient de monter la marche du
		// tableau ne doit pas la perdre parce que la suivante arrive — et les masses, qui
		// n'ouvrent pas la virgule, n'auraient alors plus de tableau du tout.
		for (const id of FAMILLES) {
			expect(
				(type(id).modes ?? []).map((m) => m.id),
				`${id} : modes exposés`,
			).toContain('tableau');
		}
	});

	it('le mode « virgule » porte levels: [cm1] et n’est pas mis en avant', () => {
		for (const id of FAMILLES_VIRGULE) {
			const virgule = type(id).modes?.find((m) => m.id === 'virgule');
			expect(virgule, `${id} : mode « virgule » absent du catalogue`).toBeDefined();
			// Placer la virgule suppose l'écriture décimale : hors programme CE2.
			expect(virgule?.levels, `${id} : niveaux du mode « virgule »`).toEqual(['cm1']);
			expect(virgule?.recommended ?? false, `${id} : « virgule » mis en avant`).toBe(false);
			// Les deux modes historiques restent ouverts à TOUS les niveaux : un `levels` posé
			// sur eux les ferait disparaître d'une classe sans que rien ne le dise.
			for (const historique of ['saisie', 'tableau']) {
				expect(
					type(id).modes?.find((m) => m.id === historique)?.levels,
					`${id} : le mode « ${historique} » s'est vu restreindre à un niveau`,
				).toBeUndefined();
			}
		}
	});

	it('les masses ne proposent PAS la virgule : aucune conversion décimale n’y est ouverte au CM1', () => {
		// Le témoin, retourné après la correction de spécification du 29/09. La raison est
		// pédagogique et déjà actée : « 4,5 dag » n'a pas de référent réel, donc aucune paire
		// de masses n'est ouverte au décimal. Le mode y mènerait à un vivier VIDE.
		expect(type('mes-masses').modes?.find((m) => m.id === 'virgule')).toBeUndefined();
		// Double assertion qui protège le témoin : l'absence de décimal s'OBSERVE (aucune
		// réponse à virgule sur un large échantillon du mode tableau au CM1), elle n'est pas
		// supposée. Le jour où une relation décimale y serait ouverte, ce test le dirait — et
		// il faudrait alors rouvrir la question du mode, pas rafistoler l'assertion du dessus.
		const items = genTab('mes-masses', 'cm1', 'tableau', 400);
		expect(
			items.filter((ex) => ex.answer.includes(',')).map((ex) => ex.question),
			'masses CM1 : une conversion décimale est apparue — le mode « virgule » y a désormais un vivier',
		).toEqual([]);
		// Et le mode forcé sur les masses retombe sur le tableau ordinaire, sans virgule à
		// placer : le générateur refuse, il ne plante pas sur un vivier vide.
		for (const ex of genTab('mes-masses', 'cm1', 'virgule', 100)) {
			expect(ex.virguleLibre ?? false, `masses : « ${ex.question} »`).toBe(false);
			expect(ex.virguleApres).toBeUndefined();
		}
	});

	it('les durées restent mono-mode : ni tableau, ni virgule', () => {
		const durees = type('mes-durees');
		expect(durees.modes).toBeUndefined();
		// Base 60 : aucune colonne de rang décimal, donc nulle part où poser une virgule. Un
		// forçage du mode doit retomber sur la saisie texte, jamais sur un tableau.
		for (let i = 0; i < 50; i++) {
			expect(durees.generate({ mode: 'virgule', level: 'cm1' }).type).toBe('text');
		}
		// Contrôle positif : cette assertion SAIT échouer. Sur une famille qui porte une
		// échelle, forcer un mode de tableau rend bien un tableau — donc le « text » ci-dessus
		// vient des durées, pas d'un `generate` qui rendrait du texte quoi qu'on lui demande.
		expect(type('mes-longueurs').generate({ mode: 'tableau', level: 'cm1' }).type).toBe(
			'tableauConversion',
		);
	});
});

/* ---------- Critère 8 : la virgule est à placer, et son écriture est licite ---------- */

describe('#711 lot 4 — critère 8 : au CM1, l’enfant place la virgule', () => {
	it('mode « virgule » : `virguleLibre` vrai et virgule attendue sur la colonne de l’unité demandée, sur 100 % des items', () => {
		for (const id of FAMILLES_VIRGULE) {
			for (const ex of genTab(id, 'cm1', 'virgule', 300)) {
				expect(ex.virguleLibre, `${id} : « ${ex.question} » ne demande pas la virgule`).toBe(true);
				expect(
					ex.virguleApres,
					`${id} : « ${ex.question} » sans position de virgule attendue`,
				).toBeDefined();
				expect(
					virguleSurLaCible(ex),
					`${id} : virgule attendue hors de la colonne « ${ex.answerUnit} » — « ${ex.question} » (virguleApres=${ex.virguleApres})`,
				).toBe(true);
			}
		}
	});

	it('tous les items du mode ont une réponse DÉCIMALE, et la virgule y est licite', () => {
		// Correction de spécification du 29/09 : le mode ne tire que des conversions dont la
		// réponse porte une virgule. Ce qui rend cette écriture licite se vérifie sur la
		// GÉOMÉTRIE du tableau, pas sur la seule chaîne `answer` — c'est ce que l'enfant voit.
		for (const id of FAMILLES_VIRGULE) {
			for (const ex of genTab(id, 'cm1', 'virgule', 300)) {
				expect(ex.answer, `${id} : « ${ex.question} » a une réponse entière`).toContain(',');
				// Jamais en bout de tranche : une virgule après la dernière colonne donnerait
				// « 3000, », qui n'est pas un nombre.
				expect(
					ex.virguleApres,
					`${id} : virgule en bout de tranche — « ${ex.question} » (${signature(ex)})`,
				).toBeLessThan(ex.colonnes.length - 1);
				// Et au moins un chiffre SIGNIFICATIF derrière : « 4,0 » n'est pas non plus une
				// écriture qu'un enfant produit ni qu'un manuel demande.
				expect(
					virguleLicite(ex),
					`${id} : rien de significatif après la virgule — « ${ex.question} » = ${ex.answer} (partie décimale « ${apresVirgule(ex)} »)`,
				).toBe(true);
				// Corollaire du sens imposé (petite→grande) : l'unité connue est TOUJOURS à
				// droite de la cible dans le tableau, jamais à gauche.
				const iConnue = ex.colonnes.findIndex((c) => c.unite === ex.uniteConnue);
				expect(
					iConnue,
					`${id} : « ${ex.question} » convertit vers une unité plus petite`,
				).toBeGreaterThan(colonneCible(ex));
			}
		}
	});

	it('mode « virgule » : les chiffres restent posés à leur RANG (critère 15)', () => {
		// Le mode change le vivier tiré, donc le chemin qui étale `sPetit` sur la tranche. Relus
		// depuis la colonne cible, les chiffres doivent toujours redonner la réponse : un
		// décalage d'une colonne les multiplierait par 10.
		for (const id of FAMILLES_VIRGULE) {
			for (const ex of genTab(id, 'cm1', 'virgule', 300)) {
				const joint = ex.colonnes.map((c) => c.chiffres).join('');
				const lue = Number(joint) / 10 ** (ex.colonnes.length - 1 - colonneCible(ex));
				expect(lue, `${id} : « ${ex.question} » → chiffres « ${joint} »`).toBeCloseTo(
					Number(ex.answer.replace(',', '.')),
					6,
				);
			}
		}
	});
});

/* ---------- Ce que la restriction du vivier met en danger ---------- */

describe('#711 lot 4 — le vivier restreint reste varié et bien choisi', () => {
	it('aucune conversion de CONSOLIDATION n’est tirée (hm, dam, hL, daL restent des rouages du tableau)', () => {
		for (const id of FAMILLES_VIRGULE) {
			const interdites = UNITES_CONSOLIDATION[id];
			for (const ex of genTab(id, 'cm1', 'virgule', 300)) {
				for (const unite of [ex.answerUnit, ex.uniteConnue]) {
					expect(interdites, `${id} : « ${ex.question} » met en jeu ${unite}`).not.toContain(unite);
				}
			}
		}
	});

	it('le tirage reste varié : plusieurs relations, aucune qui écrase les autres', () => {
		// Un vivier restreint peut se réduire à UNE relation sans que rien ne le dise : l'enfant
		// refait alors le même exercice 300 fois, et le mode devient un écran de plus pour rien.
		for (const id of FAMILLES_VIRGULE) {
			const items = genTab(id, 'cm1', 'virgule', 300);
			const paires = items.map((ex) => `${ex.uniteConnue} → ${ex.answerUnit}`);
			const comptes = new Map<string, number>();
			for (const p of paires) comptes.set(p, (comptes.get(p) ?? 0) + 1);
			expect(
				comptes.size,
				`${id} : une seule relation tirée (${[...comptes.keys()]})`,
			).toBeGreaterThan(1);
			const dominante = Math.max(...comptes.values());
			expect(
				dominante / items.length,
				`${id} : une relation écrase les autres (${[...comptes].map(([p, n]) => `${p} ×${n}`).join(', ')})`,
			).toBeLessThan(0.8);
		}
	});

	it('l’enfant rencontre 1 ET 2 chiffres après la virgule (programme 2025 §1.3 : au plus deux)', () => {
		// Les deux écritures sont au programme et ne se travaillent pas de la même façon
		// (dixièmes, centièmes). Un vivier qui n'ouvrirait qu'un des deux cas appauvrirait le
		// mode en silence. La borne DURE des deux décimales est éprouvée en même temps.
		for (const id of FAMILLES_VIRGULE) {
			const decimales = new Set(
				genTab(id, 'cm1', 'virgule', 300).map((ex) => ex.answer.split(',')[1].length),
			);
			expect([...decimales].sort(), `${id} : longueurs de partie décimale rencontrées`).toEqual([
				1, 2,
			]);
		}
	});
});

/* ---------- Non-régression : le mode « tableau » n'a pas bougé ---------- */

describe('#711 lot 4 — le mode « tableau » garde son comportement', () => {
	it('mode « tableau » : virgule ⟺ réponse décimale, aux deux niveaux, et jamais de virgule libre', () => {
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 'tableau', 300)) {
					expect(
						ex.virguleApres !== undefined,
						`${id}/${level} : « ${ex.question} » → ${ex.answer}`,
					).toBe(ex.answer.includes(','));
					if (ex.virguleApres !== undefined) expect(virguleSurLaCible(ex)).toBe(true);
					expect(
						ex.virguleLibre ?? false,
						`${id}/${level} : le mode « tableau » demande la virgule à l'enfant`,
					).toBe(false);
				}
			}
		}
	});

	it('la TRANCHE de colonnes est la même dans les deux modes (critère 1 : elle ne dépend pas de la paire tirée)', () => {
		// Remplace l'ancien « à graine égale, les deux modes tirent le même exercice », devenu
		// faux et assumé : le mode « virgule » restreint le vivier, donc il ne tire plus les
		// mêmes paires. Ce que le critère 1 exige et qui reste vrai : la tranche affichée ne
		// dépend PAS de la paire tirée, donc elle est identique d'un mode à l'autre — sinon
		// chaque unité changerait de colonne en changeant de mode, et l'enfant devrait
		// réapprendre la géométrie du tableau à chaque fois.
		for (const id of FAMILLES_VIRGULE) {
			const tranche = (mode: string) => [...new Set(genTab(id, 'cm1', mode, 100).map(signature))];
			const avec = tranche('virgule');
			const sans = tranche('tableau');
			expect(avec.length, `${id} : la tranche varie d'un item à l'autre en mode virgule`).toBe(1);
			expect(avec, `${id} : tranche du mode « virgule » vs mode « tableau »`).toEqual(sans);
		}
	});
});

/* ---------- Critère 20 : le CE2 ne change pas ---------- */

describe('#711 lot 4 — critère 20 : aucune leçon CE2 ne change de comportement', () => {
	it('mode « virgule » forcé au CE2 : le générateur rend le tableau du mode « tableau », à l’identique', () => {
		// L'écran de choix ne propose pas le mode au CE2 (`ModeOption.levels`), mais une URL
		// directe ou un instantané de reprise périmé peut encore le demander : le générateur
		// doit le refuser lui-même. Comparaison à graine égale, virgule COMPRISE.
		for (const id of FAMILLES) {
			genTab(id, 'ce2', 'tableau', 1); // construit le type hors graine (aucun tirage consommé)
			for (let seed = 1; seed <= 40; seed++) {
				const force = withSeed(seed, () => genTab(id, 'ce2', 'virgule', 1)[0]);
				const normal = withSeed(seed, () => genTab(id, 'ce2', 'tableau', 1)[0]);
				expect(empreinte(force), `${id} / graine ${seed} : tableau CE2 modifié`).toBe(
					empreinte(normal),
				);
				expect(
					force.virguleApres,
					`${id} / graine ${seed} : virgule ramenée au CE2 par un mode forcé`,
				).toBeUndefined();
				expect(
					force.virguleLibre ?? false,
					`${id} / graine ${seed} : virgule libre ramenée au CE2`,
				).toBe(false);
			}
		}
	});

	it('mode « virgule » forcé au CE2 : que des unités du programme CE2, et aucune réponse décimale', () => {
		for (const id of FAMILLES) {
			const programme = PROGRAMME_CE2[id];
			for (const ex of genTab(id, 'ce2', 'virgule', 200)) {
				expect(ex.answer, `${id} : réponse décimale au CE2 — « ${ex.question} »`).not.toContain(
					',',
				);
				expect(programme, `unité cible « ${ex.answerUnit} » hors programme CE2`).toContain(
					ex.answerUnit,
				);
				expect(programme, `unité connue « ${ex.uniteConnue} » hors programme CE2`).toContain(
					ex.uniteConnue,
				);
			}
		}
	});
});

/* ---------- Critère 10 : l'invariant, y compris dans le nouveau mode ---------- */

describe('#711 lot 4 — critère 10 : transit ⊕ virgule', () => {
	it('mode « virgule » : jamais une colonne « pas encore vue en classe » ET une virgule', () => {
		// Deux façons distinctes de tenir l'invariant, et le test les couvre toutes les deux :
		// au CM1 aucune colonne n'est démotée (toute la chaîne de rangs est au programme) ; au
		// CE2 le mode est refusé, donc aucune virgule. Ouvrir la virgule libre au CE2 — là où
		// hm, dam, dg… sont démotés — ferait rougir ce test immédiatement.
		for (const id of FAMILLES) {
			for (const level of NIVEAUX) {
				for (const ex of genTab(id, level, 'virgule', 400)) {
					const demotees = ex.colonnes
						.filter((c) => c.transit)
						.map((c) => c.unite)
						.join(', ');
					expect(
						transitEtVirgule(ex),
						`${id}/${level} : « ${ex.question} » — colonnes démotées [${demotees}] + virgule`,
					).toBe(false);
				}
			}
		}
	});
});

/* ---------- Critère 9 : ce que le parent lit quand la virgule est mal placée ---------- */

describe('#711 lot 4 — critère 9 : le journal relit le tableau à la virgule POSÉE', () => {
	/* Cases telles que le runner les remonte : une par chiffre, dans l'ordre des colonnes
	   (la colonne de tête peut en fournir deux). */
	const casesJustes = (ex: Tableau): CelluleTableau[] =>
		ex.colonnes.flatMap((col) =>
			col.chiffres.split('').map((valeur) => ({ unite: col.unite, valeur })),
		);

	/* Index PLAT de la case après laquelle la virgule est ATTENDUE. La traduction colonne →
	   case n'est pas l'identité dès que la tête porte deux chiffres — et c'est la fonction
	   LIVRÉE qui la fait, pas une copie écrite ici : une copie de test vérifierait sa propre
	   arithmétique pendant que le runner emploierait une autre. */
	const caseAttendue = caseVirguleAttendue;

	it('chiffres justes + virgule au bon rang : le journal lit exactement la réponse attendue', () => {
		for (const id of FAMILLES_VIRGULE) {
			for (const ex of genTab(id, 'cm1', 'virgule', 200)) {
				expect(
					nombreTableauSaisi(casesJustes(ex), ex.answerUnit, caseAttendue(ex)),
					`${id} : « ${ex.question} »`,
				).toBe(ex.answer);
			}
		}
	});

	it('chiffres justes + virgule décalée d’un cran : le parent lit un nombre dix fois trop grand ou trop petit', () => {
		// C'est tout l'enjeu du critère 9 : la position de la virgule fait partie de la réponse,
		// donc le journal doit montrer le nombre FAUX que l'enfant a écrit, jamais la valeur
		// juste relue depuis l'unité demandée.
		let eprouves = 0;
		for (const id of FAMILLES_VIRGULE) {
			for (const ex of genTab(id, 'cm1', 'virgule', 200)) {
				const cells = casesJustes(ex);
				const i = caseAttendue(ex);
				const juste = Number(ex.answer.replace(',', '.'));
				for (const [decalage, facteur] of [
					[-1, 0.1],
					[1, 10],
				] as const) {
					const j = i + decalage;
					if (j < 0 || j > cells.length - 1) continue;
					eprouves++;
					const lu = nombreTableauSaisi(cells, ex.answerUnit, j);
					expect(
						Number(lu.replace(',', '.')),
						`${id} : « ${ex.question} » — virgule décalée de ${decalage} lue « ${lu} »`,
					).toBeCloseTo(juste * facteur, 9);
					// Et ce n'est plus la réponse attendue : le parent voit l'écart.
					expect(lu).not.toBe(ex.answer);
				}
			}
		}
		expect(
			eprouves,
			'aucun décalage éprouvable : la virgule tombe toujours en bout de table',
		).toBeGreaterThan(0);
	});
});

/* ---------- Traduction case ↔ colonne (`src/core/tableau-virgule.ts`) ----------
   Deux systèmes d'index qui se ressemblent : les cases forment une liste PLATE (la colonne
   de tête peut en fournir DEUX, la tranche fixe devant encaisser les valeurs jusqu'à 20),
   `virguleApres` désigne une COLONNE. Les confondre décale la virgule d'un rang — et
   seulement sur les leçons à tête double, donc jamais sur « 3 km » et toujours sur
   « 12 km ». Un tirage aléatoire ne garantit pas de rencontrer le cas ; des tableaux
   FABRIQUÉS, si. C'est tout l'intérêt d'avoir sorti ces fonctions du runner. */

describe('#711 lot 4 — frontières de colonne : index de CASE et index de COLONNE', () => {
	const geo = (...chiffres: string[]): GeometrieTableau => ({
		colonnes: chiffres.map((c) => ({ chiffres: c })),
	});
	const lire = (g: GeometrieTableau) => g.colonnes.map((c) => c.chiffres).join('|');

	const TETE_SIMPLE = geo('3', '0', '0'); // 3 colonnes, 3 cases
	const TETE_DOUBLE = geo('12', '5', '0'); // 3 colonnes, 4 cases
	const TETE_DOUBLE_LONGUE = geo('20', '0', '0', '0', '0', '0', '0'); // 7 colonnes, 8 cases
	const GEOMETRIES = [TETE_SIMPLE, TETE_DOUBLE, TETE_DOUBLE_LONGUE, geo('7'), geo('12', '0')];

	it('tête à deux chiffres : la frontière est la DEUXIÈME case, et les deux cases sont dans la colonne 0', () => {
		// « 12 | 5 | 0 » : la virgule ne se pose qu'APRÈS le 2, jamais entre le 1 et le 2 —
		// cette tête est un artefact de la tranche fixe, pas un rang du tableau.
		expect(derniereCaseDe(TETE_DOUBLE, 0)).toBe(1);
		expect(colonneDeCase(TETE_DOUBLE, 0)).toBe(0);
		expect(colonneDeCase(TETE_DOUBLE, 1)).toBe(0);
		// Et le décalage se propage : les colonnes suivantes sont décalées d'une case.
		expect(derniereCaseDe(TETE_DOUBLE, 1)).toBe(2);
		expect(derniereCaseDe(TETE_DOUBLE, 2)).toBe(3);
		expect(colonneDeCase(TETE_DOUBLE, 2)).toBe(1);
		expect(colonneDeCase(TETE_DOUBLE, 3)).toBe(2);
	});

	it('tête simple : une case par colonne, les deux index coïncident', () => {
		// Le cas où la traduction ne sert à rien — et c'est précisément pourquoi une suite qui
		// ne testerait que lui ne garderait rien (cf. le témoin plus bas).
		for (let c = 0; c < TETE_SIMPLE.colonnes.length; c++) {
			expect(derniereCaseDe(TETE_SIMPLE, c)).toBe(c);
			expect(colonneDeCase(TETE_SIMPLE, c)).toBe(c);
		}
	});

	it('la DERNIÈRE colonne a pour frontière la dernière case du tableau', () => {
		for (const g of GEOMETRIES) {
			const cases = g.colonnes.reduce((n, c) => n + c.chiffres.length, 0);
			expect(derniereCaseDe(g, g.colonnes.length - 1), lire(g)).toBe(cases - 1);
		}
	});

	it('un index de case hors borne retombe sur la DERNIÈRE colonne (contrat écrit du module)', () => {
		/* Contrat documenté dans `tableau-virgule.ts` : l'appelant est le runner, dont la case
		   active est toujours dans les bornes ; rendre -1 propagerait silencieusement une
		   position de virgule invalide au lieu d'échouer près de la cause. Éprouvé, pas
		   deviné — et à rouvrir ici si le contrat change. */
		expect(colonneDeCase(TETE_DOUBLE, 4)).toBe(2); // une case au-delà de la dernière
		expect(colonneDeCase(TETE_DOUBLE, 99)).toBe(2);
		expect(colonneDeCase(TETE_SIMPLE, 3)).toBe(2);
	});

	it('un index de case NÉGATIF retombe sur la première colonne (l’autre borne du domaine)', () => {
		/* La borne basse est désormais explicite dans `tableau-virgule.ts` (`if (i < 0) return 0`)
		   au lieu d'être un accident de la comparaison `i < n`. Éprouvée ici avec la haute, pour
		   que le domaine se lise d'un seul endroit — c'est l'oubli du bas qui rendait ces deux
		   fonctions piégeuses à composer (cf. le test suivant). */
		expect(colonneDeCase(TETE_DOUBLE, -1)).toBe(0);
		expect(colonneDeCase(TETE_DOUBLE, -99)).toBe(0);
		expect(colonneDeCase(TETE_SIMPLE, -1)).toBe(0);
	});

	it('PIÈGE, pas fonctionnalité : composer les deux fonctions sans garde répond « colonne 0 » là où il n’y a PAS de virgule', () => {
		/* Ce test ne décrit rien qu'on veuille : il épingle un danger, pour qu'il ne se
		   redécouvre pas sur le terrain. `caseVirguleAttendue` rend -1 quand l'exercice ne
		   demande pas de virgule ; `colonneDeCase` rend 0 pour tout index négatif. Enchaînés
		   sans écarter le cas, ils répondent « après la première colonne » là où la réponse est
		   « il n'y en a pas » — et rien ne distingue les deux en aval.

		   Le contrat (écrit dans `tableau-virgule.ts`) est donc : ne jamais les composer sans
		   brancher d'abord sur `virguleApres === undefined`. Si un jour la composition devait
		   devenir sûre — un `null`, une levée —, c'est CE test qu'il faut rouvrir, et son échec
		   sera le signal que le piège a été refermé, pas une régression. */
		const sansVirgule = TETE_DOUBLE; // pas de `virguleApres`
		const virguleApresLaPremiere = { ...TETE_DOUBLE, virguleApres: 0 };

		// Deux exercices qui n'ont PAS la même attente…
		expect(caseVirguleAttendue(sansVirgule)).toBe(-1);
		expect(caseVirguleAttendue(virguleApresLaPremiere)).toBe(1);
		// …et pourtant, composé sans garde, le même verdict. C'est toute l'ambiguïté.
		expect(colonneDeCase(sansVirgule, caseVirguleAttendue(sansVirgule))).toBe(0);
		expect(colonneDeCase(virguleApresLaPremiere, caseVirguleAttendue(virguleApresLaPremiere))).toBe(
			0,
		);

		// La garde, elle, les sépare — c'est la forme que tout appelant doit avoir.
		const colonneDeLaVirgule = (g: GeometrieTableau): number | undefined =>
			g.virguleApres === undefined ? undefined : colonneDeCase(g, caseVirguleAttendue(g));
		expect(colonneDeLaVirgule(sansVirgule)).toBeUndefined();
		expect(colonneDeLaVirgule(virguleApresLaPremiere)).toBe(0);
	});

	it('sans virgule attendue, `caseVirguleAttendue` rend -1 — et -1 n’est JAMAIS une case', () => {
		expect(caseVirguleAttendue(TETE_DOUBLE)).toBe(-1);
		expect(caseVirguleAttendue({ ...TETE_DOUBLE, virguleApres: 0 })).toBe(1);
		expect(caseVirguleAttendue({ ...TETE_DOUBLE, virguleApres: 2 })).toBe(3);
		/* La propriété qui donne son sens au -1, et qui compte plus que la valeur : aucune
		   colonne n'a -1 pour frontière. Une position posée par l'enfant ne peut donc pas
		   coïncider avec « aucune virgule attendue » et être déclarée juste par accident. */
		for (const g of GEOMETRIES)
			for (let c = 0; c < g.colonnes.length; c++)
				expect(derniereCaseDe(g, c), `${lire(g)} colonne ${c}`).toBeGreaterThanOrEqual(0);
	});

	it('aller-retour : la frontière d’une colonne appartient bien à cette colonne', () => {
		// Plus forte que les cas isolés : elle vaut pour toute géométrie, et c'est elle qui
		// tombe dès que l'un des deux sens compte les cases comme des colonnes.
		for (const g of GEOMETRIES)
			for (let c = 0; c < g.colonnes.length; c++)
				expect(colonneDeCase(g, derniereCaseDe(g, c)), `${lire(g)} colonne ${c}`).toBe(c);
	});

	it('témoin : l’aller-retour est AVEUGLE sur une tête simple, c’est la tête double qui le rend sensible', () => {
		/* La faute que ce module existe pour empêcher : prendre l'index de colonne pour un
		   index de case. On la joue ici à la place de `derniereCaseDe` pour montrer ce que la
		   propriété attrape — et surtout ce qu'elle n'attrape PAS. Sans ce témoin, une suite
		   qui n'aurait tiré que des têtes simples resterait verte avec la traduction fausse,
		   et personne n'apprendrait que le filet est troué. */
		const naive = (_g: GeometrieTableau, col: number) => col;
		const allerRetour = (g: GeometrieTableau, trad: (g: GeometrieTableau, c: number) => number) =>
			g.colonnes.every((_, c) => colonneDeCase(g, trad(g, c)) === c);

		expect(allerRetour(TETE_SIMPLE, naive), 'tête simple : la traduction naïve passe').toBe(true);
		expect(allerRetour(TETE_DOUBLE, naive), 'tête double : la traduction naïve doit tomber').toBe(
			false,
		);
		expect(
			allerRetour(TETE_DOUBLE_LONGUE, naive),
			'tête double longue : la traduction naïve doit tomber',
		).toBe(false);
		// Et la vraie traduction passe partout, y compris là où la naïve tombe.
		for (const g of GEOMETRIES) expect(allerRetour(g, derniereCaseDe), lire(g)).toBe(true);
	});

	it('confronté aux tableaux réellement générés, dans les deux modes', () => {
		let tetesDoubles = 0;
		for (const id of FAMILLES)
			for (const level of NIVEAUX)
				for (const mode of ['tableau', 'virgule'])
					for (const ex of genTab(id, level, mode, 120)) {
						if (ex.colonnes[0].chiffres.length === 2) tetesDoubles++;
						const ou = `${id}/${level}/${mode} — « ${ex.question} »`;
						ex.colonnes.forEach((_, c) => {
							expect(derniereCaseDe(ex, c), `${ou} colonne ${c}`).toBeGreaterThanOrEqual(0);
							expect(colonneDeCase(ex, derniereCaseDe(ex, c)), `${ou} colonne ${c}`).toBe(c);
						});
						// Et la virgule attendue retombe bien sur la colonne annoncée.
						const i = caseVirguleAttendue(ex);
						if (ex.virguleApres === undefined) expect(i, ou).toBe(-1);
						else expect(colonneDeCase(ex, i), ou).toBe(ex.virguleApres);
					}
		/* Sans tête double dans l'échantillon, tout ce qui précède est aveugle : c'est
		   exactement le cas que la traduction naïve traverse sans broncher. Le mode `tableau`
		   des longueurs CM1 en produit (« 12 km »), le mode `virgule` non — sa réponse
		   décimale reste sous le premier rang de la tranche. */
		expect(
			tetesDoubles,
			'aucune tête à deux chiffres tirée : la confrontation ne prouve rien',
		).toBeGreaterThan(0);
	});
});

/* ---------- `modesPourNiveau` : le filtre d'affichage, et ce qu'il ne filtre pas ---------- */

describe('#711 lot 4 — modesPourNiveau', () => {
	const ids = (ms: { id: string }[]) => ms.map((m) => m.id);

	it('sans niveau, rien n’est filtré', () => {
		// Les appelants qui n'ont pas de niveau sous la main doivent voir la liste entière :
		// un filtre qui se déclencherait « par défaut » masquerait un mode à tout le monde.
		for (const id of FAMILLES)
			expect(ids(modesPourNiveau(type(id))), id).toEqual(ids(type(id).modes ?? []));
	});

	it('un mode sans `levels` reste proposé à tous les niveaux', () => {
		for (const id of FAMILLES)
			for (const level of NIVEAUX) {
				const proposes = ids(modesPourNiveau(type(id), level));
				for (const m of type(id).modes ?? [])
					if (!m.levels) expect(proposes, `${id}/${level}`).toContain(m.id);
			}
	});

	it('le CM1 voit le mode « virgule », le CE2 ne le voit pas', () => {
		for (const id of FAMILLES_VIRGULE) {
			expect(ids(modesPourNiveau(type(id), 'cm1')), id).toContain('virgule');
			expect(ids(modesPourNiveau(type(id), 'ce2')), id).not.toContain('virgule');
			// Et le filtre ne fait QUE ça : le reste de la liste est identique aux deux niveaux.
			expect(ids(modesPourNiveau(type(id), 'ce2'))).toEqual(
				ids(modesPourNiveau(type(id), 'cm1')).filter((m) => m !== 'virgule'),
			);
		}
		// Les masses ne déclarent pas le mode : les deux niveaux voient la même chose.
		expect(ids(modesPourNiveau(type('mes-masses'), 'ce2'))).toEqual(
			ids(modesPourNiveau(type('mes-masses'), 'cm1')),
		);
	});

	it('aucun mode restreint à un niveau n’est le mode CONSEILLÉ — c’est ce qui rend `defaultMode` sûr', () => {
		/* `defaultMode` et `hasMode` ne prennent PAS de niveau : ils lisent `type.modes` tel
		   quel. C'est sans effet AUJOURD'HUI, mais à une condition qui n'est écrite nulle part
		   ailleurs — qu'aucun mode porteur de `levels` ne soit `recommended`. Le jour où l'un
		   le serait, `defaultMode` désignerait à un CE2 un mode que son écran ne lui propose
		   pas, et l'enfant partirait sur un exercice hors programme sans l'avoir choisi.
		   Balayé sur TOUT le catalogue : la condition ne vaut pas que pour les mesures. */
		const fautifs = getAllLessons().flatMap((l) =>
			(l.exerciseType.modes ?? [])
				.filter((m) => m.levels && m.recommended)
				.map((m) => `${l.id} → mode « ${m.id} » (levels: ${m.levels?.join(', ')})`),
		);
		expect(
			fautifs,
			`Ces modes sont à la fois RESTREINTS à un niveau et CONSEILLÉS :\n${fautifs.join('\n')}\n` +
				`defaultMode() (src/core/exercise.ts) ne prend pas de niveau : il les désignerait ` +
				`aussi aux classes qui ne les voient pas à l'écran.\n` +
				`Deux issues : retirer « recommended », ou faire passer defaultMode par ` +
				`modesPourNiveau — ce qui suppose de lui donner le niveau, donc de toucher ses ` +
				`appelants.`,
		).toEqual([]);
	});

	it('témoin : le danger est réel — `defaultMode` et `hasMode` ignorent bel et bien le niveau', () => {
		/* Sans ce témoin, le test ci-dessus garderait une condition dont personne ne saurait
		   dire ce qu'elle protège : il est vert parce qu'aucun mode ne cumule les deux, pas
		   parce que le cumul serait inoffensif. On fabrique donc le cumul et on montre les
		   deux fonctions se tromper. */
		const faux: ExerciseType = {
			modes: [
				{ id: 'cm1-seulement', label: 'Mode CM1', levels: ['cm1'], recommended: true },
				{ id: 'partout', label: 'Mode commun' },
			],
			generate: () => ({ type: 'text', question: '@', answer: '1' }),
			check: () => true,
		};
		// L'écran de choix, lui, fait bien son travail…
		expect(ids(modesPourNiveau(faux, 'ce2'))).toEqual(['partout']);
		expect(ids(modesPourNiveau(faux, 'cm1'))).toEqual(['cm1-seulement', 'partout']);
		// …mais ces deux-là désignent le mode CM1 sans savoir à qui ils parlent.
		expect(defaultMode(faux)).toBe('cm1-seulement');
		expect(hasMode(faux, 'cm1-seulement')).toBe(true);
	});
});

/* ---------- Témoins : ce qui doit faire RÉAGIR les détecteurs ci-dessus ----------
   Les critères 8 et 10 sont vérifiés par des prédicats maison, et le refus du mode au CE2
   par une empreinte. Trop permissifs, ils laisseraient la suite verte sur du contenu
   fautif : on les joue donc ici sur des tableaux FABRIQUÉS portant exactement la faute
   annoncée, plus les témoins corrects qui ne doivent PAS être signalés. */

const colonne = (unite: string, chiffres: string, transit = false): TableauColonne => ({
	unite,
	nom: unite,
	transit,
	chiffres,
});

const fauxTableau = (
	question: string,
	answer: string,
	answerUnit: string,
	uniteConnue: string,
	colonnes: TableauColonne[],
	virguleApres?: number,
): Tableau => ({
	type: 'tableauConversion',
	question,
	answer,
	answerUnit,
	uniteConnue,
	colonnes,
	...(virguleApres !== undefined ? { virguleApres } : {}),
});

describe('#711 lot 4 — témoins des détecteurs', () => {
	const COLS = [colonne('m', '3'), colonne('dm', '0'), colonne('cm', '0')];

	it('« virgule sur la cible » rejette une virgule décalée, ou absente', () => {
		expect(virguleSurLaCible(fauxTableau('3 m = @ cm', '300', 'cm', 'm', COLS, 2))).toBe(true);
		// Une colonne trop tôt : le tableau se lirait « 30 », pas « 300 ».
		expect(virguleSurLaCible(fauxTableau('3 m = @ cm', '300', 'cm', 'm', COLS, 1))).toBe(false);
		// Pas de virgule du tout : c'est le comportement de l'ANCIEN mode, pas du nouveau.
		expect(virguleSurLaCible(fauxTableau('3 m = @ cm', '300', 'cm', 'm', COLS))).toBe(false);
		// Unité demandée sans colonne : `findIndex` rend -1, qui ne doit JAMAIS valoir « bon ».
		expect(virguleSurLaCible(fauxTableau('3 m = @ mm', '3000', 'mm', 'm', COLS, -1))).toBe(false);
	});

	it('« virgule licite » exige un chiffre SIGNIFICATIF derrière, pas seulement une colonne', () => {
		const cols = [colonne('m', '4'), colonne('dm', '5'), colonne('cm', '0')];
		// 4,5 m : un 5 derrière la virgule → licite.
		expect(virguleLicite(fauxTableau('45 dm = @ m', '4,5', 'm', 'dm', cols, 0))).toBe(true);
		// Des colonnes derrière, mais toutes à zéro : « 4,00 » n'est pas une écriture de nombre.
		const zeros = [colonne('m', '4'), colonne('dm', '0'), colonne('cm', '0')];
		expect(virguleLicite(fauxTableau('400 cm = @ m', '4', 'm', 'cm', zeros, 0))).toBe(false);
		// Virgule en BOUT de tranche : rien derrière du tout (« 450, »).
		expect(virguleLicite(fauxTableau('4,5 m = @ cm', '450', 'cm', 'm', cols, 2))).toBe(false);
		// Et sans virgule demandée, il n'y a rien à juger.
		expect(virguleLicite(fauxTableau('45 dm = @ m', '4,5', 'm', 'dm', cols))).toBe(false);
	});

	it('« transit ⊕ virgule » signale bien la coexistence, et elle seule', () => {
		const avecDemotee = [colonne('m', '3'), colonne('dm', '0', true), colonne('cm', '0')];
		expect(transitEtVirgule(fauxTableau('3 m = @ cm', '300', 'cm', 'm', avecDemotee, 2))).toBe(
			true,
		);
		// Une colonne démotée SANS virgule : autorisé (c'est le CE2 d'aujourd'hui).
		expect(transitEtVirgule(fauxTableau('3 m = @ cm', '300', 'cm', 'm', avecDemotee))).toBe(false);
		// Une virgule SANS colonne démotée : autorisé (c'est le CM1).
		expect(transitEtVirgule(fauxTableau('3 m = @ cm', '300', 'cm', 'm', COLS, 2))).toBe(false);
	});

	it('la signature de tranche distingue les unités ET les colonnes démotées', () => {
		const ref = fauxTableau('3 m = @ cm', '300', 'cm', 'm', COLS);
		expect(signature(ref)).toBe('m | dm | cm');
		const plusCourte = fauxTableau('3 m = @ dm', '30', 'dm', 'm', COLS.slice(0, 2));
		expect(signature(plusCourte)).not.toBe(signature(ref));
		const demotee = fauxTableau('3 m = @ cm', '300', 'cm', 'm', [
			colonne('m', '3'),
			colonne('dm', '0', true),
			colonne('cm', '0'),
		]);
		expect(signature(demotee)).not.toBe(signature(ref));
	});

	it('l’empreinte du CE2 inclut la virgule, les chiffres et l’énoncé', () => {
		const sansVirgule = fauxTableau('3 m = @ cm', '300', 'cm', 'm', COLS);
		// Contrairement au CM1, la virgule COMPTE ici : au CE2 elle ne doit apparaître d'aucun
		// côté, donc une empreinte qui l'ignorerait ne garderait rien.
		expect(empreinte(fauxTableau('3 m = @ cm', '300', 'cm', 'm', COLS, 2))).not.toBe(
			empreinte(sansVirgule),
		);
		const autresChiffres = fauxTableau('3 m = @ cm', '300', 'cm', 'm', [
			colonne('m', '3'),
			colonne('dm', '7'),
			colonne('cm', '0'),
		]);
		expect(empreinte(sansVirgule)).not.toBe(empreinte(autresChiffres));
		const autreEnonce = fauxTableau('4 m = @ cm', '400', 'cm', 'm', COLS);
		expect(empreinte(sansVirgule)).not.toBe(empreinte(autreEnonce));
	});
});
