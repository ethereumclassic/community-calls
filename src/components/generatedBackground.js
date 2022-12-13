import React from "react";
import tw from "twin.macro";

// from-green-400 to-green-100/20
const colors = [
  tw`from-slate-400 to-slate-100/20`,
  // tw`from-stone-400 to-stone-100/20`,
  // tw`from-red-400 to-red-100/20`,
  // tw`from-orange-400 to-orange-100/20`,
  // tw`from-amber-400 to-amber-100/20`,
  // tw`from-yellow-400 to-yellow-100/20`,
  tw`from-lime-400 to-lime-100/20`,
  tw`from-green-400 to-green-100/20`,
  tw`from-emerald-400 to-emerald-100/20`,
  tw`from-teal-400 to-teal-100/20`,
  tw`from-cyan-400 to-cyan-100/20`,
  // tw`from-sky-400 to-sky-100/20`,
  tw`from-blue-400 to-blue-100/20`,
  // tw`from-indigo-400 to-indigo-100/20`,
  tw`from-violet-400 to-violet-100/20`,
  // tw`from-purple-400 to-purple-100/20`,
  // tw`from-fuchsia-400 to-fuchsia-100/20`,
  // tw`from-pink-400 to-pink-100/20`,
];

// patterns
const patterns = [
  // tw`bg-hero-anchors-away`,
  tw`bg-hero-architect`,
  tw`bg-hero-autumn`,
  tw`bg-hero-aztec`,
  // tw`bg-hero-bamboo`,
  tw`bg-hero-bank-note`,
  // tw`bg-hero-bathroom-floor`,
  tw`bg-hero-bevel-circle`,
  // tw`bg-hero-boxes`,
  // tw`bg-hero-brick-wall`,
  // tw`bg-hero-bubbles`,
  tw`bg-hero-cage`,
  tw`bg-hero-charlie-brown`,
  tw`bg-hero-church-on-sunday`,
  // tw`bg-hero-circles-squares`,
  tw`bg-hero-circuit-board`,
  tw`bg-hero-connections`,
  tw`bg-hero-cork-screw`,
  tw`bg-hero-current`,
  tw`bg-hero-curtain`,
  tw`bg-hero-cutout`,
  tw`bg-hero-death-star`,
  tw`bg-hero-diagonal-lines`,
  tw`bg-hero-diagonal-stripes`,
  // tw`bg-hero-dominos`,
  tw`bg-hero-endless-clouds`,
  tw`bg-hero-eyes`,
  tw`bg-hero-falling-triangles`,
  tw`bg-hero-fancy-rectangles`,
  // tw`bg-hero-flipped-diamonds`,
  // tw`bg-hero-floating-cogs`,
  // tw`bg-hero-floor-tile`,
  tw`bg-hero-formal-invitation`,
  tw`bg-hero-four-point-stars`,
  // tw`bg-hero-glamorous`,
  // tw`bg-hero-graph-paper`,
  tw`bg-hero-groovy`,
  tw`bg-hero-happy-intersection`,
  tw`bg-hero-heavy-rain`,
  tw`bg-hero-hexagons`,
  tw`bg-hero-hideout`,
  tw`bg-hero-houndstooth`,
  // tw`bg-hero-i-like-food`,
  tw`bg-hero-intersecting-circles`,
  // tw`bg-hero-jigsaw`,
  tw`bg-hero-jupiter`,
  tw`bg-hero-kiwi`,
  // tw`bg-hero-leaf`,
  tw`bg-hero-lines-in-motion`,
  tw`bg-hero-lips`,
  tw`bg-hero-lisbon`,
  tw`bg-hero-melt`,
  tw`bg-hero-moroccan`,
  tw`bg-hero-morphing-diamonds`,
  // tw`bg-hero-overcast`,
  tw`bg-hero-overlapping-circles`,
  tw`bg-hero-overlapping-diamonds`,
  tw`bg-hero-overlapping-hexagons`,
  tw`bg-hero-parkay-floor`,
  // tw`bg-hero-piano-man`,
  tw`bg-hero-pie-factory`,
  tw`bg-hero-pixel-dots`,
  // tw`bg-hero-plus`,
  // tw`bg-hero-polka-dots`,
  // tw`bg-hero-rails`,
  // tw`bg-hero-rain`,
  tw`bg-hero-random-shapes`,
  tw`bg-hero-rounded-plus-connected`,
  tw`bg-hero-signal`,
  // tw`bg-hero-skulls`,
  tw`bg-hero-slanted-stars`,
  tw`bg-hero-squares`,
  // tw`bg-hero-squares-in-squares`,
  // tw`bg-hero-stamp-collection`,
  // tw`bg-hero-steel-beams`,
  // tw`bg-hero-stripes`,
  tw`bg-hero-temple`,
  // tw`bg-hero-texture`,
  // tw`bg-hero-tic-tac-toe`,
  // tw`bg-hero-tiny-checkers`,
  tw`bg-hero-topography`,
  tw`bg-hero-volcano-lamp`,
  tw`bg-hero-wallpaper`,
  tw`bg-hero-wiggle`,
  tw`bg-hero-x-equals`,
  tw`bg-hero-yyy`,
  tw`bg-hero-zig-zag`,
];

function mapToItem(items, num) {
  return items[num % items.length];
}

const GeneratedBackground = ({ episode, thumb, children }) => {
  const color = mapToItem(colors, episode.fields.episode);
  const pattern = mapToItem(patterns, episode.fields.episode);
  return (
    <div
      className="group"
      css={[
        tw`relative text-white w-full bg-gray-800`,
        thumb && tw`hover:bg-black`,
        !thumb && tw`aspect-auto md:aspect-[5/3]`,
      ]}
    >
      <div
        css={[
          tw`absolute inset-0 bg-gradient-to-tl shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]`,
          color,
        ]}
      />
      {/* pattern */}
      <div
        css={[tw`absolute inset-0 opacity-[0.05] bg-[length:5em]`, pattern]}
      />
      {children}
    </div>
  );
};

export default GeneratedBackground;
