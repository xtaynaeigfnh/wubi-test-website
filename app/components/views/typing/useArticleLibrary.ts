"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  addCustomArticlesWithinLimit,
  buildCommonPracticeArticle,
  buildCustomArticle,
  createLocalId,
  getCustomArticles,
  getProgress,
  isCommonPracticeArticle,
  localDateKey,
  MAX_CUSTOM_TEXT_LENGTH,
  readTrainingPlan,
  selectInitialArticle,
} from "../../../lib";
import { readLocal, readLocalArray, STORAGE, writeLocal } from "../../../storage";
import { loadArticles, loadCommonCharacters } from "../../../content-loader";
import type {
  ArticleFilter,
  ArticleProgress,
  CommonCharacterData,
  CommonCharacterPreset,
  PracticeArticle,
  UserSettings,
} from "../../../types";
import type { GhostMode } from "./useGhostRace";

export interface PracticeControls {
  hasPendingSave: () => boolean;
  resetForArticle: (retryCount: number, ghostMode: GhostMode) => void;
}

export function useArticleLibrary(
  settings: UserSettings,
  {
    settingsReady,
    articleTextRef,
    inputRef,
    practiceControls,
  }: {
    settingsReady: boolean;
    articleTextRef: RefObject<HTMLDivElement | null>;
    inputRef: RefObject<HTMLTextAreaElement | null>;
    practiceControls: RefObject<PracticeControls | null>;
  },
) {
  const onboardingPractice =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("onboarding") === "1";
  const [articles, setArticles] = useState<PracticeArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [articlesError, setArticlesError] = useState("");
  const [articleSaveError, setArticleSaveError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [customTexts, setCustomTexts] = useState<PracticeArticle[]>([]);
  const [article, setArticle] = useState<PracticeArticle | null>(null);
  const [filter, setFilter] = useState<ArticleFilter>({
    length: onboardingPractice ? "short" : settings.preferredLength,
    topic: "all",
    status: "all",
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [commonOpen, setCommonOpen] = useState(false);
  const [commonData, setCommonData] = useState<CommonCharacterData | null>(null);
  const [commonLoading, setCommonLoading] = useState(false);
  const [commonError, setCommonError] = useState("");
  const [customTitle, setCustomTitle] = useState("我的自定义练习");
  const [customText, setCustomText] = useState("");
  const [customError, setCustomError] = useState("");
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const customSaveLock = useRef(false);

  useEffect(() => {
    let active = true;
    setArticlesLoading(true);
    setArticlesError("");
    loadArticles()
      .then((rows) => {
        if (active) setArticles(rows);
      })
      .catch((error: unknown) => {
        if (active) {
          setArticlesError(
            error instanceof Error ? error.message : "练习文章加载失败",
          );
        }
      })
      .finally(() => {
        if (active) setArticlesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  useEffect(() => {
    setCustomTexts(getCustomArticles());
  }, []);

  useEffect(() => {
    setFilter((value) => ({
      ...value,
      length: onboardingPractice ? "short" : settings.preferredLength,
    }));
  }, [onboardingPractice, settings.preferredLength]);

  const refreshProgress = useCallback(() => setProgress(getProgress()), []);
  const retryLoad = useCallback(() => {
    setLoadAttempt((value) => value + 1);
  }, []);
  const progressMap = useMemo(
    () => new Map(progress.map((row) => [row.articleId, row])),
    [progress],
  );
  const availableArticles = useMemo(
    () => [...customTexts, ...articles],
    [articles, customTexts],
  );
  const topics = useMemo(
    () =>
      Array.from(new Set(availableArticles.map((item) => item.topic))).sort(),
    [availableArticles],
  );
  const filtered = useMemo(
    () =>
      availableArticles.filter((item) => {
        const record = progressMap.get(item.id);
        if (filter.length !== "all" && item.length !== filter.length) return false;
        if (filter.topic !== "all" && item.topic !== filter.topic) return false;
        if (filter.status === "new" && record) return false;
        if (filter.status === "practiced" && !record) return false;
        return true;
      }),
    [availableArticles, filter, progressMap],
  );

  const chooseArticle = useCallback(
    (
      next: PracticeArticle,
      focusInput = true,
      nextRetryCount = 0,
      nextGhostMode: GhostMode = "off",
    ) => {
      if (practiceControls.current?.hasPendingSave()) {
        window.alert("本次成绩尚未保存，请先重试保存。");
        return false;
      }
      const previousCurrent = readLocal<string | null>(STORAGE.current, null);
      const previousGenerated = readLocal<PracticeArticle | null>(
        STORAGE.currentGenerated,
        null,
      );
      const previousRecent = readLocalArray<string>(STORAGE.recent);
      const nextRecent = [
        next.id,
        ...previousRecent.filter((id) => id !== next.id),
      ].slice(0, 10);
      const selectionSaved =
        writeLocal(STORAGE.current, next.id) &&
        writeLocal(
          STORAGE.currentGenerated,
          next.kind === "common" ? next : null,
        ) &&
        (next.kind === "common" || writeLocal(STORAGE.recent, nextRecent));
      if (!selectionSaved) {
        writeLocal(STORAGE.current, previousCurrent);
        writeLocal(STORAGE.currentGenerated, previousGenerated);
        if (next.kind !== "common") {
          writeLocal(STORAGE.recent, previousRecent);
        }
        const message =
          "文章选择未能保存，原练习保持不变。请检查浏览器存储空间后重试。";
        setArticleSaveError(message);
        window.alert(message);
        return false;
      }
      setArticleSaveError("");
      setArticle(next);
      practiceControls.current?.resetForArticle(nextRetryCount, nextGhostMode);
      setPickerOpen(false);
      window.setTimeout(() => {
        articleTextRef.current?.scrollTo({ top: 0, behavior: "auto" });
        if (focusInput) inputRef.current?.focus();
      }, 50);
      return true;
    },
    // articleTextRef、inputRef、practiceControls 都是父级传入的稳定 ref，
    // 无需进入依赖；保持 chooseArticle 只创建一次的原始语义。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const fetchCommonCharacterData = useCallback(async () => {
    setCommonLoading(true);
    setCommonError("");
    try {
      const data = await loadCommonCharacters();
      setCommonData(data);
      return data;
    } catch (error: unknown) {
      setCommonError(
        error instanceof Error ? error.message : "常用字表加载失败",
      );
      return null;
    } finally {
      setCommonLoading(false);
    }
  }, []);

  const openCommonPractice = () => {
    setCommonOpen(true);
    if (!commonData && !commonLoading) void fetchCommonCharacterData();
  };

  const startCommonPractice = (
    preset: CommonCharacterPreset,
    shuffled = false,
  ) => {
    if (!commonData) return;
    if (chooseArticle(buildCommonPracticeArticle(commonData, preset, shuffled))) {
      setCommonOpen(false);
    }
  };

  const shuffleCurrentCommonPractice = async () => {
    if (!isCommonPracticeArticle(article)) return;
    const targetId = article.id;
    const data = commonData ?? (await fetchCommonCharacterData());
    if (!data) return;
    // 加载期间用户可能已换到别的文章，不能再把旧范围的常用字强行切回来。
    if (readLocal<string | null>(STORAGE.current, null) !== targetId) return;
    chooseArticle(buildCommonPracticeArticle(data, article.preset, true));
  };

  useEffect(() => {
    const currentId = readLocal<string | null>(STORAGE.current, null);
    const generated = readLocal<unknown>(STORAGE.currentGenerated, null);
    if (currentId && isCommonPracticeArticle(generated) && generated.id === currentId) {
      chooseArticle(generated, false);
    }
  }, [chooseArticle]);

  const randomArticle = useCallback(() => {
    if (!filtered.length) return;
    const recent = new Set(readLocalArray<string>(STORAGE.recent));
    const fresh = filtered.filter((item) => !recent.has(item.id));
    const candidates = fresh.length ? fresh : filtered;
    chooseArticle(candidates[Math.floor(Math.random() * candidates.length)]);
  }, [chooseArticle, filtered]);

  useEffect(() => {
    if (
      !settingsReady ||
      articlesLoading ||
      !availableArticles.length ||
      article
    ) {
      return;
    }
    const storedCurrentId = readLocal<string | null>(STORAGE.current, null);
    if (onboardingPractice) {
      const step = Number(new URLSearchParams(window.location.search).get("step") ?? 0);
      const shortArticles = articles.filter((item) => item.length === "short").sort((a, b) => a.wordCount - b.wordCount || a.id.localeCompare(b.id));
      const selected = shortArticles[Math.max(0, Math.min(2, Number.isInteger(step) ? step : 0))];
      if (selected) { chooseArticle(selected, false); return; }
    }
    const trainingPlan = readTrainingPlan();
    const trainingArticleId =
      trainingPlan?.date === localDateKey(new Date())
        ? trainingPlan.tasks.find(
            (task) =>
              task.type === "article" && task.status === "in-progress",
          )?.articleId
        : undefined;
    const currentId = trainingArticleId ?? storedCurrentId;
    const initialArticle = selectInitialArticle(
      availableArticles,
      articles,
      currentId,
      onboardingPractice ? "short" : settings.preferredLength,
      Boolean(trainingArticleId),
    );
    if (initialArticle) chooseArticle(initialArticle, false);
  }, [
    article,
    articles,
    articlesLoading,
    availableArticles,
    chooseArticle,
    onboardingPractice,
    settings.preferredLength,
    settingsReady,
  ]);

  const useCustomText = () => {
    if (customSaveLock.current) return;
    customSaveLock.current = true;
    const custom = buildCustomArticle(
      `custom-${createLocalId()}`,
      customTitle,
      customText,
    );
    if (!custom) {
      setCustomError(`正文长度需要在 10–${MAX_CUSTOM_TEXT_LENGTH} 个字符之间。`);
      customSaveLock.current = false;
      return;
    }
    const saved = getCustomArticles();
    const merged = addCustomArticlesWithinLimit(saved, [custom]);
    if (!merged.added.length) {
      setCustomError("自定义文章已满 20 篇，请先到设置页删除一篇。");
      customSaveLock.current = false;
      return;
    }
    const nextCustomTexts = merged.articles;
    if (!writeLocal(STORAGE.customTexts, nextCustomTexts)) {
      setCustomError("自定义文章未能保存，请检查浏览器存储空间。");
      customSaveLock.current = false;
      return;
    }
    if (!chooseArticle(custom)) {
      if (!writeLocal(STORAGE.customTexts, saved)) {
        setCustomTexts(getCustomArticles());
        setCustomError("文章选择失败，且自定义文章列表未能回滚，请到设置页检查。");
      } else {
        setCustomTexts(saved);
        setCustomError("文章选择失败，自定义文章未保存，请检查存储空间后重试。");
      }
      customSaveLock.current = false;
      return;
    }
    setCustomError("");
    setCustomTexts(nextCustomTexts);
    setCustomOpen(false);
  };

  const openCustomPractice = () => {
    customSaveLock.current = false;
    setCustomError("");
    setCustomOpen(true);
  };

  const pickMostDifficult = () => {
    const articleIds = new Set(articles.map((item) => item.id));
    const target = [...getProgress()]
      .filter((item) => articleIds.has(item.articleId))
      .sort((a, b) => b.errors - a.errors)
      .find((item) => item.errors > 0);
    const found = articles.find((item) => item.id === target?.articleId);
    if (found) chooseArticle(found);
    else randomArticle();
  };

  return {
    article,
    articles,
    articlesLoading,
    articlesError,
    articleSaveError,
    retryLoad,
    customTexts,
    filter,
    setFilter,
    refreshProgress,
    progressMap,
    availableArticles,
    topics,
    filtered,
    chooseArticle,
    randomArticle,
    pickMostDifficult,
    useCustomText,
    openCustomPractice,
    customTitle,
    setCustomTitle,
    customText,
    setCustomText,
    customError,
    setCustomError,
    pickerOpen,
    setPickerOpen,
    customOpen,
    setCustomOpen,
    commonOpen,
    setCommonOpen,
    commonData,
    commonLoading,
    commonError,
    fetchCommonCharacterData,
    openCommonPractice,
    startCommonPractice,
    shuffleCurrentCommonPractice,
  };
}
