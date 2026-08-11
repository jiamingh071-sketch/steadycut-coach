import type { AppSnapshot, WorkoutSession } from "../domain/types";
import { EXERCISE_GUIDE_BY_ID } from "../data/exercises";

export type AdviceAction =
  | { type: "keep"; reason?: string }
  | { type: "change_weight"; exerciseId: string; deltaPercent: number; reason?: string }
  | { type: "change_sets"; exerciseId: string; sets: number; reason?: string }
  | { type: "rest"; seconds: number; reason?: string }
  | { type: "substitute"; fromExerciseId: string; toExerciseId: string; reason?: string }
  | { type: "stop"; reason: string };

export interface ImportedAdvice {
  version: "STEADYCUT_ADVICE_V1";
  sessionId: string;
  summary: string;
  actions: AdviceAction[];
}

const dangerous = new Set(["sharp-pain", "numbness", "joint-instability", "chest-pain", "dizziness", "unusual-shortness-of-breath"]);

export function composeChatGPTHandoff(snapshot: AppSnapshot, session?: WorkoutSession | null): string {
  const recentMeasurements = [...snapshot.measurements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const completedSets = session?.setEntries.filter((set) => set.completedAt).slice(-3).map((set) => ({
    exercise: session.exercises.find((item) => item.id === set.exerciseId)?.name ?? set.exerciseId,
    weightKg: set.actualWeightKg,
    reps: set.actualReps,
    rir: set.actualRir,
    stability: set.stability,
    feeling: set.feeling,
  })) ?? [];

  return `你是我的 SteadyCut 私人训练教练。请给出简短、可执行的中文建议；不要进行医疗诊断。\n\n当前资料：\n${JSON.stringify({
    profile: {
      sex: snapshot.profile.sex,
      age: snapshot.profile.age,
      heightCm: snapshot.profile.heightCm,
      weightKg: recentMeasurements.find((item) => item.weightKg)?.weightKg ?? snapshot.profile.startWeightKg,
      goal: "12周减脂保肌",
    },
    session: session ? {
      id: session.id,
      workoutDayId: session.workoutDayId,
      week: session.programWeek,
      status: session.status,
      remainingTimeMinutes: session.timeBudgetMinutes,
      readiness: session.readiness,
      currentExercise: session.exercises[session.currentExerciseIndex]?.name,
      currentSetIndex: session.currentSetIndex,
      recentSets: completedSets,
      safetyHold: session.safetyHold,
    } : null,
    recentMeasurements,
  }, null, 2)}\n\n若需修改本次训练，请在回答末尾附纯 JSON（不要代码围栏）：\n${JSON.stringify({
    version: "STEADYCUT_ADVICE_V1",
    sessionId: session?.id ?? "NO_ACTIVE_SESSION",
    summary: "一句话总结",
    actions: [{ type: "keep", reason: "原因" }],
  }, null, 2)}\n允许 type：keep、change_weight、change_sets、rest、substitute、stop。重量调整 -10% 至 +5%，休息 60–300 秒；出现锐痛、麻木、关节不稳、胸痛、眩晕或异常气短时只能 stop。`;
}

function extractJson(text: string): string {
  const marker = text.indexOf("STEADYCUT_ADVICE_V1");
  if (marker < 0) throw new Error("没有找到 STEADYCUT_ADVICE_V1 调整代码");
  const start = text.lastIndexOf("{", marker);
  if (start < 0) throw new Error("调整代码格式不完整");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') inString = !inString;
    else if (!inString && character === "{") depth += 1;
    else if (!inString && character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error("调整代码缺少结束符号");
}

export function parseImportedAdvice(text: string, expectedSessionId: string, session?: WorkoutSession): ImportedAdvice {
  let parsed: ImportedAdvice;
  try {
    parsed = JSON.parse(extractJson(text)) as ImportedAdvice;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("调整代码不是有效 JSON");
    throw error;
  }
  if (parsed.version !== "STEADYCUT_ADVICE_V1") throw new Error("调整代码版本不受支持");
  if (parsed.sessionId !== expectedSessionId) throw new Error("这条建议不属于当前训练");
  if (!Array.isArray(parsed.actions) || parsed.actions.length === 0 || parsed.actions.length > 6) throw new Error("调整动作数量无效");
  const allowedIds = new Set(session?.exercises.flatMap((item) => [item.id, item.guideId]) ?? []);
  const hasDanger = session?.readiness.symptoms.some((item) => dangerous.has(item)) || session?.setEntries.some((item) => dangerous.has(item.feeling));
  for (const action of parsed.actions) {
    if (!["keep", "change_weight", "change_sets", "rest", "substitute", "stop"].includes(action.type)) throw new Error("包含未允许的调整动作");
    if (hasDanger && action.type !== "stop") throw new Error("当前有危险症状，只允许停止训练");
    if (action.type === "change_weight") {
      if (!allowedIds.has(action.exerciseId)) throw new Error("重量调整包含未知动作");
      if (!Number.isFinite(action.deltaPercent) || action.deltaPercent < -10 || action.deltaPercent > 5) throw new Error("重量调整超出安全边界");
    }
    if (action.type === "change_sets") {
      if (!allowedIds.has(action.exerciseId)) throw new Error("组数调整包含未知动作");
      if (!Number.isInteger(action.sets) || action.sets < 1 || action.sets > 5) throw new Error("组数调整超出安全边界");
    }
    if (action.type === "rest" && (!Number.isInteger(action.seconds) || action.seconds < 60 || action.seconds > 300)) throw new Error("休息时间超出安全边界");
    if (action.type === "substitute") {
      if (!allowedIds.has(action.fromExerciseId) || !EXERCISE_GUIDE_BY_ID.has(action.toExerciseId)) throw new Error("动作替换不在白名单");
    }
  }
  return parsed;
}
