import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import GlobalSearch from "./components/global-search";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "KickPlanner",
  description: "Gestor de tareas y proyectos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="h-full" suppressHydrationWarning>
        <div className="app-shell">
          <Suspense fallback={null}>
            <GlobalSearch />
          </Suspense>
          <div className="app-main">{children}</div>
        </div>
      </body>
    </html>
  );
}
