import {supabase} from './supabase';
import type {StudentProfile} from './types';

const AVATAR_BUCKET='vokasi-avatars';
const PHOTO_EXPIRY_SECONDS=15*60;
type AvatarIndexRow={username:string;avatar_path:string};

function validPhoto(file:File){
  if(file.type!=='image/jpeg')throw new Error('Gunakan foto JPG atau JPEG.');
  if(file.size>1024*1024)throw new Error('Ukuran foto maksimal 1 MB.');
  if(file.size===0)throw new Error('File foto tidak boleh kosong.');
}

export async function getSchoolAvatarUrls(usernames:string[]):Promise<Record<string,string>>{
  const wanted=new Set(usernames.map(name=>name.trim().toLowerCase()).filter(Boolean));
  if(!wanted.size)return {};
  const client=supabase();
  const {data,error}=await client.rpc('vokasi_school_avatar_index');
  if(error)throw error;
  const indexed=((data||[]) as AvatarIndexRow[])
    .filter(row=>wanted.has(row.username.toLowerCase())&&row.avatar_path===row.username+'/avatar.jpg');
  const urls:Record<string,string>={};
  // Batch signs to avoid one call per person and avoid requesting files that do not exist.
  for(let i=0;i<indexed.length;i+=100){
    const slice=indexed.slice(i,i+100);
    const {data:signed,error:signError}=await client.storage
      .from(AVATAR_BUCKET).createSignedUrls(slice.map(row=>row.avatar_path),PHOTO_EXPIRY_SECONDS);
    if(signError)throw signError;
    (signed||[]).forEach((entry,index)=>{
      if(entry.signedUrl&&slice[index])urls[slice[index].username.toLowerCase()]=entry.signedUrl;
    });
  }
  return urls;
}

export async function uploadOwnAvatar(profile:StudentProfile,file:File):Promise<string>{
  validPhoto(file);
  const path=profile.username+'/avatar.jpg';
  const client=supabase();
  const {error:uploadError}=await client.storage.from(AVATAR_BUCKET)
    .upload(path,file,{upsert:true,contentType:'image/jpeg',cacheControl:'3600'});
  if(uploadError)throw uploadError;
  // Existing roster already owns the storage path; keep optional profile metadata in sync.
  // The photo is still valid if this additional metadata write is unavailable.
  await client.from('student_profiles').update({avatar_path:path})
    .eq('user_id',profile.authId);
  const {data,error}=await client.storage.from(AVATAR_BUCKET)
    .createSignedUrl(path,PHOTO_EXPIRY_SECONDS);
  if(error)throw error;
  // Cache busting for replacements in the same profile slot.
  return data.signedUrl;
}
