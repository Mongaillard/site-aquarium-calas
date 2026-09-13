/**
 * Sur mobile, un doigt qui tire vers le bas en haut d'une liste (ou sur une
 * zone qui ne défile pas) remonte au navigateur ou à l'application hôte, qui
 * recharge la page (« tirer pour rafraîchir ») : la partie en cours disparaît.
 * On laisse défiler ce qui peut l'être et on retient le geste dès qu'il
 * sortirait de la page. Le CSS (`overscroll-behavior`) fait la même chose
 * là où il est compris ; ceci couvre le reste.
 */

/** Ce qu'il faut savoir d'un élément pour décider si un geste en sort. */
export interface Defilement {
  readonly scrollTop: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
}

function defilable(el: Element): boolean {
  const y = getComputedStyle(el).overflowY;
  return (y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight + 1;
}

/** Le premier ancêtre (lui compris) qui peut défiler verticalement, ou null. */
export function ancetreDefilable(depart: Element | null): Element | null {
  for (let el = depart; el !== null && el !== document.documentElement; el = el.parentElement)
    if (defilable(el)) return el;
  return null;
}

/**
 * Vrai si un déplacement vertical `dy` (positif : le doigt descend, la page
 * remonterait) sortirait de l'élément — ou s'il n'y a rien à faire défiler.
 */
export function sortDuDefilement(el: Defilement | null, dy: number): boolean {
  if (el === null) return true;
  if (dy > 0) return el.scrollTop <= 0;
  if (dy < 0) return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  return false;
}

/** Installe la garde sur le document. */
export function retenirLeTirer(cible: Document): void {
  let departX = 0;
  let departY = 0;
  let ancetre: Element | null = null;
  cible.addEventListener(
    "touchstart",
    (ev) => {
      const t = ev.touches[0];
      if (ev.touches.length !== 1 || t === undefined) return;
      departX = t.clientX;
      departY = t.clientY;
      ancetre = ancetreDefilable(ev.target instanceof Element ? ev.target : null);
    },
    { passive: true },
  );
  cible.addEventListener(
    "touchmove",
    (ev) => {
      const t = ev.touches[0];
      if (ev.touches.length !== 1 || t === undefined || ev.defaultPrevented || !ev.cancelable)
        return;
      const dx = t.clientX - departX;
      const dy = t.clientY - departY;
      // Un geste surtout horizontal (onglets, tableaux) reste libre.
      if (Math.abs(dx) > Math.abs(dy)) return;
      if (sortDuDefilement(ancetre, dy)) ev.preventDefault();
    },
    { passive: false },
  );
}
