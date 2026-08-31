import { beforeEach, describe, test, expect } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import {
	loadOrtho,
	saveOrtho,
	createListe,
	updateListe,
	motsDeListe,
} from '../src/core/orthographe/store';
import { marquerAtelierFait, validerMode } from '../src/core/orthographe/runner';
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

	/* #641, critère 21 : l'écran de choix se réorganise (modes épuisés rangés plus bas),
	   mais sa CONDITION D'APPARITION ne bouge pas. Le cas neuf que #641 rend possible :
	   une liste déjà bien avancée à laquelle le parent ajoute un mot — des modes peuvent
	   y être « épuisés » alors que la découverte, elle, est redevenue incomplète. */
	test('critère 21 : un mot ajouté à une liste avancée referme le choix de mode', () => {
		const s = loadOrtho();
		const liste = createListe(s, 'Sem', [{ mot: 'chat' }, { mot: 'chien' }]);
		motsDeListe(s, liste).forEach((m) => {
			marquerAtelierFait(m);
			validerMode(m, 'tuiles');
		});
		saveOrtho(s);
		expect(orthoDiscoveryComplete(liste.id)).toBe(true);

		// Le parent complète la liste : le nouveau mot n'a pas eu son atelier.
		const s2 = loadOrtho();
		const l2 = s2.listes.find((l) => l.id === liste.id)!;
		updateListe(s2, l2.id, l2.label, [{ mot: 'chat' }, { mot: 'chien' }, { mot: 'avion' }]);
		saveOrtho(s2);
		expect(orthoDiscoveryComplete(liste.id)).toBe(false);
	});
});
