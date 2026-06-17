/* ============================================================
   Préférences cosmétiques par profil (issue #28, phase 3b) :
   - thème de couleur (débloqué par niveau),
   - réduction des animations (accessibilité, en plus de prefers-reduced-motion).
   Stockage par profil via lsGet/lsSet (clés préfixées). L'application au DOM
   (data-theme + classe) est faite par applyPreferences().
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { lsGet, lsSet } from '../core/storage';
import { getXP, niveauDepuisXP } from '../core/progress';
import { THEMES, themesDebloques } from '../core/unlocks';
import { activeProfile, confortLecture, lectureConsigneAuto } from '../core/profiles';
import { dicteeDisponible } from './tts';
import { icon } from './icon';

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
	const dispoVoix = dicteeDisponible(); // statut de la lecture vocale (#42)
	const swatches = THEMES.map((t) => {
		if (!debloques.includes(t.id)) {
			return `<span class="theme-opt theme-${t.id} locked" title="Débloqué au niveau ${t.niveau}">
        <span class="theme-dot"></span><span class="theme-lab">${t.label}</span>
        <span class="theme-lock">${icon('lock')} Niv ${t.niveau}</span></span>`;
		}
		return `<button class="theme-opt theme-${t.id}${t.id === courant ? ' current' : ''}" data-act="set-theme" data-theme="${t.id}"${
			t.id === courant ? ' aria-current="true"' : ''
		} title="${t.id === courant ? 'Thème actuel' : 'Choisir ce thème'}">
      <span class="theme-dot"></span><span class="theme-lab">${t.label}</span></button>`;
	}).join('');
	el.innerHTML = `<h3 class="pref-h">Préférences de ${escapeHTML(p.name)}</h3>
    <div class="pref-block">
      <span class="pref-lab">${icon('palette')} Thème de couleur</span>
      <div class="theme-palette" role="listbox" aria-label="Choisir un thème">${swatches}</div>
    </div>
    <label class="pref-toggle">
      <input type="checkbox" id="prefAnim"${animationsReduites() ? ' checked' : ''} />
      <span>Réduire les animations</span>
    </label>
    <div class="pref-block">
      <span class="pref-lab">${icon('eye')} Accessibilité</span>
      <label class="pref-toggle">
        <input type="checkbox" id="prefConfort"${confortLecture() ? ' checked' : ''} />
        <span>Confort de lecture <small class="pref-hint">(texte plus grand et plus aéré)</small></span>
      </label>
      <label class="pref-toggle${dispoVoix ? '' : ' pref-toggle-off'}">
        <input type="checkbox" id="prefLectureAuto"${lectureConsigneAuto() ? ' checked' : ''}${dispoVoix ? '' : ' disabled'} />
        <span>Lire la consigne à voix haute automatiquement</span>
      </label>
      <p class="pref-tts-statut">${
				dispoVoix
					? `${icon('speaker')} Lecture vocale disponible sur cet appareil.`
					: `${icon('speaker')} Lecture vocale indisponible sur cet appareil (aucune voix française).`
			}</p>
    </div>`;
}
