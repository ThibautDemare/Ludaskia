/* ============================================================
   Runner « ranger une suite » — DIAGNOSTIC de la suite inversée et résumé de
   correction (ui/lecon-ordre.ts, #448). Trois fonctions PURES, extraites du runner
   précisément pour être éprouvées sans DOM :
     - `estSuiteInversee` : la rangée posée est-elle l'exact miroir de la bonne ?
     - `messageInversion` : le message ciblé (ou `null` si ce n'est pas une inversion) ;
     - `resumeCorrection` : le texte annoncé à un lecteur d'écran (région live).

   Pourquoi un fichier dédié : ces fonctions vivent dans `ui/`, pas dans les données
   de la leçon (tests/ranger-entiers.test.ts). Et pourquoi des tests du tout : la spec
   e2e traverse ce chemin par accident (l'enfant y pose toujours en croissant, donc
   c'est l'inverse exact quand le sens tiré est décroissant) mais n'inspecte jamais le
   message — une régression du diagnostic ou de ses gardes ne casserait rien.

   Attendus DÉRIVÉS du besoin pédagogique, pas du code : au CE2, ranger à l'envers est
   une erreur de RÉFLEXE (on range du plus petit au plus grand par habitude), pas une
   erreur de comparaison ; le message doit donc nommer le sens que l'enfant a
   RÉELLEMENT produit. Les formulations ne sont volontairement PAS verrouillées au
   caractère près (elles relèvent du pédagogue) : on éprouve ce que le message doit
   AFFIRMER, et surtout ce qu'il ne doit jamais affirmer.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { estSuiteInversee, messageInversion, resumeCorrection } from '../src/ui/lecon-ordre';

/* Séries de travail : valeurs distinctes, comme celles que produisent les deux leçons
   de rangement (l'alphabétique #108 et les nombres #448). */
const CROISSANT = ['95', '98', '102', '104']; // consigne « du plus petit au plus grand »
const DECROISSANT = ['104', '102', '98', '95']; // consigne « du plus grand au plus petit »
const MOTS = ['abricot', 'banane', 'cerise', 'datte'];

const inverse = (s: readonly string[]) => [...s].reverse();

/* Les deux sens possibles, tels qu'un enfant les décrit — c'est ce vocabulaire que le
   message doit employer, et l'un des deux EXCLUT l'autre. */
const PETIT_VERS_GRAND = 'du plus petit au plus grand';
const GRAND_VERS_PETIT = 'du plus grand au plus petit';

describe('estSuiteInversee — prédicat d’inversion (#448)', () => {
	it('miroir exact d’une suite de 4 valeurs ⇒ vrai (nombres et mots)', () => {
		expect(estSuiteInversee(inverse(CROISSANT), CROISSANT)).toBe(true);
		expect(estSuiteInversee(inverse(DECROISSANT), DECROISSANT)).toBe(true);
		expect(estSuiteInversee(inverse(MOTS), MOTS)).toBe(true);
	});

	it('suite JUSTE ⇒ faux (on ne diagnostique pas une réussite comme une inversion)', () => {
		expect(estSuiteInversee(CROISSANT, CROISSANT)).toBe(false);
		expect(estSuiteInversee(MOTS, MOTS)).toBe(false);
	});

	it('permutation qui n’est PAS le miroir exact ⇒ faux', () => {
		// Deux voisins échangés : c'est une erreur de comparaison, pas de sens — servir le
		// message d'inversion ici enseignerait la mauvaise chose.
		expect(estSuiteInversee(['98', '95', '102', '104'], CROISSANT)).toBe(false);
		// Rotation, et miroir partiel (les deux extrémités seules sont échangées).
		expect(estSuiteInversee(['98', '102', '104', '95'], CROISSANT)).toBe(false);
		expect(estSuiteInversee(['104', '98', '102', '95'], CROISSANT)).toBe(false);
	});

	it('longueurs différentes ⇒ faux (rangée incomplète, ou réponse absente)', () => {
		expect(estSuiteInversee(['104', '102', '98'], CROISSANT)).toBe(false);
		expect(estSuiteInversee([...inverse(CROISSANT), '7'], CROISSANT)).toBe(false);
		// Le runner passe `[]` quand le widget n'expose pas de réponse posée : aucun
		// diagnostic possible, et surtout aucun plantage.
		expect(estSuiteInversee([], CROISSANT)).toBe(false);
	});

	it('moins de 2 éléments ⇒ faux (une suite d’un seul élément n’a pas de sens)', () => {
		expect(estSuiteInversee(['95'], ['95'])).toBe(false);
		expect(estSuiteInversee([], [])).toBe(false);
	});
});

describe('messageInversion — nommer le sens RÉELLEMENT produit (#448)', () => {
	it('nombres : consigne décroissante, enfant croissant ⇒ le message dit « du plus petit au plus grand »', () => {
		const msg = messageInversion(inverse(DECROISSANT), DECROISSANT, 'nombres');
		expect(msg).not.toBeNull();
		expect(msg!).toContain(PETIT_VERS_GRAND);
		expect(msg!).not.toContain(GRAND_VERS_PETIT);
	});

	it('nombres : consigne croissante, enfant décroissant ⇒ le message dit « du plus grand au plus petit »', () => {
		// Le couple avec le test précédent est le cœur : un diagnostic qui lirait la
		// CONSIGNE (ou qui figerait un sens) passerait l'un et raterait l'autre.
		const msg = messageInversion(inverse(CROISSANT), CROISSANT, 'nombres');
		expect(msg).not.toBeNull();
		expect(msg!).toContain(GRAND_VERS_PETIT);
		expect(msg!).not.toContain(PETIT_VERS_GRAND);
	});

	it('mots (nature absente ou « mots ») : message alphabétique, jamais un sens numérique', () => {
		for (const nature of [undefined, 'mots'] as const) {
			const msg = messageInversion(inverse(MOTS), MOTS, nature);
			expect(msg, `nature ${nature}`).not.toBeNull();
			// On parle de MOTS à un enfant qui a des mots sous les yeux…
			expect(msg!).toContain('mots');
			// …et « plus petit / plus grand » n'a aucun sens pour une liste alphabétique.
			expect(msg!).not.toContain(PETIT_VERS_GRAND);
			expect(msg!).not.toContain(GRAND_VERS_PETIT);
			expect(msg!).not.toContain('nombre');
		}
		// La nature explicite « mots » ne dit rien d'autre que son absence.
		expect(messageInversion(inverse(MOTS), MOTS, 'mots')).toBe(
			messageInversion(inverse(MOTS), MOTS),
		);
	});

	it('pas une inversion ⇒ null (rien de ciblé à dire)', () => {
		for (const nature of [undefined, 'mots', 'nombres'] as const) {
			expect(messageInversion(CROISSANT, CROISSANT, nature), `juste / ${nature}`).toBeNull();
			expect(
				messageInversion(['98', '95', '102', '104'], CROISSANT, nature),
				`voisins échangés / ${nature}`,
			).toBeNull();
			expect(
				messageInversion(['104', '102'], CROISSANT, nature),
				`incomplet / ${nature}`,
			).toBeNull();
			expect(messageInversion([], CROISSANT, nature), `sans réponse / ${nature}`).toBeNull();
			expect(messageInversion(['95'], ['95'], nature), `un seul élément / ${nature}`).toBeNull();
		}
	});

	it('nombres illisibles : repli GÉNÉRIQUE, sans affirmer un sens faux', () => {
		// Nature « nombres » mais libellés non numériques (une future variante en mots-nombres,
		// ou un libellé mis en forme) : le sens ne peut PAS être lu. Mieux vaut un message
		// vague qu'un message précis et faux.
		const lettres = ['un', 'deux', 'trois', 'quatre'];
		const msg = messageInversion(inverse(lettres), lettres, 'nombres');
		expect(msg).not.toBeNull();
		expect(msg!).not.toContain(PETIT_VERS_GRAND);
		expect(msg!).not.toContain(GRAND_VERS_PETIT);
	});

	it('extrémités de MÊME valeur : repli générique (aucun sens déductible)', () => {
		// « 07 » et « 7 » se lisent 7 : les deux bouts de la suite posée valent pareil, donc
		// ni croissant ni décroissant. Le message ne doit pas trancher au hasard.
		const ordre = ['7', '5', '07'];
		const msg = messageInversion(inverse(ordre), ordre, 'nombres');
		expect(msg).not.toBeNull();
		expect(msg!).not.toContain(PETIT_VERS_GRAND);
		expect(msg!).not.toContain(GRAND_VERS_PETIT);
	});
});

describe('resumeCorrection — ce qu’entend un lecteur d’écran (#448)', () => {
	it('réussite : un verdict positif, et surtout PAS la révélation du bon rangement', () => {
		const r = resumeCorrection(CROISSANT, CROISSANT, 'nombres', true);
		expect(r.trim().length).toBeGreaterThan(0);
		// Réciter la solution à un enfant qui vient de la trouver est du bruit.
		expect(r).not.toContain(CROISSANT.join(' ; '));
		expect(r).not.toContain('envers');
		// Même sortie quelle que soit la nature : rien à accorder quand c'est juste.
		expect(resumeCorrection(MOTS, MOTS, undefined, true)).toBe(r);
	});

	it('inversion : reprend EXACTEMENT le diagnostic, plus le bon rangement', () => {
		for (const ordre of [CROISSANT, DECROISSANT]) {
			const propose = inverse(ordre);
			const r = resumeCorrection(propose, ordre, 'nombres', false);
			// Le diagnostic n'est jamais reformulé une 2ᵉ fois : c'est le MÊME texte.
			const cible = messageInversion(propose, ordre, 'nombres');
			expect(cible).not.toBeNull();
			expect(r).toContain(cible!);
			// …et le bon rangement reste annoncé (l'information la plus utile).
			expect(r).toContain(ordre.join(' ; '));
		}
	});

	it('autre erreur : pas de diagnostic d’inversion, mais le bon rangement annoncé', () => {
		const r = resumeCorrection(['98', '95', '102', '104'], CROISSANT, 'nombres', false);
		expect(r).not.toContain(PETIT_VERS_GRAND);
		expect(r).not.toContain(GRAND_VERS_PETIT);
		expect(r).toContain(CROISSANT.join(' ; '));
		// Les trois issues sont bien DISTINGUÉES (sans dépendre d'une formulation) :
		// erreur de comparaison ≠ erreur de sens ≠ réussite.
		expect(r).not.toBe(resumeCorrection(inverse(CROISSANT), CROISSANT, 'nombres', false));
		expect(r).not.toBe(resumeCorrection(CROISSANT, CROISSANT, 'nombres', true));
	});

	it('séparateur accordé à la nature : « ; » pour les nombres, « , » pour les mots', () => {
		// Lu à voix haute, un « ; » marque une pause ; une virgule entre deux nombres se
		// lirait comme une virgule DÉCIMALE (« 95, 98 » → « 95,98 »).
		const nombres = resumeCorrection([], CROISSANT, 'nombres', false);
		expect(nombres).toContain(CROISSANT.join(' ; '));
		expect(nombres).not.toContain(CROISSANT.join(', '));

		const mots = resumeCorrection([], MOTS, undefined, false);
		expect(mots).toContain(MOTS.join(', '));
		expect(mots).not.toContain(MOTS.join(' ; '));
	});

	it('sans réponse posée (rangée vide) : annonce quand même le bon rangement, sans planter', () => {
		const r = resumeCorrection([], CROISSANT, 'nombres', false);
		expect(r.trim().length).toBeGreaterThan(0);
		expect(r).toContain(CROISSANT.join(' ; '));
		expect(r).not.toContain('envers'); // aucune inversion à diagnostiquer
	});
});
