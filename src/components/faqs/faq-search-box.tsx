import { useRef, type RefObject } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FAQ_QUERY_MAX_LENGTH } from "@/lib/faqs/query";

export const FAQ_SEARCH_ID = "faq-search";
const HINT_ID = "faq-search-hint";

export function FaqSearchBox({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Lets the page focus the box when `/` is pressed. */
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const fallback = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? fallback;

  return (
    <div>
      <label htmlFor={FAQ_SEARCH_ID} className="atelier-label mb-2 block">
        Search the training articles
      </label>
      <Input
        id={FAQ_SEARCH_ID}
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value !== "") {
            event.preventDefault();
            onChange("");
          }
        }}
        leadingIcon={Search}
        trailingElement={
          value === "" ? (
            <kbd
              aria-hidden="true"
              className="hidden h-6 min-w-6 items-center justify-center rounded-sm border border-line bg-card px-1.5 text-xs text-muted sm:inline-flex"
            >
              /
            </kbd>
          ) : (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                onChange("");
                ref.current?.focus();
              }}
              className="atelier-focus-ring inline-flex size-11 items-center justify-center rounded-control text-muted transition-colors hover:text-ink"
            >
              <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )
        }
        placeholder="Try refund, sign in or dupe"
        autoComplete="off"
        spellCheck={false}
        maxLength={FAQ_QUERY_MAX_LENGTH}
        aria-describedby={HINT_ID}
        aria-keyshortcuts="/"
        className="h-12 pr-14 text-base md:text-base [&::-webkit-search-cancel-button]:hidden"
      />
      <p id={HINT_ID} className="mt-2 text-xs text-muted">
        Every word you type has to appear in the article.
        <span className="hidden sm:inline"> Press / to jump to the search box.</span>
      </p>
    </div>
  );
}
