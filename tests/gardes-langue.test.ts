/* ============================================================
   Les DÉTECTEURS de `gardes-langue.ts`, éprouvés sur des phrases fabriquées.

   Les gates qui les emploient (`etayage-redige`, `langue-enfant`) sont verts parce que le
   contenu réel respecte déjà les deux règles. C'est exactement la situation où un
   détecteur devenu trop permissif ne se voit pas : il laisse tout passer, les gates
   restent verts, et personne n'apprend que le filet est troué. On joue donc chaque
   détecteur sur ce qu'il DOIT attraper et sur ce qu'il ne doit PAS signaler — les seconds
   comptent autant : c'est la moitié du contrat que la moindre règle élargie casserait.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { vouvoiements, apostrophesCourbes, signesCites } from './gardes-langue';

describe('vouvoiements — le vouvoiement s’adresse, la personne grammaticale se cite', () => {
	it('attrape un vrai vouvoiement, sous ses tournures courantes', () => {
		/* Les six formes qu'un texte adulte prend naturellement : pronom sujet, impératif
		   pronominal, complément, possessif pluriel, possessif singulier, subordonnée. Si le
		   détecteur en ratait une, la règle ne tiendrait que sur la formulation qu'on a eue en
		   tête en l'écrivant. */
		const aAttraper = [
			'Vous pouvez relire la phrase ensemble.',
			'Aidez-vous du tableau si besoin.',
			'Cela vous aidera à trouver le sujet.',
			'Notez vos réponses avant de vérifier.',
			'Expliquez la règle à votre enfant.',
			'Si vous le souhaitez, montrez un autre exemple.',
		];
		for (const phrase of aAttraper) expect(vouvoiements(phrase), phrase).not.toEqual([]);
	});

	it('laisse passer les deux façons de CITER la 2e personne du pluriel', () => {
		/* Le guillemet et l'énumération de personnes : ce sont les deux seules, et ce sont
		   celles qu'emploient les leçons qui portent sur le pronom sujet, l'accord du verbe et
		   les verbes atypiques. Un détecteur qui les signalerait rendrait ces leçons
		   inécrivables, donc la règle serait désactivée plutôt que corrigée. */
		const aLaisserPasser = [
			"Méfie-toi de « vous » : pour ce verbe, la terminaison n'est pas -ez.",
			"S'il contient « toi » sans « moi », c'est « vous ».",
			'Remplace ce sujet par un pronom : il, elle, ils, elles, nous ou vous.',
			'Les pronoms sujets sont : je, tu, il, elle, on, nous, vous, ils, elles.',
			'Le pronom « vous » désigne plusieurs personnes.',
			'Tu peux dire nous ou vous.',
		];
		for (const phrase of aLaisserPasser) expect(vouvoiements(phrase), phrase).toEqual([]);
	});

	it('rend la PHRASE fautive, pas le seul mot', () => {
		// Un échec qui ne dit que « vous » n'aide personne à retrouver l'endroit : le
		// contexte rendu est ce qui rend le message d'échec actionnable.
		const [faute] = vouvoiements('Relisez la consigne avec votre enfant avant de commencer.');
		expect(faute).toContain('votre enfant');
		expect(faute.length).toBeGreaterThan('votre'.length);
	});
});

describe('apostrophesCourbes — l’apostrophe du projet est celle du clavier', () => {
	it('attrape l’apostrophe typographique, où qu’elle soit dans la phrase', () => {
		for (const phrase of ['C’est ton tour.', 'Regarde l’unité.', 'Tu t’entraînes bien !'])
			expect(apostrophesCourbes(phrase), phrase).not.toEqual([]);
		// Plusieurs dans la même chaîne : chacune est rapportée, sinon la seconde se
		// glisserait dans la correction de la première.
		expect(apostrophesCourbes('L’enfant n’a pas fini.')).toHaveLength(2);
	});

	it('ne signale ni l’apostrophe droite, ni un texte sans apostrophe', () => {
		for (const phrase of ["C'est ton tour.", "Regarde l'unité.", 'Range les nombres.'])
			expect(apostrophesCourbes(phrase), phrase).toEqual([]);
	});

	it('rend le contexte, pas le caractère nu', () => {
		// Un caractère invisible en littéral (c'est tout le problème : il ne se voit pas à
		// la relecture) doit au moins être rendu avec ce qui l'entoure.
		const [faute] = apostrophesCourbes('Touche la case, la tuile n’est plus là.');
		expect(faute).toContain('tuile n');
	});
});

describe('signesCites — un bouton se NOMME, il ne se cite pas par son glyphe', () => {
	it('attrape un signe isolé entre guillemets, quel qu’il soit', () => {
		/* Huit signes de familles différentes — ponctuation, opérateurs, comparateurs, flèche.
		   La règle porte sur la FORME (un seul caractère non alphanumérique entre guillemets),
		   donc elle doit valoir pour un signe que personne n'a en tête aujourd'hui : c'est tout
		   l'intérêt de ne pas l'écrire en liste. */
		const aAttraper = [
			'Touche le bouton « , » : la virgule se pose.',
			'Appuie sur « = » pour dire que c’est pareil.',
			'Choisis « + » ou « − ».',
			'Mets « . » à la fin de la phrase.',
			'Le bouton « ? » ouvre l’aide.',
			'Écris « < » si le nombre est plus petit.',
			'Le picto « ↔ » veut dire contraire.',
			'Sépare les nombres par « ; ».',
		];
		for (const p of aAttraper) expect(signesCites(p), p).not.toEqual([]);
	});

	it('les espaces qui aèrent la citation ne la sauvent pas', () => {
		// Fine insécable (U+202F) et insécable (U+00A0) : c'est la typographie française
		// normale autour des guillemets, et elle est INVISIBLE en relecture. Écrites en
		// échappement ici pour rester lisibles — un copier-coller les écraserait en silence.
		// Nommées plutôt qu’écrites : un littéral qui les porterait serait lui-même
		// illisible, et un copier-coller les écraserait sans que personne le voie.
		const FINE = String.fromCodePoint(0x202f); // espace fine insécable
		const NBSP = String.fromCodePoint(0x00a0); // espace insécable
		expect(signesCites(`Touche le bouton «${FINE},${FINE}».`)).not.toEqual([]);
		expect(signesCites(`Touche le bouton «${NBSP},${NBSP}».`)).not.toEqual([]);
		expect(signesCites('Touche le bouton « , ».')).not.toEqual([]);
		expect(signesCites('Touche le bouton «,».')).not.toEqual([]);
	});

	it('ne signale PAS une citation de plusieurs caractères', () => {
		/* Un texte cité se prononce et se voit : la règle n'a rien à y redire. Sans cette
		   moitié, le gate rendrait impossible de citer un libellé de bouton — « Vérifier » —
		   c'est-à-dire exactement ce que la règle recommande de faire. */
		const aLaisserPasser = [
			'Touche « Vérifier » quand tu as fini.',
			'Le préfixe « re- » veut dire « encore ».',
			"Devant une voyelle, on écrit « l' ».",
			'Réponds « Je ne sais pas » si tu hésites.',
			'Compare « 3,5 » et « 3,50 ».',
			'Le signe « plus petit » se lit de gauche à droite.',
		];
		for (const p of aLaisserPasser) expect(signesCites(p), p).toEqual([]);
	});

	it('ne signale PAS un mot ou un nombre d’UN seul caractère', () => {
		/* Le cas à ne pas casser, et il existe pour de vrai dans le contenu : plusieurs leçons
		   de français citent une lettre seule (`classes-mots`, `conjugaison-meta`, `familles`).
		   Un détecteur qui les signalerait rendrait ces leçons inécrivables — donc la règle
		   serait désactivée plutôt que corrigée. */
		const aLaisserPasser = [
			'« a » est le verbe avoir, « à » est une petite préposition.',
			'Le pronom « y » remplace un lieu.',
			'Combien de fois le chiffre « 5 » apparaît-il ?',
			'Le « h » de « hibou » ne s’entend pas.',
		];
		for (const p of aLaisserPasser) expect(signesCites(p), p).toEqual([]);
	});

	it('ne signale rien sur une phrase sans guillemets, ni sur une citation vide', () => {
		expect(signesCites('Touche le bouton virgule du pavé.')).toEqual([]);
		expect(signesCites('Une citation vide « » ne dit rien.')).toEqual([]);
	});
});
