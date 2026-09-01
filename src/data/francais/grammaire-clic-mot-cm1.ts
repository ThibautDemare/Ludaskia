/* ============================================================
   Grammaire — « Clique sur le mot » : les cinq natures du CM1 (#437).
   ------------------------------------------------------------
   Une section par nature, chacune avec sa banque, sa consigne, son libellé de cible et
   ses INTERDITS D'AMBIGUÏTÉ documentés au fil du texte :
   - conjonction de coordination (« ni … ni » = cible double non adjacente) ;
   - sous-catégories de déterminant (article / possessif / démonstratif, tâche variable
     d'un item à l'autre) ;
   - pronom personnel sujet vs complément (tâche variable elle aussi) ;
   - nom noyau d'un groupe nominal développé ;
   - sujet, sujet composé de deux noms propres compris (cible double non adjacente).
   Les natures CE2 des mêmes classes de mots vivent dans `grammaire-clic-mot-ce2.ts` ;
   moteur, garde-fous génériques et vocabulaire partagé (`DET_SETS`, `PRON_*`) dans
   `grammaire-clic-mot-moteur.ts`.
   ============================================================ */
import {
	DET_SETS,
	PRON_COMPL,
	PRON_COMPL_STRICT,
	PRON_SUJET,
	PRON_SUJET_STRICT,
	phraseMots,
	tokeniser,
	type PhraseClicMot,
	type RolePron,
	type SousCatDet,
} from './grammaire-clic-mot-moteur';

/* ============================================================
   Leçon A — Conjonctions de coordination (#437, CM1).
   ------------------------------------------------------------
   Cible = la conjonction de coordination (mais / ou / et / donc / or / ni / car).
   Interdits d'ambiguïté (garde-fous, pas des détails) :
   - jamais « car » (le bus) ni « or » (le métal) comme NOM dans cette banque —
     seuls les emplois CONJONCTION apparaissent ;
   - « ou » ne côtoie jamais « où » (homophones fragiles en TTS) : « où » est ABSENT ;
   - « ni » s'emploie en PAIRE → cible DOUBLE non adjacente (les deux « ni ») ;
   - « or » (le plus abstrait) : peu de phrases, contextes limpides.
   ============================================================ */
export const CONSIGNE_CONJ = 'Clique sur la conjonction de coordination de la phrase.';
export const CIBLE_CONJ = 'la conjonction de coordination';

function conj(texte: string, conjonction: string): PhraseClicMot {
	return phraseMots(texte, [conjonction], {
		explication: `« ${conjonction} » relie deux mots, deux groupes ou deux phrases : c'est une conjonction de coordination.`,
		explicationNommeCible: true,
	});
}
/* ni…ni : les DEUX « ni » forment la cible (non adjacente). */
function conjNi(texte: string): PhraseClicMot {
	return phraseMots(texte, ['ni', 'ni'], {
		explication:
			"« ni … ni » relie deux mots ou deux groupes en les niant : c'est une conjonction de coordination.",
		explicationNommeCible: true,
	});
}

export const PHRASES_CONJ: PhraseClicMot[] = [
	// mais (opposition)
	conj('Il pleut, mais nous sortons quand même.', 'mais'),
	conj('Le gâteau est petit, mais il est délicieux.', 'mais'),
	conj('Je suis fatigué, mais je termine mon travail.', 'mais'),
	conj('Elle court vite, mais son frère court plus vite.', 'mais'),
	conj('Ce livre est ancien, mais il reste passionnant.', 'mais'),
	conj('Nous voulions partir, mais la voiture est cassée.', 'mais'),
	conj('Le film était long, mais vraiment intéressant.', 'mais'),
	// et (addition)
	conj('Paul mange une pomme et une banane.', 'et'),
	conj('Le chat et le chien dorment près du feu.', 'et'),
	conj('Nous chantons et nous dansons à la fête.', 'et'),
	conj('Elle range sa chambre et fait ses devoirs.', 'et'),
	conj('Le ciel est bleu et le soleil brille.', 'et'),
	conj('Il achète du pain et des fruits au marché.', 'et'),
	conj('Les enfants rient et jouent dans la cour.', 'et'),
	// ou (choix)
	conj('Tu préfères le thé ou le café ?', 'ou'),
	conj('Nous irons à la mer ou à la montagne.', 'ou'),
	conj('Veux-tu une glace ou un gâteau ?', 'ou'),
	conj('Il viendra samedi ou dimanche prochain.', 'ou'),
	conj('On peut jouer dehors ou rester au chaud.', 'ou'),
	conj('Elle prendra le train ou le bus.', 'ou'),
	// donc (conséquence)
	conj('Il est tard, donc nous rentrons.', 'donc'),
	conj('Il a beaucoup plu, donc le jardin est trempé.', 'donc'),
	conj('Tu as bien travaillé, donc tu peux te reposer.', 'donc'),
	conj('La route est fermée, donc nous faisons un détour.', 'donc'),
	conj("Je n'ai plus faim, donc je m'arrête de manger.", 'donc'),
	conj('Le magasin est fermé, donc nous reviendrons demain.', 'donc'),
	// car (cause)
	conj('Elle est fatiguée, car elle a couru longtemps.', 'car'),
	conj('Nous restons à la maison, car il neige beaucoup.', 'car'),
	conj('Le bébé pleure, car il a très faim.', 'car'),
	conj("J'allume la lampe, car la nuit tombe.", 'car'),
	conj('Il met son manteau, car il fait très froid.', 'car'),
	conj('Les fleurs se fanent, car personne ne les arrose.', 'car'),
	// or (opposition abstraite, contextes limpides)
	conj('Je croyais avoir raison, or je me trompais.', 'or'),
	conj("Il promettait de venir, or il n'est jamais arrivé.", 'or'),
	conj("Tout semblait calme, or l'orage approchait.", 'or'),
	conj('Elle cherchait ses clés, or elles étaient sur la table.', 'or'),
	// ni…ni (cible double non adjacente)
	conjNi('Il ne mange ni viande ni poisson.'),
	conjNi('Je ne veux ni pleurer ni me plaindre.'),
	conjNi("Elle n'aime ni le froid ni la pluie."),
	conjNi("Ce chien n'est ni méchant ni bruyant."),
	conjNi("Nous n'avons ni faim ni soif."),
];

/* ============================================================
   Leçon B — Sous-catégories de déterminant (#437, CM1).
   ------------------------------------------------------------
   Distinguer article / possessif / démonstratif. Consigne + cibleLabel PAR ITEM.
   Idée forte (pédagogue) : une même phrase réunit les sous-catégories comme
   distracteurs mutuels, la consigne variant d'un item à l'autre (banque PLATE :
   plusieurs items d'une même phrase, un par sous-catégorie visée).
   Interdits d'ambiguïté :
   - « ce » seulement IMMÉDIATEMENT devant un nom (jamais pronom « Ce sont… », « C'est… ») ;
   - « leur/leurs » seulement devant un nom (jamais pronom « Je leur parle ») ;
   - PAS de partitifs (du / de la) ni de contractés (au / aux / du) — ambigus/hors périmètre ;
   - PAS d'article élidé « l' » (soudé au nom → non cliquable séparément).
   Garde-fou de construction : la phrase doit contenir EXACTEMENT un déterminant de la
   sous-catégorie visée, et ce doit être la cible (sinon erreur — cible ambiguë).
   ============================================================ */
const DET_LABEL: Record<SousCatDet, string> = {
	article: "l'article",
	possessif: 'le déterminant possessif',
	demonstratif: 'le déterminant démonstratif',
};
const DET_CONSIGNE: Record<SousCatDet, string> = {
	article: "Clique sur l'article de la phrase.",
	possessif: 'Clique sur le déterminant possessif de la phrase.',
	demonstratif: 'Clique sur le déterminant démonstratif de la phrase.',
};
const DET_EXPL: Record<SousCatDet, (m: string) => string> = {
	article: (m) => `« ${m} » accompagne le nom sans dire à qui c'est : c'est un article.`,
	possessif: (m) => `« ${m} » montre à qui c'est : c'est un déterminant possessif.`,
	demonstratif: (m) =>
		`« ${m} » sert à montrer de quel nom on parle : c'est un déterminant démonstratif.`,
};

export function det(texte: string, cible: string, cat: SousCatDet): PhraseClicMot {
	const tokens = tokeniser(texte);
	const membres = tokens.filter((t) => DET_SETS[cat].has(t.toLowerCase()));
	if (membres.length !== 1 || membres[0].toLowerCase() !== cible.toLowerCase()) {
		throw new Error(
			`grammaire-clic-mot (det ${cat}) : « ${texte} » doit contenir exactement un ${cat} ` +
				`et ce doit être « ${cible} » (trouvé ${membres.length} : ${membres.join(', ')}).`,
		);
	}
	return phraseMots(texte, [cible], {
		explication: DET_EXPL[cat](cible),
		consigne: DET_CONSIGNE[cat],
		cibleLabel: DET_LABEL[cat],
		explicationNommeCible: true, // les trois formulations de DET_EXPL citent le mot (#529)
	});
}
/* Expanse une phrase en plusieurs items (un par sous-catégorie ciblée). */
function detItems(texte: string, specs: [string, SousCatDet][]): PhraseClicMot[] {
	return specs.map(([cible, cat]) => det(texte, cible, cat));
}

export const CONSIGNE_DET = 'Clique sur le déterminant demandé.';

export const PHRASES_DET: PhraseClicMot[] = [
	// Phrases « riches » : les 3 sous-catégories se font distracteurs mutuels.
	...detItems('Ce chien mange sa gamelle et un os.', [
		['Ce', 'demonstratif'],
		['sa', 'possessif'],
		['un', 'article'],
	]),
	...detItems('Cette fille montre son dessin à des amis.', [
		['Cette', 'demonstratif'],
		['son', 'possessif'],
		['des', 'article'],
	]),
	...detItems('Ces enfants rangent leurs jouets dans une boîte.', [
		['Ces', 'demonstratif'],
		['leurs', 'possessif'],
		['une', 'article'],
	]),
	...detItems('Mon frère répare ce vélo avec les outils.', [
		['Mon', 'possessif'],
		['ce', 'demonstratif'],
		['les', 'article'],
	]),
	...detItems('Cet oiseau protège ses petits dans le nid.', [
		['Cet', 'demonstratif'],
		['ses', 'possessif'],
		['le', 'article'],
	]),
	...detItems('Ta sœur dessine cette maison avec un crayon.', [
		['Ta', 'possessif'],
		['cette', 'demonstratif'],
		['un', 'article'],
	]),
	// Phrases à deux sous-catégories.
	...detItems('Les oiseaux quittent leur nid en automne.', [
		['Les', 'article'],
		['leur', 'possessif'],
	]),
	...detItems('Mon voisin répare cette barrière.', [
		['Mon', 'possessif'],
		['cette', 'demonstratif'],
	]),
	...detItems('Ces montagnes cachent le soleil.', [
		['Ces', 'demonstratif'],
		['le', 'article'],
	]),
	...detItems('Cette histoire raconte une belle aventure.', [
		['Cette', 'demonstratif'],
		['une', 'article'],
	]),
	...detItems('Tes amis apportent des cadeaux.', [
		['Tes', 'possessif'],
		['des', 'article'],
	]),
	...detItems('Notre équipe gagne le match.', [
		['Notre', 'possessif'],
		['le', 'article'],
	]),
	...detItems('Votre chien aboie dans le jardin.', [
		['Votre', 'possessif'],
		['le', 'article'],
	]),
	...detItems('Ce boulanger prépare des croissants.', [
		['Ce', 'demonstratif'],
		['des', 'article'],
	]),
	...detItems('Nos cousins visitent cette ville.', [
		['Nos', 'possessif'],
		['cette', 'demonstratif'],
	]),
	...detItems('Cet acteur joue un rôle important.', [
		['Cet', 'demonstratif'],
		['un', 'article'],
	]),
	...detItems('Cette chanson me rappelle mes vacances.', [
		['Cette', 'demonstratif'],
		['mes', 'possessif'],
	]),
	...detItems('Range tes affaires dans ce tiroir.', [
		['tes', 'possessif'],
		['ce', 'demonstratif'],
	]),
	...detItems('Notre maîtresse corrige ce cahier.', [
		['Notre', 'possessif'],
		['ce', 'demonstratif'],
	]),
];

/* ============================================================
   Leçon C — Pronom personnel sujet vs complément (#437, CM1).
   ------------------------------------------------------------
   Consigne + cibleLabel PAR ITEM (sujet / complément).
   Sujets = je/tu/il/elle/on/nous/vous/ils/elles.
   Compléments = me/te/lui/leur/se/nous/vous.
   Interdits d'ambiguïté :
   - EXCLURE le/la/les comme compléments (homographes d'articles — leçon plus avancée) ;
   - JAMAIS la même forme (nous/vous) à la fois en sujet et en complément dans une phrase.
   Garde-fou de construction : un seul pronom du rôle visé est cliquable (formes non
   ambiguës comptées ; nous/vous gérés par leur unique occurrence — cf. interdit).
   ============================================================ */
const PRON_LABEL: Record<RolePron, string> = {
	sujet: 'le pronom personnel sujet',
	complement: 'le pronom personnel complément',
};
const PRON_CONSIGNE: Record<RolePron, string> = {
	sujet: 'Clique sur le pronom personnel sujet de la phrase.',
	complement: 'Clique sur le pronom personnel complément de la phrase.',
};
const PRON_EXPL: Record<RolePron, (m: string) => string> = {
	sujet: (m) => `« ${m} » fait l'action : c'est un pronom personnel sujet.`,
	complement: (m) => `« ${m} » reçoit l'action : c'est un pronom personnel complément.`,
};

export function pron(texte: string, cible: string, role: RolePron): PhraseClicMot {
	const setRole = role === 'sujet' ? PRON_SUJET : PRON_COMPL;
	const strict = role === 'sujet' ? PRON_SUJET_STRICT : PRON_COMPL_STRICT;
	const cl = cible.toLowerCase();
	if (!setRole.has(cl)) {
		throw new Error(
			`grammaire-clic-mot (pron ${role}) : « ${cible} » n'est pas un pronom ${role}.`,
		);
	}
	const tokens = tokeniser(texte);
	// Un seul pronom du rôle visé doit être cliquable : les formes strictes de CE rôle,
	// plus l'occurrence de la cible (couvre nous/vous ciblés), doivent totaliser 1.
	const memes = tokens.filter((t) => {
		const b = t.toLowerCase();
		return strict.has(b) || b === cl;
	});
	if (memes.length !== 1) {
		throw new Error(
			`grammaire-clic-mot (pron ${role}) : « ${texte} » doit contenir un seul pronom ${role} ` +
				`(« ${cible} » ; trouvé ${memes.length} : ${memes.join(', ')}).`,
		);
	}
	return phraseMots(texte, [cible], {
		explication: PRON_EXPL[role](cible),
		consigne: PRON_CONSIGNE[role],
		cibleLabel: PRON_LABEL[role],
		explicationNommeCible: true, // les deux formulations de PRON_EXPL citent le mot (#529)
	});
}
function pronItems(texte: string, specs: [string, RolePron][]): PhraseClicMot[] {
	return specs.map(([cible, role]) => pron(texte, cible, role));
}

export const CONSIGNE_PRON = 'Clique sur le pronom personnel demandé.';

export const PHRASES_PRON: PhraseClicMot[] = [
	// Paires sujet + complément (formes différentes).
	...pronItems('Il lui offre un joli cadeau.', [
		['Il', 'sujet'],
		['lui', 'complement'],
	]),
	...pronItems('Nous leur envoyons une longue lettre.', [
		['Nous', 'sujet'],
		['leur', 'complement'],
	]),
	...pronItems('Tu me racontes une belle histoire.', [
		['Tu', 'sujet'],
		['me', 'complement'],
	]),
	...pronItems('Elle te prête son beau vélo.', [
		['Elle', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems("Ils nous attendent devant l'école.", [
		['Ils', 'sujet'],
		['nous', 'complement'],
	]),
	...pronItems('Vous me montrez le chemin.', [
		['Vous', 'sujet'],
		['me', 'complement'],
	]),
	...pronItems('Je te donne ma part de gâteau.', [
		['Je', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems('On lui propose un nouveau jeu.', [
		['On', 'sujet'],
		['lui', 'complement'],
	]),
	...pronItems('Elles se cachent derrière le rideau.', [
		['Elles', 'sujet'],
		['se', 'complement'],
	]),
	...pronItems('Il se lave soigneusement avant le repas.', [
		['Il', 'sujet'],
		['se', 'complement'],
	]),
	...pronItems('Nous vous remercions pour votre aide.', [
		['Nous', 'sujet'],
		['vous', 'complement'],
	]),
	...pronItems('Tu nous expliques la règle du jeu.', [
		['Tu', 'sujet'],
		['nous', 'complement'],
	]),
	...pronItems('Ils te suivent dans le couloir.', [
		['Ils', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems('Elle leur lit une histoire du soir.', [
		['Elle', 'sujet'],
		['leur', 'complement'],
	]),
	...pronItems('Je vous invite à mon anniversaire.', [
		['Je', 'sujet'],
		['vous', 'complement'],
	]),
	...pronItems('Elle te répond gentiment.', [
		['Elle', 'sujet'],
		['te', 'complement'],
	]),
	...pronItems('Vous nous aidez souvent.', [
		['Vous', 'sujet'],
		['nous', 'complement'],
	]),
	// Sujet seul (aucun pronom complément).
	...pronItems('Demain, nous partirons à la campagne.', [['nous', 'sujet']]),
	...pronItems('Chaque matin, elle arrose ses fleurs.', [['elle', 'sujet']]),
	...pronItems("Pendant l'été, ils voyagent en train.", [['ils', 'sujet']]),
	// Complément seul (sujet = groupe nominal).
	...pronItems('Ma grande sœur me coiffe doucement.', [['me', 'complement']]),
	...pronItems('Le professeur lui explique la leçon.', [['lui', 'complement']]),
	...pronItems('Les parents leur préparent un goûter.', [['leur', 'complement']]),
	...pronItems('Le chien nous suit partout.', [['nous', 'complement']]),
];

/* ============================================================
   Leçon D — Nom noyau du groupe nominal (#437, CM1).
   ------------------------------------------------------------
   Cible = le nom principal du GN ; distracteurs = son déterminant + son/ses adjectif(s).
   Contrainte STRUCTURELLE ABSOLUE (garde-fou d'ambiguïté) : UN SEUL groupe nominal
   développé par phrase ; tout le reste = pronom sujet, verbe, adverbe — JAMAIS un
   deuxième nom (pas de CC nominal, pas de complément du nom, pas d'apposition, pas de
   nom propre cible). Patrons variés : Dét+Nom, Dét+Nom+Adj, Dét+Adj+Nom.
   ============================================================ */
export const CONSIGNE_NOYAU = 'Clique sur le nom noyau du groupe nominal.';
export const CIBLE_NOYAU = 'le nom noyau';

function noyau(texte: string, nom: string): PhraseClicMot {
	return phraseMots(texte, [nom], {
		explication: `Le nom noyau, c'est le nom principal du groupe : ici « ${nom} » (les autres mots le complètent).`,
		explicationNommeCible: true, // #529
	});
}

export const PHRASES_NOYAU: PhraseClicMot[] = [
	// Dét + Nom
	noyau('Le chien aboie bruyamment.', 'chien'),
	noyau('Elle observe les étoiles.', 'étoiles'),
	noyau('Nous écoutons la musique.', 'musique'),
	noyau('Le clown danse joyeusement.', 'clown'),
	noyau('La lune brille faiblement.', 'lune'),
	noyau('Le train roule vite.', 'train'),
	noyau('Le savant explique calmement.', 'savant'),
	noyau('Le boulanger travaille tôt.', 'boulanger'),
	// Dét + Nom + Adj
	noyau('Le petit chat noir dort profondément.', 'chat'),
	noyau('Elle regarde un grand oiseau bleu.', 'oiseau'),
	noyau('Il conduit une voiture rouge.', 'voiture'),
	noyau('Tu portes un manteau chaud.', 'manteau'),
	noyau('Nous admirons un château immense.', 'château'),
	noyau('Le gâteau délicieux refroidit doucement.', 'gâteau'),
	noyau('Il répare le vélo cassé.', 'vélo'),
	noyau('Nous regardons un film passionnant.', 'film'),
	noyau('Il mange une pomme mûre.', 'pomme'),
	noyau('Elle range un tiroir profond.', 'tiroir'),
	noyau('Elle chante une jolie mélodie.', 'mélodie'),
	noyau('Elle porte une robe légère.', 'robe'),
	noyau('Il pousse un chariot rempli.', 'chariot'),
	noyau('La rivière tranquille coule lentement.', 'rivière'),
	noyau('Nous suivons un chemin étroit.', 'chemin'),
	noyau('Elle observe un papillon coloré.', 'papillon'),
	// Dét + Adj + Nom
	noyau('Tu admires ce grand tableau ancien.', 'tableau'),
	noyau('La petite fille sourit gentiment.', 'fille'),
	noyau('Le vieux pont tremble légèrement.', 'pont'),
	noyau('Elle caresse un joli chaton.', 'chaton'),
	noyau('Il escalade une haute montagne.', 'montagne'),
	noyau('Elle cueille une belle fleur.', 'fleur'),
	noyau('Le grand arbre grandit lentement.', 'arbre'),
	noyau('Elle achète un joli chapeau.', 'chapeau'),
	noyau('Tu dessines une belle princesse.', 'princesse'),
	noyau('La lune ronde brille faiblement.', 'lune'),
	noyau('Le nageur courageux plonge rapidement.', 'nageur'),
	noyau('Tu construis une belle cabane.', 'cabane'),
	noyau('Il attrape un gros ballon.', 'ballon'),
	noyau('La vieille horloge sonne bruyamment.', 'horloge'),
	noyau('Nous plantons un jeune arbre.', 'arbre'),
	noyau('Tu ouvres une lourde porte.', 'porte'),
	noyau('Le petit lapin bondit joyeusement.', 'lapin'),
];

/* ============================================================
   Leçon E — Sujet = nom noyau du groupe sujet, composé compris (#437, CM1).
   ------------------------------------------------------------
   Deux formes :
   - sujet SIMPLE : un GN au nom noyau unique (mêmes contraintes que D — pas d'autre
     nom ailleurs) → cible 1 mot ;
   - sujet COMPOSÉ : NOMS PROPRES uniquement (« Paul et Léa ») → cible = les deux noms,
     en SAUTANT « et » (cible double non adjacente).
   Interdits : PAS de sujet composé de deux GN à déterminant (« le chat et le chien »,
   différé) ; PAS de mixte pronom + nom (« Toi et ton frère ») ; PAS de sujet à 3 éléments.
   ============================================================ */
export const CONSIGNE_SUJET =
	'Clique sur le nom noyau du sujet. Parfois, le sujet est composé de deux noms : clique sur les deux !';
export const CIBLE_SUJET = 'le nom noyau du sujet';

function sujetSimple(texte: string, nom: string): PhraseClicMot {
	return phraseMots(texte, [nom], {
		explication: `Le nom noyau du sujet, c'est qui fait l'action : « ${nom} » (les autres mots le complètent).`,
		explicationNommeCible: true, // #529
	});
}
function sujetCompose(texte: string, nom1: string, nom2: string): PhraseClicMot {
	return phraseMots(texte, [nom1, nom2], {
		explication: `Le sujet est composé de deux noms : « ${nom1} » et « ${nom2} ».`,
		explicationNommeCible: true, // #529 — les DEUX noms sont énumérés
	});
}

export const PHRASES_SUJET: PhraseClicMot[] = [
	// Sujet simple (GN au nom noyau unique).
	sujetSimple('Le petit chien aboie joyeusement.', 'chien'),
	sujetSimple('La grande girafe mange lentement.', 'girafe'),
	sujetSimple('Le vieux pêcheur dort tranquillement.', 'pêcheur'),
	sujetSimple('Une jolie fleur pousse doucement.', 'fleur'),
	sujetSimple('Le gros nuage avance lentement.', 'nuage'),
	sujetSimple('La petite souris court vite.', 'souris'),
	sujetSimple('Le champion fatigué respire fortement.', 'champion'),
	sujetSimple('Mon frère travaille sérieusement.', 'frère'),
	sujetSimple('Cette chanteuse chante merveilleusement.', 'chanteuse'),
	sujetSimple('Le brave pompier intervient rapidement.', 'pompier'),
	sujetSimple('Une abeille butine tranquillement.', 'abeille'),
	sujetSimple('Le clown maladroit tombe souvent.', 'clown'),
	sujetSimple('Le gros ours dort paisiblement.', 'ours'),
	sujetSimple('Le boulanger commence tôt.', 'boulanger'),
	sujetSimple('Ma petite sœur dessine joliment.', 'sœur'),
	sujetSimple('Le petit écureuil grimpe rapidement.', 'écureuil'),
	sujetSimple('La vieille dame marche prudemment.', 'dame'),
	sujetSimple('Un grand cheval galope librement.', 'cheval'),
	sujetSimple('Le facteur pressé roule rapidement.', 'facteur'),
	sujetSimple('Cette élève répond poliment.', 'élève'),
	// Sujet composé (deux noms propres, « et » sauté).
	sujetCompose('Paul et Léa jouent ensemble.', 'Paul', 'Léa'),
	sujetCompose('Tom et Lucas courent vite.', 'Tom', 'Lucas'),
	sujetCompose('Emma et Chloé chantent gaiement.', 'Emma', 'Chloé'),
	sujetCompose('Nina et Sacha dansent joyeusement.', 'Nina', 'Sacha'),
	sujetCompose('Léo et Marie rient beaucoup.', 'Léo', 'Marie'),
	sujetCompose('Hugo et Jules travaillent sérieusement.', 'Hugo', 'Jules'),
	sujetCompose('Alice et Sarah nagent rapidement.', 'Alice', 'Sarah'),
	sujetCompose('Adam et Noé dessinent tranquillement.', 'Adam', 'Noé'),
	sujetCompose('Zoé et Manon sautent partout.', 'Zoé', 'Manon'),
	sujetCompose('Théo et Lina applaudissent fort.', 'Théo', 'Lina'),
];
