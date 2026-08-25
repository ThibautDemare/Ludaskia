/* ============================================================
   Escalier DATÉ des étapes d'un mot d'orthographe (#545) — `core/orthographe/etapes.ts`,
   le datage posé par `runner.ts`, la borne de `paliers.ts` et la composition d'une liste
   (`progression.ts`).
   ------------------------------------------------------------
   Ce que ce fichier éprouve, et pourquoi ça n'existait pas avant : l'espace encadrant ne
   savait dire d'une liste que « pas commencée / en cours / acquise », parce que le seul
   compte affiché ne retient que les mots dont TOUS les modes sont validés. Entre les deux
   caps, des semaines de travail réel ne changeaient rien à l'écran. La composition, elle,
   doit bouger dès qu'UN mot monte d'une marche.

   Les attendus sont dérivés de l'ISSUE, pas de l'implémentation :
   - l'escalier est celui du parcours de l'enfant — pas encore découvert, atelier fait,
     tuiles réussi, affiche/masque réussi, dictée réussie — et il est EXCLUSIF (un mot est à
     exactement un rang), ce qui découle de `prochainModeAValider`, qui prend le PREMIER mode
     non validé ;
   - sans voix de synthèse la dictée n'est pas requise, donc l'escalier s'arrête à
     l'affiche/masque, qui vaut alors sommet — et le sommet coïncide avec « maîtrisé »
     (critère 7) ;
   - une étape franchie SANS date est réputée franchie AVANT la mise en service du datage :
     rien n'est reconstitué (critère 23).

   La frise hebdomadaire, elle, est éprouvée dans `frise-composition.test.ts`.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
	initProfiles,
	activeProfile,
	addProfile,
	listProfiles,
	deleteProfile,
	touchActiveProfile,
	exportProfiles,
	importProfiles,
} from '../src/core/profiles';
import { setOnDataWrite, lsGetRaw, lsSetRaw, appKeys } from '../src/core/storage';
import {
	ORDRE_ETAPES,
	paliersComposition,
	dateFranchissement,
	rangMot,
	composition,
	type RangMot,
} from '../src/core/orthographe/etapes';
import { marquerAtelierFait, validerMode, statutMot } from '../src/core/orthographe/runner';
import {
	journaliserPaliersOrtho,
	debutSuiviEtapes,
	ORTHO_ETAPES_DEBUT_KEY,
	ORTHO_PALIERS_KEY,
	ORTHO_PALIERS_DEBUT_KEY,
} from '../src/core/orthographe/paliers';
import {
	loadOrtho,
	loadOrthoFor,
	saveOrtho,
	createListe,
	emptyOrthoState,
	addOrGetMot,
	ORTHO_KEY,
} from '../src/core/orthographe/store';
import {
	motsAttendusLecon,
	compositionLecon,
	avancementLecon,
} from '../src/core/orthographe/progression';
import { listesOrthoProfil } from '../src/core/encadrant-stats';
import type { MotOrtho, EtapeOrtho, ModeOrtho } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- L'escalier tel que l'issue le décrit, écrit à la main ---------- */
const ETAPES: EtapeOrtho[] = ['atelier', 'tuiles', 'motCache', 'dictee'];
const MODES: ModeOrtho[] = ['tuiles', 'motCache', 'dictee'];
const AVEC_VOIX: RangMot[] = ['neuf', 'atelier', 'tuiles', 'motCache', 'dictee'];
const SANS_VOIX: RangMot[] = ['neuf', 'atelier', 'tuiles', 'motCache'];
const sommet = (dicteeDispo: boolean): RangMot =>
	dicteeDispo ? AVEC_VOIX[AVEC_VOIX.length - 1] : SANS_VOIX[SANS_VOIX.length - 1];

const JOUR = 86_400_000;
const T0 = new Date(2026, 5, 1, 9, 0).getTime(); // lundi 1er juin 2026, 9 h
const le = (jours: number): number => T0 + jours * JOUR;

/* ---------- Fabrication de mots ---------- */
let compteur = 0;
/** Mot neuf, fabriqué par la VRAIE entrée en banque (forme du modèle garantie). */
function motVierge(forme = `mot${++compteur}`): MotOrtho {
	return addOrGetMot(emptyOrthoState(), { mot: forme });
}
/** Franchit une étape par la fonction qui fait progresser le mot — la seule qui date. */
function franchir(m: MotOrtho, etape: EtapeOrtho, quand: number): void {
	if (etape === 'atelier') marquerAtelierFait(m, quand);
	else validerMode(m, etape, quand);
}
/** Mot dont les étapes ont été franchies à des instants donnés (parcours réel, daté). */
function motProgresse(...etapes: [EtapeOrtho, number][]): MotOrtho {
	const m = motVierge();
	for (const [etape, quand] of etapes) franchir(m, etape, quand);
	return m;
}
/** Mot d'AVANT #545 : les booléens sont posés, aucune date n'existe et rien ne la
    reconstitue. On écrit ici les booléens à la main — c'est précisément ce qu'aucun chemin
    de `src/` n'a le droit de faire (gate du critère 3 plus bas), et ce qui fabrique le
    profil existant que la frise doit savoir lire. */
function motAncien(...etapes: EtapeOrtho[]): MotOrtho {
	const m = motVierge();
	for (const etape of etapes) {
		if (etape === 'atelier') m.atelierFait = true;
		else m.validation[etape] = true;
	}
	return m;
}
/** Compte attendu, écrit par RANG (`{ neuf: 2, atelier: 1 }`) plutôt qu'en indices. */
function compte(paliers: RangMot[], parRang: Partial<Record<RangMot, number>>): number[] {
	return paliers.map((p) => parRang[p] ?? 0);
}

/* ============================================================
   1. L'escalier — critère 7 (seules les étapes requises existent)
   ============================================================ */
describe('l’escalier des étapes', () => {
	it('ORDRE_ETAPES suit le parcours de l’enfant : atelier, tuiles, affiche/masque, dictée', () => {
		expect([...ORDRE_ETAPES]).toEqual(ETAPES);
	});

	it('critère 7 : sans voix de synthèse, l’étape dictée n’existe pas du tout', () => {
		// « une bande "dictée" reste vide en permanence » = violation. Le rang n'est pas
		// seulement inatteignable : il n'est pas dessiné.
		expect(paliersComposition(false)).toEqual(SANS_VOIX);
		expect(paliersComposition(false)).not.toContain('dictee');
		expect(paliersComposition(true)).toEqual(AVEC_VOIX);
	});

	it('les rangs vont du bas vers le haut, « neuf » d’abord et le sommet en dernier', () => {
		for (const dispo of [false, true]) {
			const p = paliersComposition(dispo);
			expect(p[0], String(dispo)).toBe('neuf');
			expect(p[p.length - 1], String(dispo)).toBe(sommet(dispo));
			expect(new Set(p).size, String(dispo)).toBe(p.length); // aucun rang en double
		}
	});
});

/* ============================================================
   2. Rang d'un mot AUJOURD'HUI — critères 6, 7, 13
   ============================================================ */
describe('rangMot — où en est un mot aujourd’hui', () => {
	it('un mot dont rien n’est commencé est « neuf »', () => {
		expect(rangMot(motVierge(), true)).toBe('neuf');
		expect(rangMot(motVierge(), false)).toBe('neuf');
	});

	it('un mot ATTENDU mais jamais matérialisé en banque est « neuf », pas une absence', () => {
		// `motsAttendusLecon` rend `undefined` pour un mot d'une leçon prédéfinie jamais jouée :
		// il compte dans le total de la liste, au bas de l'escalier.
		expect(rangMot(undefined, true)).toBe('neuf');
		expect(rangMot(undefined, false)).toBe('neuf');
	});

	it('chaque marche franchie déplace le mot d’exactement un rang', () => {
		const m = motVierge();
		expect(rangMot(m, true)).toBe('neuf');
		franchir(m, 'atelier', le(0));
		expect(rangMot(m, true)).toBe('atelier');
		franchir(m, 'tuiles', le(1));
		expect(rangMot(m, true)).toBe('tuiles');
		franchir(m, 'motCache', le(2));
		expect(rangMot(m, true)).toBe('motCache');
		franchir(m, 'dictee', le(3));
		expect(rangMot(m, true)).toBe('dictee');
	});

	it('critère 7 : sans voix, l’affiche/masque EST le sommet — la dictée ne change plus rien', () => {
		const m = motProgresse(['atelier', le(0)], ['tuiles', le(1)], ['motCache', le(2)]);
		expect(rangMot(m, false)).toBe('motCache');
		expect(rangMot(m, false)).toBe(sommet(false));
		expect(statutMot(m, false)).toBe('maitrise'); // la ligne dit « acquise » : le sommet aussi
		// La même donnée, sur un appareil qui a une voix : le mot n'est plus au sommet.
		expect(rangMot(m, true)).toBe('motCache');
		expect(rangMot(m, true)).not.toBe(sommet(true));
		// Et un mot qui a fait la dictée n'est jamais rangé sous un rang qui n'existe pas.
		const complet = motProgresse(
			['atelier', le(0)],
			['tuiles', le(1)],
			['motCache', le(2)],
			['dictee', le(3)],
		);
		expect(rangMot(complet, false)).toBe('motCache');
	});

	it('INVARIANT sur les 16 états de booléens : le sommet coïncide avec « maîtrisé »', () => {
		// Éprouvé aussi sur les états INCOHÉRENTS (affiche/masque validé sans les tuiles), qu'un
		// import bancal ou une version future peut produire. Deux lectures possibles s'y séparent :
		// « la plus haute étape franchie » y placerait le mot au sommet alors que la ligne dit
		// « en cours » ; la lecture du PARCOURS (la marche atteinte avant le premier trou, celle
		// que suit `prochainModeAValider`) tient l'équivalence. C'est la seconde que l'issue
		// décrit — « un mot est à exactement une étape » — et c'est elle qui garde le sommet
		// lisible : « tous les mots au sommet » doit vouloir dire « liste acquise ».
		let maitrises = 0;
		let neufs = 0;
		for (const atelier of [false, true])
			for (const tuiles of [false, true])
				for (const motCache of [false, true])
					for (const dictee of [false, true])
						for (const dispo of [false, true]) {
							const m = motVierge();
							m.atelierFait = atelier;
							m.validation = { tuiles, motCache, dictee };
							const etiquette = `atelier=${atelier} tuiles=${tuiles} motCache=${motCache} dictee=${dictee} voix=${dispo}`;
							const rang = rangMot(m, dispo);
							expect(paliersComposition(dispo), etiquette).toContain(rang);
							expect(rang === sommet(dispo), `${etiquette} → ${rang}`).toBe(
								statutMot(m, dispo) === 'maitrise',
							);
							expect(rang === 'neuf', `${etiquette} → ${rang}`).toBe(
								statutMot(m, dispo) === 'nouveau',
							);
							if (statutMot(m, dispo) === 'maitrise') maitrises++;
							if (rang === 'neuf') neufs++;
						}
		expect(maitrises).toBeGreaterThan(2); // les deux branches sont peuplées
		expect(neufs).toBeGreaterThan(2);
	});
});

/* ============================================================
   3. Rang à une date PASSÉE — critères 10, 23
   ============================================================ */
describe('rangMot à une date passée', () => {
	const m = () => motProgresse(['atelier', le(1)], ['tuiles', le(4)], ['motCache', le(9)]);

	it('remonte l’escalier à mesure que la date avance', () => {
		expect(rangMot(m(), true, le(0))).toBe('neuf');
		expect(rangMot(m(), true, le(3))).toBe('atelier');
		expect(rangMot(m(), true, le(6))).toBe('tuiles');
		expect(rangMot(m(), true, le(20))).toBe('motCache');
	});

	it('`at` est une borne EXCLUSIVE : un franchissement à l’instant pile n’y est pas encore', () => {
		// Même convention de temps que la frise des états (critère 8) : un cap posé le lundi
		// 00:00 ouvre la semaine suivante, il ne clôt pas la précédente. La frise lira donc le
		// rang à la FIN (exclue) de chaque semaine.
		expect(rangMot(m(), true, le(4))).toBe('atelier');
		expect(rangMot(m(), true, le(4) + 1)).toBe('tuiles');
	});

	it('critère 23 : une étape franchie SANS date est réputée franchie AVANT, jamais reconstituée', () => {
		// Le profil existant : ses mots portent des booléens et aucune date. On ne devine pas
		// quand ils sont montés — on les tient pour montés depuis toujours, et c'est la BORNE de
		// mise en service qui empêche d'en tirer une affirmation sur les semaines anciennes.
		const ancien = motAncien('atelier', 'tuiles');
		for (const quand of [le(-1000), le(0), le(5), le(9999)])
			expect(rangMot(ancien, true, quand), String(quand)).toBe('tuiles');
		expect(dateFranchissement(ancien, 'atelier')).toBeNull();
		expect(dateFranchissement(ancien, 'tuiles')).toBeNull();
	});

	it('mot MIXTE : une marche ancienne non datée, la suivante datée', () => {
		// Cas réel d'un profil existant qui continue à travailler : l'atelier est d'avant le
		// datage, les tuiles sont d'après. Avant la validation des tuiles, le mot est à l'atelier.
		const m2 = motAncien('atelier');
		validerMode(m2, 'tuiles', le(6));
		expect(rangMot(m2, true, le(3))).toBe('atelier');
		expect(rangMot(m2, true, le(8))).toBe('tuiles');
	});

	it('INVARIANT : le rang d’un mot ne redescend jamais quand la date avance', () => {
		// Un mot ne perd jamais une étape (`validerMode` ne pose que `true`) : la seule façon de
		// voir une composition reculer est que le parent AJOUTE un mot à la liste.
		const mots = [
			motVierge(),
			motAncien('atelier'),
			motAncien('atelier', 'tuiles', 'motCache', 'dictee'),
			motProgresse(['atelier', le(2)], ['tuiles', le(2)]), // deux marches le même jour
			motProgresse(['atelier', le(1)], ['tuiles', le(5)], ['motCache', le(5)], ['dictee', le(12)]),
			(() => {
				const mixte = motAncien('atelier');
				validerMode(mixte, 'tuiles', le(7));
				return mixte;
			})(),
		];
		let montees = 0;
		for (const [i, mot] of mots.entries())
			for (const dispo of [false, true]) {
				const paliers = paliersComposition(dispo);
				if (rangMot(mot, dispo) !== 'neuf') montees++;
				let precedent = -1;
				for (let j = -2; j <= 20; j++) {
					const index = paliers.indexOf(rangMot(mot, dispo, le(j)));
					expect(index, `mot ${i} voix=${dispo} jour ${j}`).toBeGreaterThanOrEqual(precedent);
					precedent = index;
				}
				// Et le dernier rang atteint est bien celui d'aujourd'hui.
				expect(rangMot(mot, dispo, le(20)), `mot ${i} voix=${dispo}`).toBe(rangMot(mot, dispo));
			}
		// Prémisse : une rangée de mots tous « neufs » satisferait la croissance sans rien dire.
		expect(montees).toBeGreaterThan(8);
	});
});

/* ============================================================
   4. Composition d'un ensemble de mots — critères 5, 6, 7, 13
   ============================================================ */
describe('composition — la répartition entre les rangs', () => {
	it('répartit chaque mot à son rang, et la somme vaut le total', () => {
		const mots = [
			motVierge(),
			motVierge(),
			motProgresse(['atelier', le(1)]),
			motProgresse(['atelier', le(1)], ['tuiles', le(2)]),
			motProgresse(['atelier', le(1)], ['tuiles', le(2)], ['motCache', le(3)]),
		];
		const c = composition(mots, false);
		expect(c.paliers).toEqual(SANS_VOIX);
		expect(c.compte).toEqual(compte(SANS_VOIX, { neuf: 2, atelier: 1, tuiles: 1, motCache: 1 }));
		expect(c.total).toBe(5);
		expect(c.compte.reduce((a, b) => a + b, 0)).toBe(c.total);
	});

	it('les mots ATTENDUS non matérialisés comptent dans le total, au bas de l’escalier', () => {
		const c = composition([undefined, undefined, motProgresse(['atelier', le(1)])], true);
		expect(c.total).toBe(3);
		expect(c.compte).toEqual(compte(AVEC_VOIX, { neuf: 2, atelier: 1 }));
	});

	it('aucun mot attendu : total 0 et rangs à zéro (rien à répartir, pas une erreur)', () => {
		const c = composition([], true);
		expect(c.total).toBe(0);
		expect(c.compte).toEqual(compte(AVEC_VOIX, {}));
		expect(c.paliers).toEqual(AVEC_VOIX);
	});

	it('critère 5 : deux listes de 10 aux avancements opposés ne se ressemblent pas', () => {
		const neuves = Array.from({ length: 10 }, () => motVierge());
		const presqueFinies = Array.from({ length: 10 }, (_, i) =>
			i < 9
				? motProgresse(
						['atelier', le(1)],
						['tuiles', le(2)],
						['motCache', le(3)],
						['dictee', le(4)],
					)
				: motVierge(),
		);
		expect(composition(neuves, true).compte).toEqual(compte(AVEC_VOIX, { neuf: 10 }));
		expect(composition(presqueFinies, true).compte).toEqual(
			compte(AVEC_VOIX, { neuf: 1, dictee: 9 }),
		);
	});

	it('critère 7 : sans voix, aucun mot n’est jamais rangé « dictée », et le sommet est atteint', () => {
		const finis = Array.from({ length: 4 }, () =>
			motProgresse(['atelier', le(1)], ['tuiles', le(2)], ['motCache', le(3)], ['dictee', le(4)]),
		);
		const c = composition(finis, false);
		expect(c.paliers).not.toContain('dictee');
		expect(c.compte).toEqual(compte(SANS_VOIX, { motCache: 4 })); // tous au sommet
		expect(c.compte).toHaveLength(SANS_VOIX.length); // pas de colonne surnuméraire
	});

	it('critère 23 : les mots d’avant le datage sont répartis sur leurs booléens, sans date inventée', () => {
		const c = composition(
			[motAncien('atelier'), motAncien('atelier', 'tuiles'), motVierge()],
			false,
		);
		expect(c.compte).toEqual(compte(SANS_VOIX, { neuf: 1, atelier: 1, tuiles: 1 }));
	});

	it('à une date passée, la répartition est celle du moment', () => {
		const mots = [
			motProgresse(['atelier', le(1)], ['tuiles', le(8)]),
			motProgresse(['atelier', le(6)]),
			motVierge(),
		];
		expect(composition(mots, false, le(3)).compte).toEqual(
			compte(SANS_VOIX, { neuf: 2, atelier: 1 }),
		);
		expect(composition(mots, false, le(7)).compte).toEqual(
			compte(SANS_VOIX, { neuf: 1, atelier: 2 }),
		);
		expect(composition(mots, false, le(20)).compte).toEqual(
			compte(SANS_VOIX, { neuf: 1, atelier: 1, tuiles: 1 }),
		);
	});
});

/* ============================================================
   5. LE critère central (6) : ça bouge sans qu'aucun mot ne devienne maîtrisé
   ============================================================ */
describe('compositionLecon — le signal que l’état d’une liste ne donne pas', () => {
	/** Liste du profil actif, avec ses mots amenés à une étape donnée. */
	function creerListe(label: string, mots: string[]): string {
		const s = loadOrtho();
		const l = createListe(
			s,
			label,
			mots.map((mot) => ({ mot })),
		);
		saveOrtho(s);
		return l.id;
	}
	/** Fait progresser les `n` premiers mots de la liste d'une marche, à l'instant donné. */
	function seance(listeId: string, n: number, etape: EtapeOrtho, quand: number): void {
		const s = loadOrtho();
		const liste = s.listes.find((l) => l.id === listeId)!;
		liste.motIds.slice(0, n).forEach((id) => franchir(s.banque[id], etape, quand));
		saveOrtho(s);
	}

	const DIX = [
		'chat',
		'chien',
		'avion',
		'ours',
		'table',
		'porte',
		'fleur',
		'route',
		'livre',
		'pomme',
	];

	it('critère 6 : trois mots passant de l’atelier aux tuiles changent la composition', () => {
		const id = creerListe('Semaine 1', DIX);
		seance(id, 10, 'atelier', le(1));
		const s1 = loadOrtho();
		const avant = compositionLecon(s1, id, false);
		const avancementAvant = avancementLecon(s1, id, false);
		expect(avant.compte).toEqual(compte(SANS_VOIX, { atelier: 10 }));

		seance(id, 3, 'tuiles', le(4));
		const s2 = loadOrtho();
		const apres = compositionLecon(s2, id, false);
		const avancementApres = avancementLecon(s2, id, false);

		// Ce que l'écran actuel montre n'a pas bougé d'un pouce…
		expect(avancementApres.niveau).toBe(avancementAvant.niveau);
		expect(avancementApres.maitrises).toBe(avancementAvant.maitrises);
		expect(avancementApres.maitrises).toBe(0);
		// … alors que trois mots ont bel et bien monté une marche.
		expect(apres.compte).toEqual(compte(SANS_VOIX, { atelier: 7, tuiles: 3 }));
		expect(apres.compte).not.toEqual(avant.compte);
	});

	it('la composition porte sur la MÊME population que l’état de la liste', () => {
		// Les deux ne doivent pas pouvoir désigner des ensembles différents : sinon le total de la
		// frise et le « x/y mots » de la ligne se contrediraient sur la même ligne.
		const id = creerListe('Semaine 2', ['chat', 'chien', 'avion']);
		seance(id, 2, 'atelier', le(1));
		const s = loadOrtho();
		expect(compositionLecon(s, id, false).total).toBe(motsAttendusLecon(s, id).length);
		expect(compositionLecon(s, id, false).total).toBe(avancementLecon(s, id, false).total);
	});

	it('leçon inconnue : total 0, et surtout pas une erreur', () => {
		expect(compositionLecon(loadOrtho(), 'inexistante', true).total).toBe(0);
	});

	it('critère 13 : un mot AJOUTÉ hier est au bas de l’escalier, et il grossit le total', () => {
		// La convention assumée : la frise montre où en étaient, chaque semaine, les mots que la
		// liste contient AUJOURD'HUI. Un mot ajouté hier fait donc « grandir » la liste
		// rétrospectivement — ce qui est vrai de LUI, et se lit en connaissant la règle.
		const id = creerListe('Semaine 3', ['chat', 'chien']);
		seance(id, 2, 'atelier', le(1));
		seance(id, 2, 'tuiles', le(2));
		const s = loadOrtho();
		const liste = s.listes.find((l) => l.id === id)!;
		liste.motIds.push(addOrGetMot(s, { mot: 'nouveau' }).id);
		saveOrtho(s);
		const c = compositionLecon(loadOrtho(), id, false, le(3));
		expect(c.total).toBe(3);
		expect(c.compte).toEqual(compte(SANS_VOIX, { neuf: 1, tuiles: 2 }));
	});
});

/* ============================================================
   6. Le datage lui-même — critères 1, 2, 3
   ============================================================ */
describe('datage des franchissements', () => {
	it('critère 1 : l’ordre des marches d’un mot reste lisible après coup', () => {
		// L'atelier le lundi, les tuiles le jeudi : le stockage doit dire lequel est arrivé en
		// premier — c'est tout ce qui manquait pour reconstruire une semaine ancienne.
		const m = motProgresse(['atelier', le(0)], ['tuiles', le(3)]);
		expect(dateFranchissement(m, 'atelier')).toBe(le(0));
		expect(dateFranchissement(m, 'tuiles')).toBe(le(3));
		expect(dateFranchissement(m, 'atelier')!).toBeLessThan(dateFranchissement(m, 'tuiles')!);
		// Une étape non franchie n'a pas de date, et ne s'invente pas une.
		expect(dateFranchissement(m, 'motCache')).toBeNull();
		expect(dateFranchissement(m, 'dictee')).toBeNull();
	});

	it('critère 1 : les quatre marches coexistent, aucune n’écrase la précédente', () => {
		const m = motProgresse(
			['atelier', le(0)],
			['tuiles', le(1)],
			['motCache', le(2)],
			['dictee', le(3)],
		);
		expect(ETAPES.map((e) => dateFranchissement(m, e))).toEqual([le(0), le(1), le(2), le(3)]);
	});

	it('critère 2 : un mot rejoué en août ne réécrit pas sa date de juin', () => {
		const m = motProgresse(['atelier', le(0)], ['tuiles', le(2)]);
		marquerAtelierFait(m, le(60));
		for (const mode of MODES) validerMode(m, mode, le(60));
		expect(dateFranchissement(m, 'atelier')).toBe(le(0));
		expect(dateFranchissement(m, 'tuiles')).toBe(le(2));
		// Les marches franchies POUR LA PREMIÈRE FOIS ce jour-là, elles, sont datées de ce jour.
		expect(dateFranchissement(m, 'motCache')).toBe(le(60));
		expect(dateFranchissement(m, 'dictee')).toBe(le(60));
	});

	it('critère 2 : seule la PREMIÈRE date compte, même si une plus ancienne arrive après', () => {
		// Horloge de l'appareil remise en arrière, session reprise d'un onglet resté ouvert : la
		// date déjà posée fait foi, sinon la frise verrait un mot « redescendre » dans le temps.
		const m = motProgresse(['tuiles', le(10)]);
		validerMode(m, 'tuiles', le(1));
		expect(dateFranchissement(m, 'tuiles')).toBe(le(10));
	});

	it('critère 3 : après un parcours complet, aucune étape franchie n’est sans date', () => {
		const m = motVierge();
		marquerAtelierFait(m, le(0));
		validerMode(m, 'tuiles', le(1));
		validerMode(m, 'motCache', le(2));
		validerMode(m, 'dictee', le(3));
		// Puis la révision espacée rejoue le mot (elle ne valide pas de mode, mais elle passe par
		// les mêmes fonctions si un jour elle le fait).
		validerMode(m, 'motCache', le(30));
		for (const etape of ETAPES) {
			const franchie = etape === 'atelier' ? m.atelierFait : m.validation[etape];
			expect(franchie, etape).toBe(true);
			expect(dateFranchissement(m, etape), etape).not.toBeNull();
		}
	});

	it('critère 3 : les deux fonctions datent SANS que l’appelant ait à le demander', () => {
		// Le point structurel : la date est écrite par la fonction qui fait progresser le mot. Un
		// appelant qui ne connaît pas #545 date quand même.
		const m = motVierge();
		marquerAtelierFait(m, le(5));
		expect(m.atelierFait).toBe(true);
		expect(dateFranchissement(m, 'atelier')).toBe(le(5));
		validerMode(m, 'tuiles', le(5));
		expect(dateFranchissement(m, 'tuiles')).toBe(le(5));
	});

	it('une date illisible (import bancal) vaut absence, elle ne colore rien', () => {
		// Passe par le STOCKAGE, seul chemin par lequel une valeur non numérique peut entrer.
		const uuid = activeProfile().uuid;
		lsSetRaw(
			uuid + '/' + ORTHO_KEY,
			JSON.stringify({
				banque: {
					x: {
						...motVierge('brut'),
						id: 'x',
						atelierFait: true,
						franchissements: { atelier: 'hier' },
					},
				},
				listes: [],
				motIdParForme: {},
			}),
		);
		const relu = loadOrthoFor(uuid).banque.x;
		expect(dateFranchissement(relu, 'atelier')).toBeNull();
		expect(rangMot(relu, true)).toBe('atelier'); // le booléen, lui, reste vrai
	});
});

/* ============================================================
   6 bis. GATE du critère 3 : la date ne peut pas être contournée
   ------------------------------------------------------------
   « Aucun chemin ne peut faire progresser un mot sans le dater : la date est écrite par la
   fonction qui fait progresser le mot, pas par son appelant. » Mécanisable en lisant `src/`
   comme du texte : un module qui pose `atelierFait = true` ou `validation[…] = true` de sa
   propre main court-circuite le datage, et rien ne le signalerait — la frise se contenterait
   d'un trou, des semaines plus tard.
   Ce qu'il ne prouve PAS : qu'aucune écriture détournée n'existe (un `Object.assign`, une
   copie d'objet). La garantie complète demanderait de rendre `MotOrtho` immuable hors du
   runner ; le gate attrape la forme que le code écrit réellement.
   ============================================================ */
describe('gate — seule la fonction de progression écrit les booléens d’étape', () => {
	const AUTORISES = ['src/core/orthographe/runner.ts']; // marquerAtelierFait / validerMode

	function fichiersTs(dossier: string): string[] {
		return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
			const chemin = `${dossier}/${e.name}`;
			if (e.isDirectory()) return fichiersTs(chemin);
			return e.isFile() && e.name.endsWith('.ts') ? [chemin] : [];
		});
	}

	it('aucun module de src/ hors du runner ne pose `atelierFait` ni `validation[…]`', () => {
		const ECRITURES = [/\.atelierFait\s*=[^=]/, /\.validation\s*(\[[^\]]*\])?\s*=[^=]/];
		const coupables = fichiersTs('src')
			.filter((f) => !AUTORISES.includes(f.replace(/\\/g, '/')))
			.filter((f) => {
				const source = readFileSync(f, 'utf8');
				return ECRITURES.some((re) => re.test(source));
			});
		expect(coupables).toEqual([]);
	});

	it('prémisse du gate : le runner, lui, écrit bien ces booléens (le motif est le bon)', () => {
		const source = readFileSync(AUTORISES[0], 'utf8');
		expect(/\.atelierFait\s*=[^=]/.test(source)).toBe(true);
		expect(/\.validation\s*\[[^\]]*\]\s*=[^=]/.test(source)).toBe(true);
	});
});

/* ============================================================
   7. Borne de mise en service du datage — critères 9, 11, 23
   ============================================================ */
describe('debutSuiviEtapes — depuis quand une semaine est affirmable', () => {
	it('la borne stockée seule (enfant qui débute, aucune marche franchie)', () => {
		expect(debutSuiviEtapes(le(3), {})).toBe(le(3));
	});

	it('un franchissement PLUS ANCIEN que la borne fait foi contre elle (import d’une sauvegarde)', () => {
		const banque = { a: motProgresse(['atelier', le(1)], ['tuiles', le(9)]) };
		expect(debutSuiviEtapes(le(6), banque)).toBe(le(1));
	});

	it('la borne PLUS ANCIENNE que tout franchissement l’emporte (l’enfant n’avait rien monté)', () => {
		expect(debutSuiviEtapes(le(0), { a: motProgresse(['atelier', le(4)]) })).toBe(le(0));
	});

	it('critère 23 : ni borne ni date → Infinity, jamais une borne inventée', () => {
		expect(debutSuiviEtapes(null, {})).toBe(Infinity);
		expect(debutSuiviEtapes(undefined, { a: motAncien('atelier', 'tuiles') })).toBe(Infinity);
		for (const pourri of ['2026-06-01', NaN, Infinity, {}, true])
			expect(debutSuiviEtapes(pourri, {}), String(pourri)).toBe(Infinity);
	});

	it('l’epoch (0) est une borne VALIDE, pas une absence', () => {
		expect(debutSuiviEtapes(0, {})).toBe(0);
	});

	it('la fin de séance pose la borne, une seule fois, sous SA propre clé', () => {
		const uuid = activeProfile().uuid;
		expect(lsGetRaw(uuid + '/' + ORTHO_ETAPES_DEBUT_KEY, null)).toBeNull();
		journaliserPaliersOrtho(false, le(5));
		expect(lsGetRaw(uuid + '/' + ORTHO_ETAPES_DEBUT_KEY, null)).toBe(le(5));
		journaliserPaliersOrtho(false, le(9)); // séance suivante : la mise en service ne bouge plus
		expect(lsGetRaw(uuid + '/' + ORTHO_ETAPES_DEBUT_KEY, null)).toBe(le(5));
		// Trois bornes DISTINCTES, et c'est voulu : ce journal-ci est le plus récent des trois.
		expect(new Set([ORTHO_ETAPES_DEBUT_KEY, ORTHO_PALIERS_DEBUT_KEY, ORTHO_PALIERS_KEY]).size).toBe(
			3,
		);
	});

	it('la borne est posée MÊME quand la séance ne fait franchir aucune étape', () => {
		// Sans ça, une liste dont l'enfant ne fait plus qu'entretenir les mots n'aurait jamais de
		// semaine connue, faute du moindre franchissement à dater.
		const s = loadOrtho();
		createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		saveOrtho(s);
		journaliserPaliersOrtho(false, le(2));
		expect(lsGetRaw(activeProfile().uuid + '/' + ORTHO_ETAPES_DEBUT_KEY, null)).toBe(le(2));
	});
});

/* ============================================================
   8. Le datage suit le profil — critère 4
   ============================================================ */
describe('critère 4 — le datage part dans la sauvegarde et meurt avec le profil', () => {
	/** Liste travaillée : deux mots à l'atelier, un aux tuiles, dates réelles. */
	function listeTravaillee(): string {
		const s = loadOrtho();
		const l = createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }]);
		l.motIds.forEach((id) => marquerAtelierFait(s.banque[id], le(1)));
		validerMode(s.banque[l.motIds[0]], 'tuiles', le(4));
		saveOrtho(s);
		journaliserPaliersOrtho(false, le(4));
		return l.id;
	}
	const datesDe = (uuid: string, listeId: string): (number | null)[] => {
		const s = loadOrthoFor(uuid);
		return s.listes
			.find((l) => l.id === listeId)!
			.motIds.flatMap((id) => ETAPES.map((e) => dateFranchissement(s.banque[id], e)));
	};

	it('export puis réimport : la frise ne repart pas de zéro', () => {
		const cible = activeProfile();
		const listeId = listeTravaillee();
		const avantDates = datesDe(cible.uuid, listeId);
		const avantCompo = listesOrthoProfil(cible, false, le(10)).find(
			(l) => l.id === listeId,
		)!.composition;
		expect(avantDates).toContain(le(1)); // prémisse : il y a bien quelque chose à sauvegarder
		expect(avantDates).toContain(le(4));
		// Et une frise à perdre : sans cette prémisse, deux frises VIDES se compareraient égales.
		expect(avantCompo!.semaines.some((c) => c !== null)).toBe(true);

		addProfile('Cadette'); // il faut deux profils pour pouvoir en supprimer un
		const sauvegarde = exportProfiles(listProfiles().map((p) => p.uuid));
		expect(deleteProfile(cible.uuid)).toBe(true);
		expect(loadOrthoFor(cible.uuid).banque).toEqual({}); // le profil supprimé n'a plus rien
		expect(appKeys().some((k) => k.startsWith(cible.uuid + '/'))).toBe(false);

		expect(importProfiles(sauvegarde)).not.toBeNull();
		expect(datesDe(cible.uuid, listeId)).toEqual(avantDates);
		expect(lsGetRaw(cible.uuid + '/' + ORTHO_ETAPES_DEBUT_KEY, null)).toBe(le(4));
		const restaure = listProfiles().find((p) => p.uuid === cible.uuid)!;
		const apresCompo = listesOrthoProfil(restaure, false, le(10)).find(
			(l) => l.id === listeId,
		)!.composition;
		expect(apresCompo).toEqual(avantCompo);
	});

	it('la borne du datage entre dans l’export parce qu’elle est préfixée `ludaskia_`', () => {
		// C'est le filtre d'`appKeys()` : une clé mal nommée serait absente de la sauvegarde et
		// survivrait à la suppression du profil, sans que rien ne le dise.
		expect(ORTHO_ETAPES_DEBUT_KEY.startsWith('ludaskia_')).toBe(true);
		expect(ORTHO_KEY.startsWith('ludaskia_')).toBe(true);
	});
});
