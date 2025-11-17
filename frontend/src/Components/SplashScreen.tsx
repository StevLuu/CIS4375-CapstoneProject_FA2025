import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function SplashScreen() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 2500); // a bit longer
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1 } }}
        >
          {/* Logo */}
          <motion.img
            src="/Logo.png"
            alt="Kumo Consulting Logo"
            className="h-40 w-auto mb-6" // bigger logo
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1.1, opacity: 1 }}
            transition={{ duration: 1 }}
          />

          {/* Company name */}
          <motion.h1
            className="text-5xl sm:text-6xl font-bold tracking-tight text-neutral-900"
            initial={{ y: 25, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.7 }}
          >
            Kumo Consulting
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="text-neutral-500 text-lg mt-4 tracking-wide"
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.7 }}
          >
            Group 17 · CIS 4375 Capstone Project
          </motion.p>

          {/* Subtle fade-out flourish */}
          <motion.div
            className="absolute bottom-20 text-neutral-400 text-sm tracking-widest"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
          >

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
