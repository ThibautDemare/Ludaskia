/* ============================================================
   #306 §5 — garde-fou de la voix de dictée (`ui/tts.ts`, `ui/ortho-runner.ts`).
   ------------------------------------------------------------
   Attendus dérivés du cadrage de l'issue, pas de l'implémentation :
   - une voix « distante » (`localService: false`) fait synthétiser le son par un
     serveur : HORS LIGNE elle ne produit RIEN. L'appareil qui n'a qu'elle déclarait
     pourtant la dictée disponible, la lançait, et restait muet ;
   - le repli sur une voix distante reste un choix assumé EN LIGNE : il ne devient
     interdit que sans réseau ;
   - `navigator.onLine` n'est fiable que dans UN sens : `false` prouve l'absence de
     réseau, `true` ne prouve rien (portail captif). On ne s'en sert donc jamais
     comme feu vert, seulement comme feu rouge ;
   - deux causes distinctes, deux messages : « aucune voix française sur cet
     appareil » (définitif) et « la voix a besoin d'Internet » (temporaire) ;
   - `dicter` prévient l'appelant quand rien n'a été prononcé, MAIS ne prend pas nos
     propres `speechSynthesis.cancel()` pour une panne (`canceled`/`interrupted`) :
     une deuxième écoute annule la première, et une dictée parfaitement audible
     passerait pour muette dès le deuxième clic ;
   - pour une dictée, le TTS EST l'exercice : sans voix, on n'entre pas dans la
     leçon, et surtout RIEN N'EST JOURNALISÉ (#391). Un enfant qui n'entend rien
     saisit n'importe quoi ; ces réponses apparaîtraient au parent comme des fautes
     d'orthographe qui n'en sont pas.

   La Web Speech API est stubée (comme `ortho-tts-motcache.test.ts`) : les voix
   réellement installées sur la machine de test ne doivent jamais décider du résultat.
   ============================================================ */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { dicteeDisponible, dicter, initTts, messageSansVoix, raisonSansVoix } from '../src/ui/tts';
import { setOnDataWrite } from '../src/core/storage';
import { activeProfile, initProfiles, touchActiveProfile } from '../src/core/profiles';
import { createListe, loadOrtho, saveOrtho } from '../src/core/orthographe/store';
import { setPendingOrthoMode, startOrthoRun } from '../src/ui/ortho-runner';
import { chargerErreursFor } from '../src/core/erreurs-journal';

/* ---------- Stub de la Web Speech API ---------- */
interface VoixStub {
	lang: string;
	localService: boolean;
	name: string;
}
const LOCALE: VoixStub = { lang: 'fr-FR', localService: true, name: 'Amélie (locale)' };
const DISTANTE: VoixStub = { lang: 'fr-FR', localService: false, name: 'Amélie (réseau)' };
const ANGLAISE: VoixStub = { lang: 'en-GB', localService: true, name: 'Daniel' };

let speak: ReturnType<typeof vi.fn>;
let cancel: ReturnType<typeof vi.fn>;

/* Un vrai `SpeechSynthesisUtterance` est un EventTarget : `dicter` y pose un écouteur
   `error`. Le stub doit en hériter, sinon il modélise une API qui n'existe pas. */
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
/* Événement d'échec d'un énoncé : c'est son CODE qui distingue une panne d'une
   coupure qu'on a nous-mêmes provoquée. */
class ErreurSynthese extends Event {
	error: string;
	constructor(code: string) {
		super('error');
		this.error = code;
	}
}

/** Installe le jeu de voix de l'appareil simulé (et rafraîchit le cache du module). */
function installerVoix(voix: VoixStub[]): void {
	speak = vi.fn();
	cancel = vi.fn();
	(globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis = {
		getVoices: () => voix,
		addEventListener: () => {},
		cancel,
		speak,
	};
	(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
		UtteranceStub;
	initTts(); // les voix se chargent de façon asynchrone dans la vraie vie
}
/** Appareil sans Web Speech API du tout (vieux navigateur, WebView bridée). */
function sansApiVocale(): void {
	Reflect.deleteProperty(globalThis, 'speechSynthesis');
}
/** Réseau simulé : seule l'absence (`false`) est une information sûre. */
function reseau(enLigne: boolean): void {
	Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => enLigne });
}
/** Dernier énoncé confié au moteur vocal. */
const dernierEnonce = (): UtteranceStub => speak.mock.calls[speak.mock.calls.length - 1][0];

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	document.body.innerHTML = '<div id="sheets"></div>';
	reseau(true);
	installerVoix([LOCALE]);
});

afterEach(() => {
	Reflect.deleteProperty(navigator, 'onLine'); // rend la vraie valeur de l'environnement
});

describe('dicteeDisponible — une voix distante ne parle pas hors ligne', () => {
	it('voix française LOCALE : disponible, en ligne comme hors ligne', () => {
		expect(dicteeDisponible()).toBe(true);
		reseau(false);
		expect(dicteeDisponible()).toBe(true); // c'est tout l'intérêt d'une voix locale
		expect(raisonSansVoix()).toBeNull();
	});

	it('voix française DISTANTE seule + hors ligne : indisponible, parce qu’elle serait muette', () => {
		installerVoix([DISTANTE]);
		reseau(false);
		expect(dicteeDisponible()).toBe(false);
		expect(raisonSansVoix()).toBe('horsLigne');
	});

	it('la même voix distante EN LIGNE reste disponible (le repli est assumé)', () => {
		installerVoix([DISTANTE]);
		reseau(true);
		expect(dicteeDisponible()).toBe(true);
		expect(raisonSansVoix()).toBeNull();
	});

	it('hors ligne, une voix locale plus loin dans la liste est retrouvée', () => {
		// Piège : ne pas juger sur la PREMIÈRE voix française venue.
		installerVoix([DISTANTE, ANGLAISE, LOCALE]);
		reseau(false);
		expect(dicteeDisponible()).toBe(true);
	});

	it('aucune voix française : indisponible, quel que soit le réseau', () => {
		installerVoix([ANGLAISE]);
		for (const enLigne of [true, false]) {
			reseau(enLigne);
			expect(dicteeDisponible()).toBe(false);
			expect(raisonSansVoix()).toBe('aucune'); // ce n'est pas un problème de réseau
		}
	});

	it('aucune voix du tout : indisponible, raison « aucune »', () => {
		installerVoix([]);
		reseau(false);
		expect(dicteeDisponible()).toBe(false);
		expect(raisonSansVoix()).toBe('aucune');
	});

	it('les variantes de français comptent (fr-CA, FR-FR)', () => {
		installerVoix([{ lang: 'fr-CA', localService: true, name: 'Chantal' }]);
		reseau(false);
		expect(dicteeDisponible()).toBe(true);
		installerVoix([{ lang: 'FR-FR', localService: true, name: 'Majuscules' }]);
		expect(dicteeDisponible()).toBe(true);
	});

	it('une voix sans langue déclarée n’est pas prise pour du français', () => {
		installerVoix([{ lang: '', localService: true, name: 'Anonyme' }]);
		expect(dicteeDisponible()).toBe(false);
		expect(raisonSansVoix()).toBe('aucune');
	});

	it('pas de Web Speech API : indisponible, raison « aucune »', () => {
		sansApiVocale();
		expect(dicteeDisponible()).toBe(false);
		expect(raisonSansVoix()).toBe('aucune');
	});

	it('« en ligne » n’est JAMAIS une preuve : seule l’absence de réseau restreint', () => {
		// Derrière un portail captif, `onLine` ment. On ne s'en sert donc pas comme feu
		// vert : rien de ce qui marche en ligne ne devient indisponible parce qu'il vaut
		// `true`, et rien d'autre que `false` ne restreint quoi que ce soit.
		installerVoix([DISTANTE, LOCALE]);
		reseau(true);
		expect(dicteeDisponible()).toBe(true);
		reseau(false);
		expect(dicteeDisponible()).toBe(true); // la voix locale suffit, réseau ou pas
	});
});

describe('messageSansVoix — une formulation par cause, sans les confondre', () => {
	const message = (voix: VoixStub[], enLigne: boolean): string => {
		installerVoix(voix);
		reseau(enLigne);
		return messageSansVoix();
	};

	it('trois situations, trois messages distincts', () => {
		const dispo = message([LOCALE], true);
		const horsLigne = message([DISTANTE], false);
		const aucune = message([ANGLAISE], true);
		expect(new Set([dispo, horsLigne, aucune]).size).toBe(3);
		for (const m of [dispo, horsLigne, aucune]) expect(m.trim().length).toBeGreaterThan(0);
	});

	it('sans voix française : le patron déjà employé par l’espace encadrant', () => {
		expect(message([ANGLAISE], true)).toContain('aucune voix française');
	});

	it('hors ligne : parle de la connexion, et dit que ce n’est pas définitif', () => {
		const m = message([DISTANTE], false);
		expect(m.toLowerCase()).toContain('connexion');
		expect(m).not.toContain('aucune voix française'); // ce n'est pas la même cause
		expect(m.toLowerCase()).toMatch(/revient|rétabl/); // l'adulte doit savoir que ça repart
	});

	it('voix disponible : ne dit pas « indisponible »', () => {
		expect(message([LOCALE], true)).not.toContain('indisponible');
	});
});

describe('dicter — prévenir quand rien n’a été prononcé, et seulement là', () => {
	it('voix utilisable : l’énoncé part, aucune alerte', () => {
		const onErreur = vi.fn();
		dicter('cheval', 'le cheval galope', onErreur);
		expect(speak).toHaveBeenCalledTimes(1);
		expect(dernierEnonce().text).toContain('cheval');
		expect(onErreur).not.toHaveBeenCalled();
	});

	it('aucune voix utilisable (hors ligne, voix distante) : alerte, et RIEN n’est prononcé', () => {
		installerVoix([DISTANTE]);
		reseau(false);
		const onErreur = vi.fn();
		dicter('cheval', undefined, onErreur);
		expect(onErreur).toHaveBeenCalledTimes(1);
		expect(speak).not.toHaveBeenCalled(); // surtout pas d'énoncé silencieux
	});

	it('pas de Web Speech API : alerte aussi', () => {
		sansApiVocale();
		const onErreur = vi.fn();
		dicter('cheval', undefined, onErreur);
		expect(onErreur).toHaveBeenCalledTimes(1);
	});

	for (const code of ['canceled', 'interrupted']) {
		it(`« ${code} » vient de NOUS (deuxième écoute) : pas d’alerte`, () => {
			const onErreur = vi.fn();
			dicter('cheval', undefined, onErreur);
			const premier = dernierEnonce();
			dicter('cheval', undefined, onErreur); // l'enfant réécoute : cancel() coupe le 1er
			premier.dispatchEvent(new ErreurSynthese(code));
			expect(onErreur).not.toHaveBeenCalled(); // la dictée est audible, ne pas la déclarer muette
			expect(speak).toHaveBeenCalledTimes(2);
		});
	}

	for (const code of ['synthesis-failed', 'network', 'audio-busy']) {
		it(`« ${code} » est une vraie panne : alerte`, () => {
			const onErreur = vi.fn();
			dicter('cheval', undefined, onErreur);
			dernierEnonce().dispatchEvent(new ErreurSynthese(code));
			expect(onErreur).toHaveBeenCalledTimes(1);
		});
	}

	it('sans `onErreur`, un échec ne lève pas (appelants qui s’en passent)', () => {
		installerVoix([DISTANTE]);
		reseau(false);
		expect(() => dicter('cheval')).not.toThrow();
	});
});

/* ---------- Le runner : ne pas entrer dans une dictée muette, et ne rien journaliser ---------- */

/** Liste d'un seul mot, et démarrage d'une séance CIBLÉE sur le mode demandé. */
function lancerDictee(): void {
	const s = loadOrtho();
	const liste = createListe(s, 'Sem 1', [{ mot: 'cheval' }]);
	saveOrtho(s);
	setPendingOrthoMode('dictee'); // séance ciblée : elle IMPOSE la dictée
	void startOrthoRun(liste.id);
}
const journal = () => chargerErreursFor(activeProfile().uuid);
const ecran = () => document.getElementById('sheets') as HTMLElement;
const saisir = (valeur: string): void => {
	const input = ecran().querySelector('#orthoInput') as HTMLInputElement;
	input.value = valeur;
	(ecran().querySelector('#btnVerifMot') as HTMLElement).dispatchEvent(new Event('click'));
};

describe('ortho-runner — une dictée sans voix n’est pas une dictée dégradée', () => {
	it('témoin : avec une voix, une faute EST journalisée (sinon les tests suivants ne prouvent rien)', () => {
		lancerDictee();
		expect(ecran().querySelector('#orthoInput')).not.toBeNull();
		saisir('chevale');
		expect(journal()).toHaveLength(1);
		expect(journal()[0].donnee).toBe('chevale');
		expect(journal()[0].mode).toBe('dictee');
	});

	it('voix indisponible : on n’entre pas dans l’exercice, l’écran de sortie prend la main', () => {
		installerVoix([DISTANTE]);
		reseau(false);
		lancerDictee();
		expect(ecran().querySelector('#orthoInput')).toBeNull(); // aucun champ muet
		expect(ecran().querySelector('#btnEcouter')).toBeNull();
		expect(document.getElementById('btnAutrementDictee')).not.toBeNull(); // travailler autrement
		expect(document.getElementById('btnStopDictee')).not.toBeNull();
		expect(speak).not.toHaveBeenCalled();
		expect(journal()).toEqual([]);
	});

	it('appareil sans aucune voix française : même sortie', () => {
		installerVoix([ANGLAISE]);
		lancerDictee();
		expect(ecran().querySelector('#orthoInput')).toBeNull();
		expect(document.getElementById('btnAutrementDictee')).not.toBeNull();
		expect(journal()).toEqual([]);
	});

	it('la voix meurt EN COURS : la saisie faite dans le silence n’est pas corrigée ni journalisée', () => {
		// Voix distante, en ligne au départ (donc la dictée s'ouvre), puis l'énoncé
		// échoue — c'est exactement la connexion qui tombe en plein exercice.
		installerVoix([DISTANTE]);
		lancerDictee();
		const input = ecran().querySelector('#orthoInput') as HTMLInputElement;
		const verifier = ecran().querySelector('#btnVerifMot') as HTMLElement;
		expect(input).not.toBeNull();

		dernierEnonce().dispatchEvent(new ErreurSynthese('network'));
		expect(document.getElementById('btnAutrementDictee')).not.toBeNull(); // sortie affichée
		expect(document.getElementById('orthoInput')).toBeNull();

		// L'enfant avait déjà écrit au hasard et valide : rien ne doit en sortir.
		input.value = 'chevale';
		verifier.dispatchEvent(new Event('click'));
		expect(journal()).toEqual([]);
	});

	it('une réécoute (« canceled ») ne fait pas passer la dictée pour muette', () => {
		lancerDictee();
		const premier = dernierEnonce();
		(ecran().querySelector('#btnEcouter') as HTMLElement).dispatchEvent(new Event('click'));
		premier.dispatchEvent(new ErreurSynthese('canceled'));
		expect(document.getElementById('btnAutrementDictee')).toBeNull(); // toujours en dictée
		expect(ecran().querySelector('#orthoInput')).not.toBeNull();
		// …et la correction continue de fonctionner normalement.
		saisir('chevale');
		expect(journal()).toHaveLength(1);
	});
});
