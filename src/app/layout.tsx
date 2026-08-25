import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PWARegister } from "@/components/pwa-register";
import { AtmosphericCanvas } from "@/components/fx/atmospheric-canvas";
import { GestureGuard } from "@/components/gesture-guard";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Contractor",
    template: "%s | Contractor",
  },
  description:
    "Enterprise Operating Platform exclusively for Construction Contractors, Joint Ventures & Builders.",
  manifest: "/manifest.json",
  applicationName: "Contractor",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Contractor",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#00ff66",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className={`${geist.variable} ${jetbrains.variable} font-sans antialiased bg-background text-foreground`}>
        <Providers>
          <GestureGuard />
          <PWARegister />
          <AtmosphericCanvas />
          {children}
        </Providers>
      </body>
    </html>
  );
}
