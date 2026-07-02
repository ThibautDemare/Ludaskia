/* ============================================================
   Moteur de figures SVG génératives (#88) — POINT D'ENTRÉE.
   Module PUR (aucun accès DOM) : chaque fonction renvoie une CHAÎNE
   de balisage (SVG + éventuelle légende), insérée telle quelle dans le
   HTML d'un exercice. C'est `figureBlock` (core/items.ts) qui l'enveloppe
   d'un conteneur ; l'impression la conserve, les runners la réaffichent.

   ORGANISATION (#353) — un module par famille de figures, tous bâtis sur
   les mêmes primitives bas niveau :
     - `primitives.ts` : `svgCanvas`, `line`, `circle`, `polygon`, `polyline`,
       `rect`, `text`, `arc`, `pointOnCircle`, `polar`, `r2`… + tokens de
       style partagés (`SHAPE_FILL`, `ANGLE_MARK`) ;
     - `horloge.ts`, `polygones.ts` (planes cotées, quadrillage, reconnaissance,
       cercle), `solides.ts`, `fractions.ts`, `symetrie.ts`, `angles.ts`,
       `groupes.ts` : une famille chacun ;
     - ce fichier réexporte tout et porte le dispatch par données
       (`FigureSpec` / `renderFigure`).

   POINT D'EXTENSION — pour ajouter une figure :
     1. la COMPOSER avec les primitives (`svgCanvas`, `line`, `circle`,
        `polygon`, `polyline`, `rect`, `text`, `pointOnCircle`) — jamais de
        SVG écrit « à la main » dans une leçon ;
     2. exposer une fonction `renderXxx(...)` dans le module de sa famille
        (ou un nouveau module) qui renvoie le fragment complet ;
     3. (optionnel) ajouter un variant à `FigureSpec` + un cas à `renderFigure`
        ci-dessous si la leçon préfère DÉCRIRE la figure par des données plutôt
        que d'appeler le renderer directement (utile pour sérialiser/tester).
   Toutes les figures partagent : un `viewBox` carré, `role="img"` +
   `<title>`/`<desc>` et un `aria-label` pour l'accessibilité, et des tokens
   de couleur CSS (`var(--…)`, jamais de couleur en dur). ============================================================ */

// Primitives publiques (les helpers internes attrs/polar/r2/SHAPE_FILL/ANGLE_MARK
// restent réservés aux modules de figures et ne sont pas réexportés ici).
export {
	pointOnCircle,
	line,
	circle,
	ellipse,
	rect,
	polygon,
	polyline,
	text,
	arc,
	svgCanvas,
} from './primitives';

// Familles de figures (renderers + types).
export * from './horloge';
export * from './polygones';
export * from './solides';
export * from './fractions';
export * from './symetrie';
export * from './angles';
export * from './groupes';

import { renderHorloge } from './horloge';
import {
	renderPolygoneCote,
	renderQuadrillage,
	renderFigurePlane,
	renderSceneFigures,
	renderCercle,
	type PlaneShape,
} from './polygones';
import { renderSolide, type Solid, type SolidOrient } from './solides';
import {
	renderFractionBarre,
	renderFractionBande,
	renderFractionPaire,
	renderFractionSomme,
	renderFractionCollection,
} from './fractions';
import {
	renderSymJuger,
	renderSymMiroir,
	renderSymImage,
	type SymShape,
	type SymAxis,
	type SymMotif,
	type SymTransform,
} from './symetrie';
import { renderAngle } from './angles';
import { renderGroupes } from './groupes';

/** Description d'une figure par données. Étendre l'union + le switch ci-dessous
    pour chaque nouvelle figure. */
export type FigureSpec =
	| { kind: 'horloge'; heures: number; minutes: number }
	| { kind: 'polygoneCote'; points: Array<[number, number]>; labels: string[] }
	| { kind: 'quadrillage'; cols: number; rows: number; cells: Array<[number, number]> }
	| { kind: 'figurePlane'; shape: PlaneShape; rotation?: number; codage?: boolean }
	| { kind: 'sceneFigures'; cells: Array<{ shape: PlaneShape; rotation?: number }> }
	| { kind: 'cercle'; segment?: 'rayon' | 'diametre'; label?: string }
	| { kind: 'solide'; solid: Solid; orient?: SolidOrient }
	| { kind: 'groupes'; paniers: number; total: number }
	| { kind: 'fractionBarre'; num: number; den: number }
	| { kind: 'fractionBande'; num: number; den: number }
	| { kind: 'fractionPaire'; haut: [number, number]; bas: [number, number] }
	| { kind: 'fractionSomme'; a: [number, number]; b: [number, number] }
	| { kind: 'fractionCollection'; num: number; den: number; parGroupe: number }
	| { kind: 'symJuger'; shape: SymShape; axis?: SymAxis }
	| { kind: 'symMiroir'; motif: SymMotif; axis: 'v' | 'h' }
	| { kind: 'symImage'; motif: SymMotif; axis: 'v' | 'h'; t: SymTransform }
	| { kind: 'angle'; opening: number; bisector: number };

export function renderFigure(spec: FigureSpec): string {
	switch (spec.kind) {
		case 'horloge':
			return renderHorloge(spec.heures, spec.minutes);
		case 'polygoneCote':
			return renderPolygoneCote(spec.points, spec.labels);
		case 'quadrillage':
			return renderQuadrillage(spec.cols, spec.rows, spec.cells);
		case 'figurePlane':
			return renderFigurePlane(spec.shape, spec.rotation, spec.codage);
		case 'sceneFigures':
			return renderSceneFigures(spec.cells);
		case 'cercle':
			return renderCercle(spec.segment, spec.label);
		case 'solide':
			return renderSolide(spec.solid, spec.orient);
		case 'groupes':
			return renderGroupes(spec.paniers, spec.total);
		case 'fractionBarre':
			return renderFractionBarre(spec.num, spec.den);
		case 'fractionBande':
			return renderFractionBande(spec.num, spec.den);
		case 'fractionPaire':
			return renderFractionPaire(spec.haut, spec.bas);
		case 'fractionSomme':
			return renderFractionSomme(spec.a, spec.b);
		case 'fractionCollection':
			return renderFractionCollection(spec.num, spec.den, spec.parGroupe);
		case 'symJuger':
			return renderSymJuger(spec.shape, spec.axis);
		case 'symMiroir':
			return renderSymMiroir(spec.motif, spec.axis);
		case 'symImage':
			return renderSymImage(spec.motif, spec.axis, spec.t);
		case 'angle':
			return renderAngle(spec.opening, spec.bisector);
	}
}
