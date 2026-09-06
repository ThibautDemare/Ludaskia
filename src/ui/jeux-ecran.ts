/* ============================================================
   Étagère de jeux (#661) — l'ÉCRAN PLEIN d'un jeu, et le contrat des runners.

   La seule des quatre surfaces de l'étagère à être un écran plein (critère 39) :
   une grille manipulée au doigt ne tient pas dans les 560 px d'une modale.

   Ce module ne connaît AUCUN jeu en particulier. Il tient trois choses que
   chaque runner aurait sinon refaites à sa façon :
   - le retour : quitter ramène à l'ÉTAGÈRE, pas à l'accueil (critère 44), et
     c'est aussi ce qui se passe quand le plafond tombe ;
   - le décompte du temps joué, mesuré à la SORTIE et jamais affiché en cours de
     partie (critère 12) ;
   - la fin par plafond, en registre `--warn` et jamais `--ko` (critère 44) :
     avoir joué son temps n'est pas une faute.
   ============================================================ */
import { html, type SafeHtml } from '../core/html';
import { jeuParId } from '../core/jeux/catalogue';
import { ajouterTempsJoue, jeuxPossedes } from '../core/jeux/etat';
import { getJeuxPlafondMinutes, etagereJeuxActive } from '../core/profiles';
import { secondesRestantes } from '../core/jeux/etat';
import { openEtagere } from './jeux-etagere';

/** Ce qu'un runner de jeu doit fournir. Volontairement minuscule : tout ce qui
    est commun (retour, temps, plafond) est tenu ici, pas dans les runners. */
export interface RunnerJeu {
	/** Rend le jeu dans `hote`. `avantNouvellePartie` est à appeler juste avant de
	    (re)lancer une partie — voir sa documentation, le moment compte. */
	monter(hote: HTMLElement, avantNouvellePartie: () => boolean): void;
	/** Appelé quand on quitte l'écran : arrêter les minuteurs, les écouteurs. */
	demonter(): void;
}

type Fabrique = () => RunnerJeu;

/* Les runners s'enregistrent au lieu d'être importés ici : ce module n'a aucune
   raison de connaître la liste des jeux, et un import direct ferait grossir le
   bundle de tous les jeux dès l'ouverture de l'accueil. */
const FABRIQUES = new Map<string, Fabrique>();

export function enregistrerJeu(id: string, fabrique: Fabrique): void {
	FABRIQUES.set(id, fabrique);
}

let courant: RunnerJeu | null = null;
let debutMs = 0;

/* Cadre commun : le titre du jeu et le bouton de sortie. Le bandeau `#btnHome`
   reste l'échappatoire directe vers l'accueil (critère 44) — celui-ci ramène
   à l'étagère, c'est-à-dire là d'où l'on vient. */
function cadreHTML(titre: string): SafeHtml {
	return html`<h1 class="big jeu-titre">${titre}</h1>
		<button type="button" class="backlink-top" id="btnQuitterJeu">← Retour à mes jeux</button>
		<div class="jeu-plateau" id="jeuPlateau"></div>`;
}

/** Referme le jeu courant, décompte le temps joué, et rouvre l'étagère. */
export function quitterJeu(): void {
	if (!courant) return;
	demonterJeuActif();
	location.hash = 'accueil';
	// L'étagère se rouvre APRÈS le retour à l'accueil : c'est une modale, elle a
	// besoin que son écran hôte soit rendu (critère 39 + 44).
	window.setTimeout(openEtagere, 0);
}

/** Le jeu `id` est-il ouvrable maintenant ? */
export function jeuOuvrable(id: string): boolean {
	return (
		etagereJeuxActive() &&
		jeuxPossedes().includes(id) &&
		FABRIQUES.has(id) &&
		secondesRestantes(getJeuxPlafondMinutes()) > 0
	);
}

/** Monte un jeu dans l'écran plein. Rend `false` s'il n'est pas ouvrable — au
    routeur de décider quoi faire (rendre la main à l'accueil). */
export function monterJeu(id: string, hote: HTMLElement): boolean {
	const jeu = jeuParId(id);
	const fabrique = FABRIQUES.get(id);
	if (!jeu || !fabrique || !jeuOuvrable(id)) return false;

	hote.innerHTML = cadreHTML(jeu.label).balisage;
	hote.querySelector('#btnQuitterJeu')?.addEventListener('click', quitterJeu);

	courant = fabrique();
	debutMs = Date.now();
	courant.monter(hote.querySelector<HTMLElement>('#jeuPlateau')!, avantNouvellePartie);
	return true;
}

/** À appeler par un runner JUSTE AVANT de (re)lancer une partie. Solde le temps
    joué et regarde le plafond du jour. Rend `false` — et referme l'écran — quand
    il est épuisé ; le runner ne doit alors PAS démarrer sa partie.

    Le moment est tout, et la première version se trompait dessus. Elle vérifiait
    le plafond à la FIN d'une partie : sur la dernière partie de la journée, cela
    refermait l'écran au moment même où le Motus venait de révéler le mot
    cherché. Pas un cas tordu — tous les jours, et c'est exactement ce que le
    critère 34 interdit (« le mot correct est la dernière chose que l'enfant
    voit »). Repéré par l'auteur du runner Motus, qui a refusé la consigne
    plutôt que de livrer ça.

    Conséquence assumée, à savoir : le plafond borne le nombre de parties qu'on
    peut COMMENCER, pas le temps de jeu à la seconde près. Une partie déjà
    lancée va à son terme. C'est une lecture souple du critère 44 — l'alternative
    (interrompre en plein coup) échange un dépassement de quelques minutes contre
    une frustration certaine, et casserait le critère 34 par-dessus le marché. */
function avantNouvellePartie(): boolean {
	if (debutMs) {
		ajouterTempsJoue((Date.now() - debutMs) / 1000);
		debutMs = Date.now();
	}
	if (secondesRestantes(getJeuxPlafondMinutes()) > 0) return true;
	quitterJeu();
	return false;
}

/** Démonte le jeu courant SANS naviguer : le temps joué est décompté, le runner
    arrêté. Appelé par le routeur à chaque changement d'écran.

    Sans ça, sortir par le bandeau `#btnHome` laissait le runner vivant et le
    temps joué NON décompté — une fuite de plafond silencieuse, et d'autant plus
    facile à ne jamais voir qu'elle profite à l'enfant. Repérée par l'auteur du
    runner Motus. `quitterJeu` ne peut pas servir ici : il navigue et rouvre
    l'étagère, ce qui est le bon geste pour un retour volontaire et le mauvais
    pour un simple changement de route. */
export function demonterJeuActif(): void {
	if (!courant) return;
	courant.demonter();
	courant = null;
	if (debutMs) ajouterTempsJoue((Date.now() - debutMs) / 1000);
	debutMs = 0;
}
