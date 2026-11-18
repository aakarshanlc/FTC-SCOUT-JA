import type { Metadata } from "next";
import { Barlow_Condensed, Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { Header, HeaderShell } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const display = Barlow_Condensed({ variable: "--ff-display", subsets: ["latin"], weight: ["600", "700"] });
const body = Inter({ variable: "--ff-body", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--ff-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "FTC Scout", template: "%s · FTC Scout" },
  description: "Scouting for FIRST Tech Challenge teams in Jamaica: rankings, scrimmages, events and match video.",
};

// Runs before first paint: stored choice, else the system preference.
const themeScript = `try{var t=localStorage.getItem("theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <Suspense fallback={<HeaderShell path="" />}>
            <Header />
          </Suspense>
          <main className="shell">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
