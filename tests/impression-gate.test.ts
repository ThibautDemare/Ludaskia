/* ============================================================
   Impression sous contrôle (#777, critères 19 à 22).

   Écrit AVANT l'implémentation (#777, skill /cadrer) : rouge à l'arrivée sauf
   non-régressions.

   Pourquoi un gate : la version papier ne se voit presque jamais (le mainteneur
   n'imprime pas), donc ses défauts durent. Constats réels du 22/10/2026 :
   - un bloc de bilan imprimé titré « Clique sur le verbe » au-dessus de « Recopie le
     verbe conjugué… » ;
   - le repli de « Nomme les mots du groupe » qui demande « Quel mot va avec « son » ? »
     en attendant « déterminant », sans montrer les étiquettes possibles ;
   - « Je décompose jusqu'à 10 000 » au-dessus de nombres à 7 chiffres au CM1.

   Balayage : CHAQUE leçon du catalogue × CHAQUE niveau qu'elle couvre × quelques
   graines fixes. Par couple, deux documents réels (`buildPrintableDOM`) : un bilan de
   3 questions et une fiche, chacun AVEC corrigé (feuille vierge, page de garde du
   corrigé, puis réponses révélées).
   - critère 19 : le texte imprimé ne parle pas de gestes d'écran et ne laisse passer
     aucun marqueur technique ;
   - critère 20 : chaque question imprimée a de quoi répondre (dans le document, puis
     item par item selon le format d'origine de l'exercice) ;
   - critère 21 : un titre « jusqu'à N » ne coiffe aucune question dont un nombre
     dépasse N ;
   - critère 22 : le corrigé reprend les mêmes questions, dans le même ordre, chacune
     avec sa réponse révélée.

   Les attendus viennent des critères, pas du code : zone de réponse, réponse révélée et
   « nombre lu » sont définis ici sur ce qu'un enfant ou un parent voit sur la feuille.
   Chaque détecteur a ses témoins, joués sur un rendu FABRIQUÉ (aucune mutation du code
   ni de la donnée) : un cas qu'il doit signaler, et un cas voisin qu'il ne doit PAS
   signaler.

   Mémoire (mesuré le 22/10/2026, GC forcé) : `querySelectorAll` de happy-dom retient
   environ 2,5 Mo par document parsé, jamais rendus ; sur ~2 000 documents, le processus
   tombe à court de tas. D'où un parcours d'arbre maison sur `classList` (aucun
   sélecteur CSS), et un balayage unique qui ne garde que les fautes (des chaînes).
   ============================================================ */
import { beforeAll, describe, it, expect } from 'vitest';
import {
	genLessonItem,
	getAllLessons,
	isLegacyMathLesson,
	itemDepuisExercice,
	type LessonDef,
	type SchoolLevel,
} from '../src/core/catalog';
import { buildPrintableDOM, type PrintScope } from '../src/core/lessons';
import { createRenderContext, renderItem, type Item } from '../src/core/items';
import { withSeed } from '../src/core/utils';
import type { Exercise } from '../src/core/exercise';
import { GESTES, RADICAUX_GESTES, radicalCanonique } from './gardes-gestes';

/* ============================================================
   Exceptions écrites (critères 19 et 21).

   Critère 19, règle générale d'abord : dans un ÉNONCÉ, le texte cité entre « » (la
   phrase à analyser, le mot dont on cherche le sens), les libellés de choix imprimés
   (`.qcm-print-label`, des définitions proposées) et la réponse révélée au corrigé (le
   mot attendu) sont du CONTENU, pas une instruction : le contrôle des gestes ne les lit
   pas. Les marqueurs techniques, eux, y sont toujours cherchés : un « @ » cité reste un
   « @ » imprimé.

   Restent les phrases de banque NON citées (une phrase à compléter, un exemple
   d'emploi). Pour elles seules, une exception écrite par (leçon, RADICAL, raison) :
   le radical couvre toutes les flexions (« écout » vaut pour écoute, écoutes,
   écoutons…), parce qu'une banque de phrases ouverte en fait sortir de nouvelles au
   moindre tirage. Elle ne vaut QUE dans un énoncé de SA leçon : jamais dans un titre,
   une consigne ou le reste de la page.

   Critère 21 : exception par (leçon, nombre tel qu'imprimé, raison). Vide.
   ============================================================ */
interface ExceptionGeste {
	lecon: string;
	/** Radical canonique, l'un de `RADICAUX_GESTES`. */
	radical: string;
	raison: string;
}
interface ExceptionPlage {
	lecon: string;
	nombre: string;
	raison: string;
}
const PHRASE_DE_BANQUE =
	"phrase d'exemple de la banque, à lire ou à compléter : pas une instruction";
/* Liste établie le 22/10/2026 sur 40 graines (exploration ponctuelle, toutes leçons de
   français, bilan et fiche) : c'est TOUT le contenu non cité qu'elles ont fait sortir. Le
   gate n'en tire que 8 ; une liste dressée sur ses seules 8 graines changerait au moindre
   changement de consommation de l'aléa (constaté : retirer le corrigé des graines 5 à 8
   a fait sortir `fr-homophones-et` de l'échantillon et entrer `fr-homophones-on`). */
const EXCEPTIONS_GESTES: readonly ExceptionGeste[] = [
	// « Il regarde ___ il écoute. » : phrase à compléter par « et » / « est ».
	{ lecon: 'fr-homophones-et', radical: 'écout', raison: PHRASE_DE_BANQUE },
	// « En classe, ___ écoute la maîtresse. » : phrase à compléter par « on » / « ont ».
	{ lecon: 'fr-homophones-on', radical: 'écout', raison: PHRASE_DE_BANQUE },
	// « Tu écoutes de la musique ___ la radio ? » : phrase à compléter par « ou » / « où ».
	{ lecon: 'fr-homophones-ou', radical: 'écout', raison: PHRASE_DE_BANQUE },
	// « Il déplace la souris pour cliquer sur l'écran. » : exemple d'emploi de « souris »
	// dont on cherche le sens. Les deux verbes y sont du contenu.
	{ lecon: 'fr-vocab-homonymes-cm1', radical: 'déplac', raison: PHRASE_DE_BANQUE },
	{ lecon: 'fr-vocab-homonymes-cm1', radical: 'cliqu', raison: PHRASE_DE_BANQUE },
	// « Attention, le trottoir est couvert de glace, ça glisse. » : exemple d'emploi de
	// « glace ».
	{ lecon: 'fr-vocab-homonymes-cm1', radical: 'gliss', raison: PHRASE_DE_BANQUE },
	// « Une fine couche de glace qui rend le sol glissant. » : définition du mot à trouver.
	{
		lecon: 'fr-vocab-champs-mots',
		radical: 'gliss',
		raison: 'définition du mot à trouver : pas une instruction',
	},
	// « Attention, ça glisse ___ » : phrase dont on choisit la ponctuation finale.
	{ lecon: 'fr-gram-ponctuation', radical: 'gliss', raison: PHRASE_DE_BANQUE },
];
const EXCEPTIONS_PLAGE: readonly ExceptionPlage[] = [];

/* ---------- Parcours d'arbre (sans sélecteur CSS, cf. en-tête) ---------- */

function dom(balisage: string): HTMLElement {
	const racine = document.createElement('div');
	racine.innerHTML = balisage;
	return racine;
}

const niveauxDe = (lesson: LessonDef): SchoolLevel[] =>
	lesson.levels.length > 0 ? lesson.levels : ['ce2'];

type Predicat = (e: Element) => boolean;

const aClasse =
	(...noms: string[]): Predicat =>
	(e) =>
		noms.some((c) => e.classList.contains(c));
const balise = (e: Element): string => e.tagName.toLowerCase();

/** Descendants (racine exclue) qui satisfont `garder`. Avec `sansImbriques`, on ne
    descend pas sous un élément retenu. */
function chercher(racine: Element, garder: Predicat, sansImbriques = false): Element[] {
	const out: Element[] = [];
	const visiter = (e: Element): void => {
		for (const c of e.children) {
			if (garder(c)) {
				out.push(c);
				if (sansImbriques) continue;
			}
			visiter(c);
		}
	};
	visiter(racine);
	return out;
}
const existe = (racine: Element, garder: Predicat): boolean => chercher(racine, garder).length > 0;

/** Une question imprimée : une ligne de bilan, de fiche, ou de fiche de calcul mental.
    Une question imbriquée dans une autre n'en est pas une seconde. */
const estQuestion = aClasse('bop', 'conj-op', 'op');
const questions = (racine: Element): Element[] => chercher(racine, estQuestion, true);

/** Unités titrées : un bloc de bilan, une fiche. */
const estUnite = aClasse('bloc', 'fiche');
const estTitreUnite = aClasse('btheme', 'fiche-title');

const estChampCache = (e: Element): boolean =>
	balise(e) === 'input' && e.getAttribute('type') === 'hidden';

/** Ce qui ne s'imprime pas ou ne se lit pas sur papier : réservé à l'écran ou au lecteur
    d'écran, descriptions SVG (`title`/`desc`), champs cachés. */
const BALISES_INVISIBLES = new Set(['title', 'desc', 'script', 'style']);
const estInvisible = (e: Element): boolean =>
	BALISES_INVISIBLES.has(balise(e)) ||
	aClasse('screen-only', 'sr-only')(e) ||
	e.hasAttribute('hidden') ||
	estChampCache(e);

/** Balises de mise en forme À L'INTÉRIEUR d'une phrase : elles ne séparent rien. Toute
    autre frontière d'élément sépare (sinon un titre collé à sa consigne fusionnerait deux
    mots, et deux spans de fraction « 3 » et « 100 » se liraient « 3100 »). */
const FORMATAGE = new Set(['strong', 'b', 'em', 'i', 'u', 'mark']);

interface OptionsLecture {
	/** Sous-arbres déjà examinés à part. */
	exclure?: ReadonlySet<Element>;
	/** Ce qu'on insère à une frontière d'élément. Une espace pour lire des mots ; une
	    barre pour lire des nombres, où un champ entre « 89 » et « 107 » ne doit pas
	    fabriquer « 89 107 ». */
	frontiere?: string;
}

/** Texte tel qu'on le lit sur la feuille, espaces réduites. */
function texteVisible(racine: Node, { exclure, frontiere = ' ' }: OptionsLecture = {}): string {
	const morceaux: string[] = [];
	const parcourir = (n: Node): void => {
		if (n.nodeType === 3) {
			morceaux.push(n.textContent ?? '');
			return;
		}
		if (!(n instanceof Element)) {
			n.childNodes.forEach(parcourir);
			return;
		}
		if (exclure?.has(n) || estInvisible(n)) return;
		const coupe = !FORMATAGE.has(balise(n));
		if (coupe) morceaux.push(frontiere);
		n.childNodes.forEach(parcourir);
		if (coupe) morceaux.push(frontiere);
	};
	parcourir(racine);
	return morceaux.join('').normalize('NFC').replace(/\s+/g, ' ').trim();
}

const titreDe = (u: Element): string => {
	const t = chercher(u, estTitreUnite)[0];
	return t ? texteVisible(t) : '';
};

const extrait = (s: string, n = 90): string => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Extrait centré sur la position `i` (là où le détecteur a trouvé quelque chose). */
const autour = (s: string, i: number, n = 45): string =>
	`${i > n ? '…' : ''}${s.slice(Math.max(0, i - n), i + n)}${i + n < s.length ? '…' : ''}`;

/** Une faute : `cle` regroupe les fautes de même nature (une ligne par couple et par
    clé dans le message d'échec), `texte` la décrit. */
interface Faute {
	cle: string;
	texte: string;
}

/** Recueil de fautes : une ligne par couple et par nature de faute (la première vue),
    pour une liste de travail lisible plutôt qu'un déluge de tirages identiques. */
class Recueil {
	private readonly parCle = new Map<string, string>();
	noter(coupleId: string, f: Faute, contexte: string): void {
		const k = `${coupleId}¦${f.cle}`;
		if (!this.parCle.has(k)) this.parCle.set(k, `${coupleId} : ${contexte} ${f.texte}`);
	}
	lignes(): string[] {
		return [...this.parCle.values()];
	}
	message(): string {
		const couples = new Set([...this.parCle.keys()].map((k) => k.split('¦')[0]));
		return `${couples.size} couple(s) leçon @niveau fautif(s)`;
	}
}

/* ============================================================
   Critère 19 — détecteur : texte imprimé sain.
   ============================================================ */

/* Les verbes de geste d'écran (`RADICAUX_GESTES`, `GESTES`) viennent du détecteur partagé
   `tests/gardes-gestes.ts`, éprouvé seul dans `gardes-gestes.test.ts`. */

/** Retire d'un énoncé le texte cité entre « » (citations imbriquées comprises) : c'est
    du contenu. Un « ouvrant sans fermant est laissé tel quel. */
function sansCitations(texte: string): string {
	let avant = '';
	let apres = texte;
	while (avant !== apres) {
		avant = apres;
		apres = apres.replace(/«[^«»]*»/gu, ' ');
	}
	return apres;
}

/** Contenu d'un énoncé, hors citations : le libellé d'un choix imprimé (une définition,
    un mot proposé) et la réponse révélée au corrigé (le mot attendu, souvent recopié de
    la phrase citée : « écoutent »). */
const estContenuEnonce = aClasse('qcm-print-label', 'ans-corrige', 'posee-corrige');

/** Marqueurs techniques qui ne doivent jamais atteindre le papier. */
const MARQUEURS: { nom: string; motif: RegExp }[] = [
	{ nom: '@', motif: /@/u },
	{ nom: '**', motif: /\*\*/u },
	{ nom: 'undefined', motif: /(?<!\p{L})undefined(?!\p{L})/u },
	{ nom: 'NaN', motif: /(?<!\p{L})NaN(?!\p{L})/u },
	{ nom: '[object', motif: /\[object/u },
];

type Zone = 'titre' | 'consigne' | 'énoncé' | 'page';
const estTitre = aClasse('btheme', 'fiche-title', 'bilan-title', 'tagline');
const estConsigne = aClasse(
	'bloc-consigne',
	'consigne-line',
	'fiche-sub',
	'consigne',
	'cover-sub',
	'bilan-sub',
);

/** Défauts de texte d'une partie imprimée.
    - Gestes : dans un énoncé, on ne lit ni les citations « », ni les libellés de choix, ni
      la réponse révélée (contenu), et une exception écrite efface un radical pour SA leçon.
      Titres, consignes et reste de la page sont lus en entier, sans exception possible.
    - Marqueurs techniques : cherchés partout, contenu compris. */
function defautsTexte(
	racine: HTMLElement,
	lecon: string,
	exceptions: readonly ExceptionGeste[],
): Faute[] {
	const zones: { zone: Zone; el: Element }[] = [
		...chercher(racine, estTitre).map((el) => ({ zone: 'titre' as const, el })),
		...chercher(racine, estConsigne).map((el) => ({ zone: 'consigne' as const, el })),
		...questions(racine).map((el) => ({ zone: 'énoncé' as const, el })),
	];
	const textes: { zone: Zone; texte: string; controle: string }[] = [
		...zones.map(({ zone, el }) => {
			const texte = texteVisible(el);
			const controle =
				zone === 'énoncé'
					? sansCitations(texteVisible(el, { exclure: new Set(chercher(el, estContenuEnonce)) }))
					: texte;
			return { zone, texte, controle };
		}),
		(() => {
			const texte = texteVisible(racine, { exclure: new Set(zones.map((z) => z.el)) });
			return { zone: 'page' as const, texte, controle: texte };
		})(),
	];
	const exemptes = new Set(exceptions.filter((e) => e.lecon === lecon).map((e) => e.radical));
	const d: Faute[] = [];
	for (const { zone, texte, controle } of textes) {
		for (const m of controle.matchAll(GESTES)) {
			const mot = m[0].toLowerCase();
			const radical = radicalCanonique.get(m[1].toLowerCase()) ?? m[1].toLowerCase();
			if (zone === 'énoncé' && exemptes.has(radical)) continue;
			d.push({
				cle: `${zone}|${mot}`,
				texte: `${zone}, geste « ${m[0]} » dans « ${autour(controle, m.index)} »`,
			});
		}
		for (const { nom, motif } of MARQUEURS) {
			if (motif.test(texte)) {
				d.push({
					cle: `${zone}|${nom}`,
					texte: `${zone}, marqueur « ${nom} » dans « ${extrait(texte)} »`,
				});
			}
		}
	}
	return d;
}

/* ============================================================
   Critère 20 — détecteurs : questions répondables.
   ============================================================ */

/** Un choix imprimé : un élément de la liste à cocher. */
const estChoixImprime = (e: Element): boolean =>
	balise(e) === 'li' && e.parentElement?.classList.contains('qcm-print-choices') === true;

/** Zone de réponse sur la feuille vierge : un champ visible, une case à remplir, une
    liste de choix à cocher, une opération posée ou une saisie d'heure. */
const estZone = (e: Element): boolean =>
	(balise(e) === 'input' && !estChampCache(e)) ||
	aClasse('cloze-box', 'posee', 'heure-input')(e) ||
	estChoixImprime(e);
const aZoneReponse = (q: Element): boolean => existe(q, estZone);

/** Réponse révélée au corrigé : un texte non vide à la place du champ, une cellule de
    grille révélée, ou la case du bon choix cochée. */
const aReponseRevelee = (q: Element): boolean =>
	chercher(q, aClasse('ans-corrige', 'posee-corrige')).some((e) => texteVisible(e) !== '') ||
	existe(q, aClasse('qcm-print-box--checked'));

type Partie = 'feuille' | 'corrigé';

/** Défauts de « répondabilité » d'une partie : unité titrée sans aucune question,
    question sans zone de réponse (feuille) ou sans réponse révélée (corrigé). */
function defautsRepondable(racine: HTMLElement, partie: Partie): Faute[] {
	const d: Faute[] = [];
	for (const u of chercher(racine, estUnite)) {
		if (questions(u).length === 0) {
			d.push({ cle: `${partie}|vide`, texte: `« ${titreDe(u)} » n'imprime aucune question` });
		}
	}
	for (const q of questions(racine)) {
		const ok = partie === 'feuille' ? aZoneReponse(q) : aReponseRevelee(q);
		if (!ok) {
			const quoi = partie === 'feuille' ? 'aucune zone de réponse' : 'aucune réponse révélée';
			d.push({ cle: `${partie}|zone`, texte: `${quoi} pour « ${extrait(texteVisible(q))} »` });
		}
	}
	return d;
}

const papier = (it: Item): HTMLElement =>
	dom(renderItem(it, createRenderContext({ printMode: true })).balisage);

const choixImprimes = (racine: Element): string[] =>
	chercher(racine, estChoixImprime).map((li) => texteVisible(li));

const apostropheDroite = (s: string): string => s.replace(/[’ʼ]/g, "'");

/** Le mot figure-t-il, entier, dans le texte ? Frontières de lettres seulement là où le mot
    commence ou finit par une lettre (« l' » se lit collé à « arbre »). */
function contientMot(texte: string, mot: string): boolean {
	const m = apostropheDroite(mot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const avant = /^\p{L}/u.test(mot) ? '(?<!\\p{L})' : '';
	const apres = /\p{L}$/u.test(mot) ? '(?!\\p{L})' : '';
	return new RegExp(`${avant}${m}${apres}`, 'iu').test(apostropheDroite(texte));
}

/** Défauts d'un item rendu sur papier, selon le format de l'exercice dont il vient :
    - tout item : une zone de réponse ;
    - un item à `choices` : TOUS ses choix imprimés, dans la liste à cocher ;
    - repli d'un « clique sur le mot » : chaque mot attendu se lit dans l'énoncé (sinon on
      demande de recopier un mot absent de la feuille) ;
    - repli d'un « relier » : la réponse attendue figure parmi des choix imprimés (au moins
      deux), sinon l'enfant doit deviner le mot ou l'étiquette que la leçon attend. */
function defautsItemImprime(it: Item, ex: Exercise | null, racine: HTMLElement): Faute[] {
	const d: Faute[] = [];
	if (!aZoneReponse(racine)) d.push({ cle: 'zone', texte: 'aucune zone de réponse' });
	const choix = it.choices ?? [];
	const imprimes = choixImprimes(racine);
	if (choix.length > 0) {
		if (imprimes.length !== choix.length) {
			d.push({
				cle: 'choix',
				texte: `${imprimes.length} choix imprimé(s) pour ${choix.length} : ${JSON.stringify(choix)}`,
			});
		} else {
			choix.forEach((c, i) => {
				// Un choix à vue riche (fraction empilée, image) s'imprime en dessin : on n'en
				// vérifie que le nombre.
				if (!it.choicesView?.[i] && imprimes[i] !== c) {
					d.push({ cle: 'choix', texte: `choix « ${c} » imprimé « ${imprimes[i]} »` });
				}
			});
		}
	}
	if (ex?.type === 'clicMot') {
		const lu = texteVisible(racine);
		for (const i of ex.cibleIndices) {
			const mot = ex.tokens[i];
			if (!contientMot(lu, mot)) {
				d.push({
					cle: 'clicMot',
					texte: `le mot attendu « ${mot} » ne se lit pas dans « ${extrait(lu)} »`,
				});
			}
		}
	}
	if (ex?.type === 'appariement') {
		const reponse = String(it.answer);
		if (new Set(imprimes).size < 2 || !imprimes.includes(reponse)) {
			d.push({
				cle: 'appariement',
				texte: `la réponse « ${reponse} » n'est pas parmi des choix imprimés (${JSON.stringify(imprimes)}) pour « ${extrait(texteVisible(racine))} »`,
			});
		}
	}
	return d;
}

/* ============================================================
   Critère 21 — détecteur : un titre « jusqu'à N » ne ment pas sur ses nombres.
   ============================================================ */

/** « jusqu'à N » (apostrophe droite ou typographique), N écrit avec ou sans espaces de
    milliers — espace, insécable, fine insécable : toutes dans `\s`. */
const JUSQUA = /jusqu['’]\s*à\s+(\d{1,3}(?:\s\d{3})+|\d+)(?![\d,])/iu;
/** Nombres lus : groupes de milliers séparés par une espace, ou chiffres collés, partie
    décimale à virgule éventuelle. */
const NOMBRE = /(?<![\d,])(?:\d{1,3}(?:\s\d{3})+|\d+)(?:,\d+)?(?!\d)/gu;

const valeurDe = (ecrit: string): number => Number(ecrit.replace(/\s/g, '').replace(',', '.'));

function bornePlage(titre: string): number | null {
	const m = JUSQUA.exec(titre);
	return m ? valeurDe(m[1]) : null;
}

/** Premier nombre d'une unité titrée « jusqu'à N » qui dépasse N, ou `null`. Les nombres
    sont lus question par question, une frontière d'élément (un champ, une case, une
    cellule) séparant deux nombres. */
function defautPlage(
	unite: Element,
	lecon: string,
	exceptions: readonly ExceptionPlage[],
): Faute | null {
	const titre = titreDe(unite);
	const n = bornePlage(titre);
	if (n === null) return null;
	const exemptes = new Set(
		exceptions.filter((e) => e.lecon === lecon).map((e) => valeurDe(e.nombre)),
	);
	for (const q of questions(unite)) {
		const lu = texteVisible(q, { frontiere: ' | ' });
		for (const m of lu.matchAll(NOMBRE)) {
			const v = valeurDe(m[0]);
			if (v > n && !exemptes.has(v)) {
				return {
					cle: 'plage',
					texte: `« ${titre} » au-dessus de « ${m[0]} » dans « ${extrait(texteVisible(q))} »`,
				};
			}
		}
	}
	return null;
}

/* ============================================================
   Critère 22 — détecteur : corrigé fidèle.
   ============================================================ */

/** Ce qui diffère légitimement entre feuille et corrigé : les champs, les cases vides, la
    saisie d'heure (« [ ] h [ ] », dont le « h » est du texte), les réponses révélées, les
    marques de correction d'écran. */
const estDifferenceLegitime = (e: Element): boolean =>
	balise(e) === 'input' ||
	aClasse('cloze-box', 'heure-input', 'ans-corrige', 'posee-corrige', 'mark')(e);

/** Énoncé d'une question, sans ce qui diffère légitimement entre feuille et corrigé. */
const enonce = (q: Element): string =>
	texteVisible(q, { exclure: new Set(chercher(q, estDifferenceLegitime)) });

/** Défauts du corrigé : page de garde absente, nombre ou ordre des questions différent de
    la feuille, question sans réponse révélée ou dont un champ noté est resté vide. */
function defautsCorrige(vierge: HTMLElement, corrige: HTMLElement | null): Faute[] {
	if (!corrige) {
		return [{ cle: 'garde', texte: 'pas de page de garde de corrigé (.cover-corrige)' }];
	}
	const qv = questions(vierge);
	const qc = questions(corrige);
	const d: Faute[] = [];
	if (qv.length !== qc.length) {
		d.push({
			cle: 'nombre',
			texte: `${qc.length} question(s) au corrigé pour ${qv.length} sur la feuille`,
		});
	}
	const n = Math.min(qv.length, qc.length);
	for (let i = 0; i < n; i++) {
		if (enonce(qv[i]) !== enonce(qc[i])) {
			d.push({
				cle: 'ordre',
				texte: `question ${i + 1} : « ${extrait(enonce(qv[i]), 60)} » devient « ${extrait(enonce(qc[i]), 60)} »`,
			});
			break;
		}
	}
	const estChampNote = (e: Element): boolean =>
		balise(e) === 'input' && e.classList.contains('ans') && !estChampCache(e);
	for (const q of qc) {
		if (!aReponseRevelee(q)) {
			d.push({
				cle: 'revelee',
				texte: `sans réponse révélée : « ${extrait(texteVisible(q), 60)} »`,
			});
		} else if (existe(q, estChampNote)) {
			d.push({
				cle: 'champ',
				texte: `champ noté resté vide : « ${extrait(texteVisible(q), 60)} »`,
			});
		}
	}
	return d;
}

/* ============================================================
   Balayage du catalogue (une fois, fautes seules).
   ============================================================ */

/* Graines fixes : le balayage est reproductible, et `buildPrintableDOM` tire sa graine de
   corrigé dans la source déjà fixée par `withSeed`. Le critère 19 en prend le double :
   ce sont les banques de phrases qui font sortir des flexions, et une exception par
   radical doit tenir sur un échantillon plus large que celui qui l'a fait écrire. */
const GRAINES = [1, 2, 3, 4];
const GRAINES_TEXTE = [1, 2, 3, 4, 5, 6, 7, 8];

type Sorte = 'bilan' | 'fiches';

interface Balayage {
	couples: Set<string>;
	documents: number;
	titresPlage: Set<string>;
	formats: Set<string>;
	gestes: Recueil;
	repondable: Recueil;
	items: Recueil;
	plage: Recueil;
	corrige: Recueil;
}

/** Sépare un document « avec corrigé » en feuille vierge et corrigé, de part et d'autre
    de la page de garde `.cover-corrige`. */
function scinder(racine: HTMLElement): { vierge: HTMLElement; corrige: HTMLElement | null } {
	const pages = [...racine.children];
	const garde = pages.findIndex((p) => p.classList.contains('cover-corrige'));
	const vierge = document.createElement('div');
	const corrige = document.createElement('div');
	pages.forEach((p, i) => {
		if (garde < 0 || i < garde) vierge.appendChild(p);
		else if (i > garde) corrige.appendChild(p);
	});
	return { vierge, corrige: garde < 0 ? null : corrige };
}

function examinerDocument(
	b: Balayage,
	lecon: LessonDef,
	niveau: SchoolLevel,
	graine: number,
	sorte: Sorte,
	/** Faux au-delà de `GRAINES` : seul le critère 19 est examiné, sur la feuille seule.
	    Le corrigé n'y ajouterait rien (mêmes énoncés, et la réponse révélée est du contenu)
	    et coûterait le double. */
	tousControles: boolean,
): void {
	const scope: PrintScope = {
		title: 'Bilan',
		lessonIds: [lecon.id],
		kind: sorte,
		nbQ: 3,
		corrige: tousControles,
		level: niveau,
	};
	const { vierge, corrige } = scinder(
		dom(withSeed(graine, () => buildPrintableDOM(scope)).balisage),
	);
	const id = `${lecon.id} @${niveau}`;
	const ou = (partie: Partie): string =>
		`[${sorte === 'bilan' ? 'bilan' : 'fiche'} ${partie}, graine ${graine}]`;
	b.documents++;
	const parties: [Partie, HTMLElement][] = [['feuille', vierge]];
	if (corrige) parties.push(['corrigé', corrige]);
	for (const [partie, el] of parties) {
		for (const f of defautsTexte(el, lecon.id, EXCEPTIONS_GESTES)) {
			b.gestes.noter(id, f, ou(partie));
		}
		if (!tousControles) continue;
		for (const f of defautsRepondable(el, partie)) b.repondable.noter(id, f, ou(partie));
		for (const u of chercher(el, estUnite)) {
			if (bornePlage(titreDe(u)) !== null) b.titresPlage.add(titreDe(u));
			const f = defautPlage(u, lecon.id, EXCEPTIONS_PLAGE);
			if (f) b.plage.noter(id, f, ou(partie));
		}
	}
	if (!tousControles) return;
	for (const f of defautsCorrige(vierge, corrige)) b.corrige.noter(id, f, ou('corrigé'));
}

/** Item par item : l'exercice tiré (format d'origine), son repli, son rendu papier. */
function examinerItem(b: Balayage, lecon: LessonDef, niveau: SchoolLevel, graine: number): void {
	let ex: Exercise | null = null;
	let item: Item;
	if (isLegacyMathLesson(lecon)) {
		item = withSeed(graine, () => genLessonItem(lecon, niveau));
	} else {
		const tire = withSeed(graine, () => lecon.exerciseType.generate({ level: niveau }));
		ex = tire;
		item = itemDepuisExercice(lecon, tire);
	}
	const format = ex?.type ?? 'hérité';
	b.formats.add(format);
	for (const f of defautsItemImprime(item, ex, papier(item))) {
		b.items.noter(
			`${lecon.id} @${niveau}`,
			{ ...f, cle: `${format}|${f.cle}` },
			`[${format}, graine ${graine}]`,
		);
	}
}

let cache: Balayage | null = null;
function balayage(): Balayage {
	if (cache) return cache;
	const b: Balayage = {
		couples: new Set(),
		documents: 0,
		titresPlage: new Set(),
		formats: new Set(),
		gestes: new Recueil(),
		repondable: new Recueil(),
		items: new Recueil(),
		plage: new Recueil(),
		corrige: new Recueil(),
	};
	for (const lecon of getAllLessons()) {
		for (const niveau of niveauxDe(lecon)) {
			b.couples.add(`${lecon.id} @${niveau}`);
			for (const graine of GRAINES_TEXTE) {
				const tous = GRAINES.includes(graine);
				examinerDocument(b, lecon, niveau, graine, 'bilan', tous);
				examinerDocument(b, lecon, niveau, graine, 'fiches', tous);
				if (tous) examinerItem(b, lecon, niveau, graine);
			}
		}
	}
	cache = b;
	return b;
}

/* ============================================================
   Les contrôles.
   ============================================================ */

/* Le balayage (plusieurs dizaines de secondes, davantage sous la charge de la suite
   complète) se fait ici, avec son propre délai : dans un `it`, il dépasserait le
   `testTimeout` de 30 s du projet. */
beforeAll(() => {
	balayage();
}, 180_000);

describe('Balayage : l’inventaire couvre le catalogue (planchers)', () => {
	it('chaque couple leçon @niveau est imprimé en bilan et en fiche, à chaque graine', () => {
		const b = balayage();
		expect(b.couples.size).toBeGreaterThanOrEqual(200);
		expect(b.documents).toBe(b.couples.size * GRAINES_TEXTE.length * 2);
		// Les graines des critères 20 à 22 sont bien parmi celles du balayage.
		expect(GRAINES.every((g) => GRAINES_TEXTE.includes(g))).toBe(true);
	});

	it('les formats d’exercice sensibles au repli papier sont bien balayés', () => {
		const formats = [...balayage().formats];
		for (const f of ['hérité', 'text', 'qcm', 'posed', 'clicMot', 'appariement', 'probleme']) {
			expect(formats, f).toContain(f);
		}
	});

	it('des titres « jusqu’à N » sont vus (sinon le critère 21 serait vert à vide)', () => {
		const titres = balayage().titresPlage;
		expect(titres.size, [...titres].join(' | ')).toBeGreaterThanOrEqual(3);
	});
});

describe('Critère 19 : le texte imprimé ne parle pas d’écran et ne montre aucun marqueur technique', () => {
	it('critère 19 : aucun verbe de geste d’écran ni marqueur technique, sur la feuille comme au corrigé', () => {
		const r = balayage().gestes;
		expect(r.lignes(), r.message()).toEqual([]);
	});

	it('témoins : le détecteur du critère 19 signale ce qu’il doit, et seulement ça', () => {
		const page = (corps: string): HTMLElement =>
			dom(`<div class="page"><div class="bloc">${corps}</div></div>`);
		const quoi = (racine: HTMLElement, exc: readonly ExceptionGeste[] = []): string[] =>
			defautsTexte(racine, 'lecon-temoin', exc).map((f) => f.cle);

		// Le constat : un titre de bloc qui demande de cliquer.
		expect(quoi(page('<span class="btheme">Clique sur le verbe</span>'))).toEqual(['titre|clique']);
		// Flexions et casse.
		for (const verbe of ['Touchez', 'glisser', 'écouté', 'Appuie', 'déplaçant', 'TAPE']) {
			expect(quoi(page(`<div class="bop">${verbe} ici.</div>`)), verbe).toHaveLength(1);
		}
		// Collé à l'élément voisin sans espace, DANS une même zone (titre et consigne sont lus
		// séparément, la jonction n'y est jamais en jeu) : la frontière d'élément sépare.
		expect(quoi(page('<div class="bop"><span>Le verbe</span><span>Clique.</span></div>'))).toEqual([
			'énoncé|clique',
		]);
		// Hors titre, consigne et question : le reste de la page est lu aussi.
		expect(quoi(page('<p class="foot">Touche pour imprimer</p>'))).toEqual(['page|touche']);
		// Marqueurs techniques.
		for (const [texte, nom] of [
			['Il @ beau.', '@'],
			['**Quel mot** ?', '**'],
			['Il reste undefined.', 'undefined'],
			['NaN + 3 =', 'NaN'],
			['[object Object]', '[object'],
		]) {
			expect(quoi(page(`<div class="bop">${texte}</div>`)), texte).toEqual([`énoncé|${nom}`]);
		}
		// Ce qui ne doit PAS être signalé : faux amis, et texte invisible sur papier.
		for (const texte of [
			'Écris les étapes.',
			'Le cliquetis du tapis.',
			'Mon écouteur est cassé.',
			'Une attention touchante.',
			'À Nantes.',
			'Coche la bonne réponse.',
		]) {
			expect(quoi(page(`<div class="bop">${texte}</div>`)), texte).toEqual([]);
		}
		expect(
			quoi(page('<div class="bop">7 + 3 = <span class="screen-only">Clique</span></div>')),
		).toEqual([]);
		expect(
			quoi(
				page(
					'<div class="bop"><svg><title>Touche la figure</title><desc>Clique</desc></svg></div>',
				),
			),
		).toEqual([]);
	});

	it('témoins : « relie / relier / reliez » est un geste d’écran, ses faux amis non', () => {
		const page = (corps: string): HTMLElement =>
			dom(`<div class="page"><div class="bloc">${corps}</div></div>`);
		const quoi = (racine: HTMLElement): string[] =>
			defautsTexte(racine, 'lecon-temoin', []).map((f) => f.cle);
		// Le repli d'un « relier » reprend la consigne du widget dans son énoncé.
		expect(
			quoi(page('<div class="bop">Relie chaque mot à un mot de sa famille. <input></div>')),
		).toEqual(['énoncé|relie']);
		expect(quoi(page('<p class="consigne-line">Reliez les mots.</p>'))).toEqual([
			'consigne|reliez',
		]);
		expect(quoi(page('<span class="btheme">Relier les familles</span>'))).toEqual(['titre|relier']);
		for (const texte of ['Le relief.', 'La religion.', 'Je dois relire.', 'Tu relis la phrase.']) {
			expect(quoi(page(`<div class="bop">${texte}</div>`)), texte).toEqual([]);
		}
	});

	it('témoins : dans un énoncé, le texte cité « » et les libellés de choix sont du contenu', () => {
		const page = (corps: string): HTMLElement =>
			dom(`<div class="page"><div class="bloc">${corps}</div></div>`);
		const quoi = (racine: HTMLElement): string[] =>
			defautsTexte(racine, 'lecon-temoin', []).map((f) => f.cle);
		// La phrase à analyser, citée : pas un geste. La même, non citée : signalée.
		expect(
			quoi(page('<div class="bop">Recopie le verbe : « Les élèves écoutent. »</div>')),
		).toEqual([]);
		expect(quoi(page('<div class="bop">Recopie le verbe : Les élèves écoutent.</div>'))).toEqual([
			'énoncé|écoutent',
		]);
		// Citations imbriquées : tout le segment cité est du contenu.
		expect(
			quoi(page('<div class="bop">« Il a dit « touche pas » puis il a glissé. »</div>')),
		).toEqual([]);
		// La consigne HORS citation reste lue : « Clique sur « chat » » est signalé.
		expect(quoi(page('<div class="bop">Clique sur « chat ».</div>'))).toEqual(['énoncé|clique']);
		// Un libellé de choix (une définition proposée) : pas un geste. Le même texte dans la
		// question, hors libellé : signalé.
		const choix = (q: string) =>
			page(
				`<div class="bop"><p class="qcm-print-q">${q}</p><ul class="qcm-print-choices"><li><span class="qcm-print-box"></span><span class="qcm-print-label">se déplacer très vite</span></li></ul></div>`,
			);
		expect(quoi(choix('Ici, « vole » veut dire :'))).toEqual([]);
		expect(quoi(choix('Déplace la tuile.'))).toEqual(['énoncé|déplace']);
		// La réponse révélée au corrigé (le mot attendu, recopié de la phrase) : du contenu.
		// La même consigne, hors réponse : signalée.
		expect(
			quoi(
				page('<div class="bop">Recopie le verbe : <span class="ans-corrige">écoutent</span></div>'),
			),
		).toEqual([]);
		expect(
			quoi(page('<div class="bop">Écoute. <span class="ans-corrige">écoutent</span></div>')),
		).toEqual(['énoncé|écoute']);
		// Le contenu n'est exempté QUE dans un énoncé : une citation dans un titre ou une
		// consigne (texte d'auteur, donc instruction) est lue.
		expect(quoi(page('<p class="consigne-line">Écris « clique » au pluriel.</p>'))).toEqual([
			'consigne|clique',
		]);
		// Les marqueurs techniques sont cherchés jusque dans le contenu.
		expect(quoi(page('<div class="bop">Recopie : « Il @ beau. »</div>'))).toEqual(['énoncé|@']);
		expect(
			quoi(
				page(
					'<div class="bop"><ul class="qcm-print-choices"><li><span class="qcm-print-label">undefined</span></li></ul></div>',
				),
			),
		).toEqual(['énoncé|undefined']);
	});

	it('témoins : une exception par radical vaut pour toutes ses flexions, dans un énoncé de SA leçon seulement', () => {
		const page = (corps: string): HTMLElement =>
			dom(`<div class="page"><div class="bloc">${corps}</div></div>`);
		const exc: ExceptionGeste[] = [{ lecon: 'lecon-temoin', radical: 'écout', raison: 'témoin' }];
		const quoi = (racine: HTMLElement, lecon = 'lecon-temoin'): string[] =>
			defautsTexte(racine, lecon, exc).map((f) => f.cle);
		// Toutes les flexions du radical, dans un énoncé de la leçon : effacées.
		for (const texte of ['Le chat écoute.', 'Tu écoutes.', 'Nous écoutons.', 'Écoutez !']) {
			expect(quoi(page(`<div class="bop">${texte}</div>`)), texte).toEqual([]);
		}
		// Jamais dans un titre, une consigne ou le reste de la page.
		expect(quoi(page('<span class="btheme">Écoute</span>'))).toEqual(['titre|écoute']);
		expect(quoi(page('<p class="consigne-line">Écoutez.</p>'))).toEqual(['consigne|écoutez']);
		expect(quoi(page('<p class="foot">Écoute.</p>'))).toEqual(['page|écoute']);
		// Pas pour une autre leçon, ni pour un autre radical.
		expect(quoi(page('<div class="bop">Le chat écoute.</div>'), 'autre-lecon')).toEqual([
			'énoncé|écoute',
		]);
		expect(quoi(page('<div class="bop">Ça glisse.</div>'))).toEqual(['énoncé|glisse']);
		// Une variante graphique se ramène à son radical canonique (« déplaç » → « déplac »).
		const excDeplac: ExceptionGeste[] = [{ lecon: 'l', radical: 'déplac', raison: 'témoin' }];
		expect(defautsTexte(page('<div class="bop">En se déplaçant.</div>'), 'l', excDeplac)).toEqual(
			[],
		);
	});

	/* Pas d'exigence « chaque entrée sert sur les 8 graines » : la liste est dressée sur 40
	   (cf. sa définition), et une telle exigence rougirait au moindre changement de
	   consommation de l'aléa, sans rapport avec l'impression. */
	it('critère 19 : la liste d’exceptions est bien formée (leçon existante, radical connu, raison, sans doublon)', () => {
		const ids = new Set(getAllLessons().map((l) => l.id));
		expect(defautsListeExceptions(EXCEPTIONS_GESTES, ids)).toEqual([]);
		// Témoin : chaque malformation est signalée.
		const mal: ExceptionGeste[] = [
			{ lecon: 'lecon-inconnue', radical: 'écout', raison: 'r' },
			{ lecon: 'fr-homophones-ou', radical: 'écoute', raison: 'r' },
			{ lecon: 'fr-homophones-ou', radical: 'gliss', raison: ' ' },
			{ lecon: 'fr-homophones-ou', radical: 'écout', raison: 'r' },
			{ lecon: 'fr-homophones-ou', radical: 'écout', raison: 'r' },
		];
		// Comparé sans l'aide entre parenthèses, qui recopie la liste des radicaux.
		expect(defautsListeExceptions(mal, ids).map((d) => d.replace(/ \(.*\)$/u, ''))).toEqual([
			'lecon-inconnue / écout : leçon absente du catalogue',
			'fr-homophones-ou / écoute : radical inconnu',
			'fr-homophones-ou / gliss : raison vide',
			'fr-homophones-ou / écout : en double',
		]);
	});
});

/** Malformations d'une liste d'exceptions de gestes. */
function defautsListeExceptions(
	liste: readonly ExceptionGeste[],
	ids: ReadonlySet<string>,
): string[] {
	const vues = new Set<string>();
	return liste.flatMap((e) => {
		const d: string[] = [];
		const qui = `${e.lecon} / ${e.radical}`;
		if (!ids.has(e.lecon)) d.push(`${qui} : leçon absente du catalogue`);
		if (!Object.hasOwn(RADICAUX_GESTES, e.radical)) {
			d.push(`${qui} : radical inconnu (radicaux : ${Object.keys(RADICAUX_GESTES).join(', ')})`);
		}
		if (e.raison.trim() === '') d.push(`${qui} : raison vide`);
		if (vues.has(qui)) d.push(`${qui} : en double`);
		vues.add(qui);
		return d;
	});
}

describe('Critère 20 : chaque question imprimée a de quoi répondre', () => {
	it('critère 20 : sur la feuille, chaque question a une zone de réponse ; au corrigé, sa réponse révélée', () => {
		const r = balayage().repondable;
		expect(r.lignes(), r.message()).toEqual([]);
	});

	it('critère 20 : chaque item, rendu sur papier, imprime ce qu’il faut pour répondre selon son format', () => {
		const r = balayage().items;
		expect(r.lignes(), r.message()).toEqual([]);
	});

	it('témoins : les détecteurs du critère 20 signalent ce qu’ils doivent, et seulement ça', () => {
		const feuille = (q: string): HTMLElement =>
			dom(`<div class="page"><div class="bloc"><span class="btheme">T</span>${q}</div></div>`);
		const cles = (racine: HTMLElement, partie: Partie): string[] =>
			defautsRepondable(racine, partie).map((f) => f.cle);
		// Question « en l'air » (rien où écrire), ou un champ caché seul (QCM d'écran).
		expect(cles(feuille('<div class="bop">7 × 8 =</div>'), 'feuille')).toEqual(['feuille|zone']);
		expect(
			cles(feuille('<div class="bop">7 × 8 = <input type="hidden" class="ans"></div>'), 'feuille'),
		).toEqual(['feuille|zone']);
		// Bloc qui n'imprime aucune question.
		expect(cles(feuille(''), 'feuille')).toEqual(['feuille|vide']);
		// Corrigé : réponse vide, ou QCM sans case cochée.
		expect(
			cles(feuille('<div class="bop">7 × 8 = <span class="ans-corrige"> </span></div>'), 'corrigé'),
		).toEqual(['corrigé|zone']);
		const qcmNonCoche =
			'<div class="bop"><ul class="qcm-print-choices"><li><span class="qcm-print-box"></span>a</li></ul></div>';
		expect(cles(feuille(qcmNonCoche), 'corrigé')).toEqual(['corrigé|zone']);
		// Ce qui ne doit PAS être signalé.
		for (const q of [
			'<div class="bop">7 × 8 = <input class="ans"></div>',
			'<div class="bop">Il <span class="cloze-box"></span> beau.</div>',
			'<div class="bop"><ul class="qcm-print-choices"><li>a</li></ul></div>',
			'<div class="bop"><div class="posee"></div></div>',
			'<div class="bop">Il est <span class="heure-input"></span>.</div>',
		]) {
			expect(cles(feuille(q), 'feuille'), q).toEqual([]);
		}
		for (const q of [
			'<div class="bop">7 × 8 = <span class="ans-corrige">56</span></div>',
			'<div class="bop"><ul class="qcm-print-choices"><li><span class="qcm-print-box qcm-print-box--checked"></span>a</li></ul></div>',
			'<div class="bop"><div class="posee"><span class="posee-corrige">5</span></div></div>',
		]) {
			expect(cles(feuille(q), 'corrigé'), q).toEqual([]);
		}

		// Niveau item. Un QCM rendu SANS sa liste imprimée (rendu écran) est signalé.
		const qcm: Item = {
			text: 'Il @ beau.',
			answer: 'fait',
			kind: 'text',
			choices: ['fait', 'fais'],
		};
		const ecran = dom(renderItem(qcm, createRenderContext()).balisage);
		expect(defautsItemImprime(qcm, null, ecran).map((f) => f.cle)).toContain('choix');
		expect(defautsItemImprime(qcm, null, papier(qcm))).toEqual([]);
		// Un repli de « clique sur le mot » dont l'énoncé perd la phrase est signalé.
		const clic: Exercise = {
			type: 'clicMot',
			tokens: ['Le', 'chat', 'dort', '.'],
			cibleIndices: [2],
			consigne: 'Trouve le verbe.',
			explication: '',
			parle: 'Le chat dort.',
		};
		const sansPhrase: Item = {
			text: 'Recopie le verbe conjugué : @',
			answer: 'dort',
			kind: 'text',
		};
		expect(defautsItemImprime(sansPhrase, clic, papier(sansPhrase)).map((f) => f.cle)).toEqual([
			'clicMot',
		]);
		const avecPhrase: Item = {
			text: 'Recopie le verbe : « Le chat dort. » @',
			answer: 'dort',
			kind: 'text',
		};
		expect(defautsItemImprime(avecPhrase, clic, papier(avecPhrase))).toEqual([]);
		// « l' » se lit collé au mot suivant ; « dort » ne se lit pas dans « dortoir ».
		expect(contientMot("Recopie : « l'arbre »", "l'")).toBe(true);
		expect(contientMot('Le dortoir.', 'dort')).toBe(false);
		// Un repli de « relier » : sans choix (signalé), avec des choix dont la réponse (pas
		// signalé), avec des choix SANS la réponse (signalé).
		const relier: Exercise = {
			type: 'appariement',
			question: 'Relie.',
			paires: [{ gauche: 'son', droite: 'déterminant' }],
		};
		const sansChoix: Item = {
			text: 'Quel mot va avec « son » ? @',
			answer: 'déterminant',
			kind: 'text',
		};
		expect(defautsItemImprime(sansChoix, relier, papier(sansChoix)).map((f) => f.cle)).toEqual([
			'appariement',
		]);
		const avecChoix: Item = { ...sansChoix, choices: ['déterminant', 'nom', 'adjectif'] };
		expect(defautsItemImprime(avecChoix, relier, papier(avecChoix))).toEqual([]);
		const choixFaux: Item = { ...sansChoix, choices: ['nom', 'adjectif'] };
		expect(defautsItemImprime(choixFaux, relier, papier(choixFaux)).map((f) => f.cle)).toContain(
			'appariement',
		);
	});
});

describe('Critère 21 : un titre « jusqu’à N » ne coiffe aucun nombre au-delà de N', () => {
	it('critère 21 : aucun nombre d’une question (énoncé ou réponse révélée) ne dépasse le N du titre', () => {
		const r = balayage().plage;
		expect(r.lignes(), r.message()).toEqual([]);
	});

	it('témoins : le détecteur du critère 21 signale ce qu’il doit, et seulement ça', () => {
		const INSECABLE = String.fromCharCode(0x00a0);
		const FINE = String.fromCharCode(0x202f);
		const APOSTROPHE = String.fromCharCode(0x2019);
		const bloc = (titre: string, q: string): Element =>
			dom(`<div class="bloc"><span class="btheme">${titre}</span><div class="bop">${q}</div></div>`)
				.firstElementChild ?? document.createElement('div');
		// N sous toutes ses graphies.
		for (const t of [
			"jusqu'à 10 000",
			`jusqu'à 10${INSECABLE}000`,
			`jusqu${APOSTROPHE}à 10${FINE}000`,
			"jusqu'à 10000",
		]) {
			expect(bornePlage(t), t).toBe(10000);
		}
		expect(bornePlage('Je décompose avec les multiplications')).toBeNull();
		// Le constat : 7 chiffres sous « jusqu'à 10 000 », groupés ou collés.
		const titre = "Je décompose jusqu'à 10 000";
		const signale = (q: string, lecon = 'x', exc: readonly ExceptionPlage[] = []): boolean =>
			defautPlage(bloc(titre, q), lecon, exc) !== null;
		expect(signale(`<span class="bignum">4${FINE}567${FINE}892</span> = @`)).toBe(true);
		expect(signale('4567892 = <input class="ans">')).toBe(true);
		// Réponse révélée au corrigé au-delà de N.
		expect(signale('Écris : <span class="ans-corrige">12 000</span>')).toBe(true);
		// Ce qui ne doit PAS être signalé : N lui-même, un décimal, deux nombres séparés par
		// un champ (« 89 [ ] 107 » n'est pas « 89 107 »), deux spans de fraction (« 3 » sur
		// « 100 » n'est pas « 3100 »), une grille de chiffres posés.
		for (const q of [
			'10 000 = <input class="ans"> milliers',
			'7 249 = 7 milliers + 2 centaines',
			'3,45 + 2 =',
			'Compare : 89 <input class="ans"> 107',
			'<span class="frac"><span class="frac-num">3</span><span class="frac-den">100</span></span>',
			'<span class="posee-cell">9</span><span class="posee-cell">9</span><span class="posee-cell">9</span><span class="posee-cell">9</span><span class="posee-cell">9</span>',
		]) {
			expect(signale(q), q).toBe(false);
		}
		// Une exception écrite n'efface QUE son nombre, pour SA leçon.
		const exc: ExceptionPlage[] = [{ lecon: 'x', nombre: '12 000', raison: 'témoin' }];
		expect(signale('12 000', 'x', exc)).toBe(false);
		expect(signale('12 000', 'y', exc)).toBe(true);
		expect(signale('13 000', 'x', exc)).toBe(true);
	});
});

describe('Critère 22 : le corrigé reprend les questions de la feuille, réponses révélées', () => {
	it('critère 22 : même nombre de questions, même ordre, chacune avec sa réponse révélée', () => {
		const r = balayage().corrige;
		expect(r.lignes(), r.message()).toEqual([]);
	});

	it('témoins : le détecteur du critère 22 signale ce qu’il doit, et seulement ça', () => {
		const partie = (...qs: string[]): HTMLElement =>
			dom(`<div class="page">${qs.map((q) => `<div class="bop">${q}</div>`).join('')}</div>`);
		const v = partie('7 × 8 = <input class="ans">', 'Il <span class="cloze-box"></span> beau.');
		const cles = (c: HTMLElement | null): string[] => defautsCorrige(v, c).map((f) => f.cle);
		const r56 = '7 × 8 = <span class="ans-corrige">56</span>';
		const rFait = 'Il <span class="ans-corrige">fait</span> beau.';
		// Fidèle : rien à signaler. Y compris une saisie d'heure « [ ] h [ ] » révélée en
		// « 4 h 15 » : le « h » du gabarit n'est pas une différence d'énoncé.
		expect(cles(partie(r56, rFait))).toEqual([]);
		const heureV = partie(
			'Quelle heure ? <span class="heure-input"><input class="ans"><span>h</span><input></span>',
		);
		const heureC = partie('Quelle heure ? <span class="ans-corrige">4 h 15</span>');
		expect(defautsCorrige(heureV, heureC)).toEqual([]);
		// Pas de corrigé du tout.
		expect(cles(null)).toEqual(['garde']);
		// Une question en moins.
		expect(cles(partie(r56))).toEqual(['nombre']);
		// Même nombre, autre ordre (régénéré sans la graine commune).
		expect(cles(partie(rFait, r56))).toEqual(['ordre']);
		// Réponse vide, ou champ noté laissé tel quel.
		expect(cles(partie('7 × 8 = <span class="ans-corrige"></span>', rFait))).toEqual(['revelee']);
		expect(cles(partie('7 × 8 = <input class="ans">', rFait))).toEqual(['revelee']);
		expect(
			cles(partie('7 × 8 = <input class="ans"> <span class="ans-corrige">56</span>', rFait)),
		).toEqual(['champ']);
	});
});
