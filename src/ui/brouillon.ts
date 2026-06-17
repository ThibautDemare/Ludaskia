/* ============================================================
   Brouillon (#199) — ardoise de dessin tactile, repliable.
   Pour résoudre un problème, l'enfant a besoin de POSER son calcul (aligner les
   chiffres, noter une retenue) : un champ texte ne suffit pas, il faut tracer.
   D'où un canvas au doigt/stylet, replié par défaut (« J'ai besoin d'un
   brouillon ») pour ne pas surcharger l'écran. Jetable : aucune persistance, le
   markup est recréé à chaque problème (le canvas repart vierge).

   Pièges tactiles gérés : `touch-action: none` (sinon le doigt fait défiler la
   page au lieu de tracer) et mise à l'échelle `devicePixelRatio` (trait net).
   ============================================================ */
import { icon } from './icon';

/** Markup du brouillon (bouton-bascule + panneau masqué) à insérer dans la carte. */
export function brouillonHTML(): string {
	return `<div class="brouillon">
    <button type="button" class="brouillon-toggle" aria-expanded="false">${icon('pencil')}<span>J'ai besoin d'un brouillon</span></button>
    <div class="brouillon-panel" hidden>
      <canvas class="brouillon-canvas" aria-label="Zone de brouillon pour poser ton calcul"></canvas>
      <button type="button" class="brouillon-clear">${icon('trash')}<span>Tout effacer</span></button>
    </div>
  </div>`;
}

function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
	const rect = canvas.getBoundingClientRect();
	if (rect.width === 0) return null; // pas encore visible
	const dpr = window.devicePixelRatio || 1;
	canvas.width = Math.round(rect.width * dpr);
	canvas.height = Math.round(rect.height * dpr);
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.scale(dpr, dpr);
	ctx.lineWidth = 3;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
	ctx.strokeStyle = ink || '#1a1a1a';
	return ctx;
}

function effacer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.restore();
}

/** Câble la bascule, le dessin (pointer events) et l'effacement dans `root`. */
export function bindBrouillon(root: ParentNode = document): void {
	const toggle = root.querySelector<HTMLButtonElement>('.brouillon-toggle');
	const panel = root.querySelector<HTMLElement>('.brouillon-panel');
	const canvas = root.querySelector<HTMLCanvasElement>('.brouillon-canvas');
	const clear = root.querySelector<HTMLButtonElement>('.brouillon-clear');
	if (!toggle || !panel || !canvas || !clear) return;

	let ctx: CanvasRenderingContext2D | null = null;
	let drawing = false;

	const wireDessin = () => {
		if (!ctx) return;
		canvas.addEventListener('pointerdown', (e) => {
			if (!ctx) return;
			drawing = true;
			canvas.setPointerCapture(e.pointerId);
			ctx.beginPath();
			ctx.moveTo(e.offsetX, e.offsetY);
		});
		canvas.addEventListener('pointermove', (e) => {
			if (!drawing || !ctx) return;
			ctx.lineTo(e.offsetX, e.offsetY);
			ctx.stroke();
		});
		const stop = () => {
			drawing = false;
		};
		canvas.addEventListener('pointerup', stop);
		canvas.addEventListener('pointercancel', stop);
		canvas.addEventListener('pointerleave', stop);
	};

	toggle.addEventListener('click', () => {
		const ouvrir = panel.hidden;
		panel.hidden = !ouvrir;
		toggle.setAttribute('aria-expanded', String(ouvrir));
		// Le canvas n'a une taille mesurable qu'une fois le panneau affiché. On le
		// dimensionne UNE fois : après une rotation/redimensionnement, la bitmap garde
		// sa taille initiale (tracé légèrement décalé) — acceptable pour un brouillon
		// jetable recréé à chaque problème ; pas de ResizeObserver en v1.
		if (ouvrir && !ctx) {
			ctx = setupCanvas(canvas);
			wireDessin();
		}
	});

	clear.addEventListener('click', () => {
		if (ctx) effacer(canvas, ctx);
	});
}
