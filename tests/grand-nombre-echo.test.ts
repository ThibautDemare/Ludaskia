/* ============================================================
   Écho groupé des grands nombres à la frappe (#327) — comportement DOM.

   On installe l'écouteur délégué une fois, puis on simule une saisie dans un champ
   `.ans-grand` en émettant l'évènement `input` et on vérifie : (1) la valeur est
   reformatée par classes de 3 (U+202F) ; (2) la position du curseur est préservée
   (exprimée en chiffres à gauche) ; (3) un champ `.ans` ordinaire n'est PAS touché.
   ============================================================ */
import { describe, test, expect, beforeEach } from 'vitest';
import { installGroupedNumberEcho } from '../src/ui/grand-nombre-echo';

const U202F = String.fromCharCode(0x202f); // espace fine insécable

/** Pose une valeur + un curseur dans un champ et émet l'évènement `input` (comme une frappe). */
function frappe(el: HTMLInputElement, valeur: string, curseur: number): void {
	el.value = valeur;
	el.setSelectionRange(curseur, curseur);
	el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Pose valeur + curseur et émet un `beforeinput` de suppression (Retour arrière / Suppr). */
function suppression(
	el: HTMLInputElement,
	valeur: string,
	curseur: number,
	arriere: boolean,
): void {
	el.value = valeur;
	el.setSelectionRange(curseur, curseur);
	el.dispatchEvent(
		new InputEvent('beforeinput', {
			bubbles: true,
			cancelable: true,
			inputType: arriere ? 'deleteContentBackward' : 'deleteContentForward',
		}),
	);
}

describe('écho groupé des grands nombres (#327)', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		installGroupedNumberEcho();
	});

	test('reformate un champ .ans-grand par classes de 3 (U+202F)', () => {
		document.body.innerHTML = '<input class="ans ans-grand" inputmode="numeric" />';
		const el = document.querySelector<HTMLInputElement>('.ans-grand')!;
		frappe(el, '1400000', 7);
		expect(el.value).toBe(`1${U202F}400${U202F}000`);
	});

	test('préserve la position du curseur (comptée en chiffres à gauche)', () => {
		document.body.innerHTML = '<input class="ans ans-grand" inputmode="numeric" />';
		const el = document.querySelector<HTMLInputElement>('.ans-grand')!;
		// L'enfant a tapé « 14000 » puis insère un « 5 » au début → « 514000 », curseur après le 5.
		frappe(el, '514000', 1);
		expect(el.value).toBe(`514${U202F}000`);
		// Le curseur doit rester APRÈS le 1er chiffre (le « 5 » tapé), pas sauter à la fin.
		expect(el.selectionStart).toBe(1);
	});

	test('ne touche pas un champ .ans ordinaire (calcul CE2)', () => {
		document.body.innerHTML = '<input class="ans" inputmode="numeric" />';
		const el = document.querySelector<HTMLInputElement>('.ans')!;
		frappe(el, '12345', 5);
		expect(el.value).toBe('12345'); // pas de séparateur ajouté
	});

	test('laisse intacte une saisie décimale (garde-fou : on ne groupe que des entiers)', () => {
		document.body.innerHTML = '<input class="ans ans-grand" inputmode="numeric" />';
		const el = document.querySelector<HTMLInputElement>('.ans-grand')!;
		frappe(el, '12000,5', 7);
		expect(el.value).toBe('12000,5');
	});

	test('Retour arrière sur un séparateur efface le chiffre voisin (pas l’espace)', () => {
		document.body.innerHTML = '<input class="ans ans-grand" inputmode="numeric" />';
		const el = document.querySelector<HTMLInputElement>('.ans-grand')!;
		// « 14 000 » (= 14 puis espace fine puis 000), curseur juste APRÈS l'espace.
		suppression(el, `14${U202F}000`, 3, true);
		// Le « 4 » est effacé (pas l'espace) → « 1000 », curseur après le « 1 ».
		expect(el.value).toBe('1000');
		expect(el.selectionStart).toBe(1);
	});

	test('Suppr sur un séparateur efface le chiffre suivant (pas l’espace)', () => {
		document.body.innerHTML = '<input class="ans ans-grand" inputmode="numeric" />';
		const el = document.querySelector<HTMLInputElement>('.ans-grand')!;
		// « 14 000 », curseur juste AVANT l'espace (après le « 4 »).
		suppression(el, `14${U202F}000`, 2, false);
		// Le premier « 0 » est effacé → « 1400 », curseur conservé après 2 chiffres.
		expect(el.value).toBe('1400');
		expect(el.selectionStart).toBe(2);
	});
});
