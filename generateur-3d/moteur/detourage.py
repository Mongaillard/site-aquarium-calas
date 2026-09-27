"""Préparation de la photo : orientation, détourage et cadrage."""
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

# Modèle de détourage « isnet-general-use » (projet DIS, licence Apache 2.0) :
# précis, rapide sur processeur et utilisable commercialement.
# Attention : le modèle par défaut récent de rembg (bria-rmbg) est sous licence
# non commerciale, d'où le choix explicite ici.
MODELE_DETOURAGE = "isnet-general-use"

TAILLE_MAX = 2048

try:  # photos HEIC des iPhone
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass


class AucunObjetDetecte(Exception):
    pass


def ouvrir_photo(chemin_ou_fichier):
    """Ouvre la photo en respectant l'orientation EXIF (photos de téléphone)."""
    image = Image.open(chemin_ou_fichier)
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.getbands() or image.mode == "P" else "RGB")
    if max(image.size) > TAILLE_MAX:
        image.thumbnail((TAILLE_MAX, TAILLE_MAX), Image.LANCZOS)
    return image


def deja_detouree(image):
    """Vrai si l'image a déjà un fond transparent (PNG détouré)."""
    if image.mode != "RGBA":
        return False
    alpha = np.asarray(image)[..., 3]
    return (alpha < 128).mean() > 0.01


class Detoureur:
    def __init__(self):
        self._session = None

    def _session_rembg(self):
        if self._session is None:
            import rembg
            self._session = rembg.new_session(MODELE_DETOURAGE)
        return self._session

    def detourer(self, image):
        import rembg
        return rembg.remove(image.convert("RGB"), session=self._session_rembg(),
                            post_process_mask=True)


def nettoyer_masque(alpha):
    """Garde l'objet principal : supprime les petites taches isolées du détourage."""
    masque = alpha > 127
    etiquettes, n = ndimage.label(masque)
    if n == 0:
        raise AucunObjetDetecte()
    tailles = ndimage.sum(masque, etiquettes, index=np.arange(1, n + 1))
    garder = np.zeros(n + 1, dtype=bool)
    garder[1:] = tailles >= 0.15 * tailles.max()
    # on dilate un peu la zone gardée pour ne pas couper le bord adouci
    zone = ndimage.binary_dilation(garder[etiquettes], iterations=3)
    return np.where(zone, alpha, 0).astype(np.uint8)


def cadrer(image_rgba, ratio=0.85):
    """Recadre l'objet au centre d'une image carrée, où il occupe `ratio` de la taille.

    C'est le cadrage attendu par TripoSR (même logique que resize_foreground).
    """
    tableau = np.asarray(image_rgba)
    ys, xs = np.nonzero(tableau[..., 3] > 0)
    if ys.size == 0:
        raise AucunObjetDetecte()
    objet = tableau[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    cote = max(objet.shape[:2])
    cote_final = int(np.ceil(cote / ratio))
    carre = np.zeros((cote_final, cote_final, 4), dtype=np.uint8)
    y0 = (cote_final - objet.shape[0]) // 2
    x0 = (cote_final - objet.shape[1]) // 2
    carre[y0:y0 + objet.shape[0], x0:x0 + objet.shape[1]] = objet
    return Image.fromarray(carre, "RGBA")


def preparer(image, detoureur=None, detourage=True):
    """Renvoie la photo détourée et cadrée (RGBA carré) prête pour le modèle.

    - image déjà transparente : utilisée telle quelle ;
    - détourage activé : le fond est supprimé automatiquement ;
    - détourage désactivé : toute l'image est considérée comme l'objet
      (à réserver aux photos déjà prises sur fond uni).
    """
    if deja_detouree(image):
        rgba = image.convert("RGBA")
    elif detourage:
        rgba = detoureur.detourer(image).convert("RGBA")
    else:
        rgba = image.convert("RGBA")
    tableau = np.array(rgba)
    tableau[..., 3] = nettoyer_masque(tableau[..., 3])
    return cadrer(Image.fromarray(tableau, "RGBA"))


def sur_fond_gris(image_rgba):
    """Compose l'objet sur le fond gris moyen utilisé à l'entraînement de TripoSR."""
    tableau = np.asarray(image_rgba).astype(np.float32) / 255.0
    alpha = tableau[..., 3:4]
    rgb = tableau[..., :3] * alpha + (1 - alpha) * 0.5
    return Image.fromarray((rgb * 255).round().astype(np.uint8), "RGB")
