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
import { escapeHTML } from '../core/utils';
import { lsGet, lsSet } from '../core/storage';
import { getXP, niveauDepuisXP } from '../core/progress';
import { THEMES, themesDebloques, type Theme } from '../core/unlocks';
import {
	activeProfile,
	confortLecture,
	lectureConsigneAuto,
	getNiveauReference,
	getNiveauParMatiere,
} from '../core/profiles';
import { getAllLessons, SUBJECTS } from '../core/catalog';
import { availableLevels, LEVEL_LABEL } from '../core/levels';
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

// Id de la ligne d'aide reliée (aria-describedby) au thème automatique.
const HINT_AUTO_ID = 'theme-hint-auto';

// Une pastille du sélecteur : « radio » sélectionnable si débloqué, sinon vignette
// verrouillée avec son palier. Le conteneur est un role="radiogroup" (choix
// exclusif d'un thème) ; chaque option porte aria-checked. Les thèmes de confort
// sont niv 1 → toujours débloqués, donc jamais de cadenas (réservé aux récompenses).
function themeSwatch(t: Theme, courant: string, debloques: string[]): string {
	if (!debloques.includes(t.id)) {
		return `<span class="theme-opt theme-${t.id} locked" role="radio" aria-checked="false" aria-disabled="true" title="Débloqué au niveau ${t.niveau}">
        <span class="theme-dot"></span><span class="theme-lab">${t.label}</span>
        <span class="theme-lock">${icon('lock')} Niv ${t.niveau}</span></span>`;
	}
	const actif = t.id === courant;
	// Thème actif : la coche double l'indice de bordure colorée (pas de signal par
	// la seule couleur — a11y / daltonisme).
	const coche = actif ? `<span class="theme-check">${icon('check')}</span>` : '';
	// Le thème automatique pointe vers sa ligne d'aide (comportement non évident).
	const describedby = t.id === 'auto' ? ` aria-describedby="${HINT_AUTO_ID}"` : '';
	return `<button class="theme-opt theme-${t.id}${actif ? ' current' : ''}" role="radio" aria-checked="${actif ? 'true' : 'false'}" data-act="set-theme" data-theme="${t.id}"${describedby} title="${actif ? 'Thème actuel' : 'Choisir ce thème'}">
      <span class="theme-dot"></span><span class="theme-lab">${t.label}</span>${coche}</button>`;
}

/* Bloc « Niveau scolaire » (réglage parent, #225 lot 4) : classe du profil +
   ajustement optionnel par matière. Affiché seulement si plusieurs niveaux ont du
   contenu (sinon aucun choix utile). Vocabulaire neutre (« CE2 / CM1 »), jamais
   présenté comme un score, distinct du niveau d'XP. */
function niveauParentHTML(): string {
	const niveaux = availableLevels(getAllLessons());
	if (niveaux.length < 2) return '';
	const ref = getNiveauReference() ?? niveaux[0];
	const parMat = getNiveauParMatiere();
	const opts = (sel: string | undefined) =>
		niveaux
			.map(
				(lv) => `<option value="${lv}"${lv === sel ? ' selected' : ''}>${LEVEL_LABEL[lv]}</option>`,
			)
			.join('');
	const matieres = SUBJECTS.map(
		(s) => `<label class="pref-niveau-row">
          <span>${escapeHTML(s.label)}</span>
          <select class="pref-niveau-select" data-act="set-niveau-matiere" data-subject="${s.id}">
            <option value=""${parMat[s.id] ? '' : ' selected'}>Comme la classe</option>
            ${opts(parMat[s.id])}
          </select>
        </label>`,
	).join('');
	return `<div class="pref-block">
      <span class="pref-lab">${icon('book-open')} Classe scolaire <small class="pref-hint">(réglage parent)</small></span>
      <div class="pref-niveau">
        <label class="pref-niveau-row">
          <span><strong>Classe</strong></span>
          <select class="pref-niveau-select" id="prefNiveauRef">${opts(ref)}</select>
        </label>
        ${matieres}
      </div>
      <p class="pref-hint">« Comme la classe » suit la classe choisie ; ajuste une matière si besoin.</p>
    </div>`;
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
	// Deux sections : confort (Forêt / Nuit / Clair-obscur, sans cadenas) et
	// récompenses (thèmes de couleur gatés, cadenas conservé).
	const confort = THEMES.filter((t) => t.confort).map((t) => themeSwatch(t, courant, debloques));
	const recompenses = THEMES.filter((t) => !t.confort).map((t) =>
		themeSwatch(t, courant, debloques),
	);
	el.innerHTML = `<h3 class="pref-h">Préférences de ${escapeHTML(p.name)}</h3>
    <div class="pref-block">
      <span class="pref-lab">${icon('palette')} Thème</span>
      <div class="theme-section">
        <span class="theme-section-lab">Apparence</span>
        <div class="theme-palette" role="radiogroup" aria-label="Choisir un thème d'apparence">${confort.join('')}</div>
        <p class="pref-hint theme-hint" id="${HINT_AUTO_ID}"><strong>Clair-obscur</strong> suit ton appareil : il devient clair ou sombre tout seul.</p>
      </div>
      <div class="theme-section">
        <span class="theme-section-lab">${icon('lock')} Thèmes à débloquer</span>
        <div class="theme-palette" role="radiogroup" aria-label="Choisir un thème de couleur à débloquer">${recompenses.join('')}</div>
      </div>
    </div>
    ${niveauParentHTML()}
    <div class="pref-block">
      <span class="pref-lab">${icon('eye')} Accessibilité</span>
      <div class="pref-toggles">
        <label class="pref-toggle">
          <input type="checkbox" id="prefAnim"${animationsReduites() ? ' checked' : ''} />
          <span>Réduire les animations</span>
        </label>
        <label class="pref-toggle">
          <input type="checkbox" id="prefConfort"${confortLecture() ? ' checked' : ''} />
          <span>Confort de lecture <small class="pref-hint">(texte plus grand et plus aéré)</small></span>
        </label>
        <div class="pref-toggle-tts">
          <label class="pref-toggle${dispoVoix ? '' : ' pref-toggle-off'}">
            <input type="checkbox" id="prefLectureAuto"${lectureConsigneAuto() ? ' checked' : ''}${dispoVoix ? '' : ' disabled'} />
            <span>Lire la consigne à voix haute automatiquement</span>
          </label>
          <p class="pref-tts-statut">${
						dispoVoix
							? `${icon('speaker')} Lecture vocale disponible sur cet appareil.`
							: `${icon('speaker')} Lecture vocale indisponible sur cet appareil (aucune voix française).`
					}</p>
        </div>
      </div>
    </div>`;
}
