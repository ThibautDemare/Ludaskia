/* ============================================================
   File « à revoir » scopée par classe (#573) — volet ÉPINGLES.
   ------------------------------------------------------------
   Une épingle désigne désormais une leçon DANS une classe (`lessonId@niveau`) : épingler le
   groupe CE2 d'une leçon ne touche pas son groupe CM1, et l'enfant joue la leçon dans la
   classe que l'adulte a désignée — énoncés, libellé et stockage compris — même si sa matière
   est suivie dans une autre classe. Les ids NUS déjà stockés restent joués au niveau suivi.

   Couvre les critères 6, 7, 8, 9 et 17 de l'issue. Les attendus viennent de l'issue (format
   `lessonId@niveau`, libellés « Clique sur le nom » / « Clique sur le nom noyau » qu'elle
   cite), jamais du code : ces tests ont été écrits AVANT l'implémentation.

   Hors de ce fichier : le désépinglage automatique et la bascule vers la classe suivie.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	revoirLeconId,
	lireRevoirLecon,
	niveauEntreeLecon,
	entreeEpinglee,
	epingleLecon,
} from '../src/core/revoir-cible';
import {
	imposerNiveauLecon,
	leverNiveauImpose,
	niveauImpose,
	niveauLecon,
} from '../src/core/niveau-actif';
import {
	REVOIR_KEY,
	toggleRevoirFor,
	revoirActives,
	epingleesProfil,
	progressionProfil,
	orthoRevoirId,
	type RevoirEntry,
	type RecapNotion,
} from '../src/core/encadrant-stats';
import { choisirARevoir } from '../src/core/accueil-propositions';
import { recordLessonRun, type LessonRunInput } from '../src/core/lesson-run';
import { STARS_KEY, LESSON_STATS_KEY, LESSON_PALIERS_KEY } from '../src/core/progress';
import {
	getAllLessons,
	getLessonById,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { LEVEL_ORDER, labelLecon } from '../src/core/levels';
import {
	initProfiles,
	activeProfile,
	loadProfilesMeta,
	setNiveauReferenceFor,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { setOnDataWrite, lsSetRaw, lsGetRaw, lsKeysRaw, lsGetItemRaw } from '../src/core/storage';
import { createListe, loadOrtho, saveOrtho } from '../src/core/orthographe/store';

function environnementNeuf(): void {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	leverNiveauImpose(); // état de MODULE : il survivrait d'un test à l'autre
}
beforeEach(environnementNeuf);

const NOW = 1_700_000_000_000; // instant fixe pour le récap

/* ---------- Leçon témoin (citée par l'issue) ---------- */
const X_ID = 'fr-gram-clic-noyau';
const LABEL_CE2 = 'Clique sur le nom';
const LABEL_CM1 = 'Clique sur le nom noyau';
function temoin(): LessonDef {
	const x = getLessonById(X_ID);
	if (!x) throw new Error('leçon témoin absente du catalogue : test à réviser');
	// Prémisses : le test n'a de sens que si la leçon existe aux DEUX classes, libellés distincts.
	expect(x.levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
	expect(labelLecon(x, 'ce2')).toBe(LABEL_CE2);
	expect(labelLecon(x, 'cm1')).toBe(LABEL_CM1);
	return x;
}

/* ---------- Repères de catalogue (pris dynamiquement) ---------- */
function leconTelleQue(pred: (l: LessonDef) => boolean, quoi: string): LessonDef {
	const l = getAllLessons().find(pred);
	if (!l) throw new Error('aucune leçon ' + quoi + ' : test à réviser');
	return l;
}
/** Une AUTRE leçon que le témoin, présente aux deux classes (jouée au niveau suivi). */
const autreDeuxNiveaux = () =>
	leconTelleQue(
		(l) => l.id !== X_ID && l.levels.includes('ce2') && l.levels.includes('cm1'),
		'autre que le témoin, portant CE2 et CM1',
	);
const ce2Seule = () =>
	leconTelleQue((l) => l.levels.includes('ce2') && !l.levels.includes('cm1'), 'CE2 seule');
const cm1Seule = () =>
	leconTelleQue((l) => l.levels.includes('cm1') && !l.levels.includes('ce2'), 'CM1 seule');

/* ---------- Profils ---------- */
function profilRelu(uuid: string): Profile {
	const p = loadProfilesMeta()!.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	return p;
}
/** Profil ACTIF passé dans la classe donnée (toutes matières), relu depuis la méta. */
function profilEn(niveau: SchoolLevel): Profile {
	const uuid = activeProfile().uuid;
	setNiveauReferenceFor(uuid, niveau);
	return profilRelu(uuid);
}
/** Écriture BRUTE d'une carte namespacée, comme le stockage la range vraiment. */
function seed(uuid: string, key: string, value: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(value));
}
function fileBrute(uuid: string): unknown {
	return lsGetRaw(uuid + '/' + REVOIR_KEY, null);
}

/* ---------- Sessions ---------- */
function sessionParfaite(lessonId: string): LessonRunInput {
	return {
		mode: 'lecon',
		lessonId,
		ok: 5,
		questionCount: 5,
		ms: 30_000,
		perLesson: { [lessonId]: { ok: 5, total: 5 } },
	};
}
/** Laisse passer les microtâches (journal des paliers, écrit après la session). */
const finDeTache = () => new Promise<void>((r) => setTimeout(r, 0));

/** Toutes les traces du profil qui nomment `motif` (clé de stockage → extrait brut). */
function tracesNommant(uuid: string, motif: string): string[] {
	return lsKeysRaw()
		.filter((k) => k.startsWith(uuid + '/'))
		.filter((k) => k.includes(motif) || (lsGetItemRaw(k) ?? '').includes(motif));
}

/** Empreinte d'une session dans le stockage du profil : pour chaque clé dont la valeur nomme
    la leçon, la STRUCTURE de cette valeur (noms de champs, chaînes, types ; nombres effacés,
    pour que deux sessions à deux instants différents soient comparables). */
function empreinte(uuid: string, lessonId: string): Record<string, string> {
	const forme = (v: unknown): string => {
		if (Array.isArray(v)) return '[' + v.map(forme).join(',') + ']';
		if (v !== null && typeof v === 'object')
			return (
				'{' +
				Object.keys(v)
					.sort()
					.map((k) => k + ':' + forme((v as Record<string, unknown>)[k]))
					.join(',') +
				'}'
			);
		if (typeof v === 'number') return '#';
		return JSON.stringify(v);
	};
	const out: Record<string, string> = {};
	for (const k of lsKeysRaw()) {
		if (!k.startsWith(uuid + '/')) continue;
		const brut = lsGetItemRaw(k) ?? '';
		if (!brut.includes(lessonId)) continue;
		out[k.slice(uuid.length + 1)] = forme(JSON.parse(brut));
	}
	return out;
}

/* ============================================================
   1. Forme d'une épingle de leçon : `lessonId@niveau`
   ============================================================ */
describe('revoirLeconId / lireRevoirLecon — format de l’entrée de file', () => {
	it('revoirLeconId suffixe la classe : lessonId@niveau', () => {
		expect(revoirLeconId(X_ID, 'ce2')).toBe('fr-gram-clic-noyau@ce2');
		expect(revoirLeconId(X_ID, 'cm1')).toBe('fr-gram-clic-noyau@cm1');
	});

	it('aller-retour exact pour chaque classe connue', () => {
		for (const niveau of LEVEL_ORDER)
			expect(lireRevoirLecon(revoirLeconId(X_ID, niveau))).toEqual({ lessonId: X_ID, niveau });
	});

	it('id NU (épingle d’avant la mise à jour) → pas de classe', () => {
		expect(lireRevoirLecon(X_ID)).toEqual({ lessonId: X_ID, niveau: null });
	});

	it('suffixe de classe inconnu → id sans suffixe, classe nulle (repli sur le niveau suivi)', () => {
		expect(lireRevoirLecon(X_ID + '@zz')).toEqual({ lessonId: X_ID, niveau: null });
	});
});

/* ============================================================
   2. Niveau auquel une entrée de file sera jouée
   ============================================================ */
describe('niveauEntreeLecon — classe de jeu d’une entrée', () => {
	it('épingle scopée : la classe épinglée, quelle que soit la classe suivie', () => {
		const x = temoin();
		expect(niveauEntreeLecon(x, 'ce2', 'cm1')).toBe('ce2'); // en dessous
		expect(niveauEntreeLecon(x, 'cm1', 'ce2')).toBe('cm1'); // au-dessus
		expect(niveauEntreeLecon(x, 'cm1', 'cm1')).toBe('cm1');
	});

	it('id nu : la classe suivie (comportement d’avant la mise à jour)', () => {
		const x = temoin();
		expect(niveauEntreeLecon(x, null, 'cm1')).toBe('cm1');
		expect(niveauEntreeLecon(x, null, 'ce2')).toBe('ce2');
	});

	it('repli/clamp : on ne joue jamais une leçon à une classe qu’elle n’a pas', () => {
		const y = ce2Seule();
		expect(niveauEntreeLecon(y, null, 'cm1')).toBe('ce2'); // id nu, classe suivie absente
		const z = cm1Seule();
		expect(niveauEntreeLecon(z, 'ce2', 'ce2')).toBe('cm1'); // classe épinglée absente
	});
});

/* ============================================================
   3. Critère 6 — deux groupes, deux épingles indépendantes
   ============================================================ */
describe('critère 6 : épingler le groupe CM1 n’épingle pas le groupe CE2', () => {
	it('chaque groupe a son entrée, posée et retirée sans toucher l’autre', () => {
		const x = temoin();
		const uuid = profilEn('cm1').uuid;

		let file = toggleRevoirFor(uuid, revoirLeconId(X_ID, 'cm1'));
		expect(entreeEpinglee(file, x, 'cm1', 'cm1')).toBe('fr-gram-clic-noyau@cm1');
		expect(entreeEpinglee(file, x, 'ce2', 'cm1')).toBeNull(); // échec : l’autre bascule

		file = toggleRevoirFor(uuid, revoirLeconId(X_ID, 'ce2'));
		expect(entreeEpinglee(file, x, 'ce2', 'cm1')).toBe('fr-gram-clic-noyau@ce2');
		expect(entreeEpinglee(file, x, 'cm1', 'cm1')).toBe('fr-gram-clic-noyau@cm1');
		// Le stockage porte la classe, dans l’ordre des gestes.
		expect(fileBrute(uuid)).toEqual(['fr-gram-clic-noyau@cm1', 'fr-gram-clic-noyau@ce2']);

		// Dé-épingler le groupe CM1 laisse le groupe CE2 épinglé.
		file = toggleRevoirFor(uuid, revoirLeconId(X_ID, 'cm1'));
		expect(entreeEpinglee(file, x, 'cm1', 'cm1')).toBeNull();
		expect(entreeEpinglee(file, x, 'ce2', 'cm1')).toBe('fr-gram-clic-noyau@ce2');
		expect(fileBrute(uuid)).toEqual(['fr-gram-clic-noyau@ce2']);
	});

	it('id nu : épingle la classe où il se résout pour la classe suivie, et elle seule', () => {
		const x = temoin();
		expect(entreeEpinglee([X_ID], x, 'cm1', 'cm1')).toBe(X_ID);
		expect(entreeEpinglee([X_ID], x, 'ce2', 'cm1')).toBeNull();
		expect(entreeEpinglee([X_ID], x, 'ce2', 'ce2')).toBe(X_ID);
		expect(entreeEpinglee([X_ID], x, 'cm1', 'ce2')).toBeNull();
		// Leçon CE2 seule chez un CM1 : l’id nu se joue en CE2 (repli), c’est donc là qu’il épingle.
		const y = ce2Seule();
		expect(entreeEpinglee([y.id], y, 'ce2', 'cm1')).toBe(y.id);
	});

	it('ne confond pas la leçon avec une autre dont l’id commence pareil', () => {
		const x = temoin();
		const voisins = [X_ID + '-bis', X_ID + '-bis@ce2', X_ID + '-bis@cm1'];
		expect(entreeEpinglee(voisins, x, 'ce2', 'cm1')).toBeNull();
		expect(entreeEpinglee(voisins, x, 'cm1', 'cm1')).toBeNull();
	});

	it('accepte n’importe quel itérable (Set compris)', () => {
		const x = temoin();
		const file = new Set(['ortho:abc', 'fr-gram-clic-noyau@ce2']);
		expect(entreeEpinglee(file, x, 'ce2', 'cm1')).toBe('fr-gram-clic-noyau@ce2');
		expect(entreeEpinglee(file, x, 'cm1', 'cm1')).toBeNull();
	});
});

/* ============================================================
   4. Lecture par l'enfant — revoirActives (critères 7 et 8)
   ============================================================ */
describe('revoirActives — ce que l’enfant voit, et à quelle classe', () => {
	it('critère 7 : groupe CE2 épinglé chez un CM1 → entrée CE2, libellé CE2', () => {
		temoin();
		const uuid = profilEn('cm1').uuid;
		toggleRevoirFor(uuid, revoirLeconId(X_ID, 'ce2'));
		const vues = revoirActives();
		expect(vues).toHaveLength(1);
		expect(vues[0]).toMatchObject({
			kind: 'lecon',
			id: X_ID, // id NU : c’est lui qui lance la leçon
			entryId: 'fr-gram-clic-noyau@ce2', // id de file tel que stocké
			niveau: 'ce2',
			label: LABEL_CE2, // échec : « Clique sur le nom noyau »
		});
		expect(vues[0].kind === 'lecon' && vues[0].lesson.id).toBe(X_ID);
	});

	it('critère 8 : id NU semé avant la mise à jour, enfant en CM1 → toujours là, joué en CM1', () => {
		temoin();
		const uuid = profilEn('cm1').uuid;
		seed(uuid, REVOIR_KEY, [X_ID]); // file écrite par l’ancienne version
		const vues = revoirActives();
		expect(vues).toHaveLength(1); // échec : elle disparaît de la file
		expect(vues[0]).toMatchObject({
			kind: 'lecon',
			id: X_ID,
			entryId: X_ID, // l’entrée reste désignée telle qu’elle est stockée
			niveau: 'cm1', // échec : bascule seule sur du CE2
			label: LABEL_CM1,
		});
	});

	it('critère 8 : id NU chez un CE2 → joué en CE2', () => {
		temoin();
		const uuid = profilEn('ce2').uuid;
		seed(uuid, REVOIR_KEY, [X_ID]);
		expect(revoirActives()).toEqual([
			expect.objectContaining({ id: X_ID, entryId: X_ID, niveau: 'ce2', label: LABEL_CE2 }),
		]);
	});

	it('critère 8 : id NU d’une leçon CE2 seule chez un CM1 → repli CE2, comme aujourd’hui', () => {
		const y = ce2Seule();
		const uuid = profilEn('cm1').uuid;
		seed(uuid, REVOIR_KEY, [y.id]);
		expect(revoirActives()).toEqual([
			expect.objectContaining({ id: y.id, entryId: y.id, niveau: 'ce2' }),
		]);
	});

	it('les deux groupes épinglés coexistent : deux entrées, une par classe, dans l’ordre de la file', () => {
		temoin();
		const uuid = profilEn('cm1').uuid;
		toggleRevoirFor(uuid, revoirLeconId(X_ID, 'ce2'));
		toggleRevoirFor(uuid, revoirLeconId(X_ID, 'cm1'));
		const vues = revoirActives();
		expect(
			vues.map((e) => [e.id, e.entryId, e.kind === 'lecon' ? e.niveau : null, e.label]),
		).toEqual([
			[X_ID, 'fr-gram-clic-noyau@ce2', 'ce2', LABEL_CE2],
			[X_ID, 'fr-gram-clic-noyau@cm1', 'cm1', LABEL_CM1],
		]);
	});

	it('l’état qui fait sortir une entrée se lit à SA classe : une étoile CM1 ne solde pas le groupe CE2', () => {
		temoin();
		const uuid = profilEn('cm1').uuid;
		toggleRevoirFor(uuid, revoirLeconId(X_ID, 'ce2'));
		toggleRevoirFor(uuid, revoirLeconId(X_ID, 'cm1'));

		seed(uuid, STARS_KEY, { 'fr-gram-clic-noyau@cm1': 1 }); // CM1 étoilé, CE2 non
		expect(revoirActives().map((e) => e.entryId)).toEqual(['fr-gram-clic-noyau@ce2']);

		seed(uuid, STARS_KEY, { 'fr-gram-clic-noyau@ce2': 1 }); // l’inverse
		expect(revoirActives().map((e) => e.entryId)).toEqual(['fr-gram-clic-noyau@cm1']);
	});

	it('dictée épinglée : entryId = « ortho: » + id', () => {
		const uuid = activeProfile().uuid;
		const s = loadOrtho();
		const l = createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		saveOrtho(s);
		toggleRevoirFor(uuid, orthoRevoirId(l.id));
		expect(revoirActives()).toEqual([
			expect.objectContaining({ kind: 'ortho', id: l.id, entryId: 'ortho:' + l.id }),
		]);
	});
});

/* ============================================================
   5. Critère 7 — jouer l'épingle dans SA classe (niveau imposé)
   ============================================================ */
describe('critère 7 : une épingle CE2 se JOUE en CE2 chez un enfant suivi en CM1', () => {
	it('de l’entrée de file au niveau de jeu : niveau et libellé du CE2', () => {
		const x = temoin();
		const uuid = profilEn('cm1').uuid;
		expect(niveauLecon(x)).toBe('cm1'); // prémisse : sans imposition, la classe suivie
		toggleRevoirFor(uuid, revoirLeconId(X_ID, 'ce2'));

		const entree = revoirActives()[0];
		if (entree?.kind !== 'lecon') throw new Error('entrée de leçon attendue');
		imposerNiveauLecon(entree.id, entree.niveau); // ce que fait le lancement depuis la carte
		expect(niveauImpose(X_ID)).toBe('ce2');
		expect(niveauLecon(x)).toBe('ce2'); // ce qui part à la génération (énoncés, consigne)
		expect(labelLecon(x, niveauLecon(x))).toBe(LABEL_CE2); // échec : « Clique sur le nom noyau »
	});

	it('l’imposition ne vaut que pour CETTE leçon', () => {
		const x = temoin();
		const autre = autreDeuxNiveaux();
		profilEn('cm1');
		imposerNiveauLecon(X_ID, 'ce2');
		expect(niveauLecon(x)).toBe('ce2');
		expect(niveauImpose(autre.id)).toBeNull();
		expect(niveauLecon(autre)).toBe('cm1');
	});

	it('niveau imposé résolu sur les classes de la leçon (jamais une classe qu’elle n’a pas)', () => {
		const y = ce2Seule();
		profilEn('ce2');
		imposerNiveauLecon(y.id, 'cm1');
		expect(niveauLecon(y)).toBe('ce2');
	});

	it('après leverNiveauImpose(), retour à la classe suivie', () => {
		const x = temoin();
		profilEn('cm1');
		imposerNiveauLecon(X_ID, 'ce2');
		leverNiveauImpose();
		expect(niveauImpose(X_ID)).toBeNull();
		expect(niveauLecon(x)).toBe('cm1');
		expect(labelLecon(x, niveauLecon(x))).toBe(LABEL_CM1);
	});

	it('le résultat est rangé en CE2 : étoile et stats sous …@ce2, rien sous …@cm1', async () => {
		temoin();
		const uuid = profilEn('cm1').uuid;
		imposerNiveauLecon(X_ID, 'ce2');
		recordLessonRun(sessionParfaite(X_ID));
		await finDeTache();

		expect(lsGetRaw(uuid + '/' + STARS_KEY, {})).toEqual({ 'fr-gram-clic-noyau@ce2': 1 });
		expect(Object.keys(lsGetRaw(uuid + '/' + LESSON_STATS_KEY, {}))).toEqual([
			'fr-gram-clic-noyau@ce2',
		]);
		// Aucune trace de la session (révision, report, 1re rencontre, paliers…) côté CM1.
		expect(tracesNommant(uuid, 'fr-gram-clic-noyau@cm1')).toEqual([]);
	});

	it('une fois l’imposition levée, la session suivante revient au CM1', async () => {
		temoin();
		const uuid = profilEn('cm1').uuid;
		imposerNiveauLecon(X_ID, 'ce2');
		recordLessonRun(sessionParfaite(X_ID));
		await finDeTache();
		leverNiveauImpose();
		recordLessonRun(sessionParfaite(X_ID));
		await finDeTache();
		expect(lsGetRaw(uuid + '/' + STARS_KEY, {})).toEqual({
			'fr-gram-clic-noyau@ce2': 1,
			'fr-gram-clic-noyau@cm1': 1,
		});
	});

	it('lever l’imposition dans la même tâche que l’enregistrement ne change rien à la trace rangée', async () => {
		// Les paliers (frise de l'espace encadrant) sont journalisés en MICROTÂCHE, après le
		// retour de recordLessonRun, et le niveau de stockage y est relu. Une imposition levée
		// juste après la session ferait donc perdre le palier « acquis » du CE2 : la session
		// serait rangée à moitié. Référence : la même session, imposition gardée jusqu'au bout.
		temoin();
		const garde = profilEn('cm1').uuid;
		imposerNiveauLecon(X_ID, 'ce2');
		recordLessonRun(sessionParfaite(X_ID));
		await finDeTache();
		const attendue = empreinte(garde, X_ID);
		// Prémisse : la référence contient bien la trace écrite en microtâche (sinon rien à garder).
		expect(attendue[LESSON_PALIERS_KEY]).toBe('{fr-gram-clic-noyau@ce2:{acquis:#}}');

		environnementNeuf();
		const leve = profilEn('cm1').uuid;
		imposerNiveauLecon(X_ID, 'ce2');
		recordLessonRun(sessionParfaite(X_ID));
		leverNiveauImpose(); // même tâche : avant toute microtâche
		await finDeTache();
		expect(empreinte(leve, X_ID)).toEqual(attendue);
	});
});

/* ============================================================
   6. Critère 17 — aucune clé de stockage ne change de forme
   ============================================================ */
describe('critère 17 : une session sous niveau imposé laisse la même empreinte qu’une session ordinaire', () => {
	it('CM1 + imposition CE2 ≡ enfant suivi en CE2 : mêmes clés, même forme de valeurs', async () => {
		temoin();
		// Référence : la même leçon jouée en CE2 par un enfant SUIVI en CE2, sans imposition.
		const ordinaire = profilEn('ce2').uuid;
		recordLessonRun(sessionParfaite(X_ID));
		await finDeTache();
		const attendue = empreinte(ordinaire, X_ID);
		// Prémisse : la référence range bien étoile et stats sous la clé scopée.
		expect(attendue[STARS_KEY]).toBe('{fr-gram-clic-noyau@ce2:#}');
		expect(attendue[LESSON_STATS_KEY]).toMatch(/^\{fr-gram-clic-noyau@ce2:\{/);

		environnementNeuf();
		const impose = profilEn('cm1').uuid;
		imposerNiveauLecon(X_ID, 'ce2');
		recordLessonRun(sessionParfaite(X_ID));
		await finDeTache();
		expect(empreinte(impose, X_ID)).toEqual(attendue);
	});
});

/* ============================================================
   7. Critère 9 — pas de doublon « Ta prochaine leçon » / « À revoir »
   ============================================================ */
function entreeLecon(lesson: LessonDef, niveau: SchoolLevel, entryId: string): RevoirEntry {
	return {
		kind: 'lecon',
		id: lesson.id,
		entryId,
		niveau,
		label: labelLecon(lesson, niveau),
		lesson,
	};
}

describe('critère 9 : choisirARevoir compare la leçon du jour à l’id NU', () => {
	it('même leçon dans deux classes : la carte « À revoir » prend l’autre entrée', () => {
		temoin();
		const autre = autreDeuxNiveaux();
		const uuid = profilEn('cm1').uuid;
		toggleRevoirFor(uuid, revoirLeconId(X_ID, 'ce2'));
		toggleRevoirFor(uuid, revoirLeconId(autre.id, 'cm1'));
		// Leçon du jour = le témoin (en CM1) : « Clique sur le nom » ne doit pas s’afficher à côté.
		const choisie = choisirARevoir(revoirActives(), X_ID);
		expect(choisie?.id).toBe(autre.id);
		expect(choisie?.label).not.toBe(LABEL_CE2);
	});

	it('seule entrée = la leçon du jour dans une autre classe → repli sur elle (pas de carte vide)', () => {
		temoin();
		const uuid = profilEn('cm1').uuid;
		toggleRevoirFor(uuid, revoirLeconId(X_ID, 'ce2'));
		expect(choisirARevoir(revoirActives(), X_ID)).toMatchObject({
			id: X_ID,
			entryId: 'fr-gram-clic-noyau@ce2',
		});
	});

	it('« voir une autre » désigne une entrée par son entryId, même parmi deux entrées de même id nu', () => {
		const x = temoin();
		const autre = autreDeuxNiveaux();
		const entrees = [
			entreeLecon(x, 'ce2', 'fr-gram-clic-noyau@ce2'),
			entreeLecon(x, 'cm1', 'fr-gram-clic-noyau@cm1'),
			entreeLecon(autre, 'cm1', autre.id),
		];
		expect(choisirARevoir(entrees, null, 'fr-gram-clic-noyau@cm1')?.entryId).toBe(
			'fr-gram-clic-noyau@cm1',
		);
		// Choix EXPLICITE de l’enfant : jamais dédupliqué, même s’il vise la leçon du jour.
		expect(choisirARevoir(entrees, X_ID, 'fr-gram-clic-noyau@ce2')?.entryId).toBe(
			'fr-gram-clic-noyau@ce2',
		);
		// Un id nu n’est PAS un entryId de ces entrées : il ne force rien, la règle normale joue.
		expect(choisirARevoir(entrees, X_ID, X_ID)?.entryId).toBe(autre.id);
	});

	it('« voir une autre » sur une dictée : entryId préfixé', () => {
		const x = temoin();
		const s = loadOrtho();
		const l = createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		saveOrtho(s);
		const dictee = revoirActivesDictee(l.id);
		const entrees = [entreeLecon(x, 'cm1', X_ID), dictee];
		expect(choisirARevoir(entrees, null, 'ortho:' + l.id)).toBe(dictee);
	});
});

/** Entrée de dictée telle que la produit la file (épinglée puis relue). */
function revoirActivesDictee(listeId: string): RevoirEntry {
	toggleRevoirFor(activeProfile().uuid, orthoRevoirId(listeId));
	const e = revoirActives().find((v) => v.kind === 'ortho' && v.id === listeId);
	if (!e) throw new Error('dictée épinglée introuvable');
	return e;
}

/* ============================================================
   8. Espace encadrant — liste « Épinglées » (epingleesProfil)
   ============================================================ */
describe('epingleesProfil — une ligne par épingle, à la classe épinglée', () => {
	it('groupe CE2 chez un CM1 : id de file, id nu, libellé et origine du CE2, état lu en CE2', () => {
		temoin();
		const p = profilEn('cm1');
		toggleRevoirFor(p.uuid, revoirLeconId(X_ID, 'ce2'));
		seed(p.uuid, STARS_KEY, { 'fr-gram-clic-noyau@cm1': 1 }); // étoilé en CM1 seulement
		expect(epingleesProfil(profilRelu(p.uuid))).toEqual([
			expect.objectContaining({
				kind: 'lecon',
				id: 'fr-gram-clic-noyau@ce2',
				lessonId: X_ID,
				label: LABEL_CE2,
				origine: { niveau: 'ce2', direction: 'en-dessous' },
				etat: { kind: 'acquisition', niveau: 'a-decouvrir' }, // l’étoile CM1 ne compte pas
			}),
		]);
	});

	it('groupe CM1 chez un CE2 : régime « au-dessus », libellé CM1', () => {
		temoin();
		const p = profilEn('ce2');
		toggleRevoirFor(p.uuid, revoirLeconId(X_ID, 'cm1'));
		expect(epingleesProfil(profilRelu(p.uuid))).toEqual([
			expect.objectContaining({
				id: 'fr-gram-clic-noyau@cm1',
				lessonId: X_ID,
				label: LABEL_CM1,
				origine: { niveau: 'cm1', direction: 'au-dessus' },
			}),
		]);
	});

	it('id nu (critère 8) : classe suivie, id de file = id nu', () => {
		temoin();
		const p = profilEn('cm1');
		seed(p.uuid, REVOIR_KEY, [X_ID]);
		expect(epingleesProfil(profilRelu(p.uuid))).toEqual([
			expect.objectContaining({
				id: X_ID,
				lessonId: X_ID,
				label: LABEL_CM1,
				origine: { niveau: 'cm1', direction: 'classe-suivie' },
			}),
		]);
	});

	it('les deux groupes épinglés → deux lignes distinctes', () => {
		temoin();
		const p = profilEn('cm1');
		toggleRevoirFor(p.uuid, revoirLeconId(X_ID, 'ce2'));
		toggleRevoirFor(p.uuid, revoirLeconId(X_ID, 'cm1'));
		const lignes = epingleesProfil(profilRelu(p.uuid));
		expect(lignes.map((e) => e.id)).toEqual(['fr-gram-clic-noyau@ce2', 'fr-gram-clic-noyau@cm1']);
		expect(lignes.map((e) => e.origine?.niveau)).toEqual(['ce2', 'cm1']);
	});
});

/* ============================================================
   9. Espace encadrant — bouton d'épinglage d'une ligne du récap (progressionProfil)
   ============================================================ */
function ligneDuRecap(p: Profile, lessonId: string): RecapNotion {
	const n = progressionProfil(profilRelu(p.uuid), NOW)
		.parCategorie.flatMap((c) => c.lecons)
		.find((l) => l.lessonId === lessonId);
	if (!n) throw new Error('ligne du récap introuvable : ' + lessonId);
	return n;
}

describe('progressionProfil — état du bouton d’épinglage, classe par classe', () => {
	it('CM1 : une épingle du groupe CE2 n’allume pas la ligne CM1, qui propose son propre id', () => {
		temoin();
		const p = profilEn('cm1');
		toggleRevoirFor(p.uuid, revoirLeconId(X_ID, 'ce2'));
		expect(ligneDuRecap(p, X_ID)).toMatchObject({
			epingle: false,
			entryId: 'fr-gram-clic-noyau@cm1', // l’id à poser si l’adulte épingle cette ligne
		});
	});

	it('CM1 : l’épingle du groupe CM1 allume la ligne, avec son id de file', () => {
		temoin();
		const p = profilEn('cm1');
		toggleRevoirFor(p.uuid, revoirLeconId(X_ID, 'cm1'));
		expect(ligneDuRecap(p, X_ID)).toMatchObject({
			epingle: true,
			entryId: 'fr-gram-clic-noyau@cm1',
		});
	});

	it('critère 8 : un id nu épingle la ligne de la classe suivie (et c’est lui qu’on retirera)', () => {
		temoin();
		const p = profilEn('cm1');
		seed(p.uuid, REVOIR_KEY, [X_ID]);
		expect(ligneDuRecap(p, X_ID)).toMatchObject({ epingle: true, entryId: X_ID });
	});

	it('CE2 : une épingle du groupe CM1 n’allume pas la ligne CE2', () => {
		temoin();
		const p = profilEn('ce2');
		toggleRevoirFor(p.uuid, revoirLeconId(X_ID, 'cm1'));
		expect(ligneDuRecap(p, X_ID)).toMatchObject({
			epingle: false,
			entryId: 'fr-gram-clic-noyau@ce2',
		});
	});
});

/* ============================================================
   10. epingleLecon — état d'UN bouton « Épingler » posé sur une leçon à une classe
   ------------------------------------------------------------
   Source unique des boutons par classe (journal, suivi, sélecteur, étayage). Attendus
   écrits en dur depuis le contrat (`x@niveau` à poser, id stocké rendu tel quel), jamais
   via `revoirLeconId` : un format d'id cassé doit rougir ici aussi.
   ============================================================ */
describe('epingleLecon — état du bouton d’épinglage d’une leçon à une classe', () => {
	it('file vide : rien d’épinglé, le bouton propose l’id scopé à SA classe', () => {
		const x = temoin();
		expect(epingleLecon([], x, 'ce2', 'cm1')).toEqual({
			entryId: 'fr-gram-clic-noyau@ce2',
			epingle: false,
		});
		expect(epingleLecon([], x, 'cm1', 'cm1')).toEqual({
			entryId: 'fr-gram-clic-noyau@cm1',
			epingle: false,
		});
	});

	it('critère 6 : une épingle CE2 allume le bouton CE2, pas le bouton CM1', () => {
		const x = temoin();
		const file = ['fr-gram-clic-noyau@ce2'];
		expect(epingleLecon(file, x, 'ce2', 'cm1')).toEqual({
			entryId: 'fr-gram-clic-noyau@ce2',
			epingle: true,
		});
		expect(epingleLecon(file, x, 'cm1', 'cm1')).toEqual({
			entryId: 'fr-gram-clic-noyau@cm1',
			epingle: false,
		});
	});

	it('id nu d’avant #573 chez un CM1 : le bouton CM1 le rend NU, le bouton CE2 reste éteint', () => {
		const x = temoin();
		const file = [X_ID];
		// Rendu nu : c'est l'id stocké, celui que le bouton doit retirer.
		expect(epingleLecon(file, x, 'cm1', 'cm1')).toEqual({ entryId: X_ID, epingle: true });
		expect(epingleLecon(file, x, 'ce2', 'cm1')).toEqual({
			entryId: 'fr-gram-clic-noyau@ce2',
			epingle: false,
		});
	});

	it('id nu : basculer l’entryId rendu le retire vraiment de la file', () => {
		const x = temoin();
		const uuid = profilEn('cm1').uuid;
		let file = toggleRevoirFor(uuid, X_ID); // épingle d'avant #573
		const bouton = epingleLecon(file, x, 'cm1', 'cm1');
		expect(bouton.epingle).toBe(true);

		file = toggleRevoirFor(uuid, bouton.entryId);
		expect(fileBrute(uuid)).toEqual([]);
		expect(epingleLecon(file, x, 'cm1', 'cm1')).toEqual({
			entryId: 'fr-gram-clic-noyau@cm1',
			epingle: false,
		});
	});

	it('id nu ET id scopé au même niveau : l’id scopé passe devant, quel que soit l’ordre', () => {
		const x = temoin();
		const attendu = { entryId: 'fr-gram-clic-noyau@cm1', epingle: true };
		expect(epingleLecon([X_ID, 'fr-gram-clic-noyau@cm1'], x, 'cm1', 'cm1')).toEqual(attendu);
		expect(epingleLecon(['fr-gram-clic-noyau@cm1', X_ID], x, 'cm1', 'cm1')).toEqual(attendu);
	});

	it('piège de préfixe : une leçon dont l’id commence pareil n’épingle pas le témoin', () => {
		const x = temoin();
		expect(epingleLecon([X_ID + '-bis@ce2'], x, 'ce2', 'cm1')).toEqual({
			entryId: 'fr-gram-clic-noyau@ce2',
			epingle: false,
		});
		expect(epingleLecon([X_ID + '-bis'], x, 'cm1', 'cm1')).toEqual({
			entryId: 'fr-gram-clic-noyau@cm1',
			epingle: false,
		});
	});
});
