"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Home() {
  // Staggered animation variants for the Hero section
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, type: "spring" as const, bounce: 0.4 }
    },
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* Background Effects */}
      <div className="absolute inset-0 -z-10">
        {/* Glow Orbs with floating animation */}
        <motion.div
          animate={{ y: [0, 20, 0], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-purple-500/20 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, -30, 0], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-cyan-500/20 blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute left-[30%] top-[40%] h-[300px] w-[300px] rounded-full bg-pink-500/10 blur-3xl"
        />

        {/* Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:70px_70px]" />

        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Sticky Navbar - Slides down on load */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-2xl"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <h1 className="bg-gradient-to-r from-white via-gray-300 to-gray-500 bg-clip-text text-3xl font-black tracking-[0.2em] text-transparent">
            MAKT
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium backdrop-blur-xl transition duration-300 hover:border-white/30 hover:bg-white hover:text-black"
            >
              Login
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <motion.section
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex max-w-7xl flex-col items-center px-6 pb-32 pt-44 text-center"
      >
        {/* Badge */}
        <motion.div variants={itemVariants} className="mb-8 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm tracking-wide text-gray-300 backdrop-blur-xl">
          Intelligent Business Infrastructure
        </motion.div>

        {/* Heading */}
        <motion.h2 variants={itemVariants} className="max-w-6xl bg-gradient-to-b from-white via-gray-200 to-gray-500 bg-clip-text text-6xl font-black leading-[0.95] tracking-tight text-transparent md:text-8xl">
          The Future Of
          <br />
          Business Operations
        </motion.h2>

        {/* Subtitle */}
        <motion.p variants={itemVariants} className="mt-10 max-w-3xl text-lg leading-8 text-gray-400 md:text-xl">
          MAKT empowers modern businesses with intelligent client management,
          communication systems, operational workflows, and scalable digital infrastructure.
        </motion.p>

        {/* CTA */}
        <motion.div variants={itemVariants} className="mt-14 flex flex-wrap items-center justify-center gap-5">
          <Link
            href="/login"
            className="rounded-2xl bg-white px-8 py-4 text-lg font-semibold text-black shadow-[0_0_40px_rgba(255,255,255,0.35)] transition duration-300 hover:scale-105"
          >
            Sign in to dashboard
          </Link>
          <Link
            href="/login"
            className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-lg backdrop-blur-xl transition duration-300 hover:border-white/30 hover:bg-white hover:text-black"
          >
            Admin login
          </Link>
        </motion.div>

        <motion.p variants={itemVariants} className="mt-8 text-sm text-gray-500">
          Access is by invitation only. Contact your administrator to get an account.
        </motion.p>
      </motion.section>

      {/* Features - Scroll reveal */}
      <section className="mx-auto grid max-w-7xl gap-8 px-6 pb-32 md:grid-cols-3">
        {[
          {
            title: "Client Intelligence",
            desc: "Track relationships, customer activity, sales movement, and operational growth from one unified control center.",
          },
          {
            title: "Smart Communication",
            desc: "Deliver real-time customer engagement through advanced messaging and connected communication systems.",
          },
          {
            title: "Growth Infrastructure",
            desc: "Scale workflows, analytics, operations, and digital performance with enterprise-grade architecture.",
          },
        ].map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: index * 0.2, type: "spring" }}
            className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-2xl transition duration-500 hover:-translate-y-3 hover:border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />
            <div className="relative text-sm font-semibold tracking-[0.2em] text-gray-500">
              0{index + 1}
            </div>
            <h3 className="relative mt-5 text-3xl font-black">
              {item.title}
            </h3>
            <p className="relative mt-5 leading-8 text-gray-400">
              {item.desc}
            </p>
          </motion.div>
        ))}
      </section>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
        className="relative mt-10 border-t border-white/10 bg-black/50 py-10 backdrop-blur-md"
      >
        {/* Subtle top glow line */}
        <div className="absolute left-1/2 top-0 h-[1px] w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row md:gap-4">

          {/* Logo */}
          <h4 className="bg-gradient-to-r from-white to-gray-500 bg-clip-text text-2xl font-black tracking-[0.2em] text-transparent">
            MAKT
          </h4>

          {/* Copyright & Credits */}
          <p className="text-center text-sm text-gray-500 md:text-right">
            &copy; 2026 MAKT. Built for the future by{" "}
            <span className="font-semibold tracking-wide text-gray-300 transition-colors duration-300 hover:text-white">
              vigneshwar
            </span>
            
          </p>

        </div>
      </motion.footer>
    </main>
  );
}