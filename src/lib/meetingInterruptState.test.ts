import { describe, expect, it } from "vitest";
import {
  INTERRUPT_HIGHLIGHT_MS,
  MAX_SAME_TARGET_INTERRUPTS,
  canInterrupt,
  createMeetingInterruptState,
  getHighlightRemainingMs,
  isInterruptHighlightActive,
  transitionMeetingInterruptState,
} from "./meetingInterruptState";

const T0 = 1_000;

function completeSpeech(memberId = 1) {
  let state = createMeetingInterruptState(T0);
  state = transitionMeetingInterruptState(state, {
    type: "speech-started",
    targetMemberId: memberId,
    nowMs: T0,
  });
  return transitionMeetingInterruptState(state, {
    type: "speech-completed",
    targetMemberId: memberId,
    nowMs: T0 + 500,
  });
}

describe("meeting interrupt state", () => {
  it("opens a highlighted interrupt window when speech completes", () => {
    const state = completeSpeech();

    expect(state.phase).toBe("interrupt-window");
    expect(getHighlightRemainingMs(state, T0 + 500)).toBe(
      INTERRUPT_HIGHLIGHT_MS,
    );
    expect(isInterruptHighlightActive(state, T0 + 500)).toBe(true);
    expect(canInterrupt(state, 1)).toBe(true);
  });

  it("keeps interruption available after the ten-second highlight ends", () => {
    let state = completeSpeech();
    state = transitionMeetingInterruptState(state, {
      type: "tick",
      nowMs: T0 + 500 + INTERRUPT_HIGHLIGHT_MS,
    });

    expect(state.phase).toBe("speaking");
    expect(isInterruptHighlightActive(state, T0 + 50_000)).toBe(false);
    expect(canInterrupt(state, 1)).toBe(true);
  });

  it("does not accept an interruption before a speech completes", () => {
    let state = createMeetingInterruptState(T0);
    state = transitionMeetingInterruptState(state, {
      type: "speech-started",
      targetMemberId: 1,
      nowMs: T0 + 100,
    });

    expect(canInterrupt(state, 1)).toBe(false);
    expect(
      transitionMeetingInterruptState(state, {
        type: "interrupt-submitted",
        targetMemberId: 1,
        nowMs: T0 + 200,
      }),
    ).toBe(state);
  });

  it("blocks another interruption until the target finishes responding", () => {
    let state = completeSpeech();
    state = transitionMeetingInterruptState(state, {
      type: "interrupt-submitted",
      targetMemberId: 1,
      nowMs: T0 + 20_000,
    });

    expect(state.interruptChainCount).toBe(1);
    expect(canInterrupt(state, 1)).toBe(false);
    expect(
      transitionMeetingInterruptState(state, {
        type: "interrupt-submitted",
        targetMemberId: 1,
        nowMs: T0 + 20_100,
      }),
    ).toBe(state);

    state = transitionMeetingInterruptState(state, {
      type: "speech-completed",
      targetMemberId: 1,
      nowMs: T0 + 21_000,
    });
    expect(canInterrupt(state, 1)).toBe(true);
  });

  it("freezes and restores the interrupt-window countdown", () => {
    let state = completeSpeech();
    state = transitionMeetingInterruptState(state, {
      type: "pause",
      nowMs: T0 + 3_500,
    });

    expect(state.phase).toBe("paused");
    expect(getHighlightRemainingMs(state, T0 + 100_000)).toBe(7_000);
    expect(canInterrupt(state, 1)).toBe(false);

    state = transitionMeetingInterruptState(state, {
      type: "resume",
      nowMs: T0 + 100_000,
    });
    expect(state.phase).toBe("interrupt-window");
    expect(getHighlightRemainingMs(state, T0 + 100_000)).toBe(7_000);
    expect(getHighlightRemainingMs(state, T0 + 101_000)).toBe(6_000);
  });

  it("counts same-target interruptions through follow-up responses and rejects a fourth", () => {
    let state = completeSpeech();

    for (let count = 1; count <= MAX_SAME_TARGET_INTERRUPTS; count += 1) {
      state = transitionMeetingInterruptState(state, {
        type: "interrupt-submitted",
        targetMemberId: 1,
        nowMs: T0 + count * 20_000,
      });
      expect(state.interruptChainCount).toBe(count);
      state = transitionMeetingInterruptState(state, {
        type: "speech-completed",
        targetMemberId: 1,
        nowMs: T0 + count * 20_000 + 500,
      });
    }

    expect(canInterrupt(state, 1)).toBe(false);
    const rejected = transitionMeetingInterruptState(state, {
      type: "interrupt-submitted",
      targetMemberId: 1,
      nowMs: T0 + 80_000,
    });
    expect(rejected).toBe(state);
    expect(rejected.interruptChainCount).toBe(MAX_SAME_TARGET_INTERRUPTS);
  });

  it("resets the chain when a different member starts speaking", () => {
    let state = completeSpeech(1);
    state = transitionMeetingInterruptState(state, {
      type: "interrupt-submitted",
      targetMemberId: 1,
      nowMs: T0 + 20_000,
    });
    state = transitionMeetingInterruptState(state, {
      type: "speech-started",
      targetMemberId: 2,
      nowMs: T0 + 21_000,
    });

    expect(state.targetMemberId).toBe(2);
    expect(state.interruptChainCount).toBe(0);
  });

  it("ignores invalid target and phase transitions safely", () => {
    const initial = createMeetingInterruptState(T0);
    expect(
      transitionMeetingInterruptState(initial, {
        type: "resume",
        nowMs: T0 + 1,
      }),
    ).toBe(initial);

    const windowState = completeSpeech(1);
    expect(
      transitionMeetingInterruptState(windowState, {
        type: "interrupt-submitted",
        targetMemberId: 2,
        nowMs: T0 + 2_000,
      }),
    ).toBe(windowState);
  });
});
