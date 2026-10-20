import { getProgress } from "./state.js";
import { reduceCampaign } from "./campaigns-state.js";

// Callers supply the learning state already validated by its event replay.
export function getJourneyProgress(learningState, lessons) {
  const total = lessons.length;
  const completed = learningState
    ? lessons.filter(
        (lesson) => getProgress(learningState, lesson.id).completed,
      ).length
    : 0;
  return {
    completed,
    total,
    practiceUnlocked: total > 0 && completed === total,
  };
}

// Keep historical campaign replay independent; only new play requires graduation.
export function reducePractice(
  state,
  event,
  campaigns,
  learningState,
  lessons,
) {
  return getJourneyProgress(learningState, lessons).practiceUnlocked
    ? reduceCampaign(state, event, campaigns)
    : state;
}
