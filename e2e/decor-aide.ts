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

export interface Recouvrement {
	flocon: number;
	avec: string;
}

/* Flocons VISIBLES qui recouvrent un nœud texte non vide visible, ou un bouton / lien /
   champ visible. Rectangles : celui du dessin du flocon contre ceux de `Range.getClientRects`
   (texte) et de `getBoundingClientRect` (commandes). Recouvrement = intersection de plus de
   0,5 px dans les deux axes. */
export async function recouvrements(page: Page): Promise<Recouvrement[]> {
	return page.evaluate(() => {
		const L = window.innerWidth;
		const H = window.innerHeight;
		const rects: { r: DOMRect; nom: string }[] = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			const el = n.parentElement;
			if (!el || !(n.textContent ?? '').trim()) continue;
			if (el.closest('.decor-saison, script, style, noscript, template')) continue;
			if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
			// Texte masqué VISUELLEMENT (patron `.sr-only` : boîte ≤ 1 px, `overflow` coupé, ou
			// `clip` nul) : le clip ne réduit pas `Range.getClientRects`, qui rend la boîte du
			// texte entier. Seul le texte qu'on VOIT peut être recouvert ; tout le reste est gardé.
			const masque = (() => {
				for (let a: HTMLElement | null = el; a && a !== document.body; a = a.parentElement) {
					const cs = getComputedStyle(a);
					const b = a.getBoundingClientRect();
					const coupe = cs.overflow !== 'visible' || cs.overflowX !== 'visible';
					if (coupe && b.width <= 1 && b.height <= 1) return true;
					if (/^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(cs.clip)) return true;
				}
				return false;
			})();
			if (masque) continue;
			const range = document.createRange();
			range.selectNodeContents(n);
			for (const r of range.getClientRects()) {
				if (r.width > 0 && r.height > 0) {
					rects.push({ r, nom: `texte « ${(n.textContent ?? '').trim().slice(0, 30)} »` });
				}
			}
		}
		const commandes = 'button, a[href], input, select, textarea, [role="button"]';
		for (const el of document.querySelectorAll<HTMLElement>(commandes)) {
			if (el.closest('.decor-saison')) continue;
			if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
			const r = el.getBoundingClientRect();
			if (r.width > 0 && r.height > 0) rects.push({ r, nom: `commande ${el.tagName}#${el.id}` });
		}
		const trouvés: { flocon: number; avec: string }[] = [];
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
			for (const { r, nom } of rects) {
				const dx = Math.min(d.right, r.right) - Math.max(d.left, r.left);
				const dy = Math.min(d.bottom, r.bottom) - Math.max(d.top, r.top);
				if (dx > 0.5 && dy > 0.5) trouvés.push({ flocon: i, avec: nom });
			}
		});
		return trouvés;
	});
}

/* Attente en PAGE (pas `waitForTimeout`) : ce qui est mesuré, c'est justement l'écoulement
   du temps réel entre deux relevés de position. */
export async function laisserPasser(page: Page, ms: number): Promise<void> {
	await page.evaluate((t) => new Promise<void>((fin) => setTimeout(fin, t)), ms);
}

/* Vues testées : la bande de flocons n'est pas au même endroit selon la largeur. */
export const VUES = [
	{ nom: 'mobile (largeur par défaut du projet)', viewport: null },
	{ nom: 'tablette paysage', viewport: { width: 1180, height: 820 } },
] as const;
