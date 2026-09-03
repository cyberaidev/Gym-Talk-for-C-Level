import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gym Talk for C-Level",
  description: "AI executive speaking coach powered by ElevenLabs and OpenAI"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
