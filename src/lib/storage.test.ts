import { describe, expect, it } from "vitest";
import { migrateLegacy } from "./storage";

describe("v1数据迁移", () => {
  it("保留个人资料、饮食、测量与训练记录", () => {
    const legacy = JSON.stringify({
      profile: { name: "小明", age: 20, height: 174, startWeight: 72.4, startWaist: 88, calorieTarget: 2150 },
      daily: { "2026-08-01": { calories: 2100, protein: 148, steps: 8200, friedChicken: true } },
      measurements: [{ date: "2026-08-01", weight: 72.4, waist: 88 }],
      workouts: { "2026-08-01-upperA": { date: "2026-08-01", dayId: "upperA", completed: true, entries: { "卧推": { sets: [{ weight: 55, reps: 6, rir: 2, done: true }] } } } },
      selectedTrainingDay: "lowerB",
    });
    const result = migrateLegacy(legacy, new Date("2026-08-02T00:00:00Z"));
    expect(result.version).toBe(2);
    expect(result.profile).toMatchObject({ name: "小明", heightCm: 174, startWeightKg: 72.4 });
    expect(result.dailyLogs["2026-08-01"]).toMatchObject({ caloriesKcal: 2100, proteinG: 148, friedChickenMeal: true });
    expect(result.measurements[0].waistCm).toBe(88);
    expect(result.workoutSessions[0].setEntries[0]).toMatchObject({ actualWeightKg: 55, actualReps: 6 });
    expect(result.selectedWorkoutDay).toBe("lowerB");
    expect(result.migration?.from).toBe(1);
  });
});
