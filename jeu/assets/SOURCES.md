# Illustrations

| Fichier | Contenu | Origine |
| --- | --- | --- |
| `heros.webp` | Chevalier en pied, vue de face | Planche de personnage générée par l'auteur du dépôt, découpée et détourée pour le jeu |
| `portrait-milicien.webp` | Buste du même chevalier | idem |
| `defaite.webp` | Le chevalier à terre (dernière image de l'animation de mort) | idem |
| `chevalier.webp` | Atlas des **huit orientations** du chevalier, style « peint » du milicien | idem |
| `milicien-marche.webp` | Cycle de marche, **huit orientations × huit images** (64 cases), style « animé » du milicien | Planche de cycle de marche fournie par l'auteur du dépôt |
| `lancier.png` | Atlas des **huit orientations** d'un homme d'armes en pixel art, sprite du lancier | GIF animé fourni par l'auteur du dépôt (48×48, 8 images, fond déjà transparent) |

Ces images viennent d'une planche de référence fournie par l'auteur du dépôt, qui
en est l'auteur. Aucune image tierce n'est utilisée ici.

Le fond en dégradé de la planche a été retiré en ajustant un plan sur l'anneau de
bord de chaque découpe, puis en n'effaçant que les pixels *reliés au bord* : le
contour sombre des personnages arrête la propagation, ce qui préserve l'armure
grise — un simple seuil de couleur la mangeait.

L'atlas des orientations a été découpé automatiquement : on repère les colonnes
occupées de la rangée « vues principales », on détoure chaque personnage, puis on
aligne les huit cases sur le **centre des pieds** — pas sur le rectangle englobant,
que l'épée tendue décalerait. Les cases tournent en partant du sud (le personnage
fait face au joueur) puis par l'est ; le sens se lit à la cape, toujours dans le dos.

La version adverse est calculée au chargement : seuls les pixels à dominante bleue
passent au rouge, l'acier et l'or ne bougent pas. C'est plus sûr qu'une rotation de
teinte globale, et identique sur tous les navigateurs — le filtre d'un contexte 2D,
lui, ne l'est pas.

Le lancier, lui, est du pixel art natif : ses huit images étaient déjà calées sur
une grille de 48 pixels, pieds à la même hauteur, fond transparent — il a suffi de
les mettre bout à bout. Il est dessiné **sans lissage** (`imageSmoothingEnabled`),
faute de quoi l'interpolation le réduirait en bouillie. Son atlas pèse 4 Ko en PNG
indexé, contre 11 en PNG brut.

Sa recoloration d'équipe ne peut pas suivre la même règle que l'illustration peinte :
le rouge du tabard y voisine avec la peau du visage et le cuir. Une bascule large
repeignait le visage en bleu ; on ne prend donc que les rouges francs (teinte
338°–14°), ce qui épargne la peau et le cuir, dont la teinte est orangée.

## Le cycle de marche

La planche fournie tient quatre bandes de deux orientations, huit images chacune.
Les bandes ont été repérées par **projection du canal alpha** (une ligne vide
sépare deux bandes), puis chaque image découpée sur le même principe, et les
64 cases recollées en une grille de 8 colonnes (les images) sur 8 lignes (les
directions) — c'est ce que `cadreSource()` attend d'un atlas animé.

L'ordre des directions de la planche — bas, bas-droite, droite, haut-droite,
haut, haut-gauche, gauche, bas-gauche — correspondait déjà exactement à
`caseDirection()`. Vérifié à l'écran plutôt que déduit : une unité envoyée vers
l'est affiche bien la case 2.

L'image affichée vient de la **distance parcourue**, pas de l'horloge. Une unité
lente marche lentement, une unité bloquée ne pédale pas sur place, et une unité
arrêtée revient à l'image 0, sa pose de repos.

Le poids a demandé un détour : en WebP **avec pertes**, l'atlas pesait 133 Ko,
soit plus que les 103 Ko du PNG — le codec dépense son budget sur les bords nets
et le fond transparent. En le quantifiant à 96 couleurs puis en l'encodant **sans
pertes**, il tombe à 61 Ko, sans différence visible même agrandi trois fois.

## Format

WebP partout où c'est possible : 134 Ko pour l'ensemble, contre environ 420 Ko en
PNG, sans différence visible à l'œil même agrandi trois fois.
