/** Per-project options stored in Project.settings (JSON). */

/** The channels a project analyzes, or null for all of the customer's channels (including ones added later). */
export function projectChannelIds(settings: unknown): string[] | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const ids = (settings as Record<string, unknown>).channelIds;
  if (!Array.isArray(ids)) return null;
  const valid = ids.filter((id): id is string => typeof id === "string");
  return valid.length > 0 ? valid : null;
}

/**
 * The customer's channels a project uses, in the customer's order. Falls back to all channels when the project
 * has no selection, or when every selected channel has since been deleted.
 */
export function projectChannels<C extends { id: string }>(channels: C[], settings: unknown): C[] {
  const ids = projectChannelIds(settings);
  if (!ids) return channels;
  const enabled = channels.filter((c) => ids.includes(c.id));
  return enabled.length > 0 ? enabled : channels;
}
