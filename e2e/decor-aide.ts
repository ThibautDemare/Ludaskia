/* ============================================================
   Aides partagées des specs du décor (#785) : `decor-figer`, `decor-noel-flocons`,
   `decor-noel-trophees`, `decor-guide`. N'est PAS une spec (pas de suffixe `.spec.ts`).

   HORLOGE (critère 33 : même résultat le 30 novembre et le 15 décembre).
   Méthode retenue : `page.clock.setFixedTime(date)` AVANT la navigation. Il fige
   `Date.now()` / `new Date()` mais LAISSE TOURNER les timers (`setTimeout`, `setInterval`,
   `requestAnimationFrame`) et les animations CSS, qui ne dépendent pas de `Date`. À ne pas
   confondre avec `clock.install()` + `fastForward`, qui remplace les timers : le décor
   resterait alors immobile ou jouerait à vitesse truquée.
   Les dates sont posées avec leur décalage Paris EXPLICITE et chaque spec fixe
   `timezoneId: 'Europe/Paris'` : « 15 décembre 10 h » reste le 15 décembre quel que soit le
   fuseau de la machine (CI en UTC, poste en heure de Paris), sans dépendre de
   `new Date(2026, 11, 15)` évalué côté Node.
   ============================================================ */
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { gotoHash } from './helpers';

export const FUSEAU = 'Europe/Paris';

export const DATES = {
	/** Mi-décembre : le décor de Noël est là. */
	noel: '2026-12-15T10:00:00+01:00',
	/** Bords de période (heure locale de Paris). */
	veilleDecembre: '2026-11-30T12:00:00+01:00',
	veilleDecembreTard: '2026-11-30T23:59:00+01:00',
	premierDecembre: '2026-12-01T00:01:00+01:00',
	finDecembre: '2026-12-31T23:59:00+01:00',
	premierJanvier: '2027-01-01T00:01:00+01:00',
	/** Plein été : hors période. */
	ete: '2026-07-14T10:00:00+02:00',
} as const;

/* Libellés du bouton : INTENTIONNELS (c'est le libellé, visible ET nom accessible, qui porte
   l'état — critère 2). Ils ne se relâchent donc pas en regex souple. */
export const ARRETER = 'Arrêter le décor';
export const RELANCER = 'Relancer le décor';

export async function fixerDate(page: Page, iso: string): Promise<void> {
	await page.clock.setFixedTime(new Date(iso));
}

/* Accueil de l'appli (la forêt SVG est injectée en asynchrone : on l'attend). */
export async function ouvrirAccueil(page: Page, iso: string): Promise<void> {
	await fixerDate(page, iso);
	await gotoHash(page, 'accueil');
	await expect(page.locator('#home')).toBeVisible();
	await expect(page.locator('#homeForet .sway').first()).toBeAttached();
}

/* Vitrine et guide : pages statiques, `page.goto` autorisé (le gate ne vise que `app.html`). */
export async function ouvrirVitrine(page: Page, iso: string): Promise<void> {
	await fixerDate(page, iso);
	await page.goto('./', { waitUntil: 'networkidle' });
	await expect(page.locator('.v-footer')).toBeVisible();
}

export async function ouvrirGuide(page: Page, iso: string): Promise<void> {
	await fixerDate(page, iso);
	await page.goto('./guide.html', { waitUntil: 'networkidle' });
	await expect(page.locator('.v-footer')).toBeVisible();
}

/* Le bouton annonce l'état : libellé visible ET nom accessible, dans le même sens. */
export async function attendreEtat(page: Page, etat: 'bouge' | 'fige'): Promise<void> {
	const [attendu, contraire] = etat === 'bouge' ? [ARRETER, RELANCER] : [RELANCER, ARRETER];
	const bouton = page.locator('#footerDecor');
	await expect(bouton).toBeVisible();
	await expect(bouton).toContainText(attendu);
	await expect(page.getByRole('button', { name: attendu })).toHaveId('footerDecor');
	await expect(page.getByRole('button', { name: contraire })).toHaveCount(0);
}

/* Un appui sur le bouton. On exige d'abord qu'il soit là : sans cela, un bouton absent se
   traduirait par un `click()` qui attend la fin du test (message de timeout, pas de cause). */
export async function basculerDecor(page: Page): Promise<void> {
	const bouton = page.locator('#footerDecor');
	await expect(bouton, 'le bouton #footerDecor est présent et visible').toBeVisible();
	await bouton.click();
}

/* ---------- Mesure des flocons ---------- */

export interface Flocon {
	/** Opacité EFFECTIVE (produit des opacités de la chaîne d'ancêtres). */
	opacite: number;
	gauche: number;
	haut: number;
	droite: number;
	bas: number;
	/** Visible = opacité effective > 0,05 ET dessin (glyphe) dans la vue. */
	visible: boolean;
	/** Plan de profondeur, lu sur la classe `decor-flocon--<plan>`. */
	plan: 'loin' | 'milieu' | 'devant' | 'premier-plan' | null;
}

/* Lit chaque `.decor-flocon` : l'opacité et la chute sont portées par le flocon, le dessin
   (le rectangle qui compte) est son enfant `.decor-flocon-glyphe`. */
export async function mesurerFlocons(page: Page): Promise<Flocon[]> {
	return page.evaluate(() => {
		const L = window.innerWidth;
		const H = window.innerHeight;
		return [...document.querySelectorAll<HTMLElement>('.decor-saison .decor-flocon')].map((f) => {
			const g = f.querySelector<HTMLElement>('.decor-flocon-glyphe') ?? f;
			let opacite = 1;
			for (let e: Element | null = g; e; e = e.parentElement) {
				opacite *= parseFloat(getComputedStyle(e).opacity);
			}
			const r = g.getBoundingClientRect();
			const dansLaVue =
				r.width > 0 && r.height > 0 && r.right > 0 && r.left < L && r.bottom > 0 && r.top < H;
			return {
				opacite,
				gauche: r.left,
				haut: r.top,
				droite: r.right,
				bas: r.bottom,
				visible: opacite > 0.05 && dansLaVue && g.checkVisibility(),
				plan:
					(['loin', 'milieu', 'devant', 'premier-plan'] as const).find((p) =>
						f.classList.contains(`decor-flocon--${p}`),
					) ?? null,
			};
		});
	});
}

/* Place TOUTES les animations du décor à un instant donné de leur vie, à l'arrêt. Équivaut
   à « la page est ouverte depuis `ms` millisecondes », sans attendre : un échantillonnage
   espacé dans le temps, mais déterministe. Renvoie le nombre d'animations posées : une spec
   qui échantillonne exige qu'il y en ait (sinon le décor n'est pas animé en CSS et
   l'échantillonnage ne dirait rien).
   `arreter: false` laisse les animations COURIR après le réglage : indispensable quand le
   test bascule ensuite `animation-play-state` par le CSS (le bouton), car un `pause()` /
   `play()` appelé par l'API passe devant la règle CSS et masquerait ce qu'on veut mesurer. */
export async function placerAuTemps(page: Page, ms: number, arreter = true): Promise<number> {
	return page.evaluate(
		([t, stop]) => {
			let n = 0;
			for (const a of document.getAnimations()) {
				const cible = (a.effect as KeyframeEffect | null)?.target;
				if (cible && cible.closest('.decor-saison')) {
					if (stop) a.pause();
					a.currentTime = t;
					n++;
				}
			}
			return n;
		},
		[ms, arreter] as const,
	);
}

/* Instants d'échantillonnage (ms), tous après la phase de démarrage (retards d'animation
   éventuels) et choisis non multiples entre eux pour ne pas retomber sur la même phase. */
export const INSTANTS = [41_000, 57_300, 73_100, 96_400, 133_700, 171_200, 209_900, 250_500];

export interface PileFlocon {
	flocon: number;
	/** Éléments du contenu que ce flocon recouvre (le flocon est peint AU-DESSUS d'eux). */
	surLeContenu: string[];
	/** Éléments à fond opaque peints au-dessus du flocon (il est alors masqué en son centre). */
	masquePar: string[];
}

/* Ordre de peinture au centre et aux quatre quarts du dessin de chaque flocon VISIBLE.
   `pointer-events: none` rend le décor invisible à `elementsFromPoint` : on le rend atteignable
   le temps de la lecture (feuille injectée puis retirée), puis on lit la pile (le plus haut
   d'abord).
   - `surLeContenu` : sous le flocon dans la pile, un nœud texte réellement sous le point, une
     commande, ou une carte (fond opaque ou image, qui n'est ni un ancêtre du décor ni un
     conteneur de page couvrant l'écran).
   - `masquePar` : au-dessus du flocon, un élément à fond opaque (ni `background-color`
     transparent, ni `background-image: none`). Sert de témoin : un flocon sans personne
     d'opaque au-dessus de son centre est réellement VU. */
export async function pileDesFlocons(
	page: Page,
): Promise<{ visibles: number; vus: number; fautes: PileFlocon[] }> {
	return page.evaluate(() => {
		const L = window.innerWidth;
		const H = window.innerHeight;
		const feuille = document.createElement('style');
		feuille.textContent = '.decor-saison, .decor-saison * { pointer-events: auto !important; }';
		document.head.appendChild(feuille);
		try {
			const nom = (e: Element) => `${e.tagName.toLowerCase()}#${e.id}.${e.className.toString()}`;
			const opaque = (e: Element) => {
				const cs = getComputedStyle(e);
				const m = /rgba?\(([^)]*)\)/.exec(cs.backgroundColor);
				const alpha = m ? (m[1]!.split(',').length > 3 ? parseFloat(m[1]!.split(',')[3]!) : 1) : 0;
				return alpha > 0 || cs.backgroundImage !== 'none';
			};
			const commandes = 'button, a[href], input, select, textarea, [role="button"]';
			const sousLePoint = (e: Element, x: number, y: number) => {
				for (const n of e.childNodes) {
					if (n.nodeType !== Node.TEXT_NODE || !(n.textContent ?? '').trim()) continue;
					const range = document.createRange();
					range.selectNodeContents(n);
					for (const r of range.getClientRects()) {
						if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
					}
				}
				return false;
			};
			let visibles = 0;
			let vus = 0;
			const fautes: PileFlocon[] = [];
			document.querySelectorAll<HTMLElement>('.decor-saison .decor-flocon').forEach((f, i) => {
				const g = f.querySelector<HTMLElement>('.decor-flocon-glyphe') ?? f;
				let opacite = 1;
				for (let e: Element | null = g; e; e = e.parentElement) {
					opacite *= parseFloat(getComputedStyle(e).opacity);
				}
				const d = g.getBoundingClientRect();
				const visible =
					opacite > 0.05 &&
					d.width > 0 &&
					d.height > 0 &&
					d.right > 0 &&
					d.left < L &&
					d.bottom > 0 &&
					d.top < H &&
					g.checkVisibility();
				if (!visible) return;
				visibles++;
				const surLeContenu = new Set<string>();
				const masquePar = new Set<string>();
				let centreVu = false;
				const points: [number, number][] = [
					[0.5, 0.5],
					[0.25, 0.25],
					[0.75, 0.25],
					[0.25, 0.75],
					[0.75, 0.75],
				].map(([a, b]) => [d.left + d.width * a!, d.top + d.height * b!]);
				points.forEach(([x, y], k) => {
					if (x < 0 || y < 0 || x >= L || y >= H) return;
					const pile = document.elementsFromPoint(x, y);
					const rang = pile.findIndex((e) => e.closest('.decor-saison'));
					if (rang < 0) return;
					const decor = document.querySelector('.decor-saison')!;
					// `html` ne masque rien ; le fond de `body` est reporté sur le canevas (peint SOUS les
					// z-index négatifs) quand `html` n'a pas de fond propre.
					const fondReporte = !opaque(document.documentElement);
					const auDessus = pile
						.slice(0, rang)
						.filter(
							(e) =>
								e !== document.documentElement &&
								!(e === document.body && fondReporte) &&
								opaque(e),
						);
					for (const e of auDessus) masquePar.add(nom(e));
					if (k === 0 && auDessus.length === 0) centreVu = true;
					for (const e of pile.slice(rang + 1)) {
						if (e.contains(decor) || e === document.documentElement || e === document.body)
							continue;
						const r = e.getBoundingClientRect();
						const conteneurDePage = r.width >= L * 0.98 && r.height >= H * 0.98;
						if (e.matches(commandes) || sousLePoint(e, x, y) || (opaque(e) && !conteneurDePage)) {
							surLeContenu.add(nom(e));
						}
					}
				});
				if (centreVu) vus++; // vu = présent dans la pile ET rien d'opaque au-dessus de son centre
				if (surLeContenu.size > 0)
					fautes.push({ flocon: i, surLeContenu: [...surLeContenu], masquePar: [...masquePar] });
			});
			return { visibles, vus, fautes };
		} finally {
			feuille.remove();
		}
	});
}

/* Attente en PAGE (pas `waitForTimeout`) : ce qui est mesuré, c'est justement l'écoulement
   du temps réel entre deux relevés de position. */
export async function laisserPasser(page: Page, ms: number): Promise<void> {
	await page.evaluate((t) => new Promise<void>((fin) => setTimeout(fin, t)), ms);
}

/* Vues testées : mobile et tablette paysage, où la mise en page de l'accueil diffère. */
export const VUES = [
	{ nom: 'mobile (largeur par défaut du projet)', viewport: null },
	{ nom: 'tablette paysage', viewport: { width: 1180, height: 820 } },
] as const;
