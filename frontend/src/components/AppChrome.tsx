"use client";

import ThemeToggle from "./ThemeToggle";

export default function AppChrome() {
  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
      <ThemeToggle inline />
    </div>
  );
}
