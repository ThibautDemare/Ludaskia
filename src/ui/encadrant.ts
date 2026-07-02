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
     - `encadrant-reglages`  : classe + aménagements ;
     - `encadrant-profils`   : liste, gestion, sauvegarde.
   La logique de données vit dans core/ (encadrant-stats.ts, encadrant-lock.ts).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { listProfiles, activeProfile } from '../core/profiles';
import { progressionProfil } from '../core/encadrant-stats';
import { initEncadrantCommun, container, consulteUuid, setConsulteUuid } from './encadrant-commun';
import {
	pinView,
	resetPin,
	renderGate,
	renderRecovery,
	pinPanelHTML,
	pinKeydown,
	pinClick,
	pinChange,
} from './encadrant-pin';
import { recapHTML, progressionClick } from './encadrant-progression';
import { reglagesHTML, reglagesChange } from './encadrant-reglages';
import { profilsHTML, sauvegardeHTML, profilsClick } from './encadrant-profils';

/* ---------- Point d'entrée (appelé par navigation.showEncadrantView) ---------- */
export function enterEncadrant(el: HTMLElement): void {
	initEncadrantCommun(el, rerender, renderEspace);
	wireOnce(el);
	// Profil consulté par défaut = l'enfant actif (celui qui a passé l'appareil).
	setConsulteUuid(activeProfile()?.uuid ?? null);
	resetPin(); // réinitialise l'état transitoire du verrou + calcule la vue initiale
	rerender();
}

function wireOnce(el: HTMLElement): void {
	if (el.dataset.wired) return;
	el.addEventListener('click', onClick);
	el.addEventListener('change', onChange);
	el.addEventListener('keydown', onKeydown);
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

/* Espace (consultation + réglages) : composé à partir des modules de section. */
function renderEspace(): void {
	const el = container();
	if (!el) return;
	const profiles = listProfiles();
	const actif = activeProfile();
	const consulte = profiles.find((p) => p.uuid === consulteUuid()) ?? actif;
	if (!consulte || !actif) return;
	const recap = progressionProfil(consulte, Date.now());
	el.innerHTML = `
    <div class="enc-topbar">
      <button type="button" class="enc-back" data-act="retour">
        <span aria-hidden="true">←</span> Retour à ${escapeHTML(actif.name)}
        <span class="enc-back-emoji" aria-hidden="true">${escapeHTML(actif.emoji)}</span>
      </button>
    </div>
    <h1 class="enc-title">Espace encadrants</h1>
    ${profilsHTML(profiles, consulte, actif)}
    ${recapHTML(recap, consulte)}
    ${reglagesHTML(consulte, pinPanelHTML())}
    ${sauvegardeHTML()}`;
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
	if (pinClick(act, el)) return;
	if (profilsClick(act, el)) return;
	progressionClick(act, el);
}

function onChange(e: Event): void {
	const t = e.target as HTMLInputElement | HTMLSelectElement;
	const act = (t as HTMLElement).dataset.act ?? '';
	if (reglagesChange(act, t)) return;
	pinChange(act, t);
}

function onKeydown(e: KeyboardEvent): void {
	pinKeydown(e);
}
