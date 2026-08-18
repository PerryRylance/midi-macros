import type { Interpolator } from "./types";

export const lerp: Interpolator = (start, end, progress) => {
    return (end * progress) + (start * (1 - progress));
}
