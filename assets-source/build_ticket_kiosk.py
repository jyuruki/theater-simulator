"""Photo-referenced Mililani kiosk. Run with Blender 5.2 in background mode.

blender --background --python assets-source/build_ticket_kiosk.py -- \
    --output-dir public/models --blend assets-source/mililani-ticket-kiosk.blend \
    --preview /absolute/path/kiosk-preview.png

Geometry helpers use runtime coordinates: X width, Y up, Z front. Blender uses
X width, -Y front, Z up; glTF export restores the runtime coordinates.
"""

import argparse
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', default='public/models')
    parser.add_argument('--blend', default='assets-source/mililani-ticket-kiosk.blend')
    parser.add_argument('--preview')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def xyz(value):
    return Vector((value[0], -value[2], value[1]))


def material(name, color, metallic=0.0, roughness=0.5, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    mat.diffuse_color = (*color, 1)
    return mat


def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def cube(name, center, dimensions, mat, bevel=0, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(center))
    obj = bpy.context.object
    obj.dimensions = (dimensions[0], dimensions[2], dimensions[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft manufactured edge', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        bpy.ops.object.modifier_apply(modifier=mod.name)
        # Weighted normals keep broad sheet-metal faces visually flat.
        for poly in obj.data.polygons:
            poly.use_smooth = True
        mod = obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, mat)


def disc(name, center, radius, depth, mat, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                     end_fill_type='NGON', location=xyz(center),
                                     rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, name, mat)


def plane(name, center, width, height, mat):
    x, y, z = center
    vertices = [xyz((x-width/2, y-height/2, z)), xyz((x+width/2, y-height/2, z)),
                xyz((x+width/2, y+height/2, z)), xyz((x-width/2, y+height/2, z))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    uv = mesh.uv_layers.new(name='UVMap')
    for index, coord in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[index].uv = coord
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat)


def wave_slot(name, center, width, mat):
    x, y, z = center
    vertices = []
    faces = []
    for i in range(13):
        t = i / 12
        local_y = 0.0021 * math.sin(t * math.pi * 2)
        vertices.extend((xyz((x + (t-.5)*width, y+local_y-0.00125, z)),
                         xyz((x + (t-.5)*width, y+local_y+0.00125, z))))
    for i in range(12):
        faces.append((i*2, i*2+2, i*2+3, i*2+1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat)


def merge_by_material(objects):
    groups = {}
    for obj in objects:
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    result = []
    for mat_name, parts in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = mat_name.replace('Kiosk_', 'KioskBody_')
        # All geometry has usable UVs; the separate screen has explicit display UVs.
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
        bpy.ops.object.mode_set(mode='OBJECT')
        bpy.context.scene.cursor.location = (0, 0, 0)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        result.append(obj)
    return result


def count_triangles(objects):
    total = 0
    for obj in objects:
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def get_runtime_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    points = [(p.x, p.z, -p.y) for p in points]
    return {'min': [round(min(p[i] for p in points), 6) for i in range(3)],
            'max': [round(max(p[i] for p in points), 6) for i in range(3)]}


def verify_gltf_screen_uv(glb_path):
    data = glb_path.read_bytes()
    json_size = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20+json_size])
    binary_start = 20 + json_size + 8
    screen_mesh = next(mesh for mesh in gltf['meshes'] if mesh['name'] == 'KioskScreen')
    attributes = screen_mesh['primitives'][0]['attributes']

    def unpack_accessor(index, width):
        accessor = gltf['accessors'][index]
        view = gltf['bufferViews'][accessor['bufferView']]
        assert accessor['componentType'] == 5126
        offset = binary_start + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', width*4)
        return [struct.unpack_from('<'+'f'*width, data, offset+i*stride)
                for i in range(accessor['count'])]

    positions = unpack_accessor(attributes['POSITION'], 3)
    uvs = unpack_accessor(attributes['TEXCOORD_0'], 2)
    for point, uv in zip(positions, uvs):
        expected_u = (point[0] + 0.265) / 0.53
        expected_v = 1 - (point[1] - 0.735) / 0.8
        assert abs(uv[0]-expected_u) < 0.0001, (point, uv)
        assert abs(uv[1]-expected_v) < 0.0001, (point, uv)


def aim(obj, target):
    obj.rotation_euler = (xyz(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def preview_text(text, center, size, mat, align='CENTER'):
    bpy.ops.object.text_add(location=xyz(center), rotation=(math.pi/2, 0, 0))
    obj = bpy.context.object
    obj.name = 'PreviewOnly_' + text.replace('\n', '_')[:30]
    obj.data.body = text
    obj.data.align_x = align
    obj.data.align_y = 'CENTER'
    obj.data.size = size
    obj.data.space_character = 1.1
    obj.data.materials.append(mat)
    return obj


def main():
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    blend_path = Path(args.blend).resolve()
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    glb_path = output_dir / 'mililani-ticket-kiosk.glb'

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    bpy.context.preferences.filepaths.save_version = 0
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1

    steel = material('Kiosk_MatteSilver', (0.47, 0.49, 0.51), metallic=0.54, roughness=0.43)
    dark = material('Kiosk_CharcoalHousing', (0.018, 0.022, 0.027), metallic=0.1, roughness=0.28)
    recess = material('Kiosk_Recesses', (0.010, 0.012, 0.015), metallic=0.0, roughness=0.68)
    grille = material('Kiosk_GrilleSteel', (0.29, 0.32, 0.35), metallic=0.55, roughness=0.49)
    reader_glass = material('Kiosk_ReaderGlass', (0.065, 0.092, 0.10), metallic=0.05, roughness=0.2)
    display = material('Kiosk_DisplayPlaceholder', (0.025, 0.07, 0.095), roughness=0.32, emission=0.12)

    # Full footprint fits the existing collision box. Depth is a gameplay-fit
    # assumption; the supplied photograph primarily establishes front details.
    cube('Low black plinth', (0, 0.0325, 0), (0.696, 0.065, 0.884), recess, 0.008)
    cube('Lower silver cabinet', (0, 0.371, -0.008), (0.72, 0.612, 0.884), steel, 0.011)
    cube('Door recessed perimeter', (0, 0.362, 0.436), (0.632, 0.560, 0.007), recess, 0.003)
    cube('Access door', (0, 0.363, 0.445), (0.618, 0.548, 0.010), steel, 0.002)
    # The reference shows two modest round grille-like details high on the door.
    for x in (-0.206, 0.206):
        disc('Circular grille inset', (x, 0.598, 0.451), 0.036, 0.002, grille, vertices=32)
        # The close-up reference resolves five wavy horizontal slits per circle.
        for row in range(-2, 3):
            width = math.sqrt(0.030**2 - (row*0.0085)**2) * 2
            wave_slot('Wavy grille slit', (x, 0.598+row*0.0085, 0.4522), width, recess)
    cube('Narrow central slot', (0, 0.588, 0.451), (0.088, 0.004, 0.002), recess, 0.001, 2)

    # Portrait housing: softly bevelled corners, dark edge surround, clear front.
    cube('Tall portrait housing', (0, 1.135, 0.00), (0.72, 0.910, 0.90), dark, 0.024, 4)
    cube('Glass perimeter', (0, 1.135, 0.453), (0.564, 0.830, 0.012), recess, 0.009)
    # A small 10mm top cap takes total height to the 1.6m existing envelope.
    cube('Subtle top cap', (0, 1.591, -0.006), (0.678, 0.018, 0.840), dark, 0.006)
    cube('Right edge reader', (0.292, 0.918, 0.477), (0.066, 0.087, 0.080), dark, 0.009)
    cube('Reader inset', (0.292, 0.927, 0.519), (0.041, 0.045, 0.002), reader_glass, 0.003)
    cube('Vertical card entry', (0.300, 1.045, 0.452), (0.015, 0.104, 0.004), recess, 0.002)
    cube('Reader bottom trim', (0.292, 0.885, 0.516), (0.038, 0.006, 0.003), grille, 0.001)

    objects = [obj for obj in scene.objects if obj.type == 'MESH']
    body = merge_by_material(objects)
    screen = plane('KioskScreen', (0, 1.135, 0.461), 0.53, 0.80, display)
    assets = body + [screen]
    screen['purpose'] = 'Replace material with the game live touchscreen; UV origin bottom left.'
    screen['runtimeCenter'] = [0, 1.135, 0.461]
    for obj in assets:
        obj['asset'] = 'mililani-ticket-kiosk'
        obj['source'] = 'Original geometry based on user-provided IMG_7955.jpeg; no embedded photo.'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in assets:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = screen
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format='GLB',
                              use_selection=True, export_yup=True, export_materials='EXPORT',
                              export_texcoords=True, export_normals=True, export_extras=True,
                              export_cameras=False, export_lights=False, export_animations=False)
    verify_gltf_screen_uv(glb_path)

    before = {obj.name for obj in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    imported = [obj for obj in bpy.data.objects if obj.name not in before and obj.type == 'MESH']
    imported_screen = next(obj for obj in imported if obj.name.startswith('KioskScreen'))
    bounds = get_runtime_bounds(imported)
    triangles = count_triangles(imported)
    assert len(imported) == 6, f'Expected 5 shared-material body meshes + screen, got {len(imported)}'
    assert triangles < 10000, triangles
    assert abs(bounds['min'][1]) < 0.0001, bounds
    assert abs(bounds['max'][1] - 1.6) < 0.0001, bounds
    assert bounds['min'][0] >= -0.3601 and bounds['max'][0] <= 0.3601, bounds
    assert len(imported_screen.data.materials) == 1
    assert imported_screen.data.uv_layers.active is not None
    normal = imported_screen.data.polygons[0].normal
    assert normal.y < -0.99, normal
    manifest = {
        'asset': 'mililani-ticket-kiosk.glb', 'version': 1,
        'authoringTool': bpy.app.version_string, 'units': 'meters',
        'axes': {'up': '+Y', 'front': '+Z', 'width': 'X'},
        'origin': 'floor center', 'bounds': bounds,
        'triangleCount': triangles, 'meshCount': len(imported),
        'bodyMeshCount': 5, 'glbBytes': glb_path.stat().st_size,
        'screen': {'mesh': 'KioskScreen', 'center': [0, 1.135, 0.461],
                   'width': 0.53, 'height': 0.80, 'normal': [0, 0, 1],
                   'uvOrigin': 'top-left (glTF); set CanvasTexture.flipY=false in Three.js',
                   'material': 'Kiosk_DisplayPlaceholder'},
        'reference': 'User-provided IMG_7955.jpeg, cross-checked against Yelp close-up photo J17tqk4C7qSzSS-rXU0Yng.',
        'referenceUrl': 'https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=J17tqk4C7qSzSS-rXU0Yng',
        'sourceAssetLicense': 'Original project geometry; no third-party assets or textures.',
        'assumptions': ['Dimensions fitted to existing gameplay collider, not surveyed measurements.',
                        'The 0.90m main housing depth is inherited from the existing game footprint.',
                        'Rear and side geometry inferred where obscured in reference.'],
        'validation': {'exportReimportPassed': True, 'screenNormalsPassed': True,
                       'screenUvPassed': True, 'glTFScreenUvOrientationPassed': True,
                       'textureless': True}
    }
    (output_dir / 'mililani-ticket-kiosk.manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)

    # Keep the editable source focused on exported geometry. The preview stage
    # lives in its own collection and is not exported.
    stage = bpy.data.collections.new('Preview stage (not exported)')
    scene.collection.children.link(stage)
    layer = bpy.context.view_layer.layer_collection.children[stage.name]
    bpy.context.view_layer.active_layer_collection = layer
    warm_white = material('Preview_White', (0.85, 0.92, 0.94), emission=0.8)
    aqua = material('Preview_Aqua', (0.23, 0.65, 0.68), emission=0.5)
    navy = material('Preview_Navy', (0.027, 0.07, 0.09), roughness=0.5)
    amber = material('Preview_Amber', (0.65, 0.3, 0.09), emission=0.2)
    preview_text('MILILANI', (0, 1.433, 0.464), 0.052, warm_white)
    preview_text('CINEMA', (0, 1.38, 0.464), 0.023, aqua)
    plane('PreviewOnly_rule', (0, 1.328, 0.465), 0.36, 0.002, aqua)
    preview_text('MOVIES START HERE', (0, 1.269, 0.464), 0.025, warm_white)
    preview_text('Choose your next story', (0, 1.226, 0.464), 0.017, warm_white)
    for x, label, color in ((-0.122, 'MATINEE', aqua), (0.122, 'EVENING', amber)):
        plane('PreviewOnly_movieTile', (x, 1.060, 0.465), 0.213, 0.219, color)
        plane('PreviewOnly_movieArt', (x, 1.080, 0.466), 0.193, 0.154, navy)
        preview_text(label, (x, 0.978, 0.468), 0.017, warm_white)
    plane('PreviewOnly_button', (0, 0.864, 0.465), 0.37, 0.072, aqua)
    preview_text('SELECT A SHOW', (0, 0.864, 0.468), 0.025, navy)
    preview_text('Touch screen to begin', (0, 0.785, 0.464), 0.014, warm_white)
    floor = material('Preview_Floor', (0.145, 0.155, 0.16), roughness=0.81)
    cube('PreviewOnly_ground', (0, -0.04, 0), (200, 0.08, 200), floor)
    bpy.ops.object.camera_add(location=xyz((1.0, 1.95, 5.8)))
    camera = bpy.context.object
    camera.name = 'Preview camera'
    aim(camera, (0, 0.84, 0))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.20
    scene.camera = camera
    for name, location, energy, size, color in [
        ('Key softbox', (-3, 4.7, 3.0), 600, 3.5, (1.0, 0.88, 0.74)),
        ('Cool fill', (3, 2.6, 2.4), 450, 3.0, (0.70, 0.83, 1.0)),
        ('Edge softbox', (-0.7, 3.5, -3.0), 750, 2.4, (0.79, 0.88, 1.0)),
    ]:
        bpy.ops.object.light_add(type='AREA', location=xyz(location))
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = 'DISK'
        light.data.size = size
        light.data.color = color
        aim(light, (0, 0.9, 0))
    scene.world.color = (0.18, 0.18, 0.18)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1400
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.render.film_transparent = False
    bpy.ops.object.select_all(action='DESELECT')
    screen.select_set(True)
    bpy.context.view_layer.objects.active = screen
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    if args.preview:
        preview_path = Path(args.preview).resolve()
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(preview_path)
        bpy.ops.render.render(write_still=True)
    print('KIOSK_VALIDATION=' + json.dumps(manifest))


if __name__ == '__main__':
    main()
