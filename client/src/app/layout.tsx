import type { Metadata } from "next";
import { Barlow_Condensed, Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { Header, HeaderShell } from "@/components/Header";
import { Providers } from "@/components/Providers";
import "./globals.css";

const display = Barlow_Condensed({ variable: "--ff-display", subsets: ["latin"], weight: ["600", "700"] });
const body = Inter({ variable: "--ff-body", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--ff-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "FTC Scout", template: "%s · FTC Scout" },
  description: "Scouting dashboard for FIRST Tech Challenge Jamaica — rankings, scrimmages, events.",
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
          <footer className="shell credits">
            Data from your scouting sheet,{" "}
            <a href="https://ftcscout.org" target="_blank" rel="noreferrer">
              FTCScout
            </a>{" "}
            and the{" "}
            <a href="https://ftc-events.firstinspires.org/services/API" target="_blank" rel="noreferrer">
              FIRST Tech Challenge Events API
            </a>
            .
          </footer>
        </Providers>
      </body>
    </html>
  );
}
