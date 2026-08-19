/* ============================================================
   Panneau d'étayage de la NOTION (#490) — couche UI.
   ------------------------------------------------------------
   Un seul panneau, plusieurs points d'entrée (le réflexe déjà pris pour la
   révélation neutre, ui/revelation-neutre.ts : un fond commun, des habillages) :
   - « Je ne sais pas, montre-moi » (#467), où l'enfant RÉCLAME l'explication ;
   - un lien PROPOSÉ à côté du verdict d'une erreur (jamais imposé, jamais automatique) ;
   - le bouton persistant de l'en-tête, pour rouvrir en cours de série ce qu'on ne
     retient pas d'un écran au suivant ;
   - l'exemple d'avant-série, au retour d'une leçon mise de côté (seul cas AUTOMATIQUE,
     donc le seul à porter une mémoire et une borne, cf. core/etayage.ts).

   Forme : la mini-modale a11y des aides au geste (#272, `activateModal` — piège de focus,
   arrière-plan inerte, Échap, tap-dehors, mascotte, TTS à la demande), mais un CORPS
   différent, et c'est délibéré : l'aide au geste montre trois phrases sans état, une
   résolution a un ÉTAT qui s'accumule (la grille se remplit). D'où un déroulé PAS À PAS
   piloté par l'enfant — jamais un pavé, jamais une avance automatique qui imposerait son
   tempo. Les trois conseillers convergent sur ce point ; le rendu en applique les règles :
   une seule colonne active à la fois, nommée en mots ET surlignée (jamais la couleur
   seule), en `--accent` (jamais `--ok`/`--ko`, qui disent « ta réponse est juste/fausse »).

   Ce panneau EXPLIQUE, il ne corrige rien : aucun nouveau chemin de correction, donc
   aucune obligation côté journal d'erreurs (#391).
   ============================================================ */
import type { LessonDef, SchoolLevel } from '../core/catalog';
import { getLessonById } from '../core/catalog';
import {
	doitEtayerAvantSerie,
	episodeEtayable,
	etayagePour,
	leconPrerequise,
	type EtayageContenu,
	type EtayageExemple,
} from '../core/etayage';
import { derouleMontrable, type PasEtayage } from '../core/etayage-deroule';
import { moteurEtayage, type MoteurEtayage } from './etayage-visuels';
import type { PosedSpec } from '../core/items';
import { loadRevoir, revoirActives, toggleRevoirFor } from '../core/encadrant-stats';
import { labelLecon } from '../core/levels';
import { niveauLecon } from '../core/niveau-actif';
import { activeProfile, lectureConsigneAuto } from '../core/profiles';
import { texteParle } from '../core/tts-text';
import { loadEtayagesVus, loadLessonReports, marquerEtayageVu } from '../core/progress';
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import { activateModal } from './modal-a11y';
import { getCurrentMode } from './navigation';
import { dicteeDisponible, dicterConsigne, stopTts } from './tts';
import { mascotteBulleHTML } from './unlocks-view';

/* Libellé du point d'entrée. « Comprendre » et non « voir » (déjà le sens de « montre-moi »,
   #467) ni « comment on joue » (déjà celui de l'ampoule d'aide au geste, #272) : trois
   promesses distinctes, trois mots distincts. */
export const ETAYAGE_LABEL = 'Comprendre la méthode';

/* Icône du point d'entrée : NEUTRE quant à la matière. « math-operations » (les signes
   + − × ÷) allait tant que l'étayage n'existait que pour le calcul posé ; il s'affiche
   désormais aussi sur une leçon de conjugaison, où une calculatrice ne veut rien dire.
   Même raison pour le libellé : « ce calcul » est devenu faux le jour où l'on a expliqué
   « nous viendrons » (constat du `redacteur-contenu-francais`). */
const ETAYAGE_ICONE = 'brain';

/* Phrase de la mascotte : elle annonce un déroulé À DEUX, pas une démonstration à
   regarder (« Je te montre, regarde bien ! » est déjà la phrase de l'aide au geste).
   Deux formulations, parce qu'il y a deux panneaux : « étape par étape » promet un
   pas-à-pas et des boutons qui n'existent QUE si un moteur déroule l'exemple. Sur une
   notion au contenu rédigé (la majorité depuis #490 PR 3), le panneau tient sur un seul
   écran ; annoncer une navigation absente ferait chercher un bouton Suivant introuvable
   (constat du `relecteur-accessibilite`). */
const MASCOTTE_DEROULE = 'On y va ensemble, étape par étape.';
const MASCOTTE_REDIGE = 'Voilà comment on fait, tranquillement.';

/* Sorties du panneau. Jamais « J'ai compris ! » (celle de l'aide au geste) : ce serait
   faire certifier à l'enfant une maîtrise qu'une seule explication ne donne pas. Et
   JAMAIS de contrôle de compréhension : une question-péage rendrait l'étayage bloquant
   et punirait l'enfant qui avait déjà compris. */
const SORTIE_DEMANDE = "D'accord, à moi de jouer !";
const SORTIE_AVANT_SERIE = 'Je me lance !';

let ouvert = false; // un seul panneau à la fois (évite l'empilement automatique + clic)

/** Y a-t-il de quoi étayer cette leçon ? Sans entrée pour elle, il n'y a PAS de panneau —
    et surtout aucun repli sur un exemple générique de la famille de moteur, qui servirait
    à un enfant une notion voisine de la sienne (pire que rien, cf. core/etayage.ts).
    Jamais sous chronomètre non plus : une explication y déconcentrerait et grignoterait
    le temps, comme l'aide au geste (`maybeAutoAide`). */
export function etayageDisponible(lesson: LessonDef, niveau: SchoolLevel, mode?: string): boolean {
	const m = getCurrentMode();
	if (m === 'complet' || m === 'express') return false;
	return !!etayagePour(lesson, niveau, mode);
}

/** Lien d'accès au panneau, à côté d'un verdict. Un vrai `<button type="button">`, discret
    par le STYLE et jamais par la taille de cible (même règle que « Je ne sais pas,
    montre-moi ») : un enfant de 8-9 ans ne clique pas sur ce qu'il ne voit pas, et clique
    par réflexe sur ce qui pèse plus lourd que « Continuer ». `classe` et `id` restent
    propres à l'écran (styles, repères des specs e2e). */
export function lienEtayageHTML(classe: string, id: string): string {
	return `<button type="button" class="${classe}" id="${id}">${icon(ETAYAGE_ICONE)}<span>${ETAYAGE_LABEL}</span></button>`;
}

export interface EtayageDemande {
	lesson: LessonDef;
	niveau: SchoolLevel;
	mode?: string;
	/** Ce qu'il faut dérouler — l'exercice que l'enfant vient de rater, quand l'écran sait
	    le décrire. À défaut, l'exemple canonique de la leçon : un exemple FIXE, jamais un
	    tirage (l'aléatoire donnerait tantôt un cas sans difficulté qui ne montre rien,
	    tantôt le pire cas au pire moment).
	    JAMAIS renseigné par un point d'entrée qui s'ouvre AVANT la réponse (le bouton
	    persistant de l'en-tête, l'exemple d'avant-série) : ce serait souffler la solution
	    de la question en cours. */
	exemple?: EtayageExemple;
	/** Panneau AUTOMATIQUE d'avant-série : l'enfant n'a rien demandé, il vient de lancer sa
	    leçon. L'accueil et la sortie changent de ton, et on lui offre de partir tout de
	    suite — sinon le panneau devient un péage avant de pouvoir jouer. */
	avantSerie?: boolean;
	trigger?: HTMLElement | null;
	restoreFocusTo?: () => HTMLElement | null;
	/** Appelé à la fermeture, quelle qu'en soit la façon (sortie, croix, Échap, tap-dehors). */
	onFerme?: () => void;
}

/* Markup du panneau, séparé de son câblage (convention maison `xxxHTML` + `bindXxx`, cf.
   `brouillonHTML`/`bindBrouillon`) : le template se relit et se fait évoluer sans traverser
   les écouteurs, et `ouvrirEtayage` ne garde que ce qui bouge dans le temps. */
function panneauHTML(
	d: EtayageDemande,
	contenu: EtayageContenu,
	titre: string,
	moteur: MoteurEtayage | undefined,
	pas: PasEtayage[],
	sortie: string,
): string {
	return `
		<div class="modal aide-modal etay-modal" role="dialog" aria-modal="true" aria-labelledby="etayTitle" aria-describedby="etayRegle etayEtapes etayPhrase">
			<button type="button" class="modal-close aide-close" aria-label="Fermer l'explication">${icon('x')}</button>
			${mascotteBulleHTML(d.avantSerie ? 'Un petit rappel avant de commencer.' : pas.length ? MASCOTTE_DEROULE : MASCOTTE_REDIGE)}
			<h2 class="modal-title aide-titre" id="etayTitle">${escapeHTML(titre)}</h2>
			${contenu.regle ? `<p class="etay-regle" id="etayRegle">${escapeHTML(contenu.regle)}</p>` : ''}
			${
				// Visuel MASQUÉ aux technologies d'assistance : tout ce qu'il montre est déjà DIT
				// par la narration (« j'écris 2 et je retiens 1 pour les dizaines »). L'étiqueter à
				// moitié ferait entendre une grille de chiffres nus en plus de l'explication ; le
				// taire est plus lisible que le décrire.
				moteur && pas.length
					? `<div class="etay-grille" id="etayVisuel" aria-hidden="true">${moteur.visuel(0)}</div>`
					: ''
			}
			${etapesFixesHTML(contenu)}
			${
				pas.length
					? // Le compteur est une région live À PART, et il précède la phrase : l'enfant
						// qui n'y voit pas entend d'abord OÙ il en est, puis ce qu'il y a à faire. La
						// barre ne fait que redire le compteur en image → masquée aux technologies
						// d'assistance. Les deux textes sont rendus DÉJÀ REMPLIS pour l'étape 0 :
						// beaucoup de lecteurs d'écran n'observent une région live qu'après un
						// battement, et la première étape — la seule qu'aucun geste n'annonce —
						// serait restée muette. Le préremplissage ne SUFFIT pas pour autant : une
						// région live rendue déjà pleine n'est en général pas annoncée (elle n'a pas
						// muté). C'est `aria-describedby` sur le dialogue qui fait entendre la règle
						// et la première phrase à l'ouverture ; la région live prend le relais aux pas
						// suivants, où il y a bien mutation (constat du `relecteur-accessibilite`).
						`<p class="etay-compteur" id="etayCompteur" aria-live="polite">${compteurTexte(0, pas.length)}</p>
						 <div class="etay-bar" aria-hidden="true"><div class="etay-bar-fill" id="etayBarFill"></div></div>
						 <p class="etay-phrase" id="etayPhrase" role="status">${escapeHTML(pas[0].phrase)}</p>`
					: ''
			}
			${prerequisHTML(d)}
			${
				dicteeDisponible()
					? `<button type="button" class="modal-listen aide-listen etay-listen" aria-label="Écouter l'explication" title="Écouter l'explication">${icon('speaker')}<span class="aide-listen-lab">Écouter</span></button>`
					: ''
			}
			<div class="etay-nav">
				${pas.length > 1 ? `<button type="button" class="etay-prec" id="etayPrec">◀ Précédent</button>` : ''}
				<button type="button" class="modal-ok aide-ok etay-suivant" id="etaySuivant">${escapeHTML(pas.length ? 'Suivant ▶' : sortie)}</button>
			</div>
			${d.avantSerie && pas.length ? `<button type="button" class="etay-filer" id="etayFiler">Je me lance tout de suite</button>` : ''}
		</div>`;
}

/** Ouvre le panneau d'étayage. Sans contenu pour cette leçon, n'ouvre RIEN et appelle
    tout de même `onFerme` : l'appelant n'a pas à savoir si le panneau existe (c'est ce qui
    rend la dégradation propre sans dupliquer le test chez chaque point d'entrée). */
export function ouvrirEtayage(d: EtayageDemande): void {
	const contenu = etayagePour(d.lesson, d.niveau, d.mode);
	if (ouvert || !contenu) {
		d.onFerme?.();
		return;
	}
	ouvert = true;
	const exemple = d.exemple ?? contenu.exemple;
	const moteurBrut = exemple ? moteurEtayage(exemple) : undefined;
	// Déroulé injouable (vide, ou plus long que le plafond) : on garde le panneau — sa règle,
	// ses étapes rédigées, son renvoi au prérequis valent mieux que rien — mais sans le
	// pas-à-pas. C'est la même dégradation que pour une leçon sans contenu, un cran plus bas.
	const moteur = moteurBrut && derouleMontrable(moteurBrut.deroule) ? moteurBrut : undefined;
	const pas = moteur?.deroule.pas ?? [];
	const titre = moteur?.deroule.titre || contenu.titre;
	const sortie = d.avantSerie ? SORTIE_AVANT_SERIE : SORTIE_DEMANDE;

	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';
	overlay.id = 'etayageOverlay';
	overlay.innerHTML = panneauHTML(d, contenu, titre, moteur, pas, sortie);
	document.body.appendChild(overlay);

	const suivant = overlay.querySelector<HTMLButtonElement>('#etaySuivant')!;
	const precedent = overlay.querySelector<HTMLButtonElement>('#etayPrec');
	const phrase = overlay.querySelector<HTMLElement>('#etayPhrase');
	const visuel = overlay.querySelector<HTMLElement>('#etayVisuel');
	const compteur = overlay.querySelector<HTMLElement>('#etayCompteur');
	const barre = overlay.querySelector<HTMLElement>('#etayBarFill');
	const release = activateModal(overlay, {
		trigger: d.trigger ?? null,
		onEscape: () => fermer(),
		initialFocus: suivant,
		restoreFocusTo: d.restoreFocusTo,
	});
	// Le focus initial vise le bouton de sortie, tout en BAS de la carte. C'était sans
	// conséquence tant que le panneau tenait en trois lignes ; avec la règle et les étapes
	// rédigées, un panneau plus haut que l'écran s'ouvrait défilé à son pied — texte déjà
	// passé, croix de fermeture hors écran. La cause était le défilement automatique du
	// navigateur au moment du focus, corrigée depuis dans `activateModal` (`preventScroll`),
	// donc pour toutes les modales : ne pas rétablir ici un `scrollTop` de compensation, qui
	// entrerait de nouveau en concurrence avec le navigateur.

	function fermer(): void {
		stopTts();
		release();
		overlay.remove();
		ouvert = false;
		d.onFerme?.();
	}

	/* Rend l'état du déroulé à l'index `i` : le visuel du moteur (grille remplie jusque-là,
	   tableau, droite…), la phrase du pas, et la surbrillance de la SEULE chose dont on parle.
	   Le visuel est redessiné en entier plutôt que retouché (les états sont peu nombreux, le
	   rendu est pur) : « Précédent » n'a ainsi rien à défaire, donc rien à oublier de défaire. */
	function afficher(i: number): void {
		if (visuel && moteur) visuel.innerHTML = moteur.visuel(i);
		if (phrase) phrase.textContent = pas[i].phrase;
		if (compteur) compteur.textContent = compteurTexte(i, pas.length);
		if (barre) barre.style.width = `${Math.round(((i + 1) / pas.length) * 100)}%`;
		// Le bouton qu'on vient de cliquer ne doit pas disparaître SOUS le focus : un élément
		// caché le rend au `<body>`, et l'enfant au clavier se retrouve nulle part jusqu'au
		// prochain Tab. On le repasse à « Suivant », la seule action qui reste.
		if (precedent) {
			const perdLeFocus = i === 0 && document.activeElement === precedent;
			precedent.hidden = i === 0;
			if (perdLeFocus) suivant.focus();
		}
		suivant.textContent = i + 1 < pas.length ? 'Suivant ▶' : sortie;
		// Lecture auto : c'est un réglage du profil, donc on suit chaque étape. Sinon, seul
		// le bouton « Écouter » lit — et il lit l'étape COURANTE, pas tout le panneau.
		stopTts();
		if (lectureConsigneAuto()) lire();
	}

	let index = 0;
	// Ce qu'on lit quand il n'y a PAS de déroulé : l'idée-force ET les étapes rédigées.
	// Les étapes ne sont pas un supplément — pour une notion sans moteur (la quasi-totalité
	// du contenu rédigé, #490 PR 3/4), elles SONT la méthode. Les taire ferait entendre
	// « le périmètre, c'est le tour » et rien de la façon de le calculer, à l'enfant qui
	// écoute justement parce qu'il lit mal. (Capturées ici : TS ne garde pas l'affinement
	// de `contenu` dans une fonction hoistée.)
	const sansDeroule = [contenu.regle, ...(contenu.etapes ?? [])].filter(Boolean).join(' ');
	function lire(): void {
		const texte = [
			overlay.querySelector('#etayTitle')?.textContent,
			pas.length ? pas[index].phrase : sansDeroule,
		]
			.filter(Boolean)
			.join(' ');
		const bouton = overlay.querySelector<HTMLButtonElement>('.etay-listen');
		bouton?.classList.add('speaking');
		// `texteParle` avant de dicter, comme partout ailleurs : ce texte est écrit pour l'ŒIL
		// et il est bourré d'opérateurs (« 7 × 6 = 42 »), que les moteurs vocaux rendent mal ou
		// pas du tout. Sans ça, le fait numérique isolé — le cœur de l'explication — serait
		// précisément ce qu'un enfant qui écoute n'entendrait pas.
		dicterConsigne(texteParle(texte), () => bouton?.classList.remove('speaking'));
	}

	suivant.addEventListener('click', () => {
		if (index + 1 >= pas.length) return fermer();
		index++;
		afficher(index);
	});
	precedent?.addEventListener('click', () => {
		if (index === 0) return;
		index--;
		afficher(index);
	});
	overlay.querySelector('.aide-close')!.addEventListener('click', fermer);
	overlay.querySelector('#etayFiler')?.addEventListener('click', fermer);
	// Mettre de côté la leçon d'avant : le panneau reste ouvert (l'enfant n'a rien à quitter).
	const prerequis = overlay.querySelector<HTMLElement>('.etay-prerequis');
	overlay
		.querySelector('#etayEpingler')
		?.addEventListener('click', () => prerequis && epinglerPrerequis(prerequis));
	// Tap en dehors de la carte : le panneau s'écarte d'un geste (jamais un péage).
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) fermer();
	});
	overlay.querySelector('.etay-listen')?.addEventListener('click', lire);

	if (pas.length) afficher(0);
	else if (lectureConsigneAuto()) lire();
}

/* ---------- Points d'entrée ---------- */

/** Opération d'une grille posée du DOM (attributs posés par `poseeGrilleHTML`), ou
    `undefined` si la grille n'en porte pas (grille de démonstration). */
function specDeGrille(grille: HTMLElement): PosedSpec | undefined {
	const op = grille.dataset.poseOp;
	const a = Number(grille.dataset.poseA);
	const b = Number(grille.dataset.poseB);
	if ((op !== '+' && op !== '-' && op !== 'x') || !Number.isFinite(a) || !Number.isFinite(b))
		return undefined;
	return { op, a, b };
}

/** Pose le lien « Comprendre la méthode » sous chaque grille posée où l'enfant s'est trompé,
    après correction d'une fiche. UNE offre par GRILLE, jamais par chiffre : dix opérations
    justes ne doivent pas donner dix liens sur une page déjà dense.

    Déclencheur volontairement plus large que celui du journal d'erreurs (#391, qui n'agrège
    que les résultats faux) : une retenue ou un produit partiel raté est justement ce que
    l'étayage explique le mieux, même quand l'enfant a retrouvé le bon résultat.
    Idempotent : une seconde validation de la même fiche ne double pas les liens. */
export function poserLiensEtayagePosee(racine: ParentNode, lessonParDefaut: string | null): void {
	for (const ancien of racine.querySelectorAll('.etay-lien-posee')) ancien.remove();
	for (const grille of racine.querySelectorAll<HTMLElement>('.posee')) {
		const faux = grille.querySelector<HTMLInputElement>('.posee-input.wrong');
		const spec = specDeGrille(grille);
		if (!faux || !spec) continue;
		const lesson = getLessonById(faux.dataset.lesson ?? lessonParDefaut ?? '');
		if (!lesson) continue;
		const niveau = niveauLecon(lesson);
		if (!etayageDisponible(lesson, niveau)) continue;
		const hote = document.createElement('div');
		hote.className = 'etay-lien-posee';
		hote.innerHTML = lienEtayageHTML('etay-lien', '');
		const bouton = hote.querySelector<HTMLButtonElement>('button')!;
		bouton.removeAttribute('id'); // plusieurs grilles par fiche : pas d'id à dupliquer
		bouton.addEventListener('click', () =>
			ouvrirEtayage({ lesson, niveau, exemple: { moteur: 'posee', spec }, trigger: bouton }),
		);
		grille.insertAdjacentElement('afterend', hote);
	}
}

/** Bouton PERSISTANT de l'en-tête : rouvrir la méthode à tout moment pendant la série.
    C'est le filet de ce qu'on ne retient pas d'un écran au suivant — un enfant qui a oublié
    dès la 2ᵉ question ne doit pas avoir à rater pour qu'on lui remontre (avis
    `specialiste-troubles-apprentissage`). Icône et rôle distincts de l'ampoule d'aide au
    geste (#272), avec laquelle il cohabite. Idempotent.
    `conteneur` doit être en `position: relative` (le bouton se cale en haut-droite). */
export function monterBoutonEtayage(
	conteneur: HTMLElement | null,
	lesson: LessonDef,
	niveau: SchoolLevel,
	mode?: string,
): void {
	if (!conteneur || conteneur.querySelector('.etayage-btn')) return;
	if (!etayageDisponible(lesson, niveau, mode)) return;
	// Marque l'hôte : c'est elle qui porte l'ancrage et le couloir réservé au bouton. Sans
	// elle, toute fiche de l'appli paierait ce couloir, y compris celles qui n'ont rien à
	// étayer (l'immense majorité aujourd'hui).
	conteneur.classList.add('a-etayage');
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'etayage-btn';
	btn.setAttribute('aria-label', ETAYAGE_LABEL);
	btn.title = ETAYAGE_LABEL;
	btn.innerHTML = icon(ETAYAGE_ICONE);
	btn.addEventListener('click', () => ouvrirEtayage({ lesson, niveau, mode, trigger: btn }));
	conteneur.appendChild(btn);
}

/** Branche l'étayage sur un écran d'exercice : le bouton persistant, puis l'exemple
    d'avant-série. UN seul appelant possible par écran, et une seule copie de l'ordre à
    respecter — à appeler APRÈS l'éventuelle aide au geste (`maybeAutoAide`), qui est
    prioritaire et dont l'exemple d'avant-série refuse de doubler la modale.
    Ne fait rien si la leçon n'a pas de contenu d'étayage. */
export function brancherEtayageEcran(
	conteneur: HTMLElement | null,
	lesson: LessonDef,
	mode?: string,
): void {
	monterBoutonEtayage(conteneur, lesson, niveauLecon(lesson), mode);
	maybeEtayageAvantSerie(lesson, mode);
}

/** Exemple d'avant-série : le SEUL point d'entrée AUTOMATIQUE, donc le seul à porter une
    mémoire et une borne (cf. core/etayage.ts). Ne montre rien si la leçon n'a pas de
    contenu, si l'enfant ne revient pas d'une mise de côté, ou si l'épisode a déjà été
    couvert — relancer la leçon dix fois le même jour ne donne pas dix panneaux.

    Jamais par-dessus l'aide au GESTE, qui peut s'auto-afficher au même moment : deux
    modales empilées avant la question 1 seraient un péage, exactement ce que ce panneau
    doit éviter — et deux `activateModal` concurrents s'inertent l'un l'autre, si bien que
    fermer la seconde ferait réapparaître la première, focus perdu. On laisse alors passer ce
    lancement ; l'épisode n'étant pas marqué vu, l'exemple reviendra au suivant. C'est
    l'aide au geste qui passe d'abord (savoir MANIPULER l'écran précède la méthode), donc
    tout appelant doit l'avoir déclenchée AVANT d'arriver ici, sinon la garde ne voit rien. */
export function maybeEtayageAvantSerie(lesson: LessonDef, mode?: string): void {
	if (document.getElementById('aideOverlay')) return;
	const niveau = niveauLecon(lesson);
	if (!etayageDisponible(lesson, niveau, mode)) return;
	const now = Date.now();
	const etat = loadLessonReports()[lesson.id];
	if (!doitEtayerAvantSerie(etat, loadEtayagesVus()[lesson.id] ?? 0, now)) return;
	marquerEtayageVu(lesson.id, episodeEtayable(etat, now));
	ouvrirEtayage({
		lesson,
		niveau,
		mode,
		avantSerie: true,
		// Ouverture sans déclencheur : `activateModal` prend alors l'élément ACTIF comme
		// pivot de focus — le premier champ de la fiche, ou le conteneur d'exercice — et c'est
		// exactement là que l'enfant doit revenir en fermant. Le repli ci-dessous ne sert donc
		// que si cet élément a disparu entre-temps (jamais le <body>, qui ferait perdre le
		// contexte à un lecteur d'écran).
		restoreFocusTo: () => document.querySelector<HTMLElement>('.etayage-btn'),
	});
}

/* Où on en est du déroulé. Rendu à l'ouverture ET à chaque pas, donc une seule formulation. */
function compteurTexte(i: number, total: number): string {
	return `Étape ${i + 1} sur ${total}`;
}

/* Étapes RÉDIGÉES d'une notion qui n'a pas de moteur pour la dérouler — le cas de la
   plupart des leçons depuis #490 PR 3. Même rendu que les aides au geste : l'enfant y
   retrouve une présentation qu'il connaît.

   `id` porté pour l'`aria-describedby` du dialogue : sans lui, un lecteur d'écran
   annoncerait le titre et la règle à l'ouverture, et tairait la MÉTHODE — la liste reste
   lisible en navigant, mais il faut savoir qu'elle est là pour aller la chercher. */
function etapesFixesHTML(contenu: EtayageContenu): string {
	if (!contenu.etapes?.length) return '';
	return `<ol class="aide-etapes" id="etayEtapes">${contenu.etapes.map((e) => `<li>${escapeHTML(e)}</li>`).join('')}</ol>`;
}

/* Renvoi à la leçon prérequise : le seul contenu entièrement MÉCANISABLE (l'ordre
   pédagogique le donne), donc affichable même là où rien n'est rédigé.

   Jamais un lien de NAVIGATION : on ne propose pas à un enfant de quitter la série qu'il
   vient de commencer. L'enfant peut en revanche la METTRE DE CÔTÉ — elle rejoint la file
   « à revoir », donc la carte de son accueil, et il la retrouvera quand il aura fini.
   C'est le même geste que l'épinglage de l'espace encadrant, ici à l'initiative de
   l'enfant : rien à quitter, rien à retenir. */
function prerequisHTML(d: EtayageDemande): string {
	const avant = leconPrerequise(d.lesson, d.niveau);
	if (!avant) return '';
	const deja = loadRevoir().includes(avant.id);
	return `<div class="etay-prerequis" data-prerequis="${escapeHTML(avant.id)}">
			<p class="etay-prerequis-txt">Si c'est encore trop dur, tu peux revoir « ${escapeHTML(labelLecon(avant, d.niveau))} ».</p>
			${
				deja
					? `<p class="etay-prerequis-ok">${PREREQUIS_ATTEND}</p>`
					: `<button type="button" class="etay-epingler" id="etayEpingler">${icon('bookmark')}<span>Mets-la de côté pour moi</span></button>`
			}
		</div>`;
}

/* Ce qu'on répond quand l'enfant met la leçon d'avant de côté. Deux issues, et il faut dire
   la vraie : la file « à revoir » n'affiche que ce qui est ENCORE fragile (`revoirActives`,
   qui s'auto-nettoie), donc épingler une leçon que l'appli juge déjà réussie ne la fera pas
   apparaître sur l'accueil. Promettre l'inverse serait un mensonge que l'enfant vérifierait
   tout seul en rentrant. */
const PREREQUIS_ATTEND = "C'est noté : tu la retrouveras sur ton accueil.";
const PREREQUIS_DEJA_SUE = 'Tu la réussis déjà ! Tu peux la relancer quand tu veux.';

/* Met la leçon prérequise dans la file « à revoir » du profil actif et dit ce qui va se
   passer. Ajoute seulement (le bouton n'est rendu que si la leçon n'y est pas) : le
   dés-épinglage reste un geste de l'adulte, dans l'espace encadrant. */
function epinglerPrerequis(zone: HTMLElement): void {
	const id = zone.dataset.prerequis;
	const uuid = activeProfile()?.uuid;
	if (!id || !uuid) return;
	toggleRevoirFor(uuid, id);
	const actif = revoirActives(dicteeDisponible()).some((e) => e.id === id);
	const dit = document.createElement('p');
	dit.className = 'etay-prerequis-ok';
	dit.setAttribute('role', 'status');
	dit.textContent = actif ? PREREQUIS_ATTEND : PREREQUIS_DEJA_SUE;
	zone.querySelector('.etay-epingler')?.replaceWith(dit);
}
