export type UserRole = 'admin' | 'student';
export interface StudentProfile {
  authId: string;
  username: string;
  fullName: string;
  classId: string;
  className: string;
  majorId: string;
  majorName: string;
}
export interface RosterRow {
  id: string; auth_user_id: string | null; username: string | null; full_name: string;
  class_id: string; major_id: string | null; registration_status: string;
}
export interface SchoolStudent extends StudentProfile { id: string; registered: boolean; }
export interface Attempt {
  id?: string;
  auth_user_id: string;
  username: string;
  session_key: string;
  completed_at_ms: number;
  signature: string;
  correct: number;
  answered: number;
  question_count: number;
  score: number;
  earned_xp: number;
  seconds_spent: number;
  practice_category: string | null;
  name_snapshot: string;
  class_snapshot: string;
  major_snapshot: string;
  review_summary: {question_id:number; selected_index:number|null; status:string; response_seconds:number}[];
}
export interface AttemptSummary {
  id?: string;
  auth_user_id: string|null;
  completed_at_ms: number;
  score: number;
}
export interface BankQuestion {
  id:number; category:string; question:string; options:string[];
  correctAnswer:string; correctOption:string; difficultyCode:string; timeLimitSeconds:number; explanation:string;
  questionImageUrl?:string|null; optionImageUrls?:(string|null)[];
}
export interface SessionQuestion extends BankQuestion { answerIndex: number; }
export interface LeaderboardEntry {
  username:string; display_name:string; major:string; classroom:string;
  season_xp:number; lifetime_xp:number; streak:number;
  mandatory_average:number|null; mandatory_days:number;
}
