# item-search.jp SEO 監査チェックリスト

最終更新: 2026-07-26 / 対象: frontend（Cloudflare Pages・CSR React SPA）+ backend（Go / cloudflared トンネル）

判定: ✅ 対応済み / 🟡 部分的・要改善 / ❌ 未対応 / ⏳ 運用（継続タスク）

---

## 1. 技術的 SEO（クロール・インデックス基盤）

| 項目 | 判定 | メモ |
|---|---|---|
| robots.txt | ✅ | `Allow: /` ＋ sitemap 参照あり |
| sitemap.xml | ✅ | 本対応で 3→11 URL（トップ + LP8 + about/terms）に自動生成化 |
| canonical | ✅ | 全ページで自ページ絶対 URL を出力（SPA 遷移時も補正） |
| HTTPS / 独自ドメイン | ✅ | item-search.jp |
| モバイル対応（viewport） | ✅ | `width=device-width` あり・MUI レスポンシブ |
| 404 の扱い | 🟡 | 未知パスは検索 UI にフォールバック（HTTP 200）。ソフト404。ページ数が増えたら実 404 を検討 |
| ページ表示速度 | 🟡 | JS バンドル 398KB(gzip 124KB)。MUI 由来。分割・アイコン個別 import で軽量化余地 |
| 構造化データ | ✅ | トップ=WebSite+SearchAction、LP=CollectionPage+BreadcrumbList |

## 2. レンダリング（クローラーに中身が届くか）★最重要

| 項目 | 判定 | メモ |
|---|---|---|
| トップ/静的ページの CSR 問題 | 🟡→✅ | LP・about・terms はビルド時プリレンダで静的 HTML 化。トップは noscript 説明あり |
| LP の静的スナップショット | ✅ | `scripts/prerender.mjs` が #root に本文＋内部リンクを焼き込み（JS 無効でも読める） |
| 検索結果ページの indexation | ✅ | `?q=` の生結果は `noindex,follow`＋canonical をトップに集約（JS でメタ切替） |

## 3. コンテンツ / 情報設計

| 項目 | 判定 | メモ |
|---|---|---|
| インデックス対象ページ数 | ✅ | 実質1枚 → カテゴリ LP 8枚 ＋ キーワード LP 10枚（計 sitemap 22 URL）。keywords.json 追記で自動増殖 |
| 各ページ固有の title/description | ✅ | 本対応でルート別・LP 別に付与 |
| 見出し階層（h1/h2） | ✅ | LP・about・terms で適切。トップは h1 が視覚要素寄り |
| 独自コンテンツ（薄いアフィリ回避） | ✅ | LP に横断比較の解説＋検索結果に**最安値ハイライト**（バナー＋バッジ）の独自価値を追加 |
| 内部リンク | ✅ | フッター＋トップ空状態＋LP 相互リンクで全 LP へ到達可能 |
| パンくず | 🟡 | LP は JSON-LD で実装。視覚的パンくずは静的本文のみ（React 版にも出すと尚可） |

## 4. E-E-A-T / 信頼性

| 項目 | 判定 | メモ |
|---|---|---|
| 運営者情報 | ✅ | /privacy に運営者・連絡先（itemsearch.jp@gmail.com）を明記 |
| アフィリエイト開示 | ✅ | フッター・about・terms・privacy に明記（Google 要件を満たす） |
| 免責・利用規約 | ✅ | terms 充実 |
| プライバシーポリシー | ✅ | /privacy 独立ページ化（GA4・アフィリ Cookie・オプトアウト・運営者情報） |

## 5. ソーシャル / 被リンク / 計測

| 項目 | 判定 | メモ |
|---|---|---|
| OGP / Twitter Card | ✅ | 全ページ。画像 ogp.png（408KB＝やや重い、圧縮余地） |
| Google Search Console | ✅ | 所有権確認済み。⏳ カバレッジ監視・LP のインデックス登録リクエスト |
| GA4 | ✅ | 導入済み・search イベント計測あり |
| 被リンク / サイテーション | ⏳ | 手順を SEO-NEXT-STEPS.md D 章に整理。実施はオーナー側（外部施策） |
| Bing Webmaster Tools | ⏳ | 手順を SEO-NEXT-STEPS.md A 章に整理＋index.html に検証スロット追加。登録はオーナー側 |
| IndexNow（即時通知） | ⏳ | Cloudflare の Crawler Hints を On にするだけ（SEO-NEXT-STEPS.md B 章） |

---

## 今回の対応で解消した項目
1. `<title>` が `item-search` → キーワード入りに修正
2. 全ページ同一だった title/description をルート別・LP 別に切り替え（`src/seo.ts`）
3. インデックス対象のカテゴリ LP を 8 枚新設（`src/landing/`, `src/pages/Landing.tsx`）
4. ビルド時プリレンダで LP / about / terms を静的 HTML 化（`scripts/prerender.mjs`）
5. sitemap.xml を全 URL 自動生成に変更
6. 全 LP への内部リンク（フッター・トップ・LP 相互）を設置
7. `?q=` 付き URL での自動検索に対応（SearchAction と整合）

## 第2弾で対応した項目（本コミット）
1. キーワード単位 LP（/s/<slug>）10枚を新設。`src/landing/keywords.json` 追記で自動増殖（GSC 実クエリを反映する運用）
2. 検索結果に**最安値ハイライト**（バナー＋カードバッジ）を追加＝横断検索ならではの独自価値
3. `?q=` 生結果を **noindex,follow**＋canonical トップ集約
4. **プライバシーポリシー独立ページ**（/privacy）＋運営者情報・連絡先
5. **Bing/IndexNow/被リンク**の実施手順書（SEO-NEXT-STEPS.md）＋index.html に Bing 検証スロット

## 残りの宿題（オーナー側の手動作業 / 継続）
- SEO-NEXT-STEPS.md の A〜E（Bing 登録・IndexNow 有効化・GSC 初動・被リンク獲得・効果測定）
- GSC の実クエリを見て keywords.json を継続拡張
- **パフォーマンス**：JS バンドル分割、MUI アイコンの個別 import、ogp.png 圧縮（LCP 改善）
- **トップの h1**：視覚要素寄りなので、テキスト h1 の明確化余地
