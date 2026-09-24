import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePipelineBrand, captionBrandContext, imageBrandContext } from '../src/modules/pipelines/pipeline-brand.mjs';

test('workspace identity supplies tone and colors to pipeline prompts', () => {
    const brand = resolvePipelineBrand({ client_name: 'Acme', tone_of_voice: 'Warm and direct', primary_color: '#123456', secondary_color: '#ABCDEF' }, 'Rahul Saini');
    assert.equal(brand.wordmark, 'Acme');
    assert.match(captionBrandContext(brand), /Warm and direct/);
    assert.match(imageBrandContext(brand), /#123456/);
    assert.match(imageBrandContext(brand), /template specifies different colors/);
});

test('a custom pipeline wordmark wins while absent brand fields add no instructions', () => {
    const brand = resolvePipelineBrand({ client_name: 'Acme' }, 'Campaign studio');
    assert.equal(brand.wordmark, 'Campaign studio');
    assert.doesNotMatch(captionBrandContext(brand), /tone of voice/);
    assert.equal(imageBrandContext(resolvePipelineBrand(null, 'Campaign studio')), '');
});
