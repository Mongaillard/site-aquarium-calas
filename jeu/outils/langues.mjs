#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Les langues du jeu : ce qui est à traduire, et ce qui manque à chaque
// dictionnaire.
//
//     npm run langues              → l'état de chaque langue
//     npm run langues -- en        → la liste de ce qui manque à l'anglais
//     node outils/langues.mjs verifier <langue> <cahier> <fichier.js…> [--tables module.js:fonction…]
//                                  → vérifie un cahier (js/langues/<langue>/<cahier>.js) contre les
//                                    fichiers qu'il couvre : rien ne manque, rien en trop, pas de trou
//                                    inventé, les mêmes balises. `--tables` ajoute les textes d'une
//                                    table : `fonction(visite)` appelle `visite(objet, champ)`.
//
// Le français est la source (js/langue.js). Ce qui est à traduire se trouve à
// trois endroits :
//   1. les textes passés à `txt` dans le code — txt`… ${x} …` et txt('…') ;
//   2. les textes que la page porte en dur — les éléments marqués `data-txt`
//      et les attributs nommés par `data-txt-attr` dans index.html ;
//   3. les noms et les descriptions des tables de js/config.js.
// Les mots accordés (`accord(n, 'Couronne', 'Couronnes')`, ou `pluriel(…)`)
// sont recensés sous la clé « Couronne|Couronnes ».
//
// Aucune dépendance : Node seul.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

/** Le texte d'un morceau de source, tel que le moteur le lira (\n,  , \'…). */
function cuire(morceau, guillemet) {
  try { return Function(`return ${guillemet}${morceau}${guillemet};`)(); } catch { return morceau; }
}

/** Avance jusqu'à la fin d'une chaîne ouverte en `i` (sur son guillemet) ; rend l'indice après le guillemet fermant. */
function finDeChaine(source, i) {
  const guillemet = source[i];
  for (let j = i + 1; j < source.length; j++) {
    if (source[j] === '\\') j++;
    else if (source[j] === guillemet) return j + 1;
    else if (guillemet !== '`' && source[j] === '\n') return j;
    else if (guillemet === '`' && source[j] === '$' && source[j + 1] === '{') j = finDExpression(source, j + 2) - 1;
  }
  return source.length;
}

/** Avance jusqu'à l'accolade qui ferme une expression `${…}` ouverte avant `i` ; rend l'indice après elle. */
function finDExpression(source, i) {
  let profondeur = 1;
  for (let j = i; j < source.length; j++) {
    const c = source[j];
    if (c === '\'' || c === '"' || c === '`') j = finDeChaine(source, j) - 1;
    else if (c === '{') profondeur++;
    else if (c === '}' && --profondeur === 0) return j + 1;
  }
  return source.length;
}

/**
 * Les clés des `txt` et des `accord` d'un fichier source. `pluriel(n, 'mot',
 * 'mots')` (l'aide des écrans de progression, qui passe par `accord`) se
 * recense comme un accord.
 */
export function clesDuCode(source) {
  const cles = [];
  const appel = /(?<![\w.$])(txt|accord|pluriel)\s*(`|\()/g;
  for (let m = appel.exec(source); m; m = appel.exec(source)) {
    let i = m.index + m[0].length - 1;
    if (m[1] === 'txt' && source[i] === '`') {
      // Un gabarit : ses morceaux fixes, ses trous numérotés.
      const morceaux = [''];
      for (let j = i + 1; j < source.length; j++) {
        if (source[j] === '\\') { morceaux[morceaux.length - 1] += source[j] + source[j + 1]; j++; }
        else if (source[j] === '`') break;
        else if (source[j] === '$' && source[j + 1] === '{') { j = finDExpression(source, j + 2) - 1; morceaux.push(''); }
        else morceaux[morceaux.length - 1] += source[j];
      }
      const cuits = morceaux.map((x) => cuire(x, '`'));
      cles.push(cuits.reduce((cle, x, k) => (k ? `${cle}{${k - 1}}${x}` : x), ''));
      continue;
    }
    if (source[i] !== '(') continue;
    // Un appel : txt('…') ; accord(n, 'un', 'plusieurs').
    const litteral = (depuis) => {
      let j = depuis;
      while (/\s/.test(source[j])) j++;
      if (source[j] !== '\'' && source[j] !== '"') return null;
      const fin = finDeChaine(source, j);
      return { texte: cuire(source.slice(j + 1, fin - 1), source[j]), fin };
    };
    if (m[1] === 'txt') {
      const a = litteral(i + 1);
      if (a && /^\s*\)/.test(source.slice(a.fin))) cles.push(a.texte);
    } else {
      // (Le premier argument est le nombre : on saute jusqu'à la virgule de même niveau.)
      let j = i + 1, niveau = 0;
      for (; j < source.length; j++) {
        const c = source[j];
        if (c === '\'' || c === '"' || c === '`') j = finDeChaine(source, j) - 1;
        else if (c === '(' || c === '[' || c === '{') niveau++;
        else if (c === ')' || c === ']' || c === '}') { if (niveau-- === 0) break; }
        else if (c === ',' && niveau === 0) break;
      }
      if (source[j] !== ',') continue;
      const un = litteral(j + 1);
      if (!un) continue;
      let k = un.fin;
      while (/\s/.test(source[k])) k++;
      const plusieurs = source[k] === ',' ? litteral(k + 1) : null;
      cles.push(`${un.texte}|${plusieurs ? plusieurs.texte : `${un.texte}s`}`);
    }
  }
  return cles;
}

/** Les clés que la page porte en dur. */
export function clesDeLaPage(html) {
  const ramassee = (t) => t.replace(/\s+/g, ' ').trim();
  const cles = [];
  for (const m of html.matchAll(/<(\w+)\b[^>]*\sdata-txt(?=[\s>])[^>]*>([\s\S]*?)<\/\1>/g)) cles.push(ramassee(m[2]));
  for (const m of html.matchAll(/<\w+\b[^>]*\sdata-txt-attr="([^"]*)"[^>]*>/g)) {
    for (const attribut of m[1].split(/\s+/).filter(Boolean)) {
      const valeur = new RegExp(`\\s${attribut}="([^"]*)"`).exec(m[0]);
      if (valeur) cles.push(ramassee(valeur[1]));
    }
  }
  return cles.filter(Boolean);
}

/** Tout ce qui est à traduire : `Map(clé → [où])`. */
export async function recenser() {
  const cles = new Map();
  const noter = (cle, ou) => { if (!cles.has(cle)) cles.set(cle, []); if (!cles.get(cle).includes(ou)) cles.get(cle).push(ou); };
  for (const nom of fs.readdirSync(path.join(RACINE, 'js')).filter((f) => f.endsWith('.js') && f !== 'langue.js').sort()) {
    for (const cle of clesDuCode(lire(`js/${nom}`))) noter(cle, `js/${nom}`);
  }
  for (const cle of clesDeLaPage(lire('index.html'))) noter(cle, 'index.html');
  const { textesDesTables, accordsDesTables } = await import('../js/config.js');
  textesDesTables((objet, champ) => noter(objet[champ], 'js/config.js (tables)'));
  for (const cle of accordsDesTables()) noter(cle, 'js/config.js (noms qui se comptent)');
  return cles;
}

/** L'état d'une langue : ce qui est traduit, ce qui manque, ce qui ne sert plus. */
export async function etatDe(langue, cles = null) {
  const source = cles || await recenser();
  const dictionnaire = (await import(`../js/langues/${langue}.js`)).default;
  const manquantes = [...source.keys()].filter((cle) => !Object.prototype.hasOwnProperty.call(dictionnaire, cle));
  const orphelines = Object.keys(dictionnaire).filter((cle) => !source.has(cle));
  return { total: source.size, traduites: source.size - manquantes.length, manquantes, orphelines, source };
}

/** Les défauts d'une traduction face à sa clé : vide, trou inventé, balises différentes, accord sans « other ». */
export function defautsDe(cle, valeur) {
  const balises = (t) => [...String(t).matchAll(/<\/?[a-z]+/g)].map((x) => x[0]).sort().join(',');
  if (cle.includes('|') && valeur && typeof valeur === 'object') return typeof valeur.other === 'string' ? [] : ['accord sans forme « other »'];
  if (typeof valeur !== 'string' || !valeur.trim()) return ['traduction vide'];
  const defauts = [];
  if ([...valeur.matchAll(/\{(\d+)\}/g)].some((x) => !cle.includes(`{${x[1]}}`))) defauts.push('trou qui n’existe pas dans la phrase française');
  if (balises(valeur) !== balises(cle)) defauts.push('balises différentes de la phrase française');
  return defauts;
}

/** Vérifie un cahier contre les fichiers qu'il couvre. Rend `{ cles, manquantes, enTrop, fautives }`. */
export async function verifierCahier(langue, cahier, fichiers, tables = []) {
  const cles = new Set();
  for (const f of fichiers) for (const cle of clesDuCode(lire(f))) cles.add(cle);
  for (const t of tables) {
    const [module, fonction] = t.split(':');
    const m = await import(path.join(RACINE, module));
    m[fonction]((objet, champ) => cles.add(objet[champ]));
  }
  const dictionnaire = (await import(path.join(RACINE, 'js', 'langues', langue, `${cahier}.js`))).default;
  const a = (cle) => Object.prototype.hasOwnProperty.call(dictionnaire, cle);
  return {
    cles: cles.size,
    manquantes: [...cles].filter((cle) => !a(cle)),
    enTrop: Object.keys(dictionnaire).filter((cle) => !cles.has(cle)),
    fautives: Object.entries(dictionnaire).map(([cle, v]) => [cle, defautsDe(cle, v)]).filter(([, d]) => d.length),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'verifier') {
  const [langue, cahier, ...reste] = process.argv.slice(3);
  const tables = reste.filter((x, i) => reste[i - 1] === '--tables' || (reste.indexOf('--tables') >= 0 && i > reste.indexOf('--tables')));
  const fichiers = reste.slice(0, reste.indexOf('--tables') >= 0 ? reste.indexOf('--tables') : reste.length);
  const r = await verifierCahier(langue, cahier, fichiers, tables);
  console.log(`Cahier « ${cahier} » (${langue}) : ${r.cles} textes dans ${fichiers.length} fichier(s)${tables.length ? ` et ${tables.length} table(s)` : ''}.`);
  for (const cle of r.manquantes) console.log(`  manque   ${JSON.stringify(cle)}`);
  for (const cle of r.enTrop) console.log(`  en trop  ${JSON.stringify(cle)}`);
  for (const [cle, d] of r.fautives) console.log(`  fautive  ${JSON.stringify(cle)} : ${d.join(' ; ')}`);
  const defauts = r.manquantes.length + r.enTrop.length + r.fautives.length;
  console.log(defauts ? `${defauts} défaut(s).` : 'Rien ne manque, rien en trop, rien de fautif.');
  process.exit(defauts ? 1 : 0);
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { LANGUES } = await import('../js/langue.js');
  const cles = await recenser();
  const detail = process.argv[2];
  console.log(`${cles.size} textes à traduire (le français est la source).`);
  for (const langue of LANGUES.filter((l) => l.id !== 'fr')) {
    const e = await etatDe(langue.id, cles);
    console.log(`  ${langue.nom} : ${e.traduites} sur ${e.total}${langue.prete ? '' : ' (pas encore proposée d’office)'}${e.orphelines.length ? ` · ${e.orphelines.length} traduction(s) qui ne servent plus` : ''}`);
    if (detail === langue.id) {
      for (const cle of e.manquantes) console.log(`    manque  ${JSON.stringify(cle)}   ← ${cles.get(cle).join(', ')}`);
      for (const cle of e.orphelines) console.log(`    en trop ${JSON.stringify(cle)}`);
    }
  }
}
