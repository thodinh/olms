const encoder = new TextEncoder();

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
                // Emit the final done chunk
                const finalChunk = {
                  model,
                  created_at: new Date().toISOString(),
                  done: true,
                  done_reason: "stop",
                };
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

            const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
            const choice = choices?.[0] ?? {};

            const chunk: Record<string, unknown> = {
              model,
              created_at: new Date().toISOString(),
              done: false,
            };

            if (isChat) {
              const delta = (choice.delta as Record<string, unknown>) ?? {};
              chunk.message = {
                role: "assistant",
                content: (delta.content as string) ?? "",
              };
            } else {
              chunk.response = (choice.text as string) ?? "";
            }

            controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
          }
        }

        // Flush any remaining buffered line (e.g. [DONE] not followed by a trailing newline)
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed === "data: [DONE]") {
            const finalChunk = {
              model,
              created_at: new Date().toISOString(),
              done: true,
              done_reason: "stop",
            };
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
