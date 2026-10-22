import type { Metadata } from "next";
import ApiInfo from "@/components/ApiInfo";
import Navbar from "@/components/Navbar";
import SideNav from "@/components/SideNav";
import ScoutProvider from "@/components/ScoutProvider";
import ScrollToTop from "@/components/ScrollToTop";
import { UpdatedLine } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "FTC Scouting",
  description:
    "FTC Scouting Dashboard — championship rankings, scrimmage results, and per-team scouting for FIRST Tech Challenge teams.",
};

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
        <SideNav />
        <ScoutProvider>
          <Navbar />
          <ScrollToTop />
          <main>
            {children}
            <p className="foot">
              <UpdatedLine />
            </p>
          </main>
          <ApiInfo />
        </ScoutProvider>
      </body>
    </html>
  );
}
