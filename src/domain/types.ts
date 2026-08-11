export type ISODate = string;
export type ISODateTime = string;

export type WorkoutDayId = "upperA" | "lowerA" | "upperB" | "lowerB";
export type Sex = "男" | "女" | "其他";
export type SessionStatus =
  | "precheck"
  | "ready"
  | "warmup"
  | "active"
  | "rest"
  | "summary"
  | "safety-hold"
  | "completed"
  | "abandoned";

export type SessionFeeling =
  | "none"
  | "muscle-burn"
  | "joint-discomfort"
  | "sharp-pain"
  | "numbness"
  | "joint-instability"
  | "chest-pain"
  | "dizziness"
  | "unusual-shortness-of-breath";

export type MovementStability = "stable" | "slightly-unstable" | "unstable";
export type RecommendationSeverity = "info" | "adjust" | "warning" | "stop";
export type RecommendationSource = "safety" | "week" | "readiness" | "time" | "set" | "equipment";

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  startDate: ISODate;
  startWeightKg: number | null;
  startWaistCm: number | null;
  calorieTargetKcal: number;
  proteinTargetG: number;
  fatTargetG: number;
  carbTargetG: number;
  stepOverride: number | null;
  runMinutesOverride: number | null;
  lowImpactMode: boolean;
}

export interface DailyLog {
  date: ISODate;
  caloriesKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  vegetablesG: number | null;
  fruitServings: number | null;
  waterMl: number | null;
  steps: number | null;
  cardioMinutes: number | null;
  bodyWeightKg: number | null;
  friedChickenMeal: boolean;
  note: string;
}

export interface Measurement {
  id: string;
  date: ISODate;
  weightKg: number | null;
  waistCm: number | null;
  note: string;
  createdAt: ISODateTime;
}

export interface ReadinessCheck {
  sleepHours: number;
  energy: 1 | 2 | 3 | 4 | 5;
  soreness: "none" | "mild" | "moderate" | "severe";
  symptoms: SessionFeeling[];
  symptomArea: string;
  hoursSinceMeal: number | null;
  unavailableEquipment: string[];
  timeBudgetMinutes: number;
}

export interface SetEntry {
  id: string;
  exerciseId: string;
  setNumber: number;
  targetWeightKg: number | null;
  targetReps: number;
  targetRir: number;
  actualWeightKg: number | null;
  actualReps: number | null;
  actualRir: number | null;
  stability: MovementStability;
  feeling: SessionFeeling;
  symptomArea: string;
  completedAt: ISODateTime | null;
}

export interface SessionExercise {
  id: string;
  name: string;
  guideId: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
  incrementKg: number;
  weightScale: number;
  startingWeightKg: number | null;
  priority: 1 | 2 | 3;
  replacementFor: string | null;
}

export interface CoachRecommendation {
  id: string;
  severity: RecommendationSeverity;
  source: RecommendationSource;
  title: string;
  message: string;
  action:
    | { type: "safety-hold"; reason: string }
    | { type: "reduce-load"; percent: number; exerciseId?: string }
    | { type: "reduce-sets"; amount: number; exerciseId?: string }
    | { type: "replace-exercise"; exerciseId: string; replacementId: string }
    | { type: "set-time-budget"; minutes: number }
    | { type: "progress-next-session"; exerciseId: string; incrementKg: number }
    | { type: "none" };
  requiresConfirmation: boolean;
  createdAt: ISODateTime;
  appliedAt?: ISODateTime;
  undo?: {
    exercises: SessionExercise[];
    restEndsAt: ISODateTime | null;
    restNotificationId: number | null;
  };
}

export interface SafetyHold {
  active: boolean;
  reasons: string[];
  createdAt: ISODateTime;
}

export interface WorkoutSession {
  id: string;
  workoutDayId: WorkoutDayId;
  programWeek: number;
  status: SessionStatus;
  startedAt: ISODateTime;
  updatedAt: ISODateTime;
  completedAt: ISODateTime | null;
  timeBudgetMinutes: number;
  readiness: ReadinessCheck;
  exercises: SessionExercise[];
  currentExerciseIndex: number;
  currentSetIndex: number;
  setEntries: SetEntry[];
  restEndsAt: ISODateTime | null;
  /** Android uses this stable ID to cancel or replace a scheduled rest notification. */
  restNotificationId?: number | null;
  safetyHold: SafetyHold | null;
  recommendations: CoachRecommendation[];
}

export interface CoachMessage {
  id: string;
  role: "user" | "coach";
  text: string;
  intent?: string;
  createdAt: ISODateTime;
}

export interface AppSettings {
  theme: "system" | "dark" | "light";
  reduceMotion: boolean;
  chatGptUrl: string;
  restNotifications: boolean;
  keepScreenAwake: boolean;
  vibration: boolean;
  sound: boolean;
}

export interface AppSnapshot {
  version: 2;
  profile: Profile;
  dailyLogs: Record<ISODate, DailyLog>;
  measurements: Measurement[];
  workoutSessions: WorkoutSession[];
  activeSessionId: string | null;
  selectedWorkoutDay: WorkoutDayId;
  coachMessages: CoachMessage[];
  settings: AppSettings;
  migration?: { from: 1; migratedAt: ISODateTime };
  updatedAt: ISODateTime;
}

const toLocalDate = (date: Date): ISODate => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const nextMonday = (now: Date): ISODate => {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return toLocalDate(date);
};

/** Creates a fresh v2 snapshot. Passing `now` keeps migrations and tests deterministic. */
export function createDefaultSnapshot(now = new Date()): AppSnapshot {
  const timestamp = now.toISOString();
  return {
    version: 2,
    profile: {
      name: "",
      sex: "男",
      age: 20,
      heightCm: 174,
      startDate: nextMonday(now),
      startWeightKg: null,
      startWaistCm: null,
      calorieTargetKcal: 2150,
      proteinTargetG: 150,
      fatTargetG: 60,
      carbTargetG: 250,
      stepOverride: null,
      runMinutesOverride: null,
      lowImpactMode: false,
    },
    dailyLogs: {},
    measurements: [],
    workoutSessions: [],
    activeSessionId: null,
    selectedWorkoutDay: "upperA",
    coachMessages: [],
    settings: {
      theme: "system",
      reduceMotion: false,
      chatGptUrl: "",
      restNotifications: false,
      keepScreenAwake: false,
      vibration: true,
      sound: false,
    },
    updatedAt: timestamp,
  };
}
