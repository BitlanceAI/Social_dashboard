import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanPhone, cleanPhones, rowApproverPhones } from './whatsapp.service.js';

test('Indian local and international phone formats normalize identically', () => {
    assert.equal(cleanPhone('6398792951'), '916398792951');
    assert.equal(cleanPhone('06398792951'), '916398792951');
    assert.equal(cleanPhone('+91 63987 92951'), '916398792951');
    assert.equal(cleanPhone('02079460018'), '02079460018');
});

test('legacy stored local approver numbers match the WhatsApp canonical format', () => {
    assert.deepEqual(
        rowApproverPhones({ approver_phones: ['06398792951', '916398792951'] }),
        ['916398792951'],
    );
});

test('approver input normalization deduplicates equivalent Indian formats', () => {
    assert.deepEqual(
        cleanPhones('06398792951, +91 6398792951'),
        ['916398792951'],
    );
});
