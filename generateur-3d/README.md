# Atelier 3D

Donnez une photo d'objet à l'Atelier 3D : il crée un **modèle 3D complet et texturé**, visible sous tous les angles, que vous pouvez faire tourner à l'écran et télécharger.

- **Gratuit et 100 % local** : tout est calculé sur votre ordinateur. Pas d'abonnement, pas de clé API, aucune photo envoyée sur Internet.
- **Sans carte graphique** : fonctionne sur un ordinateur ordinaire. Une carte graphique NVIDIA est utilisée automatiquement si elle est présente.
- **Fichiers standards** : GLB (sites web, PowerPoint…) et OBJ + texture (Blender, SketchUp…).

## Comment ça marche

1. **Détourage** : le fond de la photo est supprimé automatiquement.
2. **Analyse** : le modèle d'IA open source [TripoSR](https://github.com/VAST-AI-Research/TripoSR) déduit la forme 3D complète de l'objet, y compris le côté qu'on ne voit pas sur la photo.
3. **Volume** : cette forme est convertie en maillage 3D, lissé et allégé.
4. **Texture** : la vraie photo est projetée sur la face visible de l'objet, pour garder tous ses détails. Les côtés cachés reçoivent les couleurs estimées par l'IA, avec une transition douce entre les deux.
5. **Export** : le modèle est enregistré en GLB et en OBJ, avec une image de texture.

## Ce qu'il faut

| | Minimum | Conseillé |
|---|---|---|
| Système | Windows 10/11, macOS ou Linux | |
| Python | 3.11, 3.12 ou 3.13 | **3.12** |
| Mémoire vive | 8 Go | 16 Go |
| Espace disque | 6 Go (bibliothèques + modèles IA) | |
| Internet | pour l'installation et le premier lancement | |

Une fois installé et lancé une première fois, l'Atelier fonctionne sans Internet.

## Installation

### Windows

1. Installez **Python 3.12** depuis [python.org](https://www.python.org/downloads/). Pendant l'installation, **cochez la case « Add python.exe to PATH »**.
2. Double-cliquez sur **`installer.bat`**. Comptez 5 à 15 minutes selon la connexion.
3. Double-cliquez sur **`lancer.bat`**. L'Atelier s'ouvre dans votre navigateur.

Au premier lancement, les modèles d'IA (environ 2 Go) sont téléchargés : l'indicateur en haut à droite passe à « Prêt » une fois le téléchargement fini.

### macOS et Linux

Dans un terminal, depuis ce dossier :

```bash
./installer.sh
./lancer.sh
```

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
- **Blender** : Fichier › Importer › glTF 2.0 (GLB) ou Wavefront (OBJ).

## Dépannage

- **« Python est introuvable »** : réinstallez Python 3.12 en cochant « Add python.exe to PATH ».
- **Le premier lancement reste sur « Chargement du modèle IA »** : les modèles se téléchargent (environ 2 Go). Vérifiez la connexion Internet et patientez.
- **« Mémoire insuffisante »** : fermez d'autres programmes ou utilisez la qualité « Rapide ».
- **La page ne s'ouvre pas toute seule** : ouvrez l'adresse affichée dans la fenêtre noire (par exemple `http://127.0.0.1:7860/`).
- **Carte graphique NVIDIA récente (RTX 50xx)** : si la création échoue avec une erreur CUDA, installez la version CUDA 13 de PyTorch : `.venv\Scripts\python.exe -m pip install --force-reinstall torch --index-url https://download.pytorch.org/whl/cu130`.

## Licences

Tous les composants peuvent être utilisés à des fins commerciales :

| Composant | Rôle | Licence |
|---|---|---|
| [TripoSR](https://github.com/VAST-AI-Research/TripoSR) (Tripo AI et Stability AI) | reconstruction 3D ; code adapté dans `tsr/` | MIT |
| [DIS / isnet-general-use](https://github.com/xuebinqin/DIS), via [rembg](https://github.com/danielgatis/rembg) | détourage | Apache 2.0 / MIT |
| [three.js](https://threejs.org/) | visionneuse 3D, copie dans `interface/vendor/three/` | MIT |
| Bricolage Grotesque, Atkinson Hyperlegible | polices de l'interface | SIL OFL 1.1 |

Le modèle de détourage par défaut des versions récentes de rembg (BRIA RMBG 2.0) est réservé à un usage non commercial. L'Atelier ne l'utilise pas : il demande explicitement `isnet-general-use`.

Le code de TripoSR a été modifié sur un point : le calcul du maillage utilise scikit-image au lieu de torchmcubes, qui demande une compilation.
