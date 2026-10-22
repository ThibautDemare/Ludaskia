/* ============================================================
   Repli du format « appariement » hors de son widget (fiche, bilan, impression).
   ------------------------------------------------------------
   Le geste de l'appariement — relier deux colonnes — n'existe que dans son runner
   (ui/lecon-appariement.ts). Partout ailleurs (fiche imprimée, bilan, sprint papier),
   la manche se replie en UNE question, construite par le chemin PARTAGÉ
   `genLessonItem` → `itemDepuisExercice` (src/core/catalog.ts).

   ── L'exigence (#731), toujours valable ──────────────────────────────────────
   Hors du widget, le mot de gauche est servi SEUL : ni les autres mots du groupe, ni
   la colonne de droite. « Quel mot va avec « le » ? » n'a alors littéralement pas de
   réponse — « le » peut être un pronom, et rien ne dit qu'on parlait du groupe « le
   petit chien ». Même chose, en plus discret, pour « Familles de mots à relier » :
   « va avec » ne veut rien dire tant que la tâche n'est pas nommée (va avec par le
   sens ? par la rime ?). Et la question posée doit porter sur la paire qu'on corrige.

   ── Ce qui a changé avec #777 (critères 2, 19 et 20) ─────────────────────────
   Jusqu'ici, ce fichier tenait l'exigence par son MÉCANISME de #731 : l'énoncé de la
   manche, repris mot pour mot en tête du repli, devant « Quel mot va avec « X » ? ».
   Or cet énoncé commence par « Relie… », consigne fausse sans colonnes (interdite sur
   papier, critère 19) ; un « relier » replié doit offrir sa réponse parmi des choix
   (critère 20) ; et un « relier » à étiquettes doit demander la nature d'UN mot désigné
   (critère 2), pas « Quel mot va avec ». Les tests « l'énoncé survit » et « l'énoncé
   précède le champ » auraient rougi le jour où ces critères seraient tenus : ils sont
   réécrits sur ce qu'ils gardaient vraiment.
   - Répondable : un « relier » à étiquettes montre le GROUPE entier (chaque mot de la
     manche se lit) ; un « relier » à mots NOMME sa tâche (table TACHE_NOMMEE, déclarée par
     leçon, puisque c'est l'énoncé de la manche qui la nommait et qu'il ne peut plus servir).
   - Cohérent : la question désigne UN mot de la manche, et la réponse attendue est la
     sienne. Désigner = citer ce mot seul entre « » ; à défaut, le nommer en mot entier.
   - Choisi (critère 20) : la réponse est parmi au moins deux choix, et seule jugée juste.
   - Sans geste (critère 19) : ni l'énoncé affiché ni le texte lu ne disent « relie ».
   L'ancienne exigence « le contexte PRÉCÈDE le champ » n'a plus d'objet : la réponse se
   choisit parmi des choix proposés après la question, et une phrase à trou se lit entière.
   Ce que la question doit dire précisément, mot pour mot, n'est pas figé ici.

   ── Pourquoi toutes les leçons d'appariement ─────────────────────────────────
   Ce repli est partagé. L'inventaire est LU du catalogue (`isPairingLesson`), pas écrit
   à la main : une troisième leçon d'appariement sera couverte sans que personne y pense.

   ── Ce que ce fichier NE refait PAS ──────────────────────────────────────────
   - `tests/bilan-enonces.test.ts` (#777, critère 2) : la forme du repli À ÉTIQUETTES
     (« Quel mot va avec » proscrit, étiquettes en choix, choix affichés à l'écran et sur
     papier) ;
   - `tests/impression-gate.test.ts` (critères 19 et 20) : le papier, tout le catalogue ;
   - `tests/groupe-nominal-nommer.test.ts` (§10) : chaque mot du groupe lisible, #731 seul ;
   - `tests/logic.test.ts` : pour les familles, la réponse stockée est un dérivé de la banque.
   Ici : la règle PARTAGÉE par tous les « relier », et elle seule.

   ── Limite assumée ──────────────────────────────────────────────────────────
   « Répondable » reste, au fond, un jugement pédagogique. Ce qui se mécanise, et qui est
   tenu, c'est que le repli PORTE de quoi répondre et qu'il corrige la paire qu'il pose.

   ── Verrous verts, donc falsifiabilité démontrée ─────────────────────────────
   Avant l'implémentation de #777, « répondable » et « cohérent » sont verts, « choisi » et
   « sans geste » rouges. Le dernier bloc joue chaque prédicat sur des replis FABRIQUÉS à
   partir de manches réelles — dont les formes d'avant #731 et d'avant #777 — et exige
   qu'ils soient signalés. Aucune mutation n'est faite sur la donnée ni sur le code.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	getAllLessons,
	genLessonItem,
	isPairingLesson,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { withSeed } from '../src/core/utils';
import { checkItemAnswer, type Item } from '../src/core/items';
import type { Exercise } from '../src/core/exercise';

type Manche = Extract<Exercise, { type: 'appariement' }>;
type Paire = Manche['paires'][number];

/* Les deux leçons que l'arbitrage de #731 nomme : #731 a motivé la correction,
   « Familles de mots à relier » est celle qui ne devait pas en souffrir. Elles ne
   BORNENT pas le test (qui énumère le catalogue) : elles servent de plancher, pour
   qu'un inventaire devenu vide ou amputé ne laisse pas la suite verte. */
const LECONS_ATTENDUES = ['fr-vocab-familles-relier', 'fr-gram-gn-nommer'];

/* Ce qui NOMME la tâche dans le repli d'un « relier » À MOTS. Avant #777, c'était l'énoncé
   de la manche, repris en tête (« Relie chaque mot à un mot de sa famille. ») ; il ne peut
   plus servir (critère 19). Une leçon « relier » à mots ajoutée sans entrée fait échouer
   le test « répondable » : c'est voulu, il faut dire ce qui rend SA question répondable.
   Le motif est cherché HORS des citations « … » (un mot cité est du contenu). Un « relier »
   à étiquettes n'en a pas besoin : les étiquettes proposées en choix nomment la tâche
   (tenu par bilan-enonces, critère 2). */
const TACHE_NOMMEE: Record<string, { motif: RegExp; raison: string }> = {
	'fr-vocab-familles-relier': {
		motif: /(?<!\p{L})familles?(?!\p{L})/iu,
		raison: '« va avec » seul ne dit pas selon quoi : c’est la famille de mots qui est demandée',
	},
};

/* Le trou d'un `Item.text` (`poserAuTrou`, core/items.ts) : utilisé pour FABRIQUER des
   replis témoins, jamais pour lire où se trouve la réponse d'un repli réel. */
const TROU = '@';

/** Énoncé tel que lu : sans le gras `**`, espaces réduits (`\s` couvre les insécables). */
const lu = (s: string): string => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

/** `mot` figure-t-il dans `texte` en MOT ENTIER ? (« le » ne doit pas se trouver dans
    « leçon », ni « chant » dans « chanteur ».) */
function citeMot(texte: string, mot: string): boolean {
	const echappe = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(?<![\\p{L}\\p{N}'-])${echappe}(?![\\p{L}\\p{N}'-])`, 'iu').test(texte);
}

/** Segments cités entre guillemets français, en minuscules, espaces intérieurs retirés. */
const citations = (texte: string): string[] =>
	[...lu(texte).matchAll(/«\s*([^«»]+?)\s*»/gu)].map((m) => m[1].toLowerCase());

/** Le texte sans ses citations « … » (imbriquées comprises) : ce qui reste est la consigne. */
function sansCitations(texte: string): string {
	let avant = '';
	let apres = texte;
	while (avant !== apres) {
		avant = apres;
		apres = apres.replace(/«[^«»]*»/gu, ' ');
	}
	return apres;
}

/* ============================================================
   Les quatre propriétés, en prédicats réutilisables : le bloc final les joue sur des
   replis fabriqués pour montrer qu'ils mordent.
   ============================================================ */

/** Répondable : raison pour laquelle le repli ne montre pas de quoi répondre, ou `null`.
    À étiquettes, chaque mot du GROUPE (la colonne de gauche) se lit ; à mots, la tâche est
    nommée. */
function contexteManquant(lesson: LessonDef, texte: string, ex: Manche): string | null {
	if (ex.colonneDroite === 'etiquettes') {
		const absents = ex.paires.map((p) => p.gauche).filter((g) => !citeMot(lu(texte), g));
		return absents.length === 0
			? null
			: `groupe illisible : ${absents.map((a) => `« ${a} »`).join(', ')} absent(s) de « ${lu(texte)} »`;
	}
	const tache = lesson.id in TACHE_NOMMEE ? TACHE_NOMMEE[lesson.id] : null;
	if (tache === null) {
		return 'leçon « relier » à mots absente de TACHE_NOMMEE : rien ne dit ce qui rend sa question répondable';
	}
	return tache.motif.test(sansCitations(lu(texte)))
		? null
		: `tâche non nommée dans « ${lu(texte)} » (${tache.raison})`;
}

/** Les paires que la question désigne : celles dont le mot de gauche est cité SEUL entre
    « » ; à défaut d'une telle citation, celles dont le mot de gauche paraît en mot entier. */
function pairesDesignees(texte: string, ex: Manche): Paire[] {
	const cites = citations(texte);
	const parCitation = ex.paires.filter((p) => cites.includes(p.gauche.toLowerCase()));
	if (parCitation.length > 0) return parCitation;
	return ex.paires.filter((p) => citeMot(lu(texte), p.gauche));
}

/** Cohérent : raison pour laquelle le repli ne corrige pas la paire qu'il pose, ou `null`.
    La question doit désigner UN mot (un même mot répété dans la manche compte pour un). */
function repliIncoherent(texte: string, reponse: string, ex: Manche): string | null {
	const designees = pairesDesignees(texte, ex);
	const mots = new Set(designees.map((p) => p.gauche.toLowerCase()));
	if (mots.size !== 1) {
		return `« ${lu(texte)} » ne désigne pas un mot et un seul de la manche (${mots.size} désigné(s))`;
	}
	if (!designees.some((p) => p.droite === reponse)) {
		const p = designees[0];
		return `on interroge « ${p.gauche} » (réponse « ${p.droite} ») mais la réponse stockée est « ${reponse} »`;
	}
	return null;
}

/** Choisi (#777, critère 20) : raison pour laquelle la réponse ne se choisit pas parmi des
    choix proposés, ou `null`. Au moins deux choix distincts, et la réponse est le SEUL
    choix jugé juste (deux choix équivalents rendraient la question juste quoi qu'on coche).
    Leur affichage effectif (écran, papier) est tenu ailleurs (cf. en-tête). */
function choixDefaillants(item: Item): string | null {
	const choix = item.choices ?? [];
	const reponse = String(item.answer);
	if (new Set(choix).size < 2) return `moins de deux choix distincts : ${JSON.stringify(choix)}`;
	if (new Set(choix).size !== choix.length) return `choix en double : ${JSON.stringify(choix)}`;
	const justes = choix.filter((c) => checkItemAnswer(item, c));
	if (justes.length !== 1 || justes[0] !== reponse) {
		return `choix jugés justes ${JSON.stringify(justes)} pour la réponse « ${reponse} » parmi ${JSON.stringify(choix)}`;
	}
	return null;
}

/** « relier » conjugué (Relie, Reliez, relier…), en mot entier. « relief », « relis »,
    « relire » ne sont pas des gestes ; un mot CITÉ (« relier » d'une famille) est du
    contenu. Mêmes flexions que le détecteur du critère 19 (impression-gate). */
const RELIER = /(?<!\p{L})reli(?:e|es|ent|er|ez|ons|ant|é|ée|és|ées)(?!\p{L})/iu;

/** Sans geste (#777, critère 19) : raison pour laquelle le repli demande de relier, ou
    `null`. Le repli n'a pas deux colonnes : « Relie… » y est une consigne fausse, sur papier
    comme à l'écran, et le texte LU doit dire ce que dit l'énoncé affiché. */
function gesteRelier(item: Item): string | null {
	const textes: [string, string][] = [
		['énoncé', item.text],
		['texte lu', item.parle ?? ''],
	];
	for (const [ou, texte] of textes) {
		const m = RELIER.exec(sansCitations(lu(texte)));
		if (m) return `${ou} « ${lu(texte)} » : « ${m[0]} » sans colonnes à relier`;
	}
	return null;
}

/* ============================================================
   Accès : chaque leçon d'appariement, et ses replis tirés sous graine.
   ============================================================ */
const LECONS_APPARIEMENT: LessonDef[] = getAllLessons().filter(isPairingLesson);

/* Assez de graines pour balayer plusieurs manches de chaque banque, sans en faire une
   énumération : ce fichier teste une RÈGLE de conversion, pas une composition. */
const GRAINES = Array.from({ length: 60 }, (_, k) => k + 1);

interface Repli {
	seed: number;
	ex: Manche;
	item: Item;
}

const cache = new Map<string, Repli[]>();

/** Les replis d'une leçon : la manche tirée et l'`Item` produit à partir d'elle, sous
    la MÊME graine (`genLessonItem` appelle `generate` une seule fois, donc les deux
    tirages coïncident — c'est ce qui permet de confronter un repli à sa manche). */
function replis(lesson: LessonDef): Repli[] {
	const cached = cache.get(lesson.id);
	if (cached) return cached;
	const niveau: SchoolLevel = lesson.levels[0];
	const out: Repli[] = GRAINES.map((seed) => {
		const ex = withSeed(seed, () => lesson.exerciseType.generate({ level: niveau }));
		if (ex.type !== 'appariement') {
			throw new Error(`${lesson.id}, graine ${seed} : format « ${ex.type} » au lieu d'appariement`);
		}
		return { seed, ex, item: withSeed(seed, () => genLessonItem(lesson, niveau)) };
	});
	cache.set(lesson.id, out);
	return out;
}

/** Applique `regle` à tous les replis de toutes les leçons d'appariement, et rend le
    PREMIER manquement de chaque leçon (les tirages d'une leçon échouent pour la même
    raison : une ligne par leçon suffit à la liste de travail). */
function manquements(regle: (lesson: LessonDef, r: Repli) => string | null): string[] {
	const out: string[] = [];
	for (const lesson of LECONS_APPARIEMENT) {
		for (const r of replis(lesson)) {
			const faute = regle(lesson, r);
			if (faute !== null) {
				out.push(`${lesson.id} / graine ${r.seed} : ${faute}`);
				break;
			}
		}
	}
	return out;
}

/* ============================================================
   1. L'inventaire regarde bien quelque chose.
   ============================================================ */
describe('Repli des appariements — inventaire', () => {
	it('toutes les leçons d’appariement du catalogue sont passées au crible, dont les deux concernées', () => {
		const ids = LECONS_APPARIEMENT.map((l) => l.id);
		for (const attendue of LECONS_ATTENDUES) {
			expect(
				ids,
				`${attendue} n'est plus comptée comme leçon d'appariement : le repli partagé ne serait plus éprouvé sur elle`,
			).toContain(attendue);
		}
		expect(
			ids.length,
			'inventaire vide ou amputé : les tests suivants passeraient en ne regardant rien',
		).toBeGreaterThanOrEqual(LECONS_ATTENDUES.length);
	});

	it('TACHE_NOMMEE ne déclare que des leçons « relier » À MOTS du catalogue (pas d’entrée morte)', () => {
		const aMots = new Set(
			LECONS_APPARIEMENT.filter((l) =>
				replis(l).some((r) => r.ex.colonneDroite !== 'etiquettes'),
			).map((l) => l.id),
		);
		expect(Object.keys(TACHE_NOMMEE).filter((id) => !aMots.has(id))).toEqual([]);
	});
});

/* ============================================================
   2. Les quatre propriétés, sur les replis réellement servis.
   ============================================================ */
describe('Repli non interactif d’une manche d’appariement (fiche / bilan)', () => {
	it('montre de quoi répondre : le groupe entier (étiquettes), ou la tâche nommée (mots)', () => {
		expect(manquements((l, r) => contexteManquant(l, r.item.text, r.ex))).toEqual([]);
	});

	it('la question désigne UN mot de la manche, et la réponse attendue est la sienne', () => {
		expect(
			manquements((_l, r) => repliIncoherent(r.item.text, String(r.item.answer), r.ex)),
			'la fiche corrigerait sur une autre paire que celle qu’elle pose',
		).toEqual([]);
	});

	it('#777, critère 20 : la réponse se choisit parmi des choix proposés, et elle seule est jugée juste', () => {
		expect(manquements((_l, r) => choixDefaillants(r.item))).toEqual([]);
	});

	it('#777, critère 19 : ni l’énoncé affiché ni le texte lu du repli ne demandent de « relier »', () => {
		expect(manquements((_l, r) => gesteRelier(r.item))).toEqual([]);
	});
});

/* ============================================================
   3. Les verrous mordent.
   ------------------------------------------------------------
   Seule une mutation jouée pour de vrai dit qu'un test vert garde quelque chose. Elle
   l'est ici, sur des replis FABRIQUÉS à partir de manches réelles.
   ============================================================ */
describe('Les verrous du repli mordent', () => {
	it('la forme d’avant #731 (question seule) est signalée : groupe illisible ou tâche non nommée', () => {
		expect(
			manquements((l, r) => {
				const avant = `Quel mot va avec « ${r.ex.paires[0].gauche} » ? ${TROU}`;
				return contexteManquant(l, avant, r.ex) === null ? 'question seule non détectée' : null;
			}),
		).toEqual([]);
	});

	it('la forme d’avant #777 (énoncé « Relie… » repris en tête) est signalée', () => {
		expect(
			manquements((_l, r) => {
				const p = r.ex.paires[0];
				const avant: Item = {
					text: `${r.ex.question} **Quel mot va avec « ${p.gauche} » ?** ${TROU}`,
					answer: p.droite,
					kind: 'text',
				};
				return gesteRelier(avant) === null ? '« Relie… » non détecté' : null;
			}),
		).toEqual([]);
	});

	it('une réponse décalée d’une paire est signalée, la bonne ne l’est pas', () => {
		expect(
			manquements((_l, r) => {
				const paire = r.ex.paires[0];
				const question = `Dans ce groupe, « ${paire.gauche} » est… ${TROU}`;
				if (repliIncoherent(question, paire.droite, r.ex) !== null) {
					return 'témoin invalide : la bonne réponse est signalée';
				}
				// La réponse d'une AUTRE paire de la même manche : la fiche corrigerait à côté.
				const autre = r.ex.paires.find((p) => p.droite !== paire.droite);
				if (!autre) return 'témoin invalide : toutes les paires ont la même réponse';
				return repliIncoherent(question, autre.droite, r.ex) === null
					? 'réponse décalée non détectée'
					: null;
			}),
		).toEqual([]);
	});

	it('une question qui ne désigne aucun mot de la manche, ou plusieurs, est signalée', () => {
		expect(
			manquements((_l, r) => {
				const reponse = r.ex.paires[0].droite;
				const flou = `Quel mot va avec celui-ci ? ${TROU}`;
				if (repliIncoherent(flou, reponse, r.ex) === null)
					return 'question sans cible non détectée';
				const [a, b] = r.ex.paires;
				const deux = `« ${a.gauche} » ou « ${b.gauche} » : ${TROU}`;
				return repliIncoherent(deux, reponse, r.ex) === null
					? 'question à deux cibles non détectée'
					: null;
			}),
		).toEqual([]);
	});

	it('des choix absents, sans la réponse, réduits à un ou en double sont signalés ; des choix conformes, non', () => {
		const base: Item = { text: `« chant » : ${TROU}`, answer: 'chanteur', kind: 'text' };
		expect(choixDefaillants(base)).not.toBeNull();
		expect(choixDefaillants({ ...base, choices: ['dentiste', 'plante'] })).not.toBeNull();
		expect(choixDefaillants({ ...base, choices: ['chanteur'] })).not.toBeNull();
		expect(choixDefaillants({ ...base, choices: ['chanteur', 'chanteur'] })).not.toBeNull();
		expect(choixDefaillants({ ...base, choices: ['dentiste', 'chanteur', 'plante'] })).toBeNull();
	});

	it('« relie / reliez / relier » est signalé, à l’énoncé comme au texte lu ; ses faux amis et un mot cité, non', () => {
		const item = (text: string, parle?: string): Item => ({
			text,
			answer: 'x',
			kind: 'text',
			parle,
		});
		for (const text of ['Relie chaque mot. @', 'Reliez les mots. @', '**Relier** les mots : @']) {
			expect(gesteRelier(item(text)), text).not.toBeNull();
		}
		expect(gesteRelier(item('Quel mot ? @', 'Relie chaque mot.'))).not.toBeNull();
		for (const text of ['Le relief. @', 'Tu relis la phrase. @', 'Le mot « relier » : @']) {
			expect(gesteRelier(item(text)), text).toBeNull();
		}
	});
});
