/* ============================================================
   Rendu du décor de saison (#785) : les flocons de décembre, sur l'accueil de l'appli et
   sur la vitrine. JAMAIS ailleurs : ni guide, ni autre écran, ni impression (critère 29 ;
   masqués par `decor-saison.scss` à l'impression).

   Module PARTAGÉ avec la vitrine, qui ne charge ni profils ni stockage : il ne dépend que
   du module pur `core/decor-saison.ts` (quelle saison, quels flocons) et du DOM.

   Choix de rendu :
   - un calque FIXE qui couvre l'écran, peint SOUS le contenu (critères 13 et 14, rédaction
     du 11/11/2026, décision du mainteneur) : la neige tombe sur toute la hauteur, et une
     carte, la barre d'outils ou l'en-tête la masquent. Inséré avant `repere` pour rester
     DANS l'écran d'accueil : masqué avec lui quand on en sort ;
   - animée en CSS seulement (`transform` et `opacity`), pour rester fluide sur la
     tablette (critère 17) et se figer par `animation-play-state` (critère 16) ;
   - `aria-hidden` et `pointer-events: none` : ni annoncée, ni touchable (critère 30).
   ============================================================ */
import {
	brancheCristal,
	FLOCONS,
	RAYON_CRISTAL,
	saisonDu,
	type FloconSpec,
} from '../core/decor-saison';
import { html, joindre, type SafeHtml } from '../core/html';

const VUE_CRISTAL = `${-RAYON_CRISTAL} ${-RAYON_CRISTAL} ${2 * RAYON_CRISTAL} ${2 * RAYON_CRISTAL}`;
const SIX_BRANCHES = [0, 60, 120, 180, 240, 300];

/* Cristal à six branches FINES, trait seul : se lit « neige » d'emblée, là où une étoile
   pleine se lirait « favori » ou « récompense ». Une branche propre à chaque flocon (sa
   graine), tournée six fois : aucun flocon n'a le même dessin. */
function cristalHTML(graine: number, simple: boolean): SafeHtml {
	const d = brancheCristal(graine, simple);
	return html`<svg class="decor-flocon-glyphe" viewBox="${VUE_CRISTAL}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" focusable="false">${SIX_BRANCHES.map((a) => html`<path transform="rotate(${a})" d="${d}" />`)}</svg>`;
}

/* Les réglages de chaque flocon passent en variables CSS : la feuille garde une seule
   animation, chaque flocon y lit sa position, sa cadence et son opacité. Le délai NÉGATIF
   place chaque flocon à sa phase dès l'affichage : pas de départ groupé du haut. */
function floconHTML(f: FloconSpec): SafeHtml {
	const delai = -(f.phase * f.duree);
	const style =
		`--x:${f.x}%;--taille:${f.taille}px;--duree:${f.duree}s;--delai:${delai.toFixed(2)}s;` +
		`--opacite:${f.opacite};--derive:${f.derive}px;--rotation:${f.rotation}deg;` +
		`--repos:${f.phase}`;
	return html`<span class="decor-flocon decor-flocon--${f.plan}" style="${style}">${cristalHTML(f.graine, f.plan === 'loin')}</span>`;
}

function decorNoelHTML(): SafeHtml {
	return html`<div class="decor-saison decor-noel" aria-hidden="true">${joindre(FLOCONS.map(floconHTML))}</div>`;
}

/** Pose ou retire le décor de saison juste AVANT `repere`, selon la date (heure locale de
 *  l'appareil, critère 10). Idempotent : un décor déjà là n'est pas recréé, pour ne pas
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
