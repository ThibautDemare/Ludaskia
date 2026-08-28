/* ============================================================
   Critère négatif #631 (14) — SOBRIÉTÉ RÉSEAU DES TROIS PAGES.

   « Aucune des trois pages ne charge de ressource depuis un domaine tiers et
   n'écrit de cookie, vérifié sur un chargement réel (et pas seulement par
   lecture du source). » C'est la contrepartie non négociable de la
   déclaration Search Console / Bing Webmaster Tools (#631, critères 7-8) : la
   déclaration aux moteurs ne doit rien ajouter dans la page que voit l'enfant.

   GATE DE NON-RÉGRESSION, pas un test de fonctionnalité neuve : rien n'est
   encore implémenté sur cette branche (feat/seo-decouvrabilite), donc cette
   spec est VERTE dès aujourd'hui — c'est attendu. Elle doit le RESTER une
   fois le balisage des critères 1-13 posé, et rougir le jour où quelqu'un
   ajoute un tracker, une police Google Fonts, un CDN de script ou un pixel de
   vérification en JavaScript.

   Écoute le RÉSEAU RÉEL (`page.on('request')`), pas seulement le HTML servi :
   un pixel posé par du JS après coup, ou un `fetch` déclenché en cours de vie
   de la page, ne se verrait pas à la seule lecture du source. `data:` et
   `blob:` sont acceptées (ressources encodées inline ou générées côté client,
   pas un domaine tiers) ; tout autre hôte fait échouer le test.
   ============================================================ */
import { test, expect, type Page } from '@playwright/test';
import { watchErrors, gotoHash } from './helpers';

interface PageASurveiller {
	nom: string;
	ouvrir: (page: Page) => Promise<void>;
}

/* Les TROIS pages du build multi-page (#271, #562) : vitrine, guide, application. */
const PAGES: PageASurveiller[] = [
	{
		nom: 'vitrine (index.html)',
		ouvrir: (page) => page.goto('./', { waitUntil: 'networkidle' }),
	},
	{
		nom: 'guide (guide.html)',
		ouvrir: (page) => page.goto('./guide.html', { waitUntil: 'networkidle' }),
	},
	{
		nom: 'application (app.html)',
		ouvrir: (page) => gotoHash(page, 'accueil'),
	},
];

for (const { nom, ouvrir } of PAGES) {
	test(`${nom} — critère 14 : aucune requête, cookie ni <script> vers un domaine tiers`, async ({
		page,
	}) => {
		const errors = watchErrors(page);

		// Écoute AVANT la navigation : une requête tierce déclenchée dès le chargement
		// (préconnexion, police distante, script de mesure…) ne doit pas passer sous le
		// radar parce qu'on n'écoutait pas encore.
		const requetes: string[] = [];
		page.on('request', (req) => requetes.push(req.url()));

		await ouvrir(page);

		// Origine autorisée = celle de la page une fois chargée (serveur de dev local,
		// http://localhost:4173 sous /Ludaskia/ — cf. playwright.config.ts).
		const origine = new URL(page.url()).origin;

		const tierces = requetes.filter((url) => {
			let u: URL;
			try {
				u = new URL(url);
			} catch {
				return false; // URL non standard (ex. about:blank) : pas un domaine tiers.
			}
			if (u.protocol === 'data:' || u.protocol === 'blob:') return false;
			return u.origin !== origine;
		});
		expect(tierces, `Requêtes hors origine détectées :\n${tierces.join('\n')}`).toEqual([]);

		// Aucun cookie écrit — ni posé par le serveur, ni par du JS (document.cookie).
		const cookies = await page.context().cookies();
		expect(cookies, `Cookies détectés : ${JSON.stringify(cookies)}`).toEqual([]);

		// Lecture du SOURCE en complément de l'écoute réseau (le critère l'exige
		// explicitement, pas seulement le trafic observé) : aucune balise
		// <script src="…"> ne doit pointer vers un hôte externe.
		const scriptSrcs = await page
			.locator('script[src]')
			.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('src') || ''));
		const scriptsTiers = scriptSrcs.filter((src) => {
			if (!src) return false;
			let u: URL;
			try {
				u = new URL(src, origine);
			} catch {
				return false;
			}
			if (u.protocol === 'data:' || u.protocol === 'blob:') return false;
			return u.origin !== origine;
		});
		expect(scriptsTiers, `<script> vers un hôte tiers : ${scriptsTiers.join(', ')}`).toEqual([]);

		expect(errors).toEqual([]);
	});
}
