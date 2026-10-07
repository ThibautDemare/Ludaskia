/* ============================================================
   Séance partagée (#734) — CODEC des liens : octets, compression, contrôle.

   Un lien porte ses données dans le fragment `#` de l'URL : rien ne part vers un
   serveur. Ce module ne connaît que des OCTETS et du JSON ; la validation du
   contenu (schémas, listes blanches) vit dans `schema.ts` et ses voisins.

   Disposition binaire, avant encodage base64url (sans remplissage `=`) :

     [0]      version du format (VERSION_FORMAT)
     [1]      type de lien : 0x45 « E » = envoi, 0x52 « R » = résultat
     [2..5]   CRC-32 (gros-boutiste) des octets UTF-8 du JSON NON compressé
     [6..]    JSON compressé en deflate brut (`deflate-raw`)

   Ce que ça apporte, et ce que ça n'apporte pas :
   - la compression rend le texte illisible à l'œil (critère 32) : c'est de
     l'OBFUSCATION, pas un secret — un adulte qui lit ce fichier décode tout ;
   - la version est lue AVANT toute décompression : un format inconnu est refusé
     sans rien interpréter (critère 29) ;
   - le CRC attrape un caractère modifié ou un lien tronqué qui décompresserait
     quand même ;
   - la décompression est PLAFONNÉE en flux (critère 41) : une bombe s'arrête au
     plafond au lieu de geler l'onglet.

   Aucune fonction de ce module ne lève : un refus est une VALEUR (`Decodage`),
   que l'écran traduit en message clair. Une exception non rattrapée afficherait
   un écran blanc chez l'enfant.
   ============================================================ */

/** Version du format binaire. À incrémenter quand la disposition ou le sens d'un
 *  champ change : les liens déjà émis sont alors REFUSÉS explicitement (critère 29),
 *  pas interprétés de travers. */
export const VERSION_FORMAT = 1;

export type TypeLien = 'envoi' | 'resultat';

/** Raison d'un refus, de la plus grossière à la plus fine :
 *  - `navigateur`: le navigateur ne sait pas décompresser (`DecompressionStream` absent,
 *                  ou sans le format `deflate-raw`) — le lien est peut-être bon, c'est
 *                  l'appareil qu'il faut mettre à jour, et l'écran doit le dire ainsi ;
 *  - `illisible` : pas du base64url, trop court, JSON ou flux deflate cassé ;
 *  - `version`   : octet de version inconnu ;
 *  - `type`      : un lien de résultat ouvert comme un envoi, ou l'inverse ;
 *  - `taille`    : code trop long, ou JSON décompressé au-delà du plafond ;
 *  - `controle`  : CRC-32 faux (caractère modifié, lien tronqué) ;
 *  - `schema`    : JSON lisible mais hors schéma (champ inconnu, valeur hors liste
 *                  blanche, nombre non fini…). Posé par les modules de schéma. */
export type RaisonRefus =
	'navigateur' | 'illisible' | 'version' | 'type' | 'taille' | 'controle' | 'schema';

export type Decodage<T> = { ok: true; valeur: T } | { ok: false; raison: RaisonRefus };

/** Plafond du code base64url accepté, en caractères. Au-delà, refus `taille` sans
 *  même décoder. */
export const TAILLE_MAX_CODE = 100_000;

/** Plafond du JSON décompressé, en octets. La décompression s'interrompt dès qu'il
 *  est dépassé (refus `taille`). */
export const TAILLE_MAX_JSON = 1_000_000;

const OCTET_TYPE: Record<TypeLien, number> = { envoi: 0x45, resultat: 0x52 };
const TAILLE_ENTETE = 6;

/** Le navigateur sait-il (dé)compresser en `deflate-raw` ? Chrome 103, Firefox 113,
 *  Safari 16.4. Un navigateur plus ancien a parfois `DecompressionStream` sans ce
 *  format : le constructeur lève alors, d'où l'essai plutôt qu'un simple `typeof`. */
export function compressionDisponible(): boolean {
	try {
		new CompressionStream('deflate-raw');
		new DecompressionStream('deflate-raw');
		return true;
	} catch {
		return false;
	}
}

/** Encode une valeur JSON en code de lien. */
export async function encoder(type: TypeLien, valeur: unknown): Promise<string> {
	return encoderTexte(type, JSON.stringify(valeur));
}

/** Encode un texte JSON DÉJÀ sérialisé. Exposé pour les tests, qui fabriquent des
 *  liens hostiles (clé `__proto__`, nombre `1e999`) qu'un `JSON.stringify` ne
 *  produirait pas tels quels. */
export async function encoderTexte(type: TypeLien, json: string): Promise<string> {
	if (!compressionDisponible())
		throw new Error('partage : ce navigateur ne sait pas compresser un lien (navigateur)');
	const octets = new TextEncoder().encode(json);
	const corps = await traverser(octets, new CompressionStream('deflate-raw'));
	if (corps === 'plafond') throw new Error('partage : compression impossible');
	const lien = new Uint8Array(TAILLE_ENTETE + corps.length);
	lien[0] = VERSION_FORMAT;
	lien[1] = OCTET_TYPE[type];
	new DataView(lien.buffer).setUint32(2, crc32(octets));
	lien.set(corps, TAILLE_ENTETE);
	return versBase64url(lien);
}

const refus = (raison: RaisonRefus): Decodage<never> => ({ ok: false, raison });

/** Décode un code de lien en valeur JSON BRUTE (non validée). Chaque étape refuse au
 *  plus tôt, de la moins coûteuse à la plus coûteuse : longueur, alphabet, en-tête,
 *  décompression plafonnée, contrôle, puis seulement l'interprétation du texte. */
export async function decoder(type: TypeLien, code: string): Promise<Decodage<unknown>> {
	// Avant tout le reste : sur un appareil qui ne sait pas décompresser, AUCUN lien ne
	// s'ouvre, et dire « lien altéré » enverrait l'enfant redemander un lien qui marche.
	if (!compressionDisponible()) return refus('navigateur');
	try {
		if (code.length > TAILLE_MAX_CODE) return refus('taille');
		const lien = depuisBase64url(code);
		if (!lien || lien.length <= TAILLE_ENTETE) return refus('illisible');
		if (lien[0] !== VERSION_FORMAT) return refus('version');
		if (lien[1] !== OCTET_TYPE[type]) return refus('type');
		const attendu = new DataView(lien.buffer, lien.byteOffset).getUint32(2);
		const octets = await traverser(
			lien.subarray(TAILLE_ENTETE),
			new DecompressionStream('deflate-raw'),
			TAILLE_MAX_JSON,
		);
		if (octets === 'plafond') return refus('taille');
		if (crc32(octets) !== attendu) return refus('controle');
		// `fatal` : un lien émis par l'application n'a jamais d'UTF-8 invalide. L'accepter
		// montrerait à l'enfant un texte rapiécé de « � » au lieu d'un refus franc.
		const json = new TextDecoder('utf-8', { fatal: true }).decode(octets);
		return { ok: true, valeur: JSON.parse(json) };
	} catch {
		// Flux deflate cassé, UTF-8 invalide, JSON invalide, ou flux de compression
		// absent d'un navigateur trop ancien : rien d'exploitable dans ce lien.
		return refus('illisible');
	}
}

/* ---------- Flux ---------- */

/** Fait passer des octets dans un flux de (dé)compression. Avec un `plafond`, la lecture
 *  s'arrête dès qu'il est dépassé et le flux est annulé : la bombe de décompression ne
 *  produit jamais plus que le plafond (critère 41). Une erreur du flux (données
 *  corrompues) est propagée à l'appelant. */
async function traverser(
	entree: Uint8Array,
	flux: CompressionStream | DecompressionStream,
	plafond = Infinity,
): Promise<Uint8Array | 'plafond'> {
	const ecrivain = flux.writable.getWriter();
	// L'écriture se termine en erreur quand la lecture échoue ou est annulée : c'est
	// attendu, et la lecture le signale déjà. On la rattrape pour qu'aucune promesse
	// rejetée ne reste orpheline (Vitest et la console du navigateur la verraient).
	const ecriture = ecrivain
		.write(entree as Uint8Array<ArrayBuffer>)
		.then(() => ecrivain.close())
		.catch(() => {});
	const lecteur = flux.readable.getReader();
	const morceaux: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await lecteur.read();
		if (done) break;
		total += value.length;
		if (total > plafond) {
			await lecteur.cancel().catch(() => {});
			return 'plafond';
		}
		morceaux.push(value);
	}
	await ecriture;
	const sortie = new Uint8Array(total);
	let position = 0;
	for (const m of morceaux) {
		sortie.set(m, position);
		position += m.length;
	}
	return sortie;
}

/* ---------- base64url ---------- */

function versBase64url(octets: Uint8Array): string {
	let binaire = '';
	// Par paquets : `String.fromCharCode(...grand tableau)` dépasserait la pile.
	for (let i = 0; i < octets.length; i += 0x8000)
		binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
	return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `null` si le texte n'est pas du base64url strict. L'alphabet est vérifié AVANT le
 *  décodage : `atob` accepte `+` et `/`, et d'autres décodeurs ignorent en silence ce
 *  qu'ils ne reconnaissent pas — un lien abîmé passerait pour un autre. */
function depuisBase64url(code: string): Uint8Array | null {
	if (!/^[A-Za-z0-9_-]*$/.test(code) || code.length % 4 === 1) return null;
	const base64 = code.replace(/-/g, '+').replace(/_/g, '/');
	const binaire = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
	const octets = new Uint8Array(binaire.length);
	for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
	return octets;
}

/* ---------- CRC-32 (IEEE 802.3, celui de zlib) ---------- */

const TABLE_CRC = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(octets: Uint8Array): number {
	let crc = 0xffffffff;
	for (const o of octets) crc = TABLE_CRC[(crc ^ o) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}
