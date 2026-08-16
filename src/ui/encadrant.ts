/* ============================================================
   Espace encadrant (#234) — ORCHESTRATEUR (vue gatée dans app.html, #encadrant).
   ------------------------------------------------------------
   Zone réservée aux ADULTES (parents/enseignants), distincte de l'espace enfant :
   voix « vous », chrome neutre (cf. encadrant.scss), densité d'info plus élevée.
   On y CONSULTE la progression de chaque profil SANS changer le profil actif
   (progressionProfil lit par UUID) et on règle la classe / un code d'accès optionnel.

   Ce fichier ne garde que le POINT D'ENTRÉE (`enterEncadrant`), le câblage des
   listeners délégués (posés une fois sur #encadrantContent, idempotents) et le
   re-rendu (`rerender` aiguille la vue ; `renderEspace` compose l'espace à partir
   des modules de section). Le découpage par responsabilité (#354) vit dans :
     - `encadrant-commun`    : état de vue partagé + plomberie de rendu ;
     - `encadrant-pin`       : porte PIN, pavé, récupération, verrou ;
     - `encadrant-progression` : récap, graphe, maîtrise, à revoir ;
     - `encadrant-revision` : récap de la révision espacée (#423) ;
     - `encadrant-seance`   : composition du « programme du jour » (#440) ;
     - `encadrant-reglages`  : classe + aménagements ;
     - `encadrant-profils`   : liste, gestion, sauvegarde.
   La logique de données vit dans core/ (encadrant-stats.ts, encadrant-lock.ts).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { listProfiles, activeProfile, type Profile } from '../core/profiles';
import { progressionProfil, purgeRevoirSolides, type RecapProfil } from '../core/encadrant-stats';
import { icon } from './icon';
import { dicteeDisponible } from './tts';
import type { IconName } from '../core/icon-names';
import {
	initEncadrantCommun,
	container,
	consulteUuid,
	setConsulteUuid,
	activeTab,
	setActiveTab,
	type EncTab,
} from './encadrant-commun';
import {
	pinView,
	resetPin,
	renderGate,
	renderRecovery,
	pinPanelHTML,
	pinKeydown,
	pinClick,
	pinChange,
	resetPinPanel,
} from './encadrant-pin';
import {
	recapHTML,
	aRevoirHTML,
	dicteesProposeesHTML,
	progressionClick,
	progressionInput,
	progressionToggle,
} from './encadrant-progression';
import { revisionHTML, revisionClick } from './encadrant-revision';
import { seanceHTML, seanceClick, seanceChange } from './encadrant-seance';
import {
	reglagesHTML,
	reglagesChange,
	reglagesClick,
	reglagesApresRendu,
} from './encadrant-reglages';
import { profilsHTML, sauvegardeHTML, profilsClick } from './encadrant-profils';
import { selecteurClick, selecteurInput, selecteurToggle } from './selecteur-lecon';
import { segmentKeydown } from './segment';

/* Onglets de l'espace (#459), dans l'ordre de fréquence d'usage décroissante :
   observer (Suivi) → préparer (Programme) → configurer (Réglages) → gérer (Profils). */
const TABS: { id: EncTab; label: string; icon: IconName }[] = [
	{ id: 'suivi', label: 'Suivi', icon: 'eye' },
	{ id: 'programme', label: 'Programme', icon: 'calendar' },
	{ id: 'reglages', label: 'Réglages', icon: 'gear' },
	{ id: 'profils', label: 'Profils', icon: 'users' },
];
/* Source UNIQUE des identifiants d'onglet valides : dérivée de TABS (pas de liste
   parallèle à tenir synchronisée). Sert à valider le sous-chemin de hash. */
const TAB_IDS: string[] = TABS.map((t) => t.id);

/* Onglet lu depuis le hash (`#encadrant/<onglet>`) : permet le lien direct et la
   restauration au rechargement. Sous-chemin inconnu → Suivi (défaut). */
function tabFromHash(): EncTab {
	const sub = (location.hash || '').replace(/^#/, '').split('/')[1] ?? '';
	return TAB_IDS.includes(sub) ? (sub as EncTab) : 'suivi';
}

/* ---------- Point d'entrée (appelé par navigation.showEncadrantView) ---------- */
export function enterEncadrant(el: HTMLElement): void {
	initEncadrantCommun(el, rerender, renderEspace);
	wireOnce(el);
	// Profil consulté par défaut = l'enfant actif (celui qui a passé l'appareil).
	setConsulteUuid(activeProfile()?.uuid ?? null);
	setActiveTab(tabFromHash()); // onglet initial (lien direct / rechargement, #459)
	resetPin(); // réinitialise l'état transitoire du verrou + calcule la vue initiale
	rerender();
}

function wireOnce(el: HTMLElement): void {
	if (el.dataset.wired) return;
	el.addEventListener('click', onClick);
	el.addEventListener('change', onChange);
	el.addEventListener('input', onInput);
	el.addEventListener('keydown', onKeydown);
	// `toggle` d'un `<details>` : en CAPTURE, cet événement ne remontant pas dans tous les
	// navigateurs. Sert au bouton « Tout déplier » d'une matière (#521), qui doit refléter
	// l'état réel de ses catégories même quand elles sont ouvertes une à une à la main.
	el.addEventListener('toggle', onToggle, true);
	el.dataset.wired = '1';
}

/* Aiguille le re-rendu selon la vue courante (portée par le module pin). */
function rerender(): void {
	if (!container()) return;
	const vue = pinView();
	if (vue === 'gate') renderGate();
	else if (vue === 'recovery') renderRecovery();
	else renderEspace();
}

/* Espace (consultation + réglages) : en-tête de contexte (« qui je regarde ») +
   barre d'onglets + panneau de l'onglet actif (#459). Chaque section reste un module
   séparé : ici on ne fait que RÉPARTIR les fragments par onglet. */
function renderEspace(): void {
	const el = container();
	if (!el) return;
	const profiles = listProfiles();
	const actif = activeProfile();
	const consulte = profiles.find((p) => p.uuid === consulteUuid()) ?? actif;
	if (!consulte || !actif) return;
	const tab = activeTab();
	el.innerHTML = `
    <div class="enc-topbar">
      <button type="button" class="enc-back" data-act="retour">
        <span aria-hidden="true">←</span> Retour à ${escapeHTML(actif.name)}
        <span class="enc-back-emoji" aria-hidden="true">${escapeHTML(actif.emoji)}</span>
      </button>
    </div>
    <h1 class="enc-title">Espace encadrants</h1>
    <p class="enc-guide-link">
      Première visite&nbsp;? Le <a href="guide.html" target="_blank" rel="noopener">guide pour les parents<span class="sr-only"> (nouvel onglet)</span></a>
      explique à quoi sert chaque onglet.
    </p>
    ${contexteHTML(profiles, consulte, actif)}
    ${tabsNavHTML(tab)}
    <div class="enc-tabpanel" id="encTabPanel">${tabPanelHTML(tab, consulte, actif, profiles)}</div>`;
	// Sections dont le rendu demande une finition JS sur le DOM fraîchement posé
	// (état « indéterminé » des cases parentes, #478) : impossible en HTML seul.
	if (tab === 'reglages') reglagesApresRendu();
}

/* En-tête de contexte : « Vous consultez : [profil ▾] », transverse aux onglets Suivi
   et Programme (on ne le fusionne PAS avec « Retour à [actif] », qui nomme le joueur
   actif — deux notions distinctes). Le `<select>` natif est le picker le plus accessible
   sur mobile. Un seul profil → simple libellé (rien à choisir). Ce sélecteur est le
   commutateur PRINCIPAL (transverse aux onglets) ; les cartes de l'onglet Profils gardent
   leur bouton « Voir le suivi » comme affordance secondaire dans la liste de gestion
   (double affordance assumée en v1, cf. #459). */
function contexteHTML(profiles: Profile[], consulte: Profile, actif: Profile): string {
	const nomActif = (p: Profile) => (p.uuid === actif.uuid ? ' (joue en ce moment)' : '');
	if (profiles.length <= 1) {
		return `<div class="enc-context">
      <span class="enc-context-lab">Vous consultez :</span>
      <span class="enc-context-solo"><span aria-hidden="true">${escapeHTML(consulte.emoji)}</span> ${escapeHTML(consulte.name)}</span>
    </div>`;
	}
	const opts = profiles
		.map(
			(p) =>
				`<option value="${escapeHTML(p.uuid)}"${p.uuid === consulte.uuid ? ' selected' : ''}>${escapeHTML(
					p.emoji,
				)} ${escapeHTML(p.name)}${nomActif(p)}</option>`,
		)
		.join('');
	return `<div class="enc-context">
      <label class="enc-context-lab" for="encConsulteSel">Vous consultez :</label>
      <select id="encConsulteSel" class="enc-select-niveau enc-context-sel" data-act="set-consulte">${opts}</select>
    </div>`;
}

/* Barre d'onglets : navigation de SECTION (pas une bascule de vue). Volontairement
   distincte du composant segment interne (`.enc-act-modes`) — cf. encadrant.scss :
   ici l'actif est souligné, pas rempli. `<nav>` + `aria-current` (et non un widget
   tablist, dont le contrat clavier flèches serait plus lourd pour un gain nul). */
function tabsNavHTML(active: EncTab): string {
	const btns = TABS.map(
		(t) =>
			`<button type="button" class="enc-tab${t.id === active ? ' active' : ''}" data-act="enc-tab" data-tab="${t.id}"${
				t.id === active ? ' aria-current="page"' : ''
			}>${icon(t.icon)}<span class="enc-tab-lab">${t.label}</span></button>`,
	).join('');
	return `<nav class="enc-tabs" aria-label="Sections de l'espace encadrant">${btns}</nav>`;
}

/* Contenu de l'onglet actif. `recap` n'est calculé que pour les onglets qui l'utilisent. */
function tabPanelHTML(tab: EncTab, consulte: Profile, actif: Profile, profiles: Profile[]): string {
	// Nettoyage DUR de la file « à revoir » AVANT toute lecture (#465) : `progressionProfil`
	// et les lignes de détail du Suivi portent l'état « épinglée », qui serait périmé d'un
	// rendu si la purge n'intervenait qu'au moment de rendre « À revoir ensemble ».
	// Restreint aux onglets qui en affichent l'état : Réglages/Profils ne lisent pas la file,
	// une écriture en localStorage à leur rendu ne ferait que surprendre à la relecture.
	if (tab === 'suivi' || tab === 'programme')
		purgeRevoirSolides(consulte, dicteeDisponible(), Date.now());
	switch (tab) {
		case 'suivi': {
			const recap: RecapProfil = progressionProfil(consulte, Date.now());
			return `${recapHTML(recap, consulte)}${revisionHTML(consulte, Date.now())}`;
		}
		case 'programme': {
			const recap: RecapProfil = progressionProfil(consulte, Date.now());
			return `${seanceHTML(consulte)}${aRevoirHTML(recap, consulte)}${dicteesProposeesHTML(consulte)}`;
		}
		case 'reglages':
			return reglagesHTML(consulte, pinPanelHTML());
		case 'profils':
			return `${profilsHTML(profiles, consulte, actif)}${sauvegardeHTML()}`;
	}
}

/* ---------- Listeners délégués (aiguillés vers les modules de section) ---------- */
function onClick(e: Event): void {
	const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
	if (!el) return;
	const act = el.dataset.act ?? '';
	if (act === 'retour') {
		location.hash = 'accueil'; // rend la main à l'enfant actif (route → accueil)
		return;
	}
	if (act === 'enc-tab') {
		onTab(el.dataset.tab ?? '');
		return;
	}
	// Le sélecteur de leçon (#556) est composé par DEUX sections (programme, à revoir) :
	// ses actions internes (jetons de classe, recherche, plis) sont donc aiguillées ici,
	// avant elles — sinon chaque section devrait relayer les mêmes trois handlers.
	if (selecteurClick(act, el)) return;
	if (pinClick(act, el)) return;
	if (reglagesClick(act, el)) return;
	if (profilsClick(act, el)) return;
	if (revisionClick(act, el)) return;
	if (seanceClick(act, el)) return;
	progressionClick(act, el);
}

function onToggle(e: Event): void {
	const t = e.target;
	if (!(t instanceof HTMLElement)) return;
	if (selecteurToggle(t)) return; // groupe d'un sélecteur : son pli lui appartient
	progressionToggle(t);
}

function onChange(e: Event): void {
	const t = e.target as HTMLInputElement | HTMLSelectElement;
	const act = (t as HTMLElement).dataset.act ?? '';
	if (act === 'set-consulte') {
		setConsulteUuid(t.value); // bascule le profil consulté (≠ profil actif)
		resetPinPanel(); // referme un éventuel sous-panneau « code » ouvert
		renderEspace();
		return;
	}
	if (reglagesChange(act, t)) return;
	if (seanceChange(act, t)) return;
	pinChange(act, t);
}

/* Saisie AU FIL DE LA FRAPPE (≠ `change`, qui n'arrive qu'au blur) : les recherches — banque
   de mots (#496), sélecteur de leçon (#556) — doivent filtrer à chaque lettre. */
function onInput(e: Event): void {
	const t = e.target as HTMLElement;
	const act = t.dataset.act ?? '';
	if (selecteurInput(act, t)) return;
	progressionInput(act, t);
}

function onKeydown(e: KeyboardEvent): void {
	// Contrat clavier des boutons-segments (flèches / Home / End), transverse aux
	// sections : le composant vit dans ui/segment.ts, le câblage ici.
	if (segmentKeydown(e)) return;
	pinKeydown(e);
}

/* Change d'onglet : met à jour l'état, synchronise le hash SANS re-router (replaceState
   ne déclenche pas de hashchange → pas de ré-entrée qui réinitialiserait le profil
   consulté), re-rend, et rend le focus au nouvel onglet actif (le DOM a été recréé). */
function onTab(tab: string): void {
	if (!TAB_IDS.includes(tab)) return;
	setActiveTab(tab as EncTab);
	const cible = '#encadrant' + (tab === 'suivi' ? '' : '/' + tab);
	if (location.hash !== cible) history.replaceState(null, '', cible);
	renderEspace();
	(container()?.querySelector('.enc-tab.active') as HTMLElement | null)?.focus({
		preventScroll: true,
	});
}
