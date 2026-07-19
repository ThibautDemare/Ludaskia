/* ============================================================
   Aide contextuelle des exercices (#272) — couche UI.
   Deux points d'entrée pour chaque runner à mécanique non intuitive
   (tuiles numération, ranger une suite, ranger par thème, atelier du mot,
   remettre les lettres dans l'ordre) :

   - `monterBoutonAide(conteneur, type)` : pose un bouton « ampoule » PERSISTANT
     dans l'en-tête de l'exercice (rappel permanent, à tout moment) ;
   - `maybeAutoAide(type)` : affiche l'aide AUTOMATIQUEMENT au 1er lancement, une
     seule fois par profil (cf. core/aide), JAMAIS en mode chronométré.

   Les deux ouvrent la même mini-modale a11y (réutilise `activateModal` :
   focus-trap, arrière-plan inerte, Échap, restauration du focus). La modale est
   triviale à écarter (bouton « J'ai compris ! », croix, Échap, tap-dehors) et
   lue par le TTS à la demande (auto seulement si le profil a activé la lecture
   auto). La MASCOTTE accompagne l'enfant (elle « présente » l'aide), et chaque
   geste est montré par une ANIMATION faite-main (un doigt exécute le geste, pas
   à pas) jouée UNE fois à l'ouverture, rejouable via le bouton « Revoir ». Tout
   mouvement est neutralisé sous `prefers-reduced-motion` / « Réduire les
   animations » (cf. styles) : la scène se fige alors sur l'état final, lisible.
   ============================================================ */
import { AIDES, aideVue, marquerAideVue, texteTtsAide, type TypeAide } from '../core/aide';
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import { activateModal } from './modal-a11y';
import { dicteeDisponible, dicterConsigne, stopTts } from './tts';
import { lectureConsigneAuto } from '../core/profiles';
import { mascotteBulleHTML } from './unlocks-view';
import { getCurrentMode } from './navigation';

let ouverte = false; // une seule aide à la fois (évite l'empilement auto + clic)

// Le doigt qui exécute le geste dans les animations (icône Phosphor).
const FINGER = `<span class="an-finger" aria-hidden="true">${icon('hand-pointing')}</span>`;
// Phrase de la mascotte qui accompagne l'enfant (elle « présente » l'aide).
const MASCOTTE_LIGNE = 'Je te montre, regarde bien !';

/* Illustration ANIMÉE du geste (scène décorative `aria-hidden` : le sens est porté
   par le texte des étapes). Chaque scène montre un doigt qui exécute le geste pas
   à pas, jouée UNE fois (classe `is-anim`) et rejouable via « Revoir » ; figée sur
   l'état final sous mouvement réduit (cf. styles). Éléments en position absolue dans
   une scène de taille fixe pour un placement net. Un seul `#aideAnim` par modale. */
function illustrationHTML(type: TypeAide): string {
	switch (type) {
		case 'tuiles':
			// Le doigt prend la tuile « 7 » et la pose dans la case vide.
			return `<div class="aide-anim aide-anim--tuiles is-anim" id="aideAnim">
				<span class="an-slot"></span>
				<span class="an-tile">7</span>
				${FINGER}
			</div>`;
		case 'ordre':
			// Le doigt range deux mots dans les cases numérotées, dans l'ordre.
			return `<div class="aide-anim aide-anim--ordre is-anim" id="aideAnim">
				<span class="an-case an-case--1"><i>1</i></span>
				<span class="an-case an-case--2"><i>2</i></span>
				<span class="an-word an-word--1">arbre</span>
				<span class="an-word an-word--2">balle</span>
				${FINGER}
			</div>`;
		case 'tri':
			// Le doigt touche « chat », puis sa colonne ; le mot s'y déplace.
			return `<div class="aide-anim aide-anim--tri is-anim" id="aideAnim">
				<span class="an-col an-col--a"><b>Animaux</b></span>
				<span class="an-col an-col--b"><b>Fruits</b></span>
				<span class="an-word an-chat">chat</span>
				${FINGER}
			</div>`;
		case 'lettres':
			// Lettres du bac MÉLANGÉES (a · t · r) : le doigt les touche dans le bon
			// ordre (r → a → t), le mot « rat » se construit, PUIS le doigt touche une
			// lettre posée (« a ») qui se sélectionne et montre ses contrôles ◀ ▶ ↩.
			return `<div class="aide-anim aide-anim--lettres is-anim" id="aideAnim">
				<span class="an-edit"><span>◀</span><span>▶</span><span>↩</span></span>
				<span class="an-built an-built--1">r</span>
				<span class="an-built an-built--2">a</span>
				<span class="an-built an-built--3">t</span>
				<span class="an-letter an-letter--a">a</span>
				<span class="an-letter an-letter--t">t</span>
				<span class="an-letter an-letter--r">r</span>
				${FINGER}
			</div>`;
		case 'atelier':
			// « bateau », piège « eau » : le doigt glisse sur le groupe, le surlignage se trace.
			return `<div class="aide-anim aide-anim--atelier is-anim" id="aideAnim">
				<div class="aide-demo-mot">
					<span>b</span><span>a</span><span>t</span><span class="aide-demo-grp">
						<span class="aide-demo-hl"></span>
						<span>e</span><span>a</span><span>u</span>
						<span class="aide-demo-doigt">${icon('hand-pointing')}</span>
					</span>
				</div>
			</div>`;
		case 'tableau':
			// Exemple ILLUSTRATIF, non interactif (avis specialiste-troubles-apprentissage :
			// ne jamais pré-remplir la vraie question) : « 3 km = 3000 m » déjà rempli, les
			// zéros de transit (hm, dam) bien visibles dans des cases en pointillés.
			return `<div class="aide-anim aide-anim--tableau" id="aideAnim">
				<p class="tc-demo-q">3 km = 3000 m</p>
				<div class="tc-demo">
					<span class="tc-demo-cell"><b>km</b>3</span>
					<span class="tc-demo-cell tc-demo-cell--transit"><b>hm</b>0</span>
					<span class="tc-demo-cell tc-demo-cell--transit"><b>dam</b>0</span>
					<span class="tc-demo-cell"><b>m</b>0</span>
				</div>
			</div>`;
		case 'appariement':
			// Le doigt touche « dent » à gauche, puis « dentiste » à droite : un trait les relie.
			return `<div class="aide-anim aide-anim--appariement is-anim" id="aideAnim">
				<span class="an-mot an-mot--g">dent</span>
				<span class="an-mot an-mot--d">dentiste</span>
				<span class="an-lien"></span>
				${FINGER}
			</div>`;
		case 'clicMot':
			// Mini-phrase « Léa a chanté hier » : le doigt tape « a » puis « chanté » (le verbe
			// au passé composé = 2 mots collés). Les deux jetons restent sélectionnés ENSEMBLE
			// (moment « deux mots »), « Léa »/« hier » restent inchangés (décoys avant/après).
			return `<div class="aide-anim aide-anim--clicmot is-anim" id="aideAnim">
				<span class="an-clicmot-tok an-clicmot-tok--1">Léa</span>
				<span class="an-clicmot-tok an-clicmot-tok--2">a</span>
				<span class="an-clicmot-tok an-clicmot-tok--3">chanté</span>
				<span class="an-clicmot-tok an-clicmot-tok--4">hier</span>
				${FINGER}
			</div>`;
	}
}

/** Ouvre la mini-modale d'aide pour un type d'exercice. `restoreFocusTo` fournit
    un repli de focus quand l'aide est ouverte sans déclencheur (auto-affichage). */
export function ouvrirAide(
	type: TypeAide,
	opts: { trigger?: HTMLElement | null; restoreFocusTo?: () => HTMLElement | null } = {},
): void {
	if (ouverte) return;
	ouverte = true;
	const a = AIDES[type];
	const ttsDispo = dicteeDisponible();

	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';
	overlay.id = 'aideOverlay';
	overlay.innerHTML = `
		<div class="modal aide-modal" role="dialog" aria-modal="true" aria-labelledby="aideTitle">
			<button type="button" class="modal-close aide-close" aria-label="Fermer l'aide">${icon('x')}</button>
			${mascotteBulleHTML(MASCOTTE_LIGNE)}
			<h2 class="modal-title aide-titre" id="aideTitle">${escapeHTML(a.titre)}</h2>
			<div class="aide-illu-wrap" aria-hidden="true">${illustrationHTML(type)}</div>
			<button type="button" class="aide-revoir" aria-hidden="true" tabindex="-1">${icon('repeat')}<span>Revoir</span></button>
			<ol class="aide-etapes">${a.etapes.map((e) => `<li>${escapeHTML(e)}</li>`).join('')}</ol>
			${a.alternative ? `<p class="aide-alt">${escapeHTML(a.alternative)}</p>` : ''}
			${a.reparation ? `<p class="aide-repar">${escapeHTML(a.reparation)}</p>` : ''}
			${
				ttsDispo
					? `<button type="button" class="modal-listen aide-listen" aria-label="Écouter l'aide" title="Écouter l'aide">${icon('speaker')}<span class="aide-listen-lab">Écouter</span></button>`
					: ''
			}
			<button type="button" class="modal-ok aide-ok">J'ai compris !</button>
		</div>`;
	document.body.appendChild(overlay);

	const ok = overlay.querySelector<HTMLButtonElement>('.aide-ok')!;
	const release = activateModal(overlay, {
		trigger: opts.trigger ?? null,
		onEscape: () => fermer(),
		initialFocus: ok,
		restoreFocusTo: opts.restoreFocusTo,
	});

	function fermer(): void {
		stopTts();
		release();
		overlay.remove();
		ouverte = false;
	}
	ok.addEventListener('click', fermer);
	overlay.querySelector('.aide-close')!.addEventListener('click', fermer);
	// Tap en dehors de la carte : la modale reste lisible mais s'écarte d'un geste.
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) fermer();
	});

	// « Revoir » : rejoue l'animation (la retire puis la ré-applique après reflow).
	const anim = overlay.querySelector<HTMLElement>('#aideAnim');
	overlay.querySelector('.aide-revoir')?.addEventListener('click', () => {
		if (!anim) return;
		anim.classList.remove('is-anim');
		void anim.offsetWidth; // force le reflow pour relancer l'animation CSS
		anim.classList.add('is-anim');
	});

	// TTS : lecture à la demande ; automatique seulement si le profil l'a activée.
	const listen = overlay.querySelector<HTMLButtonElement>('.aide-listen');
	if (listen) {
		const lire = (): void => {
			listen.classList.add('speaking');
			dicterConsigne(texteTtsAide(type), () => listen.classList.remove('speaking'));
		};
		listen.addEventListener('click', lire);
		if (lectureConsigneAuto()) lire();
	}
}

/** Pose le bouton « ampoule » d'aide dans le conteneur d'en-tête (idempotent).
    `conteneur` doit être en `position: relative` (le bouton se cale en haut-droite). */
export function monterBoutonAide(conteneur: HTMLElement | null, type: TypeAide): void {
	if (!conteneur || conteneur.querySelector('.aide-btn')) return;
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'aide-btn';
	// L'étiquette reprend le titre du type (le lecteur d'écran annonce l'aide précise).
	btn.setAttribute('aria-label', `Aide : ${AIDES[type].titre}`);
	btn.title = 'Comment jouer ?';
	btn.innerHTML = icon('lightbulb');
	btn.addEventListener('click', () => ouvrirAide(type, { trigger: btn }));
	conteneur.appendChild(btn);
}

/** Affiche l'aide AUTOMATIQUEMENT au 1er lancement (une fois par profil), sauf en
    mode chronométré (Sprint) où une bulle déconcentrerait et grignoterait le temps. */
export function maybeAutoAide(type: TypeAide): void {
	const m = getCurrentMode();
	if (m === 'complet' || m === 'express') return; // jamais sous chrono
	if (aideVue(type)) return;
	marquerAideVue(type);
	// Ouverture sans déclencheur : à la fermeture, on rend le focus au bouton d'aide
	// de l'exercice plutôt qu'au <body> (contexte préservé au clavier / lecteur d'écran).
	ouvrirAide(type, { restoreFocusTo: () => document.querySelector<HTMLElement>('.aide-btn') });
}
