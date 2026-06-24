/* ============================================================
   Normalisation « texte affiché → texte parlé » (#42, src/core/tts-text.ts).
   Logique pure : on vérifie le marqueur `@`, les signes d'opération, les
   balises HTML et l'attribut data-tts. Pas de DOM.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { texteParle, ttsAttr } from '../src/core/tts-text';
import { formatNombre } from '../src/core/nombres';

describe('texteParle', () => {
	it('retire le marqueur @ du trou à remplir (silence, pas « arobase »)', () => {
		expect(texteParle('Combien font 3 et 4 ? @')).toBe('Combien font 3 et 4 ?');
		expect(texteParle('@ litres')).toBe('litres');
	});

	it('traduit les signes d’opération entourés d’espaces en mots', () => {
		expect(texteParle('7 + 8 = @')).toBe('7 plus 8 égale');
		expect(texteParle('12 - 5 = @')).toBe('12 moins 5 égale');
		expect(texteParle('3 × 4 = @')).toBe('3 fois 4 égale');
		expect(texteParle('12 ÷ 3 = @')).toBe('12 divisé par 3 égale');
	});

	it('ne touche pas un tiret interne d’un mot composé', () => {
		expect(texteParle('Range « porte-clé » et « chou-fleur ».')).toBe(
			'Range « porte-clé » et « chou-fleur ».',
		);
	});

	it('retire les balises HTML et décode les entités usuelles', () => {
		expect(texteParle('Quel est le <strong>contraire</strong> de grand ?')).toBe(
			'Quel est le contraire de grand ?',
		);
		expect(texteParle('Pierre &amp; Paul')).toBe('Pierre & Paul');
	});

	it('neutralise les séparateurs purement visuels (puce, tirets longs, flèche)', () => {
		expect(texteParle('pouvoir · présent — je @')).toBe('pouvoir présent je');
		expect(texteParle('« mes amis et moi » → @')).toBe('« mes amis et moi »');
	});

	it('lit les unités en toutes lettres', () => {
		expect(texteParle('Tu as 20 €.')).toBe('Tu as 20 euros.');
		expect(texteParle('Périmètre : 24 cm')).toBe('Périmètre : 24 centimètres');
		expect(texteParle('une demi-heure = @ min')).toBe('une demi-heure égale minutes');
	});

	it('réduit les espaces multiples et trim', () => {
		expect(texteParle('  a   b  ')).toBe('a b');
		expect(texteParle('')).toBe('');
	});

	it('colle les classes d’un grand nombre pour une lecture « entier » (#240)', () => {
		// formatNombre groupe avec l'espace fine insécable U+202F ; le TTS doit lire
		// l'entier (« un million deux mille cinquante »), pas épeler les groupes.
		expect(texteParle(`Compare ${formatNombre(1002050)} et 999.`)).toBe('Compare 1002050 et 999.');
		expect(texteParle(`La centaine de mille juste avant ${formatNombre(4538207)} : @`)).toBe(
			'La centaine de mille juste avant 4538207 :',
		);
		// L'espace insécable U+00A0 entre chiffres est aussi neutralisé.
		expect(texteParle('x ' + '1' + String.fromCharCode(0x00a0) + '234 y')).toBe('x 1234 y');
	});
});

describe('ttsAttr', () => {
	it('produit un attribut data-tts échappé pour les guillemets droits', () => {
		expect(ttsAttr('dire "oui"')).toBe(' data-tts="dire &quot;oui&quot;"');
	});

	it('renvoie une chaîne vide quand il n’y a rien à lire', () => {
		expect(ttsAttr('@')).toBe('');
		expect(ttsAttr('   ')).toBe('');
	});
});
