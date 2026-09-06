"use client";

import { lengthLabels } from "../../../lib";
import type { ArticleProgress, PracticeArticle } from "../../../types";
import { Modal } from "../../Ui";

export function ArticlePicker({
  filtered,
  progressMap,
  onClose,
  onChoose,
}: {
  filtered: PracticeArticle[];
  progressMap: ReadonlyMap<string, ArticleProgress>;
  onClose: () => void;
  onChoose: (article: PracticeArticle) => void;
}) {
  return (
    <Modal title="选择练习文章" onClose={onClose}>
      <div className="article-list">
        <div className="article-list-summary" role="status">
          共 {filtered.length} 篇符合当前筛选条件
        </div>
        {filtered.map((item) => {
          const record = progressMap.get(item.id);
          return (
            <button key={item.id} onClick={() => onChoose(item)}>
              <span className="article-card-copy">
                <small>{item.topic}</small>
                <strong>{item.title}</strong>
                <span>{lengthLabels[item.length]} · {item.wordCount} 字</span>
              </span>
              <span className={record ? "article-record practiced" : "article-record"}>
                <small>{record ? "个人最佳" : "练习状态"}</small>
                <strong>{record ? `${record.bestSpeed} 字/分` : "未练习"}</strong>
                <i>{record ? `${record.attempts} 次记录` : "从这篇开始"}</i>
              </span>
            </button>
          );
        })}
        {!filtered.length && <div className="empty-state">当前筛选条件下没有文章。</div>}
      </div>
    </Modal>
  );
}
