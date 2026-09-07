/* ============================================================
   #640 — Révision espacée : servir la marche DUE, et compter le travail fait.

   Tests écrits AVANT l'implémentation, à partir des critères GELÉS de l'issue
   (cadrage du 2026-09-02 + correction datée du même jour), jamais du code.

   Couverts ici : critères 1, 2, 3, 5, 6, 7, 8, 9, 10, 13, 16, 17, 18, 22, 23, 24.
   L'écran (4, 11, 12, 14, 15, 19, 21) revient à la spec Playwright.

   TROIS ÉTAGES, parce que l'essentiel de ce lot vit dans un module d'UI
   (`src/ui/revision.ts`) et qu'aucune fonction pure ne porte aujourd'hui « quelle
   tâche sert-on » ni « qu'écrit une réussite de révision » :

   A. INVARIANTS DU MOTEUR (sans DOM) — ce qui doit rester vrai quoi qu'il arrive.
      Verts aujourd'hui : ce sont des garde-fous, pas des exigences à construire.
   B. LE CHEMIN RÉEL, monté dans happy-dom (même pattern que `dictee-voix.test.ts`,
      qui pilote déjà `startOrthoRun`) : on joue un item de révision et on lit
      l'ÉTAT écrit — jamais le rendu, qui appartient à l'e2e. C'est ici que les
      tests sont ROUGES aujourd'hui.
   C. DEUX GARDES STATIQUES, pour ce qu'aucun état ne peut montrer (l'XP par tâche,
      l'absence de condition neuve sur le programme du jour).

   COMMENT LA TÂCHE SERVIE EST OBSERVÉE (cf. `tacheServie`) : par ce que l'enfant
   peut FAIRE, jamais par un identifiant de balise — le lot mutualise justement les
   trois rendus du parcours, donc les `id` d'aujourd'hui vont bouger.
     - tuiles  = toutes les lettres du mot lui sont FOURNIES, une par une ;
     - mot caché = le mot entier est lisible à l'arrivée, avec de quoi le cacher ;
     - dictée  = le mot n'est jamais écrit à l'écran, il faut l'entendre.
   Le classement se lit À L'ARRIVÉE sur l'item (le mot caché devient une saisie nue
   une fois caché). Une implémentation exotique des tuiles (ni bouton, ni
   `role="button"`, ni classe `tuile`) rendrait le classement « inconnue » : ce
   classeur peut donc réclamer une mise à jour, mais il ne peut pas valider un mot
   caché servi à la place des tuiles — le sens de l'erreur est le bon.
   ============================================================ */
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { setOnDataWrite, lsGet } from '../src/core/storage';
import { activeProfile, initProfiles, touchActiveProfile } from '../src/core/profiles';
import {
	loadOrtho,
	saveOrtho,
	createListe,
	motsDeListe,
	avancerMotRevision,
	emptyOrthoState,
	addOrGetMot,
} from '../src/core/orthographe/store';
import {
	ORDRE_MODES,
	marquerAtelierFait,
	validerMode,
	prochaineActivite,
	prochainModeAValider,
	modesRequis,
	marcheLaPlusHaute,
	listeEtoilee,
	statutMot,
} from '../src/core/orthographe/runner';
import { dateFranchissement } from '../src/core/orthographe/etapes';
import { JOUR } from '../src/core/revision';
import { selectDueGroups } from '../src/core/revision-select';
import { getXP, loadActivity, type PaliersNotion } from '../src/core/progress';
import { etapeSatisfaite, CONTEXTE_VIDE, type SeanceEtape } from '../src/core/seance';
import { chargerErreursFor } from '../src/core/erreurs-journal';
import { niveauListeOrtho } from '../src/core/orthographe/progression';
import { ORTHO_PALIERS_KEY } from '../src/core/orthographe/paliers';
import { dicteeDisponible, initTts } from '../src/ui/tts';
import { runRevisionEspacee } from '../src/ui/revision';
import { setPendingOrthoMode, startOrthoRun } from '../src/ui/ortho-runner';
import { PASSER_LABEL } from '../src/ui/revelation-neutre';
import type { MotOrtho, ModeOrtho, OrthoState } from '../src/core/orthographe/types';

/* ---------- Horloge figée ---------- */
/* Les dates de franchissement sont comparées à la milliseconde (critère 7) et deux
   chemins doivent produire le MÊME état (critère 8) : `Date.now` est donc figé, sans
   toucher aux minuteurs (les écrans de fin en utilisent). */
const T0 = new Date(2026, 8, 7, 9, 0).getTime(); // lundi 7 septembre 2026, 9 h
let maintenant = T0;

/* ---------- Appareil : voix de synthèse ---------- */
class UtteranceStub extends EventTarget {
	text: string;
	voice: unknown = null;
	lang = '';
	rate = 1;
	constructor(t: string) {
		super();
		this.text = t;
	}
}
function installerVoix(): void {
	(globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis = {
		getVoices: () => [{ lang: 'fr-FR', localService: true, name: 'Amélie (locale)' }],
		addEventListener: () => {},
		cancel: vi.fn(),
		speak: vi.fn(),
	};
	(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
		UtteranceStub;
	initTts();
}
/** Appareil MUET : aucune Web Speech API (WebView bridée, vieux navigateur). */
function sansVoix(): void {
	Reflect.deleteProperty(globalThis, 'speechSynthesis');
	initTts();
}

/* ---------- Monde neuf (profil + écran) ---------- */
/* La barre d'outils est réclamée par `setToolbar` au montage d'une session. */
function resetMonde(): void {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	document.body.innerHTML =
		'<button id="btnVerify"></button><button id="btnHome"></button><div id="sheets"></div>';
	installerVoix();
}

beforeEach(() => {
	maintenant = T0;
	vi.spyOn(Date, 'now').mockImplementation(() => maintenant);
	resetMonde();
});
afterEach(() => {
	vi.restoreAllMocks();
});

/* ---------- Fabrique de banque ---------- */
interface SpecMot {
	mot: string;
	/** Marches déjà validées, posées EN CLAIR : chaque test dit l'état qu'il décrit. */
	validation?: Partial<Record<ModeOrtho, boolean>>;
	palier?: number; // palier d'espacement atteint (0 = neuf)
	du?: boolean; // le mot est-il DÛ aujourd'hui ? (défaut : oui)
}
/** Liste de mots DÉCOUVERTS (atelier fait il y a un mois), dans l'état demandé, en
    stockage. Renvoie l'état relu, comme le fera la révision. */
function banque(specs: SpecMot[], label = 'Semaine 1'): { state: OrthoState; ids: string[] } {
	const s = loadOrtho();
	const liste = createListe(
		s,
		label,
		specs.map((sp) => ({ mot: sp.mot })),
	);
	const mots = motsDeListe(s, liste);
	mots.forEach((m, i) => {
		const sp = specs[i];
		marquerAtelierFait(m, T0 - 30 * JOUR);
		m.validation = { tuiles: false, motCache: false, dictee: false, ...(sp.validation ?? {}) };
		m.revision = {
			palier: sp.palier ?? 0,
			prochaineRevision: sp.du === false ? T0 + 10 * JOUR : T0 - JOUR,
			reussites: sp.palier ?? 0,
			dernierTest: T0 - 10 * JOUR,
		};
	});
	saveOrtho(s);
	return { state: loadOrtho(), ids: mots.map((m) => m.id) };
}
/** Le mot tel qu'il est EN STOCKAGE maintenant (ce que lira l'espace encadrant). */
const relu = (id: string): MotOrtho => loadOrtho().banque[id];

/* ---------- Lecture de l'écran ---------- */
const ecran = (): HTMLElement => document.getElementById('sheets') as HTMLElement;
const texteEcran = (): string => (ecran().textContent ?? '').replace(/\s+/g, ' ');
const cliquables = (): HTMLElement[] => [
	...ecran().querySelectorAll<HTMLElement>('button, [role="button"], [draggable="true"], .tuile'),
];
const bouton = (motif: RegExp): HTMLElement | undefined =>
	cliquables().find((b) => motif.test((b.textContent ?? '').trim()));
const cliquer = (el: HTMLElement): void => {
	el.dispatchEvent(new Event('click', { bubbles: true }));
};
const champ = (): HTMLInputElement | null =>
	ecran().querySelector<HTMLInputElement>('input:not([type="hidden"])');

type TacheVue = 'tuiles' | 'motCache' | 'dictee' | 'inconnue';
/** Quelle tâche l'enfant reçoit-il, vu de ce qu'il peut faire ? (cf. en-tête) */
function tacheServie(mot: string): TacheVue {
	// « Toutes les lettres sont fournies » : des éléments cliquables d'UNE lettre, couvrant le
	// mot lettre par lettre. Le filtre « lettre DU mot » écarte le clavier d'accents, dont les
	// touches sont aussi des boutons d'un seul caractère.
	const restant = [...mot.toLowerCase()];
	for (const el of cliquables()) {
		const t = (el.textContent ?? '').trim().toLowerCase();
		if (t.length !== 1) continue;
		const i = restant.indexOf(t);
		if (i >= 0) restant.splice(i, 1);
	}
	if (restant.length === 0) return 'tuiles';
	const lisible = texteEcran().toLowerCase().includes(mot.toLowerCase());
	if (bouton(/cacher/i) || lisible) return 'motCache';
	if (champ()) return 'dictee';
	return 'inconnue';
}

/* ---------- Gestes de l'enfant ---------- */
/* Écrits par RÔLE et par LIBELLÉ, jamais par identifiant : le lot mutualise les rendus du
   parcours et de la révision, donc les `id` d'aujourd'hui vont bouger. Ces gestes valent
   pour le mot caché comme pour la dictée ; les tuiles se posent au doigt et relèvent de
   l'e2e. */
function saisirEtValider(reponse: string): void {
	const cacher = bouton(/cacher/i);
	if (cacher) cliquer(cacher);
	const input = champ();
	if (!input) throw new Error('aucun champ de saisie sur l’item de révision');
	input.value = reponse;
	const valider = bouton(/vérifier|valider/i);
	if (!valider) throw new Error('aucun bouton de validation sur l’item de révision');
	cliquer(valider);
}
function abandonner(): void {
	const passer = bouton(new RegExp(PASSER_LABEL, 'i'));
	if (!passer) throw new Error('bouton « ' + PASSER_LABEL + ' » introuvable');
	cliquer(passer);
}
function terminerSession(): void {
	for (let i = 0; i < 20; i++) {
		const suite = bouton(/continuer|terminer/i);
		if (!suite) return;
		cliquer(suite);
	}
}

/* ============================================================
   A. INVARIANTS DU MOTEUR — garde-fous (verts aujourd'hui)
   ============================================================ */
/** Les 8 états de validation d'un mot DÉCOUVERT, posés en clair. */
function tousLesEtats(): { validation: Record<ModeOrtho, boolean>; mot: MotOrtho }[] {
	const out: { validation: Record<ModeOrtho, boolean>; mot: MotOrtho }[] = [];
	let n = 0;
	for (const tuiles of [false, true])
		for (const motCache of [false, true])
			for (const dictee of [false, true]) {
				const m = addOrGetMot(emptyOrthoState(), { mot: 'mot' + String(++n) });
				marquerAtelierFait(m, T0 - 30 * JOUR);
				m.validation = { tuiles, motCache, dictee };
				out.push({ validation: m.validation, mot: m });
			}
	return out;
}

describe('#640 — la marche due, côté moteur (critères 1, 2, 3, 5, 17)', () => {
	it('la marche due d’un mot découvert est toujours une marche JOUABLE, jamais l’atelier', () => {
		// Ce que la révision peut servir : elle entretient une trace, elle ne la crée pas
		// (critère 17). Un « atelier » servi en révision serait un format qu'elle n'a pas.
		for (const dispo of [true, false]) {
			for (const { mot, validation } of tousLesEtats()) {
				const due = prochaineActivite(mot, dispo);
				expect(modesRequis(dispo), JSON.stringify({ validation, dispo })).toContain(due);
			}
		}
	});

	it('critères 1 et 2 : tant qu’une marche manque, c’est CELLE-LÀ qui est due', () => {
		for (const dispo of [true, false]) {
			for (const { mot, validation } of tousLesEtats()) {
				const manquante = prochainModeAValider(mot, dispo);
				if (manquante === null) continue; // mot acquis : critère 5, ci-dessous
				expect(prochaineActivite(mot, dispo), JSON.stringify({ validation, dispo })).toBe(
					manquante,
				);
			}
		}
	});

	it('critère 3 : sans voix de synthèse, aucun état de mot ne peut appeler la dictée', () => {
		// La dégradation est structurelle : `modesRequis(false)` exclut la dictée, donc aucun mot
		// n'est « dû en dictée » sur un appareil muet. C'est ce qui rend l'écran « pas de voix »
		// du parcours inatteignable depuis une révision.
		for (const { mot, validation } of tousLesEtats()) {
			expect(prochaineActivite(mot, false), JSON.stringify(validation)).not.toBe('dictee');
		}
	});

	it('critère 5 : toutes les marches validées → la marche la plus haute JOUABLE', () => {
		for (const dispo of [true, false]) {
			const m = addOrGetMot(emptyOrthoState(), { mot: 'brouette' });
			marquerAtelierFait(m, T0 - 30 * JOUR);
			m.validation = { tuiles: true, motCache: true, dictee: true };
			expect(prochaineActivite(m, dispo)).toBe(marcheLaPlusHaute(dispo));
			expect(prochaineActivite(m, dispo)).not.toBe('tuiles');
		}
	});

	it('critère 17 : un mot jamais découvert reste hors de la sélection de révision', () => {
		// Inchangé depuis #641, re-testé ici parce que la révision devient VALIDANTE : un mot
		// non découvert qui s'y glisserait franchirait des marches sans avoir jamais été vu.
		const s = loadOrtho();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'cheval' }, { mot: 'brouette' }]);
		const [vu, jamais] = motsDeListe(s, liste);
		marquerAtelierFait(vu, T0 - 30 * JOUR);
		vu.revision = { palier: 0, prochaineRevision: T0 - JOUR, reussites: 0, dernierTest: null };
		jamais.revision = {
			palier: 0,
			prochaineRevision: T0 - 20 * JOUR,
			reussites: 0,
			dernierTest: null,
		};
		saveOrtho(s);
		const proposes = selectDueGroups(loadOrtho(), {}, T0).flatMap((g) => g.items.map((i) => i.id));
		expect(proposes).toEqual([vu.id]);
	});
});

describe('#640 — ce qu’une réussite écrit, côté primitive (critères 6, 7, 9, 16, 18)', () => {
	it('critères 6 et 7 : la marche jouée et toutes celles du dessous, chacune DATÉE', () => {
		const AVANT = T0 - 10 * JOUR;
		for (const deja of [null, ...ORDRE_MODES]) {
			for (const mode of ORDRE_MODES) {
				const m = addOrGetMot(emptyOrthoState(), { mot: 'cheval' });
				marquerAtelierFait(m, T0 - 30 * JOUR);
				if (deja) validerMode(m, deja, AVANT);
				const anciennes = ORDRE_MODES.filter((x) => m.validation[x]);
				validerMode(m, mode, T0);
				const rang = ORDRE_MODES.indexOf(mode);
				for (const x of ORDRE_MODES) {
					const contexte = String(deja) + '>' + mode + ':' + x;
					if (ORDRE_MODES.indexOf(x) <= rang) expect(m.validation[x], contexte).toBe(true);
					// Une marche validée SANS date trouerait la frise de composition (critère 7) ;
					// une marche déjà franchie garde la sienne (monotonie, #545).
					if (m.validation[x])
						expect(dateFranchissement(m, x), contexte).toBe(anciennes.includes(x) ? AVANT : T0);
				}
			}
		}
	});

	it('critère 18 : après n’importe quelle suite de réussites, jamais de marche sans les précédentes', () => {
		const suites: ModeOrtho[][] = [];
		for (const a of ORDRE_MODES) {
			suites.push([a]);
			for (const b of ORDRE_MODES) {
				suites.push([a, b]);
				for (const c of ORDRE_MODES) suites.push([a, b, c]);
			}
		}
		for (const suite of suites) {
			const m = addOrGetMot(emptyOrthoState(), { mot: 'cheval' });
			marquerAtelierFait(m, T0 - 30 * JOUR);
			suite.forEach((mode, i) => validerMode(m, mode, T0 + i));
			// Un escalier sans trou : une fois faux, tout ce qui est au-dessus est faux.
			const franchies = ORDRE_MODES.map((mode) => m.validation[mode]);
			const premierFaux = franchies.indexOf(false);
			if (premierFaux >= 0)
				expect(franchies.slice(premierFaux), suite.join('>')).not.toContain(true);
		}
	});

	it('critères 9 et 16 : le compteur d’espacement ne touche AUCUNE marche, en réussite comme en échec', () => {
		// C'est ce qui garantit qu'un échec — ou un « je ne sais pas » — ne peut pas
		// dé-franchir : les deux mécaniques n'écrivent pas au même endroit.
		for (const reussi of [true, false]) {
			const s = loadOrtho();
			const liste = createListe(s, 'Semaine ' + String(reussi), [{ mot: 'cheval' }]);
			const [m] = motsDeListe(s, liste);
			marquerAtelierFait(m, T0 - 30 * JOUR);
			validerMode(m, 'tuiles', T0 - 10 * JOUR);
			const escalier = JSON.stringify({ v: m.validation, f: m.franchissements });
			avancerMotRevision(s, m.id, reussi, T0);
			expect(JSON.stringify({ v: m.validation, f: m.franchissements })).toBe(escalier);
		}
	});

	it('critère 8 (fondation) : escalier et espacement sont indépendants — l’ordre des deux écritures ne change rien', () => {
		// Une réussite en révision fait les deux. Si l'ordre comptait, « le même état » ne
		// voudrait rien dire ; c'est ce qui rend le critère 8 atteignable.
		const construire = (escalierDabord: boolean): string => {
			const s = loadOrtho();
			const liste = createListe(s, 'L' + String(escalierDabord), [{ mot: 'cheval' }]);
			const [m] = motsDeListe(s, liste);
			marquerAtelierFait(m, T0 - 30 * JOUR);
			if (escalierDabord) {
				validerMode(m, 'motCache', T0);
				avancerMotRevision(s, m.id, true, T0);
			} else {
				avancerMotRevision(s, m.id, true, T0);
				validerMode(m, 'motCache', T0);
			}
			return JSON.stringify({ v: m.validation, f: m.franchissements, r: m.revision });
		};
		expect(construire(true)).toBe(construire(false));
	});
});

describe('#640 — l’étoile de liste, côté moteur (critères 10 et 13)', () => {
	it('critère 10 : la liste bascule au DERNIER mot maîtrisé, pas avant', () => {
		const s = loadOrtho();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'cheval' }, { mot: 'brouette' }]);
		const mots = motsDeListe(s, liste);
		mots.forEach((m) => marquerAtelierFait(m, T0 - 30 * JOUR));
		validerMode(mots[0], 'dictee', T0 - 5 * JOUR); // premier mot au sommet
		expect(listeEtoilee(mots, true)).toBe(false);
		validerMode(mots[1], 'motCache', T0); // le dernier mot n'y est pas encore
		expect(listeEtoilee(mots, true)).toBe(false);
		validerMode(mots[1], 'dictee', T0); // … et maintenant si
		expect(listeEtoilee(mots, true)).toBe(true);
		expect(mots.every((m) => statutMot(m, true) === 'maitrise')).toBe(true);
	});

	it('critère 13 : une liste DÉJÀ étoilée à l’ouverture ne rebascule pas', () => {
		// La célébration tient à une TRANSITION (non étoilée → étoilée) : sur une liste acquise,
		// il n'y en a aucune à fêter, quelle que soit la réussite du jour.
		const s = loadOrtho();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'cheval' }]);
		const mots = motsDeListe(s, liste);
		mots.forEach((m) => {
			marquerAtelierFait(m, T0 - 30 * JOUR);
			validerMode(m, 'dictee', T0 - 5 * JOUR);
		});
		const avant = listeEtoilee(mots, true);
		const dates = mots.map((m) => ORDRE_MODES.map((e) => dateFranchissement(m, e)));
		validerMode(mots[0], marcheLaPlusHaute(true), T0); // entretien du jour
		const apres = listeEtoilee(mots, true);
		expect([avant, apres]).toEqual([true, true]);
		expect(!avant && apres).toBe(false); // aucune transition → rien à annoncer
		expect(mots.map((m) => ORDRE_MODES.map((e) => dateFranchissement(m, e)))).toEqual(dates);
	});
});

describe('#640 — le programme du jour, côté moteur (critère 23)', () => {
	const etape: SeanceEtape = { id: 'e1', kind: 'revision', count: 1 };
	it('une session de révision satisfait l’étape « Révision »', () => {
		expect(etapeSatisfaite(etape, { t: T0, k: 'revision' }, CONTEXTE_VIDE)).toBe(true);
	});
	it('… y compris une session qui n’a fait progresser aucun mot (aucune condition neuve)', () => {
		// #641 a posé un drapeau `progressive` pour la DICTÉE. Le critère 23 dit que l'étape
		// « Révision » ne le reprend pas : une session d'entretien coche l'étape comme avant.
		expect(
			etapeSatisfaite(etape, { t: T0, k: 'revision', progressive: false }, CONTEXTE_VIDE),
		).toBe(true);
	});
	it('… et une session d’un autre type ne la satisfait pas', () => {
		expect(etapeSatisfaite(etape, { t: T0, k: 'dictee', ref: 'l1' }, CONTEXTE_VIDE)).toBe(false);
	});
});

/* ============================================================
   B. LE CHEMIN RÉEL DE LA RÉVISION ESPACÉE (happy-dom)
   ============================================================ */
/* TÉMOIN DU CLASSEUR — sans lui, `tacheServie` ne prouverait rien : un classeur incapable
   de voir autre chose qu'un mot caché rendrait toute la suite ininterprétable. On lui montre
   donc les trois rendus du PARCOURS, c'est-à-dire ceux que ce lot doit mutualiser. */
describe('#640 — témoin : le classeur reconnaît les trois marches', () => {
	async function parcoursEnMode(mode: ModeOrtho): Promise<void> {
		resetMonde();
		const s = loadOrtho();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'cheval' }]);
		motsDeListe(s, liste).forEach((m) => marquerAtelierFait(m, T0 - 30 * JOUR));
		saveOrtho(s);
		setPendingOrthoMode(mode); // séance ciblée : le parcours impose cette marche
		await startOrthoRun(liste.id);
	}

	it('les tuiles du parcours sont vues comme des TUILES', async () => {
		await parcoursEnMode('tuiles');
		expect(tacheServie('cheval')).toBe('tuiles');
	});

	it('le mot caché du parcours est vu comme un MOT CACHÉ', async () => {
		await parcoursEnMode('motCache');
		expect(tacheServie('cheval')).toBe('motCache');
	});

	it('la dictée du parcours est vue comme une DICTÉE', async () => {
		await parcoursEnMode('dictee');
		expect(tacheServie('cheval')).toBe('dictee');
	});
});

describe('#640 — la tâche servie en révision (critères 1, 2, 3, 5, 24)', () => {
	it('critère 1 : un mot dont la marche due est LES TUILES reçoit les tuiles', () => {
		// Le cas nommé par l'issue : un mot découvert hier, testé demain sur une tâche plus
		// dure que celle que son parcours lui donnerait au même moment.
		banque([{ mot: 'cheval' }]);
		runRevisionEspacee();
		expect(tacheServie('cheval')).toBe('tuiles');
	});

	it('critère 2 : un mot dû en DICTÉE la reçoit quand l’appareil a une voix', () => {
		banque([{ mot: 'cheval', validation: { tuiles: true, motCache: true } }]);
		runRevisionEspacee();
		expect(tacheServie('cheval')).toBe('dictee');
	});

	it('critère 5 : un mot entièrement acquis reçoit la marche la plus haute, jamais les tuiles', () => {
		banque([{ mot: 'cheval', validation: { tuiles: true, motCache: true, dictee: true } }]);
		runRevisionEspacee();
		expect(tacheServie('cheval')).toBe('dictee');
	});

	it('critère 3 : sans voix, un mot dû en dictée reçoit le mot caché et la session continue', () => {
		sansVoix();
		const { ids } = banque([{ mot: 'cheval', validation: { tuiles: true, motCache: true } }]);
		runRevisionEspacee();
		expect(tacheServie('cheval')).toBe('motCache');
		// « La session continue » : l'item est JOUABLE, on n'est pas sur un écran de sortie.
		saisirEtValider('cheval');
		expect(relu(ids[0]).revision.palier).toBe(1);
	});

	it('critère 24 : à état et appareil donnés, 20 passages servent la MÊME tâche', () => {
		const vues = new Set<TacheVue>();
		for (let i = 0; i < 20; i++) {
			resetMonde();
			banque([{ mot: 'cheval', validation: { tuiles: true, motCache: true, dictee: true } }]);
			runRevisionEspacee();
			vues.add(tacheServie('cheval'));
		}
		expect([...vues]).toHaveLength(1);
	});
});

/** Mot au rang « mot caché » : sa marche due se joue au clavier, avant comme après ce lot —
    c'est ce qui permet d'observer l'ÉTAT écrit sans dépendre du geste des tuiles. */
const auRangMotCache = (): string =>
	banque([{ mot: 'cheval', validation: { tuiles: true } }]).ids[0];

describe('#640 — ce que la réussite en révision fait au mot (critères 6, 7, 8, 22)', () => {
	it('critères 6 et 7 : la réussite fait franchir la marche jouée ET celles du dessous, datées', () => {
		const id = auRangMotCache();
		runRevisionEspacee();
		saisirEtValider('cheval');
		const m = relu(id);
		expect(m.validation.motCache).toBe(true);
		expect(m.validation.tuiles).toBe(true);
		expect(dateFranchissement(m, 'motCache')).toBe(T0);
	});

	it('critère 6 (versant espacement) : le palier avance dans le même mouvement', () => {
		const id = auRangMotCache();
		runRevisionEspacee();
		saisirEtValider('cheval');
		expect(relu(id).revision.palier).toBe(1);
	});

	it('critère 8 : l’état produit est IDENTIQUE à celui du parcours, au compteur d’espacement près', async () => {
		// Comparaison d'ÉTATS champ par champ, pas d'un booléen isolé : c'est l'écart « deux
		// chemins, deux états » que le critère nomme. Les seules divergences admises sont
		// l'identifiant (tiré à la création) et le compteur d'espacement, que le parcours ne
		// touche pas — et on l'AFFIRME au lieu de l'ignorer.
		const idRev = auRangMotCache();
		runRevisionEspacee();
		saisirEtValider('cheval');
		const parRevision = relu(idRev);

		resetMonde();
		const s = loadOrtho();
		const liste = createListe(s, 'Semaine 1', [{ mot: 'cheval' }]);
		const [mot] = motsDeListe(s, liste);
		marquerAtelierFait(mot, T0 - 30 * JOUR);
		mot.validation = { tuiles: true, motCache: false, dictee: false };
		mot.revision = {
			palier: 0,
			prochaineRevision: T0 - JOUR,
			reussites: 0,
			dernierTest: T0 - 10 * JOUR,
		};
		saveOrtho(s);
		setPendingOrthoMode('motCache'); // séance ciblée : le parcours impose la même marche
		await startOrthoRun(liste.id);
		saisirEtValider('cheval');
		const parParcours = relu(mot.id);

		const divergents = (Object.keys(parRevision) as (keyof MotOrtho)[]).filter(
			(k) => JSON.stringify(parRevision[k]) !== JSON.stringify(parParcours[k]),
		);
		expect(divergents.sort()).toEqual(['id', 'revision']);
		expect(parParcours.revision.palier).toBe(0); // le parcours n'entretient pas l'espacement
		expect(parRevision.revision.palier).toBe(1); // la révision, si
	});

	it('critère 22 : une bonne réponse vaut UN point, comme partout ailleurs', () => {
		auRangMotCache();
		expect(getXP()).toBe(0);
		runRevisionEspacee();
		saisirEtValider('cheval');
		expect(getXP()).toBe(1);
	});
});

describe('#640 — ce qui ne doit RIEN faire franchir (critères 9 et 16)', () => {
	it('critère 9 : un échec recule le palier mais ne dé-franchit aucune marche', () => {
		const { ids } = banque([{ mot: 'cheval', validation: { tuiles: true }, palier: 3 }]);
		const avant = relu(ids[0]);
		const escalier = JSON.stringify({ v: avant.validation, f: avant.franchissements });
		runRevisionEspacee();
		saisirEtValider('chevale');
		const apres = relu(ids[0]);
		expect(apres.revision.palier).toBe(2);
		expect(JSON.stringify({ v: apres.validation, f: apres.franchissements })).toBe(escalier);
	});

	it('critère 16 : « Je ne sais pas, montre-moi » ne valide RIEN', () => {
		const id = auRangMotCache();
		runRevisionEspacee();
		const cacher = bouton(/cacher/i);
		if (cacher) cliquer(cacher); // le lien de passage vit sur l'écran de réponse
		abandonner();
		const m = relu(id);
		expect(m.validation).toEqual({ tuiles: true, motCache: false, dictee: false });
		expect(dateFranchissement(m, 'motCache')).toBeNull();
	});
});

describe('#640 — étoile et programme du jour, par le chemin réel (critères 10, 13, 23)', () => {
	const listeCourante = (): MotOrtho[] => {
		const s = loadOrtho();
		return motsDeListe(s, s.listes[0]);
	};

	it('critère 10 : le dernier mot d’une liste maîtrisé en révision étoile la liste', () => {
		banque([
			{ mot: 'brouette', validation: { tuiles: true, motCache: true, dictee: true }, du: false },
			{ mot: 'cheval', validation: { tuiles: true, motCache: true } },
		]);
		expect(listeEtoilee(listeCourante(), true)).toBe(false);
		runRevisionEspacee();
		saisirEtValider('cheval');
		expect(listeEtoilee(listeCourante(), true)).toBe(true);
	});

	it('critère 13 : réviser un mot d’une liste déjà acquise ne crée aucun franchissement neuf', () => {
		const { ids } = banque([
			{ mot: 'cheval', validation: { tuiles: true, motCache: true, dictee: true } },
		]);
		const dates = ORDRE_MODES.map((e) => dateFranchissement(relu(ids[0]), e));
		runRevisionEspacee();
		saisirEtValider('cheval');
		expect(ORDRE_MODES.map((e) => dateFranchissement(relu(ids[0]), e))).toEqual(dates);
	});

	it('critère 23 : une session de révision menée à son terme crédite toujours l’étape', () => {
		banque([{ mot: 'cheval', validation: { tuiles: true } }]);
		runRevisionEspacee();
		saisirEtValider('cheval');
		terminerSession();
		const sessions = loadActivity().filter((a) => a.k === 'revision');
		expect(sessions).toHaveLength(1);
		const etape: SeanceEtape = { id: 'e1', kind: 'revision', count: 1 };
		expect(etapeSatisfaite(etape, sessions[0], CONTEXTE_VIDE)).toBe(true);
	});
});

/* ---------- L'ESCALIER TROUÉ : une marche haute validée sans celle du dessous ----------
   `{ tuiles: false, motCache: true }` est INFABRICABLE depuis #641 (le cumul de
   `validerMode` ferme le trou au moment où il se creuserait), mais parfaitement présent
   dans une banque écrite AVANT : une séance ciblée sur le mot caché ne validait alors que
   cette marche-là. C'est un état de MIGRATION, pas une curiosité — et la révision est
   souvent le PREMIER chemin à le rencontrer, un mot troué ne repassant pas forcément par
   le parcours.

   Ce que ces tests ne tranchent pas, faute de critère gelé qui le dise : par quel bout on
   répare un trou hérité (servir la marche qui manque, ou considérer que le mot caché
   prouve les tuiles et servir la dictée). Les assertions portent donc d'abord sur ce qui
   doit être vrai dans les deux cas — le trou ne se rebouche pas tout seul (critère 16), il
   n'existe plus après une réussite (critère 18), les deux chemins décident ensemble
   (critère 8), et le mot MONTE ensuite au lieu de tourner en rond. Le seul test qui nomme
   le choix d'aujourd'hui le dit dans son message d'échec, pour qu'un changement délibéré
   se re-décide au lieu de se constater. */

/** Geste des TUILES : poser les lettres du mot dans l'ordre, puis vérifier. Le curseur
    d'insertion suit la dernière lettre posée, donc taper les lettres dans l'ordre du mot
    l'écrit. Les tuiles étant mélangées, on prend à chaque fois une tuile ENCORE disponible
    portant la lettre voulue (`.tuile[data-i]` = le bac ; ce contrat de rendu est partagé
    par le parcours et la révision, cf. l'en-tête de `ui/ortho-taches.ts`). */
function assemblerEtValider(mot: string): void {
	for (const lettre of mot) {
		const tuile = [...ecran().querySelectorAll<HTMLElement>('.tuile[data-i]')].find(
			(t) => (t.textContent ?? '').trim() === lettre && !t.hasAttribute('disabled'),
		);
		if (!tuile) throw new Error('aucune tuile « ' + lettre + ' » disponible');
		cliquer(tuile);
	}
	const valider = bouton(/vérifier|valider/i);
	if (!valider) throw new Error('aucun bouton de validation sur les tuiles');
	cliquer(valider);
}

/** Réussir la tâche servie, QUELLE QU'ELLE SOIT : c'est ce qui permet d'éprouver l'effet
    d'une réussite sans figer au passage la marche que la révision a choisi de servir. */
function reussirLaTacheServie(mot: string): TacheVue {
	const vue = tacheServie(mot);
	if (vue === 'inconnue') throw new Error('aucune tâche reconnaissable à l’écran');
	if (vue === 'tuiles') assemblerEtValider(mot);
	else saisirEtValider(mot);
	return vue;
}

/** Mot à ESCALIER TROUÉ tel que le stockage en porte. `dateHaute` distingue les deux
    formes réellement rencontrées : la marche haute DATÉE (banque d'après #545) ou sans
    date (banque d'avant, où rien n'est reconstitué — cf. `types.ts`). */
function motTroue(dateHaute: number | null = null): string {
	const { ids } = banque([{ mot: 'cheval', validation: { motCache: true } }]);
	if (dateHaute !== null) {
		const s = loadOrtho();
		(s.banque[ids[0]].franchissements ??= {}).motCache = dateHaute;
		saveOrtho(s);
	}
	return ids[0];
}

/** L'escalier a-t-il un TROU, c'est-à-dire une marche validée sans toutes celles du
    dessous ? (critère 18, lu sur l'état d'un mot.) */
function troue(m: MotOrtho): boolean {
	const franchies = ORDRE_MODES.map((mode) => m.validation[mode]);
	const premierFaux = franchies.indexOf(false);
	return premierFaux >= 0 && franchies.slice(premierFaux).includes(true);
}

const rangTache = (v: TacheVue): number => ORDRE_MODES.indexOf(v as ModeOrtho);

describe('#640 — mot à escalier TROUÉ, hérité d’avant #641 (critères 6, 7, 8, 16, 18)', () => {
	it('critère 8 : révision et parcours servent la MÊME tâche et écrivent le MÊME état', async () => {
		// L'exigence qui rend la question « quelle marche est due ? » sans réponse propre à
		// la révision : le lot promet un seul aiguillage. Quelle que soit la réparation
		// retenue plus tard pour les trous hérités, les deux chemins doivent la choisir
		// ensemble — sinon on retrouve le défaut de #641 (le travail compte selon le chemin
		// pris) sur l'état le plus fragile de la banque.
		const idRev = motTroue();
		runRevisionEspacee();
		const vueRevision = reussirLaTacheServie('cheval');
		const parRevision = relu(idRev);

		resetMonde();
		const idParcours = motTroue();
		await startOrthoRun(loadOrtho().listes[0].id); // parcours COMPLET : aucun mode imposé
		const vueParcours = reussirLaTacheServie('cheval');
		const parParcours = relu(idParcours);

		expect(vueRevision).toBe(vueParcours);
		// Mêmes divergences admises que pour un mot au rang « mot caché » : l'identifiant,
		// tiré à la création, et le compteur d'espacement, que le parcours n'entretient pas.
		const divergents = (Object.keys(parRevision) as (keyof MotOrtho)[]).filter(
			(k) => JSON.stringify(parRevision[k]) !== JSON.stringify(parParcours[k]),
		);
		expect(divergents.sort()).toEqual(['id', 'revision']);
	});

	it('la marche servie est celle qui MANQUE le plus bas : l’escalier ne se saute pas', () => {
		// Écrit sur l'ÉTAT QUE L'APPLI LIT, et non sur celui qu'on a posé en stockage : le lot
		// de suite de #640 répare les trous hérités À LA LECTURE (le mot caché prouve les
		// tuiles), donc la marche qui manque le plus bas n'est pas forcément celle que le
		// stockage montrait. L'exigence, elle, ne bouge pas et se dit sans formule : on ne
		// resert jamais une marche déjà prouvée, et on n'en sert jamais une au-dessus d'une
		// marche manquante. Elle vaut avant comme après la réparation.
		// (Version précédente : `toBe('tuiles')`, qui décrivait l'état du code d'alors et
		// rougissait le jour où le trou hérité serait réparé — cf. son message d'échec, qui
		// demandait justement à re-décider ce test à ce moment-là.)
		const id = motTroue();
		runRevisionEspacee();
		const vue = tacheServie('cheval');
		expect(vue).not.toBe('inconnue');
		const etat = relu(id).validation;
		expect(etat[vue as ModeOrtho], `marche ${vue} déjà prouvée, et pourtant resservie`).toBe(false);
		const dessous = ORDRE_MODES.slice(0, ORDRE_MODES.indexOf(vue as ModeOrtho));
		expect(
			dessous.filter((m) => !etat[m]),
			`marche ${vue} servie alors qu'il manque plus bas`,
		).toEqual([]);
		// Et rien n'a bougé du fait de SERVIR la tâche : servir n'est pas valider.
		expect(relu(id).validation).toEqual(etat);
	});

	it('critère 24 : un mot troué ne tire pas sa tâche au hasard non plus', () => {
		// L'état le plus rare de la banque est aussi celui où un parcours d'escalier mal
		// ordonné passerait inaperçu : on l'éprouve sur 10 passages, comme les états
		// réguliers.
		const vues = new Set<TacheVue>();
		for (let i = 0; i < 10; i++) {
			resetMonde();
			motTroue();
			runRevisionEspacee();
			vues.add(tacheServie('cheval'));
		}
		expect([...vues]).toHaveLength(1);
		expect([...vues][0]).not.toBe('inconnue');
	});

	it('critère 16 : « Je ne sais pas, montre-moi » ne comble pas le trou et n’en creuse pas d’autre', () => {
		const id = motTroue(T0 - 20 * JOUR);
		const avant = relu(id);
		runRevisionEspacee();
		abandonner();
		const apres = relu(id);
		expect(apres.validation).toEqual(avant.validation);
		expect(apres.franchissements).toEqual(avant.franchissements);
		// AUCUNE marche ne passe de « non validée » à « validée » : un aveu d'ignorance ne
		// franchit rien (critère 16), et il ne date rien non plus.
		// Dit sur l'écart avec l'état LU juste avant l'abandon, et non sur « le trou subsiste » :
		// le lot de suite répare les trous hérités à la lecture, et cette réparation-là repose
		// sur une réussite passée — elle n'a rien à voir avec l'abandon qu'on éprouve ici.
		// Écrire « le trou subsiste » reviendrait à exiger que la réparation n'existe pas.
		expect(ORDRE_MODES.filter((m) => apres.validation[m] && !avant.validation[m])).toEqual([]);
	});

	it('critères 6 et 18 : une réussite COMBLE le trou, sans rien perdre au passage', () => {
		const id = motTroue();
		runRevisionEspacee();
		reussirLaTacheServie('cheval');
		const m = relu(id);
		expect(troue(m)).toBe(false);
		// Ce qui était déjà prouvé le reste : aucune marche ne se dé-valide.
		expect(m.validation.motCache).toBe(true);
		expect(m.validation.tuiles).toBe(true);
		expect(m.revision.palier).toBe(1); // et l'espacement avance dans le même mouvement
	});

	it('critère 7 : la marche JOUÉE est datée d’aujourd’hui, aucune autre ne l’est', () => {
		// Dit sur la marche RÉELLEMENT jouée (`reussirLaTacheServie` la renvoie) et non sur
		// « les tuiles » : après la réparation des trous hérités, ce n'est plus la même marche
		// qui est due. L'exigence est intacte — une séance date ce qu'elle fait franchir, et
		// rien d'autre (monotonie #545) : re-dater une marche franchie il y a trois semaines
		// ferait raconter à la frise de composition une séance qui n'a pas eu lieu.
		const dateHaute = T0 - 20 * JOUR;
		const id = motTroue(dateHaute);
		runRevisionEspacee();
		const jouee = reussirLaTacheServie('cheval') as ModeOrtho;
		const m = relu(id);
		expect(dateFranchissement(m, jouee)).toBe(T0);
		expect(dateFranchissement(m, 'motCache')).toBe(dateHaute);
		for (const mode of ORDRE_MODES.filter((x) => x !== jouee)) {
			expect(dateFranchissement(m, mode), `marche ${mode}, non jouée`).not.toBe(T0);
		}
	});

	it('critère 7 (banque d’avant #545) : aucune date n’est INVENTÉE pour la marche déjà validée', () => {
		// Un mot troué d'une banque ancienne n'a aucune date. Dater aujourd'hui son mot caché
		// affirmerait que l'enfant vient de l'écrire de mémoire, ce qui est faux ; le suivi
		// assume l'inconnu (« franchie avant la mise en service », cf. `types.ts`).
		// À SAVOIR si ce test rougit sur `motCache` : la réussite porte alors sur une marche
		// PLUS HAUTE (trou hérité réparé à la lecture), et `validerMode` date d'aujourd'hui
		// toute marche de son cumul dépourvue de date — y compris une marche validée depuis
		// des mois. C'est le même défaut que le cadrage interdit à la réparation, pris par
		// l'autre bout ; cf. `escalier-troue-migration.test.ts`, describe « une réussite ne
		// date que ce qu'elle fait franchir ».
		const id = motTroue();
		expect(dateFranchissement(relu(id), 'motCache')).toBeNull();
		runRevisionEspacee();
		const jouee = reussirLaTacheServie('cheval') as ModeOrtho;
		const m = relu(id);
		expect(dateFranchissement(m, jouee)).toBe(T0);
		expect(dateFranchissement(m, 'motCache')).toBeNull();
	});

	it('le mot MONTE : la révision suivante ne resert pas la marche qu’il vient de combler', () => {
		// Le défaut nommé par l'issue est « ce travail ne fait progresser aucun mot ». Sur un
		// escalier troué, le risque propre est de tourner en rond : resservir indéfiniment la
		// même marche basse. On joue donc DEUX rendez-vous d'espacement d'affilée.
		const id = motTroue();
		runRevisionEspacee();
		const premiere = reussirLaTacheServie('cheval');
		maintenant = T0 + 5 * JOUR; // palier 1 → re-test à 3 jours : le mot est dû de nouveau
		runRevisionEspacee();
		const seconde = tacheServie('cheval');
		expect(seconde).not.toBe('inconnue'); // le mot est bien re-servi (sinon rien n'est prouvé)
		const statut = statutMot(relu(id), true);
		expect(
			statut === 'maitrise' || rangTache(seconde) > rangTache(premiere),
			'Après une réussite, le mot doit soit être maîtrisé, soit recevoir une marche PLUS\n' +
				'HAUTE. Servi : ' +
				premiere +
				' puis ' +
				seconde +
				' ; statut : ' +
				statut +
				'.',
		).toBe(true);
	});

	it('sans voix, l’unique réussite due rend le mot maîtrisé — et étoile sa liste', () => {
		// Conséquence assumée, et surprenante : sur un appareil muet l'escalier n'a que DEUX
		// marches (`modesRequis(false)`), donc un mot au rang « tuiles » n'en a plus qu'une à
		// franchir. Le statut se lit sur les marches validées, jamais sur le nombre de séances
		// qu'il a fallu : aucune condition cachée ne doit retarder l'étoile de l'enfant.
		// Semé COHÉRENT (« tuiles validées »), et non troué : sur un appareil muet, un mot
		// troué arrive DÉJÀ maîtrisé une fois le trou réparé à la lecture (lot de suite de
		// #640), donc il n'y aurait plus de transition à observer dans la séance — et c'est
		// cette transition qui est l'objet du test.
		sansVoix();
		const id = banque([{ mot: 'cheval', validation: { tuiles: true } }]).ids[0];
		const listeDe = (): MotOrtho[] => {
			const s = loadOrtho();
			return motsDeListe(s, s.listes[0]);
		};
		expect(statutMot(relu(id), false)).toBe('enCours');
		expect(listeEtoilee(listeDe(), false)).toBe(false);
		runRevisionEspacee();
		reussirLaTacheServie('cheval');
		expect(statutMot(relu(id), false)).toBe('maitrise');
		// La transition non étoilée → étoilée existe donc dans CETTE séance : c'est la
		// précondition du critère 11 (« Liste prête ! » annoncée sur l'écran de fin), dont
		// l'affichage appartient à la spec Playwright.
		expect(listeEtoilee(listeDe(), false)).toBe(true);
	});
});

/* ============================================================
   C. GARDES STATIQUES — ce qu'aucun état ne peut montrer
   ============================================================ */
describe('#640 — gardes statiques (critères 22 et 23)', () => {
	const lire = (chemin: string): string => readFileSync(chemin, 'utf8');
	function fichiersTs(dossier: string): string[] {
		return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
			const chemin = dossier + '/' + e.name;
			if (e.isDirectory()) return fichiersTs(chemin);
			return e.isFile() && e.name.endsWith('.ts') ? [chemin] : [];
		});
	}

	it('critère 22 : aucun chemin ne donne plus d’un point pour une bonne réponse', () => {
		// La règle « une bonne réponse = un point » ne se lit dans aucun état : elle se lit aux
		// APPELS. Le lot mutualise les trois rendus, donc le point d'attribution peut se
		// déplacer : on balaie tout `src/` plutôt que les deux fichiers d'aujourd'hui.
		// Exception DÉCLARÉE : le bilan de leçon crédite la somme de ses bonnes réponses.
		const EXCEPTIONS = ['src/core/lesson-run.ts: addXP(p.ok)'];
		const appels: string[] = [];
		for (const f of fichiersTs('src')) {
			for (const m of lire(f).matchAll(/(?<!function )\baddXP\(([^)]*)\)/g)) {
				const arg = m[1].trim();
				if (arg === '1' || arg === '' || arg.includes(':')) continue; // '' / ':' = signature
				appels.push(f + ': addXP(' + arg + ')'); // chemins construits en '/' par fichiersTs
			}
		}
		expect(appels).toEqual(EXCEPTIONS);
	});

	it('critère 23 : la révision journalise son activité sans condition supplémentaire', () => {
		// Le risque introduit par CE lot : reprendre le drapeau `progressive` de #641 (dictée)
		// et retirer à l'enfant le crédit d'une session d'entretien.
		const source = lire('src/ui/revision.ts');
		expect(/recordSessionActivity\(\s*'revision'\s*\)/.test(source)).toBe(true);
		expect(/recordSessionActivity\(\s*'revision'\s*,/.test(source)).toBe(false);
	});
});

/* Le critère 20 n'est attribué à personne dans les notes d'exécution de l'issue (les
   critères d'écran vont à l'e2e, les autres ici, mais celui-là n'apparaît dans aucune des
   deux listes). Il est mécanisable et ne coûte rien : il est donc gardé ici, signalé comme
   ajout, plutôt que laissé à personne. */
describe('#640 — charge d’une session (critère 20, hors attribution)', () => {
	it('le nombre d’items ne dépend pas des tâches servies : une tuile vaut un mot caché', () => {
		// Cinq mots dus à des rangs DIFFÉRENTS : la séance doit en servir cinq, tuiles comprises.
		// L'échec nommé : « une session sert moins d'items parce que les tuiles prennent plus de
		// temps ».
		banque([
			{ mot: 'cheval' },
			{ mot: 'brouette', validation: { tuiles: true } },
			{ mot: 'chapeau', validation: { tuiles: true, motCache: true } },
			{ mot: 'fourmi', validation: { tuiles: true, motCache: true, dictee: true } },
			{ mot: 'lampe' },
		]);
		runRevisionEspacee();
		const progression = (document.getElementById('revProg')?.textContent ?? '').replace(/\s/g, '');
		expect(progression).toBe('1/5');
	});
});

/* ============================================================
   GATE 1 — « Vérifier » CLIQUÉ SANS RÉPONSE, sous l'unique essai de la révision.
   ------------------------------------------------------------
   Ce que la révision promet à l'enfant : UN essai par item (`essaisAvantCorrection: 1`),
   une erreur menant droit à la correction guidée, au mot noté difficile et au palier
   d'espacement qui recule. Le corollaire est une exigence à part entière : ce prix se paie
   pour une RÉPONSE FAUSSE, jamais pour une absence de réponse. Un doigt qui effleure
   « Vérifier » sur une tablette n'est pas une erreur d'orthographe — le journal du parent
   lirait une faute jamais commise, et l'enfant perdrait le mot sans l'avoir travaillé.

   L'exigence n'est PAS propre à ce lot, et ne se dérive pas de son code : c'est la règle que
   la révision tient déjà pour ses autres formats à saisie (grille posée, sous-questions de
   problème — cf. `ui/revision.ts`, où une case vide RE-FOCALISE au lieu de valider). Le
   refactor de #640 mutualise les trois tâches d'orthographe dans un module partagé avec le
   parcours, qui laisse LUI plusieurs essais : le garde-fou devait survivre à cette mise en
   commun, et rien ne le vérifiait.

   Les trois versants sont éprouvés SUR LES TROIS TÂCHES, la révision les servant toutes
   depuis #640 : les tuiles, le mot caché et la dictée valident par des gestes différents,
   donc trois occasions distinctes de perdre la garde.
   ============================================================ */

/** Erreurs journalisées pour le profil actif — ce que le parent lira. */
const erreursJournalisees = () => chargerErreursFor(activeProfile().uuid);

/** Ce que l'enfant s'ENTEND dire : les régions live de la carte de révision. Sert à
    éprouver qu'on ne lui a pas annoncé un verdict — ni soufflé la réponse — alors qu'il
    n'a rien répondu. Lu par rôle, pas par identifiant. */
function annonce(): string {
	return [...document.querySelectorAll<HTMLElement>('.revision [role="status"]')]
		.map((e) => e.textContent ?? '')
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Le geste du mis-clic : valider sans rien avoir saisi ni posé. Le mot caché demande
    d'abord de cacher le mot (sinon il n'y a pas encore de champ à laisser vide). */
function verifierSansRepondre(vue: TacheVue): void {
	if (vue === 'motCache') {
		const cacher = bouton(/cacher/i);
		if (!cacher) throw new Error('bouton « Cacher » introuvable sur le mot caché');
		cliquer(cacher);
	}
	const valider = bouton(/vérifier|valider/i);
	if (!valider) throw new Error('aucun bouton de validation sur l’item de révision');
	cliquer(valider);
}

/** Une VRAIE faute : une réponse donnée, et fausse. Témoin des tests ci-dessous — sans lui,
    « l'état n'a pas bougé » pourrait passer parce que rien ne le fait jamais bouger. */
function repondreFaux(vue: TacheVue): void {
	if (vue === 'tuiles')
		assemblerEtValider('che'); // trois lettres posées, mot incomplet
	else saisirEtValider('chevale');
}

/** Un mot dû sur CHACUNE des trois tâches, avec un palier d'espacement déjà engagé (2) :
    un recul y est visible, là qu'un palier 0 en masquerait la moitié. */
const CAS_TACHE: { mode: ModeOrtho; libelle: string; seed: () => string }[] = [
	{
		mode: 'tuiles',
		libelle: 'les tuiles',
		seed: () => banque([{ mot: 'cheval', palier: 2 }]).ids[0],
	},
	{
		mode: 'motCache',
		libelle: 'le mot caché',
		seed: () => banque([{ mot: 'cheval', validation: { tuiles: true }, palier: 2 }]).ids[0],
	},
	{
		mode: 'dictee',
		libelle: 'la dictée',
		seed: () =>
			banque([{ mot: 'cheval', validation: { tuiles: true, motCache: true }, palier: 2 }]).ids[0],
	},
];

for (const { mode, libelle, seed } of CAS_TACHE) {
	describe(`#640 — validation à vide en révision, sur ${libelle}`, () => {
		it('ne coûte NI le palier, NI une erreur au journal du parent, NI un verdict', () => {
			const id = seed();
			runRevisionEspacee();
			expect(tacheServie('cheval')).toBe(mode); // prémisse : c'est bien cette tâche qui est servie
			const avant = JSON.stringify(relu(id));

			verifierSansRepondre(mode);

			// (i) RIEN n'est enregistré : ni recul de palier, ni date de test, ni marche franchie.
			// L'état COMPLET du mot est comparé, et non le seul palier : c'est tout ce que
			// l'espace encadrant relira.
			expect(JSON.stringify(relu(id))).toBe(avant);
			// Une faute jamais commise ne doit pas remonter au parent (#391).
			expect(erreursJournalisees()).toEqual([]);
			expect(getXP()).toBe(0);
			// (ii) pas de bascule sur la correction guidée : l'enfant ne s'entend pas dire qu'il
			// s'est trompé, et la réponse ne lui est pas soufflée — il ne l'a pas demandée.
			expect(annonce()).not.toContain('cheval');
		});

		it('laisse l’essai INTACT : une réponse juste, juste après, compte normalement', () => {
			const id = seed();
			runRevisionEspacee();
			expect(tacheServie('cheval')).toBe(mode);

			verifierSansRepondre(mode);
			// Le mis-clic n'a pas consommé l'essai : l'enfant répond, et son travail compte —
			// marche franchie (#640), palier avancé, un point. C'est le versant qui prouve que la
			// garde ne se contente pas de « ne rien faire » : la tâche reste JOUABLE.
			reussirLaTacheServie('cheval');

			const m = relu(id);
			expect(m.validation[mode]).toBe(true);
			expect(dateFranchissement(m, mode)).toBe(T0);
			expect(m.revision.palier).toBe(3); // 2 → 3 : une réussite avance d'un cran
			expect(getXP()).toBe(1);
			expect(erreursJournalisees()).toEqual([]);
		});

		it('témoin : une vraie faute, elle, coûte bien l’essai (sinon rien n’est prouvé)', () => {
			const id = seed();
			runRevisionEspacee();
			expect(tacheServie('cheval')).toBe(mode);

			repondreFaux(mode);

			// Les trois observables du premier test BOUGENT quand un essai est réellement
			// consommé : palier reculé, erreur journalisée, réponse annoncée avec la correction
			// guidée. C'est ce qui rend « inchangé » discriminant.
			expect(relu(id).revision.palier).toBe(1); // 2 → 1 : un échec recule d'un cran
			expect(erreursJournalisees()).toHaveLength(1);
			expect(annonce()).toContain('cheval');
			// Et aucune marche n'est dé-franchie au passage (critère 9), y compris ici.
			expect(relu(id).validation[mode]).toBe(false);
		});
	});
}

/* ============================================================
   GATE 2 — UNE LISTE QUI BASCULE PENDANT LA SÉANCE, AU JOURNAL DES PALIERS (#541).
   ------------------------------------------------------------
   L'effet propre à la LISTE, que rien n'éprouvait : sur un appareil sans voix, l'escalier
   n'a que deux marches (`modesRequis(false)`), donc un mot au rang « tuiles » n'en a plus
   qu'une à franchir — une unique réussite en révision le rend maîtrisé, et une liste qui ne
   contient que lui devient ACQUISE dans cette séance-là, sans qu'aucune dictée n'ait été
   lancée.

   Le mot est semé COHÉRENT (« tuiles validées ») et non troué, comme il l'était d'abord :
   depuis le lot de suite de #640, un mot troué est réparé à la lecture, donc sur appareil
   muet il arrive DÉJÀ maîtrisé et il n'y a plus de bascule à observer dans la séance. C'est
   la bascule qui est l'objet de ce gate, pas la forme du trou.

   Ce que le journal des paliers promet (cf. l'en-tête de `core/orthographe/paliers.ts`) :
   DATER le franchissement d'état d'une liste, une fois, pour que la frise de l'espace
   encadrant puisse dire au parent « acquis depuis le … ». Le modèle est MONOTONE : ce qui
   n'est pas tamponné au moment du franchissement ne le sera jamais — rien ne repassera par
   là. Un franchissement manqué n'est donc pas un retard d'affichage, c'est une liste dont la
   frise restera muette pour toujours.

   La spec `e2e/paliers-journal-ortho.spec.ts` avait dû neutraliser ce cas (un second mot
   hors rotation) pour rester stable face aux voix qui apparaissent en cours de session : son
   auteur l'a signalé comme non couvert. Il l'est ici, où la disponibilité des voix est
   STUBÉE et affirmée.
   ============================================================ */
describe('#640/#541 — une liste d’un seul mot qui bascule, vue du journal des paliers', () => {
	const journalPaliers = (): Record<string, PaliersNotion> =>
		lsGet(ORTHO_PALIERS_KEY, {}) as Record<string, PaliersNotion>;
	const listeCouranteId = (): string => loadOrtho().listes[0].id;
	/** Listes tamponnées « acquis » par le journal, pour ce profil. */
	const listesAcquises = (): string[] =>
		Object.entries(journalPaliers())
			.filter(([, rec]) => rec.acquis != null)
			.map(([id]) => id);

	it('sans voix, la réussite qui la rend acquise la DATE « acquis » dans la séance', () => {
		sansVoix();
		expect(dicteeDisponible()).toBe(false); // stub affirmé : la dictée n'est pas requise
		const id = banque([{ mot: 'cheval', validation: { tuiles: true } }]).ids[0];
		const listeId = listeCouranteId();
		// Prémisses : rien n'est encore journalisé, et la liste n'est pas acquise.
		expect(journalPaliers()[listeId]).toBeUndefined();
		expect(niveauListeOrtho(loadOrtho(), listeId, false)).toBe('en-cours');

		runRevisionEspacee();
		reussirLaTacheServie('cheval');
		terminerSession();

		// L'état de la liste a bien franchi le cap du haut pendant cette séance…
		expect(statutMot(relu(id), false)).toBe('maitrise');
		expect(niveauListeOrtho(loadOrtho(), listeId, false)).toBe('acquis');
		// … et le journal le DATE : sans ce tampon, le parent n'aura jamais de « acquis depuis
		// le … » pour cette liste, le modèle monotone ne repassant pas par là.
		expect(journalPaliers()[listeId]?.acquis).toBe(T0);
		// Un seul cap franchi dans cette séance, celui du haut : le journal ne date pas un
		// « en cours » qu'il n'a jamais observé (il serait POSTÉRIEUR à l'acquis, et la frise
		// raconterait une liste entamée après avoir été acquise).
		expect(journalPaliers()[listeId]?.enCours ?? null).toBeNull();
		// Et seule CETTE liste est acquise : les leçons prédéfinies qui partagent le mot ne le
		// sont pas (elles en ont d'autres, jamais travaillés).
		expect(listesAcquises()).toEqual([listeId]);
	});

	it('avec voix, la même réussite ne la date PAS « acquis » : la dictée reste due', () => {
		// Le versant qui rend le test précédent discriminant : le journal doit suivre l'ÉTAT de
		// la liste, et non tamponner « acquis » toute liste dont un mot vient d'être réussi.
		// Avec voix, la même réussite laisse encore le mot caché et la dictée à franchir.
		expect(dicteeDisponible()).toBe(true); // stub affirmé : voix FR locale installée
		const id = banque([{ mot: 'cheval' }]).ids[0];
		const listeId = listeCouranteId();

		runRevisionEspacee();
		reussirLaTacheServie('cheval');
		terminerSession();

		expect(statutMot(relu(id), true)).toBe('enCours');
		expect(niveauListeOrtho(loadOrtho(), listeId, true)).toBe('en-cours');
		expect(journalPaliers()[listeId]?.enCours).toBe(T0);
		expect(journalPaliers()[listeId]?.acquis ?? null).toBeNull();
		expect(listesAcquises()).toEqual([]);
	});
});
