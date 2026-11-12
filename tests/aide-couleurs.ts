import { readFileSync } from 'node:fs';
import { sansCommentairesScss } from './aide-scss';

/* ============================================================
   Couleurs lues dans les feuilles, partagées par les gates de contraste
   (`contraste-tokens.test.ts`, `contraste-decor-saison.test.ts`). Pas une suite : le nom
   sans `.test.` la tient hors de l'include de Vitest.

   Deux lectures, faites une fois à l'import : la palette effective de chaque thème
   (tokens hexadécimaux de base.scss et themes.scss), et le fond vert des sections de la
   vitrine, écrit en littéral hors des tokens.
   ============================================================ */

/** Tokens `--x: #rrggbb;` d'un bloc de déclarations. Volontairement limité aux
 *  littéraux hexadécimaux : un token défini par `var(--autre)` serait invisible ici,
 *  et le test « les palettes sont bien lues » échouerait bruyamment plutôt que de
 *  mesurer du vide. D'où la consigne, dans themes.scss, d'écrire la valeur en dur. */
export function tokens(bloc: string): Record<string, string> {
	const t: Record<string, string> = {};
	for (const m of bloc.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*(?:!important)?\s*;/g))
		t[m[1]] = m[2].toLowerCase();
	return t;
}

export const BASE = readFileSync('src/styles/base.scss', 'utf8');
export const THEMES = readFileSync('src/styles/themes.scss', 'utf8');

const debutRacine = BASE.indexOf(':root {');
export const RACINE = tokens(BASE.slice(debutRacine, BASE.indexOf('\n}', debutRacine)));

/** Palette effective de chaque thème : la racine, écrasée par ses propres tokens. */
function palettes(): Record<string, Record<string, string>> {
	const p: Record<string, Record<string, string>> = { defaut: { ...RACINE } };
	for (const m of THEMES.matchAll(/:root\[data-theme='([\w-]+)'\]\s*\{([\s\S]*?)\n\}/g)) {
		// « auto » ne déclare aucun token : il inclut le mixin Nuit derrière une media
		// query, non résolue en JS. L'ajouter produirait un doublon exact de « defaut »
		// (donc 6 cas de plus qui ne testent rien de neuf) alors que sa vraie palette
		// est celle de « nuit », déjà couverte ci-dessous.
		if (m[1] === 'auto') continue;
		p[m[1]] = { ...RACINE, ...tokens(m[2]) };
	}
	const nuit = THEMES.match(/@mixin nuit-palette\s*\{([\s\S]*?)\n\}/);
	if (nuit) p.nuit = { ...RACINE, ...tokens(nuit[1]) };
	return p;
}

export const PALETTES = palettes();
export const THEMES_NOMS = Object.keys(PALETTES);

/** Fond vert des sections `.v-section--soft`, posé par leur `::before` (#785) : peint sous
 *  le contenu ET sous les flocons de décembre, qui passent donc dessus (mesurés dans
 *  `contraste-decor-saison.test.ts`). Commentaires retirés : un ancien fond cité en
 *  commentaire ne doit pas être lu à la place. */
export function fondVertDe(scss: string): string | undefined {
	return sansCommentairesScss(scss).match(
		/\.v-section--soft::before\s*\{[^}]*?background(?:-color)?:\s*(#[0-9a-fA-F]{6})\s*;/,
	)?.[1];
}
export const VITRINE_SCSS = readFileSync('src/styles/vitrine.scss', 'utf8');
export const FOND_VERT_VITRINE = fondVertDe(VITRINE_SCSS);
