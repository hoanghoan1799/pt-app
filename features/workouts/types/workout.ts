export interface Exercise {
  id: number;
  title: string;
  description: string;
  sets: number | null;
  reps: string;
  youtubeId: string;
  position: number;
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
