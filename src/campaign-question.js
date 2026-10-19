// Original scenario exercises. Answers are visible source, appropriate for self-directed learning.
export const single = (id, prompt, options, answer, explanation) => ({
  id,
  type: "single",
  prompt,
  options,
  answer,
  explanation,
});
export const multi = (id, prompt, options, answer, explanation) => ({
  id,
  type: "multi",
  prompt,
  options,
  answer,
  explanation,
});
export const numeric = (id, prompt, answer, tolerance, unit, explanation) => ({
  id,
  type: "number",
  prompt,
  answer,
  tolerance,
  unit,
  explanation,
});
export const order = (id, prompt, options, answer, explanation) => ({
  id,
  type: "order",
  prompt,
  options,
  answer,
  explanation,
});
