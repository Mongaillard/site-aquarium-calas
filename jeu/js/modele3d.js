// ---------------------------------------------------------------------------
// Personnages en vraie 3D.
//
// Le milicien et le villageois ne sont plus des planches dessinées : ce sont les
// modèles animés exportés par l'Atelier 3D (assets/modeles/*.json : du glTF
// texte, données embarquées — tout hébergeur le sert, pas toujours le .glb).
// Au premier lancement, le jeu les charge avec three.js (le même paquet réduit
// que l'essai « 3D en direct », js/vendor/three-jeu.min.js) et
// en tire lui-même les images de chaque animation dans les huit directions,
// avec la caméra commune des sprites : orthographique, au sud, 30° au-dessus
// de l'horizon. Le reste du moteur continue de dessiner des images — rapide sur
// un téléphone, même avec cinquante soldats à l'écran. Changer de modèle, c'est
// remplacer le fichier : rien à redessiner, rien à réexporter.
//
// Règle des cases (celle de l'Atelier et de caseDirection) : case k (0 = sud,
// 1 = sud-est, 2 = est … 7 = sud-ouest) = modèle tourné de +45°·k autour de la
// verticale, caméra et lumière fixes. Une animation par atlas, chacun avec sa
// propre case (l'union des emprises de toutes ses images) et la même ancre : le
// point entre les pieds, à la même place d'une image à l'autre — le
// personnage tourne sur ses pieds et ne glisse jamais.
// ---------------------------------------------------------------------------

/**
 * Les unités en 3D. `clips` associe chaque état du jeu à une animation du
 * fichier, `images` le nombre d'images tirées de chacune (celles de l'Atelier,
 * unites_jeu.json). `taille` est la hauteur à l'écran, en px monde, de la pose
 * de repos vue de face — la même mesure que l'Atelier. `accessoires` : pour le
 * milicien, l'épée et le bouclier restent en main dans TOUTES les animations,
 * à la place qu'ils ont dans celle-ci (le fichier les cache pendant le coup
 * reçu et la mort) ; sans lui, chaque animation montre ses propres outils
 * (panier, marteau, hache, pioche, couteau, fagot du villageois).
 * `accessoiresFiges` : les seuls états où cette place s'impose — pour
 * l'archer, l'arc reste en main quand il est touché ou tombe, mais le tir
 * garde son propre geste (l'arc pivote, la flèche paraît puis part).
 */
export const MODELES = {
  villager: {
    src: 'assets/modeles/villageois.json',
    taille: 37,
    clips: {
      marche: 'marche', repos: 'repos', attaque: 'attaque_poing', touche: 'coup_recu', mort: 'mort',
      cueillir: 'recolter', construire: 'construire', porter: 'porter', bois: 'couper_bois', or: 'miner', viande: 'depecer',
    },
    images: {
      marche: 12, repos: 6, attaque: 6, touche: 5, mort: 10,
      cueillir: 8, construire: 6, porter: 8, bois: 8, or: 8, viande: 6,
    },
    boucles: ['marche', 'repos', 'cueillir', 'construire', 'porter', 'bois', 'or', 'viande'],
    // Suivent le sol plutôt que l'horloge : les pieds ne patinent pas.
    parDistance: ['marche', 'porter'],
    accessoires: null,
  },
  // L'homme-poisson atlante : son trident reste en main partout, comme l'épée.
  triton: {
    src: 'assets/modeles/atlante.json',
    taille: 43,
    clips: { marche: 'marche_trident', repos: 'garde_trident', attaque: 'attaque_trident', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 12, repos: 6, attaque: 8, touche: 5, mort: 10 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde_trident',
  },
  // L'archer : arc en main (gauche), flèche encochée seulement pendant le tir.
  archer: {
    src: 'assets/modeles/archer.json',
    taille: 40,
    clips: { marche: 'marche_arc', repos: 'garde_arc', attaque: 'tir_arc', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 12, repos: 6, attaque: 10, touche: 5, mort: 10 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde_arc',
    accessoiresFiges: ['touche', 'mort'],
    // Secondes : la flèche quitte l'arc à cet instant de « tir_arc » (évènement
    // « tir » du pack Archer de l'Atelier). Le rendu y cale le tir du jeu.
    lacher: 0.95,
  },
  // L'Hydre : la bibliothèque « quatre pattes » de l'Atelier sur un squelette
  // à trois cous. Sa marche du jeu est le trot — à sa vitesse, c'est lui qui
  // ne patine pas. Une fois et demie la taille d'un homme, et bien plus longue.
  hydra: {
    src: 'assets/modeles/hydre.json',
    taille: 66,
    clips: { marche: 'trot', repos: 'repos', attaque: 'attaque_morsure', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 12, repos: 6, attaque: 8, touche: 5, mort: 10 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: null,
  },
  // Le lancier atlante : casque à cimier, cuirasse d'écailles, la lance au poing.
  spearman: {
    src: 'assets/modeles/lancier.json',
    taille: 43,
    clips: { marche: 'marche_lance', repos: 'garde_lance', attaque: 'attaque_lance', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 12, repos: 6, attaque: 8, touche: 5, mort: 10 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde_lance',
  },
  militia: {
    src: 'assets/modeles/milicien.json',
    taille: 42,
    clips: { marche: 'marche_epee', repos: 'garde', attaque: 'attaque_epee', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 12, repos: 6, attaque: 8, touche: 5, mort: 10 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde',
  },
};

const DENSITE = 2;          // px d'atlas par px monde (le style « net » de l'Atelier)
const SUR = 2;              // suréchantillonnage : rendu deux fois plus fin, puis réduit
const ELEVATION = 30;       // degrés : caméra commune des sprites
const LUMIERE = [-0.55, 0.75, 0.45];   // repère caméra : en haut à gauche, un peu de face
// Cadre de travail autour de l'ancre, en mètres : assez large pour un mort
// étendu de tout son long et une épée levée. Chaque atlas est ensuite recadré
// sur l'union de ses images.
const CADRE = { gauche: 2.1, droite: 2.1, haut: 2.5, bas: 1.3 };
const MARGE = 2;            // px d'atlas autour de l'emprise (le contour y loge)
/** Lumières (× π : l'éclairage physique de three.js) et retouche des couleurs. */
export const REGLAGE = { ambiante: 0.78, directe: 0.7, saturation: 1.0, contraste: 1.08 };

// Rendre la main entre deux directions, sans minuterie : un onglet en arrière-
// plan bride setTimeout à une fois par seconde, pas les messages.
const LOOP_ONCE = 2200;     // THREE.LoopOnce (absent du paquet réduit)
const pause = () => new Promise((r) => {
  const canal = new MessageChannel();
  canal.port1.onmessage = () => { canal.port1.close(); r(); };
  canal.port2.postMessage(0);
});

// La cuisson est gardée d'une partie à l'autre (Cache Storage) : au second
// lancement, les atlas reviennent en un instant, sans three.js. La clé porte
// l'empreinte du fichier et la version de la cuisson — un nouveau modèle, ou
// une caméra retouchée ici, refait la cuisson une fois.
const VERSION_CUISSON = 1;
const CACHE = 'aem-modeles-3d';

/** Empreinte FNV-1a du fichier : deux modèles différents, deux clés. */
function empreinte(octets) {
  const mots = new Uint32Array(octets, 0, octets.byteLength >> 2);
  let h = 0x811c9dc5;
  for (let i = 0; i < mots.length; i++) h = Math.imul(h ^ mots[i], 0x01000193) >>> 0;
  return `${h.toString(16)}-${octets.byteLength}`;
}

/**
 * Les atlas d'une unité en 3D : lus dans le cache s'ils y sont, sinon cuits
 * (puis rangés). Renvoie `{ cycle, clips: { marche: { canvas, cellW, cellH,
 * ancreY, hauteurMonde, images, duree, boucle, cycle, lacher }, … } }`, ou lève une
 * erreur (pas de WebGL, fichier absent) : l'appelant garde alors
 * l'illustration dessinée.
 */
export async function modeleCuit(cle, vitessePxS) {
  const m = MODELES[cle];
  const reponse = await fetch(m.src);
  if (!reponse.ok) throw new Error(`${m.src} : ${reponse.status}`);
  const octets = await reponse.arrayBuffer();
  const url = new URL(m.src, location.href);
  url.searchParams.set('cuisson', `${VERSION_CUISSON}-${empreinte(octets)}-${m.taille}-${vitessePxS}`);
  const cleCache = url.href;
  try {
    const lu = await lireCache(cleCache);
    if (lu) return lu;
  } catch { /* cache illisible : on recuit */ }
  const cuit = await aTourDeRole(async () => {
    try {
      return await cuireModele(cle, vitessePxS, octets);
    } catch (erreur) {
      // Un téléphone à court de mémoire graphique : une seconde cuisson, plus
      // légère (sans suréchantillonnage ni anticrénelage), avant d'abandonner.
      console.warn(`Cuisson de ${cle} : ${erreur && erreur.message} — nouvel essai, plus léger`);
      return cuireModele(cle, vitessePxS, octets, { sur: 1, anticrenelage: false });
    }
  });
  rangerCache(cleCache, m.src, cuit).catch(() => { /* stockage plein ou privé : tant pis */ });
  return cuit;
}

// Une cuisson à la fois : deux contextes WebGL et leurs grandes toiles en même
// temps dépassaient la mémoire graphique de certains téléphones.
let file = Promise.resolve();
function aTourDeRole(tache) {
  const tour = file.then(tache);
  file = tour.catch(() => {});
  return tour;
}

async function lireCache(cle) {
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(CACHE);
  const r = await cache.match(cle);
  if (!r) return null;
  const meta = await r.json();
  for (const [etat, c] of Object.entries(meta.clips)) {
    const image = await cache.match(`${cle}&clip=${etat}`);
    if (!image) return null;
    const bmp = await createImageBitmap(await image.blob());
    c.canvas = document.createElement('canvas');
    c.canvas.width = bmp.width; c.canvas.height = bmp.height;
    c.canvas.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close?.();
  }
  return meta;
}

async function rangerCache(cle, src, cuit) {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(CACHE);
  // Les cuissons d'un ancien modèle de la même unité ne servent plus.
  for (const r of await cache.keys()) {
    if (r.url.startsWith(new URL(src, location.href).href) && !r.url.startsWith(cle)) await cache.delete(r);
  }
  const meta = { cycle: cuit.cycle, clips: {} };
  for (const [etat, c] of Object.entries(cuit.clips)) {
    const { canvas, ...infos } = c;
    meta.clips[etat] = infos;
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
    await cache.put(`${cle}&clip=${etat}`, new Response(blob, { headers: { 'Content-Type': 'image/png' } }));
  }
  await cache.put(cle, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
}

/**
 * Le glTF texte porte son tampon en base64 (`data:`) et sa texture dans ce
 * tampon ; GLTFLoader les chargerait par des adresses `data:` et `blob:`, que
 * la politique de sécurité de l'artefact claude.ai interdit (« Failed to load
 * buffer »). On lui donne donc un .glb reconstruit en mémoire, le tampon dans
 * son bloc binaire et sans image ; les images sont rendues à part (Blob, à
 * décoder par createImageBitmap, sans adresse) avec, par nom de matériau,
 * l'image de sa couleur de base.
 */
function gltfSansAdresses(octets) {
  const g = JSON.parse(new TextDecoder().decode(octets));
  const tampon = g.buffers[0];
  const base64 = tampon.uri.slice(tampon.uri.indexOf(',') + 1);
  const texte = atob(base64);
  const bin = new Uint8Array(texte.length);
  for (let i = 0; i < texte.length; i++) bin[i] = texte.charCodeAt(i);
  delete tampon.uri;
  tampon.byteLength = bin.length;
  const images = (g.images || []).map((im) => {
    const v = g.bufferViews[im.bufferView];
    const debut = v.byteOffset || 0;
    return new Blob([bin.subarray(debut, debut + v.byteLength)], { type: im.mimeType || 'image/png' });
  });
  const cartes = {};
  for (const mat of g.materials || []) {
    const t = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
    if (!t) continue;
    cartes[mat.name] = g.textures[t.index].source;
    delete mat.pbrMetallicRoughness.baseColorTexture;
  }
  delete g.textures; delete g.images; delete g.samplers;
  // Conteneur GLB : en-tête, bloc JSON (complété d'espaces), bloc binaire (de zéros).
  const json = new TextEncoder().encode(JSON.stringify(g));
  const lj = Math.ceil(json.length / 4) * 4, lb = Math.ceil(bin.length / 4) * 4;
  const glb = new ArrayBuffer(12 + 8 + lj + 8 + lb);
  const vue = new DataView(glb), octetsGlb = new Uint8Array(glb);
  vue.setUint32(0, 0x46546c67, true); vue.setUint32(4, 2, true); vue.setUint32(8, glb.byteLength, true);
  vue.setUint32(12, lj, true); vue.setUint32(16, 0x4e4f534a, true);
  octetsGlb.set(json, 20); octetsGlb.fill(0x20, 20 + json.length, 20 + lj);
  vue.setUint32(20 + lj, lb, true); vue.setUint32(24 + lj, 0x004e4942, true);
  octetsGlb.set(bin, 28 + lj);
  return { glb, images, cartes };
}

/**
 * Charge le modèle (octets du fichier glTF) et cuit toutes ses animations.
 * `sur` : suréchantillonnage du rendu ; `anticrenelage` : celui de WebGL.
 */
export async function cuireModele(cle, vitessePxS, octets, { sur = SUR, anticrenelage = true } = {}) {
  const m = MODELES[cle];
  const THREE = await import('./vendor/three-jeu.min.js');
  const { glb, images, cartes } = gltfSansAdresses(octets);
  const gltf = await new Promise((ok, echec) => new THREE.GLTFLoader().parse(glb, '', ok, echec));
  const modele = gltf.scene;
  // La texture, décodée à part et posée sur son matériau.
  const textures = await Promise.all(images.map(async (blob) => {
    const bmp = await createImageBitmap(blob);
    const toileTexture = document.createElement('canvas');
    toileTexture.width = bmp.width; toileTexture.height = bmp.height;
    toileTexture.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close?.();
    const t = new THREE.CanvasTexture(toileTexture);
    t.flipY = false;                        // convention glTF
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }));
  modele.traverse((o) => {
    if (!o.isMesh || !(o.material.name in cartes)) return;
    o.material.map = textures[cartes[o.material.name]];
    o.material.needsUpdate = true;
  });
  // Les matériaux de l'Atelier sont mats (rugosité 1, pas de métal) : la
  // texture peinte porte déjà ses ombres.
  modele.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  const scene = new THREE.Scene();
  const pivot = modele;                     // tourné vers la case voulue
  scene.add(modele);

  const e = (ELEVATION * Math.PI) / 180;
  const versCamera = new THREE.Vector3(0, Math.sin(e), Math.cos(e));
  const hautCamera = new THREE.Vector3(0, Math.cos(e), -Math.sin(e));
  const lumiere = new THREE.DirectionalLight(0xffffff, REGLAGE.directe * Math.PI);
  lumiere.position.set(0, 0, 0)
    .addScaledVector(new THREE.Vector3(1, 0, 0), LUMIERE[0])
    .addScaledVector(hautCamera, LUMIERE[1])
    .addScaledVector(versCamera, LUMIERE[2]);
  scene.add(lumiere);
  // Une lumière d'ambiance : un ciel et un sol de même couleur.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, REGLAGE.ambiante * Math.PI));

  const melangeur = new THREE.AnimationMixer(modele);
  const clipDe = (nom) => {
    const c = gltf.animations.find((a) => a.name === nom);
    if (!c) throw new Error(`animation « ${nom} » absente de ${m.src}`);
    return c;
  };
  const jouer = (clip, t) => {
    melangeur.stopAllAction();
    const action = melangeur.clipAction(clip);
    // Une seule lecture, figée sur sa fin : la dernière image d'une mort est
    // le corps à terre, pas la première image d'un nouveau tour.
    action.setLoop(LOOP_ONCE, 1);
    action.clampWhenFinished = true;
    action.reset().play();
    melangeur.setTime(t);
  };

  // Épée et bouclier : leur place dans l'animation de référence, pour toutes.
  const accessoires = [];
  modele.traverse((o) => { if (o.name.startsWith('accessoire_')) accessoires.push(o); });
  if (m.accessoires && accessoires.length) jouer(clipDe(m.clips[m.accessoires] || m.accessoires), 0);
  const poseAccessoires = m.accessoires
    ? accessoires.map((o) => ({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }))
    : [];
  const poser = (clip, t, etat) => {
    jouer(clip, t);
    if (!m.accessoiresFiges || m.accessoiresFiges.includes(etat)) {
      for (const a of poseAccessoires) { a.o.position.copy(a.p); a.o.quaternion.copy(a.q); a.o.scale.copy(a.s); }
    }
    modele.updateMatrixWorld(true);
  };

  // Échelle : la pose de repos, de face, mesure `taille` px monde de haut.
  const hauteurRepos = (() => {
    pivot.rotation.y = 0;
    poser(clipDe(m.clips.repos), 0, 'repos');
    let bas = Infinity, haut = -Infinity;
    const v = new THREE.Vector3();
    modele.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        o.getVertexPosition(i, v);
        v.applyMatrix4(o.matrixWorld);
        const y = v.dot(hautCamera);
        if (y < bas) bas = y;
        if (y > haut) haut = y;
      }
    });
    return haut - bas;
  })();
  const pxParM = (m.taille * DENSITE) / hauteurRepos;   // px d'atlas par mètre
  const travailL = Math.ceil((CADRE.gauche + CADRE.droite) * pxParM);
  const travailH = Math.ceil((CADRE.haut + CADRE.bas) * pxParM);
  const ancreX = CADRE.gauche * pxParM, ancreY = CADRE.haut * pxParM;

  const toile = document.createElement('canvas');
  toile.width = travailL * sur; toile.height = travailH * sur;
  const rendu = new THREE.WebGLRenderer({ canvas: toile, alpha: true, antialias: anticrenelage, preserveDrawingBuffer: true });
  const gl = rendu.getContext();
  rendu.setPixelRatio(1);
  rendu.setClearColor(0x000000, 0);
  rendu.outputColorSpace = THREE.SRGBColorSpace;
  rendu.toneMapping = THREE.NoToneMapping;
  const camera = new THREE.OrthographicCamera(
    -CADRE.gauche, CADRE.droite, CADRE.haut, -CADRE.bas, 0.1, 50);
  camera.position.copy(versCamera).multiplyScalar(20);
  camera.up.copy(hautCamera);
  camera.lookAt(0, 0, 0);

  const clips = {};
  // Une seule bande de travail pour toutes les animations, rendue à la fin :
  // Safari compte la mémoire des toiles tant qu'elles ne sont pas libérées.
  const bande = document.createElement('canvas');
  bande.width = travailL * Math.max(...Object.values(m.images)); bande.height = travailH * 8;
  const bctx = bande.getContext('2d', { willReadFrequently: true });
  if (!bctx) throw new Error('mémoire graphique saturée (toile de travail refusée)');
  bctx.imageSmoothingQuality = 'high';
  try {
    for (const [etat, nom] of Object.entries(m.clips)) {
      const clip = clipDe(nom);
      const n = m.images[etat];
      const boucle = m.boucles.includes(etat);
      // Rangée = direction, colonne = image : la disposition de cadreSource.
      bctx.clearRect(0, 0, bande.width, bande.height);
      for (let k = 0; k < 8; k++) {
        pivot.rotation.y = (k * Math.PI) / 4;
        for (let i = 0; i < n; i++) {
          const t = boucle ? (i / n) * clip.duration : (i / Math.max(1, n - 1)) * clip.duration;
          poser(clip, t, etat);
          rendu.render(scene, camera);
          if (gl.isContextLost()) throw new Error('mémoire graphique saturée (contexte WebGL perdu)');
          bctx.drawImage(toile, i * travailL, k * travailH, travailL, travailH);
        }
        await pause();   // rendre la main : le menu reste fluide pendant la cuisson
      }
      clips[etat] = recadrer(bande, n, travailL, travailH, ancreX, ancreY);
      clips[etat].duree = clip.duration;
      clips[etat].boucle = boucle;
      if (etat === 'attaque' && m.lacher != null) clips[etat].lacher = m.lacher;
      // Une animation qui suit le sol couvre, en un tour, la distance parcourue
      // pendant sa durée à la vitesse de l'unité : les pieds ne patinent pas.
      if (m.parDistance.includes(etat)) clips[etat].cycle = Math.max(8, Math.round((vitessePxS || 32) * clip.duration));
    }
  } finally {
    melangeur.stopAllAction();
    rendu.dispose();
    rendu.forceContextLoss();
    bande.width = bande.height = 0;   // libère la mémoire tout de suite (Safari)
    toile.width = toile.height = 0;
  }
  return { cycle: clips.marche.cycle, clips };
}

/**
 * Recadre une bande de travail sur l'union des emprises, ancre au milieu
 * d'une case de largeur paire, puis passe le contour et la netteté.
 */
function recadrer(bande, n, L, H, ancreX, ancreY) {
  const ctx = bande.getContext('2d', { willReadFrequently: true });
  const largeur = L * n, hauteur = H * 8;   // la partie de la bande que cette animation occupe
  const px = ctx.getImageData(0, 0, largeur, hauteur).data;
  let gauche = Infinity, droite = -Infinity, haut = Infinity, bas = -Infinity;
  for (let y = 0; y < hauteur; y++) {
    const cy = y % H;
    for (let x = 0; x < largeur; x++) {
      if (px[(y * largeur + x) * 4 + 3] < 110) continue;
      const cx = x % L;
      if (cx < gauche) gauche = cx;
      if (cx > droite) droite = cx;
      if (cy < haut) haut = cy;
      if (cy > bas) bas = cy;
    }
  }
  if (!Number.isFinite(gauche)) throw new Error('modèle invisible à la caméra');
  const ax = Math.round(ancreX), ay = Math.round(ancreY);
  const demi = Math.max(ax - gauche, droite + 1 - ax) + MARGE;
  const x0 = ax - demi, y0 = haut - MARGE;
  const cellW = 2 * demi, cellH = bas + 1 + MARGE - y0;
  const atlas = document.createElement('canvas');
  atlas.width = cellW * n; atlas.height = cellH * 8;
  const actx = atlas.getContext('2d', { willReadFrequently: true });
  if (!actx) throw new Error('mémoire graphique saturée (atlas refusé)');
  for (let k = 0; k < 8; k++) {
    for (let i = 0; i < n; i++) {
      actx.drawImage(bande, i * L + x0, k * H + y0, cellW, cellH, i * cellW, k * cellH, cellW, cellH);
    }
  }
  netteteEtContour(actx, atlas.width, atlas.height);
  return { canvas: atlas, cellW, cellH, ancreY: ay - y0, hauteurMonde: cellH / DENSITE, images: n };
}

/**
 * Le traitement des sprites de l'Atelier : bords francs (un sprite réduit à
 * quarante pixels s'interpole mieux qu'un bord à demi transparent), couleurs
 * un peu relevées, et un liseré sombre qui détache le personnage de l'herbe.
 */
function netteteEtContour(ctx, l, h) {
  const img = ctx.getImageData(0, 0, l, h);
  const p = img.data;
  const plein = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) {
    const o = i * 4;
    if (p[o + 3] < 110) { p[o + 3] = 0; continue; }
    plein[i] = 1;
    p[o + 3] = 255;
    const r = p[o], g = p[o + 1], b = p[o + 2];
    const gris = 0.299 * r + 0.587 * g + 0.114 * b;
    for (let c = 0; c < 3; c++) {
      const v = gris + (p[o + c] - gris) * REGLAGE.saturation;
      p[o + c] = Math.max(0, Math.min(255, (v - 128) * REGLAGE.contraste + 128));
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const i = y * l + x;
      if (plein[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= l || yy >= h || !plein[yy * l + xx]) continue;
        const o = (yy * l + xx) * 4;
        r += p[o]; g += p[o + 1]; b += p[o + 2]; n++;
      }
      if (!n) continue;
      const o = i * 4;
      p[o] = (r / n) * 0.4; p[o + 1] = (g / n) * 0.4; p[o + 2] = (b / n) * 0.4; p[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
