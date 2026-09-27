"""Rasterisation de triangles en NumPy (sans OpenGL)."""
import numpy as np


def rasterize(tri_xy, height, width, tri_z=None, max_batch=4_000_000):
    """Rasterise des triangles 2D dans une grille de pixels.

    tri_xy : (F, 3, 2) coordonnées en pixels (x vers la droite, y vers le bas,
             le centre du pixel (i, j) est en (j + 0.5, i + 0.5)).
    tri_z  : (F, 3) profondeur optionnelle ; si fournie, le triangle le plus
             proche (z le plus petit) gagne pour chaque pixel.
    Renvoie (tri_id (H, W) int64, -1 si vide ; bary (H, W, 3) float32).
    """
    tri_xy = np.asarray(tri_xy, dtype=np.float64)
    n = tri_xy.shape[0]
    x0 = np.ceil(tri_xy[..., 0].min(1) - 0.5).astype(np.int64)
    x1 = np.floor(tri_xy[..., 0].max(1) - 0.5).astype(np.int64)
    y0 = np.ceil(tri_xy[..., 1].min(1) - 0.5).astype(np.int64)
    y1 = np.floor(tri_xy[..., 1].max(1) - 0.5).astype(np.int64)
    x0 = np.clip(x0, 0, width - 1)
    y0 = np.clip(y0, 0, height - 1)
    x1 = np.clip(x1, -1, width - 1)
    y1 = np.clip(y1, -1, height - 1)
    w = x1 - x0 + 1
    h = y1 - y0 + 1
    a = tri_xy[:, 0]
    b = tri_xy[:, 1]
    c = tri_xy[:, 2]
    area = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
    valid = (w > 0) & (h > 0) & (np.abs(area) > 1e-12)
    size = np.maximum(w, h)

    pix_all, tri_all, bary_all, z_all = [], [], [], []
    k = 1
    while True:
        sel = np.nonzero(valid & (size <= k) & (size > k // 2))[0] if k > 1 else np.nonzero(valid & (size <= 1))[0]
        if sel.size:
            per = max(1, max_batch // (k * k))
            for s in range(0, sel.size, per):
                idx = sel[s:s + per]
                gx = x0[idx, None, None] + np.arange(k)[None, None, :]
                gy = y0[idx, None, None] + np.arange(k)[None, :, None]
                px = gx + 0.5
                py = gy + 0.5
                ax, ay = a[idx, 0, None, None], a[idx, 1, None, None]
                bx, by = b[idx, 0, None, None], b[idx, 1, None, None]
                cx, cy = c[idx, 0, None, None], c[idx, 1, None, None]
                ar = area[idx, None, None]
                wa = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / ar
                wb = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / ar
                wc = 1.0 - wa - wb
                eps = -1e-7
                inside = (wa >= eps) & (wb >= eps) & (wc >= eps)
                inside &= (gx <= x1[idx, None, None]) & (gy <= y1[idx, None, None])
                ti, yy, xx = np.nonzero(inside)
                if ti.size == 0:
                    continue
                gxs = gx[ti, 0, xx]
                gys = gy[ti, yy, 0]
                pix_all.append(gys * width + gxs)
                tri_all.append(idx[ti])
                bary = np.stack([wa[ti, yy, xx], wb[ti, yy, xx], wc[ti, yy, xx]], -1)
                bary_all.append(bary.astype(np.float32))
                if tri_z is not None:
                    z = (bary * tri_z[idx[ti]]).sum(-1)
                    z_all.append(z)
        if k >= size[valid].max(initial=1):
            break
        k *= 2

    tri_id = np.full(height * width, -1, dtype=np.int64)
    bary_img = np.zeros((height * width, 3), dtype=np.float32)
    if not pix_all:
        return tri_id.reshape(height, width), bary_img.reshape(height, width, 3)
    pix = np.concatenate(pix_all)
    tri = np.concatenate(tri_all)
    bary = np.concatenate(bary_all)
    if tri_z is not None:
        z = np.concatenate(z_all)
        order = np.lexsort((z, pix))
    else:
        order = np.argsort(pix, kind="stable")
    pix, tri, bary = pix[order], tri[order], bary[order]
    first = np.ones(pix.size, dtype=bool)
    first[1:] = pix[1:] != pix[:-1]
    tri_id[pix[first]] = tri[first]
    bary_img[pix[first]] = bary[first]
    return tri_id.reshape(height, width), bary_img.reshape(height, width, 3)
