'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import SchoolMark from './SchoolMark';
import { schoolIdentity } from './identity';
import { scenePose } from './scene-motion';

/** One renderer for the entire hero-to-ranking scroll sequence. */
export default function LogoScene() {
  const host = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const [isPaused, setPaused] = useState(false);
  useEffect(() => {
    const element = host.current!;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); }
    catch { element.dataset.fallback = 'true'; return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.25 : 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .95;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
    camera.position.set(0, 1.9, 10);
    camera.lookAt(0, .2, 0);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, .04);
    scene.environment = environment.texture;
    room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xdceeff, 0x607487, 2));
    const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(-3, 5, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0xd5eaff, 1.5); rim.position.set(4, 1, -2); scene.add(rim);
    const logo = new THREE.Group(); scene.add(logo);
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    let texture: THREE.Texture | undefined;
    let alive = true, frame = 0, elapsed = 0, previous = 0, visible = true;
    const waterGeometry = new THREE.PlaneGeometry(70, 70, 128, 128); geometries.push(waterGeometry);
    const wave = `float heightAt(vec2 p){float r=length(p); return sin(r*4.4-uTime*1.15)*.065*exp(-r*.12)+sin(r*2.1-uTime*.7)*.018;}`;
    const waterMaterial = new THREE.ShaderMaterial({ transparent: true, uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: `uniform float uTime; varying vec3 vWorld; ${wave}
      void main(){vec3 p=position;p.z=heightAt(p.xy);vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader: `uniform float uTime; uniform float uFade; varying vec3 vWorld; ${wave}
      void main(){vec2 p=vec2(vWorld.x,-vWorld.z);float r=length(p);float e=.035;
      float dx=(heightAt(p+vec2(e,0.))-heightAt(p-vec2(e,0.)))/(2.*e);
      float dz=(heightAt(p+vec2(0.,e))-heightAt(p-vec2(0.,e)))/(2.*e);
      vec3 normal=normalize(vec3(-dx,1.,dz));vec3 view=normalize(cameraPosition-vWorld);
      vec3 reflection=reflect(-view,normal);float fresnel=pow(1.-max(dot(normal,view),0.),3.);
      vec3 color=mix(vec3(.19,.34,.47),vec3(.49,.64,.74),fresnel);
      float strip=pow(max(0.,1.-abs(reflection.y-.25)),35.);
      float highlight=pow(max(dot(reflection,normalize(vec3(-.4,.7,.5))),0.),44.);
      color+=vec3(.38,.44,.48)*strip*.48+vec3(.6)*highlight*.45;
      color*=1.-exp(-dot(p,p)*1.1)*.28;
      color=mix(color,vec3(.47,.61,.71),smoothstep(8.,25.,r));
      gl_FragColor=vec4(color,(1.-smoothstep(24.,34.,r))*uFade);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }` });
    materials.push(waterMaterial);
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2; water.position.y = -.85; scene.add(water);

    // Trace the actual image alpha boundary; never replace the school crest with a generic shape.
    new THREE.TextureLoader().load(schoolIdentity.logoSrc!, loaded => {
      if (!alive) { loaded.dispose(); return; }
      texture = loaded; texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      const sampling = document.createElement('canvas'); sampling.width = sampling.height = 256;
      const ctx = sampling.getContext('2d')!; ctx.drawImage(loaded.image, 0, 0, 256, 256);
      const pixels = ctx.getImageData(0, 0, 256, 256).data;
      const left: THREE.Vector2[] = [], right: THREE.Vector2[] = [];
      for (let y = 0; y < 256; y += 3) {
        let lo = -1, hi = -1;
        for (let x = 0; x < 256; x++) if (pixels[(y * 256 + x) * 4 + 3] > 180) { if (lo < 0) lo = x; hi = x; }
        if (lo >= 0) { left.push(new THREE.Vector2((lo / 256 - .5) * 2.5, (.5 - y / 256) * 2.5)); right.push(new THREE.Vector2((hi / 256 - .5) * 2.5, (.5 - y / 256) * 2.5)); }
      }
      const outline = new THREE.Shape([...left, ...right.reverse()]);
      const solid = new THREE.ExtrudeGeometry(outline, { depth: .12, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .012, bevelThickness: .015 });
      const metal = new THREE.MeshStandardMaterial({ color: 0xbad5e9, metalness: .95, roughness: .19 });
      const enamel = new THREE.MeshPhysicalMaterial({ map: texture, transparent: true, alphaTest: .1, roughness: .35, metalness: .08, clearcoat: 1, clearcoatRoughness: .17 });
      const faceGeometry = new THREE.PlaneGeometry(2.5, 2.5);
      const front = new THREE.Mesh(faceGeometry, enamel); front.position.z = .14;
      const back = new THREE.Mesh(faceGeometry, enamel); back.rotation.y = Math.PI; back.position.z = -.02;
      logo.add(new THREE.Mesh(solid, metal), front, back);
      geometries.push(solid, faceGeometry); materials.push(metal, enamel);
      element.dataset.ready = 'true'; render();
    }, undefined, () => { element.dataset.fallback = 'true'; renderer.domElement.hidden = true; });
    function render() {
      const parent = element.closest('.vkw-journey') as HTMLElement;
      const scroll = -parent.getBoundingClientRect().top;
      const sections = Array.from(parent.querySelectorAll<HTMLElement>('[data-scene-stop]'));
      const anchors = sections.map(section => section.offsetTop);
      const mobile = element.clientWidth < 700;
      const pose = scenePose(scroll, anchors, mobile);
      const moving = !motion.matches;
      const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 10;
      // Screen-space framing instead of fixed world X positions that crop on narrow displays.
      logo.position.set(pose.x * viewHeight * camera.aspect, .2 + (.5 - pose.y) * viewHeight + (moving ? Math.sin(elapsed * 1.2) * .065 : 0), 0);
      logo.rotation.set(.015, moving ? pose.turn + Math.sin(elapsed * .5) * .12 : 0, moving ? Math.sin(elapsed * .4) * .015 : 0);
      logo.scale.setScalar(pose.scale);
      waterMaterial.uniforms.uTime.value = elapsed; waterMaterial.uniforms.uFade.value = pose.water;
      const fallback = element.querySelector<HTMLElement>('.vkw-fallback');
      if (fallback) { fallback.style.left = `${(pose.x + .5) * 100}%`; fallback.style.top = `${pose.y * 100}%`; fallback.style.width = `${pose.scale * 2.5 / viewHeight * element.clientHeight}px`; }
      renderer.render(scene, camera);
      element.dataset.progress = pose.progress.toFixed(3);
      element.dataset.logoX = pose.x.toFixed(3);
    }
    function tick(now: number) {
      frame = 0;
      if (!alive || !visible || document.hidden) return;
      if (previous && !paused.current && !motion.matches) elapsed += Math.min((now - previous) / 1000, .05);
      previous = now; render();
      if (!paused.current && !motion.matches) frame = requestAnimationFrame(tick);
    }
    function wake() { if (!frame && alive && visible && !document.hidden) { previous = 0; frame = requestAnimationFrame(tick); } }
    function resize() { renderer.setSize(element.clientWidth, element.clientHeight); camera.aspect = element.clientWidth / element.clientHeight; camera.updateProjectionMatrix(); wake(); }
    function contextLost(event: Event) { event.preventDefault(); element.dataset.fallback = 'true'; delete element.dataset.ready; cancelAnimationFrame(frame); frame = 0; }
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake(); else { cancelAnimationFrame(frame); frame = 0; } }); observer.observe(element);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('vokasi-motion', wake);
    document.addEventListener('visibilitychange', wake); motion.addEventListener('change', wake);
    resize();
    return () => {
      alive = false; cancelAnimationFrame(frame); resizeObserver.disconnect(); observer.disconnect();
      window.removeEventListener('scroll', wake); window.removeEventListener('vokasi-motion', wake);
      document.removeEventListener('visibilitychange', wake); motion.removeEventListener('change', wake);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); texture?.dispose(); environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <><div className="vkw-canvas" ref={host} role="img" aria-label="Logo SMKN 1 Singosari tiga dimensi di atas riak air biru"><div className="vkw-fallback"><SchoolMark /></div></div>
    <button type="button" className="vkw-motion" aria-pressed={isPaused} onClick={() => { paused.current = !paused.current; setPaused(paused.current); window.dispatchEvent(new Event('vokasi-motion')); }}>{isPaused ? 'Putar animasi' : 'Jeda animasi'} <span aria-hidden="true">{isPaused ? '▷' : 'Ⅱ'}</span></button></>;
}
