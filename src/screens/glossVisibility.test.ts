// Unit tests for shouldShowGloss — the pure helper that maps (mode, missed, tappedReveal) -> boolean.
// TDD: write these BEFORE the implementation.
import { shouldShowGloss } from './glossVisibility';

describe('shouldShowGloss', () => {
  // auto — recognition scaffolding: gloss is always shown regardless of miss/tap state
  describe("mode: 'auto'", () => {
    it('shows when not missed and not tapped', () => {
      expect(shouldShowGloss('auto', false, false)).toBe(true);
    });
    it('shows when missed', () => {
      expect(shouldShowGloss('auto', true, false)).toBe(true);
    });
    it('shows when tappedReveal', () => {
      expect(shouldShowGloss('auto', false, true)).toBe(true);
    });
    it('shows when both missed and tapped', () => {
      expect(shouldShowGloss('auto', true, true)).toBe(true);
    });
  });

  // hint — recall scaffolding: gloss is hidden until a wrong answer is given
  describe("mode: 'hint'", () => {
    it('hides when not missed and not tapped', () => {
      expect(shouldShowGloss('hint', false, false)).toBe(false);
    });
    it('shows when missed (wrong pick revealed it)', () => {
      expect(shouldShowGloss('hint', true, false)).toBe(true);
    });
    it('hides when only tapped but not missed', () => {
      // tappedReveal does NOT trigger hint mode — only a miss does
      expect(shouldShowGloss('hint', false, true)).toBe(false);
    });
    it('shows when both missed and tapped', () => {
      expect(shouldShowGloss('hint', true, true)).toBe(true);
    });
  });

  // on-demand — production: gloss is hidden until the learner explicitly requests it
  describe("mode: 'on-demand'", () => {
    it('hides when not missed and not tapped', () => {
      expect(shouldShowGloss('on-demand', false, false)).toBe(false);
    });
    it('hides when only missed (wrong pick does not auto-reveal in production mode)', () => {
      expect(shouldShowGloss('on-demand', true, false)).toBe(false);
    });
    it('shows when tapped', () => {
      expect(shouldShowGloss('on-demand', false, true)).toBe(true);
    });
    it('shows when both missed and tapped', () => {
      expect(shouldShowGloss('on-demand', true, true)).toBe(true);
    });
  });
});
