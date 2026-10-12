/* ============================================================
   Journal d'erreurs scopé par classe (#573) — volet JOURNAL.
   ------------------------------------------------------------
   Cibles : journaliserErreur / journaliserErreursFor / chargerErreursFor /
   grouperErreursParLecon / niveauErreur (core/erreurs-journal), capterErreur
   (ui/erreur-capture), imposerNiveauLecon / leverNiveauImpose / niveauLecon
   (core/niveau-actif), erreursDuResultat (core/partage/import).

   Auteur des tests DISTINCT de l'auteur du code, tests écrits AVANT l'implémentation.
   Les attendus viennent des critères de l'issue, pas du code :
   - une erreur porte la classe suivie POUR SA MATIÈRE au moment où elle est faite ;
   - deux classes = deux groupes, et le titre d'un groupe est celui de la classe
     ENREGISTRÉE (basculer la matière ne réécrit rien) ;
   - l'existant sans classe est lu comme du CE2, rien ne se perd ni ne se dédouble ;
   - le hors catalogue (listes d'orthographe) n'est pas scopé ;
   - le journal ne filtre pas sur la classe suivie.

   Leçon témoin : `fr-gram-clic-noyau`, seule leçon dont le libellé change entre CE2 et
   CM1 (« nom » / « nom noyau ») — c'est ce qui rend le critère 2 observable. Les autres
   leçons sont choisies DYNAMIQUEMENT (un id en dur mentirait dès qu'une leçon change de
   classe).
   ============================================================ */
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
	journaliserErreur,
	journaliserErreursFor,
	chargerErreursFor,
	grouperErreursParLecon,
	niveauErreur,
	ERREURS_KEY,
	type ErreurEntry,
	type GroupeErreursLecon,
} from '../src/core/erreurs-journal';
import { capterErreur, type CaptureErreurOpts } from '../src/ui/erreur-capture';
import { imposerNiveauLecon, leverNiveauImpose, niveauLecon } from '../src/core/niveau-actif';
import { erreursDuResultat } from '../src/core/partage/import';
import type { Resultat, ReponseItem } from '../src/core/partage/resultat';
import {
	getAllLessons,
	getLessonById,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { labelLecon } from '../src/core/levels';
import {
	initProfiles,
	activeProfile,
	addProfile,
	setNiveauReferenceFor,
	setNiveauMatiereFor,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw, PROFILES_KEY } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Repères de catalogue ---------- */
const TEMOIN = 'fr-gram-clic-noyau';
/* Liste d'orthographe personnelle : hors catalogue (vérifié par la précondition). */
const LISTE = 'liste-mots-de-la-semaine';

function temoin(): LessonDef {
	const l = getLessonById(TEMOIN);
	if (!l) throw new Error('leçon témoin ' + TEMOIN + ' absente : test à réviser');
	return l;
}
function leconTelleQue(pred: (l: LessonDef) => boolean, quoi: string): LessonDef {
	const l = getAllLessons().find(pred);
	if (!l) throw new Error('aucune leçon ' + quoi + ' : test à réviser');
	return l;
}
/* Leçon jouable en CE2 mais pas en CM1 (un CM1 qui l'ouvre la joue en CE2). */
const ce2Seule = () =>
	leconTelleQue(
		(l) => l.levels.includes('ce2') && !l.levels.includes('cm1'),
		'jouable en CE2 sans CM1',
	);
/* Leçon jouable en CM1 mais pas en CE2 (un CE2 qui l'ouvre la joue en CM1). */
const cm1Seule = () =>
	leconTelleQue(
		(l) => l.levels.includes('cm1') && !l.levels.includes('ce2'),
		'jouable en CM1 sans CE2',
	);
/* Une AUTRE leçon de la même matière que la témoin, jouable en CE2 et en CM1. */
const autreDeuxNiveaux = () =>
	leconTelleQue(
		(l) =>
			l.id !== TEMOIN &&
			l.subject === temoin().subject &&
			l.levels.includes('ce2') &&
			l.levels.includes('cm1'),
		'de ' + temoin().subject + ' portant CE2 et CM1, autre que la témoin',
	);

/* ---------- Profil ---------- */
const uuid = () => activeProfile().uuid;
/* Classe suivie pour la matière d'une leçon (par défaut la témoin). */
function suivre(niveau: SchoolLevel, lesson: LessonDef = temoin()): void {
	setNiveauMatiereFor(uuid(), lesson.subject, niveau);
}

/* ---------- Capture ---------- */
let compteur = 0;
/* Chaque capture a un énoncé distinct par défaut : aucun dédoublonnage involontaire. */
function capter(over: Partial<CaptureErreurOpts> = {}): void {
	compteur++;
	capterErreur({
		text: 'Phrase numéro ' + compteur + '.',
		donnee: 'dort',
		attendue: 'chat',
		lessonId: TEMOIN,
		mode: 'lecon',
		...over,
	});
}
const stockees = () => chargerErreursFor(uuid());
const groupes = () => grouperErreursParLecon(stockees());
const groupesDe = (lessonId: string, gs: GroupeErreursLecon[] = groupes()) =>
	gs.filter((g) => g.lessonId === lessonId);
/* Total de chaque groupe, indexé par sa classe (`aucune` pour un groupe non scopé). */
const totauxParNiveau = (gs: GroupeErreursLecon[]): Record<string, number> =>
	Object.fromEntries(gs.map((g) => [g.niveau ?? 'aucune', g.total]));
/* Titre d'un groupe tel que l'espace encadrant le compose (critère 2). */
function titre(g: GroupeErreursLecon): string {
	const l = getLessonById(g.lessonId);
	return l ? labelLecon(l, g.niveau ?? undefined) : g.lessonId;
}
/* Entrée brute, telle qu'une version antérieure l'a écrite (aucun champ `niveau`). */
function brute(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		ts: 1000,
		lessonId: TEMOIN,
		mode: 'lecon',
		question: 'Ancienne question',
		donnee: 'dort',
		attendue: 'chat',
		...over,
	};
}
function semer(entrees: Record<string, unknown>[], cible = uuid()): void {
	lsSetRaw(cible + '/' + ERREURS_KEY, JSON.stringify(entrees));
}

describe('préconditions du catalogue (sinon les tests ne prouvent rien)', () => {
	it('la témoin porte CE2 et CM1 avec deux libellés distincts ; la liste est hors catalogue', () => {
		const l = temoin();
		expect(l.levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
		expect(labelLecon(l, 'ce2')).not.toBe(labelLecon(l, 'cm1'));
		expect(getLessonById(LISTE)).toBeUndefined();
	});
});

describe('critère 1 : une erreur porte la classe suivie pour sa matière au moment de l’erreur', () => {
	it('capturée en CE2 puis en CM1 : la première est stockée ce2, la seconde cm1', () => {
		suivre('ce2');
		capter();
		suivre('cm1');
		capter();
		// Plus récent d'abord.
		expect(stockees().map((e) => e.niveau)).toEqual(['cm1', 'ce2']);
	});

	it('deux erreurs sur la témoin, l’une en CE2, l’autre en CM1, forment DEUX groupes', () => {
		suivre('ce2');
		capter();
		suivre('cm1');
		capter();
		const gs = groupesDe(TEMOIN);
		expect(gs).toHaveLength(2);
		const parNiveau = totauxParNiveau(gs);
		expect(parNiveau).toEqual({ ce2: 1, cm1: 1 });
	});

	it('la classe est celle de la MATIÈRE de la leçon, pas la classe de référence ni une autre matière', () => {
		const l = temoin();
		// Classe de référence CM1, une autre matière en CM1, mais la matière de la témoin en CE2.
		setNiveauReferenceFor(uuid(), 'cm1');
		const autreMatiere = getAllLessons().find((x) => x.subject !== l.subject);
		if (!autreMatiere) throw new Error('catalogue à une seule matière : test à réviser');
		setNiveauMatiereFor(uuid(), autreMatiere.subject, 'cm1');
		suivre('ce2');
		capter();
		expect(stockees()[0].niveau).toBe('ce2');
	});

	it('la classe suivie est résolue sur les niveaux de la leçon (CE2 seule jouée par un CM1 → ce2)', () => {
		const l = ce2Seule();
		suivre('cm1', l);
		capter({ lessonId: l.id });
		expect(stockees()[0].niveau).toBe('ce2');
	});

	it('journaliserErreur (sans passer par capterErreur) estampille aussi la classe', () => {
		suivre('cm1');
		journaliserErreur({
			lessonId: TEMOIN,
			mode: 'lecon',
			question: 'Q directe',
			donnee: 'x',
			attendue: 'y',
		});
		expect(stockees()[0].niveau).toBe('cm1');
	});
});

describe('classe fournie explicitement par l’appelant', () => {
	it('prime sur la classe suivie', () => {
		suivre('cm1');
		capter({ niveau: 'ce2' });
		expect(stockees()[0].niveau).toBe('ce2');
	});

	it('une classe que la leçon ne porte pas est ramenée à la plus proche en dessous (CM2 → cm1)', () => {
		suivre('ce2');
		capter({ niveau: 'cm2' });
		expect(stockees()[0].niveau).toBe('cm1');
	});

	it('une classe sous tous les niveaux de la leçon est ramenée au plus bas (CE2 sur CM1 seule → cm1)', () => {
		const l = cm1Seule();
		suivre('ce2', l);
		capter({ lessonId: l.id, niveau: 'ce2' });
		expect(stockees()[0].niveau).toBe('cm1');
	});
});

describe('critère 2 : le titre d’un groupe est celui de la classe ENREGISTRÉE', () => {
	it('basculer la matière en CM1 ne change ni le niveau ni le titre du groupe CE2', () => {
		const l = temoin();
		suivre('ce2');
		capter();
		const avant = groupesDe(TEMOIN);
		expect(avant).toHaveLength(1);
		expect(avant[0].niveau).toBe('ce2');
		const titreAvant = titre(avant[0]);

		suivre('cm1');
		const apres = groupesDe(TEMOIN);
		expect(apres).toHaveLength(1);
		expect(apres[0].niveau).toBe('ce2');
		expect(titre(apres[0])).toBe(titreAvant);
		expect(titre(apres[0])).toBe(labelLecon(l, 'ce2'));
		expect(titre(apres[0])).not.toBe(labelLecon(l, 'cm1'));
	});

	it('les deux groupes d’une même leçon portent chacun le libellé de leur classe', () => {
		const l = temoin();
		suivre('ce2');
		capter();
		suivre('cm1');
		capter();
		const titres = groupesDe(TEMOIN).map(titre).sort();
		expect(titres).toEqual([labelLecon(l, 'ce2'), labelLecon(l, 'cm1')].sort());
	});
});

describe('critère 4 : les entrées stockées sans classe sont lues comme du CE2', () => {
	it('profil en CM1 : trois anciennes entrées relues toutes, en un seul groupe CE2, total conservé', () => {
		semer([
			brute({ ts: 3, question: 'A' }),
			brute({ ts: 2, question: 'B' }),
			brute({ ts: 1, question: 'C' }),
		]);
		suivre('cm1');
		expect(stockees()).toHaveLength(3);
		const gs = groupesDe(TEMOIN);
		expect(gs).toHaveLength(1);
		expect(gs[0].niveau).toBe('ce2');
		expect(gs[0].total).toBe(3);
		expect(gs[0].erreurs.map((e) => e.question)).toEqual(['A', 'B', 'C']);
	});

	it('niveauErreur lit une entrée de leçon du catalogue sans classe comme ce2', () => {
		semer([brute()]);
		suivre('cm1');
		expect(niveauErreur(stockees()[0])).toBe('ce2');
	});

	it('ancienne entrée sans classe + nouvelle entrée CE2 : un seul groupe, la même erreur fusionnée', () => {
		semer([brute({ ts: 1, question: 'Même question', donnee: 'même réponse' })]);
		suivre('ce2');
		capter({ text: 'Même question', donnee: 'même réponse' });
		const gs = groupesDe(TEMOIN);
		expect(gs).toHaveLength(1);
		expect(gs[0].niveau).toBe('ce2');
		expect(gs[0].total).toBe(2);
		expect(gs[0].erreurs).toHaveLength(1);
		expect(gs[0].erreurs[0].occurrences).toBe(2);
	});

	it('une nouvelle capture en CM1 ne fait perdre aucune ancienne entrée', () => {
		semer([brute({ question: 'A' }), brute({ question: 'B' })]);
		suivre('cm1');
		capter();
		expect(stockees()).toHaveLength(3);
		const parNiveau = totauxParNiveau(groupesDe(TEMOIN));
		expect(parNiveau).toEqual({ ce2: 2, cm1: 1 });
	});

	it.each([['zz'], [42], [null]])(
		'une classe stockée invalide (%j) n’est pas perdue : lue comme une entrée sans classe',
		(invalide) => {
			semer([brute({ niveau: invalide, question: 'Invalide' }), brute({ question: 'Ancienne' })]);
			suivre('cm1');
			const lues = stockees();
			expect(lues).toHaveLength(2);
			expect(lues.map(niveauErreur)).toEqual(['ce2', 'ce2']);
			const gs = groupesDe(TEMOIN);
			expect(gs).toHaveLength(1);
			expect(gs[0].niveau).toBe('ce2');
			expect(gs[0].total).toBe(2);
		},
	);

	it('une entrée à classe invalide survit à une nouvelle capture (relecture au moment d’écrire)', () => {
		semer([brute({ niveau: 'zz' })]);
		suivre('cm1');
		capter();
		expect(stockees()).toHaveLength(2);
	});

	/* POINT DE CONTRAT À TRANCHER. Le contrat donne `'ce2'` en dur comme repli, mais une
	   leçon CM1 seule n'a pas de CE2 : ses anciennes entrées tomberaient dans un groupe
	   « ce2 » et ses nouvelles dans un groupe « cm1 », sous le MÊME titre (labelLecon
	   ramène les deux au CM1). Le parent verrait la leçon deux fois, ce que le critère 4
	   exclut (« ni dédoublée »). Ce test garde l'exigence, pas la valeur du repli. */
	it('une leçon CM1 seule ne se dédouble pas entre ses entrées anciennes et nouvelles', () => {
		const l = cm1Seule();
		semer([brute({ lessonId: l.id })]);
		suivre('cm1', l);
		capter({ lessonId: l.id });
		const gs = groupesDe(l.id);
		expect(gs).toHaveLength(1);
		expect(gs[0].total).toBe(2);
	});
});

describe('critère 5 : les entrées hors catalogue ne sont pas scopées', () => {
	it('une liste d’orthographe ratée en CE2 puis en CM1 reste UN groupe, sans classe', () => {
		suivre('ce2');
		capter({ lessonId: LISTE });
		suivre('cm1');
		capter({ lessonId: LISTE });
		const gs = groupesDe(LISTE);
		expect(gs).toHaveLength(1);
		expect(gs[0].niveau).toBeNull();
		expect(gs[0].total).toBe(2);
	});

	it('aucune clé `niveau` n’est stockée, même quand l’appelant en fournit une', () => {
		suivre('cm1');
		capter({ lessonId: LISTE });
		capter({ lessonId: LISTE, niveau: 'cm1' });
		journaliserErreur({
			lessonId: LISTE,
			mode: 'dictee',
			question: 'Q directe',
			donnee: 'x',
			attendue: 'y',
			niveau: 'ce2',
		});
		const lues = stockees();
		expect(lues).toHaveLength(3);
		for (const e of lues) expect(Object.keys(e)).not.toContain('niveau');
	});

	it('niveauErreur rend null hors catalogue, même si une classe traîne dans l’entrée', () => {
		semer([brute({ lessonId: LISTE }), brute({ lessonId: LISTE, niveau: 'cm1' })]);
		expect(stockees().map(niveauErreur)).toEqual([null, null]);
	});

	it('une liste dont les entrées portent des classes différentes reste un seul groupe', () => {
		semer([
			brute({ lessonId: LISTE, niveau: 'ce2', question: 'A' }),
			brute({ lessonId: LISTE, niveau: 'cm1', question: 'B' }),
			brute({ lessonId: LISTE, question: 'C' }),
		]);
		const gs = groupesDe(LISTE);
		expect(gs).toHaveLength(1);
		expect(gs[0].niveau).toBeNull();
		expect(gs[0].total).toBe(3);
	});
});

describe('critère 16 : le journal ne filtre pas sur la classe suivie', () => {
	it('passer en CM1 ne fait disparaître aucun groupe CE2', () => {
		suivre('ce2');
		capter();
		capter();
		suivre('cm1');
		expect(stockees()).toHaveLength(2);
		const ce2 = groupesDe(TEMOIN).filter((g) => g.niveau === 'ce2');
		expect(ce2).toHaveLength(1);
		expect(ce2[0].total).toBe(2);
	});

	it('revenir en CE2 ne fait disparaître aucun groupe CM1', () => {
		suivre('cm1');
		capter();
		suivre('ce2');
		const cm1 = groupesDe(TEMOIN).filter((g) => g.niveau === 'cm1');
		expect(cm1).toHaveLength(1);
		expect(cm1[0].total).toBe(1);
	});
});

describe('critère 17 (journal) : seul `ludaskia_erreurs` change de forme', () => {
	function instantane(): Map<string, string> {
		const m = new Map<string, string>();
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k !== null) m.set(k, localStorage.getItem(k) ?? '');
		}
		return m;
	}
	/* La méta des profils est datée à chaque écriture (`touchActiveProfile`) : on compare
	   tout SAUF cette date. */
	function sansDate(brut: string | undefined): unknown {
		if (brut === undefined) return undefined;
		const parse: unknown = JSON.parse(brut, (k, v: unknown) => (k === 'updatedAt' ? undefined : v));
		return parse;
	}

	it('capturer une erreur n’écrit que le journal, qui gagne seulement le champ `niveau`', () => {
		suivre('cm1');
		const avant = instantane();
		capter();
		const apres = instantane();

		const cleJournal = uuid() + '/' + ERREURS_KEY;
		const changees = [...new Set([...avant.keys(), ...apres.keys()])].filter(
			(k) => avant.get(k) !== apres.get(k),
		);
		expect(changees.filter((k) => k !== cleJournal && k !== PROFILES_KEY)).toEqual([]);
		expect(sansDate(apres.get(PROFILES_KEY))).toEqual(sansDate(avant.get(PROFILES_KEY)));

		const permis = [
			'ts',
			'lessonId',
			'mode',
			'question',
			'donnee',
			'attendue',
			'sansTentative',
			'niveau',
		];
		const e = stockees()[0];
		for (const cle of Object.keys(e)) expect(permis).toContain(cle);
		expect(e.niveau).toBe('cm1');
	});
});

describe('niveau IMPOSÉ pour une leçon', () => {
	beforeEach(() => leverNiveauImpose());
	afterEach(() => leverNiveauImpose());

	it('sous imposition CE2, matière en CM1 : l’erreur sur la leçon imposée est stockée ce2', () => {
		suivre('cm1');
		imposerNiveauLecon(TEMOIN, 'ce2');
		expect(niveauLecon(temoin())).toBe('ce2');
		capter();
		expect(stockees()[0].niveau).toBe('ce2');
	});

	it('une AUTRE leçon capturée pendant l’imposition garde la classe suivie', () => {
		const autre = autreDeuxNiveaux();
		suivre('cm1');
		imposerNiveauLecon(TEMOIN, 'ce2');
		expect(niveauLecon(autre)).toBe('cm1');
		capter({ lessonId: autre.id });
		expect(stockees()[0].niveau).toBe('cm1');
	});

	it('après leverNiveauImpose, la leçon revient à la classe suivie', () => {
		suivre('cm1');
		imposerNiveauLecon(TEMOIN, 'ce2');
		capter();
		leverNiveauImpose();
		expect(niveauLecon(temoin())).toBe('cm1');
		capter();
		expect(stockees().map((e) => e.niveau)).toEqual(['cm1', 'ce2']);
	});

	it('une classe imposée que la leçon ne porte pas est résolue sur ses niveaux (CM2 → cm1)', () => {
		suivre('ce2');
		imposerNiveauLecon(TEMOIN, 'cm2');
		expect(niveauLecon(temoin())).toBe('cm1');
		capter();
		expect(stockees()[0].niveau).toBe('cm1');
	});
});

describe('import d’une séance partagée (#734)', () => {
	function reponse(over: Partial<ReponseItem> = {}): ReponseItem {
		return {
			lecon: TEMOIN,
			enonce: 'Énoncé',
			saisie: 'dort',
			attendue: 'chat',
			statut: 'faux',
			...over,
		};
	}
	function resultat(niveau: SchoolLevel | undefined, reponses: ReponseItem[]): Resultat {
		return {
			id: 'res-1',
			envoi: { id: 'env-1', libelle: 'Séance', ...(niveau ? { niveau } : {}) },
			pseudo: 'Léo',
			date: 5000,
			reponses,
		};
	}

	it('envoi en CM1, profil actif en CE2 : les erreurs portent cm1', () => {
		suivre('ce2');
		const r = resultat('cm1', [
			reponse({ enonce: 'A' }),
			reponse({ enonce: 'B', statut: 'jnsp', saisie: '' }),
			reponse({ enonce: 'C', statut: 'juste' }),
		]);
		const entrees = erreursDuResultat(r);
		expect(entrees.map((e) => [e.question, e.niveau])).toEqual([
			['A', 'cm1'],
			['B', 'cm1'],
		]);
	});

	it('la classe de l’envoi est résolue sur les niveaux de la leçon (CM1 sur une CE2 seule → ce2)', () => {
		const l = ce2Seule();
		const entrees = erreursDuResultat(resultat('cm1', [reponse({ lecon: l.id })]));
		expect(entrees[0].niveau).toBe('ce2');
	});

	it.each([['cm1' as const], [undefined]])(
		'le résultat ne dépend jamais de la classe du profil actif (envoi.niveau = %s)',
		(niveauEnvoi) => {
			const r = resultat(niveauEnvoi, [reponse()]);
			suivre('ce2');
			const enCe2 = erreursDuResultat(r);
			suivre('cm1');
			const enCm1 = erreursDuResultat(r);
			expect(enCm1).toEqual(enCe2);
		},
	);

	it('journaliserErreursFor conserve la classe importée sur un profil non actif', () => {
		suivre('ce2');
		const cible = addProfile('Importé', undefined, { activer: false }).uuid;
		setNiveauMatiereFor(cible, temoin().subject, 'ce2');
		const entrees = erreursDuResultat(resultat('cm1', [reponse()]));
		expect(journaliserErreursFor(cible, entrees)).toBe(1);
		const lues = chargerErreursFor(cible);
		expect(lues).toHaveLength(1);
		expect(lues[0].niveau).toBe('cm1');
		expect(groupesDe(TEMOIN, grouperErreursParLecon(lues))[0].niveau).toBe('cm1');
	});
});

describe('tri et dédoublonnage inchangés à l’intérieur d’un groupe scopé', () => {
	const e = (over: Partial<ErreurEntry>): ErreurEntry => ({
		ts: 0,
		lessonId: TEMOIN,
		mode: 'lecon',
		question: 'Q1',
		donnee: 'D1',
		attendue: 'R1',
		...over,
	});

	it('dédoublonne dans une classe, jamais à travers deux classes ; trie au volume', () => {
		const autre = autreDeuxNiveaux().id;
		const gs = grouperErreursParLecon([
			e({ ts: 10, niveau: 'ce2' }),
			e({ ts: 30, niveau: 'ce2' }),
			e({ ts: 20, niveau: 'ce2', question: 'Q2', donnee: 'D2' }),
			// Même question, même réponse, mais en CM1 : autre groupe, pas une occurrence de plus.
			e({ ts: 40, niveau: 'cm1' }),
			e({ ts: 50, lessonId: autre, niveau: 'ce2' }),
			e({ ts: 60, lessonId: autre, niveau: 'ce2', question: 'Q3' }),
		]);
		expect(gs.map((g) => [g.lessonId, g.niveau, g.total])).toEqual([
			[TEMOIN, 'ce2', 3],
			[autre, 'ce2', 2],
			[TEMOIN, 'cm1', 1],
		]);
		const ce2 = gs[0];
		expect(ce2.derniereFois).toBe(30);
		expect(ce2.erreurs.map((x) => [x.question, x.occurrences, x.ts])).toEqual([
			['Q1', 2, 30],
			['Q2', 1, 20],
		]);
		expect(gs[2].erreurs.map((x) => [x.question, x.occurrences, x.ts])).toEqual([['Q1', 1, 40]]);
	});
});
