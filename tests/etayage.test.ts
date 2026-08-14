/* ============================================================
   Étayage de la NOTION (#490) : sélection du contenu, déclencheur d'avant-série,
   leçon prérequise.
   ------------------------------------------------------------
   Attendus dérivés de la RÈGLE énoncée dans #490, pas de l'implémentation :

   1. SÉLECTION. L'entrée la plus spécifique gagne (niveau, puis mode). Une entrée
      qui vise un AUTRE niveau ou un AUTRE mode est écartée — jamais servie « faute de
      mieux » : un exemple « clique sur un nom, CE2 » donné à un enfant qui rate
      « clique sur l'adjectif, CM1 » est pire que rien. Corollaire central : sans
      entrée, `undefined`, donc PAS de panneau du tout.
   2. DÉCLENCHEUR. L'exemple d'avant-série se montre au RETOUR d'une mise de côté
      (report échu), une seule fois par ÉPISODE de blocage, et plus du tout à partir
      de `BLOCAGES_SIGNAL_ADULTE` (l'adulte prend le relais ; un dispositif
      auto-corrigé ne répare pas une incompréhension persistante par la répétition).
   3. REPLI mécanisable. La leçon prérequise est la précédente de la MÊME catégorie
      dans l'ordre pédagogique DU NIVEAU — attendus lus dans `ORDRE_LECONS`
      (data/ordre-pedagogique.ts), la spec pédagogique, et non dans le code.

   Les `EtatReport` sont construits par `apresEssaiLecon` (le vrai chemin d'un essai
   en mode leçon), jamais écrits à la main : un état inventé prouverait le
   comportement d'une situation qui n'arrive pas.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	doitEtayerAvantSerie,
	episodeEtayable,
	etayagePour,
	leconPrerequise,
	type EtayageEntree,
} from '../src/core/etayage';
import { apresEssaiLecon, BLOCAGES_SIGNAL_ADULTE } from '../src/core/report-lecon';
import type { EtatReport } from '../src/core/report-lecon';
import { getLessonById } from '../src/core/catalog';
import type { LessonDef } from '../src/core/catalog';
import type { Exercise } from '../src/core/exercise';
import { resolutionPosee } from '../src/core/etayage-posee';

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon absente du catalogue : ${id}`);
	return l;
};

/* Leçon de test minimale : `etayagePour` ne lit que `etayage`. */
function leconAvec(etayage?: EtayageEntree[]): LessonDef {
	const def: LessonDef = {
		id: 'test-etayage',
		label: 'Leçon de test',
		subject: 'math',
		category: 'test',
		levels: ['ce2', 'cm1'],
		exerciseType: {
			generate: (): Exercise => ({ type: 'text', question: '@', answer: 'x' }),
			check: () => false,
		},
	};
	if (etayage) def.etayage = etayage;
	return def;
}

const contenu = (titre: string) => ({ titre });

/* Instant fixe, heure locale (le report compte des jours CIVILS) : mars 2026, hors
   bascule d'heure d'été, pour que « +1 jour » reste 24 h pleines. */
const J = (jour: number, h = 9) => new Date(2026, 2, jour, h).getTime();

/* ============================================================
   1. SÉLECTION DU CONTENU
   ============================================================ */
describe('etayagePour — l’entrée la plus spécifique gagne, jamais de dégradation', () => {
	it('aucune entrée → undefined : pas de panneau du tout', () => {
		expect(etayagePour(leconAvec(), 'ce2')).toBeUndefined();
		expect(etayagePour(leconAvec(), 'ce2', 'saisie')).toBeUndefined();
		expect(etayagePour(leconAvec([]), 'ce2')).toBeUndefined();
	});

	it('entrée générale : servie à tous les niveaux et tous les modes', () => {
		const l = leconAvec([{ contenu: contenu('général') }]);
		expect(etayagePour(l, 'ce2')?.titre).toBe('général');
		expect(etayagePour(l, 'cm1')?.titre).toBe('général');
		expect(etayagePour(l, 'ce2', 'tuiles')?.titre).toBe('général');
		expect(etayagePour(l, 'cm1', 'saisie')?.titre).toBe('général');
	});

	it('une entrée de niveau gagne sur l’entrée générale — à ce niveau seulement', () => {
		const l = leconAvec([
			{ contenu: contenu('général') },
			{ niveau: 'cm1', contenu: contenu('cm1') },
		]);
		expect(etayagePour(l, 'cm1')?.titre).toBe('cm1');
		expect(etayagePour(l, 'ce2')?.titre).toBe('général');
	});

	it('l’ordre de déclaration ne change rien : la plus spécifique gagne quand même', () => {
		const l = leconAvec([
			{ niveau: 'cm1', contenu: contenu('cm1') },
			{ contenu: contenu('général') },
		]);
		expect(etayagePour(l, 'cm1')?.titre).toBe('cm1');
		expect(etayagePour(l, 'ce2')?.titre).toBe('général');
	});

	it('une entrée qui ne vise qu’un AUTRE niveau est écartée, jamais dégradée', () => {
		const l = leconAvec([{ niveau: 'cm1', contenu: contenu('cm1') }]);
		expect(etayagePour(l, 'ce2')).toBeUndefined();
		expect(etayagePour(l, 'ce2', 'saisie')).toBeUndefined();
	});

	it('une entrée de mode ne sert que ce mode, et pas une leçon lancée sans mode', () => {
		const l = leconAvec([{ mode: 'tuiles', contenu: contenu('tuiles') }]);
		expect(etayagePour(l, 'ce2', 'tuiles')?.titre).toBe('tuiles');
		expect(etayagePour(l, 'ce2', 'saisie')).toBeUndefined();
		expect(etayagePour(l, 'ce2')).toBeUndefined();
	});

	it('le niveau est plus spécifique que le mode ; niveau + mode l’emporte sur les deux', () => {
		const l = leconAvec([
			{ contenu: contenu('général') },
			{ mode: 'saisie', contenu: contenu('mode') },
			{ niveau: 'ce2', contenu: contenu('niveau') },
			{ niveau: 'ce2', mode: 'saisie', contenu: contenu('niveau+mode') },
		]);
		expect(etayagePour(l, 'ce2', 'saisie')?.titre).toBe('niveau+mode');
		// Sans l'entrée la plus précise, c'est le NIVEAU qui départage, pas le mode.
		const sansLaPlusPrecise = leconAvec([
			{ contenu: contenu('général') },
			{ mode: 'saisie', contenu: contenu('mode') },
			{ niveau: 'ce2', contenu: contenu('niveau') },
		]);
		expect(etayagePour(sansLaPlusPrecise, 'ce2', 'saisie')?.titre).toBe('niveau');
		// Au CM1, l'entrée de niveau CE2 disparaît : reste celle du mode.
		expect(etayagePour(sansLaPlusPrecise, 'cm1', 'saisie')?.titre).toBe('mode');
		expect(etayagePour(sansLaPlusPrecise, 'cm1', 'tuiles')?.titre).toBe('général');
	});
});

/* ============================================================
   2. LE CONTENU RÉEL DES TROIS LEÇONS PILOTES (données de la leçon)
   ============================================================ */
describe('étayage des opérations posées — la donnée de la leçon (#490)', () => {
	const PILOTES = ['calc-addition-posee', 'calc-soustraction-posee', 'calc-multiplication-posee'];

	it('les trois leçons pilotes portent un étayage, servi à leur niveau', () => {
		for (const id of PILOTES) {
			const l = lecon(id);
			expect(l.levels, id).toContain('ce2');
			const c = etayagePour(l, 'ce2');
			expect(c, id).toBeDefined();
			expect(c?.titre.length, id).toBeGreaterThan(0);
			// Le titre parle de la NOTION, jamais du geste (« Comment jouer ? » est l'aide #272).
			expect(c?.titre.toLowerCase(), id).not.toContain('comment jouer');
		}
	});

	it('la règle est UNE phrase, au tutoiement (charte des aides #272)', () => {
		for (const id of PILOTES) {
			const regle = etayagePour(lecon(id), 'ce2')?.regle ?? '';
			expect(regle.length, id).toBeGreaterThan(0);
			expect(regle.trim().endsWith('.'), `${id} : ${regle}`).toBe(true);
			// Une seule idée, donc une seule phrase : un point, à la fin.
			expect((regle.match(/\./g) ?? []).length, `${id} : ${regle}`).toBe(1);
			expect(regle.toLowerCase(), id).toMatch(/\btu\b/);
			expect(regle.toLowerCase(), id).not.toMatch(/\bvous\b/);
		}
	});

	it('la méthode est portée par l’exemple DÉROULÉ, pas doublée d’une liste d’étapes', () => {
		for (const id of PILOTES) {
			const c = etayagePour(lecon(id), 'ce2');
			expect(c?.exemple?.moteur, id).toBe('posee');
			expect(c?.etapes, id).toBeUndefined();
		}
	});

	it('chaque exemple MONTRE le mécanisme qui coince (sinon il n’apprend rien)', () => {
		const exemple = (id: string) => {
			const ex = etayagePour(lecon(id), 'ce2')?.exemple;
			if (!ex) throw new Error(`pas d'exemple pour ${id}`);
			return ex.spec;
		};
		// Addition : au moins deux retenues franches.
		const add = exemple('calc-addition-posee');
		expect(add.op).toBe('+');
		const resAdd = resolutionPosee(add);
		expect(
			resAdd.lignes[0].etapes.filter((e) => e.retenueSortante > 0).length,
		).toBeGreaterThanOrEqual(2);
		// Soustraction : au moins deux emprunts nets.
		const sous = exemple('calc-soustraction-posee');
		expect(sous.op).toBe('-');
		expect(sous.a).toBeGreaterThanOrEqual(sous.b); // jamais de négatif
		const resSous = resolutionPosee(sous);
		expect(resSous.lignes[0].etapes.filter((e) => e.emprunt).length).toBeGreaterThanOrEqual(2);
		// Multiplication : le déroulé complet à deux produits partiels (le pas qu'on perd).
		const mult = exemple('calc-multiplication-posee');
		expect(mult.op).toBe('x');
		expect(mult.b).toBeGreaterThanOrEqual(10);
		const resMult = resolutionPosee(mult);
		expect(resMult.lignes.map((l) => l.role)).toEqual([
			'produit-partiel',
			'produit-partiel-dizaines',
			'somme-partiels',
		]);
	});

	it('chaque exemple reste suivable en une passe (opérandes bornés, déroulé court)', () => {
		for (const id of PILOTES) {
			const ex = etayagePour(lecon(id), 'ce2')?.exemple;
			if (!ex) throw new Error(`pas d'exemple pour ${id}`);
			const { op, a, b } = ex.spec;
			expect(String(a).length, id).toBeLessThanOrEqual(3);
			// Multiplicateur à deux chiffres → multiplicande à deux chiffres au plus, sinon le
			// déroulé sort du suivable (dépendance au calibrage, cf. data/maths/posee.ts).
			if (op === 'x' && b >= 10) expect(String(a).length, id).toBeLessThanOrEqual(2);
			const pas = resolutionPosee(ex.spec).lignes.reduce((n, l) => n + l.etapes.length, 0);
			expect(pas, `${id} : ${pas} colonnes à dérouler`).toBeLessThanOrEqual(10);
		}
	});

	it('une leçon sans entrée d’étayage n’en reçoit aucune d’une autre (pas de repli par moteur)', () => {
		// « Je range les nombres » et « Les tables d'addition » n'ont pas de contenu rédigé :
		// aucune ne doit hériter de celui d'une voisine, même de la même catégorie.
		expect(etayagePour(lecon('math-tables-addition'), 'ce2')).toBeUndefined();
		expect(etayagePour(lecon('num-ranger'), 'ce2')).toBeUndefined();
	});
});

/* ============================================================
   3. DÉCLENCHEUR DE L'EXEMPLE D'AVANT-SÉRIE
   ============================================================ */
describe('episodeEtayable / doitEtayerAvantSerie — au retour d’une mise de côté', () => {
	/* Un épisode de blocage complet : jour 10 (1er blocage, aucun report), jour 11
	   (2e blocage → mise de côté d'un jour, le score n'étant pas « franchement bas »).
	   L'enfant revient donc dans le fil le jour 12. */
	const episodeUn = (): EtatReport => {
		let etat = apresEssaiLecon(undefined, 50, J(10));
		etat = apresEssaiLecon(etat, 50, J(11));
		return etat;
	};

	it('aucun état, ou un 1er jour de blocage sans report : rien à étayer', () => {
		expect(episodeEtayable(undefined, J(12))).toBe(0);
		const premier = apresEssaiLecon(undefined, 50, J(10));
		expect(premier.jours).toBe(1);
		expect(premier.reprendreLe).toBe(0);
		expect(episodeEtayable(premier, J(10, 18))).toBe(0);
		expect(doitEtayerAvantSerie(premier, 0, J(10, 18))).toBe(false);
	});

	it('rien pendant la mise de côté : l’exemple attend le RETOUR dans le fil', () => {
		const etat = episodeUn();
		expect(etat.jours).toBe(2);
		expect(etat.reprendreLe).toBeGreaterThan(etat.reporteLe);
		expect(episodeEtayable(etat, etat.reprendreLe - 1)).toBe(0); // encore de côté
		expect(episodeEtayable(etat, etat.reprendreLe)).toBe(etat.reporteLe); // de retour
		expect(episodeEtayable(etat, etat.reprendreLe + 1)).toBe(etat.reporteLe);
	});

	it('l’épisode est identifié par le report qui l’a ouvert', () => {
		const etat = episodeUn();
		expect(episodeEtayable(etat, J(13))).toBe(etat.reporteLe);
		expect(etat.reporteLe).toBe(J(11)); // l'essai qui a déclenché la mise de côté
	});

	it('une seule fois par épisode : relancer la leçon dix fois ne redonne pas dix exemples', () => {
		const etat = episodeUn();
		const episode = episodeEtayable(etat, J(13));
		expect(doitEtayerAvantSerie(etat, 0, J(13))).toBe(true); // rien de vu encore
		expect(doitEtayerAvantSerie(etat, episode, J(13))).toBe(false); // déjà vu cet épisode
		expect(doitEtayerAvantSerie(etat, episode, J(13, 18))).toBe(false);
		expect(doitEtayerAvantSerie(etat, episode, J(14))).toBe(false);
	});

	it('un épisode PLUS RÉCENT vaut un nouvel exemple (mémoire par épisode, pas un booléen)', () => {
		const premier = episodeUn();
		// Un second épisode, plus tard, avec le même nombre de jours de blocage : c'est le
		// report qui change, et c'est lui qui identifie l'épisode.
		let second = apresEssaiLecon(undefined, 50, J(40));
		second = apresEssaiLecon(second, 50, J(41));
		expect(second.jours).toBe(premier.jours);
		expect(episodeEtayable(second, J(43))).not.toBe(episodeEtayable(premier, J(13)));
		// L'exemple déjà vu au premier épisode ne couvre pas le second.
		expect(doitEtayerAvantSerie(second, episodeEtayable(premier, J(13)), J(43))).toBe(true);
	});

	it('à partir de 3 blocages, l’appli cesse d’expliquer : l’adulte prend le relais', () => {
		let etat = apresEssaiLecon(undefined, 50, J(10));
		etat = apresEssaiLecon(etat, 50, J(11));
		expect(etat.jours).toBe(BLOCAGES_SIGNAL_ADULTE - 1);
		expect(episodeEtayable(etat, etat.reprendreLe)).toBeGreaterThan(0); // 2 blocages : on explique
		etat = apresEssaiLecon(etat, 50, J(12));
		expect(etat.jours).toBe(BLOCAGES_SIGNAL_ADULTE);
		expect(episodeEtayable(etat, etat.reprendreLe)).toBe(0);
		expect(doitEtayerAvantSerie(etat, 0, etat.reprendreLe)).toBe(false);
		// Et ça ne revient plus, quel que soit le temps passé.
		etat = apresEssaiLecon(etat, 50, J(30));
		expect(episodeEtayable(etat, etat.reprendreLe)).toBe(0);
	});

	it('une leçon FRANCHIE n’a plus rien à étayer (le report est effacé)', () => {
		let etat = episodeUn();
		etat = apresEssaiLecon(etat, 80, J(12)); // franchie depuis le catalogue
		expect(etat.reporteLe).toBe(0);
		expect(episodeEtayable(etat, J(13))).toBe(0);
		expect(doitEtayerAvantSerie(etat, 0, J(13))).toBe(false);
	});
});

/* ============================================================
   4. LEÇON PRÉREQUISE (repli sans contenu rédigé)
   ------------------------------------------------------------
   Attendus lus dans `ORDRE_LECONS` (data/ordre-pedagogique.ts) :
   - « Calcul » (math-calcul) au CE2 : addition posée → soustraction posée →
     multiplication posée ;
   - « Grandeurs et mesures » au CE2 : longueurs → lecture de l'heure → masses ;
     au CM1 la lecture de l'heure n'existe pas → longueurs → masses.
   ============================================================ */
describe('leconPrerequise — la précédente de sa catégorie, dans l’ordre du niveau', () => {
	it('la leçon qui OUVRE sa catégorie n’a pas de prérequis', () => {
		expect(leconPrerequise(lecon('calc-addition-posee'), 'ce2')).toBeUndefined();
	});

	it('la précédente de la MÊME catégorie', () => {
		expect(leconPrerequise(lecon('calc-soustraction-posee'), 'ce2')?.id).toBe(
			'calc-addition-posee',
		);
		expect(leconPrerequise(lecon('calc-multiplication-posee'), 'ce2')?.id).toBe(
			'calc-soustraction-posee',
		);
	});

	it('le prérequis dépend du NIVEAU (la précédente peut ne pas exister à l’autre niveau)', () => {
		const masses = lecon('mes-masses');
		expect(masses.levels).toContain('ce2');
		expect(masses.levels).toContain('cm1');
		// Au CE2, la lecture de l'heure s'intercale entre longueurs et masses ; elle est
		// CE2-only, donc au CM1 la précédente redevient les longueurs.
		expect(leconPrerequise(masses, 'ce2')?.id).toBe('mes-lecture-heure');
		expect(lecon('mes-lecture-heure').levels).not.toContain('cm1');
		expect(leconPrerequise(masses, 'cm1')?.id).toBe('mes-longueurs');
		// Et les longueurs ouvrent la catégorie aux deux niveaux.
		expect(leconPrerequise(lecon('mes-longueurs'), 'ce2')).toBeUndefined();
		expect(leconPrerequise(lecon('mes-longueurs'), 'cm1')).toBeUndefined();
	});

	it('une leçon qui n’existe pas à ce niveau n’a pas de prérequis', () => {
		const mult = lecon('calc-multiplication-posee');
		expect(mult.levels).not.toContain('cm1'); // les posées ne sont pas surfacées au CM1
		expect(leconPrerequise(mult, 'cm1')).toBeUndefined();
	});

	it('le prérequis est toujours de la même catégorie et de la même matière', () => {
		for (const id of ['calc-soustraction-posee', 'mes-masses', 'fr-conj-avoir-present']) {
			const l = lecon(id);
			const prereq = leconPrerequise(l, 'ce2');
			expect(prereq, id).toBeDefined();
			expect(prereq?.category, id).toBe(l.category);
			expect(prereq?.subject, id).toBe(l.subject);
			expect(prereq?.id, id).not.toBe(l.id);
		}
	});
});
