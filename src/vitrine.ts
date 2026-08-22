/* ============================================================
   Point d'entrée de la PAGE VITRINE (#271) — index.html.
   Page statique d'atterrissage, DISTINCTE de l'application (app.html) :
   on n'importe donc PAS main.ts (pas de moteur, pas de profils, pas de
   routeur) — juste les styles et deux petits agréments progressifs :
     1. la bande décorative « forêt » (même SVG que l'accueil) ;
     2. un lien « Continuer » révélé si un profil existe déjà en local.
   Tout est « progressive enhancement » : sans JS, la vitrine reste lisible
   et le CTA principal (lien vers app.html) fonctionne.
   ============================================================ */
import './styles/base.scss'; // tokens (:root), police Nunito, reset
import './styles/foret.scss'; // bande forêt full-bleed + animation « vent » (prefers-reduced-motion)
import './styles/vitrine.scss';
import './styles/footer.scss'; // pied de page partagé + pluie de cookies (#336)
import { fillFooterYear, initFooterCookie } from './ui/footer';
import { brut } from './core/html';

// Bande décorative « forêt » : même SVG pré-généré que l'accueil de l'app,
// inséré dans le DOM (pour que l'oscillation respecte « animations réduites »).
const foretEl = document.getElementById('vitrineForet');
if (foretEl) {
	fetch(`${import.meta.env.BASE_URL}foret-pied.svg`)
		.then((r) => (r.ok ? r.text() : ''))
		.then((svg) => {
			// SVG d’ILLUSTRATION servi par le site lui-même (`public/foret-pied.svg`), pas une
			// donnée : `brut` le déclare de confiance, et la source est celle du déploiement.
			if (svg) foretEl.innerHTML = brut(svg).balisage;
		})
		.catch(() => {}); // décoration non critique : on ignore l'échec
}

// Agrément « Continuer » : si l'appareil porte déjà au moins un profil, on
// révèle un lien bien visible vers l'app (l'enfant/parent qui revient n'a pas
// à relire la vitrine). Lecture BRUTE de la clé profils (la vitrine ne charge
// pas la couche stockage de l'app) ; aucune donnée personnelle n'est affichée.
function aUnProfil(): boolean {
	try {
		const raw = localStorage.getItem('ludaskia_profiles');
		if (!raw) return false;
		const meta = JSON.parse(raw) as { list?: unknown[] } | null;
		return !!meta && Array.isArray(meta.list) && meta.list.length > 0;
	} catch {
		return false; // localStorage indisponible (mode privé strict) : on n'affiche rien
	}
}

if (aUnProfil()) {
	document.querySelectorAll<HTMLElement>('[data-continuer]').forEach((el) => {
		el.hidden = false;
	});
}

// Pied de page (#336) : année du copyright + clin d'œil « pluie de cookies ».
// Sur la vitrine, c'est un pur jouet (pas de couche eggs / d'album à charger).
fillFooterYear();
initFooterCookie();
