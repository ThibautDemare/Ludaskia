/* ============================================================
   Révélation neutre d'une question passée (src/ui/revelation-neutre.ts, #467) —
   fond COMMUN au mode leçon et au mode Révision. Helper UI testé isolément, sur le
   modèle de tests/erreur-capture.test.ts. Auteur des tests DISTINCT de l'auteur du
   code : les attendus viennent du besoin (« l'enfant obtient la même chose sur les
   deux écrans, et un lecteur d'écran n'est jamais muet »).

   Ce qui est éprouvé :
   - la LIGNE de révélation, dans ses deux formes (solution sur la ligne / solution
     en bloc dessous) : ponctuation, formulation commune aux deux formes, et le fait
     que la solution est injectée TELLE QUELLE (l'échappement reste à l'appelant) ;
   - le LIBELLÉ du lien de déblocage : un bouton (jamais un `<a>`), le même libellé
     sur les deux écrans, classe et id restant propres à l'écran ;
   - la règle de REPLI de l'annonce non visuelle : région du widget d'abord, région
     fixe de l'écran sinon — c'est ce repli qui répare les formats de révision restés
     muets pour un lecteur d'écran, et il doit tenir quel que soit l'ordre du markup ;
   - l'entrée de journal d'un passage (sans réponse donnée, marquée « n'a pas
     essayé »), sous le mode de l'écran appelant.
   Le reste du module (`neutraliserScene`, styles, ids des runners) est du geste
   d'écran → e2e.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	annoncerRevelation,
	annoncerStatut,
	capterPasse,
	lienPasserHTML,
	ligneRevelation,
	PASSER_LABEL,
	REVEAL_LAB,
	REVELATION_EN_PLACE,
} from '../src/ui/revelation-neutre';
import { chargerErreursFor } from '../src/core/erreurs-journal';
import { initProfiles, activeProfile, touchActiveProfile } from '../src/core/profiles';
import { setOnDataWrite } from '../src/core/storage';
import { brut, html } from '../src/core/html';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
	document.body.innerHTML = '';
});

/* Régions live réelles : celle d'un widget (le tri monte `#ltriStatus`) et la région
   FIXE d'un écran (`#revStatus` en révision), utilisée comme repli. */
const REGION_WIDGET = '<p class="sr-only" id="ltriStatus" role="status" aria-live="polite"></p>';
const REGION_REPLI = '<p class="sr-only" id="revStatus" role="status" aria-live="polite"></p>';

/** Monte un écran jetable et renvoie son conteneur (le `scope` de l'annonce). */
function ecran(html: string): HTMLElement {
	document.body.innerHTML = `<div class="ecran">${html}</div>`;
	return document.querySelector<HTMLElement>('.ecran')!;
}
/** Texte annoncé par une région, ou `null` si elle est absente. */
function annonce(sel: string): string | null {
	return document.querySelector(sel)?.textContent ?? null;
}
/** Premier élément d'un fragment HTML, pour inspecter le lien de déblocage. */
function premierElement(html: string): HTMLElement {
	const hote = document.createElement('div');
	hote.innerHTML = html;
	return hote.firstElementChild as HTMLElement;
}

describe('ligneRevelation — les deux formes de la ligne de solution', () => {
	it('solution sur la ligne : deux-points, solution mise en valeur, point final', () => {
		const ligne = ligneRevelation('la réponse', html`4,5`);
		expect(ligne.balisage).toContain('la réponse');
		expect(ligne.balisage).toContain('<strong>4,5</strong>');
		expect(ligne.balisage).toMatch(/ : <strong>4,5<\/strong>\.$/); // « … : <strong>4,5</strong>. »
		expect(ligne.balisage).not.toContain(':.');
		expect(ligne.balisage.match(/\./g)).toHaveLength(1); // un seul point, le final
	});

	it('solution en bloc dessous : la ligne l’annonce et s’arrête sur « : »', () => {
		const bloc = ligneRevelation('le bon classement');
		expect(bloc.balisage).toContain('le bon classement');
		expect(bloc.balisage.endsWith(' :')).toBe(true);
		expect(bloc.balisage.endsWith('.')).toBe(false); // le bloc qui suit porte la solution
		expect(bloc.balisage).not.toContain('<strong>');
	});

	it('les deux formes disent la MÊME phrase : la forme en ligne prolonge celle en bloc', () => {
		const bloc = ligneRevelation('le bon rangement');
		expect(
			ligneRevelation('le bon rangement', html`A · B · C`).balisage.startsWith(bloc.balisage),
		).toBe(true);
	});

	it('le libellé propre au format est reproduit tel quel', () => {
		expect(ligneRevelation('une réponse possible', html`12`).balisage).toContain(
			'une réponse possible',
		);
		expect(ligneRevelation('les bonnes paires').balisage).toContain('les bonnes paires');
	});

	it('une solution vide retombe sur la forme en bloc (pas de « <strong></strong>. »)', () => {
		expect(ligneRevelation('la réponse', html``).balisage).toBe(
			ligneRevelation('la réponse').balisage,
		);
	});

	/* Le contrat a CHANGÉ avec #614, et c'est tout l'objet du lot : la ligne accepte
	   toujours du balisage (une fraction, un `mathInline`, des items joints par « · »),
	   mais elle ne prend plus qu'un `SafeHtml`. « À l'appelant d'échapper » ne repose
	   donc plus sur sa mémoire — lui passer une chaîne brute ne compile pas.
	   Le test fige les DEUX faces : un fragment construit par le gabarit traverse
	   échappé, et un fragment déclaré de confiance traverse tel quel. */
	it('une valeur passée par le gabarit ressort échappée, pas exécutable', () => {
		const ligne = ligneRevelation('la réponse', html`${'<img src=x onerror="pan()">'}`);
		expect(ligne.balisage).not.toContain('<img');
		expect(ligne.balisage).toContain('&lt;img');
		const hote = document.createElement('div');
		hote.innerHTML = ligne.balisage;
		expect(hote.querySelector('img')).toBeNull(); // du TEXTE, plus du markup
	});

	it('un fragment déclaré de confiance traverse tel quel', () => {
		// `brut` reste la porte de sortie : elle sert au balisage que l'application
		// construit elle-même (fraction empilée, liste jointe), jamais à une donnée.
		const ligne = ligneRevelation('la réponse', brut('<strong>4,5</strong>'));
		expect(ligne.balisage).toContain('<strong>4,5</strong>');
	});
});

describe('lienPasserHTML — libellé du lien de déblocage', () => {
	it('le libellé dit ce qu’on obtient, et non un « Passer » sec', () => {
		expect(PASSER_LABEL).toBe('Je ne sais pas, montre-moi');
	});

	it('c’est un bouton, jamais un lien (rien à naviguer)', () => {
		const el = premierElement(lienPasserHTML('rev-giveup', 'revGiveUp').balisage);
		expect(el.tagName).toBe('BUTTON');
		expect(el.getAttribute('type')).toBe('button');
		expect(el.querySelector('a')).toBeNull();
	});

	it('classe et id restent propres à l’écran', () => {
		const el = premierElement(lienPasserHTML('lecon-passer', 'leconPasser').balisage);
		expect(el.className).toBe('lecon-passer');
		expect(el.id).toBe('leconPasser');
	});

	it('le nom accessible est EXACTEMENT le libellé (l’icône n’ajoute pas de texte)', () => {
		const el = premierElement(lienPasserHTML('lecon-passer', 'leconPasser').balisage);
		expect(el.textContent?.trim()).toBe(PASSER_LABEL);
	});

	it('les deux écrans obtiennent le même libellé, à l’habillage près', () => {
		const lecon = premierElement(lienPasserHTML('lecon-passer', 'leconPasser').balisage);
		const revision = premierElement(lienPasserHTML('rev-giveup', 'revGiveUp').balisage);
		expect(lecon.textContent).toBe(revision.textContent);
	});
});

/* ============================================================
   Repli de l'annonce non visuelle. C'est le SEUL canal d'un lecteur d'écran quand une
   question est révélée (le verdict habituel est court-circuité et le focus part sur
   « Continuer »). Besoin : viser d'abord la région du widget si l'écran en monte une,
   sinon la région fixe de l'écran — sans quoi un format sans widget bavard est muet.
   Testé ici (et non en Playwright) parce que la fonction reçoit son `scope` en
   paramètre et ne fait que du choix de région : aucun rendu, aucune navigation. Ce
   qui relève bien de l'e2e, c'est que CHAQUE écran monte effectivement une région.
   ============================================================ */
describe('annoncerRevelation — région du widget, sinon repli', () => {
	it('l’annonce va dans la région du widget quand l’écran en monte une', () => {
		const scope = ecran(REGION_WIDGET + REGION_REPLI);
		annoncerRevelation({ scope, repli: '#revStatus', message: 'La réponse : 12.' });
		expect(annonce('#ltriStatus')).toContain('La réponse : 12.');
		expect(annonce('#revStatus')).toBe(''); // le repli reste muet, pas de doublon
	});

	it('sans région de widget, l’annonce tombe dans le repli (formats jusqu’ici muets)', () => {
		const scope = ecran(REGION_REPLI);
		annoncerRevelation({ scope, repli: '#revStatus', message: 'La réponse : chat.' });
		expect(annonce('#revStatus')).toContain('La réponse : chat.');
	});

	it('la priorité ne dépend pas de l’ordre du markup', () => {
		const scope = ecran(REGION_REPLI + REGION_WIDGET); // repli EN PREMIER
		annoncerRevelation({ scope, repli: '#revStatus', message: 'La réponse : 12.' });
		expect(annonce('#ltriStatus')).toContain('La réponse : 12.');
		expect(annonce('#revStatus')).toBe('');
	});

	it('écran sans repli déclaré (mode leçon) : la région présente reçoit l’annonce', () => {
		const scope = ecran(REGION_WIDGET);
		annoncerRevelation({ scope, message: REVELATION_EN_PLACE.balisage });
		expect(annonce('#ltriStatus')).toContain(REVELATION_EN_PLACE.balisage);
	});

	it('repli déclaré mais absent du scope : l’annonce n’est pas perdue', () => {
		const scope = ecran(REGION_WIDGET);
		annoncerRevelation({ scope, repli: '#revStatus', message: 'La réponse : 12.' });
		expect(annonce('#ltriStatus')).toContain('La réponse : 12.');
	});

	it('l’annonce dédramatise AVANT de donner la réponse, et remplace le message précédent', () => {
		const scope = ecran(REGION_REPLI);
		document.querySelector('#revStatus')!.textContent = 'Bravo, tout est juste.';
		annoncerRevelation({ scope, repli: '#revStatus', message: 'La réponse : 12.' });
		expect(annonce('#revStatus')).toBe(`${REVEAL_LAB} La réponse : 12.`);
		expect(annonce('#revStatus')).not.toContain('Bravo');
	});

	it('n’écrit jamais dans une région située HORS du scope', () => {
		document.body.innerHTML = `${REGION_REPLI}<div class="ecran"></div>`;
		annoncerRevelation({
			scope: document.querySelector<HTMLElement>('.ecran'),
			repli: '#revStatus',
			message: 'La réponse : 12.',
		});
		expect(annonce('#revStatus')).toBe('');
	});

	it('aucune région, ou pas de scope : rien n’est inventé et rien ne casse', () => {
		const scope = ecran('<p>Question sans région live</p>');
		expect(() => annoncerRevelation({ scope, repli: '#revStatus', message: 'x' })).not.toThrow();
		expect(scope.innerHTML).toBe('<p>Question sans région live</p>');
		expect(() => annoncerRevelation({ scope: null, message: 'x' })).not.toThrow();
	});
});

/* ============================================================
   Ce qui part à l'OREILLE n'emporte pas le séparateur de milliers (#501, avis
   relecteur-accessibilite). Depuis que les verdicts passent par `formatReponseRevelee`,
   un message d'annonce peut contenir un nombre GROUPÉ (« 2 300 000 ») — graphie faite
   pour l'œil. Or ces régions `role="status"` sont écrites en `textContent` et lues par
   le lecteur d'écran de l'enfant, une pipeline que le projet ne maîtrise pas : le
   signal est dans le projet lui-même, `core/tts-text.ts` recollait déjà les classes
   avant de parler, preuve qu'au moins un moteur épelle les groupes au lieu de lire un
   entier. La règle est donc posée au POINT DE PASSAGE (`annoncerStatut`), pour qu'un
   futur runner en hérite ; c'est ce point d'entrée qu'on éprouve ici, la fonction pure
   `sansSeparateurMilliers` l'étant dans tests/reponse-revelee.test.ts.

   Les DEUX écritures de la fonction sont couvertes : la région du widget et le repli —
   la règle appliquée à une seule des deux serait invisible à l'usage (elle ne se
   verrait que sur les écrans qui n'ont pas de région de widget).

   Ce que ce test ne prouve pas : que TOUTE région live de l'appli passe par ici. Le
   sprint a son propre point d'entrée (`sprintAnnonce`, module privé → e2e), et
   plusieurs widgets écrivent leur région en direct.
   ============================================================ */
const U202F = String.fromCharCode(0x202f); // espace fine insécable (séparateur de milliers)
const U00A0 = String.fromCharCode(0x00a0); // espace insécable

describe('annoncerStatut — un grand nombre annoncé est RECOLLÉ (#501)', () => {
	it('région du widget : le nombre est collé, la phrase reste une phrase', () => {
		const scope = ecran(REGION_WIDGET);
		annoncerStatut({ scope, message: `La bonne réponse était 2${U202F}300${U202F}000.` });
		const lu = annonce('#ltriStatus')!;
		expect(lu).toBe('La bonne réponse était 2300000.'); // espaces des MOTS intacts
		expect(lu).not.toContain(U202F);
		expect(lu).not.toContain(U00A0);
	});

	it('l’espace insécable est neutralisé lui aussi', () => {
		const scope = ecran(REGION_WIDGET);
		annoncerStatut({ scope, message: `Il reste 1${U00A0}234 points.` });
		expect(annonce('#ltriStatus')).toBe('Il reste 1234 points.');
	});

	it('chemin de REPLI : la règle s’applique aux DEUX écritures de la fonction', () => {
		// `seulementRepli` sur un écran sans région de widget : c'est la seconde écriture,
		// celle qu'un correctif posé à un seul endroit laisserait passer.
		const scope = ecran(REGION_REPLI);
		annoncerStatut({
			scope,
			repli: '#revStatus',
			message: `Une réponse possible était 6${U202F}150${U202F}000.`,
			seulementRepli: true,
		});
		expect(annonce('#revStatus')).toBe('Une réponse possible était 6150000.');
	});

	it('annoncerRevelation en hérite, puisqu’elle passe par annoncerStatut', () => {
		const scope = ecran(REGION_REPLI);
		annoncerRevelation({
			scope,
			repli: '#revStatus',
			message: `La réponse : un nombre entre 6${U202F}100${U202F}000 et 6${U202F}200${U202F}000.`,
		});
		const lu = annonce('#revStatus')!;
		expect(lu).toBe(`${REVEAL_LAB} La réponse : un nombre entre 6100000 et 6200000.`);
		expect(lu).not.toContain(U202F);
	});

	it('un message sans grand nombre traverse inchangé', () => {
		const scope = ecran(REGION_WIDGET);
		annoncerStatut({ scope, message: 'La bonne réponse était chat.' });
		expect(annonce('#ltriStatus')).toBe('La bonne réponse était chat.');
	});
});

describe('capterPasse — ce qu’un passage laisse au journal encadrant', () => {
	it('entrée sans réponse donnée, marquée « n’a pas essayé », sous le mode de l’écran', () => {
		capterPasse({
			text: 'Range ces nombres du plus petit au plus grand.',
			attendue: '12 · 30 · 45',
			lessonId: 'ranger-entiers',
			mode: 'lecon',
		});
		capterPasse({
			text: 'Quel mot va avec « dos » ?',
			attendue: 'dossier',
			lessonId: 'vocab-familles',
			mode: 'revision',
		});
		const journal = chargerErreursFor(activeProfile().uuid);
		expect(journal.map((e) => [e.mode, e.donnee, e.sansTentative])).toEqual([
			['revision', '', true],
			['lecon', '', true],
		]);
		expect(journal[1].attendue).toBe('12 · 30 · 45'); // la solution reste lisible côté parent
	});
});
