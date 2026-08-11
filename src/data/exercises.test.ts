import { describe, expect, it } from "vitest";
import { EXERCISE_GUIDES, EXERCISE_GUIDE_BY_ID } from "./exercises";
import { PROGRAM } from "./program";

describe("离线动作教学", () => {
  it("完整包含29套唯一教学", () => {
    expect(EXERCISE_GUIDES).toHaveLength(29);
    expect(new Set(EXERCISE_GUIDES.map((item) => item.id)).size).toBe(29);
  });

  it("每套都有分镜、两种错误、安全与替代信息", () => {
    for (const guide of EXERCISE_GUIDES) {
      expect(guide.phases).toHaveLength(3);
      expect(guide.mistakes.length).toBeGreaterThanOrEqual(2);
      expect(guide.stopSignals.length).toBeGreaterThanOrEqual(1);
      expect(guide.alternatives.length).toBeGreaterThanOrEqual(1);
      expect(guide.safety.length).toBeGreaterThan(8);
    }
  });

  it("四练计划每个位置都能打开对应教学", () => {
    for (const day of Object.values(PROGRAM)) {
      for (const exercise of day.exercises) expect(EXERCISE_GUIDE_BY_ID.has(exercise.guideId), `${day.id}/${exercise.id}/${exercise.guideId}`).toBe(true);
    }
  });
});
