import { buildWorkoutPlan, getWeekPolicy } from "../data/program";
import { EXERCISE_GUIDE_BY_ID } from "../data/exercises";
import type {
  CoachRecommendation,
  ReadinessCheck,
  SessionFeeling,
  SetEntry,
  WorkoutDayId,
  WorkoutSession,
} from "../domain/types";

const nowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const iso = () => new Date().toISOString();
const STOP_FEELINGS = new Set<SessionFeeling>([
  "sharp-pain",
  "numbness",
  "joint-instability",
  "chest-pain",
  "dizziness",
  "unusual-shortness-of-breath",
]);

const EQUIPMENT_REPLACEMENTS: Record<string, { keywords: string[]; replacementId: string }> = {
  "barbell-bench-press": { keywords: ["卧推架", "杠铃卧推", "平板凳"], replacementId: "machine-chest-press" },
  "back-squat": { keywords: ["深蹲架", "杠铃架", "深蹲"], replacementId: "leg-press" },
  "hack-squat": { keywords: ["哈克"], replacementId: "leg-press" },
  "lat-pulldown": { keywords: ["高位下拉"], replacementId: "pull-up" },
  "pull-up": { keywords: ["引体", "单杠"], replacementId: "lat-pulldown" },
  "seated-leg-curl": { keywords: ["腿弯举"], replacementId: "prone-leg-curl" },
  "rope-triceps-pushdown": { keywords: ["绳索", "下压器"], replacementId: "straight-bar-pushdown" },
};

const rec = (
  severity: CoachRecommendation["severity"],
  source: CoachRecommendation["source"],
  title: string,
  message: string,
  action: CoachRecommendation["action"],
): CoachRecommendation => ({
  id: nowId("rec"),
  severity,
  source,
  title,
  message,
  action,
  requiresConfirmation: action.type !== "none",
  createdAt: iso(),
});

export function defaultReadiness(timeBudgetMinutes = 60): ReadinessCheck {
  return {
    sleepHours: 8,
    energy: 3,
    soreness: "none",
    symptoms: [],
    symptomArea: "",
    hoursSinceMeal: 2,
    unavailableEquipment: [],
    timeBudgetMinutes,
  };
}

export function evaluateReadiness(readiness: ReadinessCheck, week: number): CoachRecommendation[] {
  const dangerous = readiness.symptoms.filter((item) => STOP_FEELINGS.has(item));
  if (dangerous.length) {
    return [rec("stop", "safety", "安全暂停", "你记录了锐痛、麻木、关节不稳或异常全身症状。停止本次训练；症状严重、持续或反复时及时就医。", { type: "safety-hold", reason: dangerous.join(",") })];
  }
  const recommendations: CoachRecommendation[] = [];
  const policy = getWeekPolicy(week);
  if (policy.deload) recommendations.push(rec("info", "week", policy.label, "本周正式组约减半，工作重量按平常的90%左右执行，不测试极限。", { type: "none" }));
  if (readiness.sleepHours < 6 || readiness.energy <= 2) {
    recommendations.push(rec("adjust", "readiness", "恢复状态偏低", "今天所有动作多保留1次余力；首个正式组如果发沉，再减重5%。", { type: "reduce-load", percent: 5 }));
  }
  if (readiness.soreness === "severe") recommendations.push(rec("warning", "readiness", "酸痛较重", "缩小无痛范围，并优先更换不刺激酸痛区域的器械动作。", { type: "reduce-sets", amount: 1 }));
  if (readiness.hoursSinceMeal !== null && readiness.hoursSinceMeal >= 5) recommendations.push(rec("info", "readiness", "距离进食较久", "若没有胃肠不适，训练前补充一份易消化碳水和水；不要因空腹强行追重量。", { type: "none" }));
  if (readiness.timeBudgetMinutes <= 30) recommendations.push(rec("info", "time", "30分钟核心版", "保留三个核心动作，完成后即可收操。", { type: "none" }));
  else if (readiness.timeBudgetMinutes <= 45) recommendations.push(rec("info", "time", "45分钟精简版", "保留复合动作，压缩低优先级手臂与小肌群训练。", { type: "none" }));
  return recommendations;
}

export function startWorkoutSession(day: WorkoutDayId, week: number, readiness: ReadinessCheck, history: WorkoutSession[] = []): WorkoutSession {
  const timestamp = iso();
  const recommendations = evaluateReadiness(readiness, week);
  const safety = recommendations.find((item) => item.action.type === "safety-hold");
  const exercises = buildWorkoutPlan(day, { week, timeBudgetMinutes: readiness.timeBudgetMinutes });
  const unavailable = readiness.unavailableEquipment.join(" ").toLowerCase();
  for (const exercise of exercises) {
    const replacement = EQUIPMENT_REPLACEMENTS[exercise.guideId];
    if (!replacement || !replacement.keywords.some((keyword) => unavailable.includes(keyword))) continue;
    const guide = EXERCISE_GUIDE_BY_ID.get(replacement.replacementId);
    if (!guide) continue;
    recommendations.push(rec(
      "adjust",
      "equipment",
      `${exercise.name}器械受限`,
      `检测到器械限制，建议改为${guide.name}；请确认后应用，重量需要重新选择无痛起始值。`,
      { type: "replace-exercise", exerciseId: exercise.id, replacementId: guide.id },
    ));
  }
  const previous = history.find((item) => item.workoutDayId === day && item.status === "completed");
  if (previous) {
    for (const exercise of exercises) {
      const priorExercise = previous.exercises.find((item) => item.guideId === exercise.guideId);
      if (!priorExercise) continue;
      const priorSets = previous.setEntries.filter((item) => item.exerciseId === priorExercise.id && item.completedAt);
      const lastWeight = [...priorSets].reverse().find((item) => item.actualWeightKg !== null)?.actualWeightKg ?? null;
      if (lastWeight !== null) exercise.startingWeightKg = lastWeight;
      const earnedProgression = priorSets.length >= priorExercise.sets && priorSets.every((item) => (item.actualReps ?? 0) >= priorExercise.repMax && (item.actualRir ?? 0) >= 1 && (item.actualRir ?? 9) <= 2 && item.stability !== "unstable");
      if (earnedProgression && lastWeight !== null) exercise.startingWeightKg = Math.round((lastWeight + exercise.incrementKg) * 2) / 2;
    }
  }
  return {
    id: nowId("session"),
    workoutDayId: day,
    programWeek: Math.min(12, Math.max(1, Math.round(week))),
    status: safety ? "safety-hold" : "ready",
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    timeBudgetMinutes: readiness.timeBudgetMinutes,
    readiness,
    exercises,
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    setEntries: [],
    restEndsAt: null,
    restNotificationId: null,
    safetyHold: safety ? { active: true, reasons: [safety.message], createdAt: timestamp } : null,
    recommendations,
  };
}

export function evaluateSetFeedback(set: SetEntry, exerciseName: string): CoachRecommendation[] {
  if (STOP_FEELINGS.has(set.feeling)) {
    return [rec("stop", "safety", "立即停止这个动作", `${exerciseName}出现需要安全暂停的症状。不要一键照常继续。`, { type: "safety-hold", reason: set.feeling })];
  }
  if (set.feeling === "joint-discomfort") return [rec("warning", "safety", "关节不适", "先停止本动作，检查设置与活动范围；若不适仍在，改做无痛替代动作。", { type: "reduce-load", percent: 10, exerciseId: set.exerciseId })];
  if ((set.actualReps ?? 0) < set.targetReps || (set.actualRir ?? 2) <= 0 || set.stability === "unstable") {
    return [rec("adjust", "set", "下一组减重", "本组低于目标、到力竭或动作不稳；下一组减重5%–10%，保住动作质量。", { type: "reduce-load", percent: set.stability === "unstable" ? 10 : 5, exerciseId: set.exerciseId })];
  }
  return [];
}

export type CoachIntent = "time" | "sleep" | "heavy" | "equipment" | "pain" | "rest" | "guide" | "general";

export function parseCoachIntent(text: string): CoachIntent {
  const value = text.trim().toLowerCase();
  if (/分钟|时间|赶时间/.test(value)) return "time";
  if (/睡|困|没精神|疲劳/.test(value)) return "sleep";
  if (/太重|做不动|力竭|rir\s*0/.test(value)) return "heavy";
  if (/占了|器械|没有.*机/.test(value)) return "equipment";
  if (/痛|麻|不稳|胸闷|头晕|气短/.test(value)) return "pain";
  if (/休息|还要多久|计时/.test(value)) return "rest";
  if (/怎么做|教学|动作/.test(value)) return "guide";
  return "general";
}

export function respondToLocalCoach(text: string, session?: WorkoutSession | null): { intent: CoachIntent; text: string; recommendation?: CoachRecommendation } {
  const intent = parseCoachIntent(text);
  const current = session?.exercises[session.currentExerciseIndex];
  if (intent === "pain") {
    const urgent = /锐痛|麻|不稳|胸痛|胸闷|头晕|气短/.test(text);
    return urgent
      ? { intent, text: "先停止训练并坐到安全位置。锐痛、麻木、关节不稳、胸痛、眩晕或异常气短不能用普通训练建议覆盖；严重、持续或反复时及时就医。", recommendation: rec("stop", "safety", "安全暂停", "记录到危险症状，停止本次训练。", { type: "safety-hold", reason: text }) }
      : { intent, text: "先停下当前动作，确认不适部位和性质。只在完全无痛的设置、轻重量或替代动作下继续；不适仍在就结束该动作。" };
  }
  if (intent === "time") return { intent, text: "我会按30/45/60分钟规则保留核心动作。30分钟做前三个核心动作；45分钟保留复合动作并压缩低优先级辅助量。" };
  if (intent === "sleep") return { intent, text: "睡眠不足6小时或精神很差时，今天多保留1次余力；首组发沉就减重约5%，不要测试极限。" };
  if (intent === "heavy") return { intent, text: "如果第一组低于次数下限、RIR 0或动作不稳，下一组减重5%–10%，休息足够后再做。", recommendation: current ? rec("adjust", "set", "下一组减重", "本组反馈偏重。", { type: "reduce-load", percent: 5, exerciseId: current.id }) : undefined };
  if (intent === "equipment") return { intent, text: `当前${current?.name ?? "动作"}器械被占时，打开动作教学里的“替代动作”；先选相同动作模式、且无痛的器械。` };
  if (intent === "rest") {
    const seconds = session?.restEndsAt ? Math.max(0, Math.ceil((new Date(session.restEndsAt).getTime() - Date.now()) / 1000)) : 0;
    return { intent, text: seconds > 0 ? `还需休息约${seconds}秒。保持呼吸，下一组前确认动作和目标次数。` : "休息已结束；如果呼吸还没恢复或复合动作动作感不稳，可再加30–60秒。" };
  }
  if (intent === "guide") return { intent, text: current ? `打开「${current.name}」教学，可逐帧查看设置、离心、向心、常见错误和停止信号。` : "从动作库选择动作，可逐帧查看设置、轨迹、错误修正和停止信号。" };
  return { intent, text: current ? `你现在在${current.name}。先守住目标RIR和稳定轨迹；把这一组的重量、次数、RIR与不适反馈告诉我。` : "我可以处理训练时间、睡眠、重量过重、器械被占、疼痛、休息计时和动作教学。" };
}
