'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {currentRole,signOut} from './auth';
import type {UserRole,StudentProfile} from './types';

function landingLoginPath(required:UserRole) {
  const params=new URLSearchParams({login:'1',role:required});
  if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('embed')==='1') {
    params.set('embed','1');
  }
  return '/?'+params.toString();
}

export function useSchoolAuth(required:UserRole) {
  const router=useRouter();
  const [loading,setLoading]=useState(true);
  const [profile,setProfile]=useState<StudentProfile|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    let checking=false;
    const redirectToLanding=()=>{if(active)router.replace(landingLoginPath(required));};
    const run=async()=>{
      if(checking)return;
      checking=true;
      try {
        const session=await currentRole();
        if(!active)return;
        if(!session||session.role!==required){redirectToLanding();return;}
        setProfile(session.profile);
        setError('');
        setLoading(false);
      }catch(e){
        if(active){setError(e instanceof Error?e.message:'Akun tidak dapat diverifikasi.');setLoading(false);}
      }finally{checking=false;}
    };
    void run();
    const onAuthChanged=()=>{void run();};
    window.addEventListener('vokasi:auth-changed',onAuthChanged);
    const interval=window.setInterval(()=>void run(),60_000);
    return()=>{
      active=false;
      window.removeEventListener('vokasi:auth-changed',onAuthChanged);
      window.clearInterval(interval);
    };
  },[required,router]);
  const logout=async()=>{
    try{await signOut();}
    finally{router.replace(landingLoginPath(required));}
  };
  return {profile,loading,error,logout};
}
