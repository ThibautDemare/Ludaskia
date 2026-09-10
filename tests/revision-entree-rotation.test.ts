/* ============================================================
   #690 — BORNER L'ENTRÉE EN ROTATION : le gate sur les déclarations « vu en classe ».

   D'OÙ VIENNENT LES ATTENDUS. Des critères d'acceptation de l'issue, écrits AVANT
   l'implémentation. Au moment où ce fichier est posé, `promouvoirEntreesEnAttente`
   n'existe pas, `RecapRevision.enAttente` n'existe pas, et une déclaration pose encore
   `etatNeuf` (donc une échéance à J+1). Tout ce qui porte sur le comportement nouveau est
   ROUGE, et c'est le résultat attendu.

   CE QUI EST ÉPROUVÉ ICI (le budget hebdomadaire, lui, vit dans
   `revision-budget-entree.test.ts`) :
   - critère 1  : une déclaration n'a plus d'échéance, elle est HORS ROTATION ;
   - critère 2  : elle entre à son premier passage produisant des stats de leçon ;
   - critère 3  : quatre semaines d'attente donnent la PRIORITÉ entre déclarations (la
                  soupape est débitée au budget) et ouvrent un SLOT RÉSERVÉ d'une entrée
                  par semaine quand le budget ne laisse rien passer — décision du
                  mainteneur, 9 septembre 2026, détaillée au-dessus du bloc 3 ;
   - critère 7  : un élément différé n'est nulle part « dû » ni « en retard » ;
   - critère 8  : la file d'attente se COMPTE côté encadrant ;
   - critère 9  : l'annulation d'une déclaration ne détruit aucun progrès réel ;
   - critère 10 : aucun élément ne reste bloqué indéfiniment ;
   - critère 11 : rien ne sort de la liste (101 déclarées restent 101) ;
   - critère 13 : aucune migration des états DÉJÀ en rotation ;
   - critère 14 : une leçon en attente reste jouable et reste dans le périmètre du sprint.

   LECTURE RETENUE, ET L'AMBIGUÏTÉ QU'ELLE TRANCHE. Le critère 1 est écrit sans réserve
   (« une déclaration ne pose plus d'échéance ») et son signal de violation l'est aussi
   (« une déclaration produit un état avec une `prochaineRevision` non nulle »), alors que
   la hiérarchie du budget dit que les déclarations « entrent sur le reliquat de budget ».
   Les deux ne peuvent pas tenir ensemble AU MOMENT DU GESTE. Ici on tient le critère 1 à
   la lettre : la déclaration écrit TOUJOURS hors rotation, et c'est une PASSE ULTÉRIEURE
   qui promeut sur le reliquat. C'est aussi le modèle transposé (#641 : un mot entre à son
   atelier, pas à sa saisie par le parent). Si l'implémentation choisit de promouvoir
   SYNCHRONEMENT dans `declarerVuAilleursFor`, le bloc 1 tombe — et c'est une discussion à
   avoir, pas un détail de test.

   HORS PÉRIMÈTRE de la logique pure (→ spec Playwright) : ce que l'ENFANT voit à l'écran
   (le critère 14 n'est éprouvé ici que côté catalogue / périmètre de sprint), et le
   CÂBLAGE de la passe de promotion (à quel moment de la vie de l'appli elle tourne). On
   éprouve la fonction, pas son appelant.
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
	etatHorsRotation,
	etatNeuf,
	estHorsRotation,
	estDu,
	estAcquis,
	avancerEtat,
	PALIER_ACQUIS,
} from '../src/core/revision';
import {
	countDue,
	prochaineEcheance,
	selectDueGroups,
	effortRevisionAffiche,
	aDesRevisions,
} from '../src/core/revision-select';
import {
	LESSON_REVISION_KEY,
	LESSON_STATS_KEY,
	LESSON_FIRST_SEEN_KEY,
	countDusSeance,
	loadLessonRevisions,
	recordLessonStats,
	promouvoirEntreesEnAttente,
	type LessonStat,
} from '../src/core/progress';
import {
	declarerVuAilleursFor,
	loadVuAilleursFor,
	type LeconNiveau,
} from '../src/core/vu-ailleurs';
import { estRencontree, loadRencontrees } from '../src/core/sprint-scope';
import { revisionProfil } from '../src/core/encadrant-stats';
import { getAllLessons, getLessonById, genLessonItem } from '../src/core/catalog';
import { addOrGetMot, loadOrthoFor, saveOrthoFor } from '../src/core/orthographe/store';
import { marquerAtelierFait } from '../src/core/orthographe/runner';
import {
	initProfiles,
	activeProfile,
	touchActiveProfile,
	setNiveauReference,
} from '../src/core/profiles';
import { setOnDataWrite, lsGetRaw, lsSetRaw } from '../src/core/storage';
import type { SchoolLevel } from '../src/core/catalog';
import type { EtatRevision } from '../src/core/orthographe/types';

/* Un jour en ms, RECALCULÉ ici : l'attendu « J+1 » / « 4 semaines » ne doit pas venir du
   code testé. */
const JOUR = 24 * 60 * 60 * 1000;
/* Mercredi 3 juin 2026, 9 h. Un MERCREDI délibérément : la fenêtre de budget est
   glissante et non calendaire, et un mercredi place la frontière du lundi AU MILIEU de la
   fenêtre (le cas discriminant est éprouvé dans `revision-budget-entree.test.ts`). */
const T0 = new Date(2026, 5, 3, 9, 0, 0, 0).getTime();
const jour = (n: number): number => T0 + n * JOUR;
/* Plafond de séance maximal → budget d'entrée de 8 par semaine glissante (cf. issue). */
const PLAFOND_MAX = 24;

/* ---------- Accès bruts au stockage d'un profil (clé RÉELLE `uuid/clé`) ---------- */
function ecrire(uuid: string, key: string, value: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(value));
}
function lire(uuid: string, key: string): unknown {
	return lsGetRaw(uuid + '/' + key, null);
}
function revisions(uuid: string): Record<string, EtatRevision> {
	return lsGetRaw(uuid + '/' + LESSON_REVISION_KEY, {}) as Record<string, EtatRevision>;
}
/* La file d'attente telle qu'elle est PERSISTÉE : `attente` (clé → date de mise en
   attente) et `promues` (horodatages). Clé écrite littéralement, comme les autres accès
   bruts de ces tests. */
function fileAttente(uuid: string): { attente: Record<string, number>; promues: number[] } {
	return lsGetRaw(uuid + '/ludaskia_revisionFile', { attente: {}, promues: [] }) as {
		attente: Record<string, number>;
		promues: number[];
	};
}
function decl(lessonId: string, niveau: SchoolLevel = 'ce2'): LeconNiveau {
	return { lessonId, niveau };
}
function declarer(uuid: string, ids: string[], t: number): void {
	declarerVuAilleursFor(
		uuid,
		ids.map((id) => decl(id)),
		true,
		t,
	);
}
function stat(questions: number): LessonStat {
	return { attempts: 1, correct: questions, questions, bestPct: 100, lastPct: 100 };
}
/* Fige `Date.now()` le temps d'un geste : `recordLessonStats` date la session lui-même. */
function aLInstant<T>(t: number, fn: () => T): T {
	const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
	try {
		return fn();
	} finally {
		spy.mockRestore();
	}
}
/* Le vrai chemin d'une rencontre réelle de leçon : un essai qui produit des stats. */
function jouerLecon(lessonId: string, t: number): void {
	aLInstant(t, () => recordLessonStats({ [lessonId]: { ok: 4, total: 5 } }, 'lecon', lessonId));
}
/* Le vrai chemin d'une rencontre réelle de mot : découverte à l'atelier puis persistance
   sur le profil — c'est l'état PERSISTÉ que la passe de promotion doit voir. */
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
let compteurMots = 0;
function formeMot(i: number): string {
	return ALPHA[i % 26] + ALPHA[Math.floor(i / 26) % 26] + ALPHA[Math.floor(i / 676) % 26];
}
function decouvrirMots(uuid: string, n: number, t: number): void {
	const state = loadOrthoFor(uuid);
	for (let i = 0; i < n; i++) {
		marquerAtelierFait(addOrGetMot(state, { mot: formeMot(compteurMots++) }), t);
	}
	saveOrthoFor(uuid, state);
}
/* Déroule les jours [de, a] de la vie du profil : `motsParJour` découvertes réelles, puis
   la passe de promotion de la file d'attente (celle que l'appli déclenchera).

   CHAUFFER LA FENÊTRE AVANT DE DÉCLARER. Un scénario « budget saturé » doit dérouler une
   semaine de découvertes AVANT la déclaration : sur un profil neuf la fenêtre glissante
   est vide, le reliquat vaut donc le budget entier, et les déclarations entrent tout de
   suite. Ce n'est pas un défaut — au jour 0, la fenêtre contient bien moins d'entrées que
   le budget ne l'autorise, et refuser ces places bloquerait le démarrage de tout profil
   neuf. C'est simplement qu'un enfant EN RÉGIME et un enfant qui vient d'arriver ne sont
   pas la même mise en scène. */
function vivreLesJours(uuid: string, de: number, a: number, motsParJour = 0): void {
	for (let j = de; j <= a; j++) {
		if (motsParJour > 0) decouvrirMots(uuid, motsParJour, jour(j));
		promouvoirEntreesEnAttente(uuid, jour(j), PLAFOND_MAX);
	}
}
/* Leçons CE2 du catalogue : réservoir des scénarios de volume (101 déclarations). */
function leconsCe2(): string[] {
	return getAllLessons()
		.filter((l) => l.levels.includes('ce2'))
		.map((l) => l.id);
}
const enRotation = (e: EtatRevision | undefined): boolean => !!e && !estHorsRotation(e);
const totalServi = (groupes: { items: unknown[] }[]): number =>
	groupes.reduce((n, g) => n + g.items.length, 0);

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	setNiveauReference('ce2');
	compteurMots = 0;
});

/* ============================================================
   0) Pré-conditions : le terrain de jeu des scénarios de volume
   ============================================================ */
describe('pré-conditions', () => {
	it('le catalogue CE2 offre de quoi rejouer le profil mesuré (101 leçons déclarées)', () => {
		expect(leconsCe2().length).toBeGreaterThanOrEqual(101);
	});
});

/* ============================================================
   1) Critère 1 — la déclaration n'ouvre plus d'échéance
   ------------------------------------------------------------
   Signal de violation écrit dans l'issue : « une déclaration produit un état avec une
   `prochaineRevision` non nulle ».
   ============================================================ */
describe('critère 1 — une déclaration « vu en classe » est enregistrée HORS ROTATION', () => {
	it('la leçon déclarée existe, sans aucune échéance', () => {
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);

		const e = revisions(uuid)[`${A}@ce2`];
		expect(e).toBeDefined(); // la déclaration EST enregistrée (critère 11)
		expect(e.prochaineRevision).toBeNull(); // le signal de violation, en négatif
		expect(estHorsRotation(e)).toBe(true);
		expect(e).toEqual(etatHorsRotation()); // « comme un mot avant son atelier »
	});

	it('le lot mesuré du 8 septembre (101 leçons) n’ouvre AUCUNE échéance', () => {
		const uuid = activeProfile().uuid;
		declarer(uuid, leconsCe2().slice(0, 101), T0);

		const etats = Object.values(revisions(uuid));
		expect(etats).toHaveLength(101);
		expect(etats.filter((e) => e.prochaineRevision != null)).toEqual([]);
		// « entrées ensemble, donc toutes dues le lendemain » : c'est fini.
		expect(etats.filter((e) => estDu(e, jour(1)))).toEqual([]);
	});

	it('vu de l’enfant : rien n’est dû le lendemain d’une déclaration en masse', () => {
		const uuid = activeProfile().uuid;
		declarer(uuid, leconsCe2().slice(0, 101), T0);

		for (const t of [T0, jour(1), jour(3)]) {
			expect(countDusSeance(loadOrthoFor(uuid), t, PLAFOND_MAX), `t=${t}`).toBe(0);
		}
	});
});

/* ============================================================
   2) Critère 2 — l'entrée se fait à la première rencontre RÉELLE
   ============================================================ */
describe('critère 2 — une leçon déclarée entre en rotation à sa première rencontre réelle', () => {
	it('le premier passage produisant des stats démarre le compteur, daté du PASSAGE', () => {
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);

		jouerLecon(A, jour(5));

		const e = revisions(uuid)[`${A}@ce2`];
		expect(estHorsRotation(e)).toBe(false);
		// J+1 « à chaud » compté depuis le PASSAGE, pas depuis la déclaration : une entrée
		// datée de la déclaration arriverait avec cinq jours de dette.
		expect(e.prochaineRevision).toBe(jour(5) + JOUR);
		expect(e.palier).toBe(0);
		expect(e.reussites).toBe(0);
		expect(e.dernierTest).toBeNull();
		expect(estDu(e, jour(5))).toBe(false);
		expect(estDu(e, jour(6))).toBe(true);
	});

	it('un passage RATÉ entre pareil : l’entrée ne juge pas la performance', () => {
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);
		aLInstant(jour(2), () => recordLessonStats({ [A]: { ok: 0, total: 5 } }, 'lecon', A));
		expect(revisions(uuid)[`${A}@ce2`].prochaineRevision).toBe(jour(2) + JOUR);
	});

	it('un essai à 0 question n’est pas une rencontre : la leçon reste en attente', () => {
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);
		aLInstant(jour(2), () => recordLessonStats({ [A]: { ok: 0, total: 0 } }, 'lecon', A));
		expect(estHorsRotation(revisions(uuid)[`${A}@ce2`])).toBe(true);
	});

	it('non-régression #45 : une leçon JAMAIS déclarée entre toujours à son 1er passage', () => {
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		jouerLecon(A, jour(3));
		expect(revisions(uuid)[`${A}@ce2`].prochaineRevision).toBe(jour(3) + JOUR);
	});

	it('MONOTONIE — un nouveau passage ne remet pas à zéro un état déjà avancé', () => {
		// Garde-fou du changement : « remplacer l'état hors rotation par un état neuf » ne
		// doit pas dégénérer en « tout passage réécrit l'état ». Deux réussites valent des
		// semaines d'espacement, qu'un essai de leçon ne doit pas effacer.
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		const avance = avancerEtat(avancerEtat(etatHorsRotation(), true, T0), true, jour(1));
		ecrire(uuid, LESSON_REVISION_KEY, { [`${A}@ce2`]: avance });

		jouerLecon(A, jour(4));

		expect(avance.palier).toBeGreaterThan(0); // la fixture est bien un état avancé
		expect(revisions(uuid)[`${A}@ce2`]).toEqual(avance);
	});
});

/* ============================================================
   3) Critère 3 — quatre semaines d'attente donnent la PRIORITÉ, pas l'entrée
   ------------------------------------------------------------
   DÉCISION DU MAINTENEUR (9 septembre 2026), qui tranche la contradiction signalée entre
   le critère 3 et le problème que l'issue décrit. La passe promeut, dans cet ordre :
   1. les éléments qui attendent depuis plus de 4 semaines, par ancienneté de déclaration,
      tant qu'il reste du reliquat de budget ;
   2. les autres déclarations, même ordre, même reliquat ;
   3. SLOT RÉSERVÉ — si aucune déclaration n'a été promue dans la fenêtre glissante des
      7 derniers jours et qu'il existe au moins un élément en attente depuis plus de
      4 semaines, on en promeut UN, même budget dépassé.
   Le slot réservé est un PLANCHER, pas une allocation : il ne s'ouvre que si la fenêtre
   n'a rien laissé passer côté déclarations, jamais pour un élément qui attend depuis
   moins de 4 semaines, et jamais devant une rencontre réelle (critère 5). La charge
   maximale d'une semaine est donc `budget + 1`.
   ============================================================ */
describe('critère 3 — quatre semaines d’attente donnent la priorité entre déclarations', () => {
	it('sur le reliquat de budget, une déclaration entre sans attendre 4 semaines', () => {
		// L'écoulement du stock commence dès le premier jour : c'est ce qui donne les
		// ~13 semaines annoncées pour 101 déclarations à budget 8, et non 4 + 13.
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);
		expect(promouvoirEntreesEnAttente(uuid, jour(1), PLAFOND_MAX)).toBe(1);
		expect(estHorsRotation(revisions(uuid)[`${A}@ce2`])).toBe(false);
	});

	it('une déclaration qui a attendu 4 semaines passe avant une déclaration récente', () => {
		// Une semaine de chauffe (cf. `vivreLesJours`), puis A est déclarée dans un budget
		// déjà saturé (2 mots par jour, 14 par semaine pour un budget de 8) : elle ne peut
		// pas entrer et vieillit. B est déclarée fraîche quatre semaines plus tard. La place
		// qui se libère alors doit aller à A, la plus ancienne, jamais à B.
		const uuid = activeProfile().uuid;
		const [A, B] = leconsCe2().slice(0, 2);
		vivreLesJours(uuid, 0, 6, 2);
		declarer(uuid, [A], jour(7));
		vivreLesJours(uuid, 7, 34, 2);
		expect(estHorsRotation(revisions(uuid)[`${A}@ce2`])).toBe(true);

		declarer(uuid, [B], jour(35));
		vivreLesJours(uuid, 35, 41, 2);

		const r = revisions(uuid);
		expect(enRotation(r[`${A}@ce2`])).toBe(true);
		expect(estHorsRotation(r[`${B}@ce2`])).toBe(true);
	});

	it('re-déclarer ne remet pas à zéro l’ancienneté dans la file', () => {
		// `declarerVuAilleursFor` est idempotent (« seules les entrées qui CHANGENT
		// réellement d'état propagent leur effet ») : un adulte qui repasse par l'écran de
		// déclaration ne doit pas repousser l'entrée de ce qui est déjà déclaré. Le rang de
		// A est éprouvé CONTRE B, déclarée après lui : si la re-déclaration réarmait
		// l'ancienneté, c'est B qui prendrait le slot.
		const uuid = activeProfile().uuid;
		const [A, B] = leconsCe2().slice(0, 2);
		declarer(uuid, [A], T0);
		declarer(uuid, [B], jour(1));
		declarer(uuid, [A], jour(20)); // re-déclaration de A seule
		decouvrirMots(uuid, 7, jour(20)); // reliquat = 1

		promouvoirEntreesEnAttente(uuid, jour(20), PLAFOND_MAX);

		const r = revisions(uuid);
		expect(enRotation(r[`${A}@ce2`])).toBe(true);
		expect(estHorsRotation(r[`${B}@ce2`])).toBe(true);
	});

	it('SEUIL DISCRIMINANT — rien à trois semaines, entrée à cinq, budget saturé des deux côtés', () => {
		// Le test qui distingue le slot réservé d'un simple FIFO par ancienneté. Une semaine
		// de chauffe, puis le budget reste saturé (2 mots par jour, 14 par semaine pour un
		// budget de 8) et une SEULE déclaration attend : elle est donc la plus ancienne de
		// la file dans les deux relevés. À trois semaines d'attente rien n'entre ; à cinq,
		// le plancher s'ouvre. Sous un FIFO pur, l'ancienneté seule déciderait et le seuil
		// des 4 semaines ne se verrait nulle part.
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		vivreLesJours(uuid, 0, 6, 2);
		declarer(uuid, [A], jour(7));

		vivreLesJours(uuid, 7, 28, 2); // trois semaines d'attente
		expect(estHorsRotation(revisions(uuid)[`${A}@ce2`])).toBe(true);

		vivreLesJours(uuid, 29, 42, 2); // cinq semaines d'attente
		const e = revisions(uuid)[`${A}@ce2`];
		expect(estHorsRotation(e)).toBe(false);
		// Elle entre FRAÎCHE : premier rappel à J+1 de son ENTRÉE, jamais rétrodaté à sa
		// déclaration — sinon elle arriverait due, c'est-à-dire le défaut d'origine.
		expect(e.prochaineRevision).toBeGreaterThan(jour(35));
		expect(e.palier).toBe(0);
		expect(e.dernierTest).toBeNull();
	});

	it('le plancher reste un PLANCHER : sous saturation, au plus une déclaration par semaine', () => {
		// Vingt déclarations, budget saturé en permanence dès avant la déclaration (semaine
		// de chauffe) : le reliquat est nul, seul le slot réservé les fait avancer. Il ne
		// doit en libérer qu'UNE par fenêtre glissante, sinon le stock déclaré repart en
		// rafale par la porte de service.
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 20);
		vivreLesJours(uuid, 0, 6, 2);
		declarer(uuid, ids, jour(7));

		const cumul: number[] = [];
		for (let j = 7; j <= 7 * 13; j++) {
			decouvrirMots(uuid, 2, jour(j)); // 14 par semaine > budget 8
			promouvoirEntreesEnAttente(uuid, jour(j), PLAFOND_MAX);
			cumul.push(ids.filter((id) => enRotation(revisions(uuid)[`${id}@ce2`])).length);
		}

		for (let j = 0; j < cumul.length; j++) {
			const debutFenetre = j >= 7 ? cumul[j - 7] : 0;
			expect(cumul[j] - debutFenetre, `fenêtre finissant à j=${7 + j}`).toBeLessThanOrEqual(1);
		}
		expect(cumul[cumul.length - 1]).toBeGreaterThan(0); // la file avance quand même
	});

	it('le plancher ne s’ouvre PAS quand une déclaration est déjà entrée dans la fenêtre', () => {
		// Sinon le plancher devient une allocation permanente — une entrée « gratuite » par
		// semaine EN PLUS de celles que le budget laisse passer — et la charge dérive.
		// Quatre semaines de saturation vieillissent les vingt déclarations, puis le rythme
		// retombe à 7 mots par semaine : le reliquat vaut 1. Cette entrée-là ferme le
		// plancher, donc la fenêtre doit compter UNE entrée, pas deux.
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 20);
		declarer(uuid, ids, T0);
		vivreLesJours(uuid, 0, 27, 2); // les vingt vieillissent, rien n'entre par le budget

		const cumul: number[] = [];
		for (let j = 28; j <= 70; j++) {
			decouvrirMots(uuid, 1, jour(j)); // 7 par semaine → reliquat de 1
			promouvoirEntreesEnAttente(uuid, jour(j), PLAFOND_MAX);
			cumul.push(ids.filter((id) => enRotation(revisions(uuid)[`${id}@ce2`])).length);
		}

		// On lit à partir de j=35, une fois la fenêtre purgée de la phase de saturation.
		for (let j = 14; j < cumul.length; j++) {
			expect(cumul[j] - cumul[j - 7], `fenêtre finissant à j=${28 + j}`).toBeLessThanOrEqual(1);
		}
	});
});

/* ============================================================
   4) Critère 7 — un différé n'est ni dû, ni en retard, nulle part
   ------------------------------------------------------------
   On observe par les fonctions que l'accueil et la séance appellent VRAIMENT, et non par
   la forme de l'état stocké : c'est l'invariant « annoncé = proposé » (#478) qui est en
   jeu — une seule de ces lectures qui compterait autrement remettrait un écart entre ce
   que la carte promet et ce que la séance sert.
   ============================================================ */
describe('critère 7 — un élément différé n’apparaît nulle part comme dû ou en retard', () => {
	it('les points d’observation de l’accueil et de la séance l’ignorent tous', () => {
		const uuid = activeProfile().uuid;
		declarer(uuid, leconsCe2().slice(0, 101), T0);
		const ortho = loadOrthoFor(uuid);

		for (const t of [T0, jour(1), jour(7), jour(27)]) {
			const rev = loadLessonRevisions();
			expect(countDusSeance(ortho, t, PLAFOND_MAX), `dus t=${t}`).toBe(0);
			expect(countDue(ortho, rev, t, PLAFOND_MAX), `countDue t=${t}`).toBe(0);
			expect(selectDueGroups(ortho, rev, t, PLAFOND_MAX), `seance t=${t}`).toEqual([]);
			// Aucune échéance à annoncer : un différé n'a pas de rendez-vous.
			expect(prochaineEcheance(ortho, rev, t), `echeance t=${t}`).toBeNull();
		}
	});

	it('l’accueil ne dit pas « tout est à jour » : rien n’est encore entré en rotation', () => {
		// DÉCISION DU MAINTENEUR (9 septembre 2026) : un profil dont tout est différé relève
		// de « profil neuf, rien d'appris » — l'accueil doit annoncer que les révisions
		// apparaîtront quand l'enfant aura travaillé, pas « bravo, tu as tout révisé ». Les
		// trois lectures de l'accueil doivent donc être d'accord entre elles.
		const uuid = activeProfile().uuid;
		declarer(uuid, leconsCe2().slice(0, 101), T0);

		const ortho = loadOrthoFor(uuid);
		const rev = loadLessonRevisions();
		expect(aDesRevisions(ortho, rev)).toBe(false);
		expect(countDue(ortho, rev, jour(27), PLAFOND_MAX)).toBe(0);
		expect(prochaineEcheance(ortho, rev, jour(27))).toBeNull();
	});

	it('un mot pas encore découvert ne compte pas davantage comme une révision', () => {
		const uuid = activeProfile().uuid;
		const state = loadOrthoFor(uuid);
		addOrGetMot(state, { mot: 'chat' });
		saveOrthoFor(uuid, state);

		expect(aDesRevisions(loadOrthoFor(uuid), loadLessonRevisions())).toBe(false);
	});

	it('dès qu’un seul élément est vraiment entré en rotation, l’accueil le sait', () => {
		const uuid = activeProfile().uuid;
		declarer(uuid, leconsCe2().slice(0, 101), T0);
		jouerLecon(leconsCe2()[110], T0);

		expect(aDesRevisions(loadOrthoFor(uuid), loadLessonRevisions())).toBe(true);
	});

	it('INVARIANT « annoncé = proposé », différés et vraies révisions mélangés', () => {
		const uuid = activeProfile().uuid;
		declarer(uuid, leconsCe2().slice(0, 101), T0);
		for (const id of leconsCe2().slice(110, 113)) jouerLecon(id, T0);

		for (const plafond of [6, 12, 24]) {
			for (const t of [jour(1), jour(2), jour(27)]) {
				const rev = loadLessonRevisions();
				const ortho = loadOrthoFor(uuid);
				const annonce = effortRevisionAffiche(countDue(ortho, rev, t, plafond), plafond);
				expect(annonce.n, `plafond=${plafond} t=${t}`).toBe(
					totalServi(selectDueGroups(ortho, rev, t, plafond)),
				);
			}
		}
	});

	it('le récap encadrant ne présente aucun différé comme dû, en retard ou daté', () => {
		const uuid = activeProfile().uuid;
		declarer(uuid, leconsCe2().slice(0, 101), T0);

		const recap = revisionProfil(activeProfile(), jour(27));
		expect(recap.dues).toBe(0);
		expect(recap.parUrgence.filter((e) => e.du)).toEqual([]);
		expect(recap.parUrgence.filter((e) => (e.joursRestants ?? 0) < 0)).toEqual([]);
		expect(recap.parUrgence.filter((e) => e.echeance !== '')).toEqual([]);
		for (const g of recap.groupes) expect(g.dues, g.categoryId).toBe(0);
		for (const p of recap.parPalier) expect(p.dues, p.label).toBe(0);
	});
});

/* ============================================================
   5) Critère 8 — la file d'attente est constatable côté encadrant
   ------------------------------------------------------------
   « Au minimum par un compte » : `RecapRevision.enAttente`. Le compte n'a de sens que si
   les trois états sont EXCLUSIFS — un différé compté « en rotation » (ce que fait le récap
   d'aujourd'hui, un état hors rotation ayant `palier: 0` fini) ferait mentir le même
   chiffre dans l'autre sens.
   ============================================================ */
describe('critère 8 — la file d’attente se compte côté encadrant', () => {
	it('101 déclarations différées se comptent, et ne comptent PAS comme en rotation', () => {
		const uuid = activeProfile().uuid;
		declarer(uuid, leconsCe2().slice(0, 101), T0);

		const r = revisionProfil(activeProfile(), jour(1));
		expect(r.enAttente).toBe(101);
		expect(r.enRotation).toBe(0);
		expect(r.acquises).toBe(0);
		expect(r.total).toBe(r.enAttente + r.enRotation + r.acquises);
	});

	it('le compte suit la file : ce qui est rencontré en sort', () => {
		const uuid = activeProfile().uuid;
		const [A, B, C] = leconsCe2().slice(0, 3);
		declarer(uuid, [A, B, C], T0);
		jouerLecon(A, jour(2));

		const r = revisionProfil(activeProfile(), jour(2));
		expect(r.enAttente).toBe(2);
		expect(r.enRotation).toBe(1);
		expect(r.total).toBe(3);
	});

	it('un mot pas encore découvert relève de la même file (même nature d’attente, #641)', () => {
		// Jugement : « hors rotation » est UN seul état, quelle que soit la source. Un mot
		// saisi par le parent et jamais découvert n'est pas plus « en rotation » qu'une
		// leçon déclarée et jamais jouée.
		const uuid = activeProfile().uuid;
		const state = loadOrthoFor(uuid);
		addOrGetMot(state, { mot: 'chat' });
		saveOrthoFor(uuid, state);

		const r = revisionProfil(activeProfile(), T0);
		expect(r.total).toBe(1);
		expect(r.enAttente).toBe(1);
		expect(r.enRotation).toBe(0);
	});
});

/* ============================================================
   6) Critère 9 — annuler ne détruit aucun progrès réel
   ------------------------------------------------------------
   Comportement actuel de `retirerRevisionsDeclareesFor`, à préserver. Les cas sont montés
   par les CHEMINS RÉELS (un vrai essai, un vrai avancement d'escalier), pas par des stats
   écrites à la main : le gate change ce que la déclaration pose, donc ce que l'annulation
   trouve.
   ============================================================ */
describe('critère 9 — annuler une déclaration ne détruit aucun progrès réel', () => {
	it('déclarée puis JOUÉE : l’état de rotation survit à l’annulation', () => {
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);
		jouerLecon(A, jour(1));
		const attendu = revisions(uuid)[`${A}@ce2`];
		expect(enRotation(attendu)).toBe(true); // pré-condition : le passage a bien compté

		declarerVuAilleursFor(uuid, [decl(A)], false, jour(2));

		expect(revisions(uuid)[`${A}@ce2`]).toEqual(attendu);
		expect(loadVuAilleursFor(uuid)).toEqual({});
	});

	it('déclarée puis RE-TESTÉE en révision : l’état avancé survit', () => {
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);
		const avance = avancerEtat(etatNeuf(T0), true, jour(1));
		ecrire(uuid, LESSON_REVISION_KEY, { [`${A}@ce2`]: avance });

		declarerVuAilleursFor(uuid, [decl(A)], false, jour(2));

		expect(revisions(uuid)[`${A}@ce2`]).toEqual(avance);
	});

	it('déclarée et jamais rencontrée : l’annulation retire l’attente, et rien d’autre', () => {
		const uuid = activeProfile().uuid;
		const [A, B] = leconsCe2().slice(0, 2);
		declarer(uuid, [A, B], T0);

		declarerVuAilleursFor(uuid, [decl(A)], false, jour(1));

		expect(revisions(uuid)[`${A}@ce2`]).toBeUndefined();
		expect(estHorsRotation(revisions(uuid)[`${B}@ce2`])).toBe(true); // B attend toujours
		expect(loadVuAilleursFor(uuid)).toEqual({ [`${B}@ce2`]: true });
	});

	it('après annulation, aucune passe de promotion ne fait revenir la leçon', () => {
		// Le piège de la file d'attente : si l'annulation ne la vide pas, la soupape des
		// 4 semaines finit par promouvoir une leçon qui n'est plus déclarée du tout.
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);
		declarerVuAilleursFor(uuid, [decl(A)], false, jour(1));

		vivreLesJours(uuid, 1, 40);

		expect(revisions(uuid)[`${A}@ce2`]).toBeUndefined();
		expect(loadVuAilleursFor(uuid)).toEqual({});
	});

	it('entrée par la PASSE de promotion mais jamais rencontrée : l’annulation la retire', () => {
		// L'entrée ne vient pas d'un progrès réel, elle vient de la déclaration : la
		// protection ne doit pas s'étendre à ce que le budget a promu d'office.
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);
		promouvoirEntreesEnAttente(uuid, jour(1), PLAFOND_MAX);
		expect(enRotation(revisions(uuid)[`${A}@ce2`])).toBe(true); // pré-condition

		declarerVuAilleursFor(uuid, [decl(A)], false, jour(2));

		expect(revisions(uuid)[`${A}@ce2`]).toBeUndefined();
	});
});

/* ============================================================
   7) Critère 11 — rien ne sort de la liste
   ============================================================ */
describe('critère 11 — le stock déclaré est différé, jamais perdu ni réduit', () => {
	it('101 déclarées restent 101, et le nombre d’éléments connus ne décroît jamais', () => {
		const uuid = activeProfile().uuid;
		declarer(uuid, leconsCe2().slice(0, 101), T0);
		expect(Object.keys(loadVuAilleursFor(uuid))).toHaveLength(101);
		expect(Object.keys(revisions(uuid))).toHaveLength(101);

		let mini = Infinity;
		for (let j = 0; j <= 40; j++) {
			decouvrirMots(uuid, 2, jour(j));
			promouvoirEntreesEnAttente(uuid, jour(j), PLAFOND_MAX);
			expect(Object.keys(loadVuAilleursFor(uuid)), `déclarations j=${j}`).toHaveLength(101);
			expect(Object.keys(revisions(uuid)), `états j=${j}`).toHaveLength(101);
			mini = Math.min(mini, revisionProfil(activeProfile(), jour(j)).total);
		}
		expect(mini).toBeGreaterThanOrEqual(101);
	});
});

/* ============================================================
   8) Critère 10 — aucun élément ne reste bloqué indéfiniment
   ============================================================ */
describe('critère 10 — aucun élément ne reste bloqué indéfiniment', () => {
	it('sans rencontre réelle, les 101 déclarations finissent toutes par entrer', () => {
		// Environ 13 semaines à budget 8 (101 / 8) : on laisse 20 semaines de marge. Ce qui
		// est éprouvé ici, c'est que l'écoulement ARRIVE À SON TERME ; la dose par semaine,
		// elle, est éprouvée dans `revision-budget-entree.test.ts`.
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 101);
		declarer(uuid, ids, T0);

		vivreLesJours(uuid, 0, 7 * 20);

		const r = revisions(uuid);
		expect(ids.filter((id) => estHorsRotation(r[`${id}@ce2`]))).toEqual([]);
	});

	it('avec un reliquat de budget, la file s’écoule quand même — donc on peut dire quand', () => {
		// 7 mots découverts par semaine pour un budget de 8 : un slot par semaine environ.
		// Dix déclarations s'écoulent en une dizaine de semaines : la borne du critère 10
		// reste nommable (« 4 semaines au plus tôt, puis son rang dans la file, au budget »).
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 10);
		declarer(uuid, ids, T0);

		vivreLesJours(uuid, 0, 7 * 15, 1);

		const r = revisions(uuid);
		expect(ids.filter((id) => estHorsRotation(r[`${id}@ce2`]))).toEqual([]);
	});

	it('le cas d’école de l’issue (11 mots par semaine) fait tout de même entrer des déclarations', () => {
		// Signal de violation écrit dans l'issue pour le critère 10 : « un profil qui
		// découvre 11 mots par semaine ne fait jamais entrer aucune de ses 101 leçons
		// déclarées ». 11 rencontres réelles pour un budget de 8 laissent un reliquat NUL en
		// permanence : c'est le slot réservé, et lui seul, qui tient ce critère — une entrée
		// par semaine dès que le stock a passé les quatre semaines.
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 101);
		declarer(uuid, ids, T0);

		for (let j = 0; j <= 7 * 12; j++) {
			decouvrirMots(uuid, j % 7 < 4 ? 2 : 1, jour(j)); // 2+2+2+2+1+1+1 = 11 par semaine
			promouvoirEntreesEnAttente(uuid, jour(j), PLAFOND_MAX);
		}

		// Douze semaines, dont huit au-delà du seuil des quatre : le plancher a eu le temps
		// d'ouvrir plusieurs fois. On ne fige pas la cadence exacte (elle dépend du bord de
		// la fenêtre), seulement le fait que la file se vide pour de bon.
		const r = revisions(uuid);
		expect(ids.filter((id) => enRotation(r[`${id}@ce2`])).length).toBeGreaterThanOrEqual(6);
	});
});

/* ============================================================
   9) Critère 13 — aucune migration des états existants
   ------------------------------------------------------------
   Le profil mesuré tel qu'il dort dans le stockage au moment de la mise à jour : les
   leçons déclarées sont DÉJÀ en rotation (états posés par l'ancien comportement), toutes
   jouées sauf UNE. Le piège de ce critère est cette leçon-là : un gate qui « re-gaterait »
   le stock déclaré la ressortirait de la rotation.
   ============================================================ */
describe('critère 13 — les états déjà en rotation ne sont ni ressortis ni réécrits', () => {
	function semerProfilMesure(uuid: string): { cleJamaisJouee: string; ids: string[] } {
		const ids = leconsCe2().slice(0, 101);
		const vu: Record<string, true> = {};
		const rev: Record<string, EtatRevision> = {};
		const stats: Record<string, LessonStat> = {};
		const seen: Record<string, number> = {};
		ids.forEach((id, i) => {
			const k = `${id}@ce2`;
			vu[k] = true;
			if (i === 0) {
				// LA leçon jamais jouée : état d'entrée posé par l'ancien comportement, aucune
				// stat, aucune date de 1er passage.
				rev[k] = etatNeuf(T0 - 30 * JOUR);
			} else {
				rev[k] = avancerEtat(etatNeuf(T0 - 30 * JOUR), true, T0 - 20 * JOUR);
				stats[k] = stat(10);
				seen[k] = T0 - 30 * JOUR;
			}
		});
		ecrire(uuid, 'ludaskia_lessonVuAilleurs', vu);
		ecrire(uuid, LESSON_REVISION_KEY, rev);
		ecrire(uuid, LESSON_STATS_KEY, stats);
		ecrire(uuid, LESSON_FIRST_SEEN_KEY, seen);
		return { cleJamaisJouee: `${ids[0]}@ce2`, ids };
	}

	it('aucune des clés existantes ne change de valeur (l’export d’avant reste vrai)', () => {
		const uuid = activeProfile().uuid;
		semerProfilMesure(uuid);
		const avant = [
			LESSON_REVISION_KEY,
			LESSON_STATS_KEY,
			LESSON_FIRST_SEEN_KEY,
			'ludaskia_lessonVuAilleurs',
		].map((k) => [k, JSON.stringify(lire(uuid, k))] as const);

		vivreLesJours(uuid, 0, 40); // la vie continue, passes de promotion comprises

		for (const [k, json] of avant) expect(JSON.stringify(lire(uuid, k)), k).toBe(json);
	});

	it('la seule leçon jamais jouée reste en rotation (elle ne repart pas en file d’attente)', () => {
		const uuid = activeProfile().uuid;
		const { cleJamaisJouee } = semerProfilMesure(uuid);
		const avant = revisions(uuid)[cleJamaisJouee];

		vivreLesJours(uuid, 0, 40);

		expect(revisions(uuid)[cleJamaisJouee]).toEqual(avant);
		expect(enRotation(revisions(uuid)[cleJamaisJouee])).toBe(true);
	});

	it('le gate n’agit que sur les entrées FUTURES : nouvelles différées, anciennes intactes', () => {
		const uuid = activeProfile().uuid;
		const { ids } = semerProfilMesure(uuid);
		const revAvant = JSON.stringify(lire(uuid, LESSON_REVISION_KEY));
		const nouvelles = leconsCe2().slice(101, 106);

		declarer(uuid, nouvelles, T0);

		const r = revisions(uuid);
		for (const id of nouvelles) expect(estHorsRotation(r[`${id}@ce2`]), id).toBe(true);
		for (const id of ids) expect(enRotation(r[`${id}@ce2`]), id).toBe(true);
		// Les 101 anciens états sont inchangés, mot pour mot.
		const anciens: Record<string, EtatRevision> = {};
		for (const id of ids) anciens[`${id}@ce2`] = r[`${id}@ce2`];
		expect(JSON.stringify(anciens)).toBe(revAvant);
	});
});

/* ============================================================
   9 bis) Hygiène de la file : aucun orphelin ne s'y accumule
   ------------------------------------------------------------
   Une clé peut se retrouver dans `attente` alors que son élément a DÉJÀ démarré sa
   rotation : deux cartes incohérentes dans une sauvegarde importée suffisent. Filtrée à
   chaque passe mais jamais retirée, elle resterait là indéfiniment — `attente` n'a pas de
   borne propre, contrairement à l'historique des promotions (borné par date et par
   nombre). Un orphelin est par définition un élément déjà parti : le purger ne doit donc
   toucher à rien d'autre que la file.
   ============================================================ */
describe('file d’attente — les entrées orphelines sont purgées', () => {
	/* Orpheline = déclarée (donc dans la file) mais dont l'état de révision a démarré par
	   ailleurs. Montée à la main : par les chemins réels, l'entrée en rotation retire
	   elle-même la clé de la file, l'incohérence ne vient que d'une donnée importée. */
	function semerOrpheline(uuid: string, lessonId: string, etat: EtatRevision): void {
		const r = revisions(uuid);
		r[`${lessonId}@ce2`] = etat;
		ecrire(uuid, LESSON_REVISION_KEY, r);
	}
	const etatDemarre = (): EtatRevision => avancerEtat(etatNeuf(T0 - 10 * JOUR), true, T0 - JOUR);

	it('purge accompagnée d’une promotion : l’orpheline sort, l’autre entre', () => {
		const uuid = activeProfile().uuid;
		const [A, B] = leconsCe2().slice(0, 2);
		declarer(uuid, [A, B], T0);
		const etatA = etatDemarre();
		semerOrpheline(uuid, A, etatA);
		expect(fileAttente(uuid).attente[`${A}@ce2`]).toBeDefined(); // pré-condition

		promouvoirEntreesEnAttente(uuid, jour(1), PLAFOND_MAX);

		expect(fileAttente(uuid).attente[`${A}@ce2`]).toBeUndefined(); // purgée
		expect(revisions(uuid)[`${A}@ce2`]).toEqual(etatA); // et rien de détruit
		expect(enRotation(revisions(uuid)[`${B}@ce2`])).toBe(true); // la promotion a bien eu lieu
	});

	it('purge SEULE : la carte est écrite même quand la passe ne promeut rien', () => {
		// Le chemin qui manquait : sans écriture, la purge n'existe qu'en mémoire et la clé
		// est toujours là au rechargement. `fileAttente` relit le stockage, donc l'assertion
		// porte bien sur ce qui est PERSISTÉ.
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);
		const etatA = etatDemarre();
		semerOrpheline(uuid, A, etatA);

		expect(promouvoirEntreesEnAttente(uuid, jour(1), PLAFOND_MAX)).toBe(0);

		expect(fileAttente(uuid).attente).toEqual({});
		expect(revisions(uuid)[`${A}@ce2`]).toEqual(etatA);
	});

	it('une orpheline ACQUISE est purgée aussi (elle est sortie par le haut)', () => {
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		declarer(uuid, [A], T0);
		let acquis = etatNeuf(T0 - 200 * JOUR);
		for (let i = 0; i < PALIER_ACQUIS; i++) acquis = avancerEtat(acquis, true, T0 - JOUR);
		semerOrpheline(uuid, A, acquis);
		expect(estAcquis(acquis)).toBe(true); // la fixture est bien au sommet

		promouvoirEntreesEnAttente(uuid, jour(1), PLAFOND_MAX);

		expect(fileAttente(uuid).attente).toEqual({});
		expect(revisions(uuid)[`${A}@ce2`]).toEqual(acquis);
	});

	it('une entrée qui attend VRAIMENT n’est ni purgée ni redatée', () => {
		// Le pendant : la purge ne doit pas emporter la file elle-même. La date de mise en
		// attente est ce qui porte l'ancienneté et le seuil des 4 semaines — la voir bouger
		// au fil des passes repousserait l'entrée indéfiniment.
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		vivreLesJours(uuid, 0, 6, 2); // chauffe : la déclaration arrive budget saturé
		declarer(uuid, [A], jour(7));
		const dateAttente = fileAttente(uuid).attente[`${A}@ce2`];
		expect(dateAttente).toBe(jour(7));

		vivreLesJours(uuid, 7, 20, 2);

		expect(fileAttente(uuid).attente[`${A}@ce2`]).toBe(dateAttente);
		expect(estHorsRotation(revisions(uuid)[`${A}@ce2`])).toBe(true);
	});
});

/* ============================================================
   10) Critère 14 — la borne ne borne QUE l'entrée en rotation
   ------------------------------------------------------------
   Le volet « une leçon en attente ne devient pas injouable à l'écran » relève d'un smoke
   Playwright. Ce qui se mécanise ici : la leçon reste dans le catalogue, elle génère
   toujours un exercice, et elle reste dans le périmètre « ce que tu connais déjà » du
   sprint — c'est la fonction même de #478, qui ne doit pas être payée par le gate.
   ============================================================ */
describe('critère 14 — une leçon en file d’attente reste accessible', () => {
	it('elle reste dans le catalogue et génère toujours un exercice', () => {
		const uuid = activeProfile().uuid;
		const ids = leconsCe2().slice(0, 101);
		declarer(uuid, ids, T0);

		for (const id of ids.slice(0, 12)) {
			const l = getLessonById(id);
			expect(l, id).toBeTruthy();
			expect(() => genLessonItem(l!, 'ce2'), id).not.toThrow();
		}
	});

	it('elle reste dans le périmètre « ce que tu connais déjà » du sprint (#478)', () => {
		const uuid = activeProfile().uuid;
		const A = leconsCe2()[0];
		vivreLesJours(uuid, 0, 6, 2); // chauffe : la déclaration arrive dans un budget saturé
		declarer(uuid, [A], jour(7));

		expect(estRencontree(A, loadRencontrees())).toBe(true);
		vivreLesJours(uuid, 7, 27, 2); // toujours en attente, toujours dans le périmètre
		expect(estHorsRotation(revisions(uuid)[`${A}@ce2`])).toBe(true);
		expect(estRencontree(A, loadRencontrees())).toBe(true);
	});
});
