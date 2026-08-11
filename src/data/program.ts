import type { SessionExercise, WorkoutDayId } from "../domain/types";

export interface ExercisePrescription {
  id: string;
  guideId: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  incrementKg: number;
  startingWeightKg: number | null;
  restSeconds: number;
  priority: 1 | 2 | 3;
  minimumMinutes: 30 | 45 | 60;
  setsAt45?: number;
}

export interface WorkoutDay {
  id: WorkoutDayId;
  shortName: string;
  title: string;
  weekday: 1 | 2 | 4 | 6;
  exercises: ExercisePrescription[];
}

export interface WeekPolicy {
  week: number;
  targetRir: 2 | 3;
  setScale: 0.5 | 1;
  weightScale: 0.9 | 1;
  deload: boolean;
  label: string;
}

export interface BuildWorkoutPlanOptions {
  week: number;
  timeBudgetMinutes: number;
}

const exercise = (
  id: string,
  name: string,
  sets: number,
  repMin: number,
  repMax: number,
  incrementKg: number,
  options: Partial<Pick<ExercisePrescription, "guideId" | "startingWeightKg" | "restSeconds" | "priority" | "minimumMinutes" | "setsAt45">> = {},
): ExercisePrescription => ({
  id,
  guideId: options.guideId ?? id,
  name,
  sets,
  repMin,
  repMax,
  incrementKg,
  startingWeightKg: options.startingWeightKg ?? null,
  restSeconds: options.restSeconds ?? (options.priority === 1 ? 150 : 75),
  priority: options.priority ?? 2,
  minimumMinutes: options.minimumMinutes ?? 45,
  setsAt45: options.setsAt45,
});

export const PROGRAM_ORDER: readonly WorkoutDayId[] = ["upperA", "lowerA", "upperB", "lowerB"];

export const PROGRAM: Readonly<Record<WorkoutDayId, WorkoutDay>> = {
  upperA: {
    id: "upperA",
    shortName: "上肢A",
    title: "上肢A · 卧推主项",
    weekday: 1,
    exercises: [
      exercise("bench", "卧推", 3, 5, 8, 2.5, { guideId: "barbell-bench-press", startingWeightKg: 55, priority: 1, minimumMinutes: 30, restSeconds: 180 }),
      exercise("chest-row", "胸托划船", 3, 6, 10, 2.5, { guideId: "chest-supported-row", priority: 1, minimumMinutes: 30, restSeconds: 150 }),
      exercise("incline-db", "上斜哑铃卧推", 2, 8, 12, 2, { guideId: "incline-dumbbell-press", minimumMinutes: 45 }),
      exercise("lat-pulldown-a", "高位下拉", 3, 8, 12, 2.5, { guideId: "lat-pulldown", priority: 1, minimumMinutes: 30, restSeconds: 120 }),
      exercise("lateral-a", "侧平举", 3, 12, 20, 1, { guideId: "dumbbell-lateral-raise", priority: 3, minimumMinutes: 45, setsAt45: 2 }),
      exercise("curl-a", "二头弯举", 2, 10, 15, 1, { guideId: "dumbbell-curl", priority: 3, minimumMinutes: 60 }),
      exercise("pushdown-a", "绳索下压", 2, 10, 15, 2.5, { guideId: "rope-triceps-pushdown", priority: 3, minimumMinutes: 60 }),
    ],
  },
  lowerA: {
    id: "lowerA",
    shortName: "下肢A",
    title: "下肢A · 蹲与髋铰链",
    weekday: 2,
    exercises: [
      exercise("squat-legpress", "深蹲或腿举", 3, 6, 10, 5, { guideId: "back-squat", priority: 1, minimumMinutes: 30, restSeconds: 180 }),
      exercise("rdl", "罗马尼亚硬拉", 3, 6, 10, 5, { guideId: "romanian-deadlift", priority: 1, minimumMinutes: 30, restSeconds: 180 }),
      exercise("bulgarian", "保加利亚分腿蹲", 2, 8, 12, 2.5, { guideId: "bulgarian-split-squat", priority: 1, minimumMinutes: 30, restSeconds: 120 }),
      exercise("legcurl-a", "腿弯举", 2, 10, 15, 2.5, { guideId: "seated-leg-curl", minimumMinutes: 45 }),
      exercise("calf-a", "提踵", 3, 10, 15, 2.5, { guideId: "standing-calf-raise", priority: 3, minimumMinutes: 45, setsAt45: 2 }),
      exercise("plank", "平板支撑（秒）", 2, 30, 60, 0, { priority: 3, minimumMinutes: 60, restSeconds: 60 }),
    ],
  },
  upperB: {
    id: "upperB",
    shortName: "上肢B",
    title: "上肢B · 推肩主项",
    weekday: 4,
    exercises: [
      exercise("db-press", "哑铃推肩（单只）", 3, 6, 10, 2, { guideId: "dumbbell-shoulder-press", startingWeightKg: 14, priority: 1, minimumMinutes: 30, restSeconds: 180 }),
      exercise("pullup-pulldown", "引体向上或高位下拉", 3, 6, 10, 2.5, { guideId: "pull-up", priority: 1, minimumMinutes: 30, restSeconds: 150 }),
      exercise("machine-press", "器械胸推", 3, 8, 12, 2.5, { guideId: "machine-chest-press", minimumMinutes: 45, setsAt45: 2 }),
      exercise("seated-row", "坐姿划船", 3, 8, 12, 2.5, { guideId: "seated-cable-row", priority: 1, minimumMinutes: 30, restSeconds: 120 }),
      exercise("lateral-b", "侧平举", 2, 12, 20, 1, { guideId: "dumbbell-lateral-raise", priority: 3, minimumMinutes: 45 }),
      exercise("rear-delt", "反向飞鸟", 2, 12, 20, 1, { guideId: "reverse-fly", priority: 3, minimumMinutes: 45 }),
      exercise("curl-b", "二头弯举", 2, 10, 15, 1, { guideId: "dumbbell-curl", priority: 3, minimumMinutes: 60 }),
      exercise("pushdown-b", "三头下压", 2, 10, 15, 2.5, { guideId: "rope-triceps-pushdown", priority: 3, minimumMinutes: 60 }),
    ],
  },
  lowerB: {
    id: "lowerB",
    shortName: "下肢B",
    title: "下肢B · 臀腿主项",
    weekday: 6,
    exercises: [
      exercise("hip-thrust", "臀推", 3, 6, 10, 5, { priority: 1, minimumMinutes: 30, restSeconds: 180 }),
      exercise("hack-legpress", "哈克深蹲或腿举", 3, 8, 12, 5, { guideId: "hack-squat", priority: 1, minimumMinutes: 30, restSeconds: 180 }),
      exercise("reverse-lunge", "反向箭步蹲", 2, 8, 12, 2.5, { priority: 1, minimumMinutes: 30, restSeconds: 120 }),
      exercise("legcurl-b", "腿弯举", 3, 10, 15, 2.5, { guideId: "seated-leg-curl", minimumMinutes: 45, setsAt45: 2 }),
      exercise("leg-extension", "腿屈伸", 2, 12, 15, 2.5, { guideId: "leg-extension", minimumMinutes: 45 }),
      exercise("calf-b", "提踵", 2, 10, 15, 2.5, { guideId: "standing-calf-raise", priority: 3, minimumMinutes: 60 }),
      exercise("crunch", "卷腹", 2, 12, 20, 0, { priority: 3, minimumMinutes: 60, restSeconds: 60 }),
    ],
  },
};

export function getWeekPolicy(inputWeek: number): WeekPolicy {
  const week = Math.min(12, Math.max(1, Math.round(Number.isFinite(inputWeek) ? inputWeek : 1)));
  const deload = week === 6 || week === 12;
  return {
    week,
    targetRir: week === 1 ? 3 : 2,
    setScale: deload ? 0.5 : 1,
    weightScale: deload ? 0.9 : 1,
    deload,
    label: deload ? `第${week}周减量` : week === 1 ? "第1周适应" : `第${week}周训练`,
  };
}

export function getTimeBudgetTier(minutes: number): 30 | 45 | 60 {
  if (!Number.isFinite(minutes) || minutes <= 37) return 30;
  if (minutes <= 52) return 45;
  return 60;
}

export function getWorkoutDay(dayId: WorkoutDayId): WorkoutDay {
  return PROGRAM[dayId];
}

/** Builds a UI-ready plan. Custom durations map to the closest conservative tier. */
export function buildWorkoutPlan(dayId: WorkoutDayId, options: BuildWorkoutPlanOptions): SessionExercise[] {
  const policy = getWeekPolicy(options.week);
  const tier = getTimeBudgetTier(options.timeBudgetMinutes);

  return PROGRAM[dayId].exercises
    .filter((item) => item.minimumMinutes <= tier)
    .map((item) => {
      const timeAdjustedSets = tier === 45 && item.setsAt45 ? item.setsAt45 : item.sets;
      const sets = Math.max(1, Math.ceil(timeAdjustedSets * policy.setScale));
      return {
        id: item.id,
        name: item.name,
        guideId: item.guideId,
        sets,
        repMin: item.repMin,
        repMax: item.repMax,
        targetRir: policy.targetRir,
        restSeconds: item.restSeconds,
        incrementKg: item.incrementKg,
        weightScale: policy.weightScale,
        startingWeightKg: item.startingWeightKg,
        priority: item.priority,
        replacementFor: null,
      } satisfies SessionExercise;
    });
}

export function getScheduledDay(weekday: number): WorkoutDayId | null {
  return PROGRAM_ORDER.find((dayId) => PROGRAM[dayId].weekday === weekday) ?? null;
}
