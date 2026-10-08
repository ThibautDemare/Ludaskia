/* ============================================================
   Garde-fous de la fabrique « adjectif CM1 » — entrées auteur invalides (#528).
   ------------------------------------------------------------
   `adj()`, exposée par la façade `grammaire-clic-mot` (et hébergée aujourd'hui dans
   `grammaire-clic-mot-adjectif.ts`, ce que ce fichier n'a pas à savoir), refuse À LA
   CONSTRUCTION ce que la leçon ne pourrait pas enseigner. Ses chemins de refus n'étaient
   exécutés par AUCUN test : un garde-fou que rien ne déclenche ne protège rien — il peut
   être inversé, affaibli ou contourné sans qu'une seule ligne rougisse. Même forme que
   `clic-mot-ce2.test.ts` pour `adjCE2` : une entrée fautive qui doit lever, et son TÉMOIN
   presque identique qui doit passer. Sans le témoin, un `throw` posé en tête de fonction
   rendrait tout le fichier vert.

   Les attendus viennent de la grammaire et des interdits écrits dans l'issue #528
   (critères 11 et 13, et le commentaire du 2026-10-08 qui borne le lexique), pas d'une
   lecture des conditions du code :
   - un attribut du sujet est introduit par un verbe d'état, et n'ouvre jamais un groupe
     nominal ;
   - un épithète appartient à un groupe nominal, et ne suit jamais un verbe d'état ;
   - une forme dont la CLASSE se discute (participe passé, adjectif verbal en -ant,
     couleur issue d'un nom, comparatif, ordinal) ferait porter la difficulté sur la
     forme du mot, alors que la leçon entraîne la FONCTION.

   `adjPaire()` porte en plus son propre garde-fou — la PAIRE est la maille de
   construction de la banque — et il est éprouvé en bas de fichier.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	PHRASES_ADJ_CM1,
	adj,
	adjPaire,
	estPonctuation,
} from '../src/data/francais/grammaire-clic-mot';
import { VERBES_ETAT, fonctionDeclaree, indexCible, texteDe } from './gardes-adjectif-cm1';

/* Chaque refus est attendu AVEC SA RAISON, et pas seulement « ça lève ». Sans ce
   verrouillage, un cas tomberait sur un tout autre garde-fou (le plus courant : la cible
   introuvable, qui lève depuis `phraseMots` bien avant d'atteindre la règle visée) et le
   test resterait vert en ne prouvant rien de la règle qu'il prétend tenir. Les fragments
   ci-dessous sont la RAISON grammaticale annoncée à l'auteur de la banque, pas une
   tournure de phrase : c'est elle qui doit rester lisible si le message se réécrit. */
const REFUS = {
	formeDebattue: /forme à classe débattue/,
	interditAilleurs: /ne doit pas apparaître dans/,
	memeFamille: /même famille que/,
	attributSansVerbeEtat: /aucun verbe d'état n'introduit/,
	attributApresDeterminant: /suit un déterminant/,
	epitheteApresVerbeEtat: /suit un verbe d'état/,
	epitheteHorsGroupeNominal: /n'appartient à aucun groupe nominal/,
	cibleAmbigue: /doit apparaître exactement/,
	memeReponse: /la même réponse/,
	nomIndérivable: /impossible de nommer le nom accompagné/,
	sujetIndérivable: /impossible de nommer le sujet du verbe d'état/,
	intercalation: /s'intercale entre le verbe d'état/,
};

describe('Fabrique « adjectif CM1 » — formes refusées en CIBLE (critère 11)', () => {
	/* Un participe passé à valeur adjectivale rouvre la confusion avec le passé composé
	   (auxiliaire invisible) : banni au CE2, banni au CM1. */
	it('refuse un participe passé adjectival comme cible', () => {
		expect(() => adj('Le vélo cassé semble vieux.', 'cassé', 'epithete')).toThrow(
			REFUS.formeDebattue,
		);
		expect(() => adj('Le vélo rouge semble vieux.', 'rouge', 'epithete')).not.toThrow();
	});

	/* Classe débattue : couleurs issues de noms, comparatifs, ordinaux, « seul / autre /
	   même / tout ». La difficulté viendrait de la classe du mot, pas de sa fonction. */
	it('refuse une forme à classe débattue (« seule », « orange », « première »)', () => {
		expect(() => adj('La petite fille est seule.', 'seule', 'attribut')).toThrow(
			REFUS.formeDebattue,
		);
		expect(() => adj('La petite fille est orange.', 'orange', 'attribut')).toThrow(
			REFUS.formeDebattue,
		);
		expect(() => adj('La petite fille est première.', 'première', 'attribut')).toThrow(
			REFUS.formeDebattue,
		);
		expect(() => adj('La petite fille est triste.', 'triste', 'attribut')).not.toThrow();
	});

	/* Adjectif verbal en -ant : homographe du participe présent, et la liste est sans fin —
	   d'où un refus par la FORME. Il ne vaut que pour la CIBLE : « pendant », « devant »,
	   « maintenant » restent des mots-outils admissibles ailleurs dans la phrase, et le
	   second cas le vérifie (sans lui, un refus trop large passerait inaperçu). */
	it('refuse un adjectif verbal en -ant comme cible, mais pas « pendant » ailleurs', () => {
		expect(() => adj('Le chien semble souriant.', 'souriant', 'attribut')).toThrow(
			REFUS.formeDebattue,
		);
		expect(() => adj('Les chiens semblent souriants.', 'souriants', 'attribut')).toThrow(
			REFUS.formeDebattue,
		);
		expect(() => adj('Le chien semble joyeux.', 'joyeux', 'attribut')).not.toThrow();
		expect(() =>
			adj('Le petit chien semble calme pendant la nuit.', 'calme', 'attribut'),
		).not.toThrow();
	});
});

describe('Fabrique « adjectif CM1 » — formes refusées AILLEURS dans la phrase', () => {
	/* Même en simple distracteur, un participe passé adjectival rouvre la confusion : la
	   phrase entière est inspectée, pas seulement le mot visé. */
	it('refuse un participe passé adjectival présent ailleurs que sur la cible', () => {
		expect(() => adj('La porte fermée semble solide.', 'solide', 'attribut')).toThrow(
			REFUS.interditAilleurs,
		);
		expect(() => adj('La porte épaisse semble solide.', 'solide', 'attribut')).not.toThrow();
	});

	/* Critère 13 — garde-fou CE2 conservé : « calme » et « calmement » dans la même phrase
	   font un piège de FORME (adjectif vs adverbe), pas de fonction. Le second cas montre
	   qu'un adverbe en -ment d'une AUTRE famille reste admis. */
	it('refuse un adverbe en -ment de la même famille que la cible', () => {
		expect(() => adj('La rivière calme coule calmement.', 'calme', 'epithete')).toThrow(
			REFUS.memeFamille,
		);
		expect(() => adj('La rivière calme coule lentement.', 'calme', 'epithete')).not.toThrow();
	});
});

describe('Fabrique « adjectif CM1 » — l’étiquette doit dire la vérité (critère 2)', () => {
	/* Un attribut du sujet RÉCLAME un verbe d'état. Sans lui, l'item est mal étiqueté :
	   « rouge » y est épithète de « gamelle ». Une étiquette fausse enseignerait exactement
	   la confusion que la leçon veut lever. Le témoin montre la tolérance documentée : un
	   adverbe peut s'intercaler entre le verbe d'état et son attribut. */
	it('refuse un « attribut » qu’aucun verbe d’état n’introduit', () => {
		expect(() => adj('Le chien mange sa gamelle rouge.', 'rouge', 'attribut')).toThrow(
			REFUS.attributSansVerbeEtat,
		);
		expect(() => adj('Le chien semble content.', 'content', 'attribut')).not.toThrow();
		expect(() => adj('Le chien semble vraiment content.', 'content', 'attribut')).not.toThrow();
	});

	/* Un adjectif collé derrière un déterminant ouvre un groupe nominal : c'est un
	   épithète, quel que soit le reste de la phrase. Même phrase, même mot, seule
	   l'étiquette change — c'est ce qui rend le cas probant. */
	it('refuse un « attribut » collé derrière un déterminant (c’est un épithète)', () => {
		expect(() => adj('Ce chien aime un gros os.', 'gros', 'attribut')).toThrow(
			REFUS.attributApresDeterminant,
		);
		expect(() => adj('Ce chien aime un gros os.', 'gros', 'epithete')).not.toThrow();
	});

	/* Symétrique : un épithète ne suit jamais un verbe d'état. Même phrase, les deux
	   étiquettes, l'une refusée et l'autre acceptée sur un autre mot. */
	it('refuse un « épithète » collé derrière un verbe d’état (c’est un attribut)', () => {
		expect(() => adj('Le petit chien semble content.', 'content', 'epithete')).toThrow(
			REFUS.epitheteApresVerbeEtat,
		);
		expect(() => adj('Le petit chien semble content.', 'content', 'attribut')).not.toThrow();
		expect(() => adj('Le petit chien semble content.', 'petit', 'epithete')).not.toThrow();
	});

	/* Un épithète appartient à un groupe nominal : il suit son déterminant (antéposé) ou le
	   nom lui-même déterminé (postposé). Détaché par une virgule, il est en apposition —
	   construction que l'issue écarte explicitement (rattachement débattu). */
	it('refuse un « épithète » qui n’appartient à aucun groupe nominal (apposition)', () => {
		expect(() => adj('Le chien dort, paisible et heureux.', 'paisible', 'epithete')).toThrow(
			REFUS.epitheteHorsGroupeNominal,
		);
		expect(() => adj('Le chien paisible dort dans la cour.', 'paisible', 'epithete')).not.toThrow();
	});
});

describe('Fabrique « adjectif CM1 » — ce qu’elle produit quand elle accepte', () => {
	/* Les `not.toThrow()` ci-dessus ne disent rien de ce qui SORT. Sans cette vérification,
	   une fabrique qui renverrait un item vide ou mal ciblé les laisserait tous verts.
	   Le mot visé doit être exactement celui qu'on a demandé, et l'étiquette dire sa
	   fonction. */
	it('l’item produit cible le mot demandé, sous le libellé de sa fonction', () => {
		const epithete = adj('Le petit chien semble content.', 'petit', 'epithete');
		const attribut = adj('Le petit chien semble content.', 'content', 'attribut');
		expect(epithete.tokens[indexCible(epithete)]).toBe('petit');
		expect(attribut.tokens[indexCible(attribut)]).toBe('content');
		expect(epithete.cibleIndices).toHaveLength(1);
		expect(attribut.cibleIndices).toHaveLength(1);
		expect(epithete.cibleLabel).toMatch(/épithète/);
		expect(attribut.cibleLabel).toMatch(/attribut/);
		expect(epithete.consigne).toMatch(/épithète/);
		expect(attribut.consigne).toMatch(/attribut/);
		// L'explication CITE le mot visé : c'est ce que promet `explicationNommeCible` (#529).
		expect(epithete.explication).toContain('petit');
		expect(attribut.explication).toContain('content');
		expect(epithete.explicationNommeCible).toBe(true);
		expect(attribut.explicationNommeCible).toBe(true);
	});

	/* Garde-fou générique hérité de `phraseMots` : une cible introuvable, ou présente deux
	   fois, est ambiguë. Il vaut aussi pour l'adjectif CM1, et rien ne le vérifiait ici. */
	it('refuse une cible absente de la phrase, ou présente deux fois', () => {
		expect(() => adj('Le petit chien semble content.', 'grand', 'epithete')).toThrow(
			REFUS.cibleAmbigue,
		);
		expect(() => adj('Le petit chien semble petit.', 'petit', 'epithete')).toThrow(
			REFUS.cibleAmbigue,
		);
	});
});

/* ============================================================
   `adjPaire()` — la PAIRE est la maille de construction de la banque.
   ------------------------------------------------------------
   C'est elle qui tient la promesse du critère 3 (« chacun distracteur de l'autre ») : une
   phrase entre dans la banque avec SES DEUX items ou pas du tout, donc une phrase à
   adjectif unique ne peut pas s'y glisser par inadvertance. Son garde-fou propre refuse
   une paire qui viserait DEUX FOIS le même adjectif — les deux items porteraient alors la
   même réponse sous deux consignes contraires, ce qui apprendrait à l'enfant qu'un même
   mot est à la fois épithète et attribut.

   ATTENTION, PIÈGE sur ce cas précis, et c'est la raison pour laquelle l'assertion est
   figée sur la RAISON annoncée : un `toThrow()` nu serait passé **avec ou sans** le
   garde-fou. Sans lui, `adjPaire(t, X, X)` lèverait quand même, mais depuis le second
   `adj()`, et pour une tout autre raison — c'est démontré ci-dessous. La démonstration
   vaut pour toute paire dupliquée, pas seulement pour celle-ci : un même mot ne peut
   jamais satisfaire les deux étiquettes à la fois (l'épithète exige un déterminant devant
   et refuse le verbe d'état ; l'attribut fait l'inverse), donc le second `adj()` lève
   TOUJOURS. Le garde-fou de `adjPaire` n'ajoute pas un refus : il ajoute le BON message,
   celui qui dit à l'auteur de la banque ce qu'il a réellement écrit.
   ============================================================ */
describe('Fabrique « adjectif CM1 » — la paire épithète + attribut (critère 3)', () => {
	const PHRASE = 'Le petit chien semble content.';

	it('refuse une paire qui vise deux fois le même adjectif', () => {
		expect(() => adjPaire(PHRASE, 'petit', 'petit')).toThrow(REFUS.memeReponse);
		// Casse indifférente : « Petit » et « petit » sont le même mot, donc la même réponse.
		expect(() => adjPaire(PHRASE, 'Petit', 'petit')).toThrow(REFUS.memeReponse);
		expect(() => adjPaire(PHRASE, 'content', 'content')).toThrow(REFUS.memeReponse);
	});

	/* La démonstration annoncée ci-dessus : le refus de repli que produirait un `adjPaire`
	   SANS son garde-fou. Il lève, mais en parlant d'autre chose — l'auteur de la banque
	   lirait « content suit un verbe d'état » là où son vrai défaut est d'avoir écrit deux
	   fois le même mot. C'est ce qui rend l'assertion pinnée nécessaire, et c'est vérifié
	   ici plutôt que raisonné. */
	it('sans ce garde-fou, le refus existerait encore mais dirait autre chose', () => {
		expect(() => adj(PHRASE, 'petit', 'epithete')).not.toThrow();
		expect(() => adj(PHRASE, 'petit', 'attribut')).toThrow(REFUS.attributApresDeterminant);
		expect(() => adj(PHRASE, 'content', 'attribut')).not.toThrow();
		expect(() => adj(PHRASE, 'content', 'epithete')).toThrow(REFUS.epitheteApresVerbeEtat);

		// La MUTATION, jouée et pas raisonnée : voici `adjPaire` privée de son garde-fou,
		// c'est-à-dire ses deux `adj()` enchaînés tels quels. Elle lève — donc un `toThrow()`
		// nu l'aurait laissée passer, et le test d'au-dessus n'aurait rien gardé — mais son
		// message ne satisfait PAS l'assertion pinnée. C'est ce qui rend le gate réel.
		const sansGardeFou = (): unknown => [
			adj(PHRASE, 'petit', 'epithete'),
			adj(PHRASE, 'petit', 'attribut'),
		];
		expect(sansGardeFou).toThrow(); // un `toThrow()` nu serait passé…
		expect(sansGardeFou).not.toThrow(REFUS.memeReponse); // …l'assertion pinnée, non.
	});

	/* Témoin : la même phrase avec DEUX adjectifs distincts produit bien ses deux items,
	   l'un épithète et l'autre attribut, sur deux mots différents. Sans lui, un `throw`
	   posé en tête de `adjPaire` rendrait le test ci-dessus vert pour rien. */
	it('accepte deux adjectifs distincts, et rend les DEUX items de la phrase', () => {
		const paire = adjPaire(PHRASE, 'petit', 'content');
		expect(paire).toHaveLength(2);
		expect(paire.map(fonctionDeclaree)).toEqual(['epithete', 'attribut']);
		expect(paire.map((p) => p.tokens[indexCible(p)])).toEqual(['petit', 'content']);
		// Deux cibles DIFFÉRENTES : c'est tout l'objet du garde-fou.
		expect(new Set(paire.map(indexCible)).size).toBe(2);
		// Chaque item porte sa propre consigne : la tâche change d'un item à l'autre.
		expect(paire[0].consigne).not.toBe(paire[1].consigne);
	});

	/* `adjPaire` ne court-circuite aucun garde-fou de `adj` : une paire dont UN des deux
	   mots est mal étiqueté est refusée, pas servie à moitié. */
	it('relaie les garde-fous de adj() : une paire mal étiquetée est refusée', () => {
		// « content » n'est pas un épithète, et « petit » n'est pas un attribut : paire inversée.
		expect(() => adjPaire(PHRASE, 'content', 'petit')).toThrow(REFUS.epitheteApresVerbeEtat);
		// Participe passé dans la phrase : refusé même si la paire est bien formée par ailleurs.
		expect(() => adjPaire('La porte fermée semble solide.', 'fermée', 'solide')).toThrow();
		// Et un mot absent de la phrase.
		expect(() => adjPaire(PHRASE, 'grand', 'content')).toThrow(REFUS.cibleAmbigue);
	});
});

/* ============================================================
   Les référents que l'explication NOMME — et le refus de les deviner.
   ------------------------------------------------------------
   L'explication ne dit plus « fait partie du groupe du nom » : elle nomme le nom accompagné,
   ou le sujet et son verbe d'état. Ces trois référents sont DÉRIVÉS de la phrase, donc la
   dérivation peut se tromper — et une explication qui nomme le mauvais mot est pire que
   l'explication vague d'avant : elle enseigne une fausseté, à l'enfant qui vient justement
   de se tromper et qui lit l'aide. D'où deux refus de construction de plus, et d'où ces
   tests : ce sont les seuls endroits où le projet vérifie que l'aide dit vrai.

   Les attendus sont dérivés de la GRAMMAIRE : un déterminant, un verbe d'état, un adverbe
   d'intensité et un signe de ponctuation ne sont pas des noms ; un groupe sujet ne contient
   ni ponctuation ni second verbe conjugué. Aucun n'est lu dans les listes de `src/` — une
   liste applicative incomplète doit pouvoir être attrapée ici.
   ============================================================ */
describe('Fabrique « adjectif CM1 » — le NOM que nomme l’explication d’un épithète', () => {
	/* Le cas qui a motivé la liste de mots-outils, et le plus instructif : « grand » ne suit
	   pas de déterminant, mais il y en a un DEUX rangs devant, donc le garde-fou de fonction
	   est satisfait et la lecture « épithète postposée » s'enclenche — elle nommerait alors
	   le nom « très ». Le témoin montre que la lecture postposée reste valide quand le mot
	   d'avant est vraiment un nom. */
	it('refuse de nommer un adverbe d’intensité comme nom (« Le très grand chien »)', () => {
		expect(() => adj('Le très grand chien dort.', 'grand', 'epithete')).toThrow(
			REFUS.nomIndérivable,
		);
		expect(() => adj('Le grand chien dort.', 'grand', 'epithete')).not.toThrow();
		// Postposé : le nom est bien celui d'avant, et la dérivation doit l'accepter.
		expect(() => adj('Il suit un chemin étroit.', 'étroit', 'epithete')).not.toThrow();
	});

	/* Adjectif substantivé (« le petit » = l'enfant) : la lecture antéposée nommerait le
	   verbe d'état comme nom. L'issue écarte d'ailleurs les adjectifs substantivés. */
	it('refuse de nommer un verbe d’état comme nom (« Le petit est content »)', () => {
		expect(() => adj('Le petit est content.', 'petit', 'epithete')).toThrow(REFUS.nomIndérivable);
		expect(() => adj('Le petit chien est content.', 'petit', 'epithete')).not.toThrow();
	});

	/* Adjectif en fin de phrase après son déterminant : le « nom » dérivé serait le point. */
	it('refuse de nommer la ponctuation comme nom (« aime un gros. »)', () => {
		expect(() => adj('Ce chien aime un gros.', 'gros', 'epithete')).toThrow(REFUS.nomIndérivable);
		expect(() => adj('Ce chien aime un gros os.', 'gros', 'epithete')).not.toThrow();
	});

	/* Et un déterminant n'est pas davantage un nom : phrase mal formée à la saisie. */
	it('refuse de nommer un déterminant comme nom', () => {
		expect(() => adj('Le joli des fleurs poussent.', 'joli', 'epithete')).toThrow(
			REFUS.nomIndérivable,
		);
		expect(() => adj('Le joli bouquet de fleurs orne la table.', 'joli', 'epithete')).not.toThrow();
	});
});

describe('Fabrique « adjectif CM1 » — le SUJET que nomme l’explication d’un attribut', () => {
	/* Le groupe sujet est lu comme « tout ce qui précède le verbe d'état ». Un complément
	   placé en tête lui ferait donc nommer « pendant la nuit, le couloir » : refusé. La
	   phrase reste parfaitement jouable une fois le complément rejeté à la fin. */
	it('refuse un sujet non initial (complément détaché en tête de phrase)', () => {
		expect(() => adj('Pendant la nuit, le couloir devient sombre.', 'sombre', 'attribut')).toThrow(
			REFUS.sujetIndérivable,
		);
		expect(() =>
			adj('Le couloir devient sombre pendant la nuit.', 'sombre', 'attribut'),
		).not.toThrow();
	});

	/* Nom propre sujet : refusé, parce que le groupe est cité au fil d'une phrase et y
	   perdrait sa majuscule (« paul semble content »). Les deux témoins montrent ce que la
	   dérivation SAIT lire : un groupe à déterminant, un pronom sujet, et l'article élidé —
	   `tokeniser` rendant « L'eau » d'un seul bloc, celui-ci réclame une tolérance explicite,
	   sans laquelle dix phrases de la banque seraient refusées à tort. */
	it('refuse un nom propre sujet, accepte déterminant, pronom et article élidé', () => {
		expect(() => adj('Paul semble content.', 'content', 'attribut')).toThrow(
			REFUS.sujetIndérivable,
		);
		expect(() => adj('Le garçon semble content.', 'content', 'attribut')).not.toThrow();
		expect(() => adj('Il semble content.', 'content', 'attribut')).not.toThrow();
		expect(() => adj("L'eau paraît claire.", 'claire', 'attribut')).not.toThrow();
	});

	/* Verbe d'état en tête (inversion) : il n'y a rien à nommer devant lui. */
	it('refuse un groupe sujet vide (verbe d’état en tête de phrase)', () => {
		expect(() => adj('Est content ce chien ?', 'content', 'attribut')).toThrow(
			REFUS.sujetIndérivable,
		);
		expect(() => adj('Ce chien est content.', 'content', 'attribut')).not.toThrow();
	});

	/* Deux verbes d'état : le groupe lu engloberait la première proposition entière
	   (« le chien est calme et »), qui n'est pas le sujet du second verbe. */
	it('refuse un groupe sujet qui contient un SECOND verbe d’état', () => {
		expect(() => adj('Le chien est calme et semble content.', 'content', 'attribut')).toThrow(
			REFUS.sujetIndérivable,
		);
		expect(() => adj('Le chien calme semble content.', 'content', 'attribut')).not.toThrow();
	});

	/* Ponctuation dans le groupe : une apposition détachée n'appartient pas au sujet cité.
	   Le témoin isole bien la ponctuation — même longueur de groupe, mais sans virgule. */
	it('refuse un groupe sujet coupé par une ponctuation', () => {
		expect(() => adj('Le chien, mon préféré, semble calme.', 'calme', 'attribut')).toThrow(
			REFUS.sujetIndérivable,
		);
		expect(() => adj('Le chien de mon voisin semble calme.', 'calme', 'attribut')).not.toThrow();
	});

	/* COORDINATION — le groupe lu part du premier mot, donc il avale la proposition d'avant :
	   « Le chien aboie et semble content » faisait nommer le sujet « le chien aboie et ». Le
	   groupe s'ouvre pourtant bien sur un déterminant, et rien d'autre ne le contredisait :
	   c'est exactement le genre de faux que seul un test de contenu attrape. */
	it('refuse un groupe sujet qui enjambe une coordination (« aboie et semble »)', () => {
		expect(() => adj('Le chien aboie et semble content.', 'content', 'attribut')).toThrow(
			REFUS.sujetIndérivable,
		);
		expect(() => adj('Le chien joyeux semble content.', 'content', 'attribut')).not.toThrow();
	});

	/* NÉGATION et clitiques — ils se glissent justement entre le sujet et son verbe, donc le
	   groupe lu les embarque : « Il ne semble pas content » donnait le sujet « il ne ». Le
	   témoin est la même phrase sans la négation. */
	it('refuse un groupe sujet qui contient une négation (« il ne »)', () => {
		expect(() => adj('Il ne semble pas content.', 'content', 'attribut')).toThrow(
			REFUS.sujetIndérivable,
		);
		expect(() => adj('Il semble vraiment content.', 'content', 'attribut')).not.toThrow();
		// Clitique : « Le chien lui semble fidèle » donnerait le sujet « le chien lui ».
		expect(() => adj('Le chien lui semble fidèle.', 'fidèle', 'attribut')).toThrow(
			REFUS.sujetIndérivable,
		);
	});
});

describe('Fabrique « adjectif CM1 » — ce qui s’intercale entre le verbe d’état et l’attribut', () => {
	/* La tolérance « un mot peut séparer le verbe d'état de son attribut » existe pour les
	   adverbes (« est très content »). Elle acceptait n'importe quoi : dans « Elle devient
	   reine heureuse », « heureuse » est épithète de « reine », pas attribut du sujet —
	   l'item aurait enseigné précisément la confusion que la leçon veut lever.
	   Le témoin montre que la tolérance reste ouverte quand le mot intercalé est un adverbe. */
	it('refuse un NOM intercalé, accepte un adverbe', () => {
		expect(() => adj('Elle devient reine heureuse.', 'heureuse', 'attribut')).toThrow(
			REFUS.intercalation,
		);
		expect(() => adj('Elle devient très heureuse.', 'heureuse', 'attribut')).not.toThrow();
		expect(() => adj('Elle devient heureuse.', 'heureuse', 'attribut')).not.toThrow();
	});

	/* Ce refus est DISTINCT de « aucun verbe d'état n'introduit l'attribut », et la nuance se
	   voit à un déterminant près. Sans déterminant devant « reine », c'est bien un verbe
	   d'état qui est deux rangs devant, donc on tombe sur l'intercalation ; avec déterminant,
	   c'est « une » qui occupe la place et on tombe sur le refus d'avant. Les deux messages
	   doivent rester différents — c'est ce qui dit à l'auteur de la banque ce qu'il doit
	   corriger. Troisième ligne : avec son déterminant, l'adjectif est un épithète valide, et
	   l'explication nomme alors le bon nom. */
	it('ne se confond pas avec « aucun verbe d’état » : la nuance tient à un déterminant', () => {
		expect(() => adj('Elle devient reine heureuse.', 'heureuse', 'attribut')).toThrow(
			REFUS.intercalation,
		);
		expect(() => adj('Elle devient une reine heureuse.', 'heureuse', 'attribut')).toThrow(
			REFUS.attributSansVerbeEtat,
		);
		const epithete = adj('Elle devient une reine heureuse.', 'heureuse', 'epithete');
		expect(epithete.explication).toContain('« reine »');
	});
});

/* ============================================================
   LIMITE ASSUMÉE — figée pour qu'elle ne dérive pas en silence.
   ------------------------------------------------------------
   La dérivation ne sait pas qu'un épithète ANTÉPOSÉ peut en précéder un autre : dans
   « Un vieux petit chien », elle lit « vieux » comme antéposé (il suit son déterminant) et
   nomme donc le mot suivant, « petit », au lieu de « chien ». L'explication est fausse.

   Ce n'est PAS un bug à corriger ici : c'est écrit dans `grammaire-clic-mot-adjectif.ts` et
   dans `docs/architecture/contenu-et-lecons.md`, et aucune phrase de la banque n'est dans ce
   cas (deux adjectifs antéposés d'affilée n'y apparaissent jamais). Le test fige le
   comportement ACTUEL, et il est écrit pour rougir dans les DEUX sens :
   - si la dérivation est améliorée (elle nommerait « chien »), il tombe et force à retirer
     ce bloc — une limite corrigée ne doit pas survivre en test ;
   - si quelqu'un fait entrer une telle phrase dans la banque, c'est l'invariant « le nom
     nommé est voisin de l'adjectif » plus bas qui la laisse passer (« petit » EST voisin),
     et c'est pourquoi la limite est écrite ici noir sur blanc plutôt que supposée couverte.
   ============================================================ */
describe('Fabrique « adjectif CM1 » — limite connue des deux épithètes antéposés', () => {
	it('« Un vieux petit chien » nomme « petit » comme nom (limite documentée, pas un bug)', () => {
		const item = adj('Un vieux petit chien dort.', 'vieux', 'epithete');
		expect(item.explication).toContain('« petit »');
		expect(item.explication).not.toContain('« chien »');
	});
});

/* Les mots cités entre guillemets français par une explication. Même frontière que dans
   `clic-mot-etayage-gate.test.ts`, pour une lecture différente : là-bas les exemples d'un
   panneau d'aide, ici les référents qu'une explication nomme. */
function citations(texte: string): string[] {
	return [...texte.matchAll(/«([^»]*)»/gu)].map((m) => m[1].trim()).filter((s) => s.length > 0);
}

/* Où la suite de mots citée se trouve-t-elle dans la phrase ? Rend [début, fin[ sur les
   TOKENS, ou `undefined` si elle n'y est pas. Comparaison insensible à la casse (le groupe
   sujet est cité en minuscule alors qu'il ouvre la phrase) et sur les espaces (la citation
   est une chaîne libre, les tokens un tableau).

   Rendre la POSITION et pas un booléen n'est pas un détail : tout ce qui suit — la
   ponctuation, le second verbe d'état, la place du sujet devant son verbe — se vérifie
   alors sur les tokens RÉELS de la phrase, et jamais sur un redécoupage de la citation qui
   pourrait diverger du découpage d'origine. */
function spanCite(tokens: string[], cite: string): [number, number] | undefined {
	const cible = cite.trim().replace(/\s+/gu, ' ').toLowerCase();
	if (!cible) return undefined;
	for (let i = 0; i < tokens.length; i++) {
		for (let fin = i + 1; fin <= tokens.length; fin++) {
			const candidat = tokens.slice(i, fin).join(' ').toLowerCase();
			if (candidat === cible) return [i, fin];
			if (candidat.length > cible.length) break;
		}
	}
	return undefined;
}

/* Formes de verbe d'état, RÉ-ÉCRITES à la main dans `gardes-adjectif-cm1.ts` depuis la
   grammaire : c'est l'attendu du test, pas le reflet de `VERBES_ETAT_FORMES`. */
const FORMES_ETAT = new Set(Object.values(VERBES_ETAT).flat());

/* Ce qu'un mot ne peut PAS être quand il est donné comme NOM. Liste écrite ici depuis la
   grammaire, volontairement indépendante de `ADJ_MOTS_OUTILS` : si la liste applicative
   oubliait un adverbe, ce test devrait le dire. */
const JAMAIS_UN_NOM = new Set(
	(
		'le la les un une des du au aux de et ou mais donc or ni car ' +
		'mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ce cet cette ces ' +
		'très plus moins assez trop si bien peu fort encore toujours jamais vraiment déjà ' +
		'aussi presque plutôt ne pas tout toute tous toutes dans sur sous avec pour par'
	).split(' '),
);

describe('Fabrique « adjectif CM1 » — ce que les 60 explications de la banque nomment', () => {
	/* Plancher anti-test-à-vide : les trois tests ci-dessous itèrent sur la banque. */
	it('la banque produit bien ses deux familles d’items', () => {
		expect(PHRASES_ADJ_CM1.length).toBeGreaterThanOrEqual(50);
		expect(
			PHRASES_ADJ_CM1.filter((p) => fonctionDeclaree(p) === 'epithete').length,
		).toBeGreaterThan(0);
		expect(
			PHRASES_ADJ_CM1.filter((p) => fonctionDeclaree(p) === 'attribut').length,
		).toBeGreaterThan(0);
	});

	/* LE test qui compte, et le cas d'échec le plus grave parce qu'il serait SILENCIEUX :
	   une dérivation qui sort un mot d'ailleurs. L'enfant lirait « accompagne le nom
	   « table » » dans une phrase qui ne contient pas « table ». */
	it('chaque mot cité par une explication est présent dans SA phrase', () => {
		for (const p of PHRASES_ADJ_CM1) {
			const cites = citations(p.explication);
			expect(
				cites.length,
				`« ${texteDe(p)} » : explication sans référent nommé`,
			).toBeGreaterThanOrEqual(2);
			for (const c of cites) {
				expect(
					spanCite(p.tokens, c),
					`« ${texteDe(p)} » nomme « ${c} », absent de la phrase`,
				).toBeDefined();
			}
			// Le mot visé est l'un des référents cités : c'est la promesse d'`explicationNommeCible`.
			expect(
				cites.map((c) => c.toLowerCase()),
				`« ${texteDe(p)} »`,
			).toContain(p.tokens[indexCible(p)].toLowerCase());
		}
	});

	/* Un épithète nomme UN nom, et ce nom est le mot voisin du groupe — jamais un
	   déterminant, un verbe d'état, un adverbe ni une ponctuation. */
	it('l’explication d’un épithète nomme un nom plausible, voisin de l’adjectif', () => {
		for (const p of PHRASES_ADJ_CM1) {
			if (fonctionDeclaree(p) !== 'epithete') continue;
			const i = indexCible(p);
			const autres = citations(p.explication).filter(
				(c) => c.toLowerCase() !== p.tokens[i].toLowerCase(),
			);
			expect(autres, `« ${texteDe(p)} » : l’épithète doit nommer UN nom`).toHaveLength(1);
			const nom = autres[0];
			expect(estPonctuation(nom), `« ${texteDe(p)} » nomme la ponctuation « ${nom} »`).toBe(false);
			expect(
				JAMAIS_UN_NOM.has(nom.toLowerCase()) || FORMES_ETAT.has(nom.toLowerCase()),
				`« ${texteDe(p)} » nomme « ${nom} » comme nom — ce n’en est pas un`,
			).toBe(false);
			// Voisin immédiat : un épithète appartient au groupe du nom qu'il décrit.
			const voisins = [p.tokens[i - 1] ?? '', p.tokens[i + 1] ?? ''].map((t) => t.toLowerCase());
			expect(voisins, `« ${texteDe(p)} » nomme « ${nom} », qui n’est pas voisin`).toContain(
				nom.toLowerCase(),
			);
		}
	});

	/* Un attribut nomme un sujet ET un verbe d'état. Le verbe doit en être un (vérifié sur
	   MA liste), et le groupe sujet doit s'arrêter juste devant lui, sans ponctuation ni
	   second verbe d'état — sans quoi le « sujet » cité enjamberait une autre proposition. */
	it('l’explication d’un attribut nomme un vrai verbe d’état, et le sujet qui le précède', () => {
		for (const p of PHRASES_ADJ_CM1) {
			if (fonctionDeclaree(p) !== 'attribut') continue;
			const i = indexCible(p);
			const autres = citations(p.explication).filter(
				(c) => c.toLowerCase() !== p.tokens[i].toLowerCase(),
			);
			expect(autres, `« ${texteDe(p)} » : l’attribut doit nommer sujet ET verbe`).toHaveLength(2);
			const verbe = autres.find((c) => FORMES_ETAT.has(c.toLowerCase()));
			expect(
				verbe,
				`« ${texteDe(p)} » ne nomme aucun verbe d’état : ${autres.join(' / ')}`,
			).toBeDefined();
			const sujet = autres.find((c) => c !== verbe)!;
			// Le verbe nommé introduit bien CET adjectif : il est collé, ou à un adverbe près.
			const vi = p.tokens.findIndex((t) => t.toLowerCase() === verbe!.toLowerCase());
			expect(
				i - vi,
				`« ${texteDe(p)} » : verbe « ${verbe} » trop loin de l’adjectif`,
			).toBeLessThanOrEqual(2);
			expect(i - vi).toBeGreaterThan(0);
			// Le groupe sujet s'arrête juste devant le verbe nommé…
			const span = spanCite(p.tokens, sujet);
			expect(span, `« ${texteDe(p)} » : sujet « ${sujet} » absent de la phrase`).toBeDefined();
			expect(
				span![1],
				`« ${texteDe(p)} » : le sujet « ${sujet} » ne précède pas « ${verbe} »`,
			).toBe(vi);
			// …et il n'enjambe ni ponctuation, ni coordination, ni autre verbe d'état. Les tokens
			// inspectés sont ceux de la PHRASE, pris dans le span, jamais un redécoupage du texte
			// cité : c'est ce qui rend le constat opposable.
			for (const m of p.tokens.slice(span![0], span![1])) {
				expect(estPonctuation(m), `« ${texteDe(p)} » : sujet coupé par « ${m} »`).toBe(false);
				expect(
					FORMES_ETAT.has(m.toLowerCase()),
					`« ${texteDe(p)} » : second verbe dans le sujet`,
				).toBe(false);
				expect(
					['et', 'ou', 'ne', "n'"].includes(m.toLowerCase()),
					`« ${texteDe(p)} » : le sujet cité enjambe « ${m} »`,
				).toBe(false);
			}
		}
	});
});
