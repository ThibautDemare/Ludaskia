/* ============================================================
   Point d'entrée du GUIDE PARENTS (#562) — guide.html.
   Troisième page du build multi-page, à côté de la vitrine (index.html)
   et de l'application (app.html). Comme la vitrine : page statique, on
   n'importe donc PAS main.ts (pas de moteur, pas de profils, pas de
   routeur). Le chrome est celui de la vitrine — on réutilise `vitrine.scss`
   tel quel (en-tête, CTA, sections, cartes, FAQ) et `guide.scss` n'ajoute
   que ce qui est propre à un mode d'emploi (sommaire, étapes, encarts).
   Tout est « progressive enhancement » : sans JS, le guide reste lisible
   et tous ses liens fonctionnent.
   ============================================================ */
import './styles/base.scss'; // tokens (:root), police Nunito, reset
import './styles/foret.scss'; // bande forêt full-bleed + animation « vent » (prefers-reduced-motion)
import './styles/vitrine.scss'; // chrome partagé avec index.html
import './styles/guide.scss';
import './styles/footer.scss'; // pied de page partagé + pluie de cookies (#336)
import { fillFooterYear, initFooterCookie } from './ui/footer';
import { brut } from './core/html';

// Bande décorative « forêt », comme sur la vitrine (décoration non critique).
const foretEl = document.getElementById('guideForet');
if (foretEl) {
	fetch(`${import.meta.env.BASE_URL}foret-pied.svg`)
		.then((r) => (r.ok ? r.text() : ''))
		.then((svg) => {
			// SVG d’ILLUSTRATION servi par le site lui-même (`public/foret-pied.svg`), pas une
			// donnée : `brut` le déclare de confiance, et la source est celle du déploiement.
			if (svg) foretEl.innerHTML = brut(svg).balisage;
		})
		.catch(() => {});
}

fillFooterYear();
initFooterCookie();
