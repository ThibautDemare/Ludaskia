/* ============================================================
   Auto-test du détecteur partagé `tests/gardes-gestes.ts` (#777, critère 19).
   ------------------------------------------------------------
   Les gates qui l'appliquent sont VERTS sur le contenu réel : un détecteur devenu trop
   permissif (radical retiré, frontière de mot cassée, flexion oubliée) les laisserait
   verts aussi, en silence. On l'éprouve donc sur des textes fabriqués : ce qu'il doit
   signaler, et les faux amis qu'il ne doit PAS signaler.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { GESTES, RADICAUX_GESTES, premierGeste, radicalCanonique } from './gardes-gestes';

describe('gardes-gestes — détecteur des gestes d’écran', () => {
	it('signale chaque geste du critère 19, et « relier », sous ses flexions et sa casse', () => {
		for (const texte of [
			'Clique sur le verbe',
			'Cliquez ici.',
			'Touche le mot',
			'Touchez la case.',
			'Tape le nombre',
			'Glisse les tuiles',
			'Il faut glisser la tuile.',
			'Je déplace les tuiles',
			'En déplaçant la tuile.',
			'Appuie sur le bouton',
			'Appuyez fort.',
			'Écoute et écris',
			'Mot écouté.',
			'Familles de mots à relier',
			'Reliez les mots.',
			'TAPE ICI',
		]) {
			expect(premierGeste(texte), texte).not.toBeNull();
		}
	});

	it('ne signale pas les faux amis ni les tâches écrites', () => {
		for (const texte of [
			'Trouve le verbe',
			'Mots de la même famille',
			'Repère le groupe nominal',
			'Problèmes en deux étapes',
			'Le cliquetis du tapis.',
			'Mon écouteur est cassé.',
			'Une attention touchante.',
			'Le relief.',
			'La religion.',
			'Tu relis la phrase.',
			'Recopie le verbe conjugué.',
			'Coche la bonne réponse.',
		]) {
			expect(premierGeste(texte), texte).toBeNull();
		}
	});

	it('l’expression globale trouve toutes les occurrences, et rend la variante de radical', () => {
		const trouves = [...'Clique, puis déplaçant, puis appuyez.'.matchAll(GESTES)];
		expect(trouves.map((m) => radicalCanonique.get(m[1].toLowerCase()))).toEqual([
			'cliqu',
			'déplac',
			'appui',
		]);
		// `matchAll` clone l'expression : deux parcours successifs voient la même chose.
		expect([...'Touche.'.matchAll(GESTES)]).toHaveLength(1);
		expect([...'Touche.'.matchAll(GESTES)]).toHaveLength(1);
	});

	it('chaque variante renvoie à un radical déclaré, et chaque radical est sa propre variante', () => {
		for (const [variante, canon] of radicalCanonique) {
			expect(Object.hasOwn(RADICAUX_GESTES, canon), variante).toBe(true);
		}
		for (const [canon, variantes] of Object.entries(RADICAUX_GESTES)) {
			expect(variantes, canon).toContain(canon);
		}
	});
});
