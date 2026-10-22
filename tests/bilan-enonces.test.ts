/* ============================================================
   Énoncés d'un bilan rendus HORS de l'exercice de la leçon (#777, critères 1 à 3).

   Écrit AVANT l'implémentation (#777, skill /cadrer) : rouge à l'arrivée sauf
   non-régressions.

   Constat de départ (bilan CM1 réel, 22/10/2026) : des questions impossibles ou
   ambiguës dès qu'une leçon est servie par `genLessonItem` + `renderItem` au lieu de
   son runner :
   - un QCM à trou affiché sans ses choix (« ____ table », sans « la / le / les ») ;
   - « Nomme les mots du groupe » replié en « Quel mot va avec « son » ? » alors que la
     réponse attendue est « déterminant » ;
   - « jusqu'à 10 000 » en titre de leçon au-dessus de nombres à 7 chiffres au CM1.

   Ce que ce fichier tient :
   - critère 1 : à l'écran, un QCM à trou montre ses choix (un bouton radio par choix,
     un seul groupe), garde UN champ `.ans` porteur de la réponse (correction et journal
     passent par lui) et n'affiche jamais le `@` brut ;
   - critère 2 : le repli d'un « relier » à étiquettes demande la nature d'UN mot cité
     entre « », et offre en choix des étiquettes de la leçon, dont la bonne ;
   - critère 3 : au CM1, les deux libellés « jusqu'à 10 000 » ne le disent plus ; au CE2,
     ils sont inchangés.
   Non-régressions (vertes dès l'écriture) : le papier garde ses cases à cocher, un item
   NON QCM garde son champ de saisie au trou, et un « relier » SANS étiquettes garde un
   repli « mot de droite ». Chaque verrou vert a son témoin, joué plus bas sur un rendu
   ou une donnée FABRIQUÉS (aucune mutation du code ni de la donnée).

   Hors de portée ici : « toucher un choix le place dans le trou » (critère 1) est une
   interaction, donc une spec Playwright.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	getAllLessons,
	getLessonById,
	genLessonItem,
	isPairingLesson,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { renderItem, createRenderContext, qcmChoixHTML, type Item } from '../src/core/items';
import { labelLecon } from '../src/core/levels';
import { withSeed } from '../src/core/utils';
import type { Exercise } from '../src/core/exercise';

/* ---------- Outils communs ---------- */

/** Fragment HTML → arbre DOM (happy-dom), pour interroger le rendu par sélecteurs plutôt
    que par expressions régulières sur la chaîne. */
function dom(balisage: string): HTMLElement {
	const racine = document.createElement('div');
	racine.innerHTML = balisage;
	return racine;
}

const ecran = (it: Item): HTMLElement => dom(renderItem(it, createRenderContext()).balisage);
const papier = (it: Item): HTMLElement =>
	dom(renderItem(it, createRenderContext({ printMode: true })).balisage);

/** « Question à choix avec trou » au sens de l'issue : des choix, et un emplacement `@`. */
const estQcmATrou = (it: Item): boolean => (it.choices?.length ?? 0) > 0 && it.text.includes('@');

const niveauxDe = (lesson: LessonDef): SchoolLevel[] =>
	lesson.levels.length > 0 ? lesson.levels : ['ce2'];

/** Multiset → clé comparable (l'ordre des choix n'est pas l'exigence, leur nombre si). */
const cle = (valeurs: readonly string[]): string => JSON.stringify([...valeurs].sort());

/* ---------- Critère 1 : prédicats ---------- */

/** Les choix sont-ils proposés à l'écran ? Un bouton radio par choix, de valeur = le
    choix, et tous dans UN groupe (même `name`) : sinon deux réponses se cochent à la
    fois. Rend la liste des défauts. */
function defautsChoixEcran(it: Item, racine: HTMLElement): string[] {
	const d: string[] = [];
	const radios = [...racine.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
	const valeurs = radios.map((r) => r.getAttribute('value') ?? '');
	const choix = it.choices ?? [];
	if (cle(valeurs) !== cle(choix)) {
		d.push(`choix proposés ${JSON.stringify(valeurs)} au lieu de ${JSON.stringify(choix)}`);
	}
	const noms = new Set(radios.map((r) => r.getAttribute('name') ?? ''));
	if (radios.length > 0 && (noms.size !== 1 || noms.has(''))) {
		d.push(`les choix ne forment pas un seul groupe (name : ${JSON.stringify([...noms])})`);
	}
	return d;
}

/** UN champ `.ans`, porteur de la réponse : c'est lui que lisent la correction et le
    journal d'erreurs. Zéro, c'est une question sans réponse possible ; deux, une question
    comptée deux fois. */
function defautsChampReponse(it: Item, racine: HTMLElement): string[] {
	const champs = racine.querySelectorAll('.ans');
	if (champs.length !== 1) return [`${champs.length} champ(s) .ans au lieu d'un seul`];
	const attendue = champs[0].getAttribute('data-answer');
	return attendue === String(it.answer)
		? []
		: [`data-answer « ${attendue} » au lieu de « ${String(it.answer)} »`];
}

/** Le `@` est un marqueur interne : un enfant ne sait pas le lire. */
const arobaseVisible = (racine: HTMLElement): boolean => (racine.textContent ?? '').includes('@');

/** Le cas du constat : « ____ table » affiché sans « la / le / les ». */
const TABLE: Item = { text: '@ table', answer: 'la', kind: 'text', choices: ['la', 'le', 'les'] };

/* ============================================================
   Critère 1 — QCM à trou rendu par `renderItem` à l'écran.
   ============================================================ */
describe('Critère 1 : un QCM à trou affiche ses choix à l’écran', () => {
	it('critère 1 : un bouton radio par choix (la, le, les), dans un seul groupe', () => {
		expect(defautsChoixEcran(TABLE, ecran(TABLE))).toEqual([]);
	});

	it('critère 1 : garde un seul champ .ans dont data-answer vaut la réponse (« la »)', () => {
		expect(defautsChampReponse(TABLE, ecran(TABLE))).toEqual([]);
	});

	it('critère 1 : le trou ne s’affiche pas en « @ » brut, et le reste de l’énoncé est lu', () => {
		const racine = ecran(TABLE);
		expect(arobaseVisible(racine), racine.innerHTML).toBe(false);
		expect(racine.textContent ?? '').toContain('table');
	});

	/* Le constat a été fait sur de vraies leçons : on balaie TOUT le catalogue, à chaque
	   niveau couvert, et on rend chaque QCM à trou tiré. `fr-homophones-et` sert de
	   plancher (« et » / « est » se joue par un trou) : un inventaire vide ne doit pas
	   rendre ce test vert. */
	const GRAINES_CATALOGUE = Array.from({ length: 8 }, (_, k) => k + 1);
	const qcmATrouDuCatalogue: { ou: string; item: Item }[] = [];
	for (const lesson of getAllLessons()) {
		for (const niveau of niveauxDe(lesson)) {
			for (const seed of GRAINES_CATALOGUE) {
				const item = withSeed(seed, () => genLessonItem(lesson, niveau));
				if (estQcmATrou(item)) {
					qcmATrouDuCatalogue.push({ ou: `${lesson.id} @${niveau} / graine ${seed}`, item });
				}
			}
		}
	}

	it('critère 1 : l’inventaire des QCM à trou du catalogue contient bien les homophones', () => {
		const lecons = new Set(qcmATrouDuCatalogue.map((q) => q.ou.split(' ')[0]));
		expect([...lecons]).toContain('fr-homophones-et');
	});

	it('critère 1 : chaque QCM à trou tiré du catalogue montre ses choix, un .ans juste, et pas de « @ »', () => {
		// Une ligne par leçon (son premier tirage fautif) suffit à la liste de travail : les
		// tirages d'une même leçon échouent pour la même raison.
		const parLecon = new Map<string, string>();
		for (const { ou, item } of qcmATrouDuCatalogue) {
			const racine = ecran(item);
			const d = [...defautsChoixEcran(item, racine), ...defautsChampReponse(item, racine)];
			if (arobaseVisible(racine)) d.push('« @ » affiché tel quel');
			const id = ou.split(' ')[0];
			if (d.length > 0 && !parLecon.has(id)) parLecon.set(id, `${ou} : ${d.join(' ; ')}`);
		}
		expect(
			[...parLecon.values()],
			`${parLecon.size} leçon(s) dont le QCM à trou est injouable à l'écran`,
		).toEqual([]);
	});
});

describe('Critère 1 — non-régressions (vertes dès l’écriture)', () => {
	/** Le rendu papier d'un QCM : la liste à cocher, un élément par choix, et rien
	    d'interactif. */
	function defautsPapier(it: Item, racine: HTMLElement): string[] {
		const d: string[] = [];
		const liste = racine.querySelector('.qcm-print-choices');
		if (!liste) d.push('pas de liste .qcm-print-choices');
		else if (liste.querySelectorAll('li').length !== (it.choices ?? []).length) {
			d.push(
				`${liste.querySelectorAll('li').length} cases pour ${(it.choices ?? []).length} choix`,
			);
		}
		if (racine.querySelector('input[type="radio"]')) d.push('bouton radio sur papier');
		return d;
	}

	it('en impression, le QCM à trou reste en cases à cocher (aucun bouton radio)', () => {
		expect(defautsPapier(TABLE, papier(TABLE))).toEqual([]);
	});

	/* Deux pièges : pas de `choices` du tout, et `choices: []` (un tableau vide n'est PAS un
	   QCM ; un aiguillage sur `if (it.choices)` le traiterait comme tel). */
	const SANS_CHOIX: Item[] = [
		{ text: 'Il @ beau.', answer: 'fait', kind: 'text' },
		{ text: 'Il @ beau.', answer: 'fait', kind: 'text', choices: [] },
	];

	/** Un item à trou SANS choix se joue au clavier : un champ de saisie visible, pas de
	    bouton radio. */
	function defautsSaisieAuTrou(racine: HTMLElement): string[] {
		const d: string[] = [];
		if (racine.querySelector('input[type="radio"]')) d.push('bouton radio sans choix');
		const champ = racine.querySelector<HTMLInputElement>('input.ans');
		if (!champ) d.push('aucun champ .ans');
		else if (['hidden', 'radio'].includes(champ.type))
			d.push(`champ .ans de type « ${champ.type} »`);
		return d;
	}

	it('un item NON QCM avec « @ » garde son champ de saisie au trou, sans radio', () => {
		for (const it of SANS_CHOIX) {
			expect(defautsSaisieAuTrou(ecran(it)), JSON.stringify(it)).toEqual([]);
		}
	});

	/* Témoins : chaque prédicat vert ci-dessus signale bien la régression qu'il garde. */
	it('témoins : les verrous de non-régression mordent', () => {
		// Le rendu ÉCRAN n'est pas un rendu papier : si l'impression perdait sa branche
		// dédiée, c'est lui qu'elle produirait.
		expect(defautsPapier(TABLE, ecran(TABLE))).not.toEqual([]);
		// Aiguiller un item sans choix vers le rendu à choix (champ .ans caché) est signalé.
		for (const it of SANS_CHOIX) {
			expect(
				defautsSaisieAuTrou(dom(qcmChoixHTML(it, createRenderContext()).balisage)),
			).not.toEqual([]);
		}
		// Un rendu sans .ans (le papier n'en a pas) est signalé par le prédicat du critère 1.
		expect(defautsChampReponse(TABLE, papier(TABLE))).not.toEqual([]);
		// L'aiguillage naïf d'un QCM à trou vers le rendu à choix des QCM SANS trou affiche
		// « @ table » : le test du « @ » (vert aujourd'hui, le trou étant un champ) le signale.
		expect(arobaseVisible(dom(qcmChoixHTML(TABLE, createRenderContext()).balisage))).toBe(true);
		// Un rendu dont les radios ne portent pas tous les choix est signalé.
		const deuxSurTrois: Item = { ...TABLE, choices: ['la', 'le'] };
		expect(
			defautsChoixEcran(TABLE, dom(qcmChoixHTML(deuxSurTrois, createRenderContext()).balisage)),
		).not.toEqual([]);
	});
});

/* ============================================================
   Critère 2 — repli d'un « relier » hors de son widget.
   ============================================================ */
type Manche = Extract<Exercise, { type: 'appariement' }>;

interface Tirage {
	lesson: LessonDef;
	niveau: SchoolLevel;
	seed: number;
	ex: Manche;
	item: Item;
}

/* « Échantillon large » : la banque de « Nomme les mots du groupe » est fermée, ce nombre
   de graines en balaie l'essentiel. */
const GRAINES_RELIER = Array.from({ length: 200 }, (_, k) => k + 1);

/** La manche et son repli, sous la MÊME graine : `genLessonItem` appelle `generate` une
    seule fois avant tout autre tirage, donc les deux coïncident. */
function tiragesRelier(lesson: LessonDef): Tirage[] {
	return niveauxDe(lesson).flatMap((niveau) =>
		GRAINES_RELIER.map((seed) => {
			const ex = withSeed(seed, () => lesson.exerciseType.generate({ level: niveau }));
			if (ex.type !== 'appariement') {
				throw new Error(`${lesson.id} @${niveau}, graine ${seed} : format « ${ex.type} »`);
			}
			const item = withSeed(seed, () => genLessonItem(lesson, niveau));
			return { lesson, niveau, seed, ex, item };
		}),
	);
}

const TOUS_RELIER = getAllLessons().filter(isPairingLesson).flatMap(tiragesRelier);
const A_ETIQUETTES = TOUS_RELIER.filter((t) => t.ex.colonneDroite === 'etiquettes');
const SANS_ETIQUETTES = TOUS_RELIER.filter((t) => t.ex.colonneDroite !== 'etiquettes');

/** Étiquettes d'une leçon, DÉRIVÉES de ses manches : la colonne de droite d'un « relier »
    à étiquettes porte, par définition, les étiquettes. Union sur tout l'échantillon (une
    manche sans adjectif n'en montre que deux). */
const etiquettesParLecon = new Map<string, Set<string>>();
for (const t of A_ETIQUETTES) {
	const s = etiquettesParLecon.get(t.lesson.id) ?? new Set<string>();
	for (const p of t.ex.paires) s.add(p.droite);
	etiquettesParLecon.set(t.lesson.id, s);
}

const ou = (t: Tirage): string => `${t.lesson.id} @${t.niveau} / graine ${t.seed}`;

/* En JavaScript, `\s` couvre déjà l'espace insécable et l'espace fine insécable : pas
   besoin de les nommer (et pas de caractère littéral, cf. `no-irregular-whitespace`). */

/** Énoncé tel que lu : sans le gras `**`, espaces réduits. */
const lu = (s: string): string => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

/** Segments cités entre guillemets français, espaces intérieurs (y compris insécables)
    retirés. */
function citations(texte: string): string[] {
	return [...lu(texte).matchAll(/«\s*([^«»]+?)\s*»/g)].map((m) => m[1]);
}

/** Défaut de désignation : l'énoncé doit citer entre « » au moins un mot de la manche, et
    tous les mots cités doivent avoir pour étiquette la réponse attendue (sinon l'enfant
    répond sur un mot, et on le corrige sur un autre). */
function defautDesignation(texte: string, reponse: string, ex: Manche): string | null {
	const cites = citations(texte);
	const designes = ex.paires.filter((p) => cites.includes(p.gauche));
	if (designes.length === 0) return `aucun mot de la manche cité entre « » dans « ${lu(texte)} »`;
	const autres = designes.filter((p) => p.droite !== reponse);
	if (autres.length > 0) {
		return `« ${autres[0].gauche} » est cité mais c'est un ${autres[0].droite}, et la réponse attendue est « ${reponse} »`;
	}
	return null;
}

/** Défauts des choix d'un repli à étiquettes : la réponse en fait partie, ce sont tous des
    étiquettes de la leçon, au moins deux, sans doublon. */
function defautsChoixEtiquettes(item: Item, etiquettes: ReadonlySet<string>): string[] {
	const choix = item.choices ?? [];
	const d: string[] = [];
	if (!choix.includes(String(item.answer))) {
		d.push(
			`la réponse « ${String(item.answer)} » n'est pas parmi les choix ${JSON.stringify(choix)}`,
		);
	}
	if (new Set(choix).size < 2) d.push(`moins de deux choix distincts : ${JSON.stringify(choix)}`);
	if (new Set(choix).size !== choix.length) d.push(`choix en double : ${JSON.stringify(choix)}`);
	const intrus = choix.filter((c) => !etiquettes.has(c));
	if (intrus.length > 0) d.push(`choix qui ne sont pas des étiquettes : ${JSON.stringify(intrus)}`);
	return d;
}

/** Applique une règle à des tirages et rend une faute par leçon (la première). */
function fautesParLecon(tirages: Tirage[], regle: (t: Tirage) => string | null): string[] {
	const parLecon = new Map<string, string>();
	for (const t of tirages) {
		const f = regle(t);
		if (f !== null && !parLecon.has(t.lesson.id)) parLecon.set(t.lesson.id, `${ou(t)} : ${f}`);
	}
	return [...parLecon.values()];
}

describe('Critère 2 : « relier » à étiquettes replié hors de son widget', () => {
	it('critère 2 : l’inventaire voit « Nomme les mots du groupe » et des étiquettes dérivées', () => {
		expect([...etiquettesParLecon.keys()]).toContain('fr-gram-gn-nommer');
		// Déterminant, nom, adjectif : la leçon les fait nommer tous les trois.
		expect(etiquettesParLecon.get('fr-gram-gn-nommer')?.size ?? 0).toBeGreaterThanOrEqual(3);
	});

	it('critère 2 : l’énoncé (affiché ET lu à voix haute) ne demande jamais « Quel mot va avec »', () => {
		const QUEL_MOT = /quel mot va avec/i;
		expect(
			fautesParLecon(A_ETIQUETTES, (t) => {
				if (QUEL_MOT.test(lu(t.item.text))) return `énoncé « ${lu(t.item.text)} »`;
				if (t.item.parle !== undefined && QUEL_MOT.test(lu(t.item.parle))) {
					return `texte lu « ${t.item.parle} »`;
				}
				return null;
			}),
		).toEqual([]);
	});

	it('critère 2 : l’item offre des étiquettes en choix, dont la réponse attendue', () => {
		expect(
			fautesParLecon(A_ETIQUETTES, (t) => {
				const d = defautsChoixEtiquettes(t.item, etiquettesParLecon.get(t.lesson.id) ?? new Set());
				return d.length > 0 ? d.join(' ; ') : null;
			}),
		).toEqual([]);
	});

	it('critère 2 : l’énoncé cite entre « » le mot désigné, dont l’étiquette est la réponse', () => {
		expect(
			fautesParLecon(A_ETIQUETTES, (t) =>
				defautDesignation(t.item.text, String(t.item.answer), t.ex),
			),
		).toEqual([]);
	});

	it('critère 2 : la réponse attendue figure parmi les choix AFFICHÉS, à l’écran comme sur papier', () => {
		expect(
			fautesParLecon(A_ETIQUETTES, (t) => {
				const reponse = String(t.item.answer);
				const radios = [
					...ecran(t.item).querySelectorAll<HTMLInputElement>('input[type="radio"]'),
				].map((r) => r.value);
				if (!radios.includes(reponse))
					return `écran : « ${reponse} » absent de ${JSON.stringify(radios)}`;
				const imprimes = [...papier(t.item).querySelectorAll('.qcm-print-choices li')].map((li) =>
					(li.textContent ?? '').trim(),
				);
				if (!imprimes.includes(reponse))
					return `papier : « ${reponse} » absent de ${JSON.stringify(imprimes)}`;
				return null;
			}),
		).toEqual([]);
	});
});

describe('Critère 2 — non-régression : un « relier » SANS étiquettes garde son repli', () => {
	/** La réponse d'un repli « mot de droite » est un mot de la colonne de droite. */
	const horsColonneDroite = (reponse: string, ex: Manche): string | null =>
		ex.paires.some((p) => p.droite === reponse)
			? null
			: `réponse « ${reponse} » hors de la colonne de droite ${JSON.stringify(ex.paires.map((p) => p.droite))}`;

	it('le catalogue contient au moins une leçon « relier » sans étiquettes', () => {
		expect(new Set(SANS_ETIQUETTES.map((t) => t.lesson.id)).size).toBeGreaterThanOrEqual(1);
	});

	it('sa réponse attendue reste un mot de la colonne de droite de la manche', () => {
		expect(
			fautesParLecon(SANS_ETIQUETTES, (t) => horsColonneDroite(String(t.item.answer), t.ex)),
		).toEqual([]);
	});

	it('témoins : les verrous verts du critère 2 mordent', () => {
		const t = SANS_ETIQUETTES[0];
		// Une réponse prise à GAUCHE (le mot qu'on montre, pas celui qu'on cherche) est signalée.
		expect(horsColonneDroite(t.ex.paires[0].gauche, t.ex)).not.toBeNull();
		// Désignation : la forme fautive du constat (aucune citation d'un mot de la manche)…
		const g = A_ETIQUETTES[0];
		expect(
			defautDesignation(`${g.ex.question} @`, String(g.ex.paires[0].droite), g.ex),
		).not.toBeNull();
		// … et un mot cité dont l'étiquette n'est PAS la réponse attendue.
		const paire = g.ex.paires[0];
		const autre =
			[...(etiquettesParLecon.get(g.lesson.id) ?? [])].find((e) => e !== paire.droite) ?? '';
		expect(
			defautDesignation(`Dans ce groupe, « ${paire.gauche} » est @`, autre, g.ex),
		).not.toBeNull();
		// Et le témoin qui ne doit PAS être signalé : la bonne étiquette pour le mot cité.
		expect(
			defautDesignation(`Dans ce groupe, « ${paire.gauche} » est @`, paire.droite, g.ex),
		).toBeNull();
	});
});

/* ============================================================
   Critère 3 — libellés « jusqu'à 10 000 » au CM1.
   ============================================================ */
/* Libellés CE2 relevés le 22/10/2026 : c'est l'exigence (« inchangés au CE2 »), donc une
   valeur figée, et pas `lesson.label`, qui changerait avec eux. */
const LIBELLES_CE2: Record<string, string> = {
	'num-situer-10000': "Je compare, j'encadre, j'intercale jusqu'à 10 000",
	'num-decompose-10000': "Je décompose jusqu'à 10 000",
};

/** « 10 000 » sous toutes ses graphies (espace, insécable, fine insécable — toutes dans
    `\s` —, ou collé), en nombre entier : « 100 000 » ne compte pas. */
const DIX_MILLE = /(?<!\d)10\s?000(?!\d)/;

/* Espaces insécables construites par leur code, jamais en caractère littéral dans le
   source (ESLint `no-irregular-whitespace`). */
const INSECABLE = String.fromCharCode(0x00a0);
const FINE_INSECABLE = String.fromCharCode(0x202f);

const lecon = (id: string): LessonDef => {
	const l = getLessonById(id);
	if (!l) throw new Error(`leçon ${id} absente du catalogue`);
	return l;
};

describe('Critère 3 : libellés des leçons « jusqu’à 10 000 » au CM1', () => {
	for (const id of Object.keys(LIBELLES_CE2)) {
		it(`critère 3 : ${id} au CM1 a un libellé non vide qui ne dit pas « 10 000 »`, () => {
			const libelle = labelLecon(lecon(id), 'cm1');
			expect(libelle.trim()).not.toBe('');
			expect(libelle).not.toMatch(DIX_MILLE);
		});

		it(`critère 3 (non-régression) : ${id} au CE2 garde exactement son libellé`, () => {
			expect(labelLecon(lecon(id), 'ce2')).toBe(LIBELLES_CE2[id]);
		});
	}

	it('témoins : les verrous du critère 3 mordent', () => {
		// Graphies de « 10 000 » détectées, « 100 000 » et « 1 000 000 » ignorés.
		for (const s of ['10 000', `10${INSECABLE}000`, `10${FINE_INSECABLE}000`, '10000']) {
			expect(s).toMatch(DIX_MILLE);
		}
		for (const s of ['100 000', '1 000 000', '110 000']) expect(s).not.toMatch(DIX_MILLE);
		// Changer le `label` de base (au lieu d'ajouter un libellé CM1) changerait le CE2.
		// `labelNiveau: {}` neutralise un éventuel libellé CE2 explicite : seul `label` joue.
		const l = lecon('num-decompose-10000');
		const modifiee: LessonDef = { ...l, label: "Je décompose jusqu'au million", labelNiveau: {} };
		expect(labelLecon(modifiee, 'ce2')).not.toBe(LIBELLES_CE2['num-decompose-10000']);
	});
});
