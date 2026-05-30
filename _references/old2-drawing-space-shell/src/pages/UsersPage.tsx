import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUiText, type UiTextKey } from "@/features/settings/uiText";

const roles = [
  { nameKey: "admin", descKey: "adminDesc", icon: "icon-[mdi--shield-account-outline]" },
  { nameKey: "editorRole", descKey: "editorRoleDesc", icon: "icon-[mdi--pencil-outline]" },
  { nameKey: "guest", descKey: "guestDesc", icon: "icon-[mdi--account-outline]" },
] satisfies Array<{
  nameKey: UiTextKey;
  descKey: UiTextKey;
  icon: string;
}>;

export function UsersPage() {
  const t = useUiText();

  return (
    <div className="min-h-screen px-2xl py-xl">
      <header className="mb-xl flex items-center justify-between gap-xl">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight">{t("users")}</h1>
          <p className="mt-sm text-sm text-muted">
            {t("manageAccounts")}
          </p>
        </div>
        <Button variant="secondary">
          <span className="icon-[mdi--account-plus-outline] text-base" />
          {t("inviteUser")}
        </Button>
      </header>

      <section className="grid grid-cols-1 gap-lg md:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.nameKey}>
            <CardHeader>
              <div className="mb-sm flex h-10 w-10 items-center justify-center rounded-lg bg-surface-muted">
                <span className={`${role.icon} text-xl text-muted`} />
              </div>
              <CardTitle>{t(role.nameKey)}</CardTitle>
              <CardDescription>{t(role.descKey)}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </div>
  );
}
