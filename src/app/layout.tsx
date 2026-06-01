import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/layout/ServiceWorker";

export const metadata: Metadata = {
  title: "Homunculus",
  description: "A personal achievement engine that surfaces the right action at the right moment.",
  manifest: "/manifest.webmanifest",
  applicationName: "Homunculus",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Homunculus",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5EDD8" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1209" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Crimson+Pro:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500;1,600&family=IM+Fell+English+SC&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
