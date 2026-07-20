/** Request mapper emission contract. */
export const REQUEST_MAPPER_CONTRACT = {
  input: "canonical payload + resolved model id",
  output: "provider wire request",
  mustNotLeakBusinessModelNames: true,
} as const;
