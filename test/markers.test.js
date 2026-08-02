import { describe, expect, it } from 'vitest';

import markers from '../src/markers.js';

const anna = { id: 'u1', name: 'Anna Beispiel' };
const max = { id: 'u2', name: 'Max Muster' };

function kommentar(overrides = {}) {
  return {
    id: 'c1',
    frame: 100,
    body: 'Hier bitte einen Frame früher schneiden',
    author: anna,
    resolvedAt: null,
    replies: [],
    ...overrides,
  };
}

describe('Gruppieren', () => {
  it('fasst mehrere Kommentare auf demselben Bild zusammen – Resolve lässt nur einen Marker je Frame zu', () => {
    const gruppen = markers.groupByFrame([
      kommentar({ id: 'a', frame: 100 }),
      kommentar({ id: 'b', frame: 100, author: max }),
      kommentar({ id: 'c', frame: 250 }),
    ]);

    expect(gruppen).toHaveLength(2);
    expect(gruppen[0].frame).toBe(100);
    expect(gruppen[0].comments).toHaveLength(2);
    expect(gruppen[1].frame).toBe(250);
  });

  it('legt allgemeine Kommentare auf das erste Bild – oder lässt sie weg', () => {
    const ohneFrame = [kommentar({ id: 'x', frame: null })];

    const mit = markers.groupByFrame(ohneFrame, { markGeneral: true });
    expect(mit).toHaveLength(1);
    expect(mit[0].frame).toBe(0);
    expect(mit[0].comments[0].general).toBe(true);

    expect(markers.groupByFrame(ohneFrame, { markGeneral: false })).toHaveLength(0);
  });
});

describe('Marker bauen', () => {
  const optionen = { versionId: 'v1', colorOpen: 'Pink', colorResolved: 'Rose' };

  it('schreibt Autor und Text, Antworten eingerückt', () => {
    const gruppe = markers.groupByFrame([
      kommentar({
        replies: [{ id: 'r1', body: 'Ist geändert', author: max }],
      }),
    ])[0];

    const marker = markers.buildMarker(gruppe, optionen);
    expect(marker.note).toBe(
      'Anna Beispiel: Hier bitte einen Frame früher schneiden\n  ↳ Max Muster: Ist geändert',
    );
    expect(marker.name).toBe('Anna Beispiel');
    expect(marker.color).toBe('Pink');
  });

  it('kürzt den Namen bei mehreren Autoren', () => {
    const gruppe = markers.groupByFrame([
      kommentar({ id: 'a' }),
      kommentar({ id: 'b', author: max }),
      kommentar({ id: 'c', author: { id: 'u3', name: 'Tim' } }),
    ])[0];

    expect(markers.buildMarker(gruppe, optionen).name).toBe('Anna Beispiel +2');
  });

  it('färbt nur dann Rose, wenn an dieser Stelle nichts mehr offen ist', () => {
    const gemischt = markers.groupByFrame([
      kommentar({ id: 'a', resolvedAt: '2026-08-01T10:00:00.000Z' }),
      kommentar({ id: 'b' }),
    ])[0];
    expect(markers.buildMarker(gemischt, optionen).color).toBe('Pink');

    const alleErledigt = markers.groupByFrame([
      kommentar({ id: 'a', resolvedAt: '2026-08-01T10:00:00.000Z' }),
    ])[0];
    expect(markers.buildMarker(alleErledigt, optionen).color).toBe('Rose');
  });

  it('verschiebt um den Render-Anfang', () => {
    const gruppe = markers.groupByFrame([kommentar({ frame: 100 })])[0];
    expect(markers.buildMarker(gruppe, { ...optionen, renderIn: 500 }).frame).toBe(600);
  });
});

describe('customData', () => {
  const optionen = { versionId: 'v1', colorOpen: 'Pink', colorResolved: 'Rose' };

  it('trägt Fassung, Frame und die enthaltenen Kommentar-IDs', () => {
    const gruppe = markers.groupByFrame([
      kommentar({ id: 'a', replies: [{ id: 'r1', body: 'ok', author: max }] }),
    ])[0];
    const marker = markers.buildMarker(gruppe, optionen);

    const gelesen = markers.parseCustomData(marker.customData);
    expect(gelesen.versionId).toBe('v1');
    expect(gelesen.commentFrame).toBe(100);
    expect(gelesen.ids).toEqual(['a', 'r1']);
    expect(gelesen.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('erkennt fremde Marker nicht als eigene', () => {
    expect(markers.parseCustomData('')).toBeNull();
    expect(markers.parseCustomData('irgendwas anderes')).toBeNull();
    expect(markers.isOurs({ customData: 'notiz vom schnitt' })).toBe(false);
  });
});

describe('Abgleich planen', () => {
  const optionen = { versionId: 'v1', colorOpen: 'Pink', colorResolved: 'Rose' };

  const bau = (comments) =>
    markers.groupByFrame(comments).map((gruppe) => markers.buildMarker(gruppe, optionen));

  it('legt neue an und lässt unveränderte in Ruhe', () => {
    const gewuenscht = bau([kommentar()]);
    expect(markers.planSync([], gewuenscht).add).toHaveLength(1);

    const vorhanden = [
      { frame: 100, color: 'Pink', customData: gewuenscht[0].customData },
    ];
    const plan = markers.planSync(vorhanden, gewuenscht);
    expect(plan.keep).toHaveLength(1);
    expect(plan.add).toHaveLength(0);
    expect(plan.replace).toHaveLength(0);
  });

  it('ersetzt, wenn sich der Text geändert hat', () => {
    const alt = bau([kommentar()]);
    const neu = bau([kommentar({ body: 'Doch zwei Frames früher' })]);

    const plan = markers.planSync(
      [{ frame: 100, color: 'Pink', customData: alt[0].customData }],
      neu,
    );
    expect(plan.replace).toHaveLength(1);
    expect(plan.keep).toHaveLength(0);
  });

  it('entfernt Marker, zu denen es keinen Kommentar mehr gibt – so verschwinden gelöschte', () => {
    const alt = bau([kommentar()]);
    const plan = markers.planSync(
      [{ frame: 100, color: 'Pink', customData: alt[0].customData }],
      [],
    );
    expect(plan.remove).toHaveLength(1);
  });

  it('fasst fremde Marker nicht an', () => {
    const plan = markers.planSync([{ frame: 42, color: 'Blue', customData: 'Schnittnotiz' }], []);
    expect(plan.remove).toHaveLength(0);
  });
});

describe('Aufräumen erkennt die eigenen Marker', () => {
  const optionen = { versionId: 'v1', colorOpen: 'Pink', colorResolved: 'Rose' };
  const eigener = markers.buildMarker(markers.groupByFrame([kommentar()])[0], optionen);

  it('erkennt sie an der customData', () => {
    expect(markers.isOurs({ customData: eigener.customData })).toBe(true);
  });

  it('erkennt sie nicht an der Farbe allein', () => {
    // Sonst risse das Aufräumen jede pinke Schnittnotiz mit – deshalb ist die
    // Farbe nur der Rückfall, und der greift erst, wenn Resolve die Kennung
    // an **keinem** Marker herausgibt.
    expect(markers.isOurs({ color: 'Pink', customData: '' })).toBe(false);
  });
});
