/* ============================================================
   Espace encadrant (#234, découpage #354) — VERROU par code (porte PIN).
   ------------------------------------------------------------
   Concentre les responsabilités liées au code d'accès optionnel : porte PIN
   (`gate`) et pavé numérique, écran de récupération (`recovery`), et le bloc
   « Code d'accès » des réglages (activer / saisir / clé de récupération / désactiver).
   Possède l'état du verrou et la VUE courante (`gate` / `recovery` / `espace`), que
   l'orchestrateur lit via `pinView()` pour aiguiller le re-rendu. La logique de
   données (hachage, persistance) vit dans core/encadrant-lock.
   ============================================================ */
import {
	pinActif,
	definirPin,
	verifierPin,
	reinitViaRecuperation,
	desactiverPin,
} from '../core/encadrant-lock';

import { uiConfirm } from './ui-modal';
import { container, rerender, renderEspace, telechargerBlob } from './encadrant-commun';
import { html, type SafeHtml, joindre, drapeau } from '../core/html';

/* ---------- État du verrou (module) ---------- */
let deverrouille = false; // PIN validé pour cette session de page
let vue: 'gate' | 'recovery' | 'espace' = 'espace';
let pinBuffer = ''; // chiffres saisis au pavé
let pinErreur = false; // « mauvais code » (gate)
let recoveryErreur = false; // clé de récupération invalide
let pinPanel: 'none' | 'saisie' | 'secret' = 'none'; // sous-panneau « code » des réglages
let pinSecret: string | null = null; // secret de récupération à afficher une fois
let secretConserve = false; // case « j'ai conservé ma clé »

/* Vue courante, lue par l'orchestrateur pour aiguiller le re-rendu. */
export function pinView(): 'gate' | 'recovery' | 'espace' {
	return vue;
}

/* Réinitialise l'état transitoire du verrou et calcule la vue initiale (appelé à
   chaque entrée dans l'espace). `deverrouille` PERSISTE d'une entrée à l'autre pour
   la session de page : porte affichée seulement si un code est actif et non déverrouillé. */
export function resetPin(): void {
	pinPanel = 'none';
	pinBuffer = '';
	pinErreur = false;
	recoveryErreur = false;
	secretConserve = false;
	pinSecret = null;
	vue = pinActif() && !deverrouille ? 'gate' : 'espace';
}

/* Referme le sous-panneau « code » des réglages (utilisé quand on change de profil
   consulté, cf. `encadrant-profils`). */
export function resetPinPanel(): void {
	pinPanel = 'none';
}

/* Le pavé est-il affiché (porte OU définition d'un code) ? */
function pavePresent(): boolean {
	return vue === 'gate' || (vue === 'espace' && pinPanel === 'saisie');
}

/* Saisie au CLAVIER PHYSIQUE du pavé (a11y) : chiffres + Effacement, quand le pavé
   est affiché et que le focus n'est pas dans un champ texte/sélecteur. */
export function pinKeydown(e: KeyboardEvent): void {
	if (!pavePresent()) return;
	if ((e.target as HTMLElement).closest('input, select, textarea')) return;
	if (/^\d$/.test(e.key)) {
		e.preventDefault();
		onKp(e.key);
	} else if (e.key === 'Backspace') {
		e.preventDefault();
		pinBuffer = pinBuffer.slice(0, -1);
		rerender();
		restoreKpFocus();
	}
}

/* Restaure le focus sur le pavé après un re-rendu (qui recrée tout l'innerHTML, donc
   détruit le bouton focalisé) : sur la touche pressée si fournie, sinon la 1re touche. */
function restoreKpFocus(preferD?: string): void {
	const el = container();
	if (!el || !pavePresent()) return;
	const sel = preferD ? `.kp-key[data-d="${preferD}"]` : '.kp-key';
	(el.querySelector(sel) as HTMLElement | null)?.focus({ preventScroll: true });
}

/* ---------- Pavé numérique (porte + définition de code) ---------- */
function keypadHTML(): SafeHtml {
	const dots = joindre(
		Array.from(
			{ length: 4 },
			(_, i) => html`<span class="kp-dot${i < pinBuffer.length ? drapeau('filled') : ''}"></span>`,
		),
	);
	const keys = joindre(
		['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(
			(d) => html`<button type="button" class="kp-key" data-act="kp" data-d="${d}">${d}</button>`,
		),
	);
	return html`<div class="kp">
      <div class="kp-dots${pinErreur ? ' kp-shake' : ''}" role="status" aria-live="polite" aria-label="${pinBuffer.length} chiffre${pinBuffer.length > 1 ? 's' : ''} sur 4">${dots}</div>
      <div class="kp-grid">
        ${keys}
        <span class="kp-spacer" aria-hidden="true"></span>
        <button type="button" class="kp-key" data-act="kp" data-d="0">0</button>
        <button type="button" class="kp-key kp-del" data-act="kp-del" aria-label="Effacer">⌫</button>
      </div>
    </div>`;
}

/* ---------- Rendus plein écran (porte + récupération) ---------- */
export function renderGate(): void {
	const el = container();
	if (!el) return;
	el.innerHTML = html`<div class="enc-gate">
      <h1 class="enc-title">Espace encadrants</h1>
      <p class="enc-gate-hint">Entrez votre code à 4 chiffres.</p>
      ${pinErreur ? html`<p class="enc-gate-err" role="alert">Ce n'est pas le bon code.</p>` : ''}
      ${keypadHTML()}
      <div class="enc-gate-links">
        <button type="button" class="enc-link" data-act="oubli">J'ai oublié mon code</button>
        <button type="button" class="enc-link" data-act="retour">Retour</button>
      </div>
    </div>`.balisage;
	// Focus initial dans le pavé : la saisie au clavier physique marche d'emblée.
	if (!pinBuffer)
		(el.querySelector('.kp-key') as HTMLElement | null)?.focus({ preventScroll: true });
}

export function renderRecovery(): void {
	const el = container();
	if (!el) return;
	el.innerHTML = html`<div class="enc-gate">
      <h1 class="enc-title">Réinitialiser le code</h1>
      <p class="enc-gate-hint">Saisissez votre clé de récupération (fournie quand vous avez créé le code).</p>
      ${recoveryErreur ? html`<p class="enc-gate-err" role="alert">Cette clé ne correspond pas.</p>` : ''}
      <input type="text" class="enc-input" id="encRecovery" placeholder="Clé de récupération" aria-label="Clé de récupération" autocomplete="off" spellcheck="false" />
      <div class="enc-gate-links">
        <button type="button" class="enc-btn" data-act="recovery-valider">Valider</button>
        <button type="button" class="enc-link" data-act="gate-retour">Annuler</button>
      </div>
    </div>`.balisage;
	(el.querySelector('#encRecovery') as HTMLInputElement | null)?.focus();
}

/* ---------- Bloc « Code d'accès » des réglages ---------- */
export function pinPanelHTML(): SafeHtml {
	// Sous-panneau « secret de récupération » (après définition d'un code).
	if (pinPanel === 'secret' && pinSecret) {
		return html`<div class="enc-block enc-pin">
        <h3 class="enc-h3">Votre clé de récupération</h3>
        <p class="enc-warn"><strong>Conservez bien cette clé.</strong> Si vous perdez à la fois votre code
          <em>et</em> cette clé, l'accès à cet espace sera définitivement perdu (aucune autre façon de le rouvrir).</p>
        <code class="enc-secret">${pinSecret}</code>
        <div class="enc-actions">
          <button type="button" class="enc-btn-sec" data-act="secret-copier">Copier</button>
          <button type="button" class="enc-btn-sec" data-act="secret-telecharger">Télécharger (.txt)</button>
        </div>
        <label class="enc-check"><input type="checkbox" data-act="secret-conserve"${secretConserve ? drapeau('checked') : ''} /> J'ai conservé ma clé de récupération.</label>
        <button type="button" class="enc-btn" data-act="pin-terminer"${secretConserve ? '' : drapeau('disabled')}>Terminer</button>
      </div>`;
	}
	// Sous-panneau « choisir un code » (pavé numérique).
	if (pinPanel === 'saisie') {
		return html`<div class="enc-block enc-pin">
        <h3 class="enc-h3">Choisissez un code à 4 chiffres</h3>
        ${keypadHTML()}
        <button type="button" class="enc-link" data-act="pin-annuler">Annuler</button>
      </div>`;
	}
	// État courant du verrou.
	if (pinActif()) {
		return html`<div class="enc-block enc-pin">
        <h3 class="enc-h3">Code d'accès</h3>
        <p class="enc-hint">Un code à 4 chiffres est demandé pour entrer dans cet espace.</p>
        <button type="button" class="enc-btn-sec" data-act="pin-desactiver">Désactiver le code</button>
      </div>`;
	}
	return html`<div class="enc-block enc-pin">
      <h3 class="enc-h3">Code d'accès (optionnel)</h3>
      <p class="enc-hint">Vous pouvez exiger un code à 4 chiffres pour entrer ici. C'est un garde-fou contre une
        modification accidentelle par l'enfant, pas une protection forte : pour verrouiller vraiment l'appareil,
        utilisez ses contrôles parentaux.</p>
      <button type="button" class="enc-btn-sec" data-act="pin-activer">Activer un code</button>
    </div>`;
}

/* ---------- Saisie & résolution du code ---------- */
function onKp(d: string): void {
	if (!/^\d$/.test(d) || pinBuffer.length >= 4) return;
	pinBuffer += d;
	// Reflète le point saisi (y compris le 4e, AVANT la résolution asynchrone).
	rerender();
	restoreKpFocus(d);
	// 4 chiffres atteints → vérification (porte) ou définition (réglages) du code.
	if (pinBuffer.length === 4) onPinComplet(pinBuffer);
}

/* Code à 4 chiffres complété. Selon le contexte : vérifie le PIN (porte) ou définit
   un nouveau code (réglages). Asynchrone (hachage `crypto.subtle`) → on re-rend à la
   résolution. `saisi` est passé par valeur car `pinBuffer` est vidé entre-temps. */
function onPinComplet(saisi: string): void {
	if (vue === 'gate') {
		void verifierPin(saisi).then((ok) => {
			pinBuffer = '';
			if (ok) {
				deverrouille = true;
				vue = 'espace';
				pinErreur = false;
				rerender();
			} else {
				pinErreur = true;
				rerender();
				restoreKpFocus(); // mauvais code : on garde le focus dans le pavé pour réessayer
			}
		});
	} else if (vue === 'espace' && pinPanel === 'saisie') {
		void definirPin(saisi).then((secret) => {
			pinSecret = secret;
			pinPanel = 'secret';
			pinBuffer = '';
			renderEspace();
		});
	}
}

function onRecoveryValider(): void {
	const input = container()?.querySelector('#encRecovery') as HTMLInputElement | null;
	const val = input?.value ?? '';
	void reinitViaRecuperation(val).then((ok) => {
		if (ok) {
			// Verrou retiré : on entre, et l'encadrant peut définir un nouveau code.
			deverrouille = true;
			vue = 'espace';
			pinPanel = 'none';
			recoveryErreur = false;
		} else {
			recoveryErreur = true;
		}
		rerender();
	});
}

function onPinDesactiver(): void {
	void uiConfirm({
		title: 'Désactiver le code ?',
		message: "L'accès à cet espace ne sera plus protégé par un code.",
		confirmLabel: 'Désactiver le code',
	}).then((ok) => {
		if (ok) {
			desactiverPin();
			renderEspace();
		}
	});
}

function telechargerSecret(secret: string): void {
	const texte = `Clé de récupération — Espace encadrants (Ludaskia)\n\n${secret}\n\nÀ conserver précieusement : cette clé permet de réinitialiser votre code d'accès si vous l'oubliez. Si vous perdez à la fois le code et cette clé, l'accès à cet espace sera définitivement perdu.\n`;
	telechargerBlob(
		'ludaskia-cle-recuperation.txt',
		new Blob([texte], { type: 'text/plain;charset=utf-8' }),
	);
}

/* ---------- Handlers délégués (aiguillés par l'orchestrateur) ---------- */
export function pinClick(act: string, el: HTMLElement): boolean {
	switch (act) {
		case 'kp':
			onKp(el.dataset.d ?? '');
			return true;
		case 'kp-del':
			pinBuffer = pinBuffer.slice(0, -1);
			rerender();
			restoreKpFocus();
			return true;
		case 'oubli':
			vue = 'recovery';
			recoveryErreur = false;
			rerender();
			return true;
		case 'gate-retour':
			vue = 'gate';
			pinBuffer = '';
			pinErreur = false;
			rerender();
			return true;
		case 'recovery-valider':
			onRecoveryValider();
			return true;
		case 'pin-activer':
			pinPanel = 'saisie';
			pinBuffer = '';
			renderEspace();
			restoreKpFocus(); // focus dans le pavé (clavier physique)
			return true;
		case 'pin-annuler':
			pinPanel = 'none';
			pinBuffer = '';
			renderEspace();
			return true;
		case 'pin-desactiver':
			onPinDesactiver();
			return true;
		case 'pin-terminer':
			pinPanel = 'none';
			pinSecret = null;
			secretConserve = false;
			renderEspace();
			return true;
		case 'secret-copier':
			if (pinSecret) {
				try {
					navigator.clipboard?.writeText(pinSecret);
				} catch {
					/* presse-papiers indisponible : l'utilisateur peut télécharger */
				}
			}
			return true;
		case 'secret-telecharger':
			if (pinSecret) telechargerSecret(pinSecret);
			return true;
	}
	return false;
}

export function pinChange(act: string, t: HTMLInputElement | HTMLSelectElement): boolean {
	if (act === 'secret-conserve') {
		secretConserve = (t as HTMLInputElement).checked;
		renderEspace();
		return true;
	}
	return false;
}
