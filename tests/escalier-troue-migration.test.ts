/* ============================================================
   #640 (lot de suite) — RÉPARATION DES ESCALIERS TROUÉS HÉRITÉS, À LA LECTURE.

   Tests écrits AVANT l'implémentation, depuis le commentaire daté du 2026-09-07 de
   l'issue #640 (qui fait foi comme les critères gelés), jamais depuis le code.

   LE DÉFAUT. Une banque écrite avant #641 — quand `validerMode` ne cumulait pas —
   peut porter un mot à escalier TROUÉ : `{ tuiles: false, motCache: true }`. Un tel
   mot rendait le critère 18 (« aucune marche validée sans les précédentes »)
   intenable, puisque le combler sans réussite violait le critère 16 et le dé-valider
   le critère 9.

   LA RÉPARATION DÉCIDÉE. On applique RÉTROACTIVEMENT le cumul de #641 à la lecture de
   l'état : un mot qui a validé `motCache` a de fait prouvé `tuiles`, donc il y a bien
   eu une réussite — celle de la marche haute. Elle vit dans `parseOrtho`, donc elle
   vaut pour TOUTE lecture, `loadOrtho` comme `loadOrthoFor` (l'espace encadrant doit
   voir le même état que l'enfant).

   CE QUI EST ÉPROUVÉ ICI, et pourquoi chaque point compte :
   1. la marche du dessous est comblée (l'escalier n'a plus de trou) ;
   2. elle reprend LA DATE DE LA MARCHE HAUTE, jamais la date du jour. C'est le point
      le plus important du lot : dater d'aujourd'hui ferait affirmer à la frise de
      composition de l'espace encadrant une séance de travail qui n'a jamais eu lieu.
      Éprouvé deux fois — sur la date elle-même, et sur la frise que le parent lit ;
   3. quand aucune date n'est connue (banque d'avant #545), aucune date n'est INVENTÉE ;
   4. rien n'est jamais dé-validé, un escalier sain n'est pas touché, et relire deux
      fois donne le même état (une réparation qui daterait « maintenant » dériverait à
      chaque lecture) ;
   5. l'atelier, lui, ne se répare pas : une réussite prouve les marches plus étayées,
      elle ne prouve pas la séance de découverte (qui dessine, et fait ENTRER le mot en
      rotation d'espacement — cf. `marquerAtelierFait`).

   COMMENT L'ÉTAT TROUÉ EST POSÉ : par `lsSetRaw`, en JSON brut, comme le ferait un
   vrai localStorage hérité (même parti pris que `etapes-ortho.test.ts`). Aucun chemin
   d'écriture de l'appli n'est emprunté — c'est la LECTURE qu'on éprouve, et un état
   troué n'est plus fabricable depuis #641.

   ON N'ÉPROUVE PAS ICI le nom ni la signature de la fonction de réparation : le
   contrat de surface est le comportement de `loadOrtho`/`loadOrthoFor`.
   ============================================================ */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { setOnDataWrite, lsSetRaw } from '../src/core/storage';
import {
	initProfiles,
	activeProfile,
	addProfile,
	listProfiles,
	touchActiveProfile,
} from '../src/core/profiles';
import { loadOrtho, loadOrthoFor, saveOrtho, ORTHO_KEY } from '../src/core/orthographe/store';
import { ORDRE_MODES, validerMode } from '../src/core/orthographe/runner';
import { dateFranchissement, rangMot, ORDRE_ETAPES } from '../src/core/orthographe/etapes';
import { friseComposition } from '../src/core/encadrant-stats';
import { motsAttendusLecon } from '../src/core/orthographe/progression';
import { JOUR } from '../src/core/revision';
import type {
	MotOrtho,
	ModeOrtho,
	OrthoState,
	Franchissements,
} from '../src/core/orthographe/types';

/* ---------- Horloge figée ----------
   « La date du jour » doit être une valeur NOMMÉE dans les assertions : c'est elle
   qu'aucune marche comblée ne doit porter. */
const T0 = new Date(2026, 8, 7, 9, 0).getTime(); // lundi 7 septembre 2026, 9 h
let maintenant = T0;

beforeEach(() => {
	maintenant = T0;
	vi.spyOn(Date, 'now').mockImplementation(() => maintenant);
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});
afterEach(() => {
	vi.restoreAllMocks();
});

/* ---------- Fabrique d'état HÉRITÉ ---------- */
interface SpecMot {
	id: string;
	mot: string;
	atelierFait?: boolean; // défaut : oui (mot découvert)
	validation: Partial<Record<ModeOrtho, boolean>>;
	franchissements?: Franchissements; // absent = banque d'avant #545
}

/** Un mot de banque tel que le stockage en porte, posé EN CLAIR. */
function motStocke(sp: SpecMot): MotOrtho {
	return {
		id: sp.id,
		mot: sp.mot,
		entourage: [],
		atelierFait: sp.atelierFait ?? true,
		validation: { tuiles: false, motCache: false, dictee: false, ...sp.validation },
		...(sp.franchissements ? { franchissements: sp.franchissements } : {}),
		revision: { palier: 2, prochaineRevision: T0 + 3 * JOUR, reussites: 2, dernierTest: T0 - JOUR },
		origine: 'liste',
	};
}

/** Écrit BRUTALEMENT l'état ortho d'un profil (aucun chemin d'écriture de l'appli), avec
    une liste qui contient tous les mots — c'est elle que lit la frise du parent. */
function semerBanque(specs: SpecMot[], uuid = activeProfile().uuid, listeId = 'L1'): OrthoState {
	const banque: Record<string, MotOrtho> = {};
	const motIdParForme: Record<string, string> = {};
	for (const sp of specs) {
		banque[sp.id] = motStocke(sp);
		motIdParForme[sp.mot.toLowerCase()] = sp.id;
	}
	const state: OrthoState = {
		banque,
		listes: [
			{
				id: listeId,
				label: 'Semaine 1',
				motIds: specs.map((s) => s.id),
				createdAt: T0 - 100 * JOUR,
				updatedAt: T0 - 100 * JOUR,
			},
		],
		motIdParForme,
	};
	lsSetRaw(uuid + '/' + ORTHO_KEY, JSON.stringify(state));
	return state;
}

/** Le mot tel que l'APPLI le lit (c'est là que la réparation doit avoir eu lieu). */
const lu = (id: string): MotOrtho => loadOrtho().banque[id];

/** L'escalier a-t-il un TROU : une marche validée sans toutes celles du dessous ?
    (Critère 18, lu sur l'état d'un mot — même lecture que `revision-marche-due.test.ts`.) */
function troue(m: MotOrtho): boolean {
	const franchies = ORDRE_MODES.map((mode) => m.validation[mode]);
	const premierFaux = franchies.indexOf(false);
	return premierFaux >= 0 && franchies.slice(premierFaux).includes(true);
}

/** Tout ce qu'un lecteur peut observer d'un mot, hors représentation interne : sert à dire
    « ce mot n'a pas été touché » sans figer la forme exacte de l'objet stocké. */
function observables(m: MotOrtho): unknown {
	return {
		id: m.id,
		mot: m.mot,
		atelierFait: m.atelierFait,
		validation: { ...m.validation },
		dates: ORDRE_ETAPES.map((e) => dateFranchissement(m, e)),
		revision: { ...m.revision },
	};
}

/* ============================================================
   1. LE TROU EST COMBLÉ — la marche haute vaut preuve des plus étayées
   ============================================================ */
describe('#640 — un escalier troué hérité est réparé à la lecture', () => {
	it('« mot caché validé, tuiles non » : les tuiles sont validées à la lecture', () => {
		semerBanque([{ id: 'w', mot: 'cheval', validation: { motCache: true } }]);
		// Le mot caché demande d'écrire de mémoire ; les tuiles fournissent toutes les
		// lettres. Qui a fait le premier a fait, de fait, ce que le second demande (#641).
		expect(lu('w').validation).toEqual({ tuiles: true, motCache: true, dictee: false });
		expect(troue(lu('w'))).toBe(false);
	});

	it('« dictée validée, rien en dessous » : les DEUX marches du dessous sont validées', () => {
		semerBanque([{ id: 'w', mot: 'cheval', validation: { dictee: true } }]);
		expect(lu('w').validation).toEqual({ tuiles: true, motCache: true, dictee: true });
	});

	it('un escalier déjà cohérent n’est pas touché', () => {
		// Garde-fou : la réparation ne doit pas être une réécriture générale de la banque.
		const dates: Franchissements = { atelier: T0 - 90 * JOUR, tuiles: T0 - 80 * JOUR };
		const sain = motStocke({
			id: 'w',
			mot: 'cheval',
			validation: { tuiles: true },
			franchissements: dates,
		});
		semerBanque([{ id: 'w', mot: 'cheval', validation: { tuiles: true }, franchissements: dates }]);
		expect(observables(lu('w'))).toEqual(observables(sain));
	});

	it('un mot dont l’ATELIER n’est pas fait n’est pas réparé en mot découvert', () => {
		// L'atelier n'est pas une marche de plus sur le même gradient : on y dessine, et il
		// fait ENTRER le mot en rotation d'espacement. Une réussite en mode ne le prouve pas,
		// et l'inventer ferait démarrer un compteur d'espacement qui n'a jamais démarré.
		semerBanque([{ id: 'w', mot: 'cheval', atelierFait: false, validation: { motCache: true } }]);
		const m = lu('w');
		expect(m.atelierFait).toBe(false);
		expect(rangMot(m, true)).toBe('neuf'); // le parcours de l'enfant commence toujours par l'atelier
	});
});

/* ============================================================
   2. LA DATE — le point le plus important du lot
   ============================================================ */
describe('#640 — la marche comblée reprend la date de la marche haute', () => {
	it('la marche comblée porte la date de la marche qui la prouve, PAS celle du jour', () => {
		const dateHaute = T0 - 60 * JOUR;
		semerBanque([
			{
				id: 'w',
				mot: 'cheval',
				validation: { motCache: true },
				franchissements: { atelier: T0 - 90 * JOUR, motCache: dateHaute },
			},
		]);
		const m = lu('w');
		// La réussite qui prouve les tuiles a eu lieu il y a deux mois : c'est cette
		// séance-là qui a fait franchir la marche, pas celle d'aujourd'hui.
		expect(dateFranchissement(m, 'tuiles')).toBe(dateHaute);
		expect(dateFranchissement(m, 'tuiles')).not.toBe(T0);
		// Et la marche haute garde SA date (monotonie #545).
		expect(dateFranchissement(m, 'motCache')).toBe(dateHaute);
		expect(dateFranchissement(m, 'atelier')).toBe(T0 - 90 * JOUR);
	});

	it('deux marches comblées d’un coup : aucune n’est datée d’aujourd’hui', () => {
		const dateDictee = T0 - 40 * JOUR;
		semerBanque([
			{
				id: 'w',
				mot: 'cheval',
				validation: { dictee: true },
				franchissements: { atelier: T0 - 90 * JOUR, dictee: dateDictee },
			},
		]);
		const m = lu('w');
		for (const mode of ['tuiles', 'motCache'] as ModeOrtho[]) {
			// La seule séance dont on soit sûr est celle de la dictée : c'est elle qui a prouvé
			// les deux marches du dessous, donc c'est sa date qu'elles portent.
			expect(dateFranchissement(m, mode), `marche ${mode}`).toBe(dateDictee);
			expect(dateFranchissement(m, mode), `marche ${mode}`).not.toBe(T0);
		}
		// Les dates restent CROISSANTES le long de l'escalier : une marche du bas ne peut pas
		// avoir été franchie après celle du haut, sinon la frise du parent lit un parcours
		// qui remonte à l'envers.
		const dates = ORDRE_ETAPES.map((e) => dateFranchissement(m, e)).filter(
			(d): d is number => d !== null,
		);
		expect([...dates].sort((a, b) => a - b)).toEqual(dates);
	});

	it('banque d’avant #545 (aucune date) : la marche est comblée SANS date inventée', () => {
		semerBanque([{ id: 'w', mot: 'cheval', validation: { motCache: true } }]);
		const m = lu('w');
		expect(m.validation.tuiles).toBe(true); // la marche est bien comblée…
		// … et rien n'est reconstitué : « franchie avant la mise en service du suivi » est
		// l'aveu d'ignorance que le modèle assume déjà (cf. `types.ts`, critère 23 de #545).
		expect(dateFranchissement(m, 'tuiles')).toBeNull();
		expect(dateFranchissement(m, 'motCache')).toBeNull();
	});

	it('marche haute NON datée mais atelier daté : la marche comblée n’emprunte pas la date de l’atelier', () => {
		// Piège : prendre « la dernière date connue » au lieu de la date de la marche qui
		// prouve. L'atelier d'un mot peut être daté (il l'a été le premier) sans qu'aucun
		// mode le soit. Dater les tuiles de la séance d'atelier affirmerait que l'enfant a
		// reconstitué le mot le jour où il l'a découvert.
		semerBanque([
			{
				id: 'w',
				mot: 'cheval',
				validation: { motCache: true },
				franchissements: { atelier: T0 - 90 * JOUR },
			},
		]);
		const m = lu('w');
		expect(m.validation.tuiles).toBe(true);
		expect(dateFranchissement(m, 'tuiles')).toBeNull();
	});

	it('la frise de composition du parent ne montre aucune séance cette semaine', () => {
		// L'exigence telle que le parent la vit : rien n'a bougé pour ce mot depuis deux mois,
		// donc la colonne de la semaine en cours doit dire la MÊME chose que la précédente.
		// C'est ce test qui distingue les trois mondes possibles :
		//   - sans réparation, le mot est au rang « atelier » partout (le parent ne voit pas
		//     un travail réellement fourni) ;
		//   - avec une réparation datée d'AUJOURD'HUI, la dernière colonne saute d'un rang
		//     et le parent lit une séance de travail qui n'a jamais eu lieu ;
		//   - avec la réparation décidée, le mot est au rang « mot caché » dans les deux.
		const dateHaute = T0 - 60 * JOUR;
		semerBanque([
			{
				id: 'w',
				mot: 'cheval',
				validation: { motCache: true },
				franchissements: { atelier: T0 - 90 * JOUR, motCache: dateHaute },
			},
		]);
		const state = loadOrtho();
		const frise = friseComposition(
			motsAttendusLecon(state, 'L1'),
			true,
			T0 - 200 * JOUR, // suivi en service depuis longtemps : aucune colonne inconnue
			T0,
		);
		expect(frise).not.toBeNull();
		const rangMotCache = frise!.paliers.indexOf('motCache');
		const semaines = frise!.semaines;
		const derniere = semaines[semaines.length - 1];
		const precedente = semaines[semaines.length - 2];
		// La semaine en cours place le mot au rang qu'il a réellement atteint…
		expect(derniere?.[rangMotCache]).toBe(1);
		// … et la semaine d'avant aussi : aucun mouvement à raconter.
		expect(precedente).toEqual(derniere);
	});
});

/* ============================================================
   3. STABILITÉ — rien n'est perdu, et relire ne dérive pas
   ============================================================ */
describe('#640 — la réparation ne perd rien et ne dérive pas', () => {
	it('relire DEUX FOIS, à deux instants différents, donne le même état', () => {
		// Le garde-fou d'une réparation qui daterait « maintenant » : elle produirait un état
		// différent à chaque lecture, donc une frise qui bouge sans que l'enfant travaille.
		semerBanque([{ id: 'w', mot: 'cheval', validation: { motCache: true } }]);
		const premiere = observables(lu('w'));
		maintenant = T0 + 3 * JOUR; // l'enfant rouvre l'appli trois jours plus tard
		expect(observables(lu('w'))).toEqual(premiere);
	});

	it('relire un état DÉJÀ réparé et resauvegardé ne le change plus (idempotence)', () => {
		semerBanque([
			{
				id: 'w',
				mot: 'cheval',
				validation: { motCache: true },
				franchissements: { atelier: T0 - 90 * JOUR, motCache: T0 - 60 * JOUR },
			},
		]);
		const premier = loadOrtho();
		saveOrtho(premier); // ce que fait n'importe quelle séance qui écrit
		maintenant = T0 + 10 * JOUR;
		expect(observables(loadOrtho().banque.w)).toEqual(observables(premier.banque.w));
	});

	it('aucune marche n’est jamais DÉ-validée', () => {
		// Le critère 9 vu depuis la migration : réparer, c'est ajouter, jamais retirer.
		semerBanque([
			{ id: 'a', mot: 'cheval', validation: { motCache: true } },
			{ id: 'b', mot: 'train', validation: { dictee: true } },
			{ id: 'c', mot: 'oiseau', validation: { tuiles: true, dictee: true } },
		]);
		const avant = { a: { motCache: true }, b: { dictee: true }, c: { tuiles: true, dictee: true } };
		const etat = loadOrtho();
		for (const [id, modes] of Object.entries(avant)) {
			for (const mode of Object.keys(modes) as ModeOrtho[]) {
				expect(etat.banque[id].validation[mode], `${id}/${mode}`).toBe(true);
			}
		}
	});

	it('l’espace encadrant (`loadOrthoFor`) voit le MÊME état réparé', () => {
		// La réparation vit dans `parseOrtho`, donc dans TOUTE lecture : sinon le parent et
		// l'enfant liraient deux escaliers différents pour le même mot, et la banque du
		// profil consulté contredirait la frise de sa propre leçon.
		const autre = addProfile('Zoé');
		semerBanque([{ id: 'w', mot: 'cheval', validation: { motCache: true } }], autre.uuid);
		expect(listProfiles().some((p) => p.uuid === autre.uuid)).toBe(true); // prémisse
		const vuParLeParent = loadOrthoFor(autre.uuid).banque.w;
		expect(vuParLeParent.validation).toEqual({ tuiles: true, motCache: true, dictee: false });
	});

	it('les deux lectures s’accordent mot pour mot sur le même profil', () => {
		semerBanque([
			{ id: 'a', mot: 'cheval', validation: { motCache: true } },
			{ id: 'b', mot: 'train', validation: { dictee: true } },
		]);
		const parEnfant = loadOrtho().banque;
		const parParent = loadOrthoFor(activeProfile().uuid).banque;
		for (const id of ['a', 'b']) {
			expect(observables(parParent[id]), id).toEqual(observables(parEnfant[id]));
		}
	});
});

/* ============================================================
   4. ÉCHANTILLON LARGE — l'invariant du critère 18, littéralement
   ------------------------------------------------------------
   Le cadrage demande que le critère 18 tienne AU SENS LITTÉRAL après réparation. On
   énumère donc TOUT l'espace des états de `validation` (8), croisé avec les quatre
   profils de datage réellement rencontrés en banque et avec l'atelier fait ou non :
   64 mots, une seule lecture.
   ============================================================ */
type ProfilDates = 'aucune' | 'atelier-seul' | 'toutes' | 'haute-seule';
const PROFILS_DATES: ProfilDates[] = ['aucune', 'atelier-seul', 'toutes', 'haute-seule'];

/** Dates d'un mot selon le profil : on ne date JAMAIS une marche non validée, et les
    dates posées sont croissantes le long de l'escalier — c'est la seule forme que
    `validerMode` sait produire, donc la seule qu'une banque réelle porte. */
function datesDe(profil: ProfilDates, validation: Record<ModeOrtho, boolean>): Franchissements {
	if (profil === 'aucune') return {};
	const base: Franchissements = { atelier: T0 - 90 * JOUR };
	if (profil === 'atelier-seul') return base;
	const validees = ORDRE_MODES.filter((m) => validation[m]);
	if (profil === 'haute-seule') {
		const haute = validees[validees.length - 1];
		return haute ? { ...base, [haute]: T0 - 50 * JOUR } : base;
	}
	validees.forEach((m, i) => {
		base[m] = T0 - (80 - i * 10) * JOUR;
	});
	return base;
}

function echantillon(): { specs: SpecMot[]; attendu: Map<string, MotOrtho> } {
	const specs: SpecMot[] = [];
	const attendu = new Map<string, MotOrtho>();
	let n = 0;
	for (const tuiles of [false, true])
		for (const motCache of [false, true])
			for (const dictee of [false, true])
				for (const profil of PROFILS_DATES)
					for (const atelierFait of [false, true]) {
						const validation = { tuiles, motCache, dictee };
						const sp: SpecMot = {
							id: 'w' + String(++n),
							mot: 'mot' + String(n),
							atelierFait,
							validation,
							franchissements: datesDe(profil, validation),
						};
						specs.push(sp);
						attendu.set(sp.id, motStocke(sp));
					}
	return { specs, attendu };
}

describe('#640 — après réparation, l’invariant du critère 18 tient sur tout l’échantillon', () => {
	it('aucun des 64 états de banque ne laisse une marche validée sans les précédentes', () => {
		const { specs } = echantillon();
		semerBanque(specs);
		const banque = loadOrtho().banque;
		expect(Object.keys(banque)).toHaveLength(specs.length); // prémisse : tout est bien relu
		for (const sp of specs) {
			expect(troue(banque[sp.id]), `${sp.id} : ${JSON.stringify(banque[sp.id].validation)}`).toBe(
				false,
			);
		}
	});

	it('sur tout l’échantillon : rien n’est dé-validé, et l’atelier n’est jamais inventé', () => {
		const { specs, attendu } = echantillon();
		semerBanque(specs);
		const banque = loadOrtho().banque;
		for (const sp of specs) {
			const avant = attendu.get(sp.id)!;
			const apres = banque[sp.id];
			for (const mode of ORDRE_MODES) {
				if (avant.validation[mode]) expect(apres.validation[mode], `${sp.id}/${mode}`).toBe(true);
			}
			expect(apres.atelierFait, `${sp.id}/atelier`).toBe(avant.atelierFait);
		}
	});

	it('sur tout l’échantillon : AUCUNE date d’aujourd’hui n’apparaît', () => {
		// L'exigence centrale, dite sur l'ensemble de l'espace : une lecture n'est pas une
		// séance de travail. Une seule date du jour posée ici, et la frise de composition du
		// parent affiche un pic d'activité le jour de la mise à jour de l'appli.
		const { specs } = echantillon();
		semerBanque(specs);
		const banque = loadOrtho().banque;
		for (const sp of specs) {
			for (const etape of ORDRE_ETAPES) {
				expect(dateFranchissement(banque[sp.id], etape), `${sp.id}/${etape}`).not.toBe(T0);
			}
		}
	});

	it('sur tout l’échantillon : les dates restent croissantes le long de l’escalier', () => {
		// Corollaire lisible de l'exigence de datage : une marche comblée qui prendrait une
		// date POSTÉRIEURE à celle qui la prouve décrirait un escalier gravi à l'envers.
		// Éprouvé sur les seuls profils dont les dates étaient déjà croissantes — c'est-à-dire
		// tous ceux qu'une banque réelle porte, `validerMode` n'en produisant pas d'autres.
		const { specs } = echantillon();
		semerBanque(specs);
		const banque = loadOrtho().banque;
		for (const sp of specs) {
			const dates = ORDRE_ETAPES.map((e) => dateFranchissement(banque[sp.id], e)).filter(
				(d): d is number => d !== null,
			);
			expect(
				[...dates].sort((a, b) => a - b),
				`${sp.id} : ${dates.join(' → ')}`,
			).toEqual(dates);
		}
	});

	it('sur tout l’échantillon : chaque marche comblée est datée comme une marche du dessus, ou pas du tout', () => {
		// Ce qui interdit la troisième mauvaise réponse : inventer une date « plausible »
		// (hier, la date de l'atelier, le milieu de deux séances). Une date de franchissement
		// affirme une séance ; la seule séance dont on soit sûr, c'est celle de la marche
		// haute.
		const { specs, attendu } = echantillon();
		semerBanque(specs);
		const banque = loadOrtho().banque;
		let comblees = 0;
		for (const sp of specs) {
			const avant = attendu.get(sp.id)!;
			const apres = banque[sp.id];
			for (const [i, mode] of ORDRE_MODES.entries()) {
				if (avant.validation[mode] || !apres.validation[mode]) continue; // marche non comblée
				comblees++;
				const date = dateFranchissement(apres, mode);
				if (date === null) continue; // aucune date connue : rien n'a été inventé, c'est bon
				const datesDuDessus = ORDRE_MODES.slice(i + 1)
					.filter((m) => avant.validation[m])
					.map((m) => dateFranchissement(avant, m));
				expect(datesDuDessus, `${sp.id}/${mode} datée ${date} sans marche haute datée`).toContain(
					date,
				);
			}
		}
		// Prémisse, sinon le test passerait sur un échantillon où RIEN n'est comblé — c'est-à-dire
		// justement l'état d'avant la réparation.
		expect(comblees).toBeGreaterThan(0);
	});
});

/* ---------- Témoin : l'échantillon contient bien des états troués ----------
   Sans lui, les quatre tests ci-dessus passeraient aussi sur un échantillon de mots
   tous sains — donc sans rien prouver. Il porte sur l'état SEMÉ, pas sur l'état lu. */
describe('#640 — témoin de l’échantillon', () => {
	it('l’échantillon posé en stockage contient des escaliers troués (sinon rien n’est éprouvé)', () => {
		const { attendu } = echantillon();
		const troues = [...attendu.values()].filter(troue);
		expect(troues.length).toBeGreaterThan(0);
		// Les trois formes de trou existent bien : sous le mot caché, sous la dictée, et les
		// deux à la fois.
		const formes = new Set(
			troues.map((m) => ORDRE_MODES.map((x) => (m.validation[x] ? 1 : 0)).join('')),
		);
		expect(formes).toEqual(new Set(['010', '001', '011', '101']));
	});
});

/* ============================================================
   5. COROLLAIRE — une réussite ne date que ce qu'elle fait franchir
   ------------------------------------------------------------
   EXIGENCE DÉRIVÉE de la règle de datage décidée le 2026-09-07, prise par l'autre bout,
   et non écrite telle quelle dans le cadrage : à confirmer, mais sans elle la protection
   décidée ne protège rien.

   La réparation refuse d'inventer une date pour la marche comblée d'une banque d'avant
   #545. Mais `validerMode` date TOUTE marche de son cumul dépourvue de date, y compris
   une marche validée il y a des mois : la première réussite qui suit repose donc la date
   du jour sur la marche que la réparation avait laissée sans date, et la frise de
   composition affiche la séance fabriquée une séance plus tard.

   Le cas n'est pas théorique — c'est l'état de TOUTE banque d'avant #545 (marches
   validées, aucune date) — et il devient la règle après la réparation, qui fait jouer à
   ces mots une marche PLUS HAUTE que celles déjà validées.
   ============================================================ */
describe('#640 — une réussite ne date que ce qu’elle fait franchir', () => {
	it('une marche validée SANS date le reste après une réussite plus haute', () => {
		const m = motStocke({ id: 'w', mot: 'cheval', validation: { tuiles: true } });
		validerMode(m, 'dictee', T0);
		// Ce que cette séance a réellement fait franchir : la dictée, et le mot caché par le
		// cumul (#641). Les deux sont datées d'aujourd'hui, à juste titre.
		expect(dateFranchissement(m, 'dictee')).toBe(T0);
		expect(dateFranchissement(m, 'motCache')).toBe(T0);
		// Les tuiles, elles, étaient validées AVANT, et sans date : les dater d'aujourd'hui
		// affirmerait une reconstitution qui a eu lieu il y a des mois.
		expect(dateFranchissement(m, 'tuiles')).toBeNull();
	});

	it('témoin : une marche déjà DATÉE n’est pas re-datée (monotonie #545, déjà tenue)', () => {
		const m = motStocke({
			id: 'w',
			mot: 'cheval',
			validation: { tuiles: true },
			franchissements: { atelier: T0 - 90 * JOUR, tuiles: T0 - 80 * JOUR },
		});
		validerMode(m, 'dictee', T0);
		expect(dateFranchissement(m, 'tuiles')).toBe(T0 - 80 * JOUR);
	});
});
