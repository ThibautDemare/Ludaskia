/* ============================================================
   File « à revoir » scopée par classe (#573) — désépinglage automatique
   et garde-fou du FAUX SIGNAL DE COMPÉTENCE (critères 10, 11, 12).
   ------------------------------------------------------------
   Cibles : purgeRevoirSolides / retraitsAutoProfil / revoirActives
   (core/encadrant-stats) et la fin de sonde portée par recordLessonRun
   (core/lesson-run).

   Écrit AVANT l'implémentation, d'après l'issue et son contrat :
   - une épingle `x@P` se juge AU NIVEAU ÉPINGLÉ P (critère 10) ;
   - une épingle d'une classe ANTÉRIEURE (P < classe suivie S de la matière),
     candidate (#465), solide en P, sur une leçon qui existe en S, est « en
     sonde » : l'enfant la reçoit dans sa version S, et elle ne quitte la file
     qu'après UN essai complet en mode leçon de cette version (critère 11) ;
   - l'issue de cet essai est tracée côté encadrant (motif « version-suivie »,
     réussi ou non), et plus rien ne renvoie l'enfant sur la version P sans
     geste d'un adulte (critère 12).

   Attendus DÉRIVÉS de ce contrat, jamais du code : les libellés viennent de la
   donnée de la leçon témoin, les ids de file sont écrits en clair
   (`lessonId@niveau`), le seuil de réussite est celui de « à revoir » (70 %,
   bornes 7/10 et 69/100). La forme des ids et la lecture enfant hors sonde sont
   éprouvées ailleurs ; ici, seulement ce qui bascule d'une classe à l'autre.

   Leçon témoin : `fr-gram-clic-noyau`, deux NOTIONS distinctes (CE2 « Clique sur
   le nom », CM1 « Clique sur le nom noyau ») — c'est le cas qui motive le
   garde-fou : réussir la première ne prouve rien sur la seconde.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { setOnDataWrite, lsSetRaw, lsGetItemRaw } from '../src/core/storage';
import {
	initProfiles,
	activeProfile,
	loadProfilesMeta,
	setNiveauMatiereFor,
	setNiveauReferenceFor,
	touchActiveProfile,
	type Profile,
} from '../src/core/profiles';
import { STARS_KEY, LESSON_STATS_KEY } from '../src/core/progress';
import { getAllLessons, getLessonById, type SchoolLevel } from '../src/core/catalog';
import { recordLessonRun } from '../src/core/lesson-run';
import { imposerNiveauLecon, leverNiveauImpose } from '../src/core/niveau-actif';
import {
	purgeRevoirSolides,
	retraitsAutoProfil,
	toggleRevoirFor,
	loadRevoirFor,
	revoirActives,
	REVOIR_KEY,
	REVOIR_AUTO_KEY,
	REVOIR_FRAGILE_KEY,
} from '../src/core/encadrant-stats';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	leverNiveauImpose(); // état de module : aucune imposition ne fuit d'un test à l'autre
});

/* ---------- Repères temporels ----------
   Les passes de purge sont datées à la main ; la fin de sonde, elle, est datée par
   recordLessonRun (horloge réelle) — d'où `Date.now()` pour les passes qui la suivent. */
const NOW = new Date(2026, 5, 15, 10).getTime(); // 15 juin 2026, 10:00 local
const JOUR = 86_400_000;

/* ---------- Leçon témoin (libellés lus dans la DONNÉE, cf. préconditions) ---------- */
const X = 'fr-gram-clic-noyau';
const LABEL_CE2 = 'Clique sur le nom';
const LABEL_CM1 = 'Clique sur le nom noyau';

/* ---------- Helpers de stockage (calqués sur revoir-desepinglage-auto.test.ts) ---------- */
function seed(uuid: string, key: string, value: unknown): void {
	lsSetRaw(uuid + '/' + key, JSON.stringify(value));
}
function brut(uuid: string, key: string): string | null {
	return lsGetItemRaw(uuid + '/' + key);
}
function json(uuid: string, key: string): unknown {
	const raw = brut(uuid, key);
	return raw == null ? null : JSON.parse(raw);
}
/* Profil RELU depuis la méta (après un changement de niveau, l'objet capturé est périmé). */
function profil(uuid: string): Profile {
	const p = loadProfilesMeta()?.list.find((x) => x.uuid === uuid);
	if (!p) throw new Error('profil introuvable : ' + uuid);
	return p;
}
/* Passe « à blanc » pendant que l'épingle est encore FRAGILE : elle pose les marques
   de fragilité, donc l'épingle devient candidate (#465). */
function passeInitiale(p: Profile): void {
	purgeRevoirSolides(p, false, NOW - 10 * JOUR);
}

/* ---------- Helpers propres à #573 ---------- */
/** Id de file scopé, écrit d'après le contrat (`lessonId@niveau`) — pas via le module. */
function epingle(lessonId: string, niveau: SchoolLevel): string {
	return lessonId + '@' + niveau;
}
/** Essai COMPLET en mode leçon, joué au niveau courant du profil actif. */
function essaiLecon(lessonId: string, ok: number, total: number): void {
	recordLessonRun({
		mode: 'lecon',
		lessonId,
		ok,
		questionCount: total,
		ms: 60_000,
		perLesson: { [lessonId]: { ok, total } },
	});
}
/** Bilan (express / complet) qui contient des questions de la leçon : pas un essai de leçon. */
function essaiBilan(
	mode: 'express' | 'complet',
	lessonId: string,
	ok: number,
	total: number,
): void {
	recordLessonRun({
		mode,
		lessonId: null,
		ok,
		questionCount: total,
		ms: 60_000,
		perLesson: { [lessonId]: { ok, total } },
	});
}
/** Essai de leçon joué sous un niveau IMPOSÉ (lancement d'une épingle d'une autre classe). */
function essaiImpose(lessonId: string, niveau: SchoolLevel, ok: number, total: number): void {
	imposerNiveauLecon(lessonId, niveau);
	try {
		essaiLecon(lessonId, ok, total);
	} finally {
		leverNiveauImpose();
	}
}
/** Ce que la carte d'accueil de l'enfant propose pour une leçon donnée. */
function proposePour(lessonId: string) {
	return revoirActives().filter((e) => e.kind === 'lecon' && e.id === lessonId);
}
/** Traces « version-suivie » d'un profil, lues comme l'espace encadrant les lit. */
function tracesVersionSuivie(uuid: string) {
	return retraitsAutoProfil(profil(uuid), Date.now()).filter((r) => r.motif === 'version-suivie');
}

/** Sonde ouverte sur X : français suivi en CM1, X épinglée en CE2, vue fragile (donc
    candidate), puis version CE2 acquise (étoile CE2). */
function ouvrirSonde(): string {
	const uuid = activeProfile().uuid;
	setNiveauMatiereFor(uuid, 'francais', 'cm1');
	seed(uuid, REVOIR_KEY, [epingle(X, 'ce2')]);
	passeInitiale(profil(uuid));
	seed(uuid, STARS_KEY, { [epingle(X, 'ce2')]: 1 });
	return uuid;
}

/* ---------- Repères de catalogue (choisis dynamiquement) ---------- */
function leconCe2Seulement(): string {
	const l = getAllLessons().find((x) => x.levels.includes('ce2') && !x.levels.includes('cm1'));
	if (!l) throw new Error('catalogue sans leçon CE2-only : test à réviser');
	return l.id;
}
function leconMathMultiNiveau(): string {
	const l = getAllLessons().find(
		(x) => x.subject === 'math' && x.levels.includes('ce2') && x.levels.includes('cm1'),
	);
	if (!l) throw new Error('catalogue sans leçon math CE2+CM1 : test à réviser');
	return l.id;
}
function autreLeconFrancaisCm1(): string {
	const l = getAllLessons().find(
		(x) => x.subject === 'francais' && x.levels.includes('cm1') && x.id !== X,
	);
	if (!l) throw new Error('catalogue sans autre leçon de français CM1 : test à réviser');
	return l.id;
}

/* ============================================================
   0. Préconditions : la leçon témoin a bien deux versions distinctes
   ============================================================ */
describe('préconditions — leçon témoin', () => {
	it('fr-gram-clic-noyau existe en CE2 et en CM1, avec deux libellés distincts', () => {
		const l = getLessonById(X);
		expect(l?.subject).toBe('francais');
		expect(l?.levels).toEqual(expect.arrayContaining(['ce2', 'cm1']));
		// Si ces libellés changent, ce fichier est à réviser : il s'appuie sur leur différence
		// pour savoir quelle version l'enfant reçoit.
		expect(l?.labelNiveau).toMatchObject({ ce2: LABEL_CE2, cm1: LABEL_CM1 });
	});
});

/* ============================================================
   1. Critère 11 — la version de la classe suivie est proposée UNE FOIS
   ============================================================ */
describe('critère 11 — sonde : version CE2 acquise, la version CM1 est proposée avant tout retrait', () => {
	it('l’épingle CE2 acquise est rendue à l’enfant dans sa version CM1 (niveau et libellé CM1)', () => {
		ouvrirSonde();
		const props = proposePour(X);
		expect(props).toHaveLength(1);
		expect(props[0]).toMatchObject({
			kind: 'lecon',
			id: X, // id NU : c'est lui qui lance la leçon
			entryId: epingle(X, 'ce2'), // l'épingle reste celle que l'adulte a posée
			niveau: 'cm1',
			label: LABEL_CM1,
		});
	});

	it('aucune passe de purge ne la retire pendant la sonde, et elle reste candidate', () => {
		const uuid = ouvrirSonde();
		// Deux passes : la seconde prouve que la sonde SURVIT à la première (une marque de
		// fragilité perdue en route ferait d'elle une épingle « posée sur du solide »).
		expect(purgeRevoirSolides(profil(uuid), false, NOW)).toEqual([]);
		expect(purgeRevoirSolides(profil(uuid), false, NOW + JOUR)).toEqual([]);
		expect(loadRevoirFor(uuid)).toEqual([epingle(X, 'ce2')]);
		expect(json(uuid, REVOIR_FRAGILE_KEY)).toContain(epingle(X, 'ce2'));
		expect(retraitsAutoProfil(profil(uuid), NOW + JOUR)).toEqual([]);
		// Et l'enfant reçoit toujours la version CM1.
		expect(proposePour(X)).toEqual([expect.objectContaining({ niveau: 'cm1', label: LABEL_CM1 })]);
	});

	it('réussir la version CE2 en la JOUANT (sous niveau imposé, 75 %) ouvre la sonde au lieu de retirer l’épingle', () => {
		// Le scénario d'échec du critère 11, joué de bout en bout sans semer d'étoile :
		// l'enfant passe la leçon CE2 épinglée à 6/8 (solide par la performance, pas d'étoile).
		const uuid = activeProfile().uuid;
		setNiveauMatiereFor(uuid, 'francais', 'cm1');
		seed(uuid, REVOIR_KEY, [epingle(X, 'ce2')]);
		passeInitiale(profil(uuid));
		essaiImpose(X, 'ce2', 6, 8);
		// Précondition : l'essai a bien été rangé en CE2, pas en CM1.
		const stats = json(uuid, LESSON_STATS_KEY) as Record<string, unknown>;
		expect(Object.keys(stats)).toContain(epingle(X, 'ce2'));
		expect(Object.keys(stats)).not.toContain(epingle(X, 'cm1'));

		expect(purgeRevoirSolides(profil(uuid), false, NOW)).toEqual([]);
		expect(purgeRevoirSolides(profil(uuid), false, NOW + JOUR)).toEqual([]);
		expect(loadRevoirFor(uuid)).toEqual([epingle(X, 'ce2')]);
		expect(proposePour(X)).toEqual([
			expect.objectContaining({ entryId: epingle(X, 'ce2'), niveau: 'cm1', label: LABEL_CM1 }),
		]);
	});

	it('un essai complet réussi de la version CM1 met fin à la sonde : épingle retirée, trace « réussie »', () => {
		const uuid = ouvrirSonde();
		purgeRevoirSolides(profil(uuid), false, NOW);
		const avant = Date.now();
		essaiLecon(X, 8, 8);
		const apres = Date.now();

		expect(loadRevoirFor(uuid)).toEqual([]);
		expect(proposePour(X)).toEqual([]);
		const traces = retraitsAutoProfil(profil(uuid), Date.now());
		expect(traces).toEqual([
			{
				id: epingle(X, 'ce2'), // ré-épinglable tel quel
				kind: 'lecon',
				label: LABEL_CE2, // ce que l'adulte avait épinglé
				at: expect.any(Number),
				motif: 'version-suivie',
				versionSuivie: { niveau: 'cm1', label: LABEL_CM1, reussie: true },
			},
		]);
		expect(traces[0].at).toBeGreaterThanOrEqual(avant);
		expect(traces[0].at).toBeLessThanOrEqual(apres);
	});

	// Réussie = la version CM1 ne serait plus « à revoir » après cet essai : sans-faute,
	// ou au moins le seuil de « à revoir » (70 %).
	it.each([
		[8, 8, true, 'sans-faute'],
		[7, 10, true, '70 % pile : le seuil compte comme réussi'],
		[69, 100, false, '69 % : juste sous le seuil'],
		[0, 8, false, 'aucune bonne réponse'],
	])('essai CM1 à %i/%i → reussie = %s (%s)', (ok, total, reussie) => {
		const uuid = ouvrirSonde();
		essaiLecon(X, ok, total);
		expect(loadRevoirFor(uuid)).toEqual([]);
		expect(tracesVersionSuivie(uuid).map((r) => r.versionSuivie)).toEqual([
			{ niveau: 'cm1', label: LABEL_CM1, reussie },
		]);
	});

	it.each(['express', 'complet'] as const)(
		'un bilan « %s » qui contient la leçon ne met pas fin à la sonde',
		(mode) => {
			const uuid = ouvrirSonde();
			// Même un bilan parfait sur la leçon : ce n'est pas l'essai de la version CM1
			// que le contrat demande, et la version CM1 y devient solide sans avoir été proposée.
			essaiBilan(mode, X, 8, 8);
			expect(loadRevoirFor(uuid)).toEqual([epingle(X, 'ce2')]);
			expect(tracesVersionSuivie(uuid)).toEqual([]);
			expect(purgeRevoirSolides(profil(uuid), false, Date.now())).toEqual([]);
			expect(proposePour(X)).toEqual([expect.objectContaining({ niveau: 'cm1' })]);
		},
	);

	it('une session de la leçon jouée sous niveau imposé CE2 ne met pas fin à la sonde', () => {
		const uuid = ouvrirSonde();
		essaiImpose(X, 'ce2', 8, 8);
		// Précondition : l'essai a bien été joué en CE2 (aucune étoile CM1 créée).
		expect(json(uuid, STARS_KEY)).not.toHaveProperty([epingle(X, 'cm1')]);

		expect(loadRevoirFor(uuid)).toEqual([epingle(X, 'ce2')]);
		expect(tracesVersionSuivie(uuid)).toEqual([]);
		expect(purgeRevoirSolides(profil(uuid), false, Date.now())).toEqual([]);
		expect(proposePour(X)).toEqual([expect.objectContaining({ niveau: 'cm1' })]);
	});

	it('l’essai complet d’une AUTRE leçon ne met pas fin à la sonde', () => {
		const uuid = ouvrirSonde();
		essaiLecon(autreLeconFrancaisCm1(), 8, 8);
		expect(loadRevoirFor(uuid)).toEqual([epingle(X, 'ce2')]);
		expect(tracesVersionSuivie(uuid)).toEqual([]);
		expect(proposePour(X)).toEqual([expect.objectContaining({ niveau: 'cm1' })]);
	});

	it('fin de sonde : seule l’épingle EN SONDE sort, une épingle CM1 de la même leçon reste', () => {
		const uuid = activeProfile().uuid;
		setNiveauMatiereFor(uuid, 'francais', 'cm1');
		seed(uuid, REVOIR_KEY, [epingle(X, 'ce2'), epingle(X, 'cm1')]);
		passeInitiale(profil(uuid)); // les deux sont fragiles, donc candidates
		seed(uuid, STARS_KEY, { [epingle(X, 'ce2')]: 1 });

		essaiLecon(X, 4, 8); // tentative CM1 échouée

		expect(loadRevoirFor(uuid)).toEqual([epingle(X, 'cm1')]);
		expect(tracesVersionSuivie(uuid).map((r) => r.id)).toEqual([epingle(X, 'ce2')]);
		// L'épingle CM1 vit sa vie ordinaire : 50 % reste fragile, la purge la garde.
		expect(purgeRevoirSolides(profil(uuid), false, Date.now())).toEqual([]);
		expect(proposePour(X)).toEqual([
			expect.objectContaining({ entryId: epingle(X, 'cm1'), niveau: 'cm1' }),
		]);
	});
});

/* ============================================================
   2. Critère 12 — tentative échouée : visible côté parent, sans reboucle
   ============================================================ */
describe('critère 12 — tentative CM1 échouée', () => {
	it('essai CM1 à 50 % : épingle retirée, échec lisible côté encadrant', () => {
		const uuid = ouvrirSonde();
		essaiLecon(X, 4, 8);

		expect(loadRevoirFor(uuid)).toEqual([]);
		expect(retraitsAutoProfil(profil(uuid), Date.now())).toEqual([
			expect.objectContaining({
				id: epingle(X, 'ce2'),
				kind: 'lecon',
				label: LABEL_CE2,
				motif: 'version-suivie',
				versionSuivie: { niveau: 'cm1', label: LABEL_CM1, reussie: false },
			}),
		]);
	});

	it('après l’échec, ni les passes ni les essais suivants ne renvoient l’enfant sur la version CE2', () => {
		const uuid = ouvrirSonde();
		essaiLecon(X, 4, 8);

		purgeRevoirSolides(profil(uuid), false, Date.now());
		purgeRevoirSolides(profil(uuid), false, Date.now() + JOUR);
		essaiImpose(X, 'ce2', 8, 8); // la version CE2 rejouée (et réussie) ailleurs
		purgeRevoirSolides(profil(uuid), false, Date.now() + 2 * JOUR);
		essaiLecon(X, 4, 8); // nouvelle tentative CM1, de nouveau échouée
		purgeRevoirSolides(profil(uuid), false, Date.now() + 3 * JOUR);

		expect(loadRevoirFor(uuid)).toEqual([]);
		expect(proposePour(X)).toEqual([]);
		// Un seul retrait, donc une seule trace — et c'est toujours l'échec qu'elle dit.
		expect(tracesVersionSuivie(uuid)).toEqual([
			expect.objectContaining({
				id: epingle(X, 'ce2'),
				versionSuivie: { niveau: 'cm1', label: LABEL_CM1, reussie: false },
			}),
		]);
	});

	it('seul un geste d’adulte remet l’épingle en file ; la trace cesse alors d’être affichée', () => {
		const uuid = ouvrirSonde();
		essaiLecon(X, 4, 8);
		expect(tracesVersionSuivie(uuid)).toHaveLength(1);

		toggleRevoirFor(uuid, epingle(X, 'ce2'));
		expect(loadRevoirFor(uuid)).toEqual([epingle(X, 'ce2')]);
		expect(tracesVersionSuivie(uuid)).toEqual([]);
	});
});

/* ============================================================
   3. Critère 10 — l'état est lu AU NIVEAU ÉPINGLÉ
   ============================================================ */
describe('critère 10 — désépinglage lu au niveau épinglé, hors sonde', () => {
	interface CasRetrait {
		cas: string;
		lecon: () => string;
		niveauEpingle: SchoolLevel;
		suivre: (uuid: string, lessonId: string) => void;
		motif: 'maitrise' | 'essai';
	}
	const casRetrait: CasRetrait[] = [
		{
			cas: 'épingle CE2 chez un enfant suivi en CE2 (même classe)',
			lecon: () => X,
			niveauEpingle: 'ce2',
			suivre: (uuid) => setNiveauMatiereFor(uuid, 'francais', 'ce2'),
			motif: 'maitrise',
		},
		{
			cas: 'leçon CE2 seule, épinglée en CE2 chez un CM1 (pas de version CM1 à proposer)',
			lecon: leconCe2Seulement,
			niveauEpingle: 'ce2',
			suivre: (uuid, id) => setNiveauMatiereFor(uuid, getLessonById(id)!.subject, 'cm1'),
			motif: 'maitrise',
		},
		{
			cas: 'épingle CM1 chez un enfant suivi en CE2 (classe SUIVANTE)',
			lecon: () => X,
			niveauEpingle: 'cm1',
			suivre: (uuid) => setNiveauMatiereFor(uuid, 'francais', 'ce2'),
			motif: 'essai',
		},
		{
			cas: 'classe de référence CM1 mais MATIÈRE de la leçon suivie en CE2',
			lecon: leconMathMultiNiveau,
			niveauEpingle: 'ce2',
			suivre: (uuid) => {
				setNiveauReferenceFor(uuid, 'cm1');
				setNiveauMatiereFor(uuid, 'math', 'ce2');
			},
			motif: 'maitrise',
		},
	];

	it.each(casRetrait)(
		'$cas : solide au niveau épinglé → retrait ordinaire (motif « $motif »)',
		({ lecon, niveauEpingle, suivre, motif }) => {
			const uuid = activeProfile().uuid;
			const id = lecon();
			const pin = epingle(id, niveauEpingle);
			suivre(uuid, id);
			seed(uuid, REVOIR_KEY, [pin]);
			passeInitiale(profil(uuid));
			seed(uuid, STARS_KEY, { [pin]: 1 }); // réussie là où elle est épinglée

			expect(purgeRevoirSolides(profil(uuid), false, NOW)).toEqual([pin]);
			expect(loadRevoirFor(uuid)).toEqual([]);
			const traces = retraitsAutoProfil(profil(uuid), NOW);
			expect(traces).toEqual([expect.objectContaining({ id: pin, kind: 'lecon', motif })]);
			expect(traces[0]).not.toHaveProperty('versionSuivie');
			expect(proposePour(id)).toEqual([]);
		},
	);

	it('épingle CE2 fragile chez un CM1 : la version CM1 étoilée ne la retire pas, l’enfant reçoit la version CE2', () => {
		const uuid = activeProfile().uuid;
		setNiveauMatiereFor(uuid, 'francais', 'cm1');
		seed(uuid, REVOIR_KEY, [epingle(X, 'ce2')]);
		passeInitiale(profil(uuid));
		seed(uuid, STARS_KEY, { [epingle(X, 'cm1')]: 1 }); // seule la version CM1 est acquise

		expect(purgeRevoirSolides(profil(uuid), false, NOW)).toEqual([]);
		expect(purgeRevoirSolides(profil(uuid), false, NOW + JOUR)).toEqual([]);
		expect(loadRevoirFor(uuid)).toEqual([epingle(X, 'ce2')]);
		expect(proposePour(X)).toEqual([
			expect.objectContaining({
				id: X,
				entryId: epingle(X, 'ce2'),
				niveau: 'ce2',
				label: LABEL_CE2,
			}),
		]);
		// Pas en sonde (CE2 non acquise) : un essai CM1 réussi ne la fait pas sortir.
		essaiLecon(X, 8, 8);
		expect(loadRevoirFor(uuid)).toEqual([epingle(X, 'ce2')]);
		expect(tracesVersionSuivie(uuid)).toEqual([]);
	});
});

/* ============================================================
   4. Hors sonde — ids nus (d'avant #573) et épingles non candidates
   ============================================================ */
describe('jamais de sonde pour un id nu ni pour une épingle non candidate', () => {
	it('id nu chez un CM1, solide en CM1 : retrait ordinaire (motif « maitrise »), id nu dans la trace', () => {
		const uuid = activeProfile().uuid;
		setNiveauMatiereFor(uuid, 'francais', 'cm1');
		seed(uuid, REVOIR_KEY, [X]);
		passeInitiale(profil(uuid));
		seed(uuid, STARS_KEY, { [epingle(X, 'cm1')]: 1 });

		expect(purgeRevoirSolides(profil(uuid), false, NOW)).toEqual([X]);
		const traces = retraitsAutoProfil(profil(uuid), NOW);
		expect(traces).toEqual([expect.objectContaining({ id: X, motif: 'maitrise' })]);
		expect(traces[0]).not.toHaveProperty('versionSuivie');
	});

	it('id nu chez un CM1, seule la version CE2 acquise : lu en CM1, donc ni retrait ni sonde', () => {
		// Un id nu est joué au niveau suivi (critère 8) : le lire en CE2 — le repli historique
		// du journal — l'aurait mis en sonde, puis fait sortir sur un essai CM1 raté.
		const uuid = activeProfile().uuid;
		setNiveauMatiereFor(uuid, 'francais', 'cm1');
		seed(uuid, REVOIR_KEY, [X]);
		passeInitiale(profil(uuid));
		seed(uuid, STARS_KEY, { [epingle(X, 'ce2')]: 1 });

		expect(purgeRevoirSolides(profil(uuid), false, NOW)).toEqual([]);
		expect(proposePour(X)).toEqual([
			expect.objectContaining({ id: X, entryId: X, niveau: 'cm1', label: LABEL_CM1 }),
		]);
		essaiLecon(X, 4, 8);
		expect(loadRevoirFor(uuid)).toEqual([X]);
		expect(tracesVersionSuivie(uuid)).toEqual([]);
		expect(purgeRevoirSolides(profil(uuid), false, Date.now())).toEqual([]);
	});

	it('épingle CE2 posée alors que déjà acquise (non candidate) : ni sonde, ni retrait (garde-fou #465)', () => {
		const uuid = activeProfile().uuid;
		setNiveauMatiereFor(uuid, 'francais', 'cm1');
		seed(uuid, REVOIR_FRAGILE_KEY, []); // marques posées SANS elle : adoption close
		seed(uuid, STARS_KEY, { [epingle(X, 'ce2')]: 1 });
		seed(uuid, REVOIR_KEY, [epingle(X, 'ce2')]);

		expect(purgeRevoirSolides(profil(uuid), false, NOW)).toEqual([]);
		expect(json(uuid, REVOIR_FRAGILE_KEY)).not.toContain(epingle(X, 'ce2'));
		expect(proposePour(X)).toEqual([]); // masquée comme toute épingle solide
		essaiLecon(X, 8, 8);
		expect(loadRevoirFor(uuid)).toEqual([epingle(X, 'ce2')]);
		expect(retraitsAutoProfil(profil(uuid), Date.now())).toEqual([]);
	});
});

/* ============================================================
   5. Lecture de la trace « version-suivie »
   ============================================================ */
describe('retraitsAutoProfil — trace « version-suivie »', () => {
	it('rend une trace bien formée intacte et écarte celles sans versionSuivie valide', () => {
		const uuid = activeProfile().uuid;
		const base = {
			kind: 'lecon',
			label: LABEL_CE2,
			at: NOW - JOUR,
			motif: 'version-suivie',
		};
		const valide = {
			...base,
			id: epingle(X, 'ce2'),
			versionSuivie: { niveau: 'cm1', label: LABEL_CM1, reussie: false },
		};
		seed(uuid, REVOIR_AUTO_KEY, [
			valide,
			{ ...base, id: 'a@ce2' }, // versionSuivie absente
			{ ...base, id: 'b@ce2', versionSuivie: null },
			{ ...base, id: 'c@ce2', versionSuivie: 'cm1' },
			{ ...base, id: 'd@ce2', versionSuivie: { niveau: 'cm1', label: LABEL_CM1 } }, // sans issue
			{ ...base, id: 'e@ce2', versionSuivie: { niveau: 'cm1', label: LABEL_CM1, reussie: 'non' } },
			{ ...base, id: 'f@ce2', versionSuivie: { niveau: 'cm1', reussie: true } }, // sans libellé
		]);

		expect(retraitsAutoProfil(profil(uuid), NOW)).toEqual([valide]);
	});
});
