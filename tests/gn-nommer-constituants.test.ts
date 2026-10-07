/* ============================================================
   Grammaire CM1 — « Nomme les mots du groupe » (#731) : l'API du MODULE.
   ------------------------------------------------------------
   Complément de `groupe-nominal-nommer.test.ts`, qui éprouve la leçon par ses EFFETS
   (catalogue + tirage sous graine) et n'importe rien de son module. Ici on prend
   l'autre bout — les fonctions exportées de `src/data/francais/grammaire-gn-nommer.ts`,
   et d'abord ses CHEMINS D'ÉCHEC.

   Pourquoi les chemins d'échec d'abord : ces garde-fous lèvent À L'IMPORT, puisque la
   banque est bâtie au chargement du module. Aucun tirage ne peut donc les atteindre —
   un module qui lève ne sert plus rien du tout, et toute la suite « par les effets »
   s'effondre d'un bloc sans dire laquelle des règles a sauté. Ce sont aussi les seules
   gardes qui protègent une leçon dont la donnée grossira : chacune refuse à l'écriture
   une faute que le format ne rendrait visible qu'à l'usage, chez l'enfant.

   ── Indépendance ────────────────────────────────────────────────────────────
   Les rôles attendus (« petit » est un adjectif, « chien » un nom) sont écrits ici
   d'après le français et le programme CM1 (§5.1 : Dét + Nom ; Dét + Nom + Adj ;
   Dét + Adj + Nom), jamais relus de la table `ROLES` du module — qui n'est d'ailleurs
   pas exportée, et n'a pas à l'être. Pareil pour les trois longueurs attendues (2, 3,
   3) : elles se comptent sur les modèles du programme, pas dans `MOTS_ATTENDUS`.

   ── Falsifiabilité (ces tests sont VERTS dès leur écriture) ──────────────────
   Le module existe déjà : rien ici ne se justifie tout seul. Deux précautions, et la
   seconde est celle qui compte :
   1. chaque garde est éprouvée par un témoin qui ne viole QU'ELLE, doublé de témoins
      SAINS que la garde ne doit pas refuser ;
   2. l'assertion porte sur le message de CETTE garde-là. Sans quoi la garde
      « déterminant élidé » pourrait disparaître sans que rien ne rougisse : son témoin
      « l'oiseau joyeux » tomberait alors sur la garde suivante (« pas un déterminant »),
      qui lève elle aussi, et un simple `toThrow()` resterait vert.
   Les six neutralisations ont été JOUÉES, une par une, sur une copie du module (harnais
   jetable, supprimé depuis ; détail dans le compte rendu de livraison).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	ETIQUETTES,
	GROUPES_GN_NOMMER,
	GROUPES_REPRIS,
	constituants,
	enonceGnNommer,
	gnDepuisPhrase,
	gnMots,
	libelleGroupe,
	mancheGnNommer,
	type ClasseGN,
	type GroupeNomme,
} from '../src/data/francais/grammaire-gn-nommer';
import { PHRASES_GN } from '../src/data/francais/grammaire-groupe-nominal';
import type { PatronGN, PhraseClicMot } from '../src/data/francais/grammaire-clic-mot-moteur';

const lc = (s: string): string => s.toLowerCase();

/* ============================================================
   1. `constituants()` : le rôle de chaque mot, patron par patron.
   ------------------------------------------------------------
   C'est le cœur de la leçon. Si cette dérivation se trompe, l'enfant n'apprend pas
   « rien », il apprend le CONTRAIRE : « grand » lui est présenté comme un nom.
   ============================================================ */

/** Un groupe, son patron, et ce que le français dit de chacun de ses mots — analyse
    écrite à la main, dans l'ordre de lecture. Les sept groupes sont pris dans ceux que
    la leçon sert réellement (vérifié plus bas) : ce sont donc des étiquettes que
    l'enfant verra, pas des exemples de laboratoire. */
const ANALYSES: Array<{ mots: string[]; patron: PatronGN; classes: ClasseGN[] }> = [
	// Dét + Nom : deux mots, pas d'adjectif à nommer.
	{ mots: ['la', 'lune'], patron: 'DN', classes: ['determinant', 'nom'] },
	{ mots: ['les', 'ciseaux'], patron: 'DN', classes: ['determinant', 'nom'] },
	// Dét + Nom + Adj : l'adjectif SUIT le nom (« un manteau qui est chaud »).
	{ mots: ['un', 'manteau', 'chaud'], patron: 'DNA', classes: ['determinant', 'nom', 'adjectif'] },
	{ mots: ['un', 'ballon', 'rouge'], patron: 'DNA', classes: ['determinant', 'nom', 'adjectif'] },
	// Dét + Adj + Nom : l'adjectif PRÉCÈDE le nom — le piège de la leçon.
	{ mots: ['le', 'petit', 'chien'], patron: 'DAN', classes: ['determinant', 'adjectif', 'nom'] },
	{ mots: ['ce', 'grand', 'jardin'], patron: 'DAN', classes: ['determinant', 'adjectif', 'nom'] },
	{
		mots: ['mes', 'vieilles', 'chaussures'],
		patron: 'DAN',
		classes: ['determinant', 'adjectif', 'nom'],
	},
];

const cleGroupe = (mots: string[]): string => mots.map(lc).join(' ');

describe('constituants() — le rôle vient de la POSITION et du patron (#731)', () => {
	it('les trois patrons du programme CM1 étiquettent chaque mot dans l’ordre de lecture', () => {
		const fautes: string[] = [];
		for (const { mots, patron, classes } of ANALYSES) {
			const vus = constituants({ mots, patron });
			if (vus.map((c) => c.mot).join(' ') !== mots.join(' ')) {
				fautes.push(`« ${mots.join(' ')} » : les mots ne reviennent pas dans l'ordre de lecture`);
			}
			vus.forEach((c, i) => {
				if (c.classe !== classes[i]) {
					fautes.push(
						`« ${mots.join(' ')} » (${patron}) : « ${c.mot} » est donné pour ${c.classe}, c'est un(e) ${classes[i]}`,
					);
				}
			});
		}
		expect(fautes, 'la leçon enseignerait une analyse grammaticale fausse').toEqual([]);
	});

	it('les sept groupes analysés à la main sont bien SERVIS par la leçon', () => {
		// Sans cette vérification, le test précédent pourrait rester vert sur des groupes
		// que la banque ne contient pas : il n'éprouverait plus la leçon, seulement ma table.
		const servis = new Map(GROUPES_GN_NOMMER.map((g) => [cleGroupe(g.mots), g.patron]));
		const absents = ANALYSES.filter((a) => !servis.has(cleGroupe(a.mots))).map((a) =>
			a.mots.join(' '),
		);
		expect(absents, 'groupe analysé ici mais absent de la banque servie').toEqual([]);
		const desaccords = ANALYSES.filter((a) => servis.get(cleGroupe(a.mots)) !== a.patron).map(
			(a) =>
				`« ${a.mots.join(' ')} » : la banque le déclare ${servis.get(cleGroupe(a.mots))}, le français en fait un ${a.patron}`,
		);
		expect(desaccords, 'patron déclaré contraire à l’analyse grammaticale').toEqual([]);
	});

	it('le patron, et lui SEUL, décide : un patron faux produit une étiquette fausse en silence', () => {
		// Ce test ne décrit pas un défaut à corriger, il NOMME le point aveugle du module :
		// le rôle se lit à la position, donc rien dans `constituants()` ne peut repérer un
		// patron mal déclaré. « un grand tableau » est un Dét + Adj + Nom ; déclaré DNA, il
		// fait de « grand » un nom — et la leçon l'enseigne tel quel, sans rien casser.
		// C'est la raison d'être des garde-fous du § suivant, qui attrapent cette faute à
		// la CONSTRUCTION, seul endroit où elle est encore visible.
		const mots = ['un', 'grand', 'tableau'];
		const juste = constituants({ mots, patron: 'DAN' });
		expect(juste.map((c) => c.classe)).toEqual(['determinant', 'adjectif', 'nom']);
		const fausse = constituants({ mots, patron: 'DNA' });
		expect(
			fausse.map((c) => c.classe),
			'le patron déclaré ne commande plus le rôle : la table des rôles ne se lit plus par position',
		).toEqual(['determinant', 'nom', 'adjectif']);
	});

	it('une manche sert une paire par mot : le mot à gauche, l’étiquette de SA classe à droite', () => {
		const g: GroupeNomme = { mots: ['le', 'petit', 'chien'], patron: 'DAN' };
		const ex = mancheGnNommer(g);
		expect(ex.type).toBe('appariement');
		if (ex.type !== 'appariement') return;
		// Attendu dérivé du français (petit = adjectif, chien = nom) ; `ETIQUETTES` ne sert
		// qu'à savoir sous quel MOT la leçon affiche chaque classe, pas qui est quoi.
		const attendu = new Map<string, string>([
			['le', ETIQUETTES.determinant],
			['petit', ETIQUETTES.adjectif],
			['chien', ETIQUETTES.nom],
		]);
		expect(ex.paires).toHaveLength(3);
		const servi = new Map(ex.paires.map((p) => [lc(p.gauche), p.droite]));
		expect([...servi.entries()].sort()).toEqual([...attendu.entries()].sort());
	});
});

/* ============================================================
   2. `gnMots()` : ce que le constructeur REFUSE d'écrire dans la banque.
   ------------------------------------------------------------
   Chaque témoin fautif ne viole qu'une règle, et l'assertion nomme la règle attendue
   (cf. en-tête, point 2). Les témoins SAINS tiennent l'autre bord : une garde devenue
   trop large refuserait du contenu légitime, et la banque maigrirait en silence.
   ============================================================ */
describe('gnMots() — garde-fous de construction (#731)', () => {
	it('refuse un nombre de mots qui ne correspond pas au patron déclaré', () => {
		// Programme §5.1 : Dét + Nom fait DEUX mots ; Dét + Nom + Adj et Dét + Adj + Nom
		// en font TROIS. Un patron déclaré à côté décalerait toutes les étiquettes.
		expect(() => gnMots('la lune', 'DNA')).toThrow(/en attend/);
		expect(() => gnMots('la lune', 'DAN')).toThrow(/en attend/);
		expect(() => gnMots('un grand tableau', 'DN')).toThrow(/en attend/);
		expect(() => gnMots('le chat de la voisine', 'DNA')).toThrow(/en attend/);
		// Témoins sains : les trois comptes légitimes du programme passent.
		expect(() => gnMots('la lune', 'DN')).not.toThrow();
		expect(() => gnMots('un manteau chaud', 'DNA')).not.toThrow();
		expect(() => gnMots('un grand tableau', 'DAN')).not.toThrow();
	});

	it('refuse un mot répété dans le groupe, quelle que soit la casse', () => {
		// Les deux colonnes du widget d'appariement s'indexent par le TEXTE : deux mots
		// identiques à gauche, et plus rien ne dit laquelle des deux étiquettes va avec
		// laquelle — l'enfant ne peut ni réussir ni échouer de façon lisible.
		expect(() => gnMots('le petit petit', 'DAN')).toThrow(/répète un mot/);
		expect(() => gnMots('ces chats Chats', 'DNA')).toThrow(/répète un mot/);
		expect(() => gnMots('ces chats noirs', 'DNA')).not.toThrow();
	});

	it('refuse un déterminant élidé en tête (« l’oiseau » est UN seul mot)', () => {
		// Le tokeniseur maison colle l'apostrophe au nom. Le groupe ne se découpe alors
		// plus en morceaux étiquetables : l'enfant ne peut pas nommer le déterminant à
		// part, qui est précisément ce que la leçon lui demande.
		expect(() => gnMots("l'oiseau joyeux", 'DN')).toThrow(/élidé/);
		expect(() => gnMots("l'école", 'DN')).toThrow(/en attend/); // un seul mot : la longueur d'abord
		expect(() => gnMots('la lune', 'DN')).not.toThrow();
	});

	it('refuse une tête qui n’est pas un déterminant du programme CM1', () => {
		// Article, possessif, démonstratif : les trois sous-catégories nommées par le
		// programme. Un quantifieur, un numéral ou un nom propre n'ouvrent pas un groupe
		// que cette leçon sait faire étiqueter.
		expect(() => gnMots('plusieurs élèves', 'DN')).toThrow(/n'ouvre pas/);
		expect(() => gnMots('chaque enfant', 'DN')).toThrow(/n'ouvre pas/);
		expect(() => gnMots('trois chatons', 'DN')).toThrow(/n'ouvre pas/);
		expect(() => gnMots('Paul dort', 'DN')).toThrow(/n'ouvre pas/);
		// Témoins sains : une tête de chaque sous-catégorie du programme.
		expect(() => gnMots('les ciseaux', 'DN'), 'article').not.toThrow();
		expect(() => gnMots('nos voisins', 'DN'), 'possessif').not.toThrow();
		expect(() => gnMots('ces cailloux', 'DN'), 'démonstratif').not.toThrow();
	});

	it('refuse un SECOND déterminant : c’est là qu’un patron mal déclaré se trahit', () => {
		// Le point important de cette garde n'est pas d'interdire les groupes emboîtés
		// (ils font presque toujours plus de trois mots, donc la garde de longueur les
		// prend avant). C'est d'attraper la faute que `constituants()` rendrait MUETTE :
		// un déterminant en 2ᵉ ou 3ᵉ position recevrait l'étiquette « adjectif » ou
		// « nom » sans que rien ne casse — l'enfant apprendrait que « une » est un
		// adjectif. La construction est le dernier endroit où cette faute est visible.
		expect(() => gnMots('un une pomme', 'DAN')).toThrow(/second déterminant/);
		expect(() => gnMots('son vélo mon', 'DNA')).toThrow(/second déterminant/);
		// Ce que le module servirait si la garde tombait (étiquette fausse, aucun bruit) :
		expect(constituants({ mots: ['un', 'une', 'pomme'], patron: 'DAN' })[1]).toEqual({
			mot: 'une',
			classe: 'adjectif',
		});
	});
});

/* ============================================================
   3. `gnDepuisPhrase()` : la banque de #716 relue, sans être touchée.
   ============================================================ */

/** Phrase annotée fabriquée pour le test (jamais un item de la banque réelle). */
function phraseTemoin(tokens: string[], cibleIndices: number[], patron?: PatronGN): PhraseClicMot {
	const p: PhraseClicMot = { tokens, cibleIndices, explication: 'témoin de test' };
	if (patron) p.patron = patron;
	return p;
}

describe('gnDepuisPhrase() — extraction du groupe d’une phrase de #716 (#731)', () => {
	it('refuse une phrase sans patron au lieu de deviner lequel de ses mots est le nom', () => {
		// Toutes les autres banques de la famille `clic-mot` ciblent autre chose qu'un
		// groupe nominal et ne portent donc pas de patron. Deviner reviendrait à trancher
		// « nom ou adjectif ? » avec un lexique fini, c'est-à-dire à se tromper un jour.
		const sansPatron = phraseTemoin(['Le', 'chat', 'dort', '.'], [0, 1]);
		expect(() => gnDepuisPhrase(sansPatron)).toThrow(/sans patron/);
		expect(() =>
			gnDepuisPhrase(phraseTemoin(['Le', 'chat', 'dort', '.'], [0, 1], 'DN')),
		).not.toThrow();
	});

	it('le groupe se lit en MINUSCULE quand il ouvrait la phrase, les autres mots intacts', () => {
		// Le groupe ne commence plus une phrase : il est montré seul dans l'énoncé. La
		// majuscule de la phrase d'origine n'a aucune raison de voyager jusque-là.
		const enTete = phraseTemoin(
			['Mes', 'vieilles', 'chaussures', 'craquent', 'encore', '.'],
			[0, 1, 2],
			'DAN',
		);
		expect(gnDepuisPhrase(enTete).mots).toEqual(['mes', 'vieilles', 'chaussures']);
		const auMilieu = phraseTemoin(
			['Elle', 'dessine', 'un', 'grand', 'tableau', '.'],
			[2, 3, 4],
			'DAN',
		);
		expect(gnDepuisPhrase(auMilieu).mots).toEqual(['un', 'grand', 'tableau']);
	});

	it('les mêmes garde-fous s’appliquent à ce que #716 fournit', () => {
		// La reprise d'une banque voisine ne doit pas être une porte dérobée : une cible
		// de trois mots déclarée Dét + Nom passerait sinon sans que personne ne la voie.
		const troisMotsDeclaresDN = phraseTemoin(
			['Elle', 'dessine', 'un', 'grand', 'tableau', '.'],
			[2, 3, 4],
			'DN',
		);
		expect(() => gnDepuisPhrase(troisMotsDeclaresDN)).toThrow(/en attend/);
		const teteSansDeterminant = phraseTemoin(['Paul', 'dort', '.'], [0, 1], 'DN');
		expect(() => gnDepuisPhrase(teteSansDeterminant)).toThrow(/n'ouvre pas/);
	});

	it('GROUPES_REPRIS reprend CHAQUE phrase de #716, sans en perdre ni en inventer', () => {
		// Reprise intégrale (décision d'implémentation assumée) : ce qui compte
		// pédagogiquement est que l'enfant RETROUVE ce qu'il vient de délimiter.
		expect(GROUPES_REPRIS).toHaveLength(PHRASES_GN.length);
		const fautes: string[] = [];
		PHRASES_GN.forEach((p, i) => {
			const attendus = p.cibleIndices.map((k) => lc(p.tokens[k]));
			const vus = GROUPES_REPRIS[i].mots.map(lc);
			if (vus.join(' ') !== attendus.join(' ')) {
				fautes.push(`#${i} : « ${vus.join(' ')} » au lieu de « ${attendus.join(' ')} »`);
			}
			if (GROUPES_REPRIS[i].patron !== p.patron) {
				fautes.push(`#${i} : patron ${GROUPES_REPRIS[i].patron} au lieu de ${p.patron}`);
			}
		});
		expect(fautes, 'la reprise de #716 déforme un groupe').toEqual([]);
	});
});

/* ============================================================
   4. La banque servie : un groupe = un item, et l'énoncé le montre tel qu'il se lit.
   ============================================================ */
describe('GROUPES_GN_NOMMER — assemblage de la banque (#731)', () => {
	it('aucun groupe n’est servi deux fois', () => {
		// Un doublon ne casse rien de visible : il sort simplement deux fois plus souvent
		// que les autres, et fausse du même coup la composition qu'on croit mesurer
		// (« ce que l'enfant retrouve » contre « ce qui est neuf »).
		const vus = new Map<string, number>();
		for (const g of GROUPES_GN_NOMMER) {
			vus.set(cleGroupe(g.mots), (vus.get(cleGroupe(g.mots)) ?? 0) + 1);
		}
		const doubles = [...vus.entries()].filter(([, n]) => n > 1).map(([k, n]) => `« ${k} » ×${n}`);
		expect(doubles).toEqual([]);
	});

	it('un groupe que #716 cible dans DEUX phrases ne fait qu’un seul item', () => {
		// #716 vise « les oiseaux » dans deux phrases différentes ; ici les deux phrases
		// ont disparu, il ne reste que le groupe. Le test se dérive de la banque voisine
		// plutôt que de citer le groupe, mais il exige qu'un tel cas EXISTE : sinon la
		// déduplication ne serait éprouvée par rien.
		const comptes = new Map<string, number>();
		for (const g of GROUPES_REPRIS) {
			comptes.set(cleGroupe(g.mots), (comptes.get(cleGroupe(g.mots)) ?? 0) + 1);
		}
		const repetes = [...comptes.entries()].filter(([, n]) => n > 1).map(([k]) => k);
		expect(
			repetes,
			'aucune phrase de #716 ne partage son groupe avec une autre : la déduplication n’est plus éprouvée ici',
		).not.toEqual([]);
		const servis = GROUPES_GN_NOMMER.map((g) => cleGroupe(g.mots));
		for (const k of repetes) {
			expect(
				servis.filter((s) => s === k),
				`« ${k} » servi plusieurs fois`,
			).toHaveLength(1);
		}
	});

	it('chaque groupe servi tient dans un patron du programme : 2 mots, ou 3 avec un adjectif', () => {
		const fautes: string[] = [];
		for (const g of GROUPES_GN_NOMMER) {
			const attendus = g.patron === 'DN' ? 2 : 3;
			if (g.mots.length !== attendus) {
				fautes.push(`« ${libelleGroupe(g)} » : ${g.mots.length} mot(s) pour un patron ${g.patron}`);
			}
			const classes = constituants(g).map((c) => c.classe);
			if (classes.filter((c) => c === 'determinant').length !== 1) {
				fautes.push(`« ${libelleGroupe(g)} » : le groupe doit avoir un déterminant et un seul`);
			}
			if (classes.filter((c) => c === 'nom').length !== 1) {
				fautes.push(`« ${libelleGroupe(g)} » : le groupe doit avoir un nom et un seul`);
			}
			if (classes.filter((c) => c === 'adjectif').length !== (g.patron === 'DN' ? 0 : 1)) {
				fautes.push(`« ${libelleGroupe(g)} » : un seul adjectif, et seulement à trois mots`);
			}
		}
		expect(fautes).toEqual([]);
	});

	it('l’énoncé montre le groupe D’UN SEUL TENANT, dans l’ordre de lecture', () => {
		// L'enfant doit pouvoir LIRE le groupe pour décider : c'est l'ordre des mots qui
		// lui dit si l'adjectif précède ou suit le nom. Des mots présents mais dispersés
		// dans la phrase, ou recollés dans le désordre, lui retireraient cet indice —
		// et la moitié de la leçon avec.
		const fautes: string[] = [];
		for (const g of GROUPES_GN_NOMMER) {
			const lisible = g.mots.join(' ');
			if (!enonceGnNommer(g).includes(lisible)) {
				fautes.push(`« ${lisible} » ne se lit pas tel quel dans « ${enonceGnNommer(g)} »`);
			}
			if (libelleGroupe(g) !== lisible) {
				fautes.push(`libelleGroupe rend « ${libelleGroupe(g)} » au lieu de « ${lisible} »`);
			}
		}
		expect(fautes).toEqual([]);
		// Témoin nommé, pour que l'échec se lise sans dérouler la banque.
		expect(enonceGnNommer({ mots: ['un', 'grand', 'tableau'], patron: 'DAN' })).toContain(
			'un grand tableau',
		);
	});
});
