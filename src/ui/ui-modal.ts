/* ============================================================
   Modales custom accessibles (#230) — remplacent les dialogues NATIFS
   du navigateur (window.prompt / window.confirm / window.alert), qui
   cassent le thème de l'app, ignorent les préférences maison (confort
   de lecture, thèmes sombres, animations réduites) et mettent « OK » en
   avant sur une action destructive (un enfant impulsif clique avant de lire).

   UN SEUL endroit centralise TOUTE l'accessibilité :
   - role="dialog" / "alertdialog" + aria-modal + aria-labelledby/-describedby ;
   - focus-trap (Tab/Shift+Tab bouclent dans la modale) ;
   - ESC = Annuler (l'événement est CONSOMMÉ pour ne pas déclencher le handler
     ESC global de main.ts) ; clic extérieur = Annuler (jamais valider) ;
   - restauration du focus au déclencheur à la fermeture (repli explicite si le
     déclencheur a disparu — ex. profil supprimé — jamais <body>) ;
   - arrière-plan `inert` + scroll-lock du <body> ; une seule modale à la fois ;
   - lecture vocale (TTS) : bouton « Écouter » si une voix FR existe, lecture
     automatique à l'ouverture si le profil l'a activée (cf. ui/consigne-tts) ;
   - héritage du confort de lecture (classe posée sur <html> par applyPreferences).

   API : des Promesses, pour remplacer 1:1 les appels bloquants natifs.
     uiAlert(opts)   -> Promise<void>
     uiConfirm(opts) -> Promise<boolean>   (true = action confirmée)
     uiPrompt(opts)  -> Promise<string | null>   (null = annulé)
   + toast(message) : notification non bloquante (info légère), centralisée ici.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon, type IconName } from './icon';
import { dicteeDisponible, dicterConsigne, stopTts } from './tts';
import { lectureConsigneAuto } from '../core/profiles';

/* Une seule modale ouverte à la fois : ouvrir par-dessus une autre casserait le
   focus-trap et le scroll-lock. Les appels sont normalement séquentiels (chacun
   est `await`é) ; ce garde-fou couvre un appel concurrent accidentel. */
let activeOverlay: HTMLElement | null = null;

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const TITLE_ID = 'uimodal-title';
const DESC_ID = 'uimodal-desc';
const INPUT_ID = 'uimodal-input';
const ERROR_ID = 'uimodal-error';

/* ---------- Description interne d'une modale ---------- */
type Variant = 'primary' | 'secondary' | 'danger';

interface ModalButton {
	label: string;
	variant: Variant;
	value: unknown; // valeur résolue par la Promesse au clic
	icon?: IconName; // icône Phosphor (double le sens du libellé — jamais la couleur seule)
	submit?: boolean; // bouton de soumission du formulaire (activé par Entrée)
	initialFocus?: boolean; // reçoit le focus à l'ouverture
}

interface ModalConfig {
	role: 'dialog' | 'alertdialog';
	emoji?: string; // symbole décoratif en tête (cohérent avec les modales existantes)
	title: string;
	message?: string;
	fieldHTML?: string; // bloc de saisie optionnel (uiPrompt)
	buttons: ModalButton[];
	ttsText: string; // texte lu à voix haute (« Écouter » / lecture auto)
	cancelValue: unknown; // valeur résolue par ESC / clic extérieur
	submitValue?: unknown; // valeur résolue par la soumission par défaut (si pas d'onSubmit)
	onSubmit?: (modal: HTMLElement) => { value: unknown } | null; // null = garder ouvert (validation échouée)
	onOpen?: (modal: HTMLElement) => void; // câblage spécifique (champ de saisie)
	restoreFocusTo?: () => HTMLElement | null; // repli de focus si le déclencheur a disparu
}

/* ---------- Arrière-plan inerte + verrou de défilement ---------- */
/* Rend tout le reste du <body> non focusable / non lu par les technologies
   d'assistance, et bloque le défilement de la page derrière la modale. */
function lockBackground(overlay: HTMLElement): () => void {
	const inerted: HTMLElement[] = [];
	for (const child of Array.from(document.body.children)) {
		if (child === overlay) continue;
		const el = child as HTMLElement;
		if (el.hasAttribute('inert')) continue; // ne pas « libérer » plus tard ce qui l'était déjà
		el.setAttribute('inert', '');
		inerted.push(el);
	}
	const prevOverflow = document.body.style.overflow;
	document.body.style.overflow = 'hidden';
	return () => {
		inerted.forEach((el) => el.removeAttribute('inert'));
		document.body.style.overflow = prevOverflow;
	};
}

/* ---------- Focus ---------- */
function visibleFocusables(modal: HTMLElement): HTMLElement[] {
	return [...modal.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
		(el) => el.offsetParent !== null || el === document.activeElement,
	);
}

/* Boucle le focus à l'intérieur de la modale (Tab depuis le dernier → premier,
   Shift+Tab depuis le premier → dernier). */
function trapTab(e: KeyboardEvent, modal: HTMLElement): void {
	const items = visibleFocusables(modal);
	if (!items.length) {
		e.preventDefault();
		return;
	}
	const first = items[0];
	const last = items[items.length - 1];
	const active = document.activeElement as HTMLElement | null;
	if (e.shiftKey && (active === first || !modal.contains(active))) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && (active === last || !modal.contains(active))) {
		e.preventDefault();
		first.focus();
	}
}

/* Rend le focus au déclencheur ; s'il a disparu (re-rendu, profil supprimé),
   repli explicite fourni par l'appelant — jamais <body> (qui ferait perdre le
   contexte au lecteur d'écran). */
function restoreFocus(trigger: HTMLElement | null, fallback?: () => HTMLElement | null): void {
	if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') {
		trigger.focus();
		return;
	}
	fallback?.()?.focus?.();
}

/* ---------- Lecture vocale ---------- */
function speak(btn: HTMLElement, texte: string): void {
	btn.classList.add('speaking');
	dicterConsigne(texte, () => btn.classList.remove('speaking'));
}

/* ---------- Cœur : construit, affiche et résout une modale ---------- */
function openModal(cfg: ModalConfig): Promise<unknown> {
	if (activeOverlay) {
		console.warn('[ui-modal] Une modale est déjà ouverte ; appel ignoré.');
		return Promise.resolve(cfg.cancelValue);
	}

	const trigger = document.activeElement as HTMLElement | null;
	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';
	activeOverlay = overlay;

	const describedby = cfg.message ? ` aria-describedby="${DESC_ID}"` : '';
	const listenHTML = dicteeDisponible()
		? `<button type="button" class="modal-listen" aria-label="Écouter">${icon('speaker')}<span class="modal-listen-lab">Écouter</span></button>`
		: '';
	const buttonsHTML = cfg.buttons
		.map((b) => {
			const cls =
				b.variant === 'primary'
					? 'modal-ok'
					: b.variant === 'danger'
						? 'modal-danger'
						: 'modal-secondary';
			const ic = b.icon ? `${icon(b.icon)} ` : '';
			return `<button type="${b.submit ? 'submit' : 'button'}" class="${cls}"${
				b.initialFocus ? ' data-initial-focus' : ''
			}>${ic}${escapeHTML(b.label)}</button>`;
		})
		.join('');

	overlay.innerHTML = `
		<div class="modal modal-dialog" role="${cfg.role}" aria-modal="true" aria-labelledby="${TITLE_ID}"${describedby}>
			${cfg.emoji ? `<div class="modal-emoji" aria-hidden="true">${cfg.emoji}</div>` : ''}
			<h2 class="modal-title" id="${TITLE_ID}">${escapeHTML(cfg.title)}</h2>
			${cfg.message ? `<p class="modal-msg" id="${DESC_ID}">${escapeHTML(cfg.message)}</p>` : ''}
			${listenHTML}
			<form class="modal-form" novalidate>
				${cfg.fieldHTML ?? ''}
				<div class="modal-actions">${buttonsHTML}</div>
			</form>
		</div>`;
	document.body.appendChild(overlay);
	const modal = overlay.querySelector<HTMLElement>('.modal')!;
	const form = modal.querySelector<HTMLFormElement>('.modal-form')!;
	const unlock = lockBackground(overlay);

	return new Promise<unknown>((resolve) => {
		let settled = false;

		function onKeydown(e: KeyboardEvent): void {
			if (e.key === 'Escape') {
				// On consomme l'événement : sinon le handler ESC global (main.ts) se
				// déclencherait aussi (fermeture d'autres modales, etc.).
				e.preventDefault();
				e.stopPropagation();
				finish(cfg.cancelValue);
			} else if (e.key === 'Tab') {
				trapTab(e, modal);
			}
		}

		function finish(value: unknown): void {
			if (settled) return;
			settled = true;
			stopTts();
			document.removeEventListener('keydown', onKeydown, true);
			unlock();
			overlay.remove();
			if (activeOverlay === overlay) activeOverlay = null;
			restoreFocus(trigger, cfg.restoreFocusTo);
			resolve(value);
		}

		// Soumission (Entrée, ou clic sur le bouton primaire `submit`).
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			if (cfg.onSubmit) {
				const r = cfg.onSubmit(modal);
				if (r) finish(r.value); // sinon : validation échouée, on reste ouvert
			} else {
				finish(cfg.submitValue);
			}
		});

		// Boutons non-submit (annuler, action secondaire/dangereuse).
		const btnEls = [...modal.querySelectorAll<HTMLButtonElement>('.modal-actions button')];
		cfg.buttons.forEach((b, i) => {
			if (b.submit) return;
			btnEls[i].addEventListener('click', () => finish(b.value));
		});

		// Bouton « Écouter ».
		const listen = modal.querySelector<HTMLElement>('.modal-listen');
		if (listen) listen.addEventListener('click', () => speak(listen, cfg.ttsText));

		// Clic sur le voile = annuler. `mousedown` (pas `click`) pour ne pas fermer si
		// un glissement de sélection depuis l'intérieur du champ se relâche sur le voile.
		overlay.addEventListener('mousedown', (e) => {
			if (e.target === overlay) finish(cfg.cancelValue);
		});

		// Capture (true) pour passer AVANT le handler ESC global de main.ts.
		document.addEventListener('keydown', onKeydown, true);

		cfg.onOpen?.(modal);

		// Focus initial : l'élément désigné (action sûre / champ), sinon le 1er focusable.
		const initial =
			modal.querySelector<HTMLElement>('[data-initial-focus]') ??
			modal.querySelector<HTMLElement>(FOCUSABLE);
		initial?.focus();

		// Lecture vocale automatique à l'ouverture (opt-in profil), best-effort.
		if (listen && lectureConsigneAuto()) speak(listen, cfg.ttsText);
	});
}

/* ============================================================
   API publique
   ============================================================ */

export interface UiAlertOptions {
	title: string;
	message?: string;
	okLabel?: string;
	emoji?: string;
	/** Erreur → role="alertdialog" (le lecteur d'écran annonce titre + message). */
	variant?: 'info' | 'error';
	restoreFocusTo?: () => HTMLElement | null;
}

/** Remplace `window.alert`. Fermeture MANUELLE uniquement (jamais d'auto-dismiss). */
export function uiAlert(opts: UiAlertOptions): Promise<void> {
	const okLabel = opts.okLabel ?? "J'ai compris";
	return openModal({
		role: opts.variant === 'error' ? 'alertdialog' : 'dialog',
		emoji: opts.emoji,
		title: opts.title,
		message: opts.message,
		ttsText: [opts.title, opts.message].filter(Boolean).join('. '),
		buttons: [
			{ label: okLabel, variant: 'primary', value: undefined, submit: true, initialFocus: true },
		],
		cancelValue: undefined,
		submitValue: undefined,
		restoreFocusTo: opts.restoreFocusTo,
	}) as Promise<void>;
}

export interface UiConfirmOptions {
	title: string;
	message?: string;
	/** Libellé de l'action confirmée : verbe + objet (« Supprimer Léa »), jamais « OK ». */
	confirmLabel: string;
	/** Libellé de l'action SÛRE (focus initial, activée par Entrée). Défaut « Annuler ». */
	cancelLabel?: string;
	/** Action destructive : bouton confirmer en style danger + role="alertdialog". */
	destructive?: boolean;
	/** Icône Phosphor du bouton confirmer (corbeille / réinit…) — double le libellé. */
	confirmIcon?: IconName;
	emoji?: string;
	restoreFocusTo?: () => HTMLElement | null;
}

/** Remplace `window.confirm`. Résout `true` si l'action est confirmée, `false`
    sinon. Le choix SÛR domine (style primaire, focus initial, Entrée) ; jamais
    de validation d'une action dangereuse par défaut, ESC ou clic extérieur. */
export function uiConfirm(opts: UiConfirmOptions): Promise<boolean> {
	const cancelLabel = opts.cancelLabel ?? 'Annuler';
	return openModal({
		role: opts.destructive ? 'alertdialog' : 'dialog',
		emoji: opts.emoji,
		title: opts.title,
		message: opts.message,
		ttsText: [opts.title, opts.message, `${cancelLabel}, ou ${opts.confirmLabel}.`]
			.filter(Boolean)
			.join('. '),
		// Ordre DOM = ordre visuel/lecture : action SÛRE en premier (en haut, pleine
		// largeur sur mobile), puis l'action confirmée.
		buttons: [
			{ label: cancelLabel, variant: 'primary', value: false, submit: true, initialFocus: true },
			{
				label: opts.confirmLabel,
				variant: opts.destructive ? 'danger' : 'secondary',
				value: true,
				icon: opts.confirmIcon,
			},
		],
		cancelValue: false,
		submitValue: false,
		restoreFocusTo: opts.restoreFocusTo,
	}) as Promise<boolean>;
}

export interface UiPromptOptions {
	title: string;
	message?: string;
	okLabel?: string;
	cancelLabel?: string;
	defaultValue?: string;
	placeholder?: string;
	/** Message inline si le champ est vide à la validation. */
	emptyError?: string;
	/** Pré-sélectionne la valeur par défaut (renommage : remplacer d'un trait). */
	selectDefault?: boolean;
	emoji?: string;
	restoreFocusTo?: () => HTMLElement | null;
}

/** Remplace `window.prompt`. Résout la valeur saisie (non vide, `trim`ée) ou
    `null` si annulé. Entrée valide ; vide = message inline bienveillant + focus
    rendu au champ (la modale reste ouverte). */
export function uiPrompt(opts: UiPromptOptions): Promise<string | null> {
	const okLabel = opts.okLabel ?? 'Valider';
	const cancelLabel = opts.cancelLabel ?? 'Annuler';
	const emptyError = opts.emptyError ?? 'Écris quelque chose.';
	const fieldHTML = `
		<input
			type="text"
			id="${INPUT_ID}"
			class="modal-field"
			value="${escapeHTML(opts.defaultValue ?? '')}"
			${opts.placeholder ? `placeholder="${escapeHTML(opts.placeholder)}"` : ''}
			autocapitalize="words"
			autocomplete="off"
			autocorrect="off"
			spellcheck="false"
			enterkeyhint="done"
			aria-labelledby="${TITLE_ID}"
			aria-describedby="${ERROR_ID}"
		/>
		<p class="modal-field-error" id="${ERROR_ID}" role="alert" hidden></p>`;

	return openModal({
		role: 'dialog',
		emoji: opts.emoji,
		title: opts.title,
		message: opts.message,
		fieldHTML,
		ttsText: [opts.title, opts.message].filter(Boolean).join('. '),
		// Validation = bouton primaire (submit) ; Annuler = secondaire (renvoie null).
		buttons: [
			{ label: okLabel, variant: 'primary', value: undefined, submit: true },
			{ label: cancelLabel, variant: 'secondary', value: null },
		],
		cancelValue: null,
		onSubmit: (modal) => {
			const input = modal.querySelector<HTMLInputElement>(`#${INPUT_ID}`)!;
			const err = modal.querySelector<HTMLElement>(`#${ERROR_ID}`)!;
			const v = input.value.trim();
			if (!v) {
				err.textContent = emptyError;
				err.hidden = false;
				input.classList.add('invalid');
				input.focus();
				return null; // on garde la modale ouverte
			}
			return { value: v };
		},
		onOpen: (modal) => {
			const input = modal.querySelector<HTMLInputElement>(`#${INPUT_ID}`)!;
			// Le champ prend le focus (pas un bouton) ; pré-sélection en renommage.
			input.focus();
			if (opts.selectDefault && input.value) input.select();
			// Saisie → on efface l'erreur inline (retour bienveillant immédiat).
			input.addEventListener('input', () => {
				if (!input.classList.contains('invalid')) return;
				input.classList.remove('invalid');
				const err = modal.querySelector<HTMLElement>(`#${ERROR_ID}`)!;
				err.hidden = true;
			});
		},
		restoreFocusTo: opts.restoreFocusTo,
	}) as Promise<string | null>;
}

/* ============================================================
   Toast non bloquant (info légère) — centralisé ici (était dans ui/resume.ts).
   Apparaît brièvement en bas d'écran puis disparaît. À RÉSERVER aux infos qui
   n'exigent aucune décision (un message d'erreur ou de succès important passe
   par uiAlert, à fermeture manuelle).
   ============================================================ */
export function toast(message: string): void {
	const t = document.createElement('div');
	t.className = 'ui-toast';
	t.setAttribute('role', 'status');
	t.textContent = message;
	document.body.appendChild(t);
	setTimeout(() => t.classList.add('show'), 10);
	setTimeout(() => {
		t.classList.remove('show');
		setTimeout(() => t.remove(), 400);
	}, 3200);
}
