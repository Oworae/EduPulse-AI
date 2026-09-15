// Static schema only; academic context belongs in the prompt, never the schema.
export const insightSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "observations", "recommended_actions"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    observations: { type: "array", items: { type: "string" } },
    recommended_actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "priority", "reason"],
        properties: {
          title: { type: "string" },
          priority: { type: "integer", enum: [1, 2, 3] },
          reason: { type: "string" },
        },
      },
    },
  },
};
