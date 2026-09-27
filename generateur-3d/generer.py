"""Génère des modèles 3D texturés en ligne de commande.

Exemples :
    python generer.py photo.jpg
    python generer.py poisson.jpg decor.png --qualite fine --sortie mes_modeles
"""
import argparse
import os
import re
import sys
import time

DOSSIER_APPLI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DOSSIER_APPLI)


def nom_dossier(chemin):
    base = os.path.splitext(os.path.basename(chemin))[0]
    base = re.sub(r"[^A-Za-z0-9_-]+", "-", base).strip("-")[:40] or "modele"
    return f"{time.strftime('%Y%m%d-%H%M%S')}-{base}"


def main():
    parser = argparse.ArgumentParser(description="Transforme une photo d'objet en modèle 3D texturé (GLB + OBJ).")
    parser.add_argument("photos", nargs="+", help="photo(s) à transformer (JPG, PNG, WebP…)")
    parser.add_argument("--qualite", choices=["rapide", "standard", "fine"], default="standard")
    parser.add_argument("--sans-detourage", action="store_true",
                        help="ne pas supprimer le fond (photo déjà sur fond uni ou déjà détourée)")
    parser.add_argument("--symetrique", action="store_true",
                        help="le côté caché reprend la photo en miroir (poisson photographié de profil…)")
    parser.add_argument("--sortie", default=os.path.join(DOSSIER_APPLI, "resultats"),
                        help="dossier où ranger les modèles (par défaut : resultats/)")
    parser.add_argument("--appareil", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    args = parser.parse_args()

    from moteur.pipeline import ETAPES, Generateur3D

    libelles = {cle: libelle for cle, libelle, _ in ETAPES}
    generateur = Generateur3D(appareil=args.appareil)
    print(f"Chargement du modèle IA sur « {generateur.appareil} » "
          "(la première fois, environ 2 Go sont téléchargés)…")
    generateur.charger()

    for chemin in args.photos:
        print(f"\n▶ {chemin}")
        derniere = [None]

        def rappel(cle, fraction):
            if cle != derniere[0]:
                derniere[0] = cle
                print(f"  {int(fraction * 100):3d} %  {libelles[cle]}…")

        dossier = os.path.join(args.sortie, nom_dossier(chemin))
        try:
            infos = generateur.generer(chemin, dossier, qualite=args.qualite,
                                       detourage_auto=not args.sans_detourage,
                                       nom=os.path.basename(chemin), rappel=rappel,
                                       symetrique=args.symetrique)
        except Exception as erreur:  # on continue avec les photos suivantes
            print(f"  ✗ échec : {erreur}")
            continue
        print(f"  ✓ terminé en {infos['duree_secondes']} s → {os.path.join(dossier, 'modele.glb')}")


if __name__ == "__main__":
    main()
