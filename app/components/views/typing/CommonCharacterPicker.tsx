"use client";

import { commonCharacterPresets } from "../../../lib";
import type { CommonCharacterData, CommonCharacterPreset } from "../../../types";
import { ErrorState, Modal } from "../../Ui";

export function CommonCharacterPicker({
  commonData,
  commonLoading,
  commonError,
  onClose,
  onRetry,
  onStart,
}: {
  commonData: CommonCharacterData | null;
  commonLoading: boolean;
  commonError: string;
  onClose: () => void;
  onRetry: () => void;
  onStart: (preset: CommonCharacterPreset) => void;
}) {
  return (
    <Modal title="选择常用字范围" onClose={onClose}>
      <div className="common-practice-picker">
        <div className="common-practice-intro">
          <span aria-hidden="true">1500</span>
          <div>
            <strong>按字频分段练习</strong>
            <p>前 500 常用字按字频分成 10 组，每组 50 字。进入后可随时点击“乱序”。</p>
          </div>
        </div>
        {commonError ? (
          <ErrorState
            title="常用字表没有加载成功"
            message={commonError}
            onRetry={onRetry}
          />
        ) : (
          <div
            className="common-range-grid"
            aria-busy={commonLoading}
            aria-label="常用字范围"
          >
            {commonCharacterPresets.map((range, index) => (
              <button
                key={range.id}
                data-modal-autofocus={
                  index === 0 && commonData && !commonLoading
                    ? true
                    : undefined
                }
                disabled={commonLoading || !commonData}
                onClick={() => onStart(range.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{range.label}</strong>
                <small>{range.description}</small>
                <i aria-hidden="true">→</i>
              </button>
            ))}
          </div>
        )}
        <p className="common-source-note">
          {commonLoading
            ? "正在读取离线字频表…"
            : "字频来源：北京语言大学“现代汉语研究语料库”"}
        </p>
      </div>
    </Modal>
  );
}
