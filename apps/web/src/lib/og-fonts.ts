// Fonts for generated images. next/og reads TTF, OTF and WOFF but not WOFF2,
// and Google Fonts serves WOFF static instances to older browsers, so ask as
// one. Without network the image falls back to the bundled default font.

const OLD_BROWSER = "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30";

export async function instrumentSans(weight: number, width: number): Promise<ArrayBuffer | null> {
  try {
    const cssRes = await fetch(`https://fonts.googleapis.com/css2?family=Instrument+Sans:wdth,wght@${width},${weight}`, {
      headers: { "User-Agent": OLD_BROWSER },
    });
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const blocks = css.split("@font-face");
    const latin = blocks.find((b) => b.includes("U+0000-00FF")) ?? blocks[blocks.length - 1];
    const url = /src:\s*url\(([^)]+)\)\s*format\('woff'\)/.exec(latin ?? "")?.[1];
    if (!url) return null;
    const fontRes = await fetch(url);
    return fontRes.ok ? await fontRes.arrayBuffer() : null;
  } catch {
    return null;
  }
}
