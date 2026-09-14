"""Edit real simulator footage into the launch films. Requires FFmpeg + Pillow.
Run from the repository root after recording the named takes (docs/MARKETING.md).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import subprocess, json, math

ROOT = Path.cwd()
RAW = ROOT/'.release-media/raw'
WORK = ROOT/'.release-media/edit'
OUT = ROOT/'public/media'
WORK.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
FONT_DIR = Path('/System/Library/Fonts/Supplemental')
BOLD = FONT_DIR/'Arial Bold.ttf'
REG = FONT_DIR/'Arial.ttf'
MONO = FONT_DIR/'Andale Mono.ttf'
INK = (11,44,54)
PAPER = (247,244,234)
ORANGE = (248,128,79)

def run(args):
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)

def font(size,bold=False,mono=False):
    return ImageFont.truetype(str(MONO if mono else BOLD if bold else REG),size)

def text(draw,xy,value,size,color=PAPER,bold=False,mono=False):
    draw.text(xy,value,font=font(size,bold,mono),fill=color,stroke_width=0)

def overlay(name,title,subtitle,tag,index,vertical=False,end=False):
    w,h=(1080,1920) if vertical else (1920,1080)
    im=Image.new('RGBA',(w,h))
    d=ImageDraw.Draw(im)
    # Legible type over a full-size real capture; central hull stays visible.
    for y in range(h):
        top=max(0,1-y/(680 if vertical else 460))
        bottom=max(0,min(1,(y-(h-(800 if vertical else 470)))/(400 if vertical else 470)))
        a=int(max(top*.85,bottom*.78)*255)
        d.line([(0,y),(w,y)],fill=(*INK,a))
    x=76 if vertical else 80
    text(d,(x,130 if vertical else 53),'boatsim',48 if vertical else 38,bold=True)
    d.line((x,209 if vertical else 112,w-x,209 if vertical else 112),fill=(*PAPER,90),width=1)
    labelY=260 if vertical else 170
    text(d,(x,labelY),tag,22 if vertical else 20,ORANGE,mono=True)
    if vertical:
        yy=312
        for line in title.split('\n'):
            text(d,(x,yy),line,86,bold=True);yy+=95
        for j,line in enumerate(subtitle.split('\n')):
            text(d,(x,1440+j*53),line,44)
        if not end: text(d,(x,1560),'my-boats.vercel.app',40,bold=True)
        text(d,(w-190,1566),f'{index:02}',22,ORANGE,mono=True)
    else:
        yy=208
        for line in title.split('\n'):
            text(d,(x,yy),line,84 if not end else 96,bold=True);yy+=96 if not end else 107
        text(d,(x,951),subtitle,28)
        text(d,(w-398,63),'SAN JUAN ISLANDS',18,mono=True)
        text(d,(w-118,956),f'{index:02}',22,ORANGE,mono=True)
    if end:
        by=662 if vertical else 523
        label='TAKE THE HELM'
        d.rectangle((x,by,x+(665 if vertical else 516),by+89),fill=ORANGE)
        text(d,(x+28,by+23),label,34,INK,bold=True)
        ax=x+(610 if vertical else 457); ay=by+29
        d.line((ax-12,ay+27,ax+15,ay),fill=INK,width=3)
        d.line((ax-8,ay,ax+15,ay,ax+15,ay+23),fill=INK,width=3)
        text(d,(x,by+120),'my-boats.vercel.app',36 if vertical else 36,bold=True)
    dest=WORK/f'{name}-type.png';im.save(dest)
    return dest

# All motion shots use FWD. The plotter is an actual screenshot with a slow push-in.
SCENES=[
    dict(name='01-hook',source='slip-fwd',start=2,duration=4,speed=1.5,title='The last 50 feet.\nAll yours.',sub='A boat simulator for people who love bringing her in.',tag='WELCOME ABOARD'),
    dict(name='02-screws',source='turn-fwd',start=2,duration=5,speed=1.5,title='Two screws.\nYour call.',sub='Independent throttles. Prop walk. Bow thrust.',tag='FEEL THE MANEUVER'),
    dict(name='03-chart',source='chart',start=0,duration=4,speed=1,title='Know the water.',sub='Depth contours. Nearby traffic. Your next approach.',tag='READ THE PLOTTER'),
    dict(name='04-nordhavn',source='nordhavn-fwd',start=3,duration=3,speed=1.5,title='Find your boat.',sub='Serendipity · Nordhavn 86',tag='SEVEN PROFILES TO EXPLORE'),
    dict(name='05-corsair',source='corsair-fwd',start=4,duration=3,speed=1.5,title='Find your boat.',sub='Chris-Craft Corsair 36',tag='SEVEN PROFILES TO EXPLORE'),
    dict(name='06-cranchi',source='cranchi-fwd',start=4,duration=3,speed=1.5,title='Find your boat.',sub='Cranchi E26 Rider',tag='SEVEN PROFILES TO EXPLORE'),
    dict(name='07-islands',source='islands-fwd',start=2,duration=5,speed=1.5,title='A little island time.',sub='Pacific Northwest approaches. A whole new rhythm.',tag='LEAVE THE DOCK BEHIND'),
    dict(name='08-play',source='damage-fwd',start=4,duration=3,speed=1.5,title='Well. Try that again.',sub='Breakable docks. Hull damage. One very useful restart.',tag='PRACTICE + PLAY'),
    dict(name='09-wake',source='roche-fwd',start=3,duration=6,speed=1.3,title='One more approach.',sub='Keyboard or USB helm. Calm water or local conditions.',tag='COME BACK FOR ANOTHER GO'),
    dict(name='10-end',source='slip-fwd',start=3,duration=4,speed=1.25,title='Your next berth\nstarts here.',sub='Free in your browser. Built by a boater. Better with a crew.',tag='BOATSIM / COME ABOARD',end=True),
]

def encode_scene(scene,index):
    dest=WORK/f'{scene["name"]}.mp4'
    title=overlay(scene['name'],scene['title'],scene['sub'],scene['tag'],index,end=scene.get('end',False))
    if scene['source']=='chart':
        inp=['-loop','1','-framerate','30','-i',RAW/'chart.png']
        base="crop=1488:840:216:135,scale=2200:-1,zoompan=z='1.02+on*0.0005':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1920x1080:fps=30"
    else:
        inp=['-ss',scene['start'],'-i',RAW/f'{scene["source"]}.webm']
        base=f"setpts=(PTS-STARTPTS)/{scene['speed']},scale=1920:1080:flags=lanczos,setsar=1,fps=30"
    if scene['name']=='02-screws':
        im=Image.open(RAW/'helm.png').crop((1588,150,1905,540)).resize((444,546)).convert('RGBA')
        mask=Image.new('L',im.size);ImageDraw.Draw(mask).rounded_rectangle((0,0,443,545),radius=20,fill=255);im.putalpha(mask)
        sheet=Image.open(title).convert('RGBA');sheet.alpha_composite(im,(1394,287));d=ImageDraw.Draw(sheet);text(d,(1394,244),'AT THE HELM',18,ORANGE,mono=True);sheet.save(title)
    # Gentle grade keeps the water blue and the teak warm without inventing scenery.
    filters=f"[0:v]{base},eq=contrast=1.035:saturation=1.13:brightness=-0.018[v];[v][1:v]overlay=0:0,format=yuv420p[out]"
    run([*inp,'-loop','1','-i',title,'-filter_complex',filters,'-map','[out]','-an','-t',scene['duration'],'-r','30','-c:v','libx264','-preset','fast','-crf','20',dest])
    print(dest.name,flush=True)
    return dest

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--scene');parser.add_argument('--assemble',action='store_true');args=parser.parse_args()
    if not args.assemble:
        for i,scene in enumerate(SCENES,1):
            if not args.scene or args.scene==scene['name']:encode_scene(scene,i)
    if not args.scene:
        listing=WORK/'concat.txt';listing.write_text(''.join(f"file '{s['name']}.mp4'\n" for s in SCENES))
        run(['-f','concat','-safe','0','-i',listing,'-i',ROOT/'.release-media/score.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-t','40','-movflags','+faststart',OUT/'boat-sim-feature-40s.mp4'])
        (WORK/'timeline.json').write_text(json.dumps(SCENES,indent=2))
        print('Feature film complete.',flush=True)
