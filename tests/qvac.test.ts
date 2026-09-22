import { QvacClient } from '../src/core/qvac_client.ts';
import { QvacLLM } from '../src/features/llm.ts';
import { QvacSpeech } from '../src/features/speech.ts';
import { QvacTranslationOcr } from '../src/features/translation_ocr.ts';
import { QvacRag } from '../src/features/rag.ts';
import { createOpenAIServer } from '../src/server/openai_server.ts';
import assert from 'node:assert';

async function runTests() {
  console.log('🧪 Starting Tether QVAC Local Suite Test Suite...\n');

  // 1. Core Client Test
  console.log('Test 1: Initializing QvacClient...');
  const client = new QvacClient();
  const device = client.getHardwareDevice();
  console.log(`✓ Detected Hardware Device: ${device}`);
  assert.ok(device.length > 0, 'Hardware device detection failed');

  // 2. Local LLM Test
  console.log('\nTest 2: Testing QvacLLM Generation...');
  const llm = new QvacLLM(client);
  const llmRes = await llm.generateChatCompletion([
    { role: 'user', content: 'Hello QVAC!' }
  ]);
  console.log(`✓ LLM Response: ${llmRes.choices[0].message.content.slice(0, 60)}...`);
  assert.strictEqual(llmRes.object, 'chat.completion');

  // 3. Speech Test (STT & TTS)
  console.log('\nTest 3: Testing QvacSpeech (STT / TTS)...');
  const speech = new QvacSpeech(client);
  const sttRes = await speech.speechToText('sample.wav');
  console.log(`✓ STT Output: ${sttRes.text}`);
  assert.ok(sttRes.text.length > 0);

  const ttsRes = await speech.textToSpeech('Local speech generation sample');
  console.log(`✓ TTS Audio Buffer Generated: ${ttsRes.audioBuffer.length} bytes`);
  assert.ok(ttsRes.audioBuffer.length > 0);

  // 4. Translation & OCR Test
  console.log('\nTest 4: Testing QvacTranslationOcr...');
  const transOcr = new QvacTranslationOcr(client);
  const transRes = await transOcr.translateText('Hello world', 'ru');
  console.log(`✓ Translation Output: ${transRes.translatedText}`);
  assert.ok(transRes.translatedText.length > 0);

  const ocrRes = await transOcr.performOcr('document.png');
  console.log(`✓ OCR Output: ${ocrRes.extractedText.slice(0, 50)}...`);
  assert.ok(ocrRes.extractedText.length > 0);

  // 5. RAG Pipeline Test
  console.log('\nTest 5: Testing QvacRag...');
  const rag = new QvacRag(client, llm);
  await rag.indexDocument('QVAC provides local privacy-first AI execution on device without cloud APIs.', 'test.md');
  const ragRes = await rag.query('What is QVAC?');
  console.log(`✓ RAG Answer: ${ragRes.answer.slice(0, 60)}...`);
  assert.ok(ragRes.retrievedSources.length > 0);

  // 6. OpenAI Server Test
  console.log('\nTest 6: Testing createOpenAIServer HTTP instance...');
  const { server, config } = createOpenAIServer();
  assert.ok(server !== undefined, 'OpenAI HTTP server instance created successfully');
  assert.strictEqual(config.server.port, 8085);

  console.log('\n✅ ALL QVAC SUITE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
