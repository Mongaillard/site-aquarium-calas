"""Atelier 3D : interface locale pour transformer une photo d'objet en modèle 3D texturé.

Lancement :  python app.py        (ouvre automatiquement le navigateur)
Options   :  --port 7860  --appareil auto|cpu|cuda|mps  --sans-navigateur
"""
import argparse
import http.client
import io
import json
import os
import queue
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

DOSSIER_APPLI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DOSSIER_APPLI)
DOSSIER_INTERFACE = os.path.join(DOSSIER_APPLI, "interface")
DOSSIER_RESULTATS = os.path.join(DOSSIER_APPLI, "resultats")
TAILLE_MAX_PHOTO = 40 * 1024 * 1024
ID_VALIDE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
# nom donné par identifiant() : AAAAMMJJ-HHMMSS-nom-de-la-photo
DOSSIER_DE_CREATION = re.compile(r"^\d{8}-\d{6}-[A-Za-z0-9_-]+$")
TYPES_MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".glb": "model/gltf-binary",
    ".zip": "application/zip",
    ".txt": "text/plain; charset=utf-8",
}


def journal(message):
    print(time.strftime("[%H:%M:%S] ") + message, flush=True)


def identifiant(nom_fichier):
    base = os.path.splitext(os.path.basename(nom_fichier or ""))[0]
    base = re.sub(r"[^A-Za-z0-9_-]+", "-", base).strip("-")[:40] or "photo"
    return f"{time.strftime('%Y%m%d-%H%M%S')}-{base}"


class Atelier:
    """État partagé : chargement du modèle IA et file des créations (une à la fois)."""

    def __init__(self, appareil):
        self.appareil_demande = appareil
        self.moteur = {"etat": "chargement", "message": "Démarrage…", "appareil": None}
        self.generateur = None
        self.travaux = {}
        self.file = queue.Queue()
        threading.Thread(target=self._charger, daemon=True).start()
        threading.Thread(target=self._travailler, daemon=True).start()

    def _charger(self):
        generateur = None
        try:
            self.moteur["message"] = "Chargement des bibliothèques…"
            from moteur.pipeline import Generateur3D

            generateur = Generateur3D(appareil=self.appareil_demande)
            self.moteur["appareil"] = generateur.appareil
            self.moteur["message"] = ("Chargement du modèle IA (la première fois, environ 2 Go "
                                      "sont téléchargés : cela peut prendre plusieurs minutes)…")
            journal(self.moteur["message"])
            generateur.charger()
            self.generateur = generateur
            # charger() peut basculer sur le processeur si la carte graphique ne suffit pas
            self.moteur.update(etat="pret", message="Prêt", appareil=generateur.appareil)
            journal(f"Modèle IA prêt ({generateur.appareil}).")
        except Exception as erreur:
            traceback.print_exc()
            if generateur is not None:
                self.moteur["appareil"] = generateur.appareil
            if probleme_de_reseau(erreur):
                message = ("Le modèle IA n'a pas pu être téléchargé. Vérifiez la connexion Internet "
                           "(nécessaire à la première utilisation), puis relancez l'Atelier. "
                           f"Détail : {erreur}")
            else:
                message = "Le modèle IA n'a pas pu être chargé. "
                # le conseil n'a de sens que si une carte graphique était en jeu
                if (self.moteur["appareil"] or self.appareil_demande) in ("cuda", "mps"):
                    commande = ("lancer.bat --appareil cpu" if sys.platform.startswith("win")
                                else "./lancer.sh --appareil cpu")
                    message += ("Essayez de relancer l'Atelier en mode processeur, avec la "
                                f"commande « {commande} ». ")
                message += f"Détail : {erreur}"
            self.moteur.update(etat="erreur", message=message)

    def ajouter(self, contenu, nom, qualite, detourage_auto, symetrique):
        travail_id = identifiant(nom)
        while os.path.exists(os.path.join(DOSSIER_RESULTATS, travail_id)) or travail_id in self.travaux:
            travail_id += "-b"
        dossier = os.path.join(DOSSIER_RESULTATS, travail_id)
        os.makedirs(dossier)
        extension = os.path.splitext(nom or "")[1].lower()
        if extension not in (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".heic"):
            extension = ".img"
        chemin_photo = os.path.join(dossier, "photo_originale" + extension)
        try:
            with open(chemin_photo, "wb") as f:
                f.write(contenu)
        except OSError:  # disque plein… : pas de dossier à moitié rempli
            shutil.rmtree(dossier, ignore_errors=True)
            raise
        self.travaux[travail_id] = {
            "id": travail_id, "nom": nom or "Photo", "etat": "en_attente", "etape": None,
            "progression": 0.0, "message": "", "debut": None, "fin": None, "modele": None,
            "_photo": chemin_photo, "_dossier": dossier,
            "_qualite": qualite, "_detourage": detourage_auto, "_symetrique": symetrique,
        }
        self.file.put(travail_id)
        return travail_id

    def _travailler(self):
        while True:
            travail = self.travaux[self.file.get()]
            while self.moteur["etat"] == "chargement":
                time.sleep(0.5)
            if self.generateur is None:
                travail.update(etat="erreur", message=self.moteur["message"])
                shutil.rmtree(travail["_dossier"], ignore_errors=True)
                continue
            travail.update(etat="en_cours", debut=time.time())
            journal(f"Création du modèle : {travail['nom']} ({travail['_qualite']})")

            def rappel(cle, fraction, travail=travail):
                travail.update(etape=cle, progression=round(fraction, 3))

            try:
                infos = self.generateur.generer(
                    travail["_photo"], travail["_dossier"], qualite=travail["_qualite"],
                    detourage_auto=travail["_detourage"], nom=travail["nom"], rappel=rappel,
                    symetrique=travail["_symetrique"])
                travail.update(etat="termine", progression=1.0, modele=infos, fin=time.time())
                journal(f"Terminé en {infos['duree_secondes']} s : {travail['_dossier']}")
            except Exception as erreur:
                travail.update(etat="erreur", fin=time.time(), message=message_erreur(erreur))
                traceback.print_exc()
                shutil.rmtree(travail["_dossier"], ignore_errors=True)

    def etat_travail(self, travail_id):
        travail = self.travaux.get(travail_id)
        if travail is None:
            return None
        etat = {k: v for k, v in travail.items() if not k.startswith("_")}
        if travail["etat"] == "en_attente":
            etat["position"] = sum(1 for t in self.travaux.values()
                                   if t["etat"] == "en_attente" and t["id"] <= travail_id)
        if travail["debut"]:
            etat["ecoule"] = round((travail["fin"] or time.time()) - travail["debut"], 1)
        return etat


MESSAGES_MEMOIRE = ("out of memory", "not enough memory", "can't allocate memory",
                    "cannot allocate memory", "bad allocation", "failed to allocate")
# erreurs des bibliothèques de téléchargement (requests, urllib3, httpx, huggingface_hub)
ERREURS_RESEAU = {"RequestException", "ConnectionError", "Timeout", "ProxyError", "SSLError",
                  "MaxRetryError", "NewConnectionError", "NameResolutionError", "TransportError",
                  "TimeoutException", "HfHubHTTPError", "LocalEntryNotFoundError",
                  "OfflineModeIsEnabled", "XetDownloadError"}
MOTS_RESEAU = ("connection", "resolve", "resolution", "proxy", "timed out", "network",
               "internet", "getaddrinfo")


def probleme_de_reseau(erreur):
    """Vrai si l'erreur (ou sa cause) ressemble à un téléchargement impossible."""
    vues = set()
    while erreur is not None and id(erreur) not in vues:
        vues.add(id(erreur))
        noms = {classe.__name__ for classe in type(erreur).__mro__}
        texte = str(erreur).lower()
        if (noms & ERREURS_RESEAU or any(mot in texte for mot in MOTS_RESEAU)
                or isinstance(erreur, (ConnectionError, TimeoutError, socket.gaierror,
                                       urllib.error.URLError))):
            return True
        erreur = erreur.__cause__ or erreur.__context__
    return False


def message_erreur(erreur):
    from moteur.detourage import AucunObjetDetecte
    from moteur.pipeline import VolumeIntrouvable

    if isinstance(erreur, AucunObjetDetecte):
        return ("Aucun objet n'a été trouvé sur la photo. Essayez une photo où l'objet est bien "
                "visible et se détache du fond.")
    if isinstance(erreur, VolumeIntrouvable):
        return ("L'IA n'a pas réussi à reconstruire de volume à partir de cette photo. "
                "Essayez une autre photo de l'objet, seul et entier dans le cadre.")
    texte = str(erreur).lower()
    # PyTorch et onnxruntime signalent le manque de mémoire vive par un simple message
    if (isinstance(erreur, MemoryError) or type(erreur).__name__ == "OutOfMemoryError"
            or any(m in texte for m in MESSAGES_MEMOIRE)):
        return ("Mémoire insuffisante. Fermez d'autres programmes ou choisissez la qualité "
                "« Rapide ».")
    if "cannot identify image" in texte:
        return "Ce fichier n'est pas une image lisible. Utilisez une photo JPG, PNG ou WebP."
    return f"La création a échoué : {erreur}"


def lister_modeles():
    modeles = []
    if not os.path.isdir(DOSSIER_RESULTATS):
        return modeles
    for nom in os.listdir(DOSSIER_RESULTATS):
        chemin = os.path.join(DOSSIER_RESULTATS, nom, "infos.json")
        if ID_VALIDE.match(nom) and os.path.isfile(chemin):
            try:
                with open(chemin, encoding="utf-8") as f:
                    modeles.append(json.load(f))
            except (OSError, ValueError):
                continue
    modeles.sort(key=lambda m: m.get("date", ""), reverse=True)
    return modeles


def nettoyer_resultats_orphelins():
    """Efface les dossiers des créations interrompues (fenêtre fermée pendant un calcul…).

    Sans infos.json, ils n'apparaissent pas dans la galerie mais gardent la photo sur le disque.
    Seuls ceux qui n'ont pas changé depuis plus d'une heure sont effacés, pour ne pas gêner
    un calcul en cours à côté (generer.py ou un autre Atelier)."""
    try:
        for nom in os.listdir(DOSSIER_RESULTATS):
            dossier = os.path.join(DOSSIER_RESULTATS, nom)
            # uniquement les dossiers créés par l'Atelier lui-même (nom horodaté + photo
            # d'origine), jamais un dossier rangé à la main dans « resultats »
            if (DOSSIER_DE_CREATION.match(nom) and os.path.isdir(dossier)
                    and not os.path.islink(dossier)
                    and not os.path.exists(os.path.join(dossier, "infos.json"))
                    and any(f.startswith("photo_originale.") for f in os.listdir(dossier))
                    and time.time() - os.path.getmtime(dossier) > 3600):
                shutil.rmtree(dossier, ignore_errors=True)
    except OSError:
        pass


def supprimer_modele(dossier):
    """Efface le dossier d'un modèle ; renvoie False si un fichier n'a pas pu être effacé.

    infos.json part en dernier : si un fichier est ouvert dans un autre programme, le modèle
    reste dans la galerie et la suppression pourra être refaite."""
    for nom in sorted(os.listdir(dossier), key=lambda n: n == "infos.json"):
        chemin = os.path.join(dossier, nom)
        try:
            if os.path.isdir(chemin) and not os.path.islink(chemin):
                shutil.rmtree(chemin)
            else:
                os.remove(chemin)
        except OSError:
            return False
    try:
        os.rmdir(dossier)
    except OSError:  # dossier vide encore ouvert ailleurs : effacé à un prochain lancement
        pass
    return True


def ouvrir_dans_explorateur(chemin):
    if sys.platform.startswith("win"):
        os.startfile(chemin)  # noqa: S606 (dossier local de l'application)
    elif sys.platform == "darwin":
        subprocess.Popen(["open", chemin])
    else:
        subprocess.Popen(["xdg-open", chemin])


class Gestionnaire(BaseHTTPRequestHandler):
    atelier: Atelier = None
    hotes_autorises: set = set()
    server_version = "Atelier3D"

    def log_message(self, format, *args):  # pas de journal pour chaque requête
        pass

    # --- réponses ---------------------------------------------------------
    def send_response(self, *args, **kwargs):
        self.reponse_commencee = True
        super().send_response(*args, **kwargs)

    def _json(self, donnees, statut=HTTPStatus.OK):
        corps = json.dumps(donnees, ensure_ascii=False).encode("utf-8")
        self.send_response(statut)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def _erreur(self, statut, message):
        self._json({"erreur": message}, statut)

    def _fichier(self, racine, relatif):
        # contrôle sur le texte seul, avant tout accès au disque : sous Windows, un chemin
        # réseau (\\serveur\partage, //serveur/partage) serait contacté par realpath()
        morceaux = relatif.split("/")
        if (any(c in relatif for c in ("\\", ":", "\x00"))
                or any(m in ("", ".", "..") for m in morceaux)):
            return self._erreur(HTTPStatus.NOT_FOUND, "Fichier introuvable.")
        racine = os.path.realpath(racine)
        chemin = os.path.realpath(os.path.join(racine, *morceaux))
        if not chemin.startswith(racine + os.sep) or not os.path.isfile(chemin):
            return self._erreur(HTTPStatus.NOT_FOUND, "Fichier introuvable.")
        extension = os.path.splitext(chemin)[1].lower()
        taille = os.path.getsize(chemin)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", TYPES_MIME.get(extension, "application/octet-stream"))
        self.send_header("Content-Length", str(taille))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        with open(chemin, "rb") as f:
            shutil.copyfileobj(f, self.wfile)

    # --- sécurité : uniquement cet ordinateur, uniquement cette page ---------
    def _hote_autorise(self):
        return self.headers.get("Host", "") in self.hotes_autorises

    def _requete_de_la_page(self):
        # les autres sites ne peuvent pas ajouter cet en-tête sans autorisation CORS
        return self._hote_autorise() and self.headers.get("X-Atelier") == "1"

    # --- routes -----------------------------------------------------------
    def do_GET(self):
        self._traiter(self._routes_get)

    def do_POST(self):
        self._traiter(self._routes_post)

    def _traiter(self, routes):
        # une erreur imprévue renvoie un message clair au lieu de couper la connexion
        self.reponse_commencee = False
        try:
            routes()
        except (ConnectionError, TimeoutError):
            pass  # le navigateur a fermé la connexion (page quittée, téléchargement annulé…)
        except Exception as erreur:
            traceback.print_exc()
            if not self.reponse_commencee:
                self._erreur(HTTPStatus.INTERNAL_SERVER_ERROR,
                             f"Erreur inattendue de l'Atelier : {erreur}")

    def _routes_get(self):
        if not self._hote_autorise():
            return self._erreur(HTTPStatus.FORBIDDEN, "Accès refusé.")
        chemin = unquote(urlparse(self.path).path)
        if chemin in ("/", "/index.html"):
            return self._fichier(DOSSIER_INTERFACE, "index.html")
        if chemin.startswith("/interface/"):
            return self._fichier(DOSSIER_INTERFACE, chemin[len("/interface/"):])
        if chemin.startswith("/resultats/"):
            return self._fichier(DOSSIER_RESULTATS, chemin[len("/resultats/"):])
        if chemin == "/api/etat":
            return self._json(self.atelier.moteur)
        if chemin == "/api/modeles":
            return self._json(lister_modeles())
        m = re.match(r"^/api/travaux/([A-Za-z0-9_-]+)$", chemin)
        if m:
            etat = self.atelier.etat_travail(m.group(1))
            if etat is None:
                return self._erreur(HTTPStatus.NOT_FOUND, "Création inconnue.")
            return self._json(etat)
        return self._erreur(HTTPStatus.NOT_FOUND, "Page introuvable.")

    def _routes_post(self):
        if not self._requete_de_la_page():
            return self._erreur(HTTPStatus.FORBIDDEN, "Accès refusé.")
        url = urlparse(self.path)
        chemin = unquote(url.path)
        if chemin == "/api/generer":
            return self._generer(parse_qs(url.query))
        m = re.match(r"^/api/modeles/([A-Za-z0-9_-]+)/(supprimer|ouvrir)$", chemin)
        if m and ID_VALIDE.match(m.group(1)):
            dossier = os.path.join(DOSSIER_RESULTATS, m.group(1))
            if not os.path.isfile(os.path.join(dossier, "infos.json")):
                return self._erreur(HTTPStatus.NOT_FOUND, "Modèle introuvable.")
            if m.group(2) == "supprimer":
                if not supprimer_modele(dossier):
                    return self._erreur(HTTPStatus.INTERNAL_SERVER_ERROR, (
                        "Certains fichiers de ce modèle sont ouverts dans un autre programme. "
                        "Fermez-le, puis réessayez."))
                return self._json({"ok": True})
            try:
                ouvrir_dans_explorateur(dossier)
            except Exception as erreur:
                return self._erreur(HTTPStatus.INTERNAL_SERVER_ERROR,
                                    f"Impossible d'ouvrir le dossier : {erreur}")
            return self._json({"ok": True})
        return self._erreur(HTTPStatus.NOT_FOUND, "Action inconnue.")

    def _generer(self, parametres):
        try:
            longueur = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            longueur = 0
        if longueur <= 0:
            return self._erreur(HTTPStatus.BAD_REQUEST, "Aucune photo reçue.")
        if longueur > TAILLE_MAX_PHOTO:
            return self._erreur(HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                                "Photo trop lourde (40 Mo maximum).")
        contenu = self.rfile.read(longueur)
        try:
            from PIL import Image

            import moteur.detourage  # noqa: F401 (active la lecture des photos HEIC)

            with Image.open(io.BytesIO(contenu)) as image:
                image.verify()
        except Exception:
            return self._erreur(HTTPStatus.BAD_REQUEST,
                                "Ce fichier n'est pas une image lisible. Utilisez une photo JPG, PNG ou WebP.")
        qualite = parametres.get("qualite", ["standard"])[0]
        if qualite not in ("rapide", "standard", "fine"):
            qualite = "standard"
        detourage_auto = parametres.get("detourage", ["1"])[0] != "0"
        symetrique = parametres.get("symetrie", ["0"])[0] == "1"
        nom = parametres.get("nom", ["photo"])[0][:120]
        try:
            travail_id = self.atelier.ajouter(contenu, nom, qualite, detourage_auto, symetrique)
        except OSError as erreur:
            traceback.print_exc()
            return self._erreur(HTTPStatus.INTERNAL_SERVER_ERROR, (
                "La photo n'a pas pu être enregistrée dans le dossier « resultats » "
                f"(disque plein ?). Détail : {erreur}"))
        return self._json({"id": travail_id}, HTTPStatus.ACCEPTED)


class Serveur(ThreadingHTTPServer):
    # Sous Windows, SO_REUSEADDR laisserait un second Atelier prendre le port du premier :
    # on le désactive et on réserve le port à ce seul programme.
    allow_reuse_address = not sys.platform.startswith("win")

    def server_bind(self):
        if sys.platform.startswith("win") and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def atelier_existant(port):
    """État renvoyé par un Atelier 3D déjà ouvert sur ce port, ou None."""
    try:
        connexion = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
        try:
            connexion.connect()
            connexion.sock.settimeout(3)  # un Atelier occupé par une création répond moins vite
            connexion.request("GET", "/api/etat")
            etat = json.loads(connexion.getresponse().read(100_000))
        finally:
            connexion.close()
    except Exception:
        return None
    return etat if isinstance(etat, dict) and "etat" in etat else None


def desactiver_edition_rapide():
    """Windows : un clic dans la fenêtre noire (mode « Édition rapide ») y bloque l'affichage,
    et donc la création en cours, jusqu'à la touche Échap. On désactive ce mode."""
    if not sys.platform.startswith("win"):
        return
    try:
        import ctypes
        from ctypes import wintypes

        noyau = ctypes.WinDLL("kernel32", use_last_error=True)
        noyau.GetStdHandle.restype = wintypes.HANDLE
        noyau.GetStdHandle.argtypes = [wintypes.DWORD]
        noyau.GetConsoleMode.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        noyau.SetConsoleMode.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        entree = noyau.GetStdHandle(-10 & 0xFFFFFFFF)  # STD_INPUT_HANDLE
        mode = wintypes.DWORD()
        if noyau.GetConsoleMode(entree, ctypes.byref(mode)):  # échoue s'il n'y a pas de console
            # 0x40 : ENABLE_QUICK_EDIT_MODE ; 0x80 : ENABLE_EXTENDED_FLAGS, requis pour le changer
            noyau.SetConsoleMode(entree, (mode.value & ~0x40) | 0x80)
    except Exception:
        pass


def deja_ouvert(port, args):
    """Vrai si un Atelier répond déjà sur ce port ; ouvre alors sa page au lieu d'en lancer un autre."""
    moteur = atelier_existant(port)
    if moteur is None:
        return False
    adresse = f"http://127.0.0.1:{port}/"
    if not args.sans_navigateur:
        webbrowser.open(adresse)
    if moteur["etat"] == "erreur":  # message d'erreur : lancer.bat garde la fenêtre ouverte
        sys.exit(f"L'Atelier 3D est déjà ouvert sur {adresse}, mais son modèle IA n'a pas "
                 "pu être chargé. Fermez l'autre fenêtre de l'Atelier, puis relancez-le.")
    journal(f"L'Atelier 3D est déjà ouvert sur {adresse} : inutile de le lancer une seconde fois.")
    return True


def main():
    parser = argparse.ArgumentParser(description="Atelier 3D : photo -> modèle 3D texturé")
    parser.add_argument("--port", type=int, default=7860)
    parser.add_argument("--appareil", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    parser.add_argument("--sans-navigateur", action="store_true")
    args = parser.parse_args()

    os.makedirs(DOSSIER_RESULTATS, exist_ok=True)
    serveur = None
    for port in range(args.port, args.port + 20):
        # déjà ouvert (double lancement) : on montre la page existante au lieu de recharger l'IA
        if deja_ouvert(port, args):
            return
        try:
            serveur = Serveur(("127.0.0.1", port), Gestionnaire)
            break
        except OSError:
            # un autre Atelier lancé au même instant vient peut-être de prendre ce port
            if deja_ouvert(port, args):
                return
            continue
    if serveur is None:
        sys.exit(f"Aucun port libre entre {args.port} et {args.port + 19}.")
    port = serveur.server_address[1]
    desactiver_edition_rapide()
    nettoyer_resultats_orphelins()  # avant le démarrage de la file des créations
    Gestionnaire.atelier = Atelier(args.appareil)
    Gestionnaire.hotes_autorises = {f"127.0.0.1:{port}", f"localhost:{port}"}
    adresse = f"http://127.0.0.1:{port}/"
    journal(f"Atelier 3D ouvert sur {adresse}  (fermez cette fenêtre pour quitter)")
    if not args.sans_navigateur:
        threading.Timer(1.0, webbrowser.open, args=(adresse,)).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        journal("Arrêt de l'Atelier 3D.")


if __name__ == "__main__":
    main()
