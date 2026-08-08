import { describe, expect, it } from 'vitest';

import {
  buildSubmittedLeadsCsv,
  type SubmittedLeadExportRow,
} from '@/app/lib/submitted-leads-csv';

function row(overrides: Partial<SubmittedLeadExportRow> = {}): SubmittedLeadExportRow {
  return {
    submittedAt: '2026-08-08T10:00:00.000Z',
    submissionId: 'submission-1',
    name: 'Test Customer',
    phone: '+919999999999',
    city: 'Chennai',
    propertyType: 'OWN',
    mapsLocation: 'https://maps.app.goo.gl/example',
    callLeadId: 'call-1',
    callLeadStatus: 'NEW',
    assignedAgent: '',
    email: '',
    language: '',
    provider: '',
    requirement: '',
    notes: '',
    firstCompanyPhone: '',
    lastCompanyPhone: '',
    lastContactedAt: '',
    nextFollowUpAt: '',
    locationSent: 'Yes',
    whatsappLeadId: 'wa-1',
    whatsappAccount: 'Website Sales Phone WhatsApp',
    messageStatus: 'FORM_SUBMITTED',
    messageSentAt: '',
    sheetSyncedAt: '',
    sheetSyncWarning: '',
    ...overrides,
  };
}

describe('submitted leads CSV', () => {
  it('quotes commas and embedded quotes', () => {
    const quote = String.fromCharCode(34);
    const csv = buildSubmittedLeadsCsv([
      row({ name: 'Customer, ' + quote + 'North' + quote }),
    ]);
    expect(csv).toContain(
      quote + 'Customer, ' + quote + quote + 'North' + quote + quote + quote,
    );
  });

  it('neutralizes spreadsheet formulas', () => {
    const csv = buildSubmittedLeadsCsv([row({ name: '=2+2' })]);
    expect(csv).toContain('\'=2+2');
  });

  it('uses one row per submitted form', () => {
    const csv = buildSubmittedLeadsCsv([
      row(),
      row({ submissionId: 'submission-2' }),
    ]);
    expect(csv.split('\r\n')).toHaveLength(3);
  });
});
