import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import ScoutProvider from "@/components/ScoutProvider";
import ScrollToTop from "@/components/ScrollToTop";
import { UpdatedLine } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "FTC Scouting",
  description:
    "FTC Scouting Dashboard — championship rankings, scrimmage results, and per-team scouting for FIRST Tech Challenge teams.",
};

// Applies the stored (or system) theme before paint so there is no flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem("ftcTheme");if(!t){t=(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ScoutProvider>
          <Navbar />
          <ScrollToTop />
          <main>
            {children}
            <p className="foot">
              <UpdatedLine />
            </p>
          </main>
        </ScoutProvider>
      </body>
    </html>
  );
}
