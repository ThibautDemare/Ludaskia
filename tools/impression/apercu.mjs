/*
 * Captures PAPIER d'une liste de leçons (#777, critère 25), pour qu'un relecteur juge ce
 * qu'imprime vraiment l'application sans avoir à imprimer.
 *
 *   node tools/impression/apercu.mjs <id-leçon> [<id-leçon>…] [--niveau ce2|cm1]
 *                                    [--sortie <dossier>] [--url <url-de-l-app>]
 *   (ou : npm run apercu:impression -- <id-leçon>…)
 *
 * Pour CHAQUE leçon, trois PNG pleine page, rendus en média `print` :
 *   <id>-<niveau>-fiche.png    la fiche d'entraînement, telle que l'imprime son bouton 🖨 ;
 *   <id>-<niveau>-bilan.png    le bilan imprimé (3 questions), feuille de l'enfant ;
 *   <id>-<niveau>-corrige.png  le corrigé de CE bilan : mêmes questions, réponses révélées
 *                              (un seul tirage, coupé en deux, pour que le relecteur puisse
 *                              comparer la feuille et son corrigé ligne à ligne).
 *
 * Le document vient du chemin réel de l'impression (`printScope` → `beforeprint` →
 * `buildPrintableDOM`, `ui/session.ts`), et non d'une copie : `window.print` est remplacé
 * par l'envoi de `beforeprint`, la boîte du navigateur étant inaccessible.
 *
 * Niveau : `--niveau` pour toutes les leçons (une leçon qui n'existe pas à ce niveau est une
 * erreur) ; sinon, le premier niveau déclaré par chaque leçon.
 *
 * Serveur : un serveur Vite à lui, démarré sur un port ISOLÉ (à partir de 4190 : jamais 4173
 * ni 4174, ceux de l'e2e, dont la réutilisation sert du code périmé d'un autre arbre), puis
 * arrêté. `--url` réutilise à la place un serveur déjà lancé (p. ex.
 * `http://localhost:4190/Ludaskia/`) — à toi de t'assurer qu'il sert le bon arbre.
 *
 * Sortie : un dossier temporaire du système par défaut, jamais le dépôt (un dossier de
 * sortie DANS le dépôt est refusé : ces PNG ne se commitent pas). La liste des fichiers
 * produits est affichée à la fin. Code de sortie non nul si un id est inconnu, si un
 * document ne produit rien, ou si la page lève une erreur.
 */
/* global process, console, URL, window, document, localStorage, Event */ // Node en CLI ; window, document, localStorage et Event vivent dans page.evaluate / addInitScript (navigateur)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
/* Premier port essayé : Vite monte au suivant s'il est pris, jamais en dessous. */
const PORT_ISOLE = 4190;
const NIVEAUX = ['ce2', 'cm1'];
/* Questions par leçon du bilan imprimé. */
const NB_QUESTIONS_BILAN = 3;
/* 182 mm à 96 ppp (cf. `main`). */
const LARGEUR_A4_IMPRIMABLE = Math.round((182 / 25.4) * 96);

const USAGE = `Usage : node tools/impression/apercu.mjs <id-leçon> [<id-leçon>…] [--niveau ce2|cm1] [--sortie <dossier>] [--url <url>]`;

function echouer(message) {
	console.error(`apercu : ${message}`);
	process.exit(1);
}

function lireArguments(argv) {
	const ids = [];
	let niveau = null;
	let sortie = null;
	let url = null;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const valeur = () => {
			const v = argv[++i];
			if (v === undefined || v.startsWith('--')) echouer(`${a} attend une valeur.\n${USAGE}`);
			return v;
		};
		if (a === '--niveau') niveau = valeur();
		else if (a === '--sortie') sortie = valeur();
		else if (a === '--url') url = valeur();
		else if (a === '--aide' || a === '-h' || a === '--help') {
			console.log(USAGE);
			process.exit(0);
		} else if (a.startsWith('--')) echouer(`option inconnue « ${a} ».\n${USAGE}`);
		else ids.push(a);
	}
	if (!ids.length) echouer(`aucun id de leçon.\n${USAGE}`);
	if (niveau !== null && !NIVEAUX.includes(niveau))
		echouer(`niveau « ${niveau} » inconnu (attendu : ${NIVEAUX.join(' ou ')}).`);
	return { ids: [...new Set(ids)], niveau, sortie, url };
}

/* Dossier de sortie demandé, vérifié AVANT de lancer quoi que ce soit : refusé s'il est
   dans le dépôt. `null` : un dossier temporaire, créé au moment d'écrire. */
function verifierSortie(sortie) {
	if (sortie === null) return null;
	const dossier = resolve(sortie);
	const rel = relative(REPO, dossier);
	if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)))
		echouer(`le dossier de sortie « ${dossier} » est dans le dépôt : choisis-en un hors du dépôt.`);
	return dossier;
}

function creerSortie(dossier) {
	if (dossier === null) return mkdtempSync(join(tmpdir(), 'ludaskia-apercu-'));
	mkdirSync(dossier, { recursive: true });
	return dossier;
}

/* Serveur Vite à nous, sur un port isolé. `url` : l'application (`…/Ludaskia/`). */
async function demarrerServeur() {
	const { createServer } = await import('vite');
	const serveur = await createServer({
		root: REPO,
		configFile: resolve(REPO, 'vite.config.ts'),
		logLevel: 'error',
		clearScreen: false,
		server: { host: '127.0.0.1', port: PORT_ISOLE, strictPort: false, open: false },
	});
	await serveur.listen();
	const url = serveur.resolvedUrls?.local[0];
	if (!url) {
		await serveur.close();
		echouer('le serveur Vite n’a pas donné son adresse.');
	}
	if (new URL(url).port === '4173') {
		await serveur.close();
		echouer('le serveur a pris le port 4173 (réservé à l’e2e) : abandon.');
	}
	return { url, fermer: () => serveur.close() };
}

/* Avant tout script de l'app : un profil déjà calé sur un niveau (sinon la popup de choix
   de classe bloque l'écran), les guides de 1re visite marqués vus, et `window.print`
   remplacé par l'envoi de `beforeprint`. */
function amorcer() {
	const CLE = 'ludaskia_profiles';
	if (!localStorage.getItem(CLE)) {
		const profils = {
			list: [{ uuid: 'apercu', name: 'Aperçu', emoji: '🖨', updatedAt: 1, niveauReference: 'ce2' }],
			active: 'apercu',
		};
		localStorage.setItem(CLE, JSON.stringify(profils));
		localStorage.setItem('apercu/ludaskia_tour_seen', 'true');
		localStorage.setItem('apercu/ludaskia_parents_seen', 'true');
	}
	window.print = () => window.dispatchEvent(new Event('beforeprint'));
}

/* Leçons demandées, résolues dans l'app : niveau retenu et titres, ou la raison du refus.
   Titres de l'app réelle : la fiche reçoit celui du bouton 🖨 de la leçon (non imprimé pour
   une leçon seule), le bilan celui du configurateur de sa catégorie (« Bilan — Grammaire »),
   qui s'imprime en tête de feuille. */
async function resoudreLecons(page, base, ids, niveau) {
	return page.evaluate(
		async ({ base, ids, niveau }) => {
			const { CATEGORIES, getLessonById } = await import(`${base}src/core/catalog.ts`);
			const { labelLecon } = await import(`${base}src/core/levels.ts`);
			return ids.map((id) => {
				const def = getLessonById(id);
				if (!def) return { id, erreur: 'leçon inconnue' };
				const n = niveau ?? def.levels[0];
				if (!def.levels.includes(n))
					return { id, erreur: `absente en ${n} (niveaux : ${def.levels.join(', ')})` };
				const categorie = CATEGORIES.find((c) => c.id === def.category)?.label;
				return {
					id,
					niveau: n,
					titreFiche: labelLecon(def, n),
					titreBilan: categorie ? `Bilan — ${categorie}` : 'Bilan personnalisé',
				};
			});
		},
		{ base, ids, niveau },
	);
}

/* Imprime `scope` par le chemin réel, en média `print`. Rend le nombre de pages produites. */
async function imprimer(page, base, scope) {
	await page.emulateMedia({ media: 'screen' });
	const pages = await page.evaluate(
		async ({ base, scope }) => {
			const { printScope } = await import(`${base}src/ui/session.ts`);
			printScope(scope);
			return document.querySelectorAll('#sheets .page').length;
		},
		{ base, scope },
	);
	await page.emulateMedia({ media: 'print' });
	await page.evaluate(() => document.fonts.ready);
	return pages;
}

/* Fin d'impression : l'app restaure l'écran et oublie le périmètre. */
async function finirImpression(page) {
	await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
	await page.emulateMedia({ media: 'screen' });
}

/* Ne laisse voir, dans `#sheets`, que la feuille de l'enfant (`'feuille'`) ou que le
   corrigé, depuis sa page de garde (`'corrige'`). Masquage `!important` : la feuille
   d'impression force l'affichage des éléments `.print-only` (page de garde du corrigé).
   Rend le nombre d'éléments laissés visibles. */
async function garderPartie(page, partie) {
	return page.evaluate((partie) => {
		const enfants = [...document.querySelectorAll('#sheets > *')];
		const debut = enfants.findIndex((el) => el.classList.contains('cover-corrige'));
		if (debut < 0) return 0;
		enfants.forEach((el, i) => {
			const visible = partie === 'corrige' ? i >= debut : i < debut;
			if (visible) el.style.removeProperty('display');
			else el.style.setProperty('display', 'none', 'important');
		});
		return partie === 'corrige' ? enfants.length - debut : debut;
	}, partie);
}

async function capturer(page, chemin) {
	await page.screenshot({ path: chemin, fullPage: true });
	return chemin;
}

/* Les trois documents d'une leçon. Rend les chemins produits ; signale ce qui manque. */
async function capturerLecon(page, base, l, dossier) {
	const nom = (doc) => join(dossier, `${l.id}-${l.niveau}-${doc}.png`);
	const manque = (doc) => console.error(`apercu : « ${l.id} » : ${doc} sans aucune page.`);
	const produits = [];
	// Fiche d'entraînement, seule (pas de page de garde pour une leçon unique).
	const fiche = await imprimer(page, base, {
		title: l.titreFiche,
		lessonIds: [l.id],
		kind: 'fiches',
		level: l.niveau,
	});
	if (fiche > 0) produits.push(await capturer(page, nom('fiche')));
	else manque('fiche');
	await finirImpression(page);
	// Bilan et son corrigé : UN tirage, la feuille puis le corrigé des mêmes questions.
	const bilan = await imprimer(page, base, {
		title: l.titreBilan,
		lessonIds: [l.id],
		kind: 'bilan',
		nbQ: NB_QUESTIONS_BILAN,
		corrige: true,
		level: l.niveau,
	});
	for (const [doc, partie] of [
		['bilan', 'feuille'],
		['corrige', 'corrige'],
	]) {
		if (bilan > 0 && (await garderPartie(page, partie)) > 0)
			produits.push(await capturer(page, nom(doc)));
		else manque(doc);
	}
	await finirImpression(page);
	return produits;
}

/* Rend le code de sortie : 0 si chaque leçon a ses trois PNG et que la page n'a rien levé. */
async function main() {
	const { ids, niveau, sortie, url } = lireArguments(process.argv.slice(2));
	const dossierDemande = verifierSortie(sortie);
	const serveur = url ? { url, fermer: async () => {} } : await demarrerServeur();
	const base = new URL(serveur.url).pathname.replace(/\/?$/, '/');
	const navigateur = await chromium.launch();
	const erreursPage = [];
	let code = 0;
	try {
		// Largeur = zone imprimable d'une A4 (210 mm − 2 × 14 mm, `@page` de print.scss) à
		// 96 ppp : les lignes se coupent comme sur le papier. Hauteur minimale : la capture
		// pleine page suit le document, sans blanc de fenêtre en dessous. La pagination, elle,
		// n'est pas simulée (un seul long ruban par document).
		const page = await navigateur.newPage({
			viewport: { width: LARGEUR_A4_IMPRIMABLE, height: 200 },
			deviceScaleFactor: 2,
		});
		page.on('pageerror', (e) => erreursPage.push(e.message));
		await page.addInitScript(amorcer);
		await page.goto(new URL('app.html#accueil', serveur.url).href, { waitUntil: 'networkidle' });
		await page.locator('#sheets').waitFor({ state: 'attached' });

		const lecons = await resoudreLecons(page, base, ids, niveau);
		const refusees = lecons.filter((l) => l.erreur);
		for (const l of refusees) console.error(`apercu : « ${l.id} » : ${l.erreur}.`);
		if (refusees.length) code = 1;
		else {
			const dossier = creerSortie(dossierDemande);
			const produits = [];
			for (const l of lecons) produits.push(...(await capturerLecon(page, base, l, dossier)));
			if (produits.length !== lecons.length * 3) code = 1;
			console.log(`Captures papier (${produits.length}) dans ${dossier} :`);
			for (const p of produits) console.log(`  ${p}`);
		}
	} finally {
		await navigateur.close(); // jamais de Chromium orphelin
		await serveur.fermer();
	}
	if (erreursPage.length) {
		console.error('apercu : erreurs levées par la page :');
		for (const e of erreursPage) console.error(`  ${e}`);
		code = 1;
	}
	return code;
}

main().then(
	(code) => process.exit(code),
	(e) => {
		console.error(`apercu : ${e instanceof Error ? e.message : String(e)}`);
		process.exit(1);
	},
);
