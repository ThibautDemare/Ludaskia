/* ============================================================
   Résumés chiffrés du récap de Révision (#690) — vue ENCADRANT.
   ------------------------------------------------------------
   Cible : `syntheseRevision`, `resumeGroupe` et `resumeEtage` (src/ui/encadrant-revision.ts),
   les trois fonctions PURES qui dénombrent la file de répétition espacée pour l'adulte — la
   phrase d'en-tête du bloc « Révision », le résumé d'une catégorie (dans le <summary> de son
   accordéon), et celui d'un étage de l'escalier dans la vue « Par palier ».

   Les deux premières énumèrent des parts DISJOINTES d'un tout (rotation, acquis, attente) ;
   la troisième annonce un TOUT puis ses sous-comptes inclus (dues, en attente). L'invariant
   n'a donc pas la même forme des deux côtés, et chaque bloc dit le sien.

   Exigence gardée ici (remontée `redacteur-contenu-francais`) : **aucun compte nul
   n'apparaît dans le résumé**, et **un ensemble non vide ne se résume jamais par du
   vide**. Avant #690 le défaut ne se voyait pas — à `total > 0`,
   `enRotation` ne pouvait valoir zéro que si tout était acquis. Depuis, une leçon
   déclarée « vue en classe » est mise en attente sans entrer en rotation, si bien que
   le scénario qui motive la fonctionnalité (cent leçons qu'on vient de déclarer)
   ouvrait la phrase sur un compte nul, avant la seule information utile. Le même défaut
   avait sa moitié symétrique côté catégorie : une catégorie entièrement en attente n'avait
   plus aucun segment à afficher, donc un résumé VIDE sous son titre.

   Parti pris d'écriture : les assertions portent sur les COMPTES annoncés et sur la
   bonne formation de la phrase, pas sur sa formulation. Un test qui exigerait
   « 0 entrée en révision » à la lettre rougirait le jour où le libellé est reformulé,
   alors que rien ne serait cassé ; en revanche « ce compte-là ne doit pas être
   prononcé » reste vrai quelle que soit la tournure retenue.

   Invariants du modèle, utilisés pour bâtir les fixtures (cf. RecapRevision,
   src/core/encadrant-stats.ts) : `total === enAttente + enRotation + acquises`
   (les trois comptes ne se recouvrent pas) et `dues ⊆ enRotation`. Sur un étage, `dues` et
   `enAttente` sont deux sous-ensembles DISJOINTS des entrées présentes (une entrée en
   attente n'a pas d'échéance, donc n'est jamais échue).
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { syntheseRevision, resumeGroupe, resumeEtage } from '../src/ui/encadrant-revision';
import type {
	EntreeRevision,
	GroupeRevision,
	PalierRevision,
	RecapRevision,
} from '../src/core/encadrant-stats';

/* Récap minimal : seuls les compteurs comptent pour la synthèse. `groupes`, `parUrgence`
   et `parPalier` alimentent les trois vues, pas la phrase. Le garde-fou sur `dues`
   empêche d'écrire une fixture impossible (une entrée due qui ne serait pas en rotation :
   une entrée en attente n'a pas d'échéance, donc ne peut pas être échue). */
function recap(c: {
	enRotation?: number;
	enAttente?: number;
	acquises?: number;
	dues?: number;
}): RecapRevision {
	const enRotation = c.enRotation ?? 0;
	const enAttente = c.enAttente ?? 0;
	const acquises = c.acquises ?? 0;
	const dues = c.dues ?? 0;
	if (dues > enRotation) {
		throw new Error('fixture impossible : les dues sont un sous-ensemble des entrées en rotation');
	}
	return {
		total: enRotation + enAttente + acquises,
		enRotation,
		enAttente,
		acquises,
		dues,
		groupes: [],
		parUrgence: [],
		parPalier: [],
	};
}

/* Groupe (une catégorie du récap) : mêmes compteurs, même garde-fou sur `dues`. `entrees`
   n'entre pas dans le résumé, mais un groupe n'existe QUE s'il a au moins une entrée
   (`revisionProfil` ne produit pas de catégorie vide), d'où le contrôle de cohérence. */
function groupe(c: {
	enRotation?: number;
	enAttente?: number;
	acquises?: number;
	dues?: number;
}): GroupeRevision {
	const enRotation = c.enRotation ?? 0;
	const enAttente = c.enAttente ?? 0;
	const acquises = c.acquises ?? 0;
	const dues = c.dues ?? 0;
	if (dues > enRotation) {
		throw new Error('fixture impossible : les dues sont un sous-ensemble des entrées en rotation');
	}
	return {
		categoryId: 'calcul',
		label: 'Calcul',
		subject: 'maths',
		entrees: [],
		enRotation,
		enAttente,
		acquises,
		dues,
	};
}

/* Une entrée d'étage, dans l'un de ses trois états observables. Le résumé d'étage compte
   les ENTRÉES présentes (`entrees.length`), pas un compteur séparé : les fixtures doivent
   donc être cohérentes, sinon le test mesurerait un modèle impossible. Une entrée en
   attente n'a ni échéance ni jours restants — c'est ce qui la rend non échue. */
function entree(i: number, etat: 'attente' | 'due' | 'programmee'): EntreeRevision {
	return {
		cle: `lecon-${i}`,
		label: `Leçon ${i}`,
		nature: 'lecon',
		categoryId: 'calcul',
		palier: 0,
		palierLabel: '1 jour',
		acquis: false,
		prochaineRevision: etat === 'attente' ? null : 1_700_000_000_000,
		echeance:
			etat === 'attente' ? '' : etat === 'due' ? "à réviser aujourd'hui" : 'à réviser demain',
		du: etat === 'due',
		joursRestants: etat === 'attente' ? null : etat === 'due' ? 0 : 1,
		enAttente: etat === 'attente',
	};
}

/* Étage de l'escalier : `total` entrées, dont `dues` échues et `enAttente` jamais démarrées
   — deux sous-ensembles disjoints, d'où le garde-fou sur leur somme. */
function etage(c: { total: number; dues?: number; enAttente?: number }): PalierRevision {
	const dues = c.dues ?? 0;
	const enAttente = c.enAttente ?? 0;
	if (dues + enAttente > c.total) {
		throw new Error(
			'fixture impossible : dues et en attente sont disjointes, et incluses dans l’étage',
		);
	}
	const entrees = [
		...Array.from({ length: dues }, (_, i) => entree(i, 'due')),
		...Array.from({ length: enAttente }, (_, i) => entree(100 + i, 'attente')),
		...Array.from({ length: c.total - dues - enAttente }, (_, i) => entree(200 + i, 'programmee')),
	];
	return { palier: 0, label: '1 jour', acquis: false, entrees, dues, enAttente };
}

/* Les nombres effectivement PRONONCÉS par le résumé, dans l'ordre où on les lit.
   C'est la lecture la plus indépendante de la formulation : un compte affiché est un
   nombre dans le texte, quelle que soit la phrase qui le porte. */
function nombresAnnonces(phrase: string): number[] {
	return (phrase.match(/\d+/g) ?? []).map(Number);
}

const croissant = (a: number, b: number) => a - b;

/* Bonne formation, indépendamment des comptes : ce qui doit rester vrai de tout résumé
   chiffré rendu à l'adulte, y compris après un segment omis (le bug de #690 se manifestait
   d'abord par un compte nul, mais omettre un segment sans soin produit l'autre moitié du
   défaut : séparateur orphelin, double espace, résumé vide). */
function verifierResumeBienForme(texte: string): void {
	expect(texte.trim()).toBe(texte); // ni espace de tête ni espace de queue
	expect(texte).toMatch(/^[0-9A-Za-zÀ-ÿ]/); // commence par du contenu, pas par un séparateur
	expect(texte).not.toMatch(/\s{2,}/); // pas de trou laissé par un segment omis
	expect(texte).not.toMatch(/·\s*·/); // pas de séparateur redoublé
	expect(texte).not.toMatch(/·\s*\.?$/); // pas de séparateur en fin de résumé
	expect(texte).not.toMatch(/[,;]\s*\.?$/); // ni de virgule laissée en suspens
	expect(texte).not.toMatch(/\s[.,]/); // pas de ponctuation détachée
	expect(texte).not.toMatch(/[,;]\s*\./); // pas de virgule collée au point final
	expect(texte).not.toMatch(/\.\./); // jamais deux points
	expect(texte).not.toMatch(/\b0\b/); // AUCUN compte nul prononcé
	expect(texte).not.toMatch(/\baucune?\b/i); // ni sa version en toutes lettres
}

function verifierPhraseBienFormee(phrase: string): void {
	verifierResumeBienForme(phrase);
	expect(phrase.endsWith('.')).toBe(true); // une phrase, close
}

describe('syntheseRevision : aucun compte nul n’est annoncé (#690)', () => {
	it('tout le stock est en attente : la phrase s’ouvre sur ce stock, sans « 0 » en tête', () => {
		// Le scénario qui motive #690 : cent leçons déclarées « vues en classe », donc en
		// attente, aucune encore entrée en rotation.
		const phrase = syntheseRevision(recap({ enAttente: 100 }));
		expect(nombresAnnonces(phrase)).toEqual([100]);
		verifierPhraseBienFormee(phrase);
	});

	it('rien en rotation mais des acquis et de l’attente : le compte nul disparaît', () => {
		const phrase = syntheseRevision(recap({ enAttente: 3, acquises: 5 }));
		expect(nombresAnnonces(phrase).sort(croissant)).toEqual([3, 5]);
		verifierPhraseBienFormee(phrase);
	});

	it('rotation sans aucune échéance atteinte : pas de sous-compte « 0 à réviser »', () => {
		const phrase = syntheseRevision(recap({ enRotation: 4, dues: 0 }));
		expect(nombresAnnonces(phrase)).toEqual([4]);
		verifierPhraseBienFormee(phrase);
	});

	it('tout est acquis : ni rotation ni attente ne sont annoncées', () => {
		const phrase = syntheseRevision(recap({ acquises: 12 }));
		expect(nombresAnnonces(phrase)).toEqual([12]);
		verifierPhraseBienFormee(phrase);
	});

	it('tout est dû : le sous-compte égale la rotation, et reste annoncé', () => {
		const phrase = syntheseRevision(recap({ enRotation: 6, dues: 6 }));
		expect(nombresAnnonces(phrase)).toEqual([6, 6]);
		verifierPhraseBienFormee(phrase);
	});

	it('gros comptes : un zéro DANS un nombre (10, 100, 1000) n’est pas un compte nul', () => {
		// Garde-fou du test lui-même autant que du code : la règle est « pas de compte nul »,
		// pas « pas de chiffre zéro ».
		const phrase = syntheseRevision(recap({ enRotation: 10, acquises: 100, enAttente: 1000 }));
		expect(nombresAnnonces(phrase).sort(croissant)).toEqual([10, 100, 1000]);
		verifierPhraseBienFormee(phrase);
	});

	it('récap vide : aucun compte inventé (cas écarté par l’appelant, non contractuel)', () => {
		// L'appelant retourne tôt sur `total === 0`, donc la fonction n'est jamais appelée
		// ainsi. On ne verrouille donc PAS ce qu'elle rend (aujourd'hui un point seul) —
		// figer une sortie dégénérée ferait rougir le jour où on l'améliorerait. On tient
		// seulement l'invariant, qui vaut aussi ici : rien de nul n'est prononcé.
		expect(nombresAnnonces(syntheseRevision(recap({})))).toEqual([]);
	});

	it('ÉCHANTILLON : dans tous les mélanges, chaque compte non nul est annoncé une fois et un seul', () => {
		let cas = 0;
		for (const enRotation of [0, 1, 2, 7]) {
			for (const enAttente of [0, 1, 3, 100]) {
				for (const acquises of [0, 1, 5]) {
					// `dues` balaie ses trois positions remarquables : aucune, une, toutes.
					for (const dues of new Set([0, Math.min(1, enRotation), enRotation])) {
						if (enRotation + enAttente + acquises === 0) continue; // écarté par l'appelant
						const phrase = syntheseRevision(recap({ enRotation, enAttente, acquises, dues }));
						const attendus = [enRotation, dues, acquises, enAttente]
							.filter((n) => n > 0)
							.sort(croissant);
						expect(nombresAnnonces(phrase).sort(croissant), phrase).toEqual(attendus);
						verifierPhraseBienFormee(phrase);
						cas++;
					}
				}
			}
		}
		expect(cas).toBeGreaterThan(100); // l'échantillon a bien tourné
	});
});

describe('syntheseRevision : lecture des comptes', () => {
	it('les dues se lisent comme une PARTIE de la rotation, pas comme un compte à part', () => {
		// `dues ⊆ enRotation` : juxtaposer les deux comme des comptes indépendants ferait
		// lire 9 entrées concernées là où il y en a 6. L'attachement se vérifie sans nommer
		// la tournure : le sous-compte est annoncé immédiatement après son total.
		const phrase = syntheseRevision(recap({ enRotation: 6, dues: 3, acquises: 5, enAttente: 4 }));
		const nombres = nombresAnnonces(phrase);
		expect(nombres.indexOf(3)).toBe(nombres.indexOf(6) + 1);
	});

	it('accord du nom compté : singulier à 1, pluriel au-delà (entrées en rotation)', () => {
		// Formulée sans nommer le nom employé : si le nombre seul changeait, la phrase à 2
		// serait celle à 1 avec le chiffre remplacé — et elle est plus longue d'exactement
		// la marque du pluriel.
		const un = syntheseRevision(recap({ enRotation: 1 }));
		const deux = syntheseRevision(recap({ enRotation: 2 }));
		expect(deux).not.toBe(un.replace('1', '2'));
		expect(deux.length).toBe(un.length + 1);
	});

	it('accord du nom compté : singulier à 1, pluriel au-delà (entrées acquises)', () => {
		const un = syntheseRevision(recap({ acquises: 1 }));
		const deux = syntheseRevision(recap({ acquises: 2 }));
		expect(deux).not.toBe(un.replace('1', '2'));
		expect(deux.length).toBe(un.length + 1);
	});

	it('un seul élément de chaque sorte : la phrase reste au singulier partout', () => {
		const phrase = syntheseRevision(recap({ enRotation: 1, dues: 1, acquises: 1, enAttente: 1 }));
		// Aucun mot ne porte la marque du pluriel quand aucun compte ne dépasse 1.
		const pluriels = phrase.split(/[^0-9A-Za-zÀ-ÿ]+/).filter((m) => /[a-zà-ÿ]s$/.test(m));
		expect(pluriels, phrase).toEqual([]);
		expect(nombresAnnonces(phrase)).toEqual([1, 1, 1, 1]);
		verifierPhraseBienFormee(phrase);
	});
});

describe('resumeGroupe : une catégorie non vide ne se résume jamais par du vide (#690)', () => {
	it('catégorie entièrement en attente : un résumé qui annonce ses entrées', () => {
		// La moitié symétrique du défaut : plus aucun segment à pousser, donc un <summary>
		// MUET sous le titre d'une catégorie qui contient pourtant sept entrées. C'est le
		// seul endroit du récap où l'omission d'un segment peut tout emporter — il n'y a pas
		// de garde-fou en amont, la vue par catégorie appelle sur chaque groupe.
		const resume = resumeGroupe(groupe({ enAttente: 7 }));
		expect(resume.trim()).not.toBe('');
		expect(nombresAnnonces(resume)).toEqual([7]);
		verifierResumeBienForme(resume);
	});

	it('aucun compte nul : rotation vide, seuls les acquis et l’attente sont dits', () => {
		const resume = resumeGroupe(groupe({ enAttente: 3, acquises: 2 }));
		expect(nombresAnnonces(resume).sort(croissant)).toEqual([2, 3]);
		verifierResumeBienForme(resume);
	});

	it('rotation sans aucune échéance atteinte : pas de sous-compte « 0 à réviser »', () => {
		const resume = resumeGroupe(groupe({ enRotation: 5, dues: 0 }));
		expect(nombresAnnonces(resume)).toEqual([5]);
		verifierResumeBienForme(resume);
	});

	it('les dues se lisent comme une PARTIE de la rotation, pas comme un compte à part', () => {
		const resume = resumeGroupe(groupe({ enRotation: 9, dues: 2, acquises: 4, enAttente: 6 }));
		const nombres = nombresAnnonces(resume);
		expect(nombres.indexOf(2)).toBe(nombres.indexOf(9) + 1);
	});

	it('accord du nom compté : singulier à 1, pluriel au-delà (entrées acquises)', () => {
		const un = resumeGroupe(groupe({ acquises: 1 }));
		const deux = resumeGroupe(groupe({ acquises: 2 }));
		expect(deux).not.toBe(un.replace('1', '2'));
		expect(deux.length).toBe(un.length + 1);
	});

	it('groupe sans aucune entrée : aucun compte inventé (cas que revisionProfil ne produit pas)', () => {
		// `revisionProfil` ne bâtit un groupe que pour une catégorie qui a au moins une
		// entrée, donc le cas n'arrive pas — mais rien ne l'écarte côté appelant, à la
		// différence de `syntheseRevision`. On tient l'invariant sans figer la sortie
		// actuelle : exiger la chaîne vide à la lettre interdirait de la remplacer un jour
		// par un libellé, ce qui serait pourtant le bon réflexe si le cas devenait joignable.
		expect(nombresAnnonces(resumeGroupe(groupe({})))).toEqual([]);
	});

	it('ÉCHANTILLON : tout groupe non vide annonce chacun de ses comptes non nuls, une fois et un seul', () => {
		let cas = 0;
		for (const enRotation of [0, 1, 2, 7]) {
			for (const enAttente of [0, 1, 3, 100]) {
				for (const acquises of [0, 1, 5]) {
					for (const dues of new Set([0, Math.min(1, enRotation), enRotation])) {
						if (enRotation + enAttente + acquises === 0) continue; // groupe inexistant
						const resume = resumeGroupe(groupe({ enRotation, enAttente, acquises, dues }));
						const attendus = [enRotation, dues, acquises, enAttente]
							.filter((n) => n > 0)
							.sort(croissant);
						expect(resume.trim(), JSON.stringify({ enRotation, enAttente, acquises })).not.toBe('');
						expect(nombresAnnonces(resume).sort(croissant), resume).toEqual(attendus);
						verifierResumeBienForme(resume);
						cas++;
					}
				}
			}
		}
		expect(cas).toBeGreaterThan(100);
	});

	it('INVARIANT : la phrase de synthèse et le résumé de catégorie ne divergent pas', () => {
		// C'est cette divergence qui a caché le défaut : `resumeGroupe` omettait déjà ses
		// segments nuls quand la phrase de synthèse affichait encore le sien. Les deux
		// dénombrent la même chose, elles doivent annoncer les mêmes comptes.
		const melanges = [
			{ enAttente: 100 },
			{ enRotation: 4, dues: 2 },
			{ acquises: 12 },
			{ enRotation: 1, dues: 1, acquises: 1, enAttente: 1 },
			{ enRotation: 7, dues: 7, acquises: 5, enAttente: 3 },
			{ enAttente: 3, acquises: 5 },
		];
		for (const m of melanges) {
			const parPhrase = nombresAnnonces(syntheseRevision(recap(m))).sort(croissant);
			const parGroupe = nombresAnnonces(resumeGroupe(groupe(m))).sort(croissant);
			expect(parGroupe, JSON.stringify(m)).toEqual(parPhrase);
		}
	});
});

/* ---------- resumeEtage : un TOUT, puis ses sous-comptes inclus ----------
   Forme d'invariant différente des deux blocs précédents : le total est TOUJOURS annoncé,
   fût-ce sans sous-compte, parce qu'il n'est pas une part mais l'ensemble. Ce qui reste
   commun : un sous-compte nul ne se prononce pas. D'où la formulation retenue —
   « le premier nombre lu est le total des entrées présentes, et les suivants sont
   exactement les sous-comptes non nuls ».
   Pas de cas « étage vide » ici, contrairement aux deux autres fonctions : `revisionProfil`
   omet les étages sans entrée (tenu par tests/encadrant-revision.test.ts), et le seul test
   qu'on pourrait écrire sur ce cas inatteignable consisterait à figer ce que la fonction
   rend aujourd'hui — c'est-à-dire un compte nul. Le décrire serait le garder. */
describe('resumeEtage : le total est annoncé, ses sous-comptes seulement s’ils existent (#690)', () => {
	it('étage sans dues ni attente : le total seul, aucun sous-compte inventé', () => {
		const resume = resumeEtage(etage({ total: 4 }));
		expect(nombresAnnonces(resume)).toEqual([4]);
		verifierResumeBienForme(resume);
	});

	it('étage entièrement en attente : l’attente est dite, l’étage ne se lit pas comme démarré', () => {
		// Le cas motivant : trois entrées à l'étage 0 sous un en-tête « Palier : 1 jour »,
		// alors qu'aucune n'a commencé. Le total reste juste, mais il doit être qualifié.
		const resume = resumeEtage(etage({ total: 3, enAttente: 3 }));
		expect(nombresAnnonces(resume)).toEqual([3, 3]);
		verifierResumeBienForme(resume);
	});

	it('étage aux deux sous-comptes : total d’abord, puis les deux parts', () => {
		const resume = resumeEtage(etage({ total: 5, dues: 2, enAttente: 1 }));
		const nombres = nombresAnnonces(resume);
		expect(nombres[0]).toBe(5); // le tout, avant ses parties
		expect(nombres.slice(1).sort(croissant)).toEqual([1, 2]);
		verifierResumeBienForme(resume);
	});

	it('un seul sous-compte non nul : l’autre reste muet', () => {
		expect(nombresAnnonces(resumeEtage(etage({ total: 6, dues: 2 })))).toEqual([6, 2]);
		expect(nombresAnnonces(resumeEtage(etage({ total: 6, enAttente: 4 })))).toEqual([6, 4]);
	});

	it('dues + attente = total : les deux parts épuisent l’étage sans le contredire', () => {
		const resume = resumeEtage(etage({ total: 4, dues: 1, enAttente: 3 }));
		const nombres = nombresAnnonces(resume);
		expect(nombres[0]).toBe(4);
		expect(nombres.slice(1).sort(croissant)).toEqual([1, 3]);
		verifierResumeBienForme(resume);
	});

	it('accord du nom compté : singulier à 1, pluriel au-delà', () => {
		const un = resumeEtage(etage({ total: 1 }));
		const deux = resumeEtage(etage({ total: 2 }));
		expect(deux).not.toBe(un.replace('1', '2'));
		expect(deux.length).toBe(un.length + 1);
	});

	it('étage d’une seule entrée, elle-même en attente : tout reste au singulier', () => {
		const resume = resumeEtage(etage({ total: 1, enAttente: 1 }));
		const pluriels = resume.split(/[^0-9A-Za-zÀ-ÿ]+/).filter((m) => /[a-zà-ÿ]s$/.test(m));
		expect(pluriels, resume).toEqual([]);
		expect(nombresAnnonces(resume)).toEqual([1, 1]);
		verifierResumeBienForme(resume);
	});

	it('ÉCHANTILLON : le total est toujours celui des entrées présentes, les sous-comptes nuls jamais dits', () => {
		let cas = 0;
		for (const total of [1, 2, 5, 12, 100]) {
			for (const dues of [0, 1, 2, total]) {
				for (const enAttente of [0, 1, 3, total]) {
					if (dues > total || enAttente > total || dues + enAttente > total) continue;
					const p = etage({ total, dues, enAttente });
					const resume = resumeEtage(p);
					const nombres = nombresAnnonces(resume);
					// Le tout d'abord, et c'est bien le nombre d'entrées rangées à cet étage.
					expect(nombres[0], resume).toBe(p.entrees.length);
					// Puis exactement les sous-comptes non nuls, une fois chacun.
					expect(nombres.slice(1).sort(croissant), resume).toEqual(
						[dues, enAttente].filter((n) => n > 0).sort(croissant),
					);
					verifierResumeBienForme(resume);
					cas++;
				}
			}
		}
		expect(cas).toBeGreaterThan(30);
	});
});
