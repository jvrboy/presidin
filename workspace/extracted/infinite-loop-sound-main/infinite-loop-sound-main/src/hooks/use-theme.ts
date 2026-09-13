import { useEffect, useState } from "react";

export const THEMES = [
  { id: "midnight", label: "Midnight (default)", swatch: "#0b1020" },
  { id: "ocean", label: "Deep Ocean", swatch: "#0c2340" },
  { id: "amber", label: "Trader Amber", swatch: "#1f1408" },
  { id: "neon", label: "Neon Cyber", swatch: "#1a0833" },
  { id: "pro", label: "Pro Trader", swatch: "#0a0a0a" },
  { id: "matrix", label: "Matrix Green", swatch: "#001a00" },
  { id: "crimson", label: "Crimson Dark", swatch: "#1a0008" },
  { id: "arctic", label: "Arctic Blue", swatch: "#001428" },
  { id: "void", label: "Void Black", swatch: "#000000" },
  { id: "paper", label: "Paper (Light)", swatch: "#f5f3ee" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const KEY = "diq.theme";

export const applyTheme = (id: ThemeId) => {
  if (typeof document === "undefined") return;
  if (id === "midnight") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", id);
};

export const useTheme = () => {
  const [theme, setTheme] = useState<ThemeId>("midnight");
  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as ThemeId) || "midnight";
    setTheme(saved);
    applyTheme(saved);
  }, []);
  const update = (id: ThemeId) => {
    setTheme(id);
    localStorage.setItem(KEY, id);
    applyTheme(id);
  };
  return { theme, setTheme: update };
};
