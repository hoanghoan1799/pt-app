import { describe, expect, it } from "vitest";

import { extractUrls, tokenizeLinks } from "@/features/chat/utils/link-rules";

const links = (body: string) =>
  tokenizeLinks(body).flatMap((token) =>
    token.kind === "link" ? [token.href] : [],
  );

describe("tokenizeLinks", () => {
  it("returns plain text as one token", () => {
    expect(tokenizeLinks("Chào buổi sáng")).toEqual([
      { kind: "text", text: "Chào buổi sáng" },
    ]);
    expect(tokenizeLinks("")).toEqual([]);
  });

  it("splits Vietnamese text around a URL and keeps every character", () => {
    const body = "Xem bài này nhé https://example.com/bai-tap?id=1 rồi tập đi";

    expect(tokenizeLinks(body)).toEqual([
      { kind: "text", text: "Xem bài này nhé " },
      {
        kind: "link",
        text: "https://example.com/bai-tap?id=1",
        href: "https://example.com/bai-tap?id=1",
      },
      { kind: "text", text: " rồi tập đi" },
    ]);
    expect(
      tokenizeLinks(body)
        .map((token) => token.text)
        .join(""),
    ).toBe(body);
  });

  it("leaves sentence punctuation outside the link", () => {
    expect(links("Vào https://a.com/x.")).toEqual(["https://a.com/x"]);
    expect(links("Thử https://a.com/x, rồi báo mình!")).toEqual([
      "https://a.com/x",
    ]);
    expect(links("Có phải https://a.com/x?")).toEqual(["https://a.com/x"]);
    expect(links("(xem https://a.com/x)")).toEqual(["https://a.com/x"]);
    expect(links("“https://a.com/x”")).toEqual(["https://a.com/x"]);
  });

  it("keeps a balanced closing bracket that belongs to the URL", () => {
    expect(links("https://vi.wikipedia.org/wiki/Gym_(thể_thao)")).toEqual([
      "https://vi.wikipedia.org/wiki/Gym_(th%E1%BB%83_thao)",
    ]);
  });

  it("links www. addresses over https", () => {
    expect(tokenizeLinks("vào www.example.com/tap nhé")).toEqual([
      { kind: "text", text: "vào " },
      {
        kind: "link",
        text: "www.example.com/tap",
        href: "https://www.example.com/tap",
      },
      { kind: "text", text: " nhé" },
    ]);
  });

  it("accepts http and finds several links", () => {
    expect(links("http://a.com và https://b.org/x")).toEqual([
      "http://a.com/",
      "https://b.org/x",
    ]);
  });

  it("never links other schemes", () => {
    for (const body of [
      "javascript:alert(1)",
      "[x](javascript:alert(1))",
      "data:text/html;base64,AAAA",
      "ftp://a.com/file",
      "file:///etc/passwd",
      "vbscript:msgbox",
      "JAVASCRIPT://www.a.com/%0aalert(1)",
    ]) {
      expect(links(body)).toEqual([]);
    }
  });

  it("ignores things that only look like URLs", () => {
    expect(links("https://")).toEqual([]);
    expect(links("https://localhost")).toEqual([]);
    expect(links("xhttp://a.com")).toEqual([]);
    expect(links("https://user:pw@a.com")).toEqual([]);
    expect(links("www.")).toEqual([]);
    expect(links("lúc 7.30 sáng")).toEqual([]);
  });
});

describe("extractUrls", () => {
  it("gives domain, text and href, once per distinct URL", () => {
    expect(
      extractUrls(
        "a www.Example.com/x, b https://example.com/y c www.Example.com/x",
      ),
    ).toEqual([
      {
        text: "www.Example.com/x",
        href: "https://www.example.com/x",
        domain: "example.com",
      },
      {
        text: "https://example.com/y",
        href: "https://example.com/y",
        domain: "example.com",
      },
    ]);
  });

  it("is empty for text without links", () => {
    expect(extractUrls("không có link, chỉ có 3.5kg")).toEqual([]);
  });
});
