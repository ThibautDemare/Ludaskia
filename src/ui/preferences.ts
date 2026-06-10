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
import { activeProfile } from '../core/profiles';

export const THEME_KEY = 'ludaskia_theme';
export const ANIM_KEY = 'ludaskia_anim';

// Thème courant du profil actif (garde-fou : un thème non débloqué retombe sur défaut).
export function getTheme(): string {
  const id = lsGet(THEME_KEY, 'defaut');
  return themesDebloques(niveauDepuisXP(getXP())).includes(id) ? id : 'defaut';
}
// Change le thème (no-op si non débloqué pour ce profil).
export function setTheme(id: string) {
  if (!themesDebloques(niveauDepuisXP(getXP())).includes(id)) return;
  lsSet(THEME_KEY, id);
}
export function animationsReduites(): boolean {
  return lsGet(ANIM_KEY, false) === true;
}
export function setAnimationsReduites(v: boolean) {
  lsSet(ANIM_KEY, !!v);
}

// Applique les préférences du profil actif au document (thème + animations).
export function applyPreferences() {
  const root = document.documentElement;
  root.dataset.theme = getTheme();
  root.classList.toggle('anim-reduced', animationsReduites());
}

// Bloc « Préférences » de l'écran Profils (thème + animations) pour le profil actif.
export function renderPreferences() {
  const el = document.getElementById('preferences');
  if (!el) return;
  const p = activeProfile();
  if (!p) return;
  const niveau = niveauDepuisXP(getXP());
  const debloques = themesDebloques(niveau);
  const courant = getTheme();
  const swatches = THEMES.map((t) => {
    if (!debloques.includes(t.id)) {
      return `<span class="theme-opt theme-${t.id} locked" title="Débloqué au niveau ${t.niveau}">
        <span class="theme-dot"></span><span class="theme-lab">${t.label}</span>
        <span class="theme-lock">🔒 Niv ${t.niveau}</span></span>`;
    }
    return `<button class="theme-opt theme-${t.id}${t.id === courant ? ' current' : ''}" data-act="set-theme" data-theme="${t.id}"${
      t.id === courant ? ' aria-current="true"' : ''
    } title="${t.id === courant ? 'Thème actuel' : 'Choisir ce thème'}">
      <span class="theme-dot"></span><span class="theme-lab">${t.label}</span></button>`;
  }).join('');
  el.innerHTML = `<h3 class="pref-h">Préférences de ${escapeHTML(p.name)}</h3>
    <div class="pref-block">
      <span class="pref-lab">🎨 Thème de couleur</span>
      <div class="theme-palette" role="listbox" aria-label="Choisir un thème">${swatches}</div>
    </div>
    <label class="pref-toggle">
      <input type="checkbox" id="prefAnim"${animationsReduites() ? ' checked' : ''} />
      <span>Réduire les animations</span>
    </label>`;
}
