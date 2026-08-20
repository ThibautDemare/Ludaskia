import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

/* ============================================================
   Linter heuristique de la VOIX des libellés (#586, convention #278).

   `docs/architecture/conventions-redaction.md` fixe qui parle : l'application tutoie
   l'enfant, l'espace encadrant vouvoie l'adulte, et « le vouvoiement ne déborde jamais
   hors de cet espace ». Ce basculement tu → vous est, avec le retrait du vert de marque,
   le principal signal de rupture « on a quitté l'espace de l'enfant » : un « votre »
   égaré dans un écran enfant, ou un « tu » dans l'espace encadrant, abîme ce signal sans
   rien casser.

   ── Ce gate est ASSUMÉ imparfait, et c'est la raison de sa forme ───────────────
   Une heuristique lexicale sur du texte libre produit forcément plus de faux positifs
   qu'un gate structurel. Trois précautions pour qu'il reste crédible :

   1. Il ne vise que les PRONOMS ET POSSESSIFS, jamais la conjugaison. L'impératif
      d'un écran enfant (« Choisis », « Clique ») est lexicalement indistinguable
      d'autre chose ; chercher à l'attraper voudrait dire réécrire un correcteur
      grammatical, pour un gain marginal. Le défaut qui a motivé #278 — un titre posé
      par l'interface mais rédigé à la première personne — relève du jugement et n'est
      PAS attrapé ici. Ne pas étendre ce gate pour essayer.
   2. `src/data/` est HORS PÉRIMÈTRE, mesure à l'appui : 47 occurrences de
      « vous/votre/vos » y vivent, toutes légitimes — leçons de conjugaison
      (« vous aimez »), pronoms sujets, phrases de grammaire (« Votre chien aboie »).
      Ce sont des CONTENUS d'exercice, pas la voix de l'interface. Les inclure
      demanderait 47 exceptions, et un gate à 47 exceptions ne garde plus rien.
   3. Les exceptions sont ancrées sur un LITTÉRAL et sur un COMPTE, pas sur un fichier.
      Excuser un fichier entier laisserait passer la faute suivante au même endroit ;
      excuser un littéral sans compter laisserait absorber une occurrence de plus glissée
      dans le même bloc. Le compte oblige à relire.

   Un cas est écarté par une RÈGLE plutôt que par une exception, parce que c'est vrai en
   général : un littéral qui vaut EXACTEMENT un pronom ou un possessif est un jeton
   grammatical, pas une phrase — sans sujet ni verbe, il n'y a personne à qui parler.
   C'est ce qui dispense d'une exception pour la liste des six personnes de la
   conjugaison (`['je', 'tu', 'il', 'nous', 'vous', 'ils']`, `core/etayage-conjugaison.ts`).

   État mesuré (20/08/2026) : quatre occurrences dans tout le périmètre, réparties sur
   deux littéraux, toutes légitimes et listées ci-dessous. Le gate ne corrige donc rien,
   il empêche la dérive.
   ============================================================ */

/** Pronoms et possessifs de tutoiement. L'élision `t'` est traitée à part : suivie
 *  d'une voyelle, elle ne peut pas se terminer sur une frontière de mot. */
const TUTOIEMENT =
	/(?<![\p{L}'])(tu|toi|ton|ta|tes|te)(?![\p{L}'])|(?<![\p{L}])t'(?=[aàeéèêiouyh])/giu;
const VOUVOIEMENT = /(?<![\p{L}'])(vous|votre|vos)(?![\p{L}'])/giu;

/** Un fichier de l'espace encadrant : c'est LÀ que le vouvoiement est chez lui. Le
 *  découpage (#354) a réparti l'espace sur une quinzaine de modules `encadrant-*`, dans
 *  `src/ui` comme dans `src/core` — d'où un motif, et non une liste à tenir. */
const EST_ENCADRANT = (chemin: string) => /\/encadrant[\w-]*\.ts$/.test(chemin);

type Exception = {
	fichier: string;
	/** Fragment identifiant le LITTÉRAL excusé (une fenêtre entière tient souvent dans
	 *  un seul gabarit). Ancre l'exception sur ce littéral, pas sur le fichier. */
	extrait: string;
	/** Nombre d'occurrences attendues dans ce littéral. C'est ce qui empêche une
	 *  exception d'ouvrir la porte : en ajouter une de plus au même endroit fait
	 *  échouer le compte, donc il faut la relire et l'assumer. */
	occurrences: number;
	raison: string;
};

const EXCEPTIONS: Exception[] = [
	{
		fichier: 'src/ui/encadrant-reglages.ts',
		extrait: 'ce que tu connais déjà',
		occurrences: 1,
		raison:
			"l'espace encadrant CITE ici le libellé que voit l'enfant, entre guillemets — expliquer un réglage adulte en nommant ce que l'enfant lit n'est pas le tutoyer.",
	},
	{
		fichier: 'src/ui/tour.ts',
		extrait: 'mot pour les parents',
		occurrences: 3,
		raison:
			"« Un mot pour les parents » (#330) est la SECONDE surface adulte de l'application, hors espace encadrant : une fenêtre affichée au premier lancement, adressée au parent qui installe. Le vouvoiement y est donc voulu. Nuance à garder en tête en relisant la convention, qui ne mentionne que l'espace encadrant.",
	},
];

/* ---------- Extraction des littéraux ---------- */

function tousTs(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = `${dir}/${e.name}`;
		if (e.isDirectory()) out.push(...tousTs(p));
		else if (p.endsWith('.ts')) out.push(p);
	}
	return out;
}

/** Retire les commentaires en GARDANT les chaînes et les sauts de ligne (les numéros de
 *  ligne rapportés doivent être ceux du fichier). Les commentaires du dépôt discutent
 *  abondamment la convention (« l'app tutoie l'enfant… ») : les lire comme des libellés
 *  produirait des dizaines de faux positifs sur les fichiers les mieux documentés, ce
 *  qui punirait exactement le bon réflexe. */
function sansCommentaires(src: string): string {
	let out = '';
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		const suivant = src[i + 1];
		if (c === '/' && suivant === '/') {
			while (i < src.length && src[i] !== '\n') i++;
			continue;
		}
		if (c === '/' && suivant === '*') {
			i += 2;
			while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
				if (src[i] === '\n') out += '\n';
				i++;
			}
			i += 2;
			continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			const guillemet = c;
			out += c;
			i++;
			while (i < src.length && src[i] !== guillemet) {
				if (src[i] === '\\') {
					out += src[i] + (src[i + 1] ?? '');
					i += 2;
					continue;
				}
				out += src[i];
				i++;
			}
			out += guillemet;
			i++;
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

type Litteral = { fichier: string; ligne: number; texte: string };

/** Un littéral qui vaut EXACTEMENT un pronom ou un possessif est un jeton
 *  grammatical, pas une phrase adressée à quelqu'un : la liste des six personnes de la
 *  conjugaison (`['je', 'tu', 'il', 'nous', 'vous', 'ils']`, et l'étayage de conjugaison)
 *  n'a pas de voix. Écarté par une RÈGLE et non par une exception, parce que c'est vrai
 *  en général : sans sujet ni verbe, il n'y a personne à qui parler. */
const JETON_GRAMMATICAL =
	/^(je|j'|tu|il|elle|on|nous|vous|ils|elles|me|te|se|moi|toi|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs)$/iu;

function litteraux(fichier: string): Litteral[] {
	const propre = sansCommentaires(readFileSync(fichier, 'utf8'));
	const motif = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/gs;
	return [...propre.matchAll(motif)]
		.map((m) => ({
			fichier,
			ligne: propre.slice(0, m.index!).split('\n').length,
			texte: m[0].slice(1, -1),
		}))
		.filter((l) => !JETON_GRAMMATICAL.test(l.texte.trim()));
}

const FICHIERS = [...tousTs('src/ui'), ...tousTs('src/core')];
const LITTERAUX = FICHIERS.flatMap(litteraux);

type Faute = { fichier: string; ligne: number; mot: string; contexte: string };

/** Fautes non excusées, ET nombre d'occurrences absorbées par chaque exception (que le
 *  dernier test confronte au compte déclaré). */
function analyser(cibles: Litteral[], motif: RegExp) {
	const fautes: Faute[] = [];
	const absorbees = new Map<string, number>();
	for (const l of cibles) {
		const trouvees = [...l.texte.matchAll(motif)];
		if (!trouvees.length) continue;
		const exception = EXCEPTIONS.find(
			(e) => e.fichier === l.fichier && l.texte.includes(e.extrait),
		);
		if (exception) {
			absorbees.set(exception.extrait, (absorbees.get(exception.extrait) ?? 0) + trouvees.length);
			continue;
		}
		for (const m of trouvees)
			fautes.push({
				fichier: l.fichier,
				ligne: l.ligne,
				mot: m[0],
				contexte: l.texte
					.slice(Math.max(0, m.index! - 90), m.index! + 90)
					.replace(/\s+/g, ' ')
					.trim(),
			});
	}
	return { fautes, absorbees };
}

/** `.test()` sur une regex globale déplace son `lastIndex` : deux appels de suite
 *  sautent des correspondances. On compte donc, on ne teste pas. */
const contient = (texte: string, motif: RegExp) => [...texte.matchAll(motif)].length > 0;

const decrire = (f: Faute[]) =>
	f.map((x) => `  ${x.fichier}:${x.ligne} — « ${x.mot} » dans : …${x.contexte}…`).join('\n');

const ENCADRANT = LITTERAUX.filter((l) => EST_ENCADRANT(l.fichier));
const ENFANT = LITTERAUX.filter((l) => !EST_ENCADRANT(l.fichier));

describe('Voix des libellés : tu à l’enfant, vous à l’adulte (#586)', () => {
	it('les littéraux sont bien extraits (garde contre un gate à vide)', () => {
		// Une heuristique lexicale est facile à rendre muette sans le voir : il suffit que
		// l'extraction cesse de trouver du texte. Les deux gardes suivantes le détectent.
		expect(LITTERAUX.length).toBeGreaterThan(2000);
		expect(ENCADRANT.length).toBeGreaterThan(200);
		// Preuve que l'extraction lit vraiment de la PROSE, et pas seulement des classes
		// CSS : chaque espace doit contenir la voix qu'on y attend.
		expect(
			ENCADRANT.some((l) => contient(l.texte, VOUVOIEMENT)),
			"aucun vouvoiement trouvé dans l'espace encadrant : l'extraction ne lit plus de prose, " +
				'et la règle ci-dessous ne garde donc plus rien.',
		).toBe(true);
		expect(
			ENFANT.some((l) => contient(l.texte, TUTOIEMENT)),
			"aucun tutoiement trouvé hors de l'espace encadrant : même diagnostic.",
		).toBe(true);
	});

	it('l’espace encadrant ne tutoie pas l’adulte', () => {
		const { fautes: f } = analyser(ENCADRANT, TUTOIEMENT);
		expect(
			f.length,
			`L'espace encadrant s'adresse à un ADULTE : il vouvoie (convention #278, ` +
				`docs/architecture/conventions-redaction.md).\n${decrire(f)}\n` +
				`Le tutoiement y abîme le signal « on a quitté l'espace de l'enfant » sans rien casser.\n` +
				`Si c'est une CITATION du libellé que voit l'enfant, ajouter une exception avec son ` +
				`extrait et sa raison — jamais le fichier entier.`,
		).toBe(0);
	});

	it('le vouvoiement ne déborde pas hors de l’espace encadrant', () => {
		const { fautes: f } = analyser(ENFANT, VOUVOIEMENT);
		expect(
			f.length,
			`Ces libellés s'adressent à l'ENFANT : ils tutoient (convention #278).\n${decrire(f)}\n` +
				`« Le vouvoiement ne déborde jamais hors de l'espace encadrant » — c'est ce qui rend ` +
				`la rupture lisible pour l'enfant.\n` +
				`Si ce texte s'adresse vraiment à un adulte hors espace encadrant (cf. « Un mot pour ` +
				`les parents »), ajouter une exception avec son extrait et sa raison.`,
		).toBe(0);
	});

	it.each(EXCEPTIONS)(
		'l’exception de $fichier excuse exactement $occurrences occurrence(s)',
		(e) => {
			// Deux dérives possibles, toutes deux silencieuses. (1) L'extrait disparaît :
			// l'exception n'excuse plus rien et reste à décrire une dette imaginaire.
			// (2) Une occurrence de plus se glisse dans le même littéral : elle serait absorbée
			// sans que personne ne l'ait relue. D'où le COMPTE, et pas seulement la présence.
			expect(
				readFileSync(e.fichier, 'utf8').includes(e.extrait),
				`« ${e.extrait} » n'apparaît plus dans ${e.fichier} : retirer l'exception.\n` +
					`Motif d'origine : ${e.raison}`,
			).toBe(true);
			const cibles = EST_ENCADRANT(e.fichier) ? ENCADRANT : ENFANT;
			const motif = EST_ENCADRANT(e.fichier) ? TUTOIEMENT : VOUVOIEMENT;
			expect(
				analyser(cibles, motif).absorbees.get(e.extrait) ?? 0,
				`Le littéral excusé de ${e.fichier} ne contient plus ${e.occurrences} occurrence(s) : ` +
					`quelqu'un a ajouté ou retiré du texte à cet endroit. Relire, puis mettre le compte à ` +
					`jour — ou retirer l'exception si elle n'a plus lieu d'être.\n` +
					`Motif d'origine : ${e.raison}`,
			).toBe(e.occurrences);
		},
	);
});
