/* ============================================================
   Effets visuels : courbe de progression, confettis, modale
   ============================================================ */
import { getXP, progressionNiveau, NIVEAU_MAX } from '../core/progress';
import type { Recompense } from '../core/unlocks';

/* Mini-courbe SVG de la progression (score % au fil des essais) */
export function sparkline(vals: number[], w = 260, h = 46) {
	if (vals.length < 2) return '';
	const pad = 4,
		iw = w - 2 * pad,
		ih = h - 2 * pad;
	const x = (i: number) => pad + (i / (vals.length - 1)) * iw;
	const y = (v: number) => pad + ih - (v / 100) * ih;
	const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
	const dots = vals
		.map(
			(v, i) =>
				`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" fill="var(--accent)"/>`,
		)
		.join('');
	return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Progression des scores">
    <polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${pts}"/>${dots}</svg>`;
}

/* Petite pluie de confettis */
export function confetti() {
	const colors = ['#336CBF', '#ffd54f', '#2e7d32', '#c62828', '#00acc1', '#ff8f00'];
	const layer = document.createElement('div');
	layer.className = 'confetti-layer';
	for (let i = 0; i < 90; i++) {
		const c = document.createElement('span');
		c.className = 'confetti';
		c.style.left = (Math.random() * 100).toFixed(1) + 'vw';
		c.style.background = colors[i % colors.length];
		c.style.animationDelay = (Math.random() * 0.6).toFixed(2) + 's';
		c.style.animationDuration = (2 + Math.random() * 1.6).toFixed(2) + 's';
		layer.appendChild(c);
	}
	document.body.appendChild(layer);
	setTimeout(() => layer.remove(), 4200);
}

/* Modale de récompense : annonce explicitement ce qui vient d'être gagné. */
export function showCelebration(items: { icon: string; text: string }[]) {
	if (!items || !items.length) return;
	const list = document.getElementById('celebrateList');
	if (list)
		list.innerHTML = items
			.map((i) => `<li><span class="modal-li-ico">${i.icon}</span> ${i.text}</li>`)
			.join('');
	const ov = document.getElementById('celebrate');
	if (ov) ov.style.display = '';
	confetti();
}
export function hideCelebration() {
	const ov = document.getElementById('celebrate');
	if (ov) ov.style.display = 'none';
}

/* Modale dédiée au passage de niveau : médaillon doré animé + rayons.
   `then` (optionnel) est rejoué à la fermeture → permet d'enchaîner sur la
   modale de récompense générique s'il y a d'autres gains. */
let levelUpThen: (() => void) | null = null;
export function showLevelUp(niveau: number, recompenses: Recompense[] = [], then?: () => void) {
	const ov = document.getElementById('levelup');
	if (!ov) {
		if (then) then(); // pas de modale dans le DOM : on n'avale pas les autres récompenses
		return;
	}
	const num = document.getElementById('levelupNum');
	if (num) num.textContent = String(niveau);
	const sub = document.getElementById('levelupNext');
	if (sub) {
		const pr = progressionNiveau(getXP());
		sub.textContent =
			niveau >= NIVEAU_MAX
				? '🏆 Niveau maximum atteint !'
				: `Plus que ${pr.xpRequisPalier - pr.xpDansNiveau} XP avant le niveau ${niveau + 1}`;
	}
	// Déblocages du palier (rang, et plus tard mascotte/avatar/thème).
	const unlocks = document.getElementById('levelupUnlocks');
	if (unlocks) {
		unlocks.innerHTML = recompenses
			.map(
				(r) =>
					`<li class="levelup-unlock levelup-unlock--${r.type}"><span class="levelup-unlock-ico">${r.icone}</span> ${r.texte}</li>`,
			)
			.join('');
		unlocks.style.display = recompenses.length ? '' : 'none';
	}
	levelUpThen = then ?? null;
	ov.style.display = '';
	confetti();
}
export function hideLevelUp() {
	const ov = document.getElementById('levelup');
	if (ov) ov.style.display = 'none';
	const then = levelUpThen;
	levelUpThen = null;
	if (then) then();
}
