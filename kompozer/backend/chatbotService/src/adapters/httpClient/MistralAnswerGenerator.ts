import http from 'http';
import https from 'https';
import { URL } from 'url';
import {
  AnswerGenerationContext,
  AnswerGenerator,
} from '../../domain/ports/AnswerGenerator';

/** Configuration for the Mistral-backed answer generator. */
export interface MistralAnswerGeneratorOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Max transient-failure retries (network/5xx/429/timeout). Default 2. */
  maxRetries?: number;
  /** Guardrail: max characters of the user question forwarded to the LLM. Default 2000. */
  maxQuestionChars?: number;
  /** Guardrail: max characters kept from the LLM answer. Default 2000. */
  maxAnswerChars?: number;
}

type MistralChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

/** Error carrying whether a failed Mistral request is worth retrying. */
class MistralRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MistralRequestError';
  }
}

/**
 * Generates chatbot answers with the Mistral chat-completions API, grounded on
 * the retrieved catalog items and CAD configuration context (RAG).
 */
export class MistralAnswerGenerator implements AnswerGenerator {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxQuestionChars: number;
  private readonly maxAnswerChars: number;

  constructor(options: MistralAnswerGeneratorOptions) {
    if (!options.apiKey?.trim()) {
      throw new Error('MistralAnswerGenerator requires an API key');
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'mistral-small-latest';
    this.baseUrl = options.baseUrl ?? 'https://api.mistral.ai';
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.maxRetries = options.maxRetries ?? 2;
    this.maxQuestionChars = options.maxQuestionChars ?? 2000;
    this.maxAnswerChars = options.maxAnswerChars ?? 2000;
  }

  async generate(context: AnswerGenerationContext): Promise<string> {
    const body = JSON.stringify({
      model: this.model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: 'system', content: this.buildSystemPrompt() },
        { role: 'user', content: this.buildUserPrompt(context) },
      ],
    });

    const startedAt = Date.now();
    let attempt = 0;

    for (;;) {
      attempt += 1;
      try {
        const payload = await this.postJson<MistralChatResponse>('/v1/chat/completions', body);
        const raw = payload.choices?.[0]?.message?.content;

        if (typeof raw !== 'string' || !raw.trim()) {
          throw new MistralRequestError('Mistral returned an empty answer', false);
        }

        const usage = payload.usage;
        console.log(
          `[chatbot][llm] ok model=${this.model} attempt=${attempt} latencyMs=${Date.now() - startedAt} ` +
            `promptTokens=${usage?.prompt_tokens ?? '?'} completionTokens=${usage?.completion_tokens ?? '?'} ` +
            `totalTokens=${usage?.total_tokens ?? '?'}`,
        );
        return this.applyOutputGuardrail(raw);
      } catch (error) {
        const retryable = error instanceof MistralRequestError ? error.retryable : false;
        const message = error instanceof Error ? error.message : 'unknown error';

        if (retryable && attempt <= this.maxRetries) {
          const backoffMs = 200 * attempt;
          console.warn(
            `[chatbot][llm] retry attempt=${attempt}/${this.maxRetries} in ${backoffMs}ms reason="${message}"`,
          );
          await this.sleep(backoffMs);
          continue;
        }

        console.error(
          `[chatbot][llm] error model=${this.model} attempt=${attempt} latencyMs=${Date.now() - startedAt} reason="${message}"`,
        );
        throw error instanceof Error ? error : new Error(message);
      }
    }
  }

  /** Guardrail: trim and cap the answer to a safe maximum length. */
  private applyOutputGuardrail(answer: string): string {
    const trimmed = answer.trim();
    return trimmed.length > this.maxAnswerChars
      ? `${trimmed.slice(0, this.maxAnswerChars)}\u2026`
      : trimmed;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** System instruction: keep the assistant grounded and on-topic. */
  private buildSystemPrompt(): string {
    return [
      'Sei l\'assistente virtuale di KompozeR, un configuratore di mobili componibili.',
      'Rispondi in italiano, in modo conciso e cordiale.',
      'Basati esclusivamente sui dati del catalogo e della configurazione forniti nel messaggio utente.',
      'Non inventare prodotti, prezzi o disponibilita: se un dato non e presente, dillo chiaramente.',
      'I prezzi forniti sono in centesimi di euro: convertili e mostrali in euro.',
    ].join(' ');
  }

  /** Builds the grounded prompt from the retrieved context. */
  private buildUserPrompt(context: AnswerGenerationContext): string {
    const question =
      context.question.length > this.maxQuestionChars
        ? context.question.slice(0, this.maxQuestionChars)
        : context.question;
    const parts: string[] = [`Domanda dell'utente: ${question}`];

    if (context.configuration) {
      const cfg = context.configuration;
      parts.push(
        [
          'Configurazione attiva:',
          `categoria ${cfg.category ?? 'N/D'},`,
          `stato ${cfg.status},`,
          `colonne ${cfg.columnCount},`,
          `componenti ${cfg.componentCount}.`,
        ].join(' '),
      );
    }

    if (context.items.length > 0) {
      const lines = context.items.map((item) => {
        const availability = item.isAvailable ? 'disponibile' : 'non disponibile';
        return `- ${item.name} (SKU ${item.sku}): ${item.price} centesimi di euro, ${availability}`;
      });
      parts.push(`Componenti trovati nel catalogo:\n${lines.join('\n')}`);
    } else {
      parts.push('Nessun componente corrispondente trovato nel catalogo.');
    }

    return parts.join('\n\n');
  }

  /** Performs a POST request with a JSON body and decodes the JSON response. */
  private postJson<T>(path: string, body: string): Promise<T> {
    const url = new URL(path, this.baseUrl);

    return new Promise<T>((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(
        url,
        {
          method: 'POST',
          timeout: this.timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          const status = res.statusCode ?? 500;
          let raw = '';

          res.on('data', (chunk) => {
            raw += chunk.toString();
          });

          res.on('end', () => {
            if (status >= 400) {
              // 5xx and 429 are transient and worth retrying; other 4xx are not.
              const retryable = status >= 500 || status === 429;
              reject(new MistralRequestError(`Mistral API returned ${status}`, retryable, status));
              return;
            }

            try {
              resolve(JSON.parse(raw) as T);
            } catch {
              reject(new MistralRequestError('Invalid JSON from Mistral API', false));
            }
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new MistralRequestError('Mistral API request timed out', true));
      });

      req.on('error', () => {
        reject(new MistralRequestError('Mistral API request failed', true));
      });

      req.write(body);
      req.end();
    });
  }
}
