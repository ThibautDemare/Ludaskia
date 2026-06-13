/* ============================================================
   Démasquage « mot de passe visible » (#139) : les champs `[data-unmask]`
   rendus en `type="password"` doivent passer en `type="text"` — à l'installation
   pour ceux déjà présents, et à l'insertion pour ceux ajoutés ensuite (observateur).
   ============================================================ */
import { describe, test, expect, beforeEach } from 'vitest';
import { installVisiblePasswordReveal } from '../src/ui/anti-suggestion';

const flush = () => new Promise((r) => setTimeout(r, 0)); // laisse l'observateur réagir

describe('anti-suggestion : champ mot de passe visible', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	test('démasque un champ data-unmask déjà présent à l’installation', () => {
		document.body.innerHTML = '<input data-unmask type="password" class="ans-text" />';
		installVisiblePasswordReveal();
		expect(document.querySelector('input')!.type).toBe('text');
	});

	test('démasque un champ inséré APRÈS l’installation (observateur)', async () => {
		installVisiblePasswordReveal();
		// Insertion via innerHTML d'un conteneur (cas réel des vues rendues par sheets()).
		const page = document.createElement('div');
		page.innerHTML = '<p>x <input id="orthoInput" data-unmask type="password" /></p>';
		document.body.appendChild(page);
		await flush();
		expect(document.getElementById('orthoInput')).toHaveProperty('type', 'text');
	});

	test('ne touche pas les champs sans data-unmask (saisie numérique du calcul)', async () => {
		installVisiblePasswordReveal();
		const div = document.createElement('div');
		div.innerHTML = '<input class="ans" inputmode="numeric" />';
		document.body.appendChild(div);
		await flush();
		expect(document.querySelector('.ans')!.getAttribute('type')).toBe(null); // reste un champ texte par défaut
	});
});
