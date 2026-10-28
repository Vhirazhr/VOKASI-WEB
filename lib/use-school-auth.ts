'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {configured,supabase} from './supabase';
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
    let unsubscribe:(()=>void)|null=null;
    const redirectToLanding=()=>{
      if(active)router.replace(landingLoginPath(required));
    };
    if(configured()){
      const {data:{subscription}}=supabase().auth.onAuthStateChange((event)=>{
        // If Supabase ends the session while a protected screen is open, use
        // the current landing-page login modal instead of the legacy /login UI.
        if(event==='SIGNED_OUT')redirectToLanding();
      });
      unsubscribe=()=>subscription.unsubscribe();
    }
    async function run(){
      if(!configured()){if(active){setError('Konfigurasi Supabase belum diisi.');setLoading(false);}return;}
      try {
        const session=await currentRole();
        if(!active)return;
        if(!session||session.role!==required){router.replace(landingLoginPath(required));return;}
        setProfile(session.profile);setLoading(false);
      }catch(e){if(active){setError(e instanceof Error?e.message:'Akun tidak dapat diverifikasi.');setLoading(false);}}
    }
    void run();
    return()=>{active=false;unsubscribe?.();};
  },[required,router]);
  const logout=async()=>{await signOut();router.replace(landingLoginPath(required));};
  return {profile,loading,error,logout};
}
