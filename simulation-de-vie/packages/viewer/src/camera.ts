/** Caméra 2D : écran = monde × échelle + décalage. Fonctions pures, testables. */

export interface Camera {
  readonly echelle: number; // pixels par tuile
  readonly dx: number;
  readonly dy: number;
}

export const ECHELLE_MIN = 3;
export const ECHELLE_MAX = 96;

/** Cadre le monde entier dans l'écran, avec une marge. */
export function ajuster(
  largeurMonde: number,
  hauteurMonde: number,
  largeurEcran: number,
  hauteurEcran: number,
): Camera {
  return cadrer(
    { x0: 0, y0: 0, x1: largeurMonde - 1, y1: hauteurMonde - 1 },
    largeurEcran,
    hauteurEcran,
  );
}

/** Cadre un rectangle de tuiles (bornes incluses) dans l'écran, sans zoomer au-delà de `echelleMax`. */
export function cadrer(
  zone: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
  largeurEcran: number,
  hauteurEcran: number,
  echelleMax = ECHELLE_MAX,
): Camera {
  const marge = 16;
  const largeur = zone.x1 - zone.x0 + 1;
  const hauteur = zone.y1 - zone.y0 + 1;
  const echelle = Math.max(
    ECHELLE_MIN,
    Math.min(
      echelleMax,
      (largeurEcran - 2 * marge) / largeur,
      (hauteurEcran - 2 * marge) / hauteur,
    ),
  );
  return {
    echelle,
    dx: (largeurEcran - largeur * echelle) / 2 - zone.x0 * echelle,
    dy: (hauteurEcran - hauteur * echelle) / 2 - zone.y0 * echelle,
  };
}

export function versEcran(cam: Camera, x: number, y: number): { x: number; y: number } {
  return { x: x * cam.echelle + cam.dx, y: y * cam.echelle + cam.dy };
}

export function versMonde(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - cam.dx) / cam.echelle, y: (sy - cam.dy) / cam.echelle };
}

/** Zoom d'un facteur autour du point écran (sx, sy), qui reste fixe. */
export function zoomer(cam: Camera, facteur: number, sx: number, sy: number): Camera {
  const echelle = Math.max(ECHELLE_MIN, Math.min(ECHELLE_MAX, cam.echelle * facteur));
  const f = echelle / cam.echelle;
  return { echelle, dx: sx - (sx - cam.dx) * f, dy: sy - (sy - cam.dy) * f };
}

export function deplacer(cam: Camera, ddx: number, ddy: number): Camera {
  return { echelle: cam.echelle, dx: cam.dx + ddx, dy: cam.dy + ddy };
}

/** Centre la caméra sur une tuile du monde. */
export function centrerSur(
  cam: Camera,
  x: number,
  y: number,
  largeurEcran: number,
  hauteurEcran: number,
): Camera {
  return {
    echelle: cam.echelle,
    dx: largeurEcran / 2 - (x + 0.5) * cam.echelle,
    dy: hauteurEcran / 2 - (y + 0.5) * cam.echelle,
  };
}
