import {supabase} from '@/lib/supabase';

export type ExamActivityEventType =
  | 'tab_hidden' | 'tab_visible' | 'window_blur' | 'window_focus'
  | 'copy' | 'paste' | 'context_menu' | 'fullscreen_exit'
  | 'external_link' | 'ui_click' | 'answer_option_selected';

export type ExamActivityEvent = {
  id:number;
  session_id:string;
  auth_user_id:string;
  student_name:string;
  username:string;
  class_name:string;
  major_name:string;
  event_type:ExamActivityEventType;
  question_index:number|null;
  target_label:string;
  target_kind:string;
  detail:string;
  occurred_at:string;
  session_status:string;
  practice_category:string|null;
};

export type ExamActivityStudent = {
  auth_user_id:string;
  student_name:string;
  username:string;
  class_name:string;
  major_name:string;
  total_events:number;
  tab_switches:number;
  clipboard_events:number;
  external_links:number;
  click_events:number;
  sessions:number;
  last_event_at:string;
};

export type ExamActivityReport = {
  total_events:number;
  students_count:number;
  students:ExamActivityStudent[];
  items:ExamActivityEvent[];
};

export async function getExamActivityReport(
  days:number,
  limit=50,
  offset=0,
  studentId:string|null=null
):Promise<ExamActivityReport>{
  const {data,error}=await supabase().rpc('vokasi_admin_exam_activity',{
    p_days:days,p_limit:limit,p_offset:offset,p_student:studentId
  });
  if(error)throw new Error(error.message);
  const result=data as Partial<ExamActivityReport>|null;
  return {
    total_events:Number(result?.total_events||0),
    students_count:Number(result?.students_count||0),
    students:Array.isArray(result?.students)?result.students:[],
    items:Array.isArray(result?.items)?result.items:[]
  };
}

export function examActivityTimestamp(value:string){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Waktu tidak tersedia';
  return new Intl.DateTimeFormat('id-ID',{
    day:'2-digit',month:'short',year:'numeric',
    hour:'2-digit',minute:'2-digit',second:'2-digit',
    timeZone:'Asia/Jakarta',hourCycle:'h23'
  }).format(date)+' WIB';
}
