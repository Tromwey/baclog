/** Thrown when there is no valid session. */
export class UnauthorizedError extends Error {
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Thrown when a row doesn't exist OR isn't owned by the session user.
 * Deliberately indistinguishable: never confirm another user's resource
 * exists.
 */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
