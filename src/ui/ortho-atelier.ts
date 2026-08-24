/* ============================================================
   Mode Orthographe — atelier du mot (couche UI, SVG).
   Le mot s'affiche en gros, aéré. L'enfant SURLIGNE un piège en
   glissant le doigt/la souris sur une lettre ou un groupe de lettres
   contigües : au relâchement, un rectangle arrondi pastel est tracé
   (couleur auto, palette colorblind-safe Okabe-Ito). Un simple tap =
   une lettre. Un entourage ne traverse pas l'espace (borné au mot).
   Un geste qui recouvre un entourage existant le RETIRE (bascule, #462) :
   pas de superposition. Suppression aussi par « effacer le dernier » /
   « tout effacer ».
   En contexte correction, les lettres ratées (diff) sont soulignées.
   Voir docs/design-orthographe.md (§ Atelier du mot).
   ============================================================ */

import { lettresDuMot } from '../core/orthographe/exercise';
import { apercuGeste, basculerEntourage } from '../core/orthographe/entourages';
import type { Entourage, MotOrtho } from '../core/orthographe/types';
import { uiConfirm } from './ui-modal';
import { monterBoutonAide, maybeAutoAide } from './aide-exercice';
import { icon } from './icon';
import { html, type SafeHtml, joindre, VIDE, attribut } from '../core/html';

// Palette colorblind-safe (Okabe-Ito).
const PALETTE = ['#E69F00', '#56B4E9', '#009E73', '#0072B2', '#CC79A7', '#D55E00'];
const PAD = 6; // marge des rectangles autour des lettres entourées
const MIN_PX = 20; // plancher de police d'un mot rétréci (sous ça : pivoter en paysage)

/* Lettres d'un mot en spans `.atelier-lettre` (indices alignés sur lettresDuMot,
   espaces inclus → les index d'entourage restent valides). Partagé entre l'atelier
   et la page de relecture (#80). `diff` souligne les lettres ratées (correction). */
export function lettresMotHTML(mot: string, diff?: boolean[]): SafeHtml {
	return joindre(
		lettresDuMot(mot).map((l, i) =>
			l === ' '
				? html`<span class="atelier-lettre atelier-espace" data-i="${i}" data-space="1">&nbsp;</span>`
				: html`<span class="atelier-lettre" data-i="${i}"${diff?.[i] ? attribut('data-diff', '1') : ''}>${l}</span>`,
		),
	);
}

/* Trace les entourages (lecture seule) dans `svg`, calés sur les lettres de `motEl`.
   Extrait de l'atelier pour un rendu identique en relecture (#80), sans dupliquer le
   calcul d'offsets ni la palette. Sans effet si le mot n'est pas (encore) dans le DOM. */
export function dessinerEntourages(
	motEl: HTMLElement,
	svg: SVGSVGElement,
	entourages: Entourage[],
): void {
	if (!motEl.isConnected) return;
	const sp = [...motEl.querySelectorAll<HTMLElement>('.atelier-lettre')];
	const w = motEl.offsetWidth;
	const h = motEl.offsetHeight;
	svg.setAttribute('width', String(w));
	svg.setAttribute('height', String(h));
	svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
	svg.innerHTML = joindre(
		entourages.map((e, i) => {
			const a = sp[e.debut];
			const b = sp[e.fin];
			if (!a || !b) return VIDE; // entourage hors-bornes (mot modifié) : on l'ignore
			const x = a.offsetLeft - PAD;
			const y = a.offsetTop - PAD;
			const rw = b.offsetLeft + b.offsetWidth - a.offsetLeft + PAD * 2;
			const rh = a.offsetHeight + PAD * 2;
			const col = PALETTE[e.couleur % PALETTE.length];
			// `data-e` = index dans `entourages` : l'atelier s'en sert pour marquer
			// l'entourage qu'un geste va effacer (#462). Les entourages hors-bornes ne
			// produisent pas de rect → on ne peut PAS se fier à l'ordre des rects.
			return html`<rect data-e="${i}" x="${x}" y="${y}" width="${rw}" height="${rh}" rx="14" ry="16" fill="${col}" fill-opacity="0.22" stroke="${col}" stroke-width="2.5" />`;
		}),
	).balisage;
}

/* Rétrécit la police de `motEl` (en `white-space: nowrap`) pour qu'il tienne dans la
   largeur de CONTENU de son conteneur de page : un mot long (« aujourd'hui »,
   « trois-cent-cinquante-deux ») déborderait sinon, car il reste sur une ligne (pour
   caler les entourages SVG). À recalculer au `resize`. Partagé entre l'atelier
   (entourer) et le mode « afficher/cacher » (#263). Plancher ~20 px. */
export function ajusterTailleMot(motEl: HTMLElement, stage: HTMLElement): void {
	if (!motEl.isConnected) return; // détaché (retrace asynchrone tardif) : no-op sûr
	motEl.style.fontSize = ''; // repart de la taille SCSS (source de vérité)
	// Largeur réellement disponible = largeur de CONTENU du parent (.page), donc son
	// clientWidth MOINS son padding horizontal. .page a un padding (~68 px/côté) que
	// clientWidth inclut : sans le retrancher, on surestime la place et le mot
	// déborde malgré le rétrécissement (#166).
	const parent = stage.parentElement;
	let dispo = motEl.scrollWidth;
	if (parent) {
		const cs = getComputedStyle(parent);
		const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
		dispo = parent.clientWidth - padX - PAD * 2 - 4;
	}
	const naturel = motEl.scrollWidth;
	if (naturel > dispo) {
		const base = parseFloat(getComputedStyle(motEl).fontSize);
		let px = Math.max(MIN_PX, (base * dispo) / naturel);
		motEl.style.fontSize = `${px}px`;
		// Le padding px des lettres ne suit pas le ratio → courte correction.
		while (px > MIN_PX && motEl.scrollWidth > dispo) {
			px = Math.max(MIN_PX, px - 1);
			motEl.style.fontSize = `${px}px`;
		}
	}
}

interface AtelierOpts {
	onDone: () => void; // appelé au « Continuer » (après mise à jour de mot.entourage)
	diff?: boolean[]; // contexte correction : lettres (du mot) ratées à souligner
	consigne?: string;
	contexteHTML?: SafeHtml; // phrase à trou d'une cible verbe (#261), affichée en légende
	// Bouton « Écouter » : l'atelier devient audible comme les autres modes du parcours.
	// Fourni par le runner (voix dispo) ; absent sinon (pas de voix → pas de bouton).
	ecoute?: { label: string; onClick: () => void };
}

let resizeHandler: (() => void) | null = null;
function cleanupResize(): void {
	if (resizeHandler) {
		window.removeEventListener('resize', resizeHandler);
		resizeHandler = null;
	}
}

export function renderAtelier(host: HTMLElement, mot: MotOrtho, opts: AtelierOpts): void {
	cleanupResize();
	const lettres = lettresDuMot(mot.mot);
	// Réassigné (et non muté) : la bascule et les effacements passent par des
	// fonctions pures de core/orthographe/entourages.
	let entourages: Entourage[] = mot.entourage.map((e) => ({ ...e }));

	// Segments de mots : pour chaque lettre non-espace, bornes [start, end] de son mot.
	const segStart = new Array<number>(lettres.length).fill(-1);
	const segEnd = new Array<number>(lettres.length).fill(-1);
	for (let i = 0; i < lettres.length;) {
		if (lettres[i] === ' ') {
			i++;
			continue;
		}
		let j = i;
		while (j < lettres.length && lettres[j] !== ' ') j++;
		for (let k = i; k < j; k++) {
			segStart[k] = i;
			segEnd[k] = j - 1;
		}
		i = j;
	}

	const consigne =
		opts.consigne ??
		'Surligne les pièges : passe le doigt (ou la souris) sur les lettres où on pourrait se tromper.';

	host.innerHTML = html`
    <div class="page ortho-run">
      <p class="ortho-run-consigne">${consigne}</p>
      ${opts.contexteHTML ?? ''}
      ${opts.ecoute ? html`<div><button type="button" class="btn-primary ortho-ecouter" id="btnEcouterAtelier">${icon('speaker')} ${opts.ecoute.label}</button></div>` : ''}
      <div class="atelier-stage">
        <div class="atelier-mot" id="atelierMot">${lettresMotHTML(mot.mot, opts.diff)}</div>
        <svg class="atelier-svg" id="atelierSvg" aria-hidden="true"></svg>
      </div>
      <div class="atelier-actions">
        <button type="button" class="atelier-undo" id="atelierUndo">↩️ Effacer le dernier</button>
        <button type="button" class="atelier-undo" id="atelierClear">🧹 Tout effacer</button>
      </div>
      <div class="atelier-done"><button class="btn-primary" id="btnAtelierDone">Continuer →</button></div>
    </div>`.balisage;

	monterBoutonAide(host.querySelector('.ortho-run'), 'atelier'); // bouton « ? » persistant (#272)
	if (opts.ecoute) {
		host.querySelector('#btnEcouterAtelier')!.addEventListener('click', opts.ecoute.onClick);
	}

	const motEl = host.querySelector('#atelierMot') as HTMLElement;
	const stage = host.querySelector('.atelier-stage') as HTMLElement;
	const svg = host.querySelector('#atelierSvg') as unknown as SVGSVGElement;
	const spans = () => [...motEl.querySelectorAll<HTMLElement>('.atelier-lettre')];

	// --- état du geste ---
	let dragging = false;
	let startIdx = -1;
	let pend: [number, number] | null = null;
	let rects: DOMRect[] = [];

	// Lettre du segment de départ dont la colonne contient X (sinon la plus proche).
	function indexAt(clientX: number): number {
		const lo = segStart[startIdx];
		const hi = segEnd[startIdx];
		let best = startIdx;
		let bestDist = Infinity;
		for (let i = lo; i <= hi; i++) {
			const r = rects[i];
			if (!r) continue;
			if (clientX >= r.left && clientX <= r.right) return i;
			const d = Math.abs(clientX - (r.left + r.right) / 2);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		return best;
	}

	function setPending(a: number, b: number): void {
		pend = [Math.min(a, b), Math.max(a, b)];
		const [plo, phi] = pend;
		// Ce que le geste ferait (ajout, ou effacement d'un entourage recouvert) est
		// décidé dans core ; ici on ne fait que peindre. Un espace n'est jamais surligné.
		const { recouverts, etats } = apercuGeste(entourages, plo, phi);
		spans().forEach((s) => {
			const etat = s.dataset.space === '1' ? undefined : etats.get(Number(s.dataset.i));
			s.classList.toggle('sel', etat === 'ajout');
			s.classList.toggle('sel-effacer', etat === 'effacement');
			s.classList.toggle('sel-neutre', etat === 'neutre');
		});
		// Le signal de forme (tireté + estompé) porte sur le rectangle condamné lui-même :
		// UNE forme qui va disparaître, plutôt qu'un contour par lettre.
		marquerRects(new Set(recouverts));
	}
	function clearPending(): void {
		pend = null;
		spans().forEach((s) => s.classList.remove('sel', 'sel-effacer', 'sel-neutre'));
		marquerRects(new Set());
	}
	/* Marque `data-effacer` sur les rects des entourages d'indices `idx` (cf. `data-e`
	   posé par dessinerEntourages) : simple bascule d'attribut, sans retracer le SVG
	   (pas de lecture de layout à chaque `pointermove`). */
	function marquerRects(idx: Set<number>): void {
		svg.querySelectorAll<SVGRectElement>('rect[data-e]').forEach((r) => {
			r.toggleAttribute('data-effacer', idx.has(Number(r.dataset.e)));
		});
	}

	motEl.addEventListener('pointerdown', (e: PointerEvent) => {
		const t = (e.target as HTMLElement).closest('.atelier-lettre') as HTMLElement | null;
		if (!t || t.dataset.space === '1') return;
		dragging = true;
		startIdx = Number(t.dataset.i);
		rects = spans().map((s) => s.getBoundingClientRect());
		setPending(startIdx, startIdx);
		motEl.setPointerCapture(e.pointerId);
		e.preventDefault();
	});
	motEl.addEventListener('pointermove', (e: PointerEvent) => {
		if (dragging) setPending(startIdx, indexAt(e.clientX));
	});
	const finDrag = (): void => {
		if (!dragging) return;
		dragging = false;
		// Bascule : ajoute l'entourage, ou retire celui (ceux) que la plage recouvre.
		if (pend) entourages = basculerEntourage(entourages, pend[0], pend[1], PALETTE.length);
		clearPending();
		redrawSvg();
	};
	motEl.addEventListener('pointerup', finDrag);
	motEl.addEventListener('pointercancel', finDrag);

	function redrawSvg(): void {
		dessinerEntourages(motEl, svg, entourages);
	}

	host.querySelector('#atelierUndo')!.addEventListener('click', () => {
		entourages = entourages.slice(0, -1);
		redrawSvg();
	});
	host.querySelector('#atelierClear')!.addEventListener('click', async () => {
		if (entourages.length) {
			const ok = await uiConfirm({
				title: 'Tout effacer ?',
				message: 'Tu effaceras tout ce que tu as entouré.',
				confirmLabel: 'Tout effacer',
				cancelLabel: 'Non, je garde',
				destructive: true,
				confirmIcon: 'trash',
				emoji: '🗑️',
			});
			if (!ok) return;
		}
		entourages = [];
		redrawSvg();
	});

	host.querySelector('#btnAtelierDone')!.addEventListener('click', async () => {
		// Double négation supprimée (« Tu n'as rien entouré. Continuer quand même ? »).
		// Choix sûr = revenir entourer (primaire, focus) ; continuer reste possible.
		if (entourages.length === 0) {
			const ok = await uiConfirm({
				title: 'Tu veux continuer sans rien entourer ?',
				confirmLabel: 'Continuer quand même',
				cancelLabel: 'Je retourne entourer',
				emoji: '✏️',
			});
			if (!ok) return;
		}
		mot.entourage = entourages;
		cleanupResize();
		opts.onDone();
	});

	ajusterTailleMot(motEl, stage);
	redrawSvg();
	resizeHandler = () => {
		ajusterTailleMot(motEl, stage);
		redrawSvg();
	};
	window.addEventListener('resize', resizeHandler);

	maybeAutoAide('atelier'); // bulle d'aide au 1er lancement (une fois par profil)
}
