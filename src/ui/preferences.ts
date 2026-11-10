/* ============================================================
   Préférences cosmétiques par profil (issue #28, phase 3b ; #224) :
   - thème d'affichage/couleur (un seul actif via <html data-theme>),
   - réduction des animations (accessibilité, en plus de prefers-reduced-motion).
   Stockage par profil via lsGet/lsSet (clés préfixées). L'application au DOM
   (data-theme + classe) est faite par applyPreferences().

   Le sélecteur regroupe deux familles partageant le même attribut `data-theme`
   (cf. core/unlocks.ts) : les thèmes de CONFORT (Forêt / Nuit / Clair-obscur,
   `confort: true`, jamais gatés) et les thèmes de COULEUR débloqués par palier.
   Le thème automatique « Clair-obscur » (`auto`) n'est pas résolu en JS : on pose
   `data-theme="auto"` et c'est `@media (prefers-color-scheme: dark)` (themes.scss)
   qui bascule clair/sombre en direct, sans rechargement ni listener. */

import { lsGet, lsSet } from '../core/storage';
import { getXP, niveauDepuisXP } from '../core/progress';
import { THEMES, themesDebloques, type Theme } from '../core/unlocks';
import {
	activeProfile,
	apparitionsSurprises,
	confortLecture,
	lectureConsigneAuto,
	sansPressionTemporelle,
} from '../core/profiles';
import { icon } from './icon';
import { mouvementReduitSysteme, rafraichirDecor } from './footer';
import { decorFigeEffectif, decorFigeProfil } from '../core/decor';
import { html, type SafeHtml, VIDE, joindre, drapeau, attribut } from '../core/html';

export const THEME_KEY = 'ludaskia_theme';
export const ANIM_KEY = 'ludaskia_anim';

// Thèmes disponibles pour le profil actif. Sur le SERVEUR DEV uniquement
// (MODE === 'development'), on les débloque TOUS pour faciliter le test visuel.
// On cible MODE plutôt que DEV pour exclure les tests (Vitest tourne en MODE
// 'test') et le build de prod (MODE 'production') : zéro effet hors `npm run dev`.
const themesDispo = (niveau: number): string[] =>
	import.meta.env.MODE === 'development' ? THEMES.map((t) => t.id) : themesDebloques(niveau);

// Thème courant du profil actif (garde-fou : un thème non débloqué retombe sur défaut).
export function getTheme(): string {
	const id = lsGet(THEME_KEY, 'defaut');
	return themesDispo(niveauDepuisXP(getXP())).includes(id) ? id : 'defaut';
}
// Change le thème (no-op si non débloqué pour ce profil).
export function setTheme(id: string) {
	if (!themesDispo(niveauDepuisXP(getXP())).includes(id)) return;
	lsSet(THEME_KEY, id);
}
export function animationsReduites(): boolean {
	return lsGet(ANIM_KEY, false) === true;
}
export function setAnimationsReduites(v: boolean) {
	lsSet(ANIM_KEY, !!v);
}

// Applique les préférences du profil actif au document (thème + animations +
// confort de lecture). Rappelé à chaque changement/reset/import de profil.
export function applyPreferences() {
	const root = document.documentElement;
	root.dataset.theme = getTheme();
	root.classList.toggle('anim-reduced', animationsReduites());
	root.classList.toggle('confort-lecture', confortLecture());
	// « Figer le décor » (#785) : classe `decor-fige` et bouton du pied de page, puis la case
	// des Préférences, qui dépend aussi de « Réduire les animations » (critère 7).
	rafraichirDecor();
	majCaseDecor();
}

/* Deux sources réduisent les animations : la case du profil et le réglage de l'appareil
   (`prefers-reduced-motion`). Les deux figent le décor, et la phrase dit laquelle agit :
   la case du profil d'abord, puisque l'enfant peut la décocher. */
const DECOR_INCLUS_PROFIL = 'Déjà inclus dans « Réduire les animations ».';
const DECOR_INCLUS_APPAREIL = "Déjà inclus : ton appareil demande moins d'animations.";

/* Case « Figer le décor » (#785) : COCHÉE quand le décor est figé pour de bon, c'est-à-dire
   aussi quand les animations sont réduites, qui l'incluent ; elle est alors verrouillée et
   le dit (critère 7). Le réglage mémorisé, lui, n'est pas touché : décocher « Réduire les
   animations » rend la case à son état d'avant. Mise à jour SUR PLACE plutôt qu'en
   re-rendant le bloc : le focus clavier reste sur la case qu'on vient de toucher. */
export function majCaseDecor(): void {
	const caseDecor = document.getElementById('prefDecor') as HTMLInputElement | null;
	if (!caseDecor) return;
	const reduitProfil = animationsReduites();
	const reduitAppareil = mouvementReduitSysteme();
	const reduit = reduitProfil || reduitAppareil;
	caseDecor.checked = decorFigeEffectif(decorFigeProfil(), reduit);
	caseDecor.disabled = reduit;
	const inclus = document.getElementById('prefDecorInclus');
	if (inclus)
		inclus.textContent = reduitProfil
			? DECOR_INCLUS_PROFIL
			: reduitAppareil
				? DECOR_INCLUS_APPAREIL
				: '';
}

// Id de la ligne d'aide reliée (aria-describedby) au thème automatique.
const HINT_AUTO_ID = 'theme-hint-auto';

// Une pastille du sélecteur : « radio » sélectionnable si débloqué, sinon vignette
// verrouillée avec son palier. Le conteneur est un role="radiogroup" (choix
// exclusif d'un thème) ; chaque option porte aria-checked. Les thèmes de confort
// sont niv 1 → toujours débloqués, donc jamais de cadenas (réservé aux récompenses).
function themeSwatch(t: Theme, courant: string, debloques: string[]): SafeHtml {
	if (!debloques.includes(t.id)) {
		return html`<span class="theme-opt theme-${t.id} locked" role="radio" aria-checked="false" aria-disabled="true" title="Débloqué au niveau ${t.niveau}">
        <span class="theme-dot"></span><span class="theme-lab">${t.label}</span>
        <span class="theme-lock">${icon('lock')} Niv ${t.niveau}</span></span>`;
	}
	const actif = t.id === courant;
	// Thème actif : la coche double l'indice de bordure colorée (pas de signal par
	// la seule couleur — a11y / daltonisme).
	const coche = actif ? html`<span class="theme-check">${icon('check')}</span>` : VIDE;
	// Le thème automatique pointe vers sa ligne d'aide (comportement non évident).
	const describedby = t.id === 'auto' ? attribut('aria-describedby', HINT_AUTO_ID) : VIDE;
	return html`<button class="theme-opt theme-${t.id}${actif ? ' current' : ''}" role="radio" aria-checked="${actif ? 'true' : 'false'}" data-act="set-theme" data-theme="${t.id}"${describedby} title="${actif ? 'Thème actuel' : 'Choisir ce thème'}">
      <span class="theme-dot"></span><span class="theme-lab">${t.label}</span>${coche}</button>`;
}

// Bloc « Préférences » de l'écran Profils (thème + animations) pour le profil actif.
export function renderPreferences() {
	const el = document.getElementById('preferences');
	if (!el) return;
	const p = activeProfile();
	if (!p) return;
	const niveau = niveauDepuisXP(getXP());
	const debloques = themesDispo(niveau);
	const courant = getTheme();
	// Deux sections : confort (Forêt / Nuit / Clair-obscur, sans cadenas) et
	// récompenses (thèmes de couleur gatés, cadenas conservé).
	const confort = THEMES.filter((t) => t.confort).map((t) => themeSwatch(t, courant, debloques));
	const recompenses = THEMES.filter((t) => !t.confort).map((t) =>
		themeSwatch(t, courant, debloques),
	);
	el.innerHTML = html`<h3 class="pref-h">Préférences de ${p.name}</h3>
    <div class="pref-block">
      <span class="pref-lab">${icon('palette')} Thème</span>
      <div class="theme-section">
        <span class="theme-section-lab">Apparence</span>
        <div class="theme-palette" role="radiogroup" aria-label="Choisir un thème d'apparence">${joindre(confort)}</div>
        <p class="pref-hint theme-hint" id="${HINT_AUTO_ID}"><strong>Clair-obscur</strong> suit ton appareil : il devient clair ou sombre tout seul.</p>
      </div>
      <div class="theme-section">
        <span class="theme-section-lab">${icon('lock')} Thèmes à débloquer</span>
        <div class="theme-palette" role="radiogroup" aria-label="Choisir un thème de couleur à débloquer">${joindre(recompenses)}</div>
      </div>
    </div>
    <div class="pref-block">
      <span class="pref-lab">${icon('eye')} Mon confort</span>
      <div class="pref-toggles">
        <label class="pref-toggle">
          <input type="checkbox" id="prefAnim"${animationsReduites() ? drapeau('checked') : ''} />
          <span>Réduire les animations</span>
        </label>
        <label class="pref-toggle">
          <input type="checkbox" id="prefDecor" />
          <span>Figer le décor <small class="pref-hint">(la forêt et le décor de saison ne bougent plus)</small>
            <small class="pref-hint" id="prefDecorInclus"></small></span>
        </label>
        <label class="pref-toggle">
          <input type="checkbox" id="prefConfort"${confortLecture() ? drapeau('checked') : ''} />
          <span>Confort de lecture <small class="pref-hint">(texte plus grand et plus aéré)</small></span>
        </label>
      </div>
      ${amenagementsInfoHTML()}
    </div>`.balisage;
	majCaseDecor(); // état de la case « Figer le décor » : un seul endroit pour le calculer
}

/* Aménagements posés par l'adulte dans l'espace encadrants (#234) : masquer le
   minuteur, lecture auto des consignes. Affichés ici en LECTURE SEULE — l'enfant
   comprend pourquoi son app se comporte ainsi sans pouvoir le désactiver par jeu.
   Rien n'est affiché si aucun aménagement n'est posé. L'écoute « à la demande »
   (bouton « Écouter ») reste, elle, toujours disponible côté enfant.

   La ligne de la lecture auto nomme son exception de mode (#630) ET ce qu'il reste
   à l'enfant. Dire seulement « sauf pendant les sprints » lui ferait comprendre
   qu'il y perd l'accès à l'oral, alors que c'est l'inverse : c'est le seul mode où
   il le déclenche lui-même. La ligne est plus longue que ses sœurs, et c'est
   assumé — l'enfant que le bouton sert en premier est celui qui lit le moins vite,
   et à qui on ne peut pas demander de deviner. */
function amenagementsInfoHTML(): SafeHtml {
	const lignes: string[] = [];
	if (sansPressionTemporelle())
		lignes.push('Le minuteur est masqué pendant les sprints (réglé par un adulte).');
	if (lectureConsigneAuto())
		lignes.push(
			'Les consignes sont lues à voix haute automatiquement, sauf pendant les sprints, où le bouton « Écouter » reste disponible (réglé par un adulte).',
		);
	if (!apparitionsSurprises())
		lignes.push('Les apparitions surprises sont désactivées (réglé par un adulte).');
	return lignes.length
		? html`<div class="pref-amenagements">${joindre(
				lignes.map((l) => html`<p class="pref-hint">${icon('lock')} ${l}</p>`),
			)}</div>`
		: VIDE;
}
