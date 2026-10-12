"""Monte un atlas de personnage 3D : 8 directions × animations, une rangée par direction.

Usage : python monter_atlas.py dossier_des_images sortie.webp config.json
Les images viennent de rendu_atlas.py (nom_direction_image.png).
"""
import sys, json
import numpy as np
from PIL import Image

dossier, sortie, cfg = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
C = cfg['cellule']
anims = [(a['nom'], a['images']) for a in cfg['animations']]


def etendre(rgba, passes=4):
    """Étend la couleur des pixels opaques sous les transparents voisins : sans
    ça, l'encodage avec pertes salit les bords avec le noir du fond."""
    a = np.asarray(rgba).astype(float)
    rgb, cov = a[..., :3], a[..., 3] / 255
    for _ in range(passes):
        p = np.pad(rgb * cov[..., None], ((1, 1), (1, 1), (0, 0)))
        c = np.pad(cov, 1)
        ps = sum(p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        cs = sum(c[1 + dy:c.shape[0] - 1 + dy, 1 + dx:c.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        remplir = (cov < 0.01) & (cs > 0)
        rgb = np.where(remplir[..., None], ps / np.maximum(cs, 1e-6)[..., None], rgb)
        cov = np.where(remplir, 1.0, cov)
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')


largeur = max(n for _, n in anims) * C
atlas = Image.new('RGBA', (largeur, 8 * len(anims) * C), (0, 0, 0, 0))
for j, (nom, n) in enumerate(anims):
    for k in range(8):
        for i in range(n):
            im = Image.open(f'{dossier}/{nom}_{k}_{i:02d}.png').convert('RGBA')
            atlas.alpha_composite(im, (i * C, (j * 8 + k) * C))
alpha = atlas.getchannel('A')
# Le rendu tel quel : net, à la couleur de sa texture — le style « 3D en direct »
# affiche le même modèle et doit s'y superposer.
rgb = etendre(atlas)
rgb.putalpha(alpha)
rgb.save(sortie, 'WEBP', quality=86, method=6, alpha_quality=100)
print(atlas.size)
