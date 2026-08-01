import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createNotificationService, NodemailerNotificationService } from '../src/services/notificationService.js';
import { NotificationClaimLogger, type ClaimLogRecord } from '../src/services/claimLogger.js';

describe('Notification Service (P0)', () => {
  const sampleRecord: ClaimLogRecord = {
    claimNumber: 'CLM-20260801-0001',
    summary: 'Vehicle collided with pole on Main St.',
    timestamp: '2026-08-01T12:00:00.000Z',
    claim: {
      policyNumber: 'MMI-10234',
      callerName: 'Arjun Rao',
      dateOfIncident: '2026-08-01',
      timeOfIncident: '12:00',
      locationOfIncident: 'Main St',
      incidentDescription: 'Collided with pole',
    },
    verifiedPolicy: {
      policyNumber: 'MMI-10234',
      policyholderName: 'Arjun Rao',
      coverageType: 'Comprehensive',
      towingIncluded: true,
      vehicle: {
        make: 'Hyundai',
        model: 'i20',
        registration: 'TN58AB1234',
      },
    },
    conversationHistory: [],
    escalationRequired: false,
  };

  it('formats and dispatches simulated email confirmation successfully', async () => {
    const service = createNotificationService({
      defaultEmailTo: 'test-user@example.com',
      emailFrom: 'claims@meridianinsurance.com',
    });

    const result = await service.sendClaimConfirmation(sampleRecord);

    assert.equal(result.success, true);
    assert.equal(result.simulated, true);
    assert.ok(result.messageId);
  });

  it('handles urgent/escalated claim confirmation formatting', async () => {
    const service = createNotificationService();
    const urgentRecord: ClaimLogRecord = {
      ...sampleRecord,
      escalationRequired: true,
      summary: 'Severe accident with reported injuries.',
    };

    const result = await service.sendClaimConfirmation(urgentRecord);
    assert.equal(result.success, true);
  });

  it('persists claim first before attempting notification dispatch', async () => {
    let persistedFirst = false;
    let notificationSent = false;

    const mockLogger = {
      async log(record: ClaimLogRecord) {
        persistedFirst = true;
      },
    };

    const mockNotificationService = {
      async sendClaimConfirmation(record: ClaimLogRecord) {
        assert.equal(persistedFirst, true, 'Claim must be persisted before sending notification');
        notificationSent = true;
        return { success: true, simulated: true };
      },
    };

    const logger = new NotificationClaimLogger(mockLogger, mockNotificationService);
    await logger.log(sampleRecord);

    assert.equal(persistedFirst, true);
    assert.equal(notificationSent, true);
  });

  it('recovers gracefully if notification dispatch throws an error', async () => {
    const mockLogger = {
      async log() {},
    };

    const failingNotificationService = {
      async sendClaimConfirmation() {
        throw new Error('SMTP connection timed out');
      },
    };

    const logger = new NotificationClaimLogger(mockLogger, failingNotificationService);

    // Should NOT throw an exception
    await assert.doesNotReject(async () => {
      await logger.log(sampleRecord);
    });
  });
});
