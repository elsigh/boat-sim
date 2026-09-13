/** Instanced billboards: alpha-shaped tongues of flame with a hot core and
 * cooler, turbulent edges. No per-frame texture uploads or React updates. */
export const FIRE_VERTEX = `
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = float(gl_InstanceID) * 3.791;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
  }
`;

export const FIRE_FRAGMENT = `
  varying vec2 vUv;
  varying float vSeed;
  uniform float uTime;
  uniform float uOpacity;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
  }
  void main() {
    vec2 p=vec2(vUv.x*2.-1.,vUv.y);
    float n=noise(vec2(p.x*4.+vSeed,p.y*6.-uTime*4.))*.65
      +noise(vec2(p.x*9.-vSeed,p.y*14.-uTime*7.))*.35;
    p.x += sin(p.y*7.-uTime*5.+vSeed)*.14*p.y;
    float width=mix(.64,.035,p.y);
    float edge=abs(p.x)/width+(n-.5)*1.3;
    float alpha=(1.-smoothstep(.45,1.15,edge))*smoothstep(0.,.1,p.y)*(1.-smoothstep(.7,1.,p.y));
    float core=clamp(1.-p.y*.85-abs(p.x)*.85+(n-.5)*.3,0.,1.);
    vec3 color=mix(vec3(.85,.055,.008),vec3(1.,.43,.035),smoothstep(.15,.65,core));
    color=mix(color,vec3(1.,.94,.62),smoothstep(.7,.98,core));
    gl_FragColor=vec4(color*1.35,alpha*uOpacity);
  }
`;
