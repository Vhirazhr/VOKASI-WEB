'use client';
import dynamic from 'next/dynamic';
import SchoolMark from './SchoolMark';
const LogoScene = dynamic(() => import('./LogoScene'), {
  ssr: false,
  loading: () => <div className="vkw-canvas"><div className="vkw-fallback"><SchoolMark /></div></div>,
});
export default function InteractiveLogo() { return <LogoScene />; }
