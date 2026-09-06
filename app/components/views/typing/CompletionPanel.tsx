"use client";

import type { CodeLengthCoachAnalysis } from "../../../code-length-coach";
import type { GhostSegmentComparison } from "../../../ghost-race";
import type { GhostMode } from "./useGhostRace";
import type { SessionResult } from "../../../types";
import { DiagnosticMetric } from "../../Ui";

export function CompletionPanel({
  sessionSaveFailed,
  speed,
  kps,
  codeLength,
  accuracy,
  errorCount,
  keyCount,
  keyAccuracy,
  theoreticalCodeLength,
  correctionCount,
  backspaceCount,
  selectionCount,
  phraseRate,
  leftHandKeys,
  rightHandKeys,
  pauseCount,
  pauseSeconds,
  retryCount,
  minimumCodeError,
  theoreticalGap,
  codeLengthAnalysis,
  recommendedPhrases,
  onRetryCodeLengthLoad,
  onStartRecommendedPhrasePractice,
  ghostSegmentComparison,
  ghostGapLabel,
  lastSession,
  onRetryPracticeSave,
  onDownloadShareCard,
  autoNext,
  activeGhostMode,
  onChallengeAgain,
  onNextPractice,
}: {
  sessionSaveFailed: boolean;
  speed: number;
  kps: number;
  codeLength: number;
  accuracy: number;
  errorCount: number;
  keyCount: number;
  keyAccuracy: number;
  theoreticalCodeLength: number | null;
  correctionCount: number;
  backspaceCount: number;
  selectionCount: number;
  phraseRate: number;
  leftHandKeys: number;
  rightHandKeys: number;
  pauseCount: number;
  pauseSeconds: number;
  retryCount: number;
  minimumCodeError: string;
  theoreticalGap: number | null;
  codeLengthAnalysis: CodeLengthCoachAnalysis | null;
  recommendedPhrases: CodeLengthCoachAnalysis["highestValueOpportunities"];
  onRetryCodeLengthLoad: () => void;
  onStartRecommendedPhrasePractice: () => void;
  ghostSegmentComparison: GhostSegmentComparison[];
  ghostGapLabel: string;
  lastSession: SessionResult | null;
  onRetryPracticeSave: () => void;
  onDownloadShareCard: () => void;
  autoNext: boolean;
  activeGhostMode: GhostMode;
  onChallengeAgain: () => void;
  onNextPractice: () => void;
}) {
  return (
    <div className="completion-panel">
      <div className="completion-copy">
        <span className="completion-icon">{sessionSaveFailed ? "待" : "成"}</span>
        <div>
          <span>
            {sessionSaveFailed ? "本次成绩尚未保存" : "本次成绩已存入本机"}
          </span>
          <strong>{sessionSaveFailed ? "请重试保存" : "完成本次练习"}</strong>
        </div>
      </div>
      <div className="completion-results" aria-label="本次练习成绩">
        <span><small>速度</small><span className="completion-value"><strong>{speed}</strong><i>字/分</i></span></span>
        <span><small>击键</small><span className="completion-value"><strong>{kps.toFixed(2)}</strong><i>次/秒</i></span></span>
        <span><small>码长</small><span className="completion-value"><strong>{codeLength.toFixed(2)}</strong><i>键/字</i></span></span>
        <span><small>字准</small><span className="completion-value"><strong>{accuracy.toFixed(1)}</strong><i>%</i></span></span>
        <span><small>错字</small><span className="completion-value"><strong>{errorCount}</strong><i>处</i></span></span>
      </div>
      <div className="completion-diagnostics" aria-label="本次输入诊断">
        <DiagnosticMetric label="总键数" value={keyCount.toString()} unit="键" />
        <DiagnosticMetric label="键准" value={keyAccuracy.toFixed(1)} unit="%" />
        <DiagnosticMetric
          label="理论码长"
          value={theoreticalCodeLength === null ? "—" : theoreticalCodeLength.toFixed(2)}
          unit=""
        />
        <DiagnosticMetric label="回改" value={correctionCount.toString()} unit="字" />
        <DiagnosticMetric label="退格" value={backspaceCount.toString()} unit="次" />
        <DiagnosticMetric label="选重" value={selectionCount.toString()} unit="次" />
        <DiagnosticMetric label="打词" value={phraseRate.toFixed(1)} unit="%" />
        <DiagnosticMetric label="左右手" value={`${leftHandKeys} / ${rightHandKeys}`} unit="" />
        <DiagnosticMetric label="暂停" value={`${pauseCount} / ${pauseSeconds.toFixed(1)}`} unit="次/秒" />
        <DiagnosticMetric label="重打" value={retryCount.toString()} unit="次" />
      </div>
      <section className="code-coach" aria-labelledby="code-coach-title">
        <div className="code-coach-summary">
          <div className="code-coach-heading">
            <small>CODE LENGTH COACH</small>
            <h3 id="code-coach-title">码长诊断</h3>
            <p>
              {minimumCodeError
                ? "码表数据暂时不可用，无法生成本次建议。"
                : theoreticalGap !== null && theoreticalGap > 0
                  ? `实际码长距理论下限还有 ${theoreticalGap.toFixed(2)} 键/字的空间。`
                  : "本次实际码长已接近理论下限。"}
            </p>
          </div>
          <div className="code-coach-metrics" aria-label="码长对比">
            <CodeCoachMetric label="实际码长" value={codeLength.toFixed(2)} unit="键/字" />
            <CodeCoachMetric
              label="理论下限"
              value={codeLengthAnalysis?.theoreticalAverageCodeLength?.toFixed(2) ?? "—"}
              unit={
                (codeLengthAnalysis?.theoreticalAverageCodeLength ?? null) === null
                  ? ""
                  : "键/字"
              }
            />
            <CodeCoachMetric
              label="单字输入基准"
              value={codeLengthAnalysis?.singleCharacterAverageCodeLength?.toFixed(2) ?? "—"}
              unit={
                (codeLengthAnalysis?.singleCharacterAverageCodeLength ?? null) === null
                  ? ""
                  : "键/字"
              }
            />
            <CodeCoachMetric label="已使用词组比例" value={phraseRate.toFixed(1)} unit="%" />
          </div>
        </div>
        <div className="code-coach-opportunities">
          <div className="code-coach-list-heading">
            <strong>值得留意的推荐机会</strong>
            <span>
              {codeLengthAnalysis?.potentialSavedKeys
                ? `相比全部单字输入，理论可少 ${codeLengthAnalysis.potentialSavedKeys} 键`
                : "仅按码表提示，不判定你的实际分段"}
            </span>
          </div>
          {recommendedPhrases.length ? (
            <ol className="code-coach-list">
              {recommendedPhrases.map((opportunity, index) => (
                <li key={`${opportunity.start}-${opportunity.text}`}>
                  <span className="code-coach-rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="code-coach-phrase">
                    <strong>{opportunity.text}</strong>
                    <small>第 {opportunity.start + 1} 字起 · {opportunity.code}</small>
                  </span>
                  <span className="code-coach-saving">
                    <small>推荐机会</small>
                    <strong>可少 {opportunity.savedKeys} 键</strong>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="code-coach-empty">
              <span>
                {minimumCodeError
                  ? "码表数据暂时不可用。"
                  : codeLengthAnalysis
                    ? "本篇暂未发现可节省按键的二至四字词组推荐机会。"
                    : "正在准备码长诊断数据…"}
              </span>
              {minimumCodeError && (
                <button className="button secondary" onClick={onRetryCodeLengthLoad}>
                  重试加载码表
                </button>
              )}
            </div>
          )}
          <div className="code-coach-actions">
            <p>推荐基于当前 86 版码表和文本位置，无法可靠识别你本次实际采用的分段。</p>
            <button
              className="button secondary"
              disabled={!recommendedPhrases.length}
              onClick={onStartRecommendedPhrasePractice}
            >
              练习这些词组
            </button>
          </div>
        </div>
      </section>
      {ghostSegmentComparison.length > 0 && (
        <section className="ghost-review" aria-labelledby="ghost-review-title">
          <div>
            <small>PERSONAL GHOST</small>
            <h3 id="ghost-review-title">幽灵赛复盘</h3>
            <p>{ghostGapLabel}</p>
          </div>
          <ol>
            {ghostSegmentComparison.map((segment, index) => (
              <li key={`${segment.start}-${segment.end}`}>
                <span>第 {index + 1} 段</span>
                <strong>
                  {segment.result === "recovered"
                    ? "追回"
                    : segment.result === "lost"
                      ? "丢失"
                      : "持平"}{" "}
                  {Math.abs(segment.changeMs / 1000).toFixed(1)} 秒
                </strong>
                <small>第 {segment.start + 1}–{segment.end} 字</small>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="completion-next">
        <p>练习记录只保存在当前浏览器。</p>
        {sessionSaveFailed && (
          <button className="button danger" onClick={onRetryPracticeSave}>
            重试保存
          </button>
        )}
        <button
          className="button secondary"
          disabled={!lastSession}
          onClick={onDownloadShareCard}
        >
          下载成绩卡
        </button>
        {autoNext && activeGhostMode !== "off" && (
          <button
            className="button secondary"
            disabled={sessionSaveFailed}
            onClick={onChallengeAgain}
          >
            {activeGhostMode === "best" ? "再次挑战个人最佳" : "再次挑战最近一次"}
          </button>
        )}
        <button
          className="button primary"
          disabled={sessionSaveFailed}
          onClick={onNextPractice}
        >
          {autoNext
            ? "下一篇"
            : activeGhostMode === "best"
              ? "再次挑战个人最佳"
              : activeGhostMode === "recent"
                ? "再次挑战最近一次"
                : "再练一次"}
        </button>
      </div>
    </div>
  );
}

function CodeCoachMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <span className="code-coach-metric">
      <small>{label}</small>
      <span>
        <strong>{value}</strong>
        {unit && <i>{unit}</i>}
      </span>
    </span>
  );
}
