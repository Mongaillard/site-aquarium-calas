# Rend un personnage glTF riggé en images, sous l'angle du jeu, pour un atlas.
# Usage : python rendu_atlas.py -- modele.glb dossier_sortie config.json
import bpy, sys, math, json, os
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
glb, sortie, cfg_path = args[0], args[1], args[2]
cfg = json.load(open(cfg_path))
os.makedirs(sortie, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene
garder = set(cfg['garder']) if cfg.get('garder') else None
for o in scene.objects:
    if o.type == 'MESH' and garder is not None and o.name not in garder:
        o.hide_render = True
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
if rig.animation_data is None:
    rig.animation_data_create()
for t in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(t)
# Le glTF importe en quaternions : l'angle d'Euler serait ignoré.
rig.rotation_mode = 'XYZ'
rot0 = rig.rotation_euler.copy()

def action(nom):
    for a in bpy.data.actions:
        if a.name in (nom, nom + '_Rig') or a.name.split('|')[-1] == nom:
            return a
    raise SystemExit('action introuvable : ' + nom + ' — ' + ', '.join(sorted(a.name for a in bpy.data.actions)))

# Caméra orthographique, vue de trois quarts depuis le sud (le personnage
# tourné vers le sud fait face au joueur, comme la case 0 des atlas).
elev = math.radians(cfg.get('elevation', 35))
cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = cfg['ortho']
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
cible = Vector((0, 0, cfg.get('cibleZ', 0.9)))
dirv = Vector((0, -math.cos(elev), math.sin(elev)))
cam.location = cible + dirv * 20
cam.rotation_euler = (dirv * -1).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam

# Lumière : soleil au nord-ouest, en hauteur ; le ciel éclaire les ombres.
sun_data = bpy.data.lights.new('soleil', 'SUN')
sun_data.energy = cfg.get('soleil', 3.2)
sun_data.angle = math.radians(12)
sun = bpy.data.objects.new('soleil', sun_data)
scene.collection.objects.link(sun)
vers_soleil = Vector((-0.55, 0.45, 1.0)).normalized()
sun.rotation_euler = (vers_soleil * -1).to_track_quat('-Z', 'Y').to_euler()
world = bpy.data.worlds.new('ciel')
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.78, 0.82, 0.9, 1)
bg.inputs[1].default_value = cfg.get('ciel', 0.9)
scene.world = world

r = scene.render
r.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = cfg.get('samples', 24)
scene.cycles.use_denoising = True
scene.cycles.pixel_filter_width = 1.0
r.film_transparent = True
r.resolution_x = r.resolution_y = cfg['cellule']
r.resolution_percentage = 100
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'

fps = scene.render.fps
# Foulée : excursion avant-arrière d'un pied par rapport au bassin pendant la
# marche. Le sol parcouru par cycle en découle (le pied posé recule à la
# vitesse du corps pendant ~60 % du cycle) : la marche ne patine pas.
foulee = None
if cfg.get('marche'):
    act = action(cfg['marche'])
    rig.animation_data.action = act
    f0, f1 = act.frame_range
    ys = []
    for f in range(int(f0), int(f1) + 1):
        scene.frame_set(f)
        pied = rig.matrix_world @ rig.pose.bones['foot.l'].head
        bassin = rig.matrix_world @ rig.pose.bones['hips'].head
        ys.append(pied.y - bassin.y)
    foulee = max(ys) - min(ys)
    print('FOULEE', foulee, 'images', f0, f1)
for a in cfg['animations']:
    print('ACTION', a['action'], tuple(action(a['action']).frame_range))
for anim in cfg['animations']:
    act = action(anim['action'])
    rig.animation_data.action = act
    f0, f1 = act.frame_range
    n = anim['images']
    boucle = anim.get('boucle', True)
    for k in cfg.get('directions', range(8)):
        rig.rotation_euler = rot0.copy()
        rig.rotation_euler.z = rot0.z + k * math.pi / 4
        for i in range(n):
            t = f0 + (f1 - f0) * (i / n if boucle else i / max(1, n - 1))
            scene.frame_set(int(math.floor(t)), subframe=t - math.floor(t))
            r.filepath = os.path.join(sortie, f"{anim['nom']}_{k}_{i:02d}.png")
            bpy.ops.render.render(write_still=True)
# Où tombent les pieds (l'origine) dans l'image : l'ancre de l'atlas.
from bpy_extras.object_utils import world_to_camera_view
p = world_to_camera_view(scene, cam, Vector((0, 0, 0)))
json.dump({'ancreX': p.x * cfg['cellule'], 'ancreY': (1 - p.y) * cfg['cellule'], 'foulee': foulee, 'ortho': cfg['ortho']},
          open(os.path.join(sortie, 'ancre.json'), 'w'))
print('ANCRE', p.x * cfg['cellule'], (1 - p.y) * cfg['cellule'])
