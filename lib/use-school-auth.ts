'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {configured} from './supabase';
import {currentRole,signOut} from './auth';
import type {UserRole,StudentProfile} from './types';
export function useSchoolAuth(required:UserRole) {
  const router=useRouter();
  const [loading,setLoading]=useState(true);
  const [profile,setProfile]=useState<StudentProfile|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;
    async function run(){
      if(!configured()){if(active){setError('Konfigurasi Supabase belum diisi.');setLoading(false);}return;}
      try {const session=await currentRole();
        if(!active)return;
        if(!session||session.role!==required){router.replace('/login?role='+required);return;}
        setProfile(session.profile);setLoading(false);
      }catch(e){if(active){setError(e instanceof Error?e.message:'Akun tidak dapat diverifikasi.');setLoading(false);}}
    }void run();return()=>{active=false;};
  },[required,router]);
  const logout=async()=>{await signOut();router.replace('/login');};
  return {profile,loading,error,logout};
}
