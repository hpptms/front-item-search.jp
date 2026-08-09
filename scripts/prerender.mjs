// ビルド後プリレンダ。dist/index.html をテンプレートに、
//   - トップ（/）: 固有 <head> ＋ クローラー向け静的本文（主要ページへのハブ）
//   - カテゴリ LP（/c/<slug>）/ キーワード LP（/s/<slug>）: 固有 <head> ＋ クローラー向け静的本文
//   - ランキング LP（/ranking）: 固有 <head> ＋ 静的本文 ＋ ItemList 構造化データ
//   - /about, /terms, /privacy: 固有 <head>（本文は JS 描画）を焼き込む
//   - sitemap.xml: 全 URL を再生成
// を出力する。CSR のままでは空 HTML になる問題を、静的スナップショットで補う。
//
// 依存なし（Node 標準のみ）。package.json の build から呼ばれる。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const ORIGIN = "https://item-search.jp";

// --- 情報源 ---------------------------------------------------------------
const { categories, updated } = JSON.parse(
  await readFile(join(ROOT, "src/landing/categories.json"), "utf8")
);
const { keywords, updated: kwUpdated } = JSON.parse(
  await readFile(join(ROOT, "src/landing/keywords.json"), "utf8")
);
const ranking = JSON.parse(
  await readFile(join(ROOT, "src/landing/ranking.json"), "utf8")
);

// ランキングの集計期間ラベル（例: 2026年8月）。ranking.json に固定文字列を
// 持たせると月が変わっても古いままになるので、ビルド時の日付から作る。
// 画面側（JS 起動後）は src/landing/index.ts の rankingPeriodLabel() が
// 同じ計算をして常に現在の月に更新する。集計は JST 基準。
const RANKING_PERIOD = (() => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const num = (t) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return `${num("year")}年${num("month")}月`;
})();

// トップ（/）の <head>（src/seo.ts の ROUTE_SEO["/"] と内容を合わせる）。
const HOME = {
  title: "商品横断検索 | Amazon・楽天・メルカリを一括比較 - item-search.jp",
  description:
    "Amazon・楽天市場・Yahoo!ショッピング・メルカリ・ヤフオク・ヨドバシ・ビックカメラを横断して一括検索。サイトをまたいで価格を比較し、ほしい商品の最安値を見つけられる無料の通販横断検索サービスです。",
};

// 対応ショップ（src/pages/About.tsx の一覧と揃える）。
const SHOPS = [
  "Amazon",
  "楽天市場",
  "Yahoo!ショッピング",
  "メルカリ",
  "Yahoo!オークション",
  "ヨドバシ.com",
  "ビックカメラ",
];

// トップに載せる人気キーワードの件数（多すぎると JS 描画までの一瞬の表示が重くなる）。
const HOME_RANKING_MAX = 10;

// トップ・固定ページの最終更新日。文言を変えたらここも更新する。
// sitemap の lastmod になり、scripts/indexnow.mjs の「変わった URL だけ送る」
// 判定にも使われる（更新し忘れると IndexNow に通知が飛ばない）。
const HOME_UPDATED = "2026-07-27";
const STATIC_UPDATED = "2026-07-27";

// /about, /terms, /privacy の <head>（src/seo.ts の ROUTE_SEO と内容を合わせる）。
// h1 は各ページの src/pages/*.tsx で PageLayout に渡している title と揃える。
const STATIC_PAGES = [
  {
    path: "/about",
    title: "サイトの説明・使い方 | item-search.jp 商品横断検索",
    description:
      "item-search.jp は複数の通販サイトを横断して商品を一括検索できるサービスです。対応ショップ・使い方・よくある質問をまとめています。",
    h1: "サイトの説明",
    changefreq: "monthly",
    priority: "0.5",
    updated: STATIC_UPDATED,
  },
  {
    path: "/terms",
    title: "利用規約 | item-search.jp 商品横断検索",
    description:
      "item-search.jp（商品横断検索サービス）の利用規約です。サービスの内容、価格情報の扱い、アフィリエイト、免責事項などを定めています。",
    h1: "利用規約",
    updatedAt: "2026年7月27日",
    changefreq: "yearly",
    priority: "0.3",
    updated: STATIC_UPDATED,
  },
  {
    path: "/privacy",
    title: "プライバシーポリシー・運営者情報 | item-search.jp",
    description:
      "item-search.jp のプライバシーポリシーです。Googleアナリティクスやアフィリエイト Cookie の利用、検索履歴の扱い、運営者情報・お問い合わせ先を記載しています。",
    h1: "プライバシーポリシー",
    updatedAt: "2026年7月27日",
    changefreq: "yearly",
    priority: "0.3",
    updated: STATIC_UPDATED,
  },
];

// --- /about, /terms, /privacy の本文 ---------------------------------------
// クローラー向け静的本文。文言は src/pages/About.tsx・Terms.tsx・Privacy.tsx と
// 一致させること（あちらは JS 起動後にこの内容を上書きする）。
const ABOUT_FEATURES = [
  [
    "一度の検索で横断",
    "キーワードを1回入力するだけで、複数の通販サイトをまとめて検索します。サイトを1つずつ開いて回る必要はありません。",
  ],
  [
    "価格を並べて比較",
    "検索結果はサイトごとに整理して表示。安い順・高い順に並び替えれば、同じ商品の価格差がひと目でわかります。",
  ],
  [
    "主要ショップに対応",
    "大手モールからフリマ・オークションまで幅広くカバー。新品も中古も横断して探せます。",
  ],
  [
    "検索履歴はブラウザに保存",
    "過去の検索キーワードはお使いのブラウザ内にのみ保存され、サーバーには送信・保持されません。",
  ],
];

const ABOUT_FAQ = [
  ["利用に料金はかかりますか？", "いいえ。検索・比較機能はどなたでも無料でご利用いただけます。"],
  [
    "会員登録は必要ですか？",
    "不要です。登録なしですぐに検索を始められます。検索履歴もお使いのブラウザ内に保存されるだけです。",
  ],
  [
    "表示されている価格は正確ですか？",
    "価格や在庫は各ショップから取得した時点の情報で、常に最新・正確であることを保証するものではありません。セールやポイント、送料、時間差などにより実際の販売価格と異なる場合があります。購入前に必ずリンク先の販売ページで最新の情報をご確認ください。",
  ],
  [
    "どうやって収益を得ているのですか？",
    '当サイトは各ショップのアフィリエイトプログラム（Amazonアソシエイト、楽天アフィリエイト、バリューコマース等）を利用しています。リンク経由で商品が購入されると、当サイトが紹介料を受け取ることがあります。ご利用者に追加の負担は発生しません。詳しくは<a href="/terms/">利用規約</a>をご覧ください。',
  ],
];

function aboutBody() {
  const shops = SHOPS.map((s) => `<li>${esc(s)}</li>`).join("");
  const features = ABOUT_FEATURES.map(
    ([t, b]) => `<li><strong>${esc(t)}</strong> — ${esc(b)}</li>`
  ).join("");
  const faq = ABOUT_FAQ.map(
    ([q, a]) => `<h3>${esc(q)}</h3>\n<p>${a}</p>`
  ).join("\n");
  return prShell({
    crumb: `<a href="/">ホーム</a> › サイトの説明`,
    main: `<h1>サイトの説明</h1>
<div class="pr-body pr-legal">
<p class="pr-lead">item-search は、複数のオンラインショップを横断して商品を一括検索できる「通販横断検索サービス」です。</p>
<p>ほしい商品を見つけるとき、Amazon・楽天・メルカリ……とサイトを1つずつ開いて価格を見比べるのは手間がかかります。item-search なら、検索窓にキーワードを入力するだけで対応する各ショップを同時に検索し、結果を1つの画面に並べて表示します。サイトをまたいだ価格比較がすばやく行え、ほしい商品を納得のいく価格で見つけられます。</p>
<p>本サービスは商品情報を集めて表示する<strong>情報提供サービス</strong>です。商品の購入・決済・配送・サポートは、リンク先の各ショップが行います。</p>
<h2>3つのステップで使えます</h2>
<ol>
<li>検索窓に商品名やキーワードを入力します（例: Nintendo Switch）。</li>
<li>「検索」を押すと、対応する各ショップの結果がまとめて表示されます。</li>
<li>「安い順 / 高い順」で並び替えて比較し、気になる商品をクリックすると販売ページへ移動します。</li>
</ol>
<h2>item-search の特長</h2>
<ul>${features}</ul>
<h2>対応しているショップ</h2>
<p>現在、以下のオンラインショップを横断検索の対象としています。</p>
<ul class="pr-chips">${shops}</ul>
<p>※ 対応ショップや取得できる情報は、各サイトの仕様変更などにより予告なく増減する場合があります。</p>
<h2>よくある質問</h2>
${faq}
</div>
<p class="pr-more"><a class="pr-cta" href="/">横断検索をはじめる</a></p>`,
  });
}

// blocks: { p: string } | { ul: string[] } | { ol: string[] }
function renderBlocks(blocks) {
  return blocks
    .map((b) => {
      if (b.p) return `<p>${b.p}</p>`;
      if (b.ul) return `<ul>${b.ul.map((li) => `<li>${li}</li>`).join("")}</ul>`;
      if (b.ol) return `<ol>${b.ol.map((li) => `<li>${li}</li>`).join("")}</ol>`;
      return "";
    })
    .join("\n");
}

const TERMS_LEAD =
  "この利用規約（以下「本規約」といいます）は、item-search（以下「当サイト」といいます）が提供する商品横断検索サービス（以下「本サービス」といいます）の利用条件を定めるものです。本サービスをご利用になる方（以下「利用者」といいます）は、本規約に同意のうえご利用ください。";

const TERMS_SECTIONS = [
  {
    h2: "第1条（適用）",
    blocks: [
      {
        p: "本規約は、利用者と当サイトとの間の本サービスの利用に関わる一切の関係に適用されます。利用者は、本サービスを利用した時点で本規約に同意したものとみなされます。",
      },
    ],
  },
  {
    h2: "第2条（本サービスの内容）",
    blocks: [
      {
        ul: [
          "本サービスは、複数のオンラインショップ（以下「対象サイト」といいます）に掲載された商品情報を横断的に検索・収集し、利用者に一覧として表示する<strong>情報提供サービス</strong>です。",
          "当サイトは商品の販売者ではありません。商品の売買契約は、利用者と各対象サイトまたはその出品者・販売者との間で成立します。代金の決済、配送、返品、保証、その他取引に関する一切の事項は、各対象サイトの規約・条件に従うものとします。",
          "対象サイトの種類・数、および取得・表示できる情報の範囲は、各サイトの仕様変更等により予告なく変更されることがあります。",
        ],
      },
    ],
  },
  {
    h2: "第3条（商品情報および価格について）",
    blocks: [
      {
        ul: [
          "当サイトが表示する商品名・価格・在庫・画像等の情報は、各対象サイトから取得した時点のものであり、リアルタイムかつ正確であることを保証するものではありません。",
          "実際の販売価格・在庫状況・送料・ポイント・キャンペーン等は、各対象サイトの販売ページと異なる場合があります。利用者は、購入等の判断を行う前に、必ずリンク先の販売ページで最新かつ正確な情報を確認するものとします。",
          "情報の取得・表示の遅延、欠落、誤りによって利用者に生じた損害について、当サイトは責任を負いません。",
        ],
      },
    ],
  },
  {
    h2: "第4条（アフィリエイトプログラムについて）",
    blocks: [
      {
        p: "当サイトは、Amazonアソシエイト・プログラム、楽天アフィリエイト、バリューコマースをはじめとする各種アフィリエイトプログラムを利用しています。当サイトに掲載されるリンクの一部にはアフィリエイトリンクが含まれ、利用者がそのリンクを経由して商品を購入等した場合、当サイトが対象サイトから紹介料等の対価を受け取ることがあります。これにより利用者に追加の費用が発生することはありません。",
      },
    ],
  },
  {
    h2: "第5条（コメントの投稿）",
    blocks: [
      {
        ul: [
          "本サービスでは、検索キーワードに対して利用者がコメントを投稿できます。投稿された名前・リンク・本文は、本サービス上に公開されます。公開されて差し支えのない内容のみをご投稿ください。",
          "コメントの内容についての責任は投稿者が負うものとし、当サイトはその正確性・有用性について保証しません。コメントは投稿者個人の意見であり、当サイトの見解ではありません。",
          "当サイトは、次条の禁止事項に該当するコメント、または不適切と判断したコメントを、事前の通知なく非表示または削除することができます。",
          "投稿者は、投稿したコメントを当サイトが本サービスの提供・紹介のために利用（表示・複製・改変を含む）することを許諾するものとします。",
        ],
      },
    ],
  },
  {
    h2: "第6条（禁止事項）",
    blocks: [
      { p: "利用者は、本サービスの利用にあたり、次の行為をしてはならないものとします。" },
      {
        ul: [
          "法令または公序良俗に違反する行為",
          "コメント欄への、宣伝・広告・勧誘を目的とした投稿、同一または類似の内容の反復投稿、第三者への誹謗中傷・差別的表現・わいせつな内容の投稿、他人になりすます行為",
          "当サイトまたは第三者の知的財産権、プライバシー、その他の権利・利益を侵害する行為",
          "当サイトのサーバーやネットワークに過度の負荷をかける行為、または本サービスの運営を妨害する行為",
          "自動化された手段（スクレイピング、ボット、クローラー等）により本サービスへ過度・不正にアクセスする行為",
          "本サービスで得た情報を、当サイトの許可なく商業目的で複製・転載・再配布する行為",
          "その他、当サイトが不適切と判断する行為",
        ],
      },
    ],
  },
  {
    h2: "第7条（免責事項）",
    blocks: [
      {
        ul: [
          "当サイトは、本サービスの内容・情報の正確性、完全性、有用性、特定目的への適合性、および中断なく利用できることについて、いかなる保証も行いません。",
          "利用者と対象サイト（またはその出品者・販売者）との間で生じた取引・トラブル・損害について、当サイトは一切関与せず、責任を負いません。",
          "当サイトは、本サービスの利用または利用できなかったことに起因して利用者に生じた損害について、当サイトの故意または重過失による場合を除き、責任を負わないものとします。",
        ],
      },
    ],
  },
  {
    h2: "第8条（知的財産権・商標）",
    blocks: [
      {
        p: "本サービスに表示される商品名、ブランド名、ロゴ、商品画像等の権利は、各対象サイトまたは各権利者に帰属します。当サイトはこれらを商品の識別・案内の目的で表示しているにすぎず、各権利者との提携・推奨・その他の関係を示すものではありません。",
      },
    ],
  },
  {
    h2: "第9条（外部サイトへのリンク）",
    blocks: [
      {
        p: "本サービスには対象サイトをはじめとする外部サイトへのリンクが含まれます。これらの外部サイトは当サイトの管理下にはなく、その内容・サービス・プライバシーの取り扱いについて当サイトは責任を負いません。外部サイトの利用は、各サイトの規約に従い利用者自身の責任で行うものとします。",
      },
    ],
  },
  {
    h2: "第10条（サービスの変更・中断・終了）",
    blocks: [
      {
        p: "当サイトは、利用者への事前の通知なく、本サービスの内容の変更、提供の一時的な中断、または終了を行うことができます。これによって利用者または第三者に生じた損害について、当サイトは責任を負いません。",
      },
    ],
  },
  {
    h2: "第11条（プライバシー）",
    blocks: [
      {
        p: '本サービスは、サービス改善のためのアクセス解析（Googleアナリティクス等）を利用しています。また、検索履歴は利用者のブラウザ内（ローカルストレージ）にのみ保存され、当サイトのサーバーには保存されません。利用者はブラウザの設定によりこれらを削除・無効化することができます。検索キーワードの集計およびコメントの投稿に関する情報の取り扱いは、<a href="/privacy/">プライバシーポリシー</a>に定めるとおりです。',
      },
    ],
  },
  {
    h2: "第12条（本規約の変更）",
    blocks: [
      {
        p: "当サイトは、必要と判断した場合には、利用者への事前の通知なく本規約を変更することができます。変更後の本規約は、本サービス上に表示された時点から効力を生じるものとします。",
      },
    ],
  },
  {
    h2: "第13条（準拠法・管轄）",
    blocks: [
      {
        p: "本規約の解釈にあたっては日本法を準拠法とします。本サービスに関して紛争が生じた場合には、当サイト所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。",
      },
    ],
  },
];

function termsBody() {
  const sections = TERMS_SECTIONS.map(
    (s) => `<h2>${esc(s.h2)}</h2>\n${renderBlocks(s.blocks)}`
  ).join("\n");
  return prShell({
    crumb: `<a href="/">ホーム</a> › 利用規約`,
    main: `<h1>利用規約</h1>
<p class="pr-updated">最終更新日: 2026年7月27日</p>
<div class="pr-body pr-legal">
<p>${TERMS_LEAD}</p>
${sections}
<p><a href="/about/">サイトの説明</a>もあわせてご覧ください。</p>
<p class="pr-hint">制定日: 2026年7月26日</p>
</div>`,
  });
}

const PRIVACY_LEAD =
  "item-search（以下「当サイト」といいます）は、当サイトが提供する商品横断検索サービス（以下「本サービス」といいます）における利用者の情報の取り扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」といいます）を定めます。";

const PRIVACY_SECTIONS = [
  {
    h2: "1. 取得する情報",
    blocks: [
      {
        ul: [
          "<strong>アクセス情報</strong>：本サービスの利用状況を把握するため、アクセス解析ツール（Googleアナリティクス）を通じて、閲覧ページ、リファラー、ブラウザ・端末の種類、おおよその地域、Cookie 等の情報を自動的に取得します。これらは統計的に処理され、個人を特定するものではありません。",
          "<strong>検索キーワード</strong>：入力された検索キーワードは、検索結果の取得のために利用するほか、人気キーワードの集計（検索数ランキングの作成）のために、キーワードと日時のみを当サイトのサーバーに記録します。利用者を識別する情報とは結び付けていません。なお、利用者ご自身の検索履歴はブラウザ内（ローカルストレージ）にのみ保存され、サーバーには保存されません。",
          "<strong>コメント投稿</strong>：コメント欄に入力された名前・リンク・本文は、当サイトのサーバーに保存され、サイト上に公開されます。名前とリンクの入力は任意で、名前を入力しない場合は匿名として表示されます。あわせて、連続投稿・スパムの防止のみを目的として、投稿時の IP アドレスを復元できない形に変換した値（ハッシュ値）を保存します。IP アドレスそのものは保存しません。",
          "当サイトは、氏名・住所・電話番号・メールアドレス等、利用者個人を直接特定する情報の入力を求めることはありません。コメント欄に入力された情報は公開されるため、公開されて差し支えのない内容のみをご入力ください。",
        ],
      },
    ],
  },
  {
    h2: "2. 利用目的",
    blocks: [
      {
        ul: [
          "本サービスの提供・維持・改善のため",
          "利用状況の分析、および利用者の利便性向上のため",
          "不正アクセスや不正利用の防止のため",
        ],
      },
    ],
  },
  {
    h2: "3. アクセス解析ツールについて",
    blocks: [
      {
        p: '当サイトは、Google LLC が提供する「Googleアナリティクス（GA4）」を利用しています。Googleアナリティクスは Cookie を使用して利用者の情報を収集しますが、収集される情報は匿名で行われており、個人を特定するものではありません。Cookie の利用は、ブラウザの設定で無効にすることができます。詳細は<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Googleのプライバシーポリシー</a>および<a href="https://tools.google.com/dlpage/gaoptout?hl=ja" target="_blank" rel="noopener noreferrer">Googleアナリティクス オプトアウト アドオン</a>をご確認ください。',
      },
    ],
  },
  {
    h2: "4. Cookie とアフィリエイトプログラムについて",
    blocks: [
      {
        p: "当サイトは、Amazonアソシエイト・プログラム、楽天アフィリエイト、バリューコマースをはじめとする各種アフィリエイトプログラムを利用しています。これらのプログラムでは、リンク経由の購入等を計測するために Cookie が利用されることがあります。これにより利用者の閲覧・購入に関する情報が各プログラム提供事業者に送信される場合がありますが、氏名等の個人を特定する情報は含まれません。Cookie はブラウザの設定で無効にできます。",
      },
    ],
  },
  {
    h2: "5. 第三者提供",
    blocks: [
      {
        p: "当サイトは、法令に基づく場合を除き、取得した情報を利用者の同意なく第三者に提供することはありません。ただし、前記のアクセス解析ツールやアフィリエイトプログラムの提供事業者への情報送信は、各事業者の定めに従って行われます。",
      },
    ],
  },
  {
    h2: "6. 外部サイトへのリンク",
    blocks: [
      {
        p: "本サービスには各オンラインショップをはじめとする外部サイトへのリンクが含まれます。リンク先サイトにおける個人情報の取り扱いについて、当サイトは責任を負いません。各サイトのプライバシーポリシーをご確認ください。",
      },
    ],
  },
  {
    h2: "7. 本ポリシーの変更",
    blocks: [
      {
        p: "当サイトは、必要に応じて本ポリシーを変更することがあります。変更後の本ポリシーは、本サービス上に掲載した時点から効力を生じるものとします。",
      },
    ],
  },
  {
    h2: "8. 運営者情報・お問い合わせ",
    blocks: [
      {
        ul: [
          "運営者：item-search.jp 運営",
          "サイト名：item-search（item-search.jp）",
          'お問い合わせ先：<a href="mailto:itemsearch.jp@gmail.com">itemsearch.jp@gmail.com</a>',
        ],
      },
    ],
  },
];

function privacyBody() {
  const sections = PRIVACY_SECTIONS.map(
    (s) => `<h2>${esc(s.h2)}</h2>\n${renderBlocks(s.blocks)}`
  ).join("\n");
  return prShell({
    crumb: `<a href="/">ホーム</a> › プライバシーポリシー`,
    main: `<h1>プライバシーポリシー</h1>
<p class="pr-updated">最終更新日: 2026年7月27日</p>
<div class="pr-body pr-legal">
<p>${PRIVACY_LEAD}</p>
${sections}
<p><a href="/about/">サイトの説明</a>、<a href="/terms/">利用規約</a>もあわせてご確認ください。</p>
<p class="pr-hint">制定日: 2026年7月26日</p>
</div>`,
  });
}

// /about, /terms, /privacy の WebPage + パンくず構造化データ。
function staticPageJsonLd(p) {
  const url = ORIGIN + withSlash(p.path);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: p.h1,
    url,
    description: p.description,
    inLanguage: "ja",
    isPartOf: { "@type": "WebSite", name: "item-search.jp", url: `${ORIGIN}/` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ホーム", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: p.h1, item: url },
      ],
    },
  };
}

const STATIC_BODIES = {
  "/about": aboutBody,
  "/terms": termsBody,
  "/privacy": privacyBody,
};

// --- ユーティリティ -------------------------------------------------------

// 末尾スラッシュ付きに正規化する。
// Cloudflare Pages は dist/<path>/index.html を「/<path>/」で配信し、スラッシュ無しの
// アクセスは 308 でスラッシュ付きへ飛ばす。canonical・sitemap・サイト内リンクを
// すべてスラッシュ付きに揃え、canonical がリダイレクトする URL を指す状態を無くす。
function withSlash(path) {
  const [, p = path, rest = ""] = path.match(/^([^?#]*)([?#].*)?$/) ?? [];
  if (p === "" || p === "/") return "/" + rest;
  return (p.endsWith("/") ? p : p + "/") + rest;
}

const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// --- 静的本文の見た目 -----------------------------------------------------
// プリレンダした本文は JS 起動前の一瞬だけ利用者に見える。素の HTML のままだと
// Times New Roman ＋ 青い下線リンクの「怪しいページ」に見えてしまうので、
// アプリ本体（MUI テーマ）と同じ配色・字面になる CSS をここで焼き込む。
//
// 制約:
//   - 外部 CSS / Web フォント / 画像は使わない。追加リクエストを待つ間に
//     JS が起動して本文が差し替わるため、間に合わず無駄になる。
//   - セレクタはすべて .pr 配下に限定する。<style> は React 描画後も head に
//     残るので、スコープを切らないとアプリ本体の見た目に漏れる。
//   - body だけは例外的に触るが、値は MUI の CssBaseline が後から当てるものと
//     同じにしてあるので、差し替わった瞬間にちらつかない。
const PRERENDER_CSS = `
body{margin:0;background:#f7f8fa;color:#1f2937;font-family:"Inter","Hiragino Sans","Noto Sans JP",system-ui,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.pr{min-height:100vh;display:flex;flex-direction:column}
.pr *{box-sizing:border-box}
.pr a{color:#2563eb;text-decoration:none}
.pr a:hover{text-decoration:underline}
.pr-in{width:100%;max-width:900px;margin:0 auto;padding:0 20px}
.pr-hd{background:#fff;border-bottom:1px solid #e5e7eb}
.pr-hd .pr-in{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px}
.pr a.pr-logo{display:inline-flex;align-items:center;gap:8px;color:#1f2937;font-size:19px;font-weight:800;letter-spacing:-.02em;line-height:1}
.pr a.pr-logo:hover{text-decoration:none}
.pr-logo b{color:#2563eb;font-weight:800}
.pr-logo span{white-space:nowrap}
.pr-nav{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px 18px;font-size:14px}
.pr-nav a{color:#6b7280;white-space:nowrap}
.pr-main{flex:1;padding:36px 0 52px}
.pr-crumb{font-size:13px;color:#6b7280;margin:0 0 18px}
.pr-crumb a{color:#6b7280}
.pr h1{font-size:29px;line-height:1.35;font-weight:800;letter-spacing:-.01em;margin:0 0 14px}
.pr p{font-size:15px;line-height:1.9;color:#374151;margin:0 0 14px}
.pr .pr-lead{font-size:16px;color:#4b5563;max-width:44em}
.pr-form{display:flex;gap:10px;max-width:620px;margin:24px 0 10px}
.pr-field{flex:1;display:flex;align-items:center;gap:8px;min-width:0;height:46px;padding:0 14px;background:#fff;border:1px solid #dcdfe5;border-radius:10px;color:#9ca3af}
.pr-field input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;font:inherit;font-size:15px;color:#1f2937;appearance:none;-webkit-appearance:none}
.pr-field input::-webkit-search-decoration,.pr-field input::-webkit-search-cancel-button{-webkit-appearance:none}
.pr-btn{height:46px;padding:0 24px;border:0;border-radius:10px;background:#2563eb;color:#fff;font:inherit;font-size:15px;font-weight:600;cursor:pointer}
.pr a.pr-cta{display:inline-flex;align-items:center;height:46px;padding:0 24px;border-radius:10px;background:#2563eb;color:#fff;font-size:15px;font-weight:600}
.pr a.pr-cta:hover{text-decoration:none;background:#1d4ed8}
.pr-sec{margin:40px 0 0}
.pr-sec h2{font-size:19px;font-weight:700;letter-spacing:-.01em;margin:0 0 14px}
.pr-body{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;margin:20px 0 0}
.pr-body p:last-child{margin-bottom:0}
.pr .pr-updated{color:#6b7280;font-size:13px;margin:-6px 0 0}
.pr-legal h2{font-size:19px;font-weight:700;letter-spacing:-.01em;margin:32px 0 12px}
.pr-legal h2:first-of-type{margin-top:0}
.pr-legal h3{font-size:15px;font-weight:700;margin:20px 0 8px}
.pr-legal ul,.pr-legal ol{margin:0 0 14px;padding-left:22px}
.pr-legal li{font-size:15px;line-height:1.9;color:#374151;margin-bottom:6px}
.pr-legal .pr-chips{margin:0 0 14px}
.pr-chips,.pr-tags,.pr-grid{list-style:none;margin:0;padding:0}
.pr-chips,.pr-tags{display:flex;flex-wrap:wrap;gap:8px}
.pr-chips li{padding:7px 13px;background:#fff;border:1px solid #e5e7eb;border-radius:999px;font-size:13px;color:#374151}
.pr-tags a{display:inline-block;padding:7px 13px;background:#fff;border:1px solid #e5e7eb;border-radius:999px;font-size:13px;color:#374151}
.pr-tags a:hover{text-decoration:none;border-color:#93c5fd;color:#1d4ed8}
.pr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:10px}
.pr-grid a{display:block;height:100%;padding:13px 15px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;font-weight:600;color:#1f2937}
.pr-grid a:hover{text-decoration:none;border-color:#93c5fd;color:#1d4ed8}
.pr-rank{list-style:none;margin:0;padding:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
.pr-rank li{display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-top:1px solid #f1f3f5;font-size:14px}
.pr-rank li:first-child{border-top:0}
.pr-num{flex:0 0 27px;height:27px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:700}
.pr-rank li:first-child .pr-num{background:#fef3c7;color:#b45309}
.pr-rank li:nth-child(2) .pr-num{background:#f1f5f9;color:#64748b}
.pr-rank li:nth-child(3) .pr-num{background:#fdf0e6;color:#b06a2c}
.pr-row{flex:1;min-width:0}
.pr-row a{font-weight:600}
.pr .pr-sub{color:#9ca3af;font-size:13px;font-weight:400}
.pr .pr-note{display:block;margin:4px 0 0;color:#6b7280;font-size:13px;line-height:1.7}
.pr a.pr-tag{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#f3f4f6;color:#6b7280;font-size:11px;font-weight:400;white-space:nowrap;vertical-align:1px}
.pr a.pr-tag:hover{text-decoration:none;background:#e5e7eb}
.pr-meta{flex:0 0 auto;text-align:right;color:#9ca3af;font-size:12px;line-height:1.6;white-space:nowrap;padding-top:5px}
.pr-up{color:#059669}
.pr-down{color:#dc2626}
.pr-new{color:#2563eb;font-weight:700}
.pr .pr-more{margin:16px 0 0;font-size:14px}
.pr .pr-hint{margin:8px 0 0;font-size:13px;color:#6b7280}
.pr-ft{background:#fff;border-top:1px solid #e5e7eb;padding:26px 0;margin-top:auto}
.pr-fnav{display:flex;flex-wrap:wrap;gap:8px 24px;font-size:14px;margin-bottom:12px}
.pr-fnav a{color:#4b5563}
.pr-fcat{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;margin-bottom:16px}
.pr-fcat a{color:#6b7280}
.pr-ft p{font-size:12px;line-height:1.8;color:#6b7280;margin:0 0 8px}
.pr-ft p:last-child{color:#9ca3af;margin-bottom:0}
@media (max-width:640px){
.pr h1{font-size:23px}
.pr-main{padding:26px 0 40px}
.pr-in{padding:0 16px}
.pr-hd .pr-in{min-height:56px}
.pr a.pr-logo{font-size:17px}
.pr-nav{font-size:12px;gap:6px 12px}
.pr-grid{grid-template-columns:1fr}
.pr-form{flex-direction:column}
.pr-btn{width:100%}
}
`.trim();

// サイトロゴ（src/components/SiteLogo.tsx と同じ図柄）。外部画像に依存しない。
const LOGO_SVG = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false"><defs><linearGradient id="prLogoGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#prLogoGrad)"/><g fill="#fff"><circle cx="11.3" cy="11.3" r="1.5"/><circle cx="16.7" cy="11.3" r="1.5"/><circle cx="11.3" cy="16.7" r="1.5"/><circle cx="16.7" cy="16.7" r="1.5"/></g><g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="14" cy="14" r="7"/><line x1="19.2" y1="19.2" x2="24.6" y2="24.6"/></g></svg>`;

const SEARCH_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style="flex:0 0 auto"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15.8 15.8 21 21M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"/></svg>`;

function prHeader() {
  return `<header class="pr-hd"><div class="pr-in">
<a class="pr-logo" href="/">${LOGO_SVG}<span>item-<b>search</b></span></a>
<nav class="pr-nav" aria-label="メニュー"><a href="/ranking/">人気ランキング</a><a href="/about/">サイトの説明</a></nav>
</div></header>`;
}

// フッターは src/components/SiteFooter.tsx と同じ内容（リンク・アフィリエイト開示・商標）。
function prFooter() {
  const cats = categories
    .map((c) => `<a href="/c/${c.slug}/">${esc(c.name)}</a>`)
    .join("");
  return `<footer class="pr-ft"><div class="pr-in">
<nav class="pr-fnav" aria-label="サイト内リンク"><a href="/ranking/">人気検索ランキング</a><a href="/about/">サイトの説明</a><a href="/terms/">利用規約</a><a href="/privacy/">プライバシーポリシー</a></nav>
<nav class="pr-fcat" aria-label="カテゴリ">${cats}</nav>
<p>item-search は各オンラインショップの商品情報を横断的に検索・表示する情報提供サービスです。当サイトはAmazonアソシエイト・楽天アフィリエイト・バリューコマース等のアフィリエイトプログラムを利用しており、リンク経由の購入で収益を得ることがあります。商品の販売・取引は各ショップが行います。</p>
<p>© 2026 item-search.jp — Amazon・楽天市場・Yahoo!ショッピング・メルカリ・Yahoo!オークション・ヨドバシ・ビックカメラ の商標は各社に帰属します。</p>
</div></footer>`;
}

// 静的本文の共通ガワ（ヘッダー＋パンくず＋本文＋フッター）。
function prShell({ crumb, main }) {
  return `<div class="pr">${prHeader()}
<main class="pr-main"><div class="pr-in">${
    crumb ? `\n<nav class="pr-crumb" aria-label="パンくず">${crumb}</nav>` : ""
  }
${main}
</div></main>
${prFooter()}</div>`;
}

// テンプレート中の1つのタグ（属性内 content）を差し替える。無ければ末尾追記はしない。
function replaceMeta(html, matcher, replacement) {
  return html.replace(matcher, replacement);
}

// index.html テンプレートの <head> を、指定の title / description / canonical /
// OGP に置換する。bodyHtml が渡されたら #root に静的本文を差し込む。
function render(template, { title, description, path, jsonLd, bodyHtml }) {
  const url = ORIGIN + withSlash(path);
  let html = template;

  html = replaceMeta(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = replaceMeta(
    html,
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${esc(description)}" />`
  );
  html = replaceMeta(
    html,
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${esc(url)}" />`
  );
  html = replaceMeta(
    html,
    /<meta property="og:title"[^>]*>/,
    `<meta property="og:title" content="${esc(title)}" />`
  );
  html = replaceMeta(
    html,
    /<meta property="og:description"[^>]*>/,
    `<meta property="og:description" content="${esc(description)}" />`
  );
  html = replaceMeta(
    html,
    /<meta property="og:url"[^>]*>/,
    `<meta property="og:url" content="${esc(url)}" />`
  );
  html = replaceMeta(
    html,
    /<meta name="twitter:title"[^>]*>/,
    `<meta name="twitter:title" content="${esc(title)}" />`
  );
  html = replaceMeta(
    html,
    /<meta name="twitter:description"[^>]*>/,
    `<meta name="twitter:description" content="${esc(description)}" />`
  );

  if (jsonLd) {
    // JSON.stringify は "<" をエスケープしないので、データに "</script>" が
    // 紛れ込むとタグが閉じてしまい、以降が HTML として解釈される。
    // ソースは src/landing/*.json（自分で管理するファイル）だが、将来ここに
    // 検索語などの外部由来データを流し込んでも壊れないように潰しておく。
    const json = JSON.stringify(jsonLd).replaceAll("<", "\\u003c");
    const tag = `<script type="application/ld+json">${json}</script>`;
    html = html.replace("</head>", `${tag}</head>`);
  }

  if (bodyHtml) {
    // Vite ビルド後の #root は空。ここにクローラー向けの静的本文を差し込む。
    // JS 実行後は createRoot が中身を置き換えるため、利用者の見た目は変わらない。
    // 見た目用の CSS も一緒に焼き込む（JS 起動までの一瞬に間に合わせるためインライン）。
    html = html.replace(
      "</head>",
      `<style id="prerender-style">${PRERENDER_CSS}</style></head>`
    );
    html = html.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
  }

  return html;
}

// カテゴリ LP のクローラー向け静的本文（意味のある HTML とリンク）。
function landingBody(c) {
  const kw = c.keywords
    .map(
      (k) =>
        `<li><a href="/?q=${encodeURIComponent(k)}">${esc(
          k
        )}<span class="pr-sub">の価格を比較</span></a></li>`
    )
    .join("");
  const others = categories
    .filter((o) => o.slug !== c.slug)
    .map((o) => `<li><a href="/c/${o.slug}/">${esc(o.name)}の価格を比較</a></li>`)
    .join("");
  const kwPages = keywords
    .filter((k) => k.category === c.slug)
    .map((k) => `<li><a href="/s/${k.slug}/">${esc(k.term)}の最安値・価格比較</a></li>`)
    .join("");
  const paras = c.body.map((p) => `<p>${esc(p)}</p>`).join("\n");
  return prShell({
    crumb: `<a href="/">ホーム</a> › ${esc(c.name)}`,
    main: `<h1>${esc(c.name)}の価格を横断比較</h1>
<p class="pr-lead">${esc(c.lead)}</p>
<p><a class="pr-cta" href="/">横断検索をはじめる</a></p>
<div class="pr-body">
${paras}
</div>
<section class="pr-sec"><h2>人気のキーワード</h2>
<ul class="pr-tags">${kw}</ul></section>
${
  kwPages
    ? `<section class="pr-sec"><h2>人気の商品から探す</h2>\n<ul class="pr-grid">${kwPages}</ul></section>`
    : ""
}
<section class="pr-sec"><h2>他のカテゴリから探す</h2>
<ul class="pr-grid">${others}</ul></section>
<p class="pr-more">item-search.jp の使い方は<a href="/about/">サイトの説明</a>をご覧ください。</p>`,
  });
}

// キーワード LP のクローラー向け静的本文。
function keywordBody(k) {
  const related = k.related
    .map(
      (r) =>
        `<li><a href="/?q=${encodeURIComponent(r)}">${esc(
          r
        )}<span class="pr-sub">の価格を比較</span></a></li>`
    )
    .join("");
  const cat = categories.find((c) => c.slug === k.category);
  const paras = k.body.map((p) => `<p>${esc(p)}</p>`).join("\n");
  return prShell({
    crumb: `<a href="/">ホーム</a>${
      cat ? ` › <a href="/c/${cat.slug}/">${esc(cat.name)}</a>` : ""
    } › ${esc(k.term)}`,
    main: `<h1>${esc(k.term)}の最安値・価格比較</h1>
<p class="pr-lead">${esc(k.lead)}</p>
<p><a class="pr-cta" href="/?q=${encodeURIComponent(k.term)}">「${esc(
      k.term
    )}」を横断検索する</a></p>
<div class="pr-body">
${paras}
</div>
<section class="pr-sec"><h2>関連キーワード</h2>
<ul class="pr-tags">${related}</ul></section>
${
  cat
    ? `<p class="pr-more">関連カテゴリ: <a href="/c/${cat.slug}/">${esc(
        cat.name
      )}の価格を比較</a></p>`
    : ""
}`,
  });
}

function keywordJsonLd(k) {
  const url = `${ORIGIN}/s/${k.slug}/`;
  const cat = categories.find((c) => c.slug === k.category);
  const crumbs = [
    { "@type": "ListItem", position: 1, name: "ホーム", item: `${ORIGIN}/` },
  ];
  if (cat)
    crumbs.push({
      "@type": "ListItem",
      position: 2,
      name: cat.name,
      item: `${ORIGIN}/c/${cat.slug}/`,
    });
  crumbs.push({
    "@type": "ListItem",
    position: crumbs.length + 1,
    name: k.term,
    item: url,
  });
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: k.title,
    url,
    description: k.description,
    inLanguage: "ja",
    isPartOf: { "@type": "WebSite", name: "item-search.jp", url: `${ORIGIN}/` },
    breadcrumb: { "@type": "BreadcrumbList", itemListElement: crumbs },
  };
}

function landingJsonLd(c) {
  const url = `${ORIGIN}/c/${c.slug}/`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: c.title,
    url,
    description: c.description,
    inLanguage: "ja",
    isPartOf: { "@type": "WebSite", name: "item-search.jp", url: `${ORIGIN}/` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ホーム", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: c.name, item: url },
      ],
    },
  };
}

// カテゴリ別ページを静的化する最小シード件数。これ未満はプリレンダ/sitemap から
// 除外し、ライブ集計がたまってから露出させる（薄いページの量産を避ける）。
const RANK_SEED_MIN = 2;

// ランキング項目のリンク先（キーワード LP があれば内部リンク優先）。
function rankingHref(item) {
  if (item.slug && keywords.some((k) => k.slug === item.slug))
    return `/s/${item.slug}/`;
  return `/?q=${encodeURIComponent(item.term)}`;
}

const TREND_MARK = { up: "▲", down: "▼", new: "NEW", same: "―" };
const TREND_CLASS = { up: "pr-up", down: "pr-down", new: "pr-new", same: "" };

// 静的シード（ranking.json）を指定カテゴリで絞り、順位を振り直す。"all" は全件。
function seedItemsFor(category) {
  if (category === "all") return ranking.items;
  return ranking.items
    .filter((i) => i.category === category)
    .map((i, idx) => ({ ...i, rank: idx + 1 }));
}

function rankingLabel(category) {
  const c = (ranking.categories || []).find((x) => x.slug === category);
  return c ? c.label : category;
}

// ランキングのクローラー向け静的本文（意味のある HTML とリンク）。
function rankingBody(category) {
  const label = rankingLabel(category);
  const rows = seedItemsFor(category)
    .map((item) => {
      const cat = categories.find((c) => c.slug === item.category);
      const mark = TREND_MARK[item.trend] || "";
      const count =
        typeof item.count === "number"
          ? `${item.count.toLocaleString("ja-JP")}回検索`
          : "";
      const cls = TREND_CLASS[item.trend];
      const meta = [count, mark && cls ? `<span class="${cls}">${mark}</span>` : mark]
        .filter(Boolean)
        .join("<br>");
      return `<li><span class="pr-num">${item.rank}</span>
<span class="pr-row"><a href="${rankingHref(item)}">${esc(item.term)}</a>${
        cat ? `<a class="pr-tag" href="/c/${cat.slug}/">${esc(cat.name)}</a>` : ""
      }${item.note ? `<span class="pr-note">${esc(item.note)}</span>` : ""}</span>${
        meta ? `<span class="pr-meta">${meta}</span>` : ""
      }</li>`;
    })
    .join("\n");
  const catLinks = (ranking.categories || [])
    .filter((c) => c.slug !== "all")
    .map(
      (c) =>
        `<li><a href="/ranking/${c.slug}/">${esc(c.label)}<span class="pr-sub">の検索数ランキング</span></a></li>`
    )
    .join("");
  const priceLinks = categories
    .map(
      (c) => `<li><a href="/c/${c.slug}/">${esc(c.name)}の価格を比較</a></li>`
    )
    .join("");
  const isAll = category === "all";
  const heading = isAll
    ? `人気検索キーワードランキング【${esc(RANKING_PERIOD)}】`
    : `${esc(label)}の検索数ランキング`;
  const intro = isAll
    ? esc(ranking.intro)
    : `item-search.jp で横断検索されている「${esc(
        label
      )}」の人気キーワードを、検索数の多い順にランキングしました。`;
  const crumb = isAll
    ? "人気検索キーワードランキング"
    : `<a href="/ranking/">人気検索キーワードランキング</a> › ${esc(label)}`;
  return prShell({
    crumb: `<a href="/">ホーム</a> › ${crumb}`,
    main: `<h1>${heading}</h1>
<p class="pr-lead">${intro}</p>
<ol class="pr-rank">
${rows}
</ol>
<p class="pr-more"><a class="pr-cta" href="/">キーワードを横断検索する</a></p>
<p class="pr-hint">${esc(ranking.source)}</p>
<section class="pr-sec"><h2>カテゴリ別ランキング</h2>
<ul class="pr-tags">${catLinks}</ul></section>
<section class="pr-sec"><h2>カテゴリ別に価格を比較する</h2>
<ul class="pr-grid">${priceLinks}</ul></section>
<p class="pr-more">item-search.jp の使い方は<a href="/about/">サイトの説明</a>をご覧ください。</p>`,
  });
}

// ランキングは ItemList 構造化データで表現する（リッチリザルト対象）。
function rankingJsonLd(category) {
  const isAll = category === "all";
  const label = rankingLabel(category);
  const path = isAll ? "/ranking" : `/ranking/${category}`;
  const items = seedItemsFor(category);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: isAll
      ? `人気検索キーワードランキング【${RANKING_PERIOD}】`
      : `${label}の検索数ランキング`,
    description: isAll ? ranking.intro : `${label}の人気検索キーワードランキング`,
    url: ORIGIN + withSlash(path),
    inLanguage: "ja",
    numberOfItems: items.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    isPartOf: { "@type": "WebSite", name: "item-search.jp", url: `${ORIGIN}/` },
    itemListElement: items.map((item) => ({
      "@type": "ListItem",
      position: item.rank,
      name: item.term,
      url: ORIGIN + withSlash(rankingHref(item)),
    })),
  };
}

// トップ（/）のクローラー向け静的本文。
// 検索 UI は JS でしか描けないので、代わりに「何のサイトか」と主要ページへの
// 内部リンク（ハブ）を静的 HTML で置く。JS 起動後は createRoot が置き換える。
function homeBody() {
  const shops = SHOPS.map((s) => `<li>${esc(s)}</li>`).join("");
  const ranks = ranking.items
    .slice(0, HOME_RANKING_MAX)
    .map(
      (item) =>
        `<li><span class="pr-num">${item.rank}</span><span class="pr-row"><a href="${rankingHref(
          item
        )}">${esc(item.term)}</a><span class="pr-sub">の最安値を比較</span></span></li>`
    )
    .join("\n");
  const cats = categories
    .map((c) => `<li><a href="/c/${c.slug}/">${esc(c.name)}の価格を比較</a></li>`)
    .join("");
  const kws = keywords
    .map((k) => `<li><a href="/s/${k.slug}/">${esc(k.term)}の最安値・価格比較</a></li>`)
    .join("");
  return prShell({
    main: `<h1>商品横断検索 — 複数の通販サイトをまとめて一括検索</h1>
<p class="pr-lead">item-search.jp は Amazon・楽天市場・Yahoo!ショッピング・メルカリ・ヤフオク・ヨドバシ・ビックカメラなど、複数のオンラインショップを横断して商品を一括検索できる無料のサービスです。ほしい商品の価格をサイトをまたいで比較し、最安値を見つけられます。</p>
<form class="pr-form" action="/" method="get" role="search">
<span class="pr-field">${SEARCH_SVG}<input type="search" name="q" placeholder="商品名を入力（例: Nintendo Switch）" aria-label="商品名で横断検索" /></span>
<button class="pr-btn" type="submit">検索</button>
</form>
<p class="pr-hint">キーワードを入力すると、対応する各ショップの検索結果を1画面にまとめて表示します。会員登録は不要です。</p>
<section class="pr-sec"><h2>対応しているオンラインショップ</h2>
<ul class="pr-chips">${shops}</ul></section>
<section class="pr-sec"><h2>いま人気の検索キーワード</h2>
<ol class="pr-rank">
${ranks}
</ol>
<p class="pr-more"><a href="/ranking/">人気検索キーワードランキング【${esc(
      RANKING_PERIOD
    )}】をすべて見る</a></p></section>
<section class="pr-sec"><h2>ジャンルから探す</h2>
<ul class="pr-grid">${cats}</ul></section>
<section class="pr-sec"><h2>人気の商品から探す</h2>
<ul class="pr-grid">${kws}</ul></section>
<p class="pr-more">使い方や対応ショップの詳細は<a href="/about/">サイトの説明</a>を、取り扱いについては<a href="/terms/">利用規約</a>・<a href="/privacy/">プライバシーポリシー</a>をご覧ください。</p>`,
  });
}

// --- 生成 -----------------------------------------------------------------
const template = await readFile(join(DIST, "index.html"), "utf8");
const written = [];

// カテゴリ LP
for (const c of categories) {
  const outDir = join(DIST, "c", c.slug);
  await mkdir(outDir, { recursive: true });
  const html = render(template, {
    title: c.title,
    description: c.description,
    path: `/c/${c.slug}`,
    jsonLd: landingJsonLd(c),
    bodyHtml: landingBody(c),
  });
  await writeFile(join(outDir, "index.html"), html, "utf8");
  written.push(`/c/${c.slug}`);
}

// キーワード LP
for (const k of keywords) {
  const outDir = join(DIST, "s", k.slug);
  await mkdir(outDir, { recursive: true });
  const html = render(template, {
    title: k.title,
    description: k.description,
    path: `/s/${k.slug}`,
    jsonLd: keywordJsonLd(k),
    bodyHtml: keywordBody(k),
  });
  await writeFile(join(outDir, "index.html"), html, "utf8");
  written.push(`/s/${k.slug}`);
}

// 人気検索キーワードランキング LP（/ranking = 総合, /ranking/<category> = カテゴリ別）
// カテゴリ別はシードが RANK_SEED_MIN 件以上あるものだけ静的化する。
const rankingPaths = []; // sitemap 用に生成したパスを控える
{
  // 総合
  const outDir = join(DIST, "ranking");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "index.html"),
    render(template, {
      title: `人気検索キーワードランキング【${RANKING_PERIOD}】 | item-search.jp`,
      description:
        "Amazon・楽天・Yahoo!ショッピング・メルカリ・ヤフオク・ヨドバシを横断検索できる item-search.jp で、いま最も検索されている商品キーワードのランキング。各キーワードから複数サイトの最安値比較に進めます。",
      path: "/ranking",
      jsonLd: rankingJsonLd("all"),
      bodyHtml: rankingBody("all"),
    }),
    "utf8"
  );
  written.push("/ranking");
  rankingPaths.push("/ranking");

  // カテゴリ別
  for (const c of ranking.categories || []) {
    if (c.slug === "all") continue;
    if (seedItemsFor(c.slug).length < RANK_SEED_MIN) continue;
    const dir = join(DIST, "ranking", c.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "index.html"),
      render(template, {
        title: `${c.label}の検索数ランキング | item-search.jp 商品横断検索`,
        description: `item-search.jp で検索されている「${c.label}」の人気商品キーワードを検索数順にランキング。各キーワードから複数の通販サイトを横断して最安値を比較できます。`,
        path: `/ranking/${c.slug}`,
        jsonLd: rankingJsonLd(c.slug),
        bodyHtml: rankingBody(c.slug),
      }),
      "utf8"
    );
    written.push(`/ranking/${c.slug}`);
    rankingPaths.push(`/ranking/${c.slug}`);
  }
}

// /about, /terms, /privacy（head ＋ クローラー向け静的本文）
for (const p of STATIC_PAGES) {
  const outDir = join(DIST, p.path.slice(1));
  await mkdir(outDir, { recursive: true });
  const html = render(template, {
    title: p.title,
    description: p.description,
    path: p.path,
    jsonLd: staticPageJsonLd(p),
    bodyHtml: STATIC_BODIES[p.path](),
  });
  await writeFile(join(outDir, "index.html"), html, "utf8");
  written.push(p.path);
}

// トップ（/）。template は先頭で読み込み済みなので、上書きしても他ページに影響しない。
// SPA フォールバック（_redirects）で未知パスにも返るため、canonical は / 固定のまま。
await writeFile(
  join(DIST, "index.html"),
  render(template, {
    title: HOME.title,
    description: HOME.description,
    path: "/",
    bodyHtml: homeBody(),
  }),
  "utf8"
);
written.push("/");

// sitemap.xml を再生成
const urls = [
  {
    loc: `${ORIGIN}/`,
    // トップは3つの情報源すべてを埋め込んでいるので、最も新しい更新日を採る。
    lastmod: [HOME_UPDATED, updated, kwUpdated, ranking.updated].sort().at(-1),
    changefreq: "weekly",
    priority: "1.0",
  },
  ...rankingPaths.map((p) => ({
    loc: ORIGIN + withSlash(p),
    changefreq: p === "/ranking" ? "daily" : "weekly",
    priority: p === "/ranking" ? "0.9" : "0.8",
    lastmod: ranking.updated,
  })),
  ...categories.map((c) => ({
    loc: `${ORIGIN}/c/${c.slug}/`,
    changefreq: "weekly",
    priority: "0.8",
    lastmod: updated,
  })),
  ...keywords.map((k) => ({
    loc: `${ORIGIN}/s/${k.slug}/`,
    changefreq: "weekly",
    priority: "0.7",
    lastmod: kwUpdated,
  })),
  ...STATIC_PAGES.map((p) => ({
    loc: ORIGIN + withSlash(p.path),
    lastmod: p.updated,
    changefreq: p.changefreq,
    priority: p.priority,
  })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${u.loc}</loc>${
        u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""
      }\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
  )
  .join("\n")}
</urlset>
`;
await writeFile(join(DIST, "sitemap.xml"), sitemap, "utf8");

console.log(
  `prerender: home + ${categories.length} category LP + ${keywords.length} keyword LP + ${rankingPaths.length} ranking LP + ${STATIC_PAGES.length} static pages, sitemap with ${urls.length} URLs`
);
console.log("  " + written.join("  "));
