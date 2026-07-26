import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("public/data");

const topics = {
  日常生活: {
    subjects: ["清晨的厨房", "周末的菜市场", "阳台上的绿植", "雨后的街道", "晚饭后的散步", "整理房间", "社区小店", "一杯热茶"],
    actions: ["让熟悉的日子显出新的层次", "提醒人们留意身边微小的变化", "把匆忙的脚步慢慢安顿下来", "给普通的一天添上一点秩序", "让人与人之间的照应变得自然"],
    details: ["窗边的光线缓缓移动", "锅里的水发出细小的声响", "邻居在门口简单地打了招呼", "风把晾晒的衣服轻轻吹起", "远处传来公交车进站的提示音"],
  },
  职场办公: {
    subjects: ["一次项目复盘", "安静的工作上午", "跨部门协作", "会议前的准备", "共享文档的整理", "新同事入职", "任务优先级", "下班前的检查"],
    actions: ["让复杂任务重新变得清晰", "帮助团队减少重复沟通", "使每个人都能看见下一步行动", "把零散信息收拢成可靠结论", "为后续协作留下明确依据"],
    details: ["表格中的数字逐项核对", "待办事项被重新排定顺序", "同事补充了关键背景", "会议记录写明了负责人和期限", "一个模糊问题终于得到定义"],
  },
  科技数码: {
    subjects: ["旧电脑的升级", "桌面设备的整理", "一次系统更新", "键盘手感的变化", "本地数据备份", "智能设备联动", "软件设置迁移", "网络连接排查"],
    actions: ["让工具重新服务于真实需求", "减少不必要的等待和打断", "把便利建立在可控和可靠之上", "提醒使用者关注数据边界", "使日常操作保持轻快稳定"],
    details: ["指示灯恢复了稳定的节奏", "备份完成后生成了校验记录", "快捷键被调整到更顺手的位置", "屏幕上的提示变得简洁明确", "风扇噪声在清理后明显降低"],
  },
  自然旅行: {
    subjects: ["沿河步道", "山间清晨", "海边小城", "秋日公园", "夜行列车", "林间小路", "南方雨季", "北方初雪"],
    actions: ["让旅途拥有可以回想的细节", "把陌生风景慢慢变成具体经验", "提醒行人尊重天气和道路", "使短暂的停留留下清楚印象", "让视线从目的地回到沿途"],
    details: ["云层在远山上方逐渐散开", "潮水把细沙推成弯曲的纹路", "树叶在风中发出连续的轻响", "站台广播穿过清凉的空气", "湿润的石阶反射着微弱天光"],
  },
  阅读随笔: {
    subjects: ["重读一本旧书", "安静的图书馆", "书页上的批注", "一篇短篇小说", "睡前阅读", "纸质书与电子书", "被折起的一页", "故事中的留白"],
    actions: ["让读者重新理解曾经忽略的句子", "把个人经验带进文字的空隙", "使模糊感受获得可以表达的形状", "提醒人们答案不必总是立刻出现", "让思考在合上书后继续延伸"],
    details: ["铅笔写下的日期已经有些遥远", "窗外的声音没有打断阅读", "某个普通段落忽然显得格外准确", "目录旁留下了一枚浅色书签", "灯光把纸张照出温和的颜色"],
  },
  历史文化: {
    subjects: ["老街的门牌", "地方博物馆", "古桥的修缮", "传统节气", "旧照片中的城市", "手工技艺", "乡音与地名", "家族口述故事"],
    actions: ["让过去与今天建立可理解的联系", "把宏大叙述还原为具体生活", "提醒参观者珍惜可靠的记录", "使地方记忆得到耐心保存", "让传统在新的使用方式中继续存在"],
    details: ["展柜旁标注了器物的来历", "石墙上的痕迹记录着多次修补", "老人用缓慢语速讲起旧时街景", "地图上的地名仍保留古老读音", "节令食物带着清楚的地域特点"],
  },
  通俗科普: {
    subjects: ["睡眠与记忆", "天气预报的形成", "植物的向光性", "城市中的鸟类", "声音的传播", "饮水与体温", "地图投影", "日常材料的循环"],
    actions: ["帮助读者区分现象与推测", "把抽象概念放回日常观察", "提醒人们重视条件和范围", "让复杂过程变得可以追踪", "使结论保持准确而不过度延伸"],
    details: ["一次观察需要记录时间和环境", "不同条件会带来明显差异", "简单模型只能解释其中一部分", "可靠结论往往来自重复验证", "新的证据可能修正原有判断"],
  },
};

const transitions = [
  "如果把注意力放得更细，就会发现",
  "事情真正开始变化，往往不是因为突然的决定，而是因为",
  "回头来看，最值得记录的并不是结果本身，而是",
  "在这个过程中，人们逐渐意识到",
  "看似普通的安排背后，其实包含着",
  "当节奏稳定下来以后，许多细节也随之清楚起来，例如",
];

const endings = [
  "这件事没有夸张的转折，却足以说明，认真对待日常，本身就是一种持续的能力。",
  "等一切告一段落，留下来的不仅是结果，还有一套下次可以继续使用的方法。",
  "人们最终记住的，常常不是最响亮的瞬间，而是那些真实、具体并且能够再次验证的细节。",
  "这样的经验并不神秘，它来自观察、记录、调整，以及在必要时愿意重新开始。",
];

function sentenceFor(topic, index, articleNumber) {
  const data = topics[topic];
  const subject = data.subjects[(index + articleNumber) % data.subjects.length];
  const action = data.actions[(index * 2 + articleNumber) % data.actions.length];
  const detail = data.details[(index * 3 + articleNumber) % data.details.length];
  const transition = transitions[(index + articleNumber * 2) % transitions.length];
  const patterns = [
    `谈到${subject}，许多人首先想到的是结果，但真正值得留意的是过程，它${action}。`,
    `${detail}，这个不显眼的片段使${subject}显得具体，也${action}。`,
    `${transition}${detail}，而这种变化会${action}。`,
    `有人把${subject}当成例行事务，也有人愿意多观察一步，于是${detail}，并且${action}。`,
    `面对${subject}，合适的做法不是急着下结论，而是先确认事实；${detail}，随后再${action}。`,
    `从${subject}出发，可以看到习惯如何形成：先从小处开始，再依据反馈调整，最终${action}。`,
  ];
  return patterns[(index + articleNumber) % patterns.length];
}

function buildRegular(topic, articleNumber, minLength, preferredLength) {
  let text = `第${articleNumber}篇练习从${topics[topic].subjects[articleNumber % topics[topic].subjects.length]}说起。`;
  let index = 0;
  while (text.length < preferredLength) {
    text += sentenceFor(topic, index, articleNumber);
    if (index % 4 === 3) text += "\n\n";
    index += 1;
  }
  text += endings[articleNumber % endings.length];
  if (text.length < minLength) text += sentenceFor(topic, index + 1, articleNumber);
  return text.trim();
}

function clampAtSentence(text, minLength, maxLength) {
  if (text.replace(/\s/g, "").length <= maxLength) return text;
  const compact = text.replace(/\s/g, "");
  const window = compact.slice(0, maxLength);
  const punctuation = Math.max(
    window.lastIndexOf("。"),
    window.lastIndexOf("！"),
    window.lastIndexOf("？"),
  );
  const end = punctuation + 1 >= minLength ? punctuation + 1 : maxLength;
  return compact.slice(0, end).replace(/[^。！？]$/, "$&。");
}

const chatThemes = [
  ["机械键盘的轴体手感", "办公室里不打扰同事的声音", "先试用几天再决定是否更换"],
  ["周末去哪里散步", "河边步道和老城区的不同路线", "根据天气临时调整出发时间"],
  ["早餐怎样准备更省事", "热豆浆、面包和提前煮好的鸡蛋", "把复杂选择留到不赶时间的时候"],
  ["桌面文件总是越放越乱", "按项目归档和统一文件名", "每周五用十分钟集中整理"],
  ["晚上读书容易走神", "纸质书、电子书和环境光线", "先读短章节建立稳定节奏"],
  ["旧电脑是否值得升级", "内存、硬盘和实际使用需求", "先确认瓶颈再购买零件"],
  ["旅行时应该带多少东西", "备用衣物、充电器和常用药品", "让每件物品都有明确用途"],
  ["家里的绿植怎么照顾", "浇水频率、通风和窗边光照", "观察叶片状态而不是照搬日期"],
  ["会议记录到底怎么写", "结论、负责人和完成期限", "让没参会的人也能读懂"],
  ["午休时间应该怎样安排", "短暂闭眼、散步和减少刷屏", "以醒来后精神更好为标准"],
  ["下雨天通勤很麻烦", "鞋袜、防水袋和公交到站时间", "比平时提前十分钟出门"],
  ["家常菜怎样稳定发挥", "火候、调味顺序和食材大小", "先掌握两三个基础做法"],
  ["手机通知太多怎么办", "工作消息、促销提醒和应用红点", "只保留真正需要即时响应的通知"],
  ["学习新软件从哪里开始", "核心功能、快捷键和示例项目", "先完成一个真实的小任务"],
  ["拍照时怎样避免画面杂乱", "主体位置、背景线条和光线方向", "移动一步再按下快门"],
  ["房间收纳为什么总会反弹", "物品数量、固定位置和取用习惯", "先减少没有用途的东西"],
  ["早起计划总是难以坚持", "睡前准备、闹钟位置和起床动作", "逐步提前而不是突然改变一小时"],
  ["地图软件推荐的路线不同", "距离、坡度和换乘次数", "结合自己的体力与时间选择"],
  ["备份照片应该放在哪里", "本地硬盘、云端副本和目录结构", "定期抽查文件是否真的能打开"],
  ["练习打字怎样保持耐心", "准确率、连续练习时间和休息间隔", "先求稳定再逐渐提高速度"],
];

const chatPatterns = [
  (subject, detail, decision) => `有人先抛出问题：“${subject}，大家平时都是怎么处理的？”消息发出后，很快有人从${detail}说起，并提出可以${decision}。`,
  (subject, detail, decision) => `一位网友觉得讨论${subject}不能只看表面，他把${detail}分别列出来，建议${decision}。`,
  (subject, detail, decision) => `另一位群友分享了自己的失败经历，原来忽略${detail}以后，${subject}就会比想象中麻烦，于是他现在选择${decision}。`,
  (subject, detail, decision) => `看到这里，新加入的人先翻完前面的消息，再追问${subject}有没有例外情况；大家围绕${detail}补充了几个具体例子，也认可${decision}。`,
  (subject, detail, decision) => `有人发了一个表示赞同的表情，又认真提醒，网络上的经验只能当作参考，真正行动前最好${decision}。`,
  (subject, detail, decision) => `话题转了一圈又回到${subject}，这次大家不再争论唯一答案，而是确认${detail}会因场景不同而变化，因此适合${decision}。`,
  (subject, detail, decision) => `讨论最有用的部分，是有人把${subject}拆成可以执行的小步骤，并把${detail}写得很清楚，最后决定${decision}。`,
  (subject, detail, decision) => `临近结束时，群友把关于${subject}的建议整理成清单，其中重点仍然是${detail}，并约好先${decision}。`,
];

function buildChat(articleNumber, preferredLength) {
  const [subject, detail, decision] = chatThemes[(articleNumber - 1) % chatThemes.length];
  let text = `晚上闲聊时，群里从“${subject}”这个小问题开始，慢慢变成了一场认真又轻松的经验交流。`;
  let index = 0;
  while (text.length < preferredLength) {
    const line = chatPatterns[(index + articleNumber) % chatPatterns.length](
      subject,
      detail,
      decision,
    );
    const lead = ["接着，", "过了一会儿，", "看到这里，", "也有人补充，", "几条消息以后，"][index % 5];
    text += `${lead}${line}`;
    if (index % 3 === 2) text += "\n\n";
    index += 1;
  }
  text += `这场关于${subject}的聊天没有宏大的结论，但每个人都带走了一点可以马上尝试的办法，第二天再看也不会觉得空洞。`;
  return text.trim();
}

const articleSpecs = [
  { length: "short", count: 80, min: 80, preferred: 118 },
  { length: "medium", count: 70, min: 300, preferred: 410 },
  { length: "long", count: 30, min: 1000, preferred: 1220 },
];

const titles = {
  日常生活: ["窗边的小事", "把一天过得有条理", "街角的普通时刻", "慢下来以后"],
  职场办公: ["清楚比忙碌更重要", "一次可靠的交接", "让协作少走弯路", "工作中的小复盘"],
  科技数码: ["工具应该保持安静", "桌面上的数字生活", "一次稳妥的更新", "让设备重新顺手"],
  自然旅行: ["沿途比终点更丰富", "风景中的细节", "走进陌生的清晨", "天气改变了路线"],
  阅读随笔: ["合上书以后", "旧书里的新发现", "文字留下的空白", "一页安静的阅读"],
  历史文化: ["老街仍在讲述", "被保存下来的名字", "时间留下的手艺", "从一件旧物开始"],
  通俗科普: ["从日常现象出发", "观察需要耐心", "结论从哪里来", "把复杂问题说清楚"],
};

const articles = [];
let serial = 1;
const topicNames = Object.keys(topics);

for (const spec of articleSpecs) {
  for (let i = 0; i < spec.count; i += 1) {
    const topic = topicNames[(serial + i) % topicNames.length];
    const titleBase = titles[topic][(serial + i * 2) % titles[topic].length];
    const preferred = spec.preferred + ((i * 17) % Math.max(20, Math.floor(spec.preferred * 0.18)));
    const generated = buildRegular(topic, serial, spec.min, preferred);
    const text =
      spec.length === "short"
        ? clampAtSentence(generated, spec.min, 180)
        : generated;
    articles.push({
      id: `${spec.length}-${String(i + 1).padStart(3, "0")}`,
      title: `${titleBase} · ${i + 1}`,
      length: spec.length,
      topic,
      wordCount: text.replace(/\s/g, "").length,
      version: 1,
      text,
    });
    serial += 1;
  }
}

for (let i = 0; i < 20; i += 1) {
  const text = buildChat(i + 1, 540 + ((i * 31) % 210));
  articles.push({
    id: `water-${String(i + 1).padStart(3, "0")}`,
    title: `群聊里的一件小事 · ${i + 1}`,
    length: "water",
    topic: "网络聊天",
    wordCount: text.replace(/\s/g, "").length,
    version: 1,
    text,
  });
}

const groups = {
  short: articles.filter((article) => article.length === "short"),
  medium: articles.filter((article) => article.length === "medium"),
  long: articles.filter((article) => article.length === "long"),
  water: articles.filter((article) => article.length === "water"),
};

await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "articles-index.json"),
  JSON.stringify(
    articles.map((article) => ({
      id: article.id,
      title: article.title,
      length: article.length,
      topic: article.topic,
      wordCount: article.wordCount,
      version: article.version,
    })),
    null,
    2,
  ),
);

for (const [name, rows] of Object.entries(groups)) {
  await writeFile(
    path.join(outputDir, `articles-${name}.json`),
    JSON.stringify(rows.map(({ id, text }) => ({ id, text }))),
  );
}

console.log(`Generated ${articles.length} original practice articles.`);
