export interface Exercise {
  id: number;
  title: string;
  description: string;
  sets: number | null;
  reps: string;
  youtubeId: string;
  position: number;
  // Epoch ms when the user marked it done, or null.
  completedAt: number | null;
}

export interface ScheduleDay {
  date: string;
  title: string;
  note: string;
  exercises: Exercise[];
}

export type MoveDirection = "up" | "down";

export interface MemberOption {
  id: number;
  name: string;
}

export interface Progress {
  completed: number;
  total: number;
  percent: number;
}
