import{__toESM as e,require_jsx_runtime as t,require_react as n}from"./main-Dy-UM9eE.js";import{gsapWithCSS as r}from"./gsap-BPhVdrHV.js";import{AmbientLight as i,BufferAttribute as a,BufferGeometry as o,Color as s,DataTexture as c,DirectionalLight as l,Group as u,HemisphereLight as d,InstancedMesh as f,LinearFilter as p,MathUtils as m,Matrix4 as h,Mesh as g,MeshBasicMaterial as ee,MeshPhysicalMaterial as te,PerspectiveCamera as ne,PlaneGeometry as re,RGBAFormat as ie,Raycaster as ae,RepeatWrapping as oe,Scene as se,ShaderMaterial as ce,Shape as le,ShapeGeometry as ue,SphereGeometry as de,Timer as fe,UnsignedByteType as pe,Vector2 as _,Vector3 as v,WebGLRenderer as y}from"./three.module-C943XWmT.js";var b=e(n(),1),x=72,me=.09,he=24,S=[{radius:1.17,tilt:.22,roll:.15,lamVel:1.6,arc:2.6,hue:145,hueSpan:62,width:.2},{radius:1.24,tilt:.38,roll:1.02,lamVel:-1.95,arc:3,hue:265,hueSpan:-78,width:.18},{radius:1.31,tilt:.3,roll:1.94,lamVel:2.3,arc:2.4,hue:25,hueSpan:84,width:.19},{radius:1.38,tilt:.46,roll:2.78,lamVel:-1.5,arc:3.2,hue:190,hueSpan:-54,width:.17}];function C(e,t,n){let r=Math.sin(t),i=Math.cos(t),a=e.radius*r,o=-e.radius*i*Math.sin(e.tilt),s=e.radius*i*Math.cos(e.tilt),c=Math.cos(e.roll),l=Math.sin(e.roll);return n.set(a*c-o*l,a*l+o*c,s)}var w=new v,T=new v,E=new v,D=new v,O=new v,k=new s;function ge(){let e=new u,t=[],n=[];for(let e=0;e<x-1;e+=1){let t=e*2,r=e*2+1,i=e*2+2,a=e*2+3;n.push(t,r,i,r,a,i)}for(let r of S){let i=new Float32Array(x*2*3),s=new Float32Array(x*2*3),c=new o;c.setAttribute(`position`,new a(i,3)),c.setAttribute(`color`,new a(s,3)),c.setIndex(n),c.setDrawRange(0,0);let l=new ee({vertexColors:!0,transparent:!0,opacity:0,depthWrite:!1,side:2}),u=new g(c,l);u.frustumCulled=!1,u.renderOrder=3,e.add(u),t.push({...r,lam:0,history:[],mesh:u,geometry:c,material:l,positions:i,colors:s})}e.visible=!1;function r(e){let t=e.history,n=t.length?t[t.length-1].lam:e.lam,r=e.lam-n,i=Math.min(Math.ceil(Math.abs(r)/me),he);for(let a=1;a<=i;a+=1){let o=n+r*a/i;t.push({position:C(e,o,new v),lam:o})}for(t.length||t.push({position:C(e,e.lam,new v),lam:e.lam});t.length>2&&Math.abs(e.lam-t[0].lam)>e.arc;)t.shift();t.length>x&&t.splice(0,t.length-x)}function i(e,t,n){let r=e.history,i=r.length;if(i<2){e.geometry.setDrawRange(0,0);return}let{positions:a,colors:o}=e;for(let s=0;s<i;s+=1){let c=r[s].position;w.copy(r[Math.max(s-1,0)].position),T.copy(r[Math.min(s+1,i-1)].position),E.subVectors(T,w),E.lengthSq()<1e-12&&E.set(1,0,0),E.normalize(),D.subVectors(t,c).normalize(),O.crossVectors(E,D),O.lengthSq()<1e-12&&O.set(0,1,0),O.normalize();let l=i>1?s/(i-1):1,u=e.width*(.5+.5*l)*n/2,d=s*6;a[d]=c.x+O.x*u,a[d+1]=c.y+O.y*u,a[d+2]=c.z+O.z*u,a[d+3]=c.x-O.x*u,a[d+4]=c.y-O.y*u,a[d+5]=c.z-O.z*u;let f=((e.hue+l*e.hueSpan)%360+360)%360;k.setHSL(f/360,.56,.56+.11*l),o[d]=k.r,o[d+1]=k.g,o[d+2]=k.b,o[d+3]=k.r,o[d+4]=k.g,o[d+5]=k.b}e.geometry.setDrawRange(0,(i-1)*6),e.geometry.getAttribute(`position`).needsUpdate=!0,e.geometry.getAttribute(`color`).needsUpdate=!0}let s=0;return{group:e,update(e,n){for(let a of t)a.lam+=a.lamVel*e,r(a),i(a,n,s)},setIntensity(e){s=e;for(let n of t)n.material.opacity=e},dispose(){for(let e of t)e.geometry.dispose(),e.material.dispose(),e.history.length=0}}}var _e={hop:.62,shake:.5},A=.16,j=.14,M=.18,N=.82,P=.2,ve=2.5,ye=.05,be={lift:0,yaw:0,squashY:1};function xe(e){if(e<M)return 1-j*Math.sin(e/M*Math.PI);if(e>N)return 1-j*Math.sin((e-N)/(1-N)*Math.PI);let t=(e-M)/(N-M);return 1+j*.6*Math.sin(t*Math.PI)}function Se(e,t){let n=Math.min(Math.max(t,0),1);return n>=1?be:e===`hop`?{lift:Math.sin(Math.PI*n)*A,yaw:0,squashY:xe(n)}:{lift:-Math.sin(Math.PI*n)*ye,yaw:Math.sin(n*Math.PI*2*ve)*P*(1-n),squashY:1}}function Ce(e){return 1/Math.sqrt(Math.max(e,.05))}function we(e,t,n){if(t<=1)return 0;let r=Math.min(Math.floor(n*t),t-1);return r===e?(r+1)%t:r}var Te=5e-4,F=.005,Ee=1/120,De=1/15,Oe=8;function ke(e,t,n=1){let r=2*Math.PI*Math.max(e,.01);return{stiffness:r*r*n,damping:2*Math.max(t,0)*r*n,mass:n}}var Ae={eye:ke(3.2,.72),body:ke(2.2,.5),head:ke(1.6,.85)};function je(e=0){return{value:e,velocity:0}}function Me(e,t){e.value=t,e.velocity=0}function Ne(e){return e.restDelta??Te}function I(e){return e.restSpeed??F}function Pe(e,t,n){return Math.abs(t-e.value)<Ne(n)&&Math.abs(e.velocity)<I(n)}function Fe(e,t,n,r){if(!(r>0))return Pe(e,t,n);let{stiffness:i,damping:a,mass:o}=n,s=o>0?1/o:1,c=Math.min(r,De),l=Math.min(Math.ceil(c/Ee),Oe),u=c/l;for(let n=0;n<l;n+=1){let n=(-i*(e.value-t)-a*e.velocity)*s;e.velocity+=n*u,e.value+=e.velocity*u}return Pe(e,t,n)?(e.value=t,e.velocity=0,!0):!1}function L(e,t,n,r){return r>0?t+(e-t)*Math.exp(-Math.max(n,0)*r):e}function R(e,t=60){return-Math.log(1-Math.min(Math.max(e,0),.999))*t}var Ie=.09,z=.18,Le=.02,B={open:{min:0,max:1.28},curve:{min:-.62,max:.62},slant:{min:-.6,max:.6},width:{min:.6,max:1.3},height:{min:.6,max:1.22}},Re=.52,ze=1.62,Be=`
varying vec2 vLocal;

void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,Ve=`
precision highp float;

uniform vec3 uColor;
uniform float uOpacity;
uniform float uOpen;
uniform float uCurve;
uniform float uSlant;
uniform float uWidth;
uniform float uHeight;

varying vec2 vLocal;

const float BASE_HALF_WIDTH = ${Ie};
const float BASE_HALF_HEIGHT = ${z};
const float LID_THICKNESS = ${Le};

/** 眼睛的距离场：负为内部，正为外部。 */
float eyeDistance(vec2 p) {
  float halfW = BASE_HALF_WIDTH * max(uWidth, 0.001);
  float t = clamp(p.x / halfW, -1.0, 1.0);
  // 眼睑中心线：curve 给眉眼弧度，slant 给 > < 的斜势
  float arch = max(1.0 - t * t, 0.0);
  float center = (uCurve * arch + uSlant * t) * BASE_HALF_HEIGHT;
  float halfH = uOpen * uHeight * BASE_HALF_HEIGHT + LID_THICKNESS;
  // 圆角半径参考原胶囊：r = min(w, h * 0.6)，这样睁眼时两端是圆的，
  // 闭眼时因为 halfH 很小半径也变得很小，变成一条可见的细线
  float radius = min(halfW, halfH * 0.6);
  vec2 q = vec2(abs(p.x), abs(p.y - center)) - vec2(halfW, halfH) + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  float d = eyeDistance(vLocal);
  // 用屏幕空间导数做抗锯齿，缩放时边缘始终平滑
  float aa = max(fwidth(d), 1e-4);
  float alpha = (1.0 - smoothstep(-aa, aa, d)) * uOpacity;
  // 透明像素直接丢弃：眼睛是贴在球面上的平面，
  // 不丢弃会与球体、绒毛争抢透明排序并产生边缘脏边
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;function He(e){return{uColor:{value:e},uOpacity:{value:1},uOpen:{value:1},uCurve:{value:0},uSlant:{value:0},uWidth:{value:1},uHeight:{value:1}}}function V(e,t,n){return e<t?t:e>n?n:e}function Ue(e,t){e.uOpen.value=V(t.open,B.open.min,B.open.max),e.uCurve.value=V(t.curve,B.curve.min,B.curve.max),e.uSlant.value=V(t.slant,B.slant.min,B.slant.max),e.uWidth.value=V(t.width,B.width.min,B.width.max),e.uHeight.value=V(t.height,B.height.min,B.height.max)}function We(e,t){for(let n=0;n<2;n+=1){let r=n*7,i=t.eyes[n];e[r]=i.open,e[r+1]=i.curve,e[r+2]=i.slant,e[r+3]=i.width,e[r+4]=i.height,e[r+5]=i.rotationZ,e[r+6]=i.offsetY}return e[14]=t.body.squashY,e[15]=t.body.lift,e[16]=t.body.tilt,e}function Ge(e,t,n){let r=t*7;return n.open=e[r],n.curve=e[r+1],n.slant=e[r+2],n.width=e[r+3],n.height=e[r+4],n.rotationZ=e[r+5],n.offsetY=e[r+6],n}function Ke(e,t){return t.squashY=e[14],t.lift=e[15],t.tilt=e[16],t}function qe(){return new Float32Array(17)}var Je={open:1,curve:0,slant:0,width:1,height:1,rotationZ:0,offsetY:0},Ye={squashY:1,lift:0,tilt:0};function H(e,t,n={}){return{eyes:[{...Je,...e},{...Je,...t}],body:{...Ye,...n}}}function U(e,t={}){return H(e,e,t)}var Xe={neutral:U({}),thinking:H({open:.72,curve:.05,rotationZ:-.04},{open:.62,curve:.05,rotationZ:.04,offsetY:.02},{tilt:.05}),success:U({open:.3,curve:.55,width:1.05,height:.9,offsetY:.025}),error:H({open:.58,slant:-.3,rotationZ:.48,offsetY:-.025},{open:.58,slant:.3,rotationZ:-.48,offsetY:-.025}),sleepy:U({open:.22,curve:-.18,width:1.1,height:.85},{squashY:.97,lift:-.02,tilt:.08}),sleep:U({open:0,curve:-.12,width:1.05},{squashY:.94,lift:-.04,tilt:.06}),wake:U({open:1.2,curve:.08,width:1.08,height:1.1},{lift:.04}),rest:U({open:.45,curve:-.05,width:1.02},{squashY:.98,lift:-.01,tilt:.04}),remind:U({open:1.05,width:1.08,height:1.05,offsetY:.03},{squashY:1.02,lift:.02,tilt:-.03}),excited:U({open:1.15,curve:.3,width:1.1,height:1.15},{squashY:1.06,lift:.05}),surprised:U({open:1.25,width:1.25,height:1.2},{squashY:1.08,lift:.03}),suspicious:H({open:.85,slant:-.35,width:.95,height:.9,rotationZ:-.15},{open:1.05,width:1.02,height:1.02},{tilt:-.07}),angry:H({open:.6,slant:-.45,rotationZ:.3,width:.95},{open:.6,slant:.45,rotationZ:-.3,width:.95},{squashY:.96,lift:-.02})},W={sleep:{id:`sleep`,duration:1/0,priority:60,keyframes:[{at:0,expression:`sleep`}]},wake:{id:`wake`,duration:1.1,priority:70,keyframes:[{at:0,expression:`wake`},{at:.45,expression:`neutral`}]},rest:{id:`rest`,duration:1/0,priority:40,keyframes:[{at:0,expression:`rest`}]},remind:{id:`remind`,duration:1.4,priority:80,keyframes:[{at:0,expression:`remind`},{at:.7,expression:`neutral`}]},excited:{id:`excited`,duration:1.2,priority:90,keyframes:[{at:0,expression:`excited`},{at:.6,expression:`neutral`}]},surprised:{id:`surprised`,duration:1,priority:85,keyframes:[{at:0,expression:`surprised`},{at:.55,expression:`neutral`}]},suspicious:{id:`suspicious`,duration:1.6,priority:75,keyframes:[{at:0,expression:`suspicious`},{at:1,expression:`neutral`}]},angry:{id:`angry`,duration:1.5,priority:88,keyframes:[{at:0,expression:`angry`},{at:.9,expression:`neutral`}]},sleepy:{id:`sleepy`,duration:1/0,priority:45,keyframes:[{at:0,expression:`sleepy`}]}};function Ze(){return{clipId:null,elapsed:0,priority:0}}function Qe(e){return e.clipId?e.elapsed>=W[e.clipId].duration:!0}function G(e,t){let n=W[t];return!e.clipId||Qe(e)?!0:n.priority>e.priority}function $e(e,t){e.clipId=t,e.elapsed=0,e.priority=W[t].priority}function et(e,t){return G(e,t)?($e(e,t),!0):!1}function K(e){e.clipId=null,e.elapsed=0,e.priority=0}function tt(e,t){e.clipId&&(e.elapsed+=t,e.elapsed>=W[e.clipId].duration&&K(e))}var nt=new Set([`sleep`,`sleepy`,`rest`]);function rt(e){return e.clipId!==null&&nt.has(e.clipId)}function it(e,t){if(!e.clipId)return Xe[t];let n=W[e.clipId],r=n.keyframes[0];for(let t of n.keyframes)t.at<=e.elapsed&&(r=t);return Xe[r.expression]}function at(e,t,n){return We(n,it(e,t))}var ot=t(),st=1,ct=.42,lt=.04,ut=.12,dt=R(.12),ft=2.2,pt=5.5,mt=.13,ht=30,gt=60,_t=250,vt=320,yt=900,bt=R(.2),xt=.8,St=1.4,Ct=48,wt=.22,q=128,Tt=1.5,Et=.72,Dt=90,Ot=11,J=.002,kt=[[-.34,.2],[.28,.3],[.16,-.04],[-.16,.34],[.04,.1]],At=2600,jt=1.8,Mt=3.4,Nt=R(.06),Pt=[[-.62,.12],[.58,.2],[.3,-.3],[-.4,-.22],[.1,.42],[-.12,-.36]],Ft=6,It=11,Lt=1.3,Rt=.09,zt=R(.05),Bt=.012,Vt=.18,Ht=.22,Ut=.12,Wt={idle:`neutral`,thinking:`thinking`,success:`success`,error:`error`},Gt={thinking:8300287,success:5752738,error:14254722},Kt=11056127,qt={dark:{body:15330030,eyes:1710623,emissive:9081855,roughness:.62,metalness:0,clearcoat:0,clearcoatRoughness:.5,opacity:1,rimLightIntensity:0,hoverEmissiveIntensity:.32,hoverKeyLightIntensity:1.9,shadow:0,shadowOpacity:.08,statusEmissiveIntensity:.12,statusRimBoost:.16},light:{body:8752280,eyes:16251388,emissive:11187398,roughness:.55,metalness:.12,clearcoat:.08,clearcoatRoughness:.62,opacity:1,rimLightIntensity:.35,hoverEmissiveIntensity:.06,hoverKeyLightIntensity:1.6,shadow:5857905,shadowOpacity:.12,statusEmissiveIntensity:.09,statusRimBoost:.1}};function Jt(){let e=new Uint8Array(q*q*4),t=(e,t,n)=>{let r=Math.imul(e+1,374761393)^Math.imul(t+1,668265263)^n;return r=Math.imul(r^r>>>13,1274126177),((r^r>>>16)>>>0)/4294967295};for(let n=0;n<q;n+=1)for(let r=0;r<q;r+=1){let i=(n*q+r)*4,a=t(r,n,5370206)>.52?.72+t(r,n,8342140)**.65*.28:0,o=t(r,n,10368889);e[i]=Math.round(a*255),e[i+1]=Math.round(o*255),e[i+2]=255,e[i+3]=255}let n=new c(e,q,q,ie,pe);return n.wrapS=oe,n.wrapT=oe,n.minFilter=p,n.magFilter=p,n.needsUpdate=!0,n}var Yt=`
uniform float uFurLength;
uniform vec2 uDragForce;

varying vec2 vFurUv;
varying vec3 vFurNormal;
varying float vFurLayer;

void main() {
  float shellScale = 1.0;
  vec4 shellPosition = vec4(position, 1.0);

  #ifdef USE_INSTANCING
    shellScale = length(instanceMatrix[0].xyz);
  #endif

  vFurLayer = clamp((shellScale - 1.0) / uFurLength, 0.0, 1.0);
  vec3 furDirection = normalize(normal + vec3(0.08, -0.2, 0.0));
  float strandHeight = length(position) * uFurLength * vFurLayer;
  vec3 dragDirection = vec3(-uDragForce.x, uDragForce.y, 0.0);
  vec3 dragBend = dragDirection * strandHeight * vFurLayer * ${Et.toFixed(2)};
  shellPosition = vec4(position + furDirection * strandHeight + dragBend, 1.0);
  vFurUv = uv;
  vFurNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * shellPosition;
}
`,Xt=`
uniform sampler2D uFurNoise;
uniform vec3 uFurColor;
uniform vec3 uGlowColor;
uniform float uNoiseScale;
uniform float uSmoothness;
uniform float uOpacity;
uniform float uGlow;

varying vec2 vFurUv;
varying vec3 vFurNormal;
varying float vFurLayer;

void main() {
  vec4 noiseSample = texture2D(uFurNoise, vFurUv * uNoiseScale);
  float strandLength = max(noiseSample.r, 0.02);
  float strandPosition = vFurLayer / strandLength;
  if (strandPosition >= 1.0) discard;

  float alpha = pow(1.0 - strandPosition, uSmoothness) * uOpacity;
  if (alpha < 0.02) discard;

  vec3 normal = normalize(vFurNormal);
  vec3 lightDirection = normalize(vec3(-0.48, 0.72, 1.0));
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float rim = pow(1.0 - abs(normal.z), 2.2);
  float variation = mix(0.94, 1.02, noiseSample.g);
  float rootShade = mix(0.72, 1.0, strandPosition * strandPosition);
  vec3 color = uFurColor * (0.72 + 0.25 * diffuse + 0.08 * rim) * variation * rootShade;
  color += uGlowColor * uGlow * (0.18 + 0.34 * rim);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;function Zt({loading:e=!1,status:t=`idle`,theme:n=`dark`,reduceMotion:a=!1,getDragForce:o,handleRef:c}){let p=(0,b.useRef)(null),ie=(0,b.useRef)({playClip:()=>!1}),oe=(0,b.useRef)(e),pe=(0,b.useRef)(t),v=(0,b.useRef)(0),x=(0,b.useRef)(n),me=(0,b.useRef)(a),he=(0,b.useRef)(o);return(0,b.useEffect)(()=>{oe.current=e},[e]),(0,b.useEffect)(()=>{pe.current!==t&&(pe.current=t,v.current=performance.now())},[t]),(0,b.useEffect)(()=>{x.current=n},[n]),(0,b.useEffect)(()=>{me.current=a},[a]),(0,b.useEffect)(()=>{he.current=o},[o]),(0,b.useEffect)(()=>{if(!c)return;let e=ie.current;return c.current=e,()=>{c.current===e&&(c.current=null)}},[c]),(0,b.useEffect)(()=>{let e=p.current;if(!e)return;let t=e.clientWidth||1,n=e.clientHeight||1,a=new se,o=new ne(35,t/n,.1,100);o.position.set(0,0,5);let c=new y({antialias:!0,alpha:!0});c.setPixelRatio(Math.min(window.devicePixelRatio,2)),c.setSize(t,n),e.appendChild(c.domElement);let b=x.current,S=qt[b],C=new d(16777215,2105384,1.05);a.add(C);let w=new l(16777215,1.4);w.position.set(-1.4,2.2,2.5),a.add(w);let T=new l(Kt,S.rimLightIntensity);T.position.set(2.4,.8,3),a.add(T);let E=new i(16777215,.18);a.add(E);let D=new u;a.add(D);let O=new te({color:S.body,roughness:S.roughness,metalness:S.metalness,clearcoat:S.clearcoat,clearcoatRoughness:S.clearcoatRoughness,specularIntensity:.62,emissive:new s(S.emissive),emissiveIntensity:0,transparent:!1,depthWrite:!0}),k=new g(new de(st,64,64),O);k.renderOrder=1,D.add(k);let A=Jt(),j=new de(st,48,32),M={uFurNoise:{value:A},uFurColor:{value:new s(S.body)},uGlowColor:{value:new s(S.emissive)},uFurLength:{value:wt},uDragForce:{value:new _(0,0)},uNoiseScale:{value:Tt},uSmoothness:{value:.9},uOpacity:{value:1},uGlow:{value:0}},N=new ce({uniforms:M,vertexShader:Yt,fragmentShader:Xt,transparent:!0,depthWrite:!1}),P=new f(j,N,Ct),ve=new h;for(let e=0;e<Ct;e+=1){let t=1+wt*((e+1)/Ct);ve.makeScale(t,t,t),P.setMatrixAt(e,ve)}P.instanceMatrix.needsUpdate=!0,P.computeBoundingSphere(),P.renderOrder=2,D.add(P);let ye=new le;ye.absellipse(0,0,.58,.11,0,Math.PI*2,!1,0);let be=new ue(ye,32),xe=new ee({color:S.shadow,transparent:!0,opacity:S.shadowOpacity,depthWrite:!1}),Te=new g(be,xe);Te.position.set(0,-1.08,-.4),Te.renderOrder=-1,a.add(Te);let F=new u;D.add(F);let Ee=new s(S.eyes),De=new re(Re,ze),Oe=[],ke=[],Ne=[];for(let e of[-1,1]){let t=He(Ee),n=new ce({uniforms:t,vertexShader:Be,fragmentShader:Ve,transparent:!0,depthWrite:!1}),r=new g(De,n);r.position.set(e*.22,lt,st*1.01),r.renderOrder=4,F.add(r),Ne.push(r),Oe.push(t),ke.push(n)}let I=new _(0,0),Pe=new _(0,0),R=new _(0,0),Ie=new _(0,0),z=!1,Le=0,B=0,V=-1,Je=!1,Ye=pe.current,H=new ae,U=window.matchMedia(`(hover: hover) and (pointer: fine)`),W=e=>{if(!U.matches||me.current){I.set(0,0),z=!1;return}Le=performance.now();let t=c.domElement.getBoundingClientRect();e.clientX>=t.left&&e.clientX<=t.right&&e.clientY>=t.top&&e.clientY<=t.bottom?(Pe.x=(e.clientX-t.left)/t.width*2-1,Pe.y=-((e.clientY-t.top)/t.height)*2+1,H.setFromCamera(Pe,o),z=H.intersectObject(k,!1).length>0):z=!1;let n=t.left+t.width/2,r=t.top+t.height/2,i=Math.max(window.innerWidth*.5,1),a=Math.max(window.innerHeight*.5,1);I.x=m.clamp((e.clientX-n)/i,-1,1),I.y=m.clamp(-(e.clientY-r)/a,-1,1)},Qe=()=>{I.set(0,0),z=!1};window.addEventListener(`pointermove`,W),document.addEventListener(`pointerleave`,Qe),window.addEventListener(`blur`,Qe);let G=Ze(),$e=qe(),K=qe();We(K,Xe.neutral);let nt=Array.from({length:17},(e,t)=>je(K[t])),it=e=>e<14?Ae.eye:Ae.body,ot={open:1,curve:0,slant:0,width:1,height:1,rotationZ:0,offsetY:0},q={squashY:1,lift:0,tilt:0},Et=ie.current;Et.playClip=e=>et(G,e);let Zt=1,Qt=ft,Y=-1,$t=-1,en=0,tn=!1,nn=e=>{Y=e,$t=!tn&&Math.random()<Ut?Math.random()<.5?0:1:-1},rn=e=>{if(en>0){--en,tn=!0,Qt=e+Ht;return}tn=!1,en=+(Math.random()<Vt),Qt=e+ft+Math.random()*(pt-ft)},an=0,on=0,sn=0,cn=m.randFloat(Ft,It),X=null,ln=0,Z=null,un=!1,dn={val:0},fn=null,pn=0,mn=1,hn=0,gn=new s(S.emissive),_n=new s(Kt),Q=new _(0,0),$=new _(0,0),vn=new fe,yn=0,bn=0,xn=e=>{if(yn=requestAnimationFrame(xn),document.hidden||document.documentElement.classList.contains(`canvas-interacting`))return;let t=!me.current,n=pe.current,i=t&&U.matches&&z,s=he.current?.(),l=t&&!!(s?.active||Q.lengthSq()>J*J||$.lengthSq()>J*J),u=1e3/(t&&(oe.current||i||l||Y>=0||X!==null||dn.val>.002||e-Le<_t||e-v.current<vt)?gt:ht),d=e-bn;if(d<u)return;bn=e-d%u,vn.update();let f=vn.getElapsed(),p=Math.min(d/1e3,1/30);if(tt(G,p),!t)Q.set(0,0),$.set(0,0),X=null;else{let e=s?.active?s.x:0,t=s?.active?s.y:0;$.x+=((e-Q.x)*Dt-$.x*Ot)*p,$.y+=((t-Q.y)*Dt-$.y*Ot)*p,Q.x+=$.x*p,Q.y+=$.y*p,!s?.active&&Q.lengthSq()<=J*J&&$.lengthSq()<=J*J&&(Q.set(0,0),$.set(0,0))}M.uDragForce.value.copy(Q),n!==Ye&&(R.set(0,0),Ie.set(0,0),V=-1,B=f,t&&n===`success`?(X=`hop`,ln=f):t&&n===`error`&&(X=`shake`,ln=f),Ye=n);let h=n===`thinking`,g=rt(G),ee=t&&(n===`idle`||h)&&!g,te=h?yt:At,ne=ee&&e-Le>=te;if(ne&&!Je&&(B=f),Je=ne,ne){let e=h?kt:Pt;if(f>=B){V=we(V,e.length,Math.random());let[t,n]=e[V];Ie.set(t,n),B=f+(h?m.randFloat(xt,St):m.randFloat(jt,Mt))}let t=h?bt:Nt;R.x=L(R.x,Ie.x,t,p),R.y=L(R.y,Ie.y,t,p)}let re=X?Se(X,(f-ln)/_e[X]):null;X&&f-ln>=_e[X]&&(X=null);let ie=x.current;if(ie!==b){b=ie;let e=qt[b];O.color.setHex(e.body),O.emissive.setHex(e.emissive),O.roughness=e.roughness,O.metalness=e.metalness,O.clearcoat=e.clearcoat,O.clearcoatRoughness=e.clearcoatRoughness,O.needsUpdate=!0,M.uFurColor.value.setHex(e.body),Ee.setHex(e.eyes),xe.color.setHex(e.shadow),xe.opacity=e.shadowOpacity,T.intensity=e.rimLightIntensity}let ae=(n===`idle`||h)&&!g,se=ne?R:I,ce=t&&ae?se.x:0,le=t&&ae?se.y:0,ue=t&&n===`idle`&&!g?I.x:0,de=t&&n===`idle`&&!g?I.y:0;t?(F.rotation.y=L(F.rotation.y,ce*ct,dt,p),F.rotation.x=L(F.rotation.x,-le*ct,dt,p),hn=L(hn,ue*ut,dt,p),D.rotation.x=L(D.rotation.x,-de*ut,dt,p)):(F.rotation.set(0,0,0),hn=0,D.rotation.x=0);let fe=0;t&&n===`idle`&&(f>=cn&&(on=(Math.random()<.5?-1:1)*m.randFloat(Rt*.5,Rt),sn=f+Lt,cn=sn+m.randFloat(Ft,It)),fe=f<sn?on:0),an=t?L(an,fe,zt,p):0;let _=t&&n===`idle`&&G.clipId===null;if(_?Y<0&&f>=Qt&&nn(f):(Zt=1,Y=-1,Qt=f+ft),_&&Y>=0){let e=(f-Y)/mt;Zt=e<1?1-e:Math.min(e-1,1),e>=2&&(Zt=1,Y=-1,rn(f))}at(G,Wt[n],$e);for(let e=0;e<Ne.length;e+=1){let t=$t<0||$t===e?Zt:1;$e[e*7]*=t}for(let e=0;e<17;e+=1){let n=$e[e];t?Fe(nt[e],n,it(e),p):Me(nt[e],n),K[e]=nt[e].value}for(let e=0;e<Ne.length;e+=1){let t=Ne[e];Ge(K,e,ot),Ue(Oe[e],ot),t.rotation.z=ot.rotationZ,t.position.y=lt+ot.offsetY}Ke(K,q),D.rotation.z=an+q.tilt,D.position.y=t?Math.sin(f*1.1)*.04+(re?.lift??0)+q.lift:0;let y=qt[b],S=oe.current,C=n!==`idle`,E=n===`idle`?y.emissive:Gt[n];gn.setHex(E),_n.setHex(C?E:Kt),O.emissive.lerp(gn,.14),T.color.lerp(_n,.14);let k=i?y.hoverEmissiveIntensity:C?y.statusEmissiveIntensity:0;O.emissiveIntensity=m.lerp(O.emissiveIntensity,k,.1),M.uGlowColor.value.copy(O.emissive),M.uGlow.value=O.emissiveIntensity,T.intensity=m.lerp(T.intensity,y.rimLightIntensity+(C?y.statusRimBoost:0),.1),w.intensity=m.lerp(w.intensity,i?y.hoverKeyLightIntensity:1.4,.1),mn=t?m.lerp(mn,i?1.015:1,.1):1,S&&!Z&&!un&&(un=!0,Z=ge(),Z.group.visible=!1,a.add(Z.group),un=!1),!t&&dn.val!==0&&(fn?.kill(),dn.val=0,pn=0);let A=t&&S&&Z?1:0;A!==pn&&(pn=A,fn?.kill(),fn=r.to(dn,{val:A,duration:1.1,ease:`power2.inOut`}));let j=dn.val;D.rotation.y=hn+(re?.yaw??0);let N=(t?1+Math.sin(f*1.1)*Bt:1)*(re?.squashY??1)*q.squashY,P=Ce(N);if(D.scale.set(mn*P,mn*N,mn*P),Z){let e=j>.002;Z.group.visible=e,Z.setIntensity(j),e&&t&&Z.update(p,o.position)}c.render(a,o)};yn=requestAnimationFrame(xn);let Sn=new ResizeObserver(()=>{let t=e.clientWidth||1,n=e.clientHeight||1;o.aspect=t/n,o.updateProjectionMatrix(),c.setSize(t,n)});return Sn.observe(e),()=>{cancelAnimationFrame(yn),Sn.disconnect(),window.removeEventListener(`pointermove`,W),document.removeEventListener(`pointerleave`,Qe),window.removeEventListener(`blur`,Qe),k.geometry.dispose(),O.dispose(),j.dispose(),N.dispose(),A.dispose(),be.dispose(),xe.dispose(),De.dispose();for(let e of ke)e.dispose();Et.playClip=()=>!1,fn?.kill(),Z&&=(a.remove(Z.group),Z.dispose(),null),c.dispose(),e.contains(c.domElement)&&e.removeChild(c.domElement)}},[]),(0,ot.jsx)(`div`,{ref:p,className:`h-full w-full cursor-pointer`})}export{Zt as default};