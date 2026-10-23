/* ============================================================
   Écran du parcours de bilan (#777) : ce qu'il DIT à qui ne le voit pas.
   Relecture accessibilité (B2) et décision sur la jauge.

   Écrit AVANT la correction : rouge à l'arrivée.

   - Le groupe de choix d'un QCM à trou est nommé par l'énoncé, trou marqué « (trou) »
     (même exigence que la `legend` des fiches, `qcm-trou-legende.test.ts`) ; aujourd'hui
     il s'appelle « Choix de réponse » pour toutes les questions, et la phrase, elle, tait
     son trou (`.bp-trou` est `aria-hidden`).
   - La jauge se dit en questions faites : « 0 question faite sur 3 », « 1 question faite
     sur 3 » (accords de `libelleAvancee`, spec de la décision), et non « 0 sur 3 ».

   L'écran est monté pour de vrai (happy-dom) par `lancerParcours`, sans clé de reprise.
   Le nom d'un groupe est lu comme le calcule un lecteur d'écran, quel que soit le
   mécanisme : `aria-labelledby`, sinon `aria-label`, sinon la `legend` d'un `fieldset`.
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
import '../src/ui/navigation';
import { lancerParcours } from '../src/ui/bilan-parcours';
import { getAllLessons, type BilanConfig } from '../src/core/catalog';
import { questionsDuBilan } from '../src/core/bilan-parcours';
import { niveauLecon } from '../src/core/niveau-actif';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { withSeed } from '../src/core/utils';
import { defautsNom } from './qcm-trou-nom';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	// Ce que l'écran réclame autour de lui : barre d'outils, chrono, zone des feuilles.
	document.body.innerHTML =
		'<button id="btnVerify"></button><button id="btnHome"></button><span id="chrono"></span><div id="sheets"></div>';
	location.hash = 'bilan-en-cours';
});

const bilan = (lessonIds: string[], questionsPerLesson: number): BilanConfig => ({
	id: '',
	label: 'Bilan d’essai',
	lessonIds,
	questionsPerLesson,
});

/** Nom accessible d'un groupe : `aria-labelledby`, sinon `aria-label`, sinon la `legend`. */
function nomAccessible(el: Element): string {
	const ids = el.getAttribute('aria-labelledby');
	if (ids)
		return ids
			.split(/\s+/)
			.map((id) => document.getElementById(id)?.textContent ?? '')
			.join(' ');
	const label = el.getAttribute('aria-label');
	if (label !== null) return label;
	return el.querySelector(':scope > legend')?.textContent ?? '';
}

/** L'énoncé affiché, trou rendu en `@` : de quoi vérifier le nom contre la phrase vue. */
function enonceAffiche(): string {
	const copie = document.querySelector('.bp-enonce')?.cloneNode(true) as HTMLElement | undefined;
	if (!copie) return '';
	copie.querySelector('.bp-trou')?.replaceWith('@');
	return copie.textContent ?? '';
}

/* Leçons dont la question de bilan est un QCM à trou, énumérées depuis le catalogue. */
function leconsQcmTrou(): string[] {
	return getAllLessons()
		.filter((l) => {
			const [q] = withSeed(5, () => questionsDuBilan(l, 1, niveauLecon(l)));
			return q?.kind === 'qcm' && q.item.text.includes('@');
		})
		.map((l) => l.id);
}

describe('Parcours : le groupe de choix d’un QCM à trou porte la phrase et son trou', () => {
	it('homophones : le groupe dit « La phrase … (trou) … », pas « Choix de réponse »', () => {
		withSeed(3, () => lancerParcours(bilan(['fr-homophones-et'], 3), null));
		const groupe = document.querySelector('#bpStage .bp-choix, #bpStage fieldset');
		expect(groupe, 'groupe de choix introuvable').not.toBe(null);
		expect(document.querySelector('.bp-trou'), 'précondition : un QCM à trou').not.toBe(null);
		expect(defautsNom(nomAccessible(groupe!), enonceAffiche())).toEqual([]);
	});

	it('toutes les leçons dont la question est un QCM à trou, item muet compris', () => {
		const ids = leconsQcmTrou();
		expect(ids.length, 'plancher : leçons à QCM à trou').toBeGreaterThanOrEqual(15);
		expect(ids, 'précondition : un item muet (parle vide) dans le lot').toContain(
			'fr-accords-groupe-nominal',
		);
		const fautes: string[] = [];
		let vus = 0;
		for (const id of ids) {
			document.getElementById('sheets')!.innerHTML = '';
			withSeed(5, () => lancerParcours(bilan([id], 1), null));
			const stage = document.getElementById('bpStage');
			if (stage?.dataset.kind !== 'qcm' || !stage.querySelector('.bp-trou')) continue;
			vus++;
			const groupe = stage.querySelector('.bp-choix, fieldset');
			if (!groupe) {
				fautes.push(`${id} : pas de groupe de choix`);
				continue;
			}
			for (const d of defautsNom(nomAccessible(groupe), enonceAffiche()))
				fautes.push(`${id} : ${d}`);
		}
		expect(vus).toBeGreaterThanOrEqual(15);
		expect(fautes).toEqual([]);
	});
});

describe('Parcours : la jauge se dit en questions faites', () => {
	it('« 0 question faite sur 3 », puis « 1 question faite sur 3 » après une réponse', () => {
		withSeed(3, () => lancerParcours(bilan(['fr-homophones-et'], 3), null));
		const jauge = () => document.querySelector('.bp-progression[role="progressbar"]');
		expect(jauge()?.getAttribute('aria-valuetext')).toBe('0 question faite sur 3');
		document.querySelector<HTMLButtonElement>('.bp-choice')!.click();
		document.querySelector<HTMLButtonElement>('#bpValider')!.click();
		expect(jauge()?.getAttribute('aria-valuetext')).toBe('1 question faite sur 3');
		document.querySelector<HTMLButtonElement>('.bp-choice')!.click();
		document.querySelector<HTMLButtonElement>('#bpValider')!.click();
		expect(jauge()?.getAttribute('aria-valuetext')).toBe('2 questions faites sur 3');
	});
});
