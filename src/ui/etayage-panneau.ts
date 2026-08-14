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
} from '../core/etayage';
import {
	chapeauLigne,
	phrasePosee,
	resolutionPosee,
	retenueDansLaGrille,
	type EtapePosee,
	type ResolutionPosee,
} from '../core/etayage-posee';
import { dispositionPosee, poseeGrilleHTML, type PosedSpec } from '../core/items';
import { loadRevoir, revoirActives, toggleRevoirFor } from '../core/encadrant-stats';
import { labelLecon } from '../core/levels';
import { niveauLecon } from '../core/niveau-actif';
import { activeProfile, lectureConsigneAuto } from '../core/profiles';
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
export const ETAYAGE_LABEL = 'Comprendre ce calcul';

/* Phrase de la mascotte : elle annonce un déroulé À DEUX, pas une démonstration à
   regarder (« Je te montre, regarde bien ! » est déjà la phrase de l'aide au geste). */
const MASCOTTE_LIGNE = 'On y va ensemble, étape par étape.';

/* Sorties du panneau. Jamais « J'ai compris ! » (celle de l'aide au geste) : ce serait
   faire certifier à l'enfant une maîtrise qu'une seule explication ne donne pas. Et
   JAMAIS de contrôle de compréhension : une question-péage rendrait l'étayage bloquant
   et punirait l'enfant qui avait déjà compris. */
const SORTIE_DEMANDE = "D'accord, à moi de jouer !";
const SORTIE_AVANT_SERIE = 'Je me lance !';

let ouvert = false; // un seul panneau à la fois (évite l'empilement automatique + clic)

/** Un pas du déroulé : la colonne à écrire et ce qu'on en dit. */
interface PasEtayage {
	/** Index de la ligne de chiffres concernée (0 = la première ligne à écrire). */
	ligne: number;
	/** Colonne À L'ÉCRAN (décalage de la ligne compris, cf. `LignePosee.decalage`). */
	rang: number;
	etape: EtapePosee;
	phrase: string;
	/** La retenue sortante a-t-elle une case dans la grille ? (Non pour un produit
	    partiel : sa retenue se garde en tête, la rangée de cases est celle de l'addition
	    finale.) */
	retenueVisible: boolean;
}

/* Déroulé à plat : les colonnes de chaque ligne, dans l'ordre où l'enfant les traite.
   L'annonce d'une ligne (« d'abord par les unités… ») est mise en TÊTE de sa première
   colonne plutôt qu'en pas de plus : le volume d'une multiplication à deux chiffres est
   déjà à la limite haute du suivable. */
function pasDe(resolution: ResolutionPosee, spec: PosedSpec): PasEtayage[] {
	const pas: PasEtayage[] = [];
	resolution.lignes.forEach((ligne, i) => {
		const chapeau = chapeauLigne(ligne, spec);
		const retenueVisible = retenueDansLaGrille(ligne);
		ligne.etapes.forEach((etape, j) => {
			const phrase = phrasePosee(etape, spec.op, ligne);
			pas.push({
				ligne: i,
				rang: etape.colonne + (ligne.decalage ?? 0),
				etape,
				phrase: chapeau && j === 0 ? `${chapeau} ${phrase}` : phrase,
				retenueVisible,
			});
		});
	});
	return pas;
}

/* Grille de DÉMONSTRATION : la même disposition que la grille jouable (même largeur de
   colonne, même alignement — un enfant en difficulté ne doit pas avoir à réapprendre un
   format visuel en plus de la méthode), mais figée et VIDE de ce qui reste à trouver.
   Chaque cellule à remplir porte sa cible (`data-cible` = « ligne{i}-{rang} », `data-retenue`
   = rang) : c'est ce qui permet de la remplir au bon moment sans redéduire la géométrie. */
function grilleDemoHTML(spec: PosedSpec): string {
	const disposition = dispositionPosee(spec);
	let ligne = -1; // index de la ligne de chiffres À ÉCRIRE en cours (ordre des rangées)
	const cellules = disposition.rangees
		.map((rangee) => {
			if (rangee.barre)
				return `<span class="posee-rule" style="grid-column: 1 / ${disposition.colonnes + 2}"></span>`;
			// La rangée porte-t-elle des cellules à trouver ? (les rangées de saisie se
			// succèdent dans le même ordre que les lignes de la résolution.)
			if (rangee.cellules.some((c) => c.role === 'saisie')) ligne++;
			return rangee.cellules
				.map((c, i) => {
					// `i === 0` est la colonne du signe ; les suivantes sont les colonnes de
					// chiffres, alignées à droite → rang = distance à la colonne des unités.
					const rang = disposition.colonnes - i;
					switch (c.role) {
						case 'signe':
							return `<span class="posee-cell posee-op">${c.texte}</span>`;
						case 'chiffre':
							return `<span class="posee-cell posee-digit">${c.chiffre}</span>`;
						case 'zeroDecalage':
							return `<span class="posee-cell posee-digit posee-zero" aria-label="zéro du décalage">0</span>`;
						case 'retenue':
							return `<span class="posee-cell posee-carry etay-cell" data-retenue="${rang}"></span>`;
						case 'saisie':
							return `<span class="posee-cell posee-input etay-cell" data-cible="ligne${ligne}-${rang}"></span>`;
						case 'vide':
							return `<span class="posee-cell"></span>`;
					}
				})
				.join('');
		})
		.join('');
	return poseeGrilleHTML(disposition, cellules, 'posee-demo');
}

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
	return `<button type="button" class="${classe}" id="${id}">${icon('math-operations')}<span>${ETAYAGE_LABEL}</span></button>`;
}

export interface EtayageDemande {
	lesson: LessonDef;
	niveau: SchoolLevel;
	mode?: string;
	/** Opération à dérouler — celle que l'enfant vient de rater. À défaut, l'exemple
	    canonique de la leçon : un exemple FIXE, jamais un tirage (l'aléatoire donnerait
	    tantôt un cas sans retenue qui ne montre rien, tantôt le pire cas au pire moment). */
	posed?: PosedSpec;
	/** Panneau AUTOMATIQUE d'avant-série : l'enfant n'a rien demandé, il vient de lancer sa
	    leçon. L'accueil et la sortie changent de ton, et on lui offre de partir tout de
	    suite — sinon le panneau devient un péage avant de pouvoir jouer. */
	avantSerie?: boolean;
	trigger?: HTMLElement | null;
	restoreFocusTo?: () => HTMLElement | null;
	/** Appelé à la fermeture, quelle qu'en soit la façon (sortie, croix, Échap, tap-dehors). */
	onFerme?: () => void;
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
	const spec = d.posed ?? (contenu.exemple?.moteur === 'posee' ? contenu.exemple.spec : undefined);
	const pas = spec ? pasDe(resolutionPosee(spec), spec) : [];
	const ttsDispo = dicteeDisponible();
	const sortie = d.avantSerie ? SORTIE_AVANT_SERIE : SORTIE_DEMANDE;

	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';
	overlay.id = 'etayageOverlay';
	overlay.innerHTML = `
		<div class="modal aide-modal etay-modal" role="dialog" aria-modal="true" aria-labelledby="etayTitle">
			<button type="button" class="modal-close aide-close" aria-label="Fermer l'explication">${icon('x')}</button>
			${mascotteBulleHTML(d.avantSerie ? 'Un petit rappel avant de commencer.' : MASCOTTE_LIGNE)}
			<h2 class="modal-title aide-titre" id="etayTitle">${escapeHTML(spec ? titreOperation(spec) : contenu.titre)}</h2>
			${contenu.regle ? `<p class="etay-regle">${escapeHTML(contenu.regle)}</p>` : ''}
			${spec ? grilleDemoHTML(spec) : ''}
			${etapesFixesHTML(contenu)}
			${
				pas.length
					? `<p class="etay-compteur" id="etayCompteur"></p>
						 <div class="etay-bar"><div class="etay-bar-fill" id="etayBarFill"></div></div>
						 <p class="etay-phrase" id="etayPhrase" role="status"></p>`
					: ''
			}
			${prerequisHTML(d)}
			${
				ttsDispo
					? `<button type="button" class="modal-listen aide-listen etay-listen" aria-label="Écouter l'explication" title="Écouter l'explication">${icon('speaker')}<span class="aide-listen-lab">Écouter</span></button>`
					: ''
			}
			<div class="etay-nav">
				${pas.length > 1 ? `<button type="button" class="etay-prec" id="etayPrec">◀ Précédent</button>` : ''}
				<button type="button" class="modal-ok aide-ok etay-suivant" id="etaySuivant">${escapeHTML(pas.length ? 'Suivant ▶' : sortie)}</button>
			</div>
			${d.avantSerie && pas.length ? `<button type="button" class="etay-filer" id="etayFiler">Je me lance tout de suite</button>` : ''}
		</div>`;
	document.body.appendChild(overlay);

	const suivant = overlay.querySelector<HTMLButtonElement>('#etaySuivant')!;
	const precedent = overlay.querySelector<HTMLButtonElement>('#etayPrec');
	const phrase = overlay.querySelector<HTMLElement>('#etayPhrase');
	const compteur = overlay.querySelector<HTMLElement>('#etayCompteur');
	const barre = overlay.querySelector<HTMLElement>('#etayBarFill');
	const release = activateModal(overlay, {
		trigger: d.trigger ?? null,
		onEscape: () => fermer(),
		initialFocus: suivant,
		restoreFocusTo: d.restoreFocusTo,
	});

	function fermer(): void {
		stopTts();
		release();
		overlay.remove();
		ouvert = false;
		d.onFerme?.();
	}

	/* Rend l'état du déroulé à l'index `i` : la grille remplie jusque-là, la phrase de
	   l'étape, et la surbrillance de la SEULE colonne active. On rejoue depuis le début à
	   chaque fois (les états sont peu nombreux et le rendu est idempotent) : « Précédent »
	   n'a ainsi rien à défaire, donc rien à oublier de défaire. */
	function afficher(i: number): void {
		for (const cell of overlay.querySelectorAll<HTMLElement>('.etay-cell')) {
			cell.textContent = '';
			cell.classList.remove('etay-actif');
		}
		for (let k = 0; k <= i; k++) {
			const { ligne, rang, etape, retenueVisible } = pas[k];
			const cible = overlay.querySelector<HTMLElement>(`[data-cible="ligne${ligne}-${rang}"]`);
			// Colonne sans cellule dans la grille : un zéro de tête que le résultat n'écrit
			// pas (105 − 100 = 5). L'étape se raconte quand même, elle n'a rien à remplir.
			if (cible) cible.textContent = String(etape.ecrit);
			const retenue =
				etape.retenueSortante && retenueVisible
					? overlay.querySelector<HTMLElement>(`[data-retenue="${rang + 1}"]`)
					: null;
			if (retenue) retenue.textContent = String(etape.retenueSortante);
			if (k === i) {
				cible?.classList.add('etay-actif');
				retenue?.classList.add('etay-actif');
			}
		}
		if (phrase) phrase.textContent = pas[i].phrase;
		if (compteur) compteur.textContent = `Étape ${i + 1} sur ${pas.length}`;
		if (barre) barre.style.width = `${Math.round(((i + 1) / pas.length) * 100)}%`;
		if (precedent) precedent.hidden = i === 0;
		suivant.textContent = i + 1 < pas.length ? 'Suivant ▶' : sortie;
		// Lecture auto : c'est un réglage du profil, donc on suit chaque étape. Sinon, seul
		// le bouton « Écouter » lit — et il lit l'étape COURANTE, pas tout le panneau.
		stopTts();
		if (lectureConsigneAuto()) lire();
	}

	let index = 0;
	// Repli de lecture quand il n'y a pas de déroulé : l'idée-force. (Capturée ici : TS ne
	// garde pas l'affinement de `contenu` dans une fonction hoistée.)
	const regle = contenu.regle;
	function lire(): void {
		const texte = [
			overlay.querySelector('#etayTitle')?.textContent,
			pas.length ? pas[index].phrase : regle,
		]
			.filter(Boolean)
			.join(' ');
		const bouton = overlay.querySelector<HTMLButtonElement>('.etay-listen');
		bouton?.classList.add('speaking');
		dicterConsigne(texte, () => bouton?.classList.remove('speaking'));
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

/** Pose le lien « Comprendre ce calcul » sous chaque grille posée où l'enfant s'est trompé,
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
			ouvrirEtayage({ lesson, niveau, posed: spec, trigger: bouton }),
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
	btn.innerHTML = icon('math-operations');
	btn.addEventListener('click', () => ouvrirEtayage({ lesson, niveau, mode, trigger: btn }));
	conteneur.appendChild(btn);
}

/** Exemple d'avant-série : le SEUL point d'entrée AUTOMATIQUE, donc le seul à porter une
    mémoire et une borne (cf. core/etayage.ts). Ne montre rien si la leçon n'a pas de
    contenu, si l'enfant ne revient pas d'une mise de côté, ou si l'épisode a déjà été
    couvert — relancer la leçon dix fois le même jour ne donne pas dix panneaux.

    Jamais par-dessus l'aide au GESTE, qui peut s'auto-afficher au même moment : deux
    modales empilées avant la question 1 seraient un péage, exactement ce que ce panneau
    doit éviter. On laisse alors passer ce lancement ; l'épisode n'étant pas marqué vu,
    l'exemple reviendra au suivant. */
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
		// Ouverture sans déclencheur : à la fermeture, on rend le focus au bouton persistant
		// de l'écran plutôt qu'au <body> (contexte préservé au clavier / lecteur d'écran).
		restoreFocusTo: () => document.querySelector<HTMLElement>('.etayage-btn'),
	});
}

/* Titre du panneau : l'OPÉRATION elle-même, pour que l'enfant voie tout de suite que ce
   n'est pas l'aide habituelle (qui titre, elle, le nom du type d'exercice). */
function titreOperation(spec: PosedSpec): string {
	return `${spec.a} ${spec.op === 'x' ? '×' : spec.op === '-' ? '−' : '+'} ${spec.b}`;
}

/* Étapes RÉDIGÉES d'une notion qui n'a pas d'exemple à dérouler (à venir : les leçons
   sans moteur mécanisable). Même rendu que les aides au geste : l'enfant y retrouve une
   présentation qu'il connaît. */
function etapesFixesHTML(contenu: EtayageContenu): string {
	if (!contenu.etapes?.length) return '';
	return `<ol class="aide-etapes">${contenu.etapes.map((e) => `<li>${escapeHTML(e)}</li>`).join('')}</ol>`;
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
