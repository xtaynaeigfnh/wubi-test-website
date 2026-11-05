"use client";

import { MAX_CUSTOM_TEXT_LENGTH } from "../../../practice-constraints";
import { Modal } from "../../Ui";

export function CustomTextModal({
  title,
  text,
  error,
  saving,
  onClose,
  onTitleChange,
  onTextChange,
  onErrorChange,
  onUse,
}: {
  title: string;
  text: string;
  error: string;
  saving: boolean;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onErrorChange: (value: string) => void;
  onUse: () => void;
}) {
  return (
    <Modal title="粘贴自定义文本" onClose={onClose}>
      <div className="custom-form">
        <label>
          标题
          <input
            data-modal-autofocus
            value={title}
            disabled={saving}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </label>
        <label>
          正文
          <textarea
            value={text}
            disabled={saving}
            maxLength={MAX_CUSTOM_TEXT_LENGTH * 2}
            onChange={(event) => {
              onTextChange(
                Array.from(event.target.value)
                  .slice(0, MAX_CUSTOM_TEXT_LENGTH)
                  .join(""),
              );
              onErrorChange("");
            }}
            placeholder="粘贴 10–5000 字的纯文本…"
          />
        </label>
        <div className="modal-actions">
          <span>
            {Array.from(text.trim()).length} / {MAX_CUSTOM_TEXT_LENGTH} 字
          </span>
          <button
            className="button primary"
            disabled={
              saving ||
              Array.from(text.trim()).length < 10 ||
              Array.from(text.trim()).length > MAX_CUSTOM_TEXT_LENGTH
            }
            onClick={onUse}
          >
            开始练习
          </button>
        </div>
        {error && <p className="management-message" role="status">{error}</p>}
      </div>
    </Modal>
  );
}
