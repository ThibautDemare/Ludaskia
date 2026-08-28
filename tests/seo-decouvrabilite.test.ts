import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { getAllLessons } from '../src/core/catalog';
import { availableLevels, LEVEL_LABEL, LEVEL_ORDER } from '../src/core/levels';

/* ============================================================
   Découvrabilité par les moteurs — balisage des trois pages (#631).

   Écrit À PARTIR DE L'ISSUE et AVANT l'implémentation : au moment où ce fichier
   est ajouté, aucune des trois pages ne porte de `canonical`, `app.html` n'a pas
   de `meta description`, `public/sitemap.xml` n'existe pas et il n'y a aucun
   JSON-LD. Les tests de critère ci-dessous sont donc ROUGES par construction —
   c'est la seule façon qu'ils aient de garder quelque chose (cf. CLAUDE.md,
   « les critères AVANT le code »).

   ── D'où viennent les attendus ────────────────────────────────────────────────
   De l'issue, pas du code : l'URL de production (`https://thibautdemare.github.io/
   Ludaskia/`, forme SANS nom de fichier), la répartition des canonicals (la
   vitrine et le guide sur elles-mêmes, `app.html` sur la vitrine), le contenu du
   sitemap (deux URL, `app.html` exclue), les champs du `WebApplication` et
   l'inventaire des FAQ (8 questions sur la vitrine, 6 sur le guide — recomptées
   ici, cf. les tests du critère 6). La seule valeur lue dans le dépôt est la
   liste des NIVEAUX (critère 5), et c'est justement le but : le JSON-LD doit
   suivre le catalogue.

   ── Ce que ces tests ne couvrent pas ──────────────────────────────────────────
   • Critère 14 (aucune ressource tierce, aucun cookie au chargement) : c'est du
     réseau réel, donc une spec Playwright, pas de la logique pure.
   • Critères 7, 12, 13 (comptes Search Console / Bing, métadonnées du dépôt
     GitHub, résultat d'indexation à six semaines) : hors d'atteinte d'un test.
   • Critères 9 à 11 et 17-18 : ils portent sur l'AUTRE dépôt
     (`thibautdemare.github.com`), rien à lire ici.
   • Critère 15 (rien ne change à l'écran) : c'est la suite e2e existante qui le
     tient, en restant verte.

   ── Note de méthode ───────────────────────────────────────────────────────────
   Les règles sont écrites comme des fonctions qui RENDENT LA LISTE DES DÉFAUTS,
   et les tests de critère commencent par vérifier que la règle a du MORDANT : on
   lui soumet d'abord un balisage fautif (canonical relatif, canonical qui désigne
   une autre page, question de FAQ oubliée) et on exige qu'elle le refuse, AVANT
   de l'appliquer à la page réelle. Sans ça, un gate qui ne trouve rien serait
   indiscernable d'un gate qui ne cherche rien.
   ============================================================ */

/* URL de production, telles que l'issue les fixe. `URL_ACCUEIL` est la forme sans
   nom de fichier : c'est elle qui est présentée aux moteurs, jamais
   `…/index.html` (deux URL pour un même contenu — critère négatif 16). */
const ORIGINE = 'https://thibautdemare.github.io';
const URL_ACCUEIL = `${ORIGINE}/Ludaskia/`;
const URL_GUIDE = `${URL_ACCUEIL}guide.html`;
const URL_APP = `${URL_ACCUEIL}app.html`;

/* Les deux seules URL indexables. `app.html` n'en fait pas partie : elle est
   canonicalisée vers la vitrine, donc l'inscrire au sitemap serait se contredire
   (« indexe-la » d'un côté, « non, indexe l'autre » de l'autre). */
const URLS_INDEXABLES = [URL_ACCUEIL, URL_GUIDE];

const SITEMAP = 'public/sitemap.xml';

/* Page → URL canonique attendue. `app.html` pointe AILLEURS que sur elle-même :
   c'est le seul cas où la page servie et l'URL déclarée diffèrent, et c'est
   voulu. */
const CANONICAL_ATTENDU: Record<string, string> = {
	'index.html': URL_ACCUEIL,
	'guide.html': URL_GUIDE,
	'app.html': URL_ACCUEIL,
};

const PAGES = Object.keys(CANONICAL_ATTENDU);

/* ─── Lecture et normalisation ──────────────────────────────────────────────── */

const lire = (fichier: string): string => readFileSync(fichier, 'utf8');

const analyser = (source: string): Document => new DOMParser().parseFromString(source, 'text/html');

const documents = new Map<string, Document>();
function doc(fichier: string): Document {
	const connu = documents.get(fichier);
	if (connu) return connu;
	const frais = analyser(lire(fichier));
	documents.set(fichier, frais);
	return frais;
}

/* Comparaison de TEXTE affiché : les espaces insécables (`&nbsp;?` partout dans
   les FAQ), le repli des lignes imposé par Prettier et la forme de l'apostrophe
   ne sont pas des différences de contenu. Tout le reste — accents, casse,
   ponctuation — compte. */
function normaliser(texte: string): string {
	return texte
		.replace(/[\u00a0\u202f\u2009]/g, ' ')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

const texteDe = (el: Element | null): string => normaliser(el?.textContent ?? '');

function description(fichier: string): string {
	const meta = doc(fichier).querySelector('meta[name="description"]');
	return normaliser(meta?.getAttribute('content') ?? '');
}

/* ─── Critère 1 : URL canonique absolue ─────────────────────────────────────── */

/* Défauts d'un `<link rel="canonical">` au regard de l'URL attendue. Prend le
   SOURCE (et non un nom de fichier) pour qu'on puisse lui soumettre du balisage
   fautif fabriqué à la main. */
function defautsCanonical(source: string, attendue: string): string[] {
	const liens = Array.from(analyser(source).querySelectorAll('link[rel="canonical"]'));
	if (liens.length === 0) return ['aucun <link rel="canonical">'];
	const defauts: string[] = [];
	/* Deux canonicals concurrents ne se départagent pas : Google les ignore tous
	   les deux, donc c'est équivalent à n'en avoir aucun. */
	if (liens.length > 1) defauts.push(`${liens.length} <link rel="canonical"> concurrents`);
	for (const lien of liens) {
		const parent = (lien.parentElement?.tagName ?? '?').toLowerCase();
		if (parent !== 'head') defauts.push(`canonical hors du <head> (dans <${parent}>)`);
		const href = (lien.getAttribute('href') ?? '').trim();
		if (!/^https?:\/\//.test(href)) defauts.push(`href non absolu : « ${href} »`);
		else if (href !== attendue) defauts.push(`href « ${href} » au lieu de « ${attendue} »`);
	}
	return defauts;
}

const canonicalDe = (fichier: string): string =>
	(doc(fichier).querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '').trim();

/* Page FICTIVE, pour soumettre à la règle du balisage fautif fabriqué à la main.
   Le document complet (doctype + head + body) est nécessaire : sur un fragment
   nu, happy-dom ne remonte pas le `<link>` dans le `<head>` comme le fait un
   navigateur, et la règle « canonical hors du head » se déclencherait à tort. */
const pageAvec = (dansLeHead: string, dansLeCorps = ''): string =>
	`<!doctype html><html><head>${dansLeHead}</head><body>${dansLeCorps}</body></html>`;

const balise = (href: string): string => `<link rel="canonical" href="${href}" />`;

describe('critère 1 — chaque page porte son URL canonique absolue', () => {
	it('index.html se déclare canonique sur la forme SANS nom de fichier', () => {
		/* Mordant de la règle d'abord, sur du balisage fabriqué : ces formes sont
		   les manières plausibles de « poser un canonical » sans rien garder — un
		   chemin relatif (que le crawler résout contre l'URL courante, donc inutile
		   pour départager deux URL), l'URL d'une AUTRE page, la balise posée dans le
		   corps du document où elle est ignorée, et deux canonicals concurrents que
		   Google écarte tous les deux. */
		expect(defautsCanonical(pageAvec(balise('./')), URL_ACCUEIL)).not.toEqual([]);
		expect(defautsCanonical(pageAvec(balise('index.html')), URL_ACCUEIL)).not.toEqual([]);
		expect(defautsCanonical(pageAvec(balise(URL_GUIDE)), URL_ACCUEIL)).not.toEqual([]);
		expect(defautsCanonical(pageAvec('', balise(URL_ACCUEIL)), URL_ACCUEIL)).not.toEqual([]);
		expect(
			defautsCanonical(pageAvec(balise(URL_ACCUEIL) + balise(URL_GUIDE)), URL_ACCUEIL),
		).not.toEqual([]);
		/* …et elle accepte la forme juste, sinon elle refuserait tout. */
		expect(defautsCanonical(pageAvec(balise(URL_ACCUEIL)), URL_ACCUEIL)).toEqual([]);

		/* La page réelle, maintenant qu'on sait que la règle mord. */
		expect(defautsCanonical(lire('index.html'), URL_ACCUEIL)).toEqual([]);
		/* La forme `…/index.html` est la même page à une seconde URL : c'est
		   précisément ce que le canonical est là pour empêcher. */
		expect(canonicalDe('index.html')).not.toMatch(/index\.html$/);
	});

	it('guide.html se déclare canonique sur elle-même', () => {
		expect(defautsCanonical(lire('guide.html'), URL_GUIDE)).toEqual([]);
	});

	it('app.html se déclare canonique sur la vitrine, pas sur elle-même', () => {
		expect(defautsCanonical(lire('app.html'), CANONICAL_ATTENDU['app.html'])).toEqual([]);
		expect(canonicalDe('app.html')).not.toBe(URL_APP);
	});

	it("le canonical d'une page indexable coïncide avec son og:url", () => {
		/* Les `og:url` existent déjà et portent l'URL de production : un canonical
		   qui en diffère signale une faute de frappe dans l'un des deux. */
		for (const fichier of ['index.html', 'guide.html']) {
			const og = doc(fichier).querySelector('meta[property="og:url"]')?.getAttribute('content');
			expect(canonicalDe(fichier), `${fichier} : canonical vs og:url`).toBe(og);
		}
	});
});

/* ─── Critère 2 : app.html a sa propre meta description ─────────────────────── */

describe('critère 2 — app.html porte une meta description qui lui est propre', () => {
	it('la balise existe, en un seul exemplaire, et dit quelque chose', () => {
		expect(doc('app.html').querySelectorAll('meta[name="description"]')).toHaveLength(1);
		expect(description('app.html')).not.toBe('');
		/* Une description d'un mot satisferait « non vide » sans rien apporter au
		   résultat de recherche : on exige une vraie phrase. */
		expect(description('app.html').length).toBeGreaterThan(50);
	});

	it("n'est pas la description de la vitrine recopiée", () => {
		/* La garde d'abord : sans elle, ce test serait VERT aujourd'hui, où
		   app.html n'a aucune description — la chaîne vide diffère bien de celle de
		   la vitrine, et le critère serait « satisfait » par l'absence. */
		expect(description('app.html')).not.toBe('');
		/* Deux pages qui partagent leur description se cannibalisent dans les
		   résultats. La comparaison se fait après normalisation des espaces : un
		   copier-coller replié autrement reste un copier-coller. */
		expect(description('app.html')).not.toBe(description('index.html'));
	});
});

/* ─── Critère 3 : sitemap.xml ───────────────────────────────────────────────── */

type Xml = { racine: Element | null; erreur: string | null };

function analyserXml(source: string): Xml {
	const arbre = new DOMParser().parseFromString(source, 'application/xml');
	const faute = arbre.querySelector('parsererror');
	if (faute) return { racine: null, erreur: normaliser(faute.textContent ?? 'XML invalide') };
	return { racine: arbre.documentElement, erreur: null };
}

const locsDe = (racine: Element): string[] =>
	Array.from(racine.querySelectorAll('loc')).map((el) => (el.textContent ?? '').trim());

/* Fichier du dépôt servi à une URL de production donnée. Sert à vérifier qu'une
   URL listée existe vraiment : un sitemap qui annonce une page absente fait
   remonter des 404 dans Search Console. */
function fichierServi(url: string): string | null {
	if (!url.startsWith(URL_ACCUEIL)) return null;
	const reste = url.slice(URL_ACCUEIL.length);
	const candidat = reste === '' ? 'index.html' : reste;
	return existsSync(candidat) ? candidat : null;
}

describe('critère 3 — sitemap.xml liste exactement les URL indexables', () => {
	it('le fichier statique existe dans public/', () => {
		/* Dans `public/`, donc recopié tel quel à la racine du build : c'est ce qui
		   produit `dist/sitemap.xml`, l'URL que l'on soumet aux moteurs. */
		expect(existsSync(SITEMAP), `${SITEMAP} attendu`).toBe(true);
	});

	it('est du XML valide, en urlset sitemaps.org', () => {
		expect(existsSync(SITEMAP)).toBe(true);
		const { racine, erreur } = analyserXml(lire(SITEMAP));
		expect(erreur).toBeNull();
		expect(racine?.tagName.toLowerCase()).toBe('urlset');
		expect(racine?.namespaceURI ?? racine?.getAttribute('xmlns')).toBe(
			'http://www.sitemaps.org/schemas/sitemap/0.9',
		);
	});

	it('liste la vitrine et le guide, en URL absolues', () => {
		expect(existsSync(SITEMAP)).toBe(true);
		const { racine } = analyserXml(lire(SITEMAP));
		expect(racine).not.toBeNull();
		const locs = racine ? locsDe(racine) : [];
		expect([...locs].sort()).toEqual([...URLS_INDEXABLES].sort());
		/* Un `<url>` sans `<loc>`, ou la même `<loc>` deux fois, passerait la
		   comparaison ci-dessus si elle était faite sur un ensemble. */
		expect(locs).toHaveLength(URLS_INDEXABLES.length);
		expect(racine?.querySelectorAll('url')).toHaveLength(URLS_INDEXABLES.length);
	});

	it("n'inscrit pas app.html, qui est canonicalisée ailleurs", () => {
		expect(existsSync(SITEMAP)).toBe(true);
		const { racine } = analyserXml(lire(SITEMAP));
		const locs = racine ? locsDe(racine) : [];
		/* Sur les `<loc>` seulement : un commentaire XML qui EXPLIQUE pourquoi
		   app.html est absente est au contraire souhaitable. */
		expect(locs.filter((l) => l.includes('app.html'))).toEqual([]);
	});

	it('chaque URL listée correspond à une page qui existe et se déclare canonique', () => {
		expect(existsSync(SITEMAP)).toBe(true);
		const { racine } = analyserXml(lire(SITEMAP));
		const locs = racine ? locsDe(racine) : [];
		expect(locs).not.toEqual([]);
		for (const loc of locs) {
			const fichier = fichierServi(loc);
			expect(fichier, `${loc} ne correspond à aucun fichier du dépôt`).not.toBeNull();
			if (fichier) expect(canonicalDe(fichier), `canonical de ${fichier}`).toBe(loc);
		}
	});
});

/* ─── Critères 4 et 5 : JSON-LD WebApplication ──────────────────────────────── */

type Noeud = Record<string, unknown>;

const estObjet = (v: unknown): v is Noeud =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const blocsJsonLd = (fichier: string): string[] =>
	Array.from(doc(fichier).querySelectorAll('script[type="application/ld+json"]')).map(
		(el) => el.textContent ?? '',
	);

/* Aplatit un JSON-LD en liste de nœuds : accepte le bloc unique, le tableau de
   nœuds et la forme `@graph`, sans imposer laquelle est employée. */
function aplatir(valeur: unknown, sortie: Noeud[] = []): Noeud[] {
	if (Array.isArray(valeur)) {
		for (const v of valeur) aplatir(v, sortie);
	} else if (estObjet(valeur)) {
		sortie.push(valeur);
		aplatir(valeur['@graph'], sortie);
	}
	return sortie;
}

const typesDe = (n: Noeud): string[] => {
	const t = n['@type'];
	if (typeof t === 'string') return [t];
	if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
	return [];
};

/* Tous les nœuds JSON-LD d'une page, blocs invalides ignorés : leur validité
   syntaxique est éprouvée par un test dédié, qui doit rester le seul à en
   parler (sinon un bloc cassé ferait échouer huit tests avec huit messages qui
   ne désignent pas la cause). */
function noeudsJsonLd(fichier: string): Noeud[] {
	const noeuds: Noeud[] = [];
	for (const bloc of blocsJsonLd(fichier)) {
		try {
			aplatir(JSON.parse(bloc) as unknown, noeuds);
		} catch {
			/* signalé ailleurs */
		}
	}
	return noeuds;
}

const noeudDeType = (fichier: string, type: string): Noeud | undefined =>
	noeudsJsonLd(fichier).find((n) => typesDe(n).includes(type));

const chaine = (v: unknown): string => (typeof v === 'string' ? v : '');

/* Toutes les chaînes d'un nœud, en SAUTANT les sous-arbres de FAQ : les réponses
   de la FAQ citent les classes (« Le CE2 et le CM1 pour le moment »), et les
   compter rendrait le critère 5 vert pour la mauvaise raison. */
function chainesDe(valeur: unknown, sortie: string[] = []): string[] {
	if (typeof valeur === 'string') sortie.push(valeur);
	else if (Array.isArray(valeur)) for (const v of valeur) chainesDe(v, sortie);
	else if (estObjet(valeur)) {
		const horsSujet = typesDe(valeur).some((t) => ['FAQPage', 'Question', 'Answer'].includes(t));
		if (!horsSujet) for (const v of Object.values(valeur)) chainesDe(v, sortie);
	}
	return sortie;
}

describe('critères 4 et 5 — JSON-LD WebApplication sur la vitrine', () => {
	it('chaque bloc ld+json est du JSON syntaxiquement valide', () => {
		const blocs = blocsJsonLd('index.html');
		/* Sans cette garde, le test serait vert sur une page qui n'a AUCUN bloc. */
		expect(blocs.length).toBeGreaterThan(0);
		for (const bloc of blocs) expect(() => JSON.parse(bloc) as unknown).not.toThrow();
	});

	it('déclare un WebApplication de catégorie EducationalApplication', () => {
		const app = noeudDeType('index.html', 'WebApplication');
		expect(app, 'aucun nœud @type WebApplication').toBeDefined();
		expect(chaine(app?.['@context']).replace(/^http:/, 'https:')).toBe('https://schema.org');
		expect(app?.applicationCategory).toBe('EducationalApplication');
		expect(normaliser(chaine(app?.name))).not.toBe('');
		expect(app?.inLanguage).toBe('fr');
		expect(app?.isAccessibleForFree).toBe(true);
	});

	it('annonce la gratuité par une offre à 0 EUR', () => {
		const app = noeudDeType('index.html', 'WebApplication');
		const offre = estObjet(app?.offers) ? app.offers : undefined;
		expect(offre, 'offers absent ou mal formé').toBeDefined();
		expect(offre?.['@type']).toBe('Offer');
		/* `price` s'écrit indifféremment 0 ou "0" en JSON-LD : c'est la VALEUR qui
		   est le critère, pas son type. */
		expect(Number(offre?.price)).toBe(0);
		expect(offre?.priceCurrency).toBe('EUR');
	});

	it("renseigne l'éditeur", () => {
		const app = noeudDeType('index.html', 'WebApplication');
		const editeur = estObjet(app?.publisher) ? app.publisher : undefined;
		expect(editeur, 'publisher absent ou mal formé').toBeDefined();
		expect(typesDe(editeur ?? {}).some((t) => t === 'Person' || t === 'Organization')).toBe(true);
		expect(normaliser(chaine(editeur?.name))).not.toBe('');
	});

	it("pointe sur l'URL canonique de la vitrine", () => {
		const app = noeudDeType('index.html', 'WebApplication');
		expect(chaine(app?.url)).toBe(URL_ACCUEIL);
	});

	it('critère 5 — les classes annoncées sont celles que le catalogue contient', () => {
		/* Seule valeur lue dans le dépôt, et c'est le cœur du critère : ajouter un
		   niveau au catalogue sans toucher au JSON-LD doit faire tomber ce test.
		   `availableLevels(getAllLessons())` est la source de vérité de l'appli
		   elle-même (elle alimente le choix de classe au démarrage), donc le
		   JSON-LD promet exactement ce qui est jouable — ni un CM2 qui n'existe
		   pas, ni le silence sur un niveau ajouté. */
		const attendues = availableLevels(getAllLessons()).map((lv) => LEVEL_LABEL[lv]);
		expect(attendues.length).toBeGreaterThan(0);

		const app = noeudDeType('index.html', 'WebApplication');
		expect(app, 'aucun nœud @type WebApplication').toBeDefined();
		const annoncees = LEVEL_ORDER.map((lv) => LEVEL_LABEL[lv]).filter((label) =>
			chainesDe(app ?? {}).some((s) => new RegExp(`\\b${label}\\b`, 'i').test(s)),
		);
		expect(annoncees).toEqual(attendues);
	});

	it('critère 5 — la gratuité annoncée est celle que la page affiche', () => {
		const app = noeudDeType('index.html', 'WebApplication');
		expect(app?.isAccessibleForFree).toBe(true);
		expect(texteDe(doc('index.html').body)).toMatch(/gratuit/i);
	});
});

/* ─── Critère 6 : FAQPage fidèle aux questions de la page ───────────────────── */

/* Questions RÉELLEMENT affichées : le titre de chaque bloc de FAQ, dans l'ordre
   du document. */
const questionsHtml = (fichier: string): string[] =>
	Array.from(doc(fichier).querySelectorAll('.v-faq-item h3')).map((h) => texteDe(h));

function faq(fichier: string): { questions: string[]; reponses: string[] } {
	const page = noeudDeType(fichier, 'FAQPage');
	const entrees = aplatir(page?.mainEntity).filter((n) => typesDe(n).includes('Question'));
	return {
		questions: entrees.map((q) => normaliser(chaine(q.name))),
		reponses: entrees.map((q) =>
			normaliser(chaine(estObjet(q.acceptedAnswer) ? q.acceptedAnswer.text : '')),
		),
	};
}

/* Écart entre deux inventaires de questions, dans TROIS sens :
   • `manquantes` — affichée sur la page, absente du JSON-LD (le cas que le
     critère vise) ;
   • `surnumeraires` — déclarée mais plus affichée (interdit par Google : le
     balisage doit refléter le contenu visible) ;
   • `dupliquees` — déclarée PLUSIEURS FOIS. Sans ce troisième sens, la
     comparaison d'appartenance (`includes`) est aveugle au doublon : un
     inventaire `[Q1…Q8, Q1]` n'a ni manquante ni surnuméraire — chaque affichée
     est déclarée, chaque déclarée est affichée — et passerait, alors que le
     balisage annonce neuf questions pour huit blocs à l'écran. Le trou a été
     trouvé en relecture, pas par le gate : c'est le genre de cécité qu'une règle
     fondée sur l'appartenance a par construction, et il valait mieux la corriger
     DANS la règle que par une assertion de comptage posée à côté, qui aurait
     laissé la règle fausse pour le prochain appelant. */
function ecartQuestions(
	affichees: string[],
	declarees: string[],
): { manquantes: string[]; surnumeraires: string[]; dupliquees: string[] } {
	return {
		manquantes: affichees.filter((q) => !declarees.includes(q)),
		surnumeraires: declarees.filter((q) => !affichees.includes(q)),
		/* Une entrée par question fautive, pas une par répétition : c'est la
		   question qu'il faut nommer, pas le nombre de fois qu'elle revient. */
		dupliquees: [...new Set(declarees.filter((q, i) => declarees.indexOf(q) !== i))],
	};
}

const VIDE = { manquantes: [], surnumeraires: [], dupliquees: [] };

describe('critère 6 — les FAQ sont exposées en JSON-LD, sans écart', () => {
	it('la vitrine expose ses 8 questions, ni plus ni moins', () => {
		/* Mordant de la règle d'abord, dans les TROIS sens : une question ajoutée à
		   la page et oubliée dans le JSON-LD (le cas que le critère vise), une
		   question déclarée qui ne s'affiche plus, et une question déclarée deux
		   fois. */
		expect(ecartQuestions(['a', 'b'], ['a'])).toEqual({ ...VIDE, manquantes: ['b'] });
		expect(ecartQuestions(['a'], ['a', 'b'])).toEqual({ ...VIDE, surnumeraires: ['b'] });
		expect(ecartQuestions(['a', 'b'], ['a', 'b', 'a'])).toEqual({ ...VIDE, dupliquees: ['a'] });
		/* Trois occurrences ne font qu'une entrée de rapport, et le doublon reste vu
		   même quand il masque une manquante — le cas le plus fourbe : `[Q1, Q1]`
		   contre `[Q1, Q2]` a bien le bon COMPTE, et deux défauts. */
		expect(ecartQuestions(['a', 'b'], ['a', 'a', 'a', 'b'])).toEqual({
			...VIDE,
			dupliquees: ['a'],
		});
		expect(ecartQuestions(['a', 'b'], ['a', 'a'])).toEqual({
			manquantes: ['b'],
			surnumeraires: [],
			dupliquees: ['a'],
		});
		expect(ecartQuestions(['a'], ['a'])).toEqual(VIDE);

		const affichees = questionsHtml('index.html');
		/* Inventaire RECOMPTÉ le 28/08/2026 sur la section « Questions fréquentes »
		   d'index.html : 8 blocs `.v-faq-item`, ce qui confirme le chiffre de
		   l'issue. Le compte est asséné ici pour que le test ne se vide pas si la
		   section change de balisage (zéro question = zéro écart, donc vert à tort). */
		expect(affichees).toHaveLength(8);
		/* Deux blocs qui poseraient la MÊME question sont un défaut de la page, et
		   fausseraient aussi la comparaison ci-dessous. */
		expect(new Set(affichees).size).toBe(affichees.length);
		expect(affichees[0]).toBe('Faut-il créer un compte ?');

		const declarees = faq('index.html').questions;
		/* Écart nul ET même compte : à eux deux, ils forcent la bijection entre les
		   deux inventaires. `dupliquees` suffirait ici, mais le compte nomme
		   directement le défaut le plus probable — une entrée en trop. */
		expect(declarees).toHaveLength(affichees.length);
		expect(ecartQuestions(affichees, declarees)).toEqual(VIDE);
		/* Mordant sur l'inventaire RÉEL et non sur des lettres : si le JSON-LD de la
		   page redéclarait une de ses propres questions, le gate doit la nommer.
		   C'est exactement le balisage qui passait avant l'ajout de `dupliquees`. */
		expect(ecartQuestions(affichees, [...declarees, declarees[0]])).toEqual({
			...VIDE,
			dupliquees: [declarees[0]],
		});
	});

	it('le guide expose ses 6 questions, ni plus ni moins', () => {
		const affichees = questionsHtml('guide.html');
		expect(affichees).toHaveLength(6);
		expect(new Set(affichees).size).toBe(affichees.length);
		expect(affichees[0]).toBe('Combien de temps par jour ?');

		const declarees = faq('guide.html').questions;
		expect(declarees).toHaveLength(affichees.length);
		expect(ecartQuestions(affichees, declarees)).toEqual(VIDE);
	});

	it('chaque question déclarée porte une réponse, et seules les pages à FAQ en déclarent', () => {
		/* Le contenu des réponses n'est PAS comparé au texte visible : le JSON-LD
		   admet un fragment de HTML là où la page a plusieurs paragraphes et des
		   liens, donc une comparaison littérale produirait des échecs faux. C'est un
		   trou assumé de ce gate, qui reste à la relecture. */
		for (const fichier of ['index.html', 'guide.html']) {
			const { questions, reponses } = faq(fichier);
			expect(questions.length, `${fichier} : aucune question déclarée`).toBeGreaterThan(0);
			expect(reponses).toHaveLength(questions.length);
			for (const r of reponses) expect(r.length, `${fichier} : réponse vide`).toBeGreaterThan(20);
		}
		/* Borne du critère : app.html n'affiche aucune FAQ, donc y recopier le bloc
		   des deux autres pages serait du balisage sans contenu visible
		   correspondant — le motif exact que Google sanctionne. */
		expect(questionsHtml('app.html')).toEqual([]);
		expect(noeudDeType('app.html', 'FAQPage')).toBeUndefined();
	});
});

/* ─── Critère négatif 16 : une seule page d'accueil ─────────────────────────── */

describe("critère 16 — une seule URL est présentée comme page d'accueil", () => {
	it('les trois pages se replient sur les deux seules URL indexables', () => {
		const declares = PAGES.map((p) => canonicalDe(p));
		expect(declares.filter((c) => c === '')).toEqual([]);
		expect([...new Set(declares)].sort()).toEqual([...URLS_INDEXABLES].sort());
	});

	it("aucune page ne se déclare canonique en servant le contenu d'une autre", () => {
		/* Une page est « auto-canonique » quand elle désigne sa propre URL de
		   production. Il doit y en avoir exactement deux — la vitrine et le guide,
		   qui affichent des contenus différents — et app.html n'en fait pas partie :
		   sinon la même application serait offerte à l'index sous deux URL, ce que
		   le critère 16 interdit. */
		const autoCanoniques = PAGES.filter((p) => {
			const propre = p === 'index.html' ? URL_ACCUEIL : `${URL_ACCUEIL}${p}`;
			return canonicalDe(p) === propre;
		});
		expect(autoCanoniques.sort()).toEqual(['guide.html', 'index.html']);
	});

	it("le repli ne se fait pas au prix d'un noindex", () => {
		/* Exclure une page par `robots: noindex` serait une autre façon de n'avoir
		   qu'une accueil — mais elle RETIRE la page de l'index au lieu de la fondre
		   dans la vitrine, et sur app.html elle empêcherait aussi d'en suivre les
		   liens. Le critère 16 demande une consolidation, pas une amputation. */
		for (const p of PAGES) {
			const robots = doc(p).querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
			expect(robots.toLowerCase(), `${p} : meta robots`).not.toContain('noindex');
		}
		/* Et l'accueil reste l'URL sans nom de fichier partout où elle est citée. */
		expect(canonicalDe('index.html')).toBe(URL_ACCUEIL);
		expect(canonicalDe('app.html')).toBe(URL_ACCUEIL);
	});
});
