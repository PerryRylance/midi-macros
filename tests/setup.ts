import { expect } from "vitest";

interface CustomMatchers<R = unknown> {
    toLooseEqual(expected: unknown): R;
}

declare module "vitest" {
    interface Assertion<T = any> extends CustomMatchers<T> {}
    interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
    toLooseEqual(received, expected) {
        const pass = received == expected;

        return {
            pass,
            message: () =>
                `expected ${this.utils.printReceived(received)} ${pass ? "not " : ""}to loosely equal ${this.utils.printExpected(expected)}`
        };
    }
});
