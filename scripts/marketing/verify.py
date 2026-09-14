"""Validate the shipped media's formats, decode, captions, and fast-start layout."""
from pathlib import Path
import json
import re
import subprocess

media=Path('public/media')
for filename,duration,width,height,captions in [
    ('boat-sim-feature-40s.mp4',40,1920,1080,'feature-en.vtt'),
    ('boat-sim-short-15s.mp4',15,1080,1920,'short-en.vtt'),
]:
    file=media/filename
    data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(file)]))
    video=next(s for s in data['streams'] if s['codec_type']=='video')
    audio=next(s for s in data['streams'] if s['codec_type']=='audio')
    assert abs(float(data['format']['duration'])-duration)<.05, filename
    assert (video['width'],video['height'])==(width,height), filename
    assert video['codec_name']=='h264' and video['pix_fmt']=='yuv420p', filename
    assert video['r_frame_rate']=='30/1', filename
    assert audio['codec_name']=='aac' and audio['channels']==2, filename
    assert int(video['nb_frames'])==duration*30, filename
    content=file.read_bytes()
    assert 0<content.find(b'moov')<content.find(b'mdat'), 'MP4 must support fast start'
    subprocess.run(['ffmpeg','-v','error','-i',str(file),'-f','null','-'],check=True)
    vtt=(media/captions).read_text()
    assert vtt.startswith('WEBVTT\n')
    cues=re.findall(r'(\d\d):(\d\d):(\d\d)\.000 --> (\d\d):(\d\d):(\d\d)\.000',vtt)
    end=0
    for cue in cues:
        h,m,s,hh,mm,ss=map(int,cue)
        start=h*3600+m*60+s
        assert start==end
        end=hh*3600+mm*60+ss
        assert end>start
    assert end==duration
    print(f'{filename}: {width}×{height}, {duration}s, {video["nb_frames"]} frames, H.264/AAC, captions, complete decode, fast start OK')

from PIL import Image
for file in media.glob('*.jpg'):
    with Image.open(file) as im:im.verify()
for file in media.glob('*.gif'):
    with Image.open(file) as im:
        assert im.n_frames>1
        print(f'{file.name}: {im.n_frames} animated frames')
with Image.open(media/'social-card.jpg') as im:assert im.size==(1200,630)
print('All release media passed.')
