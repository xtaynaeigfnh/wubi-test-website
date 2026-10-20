"use client";

import type { HesitationPracticeQueue, HesitationPracticeTarget } from "../../types";

type HesitationQueueCardProps = {
  currentHesitationQueue: HesitationPracticeQueue | null;
  onPracticeHesitation: (itemId: string, target: HesitationPracticeTarget) => void;
};

export function HesitationQueueCard({
  currentHesitationQueue,
  onPracticeHesitation,
}: HesitationQueueCardProps) {
  return (
    <section className="hesitation-queue-card" aria-labelledby="hesitation-queue-title">
      <header className="panel-title training-card-header">
        <div className="training-card-heading">
          <span className="eyebrow">卡顿片段加练</span>
          <h2 id="hesitation-queue-title">当天加入，当天练完</h2>
        </div>
        <div
          className="training-card-stat"
          aria-label={`卡顿加练已完成 ${currentHesitationQueue?.items.filter((item) => item.status === "completed").length ?? 0} 项，共 ${currentHesitationQueue?.items.length ?? 0} 项`}
        >
          <strong>
            {currentHesitationQueue?.items.filter((item) => item.status === "completed").length ?? 0}
            <small> / {currentHesitationQueue?.items.length ?? 0}</small>
          </strong>
          <span>片段</span>
        </div>
      </header>
      {currentHesitationQueue?.items.length ? (
        <ol className="hesitation-queue-list">
          {currentHesitationQueue.items.map((item) => {
            const statusLabel = item.status === "completed"
              ? item.outcome === "mastered"
                ? "已完成 · 暂时掌握"
                : "已完成 · 仍需复练"
              : item.status === "in-progress"
                ? "进行中"
                : "待开始";
            return (
              <li key={item.id} data-status={item.status}>
                <div className="hesitation-queue-copy">
                  <span>{item.target.sourceTitle}</span>
                  <strong>“{item.target.text}”</strong>
                  <small>
                    {Array.from(item.target.text).length} 字 · 约 {item.estimatedMinutes} 分钟 · {statusLabel}
                  </small>
                  {item.completedAt && (
                    <time dateTime={item.completedAt}>
                      {new Date(item.completedAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })} 完成
                    </time>
                  )}
                </div>
                <button
                  className="button secondary"
                  onClick={() => onPracticeHesitation(item.id, item.target)}
                >
                  {item.status === "completed"
                    ? "再练一组"
                    : item.status === "in-progress"
                      ? "继续三连练"
                      : "开始三连练"}
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="hesitation-queue-empty" role="status">
          <strong>今天还没有加练片段</strong>
          <span>完成文章后，在卡顿热力图中选择值得复练的位置。</span>
        </div>
      )}
      <p className="hesitation-queue-note">
        加练独立于上方三项处方，不影响三项完成总结；每天最多 5 个片段。
      </p>
    </section>
  );
}
