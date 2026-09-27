"""Dépliage UV et calcul de la texture du modèle.

La couleur de chaque point de la surface vient de deux sources :
- le champ de couleur prédit par TripoSR (couvre tout l'objet, mais reste flou) ;
- la photo d'origine, projetée sur les faces qui lui font face (nette, mais
  seulement pour le côté photographié).
Les deux sont mélangés selon l'angle de vue, avec une transition douce.
"""
import math

import numpy as np
import torch
import xatlas
from scipy import ndimage

from .raster import rasterize

# Caméra supposée par TripoSR pour l'image d'entrée (vue d'azimut 0).
DISTANCE_CAMERA = 1.9
CHAMP_VERTICAL_DEG = 40.0


def projeter(points, taille):
    """Projette des points du repère TripoSR (z vers le haut, caméra sur +x) dans l'image."""
    focale = 0.5 * taille / math.tan(math.radians(CHAMP_VERTICAL_DEG) / 2)
    profondeur = DISTANCE_CAMERA - points[:, 0]
    u = taille / 2 + focale * points[:, 1] / profondeur
    v = taille / 2 - focale * points[:, 2] / profondeur
    return u, v, profondeur


def _iou(a, b):
    return (a & b).sum() / max(1, (a | b).sum())


def ajuster_alignement(vertices, faces, masque):
    """Recale la projection du maillage sur la silhouette de la photo.

    La caméra réelle de la photo ne correspond jamais exactement à celle que
    suppose TripoSR : on cherche l'échelle et le décalage 2D qui superposent au
    mieux la silhouette du modèle et celle de l'objet détouré.
    `masque` : silhouette carrée de la photo (booléens), idéalement ~512 px.
    Renvoie (réglage, IoU avant, IoU après) ; le réglage s'utilise avec
    `projection_recalee` quelle que soit la taille de l'image.
    """
    taille = masque.shape[0]
    centre = taille / 2
    u, v, _ = projeter(vertices, taille)
    ids, _ = rasterize(np.stack([u, v], -1)[faces], taille, taille)
    silhouette = ids >= 0
    iou_initial = _iou(silhouette, masque)

    def recale(s, tx, ty):
        return ndimage.affine_transform(
            silhouette.astype(np.float32), [1 / s, 1 / s],
            offset=[centre - (centre + ty) / s, centre - (centre + tx) / s], order=0) > 0.5

    meilleur = (iou_initial, 1.0, 0.0, 0.0)
    if silhouette.any() and masque.any():
        ys, xs = np.nonzero(silhouette)
        ya, xa = np.nonzero(masque)
        s0 = math.sqrt(masque.sum() / silhouette.sum())
        tx0 = xa.mean() - (centre + s0 * (xs.mean() - centre))
        ty0 = ya.mean() - (centre + s0 * (ys.mean() - centre))
        pas = taille / 512 * 6
        for s in np.linspace(s0 * 0.96, s0 * 1.04, 9):
            for tx in np.linspace(tx0 - pas, tx0 + pas, 7):
                for ty in np.linspace(ty0 - pas, ty0 + pas, 7):
                    val = _iou(recale(s, tx, ty), masque)
                    if val > meilleur[0]:
                        meilleur = (val, s, tx, ty)
    iou_final, s, tx, ty = meilleur
    reglage = {"echelle": float(s), "dx": float(tx / taille), "dy": float(ty / taille)}
    return reglage, float(iou_initial), float(iou_final)


def projection_recalee(reglage, taille):
    """Fonction de projection (points -> u, v, profondeur) recalée pour une image de `taille` px."""
    centre = taille / 2
    s, dx, dy = reglage["echelle"], reglage["dx"] * taille, reglage["dy"] * taille

    def projection(points):
        uu, vv, dd = projeter(points, taille)
        return centre + s * (uu - centre) + dx, centre + s * (vv - centre) + dy, dd

    return projection


def deplier_uv(vertices, faces, resolution):
    """Crée l'atlas de texture (coordonnées UV) avec xatlas."""
    atlas = xatlas.Atlas()
    atlas.add_mesh(vertices.astype(np.float32), faces.astype(np.uint32))
    options = xatlas.PackOptions()
    options.resolution = resolution
    options.padding = max(2, resolution // 256)
    options.bilinear = True
    atlas.generate(pack_options=options)
    vmapping, indices, uvs = atlas[0]
    return vmapping.astype(np.int64), indices.astype(np.int64), uvs.astype(np.float32)


def _echantillonner(image, x, y):
    """Lecture bilinéaire d'une image (H, W, C) aux positions en pixels (x, y)."""
    h, w = image.shape[:2]
    x = np.clip(x - 0.5, 0, w - 1.001)
    y = np.clip(y - 0.5, 0, h - 1.001)
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = (x - x0)[:, None]
    fy = (y - y0)[:, None]
    return (image[y0, x0] * (1 - fx) * (1 - fy) + image[y0, x0 + 1] * fx * (1 - fy)
            + image[y0 + 1, x0] * (1 - fx) * fy + image[y0 + 1, x0 + 1] * fx * fy)


def _projection_photo(positions, normales, vertices_geo, faces_geo, projection, photo_rgba,
                      dist_bord):
    """Poids (0..1) et couleur de la photo pour chaque point de surface.

    Le poids est nul pour les points cachés (test de profondeur), vus de trop biais,
    ou trop près du bord de la silhouette (où la photo mélange objet et fond).
    """
    taille = photo_rgba.shape[0]
    uu, vv, dd = projection(vertices_geo)
    ids_v, bary_v = rasterize(np.stack([uu, vv], -1)[faces_geo], taille, taille,
                              tri_z=dd[faces_geo])
    profondeur = np.full((taille, taille), np.inf, dtype=np.float32)
    vus = ids_v >= 0
    profondeur[vus] = (bary_v[vus] * dd[faces_geo[ids_v[vus]]]).sum(-1)
    profondeur = ndimage.minimum_filter(profondeur, size=3)

    pu, pv, pd = projection(positions)
    ix = np.clip(np.floor(pu).astype(np.int64), 0, taille - 1)
    iy = np.clip(np.floor(pv).astype(np.int64), 0, taille - 1)
    visible = pd <= profondeur[iy, ix] + 0.02

    camera = np.array([DISTANCE_CAMERA, 0.0, 0.0])
    direction = camera[None] - positions
    direction /= np.linalg.norm(direction, axis=1, keepdims=True)
    cos_angle = (normales * direction).sum(1)

    marge = taille / 512
    poids_bord = np.clip((dist_bord[iy, ix] - 2 * marge) / (6 * marge), 0, 1)
    poids_angle = np.clip((cos_angle - 0.2) / 0.5, 0, 1)
    poids = poids_angle * poids_bord * visible
    return poids, _echantillonner(photo_rgba[..., :3], pu, pv)


def calculer_texture(model, scene_code, vertices, normals, faces, uvs, resolution,
                     photo_rgba=None, projection=None, faces_geo=None, vertices_geo=None,
                     symetrique=False):
    """Calcule l'image de texture (H, W, 3) en flottants 0..1.

    vertices/normals/faces/uvs : maillage déplié (un sommet par coin UV).
    photo_rgba : photo détourée carrée (H, W, 4) 0..1 alignée sur l'entrée du modèle.
    projection : fonction renvoyée par ajuster_alignement.
    faces_geo/vertices_geo : maillage d'origine (non déplié) pour le test de visibilité.
    symetrique : reproduit aussi la photo, en miroir, sur le côté caché.
    """
    uv_px = np.stack([uvs[:, 0] * resolution, (1 - uvs[:, 1]) * resolution], -1)
    ids, bary = rasterize(uv_px[faces], resolution, resolution)
    rempli = ids >= 0
    coins = faces[ids[rempli]]
    b = bary[rempli][..., None]
    positions = (vertices[coins] * b).sum(1)
    normales = (normals[coins] * b).sum(1)
    normales /= np.linalg.norm(normales, axis=1, keepdims=True) + 1e-8

    # 1) couleurs du champ neuronal
    device = scene_code.device
    with torch.no_grad():
        requete = torch.from_numpy(positions.astype(np.float32)).to(device)
        couleurs = model.renderer.query_triplane(model.decoder, requete, scene_code)["color"]
        couleurs = couleurs.float().cpu().numpy()

    # 2) projection de la photo sur les faces visibles depuis l'appareil photo
    poids_photo = 0
    if photo_rgba is not None and projection is not None:
        dist_bord = ndimage.distance_transform_edt(photo_rgba[..., 3] > 0.5)
        poids, photo = _projection_photo(positions, normales, vertices_geo, faces_geo,
                                         projection, photo_rgba, dist_bord)

        # recale globalement les couleurs du champ sur celles de la photo
        fiable = poids > 0.8
        if fiable.sum() > 200:
            gain = np.median(photo[fiable], 0) / np.maximum(np.median(couleurs[fiable], 0), 1e-3)
            couleurs = np.clip(couleurs * np.clip(gain, 0.7, 1.4), 0, 1)
        melange = couleurs * (1 - poids[:, None]) + photo * poids[:, None]

        if symetrique:
            # objet symétrique (poisson de profil…) : le côté caché est le reflet du côté
            # photographié. On projette la photo sur le maillage retourné dans l'axe de visée.
            miroir = np.array([-1.0, 1.0, 1.0])
            poids_ar, photo_ar = _projection_photo(positions * miroir, normales * miroir,
                                                   vertices_geo * miroir, faces_geo,
                                                   projection, photo_rgba, dist_bord)
            poids_ar = np.minimum(poids_ar, 1 - poids)
            melange = melange * (1 - poids_ar[:, None]) + photo_ar * poids_ar[:, None]
            poids = poids + poids_ar
        couleurs = melange
        poids_photo = float((poids > 0.5).mean())

    texture = np.zeros((resolution, resolution, 3), dtype=np.float32)
    texture[rempli] = couleurs
    # remplit les marges entre les îlots UV avec la couleur voisine (évite les coutures)
    _, (iy_n, ix_n) = ndimage.distance_transform_edt(~rempli, return_indices=True)
    texture = texture[iy_n, ix_n]
    return np.clip(texture, 0, 1), poids_photo
