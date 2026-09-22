import { parseArgs } from 'node:util';
import * as fs from 'node:fs';
import { QvacClient } from '../core/qvac_client.ts';
import { QvacLLM } from '../features/llm.ts';
import { QvacSpeech } from '../features/speech.ts';
import { QvacTranslationOcr } from '../features/translation_ocr.ts';
import { QvacRag } from '../features/rag.ts';
import { createOpenAIServer } from '../server/openai_server.ts';

const client = new QvacClient();
const llm = new QvacLLM(client);
const speech = new QvacSpeech(client);
const transOcr = new QvacTranslationOcr(client);
const rag = new QvacRag(client, llm);

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'info';

  switch (command) {
    case 'info': {
      console.log('=== Tether QVAC Local Engine Info ===');
      console.log(`Hardware Device: ${client.getHardwareDevice()}`);
      console.log(`Cache Directory: ${client.getConfig().qvac.cacheDir}`);
      console.log(`Quantization: ${client.getConfig().qvac.quantization}`);
      console.log(`Model LLM: ${client.getConfig().models.llm.name}`);
      break;
    }

    case 'llm': {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          prompt: { type: 'string', short: 'p' },
          system: { type: 'string', short: 's' }
        }
      });
      const prompt = values.prompt || 'Hello QVAC';
      console.log('🔄 Running QVAC Local LLM...');
      const messages = [];
      if (values.system) messages.push({ role: 'system' as const, content: values.system });
      messages.push({ role: 'user' as const, content: prompt });

      const response = await llm.generateChatCompletion(messages);
      console.log('\n--- Output ---');
      console.log(response.choices[0].message.content);
      console.log('\nTokens:', response.usage);
      break;
    }

    case 'stt': {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          file: { type: 'string', short: 'f' },
          lang: { type: 'string', short: 'l', default: 'auto' }
        }
      });
      const file = values.file || 'sample.wav';
      console.log(`🎙️ Running QVAC Local STT on ${file}...`);
      const result = await speech.speechToText(file, values.lang);
      console.log('\n--- Transcript ---');
      console.log(result.text);
      console.log(`Confidence: ${result.confidence}, Duration: ${result.durationSeconds}s`);
      break;
    }

    case 'tts': {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          text: { type: 'string', short: 't' },
          output: { type: 'string', short: 'o', default: 'output.wav' }
        }
      });
      const text = values.text || 'Local speech synthesis';
      console.log(`🗣️ Running QVAC Local TTS for text: "${text.slice(0, 30)}..."`);
      const result = await speech.textToSpeech(text);
      fs.writeFileSync(values.output || 'output.wav', result.audioBuffer);
      console.log(`✅ Speech saved to ${values.output} (${result.durationSeconds}s audio)`);
      break;
    }

    case 'translate': {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          text: { type: 'string', short: 't' },
          target: { type: 'string', short: 'l', default: 'ru' }
        }
      });
      const text = values.text || 'Hello world';
      console.log(`🌐 Translating text to ${values.target}...`);
      const result = await transOcr.translateText(text, values.target || 'ru');
      console.log('\n--- Result ---');
      console.log(result.translatedText);
      break;
    }

    case 'ocr': {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          image: { type: 'string', short: 'i' }
        }
      });
      const image = values.image || 'doc.png';
      console.log(`👁️ Running QVAC Local OCR on ${image}...`);
      const result = await transOcr.performOcr(image);
      console.log('\n--- Extracted Text ---');
      console.log(result.extractedText);
      break;
    }

    case 'rag': {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          query: { type: 'string', short: 'q' },
          doc: { type: 'string', short: 'd' }
        }
      });
      if (values.doc && fs.existsSync(values.doc)) {
        const content = fs.readFileSync(values.doc, 'utf8');
        console.log(`📚 Indexing document "${values.doc}"...`);
        const chunks = await rag.indexDocument(content, values.doc);
        console.log(`Indexed ${chunks} chunks.`);
      }

      const query = values.query || 'What is QVAC?';
      console.log(`🔍 Executing RAG query: "${query}"...`);
      const response = await rag.query(query);
      console.log('\n--- RAG Answer ---');
      console.log(response.answer);
      console.log('\n--- Sources ---');
      console.log(response.retrievedSources);
      break;
    }

    case 'server': {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          port: { type: 'string', short: 'p', default: '8080' }
        }
      });
      const { server, config, client: srvClient } = createOpenAIServer();
      const port = parseInt(values.port || '8080', 10) || config.server.port;
      server.listen(port, config.server.host, () => {
        console.log(`\n🚀 QVAC Local OpenAI-Compatible Server started on http://${config.server.host}:${port}/v1`);
        console.log(`⚡ Hardware: ${srvClient.getHardwareDevice()}\n`);
      });
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log('Available commands: info, llm, stt, tts, translate, ocr, rag, server');
  }
}

main().catch(err => {
  console.error('CLI Error:', err);
  process.exit(1);
});
