/**
 * The hero's keep-out zones.
 *
 * The scene dims itself behind anything marked `data-keepout`, so words stay
 * readable over it. Each zone has three numbers, written on the element
 * beside its name:
 *
 *   pad        how far the zone reaches past the element's own box, in px
 *   feather    how far past that the dimming fades out, in px
 *   strength   how much is taken away inside, from 0 (nothing) to 1 (all)
 *
 * The numbers are the boards'. Two names mean more than a dimmed box to the
 * scene: `header` is where it takes the top of its network from, and
 * `tagline` is where the network stops on the phone and tablet forms.
 * README.md has the whole contract.
 */
export const KEEP_OUT = {
  header: { pad: 0, feather: 28, strength: 0.55 },
  mark: { pad: 14, feather: 56, strength: 0.6 },
  tagline: { pad: 10, feather: 40, strength: 0.75 },
  headline: { pad: 18, feather: 64, strength: 0.8 },
  lede: { pad: 12, feather: 48, strength: 0.8 },
  cta: { pad: 12, feather: 44, strength: 0.85 },
  award: { pad: 12, feather: 40, strength: 0.75 },
} as const;

export type KeepOutName = keyof typeof KEEP_OUT;

export type KeepOutAttributes = {
  "data-keepout": KeepOutName;
  "data-pad": string;
  "data-feather": string;
  "data-strength": string;
};

/**
 * The four attributes for one zone, to spread onto its element:
 * `<p {...keepOut("lede")}>`.
 */
export function keepOut(name: KeepOutName): KeepOutAttributes {
  const zone = KEEP_OUT[name];
  return {
    "data-keepout": name,
    "data-pad": String(zone.pad),
    "data-feather": String(zone.feather),
    "data-strength": String(zone.strength),
  };
}
