/* ============================================================
   Tour du catalogue PAR MATIÈRE (#276) — critère 11 : la condition de transition
   et le déclenchement par matière × niveau (CE2 puis CM1).

   ⚠ À ne pas confondre avec `tour.test.ts`, qui porte le tour GUIDÉ de première
   visite (#330). Ici, « tour » = « avoir fait le tour des leçons d'une matière ».

   Attendus dérivés des critères de l'issue (commentaire daté du 22/08/2026 qui
   remplace les critères 1, 3 et 5), pas relus dans le code :
   - critère 3 : la barre célébrée est celle du FIL de la leçon du jour
     (`estFranchie` = étoilée OU réussie au seuil), et NON celle de `starsAll`
     (une étoile sur chaque leçon). L'écart est éprouvé de face : tout franchir au
     score sans une seule étoile doit décrocher le tour et pas `starsAll` ;
   - critère 5 : la maille est `matière × niveau` (`tour-math-ce2`,
     `tour-francais-cm1`…), calculée en direct, sans état persisté. Nommer d'après
     la classe de RÉFÉRENCE mentait dès qu'une matière était réglée ailleurs
     (#225), et mémoriser un tour de niveau l'aurait rendu inatteignable pour un
     enfant promu avant d'avoir tout fini (les leçons jamais tentées d'un niveau
     abandonné ne reviennent dans aucun pool, #232) ;
   - critère 2 : gate sur la TRANSITION — deux évaluations consécutives ne rendent
     un trophée qu'une fois.

   Les états sont montés par les chemins réels (`recordLessonResult` pour l'étoile,
   `recordEssaiLecon` pour le score), jamais en écrivant le stockage à la main.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { getAllLessons, SUBJECTS } from '../src/core/catalog';
import type { LessonDef, SchoolLevel, SubjectId } from '../src/core/catalog';
import { availableLevels, LEVEL_LABEL, LEVEL_ORDER } from '../src/core/levels';
import { tourMatiereFait } from '../src/core/lecon-du-jour';
import { recordLessonRun } from '../src/core/lesson-run';
import { SEUIL_FRANCHIE, enReport } from '../src/core/report-lecon';
import {
	recordEssaiLecon,
	recordLessonResult,
	loadLessonReports,
	getXP,
} from '../src/core/progress';
import {
	initProfiles,
	setNiveauMatiere,
	setNiveauReference,
	touchActiveProfile,
} from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import {
	TROPHIES,
	gSnapshot,
	evaluateTrophies,
	loadTrophies,
	trophiesVisibles,
	type Trophy,
} from '../src/core/rewards';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* « Réussie à au moins 70 % sur un essai complet en mode leçon » : le seuil de
   franchissement énoncé par la règle d'avancement (#485). Repris en littéral pour
   pouvoir tester le BORD (69 / 70) ; la prémisse ci-dessous garde la valeur. */
const SEUIL = 70;
const JOUR = 86_400_000;

const ids = (ls: LessonDef[]): string[] => ls.map((l) => l.id);
/* Leçons du catalogue disponibles à un niveau, éventuellement d'une seule matière. */
const auNiveau = (lv: SchoolLevel): LessonDef[] =>
	getAllLessons().filter((l) => l.levels.includes(lv));
const auNiveauMatiere = (lv: SchoolLevel, subject: SubjectId): LessonDef[] =>
	auNiveau(lv).filter((l) => l.subject === subject);

/* Franchir par le SCORE : essai complet en mode leçon, sans aucune étoile. */
const franchirAuScore = (lessonIds: string[], now = Date.now()): void => {
	for (const id of lessonIds) recordEssaiLecon(id, SEUIL, now);
};
/* Franchir par l'ÉTOILE : sans-faute, chemin réel (namespacé par le niveau de jeu). */
const etoiler = (lessonIds: string[]): void => {
	for (const id of lessonIds) recordLessonResult(id, true);
};
/* Toute une matière franchie au score, à un niveau donné. */
const franchirMatiere = (subject: SubjectId, lv: SchoolLevel): void =>
	franchirAuScore(ids(auNiveauMatiere(lv, subject)));
/* Carte d'étoiles au format de la VUE scopée (clés = id de leçon nu) : sert aux
   appels PURS de `tourMatiereFait`, sans passer par le stockage. */
const etoilesDe = (lessonIds: string[]): Record<string, number> => {
	const out: Record<string, number> = {};
	for (const id of lessonIds) out[id] = 1;
	return out;
};

/* Matières dont le tour est fait, clés `matière@niveau` triées. */
const toursDe = (): string[] => Object.keys(gSnapshot().toursMatiere).sort();
const nouveaux = (): string[] => evaluateTrophies().map((t) => t.id);
const partTour = (liste: string[]): string[] => liste.filter((id) => id.startsWith('tour-'));
const tourIds = (): string[] => partTour(TROPHIES.map((t) => t.id));

describe('tour par matière — prémisses du catalogue et de la règle', () => {
	it('le seuil de franchissement est bien 70 % (bord testé plus bas)', () => {
		// Si ce seuil bouge, les cas « 69 / 70 » ci-dessous doivent bouger avec lui :
		// c'est ici que ça doit échouer, avec un message clair.
		expect(SEUIL_FRANCHIE).toBe(SEUIL);
	});

	it('deux matières, deux niveaux peuplés chacune, et un niveau vide atteignable', () => {
		expect(SUBJECTS.map((s) => s.id)).toEqual(['math', 'francais']);
		for (const s of SUBJECTS)
			for (const lv of ['ce2', 'cm1'] as const)
				expect(auNiveauMatiere(lv, s.id).length).toBeGreaterThan(10);
		// Le garde-fou « aucune leçon à ce niveau » n'est testable que s'il existe un
		// niveau de l'échelle scolaire sans aucune leçon.
		expect(LEVEL_ORDER).toContain('cm2');
		expect(auNiveau('cm2')).toEqual([]);
		expect(availableLevels(getAllLessons())).toEqual(['ce2', 'cm1']);
	});
});

describe('toursMatiere — la barre du fil, matière par matière (critère 3)', () => {
	it('profil neuf : aucune matière au bout', () => {
		setNiveauReference('ce2');
		expect(toursDe()).toEqual([]);
		expect(tourMatiereFait('math')).toBe(false);
		expect(tourMatiereFait('francais')).toBe(false);
	});

	it('critère 3 : franchi AU SCORE, sans une seule étoile, les deux tours sont faits', () => {
		setNiveauReference('ce2');
		franchirAuScore(ids(auNiveau('ce2')));
		const g = gSnapshot();
		// Pas une seule étoile n'a été gagnée : les deux conditions ne coïncident pas.
		expect(g.stars).toBe(0);
		expect(g.starsTousNiveaux).toBe(0);
		expect(Object.keys(g.toursMatiere).sort()).toEqual(['francais@ce2', 'math@ce2']);
	});

	it('critère 3 : ce chemin décroche les deux tours du CE2 et PAS « Sans faute partout »', () => {
		setNiveauReference('ce2');
		franchirAuScore(ids(auNiveau('ce2')));
		const obtenus = nouveaux();
		// L'écart avec starsAll est le cœur du lot : tout franchir n'est pas tout étoiler.
		expect(obtenus).not.toContain('starsAll');
		expect(loadTrophies()).not.toContain('starsAll');
		expect(partTour(obtenus).sort()).toEqual(['tour-francais-ce2', 'tour-math-ce2']);
	});

	it('une seule leçon de maths jamais travaillée : le tour de maths n’est pas fait', () => {
		setNiveauReference('ce2');
		const maths = ids(auNiveauMatiere('ce2', 'math'));
		franchirAuScore(maths.slice(0, -1));
		franchirMatiere('francais', 'ce2');
		expect(tourMatiereFait('math')).toBe(false);
		expect(toursDe()).toEqual(['francais@ce2']); // off-by-one : une leçon suffit
		franchirAuScore(maths.slice(-1));
		expect(toursDe()).toEqual(['francais@ce2', 'math@ce2']);
	});

	it('bord du seuil : 69 % sur une seule leçon ne franchit pas, 70 % franchit', () => {
		setNiveauReference('ce2');
		const maths = ids(auNiveauMatiere('ce2', 'math'));
		const derniere = maths[maths.length - 1];
		franchirAuScore(maths.slice(0, -1));
		recordEssaiLecon(derniere, SEUIL - 1, Date.now());
		expect(tourMatiereFait('math')).toBe(false);
		recordEssaiLecon(derniere, SEUIL, Date.now());
		expect(tourMatiereFait('math')).toBe(true);
	});

	it('mélange des deux chemins de franchissement (étoile ici, score là)', () => {
		setNiveauReference('ce2');
		const maths = ids(auNiveauMatiere('ce2', 'math'));
		const moitie = Math.floor(maths.length / 2);
		etoiler(maths.slice(0, moitie));
		franchirAuScore(maths.slice(moitie));
		expect(tourMatiereFait('math')).toBe(true);
		// Le tour est fait alors qu'une moitié seulement est étoilée.
		expect(gSnapshot().stars).toBe(moitie);
	});

	it('une leçon MISE DE CÔTÉ n’est pas franchie : elle est différée, pas faite', () => {
		setNiveauReference('ce2');
		const maths = ids(auNiveauMatiere('ce2', 'math'));
		const dure = maths[maths.length - 1];
		franchirAuScore(maths.slice(0, -1));
		// Deux jours civils de blocage → mise de côté. Horodatages relatifs à maintenant :
		// gSnapshot lit l'instant réel, un report daté du passé serait déjà échu.
		const maintenant = Date.now();
		recordEssaiLecon(dure, 30, maintenant - JOUR);
		recordEssaiLecon(dure, 30, maintenant);
		expect(enReport(loadLessonReports()[dure], maintenant)).toBe(true); // prémisse du cas
		expect(tourMatiereFait('math')).toBe(false);
		expect(toursDe()).toEqual([]);
	});

	it('garde-fou : une matière sans aucune leçon à son niveau n’est PAS au bout', () => {
		// Le piège : sans leçon, « toutes franchies » est vrai à vide. Un profil qui n'a
		// jamais rien fait décrocherait le diplôme à froid.
		setNiveauReference('ce2');
		setNiveauMatiere('math', 'cm2');
		franchirMatiere('francais', 'ce2');
		expect(tourMatiereFait('math')).toBe(false);
		expect(toursDe()).toEqual(['francais@ce2']);
		expect(partTour(nouveaux())).toEqual(['tour-francais-ce2']);
	});

	it('la clé porte le niveau de LA MATIÈRE, pas la classe de référence', () => {
		setNiveauReference('cm1');
		setNiveauMatiere('math', 'ce2');
		franchirMatiere('math', 'ce2');
		expect(toursDe()).toEqual(['math@ce2']);
		// Les maths passent au CM1 : le tour du CE2 disparaît de l'instantané (il est
		// calculé en direct) et rien n'est franchi au CM1.
		setNiveauMatiere('math', 'cm1');
		expect(toursDe()).toEqual([]);
	});

	it('tourMatiereFait est PURE quand on lui passe les cartes (rien lu du stockage)', () => {
		setNiveauReference('ce2');
		const mathsEtoilees = etoilesDe(ids(auNiveauMatiere('ce2', 'math')));
		expect(tourMatiereFait('math', mathsEtoilees, {})).toBe(true);
		expect(tourMatiereFait('francais', mathsEtoilees, {})).toBe(false);
		// Le stockage, lui, est resté vierge : rien n'a été écrit ni lu en douce.
		expect(tourMatiereFait('math')).toBe(false);
	});
});

describe('famille de trophées « tour-<matière>-<niveau> » (critère 5)', () => {
	it('un trophée par couple matière × niveau PEUPLÉ, aucun pour un niveau vide', () => {
		expect(tourIds().slice().sort()).toEqual([
			'tour-francais-ce2',
			'tour-francais-cm1',
			'tour-math-ce2',
			'tour-math-cm1',
		]);
		// Un trophée impossible à décrocher n'a rien à faire dans la famille.
		for (const id of tourIds()) expect(id).not.toContain('cm2');
	});

	it('critère 14 : chaque trophée de tour nomme SA matière et SON niveau, et aucun autre', () => {
		// La galerie affiche titre + description : un texte qui nomme le niveau au-dessus
		// pointerait vers « la suite ».
		for (const t of TROPHIES.filter((x) => tourIds().includes(x.id))) {
			const texte = `${t.title} ${t.desc}`;
			const sub = SUBJECTS.find((s) => t.id.startsWith(`tour-${s.id}-`))!;
			const niveau = t.id.slice(`tour-${sub.id}-`.length) as SchoolLevel;
			expect(texte).toContain(LEVEL_LABEL[niveau]);
			expect(texte).toContain(sub.label);
			for (const autre of LEVEL_ORDER.filter((lv) => lv !== niveau))
				expect(texte).not.toContain(LEVEL_LABEL[autre]);
			for (const autre of SUBJECTS.filter((s) => s.id !== sub.id))
				expect(texte).not.toContain(autre.label);
		}
	});

	it('une matière finie, l’autre non : un seul trophée part, celui de la bonne matière', () => {
		setNiveauReference('ce2');
		franchirMatiere('francais', 'ce2');
		const obtenus = nouveaux();
		expect(partTour(obtenus)).toEqual(['tour-francais-ce2']);
		expect(loadTrophies()).not.toContain('tour-math-ce2');
		// Puis les maths suivent : leur propre trophée part, sans réannoncer l'autre.
		franchirMatiere('math', 'ce2');
		const ensuite = nouveaux();
		expect(partTour(ensuite)).toEqual(['tour-math-ce2']);
		expect(ensuite).not.toContain('tour-francais-ce2');
	});

	it('critère 5 : niveaux réglés par matière — jamais un diplôme CM1 pour des maths de CE2', () => {
		// Le cas qui a motivé la maille par matière : référence CM1, maths ajustées CE2.
		setNiveauReference('cm1');
		setNiveauMatiere('math', 'ce2');
		franchirMatiere('math', 'ce2');
		franchirMatiere('francais', 'cm1');
		const obtenus = nouveaux();
		expect(partTour(obtenus).sort()).toEqual(['tour-francais-cm1', 'tour-math-ce2']);
		// Ni un diplôme CM1 pour les maths, ni un diplôme CE2 pour le français.
		expect(loadTrophies()).not.toContain('tour-math-cm1');
		expect(loadTrophies()).not.toContain('tour-francais-ce2');
		// Les maths passent au CM1 : leur tour du CM1 devient atteignable…
		setNiveauMatiere('math', 'cm1');
		expect(partTour(nouveaux())).toEqual([]);
		franchirMatiere('math', 'cm1');
		const ensuite = nouveaux();
		expect(partTour(ensuite)).toEqual(['tour-math-cm1']);
		// …et le tour du CE2 reste acquis, sans être réannoncé.
		expect(ensuite).not.toContain('tour-math-ce2');
		expect(loadTrophies()).toContain('tour-math-ce2');
	});

	it('critère 5 : le second diplôme — tout le CE2, puis tout le CM1', () => {
		setNiveauReference('ce2');
		franchirAuScore(ids(auNiveau('ce2')));
		expect(partTour(nouveaux()).sort()).toEqual(['tour-francais-ce2', 'tour-math-ce2']);
		// Bascule au CM1 : rien n'y est franchi (les leçons communes sont rangées @ce2).
		setNiveauReference('cm1');
		expect(toursDe()).toEqual([]);
		expect(partTour(nouveaux())).toEqual([]);
		franchirAuScore(ids(auNiveau('cm1')));
		const ensuite = nouveaux();
		expect(partTour(ensuite).sort()).toEqual(['tour-francais-cm1', 'tour-math-cm1']);
		// Les tours du CE2 ne sont pas réannoncés, et restent acquis.
		expect(ensuite).not.toContain('tour-math-ce2');
		expect(loadTrophies()).toContain('tour-math-ce2');
		expect(loadTrophies()).toContain('tour-francais-ce2');
	});

	it('changer de classe ne re-verrouille pas un tour déjà acquis', () => {
		setNiveauReference('ce2');
		franchirMatiere('math', 'ce2');
		expect(nouveaux()).toContain('tour-math-ce2');
		setNiveauReference('cm1');
		expect(loadTrophies()).toContain('tour-math-ce2');
		setNiveauReference('ce2');
		expect(loadTrophies()).toContain('tour-math-ce2');
	});
});

describe('gate de transition (critère 2)', () => {
	it('le trophée part à l’instant où la DERNIÈRE leçon de la matière devient franchie', () => {
		setNiveauReference('ce2');
		const maths = ids(auNiveauMatiere('ce2', 'math'));
		franchirAuScore(maths.slice(0, -1));
		// Visites d'accueil avant l'échéance : rien ne doit partir.
		expect(partTour(nouveaux())).toEqual([]);
		expect(partTour(nouveaux())).toEqual([]);
		franchirAuScore(maths.slice(-1));
		expect(partTour(nouveaux())).toEqual(['tour-math-ce2']);
	});

	it('critère 1 : l’essai qui franchit la dernière leçon annonce le tour lui-même', () => {
		// Chemin RÉEL du runner : c'est `recordLessonRun` qui enregistre l'essai puis
		// évalue les trophées. Le tour doit donc partir à cet instant, pas au prochain
		// affichage de l'accueil. 7/10 = franchie au score, sans étoile.
		setNiveauReference('ce2');
		const maths = ids(auNiveauMatiere('ce2', 'math'));
		const derniere = maths[maths.length - 1];
		franchirAuScore(maths.slice(0, -1));
		const out = recordLessonRun({
			mode: 'lecon',
			lessonId: derniere,
			ok: 7,
			questionCount: 10,
			ms: 0,
			perLesson: { [derniere]: { ok: 7, total: 10 } },
		});
		expect(out.starInfo?.newStar).toBe(false); // aucune étoile sur cet essai
		expect(out.newTrophies.map((t) => t.id)).toContain('tour-math-ce2');
		// Et il est annoncé à l'enfant dans la foulée (modale + confettis côté UI).
		const titre = TROPHIES.find((t) => t.id === 'tour-math-ce2')!.title;
		expect(out.celeb.map((c) => c.text).join(' | ')).toContain(titre);
	});

	it('deux évaluations consécutives : la seconde n’annonce plus rien', () => {
		setNiveauReference('ce2');
		franchirAuScore(ids(auNiveau('ce2')));
		expect(partTour(nouveaux())).toHaveLength(2);
		expect(evaluateTrophies()).toEqual([]);
	});

	it('revenir sur l’accueil ne rejoue rien, même après un nouvel essai réussi', () => {
		setNiveauReference('ce2');
		const maths = ids(auNiveauMatiere('ce2', 'math'));
		franchirAuScore(maths);
		expect(nouveaux()).toContain('tour-math-ce2');
		// L'enfant retravaille une leçon et l'étoile : le tour reste acquis, pas réannoncé.
		recordLessonResult(maths[0], true);
		expect(nouveaux()).not.toContain('tour-math-ce2');
		expect(loadTrophies()).toContain('tour-math-ce2');
	});
});

/* Ids visibles dans la galerie, et leur part « hors tour ». */
const visiblesIds = (): string[] => trophiesVisibles().map((t) => t.id);
const horsTour = (liste: string[]): string[] => liste.filter((id) => !id.startsWith('tour-'));

describe('trophiesVisibles — la galerie ne montre pas « la suite » (critère 14)', () => {
	it('un enfant de CE2 ne voit que les tours du CE2, un CM1 voit les quatre', () => {
		setNiveauReference('ce2');
		expect(partTour(visiblesIds()).sort()).toEqual(['tour-francais-ce2', 'tour-math-ce2']);
		setNiveauReference('cm1');
		expect(partTour(visiblesIds()).sort()).toEqual(tourIds().slice().sort());
	});

	it('classe pas encore choisie : les tours du niveau au-dessus restent masqués', () => {
		// Le niveau de référence retombe sur le plus bas niveau peuplé du catalogue :
		// rien ne doit pointer vers le CM1 avant que l'encadrant ne l'ait décidé.
		expect(partTour(visiblesIds()).sort()).toEqual(['tour-francais-ce2', 'tour-math-ce2']);
	});

	it('un tour acquis reste visible même si le niveau redescend', () => {
		setNiveauReference('cm1');
		franchirMatiere('math', 'cm1');
		expect(nouveaux()).toContain('tour-math-cm1');
		setNiveauReference('ce2');
		// On ne retire jamais une reconnaissance de la galerie…
		expect(visiblesIds()).toContain('tour-math-cm1');
		// …mais le tour CM1 de l'autre matière, non acquis, redevient masqué.
		expect(partTour(visiblesIds()).sort()).toEqual([
			'tour-francais-ce2',
			'tour-math-ce2',
			'tour-math-cm1',
		]);
	});

	it('aucun trophée HORS famille « tour » n’est jamais filtré (ni réordonné)', () => {
		// Le risque, c'est un filtre trop gourmand qui escamote les autres trophées :
		// on compare à TROPHIES au lieu d'énumérer.
		const tous = TROPHIES.map((t) => t.id);
		for (const lv of ['ce2', 'cm1'] as const) {
			setNiveauReference(lv);
			expect(horsTour(visiblesIds())).toEqual(horsTour(tous));
		}
		// Et un profil sans classe choisie n'est pas un cas à part.
		localStorage.clear();
		initProfiles();
		expect(horsTour(visiblesIds())).toEqual(horsTour(tous));
	});

	it('la galerie ne masque QUE les tours au-dessus, un par un', () => {
		const tous = TROPHIES.map((t) => t.id);
		setNiveauReference('ce2');
		// Deux trophées manquent au CE2 : les tours du CM1 des deux matières.
		expect(visiblesIds()).toHaveLength(tous.length - 2);
		setNiveauReference('cm1');
		expect(visiblesIds()).toEqual(tous); // au plus haut niveau peuplé, rien n'est masqué
	});

	it('un futur trophée dont l’id commence par « tour- » n’est pas happé par le filtre', () => {
		// Le niveau d'un trophée de tour doit être mémorisé à la génération, pas redeviné
		// depuis l'id : sinon un trophée sans rapport disparaîtrait silencieusement.
		const leurre: Trophy = {
			id: 'tour-de-passe-passe',
			icon: '🎩',
			title: 'Leurre de test',
			desc: 'Trophée sans rapport avec les niveaux scolaires.',
			test: () => false,
		};
		TROPHIES.push(leurre);
		try {
			setNiveauReference('ce2');
			expect(visiblesIds()).toContain('tour-de-passe-passe');
		} finally {
			TROPHIES.splice(TROPHIES.indexOf(leurre), 1);
		}
	});

	it('invariant du compteur « N/M » : tout trophée ACQUIS et existant reste visible', () => {
		// La galerie compte les trophées acquis sur le total des VISIBLES : si un trophée
		// acquis pouvait être masqué, l'enfant lirait « 45/44 trophées obtenus ».
		setNiveauReference('cm1');
		etoiler(ids(auNiveau('cm1')));
		evaluateTrophies();
		setNiveauReference('ce2'); // pire cas : la classe redescend après coup
		const acquis: string[] = loadTrophies();
		const existants = new Set(TROPHIES.map((t) => t.id));
		const visibles = visiblesIds();
		expect(acquis.length).toBeGreaterThan(3); // le cas serait vide sans ça
		for (const id of acquis.filter((x) => existants.has(x))) expect(visibles).toContain(id);
	});
});

describe('non-régression (critère 17) : « Sans faute partout » et les paliers ⭐', () => {
	it('« Sans faute partout » garde sa condition : l’étoile de TOUTES les leçons', () => {
		setNiveauReference('ce2');
		const tout = ids(auNiveau('ce2'));
		// Tout franchi au score : les tours partent, starsAll non ; il reste une étoile à
		// décrocher partout.
		franchirAuScore(tout);
		expect(partTour(nouveaux())).toHaveLength(2);
		etoiler(tout.slice(0, -1));
		expect(nouveaux()).not.toContain('starsAll'); // une leçon sans étoile suffit à bloquer
		etoiler(tout.slice(-1));
		const obtenus = nouveaux();
		expect(obtenus).toContain('starsAll');
		// Jalons distincts : les tours ne sont pas réannoncés avec lui.
		expect(partTour(obtenus)).toEqual([]);
	});

	it('un tour de matière ne paie RIEN d’autre : ni XP, ni étoile, ni palier ⭐', () => {
		// Contrainte du game designer : sans elle, finir la matière la plus facile
		// deviendrait rentable.
		setNiveauReference('ce2');
		const xpAvant = getXP();
		franchirAuScore(ids(auNiveau('ce2')));
		const obtenus = nouveaux();
		// Les DEUX tours du CE2, et STRICTEMENT rien d'autre dans le lot annoncé.
		expect(obtenus.slice().sort()).toEqual(['tour-francais-ce2', 'tour-math-ce2']);
		expect(getXP()).toBe(xpAvant);
		expect(gSnapshot().stars).toBe(0);
		expect(gSnapshot().starsTousNiveaux).toBe(0);
	});

	it('un palier ⭐ ne déclenche aucun tour de matière', () => {
		setNiveauReference('ce2');
		etoiler(ids(auNiveauMatiere('ce2', 'math')).slice(0, 5));
		const obtenus = nouveaux();
		expect(obtenus).toContain('stars5');
		expect(partTour(obtenus)).toEqual([]);
		expect(toursDe()).toEqual([]);
	});
});
