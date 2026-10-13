# Périmètre CM1 : ce que Ludaskia ne fait pas, et pourquoi

Ce document écrit, notion par notion, ce que Ludaskia **ne fera pas** au CM1, ou **pas
encore**. Il existe pour que la même discussion ne recommence pas à chaque choix de leçon,
et pour qu'on distingue une porte fermée pour de bon d'une porte simplement pas encore
ouverte (issue #260).

Il ne décrit **pas** ce que l'application fait : c'est le rôle de
[Contenu & leçons](../architecture/contenu-et-lecons.md). Il ne liste pas non plus les
notions couvrables qui ne sont pas encore faites : celles-là relèvent du backlog (issues
GitHub), pas d'une décision de périmètre.

Les attendus cités renvoient au cache du programme officiel,
[`cm1-maths.md`](../reference/programmes/cm1-maths.md) (« ma. ») et
[`cm1-francais.md`](../reference/programmes/cm1-francais.md) (« fr. »), par section, par
lignes, ou les deux (« ma. 4.1, l.315 »). Un fichier par classe : un `cm2.md` frère
s'ajoutera à ce dossier sans le réorganiser.

## Les trois catégories

Chaque notion est rangée dans **une seule** catégorie.

- **A. Hors format par nature.** La compétence EST le geste, la production ou l'échange
  que l'application ne peut pas capter. Définitif.
- **B. Écartée pour le moment, envisageable plus tard.** Faisable et fidèle, mais d'un
  effort disproportionné aujourd'hui. L'entrée dit ce qui manque pour la rouvrir.
- **C. Faisable mais faux-ami.** Un exercice auto-corrigé est possible, mais sous la forme
  décrite il entraînerait autre chose que la compétence visée. L'entrée nomme le chemin de
  contournement que l'enfant emprunterait.

Règle de classement : un motif de **coût** (« trop lourd à faire ») ne range jamais une
notion en A ou en C. Il relève de B.

## A. Hors format par nature

| Notion | Raison |
|---|---|
| Production écrite : rédiger un texte, le réviser (fr. 2.2-2.3) | La compétence est de produire un texte (idées, cohérence, révision) ; une saisie n'en capte que l'orthographe, entraînée à part. |
| Écrire à la main : copier, geste graphomoteur (fr. 2.1, l.69) | Le geste manuscrit est la compétence, y compris celui du calcul posé (cf. B). |
| Améliorer son texte au brouillon, avec ses pairs (fr. l.91-95) | Processus d'écriture et échange humain. |
| Production orale, écoute et échanges oraux (fr. 3, l.101-129) | La parole et l'écoute en situation, jugées par un auditeur. Le réemploi du vocabulaire à l'oral en fait partie (cf. C, dernière ligne). |
| Fluence de lecture, lecture à voix haute avec expressivité (fr. 1.1-1.2, l.16-29) | L'acte est vocal et se juge à l'oreille (rythme, ponctuation, expressivité). |
| Lire des œuvres entières : volume de lecture (fr. 1.5, l.52-62) | Lecture suivie d'un livre, hors écran d'exercice. |
| Tracés et constructions à la règle, à l'équerre, au compas : perpendiculaires, parallèles, cercle ; reproduire ou construire carré, rectangle, triangle (ma. l.256, l.268-271) | Le geste avec l'outil sur papier est la compétence ; un outil virtuel entraînerait un autre geste. |
| Construire un patron, un cube, un pavé, un prisme (ma. l.292, l.294) | Découper, plier, assembler : manipulation physique. |
| Construire un angle par report (gabarit, calque) | Le geste de report est la compétence. Le programme du CM1 ne demande que de comparer des angles et d'en utiliser le lexique (ma. l.225-231). |
| Démarche des problèmes à plusieurs étapes : expliciter et rédiger sa démarche, modéliser librement (ma. l.146-150) | La démarche écrite est la compétence ; un exercice auto-corrigé n'en capte que le résultat. |
| Recueillir des données (ma. 4.1, l.315) | Activité d'enquête ou de classe, hors écran. |
| Mesurer une longueur à la règle graduée (ma. l.183) | Le geste de mesure avec l'instrument est la compétence. |
| Estimer la longueur ou la masse d'un objet au contact de l'objet réel (ma. l.181, l.200) | L'estimation se fait sur l'objet, en main ou sous les yeux. |

Ce que ces entrées **ne** ferment **pas**, parce que ce sont d'autres notions, couvrables :
reconnaître des droites perpendiculaires ou parallèles, un cercle, un patron de cube ;
comparer et reconnaître des angles ; résoudre un problème à étapes à réponse numérique,
choisir une opération ; calculer un périmètre sur des longueurs données ou lues ; choisir
l'unité adaptée à un objet nommé.

## B. Écartée pour le moment, envisageable plus tard

| Notion | Raison | Pour la rouvrir |
|---|---|---|
| Construire le symétrique d'une figure sur quadrillage (ma. l.274-276) | Fidèle : sur quadrillage, le clic remplace le crayon, pas le raisonnement. La leçon `geo-symetrie-axiale` ne fait que de la **reconnaissance**. | Une grille de points cliquables, un axe horizontal ou vertical (seuls attendus du CM1), des cibles tactiles suffisantes, une correction par ensemble de points. |
| Calcul posé, technique écrite : retenues notées par l'enfant, alignement des chiffres, virgule des décimaux, division posée (ma. l.136-140) | Faisable dans une grille : seul le coût l'a fait différer (note ci-dessous). | Un runner `posed` à cellules de retenue et à colonnes à placer, dont le `check` accepte toutes les traces valides ; pour la division, un gabarit de restes successifs. |
| Compréhension fine de l'implicite (fr. 1.3, l.37-38) | Faisable en QCM ; le risque de réponse devinée par élimination se neutralise par construction, comme pour la proportionnalité (#258). | Des textes courts originaux, des distracteurs tous ancrés dans le texte, un test du recouvrement lexical, une banque de 50 à 100 items. |

**Calcul posé, ce qui existe et ce qui est écarté.** Il existe trois leçons `posed`
(addition, soustraction et multiplication posées, au CE2) où l'enfant saisit le résultat
chiffre par chiffre, en colonnes (`src/data/maths/posee.ts`), et un brouillon libre, jetable
et non corrigé, pour poser son calcul (`src/ui/brouillon.ts`). Est écarté ce que l'enfant
noterait lui-même dans l'opération : les retenues, l'alignement, la virgule des décimaux,
et la division posée. Risque à traiter à la réouverture : des retenues notées au hasard, que
la grille ne distingue pas d'un vrai calcul.

## C. Faisable mais faux-ami

La première colonne décrit la **forme** écartée, pas la notion : celle-ci reste couvrable
sous une autre forme.

| Notion, sous la forme écartée | Raison | Contournement de l'enfant |
|---|---|---|
| Estimer un ordre de grandeur avec des distracteurs trop écartés (ma. l.134) | Si les propositions diffèrent d'un facteur 10, on choisit sans estimer. Avec des distracteurs resserrés, la notion reste couvrable. | Éliminer l'absurde en comptant les chiffres du résultat. |
| Identifier une situation de proportionnalité par un QCM binaire dont les énoncés portent des indices lexicaux (ma. l.349) | On répond sur des mots sans vérifier la relation entre les grandeurs (note ci-dessous). | Repérer des mots-clés d'énoncé (« chacun », « en plus »…). |
| Compléter un tableau de proportionnalité (ma. 5, l.340-350) | Les tableaux ne sont pas des objets d'enseignement au cycle 3 (note ci-dessous). | Sur « 2, 4, 6, 8 / 3, ?, 9, ? », répéter l'écart entre les nombres visibles, sans relier les grandeurs. |
| « Produire » un tableau ou un diagramme (ma. 4.1, l.315) | Remplir un gabarit imposé n'est pas produire : choisir la structure, l'échelle, les axes échappe à l'exercice. Seule la lecture se capte (ma. l.317-320). | Recopier les valeurs dans l'ordre de l'énoncé, dans les cases prévues. |
| Réemploi productif du vocabulaire (fr. 4.3, l.150) | Un texte à trous ou un QCM ne teste que la reconnaissance du mot ; le réemploi dans ses propres productions relève de A. | Éliminer, ou se fier à la familiarité de la forme, sans mobiliser le mot. |

**Proportionnalité en QCM binaire.** La leçon « Est-ce proportionnel ? » (#258) neutralise
ce contournement par construction : connecteurs et mots de contenu présents des deux côtés,
contrôlés par un test. Résidu assumé : un Oui/Non laisse une chance sur deux au hasard et ne
capte pas la justification.

**Tableau de proportionnalité.** Source : ressource eduscol « Résoudre des problèmes de
proportionnalité au cycle 3 ». La décision et la citation sont dans
[Contenu & leçons](../architecture/contenu-et-lecons.md), section « Résolution de
problèmes ».
