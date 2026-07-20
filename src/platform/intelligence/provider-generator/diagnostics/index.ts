export function summarizeGeneration(fileCount: number, providerId: string): string {
  return `Generated ${fileCount} artifacts for provider=${providerId}`;
}
