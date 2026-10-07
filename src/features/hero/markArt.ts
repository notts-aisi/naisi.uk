/**
 * The emblem as the hero draws it: the large cut, with the head cut out of
 * the shield so the scene shows through it.
 *
 * This is the brand's mark. It is copied from the hero's own markup and is
 * never redrawn, recoloured or re-cut here. The scene is registered to these
 * exact shapes (it lights the head from behind and runs its last edges in
 * behind the tower), and tests/hero-scene.test.mjs holds that the shapes
 * below are the ones the scene carries.
 */

/** The emblem's own coordinate box. The scene works in these units. */
export const MARK_VIEW_BOX = "6 6 221.07 270.4";

/** Tower, shield, wave. The tower is drawn even-odd, for its window. */
export const MARK_SHAPES = [
  {
    d: "M46 6H80V34H108V6H142V34H176V6H204V70.13L166 60.63L94 78.63V132A112 112 0 0 0 130 214.27V227.83C114.77 220.57 97.67 214.88 76.65 214.88C65.18 214.88 53.31 216.94 42 222.62V186L56 172V88L46 78ZM68 158H80V110A6 6 0 0 0 68 110Z",
    evenOdd: true,
  },
  {
    d: "M130.26 197.29A100 100 0 0 1 106 132V88L166 73L226 88V132A100 100 0 0 1 166 223.65L175.13 187.08C175.61 185.01 176.2 182 178.17 180.79C183.38 177.59 198.03 185.08 199.98 174.24C200.57 170.97 198.85 170.35 198.88 168.27C199.27 167.29 200.29 166.98 200.84 166.13C201.34 165.37 201.71 161.6 201.68 160.6C201.38 159.8 200.56 159.29 200.55 158.38C201.68 155.93 207.06 158.41 207.96 154.54C208.81 150.94 201.4 141.6 200.35 137.34C199.82 135.17 200.98 132.7 200.98 130.48C200.98 124.33 200.07 118.64 196.84 113.28C189.05 100.32 168.75 95.6 154.81 99.5C149.1 101.1 143.67 104.37 139.49 108.55C128.67 119.36 125.44 137.38 132.07 151.25C134.18 155.68 141.63 163.55 142.13 166.67C143.04 172.27 138.93 181.12 136.31 186.01L130.26 197.29Z",
    evenOdd: false,
  },
  {
    d: "M181.51 254.87C164.21 254.87 151.99 250.8 136.21 242.91C119.41 234.26 100.58 226.88 76.65 226.88C54.25 226.88 30.33 234.77 12 262C33.89 248.51 54 244.18 71.05 244.18C89.12 244.18 103.12 248.77 117.12 256.15C133.15 264.55 146.9 270.4 167.01 270.4C186.35 270.4 208.24 263.02 227.07 238.33C212.06 250.8 196.02 254.87 181.51 254.87Z",
    evenOdd: false,
  },
] as const;

/** The emblem's three inks: the cyan offset, its flash when the scene pulses, and the white body. */
export const MARK_INK = { offset: "#00d4ff", flash: "#c9fbff", body: "#ffffff" } as const;
