"""Build six original, meter-scale articulated theater people with Blender.

blender --background --python assets-source/build_theater_npcs.py -- --preview PATH
Runtime axes are X across, Y up, +Z forward. Each exported person stands at the
origin; the editable .blend presents them in a contact-sheet lineup. Five joined
vertex-color meshes per person keep the rigid animation inexpensive.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', default='public/models')
    parser.add_argument('--blend', default='assets-source/theater-npcs.blend')
    parser.add_argument('--preview')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def xyz(p):
    return Vector((p[0], -p[2], p[1]))


def rgb(hex_color):
    values = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in values)


def finish(obj, color, parent):
    obj.data.materials.clear()
    obj.data.materials.append(PALETTE)
    attr = obj.data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for item in attr.data:
        item.color = (*rgb(color), 1)
    obj.parent = parent
    return obj


def box(p, size, color, parent, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(p))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Tailored soft edge', 'BEVEL')
        mod.width, mod.segments = bevel, 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, color, parent)


def ellipsoid(p, size, color, parent, segments=12, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=xyz(p))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return finish(obj, color, parent)


def tapered(p, height, lower, upper, color, parent):
    verts = []
    for h, shape in [(-height / 2, lower), (height / 2, upper)]:
        for i in range(8):
            angle = (i + .5) * math.pi / 4
            verts.append(xyz((p[0] + math.cos(angle) * shape[0], p[1] + h, p[2] + math.sin(angle) * shape[1])))
    faces = [tuple(range(7, -1, -1)), tuple(range(8, 16))]
    faces += [(i, (i+1) % 8, (i+1) % 8 + 8, i+8) for i in range(8)]
    mesh = bpy.data.meshes.new('Tailored form')
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new('Tailored form', mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, color, parent)


def empty(name, p=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = xyz(p)
    obj.parent = parent
    return obj


def join_part(root, name, pivot):
    objects = [o for o in root.children if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    bpy.context.scene.cursor.location = xyz(pivot)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # Joining can duplicate the same material slot. Collapse to the palette.
    result.data.materials.clear()
    result.data.materials.append(PALETTE)
    for poly in result.data.polygons:
        poly.material_index = 0
    return result


def hair_cap(color, parent, style):
    # A fitted curved cap, with a lower hairline behind the ears.
    verts, faces = [], []
    segments, rings = 16, 5
    for ring in range(rings + 1):
        for i in range(segments):
            a = i * math.tau / segments
            frontal = max(0, math.sin(a))
            phi = (ring / rings) * (1.62 - frontal * .32)
            verts.append(xyz((math.cos(a) * math.sin(phi) * .114,
                              1.624 + math.cos(phi) * .139,
                              -.010 + math.sin(a) * math.sin(phi) * .105)))
    for ring in range(rings):
        for i in range(segments):
            a, b = ring * segments+i, ring * segments+(i+1) % segments
            faces.append((a, a+segments, b+segments, b))
    mesh = bpy.data.meshes.new('Fitted hair cap')
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new('Hair', mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, color, parent)
    if style == 'curls':
        for x in [-.072, 0, .072]:
            for z in [-.045, .025, .083]:
                ellipsoid((x, 1.744, z), (.045, .035, .040), color, parent, 8, 4)
    elif style == 'bun':
        ellipsoid((0, 1.705, -.114), (.078, .074, .065), color, parent)
        box((0, 1.72, -.11), (.10, .018, .026), 'B79454', parent, .004)
    elif style == 'bob':
        for x in [-.103, .103]:
            ellipsoid((x, 1.59, -.015), (.036, .104, .075), color, parent)
        ellipsoid((0, 1.59, -.096), (.104, .108, .032), color, parent)
    elif style == 'swept':
        fringe = ellipsoid((-.024, 1.726, .074), (.096, .028, .047), color, parent)
        fringe.rotation_euler.y = .12
    elif style == 'pony':
        ellipsoid((0, 1.613, -.132), (.047, .145, .039), color, parent)
        box((0, 1.717, -.11), (.060, .02, .026), 'DC9D69', parent, .003)


def person(index, spec):
    name, skin, hair, style, shirt, trousers, staff = spec
    root = empty(name)
    root['role'] = 'staff' if staff else 'visitor'
    root['asset_version'] = 1
    body = empty(name + '_body_build', parent=root)
    tapered((0, 1.115, 0), .49, (.166, .099), (.219, .112), shirt, body)
    tapered((0, .823, 0), .15, (.177, .09), (.173, .105), trousers, body)
    box((0, .866, .003), (.316, .033, .184), '343A41', body, .005)
    box((0, .868, .099), (.038, .026, .012), 'AEB8B5', body, .002)
    ellipsoid((0, 1.409, 0), (.052, .082, .049), skin, body)
    # Jaw, cheeks and facial features are geometry, so faces remain readable in dim halls.
    ellipsoid((0, 1.60, .0), (.111, .145, .104), skin, body, 16, 10)
    ellipsoid((0, 1.511, .022), (.073, .052, .069), skin, body)
    for side in [-1, 1]:
        ellipsoid((side * .111, 1.607, -.006), (.023, .037, .022), skin, body, 8, 5)
        ellipsoid((side * .044, 1.632, .094), (.026, .0115, .010), 'F6F0E6', body, 8, 4)
        ellipsoid((side * .040, 1.632, .103), (.0095, .010, .006), '302C2C', body, 8, 4)
        box((side * .043, 1.655, .099), (.042, .009, .008), hair, body, .002)
    ellipsoid((0, 1.601, .111), (.021, .028, .030), skin, body, 8, 5)
    box((0, 1.548, .094), (.041, .008, .006), '985C54', body, .002)
    hair_cap(hair, body, style)
    # Folded collar, placket, shoulder seams and real badge.
    for side in [-1, 1]:
        collar = box((side * .057, 1.367, .099), (.082, .066, .018), 'D8E3DB' if staff else shirt, body, .005)
        collar.rotation_euler.y = side * .32
    box((0, 1.235, .108), (.014, .27, .011), '17434D' if staff else '6C786F', body, .003)
    for y in [1.315, 1.238, 1.16]:
        ellipsoid((0, y, .12), (.006, .006, .004), 'ECE9DD', body, 6, 3)
    if staff:
        box((-.095, 1.283, .114), (.104, .037, .015), 'CBA763', body, .004)
        box((-.097, 1.285, .123), (.076, .019, .002), 'F3EEE4', body, .001)
        box((-.098, 1.285, .125), (.048, .003, .001), '23434B', body, 0)
        box((.098, 1.25, .111), (.063, .084, .008), '204854', body, .003)
        box((.098, 1.293, .119), (.063, .009, .005), 'B69A62', body, .001)
        for side in [-1, 1]:
            box((side * .134, 1.346, .073), (.055, .018, .071), 'CBA763', body, .003)
    elif index == 0:
        # Maroon overshirt, rolled sleeves, two stitched breast pockets.
        for side in [-1, 1]:
            box((side * .106, 1.229, .111), (.066, .077, .012), 'A06059', body, .005)
            box((side * .106, 1.267, .122), (.067, .009, .006), 'D3A28B', body, .001)
    elif index == 1:
        # Olive outdoor vest over a cream shirt.
        for side in [-1, 1]:
            box((side * .10, 1.184, .106), (.119, .32, .025), '687A67', body, .013)
            box((side * .106, 1.118, .123), (.079, .055, .012), '829177', body, .004)
    else:
        # Ochre casual shirt with a restrained island-inspired geometric print.
        for x in [-.125, -.062, .061, .128]:
            for y in [1.12, 1.225, 1.325]:
                flower = box((x, y, .117), (.028, .021, .006), 'E8CF9D', body, .002)
                flower.rotation_euler.y = .6
    torso = join_part(body, name + '_Body', (0, 0, 0))
    torso.parent = root
    bpy.data.objects.remove(body, do_unlink=True)
    for side, suffix in [(-1, 'L'), (1, 'R')]:
        # Construct in world axes, then relocate the origin to the shoulder / hip.
        arm_build = empty(name + '_arm_build', parent=root)
        arm_x = side * .227
        sleeve = shirt if staff or index != 1 else 'DBD7C4'
        tapered((arm_x, 1.244, 0), .229, (.063, .061), (.075, .075), sleeve, arm_build)
        box((arm_x, 1.141, .002), (.112, .023, .117), '153F4B' if staff else 'CFB99C', arm_build, .005)
        tapered((arm_x, 1.035, .008), .195, (.038, .037), (.052, .046), skin, arm_build)
        ellipsoid((arm_x, .909, .014), (.044, .064, .035), skin, arm_build, 10, 6)
        ellipsoid((arm_x-side*.029, .928, .039), (.018, .033, .021), skin, arm_build, 8, 4)
        if side == -1:
            box((arm_x, .985, .045), (.043, .032, .014), '363C43', arm_build, .004)
            box((arm_x, .985, .054), (.028, .021, .005), 'A4C5C6', arm_build, .002)
        arm = join_part(arm_build, name + '_Arm_' + suffix, (arm_x, 1.354, 0))
        arm.parent = root
        bpy.data.objects.remove(arm_build, do_unlink=True)
        leg_build = empty(name + '_leg_build', parent=root)
        leg_x = side * .09
        tapered((leg_x, .455, 0), .726, (.072, .066), (.087, .089), trousers, leg_build)
        box((leg_x, .114, .002), (.131, .036, .117), trousers, leg_build, .004)
        box((leg_x, .054, .046), (.157, .094, .246), '283037', leg_build, .025)
        box((leg_x, .014, .046), (.16, .025, .249), 'C0C2B6' if not staff else '20272D', leg_build, .011)
        box((leg_x, .085, .079), (.077, .016, .082), 'E1D9BD' if not staff else '646B6F', leg_build, .004)
        for z in [.062, .082, .102]:
            box((leg_x, .096, z), (.064, .008, .007), 'D8D8C9', leg_build, .001)
        leg = join_part(leg_build, name + '_Leg_' + suffix, (leg_x, .821, 0))
        leg.parent = root
        bpy.data.objects.remove(leg_build, do_unlink=True)
    return root


def main():
    global PALETTE
    opts = args()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    PALETTE = bpy.data.materials.new('NPC vertex-color fabric and skin')
    PALETTE.use_nodes = True
    shader = PALETTE.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .78
    vertex = PALETTE.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'Color'
    PALETTE.node_tree.links.new(vertex.outputs['Color'], shader.inputs['Base Color'])
    specs = [
        ('NPC_Visitor_01', 'C58B68', '382923', 'swept', '94584F', '3F4756', False),
        ('NPC_Visitor_02', '88563B', '242527', 'curls', 'DAD4BC', '525C4F', False),
        ('NPC_Visitor_03', 'D8AC86', '4E372D', 'bob', 'B69455', '506A78', False),
        ('NPC_Staff_01', 'D3A07B', '43332D', 'bun', '245664', '303A46', True),
        ('NPC_Staff_02', '946446', '252526', 'swept', '245664', '303A46', True),
        ('NPC_Staff_03', 'BE8A61', '342829', 'pony', '245664', '303A46', True),
    ]
    roots = [person(i, spec) for i, spec in enumerate(specs)]
    bpy.ops.object.select_all(action='DESELECT')
    for root in roots:
        root.select_set(True)
        for child in root.children_recursive:
            child.select_set(True)
    output = Path(opts.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output / 'theater-npcs.glb'), export_format='GLB',
                              use_selection=True, export_yup=True, export_animations=False,
                              export_materials='EXPORT', export_extras=True, export_normals=True)
    triangles = {}
    for root in roots:
        count = 0
        for child in root.children:
            child.data.calc_loop_triangles()
            count += len(child.data.loop_triangles)
        triangles[root.name] = count
    manifest = {'asset': 'theater-npcs.glb', 'version': 1, 'authoring': 'Blender',
                'license': 'Original project asset; same license as this repository',
                'meters': True, 'forward': '+Z', 'up': '+Y', 'rootOrigin': 'floor between feet',
                'characters': [{'name': r.name, 'role': r['role'], 'triangles': triangles[r.name],
                                'meshes': 5, 'parts': ['Body', 'Arm_L', 'Arm_R', 'Leg_L', 'Leg_R']}
                               for r in roots],
                'totalTriangles': sum(triangles.values()), 'materials': 1,
                'textures': 0, 'gait': 'Rigid shoulder and hip pivots; animated by atmosphere.js'}
    (output / 'theater-npcs.manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    # Arrange editable source for quick comparison without changing GLB placement.
    for i, root in enumerate(roots):
        root.location = xyz(((i - 2.5) * .79, 0, 0))
        root.rotation_euler.z = .10 if i % 2 == 0 else -.10
    scene = bpy.context.scene
    scene.world.color = (.17, .17, .17)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.012))
    floor = bpy.context.object
    floor.name = 'Preview floor (not exported)'
    mat = bpy.data.materials.new('Preview slate')
    mat.diffuse_color = (.10, .135, .155, 1)
    floor.data.materials.append(mat)
    for name, p, energy, size in [('Key', (0, 4, 6), 1500, 7), ('Fill', (-4, 1, -3), 900, 5)]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size = energy, 'DISK', size
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = xyz(p)
        obj.rotation_euler = (xyz((0, .9, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('Contact-sheet camera')
    camera = bpy.data.objects.new('Contact-sheet camera', data)
    bpy.context.collection.objects.link(camera)
    camera.location = xyz((0, 2.0, 7))
    camera.rotation_euler = (xyz((0, .9, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    data.type, data.ortho_scale = 'ORTHO', 5.08
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.render.resolution_x, scene.render.resolution_y = 1800, 850
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    blend = Path(opts.blend).resolve()
    blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    if opts.preview:
        scene.render.filepath = str(Path(opts.preview).resolve())
        bpy.ops.render.render(write_still=True)
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
