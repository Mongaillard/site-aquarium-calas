"""Chaîne complète : photo -> modèle 3D texturé (GLB + OBJ)."""
import json
import os
import shutil
import tempfile
import threading
import time
import zipfile
from datetime import datetime

import numpy as np
import torch
import trimesh
from PIL import Image

from . import detourage, texture

MODELE_PAR_DEFAUT = "stabilityai/TripoSR"

QUALITES = {
    "rapide": {"maillage": 192, "texture": 1024, "faces_max": 40000},
    "standard": {"maillage": 256, "texture": 2048, "faces_max": 80000},
    "fine": {"maillage": 320, "texture": 2048, "faces_max": 120000},
}

# Étapes affichées dans l'interface, avec leur poids approximatif dans la durée totale.
ETAPES = [
    ("preparation", "Détourage de la photo", 0.08),
    ("analyse", "Analyse de la forme par l'IA", 0.17),
    ("maillage", "Construction du volume 3D", 0.45),
    ("texture", "Calcul de la texture", 0.22),
    ("export", "Enregistrement des fichiers", 0.08),
]


class VolumeIntrouvable(Exception):
    """L'IA n'a reconstruit aucune surface à partir de la photo."""


def choisir_appareil(preference="auto"):
    if preference == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    if preference == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("Aucune carte graphique NVIDIA (CUDA) n'est disponible.")
    if preference == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("L'accélération Apple (MPS) n'est pas disponible sur cet ordinateur.")
    return preference


class Progression:
    """Traduit l'avancement des étapes en une fraction globale 0..1."""

    def __init__(self, rappel=None):
        self.rappel = rappel
        self.debuts = {}
        cumul = 0.0
        for cle, _, poids in ETAPES:
            self.debuts[cle] = (cumul, poids)
            cumul += poids

    def etape(self, cle, avancement=0.0):
        if self.rappel:
            debut, poids = self.debuts[cle]
            self.rappel(cle, min(1.0, debut + poids * avancement))


class Generateur3D:
    """Charge les modèles une fois, puis transforme des photos en modèles 3D."""

    def __init__(self, appareil="auto", modele=MODELE_PAR_DEFAUT):
        self.appareil = choisir_appareil(appareil)
        self.nom_modele = modele
        self.model = None
        self.detoureur = detourage.Detoureur()
        self._verrou = threading.Lock()

    def charger(self):
        """Charge TripoSR (téléchargé automatiquement la première fois, ~1,7 Go)."""
        from tsr.system import TSR

        model = TSR.from_pretrained(self.nom_modele, config_name="config.yaml",
                                    weight_name="model.ckpt")
        model.renderer.set_chunk_size(65536 if self.appareil == "cpu" else 32768)
        model.to(self.appareil)
        model.eval()
        self.model = model
        # prépare aussi le détourage (téléchargement de ~180 Mo la première fois)
        self.detoureur._session_rembg()

    def generer(self, photo, dossier_sortie, qualite="standard", detourage_auto=True,
                nom="", rappel=None, symetrique=False):
        """Crée le modèle 3D d'une photo.

        photo : chemin ou image PIL. dossier_sortie : dossier créé s'il n'existe pas.
        symetrique : le côté caché reprend la photo en miroir (poisson de profil…).
        rappel(cle_etape, fraction_globale) : suivi de l'avancement (optionnel).
        Renvoie le dictionnaire d'informations enregistré dans infos.json.
        """
        if self.model is None:
            self.charger()
        reglages = QUALITES[qualite]
        suivi = Progression(rappel)
        debut = time.time()
        with self._verrou, torch.no_grad():
            # 1. photo
            suivi.etape("preparation")
            image = photo if isinstance(photo, Image.Image) else detourage.ouvrir_photo(photo)
            deja_transparente = detourage.deja_detouree(image)
            cadree = detourage.preparer(image, self.detoureur, detourage_auto)
            entree_modele = detourage.sur_fond_gris(cadree)

            # 2. analyse par TripoSR
            suivi.etape("analyse")
            codes = self.model([entree_modele], device=self.appareil)

            # 3. volume 3D
            suivi.etape("maillage")
            try:
                maillage = self.model.extract_mesh(codes, False, resolution=reglages["maillage"])[0]
            except ValueError:  # aucune surface trouvée dans le volume
                maillage = None
            if maillage is None or len(maillage.faces) == 0:
                raise VolumeIntrouvable()
            maillage = _garder_parties_principales(maillage)
            suivi.etape("maillage", 0.85)
            # lissage de Taubin : efface l'aspect « bosselé » sans faire maigrir l'objet
            trimesh.smoothing.filter_taubin(maillage, lamb=0.5, nu=-0.53, iterations=12)
            maillage = _simplifier(maillage, reglages["faces_max"])

            # 4. texture
            suivi.etape("texture")
            photo_512 = np.asarray(cadree.resize((512, 512), Image.LANCZOS)).astype(np.float32) / 255
            reglage, iou_avant, iou_apres = texture.ajuster_alignement(
                maillage.vertices, maillage.faces, photo_512[..., 3] > 0.5)
            suivi.etape("texture", 0.2)
            vmap, faces_uv, uvs = texture.deplier_uv(maillage.vertices, maillage.faces,
                                                      reglages["texture"])
            suivi.etape("texture", 0.5)
            taille_photo = min(1024, cadree.size[0])
            photo_proj = np.asarray(cadree.resize((taille_photo, taille_photo), Image.LANCZOS))
            photo_proj = photo_proj.astype(np.float32) / 255
            # si l'alignement reste mauvais, la photo ferait des bavures : on s'en passe
            utiliser_photo = iou_apres >= 0.6
            image_texture, part_photo = texture.calculer_texture(
                self.model, codes[0],
                maillage.vertices[vmap], maillage.vertex_normals[vmap], faces_uv, uvs,
                reglages["texture"],
                photo_rgba=photo_proj if utiliser_photo else None,
                projection=texture.projection_recalee(reglage, taille_photo) if utiliser_photo else None,
                faces_geo=maillage.faces, vertices_geo=maillage.vertices,
                symetrique=symetrique and utiliser_photo)

            # 5. fichiers
            suivi.etape("export")
            infos = _exporter(dossier_sortie, maillage, vmap, faces_uv, uvs, image_texture,
                              cadree, nom)
            infos.update({
                "qualite": qualite,
                "duree_secondes": round(time.time() - debut, 1),
                "appareil": self.appareil,
                "detourage": "photo déjà détourée" if deja_transparente
                else ("automatique" if detourage_auto else "désactivé"),
                "symetrique": bool(symetrique),
                "alignement_photo": round(iou_apres, 3),
                "part_texture_photo": round(part_photo, 3),
            })
            with open(os.path.join(dossier_sortie, "infos.json"), "w", encoding="utf-8") as f:
                json.dump(infos, f, ensure_ascii=False, indent=2)
            suivi.etape("export", 1.0)
            return infos


def _garder_parties_principales(maillage):
    """Supprime les petits morceaux flottants parfois créés autour de l'objet."""
    parties = maillage.split(only_watertight=False)
    if len(parties) <= 1:
        return maillage
    plus_grande = max(len(p.faces) for p in parties)
    gardees = [p for p in parties if len(p.faces) >= 0.02 * plus_grande]
    return trimesh.util.concatenate(gardees)


def _simplifier(maillage, faces_max):
    if len(maillage.faces) <= faces_max:
        return maillage
    try:
        simple = maillage.simplify_quadric_decimation(face_count=faces_max)
    except Exception:  # fast-simplification absent ou échec : on garde le maillage complet
        return maillage
    return simple if len(simple.faces) > 0 else maillage


def _vers_repere_gltf(points):
    """Repère TripoSR (z vers le haut, face avant vers +x) -> glTF (y vers le haut, face avant vers +z)."""
    return np.stack([points[:, 1], points[:, 2], points[:, 0]], -1)


def _exporter(dossier, maillage, vmap, faces_uv, uvs, image_texture, cadree, nom):
    os.makedirs(dossier, exist_ok=True)
    sommets = _vers_repere_gltf(maillage.vertices[vmap])
    normales = _vers_repere_gltf(maillage.vertex_normals[vmap])
    # objet centré, posé sur le sol (y = 0)
    mini, maxi = sommets.min(0), sommets.max(0)
    sommets = sommets - np.array([(mini[0] + maxi[0]) / 2, mini[1], (mini[2] + maxi[2]) / 2])

    img_texture = Image.fromarray((image_texture * 255).round().astype(np.uint8), "RGB")
    materiau = trimesh.visual.material.PBRMaterial(
        name="materiau", baseColorTexture=img_texture, metallicFactor=0.0, roughnessFactor=0.85)
    objet = trimesh.Trimesh(vertices=sommets, faces=faces_uv, vertex_normals=normales,
                            visual=trimesh.visual.TextureVisuals(uv=uvs, material=materiau),
                            process=False)
    objet.export(os.path.join(dossier, "modele.glb"))

    img_texture.save(os.path.join(dossier, "texture.png"))
    _exporter_obj_zip(dossier, sommets, normales, faces_uv, uvs)

    cadree.save(os.path.join(dossier, "photo_detouree.png"))
    vignette = cadree.copy()
    vignette.thumbnail((320, 320), Image.LANCZOS)
    vignette.save(os.path.join(dossier, "vignette.png"))

    dims = sommets.max(0) - sommets.min(0)
    return {
        "id": os.path.basename(os.path.normpath(dossier)),
        "nom": nom or "Modèle 3D",
        "date": datetime.now().isoformat(timespec="seconds"),
        "sommets": int(len(maillage.vertices)),
        "faces": int(len(maillage.faces)),
        "proportions": [round(float(d / dims.max()), 3) for d in dims],
        "fichiers": {
            "glb": "modele.glb",
            "obj_zip": "modele_obj.zip",
            "texture": "texture.png",
            "photo": "photo_detouree.png",
            "vignette": "vignette.png",
        },
    }


def _exporter_obj_zip(dossier, sommets, normales, faces, uvs):
    """OBJ + MTL + texture dans un zip, pour Blender, SketchUp, etc."""
    with tempfile.TemporaryDirectory() as tmp:
        lignes = ["# Atelier 3D", "mtllib modele.mtl", "o modele"]
        lignes += [f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in sommets]
        lignes += [f"vt {u:.6f} {v:.6f}" for u, v in uvs]
        lignes += [f"vn {x:.5f} {y:.5f} {z:.5f}" for x, y, z in normales]
        lignes.append("usemtl materiau")
        lignes += [f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}" for a, b, c in faces + 1]
        with open(os.path.join(tmp, "modele.obj"), "w", encoding="utf-8") as f:
            f.write("\n".join(lignes) + "\n")
        with open(os.path.join(tmp, "modele.mtl"), "w", encoding="utf-8") as f:
            f.write("newmtl materiau\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nd 1\nillum 1\nmap_Kd texture.png\n")
        shutil.copy(os.path.join(dossier, "texture.png"), os.path.join(tmp, "texture.png"))
        with zipfile.ZipFile(os.path.join(dossier, "modele_obj.zip"), "w", zipfile.ZIP_DEFLATED) as z:
            for nom in ("modele.obj", "modele.mtl", "texture.png"):
                z.write(os.path.join(tmp, nom), nom)
