import { randomUUID } from 'crypto';
import { ChatMessage } from '../domain/entities/ChatSession';
import {
  CatalogLookupError,
  ForbiddenError,
  SessionClosedError,
  SessionNotFoundError,
  ValidationError,
} from '../domain/entities/errors';
import { AnswerGenerator } from '../domain/ports/AnswerGenerator';
import { CadConfigurationProvider, CadConfigurationSnapshot } from '../domain/ports/CadConfigurationProvider';
import { CatalogQaItem, CatalogQaProvider } from '../domain/ports/CatalogQaProvider';
import { ChatRepository } from '../domain/ports/ChatRepository';
import { ChatMessageDto, toMessageDto } from './types';

/** Input required to append a message to a chatbot session. */
export interface SendSessionMessageInput {
  userId: string;
  sessionId: string;
  content: string;
}

export interface SendSessionMessageOutput {
  sessionId: string;
  userMessage: ChatMessageDto;
  botMessage: ChatMessageDto;
}

/** Saves the user message and generates the bot answer. */
export class SendSessionMessage {
  constructor(
    private readonly repo: ChatRepository,
    private readonly catalog: CatalogQaProvider,
    private readonly cad?: CadConfigurationProvider,
    private readonly answerGenerator?: AnswerGenerator,
  ) {}

  async execute(input: SendSessionMessageInput): Promise<SendSessionMessageOutput> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    if (!input.sessionId?.trim()) {
      throw new ValidationError('sessionId is required');
    }
    if (!input.content?.trim()) {
      throw new ValidationError('content is required');
    }

    const session = await this.repo.findSessionById(input.sessionId);
    if (!session) {
      throw new SessionNotFoundError(input.sessionId);
    }
    if (session.userId !== input.userId) {
      throw new ForbiddenError('Cannot send message to another user session');
    }
    if (session.status === 'CLOSED') {
      throw new SessionClosedError(input.sessionId);
    }

    const now = new Date();
    const userMessage: ChatMessage = {
      id: randomUUID(),
      sessionId: input.sessionId,
      role: 'USER',
      content: input.content.trim(),
      userId: input.userId,
      createdAt: now,
    };
    await this.repo.saveMessage(userMessage);

    const answer = await this.generateAnswer(input.content, session.userId, session.configurationId);
    const botMessage: ChatMessage = {
      id: randomUUID(),
      sessionId: input.sessionId,
      role: 'BOT',
      content: answer,
      createdAt: new Date(),
    };
    await this.repo.saveMessage(botMessage);

    await this.repo.updateSession({
      ...session,
      updatedAt: new Date(),
    });

    return {
      sessionId: input.sessionId,
      userMessage: toMessageDto(userMessage),
      botMessage: toMessageDto(botMessage),
    };
  }

  private async generateAnswer(
    question: string,
    userId: string,
    configurationId?: string,
  ): Promise<string> {
    const normalized = question.trim();

    const configurationContext =
      configurationId && this.cad ? await this.cad.getById(userId, configurationId) : null;

    const searchQuery =
      configurationContext?.category && normalized.length > 0
        ? `${normalized} ${configurationContext.category}`
        : normalized;

    let items;
    try {
      items = await this.catalog.search(searchQuery);
    } catch {
      throw new CatalogLookupError('Unable to retrieve catalog data for chatbot response');
    }

    const top = items.slice(0, 10);

    if (this.answerGenerator) {
      try {
        return await this.answerGenerator.generate({
          question: normalized,
          items: top,
          configuration: configurationContext,
        });
      } catch {
        // Fall back to the deterministic template answer below.
      }
    }

    return this.buildTemplateAnswer(top, configurationContext);
  }

  /** Deterministic answer used when no LLM is configured or the LLM fails. */
  private buildTemplateAnswer(
    items: CatalogQaItem[],
    configurationContext: CadConfigurationSnapshot | null,
  ): string {
    const contextPrefix = configurationContext
      ? `Contesto configurazione attiva: categoria ${configurationContext.category ?? 'N/D'}, stato ${configurationContext.status}, colonne ${configurationContext.columnCount}, componenti ${configurationContext.componentCount}.`
      : '';

    if (items.length === 0) {
      return `${contextPrefix}${contextPrefix ? '\n' : ''}Non trovo componenti corrispondenti alla tua domanda nel catalogo corrente.`;
    }

    const lines = items.map((item) => {
      const availability = item.isAvailable ? 'disponibile' : 'non disponibile';
      const euro = (item.price / 100).toFixed(2).replace('.', ',');
      return `- ${item.name} (${item.sku}): ${euro} EUR, ${availability}`;
    });

    return `${contextPrefix}${contextPrefix ? '\n' : ''}Ho trovato questi componenti nel catalogo:\n${lines.join('\n')}`;
  }
}
