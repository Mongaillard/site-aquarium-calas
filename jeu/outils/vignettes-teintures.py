#!/usr/bin/env python3
# ---------------------------------------------------------------------------
# Les vignettes d'une teinture : le soldat de chaque peuple, dans cette matière.
#
#     python3 outils/vignettes-teintures.py feuFollet pourpre neige
#     python3 outils/vignettes-teintures.py --planche essai.jpg feuFollet neige
#
# Pour chaque matière nommée (une clé de TEINTURES, js/teintures.js), le script
# prend la vignette d'origine de chaque peuple (assets/teintures/origine-….webp),
# la passe par `teindrePixels` — la fonction même qui teint les troupes en
# partie — et écrit assets/teintures/<matière>-<peuple>.webp, 112 × 112.
# `--planche` écrit en plus une image de comparaison, l'origine à gauche : c'est
# elle qu'on regarde avant de garder un réglage.
#
# À refaire dès qu'une matière change de réglage. Il faut Node et Pillow
# (`pip install pillow`) ; rien n'est téléchargé.
# ---------------------------------------------------------------------------

import os
import subprocess
import sys

from PIL import Image

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DOSSIER = os.path.join(RACINE, 'assets', 'teintures')
# (Le soldat de chaque vignette : son modèle dit quelles fenêtres de couleur la teinture lui applique.)
PEUPLES = [('atlante', 'militia'), ('solarien', 'solMilitia')]
COTE = 112

TEINDRE = """
import fs from 'node:fs';
const [racine, matiere, modele] = process.argv.slice(1);
const { teindrePixels, reglesDeTeinture, acierDeTeinture, TEINTURES } = await import(racine + '/js/teintures.js');
if (!TEINTURES[matiere]) { console.error('Matière inconnue : ' + matiere + ' (connues : ' + Object.keys(TEINTURES).join(', ') + ')'); process.exit(1); }
const pixels = new Uint8ClampedArray(fs.readFileSync(0));
teindrePixels(pixels, reglesDeTeinture(matiere, modele), acierDeTeinture(matiere, modele));
process.stdout.write(Buffer.from(pixels.buffer));
"""


def teindre(image, matiere, modele):
    """La vignette `image`, teinte dans cette matière pour ce modèle de troupe."""
    r = subprocess.run(['node', '--input-type=module', '-e', TEINDRE, RACINE, matiere, modele],
                       input=image.tobytes(), capture_output=True)
    if r.returncode:
        sys.exit(r.stderr.decode('utf-8').strip())
    return Image.frombytes('RGBA', image.size, r.stdout)


def main(arguments):
    planche = None
    if arguments[:1] == ['--planche']:
        planche, arguments = arguments[1], arguments[2:]
    if not arguments:
        sys.exit('Usage : python3 outils/vignettes-teintures.py [--planche image.jpg] <matière> [<matière>…]')
    feuille = Image.new('RGBA', (COTE * (len(arguments) + 1), COTE * len(PEUPLES)), '#fff4dc')
    for ligne, (peuple, modele) in enumerate(PEUPLES):
        origine = Image.open(os.path.join(DOSSIER, f'origine-{peuple}.webp')).convert('RGBA')
        assert origine.size == (COTE, COTE), origine.size
        feuille.alpha_composite(origine, (0, ligne * COTE))
        for colonne, matiere in enumerate(arguments):
            teinte = teindre(origine, matiere, modele)
            teinte.save(os.path.join(DOSSIER, f'{matiere}-{peuple}.webp'), quality=92, method=6)
            feuille.alpha_composite(teinte, ((colonne + 1) * COTE, ligne * COTE))
            print(f'assets/teintures/{matiere}-{peuple}.webp')
    if planche:
        feuille.resize((feuille.width * 2, feuille.height * 2), Image.NEAREST).convert('RGB').save(planche, quality=92)
        print(planche)


if __name__ == '__main__':
    main(sys.argv[1:])
