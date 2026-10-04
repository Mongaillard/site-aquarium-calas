// ---------------------------------------------------------------------------
// Personnages en vraie 3D.
//
// Le milicien et le villageois ne sont plus des planches dessinées : ce sont les
// modèles animés exportés par l'Atelier 3D (assets/modeles/*.json : du glTF
// texte, données embarquées — tout hébergeur le sert, pas toujours le .glb).
// Au premier lancement, le jeu les charge avec three.js (le même paquet réduit
// que l'essai « 3D en direct », js/vendor/three-jeu.min.js) et
// en tire lui-même les images de chaque animation dans cinq directions (les trois autres en sont le miroir),
// avec une caméra orthographique, au sud, un peu au-dessus de l'horizon
// (REGLAGE.elevation). Le reste du moteur continue de dessiner des images — rapide sur
// un téléphone, même avec cinquante soldats à l'écran. Changer de modèle, c'est
// remplacer le fichier : rien à redessiner, rien à réexporter.
//
// Règle des cases (celle de l'Atelier et de caseDirection) : case k (0 = sud,
// 1 = sud-est, 2 = est … 7 = sud-ouest) = modèle tourné de +45°·k autour de la
// verticale, caméra et lumière fixes. Une animation par atlas, une colonne par
// direction (chacune à sa largeur, voir recadrer) et la même ancre partout : le
// point entre les pieds, à la même place d'une image à l'autre — le
// personnage tourne sur ses pieds et ne glisse jamais.
// ---------------------------------------------------------------------------

/**
 * Les unités en 3D. `clips` associe chaque état du jeu à une animation du
 * fichier, `images` le nombre d'images tirées de chacune : seize pour un tour
 * de marche, douze pour un coup ou un repos, treize pour une chute. Le rendu
 * en montre UNE à la fois, la plus proche (Renderer.poserImage3D) : un geste
 * lent a donc besoin d'assez d'images pour tenir une dizaine de poses par
 * seconde (la cueillette dure 1,6 s : quatorze images ; les cous de l'Hydre
 * ondulent au repos : seize). `taille` est la hauteur à l'écran, en px monde, de la pose
 * de repos vue de face — la même mesure que l'Atelier. `accessoires` : pour le
 * milicien, l'épée et le bouclier restent en main dans TOUTES les animations,
 * à la place qu'ils ont dans celle-ci (le fichier les cache pendant le coup
 * reçu et la mort) ; sans lui, chaque animation montre ses propres outils
 * (panier, marteau, hache, pioche, couteau, fagot du villageois).
 * `accessoiresFiges` : les seuls états où cette place s'impose — pour
 * l'archer, l'arc reste en main quand il est touché ou tombe, mais le tir
 * garde son propre geste (l'arc pivote, la flèche paraît puis part).
 * `tourne` : angle (degrés) à ajouter pour que l'avant du modèle regarde le sud
 * dans la case 0 — les engins viennent d'une vue de trois quarts.
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
      marche: 16, repos: 12, attaque: 8, touche: 5, mort: 13,
      cueillir: 14, construire: 8, porter: 12, bois: 10, or: 12, viande: 10,
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
    images: { marche: 16, repos: 12, attaque: 12, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde_trident',
  },
  // L'archer : arc en main (gauche), flèche encochée seulement pendant le tir.
  archer: {
    src: 'assets/modeles/archer.json',
    taille: 40,
    clips: { marche: 'marche_arc', repos: 'garde_arc', attaque: 'tir_arc', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 16, repos: 12, attaque: 16, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde_arc',
    accessoiresFiges: ['touche', 'mort'],
    // Secondes : la flèche quitte l'arc à cet instant de « tir_arc » (évènement
    // « tir » du pack Archer de l'Atelier). Le rendu y cale le tir du jeu.
    lacher: 0.95,
  },
  // L'Arbalétrier : les gestes de l'archer, l'arbalète à la place de l'arc — il
  // arme pendant la fin de sa recharge, le carreau part avec le tir du jeu.
  crossbowman: {
    src: 'assets/modeles/arbaletrier.json',
    taille: 42,
    clips: { marche: 'marche_arc', repos: 'garde_arc', attaque: 'tir_arc', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 16, repos: 12, attaque: 16, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde_arc',
    accessoiresFiges: ['touche', 'mort'],
    lacher: 0.95,
  },
  // L'Archer monté : cheval blanc au trot, l'arc en main gauche ; il tire droit
  // devant, par-dessus l'encolure (`lacher` : l'instant où la flèche part).
  horseArcher: {
    src: 'assets/modeles/archer-monte.json',
    taille: 50,
    clips: { marche: 'trot', repos: 'repos', attaque: 'attaque_cavalier', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 16, repos: 12, attaque: 14, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: null,
    lacher: 0.8,
  },
  // L'Hydre : la bibliothèque « quatre pattes » de l'Atelier sur un squelette
  // à trois cous. Sa marche du jeu est le trot — à sa vitesse, c'est lui qui
  // ne patine pas. Une fois et demie la taille d'un homme, et bien plus longue.
  hydra: {
    src: 'assets/modeles/hydre.json',
    taille: 66,
    clips: { marche: 'trot', repos: 'repos', attaque: 'attaque_morsure', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 16, repos: 16, attaque: 12, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: null,
  },
  // Le Cavalier lourd : un cheval caparaçonné (squelette « quatre pattes » de
  // l'Atelier) et son chevalier, dont le bras droit porte l'épée. Sa marche du
  // jeu est le trot. `taille` compte la longueur du cheval vue de face en
  // plongée — de la tête du cavalier aux sabots de devant, environ 1,8 m pour
  // un modèle haut de 1,75 m. À 52, cheval et cavalier font de profil 47 px de
  // haut et 56 de long, à côté d'un fantassin de 42 : une demi-tête de plus.
  // À l'échelle d'origine (78), il en faisait 70 sur 85 et écrasait tout.
  knight: {
    src: 'assets/modeles/cavalier.json',
    taille: 52,
    clips: { marche: 'trot', repos: 'repos', attaque: 'attaque_cavalier', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 16, repos: 12, attaque: 12, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: null,
  },
  // Le Bélier : un engin, pas un personnage — châssis, poutre suspendue qui va et
  // vient, quatre roues (un quart de tour par cycle : elles ont quatre rayons).
  ram: {
    src: 'assets/modeles/belier.json',
    taille: 62,
    clips: { marche: 'marche', repos: 'repos', attaque: 'attaque', touche: 'coup_recu', mort: 'mort' },
    // Engin : au repos rien ne bouge (une seule image), et douze images suffisent
    // à des roues qui font un tour en 0,6 s.
    images: { marche: 12, repos: 1, attaque: 16, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: null,
  },
  // La Catapulte : le bras se tend pendant la fin de la recharge, part à
  // l'instant du tir (`lacher`), claque sur sa butée puis se réarme lentement.
  catapult: {
    src: 'assets/modeles/catapulte.json',
    taille: 55,
    clips: { marche: 'marche', repos: 'repos', attaque: 'tir', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 12, repos: 1, attaque: 16, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: null,
    lacher: 0.25,
  },
  // Le Champion : armure de plates, épée et bouclier — les animations du milicien.
  champion: {
    src: 'assets/modeles/champion.json',
    taille: 46,
    clips: { marche: 'marche_epee', repos: 'garde', attaque: 'attaque_epee', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 16, repos: 12, attaque: 12, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde',
  },
  // L'Éclaireur : cheval léger, lance couchée ; il va au galop.
  scout: {
    src: 'assets/modeles/eclaireur.json',
    taille: 49,
    clips: { marche: 'course', repos: 'repos', attaque: 'attaque_cavalier', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 16, repos: 12, attaque: 12, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: null,
  },
  // La Prêtresse : son bâton est un trident ; son « attaque » est le geste du soin
  // (les bras levés), joué à chaque soin rendu.
  priest: {
    src: 'assets/modeles/pretresse.json',
    taille: 40,
    clips: { marche: 'marche_trident', repos: 'garde_trident', attaque: 'celebrer', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 16, repos: 12, attaque: 14, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde_trident',
  },
  // Le lancier atlante : casque à cimier, cuirasse d'écailles, la lance au poing.
  spearman: {
    src: 'assets/modeles/lancier.json',
    taille: 43,
    clips: { marche: 'marche_lance', repos: 'garde_lance', attaque: 'attaque_lance', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 16, repos: 12, attaque: 12, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde_lance',
  },
  militia: {
    src: 'assets/modeles/milicien.json',
    taille: 42,
    clips: { marche: 'marche_epee', repos: 'garde', attaque: 'attaque_epee', touche: 'coup_recu', mort: 'mort' },
    images: { marche: 16, repos: 12, attaque: 12, touche: 5, mort: 13 },
    boucles: ['marche', 'repos'],
    parDistance: ['marche'],
    accessoires: 'garde',
  },
};

// Les Solariens : mêmes animations et mêmes réglages que le modèle atlante du
// même rôle — seul le fichier change (ajouter `taille` ou `lacher` ici s'ils
// diffèrent). N'inscrire une ligne qu'une fois le fichier livré ET listé dans
// sw.js : sprites.js (IMAGES_CIV) ignore un modèle absent de cette table.
MODELES.solVillager = { ...MODELES.villager, src: 'assets/modeles/sol-fellah.json' };
MODELES.solMilitia = { ...MODELES.militia, src: 'assets/modeles/sol-garde.json' };
MODELES.solSpearman = { ...MODELES.spearman, src: 'assets/modeles/sol-lancier.json' };
MODELES.solArcher = { ...MODELES.archer, src: 'assets/modeles/sol-archer.json' };

export const DENSITE = 2;   // px d'atlas par px monde (le style « net » de l'Atelier)
/**
 * Vrai si ces atlas viennent d'une cuisson allégée (chute à demi-finesse, ou
 * tout à un pixel par pixel monde) : en cuisson fine, une case fait exactement
 * DENSITE fois sa hauteur à l'écran.
 */
export const cuissonAllegee = (clips) => Object.values(clips).some((c) => c.cellH < c.hauteurMonde * DENSITE);
// Suréchantillonnage : le rendu se fait `sur` fois plus fin que l'atlas, puis il
// est réduit de moitié en moitié. `sur` se règle sur la finesse de la texture
// de chaque modèle (voir finesseTexture) : 2 ou 4. (À 8, la cuisson d'une unité
// prenait sept secondes pour un gain que l'œil ne voit pas à cette taille.)
const SUR_MAX = 4;
/**
 * Directions cuites : sud, sud-est, est, nord-est, nord. Les trois autres
 * (nord-ouest, ouest, sud-ouest) sont leur MIROIR, retourné au dessin — comme
 * dans Age of Empires. À quarante pixels, personne ne voit qu'un soldat tourné
 * vers l'ouest tient son épée de la main gauche ; en échange, les atlas pèsent
 * 37 % de moins en mémoire (c'est elle qui manque d'abord sur un téléphone) et
 * se cuisent d'autant plus vite.
 */
export const DIRECTIONS = 5;
/**
 * Animations gardées à demi-finesse QUAND LA MÉMOIRE MANQUE (cuisson de
 * secours) : la chute. Elle est la plus large de toutes (un corps étendu) et
 * pèse près d'un quart d'une troupe. En temps normal elle reste à pleine
 * finesse : le corps reste quatre à cinq secondes à terre, et il paraissait
 * flou à côté des troupes nettes.
 */
const REDUCTION = { mort: 2 };
const LINEAIRE = 1006;      // THREE.LinearFilter (absent du paquet réduit)

const LUMIERE = [-0.55, 0.75, 0.45];   // repère caméra : en haut à gauche, un peu de face
// Cadre de travail autour de l'ancre, en mètres : assez large pour un mort
// étendu de tout son long et une épée levée. Chaque atlas est ensuite recadré
// sur l'union de ses images.
// (2,7 m en haut : le bras de la catapulte en fin de course monte à 2,6 m ;
// 1,5 m en bas : le trident d'un Atlante qui tombe descend à 1,43 m.)
const CADRE = { gauche: 2.1, droite: 2.1, haut: 2.7, bas: 1.5 };
const MARGE = 2;            // px d'atlas autour de l'emprise (le contour y loge)
/**
 * Lumières (× π : l'éclairage physique de three.js) et étalonnage des couleurs.
 * Une texture peinte, éclairée puis réduite à quarante pixels sur de l'herbe,
 * sort terne : `gamma` (< 1) relève les tons sombres et moyens, `saturation`
 * ravive les couleurs — moins celles qui sont déjà vives (`retenue`), pour ne
 * pas les brûler —, `contraste` écarte autour du gris moyen. Réglés sur un banc
 * d'essai face aux dessins d'origine (lancier, champion, prêtresse) : même
 * luminosité et même saturation moyennes, à 0,02 près. La lumière reste
 * légère (0,95 à 1,2 fois la couleur peinte) : la texture porte déjà ses ombres.
 * `elevation` : la caméra, en degrés au-dessus de l'horizon. Les bâtiments sont
 * dessinés de plus haut (30°) ; à 22°, une troupe montre son visage et son
 * torse plutôt que le dessus de son casque — plus proche de son dessin.
 */
export const REGLAGE = { ambiante: 0.95, directe: 0.25, gamma: 0.88, saturation: 1.3, retenue: 0.6, contraste: 1.04, elevation: 22 };
/**
 * Les pixels de la couleur d'équipe portent cette opacité (au lieu de 255) :
 * la cuisson les reconnaît sur la couleur PEINTE, avant l'étalonnage, et
 * l'autre camp se teinte plus tard en ne touchant qu'eux (sprites.js).
 */
export const ALPHA_EQUIPE = 254;

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
const VERSION_CUISSON = 8;
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
 * l'illustration dessinée. `equipe` : `{ cle, dedans(r, g, b), saturer }`, la
 * règle qui reconnaît la couleur d'équipe (voir ALPHA_EQUIPE). `enCache`, sur
 * l'objet rendu, devient vrai quand ces atlas sont dans le cache : on peut
 * alors les décharger, ils en reviendront sans recuisson (sprites.js).
 */
export async function modeleCuit(cle, vitessePxS, equipe = null) {
  const m = MODELES[cle];
  const reponse = await fetch(m.src);
  if (!reponse.ok) throw new Error(`${m.src} : ${reponse.status}`);
  const octets = await reponse.arrayBuffer();
  const url = new URL(m.src, location.href);
  const reglage = Object.values(REGLAGE).join('_');
  url.searchParams.set('cuisson', `${VERSION_CUISSON}-${empreinte(octets)}-${m.taille}-${m.tourne || 0}-${vitessePxS}-${Object.values(m.images).join('.')}-${reglage}-${equipe ? equipe.cle : ''}`);
  const cleCache = url.href;
  try {
    const lu = await lireCache(cleCache);
    if (lu) { lu.enCache = true; return lu; }
  } catch { /* cache illisible : on recuit */ }
  // Un téléphone à court de mémoire graphique : trois essais, du plus beau au
  // plus léger, avant d'abandonner le modèle pour son illustration. Le
  // deuxième allège le rendu (suréchantillonnage de 2, texture lue par ses
  // niveaux réduits, sans anticrénelage) et garde la chute à demi-finesse ;
  // le troisième cuit à un pixel par pixel monde — le quart de la mémoire,
  // une troupe plus douce mais animée. Seul le premier est gardé en cache :
  // une cuisson allégée est plus floue, la prochaine partie retentera mieux.
  // `allege` (0, 1 ou 2) dit lequel a servi — le menu de pause le signale.
  const essais = [{}, { sur: 2, mip: true, anticrenelage: false, reduire: true }, { densite: 1, sur: 2, mip: true, anticrenelage: false }];
  const cuit = await aTourDeRole(async () => {
    let derniere = null;
    for (let i = 0; i < essais.length; i++) {
      try {
        const c = await cuireModele(cle, vitessePxS, octets, { ...essais[i], equipe });
        c.allege = i;
        return c;
      } catch (erreur) {
        derniere = erreur;
        console.warn(`Cuisson de ${cle} : ${erreur && erreur.message}${i < essais.length - 1 ? ' — nouvel essai, plus léger' : ''}`);
      }
    }
    throw derniere;
  });
  if (!cuit.allege) rangerCache(cleCache, m.src, cuit).then((range) => { cuit.enCache = !!range; }).catch(() => { /* stockage plein ou privé : tant pis */ });
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
  // Une cuisson allégée rangée par une ancienne version (elle l'était, sous la
  // même clé) : on la laisse là et l'on retente la cuisson fine.
  if (cuissonAllegee(meta.clips)) return null;
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
    // `variantes` (posé par sprites.js) porte un accesseur : le sérialiser
    // fabriquerait l'atlas de l'autre camp pour rien.
    const { canvas, variantes, ...infos } = c;
    meta.clips[etat] = infos;
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
    await cache.put(`${cle}&clip=${etat}`, new Response(blob, { headers: { 'Content-Type': 'image/png' } }));
  }
  await cache.put(cle, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  return true;
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
 * `sur` : suréchantillonnage du rendu (0 : choisi sur la finesse de la texture) ;
 * `mip` : lire la texture par ses niveaux réduits (cuisson de secours) ;
 * `anticrenelage` : celui de WebGL ; `densite` : pixels d'atlas par pixel
 * monde (DENSITE, ou 1 pour la cuisson de dernier secours) ; `reduire` :
 * garder à demi-finesse les animations de REDUCTION (cuisson de secours).
 *
 * LA TEXTURE NE SE LIT PAS PAR SES NIVEAUX RÉDUITS. La texture d'un modèle de
 * l'Atelier est un atlas en miettes — des centaines d'îlots serrés, la peau à
 * côté du bronze à côté du bleu. Un personnage de quatre-vingts pixels la lit
 * quatre à huit fois trop grande ; par ses niveaux réduits (mipmaps), chaque
 * pixel moyennait alors seize à soixante-quatre texels DE LA TEXTURE, voisins
 * d'îlots compris : toutes les couleurs tiraient vers le même brun terne. On
 * la lit donc à sa finesse d'origine, sur un rendu `sur` fois plus grand, et
 * c'est le RENDU qu'on moyenne — des points voisins sur le personnage, plus
 * sur la planche de texture.
 */
export async function cuireModele(cle, vitessePxS, octets, { sur = 0, mip = false, anticrenelage = true, equipe = null, densite = DENSITE, reduire = false } = {}) {
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
    // Cuisson fine : pas de niveaux réduits (voir plus haut). La cuisson de
    // secours (`mip`) les garde : au suréchantillonnage de 2, sans eux, la
    // texture fourmillerait.
    if (!mip) { t.generateMipmaps = false; t.minFilter = LINEAIRE; t.magFilter = LINEAIRE; }
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

  const e = (REGLAGE.elevation * Math.PI) / 180;
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
  // `tourne` (degrés) : un engin modélisé depuis une vue de trois quarts n'a pas
  // son avant sur l'axe du modèle — on le remet face à la caméra de la case 0.
  const tourne = ((m.tourne || 0) * Math.PI) / 180;
  const hauteurRepos = (() => {
    pivot.rotation.y = tourne;
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
  const pxParM = (m.taille * densite) / hauteurRepos;   // px d'atlas par mètre
  const travailL = Math.ceil((CADRE.gauche + CADRE.droite) * pxParM);
  const travailH = Math.ceil((CADRE.haut + CADRE.bas) * pxParM);
  const ancreX = CADRE.gauche * pxParM, ancreY = CADRE.haut * pxParM;

  // Finesse du rendu : celle de la texture, 4 si elle dépasse trois texels par pixel, 2 sinon.
  const texels = finesseTexture(modele, textures);
  if (!sur) sur = texels / pxParM > 2.8 ? SUR_MAX : 2;
  const camera = new THREE.OrthographicCamera(
    -CADRE.gauche, CADRE.droite, CADRE.haut, -CADRE.bas, 0.1, 50);
  camera.position.copy(versCamera).multiplyScalar(20);
  camera.up.copy(hautCamera);
  camera.lookAt(0, 0, 0);

  // Tout ce qui s'alloue ici est rendu dans le `finally`, que la cuisson
  // réussisse ou non : un essai raté ne doit pas laisser sa mémoire à l'essai
  // de secours qui le suit (Safari compte les toiles tant qu'elles ne sont
  // pas vidées).
  const clips = {};
  const moities = [];
  let toile = null, rendu = null, bande = null, reussi = false;
  try {
    toile = document.createElement('canvas');
    toile.width = travailL * sur; toile.height = travailH * sur;
    // (À quatre fois, la moyenne du rendu fait déjà l'anticrénelage.)
    rendu = new THREE.WebGLRenderer({ canvas: toile, alpha: true, antialias: anticrenelage && sur < 4, preserveDrawingBuffer: true });
    // Les toiles de la réduction : chaque passage de moitié moyenne quatre pixels, exactement.
    for (let f = sur / 2; f >= 2; f /= 2) {
      const c = document.createElement('canvas');
      c.width = travailL * f; c.height = travailH * f;
      const x = c.getContext('2d');
      moities.push({ c, x });
      if (!x) throw new Error('mémoire graphique saturée (toile de réduction refusée)');
    }
    const gl = rendu.getContext();
    rendu.setPixelRatio(1);
    rendu.setClearColor(0x000000, 0);
    rendu.outputColorSpace = THREE.SRGBColorSpace;
    rendu.toneMapping = THREE.NoToneMapping;
    // Une seule bande de travail pour toutes les animations.
    bande = document.createElement('canvas');
    bande.width = travailL * Math.max(...Object.values(m.images)); bande.height = travailH * DIRECTIONS;
    const bctx = bande.getContext('2d', { willReadFrequently: true });
    if (!bctx) throw new Error('mémoire graphique saturée (toile de travail refusée)');
    bctx.imageSmoothingQuality = 'high';
    for (const [etat, nom] of Object.entries(m.clips)) {
      const clip = clipDe(nom);
      const n = m.images[etat];
      const boucle = m.boucles.includes(etat);
      // Bande de travail : rangée = direction, colonne = image (recadrer range ensuite l'atlas autrement).
      bctx.clearRect(0, 0, bande.width, bande.height);
      for (let k = 0; k < DIRECTIONS; k++) {
        pivot.rotation.y = (k * Math.PI) / 4 + tourne;
        for (let i = 0; i < n; i++) {
          const t = boucle ? (i / n) * clip.duration : (i / Math.max(1, n - 1)) * clip.duration;
          poser(clip, t, etat);
          rendu.render(scene, camera);
          if (gl.isContextLost()) throw new Error('mémoire graphique saturée (contexte WebGL perdu)');
          let source = toile;
          for (const { c, x } of moities) {
            x.clearRect(0, 0, c.width, c.height);
            x.drawImage(source, 0, 0, c.width, c.height);
            source = c;
          }
          bctx.drawImage(source, i * travailL, k * travailH, travailL, travailH);
        }
        await pause();   // rendre la main : le menu reste fluide pendant la cuisson
      }
      clips[etat] = recadrer(bande, n, travailL, travailH, ancreX, ancreY, equipe,
        densite < DENSITE || !reduire ? 1 : (REDUCTION[etat] || 1), densite);
      clips[etat].duree = clip.duration;
      clips[etat].boucle = boucle;
      if (etat === 'attaque' && m.lacher != null) clips[etat].lacher = m.lacher;
      // Une animation qui suit le sol couvre, en un tour, la distance parcourue
      // pendant sa durée à la vitesse de l'unité : les pieds ne patinent pas.
      if (m.parDistance.includes(etat)) clips[etat].cycle = Math.max(8, Math.round((vitessePxS || 32) * clip.duration));
    }
    reussi = true;
  } finally {
    melangeur.stopAllAction();
    if (rendu) { rendu.dispose(); rendu.forceContextLoss(); }
    if (bande) bande.width = bande.height = 0;
    if (toile) toile.width = toile.height = 0;
    for (const { c } of moities) c.width = c.height = 0;
    // Les textures sont dans la carte graphique (ou ne serviront plus) : leurs toiles aussi.
    for (const t of textures) { t.dispose(); if (t.image) t.image.width = t.image.height = 0; }
    // Cuisson ratée en route : les atlas déjà produits ne serviront pas.
    if (!reussi) for (const c of Object.values(clips)) if (c.canvas) c.canvas.width = c.canvas.height = 0;
  }
  return { cycle: clips.marche.cycle, clips };
}

/**
 * Finesse de la texture sur le modèle, en texels par mètre : la racine du
 * rapport entre la surface des triangles sur la planche de texture et leur
 * surface réelle. C'est elle qui dit combien de fois plus fin que l'atlas il
 * faut rendre pour lire la texture sans la réduire.
 */
function finesseTexture(modele, textures) {
  let surfaceTexels = 0, surfaceMetres = 0;
  modele.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.map || !o.geometry.attributes.uv) return;
    const image = o.material.map.image;
    const pos = o.geometry.attributes.position, uv = o.geometry.attributes.uv, index = o.geometry.index;
    const e = o.matrixWorld.elements;
    const echelle = Math.cbrt(Math.abs(
      e[0] * (e[5] * e[10] - e[6] * e[9]) - e[4] * (e[1] * e[10] - e[2] * e[9]) + e[8] * (e[1] * e[6] - e[2] * e[5])));
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
      const ux = uv.getX(b) - uv.getX(a), uy = uv.getY(b) - uv.getY(a), vx = uv.getX(c) - uv.getX(a), vy = uv.getY(c) - uv.getY(a);
      surfaceTexels += Math.abs(ux * vy - uy * vx) / 2 * image.width * image.height;
      const x1 = pos.getX(b) - pos.getX(a), y1 = pos.getY(b) - pos.getY(a), z1 = pos.getZ(b) - pos.getZ(a);
      const x2 = pos.getX(c) - pos.getX(a), y2 = pos.getY(c) - pos.getY(a), z2 = pos.getZ(c) - pos.getZ(a);
      surfaceMetres += Math.hypot(y1 * z2 - z1 * y2, z1 * x2 - x1 * z2, x1 * y2 - y1 * x2) / 2 * echelle * echelle;
    }
  });
  return surfaceMetres > 0 ? Math.sqrt(surfaceTexels / surfaceMetres) : 0;
}

/**
 * Recadre une bande de travail et range l'atlas : une COLONNE par direction,
 * une rangée par image. La hauteur de case est commune (l'union de toutes les
 * images), mais chaque direction a sa largeur et sa propre ancre, mesurées sur
 * elle seule : un corps étendu de profil ne réserve plus sa longueur aux vues
 * de face et de dos, ni une place vide de l'autre côté de l'ancre — un tiers
 * de mémoire en moins pour une chute, un cheval ou un engin. `colonnes[k]` =
 * `{ x, l, ancre }` : l'abscisse de la colonne dans l'atlas, sa largeur, et
 * la distance de son bord gauche à l'ancre (le point entre les pieds), en
 * pixels d'atlas entiers. Puis le contour et la netteté.
 */
function recadrer(bande, n, L, H, ancreX, ancreY, equipe, f = 1, densite = DENSITE) {
  const ctx = bande.getContext('2d', { willReadFrequently: true });
  const largeur = L * n;   // la partie de la bande que cette animation occupe
  const gauche = new Array(DIRECTIONS).fill(Infinity), droite = new Array(DIRECTIONS).fill(-Infinity);
  let haut = Infinity, bas = -Infinity;
  // Lue direction par direction : cinq fois moins de mémoire d'un coup.
  for (let k = 0; k < DIRECTIONS; k++) {
    const px = ctx.getImageData(0, k * H, largeur, H).data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < largeur; x++) {
        if (px[(y * largeur + x) * 4 + 3] < 110) continue;
        const cx = x % L;
        if (cx < gauche[k]) gauche[k] = cx;
        if (cx > droite[k]) droite[k] = cx;
        if (y < haut) haut = y;
        if (y > bas) bas = y;
      }
    }
  }
  if (!Number.isFinite(haut)) throw new Error('modèle invisible à la caméra');
  const ax = Math.round(ancreX), ay = Math.round(ancreY);
  // `f` : réduction de cet atlas (2 pour la chute en cuisson de secours). Tout
  // se mesure à pleine finesse, en multiples de f, puis chaque case est
  // réduite f fois — à 2, chaque pixel est la moyenne exacte de quatre.
  const m = MARGE * f;
  const y0 = haut - m;
  let pleineH = bas + 1 + m - y0;
  pleineH += (f - (pleineH % f)) % f;
  const cellH = pleineH / f;
  const colonnes = [], x0 = [];
  let X = 0;
  for (let k = 0; k < DIRECTIONS; k++) {
    // L'ancre est toujours dans la colonne (une direction vide aussi a la sienne).
    const g = f * Math.ceil((ax - Math.min(gauche[k], ax) + m) / f);       // à gauche de l'ancre
    const d = f * Math.ceil((Math.max(droite[k] + 1, ax) - ax + m) / f);   // à sa droite
    x0.push(ax - g);
    colonnes.push({ x: X, l: (g + d) / f, ancre: g / f });
    X += (g + d) / f;
  }
  const atlas = document.createElement('canvas');
  atlas.width = X; atlas.height = cellH * n;
  const actx = atlas.getContext('2d', { willReadFrequently: true });
  if (!actx) throw new Error('mémoire graphique saturée (atlas refusé)');
  for (let k = 0; k < DIRECTIONS; k++) {
    const c = colonnes[k];
    for (let i = 0; i < n; i++) {
      actx.drawImage(bande, i * L + x0[k], k * H + y0, c.l * f, pleineH, c.x, i * cellH, c.l, cellH);
    }
  }
  netteteEtContour(actx, atlas.width, atlas.height, equipe);
  // La toile de travail est faite pour être LUE (elle vit en mémoire centrale) ;
  // celle que le jeu dessine soixante fois par seconde doit être une toile
  // ordinaire, que le navigateur garde côté carte graphique.
  const finale = document.createElement('canvas');
  finale.width = atlas.width; finale.height = atlas.height;
  const fctx = finale.getContext('2d');
  if (!fctx) { atlas.width = atlas.height = 0; finale.width = finale.height = 0; throw new Error('mémoire graphique saturée (atlas refusé)'); }
  fctx.drawImage(atlas, 0, 0);
  atlas.width = atlas.height = 0;
  // `cellW` : la plus large des colonnes (pour mémoire : le dessin lit `colonnes`).
  return {
    canvas: finale, colonnes, cellW: Math.max(...colonnes.map((c) => c.l)), cellH,
    ancreY: (ay - y0) / f, hauteurMonde: pleineH / densite, images: n, directions: DIRECTIONS,
  };
}

/**
 * Le traitement des sprites de l'Atelier : bords francs (un sprite réduit à
 * quarante pixels s'interpole mieux qu'un bord à demi transparent), couleurs
 * étalonnées (REGLAGE), couleur d'équipe marquée (ALPHA_EQUIPE), et un liseré
 * sombre qui détache le personnage de l'herbe.
 */
function netteteEtContour(ctx, l, h, equipe) {
  const img = ctx.getImageData(0, 0, l, h);
  const p = img.data;
  const plein = new Uint8Array(l * h);
  const { gamma, saturation, retenue, contraste } = REGLAGE;
  const courbe = new Float32Array(256);
  for (let v = 0; v < 256; v++) courbe[v] = Math.pow(v / 255, gamma) * 255;
  for (let i = 0; i < l * h; i++) {
    const o = i * 4;
    if (p[o + 3] < 110) { p[o + 3] = 0; continue; }
    plein[i] = 1;
    const deLEquipe = equipe ? equipe.dedans(p[o], p[o + 1], p[o + 2]) : false;
    p[o + 3] = deLEquipe ? ALPHA_EQUIPE : 255;
    const r = courbe[p[o]], g = courbe[p[o + 1]], b = courbe[p[o + 2]];
    const gris = 0.299 * r + 0.587 * g + 0.114 * b;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let k = 1 + (saturation - 1) * (1 - (max > 0 ? (max - min) / max : 0) * retenue);
    // Une couleur d'équipe terne (l'écharpe marine du villageois) se ravive
    // pour les deux camps, pas seulement pour celui qu'on reteinte.
    if (deLEquipe && equipe.saturer) k *= equipe.saturer;
    // Jamais au-delà de ce que les canaux peuvent porter : la teinte ne dérive pas.
    if (max > gris) k = Math.min(k, (255 - gris) / (max - gris));
    if (min < gris) k = Math.min(k, gris / (gris - min));
    p[o] = Math.max(0, Math.min(255, (gris + (r - gris) * k - 128) * contraste + 128));
    p[o + 1] = Math.max(0, Math.min(255, (gris + (g - gris) * k - 128) * contraste + 128));
    p[o + 2] = Math.max(0, Math.min(255, (gris + (b - gris) * k - 128) * contraste + 128));
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const i = y * l + x;
      if (plein[i]) continue;
      let r = 0, g = 0, b = 0, n = 0, equipe = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= l || yy >= h || !plein[yy * l + xx]) continue;
        const o = (yy * l + xx) * 4;
        r += p[o]; g += p[o + 1]; b += p[o + 2]; n++;
        if (p[o + 3] === ALPHA_EQUIPE) equipe++;
      }
      if (!n) continue;
      const o = i * 4;
      // Le liseré d'une cape bleue est bleu sombre : il change de camp avec elle.
      p[o] = (r / n) * 0.4; p[o + 1] = (g / n) * 0.4; p[o + 2] = (b / n) * 0.4;
      p[o + 3] = equipe * 2 >= n ? ALPHA_EQUIPE : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
