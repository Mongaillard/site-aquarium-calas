# Illustrations

| Fichier | Contenu | Origine |
| --- | --- | --- |
| `heros.webp` | Chevalier en pied, vue de face | Planche de personnage générée par l'auteur du dépôt, découpée et détourée pour le jeu |
| `portrait-milicien.webp` | Buste du même chevalier | idem |
| `defaite.webp` | Le chevalier à terre (dernière image de l'animation de mort) | idem |
| `chevalier.webp` | Atlas des **huit orientations** du chevalier, style « peint » du milicien | idem |
| `milicien-marche.webp` | Cycle de marche du chevalier, **huit orientations × huit images** (64 cases de 51×76), style « animé » du milicien | Planche de cycle de marche fournie par l'auteur du dépôt |
| `cerf.webp` | Le **cerf** : cinq rangées (sud, sud-est, est, nord-est, nord) de quatre foulées, les trois de l'ouest en miroir, pas remis en ordre de face et de dos | Planche générée par l'auteur du dépôt, fond noir dé-prémultiplié |
| `cochon.webp` | Le **cochon** : cinq rangées (sud, sud-est, est, nord-est, nord) de quatre foulées, les trois de l'ouest en miroir, pas remis en balancier | Planche générée par l'auteur du dépôt, fond gris uni |
| `decor.webp` | Le **décor de la carte** : 97 pièces — amas de rochers, rochers, roseaux, touffes sèches, pampas, touffes d'herbe, buissons fleuris, fougères, couvre-sol, agaves, nénuphars, fleurs en quatre couleurs, galets — de tailles diverses dans un atlas à 2×, table dans `js/decor-pieces.js` | Découpées dans les planches d'eau, la planche d'arbres et la planche d'ornements de l'auteur du dépôt (voir plus bas) |
| `villageois.webp` | Le **villageois** : marche en cinq orientations dessinées (sud, nord, ouest, est, nord-est), repos, cueillir, construire, porter, bûcheron, mineur, boucher ; 99×87 par case, pas intermédiaires interpolés | Deux planches générées par l'auteur du dépôt (ChatGPT puis Gemini), fond retiré par rembg (voir plus bas) |
| `eclaireur.webp` | L'**éclaireur** : cavalier à la lance, huit orientations × quatre foulées, 106×111 par case | Planche générée par l'auteur du dépôt, livrée avec sa transparence |
| `centre-ville.webp` | Le **Centre-Ville** : palais à dômes bleus sur son parvis, 344×343, dessiné sur 172 px pour une emprise de 96 | Illustration générée par l'auteur du dépôt, fond plat retiré |
| `caserne.webp` | La **caserne** : enceinte crénelée, cour d'entraînement, deux tours à dôme, 316×315, dessinée sur 158 px | Illustration générée par l'auteur du dépôt, même chaîne que le Centre-Ville |
| `sol-eau.webp` | La **nappe d'eau**, 384×384, redressée depuis un losange isométrique et raccordée bord à bord | Illustration « eau pleine » générée par l'auteur du dépôt |
| `sol-herbe.webp`, `sol-herbe-sombre.webp`, `sol-terre.webp`, `sol-sable.webp` | Les quatre **nappes de sol** (herbe, herbe sombre, terre, sable), 384×384, raccordées bord à bord | Planche de six textures générée par l'auteur du dépôt ; deux (herbe sèche, terre sombre) restent en réserve |
| `arbres.webp` | Six **arbres** (cyprès, sapin, chêne, arbre à frondaison turquoise, saule, arbre noueux), 107×190 par case | Planche générée par l'auteur du dépôt, avec transparence ; ses six buissons fleuris ne sont pas utilisés — ils ne disaient pas « nourriture » |
| `baies.webp` | Le **buisson à baies** rouges et bleues sur son socle, l'originale et son miroir | Illustration générée par l'auteur du dépôt, avec transparence |
| `or.webp` | Le **gisement d'or** : rochers veinés d'or sur leur socle, 101×74 par case, l'originale et son miroir | Illustration générée par l'auteur du dépôt, avec transparence |
| `maison.webp` | La **maison** : un dôme de cristal, un toit bleu, une échoppe, 216×186, dessinée sur 108 px pour une emprise de 64 | Illustration générée par l'auteur du dépôt, livrée avec sa transparence |
| `archerie.webp`, `ecurie.webp`, `atelier-siege.webp`, `forge.webp` | Les quatre autres bâtiments **3×3** : cibles et râteliers de flèches, box à foin et selles, catapulte sous sa halle, forge à la cheminée fumante — 316 px de large, dessinés sur 158 | Illustrations générées par l'auteur du dépôt, livrées avec leur transparence |
| `moulin.webp`, `camp-bucherons.webp`, `camp-mineurs.webp`, `ferme.webp`, `tour-guet.webp` | Les cinq autres bâtiments **2×2** : ailes à voiles, billes et haches, galerie et wagonnet, potager et charrette de foin, tour au belvédère — 216 px de large, dessinés sur 108 | idem |
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

## Le villageois

La planche tient quatre orientations de marche (sud, nord, ouest, est — huit
pas chacune) et quatre poses de travail de quatre images : au repos, cueillir,
construire, porter une ressource. Les poses sont dessinées **d'un seul côté**
(la cueillette tournée vers l'ouest, le marteau et le rondin vers l'est) : le
jeu les retourne en miroir quand la cible est de l'autre côté. Une marche à
quatre orientations seulement : en diagonale, l'unité prend la cardinale la
plus proche.

Le fond n'était ni uni ni transparent : un dégradé sombre, un halo clair
derrière chaque personnage, des légendes. Une première chaîne maison
(`analyse-villageois.py`, `matte-villageois.py`) le retirait en deux passes :

1. **Croissance de région** depuis les bords, avec un seuil (7 niveaux) sur la
   différence entre pixels *voisins* : le dégradé et le halo sont doux, le
   contour des personnages est net. Quarante-huit composantes, une par image ;
   les légendes et les numéros, plus petits, sont écartés.
2. Les vues de côté y avaient perdu leurs jambes — pantalon brun sur halo brun,
   la croissance passait au travers. Dans chaque boîte, une **surface du second
   degré** par canal est ajustée sur les pixels tenus pour fond, et tout pixel
   qui s'en écarte de plus de 12 niveaux redevient personnage — dans la moitié
   basse seulement : derrière le torse, le halo culmine et la surface ne le suit
   pas, on y ramassait une ombre derrière les épaules. Fermeture de 2 px, trous
   bouchés. Cinquante-six mille pixels regagnés.

Il en restait des **trous et des zones mal reprises** : pantalons rongés,
jambes coupées, une pose de profil réduite à sa chemise, des bouts de fond
gardés. Le détourage est refait par **rembg** (modèle IS-Net, réseau de
segmentation d'objet saillant, licence MIT, sur processeur) : une passe par
personnage sur un recadrage centré sur son ancienne boîte, agrandi ×2, dont on
ne garde que les composantes du matte qui recouvrent la boîte — les voisins
qui dépassent dans le recadrage sont écartés (`rematte-villageois.py`). Le
matte est doux (anticrénelage conservé) et sans trou ; l'ombre portée peinte
sous les pieds, qui appartenait au halo, n'est plus reprise — le socle aux
couleurs du joueur tient ce rôle.

Chaque image est posée au bas de sa case, centrée ; un villageois debout fait
**40 px monde** (le chevalier : 44), atlas à 2× avec le même peps que les
bâtiments : 440×688 avant interpolation (cases de 55×86), **99 Ko** ; 1320×688 et
**226 Ko** avec les pas intermédiaires ; 2376×1044 et **324 Ko** avec le nord-est et les outils. La couleur d'équipe est celle du chevalier —
l'écharpe bleue bascule, la peau, le cuir et la chemise restent ; le test le
vérifie sur 14 440 pixels de peau.

### La cadence des pas

Les huit foulées de la planche n'alternent pas les pieds. Mesuré image par
image (`analyse-pas.py` : silhouette, bas des jambes, pied le plus bas à
gauche et à droite), le villageois vu de face pose deux fois le pied droit
puis **quatre fois le gauche** ; de dos, c'est à peine mieux. Plutôt que de
redessiner, `cadence-pas.py` retient six des huit images et les remet dans
l'ordre d'une vraie marche — neutre, droit, droit, neutre, gauche, gauche —
en écartant les doublons. Le moteur joue ces `sequences` par rangée
(`sprites.js`, `imageDeMarche`), toujours cadencées sur la distance
parcourue ; de profil, la mesure ne distingue pas les pieds et la planche est
jouée telle quelle. Le chevalier n'a pas d'image nette de chaque côté : rien
à remonter, il faudra une nouvelle planche.

### Le nord-est et les outils (planche Gemini)

Une seconde planche, obtenue avec Gemini à partir de la première, ajoute les
diagonales et des poses de travail. Seule la marche **nord-est** est retenue
(les autres diagonales y sont dessinées de dos ou de profil) ; le nord-ouest
est ce nord-est retourné (`miroirs` de l'atlas), et en sud-est et sud-ouest
l'unité prend le profil le plus proche, comme avant. Ses huit images posent la
même jambe cinq fois : elles sont remises dans l'ordre le plus lisse puis
interpolées ×3, comme les profils. Les poses **bûcheron** (hache, vers l'est),
**mineur** (pioche, vers l'ouest) et **boucher** (maillet sur une carcasse,
vers l'ouest) sont interpolées ×2 et retournées quand la cible est de l'autre
côté ; le repos de cette planche n'apporte rien et n'est pas repris. Les 48
sprites sont repérés sur le fond blanc (cartouches masqués par position) et
détourés par rembg ; l'échelle est calée sur la stature de la marche existante
(128 → 80 px). La hache levée déborde de l'ancienne case : la cellule passe à
**99×87**, toutes les rangées reposées sur la même ligne des pieds, et
`hauteurMonde` suit (40,5) pour garder la même taille à l'écran
(`fabrique-villageois-v4.py`).

### Des pas intermédiaires (RIFE)

Six à huit poses par foulée, cadencées sur la distance, font trois à six
images par seconde en jeu : l'œil voit les sauts. Plutôt que de redessiner,
`fabrique-villageois-rife.py` intercale **deux images entre chaque paire de
poses successives** avec RIFE (*Real-Time Intermediate Flow Estimation*,
Huang et coll. 2020, licence MIT — le binaire `rife-ncnn-vulkan`, modèle
v4.6, tourne sur processeur via lavapipe). Couleur et transparence sont
interpolées séparément : la couleur composée sur gris moyen, l'alpha en
niveaux de gris, puis les deux sont recombinés ; les images sont rembourrées
à un multiple de 32 px, sans quoi le binaire écrit de travers. Avant cela,
les miettes détachées sont effacées et les rangées de profil sont remises
dans l'ordre le plus lisse (cycle de moindre écart entre images successives,
départ pieds joints). Résultat : S et N 18 images, O et E 24, et la marche
chargée (« porter ») 12 ; repos, cueillir et construire restent à quatre.
Atlas 24 colonnes × 8 rangées de 55×86.

## L'éclaireur

La planche tient huit orientations × quatre foulées d'un cavalier à la lance,
lues du nord au nord-ouest dans le sens horaire ; l'atlas garde cet ordre et
le jeu remet chaque secteur sur sa ligne (`lignes` de la déclaration). La
transparence est fournie, renormalisée (99e centile → 255), et le voile
d'alpha autour des figures retiré sous 48. Chaque image est posée au bas de
sa case, centrée : le sabot le plus bas fait la ligne des pieds. Un cavalier
vu de face fait **54 px monde** — plus grand qu'un homme à pied (44), comme il
se doit — atlas à 2× avec le peps : 424×888, **145 Ko**. La cape et le tapis de
selle sont bleu franc et basculent ; la robe du cheval, brune, ne bouge pas —
le test le vérifie sur ses pixels.

## Le troupeau

Deux planches de cinq rangées (sud, sud-est, est, nord-est, nord) de
quatre images ; les trois secteurs de l'ouest reprennent les rangées de
l'est en miroir (`miroirs` dans l'atlas), soit huit orientations. Le cochon
est sur fond gris uni, détouré par distance au fond (`decoupe-cochon8.py`) ;
le cerf sur fond noir sans alpha : le noir est le fond, et les bords
antialiasés — couleur × alpha sur noir — sont dé-prémultipliés
(`decoupe-cerf8.py`), ce qui garde les sabots sombres. Ses pas ne s'alternaient pas :
mesuré au contour bas de chaque silhouette (`pattes.py`, un sabot est un
point bas local), de face les images lèvent le pied droit une fois et le
gauche deux fois, de dos l'inverse, et en trois quarts la même jambe avant
reste plantée sur les quatre images. Chaque rangée rejoue donc ses images
en balancier (`sequences` : repos, un pied, repos, l'autre ; en trois quarts,
l'aller-retour de la seule jambe qui bouge), sans saut — l'alternation
manquante des trois quarts, elle, ne peut venir que de la planche. Le cerf
s'en tire mieux : de profil et en trois quarts ses quatre images font un
vrai cycle ; de face il lève deux fois la même jambe (neutre, gauche,
neutre, droite), de dos il n'a pas de neutre (gauche, droite, gauche,
droite). Le détourage laissait un
liseré rouge et vert très saturé sur le pourtour (`decoupe-animaux.py`) : les
pixels de bord de cette teinte-là repassent en transparence, l'alpha est
renormalisé, puis chaque image est repérée par composantes connexes, réduite
à l'échelle du jeu — un cerf de profil fait 34 px monde, un cochon 22 — et
posée au bas de sa case, centrée, avec le peps commun. Une carcasse est le
profil couché sur le flanc, qui rapetisse à mesure qu'on la dépèce.

## Les bâtiments

L'illustration est en vue de trois quarts sur une carte vue de dessus — c'est
exactement le compromis d'Age of Empires, où bâtiments et unités sont dessinés
de trois quarts sur un sol plat. Le fond, un vert olive uni (écart-type 4 sur le
bord), part par un remplissage depuis les bords ; le sol peint autour du parvis
— rochers, buissons, dallage — est conservé : sur l'herbe du jeu, il fait un
parvis crédible.

Le bâtiment est dessiné **plus grand que son emprise** : 172 px de large pour
3 cases (96 px), posé par sa ligne de sol (93 % de la hauteur) sur le bord sud de
l'emprise. Le palais monte au-dessus des cases situées derrière lui, le parvis
déborde sur les cases praticables devant — les unités marchent dessus. Pour
qu'une unité qui longe le mur ne passe jamais *sous* le débord, le rendu classe
les bâtiments à leur **bord nord** dans l'ordre du peintre, pas à leur centre.

Les onze autres bâtiments suivent la même chaîne (`decoupe-batiment.py` :
fond, cadre, réduction, peps, aperçu) : les 3×3 sur 158 px pour rester un peu
moins larges que le palais, les 2×2 (maison, moulin, camps, ferme, tour de
guet) sur 108. Le script accepte les deux cas : un fond uni à retirer, ou une
transparence fournie (renormalisée, le détourage automatique laissant un voile
d'alpha).

Le **peps** (`peps.py`), appliqué à tous les atlas — bâtiments, arbres, baies,
or — après leur réduction : la réduction de 1254 à 150 px moyenne les pixels et
lisse les contrastes, et la première chaîne quantifiait à 64 couleurs, ce qui
aplatissait les dégradés. Trois corrections légères, dans cet ordre : un
masque flou (rayon 1,4, 55 %), +16 % de saturation, +10 % de contraste ; puis
un WebP avec pertes (qualité 86) dont l'alpha reste sans pertes. Avant de
filtrer, la couleur des pixels opaques est étendue sous les pixels
transparents voisins, sinon le masque flou aspire le fond retiré dans les
bords. Le palais pèse 71 Ko, un 3×3 une cinquantaine, un 2×2 entre 23 et 33 :
**490 Ko** pour les douze bâtiments.

La couleur d'équipe suit la règle du chevalier animé — seule la fenêtre du bleu
franc (200°–255°) bascule : dômes, toits, bannières et auvents passent au
rouge, la pierre blanche, l'eau cyan des fontaines et les cristaux ne bougent
pas. Un test le vérifie pixel à pixel pour chacun des douze.

## Le sol

Les textures sont des **nappes continues**, pas des tuiles : une case d'herbe
montre le morceau de nappe qui correspond à sa position dans le monde, et deux
cases voisines montrent deux morceaux contigus — rien ne trahit la grille. La
nappe se répète toutes les six cases (384 texels à 0,5 px monde par texel).

Générées, elles ne se raccordaient pas : écart de 70 à 120 niveaux entre le bord
droit et le bord gauche, pour un grain de 14 à 19. Trois traitements, dans
l'ordre (`textures-sol.py`) :

1. **Aplatissement** : ajustement d'un polynôme du second degré par canal, puis
   retrait des profils moyens par colonne et par ligne lissés périodiquement —
   le vignettage des images générées (centre plus clair que les bords) part,
   le grain reste.
2. **Fondu à quatre images** : l'originale, sa copie décalée d'une demi-période
   en x, en y, et dans les deux sens, pondérées par un produit de fenêtres 1-D
   (plateau au centre, rampe sur les bords). Chaque image pèse zéro exactement
   là où passe sa propre couture. Un fondu à *deux* images laissait la croix
   centrale de la copie visible près des bords : en jeu, une ligne claire à
   mi-période, mesurée à 15 niveaux au-dessus du bruit. À quatre images : 3.
3. Un second aplatissement, le fondu réintroduisant un léger biais de bord.

Réduites à 384 px et encodées en WebP avec pertes (qualité 72) : **149 Ko** pour
les quatre. Les couleurs moyennes des nappes servent à la minimap et à la tuile
de secours affichée le temps du chargement.

### Une herbe plus douce

Le gazon à rosettes de la planche, très saturé (0,80) et sombre, faisait un
tapis répétitif toutes les six cases. L'herbe est désormais la **prairie** de
la même planche (brins fins, pointes sèches), mêlée au gazon par un bruit
lisse sur une **période de 512 texels — huit cases** — pour casser la
répétition, puis calmée (`herbe-douce.py`) : saturation ramenée à 0,50, un
peu plus claire, moins de contraste, grain adouci d'un demi-pixel, teinte
tirée d'un rien vers le vert froid. L'herbe sombre est le gazon assombri et
désaturé. Une vraie texture peinte, dans le style des ornements, reste la
cible : voir la demande faite à l'auteur.

## L'eau, et ses bords

L'« eau pleine » de la planche est un **losange** en perspective isométrique,
alors que le sol du jeu est vu de dessus. `redresse-eau.py` la redresse : les
quatre sommets du losange (les extrêmes du masque) sont envoyés sur les coins
d'un carré par une transformation affine ajustée aux moindres carrés (résidu
4 px en x, 20 en y : le losange n'est pas tout à fait un parallélogramme), le
carré est rogné de 3 % — le bord du losange est dentelé —, réduit à 384 texels
puis traité comme les autres nappes : aplatissement, raccord à quatre images
(couture 36 → 5, pour un grain de 6). **16 Ko**.

L'eau n'est pas posée telle quelle : chaque rivage a ses **bords**, comme sur
les planches de plage et de rivage. Le rendu (`render.js`, `RIVAGE`) classe
les texels eau ou terre selon la même ligne ondulée que la couche d'eau, puis
une **transformée de distance** (chanfrein 3-4, sur une fenêtre élargie de 32 px
pour voir les rivages voisins) donne à chaque texel sa distance signée au
rivage, en cases — le champ interpolé des lisières ne convenait pas, il sature à
une demi-case du bord et l'ondulation seule aurait fait des taches au large.
Trois bandes en découlent : une **frange de sable** côté terre (de −0,55 à
0,15, la nappe de sable sous l'eau), un **haut-fond** turquoise côté eau
(jusqu'à 0,45) et une **ligne d'écume** blanche (de 0 à 0,2), striée par un
bruit plus fin pour qu'elle se rompe comme un ressac. Trois masques de plus par
tronçon riverain, composés comme les couches de terrain.

## Le décor de la carte : rivages et campagne

Les planches « eau-plage », « eau-rivage » et « eau-mare » ne montrent pas que
de l'eau : des rochers, des galets, des touffes d'herbe, des roseaux à
massettes, des nénuphars et des fleurs bordent leurs rives. Plutôt que d'en
faire des tuiles de bordure à tourner — ces pièces sont vues de trois quarts,
un rocher tourné d'un quart de tour changerait d'éclairage —, elles sont
**découpées une à une** et le jeu les pose lui-même le long de chaque rive,
quelle qu'en soit la forme (`js/decor.js`).

La découpe (`decoupe-rivage.py`, `decoupe-rivage2.py`) classe les pixels par
teinte : gris peu saturé pour la roche, vert-jaune clair pour l'herbe, plus
les massettes brunes pour les roseaux, bleu franc pour les fleurs. Fermeture
morphologique, trous bouchés, composantes connexes ; les touffes et les
roseaux prennent une fermeture large (7 px) pour réunir les brins d'un même
pied, avec un alpha fin (le masque d'origine dilaté d'un pixel) pour ne pas
emporter le sable entre les brins. L'écume et l'eau prises dans les creux des
amas repartent en transparence. Quarante-six pièces retenues à la main, à
0,21 pixel monde par pixel de planche (atlas à 2×), même peps que le reste.

À ces pièces s'ajoutent, pour le reste de la carte, des **touffes d'herbe
verte** (les deux touffes sombres de la mare, et les touffes sèches
reteintées : teinte tirée vers le vert, moins vive, plus sombre), des
**fleurs en quatre couleurs** (la fleur bleue, dont seuls les pixels bleus
changent — jaune, rose, blanc —, les feuilles restent) et les **six buissons
fleuris** de la planche d'arbres, qui n'avaient pas convaincu comme
nourriture mais font de beaux buissons, à 0,72 de leur taille d'alors.

Puis une **planche d'ornements** est arrivée, à fond transparent celle-là :
vingt-huit pièces sur leur socle de pierre — touffes, buissons fleuris de
toutes les couleurs, fougères, couvre-sol et lierre, agaves, une pampa, des
roseaux à massettes. Découpe par composantes connexes sur l'alpha
(`decoupe-ornements.py`), à 0,40 pixel monde par pixel de planche : un
buisson fait un peu plus d'une case. Chaque pièce est classée selon le sol où
elle poussera — buissons et couvre-sol sur les prés, fougères et couvre-sol
au pied des forêts, agaves et pampas sur la terre et le sable, roseaux et
fougères autour des mares.

Le plantage est déterministe : un hachage de la case et de la graine décide
de tout, la simulation n'en sait rien, et une partie reprise retrouve son
décor. Chaque case de terre qui touche l'eau reçoit, au plus, un rocher (ou
un amas, rare) vers l'eau, une touffe côté terre ou des roseaux les pieds
dans l'eau, un à trois galets, une fleur ; les cases d'eau bordières des
mares portent des nénuphars. Un **plan d'eau de 40 cases ou moins** est une
mare, ceinte de rochers serrés, de roseaux et de nénuphars comme la planche
« eau-mare » ; au-delà, un lac prend la plage de « eau-rivage » : rochers
épars, galets, touffes. Partout ailleurs, la
**campagne** suit le sol : herbe, fleurs en bouquets d'une couleur, buissons
et couvre-sol sur les prés ; cailloux, agaves, pampas et touffes sèches sur la
terre et le sable ; fougères, couvre-sol et un peu plus de tout au pied des
forêts — une seule pièce de volume par case.

Rochers, amas, roseaux, buissons, fougères, agaves et pampas entrent dans
l'ordre du peintre avec les unités, et ne sont pas dessinés sous un bâtiment
ni dans le brouillard. Le reste — galets, nénuphars, fleurs, touffes,
couvre-sol — est **cuit dans les tronçons de sol** mis en cache, une fois pour toutes : sans cela, les quelque six cents
petites pièces visibles à zoom arrière coûtaient six millisecondes par image.
Une pièce à cheval sur deux tronçons est peinte dans les deux, aux mêmes
coordonnées, et les tronçons cuits avant l'arrivée de l'atlas sont refaits.

## Les arbres, les baies et l'or

La planche est livrée avec sa transparence, mais aucun pixel n'y est tout à
fait opaque — le détourage automatique laisse un voile d'alpha (252 au lieu de
255) : il est renormalisé sur le 99ᵉ centile. Les sprites sont repérés par
**composantes connexes** (parcours en largeur sur un masque `alpha > 64`) :
la simple projection par colonnes agglomérait les arbres, dont les socles de
rochers et les branches se touchent presque.

Une seule échelle pour toute la planche, qui garde ses proportions : l'arbre
le plus haut (le cyprès) fait **95 px monde**, soit trois cases, deux chevaliers ; les
buissons tombent autour de 36 px, la taille d'une case. Chaque case d'atlas a
son sprite posé au bas et centré : l'ancre est le bas de la case, le socle de
rochers vient s'asseoir sur la case de la carte. Atlas à deux fois la taille
dessinée, WebP avec pertes et transparence : **17 + 29 Ko**.

En jeu, arbres et buissons sont plus hauts que leur case : ils sont classés
dans l'**ordre du peintre** avec les unités et les bâtiments, au pied de leur
case — une unité qui passe derrière un arbre passe derrière. Un gisement qui
s'épuise rapetisse un peu (jusqu'à 80 %) : de loin, on voit ce qu'il reste à
prendre.

Le buisson à baies et le gisement d'or suivent la même voie : une seule
illustration chacun, mise en atlas avec son miroir, et une pointe de variation
de taille par case (±8 %, figée par la variante de la case) pour qu'un filon de
sept cases ne soit pas une frise. Les six buissons fleuris de la planche des
arbres ont été essayés pour la nourriture : jolis, mais ils ne disaient pas
« à manger » ; les baies, si.

## Format

WebP partout où c'est possible : 1,1 Mo pour l'ensemble, contre bien plus d'un mégaoctet en
PNG, sans différence visible à l'œil même agrandi trois fois.
