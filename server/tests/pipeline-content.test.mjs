import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContentCSV, normalizeContentItem, buildPipelineImagePrompt } from '../src/shared/utils/pipeline-content.mjs';

test('standalone client and server builds use identical content parsing rules', async () => {
    assert.equal(await readFile(new URL('../src/shared/utils/pipeline-content.mjs', import.meta.url), 'utf8'),
        await readFile(new URL('../../client/src/features/pipelines/lib/pipeline-content.mjs', import.meta.url), 'utf8'));
});

test('CSV preserves quoted commas, multiline text, escaped quotes, BOM and CRLF', () => {
    const rows = parseContentCSV('\uFEFFPost Title / Hook,Content Pillar,Caption Outline,Status\r\n"One dashboard, every lead",Feature Highlight,"Line one, with commas\nSay ""hello""",Pending\r\n');
    const item = normalizeContentItem(rows[0]);
    assert.equal(item.titleHook, 'One dashboard, every lead');
    assert.equal(item.captionOutline, 'Line one, with commas\nSay "hello"');
    assert.equal(item.contentPillar, 'Feature Highlight');
    assert.equal(item.sourceStatus, 'Pending');
});

test('malformed CSV rejects shifted columns instead of silently truncating', () => {
    assert.throws(() => parseContentCSV('Title,Outline\nTopic,unquoted,comma'), /expected 2 columns/);
    assert.throws(() => parseContentCSV('Title,Outline\nTopic,"unclosed'), /unclosed/);
    assert.throws(() => parseContentCSV('Title,title\nA,B'), /unique/);
});

test('mapping accepts named aliases but never guesses the first column or a status', () => {
    assert.equal(normalizeContentItem({ title_hook: 'Reduce missed appointments', content_pillar: 'Features', caption_outline: 'Reminders' }).captionOutline, 'Reminders');
    assert.throws(() => normalizeContentItem({ Day: '1', Description: 'Topic' }), /missing/);
    assert.throws(() => normalizeContentItem({ titleHook: 'Topic', contentPillar: 'Pending' }), /workflow status/);
    assert.throws(() => normalizeContentItem({ titleHook: 'Feature Highlight', contentPillar: 'Features' }), /content category/);
});

test('image brief includes actual outline and caption while preserving custom branding', () => {
    const prompt = buildPipelineImagePrompt({ titleHook: 'Reduce no-shows', contentPillar: 'Features', captionOutline: 'Send reminders', caption: 'Let clients reschedule', brandLogoText: 'Bitlance', customTemplate: 'Indigo #3730A3. {{titleHook}}. {{brandLogoText}}. {{captionOutline}}' });
    assert.match(prompt, /Indigo #3730A3/);
    assert.match(prompt, /Send reminders/);
    assert.match(prompt, /Let clients reschedule/);
    assert.match(prompt, /Do not display category labels or workflow statuses/);
    assert.doesNotMatch(prompt, /\{\{/);
    assert.throws(() => buildPipelineImagePrompt({ customTemplate: '{{unknown}}' }), /Unsupported/);
});
