import { useEffect, useState } from "react";
import { ArrowsOut, CaretLeft, CaretRight, Check, Pause, Play, Warning, X } from "@phosphor-icons/react";
import type { ExerciseGuide } from "../data/exercises";
import { ExerciseVisual } from "./ExerciseVisual";

export function ExerciseGuideModal({ guide, onClose }: { guide: ExerciseGuide; onClose: () => void }) {
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setPhase((value) => (value + 1) % 3), 1350);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") zoom ? setZoom(false) : onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, zoom]);

  return (
    <div className="modal-layer guide-layer" role="dialog" aria-modal="true" aria-label={`${guide.name}动作教学`}>
      <div className="guide-shell">
        <header className="guide-header">
          <button className="icon-button" onClick={onClose} aria-label="关闭动作教学"><X size={23} /></button>
          <div><span className="eyebrow">动作教学 · 已离线</span><h2>{guide.name}</h2></div>
          <span className="review-badge"><Check size={14} /> 一般指导</span>
        </header>

        <main className="guide-content">
          <section className={`visual-stage ${zoom ? "zoomed" : ""}`}>
            <ExerciseVisual guide={guide} phaseIndex={phase} />
            <button className="visual-expand" onClick={() => setZoom((value) => !value)} aria-label={zoom ? "退出全屏" : "放大分镜"}><ArrowsOut size={20} /></button>
            <div className="visual-controls">
              <button className="icon-button small" onClick={() => setPhase((phase + 2) % 3)} aria-label="上一帧"><CaretLeft /></button>
              <button className="play-button" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />} {playing ? "暂停" : "循环"}</button>
              <button className="icon-button small" onClick={() => setPhase((phase + 1) % 3)} aria-label="下一帧"><CaretRight /></button>
            </div>
            <div className="phase-tabs" role="tablist" aria-label="动作分镜">
              {guide.phases.map((item, index) => <button key={item.id} role="tab" aria-selected={phase === index} className={phase === index ? "active" : ""} onClick={() => { setPhase(index); setPlaying(false); }}><span>{index + 1}</span>{item.label}</button>)}
            </div>
            <div className="phase-copy"><strong>{guide.phases[phase].title}</strong><p>{guide.phases[phase].instruction}</p></div>
          </section>

          <section className="guide-summary">
            <div className="metric-card"><span>主要肌群</span><strong>{guide.primaryMuscles.join(" · ")}</strong><small>{guide.secondaryMuscles.join(" · ") || "专注目标肌群"}</small></div>
            <div className="metric-card"><span>器械</span><strong>{guide.equipment}</strong><small>{guide.tempo}</small></div>
          </section>

          <section className="guide-section"><span className="section-kicker">01 · 设置</span><h3>先把器械调对</h3><ul className="check-list">{guide.equipmentSettings.map((item) => <li key={item}><Check />{item}</li>)}</ul><ol className="number-list">{guide.setup.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <section className="guide-section"><span className="section-kicker">02 · 执行</span><h3>从设置到完成</h3><ol className="number-list">{guide.steps.map((item) => <li key={item}>{item}</li>)}</ol><div className="cue-grid"><div><span>呼吸</span><p>{guide.breathing}</p></div><div><span>节奏</span><p>{guide.tempo}</p></div><div><span>活动范围</span><p>{guide.range}</p></div></div><div className="cue-strip">{guide.cues.map((cue) => <span key={cue}>{cue}</span>)}</div></section>

          <section className="guide-section"><span className="section-kicker">03 · 错误修正</span><h3>两种最常见错误</h3><div className="mistake-grid">{guide.mistakes.slice(0, 2).map((item, index) => <article key={item.title} className="mistake-card"><ExerciseVisual guide={guide} mistakeIndex={index} phaseIndex={1} /><h4>{item.title}</h4><p><strong>修正：</strong>{item.correction}</p></article>)}</div></section>

          <section className="guide-section"><span className="section-kicker">04 · 身体反馈</span><h3>知道什么时候继续，什么时候停</h3><div className="feel-card good"><Check size={20} /><div><strong>应该感受到</strong><p>{guide.intendedFeel}</p></div></div><div className="feel-card danger"><Warning size={20} /><div><strong>立即停止</strong><p>{guide.stopSignals.join("；")}</p></div></div></section>

          <section className="guide-section"><span className="section-kicker">05 · 替代与安全</span><h3>器械被占也能继续</h3><div className="alternatives"><div><span>降阶</span>{guide.regressions.map((item) => <b key={item}>{item}</b>)}</div><div><span>替代</span>{guide.alternatives.map((item) => <b key={item}>{item}</b>)}</div></div><div className="safety-note"><Warning /><p>{guide.safety}</p></div></section>
          <p className="medical-disclaimer">本教学尚未经过持证专业人员逐条复核，仅用于一般训练指导，不替代医疗评估。</p>
        </main>
      </div>
    </div>
  );
}
