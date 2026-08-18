/** Mirrors the backend training module's admin monitoring payloads (Wave G4). */

export type TrainingAudience = "agents" | "ambassadors" | "students";

/** One row of GET /admin/monitoring/training. */
export type AdminTrainingProgram = {
  id: number;
  business_id: number;
  business_name: string | null;
  title: string;
  category: string | null;
  target_audience: TrainingAudience;
  is_published: boolean;
  is_mandatory: boolean;
  passing_score: number;
  created_at: string;
  chapters: number;
  enrolments: number;
  certificates_issued: number;
};

export type AdminTrainingStats = {
  programs: { total: number; published: number };
  enrolments: { total: number; last_30_days: number };
  certificates: { total: number; expired: number; gold: number };
  gamification: { learners: number; total_xp: number; longest_streak: number };
};

export type ListTrainingProgramsParams = {
  business_id?: number;
  target_audience?: TrainingAudience;
  page?: number;
  limit?: number;
};

export type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
