/* ============================================================
   Envois créés par l'encadrant (#734, PR 3) — `src/core/partage/envois-crees.ts`.

   Écrits AVANT l'implémentation, par un auteur distinct, depuis le critère 4 de
   l'issue et le contrat transmis du module. Rouges tant que le module n'existe pas :
   c'est attendu.

   Critère 4 : l'envoi est conservé dans l'espace encadrant (libellé, date, lien qu'on
   peut recopier). Échec : après rechargement, l'envoi a disparu ou son lien a changé.

   Contrat éprouvé :
   - clé GLOBALE `ludaskia_envois`, jamais `uuid/…` : ni le profil actif, ni l'ajout,
     la suppression ou la réinitialisation d'un profil ne changent la liste ;
   - plus récent d'abord (par date), au plus 50 gardés, les plus récents ;
   - stockage corrompu toléré sans lever, entrées valides conservées ;
   - quota dépassé : `garderEnvoiCree` rend `false` sans lever ;
   - `oublierEnvoiCree` retire un id, ignore un id inconnu.

   Les attendus sont écrits à la main (ids, ordre, nombre), jamais relus du module.
   ============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	activeProfile,
	addProfile,
	deleteProfile,
	initProfiles,
	resetProfile,
	setActiveProfile,
	touchActiveProfile,
} from '../src/core/profiles';
import { lsGetItemRaw, lsKeysRaw, lsSetRaw, setOnDataWrite } from '../src/core/storage';
import {
	chargerEnvoisCrees,
	ENVOIS_KEY,
	garderEnvoiCree,
	MAX_ENVOIS_GARDES,
	oublierEnvoiCree,
	type EnvoiCree,
} from '../src/core/partage/envois-crees';

/** La clé attendue, écrite à la main : c'est elle que le stockage doit porter. */
const CLE = 'ludaskia_envois';

beforeEach(() => {
	localStorage.clear();
	setOnDataWrite(touchActiveProfile);
	initProfiles();
});

/* ---------- Outils ---------- */

/** Un envoi valide ; `n` fixe l'id et la date (plus `n` est grand, plus il est récent). */
function envoi(n: number, partiel: Partial<EnvoiCree> = {}): EnvoiCree {
	return {
		id: 'envoi-' + n,
		libelle: 'Séance ' + n,
		date: 1_790_000_000_000 + n * 60_000,
		detail: n + ' exercices',
		code: 'eJyr' + n + '-_Vk',
		...partiel,
	};
}

const ids = (liste: EnvoiCree[]): string[] => liste.map((e) => e.id);

/** Écrit telle quelle une valeur brute sous la clé globale (stockage « corrompu »). */
function stockerBrut(texte: string): void {
	lsSetRaw(CLE, texte);
}

/** Simule un rechargement de page : modules neufs, aucune mémoire vive héritée ; seul
 *  `localStorage` survit. Le module rechargé ne voit pas non plus de profil actif. */
async function moduleApresRechargement() {
	vi.resetModules();
	return import('../src/core/partage/envois-crees');
}

/* ---------- Contrat ---------- */

describe('constantes du contrat', () => {
	it('la clé est `ludaskia_envois` (filtre `ludaskia_` des sauvegardes) et le plafond vaut 50', () => {
		expect(ENVOIS_KEY).toBe(CLE);
		expect(MAX_ENVOIS_GARDES).toBe(50);
	});
});

describe("critère 4 : l'envoi survit au rechargement, lien inchangé", () => {
	it('garder puis recharger rend le même libellé, la même date, le même détail et le même code', async () => {
		const e = envoi(1, {
			libelle: "Révision de l'été : tables × 7",
			detail: '3 leçons · 12 exercices',
			code: 'eJyrVkrLz1eyUlAqzs9NVQIAFn8D-Q_x',
		});
		expect(garderEnvoiCree(e)).toBe(true);

		const recharge = await moduleApresRechargement();
		expect(recharge.chargerEnvoisCrees()).toEqual([e]);
	});

	it('plusieurs envois gardés reviennent tous après rechargement, codes intacts', async () => {
		const gardes = [envoi(1), envoi(2), envoi(3)];
		gardes.forEach((e) => expect(garderEnvoiCree(e)).toBe(true));

		const recharge = await moduleApresRechargement();
		const relus = recharge.chargerEnvoisCrees();
		expect(relus.map((e) => e.code)).toEqual(['eJyr3-_Vk', 'eJyr2-_Vk', 'eJyr1-_Vk']);
	});
});

describe('ordre et plafond', () => {
	it("plus récent d'abord, quel que soit l'ordre dans lequel on les a gardés", () => {
		garderEnvoiCree(envoi(1));
		garderEnvoiCree(envoi(3));
		garderEnvoiCree(envoi(2));
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-3', 'envoi-2', 'envoi-1']);
	});

	it("plus récent d'abord même quand le stockage brut est rangé du plus ancien au plus récent", () => {
		stockerBrut(JSON.stringify([envoi(1), envoi(2), envoi(3)]));
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-3', 'envoi-2', 'envoi-1']);
	});

	it('50 envois sont tous gardés ; le 51e fait sortir le plus ancien, et le stockage ne grossit pas', () => {
		for (let n = 1; n <= 50; n++) garderEnvoiCree(envoi(n));
		const cinquante = chargerEnvoisCrees();
		expect(cinquante).toHaveLength(50);
		expect(cinquante[0].id).toBe('envoi-50');
		expect(cinquante[49].id).toBe('envoi-1');

		garderEnvoiCree(envoi(51));
		const apres = chargerEnvoisCrees();
		expect(apres).toHaveLength(50);
		expect(apres[0].id).toBe('envoi-51');
		expect(apres[49].id).toBe('envoi-2');
		expect(ids(apres)).not.toContain('envoi-1');

		// Le plafond tient dans le stockage lui-même, pas seulement à la lecture.
		const brut: unknown = JSON.parse(lsGetItemRaw(CLE) ?? 'null');
		expect(Array.isArray(brut) && brut.length).toBe(50);
	});

	it('au-delà de 50, ce sont les plus récents PAR DATE qui restent, même gardés dans le désordre', () => {
		// Permutation déterministe de 1..51 (7 est premier avec 51) : l'envoi le plus
		// ancien (n = 1) est gardé au milieu (rang 36), ni en premier ni en dernier.
		const ordre = Array.from({ length: 51 }, (_, i) => ((i * 7 + 3) % 51) + 1);
		expect(new Set(ordre).size).toBe(51);
		expect(ordre[0]).not.toBe(1);
		expect(ordre[50]).not.toBe(1);

		ordre.forEach((n) => garderEnvoiCree(envoi(n)));

		const attendus = Array.from({ length: 50 }, (_, i) => 'envoi-' + (51 - i)); // 51 → 2
		expect(ids(chargerEnvoisCrees())).toEqual(attendus);
	});
});

describe("clé globale de l'appareil (même régime que le verrou encadrant)", () => {
	it("garder n'écrit qu'une seule nouvelle clé, `ludaskia_envois`, jamais une clé `uuid/…`", () => {
		const avant = new Set(lsKeysRaw());
		garderEnvoiCree(envoi(1));
		const apres = lsKeysRaw();

		expect(apres.filter((k) => !avant.has(k))).toEqual([CLE]);
		expect(apres.filter((k) => k.endsWith('/' + CLE))).toEqual([]);
		expect(lsGetItemRaw(CLE)).not.toBeNull();
	});

	it("lit la clé globale : une liste rangée sous `uuid/ludaskia_envois` n'est pas celle des envois", () => {
		const prefixe = activeProfile().uuid + '/';
		lsSetRaw(prefixe + CLE, JSON.stringify([envoi(9)]));
		expect(chargerEnvoisCrees()).toEqual([]);

		stockerBrut(JSON.stringify([envoi(1)]));
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-1']);
	});

	it('ajouter un profil puis revenir au premier : la liste reste la même, quel que soit le profil qui a gardé', () => {
		const a = activeProfile().uuid;
		garderEnvoiCree(envoi(1));

		const b = addProfile('Léa').uuid; // devient le profil actif
		expect(activeProfile().uuid).toBe(b);
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-1']);

		garderEnvoiCree(envoi(2)); // gardé sous le profil B
		setActiveProfile(a);
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-2', 'envoi-1']);
	});

	it('supprimer un profil, puis réinitialiser le restant, ne touche pas la liste', () => {
		const a = activeProfile().uuid;
		const b = addProfile('Léa').uuid;
		garderEnvoiCree(envoi(1)); // gardés sous B, profil actif
		garderEnvoiCree(envoi(2));

		expect(deleteProfile(b)).toBe(true);
		expect(activeProfile().uuid).toBe(a);
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-2', 'envoi-1']);

		resetProfile(a);
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-2', 'envoi-1']);
	});
});

describe('stockage corrompu : rien ne lève, les entrées valides restent', () => {
	it.each([
		["du texte qui n'est pas du JSON", '{pas du json'],
		["un objet au lieu d'un tableau", JSON.stringify(envoi(1))],
		['une chaîne JSON', '"envoi-1"'],
		['un nombre', '42'],
		['null', 'null'],
	])('valeur brute non tableau (%s) : liste vide', (_cas, brut) => {
		stockerBrut(brut);
		let liste: EnvoiCree[] | undefined;
		expect(() => (liste = chargerEnvoisCrees())).not.toThrow();
		expect(liste).toEqual([]);
	});

	it("tableau mêlé : seules les entrées valides restent, récentes d'abord", () => {
		const sansCode: Partial<EnvoiCree> = envoi(10);
		delete sansCode.code;
		const sansDetail: Partial<EnvoiCree> = envoi(11);
		delete sansDetail.detail;
		stockerBrut(
			JSON.stringify([
				envoi(1),
				null,
				42,
				'envoi-12',
				[envoi(13)],
				sansCode,
				sansDetail,
				{ ...envoi(14), date: '2026-10-08' },
				{ ...envoi(15), libelle: 7 },
				{ ...envoi(16), id: null },
				{ ...envoi(17), code: { valeur: 'x' } },
				envoi(2),
			]),
		);

		let liste: EnvoiCree[] | undefined;
		expect(() => (liste = chargerEnvoisCrees())).not.toThrow();
		expect(liste).toEqual([envoi(2), envoi(1)]);
	});

	it("une entrée portant une clé `__proto__` est écartée, et rien n'est pollué", () => {
		// Écrit à la main : `JSON.stringify` ne produirait pas de clé `__proto__` propre.
		const piege =
			'{"id":"piege","libelle":"x","date":1790000000000,"detail":"d","code":"c",' +
			'"__proto__":{"pollue":true}}';
		stockerBrut('[' + JSON.stringify(envoi(1)) + ',' + piege + ']');

		const liste = chargerEnvoisCrees();
		expect(ids(liste)).toEqual(['envoi-1']);
		expect(Object.prototype).not.toHaveProperty('pollue');
	});

	it('garder par-dessus un stockage corrompu ne lève pas et ne perd pas les entrées valides', () => {
		stockerBrut(JSON.stringify([envoi(1), { id: 'cassé' }]));
		expect(() => garderEnvoiCree(envoi(2))).not.toThrow();
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-2', 'envoi-1']);

		stockerBrut('{pas du json');
		expect(() => garderEnvoiCree(envoi(3))).not.toThrow();
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-3']);
	});
});

describe('stockage plein (quota)', () => {
	/** Rétablit `setItem` : seul `mockRestore()` de l'espion y parvient sur happy-dom
	 *  (cf. `partage-passage.test.ts`). */
	let retablir: (() => void) | null = null;

	afterEach(() => {
		retablir?.();
		retablir = null;
	});

	/** `setItem` lève pour la SEULE clé des envois, comme un quota dépassé. Espion posé sur
	 *  l'INSTANCE : sur `Storage.prototype`, happy-dom ne l'intercepte pas. */
	function refuserEcritureEnvois(): () => number {
		const ecrire = localStorage.setItem.bind(localStorage);
		let refus = 0;
		const espion = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
			if (k === CLE) {
				refus++;
				throw new DOMException('quota dépassé', 'QuotaExceededError');
			}
			ecrire(k, v);
		});
		retablir = () => espion.mockRestore();
		return () => refus;
	}

	it("écriture refusée : `false`, rien ne lève, la liste d'avant est intacte", () => {
		expect(garderEnvoiCree(envoi(1))).toBe(true);
		const avant = lsGetItemRaw(CLE);

		const refus = refuserEcritureEnvois();
		let rendu: boolean | undefined;
		expect(() => (rendu = garderEnvoiCree(envoi(2)))).not.toThrow();
		expect(refus()).toBeGreaterThan(0); // l'écriture a bien été tentée, puis refusée
		expect(rendu).toBe(false);

		expect(lsGetItemRaw(CLE)).toBe(avant);
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-1']);
	});

	it('écriture refusée sur un stockage vide : `false`, et la liste reste vide', () => {
		refuserEcritureEnvois();
		let rendu: boolean | undefined;
		expect(() => (rendu = garderEnvoiCree(envoi(1)))).not.toThrow();
		expect(rendu).toBe(false);
		expect(chargerEnvoisCrees()).toEqual([]);
	});
});

describe('oublierEnvoiCree', () => {
	it("retire l'envoi de cet id, garde les autres dans l'ordre, et l'oubli survit au rechargement", async () => {
		[envoi(1), envoi(2), envoi(3)].forEach((e) => garderEnvoiCree(e));

		oublierEnvoiCree('envoi-2');
		expect(ids(chargerEnvoisCrees())).toEqual(['envoi-3', 'envoi-1']);

		const recharge = await moduleApresRechargement();
		expect(recharge.chargerEnvoisCrees()).toEqual([envoi(3), envoi(1)]);
	});

	it('id inconnu : la liste ne change pas et rien ne lève', () => {
		[envoi(1), envoi(2)].forEach((e) => garderEnvoiCree(e));
		expect(() => oublierEnvoiCree('envoi-inconnu')).not.toThrow();
		expect(chargerEnvoisCrees()).toEqual([envoi(2), envoi(1)]);
	});

	it('liste vide ou stockage illisible : rien ne lève', () => {
		expect(() => oublierEnvoiCree('envoi-1')).not.toThrow();
		expect(chargerEnvoisCrees()).toEqual([]);

		stockerBrut('{pas du json');
		expect(() => oublierEnvoiCree('envoi-1')).not.toThrow();
		expect(chargerEnvoisCrees()).toEqual([]);
	});
});
