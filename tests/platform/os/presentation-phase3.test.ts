import {
  isPresentationLazyPayload,
  mergeExpandedRouteAtIndex,
  presentationDirectionNeedsExpansion,
  resolvePresentationExpandMode,
  routeHasSlides,
} from '../../../src/platform/os/delivery/presentation-generation';

describe('presentation Phase 3 lazy expand', () => {
  it('coerces stale client lazy to full for pitch-deck creates', () => {
    expect(resolvePresentationExpandMode({})).toBe('full');
    expect(
      resolvePresentationExpandMode({
        presentationExpandMode: 'full',
        subtype: 'pitch-decks',
      }),
    ).toBe('full');
    expect(
      resolvePresentationExpandMode({
        presentationExpandMode: 'lazy',
        subtype: 'pitch-decks',
      }),
    ).toBe('full');
    expect(
      resolvePresentationExpandMode({
        presentationExpandMode: 'lazy',
        subtype: 'gifs',
      }),
    ).toBe('lazy');
    expect(
      resolvePresentationExpandMode({
        productAction: 'expand_presentation_route',
      }),
    ).toBe('single');
  });

  it('detects lazy concept payloads', () => {
    expect(
      isPresentationLazyPayload({
        concepts: [{ title: 'A', description: 'd', narrativeAngle: 'm' }],
        presentationMeta: { lazyExpand: true, grounding: [], verifyPassed: true },
      }),
    ).toBe(true);
  });

  it('knows when a direction still needs expansion', () => {
    const data = {
      concepts: [
        { title: 'Heritage', description: 'DiVastra ethnic', narrativeAngle: 'Peach' },
        { title: 'Growth', description: 'Digital', narrativeAngle: 'Modern' },
        { title: 'Brand', description: 'Palette', narrativeAngle: 'Soft' },
      ],
    };
    expect(presentationDirectionNeedsExpansion(data, 1)).toBe(true);
    expect(routeHasSlides(data, 0)).toBe(false);
    const merged = mergeExpandedRouteAtIndex({
      data,
      index: 0,
      route: {
        title: 'Heritage',
        description: 'DiVastra ethnic',
        deckTitle: 'DiVastra Heritage',
        deckSubtitle: 'Peach',
        slides: [{ title: 'Intro', bullets: ['a', 'b'], layout: 'title_hero', notes: '', visualCue: 'x' }],
      },
    });
    expect(routeHasSlides(merged, 0)).toBe(true);
    expect(presentationDirectionNeedsExpansion(merged, 0)).toBe(false);
    expect(presentationDirectionNeedsExpansion(merged, 1)).toBe(true);
  });
});
