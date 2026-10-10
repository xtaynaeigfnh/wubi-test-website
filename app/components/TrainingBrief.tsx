import { getNextTrainingTask } from "../training-plan";
import type { DailyTrainingPlan } from "../types";

export function TrainingBrief({
  plan,
  dueCount,
}: {
  plan: DailyTrainingPlan | null;
  dueCount: number;
}) {
  if (!plan) return null;
  const nextTask = getNextTrainingTask(plan.tasks);
  const completed = plan.tasks.filter((task) => task.status === "completed").length;
  const title = dueCount > 0
    ? `先复习 ${dueCount} 项到期内容`
    : nextTask
      ? `${nextTask.status === "in-progress" ? "继续" : "下一步："}${nextTask.title}`
      : "今天的三步已完成";
  const description = dueCount > 0
    ? "先巩固快要忘记的字词和卡顿片段，再按下面的三步练习。"
    : nextTask
      ? `三步已完成 ${completed}/${plan.tasks.length}，整组预计 ${plan.estimatedMinutes} 分钟。每一步都列出了推荐原因和复盘重点。`
      : "先看今日总结中的剩余弱项，再决定是否加练。单日完成量不代表能力已经提升。";
  const target = dueCount > 0
    ? "#due-review-title"
    : nextTask
      ? `#training-task-${nextTask.type}`
      : "#today-training-plan";

  return (
    <section className="training-brief" aria-labelledby="training-brief-title">
      <div>
        <span className="eyebrow">今天怎么练</span>
        <h2 id="training-brief-title">{title}</h2>
        <p>{description}</p>
      </div>
      <a className="button primary" href={target}>
        {dueCount > 0 ? "查看到期复习" : nextTask ? "查看这一步" : "查看今日总结"}
      </a>
    </section>
  );
}
