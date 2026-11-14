import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

// ─── Rating Service ───
// Students rate courses on a 0–5 star scale. One rating per user per course;
// rating again replaces the previous value.

export const MIN_RATING = 0;
export const MAX_RATING = 5;

export type RatingSummary = { average: number | null; count: number };

export function isValidRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_RATING &&
    value <= MAX_RATING
  );
}

export function setCourseRating(
  userId: number,
  courseId: number,
  rating: number
) {
  if (!isValidRating(rating)) {
    throw new Error(
      `Rating must be a whole number from ${MIN_RATING} to ${MAX_RATING}`
    );
  }

  const now = new Date().toISOString();
  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating, updatedAt: now },
    })
    .returning()
    .get();
}

export function getUserCourseRating(userId: number, courseId: number) {
  const row = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(
      and(eq(courseRatings.userId, userId), eq(courseRatings.courseId, courseId))
    )
    .get();
  return row?.rating ?? null;
}

export function getCourseRatingSummary(courseId: number): RatingSummary {
  return (
    getCourseRatingSummaries([courseId]).get(courseId) ?? {
      average: null,
      count: 0,
    }
  );
}

export function getCourseRatingSummaries(
  courseIds: number[]
): Map<number, RatingSummary> {
  const summaries = new Map<number, RatingSummary>();
  if (courseIds.length === 0) return summaries;

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const row of rows) {
    summaries.set(row.courseId, {
      average: Number(row.average),
      count: Number(row.count),
    });
  }
  return summaries;
}
