/* ============================================================
   Mots difficiles de fin de séance (#618) — logique pure : ce que les écrans de
   fin NOMMENT à l'enfant, et comment ils le disent.

   Auteur des tests DISTINCT de l'auteur du code : les attendus viennent des
   CRITÈRES de l'issue (4, 5, 10) et de sa décision de cadrage 4 (registre par
   contexte). Le module n'a volontairement pas été relu : seul son contrat d'API
   l'a été. Modèle : `tests/recap-notions.test.ts`, le module frère de #537.

   Ce qui est éprouvé ici :
   - la sélection : rien à nommer ⇒ pas de bloc (`null`), entrées blanches
     ignorées, dédoublonnage des mots rencontrés deux fois dans la séance ;
   - la frontière exacte 3 nommés / 4 groupés (critère 4), et le fait que le
     dédoublonnage PRÉCÈDE le plafond (4 occurrences pour 3 mots distincts
     restent nommées) ;
   - critère 5 : le module ne fabrique aucune forme — ce qui ressort est un
     sous-ensemble de ce qu'on lui donne, à l'octet près (accents, apostrophe
     droite du projet, majuscules) ;
   - critère 10, le plus important : AUCUN décompte des mots qui ont résisté,
     ni en chiffres ni en lettres, sur AUCUNE taille d'entrée (1 → 50) ni AUCUN
     des trois contextes. La règle est éprouvée sur le TEXTE RENDU, pour qu'elle
     tienne aussi sur une formulation ajoutée plus tard ;
   - décision 4 : trois contextes = trois phrases distinctes, avec le registre
     de chacun (pause qui n'incite pas à continuer, bilan qui ne constate pas une
     fragilité, aucun vocabulaire d'échec nulle part) ;
   - la tenue de la phrase : complète, ponctuée, accordée au singulier / pluriel,
     énumération lisible, et pas de phrase tronquée sur un contenu vide.

   Volontairement PAS éprouvé : le TEXTE exact des phrases. L'issue le laisse
   ouvert (« la formulation exacte passera par `redacteur-contenu-francais` »),
   donc seules des PROPRIÉTÉS sont tenues.

   Module PUR : aucun DOM, aucun stockage, aucun profil. Le `beforeEach` maison
   n'a donc rien à réinitialiser ; on vide `localStorage` pour pouvoir AFFIRMER
   qu'aucune clé n'apparaît (critère 11 : rien ne survit à la séance).
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	MAX_MOTS_NOMMES,
	contenuMotsDifficiles,
	phraseMotsDifficiles,
	type ContenuMotsDifficiles,
	type ContexteMotsDifficiles,
} from '../src/core/orthographe/mots-difficiles';

beforeEach(() => {
	localStorage.clear();
});

/* ---------- Fixtures ---------- */

const CONTEXTES = [
	'pause',
	'bilan',
	'revision',
] as const satisfies readonly ContexteMotsDifficiles[];

/* Mots plausibles de listes CE2-CM1, dans leur forme CORRECTE (c'est tout ce que
   la correction guidée passe au module). Aucun ne contient de chiffre : c'est ce
   qui rend le test « aucun chiffre dans la phrase » non ambigu. Aucun n'est non
   plus un nom de nombre (« sept », « six »…), qui ferait un faux positif sur la
   recherche de décompte en lettres. */
const MOTS = [
	'bateau',
	'chemin',
	'éléphant',
	"aujourd'hui",
	'montagne',
	'famille',
	'tempête',
	'oiseau',
	'pharmacie',
	'rythme',
	'écureuil',
	'vendredi',
] as const;

/** `n` mots DISTINCTS sans chiffre : les vrais mots d'abord, puis des variantes suffixées. */
function motsDistincts(n: number): string[] {
	const suffixes = 'abcdefghijklmnopqrstuvwxyz';
	return Array.from({ length: n }, (_, i) =>
		i < MOTS.length ? MOTS[i] : `${MOTS[i % MOTS.length]}${suffixes[Math.floor(i / MOTS.length)]}`,
	);
}

const tousDistincts = (mots: readonly string[]) => new Set(mots).size === mots.length;

/** Ce que l'enfant lit, dans les trois contextes, pour un contenu donné. */
function phrases(contenu: ContenuMotsDifficiles): string[] {
	return CONTEXTES.map((c) => phraseMotsDifficiles(contenu, c));
}

/* ---------- Vocabulaires proscrits (dérivés des critères, pas du code) ---------- */

/* Critère 10 : « aucun nombre de mots qui ont résisté n'est affiché, ni en
   chiffres ni en lettres ». Les cardinaux à partir de DEUX ne peuvent rien dire
   d'autre ici qu'un décompte. « un / une » sont volontairement hors de cette
   liste : ce sont aussi des articles indéfinis parfaitement légitimes. */
const CARDINAL_EN_LETTRES =
	/\b(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente)\b/i;

/* Le décompte résiduel que le critère 4 nomme explicitement comme violation
   (« 3 noms suivis d'un "et 1 autre" »), en chiffres comme en lettres. C'est ici
   que « un » redevient un cardinal : accolé à « autre(s) », il compte. */
const RESTE_COMPTE = /\b(un|une|deux|trois|quatre|cinq|\d+)\s+autres?\b/i;

/* Registre positif et privé (décision 4 + `docs/design-orthographe.md`,
   § Désamorcer l'échéance scolaire) : ces écrans célèbrent un travail fourni,
   ils ne dressent pas un constat d'échec. */
const VOCABULAIRE_D_ECHEC = /\b(faute|fautes|erreurs?|rat[ée]e?s?|[ée]chec|nul|mauvais|faux)\b/i;

/* Pause : « "Continuer encore un peu" et "Revenir une autre fois" doivent rester
   deux options également valables, l'information ne doit pas se transformer en
   incitation déguisée ». Une phrase qui pousse à reprendre est donc interdite. */
const INCITATION = /\b(continue[zr]?|recommence|reprends|entra[îi]ne-toi|tu dois|il faut)\b/i;

/* Bilan : « reconnaissance de l'effort fourni […] jamais constat de fragilité,
   puisqu'à cet instant ils ne sont plus fragiles ». */
const CONSTAT_DE_FRAGILITE =
	/\b(fragiles?|faibles?|faiblesse|difficult[ée]s?|à revoir|pas encore)\b/i;

/* ---------- Sélection : ce qui est nommé ---------- */

describe('contenuMotsDifficiles — ce que la séance a laissé à nommer', () => {
	it('aucun mot passé par la correction guidée ⇒ aucun bloc à afficher', () => {
		expect(contenuMotsDifficiles([])).toBeNull();
	});

	it('des entrées vides ou blanches ne sont pas des mots ⇒ toujours aucun bloc', () => {
		expect(contenuMotsDifficiles(['', '   ', '\t', '\n'])).toBeNull();
	});

	it('une entrée blanche noyée parmi de vrais mots est ignorée', () => {
		/* Sinon l'énumération se lit « tu sais écrire : , bateau et  ». */
		expect(contenuMotsDifficiles(['', 'bateau', '   ', 'chemin'])).toEqual({
			forme: 'nommes',
			mots: ['bateau', 'chemin'],
		});
	});

	it('un seul mot ⇒ il est nommé', () => {
		expect(contenuMotsDifficiles(['bateau'])).toEqual({ forme: 'nommes', mots: ['bateau'] });
	});

	it('critère 4 : le plafond de mots nommés est de 3', () => {
		expect(MAX_MOTS_NOMMES).toBe(3);
	});

	it("bord bas du plafond : 3 mots distincts sont tous nommés, dans l'ordre de rencontre", () => {
		const c = contenuMotsDifficiles(motsDistincts(MAX_MOTS_NOMMES));
		expect(c).toEqual({ forme: 'nommes', mots: ['bateau', 'chemin', 'éléphant'] });
	});

	it("bord haut du plafond : à 4 mots distincts, plus aucun n'est nommé", () => {
		const c = contenuMotsDifficiles(motsDistincts(MAX_MOTS_NOMMES + 1));
		expect(c).toEqual({ forme: 'groupee', mots: [] });
	});

	it('critère 4 : 4 mots ne produisent ni 4 noms, ni 3 noms « et 1 autre »', () => {
		const entree = motsDistincts(4);
		const c = contenuMotsDifficiles(entree);
		expect(c?.forme).toBe('groupee');
		expect(c?.mots).toEqual([]);
		for (const phrase of phrases(c!)) {
			for (const mot of entree) expect(phrase, phrase).not.toContain(mot);
			expect(phrase, phrase).not.toMatch(RESTE_COMPTE);
		}
	});

	it('un mot qui résiste deux fois dans la séance ne se lit pas deux fois', () => {
		expect(contenuMotsDifficiles(['bateau', 'chemin', 'bateau'])).toEqual({
			forme: 'nommes',
			mots: ['bateau', 'chemin'],
		});
	});

	it('le dédoublonnage précède le plafond : 4 occurrences pour 3 mots distincts restent nommées', () => {
		/* Le plafond porte sur les mots DISTINCTS. Sinon un mot qui accroche deux
		   fois sur deux activités ferait basculer la séance en formulation groupée
		   alors que l'enfant n'a que trois mots à retenir. */
		const c = contenuMotsDifficiles(['bateau', 'chemin', 'éléphant', 'bateau']);
		expect(c).toEqual({ forme: 'nommes', mots: ['bateau', 'chemin', 'éléphant'] });
	});

	it('des espaces parasites ne font pas lire le même mot deux fois', () => {
		/* Deux points de capture différents peuvent livrer la même forme avec ou sans
		   blanc de bord ; ce serait « bateau et bateau » à l'écran. */
		expect(contenuMotsDifficiles([' bateau ', 'bateau', 'chemin'])).toEqual({
			forme: 'nommes',
			mots: ['bateau', 'chemin'],
		});
	});

	it("la PREMIÈRE rencontre fixe la place du mot dans l'énumération", () => {
		expect(contenuMotsDifficiles(['chemin', 'bateau', 'chemin', 'bateau'])).toEqual({
			forme: 'nommes',
			mots: ['chemin', 'bateau'],
		});
	});

	it('un même mot répété 5 fois reste un seul mot (aucun « ×N »)', () => {
		const c = contenuMotsDifficiles(Array.from({ length: 5 }, () => 'tempête'));
		expect(c).toEqual({ forme: 'nommes', mots: ['tempête'] });
	});

	it("critère 5 : les mots ressortent à l'identique — accents, apostrophe droite, majuscule", () => {
		const entree = ['éléphant', "aujourd'hui", 'où', 'Paris'];
		/* 4 mots ⇒ groupée ; on éprouve la fidélité sur un sous-ensemble nommable. */
		expect(contenuMotsDifficiles(entree.slice(0, 3))?.mots).toEqual([
			'éléphant',
			"aujourd'hui",
			'où',
		]);
		const c = contenuMotsDifficiles(['Paris']);
		expect(c?.mots).toEqual(['Paris']);
		expect(c?.mots[0]).not.toBe('paris');
	});

	it("critère 5 : le module ne fabrique rien — ce qu'il nomme vient de l'entrée", () => {
		for (let taille = 1; taille <= 3; taille++) {
			const entree = motsDistincts(taille);
			const c = contenuMotsDifficiles(entree);
			for (const mot of c?.mots ?? []) expect(entree, `taille ${taille}`).toContain(mot);
		}
	});

	it('critère 10 : le contenu ne porte que la forme et les mots (aucun compte)', () => {
		const c = contenuMotsDifficiles(motsDistincts(2));
		expect(c).not.toBeNull();
		expect(Object.keys(c ?? {}).sort()).toEqual(['forme', 'mots']);
	});

	it('ne modifie pas la liste reçue (fonction pure)', () => {
		const entree = [...motsDistincts(7), 'bateau'];
		const copie = [...entree];
		expect(() => contenuMotsDifficiles(Object.freeze(entree))).not.toThrow();
		expect(entree).toEqual(copie);
	});

	it('invariants sur toutes les tailles de séance de 1 à 50', () => {
		for (let taille = 1; taille <= 50; taille++) {
			const entree = motsDistincts(taille);
			expect(tousDistincts(entree), `fixture taille ${taille}`).toBe(true);
			const c = contenuMotsDifficiles(entree);
			expect(c, `taille ${taille}`).not.toBeNull();
			const attendue = taille <= MAX_MOTS_NOMMES ? 'nommes' : 'groupee';
			expect(c?.forme, `taille ${taille}`).toBe(attendue);
			if (attendue === 'nommes') {
				expect(c?.mots, `taille ${taille}`).toEqual(entree);
			} else {
				/* Formulation groupée NON NOMINATIVE : elle ne transporte aucun mot. */
				expect(c?.mots, `taille ${taille}`).toEqual([]);
			}
			expect(c?.mots.length, `taille ${taille}`).toBeLessThanOrEqual(MAX_MOTS_NOMMES);
			expect(tousDistincts(c?.mots ?? []), `taille ${taille}`).toBe(true);
			for (const mot of c?.mots ?? []) expect(mot.trim().length).toBeGreaterThan(0);
		}
	});
});

/* ---------- Formulation : ce que l'enfant lit ---------- */

describe("phraseMotsDifficiles — la phrase rendue à l'enfant", () => {
	const UN: ContenuMotsDifficiles = { forme: 'nommes', mots: ['bateau'] };
	const TROIS: ContenuMotsDifficiles = {
		forme: 'nommes',
		mots: ['bateau', 'chemin', 'éléphant'],
	};
	const GROUPEE: ContenuMotsDifficiles = { forme: 'groupee', mots: [] };

	it('les mots nommés apparaissent tous, dans les trois contextes', () => {
		for (const contexte of CONTEXTES) {
			const phrase = phraseMotsDifficiles(TROIS, contexte);
			for (const mot of TROIS.mots) expect(phrase, `${contexte} → ${phrase}`).toContain(mot);
		}
	});

	it('la phrase est complète : non vide, trimée, ponctuée, sans espace double', () => {
		for (const contenu of [UN, TROIS, GROUPEE]) {
			for (const phrase of phrases(contenu)) {
				expect(phrase.length, phrase).toBeGreaterThan(0);
				expect(phrase).toBe(phrase.trim());
				expect(phrase, phrase).not.toMatch(/ {2}/);
				expect(phrase, phrase).toMatch(/[.!]$/);
			}
		}
	});

	it("2 ou 3 mots sont énumérés lisiblement, dans l'ordre, jamais collés", () => {
		for (const contenu of [{ forme: 'nommes', mots: TROIS.mots.slice(0, 2) } as const, TROIS]) {
			for (const phrase of phrases(contenu)) {
				for (let i = 0; i + 1 < contenu.mots.length; i++) {
					const a = contenu.mots[i];
					const b = contenu.mots[i + 1];
					const debut = phrase.indexOf(a);
					const suite = phrase.indexOf(b);
					expect(debut, `${a} dans « ${phrase} »`).toBeGreaterThanOrEqual(0);
					expect(suite, `${b} après ${a} dans « ${phrase} »`).toBeGreaterThan(debut);
					const entre = phrase.slice(debut + a.length, suite);
					expect(entre, `entre ${a} et ${b} : « ${entre} »`).toMatch(/[,;•]|\bet\b|\bpuis\b/);
				}
			}
		}
	});

	it('accord : un seul mot nommé ⇒ la phrase ne parle pas « des mots »', () => {
		/* Grammaire, pas décompte : le critère 10 interdit de compter, pas d'accorder. */
		for (const phrase of phrases(UN)) expect(phrase, phrase).not.toMatch(/\bmots\b/i);
	});

	it('accord : 2 ou 3 mots nommés ⇒ la phrase ne parle pas « du mot » au singulier', () => {
		for (const contenu of [{ forme: 'nommes', mots: TROIS.mots.slice(0, 2) } as const, TROIS]) {
			for (const phrase of phrases(contenu)) expect(phrase, phrase).not.toMatch(/\bmot\b/i);
		}
	});

	it('la formulation groupée ne nomme aucun mot, même si on lui en glisse', () => {
		/* Contrat : `forme: 'groupee'` = non nominative. Un appelant qui remplirait
		   `mots` par erreur ne doit pas faire fuiter les mots à l'écran. */
		const bricole: ContenuMotsDifficiles = { forme: 'groupee', mots: ['zorbulaque', 'framichon'] };
		for (const phrase of phrases(bricole)) {
			expect(phrase, phrase).not.toContain('zorbulaque');
			expect(phrase, phrase).not.toContain('framichon');
		}
	});

	it('décision 4 : les trois contextes ne disent pas la même chose', () => {
		for (const contenu of [UN, TROIS, GROUPEE]) {
			const dites = phrases(contenu);
			expect(new Set(dites).size, dites.join(' | ')).toBe(CONTEXTES.length);
		}
	});

	it("décision 4 : à la pause, l'information n'incite pas à continuer", () => {
		for (const contenu of [UN, TROIS, GROUPEE]) {
			const phrase = phraseMotsDifficiles(contenu, 'pause');
			expect(phrase, phrase).not.toMatch(INCITATION);
		}
	});

	it('décision 4 : au bilan, aucun constat de fragilité (les mots sont acquis)', () => {
		for (const contenu of [UN, TROIS, GROUPEE]) {
			const phrase = phraseMotsDifficiles(contenu, 'bilan');
			expect(phrase, phrase).not.toMatch(CONSTAT_DE_FRAGILITE);
		}
	});

	it("registre : aucun vocabulaire d'échec, dans aucun contexte", () => {
		for (const contenu of [UN, TROIS, GROUPEE]) {
			for (const phrase of phrases(contenu))
				expect(phrase, phrase).not.toMatch(VOCABULAIRE_D_ECHEC);
		}
	});

	it('critère 4 : au-delà du plafond, la phrase groupe même si le contenu nomme', () => {
		/* Le plafond est revérifié LÀ OÙ LA PHRASE SE FABRIQUE : un appelant qui
		   construirait le contenu à la main (le filtre du bouton « Relire ces mots »
		   manipule déjà une liste de mots) ne doit pas pouvoir faire nommer 4 mots à
		   l'écran. Le critère 4 ne dépend donc plus de la discipline des appelants. */
		const groupee: ContenuMotsDifficiles = { forme: 'groupee', mots: [] };
		for (const taille of [MAX_MOTS_NOMMES + 1, 5, 10]) {
			const mots = motsDistincts(taille);
			const trop: ContenuMotsDifficiles = { forme: 'nommes', mots };
			for (const contexte of CONTEXTES) {
				const phrase = phraseMotsDifficiles(trop, contexte);
				expect(phrase, `${taille} mots / ${contexte}`).toBe(
					phraseMotsDifficiles(groupee, contexte),
				);
				for (const mot of mots) {
					expect(phrase, `${taille} mots / ${contexte} → ${phrase}`).not.toContain(mot);
				}
				expect(phrase, phrase).not.toMatch(RESTE_COMPTE);
				expect(phrase, phrase).not.toMatch(/\d/);
			}
		}
	});

	it('critère 4 : la borne est incluse — à 3 mots nommés, la phrase les nomme encore', () => {
		/* L'autre moitié du verrou : la revérification ne doit pas grouper trop tôt. */
		const mots = motsDistincts(MAX_MOTS_NOMMES);
		const contenu: ContenuMotsDifficiles = { forme: 'nommes', mots };
		const groupee: ContenuMotsDifficiles = { forme: 'groupee', mots: [] };
		for (const contexte of CONTEXTES) {
			const phrase = phraseMotsDifficiles(contenu, contexte);
			for (const mot of mots) expect(phrase, `${contexte} → ${phrase}`).toContain(mot);
			expect(phrase, contexte).not.toBe(phraseMotsDifficiles(groupee, contexte));
		}
	});

	it('robustesse : un contenu nommé mais VIDE ne produit pas de phrase tronquée', () => {
		/* « Tu sais écrire : . » est le ratage typique. La phrase peut être vide
		   (rien à dire) ou complète, jamais suspendue sur un séparateur. */
		const vide: ContenuMotsDifficiles = { forme: 'nommes', mots: [] };
		for (const contexte of CONTEXTES) {
			const phrase = phraseMotsDifficiles(vide, contexte);
			expect(phrase, phrase).not.toMatch(/[:,;]\s*$/);
			expect(phrase, phrase).not.toMatch(/[:,;]\s*[.!?]\s*$/);
			expect(phrase, phrase).not.toMatch(/ {2}/);
		}
	});
});

/* ---------- Critère 10 : aucun décompte, nulle part ---------- */

describe('critère 10 — aucun nombre de mots qui ont résisté', () => {
	it('aucun chiffre dans la phrase, pour toute taille de séance et tout contexte', () => {
		for (let taille = 1; taille <= 50; taille++) {
			const contenu = contenuMotsDifficiles(motsDistincts(taille));
			expect(contenu, `taille ${taille}`).not.toBeNull();
			for (const contexte of CONTEXTES) {
				const phrase = phraseMotsDifficiles(contenu!, contexte);
				expect(phrase, `taille ${taille} / ${contexte} → ${phrase}`).not.toMatch(/\d/);
				expect(phrase, `taille ${taille} / ${contexte} → ${phrase}`).not.toContain('%');
			}
		}
	});

	it('aucun décompte en toutes lettres, pour toute taille de séance et tout contexte', () => {
		for (let taille = 1; taille <= 50; taille++) {
			const contenu = contenuMotsDifficiles(motsDistincts(taille));
			for (const contexte of CONTEXTES) {
				const phrase = phraseMotsDifficiles(contenu!, contexte);
				expect(phrase, `taille ${taille} / ${contexte} → ${phrase}`).not.toMatch(
					CARDINAL_EN_LETTRES,
				);
				expect(phrase, `taille ${taille} / ${contexte} → ${phrase}`).not.toMatch(RESTE_COMPTE);
			}
		}
	});

	it('le reste non nommé ne se rattrape pas en « et 3 autres » au-delà du plafond', () => {
		for (const taille of [4, 5, 10, 50]) {
			const entree = motsDistincts(taille);
			const contenu = contenuMotsDifficiles(entree);
			for (const contexte of CONTEXTES) {
				const phrase = phraseMotsDifficiles(contenu!, contexte);
				expect(phrase, `taille ${taille} / ${contexte} → ${phrase}`).not.toMatch(RESTE_COMPTE);
				/* Et rien de la liste ne transparaît, même partiellement. */
				for (const mot of entree) {
					expect(phrase, `taille ${taille} / ${contexte} → ${phrase}`).not.toContain(mot);
				}
			}
		}
	});

	it("un mot nommé n'est pas décompté non plus (le mot lui-même reste intact)", () => {
		/* Garde-fou contre le faux positif inverse : les lettres du mot nommé ne
		   doivent pas être confondues avec un décompte. « sept » est ici un mot de
		   la liste, pas un compte — d'où le choix de mots neutres partout ailleurs. */
		const contenu = contenuMotsDifficiles(['bateau', 'chemin']);
		for (const contexte of CONTEXTES) {
			const phrase = phraseMotsDifficiles(contenu!, contexte);
			expect(phrase).toContain('bateau');
			expect(phrase).toContain('chemin');
			expect(phrase, phrase).not.toMatch(/\d/);
		}
	});
});

/* ---------- Critère 11 : rien ne persiste ---------- */

describe('critère 11 — ce module ne persiste rien', () => {
	it("exercer toute l'API ne crée aucune clé de stockage", () => {
		expect(localStorage.length).toBe(0);
		for (const taille of [0, 1, 3, 4, 12]) {
			const contenu = contenuMotsDifficiles(motsDistincts(taille));
			if (contenu) for (const contexte of CONTEXTES) phraseMotsDifficiles(contenu, contexte);
		}
		expect(localStorage.length).toBe(0);
	});
});
