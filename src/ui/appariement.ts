/* ============================================================
   Widget « appariement » (#392) — relier des paires par des LIGNES de liaison.
   L'enfant relie chaque mot d'une colonne gauche à son correspondant d'une
   colonne droite (familles de mots : base ↔ dérivé). Rendu = deux colonnes de
   boutons-mots côte à côte + un calque SVG de courbes reliant les ancres,
   dessiné DERRIÈRE les mots.

   Interaction (validée avec designer-ux-enfant + relecteur-accessibilite) :
   - PRIMAIRE : tap en deux temps, fiable au doigt ET nativement clavier —
     taper un mot à gauche l'ARME (aria-pressed), taper un mot à droite trace le
     trait. Retaper un mot relié efface son lien. Les mots sont de vrais
     <button> : Entrée/Espace passent par `click`, aucun keydown à écrire.
   - APPOINT : glisser-déposer natif (souris/desktop) d'un mot de gauche sur un
     mot de droite. Même état final que le tap (SC 2.5.7 : le glissé n'est jamais
     l'unique voie).
   Feedback DIFFÉRÉ (bouton « Vérifier » du runner) : chaque lien est figé et
   marqué ✓/✗ (couleur + pastille + trait plein/pointillé, jamais la couleur
   seule) ; la bonne réponse est révélée en TEXTE sous le widget par le runner.

   Le calque SVG est `aria-hidden` (décoratif) : toute l'information de liaison est
   portée par les libellés des boutons + une live region (#lappStatus). Les
   coordonnées sont mesurées RELATIVEMENT au conteneur (deltas de
   getBoundingClientRect) → indépendantes du défilement de page ; un
   ResizeObserver les recalcule au redimensionnement / zoom (SC 1.4.4/1.4.10).

   Corrigé par le runner (ui/lecon-appariement.ts) : expose `verify()` (fige +
   marque + renvoie la justesse globale) et notifie la complétude via `onState`.
   Modèle calqué sur les widgets à tuiles (ui/tuile-interaction.ts) dont il
   réutilise le contrat `TuileController`/`TuileOptions` et la tuile `.tuile`.
   ============================================================ */
import { escapeHTML, sample } from '../core/utils';
import type { TuileController, TuileOptions } from './tuile-interaction';

export interface AppariementSpec {
	question: string;
	paires: { gauche: string; droite: string }[];
	intrus?: string[];
}

/* Un point d'ancrage (bord intérieur d'un mot), en coordonnées RELATIVES au board. */
interface Point {
	x: number;
	y: number;
}

export function bindAppariement(
	root: HTMLElement,
	spec: AppariementSpec,
	opts: TuileOptions,
): TuileController {
	// Ordre d'affichage mélangé INDÉPENDAMMENT dans chaque colonne (jamais aligné) :
	// l'enfant relie sur la relation, pas sur une position mémorisée (cf. pédagogue).
	const gauches = sample(
		spec.paires.map((p) => p.gauche),
		spec.paires.length,
	);
	const droitesToutes = [...spec.paires.map((p) => p.droite), ...(spec.intrus ?? [])];
	const droites = sample(droitesToutes, droitesToutes.length);
	// Correspondance correcte base → dérivé (identité par le mot, pas par la position).
	const bonneDroite = new Map(spec.paires.map((p) => [p.gauche, p.droite]));

	const linkOf: Record<string, string> = {}; // gauche → droite reliée (au plus une)
	let armed: string | null = null; // mot de gauche « armé » (1er tap), en attente du 2e
	let frozen = false;

	const reverse = (): Record<string, string> => {
		const r: Record<string, string> = {};
		for (const g of Object.keys(linkOf)) r[linkOf[g]] = g;
		return r;
	};
	const complete = (): boolean => gauches.every((g) => linkOf[g] !== undefined);

	const mount = root.querySelector('[data-tuile-mount]');
	if (mount) {
		mount.outerHTML = `
    <p class="lapp-consigne">Touche un mot, puis le mot qui va avec. Un trait les relie.</p>
    <div class="lapp-board" id="lappBoard">
      <svg class="lapp-links" id="lappLinks" aria-hidden="true" focusable="false"></svg>
      <div class="lapp-marks" id="lappMarks" aria-hidden="true"></div>
      <div class="lapp-cols">
        <div class="lapp-col lapp-col--g" role="group" aria-label="Mots à relier">
          ${gauches.map((g) => motBtn(g, 'g')).join('')}
        </div>
        <div class="lapp-col lapp-col--d" role="group" aria-label="Mots proposés">
          ${droites.map((d) => motBtn(d, 'd')).join('')}
        </div>
      </div>
    </div>
    <p class="sr-only" id="lappStatus" role="status" aria-live="polite" aria-atomic="true"></p>`;
	}

	const board = root.querySelector('#lappBoard') as HTMLElement;
	const svg = root.querySelector('#lappLinks') as unknown as SVGSVGElement;
	const marks = root.querySelector('#lappMarks') as HTMLElement;
	const status = root.querySelector('#lappStatus') as HTMLElement | null;
	const announce = (msg: string): void => {
		if (status) status.textContent = msg;
	};
	// Index des boutons par côté + mot (les nœuds PERSISTENT — mise à jour en place —
	// donc les références restent valides ; évite tout échappement de sélecteur).
	const gBtn: Record<string, HTMLButtonElement> = {};
	const dBtn: Record<string, HTMLButtonElement> = {};
	board.querySelectorAll<HTMLButtonElement>('.lapp-mot').forEach((b) => {
		(b.dataset.side === 'g' ? gBtn : dBtn)[b.dataset.id!] = b;
	});

	/* ---- Rendu des états (mise à jour EN PLACE : le focus clavier est préservé) ---- */
	function refreshButtons(): void {
		const rev = reverse();
		board.querySelectorAll<HTMLButtonElement>('.lapp-mot').forEach((btn) => {
			const id = btn.dataset.id!;
			const side = btn.dataset.side as 'g' | 'd';
			const linked = side === 'g' ? linkOf[id] !== undefined : rev[id] !== undefined;
			const g = side === 'g' ? id : rev[id];
			const ok = linked && bonneDroite.get(g) === linkOf[g];
			btn.classList.toggle('is-armed', !frozen && side === 'g' && armed === id);
			btn.classList.toggle('is-linked', !frozen && linked);
			btn.classList.toggle('correct', frozen && linked && ok);
			btn.classList.toggle('wrong', frozen && linked && !ok);
			btn.classList.toggle('is-decoy', frozen && !linked);
			if (!frozen && side === 'g' && armed === id) btn.setAttribute('aria-pressed', 'true');
			else btn.removeAttribute('aria-pressed');
			btn.disabled = frozen;
			btn.draggable = !frozen && side === 'g';
			btn.setAttribute('aria-label', label(side, id, linked, g, ok));
		});
	}

	function label(side: 'g' | 'd', id: string, linked: boolean, g: string, ok: boolean): string {
		if (frozen) {
			if (side === 'g') {
				if (!linked)
					return `${id}, non relié, incorrect. La bonne réponse était ${bonneDroite.get(id)}.`;
				return ok
					? `${id}, relié à ${linkOf[id]}, correct.`
					: `${id}, relié à ${linkOf[id]}, incorrect. La bonne réponse était ${bonneDroite.get(id)}.`;
			}
			return linked ? `${id}, relié, ${ok ? 'correct' : 'incorrect'}.` : id;
		}
		if (side === 'g') {
			return linked ? `Retirer le lien entre ${id} et ${linkOf[id]}` : `Relier le mot ${id}`;
		}
		return linked ? `Retirer le lien avec ${id}` : `Relier au mot ${id}`;
	}

	/* ---- Rendu du calque SVG (mesuré relativement au board, recalculé au resize) ---- */
	function renderLinks(): void {
		const boardRect = board.getBoundingClientRect();
		if (boardRect.width === 0) return; // pas encore en page
		svg.setAttribute('width', String(boardRect.width));
		svg.setAttribute('height', String(boardRect.height));
		svg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
		const anchor = (btn: HTMLElement, side: 'g' | 'd'): Point => {
			const r = btn.getBoundingClientRect();
			return {
				x: (side === 'g' ? r.right : r.left) - boardRect.left,
				y: r.top - boardRect.top + r.height / 2,
			};
		};
		let paths = '';
		let marksHTML = '';
		for (const g of gauches) {
			const d = linkOf[g];
			if (d === undefined) continue;
			const bg = gBtn[g];
			const bd = dBtn[d];
			if (!bg || !bd) continue;
			const a = anchor(bg, 'g');
			const b = anchor(bd, 'd');
			const dx = (b.x - a.x) * 0.5; // sortie/entrée horizontales (courbe de Bézier)
			const cls = frozen ? (bonneDroite.get(g) === d ? 'correct' : 'wrong') : '';
			paths += `<path class="lapp-link ${cls}" d="M ${a.x} ${a.y} C ${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}" />`;
			if (frozen) {
				const ok = bonneDroite.get(g) === d;
				const mx = (a.x + b.x) / 2;
				const my = (a.y + b.y) / 2;
				marksHTML += `<span class="lapp-mark ${ok ? 'correct' : 'wrong'}" style="left:${mx}px;top:${my}px">${ok ? '✓' : '✗'}</span>`;
			}
		}
		svg.innerHTML = paths;
		marks.innerHTML = marksHTML;
	}

	function redraw(): void {
		refreshButtons();
		renderLinks();
		if (!frozen) opts.onState(complete());
	}

	/* ---- Transitions d'état ---- */
	function tapGauche(g: string): void {
		if (frozen) return;
		if (linkOf[g] !== undefined) {
			// mot déjà relié → retaper efface son lien (jamais de ré-armement implicite)
			const d = linkOf[g];
			delete linkOf[g];
			if (armed === g) armed = null;
			announce(`Lien retiré : ${g} et ${d}.`);
			redraw();
			return;
		}
		armed = armed === g ? null : g; // (dés)arme ; aria-pressed suffit, pas d'annonce
		redraw();
	}
	function tapDroite(d: string): void {
		if (frozen) return;
		const rev = reverse();
		if (rev[d] !== undefined) {
			// mot de droite occupé → retire son lien EN PRIORITÉ (pas d'écrasement silencieux)
			const g = rev[d];
			delete linkOf[g];
			announce(`Lien retiré : ${g} et ${d}.`);
			redraw();
			return;
		}
		if (armed) relier(armed, d); // sinon : rien (aucun mot armé)
	}
	function relier(g: string, d: string): void {
		if (frozen || bonneDroite.get(g) === undefined) return;
		// glisser-déposer : le mot de droite peut déjà porter un lien → on le libère (et on
		// annonce cette déliaison implicite, sinon un lecteur d'écran ne l'apprend pas).
		const rev = reverse();
		const displaced = rev[d];
		if (displaced !== undefined) delete linkOf[displaced];
		linkOf[g] = d;
		armed = null;
		announce(
			displaced !== undefined
				? `Lien retiré : ${displaced} et ${d}. ${g} relié à ${d}.`
				: `${g} relié à ${d}.`,
		);
		redraw();
	}

	/* ---- Événements (délégation ; clavier natif via <button>) ---- */
	board.addEventListener('click', (e) => {
		const btn = (e.target as HTMLElement).closest('.lapp-mot') as HTMLButtonElement | null;
		if (!btn || frozen) return;
		const id = btn.dataset.id!;
		if (btn.dataset.side === 'g') tapGauche(id);
		else tapDroite(id);
	});
	board.addEventListener('dragstart', (e) => {
		const btn = (e.target as HTMLElement).closest('.lapp-mot[data-side="g"]') as HTMLElement | null;
		if (btn && !frozen) e.dataTransfer?.setData('text/plain', btn.dataset.id!);
	});
	board.addEventListener('dragover', (e) => {
		if (!frozen && (e.target as HTMLElement).closest('.lapp-mot[data-side="d"]'))
			e.preventDefault();
	});
	board.addEventListener('drop', (e) => {
		const btn = (e.target as HTMLElement).closest('.lapp-mot[data-side="d"]') as HTMLElement | null;
		if (!btn || frozen) return;
		e.preventDefault();
		const g = e.dataTransfer?.getData('text/plain');
		if (g && bonneDroite.get(g) !== undefined) relier(g, btn.dataset.id!);
	});

	// Recalcule les traits au redimensionnement / zoom (les mots persistent, seules les
	// coordonnées changent). Le premier appel synchrone de l'observer dessine aussi les
	// traits une fois la mise en page connue.
	const ro = new ResizeObserver(() => renderLinks());
	ro.observe(board);

	redraw();

	return {
		verify(): boolean {
			const correct = gauches.every((g) => linkOf[g] === bonneDroite.get(g));
			if (frozen) return correct;
			frozen = true;
			armed = null;
			redraw(); // fige, marque chaque lien (✓/✗, plein/pointillé) et chaque mot
			announce(
				`Vérification faite : ${gauches.filter((g) => linkOf[g] === bonneDroite.get(g)).length} bonnes paires sur ${gauches.length}.`,
			);
			ro.disconnect();
			return correct;
		},
	};
}

/* Un bouton-mot d'une colonne (réutilise la tuile `.tuile`). L'aria-label est posé
   dynamiquement par refreshButtons (état + verdict) ; ici on ne met que le texte. */
function motBtn(mot: string, side: 'g' | 'd'): string {
	return `<button type="button" class="tuile lapp-mot lapp-mot--${side}" data-side="${side}" data-id="${escapeHTML(mot)}">${escapeHTML(mot)}</button>`;
}
