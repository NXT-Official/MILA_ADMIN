import { describe, expect, test } from "bun:test";
import { FrontmatterError, parseFrontmatter } from "./frontmatter";

const CONTRACT_EXAMPLE = `---
title: Credits and refunds          # required
category: Credits & billing         # required; one of the categories below
summary: One plain sentence.        # required, 160 chars at most
tags: [credits, refunds, daily]     # required, 1 to 10 lowercase words
order: 10                           # required integer; sort within category
updated: 2026-10-07                 # required ISO date
status: live                        # optional: live | partly-live | coming
---
## First heading

Body text.
`;

describe("parseFrontmatter", () => {
  test("reads every field of the content contract, trailing comments and all", () => {
    const { data } = parseFrontmatter(CONTRACT_EXAMPLE);
    expect(data).toEqual({
      title: "Credits and refunds",
      category: "Credits & billing",
      summary: "One plain sentence.",
      tags: ["credits", "refunds", "daily"],
      order: 10,
      updated: "2026-10-07",
      status: "live",
    });
  });

  test("returns the body without the frontmatter, and how many lines the frontmatter took", () => {
    const { body, bodyLineOffset } = parseFrontmatter(CONTRACT_EXAMPLE);
    expect(body).toBe("## First heading\n\nBody text.\n");
    // Opening rule, 7 fields, closing rule.
    expect(bodyLineOffset).toBe(9);
  });

  test("a dated field stays a string, a bare integer becomes a number", () => {
    const { data } = parseFrontmatter("---\nupdated: 2026-10-07\norder: -3\n---\nx");
    expect(data.updated).toBe("2026-10-07");
    expect(data.order).toBe(-3);
  });

  test("a quoted number stays a string, so a validator can reject it", () => {
    const { data } = parseFrontmatter('---\norder: "10"\n---\nx');
    expect(data.order).toBe("10");
  });

  test("quotes keep a colon and a hash inside the value", () => {
    const { data } = parseFrontmatter(
      `---\ntitle: "Credits: the rules # 1"\nsummary: 'It''s plain'\n---\nx`,
    );
    expect(data.title).toBe("Credits: the rules # 1");
    expect(data.summary).toBe("It's plain");
  });

  test("an escaped double quote survives", () => {
    const { data } = parseFrontmatter('---\ntitle: "Say \\"hello\\""\n---\nx');
    expect(data.title).toBe('Say "hello"');
  });

  test("a hash with no space before it belongs to the value", () => {
    const { data } = parseFrontmatter("---\ntitle: Issue#12 fixed\n---\nx");
    expect(data.title).toBe("Issue#12 fixed");
  });

  test("inline arrays handle quotes, spaces and the empty array", () => {
    const { data } = parseFrontmatter(
      '---\ntags: [ "sign in", dupe,  refunds ]\nempty: []\n---\nx',
    );
    expect(data.tags).toEqual(["sign in", "dupe", "refunds"]);
    expect(data.empty).toEqual([]);
  });

  test("an array item may contain a comma when quoted", () => {
    const { data } = parseFrontmatter('---\ntags: ["a, b", c]\n---\nx');
    expect(data.tags).toEqual(["a, b", "c"]);
  });

  test("a block list works as well as an inline one", () => {
    const { data } = parseFrontmatter("---\ntags:\n  - credits\n  - refunds\norder: 1\n---\nx");
    expect(data.tags).toEqual(["credits", "refunds"]);
    expect(data.order).toBe(1);
  });

  test("blank lines and whole-line comments are ignored", () => {
    const { data } = parseFrontmatter("---\n\n# a note to authors\ntitle: Hi\n\n---\nx");
    expect(data).toEqual({ title: "Hi" });
  });

  test("Windows line endings and a byte order mark are handled", () => {
    const bom = String.fromCharCode(0xfeff);
    const { data, body } = parseFrontmatter(
      `${bom}---\r\ntitle: Hi\r\norder: 2\r\n---\r\nLine\r\n`,
    );
    expect(data).toEqual({ title: "Hi", order: 2 });
    expect(body).toBe("Line\n");
  });

  test("a horizontal rule in the body is not mistaken for the end", () => {
    const { body } = parseFrontmatter("---\ntitle: Hi\n---\nA\n\n---\n\nB\n");
    expect(body).toBe("A\n\n---\n\nB\n");
  });

  test("empty frontmatter is allowed here, the validator decides what is required", () => {
    const { data, body } = parseFrontmatter("---\n---\nText");
    expect(data).toEqual({});
    expect(body).toBe("Text");
  });

  test("a value may be empty", () => {
    const { data } = parseFrontmatter("---\nstatus:\ntitle: Hi\n---\nx");
    expect(data.status).toBe("");
    expect(data.title).toBe("Hi");
  });

  describe("fails loudly", () => {
    const fails = (raw: string, pattern: RegExp) => {
      let caught: unknown;
      try {
        parseFrontmatter(raw);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(FrontmatterError);
      expect((caught as FrontmatterError).message).toMatch(pattern);
      return caught as FrontmatterError;
    };

    test("when there is no frontmatter at all", () => {
      fails("## Just a heading\n", /must start with a line of three dashes/i);
    });

    test("when it is never closed", () => {
      fails("---\ntitle: Hi\nBody", /never closed/i);
    });

    test("when a line has no colon, naming the line", () => {
      const error = fails("---\ntitle: Hi\nthis is wrong\n---\nx", /line 3/i);
      expect(error.line).toBe(3);
    });

    test("when a key appears twice", () => {
      fails("---\ntitle: A\ntitle: B\n---\nx", /"title" appears twice/i);
    });

    test("when an array is not closed", () => {
      fails("---\ntags: [a, b\n---\nx", /not closed/i);
    });

    test("when a quote is not closed", () => {
      fails('---\ntitle: "Hi\n---\nx', /not closed/i);
    });

    test("when text trails a closing quote", () => {
      fails('---\ntitle: "Hi" there\n---\nx', /after the closing quote/i);
    });

    test("when a multi-line value is used", () => {
      fails("---\nsummary: >\n  long\n---\nx", /one line/i);
    });

    test("when a key is not a plain word", () => {
      fails("---\nmy key: x\n---\nx", /line 2/i);
    });
  });
});
