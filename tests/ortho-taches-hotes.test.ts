/* ============================================================
   #640 (lot de suite) — CE QUE LES DEUX HÔTES DOIVENT DÉCIDER PAREIL.

   Tests écrits AVANT l'implémentation, depuis le commentaire daté du 2026-09-07 de
   l'issue #640, jamais depuis le code.

   Les trois tâches d'orthographe (tuiles, mot caché, dictée) vivent dans un module
   partagé (`ui/ortho-taches.ts`) depuis #640, mais ce que l'hôte en fait lui reste :
   le PARCOURS (`ui/ortho-runner.ts`) et la RÉVISION espacée (`ui/revision.ts`) posent
   chacun leurs options. Deux décisions ont divergé, et le lot de suite les aligne.

   GATE B — UN CLIC « VÉRIFIER » À VIDE NE COÛTE RIEN, NULLE PART.
   Le garde-fou `ignorerReponseVide` n'est activé qu'en révision. Au parcours, un doigt
   qui effleure « Vérifier » sur une tablette consomme un essai et s'entend répondre
   « Presque ! Réessaie » sur une réponse jamais donnée — puis, au deuxième effleurement,
   part en correction guidée avec le mot noté comme ayant résisté. Décision du
   mainteneur : le garde-fou partout, et le dire à l'enfant dans les trois tâches.

   GATE C — LE JOURNAL DU PARCOURS DÉCRIT LA TÂCHE RÉELLEMENT JOUÉE.
   `journalErreurOrtho` écrit « Mot à écrire sous la dictée » quel que soit le mode
   joué : une erreur commise sur les TUILES s'affiche au parent comme une dictée. La
   révision distingue les trois formulations depuis #640 ; le parcours doit reprendre
   LES MÊMES, pour que le même geste ne se lise pas différemment selon le chemin dans
   le tableau du parent.

   COMMENT C'EST ÉPROUVÉ, et pourquoi ainsi :
   - les DEUX hôtes sont joués pour de vrai (happy-dom), sur le MÊME état de banque :
     la seule façon de voir une divergence d'hôte est de faire faire le même geste aux
     deux. La révision sert donc de TÉMOIN — ses tests doivent être verts, et ce sont
     eux qui prouvent que les rouges du parcours ne viennent pas du harnais ;
   - les attendus sont dérivés de l'exigence, jamais des chaînes du code. Gate C
     n'affirme AUCUN libellé : elle compare ce qu'écrivent les deux hôtes et exige que
     les trois tâches ne se confondent pas. Un jour où les trois phrases changent, ces
     tests restent justes ;
   - la TÂCHE À L'ÉCRAN est reconnue par les identifiants que le module partagé
     documente comme communs aux deux hôtes (`#bac .tuile[data-i]`, `#btnCacher`,
     `#btnEcouter`, `#orthoInput`) — et seulement pour poser la PRÉMISSE d'un test
     (« c'est bien cette tâche qui est servie ») ; les assertions, elles, portent sur
     l'état écrit, le journal du parent et ce qui est annoncé à l'enfant ;
   - la disponibilité des voix est STUBÉE : des voix SAPI peuvent apparaître en cours
     de session sur la machine de test, et la dictée ne doit jamais dépendre de ça.
   ============================================================ */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { activeProfile, initProfiles, touchActiveProfile } from '../src/core/profiles';
import { loadOrtho, saveOrtho, createListe, motsDeListe } from '../src/core/orthographe/store';
import { marquerAtelierFait, prochaineActivite } from '../src/core/orthographe/runner';
import { JOUR } from '../src/core/revision';
import { getXP } from '../src/core/progress';
import { chargerErreursFor } from '../src/core/erreurs-journal';
import { dicteeDisponible, initTts } from '../src/ui/tts';
import { runRevisionEspacee } from '../src/ui/revision';
import { startOrthoRun } from '../src/ui/ortho-runner';
import type { MotOrtho, ModeOrtho, ContexteVerbe } from '../src/core/orthographe/types';

/* ---------- Horloge figée ---------- */
const T0 = new Date(2026, 8, 7, 9, 0).getTime(); // lundi 7 septembre 2026, 9 h
let maintenant = T0;

/* ---------- Appareil : voix de synthèse (stubée, jamais celles de la machine) ---------- */
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

/* ---------- Monde neuf (profil + écran) ---------- */
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
	validation?: Partial<Record<ModeOrtho, boolean>>;
	contexte?: ContexteVerbe;
	palier?: number;
}
/** Une liste d'un mot DÉCOUVERT (atelier fait il y a un mois), dû aujourd'hui, dans l'état
    demandé. Renvoie l'id du mot et celui de la liste. */
function banque(sp: SpecMot): { motId: string; listeId: string } {
	const s = loadOrtho();
	const liste = createListe(s, 'Semaine 1', [{ mot: sp.mot }]);
	const m = motsDeListe(s, liste)[0];
	marquerAtelierFait(m, T0 - 30 * JOUR);
	m.validation = { tuiles: false, motCache: false, dictee: false, ...(sp.validation ?? {}) };
	if (sp.contexte) m.contexte = sp.contexte;
	m.revision = {
		palier: sp.palier ?? 2,
		prochaineRevision: T0 - JOUR, // dû aujourd'hui
		reussites: sp.palier ?? 2,
		dernierTest: T0 - 10 * JOUR,
	};
	saveOrtho(s);
	return { motId: m.id, listeId: liste.id };
}
/** Le mot tel qu'il est EN STOCKAGE (ce que relira l'espace encadrant). */
const relu = (id: string): MotOrtho => loadOrtho().banque[id];
/** Erreurs journalisées pour le profil actif — ce que le parent lira. */
const journal = () => chargerErreursFor(activeProfile().uuid);

/* ---------- Lecture de l'écran ---------- */
const ecran = (): HTMLElement => document.getElementById('sheets') as HTMLElement;
const cliquables = (): HTMLElement[] => [
	...document.querySelectorAll<HTMLElement>('button, [role="button"], .tuile'),
];
const bouton = (motif: RegExp): HTMLElement | undefined =>
	cliquables().find((b) => motif.test((b.textContent ?? '').trim()));
const cliquer = (el: HTMLElement): void => {
	el.dispatchEvent(new Event('click', { bubbles: true }));
};
const champ = (): HTMLInputElement | null =>
	document.querySelector<HTMLInputElement>('#orthoInput');
const tuilesDuBac = (): HTMLElement[] => [
	...document.querySelectorAll<HTMLElement>('#bac .tuile[data-i]'),
];

/** Lecture STRUCTURELLE de ce qui s'adresse à un lecteur d'écran à cet instant : régions
    live et description de l'élément focalisé. Sert à COMPARER deux gestes (« lui répond-on
    la même chose ? »), et rien d'autre.
    À NE PAS prendre pour une preuve d'annonce : un texte peut être là, dans la bonne
    balise, et n'être jamais prononcé (une description n'est relue que sur un événement
    `focus` RÉEL). C'est cette confusion qui a rendu un test vert des deux côtés du défaut ;
    pour « est-ce entendu ? », c'est `observerAnnonce` plus bas. */
function textesAnnonces(): string {
	const live = [
		...document.querySelectorAll<HTMLElement>('[role="status"], [role="alert"], [aria-live]'),
	].map((e) => e.textContent ?? '');
	const actif = document.activeElement as HTMLElement | null;
	const ids = (actif?.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
	const decrits = ids.map((id) => document.getElementById(id)?.textContent ?? '');
	return [...live, ...decrits].join(' ').replace(/\s+/g, ' ').trim();
}

/** Ce que l'enfant VOIT en retour de sa validation : la zone de retour de la tâche, commune
    aux trois rendus et aux deux hôtes (`.ortho-feedback`). Lue par sa classe et non par le
    texte de l'écran entier : sur les tuiles, valider déplace aussi des lettres, donc un
    diff d'écran ne dirait pas ce qui a été RÉPONDU à l'enfant. */
const retourVu = (): string =>
	(
		[...document.querySelectorAll<HTMLElement>('.ortho-feedback')]
			.map((e) => e.textContent ?? '')
			.join(' ') ?? ''
	)
		.replace(/\s+/g, ' ')
		.trim();

/** Tout ce que l'enfant reçoit en retour, vu et entendu. C'est le bon grain pour comparer
    « on lui répond quoi ? » entre deux gestes, sans citer aucune phrase. */
const retourRecu = (): string => (retourVu() + ' ' + textesAnnonces()).replace(/\s+/g, ' ').trim();

/* ---------- Ce qui est réellement ANNONCÉ, et pas seulement affiché ----------
   `textesAnnonces` ci-dessus est une lecture STRUCTURELLE : elle dit ce qu'un lecteur
   d'écran TROUVERAIT s'il explorait la page à cet instant. Elle ne dit pas qu'il l'a
   ENTENDU, et les deux se confondent facilement — c'est exactement le faux vert que ce
   bloc corrige. Une annonce spontanée n'arrive que par deux voies :
   1. une région live qui EXISTAIT DÉJÀ et dont le texte change (une région créée avec
      son texte n'est pas annoncée) ;
   2. une description (`aria-describedby`) relue à l'occasion d'un événement `focus`
      RÉEL — NVDA et JAWS ne relisent rien sur la seule mutation du texte décrit, et
      `focus()` sur l'élément DÉJÀ focalisé ne déclenche aucun événement.
   D'où l'observation des ÉVÉNEMENTS pendant le geste, et non de `document.activeElement`
   après coup : celui-ci a la même valeur qu'on ait annoncé ou pas, donc il ne distingue
   rien. Aucune des deux voies n'est exigée en particulier : c'est « le message lui
   parvient » qui est asséré, pas le mécanisme qui le porte aujourd'hui. */
const texteDe = (e: Element | null): string => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const zonesDeRetour = (): HTMLElement[] => [
	...document.querySelectorAll<HTMLElement>('.ortho-feedback'),
];
const zonesLive = (): HTMLElement[] => [
	...document.querySelectorAll<HTMLElement>('[role="status"], [role="alert"], [aria-live]'),
];
/** Ce que la voix de synthèse lirait comme description de cet élément, MAINTENANT. */
const descriptionDe = (el: HTMLElement): string =>
	(el.getAttribute('aria-describedby') ?? '')
		.split(/\s+/)
		.filter(Boolean)
		.map((id) => texteDe(document.getElementById(id)))
		.join(' ')
		.trim();

interface Observation {
	/** Ce qui vient d'être répondu à l'écran (zones de retour dont le texte a changé). */
	messages: string[];
	/** Ceux qui seraient effectivement entendus, avec la voie constatée. */
	annonces: { message: string; via: string }[];
	/** Ceux qui resteraient MUETS pour qui ne voit pas l'écran. */
	muets: string[];
}

/** Joue `geste` en écoutant ce qui parviendrait à un lecteur d'écran. */
function observerAnnonce(geste: () => void): Observation {
	const avantRetours = new Map(zonesDeRetour().map((e) => [e, texteDe(e)] as const));
	const avantLive = new Map(zonesLive().map((e) => [e, texteDe(e)] as const));
	// Description relue À L'INSTANT du focus (et pas après le geste) : c'est ce que la voix
	// dirait vraiment ; une description remplie après coup ne serait jamais entendue.
	const relues: string[] = [];
	const noter = (e: Event): void => {
		const cible = e.target as HTMLElement | null;
		const d = cible ? descriptionDe(cible) : '';
		if (d) relues.push(d);
	};
	document.addEventListener('focus', noter, true); // `focus` ne remonte pas : capture
	document.addEventListener('focusin', noter); // même transition, voie bouillonnante
	try {
		geste();
	} finally {
		document.removeEventListener('focus', noter, true);
		document.removeEventListener('focusin', noter);
	}
	const messages = zonesDeRetour()
		.filter((e) => texteDe(e) !== (avantRetours.get(e) ?? ''))
		.map((e) => texteDe(e))
		.filter((t) => t !== '');
	const criees = zonesLive()
		.filter((e) => avantLive.has(e) && texteDe(e) !== avantLive.get(e))
		.map((e) => texteDe(e));
	const voie = (m: string): string | null => {
		if (criees.some((t) => t.includes(m))) return 'région live';
		if (relues.some((t) => t.includes(m))) return 'focus';
		return null;
	};
	const annonces: { message: string; via: string }[] = [];
	const muets: string[] = [];
	for (const m of messages) {
		const via = voie(m);
		if (via) annonces.push({ message: m, via });
		else muets.push(m);
	}
	return { messages, annonces, muets };
}

/* ---------- Les trois tâches, et l'état qui les rend dues ----------
   Les seeds suivent l'escalier : rien de validé → les tuiles sont dues ; les tuiles
   validées → le mot caché ; les deux → la dictée. C'est le MÊME état pour les deux
   hôtes, tous deux réglés par `prochaineActivite` : c'est ce qui rend la comparaison
   d'hôte à hôte légitime. */
const MOT = 'cheval';
const CAS: { mode: ModeOrtho; libelle: string; validation: Partial<Record<ModeOrtho, boolean>> }[] =
	[
		{ mode: 'tuiles', libelle: 'les tuiles', validation: {} },
		{ mode: 'motCache', libelle: 'le mot caché', validation: { tuiles: true } },
		{ mode: 'dictee', libelle: 'la dictée', validation: { tuiles: true, motCache: true } },
	];

/** La tâche attendue est-elle bien à l'écran ? (Prémisse d'un test, jamais son objet.) */
function tacheAffichee(mode: ModeOrtho): boolean {
	if (mode === 'tuiles') return tuilesDuBac().length > 0;
	if (mode === 'motCache') return !!bouton(/cacher/i);
	return !!document.getElementById('btnEcouter') && !!champ();
}

/* ---------- Les deux hôtes ---------- */
interface Hote {
	nom: string;
	/** Monte l'hôte sur la banque du profil et amène le mot à l'écran. */
	lancer: (listeId: string) => Promise<void>;
}
const HOTES: Hote[] = [
	{
		nom: 'parcours',
		lancer: async (listeId) => {
			await startOrthoRun(listeId);
		},
	},
	{
		nom: 'révision',
		lancer: async () => {
			runRevisionEspacee();
		},
	},
];

/* ---------- Gestes de l'enfant ---------- */
/** Amène la tâche à l'état « prêt à valider » : le mot caché demande d'abord d'être
    caché (sinon il n'y a pas encore de champ à laisser vide). */
function preparerSaisie(mode: ModeOrtho): void {
	if (mode !== 'motCache') return;
	const cacher = bouton(/cacher/i);
	if (!cacher) throw new Error('bouton « Cacher » introuvable sur le mot caché');
	cliquer(cacher);
}
function boutonValider(): HTMLElement {
	const b = bouton(/vérifier|valider/i);
	if (!b) throw new Error('aucun bouton de validation à l’écran');
	return b;
}
function valider(): void {
	cliquer(boutonValider());
}
/** Valider dans les CONDITIONS DE FOCUS d'un vrai navigateur — c'est là que se joue tout
    ce qui s'adresse à qui ne voit pas l'écran, et c'est ce qu'un `dispatchEvent('click')`
    seul ne reproduit pas (ni happy-dom ni jsdom n'implémentent le focus-on-click natif,
    si bien que dans le harnais tout `focus()` du code sous test passe pour une vraie
    transition alors qu'il est un no-op dans la vie) :
    - TUILES : Chrome et Firefox donnent le focus au `<button>` dès son clic. La cible du
      message est donc DÉJÀ focalisée quand on lui répond, TOUJOURS ;
    - CHAMP : l'enfant tape au clavier, il a donc le focus dans le champ, et Entrée ne
      l'en fait pas sortir. C'est le chemin le plus courant au clavier. */
function validerCommeAuNavigateur(mode: ModeOrtho): void {
	if (mode === 'tuiles') {
		const b = boutonValider();
		b.focus();
		expect(document.activeElement, 'prémisse : le bouton cliqué a reçu le focus').toBe(b);
		cliquer(b);
		return;
	}
	const input = champ();
	if (!input) throw new Error('aucun champ de saisie à l’écran');
	input.focus();
	expect(document.activeElement, 'prémisse : l’enfant tape dans le champ').toBe(input);
	input.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
	);
}
/** Le mis-clic : valider sans avoir rien saisi ni posé. */
function verifierAVide(mode: ModeOrtho): void {
	preparerSaisie(mode);
	valider();
}
/** Pose les lettres de `suite` (dans l'ordre), puis valide. */
function assemblerEtValider(suite: string): void {
	for (const lettre of suite) {
		const tuile = tuilesDuBac().find(
			(t) => (t.textContent ?? '').trim() === lettre && !t.hasAttribute('disabled'),
		);
		if (!tuile) throw new Error('aucune tuile « ' + lettre + ' » disponible');
		cliquer(tuile);
	}
	valider();
}
function saisirEtValider(reponse: string): void {
	const input = champ();
	if (!input) throw new Error('aucun champ de saisie à l’écran');
	input.value = reponse;
	valider();
}
/** Répondre JUSTE à la tâche servie. */
function repondreJuste(mode: ModeOrtho): void {
	if (mode === 'tuiles') assemblerEtValider(MOT);
	else {
		preparerSaisie(mode);
		saisirEtValider(MOT);
	}
}
/** Répondre FAUX : une réponse donnée, et fausse (jamais une absence de réponse). */
function repondreFaux(mode: ModeOrtho): void {
	if (mode === 'tuiles')
		assemblerEtValider('che'); // trois lettres posées, mot incomplet
	else {
		preparerSaisie(mode);
		saisirEtValider('chevale');
	}
}

/* ============================================================
   GATE B — « Vérifier » à vide ne coûte rien, dans les DEUX hôtes
   ============================================================ */
for (const hote of HOTES) {
	for (const cas of CAS) {
		describe(`#640 — validation à vide sur ${cas.libelle} (hôte : ${hote.nom})`, () => {
			it('ne coûte NI l’état du mot, NI une erreur au journal du parent, NI de l’XP', async () => {
				const { motId, listeId } = banque({ mot: MOT, validation: cas.validation });
				const avant = JSON.stringify(relu(motId));
				await hote.lancer(listeId);
				expect(tacheAffichee(cas.mode)).toBe(true); // prémisse : c'est bien cette tâche

				verifierAVide(cas.mode);
				verifierAVide(cas.mode); // deux fois : un mis-clic n'arrive jamais seul sur tablette

				// L'état COMPLET du mot, et pas le seul palier : c'est tout ce que l'espace
				// encadrant relira (marches, dates, compteur d'espacement).
				expect(JSON.stringify(relu(motId))).toBe(avant);
				expect(journal()).toEqual([]); // une faute jamais commise ne remonte pas au parent
				expect(getXP()).toBe(0);
			});

			it('laisse la tâche JOUABLE : la bonne réponse qui suit compte normalement', async () => {
				const { motId, listeId } = banque({ mot: MOT, validation: cas.validation });
				await hote.lancer(listeId);
				expect(tacheAffichee(cas.mode)).toBe(true);

				verifierAVide(cas.mode);
				verifierAVide(cas.mode);
				// Le versant qui prouve que la garde ne se contente pas de « ne rien faire » :
				// l'enfant est toujours devant SA tâche, et son travail compte.
				repondreJuste(cas.mode);

				expect(relu(motId).validation[cas.mode]).toBe(true);
				expect(getXP()).toBe(1);
				expect(journal()).toEqual([]);
			});

			it('l’essai reste ENTIER : la faute qui suit est journalisée comme un PREMIER essai', async () => {
				// Le versant le plus coûteux du défaut, et le moins visible : au parcours, le
				// clic à vide consomme le premier essai, si bien que la faute suivante arrive
				// au rang 2 — or seul le rang 1 est journalisé. Le parent ne voit donc PAS une
				// erreur réellement commise, et l'enfant part en correction guidée sans avoir
				// eu son deuxième essai.
				const { listeId } = banque({ mot: MOT, validation: cas.validation });
				await hote.lancer(listeId);
				expect(tacheAffichee(cas.mode)).toBe(true);

				verifierAVide(cas.mode);
				repondreFaux(cas.mode);

				expect(journal()).toHaveLength(1);
				expect(journal()[0].donnee).toBe(cas.mode === 'tuiles' ? 'che' : 'chevale');
			});

			it('est DIT à l’enfant, et ENTENDU — dans les conditions de focus du navigateur', async () => {
				// Sans message, l'enfant croit avoir validé et attend ; au clavier, le focus
				// revenait dans le champ sans que rien ne soit annoncé — donc rien du tout pour
				// un lecteur d'écran (SC 4.1.3). L'exigence est « on le lui dit », pas « telle
				// balise » : cf. `observerAnnonce`, qui accepte région live comme description.
				//
				// La version d'avant de ce test asserait `textesAnnonces() !== ''`, c'est-à-dire
				// une TOPOLOGIE (« l'élément focalisé porte une description non vide »), sur un
				// écran où le focus n'était nulle part. Elle passait donc aussi bien avec le
				// défaut qu'avec son correctif, dans les deux chemins réels où la cible est déjà
				// focalisée (clic sur un bouton, Entrée dans un champ) : verte des deux côtés,
				// elle ne gardait rien. On assère désormais un événement `focus` RÉELLEMENT
				// déclenché, seul moment où une description est relue.
				const { listeId } = banque({ mot: MOT, validation: cas.validation });
				await hote.lancer(listeId);
				expect(tacheAffichee(cas.mode)).toBe(true); // prémisse : c'est bien cette tâche
				preparerSaisie(cas.mode);
				expect(retourVu(), 'prémisse : rien n’est encore répondu à l’enfant').toBe('');

				const obs = observerAnnonce(() => validerCommeAuNavigateur(cas.mode));

				expect(obs.messages, 'rien d’affiché après une validation à vide').not.toEqual([]);
				expect(
					obs.muets,
					`affiché à l’écran mais jamais annoncé : muet pour qui ne voit pas l’écran (entendu : ${JSON.stringify(obs.annonces)})`,
				).toEqual([]);
				// Et surtout pas la réponse : l'enfant ne l'a pas demandée, il n'a rien répondu.
				expect(obs.messages.join(' ').toLowerCase()).not.toContain(MOT);
			});
		});
	}
}

/* ---------- Le versant propre au PARCOURS : le message n'est pas un verdict ----------
   La révision n'a qu'un essai : une vraie faute y part droit en correction guidée, il n'y
   a donc pas deux messages à comparer. Au parcours, si — et c'est exactement le défaut
   nommé par le cadrage : « Presque ! Réessaie » s'affiche sur une réponse jamais donnée.
   Écrit par COMPARAISON, sans citer aucune des deux phrases : ce qui doit rester vrai,
   c'est qu'un enfant qui n'a rien répondu ne s'entend pas dire ce qu'on dit à celui qui
   s'est trompé. */
for (const cas of CAS) {
	describe(`#640 — au parcours, le clic à vide sur ${cas.libelle} n’est pas un verdict`, () => {
		/** Ce que l'enfant reçoit en retour, après le geste demandé (monde neuf). */
		async function retourApres(geste: (mode: ModeOrtho) => void): Promise<string> {
			resetMonde();
			const { listeId } = banque({ mot: MOT, validation: cas.validation });
			await startOrthoRun(listeId);
			geste(cas.mode);
			return retourRecu();
		}

		it('ne reçoit pas le même retour qu’une réponse fausse', async () => {
			const surVide = await retourApres(verifierAVide);
			const surFaute = await retourApres(repondreFaux);
			expect(surFaute, 'témoin : une vraie faute doit bien recevoir un retour').not.toBe('');
			expect(surVide).not.toBe(surFaute);
		});
	});
}

/* ============================================================
   GATE C — le journal du parcours décrit la tâche réellement jouée
   ------------------------------------------------------------
   AUCUN libellé n'est écrit dans ces tests. Deux exigences seulement, toutes deux
   observables et stables si les phrases changent un jour :
   1. les deux hôtes décrivent le MÊME geste de la MÊME façon (sinon le parent lit deux
      choses pour un seul geste, selon le chemin par lequel il l'a trouvé) ;
   2. les trois tâches ne se confondent pas entre elles (sinon le parent croit lire une
      dictée là où l'enfant reconstituait un mot avec les lettres qu'on lui donnait).
   ============================================================ */
/** Énoncé consigné par un hôte pour une faute sur `mode`. Monde neuf à chaque appel. */
async function enonceJournalise(hote: Hote, cas: (typeof CAS)[number]): Promise<string> {
	resetMonde();
	const { listeId } = banque({ mot: MOT, validation: cas.validation });
	await hote.lancer(listeId);
	expect(tacheAffichee(cas.mode), `${hote.nom} : ${cas.libelle} n’est pas à l’écran`).toBe(true);
	repondreFaux(cas.mode);
	const entrees = journal();
	expect(entrees, `${hote.nom} : aucune erreur journalisée sur ${cas.libelle}`).toHaveLength(1);
	return entrees[0].question;
}

describe('#640 — le journal décrit la tâche jouée, pareil dans les deux hôtes', () => {
	for (const cas of CAS) {
		it(`${cas.libelle} : parcours et révision consignent le MÊME énoncé`, async () => {
			const auParcours = await enonceJournalise(HOTES[0], cas);
			const enRevision = await enonceJournalise(HOTES[1], cas);
			expect(auParcours).toBe(enRevision);
		});
	}

	it('les trois tâches ne se confondent pas entre elles, au parcours', async () => {
		const enonces: Record<string, string> = {};
		for (const cas of CAS) enonces[cas.mode] = await enonceJournalise(HOTES[0], cas);
		// Le défaut nommé par le cadrage : une erreur commise sur les tuiles s'affichait au
		// parent avec l'énoncé de la dictée. Trois gestes distincts, trois descriptions.
		expect(new Set(Object.values(enonces)).size, JSON.stringify(enonces)).toBe(CAS.length);
	});

	it('témoin : la révision, elle, distingue déjà les trois (sinon le harnais est en cause)', async () => {
		const enonces: string[] = [];
		for (const cas of CAS) enonces.push(await enonceJournalise(HOTES[1], cas));
		expect(new Set(enonces).size, JSON.stringify(enonces)).toBe(CAS.length);
	});

	it('témoin : un VERBE en contexte est déjà décrit pareil par les deux hôtes', async () => {
		// La preuve que l'exigence 1 est tenable et déjà tenue quelque part : pour une cible
		// verbe, les deux hôtes montrent la phrase à trou. C'est le reste qui manque.
		const contexte: ContexteVerbe = { avant: 'il ', apres: ' une pomme' };
		const lire = async (hote: Hote): Promise<string> => {
			resetMonde();
			const { listeId } = banque({
				mot: 'mange',
				validation: { tuiles: true, motCache: true },
				contexte,
			});
			await hote.lancer(listeId);
			const input = champ();
			if (!input) throw new Error(`${hote.nom} : aucun champ pour le verbe`);
			input.value = 'manje';
			valider();
			const entrees = journal();
			expect(entrees, `${hote.nom} : rien journalisé pour le verbe`).toHaveLength(1);
			return entrees[0].question;
		};
		const auParcours = await lire(HOTES[0]);
		expect(auParcours).toBe(await lire(HOTES[1]));
		// Et la phrase à trou est bien ce qui est montré (l'énoncé porte le contexte).
		expect(auParcours).toContain('une pomme');
	});
});

/* ---------- Prémisses du harnais ----------
   Si l'un de ces trois tests échoue, tous les autres sont à relire : c'est le décor qui
   est faux, pas l'appli. */
describe('#640 — prémisses du harnais', () => {
	it('la voix stubée est vue comme disponible (la dictée est donc servable)', () => {
		expect(dicteeDisponible()).toBe(true);
	});

	it('les trois seeds rendent bien les trois tâches dues, sans dépendre de l’hôte', () => {
		for (const cas of CAS) {
			resetMonde();
			const { motId } = banque({ mot: MOT, validation: cas.validation });
			expect(prochaineActivite(relu(motId), true), cas.libelle).toBe(cas.mode);
		}
	});

	it('les deux hôtes servent bien le mot, chacun par son chemin', async () => {
		for (const hote of HOTES) {
			for (const cas of CAS) {
				resetMonde();
				const { listeId } = banque({ mot: MOT, validation: cas.validation });
				await hote.lancer(listeId);
				expect(tacheAffichee(cas.mode), `${hote.nom} / ${cas.libelle}`).toBe(true);
				expect(ecran().textContent ?? '').not.toBe('');
			}
		}
	});
});
