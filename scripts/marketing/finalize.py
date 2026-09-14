"""Create posters, GitHub motion previews, social card, and accessible captions."""
from render import *
from short import CUTS, render_short

import sys
if "--assets-only" not in sys.argv:
    render_short()

def still(source,seconds,destination):
    run(['-ss',seconds,'-i',source,'-frames:v','1','-q:v','2',destination])

still(RAW/'slip-fwd.webm',6,WORK/'hero-frame.jpg')
Image.open(WORK/'hero-frame.jpg').save(OUT/'hero.jpg',quality=88,optimize=True)
Image.open(RAW/'chart.png').crop((216,135,1704,975)).resize((1200,760)).save(OUT/'chart.jpg',quality=90,optimize=True)
for name,video,at in [('feature', 'boat-sim-feature-40s.mp4',1),('short','boat-sim-short-15s.mp4',1)]:
    still(OUT/video,at,WORK/f'{name}-poster.jpg')
    im=Image.open(WORK/f'{name}-poster.jpg').convert('RGBA');d=ImageDraw.Draw(im)
    cx,cy=(960,570) if name=='feature' else (540,1030)
    r=60
    d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(*PAPER,240))
    d.polygon([(cx-13,cy-23),(cx-13,cy+23),(cx+24,cy)],fill=INK)
    im.convert('RGB').save(OUT/f'{name}-poster.jpg',quality=90,optimize=True)

im=Image.open(OUT/'hero.jpg').resize((1200,675)).crop((0,22,1200,652)).convert('RGBA')
shade=Image.new('RGBA',im.size);d=ImageDraw.Draw(shade)
for x in range(1200):d.line((x,0,x,630),fill=(*INK,int(255*(.93-.60*x/1200))))
im=Image.alpha_composite(im,shade);d=ImageDraw.Draw(im)
text(d,(64,47),'boatsim',38,bold=True)
text(d,(64,127),'MADE FOR PEOPLE WHO LOVE BOATS',16,ORANGE,mono=True)
text(d,(60,181),'Your next berth',72,bold=True)
text(d,(60,260),'starts here.',72,bold=True)
d.rectangle((64,386,407,449),fill=ORANGE);text(d,(85,404),'TAKE THE HELM',24,INK,bold=True);d.line((361,428,384,405),fill=INK,width=2);d.line((365,405,384,405,384,424),fill=INK,width=2)
text(d,(64,530),'boat-sim.vercel.app',24,bold=True)
im.convert('RGB').save(OUT/'social-card.jpg',quality=90,optimize=True)

# GitHub reliably displays animated GIF images in READMEs; arbitrary <video> HTML
# is sanitized. These small previews link to the full, accessible /about players.
filter1="select='between(t,0,2)+between(t,13,15)+between(t,27,29)',setpts=N/30/TB,fps=8,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3"
run(['-i',OUT/'boat-sim-feature-40s.mp4','-filter_complex',filter1,'-loop','0',OUT/'feature-preview.gif'])
filter2="select='between(t,0,2)+between(t,6,8)+between(t,12,14)',setpts=N/30/TB,fps=8,scale=180:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3"
run(['-i',OUT/'boat-sim-short-15s.mp4','-filter_complex',filter2,'-loop','0',OUT/'short-preview.gif'])

def timestamp(seconds):
    return f'00:{int(seconds)//60:02}:{int(seconds)%60:02}.000'

def captions(items,dest):
    time=0;lines=['WEBVTT','']
    for duration,title,subtitle in items:
        lines.extend([f'{timestamp(time)} --> {timestamp(time+duration)}',('[Upbeat instrumental music]\n' if time==0 else '')+title.replace('\n',' '),subtitle.replace('\n',' '),''])
        time+=duration
    dest.write_text('\n'.join(lines))

captions([(s['duration'],s['title'],s['sub']+(' Take the helm at boat-sim.vercel.app.' if s.get('end') else '')) for s in SCENES],OUT/'feature-en.vtt')
captions([(duration,title,subtitle+(' Take the helm at boat-sim.vercel.app.' if i==9 else '')) for i,duration,title,subtitle in CUTS],OUT/'short-en.vtt')
print('Posters, motion previews, social card, and captions complete.',flush=True)
