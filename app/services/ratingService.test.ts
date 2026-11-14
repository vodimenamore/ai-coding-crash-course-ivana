import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  setCourseRating,
  getUserCourseRating,
  getCourseRatingSummary,
  getCourseRatingSummaries,
  isValidRating,
} from "./ratingService";

function createStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("isValidRating", () => {
    it("accepts whole numbers from 0 to 5", () => {
      for (const r of [0, 1, 2, 3, 4, 5]) expect(isValidRating(r)).toBe(true);
    });

    it("rejects out-of-range, fractional and non-number values", () => {
      for (const r of [-1, 6, 2.5, NaN, "3", null, undefined]) {
        expect(isValidRating(r)).toBe(false);
      }
    });
  });

  describe("setCourseRating", () => {
    it("stores a rating", () => {
      setCourseRating(base.user.id, base.course.id, 4);
      expect(getUserCourseRating(base.user.id, base.course.id)).toBe(4);
    });

    it("allows a rating of 0", () => {
      setCourseRating(base.user.id, base.course.id, 0);
      expect(getUserCourseRating(base.user.id, base.course.id)).toBe(0);
    });

    it("replaces the user's previous rating instead of adding another", () => {
      setCourseRating(base.user.id, base.course.id, 2);
      setCourseRating(base.user.id, base.course.id, 5);

      expect(getUserCourseRating(base.user.id, base.course.id)).toBe(5);
      expect(getCourseRatingSummary(base.course.id).count).toBe(1);
    });

    it("throws on an invalid rating", () => {
      expect(() => setCourseRating(base.user.id, base.course.id, 6)).toThrow(
        "Rating must be a whole number from 0 to 5"
      );
      expect(() => setCourseRating(base.user.id, base.course.id, 3.5)).toThrow();
    });
  });

  describe("getUserCourseRating", () => {
    it("returns null when the user hasn't rated the course", () => {
      expect(getUserCourseRating(base.user.id, base.course.id)).toBeNull();
    });
  });

  describe("getCourseRatingSummary", () => {
    it("returns null average and 0 count with no ratings", () => {
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: null,
        count: 0,
      });
    });

    it("averages ratings across all users", () => {
      const other = createStudent("other@example.com");
      setCourseRating(base.user.id, base.course.id, 5);
      setCourseRating(other.id, base.course.id, 2);

      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: 3.5,
        count: 2,
      });
    });
  });

  describe("getCourseRatingSummaries", () => {
    it("returns summaries only for courses that have ratings", () => {
      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other",
          slug: "other",
          description: "Other course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      setCourseRating(base.user.id, base.course.id, 4);

      const summaries = getCourseRatingSummaries([
        base.course.id,
        otherCourse.id,
      ]);
      expect(summaries.get(base.course.id)).toEqual({ average: 4, count: 1 });
      expect(summaries.has(otherCourse.id)).toBe(false);
    });

    it("returns an empty map for no course ids", () => {
      expect(getCourseRatingSummaries([]).size).toBe(0);
    });
  });
});
