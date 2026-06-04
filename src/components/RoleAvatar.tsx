import type { Role } from "@/lib/roles";

/**
 * Circular avatar with the role's gradient + emoji. Two sizes: "sm" for the
 * sidebar, "lg" for the chat header. The inline style sets the per-role
 * gradient CSS vars used by .aurora, .role-card, and the markdown link color.
 *
 * "lg" renders at 56x56 so the role's emoji stays readable in the empty
 * state and the chat header. The emoji size scales with the avatar.
 */
export function RoleAvatar({
  role,
  size = "sm",
}: {
  role: Role;
  size?: "sm" | "lg";
}) {
  const dim =
    size === "lg"
      ? "h-14 w-14 text-2xl"
      : "h-9 w-9 text-base";
  // Fallback monogram: take the first 2 letters of the Latin/English name
  // so the avatar stays readable even when the emoji renders ambiguously
  // at small sizes.
  const monogram = role.english
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={`${dim} rounded-full grid place-items-center shrink-0 shadow-lg shadow-black/40 ring-1 ring-white/10 bg-gradient-to-br ${role.accent.avatar} relative overflow-hidden`}
      style={
        {
          ["--role-from" as never]: role.accent.from,
          ["--role-to" as never]: role.accent.to,
        } as React.CSSProperties
      }
      aria-hidden
    >
      <span className="drop-shadow-sm">{role.emoji}</span>
      {size === "lg" && (
        <span className="absolute bottom-0 right-0 translate-y-1/3 translate-x-0 px-1.5 py-0.5 rounded-md bg-black/60 text-[9px] font-mono font-bold tracking-wider text-white/90 border border-white/20">
          {monogram}
        </span>
      )}
    </div>
  );
}
