import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { deleteAccount } from "./accounts";
import { photosRouter } from "./photosRouter";
import { submissionsRouter } from "./submissionsRouter";
import { landmarksRouter } from "./landmarksRouter";
import { proposalsRouter } from "./proposalsRouter";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    // A reader closing their account (App Store guideline 5.1.1(v)).
    deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
      await deleteAccount(ctx.user);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  photos: photosRouter,
  submissions: submissionsRouter,
  landmarks: landmarksRouter,
  proposals: proposalsRouter,
});

export type AppRouter = typeof appRouter;
