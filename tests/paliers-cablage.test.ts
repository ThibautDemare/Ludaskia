/* ============================================================
   CÂBLAGE du journal des paliers (#397 / frise #521) : une session RÉELLEMENT
   enregistrée écrit-elle la borne et ses franchissements, sans qu'aucun appelant ne les
   demande ?
   ------------------------------------------------------------
   Deux fichiers encadrent celui-ci sans le couvrir : `paliers.test.ts` éprouve la RÈGLE de
   franchissement (`recordMonteesPalier` appelé à la main) et `frise-etats.test.ts` la
   LECTURE (frise de l'espace encadrant). Entre les deux, personne ne vérifiait le fil —
   qu'une fin de session (leçon, bilan, sprint) journalise bel et bien ses montées. C'est
   pourtant de ce fil que dépend la frise, qui déduit l'état d'une semaine de l'ABSENCE
   d'horodatage : un chemin d'écriture de stats qui ne journalise pas la fait mentir des
   semaines durant, sans que rien ne le signale.

   Ce qui est éprouvé ici :
   - la borne de mise en service ET les franchissements atteints sont écrits par le seul fait
     d'enregistrer une session (aucun appelant ne les réclame) ;
   - l'ORDRE : l'étoile d'une session sans faute date le palier « acquis » de CETTE session,
     pas de la suivante — les tests sont construits pour distinguer les deux (cf. plus bas) ;
   - la borne ne dépend pas qu'un palier ait été franchi, ni même qu'une question ait été
     posée, ni du TYPE de session : ce qu'elle date, c'est le journal qui tourne. Une dictée
     ou une révision espacée la pose donc aussi, sans jamais journaliser de franchissement ;
   - parité des modes (#69) : à score égal, aucun mode ne journalise plus qu'un autre, à la
     seule exception voulue de l'étoile (mode leçon uniquement) ;
   - bout en bout : la frise de l'espace encadrant montre la session au lieu de 12 pointillés.

   Ce que ces tests ne recopient PAS : les attendus viennent du contrat annoncé (« étoile ⇒
   acquis », « pas d'étoile hors mode leçon », « la borne date le journal, pas un cap ») et
   l'instant de la session est FIGÉ (`auMoment`, pattern d'encadrant-banque.test.ts) pour être
   comparé à la milliseconde — jamais relu dans le code.

   DEUX temps, à ne pas confondre : la borne est posée SYNCHRONIQUEMENT par la session (elle ne
   dépend pas de l'étoile, et elle existe donc même si la suite échoue), tandis que les
   FRANCHISSEMENTS sont reportés en microtâche (l'état « acquis » dépend de l'étoile, écrite
   après). Tout test qui observe une marche laisse donc tourner la fin de la tâche courante
   (`finDeSession`) ; un test qui observe la borne n'en a pas besoin, et le premier d'entre eux
   épingle cet écart.
   ============================================================ */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
	initProfiles,
	addProfile,
	setActiveProfile,
	activeProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite, lsGet, lsRemoveQuiet } from '../src/core/storage';
import {
	recordLessonStats,
	recordSessionActivity,
	LESSON_PALIERS_KEY,
	PALIERS_DEBUT_KEY,
	type PaliersNotion,
} from '../src/core/progress';
import { recordLessonRun } from '../src/core/lesson-run';
import {
	progressionProfil,
	type CelluleFrise,
	type RecapProfil,
} from '../src/core/encadrant-stats';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* Profil neuf en cours de test (parité des modes : un mode par profil vierge). */
function profilNeuf(): void {
	localStorage.clear();
	initProfiles();
}

/* Journal des paliers / borne de mise en service du profil ACTIF. */
function journal(): Record<string, PaliersNotion> {
	return lsGet(LESSON_PALIERS_KEY, {});
}
function borne(): number | null {
	return lsGet(PALIERS_DEBUT_KEY, null);
}
/* Marches datées d'une leçon (clés `lessonId@niveau`, profil CE2 par défaut). */
function palier(lessonId: string): PaliersNotion | undefined {
	return journal()[lessonId + '@ce2'];
}

/* Fin de la tâche courante : laisse tourner la microtâche par laquelle la session reporte
   ses franchissements. Une seule bascule suffit — la microtâche a été mise en file AVANT la
   reprise de ce `await`, elle s'exécute donc en premier. */
const finDeSession = (): Promise<void> => Promise.resolve();

/* Geste daté à un instant FIGÉ (même pattern qu'encadrant-banque.test.ts) : la session lit
   l'horloge une fois, et c'est cet instant que la marche doit porter. */
function auMoment<T>(t: number, geste: () => T): T {
	const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
	try {
		return geste();
	} finally {
		spy.mockRestore();
	}
}

const A = 'math-doubles';
const B = 'math-moities';
const C = 'math-complements';
const T = 1_700_000_000_000; // instant de référence
const JOUR = 86_400_000;

/* Sessions d'une leçon travaillée à 80 % (« en cours »), une par porte d'entrée. Le sprint
   passe par `recordLessonStats` : son chemin réel (`finalizeSprint`) vit dans `ui/sprint.ts`,
   inséparable du DOM et de son chrono — cf. le commentaire de son describe. */
const SESSIONS_80: [string, () => void][] = [
	[
		'leçon',
		() => {
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 8,
				questionCount: 10,
				ms: 1000,
				perLesson: { [A]: { ok: 8, total: 10 } },
			});
		},
	],
	[
		'bilan express',
		() => {
			recordLessonRun({
				mode: 'express',
				lessonId: null,
				ok: 8,
				questionCount: 10,
				ms: 1000,
				perLesson: { [A]: { ok: 8, total: 10 } },
			});
		},
	],
	[
		'bilan complet',
		() => {
			recordLessonRun({
				mode: 'complet',
				lessonId: null,
				ok: 8,
				questionCount: 10,
				ms: 1000,
				perLesson: { [A]: { ok: 8, total: 10 } },
			});
		},
	],
	[
		'sprint',
		() => {
			recordLessonStats({ [A]: { ok: 8, total: 10 } }, 'sprint');
		},
	],
];

describe('recordLessonRun — la session journalise ses paliers d’elle-même', () => {
	it('80 % sur une leçon : borne posée et « en cours » daté, sans que l’appelant l’ait demandé', async () => {
		auMoment(T, () =>
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 8,
				questionCount: 10,
				ms: 12_000,
				perLesson: { [A]: { ok: 8, total: 10 } },
			}),
		);
		// Les deux temps de l'écriture, épinglés ici une fois pour toutes. La borne est déjà là :
		// elle ne dépend pas de l'étoile, donc rien ne justifierait de la faire attendre (et
		// l'attente la perdrait si la suite de la session échouait). Le FRANCHISSEMENT, lui, est
		// encore à venir : c'est ce délai qui laisse l'étoile s'écrire avant que l'état « acquis »
		// soit évalué (cf. describe suivant), et c'est ce qui oblige chaque test qui observe une
		// marche à laisser tourner la fin de tâche.
		expect(borne()).toBe(T);
		expect(journal()).toEqual({});
		await finDeSession();
		expect(borne()).toBe(T); // inchangée : jamais réécrite
		expect(palier(A)).toEqual({ enCours: T });
	});

	it('bilan : chaque leçon travaillée est journalisée, celle restée sous 40 % ne l’est pas', async () => {
		auMoment(T, () =>
			recordLessonRun({
				mode: 'express',
				lessonId: null,
				ok: 10,
				questionCount: 20,
				ms: 60_000,
				perLesson: {
					[A]: { ok: 8, total: 10 }, // 80 % → « en cours »
					[B]: { ok: 2, total: 10 }, // 20 % → « à renforcer », pas une montée
					[C]: { ok: 0, total: 0 }, // aucune question posée sur cette leçon
				},
			}),
		);
		await finDeSession();
		expect(borne()).toBe(T);
		expect(Object.keys(journal())).toEqual([A + '@ce2']);
		expect(palier(A)).toEqual({ enCours: T });
	});

	it('bilan SANS FAUTE : « en cours » seulement — un bilan n’attribue pas d’étoile', async () => {
		// Même règle que le sprint : hors mode leçon, rien ne peut rendre une notion « acquise ».
		// Un bilan qui daterait « acquis » ferait apparaître une maîtrise sur une seule question.
		auMoment(T, () =>
			recordLessonRun({
				mode: 'complet',
				lessonId: null,
				ok: 4,
				questionCount: 4,
				ms: 30_000,
				perLesson: { [A]: { ok: 4, total: 4 } },
			}),
		);
		await finDeSession();
		expect(palier(A)).toEqual({ enCours: T });
	});

	it('session sans aucune question : la borne est posée quand même, le journal reste vide', async () => {
		// Ce que la borne date, c'est le journal qui TOURNE : la faire dépendre d'une montée (ou
		// même d'une question posée) laisserait la frise muette précisément chez l'enfant qui
		// débute, celui qu'on veut pouvoir décrire.
		// SEUL cas où la borne elle-même attend le report : sans question, la session ne
		// journalise aucun point d'activité, donc rien ne l'a posée en chemin — d'où le flush
		// avant de l'observer, contrairement aux autres tests d'ici.
		auMoment(T, () =>
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 0,
				questionCount: 0,
				ms: 0,
				perLesson: { [A]: { ok: 0, total: 0 } },
			}),
		);
		await finDeSession();
		expect(borne()).toBe(T);
		expect(journal()).toEqual({});
	});

	it('parité des modes (#69) : à score égal, tous journalisent la même marche', async () => {
		for (const [quoi, session] of SESSIONS_80) {
			profilNeuf();
			auMoment(T, session);
			await finDeSession();
			expect(borne(), quoi).toBe(T);
			expect(palier(A), quoi).toEqual({ enCours: T });
		}
	});
});

describe('l’ORDRE : l’étoile de la session date le palier « acquis » de CETTE session', () => {
	it('première leçon réussie sans faute : « acquis » tout de suite, et jamais « en cours »', async () => {
		// LE test discriminant. Si les franchissements étaient enregistrés AVANT l'étoile, cette
		// session verrait 100 % sans étoile, donc « en cours » : le journal dirait
		// { enCours: T } et « acquis » n'arriverait qu'à la session suivante. Un enfant qui
		// réussit du premier coup aurait une fausse marche intermédiaire, datée du bon jour, et
		// sa maîtrise antidatée d'une session.
		const res = auMoment(T, () =>
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 10,
				questionCount: 10,
				ms: 40_000,
				perLesson: { [A]: { ok: 10, total: 10 } },
			}),
		);
		// L'étoile a bien été attribuée par CETTE session (sans quoi le test serait creux).
		expect(res.starInfo).toEqual({ perfect: true, newStar: true, count: 1 });
		await finDeSession();
		expect(palier(A)).toEqual({ acquis: T });
	});

	it('et la 2de réussite ne rattrape rien : pas de marche « en cours » ajoutée après coup', async () => {
		// Contre-épreuve du cas précédent : sous l'ordre inverse, le journal finirait par
		// { enCours: T, acquis: T + 1 jour } — deux marches là où l'enfant n'en a franchi qu'une,
		// et la date d'acquisition décalée d'un jour.
		auMoment(T, () =>
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 10,
				questionCount: 10,
				ms: 40_000,
				perLesson: { [A]: { ok: 10, total: 10 } },
			}),
		);
		await finDeSession();
		auMoment(T + JOUR, () =>
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 10,
				questionCount: 10,
				ms: 35_000,
				perLesson: { [A]: { ok: 10, total: 10 } },
			}),
		);
		await finDeSession();
		expect(palier(A)).toEqual({ acquis: T });
	});

	it('deux marches par le chemin réel : « en cours », puis « acquis » à la réussite parfaite', async () => {
		auMoment(T, () =>
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 8,
				questionCount: 10,
				ms: 50_000,
				perLesson: { [A]: { ok: 8, total: 10 } },
			}),
		);
		await finDeSession();
		expect(palier(A)).toEqual({ enCours: T });
		auMoment(T + 7 * JOUR, () =>
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 10,
				questionCount: 10,
				ms: 45_000,
				perLesson: { [A]: { ok: 10, total: 10 } },
			}),
		);
		await finDeSession();
		expect(palier(A)).toEqual({ enCours: T, acquis: T + 7 * JOUR });
	});

	it('la marche est journalisée sur le profil ACTIF, et sur lui seul', async () => {
		const aine = activeProfile().uuid;
		const cadette = addProfile('Cadette').uuid;
		setActiveProfile(cadette);
		auMoment(T, () =>
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 10,
				questionCount: 10,
				ms: 20_000,
				perLesson: { [A]: { ok: 10, total: 10 } },
			}),
		);
		await finDeSession();
		expect(palier(A)).toEqual({ acquis: T });
		setActiveProfile(aine);
		expect(borne()).toBeNull(); // la session de l'une ne date pas le journal de l'autre
		expect(journal()).toEqual({});
	});
});

describe('sprint — « en cours » atteignable, « acquis » jamais', () => {
	/* Le chemin réel (`finalizeSprint`, `src/ui/sprint.ts`) est indissociable du DOM et de son
	   chrono : il n'est pas montable ici (c'est le smoke Playwright qui le couvre). Ce qui
	   compte pour le câblage est justement que son seul appel de progression,
	   `recordLessonStats(sprintPerLesson, 'sprint')`, suffise désormais. */
	it('recordLessonStats seul suffit : borne posée et marche « en cours » datée', async () => {
		auMoment(T, () =>
			recordLessonStats({ [A]: { ok: 8, total: 10 }, [B]: { ok: 1, total: 6 } }, 'sprint'),
		);
		await finDeSession();
		expect(borne()).toBe(T);
		expect(palier(A)).toEqual({ enCours: T });
		expect(palier(B)).toBeUndefined(); // 17 % → « à renforcer », pas une montée
	});

	it('un sprint parfait ne fait pas « acquérir » : il n’attribue pas d’étoile', async () => {
		auMoment(T, () => recordLessonStats({ [A]: { ok: 12, total: 12 } }, 'sprint'));
		await finDeSession();
		expect(palier(A)).toEqual({ enCours: T });
	});
});

/* ============================================================
   Bout en bout : ce que la frise de l'espace encadrant montre après UNE session.
   ------------------------------------------------------------
   La raison d'être du câblage. Sans report, ce profil n'aurait ni borne ni cap : la frise
   n'affirmerait rien (12 cellules 'inconnu') alors que l'enfant a travaillé. C'est
   exactement le mensonge que la frise peut tenir des semaines durant.
   Grille de semaines écrite ici (arithmétique de CALENDRIER, lundi premier jour), pas
   empruntée au code — même parti pris que frise-etats.test.ts.
   ============================================================ */
const NB_SEMAINES = 12;
const NOW = new Date(2026, 7, 12, 15, 30).getTime(); // mercredi 12 août 2026, 15 h 30

function joursApres(ts: number, jours: number): number {
	const d = new Date(ts);
	d.setDate(d.getDate() + jours);
	return d.getTime();
}
function lundiDe(ts: number): number {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // dimanche (0) → 6 jours en arrière
	return d.getTime();
}
/* Mercredi 10 h de la semaine portée par la cellule `i` (0 = la plus ancienne, 11 = en cours). */
function dansSemaine(i: number): number {
	return joursApres(lundiDe(NOW), 7 * (i - (NB_SEMAINES - 1)) + 2) + 10 * 3_600_000;
}
/* Rangée attendue en RUNS explicites : `rangee(['inconnu', 12])` = 12 cellules 'inconnu'. */
function rangee(...runs: [CelluleFrise, number][]): CelluleFrise[] {
	const out = runs.flatMap(([etat, n]) => Array.from({ length: n }, (): CelluleFrise => etat));
	if (out.length !== NB_SEMAINES)
		throw new Error(`rangée de ${out.length} cellules au lieu de ${NB_SEMAINES}`);
	return out;
}
function frise(recap: RecapProfil, lessonId: string): CelluleFrise[] | null {
	const n = recap.parCategorie.flatMap((c) => c.lecons).find((l) => l.lessonId === lessonId);
	if (!n) throw new Error('leçon absente du récap : ' + lessonId);
	return n.frise ? n.frise.semaines : null;
}

describe('bout en bout — la frise montre la session, au lieu de 12 pointillés', () => {
	it('une seule leçon travaillée six semaines plus tôt : « à découvrir » puis « en cours »', async () => {
		const p = activeProfile();
		auMoment(dansSemaine(5), () =>
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 8,
				questionCount: 10,
				ms: 60_000,
				perLesson: { [A]: { ok: 8, total: 10 } },
			}),
		);
		await finDeSession();
		const recap = progressionProfil(p, NOW);
		// Profil tout neuf : sa première session est DANS le suivi (le journal a démarré avec
		// elle), donc les semaines antérieures sont « à découvrir » et non un pointillé d'ignorance.
		expect(frise(recap, A)).toEqual(rangee(['a-decouvrir', 5], ['en-cours', 7]));
		// La leçon jamais ouverte, elle, n'a aucune trajectoire à montrer.
		expect(frise(recap, B)).toBeNull();
	});

	it('sans faute : la frise porte « acquis » dès la semaine de la session', async () => {
		const p = activeProfile();
		auMoment(dansSemaine(8), () =>
			recordLessonRun({
				mode: 'lecon',
				lessonId: A,
				ok: 10,
				questionCount: 10,
				ms: 55_000,
				perLesson: { [A]: { ok: 10, total: 10 } },
			}),
		);
		await finDeSession();
		expect(frise(progressionProfil(p, NOW), A)).toEqual(rangee(['a-decouvrir', 8], ['acquis', 4]));
	});

	/* Profil dont l'historique PRÉCÈDE la mise en service du journal : des stats de leçon, aucune
	   borne, aucun cap. C'est l'état de tous les profils existants au premier lancement de cette
	   version, et le seul où la borne a quelque chose à changer. Monté par les vraies fonctions,
	   à un instant figé (la date de 1re rencontre compte pour la frise), puis on efface ce que la
	   session a journalisé : il ne reste que l'historique. */
	async function historiqueAvantLeJournal(
		quand: number,
		perLesson: Record<string, { ok: number; total: number }>,
	): Promise<void> {
		auMoment(quand, () => recordLessonStats(perLesson));
		await finDeSession(); // on laisse la session finir d'écrire…
		lsRemoveQuiet(PALIERS_DEBUT_KEY); // …puis on retire borne et journal : reste l'historique
		lsRemoveQuiet(LESSON_PALIERS_KEY);
	}

	it('profil d’avant le journal : une simple dictée lui rend ses frises', async () => {
		// Le cas qui motive la borne posée par TOUTE session. Un enfant qui ne fait que des dictées
		// et de la révision espacée n'écrit aucune stat de leçon : sans borne, la frise ne déduit
		// rien et l'espace encadrant affiche « aucun suivi » sur toutes ses leçons alors qu'il
		// travaille. La dictée n'affirme rien sur les leçons — elle atteste que le journal tourne,
		// et c'est ce qui rend leur état déductible.
		const p = activeProfile();
		await historiqueAvantLeJournal(dansSemaine(2), { [A]: { ok: 2, total: 10 } });
		expect(borne()).toBeNull();
		expect(frise(progressionProfil(p, NOW), A)).toEqual(rangee(['inconnu', 12]));
		auMoment(dansSemaine(7), () => recordSessionActivity('dictee', 'fr-ortho-invariables-1'));
		await finDeSession();
		expect(borne()).toBe(dansSemaine(7));
		expect(journal()).toEqual({}); // et toujours aucun franchissement : rien n'a monté
		// La leçon était travaillée bien avant (semaine 2) : cette semaine-là a échappé au suivi,
		// donc elle reste 'inconnu' — mais tout ce qui suit la borne se déduit désormais.
		expect(frise(progressionProfil(p, NOW), A)).toEqual(rangee(['inconnu', 7], ['non-acquis', 5]));
	});
});
