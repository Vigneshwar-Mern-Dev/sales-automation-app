import { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Details - MAKT",
  description: "Provide your details to get started with MAKT ATM Franchise.",
};

export default function FormLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black p-4 selection:bg-cyan-300/30">
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
