'use client';
import Image from 'next/image';
import {useState} from 'react';

type Props={name:string;url?:string|null;className?:string;size?:number};
export default function StudentAvatar({name,url,className='',size=110}:Props){
  const [failedUrl,setFailedUrl]=useState('');
  const initials=name.trim().split(/\s+/).filter(Boolean).slice(0,2)
    .map(part=>part[0]).join('').toUpperCase()||'V';
  const photo=url&&failedUrl!==url;
  return <span className={'vokasi-student-avatar '+className} title={name}>
    {photo?<Image src={url} alt={'Foto '+name} width={size} height={size}
      unoptimized onError={()=>setFailedUrl(url)}/>:<span className="vokasi-avatar-initials" aria-label={'Avatar '+name}>{initials}</span>}
  </span>;
}
