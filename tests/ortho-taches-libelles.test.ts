/* ============================================================
   Nom accessible de la CIBLE dans les trois tâches d'orthographe (#640, suite de #577).

   `renderMotCache` portait `aria-label="Écris le mot"` EN DUR, là où `renderDictee`
   adaptait déjà en « Écris le verbe » quand le mot servi est une cible verbe (#261) : sur
   une tâche de conjugaison, l'enfant au lecteur d'écran entendait « Écris le mot ». Le
   seul canal qui lui dise QUOI écrire lui donnait la mauvaise nature — et il n'avait aucun
   moyen de s'en apercevoir, la phrase à trou étant, elle, correcte.

   Le gate de #577 (`tests/champs-libelles.test.ts`) ne pouvait pas l'attraper : il balaie
   les champs `class="ans"` du rendu de FICHE (`core/items.ts`), et les trois tâches
   d'orthographe montent leur propre champ (`class="ortho-input"`) depuis
   `ui/ortho-taches.ts`, hors de son périmètre. D'où ce gate, qui tient la PARITÉ des trois
   marches de l'escalier sur ce point.

   CE QU'ON ASSÈRE, et pourquoi pas la phrase exacte : l'exigence est que la DÉSIGNATION de
   ce que l'enfant doit produire suive la nature du mot servi (un mot / un verbe), dans les
   trois tâches. « Écris le verbe » est la formulation d'aujourd'hui ; la verrouiller mot
   pour mot ferait rougir la prochaine reformulation sans que rien ne soit cassé.

   POURQUOI AU NIVEAU DU CHAMP, et pas du texte de l'écran : les trois consignes adaptaient
   DÉJÀ leur phrase (« Regarde bien le verbe, puis cache-le et écris-le. »). Un gate qui se
   contenterait du texte visible serait donc passé au vert avec le défaut en place. Le nom
   accessible du champ est le seul endroit où il se voyait — et c'est tout ce qu'entend un
   lecteur d'écran qui parcourt les champs d'une page (touche F sous NVDA/JAWS).

   Le balayage est piloté par `ORDRE_MODES` : une quatrième marche ajoutée à l'escalier
   entre d'elle-même dans le gate.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { addOrGetMot, emptyOrthoState } from '../src/core/orthographe/store';
import { ORDRE_MODES } from '../src/core/orthographe/runner';
import { expanseVerbe } from '../src/core/orthographe/verbes';
import { initTts } from '../src/ui/tts';
import { monterTacheOrtho, nettoyerTaches } from '../src/ui/ortho-taches';
import type { MotOrtho, ModeOrtho, VerbeConfig } from '../src/core/orthographe/types';
import type { FormesConjuguees, VerbTense } from '../src/data/francais/verbs-lookup';

/* ---------- Appareil : une voix de synthèse, stubée EXPLICITEMENT ----------
   `dicteeDisponible()` relit `speechSynthesis.getVoices()`, dont le contenu peut arriver
   de façon asynchrone : on ne laisse pas le gate dépendre de cette course (ni des voix
   SAPI de la machine hôte). Les trois tâches sont montées avec la voix disponible, l'état
   le plus riche — c'est celui où les boutons « Écouter » existent et où la dictée se
   déclenche toute seule. */
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
		cancel: () => {},
		speak: () => {},
	};
	(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
		UtteranceStub;
	initTts();
}

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	nettoyerTaches(); // pas de mot d'un test précédent à retracer au resize
	document.body.innerHTML = '';
	installerVoix();
});

/* ---------- Les deux natures de mot servies par l'escalier ---------- */
/** Mot ordinaire de la banque. */
const motSimple = (): MotOrtho => addOrGetMot(emptyOrthoState(), { mot: 'cheval' });

/** Cible VERBE (#261), fabriquée par la vraie expansion d'un verbe de liste : c'est elle
    qui pose le `contexte` (pronom + complément) dont dépend la nature annoncée. */
function cibleVerbe(): MotOrtho {
	const cfg: VerbeConfig = {
		kind: 'verbe',
		infinitif: 'manger',
		pronoms: [2], // « il »
		temps: ['present'],
	};
	const formes: FormesConjuguees = ['mange', 'manges', 'mange', 'mangeons', 'mangez', 'mangent'];
	const [cible] = expanseVerbe(
		cfg,
		new Map<VerbTense, FormesConjuguees>([['present', formes]]),
		Date.now(),
	);
	return cible;
}

/* ---------- Montage d'une tâche sur un hôte quelconque ---------- */
/* Ce que #640 a rendu possible : les trois rendus ne connaissent plus que leur mot et leur
   hôte, tout le reste remontant par rappels. On les monte donc sans le parcours ni la
   révision — ni feuille `#sheets`, ni état de module à préparer. */
function monter(mode: ModeOrtho, word: MotOrtho): HTMLElement {
	const hote = document.createElement('div');
	document.body.appendChild(hote);
	monterTacheOrtho(mode, word, {
		hote,
		cadre: 'ortho-run',
		dispoDictee: true,
		essaisAvantCorrection: 1,
		onReussite: () => {},
		onEchec: () => {},
		onCorrection: () => {},
	});
	return hote;
}

/* ---------- Lecture du nom accessible ---------- */
/** Nom accessible d'un élément, dans l'ordre de résolution des lecteurs d'écran :
    `aria-labelledby`, puis `aria-label`, puis le `<label>` associé, puis `title` /
    `placeholder`. On ne fige donc pas l'ATTRIBUT employé aujourd'hui — un champ qui
    passerait à un vrai `<label>` visible garderait ce gate au vert. */
function nomAccessible(el: Element): string {
	const refs = el.getAttribute('aria-labelledby');
	if (refs) {
		const textes = refs
			.split(/\s+/)
			.map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
			.filter(Boolean);
		if (textes.length) return textes.join(' ');
	}
	const direct = el.getAttribute('aria-label')?.trim();
	if (direct) return direct;
	const pourId = el.getAttribute('id');
	const associe =
		[...el.ownerDocument.querySelectorAll('label')].find(
			(l) => pourId && l.getAttribute('for') === pourId,
		) ?? el.closest('label');
	const texteLabel = associe?.textContent?.trim();
	if (texteLabel) return texteLabel;
	return (el.getAttribute('title') ?? el.getAttribute('placeholder') ?? '').trim();
}

/** Les champs de saisie d'une tâche (le champ d'orthographe est un `type="password"`
    démasqué, cf. `TEXT_ANSWER_INPUT_ATTRS` : on ne filtre donc pas sur le type, sauf les
    champs cachés, qui ne s'annoncent pas). */
const champs = (hote: HTMLElement): HTMLInputElement[] => [
	...hote.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])'),
];

/** Ce qui, dans une tâche, DÉSIGNE à l'enfant ce qu'il doit produire, tel qu'un lecteur
    d'écran l'annonce : le nom accessible du champ quand la tâche en offre un, sinon le
    texte annoncé de la tâche (les tuiles n'ont pas de champ — leur cible est nommée par la
    consigne et par le titre du mot en construction).

    La phrase à trou d'une cible verbe (`.ortho-contexte`) est ÉCARTÉE : identique dans les
    trois tâches, c'est l'énoncé à compléter, pas la désignation de la cible. Sans cette
    exclusion, le gate se contenterait du « le verbe à écrire » que cette phrase porte pour
    les lecteurs d'écran, et laisserait passer une consigne de tuiles figée. */
function designationCible(hote: HTMLElement): string {
	const saisie = champs(hote)[0];
	if (saisie) return nomAccessible(saisie);
	const copie = hote.cloneNode(true) as HTMLElement;
	copie.querySelectorAll('.ortho-contexte').forEach((p) => p.remove());
	return (copie.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('Parité des trois tâches d’orthographe : la cible est désignée selon sa nature', () => {
	it('le balayage couvre toutes les marches de l’escalier (garde contre un test à vide)', () => {
		expect([...ORDRE_MODES]).toEqual(['tuiles', 'motCache', 'dictee']);
	});

	it.each([...ORDRE_MODES])('%s : un mot ordinaire est désigné comme un MOT', (mode) => {
		const designation = designationCible(monter(mode, motSimple()));
		expect(designation).toMatch(/mot/i);
		expect(designation).not.toMatch(/verbe/i);
	});

	it.each([...ORDRE_MODES])('%s : une cible verbe est désignée comme un VERBE', (mode) => {
		expect(designationCible(monter(mode, cibleVerbe()))).toMatch(/verbe/i);
	});

	it.each([...ORDRE_MODES])(
		'%s : la désignation SUIT la nature du mot, rien n’est figé',
		(mode) => {
			// Le symptôme exact du défaut, indépendamment de toute formulation : la même phrase
			// annoncée pour un mot et pour un verbe.
			expect(designationCible(monter(mode, motSimple()))).not.toBe(
				designationCible(monter(mode, cibleVerbe())),
			);
		},
	);

	it.each([...ORDRE_MODES])(
		'%s : c’est le CHAMP lui-même qui porte la nature, pas seulement la consigne',
		(mode) => {
			// Le point précis où le défaut vivait : la consigne de `renderMotCache` disait déjà
			// « Regarde bien le verbe, … » pendant que son champ annonçait « Écris le mot ». Un
			// gate posé sur le texte de l'écran serait resté vert.
			for (const champ of champs(monter(mode, cibleVerbe()))) {
				expect(nomAccessible(champ), `champ « ${champ.id} » sur une cible verbe`).toMatch(/verbe/i);
			}
			for (const champ of champs(monter(mode, motSimple()))) {
				expect(nomAccessible(champ), `champ « ${champ.id} » sur un mot ordinaire`).not.toMatch(
					/verbe/i,
				);
			}
		},
	);

	it('témoin : les tâches qui écrivent offrent bien un champ à nommer', () => {
		// Sans ce témoin, le test ci-dessus pourrait devenir VIDE (plus aucun champ trouvé)
		// sans que personne ne le voie : il balaie les champs de la tâche, et une tâche sans
		// champ le satisfait pour rien. Les tuiles, elles, se jouent aujourd'hui sans champ —
		// leur cible se nomme dans le texte annoncé, ce que couvrent les tests précédents. On
		// n'exige donc PAS qu'elles n'en aient aucun (un jour, une saisie de repli au clavier
		// serait un progrès) : on exige que les tâches qui écrivent aient le leur, et une seule.
		expect(champs(monter('motCache', motSimple()))).toHaveLength(1);
		expect(champs(monter('dictee', motSimple()))).toHaveLength(1);
	});

	it('témoin de discriminance : ce gate REFUSE l’ancien libellé figé', () => {
		// Sans ce témoin, rien ne dit que les assertions ci-dessus attrapent le défaut qu'elles
		// visent. On rejoue donc l'état d'AVANT la correction — le champ d'une cible verbe
		// annonçant « Écris le mot » — et on exige que la lecture du gate le rejette, alors même
		// que la consigne de la tâche, elle, parle bien du verbe.
		const hote = monter('motCache', cibleVerbe());
		const saisie = champs(hote)[0];
		expect(hote.textContent ?? '').toMatch(/verbe/i); // la consigne était déjà correcte
		saisie.setAttribute('aria-label', 'Écris le mot'); // le libellé figé d'avant #640
		expect(nomAccessible(saisie)).not.toMatch(/verbe/i);
		// … et la désignation redevient identique à celle d'un mot ordinaire : c'est
		// exactement ce que le test « rien n'est figé » refuse.
		expect(designationCible(hote)).toBe(designationCible(monter('motCache', motSimple())));
	});

	it('aucun champ de tâche ne reste SANS nom accessible', () => {
		// Reprise de la règle de #577 sur ce périmètre-ci : un `<input>` sans nom est annoncé
		// « zone de saisie », classé `critical` par axe. C'est la moitié que le nom « juste »
		// ne couvre pas — une branche neuve qui oublierait l'attribut.
		for (const mode of ORDRE_MODES) {
			for (const word of [motSimple(), cibleVerbe()]) {
				for (const champ of champs(monter(mode, word))) {
					expect(nomAccessible(champ), `${mode} / ${word.mot}`).not.toBe('');
				}
			}
		}
	});
});
