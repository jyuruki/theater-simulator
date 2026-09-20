"""Original theater prop library. Blender 5.2 background, textureless and meter scale.

blender --background --python assets-source/build_theater_props.py -- --preview work/props.png
Coordinates in helpers are runtime X/Y-up/Z-front. Named roots are exported at origin.
"""
import argparse
import json
import math
import random
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = None
M = {}
MODELS = []


def xyz(p):
    return Vector((p[0], -p[2], p[1]))


def material(name, color, metal=0, rough=.5, alpha=1, emission=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, alpha)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Alpha'].default_value = alpha
    if alpha < 1:
        m.surface_render_method = 'DITHERED'
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    m.diffuse_color = (*color, alpha)
    return m


def finish(obj, name, mat, smooth=False):
    obj.name = name
    obj.parent = ROOT
    obj.data.materials.append(M[mat] if isinstance(mat, str) else mat)
    for face in obj.data.polygons:
        face.use_smooth = smooth
    return obj


def box(name, p, size, mat='metal', bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(p))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Manufactured edge', 'BEVEL')
        mod.width = min(bevel, min(size) * .28)
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, mat)


def lathe(name, p, profile, mat='metal', segments=16, caps=True):
    verts = []
    for y, r in profile:
        for i in range(segments):
            a = i * 2 * math.pi / segments
            verts.append(tuple(xyz((p[0] + math.cos(a)*r, p[1]+y, p[2]+math.sin(a)*r))))
    faces = []
    for j in range(len(profile)-1):
        for i in range(segments):
            n = (i+1) % segments
            faces.append((j*segments+i,(j+1)*segments+i,(j+1)*segments+n,j*segments+n))
    if caps:
        faces += [tuple(range(segments)),tuple((len(profile)-1)*segments+i for i in range(segments-1,-1,-1))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat, True)


def cyl(name, p, r, h, mat='metal', segments=12):
    return lathe(name,p,[(-h/2,r),(h/2,r)],mat,segments)


def pipe(name, a, b, r=.015, mat='metal', segments=8):
    a,b = xyz(a),xyz(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=(b-a).length,location=(a+b)/2)
    obj=bpy.context.object
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return finish(obj,name,mat,True)


def ring(name,p,rx,rz,tube,mat='metal',segments=16):
    verts=[];faces=[]
    for i in range(segments):
        a=i*2*math.pi/segments
        for j in range(6):
            b=j*2*math.pi/6
            verts.append(tuple(xyz((p[0]+math.cos(a)*(rx+math.cos(b)*tube),p[1]+math.sin(b)*tube,p[2]+math.sin(a)*(rz+math.cos(b)*tube)))))
    for i in range(segments):
        for j in range(6):
            faces.append((i*6+j,((i+1)%segments)*6+j,((i+1)%segments)*6+(j+1)%6,i*6+(j+1)%6))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[tuple(reversed(f)) for f in faces]);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    return finish(obj,name,mat,True)


def ball(name,p,size,mat='porcelain',subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions,radius=1,location=xyz(p))
    obj=bpy.context.object;obj.scale=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,mat,True)


def text(name,body,p,height=.09,mat='white'):
    bpy.ops.object.text_add(location=xyz(p),rotation=(math.pi/2,0,0))
    obj=bpy.context.object;obj.name=name
    obj.data.body=body;obj.data.size=height;obj.data.align_x='CENTER';obj.data.align_y='CENTER'
    obj.data.resolution_u=1;obj.data.extrude=0
    bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.object,name,mat)


def model(name):
    global ROOT
    ROOT=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ROOT)
    ROOT['assetType']='theater-prop';ROOT['units']='meters';ROOT['front']='+Z'
    MODELS.append(ROOT)


def join_materials():
    # One primitive per material per prop: instanced at runtime, never 1000s of draw calls.
    for root in MODELS:
        buckets={}
        for obj in list(root.children):
            if obj.type=='MESH': buckets.setdefault(obj.data.materials[0].name,[]).append(obj)
        for mat,objects in buckets.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects: obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            bpy.ops.object.join()
            obj=bpy.context.object;obj.name=f'{root.name}__{mat}'
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)


def cabinet(w,h,d,mat='metal'):
    box('cabinet',(0,h/2,0),(w,h,d),mat)
    box('toe kick',(0,.05,d*.42),(w*.92,.1,.04),'black',0)
    for x in [-w*.24,w*.24]:
        box('cabinet door',(x,h*.49,d/2+.002),(w*.46,h*.72,.018),mat,.005)
        box('pull',(x,h*.7,d/2+.035),(.14,.025,.04),'metal',.005)


def bottle(p):
    x,y,z=p
    lathe('ribbed water bottle',(x,y,z),[(0,.045),(.018,.05),(.035,.046),(.06,.049),(.1,.046),(.13,.049),(.18,.046),(.22,.026),(.25,.022)],'water',12)
    cyl('water blue cap',(x,y+.258,z),.026,.024,'blue')
    cyl('white bottle label',(x,y+.12,z),.0495,.057,'white')
    box('blue label stripe',(x,y+.12,z+.05),(.055,.02,.004),'blue',0)


def build():
    model('recliner')
    box('steel sled',(0,.12,0),(.52,.12,.6),'black')
    box('pedestal',(0,.29,-.055),(.4,.24,.38),'black')
    box('seat cushion',(0,.52,.005),(.54,.21,.52),'leather',.05)
    back=box('contoured back',(0,.97,-.235),(.54,.82,.15),'leather',.05);back.rotation_euler.x=math.radians(8)
    box('headrest',(0,1.32,-.265),(.48,.17,.12),'leather',.035)
    box('lumbar bolster',(0,.77,-.13),(.49,.17,.12),'leather',.035)
    box('recliner foot pad',(0,.365,.235),(.5,.23,.18),'leather',.035)
    pipe('tray swivel post',(.25,.63,.12),(.25,.96,.12),.018,'metal')
    box('swivel snack tray',(.07,.968,.23),(.4,.04,.28),'espresso',.025)
    model('shared_armrest')
    for x in [0]:
        box('arm console',(x,.53,-.015),(.104,.5,.61),'black',.025)
        box('arm cushion',(x,.79,-.07),(.104,.07,.39),'leather',.018)
        ring('cupholder rim',(x,.777,.204),.033,.041,.007,'metal',12)
        cyl('cupholder hollow',(x,.767,.204),.026,.008,'black')
        box('recline buttons',(x,.575,.297),(.062,.023,.008),'metal',0)

    model('trash_can')
    lathe('bin',(0,0,0),[(0,.28),(.04,.32),(.83,.34),(.89,.36)],'black',20)
    lathe('brushed ring',(0,0,0),[(.87,.355),(.9,.37),(.98,.37),(1.01,.32),(1.01,.29),(.96,.29)],'metal',20,False)
    cyl('recessed lid',(0,.955,0),.31,.026,'black',20)
    ring('waste opening',(0,.977,0),.15,.115,.017,'metal')
    box('bin badge',(0,.64,.334),(.19,.11,.008),'metal',.01)
    text('waste lettering','WASTE',(0,.64,.34),.033,'black')

    model('toilet')
    lathe('foot',(0,0,-.06),[(0,.18),(.045,.21),(.25,.13),(.35,.19)],'porcelain')
    ball('bowl',(0,.37,.03),(.255,.15,.31),'porcelain',2)
    ring('seat rim',(0,.478,.035),.218,.267,.031,'porcelain',20)
    ball('bowl interior',(0,.469,.035),(.18,.015,.225),'bowl',2)
    box('tank',(0,.64,-.237),(.48,.4,.2),'porcelain',.045)
    box('tank lid',(0,.853,-.237),(.5,.036,.21),'porcelain',.01)
    box('flush lever',(-.18,.74,-.125),(.085,.025,.025),'metal',.006)

    model('urinal')
    box('wall mount',(0,.49,-.145),(.44,.68,.14),'porcelain',.05)
    ball('lower bowl',(0,.16,.016),(.235,.17,.18),'porcelain',2)
    ball('recess',(0,.28,.1),(.155,.18,.09),'bowl',2)
    ring('lower rim',(0,.255,.022),.18,.14,.024,'porcelain')
    pipe('flush pipe',(0,.77,-.12),(0,.9,-.12),.025,'metal')
    box('sensor',(0,.85,-.06),(.1,.09,.06),'metal')
    box('sensor eye',(0,.85,-.025),(.04,.026,.006),'black',0)

    model('sink')
    box('vanity',(0,.54,-.03),(.91,.49,.48),'black',.01)
    box('counter',(0,.88,0),(.96,.065,.54),'stone',.025)
    ball('basin lip',(0,.915,.015),(.27,.012,.19),'porcelain',2)
    ball('basin hollow',(0,.92,.015),(.225,.013,.145),'bowl',2)
    pipe('tap riser',(0,.92,-.19),(0,1.145,-.19),.025)
    pipe('tap spout',(0,1.14,-.19),(0,1.14,-.01),.022)
    box('soap bottle',(.34,.988,-.12),(.09,.15,.075),'white',.01)
    pipe('soap pump',(.34,1.06,-.12),(.34,1.13,-.12),.009)
    pipe('soap nozzle',(.34,1.13,-.12),(.34,1.13,-.07),.009)
    for x in [-.31,.31]: box('leg',(x,.13,-.12),(.035,.26,.035),'metal',0)

    model('sink_basin')
    ball('basin lip',(0,.012,.015),(.25,.012,.18),'porcelain',2)
    ball('basin hollow',(0,.019,.015),(.211,.013,.14),'bowl',2)
    pipe('tap riser',(0,.02,-.2),(0,.27,-.2),.023)
    pipe('tap spout',(0,.27,-.2),(0,.27,.005),.021)
    box('sensor tap button',(0,.18,-.173),(.044,.035,.007),'black',.003)

    model('mirror')
    box('brushed frame',(0,.5,0),(.9,1,.045),'metal',.008)
    box('silver mirror',(0,.5,.027),(.862,.963,.007),'mirror',0)

    model('paper_dispenser')
    box('dispenser',(0,.23,0),(.24,.28,.16),'black',.025)
    box('inspection window',(0,.22,.084),(.035,.12,.006),'water',.006)
    box('paper',(0,.07,.045),(.16,.14,.009),'white',0)
    box('paper serration',(0,.004,.044),(.16,.008,.014),'white',0)

    model('pos')
    box('cash drawer',(.03,.075,-.03),(.62,.15,.46),'black')
    box('drawer face',(.03,.073,.207),(.55,.09,.018),'metal',.004)
    pipe('display pedestal',(.08,.15,-.09),(.08,.43,-.09),.032)
    screen=box('touchscreen',(.08,.53,-.03),(.51,.35,.065),'black',.018);screen.rotation_euler.x=math.radians(-10)
    panel=box('display',(.08,.535,.009),(.455,.293,.005),'screen',.003);panel.rotation_euler.x=math.radians(-10)
    for j in range(3): box('menu row',(.03,.61-j*.065,.022),(.29,.022,.005),'teal',0)
    box('card reader',(-.25,.19,.24),(.19,.085,.16),'black')
    box('reader display',(-.25,.237,.245),(.13,.006,.06),'screen',0)
    box('receipt printer',(.27,.245,-.18),(.22,.19,.25),'black')
    box('receipt',(.27,.347,-.115),(.135,.009,.09),'white',0)

    model('ticket_podium')
    box('foot',(0,.05,0),(.72,.1,.59),'wood')
    box('upright',(0,.54,-.06),(.51,.92,.38),'wood',.025)
    box('front inset',(0,.63,.137),(.41,.5,.012),'black',.01)
    text('ticket plaque','TICKETS',(0,.66,.148),.07,'gold')
    top=box('slanted lectern',(0,1.078,0),(.82,.075,.64),'wood',.025);top.rotation_euler.x=.14
    box('page stop',(0,1.065,.285),(.72,.04,.025),'gold',.005)
    box('ticket scanner',(.21,1.122,-.1),(.13,.06,.16),'black')
    box('scanner window',(.21,1.157,-.1),(.095,.007,.085),'screen',0)

    model('candy_display')
    box('recess backing',(0,.53,-.085),(1.8,1.04,.05),'black')
    for x in [-.875,.875]: box('side frame',(x,.525,0),(.05,1.05,.22),'blue')
    box('lower kick',(0,.055,0),(1.8,.11,.22),'blue')
    for i,y in enumerate([.14,.43,.72]):
        box('shelf',(0,y,0),(1.7,.025,.2),'metal',.003)
        box('price strip',(0,y+.012,.108),(1.7,.028,.005),'white',0)
        for j in range(7):
            x=(j-3)*.229;c=['red','gold','green','purple','blue','orange','teal'][(j+i)%7]
            box('candy carton',(x,y+.108,.005),(.18,.19,.105),c,.007)
            box('package top fold',(x,y+.207,.005),(.183,.012,.11),c,.002)
            box('brand ribbon',(x,y+.13,.061),(.157,.045,.005),'white',0)
            text('original candy logo',['POP','BITS','GUM','GLOW','MINT','ZEST','DROPS'][(j+i)%7],(x,y+.13,.065),.027,'black')
            for k in [-1,0,1]: ball('candy illustration',(x+k*.04,y+.058,.063),(.018,.018,.004),'gold')
    box('header',(0,1.008,.008),(1.8,.084,.2),'blue')
    text('candy heading','CANDY',(0,1.01,.113),.053,'white')

    model('water_display')
    box('cooler back',(0,.53,-.145),(1.4,1.05,.05),'black')
    for x in [-.67,.67]: box('cooler side',(x,.525,0),(.06,1.05,.34),'blue')
    box('cooler bottom',(0,.04,0),(1.4,.08,.34),'blue')
    for y in [.09,.39,.69]:
        box('bottle shelf',(0,y,0),(1.29,.025,.3),'metal',.003)
        box('cooler light',(0,y+.015,-.125),(1.21,.015,.02),'white',0)
        for j in range(8):
            bottle(((j-3.5)*.15,y+.013,.066))
    box('cooler header',(0,1.017,0),(1.4,.066,.34),'blue')
    text('water heading','CHILLED WATER',(0,1.016,.174),.047,'white')

    model('popcorn_popper')
    cabinet(1.3,.98,.9,'red')
    box('popcorn deck',(0,1.02,0),(1.3,.08,.9),'metal')
    for x in [-.605,.605]:
        for z in [-.4,.4]: box('popper pillar',(x,1.75,z),(.045,1.43,.045),'metal',.008)
    for x in [-.59,.59]: box('side glass',(x,1.75,0),(.008,1.34,.76),'glass',0)
    box('back glass',(0,1.75,-.395),(1.16,1.34,.008),'glass',0)
    for x in [-.3,.3]:
        box('glass doors',(x,1.75,.393),(.57,1.34,.008),'glass',0)
        box('glass pulls',(x*.24,1.7,.42),(.025,.19,.035),'metal')
    box('red canopy',(0,2.615,0),(1.3,.29,.9),'red',.025)
    text('popcorn title','POPCORN',(0,2.63,.456),.146,'gold')
    lathe('kettle',(0,1.67,0),[(0,.21),(.03,.25),(.21,.25),(.24,.2)],'metal',20)
    cyl('kettle lid',(0,1.925,0),.27,.03,'metal',20)
    pipe('kettle hanger',(0,1.95,0),(0,2.47,0),.025)
    pipe('kettle crank',(.23,1.84,0),(.47,1.84,0),.017)
    pipe('crank grip',(.47,1.84,0),(.47,1.75,0),.024,'black')
    random.seed(41)
    for i in range(84): ball('popped kernel',(random.uniform(-.53,.53),random.uniform(1.1,1.24),random.uniform(-.32,.32)),(.044,.044,.04),'popcorn')

    model('soda_fountain')
    box('dispenser base',(0,.11,0),(1.2,.22,.75),'black')
    box('tower',(0,.7,-.22),(1.16,.9,.3),'black')
    box('menu panel',(0,.91,-.056),(1.08,.31,.025),'screen')
    for i,c in enumerate(['red','orange','green','purple','blue']):
        x=(i-2)*.213
        box('flavor button',(x,.91,-.037),(.16,.2,.019),c,.009)
        pipe('nozzle',(x,.72,-.085),(x,.55,-.025),.028,'metal')
        box('paddle',(x,.53,.015),(.072,.14,.03),'black')
    box('drip tray',(0,.236,.115),(1.07,.052,.45),'metal',.01)
    for i in range(15): box('drip slots',((i-7)*.066,.266,.115),(.018,.003,.35),'black',0)

    model('icee_machine')
    box('chiller',(0,.285,0),(1,.57,.75),'metal',.025)
    for i,x in enumerate([-.245,.245]):
        lathe('frozen drink',(x,.56,-.025),[(0,.2),(.025,.225),(.56,.225),(.59,.19)],'red' if i==0 else 'blue',20)
        lathe('clear barrel',(x,.555,-.025),[(0,.226),(.61,.226)],'glass',20)
        cyl('barrel cap',(x,1.2,-.025),.24,.08,'black',20)
        pipe('pour spigot',(x,.63,.1),(x,.63,.3),.035)
        pipe('pour outlet',(x,.63,.3),(x,.53,.3),.03)
        pipe('tap handle',(x,.64,.3),(x,.8,.3),.023,'black')
    box('header',(0,1.32,-.05),(.95,.12,.35),'blue')
    text('frozen sign','FROZEN',(0,1.321,.131),.085,'white')
    box('drip tray',(0,.325,.22),(.83,.05,.25),'black')
    for i in range(7): box('cooling vent',((i-3)*.096,.14,.379),(.048,.09,.006),'black',0)

    model('cup_caddy')
    box('caddy',(0,.1,0),(.78,.2,.72),'black')
    for x in [-.23,0,.23]:
        lathe('nested cup',(x,.17,0),[(0,.075),(.46,.1)],'white')
        for y in [.54,.57,.60,.63]: ring('cup rim',(x,y,0),.098,.098,.008,'white',12)
        cyl('lid stack',(x,.655,0),.105,.03,'black')
    box('straw cup',(0,.245,-.26),(.15,.21,.16),'metal')
    for x in [-.044,0,.044]:
        for z in [-.3,-.25,-.21]: pipe('paper straw',(x,.34,z),(x,.71+(x+.04)*.4,z),.009,'white',6)

    model('drinking_fountain')
    box('wall panel',(0,.95,-.2),(.61,1.08,.08),'metal')
    box('chiller body',(0,.63,-.05),(.59,.49,.36),'metal',.045)
    box('basin lip',(0,.99,.02),(.65,.11,.48),'metal',.035)
    ball('basin',(0,1.049,.035),(.25,.012,.16),'bowl',2)
    pipe('bubbler',(-.19,1.05,.08),(-.19,1.15,.08),.022)
    pipe('spout',(-.19,1.15,.08),(-.13,1.15,.08),.023)
    box('push bar',(0,.855,.17),(.38,.11,.04),'black')
    for i in range(7): box('chiller vent',((i-3)*.063,.56,.137),(.022,.16,.01),'black',0)

    model('turbo_oven')
    cabinet(1,.92,.85)
    box('insulated oven',(0,1.36,0),(.94,.88,.8),'metal',.03)
    box('oven door',(-.065,1.35,.411),(.68,.62,.04),'black')
    box('oven window',(-.065,1.38,.435),(.5,.35,.015),'screen')
    pipe('door handle',(-.35,1.64,.47),(.21,1.64,.47),.025)
    box('control pad',(.345,1.5,.411),(.13,.23,.018),'black')
    for y in [1.45,1.52,1.59]: box('control button',(.345,y,.424),(.072,.033,.008),'teal',.006)

    model('fryer')
    cabinet(.9,.92,.8)
    box('oil well',(0,.967,.015),(.73,.075,.64),'black')
    for x in [-.2,.2]:
        box('basket',(x,1.002,0),(.29,.035,.43),'metal')
        for j in range(6): pipe('basket grate',(x-.13,.985,-.18+j*.065),(x+.13,.985,-.18+j*.065),.007)
        pipe('basket shaft',(x,1.03,.16),(x,1.13,.35),.013)
        pipe('basket grip',(x,1.13,.35),(x,1.13,.41),.025,'black')
    box('backsplash',(0,1.28,-.36),(.85,.72,.08),'metal')
    box('control housing',(0,1.65,-.31),(.85,.14,.16),'black')
    for x in [-.25,0,.25]: ball('temperature knob',(x,1.65,-.22),(.03,.03,.017),'metal')

    model('grill')
    cabinet(1.4,.92,.8)
    box('griddle surface',(0,.982,0),(1.35,.085,.74),'black')
    box('rear splash',(0,1.25,-.365),(1.4,.54,.045),'metal')
    for x in [-.682,.682]: box('side splash',(x,1.08,0),(.025,.18,.72),'metal')
    for x in [-.5,-.17,.17,.5]: ball('griddle knob',(x,.84,.42),(.038,.038,.021),'black')
    for i in range(10): box('grill rib',(-.58+i*.128,1.03,0),(.018,.013,.62),'metal',.003)

    model('bar_well')
    cabinet(1.2,.94,.75)
    box('rim',(0,1,0),(1.2,.07,.75),'metal')
    box('ice well',(0,1.041,-.06),(.89,.013,.43),'bowl')
    for i in range(15): box('ice cube',((i%5-2)*.14,1.061,-.18+(i//5)*.12),(.085,.045,.08),'water',.008)
    box('bottle rail',(0,1.048,.282),(1.05,.058,.16),'black')

    model('storage_rack')
    for x in [-.775,.775]:
        for z in [-.25,.25]: box('steel upright',(x,.975,z),(.045,1.95,.045),'metal',.006)
    for i,y in enumerate([.13,.65,1.18,1.77]):
        box('shelf',(0,y,0),(1.6,.045,.55),'metal',.004)
        if i<3:
            for x in [-.48,.05,.52]:
                box('carton',(x,y+.187,0),(.4,.33,.38),'cardboard',.008)
                box('packing tape',(x,y+.357,0),(.067,.006,.38),'gold',0)
                box('stock label',(x,y+.21,.193),(.16,.08,.006),'white',0)

    model('storage_box')
    box('carton',(0,.18,0),(.5,.36,.4),'cardboard',.009)
    box('packing tape',(0,.362,0),(.08,.004,.4),'gold',0)
    box('label',(0,.21,.204),(.22,.1,.006),'white',0)
    for x in [-.066,-.035,0,.025,.063]:box('label barcode',(x,.211,.208),(.009,.06,.004),'black',0)

    model('office_desk')
    box('worktop',(0,.75,0),(1.4,.06,.65),'wood',.016)
    for x in [-.63,.63]:
        for z in [-.245,.245]:box('desk leg',(x,.36,z),(.045,.72,.045),'black',.005)
    box('drawer',(-.43,.62,-.03),(.38,.19,.49),'wood')
    box('drawer pull',(-.43,.62,.229),(.16,.025,.025),'metal',.005)

    model('office_chair')
    cyl('pneumatic post',(0,.27,0),.04,.4)
    for i in range(5):
        a=i*math.pi*2/5;x,z=math.cos(a)*.25,math.sin(a)*.25
        pipe('star base',(0,.11,0),(x,.06,z),.025,'black')
        ball('castor',(x,.041,z),(.043,.041,.035),'black')
    box('seat',(0,.48,0),(.48,.13,.45),'teal',.045)
    back=box('padded back',(0,.856,-.21),(.46,.52,.11),'teal',.035);back.rotation_euler.x=.1
    for x in [-.285,.285]:
        pipe('arm stem',(x,.45,-.1),(x,.71,-.1),.015)
        box('arm pad',(x,.735,0),(.05,.05,.34),'black')

    model('sanitizer')
    cyl('foot',(0,.025,0),.16,.05,'black',20)
    pipe('stand',(0,.05,0),(0,1.06,0),.025)
    box('dispenser',(0,1.15,.024),(.19,.26,.15),'white',.025)
    box('level window',(0,1.145,.104),(.045,.095,.005),'water',.006)
    box('pump outlet',(0,1.025,.095),(.067,.037,.04),'black')

    model('stanchion')
    lathe('weighted base',(0,0,0),[(0,.16),(.02,.17),(.06,.16),(.08,.07)],'metal',20)
    pipe('pole',(0,.08,0),(0,.94,0),.028)
    cyl('belt head',(0,.974,0),.063,.112,'black')

    for variant,mat in [('blue','blue'),('white','white'),('wood','wood')]:
        model('counter_'+variant)
        box('counter body',(0,.65,0),(1,.94,1),mat,.009)
        box('stainless plinth',(0,.09,0),(1,.18,1),'metal',.007)
        box('stone countertop',(0,1.16,0),(1,.1,1),'stone',.015)
        for x in [-.485,.485]:box('edge molding',(x,.66,.502),(.018,.87,.009),mat,.003)
        box('inset face',(0,.65,.502),(.94,.82,.006),mat,.007)

    model('stall_partition')
    box('partition',(0,1.16,0),(1,1.88,.045),'blue',.005)
    for x in [-.425,.425]:
        box('support leg',(x,.13,0),(.035,.26,.04),'metal',.003)
        box('wall fixing',(x,1.97,0),(.04,.1,.055),'metal',.003)

    model('stall_door')
    box('privacy door',(0,1.04,0),(.8,1.9,.045),'blue',.005)
    for y in [.5,1.6]:box('hinge',(-.384,y,0),(.032,.11,.055),'metal',.004)
    box('latch plate',(.31,1.06,.03),(.058,.095,.014),'metal',.004)
    box('latch',(.29,1.06,.043),(.085,.025,.017),'metal',.004)


def bounds(root):
    coords=[obj.matrix_world @ v.co for obj in root.children if obj.type=='MESH' for v in obj.data.vertices]
    points=[(p.x,p.z,-p.y) for p in coords]
    lo=[min(p[i] for p in points) for i in range(3)]
    hi=[max(p[i] for p in points) for i in range(3)]
    return {'min':[round(v,5) for v in lo],'max':[round(v,5) for v in hi], 'size':[round(b-a,5) for a,b in zip(lo,hi)]}


def aim(obj,target):
    obj.rotation_euler=(xyz(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def main():
    global ROOT,M
    parser=argparse.ArgumentParser()
    parser.add_argument('--output-dir',default='public/models')
    parser.add_argument('--blend',default='assets-source/theater-props.blend')
    parser.add_argument('--preview')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    palette={'black':((.025,.031,.037),.12,.37),'metal':((.48,.54,.59),.8,.28),'leather':((.07,.075,.09),.04,.45),'wood':((.31,.125,.045),0,.47),'stone':((.09,.11,.13),.1,.28),'porcelain':((.9,.92,.94),.02,.23),'white':((.91,.94,.97),0,.37),'bowl':((.12,.22,.26),.15,.22),'mirror':((.45,.61,.67),.98,.08),'screen':((.023,.12,.18),.15,.25),'red':((.63,.033,.045),.02,.36),'blue':((.03,.23,.54),.12,.37),'teal':((.045,.41,.42),.05,.48),'green':((.17,.48,.085),0,.5),'purple':((.42,.065,.53),0,.5),'orange':((.88,.2,.028),0,.5),'gold':((.83,.5,.09),.18,.39),'cardboard':((.53,.35,.17),0,.87),'popcorn':((1,.78,.37),0,.73)}
    palette['leather']=((.11,.046,.021),0,.48)
    palette['espresso']=((.018,.012,.009),.02,.56)
    M={k:material('Prop_'+k,*v) for k,v in palette.items()}
    M['water']=material('Prop_water',(.32,.67,.83),.15,.19,.79)
    M['glass']=material('Prop_glass',(.53,.76,.86),.02,.18,.16)
    build();join_materials();bpy.context.view_layer.update()
    records=[]
    for root in MODELS:
        triangles=0
        for obj in root.children:
            obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
        records.append({'name':root.name,'bounds':bounds(root),'triangles':triangles,'meshCount':len(root.children)})
    output=Path(args.output_dir).resolve();output.mkdir(parents=True,exist_ok=True)
    glb=output/'theater-props.glb'
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    manifest={'asset':glb.name,'version':1,'authoringTool':'Blender '+bpy.app.version_string,'units':'meters','axes':{'up':'+Y','front':'+Z'},'origin':'floor center; wall-mounted and counter props placed at their mounting elevation','license':'Original project geometry; no third-party assets or textures.','glbBytes':glb.stat().st_size,'models':records,'modelCount':len(records),'triangles':sum(r['triangles'] for r in records),'notes':['Simplified original manufactured fixtures; fitted to gameplay envelopes, not surveyed measurements.','Candy labels are invented project graphics. Chilled-water bay contains 24 individual bottle meshes.','Dynamic movie displays and architecture remain authored by the game.']}
    (output/'theater-props.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    # Contact sheet is a source-file preview. Exported roots remain at origin in the GLB.
    for i,root in enumerate(MODELS):root.location=xyz(((i%7)*2.4,0,-(i//7)*3.1))
    ROOT=None
    ground=box('Preview ground',(7.2,-.04,-4.5),(21,.08,16),'black',0)
    for i,root in enumerate(MODELS):text('Preview caption',root.name.replace('_',' ').upper(),((i%7)*2.4,.02,-(i//7)*3.1+.85),.115,'white')
    scene=bpy.context.scene
    bpy.ops.object.camera_add(location=xyz((18,18,21)))
    camera=bpy.context.object;aim(camera,(7.1,.45,-4.5));camera.data.type='ORTHO';camera.data.ortho_scale=20.5;scene.camera=camera
    for p,energy,size in [((2,14,7),3400,10),((16,10,-7),2300,8),((-4,7,-8),2500,7)]:
        bpy.ops.object.light_add(type='AREA',location=xyz(p));light=bpy.context.object;light.data.energy=energy;light.data.size=size;aim(light,(7,0,-4.5))
    scene.world.color=(.2,.2,.2);scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=2400;scene.render.resolution_y=1800;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    blend=Path(args.blend).resolve();blend.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    if args.preview:
        preview=Path(args.preview).resolve();preview.parent.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(preview);bpy.ops.render.render(write_still=True)
    print('PROP_LIBRARY='+json.dumps(manifest))


if __name__=='__main__':main()
