// categories.json / keywords.json（LP の唯一の情報源）を型付けして読み出す。
// 同じ JSON を scripts/prerender.mjs も読み、静的 HTML と sitemap を生成する。
import data from "./categories.json";
import kwData from "./keywords.json";

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

// pathname が /s/<slug> ならその slug を返す。
export function keywordSlug(pathname: string): string | null {
  const m = pathname.match(/^\/s\/([a-z0-9-]+)\/?$/);
  return m ? m[1] : null;
}

// あるカテゴリに属するキーワード LP を返す（カテゴリ LP からの内部リンク用）。
export function keywordsForCategory(categorySlug: string): Keyword[] {
  return KEYWORDS.filter((k) => k.category === categorySlug);
}
