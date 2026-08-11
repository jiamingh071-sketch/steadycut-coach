import { describe, expect, it } from "vitest";
import { buildWorkoutPlan, getTimeBudgetTier, getWeekPolicy, PROGRAM_ORDER } from "./program";

describe("12周训练计划", () => {
  it("30/45/60分钟版本按优先级精简并保留三个核心动作", () => {
    expect(buildWorkoutPlan("upperA", { week: 2, timeBudgetMinutes: 30 }).map((item) => item.id)).toEqual(["bench", "chest-row", "lat-pulldown-a"]);
    expect(buildWorkoutPlan("upperA", { week: 2, timeBudgetMinutes: 45 })).toHaveLength(5);
    expect(buildWorkoutPlan("upperA", { week: 2, timeBudgetMinutes: 60 })).toHaveLength(7);
    for (const day of PROGRAM_ORDER) expect(buildWorkoutPlan(day, { week: 2, timeBudgetMinutes: 30 })).toHaveLength(3);
  });

  it("自定义时间向保守档位映射", () => {
    expect(getTimeBudgetTier(37)).toBe(30);
    expect(getTimeBudgetTier(45)).toBe(45);
    expect(getTimeBudgetTier(53)).toBe(60);
  });

  it("第1周RIR3，第6和12周减量", () => {
    expect(getWeekPolicy(1).targetRir).toBe(3);
    expect(getWeekPolicy(6)).toMatchObject({ deload: true, setScale: 0.5, weightScale: 0.9 });
    expect(getWeekPolicy(12)).toMatchObject({ deload: true, setScale: 0.5, weightScale: 0.9 });
    const normal = buildWorkoutPlan("lowerB", { week: 5, timeBudgetMinutes: 60 });
    const deload = buildWorkoutPlan("lowerB", { week: 6, timeBudgetMinutes: 60 });
    deload.forEach((item, index) => expect(item.sets).toBe(Math.ceil(normal[index].sets / 2)));
  });
});
