import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bob & Alice – Home Renovation Assistant",
  description: "Voice-based AI assistant for home renovation planning with agent transfer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
