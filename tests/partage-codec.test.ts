/* ============================================================
   Séance partagée par lien (#734) : CODEC des liens.

   Tests écrits AVANT l'implémentation, à partir des critères de l'issue et non
   du code.

   Critères couverts :
   - 29 : un lien altéré (caractère modifié, lien tronqué, version inconnue,
          somme de contrôle fausse) est refusé par une VALEUR `{ ok: false,
          raison }`. Jamais un rejet de promesse, jamais une exception, jamais
          une valeur différente de celle encodée ;
   - 32 : le texte du lien ne laisse rien lire de l'énoncé ni des réponses ;
   - 41 : la taille décompressée est plafonnée (une bombe est refusée vite),
          et la longueur du code aussi ;
   - aller-retour : ce qu'on encode se relit à l'identique, pour les deux
     types de lien, et le code n'emploie que l'alphabet base64url ;
   - raison `navigateur` (ajoutée après relecture) : un appareil sans
     `deflate-raw` n'ouvre aucun lien et le dit comme tel, AVANT tout autre
     contrôle, sans rejet ; `encoder` refuse de produire un code.

   Les liens hostiles sont fabriqués à la main avec `node:zlib`, selon la
   disposition binaire documentée dans `src/core/partage/codec.ts` :
   [0] version, [1] type, [2..5] CRC-32 gros-boutiste du JSON en clair,
   [6..] JSON en deflate brut. Le premier bloc vérifie que cette fabrication
   est acceptée telle quelle : sans lui, un refus « hostile » pourrait venir
   d'une fabrication fausse plutôt que de l'altération visée.
   ============================================================ */

import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	compressionDisponible,
	decoder,
	encoder,
	encoderTexte,
	TAILLE_MAX_CODE,
	TAILLE_MAX_JSON,
	VERSION_FORMAT,
	type Decodage,
	type RaisonRefus,
	type TypeLien,
} from '../src/core/partage/codec';

const OCTET_ENVOI = 0x45; // « E »
const OCTET_RESULTAT = 0x52; // « R »
const ALPHABET_B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const RE_B64URL = /^[A-Za-z0-9_-]+$/;
const TYPES: readonly TypeLien[] = ['envoi', 'resultat'];

/* ---------- Outils ---------- */

/** Appelle `decoder` et transforme un REJET en échec explicite : le critère 29
 *  exige qu'un refus soit une valeur, jamais une exception. */
async function decoderSansRejet(type: TypeLien, code: string): Promise<Decodage<unknown>> {
	try {
		return await decoder(type, code);
	} catch (e) {
		// `lib` ES2020 : pas d'`Error(message, { cause })`, d'où `expect.fail`.
		return expect.fail(`decoder a REJETÉ au lieu de résoudre un refus (critère 29) : ${String(e)}`);
	}
}

/** Résumé lisible d'un décodage, pour des messages d'échec qui n'impriment pas
 *  une valeur d'un mégaoctet. */
function raisonDe(r: Decodage<unknown>): RaisonRefus | 'accepté' {
	return r.ok ? 'accepté' : r.raison;
}

function valeurAcceptee(r: Decodage<unknown>, contexte: string): unknown {
	if (!r.ok) throw new Error(`${contexte} : lien accepté attendu, refus « ${r.raison} » obtenu`);
	return r.valeur;
}

interface Fabrication {
	/** JSON en clair, en texte ou déjà en octets UTF-8. */
	json: string | Buffer;
	version?: number;
	octetType?: number;
	/** Force le CRC (sinon : le vrai CRC-32 des octets du JSON en clair). */
	crc?: number;
	/** Remplace le corps (sinon : deflate brut du JSON en clair). */
	corps?: Buffer;
}

/** Fabrique un code selon la disposition documentée, champ par champ. */
function fabriquer(f: Fabrication): string {
	const clair = typeof f.json === 'string' ? Buffer.from(f.json, 'utf8') : f.json;
	const entete = Buffer.alloc(6);
	entete[0] = f.version ?? VERSION_FORMAT;
	entete[1] = f.octetType ?? OCTET_ENVOI;
	entete.writeUInt32BE((f.crc ?? crc32(clair)) >>> 0, 2);
	return Buffer.concat([entete, f.corps ?? deflateRawSync(clair)]).toString('base64url');
}

/** Deflate brut en blocs « stockés » (RFC 1951 §3.2.4) : la taille du corps est
 *  connue à l'octet près, ce que la compression ne permet pas. */
function deflateStocke(donnees: Buffer): Buffer {
	const morceaux: Buffer[] = [];
	let pos = 0;
	do {
		const n = Math.min(0xffff, donnees.length - pos);
		const tete = Buffer.alloc(5);
		tete[0] = pos + n >= donnees.length ? 1 : 0; // BFINAL, BTYPE = 00
		tete.writeUInt16LE(n, 1);
		tete.writeUInt16LE(~n & 0xffff, 3);
		morceaux.push(tete, donnees.subarray(pos, pos + n));
		pos += n;
	} while (pos < donnees.length);
	return Buffer.concat(morceaux);
}

/** Fabrique un code VALIDE (JSON correct, CRC juste) d'exactement `longueur`
 *  caractères. */
function codeValideDeLongueur(longueur: number): { code: string; octetsJson: number } {
	const reste = longueur % 4;
	if (reste === 1) throw new Error(`aucun base64 sans remplissage ne fait ${longueur} caractères`);
	const octets = Math.floor(longueur / 4) * 3 + (reste === 0 ? 0 : reste - 1);
	const corpsVise = octets - 6;
	for (let blocs = 1; 5 * blocs < corpsVise; blocs++) {
		const n = corpsVise - 5 * blocs;
		if (Math.ceil(n / 0xffff) !== blocs) continue;
		const clair = Buffer.from(`"${'x'.repeat(n - 2)}"`, 'utf8');
		const corps = deflateStocke(clair);
		if (!inflateRawSync(corps).equals(clair)) {
			throw new Error('fabrication de test incorrecte : bloc stocké illisible par zlib');
		}
		return { code: fabriquer({ json: clair, corps }), octetsJson: n };
	}
	throw new Error(`impossible de fabriquer un code de ${longueur} caractères`);
}

/** JSON d'une chaîne de `octets` octets au total, guillemets compris. */
function jsonChaineDeTaille(octets: number): string {
	return `"${'a'.repeat(octets - 2)}"`;
}

/** Tirage pseudo-aléatoire reproductible (mulberry32) : jamais `Math.random`. */
function tirage(graine: number): () => number {
	let a = graine >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/* ---------- Format documenté : ancre des liens fabriqués ---------- */

describe('format documenté : la fabrication à la main est le même format que le codec', () => {
	it('un code fabriqué selon la disposition documentée est accepté, pour les deux types', async () => {
		const v = { q: 'Le chat', r: [1, 2] };
		const json = JSON.stringify(v);
		const envoi = await decoderSansRejet('envoi', fabriquer({ json }));
		expect(valeurAcceptee(envoi, 'envoi fabriqué à la main')).toStrictEqual(v);
		const resultat = await decoderSansRejet(
			'resultat',
			fabriquer({ json, octetType: OCTET_RESULTAT }),
		);
		expect(valeurAcceptee(resultat, 'résultat fabriqué à la main')).toStrictEqual(v);
	});

	it('le code produit par encoder suit la disposition documentée, lu par zlib', async () => {
		const v = { enonce: 'Où est le chat ?', reponses: ['là'] };
		const attendus = [
			['envoi', OCTET_ENVOI],
			['resultat', OCTET_RESULTAT],
		] as const;
		for (const [type, octet] of attendus) {
			const octets = Buffer.from(await encoder(type, v), 'base64url');
			expect(octets[0], `${type} : octet de version`).toBe(VERSION_FORMAT);
			expect(octets[1], `${type} : octet de type`).toBe(octet);
			const clair = inflateRawSync(octets.subarray(6));
			expect(octets.readUInt32BE(2), `${type} : CRC-32 gros-boutiste du JSON en clair`).toBe(
				crc32(clair) >>> 0,
			);
			const relu: unknown = JSON.parse(clair.toString('utf8'));
			expect(relu, `${type} : JSON porté par le corps`).toStrictEqual(v);
		}
	});
});

/* ---------- Aller-retour ---------- */

describe('aller-retour : ce qui est encodé se relit à l’identique', () => {
	const VALEUR_RICHE = {
		enonce: "L'élève écrit : « Où est-il ? »",
		reponses: ['à', 'çà', 'Noël', 'aujourd’hui', "aujourd'hui", 'ŒUVRE'],
		emoji: '🦊🌲👩‍🏫',
		echappements: 'ligne\nsuivante\t"guillemets" \\ \u0000',
		nombres: [0, -3, 2.5, 1e21, 123456789],
		drapeaux: [true, false, null],
		vide: '',
		imbrique: { a: [{ b: [] }], c: {} },
	};

	it.each(TYPES)(
		'%s : accents, apostrophes, guillemets « », espace fine insécable, emoji',
		async (type) => {
			const code = await encoder(type, VALEUR_RICHE);
			const r = await decoderSansRejet(type, code);
			expect(valeurAcceptee(r, `aller-retour ${type}`)).toStrictEqual(VALEUR_RICHE);
		},
	);

	it.each(TYPES)(
		'%s : le code n’emploie que [A-Za-z0-9_-], sans remplissage « = »',
		async (type) => {
			for (const v of [VALEUR_RICHE, null, '', { a: 'é'.repeat(100) }]) {
				const code = await encoder(type, v);
				expect(code, `code de ${JSON.stringify(v)}`).toMatch(RE_B64URL);
			}
		},
	);

	it.each(TYPES)(
		'%s : les valeurs « fausses » (null, 0, false, "", [], {}) survivent',
		async (type) => {
			for (const v of [null, 0, false, '', [], {}]) {
				const r = await decoderSansRejet(type, await encoder(type, v));
				expect(valeurAcceptee(r, `aller-retour de ${JSON.stringify(v)}`)).toStrictEqual(v);
			}
		},
	);

	it('encoderTexte : un JSON déjà sérialisé (espaces compris) se relit en valeur', async () => {
		const code = await encoderTexte('resultat', '{ "a" : [1, 2], "b" : "é" }');
		const r = await decoderSansRejet('resultat', code);
		expect(valeurAcceptee(r, 'encoderTexte')).toStrictEqual({ a: [1, 2], b: 'é' });
	});
});

/* ---------- Critère 29 : lien altéré ---------- */

describe('critère 29 : un lien altéré est refusé par une valeur, jamais par une exception', () => {
	const V_COURTE = { q: 'Le chat', r: [3, 4], fait: true };

	it('chaîne vide → illisible', async () => {
		expect(raisonDe(await decoderSansRejet('envoi', ''))).toBe('illisible');
	});

	it('un caractère hors base64url glissé dans un code valide → illisible', async () => {
		const code = await encoder('envoi', V_COURTE);
		const milieu = Math.floor(code.length / 2);
		const fautifs: string[] = [];
		for (const c of ['+', '/', '=', ' ', '.', '!', '%', '#', 'é', '\n', '\u0000']) {
			const r = await decoderSansRejet('envoi', code.slice(0, milieu) + c + code.slice(milieu));
			if (raisonDe(r) !== 'illisible') fautifs.push(`${JSON.stringify(c)} → ${raisonDe(r)}`);
		}
		expect(fautifs, 'caractères hors alphabet non refusés « illisible »').toEqual([]);
	});

	it('code trop court pour contenir l’en-tête (1 à 5 octets) → illisible', async () => {
		const entete = Buffer.from([VERSION_FORMAT, OCTET_ENVOI, 0, 0, 0]);
		for (let n = 1; n <= 5; n++) {
			const code = entete.subarray(0, n).toString('base64url');
			const r = await decoderSansRejet('envoi', code);
			expect(raisonDe(r), `en-tête de ${n} octet(s)`).toBe('illisible');
		}
	});

	it('version de format inconnue, contenu par ailleurs valide → version', async () => {
		const json = JSON.stringify(V_COURTE);
		for (const version of [0, VERSION_FORMAT + 1, 255].filter((v) => v !== VERSION_FORMAT)) {
			const r = await decoderSansRejet('envoi', fabriquer({ json, version }));
			expect(raisonDe(r), `version ${version}`).toBe('version');
		}
	});

	it('version inconnue lue AVANT le corps : un corps illisible pour ce format reste « version »', async () => {
		// Un futur format peut changer la compression : le décodeur actuel ne doit
		// pas tenter de lire son corps, ni dire « illisible » à la place de « version ».
		const code = fabriquer({
			json: '{}',
			version: VERSION_FORMAT + 1,
			crc: 0,
			corps: Buffer.from([0xff, 0xff, 0xff, 0xff]),
		});
		expect(raisonDe(await decoderSansRejet('envoi', code))).toBe('version');
	});

	it('type croisé : un résultat ouvert comme envoi, et l’inverse → type', async () => {
		const json = JSON.stringify(V_COURTE);
		const resultatFabrique = fabriquer({ json, octetType: OCTET_RESULTAT });
		const envoiFabrique = fabriquer({ json, octetType: OCTET_ENVOI });
		expect(raisonDe(await decoderSansRejet('envoi', resultatFabrique)), 'R lu comme envoi').toBe(
			'type',
		);
		expect(raisonDe(await decoderSansRejet('resultat', envoiFabrique)), 'E lu comme résultat').toBe(
			'type',
		);
		const resultatEncode = await encoder('resultat', V_COURTE);
		expect(raisonDe(await decoderSansRejet('envoi', resultatEncode)), 'encoder(resultat)').toBe(
			'type',
		);
	});

	it('octet de type inconnu → refusé (type ou illisible)', async () => {
		const json = JSON.stringify(V_COURTE);
		for (const octetType of [0x00, 0x58, 0x65, 0x72]) {
			for (const type of TYPES) {
				const r = await decoderSansRejet(type, fabriquer({ json, octetType }));
				expect(
					['type', 'illisible'],
					`octet 0x${octetType.toString(16)} lu comme ${type}`,
				).toContain(raisonDe(r));
			}
		}
	});

	it('CRC faux sur un deflate valide → controle (dont CRC écrit en petit-boutiste)', async () => {
		const json = JSON.stringify(V_COURTE);
		const vrai = crc32(Buffer.from(json, 'utf8')) >>> 0;
		const tampon = Buffer.alloc(4);
		tampon.writeUInt32LE(vrai);
		const petitBoutiste = tampon.readUInt32BE(0);
		const faux = [(vrai ^ 1) >>> 0, (vrai ^ 0x80000000) >>> 0, vrai === 0 ? 1 : 0, petitBoutiste];
		for (const crc of faux.filter((c) => c !== vrai)) {
			const r = await decoderSansRejet('envoi', fabriquer({ json, crc }));
			expect(raisonDe(r), `CRC 0x${crc.toString(16)} au lieu de 0x${vrai.toString(16)}`).toBe(
				'controle',
			);
		}
	});

	it('flux deflate cassé → illisible', async () => {
		const corpsCasses: [string, Buffer][] = [
			['type de bloc réservé (11)', Buffer.from([0xff, 0xff, 0xff, 0xff])],
			['corps vide', Buffer.alloc(0)],
			[
				'bloc stocké dont LEN et NLEN se contredisent',
				Buffer.from([0x01, 0x05, 0x00, 0x00, 0x00, 0x7b]),
			],
		];
		for (const [cas, corps] of corpsCasses) {
			const r = await decoderSansRejet('envoi', fabriquer({ json: '{}', corps }));
			expect(raisonDe(r), cas).toBe('illisible');
		}
	});

	it('JSON invalide avec un CRC juste → illisible', async () => {
		for (const json of ['{"a":', '[1,]', "{'a':1}", 'undefined', 'NaN', '']) {
			const r = await decoderSansRejet('envoi', fabriquer({ json }));
			expect(raisonDe(r), `JSON ${JSON.stringify(json)}`).toBe('illisible');
		}
	});

	it('octets UTF-8 invalides avec un CRC juste → illisible, pas un texte rapiécé de « � »', async () => {
		const cas: [string, Buffer][] = [
			['octets 0xFF 0xFE', Buffer.from([0x22, 0xff, 0xfe, 0x22])],
			['« é » amputé de son second octet', Buffer.from([0x22, 0xc3, 0x22])],
		];
		for (const [nom, clair] of cas) {
			const r = await decoderSansRejet('envoi', fabriquer({ json: clair }));
			expect(raisonDe(r), nom).toBe('illisible');
		}
	});

	it('un caractère modifié, à CHAQUE position : refus, ou valeur strictement identique', async () => {
		// En base64 sans remplissage, certains bits (fin du dernier caractère, bits
		// de bourrage du deflate) ne portent rien : y toucher peut redonner la même
		// valeur. Ce qui est interdit, c'est d'accepter une valeur DIFFÉRENTE.
		const code = await encoder('envoi', V_COURTE);
		const violations: string[] = [];
		for (let i = 0; i < code.length; i++) {
			const rang = ALPHABET_B64URL.indexOf(code.charAt(i));
			for (const decalage of [1, 21, 42]) {
				const remplacant = ALPHABET_B64URL.charAt((rang + decalage) % 64);
				const altere = code.slice(0, i) + remplacant + code.slice(i + 1);
				const r = await decoderSansRejet('envoi', altere);
				if (r.ok && !isDeepStrictEqual(r.valeur, V_COURTE)) {
					violations.push(`position ${i} → « ${remplacant} » : ${JSON.stringify(r.valeur)}`);
				}
			}
		}
		expect(violations, 'lien altéré accepté avec une valeur différente').toEqual([]);
	});

	it('lien tronqué, à CHAQUE longueur : refusé (controle ou illisible)', async () => {
		const code = await encoder('envoi', {
			enonce: 'Le petit chat boit son lait',
			reponses: ['lait'],
		});
		const fautifs: string[] = [];
		for (let n = 0; n < code.length; n++) {
			const raison = raisonDe(await decoderSansRejet('envoi', code.slice(0, n)));
			if (raison !== 'controle' && raison !== 'illisible') fautifs.push(`${n} car. → ${raison}`);
		}
		expect(fautifs, `troncatures d'un code de ${code.length} caractères mal refusées`).toEqual([]);
	});

	it('chaînes base64url aléatoires (tirage reproductible) : toujours une valeur de refus', async () => {
		const r = tirage(734);
		const acceptes: string[] = [];
		for (let k = 0; k < 300; k++) {
			const longueur = Math.floor(r() * 81);
			let code = '';
			for (let i = 0; i < longueur; i++) code += ALPHABET_B64URL.charAt(Math.floor(r() * 64));
			if ((await decoderSansRejet('envoi', code)).ok) acceptes.push(code);
		}
		expect(acceptes).toEqual([]);
	});

	it('en-tête valide suivi d’octets aléatoires : toujours une valeur de refus', async () => {
		// Le corps aléatoire passe la lecture de l'en-tête et atteint la
		// décompression : c'est là qu'un flux mal rattrapé lève.
		const r = tirage(29);
		const acceptes: string[] = [];
		for (let k = 0; k < 300; k++) {
			const octets = Buffer.alloc(6 + Math.floor(r() * 61));
			for (let i = 0; i < octets.length; i++) octets[i] = Math.floor(r() * 256);
			octets[0] = VERSION_FORMAT;
			octets[1] = OCTET_ENVOI;
			const code = octets.toString('base64url');
			if ((await decoderSansRejet('envoi', code)).ok) acceptes.push(code);
		}
		expect(acceptes).toEqual([]);
	});
});

/* ---------- Critère 32 : rien de lisible ---------- */

describe('critère 32 : le texte du lien ne laisse rien lire de l’énoncé ni des réponses', () => {
	const PHRASES = ['Le petit chat boit son lait', 'anticonstitutionnellement'];
	const MOTS = PHRASES.flatMap((p) => p.split(/[^\p{L}]+/u))
		.filter((m) => m.length >= 4)
		.map((m) => m.toLowerCase());

	it.each(TYPES)('%s : aucun mot de 4 lettres ou plus n’apparaît dans le code', async (type) => {
		// Garde-fou du test lui-même : une liste vide le rendrait vert sans rien garder.
		expect(MOTS, 'précondition : mots surveillés').toEqual([
			'petit',
			'chat',
			'boit',
			'lait',
			'anticonstitutionnellement',
		]);
		const code = await encoder(type, {
			enonce: PHRASES[0],
			reponses: [PHRASES[1], PHRASES[0]],
			reponseEnfant: PHRASES[1],
		});
		const lisibles = MOTS.filter((m) => code.toLowerCase().includes(m));
		expect(lisibles, `mots lisibles dans « ${code} »`).toEqual([]);
	});
});

/* ---------- Critère 41 : tailles plafonnées ---------- */

describe('critère 41 : la taille est plafonnée, un lien trop gros est refusé sans geler', () => {
	it('bombe de décompression (50 Mo d’espaces dans un code sous le plafond) → taille, en moins de 2 s', async () => {
		// JSON VALIDE (une chaîne d'espaces), CRC juste : seul le plafond peut le refuser.
		const clair = Buffer.alloc(50_000_000, 0x20);
		clair[0] = 0x22;
		clair[clair.length - 1] = 0x22;
		const code = fabriquer({ json: clair });
		expect(code.length, 'précondition : la bombe tient sous TAILLE_MAX_CODE').toBeLessThanOrEqual(
			TAILLE_MAX_CODE,
		);
		const debut = performance.now();
		const r = await decoderSansRejet('envoi', code);
		const duree = performance.now() - debut;
		expect(raisonDe(r), 'bombe de décompression').toBe('taille');
		expect(duree, 'durée du refus (ms)').toBeLessThan(2000);
	}, 30_000);

	it('JSON d’exactement TAILLE_MAX_JSON octets → accepté (le plafond n’est pas dépassé)', async () => {
		const json = jsonChaineDeTaille(TAILLE_MAX_JSON);
		const r = await decoderSansRejet('envoi', fabriquer({ json }));
		expect(raisonDe(r), `JSON de ${TAILLE_MAX_JSON} octets`).toBe('accepté');
		const valeur = valeurAcceptee(r, 'JSON au plafond');
		expect(typeof valeur === 'string' ? valeur.length : -1, 'longueur de la chaîne relue').toBe(
			TAILLE_MAX_JSON - 2,
		);
	});

	it('JSON de TAILLE_MAX_JSON + 1 octets, CRC juste → taille', async () => {
		const json = jsonChaineDeTaille(TAILLE_MAX_JSON + 1);
		const r = await decoderSansRejet('envoi', fabriquer({ json }));
		expect(raisonDe(r), `JSON de ${TAILLE_MAX_JSON + 1} octets`).toBe('taille');
	});

	it('le plafond compte des OCTETS : un JSON accentué sous le plafond en caractères mais au-dessus en octets → taille', async () => {
		const json = `"${'é'.repeat(Math.floor(TAILLE_MAX_JSON / 2))}"`;
		expect(json.length, 'précondition : sous le plafond en caractères').toBeLessThanOrEqual(
			TAILLE_MAX_JSON,
		);
		expect(Buffer.byteLength(json, 'utf8'), 'précondition : au-dessus en octets').toBeGreaterThan(
			TAILLE_MAX_JSON,
		);
		expect(raisonDe(await decoderSansRejet('envoi', fabriquer({ json })))).toBe('taille');
	});

	it('code VALIDE d’exactement TAILLE_MAX_CODE caractères → accepté ; un caractère de plus → taille', async () => {
		const { code, octetsJson } = codeValideDeLongueur(TAILLE_MAX_CODE);
		expect(code.length, 'précondition : longueur exacte').toBe(TAILLE_MAX_CODE);
		expect(octetsJson, 'précondition : JSON sous son propre plafond').toBeLessThanOrEqual(
			TAILLE_MAX_JSON,
		);
		expect(raisonDe(await decoderSansRejet('envoi', code)), 'au plafond').toBe('accepté');
		expect(raisonDe(await decoderSansRejet('envoi', `${code}A`)), 'plafond + 1').toBe('taille');
	});

	it('code par ailleurs valide mais deux fois trop long → taille (refus sur la longueur seule)', async () => {
		const { code, octetsJson } = codeValideDeLongueur(2 * TAILLE_MAX_CODE);
		expect(octetsJson, 'précondition : le JSON seul serait accepté').toBeLessThanOrEqual(
			TAILLE_MAX_JSON,
		);
		expect(raisonDe(await decoderSansRejet('envoi', code))).toBe('taille');
	});

	it('code de 20 millions de caractères → taille, en moins d’1 s', async () => {
		const code = 'A'.repeat(20_000_000);
		const debut = performance.now();
		const r = await decoderSansRejet('envoi', code);
		const duree = performance.now() - debut;
		expect(raisonDe(r)).toBe('taille');
		expect(duree, 'durée du refus (ms)').toBeLessThan(1000);
	});
});

/* ---------- Raison « navigateur » : appareil sans deflate-raw ---------- */

// Flux réels, capturés avant toute simulation : les doublures en héritent.
const VraiCompressionStream = globalThis.CompressionStream;
const VraiDecompressionStream = globalThis.DecompressionStream;

/** Navigateur qui connaît `gzip` et `deflate`, mais pas `deflate-raw`. */
class CompressionSansDeflateRaw extends VraiCompressionStream {
	constructor(format: CompressionFormat) {
		if (format === 'deflate-raw') throw new TypeError(`format non pris en charge : ${format}`);
		super(format);
	}
}

class DecompressionSansDeflateRaw extends VraiDecompressionStream {
	constructor(format: CompressionFormat) {
		if (format === 'deflate-raw') throw new TypeError(`format non pris en charge : ${format}`);
		super(format);
	}
}

describe('raison « navigateur » : un appareil qui ne sait pas (dé)compresser en deflate-raw', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const V = { q: 'Le chat', r: [3, 4] };
	const JSON_V = JSON.stringify(V);

	const SCENARIOS: [string, () => void][] = [
		[
			'flux de compression absents',
			() => {
				vi.stubGlobal('CompressionStream', undefined);
				vi.stubGlobal('DecompressionStream', undefined);
			},
		],
		[
			'flux présents, mais le constructeur lève pour deflate-raw',
			() => {
				vi.stubGlobal('CompressionStream', CompressionSansDeflateRaw);
				vi.stubGlobal('DecompressionStream', DecompressionSansDeflateRaw);
			},
		],
	];

	describe.each(SCENARIOS)('%s', (_nom, simuler) => {
		it('compressionDisponible() rend false', () => {
			simuler();
			expect(compressionDisponible()).toBe(false);
		});

		it('un code valide → navigateur (deux types) ; témoin : accepté une fois les vrais flux rendus', async () => {
			const codes: Record<TypeLien, string> = {
				envoi: fabriquer({ json: JSON_V }),
				resultat: fabriquer({ json: JSON_V, octetType: OCTET_RESULTAT }),
			};
			simuler();
			for (const type of TYPES) {
				const r = await decoderSansRejet(type, codes[type]);
				expect(raisonDe(r), `${type}, appareil incapable`).toBe('navigateur');
			}
			vi.unstubAllGlobals();
			expect(compressionDisponible(), 'témoin : vrais flux rendus').toBe(true);
			for (const type of TYPES) {
				const r = await decoderSansRejet(type, codes[type]);
				expect(valeurAcceptee(r, `témoin ${type}`)).toStrictEqual(V);
			}
		});

		it('navigateur passe AVANT tout autre contrôle (vide, trop long, alphabet, en-tête, CRC, deflate)', async () => {
			const vrai = crc32(Buffer.from(JSON_V, 'utf8')) >>> 0;
			const cas: [string, string][] = [
				['code vide', ''],
				['code trop long', 'A'.repeat(TAILLE_MAX_CODE + 1)],
				['hors alphabet', '!!!!!!!!!!!!'],
				['trop court pour l’en-tête', Buffer.from([VERSION_FORMAT]).toString('base64url')],
				['version inconnue', fabriquer({ json: JSON_V, version: VERSION_FORMAT + 1 })],
				['type croisé', fabriquer({ json: JSON_V, octetType: OCTET_RESULTAT })],
				['CRC faux', fabriquer({ json: JSON_V, crc: (vrai ^ 1) >>> 0 })],
				['deflate cassé', fabriquer({ json: '{}', corps: Buffer.from([0xff, 0xff, 0xff]) })],
			];
			simuler();
			const fautifs: string[] = [];
			for (const [nom, code] of cas) {
				const raison = raisonDe(await decoderSansRejet('envoi', code));
				if (raison !== 'navigateur') fautifs.push(`${nom} → ${raison}`);
			}
			expect(fautifs, 'cas qui ne disent pas « navigateur »').toEqual([]);
		});

		it('encoder et encoderTexte REJETTENT : aucun code produit sans compression', async () => {
			simuler();
			await expect(encoder('envoi', V), 'encoder').rejects.toThrow();
			await expect(encoderTexte('resultat', JSON_V), 'encoderTexte').rejects.toThrow();
		});
	});

	it('décompression seule indisponible (compression présente) → navigateur au décodage', async () => {
		const code = fabriquer({ json: JSON_V });
		vi.stubGlobal('DecompressionStream', undefined);
		expect(raisonDe(await decoderSansRejet('envoi', code))).toBe('navigateur');
	});

	it('compression seule indisponible (décompression présente) → encoder rejette', async () => {
		vi.stubGlobal('CompressionStream', undefined);
		await expect(encoder('envoi', V)).rejects.toThrow();
	});
});
