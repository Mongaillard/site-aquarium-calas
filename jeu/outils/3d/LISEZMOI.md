# Chaîne des essais de 3D

Scripts qui ont produit `assets/chevalier-3d.webp` et `assets/chevalier-3d.glb`
(voir « Deux essais de 3D » dans `assets/SOURCES.md`). Pour un autre modèle
glTF riggé : copier `chevalier.json`, y mettre les pièces à garder, les noms
des animations et le cadrage, puis :

```bash
python -m venv venv && venv/bin/pip install bpy==4.2.0 pillow numpy   # Python 3.11
venv/bin/python rendu_atlas.py -- modele.glb images/ chevalier.json    # 8 directions × animations
venv/bin/python monter_atlas.py images/ ../../assets/xxx-3d.webp chevalier.json
venv/bin/python alleger.py -- modele.glb ../../assets/xxx-3d.glb chevalier.json
```

`rendu_atlas.py` affiche aussi la foulée mesurée (le pied par rapport au
bassin) et l'ancre des pieds : ce sont `cycle` et `ancreY` de l'atlas dans
`js/sprites.js`. La caméra (`elevation`, `ortho`, `cibleZ`) doit rester la même
que `modele3d.camera` de l'atlas, pour que le rendu en direct s'y superpose.
