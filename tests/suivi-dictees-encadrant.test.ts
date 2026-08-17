/* ============================================================
   Épingler + suivre les listes de dictée dans l'espace encadrant (#424).
   ------------------------------------------------------------
   Couvre la logique PURE ajoutée : progression par liste d'orthographe
   (statutsLecon / avancementLecon / niveauListeOrtho), les helpers de
   préfixe « ortho: » de la file « à revoir », et les vues encadrant
   qui agrègent les dictées (revoirActives, listesOrthoProfil,
   epingleesProfil, loadOrthoFor).

   Parti pris de l'auteur des tests : les attendus sont DÉRIVÉS de la
   règle de maîtrise (runner : atelier fait + modes requis validés,
   dictée requise seulement si le TTS est dispo), jamais recopiés de
   progression.ts. On construit des états réalistes via le store, puis
   on FIXE l'état par-mot (atelier/validation) à la main.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import {
	initProfiles,
	activeProfile,
	addProfile,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import {
	emptyOrthoState,
	createListe,
	saveOrtho,
	loadOrtho,
	loadOrthoFor,
} from '../src/core/orthographe/store';
import { motsDeLecon, motsApercu } from '../src/core/orthographe/lessons';
import { cibleVerbeId } from '../src/core/orthographe/verbes';
import { etatNeuf } from '../src/core/revision';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import {
	statutsLecon,
	avancementLecon,
	niveauListeOrtho,
} from '../src/core/orthographe/progression';
import {
	REVOIR_ORTHO_PREFIX,
	orthoRevoirId,
	isOrthoRevoirId,
	orthoIdFromRevoir,
	toggleRevoirFor,
	revoirActives,
	listesOrthoProfil,
	dicteesProposees,
	epingleesProfil,
} from '../src/core/encadrant-stats';
import type { MotOrtho, OrthoState, VerbeConfig } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Fabrique d'états ----------
   État par-mot posé À LA MAIN (indépendant de progression.ts) : le statut d'un
   mot ne dépend QUE de atelierFait + validation (tuiles/motCache/dictee).
   Rappel de la règle de maîtrise (runner) qu'on encode ici sans y toucher :
   - nouveau      : atelier non fait ;
   - enCours      : atelier fait, tous les modes REQUIS pas encore validés ;
   - maitrise     : atelier fait + tous les modes requis validés
                    (dictée requise seulement si dicteeDispo). */
interface EtatMot {
	atelier?: boolean;
	tuiles?: boolean;
	motCache?: boolean;
	dictee?: boolean;
}
function poser(m: MotOrtho, e: EtatMot): void {
	m.atelierFait = e.atelier ?? false;
	m.validation = {
		tuiles: e.tuiles ?? false,
		motCache: e.motCache ?? false,
		dictee: e.dictee ?? false,
	};
}
/** Raccourci : mot pleinement travaillé HORS dictée (maîtrisé si dicteeDispo=false). */
const sansDictee: EtatMot = { atelier: true, tuiles: true, motCache: true, dictee: false };
/** Raccourci : mot pleinement travaillé, dictée comprise (maîtrisé quel que soit dicteeDispo). */
const complet: EtatMot = { atelier: true, tuiles: true, motCache: true, dictee: true };

/** Cible verbe placée directement en banque à son id déterministe. */
function poserCibleVerbe(
	state: OrthoState,
	infinitif: string,
	temps: 'present',
	person: number,
	mot: string,
	e: EtatMot,
): void {
	const id = cibleVerbeId(infinitif, temps, person);
	const cible: MotOrtho = {
		id,
		mot,
		entourage: [],
		atelierFait: e.atelier ?? false,
		validation: {
			tuiles: e.tuiles ?? false,
			motCache: e.motCache ?? false,
			dictee: e.dictee ?? false,
		},
		revision: etatNeuf(Date.now()),
		origine: 'verbe',
	};
	state.banque[id] = cible;
}

/* ============================================================
   progression.ts — statutsLecon / avancementLecon / niveauListeOrtho
   ============================================================ */
describe('progression — statutsLecon (liste du parent)', () => {
	it('liste jamais commencée → tous « nouveau »', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'L', [{ mot: 'chat' }, { mot: 'chien' }, { mot: 'cheval' }]);
		expect(statutsLecon(s, l.id, false)).toEqual(['nouveau', 'nouveau', 'nouveau']);
	});

	it('mélange nouveau / enCours / maîtrisé, dans l’ordre des mots', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'L', [{ mot: 'chat' }, { mot: 'chien' }, { mot: 'cheval' }]);
		poser(s.banque[l.motIds[0]], sansDictee); // maîtrisé (sans dictée)
		poser(s.banque[l.motIds[1]], { atelier: true }); // atelier seul → enCours
		// motIds[2] intact → nouveau
		expect(statutsLecon(s, l.id, false)).toEqual(['maitrise', 'enCours', 'nouveau']);
	});

	it('un mot ATTENDU absent de la banque compte « nouveau »', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'L', [{ mot: 'chat' }, { mot: 'chien' }]);
		poser(s.banque[l.motIds[0]], sansDictee);
		delete s.banque[l.motIds[1]]; // simule un mot jamais matérialisé/joué
		expect(statutsLecon(s, l.id, false)).toEqual(['maitrise', 'nouveau']);
	});

	it('id inconnu → [] (et avancement neutre)', () => {
		const s = emptyOrthoState();
		expect(statutsLecon(s, 'liste-fantome', false)).toEqual([]);
		expect(avancementLecon(s, 'liste-fantome', false)).toEqual({
			niveau: 'a-decouvrir',
			total: 0,
			maitrises: 0,
		});
	});
});

describe('progression — avancementLecon (échelle à 3 niveaux)', () => {
	it('tous « nouveau » → a-decouvrir, maitrises 0', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'L', [{ mot: 'a' }, { mot: 'b' }]);
		expect(avancementLecon(s, l.id, false)).toEqual({
			niveau: 'a-decouvrir',
			total: 2,
			maitrises: 0,
		});
	});

	it('au moins un mot entamé mais pas tous maîtrisés → en-cours, avec le compte exact', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'L', [{ mot: 'a' }, { mot: 'b' }, { mot: 'c' }]);
		poser(s.banque[l.motIds[0]], sansDictee);
		poser(s.banque[l.motIds[1]], sansDictee);
		// c reste nouveau
		expect(avancementLecon(s, l.id, false)).toEqual({
			niveau: 'en-cours',
			total: 3,
			maitrises: 2,
		});
	});

	it('un mot « nouveau » + un « maîtrisé » (aucun enCours) reste en-cours', () => {
		// Cas limite : « en-cours » n'exige pas un mot au statut enCours, juste
		// « ni tous nouveaux, ni tous maîtrisés ».
		const s = emptyOrthoState();
		const l = createListe(s, 'L', [{ mot: 'a' }, { mot: 'b' }]);
		poser(s.banque[l.motIds[0]], sansDictee);
		expect(avancementLecon(s, l.id, false).niveau).toBe('en-cours');
	});

	it('tous maîtrisés → acquis, maitrises = total', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'L', [{ mot: 'a' }, { mot: 'b' }]);
		l.motIds.forEach((id) => poser(s.banque[id], sansDictee));
		expect(avancementLecon(s, l.id, false)).toEqual({
			niveau: 'acquis',
			total: 2,
			maitrises: 2,
		});
	});
});

describe('progression — effet de dicteeDispo (cas tricky)', () => {
	it('mot validé tuiles+motCache sans dictée : acquis si TTS absent, en-cours si TTS présent', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'L', [{ mot: 'chat' }]);
		poser(s.banque[l.motIds[0]], sansDictee);
		// Sans TTS : la dictée n'est pas requise → maîtrisé → liste acquise.
		expect(niveauListeOrtho(s, l.id, false)).toBe('acquis');
		expect(avancementLecon(s, l.id, false).maitrises).toBe(1);
		// Avec TTS : dictée requise mais non validée → enCours → liste en-cours.
		expect(niveauListeOrtho(s, l.id, true)).toBe('en-cours');
		expect(avancementLecon(s, l.id, true).maitrises).toBe(0);
	});

	it('mot complet (dictée comprise) : acquis dans les deux cas', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'L', [{ mot: 'chat' }]);
		poser(s.banque[l.motIds[0]], complet);
		expect(niveauListeOrtho(s, l.id, false)).toBe('acquis');
		expect(niveauListeOrtho(s, l.id, true)).toBe('acquis');
	});
});

describe('progression — cibles verbe (#261, résolues par id déterministe)', () => {
	const verbes: VerbeConfig[] = [
		{ kind: 'verbe', infinitif: 'manger', pronoms: [0, 2], temps: ['present'] },
	];

	it('une cible par couple temps×pronom ; absentes de la banque → nouveau', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'Verbes', [], undefined, verbes);
		// 2 pronoms × 1 temps = 2 cibles attendues, aucune matérialisée.
		expect(statutsLecon(s, l.id, false)).toEqual(['nouveau', 'nouveau']);
	});

	it('cible matérialisée résolue par cibleVerbeId ; compte total/maitrises correct', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'Verbes', [], undefined, verbes);
		poserCibleVerbe(s, 'manger', 'present', 0, 'mange', sansDictee); // « je mange » maîtrisé
		// personne 2 (« il ») laissée absente → nouveau
		expect(statutsLecon(s, l.id, false)).toEqual(['maitrise', 'nouveau']);
		expect(avancementLecon(s, l.id, false)).toEqual({
			niveau: 'en-cours',
			total: 2,
			maitrises: 1,
		});
	});

	it('mots simples + verbes : le total additionne les deux familles', () => {
		const s = emptyOrthoState();
		const l = createListe(s, 'Mix', [{ mot: 'chat' }, { mot: 'chien' }], undefined, verbes);
		// 2 simples + 2 cibles = 4 mots attendus.
		expect(avancementLecon(s, l.id, false).total).toBe(4);
		// Statuts : simples en tête (ordre des motIds), puis les cibles verbe.
		poser(s.banque[l.motIds[0]], sansDictee);
		poserCibleVerbe(s, 'manger', 'present', 0, 'mange', complet);
		const st = statutsLecon(s, l.id, false);
		expect(st).toEqual(['maitrise', 'nouveau', 'maitrise', 'nouveau']);
	});
});

describe('progression — dictée prédéfinie (résolution par forme normalisée)', () => {
	const predef = ORTHO_PREDEF.find((l) => l.id === 'fr-ortho-invariables-1')!;

	it('jamais matérialisée → tous « nouveau », total = nb de mots de la leçon', () => {
		const s = emptyOrthoState();
		const av = avancementLecon(s, predef.id, false);
		expect(av.niveau).toBe('a-decouvrir');
		expect(av.total).toBe(predef.mots.length);
		expect(av.maitrises).toBe(0);
		expect(statutsLecon(s, predef.id, false).every((x) => x === 'nouveau')).toBe(true);
	});

	it('matérialisée puis K mots maîtrisés → en-cours, maitrises = K (lookup par forme)', () => {
		const s = emptyOrthoState();
		const mots = motsDeLecon(s, predef.id); // matérialise toute la leçon dans la banque
		expect(mots.length).toBe(predef.mots.length);
		const K = 3;
		for (let i = 0; i < K; i++) poser(mots[i], sansDictee);
		const av = avancementLecon(s, predef.id, false);
		expect(av.niveau).toBe('en-cours');
		expect(av.total).toBe(predef.mots.length);
		expect(av.maitrises).toBe(K);
	});

	it('tous maîtrisés hors dictée : acquis sans TTS, en-cours avec TTS', () => {
		const s = emptyOrthoState();
		const mots = motsDeLecon(s, predef.id);
		mots.forEach((m) => poser(m, sansDictee));
		expect(niveauListeOrtho(s, predef.id, false)).toBe('acquis');
		expect(niveauListeOrtho(s, predef.id, true)).toBe('en-cours');
	});
});

/* ============================================================
   Helpers de préfixe « ortho: » (encadrant-stats)
   ============================================================ */
describe('helpers de préfixe « ortho: »', () => {
	it('préfixe attendu et aller-retour id → entrée → id', () => {
		expect(REVOIR_ORTHO_PREFIX).toBe('ortho:');
		for (const id of ['fr-ortho-invariables-1', 'a1b2-uuid', '', 'ortho:déjà-préfixé']) {
			const entry = orthoRevoirId(id);
			expect(isOrthoRevoirId(entry)).toBe(true);
			expect(orthoIdFromRevoir(entry)).toBe(id); // round-trip exact
		}
	});

	it('distingue une entrée de dictée d’un id de leçon du catalogue', () => {
		expect(isOrthoRevoirId('ortho:fr-ortho-invariables-1')).toBe(true);
		// Un id de leçon brut (même s'il contient « ortho ») n'est PAS une entrée de dictée.
		expect(isOrthoRevoirId('fr-ortho-invariables-1')).toBe(false);
		expect(isOrthoRevoirId('math-complements')).toBe(false);
	});
});

/* ============================================================
   revoirActives — union catalogue / dictée
   ============================================================ */
describe('revoirActives — entrées de dictée (kind ortho)', () => {
	it('coexiste avec une leçon catalogue ; chaque entrée porte son kind et l’id brut', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(s, 'Dictée', [{ mot: 'chat' }]);
		saveOrtho(s);
		toggleRevoirFor(p.uuid, orthoRevoirId(l.id));
		toggleRevoirFor(p.uuid, 'math-complements'); // leçon jamais retravaillée → faible

		const actives = revoirActives(false);
		const ortho = actives.find((e) => e.kind === 'ortho');
		const lecon = actives.find((e) => e.kind === 'lecon');
		expect(ortho).toBeTruthy();
		expect(ortho!.id).toBe(l.id); // id BRUT (sans préfixe)
		expect(ortho!.label).toBe('Dictée');
		if (ortho!.kind === 'ortho') expect(ortho!.source).toBe('liste');
		expect(lecon).toBeTruthy();
		expect(lecon!.id).toBe('math-complements');
	});

	it('auto-nettoyage quand la liste devient acquise ; dicteeDispo conditionne l’acquis', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(s, 'Dictée', [{ mot: 'chat' }]);
		poser(s.banque[l.motIds[0]], sansDictee); // tuiles+motCache, PAS de dictée
		saveOrtho(s);
		toggleRevoirFor(p.uuid, orthoRevoirId(l.id));

		// Sans TTS : liste acquise → retirée de la boucle.
		expect(revoirActives(false).some((e) => e.kind === 'ortho' && e.id === l.id)).toBe(false);
		// Avec TTS : dictée requise et manquante → liste encore en cours → présente.
		expect(revoirActives(true).some((e) => e.kind === 'ortho' && e.id === l.id)).toBe(true);
	});

	it('entrée de dictée orpheline (liste supprimée) ignorée', () => {
		const p = activeProfile();
		saveOrtho(loadOrtho()); // état ortho vide mais présent
		toggleRevoirFor(p.uuid, orthoRevoirId('liste-disparue'));
		expect(revoirActives(false)).toEqual([]);
	});
});

/* ============================================================
   motsApercu — ordre d'AFFICHAGE des mots d'une leçon (#441)
   ------------------------------------------------------------
   Attendus dérivés de la règle annoncée, pas du code : ordre du
   dictionnaire FRANÇAIS pour une liste du parent (les accents se
   rangent avec leur lettre de base, la casse ne prime pas sur la
   lettre), ordre d'origine intact pour une prédéfinie (l'ordre y
   porte du sens : les nombres se lisent 0, 1, 2… pas c-d-h-n).
   ============================================================ */
describe('motsApercu — liste du parent (tri alphabétique français)', () => {
	it('range les accents avec leur lettre de base, pas après le z', () => {
		// Un tri par code de caractère rejetterait « école » / « Éléphant » APRÈS « zèbre ».
		const saisie = ['zèbre', 'école', 'avion', 'Éléphant', 'eau'];
		expect(motsApercu(saisie, 'liste')).toEqual(['avion', 'eau', 'école', 'Éléphant', 'zèbre']);
	});

	it('la majuscule ne passe pas devant : c’est la lettre qui décide', () => {
		// Par code de caractère, toutes les capitales précéderaient toutes les minuscules.
		expect(motsApercu(['Zèbre', 'abeille', 'Chat', 'chien'], 'liste')).toEqual([
			'abeille',
			'Chat',
			'chien',
			'Zèbre',
		]);
	});

	it('conserve les doublons (aperçu fidèle, pas de dédoublonnage silencieux)', () => {
		expect(motsApercu(['pomme', 'banane', 'pomme'], 'liste')).toEqual(['banane', 'pomme', 'pomme']);
	});

	it('ne mute pas l’entrée et renvoie un nouveau tableau', () => {
		const saisie = ['chien', 'chat'];
		const sortie = motsApercu(saisie, 'liste');
		expect(saisie).toEqual(['chien', 'chat']); // l'ordre de saisie du parent reste intact
		expect(sortie).not.toBe(saisie);
	});

	it('est une PERMUTATION de l’entrée (rien de perdu ni d’ajouté)', () => {
		// Échantillon de mots réels : on éprouve la conservation, pas l'ordre.
		for (const lecon of ORTHO_PREDEF) {
			const source = lecon.mots.map((mi) => mi.mot);
			const vu = motsApercu(source, 'liste');
			expect(vu).toHaveLength(source.length);
			expect([...vu].sort()).toEqual([...source].sort()); // même multi-ensemble
		}
	});

	it('tableau vide → tableau vide (et pas la même référence)', () => {
		const vide: string[] = [];
		expect(motsApercu(vide, 'liste')).toEqual([]);
		expect(motsApercu(vide, 'liste')).not.toBe(vide);
	});
});

describe('motsApercu — leçon prédéfinie (ordre d’origine)', () => {
	it('rend l’ordre de la leçon tel quel, même s’il n’est pas alphabétique', () => {
		const saisie = ['troisième', 'premier', 'deuxième'];
		expect(motsApercu(saisie, 'predefini')).toEqual(['troisième', 'premier', 'deuxième']);
	});

	it('ne mute pas l’entrée et renvoie un nouveau tableau', () => {
		const saisie = ['b', 'a'];
		const sortie = motsApercu(saisie, 'predefini');
		expect(saisie).toEqual(['b', 'a']);
		expect(sortie).not.toBe(saisie);
	});

	it('tableau vide → tableau vide (et pas la même référence)', () => {
		const vide: string[] = [];
		expect(motsApercu(vide, 'predefini')).toEqual([]);
		expect(motsApercu(vide, 'predefini')).not.toBe(vide);
	});

	it('données réelles : « Les nombres (0 à 10) » reste NUMÉRIQUE', () => {
		const nombres = ORTHO_PREDEF.find((l) => l.id === 'fr-ortho-nombres-1')!.mots.map(
			(mi) => mi.mot,
		);
		// Attendu dérivé du libellé de la leçon (0 → 10), pas du fichier de données.
		const ordreNumerique = [
			'zéro',
			'un',
			'deux',
			'trois',
			'quatre',
			'cinq',
			'six',
			'sept',
			'huit',
			'neuf',
			'dix',
		];
		expect(motsApercu(nombres, 'predefini')).toEqual(ordreNumerique);
		// Et la source CHANGE bien le résultat : en « liste », les mêmes mots passeraient
		// à l'ordre du dictionnaire — inutilisable pour apprendre à compter.
		expect(motsApercu(nombres, 'liste')).toEqual([
			'cinq',
			'deux',
			'dix',
			'huit',
			'neuf',
			'quatre',
			'sept',
			'six',
			'trois',
			'un',
			'zéro',
		]);
	});

	it('données réelles : TOUTES les prédéfinies gardent leur ordre de déclaration', () => {
		for (const lecon of ORTHO_PREDEF) {
			const source = lecon.mots.map((mi) => mi.mot);
			expect(motsApercu(source, 'predefini')).toEqual(source);
		}
	});
});

/* ============================================================
   listesOrthoProfil — récap des dictées d'un profil
   ============================================================ */
describe('listesOrthoProfil — filtre et champs', () => {
	it('liste du parent toujours présente ; prédéfinies non commencées masquées', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }]);
		saveOrtho(s);

		const recap = listesOrthoProfil(p, false);
		// Une seule entrée : la liste du parent (toutes les prédéfinies sont à découvrir).
		expect(recap.map((r) => r.id)).toEqual([l.id]);
		expect(recap[0]).toMatchObject({
			id: l.id,
			label: 'Semaine 1',
			source: 'liste',
			niveau: 'a-decouvrir',
			epingle: false,
			nbMots: 2,
			maitrises: 0,
		});
	});

	it('une prédéfinie apparaît dès qu’elle est commencée', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const predefId = 'fr-ortho-invariables-1'; // niveau CE2 = niveau du profil par défaut
		const mots = motsDeLecon(s, predefId);
		poser(mots[0], { atelier: true }); // un mot entamé → ≠ a-decouvrir
		saveOrtho(s);

		const recap = listesOrthoProfil(p, false);
		const predef = recap.find((r) => r.id === predefId);
		expect(predef).toBeTruthy();
		expect(predef!.source).toBe('predefini');
		expect(predef!.niveau).toBe('en-cours');
	});

	it('epingle reflète la présence de l’entrée préfixée ; maitrises est le compte factuel', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(s, 'Semaine 1', [{ mot: 'chat' }, { mot: 'chien' }, { mot: 'cheval' }]);
		poser(s.banque[l.motIds[0]], sansDictee);
		poser(s.banque[l.motIds[1]], sansDictee);
		saveOrtho(s);
		toggleRevoirFor(p.uuid, orthoRevoirId(l.id));

		const r = listesOrthoProfil(p, false).find((x) => x.id === l.id)!;
		expect(r.epingle).toBe(true);
		expect(r.maitrises).toBe(2);
		expect(r.nbMots).toBe(3);
		expect(r.niveau).toBe('en-cours');
	});

	it('lecture par UUID : ne dépend pas du profil actif', () => {
		const a = activeProfile();
		const sA = loadOrtho();
		createListe(sA, 'Liste de A', [{ mot: 'chat' }]);
		saveOrtho(sA);
		addProfile('Profil B'); // bascule l'actif sur B (état ortho vide)

		// On consulte A alors que B est actif.
		const recapA = listesOrthoProfil(a, false);
		expect(recapA.map((r) => r.label)).toEqual(['Liste de A']);
		expect(activeProfile().name).toBe('Profil B'); // pas de bascule
	});

	it('prédéfinie non commencée mais ÉPINGLÉE À L’AVANCE → apparaît (a-decouvrir + epingle)', () => {
		const p = activeProfile();
		const predefId = 'fr-ortho-invariables-1'; // CE2, jamais matérialisée (banque vide)
		toggleRevoirFor(p.uuid, orthoRevoirId(predefId));

		const recap = listesOrthoProfil(p, false);
		const pred = recap.find((r) => r.id === predefId);
		expect(pred).toBeTruthy();
		expect(pred!.niveau).toBe('a-decouvrir'); // toujours pas commencée
		expect(pred!.epingle).toBe(true); // c'est l'épinglage qui la fait apparaître
		expect(pred!.maitrises).toBe(0);
		expect(pred!.nbMots).toBe(ORTHO_PREDEF.find((l) => l.id === predefId)!.mots.length);
		// Les AUTRES prédéfinies (non épinglées, non commencées) restent masquées du suivi.
		const autresPredef = recap.filter((r) => r.source === 'predefini' && r.id !== predefId);
		expect(autresPredef).toEqual([]);
	});
});

describe('listesOrthoProfil — relais des mots vers l’encadrant (#441)', () => {
	it('liste du parent : les mots arrivent COMPLETS et dans l’ordre du dictionnaire', () => {
		const p = activeProfile();
		const s = loadOrtho();
		// Saisis dans un ordre quelconque (et non alphabétique) par le parent.
		const l = createListe(s, 'Semaine 1', [{ mot: 'zèbre' }, { mot: 'école' }, { mot: 'avion' }]);
		saveOrtho(s);

		const r = listesOrthoProfil(p, false).find((x) => x.id === l.id)!;
		expect(r.mots).toEqual(['avion', 'école', 'zèbre']);
		// Liste de mots simples : l'aperçu et le compte annoncé se recoupent.
		expect(r.mots).toHaveLength(r.nbMots);
	});

	it('prédéfinie épinglée à l’avance : l’ordre de la leçon est préservé', () => {
		const p = activeProfile();
		const predefId = 'fr-ortho-nombres-1'; // CE2 — ordre voulu = ordre de comptage
		toggleRevoirFor(p.uuid, orthoRevoirId(predefId));

		const r = listesOrthoProfil(p, false).find((x) => x.id === predefId)!;
		expect(r.mots.slice(0, 4)).toEqual(['zéro', 'un', 'deux', 'trois']);
		expect(r.mots[r.mots.length - 1]).toBe('dix');
		expect(r.mots).toHaveLength(r.nbMots);
	});

	it('prédéfinie COMMENCÉE : les mots suivent aussi (l’état joué ne réordonne rien)', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const predefId = 'fr-ortho-nombres-1';
		const mots = motsDeLecon(s, predefId); // matérialise la leçon en banque
		poser(mots[5], { atelier: true }); // un mot du MILIEU entamé → leçon en-cours
		saveOrtho(s);

		const r = listesOrthoProfil(p, false).find((x) => x.id === predefId)!;
		expect(r.niveau).toBe('en-cours');
		expect(r.mots.slice(0, 4)).toEqual(['zéro', 'un', 'deux', 'trois']);
	});

	it('liste vide (parent qui n’a encore rien saisi) : mots = []', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(s, 'À remplir', []);
		saveOrtho(s);
		const r = listesOrthoProfil(p, false).find((x) => x.id === l.id)!;
		expect(r.mots).toEqual([]);
		expect(r.nbMots).toBe(0);
	});

	/* Un verbe vaut N dictées (pronoms × temps) mais n'occupe qu'UNE entrée d'aperçu :
	   `mots.length < nbMots` par construction. Ce qui compte n'est donc pas de faire
	   coïncider les deux nombres, mais que l'entrée DISE d'où vient l'écart — sinon
	   l'adulte lit « 3 mots » sous une liste qui n'en montre que 2. */
	it('un verbe n’occupe qu’UNE entrée, mais elle explique l’écart avec nbMots', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const verbes: VerbeConfig[] = [
			{ kind: 'verbe', infinitif: 'manger', pronoms: [0, 2], temps: ['present'] },
		];
		const l = createListe(s, 'Mix', [{ mot: 'chat' }], undefined, verbes);
		saveOrtho(s);

		const r = listesOrthoProfil(p, false).find((x) => x.id === l.id)!;
		expect(r.nbMots).toBe(3); // 1 mot simple + 2 couples (je / il × présent)
		expect(r.mots).toEqual(['chat', 'manger (je, il — présent)']);
		// L'écart demeure — c'est l'annotation, pas le compte, qui le rend lisible.
		expect(r.mots.length).not.toBe(r.nbMots);
		// Le mot simple, lui, reste nu : on n'annote QUE ce qui vaut plusieurs dictées.
		expect(r.mots[0]).toBe('chat');
		// Les 2 couples comptés dans nbMots sont les 2 pronoms nommés dans l'entrée.
		const nomsCites = r.mots[1].split('(')[1].split('—')[0].trim().split(', ');
		expect(nomsCites).toHaveLength(r.nbMots - 1);
	});

	it('les six pronoms : une seule entrée couvre 6 dictées sans les énumérer', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const verbes: VerbeConfig[] = [
			{ kind: 'verbe', infinitif: 'manger', pronoms: [0, 1, 2, 3, 4, 5], temps: ['present'] },
		];
		const l = createListe(s, 'Tous', [], undefined, verbes);
		saveOrtho(s);

		const r = listesOrthoProfil(p, false).find((x) => x.id === l.id)!;
		expect(r.nbMots).toBe(6);
		expect(r.mots).toEqual(['manger (tous les pronoms — présent)']);
	});

	it('l’annotation ne déplace pas le verbe dans le tri : il reste rangé à son infinitif', () => {
		// Risque introduit par l'annotation : une étiquette commençant par autre chose que
		// l'infinitif (« (présent) manger ») se rangerait sous la parenthèse.
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(
			s,
			'Mix trié',
			[{ mot: 'zèbre' }, { mot: 'école' }, { mot: 'avion' }],
			undefined,
			[{ kind: 'verbe', infinitif: 'manger', pronoms: [0], temps: ['present'] }],
		);
		saveOrtho(s);

		const r = listesOrthoProfil(p, false).find((x) => x.id === l.id)!;
		expect(r.mots).toEqual(['avion', 'école', 'manger (je — présent)', 'zèbre']);
	});
});

/* ============================================================
   dicteesProposees — prédéfinies « à épingler à l'avance »
   ============================================================ */
describe('dicteesProposees — prédéfinies non commencées et non épinglées', () => {
	const CE2_IDS = ORTHO_PREDEF.filter((l) => l.niveau === 'ce2').map((l) => l.id);
	const predefId = 'fr-ortho-invariables-1'; // CE2

	it('profil vierge : propose exactement les prédéfinies du niveau (filtre = listOrthoLecons)', () => {
		const p = activeProfile(); // niveau français par défaut = CE2
		const proposed = dicteesProposees(p, false);
		// Toutes les prédéfinies CE2 (aucune commencée, aucune épinglée), et RIEN d'autre.
		expect(proposed.map((d) => d.id).sort()).toEqual([...CE2_IDS].sort());
		// Aucune prédéfinie CM1 (hors niveau du profil) — cohérence du filtrage par niveau.
		expect(proposed.some((d) => d.id.startsWith('fr-ortho-cm1-'))).toBe(false);
		// Champs factuels.
		const d = proposed.find((x) => x.id === predefId)!;
		expect(d.label.length).toBeGreaterThan(0);
		expect(d.nbMots).toBe(ORTHO_PREDEF.find((l) => l.id === predefId)!.mots.length);
	});

	it('la même dictée, une fois ÉPINGLÉE, sort des proposées et entre au suivi', () => {
		const p = activeProfile();
		toggleRevoirFor(p.uuid, orthoRevoirId(predefId));
		// Proposées : ne la contient plus.
		expect(dicteesProposees(p, false).some((d) => d.id === predefId)).toBe(false);
		// Suivi : l'y trouve désormais (épinglée à l'avance).
		expect(listesOrthoProfil(p, false).some((r) => r.id === predefId)).toBe(true);
		// Le reste des prédéfinies CE2 reste proposé.
		expect(
			dicteesProposees(p, false)
				.map((d) => d.id)
				.sort(),
		).toEqual(CE2_IDS.filter((id) => id !== predefId).sort());
	});

	it('une prédéfinie COMMENCÉE est au suivi, jamais dans les proposées', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const mots = motsDeLecon(s, predefId);
		poser(mots[0], { atelier: true }); // un mot entamé → ≠ a-decouvrir
		saveOrtho(s);
		expect(dicteesProposees(p, false).some((d) => d.id === predefId)).toBe(false);
		expect(listesOrthoProfil(p, false).some((r) => r.id === predefId)).toBe(true);
	});

	it('les listes créées par le parent ne sont JAMAIS proposées (prédéfinies seulement)', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(s, 'Semaine 1', [{ mot: 'chat' }]);
		saveOrtho(s);
		const proposed = dicteesProposees(p, false);
		expect(proposed.some((d) => d.id === l.id)).toBe(false);
		expect(proposed.every((d) => d.id.startsWith('fr-ortho-'))).toBe(true);
	});

	/* ---- Relais des mots (#441) : l'adulte doit pouvoir LIRE la dictée avant de la pousser ---- */
	it('chaque dictée proposée porte ses mots, dans l’ordre de la leçon', () => {
		const p = activeProfile();
		const proposed = dicteesProposees(p, false);
		expect(proposed.length).toBeGreaterThan(0);
		for (const d of proposed) {
			const source = ORTHO_PREDEF.find((l) => l.id === d.id)!.mots.map((mi) => mi.mot);
			expect(d.mots).toEqual(source); // ordre d'origine, aucun tri
			expect(d.mots).toHaveLength(d.nbMots); // le compte annoncé = ce qu'on montre
			expect(d.mots.every((m) => m.trim().length > 0)).toBe(true);
		}
	});

	it('« Les nombres (0 à 10) » proposé se lit dans l’ordre de comptage', () => {
		const p = activeProfile();
		const d = dicteesProposees(p, false).find((x) => x.id === 'fr-ortho-nombres-1')!;
		expect(d.mots.slice(0, 4)).toEqual(['zéro', 'un', 'deux', 'trois']);
		expect(d.mots[d.mots.length - 1]).toBe('dix');
	});
});

/* ============================================================
   epingleesProfil — liste de gestion (deux kinds, orphelines écartées)
   ============================================================ */
describe('epingleesProfil — résolution des entrées épinglées', () => {
	it('résout leçon catalogue et dictée (parent + prédéfinie), avec l’id brut', () => {
		const p = activeProfile();
		const s = loadOrtho();
		const l = createListe(s, 'Ma dictée', [{ mot: 'chat' }]);
		saveOrtho(s);
		toggleRevoirFor(p.uuid, 'math-complements'); // leçon catalogue
		toggleRevoirFor(p.uuid, orthoRevoirId(l.id)); // liste du parent
		toggleRevoirFor(p.uuid, orthoRevoirId('fr-ortho-invariables-1')); // prédéfinie

		const ep = epingleesProfil(p);
		const lecon = ep.find((e) => e.kind === 'lecon');
		// `origine` et `etat` (#556) font partie du contrat de l'entrée : ici les trois cibles
		// sont dans la classe du profil (CE2), donc aucune classe d'origine à signaler et un
		// état d'acquisition ordinaire. Les trois régimes d'état eux-mêmes sont éprouvés dans
		// tests/lecon-hors-niveau.test.ts.
		expect(lecon).toEqual({
			kind: 'lecon',
			id: 'math-complements',
			label: lecon!.label,
			origine: { niveau: 'ce2', direction: 'classe-suivie' },
			etat: { kind: 'acquisition', niveau: 'a-decouvrir' },
		});
		const parent = ep.find((e) => e.kind === 'ortho' && e.id === l.id);
		expect(parent).toEqual({
			kind: 'ortho',
			id: l.id,
			label: 'Ma dictée',
			// Une liste du parent n'appartient à aucune classe : rien à nommer.
			origine: null,
			etat: { kind: 'acquisition', niveau: 'a-decouvrir' },
		});
		const pred = ep.find((e) => e.kind === 'ortho' && e.id === 'fr-ortho-invariables-1');
		expect(pred).toBeTruthy();
		expect(pred!.label.length).toBeGreaterThan(0); // libellé résolu depuis ORTHO_PREDEF
		// Prédéfinie CE2 sur un profil CE2 : dans le périmètre, donc jugée comme sa classe.
		expect(pred!.etat?.kind).toBe('acquisition');
	});

	it('entrée dont la cible n’existe plus est écartée (leçon hors catalogue, liste supprimée)', () => {
		const p = activeProfile();
		saveOrtho(loadOrtho());
		toggleRevoirFor(p.uuid, 'lecon-inexistante');
		toggleRevoirFor(p.uuid, orthoRevoirId('liste-disparue'));
		expect(epingleesProfil(p)).toEqual([]);
	});

	it('file vide → []', () => {
		expect(epingleesProfil(activeProfile())).toEqual([]);
	});
});

/* ============================================================
   loadOrthoFor — lecture de l'état ortho d'un profil par UUID
   ============================================================ */
describe('loadOrthoFor', () => {
	it('lit l’état d’un profil NON actif par UUID (clé brute)', () => {
		const a = activeProfile();
		const sA = loadOrtho();
		createListe(sA, 'Liste de A', [{ mot: 'chat' }, { mot: 'chien' }]);
		saveOrtho(sA);
		setActiveProfile(addProfile('Profil B').uuid); // B actif

		const read = loadOrthoFor(a.uuid);
		expect(read.listes.map((l) => l.label)).toEqual(['Liste de A']);
		expect(Object.keys(read.banque)).toHaveLength(2);
	});

	it('profil sans état ortho → état vide normalisé', () => {
		const read = loadOrthoFor('uuid-inconnu');
		expect(read).toEqual({ banque: {}, listes: [], motIdParForme: {} });
	});
});
