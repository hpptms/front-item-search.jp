import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import Drawer from "@mui/material/Drawer";
import SearchIcon from "@mui/icons-material/Search";
import HistoryIcon from "@mui/icons-material/History";
import CloseIcon from "@mui/icons-material/Close";
import SiteLogo from "./SiteLogo";

type NavItem = {
  label: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { label: "検索", icon: <SearchIcon fontSize="small" /> },
  { label: "履歴", icon: <HistoryIcon fontSize="small" /> },
];

// PC はサイドバー幅を割合で、スマホ / タブレットのドロワーは固定幅で表示する。
const SIDEBAR_WIDTH = 280;

// サイドバーの中身。PC は常設、スマホ / タブレットはドロワーで共用する。
function SidebarContent({
  history,
  onSelect,
  onRemove,
}: {
  history: string[];
  onSelect: (term: string) => void;
  onRemove: (term: string) => void;
}) {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Brand */}
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <SiteLogo size={30} />
      </Box>

      {/* Navigation + 履歴のすぐ下に検索履歴一覧を表示 */}
      <List sx={{ px: 1 }}>
        {NAV_ITEMS.map((item, i) => (
          <ListItemButton
            key={item.label}
            selected={i === 0}
            sx={{ borderRadius: 2, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{ fontSize: 14 }}
            />
          </ListItemButton>
        ))}
      </List>

      {/* 検索履歴（ブラウザ保存・最大20件）。「履歴」のすぐ下に一覧表示する。 */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0, // 子のスクロールを効かせる
        }}
      >
        {history.length === 0 ? (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ px: 2.5, py: 1 }}
          >
            まだ履歴はありません
          </Typography>
        ) : (
          <List dense disablePadding sx={{ px: 1, pb: 1, overflowY: "auto" }}>
            {history.map((term) => (
              <ListItemButton
                key={term}
                onClick={() => onSelect(term)}
                // 「履歴」ナビの子項目に見えるよう左に一段インデントする。
                sx={{ borderRadius: 2, py: 0.4, pr: 0.5, pl: 4 }}
              >
                <ListItemText
                  primary={term}
                  primaryTypographyProps={{
                    fontSize: 13,
                    noWrap: true,
                    color: "text.secondary",
                  }}
                />
                <IconButton
                  size="small"
                  edge="end"
                  aria-label={`${term} を履歴から削除`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(term);
                  }}
                >
                  <CloseIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}

export default function Sidebar({
  history,
  onSelect,
  onRemove,
  mobileOpen,
  onMobileClose,
}: {
  history: string[];
  onSelect: (term: string) => void;
  onRemove: (term: string) => void;
  // スマホ / タブレット用ドロワーの開閉状態。
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const content = (
    <SidebarContent history={history} onSelect={onSelect} onRemove={onRemove} />
  );

  return (
    <Box component="nav">
      {/* PC（md 以上・マウス操作の端末）: 常設サイドバー。
          iPad 等のタッチ端末は画面幅が広くても常設にせず、下のドロワー扱いにする。 */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          "@media (pointer: coarse)": { display: "none" },
          width: "20%",
          minWidth: 180,
          maxWidth: 320,
          height: "100vh",
          bgcolor: "background.paper",
          borderRight: "1px solid",
          borderColor: "divider",
          flexDirection: "column",
        }}
      >
        {content}
      </Box>

      {/* スマホ / タブレット（md 未満、またはタッチ端末）: アイコンで開閉するドロワー。
          デフォルトは閉じた状態（open は App 側の state で制御）。 */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }} // モバイルでの開閉パフォーマンス向上
        sx={{
          display: { xs: "block", md: "none" },
          "@media (pointer: coarse)": { display: "block" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: SIDEBAR_WIDTH,
            maxWidth: "85vw",
            bgcolor: "background.paper",
          },
        }}
        // 履歴などを選んだら自動で閉じる。
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest(".MuiListItemButton-root")) onMobileClose();
        }}
      >
        {content}
      </Drawer>
    </Box>
  );
}
