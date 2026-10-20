"use client";

import type { ReactNode } from "react";
import { lengthLabels } from "../../../article-practice";
import type { ArticleSort } from "../../../article-library";
import type { ArticleProgress, PracticeArticle } from "../../../types";
import { Modal } from "../../Ui";

export function ArticlePicker({
  filters,
  filtered,
  progressMap,
  onClose,
  onChoose,
  query,
  onQueryChange,
  favoritesOnly,
  onFavoritesOnlyChange,
  sort,
  onSortChange,
  favoriteIds,
  onToggleFavorite,
  favoriteError,
}: {
  filters: ReactNode;
  filtered: PracticeArticle[];
  progressMap: ReadonlyMap<string, ArticleProgress>;
  onClose: () => void;
  onChoose: (article: PracticeArticle) => void;
  query: string;
  onQueryChange: (query: string) => void;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (value: boolean) => void;
  sort: ArticleSort;
  onSortChange: (sort: ArticleSort) => void;
  favoriteIds: ReadonlySet<string>;
  onToggleFavorite: (id: string) => void;
  favoriteError: string;
}) {
  return (
    <Modal title="选择练习文章" onClose={onClose}>
      {filters}
      <div className="article-library-tools">
        <label>
          搜索标题
          <input
            type="search"
            aria-label="搜索文章标题"
            placeholder="输入文章标题中的文字"
            maxLength={100}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <label>
          排序
          <select aria-label="文章排序" value={sort} onChange={(event) => onSortChange(event.target.value as ArticleSort)}>
            <option value="default">默认顺序</option>
            <option value="recent">最近练习</option>
          </select>
        </label>
        <button className="button secondary" aria-pressed={favoritesOnly} onClick={() => onFavoritesOnlyChange(!favoritesOnly)}>
          只看收藏
        </button>
      </div>
      {favoriteError && <p className="article-favorite-error" role="alert">{favoriteError}</p>}
      <div className="article-list">
        <div className="article-list-summary" role="status">
          共 {filtered.length} 篇符合当前筛选条件
        </div>
        {filtered.map((item) => {
          const record = progressMap.get(item.id);
          const favorite = favoriteIds.has(item.id);
          return (
            <div key={item.id} className="article-list-item">
              <button className="article-choice" onClick={() => onChoose(item)}>
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
              <button
                className="article-favorite-toggle"
                aria-label={`${favorite ? "取消收藏" : "收藏"}文章：${item.title}`}
                aria-pressed={favorite}
                onClick={() => onToggleFavorite(item.id)}
              >
                {favorite ? "已收藏" : "收藏"}
              </button>
            </div>
          );
        })}
        {!filtered.length && <div className="empty-state">{favoritesOnly ? "当前收藏中没有符合条件的文章。可以关闭“只看收藏”或调整筛选。" : "没有找到符合条件的文章。试试其他标题文字或调整筛选。"}</div>}
      </div>
    </Modal>
  );
}
