/* ============================================================
   #702 — « Relire mes mots » doit montrer les cibles VERBE (critères 1 et 9).

   Écrits AVANT l'implémentation, depuis l'issue seule : les deux symboles visés
   (`idsCiblesVerbes`, `motsDeLeconAvecVerbes`) n'existent pas encore, et ces tests
   doivent donc être ROUGES.

   Ils sont atteints par l'ESPACE DE NOMS de leur module (`verbesApi.…`, `lessons.…`),
   comme dans `ortho-seance-progressive.test.ts` : ainsi l'échec NOMME la fonction
   manquante au lieu de faire exploser le fichier entier à l'import.

   D'où viennent les attendus (aucun n'est recopié d'une implémentation) :
   - la FORME des ids de cibles (`v:<clé>#<temps>#<personne>`) est une donnée PERSISTÉE
     dans la banque du profil : elle est écrite en littéral ici, parce qu'en changer
     orpheliniserait la progression des enfants (elle est déjà tenue par `verbes.test.ts`) ;
   - l'ORDRE « mots simples d'abord, cibles verbe ensuite » est celui que l'application
     tient déjà sur deux surfaces indépendantes : l'aperçu du catalogue
     (`listOrthoLecons` : `[...motsDeListe, ...verbes.map(apercuVerbe)]`) et l'énumération
     des mots attendus (`motsAttendusLecon` : `[...simples, ...verbes]`) ;
   - l'ordre INTERNE aux verbes (verbe, puis temps, puis pronom) est celui dans lequel les
     cibles sont réellement matérialisées en banque — ce que le test de concordance
     ci-dessous vérifie contre `materialiserVerbes` (LEFFF réel) plutôt que contre un
     calcul jumeau, sans quoi une divergence entre énumération et banque rendrait la
     relecture muette sans qu'aucun test ne bouge ;
   - le COMPTE de cartes attendu est croisé avec le `nbMots` annoncé par le catalogue,
     qui compte déjà les couples pronom × temps (c'est l'écart que dénonce l'issue).

   Le dernier axe (plusieurs TEMPS par verbe) n'est pas éprouvable aujourd'hui :
   `VerbTense` n'a qu'un membre (`'present'`), et le simuler demanderait un cast. Les
   tests portent donc sur l'axe verbe × pronom ; à compléter le jour où un temps s'ajoute.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import { setOnDataWrite } from '../src/core/storage';
import { initProfiles, touchActiveProfile } from '../src/core/profiles';
import * as lessons from '../src/core/orthographe/lessons';
import * as verbesApi from '../src/core/orthographe/verbes';
import { listOrthoLecons, motsDeLecon } from '../src/core/orthographe/lessons';
import { cibleVerbeId, materialiserVerbes } from '../src/core/orthographe/verbes';
import { createListe, emptyOrthoState, loadOrtho, saveOrtho } from '../src/core/orthographe/store';
import { ORTHO_PREDEF } from '../src/data/francais/orthographe';
import type { MotOrtho, OrthoState, VerbeConfig } from '../src/core/orthographe/types';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

function verbe(infinitif: string, pronoms: number[], complement?: string): VerbeConfig {
	return { kind: 'verbe', infinitif, pronoms, temps: ['present'], complement };
}

const ids = (mots: readonly MotOrtho[]): string[] => mots.map((m) => m.id);
const formes = (mots: readonly MotOrtho[]): string[] => mots.map((m) => m.mot);

/* Photographie brute du stockage : ce que « la relecture ne persiste rien » veut dire
   côté données (critère 9). */
function instantaneStockage(): Record<string, string | null> {
	const out: Record<string, string | null> = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k) out[k] = localStorage.getItem(k);
	}
	return out;
}

/* Laisse tourner deux tours de boucle d'événements : une résolution LEFFF lancée en
   arrière-plan (import dynamique d'un shard) aurait le temps de retomber sur la banque. */
async function laisserTournerLAsync(): Promise<void> {
	await new Promise((r) => setTimeout(r, 0));
	await new Promise((r) => setTimeout(r, 0));
}

/* ============================================================
   idsCiblesVerbes — énumérer les cibles d'une liste de verbes, sans LEFFF
   ============================================================ */
describe('idsCiblesVerbes — cibles d’une liste de verbes configurés', () => {
	it('existe et s’appelle sans état ni lexique', () => {
		expect(typeof verbesApi.idsCiblesVerbes).toBe('function');
	});

	it('un verbe, un pronom : l’id sous lequel la cible vit en banque', () => {
		// Forme persistée de l'id : « v: » + clé du verbe + temps + n° de personne.
		expect(verbesApi.idsCiblesVerbes([verbe('manger', [0])])).toEqual(['v:manger#present#0']);
	});

	it('plusieurs verbes × plusieurs pronoms : verbe par verbe, dans l’ordre configuré', () => {
		// C'est cet ordre qui décidera de l'ordre des cartes lues par l'enfant.
		expect(verbesApi.idsCiblesVerbes([verbe('manger', [0, 2]), verbe('aimer', [1, 5])])).toEqual([
			'v:manger#present#0',
			'v:manger#present#2',
			'v:aimer#present#1',
			'v:aimer#present#5',
		]);
	});

	it('respecte l’ordre des pronoms reçu, sans le retrier lui-même', () => {
		// Le tri canonique appartient à `normaliserVerbes`, en amont (même parti pris que
		// `libellePronoms`) : une énumération qui retrierait masquerait un VerbeConfig non
		// normalisé au lieu de le refléter.
		expect(verbesApi.idsCiblesVerbes([verbe('manger', [5, 0])])).toEqual([
			'v:manger#present#5',
			'v:manger#present#0',
		]);
	});

	it('aucun verbe (absent ou tableau vide) : aucune cible', () => {
		expect(verbesApi.idsCiblesVerbes()).toEqual([]);
		expect(verbesApi.idsCiblesVerbes([])).toEqual([]);
	});

	it('casse et espaces de la saisie du parent : la même cible', () => {
		expect(verbesApi.idsCiblesVerbes([verbe('  MANGER ', [0])])).toEqual(['v:manger#present#0']);
	});

	it('accent composé ou décomposé : la même cible (la clé est en NFC)', () => {
		// « é » tapé en une seule lettre ou en « e » + accent combinant : c'est le même
		// verbe pour l'enfant, ce doit être la même carte. Échappements explicites pour que
		// l'attendu ne dépende pas de l'encodage de CE fichier.
		const decompose = verbesApi.idsCiblesVerbes([verbe('e\u0301couter', [2])]);
		expect(decompose).toEqual(verbesApi.idsCiblesVerbes([verbe('\u00e9couter', [2])]));
		expect(decompose).toEqual(['v:\u00e9couter#present#2']);
	});

	it('énumération PURE : ne touche pas au stockage', () => {
		const avant = instantaneStockage();
		expect(Array.isArray(verbesApi.idsCiblesVerbes([verbe('manger', [0, 1, 2, 3, 4, 5])]))).toBe(
			true,
		);
		expect(instantaneStockage()).toEqual(avant);
	});
});

/* ============================================================
   Concordance avec la banque RÉELLE — l'ancre anti-tautologie.
   Une énumération juste « dans l'absolu » mais décalée de ce que `materialiserVerbes`
   écrit vraiment laisserait la relecture vide sans rien casser d'autre.
   ============================================================ */
describe('idsCiblesVerbes vs matérialisation réelle (LEFFF)', () => {
	it('énumère EXACTEMENT les clés que materialiserVerbes écrit en banque, dans le même ordre', async () => {
		const st = emptyOrthoState();
		const config = [verbe('manger', [0, 2], 'une pomme'), verbe('aimer', [1])];
		const cibles = await materialiserVerbes(st, config, 1000);
		expect(ids(cibles)).toEqual(verbesApi.idsCiblesVerbes(config));
		expect(Object.keys(st.banque).sort()).toEqual([...verbesApi.idsCiblesVerbes(config)].sort());
	});

	it('verbe pronominal : l’énumération retrouve la cible réellement matérialisée', async () => {
		// « se laver » est matérialisé sous la clé du verbe nu : une énumération qui
		// garderait le pronominal ne retrouverait jamais la carte en banque.
		const st = emptyOrthoState();
		const config = [verbe('se laver', [0, 2])];
		await materialiserVerbes(st, config, 1000);
		expect(verbesApi.idsCiblesVerbes(config).every((id) => !!st.banque[id])).toBe(true);
	});
});

/* ============================================================
   motsDeLeconAvecVerbes — la relecture d'une leçon, cibles verbe comprises (critère 1)
   ============================================================ */
describe('motsDeLeconAvecVerbes — relecture d’une liste du profil (critère 1)', () => {
	it('existe', () => {
		expect(typeof lessons.motsDeLeconAvecVerbes).toBe('function');
	});

	it('liste lancée : les mots simples, puis une carte par couple pronom × temps', async () => {
		const st = emptyOrthoState();
		const liste = createListe(st, 'Semaine 3', [{ mot: 'chat' }, { mot: 'jardin' }], undefined, [
			verbe('manger', [0, 2], 'une pomme'),
		]);
		await materialiserVerbes(st, liste.verbes ?? [], 1000);

		const mots = lessons.motsDeLeconAvecVerbes(st, liste.id);
		expect(formes(mots)).toEqual(['chat', 'jardin', 'mange', 'mange']);
		expect(ids(mots)).toEqual([...liste.motIds, 'v:manger#present#0', 'v:manger#present#2']);
	});

	it('rend les mots de la BANQUE (progression et contexte de l’enfant, pas des cartes neuves)', async () => {
		// La page de relecture montre l'entourage tracé par l'enfant et la phrase de
		// contexte du verbe : les cartes doivent porter l'état réel du profil.
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [{ mot: 'chat' }], undefined, [
			verbe('manger', [2], 'une pomme'),
		]);
		await materialiserVerbes(st, liste.verbes ?? [], 1000);
		st.banque['v:manger#present#2'].validation.dictee = true;

		const mots = lessons.motsDeLeconAvecVerbes(st, liste.id);
		expect(mots[0]).toEqual(st.banque[liste.motIds[0]]);
		expect(mots[1]).toEqual(st.banque['v:manger#present#2']);
		expect(mots[1].contexte).toEqual({ avant: 'il ', apres: ' une pomme' });
		expect(mots[1].validation.dictee).toBe(true);
	});

	it('autant de cartes que le catalogue annonce de mots pour cette liste', async () => {
		// Le `nbMots` du catalogue compte déjà les couples pronom × temps : c'est
		// exactement l'écart que l'issue dénonce entre l'annonce et la relecture.
		const st = emptyOrthoState();
		const liste = createListe(st, 'Semaine 4', [{ mot: 'chat' }], undefined, [
			verbe('manger', [0, 2]),
			verbe('aimer', [1, 3, 5]),
		]);
		await materialiserVerbes(st, liste.verbes ?? [], 1000);

		const annonce = listOrthoLecons(st).find((l) => l.id === liste.id);
		expect(annonce?.nbMots).toBe(6); // 1 mot simple + 2 couples + 3 couples
		expect(lessons.motsDeLeconAvecVerbes(st, liste.id)).toHaveLength(annonce?.nbMots ?? -1);
	});

	it('cible verbe partiellement matérialisée : les cartes connues, sans trou ni undefined', async () => {
		// Cas réel : le parent ajoute un pronom à un verbe déjà joué, seul « il » est en
		// banque. Contrairement à `motsAttendusLecon` (qui renvoie des trous `undefined`
		// pour compter les mots jamais commencés), une page de cartes ne peut rien
		// afficher d'un mot dont elle ignore la forme.
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [{ mot: 'chat' }], undefined, [verbe('manger', [0, 2])]);
		await materialiserVerbes(st, [verbe('manger', [2])], 1000);

		const mots = lessons.motsDeLeconAvecVerbes(st, liste.id);
		expect(ids(mots)).toEqual([...liste.motIds, 'v:manger#present#2']);
		expect(mots.some((m) => m === undefined || m === null)).toBe(false);
		expect(formes(mots)).toEqual(['chat', 'mange']);
	});

	it('deux cibles homophones (« je mange » / « il mange ») : deux cartes distinctes', async () => {
		// C'est tout l'intérêt de l'id namespacé : la banque déduplique par forme, pas les
		// cibles verbe. Une relecture qui les replierait en une carte ferait disparaître la
		// moitié du travail de l'enfant.
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [], undefined, [verbe('manger', [0, 2], 'une pomme')]);
		await materialiserVerbes(st, liste.verbes ?? [], 1000);

		const mots = lessons.motsDeLeconAvecVerbes(st, liste.id);
		expect(formes(mots)).toEqual(['mange', 'mange']);
		expect(new Set(ids(mots)).size).toBe(2);
		expect(mots.map((m) => m.contexte?.avant)).toEqual(['je ', 'il ']);
	});

	it('aucun doublon si une cible verbe figure AUSSI dans les mots de la liste', async () => {
		// État tordu (un id de cible glissé dans `motIds`) : la carte ne doit pas apparaître
		// deux fois, l'enfant relirait deux fois le même mot.
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [{ mot: 'chat' }], undefined, [verbe('manger', [0])]);
		await materialiserVerbes(st, liste.verbes ?? [], 1000);
		liste.motIds.push(cibleVerbeId('manger', 'present', 0));

		const obtenus = ids(lessons.motsDeLeconAvecVerbes(st, liste.id));
		expect(obtenus.filter((id) => id === 'v:manger#present#0')).toHaveLength(1);
		expect(new Set(obtenus).size).toBe(obtenus.length);
	});

	it('saisie du parent recasée après coup : la carte reste retrouvée en banque', async () => {
		// La banque a été matérialisée depuis « manger », la liste porte « MANGER » (saisie
		// retouchée depuis par le parent) : c'est la même cible.
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [], undefined, [verbe('  MANGER ', [0])]);
		await materialiserVerbes(st, [verbe('manger', [0])], 1000);
		expect(formes(lessons.motsDeLeconAvecVerbes(st, liste.id))).toEqual(['mange']);
	});

	it('liste SANS verbe : strictement ce que rend motsDeLecon', () => {
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [{ mot: 'chat' }, { mot: 'jardin' }]);
		expect(lessons.motsDeLeconAvecVerbes(st, liste.id)).toEqual(motsDeLecon(st, liste.id));
	});

	it('référence de mot orpheline : ignorée comme ailleurs, sans casser la relecture', async () => {
		const st = emptyOrthoState();
		const liste = createListe(st, 'L', [{ mot: 'chat' }], undefined, [verbe('manger', [0])]);
		await materialiserVerbes(st, liste.verbes ?? [], 1000);
		liste.motIds.unshift('mot-supprime-de-la-banque');
		expect(formes(lessons.motsDeLeconAvecVerbes(st, liste.id))).toEqual(['chat', 'mange']);
	});
});

describe('motsDeLeconAvecVerbes — leçons prédéfinies et ids inconnus', () => {
	const predef = ORTHO_PREDEF[0];

	it('leçon prédéfinie : les mêmes mots que motsDeLecon', () => {
		const viaMotsDeLecon = formes(motsDeLecon(emptyOrthoState(), predef.id));
		const st = emptyOrthoState();
		expect(formes(lessons.motsDeLeconAvecVerbes(st, predef.id))).toEqual(viaMotsDeLecon);
		expect(viaMotsDeLecon.length).toBeGreaterThan(0);
	});

	it('leçon prédéfinie : les mots sont matérialisés EN MÉMOIRE, comme avant', () => {
		// Comportement inchangé, et attendu par les appelants (c'est eux qui sauvegardent) :
		// une fonction « pure » qui sauterait la matérialisation priverait la relecture des
		// mots d'une leçon livrée avec l'appli.
		const st = emptyOrthoState();
		const mots = lessons.motsDeLeconAvecVerbes(st, predef.id);
		expect(Object.keys(st.banque)).toHaveLength(mots.length);
		expect(mots.every((m) => st.banque[m.id] !== undefined)).toBe(true);
	});

	it('id inconnu (ou vide) : aucune carte', () => {
		const st = emptyOrthoState();
		expect(lessons.motsDeLeconAvecVerbes(st, 'liste-qui-n-existe-pas')).toEqual([]);
		expect(lessons.motsDeLeconAvecVerbes(st, '')).toEqual([]);
	});
});

/* ============================================================
   Critère 9 (NÉGATIF) — la relecture ne persiste rien et n'appelle pas le lexique
   ============================================================ */
describe('motsDeLeconAvecVerbes — lecture seule et synchrone (critère 9)', () => {
	async function profilAvecListeJouee(): Promise<{ st: OrthoState; listeId: string }> {
		const st = loadOrtho();
		const liste = createListe(st, 'Semaine 5', [{ mot: 'chat' }], undefined, [
			verbe('manger', [0, 2], 'une pomme'),
		]);
		await materialiserVerbes(st, liste.verbes ?? [], 1000);
		saveOrtho(st);
		return { st, listeId: liste.id };
	}

	it('afficher la relecture n’écrit RIEN dans le stockage', async () => {
		const { st, listeId } = await profilAvecListeJouee();
		const avant = instantaneStockage();

		lessons.motsDeLeconAvecVerbes(st, listeId);
		lessons.motsDeLeconAvecVerbes(st, ORTHO_PREDEF[0].id); // y compris une prédéfinie

		expect(instantaneStockage()).toEqual(avant);
	});

	it('renvoie un tableau SYNCHRONE (donc sans passer par le lexique, qui est async)', async () => {
		const { st, listeId } = await profilAvecListeJouee();
		const mots = lessons.motsDeLeconAvecVerbes(st, listeId);
		expect(Array.isArray(mots)).toBe(true);
		expect(mots).not.toBeInstanceOf(Promise);
		expect(formes(mots)).toEqual(['chat', 'mange', 'mange']);
	});

	it('liste JAMAIS lancée : les cibles restent absentes, et rien n’est matérialisé après coup', async () => {
		// Limite assumée par l'issue : sans le lexique, la forme conjuguée est inconnue.
		// La relecture ne doit donc ni inventer de carte, ni lancer une résolution de fond
		// qui viendrait modifier la banque une fois l'écran déjà rendu.
		const st = emptyOrthoState();
		const liste = createListe(st, 'Jamais jouée', [{ mot: 'chat' }], undefined, [
			verbe('manger', [0, 2]),
		]);
		const banqueAvant = JSON.stringify(st.banque);

		const mots = lessons.motsDeLeconAvecVerbes(st, liste.id);
		expect(ids(mots)).toEqual(liste.motIds);
		expect(JSON.stringify(st.banque)).toBe(banqueAvant);

		await laisserTournerLAsync();
		expect(JSON.stringify(st.banque)).toBe(banqueAvant);
		expect(ids(lessons.motsDeLeconAvecVerbes(st, liste.id))).toEqual(liste.motIds);
	});
});
