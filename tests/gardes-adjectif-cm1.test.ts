/* ============================================================
   Les détecteurs de #528 MORDENT-ILS ? — témoins fabriqués.
   ------------------------------------------------------------
   `clic-mot-adjectif-cm1.test.ts` pose les critères de l'issue #528 sur la banque CM1 ;
   tant qu'elle n'existe pas, il est ROUGE en entier, donc aucun de ses détecteurs n'est
   exécuté. Ce fichier-ci les éprouve DÈS MAINTENANT, sur des phrases fabriquées portant
   exactement la violation annoncée — et sur les TÉMOINS qui ne doivent PAS être signalés,
   sans lesquels un détecteur devenu trop permissif laisserait la vraie banque verte en
   silence (cf. `tests/README.md`, patron de `gardes-affixes`).

   Rien ici ne dépend de la banque CM1 : seulement du moteur `phraseMots`, déjà livré.
   ============================================================ */
import { describe, it, expect } from 'vitest';
// Façade, jamais un module interne de la famille (cf. l'en-tête de `gardes-adjectif-cm1.ts`).
import { phraseMots, type PhraseClicMot } from '../src/data/francais/grammaire-clic-mot';
import {
	adverbesMemeFamille,
	autresAdjectifs,
	colleApresDeterminant,
	colleApresVerbeEtat,
	fonctionCitee,
	fonctionDeclaree,
	indexCible,
	lexiqueAdjectifs,
	motsInterdits,
	termineLaPhrase,
	verbeEtatAvant,
	type FonctionAdjAttendue,
} from './gardes-adjectif-cm1';

const LIB: Record<FonctionAdjAttendue, string> = {
	epithete: "l'adjectif épithète",
	attribut: "l'adjectif attribut",
};

/* Fabrique un item de test au format de la banque attendue (consigne + cibleLabel PROPRES
   à l'item, comme `det()` au CM1). */
function item(texte: string, cible: string, fonction: FonctionAdjAttendue): PhraseClicMot {
	return phraseMots(texte, [cible], {
		explication: `« ${cible} » décrit le nom.`,
		consigne: `Clique sur ${LIB[fonction]} de la phrase.`,
		cibleLabel: LIB[fonction],
		explicationNommeCible: true,
	});
}

/* Un item SANS fonction déclarée : le cas que la banque CE2 produit aujourd'hui. */
function itemNeutre(texte: string, cible: string): PhraseClicMot {
	return phraseMots(texte, [cible], {
		explication: `« ${cible} » décrit le nom.`,
		consigne: "Clique sur l'adjectif de la phrase.",
		cibleLabel: "l'adjectif",
	});
}

describe('Détecteurs #528 — la fonction déclarée par un item', () => {
	it('lit « épithète » et « attribut » dans le libellé de cible, accents indifférents', () => {
		expect(fonctionDeclaree(item('Le petit chien dort.', 'petit', 'epithete'))).toBe('epithete');
		expect(fonctionDeclaree(item('Le chien est content.', 'content', 'attribut'))).toBe('attribut');
		expect(fonctionCitee("l'adjectif EPITHETE")).toBe('epithete');
	});

	it('TÉMOIN : un libellé qui ne tranche pas n’est jamais classé', () => {
		// Le cas que le critère 2 refuse : une consigne unique qui ne demande pas de fonction.
		expect(fonctionDeclaree(itemNeutre('Le petit chien dort.', 'petit'))).toBeUndefined();
		// Et le libellé qui nomme les DEUX ne désigne pas une cible non plus.
		expect(fonctionCitee("l'adjectif épithète ou attribut")).toBeUndefined();
	});
});

describe('Détecteurs #528 — la position de l’adjectif dans la phrase', () => {
	it('repère l’adjectif qui termine la phrase, ponctuation finale mise à part', () => {
		expect(termineLaPhrase(item('Le chien est content.', 'content', 'attribut'))).toBe(true);
		expect(termineLaPhrase(item('Le chien semble joyeux !', 'joyeux', 'attribut'))).toBe(true);
	});

	it('TÉMOIN : un adjectif suivi d’un autre mot ne termine pas la phrase', () => {
		expect(termineLaPhrase(item('Le petit chien dort.', 'petit', 'epithete'))).toBe(false);
		expect(termineLaPhrase(item('Le chien est content de son os.', 'content', 'attribut'))).toBe(
			false,
		);
	});
});

describe('Détecteurs #528 — participes passés et formes ambiguës (critère 11)', () => {
	it('signale un participe passé adjectival, ciblé ou simple distracteur', () => {
		expect(motsInterdits(item('La porte est cassée.', 'cassée', 'attribut'))).toEqual(['cassée']);
		expect(
			motsInterdits(item('La fenêtre ouverte laisse entrer un vent froid.', 'froid', 'epithete')),
		).toEqual(['ouverte']);
	});

	it('TÉMOIN : un adjectif ordinaire et un verbe homographe ne sont pas signalés', () => {
		expect(motsInterdits(item('Le chien est content.', 'content', 'attribut'))).toEqual([]);
		// « casse » (verbe) ne doit PAS être confondu avec « cassé » (participe) : replier les
		// accents sur les FORMES de la banque ferait exactement cette faute.
		expect(
			motsInterdits(item('Le vent casse une branche fragile.', 'fragile', 'epithete')),
		).toEqual([]);
	});
});

describe('Détecteurs #528 — adverbe de même famille (critère 13)', () => {
	it('signale « lentement » quand l’adjectif visé est « lente »', () => {
		expect(
			adverbesMemeFamille(item('La tortue lente avance lentement.', 'lente', 'epithete')),
		).toEqual(['lentement']);
	});

	it('TÉMOIN : un adverbe d’une AUTRE famille ne gêne pas', () => {
		expect(
			adverbesMemeFamille(item('Le chien content aboie bruyamment.', 'content', 'epithete')),
		).toEqual([]);
	});
});

describe('Détecteurs #528 — le second adjectif, distracteur du premier (critère 3)', () => {
	const banque = [
		item('Le petit chien semble content.', 'petit', 'epithete'),
		item('Le petit chien semble content.', 'content', 'attribut'),
		item('La fleur est belle.', 'belle', 'attribut'),
	];
	const lexique = lexiqueAdjectifs(banque);

	it('chaque item d’une phrase à deux adjectifs voit l’AUTRE adjectif', () => {
		expect(autresAdjectifs(banque[0], lexique)).toEqual(['content']);
		expect(autresAdjectifs(banque[1], lexique)).toEqual(['petit']);
	});

	it('une phrase à UN SEUL adjectif n’offre aucun distracteur — c’est le cas du critère 9', () => {
		// « ajouter à la banque une phrase à un seul adjectif ... ne fait tomber aucun test »
		// est l'échec déclaré du critère 9 : le détecteur doit donc rendre une liste VIDE ici.
		expect(autresAdjectifs(banque[2], lexique)).toEqual([]);
	});

	it('rapproche les formes d’un même adjectif (« content » / « contente »)', () => {
		const b2 = [
			item('La petite fille semble contente.', 'contente', 'attribut'),
			...banque.slice(0, 2),
		];
		expect(autresAdjectifs(b2[0], lexiqueAdjectifs(b2))).toEqual(['petite']);
	});

	it('TÉMOIN : les petits mots outils ne passent pas pour des adjectifs', () => {
		// Le radical grossier de « les » vaut « l » : sans le plancher de 3 lettres, tout
		// déterminant serait compté comme un second adjectif et le critère 3 serait vert à vide.
		const p = item('Les enfants regardent les nuages blancs.', 'blancs', 'epithete');
		expect(autresAdjectifs(p, lexiqueAdjectifs([p]))).toEqual([]);
	});
});

describe('Détecteurs #528 — les verbes d’état (critère 5)', () => {
	it('nomme le verbe d’état qui introduit l’attribut', () => {
		expect(verbeEtatAvant(item('Le chien est content.', 'content', 'attribut'))).toBe('être');
		expect(verbeEtatAvant(item('Le chien semble content.', 'content', 'attribut'))).toBe('sembler');
		expect(verbeEtatAvant(item('La route paraît longue.', 'longue', 'attribut'))).toBe('paraître');
		expect(verbeEtatAvant(item('La salle reste vide.', 'vide', 'attribut'))).toBe('rester');
		expect(verbeEtatAvant(item('Les feuilles deviennent jaunes.', 'jaunes', 'attribut'))).toBe(
			'devenir',
		);
		expect(verbeEtatAvant(item("Les enfants ont l'air joyeux.", 'joyeux', 'attribut'))).toBe(
			"avoir l'air",
		);
	});

	it('TÉMOIN : un épithète n’a aucun verbe d’état devant lui', () => {
		expect(verbeEtatAvant(item('Le petit chien dort.', 'petit', 'epithete'))).toBeUndefined();
		// « l'air » SANS forme d'avoir reste le nom commun : pas un verbe d'état.
		expect(
			verbeEtatAvant(item("Le promeneur respire l'air frais.", 'frais', 'epithete')),
		).toBeUndefined();
	});

	it('distingue l’adjectif COLLÉ au verbe d’état de celui qui ne l’est pas', () => {
		expect(colleApresVerbeEtat(item('Le chien est content.', 'content', 'attribut'))).toBe(true);
		expect(colleApresVerbeEtat(item('Le petit chien est content.', 'petit', 'epithete'))).toBe(
			false,
		);
	});

	it('repère l’adjectif collé derrière un déterminant (donc dans le groupe nominal)', () => {
		expect(colleApresDeterminant(item('Le petit chien dort.', 'petit', 'epithete'))).toBe(true);
		expect(colleApresDeterminant(item('Le chien est content.', 'content', 'attribut'))).toBe(false);
	});
});

describe('Détecteurs #528 — l’indice de la cible', () => {
	it('rend l’indice du mot ciblé, pas celui d’une autre occurrence', () => {
		const p = item('Le chien noir dort.', 'noir', 'epithete');
		expect(indexCible(p)).toBe(2);
		expect(p.tokens[indexCible(p)]).toBe('noir');
	});
});
