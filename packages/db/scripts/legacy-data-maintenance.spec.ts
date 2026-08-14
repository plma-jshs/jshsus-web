import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { decodeCloudflareEmail, decodeHtmlEntities, decodeJsonStrings } =
  require('./html-entities.cjs') as {
    decodeCloudflareEmail: (value: unknown) => string | null;
    decodeHtmlEntities: (value: unknown) => string;
    decodeJsonStrings: (value: unknown) => unknown;
  };
const { htmlSegmentToTextLines } = require('./import-legacy-site-data.cjs') as {
  htmlSegmentToTextLines: (value: unknown) => string[];
};
const { buildContentPlan } = require('./normalize-board-content.cjs') as {
  buildContentPlan: (
    posts: Array<{
      id: number;
      publicNo: number;
      title: string;
      content: string;
      contentJson: unknown;
    }>,
    comments: Array<{ id: number; content: string }>,
  ) => {
    postUpdates: Array<{ id: number; title: string; content: string; contentJson: unknown }>;
    commentUpdates: Array<{ id: number; content: string }>;
    publicNumberUpdates: Array<{ id: number; publicNo: number }>;
  };
};
const {
  createReasonPlan,
  createRecordPlan,
  pointFromHistory,
  recordsMissingFromTarget,
  safeDateOnly,
} = require('./migrate-legacy-points.cjs') as {
  createReasonPlan: (
    reasons: Array<Record<string, unknown>>,
    history: Array<Record<string, unknown>>,
  ) => {
    definitions: Map<string, unknown>;
    reasonKeyByLegacyId: Map<number, string>;
    adjustmentReasonKeysByHistoryId: Map<number, { plus?: string; minus?: string }>;
  };
  createRecordPlan: (
    history: Array<Record<string, unknown>>,
    reasonKeys: Map<number, string>,
    students: Map<number, number>,
    teachers: Map<number, number>,
    adjustmentReasons?: Map<number, { plus?: string; minus?: string }>,
  ) => {
    records: Array<Record<string, unknown>>;
    missingStudentNos: Set<number>;
    missingTeacherIds: Set<number>;
    reconciliationRecords: number;
  };
  pointFromHistory: (history: Record<string, unknown>) => number;
  recordsMissingFromTarget: (
    records: Array<Record<string, unknown>>,
    existing: Map<string, number>,
  ) => Array<Record<string, unknown>>;
  safeDateOnly: (value: unknown) => string | null;
};

describe('legacy HTML entity cleanup', () => {
  it('decodes numeric, named, missing-semicolon, and double-encoded entities', () => {
    expect(
      decodeHtmlEntities(
        'A &#039;quote&#039; &quot;word&quot; &quot text &quot &amp;quot;ok&amp;quot;',
      ),
    ).toBe('A \'quote\' "word" " text " "ok"');
  });

  it('does not treat the start of an ordinary word as a named entity', () => {
    expect(decodeHtmlEntities('R&D &amplitude')).toBe('R&D &amplitude');
  });

  it('decodes strings nested in rich-text JSON', () => {
    expect(decodeJsonStrings({ type: 'text', text: '&quot;hello&quot;' })).toEqual({
      type: 'text',
      text: '"hello"',
    });
  });

  it('decodes Cloudflare-protected email addresses before HTML stripping', () => {
    expect(decodeCloudflareEmail('cba1b8a3b8bea5a2a4a58baca6aaa2a7e5a8a4a6')).toBe(
      'jshsunion@gmail.com',
    );
  });

  it('restores Cloudflare-protected emails while converting legacy HTML', () => {
    expect(
      htmlSegmentToTextLines(
        '<p>문의 <a class="__cf_email__" data-cfemail="cba1b8a3b8bea5a2a4a58baca6aaa2a7e5a8a4a6">[email protected]</a>&nbsp;&gt;</p>',
      ),
    ).toEqual(['문의 jshsunion@gmail.com >']);
  });
});

describe('free-board content maintenance', () => {
  it('plans entity cleanup and chronological numbering from one', () => {
    const plan = buildContentPlan(
      [
        {
          id: 1,
          publicNo: 676,
          title: '&#039;first&#039;',
          content: '&quot;body&quot;',
          contentJson: { type: 'doc', content: [{ type: 'text', text: '&amp;quot;x&amp;quot;' }] },
        },
        { id: 2, publicNo: 677, title: 'second', content: 'clean', contentJson: null },
      ],
      [{ id: 3, content: '&quot reply &quot' }],
    );

    expect(plan.postUpdates).toEqual([
      {
        id: 1,
        title: "'first'",
        content: '"body"',
        contentJson: { type: 'doc', content: [{ type: 'text', text: '"x"' }] },
      },
    ]);
    expect(plan.commentUpdates).toEqual([{ id: 3, content: '" reply "' }]);
    expect(plan.publicNumberUpdates).toEqual([
      { id: 1, publicNo: 1 },
      { id: 2, publicNo: 2 },
    ]);
  });
});

describe('legacy point migration policy', () => {
  const history = {
    id: 10,
    date: '2026-03-01',
    act_date: '2026-03-02 10:20:30',
    teacher: 2,
    user: 1101,
    beforeplus: 3,
    afterplus: 3,
    beforeminus: 1,
    afterminus: 4,
    reason: 99,
    reason_caption: '벌점 &quot;사유&quot;',
    display: 1,
  };

  it('preserves the signed point delta and action date', () => {
    expect(pointFromHistory(history)).toBe(-3);
    expect(safeDateOnly(history.act_date)).toBe('2026-03-02');
    expect(safeDateOnly('2026-02-31')).toBeNull();
  });

  it('creates inactive synthetic reasons and maps students and staff', () => {
    const reasonPlan = createReasonPlan([], [history]);
    const recordPlan = createRecordPlan(
      [history],
      reasonPlan.reasonKeyByLegacyId,
      new Map([[1101, 7]]),
      new Map([[2, 8]]),
    );

    expect(reasonPlan.definitions.size).toBe(1);
    expect([...reasonPlan.definitions.values()]).toEqual([
      { type: 'MINUS', point: -3, comment: '벌점 "사유"', isActive: false },
    ]);
    expect(recordPlan.missingStudentNos.size).toBe(0);
    expect(recordPlan.missingTeacherIds.size).toBe(0);
    expect(recordPlan.records[0]).toMatchObject({
      studentId: 7,
      teacherId: 8,
      point: -3,
      reasonType: 'MINUS',
      reasonText: '벌점 "사유"',
      baseDate: '2026-03-02',
      createdAt: '2026-03-01',
    });
    expect(recordsMissingFromTarget(recordPlan.records, new Map())).toHaveLength(1);
  });

  it('adds category-preserving records when consecutive legacy balances do not connect', () => {
    const nextHistory = {
      ...history,
      id: 11,
      date: '2026-03-03',
      beforeplus: 5,
      afterplus: 6,
      beforeminus: 2,
      afterminus: 3,
    };
    const reasonPlan = createReasonPlan([], [history, nextHistory]);
    const recordPlan = createRecordPlan(
      [history, nextHistory],
      reasonPlan.reasonKeyByLegacyId,
      new Map([[1101, 7]]),
      new Map([[2, 8]]),
      reasonPlan.adjustmentReasonKeysByHistoryId,
    );

    expect(recordPlan.reconciliationRecords).toBe(2);
    expect(recordPlan.records).toHaveLength(4);
    expect(recordPlan.records[1]).toMatchObject({
      reasonType: 'PLUS',
      reasonText: '기존 상점 기준 조정',
      point: 2,
    });
    expect(recordPlan.records[2]).toMatchObject({
      reasonType: 'MINUS',
      reasonText: '기존 벌점 기준 조정',
      point: 2,
    });
  });
});
