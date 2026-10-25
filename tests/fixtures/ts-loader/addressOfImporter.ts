// A module that imports another, and says both addresses, for tests/ts-loader.test.mjs.
import { address as imported } from "./address";

export const address: string = import.meta.url;
export { imported };
