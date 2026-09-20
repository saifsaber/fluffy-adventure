import { z } from 'zod';
import { APPROACHES, LINES, PRESSES, type Setup } from '@dakka/fixture';

/**
 * What a client is allowed to send.
 *
 * **Choices cross this line. Capabilities never do.** A `MatchInput` carries squads, attributes and
 * fitness; accepting one over the wire would let a client field an eleven it invented and call the
 * result server-authoritative. So the body names clubs by slug and states which way the three dials
 * point, and the server builds the fixture from its own copy of the content.
 *
 * `.strict()` on every object is the load-bearing part, and it is not tidiness: without it a body
 * carrying `squad` or `reputation` is accepted and silently ignored, which reads to whoever wrote
 * the client as though the field did something. Refusing the request says plainly that it did not.
 */

const call = z
  .object({
    kind: z.enum(['mentality', 'line_height', 'pressing']),
    minute: z.number().int().min(1).max(89),
    to: z.string().min(1),
  })
  .strict();

export const matchRequestSchema = z
  .object({
    league: z.string().min(1),
    yourSlug: z.string().min(1),
    opponentSlug: z.string().min(1),
    venue: z.enum(['home', 'away']),
    approach: z.enum(APPROACHES as [string, ...string[]]),
    line: z.enum(LINES as [string, ...string[]]),
    press: z.enum(PRESSES as [string, ...string[]]),
    call: call.nullable(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.yourSlug === body.opponentSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['opponentSlug'],
        message: 'a club cannot play itself',
      });
    }
    // A dial's value has to belong to the dial it was set on. `high` is a legal pressing intensity
    // and a legal line height and means different things on each, so the pairing is checked rather
    // than the value alone.
    if (body.call !== null) {
      const allowed: Record<string, readonly string[]> = {
        mentality: APPROACHES,
        line_height: LINES,
        pressing: PRESSES,
      };
      const values = allowed[body.call.kind] ?? [];
      if (!values.includes(body.call.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['call', 'to'],
          message: `not a setting of ${body.call.kind}: expected one of ${values.join(', ')}`,
        });
      }
    }
  });

export type MatchRequest = z.infer<typeof matchRequestSchema>;

/** The choices, as the shared fixture builder wants them. Nothing is added on the way through. */
export function toSetup(request: MatchRequest): Setup {
  return {
    yourSlug: request.yourSlug,
    opponentSlug: request.opponentSlug,
    venue: request.venue,
    approach: request.approach as Setup['approach'],
    line: request.line as Setup['line'],
    press: request.press as Setup['press'],
    call: request.call === null ? null : ({ ...request.call } as Setup['call']),
  };
}
