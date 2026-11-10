/* ============================================================
   Rendu du décor de saison (#785) : la bande de flocons de décembre, sur l'accueil de
   l'appli et sur la vitrine. JAMAIS ailleurs : ni guide, ni autre écran, ni impression
   (critère 29 ; masquée par `decor-saison.scss` à l'impression).

   Module PARTAGÉ avec la vitrine, qui ne charge ni profils ni stockage : il ne dépend que
   du module pur `core/decor-saison.ts` (quelle saison, quels flocons) et du DOM.

   Choix de rendu (avis `designer-ux-enfant` du 09/11/2026) :
   - une BANDE dans le flux, de hauteur réservée, au niveau du titre ; jamais un calque
     posé sur le contenu, qui ne pourrait pas garantir « aucun flocon sur un texte »
     (critère 14). Le dessin de chaque flocon reste DANS la bande ;
   - animée en CSS seulement (`transform` et `opacity`), pour rester fluide sur la
     tablette (critère 17) et se figer par `animation-play-state` (critère 16) ;
   - `aria-hidden` et `pointer-events: none` : ni annoncée, ni touchable (critère 30).
   ============================================================ */
import { FLOCONS, saisonDu, type FloconSpec } from '../core/decor-saison';
import { html, joindre, type SafeHtml } from '../core/html';

/* Cristal à six branches FINES, trait seul : se lit « neige » d'emblée, là où une étoile
   pleine se lirait « favori » ou « récompense ». Une branche, tournée six fois. */
const BRANCHE = html`<path d="M0 0V-10M0-6l-3-3M0-6l3-3" />`;
const CRISTAL = html`<svg class="decor-flocon-glyphe" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${BRANCHE}${[60, 120, 180, 240, 300].map((a) => html`<g transform="rotate(${a})">${BRANCHE}</g>`)}</svg>`;
/* Point rond plein et doux : sans contour ni halo, qui le feraient lire comme un bouton. */
const POINT = html`<svg class="decor-flocon-glyphe" viewBox="-12 -12 24 24" focusable="false"><circle r="7" fill="currentColor" /></svg>`;

/* Les réglages de chaque flocon passent en variables CSS : la feuille garde une seule
   animation, chaque flocon y lit sa position, sa cadence et son opacité. Le délai NÉGATIF
   place chaque flocon à sa phase dès l'affichage : pas de départ groupé du haut. */
function floconHTML(f: FloconSpec): SafeHtml {
	const delai = -(f.phase * f.duree);
	const style =
		`--x:${f.x}%;--taille:${f.taille}px;--duree:${f.duree}s;--delai:${delai.toFixed(2)}s;` +
		`--opacite:${f.opacite};--derive:${f.derive}px;--rotation:${f.rotation}deg;` +
		`--repos:${f.phase}`;
	return html`<span class="decor-flocon" style="${style}">${f.forme === 'cristal' ? CRISTAL : POINT}</span>`;
}

function decorNoelHTML(): SafeHtml {
	return html`<div class="decor-saison decor-noel" aria-hidden="true">${joindre(FLOCONS.map(floconHTML))}</div>`;
}

/** Pose ou retire la bande de saison juste AVANT `repere`, selon la date (heure locale de
 *  l'appareil, critère 10). Idempotent : une bande déjà là n'est pas recréée, pour ne pas
 *  relancer les flocons à chaque rendu de l'accueil. Hors saison, rien n'est laissé dans
 *  le DOM (critère 34 : la page reste celle d'avant). */
export function majDecorSaison(repere: Element | null, date: Date = new Date()): void {
	if (!repere) return;
	const voisin = repere.previousElementSibling;
	const presente = voisin?.classList.contains('decor-saison') ? voisin : null;
	if (!saisonDu(date)) {
		presente?.remove();
		return;
	}
	if (!presente) repere.insertAdjacentHTML('beforebegin', decorNoelHTML().balisage);
}
