/* ============================================================
   Grammaire — « Repère le groupe nominal » (#716, CM1).
   ------------------------------------------------------------
   L'application savait déjà faire pointer le NOM NOYAU d'un groupe (#437) et faire
   accorder un groupe entier (#243). Ce qu'elle ne demandait jamais, c'est OÙ le
   groupe commence et où il finit — précisément la nouveauté du CM1 (programme §5.1,
   « Repérer des groupes nominaux dans une phrase simple ») : depuis le CE2 l'enfant
   nomme déterminant, nom et adjectif un par un, mais on ne lui a jamais demandé de
   délimiter le bloc.

   D'où une banque à part, et surtout un GESTE à part : la cible est un SEGMENT
   (drapeau `segment`, cf. `phraseSegment`), que l'enfant délimite par deux bornes au
   lieu de cocher des mots un par un. Cocher librement permettrait de désigner « chat »
   et « noir » en sautant « petit » — un enfant qui répond ainsi n'a pas vu le bloc.

   ── Ce que la banque s'interdit, et pourquoi ─────────────────────────────────
   Les garde-fous ci-dessous refusent à la CONSTRUCTION ce que les critères négatifs
   de #716 interdisent, plutôt que de compter sur la relecture :
   - le groupe s'ouvre sur un déterminant article / possessif / démonstratif (critère
     13), ce qui écarte du même coup « plusieurs élèves », « chaque enfant », un
     numéral, et un pronom donné pour un groupe (critère 10) ;
   - il fait exactement 2 mots (Dét + Nom) ou 3 (Dét + Nom + Adj ; Dét + Adj + Nom) —
     les trois patrons du programme, et rien d'autre : deux épithètes empilées
     (critère 9) ou un nom propre seul (critère 11) n'y entrent pas ;
   - aucune préposition ne touche le groupe (critère 8) : « le chat DE la voisine »
     est un complément du nom, donc du CM2.

   Le déterminant ÉLIDÉ (« l'oiseau ») est exclu, et ce n'est pas un détail technique :
   le tokeniseur maison colle l'apostrophe au nom, si bien que le groupe ne se découpe
   plus en 2 ou 3 morceaux désignables — l'enfant ne pourrait plus montrer le
   déterminant comme un mot à part, qui est justement le bord qu'on lui fait chercher.

   ── Deux paliers dans une seule banque ──────────────────────────────────────
   Palier 1 : la phrase ne porte QU'UN groupe nominal, tout le reste étant pronom,
   verbe et adverbe — la consigne par défaut suffit. Palier 2 : deux groupes, et la
   consigne nomme alors celui qu'on attend (critère 5), sans quoi deux réponses
   seraient également défendables. Le constructeur REFUSE une phrase à deux groupes
   sans `ancre` : l'oubli remonte à l'écriture de la banque, pas à l'usage.
   ============================================================ */
import {
	DET_SETS,
	libelleCible,
	phraseSegment,
	type PhraseClicMot,
} from './grammaire-clic-mot-moteur';

/** Les trois patrons du programme CM1 (§5.1). `DN` fait 2 mots, `DNA` et `DAN` en
    font 3 — c'est ce compte que le constructeur vérifie. Quelle POSITION occupe
    l'adjectif ne se vérifie pas ici (il faudrait un lexique, donc une liste finie et
    faillible) : le patron est déclaré par l'auteur de la banque, et c'est
    `tests/groupe-nominal.test.ts` qui confronte la déclaration au contenu réel. */
export type PatronGN = 'DN' | 'DNA' | 'DAN';

const MOTS_ATTENDUS: Record<PatronGN, number> = { DN: 2, DNA: 3, DAN: 3 };

/** Déterminants nommés par le programme CM1 : l'union des trois sous-catégories que
    le moteur tient déjà (article, possessif, démonstratif). Lue d'ici plutôt que
    recopiée — deux listes de déterminants qui divergent se traduiraient par un
    garde-fou qui accepte ici ce qu'il refuse ailleurs. */
const DETERMINANTS = new Set<string>([
	...DET_SETS.article,
	...DET_SETS.possessif,
	...DET_SETS.demonstratif,
]);

/* Prépositions susceptibles d'ouvrir un complément du nom au bord du groupe. Liste
   volontairement courte : elle ne sert qu'à examiner les DEUX tokens qui touchent le
   groupe, pas à analyser la phrase. Le balayage large de la banque (aucune préposition
   nulle part) est tenu par le test, où il a sa place — c'est une règle de contenu, pas
   une règle de construction. */
const PREPOSITIONS = new Set([
	'de',
	'du',
	'des',
	'à',
	'au',
	'aux',
	'en',
	'dans',
	'sur',
	'sous',
	'avec',
	'sans',
	'pour',
	'par',
	'chez',
	'vers',
	'contre',
	'entre',
	'depuis',
	'devant',
	'derrière',
	'pendant',
]);

const estElide = (t: string): boolean => t.toLowerCase().startsWith("l'");
const estDeterminant = (t: string): boolean => DETERMINANTS.has(t.toLowerCase());

/* Une phrase porte-t-elle plus d'un groupe nominal ? Approximation assumée : on compte
   les TÊTES possibles (déterminant, ou forme élidée qui ouvre un groupe qu'on s'interdit
   de cibler). Elle peut réclamer une consigne là où la phrase n'a qu'un groupe — un
   « leur » pronom serait compté — mais jamais l'inverse : l'excès de prudence est du bon
   côté, puisque le défaut qu'on traque est une cible ambiguë. */
function nombreDeTetes(tokens: readonly string[]): number {
	return tokens.filter((t) => estDeterminant(t) || estElide(t)).length;
}

export const CIBLE_GN = 'le groupe nominal';

/* La consigne énonce le GESTE, et pas seulement la tâche. C'est une exigence
   d'accessibilité, pas un confort : un `<button aria-pressed>` promet implicitement
   qu'on décoche un mot en le retouchant, alors qu'ici retoucher repart d'une borne.
   L'ARIA ne peut pas porter cette règle — la consigne, affichée et lue par la synthèse
   vocale, le peut (cf. `ui/segment-mot-interaction.ts`, docs/architecture/ui.md). */
const GESTE = 'touche son premier mot, puis son dernier mot';

export const CONSIGNE_GN = `Montre le groupe nominal de la phrase : ${GESTE}.`;

/** Construit un item de la banque. `groupe` est écrit tel qu'on le lit (la casse n'a
    pas à suivre celle de la phrase) ; `patron` déclare lequel des trois modèles du
    programme il illustre. `ancre` nomme le NOM du groupe attendu : obligatoire dès que
    la phrase porte deux groupes, inutile sinon. `note` ajoute à l'explication la
    remarque propre au piège de l'item (l'adverbe qui traîne au bord, l'adjectif placé
    avant le nom). */
export function gn(
	texte: string,
	groupe: string,
	patron: PatronGN,
	opts: { ancre?: string; note?: string } = {},
): PhraseClicMot {
	const attendus = MOTS_ATTENDUS[patron];
	const mots = groupe.trim().split(/\s+/).filter(Boolean);
	if (mots.length !== attendus) {
		throw new Error(
			`groupe-nominal : « ${groupe} » fait ${mots.length} mot(s), le patron ${patron} en ` +
				`attend ${attendus} (Dét + Nom, ou Dét + Nom + Adj, ou Dét + Adj + Nom).`,
		);
	}
	const consigne = opts.ancre
		? `Montre le groupe nominal qui contient le mot « ${opts.ancre} » : ${GESTE}.`
		: undefined;
	const p = phraseSegment(texte, groupe, {
		// Remplacée juste après : l'explication doit citer le groupe DANS LA CASSE DE LA
		// PHRASE (« Les grandes fleurs »), qu'on ne connaît qu'une fois la cible située.
		explication: '',
		consigne,
		cibleLabel: CIBLE_GN,
		explicationNommeCible: true,
	});

	const tete = p.tokens[p.cibleIndices[0]];
	if (estElide(tete)) {
		throw new Error(
			`groupe-nominal : déterminant élidé « ${tete} » dans « ${texte} » — le groupe ne se ` +
				'découpe plus en mots désignables (cf. en-tête du module).',
		);
	}
	if (!estDeterminant(tete)) {
		throw new Error(
			`groupe-nominal : « ${tete} » n'ouvre pas un groupe nominal du programme CM1 — il faut ` +
				'un article, un possessif ou un démonstratif (critères 10, 11 et 13 de #716).',
		);
	}

	const avant = p.tokens[p.cibleIndices[0] - 1];
	const apres = p.tokens[p.cibleIndices[p.cibleIndices.length - 1] + 1];
	for (const [mot, ou] of [
		[avant, 'avant'],
		[apres, 'après'],
	] as const) {
		if (mot && PREPOSITIONS.has(mot.toLowerCase())) {
			throw new Error(
				`groupe-nominal : préposition « ${mot} » juste ${ou} le groupe dans « ${texte} » — ` +
					'complément du nom ou groupe emboîté, hors programme CM1 (critère 8 de #716).',
			);
		}
	}

	if (nombreDeTetes(p.tokens) > 1 && !opts.ancre) {
		throw new Error(
			`groupe-nominal : « ${texte} » porte plus d'un groupe nominal ; il faut nommer celui ` +
				"qu'on attend (option `ancre`), sinon deux réponses restent défendables (critère 5).",
		);
	}
	if (
		opts.ancre &&
		!p.cibleIndices.some((i) => p.tokens[i].toLowerCase() === opts.ancre!.toLowerCase())
	) {
		throw new Error(
			`groupe-nominal : l'ancre « ${opts.ancre} » ne fait pas partie de « ${groupe} » — la ` +
				'consigne désignerait un autre groupe que celui qui est attendu.',
		);
	}

	const texteGroupe = libelleCible(p.tokens, p.cibleIndices);
	const premier = p.tokens[p.cibleIndices[0]];
	const dernier = p.tokens[p.cibleIndices[p.cibleIndices.length - 1]];
	p.explication =
		`Le groupe nominal est « ${texteGroupe} » : il commence au déterminant « ${premier} » ` +
		`et s'arrête à « ${dernier} ».${opts.note ? ` ${opts.note}` : ''}`;
	return p;
}

/* ---------- La banque ----------
   Palier 1 (un seul groupe nominal dans la phrase) puis palier 2 (deux groupes, la
   consigne nomme le bon). Les phrases restent courtes et sans préposition : un groupe
   prépositionnel posé ailleurs (« dans la cour ») rendrait « où finit le groupe ? »
   discutable pour de mauvaises raisons. */
export const PHRASES_GN: PhraseClicMot[] = [
	/* --- Palier 1, Dét + Nom --- */
	gn('Mon frère chante souvent.', 'Mon frère', 'DN', {
		note: '« souvent » dit combien de fois il chante : ce mot ne fait pas partie du groupe.',
	}),
	gn('La lune brille doucement.', 'La lune', 'DN'),
	gn('Les oiseaux chantent joyeusement.', 'Les oiseaux', 'DN'),
	gn('Ce train roule lentement.', 'Ce train', 'DN'),
	gn('Tu prends ton cartable.', 'ton cartable', 'DN'),
	gn('Elle regarde la télévision.', 'la télévision', 'DN'),
	gn('Nous attendons le bus.', 'le bus', 'DN'),
	gn('Il répare sa trottinette.', 'sa trottinette', 'DN'),
	gn('Ces fleurs poussent vite.', 'Ces fleurs', 'DN'),
	gn('Vous cherchez vos clés.', 'vos clés', 'DN'),
	gn('Le boulanger travaille tôt.', 'Le boulanger', 'DN'),
	gn('Je range mes affaires.', 'mes affaires', 'DN'),
	gn('Cette histoire finit bien.', 'Cette histoire', 'DN'),
	// Le piège que le pédagogue place au cœur de la notion : un adverbe collé au bord du
	// groupe. La recette « je prends du petit mot jusqu'au verbe » ne dit plus rien ici,
	// puisque le groupe est APRÈS le verbe et que l'adverbe le suit (critère 4 de #716).
	gn('Il ferme la porte doucement.', 'la porte', 'DN', {
		note: '« doucement » dit comment il ferme : ce mot ne fait pas partie du groupe.',
	}),
	gn('Elle plie ses vêtements soigneusement.', 'ses vêtements', 'DN'),
	gn('Les nuages avancent lentement.', 'Les nuages', 'DN'),
	gn('Mon poisson tourne lentement.', 'Mon poisson', 'DN'),

	/* --- Palier 1, Dét + Nom + Adj --- */
	gn('Le chat noir dort profondément.', 'Le chat noir', 'DNA', {
		note: '« profondément » dit comment il dort : ce mot ne fait pas partie du groupe.',
	}),
	gn('Elle observe un papillon coloré.', 'un papillon coloré', 'DNA'),
	gn('Nous suivons un chemin étroit.', 'un chemin étroit', 'DNA'),
	gn('Il mange une pomme mûre.', 'une pomme mûre', 'DNA'),
	gn('Mon vélo rouge roule bien.', 'Mon vélo rouge', 'DNA', {
		note: '« bien » dit comment il roule : ce mot ne fait pas partie du groupe.',
	}),
	gn('Tu portes un manteau chaud.', 'un manteau chaud', 'DNA'),
	gn('Ces fleurs blanches poussent vite.', 'Ces fleurs blanches', 'DNA'),
	gn('Je lis une histoire amusante.', 'une histoire amusante', 'DNA'),
	gn('Elle range une boîte vide.', 'une boîte vide', 'DNA'),
	gn('Elle plie une nappe blanche lentement.', 'une nappe blanche', 'DNA', {
		note: '« lentement » dit comment elle plie : ce mot ne fait pas partie du groupe.',
	}),

	/* --- Palier 1, Dét + Adj + Nom (le patron le moins fréquent) --- */
	gn('Elle dessine un grand tableau.', 'un grand tableau', 'DAN', {
		note: 'Même placé avant le nom, « grand » fait partie du groupe.',
	}),
	gn('Le petit chien aboie souvent.', 'Le petit chien', 'DAN'),
	gn('Nous admirons une jolie fleur.', 'une jolie fleur', 'DAN'),
	gn('Il raconte une longue histoire.', 'une longue histoire', 'DAN'),
	gn('Mes vieilles chaussures craquent encore.', 'Mes vieilles chaussures', 'DAN'),
	gn('Cette belle journée commence bien.', 'Cette belle journée', 'DAN'),
	gn('Tu portes un beau chapeau.', 'un beau chapeau', 'DAN'),
	gn('Elle chante une belle chanson.', 'une belle chanson', 'DAN'),

	/* --- Palier 2 : deux groupes nominaux, la consigne nomme celui qu'on attend --- */
	gn('Le chien regarde les oiseaux.', 'les oiseaux', 'DN', { ancre: 'oiseaux' }),
	gn('Ma cousine prépare un gâteau.', 'Ma cousine', 'DN', { ancre: 'cousine' }),
	gn('Les enfants ramassent des feuilles.', 'des feuilles', 'DN', { ancre: 'feuilles' }),
	gn('Le facteur apporte une lettre.', 'Le facteur', 'DN', { ancre: 'facteur' }),
	gn('Cette voiture rouge dépasse le camion.', 'Cette voiture rouge', 'DNA', { ancre: 'voiture' }),
	gn('Mon cousin répare son vélo.', 'son vélo', 'DN', { ancre: 'vélo' }),
	gn('La maîtresse explique la leçon.', 'la leçon', 'DN', { ancre: 'leçon' }),
	gn('Le vent secoue les branches.', 'les branches', 'DN', { ancre: 'branches' }),
	gn('Un grand cheval traverse le pré.', 'Un grand cheval', 'DAN', { ancre: 'cheval' }),
	gn('Ces élèves curieux écoutent la maîtresse.', 'Ces élèves curieux', 'DNA', { ancre: 'élèves' }),
	gn('Le boulanger prépare les croissants.', 'les croissants', 'DN', { ancre: 'croissants' }),
	gn('Ta petite voisine cherche ses crayons.', 'Ta petite voisine', 'DAN', { ancre: 'voisine' }),
	gn('La fermière nourrit les poules.', 'La fermière', 'DN', { ancre: 'fermière' }),
	gn('Mon voisin arrose ses tomates.', 'ses tomates', 'DN', { ancre: 'tomates' }),
];
