'use client';

import { useEffect, useRef, useState } from 'react';
import SchoolMark from './SchoolMark';
import { RankingPodium, RankingCaption, useLandingRanking } from './RankingPodium';

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/** Six CSS planes form a solid plaque. Artwork stays intact on its front face. */
export default function LogoScene() {
  const stage = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<'ranking' | 'logo'>('ranking');
  const ranking = useLandingRanking();

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, last = 0, time = 0, lastInput = 0;
    let targetX = 0, targetY = 0, x = 0, y = 0, hover = 0, targetHover = 0;
    let pointer: number | null = null, startX = 0, startY = 0;
    let dragX = 0, dragY = 0, originX = 0, originY = 0;
    const enabled = () => !paused && !media.matches;
    const reset = () => { targetX = targetY = dragX = dragY = targetHover = 0; };
    const release = () => {
      if (pointer !== null && element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
      pointer = null;
      element.removeAttribute('data-dragging');
      reset();
    };
    const move = (event: PointerEvent) => {
      if (!enabled()) return;
      lastInput = performance.now();
      if (pointer !== null) {
        if (event.pointerId !== pointer) return;
        dragY = clamp(originY + (event.clientX - startX) * .14, 26);
        dragX = clamp(originX - (event.clientY - startY) * .14, 20);
      } else if (event.pointerType === 'mouse') {
        targetY = clamp((event.clientX / window.innerWidth - .5) * 18, 9);
        targetX = clamp((.5 - event.clientY / window.innerHeight) * 12, 6);
      }
    };
    const down = (event: PointerEvent) => {
      if (!enabled() || pointer !== null || !event.isPrimary || event.button !== 0) return;
      pointer = event.pointerId;
      startX = event.clientX; startY = event.clientY;
      originX = x; originY = y;
      dragX = x; dragY = y;
      element.setPointerCapture(pointer);
      element.setAttribute('data-dragging', 'true');
      lastInput = performance.now();
    };
    const enter = () => { targetHover = enabled() ? 1 : 0; };
    const leave = () => { targetHover = 0; };
    const key = (event: KeyboardEvent) => {
      if (!enabled() || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault();
      lastInput = performance.now();
      if (event.key === 'Home') reset();
      if (event.key === 'ArrowLeft') targetY = clamp(targetY - 6, 26);
      if (event.key === 'ArrowRight') targetY = clamp(targetY + 6, 26);
      if (event.key === 'ArrowUp') targetX = clamp(targetX - 6, 20);
      if (event.key === 'ArrowDown') targetX = clamp(targetX + 6, 20);
    };
    const draw = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, .05) : 0;
      last = now;
      time += dt;
      if (pointer === null && now - lastInput > 1100) { targetX = targetY = 0; }
      const ease = 1 - Math.exp(-7 * dt);
      x += ((pointer !== null ? dragX : targetX) - x) * ease;
      y += ((pointer !== null ? dragY : targetY) - y) * ease;
      hover += (targetHover - hover) * ease;
      element.style.setProperty('--rx', `${x + Math.sin(time * .55) * 1.2}deg`);
      element.style.setProperty('--ry', `${y + Math.sin(time * .4) * 1.8}deg`);
      element.style.setProperty('--float', `${Math.sin(time * .85) * 7}px`);
      element.style.setProperty('--shift', `${y * .55}px`);
      element.style.setProperty('--back-shift', `${-y * .9}px`);
      element.style.setProperty('--lift', `${hover * 14}px`);
      element.style.setProperty('--light', `${50 + y * 1.2}%`);
      frame = requestAnimationFrame(draw);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      release(); last = 0;
      if (enabled() && !document.hidden) frame = requestAnimationFrame(draw);
      else {
        x = y = hover = 0;
        ['--rx', '--ry', '--float', '--shift', '--back-shift', '--lift', '--light'].forEach(name => element.style.removeProperty(name));
      }
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', sync);
    document.documentElement.addEventListener('pointerleave', reset);
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', release);
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('keydown', key);
    media.addEventListener('change', sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      release();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', sync);
      document.documentElement.removeEventListener('pointerleave', reset);
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointerup', release);
      element.removeEventListener('pointercancel', release);
      element.removeEventListener('lostpointercapture', release);
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('keydown', key);
      media.removeEventListener('change', sync);
    };
  }, [paused]);

  return <div className="vkl3-visual">
    <div className="vkl3-scene-switch" role="group" aria-label="Pilih tampilan 3D">
      <button type="button" aria-pressed={view === 'ranking'} onClick={() => setView('ranking')}>Podium 3D</button>
      <button type="button" aria-pressed={view === 'logo'} onClick={() => setView('logo')}>Logo sekolah</button>
    </div>
    <div className={`vkl3-stage${view === 'ranking' ? ' vkl3-ranking-stage' : ''}`} ref={stage} tabIndex={0} role="group"
      aria-label={view === 'ranking' ? 'Podium peringkat 3D interaktif' : 'Objek logo sekolah 3D interaktif'} aria-describedby="vkl3-instructions" data-paused={paused}>
      <div className="vkl3-orbit" aria-hidden="true" />
      <div className="vkl3-shadow" aria-hidden="true" />
      <div className="vkl3-object">
        {view === 'ranking' ? <RankingPodium state={ranking} /> : <>
        <div className="vkl3-face vkl3-back" aria-hidden="true" />
        <div className="vkl3-face vkl3-left" aria-hidden="true" />
        <div className="vkl3-face vkl3-right" aria-hidden="true" />
        <div className="vkl3-face vkl3-top" aria-hidden="true" />
        <div className="vkl3-face vkl3-bottom" aria-hidden="true" />
        <div className="vkl3-face vkl3-front"><SchoolMark /></div>
        </>}
      </div>
    </div>
    {view === 'ranking' && <RankingCaption state={ranking} />}
    <div className="vkl3-scene-tools">
      <p id="vkl3-instructions">Geser untuk memutar <span aria-hidden="true">·</span> tombol panah saat fokus</p>
      <button type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused}>
        {paused ? 'Aktifkan gerakan' : 'Jeda gerakan'}
      </button>
    </div>
  </div>;
}
