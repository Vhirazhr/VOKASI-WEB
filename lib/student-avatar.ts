import { nativeRpc } from '@/lib/native-rpc';
import { storageUrl, uploadStorageFile } from '@/lib/storage-client';
import type {StudentProfile} from './types';

const AVATAR_BUCKET='vokasi-avatars';

function validPhoto(file:File){
  if(file.type!=='image/jpeg')throw new Error('Gunakan foto JPG atau JPEG.');
  if(file.size>1024*1024)throw new Error('Ukuran foto maksimal 1 MB.');
  if(file.size===0)throw new Error('File foto tidak boleh kosong.');
}

type AvatarIndexRow={username:string;avatar_path:string};

export async function getSchoolAvatarUrls(usernames:string[]):Promise<Record<string,string>>{
  const wanted=new Set(usernames.map(name=>name.trim().toLowerCase()).filter(Boolean));
  if(!wanted.size)return {};
  const {data,error}=await nativeRpc<AvatarIndexRow[]>('vokasi_school_avatar_index');
  if(error)throw new Error(error.message);
  const indexed=((data||[]) as AvatarIndexRow[])
    .filter(row=>wanted.has(row.username.toLowerCase())&&row.avatar_path===row.username+'/avatar.jpg');
  const urls:Record<string,string>={};
  for(const row of indexed){
    urls[row.username.toLowerCase()]=storageUrl(AVATAR_BUCKET,row.avatar_path);
  }
  return urls;
}

export async function uploadOwnAvatar(profile:StudentProfile,file:File):Promise<string>{
  validPhoto(file);
  const path=profile.username+'/avatar.jpg';
  const uploaded=await uploadStorageFile(AVATAR_BUCKET,path,file);
  // Cache-bust replacements in the same profile slot.
  return uploaded.url+'&v='+Date.now();
}
