"""Original instrumental score, synthesized from oscillators and seeded noise.
No recordings, samples, licensed loops, or third-party music. Python + NumPy.
"""
from pathlib import Path
import wave
import numpy as np

RATE = 44100
DURATION = 40
rng = np.random.default_rng(52)
audio = np.zeros((RATE * DURATION, 2), dtype=np.float64)

def add(start, signal, volume=1, pan=0):
    i = int(start * RATE)
    n = min(len(signal), len(audio)-i)
    if n <= 0: return
    signal = signal[:n] * volume
    audio[i:i+n, 0] += signal * np.sqrt((1-pan)/2)
    audio[i:i+n, 1] += signal * np.sqrt((1+pan)/2)

def tone(note, duration, pluck=False):
    t = np.arange(int(duration*RATE))/RATE
    f = 440*2**((note-69)/12)
    sound = sum(np.sin(2*np.pi*f*k*t)/(k*k) for k in range(1,5))
    env = (1-np.exp(-t*180)) * (np.exp(-t*5.5) if pluck else np.minimum(1,(duration-t)*8))
    return sound * env

# D / A / B minor / G, 120 BPM. One chord every two bars.
chords = [[50,57,62,66], [45,52,57,61], [47,54,59,62], [43,50,55,59]]
for bar in range(20):
    start = bar*2
    chord = chords[(bar//2)%4]
    if bar == 19: chord = chords[0]
    for note in chord[1:]:
        add(start, tone(note, 2.3)*np.minimum(np.arange(int(2.3*RATE))/RATE*3,1), .035, -.3 if note%2 else .3)
    for beat in range(4):
        t=np.arange(int(.28*RATE))/RATE
        kick=np.sin(2*np.pi*(45*t+1.8*(1-np.exp(-t*32))))*np.exp(-t*17)
        if bar < 19:
            add(start+beat*.5,kick,.34)
        add(start+beat*.5,tone(chord[0]-12,.43),.16)
    for beat in (1,3):
        t=np.arange(int(.17*RATE))/RATE
        noise=rng.normal(0,1,len(t)); noise=np.diff(noise,prepend=0)
        snare=(noise*.24+np.sin(2*np.pi*185*t)*.25)*np.exp(-t*25)
        if bar<19:add(start+beat*.5,snare,.18,.06)
    for step in range(8):
        t=np.arange(int(.06*RATE))/RATE
        noise=rng.normal(0,1,len(t));hat=np.diff(noise,prepend=0)*np.exp(-t*85)
        if bar<19:add(start+step*.25,hat,.019 if step%2 else .013,(-1)**step*.35)
        note=chord[[1,2,3,2,1,3,2,3][step]]+12
        s=tone(note,.9,True)
        amp=.105 if bar>1 else .075
        add(start+step*.25,s,amp,(-1)**step*.22)
        add(start+step*.25+.375,s,amp*.20,(-1)**(step+1)*.5)
    if bar in (4,8,12,16):
        t=np.arange(int(.42*RATE))/RATE
        whoosh=rng.normal(0,1,len(t))*np.sin(np.pi*t/.42)**2
        # Soft, filtered transition breath.
        whoosh=np.convolve(whoosh,np.ones(35)/35,mode='same')
        add(start-.2,whoosh,.10)

# Subtle stereo room tail and smooth ends.
for delay,gain in [(int(.071*RATE),.07),(int(.113*RATE),.045)]:
    audio[delay:] += audio[:-delay,::-1]*gain
t=np.arange(len(audio))/RATE
env=np.minimum(t/.10,1)*np.minimum((DURATION-t)/1.3,1)
audio*=env[:,None]
audio=np.tanh(audio*1.25)
audio*=.84/max(1e-9,np.abs(audio).max())
out=Path('.release-media/score.wav');out.parent.mkdir(exist_ok=True)
with wave.open(str(out),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes((audio*32767).astype('<i2').tobytes())
print(out)
