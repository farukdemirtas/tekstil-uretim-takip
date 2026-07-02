"use client";

import ThemeToggle from "./ThemeToggle";

export default function AppChrome() {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 pb-[max(0px,env(safe-area-inset-bottom))] pr-[max(0px,env(safe-area-inset-right))] sm:bottom-auto sm:top-4 sm:pb-0 sm:pr-0">
      <ThemeToggle inline />
    </div>
  );
}
