/* ============================================================
   Compteur d'étoiles de l'accueil (#recLecon) — module PUR (#559).

   Tests écrits AVANT l'implémentation, depuis les critères de l'issue :
   - critère 4 : la branche mono-niveau emploie le mot « étoiles » ;
   - critère 7 : aucun compteur n'affiche un « 0 sur N » brut (un 0 se lit
     comme une note), dans AUCUNE des deux branches ;
   - critère 8 : la branche multi-niveaux ne change ni de valeur ni de
     formulation (le cumul reste le chiffre mis en avant) → seuls tests à
     assertion littérale, la non-régression étant justement l'objet.

   Ailleurs on teste des PROPRIÉTÉS (mot « étoile » présent, absence de 0 brut,
   accords) et non des chaînes exactes : la formulation exacte de la branche
   mono-niveau n'est pas figée par l'issue.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { compteurEtoilesHTML, type EtatCompteurEtoiles } from '../src/core/compteur-etoiles';

/* `compteurEtoilesHTML` rend un `SafeHtml` depuis #614 : on lit son balisage, les
   assertions ci-dessous portant sur la chaîne rendue. Adaptation de type, pas de contrat. */
const rendu = (e: EtatCompteurEtoiles) => compteurEtoilesHTML(e).balisage;

/* Texte lisible par l'enfant : les assertions de « 0 brut » doivent voir
   `<strong>0</strong>` comme un « 0 » affiché. */
const texte = (html: string) => html.replace(/<[^>]*>/g, '');

/* Sous-ligne « objectif de la classe » d'une sortie multi-niveaux, en texte lisible. */
const sousLigne = (html: string) => {
	const i = html.indexOf('<span class="rec-sub">');
	expect(i).toBeGreaterThan(-1);
	return texte(html.slice(i));
};

const etat = (e: Partial<EtatCompteurEtoiles>): EtatCompteurEtoiles => ({
	starsNiveau: 0,
	totalNiveau: 33,
	starsCumul: 0,
	labelClasse: 'CE2',
	...e,
});

describe('compteur d’étoiles — branche multi-niveaux (non-régression, critère 8)', () => {
	it('met en avant le cumul et passe l’objectif de la classe en sous-ligne', () => {
		expect(
			rendu(etat({ starsNiveau: 3, totalNiveau: 33, starsCumul: 8, labelClasse: 'CM1' })),
		).toBe(
			'⭐ <strong>8</strong> étoiles gagnées<span class="rec-sub">🎯 3/33 étoiles en CM1</span>',
		);
	});

	it('cumul d’une seule étoile : accords au singulier', () => {
		expect(
			rendu(etat({ starsNiveau: 0, totalNiveau: 33, starsCumul: 1, labelClasse: 'CM1' })),
		).toBe(
			'⭐ <strong>1</strong> étoile gagnée<span class="rec-sub">🎯 CM1 : 33 étoiles à gagner</span>',
		);
	});

	it('zéro au niveau actif : l’objectif invite au lieu de noter (aucun « 0 sur N »)', () => {
		const html = rendu(
			etat({ starsNiveau: 0, totalNiveau: 33, starsCumul: 8, labelClasse: 'CM1' }),
		);
		expect(html).toBe(
			'⭐ <strong>8</strong> étoiles gagnées<span class="rec-sub">🎯 CM1 : 33 étoiles à gagner</span>',
		);
		expect(texte(html)).not.toMatch(/\b0\b/);
	});

	it('sous-ligne au singulier : l’accord suit le numérateur', () => {
		expect(
			rendu(etat({ starsNiveau: 1, totalNiveau: 33, starsCumul: 4, labelClasse: 'CM1' })),
		).toBe(
			'⭐ <strong>4</strong> étoiles gagnées<span class="rec-sub">🎯 1/33 étoile en CM1</span>',
		);
	});

	it('la sous-ligne nomme les étoiles dans SES DEUX cas (avancée et invitation)', () => {
		// Propriété qui manquait : un littéral seul aurait figé une sous-ligne muette
		// (« 12/33 en CM1 »), donc le défaut même que ce compteur corrige juste à côté.
		expect(sousLigne(rendu(etat({ starsNiveau: 12, starsCumul: 20 })))).toMatch(/étoiles?/);
		expect(sousLigne(rendu(etat({ starsNiveau: 0, starsCumul: 20 })))).toMatch(/étoiles?/);
	});

	it('objectif à une seule leçon : « 1 étoile à gagner » au singulier', () => {
		const html = rendu(etat({ starsNiveau: 0, totalNiveau: 1, starsCumul: 4, labelClasse: 'CM1' }));
		expect(texte(html)).not.toMatch(/\b1 étoiles\b/);
		expect(texte(html)).toContain('1 étoile à gagner');
	});
});

describe('compteur d’étoiles — branche mono-niveau (critères 4 et 7)', () => {
	it('critère 7 : un enfant qui démarre ne lit jamais un « 0 sur N »', () => {
		const html = rendu(etat({ starsNiveau: 0, totalNiveau: 33, starsCumul: 0 }));
		// Ni « 0/33 », ni « 0 sur 33 », ni un 0 mis en avant.
		expect(texte(html)).not.toMatch(/\b0\b/);
		// Le compteur invite : il annonce ce qu'il y a à gagner…
		expect(html).toContain('33');
		// …dans le vocabulaire des étoiles (critère 4).
		expect(html).toContain('étoile');
	});

	it('critère 4 : le compteur parle d’étoiles, plus de « leçons réussies sans faute »', () => {
		const html = rendu(etat({ starsNiveau: 12, totalNiveau: 33, starsCumul: 12 }));
		expect(texte(html)).toMatch(/étoiles/);
		expect(texte(html)).not.toMatch(/leçons? réussies? sans faute/);
		// La progression vers le catalogue de la classe est conservée.
		expect(html).toContain('12');
		expect(html).toContain('33');
	});

	it('accord au singulier avec une seule étoile', () => {
		const html = rendu(etat({ starsNiveau: 1, totalNiveau: 33, starsCumul: 1 }));
		expect(texte(html)).toContain('étoile');
		expect(texte(html)).not.toMatch(/\b1 étoiles\b/);
	});

	it('l’égalité cumul = étoiles du niveau relève bien de la branche mono-niveau', () => {
		const base = { starsNiveau: 5, totalNiveau: 33 };
		const mono = rendu(etat({ ...base, starsCumul: 5 }));
		const multi = rendu(etat({ ...base, starsCumul: 8 }));
		// Deux formulations distinctes : à égalité, rien ne vient d'un autre niveau.
		expect(mono).not.toBe(multi);
		// La branche multi met en avant le cumul, pas la branche mono.
		expect(multi).toContain('<strong>8</strong>');
		expect(mono).not.toContain('<strong>8</strong>');
		expect(mono).toContain('33');
	});
});

describe('compteur d’étoiles — cas défensifs', () => {
	it('catalogue vide de la classe, mais des étoiles ailleurs : le trésor reste, l’objectif se tait', () => {
		// Le cumul est le chiffre mis en avant et il ne doit JAMAIS être effacé (critère 8) :
		// même formulation que la branche multi-niveaux, moins la sous-ligne — un objectif
		// n'a rien à énoncer sur un catalogue vide, et aucun zéro n'est émis (critère 7).
		const html = rendu(etat({ starsNiveau: 0, totalNiveau: 0, starsCumul: 5, labelClasse: 'CM1' }));
		expect(html).toBe('⭐ <strong>5</strong> étoiles gagnées');
		expect(html).not.toContain('rec-sub');
		expect(texte(html)).not.toMatch(/\b0\b/);
	});

	it('catalogue vide et aucune étoile : rien à afficher du tout', () => {
		// Ni « 0 étoile à gagner », ni un compteur vide de sens : pas de compteur.
		expect(rendu(etat({ starsNiveau: 0, totalNiveau: 0, starsCumul: 0 }))).toBe('');
	});

	it('module pur : ni DOM ni stockage lus, sortie stable pour un même état', () => {
		localStorage.clear();
		const e = etat({ starsNiveau: 4, totalNiveau: 33, starsCumul: 9, labelClasse: 'CM1' });
		const a = rendu(e);
		expect(a).not.toBe('');
		expect(rendu(e)).toBe(a);
		expect(localStorage.length).toBe(0);
	});
});
