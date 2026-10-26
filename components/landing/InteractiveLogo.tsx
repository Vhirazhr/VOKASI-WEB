'use client';

import dynamic from 'next/dynamic';
import SchoolMark from './SchoolMark';

const LogoScene = dynamic(() => import('./LogoScene'), {
  ssr: false,
  loading: () => <div className="vkl3-static"><SchoolMark /></div>,
});

export default function InteractiveLogo() {
  return <LogoScene />;
}
