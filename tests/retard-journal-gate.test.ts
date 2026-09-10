import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/* ============================================================
   Gate STATIQUE du journal de retard (#691) — critères 6, 7 (moitié statique) et 9.
   ------------------------------------------------------------
   Critère 9 : « la journalisation ne doit pas dépendre du chemin de correction ; si
   un nouveau mode de révision apparaît, l'absence de journalisation doit être VISIBLE
   plutôt que silencieuse ». Un mode de révision qui oublierait de journaliser ne
   casserait rien : les exercices marchent, l'escalier avance, la CI reste verte. Seule
   la mesure — la seule chose qui rend l'hypothèse « le retard fait échouer » vérifiable
   — deviendrait partielle, et d'une façon qu'on ne remarquerait qu'en lisant des taux
   déjà faussés.

   ── Pourquoi ce gate peut être plus fort que celui du journal d'erreurs (#580) ──
   Le gate #580 reconnaît sa limite : il repose sur une convention de nommage
   (`lecon-*.ts`) plus une liste tenue à la main, faute d'un point de passage unique de
   la correction. Ici, ce point existe et il est STRUCTUREL, pas conventionnel : le
   retard n'est lisible que tant que l'état de révision n'a pas été réécrit, et cette
   réécriture passe par `avancerEtat` (src/core/revision.ts) — deux appelants dans tout
   le dépôt, `avancerMotRevision` (un mot) et `avancerLessonRevision` (une leçon), eux
   mêmes appelés depuis un seul endroit de l'interface, `recordGrade` (src/ui/revision.ts).

   On ne surveille donc pas « les fichiers qui ressemblent à un chemin de correction »,
   mais LA fonction qui détruit l'information. Un nouveau mode de révision ne peut pas
   faire avancer la répétition espacée sans passer par là : soit il appelle un avanceur
   existant depuis un nouveau fichier (test 1), soit il ajoute un chemin de correction
   dans l'interface (test 2), soit il avance sans journaliser (test 3). Les trois sont
   rouges.

   ── Ce que le gate NE fixe PAS ──
   L'endroit où vit l'appel de journalisation : dans `recordGrade` juste avant
   d'avancer, ou à l'intérieur des deux avanceurs de `core`. Les deux dispositions
   satisfont l'exigence, et le test 3 accepte les deux — il vérifie la PROPRIÉTÉ
   (aucun avancement sans journalisation préalable dans la même fonction, ou dans
   l'avanceur appelé), pas un emplacement.

   Ce qu'il ne prouve pas non plus : que l'entrée journalisée soit JUSTE (bon palier,
   bon retard). C'est l'objet de `tests/retard-journal.test.ts`, et de la vérification
   e2e du chemin réel.
   ============================================================ */

/* ---------- Lecture et dépouillement du source ---------- */

function fichiersTs(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const chemin = dir + '/' + e.name;
		if (e.isDirectory()) out.push(...fichiersTs(chemin));
		else if (e.name.endsWith('.ts')) out.push(chemin);
	}
	return out;
}

const FICHIERS = fichiersTs('src').sort();

/* Remplace commentaires et contenus de chaînes par des espaces, EN CONSERVANT les
   longueurs (donc les positions). Sans ça, une mention de `avancerEtat` dans un
   commentaire d'explication compterait comme un appel — il y en a déjà une dans
   src/core/revision.ts — et une accolade dans une chaîne casserait l'appariement. */
function depouiller(src: string): string {
	const out = src.split('');
	let i = 0;
	const blanchir = (a: number, b: number) => {
		for (let k = a; k < b && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
	};
	while (i < src.length) {
		const c = src[i];
		const d = src[i + 1];
		if (c === '/' && d === '/') {
			const fin = src.indexOf('\n', i);
			blanchir(i, fin === -1 ? src.length : fin);
			i = fin === -1 ? src.length : fin;
		} else if (c === '/' && d === '*') {
			const fin = src.indexOf('*/', i + 2);
			blanchir(i, fin === -1 ? src.length : fin + 2);
			i = fin === -1 ? src.length : fin + 2;
		} else if (c === '"' || c === "'" || c === '`') {
			let j = i + 1;
			while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
			blanchir(i + 1, j);
			i = j + 1;
		} else i++;
	}
	return out.join('');
}

const SOURCE = new Map<string, string>();
function nu(fichier: string): string {
	let v = SOURCE.get(fichier);
	if (v === undefined) {
		v = depouiller(readFileSync(fichier, 'utf8'));
		SOURCE.set(fichier, v);
	}
	return v;
}

/* Corps des fonctions DÉCLARÉES (`function nom(…) { … }`), par appariement d'accolades
   sur le source dépouillé. Renvoie le nom, et les bornes du corps. */
interface Fonction {
	nom: string;
	debut: number;
	fin: number;
}
function fonctions(fichier: string): Fonction[] {
	const txt = nu(fichier);
	const out: Fonction[] = [];
	const re = /\bfunction\s+([A-Za-z0-9_$]+)\s*(?:<[^>]*>)?\s*\(/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(txt))) {
		const ouvrante = txt.indexOf('{', m.index);
		if (ouvrante === -1) continue;
		let n = 0;
		let k = ouvrante;
		for (; k < txt.length; k++) {
			if (txt[k] === '{') n++;
			else if (txt[k] === '}' && --n === 0) break;
		}
		out.push({ nom: m[1], debut: ouvrante, fin: k });
	}
	return out;
}

/* Positions des APPELS à `nom` (la déclaration `function nom(` est exclue). */
function appels(fichier: string, nom: string): number[] {
	const txt = nu(fichier);
	const re = new RegExp('(?<!function\\s)\\b' + nom + '\\s*\\(', 'g');
	const out: number[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(txt))) out.push(m.index);
	return out;
}

/* ---------- Le terrain surveillé ---------- */

/** La fonction qui DÉTRUIT le retard : elle réécrit `prochaineRevision`. */
const RACINE = 'avancerEtat';
/** Ses deux enveloppes, avec le fichier qui les définit. */
const AVANCEURS: Record<string, string> = {
	avancerMotRevision: 'src/core/orthographe/store.ts',
	avancerLessonRevision: 'src/core/progress.ts',
};
const TOUS_AVANCEURS = [RACINE, ...Object.keys(AVANCEURS)];

/** L'écriture du journal : `journaliserRetard` (contrat #691, src/core/retard-journal.ts). */
const RE_JOURNALISE = /\bjournaliserRetard\s*\(/;

/** Fichiers autorisés à faire avancer l'escalier, et à quel titre. Une entrée de plus
 *  ici est une décision relue : elle doit s'accompagner de la journalisation (test 3). */
const AVANCENT: Record<string, string> = {
	'src/core/orthographe/store.ts': 'avancerMotRevision — avance l’escalier d’un MOT d’orthographe.',
	'src/core/progress.ts': 'avancerLessonRevision — avance l’escalier d’une LEÇON.',
	'src/ui/revision.ts': 'recordGrade — le point de correction unique du mode Révision.',
};

/** Fichiers qui appellent un avanceur (hors définition de l'avanceur lui-même). */
function fichiersQuiAvancent(): string[] {
	return FICHIERS.filter((f) => TOUS_AVANCEURS.some((a) => appels(f, a).length > 0));
}

describe('critère 9 — aucun avancement de l’escalier sans journalisation du retard', () => {
	it('test 1 : la liste des fichiers qui font avancer l’escalier est CLOSE', () => {
		// Un nouveau mode de révision doit forcément avancer la répétition espacée.
		// S'il le fait depuis un nouveau fichier, il apparaît ici — et le mainteneur
		// doit l'ajouter à AVANCENT, ce qui l'oblige à passer par le test 3.
		expect(fichiersQuiAvancent()).toEqual(Object.keys(AVANCENT).sort());
	});

	it('test 2 : côté interface, la correction en révision reste un point UNIQUE', () => {
		const enUi = fichiersQuiAvancent().filter((f) => f.startsWith('src/ui/'));
		expect(enUi).toEqual(['src/ui/revision.ts']);

		// … et dans ce fichier, tous les avancements tiennent dans UNE seule fonction.
		const fs = fonctions('src/ui/revision.ts');
		const porteuses = new Set<string>();
		for (const a of TOUS_AVANCEURS) {
			for (const pos of appels('src/ui/revision.ts', a)) {
				const f = fs.find((x) => pos > x.debut && pos < x.fin);
				porteuses.add(f ? f.nom : 'hors fonction déclarée (' + pos + ')');
			}
		}
		expect([...porteuses]).toEqual(['recordGrade']);
	});

	it('test 3 : toute fonction qui avance journalise le retard AVANT de l’écraser', () => {
		/* Conforme = la fonction journalise elle-même avant son premier appel d'avanceur,
		   OU tous les avanceurs qu'elle appelle sont conformes (journalisation déportée
		   dans core). Les deux dispositions sont acceptées ; l'ordre, lui, ne l'est pas :
		   après `avancerEtat`, `prochaineRevision` a été réécrite et le retard n'existe
		   plus — une journalisation postérieure mesurerait le PROCHAIN rendez-vous. */
		const vu = new Map<string, boolean>();
		const conforme = (fichier: string, nomFonction: string): boolean => {
			const cle = fichier + '#' + nomFonction;
			const memo = vu.get(cle);
			if (memo !== undefined) return memo;
			vu.set(cle, false); // coupe une éventuelle récursion
			const f = fonctions(fichier).find((x) => x.nom === nomFonction);
			if (!f) return false;
			const txt = nu(fichier).slice(f.debut, f.fin);
			const posAvance = Math.min(
				...TOUS_AVANCEURS.map((a) => {
					const p = appels(fichier, a).find((i) => i > f.debut && i < f.fin);
					return p === undefined ? Number.POSITIVE_INFINITY : p - f.debut;
				}),
			);
			const posJournal = txt.search(RE_JOURNALISE);
			let ok = posJournal !== -1 && posJournal < posAvance;
			if (!ok) {
				const appeles = Object.keys(AVANCEURS).filter(
					(a) => appels(fichier, a).find((i) => i > f.debut && i < f.fin) !== undefined,
				);
				ok = appeles.length > 0 && appeles.every((a) => conforme(AVANCEURS[a], a));
			}
			vu.set(cle, ok);
			return ok;
		};

		const fautifs: string[] = [];
		for (const fichier of fichiersQuiAvancent()) {
			const fs = fonctions(fichier);
			for (const a of TOUS_AVANCEURS) {
				for (const pos of appels(fichier, a)) {
					const f = fs.find((x) => pos > x.debut && pos < x.fin);
					if (!f) {
						fautifs.push(fichier + ' : appel à ' + a + ' hors d’une fonction déclarée');
					} else if (!conforme(fichier, f.nom)) {
						fautifs.push(fichier + ' → ' + f.nom + '() avance sans journaliser le retard avant');
					}
				}
			}
		}
		expect([...new Set(fautifs)]).toEqual([]);
	});
});

/* ---------- Critères 6 et 7 : qui a le droit de LIRE le journal ---------- */

/** Le module du journal (contrat #691). */
const MODULE = 'src/core/retard-journal.ts';

/** Symboles de LECTURE : consulter le journal, le classer, l'afficher. Réservés à
 *  l'espace encadrant — un écran enfant qui ne peut pas les atteindre ne peut rien
 *  en montrer (critère 6). */
const LECTEURS = ['chargerRetardsFor', 'tauxParTranche', 'TRANCHES_RETARD'];

/** Espace encadrant : les seules surfaces autorisées à lire. */
const estEncadrant = (f: string) =>
	f.startsWith('src/ui/encadrant') || f === 'src/core/encadrant-stats.ts';

/** Fichiers autorisés à seulement ÉCRIRE (chaîne de correction, cf. AVANCENT). */
const estEcrivain = (f: string) => Object.prototype.hasOwnProperty.call(AVANCENT, f);

describe('critères 6 et 7 — le journal se remplit côté enfant, se lit côté encadrant', () => {
	it('le module du journal existe et reste sans DOM (critère 5)', () => {
		const src = FICHIERS.includes(MODULE) ? nu(MODULE) : null;
		expect(src, MODULE + ' est attendu : le journal de retard vit dans core/').not.toBeNull();
		// Un calcul de taux qui toucherait au DOM ne serait plus testable sans lui, et
		// l'espace encadrant ne pourrait plus le réutiliser hors rendu.
		expect(src?.includes('document.')).toBe(false);
		expect(src?.includes('window.')).toBe(false);
		expect(src?.includes("from '../ui/")).toBe(false);
	});

	it('aucune vue ENFANT n’atteint les symboles de lecture (critère 6)', () => {
		// Le mode Révision (src/ui/revision.ts) ÉCRIT le journal : c'est un écran enfant,
		// il ne doit donc jamais pouvoir le relire — pas de « tu es en retard de 4 fois
		// l'intervalle », pas de compteur, rien. La séparation écriture / lecture est ce
		// qui rend le critère 6 mécanique plutôt que déclaratif.
		const fautifs = FICHIERS.filter(
			(f) => f !== MODULE && !estEncadrant(f) && LECTEURS.some((s) => nu(f).includes(s)),
		);
		expect(fautifs).toEqual([]);
	});

	it('personne d’autre que la chaîne d’écriture et l’encadrant n’importe le journal (critère 7)', () => {
		// Un calcul d'XP, de trophée, d'objectif ou de sélection qui voudrait tenir compte
		// du retard mesuré devrait d'abord importer ce module : il apparaîtrait ici.
		// Angle mort assumé : si l'écriture est posée dans progress.ts (le module de l'XP),
		// ce filet ne peut plus rien y interdire — c'est le test comportemental de
		// tests/retard-journal.test.ts (« journal vide ou saturé, même résultat ») qui prend
		// le relais.
		const importateurs = FICHIERS.filter((f) => f !== MODULE && nu(f).includes('retard-journal'));
		const intrus = importateurs.filter((f) => !estEcrivain(f) && !estEncadrant(f));
		expect(intrus).toEqual([]);
	});

	it('l’espace encadrant expose bien le taux par tranche (critère 4)', () => {
		// Sans surface de lecture, le journal grossirait sans jamais répondre à la question
		// qui justifie son existence. On exige le couple : lire le profil AFFICHÉ (par UUID,
		// jamais le profil actif) et le passer au calcul par tranche.
		const encadrants = FICHIERS.filter(estEncadrant);
		expect(encadrants.some((f) => nu(f).includes('tauxParTranche'))).toBe(true);
		expect(encadrants.some((f) => nu(f).includes('chargerRetardsFor'))).toBe(true);
	});

	it('l’entrée journalisée ne se met pas à porter du TEXTE (critère 8)', () => {
		// « Aucune donnée nominative ou textuelle supplémentaire » : le jour où quelqu'un
		// ajoute `question` ou `mot` « pour rendre le tableau plus parlant », le journal
		// devient un second journal d'erreurs, avec la charge de données que #391 porte
		// déjà — et il n'y a plus de raison de s'arrêter là.
		// On ne FIGE pas la liste (un futur drapeau booléen, par exemple « passé sans
		// essayer » #467, resterait légitime : ce n'est ni nominatif ni textuel) : on
		// interdit le TEXTE. Seuls `kind` et `id` — deux identifiants — ont le droit d'être
		// des chaînes.
		const src = FICHIERS.includes(MODULE) ? nu(MODULE) : '';
		const debut = src.indexOf('interface RetardEntry');
		expect(debut, 'interface RetardEntry attendue dans ' + MODULE).toBeGreaterThanOrEqual(0);
		const bloc = src.slice(src.indexOf('{', debut) + 1, src.indexOf('}', debut));
		const lignes = bloc
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l.includes(':'));
		const champs = lignes.map((l) => l.split(':')[0].trim().replace('?', ''));

		// Les trois informations exigées par le critère 1, plus de quoi les situer.
		for (const requis of ['ts', 'kind', 'id', 'palier', 'retardRelatif', 'reussi']) {
			expect(champs, 'champ ' + requis + ' attendu dans RetardEntry').toContain(requis);
		}
		// Aucun champ de type chaîne hors des deux identifiants.
		const chaines = lignes
			.filter((l) => l.split(':').slice(1).join(':').includes('string'))
			.map((l) => l.split(':')[0].trim().replace('?', ''));
		expect(chaines.filter((c) => c !== 'kind' && c !== 'id')).toEqual([]);
		// Et pas de nom qui trahirait un énoncé recopié, même typé autrement.
		const INTERDITS = ['question', 'enonce', 'mot', 'reponse', 'donnee', 'attendue', 'texte'];
		expect(champs.filter((c) => INTERDITS.includes(c.toLowerCase()))).toEqual([]);
	});
});
