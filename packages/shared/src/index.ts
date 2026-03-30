import { z } from "zod";

/**
 * Available photo filter presets with their CSS filter configurations.
 * Each preset provides a distinct visual style for uploaded photos.
 */
export const FILTER_PRESETS = [
  {
    id: "original",
    label: "Original",
    cssFilter: "none",
    description: "Neutral and clean."
  },
  {
    id: "mono",
    label: "B&W",
    cssFilter: "grayscale(1) contrast(1.08) brightness(1.02)",
    description: "Classic black-and-white."
  },
  {
    id: "vintage-warm",
    label: "Vintage",
    cssFilter: "sepia(0.45) saturate(1.15) contrast(0.98) brightness(1.03)",
    description: "Warm nostalgic tone."
  },
  {
    id: "disposable-flash",
    label: "Disposable",
    cssFilter: "saturate(1.18) contrast(1.12) brightness(1.06) hue-rotate(-6deg)",
    description: "Flashy disposable-camera feel."
  },
  {
    id: "faded-film",
    label: "Faded",
    cssFilter: "contrast(0.9) saturate(0.88) brightness(1.1)",
    description: "Soft, washed film look."
  }
] as const;

export type FilterPreset = (typeof FILTER_PRESETS)[number];
export type FilterId = FilterPreset["id"];

/** Schema for creating a new event */
export const createEventSchema = z.object({
  name: z.string().trim().min(2).max(120),
  date: z.string().datetime(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  turnstileToken: z.string().trim().max(2048).optional().or(z.literal(""))
});

/** Schema for creating a guest session to join an event */
export const createGuestSessionSchema = z.object({
  nickname: z.string().trim().max(40).optional().or(z.literal("")),
  turnstileToken: z.string().trim().max(2048).optional().or(z.literal(""))
});

/** Schema for toggling event upload permissions */
export const toggleUploadsSchema = z.object({
  enabled: z.boolean()
});

/** Schema representing a photo record in the album */
export const photoSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  uploaderNickname: z.string().nullable(),
  filterName: z.string(),
  createdAt: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  bytes: z.number(),
  imageUrl: z.string()
});

/** Schema for public event data visible to guests */
export const eventPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  description: z.string().nullable(),
  uploadsEnabled: z.boolean(),
  endedAt: z.string().nullable(),
  expiresAt: z.string()
});

/** Schema for admin event data with management URLs */
export const eventAdminSchema = eventPublicSchema.extend({
  guestInviteUrl: z.string(),
  adminUrl: z.string()
});

export const createEventResponseSchema = eventAdminSchema;

export const publicConfigSchema = z.object({
  turnstileSiteKey: z.string().nullable()
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateGuestSessionInput = z.infer<typeof createGuestSessionSchema>;
export type ToggleUploadsInput = z.infer<typeof toggleUploadsSchema>;
export type PhotoRecord = z.infer<typeof photoSchema>;
export type EventPublic = z.infer<typeof eventPublicSchema>;
export type EventAdmin = z.infer<typeof eventAdminSchema>;
export type CreateEventResponse = z.infer<typeof createEventResponseSchema>;
export type PublicConfig = z.infer<typeof publicConfigSchema>;
