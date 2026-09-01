/* ============================================================
   Panneau d'étayage (src/ui/etayage-panneau.ts) — ce qui se VOIT et ce qui s'ENTEND
   d'un pas du déroulé (#490, #501).

   POURQUOI CE GATE EXISTE.
   La phrase d'un pas peut contenir un grand nombre (« Je relis tout : … = 48 205. »).
   Deux exigences opposées portent sur ce même texte :
   - à l'ÉCRAN, il doit rester GROUPÉ — c'est la graphie de tous les énoncés, et c'est
     exactement ce que #501 est venu rétablir ailleurs dans l'appli ;
   - à l'OREILLE, le séparateur n'a rien à faire : ces régions sont lues par le lecteur
     d'écran de l'enfant, une pipeline que le projet ne maîtrise pas, et on sait déjà
     qu'au moins un moteur épelle les groupes au lieu de lire un entier (c'est la raison
     d'être du recollage de la synthèse vocale, cf. core/nombres.ts).
   Un seul élément ne peut pas porter les deux : le paragraphe visible est donc masqué
   aux technologies d'assistance et une copie `.sr-only` recollée sert de région live.
   La correction est ainsi à deux faces, et chaque face peut casser SANS l'autre : ne
   garder que « pas de séparateur dans la région live » laisserait dégrader l'affichage
   en « 48205 » sans un test rouge — l'inverse exact de #501.

   POURQUOI ICI ET PAS EN PLAYWRIGHT. `ouvrirEtayage` se monte tel quel en happy-dom :
   il reçoit sa leçon en paramètre, son déroulé est un exemple FIXE (aucun aléa, donc
   aucun flake), et ses dépendances de navigateur dégradent proprement
   (`dicterConsigne`/`stopTts` sont gardés par `typeof speechSynthesis`). Mesuré : le
   panneau s'ouvre, avance, se ferme et se réouvre sans un seul bouchon.
   CE QU'IL NE PROUVE PAS : que le lecteur d'écran lit effectivement la région (aucun
   test ne peut le prouver), ni la mécanique d'écran du panneau (focus, défilement,
   bouton « Écouter ») — c'est l'objet des specs e2e du panneau.
   ============================================================ */
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { ouvrirEtayage } from '../src/ui/etayage-panneau';
import { moteurEtayage } from '../src/ui/etayage-visuels';
import { etayagePour } from '../src/core/etayage';
import { getLessonById } from '../src/core/catalog';
import type { LessonDef } from '../src/core/catalog';
import type { PasEtayage } from '../src/core/etayage-deroule';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';

/* Séparateurs désignés par leur point de code, jamais écrits en clair (convention de
   core/nombres.ts : invisibles et fragiles à l'édition). */
const U202F = String.fromCharCode(0x202f); // espace fine insécable (séparateur de milliers)
const U00A0 = String.fromCharCode(0x00a0); // espace insécable

/* Oracle INDÉPENDANT du recollage : on retire le séparateur SEULEMENT entre deux
   chiffres, comme le veut la règle — et non tous les espaces insécables du texte, qui
   emporterait une espace typographique légitime. Réécrit ici plutôt qu'importé de
   `sansSeparateurMilliers` : un test qui appelle la fonction qu'il garde ne garde rien. */
const SEP = new RegExp(`([0-9])[${U202F}${U00A0}]([0-9])`, 'g');
const recolleAttendu = (t: string): string => t.replace(SEP, '$1$2');

const A_SEPARATEUR = new RegExp(`[0-9][${U202F}${U00A0}][0-9]`); // sans /g : `test` est sans état
const aUnSeparateur = (t: string): boolean => A_SEPARATEUR.test(t);

/* Pas du déroulé réellement montré par le panneau : même source que lui
   (`etayagePour` → `moteurEtayage`), donc l'attendu suit le contenu de la leçon au lieu
   de le recopier. */
function pasDe(lesson: LessonDef, niveau: 'ce2' | 'cm1'): PasEtayage[] {
	const contenu = etayagePour(lesson, niveau);
	expect(contenu?.exemple, `${lesson.id} : pas d'exemple à dérouler`).toBeDefined();
	return moteurEtayage(contenu!.exemple!).deroule.pas;
}

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	expect(l, `leçon absente du catalogue : ${id}`).toBeDefined();
	return l!;
};

const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

/** Régions réellement ANNONCÉES du panneau : porteuses de `role="status"` ou d'un
    `aria-live`, et pas enterrées sous un `aria-hidden` (un contenu masqué n'est pas lu).
    Décrit par le RÔLE et non par des ids, pour survivre à un renommage. */
function regionsAnnoncees(): HTMLElement[] {
	const overlay = q('#etayageOverlay');
	if (!overlay) return [];
	return [...overlay.querySelectorAll<HTMLElement>('[role="status"], [aria-live]')].filter(
		(el) => !el.closest('[aria-hidden="true"]'),
	);
}

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	document.body.innerHTML = '';
});

/* Le panneau porte un état de MODULE (« déjà ouvert ») : un test qui échoue en le
   laissant ouvert ferait échouer les suivants pour une mauvaise raison. On referme donc
   toujours, y compris après un échec. */
afterEach(() => {
	q<HTMLButtonElement>('.aide-close')?.click();
	document.body.innerHTML = '';
});

/* Les deux leçons dont le déroulé écrit un nombre à 5 chiffres : c'est là, et seulement
   là, que les deux graphies divergent. */
const LECONS_A_GRAND_NOMBRE = ['num-decompose-10000', 'num-decompose-multiplicative'];

describe('Panneau d’étayage — la phrase d’un pas, à l’œil et à l’oreille (#501)', () => {
	it.each(LECONS_A_GRAND_NOMBRE)(
		'%s (CM1) : le déroulé écrit bien un grand nombre groupé (sinon ce fichier ne prouve rien)',
		(id) => {
			const phrases = pasDe(lecon(id), 'cm1').map((p) => p.phrase);
			expect(phrases.length).toBeGreaterThan(1);
			expect(phrases.some(aUnSeparateur), `aucune phrase groupée dans ${id}`).toBe(true);
		},
	);

	it.each(LECONS_A_GRAND_NOMBRE)('%s (CM1) : à l’ouverture, deux copies et deux graphies', (id) => {
		const lesson = lecon(id);
		const pas = pasDe(lesson, 'cm1');
		ouvrirEtayage({ lesson, niveau: 'cm1' });

		const vu = q('#etayPhrase');
		const lu = q('#etayPhraseLu');
		expect(vu, 'paragraphe visible absent').not.toBeNull();
		expect(lu, 'région lue absente').not.toBeNull();
		// Critère 1 — l'ŒIL garde la graphie des énoncés, mot pour mot.
		expect(vu!.textContent).toBe(pas[0].phrase);
		// … et il est masqué aux technologies d'assistance, sans quoi le séparateur
		// repartirait à l'oreille par ce chemin.
		expect(vu!.getAttribute('aria-hidden')).toBe('true');
		// Critère 2 — l'OREILLE reçoit le même texte, recollé.
		expect(lu!.textContent).toBe(recolleAttendu(pas[0].phrase));
		expect(lu!.getAttribute('role')).toBe('status');
	});

	it.each(LECONS_A_GRAND_NOMBRE)(
		'%s (CM1) : les deux copies restent synchronisées à CHAQUE pas',
		(id) => {
			const lesson = lecon(id);
			const pas = pasDe(lesson, 'cm1');
			ouvrirEtayage({ lesson, niveau: 'cm1' });
			const suivant = q<HTMLButtonElement>('#etaySuivant')!;

			let vusGroupes = 0;
			for (let i = 0; i < pas.length; i++) {
				// Le dernier « Suivant » FERME le panneau : on n'avance que jusqu'au dernier pas.
				if (i > 0) suivant.click();
				const vu = q('#etayPhrase')!.textContent!;
				const lu = q('#etayPhraseLu')!.textContent!;
				const ou = `${id}, pas ${i + 1}/${pas.length}`;
				expect(vu, ou).toBe(pas[i].phrase);
				expect(lu, ou).toBe(recolleAttendu(pas[i].phrase));
				if (aUnSeparateur(vu)) vusGroupes++;
			}
			// Un pas au moins portait un nombre groupé : la synchronisation a été éprouvée là
			// où les deux textes DIFFÈRENT, pas seulement là où ils sont identiques.
			expect(vusGroupes, `${id} : aucun pas groupé rencontré`).toBeGreaterThan(0);
		},
	);

	it.each(LECONS_A_GRAND_NOMBRE)(
		'%s (CM1) : aucune région annoncée du panneau ne porte de séparateur, à aucun pas',
		(id) => {
			// Formulation par le RÔLE plutôt que par les ids : elle survit à un renommage et
			// couvre une région live AJOUTÉE plus tard sans qu'on y pense (le compteur d'étapes
			// est déjà pris dedans, via son `aria-live`).
			const lesson = lecon(id);
			const pas = pasDe(lesson, 'cm1');
			ouvrirEtayage({ lesson, niveau: 'cm1' });
			const suivant = q<HTMLButtonElement>('#etaySuivant')!;

			expect(regionsAnnoncees().length, 'aucune région annoncée trouvée').toBeGreaterThan(0);
			for (let i = 0; i < pas.length; i++) {
				if (i > 0) suivant.click();
				for (const region of regionsAnnoncees()) {
					const texte = region.textContent ?? '';
					const ou = `${id}, pas ${i + 1} — région #${region.id || region.className}`;
					expect(texte, ou).not.toContain(U202F);
					expect(texte, ou).not.toContain(U00A0);
				}
			}
		},
	);

	it('la première phrase est annoncée à l’ouverture par la région RECOLLÉE, pas la visible', () => {
		// Une région live préremplie n'est en général pas annoncée : c'est `aria-describedby`
		// du dialogue qui fait entendre la première phrase (décision antérieure, documentée
		// dans le module). Il doit donc désigner la copie recollée — sinon le tout premier pas,
		// le seul que TOUS les enfants entendent, repart avec ses séparateurs.
		const lesson = lecon('num-decompose-10000');
		ouvrirEtayage({ lesson, niveau: 'cm1' });
		const decrit = q('.etay-modal')!.getAttribute('aria-describedby') ?? '';
		expect(decrit.split(/\s+/)).toContain('etayPhraseLu');
		expect(decrit.split(/\s+/)).not.toContain('etayPhrase');
	});

	it('une leçon sans grand nombre : les deux copies sont simplement identiques', () => {
		// Garde-fou du gate lui-même : le recollage ne doit pas « faire quelque chose »
		// partout. Sur un déroulé sans nombre à 5 chiffres, les deux textes coïncident.
		const lesson = lecon('calc-addition-posee');
		const pas = pasDe(lesson, 'ce2');
		expect(pas.length).toBeGreaterThan(0);
		expect(pas.some((p) => aUnSeparateur(p.phrase))).toBe(false); // le témoin est bien sans séparateur
		ouvrirEtayage({ lesson, niveau: 'ce2' });
		expect(q('#etayPhraseLu')!.textContent).toBe(q('#etayPhrase')!.textContent);
	});
});
