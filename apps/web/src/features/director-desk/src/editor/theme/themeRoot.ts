let directorDeskThemeRoot: HTMLElement | null = null;

export function setDirectorDeskThemeRoot(root: HTMLElement | null) {
  directorDeskThemeRoot = root;
}

export function getDirectorDeskThemeRoot() {
  return directorDeskThemeRoot ?? document.documentElement;
}

export function applyDirectorDeskTheme(theme: "dark" | "light") {
  const root = getDirectorDeskThemeRoot();
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
}
