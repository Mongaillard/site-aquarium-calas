// ---------------------------------------------------------------------------
// Essai : personnages en 3D en direct.
//
// Le jeu dessine en Canvas 2D. Ici, les unités d'un type donné sont rendues
// par WebGL — three.js, chargé seulement si l'on choisit ce style —, chacune
// dans une case d'un canevas hors écran, au début de l'image ; l'ordre du
// peintre recopie ensuite chaque case à sa place, comme un sprite : un arbre
// ou un toit devant l'unité la cache toujours.
//
// La caméra est celle de l'atlas précalculé du même modèle (orthographique,
// même élévation, même cadrage) : la case se pose exactement comme une case
// d'atlas, ancre des pieds comprise. Ce qui change : l'unité tourne selon sa
// vraie direction, pas en huit crans, et l'animation se calcule à chaque image.
// ---------------------------------------------------------------------------

import { recolorer } from './sprites.js';

/** Au-delà, les unités de trop gardent l'atlas précalculé : le téléphone d'abord. */
const MAX_UNITES = 64;

export class Rendu3D {
  /**
   * @param def définition d'atlas portant `modele3d` (voir sprites.js) : son
   *   cadrage, ses pieds, sa règle de couleur d'équipe servent tels quels.
   */
  constructor(def) {
    this.def = def;
    this.pret = false;
    this.erreur = null;
    this.instances = new Map();   // id d'unité → modèle cloné, mixeur, scène
    this.cases = new Map();       // id d'unité → case rendue pour l'image en cours
    this.canvas = null;
    this.chargement = this.charger().catch((e) => { this.erreur = e && e.message ? e.message : String(e); });
  }

  async charger() {
    const T = await import('./vendor/three-jeu.min.js');
    this.T = T;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.NoToneMapping;
    this.renderer = renderer;
    this.canvas = canvas;

    const gltf = await new Promise((ok, echec) => new T.GLTFLoader().load(this.def.modele3d.src, ok, undefined, echec));
    this.gltf = gltf;
    this.clips = {};
    for (const [role, nom] of Object.entries(this.def.modele3d.clips)) {
      const clip = gltf.animations.find((a) => a.name === nom);
      if (!clip) throw new Error(`animation absente du modèle : ${nom}`);
      this.clips[role] = clip;
    }

    // Couleur d'équipe : la texture d'origine sert le camp `natif`, l'autre
    // reçoit la même règle que l'atlas (fenêtre de teinte).
    this.materiaux = {};
    let base = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !base) base = o.material; });
    const autre = base.clone();
    if (base.map && base.map.image) {
      const img = base.map.image;
      const canvasAutre = recolorer(this.def, img, img.width, img.height);
      const tex = new T.CanvasTexture(canvasAutre);
      tex.colorSpace = T.SRGBColorSpace;
      tex.flipY = base.map.flipY;
      tex.wrapS = base.map.wrapS; tex.wrapT = base.map.wrapT;
      tex.magFilter = base.map.magFilter; tex.minFilter = base.map.minFilter;
      autre.map = tex;
    }
    const natif = this.def.natif === 'bleu' ? 0 : 1;   // joueur 0 bleu, joueur 1 rouge
    this.materiaux[natif] = base;
    this.materiaux[1 - natif] = autre;

    // La caméra de l'atlas : orthographique, `elevation` degrés au-dessus de
    // l'horizon, tournée vers le nord (-z), cadrée sur `ortho` unités.
    const { elevation, ortho, cibleY } = this.def.modele3d.camera;
    const e = (elevation * Math.PI) / 180;
    const cam = new T.OrthographicCamera(-ortho / 2, ortho / 2, ortho / 2, -ortho / 2, 0.1, 100);
    const cible = new T.Vector3(0, cibleY, 0);
    cam.position.set(0, cibleY + Math.sin(e) * 20, Math.cos(e) * 20);
    cam.lookAt(cible);
    this.camera = cam;
    this.pret = true;
  }

  /** Une scène par unité : son modèle, ses deux lumières, son mixeur. */
  instance(u) {
    let inst = this.instances.get(u.id);
    if (inst && inst.equipe === u.playerIndex) return inst;
    const T = this.T;
    const scene = new T.Scene();
    // Soleil au nord-ouest, en hauteur, et le ciel pour les ombres : l'éclairage
    // du rendu Blender de l'atlas, étalonné sur lui — même pose, même case,
    // couleur moyenne à un niveau près (124, 129, 136 contre 125, 130, 137).
    scene.add(new T.HemisphereLight(0xd6deec, 0x4a4636, 3.4));
    const soleil = new T.DirectionalLight(0xffffff, 4.6);
    soleil.position.set(-0.55, 1.0, -0.45);
    scene.add(soleil);
    const modele = T.clonerSquelette(this.gltf.scene);
    const materiau = this.materiaux[u.playerIndex === 0 ? 0 : 1];
    modele.traverse((o) => { if (o.isMesh) { o.material = materiau; o.frustumCulled = false; } });
    scene.add(modele);
    const mixer = new T.AnimationMixer(modele);
    inst = { scene, modele, mixer, action: null, equipe: u.playerIndex, actions: {} };
    for (const [role, clip] of Object.entries(this.clips)) inst.actions[role] = mixer.clipAction(clip);
    this.instances.set(u.id, inst);
    return inst;
  }

  /** Pose l'animation `role` au temps `t` (secondes) : pas d'horloge propre, le jeu la dicte. */
  poser(inst, role, t) {
    const action = inst.actions[role];
    if (inst.action !== action) {
      if (inst.action) inst.action.stop();
      action.play();
      inst.action = action;
    }
    action.time = t;
    inst.mixer.update(0);
  }

  /**
   * Rend, pour cette image, chaque unité de `unites` dans sa case. `anims` :
   * l'état d'animation de chaque unité (voir Renderer.unitAnim) ; `taille` :
   * le côté d'une case en pixels de l'écran.
   */
  preparer(unites, anims, taille, horloge) {
    this.cases.clear();
    if (!this.pret || unites.length === 0) return;
    const n = Math.min(unites.length, MAX_UNITES);
    const colonnes = Math.ceil(Math.sqrt(n));
    const lignes = Math.ceil(n / colonnes);
    const L = colonnes * taille, H = lignes * taille;
    // Le canevas ne fait que grandir : le redimensionner à chaque image
    // réallouerait la mémoire graphique.
    if (this.canvas.width < L || this.canvas.height < H) {
      this.renderer.setSize(Math.max(L, this.canvas.width), Math.max(H, this.canvas.height), false);
    }
    const r = this.renderer;
    const hauteur = this.canvas.height;
    const vus = new Set();
    const def = this.def;
    r.setScissorTest(true);
    for (let i = 0; i < n; i++) {
      const u = unites[i];
      const anim = anims[i];
      const inst = this.instance(u);
      vus.add(u.id);
      if (anim.coup >= 0) {
        this.poser(inst, 'attaque', Math.min(anim.coup, 0.999) * this.clips.attaque.duration);
      } else if (anim.avance) {
        const cycle = ((anim.distance || 0) / (def.cycle || 40)) % 1;
        this.poser(inst, 'marche', cycle * this.clips.marche.duration);
      } else {
        this.poser(inst, 'repos', (horloge + (u.id % 7) * 0.53) % this.clips.repos.duration);
      }
      // Le modèle regarde vers +z (le sud, face au joueur) ; le jeu compte
      // `facing` depuis l'est, dans le sens des aiguilles d'une montre à l'écran.
      inst.modele.rotation.y = Math.PI / 2 - u.facing;
      const col = i % colonnes, ligne = Math.floor(i / colonnes);
      const x = col * taille, yBas = hauteur - (ligne + 1) * taille;   // WebGL compte depuis le bas
      r.setViewport(x, yBas, taille, taille);
      r.setScissor(x, yBas, taille, taille);
      r.render(inst.scene, this.camera);
      this.cases.set(u.id, { sx: x, sy: ligne * taille, taille });
    }
    r.setScissorTest(false);
    // Les unités sorties de la vue (ou mortes) rendent leur modèle.
    for (const id of this.instances.keys()) if (!vus.has(id)) this.instances.delete(id);
  }

  /** Case rendue pour cette unité dans l'image en cours, ou null (l'atlas prend le relais). */
  cellule(u) { return this.cases.get(u.id) || null; }

  liberer() {
    this.instances.clear();
    this.cases.clear();
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); }
    this.pret = false;
  }
}

/** WebGL est-il disponible ? (Sans lui, le style « 3D en direct » garde l'atlas précalculé.) */
export function webglDisponible() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    // Le contexte d'essai est rendu aussitôt : un navigateur n'en garde qu'une poignée.
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch { return false; }
}
