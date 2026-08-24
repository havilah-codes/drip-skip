import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import ThemeInit from "@/components/ThemeInit";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Drip or Skip",
  description: "Rate your freind's outfit's",
  icons: {
    icon: "/icons/favicon-96x96.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeInit />
      </head>
      <body className="min-h-full flex flex-col">{children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
