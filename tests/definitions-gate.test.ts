import { describe, it, expect } from 'vitest';
import { CHAMPS } from '../src/data/francais/champs-lexicaux';
import { vivierMotsCases } from '../src/core/jeux/mots-cases';
import { DEFINITIONS, MOTS_SANS_DEFINITION } from '../src/data/francais/definitions';

/* ============================================================
   Gate de la banque de définitions (#665, critères 5 à 13).

   ÉCRIT AVANT LA BANQUE, ET DONC ROUGE À L'IMPORT tant que
   `src/data/francais/definitions.ts` n'existe pas. Ce n'est pas un accident :
   ces critères portent sur 219 définitions à écrire à la main, et une consigne
   relue à l'œil sur 219 items ne tient pas. Le gate est la spec exécutable que
   le rédacteur lance en boucle.

   ── LE CONTRAT : ce que le module doit exporter ─────────────────────────────

   ```ts
   // src/data/francais/definitions.ts
   export interface Definition {
     mot: string; // minuscules, NFC, lettres seulement (une case = une lettre)
     def: string; // UNE phrase, majuscule initiale, point final
   }
   export const DEFINITIONS: readonly Definition[];

   export interface MotSansDefinition {
     mot: string;    // un mot du vivier, même forme que ci-dessus
     raison: string; // POURQUOI il ne se définit pas, en clair
   }
   export const MOTS_SANS_DEFINITION: readonly MotSansDefinition[];
   ```

   Seuls les deux NOMS de constantes et la forme des champs sont contraints ;
   les noms d'interfaces sont libres (ce fichier ne les importe pas).

   Trois points du contrat qui ne se devinent pas :

   1. **La raison d'exclusion est une DONNÉE, pas un commentaire de code.** Le
      critère 5 demande une liste « fermée et commentée » ; un commentaire n'est
      relisable par aucune machine, et se désynchronise de la liste dès la
      première retouche. Un champ `raison` rend l'exigence vérifiable et se lit
      au même endroit que ce qu'il justifie.
   2. **Les 59 mots déjà définis dans `CHAMPS` ne se recopient pas.** Le gate
      exige seulement que la définition du même mot soit IDENTIQUE des deux
      côtés — un enfant qui croise le mot dans la leçon « Le mot juste » puis
      dans la grille doit lire la même chose. Le seul moyen propre de tenir ça
      dans la durée est de DÉRIVER ces entrées de `CHAMPS` (les 72 définitions y
      passent déjà toutes les règles de ce gate, mesuré), pas d'en copier les
      chaînes : deux copies divergent au premier correctif de typo.
   3. **La banque peut aller au-delà du vivier** (mots de 9 lettres et plus,
      mots d'une autre source). Les règles de contenu 6 à 12 s'appliquent alors
      à TOUTES les entrées ; seules la couverture (5) et le plancher (13) se
      mesurent sur la tranche jouable.

   ── LE PÉRIMÈTRE MESURÉ, et un écart avec l'issue ───────────────────────────

   `vivierMotsCases()` rend 276 mots, dont **235** de 4 à 8 lettres — l'issue en
   annonce 238. L'écart tient au moins pour partie à `dès` (3 lettres), qui
   figure parmi les 17 exclusions alors qu'il tombe hors de la tranche. Le gate
   ne fige donc AUCUN de ces nombres : il recalcule la tranche à partir du
   vivier, et n'exige des exclusions que d'être des mots du vivier (toutes
   longueurs), ce qui laisse `dès` passer sans l'imposer.

   Sur 235 mots et 16 exclusions dans la tranche, il reste 219 définitions à
   écrire, et le plancher de 200 (critère 13) laisse au plus 35 exclusions : une
   liste d'exclusion qui gonfle pour esquiver le travail bute dessus.

   ── LE CRITÈRE 11, ET POURQUOI IL EST PRIS AU MOT ───────────────────────────

   La « tête catégorielle » se lit comme l'issue l'écrit : le segment jusqu'au
   premier « qui », « pour » ou « de », comparé entre mots de MÊME longueur, une
   fois la casse, les accents et la ponctuation neutralisés. Pris à la lettre,
   c'est plus strict que son exemple (« Un animal de la ferme » deux fois, qui
   violerait déjà le critère 12) : « Un outil pour creuser » et « Un outil pour
   retourner la terre » partagent la tête « un outil » alors que l'enfant, lui,
   lit la phrase entière et ne peut pas se tromper.

   Cette sévérité est GARDÉE, et mesurée avant de l'être : sur les 72
   définitions relues de `CHAMPS`, **zéro** collision, 70 têtes distinctes sur
   72, et les deux répétitions (« un outil » : râpe/bêche, « le bord » :
   lisière/trottoir) tombent sur des longueurs différentes. Extrapolé au taux
   observé (2 répétitions pour 2 556 paires) sur les 5 063 paires de même
   longueur des 219 mots, on attend **de l'ordre de 4 collisions** sur un
   premier jet — quelques phrases à rouvrir, pas une banque à réécrire. Et la
   reprise va dans le bon sens : « Un outil à dents pour ramasser les feuilles »
   se distingue dès les trois premiers mots, ce qui est précisément ce que fait
   un enfant qui balaie une liste de définitions.

   Deux effets de bord assumés, à connaître avant de rédiger : une définition
   sans « qui / pour / de » a pour tête la phrase entière (le critère se
   confond alors avec le 12), et « du », « des », « d'eau » ne coupent pas —
   seul le mot « de » coupe.

   ── LE CRITÈRE 7, ET CE QU'IL SAIT VRAIMENT ATTRAPER ────────────────────────

   Comparer sur le radical est un compromis, pas une science : trop court, il
   attrape « château » dans la définition de « chat » ; trop long, il rate
   « nageur » dans celle de « nager ». Le détecteur retenu coupe une finale
   d'inflexion, garde au moins 4 caractères, et n'accepte le mot trouvé que si
   ce qui dépasse le radical est un suffixe français listé — c'est ce dernier
   filtre qui laisse passer « château » (« -eau ») et « portrait » (« -rait »)
   tout en retenant « chaton », « portail », « jardinier », « nageur ».

   Mesures : **0** faux positif sur les 72 définitions relues de `CHAMPS` ; en
   produit croisé (chaque mot du vivier confronté aux 72 définitions, 16 920
   essais, borne haute du bruit) 55 déclenchements, dont un seul n'est pas une
   vraie famille (« sort » / « sorte »). Le détecteur est lui-même éprouvé plus
   bas sur une table de cas, dans les deux sens : ce qu'il doit attraper et ce
   qu'il ne doit pas.

   ── CE QUE CE GATE NE DIT PAS ───────────────────────────────────────────────

   Qu'une définition soit JUSTE, compréhensible par un CE2, ou qu'elle désigne
   bien la chose : aucune machine ne le voit. Le gate écarte les défauts de
   FORME et les collisions, il ne remplace ni le pédagogue ni le rédacteur.
   ============================================================ */

/** La tranche jouable, telle que l'issue l'a mesurée sur les motifs. Recalculée
    sur le vivier réel, jamais figée : si un motif de #665 réclamait un jour une
    case de 9, c'est cette borne qui bouge, et la couverture suit. */
const LONGUEUR_MIN = 4;
const LONGUEUR_MAX = 8;

/** Critère 13. En dessous, mesuré, les motifs cessent de se remplir. */
const PLANCHER_DEFINIS = 200;

/** Critère 6. */
const MOTS_MAX = 12;

/** Casse, accents et apostrophes neutralisés — tout ce qui suit compare du sens,
    jamais de la typographie. L'apostrophe typographique reste la bonne
    typographie d'un texte AFFICHÉ (arbitrage #664), elle n'est pliée que pour
    la comparaison. */
const plie = (s: string): string =>
	s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase();

/** Les mots d'une définition, au sens du critère 6 : ce que sépare une espace.
    « l'articulation » compte donc pour un, « bien-être » aussi. */
const motsDe = (def: string): string[] =>
	def
		.replace(/[.!?]$/, '')
		.split(/\s+/)
		.filter(Boolean);

/** Radical grossier : on retire une finale d'inflexion et on garde 4 caractères
    au moins. « nager » → « nage », « portes » → « port », « chat » → « chat ». */
const radical = (mot: string): string => {
	const brut = plie(mot);
	const coupe = brut.replace(/(eaux|aux|er|ir|re|s|x|e)$/, '');
	return coupe.length >= 4 ? coupe : brut.slice(0, 4);
};

/** Ce qui a le droit de dépasser le radical pour rester « de la famille ».
    Volontairement fermée : « -eau » et « -rait » n'y sont pas, ce qui évite
    d'accuser « château » dans « chat » et « portrait » dans « porte ». */
const SUFFIXES_FAMILLE =
	/^(s|x|e|es|ee|ees|ent|ant|ants|ante|antes|ait|era|ons|ez|i|is|it|on|onne|onnes|ette|ettes|er|ers|ier|iers|iere|ieres|eur|eurs|euse|euses|eux|age|ages|ement|ements|erie|et|ets|ure|ures|ance|al|aux|ien|ienne|ine|iste|istes|able|ables|esse|ade|ur|urs|ail|ails|aille|ailles)$/;

/** Les mots de `def` que le critère 7 tient pour de la famille de `mot`. */
const familleTouchee = (mot: string, def: string): string[] => {
	const r = radical(mot);
	const vus: string[] = [];
	for (const brut of motsDe(plie(def))) {
		const w = brut.replace(/[^a-z0-9]/g, '');
		if (w.length < r.length || !w.startsWith(r)) continue;
		if (w !== r && !SUFFIXES_FAMILLE.test(w.slice(r.length))) continue;
		vus.push(w);
	}
	return vus;
};

/** La tête catégorielle du critère 11 : jusqu'au premier « qui », « pour » ou
    « de ». Aucun des trois n'apparaissant, c'est la phrase entière. */
const tete = (def: string): string =>
	plie(def)
		.replace(/[.!?]+$/, '')
		.split(/\b(?:qui|pour|de)\b/)[0]
		.replace(/[^a-z0-9 ]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

/** Critère 12 : deux définitions « identiques » à la ponctuation près. */
const empreinte = (def: string): string =>
	plie(def)
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

/** Critère 8 : la définition désigne la chose, jamais un rapport à un autre mot. */
const META_LANGUE = /(synonyme|contraire|veut dire|dit aussi|signifie|meme sens|autre mot|mot qui)/;

/** Critère 9 : rien de la FORME de la solution. */
const INDICE_DE_FORME =
	/(commence par|commencent par|finit par|finissent par|termine par|premiere lettre|derniere lettre|initiale|rime|s'ecrit|ce mot|(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|[0-9]+) lettres|syllabe)/;

/** Une phrase et une seule : majuscule initiale, point final, aucune ponctuation
    forte à l'intérieur. Les points de suspension sont refusés ici aussi — une
    définition à trous est explicitement hors périmètre. */
const UNE_PHRASE = /^[A-ZÀ-ÖØ-Þ][^.!?…]*\.$/u;

/** Une case porte une lettre : ni espace, ni apostrophe, ni trait d'union.
    Même filtre que le vivier des mots à caser (`FORME_JOUABLE`). */
const FORME_JOUABLE = /^[a-zà-öø-ÿœæ]+$/;

const VIVIER = vivierMotsCases().map((m) => m.normalize('NFC'));
const TRANCHE = VIVIER.filter((m) => m.length >= LONGUEUR_MIN && m.length <= LONGUEUR_MAX);

const DEFINI = new Map(DEFINITIONS.map((d) => [d.mot.normalize('NFC'), d.def]));
const EXCLU = new Map(MOTS_SANS_DEFINITION.map((x) => [x.mot.normalize('NFC'), x.raison]));

describe('Banque de définitions — couverture du vivier (#665, critère 5)', () => {
	it('chaque mot de 4 à 8 lettres est soit défini, soit explicitement exclu', () => {
		const muets = TRANCHE.filter((m) => !DEFINI.has(m) && !EXCLU.has(m)).sort();
		// Le silence n'est pas une décision : un mot oublié est indiscernable d'un mot
		// qu'on a jugé indéfinissable, et la grille, elle, ne l'appellera jamais.
		expect(muets).toEqual([]);
	});

	it('aucun mot n’est à la fois défini et déclaré indéfinissable', () => {
		const deuxFois = [...EXCLU.keys()].filter((m) => DEFINI.has(m)).sort();
		expect(deuxFois).toEqual([]);
	});

	it('la liste d’exclusion ne parle que de mots qui existent dans le vivier', () => {
		// Une exclusion orpheline ne protège plus rien : elle signale que le vivier a
		// bougé sous la banque, et c'est justement ce qu'on veut voir tout de suite.
		const orphelines = [...EXCLU.keys()].filter((m) => !VIVIER.includes(m)).sort();
		expect(orphelines).toEqual([]);
	});

	it('chaque exclusion dit POURQUOI le mot ne se définit pas', () => {
		const sansRaison = [...EXCLU.entries()]
			.filter(([mot, raison]) => raison.trim().length < 10 || plie(raison.trim()) === plie(mot))
			.map(([mot, raison]) => `${mot} :: « ${raison} »`)
			.sort();
		expect(sansRaison).toEqual([]);
	});

	it('la banque est bien formée : mots en minuscules NFC, lettres seules, sans doublon', () => {
		const malformes = DEFINITIONS.filter(
			(d) => d.mot !== d.mot.toLowerCase().normalize('NFC') || !FORME_JOUABLE.test(d.mot),
		)
			.map((d) => d.mot)
			.sort();
		expect(malformes).toEqual([]);

		const malformesExclus = MOTS_SANS_DEFINITION.filter(
			(x) => x.mot !== x.mot.toLowerCase().normalize('NFC') || !FORME_JOUABLE.test(x.mot),
		)
			.map((x) => x.mot)
			.sort();
		expect(malformesExclus).toEqual([]);

		const vus = new Set<string>();
		const doublons = new Set<string>();
		for (const d of DEFINITIONS) {
			const m = d.mot.normalize('NFC');
			if (vus.has(m)) doublons.add(m);
			vus.add(m);
		}
		// Deux définitions pour un mot : le cadrage a tranché « une seule par mot »,
		// et le croisement d'unicité du critère 11 ne saurait pas laquelle regarder.
		expect([...doublons].sort()).toEqual([]);
	});
});

describe('Banque de définitions — la phrase (#665, critères 6 et 10)', () => {
	it('critère 6 : douze mots au plus', () => {
		const trop = DEFINITIONS.filter((d) => motsDe(d.def).length > MOTS_MAX)
			.map((d) => `${d.mot} (${String(motsDe(d.def).length)} mots) :: ${d.def}`)
			.sort();
		expect(trop).toEqual([]);
	});

	it('critère 6 : une seule phrase, majuscule au début, point à la fin', () => {
		const mauvaises = DEFINITIONS.filter((d) => !UNE_PHRASE.test(d.def.normalize('NFC')))
			.map((d) => `${d.mot} :: ${d.def}`)
			.sort();
		expect(mauvaises).toEqual([]);
	});

	it('critère 6 : pas d’espace en trop', () => {
		const sales = DEFINITIONS.filter((d) => d.def !== d.def.trim() || /\s\s/.test(d.def))
			.map((d) => `${d.mot} :: « ${d.def} »`)
			.sort();
		expect(sales).toEqual([]);
	});

	it('critère 10 : ni point-virgule, ni deux-points, ni parenthèse', () => {
		// Une parenthèse est presque toujours une clause qu'on a renoncé à intégrer.
		const ponctuees = DEFINITIONS.filter((d) => /[;:()]/.test(d.def))
			.map((d) => `${d.mot} :: ${d.def}`)
			.sort();
		expect(ponctuees).toEqual([]);
	});
});

describe('Banque de définitions — ce qu’une définition ne dit pas (#665, critères 7 à 9)', () => {
	it('critère 7 : ni le mot défini, ni un mot de sa famille', () => {
		const fautives = DEFINITIONS.map((d) => ({ d, hits: familleTouchee(d.mot, d.def) }))
			.filter((x) => x.hits.length > 0)
			.map((x) => `${x.d.mot} [${radical(x.d.mot)}] <- ${x.hits.join(', ')} :: ${x.d.def}`)
			.sort();
		expect(fautives).toEqual([]);
	});

	it('critère 8 : aucun terme méta-linguistique', () => {
		const meta = DEFINITIONS.filter((d) => META_LANGUE.test(plie(d.def)))
			.map((d) => `${d.mot} :: ${d.def}`)
			.sort();
		expect(meta).toEqual([]);
	});

	it('critère 9 : aucun élément de la forme de la solution', () => {
		const indices = DEFINITIONS.filter((d) => INDICE_DE_FORME.test(plie(d.def)))
			.map((d) => `${d.mot} :: ${d.def}`)
			.sort();
		expect(indices).toEqual([]);
	});
});

describe('Banque de définitions — deux mots ne se disputent pas une réponse (#665, critères 11 et 12)', () => {
	it('critère 11 : deux mots de même longueur n’ont pas la même tête catégorielle', () => {
		const par = new Map<string, { mot: string; def: string }[]>();
		for (const d of DEFINITIONS) {
			const cle = `${String(d.mot.length)}|${tete(d.def)}`;
			par.set(cle, [...(par.get(cle) ?? []), { mot: d.mot, def: d.def }]);
		}
		const collisions = [...par.entries()]
			.filter(([, v]) => v.length > 1)
			.map(([cle, v]) => `${cle} => ${v.map((x) => `${x.mot} « ${x.def} »`).join(' /// ')}`)
			.sort();
		// L'enfant lit deux définitions qui commencent pareil, écrit celle qui lui vient,
		// et le jeu lui dit non alors qu'il a raison.
		expect(collisions).toEqual([]);
	});

	it('critère 12 : deux définitions ne sont jamais identiques', () => {
		const par = new Map<string, string[]>();
		for (const d of DEFINITIONS) {
			const e = empreinte(d.def);
			par.set(e, [...(par.get(e) ?? []), d.mot]);
		}
		const copies = [...par.entries()]
			.filter(([, v]) => v.length > 1)
			.map(([e, v]) => `${v.join(', ')} :: ${e}`)
			.sort();
		expect(copies).toEqual([]);
	});
});

describe('Banque de définitions — le volume et la cohérence (#665, critère 13)', () => {
	it('critère 13 : au moins 200 mots du vivier portent une définition', () => {
		const definis = TRANCHE.filter((m) => DEFINI.has(m));
		// Mesuré : 150 mots ne remplissent qu'un motif sur sept. Le nombre est un seuil
		// de JOUABILITÉ, pas un objectif de production — le critère 5 vise, lui, tout
		// le vivier définissable.
		expect(definis.length).toBeGreaterThanOrEqual(PLANCHER_DEFINIS);
	});

	it('un mot déjà défini dans « Le mot juste » garde la même définition ici', () => {
		// Le même enfant croise les deux. Deux formulations pour un mot, c'est deux
		// choses à retenir là où il n'y en a qu'une — et deux endroits à corriger.
		const ecarts = CHAMPS.flatMap((c) => c.mots)
			.filter((m) => DEFINI.has(m.mot.normalize('NFC')))
			.filter((m) => empreinte(DEFINI.get(m.mot.normalize('NFC')) ?? '') !== empreinte(m.def))
			.map((m) => `${m.mot} :: CHAMPS « ${m.def} » /// banque « ${DEFINI.get(m.mot) ?? ''} »`)
			.sort();
		expect(ecarts).toEqual([]);
	});
});

/* ── Le gate se contrôle lui-même ────────────────────────────────────────────
   Un contrôle de contenu trop laxiste est pire que rien : il donne l'illusion
   d'une relecture. Les deux détecteurs approximatifs (famille, tête) sont donc
   éprouvés dans les DEUX sens, et calibrés sur du contenu déjà relu. Si l'un
   d'eux dérive un jour, c'est ici que ça se voit — pas dans une banque qu'on
   aurait tordue pour lui plaire. */
describe('Le gate lui-même : ses détecteurs attrapent ce qu’il faut, et rien d’autre', () => {
	it('le détecteur de famille distingue la famille du simple air de famille', () => {
		const cas: [string, string, boolean][] = [
			// À attraper : c'est le mot lui-même, ou sa famille.
			['chat', 'Un petit chaton devient grand.', true],
			['jardin', 'Le coin du jardinier au fond.', true],
			['nager', 'Ce que fait un bon nageur.', true],
			['dessin', 'Ce que fait celui qui dessine.', true],
			['fleur', 'Ce que cueille le fleuriste.', true],
			['danse', 'Ce que fait celui qui danse.', true],
			['bondir', 'Faire un bond pour attraper quelque chose.', true],
			['glisser', 'Avancer tout seul sur une surface glissante.', true],
			['porte', 'Le grand portail du château.', true],
			// À laisser passer : même début, familles différentes.
			['chat', 'Un joli château fort en pierre.', false],
			['porte', 'Un portrait accroché au mur.', false],
			['plan', 'Un dessin qui montre une ville vue du dessus.', false],
			['sommet', 'Le point le plus haut d’une montagne.', false],
			['cheval', 'Un animal qui galope, monté par un cavalier.', false],
			['course', 'Ce que fait celui qui court vite.', false],
			['lettre', 'Un papier écrit qu’on met dans une enveloppe.', false],
			['nager', 'Se déplacer dans l’eau en bougeant les bras.', false],
			['forêt', 'Un grand espace couvert d’arbres.', false],
		];
		const ecarts = cas
			.filter(([mot, def, attendu]) => familleTouchee(mot, def).length > 0 !== attendu)
			.map(([mot, def, attendu]) => `${mot} attendu=${String(attendu)} :: ${def}`);
		expect(ecarts).toEqual([]);
	});

	it('la tête catégorielle se coupe au premier « qui », « pour » ou « de »', () => {
		expect(tete('Un animal de la ferme.')).toBe('un animal');
		expect(tete('Une grande cuillère pour servir la soupe.')).toBe('une grande cuillere');
		expect(tete('Un terrain incliné qui monte ou qui descend.')).toBe('un terrain incline');
		// Aucun des trois : la tête est la phrase entière, et le critère 11 se
		// confond alors avec le 12.
		expect(tete('Une grosse pluie courte et soudaine.')).toBe(
			'une grosse pluie courte et soudaine',
		);
		// « du » et « d’ » ne coupent pas — effet de bord assumé du critère.
		expect(tete('Le coin du jardin.')).toBe('le coin du jardin');
	});

	it('le critère 11 ne se déclenche qu’à longueur égale, et pas sur un complément différent', () => {
		const memeTete = (a: string, b: string): boolean => tete(a) === tete(b);
		// Le cas visé par l'issue.
		expect(memeTete('Un animal de la ferme.', 'Un animal de la ferme.')).toBe(true);
		// Deux outils que la tête sépare : reformuler suffit à sortir de la collision.
		expect(
			memeTete('Un outil à dents pour ramasser les feuilles.', 'Un outil pour retourner la terre.'),
		).toBe(false);
	});

	it('les 72 définitions relues de « Le mot juste » passent toutes les règles', () => {
		// Calibrage : ces définitions sont relues et validées. Une règle qui les
		// refuserait serait fausse — c'est la règle qu'on corrigerait, pas elles.
		const relues = CHAMPS.flatMap((c) => c.mots);
		expect(relues.length).toBeGreaterThanOrEqual(72);

		const fautes: string[] = [];
		for (const d of relues) {
			if (motsDe(d.def).length > MOTS_MAX) fautes.push(`C6 longueur :: ${d.mot}`);
			if (!UNE_PHRASE.test(d.def.normalize('NFC'))) fautes.push(`C6 phrase :: ${d.mot}`);
			if (d.def !== d.def.trim() || /\s\s/.test(d.def)) fautes.push(`C6 espaces :: ${d.mot}`);
			if (familleTouchee(d.mot, d.def).length > 0) fautes.push(`C7 famille :: ${d.mot}`);
			if (META_LANGUE.test(plie(d.def))) fautes.push(`C8 méta :: ${d.mot}`);
			if (INDICE_DE_FORME.test(plie(d.def))) fautes.push(`C9 indice :: ${d.mot}`);
			if (/[;:()]/.test(d.def)) fautes.push(`C10 ponctuation :: ${d.mot}`);
		}
		expect(fautes).toEqual([]);

		const par = new Map<string, string[]>();
		for (const d of relues) {
			const cle = `${String(d.mot.length)}|${tete(d.def)}`;
			par.set(cle, [...(par.get(cle) ?? []), d.mot]);
		}
		expect([...par.entries()].filter(([, v]) => v.length > 1)).toEqual([]);
	});
});
