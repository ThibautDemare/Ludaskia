/* ============================================================
   Espace encadrant — composant « segment » (choix exclusif).
   ------------------------------------------------------------
   Les boutons-segments de l'espace encadrant (affichage du graphe d'activité,
   affichage des révisions, récurrence d'un programme, période des erreurs) sont
   tous le MÊME widget : choisir UNE option parmi 2 à 4. Ils étaient rendus à la
   main sur chaque site, en `role="group"` + `aria-pressed`.

   `aria-pressed` décrit des bascules INDÉPENDANTES : à plusieurs options
   mutuellement exclusives, le contrat juste est celui du groupe de boutons radio
   (APG « Radio Group ») — `role="radiogroup"` + `role="radio"`/`aria-checked`,
   un SEUL arrêt de tabulation pour tout le groupe (tabindex mobile) et
   déplacement aux flèches, la sélection suivant le focus. D'où ce module :
   le rendu et le contrat clavier vivent ici, une fois, pour les quatre sites.

   Ce composant reste DISTINCT de la barre d'onglets `.enc-tabs` (navigation de
   section, cf. encadrant.ts) et des `.mode-btn` côté enfant.
   ============================================================ */
import { html, type SafeHtml, joindre, attribut, VIDE } from '../core/html';

/* Une option du segment. `ariaLabel` remplace le nom accessible quand le libellé
   visible seul ne suffit pas (il doit alors le CONTENIR — SC 2.5.3) : le bloc des
   erreurs s'en sert pour annoncer le résultat du filtre sur l'option active. */
export interface SegmentOption {
	val: string;
	label: string;
	ariaLabel?: string;
}

export interface SegmentConfig {
	act: string; // `data-act` commun (aiguillage du handler délégué de la section)
	valAttr: string; // nom du `data-*` portant la valeur (`mode`, `type`, `periode`…)
	label: string; // nom accessible du groupe
	options: readonly SegmentOption[];
	active: string;
	extra?: Record<string, string>; // `data-*` communs en plus (ex. { def: id })
	wrap?: boolean; // variante qui passe à la ligne (au-delà de 2-3 segments)
}

export function segmentHTML(c: SegmentConfig): SafeHtml {
	const extra = joindre(Object.entries(c.extra ?? {}).map(([k, v]) => attribut(`data-${k}`, v)));
	const btns = joindre(
		c.options.map((o) => {
			const on = o.val === c.active;
			const nom = o.ariaLabel ? attribut('aria-label', o.ariaLabel) : VIDE;
			// tabindex mobile : seule l'option cochée est dans l'ordre de tabulation,
			// les autres s'atteignent aux flèches (cf. segmentKeydown).
			return html`<button type="button" role="radio" class="enc-act-mode${on ? ' on' : ''}" data-act="${c.act}" data-${c.valAttr}="${o.val}"${extra} aria-checked="${String(on)}" tabindex="${on ? '0' : '-1'}"${nom}>${o.label}</button>`;
		}),
	);
	return html`<div class="enc-act-modes${c.wrap ? ' enc-act-modes-wrap' : ''}" role="radiogroup" aria-label="${c.label}">${btns}</div>`;
}

const SUIVANT = ['ArrowRight', 'ArrowDown'];
const PRECEDENT = ['ArrowLeft', 'ArrowUp'];

/* Navigation clavier du segment (à poser sur le conteneur délégué de l'espace).
   Renvoie `true` si la touche a été consommée. La sélection SUIT le focus (contrat
   radiogroup) : on se contente de cliquer l'option visée, et le handler de la
   section fait le reste (état → re-rendu → focus rendu à l'option cochée). */
export function segmentKeydown(e: KeyboardEvent): boolean {
	const cible = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(
		'.enc-act-mode[role="radio"]',
	);
	const groupe = cible?.closest('[role="radiogroup"]');
	if (!cible || !groupe) return false;
	const boutons = [...groupe.querySelectorAll<HTMLElement>('.enc-act-mode[role="radio"]')];
	const i = boutons.indexOf(cible);
	if (i < 0) return false;
	let j: number;
	if (SUIVANT.includes(e.key)) j = (i + 1) % boutons.length;
	else if (PRECEDENT.includes(e.key)) j = (i - 1 + boutons.length) % boutons.length;
	else if (e.key === 'Home') j = 0;
	else if (e.key === 'End') j = boutons.length - 1;
	else return false;
	e.preventDefault(); // les flèches ne doivent pas faire défiler la page
	boutons[j].click();
	return true;
}
