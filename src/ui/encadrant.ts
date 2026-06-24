/* ============================================================
   Espace encadrant (#234) — couche UI (vue gatée dans app.html, #encadrant).
   ------------------------------------------------------------
   Zone réservée aux ADULTES (parents/enseignants), distincte de l'espace enfant :
   voix « vous », chrome neutre (cf. encadrant.scss), densité d'info plus élevée.
   On y CONSULTE la progression de chaque profil SANS changer le profil actif
   (progressionProfil lit par UUID) et on règle la classe / un code d'accès optionnel.

   Tout se rend dans le conteneur persistant #encadrantContent ; un seul jeu de
   listeners délégués y est posé (idempotent), les re-rendus remplacent l'innerHTML.
   La logique de données (lecture par profil, file « à revoir », verrou PIN) vit
   dans core/ (encadrant-stats.ts, encadrant-lock.ts) ; ici, uniquement le rendu.
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { icon } from './icon';
import {
	listProfiles,
	activeProfile,
	setNiveauReferenceFor,
	setNiveauMatiereFor,
	setPrefFor,
	addProfile,
	renameProfile,
	setProfileEmoji,
	resetProfile,
	deleteProfile,
	exportProfiles,
	importProfiles,
	getXPFor,
	type Profile,
} from '../core/profiles';
import { emojiPaletteHTML } from './render';
import { niveauDepuisXP } from '../core/progress';
import { applyPreferences } from './preferences';
import {
	progressionProfil,
	toggleRevoirFor,
	loadRevoirFor,
	niveauProfilMatiere,
	echelleActivite,
	type RecapProfil,
	type NiveauNotion,
	type JourActivite,
} from '../core/encadrant-stats';
import {
	pinActif,
	definirPin,
	verifierPin,
	reinitViaRecuperation,
	desactiverPin,
} from '../core/encadrant-lock';
import { getAllLessons, SUBJECTS, type SchoolLevel, type LessonDef } from '../core/catalog';
import { availableLevels, LEVEL_LABEL } from '../core/levels';
import { dicteeDisponible } from './tts';
import { printScope } from './session';
import { uiConfirm, uiPrompt, toast } from './ui-modal';

/* ---------- État de la vue (module) ---------- */
let container: HTMLElement | null = null;
let consulteUuid: string | null = null; // profil CONSULTÉ (≠ forcément l'actif)
let deverrouille = false; // PIN validé pour cette session de page
let vue: 'gate' | 'recovery' | 'espace' = 'espace';
let pinBuffer = ''; // chiffres saisis au pavé
let pinErreur = false; // « mauvais code » (gate)
let recoveryErreur = false; // clé de récupération invalide
let pinPanel: 'none' | 'saisie' | 'secret' = 'none'; // sous-panneau « code » des réglages
let pinSecret: string | null = null; // secret de récupération à afficher une fois
let secretConserve = false; // case « j'ai conservé ma clé »
let gestionEmojiFor: string | null = null; // profil dont la palette d'avatar est ouverte (gestion)
let vueActivite: 'total' | 'type' = 'total'; // graphe d'activité : « Total » ou « Par type » (#319)

/* Mot affiché pour un niveau d'acquisition (échelle type LSU ; wording validé par
   pedagogue-primaire / redacteur-contenu-francais — la notion est qualifiée, pas l'enfant). */
const MOT_NIVEAU: Record<NiveauNotion, string> = {
	acquis: 'acquis',
	'en-cours': 'en cours',
	'non-acquis': 'à renforcer', // ≠ « à consolider » : éviter qu'il sonne plus avancé que « en cours » (avis pédago)
	'a-decouvrir': 'à découvrir',
};
// Ordre de PROGRESSION (croissant) pour la légende et les segments (avis pédago :
// l'échelle doit se lire comme une gradation, pas un ordre arbitraire).
const ORDRE_NIVEAUX: NiveauNotion[] = ['a-decouvrir', 'non-acquis', 'en-cours', 'acquis'];

/* Types de session du graphe d'activité (#319). Couleurs reprises des tokens
   sémantiques de l'app (cohérence : sprint = corail, bilan = violet, leçon = bleu).
   `mot` = singulier pour le détail inline ; `legende` = libellé de la légende. */
const TYPES_ACTIVITE: { k: keyof JourActivite; mot: string; legende: string; cls: string }[] = [
	{ k: 'lecon', mot: 'leçon', legende: 'Leçons', cls: 'enc-act-lecon' },
	{ k: 'bilan', mot: 'bilan', legende: 'Bilans', cls: 'enc-act-bilan' },
	{ k: 'sprint', mot: 'sprint', legende: 'Sprints', cls: 'enc-act-sprint' },
];
// Sessions de l'ancien format (sans type) : segment neutre, affiché seulement si présent.
const TYPE_INCONNU = {
	k: 'inconnu' as const,
	mot: 'autre',
	legende: 'Autre',
	cls: 'enc-act-inconnu',
};
// Noms de jours (l'index = getDay()) pour les libellés accessibles des colonnes.
const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/* ---------- Point d'entrée (appelé par navigation.showEncadrantView) ---------- */
export function enterEncadrant(el: HTMLElement): void {
	container = el;
	wireOnce();
	// Profil consulté par défaut = l'enfant actif (celui qui a passé l'appareil).
	consulteUuid = activeProfile()?.uuid ?? null;
	pinPanel = 'none';
	pinBuffer = '';
	pinErreur = false;
	recoveryErreur = false;
	secretConserve = false;
	pinSecret = null;
	vue = pinActif() && !deverrouille ? 'gate' : 'espace';
	rerender();
}

function wireOnce(): void {
	if (!container || container.dataset.wired) return;
	container.addEventListener('click', onClick);
	container.addEventListener('change', onChange);
	container.addEventListener('keydown', onKeydown);
	container.dataset.wired = '1';
}

/* Le pavé est-il affiché (porte OU définition d'un code) ? */
function pavePresent(): boolean {
	return vue === 'gate' || (vue === 'espace' && pinPanel === 'saisie');
}

/* Saisie au CLAVIER PHYSIQUE du pavé (a11y) : chiffres + Effacement, quand le pavé
   est affiché et que le focus n'est pas dans un champ texte/sélecteur. */
function onKeydown(e: KeyboardEvent): void {
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
	if (!container || !pavePresent()) return;
	const sel = preferD ? `.kp-key[data-d="${preferD}"]` : '.kp-key';
	(container.querySelector(sel) as HTMLElement | null)?.focus({ preventScroll: true });
}

function rerender(): void {
	if (!container) return;
	if (vue === 'gate') renderGate();
	else if (vue === 'recovery') renderRecovery();
	else renderEspace();
}

/* ---------- Pavé numérique (porte + définition de code) ---------- */
function keypadHTML(): string {
	const dots = Array.from(
		{ length: 4 },
		(_, i) => `<span class="kp-dot${i < pinBuffer.length ? ' filled' : ''}"></span>`,
	).join('');
	const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
		.map((d) => `<button type="button" class="kp-key" data-act="kp" data-d="${d}">${d}</button>`)
		.join('');
	return `<div class="kp">
      <div class="kp-dots${pinErreur ? ' kp-shake' : ''}" role="status" aria-live="polite" aria-label="${pinBuffer.length} chiffre${pinBuffer.length > 1 ? 's' : ''} sur 4">${dots}</div>
      <div class="kp-grid">
        ${keys}
        <span class="kp-spacer" aria-hidden="true"></span>
        <button type="button" class="kp-key" data-act="kp" data-d="0">0</button>
        <button type="button" class="kp-key kp-del" data-act="kp-del" aria-label="Effacer">⌫</button>
      </div>
    </div>`;
}

function renderGate(): void {
	if (!container) return;
	container.innerHTML = `<div class="enc-gate">
      <h1 class="enc-title">Espace encadrants</h1>
      <p class="enc-gate-hint">Entrez votre code à 4 chiffres.</p>
      ${pinErreur ? `<p class="enc-gate-err" role="alert">Ce n'est pas le bon code.</p>` : ''}
      ${keypadHTML()}
      <div class="enc-gate-links">
        <button type="button" class="enc-link" data-act="oubli">J'ai oublié mon code</button>
        <button type="button" class="enc-link" data-act="retour">Retour</button>
      </div>
    </div>`;
	// Focus initial dans le pavé : la saisie au clavier physique marche d'emblée.
	if (!pinBuffer)
		(container.querySelector('.kp-key') as HTMLElement | null)?.focus({ preventScroll: true });
}

function renderRecovery(): void {
	if (!container) return;
	container.innerHTML = `<div class="enc-gate">
      <h1 class="enc-title">Réinitialiser le code</h1>
      <p class="enc-gate-hint">Saisissez votre clé de récupération (fournie quand vous avez créé le code).</p>
      ${recoveryErreur ? `<p class="enc-gate-err" role="alert">Cette clé ne correspond pas.</p>` : ''}
      <input type="text" class="enc-input" id="encRecovery" placeholder="Clé de récupération" aria-label="Clé de récupération" autocomplete="off" spellcheck="false" />
      <div class="enc-gate-links">
        <button type="button" class="enc-btn" data-act="recovery-valider">Valider</button>
        <button type="button" class="enc-link" data-act="gate-retour">Annuler</button>
      </div>
    </div>`;
	(container.querySelector('#encRecovery') as HTMLInputElement | null)?.focus();
}

/* ---------- Espace (consultation + réglages) ---------- */
function renderEspace(): void {
	if (!container) return;
	const profiles = listProfiles();
	const actif = activeProfile();
	const consulte = profiles.find((p) => p.uuid === consulteUuid) ?? actif;
	if (!consulte || !actif) return;
	const recap = progressionProfil(consulte, Date.now());
	container.innerHTML = `
    <div class="enc-topbar">
      <button type="button" class="enc-back" data-act="retour">
        <span aria-hidden="true">←</span> Retour à ${escapeHTML(actif.name)}
        <span class="enc-back-emoji" aria-hidden="true">${escapeHTML(actif.emoji)}</span>
      </button>
    </div>
    <h1 class="enc-title">Espace encadrants</h1>
    ${profilsHTML(profiles, consulte, actif)}
    ${recapHTML(recap, consulte)}
    ${reglagesHTML(consulte)}
    ${sauvegardeHTML()}`;
}

/* Liste des profils : CONSULTER (« Voir le suivi » → recap ci-dessous) + GÉRER
   (renommer/avatar/réinitialiser/supprimer, replié). Action de gestion = encadrant
   UNIQUEMENT (un enfant ne touche pas aux profils des autres). Suppression désactivée
   s'il ne reste qu'un profil. La bascule du profil ACTIF reste au menu de la barre. */
function profilsHTML(profiles: Profile[], consulte: Profile, actif: Profile): string {
	const seul = profiles.length <= 1;
	const cartes = profiles
		.map((p) => {
			const courant = p.uuid === consulte.uuid;
			const joue = p.uuid === actif.uuid;
			const palette =
				gestionEmojiFor === p.uuid
					? emojiPaletteHTML(p.emoji, niveauDepuisXP(getXPFor(p.uuid)))
					: '';
			return `<li class="enc-prof-card${courant ? ' current' : ''}">
        <div class="enc-prof-head">
          <span class="enc-profile-emoji" aria-hidden="true">${escapeHTML(p.emoji)}</span>
          <span class="enc-prof-id">
            <span class="enc-profile-name">${escapeHTML(p.name)}</span>
            ${joue ? '<span class="enc-profile-actif">joue en ce moment</span>' : ''}
          </span>
          <button type="button" class="enc-btn${courant ? '' : '-sec'}" data-act="voir" data-uuid="${p.uuid}"${courant ? ' aria-current="true"' : ''}>${courant ? `${icon('check')} Affiché` : `${icon('eye')} Voir le suivi`}</button>
        </div>
        <details class="enc-gerer"${gestionEmojiFor === p.uuid ? ' open' : ''}>
          <summary>Gérer ce profil</summary>
          <div class="enc-gerer-actions">
            <button type="button" class="enc-btn-sec" data-act="enc-rename" data-uuid="${p.uuid}">${icon('pencil')} Renommer</button>
            <button type="button" class="enc-btn-sec" data-act="enc-emoji" data-uuid="${p.uuid}">${icon('palette')} Avatar</button>
            <button type="button" class="enc-btn-sec" data-act="enc-reset" data-uuid="${p.uuid}">${icon('reset')} Réinitialiser</button>
            <button type="button" class="enc-btn-sec enc-danger" data-act="enc-delete" data-uuid="${p.uuid}"${seul ? ' disabled' : ''}>${icon('trash')} Supprimer</button>
          </div>
          ${palette}
        </details>
      </li>`;
		})
		.join('');
	return `<section class="enc-section">
      <h2 class="enc-h2">Profils</h2>
      <p class="enc-hint">Choisissez « Voir le suivi » pour consulter un enfant ci-dessous, ou dépliez « Gérer » pour le modifier.</p>
      <ul class="enc-profiles">${cartes}</ul>
      <button type="button" class="enc-btn-sec enc-prof-add" id="encAdd" data-act="enc-add">${icon('plus')} Nouveau profil</button>
    </section>`;
}

/* Sauvegarde : export de TOUS les profils / import (fusion par UUID, par récence). */
function sauvegardeHTML(): string {
	return `<section class="enc-section">
      <h2 class="enc-h2">Sauvegarde</h2>
      <p class="enc-hint">Exportez les profils (transfert vers un autre appareil) ou importez une sauvegarde. À l'import, un profil déjà présent n'est remplacé que s'il est plus récent.</p>
      <div class="enc-actions">
        <button type="button" class="enc-btn-sec" data-act="enc-export">${icon('export')} Exporter les profils</button>
        <button type="button" class="enc-btn-sec" data-act="enc-import">${icon('import')} Importer une sauvegarde</button>
      </div>
    </section>`;
}

function reglagesHTML(consulte: Profile): string {
	return `<section class="enc-section">
      <h2 class="enc-h2">Réglages</h2>
      ${classeHTML(consulte)}
      ${amenagementsHTML(consulte)}
      ${pinHTML()}
    </section>`;
}

/* Aménagements « dys »/attention posés par l'adulte (avis specialiste-troubles-
   apprentissage) : masquer le minuteur (pression temporelle) + lecture auto des
   consignes. Stables (l'enfant ne les bascule pas par jeu) ; l'écoute À LA DEMANDE
   reste toujours dispo côté enfant. Écrits sur le profil CONSULTÉ (setPrefFor). */
function amenagementsHTML(consulte: Profile): string {
	const prefs = consulte.prefs ?? {};
	const voix = dicteeDisponible();
	return `<div class="enc-block">
      <h3 class="enc-h3">Aménagements</h3>
      <p class="enc-hint">Réglages d'accompagnement posés par l'adulte (l'enfant ne peut pas les changer).</p>
      <label class="enc-toggle">
        <input type="checkbox" data-act="set-amenagement" data-pref="sansPressionTemporelle"${prefs.sansPressionTemporelle ? ' checked' : ''} />
        <span>Masquer le minuteur pendant les sprints <small class="enc-hint">(moins de pression ; le score s'affiche à la fin)</small></span>
      </label>
      <label class="enc-toggle${voix ? '' : ' enc-toggle-off'}">
        <input type="checkbox" data-act="set-amenagement" data-pref="lectureConsigneAuto"${prefs.lectureConsigneAuto ? ' checked' : ''}${voix ? '' : ' disabled'} />
        <span>Lire la consigne à voix haute automatiquement</span>
      </label>
      <p class="enc-hint">${
				voix
					? `${icon('speaker')} Lecture vocale disponible sur cet appareil.`
					: `${icon('speaker')} Lecture vocale indisponible sur cet appareil (aucune voix française).`
			}</p>
    </div>`;
}

function classeHTML(consulte: Profile): string {
	const niveaux = availableLevels(getAllLessons());
	if (niveaux.length < 2) return ''; // un seul niveau au catalogue → aucun choix utile
	const ref = consulte.niveauReference ?? niveaux[0];
	const parMat = consulte.niveauParMatiere ?? {};
	const opts = (sel: string | undefined) =>
		niveaux
			.map(
				(lv) => `<option value="${lv}"${lv === sel ? ' selected' : ''}>${LEVEL_LABEL[lv]}</option>`,
			)
			.join('');
	const matieres = SUBJECTS.map(
		(s) => `<label class="enc-row">
          <span>${escapeHTML(s.label)}</span>
          <select class="enc-select-niveau" data-act="set-niveau-mat" data-subject="${s.id}">
            <option value=""${parMat[s.id] ? '' : ' selected'}>Comme la classe</option>
            ${opts(parMat[s.id])}
          </select>
        </label>`,
	).join('');
	return `<div class="enc-block">
      <h3 class="enc-h3">Classe de ${escapeHTML(consulte.name)}</h3>
      <div class="enc-niveau">
        <label class="enc-row"><span><strong>Classe</strong></span>
          <select class="enc-select-niveau" data-act="set-niveau-ref">${opts(ref)}</select></label>
        ${matieres}
      </div>
      <p class="enc-hint">« Comme la classe » suit la classe choisie ; ajustez une matière au besoin.</p>
    </div>`;
}

function pinHTML(): string {
	// Sous-panneau « secret de récupération » (après définition d'un code).
	if (pinPanel === 'secret' && pinSecret) {
		return `<div class="enc-block enc-pin">
        <h3 class="enc-h3">Votre clé de récupération</h3>
        <p class="enc-warn"><strong>Conservez bien cette clé.</strong> Si vous perdez à la fois votre code
          <em>et</em> cette clé, l'accès à cet espace sera définitivement perdu (aucune autre façon de le rouvrir).</p>
        <code class="enc-secret">${escapeHTML(pinSecret)}</code>
        <div class="enc-actions">
          <button type="button" class="enc-btn-sec" data-act="secret-copier">Copier</button>
          <button type="button" class="enc-btn-sec" data-act="secret-telecharger">Télécharger (.txt)</button>
        </div>
        <label class="enc-check"><input type="checkbox" data-act="secret-conserve"${secretConserve ? ' checked' : ''} /> J'ai conservé ma clé de récupération.</label>
        <button type="button" class="enc-btn" data-act="pin-terminer"${secretConserve ? '' : ' disabled'}>Terminer</button>
      </div>`;
	}
	// Sous-panneau « choisir un code » (pavé numérique).
	if (pinPanel === 'saisie') {
		return `<div class="enc-block enc-pin">
        <h3 class="enc-h3">Choisissez un code à 4 chiffres</h3>
        ${keypadHTML()}
        <button type="button" class="enc-link" data-act="pin-annuler">Annuler</button>
      </div>`;
	}
	// État courant du verrou.
	if (pinActif()) {
		return `<div class="enc-block enc-pin">
        <h3 class="enc-h3">Code d'accès</h3>
        <p class="enc-hint">Un code à 4 chiffres est demandé pour entrer dans cet espace.</p>
        <button type="button" class="enc-btn-sec" data-act="pin-desactiver">Désactiver le code</button>
      </div>`;
	}
	return `<div class="enc-block enc-pin">
      <h3 class="enc-h3">Code d'accès (optionnel)</h3>
      <p class="enc-hint">Vous pouvez exiger un code à 4 chiffres pour entrer ici. C'est un garde-fou contre une
        modification accidentelle par l'enfant, pas une protection forte : pour verrouiller vraiment l'appareil,
        utilisez ses contrôles parentaux.</p>
      <button type="button" class="enc-btn-sec" data-act="pin-activer">Activer un code</button>
    </div>`;
}

/* ---------- Récap de progression (accompagnement, pas un bulletin) ---------- */
function recapHTML(recap: RecapProfil, consulte: Profile): string {
	return `<section class="enc-section">
      <h2 class="enc-h2"><span aria-hidden="true">${escapeHTML(consulte.emoji)}</span> Progression de ${escapeHTML(consulte.name)}</h2>
      <p class="enc-frame">Voici où en est l'entraînement de ${escapeHTML(consulte.name)}, pour vous aider à l'accompagner.</p>
      ${chiffresHTML(recap)}
      ${activiteHTML(recap)}
      ${maitriseHTML(recap)}
      ${aRevoirHTML(recap, consulte)}
    </section>`;
}

function chiffresHTML(recap: RecapProfil): string {
	const stat = (num: number, lab: string) =>
		`<div class="enc-stat"><span class="enc-stat-num">${num}</span><span class="enc-stat-lab">${lab}</span></div>`;
	return `<div class="enc-stats">
      ${stat(recap.totalMaitrisees, `notion${recap.totalMaitrisees > 1 ? 's' : ''} maîtrisée${recap.totalMaitrisees > 1 ? 's' : ''}`)}
      ${recap.nouvellesRecentes > 0 ? stat(recap.nouvellesRecentes, `maîtrisée${recap.nouvellesRecentes > 1 ? 's' : ''} récemment`) : ''}
      ${stat(recap.aRevoir.length, 'à revoir ensemble')}
    </div>`;
}

/* Détail textuel de la répartition par type d'un jour (« 2 leçons, 1 sprint ») — a11y. */
function repartitionTexte(j: JourActivite): string {
	return [...TYPES_ACTIVITE, TYPE_INCONNU]
		.map((t) => {
			const c = j[t.k];
			return c ? `${c} ${t.mot}${c > 1 ? 's' : ''}` : '';
		})
		.filter(Boolean)
		.join(', ');
}

function activiteHTML(recap: RecapProfil): string {
	const jours = recap.activite7j;
	const total = jours.reduce((s, j) => s + j.total, 0);
	// Pas d'activité : pas de graphe ni de bascule (rien à comparer).
	if (total === 0) {
		return `<div class="enc-block">
      <h3 class="enc-h3">${icon('calendar')} Activité des 7 derniers jours</h3>
      <p class="enc-hint">Aucune session récente.</p>
    </div>`;
	}
	const parType = vueActivite === 'type';

	// Échelle Y « ronde » (calcul testé côté core). `pct` = hauteur d'une valeur en %
	// de la zone traçante : pour une colonne, la PILE occupe pct(total) et chaque
	// segment pct(sous-total) → la somme des segments = pct(total). Sommet `top` ≥ max.
	const { top, ticks } = echelleActivite(Math.max(...jours.map((j) => j.total)));
	const pct = (v: number) => (v / top) * 100;
	const axis = ticks
		.map((t) => `<span class="enc-axis-tick" style="bottom:${pct(t)}%">${t}</span>`)
		.join('');
	const gridlines = ticks
		.map((t) => `<span class="enc-gridline" style="bottom:${pct(t)}%"></span>`)
		.join('');

	// Libellés de jour, calculés une fois (initiale visible + nom complet pour l'a11y) ;
	// dernière colonne = aujourd'hui.
	const today = new Date();
	const infos = jours.map((_, i) => {
		const d = new Date(today);
		d.setDate(d.getDate() - (jours.length - 1 - i));
		const nom = i === jours.length - 1 ? "aujourd'hui" : NOMS_JOURS[d.getDay()];
		return { initiale: NOMS_JOURS[d.getDay()].charAt(0).toUpperCase(), nom };
	});

	const colonnes = jours
		.map((j, i) => {
			const detail = parType && j.total ? ` (${repartitionTexte(j)})` : '';
			const cap = infos[i].nom.charAt(0).toUpperCase() + infos[i].nom.slice(1);
			const aria = `${cap} : ${j.total} session${j.total > 1 ? 's' : ''}${detail}`;
			let barre: string;
			if (parType) {
				const segs = [...TYPES_ACTIVITE, TYPE_INCONNU]
					.map((t) => {
						const c = j[t.k];
						return c ? `<span class="enc-seg-bar ${t.cls}" style="height:${pct(c)}%"></span>` : '';
					})
					.join('');
				barre = `<div class="enc-bar-stack">${segs}</div>`;
			} else {
				barre = `<div class="enc-bar" style="height:${pct(j.total)}%"></div>`;
			}
			return `<div class="enc-bar-col" role="img" aria-label="${aria}" title="${aria}">${barre}</div>`;
		})
		.join('');
	const labs = infos.map((info) => `<span class="enc-bar-lab">${info.initiale}</span>`).join('');

	// Bascule Total / Par type (pattern bouton-segment, sélecteur stable pour l'e2e).
	const bascule = `<div class="enc-act-modes" role="group" aria-label="Affichage du graphe d'activité">
      <button type="button" class="enc-act-mode${parType ? '' : ' on'}" data-act="activite-mode" data-mode="total" aria-pressed="${!parType}">Total</button>
      <button type="button" class="enc-act-mode${parType ? ' on' : ''}" data-act="activite-mode" data-mode="type" aria-pressed="${parType}">Par type</button>
    </div>`;
	// Légende (mode « par type ») : « Autre » seulement si d'anciennes sessions non typées existent.
	const legendeTypes = [...TYPES_ACTIVITE, ...(jours.some((j) => j.inconnu) ? [TYPE_INCONNU] : [])];
	const legende = parType
		? `<p class="enc-legend">${legendeTypes
				.map((t) => `<span class="enc-key ${t.cls}">${t.legende}</span>`)
				.join('')}</p>`
		: '';
	// Synthèse : total de la semaine, + répartition globale par type (donne au lecteur
	// d'écran le même niveau d'info que la pile visuelle, sans parcourir les colonnes).
	const totalParType: JourActivite = jours.reduce(
		(acc, j) => ({
			total: acc.total + j.total,
			lecon: acc.lecon + j.lecon,
			bilan: acc.bilan + j.bilan,
			sprint: acc.sprint + j.sprint,
			inconnu: acc.inconnu + j.inconnu,
		}),
		{ total: 0, lecon: 0, bilan: 0, sprint: 0, inconnu: 0 },
	);
	const synthese = `${total} session${total > 1 ? 's' : ''} sur la semaine${
		parType ? ` — ${repartitionTexte(totalParType)}` : ''
	}.`;

	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('calendar')} Activité des 7 derniers jours</h3>
      ${bascule}
      ${legende}
      <div class="enc-chart">
        <div class="enc-chart-axis" aria-hidden="true">${axis}</div>
        <div class="enc-chart-main">
          <div class="enc-chart-plot">
            <div class="enc-gridlines" aria-hidden="true">${gridlines}</div>
            <div class="enc-bars">${colonnes}</div>
          </div>
          <div class="enc-bars-labs" aria-hidden="true">${labs}</div>
        </div>
      </div>
      <p class="enc-hint">${synthese}</p>
    </div>`;
}

function maitriseHTML(recap: RecapProfil): string {
	if (recap.parCategorie.length === 0) return '';
	const legende = ORDRE_NIVEAUX.map(
		(n) => `<span class="enc-key enc-key-${n}">${MOT_NIVEAU[n]}</span>`,
	).join('');
	const valeur: Record<NiveauNotion, (c: RecapProfil['parCategorie'][number]) => number> = {
		'a-decouvrir': (c) => c.aDecouvrir,
		'non-acquis': (c) => c.nonAcquis,
		'en-cours': (c) => c.enCours,
		acquis: (c) => c.acquis,
	};
	const seg = (n: NiveauNotion, v: number) =>
		v > 0
			? `<span class="enc-seg-part enc-key-${n}" style="flex:${v}" title="${v} ${MOT_NIVEAU[n]}"></span>`
			: '';
	// Détail d'une catégorie : une ligne par leçon (puce d'état + libellé + mot +
	// actions : épingler/retirer + imprimer une fiche + imprimer avec corrigé).
	const detail = (c: RecapProfil['parCategorie'][number]) =>
		c.lecons
			.map(
				(l) => `<li class="enc-detail-item">
          <span class="enc-detail-puce enc-key-${l.niveau}" aria-hidden="true"></span>
          <span class="enc-detail-lab">${escapeHTML(l.label)}</span>
          <span class="enc-detail-mot">${MOT_NIVEAU[l.niveau]}</span>
          <span class="enc-actions">
            <button type="button" class="enc-btn-sec${l.epingle ? ' on' : ''}" data-act="epingler" data-lesson="${l.lessonId}">${l.epingle ? 'Retirer' : 'Épingler'}</button>
            ${boutonsImpression(l.lessonId)}
          </span>
        </li>`,
			)
			.join('');
	const cats = recap.parCategorie
		.map(
			(c) => `<details class="enc-cat-d">
        <summary class="enc-cat-sum">
          <span class="enc-cat-lab">${escapeHTML(c.label)}</span>
          <span class="enc-cat-counts">${c.acquis}/${c.total} acquises</span>
          <span class="enc-seg" aria-hidden="true">${ORDRE_NIVEAUX.map((n) => seg(n, valeur[n](c))).join('')}</span>
        </summary>
        <ul class="enc-detail">${detail(c)}</ul>
      </details>`,
		)
		.join('');
	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('star')} Notions par catégorie</h3>
      <p class="enc-legend">${legende}</p>
      <p class="enc-hint">C'est normal qu'il reste des notions « à découvrir » ou « à renforcer » : ce sont celles qui n'ont pas encore été beaucoup travaillées. Dépliez une catégorie pour voir le détail et épingler une leçon.</p>
      <div class="enc-cats">${cats}</div>
    </div>`;
}

/* Boutons d'impression d'une leçon (au niveau du profil consulté) : fiche vierge +
   fiche avec corrigé (#41). Réutilisés par le détail des catégories ET « à revoir ». */
function boutonsImpression(lessonId: string): string {
	return `<button type="button" class="enc-btn-sec" data-act="imprimer" data-lesson="${lessonId}">${icon('printer')} Fiche</button>
      <button type="button" class="enc-btn-sec" data-act="imprimer" data-corrige="1" data-lesson="${lessonId}">${icon('printer')} Corrigé</button>`;
}

/* Une ligne de leçon « à revoir » : libellé + état éventuel + actions (épingler/retirer
   + impression). `etat` est l'état d'acquisition affiché (suggestions) ou absent (épinglées). */
function ligneRevoir(
	lessonId: string,
	label: string,
	epingle: boolean,
	etat?: NiveauNotion,
): string {
	const badge = etat
		? `<span class="enc-revoir-etat enc-key-${etat}">${MOT_NIVEAU[etat]}</span>`
		: '';
	return `<li class="enc-revoir-item">
      <span class="enc-revoir-lab">${escapeHTML(label)}</span>
      ${badge}
      <span class="enc-actions">
        <button type="button" class="enc-btn-sec${epingle ? ' on' : ''}" data-act="epingler" data-lesson="${lessonId}">${epingle ? 'Retirer' : 'Épingler'}</button>
        ${boutonsImpression(lessonId)}
      </span>
    </li>`;
}

function aRevoirHTML(recap: RecapProfil, consulte: Profile): string {
	// Leçons actuellement épinglées par l'encadrant (file du profil consulté).
	const epinglees = new Set(loadRevoirFor(consulte.uuid));
	const pinned = [...epinglees]
		.map((id) => getAllLessons().find((l) => l.id === id))
		.filter((l): l is LessonDef => !!l);
	// Suggestions AUTO : leçons « faiblardes » (perf récente < 70 %) non déjà épinglées (max 3).
	const suggestions = recap.aRevoir.filter((n) => !epinglees.has(n.lessonId)).slice(0, 3);

	const blocEpinglees = pinned.length
		? `<ul class="enc-revoir">${pinned.map((l) => ligneRevoir(l.id, l.label, true)).join('')}</ul>`
		: `<p class="enc-hint">Aucune leçon épinglée pour le moment.</p>`;
	const blocSuggestions = suggestions.length
		? `<p class="enc-sub-lab">Suggestions</p>
       <p class="enc-hint">Leçons un peu fragiles, qui gagneraient à être revues :</p>
       <ul class="enc-revoir">${suggestions.map((n) => ligneRevoir(n.lessonId, n.label, false, n.niveau)).join('')}</ul>`
		: '';

	return `<div class="enc-block">
      <h3 class="enc-h3">${icon('repeat')} À revoir ensemble</h3>
      <p class="enc-hint">Épinglez une leçon : elle apparaîtra sur l'accueil de ${escapeHTML(consulte.name)} pour qu'il y revienne. Pour épingler <strong>n'importe quelle leçon</strong> (même pas encore abordée), dépliez une catégorie ci-dessus.</p>
      <p class="enc-sub-lab">Épinglées</p>
      ${blocEpinglees}
      ${blocSuggestions}
    </div>`;
}

/* ---------- Événements (délégués sur le conteneur) ---------- */
function onClick(e: Event): void {
	const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
	if (!el) return;
	const act = el.dataset.act;
	switch (act) {
		case 'kp':
			onKp(el.dataset.d ?? '');
			break;
		case 'kp-del':
			pinBuffer = pinBuffer.slice(0, -1);
			rerender();
			restoreKpFocus();
			break;
		case 'oubli':
			vue = 'recovery';
			recoveryErreur = false;
			rerender();
			break;
		case 'gate-retour':
			vue = 'gate';
			pinBuffer = '';
			pinErreur = false;
			rerender();
			break;
		case 'retour':
			location.hash = 'accueil'; // rend la main à l'enfant actif (route → accueil)
			break;
		case 'voir':
			consulteUuid = el.dataset.uuid ?? consulteUuid;
			pinPanel = 'none';
			renderEspace();
			break;
		case 'activite-mode':
			vueActivite = el.dataset.mode === 'type' ? 'type' : 'total';
			renderEspace();
			// Le re-rendu recrée le DOM → on garde le focus clavier sur le bouton actif.
			(container?.querySelector('.enc-act-mode.on') as HTMLElement | null)?.focus({
				preventScroll: true,
			});
			break;
		case 'enc-rename':
			if (el.dataset.uuid) onEncRename(el.dataset.uuid);
			break;
		case 'enc-emoji':
			gestionEmojiFor = gestionEmojiFor === el.dataset.uuid ? null : (el.dataset.uuid ?? null);
			renderEspace();
			break;
		case 'set-emoji':
			if (gestionEmojiFor && el.dataset.emoji) {
				setProfileEmoji(gestionEmojiFor, el.dataset.emoji);
				gestionEmojiFor = null;
				renderEspace();
			}
			break;
		case 'enc-reset':
			if (el.dataset.uuid) onEncReset(el.dataset.uuid);
			break;
		case 'enc-delete':
			if (el.dataset.uuid) onEncDelete(el.dataset.uuid);
			break;
		case 'enc-add':
			onEncAdd();
			break;
		case 'enc-export':
			onEncExport();
			break;
		case 'enc-import':
			onEncImport();
			break;
		case 'recovery-valider':
			onRecoveryValider();
			break;
		case 'pin-activer':
			pinPanel = 'saisie';
			pinBuffer = '';
			renderEspace();
			restoreKpFocus(); // focus dans le pavé (clavier physique)
			break;
		case 'pin-annuler':
			pinPanel = 'none';
			pinBuffer = '';
			renderEspace();
			break;
		case 'pin-desactiver':
			onPinDesactiver();
			break;
		case 'pin-terminer':
			pinPanel = 'none';
			pinSecret = null;
			secretConserve = false;
			renderEspace();
			break;
		case 'secret-copier':
			if (pinSecret) {
				try {
					navigator.clipboard?.writeText(pinSecret);
				} catch {
					/* presse-papiers indisponible : l'utilisateur peut télécharger */
				}
			}
			break;
		case 'secret-telecharger':
			if (pinSecret) telechargerSecret(pinSecret);
			break;
		case 'epingler':
			if (consulteUuid && el.dataset.lesson) {
				toggleRevoirFor(consulteUuid, el.dataset.lesson);
				renderEspace();
			}
			break;
		case 'imprimer':
			if (el.dataset.lesson) onImprimer(el.dataset.lesson, el.dataset.corrige === '1');
			break;
	}
}

function onChange(e: Event): void {
	const t = e.target as HTMLInputElement | HTMLSelectElement;
	const act = (t as HTMLElement).dataset.act;
	if (act === 'set-niveau-ref' && consulteUuid) {
		setNiveauReferenceFor(consulteUuid, t.value as SchoolLevel);
		renderEspace();
	} else if (act === 'set-niveau-mat' && consulteUuid) {
		setNiveauMatiereFor(
			consulteUuid,
			(t as HTMLElement).dataset.subject ?? '',
			(t.value || undefined) as SchoolLevel | undefined,
		);
		renderEspace();
	} else if (act === 'set-amenagement' && consulteUuid) {
		const pref = (t as HTMLElement).dataset.pref as
			| 'sansPressionTemporelle'
			| 'lectureConsigneAuto';
		setPrefFor(consulteUuid, pref, (t as HTMLInputElement).checked);
		renderEspace();
	} else if (act === 'secret-conserve') {
		secretConserve = (t as HTMLInputElement).checked;
		renderEspace();
	}
}

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
	const input = container?.querySelector('#encRecovery') as HTMLInputElement | null;
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

/* ---------- Gestion des profils (encadrant uniquement) ---------- */
function onEncRename(uuid: string): void {
	const courant = listProfiles().find((p) => p.uuid === uuid)?.name ?? '';
	void uiPrompt({
		title: 'Nouveau prénom',
		okLabel: 'Renommer',
		defaultValue: courant,
		selectDefault: true,
	}).then((n) => {
		if (n) {
			renameProfile(uuid, n);
			renderEspace();
		}
	});
}

function onEncReset(uuid: string): void {
	const nom = listProfiles().find((p) => p.uuid === uuid)?.name ?? 'ce profil';
	void uiConfirm({
		title: `Réinitialiser la progression de ${nom} ?`,
		message: 'Toute sa progression repartira de zéro. C’est irréversible.',
		confirmLabel: 'Tout réinitialiser',
		destructive: true,
		confirmIcon: 'reset',
	}).then((ok) => {
		if (!ok) return;
		resetProfile(uuid);
		if (uuid === activeProfile()?.uuid) applyPreferences(); // l'XP repart à 0 → thème éventuel
		renderEspace();
	});
}

function onEncDelete(uuid: string): void {
	const nom = listProfiles().find((p) => p.uuid === uuid)?.name ?? 'ce profil';
	void uiConfirm({
		title: `Supprimer le profil de ${nom} ?`,
		message: 'Le profil et toute sa progression seront définitivement effacés.',
		confirmLabel: 'Supprimer',
		destructive: true,
		confirmIcon: 'trash',
	}).then((ok) => {
		if (!ok || !deleteProfile(uuid)) return;
		applyPreferences(); // le profil actif a pu changer
		if (consulteUuid === uuid) consulteUuid = activeProfile()?.uuid ?? null;
		renderEspace();
	});
}

function onEncAdd(): void {
	void uiPrompt({
		title: 'Prénom du nouveau profil',
		okLabel: 'Créer le profil',
		placeholder: 'Prénom',
	}).then((n) => {
		if (!n) return;
		addProfile(n); // devient le profil actif
		applyPreferences();
		consulteUuid = activeProfile()?.uuid ?? null;
		renderEspace();
	});
}

function onEncExport(): void {
	const payload = exportProfiles(listProfiles().map((p) => p.uuid));
	if (!payload) return;
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
	telechargerBlob(`ludaskia-${payload.profiles.length}-profils.json`, blob);
}

function onEncImport(): void {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'application/json,.json';
	input.addEventListener('change', () => {
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const res = importProfiles(JSON.parse(String(reader.result)));
				if (!res) {
					toast('Fichier de sauvegarde non reconnu.');
					return;
				}
				consulteUuid = activeProfile()?.uuid ?? null;
				renderEspace();
				toast(
					`Import : ${res.added} ajouté(s), ${res.updated} mis à jour, ${res.skipped} ignoré(s).`,
				);
			} catch {
				toast('Fichier de sauvegarde illisible.');
			}
		};
		reader.readAsText(file);
	});
	input.click();
}

function onImprimer(lessonId: string, corrige = false): void {
	const consulte = listProfiles().find((p) => p.uuid === consulteUuid) ?? activeProfile();
	const lesson = getAllLessons().find((l) => l.id === lessonId);
	if (!consulte || !lesson) return;
	// Impression au niveau du profil CONSULTÉ, sans changer le profil/niveau actif.
	const level = niveauProfilMatiere(consulte, lesson.subject);
	printScope({ title: lesson.label, lessonIds: [lessonId], kind: 'fiches', level, corrige });
}

/* Déclenche le téléchargement d'un blob (export profils, clé de récupération…). */
function telechargerBlob(nom: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = nom;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function telechargerSecret(secret: string): void {
	const texte = `Clé de récupération — Espace encadrants (Ludaskia)\n\n${secret}\n\nÀ conserver précieusement : cette clé permet de réinitialiser votre code d'accès si vous l'oubliez. Si vous perdez à la fois le code et cette clé, l'accès à cet espace sera définitivement perdu.\n`;
	telechargerBlob(
		'ludaskia-cle-recuperation.txt',
		new Blob([texte], { type: 'text/plain;charset=utf-8' }),
	);
}
