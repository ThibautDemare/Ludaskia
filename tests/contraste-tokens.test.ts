import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ============================================================
   Contraste WCAG AA de la rampe de gris, thème par thème (#576).

   Le token `--muted` a vécu des années sous AA (#9aa1ac ≈ 2,6:1 sur blanc). Le
   défaut ne s'est pas vu parce qu'il n'échoue nulle part bruyamment : le texte
   s'affiche, il est juste illisible pour qui a une vue moyenne au soleil. Il a été
   contourné À LA MAIN dans quatre feuilles (chacune redécouvrant le problème et
   écrivant son propre commentaire) avant d'être corrigé à la source.

   Ce test empêche la rechute et, surtout, la rechute PAR UN AUTRE CHEMIN : un thème
   ajouté demain avec un `--accent-soft` un peu plus sombre suffirait à refaire passer
   `--muted` sous 4,5:1 sans que personne ne touche au token. Il lit donc les tokens
   dans les feuilles et éprouve CHAQUE couple (texte, surface) de CHAQUE thème.

   Pourquoi ici et pas seulement dans le scan axe : axe ne visite que 9 vues, ne voit
   qu'un thème à la fois (celui rendu), et il est NON BLOQUANT par défaut. Ce test
   couvre les 7 thèmes en quelques millisecondes et fait échouer `npm test`.

   HORS PÉRIMÈTRE, mesuré et assumé : `--accent` employé comme TEXTE sur
   `--accent-soft` échoue dans quatre thèmes clairs sur cinq (lagon 3,59:1, automne
   4,10:1, défaut 4,29:1, fruit-rouge 4,40:1 ; seul « ciel » atteint 4,50:1). C'est un
   défaut réel, visible dans le scan axe sur les zones de dépôt du tri de mots, mais
   le corriger veut dire déplacer cinq couleurs de marque — décision de design, pas de
   token. Ne pas l'ajouter à ce gate sans avoir d'abord bougé les accents, sinon il
   échoue au premier `npm test`.
   ============================================================ */

const SEUIL_AA = 4.5;

function luminance(hex: string): number {
	const canaux = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	const lin = canaux.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
	return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contraste(a: string, b: string): number {
	const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (clair + 0.05) / (sombre + 0.05);
}

/** Couleur RÉELLEMENT perçue quand `avant` est posé sur `arriere` avec une opacité :
 *  c'est la composition que fait le navigateur, et ce que mesure axe. */
function melange(avant: string, arriere: string, alpha: number): string {
	const canal = (i: number) =>
		Math.round(
			alpha * parseInt(avant.slice(i, i + 2), 16) +
				(1 - alpha) * parseInt(arriere.slice(i, i + 2), 16),
		);
	return '#' + [1, 3, 5].map((i) => canal(i).toString(16).padStart(2, '0')).join('');
}

/** Tokens `--x: #rrggbb;` d'un bloc de déclarations. */
function tokens(bloc: string): Record<string, string> {
	const t: Record<string, string> = {};
	for (const m of bloc.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g))
		t[m[1]] = m[2].toLowerCase();
	return t;
}

const BASE = readFileSync('src/styles/base.scss', 'utf8');
const THEMES = readFileSync('src/styles/themes.scss', 'utf8');

const debutRacine = BASE.indexOf(':root {');
const RACINE = tokens(BASE.slice(debutRacine, BASE.indexOf('\n}', debutRacine)));

/** Palette effective de chaque thème : la racine, écrasée par ses propres tokens.
 *  « auto » n'est pas résolu en JS (media query) et applique la palette Nuit ; il est
 *  donc couvert par l'entrée `nuit`. */
function palettes(): Record<string, Record<string, string>> {
	const p: Record<string, Record<string, string>> = { defaut: { ...RACINE } };
	for (const m of THEMES.matchAll(/:root\[data-theme='([\w-]+)'\]\s*\{([\s\S]*?)\n\}/g)) {
		p[m[1]] = { ...RACINE, ...tokens(m[2]) };
	}
	const nuit = THEMES.match(/@mixin nuit-palette\s*\{([\s\S]*?)\n\}/);
	if (nuit) p.nuit = { ...RACINE, ...tokens(nuit[1]) };
	return p;
}

const PALETTES = palettes();

/* Les trois niveaux de la rampe de gris, tous employés comme TEXTE. */
const TEXTES = ['--ink', '--grey', '--muted'];
/* Les surfaces sur lesquelles ce texte se pose réellement. `--accent-soft` est dans la
   liste parce que c'est la plus SERRÉE des trois, et celle qu'on oublie : le défaut
   corrigé ici échouait justement dessus alors qu'il passait déjà sur `--paper`. */
const SURFACES = ['--paper', '--page-bg', '--accent-soft'];

const CAS = Object.entries(PALETTES).flatMap(([theme, p]) =>
	TEXTES.flatMap((texte) => SURFACES.map((surface) => ({ theme, texte, surface, p }))),
);

describe('Contraste AA de la rampe de gris (#576)', () => {
	it('les palettes sont bien lues (garde contre un test à vide)', () => {
		// 5 thèmes clairs (défaut + 4 déblocables) + Nuit.
		expect(Object.keys(PALETTES).length).toBeGreaterThanOrEqual(6);
		expect(CAS.length).toBeGreaterThanOrEqual(54);
		for (const { p, texte, surface } of CAS) {
			expect(p[texte], `token ${texte} illisible dans les feuilles`).toMatch(/^#[0-9a-f]{6}$/);
			expect(p[surface], `token ${surface} illisible dans les feuilles`).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it.each(CAS)('$theme : $texte sur $surface atteint AA', ({ theme, texte, surface, p }) => {
		const r = contraste(p[texte], p[surface]);
		expect(
			r,
			`Thème « ${theme} » : ${texte} (${p[texte]}) sur ${surface} (${p[surface]}) = ` +
				`${r.toFixed(2)}:1, sous les ${SEUIL_AA}:1 exigés par WCAG AA pour du texte courant.\n` +
				`Le texte s'affichera quand même — c'est ce qui rend ce défaut invisible en relecture.\n` +
				`Assombrir le token, ou éclaircir la surface ; ne pas contourner feuille par feuille.`,
		).toBeGreaterThanOrEqual(SEUIL_AA);
	});

	/* L'autre moitié de #576, et la plus retorse : une OPACITÉ sur un conteneur dilue
	   tout ce qu'il contient vers le fond. La carte d'un trophée verrouillé était à
	   `opacity: 0.55`, ce qui faisait tomber son titre à 3,9:1 et sa description à
	   2,6:1 — axe rapportait un « #a1a1a1 » qui n'est écrit nulle part, puisque c'est
	   --grey vu à travers l'opacité. Aucun choix de token ne peut corriger ça (même
	   --ink, à 17:1, retombe à 3,9:1) : c'est l'opacité qu'il faut relever. D'où ce
	   test, qui recalcule la couleur COMPOSÉE au lieu de figer un nombre magique. */
	it('un trophée verrouillé reste lisible malgré son estompage', () => {
		const css = readFileSync('src/styles/gamification.scss', 'utf8');
		const m = css.match(/\.trophy\.off\s*\{[^}]*opacity:\s*([\d.]+)/);
		expect(
			m,
			'.trophy.off introuvable : la règle a changé de nom, ce test ne garde plus rien',
		).toBeTruthy();
		const alpha = Number(m![1]);
		for (const [theme, p] of Object.entries(PALETTES)) {
			for (const texte of ['--ink', '--grey']) {
				const compose = melange(p[texte], p['--paper'], alpha);
				const r = contraste(compose, p['--paper']);
				expect(
					r,
					`Thème « ${theme} » : à opacity ${alpha}, ${texte} d'un trophée verrouillé se compose ` +
						`en ${compose} sur ${p['--paper']}, soit ${r.toFixed(2)}:1 — sous AA.\n` +
						`Remonter l'opacité (la désaturation porte déjà le signal « pas encore débloqué »), ` +
						`pas la couleur : l'opacité rediluerait tout token qu'on mettrait dessous.`,
				).toBeGreaterThanOrEqual(SEUIL_AA);
			}
		}
	});

	it('--muted reste VISIBLEMENT plus clair que --grey (hiérarchie à trois niveaux)', () => {
		// Sans cette garde, la façon la plus simple de faire passer le test ci-dessus
		// serait d'aligner --muted sur --grey — ce qui supprimerait un niveau de
		// hiérarchie visuelle au lieu de corriger le contraste.
		for (const [theme, p] of Object.entries(PALETTES)) {
			const muted = contraste(p['--muted'], p['--paper']);
			const grey = contraste(p['--grey'], p['--paper']);
			expect(
				grey - muted,
				`Thème « ${theme} » : --muted (${muted.toFixed(2)}:1) et --grey (${grey.toFixed(2)}:1) ` +
					`sont devenus presque identiques — le niveau « discret » a disparu.`,
			).toBeGreaterThan(1);
		}
	});
});
