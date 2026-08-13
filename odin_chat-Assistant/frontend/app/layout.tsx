import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Odin Chat Assistant", description: "Local, cited book research" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
