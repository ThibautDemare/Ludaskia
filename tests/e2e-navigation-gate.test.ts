import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/* ============================================================
   Gate de NAVIGATION des specs e2e (#511).

   Deux pièges de la même famille — « la page n'est pas dans l'état que la spec
   croit » — qui ne vivaient jusqu'ici que dans l'implémentation de `gotoHash`
   (e2e/helpers.ts) et dans des commentaires locaux. Aucun des deux ne fait
   échouer franchement : ils font échouer AU HASARD, ce qui coûte des relances de
   CI, jette le doute sur des PR saines, et finit par être ignoré. Pire, une spec
   ainsi cassée NE TESTE PAS CE QU'ELLE ANNONCE : elle prétend couvrir une
   variante de tirage et ne la rencontre jamais.

   ── Piège 1 : `page.goto` vers une URL identique ne recharge pas ──────────────
   Sous Chromium, un `page.goto` vers l'URL COURANTE (même hash) est un no-op
   silencieux : aucune navigation, aucun re-rendu. Une boucle « je recharge
   jusqu'à tomber sur le bon tirage » ne tire alors qu'UNE fois et revoit
   indéfiniment le premier écran. `gotoHash` porte le correctif (il détecte le cas
   et force un `.reload()`), donc toute spec qui passe par lui est saine par
   construction — mais rien n'empêchait la suivante d'écrire un `page.goto` brut.
   Le motif a été redécouvert TROIS fois indépendamment (`clic-verbe`,
   `intercaler-ce2`, `mesures-decimaux`) avant d'être écrit ici.

   ── Piège 2 : `networkidle` ne veut pas dire « dessiné » ──────────────────────
   Recharger pour de vrai ne sert à rien si l'on lit la page avant qu'elle ait
   rendu. La ligne de partage n'est PAS « y a-t-il un `waitFor` quelque part »,
   c'est LE TYPE DE LECTURE qui suit la navigation : `count()`, `innerText()` et
   `getAttribute()` sont des lectures one-shot, qui répondent « 0 / vide » sans
   retenter, là où `expect(locator).toHaveCount()` / `toBeVisible()` et
   `locator.waitFor()` retentent jusqu'au timeout. Sous charge parallèle, le
   one-shot tombe dans le trou entre `networkidle` et le rendu du SPA.

   ── Ce que ce gate NE fait PAS ────────────────────────────────────────────────
   Il ne convertit rien. Les 91 `page.goto` déjà en place sont listés plus bas
   avec leur raison, et la liste DÉCROÎT PR par PR (un test échoue sur une
   exemption devenue inutile). Convertir 34 specs d'un coup rendrait
   indiscernable tout flake introduit au passage — décision de cadrage du
   22/08/2026.

   Il ne prouve pas non plus qu'une lecture retentante attende LA BONNE chose :
   `expect(page.locator('body')).toBeVisible()` satisferait la règle sans rien
   garantir. On garde ici la FORME, qui est ce qui se re-oublie ; la pertinence de
   l'attente reste affaire de relecture.

   Enfin, l'analyse est TEXTUELLE (pas d'AST) : elle retire les commentaires et
   apparie les délimiteurs, ce qui suffit sur le style maison mais se laisserait
   contourner par une indirection (une fonction locale qui appelle `page.goto`).
   Le dernier test ferme la porte la plus large : `helpers.ts` reste le SEUL
   fichier non-spec de `e2e/` autorisé à naviguer vers `app.html`.
   ============================================================ */

/* ---------- Lecture des sources ---------- */

/** Retire commentaires de ligne et de bloc en préservant les NUMÉROS DE LIGNE
 *  (chaque caractère retiré devient une espace, chaque `\n` est conservé).
 *  Conscient des chaînes : `'https://…'` ne doit pas être pris pour un commentaire —
 *  ce fichier scanne justement des specs pleines d'URL. */
function decommente(src: string): string {
	let out = '';
	let i = 0;
	type Etat = 'code' | 'ligne' | 'bloc' | 'chaine';
	let etat: Etat = 'code';
	let delimiteur = '';
	while (i < src.length) {
		const c = src[i];
		const d = src[i + 1];
		if (etat === 'code') {
			if (c === '/' && d === '/') {
				etat = 'ligne';
				out += '  ';
				i += 2;
				continue;
			}
			if (c === '/' && d === '*') {
				etat = 'bloc';
				out += '  ';
				i += 2;
				continue;
			}
			if (c === "'" || c === '"' || c === '`') {
				etat = 'chaine';
				delimiteur = c;
			}
			out += c;
			i++;
			continue;
		}
		if (etat === 'chaine') {
			out += c;
			if (c === '\\') {
				out += d ?? '';
				i += 2;
				continue;
			}
			if (c === delimiteur) etat = 'code';
			i++;
			continue;
		}
		if (etat === 'ligne') {
			if (c === '\n') {
				etat = 'code';
				out += '\n';
			} else out += ' ';
			i++;
			continue;
		}
		if (c === '*' && d === '/') {
			etat = 'code';
			out += '  ';
			i += 2;
			continue;
		}
		out += c === '\n' ? '\n' : ' ';
		i++;
	}
	return out;
}

/** Index du délimiteur fermant apparié à celui ouvert en `debut`, ou -1. */
function fin(src: string, debut: number, ouvrant: string, fermant: string): number {
	let profondeur = 0;
	for (let i = debut; i < src.length; i++) {
		if (src[i] === ouvrant) profondeur++;
		else if (src[i] === fermant) {
			profondeur--;
			if (!profondeur) return i;
		}
	}
	return -1;
}

const ligneDe = (src: string, i: number) => src.slice(0, i).split('\n').length;

const FICHIERS = readdirSync('e2e').filter((f) => f.endsWith('.ts'));
const SPECS = FICHIERS.filter((f) => f.endsWith('.spec.ts'));
const SOURCE = new Map(FICHIERS.map((f) => [f, decommente(readFileSync(`e2e/${f}`, 'utf8'))]));

/* ============================================================
   Piège 1 — `page.goto` brut vers app.html
   ============================================================ */

/** Le fichier mentionne-t-il `app.html` AILLEURS que derrière `PROD_URL` ?
 *  Sert à trancher les `page.goto(url)` dont l'argument est une variable :
 *  `pwa-manifest.spec.ts` ne construit ses URL qu'à partir de `PROD_URL` (serveur
 *  de production, hors périmètre), là où `partage-og.spec.ts` porte un
 *  `path: 'app.html'` en clair et vise donc bien l'application. */
function mentionneAppHtmlHorsProd(src: string): boolean {
	for (const m of src.matchAll(/app\.html/g))
		if (!/PROD_URL/.test(src.slice(Math.max(0, m.index - 30), m.index))) return true;
	return false;
}

/** Appels `page.goto(…)` qui visent `app.html` servi par le serveur de dev.
 *  Hors périmètre : `./`, `./guide.html` (autres pages) et tout ce qui passe par
 *  `PROD_URL` (`offline.spec.ts`, `pwa-manifest.spec.ts` — production réelle, où
 *  `gotoHash` n'aurait aucun sens puisqu'il vise le serveur de dev). */
function navigationsAppHtml(src: string): number[] {
	const horsProd = mentionneAppHtmlHorsProd(src);
	const lignes: number[] = [];
	for (const m of src.matchAll(/page\.goto\(/g)) {
		const ouvrante = m.index + m[0].length - 1;
		const fermante = fin(src, ouvrante, '(', ')');
		if (fermante < 0) continue;
		const argument = src.slice(ouvrante + 1, fermante);
		// URL portée par une variable (`page.goto(url)`) : on tranche au niveau du fichier.
		const litteral = /^\s*['"`]/.test(argument);
		const vise = litteral ? /app\.html/.test(argument) && !/PROD_URL/.test(argument) : horsProd;
		if (vise) lignes.push(ligneDe(src, m.index));
	}
	return lignes;
}

/* Navigations à froid DÉLIBÉRÉES : `gotoHash` injecte `ENSURE_NIVEAU`
   (helpers.ts), qui crée un profil CE2 et marque les onboardings comme vus. Ces
   specs testent précisément ce que cet amorçage effacerait — les convertir ne
   serait pas une amélioration, ce serait supprimer le test. Ces entrées-là ne
   sont donc PAS de la dette : elles ont vocation à rester. */
const NAVIGATION_A_FROID_DELIBEREE: Record<string, string> = {
	'niveau.spec.ts':
		"popup de choix de classe (#225) : elle ne s'affiche QUE pour un profil sans niveau. `ENSURE_NIVEAU` pose `niveauReference: 'ce2'` — la popup testée ne s'ouvrirait jamais (la spec pose son propre SEED_SANS_NIVEAU).",
	'tour.spec.ts':
		"guide de 1re visite (#330) : `ENSURE_NIVEAU` marque `ludaskia_tour_seen` et `ludaskia_parents_seen`, donc l'enchaînement testé ne se déclencherait plus. Cas documenté en commentaire dans helpers.ts, au-dessus de gotoHash.",
	'modales-statiques.spec.ts':
		"mêmes drapeaux d'onboarding : la spec vérifie l'apparition puis la fermeture des modales que `ENSURE_NIVEAU` supprimerait.",
	'partage-og.spec.ts':
		'balises Open Graph : charge `app.html` SANS hash pour lire les `<meta>` de la page servie. `gotoHash` exige un hash et amorce du localStorage inutile ici — la spec ne rend aucun écran.',
};

/* Dette de conversion (décision de cadrage du 22/08/2026) : ces specs
   fonctionnent, mais écrivent leur navigation à la main au lieu de passer par
   `gotoHash`. Elles n'ont PAS de boucle de relance aujourd'hui — sinon elles
   seraient fautives, pas exemptées — donc rien ne casse ; c'est le prochain
   `for` ajouté au-dessus d'un de ces `goto` qui coûterait cher.

   ⚠ CETTE LISTE DOIT DÉCROÎTRE. On en retire une entrée à chaque PR qui passe la
   spec à `gotoHash` ; le test « aucune exemption périmée » plus bas échoue si on
   oublie de le faire. Ne JAMAIS y ajouter une spec neuve : le gate est là pour
   mordre immédiatement sur celles-là. */
const CONVERSION_A_FAIRE: Record<string, string> = {
	'accords-cm1.spec.ts': 'helper `goto` local, antérieur au gate.',
	'angles-cm1.spec.ts': 'navigation en clair, antérieure au gate.',
	'calcul-mental-cm1.spec.ts': 'helper `goto` local, antérieur au gate.',
	'clic-mot-natures.spec.ts': 'helper local (la boucle de relance, elle, passe par `gotoHash`).',
	'clic-verbe.spec.ts': 'helper `gotoCM1` local, antérieur au gate.',
	'conjugaison-cm1.spec.ts': 'helper `goto` local, antérieur au gate.',
	'decimaux-ecritures.spec.ts': 'navigations en clair, antérieures au gate.',
	'decimaux.spec.ts': 'navigations en clair, antérieures au gate.',
	'divisibilite-ordre-grandeur.spec.ts': 'navigations en clair, antérieures au gate.',
	'division-euclidienne.spec.ts': 'navigations en clair, antérieures au gate.',
	'donnees.spec.ts': 'helper `goto` local, antérieur au gate.',
	'droite-graduee.spec.ts': 'helper `goto` local, antérieur au gate.',
	'duree-ecoulee.spec.ts': 'navigations en clair, antérieures au gate.',
	'encadrant-revoir-signal.spec.ts': 'navigations en clair, antérieures au gate.',
	'encadrant.spec.ts': 'navigations en clair (14), antérieures au gate.',
	'etayage-redige.spec.ts': 'helper `goto` local, antérieur au gate.',
	'fractions-nombres.spec.ts': 'navigations en clair, antérieures au gate.',
	'geo-cm1-figures-proprietes.spec.ts': 'navigations en clair, antérieures au gate.',
	'geometrie-cm1.spec.ts': 'helper `goto` local, antérieur au gate.',
	'grammaire-cm1.spec.ts': 'helper `goto` local, antérieur au gate.',
	'grands-nombres.spec.ts': 'navigations en clair, antérieures au gate.',
	'homonymes.spec.ts': 'helper `goto` local, antérieur au gate.',
	'mes-aire-perimetre.spec.ts': 'navigation en clair, antérieure au gate.',
	'mesures-decimaux.spec.ts':
		'navigations en clair, antérieures au gate (la boucle de relance est saine : `.reload()` + attente du rendu).',
	'ortho-cm1.spec.ts': 'helper `goto` local, antérieur au gate.',
	'problemes-cm1.spec.ts': 'helper `goto` local, antérieur au gate.',
	'programme-a-revoir.spec.ts': 'navigation en clair, antérieure au gate.',
	'programme-attribution.spec.ts': 'navigations en clair, antérieures au gate.',
	'reprise-runners.spec.ts':
		'rechargement COMPLET entre deux étapes, écrit en clair avant le gate. `gotoHash` en fait autant dès que le hash change — conversion à vérifier au cas par cas.',
	'vocabulaire-cm1.spec.ts': 'helper `goto` local, antérieur au gate.',
};

const EXEMPTIONS = { ...NAVIGATION_A_FROID_DELIBEREE, ...CONVERSION_A_FAIRE };

const NAVIGATIONS = new Map(SPECS.map((f) => [f, navigationsAppHtml(SOURCE.get(f)!)]));

describe('Navigation des specs e2e : `gotoHash` plutôt que `page.goto` (#511)', () => {
	it('lit bien les specs (garde contre un gate à vide)', () => {
		// Un `page.goto` renommé, un dossier déplacé, et tous les tests ci-dessous
		// passeraient en n'examinant plus rien.
		expect(SPECS.length, 'aucune spec lue dans e2e/').toBeGreaterThanOrEqual(100);
		const total = [...NAVIGATIONS.values()].reduce((a, l) => a + l.length, 0);
		expect(
			total,
			'plus aucune navigation brute détectée : soit la conversion est finie (et il ' +
				'faut vider les listes ci-dessus), soit la détection ne détecte plus rien.',
		).toBeGreaterThan(0);
	});

	it.each(SPECS.map((f) => ({ f })))('$f ne navigue pas en brut vers app.html', ({ f }) => {
		const lignes = NAVIGATIONS.get(f)!;
		if (!lignes.length || f in EXEMPTIONS) return;
		expect.fail(
			`${f} appelle page.goto vers app.html (ligne${lignes.length > 1 ? 's' : ''} ` +
				`${lignes.join(', ')}) sans figurer dans la liste d'exemptions.\n` +
				`Utiliser \`gotoHash(page, 'hash')\` (e2e/helpers.ts) : lui seul détecte la navigation vers ` +
				`le hash COURANT et force un vrai rechargement — un \`page.goto\` vers l'URL déjà ` +
				`affichée est un no-op silencieux sous Chromium, et une boucle de relance écrite ` +
				`dessus ne relance rien.\n` +
				`Si la navigation à froid est DÉLIBÉRÉE (l'amorçage ENSURE_NIVEAU effacerait ce que ` +
				`la spec teste), ajouter une entrée à NAVIGATION_A_FROID_DELIBEREE avec sa raison.`,
		);
	});

	it.each(Object.entries(EXEMPTIONS).map(([f, raison]) => ({ f, raison })))(
		'$f : son exemption est encore justifiée',
		({ f }) => {
			// Une exemption périmée est pire que pas d'exemption : elle décrit un état
			// révolu et couvrira en silence la prochaine navigation brute ajoutée là.
			expect(
				SPECS,
				`${f} est exempté mais n'existe plus dans e2e/ : retirer son entrée.`,
			).toContain(f);
			expect(
				NAVIGATIONS.get(f)!.length,
				`${f} n'appelle plus page.goto vers app.html : retirer son entrée de la liste ` +
					`d'exemptions. C'est ce retrait qui fait DÉCROÎTRE la liste au lieu de la laisser ` +
					`pourrir — et sans lui, la prochaine navigation brute ajoutée ici passerait inaperçue.`,
			).toBeGreaterThan(0);
		},
	);

	it('chaque exemption porte une raison écrite', () => {
		for (const [f, raison] of Object.entries(EXEMPTIONS))
			expect(
				raison.trim().length,
				`${f} est exempté sans raison écrite. Une liste d'exemptions sans motif ne se ` +
					`relit pas : on ne sait plus laquelle est une dette et laquelle est un choix.`,
			).toBeGreaterThan(20);
	});

	it('aucune spec n’est exemptée deux fois', () => {
		// Une même spec dans les deux listes rendrait sa nature (choix ou dette)
		// indécidable, et la liste de dette ne décroîtrait jamais vraiment.
		for (const f of Object.keys(NAVIGATION_A_FROID_DELIBEREE))
			expect(
				f in CONVERSION_A_FAIRE,
				`${f} est à la fois « navigation à froid délibérée » et « conversion à faire ».`,
			).toBe(false);
	});

	it('helpers.ts reste le seul fichier non-spec de e2e/ à naviguer vers app.html', () => {
		// Sans ça, la règle se contourne en trois lignes : un helper maison dans un
		// fichier qui n'est pas une `.spec.ts`, et plus rien n'est scanné.
		for (const f of FICHIERS) {
			if (f.endsWith('.spec.ts') || f === 'helpers.ts') continue;
			expect(
				navigationsAppHtml(SOURCE.get(f)!).length,
				`e2e/${f} navigue vers app.html sans être une spec : ce chemin échappe au gate.\n` +
					`La navigation partagée vit dans helpers.ts (gotoHash), qui porte le correctif ` +
					`du rechargement.`,
			).toBe(0);
		}
		expect(
			navigationsAppHtml(SOURCE.get('helpers.ts')!).length,
			'helpers.ts ne navigue plus vers app.html : gotoHash a changé de forme, et le gate ' +
				'ne protège peut-être plus rien.',
		).toBe(1);
	});
});

/* ============================================================
   Piège 2 — lecture one-shot juste après une navigation, dans une boucle
   ============================================================ */

/** Lectures qui NE retentent PAS : elles répondent « 0 » / « vide » / `null` à
 *  l'instant où on les appelle. Liste volontairement courte et nommée par
 *  l'issue : élargir (`allTextContents`, `textContent`…) demanderait de revérifier
 *  que les boucles saines restent vertes. */
const LECTURE_ONE_SHOT = /\.\s*(count|innerText|getAttribute)\s*\(/g;
/** Navigations : après l'une d'elles, la page peut ne pas être encore dessinée. */
const NAVIGATION = /page\.goto\(|gotoHash\(|page\.reload\(/g;

/** Index des lectures RETENTANTES : `locator.waitFor(` et les `expect(…)` suivis
 *  d'un matcher de locator (`.toBeVisible()`, `.toHaveCount()`…). Un
 *  `expect(valeurDéjàLue).toBe(…)` n'en est pas un : il n'interroge plus la page. */
function lecturesRetentantes(corps: string): number[] {
	const index: number[] = [];
	for (const m of corps.matchAll(/\bwaitFor\s*\(/g)) index.push(m.index);
	for (const m of corps.matchAll(/\bexpect\s*\(/g)) {
		const fermante = fin(corps, m.index + m[0].length - 1, '(', ')');
		if (fermante < 0) continue;
		if (/^\s*\.\s*(not\s*\.\s*)?to[A-Z]/.test(corps.slice(fermante + 1))) index.push(m.index);
	}
	return index.sort((a, b) => a - b);
}

type Boucle = { fichier: string; ligne: number; tete: string; corps: string };

/** Boucles `for` / `while` qui NAVIGUENT à chaque tour et dont la sortie dépend de
 *  ce qu'elles lisent dans la page — les « boucles de relance ». Une boucle qui
 *  se contente de DÉCLARER des tests (`for (const id of IDS) { test(…) })`) n'en
 *  est pas une : sa navigation a lieu dans le rappel de `test`, une fois par test,
 *  pas une fois par tour. */
function bouclesDeRelance(fichier: string, src: string): Boucle[] {
	const boucles: Boucle[] = [];
	for (const m of src.matchAll(/\b(for|while)\s*\(/g)) {
		const oParen = m.index + m[0].length - 1;
		const cParen = fin(src, oParen, '(', ')');
		if (cParen < 0) continue;
		const tete = src.slice(oParen, cParen + 1);
		const reste = src.slice(cParen + 1);
		const oBrace = reste.indexOf('{');
		if (oBrace < 0 || reste.slice(0, oBrace).trim() !== '') continue; // corps sur une ligne
		const debut = cParen + 1 + oBrace;
		const cBrace = fin(src, debut, '{', '}');
		if (cBrace < 0) continue;
		const corps = src.slice(debut, cBrace + 1);

		NAVIGATION.lastIndex = 0;
		const nav = NAVIGATION.exec(corps);
		if (!nav) continue;
		// Boucle qui déclare des tests : la navigation est dans le rappel de `test`.
		if (/\btest(\.\w+)?\s*\(/.test(corps.slice(0, nav.index))) continue;

		LECTURE_ONE_SHOT.lastIndex = 0;
		if (!LECTURE_ONE_SHOT.test(corps)) continue;

		// Sortie dépendante de la page : soit une échappée (`break`/`continue`/
		// `return`), soit un drapeau de la condition d'en-tête affecté dans le corps
		// (`for (let i = 0; i < 6 && !trouve; i++) { … trouve = …count() > 0 }`).
		const echappee = /\b(break|continue|return)\b/.test(corps);
		const condition = tete.includes(';') ? (tete.split(';')[1] ?? '') : tete;
		const drapeau = [...condition.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].some((v) =>
			new RegExp(`\\b${v[1]}\\s*=[^=]`).test(corps),
		);
		if (!echappee && !drapeau) continue;

		boucles.push({ fichier, ligne: ligneDe(src, m.index), tete: tete.replace(/\s+/g, ' '), corps });
	}
	return boucles;
}

const BOUCLES = SPECS.flatMap((f) => bouclesDeRelance(f, SOURCE.get(f)!));

describe('Boucles de relance : lire la page une fois ne suffit pas (#511)', () => {
	it('trouve bien des boucles de relance (garde contre un gate à vide)', () => {
		expect(
			BOUCLES.length,
			'aucune boucle de relance détectée dans e2e/ : la détection a cessé de détecter ' +
				'(forme des boucles changée, ou navigation renommée).',
		).toBeGreaterThanOrEqual(5);
	});

	it.each(BOUCLES.map((b) => ({ ...b, cle: `${b.fichier}:${b.ligne}` })))(
		'$cle attend le rendu avant de lire la page',
		(b) => {
			LECTURE_ONE_SHOT.lastIndex = 0;
			const oneShot = LECTURE_ONE_SHOT.exec(b.corps);
			if (!oneShot) return;

			// Dernière navigation AVANT cette lecture : c'est elle qui remet la page à zéro.
			NAVIGATION.lastIndex = 0;
			let derniereNav = -1;
			for (const n of b.corps.matchAll(NAVIGATION)) {
				if (n.index > oneShot.index) break;
				derniereNav = n.index;
			}
			if (derniereNav < 0) return; // la lecture précède toute navigation du tour

			const protege = lecturesRetentantes(b.corps).some(
				(i) => i > derniereNav && i < oneShot.index,
			);
			expect(
				protege,
				`${b.fichier}:${b.ligne} — ${b.tete}\n` +
					`Cette boucle navigue puis lit la page avec « ${oneShot[0].trim()} », une lecture ` +
					`ONE-SHOT : elle répond « 0 » / « vide » sans retenter.\n` +
					`« networkidle » ne veut PAS dire « dessiné » : sous charge parallèle, le rendu du ` +
					`SPA arrive après, la lecture tombe dans le trou, et la boucle relance pour rien — ` +
					`jusqu'à épuiser ses tentatives sur un écran qui allait s'afficher.\n` +
					`Intercaler une lecture RETENTANTE entre la navigation et la lecture, par exemple ` +
					`\`await page.locator('.ans').first().waitFor({ state: 'visible' })\` ou ` +
					`\`await expect(page.locator('#idStable')).toBeVisible()\`.`,
			).toBe(true);
		},
	);
});
