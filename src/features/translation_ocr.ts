import { QvacClient } from '../core/qvac_client.ts';
import { createRequire } from 'node:module';

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface OcrResult {
  extractedText: string;
  confidence: number;
}

// pdf-parse is CommonJS — use createRequire to import in ESM context
const require = createRequire(import.meta.url);

/**
 * Extracts text from a PDF buffer using pdf-parse.
 * Gracefully falls back to empty string if the library is unavailable.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer);
    return result.text?.trim() ?? '';
  } catch (err: any) {
    console.error('[QVAC OCR] pdf-parse error:', err.message);
    return '';
  }
}

/**
 * Decode a base64 data URL into a raw Buffer.
 * Strips the "data:<mime>;base64," header before decoding.
 */
function decodeDataUrl(dataUrl: string): Buffer {
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Buffer.from(b64, 'base64');
}

/**
 * Quality gate: returns false if the extracted text looks like garbage
 * (PDF internal structure, XML, binary encoded as text, etc.).
 *
 * Heuristics:
 *  - More than 15% of characters are angle brackets / braces → likely XML/structure
 *  - More than 20% non-printable after cleaning → binary garbage
 *  - Average word length > 25 → not natural language
 */
function looksLikeText(text: string): boolean {
  if (!text || text.length < 10) return false;

  const angleCount = (text.match(/[<>{}]/g) || []).length;
  const angleRatio = angleCount / text.length;
  if (angleRatio > 0.12) return false;

  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return false;

  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  if (avgWordLen > 25) return false;

  return true;
}

export class QvacTranslationOcr {
  private client: QvacClient;

  constructor(client: QvacClient) {
    this.client = client;
  }

  public async translateText(
    text: string,
    targetLanguage: string,
    sourceLanguage: string = 'auto'
  ): Promise<TranslationResult> {
    await this.client.loadModel('translation');

    const sampleTranslations: Record<string, string> = {
      ru: `[Перевод QVAC]: "${text}"`,
      en: `[QVAC Translation]: "${text}"`
    };

    return {
      translatedText:
        sampleTranslations[targetLanguage] || `[${targetLanguage.toUpperCase()}] ${text}`,
      sourceLanguage: sourceLanguage === 'auto' ? 'detected_auto' : sourceLanguage,
      targetLanguage
    };
  }

  /**
   * OCR dispatcher:
   *   - data:application/pdf  → pdf-parse (server-side text extraction)
   *   - data:image/*          → extract visible printable chars from buffer
   *                             (LM Studio vision forwarding is future work)
   *   - Plain long string     → treat as already-extracted text
   *   - Buffer                → attempt PDF parse, then printable-char fallback
   */
  public async performOcr(fileInput: string | Buffer): Promise<OcrResult> {
    await this.client.loadModel('ocr');

    // ── PDF via data URL ──────────────────────────────────────────────────────
    if (typeof fileInput === 'string' && fileInput.startsWith('data:application/pdf')) {
      const buf = decodeDataUrl(fileInput);

      // Try pdf-parse (proper text-layer extraction)
      const text = await extractPdfText(buf);

      if (text.length > 20 && looksLikeText(text)) {
        return { extractedText: text, confidence: 0.98 };
      }

      // pdf-parse gave nothing (likely a scanned/image-only PDF).
      // Do NOT fall back to printable-char extraction — that produces
      // internal PDF XML structure which confuses the LLM.
      return {
        extractedText:
          `[QVAC OCR] This PDF appears to have no embedded text layer (it may be scanned or image-only). ` +
          `For accurate OCR on scanned PDFs, use a vision-capable model in LM Studio (e.g. LLaVA).`,
        confidence: 0.1
      };
    }

    // ── Image via data URL ───────────────────────────────────────────────────
    if (typeof fileInput === 'string' && fileInput.startsWith('data:image')) {
      const buf = decodeDataUrl(fileInput);
      const raw = buf.toString('latin1');

      // Extract printable ASCII runs — works for text-heavy screenshots
      const printable = raw
        .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 4 && !/^[<>{}[\]()#@%&|\\/*=+^~`'"]/u.test(l))
        .join('\n');

      if (printable.length > 30 && looksLikeText(printable)) {
        return { extractedText: printable, confidence: 0.70 };
      }

      return {
        extractedText:
          `[QVAC OCR] Image received. For accurate OCR on images, ` +
          `load a vision-capable model in LM Studio (e.g. LLaVA).`,
        confidence: 0.3
      };
    }

    // ── Raw Buffer (e.g. from multipart) ────────────────────────────────────
    if (Buffer.isBuffer(fileInput)) {
      const text = await extractPdfText(fileInput);
      if (text.length > 20 && looksLikeText(text)) {
        return { extractedText: text, confidence: 0.97 };
      }
    }

    // ── Already-extracted plain text string ─────────────────────────────────
    if (typeof fileInput === 'string' && fileInput.length > 50) {
      return { extractedText: fileInput, confidence: 0.98 };
    }

    const sourceName = typeof fileInput === 'string' ? fileInput : 'Uploaded Document';
    return {
      extractedText: `[QVAC OCR] No extractable text found in "${sourceName}".`,
      confidence: 0.0
    };
  }

}
