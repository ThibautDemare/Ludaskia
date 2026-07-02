/* ============================================================
   Garde-fou aria-label / <title> des figures SVG (nettoyage #353).
   ------------------------------------------------------------
   `svgCanvas` a désormais `ariaLabel` par défaut = `title` (title placé AVANT
   ariaLabel dans la signature). Comme `title`/`desc`/`ariaLabel` sont tous des
   `string`, une transposition d'arguments passerait le typecheck : ces tests
   verrouillent donc explicitement (1) le défaut `ariaLabel = title` et l'override,
   (2) que les figures dont l'aria-label DIFFÈRE du titre gardent les bonnes valeurs,
   (3) que le rendu décoratif ne pose ni role, ni aria-label, ni <title>.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
	svgCanvas,
	renderAngle,
	renderFractionBarre,
	renderFractionSomme,
	renderFractionCollection,
	renderGroupes,
	renderHorloge,
	renderPolygoneCote,
	renderSymJuger,
	renderSymMiroir,
	renderSymImage,
} from '../src/core/figures';

const ariaOf = (svg: string) => svg.match(/aria-label="([^"]*)"/)?.[1];
const titleOf = (svg: string) => svg.match(/<title>(.*?)<\/title>/)?.[1];

describe('svgCanvas : contrat aria-label / title', () => {
	it('ariaLabel omis → défaut = title', () => {
		const svg = svgCanvas(10, 10, 'Titre', 'Description', '<g/>');
		expect(svg).toContain('role="img"');
		expect(ariaOf(svg)).toBe('Titre');
		expect(titleOf(svg)).toBe('Titre');
		expect(svg).toContain('<desc>Description</desc>');
	});

	it('ariaLabel explicite → prime sur title', () => {
		const svg = svgCanvas(10, 10, 'Titre', 'Description', '<g/>', 'cls', 'Libellé riche');
		expect(ariaOf(svg)).toBe('Libellé riche');
		expect(titleOf(svg)).toBe('Titre');
	});

	it('décoratif → ni role, ni aria-label, ni <title> (aria-hidden)', () => {
		const svg = svgCanvas(10, 10, '', '', '<g/>', 'cls', '', true);
		expect(svg).toContain('aria-hidden="true"');
		expect(svg).not.toContain('role="img"');
		expect(svg).not.toContain('aria-label');
		expect(svg).not.toContain('<title>');
	});
});

describe('figures : aria-label ≠ title là où il doit différer', () => {
	const cas = [
		{
			nom: 'renderAngle',
			svg: renderAngle(90, 105),
			aria: 'Angle formé par deux demi-droites',
			title: 'Angle',
		},
		{
			nom: 'renderFractionSomme',
			svg: renderFractionSomme([1, 4], [2, 4]),
			aria: 'Addition de deux fractions',
			title: 'Addition de fractions',
		},
		{
			nom: 'renderFractionCollection',
			svg: renderFractionCollection(1, 2, 4),
			aria: 'Collection en parts égales',
			title: 'Collection',
		},
		{
			nom: 'renderGroupes',
			svg: renderGroupes(3, 12),
			aria: '12 jetons à partager dans 3 paniers',
			title: 'Partage de jetons',
		},
		{
			nom: 'renderHorloge',
			svg: renderHorloge(10, 15),
			aria: 'Horloge à aiguilles',
			title: 'Horloge',
		},
		{
			nom: 'renderPolygoneCote',
			svg: renderPolygoneCote(
				[
					[0, 0],
					[5, 0],
					[5, 3],
					[0, 3],
				],
				['5', '3', '5', '3'],
			),
			aria: 'Figure géométrique cotée',
			title: 'Figure cotée',
		},
		{
			nom: 'renderSymJuger',
			svg: renderSymJuger('coeur'),
			aria: 'Figure de symétrie',
			title: 'Figure',
		},
		{
			nom: 'renderSymMiroir',
			svg: renderSymMiroir('drapeau', 'v'),
			aria: 'Une figure devant un miroir',
			title: 'Figure et miroir',
		},
	];

	it.each(cas)('$nom : aria-label et title distincts et corrects', ({ svg, aria, title }) => {
		expect(ariaOf(svg)).toBe(aria);
		expect(titleOf(svg)).toBe(title);
		expect(aria).not.toBe(title);
	});
});

describe('figures : aria-label = title (défaut) là où ils coïncident', () => {
	it('renderFractionBarre : aria-label == title', () => {
		const svg = renderFractionBarre(1, 2);
		expect(ariaOf(svg)).toBe('Fraction');
		expect(titleOf(svg)).toBe('Fraction');
	});
});

describe('renderSymImage : rendu décoratif (figure DANS un bouton-choix QCM)', () => {
	it('ne pose ni role, ni aria-label, ni <title>', () => {
		const svg = renderSymImage('drapeau', 'v', 'reflet');
		expect(svg).toContain('aria-hidden="true"');
		expect(svg).not.toContain('role="img"');
		expect(svg).not.toContain('aria-label');
		expect(svg).not.toContain('<title>');
	});
});
