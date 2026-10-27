// Admin-only invitation workflow. Privileged credentials never leave the Edge Function.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.10';

const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'
};
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
 status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}
});
const url=Deno.env.get('SUPABASE_URL');
const anonKey=Deno.env.get('SUPABASE_ANON_KEY');
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const MAX_INVITES_PER_HOUR=10;

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json(405,{error:'Metode tidak didukung.'});
 if(!url||!anonKey||!serviceKey)return json(503,{error:'Pengaturan layanan undangan belum lengkap.'});
 const auth=req.headers.get('Authorization')||'';
 if(!/^Bearer\s+\S+$/.test(auth))return json(401,{error:'Masuk sebagai administrator terlebih dahulu.'});
 const userClient=createClient(url,anonKey,{
  global:{headers:{Authorization:auth}},
  auth:{persistSession:false,autoRefreshToken:false}
 });
 const {data:identity,error:identityError}=await userClient.auth.getUser();
 if(identityError||!identity.user)return json(401,{error:'Sesi administrator tidak valid.'});
 const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:admin,error:adminError}=await service.from('school_admins')
  .select('user_id').eq('user_id',identity.user.id).eq('is_active',true).maybeSingle();
 if(adminError||!admin)return json(403,{error:'Hanya administrator aktif yang boleh menambah admin.'});

 let incoming:unknown;
 try{incoming=await req.json();}catch{return json(400,{error:'Data formulir tidak valid.'});}
 if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))return json(400,{error:'Data formulir tidak valid.'});
 const values=incoming as Record<string,unknown>;
 if(typeof values.email!=='string'||typeof values.displayName!=='string')
  return json(400,{error:'Isi nama lengkap dan email administrator.'});
 const email=values.email.trim().toLowerCase();
 const displayName=values.displayName.trim().replace(/\s+/g,' ');
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  return json(400,{error:'Alamat email tidak valid.'});
 if(displayName.length<3||displayName.length>100)
  return json(400,{error:'Nama administrator harus 3–100 karakter.'});

 // A simple per-admin abuse guard. SMTP also enforces its own rate limits.
 const hourAgo=new Date(Date.now()-60*60*1000).toISOString();
 const {count:recent,error:countError}=await service.from('vokasi_admin_change_log')
  .select('id',{head:true,count:'exact'}).eq('admin_auth_user_id',identity.user.id)
  .eq('action','invite_admin').gte('changed_at',hourAgo);
 if(countError)return json(503,{error:'Tidak dapat memeriksa batas undangan saat ini.'});
 if((recent||0)>=MAX_INVITES_PER_HOUR)return json(429,{error:'Batas undangan admin tercapai. Coba kembali satu jam lagi.'});

 // Only the Auth-managed redirect allow-list may approve the URL.
 // No redirect URL is accepted from JSON body.
 const origin=req.headers.get('Origin')||'';
 let redirectTo: string|undefined;
 try{
  const parsed=new URL(origin);
  if(parsed.protocol==='https:'||(parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname)))
   redirectTo=new URL('/admin/aktivasi',parsed.origin).toString();
 }catch{/* Missing Origin: Auth will use its configured Site URL. */}
 if(!redirectTo)return json(400,{error:'Buka Pengaturan dari situs resmi VOKASI untuk mengundang admin.'});

 // Auth refuses to invite an already registered email. Never promote existing student users.
 const {data:invited,error:inviteError}=await service.auth.admin.inviteUserByEmail(email,{
  data:{display_name:displayName},
  redirectTo
 });
 if(inviteError||!invited.user){
  const detail=inviteError?.message||'Gagal membuat undangan.';
  const duplicate=/already|registered|exists|duplicate/i.test(detail);
  return json(duplicate?409:422,{error:duplicate?
   'Email sudah digunakan akun lain. Gunakan alamat email administrator yang belum terdaftar.':
   'Undangan tidak dapat dikirim: '+detail});
 }
 const userId=invited.user.id;
 const {error:roleError}=await service.from('school_admins').insert({
  user_id:userId,display_name:displayName,is_active:true
 });
 if(roleError){
  // Prevent an orphan Auth account with an invitation but without admin access.
  await service.auth.admin.deleteUser(userId);
  return json(500,{error:'Undangan dibatalkan karena hak akses admin tidak berhasil disimpan.'});
 }
 const {error:auditError}=await service.from('vokasi_admin_change_log').insert({
  admin_auth_user_id:identity.user.id,
  target_id:userId,action:'invite_admin',
  after_data:{display_name:displayName,email,source:'pengaturan'}
 });
 if(auditError){
  // The account exists and may have received an email; report success rather than invite twice.
  return json(200,{ok:true,warning:'Undangan dibuat tetapi log administratif belum dapat diperbarui.'});
 }
 return json(200,{ok:true});
});
