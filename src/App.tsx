import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Barbell, BookOpen, BowlFood, Brain, CaretRight, ChartLineUp, Check, CheckCircle, ClipboardText,
  Clock, CloudSlash, CookingPot, DownloadSimple, ForkKnife, GearSix, House, Lightning, ListMagnifyingGlass,
  LockKey, Moon, PersonSimpleRun, Plus, ShieldCheck, Sparkle, StopCircle, Sun, Timer, UploadSimple, Warning,
} from "@phosphor-icons/react";
import { ExerciseGuideModal } from "./components/ExerciseGuideModal";
import { EXERCISE_GUIDES, EXERCISE_GUIDE_BY_ID, type ExerciseGuide } from "./data/exercises";
import { PROGRAM, PROGRAM_ORDER, getWeekPolicy } from "./data/program";
import type { AppSnapshot, DailyLog, Measurement, ReadinessCheck, SessionFeeling, SetEntry, WorkoutDayId, WorkoutSession } from "./domain/types";
import { useSnapshot } from "./hooks/useSnapshot";
import { decryptBackup, downloadBackup, encryptBackup } from "./lib/backup";
import { composeChatGPTHandoff, parseImportedAdvice, type ImportedAdvice } from "./lib/chatgpt";
import { defaultReadiness, evaluateSetFeedback, respondToLocalCoach, startWorkoutSession } from "./lib/coach";
import { createSessionLock } from "./lib/crossTab";
import { getLegacyBackup } from "./lib/storage";
import { cancelRestNotification, copyText, hapticPulse, notifyRestFinished, requestPwaInstall, scheduleRestNotification, setScreenAwake, setupPwaInstall } from "./lib/platform";

type Route = "today" | "coach" | "workout" | "nutrition" | "progress" | "library" | "more";
const ROUTES = new Set<Route>(["today", "coach", "workout", "nutrition", "progress", "library", "more"]);
const routeFromHash = (): Route => {
  const raw = window.location.hash.replace("#", "") as Route;
  return ROUTES.has(raw) ? raw : "today";
};
const go = (route: Route) => { window.location.hash = route; };
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const numberOrNull = (value: string) => value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function getProgramWeek(startDate: string) {
  const start = new Date(`${startDate}T12:00:00`).getTime();
  const now = new Date(`${today()}T12:00:00`).getTime();
  return clamp(Math.floor((now - start) / 604_800_000) + 1, 1, 12);
}

function emptyDaily(date: string): DailyLog {
  return { date, caloriesKcal: null, proteinG: null, fatG: null, carbsG: null, vegetablesG: null, fruitServings: null, waterMl: null, steps: null, cardioMinutes: null, bodyWeightKg: null, friedChickenMeal: false, note: "" };
}

function calculateCalories(weightKg: number, heightCm: number, age: number) {
  if (weightKg >= 68 && weightKg <= 80) return 2150;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  return Math.round((bmr * 1.5 * .84) / 50) * 50;
}

const NAV: Array<{ id: Route; label: string; icon: typeof House }> = [
  { id: "today", label: "今天", icon: House }, { id: "coach", label: "教练", icon: Brain },
  { id: "workout", label: "训练", icon: Barbell }, { id: "nutrition", label: "饮食", icon: BowlFood },
  { id: "progress", label: "进度", icon: ChartLineUp },
];
const isNavActive = (route: Route, itemId: Route) => route === itemId || (itemId === "workout" && route === "library");

export default function App() {
  const { snapshot, update, replace, error, clearError } = useSnapshot();
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [guide, setGuide] = useState<ExerciseGuide | null>(null);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [toast, setToast] = useState("");
  const [lockConflict, setLockConflict] = useState(false);
  const lock = useRef<ReturnType<typeof createSessionLock> | null>(null);

  useEffect(() => { const handler = () => setRoute(routeFromHash()); window.addEventListener("hashchange", handler); return () => window.removeEventListener("hashchange", handler); }, []);
  useEffect(() => setupPwaInstall(setInstallAvailable), []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2800); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!snapshot) return;
    document.documentElement.dataset.theme = snapshot.settings.theme;
    document.documentElement.classList.toggle("reduce-motion", snapshot.settings.reduceMotion);
  }, [snapshot?.settings.theme, snapshot?.settings.reduceMotion]);
  useEffect(() => {
    lock.current = createSessionLock(() => setLockConflict(true));
    return () => lock.current?.destroy();
  }, []);
  useEffect(() => {
    if (snapshot?.activeSessionId) { lock.current?.acquire(snapshot.activeSessionId); setLockConflict(false); }
    else lock.current?.release();
  }, [snapshot?.activeSessionId]);
  useEffect(() => { setScreenAwake(Boolean(snapshot?.activeSessionId && snapshot.settings.keepScreenAwake)); }, [snapshot?.activeSessionId, snapshot?.settings.keepScreenAwake]);

  if (!snapshot) return <div className="boot-screen"><div className="brand-mark"><Barbell weight="bold" /></div><p>{error || "正在恢复你的训练记录…"}</p></div>;
  const week = getProgramWeek(snapshot.profile.startDate);
  const activeSession = snapshot.workoutSessions.find((item) => item.id === snapshot.activeSessionId) ?? null;

  return (
    <div className="app-frame">
      <aside className="desktop-rail" aria-label="电脑端导航">
        <button className="rail-brand" onClick={() => go("today")} aria-label="返回今天" title="SteadyCut"><Barbell weight="bold" /></button>
        <div className="rail-nav">{NAV.map((item) => { const Icon = item.icon; const active = isNavActive(route, item.id); return <button key={item.id} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => go(item.id)} aria-label={item.label} title={item.label}><Icon size={23} weight={active ? "fill" : "regular"} /><span>{item.label}</span></button>; })}</div>
        <button className={route === "more" ? "rail-more active" : "rail-more"} onClick={() => go("more")} aria-current={route === "more" ? "page" : undefined} aria-label="更多设置" title="更多设置"><GearSix size={22} /></button>
      </aside>
      <div className="app-shell">
      <header className="app-header">
        <button className="brand-button" onClick={() => go("today")} aria-label="返回今天"><span className="brand-mark mini"><Barbell weight="bold" /></span><span><b>STEADYCUT</b><small>本地私人教练</small></span></button>
        <div className="header-actions"><span className="week-chip">W{week}<small>/12</small></span><button className="icon-button" aria-label="更多设置" onClick={() => go("more")}><GearSix size={22} /></button></div>
      </header>

      <main className="app-main">
        {route === "today" && <TodayPage snapshot={snapshot} week={week} activeSession={activeSession} onGuide={setGuide} />}
        {route === "coach" && <CoachPage snapshot={snapshot} activeSession={activeSession} update={update} setToast={setToast} />}
        {route === "workout" && <WorkoutPage snapshot={snapshot} week={week} activeSession={activeSession} update={update} onGuide={setGuide} setToast={setToast} locked={lockConflict} />}
        {route === "nutrition" && <NutritionPage snapshot={snapshot} update={update} />}
        {route === "progress" && <ProgressPage snapshot={snapshot} update={update} />}
        {route === "library" && <LibraryPage onGuide={setGuide} />}
        {route === "more" && <MorePage snapshot={snapshot} update={update} replace={replace} installAvailable={installAvailable} setToast={setToast} />}
      </main>

      <nav className="bottom-nav" aria-label="主导航">{NAV.map((item) => { const Icon = item.icon; const active = isNavActive(route, item.id); return <button key={item.id} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => go(item.id)}><Icon size={23} weight={active ? "fill" : "regular"} /><span>{item.label}</span></button>; })}</nav>
      {guide && <ExerciseGuideModal guide={guide} onClose={() => setGuide(null)} />}
      {(toast || error) && <div className="toast" role="status" onClick={clearError}>{error || toast}</div>}
      </div>
    </div>
  );
}

function PageIntro({ eyebrow, title, text, action }: { eyebrow: string; title: string; text?: string; action?: React.ReactNode }) {
  return <div className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{text && <p>{text}</p>}</div>{action}</div>;
}

function TodayPage({ snapshot, week, activeSession, onGuide }: { snapshot: AppSnapshot; week: number; activeSession: WorkoutSession | null; onGuide: (guide: ExerciseGuide) => void }) {
  const date = today();
  const daily = snapshot.dailyLogs[date] ?? emptyDaily(date);
  const selected = PROGRAM[snapshot.selectedWorkoutDay];
  const recent = [...snapshot.measurements].sort((a, b) => b.date.localeCompare(a.date));
  const weight = recent.find((item) => item.weightKg)?.weightKg ?? snapshot.profile.startWeightKg;
  const waist = recent.find((item) => item.waistCm)?.waistCm ?? snapshot.profile.startWaistCm;
  const proteinPct = clamp(((daily.proteinG ?? 0) / snapshot.profile.proteinTargetG) * 100, 0, 100);
  const caloriePct = clamp(((daily.caloriesKcal ?? 0) / snapshot.profile.calorieTargetKcal) * 100, 0, 110);
  return <>
    <PageIntro eyebrow={`${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })} · 第${week}周`} title={snapshot.profile.name ? `${snapshot.profile.name}，今天稳住节奏` : "今天稳住节奏"} text="减脂靠趋势，保肌靠训练质量。" />
    {!weight && <section className="alert-card amber"><Warning size={22} /><div><strong>先完成首次称重</strong><p>在健身房记录准确体重与肚脐水平腰围。只有体重在68–80kg时，2150 kcal才作为默认起点。</p></div><button onClick={() => go("more")}>去录入</button></section>}
    <section className="hero-workout">
      <div className="hero-grid"><div><span className="status-dot" />{activeSession ? "训练可恢复" : "下次训练"}</div><span className="hero-week">W{week} / 12</span></div>
      <div className="hero-week-progress"><span>{getWeekPolicy(week).label}</span><div className="progress-track"><i style={{ width: `${(week / 12) * 100}%` }} /></div></div>
      <h2>{activeSession ? PROGRAM[activeSession.workoutDayId].title : selected.title}</h2>
      <p>{activeSession ? `已自动保存至第${activeSession.currentExerciseIndex + 1}个动作` : `${selected.exercises.length}个动作 · 按可用时间自动精简`}</p>
      <button className="primary-button" onClick={() => go("workout")}>{activeSession ? "继续训练" : "训练前检查"}<ArrowRight weight="bold" /></button>
      {!activeSession && <div className="next-exercises">{selected.exercises.slice(0, 3).map((item, index) => <button key={item.id} onClick={() => { const found = EXERCISE_GUIDE_BY_ID.get(item.guideId); if (found) onGuide(found); }}><span>{String(index + 1).padStart(2, "0")}</span><b>{item.name}</b><CaretRight /></button>)}</div>}
    </section>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">今日执行</span><h2>四个控制量</h2></div><button className="text-button" onClick={() => go("nutrition")}>记录饮食</button></div><div className="metric-grid">
      <Metric label="热量" value={daily.caloriesKcal ? `${daily.caloriesKcal}` : "—"} unit={`/ ${snapshot.profile.calorieTargetKcal} kcal`} progress={caloriePct} />
      <Metric label="蛋白质" value={daily.proteinG ? `${daily.proteinG}` : "—"} unit={`/ ${snapshot.profile.proteinTargetG} g`} progress={proteinPct} />
      <Metric label="步数" value={daily.steps ? daily.steps.toLocaleString() : "—"} unit={`/ ${snapshot.profile.stepOverride ?? (week === 1 ? 6500 : week === 2 ? 7500 : 8000)}`} progress={clamp(((daily.steps ?? 0) / (snapshot.profile.stepOverride ?? (week === 1 ? 6500 : week === 2 ? 7500 : 8000))) * 100, 0, 100)} />
      <Metric label="身体" value={weight ? `${weight}` : "—"} unit={`kg · 腰围 ${waist ?? "—"} cm`} progress={weight ? 100 : 0} />
    </div></section>
    <section className="coach-prompt" onClick={() => go("coach")}><span className="brand-mark mini"><Brain weight="fill" /></span><div><span>本地教练</span><strong>训练前、组间都可以问我</strong><p>“这一组太重” · “器械被占了” · “肩膀不舒服”</p></div><CaretRight /></section>
    <section className="offline-strip"><CloudSlash /><span><b>完全离线可用</b>训练、计时和29套教学不会因网络中断而停。</span></section>
  </>;
}

function Metric({ label, value, unit, progress }: { label: string; value: string; unit: string; progress: number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{unit}</small><div className="progress-track"><i style={{ width: `${Math.min(100, progress)}%` }} /></div></article>;
}

function WorkoutPage({ snapshot, week, activeSession, update, onGuide, setToast, locked }: { snapshot: AppSnapshot; week: number; activeSession: WorkoutSession | null; update: (fn: (draft: AppSnapshot) => void) => void; onGuide: (guide: ExerciseGuide) => void; setToast: (text: string) => void; locked: boolean }) {
  const [precheck, setPrecheck] = useState(false);
  if (activeSession) return <LiveWorkout session={activeSession} settings={snapshot.settings} update={update} onGuide={onGuide} setToast={setToast} locked={locked} />;
  if (precheck) return <ReadinessPanel week={week} day={snapshot.selectedWorkoutDay} onCancel={() => setPrecheck(false)} onStart={(readiness) => {
    const session = startWorkoutSession(snapshot.selectedWorkoutDay, week, readiness, snapshot.workoutSessions);
    update((draft) => { draft.workoutSessions.unshift(session); draft.activeSessionId = session.id; });
    if (snapshot.settings.vibration) hapticPulse("success"); setPrecheck(false);
  }} />;
  const selected = PROGRAM[snapshot.selectedWorkoutDay];
  const history = snapshot.workoutSessions.filter((item) => item.status === "completed").slice(0, 5);
  const exerciseGroups = ([1, 2, 3] as const).map((priority) => ({ priority, items: selected.exercises.filter((item) => item.priority === priority) })).filter((group) => group.items.length > 0);
  const priorityLabels: Record<1 | 2 | 3, string> = { 1: "核心动作", 2: "主要辅助", 3: "可选收尾" };
  return <>
    <PageIntro eyebrow="训练 · 四天分化" title="按恢复状态执行" text="正式组大多保留2次余力；第6、12周自动减量。" action={<button className="library-button" onClick={() => go("library")}><BookOpen />动作库</button>} />
    <div className="segmented day-selector">{PROGRAM_ORDER.map((id) => <button key={id} className={snapshot.selectedWorkoutDay === id ? "active" : ""} onClick={() => update((draft) => { draft.selectedWorkoutDay = id; })}>{PROGRAM[id].shortName}</button>)}</div>
    <section className="plan-card"><div className="plan-head"><div><span>{getWeekPolicy(week).label}</span><h2>{selected.title}</h2></div><strong>{selected.exercises.reduce((sum, item) => sum + item.sets, 0)}<small>组</small></strong></div><div className="plan-list">{exerciseGroups.map((group) => <section className={`plan-group priority-${group.priority}`} key={group.priority}><span className="plan-group-label">{priorityLabels[group.priority]}</span>{group.items.map((item) => { const index = selected.exercises.indexOf(item); return <button key={item.id} onClick={() => { const found = EXERCISE_GUIDE_BY_ID.get(item.guideId); if (found) onGuide(found); }}><span>{index + 1}</span><div><b>{item.name}</b><small>{item.sets} × {item.repMin}–{item.repMax} · RIR {week === 1 ? 3 : 2}</small></div><BookOpen /></button>; })}</section>)}</div><button className="primary-button full" onClick={() => setPrecheck(true)}><Lightning weight="fill" />开始训练前检查</button></section>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">历史</span><h2>最近完成</h2></div></div>{history.length ? <div className="history-list">{history.map((item) => <article key={item.id}><CheckCircle weight="fill" /><div><b>{PROGRAM[item.workoutDayId].shortName}</b><span>{new Date(item.startedAt).toLocaleDateString("zh-CN")} · {item.setEntries.filter((set) => set.completedAt).length}组</span></div><strong>完成</strong></article>)}</div> : <div className="empty-state"><Barbell /><p>第一条完成记录会出现在这里。</p></div>}</section>
  </>;
}

function ReadinessPanel({ week, day, onCancel, onStart }: { week: number; day: WorkoutDayId; onCancel: () => void; onStart: (value: ReadinessCheck) => void }) {
  const [value, setValue] = useState(() => defaultReadiness(60));
  const symptoms: Array<{ id: SessionFeeling; label: string }> = [{ id: "joint-discomfort", label: "关节不适" }, { id: "sharp-pain", label: "锐痛" }, { id: "numbness", label: "麻木" }, { id: "joint-instability", label: "关节不稳" }, { id: "chest-pain", label: "胸痛" }, { id: "dizziness", label: "眩晕" }, { id: "unusual-shortness-of-breath", label: "异常气短" }];
  const toggleSymptom = (id: SessionFeeling) => setValue((current) => ({ ...current, symptoms: current.symptoms.includes(id) ? current.symptoms.filter((item) => item !== id) : [...current.symptoms, id] }));
  return <section className="precheck-page"><button className="text-button back" onClick={onCancel}>← 返回计划</button><PageIntro eyebrow={`第${week}周 · ${PROGRAM[day].shortName}`} title="20秒训练前检查" text="危险症状优先于任何训练计划。" />
    <div className="form-section"><label>今天能练多久？</label><div className="choice-grid four">{[30, 45, 60].map((minutes) => <button key={minutes} className={value.timeBudgetMinutes === minutes ? "selected" : ""} onClick={() => setValue({ ...value, timeBudgetMinutes: minutes })}>{minutes}<small>分钟</small></button>)}<label className="custom-choice"><input aria-label="自定义训练分钟" inputMode="numeric" value={[30,45,60].includes(value.timeBudgetMinutes) ? "" : value.timeBudgetMinutes} placeholder="自定" onChange={(event) => setValue({ ...value, timeBudgetMinutes: clamp(Number(event.target.value) || 30, 20, 90) })} /><small>分钟</small></label></div></div>
    <div className="form-section two-col"><label>昨晚睡眠<input type="number" inputMode="decimal" min="0" max="14" step="0.5" value={value.sleepHours} onChange={(event) => setValue({ ...value, sleepHours: clamp(Number(event.target.value), 0, 14) })} /><span>小时</span></label><label>精神状态<select value={value.energy} onChange={(event) => setValue({ ...value, energy: Number(event.target.value) as ReadinessCheck["energy"] })}><option value="1">1 · 很差</option><option value="2">2 · 偏低</option><option value="3">3 · 正常</option><option value="4">4 · 不错</option><option value="5">5 · 很好</option></select></label></div>
    <div className="form-section"><label>肌肉酸痛</label><div className="segmented">{(["none","mild","moderate","severe"] as const).map((id, index) => <button key={id} className={value.soreness === id ? "active" : ""} onClick={() => setValue({ ...value, soreness: id })}>{["没有","轻微","中等","严重"][index]}</button>)}</div></div>
    <div className="form-section"><label>今天有没有这些情况？</label><div className="symptom-grid">{symptoms.map((item) => <button key={item.id} className={value.symptoms.includes(item.id) ? "selected danger" : ""} onClick={() => toggleSymptom(item.id)}>{value.symptoms.includes(item.id) ? <Warning weight="fill" /> : <Plus />}{item.label}</button>)}</div>{value.symptoms.length > 0 && <input className="full-input" placeholder="不适部位，例如：右肩前侧" value={value.symptomArea} onChange={(event) => setValue({ ...value, symptomArea: event.target.value })} />}</div>
    <div className="form-section two-col"><label>距上次进食<input type="number" inputMode="decimal" min="0" max="24" step="0.5" value={value.hoursSinceMeal ?? ""} onChange={(event) => setValue({ ...value, hoursSinceMeal: numberOrNull(event.target.value) })} /><span>小时</span></label><label>器械限制<input placeholder="如：深蹲架被占" onChange={(event) => setValue({ ...value, unavailableEquipment: event.target.value ? [event.target.value] : [] })} /></label></div>
    <button className={`primary-button full sticky-cta ${value.symptoms.some((item) => ["sharp-pain","numbness","joint-instability","chest-pain","dizziness","unusual-shortness-of-breath"].includes(item)) ? "danger-button" : ""}`} onClick={() => onStart(value)}>{value.symptoms.some((item) => ["sharp-pain","numbness","joint-instability","chest-pain","dizziness","unusual-shortness-of-breath"].includes(item)) ? <><StopCircle />进入安全暂停</> : <><Check />生成本次计划</>}</button>
  </section>;
}

function LiveWorkout({ session, settings, update, onGuide, setToast, locked }: { session: WorkoutSession; settings: AppSnapshot["settings"]; update: (fn: (draft: AppSnapshot) => void) => void; onGuide: (guide: ExerciseGuide) => void; setToast: (text: string) => void; locked: boolean }) {
  const exercise = session.exercises[session.currentExerciseIndex];
  const [weight, setWeight] = useState(String((exercise?.startingWeightKg ?? 0) * (exercise?.weightScale ?? 1) || ""));
  const [reps, setReps] = useState(String(exercise?.repMin ?? ""));
  const [rir, setRir] = useState(String(exercise?.targetRir ?? 2));
  const [stability, setStability] = useState<SetEntry["stability"]>("stable");
  const [feeling, setFeeling] = useState<SessionFeeling>("none");
  const [area, setArea] = useState("");
  const [seconds, setSeconds] = useState(0);
  const notified = useRef(false);

  useEffect(() => {
    setWeight(String((exercise?.startingWeightKg ?? 0) * (exercise?.weightScale ?? 1) || "")); setReps(String(exercise?.repMin ?? "")); setRir(String(exercise?.targetRir ?? 2)); setStability("stable"); setFeeling("none"); setArea("");
  }, [session.currentExerciseIndex, session.currentSetIndex, exercise?.id]);
  useEffect(() => {
    if (!session.restEndsAt) { setSeconds(0); notified.current = false; return; }
    const tick = () => {
      const next = Math.max(0, Math.ceil((new Date(session.restEndsAt!).getTime() - Date.now()) / 1000));
      setSeconds(next);
      if (next === 0 && !notified.current) { notified.current = true; if (settings.vibration) hapticPulse("success"); if (settings.restNotifications && session.status === "rest") notifyRestFinished(); }
    };
    tick(); const timer = window.setInterval(tick, 500); return () => clearInterval(timer);
  }, [session.restEndsAt, session.status, settings.vibration, settings.restNotifications]);
  useEffect(() => {
    const id = session.restNotificationId;
    if (id === null || id === undefined) return;
    if (session.status === "rest" && session.restEndsAt && settings.restNotifications) {
      void scheduleRestNotification(session.restEndsAt, id);
    } else {
      void cancelRestNotification(id);
    }
  }, [session.status, session.restEndsAt, session.restNotificationId, settings.restNotifications]);

  const mutateSession = (fn: (draft: WorkoutSession, root: AppSnapshot) => void) => update((root) => { const draft = root.workoutSessions.find((item) => item.id === session.id); if (draft) { fn(draft, root); draft.updatedAt = new Date().toISOString(); } });
  const finish = () => { void cancelRestNotification(session.restNotificationId); mutateSession((draft, root) => { draft.status = "completed"; draft.completedAt = new Date().toISOString(); draft.restEndsAt = null; draft.restNotificationId = null; root.activeSessionId = null; }); };
  const abandon = () => { void cancelRestNotification(session.restNotificationId); mutateSession((draft, root) => { draft.status = "abandoned"; draft.completedAt = new Date().toISOString(); draft.restEndsAt = null; draft.restNotificationId = null; root.activeSessionId = null; }); };
  const advance = () => mutateSession((draft) => {
    const current = draft.exercises[draft.currentExerciseIndex];
    if (draft.currentSetIndex + 1 < current.sets) draft.currentSetIndex += 1;
    else { draft.currentExerciseIndex += 1; draft.currentSetIndex = 0; }
    void cancelRestNotification(draft.restNotificationId);
    draft.status = "active"; draft.restEndsAt = null; draft.restNotificationId = null;
  });
  const adjustRest = (deltaSeconds: number) => mutateSession((draft) => {
    if (!draft.restEndsAt) return;
    const next = new Date(new Date(draft.restEndsAt).getTime() + deltaSeconds * 1_000).toISOString();
    draft.restEndsAt = next;
    if (draft.restNotificationId && settings.restNotifications) void scheduleRestNotification(next, draft.restNotificationId);
  });
  const submitSet = () => {
    if (!exercise || locked) return;
    const entry: SetEntry = { id: uid("set"), exerciseId: exercise.id, setNumber: session.currentSetIndex + 1, targetWeightKg: exercise.startingWeightKg, targetReps: exercise.repMin, targetRir: exercise.targetRir, actualWeightKg: numberOrNull(weight), actualReps: numberOrNull(reps), actualRir: numberOrNull(rir), stability, feeling, symptomArea: area, completedAt: new Date().toISOString() };
    const feedback = evaluateSetFeedback(entry, exercise.name);
    const stop = feedback.find((item) => item.action.type === "safety-hold");
    const last = session.currentExerciseIndex === session.exercises.length - 1 && session.currentSetIndex === exercise.sets - 1;
    const restEndsAt = new Date(Date.now() + exercise.restSeconds * 1000).toISOString();
    const restNotificationId = Math.floor(Date.now() % 2_000_000_000);
    mutateSession((draft, root) => {
      draft.setEntries.push(entry); draft.recommendations.unshift(...feedback);
      if (stop) { draft.status = "safety-hold"; draft.safetyHold = { active: true, reasons: [stop.message], createdAt: new Date().toISOString() }; draft.restEndsAt = null; draft.restNotificationId = null; }
      else if (last) { draft.status = "summary"; draft.restEndsAt = null; draft.restNotificationId = null; }
      else { draft.status = "rest"; draft.restEndsAt = restEndsAt; draft.restNotificationId = restNotificationId; }
    });
    if (settings.vibration) hapticPulse(stop ? "warning" : last ? "success" : "light");
    if (last) setToast("最后一组已保存，请完成训练总结");
  };
  const applyRecommendation = (id: string) => mutateSession((draft) => {
    const recommendation = draft.recommendations.find((item) => item.id === id); if (!recommendation) return;
    const action = recommendation.action;
    recommendation.undo = { exercises: structuredClone(draft.exercises), restEndsAt: draft.restEndsAt, restNotificationId: draft.restNotificationId ?? null };
    if (action.type === "reduce-load") draft.exercises.filter((item) => !action.exerciseId || item.id === action.exerciseId).forEach((item) => { item.startingWeightKg = item.startingWeightKg ? Math.round(item.startingWeightKg * (1 - action.percent / 100) * 2) / 2 : null; });
    if (action.type === "reduce-sets") draft.exercises.filter((item) => !action.exerciseId || item.id === action.exerciseId).forEach((item) => { item.sets = Math.max(1, item.sets - action.amount); });
    if (action.type === "replace-exercise") {
      const exercise = draft.exercises.find((item) => item.id === action.exerciseId);
      const replacement = EXERCISE_GUIDE_BY_ID.get(action.replacementId);
      if (exercise && replacement) { exercise.replacementFor = exercise.guideId; exercise.guideId = replacement.id; exercise.name = replacement.name; exercise.startingWeightKg = null; }
    }
    recommendation.requiresConfirmation = false; recommendation.appliedAt = new Date().toISOString();
  });
  const undoRecommendation = (id: string) => mutateSession((draft) => {
    const recommendation = draft.recommendations.find((item) => item.id === id); if (!recommendation?.undo) return;
    const changedAfterApply = recommendation.appliedAt && draft.setEntries.some((item) => item.completedAt && item.completedAt > recommendation.appliedAt!);
    if (changedAfterApply) { setToast("已有后续组记录，不能撤销这项调整"); return; }
    void cancelRestNotification(draft.restNotificationId);
    draft.exercises = structuredClone(recommendation.undo.exercises);
    draft.restEndsAt = recommendation.undo.restEndsAt;
    draft.restNotificationId = recommendation.undo.restNotificationId;
    recommendation.undo = undefined; recommendation.appliedAt = undefined; recommendation.requiresConfirmation = true;
  });

  if (locked) return <section className="safety-hold"><LockKey size={42} /><span className="eyebrow">只读保护</span><h1>另一个标签页正在修改本次训练</h1><p>为避免同一组被重复保存，这个页面已停止写入。关闭另一标签页后刷新即可继续。</p></section>;
  if (session.status === "safety-hold") return <section className="safety-hold danger"><StopCircle size={48} weight="fill" /><span className="eyebrow">安全暂停</span><h1>本次训练不能照常继续</h1><p>{session.safetyHold?.reasons.join("；")}</p><div className="safety-actions"><button className="danger-button" onClick={abandon}>结束并保存记录</button><button className="secondary-button" onClick={() => { const found = exercise && EXERCISE_GUIDE_BY_ID.get(exercise.guideId); if (found) onGuide(found); }}>查看无痛设置</button></div><small>胸痛、眩晕、异常气短或严重症状请及时寻求医疗帮助。</small></section>;
  if (session.status === "ready") return <section className="session-ready"><span className="eyebrow">计划已生成 · {session.timeBudgetMinutes}分钟</span><h1>{PROGRAM[session.workoutDayId].title}</h1><div className="recommendation-stack">{session.recommendations.map((item) => <Recommendation key={item.id} item={item} onApply={() => applyRecommendation(item.id)} onUndo={() => undoRecommendation(item.id)} />)}</div><div className="session-plan">{session.exercises.map((item, index) => <div key={item.id}><span>{index + 1}</span><b>{item.name}</b><small>{item.sets}组 · {item.repMin}–{item.repMax}次 · RIR {item.targetRir}</small></div>)}</div><div className="warmup-note"><Lightning /><p><b>先做热身组</b>首个复合动作逐级加重2–4组，热身不做到力竭。</p></div><button className="primary-button full" onClick={() => mutateSession((draft) => { draft.status = "active"; })}>热身完成，开始正式组<ArrowRight /></button><button className="text-button centered" onClick={abandon}>取消本次训练</button></section>;
  if (session.status === "summary") { const done = session.setEntries.filter((item) => item.completedAt); const minutes = Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60_000)); return <section className="session-ready workout-summary"><span className="eyebrow">训练总结 · 已自动保存</span><h1>本次训练完成</h1><div className="summary-grid"><div><b>{done.length}</b><small>正式组</small></div><div><b>{minutes}</b><small>分钟</small></div><div><b>{session.exercises.length}</b><small>动作</small></div></div><p>回顾主要动作的重量、次数和RIR；下次仅在全部组达到次数上限且保留1–2次余力时加重。</p><button className="primary-button full" onClick={finish}><CheckCircle weight="fill" />保存训练总结</button><button className="text-button centered" onClick={() => go("progress")}>查看进度</button></section>; }
  if (session.status === "rest") return <section className="rest-screen"><span className="eyebrow">第{session.currentExerciseIndex + 1}/{session.exercises.length}个动作 · 组间休息</span><h2>{exercise?.name}</h2><div className={`rest-ring ${seconds === 0 ? "ready" : ""}`} style={{ "--rest-progress": `${exercise ? (1 - seconds / exercise.restSeconds) * 360 : 0}deg` } as React.CSSProperties}><div><strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong><span>{seconds ? "保持呼吸" : "可以开始"}</span></div></div><div className="rest-adjust"><button onClick={() => adjustRest(-30)}>−30秒</button><button onClick={() => adjustRest(30)}>+30秒</button></div>{session.recommendations.filter((item) => item.requiresConfirmation || item.undo).map((item) => <Recommendation key={item.id} item={item} onApply={() => applyRecommendation(item.id)} onUndo={() => undoRecommendation(item.id)} />)}<button className="primary-button full" onClick={advance}>{seconds > 0 ? "提前开始下一组" : "开始下一组"}<ArrowRight /></button></section>;
  if (!exercise) return <section className="empty-state"><CheckCircle /><p>本次训练已完成。</p><button onClick={finish}>保存总结</button></section>;
  const guide = EXERCISE_GUIDE_BY_ID.get(exercise.guideId);
  const completed = session.setEntries.filter((set) => set.exerciseId === exercise.id && set.completedAt).length;
  return <section className="live-session"><div className="session-top"><div><span>{session.currentExerciseIndex + 1}/{session.exercises.length} · 正式组 {session.currentSetIndex + 1}/{exercise.sets}</span><h1>{exercise.name}</h1></div><button className="icon-button" onClick={() => guide && onGuide(guide)} aria-label="打开动作教学"><BookOpen /></button></div><div className="session-progress"><i style={{ width: `${((session.currentExerciseIndex + (completed / exercise.sets)) / session.exercises.length) * 100}%` }} /></div><div className="target-strip"><span>目标 <b>{exercise.repMin}–{exercise.repMax}次</b></span><span>余力 <b>RIR {exercise.targetRir}</b></span><span>休息 <b>{Math.round(exercise.restSeconds / 30) / 2}分</b></span></div>
    {guide && <button className="form-cue" onClick={() => onGuide(guide)}><span><Sparkle weight="fill" /></span><div><b>{guide.cues[session.currentSetIndex % guide.cues.length]}</b><small>{guide.phases[2].instruction}</small></div><CaretRight /></button>}
    <div className="set-form"><div className="set-main-fields"><label><span>重量</span><div><input autoFocus type="number" inputMode="decimal" min="0" step="0.5" value={weight} onChange={(event) => setWeight(event.target.value)} /><small>kg</small></div></label><label><span>次数</span><div><input type="number" inputMode="numeric" min="0" max="100" value={reps} onChange={(event) => setReps(event.target.value)} /><small>次</small></div></label><label><span>实际 RIR</span><div><input type="number" inputMode="numeric" min="0" max="5" value={rir} onChange={(event) => setRir(event.target.value)} /><small>次</small></div></label></div><label className="field-label">动作稳定性</label><div className="segmented">{(["stable","slightly-unstable","unstable"] as const).map((id, index) => <button key={id} className={stability === id ? "active" : ""} onClick={() => setStability(id)}>{["稳定","略晃","不稳定"][index]}</button>)}</div><label className="field-label">身体反馈</label><div className="feedback-grid">{(["none","muscle-burn","joint-discomfort","sharp-pain","numbness","joint-instability"] as SessionFeeling[]).map((id, index) => <button key={id} className={`${feeling === id ? "selected" : ""} ${["sharp-pain","numbness","joint-instability"].includes(id) ? "danger-option" : ""}`} onClick={() => setFeeling(id)}>{["无不适","肌肉酸胀","关节不适","锐痛","麻木","关节不稳"][index]}</button>)}</div>{feeling !== "none" && feeling !== "muscle-burn" && <input className="full-input" placeholder="具体部位" value={area} onChange={(event) => setArea(event.target.value)} />}</div>
    <button className={`primary-button full record-button ${["sharp-pain","numbness","joint-instability"].includes(feeling) ? "danger-button" : ""}`} disabled={!reps || !rir && rir !== "0"} onClick={submitSet}>{["sharp-pain","numbness","joint-instability"].includes(feeling) ? <><StopCircle />保存并安全暂停</> : <><Check />完成第{session.currentSetIndex + 1}组</>}</button><button className="text-button centered" onClick={abandon}>提前结束并保存</button>
  </section>;
}

function Recommendation({ item, onApply, onUndo }: { item: WorkoutSession["recommendations"][number]; onApply: () => void; onUndo?: () => void }) {
  return <article className={`recommendation ${item.severity}`}><span>{item.severity === "stop" ? <StopCircle /> : item.severity === "warning" ? <Warning /> : <Sparkle />}</span><div><b>{item.title}</b><p>{item.message}</p>{item.requiresConfirmation && item.action.type !== "safety-hold" && item.action.type !== "none" && <button onClick={onApply}>应用调整</button>}{item.undo && onUndo && <button className="text-button" onClick={onUndo}>撤销调整</button>}</div></article>;
}

function CoachPage({ snapshot, activeSession, update, setToast }: { snapshot: AppSnapshot; activeSession: WorkoutSession | null; update: (fn: (draft: AppSnapshot) => void) => void; setToast: (text: string) => void }) {
  const [text, setText] = useState("");
  const [handoff, setHandoff] = useState("");
  const [importText, setImportText] = useState("");
  const [advice, setAdvice] = useState<ImportedAdvice | null>(null);
  const quick = ["我今天只有45分钟", "昨晚只睡了5小时", "这一组太重", "器械被占了", "肩膀不舒服", "还要休息多久"];
  const send = (value = text) => {
    if (!value.trim()) return;
    const response = respondToLocalCoach(value, activeSession);
    update((draft) => { draft.coachMessages.push({ id: uid("msg"), role: "user", text: value, intent: response.intent, createdAt: new Date().toISOString() }, { id: uid("msg"), role: "coach", text: response.text, intent: response.intent, createdAt: new Date().toISOString() }); if (response.recommendation && activeSession) { const session = draft.workoutSessions.find((item) => item.id === activeSession.id); session?.recommendations.unshift(response.recommendation); } }); setText("");
  };
  const openHandoff = () => setHandoff(composeChatGPTHandoff(snapshot, activeSession));
  const applyAdvice = () => {
    if (!advice || !activeSession) return;
    update((draft) => {
      const session = draft.workoutSessions.find((item) => item.id === activeSession.id); if (!session) return;
      const undo = { exercises: structuredClone(session.exercises), restEndsAt: session.restEndsAt, restNotificationId: session.restNotificationId ?? null };
      for (const action of advice.actions) {
        if (action.type === "change_weight") { const exercise = session.exercises.find((item) => item.id === action.exerciseId || item.guideId === action.exerciseId); if (exercise?.startingWeightKg) exercise.startingWeightKg = Math.round(exercise.startingWeightKg * (1 + action.deltaPercent / 100) * 2) / 2; }
        if (action.type === "change_sets") { const exercise = session.exercises.find((item) => item.id === action.exerciseId || item.guideId === action.exerciseId); if (exercise) exercise.sets = action.sets; }
        if (action.type === "rest") session.restEndsAt = new Date(Date.now() + action.seconds * 1000).toISOString();
        if (action.type === "stop") { session.status = "safety-hold"; session.safetyHold = { active: true, reasons: [action.reason], createdAt: new Date().toISOString() }; }
        if (action.type === "substitute") { const exercise = session.exercises.find((item) => item.id === action.fromExerciseId || item.guideId === action.fromExerciseId); const replacement = EXERCISE_GUIDE_BY_ID.get(action.toExerciseId); if (exercise && replacement) { exercise.replacementFor = exercise.guideId; exercise.guideId = replacement.id; exercise.name = replacement.name; } }
      }
      if (advice.actions.some((action) => action.type !== "keep")) session.recommendations.unshift({ id: uid("chatgpt-adjustment"), severity: "info", source: "readiness", title: "ChatGPT 调整已应用", message: "下一组开始前可在训练页撤销本次调整。", action: { type: "none" }, requiresConfirmation: false, createdAt: new Date().toISOString(), appliedAt: new Date().toISOString(), undo });
    }); setAdvice(null); setImportText(""); setToast("ChatGPT 调整已应用，可在训练页撤销");
  };
  const messages = snapshot.coachMessages.slice(-12);
  return <><PageIntro eyebrow="本地实时教练" title="把当下情况告诉我" text="规则在本机运行，不冒充AI；离线也能给出组间建议。" />
    <section className="coach-chat"><div className="coach-identity"><span className="brand-mark mini"><Brain weight="fill" /></span><div><b>SteadyCut 本地教练</b><small><span className="status-dot" />离线可用 · 规则引擎</small></div></div><div className="message-list">{messages.length === 0 && <div className="coach-message"><p>训练前告诉我睡眠、时间和不适；训练中告诉我重量、RIR或器械情况。</p></div>}{messages.map((message) => <div key={message.id} className={message.role === "user" ? "user-message" : "coach-message"}><p>{message.text}</p><small>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small></div>)}</div><div className="quick-prompts">{quick.map((item) => <button key={item} onClick={() => send(item)}>{item}</button>)}</div><div className="chat-input"><textarea rows={2} placeholder="例如：这一组50kg只做了5次，RIR 0" value={text} onChange={(event) => setText(event.target.value)} /><button className="primary-icon" onClick={() => send()} aria-label="发送"><ArrowRight /></button></div></section>
    <section className="chatgpt-bridge"><div className="bridge-head"><span className="bridge-logo"><Sparkle weight="fill" /></span><div><span className="eyebrow">Plus 手动桥接</span><h2>问你的私人 ChatGPT</h2></div><LockKey /></div><p>软件只整理最少必要信息。你确认后复制并打开私人 GPT；回复不会自动读取或修改数据。</p><button className="secondary-button full" onClick={openHandoff}><ClipboardText />生成发送预览</button>{handoff && <div className="handoff-panel"><textarea readOnly rows={9} value={handoff} /><div className="button-row"><button onClick={async () => { const ok = await copyText(handoff); setToast(ok ? "内容已复制" : "复制失败，请长按文本复制"); }}>复制内容</button><button className="primary-small" onClick={() => snapshot.settings.chatGptUrl ? window.open(snapshot.settings.chatGptUrl, "_blank", "noopener") : go("more")}>{snapshot.settings.chatGptUrl ? "打开私人 GPT" : "先设置链接"}</button></div></div>}<details><summary>导入 ChatGPT 调整代码</summary><textarea rows={6} placeholder="粘贴包含 STEADYCUT_ADVICE_V1 的回复" value={importText} onChange={(event) => setImportText(event.target.value)} /><button className="secondary-button" disabled={!activeSession || !importText} onClick={() => { try { setAdvice(parseImportedAdvice(importText, activeSession?.id ?? "", activeSession ?? undefined)); } catch (reason) { setToast(reason instanceof Error ? reason.message : "无法解析建议"); } }}>严格校验</button></details>{advice && <div className="advice-preview"><span>待确认调整</span><h3>{advice.summary}</h3>{advice.actions.map((action, index) => <code key={index}>{JSON.stringify(action)}</code>)}<div className="button-row"><button onClick={() => setAdvice(null)}>取消</button><button className="primary-small" onClick={applyAdvice}>确认应用</button></div></div>}</section>
    <WeeklyReview snapshot={snapshot} />
  </>;
}

function WeeklyReview({ snapshot }: { snapshot: AppSnapshot }) {
  const since = Date.now() - 7 * 86_400_000;
  const sessions = snapshot.workoutSessions.filter((item) => item.status === "completed" && new Date(item.completedAt ?? item.startedAt).getTime() >= since);
  const measurements = snapshot.measurements.filter((item) => new Date(`${item.date}T12:00:00`).getTime() >= since && item.weightKg !== null);
  const average = measurements.length ? measurements.reduce((sum, item) => sum + (item.weightKg ?? 0), 0) / measurements.length : null;
  const proteinDays = Object.values(snapshot.dailyLogs).filter((item) => new Date(`${item.date}T12:00:00`).getTime() >= since && (item.proteinG ?? 0) >= snapshot.profile.proteinTargetG).length;
  const verdict = sessions.length >= 4 ? "训练执行很稳，继续按趋势而不是单日体重调整。" : sessions.length >= 2 ? "本周先把剩余训练日完成，力量稳定比额外加跑更优先。" : "下周先锁定四个训练日；从最短的30分钟核心版重新建立节奏。";
  return <section className="weekly-review"><span className="eyebrow">本地周复盘</span><h2>本周执行与下一步</h2><div className="summary-grid"><div><b>{sessions.length}/4</b><small>完成训练</small></div><div><b>{average?.toFixed(1) ?? "—"}</b><small>7日均重 kg</small></div><div><b>{proteinDays}/7</b><small>蛋白达标天</small></div></div><p>{verdict}</p></section>;
}

function NutritionPage({ snapshot, update }: { snapshot: AppSnapshot; update: (fn: (draft: AppSnapshot) => void) => void }) {
  const date = today(); const log = snapshot.dailyLogs[date] ?? emptyDaily(date); const target = snapshot.profile;
  const set = <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => update((draft) => { const item = draft.dailyLogs[date] ?? emptyDaily(date); item[key] = value; draft.dailyLogs[date] = item; });
  const caloriePercent = clamp(((log.caloriesKcal ?? 0) / target.calorieTargetKcal) * 100, 0, 100);
  return <><PageIntro eyebrow="饮食 · 先执行14天" title={`${target.calorieTargetKcal} kcal 起始方案`} text="记录不需要完美，但必须足够诚实，才能按两周趋势调整。" />
    <section className="calorie-dashboard"><div className="calorie-ring" style={{ "--calories": `${caloriePercent * 3.6}deg` } as React.CSSProperties}><div><strong>{log.caloriesKcal ?? 0}</strong><span>已记录 kcal</span><small>剩余 {Math.max(0, target.calorieTargetKcal - (log.caloriesKcal ?? 0))}</small></div></div><div className="macro-stack"><Macro label="蛋白质" value={log.proteinG} target={target.proteinTargetG} color="protein" /><Macro label="脂肪" value={log.fatG} target={target.fatTargetG} color="fat" /><Macro label="碳水" value={log.carbsG} target={target.carbTargetG} color="carb" /></div></section>
    <section className="log-card"><div className="section-heading"><div><span className="eyebrow">今日记录</span><h2>摄入与活动</h2></div></div><div className="input-grid"><NumberField label="热量" unit="kcal" value={log.caloriesKcal} onChange={(value) => set("caloriesKcal", value)} /><NumberField label="蛋白质" unit="g" value={log.proteinG} onChange={(value) => set("proteinG", value)} /><NumberField label="脂肪" unit="g" value={log.fatG} onChange={(value) => set("fatG", value)} /><NumberField label="碳水" unit="g" value={log.carbsG} onChange={(value) => set("carbsG", value)} /><NumberField label="蔬菜" unit="g" value={log.vegetablesG} onChange={(value) => set("vegetablesG", value)} /><NumberField label="水果" unit="份" value={log.fruitServings} onChange={(value) => set("fruitServings", value)} /><NumberField label="饮水" unit="ml" value={log.waterMl} onChange={(value) => set("waterMl", value)} /><NumberField label="步数" unit="步" value={log.steps} onChange={(value) => set("steps", value)} /></div><label className="note-field">今日备注<textarea rows={3} value={log.note} placeholder="外卖、训练前进食、饥饿感…" onChange={(event) => set("note", event.target.value)} /></label></section>
    <section className={`fried-chicken-card ${log.friedChickenMeal ? "selected" : ""}`}><div className="fried-icon"><CookingPot /></div><div><span className="eyebrow">每周保留一餐</span><h2>炸鸡餐预算 600–800 kcal</h2><p>两块炸鸡或一个炸鸡汉堡二选一；不叠加薯条、甜点和夜宵。</p></div><button onClick={() => set("friedChickenMeal", !log.friedChickenMeal)}>{log.friedChickenMeal ? <Check weight="bold" /> : <Plus />}{log.friedChickenMeal ? "已计入" : "计入今天"}</button></section>
    <section className="rules-card"><span className="eyebrow">外卖固定规则</span><ul><li><ForkKnife /><span><b>主菜</b>150–220g鸡肉、瘦牛肉、鱼虾或其他瘦肉</span></li><li><BowlFood /><span><b>主食</b>150–200g熟米饭，配两拳蔬菜</span></li><li><ClipboardText /><span><b>备注</b>少油、酱汁分装、米饭七成、增加蔬菜</span></li><li><PersonSimpleRun /><span><b>估算</b>普通外卖按软件热量再增加约15%</span></li></ul></section>
  </>;
}

function NumberField({ label, unit, value, onChange }: { label: string; unit: string; value: number | null; onChange: (value: number | null) => void }) { return <label className="number-field"><span>{label}</span><div><input type="number" inputMode="decimal" min="0" value={value ?? ""} onChange={(event) => onChange(numberOrNull(event.target.value))} /><small>{unit}</small></div></label>; }
function Macro({ label, value, target, color }: { label: string; value: number | null; target: number; color: string }) { const pct = clamp(((value ?? 0) / target) * 100, 0, 100); return <div className={`macro ${color}`}><div><span>{label}</span><b>{value ?? 0}<small>/{target}g</small></b></div><div><i style={{ width: `${pct}%` }} /></div></div>; }

function ProgressPage({ snapshot, update }: { snapshot: AppSnapshot; update: (fn: (draft: AppSnapshot) => void) => void }) {
  const [weight, setWeight] = useState(""); const [waist, setWaist] = useState(""); const ordered = [...snapshot.measurements].sort((a, b) => a.date.localeCompare(b.date)); const recent = ordered.slice(-8);
  const weightValues = recent.map((item) => item.weightKg).filter((value): value is number => value !== null); const min = weightValues.length ? Math.min(...weightValues) - .5 : 0; const max = weightValues.length ? Math.max(...weightValues) + .5 : 1;
  const latest = ordered.at(-1); const first = ordered[0]; const completed = snapshot.workoutSessions.filter((item) => item.status === "completed");
  const last7 = ordered.filter((item) => item.weightKg !== null && Date.now() - new Date(`${item.date}T12:00:00`).getTime() <= 7 * 86_400_000);
  const weeklyAverage = last7.length ? last7.reduce((sum, item) => sum + (item.weightKg ?? 0), 0) / last7.length : null;
  const benchSets = completed.flatMap((session) => session.exercises.filter((exercise) => exercise.guideId === "barbell-bench-press").flatMap((exercise) => session.setEntries.filter((set) => set.exerciseId === exercise.id && set.completedAt)));
  const bestBench = benchSets.filter((set) => set.actualWeightKg !== null).sort((a, b) => (b.actualWeightKg ?? 0) - (a.actualWeightKg ?? 0))[0];
  const fourWeekCompleted = completed.filter((item) => Date.now() - new Date(item.startedAt).getTime() <= 28 * 86_400_000).length;
  const execution = Math.min(100, Math.round((fourWeekCompleted / 16) * 100));
  const add = () => { if (!weight && !waist) return; const item: Measurement = { id: uid("measure"), date: today(), weightKg: numberOrNull(weight), waistCm: numberOrNull(waist), note: "", createdAt: new Date().toISOString() }; update((draft) => { draft.measurements.push(item); }); setWeight(""); setWaist(""); };
  return <><PageIntro eyebrow="进度 · 看周均趋势" title="腰围、体重、力量一起看" text="单日波动不决定调整；连续两周趋势才有意义。" />
    <section className="progress-summary"><article><span>7日均重</span><strong>{weeklyAverage ? weeklyAverage.toFixed(1) : "—"}<small> kg</small></strong></article><article><span>腰围变化</span><strong>{first?.waistCm && latest?.waistCm ? `${(latest.waistCm - first.waistCm).toFixed(1)}` : "—"}<small> cm</small></strong></article><article><span>近4周执行率</span><strong>{execution}<small> %</small></strong></article><article><span>卧推最佳</span><strong>{bestBench?.actualWeightKg ?? "—"}<small>{bestBench ? ` kg × ${bestBench.actualReps}` : " kg"}</small></strong></article></section>
    <section className="chart-card"><div className="section-heading"><div><span className="eyebrow">最近8次</span><h2>体重趋势</h2></div><span>{latest?.weightKg ? `${latest.weightKg} kg` : "等待记录"}</span></div>{weightValues.length ? <div className="weight-chart">{recent.map((item) => item.weightKg !== null ? <div key={item.id} className="chart-column"><span style={{ height: `${25 + ((item.weightKg - min) / (max - min)) * 65}%` }}><i>{item.weightKg}</i></span><small>{item.date.slice(5)}</small></div> : null)}</div> : <div className="empty-state compact"><ChartLineUp /><p>至少记录两次后显示趋势。</p></div>}</section>
    <section className="measurement-form"><span className="eyebrow">相似条件测量</span><h2>添加今日数据</h2><div className="input-grid two"><label className="number-field"><span>体重</span><div><input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} /><small>kg</small></div></label><label className="number-field"><span>肚脐腰围</span><div><input type="number" inputMode="decimal" step="0.1" value={waist} onChange={(event) => setWaist(event.target.value)} /><small>cm</small></div></label></div><button className="primary-button full" onClick={add}><Plus />保存测量</button></section>
    <section className="decision-rules"><span className="eyebrow">两周调整规则</span><h2>让趋势替你做决定</h2><div><b>0.3%–0.6%/周</b><p>腰围下降、力量稳定：保持不变。</p></div><div><b>&lt;0.2%/周</b><p>执行率≥85%且腰围不变：先升至9000步，仍不变再减150 kcal。</p></div><div><b>&gt;0.8%/周</b><p>或主项下降&gt;5%：增加150 kcal并缩短一次跑步10分钟。</p></div></section>
  </>;
}

function LibraryPage({ onGuide }: { onGuide: (guide: ExerciseGuide) => void }) {
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("全部"); const categories = ["全部", ...new Set(EXERCISE_GUIDES.map((item) => item.category))];
  const list = EXERCISE_GUIDES.filter((item) => (category === "全部" || item.category === category) && (!query || [item.name, item.equipment, ...item.aliases].some((value) => value.includes(query))));
  return <><PageIntro eyebrow="动作教学 · 29/29 已离线" title="每一组都知道怎么做" text="原创分步图、错误对照、器械设置、停止信号和替代动作。" />
    <div className="search-field"><ListMagnifyingGlass /><input aria-label="搜索动作" placeholder="搜索动作或器械" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="filter-row">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="library-grid">{list.map((item) => <button className="exercise-card" key={item.id} onClick={() => onGuide(item)}><div className="exercise-art"><span>{item.category}</span><Barbell weight="duotone" /></div><div><h3>{item.name}</h3><p>{item.primaryMuscles.join(" · ")}</p><small>{item.equipment}</small></div><CaretRight /></button>)}</div>
  </>;
}

function MorePage({ snapshot, update, replace, installAvailable, setToast }: { snapshot: AppSnapshot; update: (fn: (draft: AppSnapshot) => void) => void; replace: (next: AppSnapshot) => Promise<void>; installAvailable: boolean; setToast: (text: string) => void }) {
  const [password, setPassword] = useState(""); const [importFile, setImportFile] = useState<File | null>(null); const [pendingRestore, setPendingRestore] = useState<AppSnapshot | null>(null); const fileRef = useRef<HTMLInputElement>(null);
  const exportData = async () => { try { const envelope = await encryptBackup(snapshot, password); downloadBackup(envelope); setToast("加密备份已下载"); } catch (reason) { setToast(reason instanceof Error ? reason.message : "备份失败"); } };
  const prepareImport = async () => { if (!importFile) return; try { setPendingRestore(await decryptBackup(await importFile.text(), password)); setToast("备份已验证，请确认是否覆盖当前设备数据"); } catch (reason) { setToast(reason instanceof Error ? reason.message : "恢复失败"); } };
  const confirmImport = async () => { if (!pendingRestore) return; await replace(pendingRestore); setPendingRestore(null); setImportFile(null); setToast("备份已恢复"); };
  const exportLegacy = () => { const raw = getLegacyBackup(); if (!raw) { setToast("没有检测到旧版原始数据"); return; } const blob = new Blob([raw], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `SteadyCut-v1-original-${today()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1_000); setToast("旧版原始数据已导出"); };
  const setWeight = (value: number | null) => update((draft) => { draft.profile.startWeightKg = value; if (value) draft.profile.calorieTargetKcal = calculateCalories(value, draft.profile.heightCm, draft.profile.age); });
  return <><PageIntro eyebrow="更多 · 设备本地" title="设置、安装与备份" text="无账号、无云同步；网页与APK通过加密文件迁移。" />
    <section className="settings-card"><div className="section-heading"><div><span className="eyebrow">个人资料</span><h2>起始基线</h2></div></div><div className="input-grid two"><NumberField label="准确体重" unit="kg" value={snapshot.profile.startWeightKg} onChange={setWeight} /><NumberField label="肚脐腰围" unit="cm" value={snapshot.profile.startWaistCm} onChange={(value) => update((draft) => { draft.profile.startWaistCm = value; })} /></div><label className="note-field">称呼<input value={snapshot.profile.name} placeholder="可选" onChange={(event) => update((draft) => { draft.profile.name = event.target.value; })} /></label><div className="calorie-recalc"><span>起始热量</span><strong>{snapshot.profile.calorieTargetKcal} kcal</strong><small>{snapshot.profile.startWeightKg && (snapshot.profile.startWeightKg < 68 || snapshot.profile.startWeightKg > 80) ? "已根据实际体重重算" : "68–80kg默认值"}</small></div></section>
    <section className="settings-card"><span className="eyebrow">外观与训练</span><h2>设备体验</h2><div className="theme-picker"><button className={snapshot.settings.theme === "dark" ? "active" : ""} onClick={() => update((draft) => { draft.settings.theme = "dark"; })}><Moon />深色</button><button className={snapshot.settings.theme === "light" ? "active" : ""} onClick={() => update((draft) => { draft.settings.theme = "light"; })}><Sun />亮色</button><button className={snapshot.settings.theme === "system" ? "active" : ""} onClick={() => update((draft) => { draft.settings.theme = "system"; })}><GearSix />跟随系统</button></div><Toggle label="减少动画" value={snapshot.settings.reduceMotion} onChange={(value) => update((draft) => { draft.settings.reduceMotion = value; })} /><Toggle label="训练时保持屏幕常亮" value={snapshot.settings.keepScreenAwake} onChange={(value) => update((draft) => { draft.settings.keepScreenAwake = value; })} /><Toggle label="组间震动" value={snapshot.settings.vibration} onChange={(value) => update((draft) => { draft.settings.vibration = value; })} /><Toggle label="休息结束通知" value={snapshot.settings.restNotifications} onChange={(value) => update((draft) => { draft.settings.restNotifications = value; })} /></section>
    <section className="settings-card install-card"><span className="eyebrow">安装状态</span><h2>像软件一样打开</h2><p>安装后可从主屏幕启动；训练核心和29套教学在飞行模式下仍能打开。</p><button className="primary-button full" onClick={async () => { const result = await requestPwaInstall(); setToast(result === "manual" ? "请用浏览器菜单选择“添加到主屏幕”" : result === "installed" ? "安装完成" : "已取消安装"); }}><DownloadSimple />{installAvailable ? "安装 SteadyCut" : "查看安装方式"}</button></section>
    <section className="settings-card"><span className="eyebrow">ChatGPT Plus 桥接</span><h2>私人 GPT 链接</h2><p>只保存链接，不保存账号、密码或对话。</p><label className="note-field"><input type="url" value={snapshot.settings.chatGptUrl} placeholder="https://chatgpt.com/g/g-..." onChange={(event) => update((draft) => { draft.settings.chatGptUrl = event.target.value; })} /></label></section>
    <section className="settings-card"><span className="eyebrow">AES-GCM 加密备份</span><h2>网页与APK迁移</h2><p>密码至少8个字符；忘记密码后无法恢复，这是本地加密的安全边界。</p><label className="note-field">备份密码<input type="password" value={password} placeholder="至少8个字符" onChange={(event) => setPassword(event.target.value)} /></label><div className="button-row"><button className="secondary-button" onClick={exportData}><DownloadSimple />导出当前数据</button><button className="secondary-button" onClick={() => fileRef.current?.click()}><UploadSimple />选择备份</button></div><input hidden ref={fileRef} type="file" accept=".steadycut,application/json" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setPendingRestore(null); }} />{importFile && <div className="selected-file"><LockKey /><span>{importFile.name}</span><button onClick={prepareImport}>解密并预览</button></div>}{pendingRestore && <div className="restore-confirm"><Warning /><div><b>确认覆盖当前设备数据？</b><p>已验证备份格式。建议先导出当前数据；确认后才能恢复。</p><div className="button-row"><button onClick={exportData}>先导出当前数据</button><button className="primary-small" onClick={confirmImport}>确认覆盖并恢复</button><button onClick={() => setPendingRestore(null)}>取消</button></div></div></div>}<button className="text-button centered" onClick={exportLegacy}>导出保留的 v1 原始数据</button></section>
    <section className="privacy-card"><ShieldCheck size={24} /><div><b>隐私边界</b><p>训练与身体数据默认只在当前设备。清除浏览器数据会丢失记录，请定期导出加密备份。</p></div></section><p className="medical-disclaimer">SteadyCut 提供一般健身与营养指导，不做医疗诊断。肾病、肝病、痛风、进食障碍或运动禁忌请先咨询专业人员。</p>
  </>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><i /></label>; }
