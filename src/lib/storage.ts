import { openDB, type IDBPDatabase } from "idb";
import {
  createDefaultSnapshot,
  type AppSnapshot,
  type DailyLog,
  type Measurement,
  type SessionExercise,
  type SetEntry,
  type WorkoutDayId,
  type WorkoutSession,
} from "../domain/types";
import { findExerciseGuide } from "../data/exercises";

const DB_NAME = "steadycut-coach";
const STORE = "state";
const SNAPSHOT_KEY = "snapshot-v2";
const LEGACY_KEY = "steadycut:v1";
const LEGACY_BACKUP_KEY = "steadycut:v1:migrated-backup";

let dbPromise: Promise<IDBPDatabase> | null = null;

function database() {
  dbPromise ??= openDB(DB_NAME, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

const finiteOrNull = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function migrateDaily(source: Record<string, unknown>): Record<string, DailyLog> {
  const migrated: Record<string, DailyLog> = {};
  for (const [date, raw] of Object.entries(source ?? {})) {
    const item = (raw ?? {}) as Record<string, unknown>;
    migrated[date] = {
      date,
      caloriesKcal: finiteOrNull(item.calories),
      proteinG: finiteOrNull(item.protein),
      fatG: finiteOrNull(item.fat),
      carbsG: finiteOrNull(item.carbs),
      vegetablesG: finiteOrNull(item.vegetables),
      fruitServings: finiteOrNull(item.fruit),
      waterMl: finiteOrNull(item.water),
      steps: finiteOrNull(item.steps),
      cardioMinutes: finiteOrNull(item.runMinutes),
      bodyWeightKg: finiteOrNull(item.weight),
      friedChickenMeal: Boolean(item.friedChicken),
      note: String(item.notes ?? ""),
    };
  }
  return migrated;
}

function migrateMeasurements(source: unknown): Measurement[] {
  if (!Array.isArray(source)) return [];
  return source.map((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const date = String(item.date ?? new Date().toISOString().slice(0, 10));
    return {
      id: String(item.id ?? `legacy-measurement-${index}`),
      date,
      weightKg: finiteOrNull(item.weight),
      waistCm: finiteOrNull(item.waist),
      note: String(item.note ?? ""),
      createdAt: new Date(`${date}T12:00:00`).toISOString(),
    };
  });
}

const dayId = (value: unknown): WorkoutDayId =>
  ["upperA", "lowerA", "upperB", "lowerB"].includes(String(value))
    ? (String(value) as WorkoutDayId)
    : "upperA";

function migrateWorkouts(source: Record<string, unknown>): WorkoutSession[] {
  return Object.entries(source ?? {}).map(([key, raw], index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const legacyEntries = (item.entries ?? {}) as Record<string, { sets?: Array<Record<string, unknown>> }>;
    const exercises: SessionExercise[] = [];
    const setEntries: SetEntry[] = [];
    Object.entries(legacyEntries).forEach(([legacyId, entry], exerciseIndex) => {
      const found = findExerciseGuide(legacyId);
      const guideId = found?.id ?? legacyId;
      const sets = entry.sets ?? [];
      exercises.push({
        id: `legacy-${legacyId}-${exerciseIndex}`,
        name: found?.name ?? legacyId,
        guideId,
        sets: Math.max(1, sets.length),
        repMin: 6,
        repMax: 12,
        targetRir: 2,
        restSeconds: 90,
        incrementKg: 2.5,
        weightScale: 1,
        startingWeightKg: null,
        priority: 2,
        replacementFor: null,
      });
      sets.forEach((set, setIndex) => {
        setEntries.push({
          id: `${key}-${legacyId}-${setIndex}`,
          exerciseId: `legacy-${legacyId}-${exerciseIndex}`,
          setNumber: setIndex + 1,
          targetWeightKg: null,
          targetReps: 8,
          targetRir: 2,
          actualWeightKg: finiteOrNull(set.weight),
          actualReps: finiteOrNull(set.reps),
          actualRir: finiteOrNull(set.rir),
          stability: "stable",
          feeling: Boolean(item.pain) ? "joint-discomfort" : "none",
          symptomArea: "",
          completedAt: set.done ? new Date(`${item.date ?? "2026-01-01"}T12:30:00`).toISOString() : null,
        });
      });
    });
    const date = String(item.date ?? key.slice(0, 10));
    const startedAt = new Date(`${date}T12:00:00`).toISOString();
    return {
      id: `legacy-${key}-${index}`,
      workoutDayId: dayId(item.dayId),
      programWeek: 1,
      status: item.completed ? "completed" : "abandoned",
      startedAt,
      updatedAt: startedAt,
      completedAt: item.completed ? new Date(`${date}T13:00:00`).toISOString() : null,
      timeBudgetMinutes: finiteOrNull(item.duration) ?? 60,
      readiness: {
        sleepHours: 8,
        energy: 3,
        soreness: "none",
        symptoms: [],
        symptomArea: "",
        hoursSinceMeal: null,
        unavailableEquipment: [],
        timeBudgetMinutes: finiteOrNull(item.duration) ?? 60,
      },
      exercises,
      currentExerciseIndex: exercises.length,
      currentSetIndex: 0,
      setEntries,
      restEndsAt: null,
      safetyHold: Boolean(item.pain)
        ? { active: false, reasons: ["旧版疼痛标记"], createdAt: startedAt }
        : null,
      recommendations: [],
    };
  });
}

export function migrateLegacy(raw: string, now = new Date()): AppSnapshot {
  const old = JSON.parse(raw) as Record<string, unknown>;
  const snapshot = createDefaultSnapshot(now);
  const profile = (old.profile ?? {}) as Record<string, unknown>;
  snapshot.profile = {
    ...snapshot.profile,
    name: String(profile.name ?? ""),
    sex: "男",
    age: finiteOrNull(profile.age) ?? 20,
    heightCm: finiteOrNull(profile.height) ?? 174,
    startDate: String(profile.startDate ?? snapshot.profile.startDate),
    startWeightKg: finiteOrNull(profile.startWeight),
    startWaistCm: finiteOrNull(profile.startWaist),
    calorieTargetKcal: finiteOrNull(profile.calorieTarget) ?? 2150,
    proteinTargetG: finiteOrNull(profile.proteinTarget) ?? 150,
    fatTargetG: finiteOrNull(profile.fatTarget) ?? 60,
    carbTargetG: finiteOrNull(profile.carbTarget) ?? 250,
    stepOverride: finiteOrNull(profile.stepOverride),
    runMinutesOverride: finiteOrNull(profile.runOverride),
    lowImpactMode: Boolean(profile.lowImpactMode),
  };
  snapshot.dailyLogs = migrateDaily((old.daily ?? {}) as Record<string, unknown>);
  snapshot.measurements = migrateMeasurements(old.measurements);
  snapshot.workoutSessions = migrateWorkouts((old.workouts ?? {}) as Record<string, unknown>);
  snapshot.selectedWorkoutDay = dayId(old.selectedTrainingDay);
  snapshot.migration = { from: 1, migratedAt: now.toISOString() };
  snapshot.updatedAt = now.toISOString();
  return snapshot;
}

function compatible(value: unknown): value is AppSnapshot {
  const item = value as Partial<AppSnapshot> | undefined;
  return item?.version === 2 && Boolean(item.profile) && Array.isArray(item.workoutSessions);
}

export async function loadSnapshot(): Promise<AppSnapshot> {
  const db = await database();
  const current = await db.get(STORE, SNAPSHOT_KEY);
  if (compatible(current)) return current;

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const migrated = migrateLegacy(legacy);
      await db.put(STORE, migrated, SNAPSHOT_KEY);
      localStorage.setItem(LEGACY_BACKUP_KEY, legacy);
      return migrated;
    } catch (error) {
      console.error("SteadyCut v1 migration failed", error);
    }
  }
  const fresh = createDefaultSnapshot();
  await db.put(STORE, fresh, SNAPSHOT_KEY);
  return fresh;
}

export async function saveSnapshot(snapshot: AppSnapshot): Promise<void> {
  const copy = structuredClone(snapshot);
  copy.updatedAt = new Date().toISOString();
  const db = await database();
  await db.put(STORE, copy, SNAPSHOT_KEY);
}

export async function replaceSnapshot(snapshot: AppSnapshot): Promise<void> {
  if (!compatible(snapshot)) throw new Error("数据版本不兼容");
  const db = await database();
  await db.put(STORE, structuredClone(snapshot), SNAPSHOT_KEY);
}

export async function clearSnapshot(): Promise<AppSnapshot> {
  const fresh = createDefaultSnapshot();
  await replaceSnapshot(fresh);
  return fresh;
}

export function getLegacyBackup(): string | null {
  return localStorage.getItem(LEGACY_BACKUP_KEY) ?? localStorage.getItem(LEGACY_KEY);
}
