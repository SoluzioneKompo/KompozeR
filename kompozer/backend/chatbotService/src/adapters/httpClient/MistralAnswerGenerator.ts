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
}

type MistralChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

/**
 * Generates chatbot answers with the Mistral chat-completions API, grounded on
 * the retrieved catalog items and CAD configuration context (RAG).
 */
export class MistralAnswerGenerator implements AnswerGenerator {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: MistralAnswerGeneratorOptions) {
    if (!options.apiKey?.trim()) {
      throw new Error('MistralAnswerGenerator requires an API key');
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'mistral-small-latest';
    this.baseUrl = options.baseUrl ?? 'https://api.mistral.ai';
    this.timeoutMs = options.timeoutMs ?? 15000;
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

    const payload = await this.postJson<MistralChatResponse>('/v1/chat/completions', body);
    const answer = payload.choices?.[0]?.message?.content;

    if (typeof answer !== 'string' || !answer.trim()) {
      throw new Error('Mistral returned an empty answer');
    }

    return answer.trim();
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
    const parts: string[] = [`Domanda dell'utente: ${context.question}`];

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
              reject(new Error(`Mistral API returned ${status}`));
              return;
            }

            try {
              resolve(JSON.parse(raw) as T);
            } catch {
              reject(new Error('Invalid JSON from Mistral API'));
            }
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Mistral API request timed out'));
      });

      req.on('error', () => {
        reject(new Error('Mistral API request failed'));
      });

      req.write(body);
      req.end();
    });
  }
}
