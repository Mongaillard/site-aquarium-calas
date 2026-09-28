# Garde les pièces et les animations utiles d'un glTF riggé, et le réexporte.
# Usage : python alleger.py -- entree.glb sortie.glb config.json
import bpy, sys, json
args = sys.argv[sys.argv.index('--') + 1:]
entree, sortie, cfg = args[0], args[1], json.load(open(args[2]))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entree)
garder = set(cfg['garder'])
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH' and o.name not in garder:
        bpy.data.objects.remove(o, do_unlink=True)
utiles = {a['action'] for a in cfg['animations']}
for a in list(bpy.data.actions):
    nom = a.name[:-4] if a.name.endswith('_Rig') else a.name
    if nom not in utiles:
        bpy.data.actions.remove(a)
    else:
        a.name = nom            # le nom d'origine, sans le suffixe de l'import
        a.use_fake_user = True
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
if rig.animation_data:
    for t in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(t)
    rig.animation_data.action = None
bpy.ops.export_scene.gltf(filepath=sortie, export_format='GLB', export_animation_mode='ACTIONS',
                          export_force_sampling=True, export_optimize_animation_size=True,
                          export_image_format='AUTO', export_yup=True)
print('ACTIONS', sorted(a.name for a in bpy.data.actions))
