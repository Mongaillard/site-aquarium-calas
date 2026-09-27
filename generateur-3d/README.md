# Atelier 3D

Donnez une photo d'objet à l'Atelier 3D : il crée un **modèle 3D complet et texturé**, visible sous tous les angles, que vous pouvez faire tourner à l'écran et télécharger.

- **Gratuit et 100 % local** : tout est calculé sur votre ordinateur. Pas d'abonnement, pas de clé API, aucune photo envoyée sur Internet.
- **Sans carte graphique** : fonctionne sur un ordinateur ordinaire. Une carte graphique NVIDIA est utilisée automatiquement si elle est présente.
- **Fichiers standards** : GLB (sites web, PowerPoint, SketchUp…) et OBJ + texture (Blender…).

## Comment ça marche

1. **Détourage** : le fond de la photo est supprimé automatiquement.
2. **Analyse** : le modèle d'IA open source [TripoSR](https://github.com/VAST-AI-Research/TripoSR) déduit la forme 3D complète de l'objet, y compris le côté qu'on ne voit pas sur la photo.
3. **Volume** : cette forme est convertie en maillage 3D, lissé et allégé.
4. **Texture** : la vraie photo est projetée sur la face visible de l'objet, pour garder tous ses détails. Les côtés cachés reçoivent les couleurs estimées par l'IA, avec une transition douce entre les deux, ou la photo en miroir pour un objet symétrique.
5. **Export** : le modèle est enregistré en GLB et en OBJ, avec une image de texture.

## Ce qu'il faut

| | Minimum | Conseillé |
|---|---|---|
| Système | Windows 10/11 64 bits (processeur Intel ou AMD), macOS sur Mac à puce Apple (M1 ou plus récent), ou Linux | |
| Python | 3.11, 3.12 ou 3.13, en 64 bits (**pas 3.14**, pas encore compatible) | **3.13** |
| Mémoire vive | 8 Go | 16 Go |
| Espace disque | 6 Go sans carte NVIDIA, 11 Go avec une carte NVIDIA | |
| Internet | pour l'installation et le premier lancement | |

Les Mac à processeur Intel ne sont pas pris en charge : PyTorch n'y est plus mis à jour.

Une fois installé et lancé une première fois, l'Atelier fonctionne sans Internet.

## Installation

### Windows

1. Installez **Python 3.13 (64 bits)** : sur [cette page](https://www.python.org/downloads/release/python-31315/), choisissez « Windows installer (64-bit) ». Pendant l'installation, **cochez la case « Add python.exe to PATH »**. N'installez pas Python 3.14, que proposent les gros boutons de python.org : il n'est pas encore compatible. Si vous utilisez le gestionnaire d'installation de Python, la commande `py install 3.13-64` fait la même chose.
2. **Décompressez** le dossier de l'Atelier (clic droit › Extraire tout) dans un emplacement court, par exemple `C:\Atelier3D`.
3. Double-cliquez sur **`installer.bat`**. Comptez 5 à 15 minutes selon la connexion, et jusqu'à une heure avec une carte NVIDIA (2,6 Go à télécharger en plus).
4. Double-cliquez sur **`lancer.bat`**. L'Atelier s'ouvre dans votre navigateur. Laissez la fenêtre noire ouverte : la fermer arrête l'Atelier.

Au premier lancement, les modèles d'IA (environ 2 Go) sont téléchargés : l'indicateur en haut à droite passe à « Prêt » une fois le téléchargement fini.

### macOS et Linux

Dans un terminal, depuis ce dossier :

```bash
./installer.sh
./lancer.sh
```

Sous Debian ou Ubuntu, installez d'abord le module d'environnements Python : `sudo apt install python3-venv` (ou `python3.12-venv` selon votre version).

## Utilisation

1. **Déposez une photo** dans le cadre de gauche : glisser-déposer, clic pour choisir un fichier, ou copier-coller avec Ctrl+V.
2. Choisissez la **qualité** :

   | Qualité | Durée mesurée* | Détail |
   |---|---|---|
   | Rapide | ≈ 30 s | maillage 192³, texture 1024 px |
   | Standard | ≈ 1 min | maillage 256³, texture 2048 px |
   | Fine | ≈ 2 min | maillage 320³, texture 2048 px |

   \* Mesurées sur un processeur 4 cœurs sans carte graphique : 31 s, 45 à 73 s et 114 s selon la photo. Avec une carte graphique NVIDIA, c'est beaucoup plus rapide.
3. **Poisson photographié de profil ?** Activez **« Côté caché en miroir de la photo »** : le côté invisible reprend la photo en miroir au lieu des couleurs estimées par l'IA, beaucoup plus floues. À éviter pour un objet qui porte du texte, qui apparaîtrait à l'envers.
4. Cliquez sur **Créer le modèle 3D** et suivez les étapes.
5. Le modèle s'affiche en 3D : faites-le tourner à la souris, zoomez avec la molette, changez le fond (clair, sombre, aquarium) et comparez-le avec la photo d'origine.
6. Récupérez vos fichiers :
   - **Télécharger GLB** : un seul fichier, texture incluse ;
   - **OBJ + texture** : un zip avec `modele.obj`, `modele.mtl` et `texture.png` ;
   - **Capture PNG** : une image de la vue affichée ;
   - **Ouvrir le dossier** : tous les fichiers du modèle.

Tous les modèles sont rangés dans le dossier `resultats/` et listés dans **Mes modèles**, en bas de la page.

### En ligne de commande

Pour traiter plusieurs photos d'un coup :

```bash
.venv/bin/python generer.py poisson.jpg decor.png --qualite fine
# Windows : .venv\Scripts\python.exe generer.py poisson.jpg decor.png --qualite fine
```

Options : `--qualite rapide|standard|fine`, `--symetrique`, `--sans-detourage`, `--sortie dossier`, `--appareil auto|cpu|cuda|mps`.

## Conseils pour de bonnes photos

- **Un seul objet**, entier dans le cadre, sans autre objet qui le touche ou le chevauche.
- **Un fond uni** qui contraste avec l'objet, et une lumière douce, sans reflets forts.
- **Légèrement de trois quarts** et un peu au-dessus : l'IA comprend mieux le volume qu'avec une vue parfaitement de face ou de profil.
- Une photo déjà détourée (PNG à fond transparent) est reconnue et utilisée telle quelle.

## Limites à connaître

- **Le côté caché est imaginé par l'IA** : il est vraisemblable mais moins précis et plus flou que la face photographiée.
- **Une photo = un objet.** Une scène complète (aquarium entier, pièce) ne donne pas un bon résultat. Si deux objets se touchent sur la photo, par exemple deux poissons qui se chevauchent, ils forment un seul modèle.
- Les matières **transparentes ou très brillantes** (verre, eau, métal poli) et les éléments **très fins** (nageoires translucides, fils) sont difficiles à reconstruire.
- Les modèles sont faits pour être vus à l'écran (site web, présentation, catalogue). Pour une impression 3D, prévoyez des retouches dans un logiciel comme Blender.

## Utiliser les modèles

- **Site web** : le fichier GLB s'affiche avec [`<model-viewer>`](https://modelviewer.dev/) ou [three.js](https://threejs.org/).
- **PowerPoint / Word** (Microsoft 365) : Insertion › Modèles 3D › à partir d'un fichier GLB.
- **SketchUp** : Fichier › Importer › fichier GLB.
- **Blender** : Fichier › Importer › glTF 2.0 (GLB) ou Wavefront (OBJ).

## Dépannage

- **« Python est introuvable »** ou version refusée : installez Python 3.13 en 64 bits (voir Installation) en cochant « Add python.exe to PATH ». Le programme d'installation affiche la version qu'il a trouvée et la raison du refus.
- **L'installation échoue** : lisez le message affiché juste au-dessus. Causes fréquentes : connexion Internet coupée, disque plein, antivirus, ou dossier non décompressé. Relancer `installer.bat` répare une installation interrompue.
- **Le premier lancement reste sur « Chargement du modèle IA »** : les modèles se téléchargent (environ 2 Go). Vérifiez la connexion Internet et patientez.
- **Petite carte graphique NVIDIA** : l'Atelier n'utilise la carte que si elle a au moins 4 Go de mémoire, sinon il calcule sur le processeur. En cas d'erreur liée à la carte graphique, forcez le processeur : dans l'Explorateur, ouvrez le dossier de l'Atelier, tapez `cmd` dans la barre d'adresse puis Entrée, et lancez `lancer.bat --appareil cpu` (sur macOS ou Linux : `./lancer.sh --appareil cpu`).
- **« Mémoire insuffisante »** : fermez d'autres programmes ou utilisez la qualité « Rapide ».
- **La page ne s'ouvre pas toute seule** : ouvrez l'adresse affichée dans la fenêtre noire (par exemple `http://127.0.0.1:7860/`).
- **Carte graphique NVIDIA récente (RTX 50xx)** : si la création échoue avec une erreur CUDA, installez la version CUDA 13 de PyTorch : `.venv\Scripts\python.exe -m pip install --force-reinstall --no-deps torch --index-url https://download.pytorch.org/whl/cu130`.
- **Microsoft Visual C++** : PyTorch a besoin du « Visual C++ Redistributable », présent sur la plupart des PC. S'il manque, le programme d'installation le signale ; installez-le depuis https://aka.ms/vs/17/release/vc_redist.x64.exe.

## Licences

Les composants choisis autorisent un usage commercial :

| Composant | Rôle | Licence |
|---|---|---|
| [TripoSR](https://github.com/VAST-AI-Research/TripoSR) (Tripo AI et Stability AI), code et poids | reconstruction 3D ; code adapté dans `tsr/` | MIT ; les fichiers de `tsr/models/transformer/`, dérivés de diffusers, sont sous Apache 2.0 |
| [U-2-Net](https://github.com/xuebinqin/U-2-Net) (`u2net`), via [rembg](https://github.com/danielgatis/rembg) | détourage | dépôt U-2-Net, qui publie aussi les poids du modèle : Apache 2.0 ; rembg : MIT |
| [three.js](https://threejs.org/) | visionneuse 3D, copie dans `interface/vendor/three/` | MIT |
| Bricolage Grotesque, Atkinson Hyperlegible | polices de l'interface | SIL OFL 1.1 |

Le choix du modèle de détourage est volontaire. rembg propose d'autres modèles dont les poids ont chacun leur licence : celui qu'il utilise par défaut dans ses versions récentes (BRIA RMBG 2.0) est réservé à un usage non commercial, et `isnet-general-use` a été entraîné sur un jeu de données non commercial. L'Atelier demande donc explicitement `u2net`.

Modifications apportées au code de TripoSR : le calcul du maillage (`isosurface.py`) utilise scikit-image au lieu de torchmcubes, qui demande une compilation ; la configuration du modèle DINO est lue dans le cache local avant Internet (`tokenizers/image.py`) ; les fonctions inutilisées de `utils.py` (détourage, vidéo, orientation) ont été retirées ; `bake_texture.py` n'a pas été repris, la texture étant calculée par `moteur/texture.py`.
