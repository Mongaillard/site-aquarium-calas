# Illustrations

| Fichier | Contenu | Origine |
| --- | --- | --- |
| `heros.webp` | Chevalier en pied, vue de face | Planche de personnage générée par l'auteur du dépôt, découpée et détourée pour le jeu |
| `portrait-milicien.webp` | Buste du même chevalier | idem |
| `defaite.webp` | Le chevalier à terre (dernière image de l'animation de mort) | idem |
| `chevalier.webp` | Atlas des **huit orientations** du chevalier, style « peint » du milicien | idem |
| `milicien-marche.webp` | Cycle de marche du chevalier, **huit orientations × huit images** (64 cases de 51×76), style « animé » du milicien | Planche de cycle de marche fournie par l'auteur du dépôt |
| `centre-ville.webp` | Le **Centre-Ville** : palais à dômes bleus sur son parvis, 288×287, dessiné sur 144 px pour une emprise de 96 | Illustration générée par l'auteur du dépôt, fond plat retiré |
| `caserne.webp` | La **caserne** : enceinte crénelée, cour d'entraînement, deux tours à dôme, 264×264, dessinée sur 132 px | Illustration générée par l'auteur du dépôt, même chaîne que le Centre-Ville |
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

La planche fournie est une **maquette aplatie** : malgré son en-tête, elle n'a
pas de canal alpha, et ses huit panneaux partagent le même fond navy que la page
(9, 17, 22). Le détourage est donc plus simple que sur la planche peinte — le
contour des personnages est plus **sombre** que le fond, pas plus clair, donc un
seuil de distance suffit, complété par la connexité au bord pour ne pas percer
l'intérieur des sprites.

Les quatre bandes ont été repérées par projection des pixels **colorés**
(luminance > 40 et saturation > 25) : le texte des étiquettes, gris ou blanc, ne
passe pas ce filtre, les armures oui. Dans chaque bande, les huit images se
détachent de la même façon — à un cas près, où le bouclier détaché du corps
formait un neuvième groupe, recollé au plus proche voisin.

L'ordre des directions de la planche — bas, bas-droite, droite, haut-droite,
haut, haut-gauche, gauche, bas-gauche — correspondait exactement à
`caseDirection()`. Vérifié à l'écran plutôt que déduit : une unité envoyée vers
l'est affiche bien la case 2.

Chaque case est **alignée sur le centre des pieds**, pas sur sa boîte englobante :
l'épée tendue de la vue de profil décalerait tout le cycle d'une image à l'autre.

Malgré son allure de pixel art, la planche n'est **pas** un agrandissement entier
d'une petite image : 92 % des plages horizontales de couleur constante font un
seul pixel. Elle est donc réduite au filtre de Lanczos et dessinée **avec**
lissage, contrairement au lancier.

L'image affichée vient de la **distance parcourue**, pas de l'horloge. Une unité
lente marche lentement, une unité bloquée ne pédale pas sur place, et une unité
arrêtée revient à l'image 0, sa pose de repos.

### Le poids, et le détour par la palette

Cette planche est ombrée en dégradé : après réduction, l'atlas comptait **90 000
couleurs distinctes**. En WebP sans pertes, il pesait 326 Ko ; en WebP avec pertes
à qualité 82, encore 136 Ko.

Le détour qui débloque tout : **réduire d'abord à 48 couleurs**, puis encoder sans
pertes. L'encodeur emprunte alors son chemin palettisé et tombe à **67 Ko** — le
quart de son poids, sans différence visible à l'œil même agrandi quatre fois (en
dessous de 32 couleurs, en revanche, le bouclier se désature et le plumet perd
son dégradé).

### La recoloration d'équipe

Ici l'armure est un **acier bleuté** qui voisine avec le bleu franc du bouclier et
du tabard. L'échange de canaux utilisé pour l'illustration peinte faisait virer
toute l'armure au cuivre. La règle retenue bascule une **fenêtre de teinte**
(200°–255°, saturation > 0,32) vers le rouge, en gardant saturation et luminosité :
le bouclier et le tabard changent de camp, le casque et les épaulières restent de
l'acier.

C'est la même mécanique que pour le lancier, dans l'autre sens : une fenêtre
étroite autour des rouges francs (338°–14°), pour épargner la peau et le cuir.
`js/sprites.js` n'a donc plus qu'une fonction de rotation de teinte, paramétrée
par l'atlas, et l'échange de canaux ne sert plus qu'à la cape peinte.

Un test le vérifie à chaque exécution : 20 % des pixels sont repeints, **aucun
pixel d'acier n'est touché** (40 434 sur 40 434 intacts), et il ne reste aucun
bleu franc côté adverse.

## Le Centre-Ville et la caserne

L'illustration est en vue de trois quarts sur une carte vue de dessus — c'est
exactement le compromis d'Age of Empires, où bâtiments et unités sont dessinés
de trois quarts sur un sol plat. Le fond, un vert olive uni (écart-type 4 sur le
bord), part par un remplissage depuis les bords ; le sol peint autour du parvis
— rochers, buissons, dallage — est conservé : sur l'herbe du jeu, il fait un
parvis crédible.

Le bâtiment est dessiné **plus grand que son emprise** : 144 px de large pour
3 cases (96 px), posé par sa ligne de sol (93 % de la hauteur) sur le bord sud de
l'emprise. Le palais monte au-dessus des cases situées derrière lui, le parvis
déborde sur les cases praticables devant — les unités marchent dessus. Pour
qu'une unité qui longe le mur ne passe jamais *sous* le débord, le rendu classe
les bâtiments à leur **bord nord** dans l'ordre du peintre, pas à leur centre.

La caserne suit la même chaîne (`decoupe-batiment.py` : fond, cadre, réduction,
palette, aperçu), dessinée sur 132 px pour rester un peu moins large que le
palais. Réduits à deux fois la taille dessinée et quantifiés à 64 couleurs avant
l'encodage WebP sans pertes : **36 Ko** et **29 Ko**. La couleur d'équipe suit la règle du
chevalier animé — seule la fenêtre du bleu franc (200°–255°) bascule : dômes,
bannières et auvents passent au rouge, la pierre blanche et l'eau cyan des
fontaines ne bougent pas. Un test le vérifie pixel à pixel.

## Format

WebP partout où c'est possible : 205 Ko pour l'ensemble, contre environ 600 Ko en
PNG, sans différence visible à l'œil même agrandi trois fois.
