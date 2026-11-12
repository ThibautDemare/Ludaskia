/* ============================================================
   #785 — Vitrine en décembre : le texte posé à même le fond est sur un panneau de verre
   dépoli (précision du critère 14, critère 34 inchangé). Écrit AVANT l'implémentation.

   Contrat : `.v-texte` est posé sur chaque bloc de texte de la vitrine qui repose à même le
   fond (accroche, titres seuls, colonnes, notes, enveloppes titre + paragraphes, `.v-footer`).
   En décembre : `backdrop-filter` contenant `blur`, fond semi-transparent (0 < alpha < 1),
   `width: fit-content`. Hors décembre : fond transparent et `backdrop-filter: none`.
   `.v-final` a un fond plein, donc pas de panneau.
   ============================================================ */
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';
import { DATES, FUSEAU, VUES, ouvrirVitrine } from './decor-aide';

test.use({ timezoneId: FUSEAU });

/* Un texte qui se coupe en lignes remplit la largeur disponible, et `fit-content` ne peut pas
   descendre dessous : la ligne la plus longue finit avant la boîte d'environ la largeur du mot
   renvoyé à la ligne. Dépassement autorisé = marge intérieure droite + plus long premier mot
   d'une ligne suivante (mesuré dans le panneau) + 4 px d'arrondi. Le défaut visé (panneau pleine
   largeur de section) dépasse le texte de 300 px et plus. */
const MARGE_PX = 4;
const MIN_PANNEAUX = 8;

for (const vue of VUES) {
	test.describe(`vitrine, verre dépoli — ${vue.nom}`, () => {
		if (vue.viewport) test.use({ viewport: { ...vue.viewport } });

		test('critère 14 : le 15 décembre, aucun texte nu sur la neige (opaque ou verre)', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirVitrine(page, DATES.noel);

			const bilan = await page.evaluate(() => {
				const alpha = (c: string): number => {
					if (c === 'transparent') return 0;
					const n = c.match(/[\d.]+/g);
					return n && n.length >= 4 ? parseFloat(n[3]) : 1;
				};
				const fautifs: string[] = [];
				let controles = 0;
				let verres = 0;
				const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
				for (let n = walker.nextNode(); n; n = walker.nextNode()) {
					const texte = (n.textContent ?? '').trim();
					const parent = n.parentElement;
					if (!texte || !parent || parent.closest('.decor-saison')) continue;
					/* Un pictogramme (🦊 de la mascotte) est une image, pas un texte à lire : WCAG 1.4.3
					   ne le vise pas. On n'exclut PAS tout `aria-hidden`, qui peut porter du vrai texte. */
					if (/^[\p{Extended_Pictographic}️‍\s]+$/u.test(texte)) continue;
					if (parent.closest('script, style, noscript, template')) continue;
					if (!parent.checkVisibility()) continue;
					const r = parent.getBoundingClientRect();
					if (r.width <= 1 || r.height <= 1) continue;
					controles++;
					let ok = false;
					for (let e: Element | null = parent; e && e !== document.body; e = e.parentElement) {
						const cs = getComputedStyle(e);
						if (e.classList.contains('v-texte')) {
							const a = alpha(cs.backgroundColor);
							const verre = cs.backdropFilter.includes('blur') && a > 0 && a < 1;
							if (verre) {
								verres++;
								ok = true;
							}
							break;
						}
						if (alpha(cs.backgroundColor) === 1 || cs.backgroundImage !== 'none') {
							ok = true;
							break;
						}
					}
					if (!ok) fautifs.push(texte.slice(0, 50));
				}
				return { fautifs, controles, verres };
			});

			expect(bilan.fautifs, `textes nus sur le fond : ${bilan.fautifs.join(' | ')}`).toEqual([]);
			expect(bilan.controles, 'témoin : au moins 20 nœuds texte contrôlés').toBeGreaterThanOrEqual(
				20,
			);
			expect(
				bilan.verres,
				'témoin : au moins un .v-texte est un vrai verre',
			).toBeGreaterThanOrEqual(1);
			expect(errors).toEqual([]);
		});

		test('critère 14 : le 15 décembre, chaque panneau est ajusté à son texte', async ({ page }) => {
			const errors = watchErrors(page);
			await ouvrirVitrine(page, DATES.noel);

			const panneaux = await page.evaluate(() =>
				[...document.querySelectorAll<HTMLElement>('.v-texte')].map((p) => {
					const cs = getComputedStyle(p);
					const boite = p.getBoundingClientRect();
					let finTexte = -Infinity;
					const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
					for (let n = walker.nextNode(); n; n = walker.nextNode()) {
						if (!(n.textContent ?? '').trim()) continue;
						const range = document.createRange();
						range.selectNodeContents(n);
						for (const rect of range.getClientRects()) {
							if (rect.width > 0) finTexte = Math.max(finTexte, rect.right);
						}
					}
					for (const el of p.querySelectorAll('a, button')) {
						const rect = el.getBoundingClientRect();
						if (rect.width > 0) finTexte = Math.max(finTexte, rect.right);
					}
					const marge = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
					/* Plus long « premier mot d'une ligne suivante » : le mot qui n'a pas tenu sur la
					   ligne d'avant. Déduit des rectangles de chaque mot : un mot (tous nœuds confondus) dont le haut est sous
					   celui du mot précédent commence une ligne. */
					let motRenvoye = 0;
					let precedent: DOMRect | null = null;
					const marche = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
					for (let n = marche.nextNode(); n; n = marche.nextNode()) {
						for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
							const mot = document.createRange();
							mot.setStart(n, m.index);
							mot.setEnd(n, m.index + m[0].length);
							const rect = mot.getBoundingClientRect();
							if (rect.width === 0) continue;
							if (precedent && rect.top > precedent.top + 2) {
								motRenvoye = Math.max(motRenvoye, rect.width);
							}
							precedent = rect;
						}
					}
					return {
						nom: `${p.tagName.toLowerCase()}.${p.className} « ${(p.textContent ?? '').trim().slice(0, 30)} »`,
						depassement: boite.right - finTexte - marge,
						motRenvoye,
					};
				}),
			);

			expect(panneaux.length, `au moins ${MIN_PANNEAUX} .v-texte`).toBeGreaterThanOrEqual(
				MIN_PANNEAUX,
			);
			const trop = panneaux.filter((p) => p.depassement > p.motRenvoye + MARGE_PX);
			expect(
				trop,
				`panneaux plus larges que leur texte (dépassement, mot renvoyé toléré) : ${trop
					.map((p) => `${p.nom} (+${Math.round(p.depassement)}, ${Math.round(p.motRenvoye)})`)
					.join(' | ')}`,
			).toEqual([]);
			expect(errors).toEqual([]);
		});

		/* Le panneau déborde de son texte (marge négative) dans un conteneur à marge intérieure
		   limitée ; `body.vitrine` a `overflow-x: hidden`, donc une sortie d'écran serait coupée
		   sans défilement visible. */
		test('critère 14 : le 15 décembre, chaque panneau reste entièrement dans la fenêtre', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			await ouvrirVitrine(page, DATES.noel);
			const dehors = await page.evaluate(() => {
				const L = window.innerWidth;
				const tous = [...document.querySelectorAll<HTMLElement>('.v-texte')];
				return {
					nb: tous.length,
					dehors: tous
						.map((p) => ({ p, r: p.getBoundingClientRect() }))
						.filter(({ r }) => r.left < -1 || r.right > L + 1)
						.map(
							({ p, r }) =>
								`${p.tagName.toLowerCase()}.${p.className} (${Math.round(r.left)} → ${Math.round(r.right)} / ${L})`,
						),
				};
			});
			expect(dehors.nb, `au moins ${MIN_PANNEAUX} .v-texte`).toBeGreaterThanOrEqual(MIN_PANNEAUX);
			expect(dehors.dehors, 'panneaux qui sortent de la fenêtre').toEqual([]);
			expect(errors).toEqual([]);
		});

		test('critère 34 : le 14 juillet, les .v-texte n’ont ni fond ni flou (témoin : verre en décembre)', async ({
			page,
		}) => {
			const errors = watchErrors(page);
			const lire = () =>
				page.evaluate(() =>
					[...document.querySelectorAll<HTMLElement>('.v-texte')].map((p) => {
						const cs = getComputedStyle(p);
						const n = cs.backgroundColor.match(/[\d.]+/g);
						return {
							fond: cs.backgroundColor === 'transparent' ? 0 : n && n.length >= 4 ? +n[3] : 1,
							flou: cs.backdropFilter,
							largeur: cs.width,
						};
					}),
				);

			await ouvrirVitrine(page, DATES.ete);
			const ete = await lire();
			expect(ete.length, `au moins ${MIN_PANNEAUX} .v-texte en juillet`).toBeGreaterThanOrEqual(
				MIN_PANNEAUX,
			);
			expect(
				ete.filter((p) => p.fond !== 0 || p.flou !== 'none'),
				'aucun .v-texte n’a de fond ni de backdrop-filter hors décembre',
			).toEqual([]);

			await ouvrirVitrine(page, DATES.noel);
			const noel = await lire();
			expect(noel.length, 'même nombre de .v-texte en décembre').toBe(ete.length);
			expect(
				noel.filter((p) => !(p.flou.includes('blur') && p.fond > 0 && p.fond < 1)),
				'témoin : en décembre, les mêmes .v-texte ont le verre',
			).toEqual([]);
			expect(errors).toEqual([]);
		});
	});
}
