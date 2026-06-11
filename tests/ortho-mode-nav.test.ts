import { beforeEach, describe, test, expect } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { loadOrtho, saveOrtho, createListe, motsDeListe } from '../src/core/orthographe/store';
import { marquerAtelierFait } from '../src/core/orthographe/runner';
import { orthoDiscoveryComplete } from '../src/ui/ortho-runner';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

describe('orthoDiscoveryComplete — listes personnalisées (#69)', () => {
	test('liste fraîche : découverte incomplète → pas de choix de mode', () => {
		const s = loadOrtho();
		const liste = createListe(s, 'Sem', [{ mot: 'chat' }, { mot: 'chien' }]);
		saveOrtho(s);
		expect(orthoDiscoveryComplete(liste.id)).toBe(false);
	});
	test('liste découverte : tous les ateliers faits → choix de mode proposé', () => {
		const s = loadOrtho();
		const liste = createListe(s, 'Sem', [{ mot: 'chat' }, { mot: 'chien' }]);
		motsDeListe(s, liste).forEach(marquerAtelierFait);
		saveOrtho(s);
		expect(orthoDiscoveryComplete(liste.id)).toBe(true);
	});
});
