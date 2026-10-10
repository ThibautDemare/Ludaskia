/* ============================================================
   Séance partagée (#734, PR 4) — bloc de décision et enchaînement des questions d'un
   runner « une question à la fois » (`src/ui/runner-partage.ts`), montés en happy-dom.

   Ce que le contrat du module promet, et que les dix runners partagent :
   - « Valider » ne note jamais une question laissée sans réponse, sauf « je ne sais pas » ;
     un bouton grisé est expliqué (l'aide), et l'aide cesse d'être sa description dès qu'il
     s'active (sinon elle reste lue sur un bouton actif) ;
   - toucher au widget décoche « je ne sais pas » ;
   - un double appui ne note pas deux fois ; une validation qui lève ne bloque pas la
     question ;
   - après « Valider » : la réponse est notée, puis la question suivante est rendue,
     annoncée sans verdict et focalisée (carte nommée « Question k sur n »), ou la séance
     se termine après la dernière.
   Le rendu propre à chaque format (widget, choix) relève des specs Playwright.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	brancherDecisionPartage,
	decisionPartageHTML,
	enchainerPartage,
	type ReponseRunner,
	type SeanceRunner,
} from '../src/ui/runner-partage';
import { getLessonById } from '../src/core/catalog';
import type { Exercise } from '../src/core/exercise';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

afterEach(() => {
	document.body.innerHTML = '';
});

/* ------------------------------------------------------------------ */
/* brancherDecisionPartage                                             */
/* ------------------------------------------------------------------ */

const VALIDER_ID = 'testValider';

interface Banc {
	root: HTMLElement;
	valider: HTMLButtonElement;
	jnsp: HTMLInputElement;
	aide: HTMLElement;
	/** Rend le widget « répondu » (ou non) aux yeux de la règle d'activation du format. */
	repondre(oui: boolean): void;
	onValider: ReturnType<typeof vi.fn>;
	decision: ReturnType<typeof brancherDecisionPartage>;
}

function monter(onValider: () => void = () => {}): Banc {
	const root = document.createElement('div');
	root.innerHTML = decisionPartageHTML(VALIDER_ID).balisage;
	document.body.appendChild(root);
	let repondu = false;
	const spy = vi.fn(onValider);
	const decision = brancherDecisionPartage(root, {
		validerId: VALIDER_ID,
		repondu: () => repondu,
		onValider: spy,
	});
	const valider = root.querySelector<HTMLButtonElement>(`#${VALIDER_ID}`)!;
	const jnsp = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
	// L'aide est l'élément que « Valider » désigne comme sa description à l'état initial.
	const aide = root.querySelector<HTMLElement>(`#${valider.getAttribute('aria-describedby')}`)!;
	return {
		root,
		valider,
		jnsp,
		aide,
		repondre: (oui) => {
			repondu = oui;
		},
		onValider: spy,
		decision,
	};
}

/** Coche ou décoche « Je ne sais pas » comme le ferait l'enfant (clic sur la case). */
function basculerJnsp(b: Banc): void {
	b.jnsp.click();
}

/** L'état d'accessibilité de « Valider » : actif, décrit par l'aide, aide affichée. */
function etat(b: Banc) {
	const desc = b.valider.getAttribute('aria-describedby');
	return {
		actif: !b.valider.disabled,
		decritParAide: desc !== null && desc.split(/\s+/).includes(b.aide.id),
		aideVisible: !b.aide.hidden,
	};
}
const INACTIF = { actif: false, decritParAide: true, aideVisible: true };
const ACTIF = { actif: true, decritParAide: false, aideVisible: false };

describe('brancherDecisionPartage — « Valider » ne s’active qu’avec une réponse ou « je ne sais pas »', () => {
	it('au montage, sans réponse : désactivé, décrit par l’aide, aide affichée', () => {
		const b = monter();
		expect(b.aide, 'une aide est référencée par « Valider »').toBeTruthy();
		expect(etat(b)).toEqual(INACTIF);
		expect(b.jnsp.checked).toBe(false);
	});

	it('« Valider » désactivé ne note rien', () => {
		// Limite connue : happy-dom ne livre AUCUN `click` à un bouton désactivé, même émis par
		// `dispatchEvent`. Ce test tient donc l'attribut `disabled`, pas la garde
		// `valider.disabled` de l'écouteur (défensive, et invisible ici).
		const b = monter();
		b.valider.click();
		b.valider.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(b.onValider).not.toHaveBeenCalled();
	});

	it('le widget devient répondu, puis maj() : activé, aide masquée ET retirée de la description', () => {
		const b = monter();
		b.repondre(true);
		b.decision.maj();
		expect(etat(b)).toEqual(ACTIF);
		// Et la réponse retirée (rangée vidée…) le regrise, aide revenue.
		b.repondre(false);
		b.decision.maj();
		expect(etat(b)).toEqual(INACTIF);
	});

	it('« Je ne sais pas » coché, sans réponse : activé ; décoché : regrisé', () => {
		const b = monter();
		basculerJnsp(b);
		expect(b.jnsp.checked).toBe(true);
		expect(b.decision.jnsp()).toBe(true);
		expect(etat(b)).toEqual(ACTIF);
		basculerJnsp(b);
		expect(b.decision.jnsp()).toBe(false);
		expect(etat(b)).toEqual(INACTIF);
	});

	it('« Je ne sais pas » coché puis widget touché : la case se décoche, et « Valider » suit la réponse', () => {
		const b = monter();
		basculerJnsp(b);
		// Le geste n'a pas (encore) produit de réponse : la question redevient sans réponse.
		b.decision.widgetTouche();
		expect(b.jnsp.checked).toBe(false);
		expect(b.decision.jnsp()).toBe(false);
		expect(etat(b)).toEqual(INACTIF);

		// Le geste a produit une réponse : case décochée, « Valider » actif pour la réponse.
		basculerJnsp(b);
		b.repondre(true);
		b.decision.widgetTouche();
		expect(b.jnsp.checked).toBe(false);
		expect(etat(b)).toEqual(ACTIF);
	});
});

describe('brancherDecisionPartage — un seul « Valider » par question', () => {
	it('double clic : onValider n’est appelé qu’une fois', () => {
		const b = monter();
		b.repondre(true);
		b.decision.maj();
		b.valider.click();
		b.valider.click();
		expect(b.onValider).toHaveBeenCalledTimes(1);
	});

	it('onValider qui lève : la question n’est pas bloquée, un second clic le rappelle', () => {
		let appels = 0;
		const b = monter(() => {
			appels++;
			if (appels === 1) throw new Error('échec simulé');
		});
		b.repondre(true);
		b.decision.maj();
		// L'erreur peut remonter au clic ou être signalée par le DOM : seul compte ce qui suit.
		const onError = (e: ErrorEvent) => e.preventDefault();
		window.addEventListener('error', onError);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			try {
				b.valider.click();
			} catch {
				/* attendu */
			}
			expect(appels).toBe(1);
			b.valider.click();
			expect(appels, 'second clic après un échec').toBe(2);
			// Le second a réussi : la garde « un seul Valider » s'applique de nouveau.
			b.valider.click();
			expect(appels, 'troisième clic après une réussite').toBe(2);
		} finally {
			window.removeEventListener('error', onError);
			consoleError.mockRestore();
		}
	});
});

/* ------------------------------------------------------------------ */
/* enchainerPartage                                                    */
/* ------------------------------------------------------------------ */

function exercices(n: number): Exercise[] {
	return Array.from({ length: n }, (_, i) => ({
		type: 'text',
		question: `Q${i}`,
		answer: String(i),
	}));
}

interface Seance extends SeanceRunner {
	journal: string[];
	noter: ReturnType<typeof vi.fn> & SeanceRunner['noter'];
	terminer: ReturnType<typeof vi.fn> & SeanceRunner['terminer'];
	annoncer: ReturnType<typeof vi.fn> & SeanceRunner['annoncer'];
}

/** Une séance de `n` questions, la scène montrant une carte `.sprint-stage` (question
 *  courante). `journal` garde l'ordre des appels. */
function seance(n: number): Seance {
	const scene = document.createElement('div');
	scene.innerHTML = '<div class="sprint"><div class="sprint-stage" id="ancienne">Q</div></div>';
	document.body.appendChild(scene);
	const journal: string[] = [];
	const lesson = getLessonById('num-droite-entiers');
	if (!lesson) throw new Error('leçon de test absente du catalogue');
	return {
		lesson,
		mode: undefined,
		niveau: 'ce2',
		exercices: exercices(n),
		scene,
		journal,
		noter: vi.fn((i: number) => journal.push(`noter ${i}`)),
		terminer: vi.fn(() => journal.push('terminer')),
		annoncer: vi.fn((t: string) => journal.push(`annoncer ${t}`)),
	};
}

/** Rend la question suivante comme un runner : nouvelle carte, avec un CHAMP de saisie
 *  (le focus ne doit jamais aller sur lui : le clavier virtuel s'ouvrirait avant la lecture). */
function rendreSuivante(s: Seance): () => void {
	return () => {
		s.journal.push('rendre');
		s.scene.innerHTML =
			'<div class="sprint"><div class="sprint-stage" id="nouvelle"><input id="champ" type="text"></div></div>';
	};
}

const JUSTE: ReponseRunner = { statut: 'juste', saisie: '4', erreurs: [] };
const FAUX: ReponseRunner = {
	statut: 'faux',
	saisie: '5',
	erreurs: [{ text: 'Q', donnee: '5', attendue: '4', lessonId: 'num-droite-entiers' }],
};

describe('enchainerPartage — après la dernière question', () => {
	it('note la réponse PUIS termine, sans rendre de question suivante', () => {
		const s = seance(3);
		const rendre = vi.fn(rendreSuivante(s));
		enchainerPartage(s, 2, JUSTE, rendre);
		expect(s.noter).toHaveBeenCalledTimes(1);
		expect(s.noter).toHaveBeenCalledWith(2, JUSTE);
		expect(s.terminer).toHaveBeenCalledTimes(1);
		expect(rendre).not.toHaveBeenCalled();
		// La dernière réponse doit être dans le résultat figé : notée AVANT de terminer.
		expect(s.journal.indexOf('noter 2')).toBeLessThan(s.journal.indexOf('terminer'));
	});

	it('séance d’une seule question : la première est aussi la dernière', () => {
		const s = seance(1);
		const rendre = vi.fn(rendreSuivante(s));
		enchainerPartage(s, 0, FAUX, rendre);
		expect(s.noter).toHaveBeenCalledWith(0, FAUX);
		expect(s.terminer).toHaveBeenCalledTimes(1);
		expect(rendre).not.toHaveBeenCalled();
	});
});

describe('enchainerPartage — question suivante', () => {
	it('note la question k, rend la suivante, ne termine pas', () => {
		const s = seance(3);
		const rendre = vi.fn(rendreSuivante(s));
		enchainerPartage(s, 0, JUSTE, rendre);
		expect(s.noter).toHaveBeenCalledWith(0, JUSTE);
		expect(rendre).toHaveBeenCalledTimes(1);
		expect(s.terminer).not.toHaveBeenCalled();
	});

	it('avant-dernière question (index 1 sur 3) : ce n’est pas la fin', () => {
		const s = seance(3);
		const rendre = vi.fn(rendreSuivante(s));
		enchainerPartage(s, 1, JUSTE, rendre);
		expect(s.terminer).not.toHaveBeenCalled();
		expect(rendre).toHaveBeenCalledTimes(1);
		expect(s.annoncer).toHaveBeenCalledWith('Réponse enregistrée. Question 3 sur 3.');
	});

	it('annonce exacte « Réponse enregistrée. Question 2 sur 5. », identique juste ou faux', () => {
		const a = seance(5);
		enchainerPartage(a, 0, JUSTE, rendreSuivante(a));
		expect(a.annoncer).toHaveBeenCalledTimes(1);
		expect(a.annoncer).toHaveBeenCalledWith('Réponse enregistrée. Question 2 sur 5.');

		// Aucun verdict avant la fin (critère 17) : l'annonce ne dépend pas du statut.
		document.body.innerHTML = '';
		const f = seance(5);
		enchainerPartage(f, 0, FAUX, rendreSuivante(f));
		expect(f.annoncer.mock.calls).toEqual(a.annoncer.mock.calls);
	});

	it('la NOUVELLE carte est nommée « Question k sur n », groupée, et reçoit le focus (pas le champ)', () => {
		const s = seance(4);
		enchainerPartage(s, 1, JUSTE, rendreSuivante(s));
		const stage = s.scene.querySelector<HTMLElement>('.sprint-stage')!;
		expect(stage.id, 'la carte rendue par rendreSuivante').toBe('nouvelle');
		expect(stage.getAttribute('role')).toBe('group');
		expect(stage.getAttribute('aria-label')).toBe('Question 3 sur 4');
		expect(document.activeElement).toBe(stage);
		expect(document.activeElement?.id).not.toBe('champ');
	});

	it('la réponse est notée AVANT que la question suivante ne soit rendue', () => {
		// Contrat : « note la réponse, puis rend la question suivante ». Un rendu qui lève ne
		// doit pas faire perdre une réponse déjà donnée.
		const s = seance(3);
		enchainerPartage(s, 0, JUSTE, rendreSuivante(s));
		expect(s.journal.indexOf('noter 0')).toBeGreaterThanOrEqual(0);
		expect(s.journal.indexOf('noter 0')).toBeLessThan(s.journal.indexOf('rendre'));
	});
});
