import { describe, expect, it } from "vitest";
import type { SetEntry } from "../domain/types";
import { defaultReadiness, evaluateReadiness, evaluateSetFeedback, parseCoachIntent, startWorkoutSession } from "./coach";

describe("本地教练规则", () => {
  it("危险症状优先触发不可覆盖的安全暂停", () => {
    const readiness = { ...defaultReadiness(), symptoms: ["numbness" as const], symptomArea: "右手" };
    const recommendations = evaluateReadiness(readiness, 6);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].action.type).toBe("safety-hold");
    expect(startWorkoutSession("upperA", 6, readiness).status).toBe("safety-hold");
  });

  it("睡眠不足建议减重但不冒充危险症状", () => {
    const recommendations = evaluateReadiness({ ...defaultReadiness(45), sleepHours: 5, energy: 2 }, 2);
    expect(recommendations.some((item) => item.action.type === "reduce-load")).toBe(true);
    expect(recommendations.some((item) => item.source === "time")).toBe(true);
  });

  it("RIR 0、次数不足或动作不稳建议下一组减重", () => {
    const set: SetEntry = { id: "s", exerciseId: "bench", setNumber: 1, targetWeightKg: 55, targetReps: 6, targetRir: 2, actualWeightKg: 55, actualReps: 5, actualRir: 0, stability: "unstable", feeling: "none", symptomArea: "", completedAt: new Date().toISOString() };
    expect(evaluateSetFeedback(set, "卧推")[0].action).toMatchObject({ type: "reduce-load", percent: 10 });
  });

  it("识别常用自然语言意图", () => {
    expect(parseCoachIntent("器械被占了")).toBe("equipment");
    expect(parseCoachIntent("还要休息多久")).toBe("rest");
    expect(parseCoachIntent("肩膀锐痛而且手麻")).toBe("pain");
  });

  it("上次全部到次数上限且RIR 1–2时，下次按增量加重", () => {
    const previous = startWorkoutSession("upperA", 2, defaultReadiness(30));
    previous.status = "completed";
    const bench = previous.exercises[0];
    previous.setEntries = Array.from({ length: bench.sets }, (_, index) => ({ id: `s${index}`, exerciseId: bench.id, setNumber: index + 1, targetWeightKg: 55, targetReps: bench.repMin, targetRir: 2, actualWeightKg: 55, actualReps: bench.repMax, actualRir: 2, stability: "stable" as const, feeling: "none" as const, symptomArea: "", completedAt: new Date().toISOString() }));
    const next = startWorkoutSession("upperA", 3, defaultReadiness(30), [previous]);
    expect(next.exercises[0].startingWeightKg).toBe(57.5);
  });
});
