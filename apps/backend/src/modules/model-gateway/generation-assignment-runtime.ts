export async function publishReservedGenerationJob<TAssignment extends { assignmentKey: string }>(input: {
  reserve(): Promise<TAssignment>;
  publish(assignment: TAssignment): Promise<void>;
  markPublished(assignment: TAssignment): Promise<void>;
  onMarkPublishedError?(error: unknown, assignment: TAssignment): void;
}): Promise<TAssignment> {
  const assignment = await input.reserve();
  await input.publish(assignment);
  try {
    await input.markPublished(assignment);
  } catch (error) {
    input.onMarkPublishedError?.(error, assignment);
  }
  return assignment;
}
