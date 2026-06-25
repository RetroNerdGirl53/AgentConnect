import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "@xterm/xterm/css/xterm.css";
import "@particle-academy/react-fancy/styles.css";
import "@particle-academy/agent-integrations/styles.css";
import "./globals.css";
import { DEFAULT_THEME_ID, LIGHT_THEME_IDS, THEME_STORAGE_KEY } from "@/lib/theme/themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Powers the glowing terminal themes (Terminal Green / Amber).
const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WhisperChat — cross-agent MCP bridge",
  description: "Two Claude Code sessions communicating through a shared Fancy UI MCP session.",
};

/**
 * Blocking script that applies the saved theme to <html> before first paint —
 * sets `data-theme` and toggles react-fancy's `.dark` class so there's no flash
 * of the default theme on reload. Kept in sync with `LIGHT_THEME_IDS`.
 */
const themeInitScript = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)},d=${JSON.stringify(DEFAULT_THEME_ID)},l=${JSON.stringify(
  LIGHT_THEME_IDS,
)};var t=localStorage.getItem(k)||d;var e=document.documentElement;e.setAttribute("data-theme",t);e.classList.toggle("dark",l.indexOf(t)===-1);}catch(_){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // themeInitScript (below) rewrites data-theme + the `dark` class on <html>
    // from localStorage before hydration, so the server default
    // (data-theme="midnight" + dark) intentionally differs from the client.
    // suppressHydrationWarning silences the warning for THIS element's own
    // attributes only — it does not cascade to children.
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={DEFAULT_THEME_ID}
      className={`dark ${geistSans.variable} ${geistMono.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
