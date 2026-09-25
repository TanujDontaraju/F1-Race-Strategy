"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

// Port of intro.html / intro.css, rendered directly in the page instead of
// through an iframe so there's no boundary to fight for full-viewport sizing
// and no flash-of-default-theme before it paints (the page background is
// black from first paint via app/globals.css).

const FLASH_CONFIG = [
  { top: "15%", duration: "1.3s", delay: "0s" },
  { top: "30%", duration: "1.6s", delay: "0.2s" },
  { top: "45%", duration: "1.1s", delay: "0.5s" },
  { top: "60%", duration: "1.8s", delay: "0.8s" },
  { top: "75%", duration: "1.4s", delay: "1.2s" },
  { top: "85%", duration: "1.5s", delay: "1.5s" },
  { top: "5%", duration: "1.2s", delay: "0.1s" },
  { top: "22%", duration: "1.5s", delay: "0.7s" },
  { top: "38%", duration: "1.2s", delay: "1.3s" },
  { top: "55%", duration: "1.7s", delay: "1.7s" },
  { top: "68%", duration: "1.5s", delay: "2.0s" },
  { top: "95%", duration: "1.3s", delay: "2.2s" },
  { top: "10%", duration: "1.4s", delay: "0.3s" },
  { top: "25%", duration: "1.7s", delay: "0.6s" },
  { top: "50%", duration: "1.2s", delay: "0.9s" },
  { top: "65%", duration: "1.9s", delay: "1.1s" },
  { top: "80%", duration: "1.3s", delay: "1.4s" },
  { top: "90%", duration: "1.6s", delay: "1.8s" },
  { top: "2%", duration: "1.5s", delay: "2.1s" },
  { top: "98%", duration: "1.4s", delay: "2.4s" },
];

// Timings for the lights turning on, sequenced like a real F1 start.
const LIGHT_VISUAL_TIMINGS = [500, 1500, 2500, 3500, 4500];

export default function IntroScreen({ onEnter }: { onEnter: () => void }) {
  const [litLights, setLitLights] = useState<boolean[]>([false, false, false, false, false]);
  const [buttonVisible, setButtonVisible] = useState(false);

  useEffect(() => {
    const timers = LIGHT_VISUAL_TIMINGS.map((time, index) =>
      setTimeout(() => {
        setLitLights((prev) => {
          const next = [...prev];
          next[index] = true;
          return next;
        });
      }, time)
    );
    const buttonTimer = setTimeout(() => setButtonVisible(true), 6000);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(buttonTimer);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black"
      style={{ perspective: "800px" }}
    >
      {/* Background flashes */}
      <div className="absolute inset-0 overflow-hidden">
        {FLASH_CONFIG.map((flash, i) => (
          <div
            key={i}
            className="absolute left-0 h-[3px] w-[300px] rounded-[5px] opacity-0"
            style={{
              top: flash.top,
              background:
                "linear-gradient(to right, rgba(220, 0, 0, 0), rgba(255, 20, 20, 0.8), rgba(220, 0, 0, 0))",
              filter: "blur(2px)",
              animation: `move-flash ${flash.duration} linear infinite`,
              animationDelay: flash.delay,
            }}
          />
        ))}
      </div>

      {/* Lights + logo */}
      <div className="relative flex h-full w-full flex-col items-center justify-center">
        <div
          className="mb-[50px] flex gap-5"
          style={{
            animation: "fade-out-lights 1s ease-in-out 5s forwards",
          }}
        >
          {litLights.map((on, i) => (
            <div
              key={i}
              className="h-[50px] w-[50px] rounded-full border-2 border-[#444]"
              style={{
                backgroundColor: on ? "#ff0000" : "#330000",
                boxShadow: on ? "0 0 20px #ff0000, 0 0 40px #ff0000" : "none",
                opacity: on ? 1 : 0,
                animation: "turn-on 1s forwards",
              }}
            />
          ))}
        </div>

        <div
          className="absolute inset-0 flex items-center justify-center opacity-0"
          style={{ animation: "fade-in-logo 1s ease-in-out 6s forwards" }}
        >
          <Image
            src="/f1-logo.png"
            alt="F1 Logo"
            width={500}
            height={200}
            className="w-[500px]"
            style={{
              filter: "drop-shadow(0 0 15px rgba(255, 255, 255, 0.7))",
              height: "auto",
            }}
            priority
          />
        </div>
      </div>

      <button
        onClick={onEnter}
        className="fixed left-1/2 top-[65%] -translate-x-1/2 rounded-[30px] border-2 border-f1-red bg-transparent px-6 py-2.5 font-bold uppercase text-f1-red opacity-0 transition-all duration-300 ease-in-out hover:scale-105 hover:bg-f1-red hover:text-white hover:shadow-[0_0_20px_#E10600]"
        style={{
          opacity: buttonVisible ? 1 : 0,
          animation: "fade-in-button 1s ease-in-out 6s forwards",
        }}
      >
        Enter the Pit Lane
      </button>
    </div>
  );
}
