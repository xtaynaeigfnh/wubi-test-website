"use client";

import Link from "next/link";
import {
  buildTrainingSummary,
  scoreWeakItem,
  TRAINING_REVIEW_NOTES,
  WEAKNESS_RESOLVED_SCORE,
} from "../../training-plan";
import type { DailyTrainingPlan, ErrorStat, TrainingTask } from "../../types";

type DailyTrainingPlanCardProps = {
  planCompleted: boolean;
  plan: DailyTrainingPlan | null;
  planMessage: string;
  loading: boolean;
  trainingSummary: ReturnType<typeof buildTrainingSummary> | null;
  selectTrainingTab: (next: "review", force?: boolean) => boolean;
  nextTrainingTask: TrainingTask | null;
  startPlanTask: (task: TrainingTask) => boolean;
  changePlanGroup: () => void;
  explainedWeaknesses: { item: ErrorStat; result: ReturnType<typeof scoreWeakItem>; }[];
};

export function DailyTrainingPlanCard({
  planCompleted,
  plan,
  planMessage,
  loading,
  trainingSummary,
  selectTrainingTab,
  nextTrainingTask,
  startPlanTask,
  changePlanGroup,
  explainedWeaknesses,
}: DailyTrainingPlanCardProps) {
  return (
    <div className="smart-plan-card adaptive-plan-card" id="today-training-plan" tabIndex={-1}>
      <header className="panel-title training-card-header">
        <div className="training-card-heading">
          <span className="eyebrow">按近期记录推荐</span>
          <h2>{planCompleted ? "今日三步已完成" : "今日三步练习"}</h2>
        </div>
        <div
          className="training-card-stat"
          aria-label={plan ? `今日处方预计 ${plan.estimatedMinutes} 分钟` : "正在生成今日处方"}
        >
          <strong>{plan?.estimatedMinutes ?? "—"}</strong>
          <span>分钟</span>
        </div>
      </header>
      {planMessage && <p className="plan-message" role="status">{planMessage}</p>}
      {!plan ? (
        <div className="training-empty" role="status" aria-busy={loading}>
          {loading ? "正在按近期记录整理今日处方…" : "今日处方暂时不可用。"}
        </div>
      ) : trainingSummary ? (
        <div className="training-completion-summary" role="status">
          <div className="summary-ledger">
            <span><b>{trainingSummary.rounds}</b>轮完成</span>
            <span><b>{Math.max(1, Math.round(trainingSummary.durationSeconds / 60))}</b>分钟实练</span>
            <span><b>{trainingSummary.resolved.length}</b>个弱项退出复练队列</span>
          </div>
          {trainingSummary.remaining.length ? (
            <div className="remaining-weaknesses">
              <h3>仍需复练</h3>
              <ul>
                {trainingSummary.remaining.map((item) => (
                  <li key={item.text}>
                    <strong>{item.text}</strong>
                    <span>{item.reason}</span>
                    <b>{item.score}</b>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>计划中的弱项已降到复练线以下。</p>
          )}
          {trainingSummary.remaining.length > 0 && (
            <button className="button secondary" onClick={() => selectTrainingTab("review", true)}>继续复练剩余弱项</button>
          )}
          <p>这是弱项队列的变化。速度和准确率是否进步，请用阶段目标的同文复测确认。</p>
        </div>
      ) : (
        <>
          <ol className="plan-steps adaptive-plan-steps">
            {plan.tasks.map((task, index) => {
              const statusLabel = task.status === "completed"
                ? "已完成"
                : task.status === "in-progress"
                  ? "进行中"
                  : "待开始";
              const actionLabel = task.status === "in-progress"
                ? "继续练习"
                : task.type === "article"
                  ? "开始文章"
                  : task.type === "review"
                    ? "开始复练"
                    : "练这一组";
              return (
                <li key={task.id} id={`training-task-${task.type}`} tabIndex={-1} data-status={task.status} className={task.id === nextTrainingTask?.id ? "is-next" : undefined}>
                  <span aria-hidden="true">{["壹", "贰", "叁"][index]}</span>
                  <div className="plan-task-copy">
                    <div className="plan-task-title">
                      <strong>{task.title}</strong>
                      <small>{statusLabel} · 约 {task.estimatedMinutes} 分钟</small>
                    </div>
                    <em>
                      {task.type === "article"
                        ? `${task.articleTitle ?? "推荐文章"} · ${task.articleWordCount ?? 0} 字`
                        : task.type === "review"
                          ? `${task.items.length} 题 · ${task.items.slice(0, 6).map(([text]) => text).join("、")}`
                          : `${task.zoneKeys} · ${task.items.length} 题`}
                    </em>
                    <dl className="plan-task-guidance">
                      <div><dt>为什么练</dt><dd>{task.reason}</dd></div>
                      <div><dt>练完看</dt><dd>{TRAINING_REVIEW_NOTES[task.type]}</dd></div>
                    </dl>
                  </div>
                  {task.status === "completed" ? (
                    <span className="plan-task-done" aria-label={`${task.title}已完成`}>✓ 已完成</span>
                  ) : task.type === "article" ? (
                    <Link
                      href="/"
                      onClick={(event) => {
                        if (!startPlanTask(task)) event.preventDefault();
                      }}
                    >
                      {actionLabel}
                    </Link>
                  ) : (
                    <button onClick={() => startPlanTask(task)}>{actionLabel}</button>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="plan-actions">
            <button className="button secondary" onClick={changePlanGroup}>
              换一组
            </button>
            <span>只替换未完成任务，已完成记录会保留。</span>
          </div>
          <details className="priority-explanation">
            <summary>查看弱项排序依据</summary>
            <p>近期经常出错、卡顿或反复回改的内容会优先出现；连续答对后会逐步减少复练。</p>
            <p>
              原始问题权重为编码错误 50%、卡顿 30%、回改 20%；再乘以最近出现时间与掌握度系数，四舍五入得到优先级。连续答对、掌握阶段提高或长期未复发都会降低分数，低于 {WEAKNESS_RESOLVED_SCORE} 分后退出当前弱项队列。
            </p>
            {explainedWeaknesses.length ? (
              <ol>
                {explainedWeaknesses.map(({ item, result }) => (
                  <li key={item.text}>
                    <strong>{item.text}</strong>
                    <b>{result.score} 分</b>
                    <span>{result.explanation}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p>暂无弱项数据；今天先用高频字建立基线。</p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
