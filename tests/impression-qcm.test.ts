/* ============================================================
   Impression des QCM (#289) — vérifié au niveau LOGIQUE (chaînes HTML produites
   par le pipeline d'impression), pas au DOM : le générateur tire au hasard, une
   assertion e2e fine serait flaky. On verrouille ici :
   - la propagation des choix (`choices`/`choicesView`) jusqu'à l'Item ;
   - le rendu PAPIER d'un QCM en cases à cocher (fiche ET bilan) + consigne d'action ;
   - la zone-réponse garantie (jamais de question « en l'air ») ;
   - le confinement du `printMode` (l'écran n'en hérite pas).
   ============================================================ */
import { describe, it, expect, afterEach } from 'vitest';
import { buildPrintableDOM } from '../src/core/lessons';
import { getLessonById, genLessonItem } from '../src/core/catalog';
import { renderItem, setPrintMode, getPrintMode } from '../src/core/items';

// Un QCM texte pur (angles), un QCM à vue riche (fractions), un QCM à images (symétrie).
const QCM_TEXTE = 'geo-angles';
const QCM_VUE_RICHE = 'num-frac-sens';
const QCM_IMAGES = 'geo-symetrie-axiale';

afterEach(() => setPrintMode(false)); // aucun test ne doit laisser le mode actif

describe('genLessonItem — propagation des choix de QCM (#289)', () => {
	it('un QCM texte conserve ses `choices` (jetés jusqu’ici)', () => {
		const lesson = getLessonById(QCM_TEXTE)!;
		for (let i = 0; i < 20; i++) {
			const it = genLessonItem(lesson);
			expect(it.choices && it.choices.length).toBeGreaterThan(0);
			// La bonne réponse fait partie des choix proposés.
			expect(it.choices).toContain(String(it.answer));
		}
	});

	it('un QCM à vue riche conserve `choicesView`, aligné par index sur `choices`', () => {
		const lesson = getLessonById(QCM_VUE_RICHE)!;
		for (let i = 0; i < 20; i++) {
			const it = genLessonItem(lesson);
			expect(it.choices && it.choices.length).toBeGreaterThan(0);
			expect(it.choicesView?.length).toBe(it.choices?.length);
		}
	});

	it('un item de saisie (non-QCM) n’a pas de `choices`', () => {
		const lesson = getLessonById('calc-addition-posee')!; // opération posée
		const it = genLessonItem(lesson);
		expect(it.choices).toBeUndefined();
	});
});

describe('renderItem — cases à cocher RÉSERVÉES à l’impression (#289)', () => {
	it('hors impression, un item QCM ne produit PAS de cases à cocher', () => {
		const it = genLessonItem(getLessonById(QCM_TEXTE)!);
		setPrintMode(false);
		const html = renderItem(it);
		expect(html).not.toContain('qcm-print-box');
		expect(html).not.toContain('qcm-print-choices');
	});

	it('en impression, un item QCM produit la liste de cases à cocher', () => {
		const it = genLessonItem(getLessonById(QCM_TEXTE)!);
		setPrintMode(true);
		const html = renderItem(it);
		expect(html).toContain('qcm-print-choices');
		// Autant de cases que de choix.
		const boxes = html.match(/qcm-print-box/g) ?? [];
		expect(boxes.length).toBe(it.choices!.length);
		// Pas de champ de saisie pour un QCM (la réponse se coche).
		expect(html).not.toContain('class="ans');
	});

	it('en impression, le `@` d’un QCM à trou devient une case vide (pas un « @ » littéral)', () => {
		setPrintMode(true);
		const html = renderItem({
			text: 'Le bébé @ beaucoup pleuré.',
			answer: 'a',
			choices: ['a', 'à'],
			kind: 'text',
		});
		expect(html).toContain('cloze-box'); // emplacement matérialisé par un rectangle vide
		expect(html).not.toContain('@'); // plus de « @ » brut, incompréhensible pour un enfant
		setPrintMode(false);
	});

	it('en impression, un item de saisie sans `@` reçoit quand même une zone-réponse', () => {
		// Item texte fabriqué sans `@` : la garantie d'impression doit ajouter un champ.
		setPrintMode(true);
		const html = renderItem({ text: 'Une question sans emplacement', answer: 'x', kind: 'text' });
		expect(html).toContain('class="ans'); // champ ajouté
		setPrintMode(false);
		// Hors impression, le comportement historique est inchangé (pas d'ajout).
		const htmlEcran = renderItem({
			text: 'Une question sans emplacement',
			answer: 'x',
			kind: 'text',
		});
		expect(htmlEcran).not.toContain('class="ans');
	});
});

describe('buildPrintableDOM — fiche & bilan de QCM (#289)', () => {
	const scopeBase = { title: 'Test impression' };

	it('une FICHE de QCM imprime les choix en cases à cocher + consigne « Coche… »', () => {
		const dom = buildPrintableDOM({ ...scopeBase, lessonIds: [QCM_TEXTE], kind: 'fiches' });
		expect(dom).toContain('qcm-print-choices');
		expect(dom).toContain('qcm-print-box');
		expect(dom).toContain('Coche la bonne réponse.');
	});

	it('un BILAN de QCM imprime cases à cocher + consigne d’action par bloc', () => {
		const dom = buildPrintableDOM({ ...scopeBase, lessonIds: [QCM_TEXTE], kind: 'bilan', nbQ: 3 });
		expect(dom).toContain('qcm-print-choices');
		expect(dom).toContain('bloc-consigne');
		expect(dom).toContain('Coche la bonne réponse.');
	});

	it('la symétrie « reflet » imprime ses images-choix (choicesView SVG) en cases à cocher', () => {
		// Le format « reflet » étiquette ses images par leur position (« La première
		// image »…) ; on tire jusqu'à le rencontrer (les autres formats sont Oui/Non).
		let vuImage = false;
		for (let i = 0; i < 12 && !vuImage; i++) {
			const dom = buildPrintableDOM({ ...scopeBase, lessonIds: [QCM_IMAGES], kind: 'fiches' });
			expect(dom).toContain('qcm-print-choices'); // tous les formats → cases à cocher
			if (dom.includes('aria-label="La ')) vuImage = true; // libellé positionnel d'une image-choix
		}
		expect(vuImage).toBe(true);
	});

	it('aucune question imprimée n’est « en l’air » : autant de zones-réponse que d’items', () => {
		// Chaque cellule de fiche (`.conj-op`) d'un QCM doit porter sa liste de cases à
		// cocher → le nombre de listes égale le nombre de cellules (pas de question seule).
		const dom = buildPrintableDOM({ ...scopeBase, lessonIds: [QCM_TEXTE], kind: 'fiches' });
		const cells = (dom.match(/<div class="conj-op">/g) ?? []).length;
		const zones = (dom.match(/qcm-print-choices/g) ?? []).length;
		expect(cells).toBeGreaterThan(0);
		expect(zones).toBe(cells);
	});

	it('le `printMode` est retiré après génération (l’écran n’en hérite pas)', () => {
		expect(getPrintMode()).toBe(false);
		buildPrintableDOM({ ...scopeBase, lessonIds: [QCM_TEXTE], kind: 'fiches' });
		expect(getPrintMode()).toBe(false);
	});

	it('le `printMode` est remis à false même si la génération lève (try/finally)', () => {
		expect(getPrintMode()).toBe(false);
		// `lessonIds` absent → la génération lève avant tout rendu, APRÈS setPrintMode(true).
		expect(() =>
			buildPrintableDOM({
				title: 'x',
				lessonIds: undefined as unknown as string[],
				kind: 'fiches',
			}),
		).toThrow();
		expect(getPrintMode()).toBe(false);
	});
});
