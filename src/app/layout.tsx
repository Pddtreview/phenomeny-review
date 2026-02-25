import type { Metadata } from "next";
import "@/styles/globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "Phenomeny Review™",
  description: "AI-powered editorial platform — Tech Review & Intelligence",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="mainContent">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
