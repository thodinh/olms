import { describe, it, expect } from "bun:test";
import { stripTag, isEmbeddingModel, inferCapabilities } from "../src/utils/modelName.ts";

describe("stripTag()", () => {
  it("strips :latest", () => {
    expect(stripTag("llama3:latest")).toBe("llama3");
  });

  it("strips any tag", () => {
    expect(stripTag("llama3:8b")).toBe("llama3");
    expect(stripTag("qwen/qwen3-coder-next:latest")).toBe("qwen/qwen3-coder-next");
  });

  it("returns unchanged if no colon", () => {
    expect(stripTag("qwen3.5-4b-mlx")).toBe("qwen3.5-4b-mlx");
    expect(stripTag("")).toBe("");
  });
});

describe("isEmbeddingModel()", () => {
  it("detects embedding models", () => {
    expect(isEmbeddingModel("text-embedding-nomic-embed-text-v1.5")).toBe(true);
    expect(isEmbeddingModel("nomic-embed-text")).toBe(true);
    expect(isEmbeddingModel("bge-large-en-v1.5")).toBe(true);
    expect(isEmbeddingModel("all-MiniLM-L6-v2")).toBe(true);
  });

  it("does NOT flag chat models", () => {
    expect(isEmbeddingModel("qwen3.5-4b-mlx")).toBe(false);
    expect(isEmbeddingModel("qwen/qwen3-coder-next")).toBe(false);
    expect(isEmbeddingModel("deepseek/deepseek-r1-0528-qwen3-8b")).toBe(false);
    expect(isEmbeddingModel("llama3")).toBe(false);
  });
});

describe("inferCapabilities()", () => {
  it("returns ['embedding'] for embedding models", () => {
    expect(inferCapabilities("text-embedding-nomic-embed-text-v1.5")).toEqual(["embedding"]);
  });

  it("returns ['completion', 'chat'] for chat models", () => {
    expect(inferCapabilities("qwen/qwen3-coder-next")).toEqual(["completion", "chat"]);
    expect(inferCapabilities("llama3")).toEqual(["completion", "chat"]);
  });
});
