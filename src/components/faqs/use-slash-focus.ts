import { useEffect, type RefObject } from "react";

interface SlashKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  defaultPrevented: boolean;
  target: unknown;
}

function isTypingTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const { tagName, isContentEditable } = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
  };
  if (isContentEditable === true) return true;
  return (
    typeof tagName === "string" && ["INPUT", "TEXTAREA", "SELECT"].includes(tagName.toUpperCase())
  );
}

/**
 * `/` jumps to the search box, unless it is being typed into a field or is part of
 * a shortcut. Shift is allowed because some layouts type a slash with it.
 */
export function shouldFocusSearch(event: SlashKeyEvent): boolean {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.defaultPrevented) return false;
  return !isTypingTarget(event.target);
}

export function useSlashToFocus(input: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!shouldFocusSearch(event)) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [input]);
}
