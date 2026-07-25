import { createTheme } from "@mui/material/styles";

// Light, clean, airy theme. Soft neutral background with a calm blue accent.
const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#2563eb" },
    background: {
      default: "#f7f8fa",
      paper: "#ffffff",
    },
    text: {
      primary: "#1f2937",
      secondary: "#6b7280",
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      '"Inter", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif',
    h6: { fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        // Flat, light look — no heavy shadows.
        root: { backgroundImage: "none" },
      },
      defaultProps: { elevation: 0 },
    },
  },
});

export default theme;
