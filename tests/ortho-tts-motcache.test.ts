/* ============================================================
   Mode Orthographe « afficher / cacher » — bouton « Écouter le mot » (#150).
   On stube la Web Speech API (voix FR dispo) pour ne pas dépendre des voix
   réellement installées, puis on force le mode `motCache` et on vérifie que le
   bouton TTS apparaît et lit bien le mot.
   ============================================================ */
import { beforeEach, describe, test, expect, vi } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { loadOrtho, saveOrtho, createListe } from '../src/core/orthographe/store';
import { startOrthoRun, setPendingOrthoMode } from '../src/ui/ortho-runner';

let speak: ReturnType<typeof vi.fn>;

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	document.body.innerHTML = '<div id="sheets"></div>';
	speak = vi.fn();
	// Voix FR locale → dicteeDisponible() vrai, sans dépendre de l'environnement.
	(globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis = {
		getVoices: () => [{ lang: 'fr-FR', localService: true, name: 'fr' }],
		addEventListener: () => {},
		cancel: () => {},
		speak,
	};
	(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
		class {
			text: string;
			voice: unknown = null;
			lang = '';
			rate = 1;
			constructor(t: string) {
				this.text = t;
			}
		};
});

describe('Mode afficher/cacher : bouton « Écouter le mot » (#150)', () => {
	test('rend un bouton TTS qui lit le mot quand une voix FR est disponible', () => {
		const s = loadOrtho();
		const liste = createListe(s, 'Sem', [{ mot: 'cheval' }]);
		saveOrtho(s);
		setPendingOrthoMode('motCache'); // force le mode afficher/cacher
		startOrthoRun(liste.id);

		const btn = document.getElementById('btnEcouterMot');
		expect(btn).not.toBeNull();
		btn!.dispatchEvent(new Event('click'));
		expect(speak).toHaveBeenCalledTimes(1);
		expect(speak.mock.calls[0][0].text).toContain('cheval');
	});
});
