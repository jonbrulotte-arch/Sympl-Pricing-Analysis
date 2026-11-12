/**
 * A database that hasn't been synced with the schema yet (`npx prisma db push`) lacks newer tables.
 * Use as `.catch(missingTableAs("Table", fallback))` on reads from such a table: a missing table
 * gives the fallback (and a server log) instead of breaking the whole page. Any other error is rethrown.
 */
export function missingTableAs<T>(table: string, fallback: T) {
  return (err: unknown): T => {
    const text = String((err as { message?: string })?.message ?? err);
    if (text.includes(table) && /42P01|P2021|does not exist/i.test(text)) {
      console.error(`Database table "${table}" is missing. Run \`npx prisma db push\` to create it.`);
      return fallback;
    }
    throw err;
  };
}
