import type { Interpolator } from "../types";

const lerp: Interpolator = (start, end, progress) => {
    return (end * progress) + (start * (1 - progress));
}

export default lerp;
