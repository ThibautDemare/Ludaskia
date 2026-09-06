/* ============================================================
   Étagère de jeux (#661) — le RUNNER du 2048 (critères 15 à 18).

   Jeu-REFUGE : il ne déclare aucune compétence, ignore le niveau scolaire
   (critère 16), ne corrige rien et ne note rien. Trois conséquences directes
   sur ce fichier, à ne pas relâcher :
   - aucun import de `niveauActif` ni de quoi que ce soit qui lise la classe du
     profil : rien de son comportement ne doit en dépendre ;
   - aucun appel à `capterErreur` (critère 24). Un jeu ne produit pas d'erreur
     à journaliser parce qu'il ne CORRIGE pas : il n'y a pas de bonne réponse
     à côté de laquelle l'enfant serait passé ;
   - aucun appel à l'XP, aux étoiles, aux médailles ou aux objectifs
     (critère 23). Le seul chiffre persisté est le meilleur score, LOCAL au jeu
     (critère 17), via `meilleurScore`/`enregistrerScore`.

   Le moteur de grille vit dans `core/jeux/deux-mille-quarante-huit.ts` et il est
   pur : ici on ne fait que l'interface. La règle du moteur qu'on peut casser
   depuis CE fichier, en revanche, est celle-ci : **une tuile n'apparaît que si
   le coup a bougé**. `glisser` rend `bouge` ; l'ignorer remplirait la grille
   pendant que l'enfant tâtonne, et la partie mourrait toute seule sans qu'il
   ait rien joué.

   ── Trois commandes, et ce n'est pas du luxe (critère 18) ─────────────────────
   Le glissement au doigt est la commande naturelle en portrait, mais c'est la
   seule qui exige un geste précis. Un enfant dyspraxique, une souris, un
   clavier : chacun a besoin d'une porte d'entrée. On en tient donc trois, et
   elles passent toutes par `jouer(direction)` :
   - le GLISSEMENT au doigt ou à la souris (pointer events) ;
   - quatre BOUTONS directionnels en croix, cibles larges, toujours visibles —
     c'est la commande explicite, pas un repli caché derrière une option ;
   - les FLÈCHES du clavier, en complément.
   ============================================================ */
import { html, joindre, type SafeHtml } from '../core/html';
import { randFloat } from '../core/utils';
import {
	COTE,
	ajouterTuile,
	glisser,
	grilleVide,
	partieFinie,
	type Direction,
	type Grille,
} from '../core/jeux/deux-mille-quarante-huit';
import { enregistrerScore, meilleurScore } from '../core/jeux/etat';
import { enregistrerJeu, type RunnerJeu } from './jeux-ecran';

/* L'id du jeu. Il est REDIT en clair dans l'appel d'enregistrement, tout en bas,
   et ce n'est pas une étourderie : `tests/couverture-e2e-gate.test.ts` (critère 19)
   lit ce FICHIER, au motif « nom de la fonction, puis un id entre apostrophes »,
   pour rattacher le runner à une spec e2e. Une constante y passerait pour un id
   VIDE, et le gate rougirait en accusant le runner de n'être atteignable par
   aucune route. Corollaire, appris à la dure : ne pas écrire ce motif ailleurs
   dans le fichier — un COMMENTAIRE qui le cite est lu le premier, et le gate
   croit alors que le jeu s'appelle « <id> ». */
const ID_JEU = '2048';

/** Distance minimale, en pixels CSS, pour qu'un geste vaille un coup. Assez bas
    pour ne pas exiger un grand mouvement du bras, assez haut pour qu'un simple
    tapotement tremblé ne déclenche pas un glissement non voulu. */
const SEUIL_GLISSEMENT = 24;

const DIRECTIONS: Direction[] = ['haut', 'bas', 'gauche', 'droite'];

/* `Direction | undefined` explicitement : `noUncheckedIndexedAccess` n'est pas
   activé, donc sans ça une touche inconnue se typerait `Direction` et le garde
   plus bas ne serait plus qu'un vœu. */
const TOUCHES: Record<string, Direction | undefined> = {
	ArrowUp: 'haut',
	ArrowDown: 'bas',
	ArrowLeft: 'gauche',
	ArrowRight: 'droite',
};

function estDirection(v: string | undefined): v is Direction {
	return DIRECTIONS.some((d) => d === v);
}

/* Une case : `data-valeur` est le sélecteur stable des specs e2e
   (`.g2048-case[data-valeur]`), avec `"0"` pour une case vide. `data-chiffres`
   ne sert qu'à la taille du texte — un « 1024 » ne tient pas dans la case au
   corps d'un « 2 ». */
function caseHTML(): SafeHtml {
	return html`<div
		class="g2048-case"
		role="cell"
		data-valeur="0"
		data-chiffres="0"
		aria-label="vide"
	></div>`;
}

function ligneHTML(): SafeHtml {
	return html`<div class="g2048-ligne" role="row">
		${joindre([...Array(COTE)].map(caseHTML))}
	</div>`;
}

function boutonHTML(dir: Direction, glyphe: string, libelle: string): SafeHtml {
	return html`<button
		type="button"
		class="g2048-dir g2048-dir-${dir}"
		data-dir="${dir}"
		aria-label="${libelle}"
	>
		<span aria-hidden="true">${glyphe}</span>
	</button>`;
}

/* Le squelette est rendu UNE fois, puis seules les valeurs bougent (cf.
   `peindre`). Un `innerHTML` à chaque coup serait plus court à écrire, mais il
   détruirait le bouton qui a le focus : l'enfant au clavier perdrait la main
   après chaque déplacement. */
function plateauHTML(): SafeHtml {
	return html`<div class="g2048">
		<div class="g2048-zone">
			<div class="g2048-scores">
				<p class="g2048-score">Score <strong id="g2048Score">0</strong></p>
				<p class="g2048-record">Meilleur score <strong id="g2048Record">0</strong></p>
			</div>
			<div class="g2048-grille" role="table" aria-label="Grille du 2048">
				${joindre([...Array(COTE)].map(ligneHTML))}
			</div>
			<div class="g2048-fin" id="g2048Fin" hidden>
				<p class="g2048-fin-titre">Partie terminée !</p>
				<p class="g2048-fin-score" id="g2048FinScore"></p>
				<button type="button" class="g2048-rejouer" id="g2048Rejouer">Nouvelle partie</button>
			</div>
		</div>
		<p class="sr-only" id="g2048Annonce" role="status" aria-live="polite" aria-atomic="true"></p>
		<div class="g2048-commandes" role="group" aria-label="Déplacer les tuiles">
			${boutonHTML('haut', '▲', 'Déplacer vers le haut')}
			${boutonHTML('gauche', '◀', 'Déplacer vers la gauche')}
			${boutonHTML('droite', '▶', 'Déplacer vers la droite')}
			${boutonHTML('bas', '▼', 'Déplacer vers le bas')}
		</div>
	</div>`;
}

function creerRunner(): RunnerJeu {
	let grille: Grille = grilleVide();
	let score = 0;
	let fini = false;
	/* Le record AU DÉBUT de la partie en cours : c'est lui qui permet de dire
	   « nouveau record » à la fin, et de ne pas se comparer à soi-même. */
	let record = 0;
	let racine: HTMLElement | null = null;
	let cases: HTMLElement[] = [];
	let avantNouvellePartie: (() => boolean) | null = null;
	let depart: { x: number; y: number; pid: number } | null = null;

	const dans = <T extends HTMLElement>(sel: string): T | null =>
		racine ? racine.querySelector<T>(sel) : null;

	const ecrire = (sel: string, texte: string): void => {
		const el = dans(sel);
		if (el) el.textContent = texte;
	};

	const peindre = (annonce?: string): void => {
		if (!racine) return;
		cases.forEach((el, i) => {
			const v = grille[Math.floor(i / COTE)][i % COTE];
			el.dataset.valeur = String(v);
			el.dataset.chiffres = v === 0 ? '0' : String(String(v).length);
			el.textContent = v === 0 ? '' : String(v);
			el.setAttribute('aria-label', v === 0 ? 'vide' : String(v));
		});
		ecrire('#g2048Score', String(score));
		/* Le record se met à jour DANS la partie, dès qu'il est battu : attendre
		   la fin priverait l'enfant du seul retour qui l'intéresse pendant qu'il
		   joue. Rien ne sort du jeu pour autant (critère 17). */
		ecrire('#g2048Record', String(Math.max(record, score)));

		const fin = dans('#g2048Fin');
		if (fin) fin.hidden = !fini;
		if (fini) {
			const bat = score > record;
			ecrire(
				'#g2048FinScore',
				bat ? `Tu as fait ${score} points. Nouveau record !` : `Tu as fait ${score} points.`,
			);
		}
		if (annonce) ecrire('#g2048Annonce', annonce);
	};

	/* `rendreLeFocus` : rejouer efface le panneau de fin, donc le bouton qui vient
	   d'être actionné disparaît sous le doigt (ou sous le focus clavier). Sans ce
	   relais, l'enfant au clavier se retrouverait rendu au `body`. À l'ouverture
	   de l'écran, au contraire, on ne prend le focus de personne. */
	const nouvellePartie = (rendreLeFocus: boolean): void => {
		grille = ajouterTuile(ajouterTuile(grilleVide(), randFloat), randFloat);
		score = 0;
		fini = false;
		record = meilleurScore(ID_JEU);
		peindre('Nouvelle partie.');
		if (rendreLeFocus) dans<HTMLButtonElement>('.g2048-dir')?.focus();
	};

	const jouer = (dir: Direction): void => {
		if (fini || !racine) return;
		const coup = glisser(grille, dir);
		/* LA règle à ne pas rater : pas de tuile si rien n'a bougé. Sinon la
		   grille se remplit alors que l'enfant n'a pas joué de coup. */
		if (!coup.bouge) return;
		grille = ajouterTuile(coup.grille, randFloat);
		score += coup.gain;
		fini = partieFinie(grille);
		peindre(fini ? `Partie terminée. ${score} points.` : `Score ${score}.`);
		if (!fini) return;

		/* Le record est rangé ici, à la fin de la partie. Le PLAFOND, lui, ne se
		   regarde pas maintenant : le panneau de fin doit rester lisible. Il se
		   regarde quand l'enfant demande une nouvelle partie (cf. `rejouer`). */
		enregistrerScore(ID_JEU, score);
		dans<HTMLButtonElement>('#g2048Rejouer')?.focus();
	};

	/* Relance demandée par l'enfant. `avantNouvellePartie` solde le temps joué et
	   dit si le plafond du jour permet encore une partie ; quand il rend `false`,
	   il a déjà ramené à l'étagère et il n'y a plus rien à peindre. */
	const rejouer = (): void => {
		if (!avantNouvellePartie?.()) return;
		nouvellePartie(true);
	};

	/* ---------- Les trois commandes ---------- */

	const surAppui = (e: PointerEvent): void => {
		// Un appui sur une commande est un CLIC, pas le début d'un glissement.
		if ((e.target as HTMLElement | null)?.closest('button')) return;
		depart = { x: e.clientX, y: e.clientY, pid: e.pointerId };
	};

	/* Le relâchement est écouté sur `window`, pas sur la grille : un doigt qui
	   sort du plateau avant de se lever est le cas NORMAL d'un glissement franc,
	   et l'écouter sur la grille perdrait justement les gestes les plus nets. */
	const surRelache = (e: PointerEvent): void => {
		if (!depart || depart.pid !== e.pointerId) return;
		const dx = e.clientX - depart.x;
		const dy = e.clientY - depart.y;
		depart = null;
		if (Math.abs(dx) < SEUIL_GLISSEMENT && Math.abs(dy) < SEUIL_GLISSEMENT) return;
		if (Math.abs(dx) > Math.abs(dy)) jouer(dx > 0 ? 'droite' : 'gauche');
		else jouer(dy > 0 ? 'bas' : 'haut');
	};

	const surAnnule = (): void => {
		depart = null;
	};

	const surTouche = (e: KeyboardEvent): void => {
		const dir = TOUCHES[e.key];
		if (!dir || fini) return;
		// Défensif : aucune saisie dans ce jeu aujourd'hui, mais une flèche appartient
		// au champ qui a le focus, jamais au jeu qui est derrière.
		if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]'))
			return;
		e.preventDefault(); // sinon la page défile sous la grille à chaque coup
		jouer(dir);
	};

	const surClic = (e: MouseEvent): void => {
		const cible = e.target as HTMLElement | null;
		const dir = cible?.closest<HTMLElement>('[data-dir]')?.dataset.dir;
		if (estDirection(dir)) {
			jouer(dir);
			return;
		}
		if (cible?.closest('#g2048Rejouer')) rejouer();
	};

	return {
		monter(hote, demanderPartie) {
			hote.innerHTML = plateauHTML().balisage;
			racine = hote.querySelector<HTMLElement>('.g2048');
			cases = [...hote.querySelectorAll<HTMLElement>('.g2048-case')];
			avantNouvellePartie = demanderPartie;

			racine?.addEventListener('pointerdown', surAppui);
			racine?.addEventListener('click', surClic);
			window.addEventListener('pointerup', surRelache);
			window.addEventListener('pointercancel', surAnnule);
			document.addEventListener('keydown', surTouche);

			nouvellePartie(false);
		},
		demonter() {
			racine?.removeEventListener('pointerdown', surAppui);
			racine?.removeEventListener('click', surClic);
			window.removeEventListener('pointerup', surRelache);
			window.removeEventListener('pointercancel', surAnnule);
			document.removeEventListener('keydown', surTouche);
			/* Une partie ABANDONNÉE garde son score : quitter en cours de route ne
			   doit pas effacer un record qui vient d'être battu. `enregistrerScore`
			   ignore tout score qui ne bat pas le record, l'appel est donc sans
			   effet dans le cas courant. */
			enregistrerScore(ID_JEU, score);
			racine = null;
			cases = [];
			avantNouvellePartie = null;
			depart = null;
		},
	};
}

enregistrerJeu('2048', creerRunner); // id en clair : cf. le commentaire de ID_JEU
