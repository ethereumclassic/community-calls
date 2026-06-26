// Layered composition for the /audiogen scratchpad. The "Melting Submarine"
// acid tune is split into four layers - drums, bass, lead, texture - each with
// 16 interchangeable options. You compose a track by picking one option per
// layer (or turning a layer off); compose() stacks the choices into a single
// Strudel program. Selection state lives in the URL.
//
// Original tune by Felix Roos (CC BY-NC-SA 4.0). Strudel is AGPL-3.0 and loads
// from a CDN at runtime; nothing here is bundled into production.

type LayerOption = { name: string; code: string };
type Layer = { id: string; name: string; options: LayerOption[] };

// --- bass voice helper: shared dub/acid body, varied notes/filter ----------
// Spacious, sub-heavy character (in the vein of "Dub Stabs" + "Sparse Sub").
const bass = (
  notes: string,
  opts: { cutoff?: string; lpq?: number; wave?: string; extra?: string } = {},
): string => {
  const cutoff = opts.cutoff ?? "sine.slow(11).range(200,2800)";
  const lpq = opts.lpq ?? 10;
  const wave = opts.wave ?? "sawtooth";
  const extra = opts.extra ?? "";
  return `${notes}
.off(1/8, x=>x.add(12).degradeBy(.6))
.add(perlin.range(0,.5))
.superimpose(add(.05))
.note().decay(.15).sustain(0).s('${wave}').gain(.5)
.cutoff(${cutoff}).lpq(${lpq}).lpa(.1).lpenv(-2)${extra}`;
};

const DRUMS: LayerOption[] = [
  {
    name: "Four Floor",
    code: `s("bd:5*4, ~ cp, [~ hh27]*2").speed(perlin.range(.85,.95))`,
  },
  {
    name: "Melty Original",
    code: `s("bd:5,[~ <sd:1!3 sd:1(3,4,3)>],hh27(3,4,1)").speed(perlin.range(.7,.9))`,
  },
  {
    name: "Driving Hats",
    code: `s("bd:5*4, ~ cp, hh27*4").speed(perlin.range(.85,.95))`,
  },
  {
    name: "Breakbeat",
    code: `s("bd:5 ~ sd:1 [~ bd:5], hh27*4").speed(perlin.range(.8,.95))`,
  },
  {
    name: "Half Time",
    code: `s("bd:5 ~ ~ ~ sd:1 ~ ~ ~, hh27*2").speed(perlin.range(.85,.95))`,
  },
  {
    name: "Tom Rolls",
    code: `s("bd:5*4, lt(3,8,2), hh27*2").speed(perlin.range(.85,.95))`,
  },
  { name: "TR-909", code: `s("bd*4, ~ cp, [~ hh]*2").bank('RolandTR909')` },
  { name: "TR-808", code: `s("bd*4, ~ cp, [~ hh]*2").bank('RolandTR808')` },
  {
    name: "Clap Trap",
    code: `s("bd:5*4, cp*2, hh27*4").speed(perlin.range(.85,.95))`,
  },
  {
    name: "Syncopated",
    code: `s("bd:5 [~ bd:5] ~ bd:5, ~ cp, hh27*4").speed(perlin.range(.85,.95))`,
  },
  {
    name: "Amen Chop",
    code: `s("amencutup*4").slow(2).gain(.7).speed(perlin.range(.9,1))`,
  },
  { name: "Minimal Kick", code: `s("bd:5*4").speed(perlin.range(.85,.95))` },
  {
    name: "Offbeat Hats",
    code: `s("bd:5*4, [~ hh27]*4").speed(perlin.range(.85,.95))`,
  },
  {
    name: "Euclid",
    code: `s("bd:5(5,8), cp(3,8,2), hh27*4").speed(perlin.range(.85,.95))`,
  },
  {
    name: "Dub Kick",
    code: `s("bd:5 ~ ~ bd:5, ~ cp").speed(perlin.range(.8,.95)).room(.3)`,
  },
  {
    name: "Ghost Hats",
    code: `s("bd:5*4, hh27*8").gain("0.9 0.5".fast(8)).speed(perlin.range(.85,.95))`,
  },
];

// 16 dub / sparse sub basslines - spacious, deep, lots of room + delay.
const BASS: LayerOption[] = [
  {
    name: "Dub Stabs",
    code: bass(`"a1 ~ ~ e2 ~ ~ c2 ~"`, {
      cutoff: "sine.slow(11).range(250,4200)",
      lpq: 9,
      extra: ".delay(.4).delaytime(.333).delayfeedback(.45).room(.35)",
    }),
  },
  {
    name: "Sparse Sub",
    code: bass(`"<a1 ~ e1 ~>"`, {
      cutoff: "sine.slow(13).range(200,2600)",
      lpq: 14,
      extra: ".room(.3)",
    }),
  },
  {
    name: "Deep Pulse",
    code: bass(`"a1 ~ ~ ~ a1 ~ ~ ~"`, {
      wave: "sine",
      extra: ".decay(.4).sustain(.4).room(.4)",
    }),
  },
  {
    name: "Off Stab",
    code: bass(`"~ ~ a1 ~ ~ e2 ~ ~"`, {
      cutoff: "sine.slow(9).range(300,3000)",
      extra: ".delay(.45).delaytime(.375).delayfeedback(.5).room(.4)",
    }),
  },
  {
    name: "Sub Drop",
    code: bass(`"<a1 a1 e1 c1>"`, {
      wave: "sine",
      cutoff: "sine.slow(15).range(150,1200)",
      lpq: 12,
      extra: ".decay(.3).sustain(.3).room(.3)",
    }),
  },
  {
    name: "Echo Stab",
    code: bass(`"a1 ~ e2 ~ ~ ~ ~ ~"`, {
      extra: ".delay(.6).delaytime(.1875).delayfeedback(.62).room(.5)",
    }),
  },
  {
    name: "Two Note",
    code: bass(`"a1 ~ ~ ~ e2 ~ ~ ~"`, {
      cutoff: "sine.slow(12).range(250,3500)",
      extra: ".delay(.3).delaytime(.5).delayfeedback(.4).room(.4)",
    }),
  },
  {
    name: "Wide Sub",
    code: bass(`"<a1 ~ ~ d2> <~ ~ e1 ~>"`, {
      wave: "sine",
      lpq: 11,
      extra: ".decay(.35).sustain(.3).room(.3)",
    }),
  },
  {
    name: "Dub Skank",
    code: bass(`"~ a1 ~ a1 ~ e2 ~ e2"`, {
      cutoff: "sine.slow(10).range(300,2800)",
      extra: ".delay(.4).delaytime(.333).delayfeedback(.4).room(.3)",
    }),
  },
  {
    name: "Long Sub",
    code: bass(`"a1@3 ~"`, {
      wave: "sine",
      extra: ".decay(.6).sustain(.7).room(.4)",
    }),
  },
  {
    name: "Dub Slide",
    code: bass(`"a1 ~ [e1 e2] ~ ~ ~ c2 ~"`, {
      cutoff: "sine.slow(11).range(220,3000)",
      lpq: 11,
      extra: ".delay(.4).delaytime(.375).delayfeedback(.45).room(.35)",
    }),
  },
  {
    name: "Ghost Stab",
    code: bass(`"a1 ~ ~ e2? ~ ~ c2? ~"`, {
      cutoff: "perlin.range(250,3200).slow(8)",
      extra: ".delay(.4).delaytime(.25).delayfeedback(.45).room(.4)",
    }),
  },
  {
    name: "Cavern",
    code: bass(`"<a1 ~ ~ ~ e1 ~ ~ ~>"`, {
      wave: "sine",
      lpq: 13,
      extra:
        ".decay(.5).sustain(.4).delay(.5).delaytime(.5).delayfeedback(.55).room(.6)",
    }),
  },
  {
    name: "Rolling Sub",
    code: bass(`"a1 ~ a1 e1 ~ e1 c2 ~"`, {
      cutoff: "sine.slow(9).range(220,2400)",
      lpq: 12,
      extra: ".room(.3)",
    }),
  },
  {
    name: "Tape Stab",
    code: bass(`"a1 ~ ~ ~ ~ e2 ~ ~"`, {
      cutoff: "sine.slow(13).range(260,3600)",
      extra: ".vib(2).delay(.5).delaytime(.375).delayfeedback(.5).room(.45)",
    }),
  },
  {
    name: "Deep Triad",
    code: bass(`"<[a1 c2 e2] ~ ~ ~>"`, {
      cutoff: "sine.slow(12).range(240,3000)",
      lpq: 11,
      extra: ".delay(.35).delaytime(.333).delayfeedback(.4).room(.35)",
    }),
  },
];

const LEAD: LayerOption[] = [
  {
    name: "Melt Blips",
    code: `"a4 c5 <e6 a6>".struct("x(5,8,-1)")
.superimpose(x=>x.add(.04)).add(perlin.range(0,.5))
.note().decay(.1).sustain(0).s('triangle')
.degradeBy(perlin.range(0,.5))
.echoWith(4,.125,(x,n)=>x.gain(.15*1/(n+1)))`,
  },
  {
    name: "Acid Stab",
    code: `note("<a4 c5 e5 a5>").struct("x(3,8)").s('sawtooth').lpf(2200).lpq(12).decay(.08).sustain(0).delay(.3).delaytime(.1875).delayfeedback(.35).room(.3).gain(.4)`,
  },
  {
    name: "Square Pluck",
    code: `note("a5 ~ c6 e5 ~ a5 g5 ~").s('square').cutoff(2500).decay(.05).sustain(0).delay(.2).gain(.3)`,
  },
  {
    name: "Arp Up",
    code: `n("0 2 4 7").scale('a4 minor').fast(2).s('triangle').decay(.1).sustain(0).delay(.25).room(.4).gain(.3)`,
  },
  {
    name: "Saw Sweep",
    code: `note("<a4 g4 e4 c5>").s('sawtooth').lpf(sine.range(800,3000).slow(8)).lpq(8).decay(.2).sustain(.1).gain(.25)`,
  },
  {
    name: "Sine Bells",
    code: `note("a5 e6 c6 a5".struct("x(5,8,-1)")).s('sine').decay(.2).sustain(0).delay(.3).delayfeedback(.6).room(.6).gain(.3)`,
  },
  {
    name: "Stab Chords",
    code: `chord("<Am7 Em7>").voicing().s('square').struct("x(3,8)").cutoff(1500).decay(.1).sustain(0).gain(.25).room(.3)`,
  },
  {
    name: "Sparkle",
    code: `n(rand.range(0,7).struct("x(5,16)")).scale('a5 minor').s('triangle').decay(.05).sustain(0).delay(.3).gain(.2)`,
  },
  {
    name: "Acid Lead",
    code: `note("a4 c5 a4 e5 a4 g4 a4 c5").s('sawtooth').lpf(perlin.range(600,3000)).lpq(10).decay(.1).sustain(0).gain(.25)`,
  },
  {
    name: "Pulse",
    code: `note("a5*8").s('square').cutoff(2000).decay(.03).sustain(0).degradeBy(.4).gain(.2).pan(sine)`,
  },
  {
    name: "Detuned",
    code: `note("<a4 e5>").superimpose(x=>x.add(.1)).s('sawtooth').lpf(1800).decay(.15).sustain(0).delay(.2).gain(.25)`,
  },
  {
    name: "Glass Echo",
    code: `note("a6 e6 c6").struct("x(3,8,2)").s('triangle').decay(.1).sustain(0).delay(.4).delayfeedback(.6).room(.7).gain(.2)`,
  },
  {
    name: "Rave Stab",
    code: `note("<a4,c5,e5>").struct("~ x*2").s('square').cutoff(sine.range(800,4000).slow(8)).resonance(10).decay(.1).sustain(0).room(.4).gain(.25)`,
  },
  {
    name: "Penta Run",
    code: `n("0 2 4 5 7 5 4 2").scale('a5 minor pentatonic').s('sawtooth').lpf(2500).decay(.08).sustain(0).delay(.2).gain(.2)`,
  },
  {
    name: "Octave Ping",
    code: `note("a5 a6 e6 a5").struct("x(5,8,-1)").s('sine').decay(.15).sustain(0).delay(.3).room(.4).gain(.25)`,
  },
  {
    name: "Hoover",
    code: `note("<a4 c5>").s('sawtooth').superimpose(x=>x.add(.2),x=>x.add(7.1)).lpf(sine.range(400,2500).slow(4)).lpq(8).decay(.3).sustain(.2).gain(.2)`,
  },
];

const TEXTURE: LayerOption[] = [
  { name: "None", code: `silence` },
  {
    name: "Melt Chords",
    code: `chord("<Am7!3 <Em7 E7b13 Em7 Ebm7b5>>").dict('lefthand').voicing().add(note("0,.04")).s('sawtooth').gain(.16).cutoff(500).attack(1)`,
  },
  {
    name: "Warm Pad",
    code: `note("<a2,c3,e3,g3 f2,a2,c3,e3>").s('sawtooth').lpf(900).attack(.4).release(1.6).room(.6).gain(.2)`,
  },
  {
    name: "Air Pad",
    code: `note("<a4,c5,e5 f4,a4,c5>").s('triangle').attack(1).release(2).room(.8).gain(.12)`,
  },
  {
    name: "Saw Drone",
    code: `note("a1,a2").s('sawtooth').lpf(400).attack(2).sustain(1).gain(.15)`,
  },
  {
    name: "Dub Chord Stabs",
    code: `chord("<Am7 Dm7 Em7 Am7>").voicing().struct("~ [x ~]").s('sawtooth').lpf(1200).decay(.2).sustain(0).delay(.4).room(.5).gain(.2)`,
  },
  {
    name: "Sub Drone",
    code: `note("a1").s('sine').attack(1).sustain(1).gain(.2)`,
  },
  {
    name: "Noise Sweep",
    code: `s("white").gain(.12).lpf(sine.range(200,6000).slow(16)).room(.5)`,
  },
  { name: "Vinyl Hiss", code: `s("pink").gain(.08).hpf(1000)` },
  {
    name: "Reese",
    code: `note("<a1 f1 g1 e1>").s('sawtooth').superimpose(x=>x.add(.15)).lpf(sine.range(300,900).slow(8)).lpq(6).gain(.16)`,
  },
  {
    name: "Bell Wash",
    code: `note("a5 e6 c6").struct("x(3,16)").s('sine').decay(.3).sustain(0).delay(.5).delayfeedback(.7).room(.8).gain(.12)`,
  },
  {
    name: "Minor 9 Pad",
    code: `chord("<Am9 Fmaj9>").voicing().s('sawtooth').lpf(1100).attack(.6).release(2).room(.6).gain(.16)`,
  },
  {
    name: "Suspended",
    code: `chord("<Asus4 Asus2>").voicing().s('triangle').attack(.8).release(2).room(.7).gain(.14)`,
  },
  {
    name: "Noise Riser",
    code: `s("white").gain(.1).lpf(saw.range(300,8000).slow(8)).room(.4)`,
  },
  {
    name: "Organ Pad",
    code: `note("<a3,c4,e4 g3,b3,d4>").s('square').lpf(1400).attack(.3).release(1.4).gain(.12).room(.4)`,
  },
  {
    name: "Choir-ish",
    code: `note("<a4,e5 f4,c5>").s('triangle').attack(1.2).release(2.5).vib(4).room(.9).gain(.12)`,
  },
];

export const LAYERS: Layer[] = [
  { id: "drums", name: "drums", options: DRUMS },
  { id: "bass", name: "bass", options: BASS },
  { id: "lead", name: "lead", options: LEAD },
  { id: "texture", name: "texture", options: TEXTURE },
];

// selection: layer id -> option index, or -1 for "off"
export type Selection = Record<string, number>;

export const DEFAULT_SELECTION: Selection = {
  drums: 0,
  bass: 0,
  lead: 0,
  texture: 1,
};

// Build a full Strudel program from the current selection.
export function compose(sel: Selection): string {
  const members: string[] = [];
  for (const layer of LAYERS) {
    const idx = sel[layer.id];
    if (idx == null || idx < 0) continue; // layer off
    const opt = layer.options[idx];
    if (!opt || opt.code === "silence") continue;
    // indent multi-line option bodies to sit nicely inside stack(...)
    members.push("  " + opt.code.replace(/\n/g, "\n  "));
  }
  const head =
    "// composed on /audiogen - drums + bass + lead + texture\n" +
    "// tempo comes from the BPM slider; original tune by Felix Roos\n" +
    "useRNG('legacy')\n\n";
  if (members.length === 0) return head + "silence";
  return head + "stack(\n" + members.join(",\n") + "\n)";
}
