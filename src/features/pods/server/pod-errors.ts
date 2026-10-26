export class PodNotFoundError extends Error {
  constructor(readonly podId: string) {
    super(`Pod ${podId} was not found`);
    this.name = "PodNotFoundError";
  }
}

export class PodLimitReachedError extends Error {
  constructor(readonly limit: number) {
    super(`You can have at most ${limit} pods`);
    this.name = "PodLimitReachedError";
  }
}
