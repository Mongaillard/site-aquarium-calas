"""Atelier 3D : interface locale pour transformer une photo d'objet en modèle 3D texturé.

Lancement :  python app.py        (ouvre automatiquement le navigateur)
Options   :  --port 7860  --appareil auto|cpu|cuda|mps  --sans-navigateur
"""
import argparse
import io
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
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
            self.moteur.update(etat="pret", message="Prêt")
            journal(f"Modèle IA prêt ({generateur.appareil}).")
        except Exception as erreur:
            traceback.print_exc()
            self.moteur.update(etat="erreur", message=(
                "Le modèle IA n'a pas pu être chargé. Vérifiez la connexion Internet "
                f"lors de la première utilisation, puis relancez l'Atelier. Détail : {erreur}"))

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
        with open(chemin_photo, "wb") as f:
            f.write(contenu)
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


def message_erreur(erreur):
    from moteur.detourage import AucunObjetDetecte
    from moteur.pipeline import VolumeIntrouvable

    if isinstance(erreur, AucunObjetDetecte):
        return ("Aucun objet n'a été trouvé sur la photo. Essayez une photo où l'objet est bien "
                "visible et se détache du fond.")
    if isinstance(erreur, VolumeIntrouvable):
        return ("L'IA n'a pas réussi à reconstruire de volume à partir de cette photo. "
                "Essayez une autre photo de l'objet, seul et entier dans le cadre.")
    if isinstance(erreur, MemoryError) or "out of memory" in str(erreur).lower():
        return ("Mémoire insuffisante. Fermez d'autres programmes ou choisissez la qualité "
                "« Rapide ».")
    if "cannot identify image" in str(erreur).lower():
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
        racine = os.path.realpath(racine)
        chemin = os.path.realpath(os.path.join(racine, relatif))
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

    def do_POST(self):
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
                shutil.rmtree(dossier, ignore_errors=True)
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
        travail_id = self.atelier.ajouter(contenu, nom, qualite, detourage_auto, symetrique)
        return self._json({"id": travail_id}, HTTPStatus.ACCEPTED)


def main():
    parser = argparse.ArgumentParser(description="Atelier 3D : photo -> modèle 3D texturé")
    parser.add_argument("--port", type=int, default=7860)
    parser.add_argument("--appareil", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    parser.add_argument("--sans-navigateur", action="store_true")
    args = parser.parse_args()

    os.makedirs(DOSSIER_RESULTATS, exist_ok=True)
    serveur = None
    for port in range(args.port, args.port + 20):
        try:
            serveur = ThreadingHTTPServer(("127.0.0.1", port), Gestionnaire)
            break
        except OSError:
            continue
    if serveur is None:
        sys.exit(f"Aucun port libre entre {args.port} et {args.port + 19}.")
    port = serveur.server_address[1]
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
