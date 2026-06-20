/* ============================================================
   Mode Orthographe — atelier du mot (couche UI, SVG).
   Le mot s'affiche en gros, aéré. L'enfant SURLIGNE un piège en
   glissant le doigt/la souris sur une lettre ou un groupe de lettres
   contigües : au relâchement, un rectangle arrondi pastel est tracé
   (couleur auto, palette colorblind-safe Okabe-Ito). Un simple tap =
   une lettre. Un entourage ne traverse pas l'espace (borné au mot).
   Suppression : « effacer le dernier » / « tout effacer ».
   En contexte correction, les lettres ratées (diff) sont soulignées.
   Voir docs/design-orthographe.md (§ Atelier du mot).
   ============================================================ */
import { escapeHTML } from '../core/utils';
import { lettresDuMot } from '../core/orthographe/exercise';
import type { Entourage, MotOrtho } from '../core/orthographe/types';
import { uiConfirm } from './ui-modal';

// Palette colorblind-safe (Okabe-Ito).
const PALETTE = ['#E69F00', '#56B4E9', '#009E73', '#0072B2', '#CC79A7', '#D55E00'];
const PAD = 6; // marge des rectangles autour des lettres entourées
const MIN_PX = 20; // plancher de police d'un mot rétréci (sous ça : pivoter en paysage)

/* Lettres d'un mot en spans `.atelier-lettre` (indices alignés sur lettresDuMot,
   espaces inclus → les index d'entourage restent valides). Partagé entre l'atelier
   et la page de relecture (#80). `diff` souligne les lettres ratées (correction). */
export function lettresMotHTML(mot: string, diff?: boolean[]): string {
	return lettresDuMot(mot)
		.map((l, i) =>
			l === ' '
				? `<span class="atelier-lettre atelier-espace" data-i="${i}" data-space="1">&nbsp;</span>`
				: `<span class="atelier-lettre" data-i="${i}"${diff?.[i] ? ' data-diff="1"' : ''}>${escapeHTML(l)}</span>`,
		)
		.join('');
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
	svg.innerHTML = entourages
		.map((e) => {
			const a = sp[e.debut];
			const b = sp[e.fin];
			if (!a || !b) return ''; // entourage hors-bornes (mot modifié) : on l'ignore
			const x = a.offsetLeft - PAD;
			const y = a.offsetTop - PAD;
			const rw = b.offsetLeft + b.offsetWidth - a.offsetLeft + PAD * 2;
			const rh = a.offsetHeight + PAD * 2;
			const col = PALETTE[e.couleur % PALETTE.length];
			return `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" rx="14" ry="16" fill="${col}" fill-opacity="0.22" stroke="${col}" stroke-width="2.5" />`;
		})
		.join('');
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
	const entourages: Entourage[] = mot.entourage.map((e) => ({ ...e }));

	// Segments de mots : pour chaque lettre non-espace, bornes [start, end] de son mot.
	const segStart = new Array<number>(lettres.length).fill(-1);
	const segEnd = new Array<number>(lettres.length).fill(-1);
	for (let i = 0; i < lettres.length; ) {
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

	host.innerHTML = `
    <div class="page ortho-run">
      <p class="ortho-run-consigne">${escapeHTML(consigne)}</p>
      <div class="atelier-stage">
        <div class="atelier-mot" id="atelierMot">${lettresMotHTML(mot.mot, opts.diff)}</div>
        <svg class="atelier-svg" id="atelierSvg" aria-hidden="true"></svg>
      </div>
      <div class="atelier-actions">
        <button type="button" class="atelier-undo" id="atelierUndo">↩️ Effacer le dernier</button>
        <button type="button" class="atelier-undo" id="atelierClear">🧹 Tout effacer</button>
      </div>
      <div class="atelier-done"><button class="btn-primary" id="btnAtelierDone">Continuer →</button></div>
    </div>`;

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
		spans().forEach((s) => {
			const i = Number(s.dataset.i);
			s.classList.toggle('sel', s.dataset.space !== '1' && i >= plo && i <= phi);
		});
	}
	function clearPending(): void {
		pend = null;
		spans().forEach((s) => s.classList.remove('sel'));
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
		if (pend) {
			entourages.push({
				debut: pend[0],
				fin: pend[1],
				couleur: entourages.length % PALETTE.length,
			});
		}
		clearPending();
		redrawSvg();
	};
	motEl.addEventListener('pointerup', finDrag);
	motEl.addEventListener('pointercancel', finDrag);

	function redrawSvg(): void {
		dessinerEntourages(motEl, svg, entourages);
	}

	host.querySelector('#atelierUndo')!.addEventListener('click', () => {
		entourages.pop();
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
		entourages.length = 0;
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
}
