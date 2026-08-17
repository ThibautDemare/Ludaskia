/* ============================================================
   #306 §7 — cadence du rappel « installez, et sauvegardez » (`core/rappel-sauvegarde.ts`).
   ------------------------------------------------------------
   Attendus dérivés du cadrage de l'issue, pas de la mécanique interne :
   - PAS DE MINUTERIE. Le déclencheur est le RISQUE ACCUMULÉ : au moins 3 activités
     terminées (tous profils) depuis le dernier export réussi. Trois verrous se
     cumulent — risque accumulé, délai de report écoulé, et au moins 7 jours depuis
     le dernier export — plus l'engagement et 48 h depuis l'origine ;
   - le REPORT EST UN PLANCHER, jamais un déclencheur : un délai expiré alors qu'il
     n'y a rien de neuf à perdre n'affiche rien. C'est le piège principal : sans lui,
     la mécanique redevient « afficher tous les N jours » ;
   - la réapparition s'éloigne à chaque fermeture (1, 3, 7, 14, 30 jours, puis 30
     indéfiniment : plafond, jamais de « ne plus jamais afficher ») ;
   - un export réussi horodate ET ramène le report au premier cran — sinon la famille
     qui exporte mais ferme parfois l'encart dériverait jusqu'au plafond, alors que
     c'est celle qui se comporte bien. C'est le verrou des 7 jours qui empêche
     l'encart de revenir aussitôt ;
   - l'activité se compte sur TOUS les profils : changer d'enfant ne doit pas
     réactiver un encart dont l'export couvre toute la famille ;
   - délais en temps CALENDAIRE : une longue absence les fait expirer, et l'encart
     s'affiche à la réouverture (c'est voulu).

   Les durées sont réécrites ici depuis l'issue (48 h, 7 jours, 1/3/7/14/30) au lieu
   d'être importées : un test qui relit la constante qu'il vérifie ne vérifie rien.
   Les constantes exportées sont comparées une fois, en tête.
   ============================================================ */
import { beforeEach, describe, it, expect } from 'vitest';
import {
	DELAI_MIN_EXPORT_MS,
	DELAI_PREMIER_JOUR_MS,
	MIN_ACTIVITES,
	RAPPEL_SAUVEGARDE_KEY,
	REPORTS_JOURS,
	apresExport,
	compterActivites,
	contenuRappel,
	delaiReportMs,
	doitAfficherRappel,
	ecrireEtatRappel,
	enregistrerExport,
	etatNeufRappel,
	lireEtatRappel,
	reporter,
	type ContexteRappel,
	type EtatRappel,
} from '../src/core/rappel-sauvegarde';
import { lsSetRaw, setOnDataWrite } from '../src/core/storage';
import {
	activeProfile,
	addProfile,
	exportProfiles,
	initProfiles,
	listProfiles,
	touchActiveProfile,
} from '../src/core/profiles';
import { ACTIVITY_KEY } from '../src/core/progress';

const JOUR = 24 * 60 * 60 * 1000;
const HEURE = 60 * 60 * 1000;
/** Instant de référence (arithmétique pure : le calendrier n'intervient pas). */
const NOW = Date.UTC(2026, 2, 15, 18, 30);

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* État « rien ne s'y oppose » : installation ancienne, jamais exportée, jamais fermée. */
function etatOuvert(): EtatRappel {
	return { depuis: NOW - 30 * JOUR, palier: 0 };
}
/* Contexte « tout est réuni » : quelqu'un travaille, le risque est accumulé. */
function ctxOuvert(over: Partial<ContexteRappel> = {}): ContexteRappel {
	return { engage: true, activites: 3, installee: false, now: NOW, ...over };
}

describe('constantes calibrées comme l’issue les a arrêtées', () => {
	it('3 activités, 48 h, 7 jours, échelle 1/3/7/14/30', () => {
		expect(MIN_ACTIVITES).toBe(3);
		expect(DELAI_PREMIER_JOUR_MS).toBe(48 * HEURE);
		expect(DELAI_MIN_EXPORT_MS).toBe(7 * JOUR);
		expect([...REPORTS_JOURS]).toEqual([1, 3, 7, 14, 30]);
	});
});

describe('doitAfficherRappel — les verrous se cumulent', () => {
	it('tout est réuni → l’encart s’affiche', () => {
		expect(doitAfficherRappel(etatOuvert(), ctxOuvert())).toBe(true);
	});

	it('personne ne se sert de l’app → jamais, quoi qu’il arrive par ailleurs', () => {
		expect(doitAfficherRappel(etatOuvert(), ctxOuvert({ engage: false, activites: 99 }))).toBe(
			false,
		);
	});

	it('risque accumulé : 2 activités ne suffisent pas, 3 oui', () => {
		expect(doitAfficherRappel(etatOuvert(), ctxOuvert({ activites: 2 }))).toBe(false);
		expect(doitAfficherRappel(etatOuvert(), ctxOuvert({ activites: 3 }))).toBe(true);
	});

	it('aucune activité depuis l’export → rien à perdre, donc rien à dire', () => {
		expect(doitAfficherRappel(etatOuvert(), ctxOuvert({ activites: 0 }))).toBe(false);
	});

	it('premier lancement : rien avant 48 h, l’encart arrive à 48 h pile', () => {
		// Le « mot aux parents » promet « sans aucune pression » : pas de message
		// inquiétant dans la même minute.
		const jeune = (age: number): EtatRappel => ({ depuis: NOW - age, palier: 0 });
		expect(doitAfficherRappel(jeune(0), ctxOuvert())).toBe(false);
		expect(doitAfficherRappel(jeune(47 * HEURE), ctxOuvert())).toBe(false);
		expect(doitAfficherRappel(jeune(48 * HEURE), ctxOuvert())).toBe(true);
	});

	it('origine inconnue → on ne peut pas prouver les 48 h, donc on n’affiche pas', () => {
		expect(doitAfficherRappel({ palier: 0 }, ctxOuvert())).toBe(false);
	});

	it('on ne resollicite pas qui vient d’exporter : 7 jours pleins', () => {
		const exporteIlYA = (age: number): EtatRappel => ({
			depuis: NOW - 30 * JOUR,
			dernierExport: NOW - age,
			palier: 0,
		});
		expect(doitAfficherRappel(exporteIlYA(0), ctxOuvert())).toBe(false);
		expect(doitAfficherRappel(exporteIlYA(7 * JOUR - HEURE), ctxOuvert())).toBe(false);
		expect(doitAfficherRappel(exporteIlYA(7 * JOUR), ctxOuvert())).toBe(true);
	});

	it('jamais exporté → le verrou des 7 jours ne s’applique pas', () => {
		expect(doitAfficherRappel(etatOuvert(), ctxOuvert())).toBe(true);
	});

	it('fermé récemment → le plancher tient jusqu’à son terme', () => {
		const ferme = (prochain: number): EtatRappel => ({ ...etatOuvert(), palier: 1, prochain });
		expect(doitAfficherRappel(ferme(NOW + HEURE), ctxOuvert())).toBe(false);
		expect(doitAfficherRappel(ferme(NOW), ctxOuvert())).toBe(true); // délai écoulé
		expect(doitAfficherRappel(ferme(NOW - JOUR), ctxOuvert())).toBe(true);
	});

	it('déjà installée : l’encart subsiste en rappel d’export seul', () => {
		// Les deux conseils ont des conditions indépendantes ; l'installation ne fait
		// pas taire la sauvegarde, qui est à refaire.
		expect(doitAfficherRappel(etatOuvert(), ctxOuvert({ installee: true }))).toBe(true);
	});

	it('longue absence : les délais expirent en temps calendaire, l’encart attend au retour', () => {
		const apresQuaranteJours: EtatRappel = {
			depuis: NOW - 400 * JOUR,
			dernierExport: NOW - 200 * JOUR,
			palier: 4,
			prochain: NOW - 170 * JOUR,
		};
		expect(doitAfficherRappel(apresQuaranteJours, ctxOuvert({ activites: 12 }))).toBe(true);
	});
});

describe('doitAfficherRappel — le report est un PLANCHER, pas un déclencheur', () => {
	it('délai de report largement expiré, mais rien de neuf depuis l’export → rien', () => {
		// Le piège de la mécanique : ici, « le délai est passé » ne doit RIEN déclencher.
		const etat: EtatRappel = {
			depuis: NOW - 400 * JOUR,
			dernierExport: NOW - 60 * JOUR,
			palier: 3,
			prochain: NOW - 46 * JOUR,
		};
		expect(doitAfficherRappel(etat, ctxOuvert({ activites: 0 }))).toBe(false);
		expect(doitAfficherRappel(etat, ctxOuvert({ activites: 2 }))).toBe(false);
		expect(doitAfficherRappel(etat, ctxOuvert({ activites: 3 }))).toBe(true);
	});

	it('un plancher expiré ne rattrape pas le verrou des 7 jours', () => {
		const etat: EtatRappel = {
			depuis: NOW - 400 * JOUR,
			dernierExport: NOW - 2 * JOUR, // vient d'exporter
			palier: 4,
			prochain: NOW - 30 * JOUR, // et le report est loin derrière
		};
		expect(doitAfficherRappel(etat, ctxOuvert({ activites: 10 }))).toBe(false);
	});

	it('ni les 48 h du premier lancement', () => {
		const etat: EtatRappel = { depuis: NOW - HEURE, palier: 4, prochain: NOW - 30 * JOUR };
		expect(doitAfficherRappel(etat, ctxOuvert({ activites: 10 }))).toBe(false);
	});
});

describe('contenuRappel — deux conseils, deux conditions indépendantes', () => {
	it('pas encore installée : les deux conseils', () => {
		expect(contenuRappel(ctxOuvert({ installee: false }))).toEqual({
			installer: true,
			sauvegarder: true,
		});
	});

	it('déjà installée : l’encart se réduit au rappel d’export (il ne disparaît pas)', () => {
		// L'installation se fait une fois, l'export est à refaire : c'est le cas le plus
		// fréquent à terme.
		expect(contenuRappel(ctxOuvert({ installee: true }))).toEqual({
			installer: false,
			sauvegarder: true,
		});
	});
});

describe('delaiReportMs — échelle croissante, plafonnée', () => {
	it('1, 3, 7, 14 puis 30 jours', () => {
		expect([0, 1, 2, 3, 4].map(delaiReportMs)).toEqual([1, 3, 7, 14, 30].map((j) => j * JOUR));
	});

	it('au-delà du dernier cran, on reste à 30 jours (l’information ne meurt jamais)', () => {
		for (const palier of [5, 6, 42]) expect(delaiReportMs(palier)).toBe(30 * JOUR);
	});

	it('un palier négatif ou absurde reste borné au premier cran', () => {
		for (const palier of [-1, -100]) expect(delaiReportMs(palier)).toBe(1 * JOUR);
	});
});

describe('reporter — chaque fermeture repousse la suivante un peu plus loin', () => {
	it('la première fermeture renvoie au lendemain', () => {
		const apres = reporter(etatOuvert(), NOW);
		expect(apres.prochain).toBe(NOW + 1 * JOUR);
		expect(apres.palier).toBe(1);
	});

	it('fermetures successives : 1, 3, 7, 14, 30, puis 30 indéfiniment', () => {
		let etat = etatOuvert();
		const delais: number[] = [];
		let t = NOW;
		for (let i = 0; i < 7; i++) {
			etat = reporter(etat, t);
			delais.push((etat.prochain ?? 0) - t);
			t = (etat.prochain ?? t) + HEURE; // on referme dès que l'encart revient
		}
		expect(delais.map((d) => d / JOUR)).toEqual([1, 3, 7, 14, 30, 30, 30]);
	});

	it('préserve l’origine et le dernier export (sinon les autres verrous sautent)', () => {
		const etat: EtatRappel = { depuis: 1000, dernierExport: 2000, palier: 2 };
		const apres = reporter(etat, NOW);
		expect(apres.depuis).toBe(1000);
		expect(apres.dernierExport).toBe(2000);
	});

	it('n’altère pas l’état reçu', () => {
		const etat = etatOuvert();
		const copie = { ...etat };
		reporter(etat, NOW);
		expect(etat).toEqual(copie);
	});

	it('fermer puis rouvrir : l’encart ne revient pas le soir même', () => {
		const etat = reporter(etatOuvert(), NOW);
		expect(doitAfficherRappel(etat, ctxOuvert({ now: NOW + 6 * HEURE }))).toBe(false);
		expect(doitAfficherRappel(etat, ctxOuvert({ now: NOW + JOUR }))).toBe(true);
	});
});

describe('apresExport — horodate et ramène le report au premier cran', () => {
	it('pose la date, remet le palier à 0, garde l’origine', () => {
		const etat: EtatRappel = { depuis: 1000, dernierExport: 2000, palier: 3 };
		expect(apresExport(etat, NOW)).toEqual({ depuis: 1000, dernierExport: NOW, palier: 0 });
	});

	it('lève le plancher posé par une fermeture (« fermer monte, exporter ramène »)', () => {
		const etat: EtatRappel = { ...etatOuvert(), palier: 4, prochain: NOW + 30 * JOUR };
		expect(apresExport(etat, NOW).prochain).toBeUndefined();
	});

	it('origine absente → l’export la pose', () => {
		expect(apresExport({ palier: 2 }, NOW).depuis).toBe(NOW);
	});

	it('l’encart se tait aussitôt, et ne revient qu’après 7 jours ET du neuf', () => {
		const apres = apresExport(etatOuvert(), NOW);
		// Le compteur d'activités repart de l'export : il n'y a plus rien à perdre.
		expect(doitAfficherRappel(apres, ctxOuvert({ activites: 0, now: NOW + 10 * JOUR }))).toBe(
			false,
		);
		// Beaucoup d'activité, mais deux jours seulement : on ne resollicite pas.
		expect(doitAfficherRappel(apres, ctxOuvert({ activites: 12, now: NOW + 2 * JOUR }))).toBe(
			false,
		);
		// Sept jours et du travail non sauvegardé : c'est le moment.
		expect(doitAfficherRappel(apres, ctxOuvert({ activites: 3, now: NOW + 7 * JOUR }))).toBe(true);
	});

	it('la famille qui exporte souvent ne dérive PAS jusqu’au plafond de 30 jours', () => {
		// Trois fermetures (palier 3), puis un export : la fermeture suivante doit
		// renvoyer au lendemain, pas à un mois.
		let etat = etatOuvert();
		for (const t of [NOW, NOW + 2 * JOUR, NOW + 10 * JOUR]) etat = reporter(etat, t);
		expect(etat.palier).toBe(3);
		etat = apresExport(etat, NOW + 20 * JOUR);
		const refermee = reporter(etat, NOW + 30 * JOUR);
		expect((refermee.prochain ?? 0) - (NOW + 30 * JOUR)).toBe(1 * JOUR);
	});
});

describe('compterActivites — tous profils cumulés, depuis le dernier export', () => {
	/** Journal d'activité écrit BRUT sur un profil (format courant : { t, k }). */
	function journal(uuid: string, entrees: unknown[]): void {
		lsSetRaw(`${uuid}/${ACTIVITY_KEY}`, JSON.stringify(entrees));
	}
	const seance = (t: number) => ({ t, k: 'lecon', ref: 'math-doubles' });

	it('cumule les profils : changer d’enfant ne remet pas le compteur à zéro', () => {
		const a = activeProfile();
		const b = addProfile('Profil B');
		journal(a.uuid, [seance(NOW - JOUR), seance(NOW - 2 * JOUR)]);
		journal(b.uuid, [seance(NOW - 3 * JOUR)]);
		expect(compterActivites([a.uuid, b.uuid], NOW - 10 * JOUR)).toBe(3);
	});

	it('seuil STRICT : l’activité horodatée à l’instant de l’export est déjà sauvegardée', () => {
		const a = activeProfile();
		journal(a.uuid, [seance(NOW - JOUR), seance(NOW), seance(NOW + 1)]);
		expect(compterActivites([a.uuid], NOW)).toBe(1); // seule celle d'après compte
	});

	it('sans dernier export connu, tout compte', () => {
		const a = activeProfile();
		journal(a.uuid, [seance(1), seance(2), seance(3)]);
		expect(compterActivites([a.uuid], undefined)).toBe(3);
	});

	it('ANCIEN format toléré : un horodatage nu vaut une activité', () => {
		const a = activeProfile();
		journal(a.uuid, [NOW - JOUR, seance(NOW - 2 * JOUR), NOW - 3 * JOUR]);
		expect(compterActivites([a.uuid], NOW - 10 * JOUR)).toBe(3);
		// …et l'ancien format respecte le même seuil.
		expect(compterActivites([a.uuid], NOW - 2 * JOUR)).toBe(1);
	});

	it('profil HÉRITÉ, clé sans préfixe (avant les profils multiples)', () => {
		lsSetRaw(ACTIVITY_KEY, JSON.stringify([seance(NOW - JOUR), seance(NOW - 2 * JOUR)]));
		expect(compterActivites([activeProfile().uuid], NOW - 10 * JOUR)).toBe(2);
	});

	it('entrées sans date exploitable → ignorées, sans lever', () => {
		const a = activeProfile();
		journal(a.uuid, [{ k: 'lecon' }, { t: 'hier' }, null, seance(NOW - JOUR)]);
		expect(compterActivites([a.uuid], NOW - 10 * JOUR)).toBe(1);
	});

	it('journal illisible ou d’un autre type → ignoré', () => {
		const a = activeProfile();
		lsSetRaw(`${a.uuid}/${ACTIVITY_KEY}`, '{tronqué');
		expect(compterActivites([a.uuid], 0)).toBe(0);
		lsSetRaw(`${a.uuid}/${ACTIVITY_KEY}`, JSON.stringify({ compte: 12 }));
		expect(compterActivites([a.uuid], 0)).toBe(0);
	});

	it('aucun profil, ou un UUID inconnu → 0', () => {
		expect(compterActivites([], 0)).toBe(0);
		expect(compterActivites(['uuid-fantome'], 0)).toBe(0);
	});
});

describe('lireEtatRappel — l’origine se pose une fois, et ne bouge plus', () => {
	it('premier appel : pose l’origine, la persiste, et part du premier cran', () => {
		const etat = lireEtatRappel(NOW);
		expect(etat).toEqual(etatNeufRappel(NOW));
		expect(JSON.parse(localStorage.getItem(RAPPEL_SAUVEGARDE_KEY) ?? 'null')).toEqual(etat);
	});

	it('appels suivants : l’origine n’est PAS réécrite (sinon les 48 h ne tombent jamais)', () => {
		lireEtatRappel(NOW);
		expect(lireEtatRappel(NOW + 10 * JOUR).depuis).toBe(NOW);
		expect(lireEtatRappel(NOW + 400 * JOUR).depuis).toBe(NOW);
	});

	it('un état complet est rendu tel quel, sans réécriture', () => {
		const etat: EtatRappel = {
			depuis: NOW - 30 * JOUR,
			dernierExport: NOW - 8 * JOUR,
			palier: 2,
			prochain: NOW - JOUR,
		};
		ecrireEtatRappel(etat);
		const brut = localStorage.getItem(RAPPEL_SAUVEGARDE_KEY);
		expect(lireEtatRappel(NOW)).toEqual(etat);
		expect(localStorage.getItem(RAPPEL_SAUVEGARDE_KEY)).toBe(brut);
	});

	it('JSON corrompu → état neuf, et réparé sur disque', () => {
		lsSetRaw(RAPPEL_SAUVEGARDE_KEY, '{"palier":');
		expect(lireEtatRappel(NOW)).toEqual(etatNeufRappel(NOW));
		expect(JSON.parse(localStorage.getItem(RAPPEL_SAUVEGARDE_KEY) ?? 'null')).toEqual(
			etatNeufRappel(NOW),
		);
	});

	it('champs de mauvais type → ignorés, jamais pris pour des dates', () => {
		lsSetRaw(
			RAPPEL_SAUVEGARDE_KEY,
			JSON.stringify({ depuis: 'hier', dernierExport: '2026-01-01', palier: 'trois' }),
		);
		const etat = lireEtatRappel(NOW);
		expect(etat.depuis).toBe(NOW);
		expect(etat.dernierExport).toBeUndefined(); // pas de faux « vient d'exporter »
		expect(etat.palier).toBe(0);
	});

	it('palier hors échelle → ramené dans les bornes', () => {
		lsSetRaw(RAPPEL_SAUVEGARDE_KEY, JSON.stringify({ depuis: NOW, palier: 99 }));
		expect(delaiReportMs(lireEtatRappel(NOW).palier)).toBe(30 * JOUR);
		lsSetRaw(RAPPEL_SAUVEGARDE_KEY, JSON.stringify({ depuis: NOW, palier: -5 }));
		expect(lireEtatRappel(NOW).palier).toBe(0);
	});

	it('la clé est GLOBALE : jamais rangée sous un profil', () => {
		lireEtatRappel(NOW);
		const uuids = listProfiles().map((p) => p.uuid);
		expect(localStorage.getItem(RAPPEL_SAUVEGARDE_KEY)).not.toBeNull();
		for (const u of uuids) expect(localStorage.getItem(`${u}/${RAPPEL_SAUVEGARDE_KEY}`)).toBeNull();
	});

	it('l’état survit à l’arrivée d’un nouveau profil (l’export couvre la famille)', () => {
		enregistrerExport(NOW);
		addProfile('Profil B');
		expect(lireEtatRappel(NOW + JOUR).dernierExport).toBe(NOW);
	});
});

describe('exportProfiles horodate le dernier export réussi (#306 §7)', () => {
	it('un export met à jour la date globale, remet le palier à 0 et garde l’origine', () => {
		ecrireEtatRappel({ depuis: NOW - 30 * JOUR, palier: 3, prochain: NOW + 30 * JOUR });
		const avant = Date.now();
		const payload = exportProfiles(listProfiles().map((p) => p.uuid));
		const apres = Date.now();
		expect(payload).not.toBeNull();

		const etat = lireEtatRappel(Date.now());
		expect(etat.dernierExport).toBeGreaterThanOrEqual(avant);
		expect(etat.dernierExport).toBeLessThanOrEqual(apres);
		expect(etat.palier).toBe(0);
		expect(etat.depuis).toBe(NOW - 30 * JOUR); // l'origine du « 48 h » n'est pas perdue
	});

	it('et l’encart se tait : plus rien à perdre depuis cet instant', () => {
		ecrireEtatRappel({ depuis: NOW - 30 * JOUR, palier: 0 });
		const a = activeProfile();
		const uuids = listProfiles().map((p) => p.uuid);
		lsSetRaw(
			`${a.uuid}/${ACTIVITY_KEY}`,
			JSON.stringify([1, 2, 3].map((i) => ({ t: Date.now() - i * JOUR, k: 'lecon' }))),
		);
		const avant = lireEtatRappel(Date.now());
		const ctx = (etat: EtatRappel): ContexteRappel => ({
			engage: true,
			activites: compterActivites(uuids, etat.dernierExport),
			installee: false,
			now: Date.now(),
		});
		expect(doitAfficherRappel(avant, ctx(avant))).toBe(true);

		exportProfiles(uuids);
		const apres = lireEtatRappel(Date.now());
		expect(compterActivites(uuids, apres.dernierExport)).toBe(0); // le risque est reparti de zéro
		expect(doitAfficherRappel(apres, ctx(apres))).toBe(false);
	});

	it('la mémoire du rappel ne part PAS dans le fichier exporté (c’est celle de CETTE machine)', () => {
		enregistrerExport(NOW - 8 * JOUR);
		const payload = exportProfiles(listProfiles().map((p) => p.uuid));
		expect(JSON.stringify(payload)).not.toContain(RAPPEL_SAUVEGARDE_KEY);
	});
});
