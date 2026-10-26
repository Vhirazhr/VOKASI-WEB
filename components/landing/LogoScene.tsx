'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import SchoolMark from './SchoolMark';
import { schoolIdentity } from './identity';

/** One renderer for the entire hero-to-introduction scroll sequence. */
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
    renderer.toneMappingExposure = 1.15;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 60);
    camera.position.set(0, 2.6, 9);
    camera.lookAt(0, 0, 0);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, .04);
    scene.environment = environment.texture;
    room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xdceeff, 0x283d68, 3));
    const key = new THREE.DirectionalLight(0xffffff, 4); key.position.set(-3, 5, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0x87c7ff, 3); rim.position.set(4, 1, -2); scene.add(rim);
    const logo = new THREE.Group(); scene.add(logo);
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    let texture: THREE.Texture | undefined;
    let alive = true, frame = 0, elapsed = 0, previous = 0, visible = true;
    const waterGeometry = new THREE.PlaneGeometry(35, 35, 1, 1); geometries.push(waterGeometry);
    const waterMaterial = new THREE.ShaderMaterial({ transparent: true, uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uFade;
      void main(){vec2 p=(vUv-.5)*35.; float r=length(p); float phase=r*5.3-uTime*1.4;
      float wave=sin(phase)*exp(-r*.14); float secondary=sin(r*2.7-uTime*.6)*.15;
      float light=pow(max(0.,cos(phase)*.5+.5),9.)*exp(-r*.09);
      vec3 color=mix(vec3(.12,.30,.50),vec3(.51,.72,.88),.54+wave*.23+secondary);
      color+=vec3(.37,.50,.61)*light*.45;
      float shadow=exp(-dot(p,p)*1.4); color*=1.-shadow*.55;
      float alpha=(1.-smoothstep(8.,17.,r))*uFade;
      gl_FragColor=vec4(color,alpha);}` });
    materials.push(waterMaterial);
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2; water.position.y = -1.35; scene.add(water);

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
      const progress = THREE.MathUtils.clamp(-parent.getBoundingClientRect().top / Math.max(1, parent.offsetHeight - innerHeight), 0, 1);
      const ease = progress * progress * (3 - 2 * progress);
      const mobile = element.clientWidth < 700;
      const moving = !motion.matches;
      logo.position.set(mobile ? 0 : -ease * 2.0, (mobile ? .55 : .35) + (moving ? Math.sin(elapsed * 1.3) * .16 : 0) + ease * (mobile ? .85 : .05), 0);
      logo.rotation.set(.03 + (moving ? Math.sin(elapsed * .6) * .06 : 0), moving ? Math.sin(elapsed * .55) * .38 + ease * Math.PI * 2 : 0, moving ? Math.sin(elapsed * .4) * .035 : 0);
      const scale = (mobile ? .75 : 1) * (1 - ease * (mobile ? .43 : .16)); logo.scale.setScalar(scale);
      waterMaterial.uniforms.uTime.value = elapsed; waterMaterial.uniforms.uFade.value = 1 - ease;
      renderer.render(scene, camera);
      element.dataset.progress = progress.toFixed(2);
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
