/* ============================================================
   Séance partagée par lien (#734) : LIENS DE RÉFÉRENCE.

   Critères couverts :
   - 36 : chaque format partageable a un lien de référence, qui doit décoder à
          l'identique ;
   - 3  : un lien déjà émis affiche les mêmes items après une modification du
          contenu (banque enrichie, générateur modifié). Échec visé : un lien de
          référence commité ici ne décode plus à l'identique.

   Chaque référence associe un JSON ÉCRIT À LA MAIN (la forme qui voyage : figures
   et vues riches en RECETTE, cf. `envoiEnJson`) et un CODE COMMITÉ, produit une
   fois par le codec puis recopié tel quel. Ce sont les codes commités qui font
   référence : le test ne les régénère jamais.

   ON NE RÉGÉNÈRE JAMAIS UN CODE POUR FAIRE PASSER CE TEST. Un rouge ici veut dire
   qu'un lien déjà émis, peut-être déjà dans la messagerie d'une famille, ne se
   décode plus ou se décode autrement. La réponse est une nouvelle `VERSION_FORMAT`
   (`src/core/partage/codec.ts`), qui fait REFUSER explicitement les anciens liens
   (critère 29), pas un nouveau code qui masquerait la rupture.

   Ajouter une référence : écrire son `json`, laisser `code: ''`, lancer le test.
   Il échoue en affichant le code à recopier ; le recopier, relancer.

   Ce fichier ne passe pas par le catalogue ni par les générateurs : un lien émis
   ne doit justement plus en dépendre.
   ============================================================ */

import { describe, expect, it } from 'vitest';
import type { Exercise } from '../src/core/exercise';
import type { FigureSpec } from '../src/core/figures';
import type { Recette } from '../src/core/recette-fragment';
import { encoder } from '../src/core/partage/codec';
import { decoderEnvoi, envoiEnJson } from '../src/core/partage/envoi';
import { decoderResultat, type Resultat } from '../src/core/partage/resultat';

/* ---------- Formes JSON écrites à la main ---------- */

interface ExerciceJson {
	type: string;
	[champ: string]: unknown;
}

interface BlocJson {
	lecon: string;
	mode?: string;
	exercices: ExerciceJson[];
}

interface EnvoiJson {
	id: string;
	libelle: string;
	nature: 'lecon' | 'bilan' | 'dictee';
	blocs?: BlocJson[];
	[champ: string]: unknown;
}

interface Reference<J> {
	nom: string;
	json: J;
	/** Code commité. Vide : la référence est neuve, le test affiche le code à recopier. */
	code: string;
}

/** Les `type` de l'union `Exercise`. Le `satisfies` fait échouer le typecheck si un
 *  format entre dans l'union sans être listé ici ; le test de couverture plus bas
 *  échoue ensuite tant qu'il n'a pas sa référence. */
const FORMATS = {
	text: true,
	qcm: true,
	qcmMulti: true,
	tuilesNombre: true,
	tuilesOrdre: true,
	tuilesTri: true,
	appariement: true,
	clicMot: true,
	droiteGraduee: true,
	posed: true,
	tableauConversion: true,
	probleme: true,
	motCache: true,
	tuiles: true,
	dictee: true,
} satisfies Record<Exercise['type'], true>;

/** Les sortes de recette, même garde que `FORMATS`. */
const RECETTES = {
	figure: true,
	fraction: true,
	surlignage: true,
	aide: true,
	suite: true,
} satisfies Record<Recette['k'], true>;

/** Les sortes de figure (`FigureSpec['kind']`), même garde que `FORMATS` : une figure
 *  voyage en spec, donc le renommage d'un de ses champs casse les liens qui la portent. */
const FIGURES = {
	horloge: true,
	polygoneCote: true,
	quadrillage: true,
	quadrillagePaire: true,
	figurePlane: true,
	sceneFigures: true,
	cercle: true,
	solide: true,
	groupes: true,
	fractionBarre: true,
	fractionBande: true,
	fractionDemiDroite: true,
	fractionPaire: true,
	fractionSomme: true,
	fractionSuperieure: true,
	fractionCollection: true,
	grilleCentiemes: true,
	droiteGraduee: true,
	symJuger: true,
	symMiroir: true,
	symImage: true,
	angle: true,
	anglePair: true,
	angleNomme: true,
	diagrammeBarres: true,
	tableauDonnees: true,
} satisfies Record<FigureSpec['kind'], true>;

/* ---------- Envois de référence ---------- */

const ENVOIS: Reference<EnvoiJson>[] = [
	{
		nom: 'leçon text : horloge à lire (champHeure)',
		json: {
			id: 'Rf0hLg3kT9aQ',
			libelle: "Lire l'heure",
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'mes-lecture-heure',
					exercices: [
						{
							type: 'text',
							question: "Quelle heure indique l'horloge ?",
							answer: '3 h 45',
							answers: ['15 h 45'],
							figure: { k: 'figure', spec: { kind: 'horloge', heures: 3, minutes: 45 } },
							champHeure: true,
							parle: "Quelle heure indique l'horloge ?",
						},
						{
							type: 'text',
							question: "Quelle heure indique l'horloge ?",
							answer: '10 h 05',
							figure: { k: 'figure', spec: { kind: 'horloge', heures: 10, minutes: 5 } },
							champHeure: true,
						},
					],
				},
			],
		},
		code: 'AUVwrfH2rZA_T8MwFMS_inULiyslpBnwwsrQpYgNZXDd18Sq46T-A0WRvzuy2yIGJCTE9nx6d77fW6D3EHg-VMOmb44vD3ILDqN3ZAxBYKMdMXM3UHQEDitDHgQMqclmQb-RjBBQdA-OnZmUh3hdrgsCI_mVIZVtq1sKnckpreiyGT7mnBjoHMBxiuSDLtZtzCVYcTFt9_oUS5fJmakn9ggOaf07OQg0bGDr9kvJyajbi9hxHHRfei84QtxeHH4mVURt8xWuyeAof3qIhmPUNoY8r9uUONQgx_mpgIjgInHM0pVT_Vo38X-CrSs2sCrT_pWrrr6B_ciVutSlTw',
	},
	{
		nom: 'leçon text : périmètre sur quadrillage',
		json: {
			id: 'q7Zd-2mPw_Lx',
			libelle: 'Le périmètre',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'mes-perimetre-quadrillage',
					mode: 'saisie',
					exercices: [
						{
							type: 'text',
							question: 'Quel est le périmètre de cette figure, en carreaux ?',
							answer: '10',
							figure: {
								k: 'figure',
								spec: {
									kind: 'quadrillage',
									cols: 6,
									rows: 4,
									cells: [
										[1, 1],
										[2, 1],
										[3, 1],
										[1, 2],
										[2, 2],
										[3, 2],
									],
								},
							},
						},
					],
				},
			],
		},
		code: 'AUVsPgK0VZBLasMwGISvImatQO2WFrTpBbJotjWmKPI0iMqP6FG7GN-nPUcuVqS0i2wG5vuHYfhX2A4K56fXblf3L_PbfoGEs0c6RyjsKabLj7f95Tt6QmLQMfl8cTTjkIH9pE5QMKwhcXSjCVDN-hdQ6Bl2E73tGT1356Q7b53Tp9zWj13uCtoGmz0XemMNrw3xa8rXyCVC4pwYoi2Vh0QnGKJwN_NER2EYI8W7PSVPKTgIo72nTot4hoQewkwPheoOEtcU1IoPqH8nESaaAu1QfnOz2IwuQD1K-HEOUA8Shi6jpqlk1cqmLnpftJJ1IXUhddtu29Zu7fYL',
	},
	{
		nom: 'leçon text : intercaler (intervalle)',
		json: {
			id: 'Ab12Cd34Ef56',
			libelle: 'Intercaler un nombre',
			nature: 'lecon',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'num-encadrer-intercaler',
					exercices: [
						{
							type: 'text',
							question: 'Écris un nombre compris entre 610 000 et 620 000.',
							answer: '615 000',
							intervalle: [610000, 620000],
						},
					],
				},
			],
		},
		code: 'AUWZ6qTGRY9BTgMxDEWvEv11ipIpzSI7hFhwhqqLjMdIkTKe4klKUcUBOBcXQxkQyAtbz1__2zfkCREPox8ep_3908shwKLkkUthRDxLZaVUWE0TI8s8KsNCUm3a94VpkQ7yhVNDBM0eFmNZaEU83n4FEdLmHQulSVl3-c8VFnxlpUz8o6_v5-5b-Vph8dp4rXkz-Pokzev_FYaW-dwJS1U2wTvjnDNcTRi28Q4WSdY3VkQEf-gMFlv2JW3vHYN3zjkbht5OH72-AQ',
	},
	{
		nom: 'leçon text : chiffres romains (champRomain)',
		json: {
			id: 'XLVII-romain',
			libelle: 'Les chiffres romains',
			nature: 'lecon',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'num-chiffres-romains',
					exercices: [
						{
							type: 'text',
							question: 'Écris 47 en chiffres romains.',
							answer: 'XLVII',
							champRomain: true,
						},
					],
				},
			],
		},
		code: 'AUVENmHyZY9NCsIwFISvUmadCoIg5AaFrlyIIF2k8ZU-SNKaH62UHsBzeTGptbhw_c18zIzgCyRO5bEoct9ZxQ4ChmsyhiBRUsh0y03jKWQLDxBwKiY_c0O6mxuOb6QSJLTdQqA2nQ6Q5_EbkHDJ5qso_4loIK9Z0xKOj36WRhoiBK6JQuRP-_XUnkO222fk_vZsIKBcuJNfn0BAt8r2h-WQjD7RVE3V9AY',
	},
	{
		nom: 'leçon qcm : bande fractionnée, choix en fraction empilée',
		json: {
			id: 'frAc_sens_01',
			libelle: 'Les fractions',
			nature: 'lecon',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'num-frac-sens',
					mode: 'qcm',
					exercices: [
						{
							type: 'qcm',
							question: 'Quelle fraction de la bande est coloriée ?',
							answer: '3/4',
							choices: ['3/4', '1/4', '4/3'],
							choicesView: [
								{ html: { k: 'fraction', num: 3, den: 4 }, label: 'trois quarts' },
								{ html: { k: 'fraction', num: 1, den: 4 }, label: 'un quart' },
								{ html: { k: 'fraction', num: 4, den: 3 }, label: 'quatre tiers' },
							],
							figure: { k: 'figure', spec: { kind: 'fractionBande', num: 3, den: 4 } },
							explication: 'La bande est partagée en 4 parts égales, 3 sont coloriées.',
						},
					],
				},
			],
		},
		code: 'AUX1lz0XhZFNTsMwEIWvYr21S6mSlTcI1t2wYYOiynGmrYVjJ_6hoCoH6jl6MeQkKpFAsLE0M_7ezLw5QzcQ2PtHtQtkw-5-Aw6jazKGILClwPZeqqidDeCwMiafC4aUszmh30kmCKg2k7VxKkC8nucPAja1q6ywyvLgaF2T-V614KAP8kormpD42X2X-kQhd4XAc8rT3OZgDTEjWS1tQ4xCZMoZ5_X1QuwBHNKGE3kIFOsSHOro5gZzYjO-5bpAdau-aDqNIxxjayDOeBtNmfrlLVMLUXA0ZCHKgcPImgwEonc6sD5JHwMG_rfA5heBZCf6X7ic4WIB90lGTyxq8gFDxbHXh_E8s8QUcYSO1JjUtllIP2UHf2435Lt0Ris5-79dmt1JH-Uhm02WlWMY2PVykIYCZwULzi4uEu4wVEM1fAE',
	},
	{
		nom: 'leçon qcm : participe passé avec être, terminaison surlignée',
		json: {
			id: 'ppEtre-0042x',
			libelle: 'Le participe passé avec être',
			nature: 'lecon',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'fr-accords-participe-etre',
					exercices: [
						{
							type: 'qcm',
							question: 'Les filles sont … en vacances. (partir)',
							answer: 'parties',
							choices: ['parties', 'partis', 'partie'],
							choicesView: [
								{
									html: {
										k: 'surlignage',
										morceaux: [
											['part', false],
											['ies', true],
										],
									},
									label: 'parties',
								},
								{
									html: {
										k: 'surlignage',
										morceaux: [
											['part', false],
											['is', true],
										],
									},
									label: 'partis',
								},
								{
									html: {
										k: 'surlignage',
										morceaux: [
											['part', false],
											['ie', true],
										],
									},
									label: 'partie',
								},
							],
							choicesEmpilees: true,
							explication: "Avec être, le participe passé s'accorde avec le sujet : les filles.",
						},
					],
				},
			],
		},
		code: 'AUWYw40rpZI9bgIxEIWvYr0mieRFJErlLgUddRq0hTEDOJn9weMFIrRSThMpuQY3yUki76INRWhCNxo9f34zbw7wCxjU9SQGysbjx4c9NNjPiZlgMCVV2xC983WqRI6fym7JqeNXDASN0sYmJCWTq8rU8FuyDQxccQ-NOVdOYGaHk8BgGTLrXBUWkg3ojHoa7Sk476h_Ed_qRN64AhqbhiT6jjAlUUvPTKKkKqP6fv9QVKqtdbZ0JCN124HDHTRsKTsKacTUIoGGW1enL86aXTUUhHzQPXvadXbWsWCYA15hIE1gvyrtKrkuquDINnuYWY-EXloWyvUMHT2GhvK81WA7Jz4z0-r_Yi9Sr4HSRatofxcyKWrPlBaYxCm0mr2zp3CehuvQiv-4Hrnp06f-jpiUNC8UlVE8xDpCm7d5-wM',
	},
	{
		nom: 'leçon qcm : droite graduée en figure',
		json: {
			id: 'drt-10000-ab',
			libelle: 'Situer un nombre',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'num-situer-10000',
					exercices: [
						{
							type: 'qcm',
							question: 'Quel nombre est repéré par la flèche ?',
							answer: '4 300',
							choices: ['4 300', '4 030', '3 400'],
							figure: {
								k: 'figure',
								spec: {
									kind: 'droiteGraduee',
									min: 4000,
									max: 5000,
									pas: 100,
									bornes: [
										{ valeur: 4000, label: '4 000' },
										{ valeur: 5000, label: '5 000' },
									],
									reperes: [{ valeur: 4300, etat: 'neutre' }],
									desc: 'Droite graduée de 4 000 à 5 000, de 100 en 100.',
								},
							},
						},
					],
				},
			],
		},
		code: 'AUUFaN0KXVBBTsMwEPzKas4ucml68YULEmfEEeXgONvWwnFSxy5FVf7Ckb4jH0N2WxCcdj0zntndE2wLhTbExVJKKRe6gYCzDTvHUHixMXGg5Mn3XRMYAl7HFDLn2PQ-A_bAOkHB8D0EGtebEer1dBUo-NQtxmJ0CYEAHzkYa_gijB9DNtybDgL7xGO05eNzYncNJh4jBR7mc5jPNOhATtPGzV9mx_QAAe3Hdw5QqGhVIsyuvwb8QBXJVa4rqqRELbCx27LLCW9Qt5fAOLApoPWX6_Q28lPQbeJMd9ZDVVJKgU4fodalHfQItcxd0wd_3eygHadwUzvdsCsj5itM4pdf_-HXF74WCDxw-O-1ylqOOubbcoqBi7bl0UDhsUxL2zzufGZqmUoezZ9UjEWGllIS-1zuME1TPdXTNw',
	},
	{
		nom: 'leçon qcm : angle avec sa bulle d’aide (suite figure + aide)',
		json: {
			id: 'angLe_aigu_7',
			libelle: 'Les angles',
			nature: 'lecon',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'geo-angles',
					exercices: [
						{
							type: 'qcm',
							question: 'Cet angle est-il aigu, droit ou obtus ?',
							answer: 'aigu',
							choices: ['aigu', 'droit', 'obtus'],
							figure: {
								k: 'suite',
								parts: [
									{ k: 'figure', spec: { kind: 'angle', opening: 50, bisector: 70 } },
									{ k: 'aide', id: 'angle-aigu' },
								],
							},
						},
						{
							type: 'text',
							question: 'Comment se nomme cet angle ?',
							answer: 'ABC',
							figure: {
								k: 'suite',
								parts: [
									{
										k: 'figure',
										spec: {
											kind: 'angleNomme',
											spec: { opening: 110, bisector: 30 },
											points: ['A', 'B', 'C'],
										},
									},
									{ k: 'aide', id: 'angle-nommer' },
								],
							},
						},
					],
				},
			],
		},
		code: 'AUXmcYq7rZDBasMwEER_Rcx5AwmlBHQpSa6lP1BMkJWtu9SWHEtqU4L_vUh2TdNDT72J0czuvL1CTtAwrnnko5EmHbcgtFJz2zI0Hjko45qWAwjOxDRktWXrXRbknU2Chu02INSttwH6-TobNBr2qyXOFx6sWJ4s8bPPo862A-GcOEQpkQPHaaPiEFfSqtyK1GnwEpVPytcxBfUAgnHhg4fcXpoEgn318_RvpYRAKBlUhBdpCsEVb9AISSKD0JshTqWyOnsIoWdbrOLmG7VZ9j07cQ30_ZpQS2Ab_QC9XY8jTROMnLJRltSq9Bmr4pjBI1_iL3LfdeyiCqxcfiq7nOIGd7c_4B9QnvKOH38L12ZzA3a3Hgm9F1cGYwfCHoQDqj-AC8BQkKuxGr8A',
	},
	{
		nom: 'leçon qcm : symétrique d’un motif, choix en figure',
		json: {
			id: 'sym-drapeauV',
			libelle: 'La symétrie',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'geo-symetrie-axiale',
					exercices: [
						{
							type: 'qcm',
							question: "Quelle figure est le symétrique du drapeau par rapport à l'axe ?",
							answer: 'A',
							choices: ['A', 'B', 'C'],
							choicesView: [
								{
									html: {
										k: 'figure',
										spec: { kind: 'symImage', motif: 'drapeau', axis: 'v', t: 'reflet' },
									},
									label: 'figure A',
								},
								{
									html: {
										k: 'figure',
										spec: { kind: 'symImage', motif: 'drapeau', axis: 'v', t: 'glisse' },
									},
									label: 'figure B',
								},
								{
									html: {
										k: 'figure',
										spec: { kind: 'symImage', motif: 'drapeau', axis: 'v', t: 'tourne' },
									},
									label: 'figure C',
								},
							],
							figure: { k: 'figure', spec: { kind: 'symMiroir', motif: 'drapeau', axis: 'v' } },
						},
					],
				},
			],
		},
		code: 'AUXoWHmjtZA9bgIxEIWvYr0mjWlSuomAKlJSpKFBWxgzLKN414t_YFfId0mbc3CxyMuGCiVNUs6b8fs--QzeQiEMzWzrdUc6rSBheUPWEhRetAhDc_mMngkSrY7Jl9yScW0J-Eg6QcHQIyQ21pkAtT5PBwo1uVkYGioFM92ztqWHevKGDV1v49CVzoNpIHFIFCKPb99SsRA7rpMnQSEKSzedQyKxTWKyFp32wuuucz6Ky4ewD7on8QQJ3YYTeSjMIWH2bqKO4wISS1S3fMV0Go32sbFQZ7xD4YqHROjIjCG30589N7oum8ZF3kFhkinUngMUjpCIUPC0sxSRs4TVG7K3WjFHln_Pqy2HQPd4i3_hRZd8e5e3RK7kN-N34it7x_5nZM65ylX-Ag',
	},
	{
		nom: 'leçon qcm : ponctuation (variante)',
		json: {
			id: 'ponct-0ue5tu',
			libelle: 'La ponctuation',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'fr-gram-ponctuation',
					exercices: [
						{
							type: 'qcm',
							question: 'Où vas-tu',
							answer: '?',
							choices: ['.', '?', '!'],
							variante: 'ponctuation',
						},
					],
				},
			],
		},
		code: 'AUUblLdtVY87DsIwEESvAlPbCCHRuOECSBwApdiYBSw5duJPAEU5GDUXQ3FCQTvzdmZ2gLlAofVOJ7nNvE8ZAtbUbC1D4Uir4mVKxjsIOEo5TI5lPQumZ8pQ0LyDQG29jlDnYQEUrkHeAjXyP4efHLTRPLPp1U6ZnW4g0GWOhVI4fd6rnqIsq8jFBwcoHCCg7365xgaiSGtUAj0FQy7x76mlcKzGavwC',
	},
	{
		nom: 'leçon qcm : contraires (consigne, picto, écoute)',
		json: {
			id: 'contr-PetitG',
			libelle: 'Les contraires',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'fr-vocab-contraires',
					exercices: [
						{
							type: 'qcm',
							question: 'Le chat est petit.',
							answer: 'grand',
							choices: ['grand', 'minuscule', 'gros'],
							consigne: 'Quel mot veut dire le contraire de petit ?',
							picto: '↔',
							ttsItems: true,
							parle: 'Le chat est petit. Quel mot veut dire le contraire de petit ?',
						},
					],
				},
			],
		},
		code: 'AUXqUbi9lVA7TsQwFLyKNbVDQelmS4S0BdRoC8cZspYcO2s_B9AqLSfghJwEeTcCQUc7M28-7ww_wMClKLl7oHi5g0bwPUMgDPYs6kJan1mgEa3U3JhAl2ID_EJbmwdvodGH5ArM03kTGDznbknO9t0vH74yO-941crb3DxPboLGqbKIv9zuqdzRimIRNbd2N9Cwsbwww2DMNg7QcMe0OX1Dk4-1uBoIjTGngoNuI4sfYwt6rAxqSqIWVlGDz1SBP0PVwGuc2kFj9k4SDD7fP6AhUu6FU4GRXKkx27x96m9V9Y-U9bAe1i8',
	},
	{
		nom: 'leçon qcmMulti : propriétés du rectangle',
		json: {
			id: 'rect-props-1',
			libelle: 'Les figures planes',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'geo-figures-proprietes',
					exercices: [
						{
							type: 'qcmMulti',
							question: 'Coche toutes les propriétés de cette figure.',
							propositions: [
								'Elle a 4 angles droits.',
								'Elle a 4 côtés égaux.',
								'Ses côtés opposés sont égaux.',
								'Elle a 3 sommets.',
							],
							correctes: ['Elle a 4 angles droits.', 'Ses côtés opposés sont égaux.'],
							figure: {
								k: 'figure',
								spec: { kind: 'figurePlane', shape: 'rectangle', codage: true },
							},
							parle: 'Coche toutes les propriétés de cette figure.',
						},
					],
				},
			],
		},
		code: 'AUUJUCg0lZE9TgMxEIWvYr3aQeKncovoQEJKibZwvMPGwlk7HhsFRXug9NxgL4bGWSK6iM5-b-ab5_ERvodBJldWKcfEq1toBL-hEAgGz8Tq3Q81E6sU7EgMjdGWmsUN5OIogv8kW2Hg6A4amxAdw7wdlwKDgeJqwbQx2VNpKDpQdt7Rubx8JcHu3e6lhuKhsa_ExTfGY3RbUiXWQqyC5Gmg-VTmE6uelKNSaEl7Aw3xI3tpFzyeQiBl1YOy4yD9fY6-sFReHDd_N9p8Gmw9iLUmvqgxpchy4DiWPzVL-73iuNuRIDsNF7Nsla6Mvs7vNM5vgjniA-b3psGJXBP92F_0V_klMbe2LVNCtKmQTL0dCKbkStOkkWxuv_zP1U7d1E0_',
	},
	{
		nom: 'leçon tuilesNombre : comparer deux nombres',
		json: {
			id: 'cmp_452_425_',
			libelle: 'Comparer des nombres',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'num-comparer',
					mode: 'tuiles',
					exercices: [
						{
							type: 'tuilesNombre',
							question: '452 @ 425',
							answer: '>',
							tuiles: ['<', '>', '='],
							parle: 'Compare 452 et 425.',
						},
						{
							type: 'tuilesNombre',
							question: '615 000 < @ < 620 000',
							answer: '618 000',
							tuiles: ['618 000', '608 000', '621 000'],
							intervalle: [615000, 620000],
						},
					],
				},
			],
		},
		code: 'AUWlO8TIjZDdasQgEIVfRc61LUaiFNmWhd73BUIIxsyFYH5qzLZl2Xcv2rTZy-LNzJk531Gv8AMM3Lh0tZJdLVUHjuB7CoFg8DqPi40U2UArm-axj7SCY7Jpi3keyM1TFvyF7JZJJMHRh9mtMM11XzCYtvHB7TBwjPOQ7WnzoQDpk6Lzjn5M6Ws5pm8lFRzvG63JF1qtJDuzWipw2Gn9oAiDF_BfoGlwAi_KM1qOxcb757Dsp5QBj7jxfwTqSjEhBDuxMzsxLUXu7sN19bRLxxUOTYu_Slalajn8lChebPnoRldKCMG1FEKI9pbPNw',
	},
	{
		nom: 'leçon tuilesOrdre : ranger des nombres',
		json: {
			id: 'ranger-450ab',
			libelle: 'Ranger des nombres',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'num-ranger',
					exercices: [
						{
							type: 'tuilesOrdre',
							question: 'Range ces nombres du plus petit au plus grand.',
							tuiles: ['450', '405', '540', '504'],
							ordre: ['405', '450', '504', '540'],
							nature: 'nombres',
							parle: 'Range ces nombres du plus petit au plus grand.',
						},
					],
				},
			],
		},
		code: 'AUWbihgfjZBBisMwDEWvYv7aLWGwN75EoduShWOLYnCdjGyXGUruXuwE0mV3kv6T9KUXgocB23QnPik92AkSMUwUI8Hg2gXhKYs0PyamDIlkS-WmRnJzaoXwJFth4OgHElOcXYa5vXbAINXHadsBCfojdsHRhpT_pY0qNUTKF_ZMkPitlEvord2BcIcB4atYYs1ioRKKsHt2Z5v8GXKfBHOD0gMk1KAhoVWL9aAwSsx9TSO6tnFN27jx48Tj6sXy8ZLvDa3jOq5v',
	},
	{
		nom: 'leçon tuilesTri : champs lexicaux',
		json: {
			id: 'tri-merforet',
			libelle: 'Les champs lexicaux',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'fr-vocab-champs-tri',
					exercices: [
						{
							type: 'tuilesTri',
							question: 'Range chaque mot dans son thème.',
							categories: ['la mer', 'la forêt'],
							mots: [
								{ mot: 'vague', cat: 0 },
								{ mot: 'sapin', cat: 1 },
								{ mot: 'marée', cat: 0 },
								{ mot: 'écureuil', cat: 1 },
							],
						},
					],
				},
			],
		},
		code: 'AUXHZKMtbY8xbsMwDEWvIvxZLtqMOkOnoluRgVZoR4BkORRluAh6n6bX8MUK2w2yFNqe_n8krwgnOKiEJrF0WVhhEUPLMTIcXrkYf6Y0FhN5Dp7qDIuBtMr6HdnnYQVhYqpw8HyARRuzL3Af17-AQyfNlD21zS5rVAIseGbxwfOe1c9xdWoNkcv7FrhULho2wxsNPa-7XCqblNWcaCim5MHoeflO_AQLT8p9lrAJEckklvUcMl2W5UdxtEhZ93EpKxwm6ivvVbjnL3vnhcYw3PnLgyeS5fZfYbn5KlxDfJSO2_sF',
	},
	{
		nom: 'leçon appariement : familles de mots',
		json: {
			id: 'famille-dent',
			libelle: 'Les familles de mots',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'fr-vocab-familles-relier',
					exercices: [
						{
							type: 'appariement',
							question: 'Relie chaque mot à un mot de sa famille.',
							paires: [
								{ gauche: 'dent', droite: 'dentiste' },
								{ gauche: 'jardin', droite: 'jardinier' },
								{ gauche: 'lait', droite: 'laitière' },
							],
							intrus: ['danse'],
							parle: 'Relie chaque mot à un mot de sa famille.',
						},
					],
				},
			],
		},
		code: 'AUVgzni_jZA9bsMwDEavInyz3KGjz9Cpa-GBlpiEhSw7lBSkCHyXjL1HLlbIP0CydRPJjw-PukE8WhxokBC48RwzLIL0HAKjxQcnsw2T8WyGMSdYRMpF6zywG2NtyIWpoIXjd1j0YXQJ7ddtC7Q4aHMZHfXNTmuUg7DCgq-sThyvC_lnqmCaJlLhYRU6F05ZFtBnXTPuROey6JjH3ZS4vDybRLvuGywmEt2wRyruVMHbiV5HyXstKTNm-5T6JvUSn3Nrpxq_BAPJC67W8vhVxtxZSMxaqgA8xcToqpMuP_v_O-Zu7uY_',
	},
	{
		nom: 'leçon clicMot : verbe conjugué au passé composé',
		json: {
			id: 'clicVerbe-PC',
			libelle: 'Trouver le verbe',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'fr-gram-clic-verbe',
					exercices: [
						{
							type: 'clicMot',
							tokens: ['Les', 'enfants', 'ont', 'joué', 'dans', 'la', 'cour', '.'],
							cibleIndices: [2, 3],
							consigne: 'Clique sur le verbe conjugué.',
							explication: 'Au passé composé, le verbe a deux mots : « ont » et « joué ».',
							parle: 'Les enfants ont joué dans la cour.',
							cibleLabel: 'le verbe conjugué',
							explicationNommeCible: true,
						},
					],
				},
			],
		},
		code: 'AUV1iOCsXVC7bsMwDPwVgrOcId28FZkKpEWHoEvhQZaZQKksunoEKYJ8kNFPyBb_WEHFRdBu0t2Rd8cT2g5rNM6aNwotVa8rVOhsS84R1rgJnA8UwBEchEeFXqcchHNk2AtgD6SzbKElKmwdm4j1-2kW1LgN1S7ovhKX6ncNHSkYa-gmTV8DzTmeOaHCxB_khcM1RZH7rfZJXuyF33OeRlTYaS-g06jQcA6ocIGNQmNbR0--mx2W6kFA9tHuvDitnP3MBDHfu4Fhv8-7PI2Lkm9w1uhkS4XHDIOOcRrBcD9wnEZ1n9PQUT5CzylCDddvYJ_gegFK8ilJ4XqRpYMO5axrijA3KuKbRrqA0yA9RF06rHVLrlz7f8q_IV-472klE1inkOncnJvzDw',
	},
	{
		nom: 'leçon droiteGraduee : placer un nombre',
		json: {
			id: 'placer-370xx',
			libelle: 'La droite graduée',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'num-droite-entiers',
					exercices: [
						{
							type: 'droiteGraduee',
							min: 300,
							max: 400,
							pas: 10,
							graduations: [
								{ valeur: 300, label: '300' },
								{ valeur: 310, label: '310' },
								{ valeur: 320, label: '320' },
								{ valeur: 330, label: '330' },
								{ valeur: 340, label: '340' },
								{ valeur: 350, label: '350' },
								{ valeur: 360, label: '360' },
								{ valeur: 370, label: '370' },
								{ valeur: 380, label: '380' },
								{ valeur: 390, label: '390' },
								{ valeur: 400, label: '400' },
							],
							bornes: [
								{ valeur: 300, label: '300' },
								{ valeur: 400, label: '400' },
							],
							cible: 370,
							cibleLabel: '370',
							consigne: 'Place 370 sur la droite graduée.',
							explication: "Chaque graduation vaut 10 : 370, c'est 7 graduations après 300.",
							parle: 'Place 370 sur la droite graduée.',
							pasLabel: '10',
						},
					],
				},
			],
		},
		code: 'AUWuKlJtlZKxTsMwEIZfxbqFxUVOkzatVwaWDuyow8U9FUuOE-y4Cqr6PvAcfTHkpEjGMMB2uu_Xf6e7_wz6ABJ6g4rcoqzFOAIHoxsyhkDCDtnBdXogdnR4CNcPAg4Wh-AiNaQ6Gxv6RBhAgqIlcGhMpzzI5_NNIMGGdjH7LMgOmpwHDjSSU1rRLB3e-mg5qx7jMIqzWm1BlkJwaHEEWcWqRw-yEBymnXDQnZ09TmgouJveYEMGJJRCwIUnsEhhkcFlCpcZLFNYZrBKYZXBVQpXGVyncJ3BOoV1Bjcp3GRwm8Ltd1ilF6rihfYcms5Z-sclfzVRuonJmfae6l2yPAfVWa-PNr76KYaOlbVgPjhmfiTtfspIb7SaXgwSHl7wNdwEU4-dMAysEExGH87UHfmB1YnCM-zd9d2zUoho2KMzfx3eo_9aPsZkf9lfPgE',
	},
	{
		nom: 'leçon posed : addition posée avec retenues',
		json: {
			id: 'add-347p285A',
			libelle: "L'addition posée",
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'calc-addition-posee',
					exercices: [
						{ type: 'posed', op: '+', a: 347, b: 285 },
						{ type: 'posed', op: '+', a: 1208, b: 96 },
					],
				},
			],
		},
		code: 'AUXT55Vbfcw7DsIwEIThq6BpKNhI4CQQtqPnBiiFY29hyYqtPBAo8oE4BxdD5tHSznz6FzgLhra2KKtDVE19AsG7TrwXMM5rba2bXOhXMYzPh4DQ62ke8unFhD4P7ip6BsOIAqHzwYzgy_IFDKO9KX6hIoZRckduMhhn5GOne8zNfFoQQgRjA4IGl9WB0IFVUyf6K3dq27zpcZ_a1KYX',
	},
	{
		nom: 'leçon tableauConversion : conversion entière (tableau)',
		json: {
			id: 'conv-km-m-02',
			libelle: 'Les longueurs',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'mes-longueurs',
					mode: 'tableau',
					exercices: [
						{
							type: 'tableauConversion',
							question: '2 km = … m',
							answer: '2000',
							answerUnit: 'm',
							uniteConnue: 'km',
							colonnes: [
								{ unite: 'km', nom: 'kilomètre', transit: false, chiffres: '2' },
								{ unite: 'hm', nom: 'hectomètre', transit: true, chiffres: '0' },
								{ unite: 'dam', nom: 'décamètre', transit: true, chiffres: '0' },
								{ unite: 'm', nom: 'mètre', transit: false, chiffres: '0' },
							],
							parle: 'Deux kilomètres, combien de mètres ?',
						},
					],
				},
			],
		},
		code: 'AUVFHfsLlZE9TsQwEEavYk3tSFHKSIhiKWmpUArHmRAr9njxT1i0isRpEJxjb8JJ0IRAdiUK6Ozv83tjy0cwHdSgPU3F6ApXlBVIsKZFaxFquMUorKeHjDlEkEAq5cCFRe2JAzOhyqxAJlvrdYT6_rgeqMFhLM4NznfMJ9VaBiXgAYM2Gr-w9Lw_q3eeJgzRLKMeM8ZkFmklRieuxMfLq3AgQVF8wsB5WZY_-zsyiS8AEjKZhDtPlFk-cqS99UTr1KX_bsg7Xhrr3ektBQQJKSiKbOuVjShBD6bvA8NQwSw3wbAJBtTpF0MK-VJQXgg6tRm607tW_zZs_F-uX8LcSNirsHz3DeaD2F4epdDetQZJdCjWTFzD3MzN_Ak',
	},
	{
		nom: 'leçon tableauConversion : virgule placée par l’enfant (CM1)',
		json: {
			id: 'conv-cm-m-25',
			libelle: 'Les longueurs',
			nature: 'lecon',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'mes-longueurs',
					mode: 'virgule',
					exercices: [
						{
							type: 'tableauConversion',
							question: '250 cm = … m',
							answer: '2,5',
							answerUnit: 'm',
							uniteConnue: 'cm',
							colonnes: [
								{ unite: 'm', nom: 'mètre', transit: false, chiffres: '2' },
								{ unite: 'dm', nom: 'décimètre', transit: false, chiffres: '5' },
								{ unite: 'cm', nom: 'centimètre', transit: false, chiffres: '0' },
							],
							virguleApres: 0,
							virguleLibre: true,
						},
					],
				},
			],
		},
		code: 'AUX69cNAjZE9TsQwFISvEk3tSCFSmkgUaNttqVAKx3lZLNnPi38CaBWJ0yA4x96EkyCHsIFuO3vmzfdG9gl6QAvleCqVLW1ZNxAwuidjCC32FArj-JAo-QABljH5bBhSjrOgJ5IpI-wNBHrjVED7cFoHWlgK5V-CdUPOT9ofkiEI0At5pRX9xOLrMdtR9oZk2jmeyAe9rHpKFKJeoHVTFcoWt8XX23thISA5PJPPjmgu13vWMTeAQGIdaeeYEy1dIaCccczr2sVfZ9nZfDp_RJ_7RS85ZNAoTSAB9ajH0eccasxiyw5beDh_Kn0NoflHUBtBEcerCBXmTvw-591xEauLsNd9_q7oE83d3M3f',
	},
	{
		nom: 'leçon probleme : deux étapes avec calcul chaîné et euros',
		json: {
			id: 'pb-2etapes-A',
			libelle: 'Les problèmes à deux étapes',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'math-prob-deux-etapes',
					exercices: [
						{
							type: 'probleme',
							enonce: 'Léa achète 3 cahiers à 2 € chacun. Elle paie avec un billet de 10 €.',
							etapes: [
								{
									question: 'Combien coûtent les 3 cahiers ?',
									answer: 6,
									calcul: { op: 'x', a: 3, b: 2, uniteB: 'euro' },
									unite: 'euro',
								},
								{
									question: 'Combien la marchande lui rend-elle ?',
									answer: 4,
									calcul: { op: '-', a: 10, b: 6, uniteA: 'euro', uniteB: 'euro', deB: 0 },
									unite: 'euro',
								},
							],
							parle: 'Léa achète 3 cahiers à 2 € chacun. Elle paie avec un billet de 10 €.',
							explication: "On calcule d'abord le prix des cahiers, puis la monnaie rendue.",
						},
					],
				},
			],
		},
		code: 'AUVLO6rBtZE9bhwxDIWvQrBJo1ms14YLNYETpAuQAxhbcDQPGAEaSdGPM8FiG5_EpQ3kBinnJjlJoNld5MdpU5J8eN8jeWA7sObYdzsUicjdHSt2todzYM0fkSmm0LvleUKm5YkG1JmWl1XMir2UmprSwQTfGvYBUlmzwY4V9y6YzPr-cBZonqSMXfPsmlWHixNmJGMNTuryNTbXlY0Jbe6DN2um5UVIzLg8F9A1GRkt0pptRz8ev5EZxVS_oQ_OgaJYkDzAUPXUW-dQaABdbZt002xP_Mb8XJGLXUO-D1Nv4cmE5XuBL-SQf2O9ZcXi8xck1reKjThTHesDh8ia5zZlfa24Z71TXL0teMeaUVPg47nxq_4n2QlNkswofgC5ainBD117yx_0m1f07kS_2q742zPt7oL7O47ioRXbV7H2iqMk9x8uPkdnjZz3_eTptABoeCN9SAM1k2RnGpAvLEWx2rweJXjfCO0cFRs-7o_7408',
	},
	{
		nom: 'leçon probleme : partage avec figure de groupes',
		json: {
			id: 'pb-partage12',
			libelle: 'Les problèmes de partage',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'math-prob-partage',
					exercices: [
						{
							type: 'probleme',
							enonce: 'On range 12 œufs dans 3 boîtes, autant dans chaque boîte.',
							etapes: [{ question: "Combien y a-t-il d'œufs dans chaque boîte ?", answer: 4 }],
							parle: 'On range 12 œufs dans 3 boîtes, autant dans chaque boîte.',
							figure: { k: 'figure', spec: { kind: 'groupes', paniers: 3, total: 12 } },
						},
					],
				},
			],
		},
		code: 'AUX0jWIIrZE9TsQwEIWvMpqGxkFKlsoNBS0SB0Apxs5s1sKxvf4BVlFOwSWouMSKeyFng4Cect48fW9-ZjQDSgyqCRQzjdx2KNAaxdYySrznBCF6Zc_vEycYGDYfCnSUS6wmy9q7KphnpoISNVeKsl4nlI_zZpA4UT40Fdf8UPiVozaaL858CpW4RvK09p13umoPDiK5kaHt4POt7BMM5BLsQPnzR-YkgEomly-yPtCx8Na7rpxMYQs5Fk7ZrBPd-UkZdnACanJjLAxXv9h_IHCLAsmlF44ob5ZeYKBo_2GyvRnXO874hPK7EpgC61U0rr5ojL7UBWqsMxwTyp3A7DNZlG23LEu_9MsX',
	},
	{
		nom: 'leçon orthographe : motCache, tuiles et dictee',
		json: {
			id: 'ortho-ce2-s1',
			libelle: 'Mots invariables',
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'fr-ortho-invariables-1',
					exercices: [
						{ type: 'motCache', answer: 'ailleurs' },
						{ type: 'tuiles', answer: 'ainsi', lettres: ['s', 'i', 'a', 'n', 'i'] },
						{ type: 'dictee', answer: 'afin de', commeDans: 'afin de gagner la course' },
						{ type: 'dictee', answer: 'alors' },
					],
				},
			],
		},
		code: 'AUUU6x25fY69bsMwDIRfRbhZHppRa7P2CQoPtMwkBGip0E_SIvC7F4yD1l26EccP390dMiMgl3bJQ-TDUF_goTKxKiPgLbfqJF2pCE3KFR6JWi_2U445WSBXpo6AyAd4TJpjRXi_P4GAUxm2gp1osB7-5BIl8oa3rw_TLrm9UrwwPCjVGxcEkKhyLxWr_-Fal23QjkpVbD63Vh5S2N8isp2Pe9wpZomN_xadJLnZopiXhY-U6m_qznROXJySi7mXyvjfpdkWj-u4fgM',
	},
	{
		nom: 'bilan express à deux blocs',
		json: {
			id: 'bilan-dec-01',
			libelle: 'Bilan des nombres décimaux',
			nature: 'bilan',
			variante: 'express',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'num-dec-comparer',
					mode: 'tuiles',
					exercices: [
						{
							type: 'tuilesNombre',
							question: '3,4 @ 3,40',
							answer: '=',
							tuiles: ['<', '>', '='],
						},
						{
							type: 'tuilesNombre',
							question: '2,08 @ 2,1',
							answer: '<',
							tuiles: ['<', '>', '='],
						},
					],
				},
				{
					lecon: 'num-dec-egales',
					exercices: [
						{
							type: 'qcm',
							question: 'Quelle écriture est égale à 3,4 ?',
							answer: '3,40',
							choices: ['3,40', '3,04', '34'],
						},
					],
				},
			],
		},
		code: 'AUUd3XWWjZFNasMwEIWvIt56Ak7iRRFJG3KAQtchC1keWoEkO5KVuoTcpVufwxcrchOaFlq6Gpifb96bOcHUkKiMVX5Ws54VcxCsqdhahsQ2F0TNUfjGVYGjqMdBG6dSD4JXXQp8nQfhqIJRvssp7tvAMeYuc2SVIKFdhle20RFyd4Jl3XhI-OSm3bpxrQocQHBNnSFdMpYzg3sO2mj-HOze2q_q4yQMhEPi2JmJuKRSbMSSygIE5eMrB0isQVei3GEFwj0Ia-zP9A_mgoo7sRELmt8yV78yJ-pPi_ys_jB00O77zqeU_yDGQQeTTy04dmIcMkSM79mgeLhVc3GsX5oL-ppZUlHmUE7C9ucP',
	},
	{
		nom: 'dictée prédéfinie (niveau ce2, mot avec commeDans)',
		json: {
			id: 'dictee-ce2-3',
			libelle: 'Dictée de la semaine',
			nature: 'dictee',
			niveau: 'ce2',
			mots: [
				{ mot: 'bateau' },
				{ mot: 'mer', commeDans: 'la mer est bleue' },
				{ mot: "aujourd'hui" },
				{ mot: 'arc-en-ciel' },
			],
		},
		code: 'AUUxvEYwTcs9DsIwFAPgq0ReWJKlbJl7C8TwmljioSSV8sNS9UCcg4uhDqBu1md7g0Z4RA2ddIGTu8Ii6cKUCI9ZQ_-8aSJNEtOYRQthUaSPyv_zEH1RBjwCJ1jktTf423YEeCzSj3a3P8issAhrzpylNHgkMZnVsHWzJA6exjKe66jx8hh61hociwvKhP2-fwE',
	},
	{
		nom: 'dictée personnalisée (sans niveau, verbe en contexte)',
		json: {
			id: 'perso-Verbes',
			libelle: 'Mes verbes',
			nature: 'dictee',
			mots: [
				{ mot: 'mangeons', contexte: { avant: 'nous', apres: ' une pomme' } },
				{ mot: 'finissaient', contexte: { avant: 'ils', apres: ' leurs devoirs' } },
				{ mot: 'jardin' },
			],
		},
		code: 'AUX_qFwodYwxCgIxFESvEqZeL5A72NqIRdYd5Uvys-Qni7Dk7pJiQQu74b3h7ZAFHiuL5dOFZaZhQpSZMRIeZ5rbDqyhtjLoIvdKYkLK1eCv-xjwSEGfzDq-96yV70r4HWELOrTmNlRYCw0erindmlMiep-OxkNUzIJQ65-MxJ9KZCvmFm5Zin2XXqEsoui3_gE',
	},
	{
		nom: 'leçon clicMot : groupe sujet à délimiter (segment)',
		json: {
			id: 'clicSujetSeg',
			libelle: 'Le groupe sujet',
			nature: 'lecon',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'fr-gram-clic-sujet',
					exercices: [
						{
							type: 'clicMot',
							tokens: ['Le', 'petit', 'chat', 'noir', 'dort', 'sur', 'le', 'canapé', '.'],
							cibleIndices: [0, 1, 2, 3],
							consigne: 'Montre le groupe sujet : touche son premier mot, puis son dernier mot.',
							explication: "Le groupe sujet est « Le petit chat noir » : c'est lui qui dort.",
							parle: 'Le petit chat noir dort sur le canapé.',
							cibleLabel: 'le groupe sujet',
							explicationNommeCible: true,
							segment: true,
						},
					],
				},
			],
		},
		code: 'AUWKmTCeXZE9TgNBDIWvYrmhmUQEum2pkDY0KVGK2VmzMcwf84NAUQ6EOAJduBjyZCNBSvu9sd833iOP2KGxbDb1mcqGJlRoeSBrCTvsCaYUaiTIIqNCr0tNIlkywUuD30hXGeJWqHCwwWTsHvezocOntJiSdgtZsjiPoXdKhg2drOUj0hxjHUQu4YW8aNgTKoxUWNpmp1uGwAkVjiFJlasUVnxGex1_PlHhErcKDQ-W7v0477lWK3WjbkUIPvPkZec6-JII7H9Q6KCEanYEOXiIiRxTAheKglg5t-5Iyc_dZSOKlo0u3KAvPg4oFzh-QU_QWEBIQDjg-A0dmCsx2MrwWhkETEZGnc5XuHwlFsg1SfCZWl404l4PZNuFLo_3J-NDcI7uxI5dSZUUZpoc-XIqD9vD9vAL',
	},
	{
		nom: 'leçon tuilesOrdre : ordre alphabétique (sans nature)',
		json: {
			id: 'alpha-init-1',
			libelle: "L'ordre alphabétique",
			nature: 'lecon',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'fr-vocab-alpha-initiale',
					exercices: [
						{
							type: 'tuilesOrdre',
							question: "Range ces mots dans l'ordre alphabétique.",
							tuiles: ['pomme', 'banane', 'cerise', 'abricot'],
							ordre: ['abricot', 'banane', 'cerise', 'pomme'],
						},
					],
				},
			],
		},
		code: 'AUUdPs5sbY5NSgNBEIWv0ryNmx5Bl30GQXAbsqiuKbWgp3vSP0EJHijnyMWkJhE3oTaPx8f36gSdEUBp_aRJs_bpCR5Jo6QkCHh5KHWu4jYgXs5dD0PgkamPakASLtkKPQoNBLA8wyOmwg1hd7oBAe91OhamOP1vKSVzyZdUVpYr379X8_ahSdqrjcPjMKR13TxvlD_EsTS3lN7cTLm5dO_LR_ibBWGHtSyLmSJlyhZYqjYLFKty6dh7bBaj_7p7_NW0_7H7BQ',
	},
	{
		nom: 'leçon text : grille de centièmes',
		json: {
			id: 'grille-37-cc',
			libelle: 'La grille des centièmes',
			nature: 'lecon',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'num-dec-grille',
					exercices: [
						{
							type: 'text',
							question: 'Quelle part de la grille est coloriée ? Écris-la avec un nombre décimal.',
							answer: '0,37',
							figure: { k: 'figure', spec: { kind: 'grilleCentiemes', parts: 37 } },
						},
					],
				},
			],
		},
		code: 'AUUJh06bRVC7TsRAEPuVkesNAqWItA0FLQ01umIzGU4jNptjH8ehKB_An3DfkR9Dm_Aox2NbtmfoAItjVO-labuGGQZee_FeYPHoaP_RIIlYQtb1a5QEg-ByiZXjhadQAT2LK7Dg8Q4GvZ84wT7PPwSLUMZmEG52RxjIRSIry07LH6dql-WSYfBWJGXddE-lpqGTi5kGIf-XSVImnvwUdb0K3dP6yVFT4x25szCVQGEa-yg0rFfW0fkbGLiQ3iXC4ta0HQxe9Lj1mPEK-3sZpJPwBmr4X-ihDiB7_xonwbbdsiyH5bB8Aw',
	},
	{
		nom: 'bilan complet des fractions (six figures de fraction)',
		json: {
			id: 'bilan-frac-C',
			libelle: 'Bilan des fractions',
			nature: 'bilan',
			variante: 'complet',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'num-frac-sens',
					exercices: [
						{
							type: 'text',
							question: 'Quelle fraction de la barre est coloriée ?',
							answer: '2/5',
							figure: { k: 'figure', spec: { kind: 'fractionBarre', num: 2, den: 5 } },
						},
					],
				},
				{
					lecon: 'num-frac-collection',
					exercices: [
						{
							type: 'text',
							question: 'Combien de jetons font le tiers de cette collection ?',
							answer: '4',
							figure: {
								k: 'figure',
								spec: { kind: 'fractionCollection', num: 1, den: 3, parGroupe: 4 },
							},
						},
					],
				},
				{
					lecon: 'num-frac-egalites',
					exercices: [
						{
							type: 'qcm',
							question: 'Les deux fractions coloriées sont-elles égales ?',
							answer: 'oui',
							choices: ['oui', 'non'],
							figure: {
								k: 'figure',
								spec: { kind: 'fractionPaire', haut: [1, 2], bas: [2, 4] },
							},
						},
					],
				},
				{
					lecon: 'num-frac-addition',
					exercices: [
						{
							type: 'text',
							question: '1/5 + 2/5 = ?',
							answer: '3/5',
							figure: { k: 'figure', spec: { kind: 'fractionSomme', a: [1, 5], b: [2, 5] } },
						},
					],
				},
				{
					lecon: 'num-frac-superieure',
					exercices: [
						{
							type: 'qcm',
							question: 'Cette fraction est-elle plus grande que 1 ?',
							answer: 'oui',
							choices: ['oui', 'non'],
							figure: {
								k: 'figure',
								spec: { kind: 'fractionSuperieure', num: 5, den: 4 },
							},
						},
					],
				},
				{
					lecon: 'num-frac-encadrer',
					exercices: [
						{
							type: 'text',
							question: 'Quelle fraction est repérée par le point ?',
							answer: '7/4',
							figure: {
								k: 'figure',
								spec: { kind: 'fractionDemiDroite', num: 7, den: 4, unites: 3 },
							},
						},
					],
				},
			],
		},
		code: 'AUXo-aEstZTbahsxEIZfZZjbyhgfloCgFOJAb3rRksvgC6127KjVSmsdUhfjB_Jz-MXKyKcsxCUO9GrZGenX_2lmtEHToMTaWOUGi6D0YIYCranJWkKJ95yAhiJwMhnvIgp0KuVAp30o8EUFo1zikPZtZynxKvNCKnOoHaHA2nodUT5t0JL2DiW63B7OjFRkaU1BG02HVelPx3qJ1iy2yhT5eJT4I7O5syFoCKyCWoVAQDGB9tYHs98RfEGBysXfFFDieFihwIVZFusb_IXy9CcwdqRL0Di-j5P2PYsySm5RjgU25FBW2-12vhVvcGhvLZWN76eZ-bY2VCh-UvIuwsK7BJYgGQqR45pSIriI97mmN1PNXtssaKMj2kRgp8LX4DO7nV4FpaWyJtHVoq1026f8RkyS15c2upQpQvQuDbioEfa7peJvD9FngwL1sz-ecww473B-K_x3ZUr6WeWE8mkkxnOBtWLZsZjOryKrpjG3VXY0rOATjIcVfO7jTD7QiY--bTmtiueKPRfH1XXHMXcUDB1k31emWem082RRPJQFOpsjLINyDcEqE4z-X30eX7suzVkdm_Mf7ei0agKFj78h_G4E6va7wO9GpwIPYOeNS33Su-Ht4_ZArXkI3qQz0d2JSGB2ZY7kpMDNt38B',
	},
	{
		nom: 'bilan complet de géométrie (scène, cercle, solide, symétrie, paire d’angles)',
		json: {
			id: 'bilan-geo-CE',
			libelle: 'Bilan de géométrie',
			nature: 'bilan',
			variante: 'complet',
			niveau: 'ce2',
			blocs: [
				{
					lecon: 'geo-figures-reconnaitre',
					exercices: [
						{
							type: 'qcm',
							question: 'Combien de triangles vois-tu ?',
							answer: '2',
							choices: ['1', '2', '3'],
							figure: {
								k: 'figure',
								spec: {
									kind: 'sceneFigures',
									cells: [
										{ shape: 'carre' },
										{ shape: 'triangle', rotation: 30 },
										{ shape: 'rectangle' },
										{ shape: 'triangleRectangle', rotation: 90 },
										{ shape: 'losange', rotation: 45 },
									],
								},
							},
						},
					],
				},
				{
					lecon: 'geom-cercle',
					exercices: [
						{
							type: 'qcm',
							question: "Comment s'appelle le segment tracé en couleur ?",
							answer: 'le rayon',
							choices: ['le rayon', 'le diamètre', 'le centre'],
							figure: { k: 'figure', spec: { kind: 'cercle', segment: 'rayon', label: '3 cm' } },
						},
					],
				},
				{
					lecon: 'geo-solides-reconnaitre',
					exercices: [
						{
							type: 'qcm',
							question: 'Quel est ce solide ?',
							answer: 'un pavé droit',
							choices: ['un pavé droit', 'un cube', 'un cylindre'],
							figure: {
								k: 'figure',
								spec: { kind: 'solide', solid: 'pave', orient: { mirror: true, lean: 1 } },
							},
						},
					],
				},
				{
					lecon: 'geo-symetrie-axiale',
					exercices: [
						{
							type: 'qcm',
							question: 'La droite tracée est-elle un axe de symétrie de la figure ?',
							answer: 'oui',
							choices: ['oui', 'non'],
							figure: { k: 'figure', spec: { kind: 'symJuger', shape: 'papillon', axis: 'v' } },
						},
					],
				},
				{
					lecon: 'geo-angles',
					exercices: [
						{
							type: 'qcm',
							question: 'Quel angle est le plus grand ?',
							answer: 'angle 2',
							choices: ['angle 1', 'angle 2'],
							figure: {
								k: 'figure',
								spec: {
									kind: 'anglePair',
									a: { opening: 40, bisector: 90, ray: 110 },
									b: { opening: 70, bisector: 90, ray: 60 },
									labels: ['angle 1', 'angle 2'],
								},
							},
						},
					],
				},
			],
		},
		code: 'AUWygO1dnVRLjhMxEL2KVRs2bilhBtB4g8QIFogFsEVZVLuLHgu33eNPSBT1fcg5cjFUdgJpCNKEnf3q1e-5yjswHShojUXX9OSb-7cgwZqWrCVQ8IYNoiPRH_Z-OOxTMAQSHKYc6OQIEtYYDLrEkPbDaCkxy6wJM0P0HCS01usI6ssOLGnvQAEn_Gr6HCg2gTGHJgVOQBsK2miq_LQdOfKjHkDCY6aYTPG_90NrqNSXOH9vKYq1N7FJWbwGCejidwqggPPrB3-MCEuQBbqBlYRaAagdfAN1ukmII-kCGscSRU2O3tViORhZW4uLD1iq0xgCwSR_I6eaQELwCWvRN4tzSiCdKueS4-df1vMId7MI1kd0_Zxx-2JaTdO0Yt6Z1kOjKWh7lb4DuSTiMxxHnghhSUTqC5gC6sNekBPaZ0s5zBW3JAJuvZsLf4ZaEp3B4fCjvrglocnx-clP8qubY0ms5yk4tmRBwY3QA1yQoonemu4_x-5TJisoJqFJ1Djz1rMTI64Pe9EFb9JcgL9s2QmdWzqetta47hoNan7G-QAKRlzz1QdTFNnBYELwAVQKmVhmdKCW00VNtgPxgje4MXjFmHzA2g0dZ4JYnKbMS3YCN8QLGrfH74MvFkVtaC6cz2auVgWcd1cIsh3e554CW44rMuJorC1zgRsTQcH64kzUD-S6MSg-ZRgsidHmKPqArpv3VUl__EEVXBZeNT-5x-LwEQ03iYz7kZxxPajbhYTWRNKJn_xuIXkjQC2Xi0lCO6O-ukx9ycyyPv-qski3mn4C',
	},
	{
		nom: 'bilan express des mesures (polygone coté, paire de quadrillages)',
		json: {
			id: 'bilan-mes-X1',
			libelle: 'Bilan des mesures',
			nature: 'bilan',
			variante: 'express',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'mes-perimetre-cotes',
					exercices: [
						{
							type: 'text',
							question: 'Quel est le périmètre de ce rectangle, en cm ?',
							answer: '20',
							figure: {
								k: 'figure',
								spec: {
									kind: 'polygoneCote',
									points: [
										[0, 0],
										[120, 0],
										[120, 80],
										[0, 80],
									],
									labels: ['6 cm', '4 cm', '6 cm', '4 cm'],
								},
							},
						},
					],
				},
				{
					lecon: 'mes-aire-perimetre',
					exercices: [
						{
							type: 'qcm',
							question: 'Quelle figure a la plus grande aire ?',
							answer: 'B',
							choices: ['A', 'B', 'les deux ont la même aire'],
							figure: {
								k: 'figure',
								spec: {
									kind: 'quadrillagePaire',
									a: {
										cols: 5,
										rows: 4,
										cells: [
											[1, 1],
											[2, 1],
											[3, 1],
											[1, 2],
											[2, 2],
											[3, 2],
										],
									},
									b: {
										cols: 5,
										rows: 4,
										cells: [
											[1, 0],
											[1, 1],
											[1, 2],
											[2, 2],
											[3, 2],
											[1, 3],
											[2, 3],
										],
									},
									mode: 'aire',
									labels: ['A', 'B'],
								},
							},
						},
					],
				},
			],
		},
		code: 'AUXbzbCBjZHBbtQwEIZfZfSfZ6VNtiCUC6K8AL1VinJwnCFYOHbWdtqtVnkf4DX2xZCdVksRCC4e-5-Z3_Y3Z5gBDXpjldtNEnf3FRjW9GKtoMFtTtAgkSaJS5AIhlNpCfLSBcaDCka5lCU5zUFiqTIPohY00FO27K3XEU17hhXtHRrk22YJZpIUZKd9KuZykqCNlq02Pc3ZNckpgXFcJCZTmu8WsSQxkRWaL9-DmS7fUhAahLRQEJ2UG60wiSM90XswlIuPEtCg3oPx2YzlE2d8RfNyYsRZdBGNy1xmb59G7-SjTzk7e-NSflm7533HbVVf47u8KaFjWNWLzYV4S3oC42YLv566dV27lV8DUSbIlcrfeByLy284rND2DVJkFc12iTQG5Qah7PqawS0Y-ot_NsYHcJGsRBpkOZF3KZtMlx_T1o7uf5kdFzUEY60a5VPpZKic1j4TecMI_jGiuWFosQVSW3HVcVuX9VDWiuui1EWpu25l9P90KbP4Y39WDkU5FK_JDxnk8_uu49pAbKPp1p8',
	},
	{
		nom: 'bilan express des données (diagramme en barres, tableau à double entrée)',
		json: {
			id: 'bilan-donn-1',
			libelle: 'Bilan des données',
			nature: 'bilan',
			variante: 'express',
			niveau: 'cm1',
			blocs: [
				{
					lecon: 'donnees-barres-lire',
					exercices: [
						{
							type: 'text',
							question: 'Combien de billes Tom a-t-il ?',
							answer: '8',
							figure: {
								k: 'figure',
								spec: {
									kind: 'diagrammeBarres',
									titre: 'Nombre de billes',
									barres: [
										{ label: 'Léa', valeur: 12 },
										{ label: 'Tom', valeur: 8 },
										{ label: 'Sami', valeur: 15 },
										{ label: 'Inès', valeur: 10 },
									],
									pas: 5,
									max: 20,
									desc: 'Diagramme en barres : le nombre de billes de quatre enfants.',
								},
							},
						},
					],
				},
				{
					lecon: 'donnees-tableau-lire',
					exercices: [
						{
							type: 'text',
							question: 'Combien de livres Tom a-t-il lus en novembre ?',
							answer: '6',
							figure: {
								k: 'figure',
								spec: {
									kind: 'tableauDonnees',
									caption: 'Livres lus',
									colonnes: ['septembre', 'octobre', 'novembre'],
									lignes: [
										{ entete: 'Léa', valeurs: [3, 5, 2] },
										{ entete: 'Tom', valeurs: [4, 1, 6] },
									],
									coinLabel: 'Élève',
								},
							},
						},
					],
				},
			],
		},
		code: 'AUVCpJ-gnVJBbtswEPwKMWeqiJ06CHgpkOZSwMiluRU6rOiNQZQiFZJSXRh6QH-SvEMfK0jZjZxT0Bu5M9yd2eERZgeFxlhy1c47V60gYU3D1jIU7jIgdhxFBqdXjpBwlPrA52eQGCgYcimX-NAFjoVlBqYeCrrNPRvrdYT6cYRl7R0UckfmWDUUAsfKmsCQ4AMHbTTP3PS7y10THxIknnuOyZTHX33bGM7SRGOs5SgefSuoSpWx4gskyMVfHKBwC4knsy-Kj_gJdb5JxI51KRqXt7AztA_UtnxXFEEimVSMPvi2Cfw2LPuZOcUQNWyhsJ1eqWzDch-gVutRvoGPvl1gt0voO7Vm-W6zBL-56SUu0auxlugoQm0kWjpAra8kdhw1FO7PFgQ7MUsUSlgW7p2DfHruKYXMfCKX4ieM41iX0e8CStRYpv7_E7JmCJcJ2T5mhc4PXHRdJHbz4cROyu5noZDQ1J3Gb-eZti9lbzMlK0bkLpWhkPA6-fl0VoI6f_-9O7ljl7j864tsM3YtN3Jd1vWPs4w4Uz7Llbypc1zaG7c9BTr9sdPLwPO26_Ev',
	},
];

/* ---------- Résultat de référence ---------- */

const RESULTATS: Reference<Resultat>[] = [
	{
		nom: 'résultat aux quatre statuts (juste, faux, jnsp, vide)',
		json: {
			id: 'res-Lea-0001',
			envoi: { id: 'Rf0hLg3kT9aQ', libelle: "Lire l'heure", niveau: 'ce2' },
			pseudo: 'Léa',
			date: 1791390600000,
			reponses: [
				{
					lecon: 'mes-lecture-heure',
					enonce: "Quelle heure indique l'horloge ? (horloge : 3 h 45)",
					saisie: '3 h 45',
					attendue: '3 h 45',
					statut: 'juste',
				},
				{
					lecon: 'mes-lecture-heure',
					mode: 'saisie',
					enonce: "Quelle heure indique l'horloge ? (horloge : 10 h 05)",
					saisie: '1 h 50',
					attendue: '10 h 05',
					statut: 'faux',
				},
				{
					lecon: 'mes-lecture-heure',
					enonce: "Quelle heure indique l'horloge ? (horloge : 7 h 30)",
					saisie: '',
					attendue: '7 h 30',
					statut: 'jnsp',
				},
				{
					lecon: 'mes-lecture-heure',
					enonce: "Quelle heure indique l'horloge ? (horloge : 12 h 15)",
					saisie: '',
					attendue: '12 h 15',
					statut: 'vide',
				},
			],
		},
		code: 'AVJqnBfLtdDPSgMxEAbwVxm-iwpZyHatZXPxBXqpeBMPcTPtRtOkbpIilH0gn8MXk-0f6F4qFMwpTL6Z-ZEdrIFCx7GYsy6klCUE2G-DhdodHp-Wsp2vqo_nWi8g4OwbO8dQmNuOyd20nDuGgLdb1hkKDU_QC2wiZxOG3M-3hoDRiaHKWV1WtXyQwxHoeBN85Aj1soPjJngorDkWjpuUOy5O09kH3wxbF3lYT_s6WW_sZ94rQufCiumRbk9XRRW1dD-9g0DUNtqh_VCCgE6JvcmjWkw65QSF9xwToxeXTetghvbj7CuNpaSW5BhZUktTOUYec-fKpc5ffyKvQs2opUqOTGPNITD6Mh83_4MpJ9RSOb2gOSbOOVtrGP1r_ws',
	},
];

/* ---------- Tests ---------- */

describe('liens de référence (#734, critères 3 et 36) : un lien déjà émis se relit à l’identique', () => {
	describe('envois', () => {
		for (const ref of ENVOIS) {
			it(ref.nom, async () => {
				if (ref.code === '') {
					expect.fail(
						`Référence neuve « ${ref.nom} » : recopier ce code dans la table\n${await encoder('envoi', ref.json)}`,
					);
				}
				const lu = await decoderEnvoi(ref.code);
				expect(lu, 'le lien commité est refusé par le décodeur').toMatchObject({ ok: true });
				if (!lu.ok) return;
				expect(envoiEnJson(lu.valeur)).toEqual(ref.json);
			});
		}
	});

	describe('résultats', () => {
		for (const ref of RESULTATS) {
			it(ref.nom, async () => {
				if (ref.code === '') {
					expect.fail(
						`Référence neuve « ${ref.nom} » : recopier ce code dans la table\n${await encoder('resultat', ref.json)}`,
					);
				}
				const lu = await decoderResultat(ref.code);
				expect(lu, 'le lien commité est refusé par le décodeur').toMatchObject({ ok: true });
				if (!lu.ok) return;
				expect(lu.valeur).toEqual(ref.json);
			});
		}
	});
});

describe('couverture de la table de références (critère 36)', () => {
	it('chaque format de l’union Exercise a au moins une référence', () => {
		const couverts = new Set(
			ENVOIS.flatMap((ref) => ref.json.blocs ?? []).flatMap((bloc) =>
				bloc.exercices.map((ex) => ex.type),
			),
		);
		const manquants = Object.keys(FORMATS).filter((type) => !couverts.has(type));
		expect(manquants).toEqual([]);
	});

	it('chaque sorte de recette a au moins une référence', () => {
		const texte = JSON.stringify(ENVOIS.map((ref) => ref.json));
		const manquantes = Object.keys(RECETTES).filter((k) => !texte.includes(`"k":"${k}"`));
		expect(manquantes).toEqual([]);
	});

	it('chaque sorte de figure a au moins une référence', () => {
		const texte = JSON.stringify(ENVOIS.map((ref) => ref.json));
		const manquantes = Object.keys(FIGURES).filter((k) => !texte.includes(`"kind":"${k}"`));
		expect(manquantes).toEqual([]);
	});

	it('chaque nature d’envoi et chaque variante de bilan a au moins une référence, et le résultat aussi', () => {
		const natures = new Set(ENVOIS.map((ref) => ref.json.nature));
		expect([...natures].sort()).toEqual(['bilan', 'dictee', 'lecon']);
		const variantes = new Set(
			ENVOIS.map((ref) => ref.json.variante).filter((v) => v !== undefined),
		);
		expect([...variantes].sort()).toEqual(['complet', 'express']);
		expect(RESULTATS.length).toBeGreaterThan(0);
	});
});
