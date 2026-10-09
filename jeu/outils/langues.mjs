#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Les langues du jeu : ce qui est à traduire, et ce qui manque à chaque
// dictionnaire.
//
//     npm run langues              → l'état de chaque langue
//     npm run langues -- en        → la liste de ce qui manque à l'anglais
//
// Le français est la source (js/langue.js). Ce qui est à traduire se trouve à
// trois endroits :
//   1. les textes passés à `txt` dans le code — txt`… ${x} …` et txt('…') ;
//   2. les textes que la page porte en dur — les éléments marqués `data-txt`
//      et les attributs nommés par `data-txt-attr` dans index.html ;
//   3. les noms et les descriptions des tables de js/config.js.
// Les mots accordés (`accord(n, 'Couronne', 'Couronnes')`) sont recensés sous
// la clé « Couronne|Couronnes ».
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

/** Les clés des `txt` et des `accord` d'un fichier source. */
export function clesDuCode(source) {
  const cles = [];
  const appel = /(?<![\w.$])(txt|accord)\s*(`|\()/g;
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
  const { textesDesTables } = await import('../js/config.js');
  textesDesTables((objet, champ) => noter(objet[champ], 'js/config.js (tables)'));
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
