import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCommonPracticeArticle,
  buildChallengePool,
  buildCustomArticle,
  calculateAccuracy,
  calculateRemainingSeconds,
  calculateTypingMetrics,
  canCompleteTyping,
  commonCharacterPresets,
  countCommittedAttempts,
  formatCommonCharacterText,
  getCommonCharacterSlice,
  isCommonPracticeArticle,
  preferShortestWubiCodes,
  selectInitialArticle,
  shuffleCharacters,
  shouldDeferInputCommit,
} from "../app/lib.ts";
import {
  getAdjacentTrackIndex,
  parseMusicCatalog,
  parseMusicPreferences,
  withBasePath,
} from "../app/music.ts";

test("typing accuracy keeps corrected mistakes in the denominator", () => {
  const target = "中国";
  const wrong = countCommittedAttempts("", "错", target);
  const erase = countCommittedAttempts("错", "", target);
  const firstCorrect = countCommittedAttempts("", "中", target);
  const secondCorrect = countCommittedAttempts("中", "中国", target);

  const attempts =
    wrong.attempts +
    erase.attempts +
    firstCorrect.attempts +
    secondCorrect.attempts;
  const correct =
    wrong.correct +
    erase.correct +
    firstCorrect.correct +
    secondCorrect.correct;

  assert.equal(attempts, 3);
  assert.equal(correct, 2);
  assert.ok(Math.abs(calculateAccuracy(correct, attempts) - 200 / 3) < 1e-10);
  assert.equal(calculateAccuracy(0, 0), 100);
});

test("typing completes at full length even when answers contain mistakes", () => {
  assert.equal(canCompleteTyping("中国", "中国"), true);
  assert.equal(canCompleteTyping("中错", "中国"), true);
  assert.equal(canCompleteTyping("中", "中国"), false);
  assert.equal(canCompleteTyping("", ""), false);
});

test("typing result metrics only credit characters that actually match", () => {
  assert.deepEqual(
    calculateTypingMetrics({
      typed: "中错",
      target: "中国",
      durationSeconds: 2,
      keyCount: 6,
      letterKeys: 4,
      attemptCount: 2,
      correctAttemptCount: 1,
    }),
    {
      correctChars: 1,
      attemptedChars: 2,
      speed: 30,
      kps: 3,
      codeLength: 4,
      accuracy: 50,
    },
  );
});

test("challenge countdown derives from its wall-clock deadline", () => {
  const deadline = 160_000;
  assert.equal(calculateRemainingSeconds(deadline, 100_000), 60);
  assert.equal(calculateRemainingSeconds(deadline, 100_250), 60);
  assert.equal(calculateRemainingSeconds(deadline, 159_100), 1);
  assert.equal(calculateRemainingSeconds(deadline, 170_000), 0);
});

test("custom articles share one normalized construction path", () => {
  const article = buildCustomArticle(
    "custom-1",
    "  标题\u0000  带空格  ",
    "\u0000  这是至少十个字符的自定义正文。  ",
  );

  assert.deepEqual(article, {
    id: "custom-1",
    title: "标题 带空格",
    length: "short",
    topic: "自定义",
    wordCount: 15,
    version: 1,
    text: "这是至少十个字符的自定义正文。",
    kind: "custom",
  });
  assert.equal(buildCustomArticle("custom-2", "", "太短"), null);
});

test("initial article follows the preferred length without losing compatible progress", () => {
  const short = {
    id: "short-1",
    title: "短文",
    length: "short",
    topic: "测试",
    wordCount: 2,
    version: 1,
    text: "短文",
  };
  const water = {
    ...short,
    id: "water-1",
    title: "水文",
    length: "water",
    text: "水文",
  };
  const articles = [short, water];

  assert.equal(
    selectInitialArticle(articles, articles, short.id, "water")?.id,
    water.id,
  );
  assert.equal(
    selectInitialArticle(articles, articles, water.id, "water")?.id,
    water.id,
  );
  assert.equal(
    selectInitialArticle(articles, articles, short.id, "all")?.id,
    short.id,
  );
});

test("IME pre-edit buffers are deferred and a repeated final value is not counted twice", () => {
  assert.equal(shouldDeferInputCommit(true, false), true);
  assert.equal(shouldDeferInputCommit(false, true), true);
  assert.equal(shouldDeferInputCommit(false, false), false);

  const target = "中国";
  const firstCommit = countCommittedAttempts("", "中", target);
  const repeatedCommit = countCommittedAttempts("中", "中", target);
  const secondCommit = countCommittedAttempts("中", "中国", target);

  assert.deepEqual(firstCommit, { attempts: 1, correct: 1 });
  assert.deepEqual(repeatedCommit, { attempts: 0, correct: 0 });
  assert.deepEqual(secondCommit, { attempts: 1, correct: 1 });
});

test("shortest Wubi code wins and equal lengths prefer higher weight", () => {
  const preferred = preferShortestWubiCodes([
    ["测", "imj", 100],
    ["测", "im", 80],
    ["测", "ia", 90],
    ["试", "ya", 50],
  ]);

  assert.deepEqual(preferred, [
    ["测", "ia", 90],
    ["试", "ya", 50],
  ]);
});

test("challenge filters eligible codes before choosing the shortest one", () => {
  const pool = buildChallengePool([
    ["睚", "hff", 1],
    ["睚", "hffg", 100000],
    ["五笔", "ggtt", 200000],
    ["低频", "abcd", 99999],
  ], "char");

  assert.deepEqual(pool, [["睚", "hffg", 100000]]);
});

test("common-character presets use exact non-overlapping frequency ranges", () => {
  const characters = Array.from({ length: 1500 }, (_, index) =>
    String.fromCodePoint(0x4e00 + index),
  ).join("");
  const data = {
    version: 1,
    source: { name: "test", url: "https://example.com", retrievedAt: "2026-07-29" },
    characters,
  };

  const first500Groups = commonCharacterPresets
    .slice(0, 10)
    .map(({ id }) => getCommonCharacterSlice(data, id));
  const middle500 = getCommonCharacterSlice(data, "middle-500");
  const last500 = getCommonCharacterSlice(data, "last-500");
  const first1500 = getCommonCharacterSlice(data, "first-1500");

  assert.equal(first500Groups.length, 10);
  assert.ok(first500Groups.every((group) => group.length === 50));
  const first500 = first500Groups.flat();
  assert.equal(first500.length, 500);
  assert.equal(new Set(first500).size, 500);
  assert.equal(middle500.length, 500);
  assert.equal(last500.length, 500);
  assert.deepEqual(
    [...first500, ...middle500, ...last500],
    first1500,
  );
});

test("common-character formatting adds presentation-only groups", () => {
  const characters = Array.from("的一了是不我人有在这国大个中他和你来上要们年为会就地到说出家子发儿生么业也经着得时作以工对多好那学可行");
  const text = formatCommonCharacterText(characters);

  assert.equal(text.replace(/\s/g, ""), characters.join(""));
  assert.equal(text.split("\n")[0].length, 10);
  assert.match(text, /\n\n/);
});

test("common-character shuffle preserves the full set and practice metadata", () => {
  const data = {
    version: 1,
    source: { name: "test", url: "https://example.com", retrievedAt: "2026-07-29" },
    characters: Array.from({ length: 1500 }, (_, index) =>
      String.fromCodePoint(0x4e00 + index),
    ).join(""),
  };
  const ordered = buildCommonPracticeArticle(data, "first-050");
  const shuffled = buildCommonPracticeArticle(
    data,
    "first-050",
    true,
    () => 0,
  );

  assert.equal(ordered.wordCount, 50);
  assert.equal(ordered.shuffled, false);
  assert.equal(shuffled.shuffled, true);
  assert.notEqual(shuffled.text, ordered.text);
  assert.deepEqual(
    [...shuffleCharacters(getCommonCharacterSlice(data, "first-050"), () => 0)].sort(),
    [...getCommonCharacterSlice(data, "first-050")].sort(),
  );
  assert.equal(isCommonPracticeArticle(ordered), true);
  assert.equal(isCommonPracticeArticle(shuffled), true);
  assert.equal(
    isCommonPracticeArticle({ ...shuffled, wordCount: 99 }),
    false,
  );
});

const validMusicTrack = {
  id: "quiet-keys",
  title: "Quiet Keys",
  artist: "Test Artist",
  sources: [
    {
      src: "/audio/tracks/quiet-keys.mp3",
      type: "audio/mpeg",
    },
  ],
  durationSeconds: 180,
  license: "CC0 1.0 Universal",
  sourceUrl: "https://example.com/quiet-keys",
};

test("music catalog accepts local tracks and skips invalid entries", () => {
  const result = parseMusicCatalog({
    version: 1,
    tracks: [
      validMusicTrack,
      {
        ...validMusicTrack,
        id: "remote",
        sources: [
          { src: "https://example.com/a.mp3", type: "audio/mpeg" },
        ],
      },
      {
        ...validMusicTrack,
        id: "traversal",
        sources: [
          { src: "/audio/tracks/../secret.mp3", type: "audio/mpeg" },
        ],
      },
      {
        ...validMusicTrack,
        id: "unsupported",
        sources: [{ src: "/audio/tracks/a.wav", type: "audio/wav" }],
      },
      validMusicTrack,
    ],
  });

  assert.equal(result.catalog.tracks.length, 1);
  assert.equal(result.catalog.tracks[0].id, "quiet-keys");
  assert.equal(result.invalidTrackCount, 4);
});

test("music catalog rejects unsupported versions and empty catalogs", () => {
  assert.throws(
    () => parseMusicCatalog({ version: 2, tracks: [validMusicTrack] }),
    /版本不受支持/,
  );
  assert.throws(
    () =>
      parseMusicCatalog({
        version: 1,
        tracks: [{ ...validMusicTrack, title: "" }],
      }),
    /没有可播放/,
  );
});

test("music preferences recover safely when the catalog changes", () => {
  const tracks = [
    validMusicTrack,
    { ...validMusicTrack, id: "second-track" },
  ];

  assert.deepEqual(
    parseMusicPreferences(
      { trackId: "removed-track", volume: 2, muted: true },
      tracks,
    ),
    { trackId: "quiet-keys", volume: 1, muted: true },
  );
  assert.deepEqual(parseMusicPreferences("broken", tracks), {
    trackId: "quiet-keys",
    volume: 0.35,
    muted: false,
  });
});

test("music navigation wraps and assets preserve the deployment base path", () => {
  assert.equal(getAdjacentTrackIndex(5, 4, 1), 0);
  assert.equal(getAdjacentTrackIndex(5, 0, -1), 4);
  assert.equal(getAdjacentTrackIndex(0, 0, 1), -1);
  assert.equal(
    withBasePath("/audio/tracks/test.mp3", "/wubi-test-website"),
    "/wubi-test-website/audio/tracks/test.mp3",
  );
});
