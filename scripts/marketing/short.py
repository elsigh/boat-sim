"""Reframe selected takes from the finished 40-second edit into a vertical cut."""
from render import *

CUTS=[
    (0,3,'The last\n50 feet.','Practice the approach.\nFeel the boat.'),
    (1,3,'Two screws.\nYour call.','Port ahead. Starboard astern.'),
    (4,2,'Find your\nboat.','Seven profiles to explore.'),
    (5,2,'Find your\nboat.','A different kind of helm time.'),
    (7,2,'Try. Restart.\nRepeat.','One more try is the point.'),
    (9,3,'Your next\nberth.','Free in your browser.\nBuilt by a boater.'),
]
def render_short():
    # Confirm this is a cutdown, using the already-rendered feature's actual shot list.
    manifest=json.loads((WORK/'timeline.json').read_text())
    outputs=[]
    for i,(scene_index,duration,title,subtitle) in enumerate(CUTS,1):
        s=manifest[scene_index]
        dest=WORK/f'vertical-{i:02}.mp4'
        typefile=overlay(f'vertical-{i}',title,subtitle,s['tag'],i,vertical=True,end=s.get('end',False))
        vf=f"[0:v]setpts=(PTS-STARTPTS)/{s['speed']},scale=1920:1080,crop=608:1080:656:0,scale=1080:1920:flags=lanczos,setsar=1,fps=30,eq=contrast=1.035:saturation=1.13:brightness=-0.018[v];[v][1:v]overlay,format=yuv420p[out]"
        run(['-ss',s['start'],'-i',RAW/f"{s['source']}.webm",'-loop','1','-i',typefile,'-filter_complex',vf,'-map','[out]','-an','-t',duration,'-r','30','-c:v','libx264','-preset','fast','-crf','20',dest])
        outputs.append(dest);print(dest.name,flush=True)
    listing=WORK/'short-concat.txt';listing.write_text(''.join(f"file '{p.name}'\n" for p in outputs))
    run(['-f','concat','-safe','0','-i',listing,'-i',ROOT/'.release-media/score.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-af','afade=t=out:st=14:d=1,loudnorm=I=-16:TP=-1.5:LRA=9','-t','15','-movflags','+faststart',OUT/'boat-sim-short-15s.mp4'])
    print('Vertical cut complete.',flush=True)


if __name__ == "__main__":
    render_short()
