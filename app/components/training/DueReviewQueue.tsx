"use client";

import { buildDueReviewQueue, type SpacedReviewItem } from "../../spaced-review";

type DueReviewQueueProps = {
  dueReviewQueue: ReturnType<typeof buildDueReviewQueue>;
  reviewMessage: string;
  startDueReview: (item: SpacedReviewItem) => void;
  deferDueReview: (item: SpacedReviewItem) => void;
};

export function DueReviewQueue({
  dueReviewQueue,
  reviewMessage,
  startDueReview,
  deferDueReview,
}: DueReviewQueueProps) {
  return (
    <section className={`due-review-card${dueReviewQueue.items.length ? "" : " is-empty"}`} aria-labelledby="due-review-title">
      <header className="panel-title training-card-header">
        <div className="training-card-heading">
          <span className="eyebrow">间隔复习 · 每日上限 {dueReviewQueue.limit} 项</span>
          <h2 id="due-review-title" tabIndex={-1}>到期内容，先巩固一次</h2>
        </div>
        <div
          className="training-card-stat"
          aria-label={`今天显示 ${dueReviewQueue.items.length} 项，共有 ${dueReviewQueue.totalDue} 项到期`}
        >
          <strong>
            {dueReviewQueue.items.length}
            <small> / {dueReviewQueue.totalDue}</small>
          </strong>
          <span>到期</span>
        </div>
      </header>
      {reviewMessage && (
        <p
          className="review-queue-message"
          role={reviewMessage.includes("未能") || reviewMessage.includes("无法") ? "alert" : "status"}
        >
          {reviewMessage}
        </p>
      )}
      {dueReviewQueue.items.length ? (
        <ol className="due-review-list">
          {dueReviewQueue.items.map((item) => (
            <li key={`${item.targetType}:${item.targetId}`}>
              <div className="due-review-copy">
                <div>
                  <span>{reviewTargetLabel(item.targetType)}</span>
                  <time dateTime={item.dueAt}>{reviewDueLabel(item.dueAt)}</time>
                </div>
                <strong>“{item.text}”</strong>
                <p>{reviewReason(item)}</p>
                <small>
                  当前间隔 {item.intervalDays} 天 · 掌握阶段 {item.level + 1}/10
                </small>
              </div>
              <div className="due-review-actions">
                <button
                  className="button primary"
                  onClick={() => startDueReview(item)}
                >
                  {item.targetType === "hesitation" ? "开始三连练" : "开始复习"}
                </button>
                <button
                  className="button secondary"
                  onClick={() => deferDueReview(item)}
                >
                  暂缓到明天
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="due-review-empty" role="status">
          <strong>今天没有待处理的到期项</strong>
          <span>
            {dueReviewQueue.deferredToday
              ? `已有 ${dueReviewQueue.deferredToday} 项暂缓到明天，不会永久隐藏。`
              : "完成新的练习后，薄弱项会按合适间隔回到这里。"}
          </span>
        </div>
      )}
      {dueReviewQueue.items.length > 0 && <p className="due-review-note">
        {dueReviewQueue.totalDue > dueReviewQueue.limit
          ? `另有 ${dueReviewQueue.totalDue - dueReviewQueue.items.length} 项积压，会按逾期天数、错误严重度和预计收益依次进入后续队列。`
          : "到期项按逾期天数、错误严重度和预计收益排序；暂缓项明天会重新出现。"}
      </p>}
    </section>
  );
}

function reviewTargetLabel(targetType: SpacedReviewItem["targetType"]): string {
  if (targetType === "phrase") return "词组";
  if (targetType === "hesitation") return "卡顿片段";
  return "单字";
}

function reviewDueLabel(dueAt: string, now = new Date()): string {
  const due = new Date(dueAt);
  const todaySerial = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dueSerial = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const overdueDays = Math.max(
    0,
    Math.round((todaySerial - dueSerial) / 86_400_000),
  );
  return overdueDays > 0 ? `已逾期 ${overdueDays} 天` : "今天到期";
}

function reviewReason(item: SpacedReviewItem): string {
  const source = item.lastOutcome === "correct"
    ? "上次答对，按间隔回访"
    : item.lastOutcome === "incorrect"
      ? "上次未掌握，已缩短间隔"
      : "由近期薄弱记录首次排入";
  return `${source} · 错误严重度 ${item.severity}/5 · 收益权重 ${item.expectedBenefit}`;
}
