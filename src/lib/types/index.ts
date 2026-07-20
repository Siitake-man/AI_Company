export interface Project {
  id: number;
  name: string;
  purpose?: string;
  values?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectMember {
  id: number;
  project_id: number;
  name: string;
  role: string;
  dept_name: string;
  avatar_id: string;
  personality?: string;
  personality_prompt: string;
  ai_model?: string;
  is_active_in_meeting?: number;
  created_at?: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  sender: string;
  content: string;
  created_at: string;
  role?: 'user' | 'assistant';
}
