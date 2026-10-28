'use client';

import Image from 'next/image';
import { useState } from 'react';
import { schoolIdentity } from './identity';

export default function SchoolMark({ compact = false }: { compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (schoolIdentity.logoSrc && !failed) {
    return <Image src={schoolIdentity.logoSrc} alt={schoolIdentity.logoAlt}
      width={320} height={320} unoptimized draggable={false}
      className="vkl3-school-image" onError={() => setFailed(true)} />;
  }
  return <span className={`vkl3-placeholder${compact ? ' vkl3-placeholder-small' : ''}`}
    role="img" aria-label="Placeholder logo sekolah; aset resmi belum tersedia">
    <span aria-hidden="true">{compact ? 'Logo' : 'LOGO SEKOLAH'}</span>
    {!compact && <><strong aria-hidden="true">SMKN 1<br />Singosari</strong><small aria-hidden="true">Placeholder · aset resmi belum tersedia</small></>}
  </span>;
}
