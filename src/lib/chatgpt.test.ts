import { describe, expect, it } from "vitest";
import { createDefaultSnapshot } from "../domain/types";
import { defaultReadiness, startWorkoutSession } from "./coach";
import { composeChatGPTHandoff, parseImportedAdvice } from "./chatgpt";

describe("ChatGPT Plus 手动桥接", () => {
  const session = startWorkoutSession("upperA", 2, defaultReadiness());

  it("只导出最少必要上下文并带会话编号", () => {
    const text = composeChatGPTHandoff(createDefaultSnapshot(), session);
    expect(text).toContain(session.id);
    expect(text).toContain("STEADYCUT_ADVICE_V1");
  });

  it("接受白名单内且数值安全的调整", () => {
    const text = JSON.stringify({ version: "STEADYCUT_ADVICE_V1", sessionId: session.id, summary: "减轻卧推", actions: [{ type: "change_weight", exerciseId: "bench", deltaPercent: -5 }] });
    expect(parseImportedAdvice(text, session.id, session).actions[0].type).toBe("change_weight");
  });

  it("拒绝错误会话、越界数值和未知动作", () => {
    const code = (sessionId: string, exerciseId: string, deltaPercent: number) => JSON.stringify({ version: "STEADYCUT_ADVICE_V1", sessionId, summary: "x", actions: [{ type: "change_weight", exerciseId, deltaPercent }] });
    expect(() => parseImportedAdvice(code("other", "bench", -5), session.id, session)).toThrow("不属于当前训练");
    expect(() => parseImportedAdvice(code(session.id, "bench", -50), session.id, session)).toThrow("安全边界");
    expect(() => parseImportedAdvice(code(session.id, "unknown", -5), session.id, session)).toThrow("未知动作");
  });

  it("危险症状下只允许stop", () => {
    const unsafe = startWorkoutSession("upperA", 2, { ...defaultReadiness(), symptoms: ["sharp-pain"] });
    const text = JSON.stringify({ version: "STEADYCUT_ADVICE_V1", sessionId: unsafe.id, summary: "继续", actions: [{ type: "keep" }] });
    expect(() => parseImportedAdvice(text, unsafe.id, unsafe)).toThrow("只允许停止训练");
  });
});
