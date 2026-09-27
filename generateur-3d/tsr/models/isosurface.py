from typing import Optional, Tuple

import torch
import torch.nn as nn
from skimage.measure import marching_cubes

# Modifié pour Atelier 3D : torchmcubes (extension C++/CUDA à compiler) est
# remplacé par le marching cubes de scikit-image, disponible en paquet précompilé
# sur Windows, macOS et Linux pour toutes les versions récentes de Python.


class IsosurfaceHelper(nn.Module):
    points_range: Tuple[float, float] = (0, 1)

    @property
    def grid_vertices(self) -> torch.FloatTensor:
        raise NotImplementedError


class MarchingCubeHelper(IsosurfaceHelper):
    def __init__(self, resolution: int) -> None:
        super().__init__()
        self.resolution = resolution
        self._grid_vertices: Optional[torch.FloatTensor] = None

    @property
    def grid_vertices(self) -> torch.FloatTensor:
        if self._grid_vertices is None:
            # keep the vertices on CPU so that we can support very large resolution
            x, y, z = (
                torch.linspace(*self.points_range, self.resolution),
                torch.linspace(*self.points_range, self.resolution),
                torch.linspace(*self.points_range, self.resolution),
            )
            x, y, z = torch.meshgrid(x, y, z, indexing="ij")
            verts = torch.cat(
                [x.reshape(-1, 1), y.reshape(-1, 1), z.reshape(-1, 1)], dim=-1
            ).reshape(-1, 3)
            self._grid_vertices = verts
        return self._grid_vertices

    def forward(
        self,
        level: torch.FloatTensor,
    ) -> Tuple[torch.FloatTensor, torch.LongTensor]:
        level = -level.view(self.resolution, self.resolution, self.resolution)
        volume = level.detach().cpu().numpy().astype("float32")
        # scikit-image renvoie les sommets dans l'ordre (x, y, z) de la grille ;
        # « ascent » oriente les faces vers l'extérieur de l'objet.
        v, f, _, _ = marching_cubes(volume, 0.0, gradient_direction="ascent")
        v_pos = torch.from_numpy(v.astype("float32"))
        t_pos_idx = torch.from_numpy(f.astype("int64"))
        v_pos = v_pos / (self.resolution - 1.0)
        return v_pos.to(level.device), t_pos_idx.to(level.device)
