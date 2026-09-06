"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearPracticeHistory,
  formatDuration,
  getErrors,
  getPhraseOpportunities,
  getProgress,
  getSessions,
} from "../../lib";
import { FALLBACK_ARTICLE_COUNT, loadArticleMetadata } from "../../content-loader";
import type {
  ArticleProgress,
  ErrorStat,
  HesitationPracticeTarget,
  PhraseOpportunityStat,
  SessionResult,
} from "../../types";
import { downloadShareCard } from "../../share-card";
import { buildWeeklyReport } from "../../weekly-report";
import { openRhythmSegmentPractice } from "../../rhythm-navigation";
import { RhythmSummaryView } from "../AdvancedCenter";
import { TrendPanel } from "../TrendPanel";
import { WeeklyReportPanel } from "../WeeklyReportPanel";
import { DiagnosticMetric, SummaryCard } from "../Ui";
import { HesitationHeatmap } from "../HesitationHeatmap";

function sessionRecommendationEvidence(session: SessionResult): string[] {
  const evidence: string[] = [];
  if (session.trainingTaskId) {
    evidence.push("这次练习由今日训练处方安排，完成结果已回写到对应任务与弱项统计。");
  }
  if (session.errors > 0) {
    evidence.push(`${session.errors} 个错误会提高相关字词的编码错误权重。`);
  }
  if ((session.correctionCount ?? 0) > 0) {
    evidence.push(`${session.correctionCount} 次回改会提高重复修正权重。`);
  }
  if (session.pauseCount && session.pauseCount > 0) {
    evidence.push(`${session.pauseCount} 次暂停会作为节奏观察依据，但不会单独判定能力下降。`);
  }
  if (
    session.theoreticalCodeLength &&
    session.codeLength > session.theoreticalCodeLength
  ) {
    evidence.push(
      `实际码长 ${session.codeLength.toFixed(2)} 高于理论下限 ${session.theoreticalCodeLength.toFixed(2)}，后续会优先观察高收益词组机会。`,
    );
  }
  if (!evidence.length) {
    evidence.push("本次没有触发明确弱项；成绩仍用于趋势、周报和后续基线比较。");
  }
  return evidence;
}

export function HistoryView({
  onPracticeHesitation,
  onAddHesitationToQueue,
  queuedFingerprints,
  masteredAtByFingerprint,
  hesitationSaveRevision,
}: {
  onPracticeHesitation: (target: HesitationPracticeTarget) => void;
  onAddHesitationToQueue: (target: HesitationPracticeTarget) => void;
  queuedFingerprints: ReadonlySet<string>;
  masteredAtByFingerprint: ReadonlyMap<string, string>;
  hesitationSaveRevision: number;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const [errors, setErrors] = useState<ErrorStat[]>([]);
  const [phraseOpportunities, setPhraseOpportunities] = useState<PhraseOpportunityStat[]>([]);
  const [reportNow, setReportNow] = useState<Date | null>(null);
  const [articleTotal, setArticleTotal] = useState(FALLBACK_ARTICLE_COUNT);
  const [type, setType] = useState<
    "all" | "article" | "challenge" | "training" | "advanced"
  >("all");
  const [expandedHeatmapId, setExpandedHeatmapId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSessions(getSessions());
    setProgress(getProgress());
    setErrors(getErrors());
    setPhraseOpportunities(getPhraseOpportunities());
  }, []);
  useEffect(refresh, [hesitationSaveRevision, refresh]);
  useEffect(() => {
    let timer = 0;
    const refreshReportClock = () => {
      const now = new Date();
      setReportNow(now);
      const nextDay = new Date(now);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 50);
      timer = window.setTimeout(
        refreshReportClock,
        Math.max(1000, nextDay.getTime() - now.getTime()),
      );
    };
    refreshReportClock();
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    let active = true;
    loadArticleMetadata()
      .then((rows) => {
        if (active) setArticleTotal(rows.length);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const filtered = sessions.filter(
    (session) =>
      type === "all" ||
      session.type === type ||
      (type === "training" &&
        (session.type === "review" ||
          session.type === "roots" ||
          session.type === "hesitation")) ||
      (type === "advanced" &&
        (session.type === "rhythm" || session.type === "scenario")),
  );
  const articleSessions = sessions.filter((session) => session.type === "article");
  const totalChars = articleSessions.reduce((sum, session) => sum + session.correctChars, 0);
  const bestSpeed = articleSessions.reduce((best, session) => Math.max(best, session.speed), 0);
  const averageAccuracy = articleSessions.length
    ? articleSessions.reduce((sum, session) => sum + session.accuracy, 0) / articleSessions.length
    : 0;
  const completedArticleCount = progress.filter(
    (item) => item.completed,
  ).length;
  const weeklyReport = useMemo(
    () => reportNow
      ? buildWeeklyReport({ sessions, errors, phraseOpportunities, now: reportNow })
      : null,
    [errors, phraseOpportunities, reportNow, sessions],
  );

  const clearResults = () => {
    if (!window.confirm("确定清除全部本地成绩、错题、今日训练与阶段目标吗？此操作无法撤销。")) return;
    if (!clearPracticeHistory()) {
      window.alert("清除未完成，本机数据已恢复到操作前的状态，请稍后重试。");
      return;
    }
    setExpandedHeatmapId(null);
    refresh();
  };

  return (
    <section className="subpage">
      <div className="subpage-heading with-action">
        <div>
          <span className="eyebrow">只属于当前浏览器</span>
          <h1>本地成绩</h1>
          <p>查看训练趋势、文章完成情况和需要继续巩固的错字。</p>
        </div>
        <div className="heading-actions">
          <button className="button danger" onClick={clearResults}>
            清除练习数据与计划
          </button>
        </div>
      </div>
      <div className="summary-grid">
        <SummaryCard label="练习次数" value={sessions.length.toString()} note="文章、字码与专项训练" />
        <SummaryCard label="最高速度" value={`${bestSpeed}`} unit="字/分" note="文章测速个人最佳" accent />
        <SummaryCard label="累计字数" value={totalChars.toLocaleString("zh-CN")} note="正确完成字符" />
        <SummaryCard label="平均字准" value={averageAccuracy.toFixed(1)} unit="%" note="仅统计文章测速" />
      </div>
      {weeklyReport ? (
        <WeeklyReportPanel report={weeklyReport} />
      ) : (
        <section className="trend-panel" aria-label="能力周报加载中">
          <span className="eyebrow">能力周报 · V0.6</span>
          <p className="trend-empty">正在读取本机数据并生成本周周报…</p>
        </section>
      )}
      <TrendPanel sessions={sessions} />
      <div className="history-grid">
        <div className="history-panel">
          <div className="panel-title">
            <h2>最近练习</h2>
            <div className="segmented small history-filter" aria-label="练习类型筛选">
              {(["all", "article", "challenge", "training", "advanced"] as const).map((value) => (
                <button
                  key={value}
                  className={type === value ? "active" : ""}
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                >
                  {value === "all"
                    ? "全部"
                    : value === "article"
                      ? "文章"
                      : value === "challenge"
                        ? "字码"
                        : value === "training"
                          ? "专项"
                          : "进阶"}
                </button>
              ))}
            </div>
          </div>
          <div className="session-table">
            <div className="table-head">
              <span>练习</span>
              <span>速度</span>
              <span>击键</span>
              <span>码长</span>
              <span>字准</span>
              <span>时间</span>
              <span>操作</span>
            </div>
            {filtered.slice(0, 12).map((session) => (
              <div className="table-row" key={session.id}>
                <span className="session-practice">
                  <strong>{session.title}</strong>
                  <small>{new Date(session.date).toLocaleString("zh-CN")}</small>
                </span>
                <span className="session-speed">
                  {session.speed || "—"}
                  <small>
                    {session.type === "article" || session.type === "hesitation" || session.type === "rhythm" || session.type === "scenario"
                      ? "字/分"
                      : "题/分"}
                  </small>
                </span>
                <span className="session-kps">
                  {["article", "rhythm", "scenario"].includes(session.type) ? session.kps.toFixed(2) : "—"}
                  <small>次/秒</small>
                </span>
                <span className="session-code-length">
                  {Number.isFinite(session.codeLength) && session.codeLength > 0 ? (
                    <>
                      {session.codeLength.toFixed(2)}
                      <small>键/字</small>
                      {session.theoreticalCodeLength !== undefined &&
                        session.theoreticalCodeLength !== null && (
                          <small className="session-theoretical">
                            理论 {session.theoreticalCodeLength.toFixed(2)}
                          </small>
                        )}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="session-accuracy">
                  {session.accuracy.toFixed(1)}<small>%</small>
                </span>
                <span className="session-duration">
                  {formatDuration(session.durationSeconds)}
                </span>
                <div className="session-actions">
                  {session.heatmap && (
                    <button
                      className="session-heatmap-trigger"
                      aria-expanded={expandedHeatmapId === session.id}
                      aria-controls={`session-heatmap-${session.id}`}
                      onClick={() =>
                        setExpandedHeatmapId((current) =>
                          current === session.id ? null : session.id,
                        )
                      }
                    >
                      卡顿图
                    </button>
                  )}
                  {session.rhythmSummary && (
                    <button
                      className="session-heatmap-trigger"
                      aria-expanded={expandedHeatmapId === session.id}
                      aria-controls={`session-heatmap-${session.id}`}
                      onClick={() =>
                        setExpandedHeatmapId((current) =>
                          current === session.id ? null : session.id,
                        )
                      }
                    >
                      节奏
                    </button>
                  )}
                  <button
                    className="session-share"
                    aria-label={`下载“${session.title}”成绩卡`}
                    onClick={() => downloadShareCard(session)}
                  >
                    <span aria-hidden="true">↓</span>
                    成绩卡
                  </button>
                </div>
                {session.type === "article" && session.keyCount !== undefined && (
                  <div className="session-diagnostics" aria-label={`${session.title}输入诊断`}>
                    <DiagnosticMetric
                      label="总键"
                      value={session.keyCount?.toString() ?? "—"}
                      unit=""
                    />
                    <DiagnosticMetric
                      label="键准"
                      value={
                        session.keyAccuracy === undefined
                          ? "—"
                          : session.keyAccuracy.toFixed(1)
                      }
                      unit={session.keyAccuracy === undefined ? "" : "%"}
                    />
                    <DiagnosticMetric label="回改" value={session.correctionCount?.toString() ?? "—"} unit="" />
                    <DiagnosticMetric label="退格" value={session.backspaceCount?.toString() ?? "—"} unit="" />
                    <DiagnosticMetric label="选重" value={session.selectionCount?.toString() ?? "—"} unit="" />
                    <DiagnosticMetric
                      label="打词"
                      value={session.phraseRate === undefined ? "—" : session.phraseRate.toFixed(1)}
                      unit={session.phraseRate === undefined ? "" : "%"}
                    />
                    <DiagnosticMetric
                      label="左右手"
                      value={
                        session.leftHandKeys === undefined || session.rightHandKeys === undefined
                          ? "—"
                          : `${session.leftHandKeys} / ${session.rightHandKeys}`
                      }
                      unit=""
                    />
                    <DiagnosticMetric
                      label="暂停"
                      value={
                        session.pauseCount === undefined
                          ? "—"
                          : `${session.pauseCount} / ${(session.pauseSeconds ?? 0).toFixed(1)}`
                      }
                      unit={session.pauseCount === undefined ? "" : "次/秒"}
                    />
                    <DiagnosticMetric label="重打" value={session.retryCount?.toString() ?? "—"} unit="" />
                  </div>
                )}
                {session.type === "article" && (
                  <details className="session-recommendation-evidence">
                    <summary>这次成绩如何影响后续推荐</summary>
                    <ul>
                      {sessionRecommendationEvidence(session).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {(session.heatmap || session.rhythmSummary) && expandedHeatmapId === session.id && (
                  <div
                    className="session-heatmap-detail"
                    id={`session-heatmap-${session.id}`}
                  >
                    {session.rhythmSummary && (
                      <RhythmSummaryView
                        summary={session.rhythmSummary}
                        onPractice={(segment) => openRhythmSegmentPractice(router, segment)}
                      />
                    )}
                    {session.heatmap && (
                      <HesitationHeatmap
                        heatmap={session.heatmap}
                        compact
                        source={session}
                        onPractice={onPracticeHesitation}
                        onAddToQueue={onAddHesitationToQueue}
                        queuedFingerprints={queuedFingerprints}
                        masteredAtByFingerprint={masteredAtByFingerprint}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
            {!filtered.length && <div className="empty-state">完成一次练习后，成绩会出现在这里。</div>}
          </div>
        </div>
        <aside className="history-panel">
          <div className="panel-title"><h2>高频错字</h2><span>{errors.length} 个</span></div>
          <div className="error-cloud">
            {errors.slice(0, 18).map((error) => (
              <div key={`${error.text}-${error.code}`}>
                <strong>{error.text}</strong>
                <span>{error.code?.toUpperCase() || "文章错字"}</span>
                <b>{error.count}</b>
              </div>
            ))}
            {!errors.length && <div className="empty-state">暂时没有错字记录。</div>}
          </div>
          <div className="completion-stat">
            <span>文章完成度</span>
            <strong>{completedArticleCount} / {articleTotal}</strong>
            <i
              role="progressbar"
              aria-label="文章完成度"
              aria-valuemin={0}
              aria-valuemax={articleTotal}
              aria-valuenow={completedArticleCount}
            >
              <b
                style={{
                  width: `${Math.min(100, (completedArticleCount / articleTotal) * 100)}%`,
                }}
              />
            </i>
          </div>
        </aside>
      </div>
    </section>
  );
}
