import { CadConfigurationSnapshot } from './CadConfigurationProvider';
import { CatalogQaItem } from './CatalogQaProvider';

/** Retrieval context passed to the LLM to ground the generated answer. */
export interface AnswerGenerationContext {
  question: string;
  items: CatalogQaItem[];
  configuration: CadConfigurationSnapshot | null;
}

/**
 * Contract for generating a natural-language chatbot answer from the
 * retrieved catalog and configuration context (LLM-backed).
 */
export interface AnswerGenerator {
  generate(context: AnswerGenerationContext): Promise<string>;
}
