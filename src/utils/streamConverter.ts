const encoder = new TextEncoder();

interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
}

/**
 * Takes the raw ReadableStream from an OpenAI /v1/chat/completions or /v1/completions
 * streaming response and returns a new ReadableStream that emits Ollama-compatible
 * NDJSON lines (newline-delimited JSON).
 *
 * @param openaiStream  The raw response body from LMStudio.
 * @param isChat        true → chat mode (message.content), false → generate mode (response).
 * @param model         Model name to include in each chunk.
 */
export function convertStream(
  openaiStream: ReadableStream<Uint8Array>,
  isChat: boolean,
  model: string,
): ReadableStream<Uint8Array> {
  const reader = openaiStream.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let lastUsage: UsageInfo | undefined;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Split on newlines; keep incomplete last line in buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") {
              if (trimmed === "data: [DONE]") {
                // Emit the final done chunk with usage info
                const finalChunk: Record<string, unknown> = {
                  model,
                  created_at: new Date().toISOString(),
                  done: true,
                  done_reason: "stop",
                  total_duration: 0,
                  load_duration: 0,
                  prompt_eval_count: lastUsage?.prompt_tokens ?? 0,
                  eval_count: lastUsage?.completion_tokens ?? 0,
                };

                if (isChat) {
                  finalChunk.message = { role: "assistant", content: "" };
                } else {
                  finalChunk.response = "";
                }

                controller.enqueue(encoder.encode(JSON.stringify(finalChunk) + "\n"));
              }
              continue;
            }

            if (!trimmed.startsWith("data: ")) continue;

            const jsonStr = trimmed.slice(6);
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(jsonStr);
            } catch {
              continue; // skip malformed chunks
            }

            // Capture usage if present (LMStudio sends it with stream_options.include_usage)
            if (parsed.usage) {
              lastUsage = parsed.usage as UsageInfo;
            }

            const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
            const choice = choices?.[0] ?? {};

            // Skip chunks without content (e.g. usage-only chunks)
            if (isChat) {
              const delta = (choice.delta as Record<string, unknown>) ?? {};
              const content = (delta.content as string) ?? "";
              // If this is a usage-only chunk with no content delta, skip emitting
              if (!choices?.length && parsed.usage) continue;

              const chunk: Record<string, unknown> = {
                model,
                created_at: new Date().toISOString(),
                done: false,
                message: {
                  role: "assistant",
                  content,
                },
              };
              controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
            } else {
              const text = (choice.text as string) ?? "";
              if (!choices?.length && parsed.usage) continue;

              const chunk: Record<string, unknown> = {
                model,
                created_at: new Date().toISOString(),
                done: false,
                response: text,
              };
              controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
            }
          }
        }

        // Flush any remaining buffered line (e.g. [DONE] not followed by a trailing newline)
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed === "data: [DONE]") {
            const finalChunk: Record<string, unknown> = {
              model,
              created_at: new Date().toISOString(),
              done: true,
              done_reason: "stop",
              total_duration: 0,
              load_duration: 0,
              prompt_eval_count: lastUsage?.prompt_tokens ?? 0,
              eval_count: lastUsage?.completion_tokens ?? 0,
            };

            if (isChat) {
              finalChunk.message = { role: "assistant", content: "" };
            } else {
              finalChunk.response = "";
            }

            controller.enqueue(encoder.encode(JSON.stringify(finalChunk) + "\n"));
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });
}
