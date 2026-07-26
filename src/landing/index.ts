// categories.json / keywords.json / ranking.json（LP の唯一の情報源）を型付けして読み出す。
// 同じ JSON を scripts/prerender.mjs も読み、静的 HTML と sitemap を生成する。
import data from "./categories.json";
import kwData from "./keywords.json";
import rankingData from "./ranking.json";

export type Category = {
  slug: string;
  name: string;
  title: string;
  description: string;
  lead: string;
  body: string[];
  keywords: string[];
};

export const CATEGORIES: Category[] = data.categories;
export const CATEGORIES_UPDATED: string = data.updated;

// /c/<slug> の <slug> からカテゴリを引く。無ければ undefined。
export function categoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

// pathname が /c/<slug> ならその slug を返す。
export function landingSlug(pathname: string): string | null {
  const m = pathname.match(/^\/c\/([a-z0-9-]+)\/?$/);
  return m ? m[1] : null;
}

// ---- キーワード単位 LP（/s/<slug>）------------------------------------
export type Keyword = {
  slug: string;
  term: string;
  category: string;
  title: string;
  description: string;
  lead: string;
  body: string[];
  related: string[];
};

export const KEYWORDS: Keyword[] = kwData.keywords;
export const KEYWORDS_UPDATED: string = kwData.updated;

export function keywordBySlug(slug: string): Keyword | undefined {
  return KEYWORDS.find((k) => k.slug === slug);
}

// 検索語（表示文字列）に一致するキーワード LP を引く。ライブランキングの
// 各語から、対応する LP があれば内部リンクを張るために使う。
export function keywordByTerm(term: string): Keyword | undefined {
  const t = term.trim().toLowerCase();
  return KEYWORDS.find((k) => k.term.toLowerCase() === t);
}

// pathname が /s/<slug> ならその slug を返す。
export function keywordSlug(pathname: string): string | null {
  const m = pathname.match(/^\/s\/([a-z0-9-]+)\/?$/);
  return m ? m[1] : null;
}

// あるカテゴリに属するキーワード LP を返す（カテゴリ LP からの内部リンク用）。
export function keywordsForCategory(categorySlug: string): Keyword[] {
  return KEYWORDS.filter((k) => k.category === categorySlug);
}

// ---- 人気検索キーワードランキング（/ranking）---------------------------
// linkable asset（被リンクを獲得する目的の独自データページ）の情報源。
// slug が既存キーワード LP を指す場合は /s/<slug> へ内部リンクし、
// 無い場合はトップの横断検索（/?q=）へ流す。
export type RankingItem = {
  rank: number;
  term: string;
  /** 対応するキーワード LP の slug。KEYWORDS に無ければ検索へフォールバック。 */
  slug?: string;
  category: string;
  /** 注目度ベースの基準検索数（月間相当）。ライブ集計が無いときの表示に使う。 */
  count?: number;
  /** 前回集計比のトレンド。表示バッジに使う。 */
  trend?: "up" | "down" | "same" | "new";
  note?: string;
};

export type RankingCategory = { slug: string; label: string };

export type Ranking = {
  updated: string;
  period: string;
  source: string;
  intro: string;
  categories: RankingCategory[];
  items: RankingItem[];
};

export const RANKING: Ranking = rankingData as Ranking;
export const RANKING_UPDATED: string = rankingData.updated;

// ランキングのカテゴリタブ（総合＋主要カテゴリ）。slug はバックエンドの分類 ID と一致。
// ranking.json を唯一の情報源にし、prerender.mjs も同じ配列を読む。
export const RANKING_CATEGORIES: RankingCategory[] = RANKING.categories;

export function rankingCategoryBySlug(slug: string): RankingCategory | undefined {
  return RANKING_CATEGORIES.find((c) => c.slug === slug);
}

// 静的シード（ranking.json）をカテゴリで絞る。ライブ集計が取れないときの
// フォールバック表示＆プリレンダの静的本文に使う。"all" は全件。
export function seedRankingItems(category: string): RankingItem[] {
  if (category === "all") return RANKING.items;
  return RANKING.items
    .filter((i) => i.category === category)
    .map((i, idx) => ({ ...i, rank: idx + 1 }));
}

// pathname が /ranking なら true（総合）。
export function isRankingPath(pathname: string): boolean {
  return pathname === "/ranking" || pathname === "/ranking/";
}

// pathname が /ranking/<category> ならその category slug を返す（総合は null）。
export function rankingCategorySlug(pathname: string): string | null {
  const m = pathname.match(/^\/ranking\/([a-z0-9-]+)\/?$/);
  if (!m) return null;
  return rankingCategoryBySlug(m[1]) && m[1] !== "all" ? m[1] : null;
}

// ランキング項目のリンク先を決める（キーワード LP があれば内部リンク優先）。
export function rankingHref(item: RankingItem): string {
  if (item.slug && keywordBySlug(item.slug)) return `/s/${item.slug}`;
  return `/?q=${encodeURIComponent(item.term)}`;
}
