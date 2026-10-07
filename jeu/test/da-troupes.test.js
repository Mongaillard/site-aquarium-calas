// Direction artistique, lot « des troupes posées dans le monde » (octobre 2026) :
// la cuisson à l'encre, les retouches de couleur par modèle (panache du
// milicien, peau des Solariens, bois des engins, Hydre), le cochon assombri,
// l'ombre portée et l'anneau de camp. Rien de tout cela ne se voit sous Node ;
// on en vérifie les fonctions pures, le dessin sur une fausse toile, et que la
// simulation n'a pas bougé d'un pas (mêmes parties sur les mêmes graines).
// Lancement : node test/da-troupes.test.js

import { readFileSync } from 'node:fs';
import { World } from '../js/game.js';
import { serializeWorld, restoreWorld } from '../js/save.js';
import { PLAYER_COLORS, TICKS_PER_SECOND, UNIT_TYPES } from '../js/config.js';
import { MODELES, REGLAGE, reglageDe, retoucher } from '../js/modele3d.js';
import { etalonnerPixels, regleEquipeDe } from '../js/sprites.js';
import { Renderer } from '../js/render.js';

const DT = 1 / TICKS_PER_SECOND;
let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');

/** Teinte (degrés), saturation et luminosité d'une couleur — le calcul de sprites.js. */
function tsl(r, g, b) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return { t: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const R = r / 255, G = g / 255, B = b / 255;
  let h;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return { t: h * 360, s, l };
}
/** Une couleur passée par les retouches d'un modèle. */
function retouchee(couleur, regles) {
  const p = new Uint8ClampedArray([...couleur, 255]);
  retoucher(p, regles);
  return [p[0], p[1], p[2]];
}
const dit = (c) => `(${c.join(', ')})`;

console.log('=== Direction artistique : les troupes posées dans le monde ===\n');

// ---------------------------------------------------------------------------
// La cuisson : la même encre que les bâtiments.
// ---------------------------------------------------------------------------
console.log('--- Réglages de cuisson ---');
{
  const eclairee = REGLAGE.ambiante + REGLAGE.directe;
  check('la lumière directe creuse le volume : une face éclairée au moins une fois et demie plus claire que la face à l’ombre',
    eclairee / REGLAGE.ambiante >= 1.5 && REGLAGE.directe >= 0.5, `${(eclairee / REGLAGE.ambiante).toFixed(2)} fois`);
  check('des noirs : contraste au-dessus de 1,1, liseré sombre (un quart de la couleur au plus), netteté ajoutée',
    REGLAGE.contraste > 1.1 && REGLAGE.contour > 0 && REGLAGE.contour <= 0.25 && REGLAGE.nettete > 0, JSON.stringify(REGLAGE));
  check('les couleurs restent vives : la saturation n’est jamais baissée pour tous', REGLAGE.saturation >= 1.1);
  check('un modèle sans réglage propre prend ceux de tous, tels quels', reglageDe(MODELES.villager) === REGLAGE && reglageDe(MODELES.solKnight) === REGLAGE);
  const hydre = reglageDe(MODELES.hydra);
  check('l’Hydre n’est pas ravivée comme les autres ; le reste de ses réglages est commun',
    hydre.saturation === 1 && hydre.saturation < REGLAGE.saturation && hydre.contour === REGLAGE.contour && hydre.directe === REGLAGE.directe);
  check('les troupes sombres (cavalier, éclaireur, lancier) ont leurs tons sombres relevés — pas leurs homologues solariens, plus clairs',
    ['knight', 'scout', 'spearman'].every((c) => reglageDe(MODELES[c]).gamma < REGLAGE.gamma)
    && ['solKnight', 'solScout', 'solSpearman'].every((c) => reglageDe(MODELES[c]).gamma === REGLAGE.gamma));
  check('bélier et catapulte des deux peuples : saturation retenue',
    ['ram', 'catapult', 'solRam', 'solCatapult'].every((c) => reglageDe(MODELES[c]).saturation < REGLAGE.saturation));
  const version = Number((lire('js/modele3d.js').match(/const VERSION_CUISSON = (\d+);/) || [])[1]);
  check('la version de la cuisson a monté : les anciens atlas ne resservent pas', version >= 9, `version ${version}`);
}

// La clé de cache : un réglage ou une retouche propre à un modèle la change.
{
  globalThis.location = { href: 'http://jeu.test/index.html', search: '' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => new TextEncoder().encode('modele '.repeat(40)).buffer });
  const cles = [];
  globalThis.caches = {
    open: async () => ({
      match: async (cle) => { cles.push(String(cle)); return { json: async () => ({ cycle: 40, clips: {} }) }; },
      put: async () => {}, keys: async () => [], delete: async () => true,
    }),
  };
  const { modeleCuit } = await import('../js/modele3d.js?cles');
  const cle = async (modele) => { cles.length = 0; await modeleCuit(modele, 32, null); return decodeURIComponent(new URL(cles[0]).searchParams.get('cuisson')); };
  const villageois = await cle('villager'), hydre = await cle('hydra'), belier = await cle('ram'), cedre = await cle('solRam'), milicien = await cle('militia'), garde = await cle('solMilitia');
  const version = (lire('js/modele3d.js').match(/const VERSION_CUISSON = (\d+);/) || [])[1];
  check('la clé de cache porte la version et les réglages du modèle', villageois.startsWith(`${version}-`) && villageois.includes(Object.values(REGLAGE).join('_')), villageois);
  check('un réglage propre change la clé (l’Hydre)', !hydre.includes(Object.values(REGLAGE).join('_')) && hydre.includes(Object.values(reglageDe(MODELES.hydra)).join('_')));
  check('une retouche de couleur entre dans la clé', /-r[0-9a-f]+-/.test(belier) && /-r[0-9a-f]+-/.test(milicien) && !/-r[0-9a-f]+-/.test(villageois));
  const signe = (c) => (c.match(/-r([0-9a-f]+)-/) || [])[1];
  check('deux retouches différentes, deux clés (bois brun et cèdre, panache et peau)', signe(belier) !== signe(cedre) && signe(milicien) !== signe(garde));
  delete globalThis.fetch; delete globalThis.caches; delete globalThis.localStorage; delete globalThis.location;
}

// La règle d'équipe est appelée pour chaque pixel de chaque atlas : elle a été
// récrite sans tableau fabriqué à chaque appel. Elle doit marquer exactement
// les mêmes couleurs que l'ancienne (le calcul de versHSL, tel qu'il était).
{
  const ancienne = (a, b, satMin) => (r, g, bl) => {
    const max = Math.max(r, g, bl) / 255, min = Math.min(r, g, bl) / 255;
    const lum = (max + min) / 2;
    let teinte = 0, sat = 0;
    if (max !== min) {
      const d = max - min;
      sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
      const R = r / 255, G = g / 255, B = bl / 255;
      if (max === R) teinte = ((G - B) / d + (G < B ? 6 : 0)) / 6;
      else if (max === G) teinte = ((B - R) / d + 2) / 6;
      else teinte = ((R - G) / d + 4) / 6;
    }
    if (!(sat > satMin && lum < 1 && teinte * 360 >= a && teinte * 360 <= b)) return false;
    const haut = Math.max(r, g, bl);
    return !(lum > 0.6 && (haut - Math.min(r, g, bl)) / haut < 0.3);
  };
  let ecarts = 0, essais = 0, marquees = 0;
  for (const type of ['villager', 'militia', 'triton', 'archer', 'hydra', 'knight']) {
    const regle = regleEquipeDe(type);
    const [a, b, satMin] = regle.cle.split('_').map(Number);
    const reference = ancienne(a, b, satMin);
    for (let r = 0; r < 256; r += 5) for (let g = 0; g < 256; g += 5) for (let bl = 0; bl < 256; bl += 3) {
      essais++;
      const dedans = regle.dedans(r, g, bl);
      if (dedans) marquees++;
      if (dedans !== reference(r, g, bl)) ecarts++;
    }
  }
  check('la règle d’équipe récrite marque exactement les mêmes couleurs que l’ancienne', ecarts === 0 && marquees > 1000, `${essais} couleurs, ${marquees} marquées, ${ecarts} écart(s)`);
}

// ---------------------------------------------------------------------------
// Les retouches de la couleur peinte.
// ---------------------------------------------------------------------------
console.log('\n--- Le panache du milicien entre dans la couleur d’équipe ---');
{
  const equipe = regleEquipeDe('militia');
  const rouge = [164, 12, 8], apres = retouchee(rouge, MODELES.militia.retouches);
  const avant = tsl(...rouge), c = tsl(...apres);
  check('tel que peint, le panache rouge n’est pas de la couleur d’équipe : il restait rouge chez le joueur bleu', !equipe.dedans(...rouge));
  check('retouché, il est bleu roi, de même luminosité', Math.abs(c.t - 216) < 2 && Math.abs(c.l - avant.l) < 0.02 && apres[2] > apres[0] * 4, dit(apres));
  check('… et la règle d’équipe le reconnaît : bleu chez le joueur, rouge chez l’adversaire', equipe.dedans(...apres));
  const cuir = [102, 57, 36], acier = [168, 172, 180], or = [231, 168, 39], tabard = [14, 66, 150];
  check('le cuir brun, l’acier, l’or et le tabard bleu du milicien ne bougent pas',
    [cuir, acier, or, tabard].every((k) => dit(retouchee(k, MODELES.militia.retouches)) === dit(k)));
  check('un rouge terne (une ombre brun-rouge) n’est pas pris pour le panache', dit(retouchee([70, 50, 48], MODELES.militia.retouches)) === dit([70, 50, 48]));
  check('le Garde solarien n’hérite pas de cette retouche (ni aucun modèle solarien d’une retouche atlante)',
    !MODELES.solMilitia.retouches.some((r) => r.vers !== undefined) && MODELES.solRam.retouches !== MODELES.ram.retouches
    && MODELES.solCatapult.retouches !== MODELES.catapult.retouches);
  check('les autres troupes atlantes à pied ne sont pas retouchées', ['villager', 'spearman', 'archer', 'champion', 'priest', 'knight'].every((k) => !MODELES[k].retouches));
}

console.log('\n--- La peau des Solariens se détache de l’or ---');
{
  const regles = MODELES.solVillager.retouches;
  const peau = [202, 122, 67], or = [245, 193, 86], orSombre = [199, 136, 50], lin = [240, 236, 228], bleu = [38, 73, 167];
  const a = tsl(...peau), b = tsl(...retouchee(peau, regles));
  check('la peau (teinte 14 à 30°) est un peu moins saturée et plus sombre, de même teinte',
    b.s < a.s * 0.9 && b.s > a.s * 0.75 && b.l < a.l * 0.93 && b.l > a.l * 0.85 && Math.abs(b.t - a.t) < 1.5, `${dit(peau)} → ${dit(retouchee(peau, regles))}`);
  check('l’or des bijoux (teinte 40°) ne bouge pas, ni le lin, ni le bleu', [or, lin, bleu].every((k) => dit(retouchee(k, regles)) === dit(k)));
  const c = tsl(...orSombre), d = tsl(...retouchee(orSombre, regles));
  check('entre les deux (teinte 35°), l’effet s’éteint sans couture : à peine touché', d.l <= c.l && d.l > c.l * 0.97 && d.s > c.s * 0.95, dit(retouchee(orSombre, regles)));
  check('fellah, garde, lancier, archer, élite et prêtre solariens partagent cette retouche',
    ['solVillager', 'solMilitia', 'solSpearman', 'solArcher', 'solChampion', 'solPriest'].every((k) => MODELES[k].retouches === regles));
  check('un gris n’a pas de teinte : jamais retouché', dit(retouchee([120, 120, 120], regles)) === dit([120, 120, 120]));
  const p = new Uint8ClampedArray([202, 122, 67, 37]);
  retoucher(p, regles);
  check('l’opacité d’un texel n’est jamais touchée', p[3] === 37 && p[0] < 202);
}

console.log('\n--- Bélier et catapulte : de l’or vers le bois ---');
{
  const orange = [204, 125, 31], orVif = [252, 197, 81], bois = [88, 49, 17], tuile = [5, 72, 170];
  const brun = retouchee(orange, MODELES.ram.retouches), a = tsl(...orange), b = tsl(...brun);
  check('engins atlantes : l’or orangé est assombri, moins saturé, tiré vers le brun', b.l < a.l * 0.85 && b.s < a.s * 0.85 && b.t < a.t, `${dit(orange)} → ${dit(brun)}`);
  check('… leur or le plus vif ne dépasse plus six dixièmes de saturation', tsl(...retouchee(orVif, MODELES.catapult.retouches)).s <= 0.61);
  const boisApres = tsl(...retouchee(bois, MODELES.ram.retouches));
  check('… le bois sombre reste du bois sombre (un peu moins vif, à peine assombri), les tuiles bleues du toit ne bougent pas',
    boisApres.l > tsl(...bois).l * 0.85 && boisApres.l <= tsl(...bois).l && boisApres.s < tsl(...bois).s
    && dit(retouchee(tuile, MODELES.ram.retouches)) === dit(tuile), `${dit(bois)} → ${dit(retouchee(bois, MODELES.ram.retouches))}`);
  const blond = [194, 151, 96], cedre = retouchee(blond, MODELES.solRam.retouches), e = tsl(...blond), f = tsl(...cedre);
  check('engins solariens : le bois blond (la couleur des murs) devient un cèdre, un tiers plus sombre et plus coloré',
    f.l < e.l * 0.72 && f.l > e.l * 0.6 && f.s > e.s && f.s <= 0.56, `${dit(blond)} → ${dit(cedre)}`);
  check('… et leurs ferrures d’or vif ne virent pas à l’orange pur', tsl(...retouchee(orVif, MODELES.solCatapult.retouches)).s <= 0.56);
}

console.log('\n--- L’Hydre : un cran de moins, et plus de bloc rouge en face ---');
{
  const equipe = regleEquipeDe('hydra');
  const turquoise = [5, 147, 175], criniere = [1, 59, 167], or = [220, 159, 24];
  const corps = retouchee(turquoise, MODELES.hydra.retouches), a = tsl(...turquoise), b = tsl(...corps);
  check('son turquoise est moins saturé, de même teinte', b.s < a.s * 0.8 && Math.abs(b.t - a.t) < 1.5, `${dit(turquoise)} → ${dit(corps)}`);
  check('le corps turquoise ne change plus de camp : l’Hydre adverse n’est plus un bloc rouge', !equipe.dedans(...turquoise) && !equipe.dedans(...corps));
  const crin = retouchee(criniere, MODELES.hydra.retouches);
  check('crinières et nageoires bleu franc, elles, changent de camp (avant et après retouche)', equipe.dedans(...criniere) && equipe.dedans(...crin), dit(crin));
  check('l’or de ses colliers ne bouge pas', dit(retouchee(or, MODELES.hydra.retouches)) === dit(or));
  check('l’homme-poisson suit la même règle : peau turquoise fixe, crête au camp',
    !regleEquipeDe('triton').dedans(...turquoise) && regleEquipeDe('triton').dedans(...criniere));
}

// ---------------------------------------------------------------------------
// Le cochon.
// ---------------------------------------------------------------------------
console.log('\n--- Le cochon : assombri, moins rose, un peu plus petit ---');
{
  const source = lire('js/sprites.js');
  const fiche = source.slice(source.indexOf('  pig: {'), source.indexOf('  spearman: {', source.indexOf('  pig: {')));
  const hauteur = Number((fiche.match(/hauteurMonde: ([\d.]+)/) || [])[1]);
  const e = Object.fromEntries([...(fiche.match(/etalonnage: \{([^}]+)\}/) || ['', ''])[1].matchAll(/(\w+): ([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  check('dessiné à 0,85 fois sa taille (31,5 px monde)', Math.abs(hauteur - 31.5 * 0.85) < 0.1, `${hauteur} px`);
  check('étalonné au chargement : rouge × 0,82, vert × 0,74, bleu × 0,70', e.r === 0.82 && e.v === 0.74 && e.b === 0.7, JSON.stringify(e));
  const p = new Uint8ClampedArray([215, 125, 104, 255, 215, 125, 104, 0, 60, 30, 28, 255]);
  etalonnerPixels(p, e);
  const avant = tsl(215, 125, 104), apres = tsl(p[0], p[1], p[2]);
  check('le rose du cochon devient un brun-rosé plus sombre', apres.l < avant.l - 0.06 && p[0] < 215 && p[2] / p[0] < 104 / 215, `(215, 125, 104) → (${p[0]}, ${p[1]}, ${p[2]})`);
  check('un pixel transparent n’est pas touché, le trait sombre le reste', p[4] === 215 && p[7] === 0 && p[8] < 60 && p[11] === 255);
  check('ses règles n’ont pas bougé : ni son rayon, ni sa vitesse, ni sa viande',
    UNIT_TYPES.pig.radius === 8 && UNIT_TYPES.pig.speed === 0.6 && UNIT_TYPES.pig.hp === 9 && UNIT_TYPES.pig.food === 100 && UNIT_TYPES.pig.capturable === true);
}

// ---------------------------------------------------------------------------
// L'ombre portée et l'anneau de camp, dessinés sur une fausse toile.
// ---------------------------------------------------------------------------
console.log('\n--- Ombre portée et anneau de camp ---');
{
  const w = new World({ seed: 9, mapSize: 'small', difficulty: 'normal' });
  w.ais = [];
  const traces = [], arrets = [];
  const toile = new Proxy({ globalAlpha: 1 }, {
    get: (etat, nom) => (nom in etat ? etat[nom]
      : (...args) => { traces.push({ nom, args, trait: etat.strokeStyle, fond: etat.fillStyle, opacite: etat.globalAlpha, epaisseur: etat.lineWidth }); }),
    set: (etat, nom, valeur) => { etat[nom] = valeur; return true; },
  });
  let toiles = 0;
  globalThis.document = {
    createElement: () => {
      toiles++;
      return {
        getContext: () => new Proxy({}, {
          get: (etat, nom) => (nom === 'createRadialGradient' ? () => ({ addColorStop: (ou, couleur) => arrets.push([ou, couleur]) })
            : nom in etat ? etat[nom] : () => {}),
          set: (etat, nom, valeur) => { etat[nom] = valeur; return true; },
        }),
      };
    },
  };
  const rendu = Object.create(Renderer.prototype);
  Object.assign(rendu, { world: w, ctx: toile });
  const EST = 0, SUD = Math.PI / 2;
  const poser = (joueur, type, cap) => {
    const u = type === 'pig' || type === 'deer' ? w.spawnAnimal(type, 600, 600, joueur) : w.spawnUnit(joueur, type, 600, 600);
    u.x = 600; u.y = 600; u.facing = cap;
    return u;
  };
  const soldat = poser(0, 'militia', SUD), adverse = poser(1, 'spearman', SUD);
  const cavalierProfil = poser(0, 'knight', EST), cavalierFace = poser(0, 'knight', SUD);
  const belier = poser(0, 'ram', EST), hydre = poser(0, 'hydra', EST);
  const cerf = poser(-1, 'deer', EST), cochonSauvage = poser(-1, 'pig', EST), cochonPris = poser(0, 'pig', EST);

  // L'empreinte au sol.
  const e = (u) => rendu.empreinte(u);
  check('l’empreinte d’un fantassin : son rayon, à peu près', e(soldat) >= soldat.radius && e(soldat) <= soldat.radius * 1.15, `${e(soldat).toFixed(1)} px`);
  check('un cheval de profil a une empreinte plus large que de face, et qu’un homme', e(cavalierProfil) > e(cavalierFace) * 1.3 && e(cavalierFace) > e(soldat));
  check('engins et Hydre : plus larges encore (cavalerie < bélier < Hydre)', e(belier) > e(cavalierProfil) && e(hydre) > e(belier) && e(hydre) >= hydre.radius * 1.8,
    `${e(cavalierProfil).toFixed(1)} < ${e(belier).toFixed(1)} < ${e(hydre).toFixed(1)} px`);
  cavalierFace._vue3d = { x: 0.9, y: 0.1, k: 2, t: 0 };
  check('l’empreinte suit le cap AFFICHÉ (lissé) quand la troupe en a un, pas celui de la simulation', Math.abs(e(cavalierFace) - e(cavalierProfil)) < 0.2);
  cavalierFace._vue3d = undefined;

  // L'ombre.
  const ombre = (u) => { traces.length = 0; rendu.dessinerOmbre(u); return traces.filter((t) => t.nom === 'drawImage'); };
  const o = ombre(soldat);
  const sol = soldat.y + soldat.radius * 0.45;
  check('chaque troupe a son ombre : une image, étirée', o.length === 1 && o[0].args.length === 5);
  const [, ox, oy, ol, oh] = o[0] ? o[0].args : [0, 0, 0, 0, 0];
  check('décalée en bas à droite, du côté de l’ombre des bâtiments', ox + ol / 2 > soldat.x + 1 && oy + oh / 2 > sol + 0.5,
    `centre (${(ox + ol / 2 - soldat.x).toFixed(1)}, ${(oy + oh / 2 - sol).toFixed(1)}) px du pied`);
  check('à la taille de l’empreinte, et aplatie comme le sol', ol > e(soldat) * 2 && ol < e(soldat) * 3 && oh < ol * 0.55 && oh > ol * 0.35);
  check('elle reste au sol : sous les pieds, pas sous le corps', oy < sol && oy + oh > sol);
  const largeur = (u) => { const t = ombre(u)[0]; return t ? t.args[3] : 0; };
  check('plus large pour la cavalerie, les engins et l’Hydre', largeur(cavalierProfil) > ol * 1.5 && largeur(belier) > largeur(cavalierProfil) && largeur(hydre) > largeur(belier));
  check('les animaux sauvages ont la leur aussi', ombre(cerf).length === 1 && ombre(cochonSauvage).length === 1);
  check('l’image de l’ombre n’est fabriquée qu’une fois, pas à chaque troupe', toiles === 1, `${toiles} toile(s)`);
  const alpha = (c) => Number((String(c).match(/,\s*([\d.]+)\)$/) || [0, NaN])[1]);
  check('bien visible au cœur (0,38 au moins), fondue au bord (0)', arrets.length >= 2 && alpha(arrets[0][1]) >= 0.38 && alpha(arrets[0][1]) <= 0.5
    && arrets[arrets.length - 1][0] === 1 && alpha(arrets[arrets.length - 1][1]) === 0, arrets.map((a) => a.join(' : ')).join(' ; '));

  // L'anneau.
  const anneau = (u) => { traces.length = 0; rendu.dessinerSocle(u, u.x, u.y); return traces.slice(); };
  const t = anneau(soldat);
  const ellipse = t.find((c) => c.nom === 'ellipse'), fond = t.filter((c) => c.nom === 'fill'), traits = t.filter((c) => c.nom === 'stroke');
  check('la marque de camp est une ellipse posée sur l’empreinte, aux pieds',
    !!ellipse && Math.abs(ellipse.args[0] - soldat.x) < 1e-9 && Math.abs(ellipse.args[1] - (sol - 1)) < 1e-9 && Math.abs(ellipse.args[2] - e(soldat)) < 1e-9 && ellipse.args[3] < ellipse.args[2] * 0.55);
  check('à peine remplie (15 à 20 %) : l’ombre se voit dedans', fond.length === 1 && fond[0].fond === PLAYER_COLORS[0].main && fond[0].opacite >= 0.15 && fond[0].opacite <= 0.2,
    fond[0] ? `opacité ${fond[0].opacite}` : '');
  const dernier = traits[traits.length - 1];
  check('son trait est de la couleur franche du camp, d’environ 1,5 px monde, à pleine opacité',
    !!dernier && dernier.trait === PLAYER_COLORS[0].main && dernier.epaisseur >= 1.3 && dernier.epaisseur <= 1.8 && dernier.opacite === 1);
  check('la toile retrouve sa pleine opacité après l’anneau', toile.globalAlpha === 1);
  check('plus de pastille pâle : la couleur claire du camp ne sert plus au sol', !t.some((c) => c.trait === PLAYER_COLORS[0].light || c.fond === PLAYER_COLORS[0].light));
  const rougeTrace = anneau(adverse).filter((c) => c.nom === 'stroke').pop();
  check('l’adversaire a son anneau rouge', !!rougeTrace && rougeTrace.trait === PLAYER_COLORS[1].main);
  check('un animal sauvage n’a pas de camp : pas d’anneau ; un cochon capturé en a un', anneau(cerf).length === 0 && anneau(cochonSauvage).length === 0
    && anneau(cochonPris).some((c) => c.nom === 'stroke' && c.trait === PLAYER_COLORS[0].main));
  const grand = anneau(hydre).find((c) => c.nom === 'ellipse');
  check('l’anneau de l’Hydre est à la taille de son empreinte, pas de son rayon', !!grand && grand.args[2] >= hydre.radius * 1.8);
  delete globalThis.document;

  // Les couleurs de camp.
  const rvb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [br, bv, bb] = rvb(PLAYER_COLORS[0].main), [rr, rv, rb] = rvb(PLAYER_COLORS[1].main);
  check('le rouge de l’adversaire est franc, pas rose', rr >= 210 && rv <= 60 && rb <= 60 && tsl(rr, rv, rb).s > 0.75, PLAYER_COLORS[1].main);
  check('le bleu du joueur est franc', bb >= 210 && br <= 70 && tsl(br, bv, bb).s > 0.75, PLAYER_COLORS[0].main);

  // Le dessin : l'ombre passe avant le corps, pour toute une suite de troupes.
  const source = lire('js/render.js');
  const boucle = source.slice(source.indexOf('  drawEntities() {'), source.indexOf('  preparer3d(list) {'));
  check('dans l’ordre du peintre, les ombres d’une suite de troupes sont dessinées avant leurs corps',
    /for \(let j = i; j < list\.length && list\[j\]\.kind === 'unit'; j\+\+\) this\.dessinerOmbre\(list\[j\]\);\s*\}\s*this\.drawUnit\(e\);/.test(boucle));
  check('rien ne fabrique de dégradé à chaque troupe dessinée', !/createRadialGradient/.test(source.slice(source.indexOf('  dessinerOmbre(u) {'), source.indexOf('  dessinerModele3D(u, sprite, x, y, anim) {'))));
}

// ---------------------------------------------------------------------------
// Aucune règle n'a changé : mêmes parties sur les mêmes graines.
// ---------------------------------------------------------------------------
console.log('\n--- La simulation se déroule à l’identique ---');
{
  // L'empreinte de simulation.test.js : tout ce qu'un joueur peut distinguer.
  const empreinte = (world) => {
    const n = (v) => Math.round(v * 100) / 100;
    return [
      't' + n(world.time),
      'r' + world.players.map((p) => [p.age, n(p.resources.food), n(p.resources.wood), n(p.resources.gold), p.pop, p.popCap, [...p.techs].sort().join('+')].join('/')).join('|'),
      'g' + world.map.resources.size,
      'u' + world.units.filter((u) => !u.dead).map((u) => [u.id, u.type, n(u.x), n(u.y), n(u.hp), u.state, n(u.carry.amount)].join(',')).sort().join(';'),
      'b' + world.buildings.filter((b) => !b.dead).map((b) => [b.id, b.type, n(b.hp), b.complete ? 1 : 0, n(b.buildProgress), b.queue.length].join(',')).sort().join(';'),
    ].join('#');
  };
  const condense = (texte) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 0x01000193) >>> 0;
    return `${h.toString(16)}-${texte.length}`;
  };
  // Empreintes relevées sur le jeu d'AVANT ce lot (commit 08481a4), mêmes
  // graines, mêmes durées. Ce lot ne touche à aucune règle : elles ne doivent
  // pas bouger. (Si une règle change un jour à dessein, les relever de nouveau.)
  const parties = [
    [{ seed: 2026, mapSize: 'small', difficulty: 'normal', civs: ['atlante', 'solarien'] }, 11, '7f34bcce-2764'],
    [{ seed: 77, mapSize: 'medium', difficulty: 'hard', civs: ['solarien', 'atlante'] }, 9, '86e6c950-2986'],
  ];
  for (const [options, minutes, attendue] of parties) {
    const w = new World(options);
    for (let i = 0; i < minutes * 60 * TICKS_PER_SECOND; i++) w.update(DT);
    const obtenue = condense(empreinte(w));
    check(`graine ${options.seed} (${options.civs.join(' contre ')}), ${minutes} minutes : la partie est celle d’avant le lot`, obtenue === attendue,
      `${w.units.filter((u) => !u.dead).length} unités, ${w.buildings.filter((b) => !b.dead).length} bâtiments — ${obtenue}`);
    if (options.seed === 2026) {
      // Une sauvegarde se reprend : même état, et les couleurs de camp du jour.
      const repris = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
      check('une partie sauvegardée se reprend à l’identique, avec les couleurs de camp d’aujourd’hui',
        !!repris && empreinte(repris) === empreinte(w) && repris.players[0].color.main === PLAYER_COLORS[0].main && repris.players[1].color.main === PLAYER_COLORS[1].main);
    }
  }
}

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : '❌ ' + failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
