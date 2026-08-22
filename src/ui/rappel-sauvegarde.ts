/* ============================================================
   Encart « Pour les parents » : installer, et sauvegarder (#306 §7).
   ------------------------------------------------------------
   La tension à traiter, et non à ignorer : l'accueil est l'écran de l'ENFANT,
   et ce message s'adresse à l'ADULTE. Un CE2 ne peut ni installer une
   application ni gérer un fichier d'export ; lui annoncer que sa progression
   peut disparaître, c'est de l'inquiétude sans action possible. Mais l'inverse
   ne marche pas non plus : un adulte qui n'ouvre jamais l'espace encadrants ne
   verra jamais le rappel, et c'est précisément lui qui risque de perdre la
   progression. L'accueil est le seul endroit où un adulte passe de façon fiable.

   D'où ce compromis : un encart SOBRE, explicitement étiqueté « Pour les
   parents », refermable, qui ne s'adresse pas à l'enfant et n'est pas
   anxiogène — jamais de « tu vas perdre ta progression ». La version complète
   (pourquoi, la purge iOS, comment installer selon l'appareil) vit dans le
   guide et dans l'espace encadrants, là où l'adulte vient de son plein gré.

   Rendu (calibré avec `designer-ux-enfant`) : un bandeau fin en PREMIER ENFANT
   de `#home`, traité comme un prolongement de la barre d'outils et non comme du
   contenu d'accueil. Ni dans `.home-grid`, ni parmi les cartes, ni en bas de
   page : un adulte à qui on tend une tablette ne fait pas défiler, et le seul
   endroit vu sans interaction est le haut. Il emprunte le registre encadrant
   (`--admin-bg`, `--admin-accent`, icône monochrome, jamais d'emoji) — l'app a
   déjà appris à l'enfant à lire ce gris-bleu comme « pas pour moi ».

   Ce qu'on s'interdit, et pourquoi : les couleurs et icônes d'alerte (elles
   disent « tu t'es trompé » dans les exercices, les réutiliser ici associerait
   l'accueil à l'échec) ; la mascotte (c'est la voix d'encouragement de l'app,
   lui faire dire « tu peux tout perdre » contaminerait le personnage) ; tout
   décompte visible (« il reste X jours »), qui est structurellement un signal
   de type FOMO et c'est ce qu'un enfant retiendrait en lisant par-dessus
   l'épaule ; le vocabulaire de récompense, qui doit rester univoque.

   La CADENCE, elle, est dans `core/rappel-sauvegarde.ts` (pure, testable).
   ============================================================ */
import {
	compterActivites,
	doitAfficherRappel,
	ecrireEtatRappel,
	lireEtatRappel,
	reporter,
} from '../core/rappel-sauvegarde';
import type { ContexteRappel } from '../core/rappel-sauvegarde';
import { engagementReel } from '../core/engagement';
import { exportProfiles, listProfiles } from '../core/profiles';
import { momentCalme } from './app-calme';
import type { SeuilsCalme } from './app-calme';
import { telechargerBlob } from './encadrant-commun';
import { icon } from './icon';
import { html, type SafeHtml, VIDE, joindre } from '../core/html';

const ID = 'rappelSauvegarde';
/* Fermeture, deux échelles (motif déjà en place pour la mise à jour, qui sépare
   l'anti-boucle par onglet de l'état durable) : « Fermer » masque pour le reste de
   la SESSION, sans condition — sinon on la reverrait à chaque aller-retour accueil
   → leçon → accueil. Le report croissant, lui, vit en `localStorage`. */
const CLE_SESSION = 'ludaskia_rappel_ferme';

/* Seuils du « moment calme » propres à l'encart. Le risque n'est pas d'interrompre
   un geste — un bandeau en tête d'un écran de menu n'interrompt rien — mais
   d'apparaître PENDANT un exercice. C'est donc la moitié « écran de menu, hors
   sprint ou révision » de `momentCalme` qui compte ici, et les délais sont mis à
   zéro délibérément : les exiger empêcherait l'encart de s'afficher à l'arrivée
   sur l'accueil, seul moment où il a une chance d'être vu. */
const SEUILS: SeuilsCalme = { minIdleMs: 0, minVisibleMs: 0 };

/* Invite d'installation native, quand le navigateur l'expose (`beforeinstallprompt`,
   Chromium). Là où elle existe, le bouton l'ouvre — une installation en un geste
   vaut mieux qu'un menu à chercher. Ailleurs (iOS notamment), il renvoie vers la
   note du guide. Le LIBELLÉ et la promesse, eux, ne changent jamais : pas de mode
   opératoire par plateforme sur l'accueil (beaucoup de parents n'ont pas de bagage
   informatique, et un discours qui varie selon l'appareil serait contre-productif). */
interface InvitePWA extends Event {
	prompt(): Promise<void>;
}
let invite: InvitePWA | null = null;

/** À appeler tôt (depuis `main.ts`) : l'événement n'est émis qu'une fois. */
export function initInstallationPWA(): void {
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault(); // sinon le navigateur affiche SA propre invite, quand il veut
		invite = e as InvitePWA;
	});
	// L'invite ne vaut plus rien une fois l'installation faite.
	window.addEventListener('appinstalled', () => {
		invite = null;
		masquer();
	});
}

/* L'app tourne-t-elle déjà comme une application installée ? Détection, pas
   variation de discours : on n'affiche simplement pas un conseil déjà suivi.
   `navigator.standalone` est le repli iOS (Safari n'expose pas `display-mode`
   pour les web apps ajoutées à l'écran d'accueil sur les versions anciennes). */
function dejaInstallee(): boolean {
	try {
		if (window.matchMedia('(display-mode: standalone)').matches) return true;
	} catch {
		// matchMedia indisponible : on retombe sur le repli iOS.
	}
	return (navigator as { standalone?: boolean }).standalone === true;
}

function fermeeCetteSession(): boolean {
	try {
		return sessionStorage.getItem(CLE_SESSION) === '1';
	} catch {
		return false;
	}
}

function marquerFermeeSession(): void {
	try {
		sessionStorage.setItem(CLE_SESSION, '1');
	} catch {
		// sessionStorage indisponible : l'encart réapparaîtra au prochain retour.
	}
}

/* Retire l'encart. Les trois chemins de fermeture (le bouton, un export réussi,
   une installation détectée) passent par ici, et tous suppriment du DOM l'élément qui
   a le focus : sans rien faire, celui-ci retomberait sur `<body>` et l'utilisateur
   clavier ou lecteur d'écran repartirait du début de la page au `Tab` suivant. On le
   reporte donc sur l'accueil — mais SEULEMENT s'il était dans l'encart, pour ne pas
   voler le focus à quelqu'un qui était ailleurs. */
function masquer(): void {
	const el = document.getElementById(ID);
	const avaitFocus = !!el && el.contains(document.activeElement);
	el?.remove();
	const home = document.getElementById('home');
	// La marge haute de l'accueil est rendue au conteneur (cf. la feuille de style).
	home?.classList.remove('home-rappel');
	if (avaitFocus) home?.focus();
}

/* Export EN UN GESTE, et TOUJOURS tous les profils. On réutilise exactement le
   chemin du bouton « Exporter les profils » de l'espace encadrant : pas de second
   format, pas de second chemin, et l'import existant fusionne déjà par UUID en
   gardant le plus récent. Un export mono-profil laisserait un adulte croire qu'il a
   sauvegardé toute la famille alors qu'il n'a qu'un enfant dans son fichier — d'où
   le libellé, qui le dit au moment du clic. */
function exporter(): void {
	const payload = exportProfiles(listProfiles().map((p) => p.uuid));
	if (!payload) return;
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
	telechargerBlob(`ludaskia-${payload.profiles.length}-profils.json`, blob);
	// `exportProfiles` a horodaté l'export : le rappel se tait pour la période.
	masquer();
}

function installer(): void {
	if (invite) {
		const p = invite;
		invite = null;
		void p.prompt().catch(() => {});
		return;
	}
	// Pas d'invite native : le guide explique comment faire, appareil par appareil.
	window.open(`${import.meta.env.BASE_URL}guide.html#installer`, '_blank', 'noopener');
}

function gabarit(installerVisible: boolean): SafeHtml {
	const actions = joindre(
		[
			installerVisible
				? html`<button type="button" class="rappel-cta" data-act="installer">Installer l'application<span class="sr-only"> (peut ouvrir un nouvel onglet)</span></button>`
				: VIDE,
			// « (tous les profils) » est obligatoire : sans lui, un adulte croirait avoir
			// sauvegardé toute la famille alors qu'il n'a qu'un enfant dans son fichier.
			// Le verbe est court pour que les deux actions tiennent sur une seule ligne
			// sur mobile — c'est ce qui fait la différence entre un bandeau fin et une
			// pile de deux boutons.
			html`<button type="button" class="rappel-cta" data-act="exporter">Sauvegarder (tous les profils)</button>`,
		].filter(Boolean),
	);
	// CONSTAT + option, sans dramatisation ni décompte, et court (le bandeau doit rester
	// fin). Écrit pour l'adulte, mais relu du point de vue de l'enfant qui passe dessus :
	// pas de champ lexical du danger — ni « à l'abri » (on ne met à l'abri que de quelque
	// chose, et un enfant anxieux cherche alors la menace), ni « perdre », ni « risque ».
	// « Sauvegarde » plutôt que « copie » pour parler comme le bouton et comme le reste
	// de l'application. Le « pourquoi » complet est dans l'espace encadrants et le guide.
	const texte =
		'La progression est enregistrée dans ce navigateur. Une sauvegarde permet de la garder ailleurs.';
	return html`
    <p class="rappel-etiquette">${icon('export')} Pour les parents</p>
    <p class="rappel-texte">${texte}</p>
    <div class="rappel-actions">${actions}</div>
    <button type="button" class="rappel-fermer" data-act="fermer" aria-label="Fermer ce message">×</button>`;
}

/* Rendu (ou retrait) de l'encart. Appelé à chaque arrivée sur l'accueil : c'est le
   seul écran où il a le droit d'apparaître, ce qui garantit à lui seul le « jamais
   pendant un exercice ». */
export function rafraichirRappelSauvegarde(): void {
	masquer();
	const home = document.getElementById('home');
	if (!home) return;
	if (fermeeCetteSession()) return;

	const now = Date.now();
	const etat = lireEtatRappel(now);
	const ctx: ContexteRappel = {
		engage: engagementReel(),
		activites: compterActivites(
			listProfiles().map((p) => p.uuid),
			etat.dernierExport,
		),
		installee: dejaInstallee(),
		now,
	};
	if (!doitAfficherRappel(etat, ctx)) return;
	if (!momentCalme(SEUILS)) return;

	// Installée ET rien à sauvegarder : il ne resterait rien à dire. La condition de
	// sauvegarde est portée par `doitAfficherRappel` (risque accumulé), on n'a donc
	// à trancher ici que la moitié « installation ».
	const el = document.createElement('section');
	el.id = ID;
	el.className = 'rappel-sauvegarde';
	// `role="region"` + libellé : un bloc repérable au lecteur d'écran, mais PAS une
	// alerte — rien ici n'est urgent, et `role="alert"` volerait le focus à l'enfant.
	el.setAttribute('role', 'region');
	el.setAttribute('aria-label', 'Message pour les parents');
	el.innerHTML = gabarit(!ctx.installee).balisage;
	// Le fond du bandeau n'est PAS cliquable : rupture volontaire avec la convention
	// « la carte entière est cliquable » de l'accueil, pour qu'un enfant ne l'explore
	// pas en tapotant partout. Seuls les trois boutons réagissent.
	el.addEventListener('click', (e) => {
		const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
		if (act === 'exporter') exporter();
		else if (act === 'installer') installer();
		else if (act === 'fermer') {
			marquerFermeeSession();
			const t = Date.now();
			const actuel = lireEtatRappel(t);
			// Un export a pu avoir lieu dans un AUTRE onglet depuis l'affichage : cet
			// encart-ci ne parle alors plus de rien, et le fermer ne doit pas défaire la
			// remise à zéro que l'export vient d'obtenir.
			if (actuel.dernierExport === etat.dernierExport) ecrireEtatRappel(reporter(actuel, t));
			masquer();
		}
	});
	home.prepend(el);
	home.classList.add('home-rappel'); // laisse le bandeau se coller à la barre d'outils
}
