/* ============================================================
   Jeu de démonstration pour la frise de composition des dictées (#545).
   ------------------------------------------------------------
   À COLLER dans la console du navigateur, sur l'application ouverte, avec un profil
   déjà créé (le script écrit dans le profil ACTIF). Puis : Espace encadrant →
   Progression → bloc « Dictées ».

   Il écrit directement en localStorage, sans passer par l'application : c'est un
   outil de coup d'œil, pas un test. Il ÉCRASE l'état orthographe du profil actif —
   à n'utiliser que sur un profil de bac à sable.

   Quatre listes, choisies pour montrer les quatre cas que la frise doit distinguer :
   1. une liste travaillée régulièrement       → la frise bouge de colonne en colonne ;
   2. une liste maîtrisée AVANT le datage      → colonnes plates, aucune date inventée ;
   3. une liste tout juste commencée           → elle apparaît en fin de frise ;
   4. une liste jamais commencée               → pas de frise du tout, c'est voulu.
   ============================================================ */
/* Script de NAVIGATEUR, pas de Node : `eslint .` balaye tout le dépôt et ne connaît ici que
   les globales de Node, d'où cette déclaration plutôt qu'une exception dans eslint.config.js
   (la config du dépôt n'a pas à porter la trace d'un outil de coup d'œil). */
/* global localStorage, console */
(() => {
	const K = {
		profils: 'ludaskia_profiles',
		ortho: 'ludaskia_ortho',
		paliers: 'ludaskia_paliersOrtho',
		paliersDepuis: 'ludaskia_paliersOrthoDepuis',
		etapesDepuis: 'ludaskia_orthoEtapesDepuis',
	};

	const meta = JSON.parse(localStorage.getItem(K.profils) || 'null');
	const profil = meta && (meta.list || []).find((p) => p.uuid === meta.active);
	if (!profil) {
		console.error('Aucun profil actif : crée un profil dans l’application, puis relance.');
		return;
	}
	const cle = (k) => profil.uuid + '/' + k;

	/* Mercredi 10 h de la semaine située `n` semaines en arrière, jamais dans le futur.
	   Même notion de semaine que l'application (lundi 00 h, heure locale). */
	const MAINTENANT = Date.now();
	function semaine(n) {
		const d = new Date(MAINTENANT);
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lundi de la semaine courante
		d.setDate(d.getDate() - 7 * n + 2); // mercredi de la semaine visée
		d.setHours(10, 0, 0, 0);
		return Math.min(d.getTime(), MAINTENANT);
	}

	const banque = {};
	const motIdParForme = {};
	let seq = 0;

	/* Un mot à un rang donné. `etapes` = les franchissements DATÉS, dans l'ordre ;
	   `sansDate` rejoue le cas des mots d'avant #545 (booléens posés, aucune date). */
	function mot(forme, etapes, sansDate = false) {
		const id = 'demo-' + ++seq;
		const validation = { tuiles: false, motCache: false, dictee: false };
		const franchissements = {};
		let atelierFait = false;
		for (const [etape, quand] of etapes) {
			if (etape === 'atelier') atelierFait = true;
			else validation[etape] = true;
			if (!sansDate) franchissements[etape] = quand;
		}
		banque[id] = {
			id,
			mot: forme,
			entourage: [],
			atelierFait,
			validation,
			revision: { palier: 0, prochaineRevision: MAINTENANT, reussites: 0, dernierTest: null },
			origine: 'liste',
		};
		if (!sansDate && Object.keys(franchissements).length)
			banque[id].franchissements = franchissements;
		// Même clé de déduplication que `formeNormalisee` (store.ts) : sans le NFC, un mot
		// accentué saisi ensuite par le parent créerait un doublon au lieu de retrouver le sien.
		motIdParForme[forme.trim().normalize('NFC').toLocaleLowerCase('fr')] = id;
		return id;
	}

	const escalier = (...quand) =>
		['atelier', 'tuiles', 'motCache', 'dictee'].slice(0, quand.length).map((e, i) => [e, quand[i]]);

	// 1. Travaillée depuis deux mois, encore en cours : quatre mots au sommet, les autres
	//    échelonnés sur toutes les marches. C'est la liste qui montre le mouvement.
	const reguliere = [
		mot('bateau', escalier(semaine(8), semaine(7), semaine(6), semaine(5))),
		mot('château', escalier(semaine(8), semaine(7), semaine(6), semaine(5))),
		mot('gâteau', escalier(semaine(8), semaine(7), semaine(6), semaine(4))),
		mot('manteau', escalier(semaine(8), semaine(6), semaine(5), semaine(4))),
		mot('chapeau', escalier(semaine(8), semaine(6), semaine(3))),
		mot('rideau', escalier(semaine(8), semaine(6), semaine(3))),
		mot('troupeau', escalier(semaine(7), semaine(5), semaine(2))),
		mot('cadeau', escalier(semaine(5), semaine(2))),
		mot('drapeau', escalier(semaine(5), semaine(1))),
		mot('marteau', escalier(semaine(1))),
	];

	// 2. Maîtrisée AVANT l'arrivée du datage : les booléens sont là, aucune date ne l'est.
	//    La frise doit dire « déjà au sommet » sur les semaines suivies, et rien avant.
	const ancienne = ['sans', 'dans', 'chez', 'avec', 'pour', 'vers', 'sous', 'entre'].map((m) =>
		mot(m, escalier(0, 0, 0, 0), true),
	);

	// 3. Commencée cette semaine : la frise montre « tout neuf » jusqu'à l'avant-dernière
	//    colonne, puis le premier mouvement.
	const neuve = [
		mot('girafe', escalier(semaine(0))),
		mot('éléphant', escalier(semaine(0))),
		mot('crocodile', escalier(semaine(0), semaine(0))),
		mot('hippopotame', []),
		mot('rhinocéros', []),
		mot('perroquet', []),
	];

	// 4. Jamais commencée : aucun mot n'a bougé, donc AUCUNE frise (elle apparaîtra au
	//    premier atelier). La ligne se contente de son état « à découvrir ».
	const vierge = ['brouillard', 'orgueil', 'accueil', 'cueillir', 'écureuil'].map((m) =>
		mot(m, []),
	);

	const liste = (label, motIds, dateControle) => ({
		id: 'demo-liste-' + label.replace(/\W+/g, '-').toLowerCase(),
		label,
		dateControle,
		motIds,
		createdAt: semaine(9),
		updatedAt: MAINTENANT,
	});

	const listes = [
		liste('Dictée : les mots en -eau', reguliere),
		liste('Mots invariables (série 1)', ancienne),
		liste('Les animaux', neuve),
		liste('Sons difficiles : euil / ueil', vierge),
	];

	localStorage.setItem(cle(K.ortho), JSON.stringify({ banque, listes, motIdParForme }));

	// Borne du DATAGE : deux colonnes plus anciennes restent « inconnues », ce qui permet de
	// voir le bloc creux à côté des colonnes pleines. Sans elle, la frise se réduirait à sa
	// colonne du jour pour la liste 2, qui n'a aucune date à offrir.
	localStorage.setItem(cle(K.etapesDepuis), String(semaine(9)));

	// Journal des ÉTATS, pour que la méta datée de la ligne (« commencée le… », « acquise
	// le… ») s'affiche à côté de la composition : ce sont deux mesures distinctes, et c'est
	// justement leur cohabitation qu'on veut regarder.
	localStorage.setItem(cle(K.paliersDepuis), String(semaine(9)));
	localStorage.setItem(
		cle(K.paliers),
		JSON.stringify({
			[listes[0].id]: { enCours: semaine(8) },
			[listes[1].id]: { enCours: semaine(9), acquis: semaine(9) },
			[listes[2].id]: { enCours: semaine(0) },
		}),
	);

	console.log(
		`Jeu de démonstration écrit pour « ${profil.name} » : ${listes.length} listes, ` +
			`${Object.keys(banque).length} mots. Recharge la page, puis Espace encadrant → ` +
			`Progression → Dictées.`,
	);
})();
