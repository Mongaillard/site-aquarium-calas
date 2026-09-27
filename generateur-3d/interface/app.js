// Logique de l'interface de l'Atelier 3D.
import { Visionneuse } from './visionneuse.js';

const $ = (id) => document.getElementById(id);
const el = {
  etatMoteur: $('etat-moteur'), etatMoteurTexte: $('etat-moteur-texte'),
  formulaire: $('formulaire'), depot: $('depot'), choixPhoto: $('choix-photo'),
  depotVide: $('depot-vide'), depotApercu: $('depot-apercu'), apercuPhoto: $('apercu-photo'), nomPhoto: $('nom-photo'),
  detourage: $('detourage'), symetrie: $('symetrie'), boutonCreer: $('bouton-creer'),
  suivi: $('suivi'), suiviTitre: $('suivi-titre'), suiviTemps: $('suivi-temps'), suiviBarre: $('suivi-barre'),
  suiviMessage: $('suivi-message'), etapes: $('etapes'), alerte: $('alerte'),
  titreModele: $('titre-modele'), sceneInfos: $('scene-infos'), actions: $('actions'),
  lienGlb: $('lien-glb'), lienObj: $('lien-obj'), boutonCapture: $('bouton-capture'), boutonDossier: $('bouton-dossier'),
  visionneuse: $('visionneuse'), visionneuseVide: $('visionneuse-vide'), visionneuseChargement: $('visionneuse-chargement'),
  commandes: $('commandes'), rotationAuto: $('rotation-auto'), voirPhoto: $('voir-photo'),
  photoReference: $('photo-reference'), photoReferenceImg: $('photo-reference-img'),
  cartes: $('cartes'), compteur: $('compteur'), galerieVide: $('galerie-vide'),
};

const etat = { photo: null, moteurPret: false, travail: null, modeles: [], courant: null };

// ---------- préférences (confort, facultatif) ----------
function lirePref(cle, defaut) {
  try { return localStorage.getItem('atelier3d.' + cle) ?? defaut; } catch { return defaut; }
}
function ecrirePref(cle, valeur) {
  try { localStorage.setItem('atelier3d.' + cle, valeur); } catch { /* stockage indisponible */ }
}

// ---------- utilitaires ----------
async function api(chemin, options = {}) {
  const reponse = await fetch(chemin, {
    ...options,
    headers: { ...(options.headers || {}), ...(options.method === 'POST' ? { 'X-Atelier': '1' } : {}) },
  });
  let donnees = null;
  try { donnees = await reponse.json(); } catch { /* réponse vide */ }
  if (!reponse.ok) throw new Error((donnees && donnees.erreur) || `Erreur ${reponse.status}`);
  return donnees;
}

function duree(secondes) {
  const s = Math.round(secondes || 0);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

function dateCourte(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function nomSansExtension(nom) {
  return (nom || 'modele').replace(/\.[^.]+$/, '');
}

function nomDeFichier(nom) {
  return nomSansExtension(nom).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'modele';
}

function afficherAlerte(message) {
  el.alerte.textContent = message || '';
  el.alerte.hidden = !message;
}

const QUALITES = { rapide: 'Rapide', standard: 'Standard', fine: 'Fine' };

// ---------- visionneuse ----------
const visionneuse = new Visionneuse(el.visionneuse);
const fondPrefere = lirePref('fond', 'clair');
const radioFond = document.querySelector(`input[name="fond"][value="${fondPrefere}"]`);
if (radioFond) radioFond.checked = true;
visionneuse.definirFond(fondPrefere);
el.rotationAuto.checked = lirePref('rotation', '1') === '1';
visionneuse.definirRotation(el.rotationAuto.checked);

document.querySelectorAll('input[name="fond"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    visionneuse.definirFond(radio.value);
    ecrirePref('fond', radio.value);
  });
});
el.rotationAuto.addEventListener('change', () => {
  visionneuse.definirRotation(el.rotationAuto.checked);
  ecrirePref('rotation', el.rotationAuto.checked ? '1' : '0');
});
el.voirPhoto.addEventListener('change', () => {
  el.photoReference.hidden = !el.voirPhoto.checked;
});

async function afficherModele(infos) {
  etat.courant = infos;
  const base = `/resultats/${encodeURIComponent(infos.id)}/`;
  const version = encodeURIComponent(infos.date || '');
  el.titreModele.textContent = nomSansExtension(infos.nom);
  const morceaux = [
    dateCourte(infos.date),
    `${(infos.faces || 0).toLocaleString('fr-FR')} faces`,
    QUALITES[infos.qualite] ? `qualité ${QUALITES[infos.qualite].toLowerCase()}` : '',
    infos.duree_secondes ? `créé en ${duree(infos.duree_secondes)}` : '',
  ].filter(Boolean);
  el.sceneInfos.textContent = morceaux.join(' · ');
  const fichier = nomDeFichier(infos.nom);
  el.lienGlb.href = base + infos.fichiers.glb;
  el.lienGlb.download = `${fichier}.glb`;
  el.lienObj.href = base + infos.fichiers.obj_zip;
  el.lienObj.download = `${fichier}-obj.zip`;
  el.photoReferenceImg.src = base + infos.fichiers.photo + '?v=' + version;
  el.actions.hidden = false;
  el.commandes.hidden = false;
  el.visionneuseVide.hidden = true;
  el.visionneuseChargement.hidden = false;
  marquerCarteActive();
  try {
    await visionneuse.charger(base + infos.fichiers.glb + '?v=' + version);
  } catch (erreur) {
    afficherAlerte(`Le modèle n'a pas pu être affiché : ${erreur.message}`);
  } finally {
    el.visionneuseChargement.hidden = true;
  }
}

function viderVisionneuse() {
  etat.courant = null;
  visionneuse.vider();
  el.titreModele.textContent = 'Aucun modèle affiché';
  el.sceneInfos.textContent = '';
  el.actions.hidden = true;
  el.commandes.hidden = true;
  el.photoReference.hidden = true;
  el.voirPhoto.checked = false;
  el.visionneuseVide.hidden = false;
  marquerCarteActive();
}

el.boutonCapture.addEventListener('click', async () => {
  const blob = await visionneuse.capture();
  if (!blob) return;
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(blob);
  lien.download = `${nomDeFichier(etat.courant?.nom)}-capture.png`;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 5000);
});

el.boutonDossier.addEventListener('click', async () => {
  if (!etat.courant) return;
  try {
    await api(`/api/modeles/${encodeURIComponent(etat.courant.id)}/ouvrir`, { method: 'POST' });
  } catch (erreur) {
    afficherAlerte(erreur.message);
  }
});

// ---------- galerie ----------
function marquerCarteActive() {
  el.cartes.querySelectorAll('.carte').forEach((carte) => {
    carte.classList.toggle('active', carte.dataset.id === etat.courant?.id);
  });
}

function carteModele(infos) {
  const li = document.createElement('li');
  li.className = 'carte';
  li.dataset.id = infos.id;

  const ouvrir = document.createElement('button');
  ouvrir.type = 'button';
  ouvrir.className = 'carte-ouvrir';
  const img = document.createElement('img');
  img.src = `/resultats/${encodeURIComponent(infos.id)}/${infos.fichiers.vignette}`;
  img.alt = '';
  img.loading = 'lazy';
  const texte = document.createElement('span');
  texte.className = 'carte-texte';
  const titre = document.createElement('strong');
  titre.textContent = nomSansExtension(infos.nom);
  const date = document.createElement('small');
  date.textContent = dateCourte(infos.date);
  texte.append(titre, date);
  ouvrir.append(img, texte);
  ouvrir.addEventListener('click', () => afficherModele(infos));

  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'carte-supprimer';
  supprimer.setAttribute('aria-label', `Supprimer ${titre.textContent}`);
  supprimer.textContent = '×';
  supprimer.addEventListener('click', () => {
    const confirmer = document.createElement('div');
    confirmer.className = 'carte-confirmer';
    const question = document.createElement('p');
    question.textContent = 'Supprimer ce modèle et ses fichiers ?';
    const boutons = document.createElement('div');
    const oui = document.createElement('button');
    oui.type = 'button';
    oui.className = 'bouton bouton-danger';
    oui.textContent = 'Supprimer';
    const non = document.createElement('button');
    non.type = 'button';
    non.className = 'bouton';
    non.textContent = 'Annuler';
    boutons.append(oui, non);
    confirmer.append(question, boutons);
    li.append(confirmer);
    non.focus();
    non.addEventListener('click', () => confirmer.remove());
    oui.addEventListener('click', async () => {
      try {
        await api(`/api/modeles/${encodeURIComponent(infos.id)}/supprimer`, { method: 'POST' });
        if (etat.courant?.id === infos.id) viderVisionneuse();
        await chargerGalerie();
      } catch (erreur) {
        confirmer.remove();
        afficherAlerte(erreur.message);
      }
    });
  });

  li.append(ouvrir, supprimer);
  return li;
}

async function chargerGalerie() {
  try {
    etat.modeles = await api('/api/modeles');
  } catch {
    etat.modeles = [];
  }
  el.cartes.replaceChildren(...etat.modeles.map(carteModele));
  el.galerieVide.hidden = etat.modeles.length > 0;
  el.compteur.textContent = etat.modeles.length
    ? `${etat.modeles.length} modèle${etat.modeles.length > 1 ? 's' : ''}` : '';
  marquerCarteActive();
}

// ---------- choix de la photo ----------
function choisirPhoto(fichier) {
  if (!fichier) return;
  const estImage = fichier.type.startsWith('image/') || /\.(heic|heif)$/i.test(fichier.name);
  if (!estImage) {
    afficherAlerte("Ce fichier n'est pas une image. Choisissez une photo JPG, PNG, WebP ou HEIC.");
    return;
  }
  afficherAlerte('');
  etat.photo = fichier;
  if (el.apercuPhoto.src.startsWith('blob:')) URL.revokeObjectURL(el.apercuPhoto.src);
  el.apercuPhoto.src = URL.createObjectURL(fichier);
  el.nomPhoto.textContent = fichier.name || 'Photo collée';
  el.depotVide.hidden = true;
  el.depotApercu.hidden = false;
  majBouton();
}

// un aperçu impossible (HEIC hors Safari) n'empêche pas la création
el.apercuPhoto.addEventListener('error', () => { el.apercuPhoto.removeAttribute('src'); });

el.choixPhoto.addEventListener('change', () => choisirPhoto(el.choixPhoto.files[0]));
['dragenter', 'dragover'].forEach((type) => el.depot.addEventListener(type, (e) => {
  e.preventDefault();
  el.depot.classList.add('survol');
}));
['dragleave', 'drop'].forEach((type) => el.depot.addEventListener(type, (e) => {
  e.preventDefault();
  el.depot.classList.remove('survol');
}));
el.depot.addEventListener('drop', (e) => choisirPhoto(e.dataTransfer.files[0]));
document.addEventListener('paste', (e) => {
  const fichier = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (fichier) choisirPhoto(fichier);
});

const qualitePreferee = lirePref('qualite', 'standard');
const radioQualite = document.querySelector(`input[name="qualite"][value="${qualitePreferee}"]`);
if (radioQualite) radioQualite.checked = true;
document.querySelectorAll('input[name="qualite"]').forEach((radio) => {
  radio.addEventListener('change', () => ecrirePref('qualite', radio.value));
});
for (const [cle, case_a_cocher, defaut] of [['detourage', el.detourage, '1'], ['symetrie', el.symetrie, '0']]) {
  case_a_cocher.checked = lirePref(cle, defaut) === '1';
  case_a_cocher.addEventListener('change', () => ecrirePref(cle, case_a_cocher.checked ? '1' : '0'));
}

function majBouton() {
  const occupe = Boolean(etat.travail && ['en_attente', 'en_cours'].includes(etat.travail.etat));
  visionneuse.mettreEnPause(occupe);
  el.boutonCreer.disabled = !etat.photo || occupe;
  el.boutonCreer.textContent = occupe ? 'Création en cours…' : 'Créer le modèle 3D';
}

// ---------- création ----------
el.formulaire.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!etat.photo) return;
  afficherAlerte('');
  const qualite = document.querySelector('input[name="qualite"]:checked').value;
  const parametres = new URLSearchParams({
    nom: etat.photo.name || 'photo-collee.png',
    qualite,
    detourage: el.detourage.checked ? '1' : '0',
    symetrie: el.symetrie.checked ? '1' : '0',
  });
  try {
    const { id } = await api(`/api/generer?${parametres}`, { method: 'POST', body: etat.photo });
    etat.travail = { id, etat: 'en_attente', nom: etat.photo.name };
    el.suiviTitre.textContent = nomSansExtension(etat.photo.name || 'Photo collée');
    afficherSuivi(etat.travail);
    majBouton();
    suivreTravail(id);
  } catch (erreur) {
    afficherAlerte(erreur.message);
  }
});

function afficherSuivi(travail) {
  el.suivi.hidden = false;
  el.suiviBarre.style.width = `${Math.round((travail.progression || 0) * 100)}%`;
  el.suiviTemps.textContent = travail.ecoule ? duree(travail.ecoule) : '';
  const ordre = [...el.etapes.children].map((li) => li.dataset.etape);
  const indexCourant = travail.etat === 'termine' ? ordre.length : ordre.indexOf(travail.etape);
  el.etapes.querySelectorAll('li').forEach((li, i) => {
    li.classList.toggle('fait', i < indexCourant);
    li.classList.toggle('en-cours', travail.etat === 'en_cours' && i === indexCourant);
  });
  let message = '';
  if (travail.etat === 'en_attente') {
    message = etat.moteurPret
      ? 'En attente…'
      : 'En attente du chargement du modèle IA. La création démarrera toute seule.';
  } else if (travail.etat === 'termine') {
    message = `Modèle prêt en ${duree(travail.modele?.duree_secondes)}.`;
  } else if (travail.etape === 'maillage') {
    message = "C'est l'étape la plus longue.";
  }
  el.suiviMessage.textContent = message;
}

async function suivreTravail(id) {
  while (etat.travail && etat.travail.id === id) {
    await new Promise((ok) => setTimeout(ok, 800));
    let travail;
    try {
      travail = await api(`/api/travaux/${encodeURIComponent(id)}`);
    } catch (erreur) {
      afficherAlerte(`Le suivi de la création a été interrompu : ${erreur.message}. L'Atelier est-il toujours ouvert ?`);
      etat.travail = null;
      el.suivi.hidden = true;
      majBouton();
      return;
    }
    etat.travail = travail;
    afficherSuivi(travail);
    majBouton();
    if (travail.etat === 'termine') {
      await chargerGalerie();
      await afficherModele(travail.modele);
      return;
    }
    if (travail.etat === 'erreur') {
      el.suivi.hidden = true;
      afficherAlerte(travail.message);
      return;
    }
  }
}

// ---------- état du modèle IA ----------
async function surveillerMoteur() {
  for (;;) {
    try {
      const moteur = await api('/api/etat');
      el.etatMoteur.dataset.etat = moteur.etat;
      const appareil = { cpu: 'processeur', cuda: 'carte graphique NVIDIA', mps: 'puce Apple' }[moteur.appareil];
      el.etatMoteurTexte.textContent = moteur.etat === 'pret'
        ? `Prêt · calcul sur ${appareil || moteur.appareil}`
        : moteur.message;
      etat.moteurPret = moteur.etat === 'pret';
      if (moteur.etat !== 'chargement') return;
    } catch {
      el.etatMoteur.dataset.etat = 'erreur';
      el.etatMoteurTexte.textContent = "L'Atelier ne répond pas. Relancez-le.";
    }
    await new Promise((ok) => setTimeout(ok, 1500));
  }
}

// ---------- démarrage ----------
surveillerMoteur();
chargerGalerie().then(() => {
  if (etat.modeles.length) afficherModele(etat.modeles[0]);
});
