import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Homunculus",
  description: "A personal AI achievement engine",
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
      </body>
    </html>
  );
}
