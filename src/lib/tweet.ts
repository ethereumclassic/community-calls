/**
 * X (Twitter) post length, approximating the twitter-text weighting rules:
 * every URL counts as 23, emoji (including flag sequences) and most non-Latin
 * characters count as 2, everything else counts as 1.
 */
export const TWEET_MAX = 280;

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

export function tweetLength(text: string): number {
  let length = 0;
  const withoutUrls = text.replace(/https?:\/\/\S+/g, () => {
    length += 23;
    return "";
  });
  for (const { segment } of segmenter.segment(withoutUrls)) {
    const cp = segment.codePointAt(0) ?? 0;
    const isEmoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(
      segment,
    );
    const isLightweight =
      cp <= 0x10ff ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037);
    length += isEmoji || !isLightweight ? 2 : 1;
  }
  return length;
}
