import { describe, it, expect } from "bun:test";
import { mapOptions } from "../src/mapOptions.ts";

describe("mapOptions", () => {
  it("returns an empty object for no input", () => {
    expect(mapOptions()).toEqual({});
    expect(mapOptions({})).toEqual({});
  });

  it("maps temperature", () => {
    expect(mapOptions({ temperature: 0.7 })).toMatchObject({ temperature: 0.7 });
  });

  it("maps top_p", () => {
    expect(mapOptions({ top_p: 0.9 })).toMatchObject({ top_p: 0.9 });
  });

  it("maps top_k", () => {
    expect(mapOptions({ top_k: 40 })).toMatchObject({ top_k: 40 });
  });

  it("maps seed", () => {
    expect(mapOptions({ seed: 42 })).toMatchObject({ seed: 42 });
  });

  it("maps stop (string)", () => {
    expect(mapOptions({ stop: "\n" })).toMatchObject({ stop: "\n" });
  });

  it("maps stop (array)", () => {
    expect(mapOptions({ stop: ["\n", "END"] })).toMatchObject({ stop: ["\n", "END"] });
  });

  it("maps num_predict → max_tokens", () => {
    expect(mapOptions({ num_predict: 256 })).toMatchObject({ max_tokens: 256 });
    expect(mapOptions({ num_predict: 256 })).not.toHaveProperty("num_predict");
  });

  it("maps presence_penalty", () => {
    expect(mapOptions({ presence_penalty: 0.5 })).toMatchObject({ presence_penalty: 0.5 });
  });

  it("maps frequency_penalty", () => {
    expect(mapOptions({ frequency_penalty: 0.3 })).toMatchObject({ frequency_penalty: 0.3 });
  });

  it("maps repeat_penalty as alias for frequency_penalty", () => {
    expect(mapOptions({ repeat_penalty: 1.1 })).toMatchObject({ frequency_penalty: 1.1 });
    expect(mapOptions({ repeat_penalty: 1.1 })).not.toHaveProperty("repeat_penalty");
  });

  it("frequency_penalty wins over repeat_penalty when both set", () => {
    expect(mapOptions({ frequency_penalty: 0.5, repeat_penalty: 1.1 })).toMatchObject({
      frequency_penalty: 0.5,
    });
  });

  it("ignores unknown keys", () => {
    const result = mapOptions({ unknown_param: 999 } as Record<string, unknown>);
    expect(result).not.toHaveProperty("unknown_param");
  });

  it("maps multiple options at once", () => {
    const result = mapOptions({ temperature: 0.8, num_predict: 100, seed: 7 });
    expect(result).toEqual({ temperature: 0.8, max_tokens: 100, seed: 7 });
  });
});
