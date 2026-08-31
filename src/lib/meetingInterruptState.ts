export const INTERRUPT_HIGHLIGHT_MS = 10_000;
export const MAX_SAME_TARGET_INTERRUPTS = 3;

export type MeetingInterruptActivePhase = "speaking" | "interrupt-window";
export type MeetingInterruptPhase = MeetingInterruptActivePhase | "paused";

type MeetingInterruptBaseState = {
  targetMemberId: number | null;
  interruptChainCount: number;
  interruptEligible: boolean;
  highlightRemainingMs: number;
  updatedAtMs: number;
};

export type MeetingInterruptActiveState = MeetingInterruptBaseState & {
  phase: MeetingInterruptActivePhase;
};

export type MeetingInterruptPausedState = MeetingInterruptBaseState & {
  phase: "paused";
  resumePhase: MeetingInterruptActivePhase;
};

export type MeetingInterruptState =
  | MeetingInterruptActiveState
  | MeetingInterruptPausedState;

export type MeetingInterruptEvent =
  | { type: "speech-started"; targetMemberId: number; nowMs: number }
  | { type: "speech-completed"; targetMemberId: number; nowMs: number }
  | { type: "interrupt-submitted"; targetMemberId: number; nowMs: number }
  | { type: "pause"; nowMs: number }
  | { type: "resume"; nowMs: number }
  | { type: "tick"; nowMs: number };

export function createMeetingInterruptState(nowMs: number): MeetingInterruptState {
  return {
    phase: "speaking",
    targetMemberId: null,
    interruptChainCount: 0,
    interruptEligible: false,
    highlightRemainingMs: 0,
    updatedAtMs: nowMs,
  };
}

function elapsedMs(state: MeetingInterruptState, nowMs: number): number {
  return Math.max(0, nowMs - state.updatedAtMs);
}

export function getHighlightRemainingMs(
  state: MeetingInterruptState,
  nowMs: number,
): number {
  if (state.phase === "paused") {
    return state.resumePhase === "interrupt-window"
      ? state.highlightRemainingMs
      : 0;
  }
  if (state.phase !== "interrupt-window") return 0;
  return Math.max(0, state.highlightRemainingMs - elapsedMs(state, nowMs));
}

export function isInterruptHighlightActive(
  state: MeetingInterruptState,
  nowMs: number,
): boolean {
  return getHighlightRemainingMs(state, nowMs) > 0;
}

export function canInterrupt(
  state: MeetingInterruptState,
  targetMemberId?: number,
): boolean {
  if (
    state.phase === "paused" ||
    state.targetMemberId === null ||
    !state.interruptEligible
  ) {
    return false;
  }
  if (targetMemberId !== undefined && state.targetMemberId !== targetMemberId) {
    return false;
  }
  return state.interruptChainCount < MAX_SAME_TARGET_INTERRUPTS;
}

function tick(
  state: MeetingInterruptState,
  nowMs: number,
): MeetingInterruptState {
  if (state.phase !== "interrupt-window") return state;
  const highlightRemainingMs = getHighlightRemainingMs(state, nowMs);
  if (highlightRemainingMs === 0) {
    return {
      phase: "speaking",
      targetMemberId: state.targetMemberId,
      interruptChainCount: state.interruptChainCount,
      interruptEligible: state.interruptEligible,
      highlightRemainingMs: 0,
      updatedAtMs: nowMs,
    };
  }
  return {
    ...state,
    highlightRemainingMs,
    updatedAtMs: nowMs,
  };
}

export function transitionMeetingInterruptState(
  state: MeetingInterruptState,
  event: MeetingInterruptEvent,
): MeetingInterruptState {
  switch (event.type) {
    case "speech-started":
      return {
        phase: "speaking",
        targetMemberId: event.targetMemberId,
        interruptChainCount:
          state.targetMemberId === event.targetMemberId
            ? state.interruptChainCount
            : 0,
        interruptEligible: false,
        highlightRemainingMs: 0,
        updatedAtMs: event.nowMs,
      };
    case "speech-completed":
      return {
        phase: "interrupt-window",
        targetMemberId: event.targetMemberId,
        interruptChainCount:
          state.targetMemberId === event.targetMemberId
            ? state.interruptChainCount
            : 0,
        interruptEligible: true,
        highlightRemainingMs: INTERRUPT_HIGHLIGHT_MS,
        updatedAtMs: event.nowMs,
      };
    case "interrupt-submitted":
      if (!canInterrupt(state, event.targetMemberId)) return state;
      return {
        phase: "speaking",
        targetMemberId: event.targetMemberId,
        interruptChainCount: state.interruptChainCount + 1,
        interruptEligible: false,
        highlightRemainingMs: 0,
        updatedAtMs: event.nowMs,
      };
    case "pause": {
      if (state.phase === "paused") return state;
      return {
        phase: "paused",
        resumePhase: state.phase,
        targetMemberId: state.targetMemberId,
        interruptChainCount: state.interruptChainCount,
        interruptEligible: state.interruptEligible,
        highlightRemainingMs: getHighlightRemainingMs(state, event.nowMs),
        updatedAtMs: event.nowMs,
      };
    }
    case "resume":
      if (state.phase !== "paused") return state;
      return {
        phase:
          state.resumePhase === "interrupt-window" &&
          state.highlightRemainingMs === 0
            ? "speaking"
            : state.resumePhase,
        targetMemberId: state.targetMemberId,
        interruptChainCount: state.interruptChainCount,
        interruptEligible: state.interruptEligible,
        highlightRemainingMs: state.highlightRemainingMs,
        updatedAtMs: event.nowMs,
      };
    case "tick":
      return tick(state, event.nowMs);
  }
  const exhaustiveEvent: never = event;
  return exhaustiveEvent;
}
