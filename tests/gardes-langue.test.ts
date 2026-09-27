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
import { vouvoiements, apostrophesCourbes } from './gardes-langue';

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
