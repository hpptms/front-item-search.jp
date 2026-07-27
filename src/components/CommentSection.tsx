import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import ChatBubbleRoundedIcon from "@mui/icons-material/ChatBubbleRounded";
import ModeCommentRoundedIcon from "@mui/icons-material/ModeCommentRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import {
  COMMENT_MAX_BODY,
  COMMENT_MAX_NAME,
  Comment,
  fetchComments,
  postComment,
} from "../api";

// 検索ワード 1 件に対するコメント欄。
// ランキングの各行の下に「コメントする」「コメントを見る」の 2 ボタンで畳んで置き、
// 押されたときだけ本体（投稿フォーム / 一覧）を開く。
// 一覧はその場で取得するので、ページ全体の初期表示は重くならない。
//
// 投稿は誰でもできる（ログイン無し）。名前は任意で、空なら匿名として絵文字アバターで表示する。
// 入力の検証とスパム判定はバックエンド（internal/api/spam.go）が正とし、
// ここでは文字数など「打ちながら分かるべきもの」だけを先出しで見る。
//
// 見た目は「気軽に書き込める掲示板」に寄せて、丸み・淡い青・吹き出し・絵文字アバターで
// 柔らかくしている。ランキング本体（数字と順位が主役の硬い見た目）とのコントラストで、
// ここだけ会話の場であることが分かるようにする狙い。

// 匿名アバター。コメント ID から決めるので、同じコメントは常に同じ絵文字になる。
const AVATARS = [
  "🐱", "🐶", "🦊", "🐼", "🐧", "🐰", "🐻", "🦁", "🐯", "🐸",
  "🐵", "🦉", "🐢", "🐙", "🦄", "🐝", "🐳", "🦖", "🍀", "🌟",
  "🍎", "🍩", "🚀", "🎈", "🎧", "📚", "🧊", "🌈", "🍜", "⛄️",
];

function avatarOf(id: number): string {
  return AVATARS[Math.abs(id) % AVATARS.length];
}

// 投稿時刻の表示。直近は相対表記のほうが読みやすい。
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}時間前`;
  if (min < 60 * 24 * 7) return `${Math.floor(min / (60 * 24))}日前`;
  return new Date(t).toLocaleDateString("ja-JP");
}

// 名前・リンクは投稿のたびに打ち直させたくないので、ブラウザ内にだけ覚えておく。
const PROFILE_KEY = "comment-profile";

function loadProfile(): { name: string; link: string } {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { name: "", link: "" };
    const p = JSON.parse(raw) as { name?: string; link?: string };
    return { name: p.name ?? "", link: p.link ?? "" };
  } catch {
    return { name: "", link: "" };
  }
}

function saveProfile(name: string, link: string) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, link }));
  } catch {
    // プライベートモード等で保存できなくても投稿自体には影響しない。
  }
}

// --- 見た目の共通パーツ -----------------------------------------------------

// 丸ピル型のボタン（開閉トグル・送信で共通）。
const pillButton = {
  borderRadius: 999,
  px: 1.75,
  py: 0.4,
  fontSize: 12.5,
  fontWeight: 700,
  textTransform: "none" as const,
  boxShadow: "none",
};

// 入力欄。角を丸くし、白地＋淡い枠でノートに書き込むような見た目にする。
const roundField = (radius: number | string) => ({
  "& .MuiOutlinedInput-root": {
    borderRadius: radius,
    bgcolor: "#fff",
    "& fieldset": { borderColor: "#dbe6f6" },
    "&:hover fieldset": { borderColor: "#bcd3f2" },
  },
  "& .MuiInputLabel-root": { fontSize: 13.5 },
});

// 絵文字アバター（淡い丸の中に置く）。
function Avatar({ emoji, size = 34 }: { emoji: string; size?: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: "#eaf1ff",
        border: "1px solid #dbe6f6",
        display: "grid",
        placeItems: "center",
        fontSize: size * 0.55,
        lineHeight: 1,
      }}
    >
      {emoji}
    </Box>
  );
}

type Mode = "" | "form" | "list";

export default function CommentSection({
  term,
  count,
  onCountChange,
}: {
  term: string;
  /** 一覧から渡されるコメント件数（バッジ表示用）。未取得なら undefined。 */
  count?: number;
  /** 投稿・取得で件数が変わったときに親へ知らせる。 */
  onCountChange?: (n: number) => void;
}) {
  const [mode, setMode] = useState<Mode>("");
  const [items, setItems] = useState<Comment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // 件数は「親から渡された値」を初期値に、取得・投稿で自分でも更新する。
  const [localCount, setLocalCount] = useState<number | undefined>(count);
  useEffect(() => setLocalCount(count), [count]);

  const profile = useRef(loadProfile());
  const [name, setName] = useState(profile.current.name);
  const [link, setLink] = useState(profile.current.link);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [posted, setPosted] = useState(false);

  const updateCount = useCallback(
    (n: number) => {
      setLocalCount(n);
      onCountChange?.(n);
    },
    [onCountChange]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const res = await fetchComments(term);
    setLoading(false);
    if (!res) {
      setLoadError("コメントを取得できませんでした。時間をおいて再度お試しください。");
      return;
    }
    setItems(res.items);
    updateCount(res.count);
  }, [term, updateCount]);

  // 一覧を開いたときに未取得なら読み込む（開くまでは通信しない）。
  useEffect(() => {
    if (mode === "list" && items === null && !loading && !loadError) void load();
  }, [mode, items, loading, loadError, load]);

  const toggle = (next: Exclude<Mode, "">) => {
    setPosted(false);
    setMode((cur) => (cur === next ? "" : next));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (posting) return;
    if (body.trim() === "") {
      setPostError("コメントを入力してください");
      return;
    }
    setPosting(true);
    setPostError("");
    try {
      const saved = await postComment({ term, name, link, body });
      saveProfile(name.trim(), link.trim());
      profile.current = { name: name.trim(), link: link.trim() };
      setBody("");
      setPosted(true);
      // 投稿直後は必ず自分のコメントが見える状態にする（まず楽観的に先頭へ足す）。
      setItems((cur) => [saved, ...(cur ?? [])]);
      updateCount((localCount ?? 0) + 1);
      setMode("list");
      // 一覧をまだ読んでいない場合は自分の 1 件しか出ないので、裏で取り直して
      // 他の人のコメントと正しい件数に揃える。
      void load();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "投稿に失敗しました");
    } finally {
      setPosting(false);
    }
  };

  const remaining = COMMENT_MAX_BODY - body.length;
  const over = remaining < 0;
  const panelId = `comments-${encodeURIComponent(term)}`;

  // コメントが 1 件でもあるワードは「見る価値がある」ことが一目で分かるようにする。
  // 0 件（または未取得）のときは淡いグレーのままにして、差で気付けるようにする。
  const hasComments = typeof localCount === "number" && localCount > 0;
  const listOpen = mode === "list";

  return (
    <Box sx={{ mt: 1 }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Button
          size="small"
          variant={mode === "form" ? "contained" : "outlined"}
          startIcon={<ModeCommentRoundedIcon sx={{ fontSize: 15 }} />}
          onClick={() => toggle("form")}
          aria-expanded={mode === "form"}
          aria-controls={panelId}
          sx={{
            ...pillButton,
            ...(mode !== "form" && { bgcolor: "#fff", borderColor: "#cfe0f8" }),
          }}
        >
          コメントする
        </Button>
        <Button
          size="small"
          variant={listOpen ? "contained" : "outlined"}
          color={listOpen || hasComments ? "primary" : "inherit"}
          startIcon={
            hasComments ? (
              <ChatBubbleRoundedIcon sx={{ fontSize: 15 }} />
            ) : (
              <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 15 }} />
            )
          }
          onClick={() => toggle("list")}
          aria-expanded={listOpen}
          aria-controls={panelId}
          aria-label={
            hasComments ? `コメントを見る（${localCount}件）` : "コメントを見る（まだありません）"
          }
          sx={{
            ...pillButton,
            // 未展開のときの見た目を件数で変える：
            // あり → 淡い青の塗り＋青文字（押したくなる状態）／なし → 白地グレー（控えめ）。
            ...(!listOpen &&
              (hasComments
                ? {
                    bgcolor: "#eaf1ff",
                    color: "primary.main",
                    borderColor: "#bcd3f2",
                    boxShadow: "0 2px 8px rgba(37,99,235,.12)",
                    "&:hover": { bgcolor: "#dfeaff", borderColor: "#9cc0ee" },
                  }
                : {
                    bgcolor: "#fff",
                    color: "text.secondary",
                    borderColor: "#e3e8ef",
                  })),
          }}
        >
          コメントを見る
          {hasComments && (
            <Box
              component="span"
              aria-hidden
              sx={{
                ml: 0.75,
                px: 0.75,
                minWidth: 18,
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 800,
                bgcolor: listOpen ? "rgba(255,255,255,.25)" : "primary.main",
                color: "#fff",
              }}
            >
              {localCount}
            </Box>
          )}
        </Button>
      </Box>

      <Collapse in={mode !== ""} unmountOnExit>
        <Box
          id={panelId}
          sx={{
            mt: 1.5,
            p: { xs: 1.75, sm: 2.25 },
            borderRadius: 4,
            border: "1px solid #dce9fb",
            background: "linear-gradient(180deg, #f6faff 0%, #ffffff 65%)",
            boxShadow: "0 6px 20px rgba(37,99,235,0.06)",
          }}
        >
          {mode === "form" && (
            <Box component="form" onSubmit={submit} noValidate>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.75 }}>
                <Avatar emoji={name.trim() ? "😊" : "🐣"} />
                <Box sx={{ minWidth: 0 }}>
                  {/* PageLayout が "& p" に余白と行間を当てているので、body2 は div で出す
                      （既定の <p> のままだと段落マージンでレイアウトが崩れる）。 */}
                  <Typography component="div" variant="body2" sx={{ fontWeight: 700, lineHeight: 1.4 }}>
                    「{term}」にコメント
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {name.trim()
                      ? `${name.trim()} さんとして投稿します`
                      : "名前を書かなければ匿名（絵文字アイコン）で投稿されます"}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.25 }}>
                <TextField
                  label="名前（任意）"
                  size="small"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="匿名でOK"
                  slotProps={{ htmlInput: { maxLength: COMMENT_MAX_NAME } }}
                  sx={{ flex: "1 1 160px", ...roundField(999) }}
                />
                <TextField
                  label="リンク（任意）"
                  size="small"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="@ユーザー名 / URL / メール"
                  sx={{ flex: "1 1 220px", ...roundField(999) }}
                />
              </Box>

              <TextField
                multiline
                minRows={3}
                fullWidth
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                error={over}
                placeholder="どこが安かった？ 使ってみた感想は？ お得情報も大歓迎です ✨"
                slotProps={{ htmlInput: { maxLength: COMMENT_MAX_BODY + 100 } }}
                sx={roundField("18px")}
              />

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  mt: 0.75,
                  px: 0.5,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  🔗 本文にURLは書けません（リンク欄をどうぞ）
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    flexShrink: 0,
                    fontWeight: 700,
                    color: over ? "error.main" : remaining < 100 ? "warning.main" : "text.disabled",
                  }}
                >
                  あと {remaining}
                </Typography>
              </Box>

              {postError && (
                <Alert severity="error" sx={{ mt: 1.25, borderRadius: 3 }}>
                  {postError}
                </Alert>
              )}

              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}>
                <Button
                  type="submit"
                  variant="contained"
                  size="small"
                  disabled={posting || over}
                  endIcon={<SendRoundedIcon sx={{ fontSize: 15 }} />}
                  sx={{
                    ...pillButton,
                    px: 2.25,
                    boxShadow: "0 6px 14px rgba(37,99,235,.25)",
                  }}
                >
                  {posting ? "送信中…" : "投稿する"}
                </Button>
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => setMode("")}
                  sx={{ ...pillButton, color: "text.secondary" }}
                >
                  閉じる
                </Button>
              </Box>
            </Box>
          )}

          {mode === "list" && (
            <Box>
              {posted && (
                <Alert severity="success" sx={{ mb: 1.5, borderRadius: 3 }}>
                  コメントを投稿しました 🎉
                </Alert>
              )}
              {loading && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
                  <CircularProgress size={15} />
                  <Typography component="div" variant="body2" color="text.secondary">
                    読み込み中…
                  </Typography>
                </Box>
              )}
              {loadError && (
                <Alert severity="warning" sx={{ borderRadius: 3 }}>
                  {loadError}
                </Alert>
              )}
              {!loading && !loadError && items?.length === 0 && (
                <Box sx={{ textAlign: "center", py: 2 }}>
                  <Box sx={{ fontSize: 30, lineHeight: 1 }} aria-hidden>
                    🫧
                  </Box>
                  <Typography component="div" variant="body2" sx={{ fontWeight: 700, mt: 0.75 }}>
                    まだコメントはありません
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    いちばん乗りしませんか？
                  </Typography>
                </Box>
              )}

              {items?.map((c) => (
                <CommentRow key={c.id} comment={c} />
              ))}

              <Box sx={{ mt: 1.75, textAlign: "center" }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ModeCommentRoundedIcon sx={{ fontSize: 15 }} />}
                  onClick={() => setMode("form")}
                  sx={{ ...pillButton, bgcolor: "#fff", borderColor: "#cfe0f8" }}
                >
                  このワードにコメントする
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

// CommentRow は 1 件のコメント。アイコン＋吹き出しのチャット風に見せる。
function CommentRow({ comment }: { comment: Comment }) {
  const displayName = comment.name || "匿名";
  const isMail = comment.link.startsWith("mailto:");

  return (
    <Box sx={{ display: "flex", gap: 1.25, pt: 1.5, "&:first-of-type": { pt: 0.5 } }}>
      <Avatar emoji={avatarOf(comment.id)} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, flexWrap: "wrap", mb: 0.4 }}>
          {comment.link ? (
            <Typography
              component="a"
              href={comment.link}
              // 投稿者が自由に入れたリンク。SEO 上の評価を渡さず、開き先からも
              // 元ページを操作できないようにする（UGC の定石）。
              rel="nofollow ugc noopener noreferrer"
              target={isMail ? undefined : "_blank"}
              variant="caption"
              sx={{ fontWeight: 800, color: "primary.main", textDecoration: "none" }}
            >
              {displayName}
              <Box component="span" sx={{ ml: 0.4, fontSize: 10 }} aria-hidden>
                🔗
              </Box>
            </Typography>
          ) : (
            <Typography variant="caption" sx={{ fontWeight: 800 }}>
              {displayName}
            </Typography>
          )}
          <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 11 }}>
            {timeAgo(comment.createdAt)}
          </Typography>
        </Box>

        {/* 吹き出し。左上だけ角を落として、アイコンから伸びているように見せる。 */}
        <Box
          sx={{
            display: "inline-block",
            maxWidth: "100%",
            px: 1.5,
            py: 1,
            bgcolor: "#f4f8ff",
            border: "1px solid #e6eefb",
            borderRadius: "16px",
            borderTopLeftRadius: "4px",
          }}
        >
          <Typography
            component="div"
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.75 }}
          >
            {comment.body}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
