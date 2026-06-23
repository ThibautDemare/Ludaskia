/* ============================================================
   Point d'entrée (ES modules) : import des styles, initialisation
   dans l'ordre (hook d'écriture → profils → câblage DOM → route).
   ============================================================ */
import './styles/base.scss';
import './styles/themes.scss';
import './styles/toolbar.scss';
import './styles/home.scss';
import './styles/sheets.scss';
import './styles/gamification.scss';
import './styles/lessons.scss';
import './styles/figures.scss';
import './styles/profiles.scss';
import './styles/sprint.scss';
import './styles/lecon-mode.scss';
import './styles/revision.scss';
import './styles/modal.scss';
import './styles/reprise.scss';
import './styles/print.scss';
import './styles/bilan.scss';
import './styles/catalog.scss';
import './styles/francais.scss';
import './styles/orthographe.scss';
import './styles/version-update.scss';
import './styles/foret.scss';
import './styles/accessibility.scss';
import './styles/aide-exercice.scss';
import './styles/encadrant.scss';

import { setOnDataWrite } from './core/storage';
import {
	initProfiles,
	touchActiveProfile,
	renameProfile,
	setProfileEmoji,
	setActiveProfile,
	setPref,
	listProfiles,
} from './core/profiles';
import { uiConfirm, uiPrompt } from './ui/ui-modal';
import { renderProfiles, toggleEmojiPicker, closeEmojiPicker, paintStaticIcons } from './ui/render';
import {
	applyPreferences,
	renderPreferences,
	setTheme,
	setAnimationsReduites,
} from './ui/preferences';
import {
	route,
	goHome,
	showProfiles,
	showEncadrant,
	startSprint,
	startBilanCustom,
	startRevisionEspacee,
	startMatieres,
	goCategories,
	goCategorie,
	startLecon,
} from './ui/navigation';
import { ORTHO_CATEGORY_ID } from './core/catalog';
import { verify, printAll } from './ui/session';
import { captureResume } from './ui/resume';
import { isSprintRunning } from './ui/sprint';
import { isRevisionRunning } from './ui/revision';
import { hideCelebration, hideLevelUp } from './ui/effects';
import { openRecompenses, openTrophees, hideUnlockModals } from './ui/unlocks-view';
import { closeProfileMenu, toggleProfileMenu, toggleDrawer, closeDrawer } from './ui/menu';
import { initTts } from './ui/tts';
import { maybeShowClassChoice } from './ui/onboarding';
import { initVersionCheck } from './ui/version-check';
import { installVisiblePasswordReveal } from './ui/anti-suggestion';

// Quitter ces modes (non reprenables) perd la progression → on confirme (#63).
const quittingLosesProgress = () => isSprintRunning() || isRevisionRunning();

/* Rend le focus à un bouton d'action de la carte profil après re-rendu (le
   déclencheur d'origine a été recréé par renderProfiles). Repli sur « Nouveau
   profil » si la ligne a disparu — jamais <body> (cf. #230). */
function focusRowAction(uuid: string, act: string): void {
	const target =
		document.querySelector<HTMLElement>(`.profile-row[data-uuid="${uuid}"] [data-act="${act}"]`) ??
		document.getElementById('profileAdd');
	target?.focus();
}

/* ============================================================
   Initialisation : câblage des événements au chargement
   ============================================================ */
function wireDOM() {
	// Boutons fonctionnels au markup statique (toolbar + sauvegarde profils) :
	// injecte leurs icônes Phosphor (les libellés sont déjà dans app.html).
	paintStaticIcons();
	// Champs de réponse texte « mot de passe visible » : démasquage auto dès l'insertion
	// (texte lisible sans réactiver les suggestions du clavier mobile). Voir #139.
	installVisiblePasswordReveal();
	document.getElementById('btnVerify')!.addEventListener('click', verify);
	// Accueil : la confirmation des modes NON reprenables (sprint, révision) est
	// gérée au niveau du hashchange (couvre aussi Précédent / édition d'URL), pour
	// ne pas demander deux fois. Les exercices grille sont sauvegardés en silence.
	document.getElementById('btnHome')!.addEventListener('click', goHome);
	document.getElementById('btnPrint')!.addEventListener('click', () => {
		closeDrawer(); // Imprimer ne change pas de vue : on referme le tiroir à la main
		printAll();
	});
	// Tiroir mobile : hamburger (ouvre/ferme) + voile (ferme au tap extérieur)
	document.getElementById('toolbarBurger')!.addEventListener('click', (e) => {
		e.stopPropagation();
		toggleDrawer();
	});
	document.getElementById('toolbarScrim')!.addEventListener('click', closeDrawer);
	document.getElementById('cardLecon')!.addEventListener('click', startMatieres);
	document.getElementById('cardSprint')!.addEventListener('click', startSprint);
	document.getElementById('cardRevision')!.addEventListener('click', startRevisionEspacee);
	document.getElementById('cardBilanCustom')!.addEventListener('click', startBilanCustom);
	document.getElementById('backHome')!.addEventListener('click', goHome);
	document.getElementById('backHomeBilanCustom')!.addEventListener('click', goHome);
	document.getElementById('backHomeSprintConfig')!.addEventListener('click', goHome);
	// Navigation multi-matières : retour « d'un cran » en haut de chaque vue de la
	// hiérarchie (matières ← accueil, catégories ← matières, catégorie ← catégories).
	document.getElementById('backHomeMatieresTop')!.addEventListener('click', goHome);
	document.getElementById('backMatieresTop')!.addEventListener('click', startMatieres);
	document.getElementById('backCategorieTop')!.addEventListener('click', (e: any) => {
		const subject = e.currentTarget.dataset.subject;
		if (subject) goCategories(subject);
		else startMatieres();
	});
	document
		.getElementById('backOrthoListe')!
		.addEventListener('click', () => goCategorie(ORTHO_CATEGORY_ID));
	document.getElementById('backHomeProfils')!.addEventListener('click', goHome);
	// Accès à l'espace encadrant depuis le pied de l'écran Profils (#234).
	document.getElementById('btnEncadrant')!.addEventListener('click', showEncadrant);

	// Bouton profil de la barre : ouvre/ferme la liste déroulante
	document.getElementById('toolbarProfile')!.addEventListener('click', (e) => {
		e.stopPropagation();
		toggleProfileMenu();
	});
	// Menu déroulant : bascule de profil (clic = profil actif) ou accès à la gestion
	document.getElementById('profileMenu')!.addEventListener('click', (e: any) => {
		const btn = e.target.closest('button');
		if (!btn) return;
		closeProfileMenu();
		if (btn.id === 'pmMine') {
			showProfiles(); // « Mon espace » : l'enfant personnalise son propre profil
			return;
		}
		if (btn.id === 'pmManage') {
			showEncadrant(); // zone adulte : gestion des profils, suivi, réglages
			return;
		}
		if (btn.dataset.uuid) {
			setActiveProfile(btn.dataset.uuid);
			route();
		} // re-rendu de la vue courante avec le nouveau profil
	});
	// Clic en dehors → ferme le menu
	document.addEventListener('click', (e: any) => {
		if (!e.target.closest('#profileDD')) closeProfileMenu();
	});

	// Écran « Mon espace » : l'enfant ne gère que SON profil (renommer / avatar).
	// Créer / choisir / réinitialiser / supprimer un profil et l'export/import ont
	// migré dans l'espace encadrants (ui/encadrant.ts) — #234.
	document.getElementById('profileList')!.addEventListener('click', async (e: any) => {
		const btn = e.target.closest('button');
		if (!btn) return;
		const row = e.target.closest('.profile-row');
		if (!row) return;
		const uuid = row.dataset.uuid;
		// Toute action autre que l'ouverture/choix d'avatar referme la palette.
		if (btn.dataset.act !== 'emoji' && btn.dataset.act !== 'set-emoji') closeEmojiPicker();
		switch (btn.dataset.act) {
			case 'rename': {
				const courant = listProfiles().find((p) => p.uuid === uuid)?.name ?? '';
				const n = await uiPrompt({
					title: 'Quel est ton nouveau prénom ?',
					okLabel: 'Changer mon prénom',
					defaultValue: courant,
					selectDefault: true, // pré-rempli + sélectionné : on remplace d'un trait
					emoji: '✏️',
				});
				if (n) {
					renameProfile(uuid, n);
					renderPreferences(); // le nom peut être celui du profil actif
					renderProfiles();
					focusRowAction(uuid, 'rename');
				}
				break;
			}
			case 'emoji':
				toggleEmojiPicker(uuid); // ouvre/replie la palette d'avatars
				renderProfiles();
				break;
			case 'set-emoji':
				setProfileEmoji(uuid, btn.dataset.emoji);
				closeEmojiPicker();
				renderProfiles();
				break;
		}
	});

	// Gestion des profils (créer / réinitialiser / supprimer) et export/import : déplacés
	// dans l'espace encadrants (ui/encadrant.ts) — un enfant ne touche pas aux profils
	// des autres (#234).

	// Écran « Mon espace » : préférences du profil actif (thème de couleur + animations)
	const prefs = document.getElementById('preferences')!;
	prefs.addEventListener('click', (e: any) => {
		const btn = e.target.closest('[data-act="set-theme"]');
		if (!btn) return;
		setTheme(btn.dataset.theme);
		applyPreferences();
		renderPreferences();
	});
	prefs.addEventListener('change', (e: any) => {
		if (e.target.id === 'prefAnim') {
			setAnimationsReduites(e.target.checked);
			applyPreferences();
		} else if (e.target.id === 'prefConfort') {
			setPref('confortLecture', e.target.checked);
			applyPreferences();
		} else if (e.target.id === 'prefLectureAuto') {
			setPref('lectureConsigneAuto', e.target.checked);
		} else if (e.target.id === 'prefSansChrono') {
			// Sprint sans pression temporelle (#223) : lu au lancement du sprint, pas
			// d'effet immédiat sur le document → pas d'applyPreferences().
			setPref('sansPressionTemporelle', e.target.checked);
		}
		// Le réglage « Classe scolaire » a migré vers l'espace encadrant (#234) :
		// il n'est plus exposé à l'enfant dans ces préférences.
	});

	// Accueil : barre « Récompenses » / « Trophées » (délégation, conteneur stable)
	document.getElementById('rewardNav')!.addEventListener('click', (e: any) => {
		const btn = e.target.closest('button');
		if (!btn) return;
		if (btn.dataset.act === 'open-recompenses') openRecompenses();
		else if (btn.dataset.act === 'open-trophees') openTrophees();
	});
	// Écran Profils : accès aux récompenses
	document.getElementById('btnRecompensesProfils')!.addEventListener('click', openRecompenses);
	// Fermeture des modales Récompenses / Trophées (croix, bouton, fond)
	['recompenses', 'trophees'].forEach((id) => {
		document.getElementById(id + 'Ok')!.addEventListener('click', hideUnlockModals);
		document.getElementById(id + 'Close')!.addEventListener('click', hideUnlockModals);
		document.getElementById(id)!.addEventListener('click', (e: any) => {
			if (e.target.id === id) hideUnlockModals();
		});
	});

	// Sélection d'une leçon dans la liste (délégation)
	document.getElementById('lessonList')!.addEventListener('click', (e: any) => {
		const btn = e.target.closest('.lesson-item');
		if (btn && btn.dataset.id) startLecon(btn.dataset.id);
	});

	// Modale de récompense : fermeture (bouton, croix, fond, Échap)
	document.getElementById('celebrateOk')!.addEventListener('click', hideCelebration);
	document.getElementById('celebrateClose')!.addEventListener('click', hideCelebration);
	document.getElementById('celebrate')!.addEventListener('click', (e: any) => {
		if (e.target.id === 'celebrate') hideCelebration();
	});

	// Modale de passage de niveau : mêmes fermetures (la fermeture enchaîne
	// éventuellement sur la modale de récompense, cf. showLevelUp).
	document.getElementById('levelupOk')!.addEventListener('click', hideLevelUp);
	document.getElementById('levelupClose')!.addEventListener('click', hideLevelUp);
	document.getElementById('levelup')!.addEventListener('click', (e: any) => {
		if (e.target.id === 'levelup') hideLevelUp();
	});

	document.addEventListener('keydown', (e: any) => {
		if (e.key === 'Escape') {
			// La fermeture Échap des modales (récompenses, trophées, levelup, célébration)
			// est désormais possédée par leur focus-trap (modal-a11y), qui consomme
			// l'événement en capture AVANT d'arriver ici. Restent les surcouches
			// non-modales : menu profil et tiroir mobile.
			closeProfileMenu();
			closeDrawer();
		}
	});

	// Sauvegarde de l'exercice en cours quand l'app passe en arrière-plan ou se
	// ferme (onglet masqué, app quittée sur tablette) — le cas « interruption »
	// le plus fréquent pour un CE2 (#63).
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') captureResume();
	});
	window.addEventListener('pagehide', captureResume);
	// Sauvegarde débouncée à la saisie : couvre aussi une coupure brutale
	// (batterie) où pagehide ne se déclenche pas.
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	document.addEventListener('input', (e) => {
		const t = e.target as HTMLElement;
		if (t instanceof HTMLInputElement && t.classList.contains('ans')) {
			if (saveTimer) clearTimeout(saveTimer);
			saveTimer = setTimeout(captureResume, 800);
		}
	});

	// Modes NON reprenables (sprint, révision) : quitter perd la progression. On
	// confirme avant de tout changement de vue interne (Précédent/Suivant, Accueil,
	// édition du hash). Si l'enfant annule, on remet le hash précédent sans rejouer
	// la vue (le sprint continue). Les exercices grille passent sans confirmation
	// (sauvegardés automatiquement, #63).
	let revertingHash = false;
	const revenirAuHash = (hash: string) => {
		revertingHash = true;
		location.hash = hash;
	};
	window.addEventListener('hashchange', (e: HashChangeEvent) => {
		if (revertingHash) {
			revertingHash = false;
			return;
		}
		if (quittingLosesProgress()) {
			// Le hash a DÉJÀ changé (hashchange est post-fait) et la modale est
			// asynchrone : on diffère la navigation. Si l'enfant continue, on revient
			// au hash précédent (le sprint reprend) ; s'il arrête, on rejoue la vue.
			const precedent = new URL(e.oldURL).hash || '#accueil';
			void uiConfirm({
				title: 'Tu veux arrêter ?',
				message: 'Si tu arrêtes maintenant, cet exercice ne sera pas terminé.',
				confirmLabel: 'Oui, arrêter',
				cancelLabel: "Continuer l'exercice",
				emoji: '👋',
				// Si on continue, le focus revient au déclencheur ; sinon repli stable
				// (jamais <body>) car la vue change entièrement.
				restoreFocusTo: () => document.getElementById('btnHome'),
			}).then((arreter) => (arreter ? route() : revenirAuHash(precedent)));
			return;
		}
		route();
	});
	// Fermeture d'onglet / rechargement / changement d'URL (barre d'adresse) :
	// mêmes modes non reprenables → invite native du navigateur. (Les exercices
	// grille sont déjà sauvegardés via visibilitychange/pagehide, donc pas d'invite.)
	window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
		if (quittingLosesProgress()) {
			e.preventDefault();
			e.returnValue = '';
		}
	});
	// Au chargement : on affiche la vue désignée par le hash (accueil par défaut)
	route();

	// Onboarding : si le profil n'a pas encore de classe et que plusieurs niveaux
	// ont du contenu, on demande la classe (re-rendu de la vue courante au choix).
	maybeShowClassChoice(route);

	// Bande décorative « forêt » de pied d'accueil : SVG pré-généré, inséré dans le
	// DOM (pour que l'animation « vent » respecte l'option « animations réduites »).
	const foretEl = document.getElementById('homeForet');
	if (foretEl) {
		fetch(`${import.meta.env.BASE_URL}foret-pied.svg`)
			.then((r) => (r.ok ? r.text() : ''))
			.then((svg) => {
				if (svg) foretEl.innerHTML = svg;
			})
			.catch(() => {}); // décoration non critique : on ignore l'échec
	}
}

// (1) hook d'écriture → (2) profils → (3) câblage DOM + route initiale.
setOnDataWrite(touchActiveProfile);
initProfiles();
applyPreferences(); // thème + animations du profil actif, dès avant le 1er rendu
initTts(); // précharge les voix de synthèse (dictée best-effort)
initVersionCheck(); // auto-actualisation : recharge l'onglet quand un nouveau déploiement est en ligne
// Les scripts type="module" sont différés : si le DOM est déjà prêt, on câble
// immédiatement, sinon on attend DOMContentLoaded (parité avec l'ancien main.js).
if (document.readyState !== 'loading') wireDOM();
else document.addEventListener('DOMContentLoaded', wireDOM);
