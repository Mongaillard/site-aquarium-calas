# Illustrations

| Fichier | Contenu | Origine |
| --- | --- | --- |
| `heros.webp` | Chevalier en pied, vue de face | Planche de personnage générée par l'auteur du dépôt, découpée et détourée pour le jeu |
| `portrait-milicien.webp` | Buste du même chevalier | idem |
| `defaite.webp` | Le chevalier à terre (dernière image de l'animation de mort) | idem |
| `chevalier.webp` | Atlas des **huit orientations** du chevalier, sprite du milicien sur la carte | idem |
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

Format WebP : 70 Ko pour les quatre fichiers, contre 205 Ko en PNG, sans différence
visible à l'œil même agrandi trois fois.
