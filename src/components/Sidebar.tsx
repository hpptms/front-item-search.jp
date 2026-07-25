import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import SearchIcon from "@mui/icons-material/Search";
import DashboardIcon from "@mui/icons-material/DashboardOutlined";
import FavoriteIcon from "@mui/icons-material/FavoriteBorderOutlined";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";

type NavItem = {
  label: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { label: "検索", icon: <SearchIcon fontSize="small" /> },
  { label: "ダッシュボード", icon: <DashboardIcon fontSize="small" /> },
  { label: "お気に入り", icon: <FavoriteIcon fontSize="small" /> },
  { label: "設定", icon: <SettingsIcon fontSize="small" /> },
];

export default function Sidebar() {
  return (
    <Box
      component="nav"
      sx={{
        width: "20%",
        minWidth: 180,
        height: "100vh",
        bgcolor: "background.paper",
        borderRight: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Brand */}
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <Typography variant="h6" color="primary" noWrap>
          serch
        </Typography>
      </Box>

      {/* Navigation */}
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
    </Box>
  );
}
