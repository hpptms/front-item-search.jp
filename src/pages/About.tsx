import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import SearchIcon from "@mui/icons-material/Search";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import StorefrontIcon from "@mui/icons-material/Storefront";
import HistoryIcon from "@mui/icons-material/History";
import PageLayout from "./PageLayout";
import { Link } from "../router";

// サービスの内容・使い方・対応ショップ・よくある質問を紹介するページ。
export default function About() {
  const features = [
    {
      icon: <SearchIcon color="primary" />,
      title: "一度の検索で横断",
      body: "キーワードを1回入力するだけで、複数の通販サイトをまとめて検索します。サイトを1つずつ開いて回る必要はありません。",
    },
    {
      icon: <CompareArrowsIcon color="primary" />,
      title: "価格を並べて比較",
      body: "検索結果はサイトごとに整理して表示。安い順・高い順に並び替えれば、同じ商品の価格差がひと目でわかります。",
    },
    {
      icon: <StorefrontIcon color="primary" />,
      title: "主要ショップに対応",
      body: "大手モールからフリマ・オークションまで幅広くカバー。新品も中古も横断して探せます。",
    },
    {
      icon: <HistoryIcon color="primary" />,
      title: "検索履歴はブラウザに保存",
      body: "過去の検索キーワードはお使いのブラウザ内にのみ保存され、サーバーには送信・保持されません。",
    },
  ];

  const sites = [
    "Amazon",
    "楽天市場",
    "Yahoo!ショッピング",
    "メルカリ",
    "Yahoo!オークション",
    "ヨドバシ.com",
    "ビックカメラ",
  ];

  return (
    <PageLayout title="サイトの説明">
      <Typography variant="h6" component="p" sx={{ fontWeight: 600, lineHeight: 1.8 }}>
        item-search は、複数のオンラインショップを横断して商品を一括検索できる
        「通販横断検索サービス」です。
      </Typography>
      <p>
        ほしい商品を見つけるとき、Amazon・楽天・メルカリ……とサイトを1つずつ開いて価格を見比べるのは手間がかかります。
        item-search なら、検索窓にキーワードを入力するだけで対応する各ショップを同時に検索し、結果を1つの画面に並べて表示します。
        サイトをまたいだ価格比較がすばやく行え、ほしい商品を納得のいく価格で見つけられます。
      </p>
      <p>
        本サービスは商品情報を集めて表示する<strong>情報提供サービス</strong>です。
        商品の購入・決済・配送・サポートは、リンク先の各ショップが行います。
      </p>

      <h2>3つのステップで使えます</h2>
      <Box component="ol" sx={{ pl: 3 }}>
        <li>検索窓に商品名やキーワードを入力します（例: Nintendo Switch）。</li>
        <li>「検索」を押すと、対応する各ショップの結果がまとめて表示されます。</li>
        <li>「安い順 / 高い順」で並び替えて比較し、気になる商品をクリックすると販売ページへ移動します。</li>
      </Box>

      <h2>item-search の特長</h2>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2,
          my: 2,
        }}
      >
        {features.map((f) => (
          <Paper
            key={f.title}
            variant="outlined"
            sx={{ p: 2.5, borderColor: "divider", borderRadius: 3 }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              {f.icon}
              <Typography sx={{ fontWeight: 700 }}>{f.title}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
              {f.body}
            </Typography>
          </Paper>
        ))}
      </Box>

      <h2>対応しているショップ</h2>
      <p>現在、以下のオンラインショップを横断検索の対象としています。</p>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, my: 2 }}>
        {sites.map((s) => (
          <Box
            key={s}
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: 2,
              bgcolor: "action.hover",
              fontSize: 14,
              color: "text.primary",
            }}
          >
            {s}
          </Box>
        ))}
      </Box>
      <p>
        ※ 対応ショップや取得できる情報は、各サイトの仕様変更などにより予告なく増減する場合があります。
      </p>

      <h2>よくある質問</h2>
      <h3>利用に料金はかかりますか？</h3>
      <p>いいえ。検索・比較機能はどなたでも無料でご利用いただけます。</p>

      <h3>会員登録は必要ですか？</h3>
      <p>不要です。登録なしですぐに検索を始められます。検索履歴もお使いのブラウザ内に保存されるだけです。</p>

      <h3>表示されている価格は正確ですか？</h3>
      <p>
        価格や在庫は各ショップから取得した時点の情報で、常に最新・正確であることを保証するものではありません。
        セールやポイント、送料、時間差などにより実際の販売価格と異なる場合があります。
        <strong>購入前に必ずリンク先の販売ページで最新の情報をご確認ください。</strong>
      </p>

      <h3>どうやって収益を得ているのですか？</h3>
      <p>
        当サイトは各ショップのアフィリエイトプログラム（Amazonアソシエイト、楽天アフィリエイト、バリューコマース等）を利用しています。
        リンク経由で商品が購入されると、当サイトが紹介料を受け取ることがあります。ご利用者に追加の負担は発生しません。
        詳しくは<Link to="/terms">利用規約</Link>をご覧ください。
      </p>

      <Box sx={{ mt: 5 }}>
        <Typography variant="body2" color="text.secondary">
          ご利用にあたっては<Link to="/terms">利用規約</Link>もあわせてご確認ください。
        </Typography>
      </Box>
    </PageLayout>
  );
}
