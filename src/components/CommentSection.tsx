import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ModeCommentOutlinedIcon from "@mui/icons-material/ModeCommentOutlined";
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

  const over = body.length > COMMENT_MAX_BODY;
  const panelId = `comments-${encodeURIComponent(term)}`;

  return (
    <Box sx={{ mt: 1 }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          size="small"
          variant={mode === "form" ? "contained" : "outlined"}
          startIcon={<ModeCommentOutlinedIcon fontSize="small" />}
          onClick={() => toggle("form")}
          aria-expanded={mode === "form"}
          aria-controls={panelId}
          sx={{ fontSize: 12, py: 0.25 }}
        >
          コメントする
        </Button>
        <Button
          size="small"
          variant={mode === "list" ? "contained" : "outlined"}
          color="inherit"
          startIcon={<ChatBubbleOutlineIcon fontSize="small" />}
          onClick={() => toggle("list")}
          aria-expanded={mode === "list"}
          aria-controls={panelId}
          sx={{ fontSize: 12, py: 0.25, color: "text.secondary" }}
        >
          コメントを見る{localCount ? `（${localCount}）` : ""}
        </Button>
      </Box>

      <Collapse in={mode !== ""} unmountOnExit>
        <Box
          id={panelId}
          sx={{
            mt: 1.5,
            p: { xs: 1.5, sm: 2 },
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
          }}
        >
          {mode === "form" && (
            <Box component="form" onSubmit={submit} noValidate>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                「{term}」へのコメント。名前とリンクは任意です（名前が空なら匿名で表示されます）。
              </Typography>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                <TextField
                  label="名前（任意）"
                  size="small"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="匿名"
                  slotProps={{ htmlInput: { maxLength: COMMENT_MAX_NAME } }}
                  sx={{ flex: "1 1 160px" }}
                />
                <TextField
                  label="リンク（任意）"
                  size="small"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="@ユーザー名 / https://... / メール"
                  helperText="入力すると名前がリンクになります"
                  sx={{ flex: "1 1 220px" }}
                />
              </Box>

              <TextField
                label="コメント"
                multiline
                minRows={3}
                fullWidth
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                error={over}
                helperText={`${body.length} / ${COMMENT_MAX_BODY} 文字${
                  over ? "（超過しています）" : ""
                }・本文にURLは書けません`}
                slotProps={{ htmlInput: { maxLength: COMMENT_MAX_BODY + 100 } }}
              />

              {postError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {postError}
                </Alert>
              )}

              <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                <Button type="submit" variant="contained" size="small" disabled={posting || over}>
                  {posting ? "送信中…" : "投稿する"}
                </Button>
                <Button size="small" color="inherit" onClick={() => setMode("")}>
                  閉じる
                </Button>
              </Box>
            </Box>
          )}

          {mode === "list" && (
            <Box>
              {posted && (
                <Alert severity="success" sx={{ mb: 1.5 }}>
                  コメントを投稿しました。
                </Alert>
              )}
              {loading && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    読み込み中…
                  </Typography>
                </Box>
              )}
              {loadError && <Alert severity="warning">{loadError}</Alert>}
              {!loading && !loadError && items?.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  まだコメントはありません。最初のコメントを書いてみませんか？
                </Typography>
              )}

              {items?.map((c) => (
                <CommentRow key={c.id} comment={c} />
              ))}

              <Box sx={{ mt: 1.5 }}>
                <Button size="small" variant="outlined" onClick={() => setMode("form")}>
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

function CommentRow({ comment }: { comment: Comment }) {
  const displayName = comment.name || "匿名";
  const isMail = comment.link.startsWith("mailto:");

  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.25,
        py: 1.25,
        borderTop: "1px solid",
        borderColor: "divider",
        "&:first-of-type": { borderTop: "none", pt: 0 },
      }}
    >
      <Box sx={{ fontSize: "1.35rem", lineHeight: 1.2 }} aria-hidden>
        {avatarOf(comment.id)}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
          {comment.link ? (
            <Typography
              component="a"
              href={comment.link}
              // 投稿者が自由に入れたリンク。SEO 上の評価を渡さず、開き先からも
              // 元ページを操作できないようにする（UGC の定石）。
              rel="nofollow ugc noopener noreferrer"
              target={isMail ? undefined : "_blank"}
              variant="body2"
              sx={{ fontWeight: 700, color: "primary.main", textDecoration: "none" }}
            >
              {displayName}
              <Box component="span" sx={{ ml: 0.5, fontSize: 11 }} aria-hidden>
                🔗
              </Box>
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {displayName}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {timeAgo(comment.createdAt)}
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.8, mt: 0.25 }}
        >
          {comment.body}
        </Typography>
      </Box>
    </Box>
  );
}
