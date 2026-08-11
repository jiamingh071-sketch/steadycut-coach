import { useEffect, useRef } from "react";
import type { ExerciseGuide, ExerciseVisualKind } from "../data/exercises";

type Point = [number, number];
type VisualMode = { phaseIndex?: number; mistakeIndex?: number };

const COLORS = {
  background: "#151713",
  panel: "#20231d",
  grid: "rgba(255,255,255,.045)",
  body: "#f1ead8",
  muted: "#9b9c91",
  equipment: "#777b70",
  accent: "#f5b942",
  muscle: "#e78b53",
  danger: "#ef6a60",
  good: "#65c98f",
};

function setup(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, rect.width * ratio);
  canvas.height = Math.max(1, rect.height * ratio);
  const context = canvas.getContext("2d")!;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx: context, w: rect.width, h: rect.height };
}

function line(ctx: CanvasRenderingContext2D, a: Point, b: Point, color = COLORS.body, width = 8) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.stroke();
}

function joint(ctx: CanvasRenderingContext2D, p: Point, color = COLORS.body, radius = 5) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
  ctx.fill();
}

function head(ctx: CanvasRenderingContext2D, p: Point, radius = 14) {
  ctx.fillStyle = COLORS.body;
  ctx.beginPath();
  ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p[0], p[1], radius + 4, -.9, .9);
  ctx.stroke();
}

function arrow(ctx: CanvasRenderingContext2D, a: Point, b: Point, color = COLORS.accent) {
  line(ctx, a, b, color, 3);
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const size = 9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b[0], b[1]);
  ctx.lineTo(b[0] - size * Math.cos(angle - .55), b[1] - size * Math.sin(angle - .55));
  ctx.lineTo(b[0] - size * Math.cos(angle + .55), b[1] - size * Math.sin(angle + .55));
  ctx.closePath();
  ctx.fill();
}

function dumbbell(ctx: CanvasRenderingContext2D, p: Point, angle = 0) {
  ctx.save();
  ctx.translate(...p);
  ctx.rotate(angle);
  line(ctx, [-11, 0], [11, 0], COLORS.equipment, 4);
  line(ctx, [-13, -7], [-13, 7], COLORS.accent, 5);
  line(ctx, [13, -7], [13, 7], COLORS.accent, 5);
  ctx.restore();
}

function bar(ctx: CanvasRenderingContext2D, a: Point, b: Point) {
  line(ctx, a, b, COLORS.equipment, 5);
  const horizontal = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
  if (horizontal) {
    line(ctx, [a[0] + 12, a[1] - 9], [a[0] + 12, a[1] + 9], COLORS.accent, 6);
    line(ctx, [b[0] - 12, b[1] - 9], [b[0] - 12, b[1] + 9], COLORS.accent, 6);
  }
}

function grid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 20; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 18; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

function caption(ctx: CanvasRenderingContext2D, w: number, text: string, mode: "good" | "danger" = "good") {
  ctx.font = "600 13px system-ui, sans-serif";
  const width = ctx.measureText(text).width + 24;
  ctx.fillStyle = mode === "good" ? "rgba(101,201,143,.14)" : "rgba(239,106,96,.14)";
  ctx.beginPath();
  ctx.roundRect(w - width - 14, 14, width, 32, 16);
  ctx.fill();
  ctx.fillStyle = mode === "good" ? COLORS.good : COLORS.danger;
  ctx.fillText(text, w - width - 2, 35);
}

function drawStanding(ctx: CanvasRenderingContext2D, w: number, h: number, kind: ExerciseVisualKind, phase: number, bad: boolean) {
  const cx = w * .48;
  const floor = h - 30;
  const hip: Point = [cx, floor - 88];
  const shoulder: Point = [cx + (bad ? 10 : 0), floor - 158];
  const neck: Point = [shoulder[0], shoulder[1] - 14];
  head(ctx, [neck[0], neck[1] - 17]);
  line(ctx, shoulder, hip, bad ? COLORS.danger : COLORS.body, 13);
  line(ctx, hip, [cx - 18, floor - 42], COLORS.body, 10);
  line(ctx, [cx - 18, floor - 42], [cx - 22, floor], COLORS.body, 9);
  line(ctx, hip, [cx + 21, floor - 43], COLORS.body, 10);
  line(ctx, [cx + 21, floor - 43], [cx + 26, floor], COLORS.body, 9);
  line(ctx, [cx - 38, floor], [cx - 16, floor], COLORS.equipment, 5);
  line(ctx, [cx + 15, floor], [cx + 39, floor], COLORS.equipment, 5);

  let leftElbow: Point = [cx - 30, shoulder[1] + 35];
  let rightElbow: Point = [cx + 30, shoulder[1] + 35];
  let leftHand: Point = [cx - 24, hip[1] + 10];
  let rightHand: Point = [cx + 24, hip[1] + 10];
  if (kind === "overhead-press") {
    const up = phase === 2;
    leftElbow = [cx - (up ? 15 : 34), shoulder[1] - (up ? 38 : 3)];
    rightElbow = [cx + (up ? 15 : 34), shoulder[1] - (up ? 38 : 3)];
    leftHand = [cx - (up ? 14 : 31), shoulder[1] - (up ? 72 : 28)];
    rightHand = [cx + (up ? 14 : 31), shoulder[1] - (up ? 72 : 28)];
  } else if (kind === "lateral-raise" || kind === "reverse-fly") {
    const raised = phase === 2;
    leftElbow = [cx - (raised ? 58 : 24), shoulder[1] + (raised ? 2 : 34)];
    rightElbow = [cx + (raised ? 58 : 24), shoulder[1] + (raised ? 2 : 34)];
    leftHand = [cx - (raised ? 88 : 20), shoulder[1] + (raised ? 8 : 70)];
    rightHand = [cx + (raised ? 88 : 20), shoulder[1] + (raised ? 8 : 70)];
  } else if (kind === "curl") {
    const curled = phase === 2;
    leftHand = [cx - 30, shoulder[1] + (curled ? 24 : 75)];
    rightHand = [cx + 30, shoulder[1] + (curled ? 24 : 75)];
  } else if (kind === "pushdown") {
    const down = phase === 2;
    leftElbow = [cx - 24, shoulder[1] + 28];
    rightElbow = [cx + 24, shoulder[1] + 28];
    leftHand = [cx - 24, shoulder[1] + (down ? 76 : 44)];
    rightHand = [cx + 24, shoulder[1] + (down ? 76 : 44)];
    line(ctx, [cx, 20], [cx, shoulder[1] + (down ? 76 : 44)], COLORS.equipment, 2);
  }
  line(ctx, shoulder, leftElbow, COLORS.body, 9); line(ctx, leftElbow, leftHand, COLORS.body, 8);
  line(ctx, shoulder, rightElbow, COLORS.body, 9); line(ctx, rightElbow, rightHand, COLORS.body, 8);
  [leftElbow, rightElbow].forEach((p) => joint(ctx, p, COLORS.muscle, 5));
  if (["overhead-press", "lateral-raise", "curl"].includes(kind)) { dumbbell(ctx, leftHand); dumbbell(ctx, rightHand); }
  if (kind === "overhead-press") arrow(ctx, [cx + 78, shoulder[1] - 10], [cx + 78, shoulder[1] - 72]);
  if (kind === "lateral-raise" || kind === "reverse-fly") arrow(ctx, [cx + 45, shoulder[1] + 45], [cx + 84, shoulder[1] + 4]);
  if (kind === "curl") arrow(ctx, [cx + 58, hip[1]], [cx + 58, shoulder[1] + 22]);
  if (kind === "pushdown") arrow(ctx, [cx + 58, shoulder[1] + 20], [cx + 58, shoulder[1] + 78]);
  ctx.fillStyle = COLORS.muscle;
  ctx.beginPath(); ctx.arc(cx, shoulder[1] + 5, 16, 0, Math.PI); ctx.fill();
}

function drawPress(ctx: CanvasRenderingContext2D, w: number, h: number, kind: ExerciseVisualKind, phase: number, bad: boolean) {
  const incline = kind === "incline-press";
  const machine = kind === "machine-press";
  const y = h * .67;
  line(ctx, [w * .22, y + 36], [w * .78, y + 36], COLORS.equipment, 10);
  if (incline || machine) line(ctx, [w * .28, y + 34], [w * .48, y - 72], COLORS.equipment, 12);
  const shoulder: Point = incline || machine ? [w * .46, y - 54] : [w * .33, y];
  const hip: Point = incline || machine ? [w * .54, y + 12] : [w * .58, y + 8];
  head(ctx, [shoulder[0] - (incline ? 30 : 25), shoulder[1] - (incline ? 26 : 4)], 13);
  line(ctx, shoulder, hip, bad ? COLORS.danger : COLORS.body, 14);
  line(ctx, hip, [w * .68, y + 18], COLORS.body, 10); line(ctx, [w * .68, y + 18], [w * .76, y + 36], COLORS.body, 8);
  const top = phase === 2;
  const elbow: Point = top ? [shoulder[0] + 15, shoulder[1] - 52] : [shoulder[0] + (bad ? 67 : 48), shoulder[1] + (bad ? 5 : 18)];
  const hand: Point = top ? [shoulder[0] + 20, shoulder[1] - 90] : [shoulder[0] + 28, shoulder[1] - 25];
  line(ctx, shoulder, elbow, COLORS.body, 10); line(ctx, elbow, hand, COLORS.body, 9); joint(ctx, elbow, bad ? COLORS.danger : COLORS.muscle);
  if (machine) { line(ctx, hand, [w * .83, hand[1]], COLORS.equipment, 5); line(ctx, [w * .83, hand[1]], [w * .83, y + 35], COLORS.equipment, 5); }
  else if (kind === "flat-press") bar(ctx, [hand[0] - 70, hand[1]], [hand[0] + 70, hand[1]]);
  else dumbbell(ctx, hand);
  arrow(ctx, [w * .76, y - 10], [w * .76, y - 76]);
  ctx.fillStyle = COLORS.muscle; ctx.beginPath(); ctx.ellipse((shoulder[0] + hip[0]) / 2, (shoulder[1] + hip[1]) / 2 - 7, 22, 10, incline ? .5 : 0, 0, Math.PI * 2); ctx.fill();
}

function drawPull(ctx: CanvasRenderingContext2D, w: number, h: number, kind: ExerciseVisualKind, phase: number, bad: boolean) {
  if (kind === "pulldown" || kind === "pull-up") {
    const cx = w * .5;
    bar(ctx, [cx - 90, 30], [cx + 90, 30]);
    const up = phase !== 2;
    const shoulderY = kind === "pull-up" ? (up ? 112 : 78) : 115;
    const hipY = shoulderY + 70;
    head(ctx, [cx, shoulderY - 26], 13);
    line(ctx, [cx, shoulderY], [cx, hipY], bad ? COLORS.danger : COLORS.body, 13);
    const handY = kind === "pull-up" ? 30 : (phase === 2 ? 94 : 34);
    const elbowY = phase === 2 ? 98 : 64;
    line(ctx, [cx, shoulderY], [cx - 48, elbowY], COLORS.body, 9); line(ctx, [cx - 48, elbowY], [cx - 70, handY], COLORS.body, 8);
    line(ctx, [cx, shoulderY], [cx + 48, elbowY], COLORS.body, 9); line(ctx, [cx + 48, elbowY], [cx + 70, handY], COLORS.body, 8);
    line(ctx, [cx, hipY], [cx - 20, hipY + 62], COLORS.body, 9); line(ctx, [cx, hipY], [cx + 20, hipY + 62], COLORS.body, 9);
    if (kind === "pulldown") line(ctx, [cx - 70, handY], [cx + 70, handY], COLORS.equipment, 5);
    arrow(ctx, [cx + 112, 50], [cx + 112, 110]);
    ctx.fillStyle = COLORS.muscle; ctx.beginPath(); ctx.ellipse(cx, shoulderY + 32, 25, 42, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const floor = h - 32;
  line(ctx, [w * .15, floor], [w * .86, floor], COLORS.equipment, 4);
  const hip: Point = [w * .44, floor - 70];
  const shoulder: Point = [w * .58, floor - 135];
  head(ctx, [w * .63, floor - 158], 13);
  line(ctx, hip, shoulder, bad ? COLORS.danger : COLORS.body, 13);
  line(ctx, hip, [w * .38, floor - 25], COLORS.body, 10); line(ctx, [w * .38, floor - 25], [w * .34, floor], COLORS.body, 8);
  const pulled = phase === 2;
  const elbow: Point = pulled ? [w * .49, floor - 126] : [w * .69, floor - 104];
  const hand: Point = pulled ? [w * .58, floor - 113] : [w * .79, floor - 87];
  line(ctx, shoulder, elbow, COLORS.body, 9); line(ctx, elbow, hand, COLORS.body, 8);
  line(ctx, hand, [w * .91, hand[1]], COLORS.equipment, 3);
  arrow(ctx, [w * .82, floor - 58], [w * .61, floor - 58]);
  ctx.fillStyle = COLORS.muscle; ctx.beginPath(); ctx.ellipse(w * .55, floor - 118, 12, 29, -.8, 0, Math.PI * 2); ctx.fill();
}

function drawLegs(ctx: CanvasRenderingContext2D, w: number, h: number, kind: ExerciseVisualKind, phase: number, bad: boolean) {
  const floor = h - 28;
  line(ctx, [20, floor], [w - 20, floor], COLORS.equipment, 4);
  if (kind === "leg-press") {
    line(ctx, [w * .2, floor - 18], [w * .38, floor - 110], COLORS.equipment, 10);
    line(ctx, [w * .76, floor - 150], [w * .84, floor - 20], COLORS.equipment, 9);
    const hip: Point = [w * .38, floor - 70]; const knee: Point = phase === 2 ? [w * .58, floor - 108] : [w * .49, floor - 55]; const foot: Point = [w * .76, floor - 91];
    head(ctx, [w * .31, floor - 130], 13); line(ctx, [w * .34, floor - 115], hip, COLORS.body, 13); line(ctx, hip, knee, COLORS.body, 11); line(ctx, knee, foot, bad ? COLORS.danger : COLORS.body, 10); arrow(ctx, [w * .66, floor - 160], [w * .78, floor - 142]); return;
  }
  if (kind === "hip-thrust") {
    line(ctx, [w * .15, floor - 73], [w * .36, floor - 73], COLORS.equipment, 11);
    const shoulder: Point = [w * .34, floor - 80]; const hip: Point = [w * .54, floor - (phase === 2 ? 80 : 42)]; const knee: Point = [w * .69, floor - 69];
    head(ctx, [w * .27, floor - 102], 13); line(ctx, shoulder, hip, COLORS.body, 14); line(ctx, hip, knee, COLORS.body, 11); line(ctx, knee, [w * .72, floor], COLORS.body, 10); bar(ctx, [hip[0] - 48, hip[1] - 7], [hip[0] + 48, hip[1] - 7]); arrow(ctx, [w * .81, floor - 35], [w * .81, floor - 90]); return;
  }
  if (kind === "leg-curl" || kind === "leg-extension") {
    line(ctx, [w * .24, floor - 82], [w * .58, floor - 82], COLORS.equipment, 10); line(ctx, [w * .28, floor - 80], [w * .28, floor], COLORS.equipment, 8);
    const hip: Point = [w * .43, floor - 91]; const shoulder: Point = [w * .43, floor - 157]; head(ctx, [w * .43, floor - 184], 13); line(ctx, shoulder, hip, COLORS.body, 13);
    const knee: Point = [w * .61, floor - 84]; const bend = phase === 2;
    const foot: Point = kind === "leg-extension" ? (bend ? [w * .78, floor - 84] : [w * .64, floor - 15]) : (bend ? [w * .48, floor - 16] : [w * .79, floor - 30]);
    line(ctx, hip, knee, COLORS.body, 11); line(ctx, knee, foot, bad ? COLORS.danger : COLORS.body, 10); arrow(ctx, [w * .83, floor - 20], [w * .83, floor - 90]); return;
  }
  if (kind === "calf-raise") {
    const rise = phase === 2 ? 12 : 0; const cx = w * .5;
    head(ctx, [cx, floor - 190 - rise], 13); line(ctx, [cx, floor - 170 - rise], [cx, floor - 90 - rise], COLORS.body, 13); line(ctx, [cx, floor - 90 - rise], [cx, floor - 35 - rise], COLORS.body, 11); line(ctx, [cx, floor - 35 - rise], [cx + 12, floor - rise], COLORS.body, 9); line(ctx, [cx - 24, floor], [cx + 35, floor], COLORS.equipment, 5); arrow(ctx, [cx + 70, floor - 10], [cx + 70, floor - 65]); return;
  }
  const split = kind === "split-squat";
  const hinge = kind === "hinge";
  const depth = phase === 2 || phase === 1;
  const cx = w * .5;
  const hip: Point = [cx + (hinge && depth ? 35 : 0), floor - (depth ? 77 : 112)];
  const shoulder: Point = hinge && depth ? [cx + 85, floor - 135] : [cx + (bad ? 17 : 0), hip[1] - 76];
  head(ctx, [shoulder[0], shoulder[1] - 25], 13); line(ctx, shoulder, hip, bad ? COLORS.danger : COLORS.body, 14);
  const leftKnee: Point = split ? [cx - 32, floor - 45] : [cx - 25, floor - (depth ? 38 : 58)];
  const rightKnee: Point = split ? [cx + 60, floor - 38] : [cx + 25, floor - (depth ? 38 : 58)];
  line(ctx, hip, leftKnee, COLORS.body, 11); line(ctx, leftKnee, [cx - (split ? 58 : 28), floor], bad ? COLORS.danger : COLORS.body, 9);
  line(ctx, hip, rightKnee, COLORS.body, 11); line(ctx, rightKnee, [cx + (split ? 96 : 28), floor], COLORS.body, 9);
  if (kind === "squat" || kind === "hack-squat" || hinge) bar(ctx, [shoulder[0] - 62, shoulder[1] - 3], [shoulder[0] + 62, shoulder[1] - 3]);
  arrow(ctx, [w * .82, floor - 125], [w * .82, floor - 48]);
  ctx.fillStyle = COLORS.muscle; ctx.beginPath(); ctx.ellipse(hip[0] - 3, hip[1] + 20, 15, 24, .2, 0, Math.PI * 2); ctx.fill();
}

function drawCore(ctx: CanvasRenderingContext2D, w: number, h: number, kind: ExerciseVisualKind, phase: number, bad: boolean) {
  const floor = h - 44;
  line(ctx, [20, floor], [w - 20, floor], COLORS.equipment, 4);
  if (kind === "plank") {
    const shoulder: Point = [w * .32, floor - 50]; const hip: Point = [w * .56, floor - (bad ? 25 : 47)]; const ankle: Point = [w * .79, floor - 15];
    head(ctx, [w * .24, floor - 61], 13); line(ctx, shoulder, hip, bad ? COLORS.danger : COLORS.body, 14); line(ctx, hip, ankle, COLORS.body, 11); line(ctx, shoulder, [w * .27, floor], COLORS.body, 9); line(ctx, [w * .27, floor], [w * .41, floor], COLORS.body, 8); arrow(ctx, [w * .48, floor - 90], [w * .48, floor - 52]);
  } else {
    const curl = phase === 2; const hip: Point = [w * .58, floor - 22]; const shoulder: Point = curl ? [w * .43, floor - 62] : [w * .35, floor - 25];
    head(ctx, [shoulder[0] - 28, shoulder[1] - 7], 13); line(ctx, shoulder, hip, bad ? COLORS.danger : COLORS.body, 14); line(ctx, hip, [w * .69, floor - 64], COLORS.body, 11); line(ctx, [w * .69, floor - 64], [w * .79, floor], COLORS.body, 9); arrow(ctx, [w * .32, floor - 90], [w * .45, floor - 69]);
  }
  ctx.fillStyle = COLORS.muscle; ctx.beginPath(); ctx.ellipse(w * .49, floor - 45, 25, 14, 0, 0, Math.PI * 2); ctx.fill();
}

function render(canvas: HTMLCanvasElement, guide: ExerciseGuide, mode: VisualMode) {
  const { ctx, w, h } = setup(canvas);
  const phase = Math.max(0, Math.min(2, mode.phaseIndex ?? 0));
  const bad = mode.mistakeIndex !== undefined;
  grid(ctx, w, h);
  const kind = guide.visualKind;
  if (["flat-press", "incline-press", "machine-press"].includes(kind)) drawPress(ctx, w, h, kind, phase, bad);
  else if (["overhead-press", "lateral-raise", "curl", "pushdown", "reverse-fly"].includes(kind)) drawStanding(ctx, w, h, kind, phase, bad);
  else if (["supported-row", "seated-row", "pulldown", "pull-up"].includes(kind)) drawPull(ctx, w, h, kind, phase, bad);
  else if (["squat", "leg-press", "hack-squat", "split-squat", "hinge", "hip-thrust", "leg-curl", "leg-extension", "calf-raise"].includes(kind)) drawLegs(ctx, w, h, kind, phase, bad);
  else drawCore(ctx, w, h, kind, phase, bad);
  caption(ctx, w, bad ? `错误 ${Number(mode.mistakeIndex) + 1}` : guide.phases[phase].label, bad ? "danger" : "good");
  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 12px system-ui, sans-serif";
  ctx.fillText(bad ? guide.mistakes[mode.mistakeIndex ?? 0]?.title ?? "常见错误" : guide.phases[phase].title, 15, h - 14);
}

export function ExerciseVisual({ guide, phaseIndex = 0, mistakeIndex, className = "" }: { guide: ExerciseGuide; phaseIndex?: number; mistakeIndex?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => render(canvas, guide, { phaseIndex, mistakeIndex });
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [guide, phaseIndex, mistakeIndex]);
  return <canvas ref={ref} className={`exercise-canvas ${className}`} role="img" aria-label={mistakeIndex === undefined ? guide.altText : `${guide.name}错误姿势：${guide.mistakes[mistakeIndex]?.title ?? "常见错误"}`} />;
}
