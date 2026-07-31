/* ============================================================
   Tests du store du mode Orthographe (Vitest).
   On repart d'un localStorage vierge + profil par défaut (préfixe actif)
   comme le fait le reste de la suite.
   ============================================================ */
import { beforeEach, describe, test, expect } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import {
	emptyOrthoState,
	loadOrtho,
	saveOrtho,
	addOrGetMot,
	createListe,
	updateListe,
	deleteListe,
	getListe,
	motsDeListe,
	listeContenantMot,
	ajouterMots,
	formeNormalisee,
	normaliserFormes,
} from '../src/core/orthographe/store';
import { checkAnswer } from '../src/core/exercise';
import { genExerciseOrtho, orthoType } from '../src/core/orthographe/exercise';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import { MODES_ORTHO } from '../src/core/orthographe/types';
import type { VerbeConfig } from '../src/core/orthographe/types';
import { materialiserVerbes } from '../src/core/orthographe/verbes';
import {
	statutMot,
	prochaineActivite,
	prochainModeAValider,
	modesRequis,
	validerMode,
	marquerAtelierFait,
	listeEtoilee,
	decouverteEnCours,
} from '../src/core/orthographe/runner';
import {
	listOrthoLecons,
	motsDeLecon,
	labelLeconOrtho,
	groupeOrthoDuMot,
} from '../src/core/orthographe/lessons';
import { ACCORD_LESSONS } from '../src/data/francais/accords';
import { diffCorrect } from '../src/core/orthographe/diff';
import { gSnapshot, evaluateTrophies, loadTrophies } from '../src/core/rewards';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('orthographe — store', () => {
	test('état vide par défaut', () => {
		const s = loadOrtho();
		expect(s.banque).toEqual({});
		expect(s.listes).toEqual([]);
		expect(s.motIdParForme).toEqual({});
	});

	test('addOrGetMot crée puis déduplique par forme normalisée (trim + casse)', () => {
		const s = emptyOrthoState();
		const a = addOrGetMot(s, { mot: 'vélo' });
		const b = addOrGetMot(s, { mot: '  Vélo  ' });
		expect(b.id).toBe(a.id);
		expect(Object.keys(s.banque)).toHaveLength(1);
		expect(s.banque[a.id].mot).toBe('vélo'); // la 1re forme est conservée
	});

	test('addOrGetMot complète commeDans/homophone si absents', () => {
		const s = emptyOrthoState();
		const a = addOrGetMot(s, { mot: 'vers' });
		expect(a.commeDans).toBeUndefined();
		addOrGetMot(s, { mot: 'vers', commeDans: 'je vais vers la maison', homophone: true });
		expect(s.banque[a.id].commeDans).toBe('je vais vers la maison');
		expect(s.banque[a.id].homophone).toBe(true);
	});

	test('un nouveau mot initialise validation/atelier à zéro et entre en révision', () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'fleur' });
		expect(m.validation).toEqual({ motCache: false, tuiles: false, dictee: false });
		expect(m.atelierFait).toBe(false);
		expect(m.revision.palier).toBe(0);
		// Entrée en rotation de révision espacée dès l'ajout (#45) : 1er re-test à venir.
		expect(typeof m.revision.prochaineRevision).toBe('number');
		expect(m.revision.prochaineRevision!).toBeGreaterThan(Date.now());
	});

	test('createListe référence des ids dédupliqués et alimente la banque', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [
			{ mot: 'chat' },
			{ mot: 'chien' },
			{ mot: 'chat' }, // doublon dans la même liste
			{ mot: '   ' }, // entrée vide ignorée
		]);
		expect(liste.motIds).toHaveLength(2);
		expect(Object.keys(s.banque)).toHaveLength(2);
		expect(motsDeListe(s, liste).map((m) => m.mot)).toEqual(['chat', 'chien']);
	});

	test('un mot partagé entre deux listes garde un seul id (historique commun)', () => {
		const s = emptyOrthoState();
		const l1 = createListe(s, 'L1', [{ mot: 'temps' }]);
		const l2 = createListe(s, 'L2', [{ mot: 'Temps' }]);
		expect(Object.keys(s.banque)).toHaveLength(1);
		expect(l1.motIds[0]).toBe(l2.motIds[0]);
	});

	test('deleteListe retire la liste mais garde les mots en banque', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'maison' }]);
		expect(deleteListe(s, liste.id)).toBe(true);
		expect(s.listes).toHaveLength(0);
		expect(Object.keys(s.banque)).toHaveLength(1); // corpus de l'année conservé
		expect(deleteListe(s, 'inconnu')).toBe(false);
	});

	test('persistance via load/save (clé préfixée par profil)', () => {
		const s = emptyOrthoState();
		createListe(s, 'Semaine 1', [{ mot: 'jardin' }]);
		saveOrtho(s);
		const reloaded = loadOrtho();
		expect(reloaded.listes).toHaveLength(1);
		expect(reloaded.listes[0].label).toBe('Semaine 1');
		expect(Object.keys(reloaded.banque)).toHaveLength(1);
	});

	test('updateListe : modifie label/date et reconstruit les mots', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Avant', [{ mot: 'chat' }, { mot: 'chien' }]);
		const r = updateListe(s, liste.id, 'Après', [{ mot: 'chat' }, { mot: 'cheval' }], '2026-06-12');
		expect(r).not.toBeNull();
		const maj = getListe(s, liste.id)!;
		expect(maj.label).toBe('Après');
		expect(maj.dateControle).toBe('2026-06-12');
		expect(motsDeListe(s, maj).map((m) => m.mot)).toEqual(['chat', 'cheval']);
	});

	test('updateListe : id inconnu -> null', () => {
		const s = emptyOrthoState();
		expect(updateListe(s, 'inconnu', 'L', [{ mot: 'a' }])).toBeNull();
	});

	test('addOrGetMot : met à jour commeDans sur un mot existant', () => {
		const s = emptyOrthoState();
		const a = addOrGetMot(s, { mot: 'vers', commeDans: 'phrase 1' });
		addOrGetMot(s, { mot: 'vers', commeDans: 'phrase 2' });
		expect(s.banque[a.id].commeDans).toBe('phrase 2');
	});
});

describe('listeContenantMot — rattachement d’un mot à un groupe du journal (#391)', () => {
	test('mot d’une seule liste : renvoie l’id de CETTE liste', () => {
		const s = emptyOrthoState();
		createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		const liste = createListe(s, 'Semaine 2', [{ mot: 'jardin' }, { mot: 'maison' }]);
		expect(listeContenantMot(s, liste.motIds[1])).toBe(liste.id);
	});

	test('l’id renvoyé est bien celui d’un GROUPE affichable (même espace que la dictée)', () => {
		// Le journal encadrant résout le libellé du groupe avec labelLeconOrtho : un id de
		// liste doit y donner le nom de la liste (sinon l'erreur s'afficherait sans titre).
		const s = emptyOrthoState();
		const liste = createListe(s, 'Mots de la semaine', [{ mot: 'jardin' }]);
		const groupe = listeContenantMot(s, liste.motIds[0]);
		expect(groupe).not.toBeNull();
		expect(labelLeconOrtho(groupe!, s.listes)).toBe('Mots de la semaine');
	});

	test('mot en banque mais dans AUCUNE liste (leçon prédéfinie) : null', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		// Mots d'une leçon prédéfinie : matérialisés en banque, rattachés à aucune liste.
		const predef = ajouterMots(s, ORTHO_PREDEF[0].mots, 'predefini');
		const dansLaListe = new Set(liste.motIds); // un mot du parent peut coïncider (dédup)
		const horsListe = predef.filter((id) => !dansLaListe.has(id));
		expect(horsListe.length).toBeGreaterThan(0);
		for (const id of horsListe) expect(listeContenantMot(s, id)).toBeNull();
	});

	test('cible de verbe conjugué : en banque, mais rattachée à aucune liste → null', async () => {
		// Une liste porte ses verbes dans `verbes`, pas dans `motIds` : les cibles dépliées
		// (une par pronom × temps) vivent en banque sans être référencées par la liste.
		const s = emptyOrthoState();
		const verbe: VerbeConfig = {
			kind: 'verbe',
			infinitif: 'manger',
			pronoms: [0],
			temps: ['present'],
		};
		createListe(s, 'Semaine 1', [{ mot: 'chat' }], undefined, [verbe]);
		const cibles = await materialiserVerbes(s, [verbe], 1000);
		expect(cibles.length).toBeGreaterThan(0);
		for (const c of cibles) {
			expect(s.banque[c.id]).toBeDefined(); // bien en banque (donc en rotation de révision)
			expect(listeContenantMot(s, c.id)).toBeNull();
		}
	});

	test('banque vide / id inconnu : null (pas d’exception)', () => {
		const s = emptyOrthoState();
		expect(listeContenantMot(s, 'mot-inexistant')).toBeNull();
		createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		expect(listeContenantMot(s, 'mot-inexistant')).toBeNull();
	});

	test('liste vide (aucun mot) : ne capte personne', () => {
		const s = emptyOrthoState();
		createListe(s, 'Liste vide', []);
		const liste = createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		expect(listeContenantMot(s, liste.motIds[0])).toBe(liste.id);
	});

	test('mot partagé par PLUSIEURS listes : la première de state.listes', () => {
		// Un même mot saisi dans deux listes ne fait qu'UN mot en banque (dédup par forme),
		// donc l'ambiguïté est réelle et fréquente (mot revu d'une semaine sur l'autre).
		// Contrat retenu : la première liste de l'état. Acceptable car le mot raté est le
		// même partout — seul le libellé du GROUPE sous lequel le parent le lit change ;
		// aucune erreur n'est perdue ni dupliquée.
		const s = emptyOrthoState();
		const l1 = createListe(s, 'Semaine 1', [{ mot: 'temps' }]);
		const l2 = createListe(s, 'Semaine 2', [{ mot: 'Temps' }]);
		const motId = l1.motIds[0];
		expect(l2.motIds[0]).toBe(motId); // même mot en banque
		expect(listeContenantMot(s, motId)).toBe(l1.id);
		// Le choix est POSITIONNEL, pas fondé sur la fraîcheur : re-modifier la 2ᵉ liste
		// (updatedAt plus récent) ne la fait pas passer devant.
		updateListe(s, l2.id, 'Semaine 2', [{ mot: 'temps' }]);
		expect(listeContenantMot(s, motId)).toBe(l1.id);
		// … et si la 1re liste disparaît, le mot se rattache à celle qui reste.
		deleteListe(s, l1.id);
		expect(listeContenantMot(s, motId)).toBe(l2.id);
	});

	test('référence orpheline : répond sur la RÉFÉRENCE, même si le mot a quitté la banque', () => {
		// Contrairement à motsDeListe (qui filtre les orphelins), on cherche un groupe, pas
		// un mot : une désynchro banque/liste ne doit pas masquer le groupe de l'erreur.
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		const motId = liste.motIds[0];
		delete s.banque[motId];
		expect(motsDeListe(s, liste)).toEqual([]);
		expect(listeContenantMot(s, motId)).toBe(liste.id);
	});

	test('survit à un aller-retour de persistance (état relu du localStorage)', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'jardin' }]);
		saveOrtho(s);
		const relu = loadOrtho();
		expect(listeContenantMot(relu, liste.motIds[0])).toBe(liste.id);
	});
});

describe('groupeOrthoDuMot — groupe d’erreurs d’un mot révisé (#391)', () => {
	test('mot d’une liste du parent : l’id de la liste', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'jardin' }]);
		expect(groupeOrthoDuMot(s, liste.motIds[0])).toBe(liste.id);
	});

	test('mot d’une leçon PRÉDÉFINIE : la leçon qui le contient, avec un libellé résoluble', () => {
		const s = emptyOrthoState();
		const lecon = ORTHO_PREDEF[0];
		const mots = motsDeLecon(s, lecon.id); // matérialise la leçon en banque
		expect(mots.length).toBeGreaterThan(0);
		for (const m of mots) {
			const groupe = groupeOrthoDuMot(s, m.id);
			expect(groupe).toBe(lecon.id);
			// L'argument du rattachement : l'espace encadrant sait déjà nommer ce groupe.
			expect(labelLeconOrtho(groupe!, s.listes)).toBe(lecon.label);
		}
	});

	test('TOUT mot prédéfini a un groupe, et ce groupe le contient vraiment', () => {
		// Invariant : aucun mot d'une leçon prédéfinie n'entre en révision sans groupe
		// affichable (c'était le trou : ces erreurs n'étaient jamais journalisées).
		const s = emptyOrthoState();
		for (const lecon of ORTHO_PREDEF) motsDeLecon(s, lecon.id);
		for (const lecon of ORTHO_PREDEF) {
			for (const mi of lecon.mots) {
				const forme = formeNormalisee(mi.mot);
				const groupe = groupeOrthoDuMot(s, s.motIdParForme[forme]);
				expect(groupe).not.toBeNull();
				expect(labelLeconOrtho(groupe!, s.listes)).not.toBeNull();
				// Le groupe désigné contient réellement ce mot (pas un rattachement au hasard).
				const designee = ORTHO_PREDEF.find((l) => l.id === groupe)!;
				expect(designee.mots.some((m) => formeNormalisee(m.mot) === forme)).toBe(true);
			}
		}
	});

	test('mot partagé par deux leçons prédéfinies : la première déclarée', () => {
		// 41 formes sont communes à plusieurs leçons prédéfinies (un mot invariable qui
		// revient dans une dictée à thème). Contrat : la première de ORTHO_PREDEF. Le parent
		// peut donc lire l'erreur sous une leçon que l'enfant n'a pas ouverte ; le mot raté,
		// lui, est le bon — même arbitrage que « la première liste » pour les listes.
		const s = emptyOrthoState();
		for (const lecon of ORTHO_PREDEF) motsDeLecon(s, lecon.id);
		const compte = new Map<string, string[]>();
		for (const lecon of ORTHO_PREDEF) {
			for (const mi of lecon.mots) {
				const f = formeNormalisee(mi.mot);
				compte.set(f, [...(compte.get(f) ?? []), lecon.id]);
			}
		}
		const partages = [...compte.entries()].filter(([, ids]) => ids.length > 1);
		expect(partages.length).toBeGreaterThan(0); // le cas existe bel et bien dans les données
		for (const [forme, ids] of partages) {
			expect(groupeOrthoDuMot(s, s.motIdParForme[forme])).toBe(ids[0]);
		}
	});

	test('priorité : la LISTE du parent gagne sur la leçon prédéfinie', () => {
		// Mot entré en banque comme mot PRÉDÉFINI, que le parent reprend ensuite dans sa
		// liste : c'est son libellé à lui qu'il doit lire dans le rapport.
		const s = emptyOrthoState();
		const lecon = ORTHO_PREDEF[0];
		const motPredef = motsDeLecon(s, lecon.id)[0];
		const liste = createListe(s, 'Ma semaine', [{ mot: motPredef.mot }]);
		expect(liste.motIds).toContain(motPredef.id); // même mot en banque (dédup par forme)
		expect(groupeOrthoDuMot(s, motPredef.id)).toBe(liste.id);
		expect(labelLeconOrtho(liste.id, s.listes)).toBe('Ma semaine');
	});

	test('cible de verbe conjugué : la liste qui porte ce verbe', async () => {
		const s = emptyOrthoState();
		const verbe: VerbeConfig = {
			kind: 'verbe',
			infinitif: 'manger',
			pronoms: [0, 2],
			temps: ['present'],
		};
		const liste = createListe(s, 'Verbes de la semaine', [], undefined, [verbe]);
		const cibles = await materialiserVerbes(s, [verbe], 1000);
		expect(cibles.length).toBe(2);
		for (const c of cibles) {
			expect(groupeOrthoDuMot(s, c.id)).toBe(liste.id);
			expect(labelLeconOrtho(liste.id, s.listes)).toBe('Verbes de la semaine');
		}
	});

	test('mot vraiment orphelin (ni liste, ni prédéfini, ni verbe) : null', () => {
		const s = emptyOrthoState();
		createListe(s, 'Semaine 1', [{ mot: 'jardin' }]);
		const orphelin = addOrGetMot(s, { mot: 'zzzblurpix' });
		expect(groupeOrthoDuMot(s, orphelin.id)).toBeNull();
	});

	test('mot d’une liste SUPPRIMÉE : plus aucun groupe (la banque garde le mot)', () => {
		// Suppression d'une liste = les mots restent en banque (corpus de l'année) donc en
		// rotation de révision, mais leur groupe a disparu : l'erreur ne sera pas journalisée.
		const s = emptyOrthoState();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'zzzblurpix' }]);
		const motId = liste.motIds[0];
		deleteListe(s, liste.id);
		expect(s.banque[motId]).toBeDefined();
		expect(groupeOrthoDuMot(s, motId)).toBeNull();
	});

	test('id inconnu, banque vide, cible verbe sans liste : null (pas d’exception)', () => {
		const vide = emptyOrthoState();
		expect(groupeOrthoDuMot(vide, 'inexistant')).toBeNull();
		expect(groupeOrthoDuMot(vide, 'v:manger#present#0')).toBeNull();
		const s = emptyOrthoState();
		createListe(s, 'Semaine 1', [{ mot: 'jardin' }]);
		expect(groupeOrthoDuMot(s, 'inexistant')).toBeNull();
		expect(groupeOrthoDuMot(s, 'v:manger#present#0')).toBeNull();
	});
});

describe("orthographe — génération d'exercice", () => {
	test('motCache : affiche/masque, vérification texte stricte (accent exigé)', () => {
		const s = emptyOrthoState();
		const mot = addOrGetMot(s, { mot: 'château' });
		const ex = genExerciseOrtho(mot, 'motCache');
		expect(ex.type).toBe('motCache');
		expect(checkAnswer(ex, 'château')).toBe(true);
		expect(checkAnswer(ex, 'chateau')).toBe(false);
	});

	test('dictee : embarque commeDans', () => {
		const s = emptyOrthoState();
		const mot = addOrGetMot(s, { mot: 'vers', commeDans: 'je vais vers la maison' });
		const ex = genExerciseOrtho(mot, 'dictee');
		expect(ex.type).toBe('dictee');
		if (ex.type === 'dictee') expect(ex.commeDans).toBe('je vais vers la maison');
		expect(checkAnswer(ex, 'vers')).toBe(true);
	});

	test('tuiles : permutation des lettres exactes du mot', () => {
		const s = emptyOrthoState();
		const mot = addOrGetMot(s, { mot: 'chien' });
		const ex = genExerciseOrtho(mot, 'tuiles');
		expect(ex.type).toBe('tuiles');
		if (ex.type === 'tuiles') {
			expect([...ex.lettres].sort()).toEqual([...'chien'].sort());
			expect(ex.lettres).toHaveLength(5);
		}
		expect(checkAnswer(ex, 'chien')).toBe(true);
	});

	test('orthoType est mode-aware (defaut motCache)', () => {
		const s = emptyOrthoState();
		const mot = addOrGetMot(s, { mot: 'fleur' });
		const t = orthoType(mot);
		// Descripteurs de modes ciblés, dans l'ordre d'étayage (tuiles → mot caché → dictée).
		expect(t.modes?.map((m) => m.id)).toEqual(['tuiles', 'motCache', 'dictee']);
		expect(t.generate({ mode: 'tuiles' }).type).toBe('tuiles');
		expect(t.generate().type).toBe('motCache');
	});
});

describe('orthographe — leçons prédéfinies', () => {
	test('ORTHO_PREDEF : ids préfixés, libellés et mots présents', () => {
		expect(ORTHO_PREDEF.length).toBeGreaterThan(0);
		for (const l of ORTHO_PREDEF) {
			expect(l.id).toMatch(/^fr-ortho-/);
			expect(l.label.length).toBeGreaterThan(0);
			expect(l.mots.length).toBeGreaterThan(0);
		}
	});

	test('matérialisation : les mots prédéfinis entrent dans la banque', () => {
		const s = emptyOrthoState();
		const lecon = ORTHO_PREDEF[0];
		const ids = ajouterMots(s, lecon.mots, 'predefini');
		expect(ids).toHaveLength(lecon.mots.length);
		expect(Object.keys(s.banque)).toHaveLength(lecon.mots.length);
		expect(s.banque[ids[0]].origine).toBe('predefini');
	});

	test('ORTHO_PREDEF : aucun doublon de mot (forme normalisée) au sein d’une même leçon', () => {
		// Les leçons « Thème : … » (#106) partagent volontairement des mots entre
		// elles (reine, naitre…) : la banque dédoublonne à l'exécution (motIdParForme).
		// On garde donc l'invariant utile — pas deux fois le même mot dans UNE leçon.
		for (const l of ORTHO_PREDEF) {
			const formes = l.mots.map((mi) => formeNormalisee(mi.mot));
			expect(new Set(formes).size, `doublon dans « ${l.label} »`).toBe(formes.length);
		}
	});

	test('ORTHO_PREDEF : ids uniques', () => {
		const ids = ORTHO_PREDEF.map((l) => l.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('orthographe — formes fléchies / accords (#109)', () => {
	test('normaliserFormes : trim + NFC, et undefined si tout est vide', () => {
		expect(normaliserFormes(undefined)).toBeUndefined();
		expect(normaliserFormes({})).toBeUndefined();
		expect(normaliserFormes({ mascSing: '  ', femSing: '' })).toBeUndefined();
		expect(normaliserFormes({ mascSing: ' grand ', mascPlur: 'grands' })).toEqual({
			mascSing: 'grand',
			femSing: undefined,
			mascPlur: 'grands',
			femPlur: undefined,
		});
	});

	test('addOrGetMot : un mot sans formes reste « neutre » (utilisable ailleurs)', () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'bonjour' });
		expect(m.formes).toBeUndefined();
	});

	test('addOrGetMot : stocke les 4 formes fléchies', () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, {
			mot: 'grand',
			formes: { mascSing: 'grand', femSing: 'grande', mascPlur: 'grands', femPlur: 'grandes' },
		});
		expect(m.formes).toEqual({
			mascSing: 'grand',
			femSing: 'grande',
			mascPlur: 'grands',
			femPlur: 'grandes',
		});
	});

	test('addOrGetMot : met à jour les formes sur un mot existant (édition)', () => {
		const s = emptyOrthoState();
		const a = addOrGetMot(s, { mot: 'cheval' });
		expect(a.formes).toBeUndefined();
		addOrGetMot(s, { mot: 'cheval', formes: { mascSing: 'cheval', mascPlur: 'chevaux' } });
		expect(s.banque[a.id].formes).toEqual({
			mascSing: 'cheval',
			femSing: undefined,
			mascPlur: 'chevaux',
			femPlur: undefined,
		});
	});

	test('createListe : les formes survivent à la persistance (banque)', () => {
		const s = emptyOrthoState();
		createListe(s, 'Accords', [{ mot: 'petit', formes: { mascSing: 'petit', femSing: 'petite' } }]);
		saveOrtho(s);
		const reloaded = loadOrtho();
		const mot = Object.values(reloaded.banque).find((m) => m.mot === 'petit');
		expect(mot?.formes?.femSing).toBe('petite');
	});

	test('un mot fléchi de la banque « remonte » dans la leçon des accords réguliers', () => {
		// On sème un mot du parent avec des formes courtes uniques (hors jeu prédéfini).
		const s = loadOrtho();
		createListe(s, 'Ma liste', [
			{
				mot: 'lutin',
				formes: { mascSing: 'lutin', femSing: 'lutine', mascPlur: 'lutins', femPlur: 'lutines' },
			},
		]);
		saveOrtho(s);
		const reg = ACCORD_LESSONS.find((l) => l.id === 'fr-accords-reguliers')!;
		const sources = new Set<string>();
		for (let i = 0; i < 500; i++) {
			const ex = reg.exerciseType.generate({ mode: 'saisie' });
			const m = ex.type === 'text' ? /: (.+?) →/.exec(ex.question) : null;
			if (m) sources.add(m[1]);
		}
		expect([...sources].some((src) => src.startsWith('lutin'))).toBe(true);
	});
});

describe('orthographe — runner (logique pure)', () => {
	test('mot neuf : statut nouveau, activité = atelier', () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'chat' });
		expect(statutMot(m, true)).toBe('nouveau');
		expect(prochaineActivite(m, true)).toBe('atelier');
	});

	test("après l'atelier, la séquence est tuiles -> motCache -> dictee", () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'chat' });
		marquerAtelierFait(m);
		expect(statutMot(m, true)).toBe('enCours');
		expect(prochaineActivite(m, true)).toBe('tuiles');
		validerMode(m, 'tuiles');
		expect(prochaineActivite(m, true)).toBe('motCache');
		validerMode(m, 'motCache');
		expect(prochaineActivite(m, true)).toBe('dictee');
		validerMode(m, 'dictee');
		expect(statutMot(m, true)).toBe('maitrise');
	});

	test('sans TTS : la dictée n est pas requise', () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'chat' });
		marquerAtelierFait(m);
		validerMode(m, 'tuiles');
		validerMode(m, 'motCache');
		expect(modesRequis(false)).toEqual(['tuiles', 'motCache']);
		expect(prochainModeAValider(m, false)).toBeNull();
		expect(statutMot(m, false)).toBe('maitrise');
	});

	test('phase découverte : vraie tant qu un mot n a pas eu son atelier (#69)', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'chat' }, { mot: 'chien' }]);
		const mots = motsDeListe(s, liste);
		expect(decouverteEnCours(mots)).toBe(true);
		marquerAtelierFait(mots[0]);
		expect(decouverteEnCours(mots)).toBe(true); // un mot reste à découvrir
		marquerAtelierFait(mots[1]);
		expect(decouverteEnCours(mots)).toBe(false); // toute la liste est découverte
	});

	test("mot maîtrisé : activité = un mode (jamais l'atelier)", () => {
		const s = emptyOrthoState();
		const m = addOrGetMot(s, { mot: 'chat' });
		marquerAtelierFait(m);
		MODES_ORTHO.forEach((md) => validerMode(m, md));
		const act = prochaineActivite(m, true);
		expect(act).not.toBe('atelier');
		expect(MODES_ORTHO).toContain(act);
	});

	test('étoile de liste quand tous les mots sont maîtrisés', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'chat' }, { mot: 'chien' }]);
		const mots = motsDeListe(s, liste);
		expect(listeEtoilee(mots, false)).toBe(false);
		mots.forEach((m) => {
			marquerAtelierFait(m);
			validerMode(m, 'tuiles');
			validerMode(m, 'motCache');
		});
		expect(listeEtoilee(mots, false)).toBe(true);
		expect(listeEtoilee(mots, true)).toBe(false); // dictée requise mais non validée
	});
});

describe('orthographe — leçons (prédéfinies + listes)', () => {
	test('listOrthoLecons : prédéfinies seules sur profil vierge', () => {
		const s = emptyOrthoState();
		const lecons = listOrthoLecons(s);
		expect(lecons).toHaveLength(ORTHO_PREDEF.length);
		expect(lecons.every((l) => l.source === 'predefini')).toBe(true);
	});

	test('listOrthoLecons : ajoute les listes du profil', () => {
		const s = emptyOrthoState();
		createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }]);
		const lecons = listOrthoLecons(s);
		expect(lecons).toHaveLength(ORTHO_PREDEF.length + 1);
		const liste = lecons.find((l) => l.source === 'liste')!;
		expect(liste.label).toBe('Semaine 1');
		expect(liste.nbMots).toBe(2);
	});

	test('motsDeLecon : leçon prédéfinie matérialisée dans la banque', () => {
		const s = emptyOrthoState();
		const lecon = ORTHO_PREDEF[0];
		const mots = motsDeLecon(s, lecon.id);
		expect(mots).toHaveLength(lecon.mots.length);
		expect(Object.keys(s.banque)).toHaveLength(lecon.mots.length);
	});

	test('motsDeLecon : liste du profil', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'maison' }]);
		expect(motsDeLecon(s, liste.id).map((m) => m.mot)).toEqual(['maison']);
	});

	test('motsDeLecon : id inconnu -> liste vide', () => {
		const s = emptyOrthoState();
		expect(motsDeLecon(s, 'inconnu')).toEqual([]);
	});
});

describe('orthographe — filtrage CUMULATIF par niveau (#243)', () => {
	test('un profil CE2 ne voit que les leçons prédéfinies CE2', () => {
		const s = emptyOrthoState();
		const lecons = listOrthoLecons(s, 'ce2');
		const ids = new Set(lecons.map((l) => l.id));
		// Toutes les prédéfinies visibles sont des listes CE2.
		const niveauParId = new Map(ORTHO_PREDEF.map((l) => [l.id, l.niveau]));
		for (const l of lecons) expect(niveauParId.get(l.id)).toBe('ce2');
		// Les listes CM1 n'apparaissent jamais au CE2.
		expect(ids.has('fr-ortho-cm1-invariables')).toBe(false);
		expect(ids.has('fr-ortho-cm1-homophones')).toBe(false);
		// Le compte = exactement les prédéfinies CE2.
		const nbCe2 = ORTHO_PREDEF.filter((l) => l.niveau === 'ce2').length;
		expect(lecons).toHaveLength(nbCe2);
	});

	test('un profil CM1 voit les leçons CE2 ET CM1 (révision spiralaire)', () => {
		const s = emptyOrthoState();
		const ids = new Set(listOrthoLecons(s, 'cm1').map((l) => l.id));
		// Échantillon CE2 toujours présent…
		expect(ids.has('fr-ortho-invariables-1')).toBe(true);
		// …et les 4 nouvelles listes CM1 apparaissent.
		expect(ids.has('fr-ortho-cm1-invariables')).toBe(true);
		expect(ids.has('fr-ortho-cm1-finales')).toBe(true);
		expect(ids.has('fr-ortho-cm1-internes')).toBe(true);
		expect(ids.has('fr-ortho-cm1-homophones')).toBe(true);
		// Le compte CM1 = toutes les prédéfinies (cumul).
		expect(listOrthoLecons(s, 'cm1')).toHaveLength(ORTHO_PREDEF.length);
	});

	test('les listes du profil restent visibles à tous les niveaux (non taguées)', () => {
		const s = emptyOrthoState();
		createListe(s, 'Ma liste', [{ mot: 'pirate' }]);
		const maListe = (niveau: 'ce2' | 'cm1') =>
			listOrthoLecons(s, niveau).find((l) => l.source === 'liste' && l.label === 'Ma liste');
		expect(maListe('ce2')).toBeDefined();
		expect(maListe('cm1')).toBeDefined();
	});

	test('sans niveau : toutes les prédéfinies (lookups par id robustes)', () => {
		const s = emptyOrthoState();
		expect(listOrthoLecons(s)).toHaveLength(ORTHO_PREDEF.length);
	});
});

describe('orthographe — nouvelles leçons CM1 (#243)', () => {
	const CM1_IDS = [
		'fr-ortho-cm1-invariables',
		'fr-ortho-cm1-finales',
		'fr-ortho-cm1-internes',
		'fr-ortho-cm1-homophones',
	];

	test('les 4 nouvelles leçons existent et sont taguées niveau:cm1', () => {
		for (const id of CM1_IDS) {
			const l = ORTHO_PREDEF.find((x) => x.id === id);
			expect(l, `leçon ${id} manquante`).toBeDefined();
			expect(l!.niveau).toBe('cm1');
			expect(l!.mots.length).toBeGreaterThanOrEqual(10);
		}
	});

	test('chaque mot est UNIQUE dans toute la banque (aucun doublon ce2 ↔ cm1)', () => {
		// Forme normalisée (trim + NFC + casse), comme la déduplication du store.
		const occurrences = new Map<string, string[]>();
		for (const l of ORTHO_PREDEF) {
			for (const mi of l.mots) {
				const f = formeNormalisee(mi.mot);
				const arr = occurrences.get(f) ?? [];
				arr.push(l.id);
				occurrences.set(f, arr);
			}
		}
		// On NE tolère un partage de mot QU'entre leçons « Thème : … » (banques par sujet
		// qui se recoupent volontairement, cf. test existant). Aucun mot CM1 ne doit
		// réapparaître ailleurs (CE2 hors thèmes, ou autre liste CM1).
		const cm1MotsToutes = ORTHO_PREDEF.filter((l) => CM1_IDS.includes(l.id)).flatMap((l) =>
			l.mots.map((mi) => formeNormalisee(mi.mot)),
		);
		for (const f of cm1MotsToutes) {
			const dansListes = occurrences.get(f)!;
			expect(
				dansListes,
				`« ${f} » apparaît dans plusieurs leçons : ${dansListes.join(', ')}`,
			).toEqual(dansListes.filter((id) => CM1_IDS.includes(id)));
			expect(dansListes, `« ${f} » dupliqué entre leçons CM1`).toHaveLength(1);
		}
	});

	test('la leçon homophones CM1 : chaque entrée porte un commeDans (indictables sans contexte)', () => {
		const l = ORTHO_PREDEF.find((x) => x.id === 'fr-ortho-cm1-homophones')!;
		for (const mi of l.mots) {
			expect(mi.commeDans, `« ${mi.mot} » sans commeDans`).toBeTruthy();
			expect(mi.homophone, `« ${mi.mot} » non taguée homophone`).toBe(true);
		}
	});
});

describe('orthographe — diff de correction', () => {
	test('saisie correcte -> aucune lettre marquée', () => {
		expect(diffCorrect('château', 'château')).toEqual([
			false,
			false,
			false,
			false,
			false,
			false,
			false,
		]);
	});

	test('accent oublié -> seule la lettre accentuée est marquée', () => {
		// « chateau » vs « château » : le â (index 2) est marqué.
		expect(diffCorrect('chateau', 'château')).toEqual([
			false,
			false,
			true,
			false,
			false,
			false,
			false,
		]);
	});

	test('saisie vide -> toutes les lettres marquées', () => {
		expect(diffCorrect('', 'chat')).toEqual([true, true, true, true]);
	});

	test('lettre finale muette oubliée -> dernière lettre marquée', () => {
		// « gran » vs « grand » : le d final est marqué.
		const d = diffCorrect('gran', 'grand');
		expect(d[d.length - 1]).toBe(true);
		expect(d.slice(0, -1)).toEqual([false, false, false, false]);
	});
});

describe('orthographe — récompenses', () => {
	test('gSnapshot expose les métriques orthographe', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'chat' }, { mot: 'chien' }]);
		const m = motsDeListe(s, liste);
		marquerAtelierFait(m[0]);
		validerMode(m[0], 'motCache');
		validerMode(m[0], 'tuiles');
		saveOrtho(s);
		const g = gSnapshot();
		expect(g.orthoMotsAtelier).toBe(1);
		expect(g.orthoMotsMaitrises).toBe(1);
		expect(g.orthoListesMaitrisees).toBe(0); // le 2e mot n'est pas maîtrisé
	});

	test('le trophée « première liste » se débloque quand une liste est maîtrisée', () => {
		const s = emptyOrthoState();
		const liste = createListe(s, 'L', [{ mot: 'chat' }]);
		const m = motsDeListe(s, liste);
		validerMode(m[0], 'motCache');
		validerMode(m[0], 'tuiles');
		saveOrtho(s);
		const newly = evaluateTrophies();
		expect(newly.some((t) => t.id === 'orthoListes1')).toBe(true);
		expect(loadTrophies()).toContain('orthoListes1');
	});
});
