// Visionneuse 3D : affiche un modèle GLB texturé avec un éclairage de studio.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const FONDS = {
  clair: { haut: '#f3f7f6', bas: '#cad8d4', ombre: 0.22 },
  sombre: { haut: '#27393b', bas: '#0a1314', ombre: 0.45 },
  aquarium: { haut: '#3aa6b9', bas: '#082634', ombre: 0.35 },
};

function degrade(haut, bas) {
  const toile = document.createElement('canvas');
  toile.width = 2;
  toile.height = 256;
  const ctx = toile.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, haut);
  g.addColorStop(1, bas);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(toile);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function liberer(objet) {
  objet.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    const materiaux = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of materiaux) {
      for (const cle of Object.keys(m)) {
        if (m[cle] && m[cle].isTexture) m[cle].dispose();
      }
      m.dispose();
    }
  });
}

export class Visionneuse {
  constructor(conteneur) {
    this.conteneur = conteneur;
    this.rendu = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.rendu.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendu.outputColorSpace = THREE.SRGBColorSpace;
    this.rendu.toneMapping = THREE.NeutralToneMapping;
    this.rendu.shadowMap.enabled = true;
    this.rendu.shadowMap.type = THREE.PCFSoftShadowMap;
    conteneur.prepend(this.rendu.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.rendu);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.85;

    this.lumiere = new THREE.DirectionalLight(0xffffff, 1.4);
    this.lumiere.position.set(2, 4, 3);
    this.lumiere.castShadow = true;
    this.lumiere.shadow.mapSize.set(2048, 2048);
    this.lumiere.shadow.radius = 6;
    this.lumiere.shadow.bias = -0.0005;
    this.scene.add(this.lumiere, this.lumiere.target);

    this.sol = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ opacity: 0.22 }),
    );
    this.sol.rotation.x = -Math.PI / 2;
    this.sol.receiveShadow = true;
    this.scene.add(this.sol);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this.camera.position.set(1.2, 0.8, 2.4);
    this.controles = new OrbitControls(this.camera, this.rendu.domElement);
    this.controles.enableDamping = true;
    this.controles.autoRotateSpeed = 1.6;
    this.controles.addEventListener('change', () => { this.aRedessiner = true; });

    this.modele = null;
    this.jeton = 0; // numéro du dernier chargement demandé
    this.textures = {};
    this.aRedessiner = true;
    this.definirFond('clair');

    new ResizeObserver(() => this.redimensionner()).observe(conteneur);
    this.redimensionner();
    this.rendu.setAnimationLoop(() => this.boucle());
  }

  redimensionner() {
    const { clientWidth: l, clientHeight: h } = this.conteneur;
    if (!l || !h) return;
    this.rendu.setSize(l, h, false);
    this.camera.aspect = l / h;
    this.camera.updateProjectionMatrix();
    this.aRedessiner = true;
  }

  boucle() {
    // on ne redessine que si la vue change : l'ordinateur reste disponible pour les calculs
    this.controles.autoRotate = this.rotationDemandee && this.modele !== null && !this.enPause;
    const bouge = this.controles.update();
    if (bouge || this.aRedessiner) {
      this.aRedessiner = false;
      this.rendu.render(this.scene, this.camera);
    }
  }

  definirFond(nom) {
    const cle = FONDS[nom] ? nom : 'clair';
    const fond = FONDS[cle];
    if (!this.textures[cle]) this.textures[cle] = degrade(fond.haut, fond.bas);
    this.scene.background = this.textures[cle];
    this.sol.material.opacity = fond.ombre;
    this.conteneur.dataset.fond = cle; // la feuille de style adapte les textes posés sur la scène
    this.aRedessiner = true;
  }

  definirRotation(active) {
    this.rotationDemandee = active;
    this.aRedessiner = true;
  }

  // pendant une création, la rotation automatique s'arrête pour laisser le processeur à l'IA
  mettreEnPause(pause) {
    this.enPause = pause;
    this.aRedessiner = true;
  }

  async charger(url) {
    // si un autre modèle est demandé (ou la vue vidée) pendant le téléchargement, celui-ci est abandonné
    const jeton = ++this.jeton;
    const gltf = await new GLTFLoader().loadAsync(url);
    if (jeton !== this.jeton) {
      liberer(gltf.scene);
      return null;
    }
    if (this.modele) {
      this.scene.remove(this.modele);
      liberer(this.modele);
    }
    const modele = gltf.scene;
    modele.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.scene.add(modele);
    this.modele = modele;
    this.cadrer();
    return modele;
  }

  cadrer() {
    const boite = new THREE.Box3().setFromObject(this.modele);
    const sphere = boite.getBoundingSphere(new THREE.Sphere());
    const r = sphere.radius || 1;
    const centre = sphere.center;

    this.sol.position.set(centre.x, boite.min.y, centre.z);
    this.sol.scale.setScalar(r * 12);

    const ombre = this.lumiere.shadow.camera;
    ombre.left = ombre.bottom = -r * 1.6;
    ombre.right = ombre.top = r * 1.6;
    ombre.near = 0.01;
    ombre.far = r * 12;
    ombre.updateProjectionMatrix();
    this.lumiere.position.copy(centre).add(new THREE.Vector3(r * 2, r * 4, r * 3));
    this.lumiere.target.position.copy(centre);

    const distance = (r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.05;
    const direction = new THREE.Vector3(0.45, 0.28, 1).normalize();
    this.camera.position.copy(centre).addScaledVector(direction, distance);
    this.camera.near = r / 100;
    this.camera.far = r * 100;
    this.camera.updateProjectionMatrix();
    this.controles.target.copy(centre);
    this.controles.minDistance = r * 0.6;
    this.controles.maxDistance = r * 8;
    this.controles.update();
    this.aRedessiner = true;
  }

  vider() {
    this.jeton++;
    if (!this.modele) return;
    this.scene.remove(this.modele);
    liberer(this.modele);
    this.modele = null;
    this.aRedessiner = true;
  }

  capture() {
    this.rendu.render(this.scene, this.camera);
    return new Promise((ok) => this.rendu.domElement.toBlob(ok, 'image/png'));
  }
}
