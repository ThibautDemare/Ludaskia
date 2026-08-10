/* ============================================================
   Réponse = une LISTE DE MOTS (#436) : `memeListeDeMots` et le champ
   `Item.motsAttendus` qui l'active.
   ------------------------------------------------------------
   Contexte : une cible PLURIELLE de « clique sur le mot » (tous les noms / tous les
   déterminants d'une phrase au CE2, sujet composé, « ni … ni ») se rejoue en RECOPIE
   sur la fiche et le bilan. La compétence évaluée est de TROUVER les bons mots, pas
   de reproduire le connecteur qui les présente : la mise en forme de la liste est
   donc tolérée, l'orthographe et l'ORDRE non.

   La tolérance est BORNÉE de deux façons, éprouvées ici :
   - aux cibles NON CONTIGUËS : un groupe de mots collés (« a mangé », « sont revenus »)
     n'a pas de connecteur à pardonner, et « a et mangé » n'est pas du français ;
   - à la MISE EN FORME : le pli de casse (la majuscule du mot en tête de phrase) est
     admis ici et NULLE PART ailleurs ; accents et apostrophes restent exigés partout.

   Indépendance auteur ≠ code : les attendus sont dérivés de ces règles-là (énoncées
   dans la consigne et le contrat de l'item), pas du découpage interne. On éprouve
   surtout les BORDS — ce qui ne doit PAS passer (désordre, mot manquant, mot en trop)
   et la NON-FUITE de la tolérance vers les autres leçons, qui restent corrigées par
   égalité de chaîne. Aucun attendu ne dépend d'un tirage libre : les items témoins
   sont retrouvés par leur PHRASE sur une graine balayée (`itemDeLaPhrase`), et les
   invariants de banque sont balayés exhaustivement.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { checkItemAnswer, memeListeDeMots } from '../src/core/items';
import type { Item } from '../src/core/items';
import { getAllLessons, getLessonById, genLessonItem, isClicMotLesson } from '../src/core/catalog';
import type { LessonDef, SchoolLevel } from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import {
	PHRASES_NOM_CE2,
	PHRASES_DET_CE2,
	cibleContigue,
	libelleCible,
	joindrePhrase,
	type PhraseClicMot,
} from '../src/data/francais/grammaire-clic-mot';

const MOTS = ['chien', 'gamelle'];
const TROIS = ['cour', 'enfants', 'ballon'];

/* Item du repli non interactif pour la phrase VOULUE : on balaie les graines jusqu'à ce
   que le tirage montre cette phrase (même graine ⇒ même tirage pour `generate` et
   `genLessonItem`). Rend le cas REPRODUCTIBLE et l'attendu littéral lisible, là où un
   `genLessonItem` non seedé rendrait le test intermittent. */
function itemDeLaPhrase(lesson: LessonDef, level: SchoolLevel, phrase: string): Item | undefined {
	for (let seed = 0; seed < 6000; seed++) {
		const ex = withSeed(seed, () => lesson.exerciseType.generate({ level }));
		if (ex.type !== 'clicMot' || joindrePhrase(ex.tokens) !== phrase) continue;
		return withSeed(seed, () => genLessonItem(lesson, level));
	}
	return undefined;
}

describe('memeListeDeMots — connecteur libre, ordre exigé (#436)', () => {
	it('espaces, virgules, points-virgules et « et » sont interchangeables', () => {
		for (const saisie of [
			'chien gamelle',
			'chien et gamelle',
			'chien, gamelle',
			'chien, et gamelle',
			'chien ; gamelle',
			'  chien   et   gamelle  ', // espaces surnuméraires et bords
		]) {
			expect(memeListeDeMots(saisie, MOTS), saisie).toBe(true);
		}
		for (const saisie of [
			'cour, enfants et ballon', // la forme AFFICHÉE
			'cour enfants ballon', // la forme minimale
			'cour et enfants et ballon', // « et » partout
			'cour; enfants; ballon',
		]) {
			expect(memeListeDeMots(saisie, TROIS), saisie).toBe(true);
		}
	});

	it('l’ORDRE de la phrase reste exigé : une liste dans le désordre est refusée', () => {
		expect(memeListeDeMots('gamelle et chien', MOTS)).toBe(false);
		expect(memeListeDeMots('ballon, enfants et cour', TROIS)).toBe(false);
		expect(memeListeDeMots('cour, ballon et enfants', TROIS)).toBe(false);
	});

	it('une liste trop courte ou trop longue est refusée', () => {
		expect(memeListeDeMots('chien', MOTS)).toBe(false); // mot oublié
		expect(memeListeDeMots('chien gamelle os', MOTS)).toBe(false); // mot en trop
		expect(memeListeDeMots('chien chien gamelle', MOTS)).toBe(false); // doublon
		expect(memeListeDeMots('', MOTS)).toBe(false); // rien saisi
		expect(memeListeDeMots('   ', MOTS)).toBe(false);
		expect(memeListeDeMots(', ; ', MOTS)).toBe(false); // que des séparateurs
	});

	it('la tolérance porte sur la LISTE, pas sur l’orthographe des mots', () => {
		// Accents et apostrophes restent exigés (règle de tout le moteur).
		expect(memeListeDeMots('cour, enfants et ballons', TROIS)).toBe(false); // pluriel fautif
		expect(memeListeDeMots('recreation et eleves', ['récréation', 'élèves'])).toBe(false);
		expect(memeListeDeMots('récréation et élèves', ['récréation', 'élèves'])).toBe(true);
		// Apostrophe DROITE exigée (choix acté du projet) : la typographique reste fausse.
		expect(memeListeDeMots("l'école et Paul", ["l'école", 'Paul'])).toBe(true);
		expect(memeListeDeMots('l’école et Paul', ["l'école", 'Paul'])).toBe(false);
	});

	it('un mot-cible qui EST « et » reste corrigible (retrait seulement si nécessaire)', () => {
		// Cas limite du connecteur : la liste attendue contient elle-même « et ».
		expect(memeListeDeMots('et ou', ['et', 'ou'])).toBe(true);
		expect(memeListeDeMots('et, ou', ['et', 'ou'])).toBe(true);
		// « ni … ni » (cible double de la conjonction CM1) : les deux formes se valent.
		expect(memeListeDeMots('ni ni', ['ni', 'ni'])).toBe(true);
		expect(memeListeDeMots('ni et ni', ['ni', 'ni'])).toBe(true);
		expect(memeListeDeMots('ni et ni et ni', ['ni', 'ni'])).toBe(false); // un « ni » en trop
	});

	it('la casse est REPLIÉE : la majuscule vient de la phrase, pas de la compétence', () => {
		// Les mots à recopier sont PRÉLEVÉS dans une phrase : le premier y porte la majuscule
		// de début de phrase (« Le et sa » pour les déterminants de « Le chien mange sa
		// gamelle. »). Cette majuscule appartient à la phrase source, pas à la compétence
		// évaluée — TROUVER les bons mots. Elle ne doit donc pas décider du juste/faux.
		expect(memeListeDeMots('Le et sa', ['Le', 'sa'])).toBe(true);
		expect(memeListeDeMots('le et sa', ['Le', 'sa'])).toBe(true);
		expect(memeListeDeMots('LE, SA', ['Le', 'sa'])).toBe(true);
		// …et dans l'autre sens (mot attendu en minuscule, recopié avec une majuscule).
		expect(memeListeDeMots('Chien et Gamelle', MOTS)).toBe(true);
		// Le pli de casse ne fait tomber AUCUNE des autres exigences.
		expect(memeListeDeMots('sa et le', ['Le', 'sa'])).toBe(false); // ordre
		expect(memeListeDeMots('LE', ['Le', 'sa'])).toBe(false); // longueur
		expect(memeListeDeMots('ELEVES et ECOLE', ['élèves', 'école'])).toBe(false); // accents
		// Le pli respecte les accents (« É » ↔ « é »), il ne les efface pas.
		expect(memeListeDeMots('ÉLÈVES et ÉCOLE', ['élèves', 'école'])).toBe(true);
	});
});

describe('checkItemAnswer — la règle est portée par la DONNÉE de l’item (#436)', () => {
	const item = (extra: Partial<Item>): Item => ({
		text: 'Recopie les noms : @',
		answer: 'chien et gamelle',
		kind: 'text',
		...extra,
	});

	it('avec `motsAttendus`, la mise en forme de la liste est tolérée', () => {
		const it = item({ motsAttendus: MOTS });
		expect(checkItemAnswer(it, 'chien et gamelle')).toBe(true); // la forme affichée
		expect(checkItemAnswer(it, 'chien gamelle')).toBe(true);
		expect(checkItemAnswer(it, 'chien, gamelle')).toBe(true);
		expect(checkItemAnswer(it, 'gamelle et chien')).toBe(false); // ordre
		expect(checkItemAnswer(it, 'chien')).toBe(false); // mot oublié
	});

	it('SANS `motsAttendus`, la correction reste l’égalité de chaîne (non-régression)', () => {
		const it = item({});
		expect(checkItemAnswer(it, 'chien et gamelle')).toBe(true);
		expect(checkItemAnswer(it, 'chien gamelle')).toBe(false); // connecteur exigé
		expect(checkItemAnswer(it, 'chien, gamelle')).toBe(false);
	});

	it('le pli de casse est BORNÉ à ce chemin : ailleurs, la casse décide encore', () => {
		// `motsAttendus` relâche la casse ; le reste du moteur (`normalizeText`) l'exige.
		// Le même item, avec et sans la liste attendue, ne juge donc PAS pareil.
		expect(checkItemAnswer(item({ motsAttendus: MOTS }), 'Chien et Gamelle')).toBe(true);
		expect(checkItemAnswer(item({}), 'Chien et gamelle')).toBe(false);
		// Une leçon de saisie ordinaire (conjugaison) reste sensible à la casse.
		const conj = genLessonItem(getLessonById('fr-conj-etre-present')!, 'ce2');
		const bonne = String(conj.answer);
		expect(checkItemAnswer(conj, bonne)).toBe(true);
		expect(checkItemAnswer(conj, bonne.toLocaleUpperCase('fr'))).toBe(false);
	});

	it('`intervalle` garde la priorité (les deux règles ne se marchent pas dessus)', () => {
		// Un item d'intercalation ne doit pas être relu comme une liste de mots.
		const it: Item = { text: '@', answer: '455', kind: 'text', intervalle: [450, 465] };
		expect(checkItemAnswer(it, '460')).toBe(true);
		expect(checkItemAnswer(it, '470')).toBe(false);
	});
});

/* Leçons « clique sur le mot » et niveau où elles ont une cible plurielle. */
const CLIC_MOT: Array<[string, SchoolLevel]> = [
	['fr-gram-clic-verbe', 'ce2'],
	['fr-gram-clic-verbe', 'cm1'],
	['fr-gram-clic-det', 'ce2'],
	['fr-gram-clic-det', 'cm1'],
	['fr-gram-clic-noyau', 'ce2'],
	['fr-gram-clic-noyau', 'cm1'],
	['fr-gram-clic-pron', 'ce2'],
	['fr-gram-clic-pron', 'cm1'],
	['fr-gram-clic-adj', 'ce2'],
	['fr-gram-clic-conj', 'cm1'],
	['fr-gram-clic-sujet', 'cm1'],
];

describe('motsAttendus — posé sur une cible plurielle NON CONTIGUË (#436)', () => {
	it('présent SI ET SEULEMENT SI la cible est plusieurs mots SÉPARÉS', () => {
		// Critère dérivé de la raison d'être de la tolérance : ne pas exiger la recopie du
		// CONNECTEUR qui relie des mots séparés. Un groupe contigu (« a mangé ») n'en a pas —
		// « a et mangé » n'est pas du français et n'a pas à être accepté.
		for (const [id, level] of CLIC_MOT) {
			const lesson = getLessonById(id)!;
			for (let i = 0; i < 80; i++) {
				const seed = i * 13 + 7;
				const item = withSeed(seed, () => genLessonItem(lesson, level));
				const ex = withSeed(seed, () => lesson.exerciseType.generate({ level }));
				if (ex.type !== 'clicMot') continue;
				const separes = ex.cibleIndices.length > 1 && !cibleContigue(ex.cibleIndices);
				expect(item.motsAttendus !== undefined, `${id}@${level}#${seed}`).toBe(separes);
				if (!separes) continue;
				// Les mots attendus sont ceux de la cible STOCKÉE, dans l'ordre de la phrase.
				expect(item.motsAttendus, `${id}@${level}#${seed}`).toEqual(
					ex.cibleIndices.map((k) => ex.tokens[k]),
				);
				// …et la réponse affichée reste acceptée par la correction tolérante.
				expect(checkItemAnswer(item, String(item.answer)), `${id}@${level}#${seed}`).toBe(true);
			}
		}
	});

	it('cible CONTIGUË (verbe au passé composé) : aucune tolérance de liste', () => {
		// « sont revenus » = auxiliaire + participe, UN groupe verbal : la réponse se recopie
		// telle quelle. Item choisi par sa PHRASE (graine balayée), donc reproductible.
		const verbe = getLessonById('fr-gram-clic-verbe')!;
		const item = itemDeLaPhrase(verbe, 'cm1', 'Les oiseaux sont revenus au début du printemps.');
		expect(item, 'phrase témoin absente de la banque CM1 du verbe').toBeDefined();
		expect(item!.answer).toBe('sont revenus');
		expect(item!.motsAttendus).toBeUndefined();
		expect(checkItemAnswer(item!, 'sont revenus')).toBe(true);
		expect(checkItemAnswer(item!, 'sont et revenus')).toBe(false); // pas une forme verbale
		expect(checkItemAnswer(item!, 'sont, revenus')).toBe(false);
		expect(checkItemAnswer(item!, 'revenus sont')).toBe(false);
		// Corollaire : hors du chemin liste, la casse redevient significative.
		expect(checkItemAnswer(item!, 'Sont revenus')).toBe(false);
	});

	it('leçons à cible UNIQUE : aucune tolérance de liste (adjectif, pronom sujet CE2)', () => {
		for (const [id, level] of [
			['fr-gram-clic-adj', 'ce2'],
			['fr-gram-clic-pron', 'ce2'],
			['fr-gram-clic-det', 'cm1'],
		] as Array<[string, SchoolLevel]>) {
			const lesson = getLessonById(id)!;
			for (let i = 0; i < 60; i++) {
				const item = withSeed(i * 17 + 3, () => genLessonItem(lesson, level));
				expect(item.motsAttendus, `${id}@${level}`).toBeUndefined();
			}
		}
	});

	it('les DEUX leçons CE2 à cible plurielle : connecteur libre, ordre exigé (items nommés)', () => {
		// Items choisis par leur PHRASE (graine balayée, jamais de tirage libre) et
		// NON PALINDROMIQUES : sur une liste palindrome à la casse près (« le, les, le », cf.
		// le test exhaustif plus bas), « inverser » produit la même chaîne — il n'y aurait
		// rien à refuser, et le test passerait sans rien prouver.
		const cas: Array<[string, string, string, string[]]> = [
			[
				'fr-gram-clic-noyau',
				'Dans la cour, les enfants jouent au ballon.',
				'cour, enfants et ballon',
				['cour', 'enfants', 'ballon'],
			],
			[
				'fr-gram-clic-det',
				'Sur la table, un vase attend des fleurs.',
				'la, un et des',
				['la', 'un', 'des'],
			],
			['fr-gram-clic-det', 'Le chien mange sa gamelle.', 'Le et sa', ['Le', 'sa']],
		];
		for (const [id, phrase, affichee, attendus] of cas) {
			const item = itemDeLaPhrase(getLessonById(id)!, 'ce2', phrase);
			expect(item, `${id} : phrase témoin « ${phrase} » absente`).toBeDefined();
			expect(item!.answer, id).toBe(affichee); // forme LISIBLE (affichée / imprimée)
			expect(item!.motsAttendus, id).toEqual(attendus);
			// Connecteur libre.
			expect(checkItemAnswer(item!, affichee), id).toBe(true);
			expect(checkItemAnswer(item!, attendus.join(' ')), id).toBe(true);
			expect(checkItemAnswer(item!, attendus.join(', ')), id).toBe(true);
			expect(checkItemAnswer(item!, attendus.join(' ').toLocaleLowerCase('fr')), id).toBe(true);
			// Ordre exigé : la liste inversée est une AUTRE liste, donc refusée.
			expect(checkItemAnswer(item!, [...attendus].reverse().join(' et ')), id).toBe(false);
			// Un mot en moins, un mot en trop.
			expect(checkItemAnswer(item!, attendus.slice(0, -1).join(' et ')), id).toBe(false);
			expect(checkItemAnswer(item!, [...attendus, 'chat'].join(' et ')), id).toBe(false);
		}
	});

	it('TOUTE la donnée plurielle : formes équivalentes acceptées, désordre refusé', () => {
		// Balayage exhaustif des deux banques CE2 (pas de tirage) : la règle doit tenir sur
		// chaque item, pas seulement sur ceux qu'un échantillon a croisés.
		for (const [nom, banque] of [
			['NOM', PHRASES_NOM_CE2],
			['DET', PHRASES_DET_CE2],
		] as Array<[string, PhraseClicMot[]]>) {
			for (const p of banque) {
				if (cibleContigue(p.cibleIndices)) continue; // pas de tolérance sur un groupe
				const attendus = p.cibleIndices.map((i) => p.tokens[i]);
				const où = `${nom} « ${joindrePhrase(p.tokens)} »`;
				expect(memeListeDeMots(libelleCible(p.tokens, p.cibleIndices), attendus), où).toBe(true);
				expect(memeListeDeMots(attendus.join(' '), attendus), où).toBe(true);
				expect(memeListeDeMots(attendus.join(', '), attendus), où).toBe(true);
				expect(memeListeDeMots(attendus.join(' ').toLocaleLowerCase('fr'), attendus), où).toBe(
					true,
				);
				expect(memeListeDeMots(attendus.slice(1).join(' '), attendus), où).toBe(false);
				// Le désordre est refusé — SAUF quand la liste inversée est LITTÉRALEMENT la même
				// (palindrome à la casse près) : l'enfant a alors écrit la même réponse, il n'y a
				// rien d'observable à distinguer. On l'assère explicitement plutôt que de l'ignorer.
				const inverse = [...attendus].reverse();
				const pli = (l: string[]) => l.map((m) => m.toLocaleLowerCase('fr')).join('|');
				expect(memeListeDeMots(inverse.join(' et '), attendus), où).toBe(
					pli(inverse) === pli(attendus),
				);
			}
		}
		// Le cas palindrome existe VRAIMENT dans la banque (sinon la branche ci-dessus serait
		// morte et cacherait un jour une vraie fuite d'ordre).
		const palindromes = PHRASES_DET_CE2.filter((p) => {
			const m = p.cibleIndices.map((i) => p.tokens[i].toLocaleLowerCase('fr'));
			return m.length > 1 && m.join('|') === [...m].reverse().join('|');
		});
		expect(palindromes.map((p) => joindrePhrase(p.tokens))).toEqual([
			'Le soir, les étoiles brillent dans le ciel.',
		]);
	});

	it('AUCUNE FUITE : les autres leçons du catalogue n’héritent pas de la tolérance', () => {
		for (const lesson of getAllLessons()) {
			if (isClicMotLesson(lesson)) continue;
			for (const level of lesson.levels) {
				for (let i = 0; i < 4; i++) {
					const item = withSeed(i * 29 + 11, () => genLessonItem(lesson, level));
					expect(item.motsAttendus, `${lesson.id}@${level}`).toBeUndefined();
				}
			}
		}
	});
});
