import { nativeRpc } from '@/lib/native-rpc';
import {supabase} from './supabase';

export type AdminNotification={
 id:string;
 occurred_at:string;
 student_name:string;
 class_name:string;
 score:number;
 practice_category:string|null;
 is_read:boolean;
};
export type AdminNotificationData={unread_count:number;items:AdminNotification[]};

export type AdminLogKind='all'|'mandatory'|'practice'|'admin';
export type AdminActivity={
 id:string;
 kind:Exclude<AdminLogKind,'all'>;
 title:string;
 actor:string;
 class_name:string;
 detail:string;
 occurred_at:string;
 score:number|null;
};
export type AdminActivityData={total:number;items:AdminActivity[]};

export async function getAdminNotifications():Promise<AdminNotificationData>{
 const {data,error}=await nativeRpc('vokasi_admin_get_notifications',{p_limit:20});
 if(error)throw new Error(error.message);
 const result=data as AdminNotificationData|null;
 return {unread_count:Number(result?.unread_count||0),items:result?.items||[]};
}
export async function acknowledgeAdminNotifications(ids:string[]|null):Promise<void>{
 const {error}=await nativeRpc('vokasi_admin_mark_notifications_read',{p_attempt_ids:ids});
 if(error)throw new Error(error.message);
}
export async function getAdminActivity(kind:AdminLogKind,days:number,offset:number):Promise<AdminActivityData>{
 const {data,error}=await nativeRpc('vokasi_admin_monitor_activity',{
  p_kind:kind,p_days:days,p_limit:30,p_offset:offset
 });
 if(error)throw new Error(error.message);
 const result=data as AdminActivityData|null;
 return {total:Number(result?.total||0),items:result?.items||[]};
}
export function adminWibTimestamp(value:string){
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return 'Waktu tidak tersedia';
 return new Intl.DateTimeFormat('id-ID',{
  day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',
  timeZone:'Asia/Jakarta',hourCycle:'h23'
 }).format(date)+' WIB';
}
