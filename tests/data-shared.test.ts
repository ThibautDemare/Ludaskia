import { describe, test, expect } from 'vitest';
import { MODE_QCM_POINT, MODE_QCM_CHECK } from '../src/data/_shared';

/* Descripteurs QCM mutualisés (#347). Ce fichier est devenu un point unique dont
   dépendent ~23 leçons : on verrouille son contrat (une modif involontaire ici se
   propagerait partout) et le pattern de diffusion utilisé par les fichiers data. */

describe('descripteurs QCM mutualisés (#347)', () => {
	test('deux variantes de mode QCM conseillé, ne différant QUE par l’icône', () => {
		expect(MODE_QCM_POINT).toEqual({
			id: 'qcm',
			label: 'Je choisis la bonne réponse',
			icon: 'hand-pointing',
			recommended: true,
		});
		expect(MODE_QCM_CHECK).toEqual({
			id: 'qcm',
			label: 'Je choisis la bonne réponse',
			icon: 'check-circle',
			recommended: true,
		});
		// Même libellé et même statut « conseillé » ; seule l'icône distingue les deux
		// (règle documentée maths → hand-pointing / français → check-circle).
		expect(MODE_QCM_POINT.label).toBe(MODE_QCM_CHECK.label);
		expect(MODE_QCM_POINT.recommended).toBe(MODE_QCM_CHECK.recommended);
		expect(MODE_QCM_POINT.icon).not.toBe(MODE_QCM_CHECK.icon);
	});

	test('diffusion : la surcharge d’un libellé ne touche ni l’icône ni « conseillé »', () => {
		expect({ ...MODE_QCM_POINT, label: 'Je choisis la bonne fraction' }).toEqual({
			id: 'qcm',
			label: 'Je choisis la bonne fraction',
			icon: 'hand-pointing',
			recommended: true,
		});
	});

	test('diffusion : un QCM non conseillé pose recommended:false (≡ absent au rendu)', () => {
		// Cas division / heure / accords / conjugaison : l'original n'avait pas de
		// `recommended` (un autre mode est conseillé, ou aucun) → on le repose à false.
		const qcm = { ...MODE_QCM_CHECK, hint: 'plus facile pour commencer', recommended: false };
		expect(qcm).toEqual({
			id: 'qcm',
			label: 'Je choisis la bonne réponse',
			icon: 'check-circle',
			hint: 'plus facile pour commencer',
			recommended: false,
		});
	});
});
